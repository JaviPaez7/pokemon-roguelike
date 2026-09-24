/**
 * IQ.js — CI (inteligencia) y habilidades de CI.
 *
 * Como en Mundo Misterioso, las gominolas suben el CI de quien se las come
 * (más si es de su tipo favorito) y, al llegar a ciertos valores, el Pokémon
 * aprende habilidades de CI que funcionan siempre. El CI va en
 * `pokemonInfo.iq` y viaja en la ficha. Los números están en iq.json.
 */

import iqData from '../data/iq.json';

/**
 * @typedef {{ id: string, name: string, iq: number, description: string }} IqSkill
 */

/** @type {IqSkill[]} */
export const IQ_SKILLS = iqData.skills;

/**
 * CI que da una gominola a un Pokémon de esos tipos.
 * @param {string} itemId
 * @param {string[]} types
 * @returns {{ gained: number, favorite: boolean }}
 */
export function gummiIq(itemId, types = []) {
  const favorite = types.includes(iqData.gummiTypes[itemId]);
  return { gained: favorite ? iqData.gummi.favorite : iqData.gummi.other, favorite };
}

/**
 * Habilidades que tiene un Pokémon con ese CI.
 * @param {number} iq
 * @returns {IqSkill[]}
 */
export function skillsForIq(iq = 0) {
  return IQ_SKILLS.filter((s) => (iq || 0) >= s.iq);
}

/**
 * Habilidades que se aprenden al pasar de un CI a otro.
 * @param {number} before
 * @param {number} after
 * @returns {IqSkill[]}
 */
export function newSkills(before, after) {
  return IQ_SKILLS.filter((s) => (before || 0) < s.iq && after >= s.iq);
}

/**
 * @param {{ iq?: number } | null | undefined} info
 * @param {string} skillId
 */
export function hasIqSkill(info, skillId) {
  const skill = IQ_SKILLS.find((s) => s.id === skillId);
  return !!skill && (info?.iq || 0) >= skill.iq;
}
