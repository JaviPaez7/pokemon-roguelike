import { describe, it, expect } from 'vitest';
import {
  townShopStock,
  buyPrice,
  sellPrice,
  merchantPrice,
  merchantStock,
  isTradeable,
  isTierOpen,
  openTiers,
  newlyOpenTiers,
  shopNote,
  bagLevel,
  bagCapacity,
  nextBagUpgrade,
  buyBagUpgrade,
  SHOP_STAPLES,
  SHOP_DAILY_EXTRAS,
  SHOP_TIERS,
  BAG_UPGRADES,
  BAG_UPGRADE_ID,
} from '../../src/core/Shop.js';
import itemsData from '../../src/data/items.json';
import shopData from '../../src/data/shop.json';
import { spawnItems } from '../../src/systems/ItemSystem.js';
import { isUniqueItem } from '../../src/core/Items.js';
import { heldEffect } from '../../src/core/HeldItems.js';
import { createProfile } from '../../src/core/Profile.js';
import { getDungeon, DUNGEONS } from '../../src/core/Dungeons.js';
import { parseSave, SAVE_VERSION } from '../../src/core/SaveManager.js';
import { MAX_INVENTORY } from '../../src/constants.js';

const ITEM = new Map(itemsData.map((i) => [i.id, i]));
const tier = (id) => SHOP_TIERS.find((t) => t.id === id);
/** Perfil mínimo para la tienda: rango, mazmorras completadas y mejoras. */
const profileWith = ({ rankPoints = 0, cleared = [], bag } = {}) => ({
  rankPoints,
  clearedDungeons: cleared,
  story: { seen: [] },
  ...(bag != null ? { upgrades: { bag } } : {}),
});
/** Generador con semilla para el surtido del Kecleon Mercader (LCG). */
const seeded = (seed) => {
  let state = seed;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
};

describe('objetos únicos', () => {
  it('el Pañuelo Centella es único y equipable', () => {
    expect(isUniqueItem('centella_scarf')).toBe(true);
    expect(isUniqueItem('power_band')).toBe(false);
    expect(heldEffect('centella_scarf')).toEqual({
      stats: { attack: 1.1, defense: 1.1, spAtk: 1.1, spDef: 1.1 },
      preventStatus: ['paralyze'],
    });
  });
});

describe('tienda del pueblo', () => {
  it('siempre vende lo básico y las novedades del día', () => {
    const stock = townShopStock(1, itemsData);
    expect(stock.slice(0, SHOP_STAPLES.length).map((s) => s.id)).toEqual(SHOP_STAPLES);
    expect(stock).toHaveLength(SHOP_STAPLES.length + SHOP_DAILY_EXTRAS);
    expect(new Set(stock.map((s) => s.id)).size).toBe(stock.length);
  });

  it('el mismo día da el mismo surtido y los días cambian las novedades', () => {
    expect(townShopStock(7, itemsData)).toEqual(townShopStock(7, itemsData));
    const extras = (day) => townShopStock(day, itemsData).slice(SHOP_STAPLES.length).map((s) => s.id).join();
    const distinct = new Set([1, 2, 3, 4, 5, 6].map(extras));
    expect(distinct.size).toBeGreaterThan(1);
  });

  it('no vende objetos únicos de la historia (el Pañuelo Centella)', () => {
    for (let day = 1; day <= 60; day++) {
      expect(townShopStock(day, itemsData).some((s) => s.id === 'centella_scarf')).toBe(false);
    }
  });

  it('los objetos únicos tampoco aparecen en el suelo de las mazmorras', () => {
    const created = [];
    const em = { createItemEntity: (id) => created.push(id) };
    const points = Array.from({ length: 200 }, (_, i) => ({ x: i, y: 0 }));
    spawnItems(points, 200, itemsData, em, 30);
    expect(created).toHaveLength(200);
    expect(created).not.toContain('centella_scarf');
    // Si solo hubiera únicos, no sale nada
    expect(spawnItems(points, 5, itemsData.filter((i) => i.unique), em, 1)).toEqual([]);
  });

  it('no vende Poké Balls: en un Mundo Misterioso se recluta', () => {
    for (let day = 1; day <= 20; day++) {
      expect(townShopStock(day, itemsData).some((s) => s.id.includes('ball'))).toBe(false);
    }
  });

  it('los precios calculados están entre 8 y 250 y los raros cuestan más', () => {
    for (const item of itemsData.filter((i) => i.price == null)) {
      const price = buyPrice(item);
      expect(price).toBeGreaterThanOrEqual(8);
      expect(price).toBeLessThanOrEqual(250);
    }
    expect(buyPrice({ rarity: 0.05 })).toBeGreaterThan(buyPrice({ rarity: 0.5 }));
  });
});

