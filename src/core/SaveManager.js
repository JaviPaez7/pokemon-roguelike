/**
 * SaveManager.js — Sistema de guardado y carga
 * Guarda el estado del juego en localStorage
 * El save se borra al morir (permadeath)
 */

const SAVE_KEY = 'pokerogue_save';
const SAVE_VERSION = 1;

/**
 * Guarda el estado actual del juego
 * @param {Object} gameState - Estado del juego
 * @returns {boolean} Si se guardó correctamente
 */
export function saveGame(gameState) {
  try {
    const saveData = {
      version: SAVE_VERSION,
      timestamp: Date.now(),
      seed: gameState._seed || Date.now(),
      weather: gameState.weather || 'none',
      currentFloor: typeof gameState.getCurrentFloor === 'function' ? gameState.getCurrentFloor() : gameState._currentFloor,
      party: gameState.party.map(p => ({
        speciesId: p.speciesId,
        name: p.name,
        level: p.level,
        xp: p.xp,
        types: p.types,
        currentMoves: p.currentMoves,
        hp: p.hp,
        maxHp: p.maxHp,
        attack: p.attack,
        defense: p.defense,
        spAtk: p.spAtk,
        spDef: p.spDef,
        speed: p.speed,
        statusEffects: p.statusEffects || [],
        isLeader: p.isLeader || false
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
      pokedex: Array.from(gameState.pokedexSeen || new Set())
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
    
    // Verificar versión
    if (data.version !== SAVE_VERSION) {
      console.warn('Save version mismatch, clearing save');
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
