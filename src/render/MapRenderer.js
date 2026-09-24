/**
 * MapRenderer.js
 * 
 * Renderizador del mapa de tiles de la mazmorra.
 * Dibuja los tiles del mapa usando rectángulos coloreados con bordes sutiles,
 * aplicando el sistema de visibilidad (FOV) para crear niebla de guerra.
 * 
 * Niveles de visibilidad:
 * - VISIBLE (2): Se dibuja a brillo completo
 * - SEEN (1): Se dibuja al 40% de opacidad (tinte oscuro)
 * - UNKNOWN (0): No se dibuja (el fondo negro del canvas es visible)
 * 
 * Efectos visuales:
 * - Bordes sutiles entre tiles para definir la cuadrícula
 * - Animación de ondas en tiles de agua (onda senoidal sobre el color)
 * - Indicador visual especial para escaleras (símbolo '>')
 * - Degradado sutil en los bordes del FOV
 */

import { TILES, TILE_BY_ID } from '../map/TileTypes.js';

/** Opacidad para tiles recordados pero fuera del FOV actual */
const OPACIDAD_SEEN = 0.4;

/** Color y ancho de las líneas de cuadrícula entre tiles */
const COLOR_GRID = 'rgba(255, 255, 255, 0.04)';
const ANCHO_GRID = 0.5;

/** Velocidad de animación de las olas de agua */
const VELOCIDAD_OLAS = 0.003;
/** Amplitud del efecto de ola (variación de color) */
const AMPLITUD_OLAS = 15;

export class MapRenderer {
  /**
   * Crea el renderizador del mapa.
   */
  constructor() {
    /**
     * Timestamp interno para animaciones (olas de agua).
     * Se incrementa en cada frame de render.
     * @type {number}
     */
    this._tiempo = 0;
  }

  /**
   * Renderiza el mapa de tiles en el canvas.
   * Solo dibuja los tiles dentro del viewport de la cámara (culling).
   * 
   * @param {CanvasRenderingContext2D} ctx - Contexto del canvas 2D
   * @param {import('../map/TileMap.js').TileMap} tileMap - Mapa de tiles a renderizar
   * @param {import('./Camera.js').Camera} camera - Cámara/viewport actual
   */
  render(ctx, tileMap, camera) {
    // Incrementar el temporizador de animaciones
    this._tiempo = performance.now();

    // Obtener el rango de tiles visibles en el viewport
    const { startCol, endCol, startRow, endRow } = camera.getVisibleRange();
    const tileSize = camera.tileSize;

    // Iterar solo sobre los tiles visibles en la cámara (viewport culling)
    for (let y = startRow; y <= endRow; y++) {
      for (let x = startCol; x <= endCol; x++) {
        // Verificar que esté dentro de los límites del mapa
        if (!tileMap.isInBounds(x, y)) continue;

        const visibilidad = tileMap.getVisibility(x, y);

        // Los tiles desconocidos no se dibujan (el fondo negro se muestra)
        if (visibilidad === 0) continue;

        // Obtener datos del tile
        const tile = tileMap.getTile(x, y);

        // Convertir coordenadas de mundo a pantalla
        const screenPos = camera.worldToScreen(x, y);
        const sx = screenPos.x;
        const sy = screenPos.y;

        // Dibujar el tile según su tipo
        this._dibujarTile(ctx, tile, sx, sy, tileSize, visibilidad, x, y, tileMap);

        // Dibujar líneas de cuadrícula sutiles
        this._dibujarGrid(ctx, sx, sy, tileSize, tileMap);
      }
    }

    // Dibujar sombra/degradado en los bordes del FOV
    this._dibujarSombrasFOV(ctx, tileMap, camera, startCol, endCol, startRow, endRow, tileSize);
  }

