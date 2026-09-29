import { describe, it, expect } from 'vitest';
import {
  generateBoard,
  rewardMoney,
  rewardPoints,
  difficultyFor,
  wildLevelAt,
  outlawLevel,
  escortGuestLevel,
  escortsToJoin,
  escortArrivals,
  missionGlobalFloor,
  missionLevelBonus,
  markMissionDone,
  revertDoneMissions,
  claimRewards,
  describeMission,
  acceptedText,
  MISSION_RULES,
  MISSION_TYPE_NAMES,
  DIFFICULTIES,
} from '../../src/core/Missions.js';
import { guestRefusesItem } from '../../src/systems/MissionSystem.js';
import { createProfile } from '../../src/core/Profile.js';
import { getDungeon, floorCount, DUNGEONS, LEVEL_SCALING } from '../../src/core/Dungeons.js';
import floorsData from '../../src/data/floors.json';
import pokemonData from '../../src/data/pokemon.json';
import itemsData from '../../src/data/items.json';

const ALL_STORY = DUNGEONS.filter((d) => !d.challenge).map((d) => d.id);
const itemName = (id) => itemsData.find((i) => i.id === id)?.name ?? id;

/** Tablones de muchos días seguidos. */
function boards(days = 60, clearedDungeons = ALL_STORY) {
  const all = [];
  for (let day = 1; day <= days; day++) all.push(...generateBoard({ day, clearedDungeons, pokemonData }));
  return all;
}

/**
 * @param {Partial<import('../../src/core/Missions.js').Mission>} m
 * @returns {import('../../src/core/Missions.js').Mission}
 */
function mission(m) {
  return {
    id: 'm',
    type: 'escort',
    dungeonId: 'bosque_verde',
    floor: 3,
    clientSpeciesId: 43,
    clientName: 'Oddish',
    itemId: null,
    difficulty: 'E',
    reward: { money: 100, itemId: null, rankPoints: 12 },
    status: 'accepted',
    ...m,
  };
}

function newProfile() {
  return createProfile({ teamName: 'Test', hero: { name: 'Pikachu' }, partner: { name: 'Squirtle' } });
}

describe('tablón con escoltas y forajidos', () => {
  it('salen todos los tipos, con la mezcla de missions.json', () => {
    const all = boards(200);
    const count = (type) => all.filter((m) => m.type === type).length;
    const weights = MISSION_RULES.types;
    const total = Object.values(weights).reduce((s, t) => s + t.weight, 0);
    for (const type of Object.keys(weights)) {
      expect(MISSION_TYPE_NAMES[type], type).toBeTruthy();
      // Cerca del peso que le toca (±40 %)
      const expected = (all.length * weights[type].weight) / total;
      expect(count(type), type).toBeGreaterThan(expected * 0.6);
      expect(count(type), type).toBeLessThan(expected * 1.4);
    }
  });

  it('es determinista también con los tipos nuevos', () => {
    const a = boards(20);
    expect(boards(20)).toEqual(a);
    expect(a.some((m) => m.type === 'escort') && a.some((m) => m.type === 'outlaw')).toBe(true);
  });

  it('una escolta nunca va al piso 1 ni al del jefe; lleva su motivo y el forajido su delito', () => {
    for (const m of boards(120)) {
      const dungeon = getDungeon(m.dungeonId);
      const bossAtEnd = floorsData.zones.some((z) => z.boss && z.floors[1] === dungeon.floors[1]);
      expect(m.floor).toBeLessThanOrEqual(floorCount(dungeon) - (bossAtEnd ? 1 : 0));
      if (m.type === 'escort') {
        expect(m.floor).toBeGreaterThanOrEqual(MISSION_RULES.escort.minFloor);
        expect(MISSION_RULES.escort.reasons).toContain(m.reason);
      } else {
        expect(m.reason).toBeUndefined();
      }
      if (m.type === 'outlaw') expect(MISSION_RULES.outlaw.crimes).toContain(m.crime);
      else expect(m.crime).toBeUndefined();
      if (m.type === 'escort' || m.type === 'outlaw') expect(m.itemId).toBeNull();
    }
  });

  it('los textos de escolta y forajido no dan género al equipo', () => {
    const texts = [...MISSION_RULES.escort.reasons, ...MISSION_RULES.outlaw.crimes];
    for (const text of texts) {
      expect(text, text).not.toMatch(/vosotr|juntos|juntas|bienvenid/i);
      expect(text.length, text).toBeLessThan(110);
    }
  });
});

