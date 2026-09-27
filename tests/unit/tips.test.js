import { describe, it, expect } from 'vitest';
import { TIPS, tipFor } from '../../src/core/Tips.js';
import storyData from '../../src/data/story.json';
import townData from '../../src/data/town.json';
import itemsData from '../../src/data/items.json';

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

  it('no destripan la historia: ni personajes que no están en el pueblo desde el principio, ni objetos únicos, ni el Eco', () => {
    // Los vecinos que ya están al empezar (Kecleon, Persian, Pidgey…) se pueden nombrar
    const fromStart = new Set(
      townData.npcs.filter((npc) => !storyData.townNpcs[npc.id]?.arrivesWith).map((npc) => npc.name),
    );
    const names = [
      ...Object.values(storyData.speakers).map((s) => s.name).filter((name) => !fromStart.has(name)),
      ...itemsData.filter((item) => item.unique).map((item) => item.name),
      'Eco',
    ];
    expect(names).toContain('Pidgeotto');
    expect(names).toContain('Pañuelo Centella');
    const spoilers = TIPS.filter((tip) => names.some((name) => new RegExp(`\\b${name}\\b`).test(tip)));
    expect(spoilers).toEqual([]);
  });
});
