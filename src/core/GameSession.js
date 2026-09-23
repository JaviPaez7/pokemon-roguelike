import { GAME_STATES } from '../constants.js';
import { loadGame } from './SaveManager.js';
import { newRunSeed } from './Random.js';
import { spawnFromSnapshot } from './PokemonSnapshot.js';

/**
 * Inicia una nueva partida con el Pokémon inicial seleccionado.
 * @param {import('../Game.js').Game} game
 * @param {number|string} starterPokemonId
 */
export function startNewGame(game, starterPokemonId) {
  console.log(`[Game] Iniciando nueva partida con: ${starterPokemonId}`);

  game.entityManager.clear();
  game.turnManager.reset();
  game.runSeed = newRunSeed();
  game._messageLog = [];
  if (game.messageLog) game.messageLog.clear();
  game.dungeonId = 'torre_desafio';
  game._currentFloor = game.dungeon.floors[0];
  game._lastStarterId = starterPokemonId;
  game._deathReason = null;
  game._bellyWarned20 = false;
  game._bellyWarned10 = false;
  game._stairsAnnounced = false;
  game._seenMonsterHouseDialog = false;
  game._bagAlmostFullWarned = false;
  game._lifetimeStatsSaved = false;
  game._lowPpWarnedThisFloor = false;
  game._restoredItemCount = 0;
  game.fovRadiusModifier = 0;
  game.inventory = [
    { itemId: 'potion', quantity: 2 },
    { itemId: 'pokeball', quantity: 4 },
    { itemId: 'apple', quantity: 3 },
    { itemId: 'oran_berry', quantity: 2 },
    { itemId: 'ether', quantity: 1 },
    { itemId: 'antidote', quantity: 1 },
    { itemId: 'paralyze_heal', quantity: 1 },
    { itemId: 'awakening', quantity: 1 },
    { itemId: 'reviver_seed', quantity: 1 },
    { itemId: 'escape_rope', quantity: 1 }
  ];
  game.coins = 140;
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
    isLeader: true,
    tactic: 'follow'
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
    text: `¡Bienvenido a PokéRogue!\n\nPiso 1: ${game.zoneName}.\n\n• Choca = ataque básico (sin PP)\n• 1-4 = movimientos (gastan PP)\n• Z = recoger / escaleras / examinar\n• Tab = cambiar de líder\n• X = mochila (Cuerda Huida te saca al menú)\n• Come manzanas si baja la tripa\n• Captura: mira al salvaje (también diagonal) y usa Poké Ball\n• ¡Busca las escaleras!`,
    instant: true,
    callback: () => {}
  });

  game.needsRender = true;
}

/**
 * Carga la partida guardada.
 * @param {import('../Game.js').Game} game
 */
