/**
 * HeldItems.js — Objetos equipables.
 *
 * Cada Pokémon del equipo puede llevar un objeto de tipo `held`
 * (`pokemonInfo.heldItem`, que viaja en su ficha). Lo que hace cada uno está
 * en su campo `held` de items.json:
 * - `stats`: multiplica esas estadísticas en el cálculo de daño.
 * - `preventStatus`: estados que no le afectan.
 * - `bellyDrain`: multiplica lo que baja la tripa (si lo lleva el líder).
 * - `recruit`: ayuda a reclutar (si lo lleva el líder).
 */

import itemsData from '../data/items.json';

/**
 * @typedef {Object} HeldEffect
 * @property {Record<string, number>} [stats]
 * @property {string[]} [preventStatus]
 * @property {number} [bellyDrain]
 * @property {boolean} [recruit]
 */

/** @type {Map<string, { name: string, held: HeldEffect }>} */
const HELD = new Map(itemsData.filter((i) => i.type === 'held').map((i) => [i.id, { name: i.name, held: i.held }]));

/** Efectos de movimiento que causan un estado con otro nombre. */
const EFFECT_STATUS = { badly_poison: 'poison' };

/** @param {string | null | undefined} itemId */
export function isHeldItem(itemId) {
  return HELD.has(itemId);
}

/**
 * @param {string | null | undefined} itemId
 * @returns {HeldEffect | null}
 */
export function heldEffect(itemId) {
  return HELD.get(itemId)?.held ?? null;
}

/** @param {string | null | undefined} itemId */
export function heldName(itemId) {
  return HELD.get(itemId)?.name ?? itemId ?? '';
}

/**
 * Multiplicador de una estadística por el objeto que lleva.
 * @param {{ heldItem?: string | null } | null | undefined} info
 * @param {'attack' | 'defense' | 'spAtk' | 'spDef'} stat
 */
export function heldStatMultiplier(info, stat) {
  return heldEffect(info?.heldItem)?.stats?.[stat] ?? 1;
}

/**
 * Si el objeto que lleva le protege del estado que causa ese efecto.
 * @param {{ heldItem?: string | null } | null | undefined} info
 * @param {string} effect - Efecto del movimiento (`poison`, `badly_poison`, `sleep`…)
 */
export function heldPreventsStatus(info, effect) {
  const status = EFFECT_STATUS[effect] ?? effect;
  return !!heldEffect(info?.heldItem)?.preventStatus?.includes(status);
}

/** @param {{ heldItem?: string | null } | null | undefined} info */
export function heldBellyDrain(info) {
  return heldEffect(info?.heldItem)?.bellyDrain ?? 1;
}

/** @param {{ heldItem?: string | null } | null | undefined} info */
export function heldHelpsRecruit(info) {
  return !!heldEffect(info?.heldItem)?.recruit;
}

/**
 * Mete una unidad en la mochila (apilando si ya hay de ese objeto).
 * @param {{ itemId: string, quantity: number }[]} bag
 * @param {string} itemId
 * @param {number} maxSlots
 * @returns {boolean} false si no cabe
 */
function addOne(bag, itemId, maxSlots) {
  const slot = bag.find((s) => s.itemId === itemId);
  if (slot) {
    slot.quantity += 1;
    return true;
  }
  if (bag.length >= maxSlots) return false;
  bag.push({ itemId, quantity: 1 });
  return true;
}

/**
 * Equipa un objeto de la mochila. Si ya llevaba otro, vuelve a la mochila.
 * Modifica `info` y `bag`.
 * @param {{ heldItem?: string | null }} info
 * @param {{ itemId: string, quantity: number }[]} bag
 * @param {string} itemId
 * @param {{ maxSlots: number }} options
 * @returns {{ ok: true, previous: string | null } | { ok: false, reason: 'not_held' | 'not_in_bag' | 'bag_full' }}
 */
export function equipItem(info, bag, itemId, { maxSlots }) {
  if (!isHeldItem(itemId)) return { ok: false, reason: 'not_held' };
  const slot = bag.find((s) => s.itemId === itemId && s.quantity > 0);
  if (!slot) return { ok: false, reason: 'not_in_bag' };
  const previous = info.heldItem ?? null;
  if (previous === itemId) return { ok: true, previous };

  slot.quantity -= 1;
  if (slot.quantity === 0) bag.splice(bag.indexOf(slot), 1);
  if (previous && !addOne(bag, previous, maxSlots)) {
    // Deshacer: no hay hueco para el que llevaba
    addOne(bag, itemId, Infinity);
    return { ok: false, reason: 'bag_full' };
  }
  info.heldItem = itemId;
  return { ok: true, previous };
}

/**
 * Quita el objeto que lleva y lo guarda en la mochila. Modifica `info` y `bag`.
 * @param {{ heldItem?: string | null }} info
 * @param {{ itemId: string, quantity: number }[]} bag
 * @param {{ maxSlots: number }} options
 * @returns {{ ok: true, itemId: string } | { ok: false, reason: 'nothing_held' | 'bag_full' }}
 */
export function unequipItem(info, bag, { maxSlots }) {
  const itemId = info.heldItem;
  if (!itemId) return { ok: false, reason: 'nothing_held' };
  if (!addOne(bag, itemId, maxSlots)) return { ok: false, reason: 'bag_full' };
  info.heldItem = null;
  return { ok: true, itemId };
}
