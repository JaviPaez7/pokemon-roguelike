/**
 * CombatSystem.js — Sistema de combate por turnos
 * Calcula daño, efectividad de tipos, STAB, críticos
 */

import { COLORS } from '../constants.js';
import { getAbility, applyPostAttackAbilities, tryTraceAbility } from './AbilitySystem.js';
import { random } from '../core/Random.js';
import { heldStatMultiplier, heldPreventsStatus, heldName } from '../core/HeldItems.js';
import { hasIqSkill } from '../core/IQ.js';
import { aiCanUse } from '../core/MoveSlots.js';
import { AI_WEIGHTS } from '../core/CombatRules.js';
import { moveRange } from './MoveTargeting.js';

/** Golpes de un movimiento de 2 a 5 golpes (`multi_hit`) y su probabilidad. */
const MULTI_HIT_ODDS = [
  { hits: 2, p: 0.35 },
  { hits: 3, p: 0.35 },
  { hits: 4, p: 0.15 },
  { hits: 5, p: 0.15 },
];

/**
 * Golpes medios por turno de un movimiento: los de dos golpes, 2; los de 2 a 5,
 * 3,1 de media; los que cargan o recargan ocupan dos turnos (0,5).
 * @param {{ effect?: string | null } | null | undefined} move
 * @returns {number}
 */
export function hitsPerTurn(move) {
  if (move?.effect === 'multi_hit_2') return 2;
  if (move?.effect === 'multi_hit') return MULTI_HIT_ODDS.reduce((s, o) => s + o.hits * o.p, 0);
  if (move?.effect === 'charge' || move?.effect === 'recharge') return 0.5;
  return 1;
}

/**
 * Calcula el daño de un movimiento
 * Fórmula basada en Gen 1 (simplificada para roguelike)
 * @param {Object} attacker - Fighter component del atacante
 * @param {Object} defender - Fighter component del defensor
 * @param {Object} move - Datos del movimiento
 * @param {Object} attackerInfo - PokemonInfo del atacante
 * @param {Object} defenderInfo - PokemonInfo del defensor
 * @param {Object} typeChart - Matriz de efectividad de tipos
 * @param {string} weather - Clima actual
 * @returns {Object} { damage, effectiveness, isCritical, isSTAB, messages }
 */

/** Revierte Transformación si hay backup (_preTransform) */
export function revertTransform(fighter, info, spriteComp = null) {
  if (!fighter || !fighter._preTransform || !info) return false;
  const pre = fighter._preTransform;
  fighter.attack = pre.attack;
  fighter.defense = pre.defense;
  fighter.spAtk = pre.spAtk;
  fighter.spDef = pre.spDef;
  fighter.speed = pre.speed;
  if (pre.types) info.types = [...pre.types];
  info.ability = pre.ability;
  if (spriteComp && pre.spriteUrl) {
    spriteComp.url = pre.spriteUrl;
    spriteComp.image = null;
  }
  delete fighter._preTransform;
  return true;
}

