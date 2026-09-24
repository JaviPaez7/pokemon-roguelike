/**
 * SaveManager.js — Guardado y carga en localStorage.
 *
 * Una partida de otra versión nunca se borra: se migra paso a paso con
 * MIGRATIONS. Para cambiar el formato, añade la migración de la versión actual
 * a la siguiente y sube SAVE_VERSION. Antes de sobrescribir una partida
 * migrada se guarda una copia de la original.
 *
 * Formato (v3 a v5; la v4 quitó las Poké Balls y la v5 añadió la historia):
 * - `profile`: el equipo de exploración (core/Profile.js), con la Pokédex,
 *   las estadísticas y las escenas de la historia ya vistas (`story`).
 * - `bag` y `wallet`: lo que lleva encima el equipo ahora mismo.
 * - `run`: la expedición en curso, o null si el equipo está en el pueblo.
 */

import { toSnapshot } from './PokemonSnapshot.js';
import { DUNGEONS } from './Dungeons.js';
import { seenForCleared } from './Story.js';

const SAVE_KEY = 'pokerogue_save';
const BACKUP_PREFIX = 'pokerogue_save_backup_';
export const SAVE_VERSION = 5;

/** Nombre que reciben los equipos de partidas anteriores a los perfiles. */
export const MIGRATED_TEAM_NAME = 'Equipo Pionero';

/**
 * MIGRATIONS[n] convierte una partida de la versión n en una de la n + 1.
 * Deben ser funciones puras: reciben los datos y devuelven los nuevos.
 * @type {Record<number, (data: Object) => Object>}
 */
const MIGRATIONS = {
  // v1 → v2: la semilla guardada era la del piso; pasa a ser la de la partida
  // (runSeed) y la de cada piso se deriva de ella. El piso se regenera igual
  // que antes al cargar, pero con otro trazado.
  1: (data) => {
    const { seed, ...rest } = data;
    return { ...rest, version: 2, runSeed: Number.isInteger(seed) ? seed & 0x7fffffff : 1 };
  },

  // v2 → v3: la carrera de 50 pisos pasa a ser un perfil de equipo en el
  // pueblo. El equipo, la mochila y el dinero se conservan; el piso en curso
  // cuenta para desbloquear las mazmorras ya atravesadas.
  2: (data) => {
    const party = Array.isArray(data.party) ? data.party : [];
    const roster = party.map((p, i) => ({ ...p, uid: i + 1, isLeader: false }));
    const leaderIndex = Math.max(0, party.findIndex((p) => p.isLeader));
    const heroUid = roster[leaderIndex]?.uid ?? null;
    const others = roster.filter((p) => p.uid !== heroUid).map((p) => p.uid);
    const reached = Number.isInteger(data.currentFloor) ? data.currentFloor : 1;
    return {
      version: 3,
      timestamp: data.timestamp ?? Date.now(),
      profile: {
        teamName: MIGRATED_TEAM_NAME,
        day: 1,
        roster,
        nextUid: roster.length + 1,
        heroUid,
        partnerUid: others[0] ?? null,
        teamUids: [heroUid, ...others].slice(0, 4),
        bank: 0,
        storage: [],
        rankPoints: 0,
        clearedDungeons: DUNGEONS.filter((d) => !d.challenge && d.floors[1] < reached).map((d) => d.id),
        missions: { day: 0, board: [], accepted: [], completed: 0 },
        flags: { migratedFromRun: true },
        stash: null,
        pokedexSeen: Array.isArray(data.pokedex) ? data.pokedex : [],
        stats: data.stats ?? {},
      },
      bag: Array.isArray(data.inventory) ? data.inventory : [],
      wallet: Number.isFinite(data.coins) ? data.coins : 0,
      run: null,
    };
  },

  // v3 → v4: las Poké Balls desaparecen (ahora se recluta derrotando al
  // Pokémon). Las que hubiera se cambian por lo que pagaba Kecleon por ellas:
  // las de la mochila van a la cartera y las del almacén, al banco. Las del
  // suelo o la tienda del piso en curso se quitan sin más. El total queda en
  // `flags.ballRefund` para avisar al jugador al cargar.
  3: (data) => {
    const profile = data.profile;
    const bag = refundBalls(data.bag);
    const storage = refundBalls(profile?.storage);
    const stash = refundBalls(profile?.stash?.bag);
    const refund = bag.money + storage.money + stash.money;
    const run = data.run && {
      ...data.run,
      floorItems: Array.isArray(data.run.floorItems) ? data.run.floorItems.filter((i) => !(i.itemId in BALL_REFUND)) : data.run.floorItems,
      floorMerchants: Array.isArray(data.run.floorMerchants)
        ? data.run.floorMerchants.map((m) => ({ ...m, items: (m.items || []).filter((i) => !(i.id in BALL_REFUND)) }))
        : data.run.floorMerchants,
    };
    return {
      ...data,
      version: 4,
      bag: bag.items,
      wallet: (data.wallet ?? 0) + bag.money,
      profile: profile && {
        ...profile,
        storage: storage.items,
        bank: (profile.bank ?? 0) + storage.money,
        stash: profile.stash && { ...profile.stash, bag: stash.items, wallet: (profile.stash.wallet ?? 0) + stash.money },
        flags: refund ? { ...profile.flags, ballRefund: refund } : profile.flags,
      },
      run,
    };
  },

  // v4 → v5: llega la historia (core/Story.js). Las partidas de antes siguen
  // desde su capítulo: las escenas de los capítulos ya superados, prólogo
  // incluido, cuentan como vistas.
  4: (data) => ({
    ...data,
    version: 5,
    profile: data.profile && {
      ...data.profile,
      story: { seen: seenForCleared(data.profile.clearedDungeons ?? []) },
    },
  }),
};

