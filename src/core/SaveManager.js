/**
 * SaveManager.js — Guardado y carga en localStorage.
 *
 * Una partida de otra versión nunca se borra: se migra paso a paso con
 * MIGRATIONS. Para cambiar el formato, añade la migración de la versión actual
 * a la siguiente y sube SAVE_VERSION. Antes de sobrescribir una partida
 * migrada se guarda una copia de la original.
 *
 * Formato v3:
 * - `profile`: el equipo de exploración (core/Profile.js), con la Pokédex y
 *   las estadísticas.
 * - `bag` y `wallet`: lo que lleva encima el equipo ahora mismo.
 * - `run`: la expedición en curso, o null si el equipo está en el pueblo.
 */

import { toSnapshot } from './PokemonSnapshot.js';
import { DUNGEONS } from './Dungeons.js';

const SAVE_KEY = 'pokerogue_save';
const BACKUP_PREFIX = 'pokerogue_save_backup_';
export const SAVE_VERSION = 3;

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
};

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
