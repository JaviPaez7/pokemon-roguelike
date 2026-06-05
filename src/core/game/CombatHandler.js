import { ACTIONS, GAME_STATES } from '../../constants.js';
import { getEnemyAction } from '../../entities/EnemyAI.js';
import { executeMove, processStatusEffects, selectBestMove } from '../../combat/CombatSystem.js';
import { grantExperience } from '../../systems/ExperienceSystem.js';
import { checkEvolution, evolve } from '../../systems/EvolutionSystem.js';
import { triggerTrap } from '../../systems/TrapSystem.js';

/**
 * Combate, movimiento de entidades y acciones de IA enemiga.
 */
export class CombatHandler {
  /** @param {import('../Game.js').Game} game */
  constructor(game) {
    this.game = game;
  }

  getEnemyAIAction(entityId) {
    const game = this.game;
    if (!game.tileMap || !game._playerId) return null;

    const playerPos = game.entityManager.getComponent(game._playerId, 'position');
    if (!playerPos) return null;

    const action = getEnemyAction(entityId, game.entityManager, game.tileMap, playerPos, game._playerId, game);

    if (action && action.type === 'attack') {
      return { type: ACTIONS.ATTACK, targetId: action.targetId };
    }

    if (action && action.type === 'move') {
      return { type: ACTIONS.MOVE, dx: action.dx, dy: action.dy };
    }

    if (action && action.type === 'wait') {
      return { type: ACTIONS.WAIT };
    }

    return action;
  }

  executeEntityAction(entityId, action) {
    const game = this.game;

    switch (action.type) {
      case ACTIONS.MOVE: {
        if (!game.tileMap) {
          return { success: false, type: 'blocked' };
        }

        const posComp = game.entityManager.getComponent(entityId, 'position');
        const oldX = posComp ? posComp.x : 0;
        const oldY = posComp ? posComp.y : 0;

        const result = game.movementSystem.tryMove(
          entityId, action.dx, action.dy,
          game.tileMap, game.entityManager
        );

        if (result.type === 'bump_attack') {
          if (entityId === game._playerId) {
            const isFriendly = game.entityManager.hasComponent(result.targetEntity, 'npcFriendly');
            const isMerchant = game.entityManager.hasComponent(result.targetEntity, 'npcMerchant');
            if (isFriendly) {
              this.handleFriendlyInteract(result.targetEntity);
              return { success: true, type: 'interacted' };
            } else if (isMerchant) {
              this.handleMerchantInteract(result.targetEntity);
              return { success: true, type: 'interacted' };
            }
          }
          return this.handleCombat(entityId, result.targetEntity);
        }

        if (result.type === 'stairs') {
          if (entityId === game._playerId) {
            const mewtwoAlive = game.entityManager.getEntitiesWithComponents('aiControlled').find(id => {
              const info = game.entityManager.getComponent(id, 'pokemonInfo');
              return info && info.name.includes('Mewtwo');
            });
            if (mewtwoAlive) {
              game.eventBus.emit('message', '¡Mewtwo te bloquea las escaleras!');
              return { success: false, type: 'blocked' };
            }
            if (game._currentFloor === 50) {
              game.changeState(GAME_STATES.VICTORY);
              return { success: true, type: 'victory' };
            }
            game.eventBus.emit('floor_change', { direction: 'down' });
          }
          return result;
        }

        if (result.type === 'pickup') {
          if (entityId === game._playerId) {
            game.eventBus.emit('item_picked_up', {
              entityId,
              itemEntity: result.itemEntity
            });
          }
          if (result.isTrap && result.trapEntity) {
            const msgs = triggerTrap(entityId, result.trapEntity, game.entityManager, game.tileMap);
            for (const msg of msgs) game.eventBus.emit('message', msg);
          }
          return result;
        }

        if (result.type === 'trap' && result.trapEntity) {
          const msgs = triggerTrap(entityId, result.trapEntity, game.entityManager, game.tileMap);
          for (const msg of msgs) game.eventBus.emit('message', msg);
          return result;
        }

        return result;
      }

      case ACTIONS.WAIT: {
        const fighter = game.entityManager.getComponent(entityId, 'fighter');
        if (fighter && fighter.hp > 0 && fighter.hp < fighter.maxHp && Math.random() < 0.1) {
          fighter.hp = Math.min(fighter.maxHp, fighter.hp + 1);
          game.entityManager.setComponent(entityId, 'fighter', fighter);
        }
        return { success: true, type: 'waited' };
      }

      case ACTIONS.ATTACK:
        return this.handleCombat(entityId, action.targetId);

      case 'confirm':
        return this.handleConfirmAction(entityId);

      default:
        return { success: false, type: 'unknown_action' };
    }
  }