describe('surtidos de rango del Kecleon del pueblo', () => {
  const ids = (stock) => stock.map((s) => s.id);

  it('un equipo nuevo solo tiene lo básico y las novedades del día', () => {
    const fresh = createProfile({ teamName: 'Prueba', hero: { name: 'A' }, partner: { name: 'B' } });
    expect(openTiers(fresh)).toEqual([]);
    expect(townShopStock(3, itemsData, fresh)).toEqual(townShopStock(3, itemsData));
    expect(townShopStock(3, itemsData, fresh)).toHaveLength(SHOP_STAPLES.length + SHOP_DAILY_EXTRAS);
  });

  it('cada surtido se abre con su rango o con la historia, lo que llegue antes', () => {
    // Plata: 500 puntos o haber completado el Monte Lunar
    expect(isTierOpen(tier('plata'), profileWith({ rankPoints: 499 }))).toBe(false);
    expect(isTierOpen(tier('plata'), profileWith({ rankPoints: 500 }))).toBe(true);
    expect(isTierOpen(tier('plata'), profileWith({ cleared: ['monte_lunar'] }))).toBe(true);
    expect(isTierOpen(tier('plata'), null)).toBe(false);
    // Van en orden: la historia abre antes los primeros
    const stories = SHOP_TIERS.map((t) => DUNGEONS.findIndex((d) => d.id === t.unlock.cleared));
    expect(stories).toEqual([...stories].sort((a, b) => a - b));
    expect(openTiers(profileWith({ rankPoints: 1500 })).map((t) => t.id)).toEqual(['bronce', 'plata', 'oro']);
  });

  it('desde que se abre, lo de un surtido se vende siempre, a su precio y con su etiqueta', () => {
    const plata = profileWith({ rankPoints: 500 });
    for (let day = 1; day <= 10; day++) {
      const stock = townShopStock(day, itemsData, plata);
      for (const id of [...tier('bronce').items, ...tier('plata').items]) {
        const entry = stock.find((s) => s.id === id);
        expect(entry, `día ${day}: ${id}`).toBeTruthy();
        expect(entry.price).toBe(buyPrice(ITEM.get(id)));
      }
      expect(stock.find((s) => s.id === 'fire_stone')).toMatchObject({ price: 1000, tier: 'plata' });
      for (const id of tier('oro').items) expect(ids(stock)).not.toContain(id);
    }
  });

  it('lo de los surtidos nunca sale entre las novedades del día (ni los únicos)', () => {
    const inTiers = new Set(SHOP_TIERS.flatMap((t) => t.items));
    for (let day = 1; day <= 120; day++) {
      const extras = townShopStock(day, itemsData).slice(SHOP_STAPLES.length);
      expect(extras.filter((s) => inTiers.has(s.id) || isUniqueItem(s.id)), `día ${day}`).toEqual([]);
    }
  });

  it('el orden es lo básico, los surtidos, las novedades y al final la mochila', () => {
    const stock = townShopStock(5, itemsData, profileWith({ rankPoints: 50 }));
    expect(ids(stock.slice(0, SHOP_STAPLES.length))).toEqual(SHOP_STAPLES);
    expect(ids(stock.slice(SHOP_STAPLES.length, SHOP_STAPLES.length + 5))).toEqual(tier('bronce').items);
    expect(stock.at(-1)).toMatchObject({ id: BAG_UPGRADE_ID, upgrade: 'bag', price: BAG_UPGRADES[0].price, tier: 'bronce' });
  });

  it('avisa de los surtidos que se acaban de abrir y la nota solo nombra rangos', () => {
    const profile = profileWith({ rankPoints: 40 });
    const before = openTiers(profile).map((t) => t.id);
    profile.clearedDungeons.push('bosque_verde');
    expect(newlyOpenTiers(before, profile).map((t) => t.id)).toEqual(['bronce']);
    expect(newlyOpenTiers(['bronce'], profile)).toEqual([]);

    expect(shopNote(profileWith())).toBe('Surtido de siempre. Con rango Bronce, Kecleon traerá más cosas.');
    const toMonteLunar = ['bosque_verde', 'cueva_oscura', 'ruta_electrica', 'monte_lunar'];
    expect(shopNote(profileWith({ cleared: toMonteLunar }))).toBe('Surtido Plata. Con rango Oro, Kecleon traerá más cosas.');
    expect(shopNote(profileWith({ rankPoints: 3000 }))).toBe('Surtido Diamante: lo mejor de la tienda.');
    // No destripa mazmorras que aún no se han abierto
    for (const d of DUNGEONS) expect(shopNote(profileWith()), d.name).not.toContain(d.name);
  });

  it('los objetos de los surtidos existen y no son únicos', () => {
    for (const t of SHOP_TIERS) {
      for (const id of t.items) {
        expect(ITEM.get(id), id).toBeTruthy();
        expect(isTradeable(ITEM.get(id)), id).toBe(true);
      }
    }
    expect(heldEffect('munch_belt')).toEqual({ stats: { attack: 1.2, spAtk: 1.2 }, bellyDrain: 1.5 });
    expect(heldEffect('guard_scarf')).toEqual({ stats: { defense: 1.2, spDef: 1.2 } });
  });
});

