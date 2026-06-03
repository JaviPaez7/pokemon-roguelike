/**
 * CombatSystem.js — Sistema de combate por turnos
 * Calcula daño, efectividad de tipos, STAB, críticos
 */

import { COLORS } from '../constants.js';

/**
 * Calcula el daño de un movimiento
 * Fórmula basada en Gen 1 (simplificada para roguelike)
 * @param {Object} attacker - Fighter component del atacante
 * @param {Object} defender - Fighter component del defensor
 * @param {Object} move - Datos del movimiento
 * @param {Object} attackerInfo - PokemonInfo del atacante
 * @param {Object} defenderInfo - PokemonInfo del defensor
 * @param {Object} typeChart - Matriz de efectividad de tipos
 * @returns {Object} { damage, effectiveness, isCritical, isSTAB, messages }
 */
export function calculateDamage(attacker, defender, move, attackerInfo, defenderInfo, typeChart) {
  const result = {
    damage: 0,
    effectiveness: 1,
    isCritical: false,
    isSTAB: false,
    messages: []
  };

  // Movimientos de estado no hacen daño
  if (move.damageClass === 'status' || move.power === null || move.power === 0) {
    return result;
  }

  // Verificar precisión
  if (move.accuracy !== null && move.accuracy < 100) {
    const hitRoll = Math.random() * 100;
    if (hitRoll > move.accuracy) {
      result.messages.push('¡El ataque falló!');
      return result;
    }
  }

  // Determinar stats ofensivo/defensivo según clase de daño
  let atk, def;
  if (move.damageClass === 'physical') {
    atk = attacker.attack;
    def = defender.defense;
  } else {
    atk = attacker.spAtk;
    def = defender.spDef;
  }

  // Aplicar modificadores de stats
  if (attacker.statModifiers) {
    atk = applyStatModifier(atk, attacker.statModifiers.attack || 0);
  }
  if (defender.statModifiers) {
    def = applyStatModifier(def, defender.statModifiers.defense || 0);
  }

  // Fórmula de daño base
  const level = attackerInfo.level;
  let damage = Math.floor(
    ((2 * level / 5 + 2) * move.power * (atk / def)) / 50 + 2
  );

  // STAB (Same Type Attack Bonus)
  if (attackerInfo.types.includes(move.type)) {
    damage = Math.floor(damage * 1.5);
    result.isSTAB = true;
  }

  // Efectividad de tipos
  let effectiveness = 1;
  for (const defType of defenderInfo.types) {
    const mult = getTypeMultiplier(typeChart, move.type, defType);
    effectiveness *= mult;
  }
  damage = Math.floor(damage * effectiveness);
  result.effectiveness = effectiveness;

  // Mensajes de efectividad
  if (effectiveness > 1) {
    result.messages.push('¡Es super eficaz!');
  } else if (effectiveness > 0 && effectiveness < 1) {
    result.messages.push('No es muy eficaz...');
  } else if (effectiveness === 0) {
    result.messages.push('No afecta al Pokémon enemigo...');
    result.damage = 0;
    return result;
  }

  // Crítico (probabilidad basada en speed / 512)
  const critRate = Math.min(attacker.speed / 512, 0.25); // máximo 25%
  if (Math.random() < critRate) {
    damage = Math.floor(damage * 1.5);
    result.isCritical = true;
    result.messages.push('¡Golpe crítico!');
  }

  // Variación aleatoria (85% - 100%)
  const randomFactor = 0.85 + Math.random() * 0.15;
  damage = Math.max(1, Math.floor(damage * randomFactor));

  result.damage = damage;
  return result;
}

/**
 * Obtiene el multiplicador de efectividad de tipo
 * @param {Object} typeChart - { chart: { attackType: { defType: multiplier } } }
 * @param {string} attackType - Tipo del movimiento
 * @param {string} defenseType - Tipo del defensor
 * @returns {number} Multiplicador (0, 0.5, 1, o 2)
 */
function getTypeMultiplier(typeChart, attackType, defenseType) {
  if (!typeChart || !typeChart.chart) return 1;
  const attackRow = typeChart.chart[attackType];
  if (!attackRow) return 1;
  const mult = attackRow[defenseType];
  return mult !== undefined ? mult : 1;
}

/**
 * Aplica modificador de stat (como stat stages de Pokémon)
 * Stage -6 a +6, cada stage es ×1.5 o ÷1.5
 * @param {number} baseStat - Stat base
 * @param {number} stage - Nivel de modificador (-6 a +6)
 * @returns {number} Stat modificado
 */
