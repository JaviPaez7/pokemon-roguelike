import { describe, it, expect } from 'vitest';
import { random, randomInt, pick, shuffle, setSeed, floorSeed, getState, setState } from '../../src/core/Random.js';

function sample() {
  return [random(), randomInt(1, 6), pick(['a', 'b', 'c']), shuffle([1, 2, 3, 4, 5])];
}

describe('Random', () => {
  it('con la misma semilla repite la secuencia', () => {
    setSeed(1234);
    const first = sample();
    setSeed(1234);
    expect(sample()).toEqual(first);
  });

  it('con otra semilla la secuencia cambia', () => {
    setSeed(1);
    const a = sample();
    setSeed(2);
    expect(sample()).not.toEqual(a);
  });

  it('getState/setState retoma la secuencia en el mismo punto', () => {
    setSeed(99);
    random();
    const state = getState();
    const next = [random(), random()];
    setState(state);
    expect([random(), random()]).toEqual(next);
  });

  it('randomInt incluye ambos extremos y no se sale del rango', () => {
    setSeed(7);
    const seen = new Set();
    for (let i = 0; i < 500; i++) seen.add(randomInt(1, 3));
    expect([...seen].sort()).toEqual([1, 2, 3]);
  });

  it('pick de una lista vacía devuelve null', () => {
    expect(pick([])).toBeNull();
  });
});

describe('floorSeed', () => {
  it('es estable para la misma partida, piso y mazmorra', () => {
    expect(floorSeed(42, 3)).toBe(floorSeed(42, 3));
    expect(floorSeed(42, 3, 'bosque')).toBe(floorSeed(42, 3, 'bosque'));
  });

  it('cambia con el piso, la partida y la mazmorra', () => {
    const base = floorSeed(42, 3);
    expect(floorSeed(42, 4)).not.toBe(base);
    expect(floorSeed(43, 3)).not.toBe(base);
    expect(floorSeed(42, 3, 'cueva')).not.toBe(base);
  });

  it('da un entero positivo de 31 bits', () => {
    for (let floor = 1; floor <= 50; floor++) {
      const seed = floorSeed(123456789, floor);
      expect(Number.isInteger(seed)).toBe(true);
      expect(seed).toBeGreaterThanOrEqual(0);
      expect(seed).toBeLessThanOrEqual(0x7fffffff);
    }
  });
});
