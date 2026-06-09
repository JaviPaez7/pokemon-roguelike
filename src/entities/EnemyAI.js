/**
 * EnemyAI.js — Comportamientos de IA para Pokémon enemigos
 * Comportamientos: wander, chase, flee, attack
 */
import { Path } from 'rot-js';
import { ENEMY_DETECT_RANGE } from '../constants.js';
import { canWalkOnTile } from '../systems/MovementSystem.js';

/**
 * Determina la acción de un enemigo
 * @param {number} entityId - ID del enemigo
 * @param {Object} entityManager - EntityManager
 * @param {Object} tileMap - TileMap
 * @param {Object} playerPos - Posición del jugador {x, y}
 * @param {number} playerEntityId - ID de la entidad jugador
 * @returns {Object|null} Acción: { type: 'move', dx, dy } o { type: 'attack', targetId } o null
 */
export function getEnemyAction(entityId, entityManager, tileMap, playerPos, playerEntityId, game) {
  const pos = entityManager.getComponent(entityId, 'position');
  const ai = entityManager.getComponent(entityId, 'aiControlled');
  const fighter = entityManager.getComponent(entityId, 'fighter');
  
  if (!pos || !ai || !fighter) return null;

  // Calcular distancia al jugador (Chebyshev)
  const distance = Math.max(Math.abs(pos.x - playerPos.x), Math.abs(pos.y - playerPos.y));
  const detectRange = ai.detectRange || ENEMY_DETECT_RANGE;

  // Determinar comportamiento basado en estado
  let behavior = ai.behavior || 'wander';

  // Si es un seguidor (aliado del jugador)
  if (behavior === 'follower') {
    return followerAction(entityId, pos, playerPos, tileMap, entityManager, game);
  }
  
  // Si HP bajo, huir
  if (fighter.hp / fighter.maxHp < 0.25) {
    behavior = 'flee';
  }
  // Si el jugador está en rango de detección, perseguir
  else if (distance <= detectRange) {
    behavior = 'chase';
    ai.alertedTo = playerEntityId;
  }
  // Si ya estaba alerta pero el jugador se alejó mucho, volver a wander
  else if (distance > detectRange * 2) {
    behavior = 'wander';
    ai.alertedTo = null;
  }

  // Actualizar comportamiento
  ai.behavior = behavior;
  entityManager.setComponent(entityId, 'aiControlled', ai);

  switch (behavior) {
    case 'chase':
      return chaseAction(entityId, pos, playerPos, playerEntityId, tileMap, entityManager);
    case 'flee':
      return fleeAction(entityId, pos, playerPos, tileMap, entityManager);
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

  // Usar A* para encontrar camino
  const passableCallback = (x, y) => {
    if (x === playerPos.x && y === playerPos.y) return true;
    if (!canWalkOnTile(entityId, x, y, tileMap, entityManager)) return false;
    // No pasar por otros enemigos (excepto el objetivo)
    const entityAtPos = entityManager.getEntityAt(x, y);
    if (entityAtPos !== null && entityAtPos !== entityId) return false;
    return true;
  };

  const astar = new Path.AStar(playerPos.x, playerPos.y, passableCallback, { topology: 8 });
  const path = [];
  
  astar.compute(pos.x, pos.y, (x, y) => {
    path.push({ x, y });
  });

  // El path incluye la posición actual como primer punto
  if (path.length >= 2) {
    const nextStep = path[1];
    const dx = nextStep.x - pos.x;
    const dy = nextStep.y - pos.y;
    return { type: 'move', dx, dy };
  }

  // Si no hay camino, intentar moverse directamente hacia el jugador
  return moveTowards(pos, playerPos, tileMap, entityManager, entityId);
}

/**
 * Huir del jugador
 */
function fleeAction(entityId, pos, playerPos, tileMap, entityManager) {
  // Moverse en dirección opuesta al jugador
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

  // Si no puede huir, quedarse quieto
  return null;
}

/**
 * Moverse aleatoriamente
 */
function   wanderAction(entityId, pos, tileMap, entityManager) {
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

  const tactic = partyMember.tactic || 'follow';
  const distToPlayer = Math.max(Math.abs(pos.x - playerPos.x), Math.abs(pos.y - playerPos.y));

  // ── 1. TÁCTICA "ESPERAR AHÍ" (STAY) ──
  if (tactic === 'stay') {
    // Buscar enemigo adyacente (distancia 1) para atacar
    const adjacentOffsets = [[0, -1], [0, 1], [-1, 0], [1, 0], [-1, -1], [1, -1], [-1, 1], [1, 1]];
    for (const offset of adjacentOffsets) {
      const targetX = pos.x + offset[0];
      const targetY = pos.y + offset[1];
      const targetId = entityManager.getEntityAt(targetX, targetY);
      if (targetId !== null && targetId !== game._playerId) {
        if (!entityManager.hasComponent(targetId, 'partyMember') && entityManager.hasComponent(targetId, 'fighter')) {
          return { type: 'attack', targetId: targetId };
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
      }
      return { type: 'wait' };
    }
    // Si no hay enemigos en rango, sigue al jugador (cae al flujo normal de abajo)
  }

  // ── 3. TÁCTICAS "IR JUNTOS" (FOLLOW) / "A POR ELLOS" (AGGRESSIVE) ──
  const scanRange = tactic === 'aggressive' ? 8 : 3;
  const hostiles = entityManager.getEntitiesWithComponents('position', 'fighter').filter(id => {
    if (id === game._playerId) return false;
    if (entityManager.hasComponent(id, 'partyMember')) return false;

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
    // Si está adyacente, atacarle
    if (minDistance === 1) {
      return { type: 'attack', targetId: targetHostileId };
    }

    // Si está a distancia, perseguirle usando A*
    const passableCallback = (x, y) => {
      if (x === targetHostilePos.x && y === targetHostilePos.y) return true;
      if (!canWalkOnTile(entityId, x, y, tileMap, entityManager)) return false;

      // Evitar chocar con otras entidades (jugador, aliados u otros enemigos)
      const entityAtPos = entityManager.getEntityAt(x, y);
      if (entityAtPos !== null && entityAtPos !== entityId) return false;
      return true;
    };

    const astar = new Path.AStar(targetHostilePos.x, targetHostilePos.y, passableCallback, { topology: 8 });
    const path = [];
    astar.compute(pos.x, pos.y, (x, y) => {
      path.push({ x, y });
    });

    if (path.length >= 2) {
      const nextStep = path[1];
      const dx = nextStep.x - pos.x;
      const dy = nextStep.y - pos.y;
      return { type: 'move', dx, dy };
    } else {
      // Intentar acercarse usando moveTowards como fallback
      const action = moveTowards(pos, targetHostilePos, tileMap, entityManager, entityId);
      if (action) return action;
    }
  }

  // ── 4. SEGUIMIENTO DEL JUGADOR (STANDARD) ──
  const historyIndex = partyMember.slot - 1; // slot 1 -> index 0 (posición anterior)
  let targetPos = playerPos;

  if (game.playerPathHistory && game.playerPathHistory.length > historyIndex) {
    targetPos = game.playerPathHistory[historyIndex];
  }

  // Calcular distancia al objetivo de seguimiento y al jugador
  const distToTarget = Math.max(Math.abs(pos.x - targetPos.x), Math.abs(pos.y - targetPos.y));

  // Si ya estamos en la posicion objetivo o muy cerca, esperar
  if (pos.x === targetPos.x && pos.y === targetPos.y) {
    return { type: 'wait' };
  }

  // Si estamos MUY lejos del jugador (> 5), teleportar cerca de forma segura (evita atascos)
  if (distToPlayer > 5) {
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