function applyStatModifier(baseStat, stage) {
  const clampedStage = Math.max(-6, Math.min(6, stage));
  if (clampedStage >= 0) {
    return Math.floor(baseStat * (2 + clampedStage) / 2);
  } else {
    return Math.floor(baseStat * 2 / (2 - clampedStage));
  }
}

/**
 * Ejecuta un movimiento completo
 * @param {Object} params
 * @param {number} params.attackerId - ID del atacante
 * @param {number} params.defenderId - ID del defensor
 * @param {Object} params.move - Datos del movimiento
 * @param {Object} params.entityManager - EntityManager
 * @param {Object} params.typeChart - Datos de tipos
 * @param {Object} params.eventBus - EventBus
 * @returns {Object} { success, damage, effectiveness, messages, defenderFainted }
 */
export function executeMove(params) {
  const { attackerId, defenderId, move, entityManager, typeChart, eventBus } = params;
  
  const attackerFighter = entityManager.getComponent(attackerId, 'fighter');
  const defenderFighter = entityManager.getComponent(defenderId, 'fighter');
  const attackerInfo = entityManager.getComponent(attackerId, 'pokemonInfo');
  const defenderInfo = entityManager.getComponent(defenderId, 'pokemonInfo');

  if (!attackerFighter || !defenderFighter || !attackerInfo || !defenderInfo) {
    return { success: false, damage: 0, messages: ['Error: entidad inválida'], defenderFainted: false };
  }

  const messages = [];
  messages.push(`¡${attackerInfo.name} usó ${move.name}!`);

  // Reducir PP del movimiento
  const moveSlot = attackerInfo.currentMoves.find(m => m.moveId === move.id);
  if (moveSlot) {
    if (moveSlot.currentPP <= 0) {
      return { success: false, damage: 0, messages: ['¡No quedan PP para este movimiento!'], defenderFainted: false };
    }
    moveSlot.currentPP--;
  }

  // Calcular daño
  const result = calculateDamage(attackerFighter, defenderFighter, move, attackerInfo, defenderInfo, typeChart);
  messages.push(...result.messages);

  // Aplicar daño
  if (result.damage > 0) {
    defenderFighter.hp = Math.max(0, defenderFighter.hp - result.damage);
    messages.push(`¡Hizo ${result.damage} de daño!`);
    
    // Emitir evento de daño
    if (eventBus) {
      eventBus.emit('damage_dealt', {
        attackerId,
        defenderId,
        damage: result.damage,
        effectiveness: result.effectiveness,
        isCritical: result.isCritical
      });
    }
  }

  // Aplicar efectos secundarios del movimiento
  if (move.effect && result.damage > 0) {
    const effectApplied = tryApplyEffect(move, defenderFighter, defenderInfo, messages);
    if (effectApplied && eventBus) {
      eventBus.emit('status_applied', { targetId: defenderId, effect: move.effect });
    }
  }

  // Verificar si el defensor cayó
  const defenderFainted = defenderFighter.hp <= 0;
  if (defenderFainted) {
    messages.push(`¡${defenderInfo.name} se debilitó!`);
    if (eventBus) {
      eventBus.emit('pokemon_fainted', { entityId: defenderId, speciesId: defenderInfo.speciesId });
    }
  }

  // Actualizar componentes
  entityManager.setComponent(attackerId, 'pokemonInfo', attackerInfo);
  entityManager.setComponent(defenderId, 'fighter', defenderFighter);

  return {
    success: true,
    damage: result.damage,
    effectiveness: result.effectiveness,
    isCritical: result.isCritical,
    isSTAB: result.isSTAB,
    messages,
    defenderFainted
  };
}

/**
 * Intenta aplicar un efecto secundario
 * @param {Object} move - Datos del movimiento
 * @param {Object} targetFighter - Fighter del objetivo
 * @param {Object} targetInfo - PokemonInfo del objetivo
 * @param {string[]} messages - Array de mensajes para añadir
 * @returns {boolean} Si el efecto se aplicó
 */
