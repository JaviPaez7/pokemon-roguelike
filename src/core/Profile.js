/**
 * Profile.js — Perfil del equipo de exploración.
 *
 * Lo que persiste entre mazmorras: nombre y rango del equipo, plantilla de
 * Pokémon reclutados (fichas de core/PokemonSnapshot.js), formación, banco,
 * almacén, mazmorras completadas y misiones.
 *
 * La mochila y la cartera no viven aquí mientras se juega: son
 * `game.inventory` y `game.coins`, y se copian al perfil al guardar. Las
 * funciones que las tocan las reciben como parámetro.
 *
 * Son funciones sin dependencias del motor: modifican el perfil que reciben y
 * devuelven el resultado de la operación.
 */

import { MAX_PARTY_SIZE } from '../constants.js';
import { DUNGEONS, isUnlocked } from './Dungeons.js';

/** Rangos del equipo y puntos necesarios para alcanzarlos. */
export const RANKS = [
  { id: 'normal', name: 'Normal', points: 0 },
  { id: 'bronce', name: 'Bronce', points: 50 },
  { id: 'plata', name: 'Plata', points: 500 },
  { id: 'oro', name: 'Oro', points: 1500 },
  { id: 'diamante', name: 'Diamante', points: 3000 },
  { id: 'super', name: 'Súper', points: 7500 },
  { id: 'ultra', name: 'Ultra', points: 15000 },
  { id: 'hiper', name: 'Híper', points: 25000 },
  { id: 'maestro', name: 'Maestro', points: 50000 },
];

/** Unidades máximas de un mismo objeto en el almacén. */
export const STORAGE_STACK_MAX = 999;

/**
 * @typedef {{ itemId: string, quantity: number }} ItemStack
 */

/**
 * @param {{ teamName: string, hero: Object, partner: Object }} options - Fichas del protagonista y del compañero
 * @returns {Object} Perfil nuevo
 */
export function createProfile({ teamName, hero, partner }) {
  const profile = {
    teamName,
    day: 1,
    roster: [],
    nextUid: 1,
    heroUid: null,
    partnerUid: null,
    teamUids: [],
    bank: 0,
    storage: [],
    rankPoints: 0,
    clearedDungeons: [],
    missions: { day: 0, board: [], accepted: [], completed: 0 },
    flags: {},
  };
  profile.heroUid = addToRoster(profile, hero);
  profile.partnerUid = addToRoster(profile, partner);
  profile.teamUids = [profile.heroUid, profile.partnerUid];
  return profile;
}

/**
 * Añade un Pokémon a la plantilla.
 * @param {Object} profile
 * @param {Object} snapshot
 * @returns {number} uid asignado
 */
export function addToRoster(profile, snapshot) {
  const uid = profile.nextUid++;
  profile.roster.push({ ...snapshot, uid, isLeader: false });
  return uid;
}

/** @param {Object} profile @param {number} uid */
export function getMember(profile, uid) {
  return profile.roster.find((p) => p.uid === uid) || null;
}

/**
 * Sustituye la ficha de un miembro de la plantilla (mismo uid).
 * @param {Object} profile
 * @param {Object} snapshot
 */
export function updateMember(profile, snapshot) {
  const index = profile.roster.findIndex((p) => p.uid === snapshot.uid);
  if (index === -1) throw new Error(`No hay ningún Pokémon con uid ${snapshot.uid}`);
  profile.roster[index] = { ...snapshot, isLeader: false };
}

/**
 * Cambia la formación que irá a las mazmorras.
 * @param {Object} profile
 * @param {number[]} uids - En orden; el primero es el líder
 * @returns {{ ok: true } | { ok: false, error: string }}
 */
export function setTeam(profile, uids) {
  if (uids.length === 0 || uids.length > MAX_PARTY_SIZE) {
    return { ok: false, error: `El equipo lleva de 1 a ${MAX_PARTY_SIZE} Pokémon.` };
  }
  if (new Set(uids).size !== uids.length) return { ok: false, error: 'Un Pokémon está repetido.' };
  if (uids.some((uid) => !getMember(profile, uid))) return { ok: false, error: 'Ese Pokémon no está en la base.' };
  if (!uids.includes(profile.heroUid)) return { ok: false, error: 'El protagonista siempre va en el equipo.' };
  if (profile.partnerUid != null && !uids.includes(profile.partnerUid)) {
    return { ok: false, error: 'El compañero siempre va en el equipo.' };
  }
  profile.teamUids = [...uids];
  return { ok: true };
}

