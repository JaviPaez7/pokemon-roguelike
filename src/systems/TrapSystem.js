import { RNG } from 'rot-js';
import { getAbility } from './AbilitySystem.js';
import { revertTransform } from './CombatSystem.js';

/**
 * TrapSystem.js
 * 
 * Sistema que gestiona las trampas en las mazmorras.
 * Define qué tipos de trampa existen y qué efectos tienen al pisarse.
 */

export const TRAP_TYPES = ['poison', 'sleep', 'explosion', 'warp', 'sticky', 'wonder_tile'];

/**
 * Genera trampas aleatorias en el piso.
 * @param {Array} points - Posiciones válidas [{x, y}]
 * @param {number} count - Número de trampas a colocar
 * @param {Object} entityManager - El EntityManager
 */
export function spawnTraps(points, count, entityManager, floor = 99) {
  const availablePoints = [...points];
  
  // Barajar (RNG del piso)
  for (let i = availablePoints.length - 1; i > 0; i--) {
    const j = Math.floor(RNG.getUniform() * (i + 1));
    [availablePoints[i], availablePoints[j]] = [availablePoints[j], availablePoints[i]];
  }

  // Pisos tempranos: sin explosión; sticky más tarde
  let pool = TRAP_TYPES;
  if (floor <= 3) pool = ['poison', 'sleep', 'warp', 'wonder_tile'];
  else if (floor <= 8) pool = TRAP_TYPES.filter(t => t !== 'explosion');

  let placed = 0;
  for (let i = 0; i < availablePoints.length && placed < count; i++) {
    const point = availablePoints[i];
    // No colocar trampas sobre objetos, Pokémon u otras trampas
    if (entityManager.getItemAt(point.x, point.y) !== null) continue;
    if (entityManager.getTrapAt && entityManager.getTrapAt(point.x, point.y) !== null) continue;
    if (entityManager.getEntityAt(point.x, point.y) !== null) continue;

    let type = pool[Math.floor(RNG.getUniform() * pool.length)];
    // Baldosa mágica ~12% de las trampas (re-roll si sale demasiado a menudo)
    if (type === 'wonder_tile' && RNG.getUniform() > 0.45) {
      const nonWonder = pool.filter(t => t !== 'wonder_tile');
      type = nonWonder[Math.floor(RNG.getUniform() * nonWonder.length)] || type;
    }
    // Las Baldosas Milagro siempre son visibles
    const isHidden = type !== 'wonder_tile';
    entityManager.createTrapEntity(type, point.x, point.y, isHidden);
    placed++;
  }
}

/**
 * Activa una trampa sobre una entidad objetivo.
 * @param {number} targetEntityId - Entidad que pisa la trampa
 * @param {number} trapEntityId - Entidad de la trampa
 * @param {Object} entityManager - El EntityManager
 * @param {Object} tileMap - El mapa actual (útil para warp)
 * @returns {Array<string>} Mensajes para el log de combate
 */