function tryApplyEffect(move, targetFighter, targetInfo, messages) {
  const chance = move.effectChance || 100;
  if (Math.random() * 100 > chance) return false;

  // Inicializar statusEffects si no existe
  if (!targetFighter.statusEffects) {
    targetFighter.statusEffects = [];
  }

  switch (move.effect) {
    case 'burn':
      if (!targetFighter.statusEffects.includes('burn') && !targetInfo.types.includes('fire')) {
        targetFighter.statusEffects.push('burn');
        messages.push(`¡${targetInfo.name} se quemó!`);
        return true;
      }
      break;
    case 'paralyze':
      if (!targetFighter.statusEffects.includes('paralyze') && !targetInfo.types.includes('electric')) {
        targetFighter.statusEffects.push('paralyze');
        messages.push(`¡${targetInfo.name} está paralizado!`);
        return true;
      }
      break;
    case 'poison':
      if (!targetFighter.statusEffects.includes('poison') && 
          !targetInfo.types.includes('poison') && !targetInfo.types.includes('steel')) {
        targetFighter.statusEffects.push('poison');
        messages.push(`¡${targetInfo.name} fue envenenado!`);
        return true;
      }
      break;
    case 'freeze':
      if (!targetFighter.statusEffects.includes('freeze') && !targetInfo.types.includes('ice')) {
        targetFighter.statusEffects.push('freeze');
        messages.push(`¡${targetInfo.name} fue congelado!`);
        return true;
      }
      break;
    case 'sleep':
      if (!targetFighter.statusEffects.includes('sleep')) {
        targetFighter.statusEffects.push('sleep');
        targetFighter.sleepTurns = Math.floor(Math.random() * 3) + 1;
        messages.push(`¡${targetInfo.name} se durmió!`);
        return true;
      }
      break;
    case 'confuse':
      if (!targetFighter.statusEffects.includes('confuse')) {
        targetFighter.statusEffects.push('confuse');
        targetFighter.confuseTurns = Math.floor(Math.random() * 4) + 1;
        messages.push(`¡${targetInfo.name} está confuso!`);
        return true;
      }
      break;
    case 'flinch':
      targetFighter.flinched = true;
      return true;
    case 'stat_down_attack':
      if (!targetFighter.statModifiers) targetFighter.statModifiers = {};
      targetFighter.statModifiers.attack = (targetFighter.statModifiers.attack || 0) - 1;
      messages.push(`¡El Ataque de ${targetInfo.name} bajó!`);
      return true;
    case 'stat_down_defense':
      if (!targetFighter.statModifiers) targetFighter.statModifiers = {};
      targetFighter.statModifiers.defense = (targetFighter.statModifiers.defense || 0) - 1;
      messages.push(`¡La Defensa de ${targetInfo.name} bajó!`);
      return true;
    case 'stat_down_speed':
      if (!targetFighter.statModifiers) targetFighter.statModifiers = {};
      targetFighter.statModifiers.speed = (targetFighter.statModifiers.speed || 0) - 1;
      messages.push(`¡La Velocidad de ${targetInfo.name} bajó!`);
      return true;
    case 'stat_up_attack':
      if (!targetFighter.statModifiers) targetFighter.statModifiers = {};
      targetFighter.statModifiers.attack = (targetFighter.statModifiers.attack || 0) + 1;
      messages.push(`¡El Ataque de ${targetInfo.name} subió!`);
      return true;
    case 'heal_self':
      // Este efecto se aplica al atacante, no al defensor
      break;
    case 'recoil':
      // El daño de retroceso se maneja aparte
      break;
  }
  return false;
}

/**
 * Procesa efectos de estado al inicio del turno de una entidad
 * @param {number} entityId - ID de la entidad
 * @param {Object} entityManager - EntityManager
 * @returns {Object} { canAct, damage, messages }
 */
