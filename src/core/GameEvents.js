import { GAME_STATES, MAX_INVENTORY } from '../constants.js';
import { pickupItem } from '../systems/ItemSystem.js';

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
        // --- Lógica de Reclutamiento ---
        const attackerId = data.attackerId;
        if (attackerId !== null && attackerId !== undefined && game.entityManager.hasComponent(attackerId, 'partyMember')) {
          const enemyInfo = game.entityManager.getComponent(data.entityId, 'pokemonInfo');
          const leaderInfo = game.entityManager.getComponent(game._playerId, 'pokemonInfo');
          
          if (enemyInfo && leaderInfo && !enemyInfo.name.includes('JEFE:')) {
            // Probabilidad base de 15% + 1% por cada nivel de ventaja
            const levelDiff = Math.max(0, leaderInfo.level - enemyInfo.level);
            const recruitChance = 15 + levelDiff;
            
            if (Math.random() * 100 < recruitChance) {
              // Reclutamiento exitoso
              game.eventBus.emit('message', `¡${enemyInfo.name} se ha quedado impresionado por tu fuerza!`);
              game.eventBus.emit('message', `Acércate para que se una al equipo.`);
              
              // Mantener al enemigo vivo con 1 HP
              const fighter = game.entityManager.getComponent(data.entityId, 'fighter');
              if (fighter) {
                fighter.hp = 1;
                game.entityManager.setComponent(data.entityId, 'fighter', fighter);
              }
              
              // Cambiar de enemigo a NPC amigable
              game.entityManager.removeComponent(data.entityId, 'aiControlled');
              game.entityManager.setComponent(data.entityId, 'npcFriendly', {});
              
              // Lo sacamos del gestor de turnos, actuará cuando le hablemos
              game.turnManager.removeEntity(data.entityId);
              game.needsRender = true;
              return; // Importante: Salir para no destruir la entidad
            }
          }
        }
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

          // ¡Añadir al TurnManager para que pueda actuar!
          game.turnManager.addEntity(data.entityId, targetFighter.speed, false);

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

  game.eventBus.on('recruit_pokemon', (data) => {
    if (data.accepted) {
      const npcId = data.entityId;
      const info = game.entityManager.getComponent(npcId, 'pokemonInfo');
      const party = game.entityManager.getEntitiesWithComponents('partyMember');
      if (party.length < 4 && info) {
        game.entityManager.setComponent(npcId, 'partyMember', {
          slot: party.length,
          isLeader: false
        });
        game.entityManager.setComponent(npcId, 'aiControlled', { behavior: 'follower' });
        game.entityManager.removeComponent(npcId, 'npcFriendly');
        
        const fighter = game.entityManager.getComponent(npcId, 'fighter');
        game.turnManager.addEntity(npcId, fighter ? fighter.speed : 50, false);

        game.eventBus.emit('show_dialog', {
          text: `¡${info.name} se ha unido a tu equipo de exploración!`
        });
      }
    } else {
      game.entityManager.destroyEntity(data.entityId);
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
