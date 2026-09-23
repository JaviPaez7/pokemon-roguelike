import { describe, it, expect } from 'vitest';
import {
  DUNGEONS,
  getDungeon,
  floorCount,
  relativeFloor,
  isLastFloor,
  isUnlocked,
  unlockedDungeons,
} from '../../src/core/Dungeons.js';
import floorsData from '../../src/data/floors.json';

describe('catálogo de mazmorras', () => {
  it('cada mazmorra cubre pisos que existen en floors.json', () => {
    const covered = (floor) => floorsData.zones.some((z) => floor >= z.floors[0] && floor <= z.floors[1]);
    for (const d of DUNGEONS) {
      for (let f = d.floors[0]; f <= d.floors[1]; f++) {
        expect(covered(f), `${d.id} piso global ${f}`).toBe(true);
      }
    }
  });

  it('las mazmorras de la historia recorren los 50 pisos en orden y sin huecos', () => {
    const story = DUNGEONS.filter((d) => !d.challenge);
    expect(story[0].floors[0]).toBe(1);
    for (let i = 1; i < story.length; i++) {
      expect(story[i].floors[0]).toBe(story[i - 1].floors[1] + 1);
    }
    expect(story.at(-1).floors[1]).toBe(50);
  });

  it('cada mazmorra termina en el piso del jefe de su zona, si lo hay', () => {
    for (const d of DUNGEONS.filter((x) => !x.challenge)) {
      const zone = floorsData.zones.find((z) => d.floors[1] >= z.floors[0] && d.floors[1] <= z.floors[1]);
      if (zone.boss) expect(zone.floors[1], d.id).toBe(d.floors[1]);
    }
  });

  it('los desbloqueos apuntan a mazmorras que existen', () => {
    for (const d of DUNGEONS) {
      if (d.unlock) expect(() => getDungeon(d.unlock.cleared)).not.toThrow();
    }
  });

  it('una mazmorra desconocida es un error', () => {
    expect(() => getDungeon('no_existe')).toThrow('no_existe');
  });
});

describe('pisos', () => {
  const cueva = getDungeon('cueva_oscura');

  it('el piso relativo empieza en 1', () => {
    expect(relativeFloor(cueva, 6)).toBe(1);
    expect(relativeFloor(cueva, 10)).toBe(5);
    expect(floorCount(cueva)).toBe(5);
  });

  it('isLastFloor marca el último piso', () => {
    expect(isLastFloor(cueva, 9)).toBe(false);
    expect(isLastFloor(cueva, 10)).toBe(true);
  });
});

describe('desbloqueos', () => {
  it('al principio solo está el Bosque Verde', () => {
    expect(unlockedDungeons([]).map((d) => d.id)).toEqual(['bosque_verde']);
  });

  it('completar una mazmorra abre la siguiente', () => {
    expect(unlockedDungeons(['bosque_verde']).map((d) => d.id)).toEqual(['bosque_verde', 'cueva_oscura']);
  });

  it('la Torre del Desafío pide el Laboratorio Final', () => {
    const torre = getDungeon('torre_desafio');
    expect(isUnlocked(torre, ['isla_volcanica'])).toBe(false);
    expect(isUnlocked(torre, ['laboratorio_final'])).toBe(true);
  });
});
