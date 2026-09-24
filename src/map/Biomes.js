/**
 * Biomes.js — Aspecto de cada piso.
 *
 * Cada mazmorra de dungeons.json dice qué tema usa (`tileset`) y los temas
 * están en data/tilesets.json: paleta y tipo de decoración (los pinta
 * render/TilesetPainter.js). El aspecto sale del piso global, así que la Torre
 * del Desafío, que recorre los 50, cambia de tema según el tramo.
 */

import tilesets from '../data/tilesets.json';
import { DUNGEONS } from '../core/Dungeons.js';

/** @type {Record<string, Object>} */
export const TILESETS = tilesets;

/**
 * Tema del piso global: el de la mazmorra normal a la que pertenece.
 * @param {number} globalFloor
 * @returns {string}
 */
export function tilesetIdForFloor(globalFloor) {
  const dungeon = DUNGEONS.find((d) => !d.challenge && globalFloor >= d.floors[0] && globalFloor <= d.floors[1]);
  return dungeon?.tileset && tilesets[dungeon.tileset] ? dungeon.tileset : 'bosque';
}

/**
 * @param {number} globalFloor - Piso global (1-50)
 * @returns {Object} Tema con su id
 */
export function getBiomeForFloor(globalFloor) {
  const id = tilesetIdForFloor(globalFloor);
  return { id, ...tilesets[id] };
}