/**
 * @param {number} points
 * @returns {typeof RANKS[number]}
 */
export function rankFor(points) {
  return RANKS.filter((r) => points >= r.points).at(-1);
}

/**
 * @param {number} points
 * @returns {{ rank: typeof RANKS[number], missing: number } | null} Siguiente rango y puntos que faltan
 */
export function nextRank(points) {
  const rank = RANKS.find((r) => r.points > points);
  return rank ? { rank, missing: rank.points - points } : null;
}

/**
 * @param {Object} profile
 * @param {number} points
 * @returns {typeof RANKS[number] | null} Rango nuevo si se ha subido
 */
export function addRankPoints(profile, points) {
  const before = rankFor(profile.rankPoints);
  profile.rankPoints += points;
  const after = rankFor(profile.rankPoints);
  return after.id !== before.id ? after : null;
}

/**
 * Ingresa dinero de la cartera en el banco.
 * @param {Object} profile
 * @param {number} wallet
 * @param {number} amount
 * @returns {number} Cartera resultante
 */
export function bankDeposit(profile, wallet, amount) {
  const moved = Math.max(0, Math.min(Math.floor(amount), wallet));
  profile.bank += moved;
  return wallet - moved;
}

/**
 * Saca dinero del banco a la cartera.
 * @param {Object} profile
 * @param {number} wallet
 * @param {number} amount
 * @returns {number} Cartera resultante
 */
export function bankWithdraw(profile, wallet, amount) {
  const moved = Math.max(0, Math.min(Math.floor(amount), profile.bank));
  profile.bank -= moved;
  return wallet + moved;
}

/**
 * Pasa unidades de un objeto entre dos listas (mochila ↔ almacén). Una lista
 * lleva una casilla por objeto.
 * @param {ItemStack[]} from
 * @param {ItemStack[]} to
 * @param {string} itemId
 * @param {number} quantity
 * @param {{ maxSlots?: number, stackMax?: number }} [limits] - Límites de la lista de destino
 * @returns {number} Unidades movidas (0 si no cabe nada)
 */
export function transferItem(from, to, itemId, quantity, { maxSlots = Infinity, stackMax = Infinity } = {}) {
  const source = from.find((s) => s.itemId === itemId);
  if (!source) return 0;
  let target = to.find((s) => s.itemId === itemId);
  if (!target && to.length >= maxSlots) return 0;
  const room = stackMax - (target ? target.quantity : 0);
  const moved = Math.max(0, Math.min(quantity, source.quantity, room));
  if (moved === 0) return 0;
  if (!target) {
    target = { itemId, quantity: 0 };
    to.push(target);
  }
  target.quantity += moved;
  source.quantity -= moved;
  if (source.quantity === 0) from.splice(from.indexOf(source), 1);
  return moved;
}

/**
 * Al caer en una mazmorra se pierde el dinero y lo que se llevaba en la mochila.
 * @param {ItemStack[]} bag
 * @param {number} wallet
 * @returns {{ lostMoney: number, lostItems: number }}
 */
export function defeatLosses(bag, wallet) {
  return { lostMoney: wallet, lostItems: bag.reduce((n, s) => n + s.quantity, 0) };
}

/**
 * Marca una mazmorra como completada.
 * @param {Object} profile
 * @param {string} dungeonId
 * @returns {string[]} Ids de las mazmorras que se acaban de abrir
 */
export function markCleared(profile, dungeonId) {
  if (profile.clearedDungeons.includes(dungeonId)) return [];
  const before = DUNGEONS.filter((d) => isUnlocked(d, profile.clearedDungeons)).map((d) => d.id);
  profile.clearedDungeons.push(dungeonId);
  return DUNGEONS.filter((d) => isUnlocked(d, profile.clearedDungeons) && !before.includes(d.id)).map((d) => d.id);
}