describe('recompensas', () => {
  it('rescate, búsqueda y entrega pagan lo mismo que antes', () => {
    for (let f = 1; f <= 50; f++) {
      expect(rewardMoney('rescue', f)).toBe(Math.round((80 + f * 25) / 10) * 10);
      expect(rewardMoney('find_item', f)).toBe(Math.round((80 + f * 25 + 40) / 10) * 10);
      expect(rewardMoney('deliver', f)).toBe(rewardMoney('find_item', f));
    }
  });

  it('el forajido paga más dinero y más puntos que un rescate de la misma dificultad', () => {
    for (let f = 1; f <= 50; f++) {
      expect(rewardMoney('outlaw', f)).toBeGreaterThan(rewardMoney('rescue', f));
      expect(rewardMoney('escort', f)).toBeGreaterThan(rewardMoney('rescue', f));
    }
    for (const d of DIFFICULTIES) {
      expect(rewardPoints('outlaw', d)).toBeGreaterThan(rewardPoints('rescue', d));
      expect(rewardPoints('rescue', d)).toBe(d.points);
    }
    for (const m of boards(60)) {
      expect(m.reward.money).toBe(rewardMoney(m.type, missionGlobalFloor(m)));
      expect(m.reward.rankPoints).toBe(rewardPoints(m.type, difficultyFor(missionGlobalFloor(m))));
    }
  });

  it('las escoltas y los forajidos se cobran como las demás', () => {
    const profile = newProfile();
    profile.missions.accepted = [
      mission({ id: 'e', status: 'done', reward: { money: 220, itemId: 'ether', rankPoints: 12 } }),
      mission({ id: 'o', type: 'outlaw', clientName: 'Zubat', status: 'done', reward: { money: 320, itemId: null, rankPoints: 15 } }),
    ];
    const bag = [];
    const result = claimRewards(profile, { bag, wallet: 0, maxSlots: 24, itemName });
    expect(result).toMatchObject({ wallet: 540, rankPoints: 27 });
    expect(result.lines).toEqual(['Misión de Oddish: +220 Poké y Éter.', 'Misión de Zubat: +320 Poké.']);
    expect(profile.missions.accepted).toEqual([]);
  });
});

describe('forajido', () => {
  it('es más fuerte que cualquier salvaje de su piso', () => {
    for (let f = 1; f <= 50; f++) {
      const zone = floorsData.zones.find((z) => f >= z.floors[0] && f <= z.floors[1]);
      // FloorManager: nivel medio del piso ±1, dentro del rango de la zona
      const strongestWild = Math.min(zone.levelRange[1], wildLevelAt(f) + 1);
      expect(outlawLevel(f), `piso ${f}`).toBeGreaterThan(strongestWild);
    }
    expect(MISSION_RULES.outlaw.hpMultiplier).toBeGreaterThan(1);
  });

  it('el nivel medio de un piso sale de su zona', () => {
    expect(wildLevelAt(1)).toBe(2);
    expect(wildLevelAt(5)).toBe(4);
    expect(wildLevelAt(6)).toBe(5);
  });
});

describe('misiones ★ en los picos que suben de nivel', () => {
  const [, second, third] = LEVEL_SCALING[0].levels;
  const STORY_ONLY = DUNGEONS.filter((d) => !d.challenge && !d.postgame).map((d) => d.id);
  const outlaw = mission({ type: 'outlaw', dungeonId: 'pico_tronador', floor: 3 });
  const escort = mission({ type: 'escort', dungeonId: 'caldera_ascua', floor: 4 });

  it('forajidos y clientes de escolta suben lo mismo que los salvajes de su pico', () => {
    for (const m of [outlaw, escort]) {
      const f = missionGlobalFloor(m);
      expect(wildLevelAt(f, third)).toBe(wildLevelAt(f) + third);
      expect(outlawLevel(f, third)).toBe(outlawLevel(f) + third);
      expect(escortGuestLevel(f, third)).toBe(escortGuestLevel(f) + third);
    }
  });

  it('cuentan los picos completados cuando se va, no cuando se aceptó', () => {
    expect(missionLevelBonus(outlaw, STORY_ONLY)).toBe(0);
    expect(missionLevelBonus(outlaw, [...STORY_ONLY, 'caldera_ascua'])).toBe(second);
    expect(missionLevelBonus(outlaw, [...STORY_ONLY, 'caldera_ascua', 'cumbre_escarcha'])).toBe(third);
    // Fuera de los picos, nada
    expect(missionLevelBonus(mission({ dungeonId: 'cueva_oscura' }), ['cumbre_escarcha', 'pico_tronador', 'caldera_ascua'])).toBe(0);
    expect(missionLevelBonus(mission({ dungeonId: 'jardin_primer_sueno' }), ['cumbre_escarcha', 'pico_tronador', 'caldera_ascua'])).toBe(0);
  });
});

