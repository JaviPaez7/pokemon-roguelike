/**
 * MissionMenus.js — Tablón de misiones del pueblo, lista de tareas aceptadas y
 * la pregunta de volver al pueblo al cumplir una misión.
 */

import { GAME_STATES } from '../../constants.js';
import { getDungeon } from '../../core/Dungeons.js';
import {
  refreshBoard,
  acceptMission,
  abandonMission,
  describeMission,
  MAX_ACCEPTED,
  MISSION_TYPE_NAMES,
} from '../../core/Missions.js';

/** @typedef {import('../UIManager.js').UIManager} UIManager */
/** @typedef {import('../../core/Missions.js').Mission} Mission */

/**
 * @param {UIManager} ui
 * @param {{ type: string, title: string, text?: string, options: { label: string, hint?: string, action: () => void }[], selected?: number, onCancel: () => void, width?: number }} menu
 */
function listMenu(ui, { type, title, text = '', options, selected = 0, onCancel, width = 380 }) {
  const html = `
    <div class="game-panel town-panel" style="width: ${width}px;">
      <h2 class="game-panel-title">${title}</h2>
      ${text ? `<p class="town-text">${text}</p>` : ''}
      <div id="options-list" class="town-options">
        ${options
          .map(
            (o, i) => `
          <div class="menu-option" data-index="${i}">
            <span class="cursor">▶</span>
            <span class="town-option-label">${o.label}</span>
            ${o.hint ? `<span class="town-option-hint">${o.hint}</span>` : ''}
          </div>`,
          )
          .join('')}
      </div>
    </div>`;
  ui.game.changeState(GAME_STATES.MENU);
  ui.showMenu(type, html, { onCancel });
  ui.menuOptions = options.map((o) => o.action);
  ui.selectedIndex = Math.min(selected, options.length - 1);
  ui.updateSelectionVisuals();
}

/** @param {UIManager} ui */
function names(ui) {
  return {
    itemName: (id) => ui.game.itemsData.find((i) => i.id === id)?.name ?? id,
    dungeonName: (id) => getDungeon(id).name,
  };
}

/** @param {UIManager} ui @param {Mission} m */
function missionLabel(ui, m) {
  return `${m.difficulty} · ${MISSION_TYPE_NAMES[m.type]} · ${m.clientName}`;
}

/** @param {UIManager} ui @param {Mission} m */
function missionHint(ui, m) {
  const done = m.status === 'done' ? '✔ ' : '';
  return `${done}${names(ui).dungeonName(m.dungeonId)} P${m.floor}`;
}

/** @param {UIManager} ui @param {Mission} m */
function missionDetails(ui, m) {
  const n = names(ui);
  const reward = `${m.reward.money} Poké${m.reward.itemId ? ` + ${n.itemName(m.reward.itemId)}` : ''} · ${m.reward.rankPoints} puntos`;
  return `${describeMission(m, { dungeonName: n.dungeonName(m.dungeonId), itemName: n.itemName })}<br><br>Recompensa: ${reward}`;
}

// ─── Tablón ────────────────────────────────────────────────────────────────

/** @param {UIManager} ui @param {number} [selected] */
export function openMissionBoardMenu(ui, selected = 0) {
  const profile = ui.game.profile;
  refreshBoard(profile, ui.game.pokemonData);
  const { board, accepted } = profile.missions;
  listMenu(ui, {
    type: 'mission_board',
    title: 'TABLÓN DE MISIONES',
    text: `Día ${profile.day} · Misiones aceptadas: ${accepted.length}/${MAX_ACCEPTED} · Cumplidas: ${profile.missions.completed}`,
    selected,
    onCancel: () => ui.closeMenu(),
    options: [
      { label: 'Encargos del día', hint: `${board.length}`, action: () => openBoardList(ui) },
      { label: 'Misiones aceptadas', hint: `${accepted.length}/${MAX_ACCEPTED}`, action: () => openAcceptedList(ui, () => openMissionBoardMenu(ui, 1)) },
      { label: 'Salir', action: () => ui.closeMenu() },
    ],
  });
}

/** @param {UIManager} ui @param {number} [selected] */
function openBoardList(ui, selected = 0) {
  const board = ui.game.profile.missions.board;
  if (board.length === 0) {
    ui.showDialog('No quedan encargos hoy. Volved mañana.', () => openMissionBoardMenu(ui, 0));
    return;
  }
  listMenu(ui, {
    type: 'mission_board_list',
    title: 'ENCARGOS DEL DÍA',
    selected,
    onCancel: () => openMissionBoardMenu(ui, 0),
    options: [
      ...board.map((m, i) => ({ label: missionLabel(ui, m), hint: missionHint(ui, m), action: () => openBoardMission(ui, m, i) })),
      { label: 'Volver', action: () => openMissionBoardMenu(ui, 0) },
    ],
  });
}

