/**
 * Shop.js — Las tiendas de Kecleon: la del pueblo y la ambulante de las
 * mazmorras (el Kecleon Mercader de los eventos de piso).
 *
 * Los números y el surtido están en shop.json:
 * - `town`: lo que el Kecleon del pueblo vende siempre (`staples`) y cuántas
 *   novedades trae cada día (`dailyExtras`, de los tipos de `rotatingTypes`).
 *   Las novedades dependen solo del día: no consumen el RNG de la partida.
 * - `tiers`: los surtidos de rango. Cada uno se abre al llegar a su rango
 *   (`rank`) o, si trae `unlock` (con el formato de dungeons.json), al avanzar
 *   en la historia: lo que llegue antes. Desde entonces Kecleon vende siempre
 *   sus objetos, que nunca salen entre las novedades del día.
 * - `bag`: las mochilas más grandes. Se compran una vez y en orden, cada una
 *   cuando su surtido está abierto, y se apuntan en el perfil
 *   (`profile.upgrades.bag`, las compradas; falta en los perfiles de antes). En
 *   la Torre del Desafío la mochila es la de siempre.
 * - `prices` y `sell`: lo que cuesta un objeto y lo que Kecleon paga por él.
 *   `price` en items.json fija el precio; si no hay, sale de la rareza.
 * - `merchant`: el Kecleon Mercader cobra `price` (o el de la rareza) con un
 *   recargo que crece con el piso global y un descuento en lo básico de los
 *   primeros pisos.
 *
 * Los objetos únicos de la historia (core/Items.js) ni se venden ni se compran.
 */

import shopData from '../data/shop.json';
import { MAX_INVENTORY } from '../constants.js';
import { floorSeed } from './Random.js';
import { isUniqueItem } from './Items.js';
import { isUnlocked } from './Dungeons.js';
import { RANKS } from './Profile.js';

/**
 * @typedef {{ id: string, name: string, type: string, rarity?: number, price?: number, unique?: boolean, description?: string }} ItemData
 * @typedef {{ id: string, name: string, price: number, description: string, tier?: string, upgrade?: 'bag' }} ShopEntry
 *   Una línea del catálogo de MerchantMenu. `tier`: surtido de rango del que
 *   sale; `upgrade`: no es un objeto, sino una mejora para el perfil
 * @typedef {{ id: string, name: string, rank: string, unlock?: import('./Dungeons.js').Unlock, items: string[] }} ShopTier
 * @typedef {{ slots: number, price: number, tier: string }} BagUpgrade
 * @typedef {{ rankPoints?: number, clearedDungeons?: string[], story?: { seen?: string[] }, upgrades?: { bag?: number } }} ShopProfile
 *   Lo que la tienda mira del perfil (core/Profile.js)
 */

/** Lo que siempre vende Kecleon. */
export const SHOP_STAPLES = shopData.town.staples;

/** Novedades del día además de lo básico. */
export const SHOP_DAILY_EXTRAS = shopData.town.dailyExtras;

/** Tipos de objeto que pueden aparecer como novedad del día. */
const ROTATING_TYPES = new Set(shopData.town.rotatingTypes);

/** @type {ShopTier[]} Surtidos de rango, en orden */
export const SHOP_TIERS = shopData.tiers;

/** @type {BagUpgrade[]} Mochilas más grandes, en el orden en que se compran */
export const BAG_UPGRADES = shopData.bag.upgrades;

/** Objetos de algún surtido de rango: no salen entre las novedades del día. */
const TIER_ITEMS = new Set(SHOP_TIERS.flatMap((tier) => tier.items));

/** Id de la línea del catálogo que vende la siguiente mochila. */
export const BAG_UPGRADE_ID = 'bag_upgrade';

// ─── Precios ─────────────────────────────────────────────────────────────────

/**
 * Precio de compra en el pueblo: `price` si lo tiene; si no, los raros cuestan más.
 * @param {{ rarity?: number, price?: number }} item
 * @returns {number}
 */
export function buyPrice(item) {
  if (item.price != null) return item.price;
  const { rarityBase, min, max } = shopData.prices;
  return Math.min(max, Math.max(min, Math.floor(rarityBase / Math.max(0.05, item.rarity || 0.1))));
}

/**
 * Lo que paga Kecleon (el del pueblo y el ambulante) por un objeto: una parte
 * de `price` si lo tiene; si no, según la rareza.
 * @param {{ rarity?: number, price?: number }} item
 * @returns {number}
 */
export function sellPrice(item) {
  const { rarityBase, min, max, priceShare } = shopData.sell;
  if (item.price != null) return Math.max(min, Math.floor(item.price * priceShare));
  return Math.max(min, Math.min(max, Math.floor(rarityBase / Math.max(0.05, item.rarity || 0.2))));
}

/**
 * Si Kecleon compra y vende ese objeto: los únicos de la historia, no.
 * @param {{ id: string, unique?: boolean } | null | undefined} item
 * @returns {boolean}
 */
