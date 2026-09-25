/**
 * Dungeons.js — Catálogo de mazmorras.
 *
 * Cada mazmorra es un tramo de los pisos "globales" de floors.json: el piso
 * global decide la zona, los enemigos, los jefes y la dificultad; el jugador
 * ve el piso relativo a la mazmorra (Cueva Oscura va del 1 al 5 aunque por
 * dentro sean los pisos 6 a 10). La historia ocupa los pisos 1 a 50 y la Torre
 * del Desafío los recorre todos; las mazmorras de posjuego (los legendarios)
 * van del 51 en adelante.
 */

import dungeonsData from '../data/dungeons.json';

/**
 * Qué hace falta para que una mazmorra se abra:
 * - `{ cleared: 'id' }`: haber completado esa mazmorra.
 * - `{ cleared: ['a', 'b'] }`: haberlas completado todas.
 * - `{ story: 'F-3' }`: haber visto esa escena de la historia (el final).
 * @typedef {{ cleared: string | string[] } | { story: string }} Unlock
 */

/**
 * @typedef {Object} Dungeon
 * @property {string} id
 * @property {string} name
 * @property {[number, number]} floors - Primer y último piso global
 * @property {string} description
 * @property {Unlock | null} unlock - Qué hace falta antes
 * @property {boolean} [challenge] - Reglas de desafío (roguelike)
 * @property {boolean} [postgame] - Posjuego: se abre tras el final de la historia
 * @property {string} [tileset] - Tema de casillas (tilesets.json)
 */

/** @type {Dungeon[]} */
export const DUNGEONS = dungeonsData.dungeons;

/**
 * Viento: turnos que se puede pasar en un piso. En cada aviso sopla más
 * fuerte; al llegar al límite, el viento expulsa al equipo de la mazmorra.
 * @type {{ limit: number, warnings: number[] }}
 */
export const WIND = dungeonsData.wind;

/**
 * @param {string} id
 * @returns {Dungeon}
 */
export function getDungeon(id) {
  const dungeon = DUNGEONS.find((d) => d.id === id);
  if (!dungeon) throw new Error(`Mazmorra desconocida: ${id}`);
  return dungeon;
}

/** @param {Dungeon} dungeon @returns {number} */
export function floorCount(dungeon) {
  return dungeon.floors[1] - dungeon.floors[0] + 1;
}

/**
 * @param {Dungeon} dungeon
 * @param {number} globalFloor
 * @returns {number} Piso que ve el jugador (1 = primero de la mazmorra)
 */
export function relativeFloor(dungeon, globalFloor) {
  return globalFloor - dungeon.floors[0] + 1;
}

/** @param {Dungeon} dungeon @param {number} globalFloor */
export function isLastFloor(dungeon, globalFloor) {
  return globalFloor >= dungeon.floors[1];
}

/**
 * @param {Dungeon} dungeon
 * @param {string[]} cleared - Ids de mazmorras completadas
 * @param {string[]} [seen] - Escenas de la historia vistas (`profile.story.seen`)
 * @returns {boolean}
 */
export function isUnlocked(dungeon, cleared, seen = []) {
  const unlock = dungeon.unlock;
  if (!unlock) return true;
  if ('story' in unlock) return seen.includes(unlock.story);
  const needed = Array.isArray(unlock.cleared) ? unlock.cleared : [unlock.cleared];
  return needed.every((id) => cleared.includes(id));
}

/**
 * @param {string[]} cleared
 * @param {string[]} [seen] - Escenas de la historia vistas
 * @returns {Dungeon[]} Mazmorras disponibles, en orden
 */
export function unlockedDungeons(cleared, seen = []) {
  return DUNGEONS.filter((d) => isUnlocked(d, cleared, seen));
}
