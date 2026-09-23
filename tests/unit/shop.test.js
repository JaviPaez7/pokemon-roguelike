import { describe, it, expect } from 'vitest';
import { townShopStock, buyPrice, SHOP_STAPLES, SHOP_DAILY_EXTRAS } from '../../src/core/Shop.js';
import itemsData from '../../src/data/items.json';

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

  it('no vende Poké Balls: en un Mundo Misterioso se recluta', () => {
    for (let day = 1; day <= 20; day++) {
      expect(townShopStock(day, itemsData).some((s) => s.id.includes('ball'))).toBe(false);
    }
  });

  it('los precios están entre 8 y 250 y los raros cuestan más', () => {
    for (const item of itemsData) {
      const price = buyPrice(item);
      expect(price).toBeGreaterThanOrEqual(8);
      expect(price).toBeLessThanOrEqual(250);
    }
    expect(buyPrice({ rarity: 0.05 })).toBeGreaterThan(buyPrice({ rarity: 0.5 }));
  });
});
