import { describe, it, expect } from 'vitest';
import { parseSave, migrateSave, SAVE_VERSION, MIGRATED_TEAM_NAME } from '../../src/core/SaveManager.js';
import { profileDungeons } from '../../src/core/Profile.js';
import { scenesFor, storyChapter, STORY } from '../../src/core/Story.js';

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
    expect(v5.version).toBe(SAVE_VERSION);
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

  it('quien había terminado la historia llega con los picos del posjuego abiertos y su escena por ver', () => {
    const base = saveV4();
    const v5 = migrateSave(saveV4({ profile: { ...base.profile, clearedDungeons: [...STORY.chapters] } }));
    const { seen } = v5.profile.story;
    expect(seen).toContain('F-3');
    expect(seen.filter((id) => id.startsWith('L'))).toEqual([]);
    const postgame = profileDungeons(v5.profile).filter((d) => d.postgame).map((d) => d.id);
    expect(postgame).toEqual(['cumbre_escarcha', 'pico_tronador', 'caldera_ascua']);
    // Pidgeotto se lo cuenta en cuanto pasa algo en el pueblo
    const state = { seen, chapter: storyChapter(v5.profile.clearedDungeons) };
    expect(scenesFor('board_open', {}, state).map((s) => s.id)).toEqual(['L-0']);
  });

  it('conserva lo demás y no modifica los datos de entrada', () => {
    const original = saveV4();
    const v5 = migrateSave(original);
    expect(original).toEqual(saveV4());
    expect(v5.profile.teamName).toBe('Equipo Aurora');
    expect(v5.profile.clearedDungeons).toEqual(['bosque_verde', 'cueva_oscura']);
  });
});

/**
 * Partida v5 con movimientos con `enabled: false`: reservas para la IA (sin
 * `_disableTurns`) y una Anulación en curso, en la plantilla y en la
 * expedición en curso.
 */
function saveV5(overrides = {}) {
  const moves = (...list) =>
    list.map((entry) => entry && { moveId: entry[0], currentPP: 10, maxPP: 20, enabled: true, ...entry[1] });
  return {
    version: 5,
    timestamp: 1,
    profile: {
      teamName: 'Equipo Aurora',
      roster: [
        { uid: 1, name: 'Charmander', currentMoves: moves([10], [52, { enabled: false }]) },
        { uid: 2, name: 'Squirtle', currentMoves: moves([33]) },
        { uid: 3, name: 'Pidgey' },
      ],
      heroUid: 1,
      clearedDungeons: [],
      story: { seen: ['P-1'] },
      flags: {},
      stash: null,
    },
    bag: [],
    wallet: 0,
    run: {
      dungeonId: 'bosque_verde',
      party: [
        { uid: 1, isLeader: true, currentMoves: moves([10, { enabled: false }], [52, { enabled: false, _disableTurns: 3 }]) },
        { uid: 2, currentMoves: moves([33, { enabled: false }], [55], null) },
      ],
      guests: [{ name: 'Caterpie', missionId: 'm1', currentMoves: moves([33, { enabled: false }]) }],
    },
    ...overrides,
  };
}

describe('v5 → v6: la reserva para la IA se separa de Anulación', () => {
  it('un movimiento con enabled: false sin turnos de Anulación era una reserva', () => {
    const v6 = migrateSave(saveV5());
    expect(v6.version).toBe(6);
    // En la plantilla (fuera de combate)
    const [charmander, squirtle] = v6.profile.roster;
    expect(charmander.currentMoves[1]).toEqual({ moveId: 52, currentPP: 10, maxPP: 20, enabled: true, reserved: true });
    expect(charmander.currentMoves[0]).not.toHaveProperty('reserved');
    expect(squirtle.currentMoves).toEqual(saveV5().profile.roster[1].currentMoves);
    // En la expedición en curso: el líder también, y los invitados
    const [leader, partner] = v6.run.party;
    expect(leader.currentMoves[0]).toMatchObject({ moveId: 10, enabled: true, reserved: true });
    expect(partner.currentMoves[0]).toMatchObject({ moveId: 33, enabled: true, reserved: true });
    expect(v6.run.guests[0].currentMoves[0]).toMatchObject({ enabled: true, reserved: true });
  });

  it('una Anulación en curso sigue siendo Anulación', () => {
    const [leader] = migrateSave(saveV5()).run.party;
    expect(leader.currentMoves[1]).toEqual({ moveId: 52, currentPP: 10, maxPP: 20, enabled: false, _disableTurns: 3 });
  });

  it('conserva lo demás (casillas vacías, fichas sin movimientos, sin expedición ni invitados) y no modifica la entrada', () => {
    const original = saveV5();
    const v6 = migrateSave(original);
    expect(original).toEqual(saveV5());
    expect(v6.profile.roster[2]).toEqual({ uid: 3, name: 'Pidgey' });
    expect(v6.run.party[1].currentMoves[2]).toBeNull();
    expect(v6.run.dungeonId).toBe('bosque_verde');
    expect(v6.profile.story).toEqual({ seen: ['P-1'] });

    const base = saveV5();
    const inTown = migrateSave(saveV5({ run: null }));
    expect(inTown.run).toBeNull();
    const noGuests = migrateSave(saveV5({ run: { ...base.run, guests: undefined } }));
    expect(noGuests.run.guests).toBeUndefined();
  });

  it('parseSave la migra y dice que venía de la v5 (loadGame guarda la copia de la original)', () => {
    const result = parseSave(JSON.stringify(saveV5()));
    expect(result.status).toBe('ok');
    expect(result.migratedFrom).toBe(5);
    expect(result.data.version).toBe(SAVE_VERSION);
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

  it('una partida v5 de antes del posjuego solo cambia de versión y, si había visto el final, abre los picos', () => {
    const base = saveV4().profile;
    const beforePostgame = {
      version: 5,
      timestamp: 1,
      profile: { ...base, clearedDungeons: [...STORY.chapters], story: { seen: ['P-1', 'F-1', 'F-2', 'F-3', 'F-4'] } },
      bag: [],
      wallet: 0,
      run: null,
    };
    const result = parseSave(JSON.stringify(beforePostgame));
    expect(result).toEqual({ status: 'ok', data: { ...beforePostgame, version: 6 }, migratedFrom: 5 });
    expect(profileDungeons(result.data.profile).filter((d) => d.postgame)).toHaveLength(3);
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
