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
      game.entityManager.destroyEntity(data.entityId);
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
