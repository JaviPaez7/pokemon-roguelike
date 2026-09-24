/**
 * PokemonSnapshot.js — Fichas de los Pokémon del equipo.
 *
 * Una ficha es un objeto JSON con todo lo necesario para volver a crear un
 * Pokémon del equipo: la usan el guardado (equipo en la mazmorra) y el perfil
 * (Pokémon reclutados que esperan en la base).
 */

/**
 * Ficha a partir de una entrada de `game.party`.
 * @param {Object} p
 * @returns {Object}
 */
export function toSnapshot(p) {
  return {
    uid: p.uid ?? null,
    speciesId: p.speciesId,
    name: p.name,
    level: p.level,
    xp: p.xp,
    types: p.types,
    ability: p.ability || null,
    currentMoves: p.currentMoves,
    pendingMovesToLearn: p.pendingMovesToLearn || [],
    pendingEvolution: p.pendingEvolution || null,
    evolutionDeclinedAtLevel: p.evolutionDeclinedAtLevel ?? null,
    hp: p.hp,
    maxHp: p.maxHp,
    belly: p.belly,
    maxBelly: p.maxBelly,
    attack: p.attack,
    defense: p.defense,
    spAtk: p.spAtk,
    spDef: p.spDef,
    speed: p.speed,
    statusEffects: p.statusEffects || [],
    statModifiers: p.statModifiers || {},
    bonusStats: p.bonusStats || null,
    _statusTick: p._statusTick || 0,
    isLeader: p.isLeader || false,
    tactic: p.tactic || 'follow',
    chargingState: p.chargingState || null,
    bidingState: p.bidingState || null,
    mustRecharge: !!p.mustRecharge,
    reflect: p.reflect || 0,
    lightScreen: p.lightScreen || 0,
    substitute: p.substitute || 0,
    rage: !!p.rage,
    focusEnergy: !!p.focusEnergy,
    _preTransform: p._preTransform || null,
    spriteUrl: p.spriteUrl || null,
    lastPhysicalDamageTaken: p.lastPhysicalDamageTaken || 0,
    _intimidatedBy: p._intimidatedBy || [],
    protectStats: p.protectStats || 0,
    _rageTurns: p._rageTurns,
    _focusTurns: p._focusTurns,
    _traced: !!p._traced,
    heldItem: p.heldItem ?? null,
  };
}

/**
 * La ficha tras descansar en la base: PS, PP y tripa al máximo, sin estados ni
 * efectos de combate. Si estaba transformado o había copiado un movimiento con
 * Mimético, recupera lo suyo.
 * @param {Object} p
 * @param {{ id: number, pp?: number }[]} movesData - Para los PP del movimiento original de Mimético
 * @returns {Object} Ficha nueva
 */
export function restedSnapshot(p, movesData) {
  const base = p._preTransform ? { ...p, ...p._preTransform } : p;
  return {
    ...base,
    hp: base.maxHp,
    belly: base.maxBelly || 100,
    currentMoves: (base.currentMoves || []).map((m) => {
      const moveId = m._mimicOriginal ?? m.moveId;
      const maxPP = m._mimicOriginal != null ? (movesData.find((d) => d.id === moveId)?.pp ?? m.maxPP) : m.maxPP;
      return { moveId, currentPP: maxPP, maxPP, enabled: true };
    }),
    statusEffects: [],
    statModifiers: {},
    _statusTick: 0,
    chargingState: null,
    bidingState: null,
    mustRecharge: false,
    reflect: 0,
    lightScreen: 0,
    substitute: 0,
    rage: false,
    focusEnergy: false,
    _preTransform: null,
    spriteUrl: null,
    lastPhysicalDamageTaken: 0,
    _intimidatedBy: [],
    protectStats: 0,
    _rageTurns: undefined,
    _focusTurns: undefined,
  };
}

/**
 * Crea las entidades de un Pokémon del equipo a partir de su ficha, en (0, 0).
 * No lo añade al sistema de turnos ni decide quién es el jugador.
 * @param {import('./Game.js').Game} game
 * @param {Object} p - Ficha
 * @param {{ slot: number, isLeader: boolean }} placement
 * @returns {number} Id de la entidad
 */
