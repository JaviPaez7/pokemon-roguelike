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
