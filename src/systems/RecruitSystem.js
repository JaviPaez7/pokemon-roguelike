/**
 * RecruitSystem.js — Reclutar en la mazmorra.
 *
 * Cuando el líder derrota a un salvaje, a veces este se levanta y pide unirse
 * (la probabilidad está en core/Recruitment.js). Si se acepta y hay sitio,
 * entra en el equipo; si el equipo está completo, se va a esperar a la base.
 * En la Torre del Desafío no hay base: con el equipo completo no se recluta,
 * y quien se une lo hace solo durante esa subida.
 *
 * Los Pokémon amistosos de los eventos de piso usan el mismo menú y las
 * mismas reglas al aceptar.
 */

import { MAX_PARTY_SIZE } from '../constants.js';
import { random } from '../core/Random.js';
import { recruitChance, isRecruitable } from '../core/Recruitment.js';
import { toSnapshot, restedSnapshot } from '../core/PokemonSnapshot.js';
import { addToRoster } from '../core/Profile.js';
import { heldHelpsRecruit } from '../core/HeldItems.js';

/** @param {import('../core/Game.js').Game} game */
function partySize(game) {
  return game.entityManager.getEntitiesWithComponents('partyMember').length;
}

/**
 * Si quien se une puede ir a la base cuando el equipo está completo.
 * @param {import('../core/Game.js').Game} game
 */
function hasBase(game) {
  return !!game.profile && !game.dungeon?.challenge;
}

/**
 * ¿Hay sitio para un recluta, en el equipo o en la base?
 * @param {import('../core/Game.js').Game} game
 */
export function canTakeRecruit(game) {
  return partySize(game) < MAX_PARTY_SIZE || hasBase(game);
}

/**
 * Tras derrotar a un salvaje: si se levanta y quiere unirse, lo deja en pie a
 * la espera de respuesta y pregunta.
 * @param {import('../core/Game.js').Game} game
 * @param {number} defeatedId
 * @param {number | null | undefined} attackerId
 * @returns {boolean} true si se ofrece el reclutamiento (la entidad sigue viva)
 */
export function tryRecruit(game, defeatedId, attackerId) {
  const em = game.entityManager;
  if (attackerId == null || attackerId !== game._playerId) return false;
  if (!em.hasComponent(defeatedId, 'aiControlled') || em.hasComponent(defeatedId, 'boss')) return false;
  const info = em.getComponent(defeatedId, 'pokemonInfo');
  const leader = em.getComponent(game._playerId, 'pokemonInfo');
  const fighter = em.getComponent(defeatedId, 'fighter');
  if (!info || !leader || !fighter || !isRecruitable(info.speciesId) || !canTakeRecruit(game)) return false;

  const species = game.pokemonData.find((p) => p.id === info.speciesId);
  const chance = recruitChance({
    speciesId: info.speciesId,
    captureRate: species?.captureRate,
    targetLevel: info.level,
    leaderLevel: leader.level,
    friendBow: heldHelpsRecruit(leader),
  });
  const forced = game.debug?.forceRecruit;
  const wantsToJoin = forced ?? random() < chance;
  if (!wantsToJoin) return false;

  // Se levanta y espera la respuesta sin actuar
  fighter.hp = Math.max(1, Math.floor(fighter.maxHp / 2));
  fighter.statusEffects = [];
  em.setComponent(defeatedId, 'fighter', fighter);
  em.removeComponent(defeatedId, 'aiControlled');
  em.setComponent(defeatedId, 'npcFriendly', { speciesId: info.speciesId, name: info.name });
  game.turnManager.removeEntity(defeatedId);

  game.uiManager.showDialog(
    `¡${info.name} se ha levantado!\n\nParece que quiere unirse a vuestro equipo.`,
    () => game.uiManager.openRecruitMenu(defeatedId, info),
  );
  return true;
}

/**
 * Se acepta al recluta: entra en el equipo o, si está completo, va a la base.
 * @param {import('../core/Game.js').Game} game
 * @param {number} id
 */
export function acceptRecruit(game, id) {
  const em = game.entityManager;
  const info = em.getComponent(id, 'pokemonInfo');
  const fighter = em.getComponent(id, 'fighter');
  if (!info || !fighter) {
    em.destroyEntity(id);
    return;
  }
  em.removeComponent(id, 'npcFriendly');

  if (partySize(game) < MAX_PARTY_SIZE) {
    em.setComponent(id, 'partyMember', { slot: partySize(game), isLeader: false, tactic: 'follow' });
    em.setComponent(id, 'aiControlled', { behavior: 'follower' });
    fighter.hp = Math.min(fighter.maxHp, Math.max(fighter.hp, Math.floor(fighter.maxHp * 0.6)));
    if (fighter.belly != null) fighter.belly = Math.min(fighter.maxBelly || 100, Math.max(fighter.belly, 50));
    fighter.statusEffects = [];
    em.setComponent(id, 'fighter', fighter);
    game.turnManager.addEntity(id, fighter.speed || 50, false);
    const onlyThisRun = game.dungeon?.challenge ? '\n\nSolo os acompañará durante esta subida a la torre.' : '';
    game.uiManager.showDialog(`¡${info.name} se ha unido a vuestro equipo!${onlyThisRun}`);
  } else if (hasBase(game)) {
    addToRoster(game.profile, restedSnapshot(toSnapshot(game.memberData(id)), game.movesData));
    game.turnManager.removeEntity(id);
    em.destroyEntity(id);
    game.uiManager.showDialog(`¡${info.name} se ha unido a vuestro equipo!\n\nComo ya sois cuatro, os esperará en la base.`);
  } else {
    game.turnManager.removeEntity(id);
    em.destroyEntity(id);
    game.uiManager.showDialog(`${info.name} quería unirse, pero en el equipo ya no cabe nadie más.`);
    game.needsRender = true;
    return;
  }

  game.stats.pokemonCaptured++;
  game.eventBus.emit('message', { text: `¡${info.name} se unió al equipo!`, color: '#00ffcc' });
  game.uiManager.playRecruitSound?.();
  game.needsRender = true;
  game.saveGameData();
}

/**
 * Se rechaza al recluta: se marcha.
 * @param {import('../core/Game.js').Game} game
 * @param {number} id
 */
export function declineRecruit(game, id) {
  const name = game.entityManager.getComponent(id, 'pokemonInfo')?.name;
  game.turnManager.removeEntity(id);
  game.entityManager.destroyEntity(id);
  if (name) game.eventBus.emit('message', `${name} se marchó.`);
  game.needsRender = true;
}