  handleConfirmAction(entityId) {
    const game = this.game;
    const pos = game.entityManager.getComponent(entityId, 'position');
    if (!pos) return { success: false, type: 'no_position' };

    const tile = game.tileMap.getTile(pos.x, pos.y);
    if (tile && tile.id === 3) {
      if (entityId === game._playerId) {
        if (game._currentFloor === 50) {
          game.changeState(GAME_STATES.VICTORY);
          return { success: true, type: 'victory' };
        }
        game.eventBus.emit('floor_change', { direction: 'down' });
      }
      return { success: true, type: 'stairs_used' };
    }

    const item = game.entityManager.getItemAt(pos.x, pos.y);
    if (item !== null) {
      game.eventBus.emit('item_picked_up', {
        entityId,
        itemEntity: item
      });
      return { success: true, type: 'picked_up' };
    }

    return { success: false, type: 'nothing_here' };
  }

  handleCombat(attackerId, defenderId) {
    const game = this.game;
    const attackerInfo = game.entityManager.getComponent(attackerId, 'pokemonInfo');
    const defenderInfo = game.entityManager.getComponent(defenderId, 'pokemonInfo');

    if (!attackerInfo || !defenderInfo) return { success: false };

    const status = processStatusEffects(attackerId, game.entityManager);
    if (status.messages) {
      for (const msg of status.messages) {
        game.eventBus.emit('message', msg);
      }
    }

    const attackerFighter = game.entityManager.getComponent(attackerId, 'fighter');
    if (attackerFighter && attackerFighter.hp <= 0) {
      game.eventBus.emit('message', `¡${attackerInfo.name} cayó víctima de su estado!`);
      const pos = game.entityManager.getComponent(attackerId, 'position');
      const sprite = game.entityManager.getComponent(attackerId, 'sprite');
      game.eventBus.emit('pokemon_fainted', {
        entityId: attackerId,
        speciesId: attackerInfo.speciesId,
        pos: pos ? { x: pos.x, y: pos.y } : null,
        spriteUrl: sprite ? sprite.url : '',
        attackerId: null // Murió por estado, nadie específico
      });
      game.needsRender = true;
      return { success: true, type: 'fainted_from_status' };
    }

    if (!status.canAct) {
      return { success: false, type: 'status_blocked' };
    }

    let moveSelected = null;
    if (attackerId === game._playerId) {
      const idx = game._selectedMoveIndex;
      const moveSlot = attackerInfo.currentMoves[idx] || attackerInfo.currentMoves[0];

      if (moveSlot && moveSlot.currentPP > 0) {
        moveSelected = game.movesData.find(m => m.id === moveSlot.moveId);
      } else {
        const validSlot = attackerInfo.currentMoves.find(m => m.currentPP > 0);
        if (validSlot) {
          moveSelected = game.movesData.find(m => m.id === validSlot.moveId);
        }
      }
    } else {
      const defenderFighter = game.entityManager.getComponent(defenderId, 'fighter');
      moveSelected = selectBestMove(attackerInfo, defenderInfo, game.movesData, game.typeChart, attackerFighter, defenderFighter);
    }

    if (!moveSelected) {
      moveSelected = {
        id: 165,
        name: 'Struggle',
        type: 'normal',
        power: 50,
        pp: 1,
        damageClass: 'physical',
        effect: 'recoil',
        description: 'Force'
      };
    }

    const combatResult = executeMove({
      attackerId,
      defenderId,
      move: moveSelected,
      entityManager: game.entityManager,
      typeChart: game.typeChart,
      eventBus: game.eventBus,
      currentWeather: game.currentWeather
    });

    if (combatResult.messages) {
      for (const msg of combatResult.messages) {
        game.eventBus.emit('message', msg);
      }
    }

    if (attackerId === game._playerId) {
      game.stats.totalDamageDealt += combatResult.damage;
    } else if (defenderId === game._playerId) {
      game.stats.totalDamageTaken += combatResult.damage;
    }

    if (combatResult.defenderFainted) {
      if (attackerId === game._playerId || game.entityManager.hasComponent(attackerId, 'partyMember')) {
        game.stats.pokemonDefeated++;
        const baseExp = defenderInfo.baseExp || 50;
        const xpGained = Math.max(1, Math.floor((baseExp * defenderInfo.level) / 5));

        // Ganar dinero por derrotar Pokémon enemigo
        const coinsGained = Math.floor(defenderInfo.level * (Math.random() * 3 + 3));
        game.coins = (game.coins || 0) + coinsGained;
        game.eventBus.emit('message', `¡Ganaste ${coinsGained} monedas Poké!`);

        const partyEntities = game.entityManager.getEntitiesWithComponents('partyMember');
        
        for (const memberId of partyEntities) {
          const mInfo = game.entityManager.getComponent(memberId, 'pokemonInfo');
          const mFighter = game.entityManager.getComponent(memberId, 'fighter');
          
          if (!mInfo || !mFighter || mFighter.hp <= 0) continue;

          const xpResult = grantExperience(mInfo, mFighter, xpGained, game.pokemonData, game.movesData);

          if (xpResult.messages) {
            for (const msg of xpResult.messages) {
              game.eventBus.emit('message', msg);
            }
          }

          if (xpResult.levelsGained > 0) {
            game.eventBus.emit('level_up', { entityId: memberId, newLevel: mInfo.level });

            const evo = checkEvolution(mInfo, game.evolutionsData);
            if (evo) {
              const evoResult = evolve(memberId, evo, game.entityManager, game.pokemonData, game.movesData);
              if (evoResult.messages && evoResult.messages.length > 0) {
                game.eventBus.emit('show_dialog', { text: evoResult.messages.join('\n') });
              }
            }
          }
        }
      }
    }

    game.needsRender = true;
    return { success: true, type: 'attacked' };
  }

