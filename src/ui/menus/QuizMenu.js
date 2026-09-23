/**
 * QuizMenu.js — Nueva aventura: test de personalidad, protagonista,
 * compañero y nombre del equipo. Al terminar, empieza la aventura en el pueblo.
 *
 * Escape en cualquier paso vuelve al título.
 */

import { GAME_STATES, TYPE_NAMES_ES } from '../../constants.js';
import { NATURES, pickQuestions, natureFromAnswers, partnerOptions } from '../../core/Personality.js';
import { startAdventure } from '../../core/TownSession.js';

/** Nombre del equipo que se propone si no se escribe otro. */
export const DEFAULT_TEAM_NAME = 'Equipo Aurora';
export const TEAM_NAME_MAX = 16;

/** @typedef {import('../UIManager.js').UIManager} UIManager */

/** @param {UIManager} ui */
export function openNewAdventure(ui) {
  const backToTitle = () => ui.game.changeState(GAME_STATES.TITLE);
  const html = `
    <div class="game-panel quiz-panel" style="width: 360px;">
      <h2 class="game-panel-title">UNA NUEVA AVENTURA</h2>
      <p class="quiz-text">
        Antes de empezar, responde con sinceridad a unas preguntas.
        Tu forma de ser decidirá quién eres en este mundo.
      </p>
      <div id="options-list">
        <div class="menu-option selected" data-index="0"><span class="cursor">▶</span> Empezar</div>
        <div class="menu-option" data-index="1"><span class="cursor">▶</span> Volver al título</div>
      </div>
    </div>`;
  ui.showMenu('quiz_intro', html, { onCancel: backToTitle });
  ui.menuOptions = [() => askQuestion(ui, pickQuestions(), 0, []), backToTitle];
  ui.selectedIndex = 0;
  ui.updateSelectionVisuals();
}

/**
 * @param {UIManager} ui
 * @param {ReturnType<typeof pickQuestions>} questions
 * @param {number} index
 * @param {Record<string, number>[]} answers - Puntuaciones elegidas hasta ahora
 */
function askQuestion(ui, questions, index, answers) {
  if (index >= questions.length) {
    showResult(ui, natureFromAnswers(answers));
    return;
  }
  const question = questions[index];
  const html = `
    <div class="game-panel quiz-panel" style="width: 380px;">
      <h2 class="game-panel-title">PREGUNTA ${index + 1} DE ${questions.length}</h2>
      <p class="quiz-text">${question.text}</p>
      <div id="options-list">
        ${question.answers
          .map((a, i) => `<div class="menu-option" data-index="${i}"><span class="cursor">▶</span> ${a.text}</div>`)
          .join('')}
      </div>
    </div>`;
  ui.showMenu('quiz_question', html, { onCancel: () => ui.game.changeState(GAME_STATES.TITLE) });
  ui.menuOptions = question.answers.map((a) => () => askQuestion(ui, questions, index + 1, [...answers, a.scores]));
  ui.selectedIndex = 0;
  ui.updateSelectionVisuals();
}

/**
 * @param {UIManager} ui
 * @param {typeof NATURES[number]} nature
 */
function showResult(ui, nature) {
  const species = speciesInfo(ui, nature.speciesId);
  const html = `
    <div class="game-panel quiz-panel" style="width: 380px; text-align: center;">
      <h2 class="game-panel-title">TU NATURALEZA: ${nature.name.toUpperCase()}</h2>
      <p class="quiz-text">${nature.description}</p>
      ${portrait(species)}
      <p class="quiz-text">Alguien como tú sería… <strong>¡${species.name}!</strong></p>
      <div id="options-list">
        <div class="menu-option selected" data-index="0"><span class="cursor">▶</span> ¡Seré ${species.name}!</div>
        <div class="menu-option" data-index="1"><span class="cursor">▶</span> Prefiero elegir yo</div>
      </div>
    </div>`;
  ui.showMenu('quiz_result', html, { onCancel: () => ui.game.changeState(GAME_STATES.TITLE) });
  ui.menuOptions = [() => choosePartner(ui, nature.speciesId), () => chooseHero(ui)];
  ui.selectedIndex = 0;
  ui.updateSelectionVisuals();
}

/** @param {UIManager} ui */
function chooseHero(ui) {
  const options = NATURES.map((n) => speciesInfo(ui, n.speciesId));
  pickSpecies(ui, 'quiz_pick_hero', '¿QUIÉN QUIERES SER?', options, (id) => choosePartner(ui, id));
}

