import { describe, it, expect } from 'vitest';
import { NATURES, QUESTIONS, QUESTIONS_PER_TEST, pickQuestions, natureFromAnswers, partnerOptions } from '../../src/core/Personality.js';
import { setSeed } from '../../src/core/Random.js';
import pokemonData from '../../src/data/pokemon.json';

describe('datos del test', () => {
  it('cada naturaleza tiene un Pokémon de la 1.ª generación distinto', () => {
    const ids = NATURES.map((n) => n.speciesId);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(pokemonData.some((p) => p.id === id), `especie ${id}`).toBe(true);
  });

  it('las respuestas solo puntúan naturalezas que existen', () => {
    const known = new Set(NATURES.map((n) => n.id));
    for (const q of QUESTIONS) {
      expect(q.answers.length).toBeGreaterThanOrEqual(2);
      for (const a of q.answers) {
        for (const nature of Object.keys(a.scores)) expect(known.has(nature), `${q.text} → ${nature}`).toBe(true);
      }
    }
  });

  it('cada naturaleza se puede conseguir', () => {
    const reachable = new Set(QUESTIONS.flatMap((q) => q.answers.flatMap((a) => Object.keys(a.scores))));
    expect([...reachable].sort()).toEqual(NATURES.map((n) => n.id).sort());
  });
});

describe('pickQuestions', () => {
  it('elige preguntas distintas y es reproducible con la semilla', () => {
    setSeed(5);
    const a = pickQuestions();
    setSeed(5);
    expect(pickQuestions()).toEqual(a);
    expect(a).toHaveLength(QUESTIONS_PER_TEST);
    expect(new Set(a.map((q) => q.text)).size).toBe(QUESTIONS_PER_TEST);
  });
});

describe('natureFromAnswers', () => {
  it('gana la naturaleza con más puntos', () => {
    expect(natureFromAnswers([{ timido: 2 }, { timido: 3, valiente: 1 }, { valiente: 2 }]).id).toBe('timido');
  });

  it('en empate gana la primera de la lista', () => {
    expect(natureFromAnswers([{ curioso: 2 }, { valiente: 2 }]).id).toBe(NATURES[0].id);
    expect(natureFromAnswers([]).id).toBe(NATURES[0].id);
  });
});

describe('partnerOptions', () => {
  it('excluye al protagonista y a quien comparte tipo con él', () => {
    const squirtle = 7;
    const psyduck = 54;
    const options = partnerOptions(squirtle, pokemonData);
    expect(options).not.toContain(squirtle);
    expect(options).not.toContain(psyduck); // los dos son de agua
    expect(options).toContain(4); // Charmander sí
  });

  it('siempre deja varios compañeros posibles', () => {
    for (const n of NATURES) expect(partnerOptions(n.speciesId, pokemonData).length).toBeGreaterThanOrEqual(5);
  });
});
