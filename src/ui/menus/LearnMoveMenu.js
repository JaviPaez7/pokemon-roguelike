import { GAME_STATES } from '../../constants.js';

/**
 * Abre el menú para aprender un nuevo movimiento cuando se tienen 4 movimientos aprendidos.
 * 
 * @param {import('../UIManager.js').UIManager} ui
 * @param {number} pokemonId - ID de la entidad Pokémon
 * @param {Object} pendingMove - Movimiento a aprender { moveId, moveName }
 */
export function openLearnMoveMenu(ui, pokemonId, pendingMove) {
  const info = ui.game.entityManager.getComponent(pokemonId, 'pokemonInfo');
  const moves = info.currentMoves || [];
  
  const moveData = ui.game.movesData.find(m => m.id === pendingMove.moveId);
  const newType = moveData ? moveData.type : 'normal';

  let html = `
    <div class="game-panel" style="width: 360px;">
      <h2 class="game-panel-title">¡NUEVO MOVIMIENTO!</h2>
      <div style="font-size: 8px; line-height: 1.5; color: var(--text-primary); margin-bottom: 12px; text-align: center;">
        ¿Qué movimiento debe olvidar <strong>${info.name.toUpperCase()}</strong> para aprender <span class="type-badge ${newType}">${pendingMove.moveName}</span>?
      </div>
      <div id="options-list">
  `;

  // Mostrar los 4 movimientos actuales
  moves.forEach((slot, idx) => {
    const mData = ui.game.movesData.find(m => m.id === slot.moveId);
    const mName = mData ? mData.name : slot.moveId;
    const type = mData ? mData.type : 'normal';

    html += `
      <div class="menu-option" data-index="${idx}" style="flex-direction: column; align-items: flex-start; gap: 2px;">
        <div style="display: flex; justify-content: space-between; width: 100%;">
          <span><span class="cursor">▶</span> Olvidar <strong>${mName}</strong></span>
          <span class="type-badge ${type}">${type}</span>
        </div>
        <div style="font-size: 6px; color: var(--text-secondary); margin-left: 12px; display: flex; gap: 16px;">
          <span>PP: ${slot.currentPP}/${slot.maxPP}</span>
          <span>Pot: ${mData?.power || '—'}</span>
          <span>Prec: ${mData?.accuracy || '—'}</span>
        </div>
      </div>
    `;
  });

  // Opción de cancelar
  html += `
        <div class="menu-option" data-index="${moves.length}">
          <span class="cursor">▶</span> No aprender ${pendingMove.moveName}
        </div>
      </div>
    </div>
  `;

  ui.showMenu('learn_move', html);

  // Mapear opciones
  ui.menuOptions = moves.map((slot, idx) => {
    const mData = ui.game.movesData.find(m => m.id === slot.moveId);
    const mName = mData ? mData.name : slot.moveId;
    return () => {
      // Reemplazar el movimiento
      const newMoveData = ui.game.movesData.find(m => m.id === pendingMove.moveId);
      info.currentMoves[idx] = {
        moveId: pendingMove.moveId,
        currentPP: newMoveData.pp,
        maxPP: newMoveData.pp
      };
      ui.game.entityManager.setComponent(pokemonId, 'pokemonInfo', info);

      // Mostrar diálogo confirmación
      ui.showDialog(`¡${info.name} olvidó ${mName}...\n\n...y aprendió ${pendingMove.moveName}!`, () => {
        ui.closeMenu();
        ui.game.changeState(GAME_STATES.EXPLORING);
      });
    };
  });

  // Opción de cancelar
  ui.menuOptions.push(() => {
    ui.showDialog(`¡${info.name} no aprendió ${pendingMove.moveName}!`, () => {
      ui.closeMenu();
      ui.game.changeState(GAME_STATES.EXPLORING);
    });
  });

  ui.selectedIndex = 0;
  ui.updateSelectionVisuals();
}