  /**
   * Dibuja un tile individual con su color y efectos.
   * 
   * @param {CanvasRenderingContext2D} ctx - Contexto del canvas
   * @param {Object} tile - Objeto tile con propiedades de color
   * @param {number} sx - Posición X en pantalla (píxeles)
   * @param {number} sy - Posición Y en pantalla (píxeles)
   * @param {number} size - Tamaño del tile en píxeles
   * @param {number} visibilidad - Estado de visibilidad (1 o 2)
   * @param {number} worldX - Coordenada X en el mundo (para animaciones)
   * @param {number} worldY - Coordenada Y en el mundo (para animaciones)
   * @param {import('../map/TileMap.js').TileMap} tileMap - Mapa de tiles para chequear vecinos
   * @private
   */
  _dibujarTile(ctx, tile, sx, sy, size, visibilidad, worldX, worldY, tileMap) {
    if (tile.id >= TILES.TOWN_GRASS.id) {
      this._dibujarTilePueblo(ctx, tile, sx, sy, size, worldX, worldY);
      return;
    }

    // Guardar estado del contexto para aplicar opacidad
    ctx.save();

    // Aplicar opacidad reducida para tiles recordados (fuera del FOV)
    if (visibilidad === 1) {
      ctx.globalAlpha = OPACIDAD_SEEN;
    }

    // Color base del tile (fallback a colores originales si no hay bioma)
    let colorSuelo = tile.colors.floor;
    let colorBorde = tile.colors.wall;

    if (tileMap && tileMap.biome) {
      if (tile.id === 0) { // WALL (0)
        colorSuelo = tileMap.biome.wall;
        colorBorde = tileMap.biome.void;
      } else if (tile.id === 4) { // WATER
        colorSuelo = tileMap.biome.water;
        colorBorde = tileMap.biome.wall;
      } else if (tile.id === 6) { // LAVA
        colorSuelo = tileMap.biome.lava || '#ff4400';
        colorBorde = tileMap.biome.wall;
      } else if (tile.id === 3) { // STAIRS
        colorSuelo = tileMap.biome.stairs || tileMap.biome.floor;
        colorBorde = tileMap.biome.wall;
      } else if (tile.id === 8) { // WONDER_TILE
        colorSuelo = '#c9a0ff';
        colorBorde = tileMap.biome.wall;
      } else { // FLOOR (1), CORRIDOR (2), TRAPS
        colorSuelo = tileMap.biome.floor;
        colorBorde = tileMap.biome.wall;
      }
    }

    let isRestRoom = false;
    if (tileMap && tileMap.rooms && tile.walkable && typeof tileMap.isRestRoom === 'function') {
        isRestRoom = tileMap.isRestRoom(worldX, worldY);
    }

    // Efecto especial para agua: animación de olas
    if (tile.id === 4) { // 4 es WATER
      colorSuelo = this._calcularColorOla(tile.colors.floor, worldX, worldY);
    } else if (isRestRoom && tile.id !== 2) { // Si no es WALL (2)
      // Tintar un poco la sala de descanso, combinándolo con el bioma si queremos, 
      // pero por ahora lo dejamos verde claro.
      colorSuelo = '#3d5c4d'; 
      colorBorde = '#2c4538';
    }

    // Rellenar el tile con el color base
    ctx.fillStyle = colorSuelo;
    ctx.fillRect(sx, sy, size, size);

    // Decoraciones en el suelo usando aritmética simple para el seudo-random (mucho más rápido que Math.sin)
    if (tile.id === TILES.FLOOR.id) {
        // Hash ultra rápido usando bits
        const n = (worldX * 31337 + worldY * 31337) ^ (worldX | worldY);
        const dec = n % 100;
        
        if (dec < 5) {
            // Dibujar una piedrita
            ctx.fillStyle = 'rgba(0,0,0,0.3)';
            ctx.fillRect(sx + size*0.7, sy + size*0.2, 3, 2);
            ctx.fillStyle = 'rgba(150,150,150,0.6)';
            ctx.fillRect(sx + size*0.7, sy + size*0.2 - 1, 2, 1);
        } else if (dec < 10) {
            // Dibujar una brizna de hierba
            ctx.fillStyle = 'rgba(50, 150, 50, 0.4)';
            ctx.fillRect(sx + size*0.2, sy + size*0.8, 2, -4);
            ctx.fillRect(sx + size*0.3, sy + size*0.8, 1, -2);
        }
    }

    // Sombras de pared (si es FLOOR o TRAP y hay WALL arriba)
    if ((tile.id === TILES.FLOOR.id || tile.id === TILES.TRAP_HIDDEN.id || tile.id === TILES.TRAP_REVEALED.id) && tileMap && tileMap.isInBounds(worldX, worldY - 1)) {
        const topTile = tileMap.getTile(worldX, worldY - 1);
        if (topTile.id === TILES.WALL.id) {
            ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
            ctx.fillRect(sx, sy, size, 4); // Sombra en la parte superior del tile
        }
    }

    // Dibujar borde sutil (1px más oscuro) para definir los tiles
    ctx.strokeStyle = colorBorde;
    ctx.lineWidth = 1;
    ctx.strokeRect(sx + 0.5, sy + 0.5, size - 1, size - 1);

    // Efectos especiales según tipo de tile
    if (tile.id === TILES.STAIRS_DOWN.id) {
      this._dibujarEscaleras(ctx, sx, sy, size);
    }

    ctx.restore();
  }

