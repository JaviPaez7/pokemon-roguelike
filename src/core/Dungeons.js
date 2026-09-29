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
 * Mazmorras que se hacen en cualquier orden (los tres picos del posjuego):
 * cada una sube `levels[n]` niveles, donde n es cuántas de las otras del grupo
 * se han completado ya. Así la dificultad crece desde el primer pico que se
 * haga, sea cual sea, y no según cuál es.
 * @typedef {{ dungeons: string[], levels: number[] }} LevelScaling
 */

/** @type {LevelScaling[]} */
export const LEVEL_SCALING = dungeonsData.levelScaling ?? [];

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

/**
 * Niveles de más de los Pokémon de una mazmorra (salvajes, jefe, amistosos,
 * forajidos y clientes de escolta) según cuántas de las otras de su grupo de
 * `levelScaling` se han completado ya. La propia no cuenta: repetir un pico
 * no lo sube. Fuera de un grupo, 0.
 * @param {string | null | undefined} dungeonId
 * @param {string[]} [cleared] - Ids de mazmorras completadas (`profile.clearedDungeons`)
 * @returns {number}
 */
export function levelBonus(dungeonId, cleared = []) {
  const group = LEVEL_SCALING.find((g) => g.dungeons.includes(dungeonId));
  if (!group) return 0;
  const done = group.dungeons.filter((id) => id !== dungeonId && cleared.includes(id)).length;
  return group.levels[Math.min(done, group.levels.length - 1)] ?? 0;
}

/**
 * @typedef {{ levelRange: [number, number], boss?: { level: number } | null, levelBonus?: number }} LeveledZone
 */

/**
 * Una zona de floors.json con los niveles subidos: los de los salvajes
 * (`levelRange`) y el del jefe (`boss.level`). Apunta el ajuste en
 * `levelBonus`, que suben también los amistosos (`friendlyLevel`). Sin ajuste
 * devuelve la misma zona; con él, una copia (floors.json no se toca).
 * @template {LeveledZone} Z
 * @param {Z} zone
 * @param {number} bonus
 * @returns {Z}
 */
export function scaledZone(zone, bonus) {
  if (!zone || !bonus) return zone;
  return {
    ...zone,
    levelRange: [zone.levelRange[0] + bonus, zone.levelRange[1] + bonus],
    boss: zone.boss ? { ...zone.boss, level: zone.boss.level + bonus } : zone.boss,
    levelBonus: bonus,
  };
}
