/**
 * Missions.js — Tablón de misiones del pueblo.
 *
 * Cada día el tablón ofrece encargos nuevos en las mazmorras desbloqueadas
 * (también en las de posjuego, tras el final de la historia):
 * - `rescue`: un Pokémon se ha quedado atrapado en un piso; hay que llegar hasta él.
 * - `find_item`: un Pokémon perdió un objeto en un piso; hay que recogerlo.
 * - `deliver`: un Pokémon necesita un objeto en un piso; hay que llevárselo.
 * - `escort`: un Pokémon quiere llegar a un piso. Se une al entrar en la
 *   mazmorra como invitado (no es del equipo) y la misión se cumple si llega
 *   vivo. Si cae, la misión sigue aceptada para otro intento.
 * - `outlaw`: un forajido, más fuerte que los salvajes de su piso, anda suelto;
 *   derrotarlo cumple la misión.
 *
 * El equipo acepta hasta MAX_ACCEPTED. Una misión cumplida se cobra al volver
 * al pueblo; si el equipo cae antes, vuelve a quedar pendiente.
 *
 * El tablón depende solo del día (no consume el RNG de la partida). La mezcla
 * de tipos, las recompensas y los textos de escolta y forajido están en
 * missions.json.
 */

import floorsData from '../data/floors.json';
import missionsData from '../data/missions.json';
import { DUNGEONS, floorCount, isUnlocked } from './Dungeons.js';
import { floorSeed } from './Random.js';

export const MAX_ACCEPTED = 8;
export const BOARD_SIZE = 6;

export const MISSION_TYPE_NAMES = { rescue: 'Rescate', find_item: 'Buscar objeto', deliver: 'Entrega', escort: 'Escolta', outlaw: 'Forajido' };

/**
 * @typedef {Object} MissionRules
 * @property {Record<string, { weight: number, moneyBonus: number, moneyMultiplier: number, pointsMultiplier: number }>} types
 *   Peso de cada tipo en el tablón y lo que cambia su recompensa
 * @property {{ base: number, perFloor: number, roundTo: number }} money - Dinero según el piso global
 * @property {{ minFloor: number, levelOffset: number, blockedItemTypes: string[], reasons: string[] }} escort
 *   Piso mínimo de destino, nivel del invitado respecto a los salvajes de ese
 *   piso, objetos que no se le dan (le cambiarían para siempre) y motivos del viaje
 * @property {{ levelBonus: number, hpMultiplier: number, fleeBelow: number, crimes: string[] }} outlaw
 *   Niveles de más, PS de más, vida con la que huye y delitos del cartel
 */

/** @type {MissionRules} */
export const MISSION_RULES = missionsData;

/** Dificultad según el piso global: letra y puntos de rango. */
export const DIFFICULTIES = [
  { rank: 'E', upTo: 5, points: 10 },
  { rank: 'D', upTo: 15, points: 20 },
  { rank: 'C', upTo: 25, points: 30 },
  { rank: 'B', upTo: 35, points: 50 },
  { rank: 'A', upTo: 45, points: 80 },
  { rank: 'S', upTo: 50, points: 120 },
  // Posjuego: las mazmorras de los legendarios (pisos 51 en adelante)
  { rank: '★', upTo: Infinity, points: 160 },
];

/** Objetos que se pierden (buscar) y que se piden (entregar: se venden en el pueblo). */
export const LOST_ITEMS = ['moon_stone', 'fire_stone', 'water_stone', 'thunder_stone', 'leaf_stone', 'big_apple', 'max_elixir'];
export const DELIVERY_ITEMS = ['apple', 'oran_berry', 'potion', 'antidote'];
export const REWARD_ITEMS = ['sitrus_berry', 'super_potion', 'reviver_seed', 'ether', 'red_gummi', 'blue_gummi', 'full_heal', 'big_apple', 'friend_bow', 'pecha_scarf', 'power_band', 'defense_scarf'];

