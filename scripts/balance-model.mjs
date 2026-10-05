/**
 * balance-model.mjs — Modelo del equilibrio del juego.
 *
 * Mide con la lógica real del juego (src/core, src/systems, src/map, src/entities)
 * y los JSON de src/data la curva de experiencia, el combate, la economía, el
 * viento, el reclutamiento y el CI. No toca el DOM ni el estado de una partida.
 *
 * Lo usan `scripts/balance-report.mjs` (`npm run balance`), que imprime el
 * informe, y los tests de la curva (`tests/unit/balance.test.js`).
 *
 * El azar se resuelve con valores esperados exactos cuando se puede y, si no,
 * con muestras del RNG con semilla de core/Random.js (`MODEL_SEED`): el informe
 * sale igual en cada ejecución. Unas pocas fórmulas viven dentro de funciones
 * que no se exportan o en la interfaz; esas se replican aquí y lo dicen con
 * «Réplica de …».
 *
 * Supuestos del modelo (los dice también el informe):
 * - El equipo sale del pueblo con el protagonista y el compañero a nivel 5 y la
 *   experiencia con la que los crea `createPokemon` (el mínimo de su nivel).
 *   La experiencia de cada salvaje derrotado (`calculateExpGained`, con los
 *   bonus de experience.json) va entera a cada miembro en pie (ActionSystem),
 *   así que el nivel del equipo es el de cualquiera de ellos.
 * - Sin repetir mazmorras y sin contar misiones, casas de monstruos, caramelos
 *   ni amistosos: la única experiencia es la de los salvajes que aparecen al
 *   entrar en cada piso y la del jefe.
 * - Dos ritmos: `todo` (el equipo derrota a todos los salvajes de cada piso, el
 *   máximo sin repetir) y `tipico` (a `TYPICAL_KILL_RATE` de ellos).
 * - «Protagonista típico»: la mediana de los nueve protagonistas del test de
 *   personalidad, evolucionados por nivel (sin piedras), con los cuatro últimos
 *   movimientos de su lista (lo que da `createPokemon`) y usando lo que más daño
 *   hace (o el ataque básico, sin tipo: `basicAttackMove`). Los salvajes y los
 *   jefes eligen con `selectBestMove`, como en el juego: entre sus movimientos y
 *   el ataque básico, en combates de `FIGHT_ACTIONS` acciones en los que la IA
 *   ve los estados y los cambios de características que ya ha puesto (así no
 *   los repite). Sin clima ni habilidades que se activan en combate, y el daño
 *   no cuenta los estados ni los cambios de características: es el de
 *   `calculateDamage` con los PS y las características de cada uno.
 *
 * Réplicas (la fórmula está en una función que no se exporta o en la interfaz):
 * niveles y número de salvajes y PS del jefe (FloorManager), experiencia
 * repartida (ActionSystem), Metrónomo (executeMove), Poké al derrotar y botín
 * del jefe (GameEvents), tesoros (FloorEvents), precio de venta (MerchantMenu)
 * y tripa (Game).
 */

import pokemonData from '../src/data/pokemon.json';
import movesData from '../src/data/moves.json';
import typesData from '../src/data/types.json';
import floorsData from '../src/data/floors.json';
import itemsData from '../src/data/items.json';
import evolutionsData from '../src/data/evolutions.json';
import personalityData from '../src/data/personality.json';

import { MAP_WIDTH, MAP_HEIGHT } from '../src/constants.js';
import { floorSeed, random, setSeed } from '../src/core/Random.js';
import { TurnManager } from '../src/core/TurnManager.js';
import { DUNGEONS, WIND } from '../src/core/Dungeons.js';
import { DIFFICULTIES, MISSION_RULES, rewardMoney, rewardPoints } from '../src/core/Missions.js';
import { buyPrice, townShopStock, SHOP_STAPLES } from '../src/core/Shop.js';
import { recruitChance, RECRUITMENT } from '../src/core/Recruitment.js';
import { gummiIq, IQ_SKILLS } from '../src/core/IQ.js';
import { RANKS } from '../src/core/Profile.js';
import { STARTING_LEVEL, STARTING_MONEY } from '../src/core/TownSession.js';
import { CHALLENGE_LEVEL, CHALLENGE_PRIZE, clearRankPoints } from '../src/core/Expedition.js';
import { EntityManager } from '../src/entities/EntityManager.js';
import { calculateExpGained, expForLevel, grantExperience, EXPERIENCE } from '../src/systems/ExperienceSystem.js';
import { calculateDamage, selectBestMove } from '../src/systems/CombatSystem.js';
import { checkEvolution } from '../src/systems/EvolutionSystem.js';
import { spawnItems } from '../src/systems/ItemSystem.js';
import { DungeonGenerator } from '../src/map/DungeonGenerator.js';
import { aiMoveKind, hitsPerTurn, tryApplyEffect } from '../src/systems/CombatSystem.js';
import { moveRange } from '../src/systems/MoveTargeting.js';
import { AI_WEIGHTS, basicAttackMove } from '../src/core/CombatRules.js';

/** Semilla de las muestras del modelo. */
export const MODEL_SEED = 20260927;

/** Parte de los salvajes que derrota un equipo «típico» (el resto los esquiva o baja antes). */
export const TYPICAL_KILL_RATE = 0.6;

/** Ritmos de la simulación: parte de los salvajes de cada piso que se derrotan. */
export const KILL_RATES = { todo: 1, tipico: TYPICAL_KILL_RATE };

/** Parte de los salvajes que remata el líder (solo esos pueden pedir unirse): equipo de dos. */
export const LEADER_KO_SHARE = 0.5;

/** Muestras por pareja atacante-defensor al promediar el daño. */
const DAMAGE_SAMPLES = 48;

/**
 * Acciones de cada combate simulado de un salvaje o un jefe: durante un
 * combate, la IA ve los estados y los cambios de características que ya ha
 * puesto. Las `DAMAGE_SAMPLES` acciones son 8 combates de 6.
 */
export const FIGHT_ACTIONS = 6;

const SPECIES = new Map(pokemonData.map((p) => [p.id, p]));
const ITEMS = new Map(itemsData.map((i) => [i.id, i]));

/** Mazmorras de la historia, en orden. */
export const STORY_DUNGEONS = DUNGEONS.filter((d) => !d.challenge && !d.postgame);
/** Mazmorras de posjuego, en orden. */
export const POSTGAME_DUNGEONS = DUNGEONS.filter((d) => d.postgame);
/** Especies de los nueve protagonistas del test de personalidad. */
export const HERO_SPECIES = personalityData.natures.map((n) => n.speciesId);

// ─── Pisos, zonas y salvajes ─────────────────────────────────────────────────

/**
 * @param {number} globalFloor
 * @returns {any} Zona de floors.json de ese piso global
 */
export function zoneAt(globalFloor) {
  return floorsData.zones.find((z) => globalFloor >= z.floors[0] && globalFloor <= z.floors[1]) ?? null;
}

/** @param {number} globalFloor @returns {boolean} Si es el piso del jefe de su zona */
export function isBossFloor(globalFloor) {
  const zone = zoneAt(globalFloor);
  return !!(zone?.boss && zone.floors[1] === globalFloor);
}

/**
 * Niveles de los salvajes de un piso y su probabilidad. Réplica de
 * `FloorManager.spawnEnemies`: `round(base + u)` con `u` en [−1, 1), acotado al
 * `levelRange` de la zona, donde `base` va del mínimo al máximo a lo largo de
 * la zona.
 * @param {number} globalFloor
 * @returns {{ level: number, p: number }[]}
 */