export function triggerTrap(targetEntityId, trapEntityId, entityManager, tileMap) {
  const messages = [];
  const trap = entityManager.getComponent(trapEntityId, 'trap');
  const targetInfo = entityManager.getComponent(targetEntityId, 'pokemonInfo');
  const targetFighter = entityManager.getComponent(targetEntityId, 'fighter');

  if (!trap || !targetInfo || !targetFighter) return messages;

  // Revelar la trampa
  trap.isHidden = false;
  entityManager.setComponent(trapEntityId, 'trap', trap);

  // Levitación evita trampas del suelo (excepto baldosa mágica)
  const ability = getAbility(targetInfo);
  if ((ability === 'levitate' || ability === 'flying_type') && trap.type !== 'wonder_tile') {
    const why = ability === 'levitate' ? 'Levitación' : 'su tipo Volador';
    messages.push(`¡${targetInfo.name} evitó la trampa gracias a ${why}!`);
    return messages;
  }
  
  if (trap.type !== 'wonder_tile') {
    messages.push(`¡${targetInfo.name} ha pisado una trampa!`);
  }

  // Inicializar statusEffects si no existe
  if (!targetFighter.statusEffects) {
    targetFighter.statusEffects = [];
  }

  // Aplicar efecto de la trampa
  switch (trap.type) {
    case 'poison': {
      const hasMajor = targetFighter.statusEffects.some(s =>
        ['burn', 'poison', 'paralyze', 'freeze', 'sleep'].includes(s.type));
      if (!hasMajor &&
          !(targetInfo.types || []).includes('poison') && !(targetInfo.types || []).includes('steel')) {
        targetFighter.statusEffects.push({ type: 'poison', turnsLeft: 4 });
        messages.push(`¡La trampa envenenó a ${targetInfo.name}!`);
      } else {
        messages.push(`¡Pero no tuvo ningún efecto en ${targetInfo.name}!`);
      }
      break;
    }

    case 'sleep': {
      const ab = getAbility(targetInfo);
      if (ab === 'insomnia' || ab === 'vital_spirit') {
        messages.push(ab === 'insomnia' ? '¡Insomnio evitó dormir!' : '¡Espíritu Vital evitó dormir!');
        break;
      }
      const hasMajor = targetFighter.statusEffects.some(s =>
        ['burn', 'poison', 'paralyze', 'freeze', 'sleep'].includes(s.type));
      if (!hasMajor) {
        let turns = Math.floor(Math.random() * 2) + 1;
        if (getAbility(targetInfo) === 'early_bird') turns = 1;
        targetFighter.statusEffects.push({ type: 'sleep', turnsLeft: turns });
        messages.push(`¡El gas somnífero durmió a ${targetInfo.name}!`);
      } else {
        messages.push(`¡Pero no tuvo ningún efecto!`);
      }
      break;
    }

    case 'explosion': {
      let damage = Math.max(1, Math.floor(targetFighter.maxHp * 0.07));
      if (entityManager.hasComponent(targetEntityId, 'partyMember')) {
        damage = Math.max(1, Math.floor(targetFighter.maxHp * 0.05));
      }
      if (getAbility(targetInfo) === 'sturdy' && targetFighter.hp === targetFighter.maxHp) {
        damage = Math.min(damage, targetFighter.maxHp - 1);
        messages.push('¡Robustez amortiguó la explosión!');
      }
      targetFighter.hp = Math.max(0, targetFighter.hp - damage);
      if (targetFighter.charging) {
        targetFighter.charging = null;
        messages.push(`¡${targetInfo.name} fue interrumpido!`);
      }
      messages.push(`¡BOOM! ¡La trampa explotó causando ${damage} de daño!`);
      break;
    }

    case 'warp':
      if (tileMap && tileMap.rooms && tileMap.rooms.length > 0) {
        const pos = entityManager.getComponent(targetEntityId, 'position');
        if (pos) {
          let placed = false;
          for (let attempt = 0; attempt < 40 && !placed; attempt++) {
            const randomRoom = tileMap.rooms[Math.floor(Math.random() * tileMap.rooms.length)];
            const newX = randomRoom.x + 1 + Math.floor(Math.random() * Math.max(1, randomRoom.w - 2));
            const newY = randomRoom.y + 1 + Math.floor(Math.random() * Math.max(1, randomRoom.h - 2));
            if (!tileMap.isWalkable(newX, newY)) continue;
            const occ = entityManager.getEntityAt(newX, newY);
            if (occ !== null && occ !== targetEntityId) continue;
            pos.x = newX;
            pos.y = newY;
            pos.prevX = newX;
            pos.prevY = newY;
            entityManager.setComponent(targetEntityId, 'position', pos);
            messages.push(`¡${targetInfo.name} ha sido teletransportado!`);
            placed = true;
          }
          if (!placed) messages.push(`¡El teletransporte falló!`);
        }
      }
      break;

    case 'sticky':
      if (getAbility(targetInfo) === 'clear_body') {
        messages.push('¡Cuerpo Puro evitó el moco pegajoso!');
        break;
      }
      if (!targetFighter.statModifiers) targetFighter.statModifiers = {};
      const curSpd = targetFighter.statModifiers.speed || 0;
      if (curSpd > -3) {
        targetFighter.statModifiers.speed = curSpd - 1;
        messages.push(`¡Un moco pegajoso bajó la velocidad de ${targetInfo.name}!`);
      } else {
        messages.push(`¡${targetInfo.name} ya está demasiado pegajoso!`);
      }
      if (targetFighter.charging) {
        targetFighter.charging = null;
        messages.push(`¡${targetInfo.name} fue interrumpido!`);
      }
      break;

    case 'wonder_tile': {
      const pos = entityManager.getComponent(targetEntityId, 'position');
      const tileKey = pos ? `${pos.x},${pos.y}` : '';
      const mods = targetFighter.statModifiers || {};
      const needsStats = ['attack','defense','speed','spAtk','spDef'].some(k => (mods[k] || 0) !== 0);
      const hadStatus = !!(targetFighter.statusEffects && targetFighter.statusEffects.length);
      const needsPP = !!(targetInfo.currentMoves && targetInfo.currentMoves.some(m => m && m.currentPP < m.maxPP));
      const needsHp = targetFighter.hp > 0 && targetFighter.hp < targetFighter.maxHp;
      const needsBelly = targetFighter.belly != null && targetFighter.belly < (targetFighter.maxBelly || 100);
      const needsCombatClear = !!(targetFighter.charging || targetFighter.biding || targetFighter.mustRecharge
        || targetFighter.rage || targetFighter.focusEnergy || targetFighter.protectStats || targetFighter._preTransform);
      if (targetFighter._wonderTileKey === tileKey && !needsStats && !hadStatus && !needsPP
          && !needsHp && !needsBelly && !needsCombatClear) {
        break; // ya curado en esta baldosa; no spamear
      }
      targetFighter.statModifiers = {
        attack: 0, defense: 0, speed: 0, spAtk: 0, spDef: 0
      };
      targetFighter.statusEffects = [];
      targetFighter.flinched = false;
      const _spr = entityManager.getComponent(targetEntityId, 'sprite');
      const didRevert = revertTransform(targetFighter, targetInfo, _spr);
      if (didRevert && _spr) entityManager.setComponent(targetEntityId, 'sprite', _spr);
      if (targetInfo.currentMoves) {
        targetInfo.currentMoves.forEach(m => {
          m.currentPP = m.maxPP;
          m.enabled = true;
          delete m._disableTurns;
        });
        entityManager.setComponent(targetEntityId, 'pokemonInfo', targetInfo);
      }
      targetFighter.charging = null;
      targetFighter.biding = null;
      targetFighter.mustRecharge = false;
      targetFighter.rage = false;
      targetFighter.focusEnergy = false;
      targetFighter.protectStats = 0;
      let healMsg = '';
      if (needsHp) {
        const heal = Math.max(1, Math.floor(targetFighter.maxHp * 0.15));
        targetFighter.hp = Math.min(targetFighter.maxHp, targetFighter.hp + heal);
        healMsg = ` y +${heal} PS`;
      }
      if (needsBelly) {
        targetFighter.belly = Math.min(targetFighter.maxBelly || 100, targetFighter.belly + 10);
        healMsg += ' y +10 tripa';
      }
      targetFighter._wonderTileKey = tileKey;
      const statusMsg = hadStatus ? ', estados curados' : '';
      const formMsg = didRevert ? ', forma original' : '';
      if (needsStats || hadStatus || needsPP || needsHp || needsBelly || needsCombatClear || didRevert) {
        messages.push(`¡Baldosa Mágica! Stats y PP de ${targetInfo.name} restaurados${statusMsg}${formMsg}${healMsg}.`);
      }
      break;
    }

    default:
      messages.push(`¡Pero la trampa falló!`);
  }

  // Guardar cambios del fighter
  entityManager.setComponent(targetEntityId, 'fighter', targetFighter);

  // Reducir usos (las baldosas milagro son infinitas)
  if (trap.type !== 'wonder_tile') {
    trap.uses--;
    if (trap.uses <= 0) {
      entityManager.destroyEntity(trapEntityId);
      messages.push(`La trampa se rompió.`);
    }
  }

  return messages;
}
