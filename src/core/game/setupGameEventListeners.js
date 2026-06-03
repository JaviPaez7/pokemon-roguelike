import { GAME_STATES, MAX_INVENTORY } from '../../constants.js';
import { pickupItem } from '../../systems/ItemSystem.js';

/**
 * Registra los listeners globales del EventBus en la instancia del juego.
 * @param {import('../Game.js').Game} game
 */
export function setupGameEventListeners(game) {
  game.eventBus.on('message', (data) => {
    const text = data.text || String(data);
    game._messageLog.push(text);
    if (game._messageLog.length > 50) {
      game._messageLog.shift();
    }
    game.needsRender = true;
  });

  game.eventBus.on('pokemon_fainted', (data) => {
    if (data.entityId === game._playerId) {
      game.gameOver();
    } else {
      if (game.entityManager.hasComponent(data.entityId, 'aiControlled')) {
        game.stats.pokemonDefeated++;
      }
      game.turnManager.removeEntity(data.entityId);
      game.entityManager.destroyEntity(data.entityId);
      game.needsRender = true;
    }
  });

  game.eventBus.on('floor_change', (data) => {
    game.floorManager.changeFloor(data.direction || 'down');
  });

  game.eventBus.on('item_picked_up', (data) => {
    const result = pickupItem(
      data.entityId,
      data.itemEntity,
      game.entityManager,
      game.inventory,
      MAX_INVENTORY
    );
    game.eventBus.emit('message', result.message);
    game.needsRender = true;
  });

  game.eventBus.on('ui_action', (data) => {
    switch (data.action) {
      case 'pause_menu':
        if (game._state === GAME_STATES.EXPLORING) {
          game.changeState(GAME_STATES.MENU);
        } else if (game._state === GAME_STATES.MENU) {
          game.changeState(GAME_STATES.EXPLORING);
        }
        break;
      case 'select_move':
        if (game._playerId) {
          const info = game.entityManager.getComponent(game._playerId, 'pokemonInfo');
          if (info && info.currentMoves && info.currentMoves[data.index]) {
            game._selectedMoveIndex = data.index;
            const move = game.movesData.find(m => m.id === info.currentMoves[data.index].moveId);
            if (move) {
              game.eventBus.emit('message', `Ataque listo: ${move.name} (${info.currentMoves[data.index].currentPP}/${info.currentMoves[data.index].maxPP} PP)`);
            }
          }
        }
        break;
    }
  });
}
