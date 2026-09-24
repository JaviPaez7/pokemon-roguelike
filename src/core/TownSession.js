/**
 * TownSession.js — El pueblo base: empezar la aventura, entrar en el pueblo,
 * moverse por él e interactuar con sus habitantes.
 *
 * En el pueblo no hay turnos, tripa ni enemigos: el líder se mueve casilla a
 * casilla y el resto del equipo le sigue en fila. Hablar con alguien (Z o
 * chocar con él) abre su menú.
 */

import { ACTIONS, GAME_STATES } from '../constants.js';
import { TOWN, buildTownMap, isTownExit, townThingAt } from '../map/Town.js';
import { createProfile, getMember } from './Profile.js';
import { toSnapshot, restedSnapshot, spawnFromSnapshot } from './PokemonSnapshot.js';

/** Mochila y dinero con los que empieza un equipo nuevo. */
export const STARTING_BAG = [
  { itemId: 'apple', quantity: 2 },
  { itemId: 'oran_berry', quantity: 3 },
  { itemId: 'reviver_seed', quantity: 1 },
  { itemId: 'escape_rope', quantity: 1 },
];
export const STARTING_MONEY = 150;

/** Nivel inicial del protagonista y del compañero. */
export const STARTING_LEVEL = 5;

const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };

/** Casilla delante de la puerta de la base (al volver de formar equipo). */
export const BASE_FRONT = (() => {
  const base = TOWN.fixtures.find((f) => f.role === 'base');
  return { x: base.x, y: base.y + 1 };
})();

/**
 * Empieza una aventura nueva: crea el perfil con el protagonista y el
 * compañero y entra en el pueblo.
 * @param {import('./Game.js').Game} game
 * @param {{ heroSpeciesId: number, partnerSpeciesId: number, teamName: string }} choice
 */
export function startAdventure(game, { heroSpeciesId, partnerSpeciesId, teamName }) {
  const em = game.entityManager;
  em.clear();
  game.turnManager.reset();

  // Crear a los dos con las reglas normales de especie y nivel, y guardar sus fichas
  const heroId = em.createPokemon(heroSpeciesId, STARTING_LEVEL, 0, 0, false);
  const partnerId = em.createPokemon(partnerSpeciesId, STARTING_LEVEL, 0, 0, false);
  em.setComponent(heroId, 'partyMember', { slot: 0, isLeader: true, tactic: 'follow' });
  em.setComponent(partnerId, 'partyMember', { slot: 1, isLeader: false, tactic: 'follow' });
  const [hero, partner] = game.party.map(toSnapshot);
  em.clear();

  game.profile = createProfile({ teamName, hero, partner });
  game.inventory = STARTING_BAG.map((s) => ({ ...s }));
  game.coins = STARTING_MONEY;
  game.pokedexSeen = new Set([heroSpeciesId, partnerSpeciesId]);
  game.stats = {
    pokemonDefeated: 0,
    pokemonCaptured: 0,
    floorsExplored: 0,
    itemsUsed: 0,
    totalDamageDealt: 0,
    totalDamageTaken: 0,
    turnsPlayed: 0,
  };
  game.messageLog?.clear?.();
  game._messageLog = [];

  enterTown(game);
  game.saveGameData();
  game.eventBus.emit('show_dialog', {
    text:
      `¡Bienvenidos a ${TOWN.name}, ${teamName}!\n\n` +
      'Esta será vuestra base. En el tablón hay encargos de los vecinos, ' +
      'Kecleon vende provisiones, Kangaskhan os guarda objetos y Persian, el dinero.\n\n' +
      'Cuando estéis listos, salid por el camino del sur hacia las mazmorras.',
  });
}

/**
 * Coloca al equipo en el pueblo, descansado, y pasa al estado TOWN.
 * @param {import('./Game.js').Game} game
 * @param {{ arrival?: 'start' | 'return', spot?: { x: number, y: number } }} [options]
 *   Dónde aparece el equipo: en la plaza, al volver por la salida o en una casilla concreta
 */