export function spawnFromSnapshot(game, p, { slot, isLeader }) {
  const em = game.entityManager;
  const id = em.createEntity();

  em.setComponent(id, 'position', { x: 0, y: 0, facing: 'down', prevX: 0, prevY: 0, moveStartTime: 0 });

  em.setComponent(id, 'pokemonInfo', {
    speciesId: p.speciesId,
    name: p.name,
    level: p.level,
    xp: p.xp,
    ability: p.ability || null,
    _traced: !!p._traced,
    heldItem: p.heldItem ?? null,
    currentMoves: (p.currentMoves || []).map((m) => {
      const enabled = m.enabled !== undefined ? m.enabled : true;
      const disableTurns = m._disableTurns;
      const fixedEnabled = !enabled && (disableTurns == null || disableTurns <= 0) ? true : enabled;
      const slotData = {
        moveId: m.moveId,
        currentPP: m.currentPP,
        maxPP: m.maxPP,
        enabled: fixedEnabled,
        _mimicOriginal: m._mimicOriginal,
      };
      if (!fixedEnabled && disableTurns != null && disableTurns > 0) {
        slotData._disableTurns = disableTurns;
      }
      return slotData;
    }),
    pendingMovesToLearn: p.pendingMovesToLearn || [],
    pendingEvolution: p.pendingEvolution || null,
    evolutionDeclinedAtLevel: p.evolutionDeclinedAtLevel ?? null,
    types: p.types,
  });

  // Sueño/congelación al cargar: duración finita (evita softlock con turnsLeft -1)
  const statuses = (p.statusEffects || []).map((s) => {
    if (typeof s === 'string') {
      if (s === 'sleep') return { type: 'sleep', turnsLeft: 2 };
      if (s === 'freeze') return { type: 'freeze', turnsLeft: 2 };
      return { type: s, turnsLeft: 3 };
    }
    if (
      ['sleep', 'freeze', 'paralyze', 'confuse', 'burn', 'poison'].includes(s.type) &&
      (s.turnsLeft === -1 || s.turnsLeft == null || s.turnsLeft <= 0)
    ) {
      const defaults = { sleep: 2, freeze: 2, paralyze: 3, confuse: 3, burn: 5, poison: 5 };
      return { ...s, turnsLeft: defaults[s.type] || 3 };
    }
    // Drenadoras: IDs de entidad no sobreviven al cargar
    if (s.type === 'leech_seed') {
      return { ...s, sourceId: null, sourcePartySlot: s.sourcePartySlot ?? null };
    }
    return s;
  });

  const movesForCharge = (p.currentMoves || []).map((m) => m && m.moveId);
  let charging = p.chargingState || null;
  let biding = p.bidingState || null;
  if (charging && !movesForCharge.includes(charging.moveId)) charging = null;
  if (biding && !movesForCharge.includes(biding.moveId)) biding = null;

  em.setComponent(id, 'fighter', {
    hp: p.hp,
    maxHp: p.maxHp,
    belly: p.belly !== undefined ? p.belly : 100,
    maxBelly: p.maxBelly || 100,
    attack: p.attack,
    defense: p.defense,
    spAtk: p.spAtk,
    spDef: p.spDef,
    speed: p.speed,
    statusEffects: statuses,
    statModifiers: p.statModifiers || {},
    bonusStats: p.bonusStats || { maxHp: 0, attack: 0, defense: 0, spAtk: 0, spDef: 0, speed: 0 },
    _statusTick: p._statusTick || 0,
    charging,
    biding,
    mustRecharge: !!p.mustRecharge,
    reflect: p.reflect || 0,
    lightScreen: p.lightScreen || 0,
    substitute: p.substitute || 0,
    rage: !!p.rage,
    focusEnergy: !!p.focusEnergy,
    _preTransform: p._preTransform || null,
    _intimidatedBy: p._intimidatedBy || [],
    protectStats: p.protectStats || 0,
    _rageTurns: p._rageTurns,
    _focusTurns: p._focusTurns,
    lastPhysicalDamageTaken: p.lastPhysicalDamageTaken || 0,
  });

  const pokeRef = game.pokemonData.find((poke) => poke.id === p.speciesId || poke.name.toLowerCase() === p.speciesId);
  const defaultSprite = pokeRef
    ? pokeRef.sprite
    : `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${p.speciesId}.png`;
  // Si hay transformación activa, conservar el sprite copiado
  const spriteUrl = p._preTransform && p.spriteUrl ? p.spriteUrl : defaultSprite;
  em.setComponent(id, 'sprite', { url: spriteUrl, image: null, loaded: false });

  em.setComponent(id, 'partyMember', { slot, isLeader, tactic: p.tactic || 'follow', uid: p.uid ?? null });
  if (!isLeader) {
    em.setComponent(id, 'aiControlled', { behavior: 'follower', detectRange: 5, alertedTo: null });
  }
  return id;
}
