/**
 * MusicSelect.js — Qué tema suena en cada momento. Lógica pura: recibe dónde
 * está el equipo y qué pasa (título, pueblo, mazmorra, piso de jefe, escena de
 * la historia, créditos) y devuelve el id de un tema de data/music.json.
 * Quien lo toca es audio/MusicManager.js; quien lo pide, core/MusicSession.js.
 *
 * Un lugar sin tema asignado (o con un tema que no existe) usa el de por
 * defecto: nunca falla.
 */

import musicData from '../data/music.json';
import { GAME_STATES } from '../constants.js';

/**
 * @typedef {'sine' | 'square' | 'sawtooth' | 'triangle'} Waveform
 * @typedef {{
 *   scale: string,
 *   tempo: number,
 *   waveform: Waveform,
 *   octave: number,
 *   melody?: (number | null)[],
 *   bass?: (number | null)[],
 *   density?: number,
 *   variation?: number,
 *   noteLength?: number
 * }} Theme
 * @typedef {{
 *   default: string,
 *   moods: Record<string, string>,
 *   triggers: Record<string, string>,
 *   scenes: Record<string, string>
 * }} StoryMusic
 * @typedef {{
 *   default: string,
 *   scales: Record<string, number[]>,
 *   places: {
 *     title?: string,
 *     town?: string,
 *     dungeons?: Record<string, string>,
 *     boss?: { default?: string, dungeons?: Record<string, string> },
 *     story?: StoryMusic,
 *     credits?: string
 *   },
 *   themes: Record<string, Theme>
 * }} MusicData
 * @typedef {{ id: string, triggers?: { on: string }[] }} SceneRef
 * @typedef {Object} MusicContext
 * @property {string | null} [state] - Estado del juego (GAME_STATES)
 * @property {boolean} [town] - Si el mapa es el pueblo
 * @property {string | null} [dungeonId] - Mazmorra en la que está el equipo
 * @property {boolean} [boss] - Si hay un jefe en pie en el piso
 * @property {SceneRef | null} [scene] - Escena de la historia que se está viendo
 * @property {boolean} [credits] - Si pasan los créditos finales
 */

/** @type {MusicData} */
export const MUSIC = musicData;

/** Formas de onda de los osciladores de Web Audio. */
export const WAVEFORMS = ['sine', 'square', 'sawtooth', 'triangle'];

/**
 * Tema que toca en este momento. Por prioridad: créditos, escena, título,
 * pueblo, jefe, mazmorra y, si no, el de por defecto.
 * @param {MusicContext} ctx
 * @param {MusicData} [data]
 * @returns {string} Id de un tema que existe
 */
export function selectTheme(ctx, data = MUSIC) {
  const places = data.places ?? {};
  let id;
  if (ctx.credits) id = places.credits;
  else if (ctx.scene) id = sceneTheme(ctx.scene, data);
  else if (ctx.state === GAME_STATES.TITLE || ctx.state === GAME_STATES.STARTER_SELECT) id = places.title;
  else if (ctx.town) id = places.town;
  else if (ctx.dungeonId && ctx.boss) id = places.boss?.dungeons?.[ctx.dungeonId] ?? places.boss?.default;
  else if (ctx.dungeonId) id = places.dungeons?.[ctx.dungeonId];
  return validTheme(id, data);
}

/**
 * Ambiente de una escena: el suyo propio o el de su disparador (tensión en el
 * piso del jefe, por ejemplo). `null` si no tiene: suena el tema general.
 * @param {SceneRef} scene
 * @param {MusicData} [data]
 * @returns {string | null}
 */
export function sceneMood(scene, data = MUSIC) {
  const story = data.places?.story;
  if (!story) return null;
  const own = story.scenes?.[scene.id];
  if (own) return own;
  for (const trigger of scene.triggers ?? []) {
    const mood = story.triggers?.[trigger.on];
    if (mood) return mood;
  }
  return null;
}

/**
 * @param {SceneRef} scene
 * @param {MusicData} data
 * @returns {string | undefined}
 */
function sceneTheme(scene, data) {
  const story = data.places?.story;
  const mood = sceneMood(scene, data);
  return (mood && story?.moods?.[mood]) || story?.default;
}

/**
 * El tema pedido si existe; si no, el de por defecto (o el primero, si los
 * datos no tienen uno válido).
 * @param {string | null | undefined} id
 * @param {MusicData} [data]
 * @returns {string}
 */
export function validTheme(id, data = MUSIC) {
  if (id && data.themes[id]) return id;
  if (data.themes[data.default]) return data.default;
  return Object.keys(data.themes)[0];
}

/**
 * Parámetros de un tema (los del de por defecto si no existe).
 * @param {string} id
 * @param {MusicData} [data]
 * @returns {Theme}
 */
export function themeConfig(id, data = MUSIC) {
  return data.themes[validTheme(id, data)];
}

/**
 * Notas de una escala; si no existe, la primera.
 * @param {string} name
 * @param {MusicData} [data]
 * @returns {number[]}
 */
export function scaleNotes(name, data = MUSIC) {
  return data.scales[name] ?? Object.values(data.scales)[0];
}

/**
 * Nota MIDI de un grado de la escala. Los grados siguen por encima (7 es la
 * tónica una octava más arriba) y por debajo (-1, la séptima de la octava de
 * abajo).
 * @param {number[]} scale
 * @param {number} degree
 * @returns {number}
 */
export function noteForDegree(scale, degree) {
  const n = scale.length;
  const index = ((degree % n) + n) % n;
  return scale[index] + 12 * Math.floor(degree / n);
}

/**
 * Qué suena en un paso (corchea) de un patrón. Sin patrón, `null`: quien toca
 * decide (notas al azar en la melodía, la tónica en cada tiempo en el bajo).
 * @param {(number | null)[] | undefined} pattern
 * @param {number} step
 * @returns {number | null | undefined} Grado, `null` para silencio o `undefined` sin patrón
 */
export function patternStep(pattern, step) {
  if (!pattern?.length) return undefined;
  return pattern[step % pattern.length];
}