export function enterTown(game, { arrival = 'start', spot: requestedSpot } = {}) {
  const em = game.entityManager;
  const profile = game.profile;

  game.dungeonId = null;
  game.expedition = null;
  game.runSeed = 0;
  game.currentWeather = 'normal';
  game.fovRadiusModifier = 0;
  em.clear();
  game.turnManager.reset();
  game.tileMap = buildTownMap();
  game.playerPathHistory = [];

  const spot = requestedSpot ?? (arrival === 'return' ? TOWN.exitReturn : TOWN.start);
  const places = freeTilesAround(game.tileMap, spot, profile.teamUids.length);
  profile.teamUids.forEach((uid, slot) => {
    const snapshot = restedSnapshot(getMember(profile, uid), game.movesData);
    const id = spawnFromSnapshot(game, snapshot, { slot, isLeader: slot === 0 });
    const { x, y } = places[slot];
    const pos = em.getComponent(id, 'position');
    Object.assign(pos, { x, y, prevX: x, prevY: y, facing: arrival === 'return' ? 'up' : 'down' });
    if (slot === 0) {
      game._playerId = id;
      game.turnManager.setPlayerEntityId?.(id);
    }
  });

  for (const npc of TOWN.npcs) spawnTownNpc(game, npc);

  game._updateCamera();
  game.changeState(GAME_STATES.TOWN);
  try {
    game.uiManager?.music?.playZone('Pueblo');
  } catch (e) {}
  game.needsRender = true;
}

/**
 * Casillas libres para el equipo, empezando por `spot` y siguiendo por las más
 * cercanas a pie (sin PNJ ni salidas).
 * @param {import('../map/TileMap.js').TileMap} map
 * @param {{ x: number, y: number }} spot
 * @param {number} count
 * @returns {{ x: number, y: number }[]}
 */
function freeTilesAround(map, spot, count) {
  const blocked = new Set(TOWN.npcs.map((n) => `${n.x},${n.y}`));
  const seen = new Set([`${spot.x},${spot.y}`]);
  const queue = [spot];
  const result = [];
  while (queue.length && result.length < count) {
    const tile = queue.shift();
    result.push(tile);
    for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
      const next = { x: tile.x + dx, y: tile.y + dy };
      const key = `${next.x},${next.y}`;
      if (seen.has(key) || blocked.has(key) || !map.isWalkable(next.x, next.y) || isTownExit(map, next.x, next.y)) continue;
      seen.add(key);
      queue.push(next);
    }
  }
  return result;
}

/**
 * @param {import('./Game.js').Game} game
 * @param {typeof TOWN.npcs[number]} npc
 */
function spawnTownNpc(game, npc) {
  const em = game.entityManager;
  const id = em.createEntity();
  em.setComponent(id, 'position', {
    x: npc.x,
    y: npc.y,
    facing: npc.facing || 'down',
    prevX: npc.x,
    prevY: npc.y,
    moveStartTime: 0,
  });
  const species = game.pokemonData.find((p) => p.id === npc.speciesId);
  em.setComponent(id, 'pokemonInfo', {
    speciesId: npc.speciesId,
    name: npc.name,
    level: 1,
    types: species?.types ?? ['normal'],
  });
  em.setComponent(id, 'sprite', {
    url: species?.sprite ?? `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${npc.speciesId}.png`,
    image: null,
    loaded: false,
  });
  em.setComponent(id, 'npcTown', { id: npc.id, role: npc.role });
}

/**
 * Un fotograma en el pueblo: mover al líder o interactuar.
 * @param {import('./Game.js').Game} game
 */
export function updateTown(game) {
  // Si el teclado quedó en modo diálogo sin diálogo visible, recuperar el control
  if (game.inputHandler._context === 'dialog' && !game.uiManager.hasOpenDialog()) {
    game.inputHandler.setContext('exploration');
  }
  if (game.uiManager.hasOpenDialog()) return;
  let action = game.inputHandler.getAction();
  if (!action && game.inputHandler.enabled) action = game.inputHandler.getHeldMovementAction();
  if (!action) return;

  if (action.type === ACTIONS.MOVE) {
    moveLeader(game, action.dx, action.dy);
  } else if (action.type === 'confirm') {
    const pos = game.entityManager.getComponent(game._playerId, 'position');
    const [dx, dy] = facingVector(pos);
    const thing = townThingAt(pos.x + dx, pos.y + dy);
    if (thing) interact(game, thing);
  }
  // Esperar, movimientos y cambiar de líder no hacen nada en el pueblo
}

/** @param {{ facing?: string, facingDx?: number, facingDy?: number }} pos */
function facingVector(pos) {
  if (pos.facingDx || pos.facingDy) return [pos.facingDx || 0, pos.facingDy || 0];
  return DIRS[pos.facing] || [0, 1];
}

/**
 * @param {import('./Game.js').Game} game
 * @param {number} dx
 * @param {number} dy
 */
