import { RNG } from 'rot-js';
import { MAX_PARTY_SIZE } from '../constants.js';

/**
 * Orquesta y activa eventos aleatorios al entrar en un nuevo piso.
 * Probabilidad base: ~38% de que ocurra un evento.
 * 
 * @param {import('../core/Game.js').Game} game - Instancia del juego
 */
export function triggerFloorEvent(game) {
  // Al cargar: restaurar FOV/Kecleon y no tirar eventos nuevos
  if (game._skipFloorEventsOnLoad) {
    game._skipFloorEventsOnLoad = false;
    if (game._pendingFovModifier != null) {
      game.fovRadiusModifier = game._pendingFovModifier;
      if (game._pendingFovModifier < 0) {
        game.eventBus.emit('message', {
          text: 'El viento misterioso sigue reduciendo la visión.',
          color: '#cc99ff'
        });
      }
      game._pendingFovModifier = null;
    } else {
      game.fovRadiusModifier = 0;
    }
    if (Array.isArray(game._pendingFloorMerchants)) {
      const n = game._pendingFloorMerchants.length;
      for (const m of game._pendingFloorMerchants) {
        restoreMerchantNPC(game, m.x, m.y, m.items);
      }
      game._pendingFloorMerchants = null;
      if (n > 0) {
        game.eventBus.emit('message', {
          text: 'El Kecleon Mercader sigue en este piso.',
          color: '#88ff88'
        });
      }
    }
    return;
  }

  // Asegurar que el modificador de FOV del viento fuerte se reinicia en cada piso
  game.fovRadiusModifier = 0;

  if (game._currentFloor === 1) return; // No hay eventos en el primer piso

  // 30% de probabilidad de activar un evento
  if (RNG.getUniform() > 0.38) return;

  const eventTypes = ['merchant', 'friendly', 'treasure', 'wind', 'rest', 'rest', 'rest', 'merchant'];
  const event = eventTypes[Math.floor(RNG.getUniform() * eventTypes.length)];

  switch (event) {
    case 'merchant': {
      // Colocar mercader Kecleon en la habitación inicial (pero no sobre el jugador)
      const startRoom = game.tileMap.rooms.find(r => r.isStart) || game.tileMap.rooms[0];
      const pos = findFreeTileInRoom(startRoom, game);
      if (pos) {
        createMerchantNPC(game, pos.x, pos.y);
        game.eventBus.emit('message', {
          text: '¡Un Kecleon Mercader ha montado una tienda ambulante en este piso!',
          color: '#88ff88'
        });
      }
      break;
    }

    case 'friendly': {
      const partySize = game.entityManager.getEntitiesWithComponents('partyMember').length;
      if (partySize >= MAX_PARTY_SIZE) {
        const tip = 12 + Math.floor((game._currentFloor || 1) * 1.5);
        game.coins = (game.coins || 0) + tip;
        game.eventBus.emit('message', {
          text: `Un Pokémon amigable te saluda y te deja ${tip} Poké (equipo lleno).`,
          color: '#ffd700'
        });
        break;
      }
      const targetRoom = game.tileMap.rooms.find(r => !r.isStart) || game.tileMap.rooms[0];
      const pos = findFreeTileInRoom(targetRoom, game);
      if (pos) {
        createFriendlyNPC(game, pos.x, pos.y);
        game.eventBus.emit('message', {
          text: '¡Un Pokémon salvaje parece amigable y busca unirse a tu equipo!',
          color: '#88ff88'
        });
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
        const item = rareItems.length > 0 ? rareItems[Math.floor(RNG.getUniform() * rareItems.length)] : game.itemsData[0];
        
        game.entityManager.createItemEntity(item.id, 1, pos.x, pos.y, item.spriteUrl);
        const bonus = 20 + Math.floor(RNG.getUniform() * 25) + (game._currentFloor || 1);
        game.coins = (game.coins || 0) + bonus;
        game.eventBus.emit('show_dialog', {
          text: `¡Sientes una vibración misteriosa!\n\nUn valioso tesoro escondido ha aparecido en algún lugar de este piso.\n\n(+${bonus} Poké en el bolsillo)`
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

    case 'rest': {
      // Mini-campamento: cura ligera al equipo vivo
      const party = game.entityManager.getEntitiesWithComponents('partyMember', 'fighter', 'pokemonInfo');
      let healed = 0;
      for (const id of party) {
        const f = game.entityManager.getComponent(id, 'fighter');
        const info = game.entityManager.getComponent(id, 'pokemonInfo');
        if (!f || !info || f.hp <= 0) continue;
        const gain = Math.max(1, Math.floor(f.maxHp * 0.2));
        f.hp = Math.min(f.maxHp, f.hp + gain);
        f.belly = Math.min(f.maxBelly || 100, (f.belly || 0) + 15);
        if (f.statusEffects && f.statusEffects.length) f.statusEffects = [];
        game.entityManager.setComponent(id, 'fighter', f);
        if (info.currentMoves) {
          info.currentMoves.forEach(m => { m.currentPP = Math.min(m.maxPP, m.currentPP + 2); });
          game.entityManager.setComponent(id, 'pokemonInfo', info);
        }
        healed++;
      }
      if (healed > 0) {
        game.eventBus.emit('show_dialog', {
          text: 'Encuentras un claro tranquilo.\n\nEl equipo descansa: recupera PS, tripa, algo de PP y se cura de estados.'
        });
      }
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
  return validPositions[Math.floor(RNG.getUniform() * validPositions.length)];
}

/**
 * Crea una entidad de mercader Kecleon con catálogo.
 * @param {import('../core/Game.js').Game} game
 * @param {number} x
 * @param {number} y
 */
export function createMerchantNPC(game, x, y, presetItems = null) {
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

  // Catálogo útil: comida, curación, balls, ether… (evitar basura)
  const preferredTypes = new Set([
    'heal', 'food', 'pp_restore', 'pp_restore_full', 'capture',
    'seed', 'evolution_stone', 'stat_boost', 'gummi', 'status_cure',
    'escape', 'revive', 'full_heal'
  ]);
  const preferredIds = new Set([
    'apple', 'big_apple', 'oran_berry', 'ether', 'max_elixir',
    'potion', 'super_potion', 'reviver_seed', 'pokeball', 'great_ball',
    'escape_rope', 'antidote', 'paralyze_heal', 'burn_heal', 'awakening', 'full_heal'
  ]);
  const pool = game.itemsData.filter(i =>
    preferredIds.has(i.id) || preferredTypes.has(i.type)
  );
  const itemsDB = pool.length >= 3 ? pool : game.itemsData;

  const numItems = 4 + Math.floor(RNG.getUniform() * 2); // 4 a 5
  const selectedItems = [];
  const used = new Set();
  const floorMult = 1 + Math.min(1.5, (game._currentFloor || 1) * 0.04);

  const pushItem = (item) => {
    if (!item || used.has(item.id)) return;
    used.add(item.id);
    let base = Math.max(10, Math.floor(18 / (item.rarity || 0.1)));
    if ((game._currentFloor || 1) <= 5 && (item.id === 'pokeball' || item.id === 'apple' || item.id === 'potion' || item.id === 'ether' || item.id === 'oran_berry')) {
      base = Math.floor(base * 0.65);
    }
    const price = Math.min(250, Math.max(8, Math.floor(base * floorMult)));
    selectedItems.push({
      id: item.id,
      name: item.name,
      price,
      description: item.description
    });
  };

  // Siempre algo útil de supervivencia
  const must = ['apple', 'potion', 'pokeball'];
  if ((game._currentFloor || 1) <= 8) must.push('ether');
  if ((game._currentFloor || 1) >= 10) must.push('reviver_seed');
  for (const mustId of must) {
    pushItem(game.itemsData.find(i => i.id === mustId));
  }

  while (selectedItems.length < numItems) {
    let item = itemsDB[Math.floor(RNG.getUniform() * itemsDB.length)];
    let tries = 0;
    while (used.has(item.id) && tries < 12) {
      item = itemsDB[Math.floor(RNG.getUniform() * itemsDB.length)];
      tries++;
    }
    if (used.has(item.id)) break;
    pushItem(item);
  }

  game.entityManager.setComponent(id, 'npcMerchant', {
    items: (presetItems && presetItems.length) ? presetItems : selectedItems
  });

  // Pre-cargar sprite
  if (game.renderer?.spriteManager) {
    game.renderer.spriteManager.loadSprite('https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/352.png');
  }
}

/** Restaura un Kecleon guardado tras regenerar el mapa. */
export function restoreMerchantNPC(game, x, y, items) {
  let px = x;
  let py = y;
  // El mapa se regenera: si la casilla antigua no sirve, colocar en sala inicial
  const walkable = game.tileMap && typeof game.tileMap.isWalkable === 'function'
    && game.tileMap.isWalkable(x, y)
    && game.entityManager.getEntityAt(x, y) == null;
  if (!walkable) {
    const startRoom = game.tileMap?.rooms?.find(r => r.isStart) || game.tileMap?.rooms?.[0];
    const pos = startRoom ? findFreeTileInRoom(startRoom, game) : null;
    if (pos) {
      px = pos.x;
      py = pos.y;
    }
  }
  createMerchantNPC(game, px, py, items || []);
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
  const species = validPokemon[Math.floor(RNG.getUniform() * validPokemon.length)];
  
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
