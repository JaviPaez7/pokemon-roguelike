import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  MUSIC,
  WAVEFORMS,
  selectTheme,
  sceneMood,
  validTheme,
  themeConfig,
  scaleNotes,
  noteForDegree,
  patternStep,
} from '../../src/core/MusicSelect.js';
import { MusicManager } from '../../src/audio/MusicManager.js';
import { DUNGEONS } from '../../src/core/Dungeons.js';
import { STORY } from '../../src/core/Story.js';
import { GAME_STATES } from '../../src/constants.js';
import viteConfig from '../../vite.config.js';

/**
 * Mazmorras de posjuego de la rama h5/legendarios: ya tienen tema en
 * music.json aunque todavía no estén en dungeons.json. Al fusionarla, sobra.
 */
const PENDING_DUNGEONS = ['cumbre_escarcha', 'pico_tronador', 'caldera_ascua', 'jardin_primer_sueno'];

const { places } = MUSIC;
const scene = (id) => STORY.scenes.find((s) => s.id === id);
const inDungeon = (dungeonId, extra = {}) => ({ state: GAME_STATES.EXPLORING, town: false, dungeonId, boss: false, ...extra });

describe('qué tema suena', () => {
  it('en el título y en la nueva aventura, el del título', () => {
    expect(selectTheme({ state: GAME_STATES.TITLE })).toBe(places.title);
    expect(selectTheme({ state: GAME_STATES.STARTER_SELECT })).toBe(places.title);
    // Aunque quede una mazmorra de la partida anterior
    expect(selectTheme({ state: GAME_STATES.TITLE, dungeonId: 'bosque_verde' })).toBe(places.title);
  });

  it('en el pueblo, el del pueblo, también con un menú abierto', () => {
    expect(selectTheme({ state: GAME_STATES.TOWN, town: true })).toBe('pueblo');
    expect(selectTheme({ state: GAME_STATES.MENU, town: true })).toBe('pueblo');
  });

  it('cada mazmorra suena con el suyo y la Torre con el suyo', () => {
    expect(selectTheme(inDungeon('bosque_verde'))).toBe('bosque_verde');
    expect(selectTheme(inDungeon('isla_volcanica', { state: GAME_STATES.MENU }))).toBe('isla_volcanica');
    expect(selectTheme(inDungeon('torre_desafio'))).toBe('torre_desafio');
  });

  it('con un jefe en pie suena el del jefe (el laboratorio tiene uno propio) y, al caer, vuelve el de la mazmorra', () => {
    expect(selectTheme(inDungeon('bosque_verde', { boss: true }))).toBe('jefe');
    expect(selectTheme(inDungeon('torre_desafio', { boss: true }))).toBe('jefe');
    expect(selectTheme(inDungeon('laboratorio_final', { boss: true }))).toBe('jefe_final');
    expect(selectTheme(inDungeon('laboratorio_final', { boss: false }))).toBe('laboratorio_final');
  });

  it('las escenas tienen el tema general o el de su ambiente: tensión, emoción o el Eco', () => {
    expect(sceneMood(scene('P-2'))).toBeNull();
    expect(selectTheme({ state: GAME_STATES.TOWN, town: true, scene: scene('P-2') })).toBe('historia');
    // Por disparador: antes de cada jefe, tensión
    expect(sceneMood(scene('1-C'))).toBe('tension');
    expect(selectTheme({ ...inDungeon('bosque_verde', { boss: true }), scene: scene('1-C') })).toBe('historia_tension');
    // Por escena: la voz del prólogo es el Eco; la noche del final, emoción
    expect(selectTheme({ state: GAME_STATES.TOWN, town: true, scene: scene('P-1') })).toBe('eco');
    expect(selectTheme({ state: GAME_STATES.TOWN, town: true, scene: scene('F-3') })).toBe('historia_emocion');
  });

  it('los créditos ganan a la escena y la escena, al lugar', () => {
    const ctx = { ...inDungeon('bosque_verde', { boss: true }), scene: scene('1-C'), credits: true };
    expect(selectTheme(ctx)).toBe('creditos');
    expect(selectTheme({ ...ctx, credits: false })).toBe('historia_tension');
  });

  it('un lugar sin tema, o con uno que no existe, usa el de por defecto sin fallar', () => {
    expect(selectTheme({})).toBe(MUSIC.default);
    expect(selectTheme(inDungeon('mazmorra_que_no_existe'))).toBe(MUSIC.default);
    const data = {
      default: 'base',
      scales: MUSIC.scales,
      themes: { base: MUSIC.themes.mazmorra, otro: MUSIC.themes.pueblo },
      places: { town: 'no_existe', dungeons: { cueva: 'tampoco' } },
    };
    expect(selectTheme({ town: true }, data)).toBe('base');
    expect(selectTheme(inDungeon('cueva'), data)).toBe('base');
    expect(selectTheme(inDungeon('cueva', { boss: true }), data)).toBe('base');
    expect(selectTheme({ credits: true }, data)).toBe('base');
    expect(selectTheme({ scene: scene('P-1') }, data)).toBe('base');
    // Sin un tema por defecto válido, el primero
    expect(validTheme('nada', { ...data, default: 'roto' })).toBe('base');
    expect(themeConfig('nada')).toBe(MUSIC.themes[MUSIC.default]);
  });
});

