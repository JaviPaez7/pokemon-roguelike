import { describe, it, expect, beforeEach } from 'vitest';
import movesData from '../../src/data/moves.json';
import itemsData from '../../src/data/items.json';
import typeChart from '../../src/data/types.json';
import { EntityManager } from '../../src/entities/EntityManager.js';
import { EventBus } from '../../src/core/EventBus.js';
import { aiCanUse, aiHasMove, setReserved } from '../../src/core/MoveSlots.js';
import { restedSnapshot, spawnFromSnapshot } from '../../src/core/PokemonSnapshot.js';
import { createProfile, getMember, setMoveReserved } from '../../src/core/Profile.js';
import { setSeed } from '../../src/core/Random.js';
import { useItem } from '../../src/systems/ItemSystem.js';
import { triggerTrap } from '../../src/systems/TrapSystem.js';
import { selectBestMove } from '../../src/systems/CombatSystem.js';
import { getEnemyAction } from '../../src/entities/EnemyAI.js';

const TACKLE = 33; // Placaje
const EMBER = 52; // Ascuas
const WATER_GUN = 55; // Pistola Agua
const RECOVER = 105; // Recuperación

/**
 * @param {number} moveId
 * @param {Object} [extra]
 */
const slot = (moveId, extra = {}) => ({ moveId, currentPP: 5, maxPP: 25, enabled: true, ...extra });

/** Anulación, como la deja CombatSystem. */
const disabled = (moveId) => slot(moveId, { enabled: false, _disableTurns: 3 });

beforeEach(() => setSeed(7));

describe('MoveSlots: la reserva es solo para la IA', () => {
  it('la IA no elige lo reservado, lo anulado ni lo que no tiene PP', () => {
    expect(aiCanUse(slot(TACKLE))).toBe(true);
    expect(aiCanUse(slot(TACKLE, { reserved: true }))).toBe(false);
    expect(aiCanUse(disabled(TACKLE))).toBe(false);
    expect(aiCanUse(slot(TACKLE, { currentPP: 0 }))).toBe(false);
    expect(aiCanUse(null)).toBe(false);
  });

  it('aiHasMove dice si le queda algo que elegir', () => {
    expect(aiHasMove({ currentMoves: [slot(TACKLE, { reserved: true }), disabled(EMBER)] })).toBe(false);
    expect(aiHasMove({ currentMoves: [slot(TACKLE, { reserved: true }), slot(EMBER)] })).toBe(true);
    expect(aiHasMove({ currentMoves: [] })).toBe(false);
    expect(aiHasMove(null)).toBe(false);
  });

  it('setReserved pone y quita el campo sin tocar Anulación', () => {
    const s = disabled(TACKLE);
    setReserved(s, true);
    expect(s).toMatchObject({ reserved: true, enabled: false, _disableTurns: 3 });
    setReserved(s, false);
    expect(s).not.toHaveProperty('reserved');
    expect(s.enabled).toBe(false);
  });
});

