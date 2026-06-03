/**
 * EnemyAI.js — Comportamientos de IA para Pokémon enemigos
 * Comportamientos: wander, chase, flee, attack
 */

import { Path } from 'rot-js';
import { ENEMY_DETECT_RANGE } from '../constants.js';

/**
 * Determina la acción de un enemigo
 * @param {number} entityId - ID del enemigo
 * @param {Object} entityManager - EntityManager
 * @param {Object} tileMap - TileMap
 * @param {Object} playerPos - Posición del jugador {x, y}
 * @param {number} playerEntityId - ID de la entidad jugador
 * @returns {Object|null} Acción: { type: 'move', dx, dy } o { type: 'attack', targetId } o null
 */
export function getEnemyAction(entityId, entityManager, tileMap, playerPos, playerEntityId) {
  const pos = entityManager.getComponent(entityId, 'position');
  const ai = entityManager.getComponent(entityId, 'aiControlled');
  const fighter = entityManager.getComponent(entityId, 'fighter');
  
  if (!pos || !ai || !fighter) return null;

  // Calcular distancia al jugador
  const distance = Math.abs(pos.x - playerPos.x) + Math.abs(pos.y - playerPos.y);
  const detectRange = ai.detectRange || ENEMY_DETECT_RANGE;

  // Determinar comportamiento basado en estado
  let behavior = ai.behavior || 'wander';
  
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
  const distance = Math.abs(pos.x - playerPos.x) + Math.abs(pos.y - playerPos.y);
  
  // Si está adyacente, atacar
  if (distance === 1) {
    return { type: 'attack', targetId: playerEntityId };
  }

  // Usar A* para encontrar camino
  const passableCallback = (x, y) => {
    if (x === playerPos.x && y === playerPos.y) return true;
    if (!tileMap.isWalkable(x, y)) return false;
    // No pasar por otros enemigos (excepto el objetivo)
    const entityAtPos = entityManager.getEntityAt(x, y);
    if (entityAtPos !== null && entityAtPos !== entityId) return false;
    return true;
  };

  const astar = new Path.AStar(playerPos.x, playerPos.y, passableCallback, { topology: 4 });
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
  
  // Añadir direcciones perpendiculares como alternativas
  directions.push({ dx: 0, dy: 1 }, { dx: 0, dy: -1 }, { dx: 1, dy: 0 }, { dx: -1, dy: 0 });

  for (const dir of directions) {
    const newX = pos.x + dir.dx;
    const newY = pos.y + dir.dy;
    if (tileMap.isWalkable(newX, newY) && !entityManager.getEntityAt(newX, newY)) {
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

  // Direcciones cardinales aleatorias
  const directions = [
    { dx: 0, dy: -1 }, // arriba
    { dx: 0, dy: 1 },  // abajo
    { dx: -1, dy: 0 }, // izquierda
    { dx: 1, dy: 0 }   // derecha
  ];

  // Barajar direcciones
  for (let i = directions.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [directions[i], directions[j]] = [directions[j], directions[i]];
  }

  for (const dir of directions) {
    const newX = pos.x + dir.dx;
    const newY = pos.y + dir.dy;
    if (tileMap.isWalkable(newX, newY) && !entityManager.getEntityAt(newX, newY)) {
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

  // Intentar moverse horizontal primero, luego vertical
  const attempts = [];
  if (dx !== 0) attempts.push({ dx, dy: 0 });
  if (dy !== 0) attempts.push({ dx: 0, dy });
  // Direcciones alternativas
  if (dy !== 0) attempts.push({ dx: 0, dy });
  if (dx !== 0) attempts.push({ dx, dy: 0 });

  for (const attempt of attempts) {
    const newX = pos.x + attempt.dx;
    const newY = pos.y + attempt.dy;
    if (tileMap.isWalkable(newX, newY)) {
      const blocker = entityManager.getEntityAt(newX, newY);
      if (!blocker || blocker === entityId) {
        return { type: 'move', dx: attempt.dx, dy: attempt.dy };
      }
    }
  }

  return null;
}
