/**
 * StatCalculator.js
 * Fórmulas centralizadas de cálculo de estadísticas de Pokémon.
 *
 * Usa la fórmula simplificada de Generación III (sin IVs/EVs/naturaleza):
 *   HP  = floor((2 * base * level / 100) + level + 10)
 *   Stat = floor((2 * base * level / 100) + level + 5)
 *
 * Este módulo es la ÚNICA fuente de verdad para el cálculo de stats.
 * Lo usan: EntityManager, ExperienceSystem, EvolutionSystem.
 */

/**
 * Calcula los PS (HP) de un Pokémon.
 * @param {number} baseHP  - HP base de la especie
 * @param {number} level   - Nivel del Pokémon
 * @returns {number} HP máximos
 */
export function calculateHP(baseHP, level) {
  return Math.floor(((2 * baseHP * level) / 100) + level + 10);
}

/**
 * Calcula cualquier estadística que no sea HP.
 * @param {number} baseStat - Estadística base de la especie
 * @param {number} level    - Nivel del Pokémon
 * @returns {number} Estadística calculada
 */
export function calculateStat(baseStat, level) {
  return Math.floor(((2 * baseStat * level) / 100) + level + 5);
}

/**
 * Calcula el conjunto completo de estadísticas de un Pokémon.
 * @param {Object} baseStats - { hp, attack, defense, spAtk, spDef, speed }
 * @param {number} level     - Nivel del Pokémon
 * @returns {Object} { maxHp, attack, defense, spAtk, spDef, speed }
 */
export function calculateAllStats(baseStats, level) {
  return {
    maxHp:   calculateHP(baseStats.hp, level),
    attack:  calculateStat(baseStats.attack, level),
    defense: calculateStat(baseStats.defense, level),
    spAtk:   calculateStat(baseStats.spAtk, level),
    spDef:   calculateStat(baseStats.spDef, level),
    speed:   calculateStat(baseStats.speed, level)
  };
}
