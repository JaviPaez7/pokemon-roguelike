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

      const isBoss = game.entityManager.hasComponent(data.entityId, 'boss');

      if (isBoss) {
        const targetInfo = game.entityManager.getComponent(data.entityId, 'pokemonInfo');
        const bossName = targetInfo ? targetInfo.name.replace('JEFE: ', '') : 'Jefe';
        
        // Spawn stairs
        if (game._stairsPos) {
          game.tileMap.setTile(game._stairsPos.x, game._stairsPos.y, 3); // 3 is STAIRS_DOWN
        }

        // Spawn a high-value reward item
        const pool = ['rare_candy', 'max_revive', 'full_restore', 'fire_stone', 'water_stone', 'thunder_stone', 'leaf_stone', 'moon_stone', 'golden_apple'];
        const selectedItem = pool[Math.floor(Math.random() * pool.length)];
        
        let dropX = game._stairsPos ? game._stairsPos.x : 10;
        let dropY = game._stairsPos ? game._stairsPos.y + 1 : 10;
        if (game.tileMap && !game.tileMap.isWalkable(dropX, dropY)) {
          dropX = game._stairsPos ? game._stairsPos.x - 1 : 10;
          dropY = game._stairsPos ? game._stairsPos.y : 10;
        }
        
        const itemDbInfo = game.itemsData ? game.itemsData.find(i => i.id === selectedItem) : null;
        const itemName = itemDbInfo ? itemDbInfo.name : selectedItem;

        game.entityManager.createItemEntity(selectedItem, 1, dropX, dropY);

        game.entityManager.destroyEntity(data.entityId);

        game.eventBus.emit('show_dialog', { 
          text: `¡El Jefe ${bossName} ha sido derrotado!\n\nLas escaleras han aparecido en el centro de la sala, y ha caído un objeto valioso: ¡${itemName}!` 
        });
        
        game.eventBus.emit('message', { 
          text: `¡Las escaleras y un ${itemName} aparecieron!`, 
          color: '#ffff00' 
        });

        game.saveGameData();
        game.needsRender = true;
        return;
      }

      // Reclutamiento Post-Combate
      const party = game.entityManager.getEntitiesWithComponents('partyMember');
      if (data.attackerId === game._playerId && Math.random() < 0.15 && party.length < 4) {
        const targetInfo = game.entityManager.getComponent(data.entityId, 'pokemonInfo');
        const targetFighter = game.entityManager.getComponent(data.entityId, 'fighter');
        
        if (targetInfo && targetFighter) {
          game.entityManager.setComponent(data.entityId, 'partyMember', {
            slot: party.length,
            isLeader: false,
            tactic: 'follow'
          });
          
          const ai = game.entityManager.getComponent(data.entityId, 'aiControlled') || {};
          ai.behavior = 'follower';
          game.entityManager.setComponent(data.entityId, 'aiControlled', ai);

          // Restaurar PS del nuevo aliado
          targetFighter.hp = Math.floor(targetFighter.maxHp * 0.5);

          game.stats.pokemonCaptured++;
          
          game.eventBus.emit('show_dialog', { text: `¡El ${targetInfo.name} enemigo está impresionado por tu fuerza!\n\n¡${targetInfo.name} se ha unido a tu equipo!` });
          game.eventBus.emit('message', { text: `¡${targetInfo.name} se unió al equipo!`, color: '#00ffcc' });
          game.saveGameData();
        } else {
          game.entityManager.destroyEntity(data.entityId);
        }
      } else {
        game.entityManager.destroyEntity(data.entityId);
      }
      
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