export function isTradeable(item) {
  return !!item && !item.unique && !isUniqueItem(item.id);
}

/**
 * Precio del Kecleon Mercader en un piso: el del pueblo, con el descuento de
 * lo básico en los primeros pisos y el recargo por piso. Los objetos sin
 * `price` siguen con el tope de `prices.max`; los que lo tienen, no (si no, se
 * comprarían en la mazmorra por menos de lo que se venden).
 * @param {{ id: string, rarity?: number, price?: number }} item
 * @param {number} globalFloor
 * @returns {number}
 */
export function merchantPrice(item, globalFloor) {
  const { surchargePerFloor, maxSurcharge, earlyDiscount } = shopData.merchant;
  const floor = globalFloor || 1;
  let price = buyPrice(item);
  if (floor <= earlyDiscount.upToFloor && earlyDiscount.items.includes(item.id)) {
    price = Math.floor(price * earlyDiscount.factor);
  }
  price = Math.floor(price * (1 + Math.min(maxSurcharge, floor * surchargePerFloor)));
  if (item.price != null) return price;
  return Math.min(shopData.prices.max, Math.max(shopData.prices.min, price));
}

/**
 * Catálogo del Kecleon Mercader de un piso: lo de siempre (`merchant.always`)
 * y, hasta completar, objetos útiles al azar (`preferredTypes` y
 * `preferredItems`). Nunca objetos únicos.
 * @param {ItemData[]} itemsData
 * @param {number} globalFloor
 * @param {() => number} rng - Número en [0, 1): el RNG de la partida
 * @returns {ShopEntry[]}
 */
export function merchantStock(itemsData, globalFloor, rng) {
  const { stock, preferredTypes, preferredItems, always } = shopData.merchant;
  const floor = globalFloor || 1;
  const types = new Set(preferredTypes);
  const ids = new Set(preferredItems);
  const tradeable = itemsData.filter(isTradeable);
  const pool = tradeable.filter((i) => ids.has(i.id) || types.has(i.type));
  const candidates = pool.length >= 3 ? pool : tradeable;

  const count = stock.min + Math.floor(rng() * (stock.max - stock.min + 1));
  /** @type {ShopEntry[]} */
  const entries = [];
  const used = new Set();
  const add = (item) => {
    if (!item || used.has(item.id) || !isTradeable(item)) return;
    used.add(item.id);
    entries.push({ id: item.id, name: item.name, price: merchantPrice(item, floor), description: item.description || '' });
  };

  for (const rule of always) {
    if (rule.upToFloor != null && floor > rule.upToFloor) continue;
    if (rule.fromFloor != null && floor < rule.fromFloor) continue;
    add(itemsData.find((i) => i.id === rule.id));
  }
  if (candidates.length === 0) return entries;
  while (entries.length < count) {
    let item = candidates[Math.floor(rng() * candidates.length)];
    let tries = 0;
    while (used.has(item.id) && tries < 12) {
      item = candidates[Math.floor(rng() * candidates.length)];
      tries++;
    }
    if (used.has(item.id)) break;
    add(item);
  }
  return entries;
}

// ─── Surtidos de rango ───────────────────────────────────────────────────────

/**
 * Si un surtido de rango está abierto: por el rango o por la historia.
 * @param {ShopTier} tier
 * @param {ShopProfile | null | undefined} profile
 * @returns {boolean}
 */
export function isTierOpen(tier, profile) {
  if (!profile) return false;
  const rank = RANKS.find((r) => r.id === tier.rank);
  if (rank && (profile.rankPoints ?? 0) >= rank.points) return true;
  return !!tier.unlock && isUnlocked(tier, profile.clearedDungeons ?? [], profile.story?.seen ?? []);
}

/**
 * @param {ShopProfile | null | undefined} profile
 * @returns {ShopTier[]} Surtidos abiertos, en orden
 */
export function openTiers(profile) {
  return SHOP_TIERS.filter((tier) => isTierOpen(tier, profile));
}

/**
 * Surtidos que se abren entre dos momentos del perfil (al volver de una
 * expedición: rango nuevo o mazmorra completada).
 * @param {string[]} before - Ids de los que ya estaban abiertos
 * @param {ShopProfile} profile - Ahora
 * @returns {ShopTier[]}
 */
export function newlyOpenTiers(before, profile) {
  return openTiers(profile).filter((tier) => !before.includes(tier.id));
}

/**
 * Lo que Kecleon cuenta de su surtido: el que tiene y con qué rango traerá
 * más. Solo nombra rangos, no mazmorras (no destripa lo que falta).
 * @param {ShopProfile | null | undefined} profile
 * @returns {string}
 */
export function shopNote(profile) {
  const open = openTiers(profile);
  const next = SHOP_TIERS.find((tier) => !isTierOpen(tier, profile));
  const now = open.length ? open.at(-1).name : 'Surtido de siempre';
  if (!next) return `${now}: lo mejor de la tienda.`;
  const rank = RANKS.find((r) => r.id === next.rank);
  return `${now}. Con rango ${rank?.name ?? next.rank}, Kecleon traerá más cosas.`;
}