export function wildLevelDistribution(globalFloor) {
  const zone = zoneAt(globalFloor);
  const [minL, maxL] = zone.levelRange;
  const span = Math.max(1, zone.floors[1] - zone.floors[0]);
  const base = minL + (maxL - minL) * ((globalFloor - zone.floors[0]) / span);
  /** @type {Map<number, number>} */
  const dist = new Map();
  for (let k = Math.floor(base) - 2; k <= Math.ceil(base) + 2; k++) {
    // Math.round(base + u) === k  ⇔  u ∈ [k − 0.5 − base, k + 0.5 − base)
    const lo = Math.max(-1, k - 0.5 - base);
    const hi = Math.min(1, k + 0.5 - base);
    if (hi <= lo) continue;
    const level = Math.max(minL, Math.min(maxL, k));
    dist.set(level, (dist.get(level) ?? 0) + (hi - lo) / 2);
  }
  return [...dist].map(([level, p]) => ({ level, p }));
}

/** @param {number} globalFloor @returns {number} Nivel medio de los salvajes del piso */
export function meanWildLevel(globalFloor) {
  return wildLevelDistribution(globalFloor).reduce((s, d) => s + d.level * d.p, 0);
}

/**
 * Salvajes que aparecen al entrar en un piso (sin casas de monstruos). Réplica
 * de `FloorManager.spawnEnemies`: uniforme en `enemiesPerFloor`, con tope de 2
 * en los pisos 1-2 y de 3 en los 3-4. El piso del jefe solo tiene al jefe.
 * @param {number} globalFloor
 * @returns {number} Media
 */
export function expectedEnemies(globalFloor) {
  if (isBossFloor(globalFloor)) return 0;
  const [min, max] = zoneAt(globalFloor).enemiesPerFloor;
  let sum = 0;
  for (let n = min; n <= max; n++) {
    let count = n;
    if (globalFloor <= 2) count = Math.min(count, 2);
    else if (globalFloor <= 4) count = Math.min(count, 3);
    sum += count;
  }
  return sum / (max - min + 1);
}

/**
 * @param {any} zone
 * @returns {{ id: number, p: number }[]} Especies de la zona con su probabilidad
 */
export function speciesMix(zone) {
  const total = zone.pokemon.reduce((s, p) => s + p.weight, 0);
  return zone.pokemon.map((p) => ({ id: p.id, p: p.weight / total }));
}

/** @param {number} speciesId @returns {number} Experiencia base (la de ActionSystem si falta) */
function baseExpOf(speciesId) {
  return SPECIES.get(speciesId)?.baseExp || 50;
}

/** @param {number} globalFloor @returns {number} Experiencia media de un salvaje del piso */
export function expPerEnemy(globalFloor) {
  const levels = wildLevelDistribution(globalFloor);
  let total = 0;
  for (const s of speciesMix(zoneAt(globalFloor))) {
    for (const l of levels) total += s.p * l.p * calculateExpGained(baseExpOf(s.id), l.level);
  }
  return total;
}

/** @param {number} globalFloor @returns {number} Experiencia media de los salvajes de un piso */
export function expPerFloor(globalFloor) {
  return expectedEnemies(globalFloor) * expPerEnemy(globalFloor);
}

/**
 * PS extra del jefe. Réplica de `FloorManager.spawnEnemies`: manda
 * `hpMultiplier` de floors.json; sin él, un valor por nombre.
 * @param {{ name: string, hpMultiplier?: number }} boss
 * @returns {number}
 */
export function bossHpMultiplier(boss) {
  return boss.hpMultiplier ?? (boss.name === 'Mewtwo' ? 1.85 : boss.name === 'Onix' ? 2.0 : boss.name === 'Gengar' ? 2.1 : 2.2);
}

/** @param {any} zone @returns {number} Experiencia que da el jefe de la zona */
export function bossExp(zone) {
  return calculateExpGained(baseExpOf(zone.boss.id), zone.boss.level);
}

/**
 * Resumen de una zona de floors.json.
 * @param {any} zone
 */
export function zoneSummary(zone) {
  const floors = [];
  for (let f = zone.floors[0]; f <= zone.floors[1]; f++) if (!isBossFloor(f)) floors.push(f);
  const avg = (fn) => floors.reduce((s, f) => s + fn(f), 0) / floors.length;
  return {
    name: zone.name,
    floors: zone.floors,
    levelRange: zone.levelRange,
    enemies: avg(expectedEnemies),
    expPerEnemy: avg(expPerEnemy),
    expPerFloor: avg(expPerFloor),
    boss: zone.boss ? { ...zone.boss, hpMultiplier: bossHpMultiplier(zone.boss), exp: bossExp(zone) } : null,
  };
}

// ─── Curva de experiencia ────────────────────────────────────────────────────

/**
 * @typedef {{
 *   dungeonId: string, name: string, floors: [number, number],
 *   entry: number, atBoss: number | null, exit: number,
 *   wild: [number, number], boss: { name: string, level: number } | null,
 *   byFloor: { floor: number, level: number }[]
 * }} DungeonProgress
 */

/**
 * Experiencia con la que llega un Pokémon de ese nivel: la que le da
 * `createPokemon` (protagonista, compañero, reclutas, copias de la Torre…).
 * @param {number} level
 * @returns {number}
 */
export function creationExp(level) {
  return makePokemon(HERO_SPECIES[0], level).info.xp;
}

/**
 * Nivel del equipo al hacer unas mazmorras en orden, una vez cada una. Sube de
 * nivel con `grantExperience`, como en el juego. Sin `xp`, el equipo empieza
 * con la experiencia con la que se crea a su nivel (`creationExp`).
 * @param {{ id: string, name: string, floors: [number, number] }[]} dungeons
 * @param {{ level?: number, xp?: number, killRate?: number }} [start]
 * @returns {{ dungeons: DungeonProgress[], level: number, xp: number }}
 */
export function simulateProgress(dungeons, { level = STARTING_LEVEL, xp = creationExp(level), killRate = 1 } = {}) {
  const info = { speciesId: 133, name: 'Equipo', level, xp, currentMoves: [] };
  const fighter = { hp: 1, maxHp: 1, bonusStats: null };
  const gain = (amount) => grantExperience(info, fighter, amount, pokemonData, movesData);
  const out = [];
  for (const dungeon of dungeons) {
    const entry = info.level;
    let atBoss = null;
    const byFloor = [];
    const levels = [];
    for (let f = dungeon.floors[0]; f <= dungeon.floors[1]; f++) {
      byFloor.push({ floor: f, level: info.level });
      if (isBossFloor(f)) {
        atBoss = info.level;
        gain(bossExp(zoneAt(f)));
      } else {
        levels.push(...wildLevelDistribution(f).map((d) => d.level));
        gain(killRate * expPerFloor(f));
      }
    }
    const lastZone = zoneAt(dungeon.floors[1]);
    out.push({
      dungeonId: dungeon.id,
      name: dungeon.name,
      floors: dungeon.floors,
      entry,
      atBoss,
      exit: info.level,
      wild: [Math.min(...levels), Math.max(...levels)],
      boss: lastZone?.boss && lastZone.floors[1] === dungeon.floors[1] ? { name: lastZone.boss.name, level: lastZone.boss.level } : null,
      byFloor,
    });
  }
  return { dungeons: out, level: info.level, xp: info.xp };
}

/**
 * La historia y después el posjuego, con un ritmo de combate.
 * @param {number} killRate
 */
