/**
 * CombatRules.js — Reglas del combate que van en datos (combat.json).
 *
 * - El ataque básico: chocar contra un rival. No gasta PP y, como en Mundo
 *   Misterioso, no tiene tipo: sin STAB, sin eficacia de tipos ni inmunidades,
 *   así que cualquiera puede dañar a cualquiera (un Cubone a un Pidgeotto, un
 *   Meowth a un Gengar). `type`, `stab`, la precisión y la potencia por nivel
 *   están en `basicAttack`. Con `type` de un tipo, sería un ataque de ese tipo.
 * - Los pesos con los que la IA (salvajes, jefes y aliados) elige qué hacer
 *   (`ai`): los usa `selectBestMove` en systems/CombatSystem.js.
 */

import combatData from '../data/combat.json';

/** Id del ataque básico en los eventos (`move_used`) y en los movimientos elegidos. */
export const BASIC_ATTACK_ID = -1;

/**
 * @typedef {{
 *   name: string, type: string | null, stab: boolean, accuracy: number,
 *   damageClass: 'physical' | 'special',
 *   power: { base: number, perLevel: number, min: number, max: number }
 * }} BasicAttackRules
 */

/**
 * @typedef {{
 *   useBasicAttack: boolean, stab: number, superEffective: number,
 *   randomFactor: [number, number], statStageCap: number,
 *   status: { chance: number, setupMinHp: number, setupLowHp: number, escapeBelowHp: number },
 *   heal: { below: number, score: number }[],
 *   bide: { release: number, start: number, startMinHp: number, startLowHp: number },
 *   effects: Record<string, number>
 * }} AiWeights
 */

/** @type {BasicAttackRules} */
export const BASIC_ATTACK = combatData.basicAttack;

/** @type {AiWeights} */
export const AI_WEIGHTS = combatData.ai;

/**
 * Potencia del ataque básico a un nivel: `base + perLevel × nivel`, entre
 * `min` y `max`.
 * @param {number} level
 * @returns {number}
 */
export function basicAttackPower(level) {
  const { base, perLevel, min, max } = BASIC_ATTACK.power;
  return Math.max(min, Math.min(max, base + perLevel * (level || 1)));
}

/**
 * El ataque básico de un Pokémon, con la forma de un movimiento de moves.json.
 * Sin `type` (null) no tiene tipo; `stab` dice si lleva la bonificación de
 * STAB de todas formas.
 * @param {{ level?: number } | null | undefined} info - pokemonInfo del atacante
 * @returns {{ id: number, name: string, type: string | null, stab: boolean, power: number, accuracy: number, pp: number, damageClass: string, effect: null, range: 'front', description: string }}
 */
export function basicAttackMove(info) {
  return {
    id: BASIC_ATTACK_ID,
    name: BASIC_ATTACK.name,
    type: BASIC_ATTACK.type ?? null,
    stab: !!BASIC_ATTACK.stab,
    power: basicAttackPower(info?.level || 1),
    accuracy: BASIC_ATTACK.accuracy,
    pp: 99,
    damageClass: BASIC_ATTACK.damageClass,
    effect: null,
    range: 'front',
    description: 'Ataque básico sin PP',
  };
}

/**
 * @param {{ id?: number } | null | undefined} move
 * @returns {boolean} Si es el ataque básico
 */
export function isBasicAttack(move) {
  return move?.id === BASIC_ATTACK_ID;
}