/**
 * @typedef {{
 *   id: string,
 *   type: 'rescue' | 'find_item' | 'deliver' | 'escort' | 'outlaw',
 *   dungeonId: string,
 *   floor: number,
 *   clientSpeciesId: number,
 *   clientName: string,
 *   itemId: string | null,
 *   difficulty: string,
 *   reward: { money: number, itemId: string | null, rankPoints: number },
 *   status: 'open' | 'accepted' | 'done',
 *   story?: boolean,
 *   text?: string,
 *   reason?: string,
 *   crime?: string
 * }} Mission
 *
 * Las misiones de historia (`story: true`) las da una escena, no el tablón:
 * no se pueden abandonar, su cliente no aparece en el piso (lo resuelve la
 * propia escena) y `text` sustituye a la descripción de siempre.
 *
 * En la escolta, `floor` es el piso al que hay que llegar y `reason`, el
 * motivo del viaje. En el forajido, el «cliente» es el propio forajido y
 * `crime`, lo que dice el cartel.
 */

/** @param {number} globalFloor */
export function difficultyFor(globalFloor) {
  return DIFFICULTIES.find((d) => globalFloor <= d.upTo);
}

/**
 * Dinero que paga un encargo según su tipo y su piso global.
 * @param {Mission['type']} type
 * @param {number} globalFloor
 */
export function rewardMoney(type, globalFloor) {
  const { base, perFloor, roundTo } = MISSION_RULES.money;
  const { moneyBonus = 0, moneyMultiplier = 1 } = MISSION_RULES.types[type] ?? {};
  return Math.round(((base + globalFloor * perFloor + moneyBonus) * moneyMultiplier) / roundTo) * roundTo;
}

/**
 * Puntos de rango que da un encargo según su tipo y su dificultad.
 * @param {Mission['type']} type
 * @param {{ points: number }} difficulty
 * @returns {number}
 */
export function rewardPoints(type, difficulty) {
  return Math.round(difficulty.points * (MISSION_RULES.types[type]?.pointsMultiplier ?? 1));
}

/**
 * Tipo de encargo según los pesos de missions.json. La escolta necesita una
 * mazmorra con pisos de sobra (hay que llegar al menos a `escort.minFloor`).
 * @param {() => number} rng
 * @param {number} maxFloor - Último piso en el que puede haber encargos
 * @returns {Mission['type']}
 */
function pickMissionType(rng, maxFloor) {
  const types = Object.entries(MISSION_RULES.types).filter(
    ([type]) => type !== 'escort' || maxFloor >= MISSION_RULES.escort.minFloor,
  );
  const total = types.reduce((sum, [, t]) => sum + t.weight, 0);
  let roll = rng() * total;
  for (const [type, t] of types) {
    roll -= t.weight;
    if (roll < 0) return /** @type {Mission['type']} */ (type);
  }
  return /** @type {Mission['type']} */ (types.at(-1)[0]);
}

/**
 * Lo que cuenta el cartel de una escolta (el motivo) o de un forajido (el delito).
 * @param {Mission['type']} type
 * @param {<T>(list: T[]) => T} pick
 * @returns {{ reason?: string, crime?: string }}
 */
function missionFlavor(type, pick) {
  if (type === 'escort') return { reason: pick(MISSION_RULES.escort.reasons) };
  if (type === 'outlaw') return { crime: pick(MISSION_RULES.outlaw.crimes) };
  return {};
}

/** Generador pseudoaleatorio local (LCG), para no tocar el RNG de la partida. */
function localRng(seed) {
  let state = seed || 1;
  return () => {
    state = (Math.imul(state, 1103515245) + 12345) & 0x7fffffff;
    return state / 0x80000000;
  };
}

/**
 * Encargos del tablón para un día.
 * @param {{
 *   day: number,
 *   clearedDungeons: string[],
 *   storySeen?: string[],
 *   pokemonData: { id: number, name: string }[],
 *   count?: number
 * }} options - `storySeen`: escenas vistas (abren las mazmorras de posjuego)
 * @returns {Mission[]}
 */