export async function loadSavedGame(game) {
  const data = loadGame();
  if (!data) {
    game.uiManager?.showDialog?.(
      'No se pudo cargar la partida (corrupta o de otra versión).',
      () => game.uiManager.openTitleScreen()
    );
    return;
  }

  game.runSeed = data.runSeed;
  game.dungeonId = data.dungeonId ?? 'torre_desafio';
  game._currentFloor = data.currentFloor;
  game.currentWeather = data.currentWeather || data.weather || 'normal';
  game.inventory = data.inventory;
  game.stats = data.stats;
  game.coins = data.coins ?? 0;
  game.pokedexSeen = data.pokedexSeen;
  game._safeSpawnOnLoad = true;
  game._bagAlmostFullWarned = false;
  game._lifetimeStatsSaved = false;
  game._seenMonsterHouseDialog = true; // no repetir tutorial MH al cargar
  game._skipFloorHealOnLoad = true;
  game._preserveWeatherOnLoad = true;
  game._skipFloorEventsOnLoad = true;
  game._restoredItemCount = 0;
  game._pendingFovModifier = data.fovRadiusModifier || 0;
  game._pendingFloorItems = Array.isArray(data.floorItems) ? data.floorItems : null;
  game._pendingFloorTraps = Array.isArray(data.floorTraps) ? data.floorTraps : null;
  game._pendingFloorMerchants = Array.isArray(data.floorMerchants) ? data.floorMerchants : null;
  game._autoHealUsedThisFloor = false;
  game._critHpWarnedThisFloor = false;
  game._autoStatusCureUsedThisFloor = false;
  game._lowPpWarnedThisFloor = false;

  game.entityManager.clear();
  game.turnManager.reset();

  game._playerId = null;
  data.party.forEach((p, idx) => {
    const id = spawnFromSnapshot(game, p, { slot: idx, isLeader: !!p.isLeader });
    if (p.isLeader) game._playerId = id;
    // Solo vivos en el sistema de turnos (changeFloor también lo filtrará)
    if (p.hp > 0) {
      game.turnManager.addEntity(id, p.speed, p.isLeader);
    }
  });

  // Si no hay líder vivo, promover al primero con PS > 0
  const leaderFighter = game._playerId != null
    ? game.entityManager.getComponent(game._playerId, 'fighter')
    : null;
  if (game._playerId == null || !leaderFighter || leaderFighter.hp <= 0) {
    const living = game.entityManager.getEntitiesWithComponents('partyMember', 'fighter')
      .find(id => {
        const f = game.entityManager.getComponent(id, 'fighter');
        return f && f.hp > 0;
      });
    if (living != null) {
      if (game._playerId != null) {
        const oldMem = game.entityManager.getComponent(game._playerId, 'partyMember');
        if (oldMem) {
          oldMem.isLeader = false;
          game.entityManager.setComponent(game._playerId, 'partyMember', oldMem);
        }
      }
      game._playerId = living;
      const mem = game.entityManager.getComponent(living, 'partyMember');
      if (mem) {
        mem.isLeader = true;
        game.entityManager.setComponent(living, 'partyMember', mem);
      }
      game.entityManager.removeComponent(living, 'aiControlled');
      game.turnManager.setPlayerEntityId(living);
    }
  }

  game._currentFloor--;
  const savedTurnCount = data.turnCount || data.stats?.turnsPlayed || 0;
  await game.floorManager.changeFloor('down');
  // changeFloor hace reset() del TurnManager: restaurar contador después
  if (typeof game.turnManager.setTurnCount === 'function') {
    game.turnManager.setTurnCount(savedTurnCount);
  } else {
    game.turnManager._turnCount = savedTurnCount;
  }
  game.floorManager.preloadVisibleSprites();
  game.changeState(GAME_STATES.EXPLORING);
  const leader = game.entityManager.getComponent(game._playerId, 'pokemonInfo');
  const nObj = game._restoredItemCount || 0;
  const nTrap = (game.entityManager?.getEntitiesWithComponents?.('trap') || []).length;
  const wLabels = { lluvia: 'Lluvia', sol: 'Sol', tormenta_arena: 'Tormenta de arena', granizo: 'Granizo', normal: 'Despejado' };
  const w = wLabels[game.currentWeather] || game.currentWeather || 'Despejado';
  const evoPending = game.entityManager.getEntitiesWithComponents('partyMember', 'pokemonInfo')
    .some(id => game.entityManager.getComponent(id, 'pokemonInfo')?.pendingEvolution);
  const evoHint = evoPending ? '\nHay una evolución pendiente al reanudar.' : '';
  game.eventBus.emit('show_dialog', {
    text: `Partida cargada.\n\nPiso ${game.getCurrentFloor()}: ${game.zoneName}.\nLíder: ${leader ? leader.name : '—'}.\nClima: ${w}.\nObjetos en suelo: ${nObj}. Trampas: ${nTrap}.${evoHint}\n\nEl mapa de este piso se ha regenerado.`,
    instant: true,
    callback: () => {}
  });
}
