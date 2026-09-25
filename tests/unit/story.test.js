import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  STORY,
  AFTER_ENDING,
  ensureStory,
  storyChapter,
  scenesFor,
  lineApplies,
  resolveLine,
  sceneLines,
  npcTalk,
  npcGreeting,
  npcAbsent,
  markSeen,
  applyStoryEffect,
  seenForCleared,
} from '../../src/core/Story.js';
import { buildStory, SCRIPT_PATH } from '../../scripts/build-story.mjs';
import { createProfile } from '../../src/core/Profile.js';
import { abandonMission, claimRewards, describeMission } from '../../src/core/Missions.js';
import { DUNGEONS } from '../../src/core/Dungeons.js';
import { NATURES } from '../../src/core/Personality.js';
import manifest from '../../src/data/pmd-sprites.json';
import floorsData from '../../src/data/floors.json';

const ids = (scenes) => scenes.map((s) => s.id);
const EVENTS = ['adventure_start', 'dungeon_enter', 'floor_enter', 'boss_floor', 'boss_defeated', 'town_return', 'board_open', 'dungeon_select', 'new_day', 'credits_end'];

/** Equipo de la partida: Charmander y Squirtle, salvo que se diga otra cosa. */
function cast(hero = { name: 'Charmander', speciesId: 4 }, partner = { name: 'Squirtle', speciesId: 7 }) {
  return { hero, partner, teamName: 'Equipo Aurora' };
}

/** @param {string[]} cleared @param {string[]} [seen] */
function state(cleared, seen = []) {
  return { seen, chapter: storyChapter(cleared) };
}

function newProfile() {
  return createProfile({ teamName: 'Equipo Aurora', hero: { name: 'Charmander', speciesId: 4 }, partner: { name: 'Squirtle', speciesId: 7 } });
}

describe('los datos de la historia', () => {
  it('están al día con el guion (npm run story)', () => {
    expect(buildStory(readFileSync(SCRIPT_PATH, 'utf8'))).toEqual(STORY);
  });

  it('el guion se lee igual con finales de línea de Windows', () => {
    const crlf = readFileSync(SCRIPT_PATH, 'utf8').replace(/\r?\n/g, '\r\n');
    expect(buildStory(crlf)).toEqual(STORY);
  });

  it('cada escena tiene código único, líneas y disparadores válidos', () => {
    expect(new Set(ids(STORY.scenes)).size).toBe(STORY.scenes.length);
    const dungeonIds = new Set(DUNGEONS.map((d) => d.id));
    for (const scene of STORY.scenes) {
      expect(scene.lines.length, scene.id).toBeGreaterThan(0);
      expect(scene.triggers.length, scene.id).toBeGreaterThan(0);
      for (const t of scene.triggers) {
        expect(EVENTS, scene.id).toContain(t.on);
        if (t.dungeon) expect(dungeonIds.has(t.dungeon), scene.id).toBe(true);
      }
      for (const id of scene.requires ?? []) expect(ids(STORY.scenes)).toContain(id);
    }
  });

  it('cada mazmorra de la historia tiene entrada, jefe antes y después, y vuelta al pueblo', () => {
    STORY.chapters.forEach((dungeon, i) => {
      const on = (event) => STORY.scenes.filter((s) => s.triggers.some((t) => t.on === event && t.dungeon === dungeon));
      for (const event of ['dungeon_enter', 'boss_floor', 'boss_defeated', 'town_return']) {
        expect(on(event).length, `capítulo ${i + 1}: ${event}`).toBe(1);
      }
      // Y el jefe existe: está en el último piso de la mazmorra
      const last = DUNGEONS.find((d) => d.id === dungeon).floors[1];
      const zone = floorsData.zones.find((z) => z.floors[1] === last);
      expect(zone?.boss, dungeon).toBeTruthy();
    });
  });

  it('cada mazmorra de posjuego tiene entrada, legendario antes y después, y es del capítulo de después del final', () => {
    expect(STORY.postgame).toEqual(DUNGEONS.filter((d) => d.postgame).map((d) => d.id));
    STORY.postgame.forEach((dungeon, i) => {
      const on = (event) => STORY.scenes.filter((s) => s.triggers.some((t) => t.on === event && t.dungeon === dungeon));
      for (const event of ['dungeon_enter', 'boss_floor', 'boss_defeated']) {
        expect(on(event).map((s) => s.id), `${dungeon}: ${event}`).toEqual([`L${i + 1}-${{ dungeon_enter: 'B', boss_floor: 'C', boss_defeated: 'D' }[event]}`]);
      }
      // Quien habla ante el jefe es el legendario del final de la mazmorra
      const last = DUNGEONS.find((d) => d.id === dungeon).floors[1];
      const boss = floorsData.zones.find((z) => z.floors[1] === last).boss;
      const speakers = on('boss_floor')[0].lines.map((l) => STORY.speakers[l[0]]?.speciesId);
      expect(speakers, dungeon).toContain(boss.id);
    });
    for (const scene of STORY.scenes.filter((s) => s.id.startsWith('L'))) expect(scene.chapter, scene.id).toBe(AFTER_ENDING);
  });

  it('cada hablante existe y cada emoción tiene retrato para su especie', () => {
    const everyStarter = NATURES.map((n) => n.speciesId);
    const lines = [
      ...STORY.scenes.flatMap((s) => s.lines.map((l) => [s.id, l])),
      ...Object.values(STORY.npcTalk).flatMap((byChapter) => Object.values(byChapter).flat().map((l) => ['vecinos', l])),
      ...Object.values(STORY.npcGreet).flatMap((byChapter) => Object.values(byChapter).flat().map((l) => ['saludos', l])),
    ];
    for (const [where, [who, emotion, text, condition]] of lines) {
      expect(typeof text, where).toBe('string');
      if (who === 'narration' || who === 'voice') {
        expect(emotion, where).toBeNull();
        continue;
      }
      let species;
      if (who === 'hero' || who === 'partner') species = everyStarter;
      else if (who === 'member') species = [condition.species];
      else species = [STORY.speakers[who]?.speciesId];
      for (const id of species) {
        expect(id, `${where}: ${who}`).toBeDefined();
        expect(manifest[id].portraits, `${where}: ${who} (${id}) sin «${emotion}»`).toContain(emotion);
      }
    }
  });

  it('los textos solo usan los marcadores conocidos y no dan género al equipo', () => {
    const texts = STORY.scenes.flatMap((s) => s.lines.map((l) => l[2]));
    for (const text of texts) {
      for (const marker of text.match(/\{[^}]*\}/g) ?? []) expect(['{héroe}', '{compañero}', '{equipo}']).toContain(marker);
      expect(text).not.toMatch(/\b(vosotros|vosotras|juntos|juntas)\b/i);
    }
  });
});

