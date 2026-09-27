/**
 * MusicSession.js — Pone la música que toca según lo que pasa en la partida.
 * Mira dónde está el equipo, pide el tema a core/MusicSelect.js (lógica pura)
 * y se lo pasa a audio/MusicManager.js, que no lo reinicia si ya está sonando.
 *
 * Lo llaman el título (UIManager), el pueblo (TownSession), cada piso
 * (FloorManager), la caída del jefe (GameEvents), las escenas de la historia
 * (StorySession) y los créditos finales (CreditsMenu).
 */

import { selectTheme } from './MusicSelect.js';

/**
 * Dónde está el equipo, sin escena ni créditos.
 * @param {import('./Game.js').Game} game
 * @returns {import('./MusicSelect.js').MusicContext}
 */
export function placeContext(game) {
  const dungeonId = game.tileMap?.isTown ? null : (game.dungeonId ?? null);
  return {
    state: game.getState(),
    town: !!game.tileMap?.isTown,
    dungeonId,
    boss: !!dungeonId && game.entityManager.getEntitiesWithComponents('isBoss').length > 0,
  };
}

/**
 * La música del lugar: título, pueblo, mazmorra o jefe. Al acabar una escena
 * o los créditos, vuelve esta.
 * @param {import('./Game.js').Game} game
 */
export function playPlaceMusic(game) {
  play(game, selectTheme(placeContext(game)));
}

/**
 * La música de una escena de la historia (según su ambiente).
 * @param {import('./Game.js').Game} game
 * @param {import('./MusicSelect.js').SceneRef} scene
 */
export function playSceneMusic(game, scene) {
  play(game, selectTheme({ ...placeContext(game), scene }));
}

/**
 * La música de los créditos finales.
 * @param {import('./Game.js').Game} game
 */
export function playCreditsMusic(game) {
  play(game, selectTheme({ ...placeContext(game), credits: true }));
}

/**
 * @param {import('./Game.js').Game} game
 * @param {string} themeId
 */
function play(game, themeId) {
  game.uiManager?.music?.playTheme(themeId);
}
