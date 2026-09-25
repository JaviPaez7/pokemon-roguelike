/**
 * TilesetPainter.js — Dibujo procedural de las casillas de las mazmorras.
 *
 * Cada mazmorra tiene su tema (data/tilesets.json): paleta y tipo de
 * decoración. Las casillas se pintan con formas simples y un hash de la
 * posición, así que el mismo piso se ve siempre igual. Es arte original: no
 * copia casillas de ningún juego.
 */

import { TILES } from '../map/TileTypes.js';

/**
 * Hash determinista de una casilla (0..2^32).
 * @param {number} x
 * @param {number} y
 * @param {number} [salt]
 */
export function tileHash(x, y, salt = 0) {
  let h = (x * 374761393 + y * 668265263 + salt * 2246822519) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

/** @param {number} id */
const isWallId = (id) => id === TILES.WALL.id || id === TILES.VOID.id;

/**
 * Pinta una casilla completa (estática) de mazmorra.
 * @param {CanvasRenderingContext2D} ctx
 * @param {import('../map/TileMap.js').TileMap} tileMap
 * @param {number} x - Casilla
 * @param {number} y
 * @param {number} px - Píxel de destino
 * @param {number} py
 * @param {number} s - Tamaño de casilla
 * @param {Object} ts - Tema (tilesets.json)
 */
export function paintDungeonTile(ctx, tileMap, x, y, px, py, s, ts) {
  const tile = tileMap.getTile(x, y);
  const h = tileHash(x, y);

  if (isWallId(tile.id)) {
    paintWall(ctx, tileMap, x, y, px, py, s, ts, h);
    return;
  }

  if (tile.id === TILES.WATER.id) {
    paintLiquid(ctx, px, py, s, ts.water, h, 'rgba(255, 255, 255, 0.18)');
  } else if (tile.id === TILES.LAVA.id) {
    paintLiquid(ctx, px, py, s, ts.lava, h, 'rgba(255, 230, 120, 0.55)');
  } else {
    const corridor = tile.id === TILES.CORRIDOR.id;
    ctx.fillStyle = corridor ? ts.corridor : (h % 5 === 0 ? ts.floorAlt : ts.floor);
    ctx.fillRect(px, py, s, s);
    if (tile.id !== TILES.STAIRS_DOWN.id) paintDecoration(ctx, px, py, s, ts, h);
    if (typeof tileMap.isRestRoom === 'function' && tileMap.isRestRoom(x, y)) {
      ctx.fillStyle = 'rgba(140, 230, 170, 0.14)';
      ctx.fillRect(px, py, s, s);
    }
    if (tile.id === TILES.WONDER_TILE.id) {
      ctx.fillStyle = '#c9a0ff';
      ctx.fillRect(px + 4, py + 4, s - 8, s - 8);
      ctx.fillStyle = '#f5e8ff';
      ctx.fillRect(px + s / 2 - 1, py + 6, 2, s - 12);
      ctx.fillRect(px + 6, py + s / 2 - 1, s - 12, 2);
    }
  }

  // Sombra de la pared de arriba
  if (isWallId(tileMap.getTile(x, y - 1).id)) {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
    ctx.fillRect(px, py, s, 4);
  }

  ctx.strokeStyle = ts.gridLines;
  ctx.lineWidth = 0.5;
  ctx.strokeRect(px + 0.25, py + 0.25, s - 0.5, s - 0.5);
}

/** Pared con relieve hacia el suelo que toca. */
function paintWall(ctx, tileMap, x, y, px, py, s, ts, h) {
  ctx.fillStyle = ts.wall;
  ctx.fillRect(px, py, s, s);

  const open = (dx, dy) => !isWallId(tileMap.getTile(x + dx, y + dy).id);
  const below = open(0, 1);
  const above = open(0, -1);
  const left = open(-1, 0);
  const right = open(1, 0);

  if (ts.deco === 'grass' || ts.deco === 'dream') {
    // Copas de árbol (o nubes, en el jardín del sueño): tres manchas
    const blobs = [[0.3, 0.35, 0.3], [0.7, 0.4, 0.28], [0.5, 0.7, 0.3]];
    for (let i = 0; i < blobs.length; i++) {
      const [bx, by, r] = blobs[i];
      ctx.fillStyle = (h >> i) & 1 ? ts.wallTop : ts.wallEdge;
      ctx.beginPath();
      ctx.arc(px + bx * s + ((h >> (i * 3)) % 3) - 1, py + by * s, r * s, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (ts.deco === 'panels') {
    ctx.fillStyle = ts.wallTop;
    ctx.fillRect(px + 2, py + 2, s - 4, 2);
    if (h % 17 === 0) {
      ctx.fillStyle = ts.decoColors[2];
      ctx.fillRect(px + 4, py + s / 2 - 1, s - 8, 2);
    }
  } else if (ts.deco === 'frost') {
    // Hielo: caras claras en diagonal y algún destello
    ctx.fillStyle = ts.wallTop;
    for (let i = 0; i < 2; i++) {
      const off = 2 + ((h >> (i * 4)) % (s - 14)) + i * 4;
      for (let k = 0; k < 6; k++) ctx.fillRect(px + off + k, py + 3 + k * 2, 1, 2);
    }
    if (h % 7 === 0) {
      ctx.fillStyle = ts.decoColors[0];
      ctx.fillRect(px + 4 + (h % (s - 8)), py + 4 + ((h >> 5) % (s - 12)), 1, 1);
    }
  } else {
    // Roca: motas claras y oscuras
    for (let i = 0; i < 3; i++) {
      const v = h >> (i * 5);
      ctx.fillStyle = i % 2 ? ts.wallEdge : ts.wallTop;
      ctx.fillRect(px + (v % (s - 4)) + 1, py + ((v >> 3) % (s - 4)) + 1, 2 + (v % 2), 2);
    }
  }

  // Relieve: canto claro donde la pared da al suelo, oscuro en el resto
  ctx.fillStyle = ts.wallTop;
  if (below) ctx.fillRect(px, py + s - 5, s, 5);
  ctx.fillStyle = ts.wallEdge;
  if (below) ctx.fillRect(px, py + s - 2, s, 2);
  if (above) ctx.fillRect(px, py, s, 2);
  if (left) ctx.fillRect(px, py, 2, s);
  if (right) ctx.fillRect(px + s - 2, py, 2, s);
}

/** Agua o lava: fondo y un par de ondas. */
function paintLiquid(ctx, px, py, s, color, h, shine) {
  ctx.fillStyle = color;
  ctx.fillRect(px, py, s, s);
  ctx.fillStyle = shine;
  const ox = h % 8;
  ctx.fillRect(px + 3 + ox, py + 6, 6, 1);
  ctx.fillRect(px + 10 - (ox >> 1), py + 15, 7, 1);
}

/** Decoración del suelo según el tema. */
function paintDecoration(ctx, px, py, s, ts, h) {
  const [c0, c1, c2] = ts.decoColors;
  const r = h % 100;
  const ax = px + 3 + ((h >> 8) % (s - 8));
  const ay = py + 4 + ((h >> 13) % (s - 9));
  switch (ts.deco) {
    case 'grass':
      if (r < 35) {
        ctx.fillStyle = c0;
        ctx.fillRect(ax, ay, 1, 3);
        ctx.fillRect(ax + 2, ay - 1, 1, 4);
        ctx.fillRect(ax + 4, ay + 1, 1, 2);
      } else if (r < 41) {
        ctx.fillStyle = r % 2 ? c1 : c2;
        ctx.fillRect(ax, ay, 2, 2);
        ctx.fillRect(ax + 4, ay + 3, 2, 2);
      }
      break;
    case 'pebbles':
      if (r < 30) {
        ctx.fillStyle = c0;
        ctx.fillRect(ax, ay, 3, 2);
        ctx.fillStyle = c1;
        ctx.fillRect(ax, ay + 2, 3, 1);
      } else if (r < 38) {
        ctx.fillStyle = c1;
        ctx.fillRect(ax, ay, 5, 1);
        ctx.fillRect(ax + 4, ay + 1, 3, 1);
      }
      break;
    case 'sparks':
      if (r < 8) {
        ctx.fillStyle = c0;
        ctx.fillRect(ax, ay, 2, 1);
        ctx.fillRect(ax + 1, ay + 1, 2, 1);
        ctx.fillRect(ax, ay + 2, 2, 1);
        ctx.fillStyle = c1;
        ctx.fillRect(ax + 1, ay + 1, 1, 1);
      } else if (r < 30) {
        ctx.fillStyle = c2;
        ctx.fillRect(ax, ay, 1, 1);
        ctx.fillRect(ax + 5, ay + 3, 1, 1);
      }
      break;
    case 'craters':
      if (r < 12) {
        ctx.strokeStyle = c0;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(ax + 3, ay + 3, 3, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = c1;
        ctx.fillRect(ax + 1, ay + 1, 2, 1);
      } else if (r < 20) {
        ctx.fillStyle = c2;
        ctx.fillRect(ax, ay, 1, 1);
      }
      break;
    case 'motes':
      if (r < 10) {
        ctx.fillStyle = r % 2 ? c0 : c1;
        ctx.globalAlpha *= 0.6;
        ctx.fillRect(ax, ay, 2, 2);
        ctx.globalAlpha /= 0.6;
      }
      break;
    case 'cracks':
      if (r < 18) {
        ctx.fillStyle = c0;
        ctx.fillRect(ax, ay, 4, 1);
        ctx.fillRect(ax + 3, ay + 1, 1, 3);
        ctx.fillRect(ax + 3, ay + 3, 4, 1);
        if (r < 6) {
          ctx.fillStyle = c1;
          ctx.fillRect(ax + 1, ay, 2, 1);
          ctx.fillRect(ax + 4, ay + 3, 2, 1);
        }
      }
      break;
    case 'panels':
      ctx.strokeStyle = c0;
      ctx.lineWidth = 1;
      ctx.strokeRect(px + 2.5, py + 2.5, s - 5, s - 5);
      ctx.fillStyle = c1;
      ctx.fillRect(px + 3, py + 3, 1, 1);
      ctx.fillRect(px + s - 4, py + 3, 1, 1);
      ctx.fillRect(px + 3, py + s - 4, 1, 1);
      ctx.fillRect(px + s - 4, py + s - 4, 1, 1);
      break;
    case 'frost':
      if (r < 9) {
        // Copo: cruz con puntas
        ctx.fillStyle = c0;
        ctx.fillRect(ax, ay + 2, 5, 1);
        ctx.fillRect(ax + 2, ay, 1, 5);
        ctx.fillRect(ax, ay, 1, 1);
        ctx.fillRect(ax + 4, ay, 1, 1);
        ctx.fillRect(ax, ay + 4, 1, 1);
        ctx.fillRect(ax + 4, ay + 4, 1, 1);
      } else if (r < 24) {
        // Grieta en el hielo
        ctx.fillStyle = c1;
        ctx.fillRect(ax, ay, 2, 1);
        ctx.fillRect(ax + 2, ay + 1, 2, 1);
        ctx.fillRect(ax + 4, ay + 2, 1, 2);
      } else if (r < 34) {
        ctx.fillStyle = c2;
        ctx.fillRect(ax, ay, 1, 1);
        ctx.fillRect(ax + 3, ay + 2, 1, 1);
      }
      break;
    case 'storm':
      if (r < 12) {
        // Charco de lluvia con reflejo
        ctx.fillStyle = c0;
        ctx.fillRect(ax, ay + 1, 7, 2);
        ctx.fillRect(ax + 1, ay, 5, 4);
        ctx.fillStyle = c2;
        ctx.fillRect(ax + 2, ay + 1, 2, 1);
      } else if (r < 17) {
        // Marca de rayo
        ctx.fillStyle = c1;
        ctx.fillRect(ax + 2, ay, 2, 2);
        ctx.fillRect(ax + 1, ay + 2, 2, 1);
        ctx.fillRect(ax + 2, ay + 3, 2, 1);
        ctx.fillRect(ax + 1, ay + 4, 2, 2);
      } else if (r < 34) {
        // Gotas
        ctx.fillStyle = c2;
        ctx.fillRect(ax, ay, 1, 2);
        ctx.fillRect(ax + 4, ay + 3, 1, 2);
      }
      break;
    case 'embers':
      if (r < 12) {
        // Brasa con el centro al rojo
        ctx.fillStyle = c0;
        ctx.fillRect(ax, ay, 3, 2);
        ctx.fillRect(ax + 1, ay - 1, 1, 4);
        ctx.fillStyle = c1;
        ctx.fillRect(ax + 1, ay, 1, 2);
      } else if (r < 30) {
        // Ceniza
        ctx.fillStyle = c2;
        ctx.fillRect(ax, ay, 2, 1);
        ctx.fillRect(ax + 4, ay + 2, 1, 1);
      }
      break;
    case 'dream':
      if (r < 8) {
        // Destello
        ctx.fillStyle = c0;
        ctx.fillRect(ax + 2, ay, 1, 5);
        ctx.fillRect(ax, ay + 2, 5, 1);
      } else if (r < 18) {
        // Burbuja
        ctx.strokeStyle = r % 2 ? c1 : c2;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(ax + 3, ay + 3, 2.5, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = c0;
        ctx.fillRect(ax + 2, ay + 1, 1, 1);
      }
      break;
    default:
      break;
  }
}
