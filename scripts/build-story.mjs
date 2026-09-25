/**
 * build-story.mjs — Convierte el guion (docs/guion-historia.md) en los datos
 * que usa el juego (src/data/story.json).
 *
 * El guion es la fuente: para cambiar un diálogo se edita el documento y se
 * vuelve a generar el JSON con `npm run story`. Un test unitario comprueba que
 * los dos no se desincronizan.
 *
 * Lo que el guion no dice en sus líneas (cuándo salta cada escena, qué efecto
 * tiene, las emociones de las frases de los vecinos y dónde entran las
 * variantes por especie) está en las tablas de este fichero.
 *
 * Uso: node scripts/build-story.mjs
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const SCRIPT_PATH = join(ROOT, 'docs', 'guion-historia.md');
export const STORY_PATH = join(ROOT, 'src', 'data', 'story.json');

/** Mazmorra de cada capítulo, en orden. */
export const CHAPTER_DUNGEONS = [
  'bosque_verde',
  'cueva_oscura',
  'ruta_electrica',
  'monte_lunar',
  'profundidades_oscuras',
  'isla_volcanica',
  'laboratorio_final',
];

/**
 * Mazmorras del posjuego (H5), en el orden de sus escenas: L1 es la primera,
 * L2 la segunda… La escena L-0 las presenta tras el final.
 */
export const POSTGAME_DUNGEONS = ['cumbre_escarcha', 'pico_tronador', 'caldera_ascua', 'jardin_primer_sueno'];

/** Capítulo de las escenas de después del final (el posjuego). */
const AFTER_ENDING_CHAPTER = CHAPTER_DUNGEONS.length + 1;

/** Personajes que hablan, con su nombre y su especie (para el retrato). */
const SPEAKERS = {
  slowpoke: { name: 'Slowpoke', speciesId: 79 },
  pidgey: { name: 'Pidgey', speciesId: 16 },
  pidgeotto: { name: 'Pidgeotto', speciesId: 17 },
  kecleon: { name: 'Kecleon', speciesId: 352 },
  kangaskhan: { name: 'Kangaskhan', speciesId: 115 },
  persian: { name: 'Persian', speciesId: 53 },
  onix: { name: 'Onix', speciesId: 95 },
  raichu: { name: 'Raichu', speciesId: 26 },
  clefable: { name: 'Clefable', speciesId: 36 },
  gengar: { name: 'Gengar', speciesId: 94 },
  arcanine: { name: 'Arcanine', speciesId: 59 },
  mewtwo: { name: 'Mewtwo', speciesId: 150 },
  articuno: { name: 'Articuno', speciesId: 144 },
  zapdos: { name: 'Zapdos', speciesId: 145 },
  moltres: { name: 'Moltres', speciesId: 146 },
  mew: { name: 'Mew', speciesId: 151 },
};

/** Especies de las variantes (sección 7 del guion). */
const SPECIES = {
  Pikachu: 25,
  Meowth: 52,
  Psyduck: 54,
  Charmander: 4,
  Squirtle: 7,
  Bulbasaur: 1,
  Machop: 66,
  Cubone: 104,
  Eevee: 133,
};

/** Emociones de las frases de los vecinos (las tablas del guion no las dicen). */
const NPC_EMOTIONS = {
  slowpoke: { default: 'Normal' },
  pidgey: { 1: 'Worried', 2: 'Happy', 3: 'Normal', 4: 'Worried', 5: 'Shouting', 6: 'Inspired', 7: 'Determined', 8: 'Joyous' },
  kecleon: { 1: 'Normal', 2: 'Sigh', 3: 'Happy', 4: 'Normal', 5: 'Worried', 6: 'Happy', 8: 'Joyous' },
  kangaskhan: { 1: 'Happy', 3: 'Normal', 5: 'Sad', 8: 'Happy' },
  persian: { 1: 'Normal', 3: 'Surprised', 4: 'Worried', 7: 'Normal', 8: 'Happy' },
};

