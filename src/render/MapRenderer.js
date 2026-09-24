/**
 * MapRenderer.js
 * 
 * Renderizador del mapa de tiles de la mazmorra.
 *
 * El piso entero se pinta una vez en un lienzo aparte (con el tema de la
 * mazmorra, render/TilesetPainter.js) y solo se vuelve a pintar si cambia una
 * casilla (`tileMap.version`). En cada fotograma se copia ese lienzo y encima
 * se dibujan el agua y la lava animadas y la niebla de guerra.
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

import { TILES } from '../map/TileTypes.js';
import { paintDungeonTile } from './TilesetPainter.js';
import tilesets from '../data/tilesets.json';

/** Oscurecimiento de las casillas recordadas pero fuera del FOV actual */
const NIEBLA_SEEN = 'rgba(0, 0, 0, 0.6)';

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

    /** @type {HTMLCanvasElement | null} Piso dibujado */
    this._capa = null;
    /** @type {Object | null} Mapa de la capa */
    this._capaMapa = null;
    /** @type {string} Versión del mapa, tema y tamaño con que se dibujó */
    this._capaClave = '';
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
    this._tiempo = performance.now();
    const tileSize = camera.tileSize;

    const capa = this._obtenerCapa(tileMap, tileSize);
    const origen = camera.worldToScreen(0, 0);
    if (capa) ctx.drawImage(capa, origen.x, origen.y);

    const { startCol, endCol, startRow, endRow } = camera.getVisibleRange();
    const tema = tileMap.biome ?? {};
    const colorVacio = tema.void ?? '#000000';

    for (let y = startRow; y <= endRow; y++) {
      for (let x = startCol; x <= endCol; x++) {
        if (!tileMap.isInBounds(x, y)) continue;
        const { x: sx, y: sy } = camera.worldToScreen(x, y);
        const visibilidad = tileMap.getVisibility(x, y);

        // Sin descubrir: se tapa
        if (visibilidad === 0) {
          ctx.fillStyle = colorVacio;
          ctx.fillRect(sx, sy, tileSize, tileSize);
          continue;
        }

        // Agua y lava se mueven
        const id = tileMap.tiles[y][x];
        if (!tileMap.isTown && (id === TILES.WATER.id || id === TILES.LAVA.id)) {
          const base = id === TILES.WATER.id ? (tema.water ?? TILES.WATER.colors.floor) : (tema.lava ?? '#ff5500');
          ctx.fillStyle = this._calcularColorOla(base, x, y);
          ctx.globalAlpha = 0.45;
          ctx.fillRect(sx, sy, tileSize, tileSize);
          ctx.globalAlpha = 1;
        }

        if (visibilidad === 1) {
          ctx.fillStyle = NIEBLA_SEEN;
          ctx.fillRect(sx, sy, tileSize, tileSize);
        }
      }
    }

    // Dibujar sombra/degradado en los bordes del FOV
    this._dibujarSombrasFOV(ctx, tileMap, camera, startCol, endCol, startRow, endRow, tileSize);
  }

  /**
   * El piso entero dibujado en un lienzo aparte; se rehace si cambia el mapa.
   * @param {import('../map/TileMap.js').TileMap} tileMap
   * @param {number} tileSize
   * @returns {HTMLCanvasElement | null}
   * @private
   */
  _obtenerCapa(tileMap, tileSize) {
    const clave = `${tileMap.version ?? 0}|${tileMap.isTown ? 'pueblo' : tileMap.biome?.id ?? ''}|${tileSize}`;
    if (this._capa && this._capaMapa === tileMap && this._capaClave === clave) return this._capa;
    if (typeof document === 'undefined') return null;

    const capa = this._capa ?? document.createElement('canvas');
    capa.width = tileMap.width * tileSize;
    capa.height = tileMap.height * tileSize;
    const c = capa.getContext('2d');
    c.imageSmoothingEnabled = false;
    c.clearRect(0, 0, capa.width, capa.height);

    const tema = tileMap.biome?.deco ? tileMap.biome : { id: 'bosque', ...tilesets.bosque };
    for (let y = 0; y < tileMap.height; y++) {
      for (let x = 0; x < tileMap.width; x++) {
        const tile = tileMap.getTile(x, y);
        const px = x * tileSize;
        const py = y * tileSize;
        if (tile.id >= TILES.TOWN_GRASS.id) {
          this._dibujarTilePueblo(c, tile, px, py, tileSize, x, y);
          continue;
        }
        paintDungeonTile(c, tileMap, x, y, px, py, tileSize, tema);
        if (tile.id === TILES.STAIRS_DOWN.id) {
          c.fillStyle = tema.stairs;
          c.fillRect(px + 2, py + 2, tileSize - 4, tileSize - 4);
          this._dibujarEscaleras(c, px, py, tileSize);
        }
      }
    }

    this._capa = capa;
    this._capaMapa = tileMap;
    this._capaClave = clave;
    return capa;
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
