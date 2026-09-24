/**
 * Expedition.js — Salir del pueblo hacia una mazmorra y volver.
 *
 * Al volver, según cómo acabe la expedición:
 * - `cleared`: mazmorra completada. Se abren las siguientes y se ganan puntos de rango.
 * - `defeated`: el equipo cae. Se pierde el dinero y lo que había en la mochila.
 * - `escaped`: se sale con una Cuerda Huida. Se conserva todo.
 * - `mission`: se vuelve tras cumplir una misión. Se conserva todo.
 * - `blown`: el viento expulsa al equipo por pasar demasiado tiempo en un
 *   piso. Mismas pérdidas que caer.
 * Salvo al caer, se cobran las misiones cumplidas; al caer vuelven a quedar
 * pendientes. En todos los casos el equipo vuelve curado, los reclutados pasan
 * a la base y empieza un día nuevo.
 *
 * La Torre del Desafío tiene reglas roguelike: se entra con copias de nivel 5
 * del equipo y un kit fijo; la mochila y el dinero de verdad esperan en el
 * pueblo (`profile.stash`) y nada de lo que pase dentro cambia la plantilla.
 */

import { GAME_STATES } from '../constants.js';
import { getDungeon, floorCount } from './Dungeons.js';
import { newRunSeed } from './Random.js';
import { getMember, updateMember, addToRoster, addRankPoints, defeatLosses, markCleared } from './Profile.js';
import { toSnapshot, restedSnapshot, spawnFromSnapshot } from './PokemonSnapshot.js';
import { enterTown } from './TownSession.js';
import { saveLifetimeStats } from '../ui/menus/StatsMenu.js';
import { claimRewards, revertDoneMissions, MISSION_TYPE_NAMES } from './Missions.js';

/** Kit con el que se entra en la Torre del Desafío. */
export const CHALLENGE_KIT = [
  { itemId: 'potion', quantity: 2 },
  { itemId: 'apple', quantity: 3 },
  { itemId: 'oran_berry', quantity: 2 },
  { itemId: 'ether', quantity: 1 },
  { itemId: 'antidote', quantity: 1 },
  { itemId: 'paralyze_heal', quantity: 1 },
  { itemId: 'awakening', quantity: 1 },
  { itemId: 'reviver_seed', quantity: 1 },
  { itemId: 'escape_rope', quantity: 1 },
];
export const CHALLENGE_MONEY = 140;
export const CHALLENGE_LEVEL = 5;

/** Premio por completar la Torre del Desafío. */
export const CHALLENGE_PRIZE = { money: 5000, rankPoints: 1000 };

/**
 * Puntos de rango por completar una mazmorra: más la primera vez.
 * @param {import('./Dungeons.js').Dungeon} dungeon
 * @param {boolean} firstTime
 */
export function clearRankPoints(dungeon, firstTime) {
  return floorCount(dungeon) * (firstTime ? 10 : 3);
}

/**
 * Sale del pueblo con el equipo hacia una mazmorra.
 * @param {import('./Game.js').Game} game
 * @param {string} dungeonId
 */
export async function startExpedition(game, dungeonId) {
  const dungeon = getDungeon(dungeonId);
  const profile = game.profile;
  const em = game.entityManager;

  let team = profile.teamUids.map((uid) => restedSnapshot(getMember(profile, uid), game.movesData));
  if (dungeon.challenge) {
    profile.stash = { bag: game.inventory, wallet: game.coins };
    game.inventory = CHALLENGE_KIT.map((s) => ({ ...s }));
    game.coins = CHALLENGE_MONEY;
    team = team.map((member) => challengeCopy(game, member));
  }

  em.clear();
  game.turnManager.reset();
  team.forEach((member, slot) => {
    const id = spawnFromSnapshot(game, member, { slot, isLeader: slot === 0 });
    if (slot === 0) game._playerId = id;
  });

  game.dungeonId = dungeon.id;
  game.runSeed = newRunSeed();
  game._currentFloor = dungeon.floors[0] - 1; // changeFloor('down') entra en el primero
  game.currentWeather = 'normal';
  game.fovRadiusModifier = 0;
  game.playerPathHistory = [];
  game.expedition = { dungeonId: dungeon.id, day: profile.day, statsAtStart: { ...game.stats } };
  Object.assign(game, {
    _bellyWarned20: false,
    _bellyWarned10: false,
    _stairsAnnounced: false,
    _seenMonsterHouseDialog: false,
    _bagAlmostFullWarned: false,
    _lowPpWarnedThisFloor: false,
    _restoredItemCount: 0,
    _deathReason: null,
  });
  game._messageLog = [];
  game.messageLog?.clear?.();

  // Pasar a EXPLORING antes de cambiar de piso vacía la cola de acciones del pueblo
  game.changeState(GAME_STATES.EXPLORING);
  await game.floorManager.changeFloor('down');

  const rules = dungeon.challenge
    ? '\n\nReglas del desafío: equipo a nivel 5 y kit básico. Tu mochila y tu dinero esperan en el pueblo.'
    : '';
  const here = profile.missions.accepted
    .filter((m) => m.dungeonId === dungeon.id && m.status === 'accepted')
    .sort((a, b) => a.floor - b.floor)
    .map((m) => `· Piso ${m.floor}: ${MISSION_TYPE_NAMES[m.type]} (${m.clientName})`);
  const missions = here.length ? `\n\nMisiones aquí:\n${here.join('\n')}` : '';
  game.eventBus.emit('show_dialog', {
    text: `${dungeon.name}\n\n${dungeon.description}${rules}${missions}`,
    instant: true,
  });
}