/** @param {UIManager} ui @param {Mission} mission @param {number} index */
function openBoardMission(ui, mission, index) {
  listMenu(ui, {
    type: 'mission_board_detail',
    title: `${MISSION_TYPE_NAMES[mission.type].toUpperCase()} · ${mission.difficulty}`,
    text: missionDetails(ui, mission),
    onCancel: () => openBoardList(ui, index),
    options: [
      {
        label: 'Aceptar',
        action: () => {
          const result = acceptMission(ui.game.profile, mission.id);
          if (!result.ok) {
            ui.showDialog(result.error, () => openBoardList(ui, index));
            return;
          }
          ui.game.saveGameData();
          ui.showDialog(`Misión aceptada: ${mission.clientName} os espera en ${names(ui).dungeonName(mission.dungeonId)}, piso ${mission.floor}.`, () =>
            openBoardList(ui, Math.max(0, index - 1)),
          );
        },
      },
      { label: 'Volver', action: () => openBoardList(ui, index) },
    ],
  });
}

// ─── Misiones aceptadas ────────────────────────────────────────────────────

/**
 * @param {UIManager} ui
 * @param {() => void} back - A dónde vuelve Escape
 * @param {number} [selected]
 */
export function openAcceptedList(ui, back, selected = 0) {
  const accepted = ui.game.profile.missions.accepted;
  if (accepted.length === 0) {
    ui.showDialog('No tenéis misiones aceptadas. Mirad el tablón del pueblo.', back);
    return;
  }
  const inTown = !!ui.game.tileMap?.isTown;
  listMenu(ui, {
    type: 'mission_accepted_list',
    title: 'MISIONES ACEPTADAS',
    text: 'Las cumplidas (✔) se cobran al volver al pueblo.',
    selected,
    onCancel: back,
    options: [
      ...accepted.map((m, i) => ({
        label: missionLabel(ui, m),
        hint: missionHint(ui, m),
        action: () => openAcceptedMission(ui, m, back, i, inTown),
      })),
      { label: 'Volver', action: back },
    ],
  });
}

/**
 * @param {UIManager} ui
 * @param {Mission} mission
 * @param {() => void} back
 * @param {number} index
 * @param {boolean} canAbandon - Solo en el pueblo
 */
function openAcceptedMission(ui, mission, back, index, canAbandon) {
  const again = () => openAcceptedList(ui, back, index);
  listMenu(ui, {
    type: 'mission_accepted_detail',
    title: `${MISSION_TYPE_NAMES[mission.type].toUpperCase()} · ${mission.difficulty}`,
    text: missionDetails(ui, mission) + (mission.status === 'done' ? '<br><br>✔ Cumplida: se cobra en el pueblo.' : ''),
    onCancel: again,
    options: [
      ...(canAbandon && mission.status !== 'done'
        ? [
            {
              label: 'Abandonar',
              action: () => {
                abandonMission(ui.game.profile, mission.id);
                ui.game.saveGameData();
                // Sin misiones pendientes, volver sin encadenar otro diálogo
                const next = ui.game.profile.missions.accepted.length ? () => openAcceptedList(ui, back, 0) : back;
                ui.showDialog('Misión abandonada.', next);
              },
            },
          ]
        : []),
      { label: 'Volver', action: again },
    ],
  });
}

// ─── Volver tras cumplir ───────────────────────────────────────────────────

/** @param {UIManager} ui */
export function openMissionReturnPrompt(ui) {
  const html = `
    <div class="game-panel town-panel" style="width: 320px; text-align: center;">
      <h2 class="game-panel-title">¡MISIÓN CUMPLIDA!</h2>
      <p class="town-text">¿Volvéis al pueblo a cobrarla? Si seguís explorando y el equipo cae, habrá que repetirla.</p>
      <div id="options-list">
        <div class="menu-option selected" data-index="0"><span class="cursor">▶</span> Volver al pueblo</div>
        <div class="menu-option" data-index="1"><span class="cursor">▶</span> Seguir explorando</div>
      </div>
    </div>`;
  const keepGoing = () => ui.closeMenu();
  ui.game.changeState(GAME_STATES.MENU);
  ui.showMenu('mission_return', html, { onCancel: keepGoing });
  ui.menuOptions = [
    () => {
      ui.closeMenu();
      ui.game.endExpedition('mission');
    },
    keepGoing,
  ];
  ui.selectedIndex = 0;
  ui.updateSelectionVisuals();
}