describe('precios de venta', () => {
  it('Kecleon paga una parte de `price` y, si no lo hay, según la rareza', () => {
    expect(sellPrice(ITEM.get('fire_stone'))).toBe(Math.floor(1000 * shopData.sell.priceShare));
    expect(sellPrice(ITEM.get('power_band'))).toBe(120);
    expect(sellPrice(ITEM.get('potion'))).toBe(40);
    expect(sellPrice(ITEM.get('reviver_seed'))).toBe(120);
  });

  it('nada se vende por lo que cuesta en el pueblo, ni se gana dinero comprando en una mazmorra', () => {
    for (const item of itemsData.filter(isTradeable)) {
      // Con el descuento de lo básico de los primeros pisos, la Poción del piso 1 cuesta lo que paga Kecleon
      for (let floor = 1; floor <= 84; floor++) {
        expect(sellPrice(item), `${item.id} piso ${floor}`).toBeLessThanOrEqual(merchantPrice(item, floor));
      }
      expect(sellPrice(item), item.id).toBeLessThan(buyPrice(item));
    }
  });

  it('los objetos únicos no se compran ni se venden', () => {
    expect(isTradeable(ITEM.get('centella_scarf'))).toBe(false);
    expect(isTradeable({ id: 'centella_scarf' })).toBe(false);
    expect(isTradeable(null)).toBe(false);
    expect(isTradeable(ITEM.get('potion'))).toBe(true);
  });
});

describe('Kecleon Mercader de las mazmorras', () => {
  /** El precio de antes, que no miraba `price` (FloorEvents.createMerchantNPC). */
  const oldPrice = (item, floor) => {
    let base = Math.max(10, Math.floor(18 / (item.rarity || 0.1)));
    if (floor <= 5 && ['apple', 'potion', 'ether', 'oran_berry'].includes(item.id)) base = Math.floor(base * 0.65);
    return Math.min(250, Math.max(8, Math.floor(base * (1 + Math.min(1.5, floor * 0.04)))));
  };

  it('usa `price` de items.json con el recargo del piso, sin el tope de 250', () => {
    const stone = ITEM.get('fire_stone');
    expect(merchantPrice(stone, 1)).toBe(1040);
    expect(merchantPrice(stone, 20)).toBe(1800);
    // El recargo llega como mucho a ×2,5
    expect(merchantPrice(stone, 50)).toBe(2500);
    expect(merchantPrice(stone, 84)).toBe(2500);
    expect(merchantPrice(ITEM.get('max_revive'), 30)).toBe(Math.floor(500 * 2.2));
    for (const item of itemsData.filter((i) => i.price != null && isTradeable(i))) {
      for (let floor = 1; floor <= 84; floor++) expect(merchantPrice(item, floor)).toBeGreaterThanOrEqual(item.price);
    }
  });

  it('lo que no tiene `price` cuesta lo mismo que antes (descuento de lo básico y tope incluidos)', () => {
    for (const item of itemsData.filter((i) => i.price == null)) {
      for (let floor = 1; floor <= 84; floor++) {
        expect(merchantPrice(item, floor), `${item.id} piso ${floor}`).toBe(oldPrice(item, floor));
      }
    }
    expect(merchantPrice(ITEM.get('potion'), 3)).toBe(43);
  });

  it('su catálogo lleva lo de siempre, a su precio, y nunca objetos únicos', () => {
    for (let seed = 1; seed <= 60; seed++) {
      for (const floor of [2, 9, 12, 40, 70]) {
        const stock = merchantStock(itemsData, floor, seeded(seed));
        const stockIds = stock.map((s) => s.id);
        expect(stock.length).toBeGreaterThanOrEqual(shopData.merchant.stock.min);
        expect(stock.length).toBeLessThanOrEqual(shopData.merchant.stock.max);
        expect(new Set(stockIds).size).toBe(stockIds.length);
        expect(stockIds.slice(0, 3)).toEqual(['apple', 'potion', 'oran_berry']);
        if (floor <= 8) expect(stockIds[3]).toBe('ether');
        if (floor >= 10) expect(stockIds[3]).toBe('reviver_seed');
        expect(stockIds.filter(isUniqueItem)).toEqual([]);
        for (const entry of stock) expect(entry.price).toBe(merchantPrice(ITEM.get(entry.id), floor));
      }
    }
  });

  it('el mismo generador da el mismo catálogo, y sin objetos que vender no inventa nada', () => {
    expect(merchantStock(itemsData, 25, seeded(7))).toEqual(merchantStock(itemsData, 25, seeded(7)));
    expect(merchantStock(itemsData.filter((i) => i.unique), 25, seeded(7))).toEqual([]);
  });
});