/**
 * Dónde entra cada variante: detrás de la línea que contiene `after` (si no,
 * al final de la escena). Con `replaces`, la línea que lo contiene solo sale
 * cuando no hay nadie de esa especie en el equipo.
 */
const VARIANT_PLACES = {
  'Meowth P-3': { after: 'Qué romántico' },
  'Psyduck 5-D': { after: '¿Ya es de día?' },
  'Bulbasaur 4-D': { after: 'la única persona que se paró a contestar' },
  'Cubone 1-E': { after: 'os traeré de vuelta' },
  'Eevee 7-D': { after: 'Se me da bien esperar' },
  'Squirtle 2-C': { replaces: '¡al ataquer!' },
  // Gengar se burla de Machop antes del grito de Squirtle, que va justo antes del combate
  'Machop 5-C': { after: 'la noche es mía' },
};

/**
 * Cuándo salta una escena. Cada disparador es un evento del juego y, si hace
 * falta, la mazmorra, el piso relativo o el final de la expedición.
 * @param {string} id
 * @returns {{ triggers: Object[], chapter: number, [key: string]: unknown }}
 */
function sceneMeta(id) {
  if (id === 'P-1') return { chapter: 0, triggers: [{ on: 'adventure_start' }], backdrop: 'black' };
  if (id.startsWith('P-')) return { chapter: 0, triggers: [{ on: 'adventure_start' }] };
  if (id === 'F-1') return { chapter: 7, triggers: [{ on: 'town_return', dungeon: 'laboratorio_final', outcome: 'cleared' }] };
  if (id === 'F-2') return { chapter: 7, requires: ['F-1'], triggers: [{ on: 'new_day' }] };
  if (id === 'F-3') return { chapter: 7, requires: ['F-1'], triggers: [{ on: 'new_day' }], then: 'credits' };
  if (id === 'F-4') return { chapter: 7, triggers: [{ on: 'credits_end' }] };
  if (id.startsWith('L')) return postgameMeta(id);

  const [number, kind] = id.split('-');
  const chapter = Number(number);
  const dungeon = CHAPTER_DUNGEONS[chapter - 1];
  switch (kind) {
    case 'A':
      if (chapter === 3) {
        // El sobre: al mirar el tablón o, si no se ha mirado, antes de salir hacia la ruta
        return {
          chapter,
          when: { chapter },
          triggers: [{ on: 'board_open' }, { on: 'dungeon_select', dungeon }],
          effects: ['letter_mission'],
        };
      }
      return { chapter, triggers: [{ on: 'dungeon_select', dungeon }] };
    case 'B':
      return { chapter, triggers: [{ on: 'dungeon_enter', dungeon }] };
    case 'B2':
      return { chapter, triggers: [{ on: 'floor_enter', dungeon, floor: 5 }] };
    case 'C':
      return { chapter, triggers: [{ on: 'boss_floor', dungeon }], ...(chapter === 3 ? { effects: ['letter_mission'] } : {}) };
    case 'D':
      return { chapter, triggers: [{ on: 'boss_defeated', dungeon }], ...(chapter === 3 ? { effects: ['deliver_letter'] } : {}) };
    case 'E':
      return { chapter, triggers: [{ on: 'town_return', dungeon, outcome: 'cleared' }] };
    default:
      throw new Error(`Escena sin disparador conocido: ${id}`);
  }
}

/**
 * Cuándo salta una escena del posjuego (código L).
 * - L-0 presenta los tres picos detrás de F-4 (tras los créditos). Quien ya
 *   había visto el final antes del posjuego la ve la próxima vez que vuelva al
 *   pueblo, duerma, mire el tablón o elija mazmorra.
 * - L1 a L4 son las mazmorras de POSTGAME_DUNGEONS, con las mismas letras que
 *   los capítulos. L4-A (el sobre del jardín) sale al volver del tercer pico, o
 *   al elegir el jardín si no había salido.
 * @param {string} id
 */
