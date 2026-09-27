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
import { floorEventsAllowed } from '../../src/systems/FloorEvents.js';
import { floorReminders } from '../../src/core/Tips.js';
import { stairsLookText } from '../../src/systems/ActionSystem.js';
import floorsData from '../../src/data/floors.json';
import storyData from '../../src/data/story.json';
import recruitmentData from '../../src/data/recruitment.json';

const POSTGAME = ['cumbre_escarcha', 'pico_tronador', 'caldera_ascua', 'jardin_primer_sueno'];
const PEAKS = POSTGAME.slice(0, 3);
/** Las siete de la historia, completadas. */
const STORY_CLEARED = storyData.chapters;

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
    const story = DUNGEONS.filter((d) => !d.challenge && !d.postgame);
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

  it('los desbloqueos apuntan a mazmorras o escenas que existen', () => {
    const scenes = storyData.scenes.map((s) => s.id);
    for (const d of DUNGEONS) {
      if (!d.unlock) continue;
      if ('story' in d.unlock) {
        expect(scenes, d.id).toContain(d.unlock.story);
        continue;
      }
      for (const id of [d.unlock.cleared].flat()) expect(() => getDungeon(id)).not.toThrow();
    }
  });

  it('el posjuego va del piso 51 en adelante, sin huecos, y la Torre sigue en los 50 de la historia', () => {
    const postgame = DUNGEONS.filter((d) => d.postgame);
    expect(postgame.map((d) => d.id)).toEqual(POSTGAME);
    expect(postgame[0].floors[0]).toBe(51);
    for (let i = 1; i < postgame.length; i++) {
      expect(postgame[i].floors[0]).toBe(postgame[i - 1].floors[1] + 1);
    }
    expect(getDungeon('torre_desafio').floors).toEqual([1, 50]);
    // La Torre sigue siendo la última de la lista
    expect(DUNGEONS.at(-1).id).toBe('torre_desafio');
  });

  it('cada mazmorra de posjuego acaba en su legendario, que puede unirse, y es más dura que el laboratorio', () => {
    const legends = { cumbre_escarcha: 144, pico_tronador: 145, caldera_ascua: 146, jardin_primer_sueno: 151 };
    const lab = floorsData.zones.find((z) => z.floors[1] === 50);
    for (const id of POSTGAME) {
      const d = getDungeon(id);
      const zone = floorsData.zones.find((z) => z.floors[1] === d.floors[1]);
      expect(zone.boss.id, id).toBe(legends[id]);
      expect(recruitmentData.legendBosses, id).toContain(zone.boss.id);
      expect(zone.boss.level, id).toBeGreaterThan(lab.boss.level);
      expect(zone.levelRange[0], id).toBeGreaterThanOrEqual(lab.levelRange[1]);
    }
    // Mewtwo, en lo alto de la Torre, sigue sin unirse
    expect(recruitmentData.legendBosses).not.toContain(150);
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

describe('lo que ve el jugador va por el piso de la mazmorra, no por el global', () => {
  /** Cada piso de cada mazmorra: global, el que ve el jugador y si es el último. */
  const floors = DUNGEONS.flatMap((d) =>
    Array.from({ length: floorCount(d) }, (_, i) => {
      const global = d.floors[0] + i;
      return { id: d.id, global, floor: relativeFloor(d, global), last: isLastFloor(d, global) };
    }),
  );

  it('las escaleras llevan al siguiente piso de la mazmorra, y las del último, fuera', () => {
    for (const { id, global, floor, last } of floors) {
      const text = stairsLookText({ floor, last, hostiles: 0 });
      expect(text, `${id} ${global}`).toBe(last ? 'Escaleras de salida de la mazmorra. Zona despejada.' : `Escaleras al piso ${floor + 1}. Zona despejada.`);
    }
    // En la Cumbre Escarcha (pisos globales 51-58), del 1 se baja al 2, no al 52
    expect(stairsLookText({ floor: relativeFloor(getDungeon('cumbre_escarcha'), 51), last: false, hostiles: 3 }))
      .toBe('Escaleras al piso 2. Quedan 3 salvajes.');
  });

  it('en el primer piso de cada mazmorra no hay eventos, consejos ni recordatorio de guardar', () => {
    for (const { id, global, floor } of floors) {
      const first = floor === 1;
      expect(floorEventsAllowed(floor), `${id} ${global}`).toBe(!first);
      if (first) expect(floorReminders(floor), `${id} ${global}`).toEqual({ saveReminder: false, tip: false });
    }
    // Con el piso global, la Cueva Oscura (piso global 6) tenía eventos y
    // consejo en su piso 1, y el Jardín del Primer Sueño (75), el recordatorio
    expect(floorEventsAllowed(relativeFloor(getDungeon('cueva_oscura'), 6))).toBe(false);
    expect(floorReminders(relativeFloor(getDungeon('cueva_oscura'), 6)).tip).toBe(false);
    expect(floorReminders(relativeFloor(getDungeon('jardin_primer_sueno'), 75)).saveReminder).toBe(false);
  });

  it('el consejo sale cada 2 pisos y el recordatorio cada 5, contados igual en todas las mazmorras', () => {
    for (const { id, global, floor } of floors) {
      expect(floorReminders(floor), `${id} ${global}`).toEqual({ saveReminder: floor % 5 === 0, tip: floor % 2 === 0 });
    }
    // En la Torre del Desafío, piso de la torre y global coinciden
    const tower = getDungeon('torre_desafio');
    expect(relativeFloor(tower, 10)).toBe(10);
    expect(floorReminders(10)).toEqual({ saveReminder: true, tip: true });
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

  it('los tres picos se abren a la vez con el final de la historia, no antes', () => {
    // Con el laboratorio completado pero sin haber visto el final, nada
    const ids = (cleared, seen) => unlockedDungeons(cleared, seen).map((d) => d.id);
    expect(ids(STORY_CLEARED, ['F-1', 'F-2'])).not.toContain('cumbre_escarcha');
    const after = ids(STORY_CLEARED, ['F-1', 'F-2', 'F-3']);
    for (const id of PEAKS) expect(after).toContain(id);
    expect(after).not.toContain('jardin_primer_sueno');
    // Sin la escena, completar mazmorras no basta
    expect(isUnlocked(getDungeon('pico_tronador'), [...STORY_CLEARED, 'cumbre_escarcha'])).toBe(false);
  });

  it('el Jardín del Primer Sueño pide los tres picos', () => {
    const jardin = getDungeon('jardin_primer_sueno');
    const seen = ['F-3'];
    expect(isUnlocked(jardin, [...STORY_CLEARED, 'cumbre_escarcha', 'pico_tronador'], seen)).toBe(false);
    expect(isUnlocked(jardin, [...STORY_CLEARED, ...PEAKS], seen)).toBe(true);
  });
});
