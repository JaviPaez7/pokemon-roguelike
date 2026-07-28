/**
 * EnemyAI.js — Comportamientos de IA para Pokémon enemigos
 * Comportamientos: wander, chase, flee, attack
 */
import { Path } from 'rot-js';
import { ENEMY_DETECT_RANGE } from '../constants.js';
import { canWalkOnTile } from '../systems/MovementSystem.js';
import { getAbility } from '../systems/AbilitySystem.js';

/**
 * Determina la acción de un enemigo
 * @param {number} entityId - ID del enemigo
 * @param {Object} entityManager - EntityManager
 * @param {Object} tileMap - TileMap
 * @param {Object} playerPos - Posición del jugador {x, y}
 * @param {number} playerEntityId - ID de la entidad jugador
 * @returns {Object|null} Acción: { type: 'move', dx, dy } o { type: 'attack', targetId } o null
 */
/**
 * Objetivo del equipo más cercano (líder o aliados vivos).
 */
function findNearestPartyTarget(entityManager, fromPos) {
  const partyIds = entityManager.getEntitiesWithComponents('partyMember', 'position', 'fighter');
  let bestId = null;
  let bestPos = null;
  let bestDist = Infinity;

  for (const id of partyIds) {
    const fighter = entityManager.getComponent(id, 'fighter');
    const p = entityManager.getComponent(id, 'position');
    if (!fighter || !p || fighter.hp <= 0) continue;
    const dist = Math.max(Math.abs(fromPos.x - p.x), Math.abs(fromPos.y - p.y));
    if (dist < bestDist) {
      bestDist = dist;
      bestId = id;
      bestPos = p;
    }
  }

  return bestId != null ? { id: bestId, pos: bestPos, distance: bestDist } : null;
}


/** Casillas bloqueadas para pathfinding (1 pasada; evita getEntityAt por nodo). */
function buildBlockedSet(entityManager, selfId, goalX, goalY, passParty = false) {
  const blocked = new Set();
  const ids = entityManager.getEntitiesWithComponents('position', 'pokemonInfo');
  for (const id of ids) {
    if (id === selfId) continue;
    if (passParty && entityManager.hasComponent(id, 'partyMember')) continue;
    const f = entityManager.getComponent(id, 'fighter');
    if (f && f.hp <= 0) continue;
    const p = entityManager.getComponent(id, 'position');
    if (!p) continue;
    if (p.x === goalX && p.y === goalY) continue;
    blocked.add(`${p.x},${p.y}`);
  }
  return blocked;
}

/** A* corto con caché; si está lejos o falla, movimiento goloso (no congela el juego). */
function pathTowards(entityId, pos, goalPos, tileMap, entityManager, { passParty = false } = {}) {
  const distance = Math.max(Math.abs(pos.x - goalPos.x), Math.abs(pos.y - goalPos.y));
  if (distance <= 1) return null;
  // Lejos: A* en mapa grande congela el hilo; ir en línea es suficiente
  if (distance > 10) {
    return moveTowards(pos, goalPos, tileMap, entityManager, entityId);
  }
  const blocked = buildBlockedSet(entityManager, entityId, goalPos.x, goalPos.y, passParty);
  const passableCallback = (x, y) => {
    if (x === goalPos.x && y === goalPos.y) return true;
    if (!canWalkOnTile(entityId, x, y, tileMap, entityManager)) return false;
    return !blocked.has(`${x},${y}`);
  };
  try {
    const astar = new Path.AStar(goalPos.x, goalPos.y, passableCallback, { topology: 8 });
    const path = [];
    astar.compute(pos.x, pos.y, (x, y) => { path.push({ x, y }); });
    if (path.length >= 2) {
      return { type: 'move', dx: path[1].x - pos.x, dy: path[1].y - pos.y };
    }
  } catch (e) {
    console.warn('[AI] pathfinding fallback', e);
  }
  return moveTowards(pos, goalPos, tileMap, entityManager, entityId);
}