describe('capítulos', () => {
  it('el capítulo sale de las mazmorras de la historia completadas', () => {
    expect(storyChapter([])).toBe(1);
    expect(storyChapter(['bosque_verde'])).toBe(2);
    expect(storyChapter(['bosque_verde', 'cueva_oscura', 'torre_desafio'])).toBe(3);
    expect(storyChapter(STORY.chapters)).toBe(AFTER_ENDING);
  });

  it('un perfil nuevo empieza sin escenas vistas', () => {
    expect(newProfile().story).toEqual({ seen: [] });
    const old = {};
    expect(ensureStory(old)).toEqual({ seen: [] });
  });
});

describe('qué escena toca', () => {
  it('el prólogo sale al empezar, una sola vez', () => {
    expect(ids(scenesFor('adventure_start', {}, state([])))).toEqual(['P-1', 'P-2', 'P-3']);
    expect(scenesFor('adventure_start', {}, state([], ['P-1', 'P-2', 'P-3']))).toEqual([]);
    expect(STORY.scenes.find((s) => s.id === 'P-1').backdrop).toBe('black');
  });

  it('en la mazmorra: entrada, piso del jefe, piso intermedio y jefe derrotado', () => {
    expect(ids(scenesFor('dungeon_enter', { dungeonId: 'bosque_verde' }, state([])))).toEqual(['1-B']);
    expect(ids(scenesFor('boss_floor', { dungeonId: 'bosque_verde', floor: 5 }, state([])))).toEqual(['1-C']);
    expect(ids(scenesFor('boss_defeated', { dungeonId: 'cueva_oscura' }, state(['bosque_verde'])))).toEqual(['2-D']);
    const deep = { dungeonId: 'profundidades_oscuras', floor: 5 };
    expect(ids(scenesFor('floor_enter', deep, state([])))).toEqual(['5-B2']);
    expect(scenesFor('floor_enter', { ...deep, floor: 4 }, state([]))).toEqual([]);
    // La Torre del Desafío no tiene escenas
    expect(scenesFor(['dungeon_enter', 'boss_floor'], { dungeonId: 'torre_desafio', floor: 50 }, state(STORY.chapters))).toEqual([]);
  });

  it('la vuelta al pueblo cierra el capítulo solo si se ha completado la mazmorra', () => {
    const cleared = { dungeonId: 'bosque_verde', outcome: 'cleared' };
    expect(ids(scenesFor('town_return', cleared, state(['bosque_verde'])))).toEqual(['1-E']);
    expect(scenesFor('town_return', { ...cleared, outcome: 'escaped' }, state([]))).toEqual([]);
    expect(scenesFor('town_return', { ...cleared, outcome: 'defeated' }, state([]))).toEqual([]);
  });

  it('el sobre del capítulo 3 sale al mirar el tablón o, si no, antes de ir a la ruta', () => {
    const chapter3 = ['bosque_verde', 'cueva_oscura'];
    expect(scenesFor('board_open', {}, state(['bosque_verde']))).toEqual([]);
    expect(ids(scenesFor('board_open', {}, state(chapter3)))).toEqual(['3-A']);
    expect(ids(scenesFor('dungeon_select', { dungeonId: 'ruta_electrica' }, state(chapter3)))).toEqual(['3-A']);
    expect(scenesFor('dungeon_select', { dungeonId: 'ruta_electrica' }, state(chapter3, ['3-A']))).toEqual([]);
    expect(scenesFor('dungeon_select', { dungeonId: 'cueva_oscura' }, state(chapter3))).toEqual([]);
  });

  it('el final: F-1 al volver del laboratorio y el epílogo con los créditos al día siguiente', () => {
    const all = STORY.chapters;
    const back = { dungeonId: 'laboratorio_final', outcome: 'cleared' };
    // Al volver solo sale F-1, aunque también empiece un día nuevo
    expect(ids(scenesFor(['town_return', 'new_day'], back, state(all)))).toEqual(['F-1']);
    expect(ids(scenesFor('new_day', {}, state(all, ['F-1'])))).toEqual(['F-2', 'F-3']);
    expect(STORY.scenes.find((s) => s.id === 'F-3').then).toBe('credits');
    // Tras los créditos, Mewtwo y después Pidgeotto con los tres picos del posjuego
    expect(ids(scenesFor('credits_end', {}, state(all, ['F-1', 'F-2', 'F-3'])))).toEqual(['F-4', 'L-0']);
    // Sin haber visto F-1 no hay epílogo
    expect(scenesFor('new_day', {}, state(all))).toEqual([]);
  });

  it('la víspera sale al elegir el laboratorio', () => {
    const six = STORY.chapters.slice(0, 6);
    expect(ids(scenesFor('dungeon_select', { dungeonId: 'laboratorio_final' }, state(six)))).toEqual(['7-A']);
  });
});

