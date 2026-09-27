/**
 * Items.js — Reglas generales de los objetos.
 *
 * Los objetos únicos (`unique: true` en items.json, los que da la historia,
 * como el Pañuelo Centella) no se venden, no se tiran y no se pierden al caer.
 * Tampoco aparecen en la tienda ni en el suelo de las mazmorras.
 */

import itemsData from '../data/items.json';

const UNIQUE = new Set(itemsData.filter((i) => i.unique).map((i) => i.id));

/**
 * @param {string | null | undefined} itemId
 * @returns {boolean}
 */
export function isUniqueItem(itemId) {
  return UNIQUE.has(itemId);
}
