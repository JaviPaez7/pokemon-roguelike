/**
 * SaveManager.js — Guardado y carga en localStorage.
 *
 * Una partida de otra versión nunca se borra: se migra paso a paso con
 * MIGRATIONS. Para cambiar el formato, añade la migración de la versión actual
 * a la siguiente y sube SAVE_VERSION. Antes de sobrescribir una partida
 * migrada se guarda una copia de la original.
 *
 * La partida sí se borra al perder o ganar (muerte permanente).
 */

const SAVE_KEY = 'pokerogue_save';
const BACKUP_PREFIX = 'pokerogue_save_backup_';
export const SAVE_VERSION = 2;

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
  if (!Array.isArray(migrated.party) || migrated.party.length === 0) return { status: 'corrupt' };
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
    const ids = em.getEntitiesWithComponents('itemDrop', 'position');
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
 * Guarda el estado actual del juego.
 * @param {Object} gameState - Instancia de Game
 * @returns {boolean} Si se guardó correctamente
 */
export function saveGame(gameState) {
  try {
    const saveData = {
      version: SAVE_VERSION,
      timestamp: Date.now(),
      runSeed: gameState.runSeed,
      currentWeather: gameState.currentWeather || 'normal',
      coins: gameState.coins ?? 0,
      dungeonId: gameState.dungeonId,
      // Piso global: el relativo se calcula con la mazmorra
      currentFloor: gameState._currentFloor,
      turnCount: (typeof gameState.turnManager?.getTurnCount === 'function' ? gameState.turnManager.getTurnCount() : 0),
      party: gameState.party.map(p => ({
        speciesId: p.speciesId,
        name: p.name,
        level: p.level,
        xp: p.xp,
        types: p.types,
        ability: p.ability || null,
        currentMoves: p.currentMoves,
        pendingMovesToLearn: p.pendingMovesToLearn || [],
        pendingEvolution: p.pendingEvolution || null,
        evolutionDeclinedAtLevel: p.evolutionDeclinedAtLevel ?? null,
        hp: p.hp,
        maxHp: p.maxHp,
        belly: p.belly,
        maxBelly: p.maxBelly,
        attack: p.attack,
        defense: p.defense,
        spAtk: p.spAtk,
        spDef: p.spDef,
        speed: p.speed,
        statusEffects: p.statusEffects || [],
        statModifiers: p.statModifiers || {},
        bonusStats: p.bonusStats || null,
        _statusTick: p._statusTick || 0,
        isLeader: p.isLeader || false,
        tactic: p.tactic || 'follow',
        chargingState: p.chargingState || null,
        bidingState: p.bidingState || null,
        mustRecharge: !!p.mustRecharge,
        reflect: p.reflect || 0,
        lightScreen: p.lightScreen || 0,
        substitute: p.substitute || 0,
        rage: !!p.rage,
        focusEnergy: !!p.focusEnergy,
        _preTransform: p._preTransform || null,
        spriteUrl: p.spriteUrl || null,
        lastPhysicalDamageTaken: p.lastPhysicalDamageTaken || 0,
        _intimidatedBy: p._intimidatedBy || [],
        protectStats: p.protectStats || 0,
        _rageTurns: p._rageTurns,
        _focusTurns: p._focusTurns,
        _traced: !!p._traced
      })),
      inventory: gameState.inventory.map(slot => ({
        itemId: slot.itemId,
        quantity: slot.quantity
      })),
      stats: {
        pokemonDefeated: gameState.stats.pokemonDefeated || 0,
        pokemonCaptured: gameState.stats.pokemonCaptured || 0,
        floorsExplored: gameState.stats.floorsExplored || 0,
        itemsUsed: gameState.stats.itemsUsed || 0,
        totalDamageDealt: gameState.stats.totalDamageDealt || 0,
        totalDamageTaken: gameState.stats.totalDamageTaken || 0,
        turnsPlayed: gameState.stats.turnsPlayed || 0
      },
      pokedex: Array.from(gameState.pokedexSeen || new Set()),
      floorItems: collectFloorItems(gameState),
      floorTraps: collectFloorTraps(gameState),
      floorMerchants: collectFloorMerchants(gameState),
      fovRadiusModifier: gameState.fovRadiusModifier || 0
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
 * @returns {Object|null} Datos de la partida, o null si no hay una válida
 */
export function loadGame() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    const result = parseSave(raw);
    if (result.status !== 'ok') return null;

    const data = result.data;
    if (result.migratedFrom !== null) {
      localStorage.setItem(`${BACKUP_PREFIX}v${result.migratedFrom}`, raw);
      localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    }

    data.pokedexSeen = new Set(data.pokedex || []);
    delete data.pokedex;
    return data;
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
 * Borra la partida (al perder o ganar: muerte permanente).
 */
export function deleteSave() {
  localStorage.removeItem(SAVE_KEY);
}
