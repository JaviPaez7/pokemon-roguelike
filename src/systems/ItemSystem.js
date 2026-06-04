/**
 * ItemSystem.js — Sistema de objetos: spawn, pickup, uso
 */

import { grantExperience, expForLevel } from './ExperienceSystem.js';

/**
 * Genera items en un piso
 * @param {Array} itemPoints - Posiciones válidas [{x,y}]
 * @param {number} count - Cantidad de items a generar
 * @param {Array} itemsDB - Base de datos de items (items.json)
 * @param {Object} entityManager - EntityManager
 * @returns {Array} IDs de entidades item creadas
 */
export function spawnItems(itemPoints, count, itemsDB, entityManager) {
  const createdItems = [];
  const availablePoints = [...itemPoints];
  
  // Barajar posiciones
  for (let i = availablePoints.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [availablePoints[i], availablePoints[j]] = [availablePoints[j], availablePoints[i]];
  }

  const actualCount = Math.min(count, availablePoints.length);

  for (let i = 0; i < actualCount; i++) {
    const point = availablePoints[i];
    const item = selectRandomItem(itemsDB);
    if (item) {
      const entityId = entityManager.createItemEntity(item.id, 1, point.x, point.y, item.spriteUrl);
      createdItems.push(entityId);
    }
  }

  return createdItems;
}

/**
 * Selecciona un item aleatorio basado en rareza
 * @param {Array} itemsDB - Base de datos de items
 * @returns {Object|null} Item seleccionado
 */
function selectRandomItem(itemsDB) {
  if (!itemsDB || itemsDB.length === 0) return null;

  // Calcular peso total basado en rareza
  const totalWeight = itemsDB.reduce((sum, item) => sum + (item.rarity || 0.1), 0);
  let roll = Math.random() * totalWeight;

  for (const item of itemsDB) {
    roll -= (item.rarity || 0.1);
    if (roll <= 0) return item;
  }

  return itemsDB[0]; // Fallback
}

/**
 * Recoge un item del suelo
 * @param {number} playerEntityId - ID del jugador
 * @param {number} itemEntityId - ID de la entidad item
 * @param {Object} entityManager - EntityManager
 * @param {Object} inventory - Inventario del jugador
 * @param {number} maxInventory - Tamaño máximo del inventario
 * @returns {Object} { success, message, item }
 */
export function pickupItem(playerEntityId, itemEntityId, entityManager, inventory, maxInventory) {
  const itemDrop = entityManager.getComponent(itemEntityId, 'itemDrop');
  if (!itemDrop) {
    return { success: false, message: 'No hay nada que recoger.' };
  }

  if (inventory.length >= maxInventory) {
    return { success: false, message: '¡La mochila está llena!' };
  }

  // Buscar si ya tiene el mismo item (para apilar)
  const existingSlot = inventory.find(slot => slot.itemId === itemDrop.itemId);
  if (existingSlot) {
    existingSlot.quantity += itemDrop.quantity;
  } else {
    inventory.push({ itemId: itemDrop.itemId, quantity: itemDrop.quantity });
  }

  // Destruir la entidad del item en el suelo
  entityManager.destroyEntity(itemEntityId);

  return { success: true, message: `¡Recogiste ${itemDrop.itemId}!`, item: itemDrop };
}

/**
 * Usa un item del inventario
 * @param {string} itemId - ID del item a usar
 * @param {number} targetEntityId - ID de la entidad objetivo
 * @param {Object} entityManager - EntityManager
 * @param {Object} inventory - Inventario del jugador
 * @param {Array} itemsDB - Base de datos de items
 * @returns {Object} { success, messages, consumed }
 */
