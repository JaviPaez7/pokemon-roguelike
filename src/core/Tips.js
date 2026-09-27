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

/**
 * Qué avisos del registro tocan al llegar a un piso: el recordatorio de
 * guardar cada 5 pisos y un consejo cada 2. Cuentan los pisos de la
 * expedición, no los globales: así nunca salen en el primer piso (que ya tiene
 * la presentación de la mazmorra) y caen igual en todas las mazmorras, empiecen
 * donde empiecen (la Cueva Oscura empieza en el piso global 6 y el Jardín del
 * Primer Sueño en el 75).
 * @param {number} floor - Piso de la mazmorra (`game.getCurrentFloor()`)
 * @returns {{ saveReminder: boolean, tip: boolean }}
 */
export function floorReminders(floor) {
  return { saveReminder: floor > 1 && floor % 5 === 0, tip: floor > 1 && floor % 2 === 0 };
}
