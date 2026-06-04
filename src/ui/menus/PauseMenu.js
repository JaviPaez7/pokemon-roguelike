import { GAME_STATES } from '../../constants.js';
import { openInventoryMenu } from './InventoryMenus.js';
import { openTeamMenu } from './TeamMenus.js';
import { openOptionsMenu } from './OptionsMenu.js';

/** @param {import('../UIManager.js').UIManager} ui */
export function openPauseMenu(ui) {
  const html = `
    <div class="game-panel" style="width: 260px;">
      <h2 class="game-panel-title">PAUSA</h2>
      <div id="options-list">
        <div class="menu-option selected" data-index="0"><span class="cursor">▶</span> Continuar</div>
        <div class="menu-option" data-index="1"><span class="cursor">▶</span> Mochila</div>
        <div class="menu-option" data-index="2"><span class="cursor">▶</span> Equipo Pokémon</div>
        <div class="menu-option" data-index="3"><span class="cursor">▶</span> Opciones</div>
        <div class="menu-option" data-index="4"><span class="cursor">▶</span> Guardar y Salir</div>
      </div>
    </div>
  `;

  ui.showMenu('pause', html);

  ui.menuOptions = [
    () => ui.closeMenu(),
    () => openInventoryMenu(ui),
    () => openTeamMenu(ui),
    () => openOptionsMenu(ui),
    () => {
      ui.game.saveGameData();
      ui.showDialog('Partida guardada correctamente.', () => {
        ui.game.changeState(GAME_STATES.TITLE);
      });
    }
  ];
  ui.selectedIndex = 0;
  ui.updateSelectionVisuals();
}
