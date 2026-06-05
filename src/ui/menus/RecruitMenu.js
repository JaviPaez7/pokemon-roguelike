import { GAME_STATES } from '../../constants.js';

/**
 * Abre el menú de confirmación para reclutar un Pokémon derrotado.
 * 
 * @param {import('../UIManager.js').UIManager} ui
 * @param {number} entityId - ID de la entidad
 * @param {Object} info - Información del Pokémon
 */
export function openRecruitMenu(ui, entityId, info) {
  const html = `
    <div class="game-panel" style="width: 300px; margin: auto; transform: translateY(40px);">
      <h2 class="game-panel-title">¡Reclutar a ${info.name}!</h2>
      <p style="margin-bottom: 10px; font-size: 14px;">¡${info.name} está asombrado por tu fuerza! ¿Quieres que se una a tu equipo?</p>
      <div id="options-list">
        <div class="menu-option selected" data-index="0"><span class="cursor">▶</span> Sí</div>
        <div class="menu-option" data-index="1"><span class="cursor">▶</span> No</div>
      </div>
    </div>
  `;

  ui.showMenu('recruit_menu', html);

  ui.menuOptions = [
    // SÍ
    () => {
      ui.closeMenu();
      ui.game.eventBus.emit('recruit_pokemon', { entityId, accepted: true });
      ui.game.changeState(GAME_STATES.EXPLORING);
    },
    // NO
    () => {
      ui.closeMenu();
      ui.game.eventBus.emit('recruit_pokemon', { entityId, accepted: false });
      ui.game.changeState(GAME_STATES.EXPLORING);
    }
  ];

  ui.selectedIndex = 0;
  ui.updateSelectionVisuals();
}