export function generateBoard({ day, clearedDungeons, storySeen = [], pokemonData, count = BOARD_SIZE }) {
  const rng = localRng(floorSeed(day, 0, 'misiones'));
  const pick = (list) => list[Math.floor(rng() * list.length)];
  const dungeons = DUNGEONS.filter((d) => !d.challenge && isUnlocked(d, clearedDungeons, storySeen));
  const missions = [];
  for (let i = 0; i < count; i++) {
    const dungeon = pick(dungeons);
    const lastGlobal = dungeon.floors[1];
    const bossAtEnd = floorsData.zones.some((z) => z.boss && z.floors[1] === lastGlobal);
    // El piso del jefe no es sitio para un encargo
    const maxFloor = floorCount(dungeon) - (bossAtEnd ? 1 : 0);
    const type = pickMissionType(rng, maxFloor);
    // Una escolta al piso 1 se cumpliría al entrar
    const minFloor = type === 'escort' ? MISSION_RULES.escort.minFloor : 1;
    const floor = minFloor + Math.floor(rng() * (maxFloor - minFloor + 1));
    const globalFloor = dungeon.floors[0] + floor - 1;
    const zone = floorsData.zones.find((z) => globalFloor >= z.floors[0] && globalFloor <= z.floors[1]);
    const clientSpeciesId = pick(zone.pokemon).id;
    const itemId = type === 'find_item' ? pick(LOST_ITEMS) : type === 'deliver' ? pick(DELIVERY_ITEMS) : null;
    const difficulty = difficultyFor(globalFloor);
    missions.push({
      id: `d${day}-${i}`,
      type,
      dungeonId: dungeon.id,
      floor,
      clientSpeciesId,
      clientName: pokemonData.find((p) => p.id === clientSpeciesId)?.name ?? `#${clientSpeciesId}`,
      itemId,
      difficulty: difficulty.rank,
      reward: {
        money: rewardMoney(type, globalFloor),
        itemId: rng() < 0.4 ? pick(REWARD_ITEMS) : null,
        rankPoints: rewardPoints(type, difficulty),
      },
      status: 'open',
      ...missionFlavor(type, pick),
    });
  }
  return missions;
}

/**
 * Misión de historia ya aceptada, con la recompensa normal de su tipo y piso.
 * @param {{ id: string, type: Mission['type'], dungeonId: string, floor: number, clientSpeciesId: number, clientName: string, text: string }} spec
 * @returns {Mission}
 */
export function storyMission(spec) {
  const dungeon = DUNGEONS.find((d) => d.id === spec.dungeonId);
  const globalFloor = dungeon.floors[0] + spec.floor - 1;
  const difficulty = difficultyFor(globalFloor);
  return {
    ...spec,
    itemId: null,
    difficulty: difficulty.rank,
    reward: { money: rewardMoney(spec.type, globalFloor), itemId: null, rankPoints: difficulty.points },
    status: 'accepted',
    story: true,
  };
}

/**
 * Renueva el tablón si ha cambiado el día. Los encargos ya aceptados no se repiten.
 * @param {Object} profile
 * @param {{ id: number, name: string }[]} pokemonData
 */
export function refreshBoard(profile, pokemonData) {
  const missions = profile.missions;
  if (missions.day === profile.day) return;
  const taken = new Set(missions.accepted.map((m) => m.id));
  missions.board = generateBoard({
    day: profile.day,
    clearedDungeons: profile.clearedDungeons,
    storySeen: profile.story?.seen ?? [],
    pokemonData,
  }).filter(
    (m) => !taken.has(m.id),
  );
  missions.day = profile.day;
}

/**
 * @param {Object} profile
 * @param {string} missionId
 * @returns {{ ok: true } | { ok: false, error: string }}
 */
export function acceptMission(profile, missionId) {
  const { board, accepted } = profile.missions;
  const mission = board.find((m) => m.id === missionId);
  if (!mission) return { ok: false, error: 'Ese encargo ya no está en el tablón.' };
  if (accepted.length >= MAX_ACCEPTED) return { ok: false, error: `Ya lleváis ${MAX_ACCEPTED} misiones. Cumplid o abandonad alguna.` };
  board.splice(board.indexOf(mission), 1);
  accepted.push({ ...mission, status: 'accepted' });
  return { ok: true };
}

/**
 * Abandona una misión aceptada (no vuelve al tablón).
 * @param {Object} profile
 * @param {string} missionId
 */
export function abandonMission(profile, missionId) {
  const accepted = profile.missions.accepted;
  const index = accepted.findIndex((m) => m.id === missionId);
  // Las de historia no se abandonan
  if (index !== -1 && !accepted[index].story) accepted.splice(index, 1);
}

