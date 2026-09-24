import { describe, it, expect } from 'vitest';
import { parseSave, migrateSave, SAVE_VERSION, MIGRATED_TEAM_NAME } from '../../src/core/SaveManager.js';

/** Partida mínima con el formato de la versión 1 (antes de runSeed). */
function saveV1(overrides = {}) {
  return {
    version: 1,
    timestamp: 1,
    seed: 654321,
    coins: 80,
    currentFloor: 12,
    party: [
      { speciesId: 1, name: 'Bulbasaur', level: 14, isLeader: true, hp: 30, maxHp: 40 },
      { speciesId: 16, name: 'Pidgey', level: 11, isLeader: false, hp: 0, maxHp: 30 },
    ],
    inventory: [{ itemId: 'apple', quantity: 2 }],
    stats: { turnsPlayed: 300 },
    pokedex: [1, 16, 19],
    ...overrides,
  };
}

/** La misma partida en formato v2. */
function saveV2(overrides = {}) {
  const { seed, ...rest } = saveV1();
  return { ...rest, version: 2, runSeed: seed, ...overrides };
}

describe('migrateSave', () => {
  it('lleva una partida v1 hasta la versión actual', () => {
    expect(migrateSave(saveV1()).version).toBe(SAVE_VERSION);
  });

  it('v2 → v3: la carrera se convierte en un perfil con el mismo equipo, mochila y dinero', () => {
    const v3 = migrateSave(saveV2());
    expect(v3.run).toBeNull();
    expect(v3.bag).toEqual([{ itemId: 'apple', quantity: 2 }]);
    expect(v3.wallet).toBe(80);
    const { profile } = v3;
    expect(profile.teamName).toBe(MIGRATED_TEAM_NAME);
    expect(profile.roster.map((p) => p.name)).toEqual(['Bulbasaur', 'Pidgey']);
    expect(new Set(profile.roster.map((p) => p.uid)).size).toBe(2);
    expect(profile.roster.every((p) => p.isLeader === false)).toBe(true);
    expect(profile.heroUid).toBe(profile.roster[0].uid);
    expect(profile.partnerUid).toBe(profile.roster[1].uid);
    expect(profile.teamUids).toEqual([profile.heroUid, profile.partnerUid]);
    expect(profile.pokedexSeen).toEqual([1, 16, 19]);
    expect(profile.stats).toEqual({ turnsPlayed: 300 });
    expect(profile.flags.migratedFromRun).toBe(true);
  });

  it('v2 → v3: las mazmorras ya atravesadas quedan completadas', () => {
    // Piso global 12: Bosque Verde (1-5) y Cueva Oscura (6-10) superados
    expect(migrateSave(saveV2()).profile.clearedDungeons).toEqual(['bosque_verde', 'cueva_oscura']);
    expect(migrateSave(saveV2({ currentFloor: 3 })).profile.clearedDungeons).toEqual([]);
  });

  it('v2 → v3: el líder pasa a ser el protagonista aunque no fuera el primero', () => {
    const party = [
      { name: 'Pidgey', isLeader: false },
      { name: 'Bulbasaur', isLeader: true },
    ];
    const { profile } = migrateSave(saveV2({ party }));
    const hero = profile.roster.find((p) => p.uid === profile.heroUid);
    expect(hero.name).toBe('Bulbasaur');
    expect(profile.teamUids[0]).toBe(profile.heroUid);
  });

  it('no modifica los datos de entrada', () => {
    const original = saveV1();
    migrateSave(original);
    expect(original).toEqual(saveV1());
    const v3 = saveV3();
    migrateSave(v3);
    expect(v3).toEqual(saveV3());
  });
});

/** Partida v3 con Poké Balls en la mochila, el almacén y el piso en curso. */
function saveV3(overrides = {}) {
  return {
    version: 3,
    timestamp: 1,
    profile: {
      teamName: 'Equipo Aurora',
      roster: [{ uid: 1, name: 'Pikachu' }],
      heroUid: 1,
      bank: 10,
      storage: [{ itemId: 'great_ball', quantity: 2 }, { itemId: 'potion', quantity: 1 }],
      flags: {},
      stash: null,
    },
    bag: [{ itemId: 'pokeball', quantity: 3 }, { itemId: 'apple', quantity: 1 }],
    wallet: 5,
    run: {
      dungeonId: 'bosque_verde',
      floorItems: [{ itemId: 'ultra_ball', quantity: 1, x: 1, y: 1 }, { itemId: 'apple', quantity: 1, x: 2, y: 2 }],
      floorMerchants: [{ x: 3, y: 3, items: [{ id: 'pokeball', price: 30 }, { id: 'potion', price: 40 }] }],
    },
    ...overrides,
  };
}

