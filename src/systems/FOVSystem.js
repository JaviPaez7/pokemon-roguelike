/**
 * FOVSystem.js
 * 
 * Sistema de Campo de Visión (Field of View) usando el algoritmo
 * RecursiveShadowcasting de rot.js.
 * 
 * Determina qué tiles son visibles desde la posición del jugador,
 * creando el efecto de "niebla de guerra" característico de los
 * roguelikes estilo Pokémon Mystery Dungeon.
 * 
 * El algoritmo funciona trazando "sombras" desde el jugador:
 * los muros y tiles opacos bloquean la visión detrás de ellos.
 */

import { FOV } from 'rot-js';

/** Radio de visión por defecto del jugador (en tiles) */
const RADIO_VISION_DEFECTO = 8;

export class FOVSystem {
  /**
   * Crea el sistema de FOV.
   * La instancia del algoritmo se crea en cada actualización
   * para usar el tileMap más reciente como referencia.
   */
  constructor() {
    /** @type {FOV.RecursiveShadowcasting|null} Instancia del algoritmo FOV */
    this._fov = null;
  }

  /**
   * Actualiza la visibilidad del mapa basándose en la posición del jugador.
   * 
   * Proceso:
   * 1. Reinicia todos los tiles VISIBLE a SEEN (recordado)
   * 2. Crea una nueva instancia de RecursiveShadowcasting con el mapa actual
   * 3. Calcula qué tiles son visibles desde la posición del jugador
   * 4. Marca esos tiles como VISIBLE en el tileMap
   * 
   * @param {number} playerX - Posición X del jugador en tiles
   * @param {number} playerY - Posición Y del jugador en tiles
   * @param {import('../map/TileMap.js').TileMap} tileMap - Mapa de tiles a actualizar
   * @param {number} [radius=RADIO_VISION_DEFECTO] - Radio de visión en tiles
   */
  update(playerX, playerY, tileMap, radius = RADIO_VISION_DEFECTO) {
    // Paso 1: Degradar visibilidad actual (VISIBLE → SEEN)
    // Los tiles que estaban visibles ahora solo se "recuerdan"
    tileMap.resetVisibility();

    // Paso 2: Crear callback de transparencia para rot.js
    // Este callback le dice al algoritmo qué tiles bloquean la visión
    const lightPasses = (x, y) => {
      // Fuera de los límites bloquea la luz
      if (!tileMap.isInBounds(x, y)) return false;
      return tileMap.isTransparent(x, y);
    };

    // Paso 3: Instanciar el algoritmo de shadowcasting
    this._fov = new FOV.RecursiveShadowcasting(lightPasses);

    // Paso 4: Calcular FOV y marcar tiles visibles
    // El callback recibe cada tile visible con su distancia y visibilidad parcial
    this._fov.compute(playerX, playerY, radius, (x, y, _r, _visibility) => {
      // Solo marcar tiles dentro de los límites del mapa
      if (tileMap.isInBounds(x, y)) {
        tileMap.setVisible(x, y);
      }
    });
  }
}
