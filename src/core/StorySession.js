/**
 * StorySession.js — Muestra la historia en la partida: busca las escenas que
 * tocan con cada evento del juego (core/Story.js) y las enseña como diálogos
 * con el nombre y el retrato de quien habla.
 *
 * Quien dispara un evento llama a `playStory` con lo que ha pasado y, si
 * quiere seguir después, con `onDone`. Si no hay escena, `onDone` se llama en
 * el momento. Las escenas se apuntan como vistas al empezar, así que salen una
 * sola vez aunque se cierre el juego a medias.
 */

import { getMember } from './Profile.js';
import {
  ensureStory,
  storyChapter,
  scenesFor,
  sceneLines,
  markSeen,
  applyStoryEffect,
  npcTalk,
  npcGreeting,
  npcAbsent,
} from './Story.js';

/**
 * Protagonista, compañero y nombre del equipo de la partida.
 * @param {import('./Game.js').Game} game
 * @returns {import('./Story.js').Cast}
 */
export function storyCast(game) {
  const profile = game.profile;
  const member = (uid) => {
    const m = getMember(profile, uid);
    return m ? { name: m.name, speciesId: m.speciesId } : { name: '???', speciesId: 0 };
  };
  return { hero: member(profile.heroUid), partner: member(profile.partnerUid), teamName: profile.teamName };
}

/** @param {import('./Game.js').Game} game */
export function currentChapter(game) {
  return storyChapter(game.profile?.clearedDungeons ?? []);
}

/**
 * Reproduce las escenas que tocan con un evento.
 * @param {import('./Game.js').Game} game
 * @param {string | string[]} event - Uno o varios eventos que pasan a la vez
 * @param {import('./Story.js').StoryContext} [ctx]
 * @param {(() => void) | null} [onDone] - Al acabar (o enseguida, si no hay escena)
 * @returns {boolean} Si ha salido alguna escena
 */
export function playStory(game, event, ctx = {}, onDone = null) {
  const profile = game.profile;
  if (!profile || !game.uiManager) {
    onDone?.();
    return false;
  }
  const story = ensureStory(profile);
  const scenes = scenesFor(event, ctx, { seen: story.seen, chapter: currentChapter(game) });
  if (scenes.length === 0) {
    onDone?.();
    return false;
  }
  markSeen(profile, scenes.map((s) => s.id));
  for (const scene of scenes) for (const effect of scene.effects ?? []) applyStoryEffect(profile, effect);
  game.saveGameData();
  playScenes(game, scenes, onDone);
  return true;
}

/**
 * Muestra escenas una detrás de otra. Tras una escena con `then: 'credits'`
 * salen los créditos finales y luego las escenas de después de los créditos.
 * @param {import('./Game.js').Game} game
 * @param {import('./Story.js').Scene[]} scenes
 * @param {(() => void) | null} onDone
 */
function playScenes(game, scenes, onDone) {
  const [scene, ...rest] = scenes;
  if (!scene) {
    onDone?.();
    return;
  }
  const ui = game.uiManager;
  const next = () => playScenes(game, rest, onDone);
  const afterScene =
    scene.then === 'credits'
      ? () =>
          ui.openEndingCredits(() => {
            // Los créditos son un menú: se cierran antes de la escena final
            ui.closeMenu();
            playStory(game, 'credits_end', {}, next);
          })
      : next;
  showLines(game, sceneLines(scene, storyCast(game)), afterScene, { backdrop: scene.backdrop });
}

/**
 * @param {import('./Game.js').Game} game
 * @param {import('./Story.js').ShownLine[]} lines
 * @param {() => void} onDone
 * @param {{ backdrop?: string }} [options]
 */
function showLines(game, lines, onDone, { backdrop } = {}) {
  if (lines.length === 0) {
    onDone();
    return;
  }
  lines.forEach((line, i) => {
    game.uiManager.showDialog(line.text, i === lines.length - 1 ? onDone : null, false, {
      speaker: line.speaker ?? undefined,
      portrait: line.portrait ?? undefined,
      backdrop,
    });
  });
}

/**
 * Lo que dice Slowpoke o Pidgey en este capítulo, si tiene frase de historia.
 * @param {import('./Game.js').Game} game
 * @param {string} npcId
 * @returns {boolean} Si ha dicho algo
 */
export function storyTalk(game, npcId) {
  const lines = npcTalk(npcId, currentChapter(game));
  if (!lines) return false;
  const cast = storyCast(game);
  showLines(game, sceneLines({ lines }, cast), () => {});
  return true;
}

/**
 * Kecleon, Kangaskhan o Persian saludan (una vez por capítulo) y después se
 * abre su menú.
 * @param {import('./Game.js').Game} game
 * @param {string} npcId
 * @param {() => void} then
 */
export function storyGreet(game, npcId, then) {
  const profile = game.profile;
  const greeting = npcGreeting(npcId, currentChapter(game), ensureStory(profile).seen);
  if (!greeting) {
    then();
    return;
  }
  markSeen(profile, [greeting.id]);
  showLines(game, sceneLines(greeting, storyCast(game)), then);
}

/**
 * Si un vecino está fuera del pueblo ahora.
 * @param {import('./Game.js').Game} game
 * @param {string} npcId
 */
export function isNpcAway(game, npcId) {
  return !!game.profile && npcAbsent(npcId, currentChapter(game));
}

/**
 * El equipo acaba de llegar a un piso: escenas de pisos intermedios y del
 * piso del jefe. El piso 1 no cuenta: su escena sale al entrar en la mazmorra,
 * detrás de la presentación.
 * @param {import('./Game.js').Game} game
 */
export function onFloorEntered(game) {
  if (!game.dungeonId) return;
  const floor = game.getCurrentFloor();
  const events = floor > 1 ? ['floor_enter'] : [];
  const bossHere = game.entityManager.getEntitiesWithComponents('isBoss').length > 0;
  if (bossHere) events.push('boss_floor');
  if (events.length) playStory(game, events, { dungeonId: game.dungeonId, floor });
}
