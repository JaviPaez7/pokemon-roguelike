import { GAME_STATES } from '../../constants.js';
import { openStatsMenu } from './StatsMenu.js';
import { openCreditsMenu } from './CreditsMenu.js';
import { inspectSave, setAsideCorruptSave, backupBeforeNewGame } from '../../core/SaveManager.js';
import { getDungeon, relativeFloor } from '../../core/Dungeons.js';
import { rankFor } from '../../core/Profile.js';
import { TOWN } from '../../map/Town.js';

/** El aviso de partida más nueva se da una vez por carga, no cada vez que se vuelve al título. */
let newerSaveNoticeShown = false;

/** @param {import('../UIManager.js').UIManager} ui */
export function openTitleScreen(ui) {
  const save = inspectSave();
  const hasSave = save.status === 'ok';
  let saveHint = '';
  if (hasSave) {
    saveHint = describeSave(save.data);
  } else if (save.status === 'corrupt') {
    setAsideCorruptSave();
    setTimeout(() => {
      ui.showDialog('La partida guardada no se podía leer. Se ha apartado una copia y puedes empezar otra.', () => openTitleScreen(ui));
    }, 100);
  } else if (save.status === 'newer' && !newerSaveNoticeShown) {
    newerSaveNoticeShown = true;
    setTimeout(() => {
      ui.showDialog('Hay una partida guardada con una versión más nueva del juego. Recarga la página para actualizar; no se ha tocado.', () => openTitleScreen(ui));
    }, 100);
  }

  const html = `
    <div class="game-panel" style="text-align: center; width: 340px;">
      <h1 class="loading-title" style="margin-bottom: 20px; font-size: 24px;">POKÉROGUE</h1>
      <p style="font-size: 8px; color: var(--text-secondary); margin-bottom: 30px; line-height: 1.5;">Mundo Misterioso · 151 Pokémon</p>
      
      <div id="options-list">
        <div class="menu-option selected" data-index="0">
          <span class="cursor">▶</span> Nueva Partida
        </div>
        ${hasSave ? `
        <div class="menu-option" data-index="1" style="flex-direction: column; align-items: flex-start;">
          <span><span class="cursor">▶</span> Continuar partida</span>
          ${saveHint ? `<span style="font-size: 6px; color: var(--text-secondary); margin-left: 14px; margin-top: 2px;">${saveHint}</span>` : ''}
        </div>` : ''}
        <div class="menu-option" data-index="${hasSave ? 2 : 1}">
          <span class="cursor">▶</span> Estadísticas
        </div>
        <div class="menu-option" data-index="${hasSave ? 3 : 2}">
          <span class="cursor">▶</span> Cómo jugar
        </div>
        <div class="menu-option" data-index="${hasSave ? 4 : 3}">
          <span class="cursor">▶</span> Créditos
        </div>
      </div>
    </div>
  `;

  ui.showMenu('title', html);

  ui.menuOptions = [
    () => (hasSave ? confirmNewAdventure(ui) : ui.game.changeState(GAME_STATES.STARTER_SELECT)),
    ...(hasSave ? [() => ui.game.loadSavedGame()] : []),
    () => openStatsMenu(ui, 'title'),
    () => showControlsDialog(ui),
    () => openCreditsMenu(ui, () => openTitleScreen(ui)),
  ];
  ui.selectedIndex = 0;
  ui.updateSelectionVisuals();
}

/**
 * Resumen de una partida guardada para el título.
 * @param {Object} data - Partida en formato v3
 * @returns {string}
 */
function describeSave(data) {
  const { profile, run } = data;
  let where = TOWN.name;
  if (run) {
    const dungeon = getDungeon(run.dungeonId);
    where = `${dungeon.name} P${relativeFloor(dungeon, run.currentFloor)}`;
  }
  return `${profile.teamName} · Rango ${rankFor(profile.rankPoints).name} · ${where}`;
}

/**
 * Empezar otra aventura con una partida guardada: se pide confirmación y se
 * guarda una copia de la actual antes de sustituirla.
 * @param {import('../UIManager.js').UIManager} ui
 */
function confirmNewAdventure(ui) {
  const html = `
    <div class="game-panel" style="width: 320px; text-align: center;">
      <h2 class="game-panel-title">¿EMPEZAR DE CERO?</h2>
      <p class="town-text">Ya tienes un equipo guardado. Si empiezas otra aventura, esa partida se sustituye (se guarda una copia de seguridad).</p>
      <div id="options-list">
        <div class="menu-option selected" data-index="0"><span class="cursor">▶</span> No, volver</div>
        <div class="menu-option" data-index="1"><span class="cursor">▶</span> Sí, empezar otra</div>
      </div>
    </div>`;
  ui.showMenu('title_confirm_new', html, { onCancel: () => openTitleScreen(ui) });
  ui.menuOptions = [
    () => openTitleScreen(ui),
    () => {
      backupBeforeNewGame();
      ui.game.changeState(GAME_STATES.STARTER_SELECT);
    },
  ];
  ui.selectedIndex = 0;
  ui.updateSelectionVisuals();
}

/** @param {import('../UIManager.js').UIManager} ui */
export function showControlsDialog(ui) {
  ui.showDialog(
    'Controles:\nWASD / Flechas / HJKL - Mover (chocar = ataque básico sin PP)\nDiagonales: Tecl. Num. / YUBN / Inicio/Fin...\nMayús + dirección: correr · Ctrl + dirección: girarse sin moverse\nZ / Enter - Hablar / Recoger / Escaleras / Examinar\n1-4 - Movimientos (PP): delante, en línea, alrededor o a toda la sala\nX - Mochila  C - Equipo  Tab - Cambiar líder\nM - Mapa  Esc - Pausa / Guardar\nEn el pueblo: habla con los vecinos y sal por el sur hacia las mazmorras.\nSi el equipo cae, pierde el dinero y la mochila; el banco y el almacén no.\nEn móvil: D-pad + botones Z/X/C/Tab/M',
    () => openTitleScreen(ui)
  );
}
