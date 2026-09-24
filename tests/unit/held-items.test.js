import { describe, it, expect } from 'vitest';
import {
  isHeldItem,
  heldStatMultiplier,
  heldPreventsStatus,
  heldBellyDrain,
  heldHelpsRecruit,
  equipItem,
  unequipItem,
} from '../../src/core/HeldItems.js';
import { tryApplyEffect, calculateDamage } from '../../src/systems/CombatSystem.js';
import { buyPrice } from '../../src/core/Shop.js';
import { setSeed } from '../../src/core/Random.js';
import itemsData from '../../src/data/items.json';
import typeChart from '../../src/data/types.json';

const bagWith = (...items) => items.map(([itemId, quantity]) => ({ itemId, quantity }));

describe('efectos', () => {
  it('solo los de tipo held son equipables', () => {
    expect(isHeldItem('friend_bow')).toBe(true);
    expect(isHeldItem('apple')).toBe(false);
    expect(isHeldItem(null)).toBe(false);
  });

  it('las bandas y pañuelos multiplican su estadística y nada más', () => {
    expect(heldStatMultiplier({ heldItem: 'power_band' }, 'attack')).toBe(1.2);
    expect(heldStatMultiplier({ heldItem: 'power_band' }, 'spAtk')).toBe(1);
    expect(heldStatMultiplier({ heldItem: 'defense_scarf' }, 'defense')).toBe(1.2);
    expect(heldStatMultiplier({ heldItem: null }, 'attack')).toBe(1);
    expect(heldStatMultiplier(undefined, 'attack')).toBe(1);
  });

  it('el Pañuelo Meloc protege del veneno (también del grave) y el Insomniscopio del sueño', () => {
    expect(heldPreventsStatus({ heldItem: 'pecha_scarf' }, 'poison')).toBe(true);
    expect(heldPreventsStatus({ heldItem: 'pecha_scarf' }, 'badly_poison')).toBe(true);
    expect(heldPreventsStatus({ heldItem: 'pecha_scarf' }, 'sleep')).toBe(false);
    expect(heldPreventsStatus({ heldItem: 'insomniscope' }, 'sleep')).toBe(true);
  });

  it('Banda Aguante y Lazo Amigo', () => {
    expect(heldBellyDrain({ heldItem: 'stamina_band' })).toBe(0.5);
    expect(heldBellyDrain({ heldItem: 'power_band' })).toBe(1);
    expect(heldHelpsRecruit({ heldItem: 'friend_bow' })).toBe(true);
    expect(heldHelpsRecruit({ heldItem: 'stamina_band' })).toBe(false);
  });

  it('la Banda Poder sube el daño físico y el Pañuelo Defensa lo baja', () => {
    const move = { name: 'Placaje', type: 'normal', power: 40, accuracy: 100, damageClass: 'physical' };
    const fighter = () => ({ hp: 100, maxHp: 100, attack: 50, defense: 50, spAtk: 50, spDef: 50, speed: 50, statusEffects: [], statModifiers: {} });
    const info = (heldItem = null) => ({ name: 'Rattata', level: 20, types: ['normal'], heldItem });
    const hit = (attackerHeld, defenderHeld) => {
      setSeed(7);
      return calculateDamage(fighter(), fighter(), move, info(attackerHeld), info(defenderHeld), typeChart).damage;
    };
    const plain = hit(null, null);
    expect(plain).toBeGreaterThan(0);
    expect(hit('power_band', null)).toBeGreaterThan(plain);
    expect(hit('special_band', null)).toBe(plain);
    expect(hit(null, 'defense_scarf')).toBeLessThan(plain);
  });

  it('con el pañuelo, un movimiento venenoso no envenena', () => {
    const move = { effect: 'poison', effectChance: 100 };
    const target = () => ({ statusEffects: [], hp: 20, maxHp: 20 });
    const info = { name: 'Pikachu', types: ['electric'] };

    const unprotected = target();
    expect(tryApplyEffect(move, unprotected, info, [], {}, {})).toBe(true);
    expect(unprotected.statusEffects.map((s) => s.type)).toEqual(['poison']);

    const protectedOne = target();
    const messages = [];
    expect(tryApplyEffect(move, protectedOne, { ...info, heldItem: 'pecha_scarf' }, messages, {}, {})).toBe(false);
    expect(protectedOne.statusEffects).toEqual([]);
    expect(messages).toEqual(['¡Pañuelo Meloc protege a Pikachu!']);
  });
});

describe('equipar y quitar', () => {
  it('equipar saca una unidad de la mochila', () => {
    const info = { heldItem: null };
    const bag = bagWith(['power_band', 2], ['apple', 1]);
    expect(equipItem(info, bag, 'power_band', { maxSlots: 24 })).toEqual({ ok: true, previous: null });
    expect(info.heldItem).toBe('power_band');
    expect(bag).toEqual(bagWith(['power_band', 1], ['apple', 1]));
  });

  it('cambiar de objeto devuelve el anterior a la mochila', () => {
    const info = { heldItem: 'power_band' };
    const bag = bagWith(['friend_bow', 1]);
    expect(equipItem(info, bag, 'friend_bow', { maxSlots: 24 })).toEqual({ ok: true, previous: 'power_band' });
    expect(info.heldItem).toBe('friend_bow');
    expect(bag).toEqual(bagWith(['power_band', 1]));
  });

  it('si el anterior no cabe, no cambia nada', () => {
    const info = { heldItem: 'power_band' };
    const bag = bagWith(['friend_bow', 2], ['apple', 1]);
    expect(equipItem(info, bag, 'friend_bow', { maxSlots: 2 })).toEqual({ ok: false, reason: 'bag_full' });
    expect(info.heldItem).toBe('power_band');
    expect(bag.find((s) => s.itemId === 'friend_bow').quantity).toBe(2);
    expect(bag).toHaveLength(2);
  });

  it('no se equipa lo que no es equipable o no está en la mochila', () => {
    const info = { heldItem: null };
    expect(equipItem(info, bagWith(['apple', 1]), 'apple', { maxSlots: 24 })).toEqual({ ok: false, reason: 'not_held' });
    expect(equipItem(info, [], 'power_band', { maxSlots: 24 })).toEqual({ ok: false, reason: 'not_in_bag' });
    expect(info.heldItem).toBeNull();
  });

  it('quitar lo guarda en la mochila si cabe', () => {
    const info = { heldItem: 'zinc_band' };
    const bag = [];
    expect(unequipItem(info, bag, { maxSlots: 24 })).toEqual({ ok: true, itemId: 'zinc_band' });
    expect(info.heldItem).toBeNull();
    expect(bag).toEqual(bagWith(['zinc_band', 1]));

    const full = { heldItem: 'zinc_band' };
    expect(unequipItem(full, bagWith(['apple', 1]), { maxSlots: 1 })).toEqual({ ok: false, reason: 'bag_full' });
    expect(full.heldItem).toBe('zinc_band');
    expect(unequipItem({ heldItem: null }, [], { maxSlots: 24 })).toEqual({ ok: false, reason: 'nothing_held' });
  });
});

it('los equipables tienen su precio en la tienda', () => {
  const bow = itemsData.find((i) => i.id === 'friend_bow');
  expect(buyPrice(bow)).toBe(bow.price);
});
