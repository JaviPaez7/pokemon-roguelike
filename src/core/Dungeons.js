/**
 * Dungeons.js — Catálogo de mazmorras.
 *
 * Cada mazmorra es un tramo de los 50 pisos "globales" de floors.json: el piso
 * global decide la zona, los enemigos, los jefes y la dificultad; el jugador
 * ve el piso relativo a la mazmorra (Cueva Oscura va del 1 al 5 aunque por
 * dentro sean los pisos 6 a 10). La Torre del Desafío recorre los 50.
 */

import dungeonsData from '../data/dungeons.json';

/**
 * @typedef {Object} Dungeon
 * @property {string} id
 * @property {string} name
 * @property {[number, number]} floors - Primer y último piso global
 * @property {string} description
 * @property {{ cleared: string } | null} unlock - Qué hay que completar antes
 * @property {boolean} [challenge] - Reglas de desafío (roguelike)
 */

/** @type {Dungeon[]} */
export const DUNGEONS = dungeonsData.dungeons;

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
 */
export function isUnlocked(dungeon, cleared) {
  return !dungeon.unlock || cleared.includes(dungeon.unlock.cleared);
}

/**
 * @param {string[]} cleared
 * @returns {Dungeon[]} Mazmorras disponibles, en orden
 */
export function unlockedDungeons(cleared) {
  return DUNGEONS.filter((d) => isUnlocked(d, cleared));
}