describe('posjuego: las leyendas del valle', () => {
  const all = STORY.chapters;
  const ending = ['F-1', 'F-2', 'F-3', 'F-4'];

  it('L-0 no sale antes del final', () => {
    const back = { dungeonId: 'laboratorio_final', outcome: 'cleared' };
    expect(ids(scenesFor(['town_return', 'new_day'], back, state(all)))).toEqual(['F-1']);
    expect(ids(scenesFor('new_day', {}, state(all, ['F-1'])))).not.toContain('L-0');
    expect(scenesFor('board_open', {}, state(all, ['F-1']))).toEqual([]);
  });

  it('quien ya había visto el final la ve en cuanto pasa algo en el pueblo', () => {
    const back = { dungeonId: 'bosque_verde', outcome: 'escaped' };
    expect(ids(scenesFor(['town_return', 'new_day'], back, state(all, ending)))).toEqual(['L-0']);
    expect(ids(scenesFor('board_open', {}, state(all, ending)))).toEqual(['L-0']);
    expect(ids(scenesFor('dungeon_select', { dungeonId: 'bosque_verde' }, state(all, ending)))).toEqual(['L-0']);
    expect(scenesFor('board_open', {}, state(all, [...ending, 'L-0']))).toEqual([]);
  });

  it('en cada pico: entrada, legendario y después', () => {
    const seen = [...ending, 'L-0'];
    expect(ids(scenesFor('dungeon_enter', { dungeonId: 'cumbre_escarcha' }, state(all, seen)))).toEqual(['L1-B']);
    expect(ids(scenesFor('boss_floor', { dungeonId: 'pico_tronador', floor: 8 }, state(all, seen)))).toEqual(['L2-C']);
    expect(ids(scenesFor('boss_defeated', { dungeonId: 'caldera_ascua' }, state(all, seen)))).toEqual(['L3-D']);
    expect(ids(scenesFor('floor_enter', { dungeonId: 'jardin_primer_sueno', floor: 5 }, state(all, seen)))).toEqual(['L4-B2']);
  });

  it('el sobre del jardín llega al volver del tercer pico, no antes', () => {
    const seen = [...ending, 'L-0', 'L1-D', 'L2-D'];
    const back = (dungeonId) => ({ dungeonId, outcome: 'cleared' });
    expect(scenesFor('town_return', back('pico_tronador'), state(all, seen))).toEqual([]);
    expect(ids(scenesFor('town_return', back('caldera_ascua'), state(all, [...seen, 'L3-D'])))).toEqual(['L4-A']);
    // Si no ha salido, sale al elegir el jardín
    expect(ids(scenesFor('dungeon_select', { dungeonId: 'jardin_primer_sueno' }, state(all, [...seen, 'L3-D'])))).toEqual(['L4-A']);
  });

  it('los pájaros hablan con su único retrato y Mew con todas sus caras', () => {
    const birds = new Set(['articuno', 'zapdos', 'moltres']);
    const lines = STORY.scenes.flatMap((s) => s.lines);
    expect(lines.filter((l) => birds.has(l[0])).every((l) => l[1] === 'Normal')).toBe(true);
    expect(new Set(lines.filter((l) => l[0] === 'mew').map((l) => l[1])).size).toBeGreaterThan(3);
  });
});

