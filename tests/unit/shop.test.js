import { describe, it, expect } from 'vitest';
import { townShopStock, buyPrice, SHOP_STAPLES, SHOP_DAILY_EXTRAS } from '../../src/core/Shop.js';
import itemsData from '../../src/data/items.json';
import { spawnItems } from '../../src/systems/ItemSystem.js';
import { isUniqueItem } from '../../src/core/Items.js';
import { heldEffect } from '../../src/core/HeldItems.js';

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