describe('escolta', () => {
  it('el invitado tiene el nivel de los salvajes del piso al que va', () => {
    for (let f = 1; f <= 50; f++) expect(escortGuestLevel(f)).toBe(Math.max(1, wildLevelAt(f) + MISSION_RULES.escort.levelOffset));
    expect(missionGlobalFloor(mission({ dungeonId: 'cueva_oscura', floor: 2 }))).toBe(7);
  });

  it('se unen los que caben, primero los de pisos más cercanos; el resto espera', () => {
    const profile = newProfile();
    profile.missions.accepted = [
      mission({ id: 'lejos', floor: 4 }),
      mission({ id: 'cerca', floor: 2 }),
      mission({ id: 'medio', floor: 3 }),
      mission({ id: 'otra-mazmorra', dungeonId: 'cueva_oscura' }),
      mission({ id: 'rescate', type: 'rescue' }),
      mission({ id: 'hecha', status: 'done' }),
      mission({ id: 'historia', story: true }),
    ];
    const bosque = getDungeon('bosque_verde');
    const ids = ({ joining, waiting }) => ({ joining: joining.map((m) => m.id), waiting: waiting.map((m) => m.id) });

    expect(ids(escortsToJoin(profile, bosque, 2))).toEqual({ joining: ['cerca', 'medio'], waiting: ['lejos'] });
    // Equipo completo: nadie cabe
    expect(ids(escortsToJoin(profile, bosque, 0))).toEqual({ joining: [], waiting: ['cerca', 'medio', 'lejos'] });
    expect(ids(escortsToJoin(profile, bosque, -1)).joining).toEqual([]);
    // En la Torre del Desafío no hay invitados
    expect(ids(escortsToJoin(profile, getDungeon('torre_desafio'), 3))).toEqual({ joining: [], waiting: [] });
  });

  it('se cumple al llegar a su piso con el cliente en pie', () => {
    const profile = newProfile();
    profile.missions.accepted = [mission({ id: 'a', floor: 3 }), mission({ id: 'b', floor: 4 }), mission({ id: 'c', type: 'rescue', floor: 3 })];
    expect(escortArrivals(profile, 'bosque_verde', 2, ['a', 'b'])).toEqual([]);
    expect(escortArrivals(profile, 'bosque_verde', 3, ['a', 'b']).map((m) => m.id)).toEqual(['a']);
    // Si el cliente cayó, ya no va con el equipo: no se cumple
    expect(escortArrivals(profile, 'bosque_verde', 3, ['b'])).toEqual([]);
    expect(escortArrivals(profile, 'cueva_oscura', 3, ['a'])).toEqual([]);
  });

  it('si falla, sigue aceptada para otra expedición; si cae el equipo tras cumplirla, vuelve a pendiente', () => {
    const profile = newProfile();
    profile.missions.accepted = [mission({ id: 'a', floor: 3 })];
    const bosque = getDungeon('bosque_verde');
    // El cliente cayó (no llega): la misión no cambia y vuelve a unirse la próxima vez
    expect(escortArrivals(profile, 'bosque_verde', 3, [])).toEqual([]);
    expect(escortsToJoin(profile, bosque, 2).joining.map((m) => m.id)).toEqual(['a']);
    // Cumplida y el equipo cae antes de volver: pendiente otra vez
    markMissionDone(profile, 'a');
    expect(escortsToJoin(profile, bosque, 2).joining).toEqual([]);
    expect(revertDoneMissions(profile)).toBe(1);
    expect(escortsToJoin(profile, bosque, 2).joining.map((m) => m.id)).toEqual(['a']);
  });

  it('al invitado no se le da lo que le cambiaría para siempre', () => {
    const guests = new Set([7]);
    const game = { entityManager: { hasComponent: (id, name) => name === 'missionGuest' && guests.has(id) }, itemsData };
    for (const itemId of ['power_band', 'fire_stone', 'rare_candy', 'red_gummi']) expect(guestRefusesItem(game, 7, itemId), itemId).toBe(true);
    for (const itemId of ['oran_berry', 'potion', 'apple', 'antidote', 'ether']) expect(guestRefusesItem(game, 7, itemId), itemId).toBe(false);
    // A los del equipo, todo
    expect(guestRefusesItem(game, 1, 'power_band')).toBe(false);
  });
});

describe('textos', () => {
  it('el tablón explica la escolta y el forajido', () => {
    const escort = mission({ reason: MISSION_RULES.escort.reasons[0] });
    const text = describeMission(escort, { dungeonName: 'Bosque Verde', itemName });
    expect(text).toContain('Oddish quiere llegar a Bosque Verde, piso 3.');
    expect(text).toContain(MISSION_RULES.escort.reasons[0]);
    expect(text).toContain('hueco en el equipo');

    const outlaw = mission({ type: 'outlaw', clientName: 'Zubat', crime: MISSION_RULES.outlaw.crimes[0] });
    const wanted = describeMission(outlaw, { dungeonName: 'Cueva Oscura', itemName });
    expect(wanted).toContain('SE BUSCA: Zubat, visto en Cueva Oscura, piso 3.');
    expect(wanted).toContain(MISSION_RULES.outlaw.crimes[0]);
  });

  it('al aceptar se dice dónde espera cada uno', () => {
    expect(acceptedText(mission({}), 'Bosque Verde')).toBe('Misión aceptada: Oddish espera en la entrada de Bosque Verde para llegar al piso 3.');
    expect(acceptedText(mission({ type: 'outlaw', clientName: 'Zubat' }), 'Bosque Verde')).toBe('Misión aceptada: Zubat anda suelto por Bosque Verde, piso 3.');
    expect(acceptedText(mission({ type: 'rescue' }), 'Bosque Verde')).toBe('Misión aceptada: Oddish os espera en Bosque Verde, piso 3.');
  });
});