describe('cómo se muestra', () => {
  it('sustituye los marcadores y pone nombre y retrato a quien habla', () => {
    const c = cast();
    expect(resolveLine(['partner', 'Joyous', '¡Desde hoy somos el {equipo}!'], c)).toEqual({
      text: '¡Desde hoy somos el Equipo Aurora!',
      speaker: 'Squirtle',
      portrait: { speciesId: 7, emotion: 'Joyous' },
    });
    expect(resolveLine(['hero', 'Normal', 'Soy {héroe}. ¿Y {compañero}?'], c).text).toBe('Soy Charmander. ¿Y Squirtle?');
    expect(resolveLine(['onix', 'Surprised', '…Oh.'], c)).toEqual({ text: '…Oh.', speaker: 'Onix', portrait: { speciesId: 95, emotion: 'Surprised' } });
    expect(resolveLine(['voice', null, '¿Me oyes?'], c)).toEqual({ text: '¿Me oyes?', speaker: '???', portrait: null });
    expect(resolveLine(['narration', null, 'Huele a hierba.'], c)).toEqual({ text: 'Huele a hierba.', speaker: null, portrait: null });
  });

  it('las variantes por especie: con un Squirtle en el equipo grita «¡Vamo\' a hacesla!»', () => {
    const scene = STORY.scenes.find((s) => s.id === '2-C');
    const withSquirtle = sceneLines(scene, cast());
    expect(withSquirtle.at(-1)).toEqual({
      text: "¡Vamo' a hacesla!",
      speaker: 'Squirtle',
      portrait: { speciesId: 7, emotion: 'Determined' },
    });
    expect(withSquirtle.some((l) => l.text.includes('¡al ataquer!'))).toBe(false);

    const without = sceneLines(scene, cast({ name: 'Pikachu', speciesId: 25 }, { name: 'Bulbasaur', speciesId: 1 }));
    expect(without.at(-1).text).toBe('Pues nada… ¡al ataquer!');
    expect(without.some((l) => l.text.includes('hacesla'))).toBe(false);

    // Si Squirtle es el protagonista, lo grita él
    const heroSquirtle = sceneLines(scene, cast({ name: 'Squirtle', speciesId: 7 }, { name: 'Charmander', speciesId: 4 }));
    expect(heroSquirtle.at(-1).speaker).toBe('Squirtle');
    expect(lineApplies(['raichu', 'Happy', 'Y tú, Pikachu…', { species: 25 }], cast())).toBe(false);
  });

  it('Kecleon ofrece un monstersito al volver de la cueva', () => {
    const scene = STORY.scenes.find((s) => s.id === '2-E');
    expect(sceneLines(scene, cast()).some((l) => l.speaker === 'Kecleon' && l.text.includes('¿un monstersito o quéee?'))).toBe(true);
  });
});

