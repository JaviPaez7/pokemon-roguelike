/**
 * SaveManager.js — Sistema de guardado y carga
 * Guarda el estado del juego en localStorage
 * El save se borra al morir (permadeath)
 */

const SAVE_KEY = 'pokerogue_save';
export const SAVE_VERSION = 1;
// v1: party/inventory/floor (+ floorItems si hay; mapa regenerado al cargar)

/**
 * Guarda el estado actual del juego
 * @param {Object} gameState - Estado del juego
 * @returns {boolean} Si se guardó correctamente
 */



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

export function saveGame(gameState) {
  try {
    const saveData = {
      version: SAVE_VERSION,
      timestamp: Date.now(),
      seed: gameState.seed || Date.now(),
      currentWeather: gameState.currentWeather || 'normal',
      coins: gameState.coins || 100,
      currentFloor: typeof gameState.getCurrentFloor === 'function' ? gameState.getCurrentFloor() : gameState._currentFloor,
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
 * Carga el estado guardado del juego
 * @returns {Object|null} Estado guardado o null si no hay save
 */
export function loadGame() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;

    const data = JSON.parse(raw);
    
    // Verificar versión (migraciones futuras: intentar cargar si es compatible)
    if (data.version !== SAVE_VERSION) {
      console.warn('Versión de guardado incompatible; se borrará el save.');
      try {
        // Marcar para que el título pueda avisar una vez
        sessionStorage.setItem('pokerogue_save_wiped', '1');
      } catch (e) {}
      deleteSave();
      return null;
    }

    // Restaurar Set del Pokédex
    data.pokedexSeen = new Set(data.pokedex || []);
    delete data.pokedex;

    return data;
  } catch (e) {
    console.error('Error al cargar:', e);
    deleteSave();
    return null;
  }
}

/**
 * Borra el save (para permadeath)
 */
export function deleteSave() {
  localStorage.removeItem(SAVE_KEY);
}

/**
 * Verifica si existe un save
 * @returns {boolean}
 */
export function hasSave() {
  return localStorage.getItem(SAVE_KEY) !== null;
}

/**
 * Obtiene info resumida del save (para mostrar en menú)
 * @returns {Object|null} { floor, partySize, leaderName, leaderLevel, timestamp }
 */
export function getSaveInfo() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;

    const data = JSON.parse(raw);
    const leader = data.party.find(p => p.isLeader) || data.party[0];
    
    return {
      floor: data.currentFloor,
      partySize: data.party.length,
      leaderName: leader ? leader.name : '???',
      leaderLevel: leader ? leader.level : 0,
      timestamp: data.timestamp,
      stats: data.stats
    };
  } catch (e) {
    return null;
  }
}