  /**
   * Maneja la interacción con un Pokémon amigable.
   * @param {number} npcId - ID de la entidad
   */
  handleFriendlyInteract(npcId) {
    const game = this.game;
    const info = game.entityManager.getComponent(npcId, 'pokemonInfo');
    if (!info) return;

    const party = game.entityManager.getEntitiesWithComponents('partyMember');
    if (party.length < 4) {
      // Unirse al equipo
      game.entityManager.setComponent(npcId, 'partyMember', {
        slot: party.length,
        isLeader: false
      });

      // Asegurar que siga al líder
      game.entityManager.setComponent(npcId, 'aiControlled', {
        behavior: 'follower'
      });

      // Eliminar el flag npcFriendly
      game.entityManager.removeComponent(npcId, 'npcFriendly');

      // Registrar en el turnManager
      const fighter = game.entityManager.getComponent(npcId, 'fighter');
      game.turnManager.addEntity(npcId, fighter ? fighter.speed : 50, false);

      game.eventBus.emit('show_dialog', {
        text: `¡${info.name} está feliz de encontrarte!\n\n¡Se ha unido a tu equipo de exploración!`
      });
    } else {
      game.eventBus.emit('show_dialog', {
        text: `¡${info.name} te sonríe felizmente!\n\nSin embargo, tu equipo ya está lleno (máximo 4 Pokémon) y no puede acompañarte.`
      });
    }
  }

  /**
   * Maneja la interacción con el Kecleon Mercader.
   * @param {number} npcId - ID de la entidad
   */
  handleMerchantInteract(npcId) {
    const game = this.game;
    game.changeState(GAME_STATES.MENU);
    
    import('../../ui/menus/MerchantMenu.js').then(module => {
      module.openMerchantMenu(game.ui, npcId);
    });
  }
}
