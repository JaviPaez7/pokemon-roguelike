import { describe, it, expect } from 'vitest';
import pokemonData from '../../src/data/pokemon.json';
import experienceData from '../../src/data/experience.json';
import { EXPERIENCE, calculateExpGained, expLevelBonus } from '../../src/systems/ExperienceSystem.js';

describe('experience.json: la experiencia ganada', () => {
  it('trae los bonus de siempre, de menor a mayor nivel', () => {
    expect(experienceData).toEqual({
      divisor: 5,
      levelBonuses: [
        { upToLevel: 12, bonus: 0.35 },
        { upToLevel: 22, bonus: 0.15 },
      ],
    });
    expect(EXPERIENCE).toBe(experienceData);
  });

  it('expLevelBonus: +35 % hasta el nivel 12, +15 % hasta el 22 y nada por encima', () => {
    expect([1, 12, 13, 22, 23, 100].map(expLevelBonus)).toEqual([0.35, 0.35, 0.15, 0.15, 0, 0]);
  });

  it('calculateExpGained da lo mismo que la fórmula de antes para todas las especies y niveles', () => {
    // La fórmula tal como estaba escrita en el código antes de pasar a datos
    const before = (baseExp, level) => {
      const raw = Math.floor((baseExp * level) / 5);
      const bonus = level <= 12 ? Math.ceil(raw * 0.35) : level <= 22 ? Math.ceil(raw * 0.15) : 0;
      return Math.max(1, raw + bonus);
    };
    const baseExps = new Set([1, 50, ...pokemonData.map((p) => p.baseExp).filter(Boolean)]);
    for (const baseExp of baseExps) {
      for (let level = 1; level <= 100; level++) {
        expect(calculateExpGained(baseExp, level), `EXP base ${baseExp}, nivel ${level}`).toBe(before(baseExp, level));
      }
    }
  });
});
