import { ACTIONS, GAME_STATES, MAX_PARTY_SIZE } from '../constants.js';
import { attemptCapture } from './CaptureSystem.js';
import { useItem } from './ItemSystem.js';
import { checkEvolution, evolve } from './EvolutionSystem.js';
import { getAbility } from './AbilitySystem.js';

/**
 * Usa un objeto del inventario sobre un objetivo.
 * @param {import('../Game.js').Game} game
 * @param {string} itemId
 * @param {number} targetPokemonId
 */
export function useInventoryItem(game, itemId, targetPokemonId) {
  const itemData = game.itemsData.find(i => i.id === itemId);
  if (!itemData) return;

  if (itemData.type === 'capture') {
    const targetFighter = game.entityManager.getComponent(targetPokemonId, 'fighter');
    const targetInfo = game.entityManager.getComponent(targetPokemonId, 'pokemonInfo');

    if (!targetFighter || !targetInfo) {
      game.eventBus.emit('message', 'No hay ningún Pokémon objetivo cerca.');
      return;
    }
    game.stats.itemsUsed = (game.stats.itemsUsed || 0) + 1;

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
          if (party.length < MAX_PARTY_SIZE) {
            game.entityManager.setComponent(targetPokemonId, 'partyMember', {
              slot: party.length,
              isLeader: false,
              tactic: 'follow'
            });
            
            const ai = game.entityManager.getComponent(targetPokemonId, 'aiControlled') || {};
            ai.behavior = 'follower';
            game.entityManager.setComponent(targetPokemonId, 'aiControlled', ai);

            // Curar un poco al capturado
            if (targetFighter) {
              targetFighter.hp = Math.max(1, Math.floor(targetFighter.maxHp * 0.5));
              targetFighter.statusEffects = [];
              game.entityManager.setComponent(targetPokemonId, 'fighter', targetFighter);
              game.turnManager.addEntity(targetPokemonId, targetFighter.speed || 50, false);
            }

            game.eventBus.emit('message', `¡${targetInfo.name} se ha unido a tu equipo!`);
          } else {
            const bonus = 20 + Math.floor((targetInfo.level || 1) * 3);
            game.coins = (game.coins || 0) + bonus;
            game.eventBus.emit('message', {
              text: `¡Equipo lleno! Liberaste a ${targetInfo.name} (+${bonus} Poké).`,
              color: '#ffd700'
            });
            game.turnManager.removeEntity(targetPokemonId);
            game.entityManager.destroyEntity(targetPokemonId);
          }
          try { game.saveGameData(); } catch (e) {}
        }
        // Avanzar turno tras cerrar el diálogo de captura
        game.turnManager.processTurn(
          { type: ACTIONS.WAIT },
          (id, act) => game.combat.executeEntityAction(id, act),
          (id) => game.combat.getEnemyAIAction(id)
        );
        game.needsRender = true;
      }
    });
    return; // No procesar turno hasta cerrar el diálogo
  } else if (itemData.type === 'evolution_stone') {
    const targetInfo = game.entityManager.getComponent(targetPokemonId, 'pokemonInfo');
    if (!targetInfo) {
      game.eventBus.emit('message', 'No hay un objetivo válido para usar la piedra.');
      return;
    }

    const evoData = checkEvolution(targetInfo, game.evolutionsData || [], itemId);
    if (!evoData) {
      game.eventBus.emit('show_dialog', { text: `No tuvo ningún efecto en ${targetInfo.name}...` });
      return;
    }

    // Confirmar evolución por piedra (consume la piedra solo si acepta)
    if (game.uiManager && typeof game.uiManager.openEvolutionMenu === 'function') {
      game.changeState(GAME_STATES.MENU);
      game.uiManager.openEvolutionMenu(targetPokemonId, evoData, { consumeStoneId: itemId });
      return;
    }

    // Fallback sin UI
    const result = evolve(targetPokemonId, evoData, game.entityManager, game.pokemonData, game.movesData);
    if (result.success) {
      const slot = game.inventory.find(s => s.itemId === itemId);
      if (slot) {
        slot.quantity--;
        if (slot.quantity <= 0) {
          const idx = game.inventory.indexOf(slot);
          if (idx > -1) game.inventory.splice(idx, 1);
        }
      }
      game.eventBus.emit('show_dialog', { text: `¡Enhorabuena! ¡${result.oldName} evolucionó a ${result.newName}!` });
      game.saveGameData();
    } else {
      game.eventBus.emit('message', result.messages.join(' '));
    }
  } else {
    const result = useItem(itemId, targetPokemonId, game.entityManager, game.inventory, game.itemsData, game.pokemonData, game.movesData, game);
    for (const msg of result.messages) {
      game.eventBus.emit('message', msg);
    }

    if (itemData.type === 'escape' && result.success) {
      game.saveGameData();
      game.changeState(GAME_STATES.TITLE);
      game.needsRender = true;
      return;
    }

    // Fallo (tripa llena, PS al máximo, etc.): no gastar turno ni contador
    if (!result.success || !result.consumed) {
      game.needsRender = true;
      return;
    }
    game.stats.itemsUsed = (game.stats.itemsUsed || 0) + 1;
  }

  game.turnManager.processTurn(
    { type: ACTIONS.WAIT },
    (id, act) => game.combat.executeEntityAction(id, act),
    (id) => game.combat.getEnemyAIAction(id)
  );
  game.needsRender = true;
}

