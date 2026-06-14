import { ACTIONS, GAME_STATES } from '../constants.js';
import { attemptCapture } from './CaptureSystem.js';
import { useItem } from './ItemSystem.js';
import { checkEvolution, evolve } from './EvolutionSystem.js';

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
              isLeader: false,
              tactic: 'follow'
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

    const result = evolve(targetPokemonId, evoData, game.entityManager, game.pokemonData, game.movesData);
    if (result.success) {
      // Consumir el objeto
      const slot = game.inventory.find(s => s.itemId === itemId);
      if (slot) {
        slot.quantity--;
        if (slot.quantity <= 0) {
          const idx = game.inventory.indexOf(slot);
          if (idx > -1) game.inventory.splice(idx, 1);
        }
      }
      
      // Animación / Texto de evolución
      game.eventBus.emit('show_dialog', { text: `¡Anda! ¡${result.oldName} está evolucionando!\n\n... ... ...\n\n¡Enhorabuena! Tu ${result.oldName} ha evolucionado a ${result.newName}!` });
      game.eventBus.emit('message', { text: `¡${result.oldName} ha evolucionado a ${result.newName}!`, color: '#ffff00' });
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
    }
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

  // Direcciones
  let dx = 0, dy = 0;
  switch (playerPos.facing) {
    case 'up': dy = -1; break;
    case 'down': dy = 1; break;
    case 'left': dx = -1; break;
    case 'right': dx = 1; break;
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
  game.eventBus.emit('message', `¡${pokemonInfo.name} lanzó ${itemData.name}!`);

  if (hitEntityId) {
    const targetFighter = game.entityManager.getComponent(hitEntityId, 'fighter');
    const targetInfo = game.entityManager.getComponent(hitEntityId, 'pokemonInfo');
    
    if (targetFighter && targetInfo) {
      if (itemData.type === 'throwable') {
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

