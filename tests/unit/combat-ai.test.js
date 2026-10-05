/**
 * El ataque básico sin tipo (core/CombatRules.js) y la IA que elige qué hacer
 * (selectBestMove en systems/CombatSystem.js), con el RNG con semilla.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import pokemonData from '../../src/data/pokemon.json';
import movesData from '../../src/data/moves.json';
import typeChart from '../../src/data/types.json';
import combatData from '../../src/data/combat.json';
import { EntityManager } from '../../src/entities/EntityManager.js';
import { EventBus } from '../../src/core/EventBus.js';
import { setSeed } from '../../src/core/Random.js';
import { BASIC_ATTACK_ID, basicAttackMove, basicAttackPower, isBasicAttack } from '../../src/core/CombatRules.js';
import { aiMoveKind, aiStatusValue, calculateDamage, selectBestMove } from '../../src/systems/CombatSystem.js';

const TACKLE = 33; // Placaje
const TAIL_WHIP = 39; // Látigo
const GROWL = 45; // Gruñido
const SING = 47; // Canto
const ROAR = 46; // Rugido
const HYPNOSIS = 95; // Hipnosis
const DREAM_EATER = 138; // Come Sueños
const LEECH_SEED = 73; // Drenadoras
const HARDEN = 106; // Fortaleza
const TELEPORT = 100; // Teletransporte

const em = new EntityManager(new EventBus());
{
  const species = {};
  for (const p of pokemonData) species[p.id] = { name: p.name, types: p.types, ability: p.ability || 'none', baseStats: p.stats, learnset: p.moves };
  const moves = {};
  for (const m of movesData) moves[m.id] = m;
  em.loadData(species, moves);
}

/**
 * Un Pokémon como lo crea el juego, con los movimientos que se le den.
 * @param {number} speciesId
 * @param {number} level
 * @param {number[]} [moveIds]
 */
function make(speciesId, level, moveIds) {
  const id = em.createPokemon(speciesId, level, 0, 0, true);
  const fighter = em.getComponent(id, 'fighter');
  const info = em.getComponent(id, 'pokemonInfo');
  em.destroyEntity(id);
  if (moveIds) info.currentMoves = em.moveSlots(moveIds);
  return { fighter, info };
}

/**
 * Lo que elige `att` contra `def` `n` veces seguidas, sin que cambie nada.
 * @returns {Map<number, number>} Veces que elige cada movimiento (−1, el básico)
 */
