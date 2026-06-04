/**
 * MovementSystem.js
 * Sistema de movimiento en cuadrícula con detección de colisiones.
 *
 * Gestiona:
 * - Movimiento por la cuadrícula (un tile a la vez)
 * - Colisiones con paredes y límites del mapa
 * - Colisiones con otras entidades (bump-to-attack)
 * - Interacción con tiles especiales (escaleras, objetos)
 * - Actualización de la dirección de mirada
 */

import { ACTIONS } from '../constants.js';

export class MovementSystem {
  constructor() {
    // El sistema no guarda estado propio; toda la lógica
    // depende de los datos pasados como parámetros.
  }

  /**
   * Intentar mover una entidad en una dirección.
   *
   * Orden de verificación:
   * 1. ¿La posición objetivo está dentro del mapa?
   * 2. ¿El tile objetivo es transitable?
   * 3. ¿Hay otra entidad (Pokémon) en la posición? → bump_attack
   * 4. ¿El tile es una escalera? → stairs
   * 5. ¿Hay un objeto en el suelo? → pickup (se mueve y se señala)
   * 6. Movimiento exitoso → moved
   *
   * @param {number} entityId - ID de la entidad que intenta moverse
   * @param {number} dx - Desplazamiento horizontal (-1, 0, +1)
   * @param {number} dy - Desplazamiento vertical (-1, 0, +1)
   * @param {Object} tileMap - Mapa de tiles con métodos isWalkable(x,y), isStairs(x,y), getWidth(), getHeight()
   * @param {import('../entities/EntityManager.js').EntityManager} entityManager - Gestor de entidades
   * @returns {{
   *   success: boolean,
   *   type: 'moved'|'blocked'|'bump_attack'|'stairs'|'pickup',
   *   targetEntity?: number,
   *   itemEntity?: number,
   *   x?: number,
   *   y?: number
   * }} Resultado del intento de movimiento
   */
  tryMove(entityId, dx, dy, tileMap, entityManager) {
    // Obtener la posición actual de la entidad
    const position = entityManager.getComponent(entityId, 'position');
    if (!position) {
      console.warn(`[MovementSystem] La entidad ${entityId} no tiene componente 'position'.`);
      return { success: false, type: 'blocked' };
    }

    // Calcular la posición objetivo
    const targetX = position.x + dx;
    const targetY = position.y + dy;

    // Actualizar la dirección de mirada independientemente del resultado
    this._updateFacing(position, dx, dy);

    // ── 1. Verificar límites del mapa ──
    if (!this._isInBounds(targetX, targetY, tileMap)) {
      return { success: false, type: 'blocked' };
    }

    // ── 2. Verificar si el tile es transitable ──
    if (!canWalkOnTile(entityId, targetX, targetY, tileMap, entityManager)) {
      return { success: false, type: 'blocked' };
    }

    // ── 2.5 Verificar corte de esquinas para diagonales ──
    if (Math.abs(dx) === 1 && Math.abs(dy) === 1) {
      if (!canWalkOnTile(entityId, position.x + dx, position.y, tileMap, entityManager) || 
          !canWalkOnTile(entityId, position.x, position.y + dy, tileMap, entityManager)) {
        return { success: false, type: 'blocked' };
      }
    }

    // ── 3. Verificar si hay otra entidad (Pokémon) en la posición ──
    const occupant = entityManager.getEntityAt(targetX, targetY, false);
    if (occupant !== null && occupant !== entityId) {
      // Hay un Pokémon en la casilla: atacar por choque (bump-to-attack)
      return {
        success: true,
        type: 'bump_attack',
        targetEntity: occupant,
        x: targetX,
        y: targetY
      };
    }

    // ── 4. Verificar si hay escaleras ──
    if (tileMap.isStairs && tileMap.isStairs(targetX, targetY)) {
      // Mover la entidad a la casilla de escaleras
      this._moveEntity(position, targetX, targetY);
      return {
        success: true,
        type: 'stairs',
        x: targetX,
        y: targetY
      };
    }

    // ── 5. Verificar si hay un objeto en el suelo ──
    const itemEntity = entityManager.getItemAt(targetX, targetY);

    // ── 6. Verificar si pisamos una trampa (id 5) ──
    const tileId = tileMap.getTile(targetX, targetY).id;
    const isTrap = (tileId === 5);

    // ── 7. Ejecutar el movimiento ──
    this._moveEntity(position, targetX, targetY);

    // Si hay un objeto, señalarlo en el resultado (pero nos movemos de todas formas)
    if (itemEntity !== null) {
      return {
        success: true,
        type: 'pickup',
        itemEntity: itemEntity,
        isTrap: isTrap,
        x: targetX,
        y: targetY
      };
    }

    if (isTrap) {
      return {
        success: true,
        type: 'trap',
        x: targetX,
        y: targetY
      };
    }

    return {
      success: true,
      type: 'moved',
      x: targetX,
      y: targetY
    };
  }