export function getEnemyAction(entityId, entityManager, tileMap, playerPos, playerEntityId, game) {
  const pos = entityManager.getComponent(entityId, 'position');
  const ai = entityManager.getComponent(entityId, 'aiControlled');
  const fighter = entityManager.getComponent(entityId, 'fighter');
  
  if (!pos || !ai || !fighter) return null;
  if (fighter.hp <= 0) return { type: 'wait' };

  // Si es un seguidor (aliado del jugador)
  if ((ai.behavior || 'wander') === 'follower') {
    return followerAction(entityId, pos, playerPos, tileMap, entityManager, game);
  }

  // Salvajes atrapados: solo golpean o esperan
  const boundF = entityManager.getComponent(entityId, 'fighter');
  if (boundF?.statusEffects?.some(s => s.type === 'bound')) {
    const near = [];
    for (let oy = -1; oy <= 1; oy++) {
      for (let ox = -1; ox <= 1; ox++) {
        if (ox === 0 && oy === 0) continue;
        const oid = entityManager.getEntityAt(pos.x + ox, pos.y + oy, false);
        if (oid != null && entityManager.hasComponent(oid, 'partyMember')) {
          const of = entityManager.getComponent(oid, 'fighter');
          if (of && of.hp > 0) near.push(oid);
        }
      }
    }
    if (near.length) return { type: 'attack', targetId: near[0], regularAttack: true };
    return { type: 'wait' };
  }

  const partyTarget = findNearestPartyTarget(entityManager, pos);
  const focusPos = partyTarget ? partyTarget.pos : playerPos;
  const focusId = partyTarget ? partyTarget.id : playerEntityId;
  const distance = partyTarget
    ? partyTarget.distance
    : Math.max(Math.abs(pos.x - playerPos.x), Math.abs(pos.y - playerPos.y));
  const detectRange = ai.detectRange || ENEMY_DETECT_RANGE;

  // Determinar comportamiento basado en estado
  let behavior = ai.behavior || 'wander';
  
  const isBoss = entityManager.hasComponent(entityId, 'boss')
    || entityManager.hasComponent(entityId, 'isBoss');

  // Si HP bajo, huir (los jefes no huyen). Fuga (run_away) huye antes.
  const info = entityManager.getComponent(entityId, 'pokemonInfo');
  const ability = info?.ability ? String(info.ability).toLowerCase().replace(/-/g, '_') : '';
  const fleeThreshold = (ability === 'run_away' || ability === 'runaway') ? 0.4 : 0.25;
  if (!isBoss && fighter.hp / fighter.maxHp < fleeThreshold) {
    behavior = 'flee';
  }
  // Si el equipo está en rango de detección, perseguir
  else if (distance <= detectRange) {
    const wasIdle = (ai.behavior || 'wander') === 'wander';
    behavior = 'chase';
    ai.alertedTo = focusId;
    // Intimidación al detectar por primera vez
    const aggroAbility = getAbility(info) || '';
    if (wasIdle && (aggroAbility === 'intimidate' || aggroAbility === 'intimidation') && focusId) {
      const focusFighter = entityManager.getComponent(focusId, 'fighter');
      const focusInfo = entityManager.getComponent(focusId, 'pokemonInfo');
      if (focusFighter) {
        if (!focusFighter._intimidatedBy) focusFighter._intimidatedBy = [];
        if (!focusFighter._intimidatedBy.includes(entityId)) {
          focusFighter._intimidatedBy.push(entityId);
          const fab = getAbility(focusInfo);
          if (fab === 'clear_body' || fab === 'hyper_cutter') {
            entityManager.setComponent(focusId, 'fighter', focusFighter);
            if (game?.eventBus) {
              game.eventBus.emit('message', {
                text: fab === 'hyper_cutter' ? '¡Corte Fuerte evitó Intimidación!' : '¡Cuerpo Puro evitó Intimidación!',
                color: '#aaffaa'
              });
            }
          } else {
            if (!focusFighter.statModifiers) focusFighter.statModifiers = {};
            focusFighter.statModifiers.attack = Math.max(-6, (focusFighter.statModifiers.attack || 0) - 1);
            entityManager.setComponent(focusId, 'fighter', focusFighter);
            if (game?.eventBus) {
              game.eventBus.emit('message', {
                text: `¡Intimidación de ${info.name} bajó el Ataque de ${focusInfo?.name || 'tu Pokémon'}!`,
                color: '#ffaa66'
              });
            }
          }
        }
      }
    }
  }
  // Si ya estaba alerta pero el equipo se alejó mucho, volver a wander
  else if (distance > detectRange * 2) {
    behavior = 'wander';
    ai.alertedTo = null;
  }

  // Actualizar comportamiento
  ai.behavior = behavior;
  entityManager.setComponent(entityId, 'aiControlled', ai);

  switch (behavior) {
    case 'chase':
      return chaseAction(entityId, pos, focusPos, focusId, tileMap, entityManager);
    case 'flee':
      return fleeAction(entityId, pos, focusPos, tileMap, entityManager, focusId);
    case 'wander':
    default:
      return wanderAction(entityId, pos, tileMap, entityManager);
  }
}