  /**
   * Casillas del pueblo (ids 20+): siempre visibles, con dibujo propio.
   * @private
   */
  _dibujarTilePueblo(ctx, tile, sx, sy, size, worldX, worldY) {
    const hash = ((worldX * 73856093) ^ (worldY * 19349663)) >>> 0;
    const grass = TILES.TOWN_GRASS.colors.floor;
    ctx.save();

    // Fondo: hierba bajo árboles, tablón y flores; el color propio en el resto
    const onGrass = [TILES.TOWN_TREE.id, TILES.TOWN_BOARD.id, TILES.TOWN_FLOWERS.id].includes(tile.id);
    ctx.fillStyle = onGrass ? grass : tile.colors.floor;
    ctx.fillRect(sx, sy, size, size);

    switch (tile.id) {
      case TILES.TOWN_GRASS.id:
      case TILES.TOWN_FLOWERS.id: {
        ctx.fillStyle = 'rgba(20, 60, 20, 0.35)';
        if (hash % 3 === 0) ctx.fillRect(sx + 5 + (hash % 7), sy + 14, 1, 4);
        if (hash % 5 === 0) ctx.fillRect(sx + 15, sy + 6 + (hash % 5), 1, 3);
        if (tile.id === TILES.TOWN_FLOWERS.id) {
          const petals = ['#ffd84d', '#ff7aa8', '#ffffff', '#b58cff'];
          for (let i = 0; i < 3; i++) {
            ctx.fillStyle = petals[(hash + i) % petals.length];
            ctx.fillRect(sx + 4 + ((hash >> (i * 3)) % 14), sy + 4 + ((hash >> (i * 4)) % 14), 3, 3);
          }
        }
        break;
      }
      case TILES.TOWN_PATH.id:
      case TILES.TOWN_EXIT.id: {
        ctx.fillStyle = 'rgba(90, 70, 40, 0.25)';
        if (hash % 4 === 0) ctx.fillRect(sx + 4 + (hash % 12), sy + 6 + (hash % 9), 2, 2);
        if (hash % 7 === 0) ctx.fillRect(sx + 14, sy + 16, 2, 1);
        if (tile.id === TILES.TOWN_EXIT.id) {
          // Flecha hacia la salida
          ctx.fillStyle = 'rgba(70, 45, 20, 0.7)';
          ctx.beginPath();
          ctx.moveTo(sx + size / 2, sy + size - 5);
          ctx.lineTo(sx + 6, sy + 9);
          ctx.lineTo(sx + size - 6, sy + 9);
          ctx.closePath();
          ctx.fill();
        }
        break;
      }
      case TILES.TOWN_TREE.id: {
        ctx.fillStyle = '#5b3a1e';
        ctx.fillRect(sx + size / 2 - 2, sy + size - 8, 4, 7);
        ctx.fillStyle = tile.colors.wall;
        ctx.beginPath();
        ctx.arc(sx + size / 2, sy + size / 2 - 2, size / 2 - 1, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = tile.colors.floor;
        ctx.beginPath();
        ctx.arc(sx + size / 2 - 2, sy + size / 2 - 4, size / 3, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case TILES.TOWN_WALL.id: {
        ctx.strokeStyle = tile.colors.wall;
        ctx.lineWidth = 1;
        for (let row = 0; row < 3; row++) {
          const y = sy + 4 + row * 8 + 0.5;
          ctx.beginPath();
          ctx.moveTo(sx, y);
          ctx.lineTo(sx + size, y);
          ctx.stroke();
        }
        if (hash % 3 === 0) {
          ctx.fillStyle = '#7fb3d9';
          ctx.fillRect(sx + 7, sy + 7, 10, 8);
          ctx.strokeStyle = '#5e4a32';
          ctx.strokeRect(sx + 7.5, sy + 7.5, 9, 7);
        }
        break;
      }
      case TILES.TOWN_ROOF.id: {
        ctx.fillStyle = tile.colors.wall;
        for (let row = 0; row < 3; row++) ctx.fillRect(sx, sy + 6 + row * 7, size, 2);
        break;
      }
      case TILES.TOWN_DOOR.id: {
        ctx.fillStyle = TILES.TOWN_WALL.colors.floor;
        ctx.fillRect(sx, sy, size, size);
        ctx.fillStyle = tile.colors.floor;
        ctx.fillRect(sx + 5, sy + 4, size - 10, size - 4);
        ctx.fillStyle = '#e6c15a';
        ctx.fillRect(sx + size - 9, sy + 13, 2, 2);
        break;
      }
      case TILES.TOWN_BOARD.id: {
        ctx.fillStyle = tile.colors.wall;
        ctx.fillRect(sx + 4, sy + 14, 2, 9);
        ctx.fillRect(sx + size - 6, sy + 14, 2, 9);
        ctx.fillStyle = '#8a5a2b';
        ctx.fillRect(sx + 2, sy + 3, size - 4, 13);
        ctx.fillStyle = '#f2ead3';
        ctx.fillRect(sx + 4, sy + 5, 7, 5);
        ctx.fillRect(sx + 13, sy + 6, 6, 7);
        break;
      }
    }
    ctx.restore();
  }

  /**
   * Calcula el color animado para tiles de agua usando una onda senoidal.
   * Modifica el componente azul del color para simular el movimiento del agua.
   * 
   * @param {string} colorBase - Color base en formato hex (#RRGGBB)
   * @param {number} x - Coordenada X del tile (para offset de fase)
   * @param {number} y - Coordenada Y del tile (para offset de fase)
   * @returns {string} Color modificado en formato rgb()
   * @private
   */
  _calcularColorOla(colorBase, x, y) {
    // Parsear el color hex a componentes RGB
    const r = parseInt(colorBase.slice(1, 3), 16);
    const g = parseInt(colorBase.slice(3, 5), 16);
    const b = parseInt(colorBase.slice(5, 7), 16);

    // Calcular offset de onda senoidal
    // Usar posición del tile como offset de fase para crear efecto de propagación
    const fase = (x * 0.5 + y * 0.3) + this._tiempo * VELOCIDAD_OLAS;
    const offset = Math.sin(fase) * AMPLITUD_OLAS;

    // Aplicar offset al componente azul (mantener dentro de [0, 255])
    const nuevoB = Math.max(0, Math.min(255, b + offset));
    const nuevoG = Math.max(0, Math.min(255, g + offset * 0.3));

    return `rgb(${r}, ${Math.floor(nuevoG)}, ${Math.floor(nuevoB)})`;
  }

  /**
   * Dibuja el indicador visual de las escaleras.
   * Muestra un símbolo '>' dorado sobre el tile.
   * 
   * @param {CanvasRenderingContext2D} ctx - Contexto del canvas
   * @param {number} sx - Posición X en pantalla
   * @param {number} sy - Posición Y en pantalla
   * @param {number} size - Tamaño del tile
   * @private
   */
  _dibujarEscaleras(ctx, sx, sy, size) {
    // Fondo con brillo pulsante sutil
    const pulso = Math.sin(this._tiempo * 0.004) * 0.15 + 0.85;
    ctx.fillStyle = `rgba(255, 204, 0, ${0.2 * pulso})`;
    ctx.fillRect(sx + 2, sy + 2, size - 4, size - 4);

    // Símbolo '>' en el centro
    ctx.fillStyle = '#ffcc00';
    ctx.font = `bold ${Math.floor(size * 0.7)}px monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('>', sx + size / 2, sy + size / 2);

    // Sombra del texto para mejor legibilidad
    ctx.fillStyle = 'rgba(204, 153, 0, 0.6)';
    ctx.fillText('>', sx + size / 2 + 1, sy + size / 2 + 1);

    // Redibujar el texto encima de la sombra
    ctx.fillStyle = '#ffcc00';
    ctx.fillText('>', sx + size / 2, sy + size / 2);
  }

  /**
   * Dibuja líneas de cuadrícula sutiles entre tiles.
   * 
   * @param {CanvasRenderingContext2D} ctx - Contexto del canvas
   * @param {number} sx - Posición X en pantalla
   * @param {number} sy - Posición Y en pantalla
   * @param {number} size - Tamaño del tile
   * @private
   */
  _dibujarGrid(ctx, sx, sy, size, tileMap) {
    ctx.strokeStyle = tileMap && tileMap.biome && tileMap.biome.gridLines ? tileMap.biome.gridLines : COLOR_GRID;
    ctx.lineWidth = ANCHO_GRID;

    // Línea derecha del tile
    ctx.beginPath();
    ctx.moveTo(sx + size, sy);
    ctx.lineTo(sx + size, sy + size);
    ctx.stroke();

    // Línea inferior del tile
    ctx.beginPath();
    ctx.moveTo(sx, sy + size);
    ctx.lineTo(sx + size, sy + size);
    ctx.stroke();
  }

  /**
   * Dibuja un degradado sutil en los bordes del FOV.
   * Crea un efecto de oscurecimiento gradual en las zonas
   * donde la visibilidad cambia de VISIBLE a SEEN/UNKNOWN.
   * 
   * @param {CanvasRenderingContext2D} ctx - Contexto del canvas
   * @param {import('../map/TileMap.js').TileMap} tileMap - Mapa de tiles
   * @param {import('./Camera.js').Camera} camera - Cámara actual
   * @param {number} startCol - Columna inicial del viewport
   * @param {number} endCol - Columna final del viewport
   * @param {number} startRow - Fila inicial del viewport
   * @param {number} endRow - Fila final del viewport
   * @param {number} tileSize - Tamaño del tile en píxeles
   * @private
   */
  _dibujarSombrasFOV(ctx, tileMap, camera, startCol, endCol, startRow, endRow, tileSize) {
    // Recorrer tiles visibles y añadir sombra en los bordes del FOV
    for (let y = startRow; y <= endRow; y++) {
      for (let x = startCol; x <= endCol; x++) {
        if (!tileMap.isInBounds(x, y)) continue;

        const vis = tileMap.getVisibility(x, y);
        // Solo nos interesan los tiles VISIBLES que bordean tiles no visibles
        if (vis !== 2) continue;

        // Comprobar si algún vecino tiene menor visibilidad
        const tieneVecinoOscuro = this._tieneVecinoMenosVisible(x, y, tileMap);
        if (!tieneVecinoOscuro) continue;

        // Dibujar sombra sutil sobre este tile de borde
        const screenPos = camera.worldToScreen(x, y);
        ctx.fillStyle = 'rgba(0, 0, 0, 0.15)';
        ctx.fillRect(screenPos.x, screenPos.y, tileSize, tileSize);
      }
    }
  }

  /**
   * Comprueba si un tile visible tiene algún vecino con menor visibilidad.
   * Esto identifica los tiles en el borde del campo de visión.
   * 
   * @param {number} x - Coordenada X del tile
   * @param {number} y - Coordenada Y del tile
   * @param {import('../map/TileMap.js').TileMap} tileMap - Mapa de tiles
   * @returns {boolean} true si hay al menos un vecino con visibilidad < 2
   * @private
   */
  _tieneVecinoMenosVisible(x, y, tileMap) {
    const direcciones = [
      { dx: 0, dy: -1 },  // arriba
      { dx: 1, dy: 0 },   // derecha
      { dx: 0, dy: 1 },   // abajo
      { dx: -1, dy: 0 },  // izquierda
    ];

    for (const { dx, dy } of direcciones) {
      const nx = x + dx;
      const ny = y + dy;

      // Los tiles fuera del mapa cuentan como "menos visibles"
      if (!tileMap.isInBounds(nx, ny)) return true;

      if (tileMap.getVisibility(nx, ny) < 2) {
        return true;
      }
    }

    return false;
  }
}