/**
 * Lanza un objeto en línea recta.
 * @param {import('../Game.js').Game} game
 * @param {string} itemId
 */
export function throwInventoryItem(game, itemId) {
  const itemData = game.itemsData.find(i => i.id === itemId);
  if (!itemData) return;

  const playerId = game.getPlayerId();
  const playerPos = game.entityManager.getComponent(playerId, 'position');
  if (!playerPos) return;

  const slot = game.inventory.find(s => s.itemId === itemId);
  if (!slot) return;

  // Direcciones (incluye diagonal si el último movimiento fue en 8 dirs)
  let dx = playerPos.facingDx ?? 0;
  let dy = playerPos.facingDy ?? 0;
  if (dx === 0 && dy === 0) {
    switch (playerPos.facing) {
      case 'up': dy = -1; break;
      case 'down': dy = 1; break;
      case 'left': dx = -1; break;
      case 'right': dx = 1; break;
    }
  }

  // Consumir el objeto de inmediato
  slot.quantity--;
  if (slot.quantity <= 0) {
    const idx = game.inventory.indexOf(slot);
    if (idx > -1) game.inventory.splice(idx, 1);
  }

  let currentX = playerPos.x;
  let currentY = playerPos.y;
  const maxRange = 10;
  let hitEntityId = null;
  let distance = 0;

  for (let i = 1; i <= maxRange; i++) {
    const checkX = playerPos.x + dx * i;
    const checkY = playerPos.y + dy * i;

    // Verificar muros
    if (!game.tileMap.isInBounds(checkX, checkY) || !game.tileMap.isWalkable(checkX, checkY)) {
      break;
    }

    currentX = checkX;
    currentY = checkY;
    distance = i;

    // Verificar colisión con entidad
    const entityAt = game.entityManager.getEntityAt(checkX, checkY);
    if (entityAt) {
      hitEntityId = entityAt;
      break;
    }
  }

  // Animación del proyectil
  game.eventBus.emit('throw_projectile', {
    startX: playerPos.x, startY: playerPos.y,
    endX: currentX, endY: currentY,
    spriteUrl: itemData.spriteUrl,
    sprite: itemData.sprite
  });

  const pokemonInfo = game.entityManager.getComponent(playerId, 'pokemonInfo');
  const throwerName = pokemonInfo?.name || 'Tu Pokémon';
  game.eventBus.emit('message', `¡${throwerName} lanzó ${itemData.name}!`);

  if (hitEntityId) {
    const targetFighter = game.entityManager.getComponent(hitEntityId, 'fighter');
    const targetInfo = game.entityManager.getComponent(hitEntityId, 'pokemonInfo');
    
    if (targetFighter && targetInfo) {
      if (!targetFighter.statusEffects) targetFighter.statusEffects = [];
      if (itemData.type === 'capture') {
        const isParty = game.entityManager.hasComponent(hitEntityId, 'partyMember');
        const isMerchant = game.entityManager.hasComponent(hitEntityId, 'npcMerchant');
        const isFriendly = game.entityManager.hasComponent(hitEntityId, 'npcFriendly');
        if (isParty || isMerchant || isFriendly) {
          const restored = game.inventory.find(s => s.itemId === itemId);
          if (restored) restored.quantity++;
          else game.inventory.push({ itemId, quantity: 1 });
          game.eventBus.emit('message', 'No puedes capturar a ese Pokémon.');
          game.needsRender = true;
          return;
        } else {
          // Restaurar slot (useInventoryItem lo consumirá)
          const restored = game.inventory.find(s => s.itemId === itemId);
          if (restored) restored.quantity++;
          else game.inventory.push({ itemId, quantity: 1 });
          useInventoryItem(game, itemId, hitEntityId);
          return;
        }
      } else if (itemData.type === 'food' && game.entityManager.hasComponent(hitEntityId, 'partyMember')) {
        const value = itemData.value || 20;
        if (itemData.maxBellyBonus) {
          targetFighter.maxBelly = (targetFighter.maxBelly || 100) + itemData.maxBellyBonus;
        }
        const before = targetFighter.belly || 0;
        targetFighter.belly = Math.min(targetFighter.maxBelly || 100, before + value);
        game.entityManager.setComponent(hitEntityId, 'fighter', targetFighter);
        game.eventBus.emit('message', {
          text: `¡${targetInfo.name} recibió ${itemData.name}! (+${Math.floor(targetFighter.belly - before)} tripa)`,
          color: '#88cc66'
        });
      } else if (
        game.entityManager.hasComponent(hitEntityId, 'partyMember') &&
        (itemData.type === 'heal' || ['oran_berry', 'sitrus_berry', 'potion', 'super_potion', 'hyper_potion'].includes(itemData.id))
      ) {
        let heal = itemData.value || 20;
        if (itemData.id === 'oran_berry') heal = 10;
        if (itemData.id === 'sitrus_berry') heal = Math.max(1, Math.floor(targetFighter.maxHp / 4));
        if (itemData.id === 'hyper_potion') heal = Math.max(1, Math.floor(targetFighter.maxHp / 2));
        const before = targetFighter.hp;
        targetFighter.hp = Math.min(targetFighter.maxHp, targetFighter.hp + heal);
        game.entityManager.setComponent(hitEntityId, 'fighter', targetFighter);
        game.eventBus.emit('message', {
          text: `¡${targetInfo.name} recuperó ${targetFighter.hp - before} PS con ${itemData.name}!`,
          color: '#88ffaa'
        });
      } else if (
        game.entityManager.hasComponent(hitEntityId, 'partyMember') &&
        (itemData.type === 'status_cure' || itemData.type === 'full_heal' ||
         ['antidote', 'paralyze_heal', 'burn_heal', 'awakening', 'full_heal'].includes(itemData.id))
      ) {
        const before = (targetFighter.statusEffects || []).length;
        if (itemData.type === 'full_heal' || itemData.id === 'full_heal') {
          targetFighter.statusEffects = [];
        } else {
          const map = {
            antidote: 'poison', paralyze_heal: 'paralyze', burn_heal: 'burn',
            awakening: 'sleep'
          };
          const st = map[itemData.id];
          if (st) targetFighter.statusEffects = (targetFighter.statusEffects || []).filter(s => s.type !== st);
        }
        game.entityManager.setComponent(hitEntityId, 'fighter', targetFighter);
        const cured = before - (targetFighter.statusEffects || []).length;
        game.eventBus.emit('message', {
          text: cured > 0
            ? `¡${targetInfo.name} se curó con ${itemData.name}!`
            : `¡${itemData.name} no tuvo efecto en ${targetInfo.name}!`,
          color: '#aaddff'
        });
      } else if (itemData.type === 'throwable') {
        const damage = itemData.value || 15;
        targetFighter.hp = Math.max(0, targetFighter.hp - damage);
        game.eventBus.emit('message', `¡El objeto golpeó a ${targetInfo.name} infligiendo ${damage} PS de daño!`);
        game.entityManager.setComponent(hitEntityId, 'fighter', targetFighter);
        
        if (targetFighter.hp <= 0) {
          game.eventBus.emit('pokemon_fainted', { 
            entityId: hitEntityId, 
            speciesId: targetInfo.speciesId,
            attackerId: playerId
          });
        }
      } else if (itemData.type === 'slumber_orb' || itemData.id === 'slumber_orb') {
        if (game.entityManager.hasComponent(hitEntityId, 'partyMember')) {
          const restored = game.inventory.find(s => s.itemId === itemId);
          if (restored) restored.quantity++;
          else game.inventory.push({ itemId, quantity: 1 });
          game.eventBus.emit('message', { text: '¡No uses eso contra tu equipo!', color: '#ffaa66' });
          game.needsRender = true;
          return;
        }
        const ab = getAbility(targetInfo);
        if (ab === 'insomnia' || ab === 'vital_spirit') {
          game.eventBus.emit('message', {
            text: ab === 'insomnia' ? '¡Insomnio evitó el sueño!' : '¡Espíritu Vital evitó el sueño!',
            color: '#aaccff'
          });
        } else if (targetFighter.statusEffects.some(s => s.type === 'sleep')) {
          game.eventBus.emit('message', `¡${targetInfo.name} ya estaba dormido!`);
        } else {
          let turns = 3;
          if (ab === 'early_bird') turns = 2;
          targetFighter.statusEffects.push({ type: 'sleep', turnsLeft: turns });
          game.eventBus.emit('message', {
            text: `¡${targetInfo.name} se durmió por la Sueñosfera!`,
            color: '#aaccff'
          });
        }
        game.entityManager.setComponent(hitEntityId, 'fighter', targetFighter);
      } else if (itemData.type === 'petrify_orb' || itemData.id === 'petrify_orb') {
        if (game.entityManager.hasComponent(hitEntityId, 'partyMember')) {
          const restored = game.inventory.find(s => s.itemId === itemId);
          if (restored) restored.quantity++;
          else game.inventory.push({ itemId, quantity: 1 });
          game.eventBus.emit('message', { text: '¡No uses eso contra tu equipo!', color: '#ffaa66' });
          game.needsRender = true;
          return;
        }
        if ((targetInfo.types || []).includes('ice')) {
          game.eventBus.emit('message', {
            text: `¡No afecta a ${targetInfo.name} (tipo Hielo)!`,
            color: '#ccccaa'
          });
        } else if (targetFighter.statusEffects.some(s => s.type === 'freeze')) {
          game.eventBus.emit('message', `¡${targetInfo.name} ya estaba petrificado!`);
        } else {
          targetFighter.statusEffects.push({ type: 'freeze', turnsLeft: 3 });
          game.eventBus.emit('message', {
            text: `¡${targetInfo.name} quedó petrificado!`,
            color: '#ccccaa'
          });
        }
        game.entityManager.setComponent(hitEntityId, 'fighter', targetFighter);
      } else {
        // Objeto normal lanzado hace 2 de daño fijo
        targetFighter.hp = Math.max(0, targetFighter.hp - 2);
        game.eventBus.emit('message', `¡El objeto golpeó a ${targetInfo.name} infligiendo 2 PS de daño!`);
        game.entityManager.setComponent(hitEntityId, 'fighter', targetFighter);
        
        if (targetFighter.hp <= 0) {
          game.eventBus.emit('pokemon_fainted', { 
            entityId: hitEntityId, 
            speciesId: targetInfo.speciesId,
            attackerId: playerId
          });
        }
      }
    }
  } else {
    // Cae al suelo
    if (Math.random() < 0.8 && itemData.type !== 'throwable') {
      game.entityManager.createItemEntity(itemId, 1, currentX, currentY, itemData.spriteUrl);
      game.eventBus.emit('message', `El objeto cayó al suelo.`);
    } else {
      game.eventBus.emit('message', `El objeto se hizo añicos.`);
    }
  }

  // Avanzar turno
  game.turnManager.processTurn(
    { type: ACTIONS.WAIT },
    (id, act) => game.combat.executeEntityAction(id, act),
    (id) => game.combat.getEnemyAIAction(id)
  );
  game.needsRender = true;
}

