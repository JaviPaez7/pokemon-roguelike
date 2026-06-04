import { GAME_STATES } from '../../constants.js';
import { loadGame } from '../SaveManager.js';

/**
 * Inicia una nueva partida con el Pokémon inicial seleccionado.
 * @param {import('../Game.js').Game} game
 * @param {number|string} starterPokemonId
 */
export function startNewGame(game, starterPokemonId) {
  console.log(`[Game] Iniciando nueva partida con: ${starterPokemonId}`);

  game.entityManager.clear();
  game.turnManager.reset();
  game._messageLog = [];
  game._currentFloor = 1;
  game.inventory = [
    { itemId: 'potion', quantity: 3 },
    { itemId: 'pokeball', quantity: 5 }
  ];
  game.coins = 100;
  game.stats = {
    pokemonDefeated: 0,
    pokemonCaptured: 0,
    floorsExplored: 1,
    itemsUsed: 0,
    totalDamageDealt: 0,
    totalDamageTaken: 0,
    turnsPlayed: 0
  };
  game.pokedexSeen = new Set([starterPokemonId]);

  game.floorManager.generateFloor();

  const startPos = game._playerStart;

  game._playerId = game.entityManager.createPokemon(
    starterPokemonId,
    5,
    startPos.x,
    startPos.y,
    false
  );

  game.entityManager.setComponent(game._playerId, 'partyMember', {
    slot: 0,
    isLeader: true
  });

  const fighterData = game.entityManager.getComponent(game._playerId, 'fighter');
  game.turnManager.addEntity(
    game._playerId,
    fighterData ? fighterData.speed : 50,
    true
  );

  game.floorManager.spawnEnemies();
  game._updateCamera();
  game._updateFOV();
  game.floorManager.preloadVisibleSprites();

  game.changeState(GAME_STATES.EXPLORING);
  game.eventBus.emit('show_dialog', {
    text: `¡Bienvenido a la mazmorra de PokéRogue!\n\nEstás en el Piso 1: ${game.zoneName}. ¡Encuentra las escaleras descendentes para avanzar!`,
    instant: true,
    callback: () => {}
  });

  game.needsRender = true;
}

/**
 * Carga la partida guardada.
 * @param {import('../Game.js').Game} game
 */
export function loadSavedGame(game) {
  const data = loadGame();
  if (!data) return;

  game.seed = data.seed;
  game._currentFloor = data.currentFloor;
  game.inventory = data.inventory;
  game.stats = data.stats;
  game.coins = data.coins || 100;
  game.pokedexSeen = data.pokedexSeen;

  game.entityManager.clear();
  game.turnManager.reset();

  game._playerId = null;
  data.party.forEach((p, idx) => {
    const id = game.entityManager.createEntity();

    game.entityManager.setComponent(id, 'position', {
      x: 0,
      y: 0,
      facing: 'down',
      prevX: 0,
      prevY: 0,
      moveStartTime: 0
    });

    game.entityManager.setComponent(id, 'pokemonInfo', {
      speciesId: p.speciesId,
      name: p.name,
      level: p.level,
      xp: p.xp,
      currentMoves: p.currentMoves,
      types: p.types
    });

    game.entityManager.setComponent(id, 'fighter', {
      hp: p.hp,
      maxHp: p.maxHp,
      attack: p.attack,
      defense: p.defense,
      spAtk: p.spAtk,
      spDef: p.spDef,
      speed: p.speed,
      statusEffects: (p.statusEffects || []).map(s => typeof s === 'string' ? { type: s, turnsLeft: -1 } : s)
    });

    const pokeRef = game.pokemonData.find(poke => poke.id === p.speciesId || poke.name.toLowerCase() === p.speciesId);
    game.entityManager.setComponent(id, 'sprite', {
      url: pokeRef ? pokeRef.sprite : `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${p.speciesId}.png`,
      image: null,
      loaded: false
    });

    game.entityManager.setComponent(id, 'partyMember', {
      slot: idx,
      isLeader: p.isLeader
    });

    if (p.isLeader) {
      game._playerId = id;
    }

    game.turnManager.addEntity(id, p.speed, p.isLeader);
  });

  game._currentFloor--;
  game.floorManager.changeFloor('down');
  game.floorManager.preloadVisibleSprites();
  game.changeState(GAME_STATES.EXPLORING);
}
