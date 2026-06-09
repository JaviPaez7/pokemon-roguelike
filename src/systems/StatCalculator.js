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
 * @param {Object} [bonusStats] - { maxHp, attack, defense, spAtk, spDef, speed } opcional (Gummis)
 * @returns {Object} { maxHp, attack, defense, spAtk, spDef, speed }
 */
export function calculateAllStats(baseStats, level, bonusStats = null) {
  const stats = {
    maxHp:   calculateHP(baseStats.hp, level),
    attack:  calculateStat(baseStats.attack, level),
    defense: calculateStat(baseStats.defense, level),
    spAtk:   calculateStat(baseStats.spAtk, level),
    spDef:   calculateStat(baseStats.spDef, level),
    speed:   calculateStat(baseStats.speed, level)
  };

  if (bonusStats) {
    stats.maxHp += (bonusStats.maxHp || 0);
    stats.attack += (bonusStats.attack || 0);
    stats.defense += (bonusStats.defense || 0);
    stats.spAtk += (bonusStats.spAtk || 0);
    stats.spDef += (bonusStats.spDef || 0);
    stats.speed += (bonusStats.speed || 0);
  }

  return stats;
}
