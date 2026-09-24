import { describe, it, expect } from 'vitest';
import { recruitChance, isRecruitable, RECRUITMENT } from '../../src/core/Recruitment.js';

const rattata = { speciesId: 19, captureRate: 255, targetLevel: 5, leaderLevel: 5 };

describe('recruitChance', () => {
  it('depende de la especie: los comunes se unen más que los raros', () => {
    const common = recruitChance(rattata);
    const rare = recruitChance({ ...rattata, speciesId: 143, captureRate: 25 });
    expect(common).toBeCloseTo(RECRUITMENT.speciesFactor);
    expect(rare).toBeLessThan(common / 5);
    expect(rare).toBeGreaterThan(0);
  });

  it('sube si el líder tiene más nivel y baja si tiene menos, con tope', () => {
    const base = recruitChance(rattata);
    expect(recruitChance({ ...rattata, leaderLevel: 8 })).toBeCloseTo(base + 0.03);
    expect(recruitChance({ ...rattata, leaderLevel: 60 })).toBeCloseTo(base + RECRUITMENT.levelBonusMax);
    expect(recruitChance({ ...rattata, leaderLevel: 1, targetLevel: 50 })).toBeCloseTo(base - RECRUITMENT.levelBonusMax);
  });

  it('el Lazo Amigo ayuda y nunca se pasa del máximo', () => {
    expect(recruitChance({ ...rattata, friendBow: true })).toBeCloseTo(recruitChance(rattata) + RECRUITMENT.friendBowBonus);
    expect(recruitChance({ ...rattata, leaderLevel: 99, friendBow: true }, { ...RECRUITMENT, maxChance: 0.3 })).toBe(0.3);
  });

  it('nunca es negativa', () => {
    expect(recruitChance({ speciesId: 143, captureRate: 3, targetLevel: 50, leaderLevel: 1 })).toBe(0);
  });

  it('los legendarios no se unen', () => {
    for (const id of [144, 145, 146, 150, 151]) {
      expect(isRecruitable(id)).toBe(false);
      expect(recruitChance({ ...rattata, speciesId: id, leaderLevel: 99, friendBow: true })).toBe(0);
    }
    expect(isRecruitable(19)).toBe(true);
  });
});