/**
 * Misiones pendientes en un piso concreto.
 * @param {Object} profile
 * @param {string} dungeonId
 * @param {number} floor - Piso relativo a la mazmorra
 * @returns {Mission[]}
 */
export function missionsHere(profile, dungeonId, floor) {
  return profile.missions.accepted.filter((m) => m.status === 'accepted' && m.dungeonId === dungeonId && m.floor === floor);
}

/** @param {Object} profile @param {string} missionId */
export function getAccepted(profile, missionId) {
  return profile.missions.accepted.find((m) => m.id === missionId) ?? null;
}

/** @param {Object} profile @param {string} missionId */
export function markMissionDone(profile, missionId) {
  const mission = getAccepted(profile, missionId);
  if (mission) mission.status = 'done';
}

/**
 * Si el equipo cae, las misiones cumplidas sin cobrar vuelven a quedar pendientes.
 * @param {Object} profile
 * @returns {number} Cuántas se han perdido
 */
export function revertDoneMissions(profile) {
  const done = profile.missions.accepted.filter((m) => m.status === 'done');
  for (const m of done) m.status = 'accepted';
  return done.length;
}

/**
 * Cobra las misiones cumplidas: dinero, objeto (a la mochila o, si no cabe, al
 * almacén) y puntos de rango. En las de buscar objeto se entrega el objeto.
 * @param {Object} profile
 * @param {{ bag: { itemId: string, quantity: number }[], wallet: number, maxSlots: number, itemName: (id: string) => string }} options
 * @returns {{ wallet: number, rankPoints: number, lines: string[] }}
 */
export function claimRewards(profile, { bag, wallet, maxSlots, itemName }) {
  const lines = [];
  let rankPoints = 0;
  for (const mission of profile.missions.accepted.filter((m) => m.status === 'done')) {
    if (mission.type === 'find_item') {
      const slot = bag.find((s) => s.itemId === mission.itemId);
      if (!slot) {
        mission.status = 'accepted';
        lines.push(`${mission.clientName} esperaba su ${itemName(mission.itemId)}, pero no está en la mochila.`);
        continue;
      }
      slot.quantity -= 1;
      if (slot.quantity === 0) bag.splice(bag.indexOf(slot), 1);
    }
    wallet += mission.reward.money;
    rankPoints += mission.reward.rankPoints;
    let line = `Misión de ${mission.clientName}: +${mission.reward.money} Poké`;
    if (mission.reward.itemId) {
      const target = bag.find((s) => s.itemId === mission.reward.itemId);
      if (target) target.quantity += 1;
      else if (bag.length < maxSlots) bag.push({ itemId: mission.reward.itemId, quantity: 1 });
      else addToStorage(profile.storage, mission.reward.itemId);
      line += ` y ${itemName(mission.reward.itemId)}`;
    }
    lines.push(`${line}.`);
    profile.missions.completed += 1;
    profile.missions.accepted.splice(profile.missions.accepted.indexOf(mission), 1);
  }
  return { wallet, rankPoints, lines };
}

/** @param {{ itemId: string, quantity: number }[]} storage @param {string} itemId */
function addToStorage(storage, itemId) {
  const slot = storage.find((s) => s.itemId === itemId);
  if (slot) slot.quantity += 1;
  else storage.push({ itemId, quantity: 1 });
}

/**
 * Texto del encargo para el tablón.
 * @param {Mission} mission
 * @param {{ dungeonName: string, itemName: (id: string) => string }} names
 */
export function describeMission(mission, { dungeonName, itemName }) {
  if (mission.story && mission.text) return mission.text;
  const where = `${dungeonName}, piso ${mission.floor}`;
  switch (mission.type) {
    case 'rescue':
      return `${mission.clientName} se ha quedado atrapado en ${where}. ¡Por favor, id a buscarlo!`;
    case 'find_item':
      return `${mission.clientName} perdió su ${itemName(mission.itemId)} en ${where}. ¿Podéis encontrarlo?`;
    case 'deliver':
      return `${mission.clientName} está en ${where} y necesita ${itemName(mission.itemId)}. ¿Se lo lleváis?`;
    case 'escort':
      return [
        `${mission.clientName} quiere llegar a ${where}.`,
        mission.reason,
        'Se une al entrar en la mazmorra y necesita un hueco en el equipo.',
      ]
        .filter(Boolean)
        .join(' ');
    case 'outlaw':
      return [`SE BUSCA: ${mission.clientName}, visto en ${where}.`, mission.crime, 'Es más fuerte que los Pokémon de la zona.']
        .filter(Boolean)
        .join(' ');
    default:
      return where;
  }
}

