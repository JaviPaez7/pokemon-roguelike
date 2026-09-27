/**
 * MissionSystem.js — Las misiones dentro de la mazmorra.
 *
 * Al generar un piso aparecen los clientes (rescate y entrega), los objetos
 * perdidos (buscar objeto) o los forajidos de las misiones aceptadas para ese
 * piso. Chocar con un cliente es hablar con él; recoger el objeto perdido o
 * derrotar al forajido cumple la misión. Al cumplir una, se pregunta si volver
 * al pueblo a cobrarla.
 *
 * Escolta: el cliente se une al entrar en la mazmorra como invitado
 * (`partyMember` + `missionGuest`). Sigue al equipo con la IA aliada y ocupa
 * un hueco mientras va con él, pero no lidera, no gana experiencia ni se
 * guarda como miembro (va aparte en `run.guests`) y nunca pasa a la base. Si
 * llega vivo a su piso, se despide y la misión se cumple; si cae, se vuelve a
 * casa y la misión sigue aceptada para otra expedición.
 */

import { MAX_PARTY_SIZE } from '../constants.js';
import {
  missionsHere,
  getAccepted,
  markMissionDone,
  escortsToJoin,
  escortArrivals,
  escortGuestLevel,
  outlawLevel,
  missionGlobalFloor,
  MISSION_RULES,
} from '../core/Missions.js';
import { spawnFromSnapshot } from '../core/PokemonSnapshot.js';

/**
 * Coloca los objetivos de misión del piso actual lejos de la entrada.
 * @param {import('../core/Game.js').Game} game
 */
export function spawnMissionTargets(game) {
  if (!game.profile || !game.dungeonId) return;
  // Las misiones de historia las resuelve su escena (la carta la recibe el jefe)
  const missions = missionsHere(game.profile, game.dungeonId, game.getCurrentFloor()).filter((m) => !m.story);
  if (missions.length === 0) return;

  const spots = candidateSpots(game);
  for (const mission of missions) {
    // La escolta no pone a nadie en el piso: se cumple si el invitado ha
    // llegado, cuando no haya diálogos del cambio de piso (Game.update)
    if (mission.type === 'escort') {
      game._pendingEscortCheck = true;
      continue;
    }
    const spot = spots.shift();
    if (!spot) break;
    if (mission.type === 'find_item') {
      const meta = game.itemsData.find((i) => i.id === mission.itemId);
      const id = game.entityManager.createItemEntity(mission.itemId, 1, spot.x, spot.y, meta?.spriteUrl ?? '');
      game.entityManager.setComponent(id, 'missionItem', { missionId: mission.id });
      game.eventBus.emit('message', { text: `El ${meta?.name ?? mission.itemId} de ${mission.clientName} está en este piso.`, color: '#ffd166' });
    } else if (mission.type === 'outlaw') {
      spawnOutlaw(game, mission, spot);
      game.eventBus.emit('message', { text: `¡Se busca! ${mission.clientName}, el forajido de vuestra misión, anda por este piso.`, color: '#ff8866' });
    } else {
      spawnClient(game, mission, spot);
      game.eventBus.emit('message', { text: `¡${mission.clientName}, de vuestra misión, está en este piso!`, color: '#ffd166' });
    }
  }
}

/**
 * Casillas libres de suelo, de la más lejana a la entrada a la más cercana.
 * @param {import('../core/Game.js').Game} game
 * @returns {{ x: number, y: number }[]}
 */
