/**
 * Story.js — La historia (H4): qué escena toca en cada momento y cómo se
 * muestra. Lógica pura: no toca la interfaz (eso es StorySession.js).
 *
 * Las escenas están en data/story.json, que se genera desde el guion
 * (docs/guion-historia.md) con `npm run story`. Cada escena dice con qué
 * eventos del juego salta (empezar la aventura, entrar en una mazmorra, llegar
 * al piso del jefe, derrotarlo, volver al pueblo…) y sale una sola vez: las
 * vistas se apuntan en `profile.story.seen`.
 *
 * El capítulo no se guarda: es 1 más el número de mazmorras de la historia
 * completadas (8 cuando ya están todas, tras el final).
 */

import storyData from '../data/story.json';
import { markMissionDone, storyMission } from './Missions.js';

export const STORY = storyData;

/** Capítulo de después del final (todas las mazmorras de la historia completadas). */
export const AFTER_ENDING = STORY.chapters.length + 1;

/**
 * @typedef {[string, string | null, string, ({ species: number } | { notSpecies: number })?]} StoryLine
 * @typedef {{ on: string, dungeon?: string, floor?: number, outcome?: string }} StoryTrigger
 * @typedef {{
 *   id: string,
 *   title: string,
 *   chapter: number,
 *   triggers: StoryTrigger[],
 *   when?: { chapter?: number },
 *   requires?: string[],
 *   effects?: string[],
 *   then?: 'credits',
 *   backdrop?: 'black',
 *   lines: StoryLine[]
 * }} Scene
 * @typedef {{ name: string, speciesId: number }} CastMember
 * @typedef {{ hero: CastMember, partner: CastMember, teamName: string }} Cast
 * @typedef {{ text: string, speaker: string | null, portrait: { speciesId: number, emotion: string } | null }} ShownLine
 * @typedef {{ dungeonId?: string, floor?: number, outcome?: string }} StoryContext
 */

/**
 * Estado de la historia del perfil; lo crea si falta.
 * @param {Object} profile
 * @returns {{ seen: string[] }}
 */
export function ensureStory(profile) {
  if (!profile.story || !Array.isArray(profile.story.seen)) profile.story = { seen: [] };
  return profile.story;
}

/**
 * @param {string[]} clearedDungeons
 * @param {typeof STORY} [data]
 * @returns {number} 1 a 7 durante la historia; 8 tras completar el Laboratorio Final
 */
export function storyChapter(clearedDungeons, data = STORY) {
  return 1 + data.chapters.filter((id) => clearedDungeons.includes(id)).length;
}

/**
 * @param {StoryTrigger} trigger
 * @param {string[]} events
 * @param {StoryContext} ctx
 */
function triggerMatches(trigger, events, ctx) {
  return (
    events.includes(trigger.on) &&
    (trigger.dungeon === undefined || trigger.dungeon === ctx.dungeonId) &&
    (trigger.floor === undefined || trigger.floor === ctx.floor) &&
    (trigger.outcome === undefined || trigger.outcome === ctx.outcome)
  );
}

/**
 * Escenas que tocan ahora, en el orden del guion. Se evalúan todas con las
 * escenas vistas hasta este momento: una escena que pide otra (`requires`) no
 * sale en el mismo evento que la que necesita.
 * @param {string | string[]} event - Uno o varios eventos que pasan a la vez
 * @param {StoryContext} ctx
 * @param {{ seen: string[], chapter: number }} state
 * @param {typeof STORY} [data]
 * @returns {Scene[]}
 */
export function scenesFor(event, ctx, { seen, chapter }, data = STORY) {
  const events = Array.isArray(event) ? event : [event];
  const seenSet = new Set(seen);
  return data.scenes.filter(
    (scene) =>
      !seenSet.has(scene.id) &&
      (scene.when?.chapter === undefined || scene.when.chapter === chapter) &&
      (scene.requires ?? []).every((id) => seenSet.has(id)) &&
      scene.triggers.some((t) => triggerMatches(t, events, ctx)),
  );
}

/**
 * Si una línea sale con este equipo (variantes por especie).
 * @param {StoryLine} line
 * @param {Cast} cast
 */
export function lineApplies(line, cast) {
  const condition = line[3];
  if (!condition) return true;
  const team = [cast.hero?.speciesId, cast.partner?.speciesId];
  if ('species' in condition) return team.includes(condition.species);
  if ('notSpecies' in condition) return !team.includes(condition.notSpecies);
  return true;
}