export function processStatusEffects(entityId, entityManager) {
  const fighter = entityManager.getComponent(entityId, 'fighter');
  const info = entityManager.getComponent(entityId, 'pokemonInfo');
  
  if (!fighter || !info) return { canAct: true, damage: 0, messages: [] };

  const messages = [];
  let canAct = true;
  let statusDamage = 0;

  if (!fighter.statusEffects) fighter.statusEffects = [];

  // Quemadura: daño continuo + reduce ataque físico
  if (fighter.statusEffects.includes('burn')) {
    statusDamage = Math.max(1, Math.floor(fighter.maxHp / 16));
    fighter.hp = Math.max(0, fighter.hp - statusDamage);
    messages.push(`${info.name} sufre por la quemadura (-${statusDamage} PS)`);
  }

  // Veneno: daño continuo
  if (fighter.statusEffects.includes('poison')) {
    statusDamage = Math.max(1, Math.floor(fighter.maxHp / 8));
    fighter.hp = Math.max(0, fighter.hp - statusDamage);
    messages.push(`${info.name} sufre por el veneno (-${statusDamage} PS)`);
  }

  // Parálisis: 25% de no poder actuar
  if (fighter.statusEffects.includes('paralyze')) {
    if (Math.random() < 0.25) {
      canAct = false;
      messages.push(`¡${info.name} está paralizado y no puede moverse!`);
    }
  }

  // Congelación: no puede actuar, 20% de descongelarse
  if (fighter.statusEffects.includes('freeze')) {
    if (Math.random() < 0.2) {
      fighter.statusEffects = fighter.statusEffects.filter(s => s !== 'freeze');
      messages.push(`¡${info.name} se descongeló!`);
    } else {
      canAct = false;
      messages.push(`¡${info.name} está congelado!`);
    }
  }

  // Sueño: no puede actuar, cuenta atrás
  if (fighter.statusEffects.includes('sleep')) {
    if (fighter.sleepTurns && fighter.sleepTurns > 0) {
      fighter.sleepTurns--;
      canAct = false;
      messages.push(`${info.name} está dormido...`);
    } else {
      fighter.statusEffects = fighter.statusEffects.filter(s => s !== 'sleep');
      messages.push(`¡${info.name} se despertó!`);
    }
  }

  // Confusión: puede golpearse a sí mismo
  if (fighter.statusEffects.includes('confuse')) {
    if (fighter.confuseTurns && fighter.confuseTurns > 0) {
      fighter.confuseTurns--;
      messages.push(`${info.name} está confuso...`);
      if (Math.random() < 0.33) {
        const selfDamage = Math.max(1, Math.floor(fighter.attack / 4));
        fighter.hp = Math.max(0, fighter.hp - selfDamage);
        messages.push(`¡Se hirió a sí mismo! (-${selfDamage} PS)`);
        canAct = false;
      }
    } else {
      fighter.statusEffects = fighter.statusEffects.filter(s => s !== 'confuse');
      messages.push(`¡${info.name} ya no está confuso!`);
    }
  }

  // Flinch: resetear al final del turno
  if (fighter.flinched) {
    canAct = false;
    fighter.flinched = false;
    messages.push(`¡${info.name} retrocedió!`);
  }

  // Actualizar componente
  entityManager.setComponent(entityId, 'fighter', fighter);

  return { canAct, damage: statusDamage, messages };
}

/**
 * Selecciona el mejor movimiento para un enemigo
 * @param {Object} attackerInfo - PokemonInfo del atacante
 * @param {Object} defenderInfo - PokemonInfo del defensor
 * @param {Object} movesData - Datos de movimientos (moves.json)
 * @param {Object} typeChart - Datos de tipos
 * @returns {Object|null} Mejor movimiento disponible
 */
export function selectBestMove(attackerInfo, defenderInfo, movesData, typeChart) {
  if (!attackerInfo.currentMoves || attackerInfo.currentMoves.length === 0) return null;

  let bestMove = null;
  let bestScore = -1;

  for (const moveSlot of attackerInfo.currentMoves) {
    if (moveSlot.currentPP <= 0) continue;

    const moveData = movesData.find(m => m.id === moveSlot.moveId);
    if (!moveData) continue;

    let score = moveData.power || 0;

    // Bonus por STAB
    if (attackerInfo.types.includes(moveData.type)) {
      score *= 1.5;
    }

    // Bonus por efectividad
    let effectiveness = 1;
    for (const defType of defenderInfo.types) {
      const mult = getTypeMultiplier(typeChart, moveData.type, defType);
      effectiveness *= mult;
    }
    score *= effectiveness;

    // Penalización por baja precisión
    if (moveData.accuracy && moveData.accuracy < 100) {
      score *= moveData.accuracy / 100;
    }

    // Añadir algo de aleatoriedad para variedad
    score *= (0.8 + Math.random() * 0.4);

    if (score > bestScore) {
      bestScore = score;
      bestMove = moveData;
    }
  }

  // Si no hay movimiento ofensivo, usar el primero disponible
  if (!bestMove) {
    for (const moveSlot of attackerInfo.currentMoves) {
      if (moveSlot.currentPP > 0) {
        bestMove = movesData.find(m => m.id === moveSlot.moveId);
        if (bestMove) break;
      }
    }
  }

  return bestMove;
}
