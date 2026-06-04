import { ACTIONS, GAME_STATES } from '../../constants.js';
import { attemptCapture } from '../../combat/CaptureSystem.js';
import { useItem } from '../../systems/ItemSystem.js';

/**
 * Usa un objeto del inventario sobre un objetivo.
 * @param {import('../Game.js').Game} game
 * @param {string} itemId
 * @param {number} targetPokemonId
 */
export function useInventoryItem(game, itemId, targetPokemonId) {
  const itemData = game.itemsData.find(i => i.id === itemId);
  if (!itemData) return;

  game.stats.itemsUsed++;

  if (itemData.type === 'capture') {
    const targetFighter = game.entityManager.getComponent(targetPokemonId, 'fighter');
    const targetInfo = game.entityManager.getComponent(targetPokemonId, 'pokemonInfo');

    if (!targetFighter || !targetInfo) {
      game.eventBus.emit('message', 'No hay ningún Pokémon objetivo cerca.');
      return;
    }

    const captureResult = attemptCapture(targetFighter, targetInfo, itemData, game.pokemonData);

    game.eventBus.emit('capture_attempt', {
      targetId: targetPokemonId,
      shakes: captureResult.shakes,
      success: captureResult.success,
    });

    const slot = game.inventory.find(s => s.itemId === itemId);
    if (slot) {
      slot.quantity--;
      if (slot.quantity <= 0) {
        const idx = game.inventory.indexOf(slot);
        if (idx > -1) game.inventory.splice(idx, 1);
      }
    }

    game.eventBus.emit('show_dialog', {
      text: captureResult.messages.join('\n\n'),
      callback: () => {
        if (captureResult.success) {
          game.stats.pokemonCaptured++;

          const party = game.entityManager.getEntitiesWithComponents('partyMember');
          if (party.length < 4) {
            game.entityManager.setComponent(targetPokemonId, 'partyMember', {
              slot: party.length,
              isLeader: false
            });
            
            const ai = game.entityManager.getComponent(targetPokemonId, 'aiControlled') || {};
            ai.behavior = 'follower';
            game.entityManager.setComponent(targetPokemonId, 'aiControlled', ai);

            game.eventBus.emit('message', `¡${targetInfo.name} se ha unido a tu equipo!`);
          } else {
            game.eventBus.emit('message', `¡El equipo está lleno! ${targetInfo.name} fue liberado.`);
            game.entityManager.destroyEntity(targetPokemonId);
          }
        }
      }
    });
  } else {
    const result = useItem(itemId, targetPokemonId, game.entityManager, game.inventory, game.itemsData);
    for (const msg of result.messages) {
      game.eventBus.emit('message', msg);
    }

    if (itemData.type === 'escape' && result.success) {
      game.saveGameData();
      game.changeState(GAME_STATES.TITLE);
    }
  }

  game.turnManager.processTurn(
    { type: ACTIONS.WAIT },
    (id, act) => game.combat.executeEntityAction(id, act),
    (id) => game.combat.getEnemyAIAction(id)
  );
  game.needsRender = true;
}