  /**
   * Verificar si una posición está dentro de los límites del mapa.
   * @param {number} x - Coordenada X
   * @param {number} y - Coordenada Y
   * @param {Object} tileMap - Referencia al mapa de tiles
   * @returns {boolean}
   * @private
   */
  _isInBounds(x, y, tileMap) {
    const width = tileMap.getWidth ? tileMap.getWidth() : tileMap.width;
    const height = tileMap.getHeight ? tileMap.getHeight() : tileMap.height;
    return x >= 0 && x < width && y >= 0 && y < height;
  }

  /**
   * Mover la entidad actualizando su componente de posición.
   * @param {Object} position - Referencia al componente position de la entidad
   * @param {number} newX - Nueva coordenada X
   * @param {number} newY - Nueva coordenada Y
   * @private
   */
  _moveEntity(position, newX, newY) {
    position.prevX = position.x;
    position.prevY = position.y;
    position.moveStartTime = performance.now();
    position.x = newX;
    position.y = newY;
  }

  /**
   * Actualizar la dirección de mirada según el movimiento.
   * @param {Object} position - Referencia al componente position
   * @param {number} dx - Desplazamiento X
   * @param {number} dy - Desplazamiento Y
   * @private
   */
  _updateFacing(position, dx, dy) {
    if (dy < 0) position.facing = 'up';
    else if (dy > 0) position.facing = 'down';
    else if (dx < 0) position.facing = 'left';
    else if (dx > 0) position.facing = 'right';
    // Si dx === 0 y dy === 0, mantener la dirección actual
  }

  /**
   * Calcular la distancia Manhattan entre dos puntos.
   * Útil para verificar rangos de detección y ataques.
   * @param {number} x1
   * @param {number} y1
   * @param {number} x2
   * @param {number} y2
   * @returns {number} Distancia Manhattan
   */
  static manhattanDistance(x1, y1, x2, y2) {
    return Math.abs(x1 - x2) + Math.abs(y1 - y2);
  }

  /**
   * Obtener las posiciones adyacentes transitables.
   * @param {number} x - Posición X central
   * @param {number} y - Posición Y central
   * @param {Object} tileMap - Mapa de tiles
   * @returns {Array<{x: number, y: number, dx: number, dy: number}>}
   */
  static getWalkableNeighbors(x, y, tileMap) {
    const directions = [
      { dx: 0, dy: -1 },  // Arriba
      { dx: 0, dy: 1 },   // Abajo
      { dx: -1, dy: 0 },  // Izquierda
      { dx: 1, dy: 0 },   // Derecha
      { dx: -1, dy: -1 }, // Arriba-Izquierda
      { dx: 1, dy: -1 },  // Arriba-Derecha
      { dx: -1, dy: 1 },  // Abajo-Izquierda
      { dx: 1, dy: 1 }    // Abajo-Derecha
    ];

    const neighbors = [];
    for (const dir of directions) {
      const nx = x + dir.dx;
      const ny = y + dir.dy;

      // Verificar límites
      const width = tileMap.getWidth ? tileMap.getWidth() : tileMap.width;
      const height = tileMap.getHeight ? tileMap.getHeight() : tileMap.height;
      if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;

      // Verificar si es transitable
      if (tileMap.isWalkable(nx, ny)) {
        // Verificar corte de esquinas
        if (Math.abs(dir.dx) === 1 && Math.abs(dir.dy) === 1) {
          if (!tileMap.isWalkable(x + dir.dx, y) || !tileMap.isWalkable(x, y + dir.dy)) {
            continue;
          }
        }
        neighbors.push({ x: nx, y: ny, dx: dir.dx, dy: dir.dy });
      }
    }

    return neighbors;
  }
}

export function canWalkOnTile(entityId, x, y, tileMap, entityManager) {
  const tile = tileMap.getTile(x, y);
  if (!tile) return false;
  if (tile.walkable) return true;
  if (tile.id === 4 || tile.id === 6) {
    const info = entityManager.getComponent(entityId, 'pokemonInfo');
    if (!info) return false;
    const type1 = info.type1 ? info.type1.toLowerCase() : '';
    const type2 = info.type2 ? info.type2.toLowerCase() : '';
    if (tile.id === 4) {
      if (type1 === 'water' || type2 === 'water' || type1 === 'flying' || type2 === 'flying') return true;
    } else if (tile.id === 6) {
      if (type1 === 'fire' || type2 === 'fire' || type1 === 'flying' || type2 === 'flying') return true;
    }
  }
  return false;
}
