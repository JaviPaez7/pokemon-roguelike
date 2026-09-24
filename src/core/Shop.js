/**
 * Shop.js — Surtido y precios de la tienda de Kecleon del pueblo.
 *
 * El surtido cambia cada día y siempre incluye lo básico para sobrevivir en
 * una mazmorra. No consume el RNG de la partida: el día decide el surtido.
 */

import { floorSeed } from './Random.js';

/** Lo que siempre vende Kecleon. */
export const SHOP_STAPLES = ['apple', 'oran_berry', 'potion', 'reviver_seed', 'escape_rope', 'antidote'];

/** Tipos de objeto que pueden aparecer como novedad del día. */
const ROTATING_TYPES = new Set(['heal', 'heal_percent', 'food', 'status_cure', 'pp_restore', 'pp_restore_full', 'gummi', 'seed', 'revive']);

/** Novedades del día además de lo básico. */
export const SHOP_DAILY_EXTRAS = 3;

/**
 * Precio de compra en el pueblo: los objetos raros cuestan más.
 * @param {{ rarity?: number }} item
 * @returns {number}
 */
export function buyPrice(item) {
  return Math.min(250, Math.max(8, Math.floor(18 / Math.max(0.05, item.rarity || 0.1))));
}

/**
 * Surtido de un día, con el formato de catálogo de MerchantMenu.
 * @param {number} day
 * @param {{ id: string, name: string, type: string, rarity?: number, description?: string }[]} itemsData
 * @returns {{ id: string, name: string, price: number, description: string }[]}
 */
export function townShopStock(day, itemsData) {
  const toEntry = (item) => ({ id: item.id, name: item.name, price: buyPrice(item), description: item.description || '' });
  const staples = SHOP_STAPLES.map((id) => itemsData.find((i) => i.id === id)).filter(Boolean);
  const pool = itemsData.filter((i) => ROTATING_TYPES.has(i.type) && !SHOP_STAPLES.includes(i.id));

  // Barajado determinista por día (LCG sembrado con el día)
  let state = floorSeed(day, 0, 'tienda') || 1;
  const next = () => {
    state = (Math.imul(state, 1103515245) + 12345) & 0x7fffffff;
    return state / 0x80000000;
  };
  const shuffled = [...pool];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return [...staples, ...shuffled.slice(0, SHOP_DAILY_EXTRAS)].map(toEntry);
}