function postgameMeta(id) {
  const chapter = AFTER_ENDING_CHAPTER;
  if (id === 'L-0') {
    return {
      chapter,
      requires: ['F-3'],
      triggers: [{ on: 'credits_end' }, { on: 'town_return' }, { on: 'new_day' }, { on: 'board_open' }, { on: 'dungeon_select' }],
    };
  }
  const [code, kind] = id.split('-');
  const dungeon = POSTGAME_DUNGEONS[Number(code.slice(1)) - 1];
  if (!dungeon) throw new Error(`Escena de posjuego sin mazmorra: ${id}`);
  const peaks = POSTGAME_DUNGEONS.slice(0, 3);
  switch (kind) {
    case 'A':
      return {
        chapter,
        requires: peaks.map((_, i) => `L${i + 1}-D`),
        triggers: [...peaks.map((d) => ({ on: 'town_return', dungeon: d, outcome: 'cleared' })), { on: 'dungeon_select', dungeon }],
      };
    case 'B':
      return { chapter, triggers: [{ on: 'dungeon_enter', dungeon }] };
    case 'B2':
      return { chapter, triggers: [{ on: 'floor_enter', dungeon, floor: 5 }] };
    case 'C':
      return { chapter, triggers: [{ on: 'boss_floor', dungeon }] };
    case 'D':
      return { chapter, triggers: [{ on: 'boss_defeated', dungeon }] };
    default:
      throw new Error(`Escena sin disparador conocido: ${id}`);
  }
}

/** Misión de historia del capítulo 3: el sobre sin remite de Persian. */
const LETTER_MISSION = {
  id: 'story_letter',
  type: 'deliver',
  dungeonId: 'ruta_electrica',
  floor: 5,
  clientSpeciesId: 26,
  clientName: 'Raichu',
  text: 'Un sobre cerrado, sin remite. Huele a perfume caro.<br>«Llevad este sobre a Raichu, al final de la Ruta Eléctrica. No lo abráis. Pago: generoso.»',
};

// ─── Lectura del guion ────────────────────────────────────────────────────

const SCENE_HEADER = /^\*\*((?:[P0-9F]|L[0-9]?)-[A-Z0-9]+) · (.+?)\*\*/;
const LINE_SPEAKER = /^- \*\*(.+?)\*\* · \*(.+?)\* — (.+)$/;
const LINE_VOICE = /^- \*\*\?\?\?\*\* — (.+)$/;
const LINE_NARRATION = /^- \*Narración\* — (.+)$/;

/** @param {string} name - Como aparece en el guion */
function speakerKey(name) {
  if (name === '{héroe}') return 'hero';
  if (name === '{compañero}') return 'partner';
  const key = name.toLowerCase();
  if (!SPEAKERS[key]) throw new Error(`Personaje desconocido en el guion: ${name}`);
  return key;
}

/**
 * Una línea de diálogo del guion como [hablante, emoción, texto].
 * @param {string} raw
 * @returns {Array | null}
 */
function parseLine(raw) {
  let m = raw.match(LINE_NARRATION);
  if (m) return ['narration', null, m[1]];
  m = raw.match(LINE_VOICE);
  if (m) return ['voice', null, m[1]];
  m = raw.match(LINE_SPEAKER);
  if (m) return [speakerKey(m[1]), m[2], m[3]];
  return null;
}

/**
 * Escenas de la sección 5, en orden.
 * @param {string[]} lines
 */
function parseScenes(lines) {
  const scenes = [];
  let current = null;
  for (const raw of lines) {
    const header = raw.match(SCENE_HEADER);
    if (header) {
      current = { id: header[1], title: header[2], lines: [] };
      scenes.push(current);
      continue;
    }
    if (raw.startsWith('## ') || raw.startsWith('### ') || raw.startsWith('**Créditos**')) {
      current = null;
      continue;
    }
    if (!current || !raw.startsWith('- ')) continue;
    const line = parseLine(raw);
    if (!line) throw new Error(`Línea de la escena ${current.id} que no se entiende: ${raw}`);
    current.lines.push(line);
  }
  return scenes;
}

