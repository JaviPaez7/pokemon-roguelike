/**
 * PmdSprites.js — Sprites animados y retratos de PMDCollab (SpriteCollab).
 *
 * Cada animación es una hoja con una fila por dirección (8, en el orden de
 * Mundo Misterioso) y un fotograma por columna. `pmd-sprites.json` guarda el
 * tamaño del fotograma y la duración de cada uno en fotogramas de juego
 * (1/60 s). Lo genera `scripts/fetch-pmd-sprites.mjs`.
 */

import manifest from '../data/pmd-sprites.json';

const BASE = `${import.meta.env?.BASE_URL ?? '/'}sprites/pmd/`;

/** Duración de un fotograma de juego de Mundo Misterioso, en ms. */
export const TICK_MS = 1000 / 60;

/** Fila de la hoja para cada dirección (dx, dy). */
const DIRECTION_ROWS = {
  '0,1': 0, '1,1': 1, '1,0': 2, '1,-1': 3, '0,-1': 4, '-1,-1': 5, '-1,0': 6, '-1,1': 7,
};

/** Animaciones que se sustituyen por otra si la especie no la tiene. */
const FALLBACK = { Shoot: 'Attack', Sleep: 'Idle', Hurt: 'Idle', Attack: 'Idle', Idle: 'Walk' };

/**
 * @typedef {{ file: string, w: number, h: number, d: number[] }} PmdAnim
 */

/**
 * Fila de la hoja para una dirección. Las hojas de una sola fila (algunas
 * animaciones de dormir) usan siempre la primera.
 * @param {number} dx
 * @param {number} dy
 * @param {number} rows - Filas que tiene la hoja
 */
export function directionRow(dx, dy, rows = 8) {
  if (rows < 8) return 0;
  return DIRECTION_ROWS[`${Math.sign(dx)},${Math.sign(dy)}`] ?? 0;
}

/**
 * Fotograma que toca a los `elapsedMs` de empezar la animación.
 * @param {number[]} durations - En fotogramas de juego
 * @param {number} elapsedMs
 * @param {boolean} loop - Si no, se queda en el último
 */
export function frameAt(durations, elapsedMs, loop = true) {
  const total = durations.reduce((a, b) => a + b, 0);
  if (!total) return 0;
  let tick = Math.floor(Math.max(0, elapsedMs) / TICK_MS);
  if (loop) tick %= total;
  else if (tick >= total) return durations.length - 1;
  for (let i = 0; i < durations.length; i++) {
    if (tick < durations[i]) return i;
    tick -= durations[i];
  }
  return durations.length - 1;
}

/**
 * Datos de una animación de una especie, con sustitutos si le falta.
 * @param {number} speciesId
 * @param {string} name
 * @returns {PmdAnim | null}
 */
export function animFor(speciesId, name) {
  const anims = manifest[speciesId]?.anims;
  if (!anims) return null;
  let current = name;
  for (let i = 0; i < 4 && current; i++) {
    if (anims[current]) return anims[current];
    current = FALLBACK[current];
  }
  return null;
}

/**
 * Duración total de una animación, en ms.
 * @param {number} speciesId
 * @param {string} name
 */
export function animDuration(speciesId, name) {
  const anim = animFor(speciesId, name);
  return anim ? anim.d.reduce((a, b) => a + b, 0) * TICK_MS : 0;
}

/** @param {number} speciesId */
export function hasPmdSprite(speciesId) {
  return !!manifest[speciesId];
}

/** Tamaño de la sombra de la especie (0 pequeña, 1 mediana, 2 grande). */
export function shadowSize(speciesId) {
  return manifest[speciesId]?.shadow ?? 1;
}

/**
 * URL del retrato de una especie con esa emoción; si no la tiene, el normal.
 * @param {number} speciesId
 * @param {string} [emotion]
 * @returns {string | null}
 */
export function portraitUrl(speciesId, emotion = 'Normal') {
  const portraits = manifest[speciesId]?.portraits;
  if (!portraits?.length) return null;
  const chosen = portraits.includes(emotion) ? emotion : portraits.includes('Normal') ? 'Normal' : portraits[0];
  return `${BASE}portraits/${String(speciesId).padStart(4, '0')}/${chosen}.png`;
}

/**
 * Carga y dibuja las hojas. Mientras una hoja no está cargada, `draw`
 * devuelve false para que se dibuje otra cosa.
 */
export class PmdSpriteSheets {
  constructor() {
    /** @type {Map<string, HTMLImageElement>} */
    this._images = new Map();
    /** @type {Set<string>} */
    this._failed = new Set();
  }

  /**
   * @param {number} speciesId
   * @param {string} file
   * @returns {HTMLImageElement | null} La imagen, si ya está lista
   */
  _image(speciesId, file) {
    const url = `${BASE}${String(speciesId).padStart(4, '0')}/${file}-Anim.png`;
    if (this._failed.has(url)) return null;
    let img = this._images.get(url);
    if (!img) {
      img = new Image();
      img.onerror = () => this._failed.add(url);
      img.src = url;
      this._images.set(url, img);
    }
    return img.complete && img.naturalWidth > 0 ? img : null;
  }

  /**
   * Empieza a cargar las animaciones de estas especies.
   * @param {Iterable<number>} speciesIds
   */
  preload(speciesIds) {
    for (const id of speciesIds) {
      for (const anim of Object.values(manifest[id]?.anims ?? {})) this._image(id, anim.file);
    }
  }

  /** Hojas cargadas y fallidas (para los tests). */
  stats() {
    let loaded = 0;
    for (const img of this._images.values()) if (img.complete && img.naturalWidth > 0) loaded++;
    return { requested: this._images.size, loaded, failed: this._failed.size };
  }

  /**
   * Dibuja un fotograma con su centro en (cx, cy).
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} speciesId
   * @param {string} animName
   * @param {{ dx: number, dy: number }} dir
   * @param {number} elapsedMs
   * @param {number} cx
   * @param {number} cy
   * @param {boolean} [loop]
   * @returns {boolean} false si la hoja aún no está lista
   */
  draw(ctx, speciesId, animName, dir, elapsedMs, cx, cy, loop = true) {
    const anim = animFor(speciesId, animName);
    if (!anim) return false;
    const img = this._image(speciesId, anim.file);
    if (!img) return false;
    const rows = Math.max(1, Math.round(img.naturalHeight / anim.h));
    const row = directionRow(dir.dx, dir.dy, rows);
    const frame = frameAt(anim.d, elapsedMs, loop);
    ctx.drawImage(img, frame * anim.w, row * anim.h, anim.w, anim.h,
      Math.round(cx - anim.w / 2), Math.round(cy - anim.h / 2), anim.w, anim.h);
    return true;
  }
}