export function useItem(itemId, targetEntityId, entityManager, inventory, itemsDB, pokemonDB = null, movesDB = null) {
  const messages = [];
  
  // Buscar item en inventario
  const slot = inventory.find(s => s.itemId === itemId);
  if (!slot || slot.quantity <= 0) {
    return { success: false, messages: ['¡No tienes ese objeto!'], consumed: false };
  }

  // Buscar datos del item
  const itemData = itemsDB.find(i => i.id === itemId);
  if (!itemData) {
    return { success: false, messages: ['Item no encontrado'], consumed: false };
  }

  const fighter = entityManager.getComponent(targetEntityId, 'fighter');
  const pokemonInfo = entityManager.getComponent(targetEntityId, 'pokemonInfo');
  
  if (!fighter || !pokemonInfo) {
    return { success: false, messages: ['Objetivo inválido'], consumed: false };
  }

  let consumed = false;

  switch (itemData.type) {
    case 'heal': {
      if (fighter.hp >= fighter.maxHp) {
        messages.push(`¡${pokemonInfo.name} ya tiene los PS al máximo!`);
        break;
      }
      const oldHp = fighter.hp;
      fighter.hp = Math.min(fighter.maxHp, fighter.hp + itemData.value);
      const healed = fighter.hp - oldHp;
      messages.push(`¡${pokemonInfo.name} recuperó ${healed} PS!`);
      consumed = true;
      break;
    }

    case 'heal_percent': {
      if (fighter.hp >= fighter.maxHp) {
        messages.push(`¡${pokemonInfo.name} ya tiene los PS al máximo!`);
        break;
      }
      const healAmount = Math.floor(fighter.maxHp * itemData.value / 100);
      const oldHp2 = fighter.hp;
      fighter.hp = Math.min(fighter.maxHp, fighter.hp + healAmount);
      const healed2 = fighter.hp - oldHp2;
      messages.push(`¡${pokemonInfo.name} recuperó ${healed2} PS!`);
      consumed = true;
      break;
    }

    case 'full_restore': {
      fighter.hp = fighter.maxHp;
      fighter.statusEffects = [];
      messages.push(`¡${pokemonInfo.name} fue completamente restaurado!`);
      consumed = true;
      break;
    }

    case 'revive': {
      if (fighter.hp > 0) {
        messages.push(`¡${pokemonInfo.name} no está debilitado!`);
        break;
      }
      fighter.hp = Math.floor(fighter.maxHp * itemData.value / 100);
      fighter.statusEffects = [];
      messages.push(`¡${pokemonInfo.name} fue revivido con ${fighter.hp} PS!`);
      consumed = true;
      break;
    }

    case 'pp_restore': {
      // Restaurar PP del primer movimiento que no esté lleno
      let restored = false;
      for (const move of pokemonInfo.currentMoves) {
        if (move.currentPP < move.maxPP) {
          move.currentPP = Math.min(move.maxPP, move.currentPP + itemData.value);
          restored = true;
          messages.push(`¡Se restauraron PP!`);
          break;
        }
      }
      if (!restored) {
        messages.push('¡Todos los PP están al máximo!');
      } else {
        consumed = true;
      }
      break;
    }

    case 'pp_restore_full': {
      let anyRestored = false;
      for (const move of pokemonInfo.currentMoves) {
        if (move.currentPP < move.maxPP) {
          move.currentPP = move.maxPP;
          anyRestored = true;
        }
      }
      if (anyRestored) {
        messages.push('¡Se restauraron todos los PP!');
        consumed = true;
      } else {
        messages.push('¡Todos los PP están al máximo!');
      }
      break;
    }

    case 'stat_boost': {
      if (!fighter.statModifiers) fighter.statModifiers = {};
      const stat = itemData.stat;
      const current = fighter.statModifiers[stat] || 0;
      if (current >= 6) {
        messages.push(`¡${pokemonInfo.name} ya tiene el ${stat} al máximo!`);
        break;
      }
      fighter.statModifiers[stat] = Math.min(6, current + (itemData.stages || 1));
      messages.push(`¡El ${stat} de ${pokemonInfo.name} subió!`);
      consumed = true;
      break;
    }

    case 'capture': {
      // La captura se maneja en CaptureSystem, no aquí
      messages.push('Usa la Poké Ball en combate.');
      break;
    }

    case 'evolution_stone': {
      // La evolución por piedra se maneja en EvolutionSystem
      messages.push('Selecciona un Pokémon para evolucionar.');
      break;
    }

    case 'escape': {
      // Escapar de la mazmorra - se maneja en Game.js
      messages.push('¡Escapaste de la mazmorra!');
      consumed = true;
      break;
    }

    case 'food': {
      if (fighter.belly === undefined) {
        messages.push(`¡${pokemonInfo.name} no tiene hambre!`);
        break;
      }
      
      let maxBoost = itemData.maxBellyBonus || 0;
      if (maxBoost > 0) {
        fighter.maxBelly += maxBoost;
        messages.push(`¡La tripa máxima de ${pokemonInfo.name} aumentó en ${maxBoost}!`);
      }
      
      if (fighter.belly >= fighter.maxBelly && maxBoost === 0) {
        messages.push(`¡La tripa de ${pokemonInfo.name} ya está llena!`);
        break;
      }
      
      const oldBelly = fighter.belly;
      fighter.belly = Math.min(fighter.maxBelly, fighter.belly + itemData.value);
      const restored = Math.floor(fighter.belly - oldBelly);
      
      messages.push(`¡${pokemonInfo.name} comió ${itemData.name} y recuperó ${restored} de tripa!`);
      consumed = true;
      break;
    }

    case 'status_cure': {
      const cures = itemData.cures;
      if (cures === 'all') {
        if (!fighter.statusEffects || fighter.statusEffects.length === 0) {
          messages.push(`¡${pokemonInfo.name} no tiene ningún problema de estado!`);
          break;
        }
        fighter.statusEffects = [];
        messages.push(`¡Se curaron todos los problemas de estado de ${pokemonInfo.name}!`);
        consumed = true;
      } else {
        const hasStatus = fighter.statusEffects && fighter.statusEffects.some(s => s.type === cures);
        if (!hasStatus) {
          const statusNames = {
            poison: 'envenenamiento',
            paralyze: 'parálisis',
            burn: 'quemadura',
            sleep: 'sueño',
            freeze: 'congelación',
            confuse: 'confusión'
          };
          const statusName = statusNames[cures] || cures;
          messages.push(`¡${pokemonInfo.name} no sufre de ${statusName}!`);
          break;
        }
        fighter.statusEffects = fighter.statusEffects.filter(s => s.type !== cures);
        const statusNames = {
          poison: 'envenenamiento',
          paralyze: 'parálisis',
          burn: 'quemadura',
          sleep: 'sueño',
          freeze: 'congelación',
          confuse: 'confusión'
        };
        const statusName = statusNames[cures] || cures;
        messages.push(`¡${pokemonInfo.name} se curó de su ${statusName}!`);
        consumed = true;
      }
      break;
    }

    case 'level_up': {
      if (!pokemonDB || !movesDB) {
        messages.push('Error: Base de datos no disponible.');
        break;
      }
      if (pokemonInfo.level >= 100) {
        messages.push(`¡${pokemonInfo.name} ya está al nivel máximo (100)!`);
        break;
      }
      const levelsToAdd = itemData.value || 1;
      const targetLevel = Math.min(100, pokemonInfo.level + levelsToAdd);
      const xpNeeded = expForLevel(targetLevel) - (pokemonInfo.xp || 0);
      
      const expResult = grantExperience(pokemonInfo, fighter, xpNeeded, pokemonDB, movesDB);
      messages.push(...expResult.messages);
      consumed = true;
      break;
    }

    default:
      messages.push('No se puede usar este objeto.');
  }

  // Consumir item
  if (consumed) {
    slot.quantity--;
    if (slot.quantity <= 0) {
      const idx = inventory.indexOf(slot);
      if (idx > -1) inventory.splice(idx, 1);
    }
    entityManager.setComponent(targetEntityId, 'fighter', fighter);
    entityManager.setComponent(targetEntityId, 'pokemonInfo', pokemonInfo);
  }

  return { success: consumed, messages, consumed };
}

/**
 * Obtiene el nombre localizado de un item
 * @param {string} itemId - ID del item
 * @param {Array} itemsDB - Base de datos de items
 * @returns {string} Nombre del item
 */
export function getItemName(itemId, itemsDB) {
  const item = itemsDB.find(i => i.id === itemId);
  return item ? item.name : itemId;
}