function picks(att, def, n = 200, options = {}) {
  const counts = new Map();
  for (let i = 0; i < n; i++) {
    const move = selectBestMove(att.info, def.info, movesData, typeChart, att.fighter, def.fighter, { basicAttack: basicAttackMove(att.info), ...options });
    const id = move?.id ?? null;
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return counts;
}

beforeEach(() => setSeed(20261005));

describe('ataque básico: sin tipo, sin PP y con los números de combat.json', () => {
  it('no tiene tipo ni STAB y su potencia sube con el nivel', () => {
    const basic = basicAttackMove({ level: 10 });
    expect(basic).toMatchObject({ id: BASIC_ATTACK_ID, type: null, stab: false, damageClass: 'physical', range: 'front' });
    expect(basic.accuracy).toBe(combatData.basicAttack.accuracy);
    expect(isBasicAttack(basic)).toBe(true);
    expect(basicAttackPower(1)).toBe(combatData.basicAttack.power.min);
    expect(basicAttackPower(10)).toBe(12 + 2 * 10);
    expect(basicAttackPower(80)).toBe(combatData.basicAttack.power.max);
  });

  it.each([
    ['Meowth (normal)', 52, 'Gengar (fantasma)', 94],
    ['Machop (lucha)', 66, 'Gengar (fantasma)', 94],
    ['Cubone (tierra)', 104, 'Gengar (Levitación)', 94],
    ['Cubone (tierra)', 104, 'Pidgeotto (volador)', 17],
    ['Pikachu (eléctrico)', 25, 'Onix (tierra)', 95],
  ])('%s daña a %s: eficacia neutra', (_a, attackerId, _d, defenderId) => {
    const att = make(attackerId, 20);
    const def = make(defenderId, 20);
    const basic = basicAttackMove(att.info);
    let hits = 0;
    for (let i = 0; i < 20; i++) {
      const res = calculateDamage({ ...att.fighter }, { ...def.fighter }, basic, att.info, def.info, typeChart);
      expect(res.effectiveness).toBe(1);
      expect(res.isSTAB).toBe(false);
      expect(res.messages).not.toContain('No afecta al Pokémon enemigo...');
      if (res.damage > 0) hits++;
    }
    expect(hits).toBeGreaterThan(15); // falla solo con su precisión (95 %)
  });

  it('no lo absorben Absorbe Fuego ni las habilidades que dependen del tipo', () => {
    const charmander = make(4, 30);
    const arcanine = make(59, 30); // Absorbe Fuego
    const before = { ...arcanine.fighter, statModifiers: {} };
    let damage = 0;
    for (let i = 0; i < 10; i++) damage += calculateDamage({ ...charmander.fighter }, before, basicAttackMove(charmander.info), charmander.info, arcanine.info, typeChart).damage;
    expect(damage).toBeGreaterThan(0);
    expect(before.statModifiers).toEqual({});
  });

  it('un movimiento normal de la misma potencia sí lleva STAB', () => {
    const meowth = make(52, 20);
    const typed = { ...basicAttackMove(meowth.info), type: 'normal', stab: undefined, accuracy: 100 };
    const res = calculateDamage({ ...meowth.fighter }, { ...make(19, 20).fighter }, typed, meowth.info, make(19, 20).info, typeChart);
    expect(res.isSTAB).toBe(true);
  });
});

describe('IA: ataca si puede hacer daño y usa los estados de vez en cuando', () => {
  const rattata = () => make(19, 10, [TACKLE, TAIL_WHIP]);

  it('ataca casi siempre y usa un estado útil en torno a `status.chance` de las veces', () => {
    const counts = picks(rattata(), make(4, 10));
    const share = (counts.get(TAIL_WHIP) ?? 0) / 200;
    expect(share).toBeGreaterThan(combatData.ai.status.chance / 2);
    expect(share).toBeLessThan(combatData.ai.status.chance * 1.5);
    expect((counts.get(TACKLE) ?? 0) + (counts.get(BASIC_ATTACK_ID) ?? 0) + (counts.get(TAIL_WHIP) ?? 0)).toBe(200);
  });

  it('con la misma semilla elige lo mismo', () => {
    const run = () => {
      setSeed(42);
      const att = rattata();
      const def = make(4, 10);
      return Array.from({ length: 30 }, () => selectBestMove(att.info, def.info, movesData, typeChart, att.fighter, def.fighter, { basicAttack: basicAttackMove(att.info) })?.id);
    };
    expect(run()).toEqual(run());
  });

  it('las bajadas de características valen menos con cada nivel y nada en el tope', () => {
    const att = rattata();
    const tailWhip = movesData.find((m) => m.id === TAIL_WHIP);
    const value = (stage) => {
      const def = make(4, 10);
      def.fighter.statModifiers = { defense: stage };
      return aiStatusValue(tailWhip, { attackerInfo: att.info, attackerFighter: att.fighter, defenderInfo: def.info, defenderFighter: def.fighter, typeChart });
    };
    expect(value(0)).toBe(1);
    expect(value(-1)).toBe(0.5);
    expect(value(-combatData.ai.statStageCap)).toBe(0);
    const capped = make(4, 10);
    capped.fighter.statModifiers = { defense: -combatData.ai.statStageCap };
    expect(picks(att, capped).get(TAIL_WHIP)).toBeUndefined();
  });

  it('no repite un estado ya puesto ni duerme a quien ya tiene un estado', () => {
    const clefable = make(36, 20, [SING, TACKLE]);
    const asleep = make(4, 20);
    asleep.fighter.statusEffects = [{ type: 'sleep', turnsLeft: 2 }];
    const paralyzed = make(4, 20);
    paralyzed.fighter.statusEffects = [{ type: 'paralyze', turnsLeft: 2 }];
    expect(picks(clefable, asleep).get(SING)).toBeUndefined();
    expect(picks(clefable, paralyzed).get(SING)).toBeUndefined();
    expect(picks(clefable, make(4, 20)).get(SING)).toBeGreaterThan(0);
  });

  it('Come Sueños, solo contra un objetivo dormido', () => {
    const gengar = make(94, 40, [HYPNOSIS, DREAM_EATER]);
    expect(picks(gengar, make(1, 40)).get(DREAM_EATER)).toBeUndefined();
    const asleep = make(1, 40);
    asleep.fighter.statusEffects = [{ type: 'sleep', turnsLeft: 2 }];
    expect(picks(gengar, asleep).get(DREAM_EATER)).toBeGreaterThan(150);
  });

  it('a un jefe no le baja características ni le pone Drenadoras', () => {
    const ally = make(1, 20, [GROWL, LEECH_SEED, TACKLE]);
    const counts = picks(ally, make(36, 20), 200, { targetIsBoss: true });
    expect(counts.get(GROWL)).toBeUndefined();
    expect(counts.get(LEECH_SEED)).toBeUndefined();
  });

  it('si sus movimientos no le afectan, usa el ataque básico (no Forcejeo ni un movimiento que falla)', () => {
    // Ni Placaje ni Látigo (normales) afectan a un fantasma
    expect(picks(rattata(), make(92, 10)).get(BASIC_ATTACK_ID)).toBe(200);
  });

  it('si no tiene nada que haga daño, usa los estados mientras sirvan', () => {
    const caterpie = make(10, 5, [81]); // Disparo Demora
    const foe = make(4, 5);
    const ai = { basicAttack: null, fallback: false };
    expect(picks(caterpie, foe, 50, ai).get(81)).toBe(50);
    foe.fighter.statModifiers = { speed: -combatData.ai.statStageCap };
    expect(picks(caterpie, foe, 50, ai).get(null)).toBe(50);
  });

  it('las subidas propias tienen el mismo tope', () => {
    const geodude = make(74, 10, [HARDEN, TACKLE]);
    geodude.fighter.statModifiers = { defense: combatData.ai.statStageCap };
    expect(picks(geodude, make(4, 10)).get(HARDEN)).toBeUndefined();
  });

  it('Rugido y Teletransporte, solo con poca vida', () => {
    const arcanine = make(59, 30, [ROAR, TACKLE]);
    expect(picks(arcanine, make(4, 30)).get(ROAR)).toBeUndefined();
    arcanine.fighter.hp = Math.floor(arcanine.fighter.maxHp * (combatData.ai.status.escapeBelowHp - 0.1));
    expect(picks(arcanine, make(4, 30)).get(ROAR)).toBeGreaterThan(0);
    const abra = make(63, 10, [TELEPORT]);
    expect(picks(abra, make(4, 10)).get(BASIC_ATTACK_ID)).toBe(200);
  });

  it('clasifica los movimientos: ataques, especiales y estados', () => {
    const kind = (id) => aiMoveKind(movesData.find((m) => m.id === id));
    expect(kind(TACKLE)).toBe('attack');
    expect(kind(101)).toBe('attack'); // Tinieblas: daño fijo
    expect(kind(118)).toBe('attack'); // Metrónomo
    expect(kind(105)).toBe('special'); // Recuperación
    expect(kind(GROWL)).toBe('status');
    expect(aiMoveKind(basicAttackMove({ level: 5 }))).toBe('attack');
  });

  it('sin el ataque básico ni nada útil, el primer movimiento que pueda usar (como antes)', () => {
    const att = rattata();
    const gastly = make(92, 10);
    const move = selectBestMove(att.info, gastly.info, movesData, typeChart, att.fighter, gastly.fighter);
    expect(move.id).toBe(TACKLE);
    expect(selectBestMove(att.info, gastly.info, movesData, typeChart, att.fighter, gastly.fighter, { fallback: false })).toBeNull();
  });
});
