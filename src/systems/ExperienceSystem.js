/**
 * ExperienceSystem.js — Sistema de experiencia y subida de nivel
 */

/**
 * Calcula XP ganada al derrotar un enemigo
 * @param {number} baseExp - Experiencia base de la especie derrotada
 * @param {number} enemyLevel - Nivel del enemigo derrotado
 * @returns {number} XP ganada
 */
export function calculateExpGained(baseExp, enemyLevel) {
  // Fórmula simplificada: (baseExp * enemyLevel) / 5, con un pequeño bonus
  // para que el early game no se sienta tan lento
  const raw = Math.floor((baseExp * enemyLevel) / 5);
  const bonus = enemyLevel <= 12 ? Math.ceil(raw * 0.35) : (enemyLevel <= 22 ? Math.ceil(raw * 0.15) : 0);
  return Math.max(1, raw + bonus);
}

/**
 * Calcula la XP necesaria para el siguiente nivel
 * Usa la curva de crecimiento "medium fast" (la más común en Gen 1)
 * @param {number} level - Nivel actual
 * @returns {number} XP total necesaria para ese nivel
 */
export function expForLevel(level) {
  // Curva medium fast: n^3
  return Math.floor(Math.pow(level, 3));
}

/**
 * Calcula XP necesaria para subir del nivel actual al siguiente
 * @param {number} currentLevel - Nivel actual
 * @param {number} currentXP - XP actual
 * @returns {number} XP que falta para subir de nivel
 */
export function expToNextLevel(currentLevel, currentXP) {
  const nextLevelXP = expForLevel(currentLevel + 1);
  return Math.max(0, nextLevelXP - currentXP);
}

/**
 * Otorga XP a un Pokémon y verifica si sube de nivel
 * @param {Object} pokemonInfo - PokemonInfo component
 * @param {Object} fighter - Fighter component
 * @param {number} xpGained - XP ganada
 * @param {Array} pokemonDB - Base de datos de Pokémon
 * @param {Array} movesDB - Base de datos de movimientos
 * @returns {Object} { levelsGained, newMoves: [{moveId, moveName}], messages }
 */
export function grantExperience(pokemonInfo, fighter, xpGained, pokemonDB, movesDB) {
  const result = {
    levelsGained: 0,
    newMoves: [],
    messages: []
  };

  pokemonInfo.xp = (pokemonInfo.xp || 0) + xpGained;
  result.messages.push(`¡${pokemonInfo.name} ganó ${xpGained} puntos de experiencia!`);

  // Verificar subidas de nivel (puede subir varios niveles a la vez)
  let maxLevel = 100;
  while (pokemonInfo.level < maxLevel && pokemonInfo.xp >= expForLevel(pokemonInfo.level + 1)) {
    pokemonInfo.level++;
    result.levelsGained++;
    result.messages.push(`¡${pokemonInfo.name} subió al nivel ${pokemonInfo.level}!`);

    // Recalcular stats
    const speciesData = pokemonDB.find(p => p.id === pokemonInfo.speciesId);
    if (speciesData) {
      const newStats = calculateStats(speciesData.stats, pokemonInfo.level, fighter.bonusStats);
      const hpIncrease = newStats.maxHp - fighter.maxHp;
      
      fighter.maxHp = newStats.maxHp;
      fighter.hp = Math.min(fighter.maxHp, fighter.hp + hpIncrease); // Curar la diferencia
      fighter.attack = newStats.attack;
      fighter.defense = newStats.defense;
      fighter.spAtk = newStats.spAtk;
      fighter.spDef = newStats.spDef;
      fighter.speed = newStats.speed;

      // Verificar nuevos movimientos
      if (speciesData.moves) {
        for (const moveEntry of speciesData.moves) {
          if (moveEntry.level === pokemonInfo.level) {
            const moveData = movesDB.find(m => m.id === moveEntry.moveId);
            if (moveData) {
              // Aprender movimiento si hay espacio (máximo 4)
              const alreadyKnown = pokemonInfo.currentMoves.some(m => m.moveId === moveEntry.moveId);
              if (!alreadyKnown) {
                if (pokemonInfo.currentMoves.length < 4) {
                  pokemonInfo.currentMoves.push({
                    moveId: moveEntry.moveId,
                    currentPP: moveData.pp,
                    maxPP: moveData.pp,
                    enabled: true
                  });
                  result.newMoves.push({ moveId: moveEntry.moveId, moveName: moveData.name });
                  result.messages.push(`¡${pokemonInfo.name} aprendió ${moveData.name}!`);
                } else {
                  // Guardar movimiento pendiente para que el jugador elija cuál olvidar
                  pokemonInfo.pendingMovesToLearn = pokemonInfo.pendingMovesToLearn || [];
                  const alreadyPending = pokemonInfo.pendingMovesToLearn.some(pm => pm.moveId === moveEntry.moveId);
                  if (!alreadyPending) {
                    pokemonInfo.pendingMovesToLearn.push({
                      moveId: moveEntry.moveId,
                      moveName: moveData.name
                    });
                    result.messages.push(`¡${pokemonInfo.name} quiere aprender ${moveData.name}, pero ya conoce 4 movimientos!`);
                  }
                }
              }
            }
          }
        }
      }
    }
  }

  return result;
}

/**
 * Encuentra el índice del movimiento más débil para reemplazar
 * @param {Array} currentMoves - Movimientos actuales
 * @param {Array} movesDB - Base de datos de movimientos
 * @returns {number} Índice del movimiento más débil
 */
function findWeakestMoveIndex(currentMoves, movesDB) {
  let weakestIdx = 0;
  let weakestPower = Infinity;

  for (let i = 0; i < currentMoves.length; i++) {
    const moveData = movesDB.find(m => m.id === currentMoves[i].moveId);
    const power = moveData ? (moveData.power || 0) : 0;
    if (power < weakestPower) {
      weakestPower = power;
      weakestIdx = i;
    }
  }

  return weakestIdx;
}

import { calculateAllStats } from './StatCalculator.js';

/**
 * Calcula stats a partir de base stats y nivel
 * @param {Object} baseStats - Stats base de la especie
 * @param {number} level - Nivel actual
 * @param {Object} [bonusStats] - Bonus permanentes
 * @returns {Object} Stats calculados
 */
export function calculateStats(baseStats, level, bonusStats = null) {
  return calculateAllStats(baseStats, level, bonusStats);
}
