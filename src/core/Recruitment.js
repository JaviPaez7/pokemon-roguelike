/**
 * Recruitment.js — Probabilidad de que un Pokémon derrotado quiera unirse.
 *
 * Como en Mundo Misterioso: cuando el líder derrota a un salvaje, a veces se
 * levanta y pide unirse al equipo. La probabilidad sale de la especie (su
 * ratio de captura: un Rattata se deja reclutar más que un Snorlax), de la
 * diferencia de nivel con el líder y del Lazo Amigo. Los números están en
 * recruitment.json.
 *
 * Los legendarios nunca se unen como salvajes. Los de las mazmorras de
 * posjuego (`legendBosses`) tienen su propia regla: al derrotarlos como jefe se
 * ofrecen siempre, sin tirada, hasta que se unen (ver `legendJoins`).
 */

import recruitmentData from '../data/recruitment.json';

/**
 * @typedef {Object} RecruitmentConfig
 * @property {number} speciesFactor - Probabilidad con ratio de captura 255
 * @property {number} levelBonusPerLevel - Por cada nivel que el líder saca (o pierde) al salvaje
 * @property {number} levelBonusMax - Tope de esa bonificación, en los dos sentidos
 * @property {number} friendBowBonus - Con el Lazo Amigo equipado
 * @property {number} maxChance
 * @property {number[]} unrecruitable - Especies que no se unen como salvajes (legendarios)
 * @property {number[]} legendBosses - Legendarios que se ofrecen al derrotarlos como jefe
 */

/** @type {RecruitmentConfig} */
export const RECRUITMENT = recruitmentData;

/** @param {number} speciesId */
export function isRecruitable(speciesId) {
  return !RECRUITMENT.unrecruitable.includes(speciesId);
}

/**
 * Probabilidad (0..1) de que el salvaje derrotado quiera unirse.
 * @param {{ speciesId: number, captureRate: number, targetLevel: number, leaderLevel: number, friendBow?: boolean }} params
 * @param {RecruitmentConfig} [config]
 * @returns {number}
 */
export function recruitChance({ speciesId, captureRate, targetLevel, leaderLevel, friendBow = false }, config = RECRUITMENT) {
  if (config.unrecruitable.includes(speciesId)) return 0;
  const species = config.speciesFactor * (captureRate ?? 45) / 255;
  const diff = (leaderLevel - targetLevel) * config.levelBonusPerLevel;
  const level = Math.max(-config.levelBonusMax, Math.min(config.levelBonusMax, diff));
  const bow = friendBow ? config.friendBowBonus : 0;
  return Math.max(0, Math.min(config.maxChance, species + level + bow));
}

/**
 * Si el jefe legendario derrotado se ofrece a unirse. Se ofrece siempre, sin
 * tirada, cada vez que se le derrota como jefe de su mazmorra, hasta que se
 * une: como mucho hay uno de cada especie en la base y el equipo. Si se le dice
 * que no, se puede volver a por él. En la Torre del Desafío no se ofrece.
 * @param {{ speciesId: number, challenge?: boolean, ownedSpecies: number[] }} params
 * @param {RecruitmentConfig} [config]
 * @returns {boolean}
 */
export function legendJoins({ speciesId, challenge = false, ownedSpecies }, config = RECRUITMENT) {
  return !challenge && config.legendBosses.includes(speciesId) && !ownedSpecies.includes(speciesId);
}
