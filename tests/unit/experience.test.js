import { describe, it, expect } from 'vitest';
import pokemonData from '../../src/data/pokemon.json';
import movesData from '../../src/data/moves.json';
import experienceData from '../../src/data/experience.json';
import { EntityManager } from '../../src/entities/EntityManager.js';
import { EventBus } from '../../src/core/EventBus.js';
import {
  EXPERIENCE,
  calculateExpGained,
  expForLevel,
  expLevelBonus,
  grantExperience,
} from '../../src/systems/ExperienceSystem.js';

const RATTATA = 19;
const MEW = 151;

/** EntityManager con las especies y los movimientos, como en Game.init. */
function entityManager() {
  const em = new EntityManager(new EventBus());
  const species = {};
  for (const p of pokemonData) species[p.id] = { name: p.name, types: p.types, ability: p.ability || 'none', baseStats: p.stats, learnset: p.moves };
  const moves = {};
  for (const m of movesData) moves[m.id] = m;
  em.loadData(species, moves);
  return em;
}

/**
 * Crea un Pokémon con createPokemon y devuelve sus componentes.
 * @param {EntityManager} em
 * @param {number} speciesId
 * @param {number} level
 */
function create(em, speciesId, level) {
  const id = em.createPokemon(speciesId, level, 0, 0, false);
  return { info: em.getComponent(id, 'pokemonInfo'), fighter: em.getComponent(id, 'fighter') };
}

/**
 * Salvajes de su especie y nivel que tiene que derrotar para subir un nivel.
 * @param {{ info: any, fighter: any }} pokemon
 */
function killsToLevelUp({ info, fighter }) {
  const species = pokemonData.find((p) => p.id === info.speciesId);
  const start = info.level;
  let kills = 0;
  while (info.level === start && kills < 1000) {
    grantExperience(info, fighter, calculateExpGained(species.baseExp, start), pokemonData, movesData);
    kills++;
  }
  return kills;
}

describe('experience.json: la experiencia ganada', () => {
  it('trae los bonus de siempre, de menor a mayor nivel', () => {
    expect(experienceData).toEqual({
      divisor: 5,
      levelBonuses: [
        { upToLevel: 12, bonus: 0.35 },
        { upToLevel: 22, bonus: 0.15 },
      ],
    });
    expect(EXPERIENCE).toBe(experienceData);
  });

  it('expLevelBonus: +35 % hasta el nivel 12, +15 % hasta el 22 y nada por encima', () => {
    expect([1, 12, 13, 22, 23, 100].map(expLevelBonus)).toEqual([0.35, 0.35, 0.15, 0.15, 0, 0]);
  });

  it('calculateExpGained da lo mismo que la fórmula de antes para todas las especies y niveles', () => {
    // La fórmula tal como estaba escrita en el código antes de pasar a datos
    const before = (baseExp, level) => {
      const raw = Math.floor((baseExp * level) / 5);
      const bonus = level <= 12 ? Math.ceil(raw * 0.35) : level <= 22 ? Math.ceil(raw * 0.15) : 0;
      return Math.max(1, raw + bonus);
    };
    const baseExps = new Set([1, 50, ...pokemonData.map((p) => p.baseExp).filter(Boolean)]);
    for (const baseExp of baseExps) {
      for (let level = 1; level <= 100; level++) {
        expect(calculateExpGained(baseExp, level), `EXP base ${baseExp}, nivel ${level}`).toBe(before(baseExp, level));
      }
    }
  });
});

describe('createPokemon: la experiencia de su nivel', () => {
  it('llega con la experiencia mínima de su nivel, no con 0', () => {
    const em = entityManager();
    for (const level of [1, 5, 20, 55, 60, 100]) {
      expect(create(em, RATTATA, level).info.xp, `nivel ${level}`).toBe(expForLevel(level));
    }
  });

  it('sube justo al llegar a la del nivel siguiente', () => {
    const em = entityManager();
    const pokemon = create(em, RATTATA, 20);
    const gap = expForLevel(21) - expForLevel(20);
    grantExperience(pokemon.info, pokemon.fighter, gap - 1, pokemonData, movesData);
    expect(pokemon.info.level).toBe(20);
    grantExperience(pokemon.info, pokemon.fighter, 1, pokemonData, movesData);
    expect(pokemon.info.level).toBe(21);
    expect(pokemon.info.xp).toBe(expForLevel(21));
  });

  it('un recluta de nivel alto sube tras unos pocos salvajes de su nivel, como un miembro del equipo', () => {
    const em = entityManager();
    // Recién creado, como un recluta, y justo tras subir, como un miembro del equipo
    const recruit = create(em, MEW, 60);
    const member = create(em, MEW, 59);
    grantExperience(member.info, member.fighter, expForLevel(60) - member.info.xp, pokemonData, movesData);
    expect(member.info.level).toBe(60);
    const kills = killsToLevelUp(recruit);
    expect(kills).toBe(killsToLevelUp(member));
    // Son 4; cuando llegaba con 0 de experiencia necesitaba 71
    expect(kills).toBeLessThanOrEqual(10);
  });
});
