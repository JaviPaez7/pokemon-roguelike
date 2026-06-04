import { RNG } from 'rot-js';

/**
 * Orquesta y activa eventos aleatorios al entrar en un nuevo piso.
 * Probabilidad base: 30% de que ocurra un evento.
 * 
 * @param {import('../core/Game.js').Game} game - Instancia del juego
 */
export function triggerFloorEvent(game) {
  // Asegurar que el modificador de FOV del viento fuerte se reinicia en cada piso
  game.fovRadiusModifier = 0;

  if (game._currentFloor === 1) return; // No hay eventos en el primer piso

  // 30% de probabilidad de activar un evento
  if (Math.random() > 0.3) return;

  const eventTypes = ['merchant', 'friendly', 'treasure', 'wind'];
  const event = eventTypes[Math.floor(Math.random() * eventTypes.length)];

  switch (event) {
    case 'merchant': {
      // Colocar mercader Kecleon en la habitación inicial (pero no sobre el jugador)
      const startRoom = game.tileMap.rooms.find(r => r.isStart) || game.tileMap.rooms[0];
      const pos = findFreeTileInRoom(startRoom, game);
      if (pos) {
        createMerchantNPC(game, pos.x, pos.y);
        game.eventBus.emit('message', '¡Un Kecleon Mercader ha montado una tienda ambulante en este piso! 🏪');
      }
      break;
    }

    case 'friendly': {
      // Colocar un Pokémon amigable en una habitación aleatoria no inicial
      const targetRoom = game.tileMap.rooms.find(r => !r.isStart) || game.tileMap.rooms[0];
      const pos = findFreeTileInRoom(targetRoom, game);
      if (pos) {
        createFriendlyNPC(game, pos.x, pos.y);
        game.eventBus.emit('message', '¡Un Pokémon salvaje parece amigable y busca unirse a tu equipo! 🤝');
      }
      break;
    }

    case 'treasure': {
      // Colocar un item valioso en una habitación aleatoria
      const targetRoom = game.tileMap.rooms.find(r => !r.isStart) || game.tileMap.rooms[0];
      const pos = findFreeTileInRoom(targetRoom, game);
      if (pos) {
        // Seleccionar un item raro (rarity <= 0.05)
        const rareItems = game.itemsData.filter(item => (item.rarity || 0.1) <= 0.05);
        const item = rareItems.length > 0 ? rareItems[Math.floor(Math.random() * rareItems.length)] : game.itemsData[0];
        
        game.entityManager.createItemEntity(item.id, 1, pos.x, pos.y);
        game.eventBus.emit('show_dialog', {
          text: '¡Sientes una vibración misteriosa!\n\nUn valioso tesoro escondido ha aparecido en algún lugar de este piso.'
        });
      }
      break;
    }

    case 'wind': {
      // Reducir la visibilidad en este piso
      game.fovRadiusModifier = -2;
      game.eventBus.emit('show_dialog', {
        text: '¡El clima cambia repentinamente!\n\nUn viento fuerte y misterioso sopla en este piso. La visibilidad se reduce temporalmente.'
      });
      break;
    }
  }
}

/**
 * Busca una posición transitable y desocupada dentro de una habitación.
 * @param {Object} room
 * @param {import('../core/Game.js').Game} game
 * @returns {{x: number, y: number}|null}
 */
function findFreeTileInRoom(room, game) {
  const validPositions = [];
  for (let y = room.y + 1; y < room.y + room.h - 1; y++) {
    for (let x = room.x + 1; x < room.x + room.w - 1; x++) {
      if (game.tileMap.getTile(x, y).id === 1) { // 1 = FLOOR
        if (!game.entityManager.getEntityAt(x, y, true)) {
          // No colocar sobre el jugador
          const playerPos = game.entityManager.getComponent(game._playerId, 'position');
          if (!playerPos || (playerPos.x !== x || playerPos.y !== y)) {
            validPositions.push({ x, y });
          }
        }
      }
    }
  }

  if (validPositions.length === 0) return null;
  return validPositions[Math.floor(Math.random() * validPositions.length)];
}

/**
 * Crea una entidad de mercader Kecleon con catálogo.
 * @param {import('../core/Game.js').Game} game
 * @param {number} x
 * @param {number} y
 */
function createMerchantNPC(game, x, y) {
  const id = game.entityManager.createEntity();

  game.entityManager.setComponent(id, 'position', {
    x: x,
    y: y,
    facing: 'down',
    prevX: x,
    prevY: y,
    moveStartTime: 0
  });

  game.entityManager.setComponent(id, 'pokemonInfo', {
    speciesId: 'kecleon',
    name: 'Mercader Kecleon',
    level: 50,
    types: ['normal']
  });

  game.entityManager.setComponent(id, 'fighter', {
    hp: 999,
    maxHp: 999,
    attack: 999,
    defense: 999,
    spAtk: 999,
    spDef: 999,
    speed: 100,
    statusEffects: []
  });

  game.entityManager.setComponent(id, 'sprite', {
    url: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/352.png',
    image: null,
    loaded: false
  });

  // Catálogo de items a la venta (3 a 5 items aleatorios con precios basados en rareza)
  const numItems = 3 + Math.floor(Math.random() * 3); // 3 a 5
  const selectedItems = [];
  const itemsDB = game.itemsData;
  
  for (let i = 0; i < numItems; i++) {
    const item = itemsDB[Math.floor(Math.random() * itemsDB.length)];
    // Precio base según rareza: un item común cuesta menos, uno raro más
    const price = Math.max(10, Math.floor(15 / (item.rarity || 0.1)));
    selectedItems.push({
      id: item.id,
      name: item.name,
      price: price,
      description: item.description
    });
  }

  game.entityManager.setComponent(id, 'npcMerchant', {
    items: selectedItems
  });

  // Pre-cargar sprite
  if (game.renderer?.spriteManager) {
    game.renderer.spriteManager.loadSprite('https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/352.png');
  }
}

/**
 * Crea una entidad de Pokémon amigable.
 * @param {import('../core/Game.js').Game} game
 * @param {number} x
 * @param {number} y
 */
function createFriendlyNPC(game, x, y) {
  // Elegir un Pokémon aleatorio no legendario (id < 144)
  const validPokemon = game.pokemonData.filter(p => p.id < 144 && p.id !== 150);
  const species = validPokemon[Math.floor(Math.random() * validPokemon.length)];
  
  const level = Math.max(1, game._currentFloor);
  const npcId = game.entityManager.createPokemon(species.id, level, x, y, false);
  
  // Agregar componente de interacción amistosa
  game.entityManager.setComponent(npcId, 'npcFriendly', {
    speciesId: species.id,
    name: species.name
  });

  // Asegurar que no sea atacado de forma normal y no ataque al jugador
  const fighter = game.entityManager.getComponent(npcId, 'fighter');
  if (fighter) {
    fighter.hp = fighter.maxHp;
    game.entityManager.setComponent(npcId, 'fighter', fighter);
  }
}