export function storyAndPostgame(killRate) {
  const story = simulateProgress(STORY_DUNGEONS, { killRate });
  const postgame = simulateProgress(POSTGAME_DUNGEONS, { level: story.level, xp: story.xp, killRate });
  return { story, postgame };
}

/**
 * La Torre del Desafío: copias de nivel `CHALLENGE_LEVEL` (con la experiencia
 * con la que se crean) por los 50 pisos seguidos.
 * @param {number} killRate
 */
export function challengeTower(killRate) {
  const tower = DUNGEONS.find((d) => d.challenge);
  const zones = floorsData.zones.filter((z) => z.floors[0] >= tower.floors[0] && z.floors[1] <= tower.floors[1]);
  return simulateProgress(zones.map((z) => ({ id: z.name, name: z.name, floors: z.floors })), { level: CHALLENGE_LEVEL, killRate });
}

// ─── Combate ─────────────────────────────────────────────────────────────────

const noopBus = { emit() {}, on() {}, off() {} };
const entities = new EntityManager(noopBus);
{
  // Como Game.init: diccionarios de especies y movimientos por id
  const speciesDict = {};
  for (const p of pokemonData) {
    speciesDict[p.id] = { name: p.name, types: p.types, ability: p.ability || 'none', baseStats: p.stats, learnset: p.moves, sprite: p.sprite };
  }
  const movesDict = {};
  for (const m of movesData) movesDict[m.id] = m;
  entities.loadData(speciesDict, movesDict);
}

/**
 * @typedef {{ fighter: any, info: any }} Combatant
 */

/**
 * Un Pokémon como lo crea el juego (`EntityManager.createPokemon`).
 * @param {number} speciesId
 * @param {number} level
 * @returns {Combatant}
 */
export function makePokemon(speciesId, level) {
  const id = entities.createPokemon(speciesId, level, 0, 0, true);
  const fighter = entities.getComponent(id, 'fighter');
  const info = entities.getComponent(id, 'pokemonInfo');
  entities.destroyEntity(id);
  return { fighter, info };
}

/**
 * Jefe de una zona: su nivel, su kit (`moves`) y sus PS multiplicados.
 * @param {any} zone
 * @returns {Combatant}
 */
export function makeBoss(zone) {
  const boss = makePokemon(zone.boss.id, zone.boss.level);
  if (zone.boss.moves) boss.info.currentMoves = entities.moveSlots(zone.boss.moves);
  boss.fighter.maxHp = Math.floor(boss.fighter.maxHp * bossHpMultiplier(zone.boss));
  boss.fighter.hp = boss.fighter.maxHp;
  return boss;
}

/**
 * Especie de un protagonista a un nivel, con las evoluciones por nivel.
 * @param {number} speciesId
 * @param {number} level
 * @returns {number}
 */
export function heroSpeciesAt(speciesId, level) {
  let id = speciesId;
  for (let i = 0; i < 3; i++) {
    const evo = checkEvolution({ speciesId: id, level }, evolutionsData);
    if (!evo || evo.trigger !== 'level') break;
    id = evo.to;
  }
  return id;
}

/** @param {number} level @returns {Combatant[]} Los nueve protagonistas a ese nivel */
export function heroesAt(level) {
  return HERO_SPECIES.map((id) => makePokemon(heroSpeciesAt(id, level), level));
}

/** Movimientos que puede sacar Metrónomo. Réplica de `executeMove` (`random_move`). */
const METRONOME_POOL = movesData.filter((m) => m && m.power && m.power > 0 && m.effect !== 'random_move' && m.effect !== 'self_destruct');

/**
 * Un uso de un movimiento con `calculateDamage` (fallos, críticos y la
 * variación del 85-100 %), sin clima, sin estados y sin cambios de
 * características. Metrónomo tira un movimiento al azar. Los golpes por turno,
 * con `hitsPerTurn` (los de 2 a 5 golpes, 3,1 de media; los que cargan, medio).
 * @param {Combatant} att
 * @param {Combatant} def
 * @param {any} move
 * @param {boolean} [asleep] - Si el objetivo duerme (para Come Sueños)
 * @returns {{ used: any, damage: number, hit: boolean }} El movimiento usado,
 *   su daño medio por turno y si ha acertado
 */
function oneUse(att, def, move, asleep = false) {
  const used = move.effect === 'random_move' ? METRONOME_POOL[Math.floor(random() * METRONOME_POOL.length)] : move;
  const a = { ...att.fighter, statusEffects: [], statModifiers: {} };
  // Dormido solo cuenta para Come Sueños, que falla si el objetivo está despierto
  const d = { ...def.fighter, statusEffects: asleep ? [{ type: 'sleep', turnsLeft: 1 }] : [], statModifiers: {} };
  const res = calculateDamage(a, d, used, att.info, def.info, typesData, 'normal');
  return { used, damage: (res.damage || 0) * hitsPerTurn(used), hit: !!res.hit || (res.damage || 0) > 0 };
}

/**
 * Daño de un uso de un movimiento (`oneUse`).
 * @param {Combatant} att
 * @param {Combatant} def
 * @param {any} move
 */
function oneUseDamage(att, def, move) {
  return oneUse(att, def, move).damage;
}

/**
 * Daño medio por turno de un movimiento.
 * @param {Combatant} att
 * @param {Combatant} def
 * @param {any} move
 * @param {number} [samples]
 */
function meanMoveDamage(att, def, move, samples = DAMAGE_SAMPLES) {
  if (move.effect === 'self_destruct') return 0; // El protagonista no se debilita a propósito
  let total = 0;
  for (let i = 0; i < samples; i++) total += oneUseDamage(att, def, move);
  return total / samples;
}

/**
 * Daño medio por turno del protagonista: lo que más daño hace de sus
 * movimientos y el ataque básico (`basicAttackMove`, sin tipo).
 * @param {Combatant} hero
 * @param {Combatant} foe
 */
export function heroDamage(hero, foe) {
  let best = meanMoveDamage(hero, foe, basicAttackMove(hero.info));
  for (const slot of hero.info.currentMoves) {
    const move = movesData.find((m) => m.id === slot.moveId);
    if (move && move.power !== 0) best = Math.max(best, meanMoveDamage(hero, foe, move));
  }
  return best;
}

/**
 * Copia de un combatiente para un combate simulado: sin estados ni cambios de
 * características, y con sus casillas de movimiento propias (Anulación las toca).
 * @param {Combatant} c
 * @returns {Combatant}
 */
function fightCopy(c) {
  return {
    fighter: { ...c.fighter, statusEffects: [], statModifiers: {} },
    info: { ...c.info, types: [...(c.info.types || [])], currentMoves: (c.info.currentMoves || []).map((s) => ({ ...s })) },
  };
}

/**
 * Lo que hace un salvaje o un jefe: elige con `selectBestMove` entre sus
 * movimientos y el ataque básico, como en el juego, en combates de
 * `FIGHT_ACTIONS` acciones. Lo que pone (estados, bajadas y subidas de
 * características) queda en el combate con `tryApplyEffect`, así que la IA no
 * repite un estado ni baja una característica más allá de su tope; el daño,
 * en cambio, no cuenta esos cambios.
 * @param {Combatant} foe
 * @param {Combatant} hero
 * @param {number} [samples]
 * @returns {{ damage: number, statusShare: number }} Daño medio por acción y
 *   parte de las acciones que gasta en movimientos de estado
 */
