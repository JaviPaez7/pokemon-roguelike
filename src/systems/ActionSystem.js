import { ACTIONS, GAME_STATES, TYPE_NAMES_ES, MAX_PARTY_SIZE } from '../constants.js';
import { getEnemyAction } from '../entities/EnemyAI.js';
import { executeMove, processStatusEffects, selectBestMove } from './CombatSystem.js';
import { grantExperience, calculateExpGained } from './ExperienceSystem.js';
import { checkEvolution } from './EvolutionSystem.js';
import { triggerTrap } from './TrapSystem.js';
import { getCaptureChance } from './CaptureSystem.js';
import { canWalkOnTile } from './MovementSystem.js';

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

  /** Emite pokemon_fainted si la entidad quedó a 0 PS (trampas, etc.). */
  _emitFaintIfNeeded(entityId) {
    const game = this.game;
    const fighter = game.entityManager.getComponent(entityId, 'fighter');
    if (fighter && fighter.hp <= 0) {
      game.eventBus.emit('pokemon_fainted', { entityId, attackerId: null });
    }
  }

  getEnemyAIAction(entityId) {
    const game = this.game;
    if (!game.tileMap || !game._playerId) return null;

    const playerPos = game.entityManager.getComponent(game._playerId, 'position');
    if (!playerPos) return null;

    // Continuar movimiento de carga / Venganza si está preparando
    const selfF = game.entityManager.getComponent(entityId, 'fighter');
    const selfI = game.entityManager.getComponent(entityId, 'pokemonInfo');
    if (selfF && selfF.charging && selfI && selfI.currentMoves) {
      const idx = selfI.currentMoves.findIndex(m => m && m.moveId === selfF.charging.moveId);
      if (idx >= 0) {
        const foe = this._findAdjacentFoe(entityId);
        if (foe != null) {
          return { type: ACTIONS.USE_MOVE, index: idx };
        }
        // Sin objetivo: cancelar carga (gasta el turno)
        selfF.charging = null;
        game.entityManager.setComponent(entityId, 'fighter', selfF);
        if (selfI?.name) {
          game.eventBus.emit('message', { text: `¡${selfI.name} interrumpió la carga!`, color: '#ffaa66' });
        }
        return { type: ACTIONS.WAIT };
      }
    }
    if (selfF && selfF.biding && selfI && selfI.currentMoves) {
      const idx = selfI.currentMoves.findIndex(m => m && m.moveId === selfF.biding.moveId);
      if (idx >= 0) {
        const foe = this._findAdjacentFoe(entityId);
        const held = selfF.biding.turnsHeld || 0;
        const stored = selfF.biding.damageStored || 0;
        if (foe != null && stored > 0 && held >= 2) {
          return { type: ACTIONS.USE_MOVE, index: idx };
        }
        // Cancelar si se atasca (sin daño / sin rival / demasiado tiempo)
        if (held >= 6 || (held >= 3 && stored === 0) || (held >= 4 && foe == null)) {
          selfF.biding = null;
          game.entityManager.setComponent(entityId, 'fighter', selfF);
          if (selfI?.name) {
            game.eventBus.emit('message', { text: `¡${selfI.name} abandonó Venganza!`, color: '#ffaa66' });
          }
          return { type: ACTIONS.WAIT };
        }
        return { type: ACTIONS.WAIT };
      }
    }

    const action = getEnemyAction(entityId, game.entityManager, game.tileMap, playerPos, game._playerId, game);

    if (action && action.type === 'attack') {
      return {
        type: ACTIONS.ATTACK,
        targetId: action.targetId,
        regularAttack: !!action.regularAttack
      };
    }

    if (action && action.type === 'move') {
      return { type: ACTIONS.MOVE, dx: action.dx, dy: action.dy };
    }

    if (action && action.type === 'wait') {
      return { type: ACTIONS.WAIT };
    }

    if (action && (action.type === 'use_move' || action.type === ACTIONS.USE_MOVE)) {
      return { type: ACTIONS.USE_MOVE, index: action.index ?? 0 };
    }

    return action;
  }

  executeEntityAction(entityId, action) {
    const game = this.game;

    // WAIT / ATTACK: estados primero. MOVE/USE_MOVE validan antes de tickear.
    if (action.type === ACTIONS.WAIT || action.type === ACTIONS.ATTACK) {
      const statusBlock = this._applyStatusBeforeAction(entityId);
      if (statusBlock) return statusBlock;
    }

    switch (action.type) {
      case ACTIONS.MOVE: {
        if (!game.tileMap) {
          return { success: false, type: 'blocked' };
        }

        // Choque contra muro: no tickear estados ni pasar turno
        if (this._isMoveIntoWall(entityId, action.dx, action.dy)) {
          return { success: false, type: 'blocked' };
        }

        const statusBlock = this._applyStatusBeforeAction(entityId);
        if (statusBlock) return statusBlock;

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
              return { success: false, type: 'interacted' }; // no avanzar turno bajo menú
            } else if (isMerchant) {
              this.handleMerchantInteract(result.targetEntity);
              return { success: false, type: 'interacted' }; // no avanzar turno bajo menú
            }
          }
          // Choque = ataque básico (sin PP), estilo Mystery Dungeon
          return this.handleCombat(entityId, result.targetEntity, { regularAttack: true });
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
            // No gastar turno: el menú es solo confirmación
            return { success: false, type: 'stairs_prompt' };
          }
          return result;
        }

        if (result.type === 'pickup') {
          if (entityId === game._playerId) {
            if (game.autoPickup !== false) {
              game.eventBus.emit('item_picked_up', {
                entityId,
                itemEntity: result.itemEntity
              });
            } else {
              const drop = game.entityManager.getComponent(result.itemEntity, 'itemDrop');
              const meta = drop && game.itemsData ? game.itemsData.find(i => i.id === drop.itemId) : null;
              const name = meta ? meta.name : 'objeto';
              game.eventBus.emit('message', {
                text: `${name} en el suelo. Pulsa Z para recoger.`,
                color: '#88ccff'
              });
            }
          }
          if (result.isTrap && result.trapEntity) {
            const msgs = triggerTrap(entityId, result.trapEntity, game.entityManager, game.tileMap);
            for (const msg of msgs) game.eventBus.emit('message', msg);
            if (typeof game._syncAbilitySpeeds === 'function') game._syncAbilitySpeeds();
            this._emitFaintIfNeeded(entityId);
          }
          return result;
        }

        if (result.type === 'trap' && result.trapEntity) {
          const msgs = triggerTrap(entityId, result.trapEntity, game.entityManager, game.tileMap);
          for (const msg of msgs) game.eventBus.emit('message', msg);
          if (typeof game._syncAbilitySpeeds === 'function') game._syncAbilitySpeeds();
          this._emitFaintIfNeeded(entityId);
          return result;
        }

        if (result.type === 'wonder_tile') {
          const fighter = game.entityManager.getComponent(entityId, 'fighter');
          const info = game.entityManager.getComponent(entityId, 'pokemonInfo');
          if (fighter && info) {
            const mods = fighter.statModifiers || {};
            const needsStats = ['attack','defense','speed','spAtk','spDef','accuracy','evasion']
              .some(k => (mods[k] || 0) !== 0);
            const hadStatus = !!(fighter.statusEffects && fighter.statusEffects.length);
            const needsPP = !!(info.currentMoves && info.currentMoves.some(m => m && m.currentPP < m.maxPP));
            const needsHp = fighter.hp > 0 && fighter.hp < fighter.maxHp;
            const needsBelly = fighter.belly != null && fighter.belly < (fighter.maxBelly || 100);
            const needsCombatClear = !!(fighter.charging || fighter.biding || fighter.mustRecharge
              || fighter.rage || fighter.focusEnergy || fighter.protectStats || fighter._preTransform);
            const tileKey = `${result.x},${result.y}`;
            // Evitar spam: misma baldosa sin salir no vuelve a curar/avisar
            if (fighter._wonderTileKey === tileKey && !needsStats && !hadStatus && !needsPP
                && !needsHp && !needsCombatClear) {
              return { success: true, type: 'moved', x: result.x, y: result.y };
            }
            fighter.statModifiers = {
              attack: 0, defense: 0, speed: 0, spAtk: 0, spDef: 0, accuracy: 0, evasion: 0
            };
            fighter.statusEffects = [];
            fighter.flinched = false;
            fighter.charging = null;
            fighter.biding = null;
            fighter.mustRecharge = false;
            fighter.rage = false;
            fighter.focusEnergy = false;
            fighter.protectStats = 0;
            if (info.currentMoves) {
              info.currentMoves.forEach(m => {
                if (!m) return;
                m.currentPP = m.maxPP;
                m.enabled = true;
                delete m._disableTurns;
              });
              game.entityManager.setComponent(entityId, 'pokemonInfo', info);
            }
            let healMsg = '';
            if (needsHp) {
              const heal = Math.max(1, Math.floor(fighter.maxHp * 0.15));
              fighter.hp = Math.min(fighter.maxHp, fighter.hp + heal);
              healMsg = ` y +${heal} PS`;
            }
            if (needsBelly) {
              fighter.belly = Math.min(fighter.maxBelly || 100, fighter.belly + 10);
              healMsg += ' y +10 tripa';
            }
            fighter._wonderTileKey = tileKey;
            game.entityManager.setComponent(entityId, 'fighter', fighter);
            if (needsStats || hadStatus || needsPP || needsHp || needsBelly || needsCombatClear
                || fighter._wonderTileKey !== tileKey) {
              const statusMsg = hadStatus ? ', estados curados' : '';
              try {
                if (game.uiManager?.sfx?.playHealSound) game.uiManager.sfx.playHealSound();
              } catch (e) {}
              game.eventBus.emit('message', {
                text: `¡Baldosa Mágica! Stats y PP de ${info.name} restaurados${statusMsg}${healMsg}.`,
                color: '#c9a0ff'
              });
            }
          }
          return { success: true, type: 'wonder_tile', x: result.x, y: result.y };
        }

        // Al salir de una Baldosa Mágica, permitir reactivarla más tarde
        if (result.success && (result.type === 'moved' || result.type === 'pickup' || result.type === 'stairs')) {
          const fLeave = game.entityManager.getComponent(entityId, 'fighter');
          if (fLeave && fLeave._wonderTileKey) {
            delete fLeave._wonderTileKey;
            game.entityManager.setComponent(entityId, 'fighter', fLeave);
          }
        }

        return result;
      }

      case ACTIONS.WAIT: {
        const fighter = game.entityManager.getComponent(entityId, 'fighter');
        if (fighter && fighter.hp > 0 && fighter.hp < fighter.maxHp && Math.random() < 0.15) {
          fighter.hp = Math.min(fighter.maxHp, fighter.hp + 1);
          game.entityManager.setComponent(entityId, 'fighter', fighter);
        }
        // Regenerar un poco de tripa al esperar si no estás muerto de hambre
        if (fighter && fighter.hp > 0 && fighter.belly != null && fighter.belly > 0 && fighter.belly < (fighter.maxBelly || 100) && Math.random() < 0.12) {
          fighter.belly = Math.min(fighter.maxBelly || 100, fighter.belly + 1);
          game.entityManager.setComponent(entityId, 'fighter', fighter);
        }
        return { success: true, type: 'waited' };
      }

      case ACTIONS.ATTACK:
        // IA: movimiento o ataque básico según flag
        return this.handleCombat(entityId, action.targetId, {
          regularAttack: !!action.regularAttack
        });

      case ACTIONS.USE_MOVE:
        return this.handleUseMove(entityId, action.index ?? 0);

      case 'confirm':
        return this.handleConfirmAction(entityId);

      default:
        return { success: false, type: 'unknown_action' };
    }
  }

  /**
   * Usa el movimiento de la ranura 0-3 contra un enemigo adyacente (prioriza la dirección mirando).
   */
  handleUseMove(entityId, moveIndex) {
    const game = this.game;
    const info = game.entityManager.getComponent(entityId, 'pokemonInfo');
    if (!info || !info.currentMoves || !info.currentMoves[moveIndex]) {
      game.eventBus.emit('message', '¡No hay movimiento en esa ranura!');
      return { success: false, type: 'no_move' };
    }

    game._selectedMoveIndex = moveIndex;
    const slot = info.currentMoves[moveIndex];
    const move = game.movesData.find(m => m.id === slot.moveId);
    const moveName = move ? move.name : 'movimiento';

    if (slot.enabled === false) {
      const left = slot._disableTurns > 0 ? ` Quedan ~${slot._disableTurns} turnos.` : '';
      game.eventBus.emit('message', {
        text: `¡${moveName} está anulado!${left}`,
        color: '#ffcc88'
      });
      // Gasta turno (el contador baja en processStatusEffects; evita spam sin enemigos)
      const statusBlock = this._applyStatusBeforeAction(entityId);
      if (statusBlock) return statusBlock;
      return { success: true, type: 'disabled_waste' };
    }
    if (slot.currentPP <= 0) {
      game.eventBus.emit('message', {
        text: `¡No quedan PP para ${moveName}! Choca con el enemigo para atacar sin PP.`,
        color: '#ffcc88'
      });
      return { success: false, type: 'no_pp' };
    }

    const SELF_MOVE_EFFECTS = new Set([
      'heal_self', 'rest', 'focus_energy', 'protect_stats', 'reset_stats',
      'stat_up_attack', 'stat_up_attack_2',
      'stat_up_defense', 'stat_up_defense_2',
      'stat_up_speed', 'stat_up_speed_2',
      'stat_up_special', 'stat_up_special_2', 'stat_up_spAtk', 'stat_up_spDef', 'stat_up_evasion',
      'light_screen', 'reflect', 'substitute', 'flee', 'rage', 'confuse_self'
    ]);
    const fighter = game.entityManager.getComponent(entityId, 'fighter');
    // Preparar Venganza/carga no requiere enemigo; liberar sí
    const startingBide = move && move.effect === 'bide' && !(fighter && fighter.biding);
    const startingCharge = move && move.effect === 'charge' && !(fighter && fighter.charging);
    const releasingBide = move && move.effect === 'bide' && fighter && fighter.biding;
    let targetId = this._findAdjacentFoe(entityId);
    if (targetId == null && move && (SELF_MOVE_EFFECTS.has(move.effect) || startingBide || startingCharge)) {
      targetId = entityId; // auto-objetivo
    }
    if (targetId == null) {
      // Liberar carga/venganza sin rival: falla y gasta turno (evita softlock)
      if (fighter?.charging && move?.effect === 'charge' && fighter.charging.moveId === move.id) {
        const statusBlock = this._applyStatusBeforeAction(entityId);
        if (statusBlock) return statusBlock;
        const f2 = game.entityManager.getComponent(entityId, 'fighter') || fighter;
        f2.charging = null;
        game.entityManager.setComponent(entityId, 'fighter', f2);
        game.eventBus.emit('message', {
          text: `¡${info.name} falló ${moveName}! No había objetivo cerca.`,
          color: '#ffaa66'
        });
        return { success: true, type: 'charge_missed' };
      }
      if (releasingBide) {
        const statusBlock = this._applyStatusBeforeAction(entityId);
        if (statusBlock) return statusBlock;
        const f2 = game.entityManager.getComponent(entityId, 'fighter') || fighter;
        f2.biding = null;
        game.entityManager.setComponent(entityId, 'fighter', f2);
        game.eventBus.emit('message', {
          text: `¡${info.name} abandonó Venganza! No había objetivo cerca.`,
          color: '#ffaa66'
        });
        return { success: true, type: 'bide_cancelled' };
      }
      game.eventBus.emit('message', `¡No hay un objetivo cerca para usar ${moveName}!`);
      return { success: false, type: 'no_target' };
    }

    // Validación OK → tickear estados y combatir
    const statusBlock = this._applyStatusBeforeAction(entityId);
    if (statusBlock) return statusBlock;

    return this.handleCombat(entityId, targetId, { regularAttack: false, moveIndex });
  }

  /** True si el destino es muro/fuera de mapa (no cuenta como turno). */
  _isMoveIntoWall(entityId, dx, dy) {
    const game = this.game;
    const position = game.entityManager.getComponent(entityId, 'position');
    if (!position || !game.tileMap) return true;
    const targetX = position.x + dx;
    const targetY = position.y + dy;
    const tw = game.tileMap.getWidth ? game.tileMap.getWidth() : game.tileMap.width;
    const th = game.tileMap.getHeight ? game.tileMap.getHeight() : game.tileMap.height;
    if (targetX < 0 || targetY < 0 || targetX >= tw || targetY >= th) return true;

    // Si hay un enemigo/NPC chocable, NUNCA tratarlo como muro (permite pelear)
    const occupant = game.entityManager.getEntityAt(targetX, targetY, false);
    if (occupant != null && occupant !== entityId) {
      const occF = game.entityManager.getComponent(occupant, 'fighter');
      if (!occF || occF.hp > 0) return false;
    }

    if (!canWalkOnTile(entityId, targetX, targetY, game.tileMap, game.entityManager)) return true;
    if (Math.abs(dx) === 1 && Math.abs(dy) === 1) {
      if (!canWalkOnTile(entityId, position.x + dx, position.y, game.tileMap, game.entityManager) ||
          !canWalkOnTile(entityId, position.x, position.y + dy, game.tileMap, game.entityManager)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Busca un enemigo adyacente: primero en la dirección mirando, luego en las 8 casillas.
   */
  _findAdjacentFoe(entityId) {
    const game = this.game;
    const pos = game.entityManager.getComponent(entityId, 'position');
    if (!pos) return null;

    const facingDirs = {
      up: [[0, -1]],
      down: [[0, 1]],
      left: [[-1, 0]],
      right: [[1, 0]]
    };
    const allDirs = [
      [0, -1], [0, 1], [-1, 0], [1, 0],
      [-1, -1], [1, -1], [-1, 1], [1, 1]
    ];
    const faceVec = [];
    if ((pos.facingDx || pos.facingDy) && (pos.facingDx !== 0 || pos.facingDy !== 0)) {
      faceVec.push([pos.facingDx, pos.facingDy]);
    }
    const ordered = [
      ...faceVec,
      ...(facingDirs[pos.facing] || []),
      ...allDirs
    ];

    const seen = new Set();
    for (const [dx, dy] of ordered) {
      const key = `${dx},${dy}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const other = game.entityManager.getEntityAt(pos.x + dx, pos.y + dy);
      if (other == null || other === entityId) continue;
      if (game.entityManager.hasComponent(other, 'partyMember')) continue;
      if (game.entityManager.hasComponent(other, 'npcFriendly')) continue;
      if (game.entityManager.hasComponent(other, 'npcMerchant')) continue;
      if (game.entityManager.hasComponent(other, 'pokemonInfo')) {
        return other;
      }
    }
    return null;
  }

  /**
   * Procesa estados al inicio de una acción no-combate.
   * Si no puede actuar, consume el turno (success: true) para que los enemigos actúen.
   * @returns {Object|null}
   */
  _applyStatusBeforeAction(entityId) {
    const game = this.game;
    const fighter = game.entityManager.getComponent(entityId, 'fighter');
    const info = game.entityManager.getComponent(entityId, 'pokemonInfo');
    if (!fighter) return { success: false, type: 'no_fighter' };
    if (fighter.hp <= 0) {
      this._emitFaintIfNeeded(entityId);
      return { success: false, type: 'fainted' };
    }

    const status = processStatusEffects(entityId, game.entityManager);
    if (status.messages) {
      for (const msg of status.messages) {
        game.eventBus.emit('message', msg);
      }
    }

    const updated = game.entityManager.getComponent(entityId, 'fighter');
    if (updated && updated.hp <= 0) {
      game.eventBus.emit('pokemon_fainted', {
        entityId,
        speciesId: info ? info.speciesId : null,
        pos: game.entityManager.getComponent(entityId, 'position'),
        spriteUrl: '',
        attackerId: null
      });
      return { success: true, type: 'fainted_from_status' };
    }

    if (!status.canAct) {
      return { success: true, type: 'status_blocked' };
    }
    return null;
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
        return { success: false, type: 'stairs_prompt' };
      }
      return { success: false, type: 'stairs_prompt' };
    }

    // Recoger objeto bajo los pies, o el de la casilla mirando (adyacente)
    let fdx = pos.facingDx ?? 0;
    let fdy = pos.facingDy ?? 0;
    if (fdx === 0 && fdy === 0) {
      const facing = pos.facing || 'down';
      [fdx, fdy] = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[facing] || [0, 1];
    }
    const dir = [fdx, fdy];

    let item = game.entityManager.getItemAt(pos.x, pos.y);
    if (item === null) {
      item = game.entityManager.getItemAt(pos.x + dir[0], pos.y + dir[1]);
    }
    if (item !== null) {
      game.eventBus.emit('item_picked_up', {
        entityId,
        itemEntity: item
      });
      return { success: true, type: 'picked_up' };
    }

    // Examinar trampa revelada bajo los pies o delante
    const trapCandidates = [
      game.entityManager.getTrapAt?.(pos.x, pos.y),
      game.entityManager.getTrapAt?.(pos.x + dir[0], pos.y + dir[1])
    ].filter(id => id != null);
    for (const trapId of trapCandidates) {
      const trap = game.entityManager.getComponent(trapId, 'trap');
      if (trap && !trap.isHidden) {
        const trapNames = {
          poison: 'Trampa de Veneno',
          sleep: 'Trampa de Sueño',
          explosion: 'Trampa Explosiva',
          warp: 'Trampa de Teletransporte',
          sticky: 'Trampa Pegajosa',
          wonder_tile: 'Baldosa Mágica (stats, PP, estados y algo de PS)'
        };
        game.eventBus.emit('message', {
          text: trapNames[trap.type] || 'Trampa desconocida',
          color: trap.type === 'wonder_tile' ? '#88ffaa' : '#ff8866'
        });
        return { success: false, type: 'examine' };
      }
    }

    // Examinar Pokémon / NPC delante (no consume turno)
    const lookId = game.entityManager.getEntityAt(pos.x + dir[0], pos.y + dir[1]);
    if (lookId != null) {
      const lookInfo = game.entityManager.getComponent(lookId, 'pokemonInfo');
      const lookFighter = game.entityManager.getComponent(lookId, 'fighter');
      if (lookInfo && lookFighter) {
        if (game.entityManager.hasComponent(lookId, 'npcMerchant')) {
          game.eventBus.emit('message', {
            text: 'Mercader Kecleon — choca con él para abrir la tienda.',
            color: '#88ff88'
          });
          return { success: false, type: 'examine' };
        }
        if (game.entityManager.hasComponent(lookId, 'npcFriendly')) {
          game.eventBus.emit('message', {
            text: `${lookInfo.name} parece amigable. Choca con él para reclutarlo.`,
            color: '#88ff88'
          });
          return { success: false, type: 'examine' };
        }
        if (game.entityManager.hasComponent(lookId, 'partyMember')) {
          const hpPct = Math.round((lookFighter.hp / Math.max(1, lookFighter.maxHp)) * 100);
          const statusIcons = { poison: 'VEN', burn: 'QUE', paralyze: 'PAR', sleep: 'DOR', freeze: 'HIE', confuse: 'CNF', leech_seed: 'DRE', bound: 'ATR' };
          let st = (lookFighter.statusEffects || []).map(s => {
            let label = (s.type === 'poison' && s.badly) ? 'TOX' : (statusIcons[s.type] || s.type);
            if (s.turnsLeft > 0) label += s.turnsLeft;
            return label;
          }).join(' ');
          if (lookFighter.charging) st = (st ? st + ' ' : '') + 'CARGA';
          if (lookFighter.biding) {
            const bh = lookFighter.biding.turnsHeld || 0;
            st = (st ? st + ' ' : '') + `VENG(${lookFighter.biding.damageStored || 0}|${bh}t)`;
          }
          if (lookFighter.reflect > 0) st = (st ? st + ' ' : '') + `REF${lookFighter.reflect}`;
          if (lookFighter.lightScreen > 0) st = (st ? st + ' ' : '') + `P.LUZ${lookFighter.lightScreen}`;
          if (lookFighter.substitute > 0) st = (st ? st + ' ' : '') + 'SUS';
          const stHint = st ? ` · ${st}` : '';
          const abKey = lookInfo.ability ? String(lookInfo.ability).toLowerCase().replace(/-/g, '_') : '';
          const abEs = { overgrow: 'Espesura', blaze: 'Mar Llamas', torrent: 'Torrente', swarm: 'Enjambre',
            static: 'Elec. Estática', levitate: 'Levitación', sturdy: 'Robustez', guts: 'Agallas',
            chlorophyll: 'Clorofila', swift_swim: 'Nado Rápido', trace: 'Rastro', shed_skin: 'Mudar',
            natural_cure: 'Cura Natural', intimidate: 'Intimidación', inner_focus: 'Foco Interno' }[abKey];
          const abHint = abEs ? ` · ${abEs}` : '';
          game.eventBus.emit('message', {
            text: `${lookInfo.name} (aliado) Nv.${lookInfo.level} — ${lookFighter.hp}/${lookFighter.maxHp} PS (${hpPct}%)${abHint}${stHint}`,
            color: '#88ccff'
          });
          return { success: false, type: 'examine' };
        }
        const hpPct = Math.round((lookFighter.hp / Math.max(1, lookFighter.maxHp)) * 100);
        const types = (lookInfo.types || []).map(t => TYPE_NAMES_ES[t] || t).join('/');
        const boss = game.entityManager.hasComponent(lookId, 'isBoss') || game.entityManager.hasComponent(lookId, 'boss');
        const abilityKey = lookInfo.ability ? String(lookInfo.ability).toLowerCase().replace(/-/g, '_') : '';
        const abilityEs = {
          overgrow: 'Espesura', blaze: 'Mar Llamas', torrent: 'Torrente', swarm: 'Enjambre',
          static: 'Elec. Estática', levitate: 'Levitación', sturdy: 'Robustez', guts: 'Agallas',
          run_away: 'Fuga', poison_point: 'Punto Tóxico', flash_fire: 'Absorbe Fuego',
          water_absorb: 'Absorbe Agua', volt_absorb: 'Absorbe Elec.', sand_veil: 'Velo Arena',
          ice_body: 'Cuerpo Gel', inner_focus: 'Foco Interno', synchronize: 'Sincronía',
          flame_body: 'Cuerpo Llama', effect_spore: 'Efecto Espora', chlorophyll: 'Clorofila',
          keen_eye: 'Vista Lince', intimidate: 'Intimidación', intimidation: 'Intimidación',
          compound_eyes: 'Ojo compuesto', compoundeyes: 'Ojo compuesto',
          lightning_rod: 'Pararrayos', lightningrod: 'Pararrayos',
          thick_fat: 'Sebo', huge_power: 'Potencia', pure_power: 'Energía Pura',
          pressure: 'Presión', wonder_guard: 'Superguarda',
          swift_swim: 'Nado Rápido', rock_head: 'Cabeza Roca', shell_armor: 'Caparazón',
          battle_armor: 'Armadura Batalla', limber: 'Flexibilidad', insomnia: 'Insomnio',
          shed_skin: 'Mudar', clear_body: 'Cuerpo Puro', natural_cure: 'Cura Natural',
          damp: 'Humedad', cute_charm: 'Gran Encanto', stench: 'Hedor', shield_dust: 'Polvo Escudo',
          trace: 'Rastro', pickup: 'Recogida', early_bird: 'Madrugar', vital_spirit: 'Espíritu Vital',
          hyper_cutter: 'Corte Fuerte', iron_fist: 'Puño Férreo', soundproof: 'Insonorizar',
          oblivious: 'Despiste', run_away: 'Fuga'
        }[abilityKey];
        let abilityHint = abilityEs ? ` · ${abilityEs}` : '';
        if (abilityKey === 'sand_veil' && String(game.currentWeather || '').includes('arena')) {
          abilityHint += ' (más evasión)';
        }
        if (abilityKey === 'chlorophyll' && game.currentWeather === 'sol') {
          abilityHint += ' (vel. x2)';
        }
        if (abilityKey === 'swift_swim' && game.currentWeather === 'lluvia') {
          abilityHint += ' (vel. x2)';
        }
        const stIcons = { poison: 'VEN', burn: 'QUE', paralyze: 'PAR', sleep: 'DOR', freeze: 'HIE', confuse: 'CNF', leech_seed: 'DRE', bound: 'ATR' };
        let stHint = (lookFighter.statusEffects || [])
          .map(s => {
            let label = stIcons[s.type] || s.type;
            if (s.type === 'poison' && s.badly) label = 'TOX';
            if (s.turnsLeft > 0 && ['sleep', 'freeze', 'paralyze', 'confuse', 'bound', 'leech_seed'].includes(s.type)) {
              label += s.turnsLeft;
            }
            return label;
          })
          .filter(Boolean)
          .join(' ');
        if (lookFighter.charging) stHint = (stHint ? stHint + ' ' : '') + 'CARGA';
        if (lookFighter.biding) {
          const bh = lookFighter.biding.turnsHeld || 0;
          stHint = (stHint ? stHint + ' ' : '') + `VENGANZA(${lookFighter.biding.damageStored || 0}|${bh}t)`;
        }
        if (lookFighter.reflect > 0) stHint = (stHint ? stHint + ' ' : '') + `REF${lookFighter.reflect}`;
        if (lookFighter.lightScreen > 0) stHint = (stHint ? stHint + ' ' : '') + `P.LUZ${lookFighter.lightScreen}`;
        if (lookFighter.substitute > 0) stHint = (stHint ? stHint + ' ' : '') + 'SUS';
        const statusHint = stHint ? ` · ${stHint}` : '';
        let catchHint = '';
        const ballSlot = (game.inventory || []).find(s => {
          const d = game.itemsData.find(i => i.id === s.itemId);
          return d && d.type === 'capture' && s.quantity > 0;
        });
        if (ballSlot) {
          const ballData = game.itemsData.find(i => i.id === ballSlot.itemId);
          if (ballData) {
            const chance = getCaptureChance(lookFighter, lookInfo, ballData, game.pokemonData);
            catchHint = ` · ${ballData.name} ~${chance}%`;
          }
        }
        game.eventBus.emit('message', {
          text: `${boss ? '¡Jefe! ' : ''}${lookInfo.name} Nv.${lookInfo.level} (${types}) — PS ~${hpPct}%${abilityHint}${statusHint}${catchHint}`,
          color: boss ? '#ff6666' : '#ffaa66'
        });
        return { success: false, type: 'examine' };
      }
    }

    // Examinar escaleras delante
    if (game.tileMap && typeof game.tileMap.isStairs === 'function' && game.tileMap.isStairs(pos.x + dir[0], pos.y + dir[1])) {
      const hostiles = (game.entityManager.getEntitiesWithComponents('aiControlled', 'fighter') || []).filter(id => {
        if (game.entityManager.hasComponent(id, 'partyMember')) return false;
        if (game.entityManager.hasComponent(id, 'npcFriendly') || game.entityManager.hasComponent(id, 'npcMerchant')) return false;
        const f = game.entityManager.getComponent(id, 'fighter');
        return f && f.hp > 0;
      }).length;
      const fl = game._currentFloor || 1;
      game.eventBus.emit('message', {
        text: `Escaleras al piso ${fl + 1}.${hostiles ? ` Quedan ${hostiles} salvajes.` : ' Zona despejada.'}`,
        color: '#88ffaa'
      });
      return { success: false, type: 'examine' };
    }

    // Sin acción: si hay objeto adyacente en otra dirección, avisar
    const nearDirs = [[0, -1], [0, 1], [-1, 0], [1, 0]];
    for (const [dx, dy] of nearDirs) {
      const nearItem = game.entityManager.getItemAt(pos.x + dx, pos.y + dy);
      if (nearItem != null) {
        const drop = game.entityManager.getComponent(nearItem, 'itemDrop');
        const meta = drop && game.itemsData ? game.itemsData.find(i => i.id === drop.itemId) : null;
        const name = meta ? meta.name : 'objeto';
        game.eventBus.emit('message', { text: `Hay ${name} cerca. Camina encima o míralo y pulsa Z.`, color: '#88ccff' });
        return { success: false, type: 'hint_item' };
      }
    }

    return { success: false, type: 'nothing_here' };
  }

  handleCombat(attackerId, defenderId, options = {}) {
    const { regularAttack = false, moveIndex = null } = options;
    const game = this.game;
    const attackerInfo = game.entityManager.getComponent(attackerId, 'pokemonInfo');
    const defenderInfo = game.entityManager.getComponent(defenderId, 'pokemonInfo');

    if (!attackerInfo || !defenderInfo) return { success: false };

    // processStatusEffects ya se aplicó en executeEntityAction
    const attackerFighter = game.entityManager.getComponent(attackerId, 'fighter');
    if (attackerFighter && attackerFighter.hp <= 0) {
      let reviverUsed = false;
      if (game.entityManager.hasComponent(attackerId, 'partyMember')) {
        const invIndex = game.inventory.findIndex(item => item.itemId === 'reviver_seed' && item.quantity > 0);
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
          game.eventBus.emit('message', `...pero ¡revivió gracias a la Semilla Revivir!`);
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
      game.entityManager.setComponent(attackerId, 'fighter', attackerFighter);
      game.entityManager.setComponent(attackerId, 'pokemonInfo', attackerInfo);
    }

    // El bloqueo por estado ya se resolvió en executeEntityAction
    let moveSelected = null;

    if (regularAttack) {
      // Ataque básico: no consume PP (Mystery Dungeon); escala con nivel
      const atkType = (attackerInfo.types && attackerInfo.types[0]) || 'normal';
      const lvl = attackerInfo.level || 1;
      moveSelected = {
        id: -1,
        name: 'Ataque',
        type: atkType,
        power: Math.max(15, Math.min(45, 12 + lvl * 2)),
        pp: 99,
        accuracy: 95,
        damageClass: 'physical',
        effect: null,
        description: 'Ataque básico sin PP'
      };
    } else if (attackerId === game._playerId) {
      const idx = moveIndex !== null ? moveIndex : game._selectedMoveIndex;
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
        name: 'Forcejeo',
        type: 'normal',
        power: 50,
        pp: 1,
        damageClass: 'physical',
        effect: 'recoil',
        description: 'Ataque de último recurso'
      };
      if (attackerId === game._playerId || game.entityManager.hasComponent(attackerId, 'partyMember')) {
        game.eventBus.emit('message', {
          text: '¡Sin PP! Usando Forcejeo (hace daño de retroceso).',
          color: '#ffaa66'
        });
      }
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
        const speciesData = game.pokemonData
          ? game.pokemonData.find(p => p.id === defenderInfo.speciesId)
          : null;
        const baseExp = (speciesData && speciesData.baseExp) || defenderInfo.baseExp || 50;
        const xpGained = calculateExpGained(baseExp, defenderInfo.level);
        // Monedas: solo en pokemon_fainted (GameEvents) para no duplicar

        const partyEntities = game.entityManager.getEntitiesWithComponents('partyMember');
        
        let xpRecipients = 0;
        for (const memberId of partyEntities) {
          const mInfo = game.entityManager.getComponent(memberId, 'pokemonInfo');
          const mFighter = game.entityManager.getComponent(memberId, 'fighter');
          
          if (!mInfo || !mFighter || mFighter.hp <= 0) continue;
          xpRecipients++;

          const xpResult = grantExperience(mInfo, mFighter, xpGained, game.pokemonData, game.movesData);
          // Solo mensajes de subida de nivel (el XP se resume abajo)
          if (xpResult.messages) {
            for (const msg of xpResult.messages) {
              if (msg.includes('subió') || msg.includes('nivel') || msg.includes('aprend')) {
                game.eventBus.emit('message', msg);
              }
            }
          }

          if (xpResult.levelsGained > 0) {
            game.eventBus.emit('level_up', { entityId: memberId, newLevel: mInfo.level });

            // Cola de evolución: el jugador confirma en el menú (no auto-evolucionar)
            if (mInfo.evolutionDeclinedAtLevel != null && mInfo.evolutionDeclinedAtLevel !== mInfo.level) {
              mInfo.evolutionDeclinedAtLevel = null;
            }
            const evo = checkEvolution(mInfo, game.evolutionsData);
            if (evo) {
              mInfo.pendingEvolution = evo;
              game.entityManager.setComponent(memberId, 'pokemonInfo', mInfo);
            }
          }
        }
        if (xpRecipients > 0) {
          game.eventBus.emit('message', {
            text: xpRecipients > 1
              ? `El equipo ganó ${xpGained} EXP cada uno.`
              : `+${xpGained} EXP`,
            color: '#aaddff'
          });
          if (typeof game._syncAbilitySpeeds === 'function') game._syncAbilitySpeeds();
        }
      }
    }

    if (typeof game._syncAbilitySpeeds === 'function') game._syncAbilitySpeeds();
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
    if (party.length < MAX_PARTY_SIZE) {
      game.uiManager.openRecruitMenu(npcId, info);
      game.changeState(GAME_STATES.MENU);
    } else {
      const tip = 15 + Math.floor((info.level || 1) * 2);
      game.coins = (game.coins || 0) + tip;
      game.turnManager.removeEntity(npcId);
      game.entityManager.destroyEntity(npcId);
      game.eventBus.emit('show_dialog', {
        text: `¡${info.name} te sonríe y te deja ${tip} Poké!\n\n(Equipo lleno: no puede unirse.)`
      });
      game.needsRender = true;
    }
  }

  /**
   * Maneja la interacción con el Kecleon Mercader.
   * @param {number} npcId - ID de la entidad
   */
  handleMerchantInteract(npcId) {
    const game = this.game;
    // openMerchantMenu ya pone estado MENU
    if (typeof game.uiManager?.openMerchantMenu === 'function') {
      game.uiManager.openMerchantMenu(npcId);
    } else {
      game.eventBus.emit('message', {
        text: 'El Kecleon no puede abrir la tienda ahora. Recarga con Ctrl+F5.',
        color: '#ffaa66'
      });
    }
  }
  /**
   * Maneja el daño residual (estados alterados y clima) al final del turno.
   * Aplica sus efectos cada 10 turnos (ticks).
   */
  handleTurnEnd(data) {
    const { turnCount } = data;
    // Choques/fallos no cuentan como paso de clima
    if (data.skippedEnemies) return;

    // Aplicar daño pasivo cada 10 turnos (pasos)
    if (turnCount % 10 !== 0) return;

    const game = this.game;
    if (!game || !game.entityManager) return;

    const fighters = game.entityManager.getEntitiesWithComponents('fighter', 'pokemonInfo');
    const weather = game.currentWeather || 'normal';

    for (const entityId of fighters) {
      const fighter = game.entityManager.getComponent(entityId, 'fighter');
      const info = game.entityManager.getComponent(entityId, 'pokemonInfo');
      
      if (!fighter || fighter.hp <= 0) continue;

      let damageTaken = 0;
      let damageReason = '';

      // Veneno/quemadura residual: solo clima aquí (el DoT de estado va en processStatusEffects)

      // --- Daño por Clima (IDs canónicos en español) ---
      const ability = info.ability ? String(info.ability).toLowerCase().replace(/-/g, '_') : '';
      const types = info.types || [];
      if (weather === 'tormenta_arena') {
        const immuneSand = types.includes('rock') || types.includes('ground')
          || types.includes('steel');
        if (!immuneSand) {
          damageTaken += Math.max(1, Math.floor(fighter.maxHp / 20));
          if (!damageReason) damageReason = 'sandstorm';
        }
      } else if (weather === 'granizo') {
        if (ability === 'ice_body') {
          const heal = Math.max(1, Math.floor(fighter.maxHp / 16));
          fighter.hp = Math.min(fighter.maxHp, fighter.hp + heal);
          if (entityId === game._playerId) {
            game.eventBus.emit('message', { text: '¡Cuerpo Gel restaura PS con el granizo!', color: '#aaddff' });
          }
        } else if (!types.includes('ice')) {
          damageTaken += Math.max(1, Math.floor(fighter.maxHp / 20));
          if (!damageReason) damageReason = 'hail';
        }
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
             const reviverIndex = inventory.findIndex(i => i.itemId === 'reviver_seed' && i.quantity > 0);
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