describe('v3 → v4: sin Poké Balls', () => {
  it('las de la mochila pasan a la cartera y las del almacén, al banco', () => {
    const v4 = migrateSave(saveV3());
    expect(v4.version).toBe(SAVE_VERSION);
    expect(v4.bag).toEqual([{ itemId: 'apple', quantity: 1 }]);
    expect(v4.wallet).toBe(5 + 3 * 48);
    expect(v4.profile.storage).toEqual([{ itemId: 'potion', quantity: 1 }]);
    expect(v4.profile.bank).toBe(10 + 2 * 120);
    expect(v4.profile.flags.ballRefund).toBe(3 * 48 + 2 * 120);
  });

  it('las del suelo y la tienda del piso en curso desaparecen', () => {
    const { run } = migrateSave(saveV3());
    expect(run.floorItems).toEqual([{ itemId: 'apple', quantity: 1, x: 2, y: 2 }]);
    expect(run.floorMerchants[0].items).toEqual([{ id: 'potion', price: 40 }]);
  });

  it('en la Torre, las de la mochila que espera en el pueblo van a su cartera', () => {
    const base = saveV3();
    const v4 = migrateSave(saveV3({ profile: { ...base.profile, stash: { bag: [{ itemId: 'pokeball', quantity: 1 }], wallet: 7 } } }));
    expect(v4.profile.stash).toEqual({ bag: [], wallet: 7 + 48 });
  });

  it('sin Poké Balls no hay nada que avisar', () => {
    const base = saveV3();
    const v4 = migrateSave(saveV3({ bag: [], profile: { ...base.profile, storage: [] }, run: null }));
    expect(v4.profile.flags).toEqual({});
    expect(v4.wallet).toBe(5);
    expect(v4.profile.bank).toBe(10);
  });
});

/** Partida v4 (antes de la historia) con dos mazmorras completadas. */
function saveV4(overrides = {}) {
  return {
    version: 4,
    timestamp: 1,
    profile: {
      teamName: 'Equipo Aurora',
      roster: [{ uid: 1, name: 'Pikachu' }],
      heroUid: 1,
      clearedDungeons: ['bosque_verde', 'cueva_oscura'],
      flags: {},
      stash: null,
    },
    bag: [],
    wallet: 0,
    run: null,
    ...overrides,
  };
}

describe('v4 → v5: la historia', () => {
  it('sigue desde su capítulo: prólogo y capítulos superados cuentan como vistos', () => {
    const v5 = migrateSave(saveV4());
    expect(v5.version).toBe(5);
    const { seen } = v5.profile.story;
    for (const id of ['P-1', 'P-3', '1-B', '1-E', '2-D', '2-E']) expect(seen).toContain(id);
    // El capítulo 3 queda por jugar, con su sobre
    expect(seen).not.toContain('3-A');
    expect(seen).not.toContain('3-C');
  });

  it('sin mazmorras completadas solo se salta el prólogo', () => {
    const base = saveV4();
    const v5 = migrateSave(saveV4({ profile: { ...base.profile, clearedDungeons: undefined } }));
    expect(v5.profile.story).toEqual({ seen: ['P-1', 'P-2', 'P-3'] });
  });

  it('conserva lo demás y no modifica los datos de entrada', () => {
    const original = saveV4();
    const v5 = migrateSave(original);
    expect(original).toEqual(saveV4());
    expect(v5.profile.teamName).toBe('Equipo Aurora');
    expect(v5.profile.clearedDungeons).toEqual(['bosque_verde', 'cueva_oscura']);
  });
});

describe('parseSave', () => {
  it('sin partida devuelve none', () => {
    expect(parseSave(null)).toEqual({ status: 'none' });
    expect(parseSave('')).toEqual({ status: 'none' });
  });

  it('una partida antigua se migra y dice desde qué versión', () => {
    const result = parseSave(JSON.stringify(saveV1()));
    expect(result.status).toBe('ok');
    expect(result.migratedFrom).toBe(1);
    expect(result.data.version).toBe(SAVE_VERSION);
  });

  it('una partida actual se lee sin migrar', () => {
    const current = migrateSave(saveV2());
    const result = parseSave(JSON.stringify(current));
    expect(result).toEqual({ status: 'ok', data: current, migratedFrom: null });
  });

  it('una partida de una versión más nueva no se toca', () => {
    expect(parseSave(JSON.stringify(saveV1({ version: SAVE_VERSION + 1 })))).toEqual({
      status: 'newer',
      version: SAVE_VERSION + 1,
    });
  });

  it.each([
    ['JSON roto', '{no es json'],
    ['sin versión', JSON.stringify({ party: [{}] })],
    ['equipo vacío', JSON.stringify(saveV1({ party: [] }))],
    ['versión desconocida', JSON.stringify(saveV1({ version: 0 }))],
    ['v3 sin perfil', JSON.stringify({ version: 3, bag: [], wallet: 0, run: null })],
  ])('%s es corrupt', (_, raw) => {
    expect(parseSave(raw)).toEqual({ status: 'corrupt' });
  });
});