describe('la ficha conserva la reserva', () => {
  it('descansar cura los PP y Anulación, pero la reserva se queda', () => {
    const member = { name: 'Squirtle', maxHp: 40, hp: 3, currentMoves: [slot(TACKLE, { reserved: true }), disabled(WATER_GUN)] };
    const rested = restedSnapshot(member, movesData);
    expect(rested.currentMoves).toEqual([
      { moveId: TACKLE, currentPP: 25, maxPP: 25, enabled: true, reserved: true },
      { moveId: WATER_GUN, currentPP: 25, maxPP: 25, enabled: true },
    ]);
  });

  it('un movimiento copiado con Mimético vuelve a Mimético con la reserva de su casilla', () => {
    const mimic = movesData.find((m) => m.effect === 'mimic');
    const member = { maxHp: 40, currentMoves: [slot(EMBER, { _mimicOriginal: mimic.id, reserved: true })] };
    expect(restedSnapshot(member, movesData).currentMoves).toEqual([
      { moveId: mimic.id, currentPP: mimic.pp, maxPP: mimic.pp, enabled: true, reserved: true },
    ]);
  });

  it('al crear la entidad desde la ficha (cargar, salir de expedición, el pueblo) sigue reservado', () => {
    const em = new EntityManager(new EventBus());
    const game = { entityManager: em, pokemonData: [] };
    const id = spawnFromSnapshot(
      game,
      { speciesId: 7, name: 'Squirtle', hp: 40, maxHp: 40, currentMoves: [slot(TACKLE, { reserved: true }), disabled(WATER_GUN), slot(EMBER)] },
      { slot: 1, isLeader: false },
    );
    const moves = em.getComponent(id, 'pokemonInfo').currentMoves;
    expect(moves.map((m) => !!m.reserved)).toEqual([true, false, false]);
    expect(moves[1]).toMatchObject({ enabled: false, _disableTurns: 3 });
  });

  it('setMoveReserved lo apunta en la plantilla', () => {
    const profile = createProfile({
      teamName: 'Equipo Aurora',
      hero: { name: 'Charmander', currentMoves: [slot(EMBER)] },
      partner: { name: 'Squirtle', currentMoves: [slot(TACKLE), slot(WATER_GUN)] },
    });
    const partner = () => getMember(profile, profile.partnerUid);
    expect(setMoveReserved(profile, profile.partnerUid, WATER_GUN, true)).toBe(true);
    expect(partner().currentMoves.map((m) => !!m.reserved)).toEqual([false, true]);
    expect(setMoveReserved(profile, profile.partnerUid, WATER_GUN, false)).toBe(true);
    expect(partner().currentMoves[1]).not.toHaveProperty('reserved');
    // Un movimiento que no conoce o un Pokémon que no está: no hace nada
    expect(setMoveReserved(profile, profile.partnerUid, RECOVER, true)).toBe(false);
    expect(setMoveReserved(profile, 99, TACKLE, true)).toBe(false);
  });
});

describe('lo que cura PP y Anulación no quita la reserva', () => {
  /**
   * Un Pokémon con un movimiento reservado y gastado, otro anulado y gastado, y
   * un objeto en la mochila.
   * @param {string} itemId
   */
  function withItem(itemId) {
    const em = new EntityManager(new EventBus());
    const id = em.createEntity();
    em.setComponent(id, 'position', { x: 2, y: 2 });
    em.setComponent(id, 'fighter', { hp: 20, maxHp: 40, statusEffects: [], statModifiers: {} });
    em.setComponent(id, 'pokemonInfo', {
      name: 'Squirtle',
      types: ['water'],
      currentMoves: [slot(TACKLE, { currentPP: 1, reserved: true }), { ...disabled(WATER_GUN), currentPP: 20 }],
    });
    const moves = () => em.getComponent(id, 'pokemonInfo').currentMoves;
    const use = () => useItem(itemId, id, em, [{ itemId, quantity: 1 }], itemsData, [], movesData, null);
    return { em, id, moves, use };
  }

  it.each([
    ['ether', 'Éter'],
    ['max_ether', 'Éter Máximo'],
    ['max_elixir', 'Elixir'],
  ])('%s (%s) recupera PP sin quitar la reserva', (itemId) => {
    const { moves, use } = withItem(itemId);
    expect(use().consumed).toBe(true);
    expect(moves()[0].currentPP).toBeGreaterThan(1);
    expect(moves()[0].reserved).toBe(true);
  });

  it('el Elixir y Restaurar Todo curan Anulación y dejan la reserva', () => {
    for (const itemId of ['max_elixir', 'full_restore']) {
      const { moves, use } = withItem(itemId);
      expect(use().consumed).toBe(true);
      expect(moves()[1].enabled).toBe(true);
      expect(moves()[1]).not.toHaveProperty('_disableTurns');
      expect(moves()[0].reserved).toBe(true);
      expect(moves()[0].enabled).toBe(true);
    }
  });

  it('un Éter con los PP llenos cura la Anulación, no la reserva', () => {
    const { moves, use } = withItem('ether');
    moves()[0].currentPP = 25;
    moves()[1].currentPP = 25;
    expect(use().messages.join(' ')).toContain('ya no está anulado');
    expect(moves()[1].enabled).toBe(true);
    expect(moves()[0].reserved).toBe(true);
  });

  it('la Baldosa Mágica restaura PP y Anulación y deja la reserva', () => {
    const { em, id, moves } = withItem('ether');
    const trap = em.createEntity();
    em.setComponent(trap, 'position', { x: 2, y: 2 });
    em.setComponent(trap, 'trap', { type: 'wonder_tile', isHidden: false, uses: 1 });
    triggerTrap(id, trap, em, null);
    expect(moves()).toEqual([
      { moveId: TACKLE, currentPP: 25, maxPP: 25, enabled: true, reserved: true },
      { moveId: WATER_GUN, currentPP: 25, maxPP: 25, enabled: true },
    ]);
  });
});

