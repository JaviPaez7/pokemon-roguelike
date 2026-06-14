import { ACTIONS, GAME_STATES } from '../constants.js';
import { getEnemyAction } from '../entities/EnemyAI.js';
import { executeMove, processStatusEffects, selectBestMove } from './CombatSystem.js';
import { grantExperience } from './ExperienceSystem.js';
import { checkEvolution, evolve } from './EvolutionSystem.js';
import { triggerTrap } from './TrapSystem.js';

/**
 * Combate, movimiento de entidades y acciones de IA enemiga.
 */
export class CombatHandler {
  /** @param {import('../Game.js').Game} game */
  constructor(game) {
    this.setupGameEventListeners(game);
    this.game = game;
  }

  setupGameEventListeners(game) {
    // Si ya hay un listener similar, evitar duplicados idealmente
    // Aquí registramos la escucha del fin de turno
    game.eventBus.on('turn_end', (data) => this.handleTurnEnd(data));
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
          game.tileMap, game.entityManager, game.eventBus, game
        );

        if (result.success && entityId === game._playerId) {
          const pos = game.entityManager.getComponent(entityId, 'position');
          if (pos && game.tileMap.rooms) {
            for (const room of game.tileMap.rooms) {
              if (room.type === 'monster_house' && !room.monsterHouseTriggered) {
                if (pos.x >= room.x && pos.x < room.x + room.w && pos.y >= room.y && pos.y < room.y + room.h) {
                  room.monsterHouseTriggered = true;
                  game.floorManager.spawnMonsterHouse(room);
                }
              }
            }
          }
        }

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

        if (result.type === 'swap') {
          const targetPos = game.entityManager.getComponent(result.targetEntity, 'position');
          const entityPos = game.entityManager.getComponent(entityId, 'position');
          if (targetPos && entityPos) {
            const oldX = entityPos.x;
            const oldY = entityPos.y;

            entityPos.prevX = entityPos.x;
            entityPos.prevY = entityPos.y;
            entityPos.moveStartTime = performance.now();
            entityPos.x = targetPos.x;
            entityPos.y = targetPos.y;

            targetPos.prevX = targetPos.x;
            targetPos.prevY = targetPos.y;
            targetPos.moveStartTime = performance.now();
            targetPos.x = oldX;
            targetPos.y = oldY;
          }

          // Verificar si al intercambiar hemos caído sobre un objeto
          if (entityId === game._playerId) {
            const item = game.entityManager.getItemAt(entityPos.x, entityPos.y);
            if (item !== null) {
              game.eventBus.emit('item_picked_up', {
                entityId,
                itemEntity: item
              });
            }
          }

          return { success: true, type: 'swapped' };
        }