/**
 * Sustituye los marcadores del guion por los nombres de la partida.
 * @param {string} text
 * @param {Cast} cast
 */
export function fillText(text, cast) {
  return text
    .replaceAll('{héroe}', cast.hero.name)
    .replaceAll('{compañero}', cast.partner.name)
    .replaceAll('{equipo}', cast.teamName);
}

/**
 * Texto, interlocutor y retrato de una línea.
 * @param {StoryLine} line
 * @param {Cast} cast
 * @param {typeof STORY} [data]
 * @returns {ShownLine}
 */
export function resolveLine(line, cast, data = STORY) {
  const [who, emotion, text, condition] = line;
  let person = data.speakers[who] ?? null;
  if (who === 'hero') person = cast.hero;
  else if (who === 'partner') person = cast.partner;
  else if (who === 'member') person = [cast.hero, cast.partner].find((m) => m?.speciesId === condition?.species) ?? null;
  return {
    text: fillText(text, cast),
    speaker: who === 'voice' ? '???' : (person?.name ?? null),
    portrait: person ? { speciesId: person.speciesId, emotion: emotion ?? 'Normal' } : null,
  };
}

/**
 * Líneas de una escena listas para mostrar, sin las que no tocan a este equipo.
 * @param {{ lines: StoryLine[] }} scene
 * @param {Cast} cast
 * @param {typeof STORY} [data]
 * @returns {ShownLine[]}
 */
export function sceneLines(scene, cast, data = STORY) {
  return scene.lines.filter((line) => lineApplies(line, cast)).map((line) => resolveLine(line, cast, data));
}

/**
 * Lo que dice Slowpoke o Pidgey al hablarle en este capítulo.
 * @param {string} npcId
 * @param {number} chapter
 * @param {typeof STORY} [data]
 * @returns {StoryLine[] | null}
 */
export function npcTalk(npcId, chapter, data = STORY) {
  return data.npcTalk[npcId]?.[chapter] ?? null;
}

/**
 * Saludo de Kecleon, Kangaskhan o Persian antes de su menú: una vez por capítulo.
 * @param {string} npcId
 * @param {number} chapter
 * @param {string[]} seen
 * @param {typeof STORY} [data]
 * @returns {{ id: string, lines: StoryLine[] } | null}
 */
export function npcGreeting(npcId, chapter, seen, data = STORY) {
  const lines = data.npcGreet[npcId]?.[chapter];
  const id = `saludo:${npcId}:${chapter}`;
  if (!lines || seen.includes(id)) return null;
  return { id, lines };
}

/**
 * Si un vecino está fuera del pueblo en este capítulo (Slowpoke en el 5).
 * @param {string} npcId
 * @param {number} chapter
 * @param {typeof STORY} [data]
 */
export function npcAbsent(npcId, chapter, data = STORY) {
  return (data.absent[npcId] ?? []).includes(chapter);
}

/**
 * Apunta escenas como vistas.
 * @param {Object} profile
 * @param {string[]} ids
 */
export function markSeen(profile, ids) {
  const story = ensureStory(profile);
  for (const id of ids) if (!story.seen.includes(id)) story.seen.push(id);
}

/**
 * Lo que cambia una escena en el perfil.
 * - `letter_mission`: apunta el encargo del sobre sin remite (si no lo estaba).
 * - `deliver_letter`: el sobre ha llegado a Raichu; se cobra al volver.
 * @param {Object} profile
 * @param {string} effect
 * @param {typeof STORY} [data]
 */
export function applyStoryEffect(profile, effect, data = STORY) {
  const spec = data.letterMission;
  switch (effect) {
    case 'letter_mission':
      if (!profile.missions.accepted.some((m) => m.id === spec.id)) profile.missions.accepted.push(storyMission(spec));
      break;
    case 'deliver_letter':
      markMissionDone(profile, spec.id);
      break;
    default:
      throw new Error(`Efecto de historia desconocido: ${effect}`);
  }
}

/**
 * Escenas que ya habría visto quien tiene estas mazmorras completadas: las de
 * los capítulos anteriores al suyo. Para las partidas de antes de la historia
 * (migración v4 → v5), que siguen desde su capítulo.
 * @param {string[]} clearedDungeons
 * @param {typeof STORY} [data]
 * @returns {string[]}
 */
export function seenForCleared(clearedDungeons, data = STORY) {
  const chapter = storyChapter(clearedDungeons, data);
  return data.scenes.filter((scene) => scene.chapter < chapter).map((scene) => scene.id);
}
