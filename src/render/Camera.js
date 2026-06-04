/**
 * Camera.js
 * 
 * Sistema de cámara/viewport que sigue al jugador por el mapa.
 * Convierte entre coordenadas de mundo (tiles) y coordenadas de pantalla (píxeles),
 * y gestiona el recorte (culling) para que solo se rendericen los tiles visibles.
 * 
 * La cámara se centra en el jugador y se limita (clamp) para no mostrar
 * áreas fuera del mapa.
 */

export class Camera {
  /**
   * Crea una nueva cámara.
   * 
   * @param {number} viewportWidth - Ancho del viewport en tiles (ej: 21)
   * @param {number} viewportHeight - Alto del viewport en tiles (ej: 15)
   * @param {number} tileSize - Tamaño de cada tile en píxeles (ej: 24)
   */
  constructor(viewportWidth, viewportHeight, tileSize) {
    /** @type {number} Tiles visibles horizontalmente */
    this.viewportWidth = viewportWidth;
    /** @type {number} Tiles visibles verticalmente */
    this.viewportHeight = viewportHeight;
    /** @type {number} Tamaño de tile en píxeles */
    this.tileSize = tileSize;

    /**
     * Posición de la cámara en el mundo (esquina superior izquierda del viewport).
     * Almacenada en coordenadas de tile (no píxeles).
     * @type {number}
     */
    this.x = 0;
    /** @type {number} */
    this.y = 0;

    /** Posición real actual (interpolar a this.x/y) */
    this.currentX = 0;
    this.currentY = 0;
  }

  /**
   * Centra la cámara en la posición del jugador, con clamping en los bordes del mapa.
   * La cámara nunca mostrará tiles fuera del mapa.
   * 
   * @param {number} playerX - Posición X del jugador en tiles
   * @param {number} playerY - Posición Y del jugador en tiles
   * @param {number} mapWidth - Ancho total del mapa en tiles
   * @param {number} mapHeight - Alto total del mapa en tiles
   */
  follow(playerX, playerY, mapWidth, mapHeight) {
    // Centrar la cámara en el jugador
    // (restar la mitad del viewport para que el jugador quede en el centro)
    let camaraX = playerX - Math.floor(this.viewportWidth / 2);
    let camaraY = playerY - Math.floor(this.viewportHeight / 2);

    // Clamping: evitar que la cámara muestre fuera del mapa
    // Límite mínimo: no ir más allá de (0, 0)
    camaraX = Math.max(0, camaraX);
    camaraY = Math.max(0, camaraY);

    // Límite máximo: no ir más allá del borde derecho/inferior del mapa
    // Si el mapa es más pequeño que el viewport, fijar en 0
    const maxX = Math.max(0, mapWidth - this.viewportWidth);
    const maxY = Math.max(0, mapHeight - this.viewportHeight);
    camaraX = Math.min(camaraX, maxX);
    camaraY = Math.min(camaraY, maxY);

    // Inicializar pos actual si es primer frame
    if (this.currentX === undefined || this.currentY === undefined || Math.abs(this.currentX - camaraX) > 10 || Math.abs(this.currentY - camaraY) > 10) {
      this.currentX = camaraX;
      this.currentY = camaraY;
    }

    this.x = camaraX;
    this.y = camaraY;
  }

  /**
   * Actualiza la posición de la cámara hacia su target usando lerp.
   * @param {number} deltaTime - Tiempo transcurrido en ms
   */
  update(deltaTime) {
    if (this.currentX === undefined) return;
    
    // Lerp hacia la posición objetivo
    const lerpFactor = 0.15; // Factor de interpolación (fijo por frame)
    this.currentX += (this.x - this.currentX) * lerpFactor;
    this.currentY += (this.y - this.currentY) * lerpFactor;
  }

  /**
   * Obtiene el desplazamiento en píxeles para renderizado.
   * Este offset se resta de las coordenadas de mundo para obtener
   * la posición en pantalla.
   * 
   * @returns {{x: number, y: number}} Offset en píxeles
   */
  getOffset() {
    return {
      x: this.currentX * this.tileSize,
      y: this.currentY * this.tileSize,
    };
  }

  /**
   * Convierte coordenadas de tile del mundo a píxeles de pantalla.
   * 
   * @param {number} wx - Coordenada X en tiles del mundo
   * @param {number} wy - Coordenada Y en tiles del mundo
   * @returns {{x: number, y: number}} Posición en píxeles de pantalla
   */
  worldToScreen(wx, wy) {
    return {
      x: (wx - this.currentX) * this.tileSize,
      y: (wy - this.currentY) * this.tileSize,
    };
  }

  /**
   * Convierte coordenadas de píxeles de pantalla a tiles del mundo.
   * Útil para detectar clics del ratón sobre el mapa.
   * 
   * @param {number} sx - Coordenada X en píxeles de pantalla
   * @param {number} sy - Coordenada Y en píxeles de pantalla
   * @returns {{x: number, y: number}} Posición en tiles del mundo
   */
  screenToWorld(sx, sy) {
    return {
      x: Math.floor(sx / this.tileSize) + this.currentX,
      y: Math.floor(sy / this.tileSize) + this.currentY,
    };
  }

  /**
   * Comprueba si un tile del mundo está dentro del viewport actual.
   * 
   * @param {number} wx - Coordenada X en tiles del mundo
   * @param {number} wy - Coordenada Y en tiles del mundo
   * @returns {boolean} true si el tile es visible en el viewport
   */
  isVisible(wx, wy) {
    // Usamos x,y en lugar de currentX,currentY para no hacer culling de tiles 
    // que la cámara está a punto de mostrar
    return (
      wx >= this.x - 2 &&
      wx < this.x + this.viewportWidth + 2 &&
      wy >= this.y - 2 &&
      wy < this.y + this.viewportHeight + 2
    );
  }

  /**
   * Obtiene el rango de tiles visibles en el viewport.
   * Útil para iterar solo sobre los tiles que necesitan renderizarse.
   * 
   * @returns {{startCol: number, endCol: number, startRow: number, endRow: number}}
   *   Rango inclusivo de columnas y filas visibles
   */
  getVisibleRange() {
    return {
      startCol: this.x,
      endCol: this.x + this.viewportWidth - 1,
      startRow: this.y,
      endRow: this.y + this.viewportHeight - 1,
    };
  }
}