        if (result.type === 'stairs') {
          if (entityId === game._playerId) {
            const bossAlive = game.entityManager.getEntitiesWithComponents('isBoss');
            if (bossAlive && bossAlive.length > 0) {
              const bossInfo = game.entityManager.getComponent(bossAlive[0], 'pokemonInfo');
              const bossName = bossInfo ? bossInfo.name : 'Jefe';
              game.eventBus.emit('message', `¡El aura de ${bossName} te impide usar las escaleras!`);
              return { success: false, type: 'blocked' };
            }
            if (game._currentFloor === 50) {
              game.changeState(GAME_STATES.VICTORY);
              return { success: true, type: 'victory' };
            }
            game.uiManager.openStairsMenu();
            game.changeState(GAME_STATES.MENU);
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

        if (result.type === 'wonder_tile') {
          const fighter = game.entityManager.getComponent(entityId, 'fighter');
          const info = game.entityManager.getComponent(entityId, 'pokemonInfo');
          if (fighter && info) {
            fighter.statModifiers = {
              attack: 0,
              defense: 0,
              speed: 0,
              spAtk: 0,
              spDef: 0
            };
            game.entityManager.setComponent(entityId, 'fighter', fighter);
            game.eventBus.emit('message', `¡La Baldosa Mágica devolvió las estadísticas de ${info.name} a la normalidad!`);
          }
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
        const bossAlive = game.entityManager.getEntitiesWithComponents('isBoss');
        if (bossAlive && bossAlive.length > 0) {
          const bossInfo = game.entityManager.getComponent(bossAlive[0], 'pokemonInfo');
          const bossName = bossInfo ? bossInfo.name : 'Jefe';
          game.eventBus.emit('message', `¡El aura de ${bossName} te impide usar las escaleras!`);
          return { success: false, type: 'blocked' };
        }
        if (game._currentFloor === 50) {
          game.changeState(GAME_STATES.VICTORY);
          return { success: true, type: 'victory' };
        }
        game.uiManager.openStairsMenu();
        game.changeState(GAME_STATES.MENU);
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
      let reviverUsed = false;
      if (game.entityManager.hasComponent(attackerId, 'partyMember')) {
        const invIndex = game.inventory.findIndex(item => item.itemId === 'reviver_seed');
        if (invIndex !== -1) {
          reviverUsed = true;
          game.inventory[invIndex].quantity--;
          if (game.inventory[invIndex].quantity <= 0) {
            game.inventory.splice(invIndex, 1);
          }
          attackerFighter.hp = attackerFighter.maxHp;
          attackerFighter.belly = attackerFighter.maxBelly || 100;
          if (attackerInfo.currentMoves) attackerInfo.currentMoves.forEach(m => m.currentPP = m.maxPP);
          attackerFighter.statusEffects = [];
          game.eventBus.emit('message', `¡${attackerInfo.name} cayó víctima de su estado...`);
          game.eventBus.emit('message', `...pero revivió gracias a la Semilla Revivir!`);
          if (game.renderer && game.renderer.screenFlash) {
            game.renderer.screenFlash('rgba(0, 255, 0, 0.4)', 400);
          }
        }
      }

      if (!reviverUsed) {
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
      currentWeather: game.currentWeather,
      game: game
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
      game.uiManager.openRecruitMenu(npcId, info);
      game.changeState(GAME_STATES.MENU);
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
    game.uiManager.openMerchantMenu(npcId);
    game.changeState(GAME_STATES.MENU);
  }
  /**
   * Maneja el daño residual (estados alterados y clima) al final del turno.
   * Aplica sus efectos cada 10 turnos (ticks).
   */
  handleTurnEnd(data) {
    const { turnCount } = data;
    
    // Aplicar daño pasivo cada 10 turnos (pasos)
    if (turnCount % 10 !== 0) return;

    const game = this.game;
    if (!game || !game.entityManager) return;

    const fighters = game.entityManager.getEntitiesWithComponents('fighter', 'pokemonInfo');
    const weather = game.weatherSystem ? game.weatherSystem.currentWeather : 'normal';

    for (const entityId of fighters) {
      const fighter = game.entityManager.getComponent(entityId, 'fighter');
      const info = game.entityManager.getComponent(entityId, 'pokemonInfo');
      
      if (!fighter || fighter.hp <= 0) continue;

      let damageTaken = 0;
      let damageReason = '';

      // --- Daño por Estado ---
      if (fighter.statusEffects && fighter.statusEffects.length > 0) {
        if (fighter.statusEffects.some(s => s.type === 'poison')) {
          damageTaken += Math.max(1, Math.floor(fighter.maxHp / 16));
          damageReason = 'poison';
        } else if (fighter.statusEffects.some(s => s.type === 'burn')) {
          damageTaken += Math.max(1, Math.floor(fighter.maxHp / 16));
          damageReason = 'burn';
        }
      }

      // --- Daño por Clima ---
      if (weather === 'sandstorm' && !info.types.includes('rock') && !info.types.includes('ground') && !info.types.includes('steel')) {
        damageTaken += Math.max(1, Math.floor(fighter.maxHp / 16));
        if (!damageReason) damageReason = 'sandstorm';
      } else if (weather === 'hail' && !info.types.includes('ice')) {
        damageTaken += Math.max(1, Math.floor(fighter.maxHp / 16));
        if (!damageReason) damageReason = 'hail';
      }

      if (damageTaken > 0) {
        fighter.hp -= damageTaken;
        
        // Mensajes (sólo para el jugador para no spamear el log con enemigos)
        if (entityId === game._playerId) {
           if (damageReason === 'poison') game.eventBus.emit('message', '¡El veneno te lastima!');
           else if (damageReason === 'burn') game.eventBus.emit('message', '¡La quemadura te lastima!');
           else if (damageReason === 'sandstorm') game.eventBus.emit('message', '¡La tormenta de arena te lastima!');
           else if (damageReason === 'hail') game.eventBus.emit('message', '¡El granizo te lastima!');
        }

        // Muerte por daño residual
        if (fighter.hp <= 0) {
           fighter.hp = 0;
           
           // Lógica de Reviver Seed
           let reviverUsed = false;
           // Solo el jugador o su equipo usan semillas del inventario (o enemigos si implementamos que las lleven)
           if (entityId === game._playerId || game.entityManager.hasComponent(entityId, 'partyMember')) {
             const inventory = game.inventory || [];
             const reviverIndex = inventory.findIndex(i => i.itemId === 'reviver_seed');
             if (reviverIndex !== -1) {
               inventory[reviverIndex].quantity--;
               if (inventory[reviverIndex].quantity <= 0) inventory.splice(reviverIndex, 1);
               fighter.hp = fighter.maxHp;
               fighter.statusEffects = [];
               game.eventBus.emit('message', `¡${info.name} cayó por daño pasivo pero revivió gracias a la Semilla Revivir!`);
               if (game.renderer && game.renderer.screenFlash && entityId === game._playerId) {
                 game.renderer.screenFlash('rgba(0, 255, 0, 0.4)', 400);
               }
               reviverUsed = true;
             }
           }

           if (!reviverUsed) {
             game.eventBus.emit('message', `¡${info.name} se debilitó por el daño pasivo!`);
             const pos = game.entityManager.getComponent(entityId, 'position');
             const sprite = game.entityManager.getComponent(entityId, 'sprite');
             game.eventBus.emit('pokemon_fainted', {
               entityId: entityId,
               speciesId: info.speciesId,
               pos: pos ? { x: pos.x, y: pos.y } : null,
               spriteUrl: sprite ? sprite.url : '',
               attackerId: null // Murió por estado/clima
             });
           }
        }
        
        game.entityManager.setComponent(entityId, 'fighter', fighter);
      }
    }
  }
}