export function foeActions(foe, hero, samples = DAMAGE_SAMPLES) {
  let total = 0;
  let statusTurns = 0;
  let fight = null;
  for (let i = 0; i < samples; i++) {
    if (i % FIGHT_ACTIONS === 0) fight = { foe: fightCopy(foe), hero: fightCopy(hero) };
    const move = selectBestMove(fight.foe.info, fight.hero.info, movesData, typesData, fight.foe.fighter, fight.hero.fighter, {
      basicAttack: AI_WEIGHTS.useBasicAttack ? basicAttackMove(foe.info) : null,
    });
    if (!move) continue;
    const asleep = fight.hero.fighter.statusEffects.some((s) => s.type === 'sleep');
    const { used, damage, hit } = oneUse(foe, hero, move, asleep);
    total += damage;
    // Un turno del protagonista por cada acción del rival: sus estados se gastan
    tickStatuses(fight.hero.fighter);
    if (aiMoveKind(used) !== 'status') continue;
    statusTurns++;
    if (!hit) continue;
    const self = ['self', 'team'].includes(moveRange(used));
    const target = self ? fight.foe : fight.hero;
    tryApplyEffect(used, target.fighter, target.info, [], fight.foe.fighter, fight.foe.info, 0, false);
  }
  return { damage: total / samples, statusShare: statusTurns / samples };
}

/**
 * Pasa un turno para los estados de un combatiente (como `processStatusEffects`,
 * sin su daño): cada uno dura un turno menos.
 * @param {{ statusEffects: { turnsLeft?: number }[] }} fighter
 */
function tickStatuses(fighter) {
  fighter.statusEffects = fighter.statusEffects
    .map((s) => ({ ...s, turnsLeft: (s.turnsLeft ?? 1) - 1 }))
    .filter((s) => s.turnsLeft > 0);
}

/**
 * Daño medio por acción de un salvaje o un jefe (`foeActions`).
 * @param {Combatant} foe
 * @param {Combatant} hero
 * @param {number} [samples]
 */
export function foeDamage(foe, hero, samples = DAMAGE_SAMPLES) {
  return foeActions(foe, hero, samples).damage;
}

/**
 * Acciones de un rival por cada turno del jugador, con el `TurnManager` del juego.
 * @param {number} heroSpeed
 * @param {number} foeSpeed
 * @param {number} [turns]
 */
export function actionsPerTurn(heroSpeed, foeSpeed, turns = 120) {
  const key = `${heroSpeed}/${foeSpeed}/${turns}`;
  if (!actionsCache.has(key)) actionsCache.set(key, simulateActions(heroSpeed, foeSpeed, turns));
  return actionsCache.get(key);
}

/** @type {Map<string, number>} */
const actionsCache = new Map();

/**
 * @param {number} heroSpeed
 * @param {number} foeSpeed
 * @param {number} turns
 */
function simulateActions(heroSpeed, foeSpeed, turns) {
  const tm = new TurnManager(noopBus);
  tm.addEntity(1, heroSpeed, true);
  tm.addEntity(2, foeSpeed, false);
  let foeActions = 0;
  for (let i = 0; i < turns; i++) {
    tm.processTurn(
      { type: 'wait' },
      (id) => {
        if (id === 2) foeActions++;
        return { success: true };
      },
      () => ({ type: 'wait' }),
    );
  }
  return foeActions / turns;
}

/** Tope de golpes: más que esto es «no le hace daño». */
export const MAX_HITS = 99;

/**
 * Mediana ponderada.
 * @param {{ v: number, w: number }[]} values
 */
function weightedMedian(values) {
  const sorted = [...values].sort((a, b) => a.v - b.v);
  const half = sorted.reduce((s, x) => s + x.w, 0) / 2;
  let acc = 0;
  for (const x of sorted) {
    acc += x.w;
    if (acc >= half - 1e-9) return x.v;
  }
  return sorted.at(-1)?.v ?? 0;
}

/**
 * @typedef {{
 *   heroHits: number, heroHitsBest: number, heroDamagePct: number,
 *   foeHits: number, foeHitsWorst: number, foeDamagePct: number, foeStatusShare: number,
 *   foeActions: number, foeTurns: number, foeTurnsWorst: number,
 *   worstHero: string,
 *   perHero: { name: string, heroHits: number, foeHits: number, foeTurns: number }[]
 * }} Matchup
 * `heroHits`: golpes del protagonista para derrotar al rival (mediana; `Best`,
 * el protagonista que menos necesita). `foeHits`: golpes del rival para
 * derrotar al protagonista (mediana; `Worst`, el protagonista que menos aguanta,
 * que es `worstHero`). `foeTurns`: turnos del jugador que aguanta el
 * protagonista (golpes ÷ acciones del rival por turno). Los porcentajes son la
 * media del daño de un golpe sobre los PS máximos. `foeStatusShare`: parte de
 * las acciones del rival que son movimientos de estado. Los golpes se cuentan hasta
 * `MAX_HITS` (un rival inmune cuenta como `MAX_HITS`).
 */

/**
 * Enfrentamiento de los protagonistas contra unos rivales.
 * @param {number} heroLevel
 * @param {{ foe: Combatant, p: number }[]} foes - Rivales con su peso
 * @returns {Matchup}
 */
export function matchup(heroLevel, foes) {
  const heroes = heroesAt(heroLevel);
  const w = 1 / heroes.length;
  const rows = [];
  for (const { foe, p } of foes) {
    for (const hero of heroes) {
      const dealt = heroDamage(hero, foe);
      const { damage: taken, statusShare } = foeActions(foe, hero);
      const heroHits = dealt > 0 ? Math.min(MAX_HITS, Math.ceil(foe.fighter.maxHp / dealt)) : MAX_HITS;
      const foeHits = taken > 0 ? Math.min(MAX_HITS, Math.ceil(hero.fighter.maxHp / taken)) : MAX_HITS;
      const actions = actionsPerTurn(hero.fighter.speed, foe.fighter.speed);
      rows.push({
        name: hero.info.name,
        w: p * w,
        heroHits,
        foeHits,
        foeTurns: Math.min(MAX_HITS, foeHits / actions),
        dealtPct: Math.min(1, dealt / foe.fighter.maxHp),
        takenPct: Math.min(1, taken / hero.fighter.maxHp),
        statusShare,
        actions,
      });
    }
  }
  const median = (k) => weightedMedian(rows.map((r) => ({ v: r[k], w: r.w })));
  const mean = (k) => rows.reduce((s, r) => s + r.w * r[k], 0);
  const worst = rows.reduce((a, b) => (b.foeHits < a.foeHits ? b : a));
  return {
    heroHits: median('heroHits'),
    heroHitsBest: Math.min(...rows.map((r) => r.heroHits)),
    heroDamagePct: mean('dealtPct'),
    foeHits: median('foeHits'),
    foeHitsWorst: worst.foeHits,
    worstHero: worst.name,
    foeDamagePct: mean('takenPct'),
    foeStatusShare: mean('statusShare'),
    foeActions: mean('actions'),
    foeTurns: median('foeTurns'),
    foeTurnsWorst: Math.min(...rows.map((r) => r.foeTurns)),
    perHero: foes.length === 1 ? rows.map(({ name, heroHits, foeHits, foeTurns }) => ({ name, heroHits, foeHits, foeTurns })) : [],
  };
}

/**
 * Salvajes de una zona a un nivel, con el peso de cada especie.
 * @param {any} zone
 * @param {number} level
 */
function wildFoes(zone, level) {
  return speciesMix(zone).map((s) => ({ foe: makePokemon(s.id, level), p: s.p }));
}

/**
 * Piso de en medio de una zona (sin contar el del jefe).
 * @param {any} zone
 */
function midFloor(zone) {
  const last = zone.boss ? zone.floors[1] - 1 : zone.floors[1];
  return Math.floor((zone.floors[0] + last) / 2);
}

