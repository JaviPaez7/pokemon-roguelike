/**
 * TileMap.js
 * 
 * Clase que representa el mapa de tiles 2D de la mazmorra.
 * Gestiona tanto los datos de tiles como el estado de visibilidad
 * para el sistema de campo de visión (FOV).
 * 
 * Sistema de visibilidad:
 *   0 = desconocido (nunca visto)
 *   1 = recordado (visto anteriormente, se dibuja oscuro)
 *   2 = visible (actualmente en el FOV del jugador)
 */

import { TILES, TILE_BY_ID } from './TileTypes.js';

/** Estados de visibilidad como constantes para mayor claridad */
export const VISIBILITY = {
  UNKNOWN: 0,   // Tile nunca explorado
  SEEN: 1,      // Tile explorado pero fuera del FOV actual
  VISIBLE: 2,   // Tile actualmente dentro del FOV
};

export class TileMap {
  /**
   * Crea un nuevo mapa de tiles.
   * 
   * @param {number} width - Ancho del mapa en tiles
   * @param {number} height - Alto del mapa en tiles
   */
  constructor(width, height) {
    /** @type {number} Ancho del mapa */
    this.width = width;
    /** @type {number} Alto del mapa */
    this.height = height;

    /**
     * Array 2D de IDs de tile [y][x].
     * Se inicializa con WALL (id 0) por defecto.
     * @type {number[][]}
     */
    this.tiles = [];

    /**
     * Array 2D de estado de visibilidad [y][x].
     * Se inicializa con UNKNOWN (0) por defecto.
     * @type {number[][]}
     */
    this.visibility = [];

    // Inicializar ambos arrays
    for (let y = 0; y < height; y++) {
      this.tiles[y] = new Array(width).fill(TILES.WALL.id);
      this.visibility[y] = new Array(width).fill(VISIBILITY.UNKNOWN);
    }
  }

  /**
   * Obtiene el objeto tile completo en una posición dada.
   * Devuelve VOID si la posición está fuera de los límites.
   * 
   * @param {number} x - Coordenada X (columna)
   * @param {number} y - Coordenada Y (fila)
   * @returns {Object} Objeto tile con todas sus propiedades
   */
  getTile(x, y) {
    if (!this.isInBounds(x, y)) {
      return TILES.VOID;
    }
    const tileId = this.tiles[y][x];
    return TILE_BY_ID[tileId] || TILES.VOID;
  }

  /**
   * Establece el tipo de tile en una posición dada.
   * No hace nada si la posición está fuera de los límites.
   * 
   * @param {number} x - Coordenada X (columna)
   * @param {number} y - Coordenada Y (fila)
   * @param {number} tileId - ID del tipo de tile a establecer
   */
  setTile(x, y, tileId) {
    if (!this.isInBounds(x, y)) return;
    this.tiles[y][x] = tileId;
  }

  /**
   * Comprueba si un tile es transitable (se puede caminar sobre él).
   * Las posiciones fuera de límites NO son transitables.
   * 
   * @param {number} x - Coordenada X
   * @param {number} y - Coordenada Y
   * @returns {boolean} true si el tile es transitable
   */
  isWalkable(x, y) {
    if (!this.isInBounds(x, y)) return false;
    const tile = this.getTile(x, y);
    return tile.walkable;
  }

  /**
   * Comprueba si un tile son escaleras.
   * @param {number} x - Coordenada X
   * @param {number} y - Coordenada Y
   * @returns {boolean} true si el tile son escaleras
   */
  isStairs(x, y) {
    if (!this.isInBounds(x, y)) return false;
    return this.tiles[y][x] === TILES.STAIRS_DOWN.id;
  }

  /**
   * Comprueba si un tile es transparente (permite el paso de visión/luz).
   * Usado por el sistema FOV para determinar qué bloquea la línea de visión.
   * 
   * @param {number} x - Coordenada X
   * @param {number} y - Coordenada Y
   * @returns {boolean} true si el tile es transparente
   */
  isTransparent(x, y) {
    if (!this.isInBounds(x, y)) return false;
    const tile = this.getTile(x, y);
    return tile.transparent;
  }

  /**
   * Comprueba si una posición está dentro de los límites del mapa.
   * 
   * @param {number} x - Coordenada X
   * @param {number} y - Coordenada Y
   * @returns {boolean} true si (x, y) está dentro del mapa
   */
  isInBounds(x, y) {
    return x >= 0 && x < this.width && y >= 0 && y < this.height;
  }

  /**
   * Marca un tile como actualmente visible (en el FOV del jugador).
   * 
   * @param {number} x - Coordenada X
   * @param {number} y - Coordenada Y
   */
  setVisible(x, y) {
    if (!this.isInBounds(x, y)) return;
    this.visibility[y][x] = VISIBILITY.VISIBLE;
  }

  /**
   * Reinicia la visibilidad: todos los tiles VISIBLE (2) pasan a SEEN (1).
   * Se llama al inicio de cada turno antes de recalcular el FOV.
   * Los tiles UNKNOWN (0) no se modifican.
   */
  resetVisibility() {
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        if (this.visibility[y][x] === VISIBILITY.VISIBLE) {
          this.visibility[y][x] = VISIBILITY.SEEN;
        }
      }
    }
  }

  /**
   * Obtiene el estado de visibilidad de un tile.
   * 
   * @param {number} x - Coordenada X
   * @param {number} y - Coordenada Y
   * @returns {number} 0 (desconocido), 1 (recordado), o 2 (visible)
   */
  getVisibility(x, y) {
    if (!this.isInBounds(x, y)) return VISIBILITY.UNKNOWN;
    return this.visibility[y][x];
  }

  /**
   * Busca la primera aparición de un tile con el ID dado.
   * Recorre el mapa de arriba-izquierda a abajo-derecha.
   * 
   * @param {number} tileId - ID del tile a buscar
   * @returns {{x: number, y: number} | null} Posición del tile, o null si no se encuentra
   */
  findTile(tileId) {
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        if (this.tiles[y][x] === tileId) {
          return { x, y };
        }
      }
    }
    return null;
  }

  /**
   * Obtiene las posiciones de tiles transitables adyacentes (4 direcciones cardinales).
   * Útil para pathfinding y movimiento de IA.
   * 
   * @param {number} x - Coordenada X central
   * @param {number} y - Coordenada Y central
   * @returns {{x: number, y: number}[]} Array de posiciones transitables adyacentes
   */
  getWalkableNeighbors(x, y) {
    /** Direcciones cardinales: arriba, derecha, abajo, izquierda */
    const direcciones = [
      { dx: 0, dy: -1 },  // arriba
      { dx: 1, dy: 0 },   // derecha
      { dx: 0, dy: 1 },   // abajo
      { dx: -1, dy: 0 },  // izquierda
    ];

    const vecinos = [];
    for (const { dx, dy } of direcciones) {
      const nx = x + dx;
      const ny = y + dy;
      if (this.isWalkable(nx, ny)) {
        vecinos.push({ x: nx, y: ny });
      }
    }
    return vecinos;
  }
}
