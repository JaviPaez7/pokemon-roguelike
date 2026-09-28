/**
 * MoveSlots.js — Las casillas de movimiento de un Pokémon (`currentMoves`).
 *
 * Dos cosas distintas pueden impedir usar un movimiento:
 * - Anulación (`enabled: false` con `_disableTurns`): un efecto de combate.
 *   Bloquea a cualquiera, líder incluido, y se cura con el tiempo, los Éteres,
 *   el Elixir, Restaurar Todo, la Baldosa Mágica, las salas de descanso y al
 *   descansar en la base.
 * - La reserva (`reserved: true`): la decide el jugador en Equipo → Ver
 *   movimientos para que la IA aliada no use ese movimiento. El líder sí puede
 *   usarlo a mano. Solo la cambia ese menú y dura: va en la ficha, en la
 *   plantilla y en la partida guardada, y no la quita nada de lo que cura.
 */

/**
 * @typedef {{
 *   moveId: number,
 *   currentPP: number,
 *   maxPP: number,
 *   enabled?: boolean,
 *   reserved?: boolean,
 *   _disableTurns?: number,
 *   _mimicOriginal?: number,
 * }} MoveSlot
 */

/**
 * Si la IA puede elegir este movimiento: con PP, sin anular y sin reservar.
 * @param {MoveSlot | null | undefined} slot
 * @returns {boolean}
 */
export function aiCanUse(slot) {
  return !!slot && slot.currentPP > 0 && slot.enabled !== false && !slot.reserved;
}

/**
 * Si a la IA le queda algún movimiento que elegir. Si no, da un ataque básico
 * (sin PP ni riesgo de Forcejeo).
 * @param {{ currentMoves?: (MoveSlot | null)[] } | null | undefined} info - pokemonInfo
 * @returns {boolean}
 */
export function aiHasMove(info) {
  return (info?.currentMoves || []).some(aiCanUse);
}

/**
 * Reserva un movimiento para que la IA no lo use, o lo deja libre. El campo
 * solo existe mientras está reservado.
 * @param {MoveSlot} slot
 * @param {boolean} reserved
 */
export function setReserved(slot, reserved) {
  if (reserved) slot.reserved = true;
  else delete slot.reserved;
}