/**
 * Nivel del equipo al entrar en un piso global, según una simulación.
 * @param {DungeonProgress[]} progress
 * @param {number} globalFloor
 */
function levelAtFloor(progress, globalFloor) {
  for (const d of progress) {
    const hit = d.byFloor.find((f) => f.floor === globalFloor);
    if (hit) return hit.level;
  }
  return null;
}

/**
 * Combate contra los salvajes de cada zona (en su piso de en medio) y contra
 * cada jefe, con el nivel del equipo que da la simulación. Cada enfrentamiento
 * siembra el RNG por su cuenta: los jefes salen igual se calculen o no los
 * salvajes.
 * @param {DungeonProgress[]} progress - Historia y posjuego seguidos
 * @param {{ wilds?: boolean }} [options] - `wilds: false` calcula solo los jefes
 */
export function combatTable(progress, { wilds = true } = {}) {
  return floorsData.zones.map((zone, i) => {
    const floor = midFloor(zone);
    const heroLevel = levelAtFloor(progress, floor);
    const wildLevel = Math.round(meanWildLevel(floor));
    let wild = null;
    if (wilds) {
      setSeed(MODEL_SEED + i);
      wild = matchup(heroLevel, wildFoes(zone, wildLevel));
    }
    let boss = null;
    if (zone.boss) {
      setSeed(MODEL_SEED + 1000 + i);
      const bossHeroLevel = levelAtFloor(progress, zone.floors[1]);
      const foe = makeBoss(zone);
      boss = { name: zone.boss.name, level: zone.boss.level, hp: foe.fighter.maxHp, hpMultiplier: bossHpMultiplier(zone.boss), heroLevel: bossHeroLevel, ...matchup(bossHeroLevel, [{ foe, p: 1 }]) };
    }
    return { zone: zone.name, floor, heroLevel, wildLevel, wild, boss };
  });
}

// ─── Economía ────────────────────────────────────────────────────────────────

/**
 * Precio de venta en la tienda. Réplica de `MerchantMenu.openSellMenu`.
 * @param {{ rarity?: number }} item
 */
export function sellPrice(item) {
  return Math.max(8, Math.min(120, Math.floor(12 / Math.max(0.05, item.rarity || 0.2))));
}

/**
 * Poké medios por salvaje derrotado. Réplica de GameEvents (`pokemon_fainted`):
 * `max(3, floor(nivel × (2 + 2u)))`.
 * @param {number} level
 */
export function coinsPerKill(level) {
  const n = 400;
  let total = 0;
  for (let i = 0; i < n; i++) total += Math.max(3, Math.floor(level * (2 + (2 * (i + 0.5)) / n)));
  return total / n;
}

/** Réplica de GameEvents: botín del jefe, `40 + [0, 30) + 2 × piso`. @param {number} globalFloor */
export function bossCoins(globalFloor) {
  return 40 + 14.5 + globalFloor * 2;
}

/**
 * Réplica de FloorEvents: un 38 % de pisos (no el 1) tiene evento y 1 de cada 8
 * es un tesoro con `20 + [0, 25) + piso` Poké.
 * @param {number} globalFloor
 */
export function treasureCoins(globalFloor) {
  return globalFloor === 1 ? 0 : 0.38 * (1 / 8) * (20 + 12 + globalFloor);
}

/**
 * Objetos del suelo de un piso con `spawnItems` (el reparto real por rareza),
 * muestreados con el RNG con semilla.
 * @param {number} globalFloor
 * @param {number} [samples]
 * @returns {Map<string, number>} Probabilidad de cada objeto
 */
export function floorItemOdds(globalFloor, samples = 1500) {
  setSeed(MODEL_SEED + globalFloor);
  const counts = new Map();
  const fakeEntities = {
    createItemEntity(itemId) {
      counts.set(itemId, (counts.get(itemId) ?? 0) + 1);
      return 0;
    },
  };
  const points = Array.from({ length: samples }, (_, i) => ({ x: i, y: 0 }));
  spawnItems(points, samples, itemsData, fakeEntities, globalFloor);
  return new Map([...counts].map(([id, n]) => [id, n / samples]));
}

/**
 * Objetos que aparecen en el suelo de un piso. Réplica de
 * `FloorManager.generateFloor`: uniforme en `itemsPerFloor`; la sala del jefe no
 * tiene puntos para objetos.
 * @param {number} globalFloor
 */
export function expectedFloorItems(globalFloor) {
  if (isBossFloor(globalFloor)) return 0;
  const [min, max] = zoneAt(globalFloor).itemsPerFloor;
  return (min + max) / 2;
}

/** Cache de `floorItemOdds` por piso. */
const itemOddsCache = new Map();
/** @param {number} globalFloor */
function itemOdds(globalFloor) {
  if (!itemOddsCache.has(globalFloor)) itemOddsCache.set(globalFloor, floorItemOdds(globalFloor));
  return itemOddsCache.get(globalFloor);
}

/**
 * Lo que vale vender un objeto medio del suelo de un piso.
 * @param {number} globalFloor
 */
export function floorItemValue(globalFloor) {
  let value = 0;
  for (const [id, p] of itemOdds(globalFloor)) value += p * sellPrice(ITEMS.get(id));
  return value;
}

/**
 * Dinero medio de un encargo en un piso, con la mezcla de tipos del tablón.
 * @param {number} globalFloor
 */
export function meanMissionMoney(globalFloor) {
  const types = Object.entries(MISSION_RULES.types);
  const total = types.reduce((s, [, t]) => s + t.weight, 0);
  return types.reduce((s, [type, t]) => s + (t.weight / total) * rewardMoney(type, globalFloor), 0);
}

/**
 * Recompensas de las misiones por rango: pisos, dinero (por tipo, en el primer
 * y el último piso del rango) y puntos.
 */
export function missionTable() {
  let from = 1;
  const last = Math.max(...floorsData.zones.map((z) => z.floors[1]));
  return DIFFICULTIES.map((d) => {
    const to = Math.min(d.upTo, last);
    const row = {
      rank: d.rank,
      floors: [from, to],
      points: rewardPoints('rescue', d),
      money: Object.fromEntries(Object.keys(MISSION_RULES.types).map((type) => [type, [rewardMoney(type, from), rewardMoney(type, to)]])),
      mean: [meanMissionMoney(from), meanMissionMoney(to)],
    };
    from = to + 1;
    return row;
  });
}

/**
 * Consumo de tripa por turno del líder. Réplica de `Game._processPlayerAction`.
 * @param {number} globalFloor
 */
export function bellyDrain(globalFloor) {
  return globalFloor <= 3 ? 0.08 : globalFloor <= 12 ? 0.1 : globalFloor <= 30 ? 0.12 : 0.13;
}

/**
 * Dinero de una expedición completa a una mazmorra (primera vez) y lo que se
 * gasta en comida, con los turnos por piso de `windTable`.
 * @param {{ id: string, floors: [number, number] }} dungeon
 * @param {number} killRate
 * @param {number} turnsPerFloor - Turnos medios por piso
 */
