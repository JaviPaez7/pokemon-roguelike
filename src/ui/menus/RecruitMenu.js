import { GAME_STATES, MAX_PARTY_SIZE, TYPE_NAMES_ES } from '../../constants.js';

/**
 * Pregunta si un Pokémon que quiere unirse entra en el equipo.
 *
 * @param {import('../UIManager.js').UIManager} ui
 * @param {number} entityId - ID de la entidad
 * @param {Object} info - Información del Pokémon
 * @param {((accepted: boolean) => void) | null} [onAnswer] - Quién atiende la respuesta;
 *   si no se da, se emite `recruit_pokemon` (reclutamiento normal)
 */
export function openRecruitMenu(ui, entityId, info, onAnswer = null) {
  const game = ui.game;
  const fighter = game.entityManager.getComponent(entityId, 'fighter');
  const types = (info.types || []).map(t => TYPE_NAMES_ES[t] || t).join('/');
  const hpLine = fighter ? `Nv.${info.level} · ${types} · ${fighter.hp}/${fighter.maxHp} PS` : `Nv.${info.level}`;
  const full = game.entityManager.getEntitiesWithComponents('partyMember').length >= MAX_PARTY_SIZE;
  const where = full ? '<br>El equipo está completo: os esperará en la base.' : '';

  const html = `
    <div class="game-panel" style="width: 300px; margin: auto; transform: translateY(40px);">
      <h2 class="game-panel-title">¿RECLUTAR A ${info.name.toUpperCase()}?</h2>
      <p style="margin-bottom: 6px; font-size: 7px; color: var(--text-secondary); text-align:center;">${hpLine}</p>
      <p style="margin-bottom: 10px; font-size: 11px; line-height: 1.4;">${info.name} quiere unirse a vuestro equipo.${where}</p>
      <div id="options-list">
        <div class="menu-option selected" data-index="0"><span class="cursor">▶</span> Sí</div>
        <div class="menu-option" data-index="1"><span class="cursor">▶</span> No</div>
      </div>
    </div>
  `;

  game.changeState(GAME_STATES.MENU);
  // Hay que responder: Escape no cierra la pregunta
  ui.showMenu('recruit_menu', html, { onCancel: () => {} });

  // closeMenu devuelve el juego a exploración; el diálogo de respuesta se abre después
  const answer = (accepted) => () => {
    ui.closeMenu();
    if (onAnswer) onAnswer(accepted);
    else game.eventBus.emit('recruit_pokemon', { entityId, accepted });
  };
  ui.menuOptions = [answer(true), answer(false)];

  ui.selectedIndex = 0;
  ui.updateSelectionVisuals();
}