/**
 * Lo que se dice al aceptar un encargo.
 * @param {Mission} mission
 * @param {string} dungeonName
 * @returns {string}
 */
export function acceptedText(mission, dungeonName) {
  const where = `${dungeonName}, piso ${mission.floor}`;
  if (mission.type === 'escort') {
    return `Misión aceptada: ${mission.clientName} espera en la entrada de ${dungeonName} para llegar al piso ${mission.floor}.`;
  }
  if (mission.type === 'outlaw') return `Misión aceptada: ${mission.clientName} anda suelto por ${where}.`;
  return `Misión aceptada: ${mission.clientName} os espera en ${where}.`;
}

// ─── Escolta y forajido ────────────────────────────────────────────────────

/**
 * Nivel medio de los salvajes de un piso global (el que usa FloorManager, sin
 * la variación de ±1).
 * @param {number} globalFloor
 * @returns {number}
 */
export function wildLevelAt(globalFloor) {
  const zone = floorsData.zones.find((z) => globalFloor >= z.floors[0] && globalFloor <= z.floors[1]) ?? floorsData.zones.at(-1);
  const [minLvl, maxLvl] = zone.levelRange;
  const span = Math.max(1, zone.floors[1] - zone.floors[0]);
  const t = Math.max(0, Math.min(1, (globalFloor - zone.floors[0]) / span));
  return Math.round(minLvl + (maxLvl - minLvl) * t);
}

/**
 * Piso global de una misión.
 * @param {Mission} mission
 * @returns {number}
 */
export function missionGlobalFloor(mission) {
  const dungeon = DUNGEONS.find((d) => d.id === mission.dungeonId);
  return (dungeon?.floors[0] ?? 1) + mission.floor - 1;
}

/**
 * Nivel del forajido: unos cuantos más que los salvajes de su piso.
 * @param {number} globalFloor
 * @returns {number}
 */
export function outlawLevel(globalFloor) {
  return wildLevelAt(globalFloor) + MISSION_RULES.outlaw.levelBonus;
}

/**
 * Nivel del cliente de una escolta: el de los salvajes del piso al que va.
 * @param {number} globalFloor
 * @returns {number}
 */
export function escortGuestLevel(globalFloor) {
  return Math.max(1, wildLevelAt(globalFloor) + MISSION_RULES.escort.levelOffset);
}

/**
 * Escoltas que empiezan al entrar en una mazmorra. Cada cliente ocupa un hueco
 * del equipo mientras va con él, así que solo se unen los que caben (primero
 * los que van a los pisos más cercanos); el resto espera a otra expedición.
 * En la Torre del Desafío no hay encargos.
 * @param {Object} profile
 * @param {{ id: string, challenge?: boolean }} dungeon
 * @param {number} freeSlots - Huecos libres en el equipo
 * @returns {{ joining: Mission[], waiting: Mission[] }}
 */
export function escortsToJoin(profile, dungeon, freeSlots) {
  if (dungeon.challenge) return { joining: [], waiting: [] };
  const escorts = profile.missions.accepted
    .filter((m) => m.type === 'escort' && m.status === 'accepted' && !m.story && m.dungeonId === dungeon.id)
    .sort((a, b) => a.floor - b.floor || a.id.localeCompare(b.id));
  const room = Math.max(0, freeSlots);
  return { joining: escorts.slice(0, room), waiting: escorts.slice(room) };
}

/**
 * Escoltas que se cumplen al llegar a un piso: las de ese piso cuyo cliente
 * sigue con el equipo.
 * @param {Object} profile
 * @param {string} dungeonId
 * @param {number} floor - Piso relativo a la mazmorra
 * @param {string[]} guestMissionIds - Misiones de los invitados que siguen en pie
 * @returns {Mission[]}
 */
export function escortArrivals(profile, dungeonId, floor, guestMissionIds) {
  return missionsHere(profile, dungeonId, floor).filter((m) => m.type === 'escort' && guestMissionIds.includes(m.id));
}