describe('la IA aliada no usa lo reservado', () => {
  const water = { types: ['water'], level: 10 };
  const rock = { types: ['rock'], level: 10 };
  const fighter = { hp: 40, maxHp: 40, statusEffects: [] };

  it('selectBestMove salta lo reservado aunque sea lo mejor', () => {
    // Pistola Agua contra Roca sería la elección clara
    const info = { ...water, currentMoves: [slot(WATER_GUN, { reserved: true }), slot(TACKLE)] };
    for (let i = 0; i < 20; i++) {
      expect(selectBestMove(info, rock, movesData, typeChart, fighter, fighter)?.id).toBe(TACKLE);
    }
  });

  it('si todo está reservado o anulado no elige nada (ni siquiera como último recurso)', () => {
    const info = { ...water, currentMoves: [slot(WATER_GUN, { reserved: true }), disabled(TACKLE)] };
    expect(selectBestMove(info, rock, movesData, typeChart, fighter, fighter)).toBeNull();
  });

  /**
   * Un aliado con táctica `tactic` junto a un salvaje, y el líder al lado.
   * @param {{ tactic?: string, moves: Object[], hp?: number }} options
   */
  function allyNextToWild({ tactic = 'follow', moves, hp = 40 }) {
    const em = new EntityManager(new EventBus());
    const spawn = (x, y) => {
      const id = em.createEntity();
      em.setComponent(id, 'position', { x, y, facing: 'right' });
      em.setComponent(id, 'fighter', { hp: 40, maxHp: 40, statusEffects: [], statModifiers: {} });
      em.setComponent(id, 'pokemonInfo', { name: `e${id}`, types: ['water'], currentMoves: [] });
      return id;
    };
    const leader = spawn(1, 1);
    em.setComponent(leader, 'partyMember', { slot: 0, isLeader: true, tactic: 'follow' });
    const ally = spawn(2, 2);
    em.setComponent(ally, 'partyMember', { slot: 1, isLeader: false, tactic });
    em.setComponent(ally, 'aiControlled', { behavior: 'follower', detectRange: 5, alertedTo: null });
    em.getComponent(ally, 'pokemonInfo').currentMoves = moves;
    em.getComponent(ally, 'fighter').hp = hp;
    const wild = spawn(3, 2);
    const game = { _playerId: leader, movesData, playerPathHistory: [] };
    const act = () => getEnemyAction(ally, em, null, { x: 1, y: 1 }, leader, game);
    return { act, wild };
  }

  it.each(['follow', 'aggressive', 'stay'])('con todo reservado da un ataque básico (%s), no Forcejeo', (tactic) => {
    const { act, wild } = allyNextToWild({ tactic, moves: [slot(TACKLE, { reserved: true }), slot(EMBER, { reserved: true })] });
    expect(act()).toEqual({ type: 'attack', targetId: wild, regularAttack: true });
  });

  it.each(['follow', 'stay'])('con algo libre elige movimiento (%s)', (tactic) => {
    const { act, wild } = allyNextToWild({ tactic, moves: [slot(TACKLE, { reserved: true }), slot(EMBER)] });
    expect(act()).toEqual({ type: 'attack', targetId: wild, regularAttack: false });
  });

  it('no se cura con Recuperación si está reservada', () => {
    const free = allyNextToWild({ moves: [slot(TACKLE), slot(RECOVER)], hp: 10 });
    expect(free.act()).toEqual({ type: 'use_move', index: 1 });
    const reserved = allyNextToWild({ moves: [slot(TACKLE), slot(RECOVER, { reserved: true })], hp: 10 });
    expect(reserved.act()).toMatchObject({ type: 'attack', regularAttack: false });
  });
});
