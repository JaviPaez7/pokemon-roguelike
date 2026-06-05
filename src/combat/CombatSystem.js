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
export function calculateDamage(attacker, defender, move, attackerInfo, defenderInfo, typeChart, currentWeather = 'normal') {
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

  // Habilidades Pasivas: Inmunidades
  if (defenderInfo.ability === 'levitate' && move.type === 'ground') {
    result.messages.push('¡No afecta al Pokémon enemigo gracias a Levitación!');
    result.damage = 0;
    return result;
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

  // Habilidades Pasivas de Aumento de Daño
  const hpPercent = attacker.hp / attacker.maxHp;
  if (hpPercent <= 0.33) {
    if (attackerInfo.ability === 'overgrow' && move.type === 'grass') {
      damage = Math.floor(damage * 1.5);
      result.messages.push('¡La habilidad Espesura potencia el ataque!');
    } else if (attackerInfo.ability === 'blaze' && move.type === 'fire') {
      damage = Math.floor(damage * 1.5);
      result.messages.push('¡La habilidad Mar Llamas potencia el ataque!');
    } else if (attackerInfo.ability === 'torrent' && move.type === 'water') {
      damage = Math.floor(damage * 1.5);
      result.messages.push('¡La habilidad Torrente potencia el ataque!');
    } else if (attackerInfo.ability === 'swarm' && move.type === 'bug') {
      damage = Math.floor(damage * 1.5);
      result.messages.push('¡La habilidad Enjambre potencia el ataque!');
    }
  }

  // Habilidad Agallas (Guts)
  if (attackerInfo.ability === 'guts' && attacker.statusEffects && attacker.statusEffects.length > 0 && move.damageClass === 'physical') {
    damage = Math.floor(damage * 1.5);
    result.messages.push('¡La habilidad Agallas potencia el ataque!');
  }

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

  // Modificador de clima
  if (currentWeather === 'lluvia') {
    if (move.type === 'water') {
      damage = Math.floor(damage * 1.3);
      result.messages.push('¡La lluvia potencia los ataques de Agua! 🌧️');
    } else if (move.type === 'fire') {
      damage = Math.floor(damage * 0.7);
      result.messages.push('¡La lluvia debilita los ataques de Fuego! 🌧️');
    }
  } else if (currentWeather === 'sol') {
    if (move.type === 'fire') {
      damage = Math.floor(damage * 1.3);
      result.messages.push('¡El sol radiante potencia los ataques de Fuego! ☀️');
    } else if (move.type === 'water') {
      damage = Math.floor(damage * 0.7);
      result.messages.push('¡El sol radiante debilita los ataques de Agua! ☀️');
    }
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
  const { attackerId, defenderId, move, entityManager, typeChart, eventBus, currentWeather } = params;
  
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

  let hits = 1;
  if (move.effect === 'multi_hit') {
    const rand = Math.random();
    if (rand < 0.35) hits = 2;
    else if (rand < 0.70) hits = 3;
    else if (rand < 0.85) hits = 4;
    else hits = 5;
  }

  let totalDamage = 0;
  let effectiveness = 1;
  let isSTAB = false;
  let defenderFainted = false;

  for (let i = 0; i < hits; i++) {
    if (defenderFainted) break;

    // Calcular daño
    const result = calculateDamage(attackerFighter, defenderFighter, move, attackerInfo, defenderInfo, typeChart, currentWeather);
    
    // Solo mostramos los mensajes de efectividad en el primer golpe
    if (i === 0) {
      messages.push(...result.messages.filter(m => m !== '¡Golpe crítico!' && m !== '¡El ataque falló!'));
      effectiveness = result.effectiveness;
      isSTAB = result.isSTAB;
    }
    
    if (result.messages.includes('¡El ataque falló!')) {
      if (hits > 1 && i > 0) break; // Si falla a mitad de multi-hit, se detiene
      if (i === 0) messages.push('¡El ataque falló!');
      break;
    }

    if (result.messages.includes('¡Golpe crítico!')) {
      messages.push('¡Golpe crítico!');
    }

    if (result.damage > 0) {
      // Habilidad Sturdy (Robustez)
      if (defenderInfo.ability === 'sturdy' && defenderFighter.hp === defenderFighter.maxHp && result.damage >= defenderFighter.maxHp) {
        result.damage = defenderFighter.maxHp - 1;
        messages.push(`¡La habilidad Robustez de ${defenderInfo.name} evitó el K.O. directo!`);
      }

      defenderFighter.hp = Math.max(0, defenderFighter.hp - result.damage);
      totalDamage += result.damage;
      
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

      // Habilidades pasivas defensivas (Static, Poison Point) al recibir daño físico
      if (move.damageClass === 'physical' && Math.random() < 0.3) {
        if (defenderInfo.ability === 'static' && (!attackerFighter.statusEffects || !attackerFighter.statusEffects.some(s => s.type === 'paralyze'))) {
          if (!attackerFighter.statusEffects) attackerFighter.statusEffects = [];
          attackerFighter.statusEffects.push({ type: 'paralyze', duration: 3 });
          messages.push(`¡${attackerInfo.name} se paralizó por la habilidad Elec. Estática de ${defenderInfo.name}!`);
          if (eventBus) eventBus.emit('status_applied', { targetId: attackerId, effect: 'paralyze' });
        } else if (defenderInfo.ability === 'poison_point' && (!attackerFighter.statusEffects || !attackerFighter.statusEffects.some(s => s.type === 'poison'))) {
          if (!attackerFighter.statusEffects) attackerFighter.statusEffects = [];
          attackerFighter.statusEffects.push({ type: 'poison', duration: 5 });
          messages.push(`¡${attackerInfo.name} fue envenenado por la habilidad Punto Tóxico de ${defenderInfo.name}!`);
          if (eventBus) eventBus.emit('status_applied', { targetId: attackerId, effect: 'poison' });
        }
      }

      // Habilidad Synchronize (Sincronía): No implementada completamente aquí para estados, pero podemos añadir un log.

      // Aplicar efectos secundarios del movimiento (solo una vez)
      if (move.effect && move.effect !== 'multi_hit' && i === 0) {
        const effectApplied = tryApplyEffect(move, defenderFighter, defenderInfo, messages, attackerFighter, attackerInfo, result.damage);
        if (effectApplied && eventBus && move.effect !== 'heal_self' && move.effect !== 'recoil') {
          eventBus.emit('status_applied', { targetId: defenderId, effect: move.effect });
        }
      }
    }

    defenderFainted = defenderFighter.hp <= 0;
  }

  if (totalDamage > 0) {
    if (hits > 1) {
      messages.push(`¡Golpeó ${hits} veces!`);
      messages.push(`¡Hizo un total de ${totalDamage} de daño!`);
    } else {
      messages.push(`¡Hizo ${totalDamage} de daño!`);
    }
  }

  // Verificar si el atacante cayó por retroceso
  const attackerFainted = attackerFighter.hp <= 0;
  if (attackerFainted) {
    let reviverUsed = false;
    if (params.game && entityManager.hasComponent(attackerId, 'partyMember')) {
      const invIndex = params.game.inventory.findIndex(item => item.itemId === 'reviver_seed');
      if (invIndex !== -1) {
        reviverUsed = true;
        params.game.inventory[invIndex].quantity--;
        if (params.game.inventory[invIndex].quantity <= 0) {
          params.game.inventory.splice(invIndex, 1);
        }
        attackerFighter.hp = attackerFighter.maxHp;
        attackerFighter.belly = attackerFighter.maxBelly || 100;
        if (attackerInfo.currentMoves) attackerInfo.currentMoves.forEach(m => m.currentPP = m.maxPP);
        attackerFighter.statusEffects = [];
        messages.push(`¡${attackerInfo.name} se debilitó por el retroceso...`);
        messages.push(`...pero revivió gracias a la Semilla Revivir!`);
        if (params.game.renderer && params.game.renderer.screenFlash) {
          params.game.renderer.screenFlash('rgba(0, 255, 0, 0.4)', 400);
        }
      }
    }

    if (!reviverUsed) {
      messages.push(`¡${attackerInfo.name} se debilitó por el retroceso!`);
      if (eventBus) {
        const pos = entityManager.getComponent(attackerId, 'position');
        const sprite = entityManager.getComponent(attackerId, 'sprite');
        eventBus.emit('pokemon_fainted', { 
          entityId: attackerId, 
          speciesId: attackerInfo.speciesId,
          pos: pos ? { x: pos.x, y: pos.y } : null,
          spriteUrl: sprite ? sprite.url : '',
          attackerId: defenderId // El defensor causó el retroceso
        });
      }
    }
  }

  // Verificar si el defensor cayó
  defenderFainted = defenderFighter.hp <= 0;
  if (defenderFainted) {
    let reviverUsed = false;
    if (params.game && entityManager.hasComponent(defenderId, 'partyMember')) {
      const invIndex = params.game.inventory.findIndex(item => item.itemId === 'reviver_seed');
      if (invIndex !== -1) {
        reviverUsed = true;
        params.game.inventory[invIndex].quantity--;
        if (params.game.inventory[invIndex].quantity <= 0) {
          params.game.inventory.splice(invIndex, 1);
        }
        defenderFighter.hp = defenderFighter.maxHp;
        defenderFighter.belly = defenderFighter.maxBelly || 100;
        if (defenderInfo.currentMoves) defenderInfo.currentMoves.forEach(m => m.currentPP = m.maxPP);
        defenderFighter.statusEffects = [];
        defenderFainted = false;
        messages.push(`¡${defenderInfo.name} se debilitó...`);
        messages.push(`...pero revivió gracias a la Semilla Revivir!`);
        if (params.game.renderer && params.game.renderer.screenFlash) {
          params.game.renderer.screenFlash('rgba(0, 255, 0, 0.4)', 400);
        }
      }
    }

    if (!reviverUsed) {
      messages.push(`¡${defenderInfo.name} se debilitó!`);
      if (eventBus) {
        const pos = entityManager.getComponent(defenderId, 'position');
        const sprite = entityManager.getComponent(defenderId, 'sprite');
        eventBus.emit('pokemon_fainted', { 
          entityId: defenderId, 
          speciesId: defenderInfo.speciesId,
          pos: pos ? { x: pos.x, y: pos.y } : null,
          spriteUrl: sprite ? sprite.url : '',
          attackerId: attackerId // Quien asestó el golpe
        });
      }
    }
  }

  // Actualizar componentes
  entityManager.setComponent(attackerId, 'pokemonInfo', attackerInfo);
  if (attackerFighter && attackerFighter.hp > 0) {
    entityManager.setComponent(attackerId, 'fighter', attackerFighter);
  }
  if (!defenderFainted) {
    entityManager.setComponent(defenderId, 'fighter', defenderFighter);
  }

  return {
    success: true,
    damage: totalDamage,
    effectiveness: effectiveness,
    isCritical: false, // Simplificado para multi-hit
    isSTAB: isSTAB,
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
 * @param {Object} attackerFighter - Fighter del atacante (para recoil/heal)
 * @param {Object} attackerInfo - Info del atacante (para recoil/heal)
 * @param {number} damageDealt - Daño infligido en este turno
 * @returns {boolean} Si el efecto se aplicó
 */
function tryApplyEffect(move, targetFighter, targetInfo, messages, attackerFighter, attackerInfo, damageDealt = 0) {
  const chance = move.effectChance || 100;
  if (Math.random() * 100 > chance) return false;

  // Inicializar statusEffects si no existe
  if (!targetFighter.statusEffects) {
    targetFighter.statusEffects = [];
  }

  switch (move.effect) {
    case 'burn':
      if (!targetFighter.statusEffects.some(s => s.type === 'burn') && !targetInfo.types.includes('fire')) {
        targetFighter.statusEffects.push({ type: 'burn', turnsLeft: -1 });
        messages.push(`¡${targetInfo.name} se quemó!`);
        return true;
      }
      break;
    case 'paralyze':
      if (!targetFighter.statusEffects.some(s => s.type === 'paralyze') && !targetInfo.types.includes('electric')) {
        targetFighter.statusEffects.push({ type: 'paralyze', turnsLeft: -1 });
        messages.push(`¡${targetInfo.name} está paralizado!`);
        return true;
      }
      break;
    case 'poison':
      if (!targetFighter.statusEffects.some(s => s.type === 'poison') && 
          !targetInfo.types.includes('poison') && !targetInfo.types.includes('steel')) {
        targetFighter.statusEffects.push({ type: 'poison', turnsLeft: -1 });
        messages.push(`¡${targetInfo.name} fue envenenado!`);
        return true;
      }
      break;
    case 'freeze':
      if (!targetFighter.statusEffects.some(s => s.type === 'freeze') && !targetInfo.types.includes('ice')) {
        targetFighter.statusEffects.push({ type: 'freeze', turnsLeft: -1 });
        messages.push(`¡${targetInfo.name} fue congelado!`);
        return true;
      }
      break;
    case 'sleep':
      if (!targetFighter.statusEffects.some(s => s.type === 'sleep')) {
        targetFighter.statusEffects.push({ type: 'sleep', turnsLeft: Math.floor(Math.random() * 3) + 1 });
        messages.push(`¡${targetInfo.name} se durmió!`);
        return true;
      }
      break;
    case 'confuse':
      if (!targetFighter.statusEffects.some(s => s.type === 'confuse')) {
        targetFighter.statusEffects.push({ type: 'confuse', turnsLeft: Math.floor(Math.random() * 4) + 1 });
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
      if (attackerFighter) {
        const healAmount = Math.max(1, Math.floor(damageDealt / 2));
        attackerFighter.hp = Math.min(attackerFighter.maxHp, attackerFighter.hp + healAmount);
        messages.push(`¡${attackerInfo.name} recuperó ${healAmount} PS!`);
        return true;
      }
      break;
    case 'recoil':
      // El daño de retroceso se maneja aparte
      if (attackerFighter) {
        const recoilDamage = Math.max(1, Math.floor(damageDealt / 4));
        attackerFighter.hp = Math.max(0, attackerFighter.hp - recoilDamage);
        messages.push(`¡${attackerInfo.name} recibió daño de retroceso! (-${recoilDamage} PS)`);
        return true;
      }
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
  const burn = fighter.statusEffects.find(s => s.type === 'burn');
  if (burn) {
    statusDamage = Math.max(1, Math.floor(fighter.maxHp / 16));
    fighter.hp = Math.max(0, fighter.hp - statusDamage);
    messages.push(`${info.name} sufre por la quemadura (-${statusDamage} PS)`);
  }

  // Veneno: daño continuo
  const poison = fighter.statusEffects.find(s => s.type === 'poison');
  if (poison) {
    statusDamage = Math.max(1, Math.floor(fighter.maxHp / 8));
    fighter.hp = Math.max(0, fighter.hp - statusDamage);
    messages.push(`${info.name} sufre por el veneno (-${statusDamage} PS)`);
  }

  // Parálisis: 25% de no poder actuar
  const paralyze = fighter.statusEffects.find(s => s.type === 'paralyze');
  if (paralyze) {
    if (Math.random() < 0.25) {
      canAct = false;
      messages.push(`¡${info.name} está paralizado y no puede moverse!`);
    }
  }

  // Congelación: no puede actuar, 20% de descongelarse
  const freeze = fighter.statusEffects.find(s => s.type === 'freeze');
  if (freeze) {
    if (Math.random() < 0.2) {
      fighter.statusEffects = fighter.statusEffects.filter(s => s.type !== 'freeze');
      messages.push(`¡${info.name} se descongeló!`);
    } else {
      canAct = false;
      messages.push(`¡${info.name} está congelado!`);
    }
  }

  // Sueño: no puede actuar, cuenta atrás
  const sleep = fighter.statusEffects.find(s => s.type === 'sleep');
  if (sleep) {
    if (sleep.turnsLeft > 0) {
      sleep.turnsLeft--;
      canAct = false;
      messages.push(`${info.name} está dormido...`);
    } else {
      fighter.statusEffects = fighter.statusEffects.filter(s => s.type !== 'sleep');
      messages.push(`¡${info.name} se despertó!`);
    }
  }

  // Confusión: puede golpearse a sí mismo
  const confuse = fighter.statusEffects.find(s => s.type === 'confuse');
  if (confuse) {
    if (confuse.turnsLeft > 0) {
      confuse.turnsLeft--;
      messages.push(`${info.name} está confuso...`);
      if (Math.random() < 0.33) {
        const selfDamage = Math.max(1, Math.floor(fighter.attack / 4));
        fighter.hp = Math.max(0, fighter.hp - selfDamage);
        messages.push(`¡Se hirió a sí mismo! (-${selfDamage} PS)`);
        canAct = false;
      }
    } else {
      fighter.statusEffects = fighter.statusEffects.filter(s => s.type !== 'confuse');
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
 * @param {Object} attackerFighter - Fighter del atacante
 * @param {Object} defenderFighter - Fighter del defensor
 * @returns {Object|null} Mejor movimiento disponible
 */
export function selectBestMove(attackerInfo, defenderInfo, movesData, typeChart, attackerFighter, defenderFighter) {
  if (!attackerInfo.currentMoves || attackerInfo.currentMoves.length === 0) return null;

  let bestMove = null;
  let bestScore = -1;

  for (const moveSlot of attackerInfo.currentMoves) {
    if (moveSlot.currentPP <= 0) continue;

    const moveData = movesData.find(m => m.id === moveSlot.moveId);
    if (!moveData) continue;

    let score = moveData.power || 0;

    // Valorar movimientos de estado
    if (moveData.damageClass === 'status' && moveData.effect) {
      if (moveData.effect === 'heal_self') {
        // Curarse es muy bueno si HP < 50%
        if (attackerFighter && attackerFighter.hp / attackerFighter.maxHp < 0.5) {
          score = 80;
        } else {
          score = 0; // No curarse si la vida está alta
        }
      } else {
        // Otros movimientos de estado (dormir, quemar, bajar stats)
        // Solo usar si el defensor no tiene ya ese estado
        let alreadyHasStatus = false;
        if (defenderFighter && defenderFighter.statusEffects) {
          alreadyHasStatus = defenderFighter.statusEffects.some(s => s.type === moveData.effect);
        }
        if (alreadyHasStatus) {
          score = 0;
        } else {
          score = 50; // Equivalente a un ataque moderado
        }
      }
    }

    // Bonus por STAB para ataques de daño
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