/**
 * Filas de la tabla markdown que sigue a la línea que empieza por `marker`.
 * @param {string[]} lines
 * @param {string} marker
 * @returns {string[][]}
 */
function tableAfter(lines, marker) {
  const start = lines.findIndex((l) => l.startsWith(marker));
  if (start === -1) throw new Error(`No encuentro la tabla «${marker}»`);
  const rows = [];
  let i = start + 1;
  while (i < lines.length && !lines[i].startsWith('|')) i++;
  for (i += 2; i < lines.length && lines[i].startsWith('|'); i++) {
    rows.push(lines[i].slice(1, -1).split(' | ').map((c) => c.trim()));
  }
  return rows;
}

/** @param {string} cell - Capítulo: número o «Después» (8, tras el final) */
function chapterOf(cell) {
  return cell === 'Después' ? 8 : Number(cell);
}

/**
 * Frase de un vecino de las tablas de la sección 6 como líneas de escena.
 * @param {string} npc
 * @param {number} chapter
 * @param {string} cell
 * @returns {Array[] | null} null si no dice nada nuevo
 */
function npcLines(npc, chapter, cell) {
  if (cell === '—' || cell.startsWith('*(ver') || cell.startsWith('*(No está')) return null;
  const emotions = NPC_EMOTIONS[npc];
  const emotion = emotions[chapter] ?? emotions.default ?? 'Normal';
  const asleep = cell.endsWith('*(Se ha dormido.)*');
  const text = cell.replace(/\s*\*\(Se ha dormido\.\)\*$/, '');
  const result = [[npc, emotion, text]];
  if (asleep) result.push(['narration', null, `${SPEAKERS[npc].name} se ha dormido.`]);
  return result;
}

/**
 * Añade las variantes por especie (sección 7) a sus escenas.
 * @param {string[]} lines
 * @param {Map<string, Object>} byId
 */
function applyVariants(lines, byId) {
  for (const [speciesName, where, who, phrase] of tableAfter(lines, '## 7. Variantes')) {
    const species = SPECIES[speciesName];
    if (!species) throw new Error(`Especie de variante desconocida: ${speciesName}`);
    const [whoName, whoEmotion] = who.split(' · ').map((s) => s.replace(/\*/g, ''));
    const speaker = whoName === speciesName ? 'member' : speakerKey(whoName);
    const text = phrase.replace(/\s*\*\(.*\)\*$/, '');
    for (const sceneId of where.split(' y ')) {
      const scene = byId.get(sceneId);
      if (!scene) throw new Error(`Variante para una escena que no existe: ${sceneId}`);
      const line = [speaker, whoEmotion, text, { species }];
      const place = VARIANT_PLACES[`${speciesName} ${sceneId}`] ?? {};
      const anchor = place.after ?? place.replaces;
      const index = anchor ? scene.lines.findIndex((l) => l[2].includes(anchor)) : -1;
      if (anchor && index === -1) throw new Error(`No encuentro «${anchor}» en ${sceneId}`);
      if (place.replaces) scene.lines[index] = [...scene.lines[index], { notSpecies: species }];
      if (index === -1) scene.lines.push(line);
      else scene.lines.splice(index + 1, 0, line);
    }
  }
}

/**
 * Datos de la historia a partir del guion.
 * @param {string} markdown
 */
