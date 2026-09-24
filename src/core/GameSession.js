import { GAME_STATES } from '../constants.js';
import { loadGame } from './SaveManager.js';
import { spawnFromSnapshot } from './PokemonSnapshot.js';
import { enterTown } from './TownSession.js';
import { TOWN } from '../map/Town.js';

/** Estadísticas de un perfil nuevo; las que falten en una partida guardada se rellenan con estas. */
const EMPTY_STATS = {
  pokemonDefeated: 0,
  pokemonCaptured: 0,
  floorsExplored: 0,
  itemsUsed: 0,
  totalDamageDealt: 0,
  totalDamageTaken: 0,
  turnsPlayed: 0,
};

/**
 * Carga la partida guardada.
 * @param {import('../Game.js').Game} game
 */
export async function loadSavedGame(game) {
  const save = loadGame();
  if (!save) {
    game.uiManager?.showDialog?.(
      'No se pudo cargar la partida (corrupta o de otra versión).',
      () => game.uiManager.openTitleScreen()
    );
    return;
  }

  const { pokedexSeen, stats, ...profile } = save.profile;
  game.profile = profile;
  game.pokedexSeen = new Set(pokedexSeen || []);
  game.stats = { ...EMPTY_STATS, ...stats };
  game.inventory = save.bag;
  game.coins = save.wallet ?? 0;
  game._messageLog = [];
  game.messageLog?.clear?.();
  const refundNotice = takeBallRefundNotice(profile);

  if (!save.run) {
    enterTown(game);
    const migrated = profile.flags?.migratedFromRun && !profile.flags.migrationNoticeShown;
    if (migrated) profile.flags.migrationNoticeShown = true;
    game.eventBus.emit('show_dialog', {
      text: (migrated
        ? `¡El juego ha cambiado!\n\nAhora tu equipo, ${profile.teamName}, tiene una base en ${TOWN.name}. ` +
          'Tus Pokémon, tu mochila y tu dinero te esperan aquí, y las mazmorras que ya habías atravesado ' +
          'cuentan como completadas.\n\nMira el tablón y sal por el camino del sur para seguir explorando.'
        : `Partida cargada.\n\n${profile.teamName} está en ${TOWN.name}.`) + refundNotice,
      instant: true,
    });
    if (migrated || refundNotice) game.saveGameData();
    return;
  }

  const data = save.run;
  game.runSeed = data.runSeed;
  game.dungeonId = data.dungeonId;
  game.expedition = data.expedition ?? null;
  game._currentFloor = data.currentFloor;
  game.currentWeather = data.currentWeather || data.weather || 'normal';
  game._safeSpawnOnLoad = true;
  game._bagAlmostFullWarned = false;
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
  // El piso se regenera, pero el viento sigue donde estaba
  game._floorTurns = data.floorTurns ?? 0;
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
    text: `Partida cargada.\n\nPiso ${game.getCurrentFloor()}: ${game.zoneName}.\nLíder: ${leader ? leader.name : '—'}.\nClima: ${w}.\nObjetos en suelo: ${nObj}. Trampas: ${nTrap}.${evoHint}\n\nEl mapa de este piso se ha regenerado.${refundNotice}`,
    instant: true,
    callback: () => {}
  });
  if (refundNotice) game.saveGameData();
}

/**
 * Aviso, una sola vez, de las Poké Balls que la migración v3 → v4 cambió por
 * dinero. Quita la marca del perfil.
 * @param {Object} profile
 * @returns {string} Texto para añadir al diálogo de carga, o ''
 */
function takeBallRefundNotice(profile) {
  const refund = profile.flags?.ballRefund;
  if (!refund) return '';
  delete profile.flags.ballRefund;
  return `\n\nYa no hay Poké Balls: ahora, cuando el líder derrota a un Pokémon, a veces pide unirse al equipo. ` +
    `Las que teníais se han cambiado por ${refund} Poké (las del almacén, en el banco).`;
}