/**
 * Perseguir al jugador usando pathfinding A*
 */
function chaseAction(entityId, pos, playerPos, playerEntityId, tileMap, entityManager) {
  const distance = Math.max(Math.abs(pos.x - playerPos.x), Math.abs(pos.y - playerPos.y));

  // Si está adyacente, atacar
  if (distance === 1) {
    return { type: 'attack', targetId: playerEntityId };
  }

  return pathTowards(entityId, pos, playerPos, tileMap, entityManager, { passParty: true });
}

/**
 * Huir del jugador
 */
function fleeAction(entityId, pos, playerPos, tileMap, entityManager, focusId = null) {
  // Moverse en dirección opuesta al objetivo
  const dx = pos.x - playerPos.x;
  const dy = pos.y - playerPos.y;
  
  // Normalizar dirección
  const directions = [];
  if (dx !== 0) directions.push({ dx: Math.sign(dx), dy: 0 });
  if (dy !== 0) directions.push({ dx: 0, dy: Math.sign(dy) });
  
  // Añadir todas las direcciones posibles
  directions.push(
    { dx: 0, dy: 1 }, { dx: 0, dy: -1 }, { dx: 1, dy: 0 }, { dx: -1, dy: 0 },
    { dx: 1, dy: 1 }, { dx: -1, dy: 1 }, { dx: 1, dy: -1 }, { dx: -1, dy: -1 }
  );

  for (const dir of directions) {
    const newX = pos.x + dir.dx;
    const newY = pos.y + dir.dy;
    if (canWalkOnTile(entityId, newX, newY, tileMap, entityManager) && !entityManager.getEntityAt(newX, newY)) {
      return { type: 'move', dx: dir.dx, dy: dir.dy };
    }
  }

  // Acosado: atacar al miembro del equipo adyacente
  if (focusId != null) {
    const tPos = entityManager.getComponent(focusId, 'position');
    if (tPos && Math.max(Math.abs(pos.x - tPos.x), Math.abs(pos.y - tPos.y)) <= 1) {
      return { type: 'attack', targetId: focusId };
    }
  }
  return null;
}

/**
 * Moverse aleatoriamente
 */
function wanderAction(entityId, pos, tileMap, entityManager) {
  // 15% de probabilidad de quedarse quieto
  if (Math.random() < 0.15) return { type: 'wait' };

  // Direcciones aleatorias
  const directions = [
    { dx: 0, dy: -1 }, { dx: 0, dy: 1 }, { dx: -1, dy: 0 }, { dx: 1, dy: 0 },
    { dx: -1, dy: -1 }, { dx: 1, dy: -1 }, { dx: -1, dy: 1 }, { dx: 1, dy: 1 }
  ];

  // Barajar direcciones
  for (let i = directions.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [directions[i], directions[j]] = [directions[j], directions[i]];
  }

  for (const dir of directions) {
    const newX = pos.x + dir.dx;
    const newY = pos.y + dir.dy;
    if (canWalkOnTile(entityId, newX, newY, tileMap, entityManager) && !entityManager.getEntityAt(newX, newY)) {
      return { type: 'move', dx: dir.dx, dy: dir.dy };
    }
  }

  return null; // No se puede mover
}

/**
 * Intenta moverse hacia un objetivo sin pathfinding
 */
function moveTowards(pos, target, tileMap, entityManager, entityId) {
  const dx = Math.sign(target.x - pos.x);
  const dy = Math.sign(target.y - pos.y);

  // Intentar moverse directo (puede ser diagonal)
  const attempts = [];
  if (dx !== 0 || dy !== 0) attempts.push({ dx, dy });
  if (dx !== 0) attempts.push({ dx, dy: 0 });
  if (dy !== 0) attempts.push({ dx: 0, dy });

  for (const attempt of attempts) {
    const newX = pos.x + attempt.dx;
    const newY = pos.y + attempt.dy;
    if (canWalkOnTile(entityId, newX, newY, tileMap, entityManager)) {
      const blocker = entityManager.getEntityAt(newX, newY);
      if (!blocker || blocker === entityId) {
        return { type: 'move', dx: attempt.dx, dy: attempt.dy };
      }
    }
  }

  return null;
}

