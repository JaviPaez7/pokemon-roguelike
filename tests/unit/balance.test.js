/**
 * Tests de la curva de equilibrio: fallan si un cambio en los datos
 * (floors.json, missions.json, items.json, dungeons.json…) rompe la progresión
 * sin querer. Los números salen de scripts/balance-model.mjs, el mismo modelo
 * que imprime `npm run balance`; los umbrales, de `LIMITS`.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import floorsData from '../../src/data/floors.json';
import { WIND } from '../../src/core/Dungeons.js';
import { wildLevelAt } from '../../src/core/Missions.js';
import {
  LIMITS,
  KILL_RATES,
  MAX_HITS,
  STORY_DUNGEONS,
  POSTGAME_DUNGEONS,
  anyOrderDungeons,
  combatTable,
  meanWildLevel,
  missionTable,
  priceInversions,
  shopTable,
  simulateProgress,
  storyAndPostgame,
  windTable,
  zoneAt,
} from '../../scripts/balance-model.mjs';

const zoneOf = (dungeon) => zoneAt(dungeon.floors[1]);
const storyZones = floorsData.zones.filter((z) => z.floors[1] <= STORY_DUNGEONS.at(-1).floors[1]);
const mewtwo = storyZones.at(-1).boss;

describe('niveles de los salvajes y de los jefes', () => {
  it('no bajan de una mazmorra de la historia a la siguiente', () => {
    for (let i = 1; i < storyZones.length; i++) {
      const [a, b] = [storyZones[i - 1], storyZones[i]];
      expect(b.levelRange[0], `${a.name} → ${b.name}`).toBeGreaterThanOrEqual(a.levelRange[0]);
      expect(b.levelRange[1], `${a.name} → ${b.name}`).toBeGreaterThanOrEqual(a.levelRange[1]);
      expect(b.boss.level, `${a.name} → ${b.name}`).toBeGreaterThan(a.boss.level);
    }
  });

  it('cada jefe está por encima de los salvajes de su zona y declara sus PS de jefe', () => {
    for (const zone of floorsData.zones.filter((z) => z.boss)) {
      expect(zone.boss.level, zone.name).toBeGreaterThan(zone.levelRange[1]);
      expect(zone.boss.hpMultiplier, zone.name).toBeGreaterThanOrEqual(1);
    }
  });

  it('el posjuego empieza cerca de Mewtwo y el jardín va por encima de los tres picos', () => {
    const [first, ...rest] = POSTGAME_DUNGEONS.map(zoneOf);
    expect(Math.abs(first.levelRange[0] - mewtwo.level)).toBeLessThanOrEqual(LIMITS.postgameStartGap);
    const peaks = [first, ...rest.slice(0, -1)];
    const garden = rest.at(-1);
    for (const peak of peaks) {
      expect(peak.boss.level, peak.name).toBeGreaterThan(mewtwo.level);
      expect(garden.levelRange[0], peak.name).toBeGreaterThan(peak.levelRange[0]);
      expect(garden.levelRange[1], peak.name).toBeGreaterThan(peak.levelRange[1]);
      expect(garden.boss.level, peak.name).toBeGreaterThan(peak.boss.level);
    }
  });

  it('el modelo usa el mismo nivel medio que las misiones (wildLevelAt)', () => {
    for (let f = 1; f <= 84; f++) expect(Math.abs(meanWildLevel(f) - wildLevelAt(f)), `piso ${f}`).toBeLessThanOrEqual(0.5);
  });
});

describe('curva de experiencia', () => {
  const [lo, hi] = LIMITS.bossLevelGap;
  let typical;
  beforeAll(() => {
    typical = storyAndPostgame(KILL_RATES.tipico);
  });

  it('el equipo típico llega a cada jefe de la historia cerca de su nivel', () => {
    for (const d of typical.story.dungeons) {
      const gap = d.atBoss - d.boss.level;
      expect(gap, `${d.name}: equipo ${d.atBoss}, ${d.boss.name} ${d.boss.level}`).toBeGreaterThanOrEqual(lo);
      expect(gap, `${d.name}: equipo ${d.atBoss}, ${d.boss.name} ${d.boss.level}`).toBeLessThanOrEqual(hi);
    }
  });

  it('al entrar en cada mazmorra de la historia, el equipo no supera a todos sus salvajes', () => {
    // Salvo en el Bosque Verde, el tutorial: el equipo sale a nivel 5 y sus salvajes son de 2 a 4
    for (const d of typical.story.dungeons.slice(1)) expect(d.entry, d.name).toBeLessThanOrEqual(d.wild[1]);
  });

  it('tras Mewtwo, el primer pico y el jardín están a la altura del equipo', () => {
    const order = anyOrderDungeons();
    const post = typical.postgame.dungeons;
    // Cualquier pico puede ser el primero: todos con el nivel de salir de la historia
    for (const d of post.filter((x) => order.has(x.dungeonId))) {
      const alone = simulateProgress([POSTGAME_DUNGEONS.find((x) => x.id === d.dungeonId)], { level: typical.story.level, xp: typical.story.xp, killRate: KILL_RATES.tipico }).dungeons[0];
      expect(alone.entry, d.name).toBeLessThanOrEqual(alone.wild[1]);
      expect(alone.atBoss - alone.boss.level, d.name).toBeGreaterThanOrEqual(lo);
      expect(alone.atBoss - alone.boss.level, d.name).toBeLessThanOrEqual(hi);
    }
    const garden = post.at(-1);
    expect(order.has(garden.dungeonId)).toBe(false);
    expect(garden.entry).toBeLessThanOrEqual(garden.wild[1]);
    expect(garden.atBoss - garden.boss.level).toBeGreaterThanOrEqual(lo);
    expect(garden.atBoss - garden.boss.level).toBeLessThanOrEqual(hi);
  });
});

describe('jefes', () => {
  let bosses;
  beforeAll(() => {
    const { story, postgame } = storyAndPostgame(KILL_RATES.tipico);
    bosses = combatTable([...story.dungeons, ...postgame.dungeons], { wilds: false })
      .filter((c) => c.boss)
      .map((c) => ({ ...c.boss, story: c.floor <= STORY_DUNGEONS.at(-1).floors[1] }));
  });

  it('ninguno cae en menos de 3 golpes del protagonista típico', () => {
    for (const b of bosses) expect(b.heroHits, b.name).toBeGreaterThanOrEqual(LIMITS.bossMinHeroHits);
  });

  it('ninguno deja KO de un golpe al protagonista típico (y en la historia, a ninguno)', () => {
    for (const b of bosses) {
      expect(b.foeHits, b.name).toBeGreaterThanOrEqual(LIMITS.bossMinFoeHits);
      if (b.story) expect(b.foeHitsWorst, `${b.name} a ${b.worstHero}`).toBeGreaterThanOrEqual(LIMITS.storyBossMinFoeHitsWorst);
    }
  });

  it('todos son una amenaza: hacen daño de verdad', () => {
    for (const b of bosses) {
      expect(b.foeHits, b.name).toBeLessThan(MAX_HITS);
      expect(b.foeHits, b.name).toBeLessThanOrEqual(LIMITS.bossMaxFoeHits);
    }
  });
});

describe('combate: ataque básico sin tipo e IA', () => {
  /** Parte de sus turnos que la IA gasta en estados, como mucho (combat.json: `status.chance`). */
  const MAX_STATUS_SHARE = 0.35;
  let combat;
  beforeAll(() => {
    const { story, postgame } = storyAndPostgame(KILL_RATES.tipico);
    combat = combatTable([...story.dungeons, ...postgame.dungeons]);
  });

  it('cada protagonista puede dañar a cada jefe: el ataque básico no tiene tipo', () => {
    for (const { boss } of combat.filter((c) => c.boss)) {
      for (const h of boss.perHero) expect(h.heroHits, `${h.name} contra ${boss.name}`).toBeLessThan(MAX_HITS);
    }
  });

  it('los salvajes de todas las zonas hacen daño al protagonista típico', () => {
    for (const c of combat) expect(c.wild.foeHits, c.zone).toBeLessThan(MAX_HITS);
  });

  it('salvajes y jefes atacan más que usan estados', () => {
    for (const c of combat) {
      expect(c.wild.foeStatusShare, c.zone).toBeLessThanOrEqual(MAX_STATUS_SHARE);
      if (c.boss) expect(c.boss.foeStatusShare, c.boss.name).toBeLessThanOrEqual(MAX_STATUS_SHARE);
    }
  });
});