export function buildStory(markdown) {
  // En Windows, Git puede dejar el guion con finales CRLF
  const lines = markdown.replace(/\r\n?/g, '\n').split('\n');
  const guion = lines.slice(lines.findIndex((l) => l === '## 5. Guion'), lines.findIndex((l) => l.startsWith('## 6.')));
  const scenes = parseScenes(guion);
  const byId = new Map(scenes.map((s) => [s.id, s]));
  applyVariants(lines, byId);

  const npcTalk = { slowpoke: {}, pidgey: {} };
  for (const [chapter, text] of tableAfter(lines, '**Slowpoke.**')) {
    npcTalk.slowpoke[chapterOf(chapter)] = npcLines('slowpoke', chapterOf(chapter), text);
  }
  for (const [chapter, text] of tableAfter(lines, '**Pidgey**')) {
    npcTalk.pidgey[chapterOf(chapter)] = npcLines('pidgey', chapterOf(chapter), text);
  }
  const npcGreet = { kecleon: {}, kangaskhan: {}, persian: {} };
  for (const [chapter, ...cells] of tableAfter(lines, '**Kecleon, Kangaskhan y Persian**')) {
    ['kecleon', 'kangaskhan', 'persian'].forEach((npc, i) => {
      const said = npcLines(npc, chapterOf(chapter), cells[i]);
      if (said) npcGreet[npc][chapterOf(chapter)] = said;
    });
  }
  for (const npc of Object.keys(npcTalk)) {
    for (const [chapter, said] of Object.entries(npcTalk[npc])) if (!said) delete npcTalk[npc][chapter];
  }

  return {
    _formato:
      'Generado desde docs/guion-historia.md con `npm run story`: no lo edites a mano. ' +
      'Cada línea es [hablante, emoción, texto, condición?]. Hablantes: hero, partner, member (quien del equipo sea de la ' +
      'especie de la condición), voice (???), narration o una clave de `speakers`. Condiciones: {"species": id} solo sale ' +
      'si el protagonista o el compañero es de esa especie; {"notSpecies": id}, solo si no lo es.',
    chapters: CHAPTER_DUNGEONS,
    postgame: POSTGAME_DUNGEONS,
    speakers: SPEAKERS,
    absent: { slowpoke: [5] },
    letterMission: LETTER_MISSION,
    scenes: scenes.map(({ id, title, lines: sceneLines }) => ({ id, title, ...sceneMeta(id), lines: sceneLines })),
    npcTalk,
    npcGreet,
  };
}

// ─── Escritura ────────────────────────────────────────────────────────────

/**
 * Un valor en una sola línea: `[1, 2]`, `{"a": 1}`.
 * @param {unknown} value
 * @returns {string}
 */
function oneLine(value) {
  if (Array.isArray(value)) return `[${value.map(oneLine).join(', ')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value).map(([k, v]) => `${JSON.stringify(k)}: ${oneLine(v)}`).join(', ')}}`;
  }
  return JSON.stringify(value);
}

/** Sin arrays ni objetos con más de un nivel dentro: cabe en una línea. */
function isFlat(value) {
  const children = Array.isArray(value) ? value : Object.values(value);
  return children.every((v) => v === null || typeof v !== 'object' || Object.values(v).every((w) => w === null || typeof w !== 'object'));
}

/**
 * JSON con sangría, pero cada línea de diálogo, disparador o lista corta en
 * una sola línea.
 * @param {unknown} value
 * @param {string} [indent]
 * @returns {string}
 */
export function formatStory(value, indent = '') {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  const inner = `${indent}  `;
  const flat = oneLine(value);
  const isLine = Array.isArray(value) && typeof value[2] === 'string';
  if (isFlat(value) && (isLine || flat.length <= 100)) return flat;
  if (Array.isArray(value)) {
    return `[\n${value.map((v) => inner + formatStory(v, inner)).join(',\n')}\n${indent}]`;
  }
  const entries = Object.entries(value);
  return `{\n${entries.map(([k, v]) => `${inner}${JSON.stringify(k)}: ${formatStory(v, inner)}`).join(',\n')}\n${indent}}`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const story = buildStory(readFileSync(SCRIPT_PATH, 'utf8'));
  writeFileSync(STORY_PATH, `${formatStory(story)}\n`);
  const count = story.scenes.reduce((n, s) => n + s.lines.length, 0);
  console.log(`src/data/story.json: ${story.scenes.length} escenas, ${count} líneas.`);
}