/**
 * Encuentra la casilla caminable y desocupada más cercana adyacente a una posición central
 * usando búsqueda concéntrica de radio 0 a 3.
 */
function findClosestSafeTile(entityId, centerPos, tileMap, entityManager) {
  for (let r = 0; r <= 3; r++) {
    for (let dx = -r; dx <= r; dx++) {
      for (let dy = -r; dy <= r; dy++) {
        // Solo comprobar el borde exterior del cuadrado de radio r
        if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;

        const tx = centerPos.x + dx;
        const ty = centerPos.y + dy;

        // Verificar límites del mapa
        const width = tileMap.getWidth ? tileMap.getWidth() : tileMap.width;
        const height = tileMap.getHeight ? tileMap.getHeight() : tileMap.height;
        if (tx < 0 || tx >= width || ty < 0 || ty >= height) continue;

        // Verificar si la entidad puede caminar por este tipo de tile
        if (!canWalkOnTile(entityId, tx, ty, tileMap, entityManager)) continue;

        // Verificar que no esté ocupada por otra entidad
        const occupant = entityManager.getEntityAt(tx, ty);
        if (occupant === null) {
          return { x: tx, y: ty };
        }
      }
    }
  }
  return null;
}

/**
 * Comportamiento de seguidor (miembros del equipo)
 */