function candidateSpots(game) {
  const em = game.entityManager;
  const start = game._playerStart ?? { x: 0, y: 0 };
  const seen = new Set();
  const points = [...(game._spawnPoints ?? []), ...(game._itemPoints ?? [])].filter((p) => {
    const key = `${p.x},${p.y}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return (
      game.tileMap.isWalkable(p.x, p.y) &&
      !game.tileMap.isStairs(p.x, p.y) &&
      em.getEntityAt(p.x, p.y, true) === null &&
      em.getTrapAt(p.x, p.y) === null
    );
  });
  const distance = (p) => Math.abs(p.x - start.x) + Math.abs(p.y - start.y);
  return points.sort((a, b) => distance(b) - distance(a) || a.y - b.y || a.x - b.x);
}

/**
 * Cliente de una misión: no pelea, no se mueve y los enemigos no lo atacan.
 * @param {import('../core/Game.js').Game} game
 * @param {import('../core/Missions.js').Mission} mission
 * @param {{ x: number, y: number }} spot
 */
function spawnClient(game, mission, spot) {
  const em = game.entityManager;
  const species = game.pokemonData.find((p) => p.id === mission.clientSpeciesId);
  const id = em.createEntity();
  em.setComponent(id, 'position', { x: spot.x, y: spot.y, facing: 'down', prevX: spot.x, prevY: spot.y, moveStartTime: 0 });
  em.setComponent(id, 'pokemonInfo', {
    speciesId: mission.clientSpeciesId,
    name: mission.clientName,
    level: 1,
    types: species?.types ?? ['normal'],
  });
  em.setComponent(id, 'sprite', { url: species?.sprite ?? '', image: null, loaded: false });
  em.setComponent(id, 'missionClient', { missionId: mission.id });
}

/**
 * El líder habla con un cliente de misión.
 * @param {import('../core/Game.js').Game} game
 * @param {number} clientId
 */
export function talkToMissionClient(game, clientId) {
  const em = game.entityManager;
  const { missionId } = em.getComponent(clientId, 'missionClient');
  const mission = getAccepted(game.profile, missionId);
  const ui = game.uiManager;
  if (!mission || mission.status !== 'accepted') {
    ui.showDialog('¡Gracias otra vez!');
    return;
  }
  const itemName = (id) => game.itemsData.find((i) => i.id === id)?.name ?? id;
  /** @param {string} emotion */
  const client = (emotion) => ({ speaker: mission.clientName, portrait: { speciesId: mission.clientSpeciesId, emotion } });

  if (mission.type === 'deliver') {
    const slot = game.inventory.find((s) => s.itemId === mission.itemId);
    if (!slot) {
      ui.showDialog(`¿Me traéis ${itemName(mission.itemId)}? Lo necesito de verdad…`, null, false, client('Worried'));
      return;
    }
    slot.quantity -= 1;
    if (slot.quantity === 0) game.inventory.splice(game.inventory.indexOf(slot), 1);
    markMissionDone(game.profile, mission.id);
    em.destroyEntity(clientId);
    ui.showDialog(
      `¡Mi ${itemName(mission.itemId)}! Muchísimas gracias.\n\nOs espero en el pueblo con la recompensa.`,
      () => afterMissionDone(game),
      false,
      client('Joyous'),
    );
    return;
  }

  // Rescate: el cliente vuelve al pueblo con su insignia de rescate
  markMissionDone(game.profile, mission.id);
  em.destroyEntity(clientId);
  ui.showDialog(
    `¡Habéis venido a por mí! Gracias, de verdad.\n\nVuelvo al pueblo; allí os daré la recompensa.`,
    () => afterMissionDone(game),
    false,
    client('Teary-Eyed'),
  );
}

/**
 * Se ha recogido el objeto perdido de una misión.
 * @param {import('../core/Game.js').Game} game
 * @param {string} missionId
 */
export function onMissionItemFound(game, missionId) {
  const mission = getAccepted(game.profile, missionId);
  if (!mission || mission.status !== 'accepted') return;
  markMissionDone(game.profile, mission.id);
  const name = game.itemsData.find((i) => i.id === mission.itemId)?.name ?? mission.itemId;
  game.uiManager.showDialog(`¡Es el ${name} que perdió ${mission.clientName}!\n\nLlevádselo al pueblo para cobrar la misión.`, () =>
    afterMissionDone(game),
  );
}

/** Tras cumplir una misión, ofrecer volver al pueblo. */
function afterMissionDone(game) {
  game.saveGameData();
  game.uiManager.openMissionReturnPrompt();
}

// ─── Forajido ──────────────────────────────────────────────────────────────

/**
 * Forajido de una misión: un salvaje de la especie buscada, unos niveles por
 * encima de los de su piso y con más PS. Pelea y huye como los demás salvajes
 * (se le marca en el mapa con una diana) y no se ofrece a unirse al caer.
 * @param {import('../core/Game.js').Game} game
 * @param {import('../core/Missions.js').Mission} mission
 * @param {{ x: number, y: number }} spot
 * @returns {number} Id de la entidad
 */
function spawnOutlaw(game, mission, spot) {
  const em = game.entityManager;
  const rules = MISSION_RULES.outlaw;
  const id = em.createPokemon(mission.clientSpeciesId, outlawLevel(missionGlobalFloor(mission)), spot.x, spot.y, true);
  const fighter = em.getComponent(id, 'fighter');
  fighter.maxHp = Math.floor(fighter.maxHp * rules.hpMultiplier);
  fighter.hp = fighter.maxHp;
  em.setComponent(id, 'outlaw', { missionId: mission.id, fleeBelow: rules.fleeBelow, fled: false });
  game.turnManager.addEntity(id, fighter.speed || 50, false);
  game.pokedexSeen?.add(mission.clientSpeciesId);
  return id;
}

/**
 * Ha caído un forajido: la misión se cumple. Lo llama GameEvents antes de
 * quitar la entidad.
 * @param {import('../core/Game.js').Game} game
 * @param {number} entityId
 * @returns {boolean} Si era el forajido de una misión pendiente
 */
export function onOutlawDefeated(game, entityId) {
  const outlaw = game.entityManager.getComponent(entityId, 'outlaw');
  const mission = outlaw && game.profile ? getAccepted(game.profile, outlaw.missionId) : null;
  if (!mission || mission.status !== 'accepted') return false;
  markMissionDone(game.profile, mission.id);
  game.uiManager.showDialog(
    '¡Vale, vale, me rindo! Lo devuelvo todo y pido perdón en el tablón. Palabra.',
    null,
    false,
    { speaker: mission.clientName, portrait: { speciesId: mission.clientSpeciesId, emotion: 'Pain' } },
  );
  game.uiManager.showDialog(
    `${mission.clientName} queda en manos de Pidgey, que se encarga del papeleo.\n\nLa recompensa os espera en el pueblo.`,
    () => afterMissionDone(game),
  );
  return true;
}

// ─── Escolta ───────────────────────────────────────────────────────────────

/**
 * Al entrar en la mazmorra, los clientes de escolta que caben se unen al
 * equipo como invitados. Hay que llamarlo con el equipo ya creado y antes de
 * bajar al primer piso (el cambio de piso los coloca y les da turno).
 * @param {import('../core/Game.js').Game} game
 * @returns {{ joining: import('../core/Missions.js').Mission[], waiting: import('../core/Missions.js').Mission[] }}
 */
export function joinEscortGuests(game) {
  const dungeon = game.dungeon;
  if (!game.profile || !dungeon) return { joining: [], waiting: [] };
  const em = game.entityManager;
  const partySize = em.getEntitiesWithComponents('partyMember').length;
  const result = escortsToJoin(game.profile, dungeon, MAX_PARTY_SIZE - partySize);
  result.joining.forEach((mission, i) => {
    const id = em.createPokemon(mission.clientSpeciesId, escortGuestLevel(missionGlobalFloor(mission)), 0, 0, false);
    em.getComponent(id, 'pokemonInfo').name = mission.clientName;
    em.setComponent(id, 'partyMember', { slot: partySize + i, isLeader: false, tactic: 'follow', uid: null });
    em.setComponent(id, 'aiControlled', { behavior: 'follower', detectRange: 5, alertedTo: null });
    em.setComponent(id, 'missionGuest', { missionId: mission.id });
    game.pokedexSeen?.add(mission.clientSpeciesId);
  });
  return result;
}

/**
 * Lo que dicen los clientes de escolta al empezar la expedición (se encola
 * detrás de la presentación de la mazmorra). De los que no caben ya ha avisado
 * el menú de la salida (`TownMenus`), antes de salir: aquí basta una línea en
 * el registro.
 * @param {import('../core/Game.js').Game} game
 * @param {{ joining: import('../core/Missions.js').Mission[], waiting: import('../core/Missions.js').Mission[] }} escorts
 */
export function greetEscortGuests(game, { joining, waiting }) {
  const ui = game.uiManager;
  for (const m of joining) {
    ui.showDialog(`¡Por fin! Hasta el piso ${m.floor}, ¿vale? Yo voy detrás, que delante da miedo.`, null, false, {
      speaker: m.clientName,
      portrait: { speciesId: m.clientSpeciesId, emotion: 'Happy' },
    });
    game.eventBus.emit('message', { text: `${m.clientName} os acompaña como invitado hasta el piso ${m.floor}.`, color: '#ffd166' });
  }
  for (const m of waiting) {
    game.eventBus.emit('message', { text: `${m.clientName} se queda en la entrada: no cabe en el equipo.`, color: '#ffd166' });
  }
}

/**
 * Al cargar una partida a mitad de expedición, los invitados vuelven con el
 * equipo (si su misión sigue pendiente).
 * @param {import('../core/Game.js').Game} game
 * @param {Array<Object & { missionId: string }>} [guests] - `run.guests` de la partida guardada
 */
export function restoreEscortGuests(game, guests = []) {
  const em = game.entityManager;
  for (const guest of guests) {
    const mission = game.profile ? getAccepted(game.profile, guest.missionId) : null;
    if (!mission || mission.status !== 'accepted') continue;
    const slot = em.getEntitiesWithComponents('partyMember').length;
    const id = spawnFromSnapshot(game, { ...guest, uid: null }, { slot, isLeader: false });
    em.setComponent(id, 'missionGuest', { missionId: guest.missionId });
  }
}

/**
 * Ids de misión de los invitados que siguen en pie.
 * @param {import('../core/Game.js').Game} game
 * @returns {string[]}
 */
function livingGuestMissions(game) {
  const em = game.entityManager;
  return em
    .getEntitiesWithComponents('missionGuest', 'fighter')
    .filter((id) => em.getComponent(id, 'fighter').hp > 0)
    .map((id) => em.getComponent(id, 'missionGuest').missionId);
}

/**
 * El invitado de una misión, si sigue con el equipo.
 * @param {import('../core/Game.js').Game} game
 * @param {string} missionId
 * @returns {number | null}
 */
function guestFor(game, missionId) {
  const em = game.entityManager;
  return em.getEntitiesWithComponents('missionGuest').find((id) => em.getComponent(id, 'missionGuest').missionId === missionId) ?? null;
}

/**
 * Quita al invitado del piso y del sistema de turnos.
 * @param {import('../core/Game.js').Game} game
 * @param {number} id
 */
function removeGuest(game, id) {
  game.turnManager.removeEntity(id);
  game.entityManager.destroyEntity(id);
  game.needsRender = true;
}

/**
 * Si el equipo acaba de llegar al piso de una escolta con el cliente en pie,
 * el cliente se despide y la misión se cumple. Lo llama Game.update cuando no
 * hay diálogos abiertos (tras los del cambio de piso o los de cargar partida).
 * @param {import('../core/Game.js').Game} game
 * @returns {boolean} Si ha mostrado algo
 */
export function checkEscortArrivals(game) {
  game._pendingEscortCheck = false;
  if (!game.profile || !game.dungeonId) return false;
  const arrived = escortArrivals(game.profile, game.dungeonId, game.getCurrentFloor(), livingGuestMissions(game));
  arrived.forEach((mission, i) => {
    markMissionDone(game.profile, mission.id);
    const id = guestFor(game, mission.id);
    if (id != null) removeGuest(game, id);
    game.uiManager.showDialog(
      '¡Hemos llegado! Qué bien se viaja con escolta.\n\nNos vemos en el pueblo: allí os doy la recompensa.',
      i === arrived.length - 1 ? () => afterMissionDone(game) : null,
      false,
      { speaker: mission.clientName, portrait: { speciesId: mission.clientSpeciesId, emotion: 'Joyous' } },
    );
  });
  return arrived.length > 0;
}

/**
 * Ha caído el cliente de una escolta (sin Semilla Revivir que lo levante): se
 * vuelve a casa por su cuenta y la misión sigue aceptada para otro intento,
 * igual que las cumplidas vuelven a quedar pendientes si cae el equipo.
 * @param {import('../core/Game.js').Game} game
 * @param {number} entityId
 * @returns {boolean} Si era un invitado
 */
export function onEscortGuestFainted(game, entityId) {
  const guest = game.entityManager.getComponent(entityId, 'missionGuest');
  if (!guest) return false;
  const mission = game.profile ? getAccepted(game.profile, guest.missionId) : null;
  const name = mission?.clientName ?? game.entityManager.getComponent(entityId, 'pokemonInfo')?.name ?? 'El cliente';
  removeGuest(game, entityId);
  game.eventBus.emit('message', { text: `¡${name} se ha debilitado! La escolta ha fallado.`, color: '#ff6666' });
  game.uiManager.showDialog(
    `¡${name} se ha debilitado!\n\nLa escolta ha fallado: ${name} vuelve al pueblo por su cuenta. ` +
      'La misión sigue en la lista para otro intento.',
  );
  game.saveGameData();
  return true;
}

/**
 * Si un objeto no se le puede dar a un invitado: le cambiaría para siempre
 * (equipables, piedras, caramelos, gominolas) y el cliente se va al llegar.
 * @param {import('../core/Game.js').Game} game
 * @param {number} entityId
 * @param {string} itemId
 * @returns {boolean}
 */
export function guestRefusesItem(game, entityId, itemId) {
  if (!game.entityManager.hasComponent(entityId, 'missionGuest')) return false;
  const type = game.itemsData.find((i) => i.id === itemId)?.type;
  return MISSION_RULES.escort.blockedItemTypes.includes(type);
}