describe('economía', () => {
  it('las misiones pagan y puntúan más cuanto más alto es su rango', () => {
    const ranks = missionTable();
    for (let i = 1; i < ranks.length; i++) {
      const [a, b] = [ranks[i - 1], ranks[i]];
      expect(b.points, `${a.rank} → ${b.rank}`).toBeGreaterThan(a.points);
      expect(b.mean[0], `${a.rank} → ${b.rank}`).toBeGreaterThan(a.mean[0]);
      expect(b.mean[1], `${a.rank} → ${b.rank}`).toBeGreaterThan(a.mean[1]);
      for (const type of Object.keys(a.money)) expect(b.money[type][0], `${type} ${b.rank}`).toBeGreaterThan(a.money[type][1] - 1);
    }
  });

  it('nada de la tienda se vende por lo que cuesta, ni cuesta menos que algo peor de su tipo', () => {
    const shop = shopTable();
    for (const s of shop) expect(s.sell, s.name).toBeLessThan(s.buy);
    expect(priceInversions(shop).map(({ better, worse }) => `${better.name} ≤ ${worse.name}`)).toEqual([]);
  });
});

describe('viento', () => {
  it('los avisos van en orden y antes del límite', () => {
    const warnings = [...WIND.warnings];
    expect(warnings).toEqual([...warnings].sort((a, b) => a - b));
    expect(warnings.at(-1)).toBeLessThan(WIND.limit);
  });

  it('da margen para recorrer el piso entero', () => {
    for (const w of windTable(1)) {
      expect(WIND.limit, w.name).toBeGreaterThanOrEqual(LIMITS.windMargin * w.fullMax);
      expect(WIND.warnings[0], w.name).toBeGreaterThan(w.fullMax);
    }
  });
});