function followerAction(entityId, pos, playerPos, tileMap, entityManager, game) {
  const partyMember = entityManager.getComponent(entityId, 'partyMember');
  if (!partyMember || !game) return { type: 'wait' };

  const selfF = entityManager.getComponent(entityId, 'fighter');
  if (selfF?.statusEffects?.some(s => s.type === 'bound')) {
    // Solo puede atacar adyacentes
    const hostiles = entityManager.getEntitiesWithComponents('position', 'fighter').filter(id => {
      if (id === entityId || entityManager.hasComponent(id, 'partyMember')) return false;
      const hf = entityManager.getComponent(id, 'fighter');
      if (!hf || hf.hp <= 0) return false;
      const hp = entityManager.getComponent(id, 'position');
      return hp && Math.max(Math.abs(pos.x - hp.x), Math.abs(pos.y - hp.y)) <= 1;
    });
    if (hostiles.length) {
      return { type: 'attack', targetId: hostiles[0], regularAttack: true };
    }
    return { type: 'wait' };
  }

  const tactic = partyMember.tactic || 'follow';
  const distToPlayer = Math.max(Math.abs(pos.x - playerPos.x), Math.abs(pos.y - playerPos.y));

  // ── 1. TÁCTICA "ESPERAR AHÍ" (STAY) ──
  if (tactic === 'stay' || tactic === 'wait') {
    // Buscar enemigo adyacente (distancia 1) para atacar
    const adjacentOffsets = [[0, -1], [0, 1], [-1, 0], [1, 0], [-1, -1], [1, -1], [-1, 1], [1, 1]];
    for (const offset of adjacentOffsets) {
      const targetX = pos.x + offset[0];
      const targetY = pos.y + offset[1];
      const targetId = entityManager.getEntityAt(targetX, targetY);
      if (targetId !== null && targetId !== game._playerId) {
        if (!entityManager.hasComponent(targetId, 'partyMember') && entityManager.hasComponent(targetId, 'fighter')) {
          const tf = entityManager.getComponent(targetId, 'fighter');
          if (tf && tf.hp > 0) {
            return { type: 'attack', targetId: targetId };
          }
        }
      }
    }
    // Teletransporte de seguridad extrema si el jugador se aleja más de 12 baldosas
    if (distToPlayer > 12) {
      const safeTile = findClosestSafeTile(entityId, playerPos, tileMap, entityManager);
      if (safeTile) {
        pos.prevX = pos.x;
        pos.prevY = pos.y;
        pos.x = safeTile.x;
        pos.y = safeTile.y;
        entityManager.setComponent(entityId, 'position', pos);
      }
    }
    return { type: 'wait' };
  }

  // ── 2. TÁCTICA "EVITAR PROBLEMAS" (FLEE) ──
  if (tactic === 'flee') {
    // Buscar enemigos en un rango Chebyshev de 4 casillas
    const hostiles = entityManager.getEntitiesWithComponents('position', 'fighter').filter(id => {
      if (id === game._playerId) return false;
      if (entityManager.hasComponent(id, 'partyMember')) return false;
      const hf = entityManager.getComponent(id, 'fighter');
      if (!hf || hf.hp <= 0) return false;
      const hPos = entityManager.getComponent(id, 'position');
      if (!hPos) return false;
      const dist = Math.max(Math.abs(pos.x - hPos.x), Math.abs(pos.y - hPos.y));
      return dist <= 4;
    });

    if (hostiles.length > 0) {
      let closestHostilePos = null;
      let minHDis = 999;
      for (const hid of hostiles) {
        const hPos = entityManager.getComponent(hid, 'position');
        if (hPos) {
          const dist = Math.max(Math.abs(pos.x - hPos.x), Math.abs(pos.y - hPos.y));
          if (dist < minHDis) {
            minHDis = dist;
            closestHostilePos = hPos;
          }
        }
      }

      if (closestHostilePos) {
        // Moverse en dirección opuesta al enemigo más cercano
        const dx = pos.x - closestHostilePos.x;
        const dy = pos.y - closestHostilePos.y;
        
        const directions = [];
        if (dx !== 0) directions.push({ dx: Math.sign(dx), dy: 0 });
        if (dy !== 0) directions.push({ dx: 0, dy: Math.sign(dy) });
        directions.push(
          { dx: 0, dy: 1 }, { dx: 0, dy: -1 }, { dx: 1, dy: 0 }, { dx: -1, dy: 0 },
          { dx: 1, dy: 1 }, { dx: -1, dy: 1 }, { dx: 1, dy: -1 }, { dx: -1, dy: -1 }
        );

        for (const dir of directions) {
          const newX = pos.x + dir.dx;
          const newY = pos.y + dir.dy;
          if (canWalkOnTile(entityId, newX, newY, tileMap, entityManager) && !entityManager.getEntityAt(newX, newY)) {
            return { type: 'move', dx: dir.dx, dy: dir.dy };
          }
        }

        // Acosado sin escape: atacar al hostil adyacente
        if (minHDis <= 1) {
          const adjId = hostiles.find(hid => {
            const hp = entityManager.getComponent(hid, 'position');
            return hp && Math.max(Math.abs(pos.x - hp.x), Math.abs(pos.y - hp.y)) <= 1;
          });
          if (adjId != null) {
            return { type: 'attack', targetId: adjId, regularAttack: true };
          }
        }
      }
      return { type: 'wait' };
    }
    // Si no hay enemigos en rango, sigue al jugador (cae al flujo normal de abajo)
  }

  // Autocura / Descanso si está muy herido (sin necesitar enemigo al lado)
  {
    const selfFighter = entityManager.getComponent(entityId, 'fighter');
    const selfInfo = entityManager.getComponent(entityId, 'pokemonInfo');
    const hpRatio = selfFighter ? selfFighter.hp / Math.max(1, selfFighter.maxHp) : 1;
    if (selfFighter && selfInfo && selfFighter.hp > 0 && selfInfo.currentMoves && game.movesData) {
      let healIdx = -1;
      let restIdx = -1;
      for (let i = 0; i < selfInfo.currentMoves.length; i++) {
        const slot = selfInfo.currentMoves[i];
        if (!slot || slot.currentPP <= 0 || slot.enabled === false) continue;
        const md = game.movesData.find(m => m.id === slot.moveId);
        if (!md) continue;
        if (md.effect === 'heal_self' && healIdx < 0) healIdx = i;
        if (md.effect === 'rest' && restIdx < 0) restIdx = i;
      }
      // Recuperación/Síntesis antes que Descanso (evita dormirse)
      if (healIdx >= 0 && hpRatio < 0.45) {
        return { type: 'use_move', index: healIdx };
      }
      if (restIdx >= 0 && hpRatio < 0.28) {
        return { type: 'use_move', index: restIdx };
      }
    }
  }

    // ── 3. TÁCTICAS "IR JUNTOS" (FOLLOW) / "A POR ELLOS" (AGGRESSIVE) ──
  const scanRange = tactic === 'aggressive' ? 8 : 3;
  const hostiles = entityManager.getEntitiesWithComponents('position', 'fighter').filter(id => {
    if (id === game._playerId) return false;
    if (entityManager.hasComponent(id, 'partyMember')) return false;
    const hf = entityManager.getComponent(id, 'fighter');
    if (!hf || hf.hp <= 0) return false;

    const hPos = entityManager.getComponent(id, 'position');
    if (!hPos) return false;

    const dist = Math.max(Math.abs(pos.x - hPos.x), Math.abs(pos.y - hPos.y));
    return dist <= scanRange;
  });

  // Encontrar el hostil más cercano
  let targetHostileId = null;
  let minDistance = 999;
  let targetHostilePos = null;

  for (const hostileId of hostiles) {
    const hPos = entityManager.getComponent(hostileId, 'position');
    if (hPos) {
      const dist = Math.max(Math.abs(pos.x - hPos.x), Math.abs(pos.y - hPos.y));
      if (dist < minDistance) {
        minDistance = dist;
        targetHostileId = hostileId;
        targetHostilePos = hPos;
      }
    }
  }

  // Si hay un enemigo en rango
  if (targetHostileId !== null) {
    // Si está adyacente, atacarle (ataque básico si PP bajos)
    if (minDistance === 1) {
      const info = entityManager.getComponent(entityId, 'pokemonInfo');
      const fighter = entityManager.getComponent(entityId, 'fighter');
      const noPp = info && info.currentMoves && info.currentMoves.every(m => !m || m.currentPP <= 0 || m.enabled === false);
      if (!noPp && info && game?.movesData) {
        // Preferir movimiento (IA elige en handleCombat con selectBestMove)
        return { type: 'attack', targetId: targetHostileId, regularAttack: false };
      }
      return { type: 'attack', targetId: targetHostileId, regularAttack: true };
    }

    // Perseguir hostil (A* corto / goloso; no congelar el hilo)
    const chase = pathTowards(entityId, pos, targetHostilePos, tileMap, entityManager, { passParty: true });
    if (chase) return chase;
  }

  // ── 4. SEGUIMIENTO DEL JUGADOR (STANDARD) ──
  // slot 0 = líder; seguidores usan slot-1 como índice en el historial
  const historyIndex = Math.max(0, (partyMember.slot ?? 1) - 1);
  let targetPos = playerPos;

  if (game.playerPathHistory && historyIndex >= 0 && game.playerPathHistory.length > historyIndex) {
    const hist = game.playerPathHistory[historyIndex];
    if (hist && typeof hist.x === 'number' && typeof hist.y === 'number') {
      targetPos = hist;
    }
  }

  // Calcular distancia al objetivo de seguimiento y al jugador
  const distToTarget = Math.max(Math.abs(pos.x - targetPos.x), Math.abs(pos.y - targetPos.y));

  // Si ya estamos en la posicion objetivo o muy cerca, esperar
  if (pos.x === targetPos.x && pos.y === targetPos.y) {
    return { type: 'wait' };
  }

  // Si estamos MUY lejos del jugador (> 5), teleportar cerca de forma segura (evita atascos)
  if (distToPlayer > 6) {
    // Buscar casilla libre transitable cerca del targetPos
    const safeTile = findClosestSafeTile(entityId, targetPos, tileMap, entityManager);
    if (safeTile) {
      pos.prevX = pos.x;
      pos.prevY = pos.y;
      pos.x = safeTile.x;
      pos.y = safeTile.y;
      entityManager.setComponent(entityId, 'position', pos);
    } else {
      // Como fallback alternativo, intentar buscar una casilla libre cerca del jugador directamente
      const safeTilePlayer = findClosestSafeTile(entityId, playerPos, tileMap, entityManager);
      if (safeTilePlayer) {
        pos.prevX = pos.x;
        pos.prevY = pos.y;
        pos.x = safeTilePlayer.x;
        pos.y = safeTilePlayer.y;
        entityManager.setComponent(entityId, 'position', pos);
      }
    }
    return { type: 'wait' }; // Devuelve wait para no hacer doble turno tras teletransporte
  }

  // Moverse hacia targetPos
  const action = moveTowards(pos, targetPos, tileMap, entityManager, entityId);
  return action || { type: 'wait' };
}