export function expeditionMoney(dungeon, killRate, turnsPerFloor) {
  let ground = 0;
  let items = 0;
  let itemValue = 0;
  let belly = 0;
  for (let f = dungeon.floors[0]; f <= dungeon.floors[1]; f++) {
    const coins = wildLevelDistribution(f).reduce((s, d) => s + d.p * coinsPerKill(d.level), 0);
    ground += killRate * expectedEnemies(f) * coins + treasureCoins(f);
    if (isBossFloor(f)) ground += bossCoins(f);
    items += expectedFloorItems(f);
    itemValue += expectedFloorItems(f) * floorItemValue(f);
    belly += (isBossFloor(f) ? 40 : turnsPerFloor) * bellyDrain(f);
  }
  const apple = ITEMS.get('apple');
  const mid = Math.floor((dungeon.floors[0] + dungeon.floors[1]) / 2);
  return {
    ground,
    items,
    itemValue,
    mission: meanMissionMoney(mid),
    belly,
    apples: belly / apple.value,
    foodCost: (belly / apple.value) * buyPrice(apple),
  };
}

/**
 * Precios de la tienda del pueblo: lo básico y lo que puede salir como novedad
 * (con la frecuencia en 120 días), con su precio de compra y de venta.
 */
export function shopTable() {
  const days = 120;
  const seen = new Map();
  for (let day = 1; day <= days; day++) {
    for (const entry of townShopStock(day, itemsData)) seen.set(entry.id, (seen.get(entry.id) ?? 0) + 1);
  }
  return [...seen].map(([id, n]) => {
    const item = ITEMS.get(id);
    return { id, name: item.name, type: item.type, staple: SHOP_STAPLES.includes(id), days: n / days, buy: buyPrice(item), sell: sellPrice(item), fixed: item.price != null };
  }).sort((a, b) => Number(b.staple) - Number(a.staple) || a.buy - b.buy || a.id.localeCompare(b.id));
}

/**
 * Objetos de la tienda que cuestan lo mismo o menos que otro de su tipo más
 * corriente y que hace menos (`value`). Pasa con el tope de 250 de `buyPrice`
 * si el objeto no tiene `price`.
 * @param {ReturnType<typeof shopTable>} shop
 * @returns {{ better: ReturnType<typeof shopTable>[number], worse: ReturnType<typeof shopTable>[number] }[]}
 */
export function priceInversions(shop) {
  const out = [];
  for (const better of shop) {
    const item = ITEMS.get(better.id);
    const worse = shop.find((o) => {
      const other = ITEMS.get(o.id);
      return o.id !== better.id && other.type === item.type && o.buy >= better.buy && (other.rarity ?? 0.1) > (item.rarity ?? 0.1) && (other.value ?? 0) < (item.value ?? 0);
    });
    if (worse) out.push({ better, worse });
  }
  return out;
}

// ─── Viento ──────────────────────────────────────────────────────────────────

/**
 * Distancias en pasos desde una casilla (8 direcciones, sin cortar esquinas,
 * como `MovementSystem`).
 * @param {any} tileMap
 * @param {{ x: number, y: number }} from
 * @returns {Int32Array} −1 si no se llega
 */
function stepsFrom(tileMap, from) {
  const { width, height } = tileMap;
  const dist = new Int32Array(width * height).fill(-1);
  const queue = [from.y * width + from.x];
  dist[queue[0]] = 0;
  for (let head = 0; head < queue.length; head++) {
    const cur = queue[head];
    const x = cur % width;
    const y = (cur - x) / width;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = x + dx;
        const ny = y + dy;
        if (!tileMap.isWalkable(nx, ny)) continue;
        if (dx && dy && (!tileMap.isWalkable(x + dx, y) || !tileMap.isWalkable(x, y + dy))) continue;
        const idx = ny * width + nx;
        if (dist[idx] !== -1) continue;
        dist[idx] = dist[cur] + 1;
        queue.push(idx);
      }
    }
  }
  return dist;
}

/**
 * Pasos de un piso generado con `DungeonGenerator`: de la entrada a la escalera,
 * y recorriendo todas las salas (a la más cercana cada vez) antes de bajar.
 * @param {number} globalFloor
 * @param {string} dungeonId
 * @param {number} runSeed
 */
export function floorWalk(globalFloor, dungeonId, runSeed) {
  const seed = floorSeed(runSeed, globalFloor, dungeonId);
  const zone = zoneAt(globalFloor);
  const gen = new DungeonGenerator().generate(MAP_WIDTH, MAP_HEIGHT, seed, zone?.theme ?? 'default', false);
  const { tileMap, playerStart, stairsPos, rooms } = gen;
  const width = tileMap.width;
  const at = (dist, p) => dist[p.y * width + p.x];
  const toStairs = at(stepsFrom(tileMap, playerStart), stairsPos);
  // Una casilla transitable de cada sala (la más cercana a su centro)
  const targets = [];
  for (const room of rooms) {
    let best = null;
    let bestD = Infinity;
    for (let y = room.y; y < room.y + room.h; y++) {
      for (let x = room.x; x < room.x + room.w; x++) {
        if (!tileMap.isWalkable(x, y)) continue;
        const d = Math.abs(x - (room.x + room.w / 2)) + Math.abs(y - (room.y + room.h / 2));
        if (d < bestD) {
          bestD = d;
          best = { x, y };
        }
      }
    }
    if (best) targets.push(best);
  }
  let pos = playerStart;
  let tour = 0;
  const left = [...targets];
  while (left.length) {
    const dist = stepsFrom(tileMap, pos);
    let pick = -1;
    let pickD = Infinity;
    left.forEach((t, i) => {
      const d = at(dist, t);
      if (d >= 0 && d < pickD) {
        pickD = d;
        pick = i;
      }
    });
    if (pick === -1) break;
    tour += pickD;
    pos = left.splice(pick, 1)[0];
  }
  tour += Math.max(0, at(stepsFrom(tileMap, pos), stairsPos));
  return { toStairs, tour, rooms: rooms.length };
}

/**
 * El viento de cada mazmorra frente a lo que se tarda en sus pisos.
 * @param {number} [runs] - Partidas simuladas por mazmorra
 * @param {Map<string, number>} [fightTurns] - Turnos de combate por salvaje, por zona
 */
export function windTable(runs = 6, fightTurns = new Map()) {
  return DUNGEONS.filter((d) => !d.challenge).map((dungeon) => {
    const walks = [];
    let fights = 0;
    let floors = 0;
    for (let f = dungeon.floors[0]; f <= dungeon.floors[1]; f++) {
      if (isBossFloor(f)) continue;
      floors++;
      fights += expectedEnemies(f) * (fightTurns.get(zoneAt(f).name) ?? 3);
      for (let r = 1; r <= runs; r++) walks.push(floorWalk(f, dungeon.id, r * 7919));
    }
    const mean = (k) => walks.reduce((s, w) => s + w[k], 0) / walks.length;
    const max = (k) => Math.max(...walks.map((w) => w[k]));
    const fightPerFloor = fights / floors;
    return {
      dungeonId: dungeon.id,
      name: dungeon.name,
      limit: WIND.limit,
      warnings: WIND.warnings,
      toStairs: mean('toStairs'),
      toStairsMax: max('toStairs'),
      tour: mean('tour'),
      tourMax: max('tour'),
      fights: fightPerFloor,
      full: mean('tour') + fightPerFloor,
      fullMax: max('tour') + fightPerFloor,
    };
  });
}

// ─── Reclutamiento y CI ──────────────────────────────────────────────────────

/**
 * Probabilidad de reclutamiento de los salvajes de cada zona con el líder al
 * nivel de la simulación, y reclutas que se ofrecen en una pasada.
 * @param {DungeonProgress[]} progress
 * @param {number} killRate
 */
