/**
 * MoveTargeting.js — A quién alcanza un movimiento según su alcance (`range`
 * en moves.json):
 *
 * - `front`: el rival de delante (si no hay, uno adyacente; lo resuelve quien llama).
 * - `line`: el primer rival en línea recta hacia donde mira el usuario, hasta
 *   LINE_RANGE casillas. Los muros lo paran; los aliados no.
 * - `around`: todos los rivales de las 8 casillas de alrededor.
 * - `room`: todos los rivales de la sala. En un pasillo, los que estén a
 *   CORRIDOR_REACH casillas o menos.
 * - `self`: el propio usuario.
 * - `team`: el usuario y sus aliados de la sala (o cercanos, en un pasillo).
 *
 * Rivales: el equipo contra los salvajes. Los PNJ (Kecleon, amigables,
 * clientes de misiones) no son rivales de nadie.
 */

export const LINE_RANGE = 10;
export const CORRIDOR_REACH = 2;

/** Componentes de PNJ que nunca participan en un combate. */
const NPC_COMPONENTS = ['npcMerchant', 'npcFriendly', 'missionClient', 'npcTown'];

/**
 * @param {{ range?: string } | null | undefined} move
 * @returns {'front' | 'line' | 'around' | 'room' | 'self' | 'team'}
 */
export function moveRange(move) {
  return /** @type {any} */ (move?.range) ?? 'front';
}

/**
 * Pokémon vivos que pueden pelear.
 * @param {Object} em - EntityManager
 * @returns {number[]}
 */
function combatants(em) {
  return em.getEntitiesWithComponents('pokemonInfo', 'fighter', 'position').filter((id) => {
    if (NPC_COMPONENTS.some((c) => em.hasComponent(id, c))) return false;
    return em.getComponent(id, 'fighter').hp > 0;
  });
}

/**
 * @param {Object} em
 * @param {number} a
 * @param {number} b
 * @returns {boolean} Si están en bandos contrarios
 */
export function areFoes(em, a, b) {
  if (a === b) return false;
  return em.hasComponent(a, 'partyMember') !== em.hasComponent(b, 'partyMember');
}

/**
 * Sala que contiene la casilla, o null en un pasillo.
 * @param {{ rooms?: { x: number, y: number, w: number, h: number }[] }} tileMap
 * @param {number} x
 * @param {number} y
 */
export function roomAt(tileMap, x, y) {
  return (tileMap.rooms || []).find((r) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h) ?? null;
}

/**
 * Si `b` está en la zona de `a`: su misma sala (incluido el umbral), o cerca si
 * `a` está en un pasillo.
 */
function sameArea(tileMap, a, b) {
  const room = roomAt(tileMap, a.x, a.y);
  if (room) {
    return b.x >= room.x - 1 && b.x <= room.x + room.w && b.y >= room.y - 1 && b.y <= room.y + room.h;
  }
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y)) <= CORRIDOR_REACH;
}

/**
 * Hacia dónde mira una entidad (8 direcciones).
 * @param {{ facing?: string, facingDx?: number, facingDy?: number }} pos
 * @returns {[number, number]}
 */
export function facingVector(pos) {
  if (pos.facingDx || pos.facingDy) return [Math.sign(pos.facingDx || 0), Math.sign(pos.facingDy || 0)];
  return { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[pos.facing] ?? [0, 1];
}

/**
 * Primer rival en línea recta desde (x, y) en la dirección (dx, dy).
 * @returns {number|null}
 */
function firstFoeInLine(em, tileMap, userId, x, y, dx, dy, alive) {
  for (let step = 1; step <= LINE_RANGE; step++) {
    const tx = x + dx * step;
    const ty = y + dy * step;
    if (!tileMap.isInBounds(tx, ty) || !tileMap.isTransparent(tx, ty)) return null;
    const hit = alive.find((id) => {
      const p = em.getComponent(id, 'position');
      return p.x === tx && p.y === ty;
    });
    if (hit != null && areFoes(em, userId, hit)) return hit;
  }
  return null;
}

/**
 * Objetivos de un movimiento (sin contar el alcance `front`, que decide quien llama).
 * @param {{ entityManager: Object, tileMap: Object }} game
 * @param {number} userId
 * @param {{ range?: string }} move
 * @returns {number[]} Ids, empezando por el más cercano
 */
export function getMoveTargets(game, userId, move) {
  const em = game.entityManager;
  const map = game.tileMap;
  const pos = em.getComponent(userId, 'position');
  if (!pos || !map) return [];
  const alive = combatants(em);
  const distance = (id) => {
    const p = em.getComponent(id, 'position');
    return Math.max(Math.abs(p.x - pos.x), Math.abs(p.y - pos.y));
  };
  const byDistance = (ids) => ids.sort((a, b) => distance(a) - distance(b) || a - b);

  switch (moveRange(move)) {
    case 'self':
      return [userId];
    case 'team':
      return [userId, ...byDistance(alive.filter((id) => id !== userId && !areFoes(em, userId, id) && sameArea(map, pos, em.getComponent(id, 'position'))))];
    case 'around':
      return byDistance(alive.filter((id) => areFoes(em, userId, id) && distance(id) === 1));
    case 'room':
      return byDistance(alive.filter((id) => areFoes(em, userId, id) && sameArea(map, pos, em.getComponent(id, 'position'))));
    case 'line': {
      const [dx, dy] = facingVector(pos);
      const hit = firstFoeInLine(em, map, userId, pos.x, pos.y, dx, dy, alive);
      return hit != null ? [hit] : [];
    }
    default:
      return [];
  }
}

/**
 * Para la IA: si el objetivo está a tiro de un movimiento en línea (alineado,
 * a LINE_RANGE o menos y sin muros), la dirección en la que hay que mirar.
 * @returns {[number, number] | null}
 */
export function lineDirectionTo(game, userId, targetId) {
  const em = game.entityManager;
  const from = em.getComponent(userId, 'position');
  const to = em.getComponent(targetId, 'position');
  if (!from || !to) return null;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const aligned = dx === 0 || dy === 0 || Math.abs(dx) === Math.abs(dy);
  if (!aligned || Math.max(Math.abs(dx), Math.abs(dy)) > LINE_RANGE) return null;
  const dir = [Math.sign(dx), Math.sign(dy)];
  const hit = firstFoeInLine(em, game.tileMap, userId, from.x, from.y, dir[0], dir[1], combatants(em));
  return hit === targetId ? dir : null;
}

/**
 * Para la IA: si el objetivo está en la zona de un movimiento de sala.
 */
export function inRoomReach(game, userId, targetId) {
  const em = game.entityManager;
  return sameArea(game.tileMap, em.getComponent(userId, 'position'), em.getComponent(targetId, 'position'));
}
