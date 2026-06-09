import { GAME_STATES } from '../../constants.js';

/**
 * Abre el menú de confirmación para usar las escaleras.
 * 
 * @param {import('../UIManager.js').UIManager} ui
 */
export function openStairsMenu(ui) {
  const html = `
    <div class="game-panel" style="width: 240px; margin: auto; transform: translateY(40px);">
      <h2 class="game-panel-title">¿Ir al siguiente piso?</h2>
      <div id="options-list">
        <div class="menu-option selected" data-index="0"><span class="cursor">▶</span> Sí</div>
        <div class="menu-option" data-index="1"><span class="cursor">▶</span> No</div>
      </div>
    </div>
  `;

  ui.showMenu('stairs_menu', html);

  ui.menuOptions = [
    // SÍ
    () => {
      ui.closeMenu();
      ui.game.eventBus.emit('floor_change', { direction: 'down' });
    },
    // NO
    () => {
      ui.closeMenu();
      ui.game.changeState(GAME_STATES.EXPLORING);
    }
  ];

  ui.selectedIndex = 0;
  ui.updateSelectionVisuals();
}
