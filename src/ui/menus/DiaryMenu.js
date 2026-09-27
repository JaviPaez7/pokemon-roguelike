/**
 * DiaryMenu.js — El Diario de la base: las escenas de la historia ya vistas,
 * por partes (prólogo, capítulos y final), para volver a verlas.
 */

import { GAME_STATES } from '../../constants.js';
import { diaryParts, ensureStory } from '../../core/Story.js';
import { replayScene } from '../../core/StorySession.js';

/** @typedef {import('../UIManager.js').UIManager} UIManager */

/**
 * @param {UIManager} ui
 * @param {{ type: string, title: string, text?: string, options: { label: string, action: () => void }[], selected?: number, onCancel: () => void }} menu
 */
function listMenu(ui, { type, title, text = '', options, selected = 0, onCancel }) {
  const html = `
    <div class="game-panel town-panel" style="width: 360px;">
      <h2 class="game-panel-title">${title}</h2>
      ${text ? `<p class="town-text">${text}</p>` : ''}
      <div id="options-list" class="town-options" style="max-height: 260px; overflow-y: auto;">
        ${options
          .map(
            (o, i) => `
          <div class="menu-option" data-index="${i}">
            <span class="cursor">▶</span>
            <span class="town-option-label">${o.label}</span>
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

/**
 * Partes del guion con escenas vistas.
 * @param {UIManager} ui
 * @param {() => void} back - Adónde volver (el menú de la base)
 * @param {number} [selected]
 */
export function openDiary(ui, back, selected = 0) {
  const parts = diaryParts(ensureStory(ui.game.profile).seen);
  if (parts.length === 0) {
    ui.showDialog('El diario está en blanco. La historia aún no ha empezado.', back);
    return;
  }
  listMenu(ui, {
    type: 'diary',
    title: 'DIARIO DEL EQUIPO',
    text: 'Las escenas que ya habéis vivido. Elige una para recordarla.',
    selected,
    onCancel: back,
    options: [
      ...parts.map((p, i) => ({ label: p.part, action: () => openDiaryPart(ui, p, back, i) })),
      { label: 'Volver', action: back },
    ],
  });
}

/**
 * Escenas vistas de una parte.
 * @param {UIManager} ui
 * @param {{ part: string, scenes: { id: string, title: string }[] }} part
 * @param {() => void} back
 * @param {number} partIndex - Para volver a la misma parte en la lista
 * @param {number} [selected]
 */
function openDiaryPart(ui, part, back, partIndex, selected = 0) {
  const toParts = () => openDiary(ui, back, partIndex);
  listMenu(ui, {
    type: 'diary_part',
    title: part.part.toUpperCase(),
    selected,
    onCancel: toParts,
    options: [
      ...part.scenes.map((scene, i) => ({
        label: scene.title,
        action: () => replayScene(ui.game, scene.id, () => openDiaryPart(ui, part, back, partIndex, i)),
      })),
      { label: 'Volver', action: toParts },
    ],
  });
}