/** Lo que pagaba Kecleon por cada Poké Ball (migración v3 → v4). */
const BALL_REFUND = { pokeball: 48, great_ball: 120, ultra_ball: 120 };

/**
 * Separa las Poké Balls de una lista de objetos y las cambia por dinero.
 * @param {{ itemId: string, quantity: number }[] | undefined} items
 * @returns {{ items: { itemId: string, quantity: number }[], money: number }}
 */
function refundBalls(items) {
  if (!Array.isArray(items)) return { items, money: 0 };
  let money = 0;
  const kept = items.filter((slot) => {
    if (!(slot.itemId in BALL_REFUND)) return true;
    money += BALL_REFUND[slot.itemId] * (slot.quantity || 1);
    return false;
  });
  return { items: kept, money };
}

/**
 * Lleva una partida a SAVE_VERSION aplicando las migraciones que falten.
 * @param {Object} data - Partida en cualquier versión anterior o igual
 * @returns {Object} Partida en SAVE_VERSION
 */
export function migrateSave(data) {
  let current = data;
  while (current.version < SAVE_VERSION) {
    const step = MIGRATIONS[current.version];
    if (!step) throw new Error(`No hay migración desde la versión ${current.version}`);
    current = step(current);
  }
  return current;
}

/**
 * @typedef {{ status: 'none' }
 *   | { status: 'ok', data: Object, migratedFrom: number|null }
 *   | { status: 'newer', version: number }
 *   | { status: 'corrupt' }} SaveReadResult
 */

/**
 * Lee y valida la partida guardada, migrándola en memoria si es antigua.
 * No escribe nada.
 * @param {string|null} raw - Contenido de localStorage
 * @returns {SaveReadResult}
 */
export function parseSave(raw) {
  if (!raw) return { status: 'none' };
  let data;
  try {
    data = JSON.parse(raw);
  } catch (e) {
    return { status: 'corrupt' };
  }
  if (!data || typeof data !== 'object' || !Number.isInteger(data.version) || data.version < 1) {
    return { status: 'corrupt' };
  }
  if (data.version > SAVE_VERSION) return { status: 'newer', version: data.version };
  let migrated;
  try {
    migrated = migrateSave(data);
  } catch (e) {
    return { status: 'corrupt' };
  }
  const roster = migrated.profile?.roster;
  if (!Array.isArray(roster) || roster.length === 0 || migrated.profile.heroUid == null) {
    return { status: 'corrupt' };
  }
  return { status: 'ok', data: migrated, migratedFrom: data.version < SAVE_VERSION ? data.version : null };
}

/**
 * Estado de la partida guardada, para el menú de título.
 * @returns {SaveReadResult}
 */
export function inspectSave() {
  try {
    return parseSave(localStorage.getItem(SAVE_KEY));
  } catch (e) {
    return { status: 'none' };
  }
}

/** @returns {boolean} Si hay una partida válida guardada */
export function hasSave() {
  return inspectSave().status === 'ok';
}

function collectFloorMerchants(gameState) {
  try {
    const em = gameState.entityManager;
    if (!em || typeof em.getEntitiesWithComponents !== 'function') return [];
    const ids = em.getEntitiesWithComponents('npcMerchant', 'position');
    return ids.map(id => {
      const m = em.getComponent(id, 'npcMerchant');
      const pos = em.getComponent(id, 'position');
      if (!m || !pos) return null;
      return { x: pos.x, y: pos.y, items: m.items || [] };
    }).filter(Boolean);
  } catch (e) {
    return [];
  }
}

