/**
 * Tests de la curva de equilibrio: fallan si un cambio en los datos
 * (floors.json, missions.json, items.json, dungeons.json…) rompe la progresión
 * sin querer. Los números salen de scripts/balance-model.mjs, el mismo modelo
 * que imprime `npm run balance`; los umbrales, de `LIMITS`.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import floorsData from '../../src/data/floors.json';
import { WIND, LEVEL_SCALING, scaledZone } from '../../src/core/Dungeons.js';
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
  orderSummary,
  postgameOrders,
  priceInversions,
  recruitTable,
  shopTable,
  spendingTable,
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

  it('el posjuego empieza cerca de Mewtwo y el jardín va por encima de los tres picos, aun del último que se haga', () => {
    const [first, ...rest] = POSTGAME_DUNGEONS.map(zoneOf);
    expect(Math.abs(first.levelRange[0] - mewtwo.level)).toBeLessThanOrEqual(LIMITS.postgameStartGap);
    const top = Math.max(...LEVEL_SCALING.flatMap((g) => g.levels));
    const peaks = [first, ...rest.slice(0, -1)].map((z) => scaledZone(z, top));
    const garden = rest.at(-1);
    for (const peak of peaks) {
      expect(peak.boss.level - top, peak.name).toBeGreaterThan(mewtwo.level);
      expect(garden.levelRange[0], peak.name).toBeGreaterThan(peak.levelRange[0]);
      expect(garden.levelRange[1], peak.name).toBeGreaterThan(peak.levelRange[1]);
      expect(garden.boss.level, peak.name).toBeGreaterThan(peak.boss.level);
    }
  });

  it('el modelo usa el mismo nivel medio que las misiones (wildLevelAt), también en los picos que suben', () => {
    for (let f = 1; f <= 84; f++) expect(Math.abs(meanWildLevel(f) - wildLevelAt(f)), `piso ${f}`).toBeLessThanOrEqual(0.5);
    for (const g of LEVEL_SCALING) {
      for (const d of g.dungeons.map((id) => POSTGAME_DUNGEONS.find((x) => x.id === id))) {
        for (const bonus of g.levels) {
          for (let f = d.floors[0]; f <= d.floors[1]; f++) {
            expect(Math.abs(meanWildLevel(f, bonus) - wildLevelAt(f, bonus)), `${d.id} piso ${f} +${bonus}`).toBeLessThanOrEqual(0.5);
          }
        }
      }
    }
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

  it('ningún pico, hecho en cualquier orden, se entra por encima de sus salvajes, y su jefe está a la altura', () => {
    const free = anyOrderDungeons();
    const orders = postgameOrders(KILL_RATES.tipico);
    expect(orders).toHaveLength(6); // Los tres picos, en los seis órdenes posibles
    const summary = orderSummary(orders);
    const peaks = summary.filter((o) => free.has(o.dungeonId));
    expect(peaks).toHaveLength(9); // Cada pico en cada puesto
    for (const o of peaks) {
      const where = `${o.name} en ${o.position + 1}.º lugar (+${o.bonus})`;
      expect(o.entry[1], where).toBeLessThanOrEqual(o.wild[1] + LIMITS.peakEntryOverWild);
      expect(o.gap[0], where).toBeGreaterThanOrEqual(lo);
      expect(o.gap[1], where).toBeLessThanOrEqual(hi);
    }
    // Y después, el jardín, sin subir
    const [garden] = summary.filter((o) => !free.has(o.dungeonId));
    expect(garden).toMatchObject({ dungeonId: POSTGAME_DUNGEONS.at(-1).id, position: 3, bonus: 0 });
    expect(garden.entry[1]).toBeLessThanOrEqual(garden.wild[1]);
    expect(garden.gap[0]).toBeGreaterThanOrEqual(lo);
    expect(garden.gap[1]).toBeLessThanOrEqual(hi);
  });

  it('en el orden del menú, la simulación sube los picos como el juego', () => {
    const peaks = typical.postgame.dungeons.filter((d) => anyOrderDungeons().has(d.dungeonId));
    expect(peaks.map((d) => d.bonus)).toEqual(LEVEL_SCALING[0].levels);
    for (const d of peaks) expect(d.boss.level, d.name).toBe(zoneOf(d).boss.level + d.bonus);
  });
});

describe('jefes', () => {
  let bosses;
  beforeAll(() => {
    const { story, postgame } = storyAndPostgame(KILL_RATES.tipico);
    const lastStory = STORY_DUNGEONS.at(-1).floors[1];
    bosses = combatTable([...story.dungeons, ...postgame.dungeons], { wilds: false })
      .filter((c) => c.boss)
      .map((c) => ({ ...c.boss, story: c.floor <= lastStory }));
    // Los jefes de los picos, también en los otros órdenes (suben con cada pico hecho)
    const free = anyOrderDungeons();
    for (const { order, dungeons } of postgameOrders(KILL_RATES.tipico)) {
      for (const c of combatTable([...story.dungeons, ...dungeons], { wilds: false })) {
        const d = dungeons.find((x) => c.floor >= x.floors[0] && c.floor <= x.floors[1]);
        if (!c.boss || !d || !free.has(d.dungeonId)) continue;
        bosses.push({ ...c.boss, name: `${c.boss.name} (${order.indexOf(d.dungeonId) + 1}.º, +${c.bonus})`, story: false });
      }
    }
  });

  it('los de los picos se miran en cada uno de los seis órdenes', () => {
    expect(bosses.filter((b) => b.name.includes('.º'))).toHaveLength(3 * 6);
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

  describe('en qué gastar el dinero', () => {
    let spending;
    beforeAll(() => {
      spending = spendingTable(KILL_RATES.tipico);
    });

    it('en cada tramo hay algo útil que comprar a un precio alcanzable con lo que se gana', () => {
      expect(spending.map((s) => s.name)).toEqual([...STORY_DUNGEONS, ...POSTGAME_DUNGEONS].map((d) => d.name));
      for (const s of spending) {
        const label = `${s.name}: se ganan ${Math.round(s.income)}, lo más caro es ${s.best?.name} (${s.best?.price})`;
        expect(s.best, s.name).not.toBeNull();
        expect(s.best.price, label).toBeLessThanOrEqual(s.income);
        expect(s.best.price, label).toBeGreaterThanOrEqual(LIMITS.shopSinkShare * s.income);
      }
    });

    it('lo que trae cada surtido de rango se paga con pocas expediciones del tramo en que se abre', () => {
      const opened = spending.flatMap((s) => s.newTiers.map((t) => ({ ...t, where: s.name, income: s.income })));
      // Todos menos el último (tras el jardín, el final del posjuego) se abren durante la partida
      expect(opened.map((t) => t.id)).toEqual(['bronce', 'plata', 'oro']);
      for (const t of opened) {
        expect(t.items.length, t.name).toBeGreaterThan(0);
        for (const item of t.items) expect(item.price, `${t.name} en ${t.where}: ${item.name}`).toBeLessThanOrEqual(LIMITS.shopMaxExpeditions * t.income);
      }
    });

    it('desde la mitad de la historia hay compras de más de 600 Poké, el tope de antes', () => {
      // La mazmorra del piso de en medio de la historia (el 25 de 50)
      const half = STORY_DUNGEONS.at(-1).floors[1] / 2;
      const mid = spending.findIndex((s) => s.dungeonId === STORY_DUNGEONS.find((d) => d.floors[1] >= half).id);
      for (const s of spending.slice(mid)) expect(Math.max(...s.offers.map((o) => o.price)), s.name).toBeGreaterThan(600);
    });

    it('las mochilas se pueden pagar ahorrando antes del final de la historia', () => {
      const last = spending.findIndex((s) => s.dungeonId === STORY_DUNGEONS.at(-1).id);
      expect(spending[last].bagSlots).toBeGreaterThan(spending[0].bagSlots);
      expect(spending.slice(0, last + 1).flatMap((s) => s.bought)).toHaveLength(2);
    });
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

describe('reclutamiento', () => {
  it('un recluta sube su primer nivel al ritmo de un miembro del equipo: llega con la experiencia de su nivel', () => {
    const { story, postgame } = storyAndPostgame(KILL_RATES.tipico);
    for (const r of recruitTable([...story.dungeons, ...postgame.dungeons], KILL_RATES.tipico)) {
      expect(r.killsToLevelUp.recruit, r.name).toBeLessThanOrEqual(LIMITS.recruitSlowdown * r.killsToLevelUp.member);
    }
  });
});