export function recruitTable(progress, killRate) {
  return DUNGEONS.filter((d) => !d.challenge).map((dungeon) => {
    let offers = 0;
    let chanceSum = 0;
    let n = 0;
    const perSpecies = new Map();
    for (let f = dungeon.floors[0]; f <= dungeon.floors[1]; f++) {
      if (isBossFloor(f)) continue;
      const leader = levelAtFloor(progress, f);
      let floorChance = 0;
      for (const s of speciesMix(zoneAt(f))) {
        for (const l of wildLevelDistribution(f)) {
          const c = recruitChance({ speciesId: s.id, captureRate: SPECIES.get(s.id).captureRate, targetLevel: l.level, leaderLevel: leader });
          floorChance += s.p * l.p * c;
          perSpecies.set(s.id, Math.max(perSpecies.get(s.id) ?? 0, c));
        }
      }
      chanceSum += floorChance;
      n++;
      offers += killRate * expectedEnemies(f) * LEADER_KO_SHARE * floorChance;
    }
    const chances = [...perSpecies.values()];
    // Un recluta es el salvaje tal cual lo creó createPokemon: su nivel y la
    // experiencia con la que llega. Un miembro del equipo, justo al subir.
    const mid = Math.floor((dungeon.floors[0] + dungeon.floors[1] - 1) / 2);
    const recruitLevel = Math.round(meanWildLevel(mid));
    const next = expForLevel(recruitLevel + 1);
    const kills = (amount) => amount / expPerEnemy(mid);
    return {
      dungeonId: dungeon.id,
      name: dungeon.name,
      chance: chanceSum / n,
      min: Math.min(...chances),
      max: Math.max(...chances),
      offers,
      recruitLevel,
      recruitExp: creationExp(recruitLevel),
      killsToLevelUp: { member: kills(next - expForLevel(recruitLevel)), recruit: kills(next - creationExp(recruitLevel)) },
    };
  });
}

/**
 * Gominolas que aparecen en el suelo de cada mazmorra y CI que dan.
 */
export function iqTable() {
  const gummis = itemsData.filter((i) => i.type === 'gummi').map((i) => i.id);
  const perDungeon = DUNGEONS.filter((d) => !d.challenge).map((dungeon) => {
    let found = 0;
    for (let f = dungeon.floors[0]; f <= dungeon.floors[1]; f++) {
      const odds = itemOdds(f);
      found += expectedFloorItems(f) * gummis.reduce((s, id) => s + (odds.get(id) ?? 0), 0);
    }
    return { dungeonId: dungeon.id, name: dungeon.name, gummis: found };
  });
  const fav = gummiIq('red_gummi', ['fire']).gained;
  const other = gummiIq('red_gummi', ['water']).gained;
  const skills = IQ_SKILLS.map((s) => ({ ...s, favorite: Math.ceil(s.iq / fav), other: Math.ceil(s.iq / other) }));
  const gummiPrice = Math.min(...gummis.map((id) => buyPrice(ITEMS.get(id))));
  return { perDungeon, skills, favorite: fav, other, gummiPrice };
}

// ─── Informe completo ────────────────────────────────────────────────────────

/**
 * Todo el informe como datos.
 * @param {{ windRuns?: number }} [options]
 */
export function buildReport({ windRuns = 6 } = {}) {
  const zones = floorsData.zones.map(zoneSummary);
  const full = storyAndPostgame(KILL_RATES.todo);
  const typical = storyAndPostgame(KILL_RATES.tipico);
  const typicalAll = [...typical.story.dungeons, ...typical.postgame.dungeons];
  const combat = combatTable(typicalAll);
  const fightTurns = new Map(combat.map((c) => [c.zone, c.wild.heroHits]));
  const wind = windTable(windRuns, fightTurns);
  const turnsPerFloor = new Map(wind.map((w) => [w.dungeonId, w.full]));
  const economy = DUNGEONS.filter((d) => !d.challenge).map((d) => ({
    dungeonId: d.id,
    name: d.name,
    ...expeditionMoney(d, KILL_RATES.tipico, turnsPerFloor.get(d.id)),
  }));
  const towerTypical = challengeTower(KILL_RATES.tipico);
  const towerFull = challengeTower(KILL_RATES.todo);
  const report = {
    assumptions: {
      startLevel: STARTING_LEVEL,
      startExp: creationExp(STARTING_LEVEL),
      startMoney: STARTING_MONEY,
      typicalKillRate: TYPICAL_KILL_RATE,
      leaderKoShare: LEADER_KO_SHARE,
      damageSamples: DAMAGE_SAMPLES,
      windRuns,
      seed: MODEL_SEED,
    },
    expConfig: EXPERIENCE,
    zones,
    progress: { full, typical },
    tower: { full: towerFull.dungeons, typical: towerTypical.dungeons, prize: CHALLENGE_PRIZE },
    combat,
    missions: missionTable(),
    ranks: RANKS,
    storyClearPoints: STORY_DUNGEONS.reduce((s, d) => s + clearRankPoints(d, true), 0),
    economy,
    shop: shopTable(),
    outlaw: { levelBonus: MISSION_RULES.outlaw.levelBonus, hpMultiplier: MISSION_RULES.outlaw.hpMultiplier },
    wind,
    recruit: recruitTable(typicalAll, KILL_RATES.tipico),
    recruitConfig: RECRUITMENT,
    iq: iqTable(),
  };
  return { ...report, issues: findIssues(report) };
}

// ─── Avisos ──────────────────────────────────────────────────────────────────

/**
 * Mazmorras que se abren a la vez que otras (mismo `unlock`) y su puesto en el
 * menú entre ellas: 0 la primera. Se pueden hacer en cualquier orden.
 * @returns {Map<string, number>}
 */
export function anyOrderDungeons() {
  const groups = new Map();
  for (const d of DUNGEONS.filter((x) => !x.challenge && x.unlock)) {
    const key = JSON.stringify(d.unlock);
    groups.set(key, [...(groups.get(key) ?? []), d.id]);
  }
  const out = new Map();
  for (const ids of groups.values()) if (ids.length > 1) ids.forEach((id, i) => out.set(id, i));
  return out;
}

/**
 * Umbrales de los avisos del informe (y de los tests de la curva).
 */
export const LIMITS = {
  /** El protagonista típico no derrota a un jefe en menos golpes. */
  bossMinHeroHits: 3,
  /** Un jefe no deja KO de un golpe al protagonista típico (mediana de los nueve). */
  bossMinFoeHits: 2,
  /** En la historia, ni al protagonista que peor lo lleva. */
  storyBossMinFoeHitsWorst: 2,
  /** Un jefe que necesita más golpes que esto para derrotar al protagonista típico no es una amenaza. */
  bossMaxFoeHits: 12,
  /** Nivel del equipo típico al llegar al jefe menos el del jefe. */
  bossLevelGap: [-4, 4],
  /** Los salvajes del posjuego empiezan a esta distancia (como mucho) del nivel de Mewtwo. */
  postgameStartGap: 6,
  /** El viento da este margen sobre el peor recorrido completo de un piso. */
  windMargin: 1.5,
  /** Un recluta tarda en subir su primer nivel como mucho estas veces lo que un miembro del equipo. */
  recruitSlowdown: 5,
};

/**
 * @typedef {{ area: string, level: 'aviso' | 'nota', text: string }} Issue
 */

/**
 * Problemas del equilibrio con números, según `LIMITS`.
 * @param {Omit<ReturnType<typeof buildReport>, 'issues'>} report
 * @returns {Issue[]}
 */
