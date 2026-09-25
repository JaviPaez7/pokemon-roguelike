/**
 * Tips.js — Consejos que salen en el registro al llegar a un piso nuevo.
 *
 * El texto está en data/tips.json. Cuál toca lo decide un contador de la
 * partida que siempre avanza (los turnos jugados), no el RNG: así los consejos
 * rotan por toda la lista sin cambiar lo que sale en los pisos de una semilla.
 */

import tipsData from '../data/tips.json';

/** @type {string[]} */
export const TIPS = tipsData;

/**
 * Consejo que toca para un valor del contador. Recorre toda la lista.
 * @param {number} counter - Entero cualquiera (p. ej. `game.stats.turnsPlayed`)
 * @param {string[]} [tips]
 * @returns {string} Texto con el prefijo «Consejo:»
 */
export function tipFor(counter, tips = TIPS) {
  const n = Number.isFinite(counter) ? Math.trunc(counter) : 0;
  const index = ((n % tips.length) + tips.length) % tips.length;
  return `Consejo: ${tips[index]}`;
}
