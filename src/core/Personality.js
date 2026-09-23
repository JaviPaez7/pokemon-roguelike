/**
 * Personality.js — Test de personalidad del inicio de partida.
 *
 * Cada respuesta suma puntos a una o varias naturalezas; la naturaleza con más
 * puntos decide el Pokémon protagonista. El compañero no puede compartir tipo
 * con el protagonista.
 */

import personalityData from '../data/personality.json';
import { shuffle } from './Random.js';

export const NATURES = personalityData.natures;
export const QUESTIONS = personalityData.questions;

/** Preguntas que se hacen en cada partida. */
export const QUESTIONS_PER_TEST = 8;

/**
 * @returns {typeof QUESTIONS} Preguntas al azar para un test
 */
export function pickQuestions() {
  return shuffle(QUESTIONS).slice(0, QUESTIONS_PER_TEST);
}

/**
 * @param {Record<string, number>[]} answerScores - Los `scores` de cada respuesta elegida
 * @returns {typeof NATURES[number]} Naturaleza resultante; en empate, la primera de la lista
 */
export function natureFromAnswers(answerScores) {
  const totals = Object.fromEntries(NATURES.map((n) => [n.id, 0]));
  for (const scores of answerScores) {
    for (const [nature, points] of Object.entries(scores)) totals[nature] += points;
  }
  return NATURES.reduce((best, n) => (totals[n.id] > totals[best.id] ? n : best), NATURES[0]);
}

/**
 * Pokémon que pueden ser compañero de un protagonista: los demás de la lista
 * que no comparten ningún tipo con él.
 * @param {number} heroSpeciesId
 * @param {{ id: number, types: string[] }[]} pokemonData
 * @returns {number[]} speciesId en el orden de NATURES
 */
export function partnerOptions(heroSpeciesId, pokemonData) {
  const typesOf = (id) => pokemonData.find((p) => p.id === id)?.types ?? [];
  const heroTypes = typesOf(heroSpeciesId);
  return NATURES.map((n) => n.speciesId).filter(
    (id) => id !== heroSpeciesId && !typesOf(id).some((t) => heroTypes.includes(t)),
  );
}