describe('vecinos', () => {
  it('Slowpoke cuenta su historia un poco más lejos en cada capítulo', () => {
    expect(npcTalk('slowpoke', 1)[0][2]).toBe('…Hace mucho tiempo…');
    expect(npcTalk('slowpoke', 2)[0][2].length).toBeGreaterThan(npcTalk('slowpoke', 1)[0][2].length);
    expect(npcTalk('pidgey', 1)[0][2]).toContain('traed a mi hermana');
    expect(npcTalk('pidgey', AFTER_ENDING)[0][2]).toContain('torre nueva');
  });

  it('Slowpoke no está en el pueblo mientras Gengar lo tiene secuestrado', () => {
    expect(npcAbsent('slowpoke', 5)).toBe(true);
    expect(npcAbsent('slowpoke', 4)).toBe(false);
    expect(npcAbsent('pidgey', 5)).toBe(false);
  });

  it('Kecleon, Kangaskhan y Persian saludan una vez por capítulo', () => {
    const first = npcGreeting('kecleon', 1, []);
    expect(first.id).toBe('saludo:kecleon:1');
    expect(first.lines[0][2]).toContain('hoy no se fía');
    expect(npcGreeting('kecleon', 1, [first.id])).toBeNull();
    expect(npcGreeting('kangaskhan', 2, [])).toBeNull(); // en el 2 no dice nada nuevo
  });
});

describe('efectos', () => {
  it('el sobre sin remite: se apunta una vez, no se abandona y se cobra al entregarlo', () => {
    const profile = newProfile();
    applyStoryEffect(profile, 'letter_mission');
    applyStoryEffect(profile, 'letter_mission');
    const letters = profile.missions.accepted.filter((m) => m.id === 'story_letter');
    expect(letters).toHaveLength(1);
    expect(letters[0]).toMatchObject({ type: 'deliver', dungeonId: 'ruta_electrica', floor: 5, status: 'accepted', story: true, difficulty: 'D' });
    // La recompensa normal de una entrega en el piso global 15
    expect(letters[0].reward).toEqual({ money: 500, itemId: null, rankPoints: 20 });
    expect(describeMission(letters[0], { dungeonName: 'Ruta Eléctrica', itemName: (id) => id })).toContain('Huele a perfume caro');

    abandonMission(profile, 'story_letter');
    expect(profile.missions.accepted).toHaveLength(1);

    applyStoryEffect(profile, 'deliver_letter');
    const { wallet, rankPoints } = claimRewards(profile, { bag: [], wallet: 0, maxSlots: 24, itemName: (id) => id });
    expect(wallet).toBe(500);
    expect(rankPoints).toBe(20);
    expect(profile.missions.accepted).toHaveLength(0);
  });

  it('las escenas vistas se apuntan sin repetir', () => {
    const profile = newProfile();
    markSeen(profile, ['P-1', 'P-2']);
    markSeen(profile, ['P-2', 'P-3']);
    expect(profile.story.seen).toEqual(['P-1', 'P-2', 'P-3']);
  });
});

describe('partidas de antes de la historia', () => {
  it('siguen desde su capítulo: las escenas de los anteriores cuentan como vistas', () => {
    expect(seenForCleared([])).toEqual(['P-1', 'P-2', 'P-3']);
    const two = seenForCleared(['bosque_verde', 'cueva_oscura']);
    expect(two).toContain('1-E');
    expect(two).toContain('2-E');
    expect(two).not.toContain('3-A');
    // Quien ya había terminado no ve el final de golpe, pero el posjuego sí es nuevo
    expect(seenForCleared(STORY.chapters)).toEqual(ids(STORY.scenes.filter((s) => s.chapter < AFTER_ENDING)));
    expect(seenForCleared(STORY.chapters)).toContain('F-3');
    expect(seenForCleared(STORY.chapters)).not.toContain('L-0');
  });
});