function collectFloorTraps(gameState) {
  try {
    const em = gameState.entityManager;
    if (!em || typeof em.getEntitiesWithComponents !== 'function') return [];
    const ids = em.getEntitiesWithComponents('trap', 'position');
    return ids.map(id => {
      const tr = em.getComponent(id, 'trap');
      const pos = em.getComponent(id, 'position');
      if (!tr || !pos) return null;
      return { type: tr.type, x: pos.x, y: pos.y, isHidden: !!tr.isHidden };
    }).filter(Boolean);
  } catch (e) {
    return [];
  }
}

function collectFloorItems(gameState) {
  try {
    const em = gameState.entityManager;
    if (!em || typeof em.getEntitiesWithComponents !== 'function') return [];
    const ids = em.getEntitiesWithComponents('itemDrop', 'position').filter(id => !em.hasComponent(id, 'missionItem'));
    return ids.map(id => {
      const d = em.getComponent(id, 'itemDrop');
      const pos = em.getComponent(id, 'position');
      if (!d || !pos) return null;
      return { itemId: d.itemId, quantity: d.quantity || 1, x: pos.x, y: pos.y };
    }).filter(Boolean);
  } catch (e) {
    return [];
  }
}

/**
 * Datos de la expedición en curso, o null si el equipo está en el pueblo.
 * @param {Object} gameState - Instancia de Game
 * @returns {Object|null}
 */
function collectRun(gameState) {
  if (!gameState.dungeonId) return null;
  return {
    dungeonId: gameState.dungeonId,
    // Piso global: el relativo se calcula con la mazmorra
    currentFloor: gameState._currentFloor,
    runSeed: gameState.runSeed,
    currentWeather: gameState.currentWeather || 'normal',
    turnCount: (typeof gameState.turnManager?.getTurnCount === 'function' ? gameState.turnManager.getTurnCount() : 0),
    party: gameState.party.map(toSnapshot),
    expedition: gameState.expedition ?? null,
    floorItems: collectFloorItems(gameState),
    floorTraps: collectFloorTraps(gameState),
    floorMerchants: collectFloorMerchants(gameState),
    fovRadiusModifier: gameState.fovRadiusModifier || 0,
    floorTurns: gameState._floorTurns || 0,
  };
}

/**
 * Guarda el estado actual del juego.
 * @param {Object} gameState - Instancia de Game
 * @returns {boolean} Si se guardó correctamente
 */
export function saveGame(gameState) {
  if (!gameState.profile) return false;
  try {
    const saveData = {
      version: SAVE_VERSION,
      timestamp: Date.now(),
      profile: {
        ...gameState.profile,
        pokedexSeen: Array.from(gameState.pokedexSeen || new Set()),
        stats: { ...gameState.stats },
      },
      bag: gameState.inventory.map(slot => ({ itemId: slot.itemId, quantity: slot.quantity })),
      wallet: gameState.coins ?? 0,
      run: collectRun(gameState),
    };
    localStorage.setItem(SAVE_KEY, JSON.stringify(saveData));
    return true;
  } catch (e) {
    console.error('Error al guardar:', e);
    return false;
  }
}

/**
 * Carga la partida guardada. Si era de una versión anterior, guarda una copia
 * de la original y la sustituye por la migrada.
 * @returns {Object|null} Datos de la partida (formato v3), o null si no hay una válida
 */
export function loadGame() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    const result = parseSave(raw);
    if (result.status !== 'ok') return null;

    if (result.migratedFrom !== null) {
      localStorage.setItem(`${BACKUP_PREFIX}v${result.migratedFrom}`, raw);
      localStorage.setItem(SAVE_KEY, JSON.stringify(result.data));
    }
    return result.data;
  } catch (e) {
    console.error('Error al cargar:', e);
    return null;
  }
}

/**
 * Aparta una partida ilegible a una copia de seguridad, para que deje de
 * ofrecerse en el título sin perderla.
 */
export function setAsideCorruptSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw) localStorage.setItem(`${BACKUP_PREFIX}corrupt_${Date.now()}`, raw);
    localStorage.removeItem(SAVE_KEY);
  } catch (e) {}
}

/**
 * Guarda una copia de la partida actual antes de empezar otra encima, para
 * poder recuperarla si fue un error.
 */
export function backupBeforeNewGame() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw) localStorage.setItem(`${BACKUP_PREFIX}replaced_${Date.now()}`, raw);
  } catch (e) {}
}
