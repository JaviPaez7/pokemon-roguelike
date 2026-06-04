import { GAME_STATES } from '../../constants.js';
import { openStatsMenu } from './StatsMenu.js';

/** @param {import('../UIManager.js').UIManager} ui */
export function openTitleScreen(ui) {
  let hasSave = false;
  try {
    hasSave = localStorage.getItem('pokerogue_save') !== null;
  } catch (e) {
    console.warn('localStorage no está disponible:', e);
  }

  const html = `
    <div class="game-panel" style="text-align: center; width: 340px;">
      <h1 class="loading-title" style="margin-bottom: 20px; font-size: 24px;">POKÉROGUE</h1>
      <p style="font-size: 8px; color: var(--text-secondary); margin-bottom: 30px; line-height: 1.5;">Roguelike de Pokémon</p>
      
      <div id="options-list">
        <div class="menu-option selected" data-index="0">
          <span class="cursor">▶</span> Nueva Partida
        </div>
        <div class="menu-option ${hasSave ? '' : 'hidden'}" data-index="1" style="opacity: ${hasSave ? 1 : 0.5};">
          <span class="cursor">▶</span> Continuar Run
        </div>
        <div class="menu-option" data-index="2">
          <span class="cursor">▶</span> Estadísticas
        </div>
        <div class="menu-option" data-index="3">
          <span class="cursor">▶</span> Controles
        </div>
      </div>
    </div>
  `;

  ui.showMenu('title', html);

  ui.menuOptions = [
    () => ui.game.changeState(GAME_STATES.STARTER_SELECT),
    () => {
      if (hasSave) {
        ui.game.loadSavedGame();
      }
    },
    () => openStatsMenu(ui, 'title'),
    () => showControlsDialog(ui)
  ];
  ui.selectedIndex = 0;
  ui.updateSelectionVisuals();
}

/** @param {import('../UIManager.js').UIManager} ui */
export function showControlsDialog(ui) {
  ui.showDialog(
    'Controles:\nWASD / Flechas / HJKL - Mover\nDiagonales: Tecl. Num. / YUBN / Inicio/Fin...\nZ - Confirmar / Interactuar / Escaleras\nX - Mochila / Volver\nC - Ver Equipo\n1,2,3,4 - Ataque rápido\nM - Mapa\nEsc - Pausa',
    () => openTitleScreen(ui)
  );
}