// ─── Mochila ─────────────────────────────────────────────────────────────────

/**
 * Mochilas más grandes compradas. Los perfiles de antes no tienen el campo: 0.
 * @param {ShopProfile | null | undefined} profile
 * @returns {number}
 */
export function bagLevel(profile) {
  const level = profile?.upgrades?.bag;
  return Number.isInteger(level) && level > 0 ? Math.min(level, BAG_UPGRADES.length) : 0;
}

/**
 * Huecos de la mochila: los de siempre más las ampliaciones compradas. En una
 * mazmorra con reglas de desafío (la Torre), los de siempre.
 * @param {ShopProfile | null | undefined} profile
 * @param {{ challenge?: boolean } | null} [dungeon] - La mazmorra en curso, si la hay
 * @returns {number}
 */
export function bagCapacity(profile, dungeon = null) {
  if (dungeon?.challenge) return MAX_INVENTORY;
  return BAG_UPGRADES.slice(0, bagLevel(profile)).reduce((slots, upgrade) => slots + upgrade.slots, MAX_INVENTORY);
}

/**
 * La siguiente mochila, si queda alguna: su precio, con cuántos huecos deja
 * la mochila y si su surtido ya está abierto.
 * @param {ShopProfile | null | undefined} profile
 * @returns {(BagUpgrade & { level: number, capacity: number, open: boolean }) | null}
 */
export function nextBagUpgrade(profile) {
  const level = bagLevel(profile);
  const upgrade = BAG_UPGRADES[level];
  if (!upgrade) return null;
  const tier = SHOP_TIERS.find((t) => t.id === upgrade.tier);
  return {
    ...upgrade,
    level: level + 1,
    capacity: bagCapacity(profile) + upgrade.slots,
    open: !tier || isTierOpen(tier, profile),
  };
}

/**
 * Compra la siguiente mochila y la apunta en el perfil.
 * @param {ShopProfile} profile
 * @param {number} wallet
 * @returns {{ ok: true, wallet: number, capacity: number } | { ok: false, wallet: number, error: string }}
 */
export function buyBagUpgrade(profile, wallet) {
  const next = nextBagUpgrade(profile);
  if (!next || !next.open) return { ok: false, wallet, error: '«Ahora mismo no tengo una mochila más grande.»' };
  if (wallet < next.price) return { ok: false, wallet, error: '¡No tienes suficientes monedas Poké!' };
  profile.upgrades = { ...(profile.upgrades ?? {}), bag: next.level };
  return { ok: true, wallet: wallet - next.price, capacity: bagCapacity(profile) };
}

// ─── Tienda del pueblo ───────────────────────────────────────────────────────

/**
 * Catálogo de la tienda del pueblo, con el formato de MerchantMenu: lo
 * básico, los surtidos de rango abiertos, las novedades del día y, si toca, la
 * siguiente mochila. Sin perfil, como un equipo recién formado.
 * @param {number} day
 * @param {ItemData[]} itemsData
 * @param {ShopProfile | null} [profile]
 * @returns {ShopEntry[]}
 */
export function townShopStock(day, itemsData, profile = null) {
  const byId = new Map(itemsData.map((item) => [item.id, item]));
  /** @param {ItemData} item @param {ShopTier} [tier] @returns {ShopEntry} */
  const toEntry = (item, tier) => ({
    id: item.id,
    name: item.name,
    price: buyPrice(item),
    description: item.description || '',
    ...(tier ? { tier: tier.id } : {}),
  });
  const staples = SHOP_STAPLES.map((id) => byId.get(id)).filter(isTradeable);
  const tiers = openTiers(profile).flatMap((tier) =>
    tier.items.map((id) => byId.get(id)).filter(isTradeable).map((item) => toEntry(item, tier)),
  );
  // Las novedades salen de lo demás: ni lo básico, ni lo de los surtidos, ni los únicos
  const pool = itemsData.filter((i) => ROTATING_TYPES.has(i.type) && !SHOP_STAPLES.includes(i.id) && !TIER_ITEMS.has(i.id) && isTradeable(i));

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

  const entries = [...staples.map((item) => toEntry(item)), ...tiers, ...shuffled.slice(0, SHOP_DAILY_EXTRAS).map((item) => toEntry(item))];
  const bag = nextBagUpgrade(profile);
  if (bag?.open) {
    entries.push({
      id: BAG_UPGRADE_ID,
      name: 'Mochila más grande',
      price: bag.price,
      description: `De ${bagCapacity(profile)} a ${bag.capacity} huecos. Se compra una vez y es para siempre (en la Torre del Desafío, la de siempre).`,
      tier: bag.tier,
      upgrade: 'bag',
    });
  }
  return entries;
}