/**
 * Copia de nivel 5 de un miembro del equipo para la Torre del Desafío.
 * @param {import('./Game.js').Game} game
 * @param {Object} member - Ficha
 */
function challengeCopy(game, member) {
  const em = game.entityManager;
  const id = em.createPokemon(member.speciesId, CHALLENGE_LEVEL, 0, 0, false);
  em.setComponent(id, 'partyMember', { slot: 0, isLeader: false, tactic: member.tactic, uid: member.uid });
  const copy = toSnapshot(game.party.find((p) => p.id === id));
  em.destroyEntity(id);
  return copy;
}

/**
 * Termina la expedición y vuelve al pueblo con un resumen.
 * @param {import('./Game.js').Game} game
 * @param {'cleared' | 'defeated' | 'escaped' | 'mission' | 'blown'} outcome
 */
export function endExpedition(game, outcome) {
  const profile = game.profile;
  const dungeon = game.dungeon;
  const challenge = !!dungeon.challenge;
  const lost = outcome === 'defeated' || outcome === 'blown';
  const lines = [];

  if (challenge) {
    // Lo de dentro se queda dentro: vuelven la mochila y el dinero de verdad
    game.inventory = profile.stash?.bag ?? game.inventory;
    game.coins = profile.stash?.wallet ?? game.coins;
    profile.stash = null;
  } else {
    lines.push(...bringTeamHome(game));
    if (lost) {
      const { lostMoney, lostItems } = defeatLosses(game.inventory, game.coins);
      game.inventory = [];
      game.coins = 0;
      if (lostMoney || lostItems) lines.push(`Se perdieron ${lostMoney} Poké y ${lostItems} objetos de la mochila.`);
    }
  }

  let missionPoints = 0;
  if (lost) {
    const reverted = revertDoneMissions(profile);
    if (reverted) lines.push(`${reverted === 1 ? 'La misión cumplida queda' : `Las ${reverted} misiones cumplidas quedan`} pendiente${reverted === 1 ? '' : 's'}: el cliente no llegó al pueblo.`);
  } else {
    const itemName = (id) => game.itemsData.find((i) => i.id === id)?.name ?? id;
    const claimed = claimRewards(profile, {
      bag: game.inventory,
      wallet: game.coins,
      maxSlots: game.maxInventorySize,
      itemName,
    });
    game.coins = claimed.wallet;
    missionPoints = claimed.rankPoints;
    lines.push(...claimed.lines);
  }

  let points = missionPoints;
  if (outcome === 'cleared') {
    const firstTime = !profile.clearedDungeons.includes(dungeon.id);
    const opened = markCleared(profile, dungeon.id);
    points += clearRankPoints(dungeon, firstTime);
    if (challenge) {
      game.coins += CHALLENGE_PRIZE.money;
      points += CHALLENGE_PRIZE.rankPoints;
      lines.push(`Premio del desafío: ${CHALLENGE_PRIZE.money} Poké.`);
    }
    for (const id of opened) lines.push(`Nueva mazmorra: ${getDungeon(id).name}.`);
  }
  if (points > 0) {
    const newRank = addRankPoints(profile, points);
    lines.push(`+${points} puntos de rango.`);
    if (newRank) lines.push(`¡El equipo sube a rango ${newRank.name}!`);
  }

  recordLifetimeStats(game, outcome === 'cleared');
  profile.day += 1;

  const title = {
    cleared: `¡${dungeon.name} completada!`,
    defeated: '¡El equipo ha caído!',
    escaped: 'Habéis vuelto al pueblo.',
    mission: '¡Misión cumplida! Volvéis al pueblo.',
    blown: '¡El viento os ha expulsado de la mazmorra!',
  }[outcome];
  const subtitle = lost ? 'Os rescataron y os llevaron de vuelta al pueblo.' : '';

  enterTown(game, { arrival: 'return' });
  game.saveGameData();
  game.eventBus.emit('show_dialog', {
    text: [title, subtitle, ...lines].filter(Boolean).join('\n\n'),
  });
}

/**
 * Pasa a la plantilla el estado del equipo al volver (niveles, movimientos) y
 * añade a quien se haya unido durante la expedición.
 * @param {import('./Game.js').Game} game
 * @returns {string[]} Líneas para el resumen
 */
function bringTeamHome(game) {
  const profile = game.profile;
  const lines = [];
  const team = [];
  // game.party ya viene en el orden de la formación
  for (const member of game.party) {
    const rested = restedSnapshot(toSnapshot(member), game.movesData);
    if (rested.uid != null && getMember(profile, rested.uid)) {
      updateMember(profile, rested);
      team.push(rested.uid);
    } else {
      team.push(addToRoster(profile, rested));
      lines.push(`${rested.name} se une a la base del equipo.`);
    }
  }
  // Protagonista y compañero siempre al frente, en ese orden
  const fixed = [profile.heroUid, profile.partnerUid].filter((uid) => uid != null);
  profile.teamUids = [...fixed, ...team.filter((uid) => !fixed.includes(uid))].slice(0, 4);
  return lines;
}

/**
 * Suma a las estadísticas históricas lo que ha pasado en esta expedición.
 * @param {import('./Game.js').Game} game
 * @param {boolean} cleared
 */
function recordLifetimeStats(game, cleared) {
  const start = game.expedition?.statsAtStart ?? {};
  const delta = Object.fromEntries(
    Object.entries(game.stats).map(([key, value]) => [key, (value || 0) - (start[key] || 0)]),
  );
  try {
    saveLifetimeStats(game, cleared, delta);
  } catch (e) {}
}