function moveLeader(game, dx, dy) {
  const em = game.entityManager;
  const map = game.tileMap;
  const leader = em.getComponent(game._playerId, 'position');
  game.movementSystem._updateFacing(leader, dx, dy);
  game.needsRender = true;

  const tx = leader.x + dx;
  const ty = leader.y + dy;
  const thing = townThingAt(tx, ty);
  if (thing && thing.kind === 'npc') {
    interact(game, thing);
    return;
  }
  if (!map.isWalkable(tx, ty)) return;
  // Sin cortar esquinas en diagonal
  if (dx !== 0 && dy !== 0 && (!map.isWalkable(leader.x + dx, leader.y) || !map.isWalkable(leader.x, leader.y + dy))) {
    return;
  }

  const followers = teamIdsInOrder(game).filter((id) => id !== game._playerId);
  const blocker = followers.find((id) => {
    const p = em.getComponent(id, 'position');
    return p.x === tx && p.y === ty;
  });

  const trail = [{ x: leader.x, y: leader.y }];
  game.movementSystem._moveEntity(leader, tx, ty);
  if (blocker != null) {
    // Intercambio con el compañero que estorba, como en las mazmorras
    const p = em.getComponent(blocker, 'position');
    game.movementSystem._moveEntity(p, trail[0].x, trail[0].y);
  } else {
    // El resto sigue en fila: cada uno ocupa el sitio que deja el anterior
    for (const id of followers) {
      const p = em.getComponent(id, 'position');
      const next = trail[trail.length - 1];
      if (Math.max(Math.abs(p.x - next.x), Math.abs(p.y - next.y)) === 0) break;
      trail.push({ x: p.x, y: p.y });
      game.movementSystem._updateFacing(p, next.x - p.x, next.y - p.y);
      game.movementSystem._moveEntity(p, next.x, next.y);
    }
  }

  game._updateCamera();
  if (isTownExit(map, tx, ty)) {
    game.uiManager.openDungeonSelect();
  }
}

/**
 * El líder se aparta de la salida (al decidir quedarse en el pueblo).
 * @param {import('./Game.js').Game} game
 */
export function leaveExitTile(game) {
  const em = game.entityManager;
  const leader = em.getComponent(game._playerId, 'position');
  if (!isTownExit(game.tileMap, leader.x, leader.y)) return;
  const back = TOWN.exitReturn;
  const occupant = teamIdsInOrder(game).find((id) => {
    const p = em.getComponent(id, 'position');
    return id !== game._playerId && p.x === back.x && p.y === back.y;
  });
  if (occupant != null) {
    game.movementSystem._moveEntity(em.getComponent(occupant, 'position'), leader.x, leader.y);
  }
  game.movementSystem._moveEntity(leader, back.x, back.y);
  leader.facing = 'up';
  leader.facingDx = 0;
  leader.facingDy = -1;
  game._updateCamera();
  game.needsRender = true;
}

/**
 * Ids del equipo en el pueblo, en el orden de la formación.
 * @param {import('./Game.js').Game} game
 * @returns {number[]}
 */
function teamIdsInOrder(game) {
  const em = game.entityManager;
  return em
    .getEntitiesWithComponents('partyMember', 'position')
    .sort((a, b) => em.getComponent(a, 'partyMember').slot - em.getComponent(b, 'partyMember').slot);
}

/**
 * @param {import('./Game.js').Game} game
 * @param {{ kind: string, id: string, role: string, name: string }} thing
 */
function interact(game, thing) {
  const ui = game.uiManager;
  if (thing.kind === 'npc') faceTowards(game, thing.id);
  switch (thing.role) {
    case 'shop':
      ui.openTownShop();
      break;
    case 'storage':
      ui.openStorageMenu();
      break;
    case 'bank':
      ui.openBankMenu();
      break;
    case 'base':
      ui.openBaseMenu();
      break;
    case 'board':
      ui.openMissionBoard();
      break;
    case 'talk':
      ui.showDialog(townLine(thing.id));
      break;
  }
}

/** El PNJ se gira hacia el líder al hablarle. */
function faceTowards(game, npcId) {
  const em = game.entityManager;
  const npc = em.getEntitiesWithComponents('npcTown').find((id) => em.getComponent(id, 'npcTown').id === npcId);
  if (npc == null) return;
  const npcPos = em.getComponent(npc, 'position');
  const leader = em.getComponent(game._playerId, 'position');
  game.movementSystem._updateFacing(npcPos, leader.x - npcPos.x, leader.y - npcPos.y);
}

/** @param {string} npcId */
function townLine(npcId) {
  const lines = {
    slowpoke: '…\n\n……¿Eh? Ah, hola.\n\nDicen que las Bayas Aranja curan un poco. Yo me las como porque están ricas.',
    pidgey:
      '¡Hola! El tablón tiene encargos nuevos cada día.\n\n' +
      'Cuantos más completéis, más subirá el rango de vuestro equipo… ¡y más lejos os dejarán ir!',
  };
  return lines[npcId] ?? '…';
}
