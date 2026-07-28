import { GAME_STATES, TYPE_NAMES_ES } from '../../constants.js';

/**
 * Abre el menú para aprender un nuevo movimiento cuando se tienen 4 movimientos aprendidos.
 * 
 * @param {import('../UIManager.js').UIManager} ui
 * @param {number} pokemonId - ID de la entidad Pokémon
 * @param {Object} pendingMove - Movimiento a aprender { moveId, moveName }
 */
export function openLearnMoveMenu(ui, pokemonId, pendingMove) {
  ui.currentMenuType = 'learn_move';
  ui.game.changeState(GAME_STATES.MENU);
  const info = ui.game.entityManager.getComponent(pokemonId, 'pokemonInfo');
  if (!info || !pendingMove) {
    ui.showDialog('No hay movimiento pendiente.', () => {
      ui.closeMenu();
      ui.game.changeState(GAME_STATES.EXPLORING);
    });
    return;
  }
  const moves = info.currentMoves || [];
  const pokeName = (info.name || 'Pokémon').toUpperCase();
  const newMoveName = (pendingMove.moveName || pendingMove.name) || 'movimiento';
  
  const moveData = ui.game.movesData.find(m => m.id === pendingMove.moveId);
  const newType = moveData ? moveData.type : 'normal';

  let html = `
    <div class="game-panel" style="width: 360px;">
      <h2 class="game-panel-title">¡NUEVO MOVIMIENTO!</h2>
      <div style="font-size: 8px; line-height: 1.5; color: var(--text-primary); margin-bottom: 12px; text-align: center;">
        ¿Qué movimiento debe olvidar <strong>${pokeName}</strong> para aprender <span class="type-badge ${newType}">${newMoveName}</span>?
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
          <span class="type-badge ${type}">${TYPE_NAMES_ES[type] || type}</span>
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
          <span class="cursor">▶</span> No aprender ${newMoveName}
        </div>
      </div>
    </div>
  `;

  ui.game.changeState(GAME_STATES.MENU);
  ui.showMenu('learn_move', html);
  ui._learnMovePokemonId = pokemonId;
  ui._learnMovePending = pendingMove;

  const dequeuePending = () => {
    const fresh = ui.game.entityManager.getComponent(pokemonId, 'pokemonInfo');
    if (!fresh || !fresh.pendingMovesToLearn) return;
    const idx = fresh.pendingMovesToLearn.findIndex(pm => pm.moveId === pendingMove.moveId);
    if (idx >= 0) fresh.pendingMovesToLearn.splice(idx, 1);
    else if (fresh.pendingMovesToLearn[0]?.moveId === pendingMove.moveId) {
      fresh.pendingMovesToLearn.shift();
    }
    ui.game.entityManager.setComponent(pokemonId, 'pokemonInfo', fresh);
  };

  // Mapear opciones
  ui.menuOptions = moves.map((slot, idx) => {
    const mData = ui.game.movesData.find(m => m.id === slot.moveId);
    const mName = mData ? mData.name : slot.moveId;
    return () => {
      const fresh = ui.game.entityManager.getComponent(pokemonId, 'pokemonInfo');
      const newMoveData = ui.game.movesData.find(m => m.id === pendingMove.moveId);
      if (!fresh || !newMoveData) {
        dequeuePending();
        ui.showDialog('No se pudo aprender ese movimiento.', () => {
          ui.closeMenu();
          ui.game.changeState(GAME_STATES.EXPLORING);
        });
        return;
      }
      const pp = newMoveData.pp || 20;
      fresh.currentMoves[idx] = {
        moveId: pendingMove.moveId,
        currentPP: pp,
        maxPP: pp,
        enabled: true
      };
      ui.game.entityManager.setComponent(pokemonId, 'pokemonInfo', fresh);
      dequeuePending();

      ui.showDialog(`¡${fresh.name} olvidó ${mName}...\n\n...y aprendió ${(pendingMove.moveName || pendingMove.name)}!`, () => {
        ui.closeMenu();
        ui.game.changeState(GAME_STATES.EXPLORING);
      });
    };
  });

  // Opción de cancelar (sí descarta este movimiento pendiente)
  ui.menuOptions.push(() => {
    dequeuePending();
    ui.showDialog(`¡${info.name} no aprendió ${(pendingMove.moveName || pendingMove.name)}!`, () => {
      ui.closeMenu();
      ui.game.changeState(GAME_STATES.EXPLORING);
    });
  });

  ui.selectedIndex = 0;
  ui.updateSelectionVisuals();
}
