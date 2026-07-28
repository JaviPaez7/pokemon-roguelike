import { GAME_STATES, MAX_INVENTORY, MAX_PARTY_SIZE } from '../constants.js';
import { pickupItem } from '../systems/ItemSystem.js';
import { getAbility } from '../systems/AbilitySystem.js';
import { revertTransform } from '../systems/CombatSystem.js';

/**
 * Registra los listeners globales del EventBus en la instancia del juego.
 * @param {import('../Game.js').Game} game
 */
export function setupGameEventListeners(game) {
  game.eventBus.on('message', (data) => {
    const text = typeof data === 'string' ? data : (data.text || String(data));
    const color = typeof data === 'object' && data.color ? data.color : null;
    game._messageLog.push(text);
    if (game._messageLog.length > 50) {
      game._messageLog.shift();
    }
    if (game.messageLog && typeof game.messageLog.add === 'function') {
      if (color) {
        game.messageLog.add(text, color);
      } else if (/super eficaz|crítico/i.test(text)) {
        game.messageLog.add(text, '#ffcc44');
      } else if (/no es muy eficaz|no afecta/i.test(text)) {
        game.messageLog.add(text, '#9ca3af');
      } else if (/¡|efectiv|crít|daño|atac|usó|PS/i.test(text)) {
        game.messageLog.addCombat(text);
      } else if (/hambre|desfalle|peligro|veneno|trampa/i.test(text)) {
        game.messageLog.addDanger(text);
      } else if (/recogiste|unió|evolucion|restaur|escalera/i.test(text)) {
        game.messageLog.addSuccess(text);
      } else {
        game.messageLog.addSystem(text);
      }
    }
    game.needsRender = true;
  });

  game.eventBus.on('pokemon_fainted', (data) => {
    {
      const f0 = game.entityManager.getComponent(data.entityId, 'fighter');
      const i0 = game.entityManager.getComponent(data.entityId, 'pokemonInfo');
      const s0 = game.entityManager.getComponent(data.entityId, 'sprite');
      if (f0 && i0 && revertTransform(f0, i0, s0)) {
        game.entityManager.setComponent(data.entityId, 'fighter', f0);
        game.entityManager.setComponent(data.entityId, 'pokemonInfo', i0);
        if (s0) game.entityManager.setComponent(data.entityId, 'sprite', s0);
      }
    }
    if (data.entityId === game._playerId) {
      // Red de seguridad: intentar Semilla Revivir antes del game over
      const fighter = game.entityManager.getComponent(data.entityId, 'fighter');
      const info = game.entityManager.getComponent(data.entityId, 'pokemonInfo');
      const revIdx = game.inventory.findIndex(i => i.itemId === 'reviver_seed' && i.quantity > 0);
      if (revIdx !== -1 && fighter) {
        game.inventory[revIdx].quantity--;
        if (game.inventory[revIdx].quantity <= 0) game.inventory.splice(revIdx, 1);
        fighter.hp = fighter.maxHp;
        fighter.belly = fighter.maxBelly || 100;
        fighter.statusEffects = [];
        if (info?.currentMoves) info.currentMoves.forEach(m => { m.currentPP = m.maxPP; });
        game.entityManager.setComponent(data.entityId, 'fighter', fighter);
        if (info) game.entityManager.setComponent(data.entityId, 'pokemonInfo', info);
        game.eventBus.emit('message', {
          text: `¡${info ? info.name : 'Tu Pokémon'} revivió gracias a la Semilla Revivir!`,
          color: '#66ff99'
        });
        game.needsRender = true;
        return;
      }

      // Si hay aliados vivos, cambiar de líder en vez de game over
      const livingAlly = (game.entityManager.getEntitiesWithComponents('partyMember', 'fighter') || [])
        .find(id => {
          if (id === data.entityId) return false;
          const f = game.entityManager.getComponent(id, 'fighter');
          return f && f.hp > 0;
        });
      if (livingAlly != null) {
        if (fighter) {
          fighter.hp = 0;
          game.entityManager.setComponent(data.entityId, 'fighter', fighter);
        }
        game.turnManager.removeEntity(data.entityId);
        if (game.entityManager.hasComponent(data.entityId, 'aiControlled')) {
          game.entityManager.removeComponent(data.entityId, 'aiControlled');
        }
        game.eventBus.emit('message', {
          text: `¡${info ? info.name : 'El líder'} se debilitó! Otro Pokémon toma el mando.`,
          color: '#ff6666'
        });
        // swapLeader salta debilitados; si falla, forzar promoción del aliado vivo
        const beforeLeader = game._playerId;
        if (typeof game.swapLeader === 'function') {
          game.swapLeader();
        }
        if (game._playerId === beforeLeader || game._playerId === data.entityId || game._playerId == null) {
          // Promoción manual de emergencia
          const oldMem = game.entityManager.getComponent(data.entityId, 'partyMember');
          const newMem = game.entityManager.getComponent(livingAlly, 'partyMember');
          if (oldMem) { oldMem.isLeader = false; game.entityManager.setComponent(data.entityId, 'partyMember', oldMem); }
          if (newMem) { newMem.isLeader = true; game.entityManager.setComponent(livingAlly, 'partyMember', newMem); }
          game.entityManager.removeComponent(livingAlly, 'aiControlled');
          game._playerId = livingAlly;
          game.turnManager.setPlayerEntityId(livingAlly);
          const newInfo = game.entityManager.getComponent(livingAlly, 'pokemonInfo');
          game.eventBus.emit('message', `¡${newInfo ? newInfo.name : 'Un aliado'} es ahora el líder!`);
        }
        // El debilitado no debe actuar como seguidor
        if (game.entityManager.hasComponent(data.entityId, 'aiControlled')) {
          game.entityManager.removeComponent(data.entityId, 'aiControlled');
        }
        game.needsRender = true;
        return;
      }

      game.gameOver(data.reason === 'hambre' ? 'hambre' : 'combate');
    } else if (game.entityManager.hasComponent(data.entityId, 'partyMember')) {
      const allyInfo = game.entityManager.getComponent(data.entityId, 'pokemonInfo');
      const allyName = allyInfo ? allyInfo.name : 'Aliado';
      const fighter = game.entityManager.getComponent(data.entityId, 'fighter');

      // Semilla Revivir automática para aliados
      const revIdx = game.inventory.findIndex(i => i.itemId === 'reviver_seed' && i.quantity > 0);
      if (revIdx !== -1 && fighter) {
        game.inventory[revIdx].quantity--;
        if (game.inventory[revIdx].quantity <= 0) game.inventory.splice(revIdx, 1);
        fighter.hp = fighter.maxHp;
        fighter.belly = fighter.maxBelly || 100;
        fighter.statusEffects = [];
        if (allyInfo?.currentMoves) allyInfo.currentMoves.forEach(m => { m.currentPP = m.maxPP; });
        game.entityManager.setComponent(data.entityId, 'fighter', fighter);
        if (allyInfo) game.entityManager.setComponent(data.entityId, 'pokemonInfo', allyInfo);
        if (!game.entityManager.hasComponent(data.entityId, 'aiControlled') && data.entityId !== game._playerId) {
          game.entityManager.setComponent(data.entityId, 'aiControlled', {
            behavior: 'follower', detectRange: 5, alertedTo: null
          });
        }
        game.eventBus.emit('message', {
          text: `¡${allyName} revivió gracias a la Semilla Revivir!`,
          color: '#66ff99'
        });
        game.needsRender = true;
        return;
      }

      // Aliado debilitado: no reclutar ni destruir
      game.turnManager.removeEntity(data.entityId);
      game.eventBus.emit('message', { text: `¡${allyName} se ha debilitado!`, color: '#ff6666' });

      if (fighter) {
        fighter.hp = 0;
        game.entityManager.setComponent(data.entityId, 'fighter', fighter);
      }

      if (game.entityManager.hasComponent(data.entityId, 'aiControlled')) {
        game.entityManager.removeComponent(data.entityId, 'aiControlled');
      }

      game.needsRender = true;
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
            const floorBonus = (game._currentFloor || 1) <= 10 ? 8 : 0;
            const recruitChance = 24 + levelDiff + floorBonus;
            
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
        const bossCoins = 40 + Math.floor(Math.random() * 30) + (game._currentFloor || 1) * 2;
        game.coins = (game.coins || 0) + bossCoins;
        game.eventBus.emit('message', { text: `¡Botín del jefe: +${bossCoins} Poké!`, color: '#ffd700' });
        if (game.renderer && game.renderer.screenFlash) {
          game.renderer.screenFlash('rgba(255, 215, 0, 0.35)', 500);
        }
        
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

        const isFinalBoss = bossName === 'Mewtwo' || (game._currentFloor || 0) >= 50;
        game.eventBus.emit('show_dialog', { 
          text: isFinalBoss
            ? `¡Mewtwo ha sido derrotado!\n\nHas conquistado el PokéRogue.\n\nObjeto: ¡${itemName}!`
            : `¡El Jefe ${bossName} ha sido derrotado!\n\nLas escaleras han aparecido en el centro de la sala, y ha caído un objeto valioso: ¡${itemName}!`,
          callback: isFinalBoss
            ? () => { game.changeState(GAME_STATES.VICTORY); }
            : null
        });
        
        game.eventBus.emit('message', { 
          text: isFinalBoss ? '¡Victoria! Has completado la mazmorra.' : `¡Las escaleras y un ${itemName} aparecieron!`, 
          color: '#ffff00' 
        });

        game.saveGameData();
        game.needsRender = true;
        return;
      }

      // Recogida: un miembro del equipo puede encontrar un objeto
      {
        const partyIds = game.entityManager.getEntitiesWithComponents('partyMember', 'pokemonInfo') || [];
        const picker = partyIds.find(id => {
          const inf = game.entityManager.getComponent(id, 'pokemonInfo');
          const f = game.entityManager.getComponent(id, 'fighter');
          return f && f.hp > 0 && getAbility(inf) === 'pickup';
        });
        if (picker != null && Math.random() < 0.22 && (game.inventory || []).length < (game.maxInventorySize || 24)) {
          const pool = ['oran_berry', 'apple', 'potion', 'ether', 'pokeball', 'antidote'];
          const itemId = pool[Math.floor(Math.random() * pool.length)];
          const existing = game.inventory.find(s => s.itemId === itemId);
          if (existing) existing.quantity = (existing.quantity || 1) + 1;
          else game.inventory.push({ itemId, quantity: 1 });
          const meta = (game.itemsData || []).find(i => i.id === itemId);
          const pname = game.entityManager.getComponent(picker, 'pokemonInfo')?.name || 'Aliado';
          game.eventBus.emit('message', {
            text: `¡Recogida de ${pname}: encontró ${meta ? meta.name : itemId}!`,
            color: '#ffcc66'
          });
        }
      }

      // Monedas al derrotar (única fuente; no duplicar en combate)
      const defeatedInfo = game.entityManager.getComponent(data.entityId, 'pokemonInfo');
      if (defeatedInfo && data.attackerId != null) {
        const attackerIsParty = game.entityManager.hasComponent(data.attackerId, 'partyMember')
          || data.attackerId === game._playerId;
        if (attackerIsParty) {
          const lvl = defeatedInfo.level || 1;
          const coins = Math.max(3, Math.floor(lvl * (Math.random() * 2 + 2)));
          game.coins = (game.coins || 0) + coins;
          game.eventBus.emit('message', { text: `+${coins} Poké`, color: '#ffd700' });
        }
      }

      // Reclutamiento Post-Combate
      const party = game.entityManager.getEntitiesWithComponents('partyMember');
      if (data.attackerId === game._playerId && Math.random() < 0.15 && party.length < MAX_PARTY_SIZE) {
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
      if (party.length < MAX_PARTY_SIZE && info) {
        game.entityManager.setComponent(npcId, 'partyMember', {
          slot: party.length,
          isLeader: false,
          tactic: 'follow'
        });
        game.entityManager.setComponent(npcId, 'aiControlled', { behavior: 'follower' });
        game.entityManager.removeComponent(npcId, 'npcFriendly');
        
        const fighter = game.entityManager.getComponent(npcId, 'fighter');
        if (fighter) {
          fighter.hp = Math.min(fighter.maxHp, Math.max(fighter.hp, Math.floor(fighter.maxHp * 0.6)));
          if (fighter.belly != null) {
            fighter.belly = Math.min(fighter.maxBelly || 100, Math.max(fighter.belly, 50));
          }
          fighter.statusEffects = [];
          game.entityManager.setComponent(npcId, 'fighter', fighter);
        }
        game.turnManager.addEntity(npcId, fighter ? fighter.speed : 50, false);

        game.eventBus.emit('show_dialog', {
          text: `¡${info.name} se ha unido a tu equipo de exploración!\n\n(Recupera un poco de energía al unirse.)`
        });
        try { game.saveGameData(); } catch (e) {}
      } else if (info) {
        const bonus = 25 + Math.floor((info.level || 1) * 3);
        game.coins = (game.coins || 0) + bonus;
        game.entityManager.destroyEntity(npcId);
        game.eventBus.emit('show_dialog', {
          text: `¡Equipo lleno! Liberaste a ${info.name} (+${bonus} Poké).`
        });
        game.saveGameData();
      } else {
        game.entityManager.destroyEntity(npcId);
      }
    } else {
      game.entityManager.destroyEntity(data.entityId);
    }
  });

  game.eventBus.on('floor_change', (data) => {
    // Esperar fade + generación; FloorManager re-habilita input en finally
    Promise.resolve(game.floorManager.changeFloor(data.direction || 'down')).catch(err => {
      console.error('[Game] Error al cambiar de piso:', err);
      game.inputHandler.enabled = true;
    });
  });

  game.eventBus.on('item_picked_up', (data) => {
    const result = pickupItem(
      data.entityId,
      data.itemEntity,
      game.entityManager,
      game.inventory,
      game.maxInventorySize || MAX_INVENTORY,
      game.itemsData
    );
    game.eventBus.emit('message', {
      text: result.message,
      color: result.success ? '#88ccff' : '#ff8888'
    });
    if (!result.success && result.message && result.message.includes('llena')) {
      game.eventBus.emit('message', {
        text: 'Abre la mochila (X) y descarta algo para hacer sitio.',
        color: '#ffcc88'
      });
    }
    if (result.success && game.uiManager && game.uiManager.sfx && game.uiManager.sfx.playConfirmSound) {
      try { game.uiManager.sfx.playConfirmSound(); } catch (e) {}
    }
    if (result.success) {
      const maxInv = game.maxInventorySize || 24;
      const len = (game.inventory || []).length;
      if (len >= maxInv - 1 && len < maxInv) {
        game.eventBus.emit('message', {
          text: `Bolsa casi llena (${len}/${maxInv}).`,
          color: '#ffcc88'
        });
      }
    }
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
              const slot = info.currentMoves[data.index];
              let effHint = '';
              const pos = game.entityManager.getComponent(game._playerId, 'position');
              if (pos && game.typeChart?.chart) {
                let fdx = pos.facingDx ?? 0;
                let fdy = pos.facingDy ?? 0;
                if (fdx === 0 && fdy === 0) {
                  [fdx, fdy] = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[pos.facing] || [0, 0];
                }
                let lookId = game.entityManager.getEntityAt(pos.x + fdx, pos.y + fdy);
                // Fallback adyacente (p. ej. tras paso diagonal)
                if (lookId == null) {
                  for (let oy = -1; oy <= 1 && lookId == null; oy++) {
                    for (let ox = -1; ox <= 1; ox++) {
                      if (ox === 0 && oy === 0) continue;
                      const id = game.entityManager.getEntityAt(pos.x + ox, pos.y + oy);
                      if (id != null && game.entityManager.hasComponent(id, 'fighter')
                          && !game.entityManager.hasComponent(id, 'partyMember')) {
                        lookId = id;
                        break;
                      }
                    }
                  }
                }
                const lookInfo = lookId != null ? game.entityManager.getComponent(lookId, 'pokemonInfo') : null;
                if (lookInfo && !game.entityManager.hasComponent(lookId, 'partyMember')) {
                  let mult = 1;
                  for (const t of (lookInfo.types || [])) {
                    const row = game.typeChart.chart[move.type];
                    if (row && row[t] !== undefined) mult *= row[t];
                  }
                  if (mult > 1) effHint = ' · ¡Supereficaz!';
                  else if (mult === 0) effHint = ' · No afecta';
                  else if (mult < 1) effHint = ' · Poco eficaz';
                }
              }
              game.eventBus.emit('message', {
                text: `Ataque listo: ${move.name} (${slot.currentPP}/${slot.maxPP} PP)${effHint}`,
                color: effHint.includes('Supereficaz') ? '#ffcc44' : (effHint.includes('No afecta') ? '#ff8888' : '#e0e0e0')
              });
            }
          }
        }
        break;
    }
  });
}