describe('notas', () => {
  const scale = MUSIC.scales.c_major;

  it('los grados siguen por encima y por debajo de la escala', () => {
    expect(noteForDegree(scale, 0)).toBe(60);
    expect(noteForDegree(scale, 4)).toBe(67);
    expect(noteForDegree(scale, 7)).toBe(72);
    expect(noteForDegree(scale, 9)).toBe(76);
    expect(noteForDegree(scale, -1)).toBe(59);
    expect(noteForDegree(scale, -7)).toBe(48);
  });

  it('los patrones se repiten; null es silencio y sin patrón decide quien toca', () => {
    expect(patternStep([0, null, 4], 0)).toBe(0);
    expect(patternStep([0, null, 4], 1)).toBeNull();
    expect(patternStep([0, null, 4], 5)).toBe(4);
    expect(patternStep(undefined, 3)).toBeUndefined();
    expect(patternStep([], 3)).toBeUndefined();
  });

  it('una escala que no existe no rompe nada', () => {
    expect(scaleNotes('no_existe')).toEqual(Object.values(MUSIC.scales)[0]);
  });
});

describe('datos de música (music.json)', () => {
  it('cada mazmorra de dungeons.json suena con un tema que existe, el suyo o el de por defecto', () => {
    for (const d of DUNGEONS) {
      const id = selectTheme(inDungeon(d.id));
      expect(MUSIC.themes[id], d.id).toBeDefined();
      expect(MUSIC.themes[selectTheme(inDungeon(d.id, { boss: true }))], `${d.id} (jefe)`).toBeDefined();
    }
  });

  it('las mazmorras con tema existen (o llegan con h5/legendarios): así se pillan las erratas', () => {
    const known = new Set([...DUNGEONS.map((d) => d.id), ...PENDING_DUNGEONS]);
    const listed = [...Object.keys(places.dungeons), ...Object.keys(places.boss.dungeons ?? {})];
    expect(listed.filter((id) => !known.has(id))).toEqual([]);
  });

  it('cada lugar apunta a un tema que existe', () => {
    const story = places.story;
    const refs = {
      default: MUSIC.default,
      title: places.title,
      town: places.town,
      credits: places.credits,
      boss: places.boss.default,
      story: story.default,
      ...Object.fromEntries(Object.entries(places.dungeons).map(([k, v]) => [`dungeons.${k}`, v])),
      ...Object.fromEntries(Object.entries(places.boss.dungeons ?? {}).map(([k, v]) => [`boss.${k}`, v])),
      ...Object.fromEntries(Object.entries(story.moods).map(([k, v]) => [`moods.${k}`, v])),
    };
    for (const [where, id] of Object.entries(refs)) {
      expect(MUSIC.themes[id], `${where} → ${id}`).toBeDefined();
    }
  });

  it('las escenas y disparadores con ambiente existen en la historia y sus ambientes, en `moods`', () => {
    const { scenes, triggers, moods } = places.story;
    const sceneIds = new Set(STORY.scenes.map((s) => s.id));
    const triggerNames = new Set(STORY.scenes.flatMap((s) => s.triggers.map((t) => t.on)));
    for (const [id, mood] of Object.entries(scenes)) {
      expect(sceneIds.has(id), `escena ${id}`).toBe(true);
      expect(moods[mood], `ambiente ${mood} de ${id}`).toBeDefined();
    }
    for (const [on, mood] of Object.entries(triggers)) {
      expect(triggerNames.has(on), `disparador ${on}`).toBe(true);
      expect(moods[mood], `ambiente ${mood} de ${on}`).toBeDefined();
    }
    // Hay tema de tensión, de emoción y del Eco
    expect(Object.keys(moods).sort()).toEqual(['eco', 'emocion', 'tension']);
  });

  it('las escalas son de 7 notas MIDI en orden ascendente', () => {
    for (const [name, notes] of Object.entries(MUSIC.scales)) {
      expect(notes, name).toHaveLength(7);
      notes.forEach((n, i) => {
        expect(Number.isInteger(n), `${name}[${i}]`).toBe(true);
        if (i > 0) expect(n, `${name}[${i}]`).toBeGreaterThan(notes[i - 1]);
      });
    }
  });

  it('los temas usan escalas y formas de onda que existen, con tempo, octava y patrones válidos', () => {
    const isStep = (v) => v === null || Number.isInteger(v);
    for (const [id, t] of Object.entries(MUSIC.themes)) {
      expect(MUSIC.scales[t.scale], `${id}: escala ${t.scale}`).toBeDefined();
      expect(WAVEFORMS, `${id}: onda ${t.waveform}`).toContain(t.waveform);
      expect(t.tempo, `${id}: tempo`).toBeGreaterThanOrEqual(40);
      expect(t.tempo, `${id}: tempo`).toBeLessThanOrEqual(240);
      expect(Number.isInteger(t.octave) && Math.abs(t.octave) <= 2, `${id}: octava`).toBe(true);
      for (const key of ['melody', 'bass']) {
        if (t[key] === undefined) continue;
        expect(t[key].length, `${id}: ${key}`).toBeGreaterThan(0);
        expect(t[key].every(isStep), `${id}: ${key}`).toBe(true);
      }
      for (const key of ['density', 'variation']) {
        if (t[key] !== undefined) expect(t[key] >= 0 && t[key] <= 1, `${id}: ${key}`).toBe(true);
      }
      if (t.noteLength !== undefined) expect(t.noteLength, `${id}: noteLength`).toBeGreaterThan(0);
    }
  });

  it('va en el trozo de datos del build', () => {
    const { groups } = viteConfig({ mode: 'production' }).build.rolldownOptions.output.codeSplitting;
    const group = groups.find((g) => g.test.test('/repo/src/data/music.json'));
    expect(group?.name).toBe('datos');
  });
});

