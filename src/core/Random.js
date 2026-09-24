/**
 * Random.js — Aleatoriedad del juego.
 *
 * Todo lo que afecta a la partida (mapas, combate, IA, objetos, reclutamiento)
 * sale del RNG de rot-js, que tiene semilla: con la misma semilla y las mismas
 * acciones, la partida se repite. Así los fallos se pueden reproducir y los
 * tests son deterministas.
 *
 * Solo los efectos visuales y de sonido (`src/render/`, `src/audio/`) pueden
 * usar `Math.random`, porque no deben alterar la partida. Un test unitario
 * vigila que no aparezca en el resto del código.
 */

import { RNG } from 'rot-js';

/** @returns {number} Número en [0, 1) */
export function random() {
  return RNG.getUniform();
}

/**
 * Entero en [min, max], ambos incluidos.
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
export function randomInt(min, max) {
  return RNG.getUniformInt(min, max);
}

/**
 * @param {number} probability - Entre 0 y 1
 * @returns {boolean} true con esa probabilidad
 */
export function chance(probability) {
  return RNG.getUniform() < probability;
}

/**
 * @template T
 * @param {T[]} items
 * @returns {T|null} Un elemento al azar, o null si la lista está vacía
 */
export function pick(items) {
  return RNG.getItem(items);
}

/**
 * @template T
 * @param {T[]} items
 * @returns {T[]} Copia barajada
 */
export function shuffle(items) {
  return RNG.shuffle(items);
}

/** @param {number} seed */
export function setSeed(seed) {
  RNG.setSeed(seed);
}

/** @returns {number[]} Estado interno, para guardarlo y restaurarlo */
export function getState() {
  return RNG.getState();
}

/** @param {number[]} state - Lo devuelto por getState() */
export function setState(state) {
  RNG.setState(state);
}

/**
 * Semilla de un piso, derivada de la de la partida. Un piso concreto sale
 * igual con la misma semilla de partida, se haya jugado como se haya jugado
 * el anterior.
 * @param {number} runSeed
 * @param {number} floor
 * @param {string} [dungeonId=''] - Para que cada mazmorra tenga sus propios pisos
 * @returns {number} Entero positivo de 31 bits
 */
export function floorSeed(runSeed, floor, dungeonId = '') {
  // FNV-1a de 32 bits sobre "semilla|mazmorra|piso"
  let hash = 0x811c9dc5;
  const text = `${runSeed}|${dungeonId}|${floor}`;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0) & 0x7fffffff;
}

/**
 * Semilla para una partida nueva. `?seed=N` en la URL la fija (tests, retos o
 * para reproducir un fallo); si no, es aleatoria.
 * @returns {number}
 */
export function newRunSeed() {
  const fromUrl = seedFromUrl();
  if (fromUrl !== null) return fromUrl;
  const buffer = new Uint32Array(1);
  globalThis.crypto.getRandomValues(buffer);
  return buffer[0] & 0x7fffffff;
}

/** @returns {number|null} */
function seedFromUrl() {
  try {
    const value = new URLSearchParams(globalThis.location?.search || '').get('seed');
    if (value === null || !/^\d+$/.test(value)) return null;
    return Number(value) & 0x7fffffff;
  } catch (e) {
    return null;
  }
}