export function findIssues(report) {
  /** @type {Issue[]} */
  const issues = [];
  const add = (area, level, text) => issues.push({ area, level, text });
  const fmt = (n) => (Math.round(n * 10) / 10).toLocaleString('es-ES');

  // Niveles de los salvajes y de los jefes
  const storyZones = floorsData.zones.filter((z) => z.floors[1] <= STORY_DUNGEONS.at(-1).floors[1]);
  for (let i = 1; i < storyZones.length; i++) {
    const [a, b] = [storyZones[i - 1], storyZones[i]];
    if (b.levelRange[0] < a.levelRange[0] || b.levelRange[1] < a.levelRange[1]) {
      add('Experiencia', 'aviso', `Los salvajes bajan de ${a.name} (${a.levelRange.join('-')}) a ${b.name} (${b.levelRange.join('-')}).`);
    }
  }
  for (const z of floorsData.zones) {
    if (z.boss && z.boss.level <= z.levelRange[1]) add('Experiencia', 'aviso', `${z.boss.name} (nivel ${z.boss.level}) no supera a los salvajes de ${z.name} (hasta ${z.levelRange[1]}).`);
    if (z.boss && z.boss.hpMultiplier == null) add('Combate', 'nota', `${z.boss.name} no tiene hpMultiplier en floors.json: usa el de FloorManager (×${bossHpMultiplier(z.boss)}).`);
  }

  // Equipo frente a los jefes. Las mazmorras que se abren a la vez (los tres
  // picos) se hacen en cualquier orden: la simulación va en el del menú, así
  // que lo que pase en la segunda o la tercera es una nota, no un aviso
  const parallel = anyOrderDungeons();
  const [lo, hi] = LIMITS.bossLevelGap;
  for (const [key, label] of [['typical', 'típico'], ['full', 'que lo derrota todo']]) {
    const { story, postgame } = report.progress[key];
    for (const d of [...story.dungeons, ...postgame.dungeons]) {
      if (!d.boss) continue;
      const gap = d.atBoss - d.boss.level;
      const late = parallel.has(d.dungeonId) && parallel.get(d.dungeonId) > 0;
      if (key === 'typical' && (gap < lo || gap > hi)) {
        add('Experiencia', late ? 'nota' : 'aviso', `Equipo ${label} llega a ${d.boss.name} (${d.boss.level}) con nivel ${d.atBoss} (${gap > 0 ? '+' : ''}${gap})${late ? ' si hace su mazmorra después de las otras que se abren con ella' : ''}.`);
      }
      if (key === 'full' && gap > hi + 2) add('Experiencia', 'nota', `Equipo ${label} llega a ${d.boss.name} (${d.boss.level}) con nivel ${d.atBoss} (+${gap}).`);
    }
  }

  // Posjuego
  const mewtwo = floorsData.zones.find((z) => z.boss?.id === 150)?.boss;
  const firstPost = zoneAt(POSTGAME_DUNGEONS[0].floors[0]);
  if (mewtwo && Math.abs(firstPost.levelRange[0] - mewtwo.level) > LIMITS.postgameStartGap) {
    add('Posjuego', 'aviso', `El posjuego empieza con salvajes de nivel ${firstPost.levelRange[0]}, lejos de Mewtwo (${mewtwo.level}).`);
  }
  for (const d of report.progress.typical.postgame.dungeons) {
    if (d.entry <= d.wild[1]) continue;
    if (parallel.get(d.dungeonId) > 0) {
      add('Posjuego', 'nota', `${d.name} se hace en cualquier orden: si va después de las otras, el equipo típico entra con nivel ${d.entry}, por encima de todos sus salvajes (${d.wild.join('-')}).`);
    } else {
      add('Posjuego', 'aviso', `En ${d.name} el equipo típico entra con nivel ${d.entry}, por encima de todos sus salvajes (${d.wild.join('-')}).`);
    }
  }

  // Combate
  const combat = report.combat;
  for (let i = 1; i < combat.length; i++) {
    const [a, b] = [combat[i - 1], combat[i]];
    if (a.wild.foeHits >= 2 * b.wild.foeHits && b.wild.foeHits <= 5) {
      add('Combate', 'nota', `Salto en los salvajes de ${a.zone} a ${b.zone}: el protagonista típico aguanta ${fmt(a.wild.foeHits)} golpes y luego ${fmt(b.wild.foeHits)}.`);
    }
  }
  const lastStory = STORY_DUNGEONS.at(-1).floors[1];
  for (const c of combat) {
    if (!c.boss) continue;
    const b = c.boss;
    const story = zoneAt(c.floor).floors[1] <= lastStory;
    if (b.heroHits < LIMITS.bossMinHeroHits) add('Combate', 'aviso', `${b.name} cae en ${b.heroHits} golpes del protagonista típico.`);
    if (b.foeHits < LIMITS.bossMinFoeHits) add('Combate', 'aviso', `${b.name} deja KO al protagonista típico en ${b.foeHits} golpe.`);
    if (story && b.foeHitsWorst < LIMITS.storyBossMinFoeHitsWorst) add('Combate', 'aviso', `${b.name} deja KO de un golpe a ${b.worstHero}.`);
    if (!story && b.foeHitsWorst < LIMITS.bossMinFoeHits) add('Combate', 'nota', `${b.name} deja KO de un golpe a ${b.worstHero} (posjuego).`);
    if (b.foeHits > LIMITS.bossMaxFoeHits) add('Combate', 'aviso', `${b.name} apenas hace daño: necesita ${b.foeHits >= MAX_HITS ? 'más de 99' : b.foeHits} golpes para derrotar al protagonista típico.`);
  }

  // Economía
  const ms = report.missions;
  for (let i = 1; i < ms.length; i++) {
    if (ms[i].mean[0] <= ms[i - 1].mean[1] - 1e-9 && ms[i].mean[0] < ms[i - 1].mean[0]) add('Economía', 'aviso', `Las misiones ${ms[i].rank} pagan menos que las ${ms[i - 1].rank}.`);
    if (ms[i].points < ms[i - 1].points) add('Economía', 'aviso', `Las misiones ${ms[i].rank} dan menos puntos que las ${ms[i - 1].rank}.`);
  }
  for (const s of report.shop) {
    if (s.buy <= s.sell) add('Economía', 'aviso', `${s.name} se compra por ${s.buy} y se vende por ${s.sell}.`);
  }
  for (const { better, worse } of priceInversions(report.shop)) {
    add('Economía', 'aviso', `${better.name} (rareza ${ITEMS.get(better.id).rarity}) cuesta ${better.buy}, lo mismo o menos que ${worse.name} (rareza ${ITEMS.get(worse.id).rarity}), y hace más.`);
  }

  // Viento
  for (const w of report.wind) {
    if (w.warnings[0] < w.fullMax) add('Viento', 'aviso', `En ${w.name} el primer aviso (${w.warnings[0]}) llega antes que el peor recorrido completo (${fmt(w.fullMax)}).`);
    if (w.limit < LIMITS.windMargin * w.fullMax) add('Viento', 'aviso', `En ${w.name} el viento (${w.limit}) da menos de ×${LIMITS.windMargin} sobre el peor recorrido (${fmt(w.fullMax)}).`);
  }

  // Reclutamiento
  const slow = report.recruit.filter((r) => r.killsToLevelUp.recruit > LIMITS.recruitSlowdown * r.killsToLevelUp.member);
  if (slow.length) {
    const worst = slow.at(-1);
    add('Reclutamiento', 'aviso', `Un recluta llega con ${fmt(worst.recruitExp)} de experiencia: en ${worst.name} (nivel ${worst.recruitLevel}) necesita ${fmt(worst.killsToLevelUp.recruit)} salvajes para subir uno, frente a ${fmt(worst.killsToLevelUp.member)} de un miembro del equipo (código: createPokemon).`);
  }
  return issues;
}