export function calculateDamage(attacker, defender, move, attackerInfo, defenderInfo, typeChart, currentWeather = 'normal') {
  const result = {
    damage: 0,
    effectiveness: 1,
    isCritical: false,
    isSTAB: false,
    messages: []
  };

  // Semi-invulnerable (Excavar/Vuelo en carga)
  if (defender && defender.charging && defender.charging.semiInvuln) {
    result.messages.push(`¡${defenderInfo.name} no está al alcance!`);
    result.messages.push('¡El ataque falló!');
    result.missed = true;
    return result;
  }

  // Verificar precisión (también status)
  const atkAbAcc = getAbility(attackerInfo);
  const neverMiss = move.effect === 'never_miss' || atkAbAcc === 'keen_eye' || atkAbAcc === 'keeneye';
  if (!neverMiss && move.accuracy !== null && move.accuracy !== undefined && move.accuracy < 100) {
    let acc = move.accuracy;
    if (atkAbAcc === 'compound_eyes' || atkAbAcc === 'compoundeyes') {
      acc = Math.min(100, Math.floor(acc * 1.3));
    }
    const defAbAcc = getAbility(defenderInfo);
    if ((defAbAcc === 'sand_veil') && String(currentWeather || '').includes('arena')) {
      acc = Math.floor(acc * 0.8);
    }
    const accStage = Math.max(-6, Math.min(6, attacker.statModifiers?.accuracy || 0));
    const dodger = hasIqSkill(defenderInfo, 'quick_dodger') ? 1 : 0; // Esquivador (CI)
    const evaStage = Math.max(-6, Math.min(6, (defender.statModifiers?.evasion || 0) + dodger));
    const stage = Math.max(-6, Math.min(6, accStage - evaStage));
    const stageMult = stage >= 0 ? (3 + stage) / 3 : 3 / (3 - stage);
    acc = Math.max(1, Math.min(100, Math.floor(acc * stageMult)));
    const hitRoll = random() * 100;
    if (hitRoll > acc) {
      result.messages.push('¡El ataque falló!');
      result.missed = true;
      return result;
    }
  }

  // Come Sueños solo si el objetivo duerme
  if (move.effect === 'drain_sleep') {
    const asleep = defender.statusEffects?.some(s => s.type === 'sleep');
    if (!asleep) {
      result.messages.push('¡Solo funciona si el objetivo está dormido!');
      result.damage = 0;
      return result;
    }
  }

  // Inmunidades / absorciones / tipos también para OHKO, daño fijo, Contraataque, etc.
  {
    const defAbilityEarly = getAbility(defenderInfo);
    const moveTypeEarly = String(move.type || '').toLowerCase();
    if (defAbilityEarly === 'levitate' && moveTypeEarly === 'ground') {
      result.messages.push(`¡No afecta a ${defenderInfo.name} gracias a Levitación!`);
      result.damage = 0; result.effectiveness = 0; result.missed = true;
      return result;
    }
    if (defAbilityEarly === 'water_absorb' && moveTypeEarly === 'water') {
      const heal = Math.max(1, Math.floor(defender.maxHp * 0.25));
      defender.hp = Math.min(defender.maxHp, defender.hp + heal);
      result.messages.push(`¡${defenderInfo.name} absorbió el ataque de Agua (+${heal} PS)!`);
      result.damage = 0; result.effectiveness = 0; return result;
    }
    if (defAbilityEarly === 'volt_absorb' && moveTypeEarly === 'electric') {
      const heal = Math.max(1, Math.floor(defender.maxHp * 0.25));
      defender.hp = Math.min(defender.maxHp, defender.hp + heal);
      result.messages.push(`¡${defenderInfo.name} absorbió la electricidad (+${heal} PS)!`);
      result.damage = 0; result.effectiveness = 0; return result;
    }
    if ((defAbilityEarly === 'lightning_rod' || defAbilityEarly === 'lightningrod') && moveTypeEarly === 'electric') {
      result.messages.push(`¡Pararrayos de ${defenderInfo.name} atrajo el ataque!`);
      if (!defender.statModifiers) defender.statModifiers = {};
      defender.statModifiers.spAtk = Math.min(6, (defender.statModifiers.spAtk || 0) + 1);
      result.damage = 0; result.effectiveness = 0; return result;
    }
    if ((defAbilityEarly === 'flash_fire' || defAbilityEarly === 'flashfire') && moveTypeEarly === 'fire') {
      result.messages.push(`¡El fuego potenció a ${defenderInfo.name} (Absorbe Fuego)!`);
      if (!defender.statModifiers) defender.statModifiers = {};
      defender.statModifiers.spAtk = Math.min(6, (defender.statModifiers.spAtk || 0) + 1);
      result.damage = 0; result.effectiveness = 0; return result;
    }
    // Inmunidad de tipos (Fantasma vs Normal/Lucha, etc.)
    if (move.damageClass !== 'status' && move.type) {
      let effEarly = 1;
      for (const defType of (defenderInfo.types || [])) {
        effEarly *= getTypeMultiplier(typeChart, move.type, defType);
      }
      if (effEarly === 0) {
        result.messages.push('No afecta al Pokémon enemigo...');
        result.messages.push('¡El ataque falló!');
        result.missed = true;
        result.effectiveness = 0;
        return result;
      }
    }
  }

    // Golpes especiales con power null (OHKO, fijo, nivel)
  const specialDmg = ['ohko', 'fixed_20', 'fixed_40', 'level_damage', 'half_hp', 'random_damage', 'counter'].includes(move.effect);
  if (specialDmg) {
    if (move.effect === 'ohko') {
      if ((attackerInfo.level || 1) < (defenderInfo.level || 1)) {
        result.messages.push('¡El ataque falló!');
        return result;
      }
      result.damage = Math.max(1, defender.hp);
      result.messages.push('¡Es un golpe fulminante!');
      result.hit = true;
      return result;
    }
    if (move.effect === 'fixed_20') {
      result.damage = 20;
      result.hit = true;
      return result;
    }
    if (move.effect === 'fixed_40') {
      result.damage = 40;
      result.hit = true;
      return result;
    }
    if (move.effect === 'level_damage') {
      result.damage = Math.max(1, attackerInfo.level || 1);
      result.hit = true;
      return result;
    }
    if (move.effect === 'half_hp') {
      result.damage = Math.max(1, Math.floor(defender.hp / 2));
      result.hit = true;
      return result;
    }
    if (move.effect === 'random_damage') {
      result.damage = 1 + Math.floor(random() * (attackerInfo.level || 20) * 1.5);
      result.hit = true;
      return result;
    }
    if (move.effect === 'counter') {
      const reflected = Math.floor((attacker.lastPhysicalDamageTaken || 0) * 2);
      attacker.lastPhysicalDamageTaken = 0;
      if (reflected <= 0) {
        result.messages.push('¡Contraataque falló!');
        return result;
      }
      result.damage = reflected;
      result.hit = true;
      return result;
    }
  }

  // Movimientos de estado: respetar inmunidad de tipos
  if (move.damageClass === 'status') {
    let eff = 1;
    for (const defType of (defenderInfo.types || [])) {
      eff *= getTypeMultiplier(typeChart, move.type, defType);
    }
    if (eff === 0) {
      result.messages.push('No afecta al Pokémon enemigo...');
      result.missed = true;
      result.messages.push('¡El ataque falló!');
      return result;
    }
    result.hit = true;
    return result;
  }
  // Power null sin ser status especial ya resuelto arriba
  if (move.power === null || move.power === 0) {
    result.hit = true;
    return result;
  }

  // Inmunidades de habilidad ya resueltas arriba

  // Determinar stats ofensivo/defensivo según clase de daño
  let atk, def;
  if (move.damageClass === 'physical') {
    atk = attacker.attack;
    def = defender.defense;
  } else {
    atk = attacker.spAtk;
    def = defender.spDef;
  }

  // Aplicar modificadores de stats (físicos vs especiales)
  const isPhysical = move.damageClass === 'physical';
  if (attacker.statModifiers) {
    const atkStage = isPhysical
      ? (attacker.statModifiers.attack || 0)
      : (attacker.statModifiers.spAtk || 0);
    atk = applyStatModifier(atk, atkStage);
  }

  // Agallas (Guts): solo estados mayores; quemadura corta ATK físico si no hay Agallas
  const attackerAbilityEarly = getAbility(attackerInfo);
  const majorStatus = ['burn', 'poison', 'paralyze', 'freeze', 'sleep'];
  const hasMajorStatus = attacker.statusEffects?.some(s => majorStatus.includes(s.type));
  if (isPhysical && attackerAbilityEarly === 'guts' && hasMajorStatus) {
    atk = Math.floor(atk * 1.5);
    result.messages.push('¡La habilidad Agallas potencia el ataque!');
  } else if (isPhysical && attacker.statusEffects?.some(s => s.type === 'burn')) {
    atk = Math.floor(atk * 0.5);
  }
  // Potencia (Huge Power): duplica ATK físico
  if (isPhysical && (attackerAbilityEarly === 'huge_power' || attackerAbilityEarly === 'pure_power')) {
    atk = Math.floor(atk * 2);
  }
  if (defender.statModifiers) {
    const defStage = isPhysical
      ? (defender.statModifiers.defense || 0)
      : (defender.statModifiers.spDef || 0);
    def = applyStatModifier(def, defStage);
  }
  // Objetos equipados (Banda Poder, Pañuelo Defensa…)
  atk = Math.floor(atk * heldStatMultiplier(attackerInfo, isPhysical ? 'attack' : 'spAtk'));
  def = Math.max(1, Math.floor(def * heldStatMultiplier(defenderInfo, isPhysical ? 'defense' : 'spDef')));
  // Sebo (Thick Fat): reduce daño de Fuego/Hielo
  {
    const defAbThick = getAbility(defenderInfo);
    const moveTypeThick = String(move.type || '').toLowerCase();
    if (defAbThick === 'thick_fat' && (moveTypeThick === 'fire' || moveTypeThick === 'ice')) {
      def = Math.floor(def * 2);
      result.messages.push('¡Sebo reduce el daño de Fuego/Hielo!');
    }
  }

  // Fórmula de daño base
  const level = attackerInfo.level;
  let damage = Math.floor(
    ((2 * level / 5 + 2) * move.power * (atk / def)) / 50 + 2
  );

  // Habilidades Pasivas de Aumento de Daño
  const atkAbility = getAbility(attackerInfo) || attackerInfo.ability;
  const hpPercent = attacker.hp / attacker.maxHp;
  if (hpPercent <= 0.33) {
    if (atkAbility === 'overgrow' && move.type === 'grass') {
      damage = Math.floor(damage * 1.5);
      result.messages.push('¡La habilidad Espesura potencia el ataque!');
    } else if (atkAbility === 'blaze' && move.type === 'fire') {
      damage = Math.floor(damage * 1.5);
      result.messages.push('¡La habilidad Mar Llamas potencia el ataque!');
    } else if (atkAbility === 'torrent' && move.type === 'water') {
      damage = Math.floor(damage * 1.5);
      result.messages.push('¡La habilidad Torrente potencia el ataque!');
    } else if (atkAbility === 'swarm' && move.type === 'bug') {
      damage = Math.floor(damage * 1.5);
      result.messages.push('¡La habilidad Enjambre potencia el ataque!');
    }
  }

  // STAB (Same Type Attack Bonus). `stab` en el movimiento manda (el ataque
  // básico no tiene tipo y lo dice combat.json); si no, el tipo del atacante
  if (move.stab ?? (attackerInfo.types || []).includes(move.type)) {
    damage = Math.floor(damage * 1.5);
    result.isSTAB = true;
  }

  // Efectividad de tipos
  let effectiveness = 1;
  for (const defType of (defenderInfo.types || [])) {
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

  // Crítico (velocidad efectiva + high_crit)
  let effSpeed = attacker.speed || 50;
  const spdStage = Math.max(-6, Math.min(6, attacker.statModifiers?.speed || 0));
  if (spdStage >= 0) effSpeed = Math.floor(effSpeed * (2 + spdStage) / 2);
  else effSpeed = Math.floor(effSpeed * 2 / (2 - spdStage));
  let critRate = Math.min(effSpeed / 512, 0.25);
  if (move.effect === 'high_crit') critRate = Math.min(0.5, Math.max(critRate * 4, 0.125));
  if (attacker.focusEnergy) critRate = Math.min(0.5, Math.max(critRate * 3, 0.2));
  const defAbCrit = getAbility(defenderInfo);
  if (defAbCrit === 'shell_armor' || defAbCrit === 'battle_armor') {
    critRate = 0;
  }
  if (random() < critRate) {
    damage = Math.floor(damage * 1.5);
    result.isCritical = true;
    result.messages.push('¡Golpe crítico!');
  }

  // Clorofila / Nado Rápido: solo velocidad (Game._syncAbilitySpeeds), no daño extra
  const atkAbWeather = getAbility(attackerInfo);
  if (atkAbWeather === 'iron_fist') {
    const n = String(move.name || '').toLowerCase();
    if (n.includes('puño') || n.includes('punetazo') || n.includes('golpe karate') || move.effect === 'multi_hit_2') {
      damage = Math.floor(damage * 1.2);
    }
  }

  // Modificador de clima
  if (currentWeather === 'lluvia') {
    if (move.type === 'water') {
      damage = Math.floor(damage * 1.3);
      result.messages.push('¡La lluvia potencia los ataques de Agua!');
    } else if (move.type === 'fire') {
      damage = Math.floor(damage * 0.7);
      result.messages.push('¡La lluvia debilita los ataques de Fuego!');
    }
  } else if (currentWeather === 'sol') {
    if (move.type === 'fire') {
      damage = Math.floor(damage * 1.3);
      result.messages.push('¡El sol radiante potencia los ataques de Fuego!');
    } else if (move.type === 'water') {
      damage = Math.floor(damage * 0.7);
      result.messages.push('¡El sol radiante debilita los ataques de Agua!');
    }
  }

  if (currentWeather === 'tormenta_arena' && isPhysical && (defenderInfo.types || []).includes('rock')) {
    damage = Math.floor(damage * 0.67);
  }
  if (currentWeather === 'granizo' && !isPhysical && move.damageClass === 'special' && (defenderInfo.types || []).includes('ice')) {
    damage = Math.floor(damage * 0.67);
  }

  // Variación aleatoria (85% - 100%)
  const randomFactor = 0.85 + random() * 0.15;
  damage = Math.max(1, Math.floor(damage * randomFactor));

  if (isPhysical && defender.reflect > 0) {
    damage = Math.max(1, Math.floor(damage * 0.5));
    result.messages.push('¡Reflejo redujo el daño!');
  } else if (!isPhysical && defender.lightScreen > 0) {
    damage = Math.max(1, Math.floor(damage * 0.5));
    result.messages.push('¡Pantalla de Luz redujo el daño!');
  }

  // Sustituto absorbe daño
  if (defender.substitute && defender.substitute > 0 && damage > 0) {
    const absorbed = Math.min(defender.substitute, damage);
    defender.substitute -= absorbed;
    damage -= absorbed;
    result.messages.push(defender.substitute > 0
      ? '¡El sustituto absorbió el golpe!'
      : '¡El sustituto se rompió!');
    if (defender.substitute <= 0) defender.substitute = 0;
    damage = Math.max(0, damage);
    if (damage === 0) result.substituteBlocked = true;
  }

  // Superguarda (resto de inmunidades ya resueltas arriba)
  const defenderAbility = getAbility(defenderInfo);
  if (defenderAbility === 'wonder_guard' && effectiveness <= 1) {
    result.messages.push('¡Superguarda bloqueó el ataque!');
    damage = 0;
    effectiveness = 0;
  }

  result.damage = damage;
  result.effectiveness = effectiveness;
  return result;
}

/**
 * Obtiene el multiplicador de efectividad de tipo. Un ataque sin tipo (el
 * básico) es neutro contra todo.
 * @param {Object} typeChart - { chart: { attackType: { defType: multiplier } } }
 * @param {string | null | undefined} attackType - Tipo del movimiento
 * @param {string} defenseType - Tipo del defensor
 * @returns {number} Multiplicador (0, 0.5, 1, o 2)
 */
function getTypeMultiplier(typeChart, attackType, defenseType) {
  if (!attackType || !typeChart || !typeChart.chart) return 1;
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
 * @param {Object} params.game - Objeto Game
 * @returns {Object} { success, damage, effectiveness, messages, defenderFainted }
 */
/**
 * Ejecuta un movimiento contra un objetivo.
 * Con `extraTarget` (segundo y siguientes objetivos de un movimiento de área)
 * no vuelve a gastar PP, ni a anunciar el movimiento, ni a gestionar carga o
 * Venganza, y la Explosión no debilita al usuario (lo hace el objetivo principal).
 */
export function executeMove(params) {
  const { attackerId, defenderId, move, entityManager, typeChart, eventBus, game, currentWeather, extraTarget = false } = params;
  const activeWeather = currentWeather || (game ? game.currentWeather : 'normal');
  
  const attackerFighter = entityManager.getComponent(attackerId, 'fighter');
  const defenderFighter = entityManager.getComponent(defenderId, 'fighter');
  const attackerInfo = entityManager.getComponent(attackerId, 'pokemonInfo');
  const defenderInfo = entityManager.getComponent(defenderId, 'pokemonInfo');
  if (attackerFighter) attackerFighter._eid = attackerId;
  if (defenderFighter) defenderFighter._eid = defenderId;
  if (attackerFighter && move.effect !== 'counter') {
    attackerFighter.lastPhysicalDamageTaken = 0;
  }

  if (!attackerFighter || !defenderFighter || !attackerInfo || !defenderInfo) {
    return { success: false, damage: 0, messages: ['No se pudo completar el ataque.'], defenderFainted: false };
  }

  const messages = [];

  // Movimientos de carga: 1er turno prepara, 2º golpea
  if (extraTarget) {
    // El movimiento ya se anunció y se pagó con el objetivo principal
  } else if (move.effect === 'charge') {
    if (!attackerFighter.charging || attackerFighter.charging.moveId !== move.id) {
      const n = String(move.name || '').toLowerCase();
      attackerFighter.charging = {
        moveId: move.id,
        semiInvuln: n.includes('excavar') || n.includes('vuelo')
      };
      const moveSlot = attackerInfo.currentMoves.find(m => m.moveId === move.id);
      if (moveSlot) {
        if (moveSlot.currentPP <= 0) {
          return { success: false, damage: 0, messages: ['¡No quedan PP para este movimiento!'], defenderFainted: false };
        }
        moveSlot.currentPP--;
      }
      messages.push(`¡${attackerInfo.name} está preparando ${move.name}! (usa el mismo movimiento otra vez)`);
      entityManager.setComponent(attackerId, 'fighter', attackerFighter);
      entityManager.setComponent(attackerId, 'pokemonInfo', attackerInfo);
      return { success: true, damage: 0, effectiveness: 1, isCritical: false, isSTAB: false, messages, defenderFainted: false, charging: true };
    }
    attackerFighter.charging = null;
    messages.push(`¡${attackerInfo.name} usó ${move.name}!`);
  } else if (move.effect === 'bide') {
    if (!attackerFighter.biding) {
      attackerFighter.biding = { moveId: move.id, damageStored: 0, turnsHeld: 0 };
      const moveSlot = attackerInfo.currentMoves.find(m => m.moveId === move.id);
      if (moveSlot) {
        if (moveSlot.currentPP <= 0) {
          return { success: false, damage: 0, messages: ['¡No quedan PP para este movimiento!'], defenderFainted: false };
        }
        moveSlot.currentPP--;
      }
      messages.push(`¡${attackerInfo.name} aguanta el golpe...! (usa Venganza otra vez para devolver)`);
      entityManager.setComponent(attackerId, 'fighter', attackerFighter);
      entityManager.setComponent(attackerId, 'pokemonInfo', attackerInfo);
      return { success: true, damage: 0, effectiveness: 1, isCritical: false, isSTAB: false, messages, defenderFainted: false, biding: true };
    }
    messages.push(`¡${attackerInfo.name} usó ${move.name}!`);
  } else {
    // Cancelar carga / venganza si usa otro movimiento
    if (attackerFighter.charging) {
      attackerFighter.charging = null;
    }
    if (attackerFighter.biding) {
      attackerFighter.biding = null;
      messages.push(`¡${attackerInfo.name} dejó de aguantar!`);
    }
    messages.push(`¡${attackerInfo.name} usó ${move.name}!`);
  }

  // Reducir PP (carga y 1er turno de Venganza ya gastaron PP)
  if (!extraTarget && move.effect !== 'charge' && move.effect !== 'bide') {
    const moveSlot = attackerInfo.currentMoves.find(m => m.moveId === move.id);
    if (moveSlot) {
      if (moveSlot.currentPP <= 0) {
        return { success: false, damage: 0, messages: ['¡No quedan PP para este movimiento!'], defenderFainted: false };
      }
      moveSlot.currentPP--;
      if (getAbility(defenderInfo) === 'pressure' && moveSlot.currentPP > 0) {
        moveSlot.currentPP--;
        messages.push(`¡La Presión de ${defenderInfo.name} agota más PP!`);
      }
    }
  }

  // Metrónomo: elige un movimiento al azar con poder
  if (move.effect === 'random_move' && game && game.movesData) {
    const pool = game.movesData.filter(m => m && m.power && m.power > 0 && m.effect !== 'random_move' && m.effect !== 'self_destruct');
    if (pool.length) {
      const picked = pool[Math.floor(random() * pool.length)];
      messages.push(`¡Metrónomo eligió ${picked.name}!`);
      const nested = executeMove({ ...params, move: picked });
      nested.messages = [...messages, ...(nested.messages || [])];
      return nested;
    }
    messages.push('¡Metrónomo falló!');
    entityManager.setComponent(attackerId, 'pokemonInfo', attackerInfo);
    return { success: true, damage: 0, effectiveness: 1, isCritical: false, isSTAB: false, messages, defenderFainted: false };
  }

  // Intimidación: baja ataque del rival una vez por encuentro (nunca a uno mismo)
  {
    const atkAb = getAbility(attackerInfo);
    if (attackerId !== defenderId && (atkAb === 'intimidate' || atkAb === 'intimidation') && defenderFighter && !defenderFighter._intimidatedBy?.includes(attackerId)) {
      if (!defenderFighter._intimidatedBy) defenderFighter._intimidatedBy = [];
      defenderFighter._intimidatedBy.push(attackerId);
      if (!defenderFighter.statModifiers) defenderFighter.statModifiers = {};
      const defAb = getAbility(defenderInfo);
      if (defAb === 'clear_body' || defAb === 'hyper_cutter') {
        messages.push(defAb === 'hyper_cutter' ? '¡Corte Fuerte evitó Intimidación!' : '¡Cuerpo Puro evitó Intimidación!');
      } else {
        defenderFighter.statModifiers.attack = Math.max(-6, (defenderFighter.statModifiers.attack || 0) - 1);
        messages.push(`¡Intimidación de ${attackerInfo.name} bajó el Ataque de ${defenderInfo.name}!`);
      }
    }
  }

  // Humedad: anula Autodestrucción/Explosión antes de resolver
  if (move.effect === 'self_destruct' && getAbility(defenderInfo) === 'damp') {
    messages.push('¡La habilidad Humedad impidió la explosión!');
    entityManager.setComponent(attackerId, 'pokemonInfo', attackerInfo);
    return { success: true, damage: 0, effectiveness: 1, isCritical: false, isSTAB: false, messages, defenderFainted: false };
  }

  // Mimético: copia un movimiento del rival en el hueco de Mimético
  if (move.effect === 'mimic' && game && game.movesData) {
    const foeSlots = (defenderInfo.currentMoves || []).filter(m => m && m.moveId && m.moveId !== move.id);
    const pool = [];
    for (const s of foeSlots) {
      const md = game.movesData.find(x => x.id === s.moveId);
      if (md && md.effect !== 'mimic' && md.effect !== 'bide' && md.effect !== 'transform') pool.push(md);
    }
    if (!pool.length) {
      messages.push('¡No hay movimiento que copiar!');
      entityManager.setComponent(attackerId, 'pokemonInfo', attackerInfo);
      return { success: true, damage: 0, effectiveness: 1, isCritical: false, isSTAB: false, messages, defenderFainted: false };
    }
    const picked = pool[Math.floor(random() * pool.length)];
    const slot = attackerInfo.currentMoves.find(m => m && (m.moveId === move.id || m._mimicOriginal === move.id));
    if (slot) {
      if (slot._mimicOriginal == null) slot._mimicOriginal = move.id;
      slot.moveId = picked.id;
      slot.maxPP = picked.pp || 10;
      slot.currentPP = slot.maxPP;
      messages.push(`¡${attackerInfo.name} copió ${picked.name}!`);
    } else {
      messages.push('¡Mimético falló!');
    }
    entityManager.setComponent(attackerId, 'pokemonInfo', attackerInfo);
    entityManager.setComponent(attackerId, 'fighter', attackerFighter);
    return { success: true, damage: 0, effectiveness: 1, isCritical: false, isSTAB: false, messages, defenderFainted: false };
  }

  // Venganza (bide): liberar daño acumulado x2 (mín. 2 turnos aguantando)
  if (move.effect === 'bide' && attackerFighter.biding) {
    const held = attackerFighter.biding.turnsHeld || 0;
    if (held < 2) {
      messages.push(`¡Venganza aún carga! (${held}/2 turnos). Mantén o pulsa de nuevo cuando esté lista.`);
      entityManager.setComponent(attackerId, 'fighter', attackerFighter);
      entityManager.setComponent(attackerId, 'pokemonInfo', attackerInfo);
      return { success: true, damage: 0, effectiveness: 1, isCritical: false, isSTAB: false, messages, defenderFainted: false, biding: true };
    }
    const stored = attackerFighter.biding.damageStored || 0;
    attackerFighter.biding = null;
    if (stored <= 0) {
      messages.push('¡Venganza falló! No había acumulado daño.');
      entityManager.setComponent(attackerId, 'fighter', attackerFighter);
      entityManager.setComponent(attackerId, 'pokemonInfo', attackerInfo);
      return { success: true, damage: 0, effectiveness: 1, isCritical: false, isSTAB: false, messages, defenderFainted: false };
    }
    let dmg = Math.max(1, Math.floor(stored * 2));
    const isBossTarget = entityManager.hasComponent(defenderId, 'isBoss')
      || entityManager.hasComponent(defenderId, 'boss');
    if (isBossTarget) dmg = Math.min(dmg, Math.max(1, Math.floor(defenderFighter.maxHp * 0.45)));
    defenderFighter.hp = Math.max(0, defenderFighter.hp - dmg);
    messages.push(`¡Devuelve el daño acumulado! (-${dmg} PS)`);
    if (eventBus) {
      eventBus.emit('damage_dealt', {
        attackerId, defenderId, damage: dmg, effectiveness: 1, isCritical: false
      });
    }
    let defenderFainted = defenderFighter.hp <= 0;
    if (defenderFainted) {
      messages.push(`¡${defenderInfo.name} se debilitó!`);
      if (eventBus) {
        const pos = entityManager.getComponent(defenderId, 'position');
        const sprite = entityManager.getComponent(defenderId, 'sprite');
        eventBus.emit('pokemon_fainted', {
          entityId: defenderId,
          speciesId: defenderInfo.speciesId,
          pos: pos ? { x: pos.x, y: pos.y } : null,
          spriteUrl: sprite ? sprite.url : '',
          attackerId
        });
      }
    }
    entityManager.setComponent(attackerId, 'fighter', attackerFighter);
    entityManager.setComponent(attackerId, 'pokemonInfo', attackerInfo);
    entityManager.setComponent(defenderId, 'fighter', defenderFighter);
    return { success: true, damage: dmg, effectiveness: 1, isCritical: false, isSTAB: false, messages, defenderFainted };
  }

  let hits = 1;
  if (move.effect === 'multi_hit_2') {
    hits = 2;
  } else if (move.effect === 'multi_hit') {
    const rand = random();
    let acc = 0;
    hits = MULTI_HIT_ODDS.at(-1).hits;
    for (const odds of MULTI_HIT_ODDS) {
      acc += odds.p;
      if (rand < acc) { hits = odds.hits; break; }
    }
  }

  let totalDamage = 0;
  let effectiveness = 1;
  let isSTAB = false;
  let defenderFainted = false;
  let landedHits = 0;
  const moveForHits = { ...move };
  // Precisión solo una vez en multi-golpe
  if (hits > 1) {
    const accProbe = calculateDamage(attackerFighter, defenderFighter, move, attackerInfo, defenderInfo, typeChart, activeWeather);
    if (accProbe.messages.includes('¡El ataque falló!')) {
      messages.push('¡El ataque falló!');
      entityManager.setComponent(attackerId, 'pokemonInfo', attackerInfo);
      return { success: true, damage: 0, effectiveness: 1, isCritical: false, isSTAB: false, messages, defenderFainted: false };
    }
    moveForHits.accuracy = 100; // siguientes golpes no re-tiran precisión
    moveForHits.effect = move.effect === 'never_miss' ? 'never_miss' : move.effect;
  }

  for (let i = 0; i < hits; i++) {
    if (defenderFainted) break;

    // Calcular daño
    const result = calculateDamage(attackerFighter, defenderFighter, hits > 1 ? moveForHits : move, attackerInfo, defenderInfo, typeChart, activeWeather);
    
    // Solo mostramos los mensajes de efectividad en el primer golpe
    if (i === 0) {
      messages.push(...result.messages.filter(m => m !== '¡Golpe crítico!' && m !== '¡El ataque falló!'));
      effectiveness = result.effectiveness;
      isSTAB = result.isSTAB;
    }
    
    if (result.messages.includes('¡El ataque falló!')) {
      if (hits > 1 && i > 0) break; // Si falla a mitad de multi-hit, se detiene
      if (i === 0) messages.push('¡El ataque falló!');
      if (i === 0 && move.effect === 'recoil_miss') {
        const crash = Math.max(1, Math.floor(attackerFighter.maxHp / 2));
        attackerFighter.hp = Math.max(0, attackerFighter.hp - crash);
        messages.push(`¡${attackerInfo.name} falló y se estrelló! (-${crash} PS)`);
      }
      break;
    }

    if (result.messages.includes('¡Golpe crítico!')) {
      messages.push('¡Golpe crítico!');
      if (eventBus && game?.renderer?.screenFlash && entityManager.hasComponent(attackerId, 'partyMember')) {
        game.renderer.screenFlash('rgba(255, 255, 180, 0.25)', 120);
      }
    }

    if (result.damage > 0) {
      landedHits++;
      // OHKO no tumba jefes; Robustez evita OHKO/golpe letal a PS llenos
      const defAbility = getAbility(defenderInfo);
      const isBossTarget = entityManager.hasComponent(defenderId, 'isBoss')
        || entityManager.hasComponent(defenderId, 'boss');
      if (move.effect === 'ohko' && isBossTarget) {
        result.damage = Math.max(1, Math.floor(defenderFighter.maxHp * 0.35));
        messages.push('¡El jefe resistió el golpe fulminante!');
      }
      if (defAbility === 'sturdy' && defenderFighter.hp === defenderFighter.maxHp && result.damage >= defenderFighter.maxHp) {
        result.damage = defenderFighter.maxHp - 1;
        messages.push(`¡La habilidad Robustez de ${defenderInfo.name} evitó el K.O. directo!`);
      }

      defenderFighter.hp = Math.max(0, defenderFighter.hp - result.damage);
      totalDamage += result.damage;
      if (defenderFighter.charging) {
        defenderFighter.charging = null;
        messages.push(`¡${defenderInfo.name} fue interrumpido!`);
      }
      if (defenderFighter.biding) {
        defenderFighter.biding.damageStored = (defenderFighter.biding.damageStored || 0) + result.damage;
      }
      if (move.damageClass === 'physical') {
        defenderFighter.lastPhysicalDamageTaken = result.damage;
      }
      if (defenderFighter.rage) {
        if (!defenderFighter.statModifiers) defenderFighter.statModifiers = {};
        defenderFighter.statModifiers.attack = Math.min(6, (defenderFighter.statModifiers.attack || 0) + 1);
        messages.push(`¡La cólera de ${defenderInfo.name} aumentó su Ataque!`);
      }

      // Petrificar/congelar se rompe al recibir daño; sueño ~55%
      if (defenderFighter.statusEffects && defenderFighter.statusEffects.some(s => s.type === 'freeze')) {
        defenderFighter.statusEffects = defenderFighter.statusEffects.filter(s => s.type !== 'freeze');
        messages.push(`¡${defenderInfo.name} se liberó del hielo al recibir el golpe!`);
      }
      if (defenderFighter.statusEffects && defenderFighter.statusEffects.some(s => s.type === 'sleep') && random() < 0.55) {
        defenderFighter.statusEffects = defenderFighter.statusEffects.filter(s => s.type !== 'sleep');
        messages.push(`¡${defenderInfo.name} se despertó al recibir el golpe!`);
      }
      
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

      // Aplicar efectos secundarios del movimiento (solo una vez)
      if (move.effect && move.effect !== 'multi_hit' && move.effect !== 'multi_hit_2' && i === 0) {
        const isBoss = entityManager.hasComponent(defenderId, 'boss');
        const effectApplied = tryApplyEffect(move, defenderFighter, defenderInfo, messages, attackerFighter, attackerInfo, result.damage, isBoss);
        if (effectApplied && move.effect === 'transform') syncTransformSprite(entityManager, attackerId, defenderId, attackerFighter);
        if (effectApplied) bindLeechSeedSource(defenderFighter, attackerId, entityManager);
        if (effectApplied && eventBus && move.effect !== 'heal_self' && move.effect !== 'recoil' && move.effect !== 'drain') {
          eventBus.emit('status_applied', { targetId: defenderId, effect: move.effect });
        }
      }

      // Contacto: solo AbilitySystem (evita doble Static)
      if (move.damageClass === 'physical') {
        const postAbilityResult = applyPostAttackAbilities(
          getAbility(attackerInfo), attackerFighter,
          getAbility(defenderInfo), defenderFighter,
          move
        );
        if (postAbilityResult.messages.length > 0) {
          messages.push(...postAbilityResult.messages);
        }
      }
      tryTraceAbility(attackerInfo, defenderInfo, messages);
      tryTraceAbility(defenderInfo, attackerInfo, messages);
    } else if (i === 0 && !result.messages.includes('¡El ataque falló!') && !result.missed && !result.substituteBlocked) {
      // Movimientos de estado / power 0: aplicar efecto aunque no hagan daño
      if (move.effect && move.effect !== 'multi_hit' && move.effect !== 'multi_hit_2') {
        const isBoss = entityManager.hasComponent(defenderId, 'boss');
        const selfEffects = [
          'heal_self', 'rest', 'confuse_self', 'focus_energy', 'protect_stats', 'recharge',
          'stat_up_attack', 'stat_up_attack_2',
          'stat_up_defense', 'stat_up_defense_2',
          'stat_up_speed', 'stat_up_speed_2',
          'stat_up_spAtk', 'stat_up_spDef', 'stat_up_special', 'stat_up_special_2', 'stat_up_evasion',
          'reset_stats', 'self_destruct', 'light_screen', 'reflect', 'substitute', 'flee', 'rage'
        ];
        const targetF = selfEffects.includes(move.effect) ? attackerFighter : defenderFighter;
        const targetI = selfEffects.includes(move.effect) ? attackerInfo : defenderInfo;
        const effectApplied = tryApplyEffect(move, targetF, targetI, messages, attackerFighter, attackerInfo, 0, isBoss);
        if (effectApplied && move.effect === 'transform') syncTransformSprite(entityManager, attackerId, defenderId, attackerFighter);
        if (effectApplied) bindLeechSeedSource(targetF, attackerId, entityManager);
        if (effectApplied && eventBus && !selfEffects.includes(move.effect)) {
          eventBus.emit('status_applied', { targetId: defenderId, effect: move.effect });
        }
      }
    }

    defenderFainted = defenderFighter.hp <= 0;
  }

  if (totalDamage > 0) {
    if (hits > 1) {
      messages.push(`¡Golpeó ${landedHits} veces!`);
      messages.push(`¡Hizo un total de ${totalDamage} de daño!`);
    } else {
      messages.push(`¡Hizo ${totalDamage} de daño!`);
    }
  }

  // Autodestrucción / Explosión: el usuario se debilita (Humedad lo anula)
  if (move.effect === 'self_destruct' && totalDamage > 0 && attackerFighter.hp > 0 && !extraTarget) {
    const dampNear = getAbility(defenderInfo) === 'damp';
    if (dampNear) {
      messages.push('¡La habilidad Humedad impidió la explosión!');
    } else {
      attackerFighter.hp = 0;
      messages.push(`¡${attackerInfo.name} se autodestruyó!`);
    }
  }

  // Verificar si el atacante cayó por retroceso / autodestrucción
  const attackerFainted = attackerFighter.hp <= 0;
  if (attackerFainted) {
    let reviverUsed = false;
    if (params.game && entityManager.hasComponent(attackerId, 'partyMember')) {
      const invIndex = params.game.inventory.findIndex(item => item.itemId === 'reviver_seed' && item.quantity > 0);
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
        messages.push(`...pero ¡revivió gracias a la Semilla Revivir!`);
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
      const invIndex = params.game.inventory.findIndex(item => item.itemId === 'reviver_seed' && item.quantity > 0);
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
        messages.push(`...pero ¡revivió gracias a la Semilla Revivir!`);
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

  // flee = Teletransporte (usuario); switch_out = Remolino/Rugido (echa al objetivo)
  if (move.effect === 'flee' && attackerFighter.hp > 0 && game) {
    const isParty = entityManager.hasComponent(attackerId, 'partyMember');
    const isBossAtk = entityManager.hasComponent(attackerId, 'isBoss') || entityManager.hasComponent(attackerId, 'boss');
    if (!isParty && !isBossAtk) {
      messages.push(`¡${attackerInfo.name} huyó del combate!`);
      if (game.turnManager) game.turnManager.removeEntity(attackerId);
      entityManager.destroyEntity(attackerId);
    } else if (isParty && game.tileMap) {
      const aPos = entityManager.getComponent(attackerId, 'position');
      if (aPos) {
        let warped = false;
        for (let tries = 0; tries < 24 && !warped; tries++) {
          const ang = random() * Math.PI * 2;
          const dist = 3 + Math.floor(random() * 3);
          const nx = aPos.x + Math.round(Math.cos(ang) * dist);
          const ny = aPos.y + Math.round(Math.sin(ang) * dist);
          if (!game.tileMap.isInBounds(nx, ny) || !game.tileMap.isWalkable(nx, ny)) continue;
          if (entityManager.getEntityAt(nx, ny)) continue;
          aPos.prevX = aPos.x; aPos.prevY = aPos.y;
          aPos.x = nx; aPos.y = ny;
          entityManager.setComponent(attackerId, 'position', aPos);
          messages.push(`¡${attackerInfo.name} se teletransportó!`);
          warped = true;
        }
        if (!warped) messages.push(`¡${attackerInfo.name} no pudo teletransportarse!`);
      }
    }
  } else if (move.effect === 'switch_out' && !defenderFainted && defenderFighter.hp > 0 && game) {
    const defParty = entityManager.hasComponent(defenderId, 'partyMember');
    const defBoss = entityManager.hasComponent(defenderId, 'isBoss') || entityManager.hasComponent(defenderId, 'boss');
    if (defBoss) {
      messages.push('¡El jefe no se inmutó!');
    } else if (!defParty) {
      messages.push(`¡${defenderInfo.name} fue lanzado fuera del combate!`);
      if (game.turnManager) game.turnManager.removeEntity(defenderId);
      entityManager.destroyEntity(defenderId);
      defenderFainted = true;
    } else if (game.tileMap) {
      const dPos = entityManager.getComponent(defenderId, 'position');
      if (dPos) {
        let warped = false;
        for (let tries = 0; tries < 24 && !warped; tries++) {
          const ang = random() * Math.PI * 2;
          const dist = 3 + Math.floor(random() * 3);
          const nx = dPos.x + Math.round(Math.cos(ang) * dist);
          const ny = dPos.y + Math.round(Math.sin(ang) * dist);
          if (!game.tileMap.isInBounds(nx, ny) || !game.tileMap.isWalkable(nx, ny)) continue;
          if (entityManager.getEntityAt(nx, ny)) continue;
          dPos.prevX = dPos.x; dPos.prevY = dPos.y;
          dPos.x = nx; dPos.y = ny;
          entityManager.setComponent(defenderId, 'position', dPos);
          messages.push(`¡${defenderInfo.name} fue empujado lejos!`);
          warped = true;
        }
        if (!warped) messages.push(`¡${defenderInfo.name} resistió el empujón!`);
      }
    }
  }

  // Actualizar componentes
  entityManager.setComponent(attackerId, 'pokemonInfo', attackerInfo);
  if (attackerFighter && attackerFighter.hp > 0 && entityManager.getComponent(attackerId, 'fighter')) {
    entityManager.setComponent(attackerId, 'fighter', attackerFighter);
  }
  if (!defenderFainted && entityManager.getComponent(defenderId, 'fighter')) {
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
function hasMajorStatus(fighter) {
  if (!fighter?.statusEffects) return false;
  return fighter.statusEffects.some(s => ['burn','poison','paralyze','freeze','sleep'].includes(s.type));
}


function syncTransformSprite(entityManager, attackerId, defenderId, attackerFighter) {
  if (!entityManager || !attackerFighter?._preTransform) return;
  const spr = entityManager.getComponent(attackerId, 'sprite');
  const defSpr = entityManager.getComponent(defenderId, 'sprite');
  if (!spr || !defSpr?.url) return;
  if (attackerFighter._preTransform.spriteUrl == null) {
    attackerFighter._preTransform.spriteUrl = spr.url;
  }
  spr.url = defSpr.url;
  spr.image = null;
  entityManager.setComponent(attackerId, 'sprite', spr);
}

/**
 * Aplica el efecto secundario de un movimiento. Con Autocura (CI), los estados
 * que causa duran la mitad.
 * @returns {boolean} Si el efecto se aplicó
 */
export function tryApplyEffect(move, targetFighter, targetInfo, messages, attackerFighter, attackerInfo, damageDealt = 0, isBoss = false) {
  const before = targetFighter?.statusEffects?.length ?? 0;
  const applied = applyEffect(move, targetFighter, targetInfo, messages, attackerFighter, attackerInfo, damageDealt, isBoss);
  if (applied && hasIqSkill(targetInfo, 'self_curer')) {
    for (const status of targetFighter.statusEffects.slice(before)) {
      if (status.turnsLeft > 1) status.turnsLeft = Math.ceil(status.turnsLeft / 2);
    }
  }
  return applied;
}

function applyEffect(move, targetFighter, targetInfo, messages, attackerFighter, attackerInfo, damageDealt = 0, isBoss = false) {
  const chance = move.effectChance || 100;
  if (random() * 100 > chance) return false;

  // Polvo Escudo: bloquea efectos secundarios (no el daño principal)
  const secondaryOnly = move.effectChance != null && move.effectChance < 100;
  if (secondaryOnly && getAbility(targetInfo) === 'shield_dust') {
    return false;
  }
  // Insonorizar: inmune a movimientos de sonido
  const mn = String(move.name || '').toLowerCase();
  if (getAbility(targetInfo) === 'soundproof' && (move.sound || mn.includes('canto') || mn.includes('chirrido') || mn.includes('gruñido') || mn.includes('ronquido') || mn.includes('ultralido') || mn.includes('chillido') || mn.includes('eco') || mn.includes('voz'))) {
    messages.push('¡Insonorizar anuló el movimiento de sonido!');
    return false;
  }

  // Objeto equipado que protege de ese estado (Pañuelo Meloc, Insomniscopio)
  if (heldPreventsStatus(targetInfo, move.effect)) {
    messages.push(`¡${heldName(targetInfo.heldItem)} protege a ${targetInfo.name}!`);
    return false;
  }

  // Inicializar statusEffects si no existe
  if (!targetFighter.statusEffects) {
    targetFighter.statusEffects = [];
  }

  let applied = false;
  let syncedStatus = null;

  switch (move.effect) {
    case 'burn':
      if (!hasMajorStatus(targetFighter) && !(targetInfo.types || []).includes('fire')) {
        targetFighter.statusEffects.push({ type: 'burn', turnsLeft: isBoss ? 1 : (4 + Math.floor(random() * 3)) });
        messages.push(`¡${targetInfo.name} se quemó!`);
        applied = true;
        syncedStatus = 'burn';
      }
      break;
    case 'paralyze':
      if (getAbility(targetInfo) === 'limber') {
        messages.push('¡Flexibilidad evita la parálisis!');
        return false;
      }
      if (!hasMajorStatus(targetFighter) && !(targetInfo.types || []).includes('electric')) {
        targetFighter.statusEffects.push({ type: 'paralyze', turnsLeft: isBoss ? 1 : (3 + Math.floor(random() * 2)) });
        messages.push(`¡${targetInfo.name} está paralizado!`);
        applied = true;
        syncedStatus = 'paralyze';
      }
      break;
    case 'poison':
      if (!hasMajorStatus(targetFighter) && 
          !(targetInfo.types || []).includes('poison') && !(targetInfo.types || []).includes('steel')) {
        targetFighter.statusEffects.push({ type: 'poison', turnsLeft: isBoss ? 1 : (4 + Math.floor(random() * 3)) });
        messages.push(`¡${targetInfo.name} fue envenenado!`);
        applied = true;
        syncedStatus = 'poison';
      }
      break;
    case 'freeze':
      if (!hasMajorStatus(targetFighter) && !(targetInfo.types || []).includes('ice')) {
        // Duración finita (como sueño): evita softlock con -1
        targetFighter.statusEffects.push({ type: 'freeze', turnsLeft: isBoss ? 2 : (Math.floor(random() * 2) + 1) });
        messages.push(`¡${targetInfo.name} fue congelado!`);
        return true;
      }
      break;
    case 'sleep':
      if ((targetInfo.types || []).includes('grass') && String(move.type || '').toLowerCase() === 'grass') {
        messages.push('Los Pokémon tipo Planta son inmunes al polvo...');
        return false;
      }
      {
        const defAb = getAbility(targetInfo);
        if (defAb === 'insomnia' || defAb === 'vital_spirit') {
          messages.push(defAb === 'insomnia' ? '¡Insomnio impide dormir!' : '¡Espíritu Vital impide dormir!');
          return false;
        }
      }
      if (!hasMajorStatus(targetFighter)) {
        let turns = isBoss ? 2 : (Math.floor(random() * 3) + 1);
        if (getAbility(targetInfo) === 'early_bird') turns = Math.max(1, Math.ceil(turns / 2));
        targetFighter.statusEffects.push({ type: 'sleep', turnsLeft: turns });
        messages.push(`¡${targetInfo.name} se durmió!`);
        return true;
      }
      break;
    case 'confuse':
      if (getAbility(targetInfo) === 'oblivious') {
        messages.push('¡Despiste evita la confusión!');
        return false;
      }
      if (!targetFighter.statusEffects.some(s => s.type === 'confuse')) {
        targetFighter.statusEffects.push({ type: 'confuse', turnsLeft: isBoss ? 2 : (Math.floor(random() * 3) + 2) });
        messages.push(`¡${targetInfo.name} está confuso!`);
        return true;
      }
      break;
    case 'leech_seed':
      if (isBoss) return false;
      if ((targetInfo.types || []).includes('grass')) {
        messages.push('No afecta a los Pokémon tipo Planta...');
        return false;
      }
      if (!targetFighter.statusEffects.some(s => s.type === 'leech_seed')) {
        targetFighter.statusEffects.push({ type: 'leech_seed', turnsLeft: 5, sourceId: null, sourcePartySlot: null });
        messages.push(`¡${targetInfo.name} fue infectado por Drenadoras!`);
        return true;
      }
      break;
    case 'flinch': {
      if (isBoss) return false;
      if (getAbility(targetInfo) === 'inner_focus') {
        messages.push(`¡Foco Interno de ${targetInfo.name} evitó el retroceso!`);
        return false;
      }
      targetFighter.flinched = true;
      return true;
    }
    case 'stat_down_attack':
      if (isBoss) return false;
      if (targetFighter.protectStats && targetFighter.protectStats > 0) { messages.push(`¡${targetInfo.name} está protegido!`); return false; }
      {
        const ab = getAbility(targetInfo);
        if (ab === 'clear_body' || ab === 'hyper_cutter') {
          messages.push(ab === 'hyper_cutter' ? '¡Corte Fuerte evitó bajar el Ataque!' : '¡Cuerpo Puro evitó la bajada!');
          return false;
        }
      }
      if (!targetFighter.statModifiers) targetFighter.statModifiers = {};
      targetFighter.statModifiers.attack = (targetFighter.statModifiers.attack || 0) - 1;
      messages.push(`¡El Ataque de ${targetInfo.name} bajó!`);
      return true;
    case 'stat_down_defense':
      if (isBoss) return false;
      if (targetFighter.protectStats && targetFighter.protectStats > 0) { messages.push(`¡${targetInfo.name} está protegido!`); return false; }
      if (getAbility(targetInfo) === 'clear_body') { messages.push('¡Cuerpo Puro evitó la bajada!'); return false; }
      if (!targetFighter.statModifiers) targetFighter.statModifiers = {};
      targetFighter.statModifiers.defense = (targetFighter.statModifiers.defense || 0) - 1;
      messages.push(`¡La Defensa de ${targetInfo.name} bajó!`);
      return true;
    case 'stat_down_speed':
      if (isBoss) return false;
      if (targetFighter.protectStats && targetFighter.protectStats > 0) { messages.push(`¡${targetInfo.name} está protegido!`); return false; }
      if (getAbility(targetInfo) === 'clear_body') { messages.push('¡Cuerpo Puro evitó la bajada!'); return false; }
      if (!targetFighter.statModifiers) targetFighter.statModifiers = {};
      targetFighter.statModifiers.speed = (targetFighter.statModifiers.speed || 0) - 1;
      messages.push(`¡La Velocidad de ${targetInfo.name} bajó!`);
      return true;
    case 'stat_up_attack':
    case 'stat_up_attack_2': {
      if (!targetFighter.statModifiers) targetFighter.statModifiers = {};
      const step = move.effect === 'stat_up_attack_2' ? 2 : 1;
      targetFighter.statModifiers.attack = Math.min(6, (targetFighter.statModifiers.attack || 0) + step);
      messages.push(`¡El Ataque de ${targetInfo.name} subió${step > 1 ? ' mucho' : ''}!`);
      return true;
    }
    case 'stat_up_speed':
    case 'stat_up_speed_2': {
      if (!targetFighter.statModifiers) targetFighter.statModifiers = {};
      const step = move.effect === 'stat_up_speed_2' ? 2 : 1;
      targetFighter.statModifiers.speed = Math.min(6, (targetFighter.statModifiers.speed || 0) + step);
      messages.push(`¡La Velocidad de ${targetInfo.name} subió${step > 1 ? ' mucho' : ''}!`);
      return true;
    }
    case 'rest': {
      const restF = targetFighter || attackerFighter;
      const restI = targetInfo || attackerInfo;
      if (restF) {
        restF.hp = restF.maxHp;
        if (!restF.statusEffects) restF.statusEffects = [];
        restF.statusEffects = restF.statusEffects.filter(s =>
          !['burn', 'poison', 'paralyze', 'freeze', 'confuse'].includes(s.type));
        if (!restF.statusEffects.some(s => s.type === 'sleep')) {
          restF.statusEffects.push({ type: 'sleep', turnsLeft: 2 });
        }
        messages.push(`¡${restI.name} descansó y recuperó todos los PS!`);
        return true;
      }
      break;
    }
    case 'stat_up_defense':
    case 'stat_up_defense_2': {
      if (!targetFighter.statModifiers) targetFighter.statModifiers = {};
      const step = move.effect === 'stat_up_defense_2' ? 2 : 1;
      targetFighter.statModifiers.defense = Math.min(6, (targetFighter.statModifiers.defense || 0) + step);
      messages.push(`¡La Defensa de ${targetInfo.name} subió${step > 1 ? ' mucho' : ''}!`);
      return true;
    }
    case 'stat_down_accuracy':
      if (isBoss) return false;
      if (targetFighter.protectStats && targetFighter.protectStats > 0) { messages.push(`¡${targetInfo.name} está protegido!`); return false; }
      if (getAbility(targetInfo) === 'clear_body') { messages.push('¡Cuerpo Puro evitó la bajada!'); return false; }
      if (!targetFighter.statModifiers) targetFighter.statModifiers = {};
      targetFighter.statModifiers.accuracy = Math.max(-6, (targetFighter.statModifiers.accuracy || 0) - 1);
      messages.push(`¡La Precisión de ${targetInfo.name} bajó!`);
      return true;
    case 'stat_up_evasion':
      if (!targetFighter.statModifiers) targetFighter.statModifiers = {};
      targetFighter.statModifiers.evasion = Math.min(6, (targetFighter.statModifiers.evasion || 0) + 1);
      messages.push(`¡La Evasión de ${targetInfo.name} subió!`);
      return true;
    case 'stat_up_special':
    case 'stat_up_spAtk':
      if (!targetFighter.statModifiers) targetFighter.statModifiers = {};
      targetFighter.statModifiers.spAtk = (targetFighter.statModifiers.spAtk || 0) + 1;
      messages.push(`¡El Ataque Esp. de ${targetInfo.name} subió!`);
      return true;
    case 'heal_self':
      // Este efecto se aplica al atacante, no al defensor
      if (attackerFighter) {
        const healAmount = Math.max(1, Math.floor(damageDealt / 2) || Math.floor(attackerFighter.maxHp / 2));
        attackerFighter.hp = Math.min(attackerFighter.maxHp, attackerFighter.hp + healAmount);
        messages.push(`¡${attackerInfo.name} recuperó ${healAmount} PS!`);
        return true;
      }
      break;
    case 'drain_sleep':
    case 'drain':
      if (attackerFighter && damageDealt > 0) {
        const healAmount = Math.max(1, Math.floor(damageDealt / 2));
        attackerFighter.hp = Math.min(attackerFighter.maxHp, attackerFighter.hp + healAmount);
        messages.push(`¡${attackerInfo.name} absorbió ${healAmount} PS!`);
        return true;
      }
      break;
    case 'recoil':
      // El daño de retroceso se maneja aparte
      if (attackerFighter) {
        if (getAbility(attackerInfo) === 'rock_head') {
          messages.push('¡Cabeza Roca evitó el retroceso!');
          return true;
        }
        const recoilDamage = Math.max(1, Math.floor(damageDealt / 4));
        attackerFighter.hp = Math.max(0, attackerFighter.hp - recoilDamage);
        messages.push(`¡${attackerInfo.name} recibió daño de retroceso! (-${recoilDamage} PS)`);
        return true;
      }
      break;
    case 'confuse_self':
      if (attackerFighter) {
        if (!attackerFighter.statusEffects) attackerFighter.statusEffects = [];
        if (!attackerFighter.statusEffects.some(s => s.type === 'confuse')) {
          attackerFighter.statusEffects.push({ type: 'confuse', turnsLeft: 2 + Math.floor(random() * 2) });
          messages.push(`¡${attackerInfo.name} se confundió por el movimiento!`);
          return true;
        }
      }
      break;
    case 'trap':
      if (isBoss) return false;
      if (!targetFighter.statusEffects.some(s => s.type === 'bound')) {
        targetFighter.statusEffects.push({ type: 'bound', turnsLeft: 3 + Math.floor(random() * 2) });
        messages.push(`¡${targetInfo.name} quedó atrapado!`);
        return true;
      }
      break;
    case 'recharge':
      if (attackerFighter) {
        attackerFighter.mustRecharge = true;
        messages.push(`¡${attackerInfo.name} debe recuperarse!`);
        return true;
      }
      break;
    case 'switch_out':
      // Se resuelve en executeMove (huida del salvaje / mensaje)
      return true;
    case 'stat_up_special_2': {
      if (!targetFighter.statModifiers) targetFighter.statModifiers = {};
      targetFighter.statModifiers.spDef = Math.min(6, (targetFighter.statModifiers.spDef || 0) + 2);
      messages.push(`¡La Defensa Esp. de ${targetInfo.name} subió mucho!`);
      return true;
    }
    case 'stat_down_defense_2':
      if (isBoss) return false;
      if (targetFighter.protectStats && targetFighter.protectStats > 0) { messages.push(`¡${targetInfo.name} está protegido!`); return false; }
      if (getAbility(targetInfo) === 'clear_body') { messages.push('¡Cuerpo Puro evitó la bajada!'); return false; }
      if (!targetFighter.statModifiers) targetFighter.statModifiers = {};
      targetFighter.statModifiers.defense = Math.max(-6, (targetFighter.statModifiers.defense || 0) - 2);
      messages.push(`¡La Defensa de ${targetInfo.name} bajó mucho!`);
      return true;
    case 'stat_down_special':
      if (isBoss) return false;
      if (targetFighter.protectStats && targetFighter.protectStats > 0) { messages.push(`¡${targetInfo.name} está protegido!`); return false; }
      if (!targetFighter.statModifiers) targetFighter.statModifiers = {};
      targetFighter.statModifiers.spDef = Math.max(-6, (targetFighter.statModifiers.spDef || 0) - 1);
      messages.push(`¡La Defensa Esp. de ${targetInfo.name} bajó!`);
      return true;
    case 'reset_stats':
      targetFighter.statModifiers = {};
      if (attackerFighter) attackerFighter.statModifiers = {};
      messages.push('¡Se restablecieron los cambios de características!');
      return true;
    case 'self_destruct':
      // Se aplica en executeMove tras el daño
      return true;
    case 'disable':
      if (isBoss) return false;
      if (targetInfo.currentMoves && targetInfo.currentMoves.length) {
        const usable = targetInfo.currentMoves.filter(m => m && m.currentPP > 0 && m.enabled !== false);
        if (usable.length) {
          const pick = usable[Math.floor(random() * usable.length)];
          pick.enabled = false;
          pick._disableTurns = isBoss ? 2 : 4;
          messages.push(`¡Un movimiento de ${targetInfo.name} fue anulado (${pick._disableTurns} turnos)!`);
          return true;
        }
      }
      break;
    case 'badly_poison':
      if (isBoss) return false;
      if (!hasMajorStatus(targetFighter) && !(targetInfo.types || []).includes('poison') && !(targetInfo.types || []).includes('steel')) {
        targetFighter.statusEffects.push({ type: 'poison', turnsLeft: 8, badly: true });
        messages.push(`¡${targetInfo.name} fue gravemente envenenado!`);
        applied = true;
        syncedStatus = 'poison';
      }
      break;
    case 'flee':
      // Teletransporte del usuario (se resuelve en executeMove)
      return true;
    case 'light_screen':
      if (attackerFighter) {
        attackerFighter.lightScreen = 5;
        messages.push(`¡Pantalla de Luz reduce el daño especial!`);
        return true;
      }
      break;
    case 'reflect':
      if (attackerFighter) {
        attackerFighter.reflect = 5;
        messages.push(`¡Reflejo reduce el daño físico!`);
        return true;
      }
      break;
    case 'substitute':
      if (attackerFighter && attackerFighter.hp > 1) {
        const cost = Math.max(1, Math.floor(attackerFighter.maxHp / 4));
        if (attackerFighter.hp > cost) {
          attackerFighter.hp -= cost;
          attackerFighter.substitute = Math.max(1, cost);
          messages.push(`¡${attackerInfo.name} creó un sustituto!`);
          return true;
        }
      }
      messages.push('¡No pudo crear un sustituto!');
      return false;
    case 'rage':
      if (attackerFighter) {
        attackerFighter.rage = true;
        messages.push(`¡${attackerInfo.name} entró en cólera!`);
        return true;
      }
      break;
    case 'transform':
      // Copia tipos, stats y habilidad del objetivo
      if (attackerInfo && targetInfo && attackerFighter && targetFighter) {
        if (!attackerFighter._preTransform) {
          attackerFighter._preTransform = {
            attack: attackerFighter.attack,
            defense: attackerFighter.defense,
            spAtk: attackerFighter.spAtk,
            spDef: attackerFighter.spDef,
            speed: attackerFighter.speed,
            types: [...(attackerInfo.types || [])],
            ability: attackerInfo.ability
          };
        }
        attackerInfo.types = [...(targetInfo.types || [])];
        const foeAb = getAbility(targetInfo);
        if (foeAb && foeAb !== 'trace') attackerInfo.ability = foeAb;
        attackerFighter.attack = targetFighter.attack;
        attackerFighter.defense = targetFighter.defense;
        attackerFighter.spAtk = targetFighter.spAtk;
        attackerFighter.spDef = targetFighter.spDef;
        attackerFighter.speed = targetFighter.speed;
        messages.push(`¡${attackerInfo.name} se transformó en ${targetInfo.name}! (stats/tipos/habilidad)`);
        return true;
      }
      break;
    case 'conversion':
      if (attackerInfo && targetInfo?.types?.length) {
        attackerInfo.types = [targetInfo.types[0]];
        const _te={normal:'Normal',fire:'Fuego',water:'Agua',grass:'Planta',electric:'Eléctrico',ice:'Hielo',fighting:'Lucha',poison:'Veneno',ground:'Tierra',flying:'Volador',psychic:'Psíquico',bug:'Bicho',rock:'Roca',ghost:'Fantasma',dragon:'Dragón',dark:'Siniestro',steel:'Acero',fairy:'Hada'};
        messages.push(`¡${attackerInfo.name} adoptó el tipo ${_te[targetInfo.types[0]]||targetInfo.types[0]}!`);
        return true;
      }
      break;
    case 'mimic':
    case 'bide':
      return false; // gestionados en executeMove
    case 'focus_energy':
      if (attackerFighter) {
        attackerFighter.focusEnergy = true;
        messages.push(`¡${attackerInfo.name} se concentra (más críticos)!`);
        return true;
      }
      break;
    case 'protect_stats':
      if (attackerFighter) {
        attackerFighter.protectStats = 5; // turnos de inmunidad a bajadas
        messages.push(`¡${attackerInfo.name} se protege de bajadas de stats!`);
        return true;
      }
      break;
  }

  // Sincronía (Synchronize): solo si el estado se aplicó de verdad
  if (applied && syncedStatus && getAbility(targetInfo) === 'synchronize' && attackerFighter && attackerInfo) {
    if (!attackerFighter.statusEffects) attackerFighter.statusEffects = [];
    if (!hasMajorStatus(attackerFighter) && !attackerFighter.statusEffects.some(s => s.type === syncedStatus)) {
      const atkTypes = attackerInfo.types || [];
      if (syncedStatus === 'burn' && atkTypes.includes('fire')) { /* immune */ }
      else if (syncedStatus === 'poison' && (atkTypes.includes('poison') || atkTypes.includes('steel'))) { /* immune */ }
      else if (syncedStatus === 'paralyze' && atkTypes.includes('electric')) { /* immune */ }
      else {
        attackerFighter.statusEffects.push({
          type: syncedStatus,
          turnsLeft: syncedStatus === 'paralyze' ? 4 : 5
        });
        messages.push(`¡La Sincronía de ${targetInfo.name} transmitió el estado a ${attackerInfo.name}!`);
      }
    }
  }

  return applied;
}

/**
 * Procesa efectos de estado al inicio del turno de una entidad
 * @param {number} entityId - ID de la entidad
 * @param {Object} entityManager - EntityManager
 * @returns {Object} { canAct, damage, messages }
 */

function bindLeechSeedSource(defenderFighter, attackerId, entityManager) {
  if (!defenderFighter?.statusEffects || attackerId == null) return;
  const ls = defenderFighter.statusEffects.find(s => s.type === 'leech_seed' && s.sourceId == null && s.sourcePartySlot == null);
  if (!ls) return;
  ls.sourceId = attackerId;
  const pm = entityManager.getComponent(attackerId, 'partyMember');
  if (pm && pm.slot != null) ls.sourcePartySlot = pm.slot;
}

export function processStatusEffects(entityId, entityManager) {
  const fighter = entityManager.getComponent(entityId, 'fighter');
  const info = entityManager.getComponent(entityId, 'pokemonInfo');
  
  if (!fighter || !info) return { canAct: true, damage: 0, messages: [] };

  const messages = [];
  let canAct = true;
  let statusDamage = 0;

  if (!fighter.statusEffects) fighter.statusEffects = [];

  // Anulación: recuperar movimientos bloqueados
  if (info.currentMoves) {
    for (const m of info.currentMoves) {
      if (m && m.enabled === false && m._disableTurns != null) {
        m._disableTurns--;
        if (m._disableTurns <= 0) {
          m.enabled = true;
          delete m._disableTurns;
          messages.push(`¡${info.name} puede volver a usar un movimiento anulado!`);
        }
      }
    }
  }

  // Venganza: contar turnos aguantando
  if (fighter.biding) {
    fighter.biding.turnsHeld = (fighter.biding.turnsHeld || 0) + 1;
  }

  // Mudar: 30% de curar un estado mayor
  if (getAbility(info) === 'shed_skin' && fighter.statusEffects.length && random() < 0.3) {
    const major = fighter.statusEffects.find(s => ['burn','poison','paralyze','freeze','sleep'].includes(s.type));
    if (major) {
      fighter.statusEffects = fighter.statusEffects.filter(s => s !== major);
      const STATUS_ES = { burn: 'quemadura', poison: 'veneno', paralyze: 'parálisis', freeze: 'congelación', sleep: 'sueño' };
      messages.push(`¡${info.name} mudó y se curó de ${STATUS_ES[major.type] || major.type}!`);
    }
  }

  if (fighter.protectStats && fighter.protectStats > 0) {
    fighter.protectStats--;
  }
  if (fighter.reflect && fighter.reflect > 0) fighter.reflect--;
  if (fighter.lightScreen && fighter.lightScreen > 0) fighter.lightScreen--;
  if (fighter.rage) {
    fighter._rageTurns = (fighter._rageTurns == null ? 5 : fighter._rageTurns) - 1;
    if (fighter._rageTurns <= 0) {
      fighter.rage = false;
      delete fighter._rageTurns;
      messages.push(`¡${info.name} se calmó!`);
    }
  }
  if (fighter.focusEnergy) {
    fighter._focusTurns = (fighter._focusTurns == null ? 8 : fighter._focusTurns) - 1;
    if (fighter._focusTurns <= 0) {
      fighter.focusEnergy = false;
      delete fighter._focusTurns;
      messages.push(`¡${info.name} perdió la concentración!`);
    }
  }

  // Recarga tras Hiperrayo etc.
  if (fighter.mustRecharge) {
    fighter.mustRecharge = false;
    messages.push(`¡${info.name} se está recuperando del ataque!`);
    entityManager.setComponent(entityId, 'fighter', fighter);
    entityManager.setComponent(entityId, 'pokemonInfo', info);
    return { canAct: false, damage: 0, messages };
  }

  // Quemadura: daño continuo cada 2 ticks de estado
  fighter._statusTick = (fighter._statusTick || 0) + 1;
  const doTick = fighter._statusTick % 2 === 0;
  const burn = fighter.statusEffects.find(s => s.type === 'burn');
  if (burn) {
    if (doTick) {
      statusDamage = Math.max(1, Math.floor(fighter.maxHp / 16));
      fighter.hp = Math.max(0, fighter.hp - statusDamage);
      messages.push(`¡${info.name} sufre por la quemadura! (-${statusDamage} PS)`);
    }
    if (burn.turnsLeft > 0) {
      burn.turnsLeft--;
      if (burn.turnsLeft <= 0) {
        fighter.statusEffects = fighter.statusEffects.filter(s => s.type !== 'burn');
        messages.push(`¡La quemadura de ${info.name} se curó!`);
      }
    } else if (burn.turnsLeft === -1 && random() < 0.08) {
      fighter.statusEffects = fighter.statusEffects.filter(s => s.type !== 'burn');
      messages.push(`¡La quemadura de ${info.name} se curó!`);
    }
  }

  // Veneno: daño continuo cada 2 ticks
  const poison = fighter.statusEffects.find(s => s.type === 'poison');
  if (poison) {
    if (doTick) {
      let div = poison.badly ? 10 : 14;
      if (poison.badly) {
        poison._toxicStage = Math.min(8, (poison._toxicStage || 0) + 1);
        div = Math.max(4, 12 - poison._toxicStage);
      }
      statusDamage = Math.max(1, Math.floor(fighter.maxHp / div));
      fighter.hp = Math.max(0, fighter.hp - statusDamage);
      messages.push(`¡${info.name} sufre por el veneno! (-${statusDamage} PS)`);
    }
    if (poison.turnsLeft > 0) {
      poison.turnsLeft--;
      if (poison.turnsLeft <= 0) {
        fighter.statusEffects = fighter.statusEffects.filter(s => s.type !== 'poison');
        messages.push(`¡El veneno de ${info.name} se curó!`);
      }
    } else if (poison.turnsLeft === -1 && random() < 0.08) {
      fighter.statusEffects = fighter.statusEffects.filter(s => s.type !== 'poison');
      messages.push(`¡El veneno de ${info.name} se curó!`);
    }
  }

  // Parálisis: 25% de no poder actuar; duración finita (nunca eterna)
  const paralyze = fighter.statusEffects.find(s => s.type === 'paralyze');
  if (paralyze) {
    if (paralyze.turnsLeft == null || paralyze.turnsLeft <= 0 || paralyze.turnsLeft === -1) {
      paralyze.turnsLeft = 3;
    }
    if (random() < 0.20) {
      canAct = false;
      messages.push(`¡${info.name} está paralizado y no puede moverse!`);
    }
    paralyze.turnsLeft--;
    if (paralyze.turnsLeft <= 0) {
      fighter.statusEffects = fighter.statusEffects.filter(s => s.type !== 'paralyze');
      messages.push(`¡La parálisis de ${info.name} se curó!`);
    }
  }

  // Congelación: no puede actuar; duración finita + 20% de descongelarse antes
  const freeze = fighter.statusEffects.find(s => s.type === 'freeze');
  if (freeze) {
    if (freeze.turnsLeft === -1) freeze.turnsLeft = 2; // legacy saves
    if (random() < 0.2) {
      fighter.statusEffects = fighter.statusEffects.filter(s => s.type !== 'freeze');
      messages.push(`¡${info.name} se descongeló!`);
    } else {
      canAct = false;
      messages.push(`¡${info.name} está congelado!`);
      if (freeze.turnsLeft > 0) {
        freeze.turnsLeft--;
        if (freeze.turnsLeft <= 0) {
          fighter.statusEffects = fighter.statusEffects.filter(s => s.type !== 'freeze');
          messages.push(`¡El hielo de ${info.name} se derritió!`);
        }
      }
    }
  }

  // Sueño: duración finita (legacy -1 → 2–3 turnos)
  const sleep = fighter.statusEffects.find(s => s.type === 'sleep');
  if (sleep) {
    if (sleep.turnsLeft === -1 || sleep.turnsLeft == null) {
      sleep.turnsLeft = 2 + Math.floor(random() * 2);
    }
    if (sleep.turnsLeft > 0) {
      sleep.turnsLeft--;
      canAct = false;
      messages.push(`${info.name} está dormido...`);
      if (sleep.turnsLeft <= 0) {
        fighter.statusEffects = fighter.statusEffects.filter(s => s.type !== 'sleep');
        messages.push(`¡${info.name} se despertó!`);
        // No actúa este turno: se despierta al final del bloqueo
      }
    } else {
      fighter.statusEffects = fighter.statusEffects.filter(s => s.type !== 'sleep');
      messages.push(`¡${info.name} se despertó!`);
      canAct = true;
    }
  }

  // Atado / trampa: daño periódico
  const bound = fighter.statusEffects.find(s => s.type === 'bound');
  if (bound) {
    if (doTick) {
      const dmg = Math.max(1, Math.floor(fighter.maxHp / 16));
      fighter.hp = Math.max(0, fighter.hp - dmg);
      statusDamage += dmg;
      messages.push(`¡${info.name} es herido por la constricción! (-${dmg} PS)`);
    }
    if (bound.turnsLeft > 0) {
      bound.turnsLeft--;
      if (bound.turnsLeft <= 0) {
        fighter.statusEffects = fighter.statusEffects.filter(s => s.type !== 'bound');
        messages.push(`¡${info.name} se liberó!`);
      }
    }
  }

  // Drenadoras: daño periódico + cura al sembrador
  const leech = fighter.statusEffects.find(s => s.type === 'leech_seed');
  if (leech) {
    if (doTick) {
      const drain = Math.max(1, Math.floor(fighter.maxHp / 16));
      fighter.hp = Math.max(0, fighter.hp - drain);
      statusDamage += drain;
      messages.push(`¡${info.name} sufre por Drenadoras! (-${drain} PS)`);
      let srcId = leech.sourceId;
      if (srcId != null && !entityManager.getComponent(srcId, 'fighter') && leech.sourcePartySlot != null) {
        srcId = null;
      }
      if (srcId == null && leech.sourcePartySlot != null) {
        const party = entityManager.getEntitiesWithComponents('partyMember', 'fighter');
        srcId = party.find(id => {
          const pm = entityManager.getComponent(id, 'partyMember');
          return pm && pm.slot === leech.sourcePartySlot;
        }) ?? null;
        if (srcId != null) leech.sourceId = srcId;
      }
      if (srcId != null) {
        const srcF = entityManager.getComponent(srcId, 'fighter');
        if (srcF && srcF.hp > 0) {
          const healed = Math.min(drain, srcF.maxHp - srcF.hp);
          if (healed > 0) {
            srcF.hp += healed;
            entityManager.setComponent(srcId, 'fighter', srcF);
            const srcI = entityManager.getComponent(srcId, 'pokemonInfo');
            messages.push(`¡${srcI?.name || 'Aliado'} absorbió ${healed} PS!`);
          }
        }
      }
    }
    if (leech.turnsLeft > 0) {
      leech.turnsLeft--;
      if (leech.turnsLeft <= 0) {
        fighter.statusEffects = fighter.statusEffects.filter(s => s.type !== 'leech_seed');
        messages.push(`¡Las Drenadoras de ${info.name} se secaron!`);
      }
    }
  }

  // Confusión: puede golpearse a sí mismo (también en el último turno)
  const confuse = fighter.statusEffects.find(s => s.type === 'confuse');
  if (confuse) {
    if (confuse.turnsLeft > 0) {
      messages.push(`${info.name} está confuso...`);
      if (random() < 0.28) {
        const selfDamage = Math.max(1, Math.floor(fighter.attack / 6));
        fighter.hp = Math.max(0, fighter.hp - selfDamage);
        messages.push(`¡Se hirió a sí mismo! (-${selfDamage} PS)`);
        canAct = false;
      }
      confuse.turnsLeft--;
      if (confuse.turnsLeft <= 0) {
        fighter.statusEffects = fighter.statusEffects.filter(s => s.type !== 'confuse');
        messages.push(`¡${info.name} ya no está confuso!`);
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

  // Actualizar componentes
  entityManager.setComponent(entityId, 'fighter', fighter);
  entityManager.setComponent(entityId, 'pokemonInfo', info);

  return { canAct, damage: statusDamage, messages };
}


// ─── IA: qué movimiento elegir ───────────────────────────────────────────────

/** Estados mayores: un Pokémon solo tiene uno a la vez (applyEffect). */
const MAJOR_STATUS = ['burn', 'poison', 'paralyze', 'freeze', 'sleep'];

/** Tipos inmunes a cada estado (applyEffect). */
const STATUS_IMMUNE_TYPES = {
  burn: ['fire'],
  paralyze: ['electric'],
  poison: ['poison', 'steel'],
  badly_poison: ['poison', 'steel'],
  freeze: ['ice'],
};

/** Habilidades que evitan cada estado (applyEffect). */
const STATUS_IMMUNE_ABILITIES = {
  paralyze: ['limber'],
  sleep: ['insomnia', 'vital_spirit'],
  confuse: ['oblivious'],
};

/** Bajadas de características del objetivo y habilidades que las evitan (applyEffect). */
const STAT_DOWNS = {
  stat_down_attack: { stat: 'attack', blockedBy: ['clear_body', 'hyper_cutter'] },
  stat_down_defense: { stat: 'defense', blockedBy: ['clear_body'] },
  stat_down_defense_2: { stat: 'defense', blockedBy: ['clear_body'] },
  stat_down_speed: { stat: 'speed', blockedBy: ['clear_body'] },
  stat_down_accuracy: { stat: 'accuracy', blockedBy: ['clear_body'] },
  stat_down_special: { stat: 'spDef', blockedBy: [] },
};

/** Subidas de características propias: la característica que sube (applyEffect). */
const STAT_UPS = {
  stat_up_attack: 'attack', stat_up_attack_2: 'attack',
  stat_up_defense: 'defense', stat_up_defense_2: 'defense',
  stat_up_speed: 'speed', stat_up_speed_2: 'speed',
  stat_up_special: 'spAtk', stat_up_spAtk: 'spAtk',
  stat_up_special_2: 'spDef', stat_up_spDef: 'spDef',
  stat_up_evasion: 'evasion',
};

/** Movimientos cuyo daño no sale de la potencia (calculateDamage). */
const FIXED_DAMAGE = ['fixed_20', 'fixed_40', 'level_damage', 'half_hp', 'random_damage', 'counter'];

/** Movimientos que la IA valora aparte: curarse, Venganza y los que copian. */
const SPECIAL_EFFECTS = ['heal_self', 'rest', 'bide', 'transform', 'conversion', 'mimic'];

/**
 * @typedef {{
 *   attackerInfo: Object,
 *   defenderInfo: Object,
 *   typeChart: Object,
 *   attackerFighter?: Object | null,
 *   defenderFighter?: Object | null,
 *   targetIsBoss?: boolean,
 * }} AiContext
 */

/**
 * Cómo lo trata la IA:
 * - `attack`: quita PS (potencia, daño fijo, golpe fulminante o Metrónomo).
 * - `special`: curarse, Venganza, Transformación, Conversión y Mimético, con su valor.
 * - `status`: lo demás (estados, bajadas y subidas de características,
 *   pantallas, Sustituto, Rugido, Teletransporte…), que se usa de vez en cuando.
 * @param {Object} move
 * @returns {'attack' | 'special' | 'status'}
 */
export function aiMoveKind(move) {
  if ((move.power > 0 && move.damageClass !== 'status')
    || FIXED_DAMAGE.includes(move.effect)
    || move.effect === 'ohko'
    || move.effect === 'random_move') return 'attack';
  if (SPECIAL_EFFECTS.includes(move.effect)) return 'special';
  return 'status';
}

/**
 * Cuánto le queda por mover a una característica antes del tope de la IA
 * (`statStageCap`): 1 sin cambios, 0 con el tope ya alcanzado.
 * @param {number} moved - Niveles que ya se ha movido en esa dirección
 * @returns {number} Entre 0 y 1
 */
function stageRoom(moved) {
  const cap = Math.max(1, AI_WEIGHTS.statStageCap);
  return Math.max(0, Math.min(1, (cap - moved) / cap));
}

/**
 * Potencia que haría ese daño con la fórmula de calculateDamage a ese nivel y
 * con características iguales. Así un daño fijo se compara con la potencia.
 * @param {number} damage
 * @param {number} level
 * @returns {number}
 */
function powerForDamage(damage, level) {
  return Math.max(0, ((damage - 2) * 50) / ((2 * (level || 1)) / 5 + 2));
}

/**
 * Daño medio de los movimientos de daño fijo (calculateDamage).
 * @param {Object} move
 * @param {AiContext} ctx
 * @returns {number}
 */
function fixedDamage(move, { attackerInfo, attackerFighter, defenderFighter }) {
  const level = attackerInfo.level || 1;
  switch (move.effect) {
    case 'fixed_20': return 20;
    case 'fixed_40': return 40;
    case 'level_damage': return level;
    case 'half_hp': return Math.floor((defenderFighter?.hp ?? 40) / 2);
    case 'random_damage': return 0.5 + 0.75 * (attackerInfo.level || 20);
    case 'counter': return 2 * (attackerFighter?.lastPhysicalDamageTaken || 0);
    default: return 0;
  }
}

/**
 * @param {Object} move
 * @param {Object} targetInfo
 * @param {Object} typeChart
 * @returns {number} Eficacia del tipo del movimiento contra los del objetivo
 */
function typeEffectiveness(move, targetInfo, typeChart) {
  let eff = 1;
  for (const t of (targetInfo?.types || [])) eff *= getTypeMultiplier(typeChart, move.type, t);
  return eff;
}

/**
 * Si el movimiento puede afectar a su objetivo: ni inmune por tipo ni por
 * habilidad (Levitación, Absorbe Fuego, Absorbe Agua, Absorbe Elec., Pararrayos).
 * Lo que va a uno mismo o al equipo se resuelve contra el propio usuario.
 * @param {Object} move
 * @param {AiContext} ctx
 * @returns {boolean}
 */
function aiCanAffect(move, { attackerInfo, defenderInfo, typeChart }) {
  const range = moveRange(move);
  const targetInfo = range === 'self' || range === 'team' ? attackerInfo : defenderInfo;
  if (typeEffectiveness(move, targetInfo, typeChart) === 0) return false;
  const ability = getAbility(targetInfo);
  const type = String(move.type || '').toLowerCase();
  if (ability === 'levitate' && type === 'ground') return false;
  if ((ability === 'flash_fire' || ability === 'flashfire') && type === 'fire') return false;
  if ((ability === 'water_absorb' || ability === 'waterabsorb') && type === 'water') return false;
  if ((ability === 'volt_absorb' || ability === 'voltabsorb') && type === 'electric') return false;
  if ((ability === 'lightning_rod' || ability === 'lightningrod') && type === 'electric') return false;
  return true;
}

/**
 * Lo que vale para la IA un ataque o un movimiento especial, en unidades de
 * potencia: un ataque de potencia 40 sin STAB, neutro y que no falla vale 40.
 * Los pesos están en combat.json (`ai`).
 *
 * - Ataques: potencia × golpes por turno × STAB × eficacia (× `superEffective`
 *   si es supereficaz) × precisión. El daño fijo (Tinieblas, Bomba Sónica…)
 *   vale la potencia que haría ese daño a su nivel.
 * - Curarse, según los PS que le quedan (`heal`). Venganza, Transformación,
 *   Conversión, Mimético, Metrónomo y los golpes fulminantes, su valor.
 *
 * 0 si no sirve: no afecta al objetivo (inmune por tipo o por habilidad), Come
 * Sueños contra un objetivo despierto, curarse con PS de sobra… Los estados
 * no se valoran aquí, sino con `aiStatusValue`.
 * @param {Object} move - Movimiento de moves.json o el ataque básico
 * @param {AiContext} ctx
 * @returns {number}
 */
export function aiMoveScore(move, ctx) {
  const { attackerInfo, attackerFighter, defenderInfo, defenderFighter, typeChart } = ctx;
  const W = AI_WEIGHTS;
  const kind = aiMoveKind(move);
  if (kind === 'status' || !aiCanAffect(move, ctx)) return 0;
  const hpRatio = attackerFighter ? attackerFighter.hp / Math.max(1, attackerFighter.maxHp) : 1;
  const accuracy = move.accuracy && move.accuracy < 100 ? move.accuracy / 100 : 1;
  const effect = move.effect;

  switch (effect) {
    case 'bide':
      if (attackerFighter?.biding) return W.bide.release;
      return hpRatio > W.bide.startMinHp ? W.bide.start : W.bide.startLowHp;
    case 'heal_self':
    case 'rest':
      return W.heal.find((h) => hpRatio < h.below)?.score ?? 0;
    case 'transform':
      return attackerFighter?._preTransform ? 0 : W.effects.transform;
    case 'conversion': {
      const target = defenderInfo?.types?.[0];
      return !target || (attackerInfo.types || []).join() === target ? 0 : W.effects.conversion;
    }
    case 'mimic':
      return (defenderInfo?.currentMoves || []).length ? W.effects.mimic : 0;
    case 'random_move':
      return W.effects.random_move;
    case 'ohko':
      return (attackerInfo.level || 1) >= (defenderInfo.level || 1) ? W.effects.ohko * accuracy : 0;
    case 'drain_sleep':
      // Come Sueños falla si el objetivo está despierto
      if (!(defenderFighter?.statusEffects || []).some((s) => s.type === 'sleep')) return 0;
      break;
    default:
      if (FIXED_DAMAGE.includes(effect)) {
        return powerForDamage(fixedDamage(move, ctx), attackerInfo.level || 1) * accuracy;
      }
  }
  const eff = typeEffectiveness(move, defenderInfo, typeChart);
  if (getAbility(defenderInfo) === 'wonder_guard' && eff <= 1) return 0;
  const stab = (move.stab ?? (attackerInfo.types || []).includes(move.type)) ? W.stab : 1;
  return move.power * hitsPerTurn(move) * stab * eff * (eff >= 2 ? W.superEffective : 1) * accuracy;
}

/**
 * Si un movimiento de estado aún sirve, entre 0 y 1:
 * - 0 si el estado ya está puesto, el objetivo es inmune (por tipo, habilidad
 *   u objeto) o ya tiene otro estado mayor, y si es un jefe para lo que no le
 *   afecta (bajadas de características, Drenadoras, Anulación, Tóxico, Rugido).
 * - Las bajadas y las subidas de características, lo que les queda hasta
 *   `statStageCap` (1 sin cambios, ½ con uno, 0 en el tope). Las subidas, con
 *   pocos PS (`status.setupMinHp`), por `status.setupLowHp`.
 * - Rugido, Remolino y Teletransporte, solo con poca vida (`status.escapeBelowHp`).
 * @param {Object} move
 * @param {AiContext} ctx
 * @returns {number}
 */
export function aiStatusValue(move, ctx) {
  const { attackerFighter, defenderInfo, defenderFighter, targetIsBoss } = ctx;
  const S = AI_WEIGHTS.status;
  const effect = move.effect;
  if (!effect || aiMoveKind(move) !== 'status' || !aiCanAffect(move, ctx)) return 0; // Salpicadura: nada
  const own = attackerFighter || {};
  const hpRatio = attackerFighter ? own.hp / Math.max(1, own.maxHp) : 1;
  const statuses = defenderFighter?.statusEffects || [];
  const types = defenderInfo?.types || [];
  const ability = getAbility(defenderInfo);

  if (STAT_UPS[effect]) {
    return stageRoom(own.statModifiers?.[STAT_UPS[effect]] || 0) * (hpRatio > S.setupMinHp ? 1 : S.setupLowHp);
  }
  if (STATUS_IMMUNE_ABILITIES[effect]?.includes(ability)) return 0;
  switch (effect) {
    case 'sleep':
    case 'paralyze':
    case 'poison':
    case 'badly_poison':
    case 'burn':
    case 'freeze':
      if (statuses.some((s) => MAJOR_STATUS.includes(s.type))) return 0;
      if (STATUS_IMMUNE_TYPES[effect]?.some((t) => types.includes(t))) return 0;
      if (effect === 'sleep' && move.type === 'grass' && types.includes('grass')) return 0;
      if (effect === 'badly_poison' && targetIsBoss) return 0;
      return heldPreventsStatus(defenderInfo, effect) ? 0 : 1;
    case 'confuse':
      return statuses.some((s) => s.type === 'confuse') ? 0 : 1;
    case 'leech_seed':
      return targetIsBoss || types.includes('grass') || statuses.some((s) => s.type === 'leech_seed') ? 0 : 1;
    case 'disable':
      return targetIsBoss || (defenderInfo?.currentMoves || []).some((m) => m && m.enabled === false) ? 0 : 1;
    case 'switch_out':
      return !targetIsBoss && hpRatio < S.escapeBelowHp ? 1 : 0;
    case 'flee':
      return hpRatio < S.escapeBelowHp ? 1 : 0;
    case 'reflect':
      return own.reflect > 0 ? 0 : 1;
    case 'light_screen':
      return own.lightScreen > 0 ? 0 : 1;
    case 'substitute':
      return own.substitute > 0 || (own.hp ?? 1) <= Math.floor((own.maxHp ?? 1) / 4) ? 0 : 1;
    case 'focus_energy':
      return own.focusEnergy ? 0 : 1;
    case 'protect_stats':
      return own.protectStats > 0 ? 0 : 1;
    case 'reset_stats': {
      const worse = Object.values(own.statModifiers || {}).some((v) => v < 0);
      const better = Object.values(defenderFighter?.statModifiers || {}).some((v) => v > 0);
      return worse || better ? 1 : 0;
    }
    default: {
      const down = STAT_DOWNS[effect];
      if (!down) return 1;
      if (targetIsBoss || defenderFighter?.protectStats > 0 || down.blockedBy.includes(ability)) return 0;
      return stageRoom(-(defenderFighter?.statModifiers?.[down.stat] || 0));
    }
  }
}

/**
 * Elige lo que hace la IA (salvajes, jefes y aliados):
 * 1. Ataca con lo que más vale (`aiMoveScore`), con una variación al azar
 *    (`randomFactor` de combat.json) para que no sea siempre lo mismo.
 * 2. De vez en cuando usa un estado que aún sirva (`aiStatusValue`): con
 *    probabilidad `status.chance` × lo que sirve el más útil. Si no tiene nada
 *    que haga daño, los usa siempre que sirvan. Curarse cuando hace falta va
 *    antes que un estado.
 * Nunca elige lo que no sirve (un estado ya puesto, una característica en el
 * tope, una cura con PS de sobra, algo a lo que el objetivo es inmune) ni lo
 * que no puede usar: sin PP, anulado o reservado por el jugador (`aiCanUse`).
 * @param {Object} attackerInfo - PokemonInfo del atacante
 * @param {Object} defenderInfo - PokemonInfo del objetivo
 * @param {Object[]} movesData - moves.json
 * @param {Object} typeChart - types.json
 * @param {Object} [attackerFighter] - Fighter del atacante
 * @param {Object} [defenderFighter] - Fighter del objetivo
 * @param {{
 *   basicAttack?: Object | null,
 *   canUse?: ((move: Object) => boolean) | null,
 *   targetIsBoss?: boolean,
 *   fallback?: boolean,
 * }} [options]
 *   - `basicAttack`: el ataque básico (`basicAttackMove`), como un ataque más.
 *   - `canUse`: solo los movimientos que lo cumplan (los que alcanzan desde lejos).
 *   - `targetIsBoss`: a los jefes no les bajan las características, ni les
 *     afectan Drenadoras, Anulación, Tóxico ni Rugido.
 *   - `fallback`: si nada sirve, el primer movimiento que pueda usar (sí, por defecto).
 * @returns {Object|null} El movimiento (o el ataque básico), o null si no hay nada
 */
export function selectBestMove(attackerInfo, defenderInfo, movesData, typeChart, attackerFighter, defenderFighter, options = {}) {
  const { basicAttack = null, canUse = null, targetIsBoss = false, fallback = true } = options;
  const usable = (attackerInfo?.currentMoves || [])
    .filter(aiCanUse)
    .map((slot) => movesData.find((m) => m.id === slot.moveId))
    .filter((move) => move && (!canUse || canUse(move)));
  /** @type {AiContext} */
  const ctx = { attackerInfo, defenderInfo, typeChart, attackerFighter, defenderFighter, targetIsBoss };
  const W = AI_WEIGHTS;

  /** @type {{ move: Object, score: number }[]} */
  const scored = [];
  /** @type {{ move: Object, useful: number }[]} */
  const statuses = [];
  for (const move of basicAttack ? [...usable, basicAttack] : usable) {
    if (aiMoveKind(move) === 'status') {
      const useful = aiStatusValue(move, ctx);
      if (useful > 0) statuses.push({ move, useful });
    } else {
      const score = aiMoveScore(move, ctx);
      if (score > 0) scored.push({ move, score });
    }
  }
  const best = (kind) => Math.max(0, ...scored.filter((c) => aiMoveKind(c.move) === kind).map((c) => c.score));
  const bestAttack = best('attack');

  let pool = scored;
  if (statuses.length && best('special') <= bestAttack) {
    const useful = Math.max(...statuses.map((s) => s.useful));
    if (bestAttack === 0 || random() < W.status.chance * useful) {
      pool = statuses.map(({ move, useful: u }) => ({ move, score: u * (move.accuracy && move.accuracy < 100 ? move.accuracy / 100 : 1) }));
    }
  }

  const [lo, hi] = W.randomFactor;
  let bestMove = null;
  let bestScore = 0;
  for (const { move, score } of pool) {
    const rolled = score * (lo + random() * (hi - lo));
    if (rolled > bestScore) {
      bestScore = rolled;
      bestMove = move;
    }
  }
  // Nada sirve: el primer movimiento que pueda usar (nunca uno anulado ni reservado)
  if (!bestMove && fallback) bestMove = usable[0] ?? null;
  return bestMove;
}