/**
 * @param {UIManager} ui
 * @param {number} heroSpeciesId
 */
function choosePartner(ui, heroSpeciesId) {
  const options = partnerOptions(heroSpeciesId, ui.game.pokemonData).map((id) => speciesInfo(ui, id));
  pickSpecies(ui, 'quiz_partner', '¿QUIÉN SERÁ TU COMPAÑERO?', options, (id) => chooseTeamName(ui, heroSpeciesId, id), {
    note: 'Tu compañero no puede ser de tu mismo tipo.',
  });
}

/**
 * Lista de especies para elegir una.
 * @param {UIManager} ui
 * @param {string} type
 * @param {string} title
 * @param {ReturnType<typeof speciesInfo>[]} options
 * @param {(speciesId: number) => void} onPick
 * @param {{ note?: string }} [extra]
 */
function pickSpecies(ui, type, title, options, onPick, { note = '' } = {}) {
  const html = `
    <div class="game-panel quiz-panel" style="width: 380px;">
      <h2 class="game-panel-title">${title}</h2>
      ${note ? `<p class="quiz-note">${note}</p>` : ''}
      <div id="options-list" class="quiz-species-list">
        ${options
          .map(
            (s, i) => `
          <div class="menu-option" data-index="${i}">
            <span class="cursor">▶</span>
            <img src="${s.sprite}" alt="" width="24" height="24" style="image-rendering: pixelated;">
            <span style="flex-grow: 1;">${s.name}</span>
            <span class="quiz-types">${s.typesLabel}</span>
          </div>`,
          )
          .join('')}
      </div>
    </div>`;
  ui.showMenu(type, html, { onCancel: () => ui.game.changeState(GAME_STATES.TITLE) });
  ui.menuOptions = options.map((s) => () => onPick(s.id));
  ui.selectedIndex = 0;
  ui.updateSelectionVisuals();
}

/**
 * @param {UIManager} ui
 * @param {number} heroSpeciesId
 * @param {number} partnerSpeciesId
 */
function chooseTeamName(ui, heroSpeciesId, partnerSpeciesId) {
  const hero = speciesInfo(ui, heroSpeciesId);
  const partner = speciesInfo(ui, partnerSpeciesId);
  const html = `
    <div class="game-panel quiz-panel" style="width: 380px; text-align: center;">
      <h2 class="game-panel-title">EL NOMBRE DEL EQUIPO</h2>
      <div style="display: flex; justify-content: center; gap: 24px; margin: 6px 0 10px;">
        ${portrait(hero)}${portrait(partner)}
      </div>
      <p class="quiz-text">${hero.name} y ${partner.name} forman un equipo de exploración. ¿Cómo se llamará?</p>
      <input id="team-name-input" class="quiz-input" type="text" maxlength="${TEAM_NAME_MAX}"
        value="${DEFAULT_TEAM_NAME}" aria-label="Nombre del equipo" autocomplete="off" spellcheck="false">
      <div id="options-list">
        <div class="menu-option selected" data-index="0"><span class="cursor">▶</span> ¡Empezar la aventura!</div>
      </div>
    </div>`;
  const back = () => choosePartner(ui, heroSpeciesId);
  ui.showMenu('quiz_name', html, { onCancel: back });

  const input = /** @type {HTMLInputElement} */ (document.getElementById('team-name-input'));
  const start = () => {
    const teamName = input.value.trim().slice(0, TEAM_NAME_MAX) || DEFAULT_TEAM_NAME;
    ui.closeMenu();
    startAdventure(ui.game, { heroSpeciesId, partnerSpeciesId, teamName });
  };
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      start();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      back();
    }
  });
  ui.menuOptions = [start];
  ui.selectedIndex = 0;
  ui.updateSelectionVisuals();
  input.focus();
  input.select();
}

/**
 * @param {UIManager} ui
 * @param {number} speciesId
 */
function speciesInfo(ui, speciesId) {
  const data = ui.game.pokemonData.find((p) => p.id === speciesId);
  return {
    id: speciesId,
    name: data?.name ?? `#${speciesId}`,
    sprite: data?.sprite ?? '',
    typesLabel: (data?.types ?? []).map((t) => TYPE_NAMES_ES[t] || t).join('/'),
  };
}

/** @param {ReturnType<typeof speciesInfo>} species */
function portrait(species) {
  return `<img class="quiz-portrait" src="${species.sprite}" alt="${species.name}" width="64" height="64">`;
}
