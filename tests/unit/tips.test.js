import { describe, it, expect } from 'vitest';
import { TIPS, tipFor } from '../../src/core/Tips.js';

describe('consejos de carga', () => {
  it('rotan por toda la lista, también con contadores grandes o raros', () => {
    const seen = new Set(Array.from({ length: TIPS.length }, (_, i) => tipFor(i)));
    expect(seen.size).toBe(TIPS.length);
    expect(tipFor(TIPS.length * 1000 + 3)).toBe(tipFor(3));
    expect(tipFor(-1)).toBe(tipFor(TIPS.length - 1));
    expect(tipFor(Number.NaN)).toBe(tipFor(0));
    expect(tipFor(0)).toBe(`Consejo: ${TIPS[0]}`);
  });

  it('no se repiten y no están vacíos', () => {
    expect(new Set(TIPS).size).toBe(TIPS.length);
    for (const tip of TIPS) expect(tip.trim().length, tip).toBeGreaterThan(10);
  });

  it('no hablan de cosas que ya no existen: capturas, Poké Balls, borrar la partida al caer o Mewtwo como final', () => {
    const outdated = TIPS.filter((tip) => /captur|pok[ée] ?ball|permadeath|borra el guardado|mewtwo/i.test(tip));
    expect(outdated).toEqual([]);
  });
});