describe('MusicManager', () => {
  /** Web Audio de mentira: cuenta los osciladores creados. */
  class FakeAudioContext {
    constructor() {
      // Creado dentro de una interacción, el navegador lo deja sonar
      this.state = 'running';
      this.currentTime = 0;
      this.destination = {};
      this.oscillators = 0;
      this.resumes = 0;
      FakeAudioContext.created.push(this);
    }
    createGain() {
      return { gain: fakeParam(), connect() {} };
    }
    createOscillator() {
      this.oscillators++;
      return { type: '', frequency: fakeParam(), connect() {}, start() {}, stop() {} };
    }
    resume() {
      this.resumes++;
      this.state = 'running';
      return Promise.resolve();
    }
  }
  const fakeParam = () => ({ value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {} });
  /** @type {Record<string, Function[]>} */
  let listeners;
  /** Simula una interacción de la página. @param {string} type */
  const gesture = (type) => (listeners[type] ?? []).forEach((fn) => fn());

  beforeEach(() => {
    vi.useFakeTimers();
    FakeAudioContext.created = [];
    listeners = {};
    globalThis.window = {
      AudioContext: FakeAudioContext,
      addEventListener: (type, fn) => (listeners[type] ??= []).push(fn),
    };
  });

  afterEach(() => {
    vi.useRealTimers();
    delete globalThis.window;
  });

  it('no reinicia el tema que ya suena y cambia al pedir otro', () => {
    const music = new MusicManager();
    music.playTheme('pueblo');
    expect(music.currentTheme).toBe('pueblo');
    const timer = music.intervalId;
    music.playTheme('pueblo');
    expect(music.intervalId).toBe(timer);
    music.playTheme('jefe');
    expect(music.currentTheme).toBe('jefe');
    expect(music.intervalId).not.toBe(timer);
    music.stop();
    expect(music.isPlaying).toBe(false);
  });

  it('un tema que no existe suena como el de por defecto', () => {
    const music = new MusicManager();
    music.playTheme('no_existe');
    expect(music.currentTheme).toBe(MUSIC.default);
    music.stop();
  });

  it('sin interacción no crea el audio; la primera tecla lo crea con el volumen elegido y el tema empieza desde el principio', () => {
    const music = new MusicManager();
    music.setVolume(0.6); // el guardado en las opciones
    music.playTheme('titulo');
    vi.advanceTimersByTime(3000);
    expect(FakeAudioContext.created).toHaveLength(0);
    expect(music.step).toBe(0);

    gesture('keydown');
    expect(FakeAudioContext.created).toHaveLength(1);
    const ctx = FakeAudioContext.created[0];
    expect(music.masterGain.gain.value).toBe(0.6);
    vi.advanceTimersByTime(3000);
    expect(ctx.oscillators).toBeGreaterThan(0);
    expect(music.step).toBeGreaterThan(0);

    // Más interacciones no crean otro contexto
    gesture('pointerup');
    expect(FakeAudioContext.created).toHaveLength(1);
    music.stop();
  });

  it('si el navegador suspende el audio, deja de programar notas y la siguiente interacción lo reanuda', () => {
    const music = new MusicManager();
    gesture('mousedown');
    const ctx = FakeAudioContext.created[0];
    music.playTheme('cueva_oscura');
    ctx.state = 'suspended';
    vi.advanceTimersByTime(3000);
    expect(ctx.oscillators).toBe(0);

    gesture('touchend');
    expect(ctx.resumes).toBe(1);
    vi.advanceTimersByTime(3000);
    expect(ctx.oscillators).toBeGreaterThan(0);
    music.stop();
  });

  it('setVolume respeta los límites', () => {
    const music = new MusicManager();
    music.setVolume(1.5);
    expect(music.masterGain.gain.value).toBe(1);
    music.setVolume(-1);
    expect(music.masterGain.gain.value).toBe(0);
    music.setVolume(0.4);
    expect(music.masterGain.gain.value).toBe(0.4);
  });

  it('sin Web Audio el juego sigue en silencio', () => {
    globalThis.window = { addEventListener: (type, fn) => (listeners[type] ??= []).push(fn) };
    const music = new MusicManager();
    music.playTheme('pueblo');
    gesture('keydown');
    vi.advanceTimersByTime(1000);
    expect(music.audioCtx).toBeNull();
    music.setVolume(0.5);
    expect(music.masterGain.gain.value).toBe(0.5);
    music.stop();
  });
});
