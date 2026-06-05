/**
 * EvolutionSystem.js — Sistema de evolución de Pokémon
 */

import { calculateStats } from './ExperienceSystem.js';

/**
 * Verifica si un Pokémon puede evolucionar
 * @param {Object} pokemonInfo - PokemonInfo component
 * @param {Array} evolutionData - Datos de evoluciones (evolutions.json)
 * @param {string|null} itemUsed - ID del item usado (para evoluciones por piedra)
 * @returns {Object|null} Datos de evolución disponible o null
 */
export function checkEvolution(pokemonInfo, evolutionData, itemUsed = null) {
  if (!evolutionData || !Array.isArray(evolutionData)) return null;

  for (const evo of evolutionData) {
    if (evo.from !== pokemonInfo.speciesId) continue;

    // Evolución por nivel
    if (evo.trigger === 'level' && !itemUsed) {
      if (pokemonInfo.level >= evo.level) {
        return evo;
      }
    }

    // Evolución por piedra
    if (evo.trigger === 'item' && itemUsed === evo.item) {
      return evo;
    }
  }

  return null;
}

/**
 * Ejecuta la evolución de un Pokémon
 * @param {number} entityId - ID de la entidad
 * @param {Object} evolution - Datos de evolución (de checkEvolution)
 * @param {Object} entityManager - EntityManager
 * @param {Array} pokemonDB - Base de datos de Pokémon
 * @param {Array} movesDB - Base de datos de movimientos
 * @returns {Object} { success, oldName, newName, newSpeciesId, messages }
 */
export function evolve(entityId, evolution, entityManager, pokemonDB, movesDB) {
  const pokemonInfo = entityManager.getComponent(entityId, 'pokemonInfo');
  const fighter = entityManager.getComponent(entityId, 'fighter');
  const sprite = entityManager.getComponent(entityId, 'sprite');
  
  if (!pokemonInfo || !fighter) {
    return { success: false, messages: ['Error: entidad inválida'] };
  }

  const newSpecies = pokemonDB.find(p => p.id === evolution.to);
  if (!newSpecies) {
    return { success: false, messages: ['Error: especie de evolución no encontrada'] };
  }

  const oldName = pokemonInfo.name;
  const messages = [];

  // Actualizar PokemonInfo
  pokemonInfo.speciesId = newSpecies.id;
  pokemonInfo.name = newSpecies.name;
  pokemonInfo.types = newSpecies.types;

  // Recalcular stats con la nueva especie
  const newStats = calculateStats(newSpecies.stats, pokemonInfo.level, fighter.bonusStats);
  const hpPercentage = fighter.hp / fighter.maxHp; // Mantener % de HP

  fighter.maxHp = newStats.maxHp;
  fighter.hp = Math.max(1, Math.floor(newStats.maxHp * hpPercentage));
  fighter.attack = newStats.attack;
  fighter.defense = newStats.defense;
  fighter.spAtk = newStats.spAtk;
  fighter.spDef = newStats.spDef;
  fighter.speed = newStats.speed;

  // Actualizar sprite
  if (sprite) {
    sprite.url = newSpecies.sprite;
    sprite.image = null;
    sprite.loaded = false;
  }

  // Verificar movimientos que la nueva especie debería conocer a este nivel
  if (newSpecies.moves) {
    for (const moveEntry of newSpecies.moves) {
      if (moveEntry.level <= pokemonInfo.level) {
        const alreadyKnown = pokemonInfo.currentMoves.some(m => m.moveId === moveEntry.moveId);
        if (!alreadyKnown && pokemonInfo.currentMoves.length < 4) {
          const moveData = movesDB.find(m => m.id === moveEntry.moveId);
          if (moveData) {
            pokemonInfo.currentMoves.push({
              moveId: moveEntry.moveId,
              currentPP: moveData.pp,
              maxPP: moveData.pp
            });
            messages.push(`¡${pokemonInfo.name} aprendió ${moveData.name}!`);
          }
        }
      }
    }
  }

  // Actualizar componentes
  entityManager.setComponent(entityId, 'pokemonInfo', pokemonInfo);
  entityManager.setComponent(entityId, 'fighter', fighter);
  if (sprite) {
    entityManager.setComponent(entityId, 'sprite', sprite);
  }

  messages.unshift(`¡¿Qué?! ¡${oldName} está evolucionando!`);
  messages.push(`¡${oldName} evolucionó a ${pokemonInfo.name}!`);

  return {
    success: true,
    oldName,
    newName: pokemonInfo.name,
    newSpeciesId: newSpecies.id,
    messages
  };
}

/**
 * Verifica evoluciones para todo el equipo después de subir de nivel
 * @param {Array} partyEntityIds - IDs de entidades del equipo
 * @param {Object} entityManager - EntityManager
 * @param {Array} evolutionData - Datos de evolución
 * @param {Array} pokemonDB - Base de datos de Pokémon
 * @returns {Array} Lista de evoluciones pendientes [{entityId, evolution}]
 */
export function checkPartyEvolutions(partyEntityIds, entityManager, evolutionData, pokemonDB) {
  const pendingEvolutions = [];

  for (const entityId of partyEntityIds) {
    const pokemonInfo = entityManager.getComponent(entityId, 'pokemonInfo');
    if (!pokemonInfo) continue;

    const evo = checkEvolution(pokemonInfo, evolutionData);
    if (evo) {
      pendingEvolutions.push({ entityId, evolution: evo });
    }
  }

  return pendingEvolutions;
}
