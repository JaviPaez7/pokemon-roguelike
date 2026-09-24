import { describe, it, expect } from 'vitest';
import { gummiIq, skillsForIq, newSkills, hasIqSkill, IQ_SKILLS } from '../../src/core/IQ.js';
import { tryApplyEffect, calculateDamage } from '../../src/systems/CombatSystem.js';
import { setSeed } from '../../src/core/Random.js';
import typeChart from '../../src/data/types.json';

describe('CI', () => {
  it('una gominola de su tipo favorito da más CI', () => {
    expect(gummiIq('red_gummi', ['fire'])).toEqual({ gained: 5, favorite: true });
    expect(gummiIq('red_gummi', ['water'])).toEqual({ gained: 2, favorite: false });
    expect(gummiIq('blue_gummi', ['grass', 'water'])).toEqual({ gained: 5, favorite: true });
  });

  it('las habilidades se desbloquean por umbrales, en orden', () => {
    const thresholds = IQ_SKILLS.map((s) => s.iq);
    expect(thresholds).toEqual([...thresholds].sort((a, b) => a - b));
    expect(skillsForIq(0)).toEqual([]);
    expect(skillsForIq(IQ_SKILLS[0].iq).map((s) => s.id)).toEqual([IQ_SKILLS[0].id]);
    expect(skillsForIq(999)).toHaveLength(IQ_SKILLS.length);
  });

  it('newSkills dice solo las que se acaban de aprender', () => {
    const [first, second] = IQ_SKILLS;
    expect(newSkills(first.iq - 1, first.iq).map((s) => s.id)).toEqual([first.id]);
    expect(newSkills(first.iq, second.iq - 1)).toEqual([]);
    expect(newSkills(0, second.iq).map((s) => s.id)).toEqual([first.id, second.id]);
  });

  it('hasIqSkill mira el CI del Pokémon', () => {
    expect(hasIqSkill({ iq: 0 }, 'trap_seer')).toBe(false);
    expect(hasIqSkill({ iq: 99 }, 'trap_seer')).toBe(true);
    expect(hasIqSkill({ iq: 99 }, 'no_existe')).toBe(false);
    expect(hasIqSkill(undefined, 'trap_seer')).toBe(false);
  });
});

describe('habilidades en combate', () => {
  it('Autocura: el estado dura la mitad', () => {
    // Tóxico: 8 turnos fijos
    const toxic = { effect: 'badly_poison', effectChance: 100, type: 'poison' };
    const turns = (iq) => {
      const fighter = { statusEffects: [], hp: 20, maxHp: 20 };
      tryApplyEffect(toxic, fighter, { name: 'Abra', types: ['psychic'], iq }, [], {}, {});
      return fighter.statusEffects[0].turnsLeft;
    };
    expect(turns(0)).toBe(8);
    expect(turns(99)).toBe(4);
  });

  it('Esquivador: los ataques fallan más', () => {
    const move = { name: 'Arañazo', type: 'normal', power: 40, accuracy: 80, damageClass: 'physical' };
    const fighter = () => ({ hp: 100, maxHp: 100, attack: 50, defense: 50, spAtk: 50, spDef: 50, speed: 50, statusEffects: [], statModifiers: {} });
    const misses = (iq) => {
      let count = 0;
      setSeed(12345);
      for (let i = 0; i < 300; i++) {
        const r = calculateDamage(fighter(), fighter(), move, { name: 'A', level: 10, types: ['normal'] }, { name: 'B', level: 10, types: ['normal'], iq }, typeChart);
        if (r.missed) count++;
      }
      return count;
    };
    expect(misses(99)).toBeGreaterThan(misses(0));
  });
});