describe('mochila más grande', () => {
  it('la de siempre si no se ha comprado ninguna, también en perfiles de antes sin el campo', () => {
    const fresh = createProfile({ teamName: 'Prueba', hero: { name: 'A' }, partner: { name: 'B' } });
    expect(fresh.upgrades).toEqual({ bag: 0 });
    expect(bagCapacity(fresh)).toBe(MAX_INVENTORY);
    expect(bagCapacity(profileWith())).toBe(MAX_INVENTORY);
    expect(bagCapacity(null)).toBe(MAX_INVENTORY);
    for (const bag of [-1, 1.5, 'x', null]) expect(bagLevel({ upgrades: { bag } }), String(bag)).toBe(0);
    expect(bagLevel({ upgrades: { bag: 99 } })).toBe(BAG_UPGRADES.length);
  });

  it('una partida guardada sin `upgrades` carga sin migrar y con la mochila de siempre', () => {
    const raw = JSON.stringify({
      version: SAVE_VERSION,
      profile: { ...profileWith(), teamName: 'Antiguo', roster: [{ uid: 1, name: 'A' }], heroUid: 1, teamUids: [1], storage: [], bank: 0 },
      bag: [],
      wallet: 0,
      run: null,
    });
    const result = parseSave(raw);
    expect(result).toMatchObject({ status: 'ok', migratedFrom: null });
    expect(bagCapacity(result.data.profile)).toBe(MAX_INVENTORY);
  });

  it('cada una suma sus huecos y en la Torre del Desafío la mochila es la de siempre', () => {
    expect(bagCapacity(profileWith({ bag: 1 }))).toBe(MAX_INVENTORY + BAG_UPGRADES[0].slots);
    expect(bagCapacity(profileWith({ bag: 2 }))).toBe(MAX_INVENTORY + BAG_UPGRADES[0].slots + BAG_UPGRADES[1].slots);
    expect(bagCapacity(profileWith({ bag: 2 }), getDungeon('torre_desafio'))).toBe(MAX_INVENTORY);
    expect(bagCapacity(profileWith({ bag: 2 }), getDungeon('bosque_verde'))).toBe(MAX_INVENTORY + 16);
  });

  it('se compran una vez, en orden y cuando su surtido está abierto', () => {
    const profile = profileWith({ rankPoints: 0 });
    expect(nextBagUpgrade(profile)).toMatchObject({ level: 1, open: false, capacity: MAX_INVENTORY + 8 });
    expect(buyBagUpgrade(profile, 5000)).toMatchObject({ ok: false, wallet: 5000 });
    expect(townShopStock(1, itemsData, profile).some((s) => s.upgrade)).toBe(false);

    profile.rankPoints = 50; // Bronce
    expect(buyBagUpgrade(profile, 999)).toEqual({ ok: false, wallet: 999, error: '¡No tienes suficientes monedas Poké!' });
    expect(bagLevel(profile)).toBe(0);
    expect(buyBagUpgrade(profile, 1500)).toEqual({ ok: true, wallet: 500, capacity: MAX_INVENTORY + 8 });
    expect(profile.upgrades).toEqual({ bag: 1 });
    // La siguiente espera al Surtido Plata
    expect(nextBagUpgrade(profile)).toMatchObject({ level: 2, open: false, price: BAG_UPGRADES[1].price });
    expect(townShopStock(1, itemsData, profile).some((s) => s.upgrade)).toBe(false);
    expect(buyBagUpgrade(profile, 9999)).toMatchObject({ ok: false, wallet: 9999 });

    profile.clearedDungeons.push('monte_lunar');
    const entry = townShopStock(1, itemsData, profile).find((s) => s.upgrade === 'bag');
    expect(entry).toMatchObject({ price: BAG_UPGRADES[1].price, tier: 'plata' });
    expect(entry.description).toContain(`De ${MAX_INVENTORY + 8} a ${MAX_INVENTORY + 16} huecos`);
    expect(buyBagUpgrade(profile, BAG_UPGRADES[1].price)).toEqual({ ok: true, wallet: 0, capacity: MAX_INVENTORY + 16 });
    // No hay más
    expect(nextBagUpgrade(profile)).toBeNull();
    expect(buyBagUpgrade(profile, 99999)).toMatchObject({ ok: false, wallet: 99999 });
    expect(townShopStock(1, itemsData, profile).some((s) => s.upgrade)).toBe(false);
  });
});
