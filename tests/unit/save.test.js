import { describe, it, expect } from 'vitest';
import { parseSave, migrateSave, SAVE_VERSION } from '../../src/core/SaveManager.js';

/** Partida mínima con el formato de la versión 1 (antes de runSeed). */
function saveV1(overrides = {}) {
  return {
    version: 1,
    timestamp: 1,
    seed: 654321,
    coins: 80,
    currentFloor: 7,
    party: [{ speciesId: 1, name: 'Bulbasaur', level: 9, isLeader: true }],
    inventory: [{ itemId: 'apple', quantity: 2 }],
    stats: {},
    pokedex: [1, 16],
    ...overrides,
  };
}

describe('migrateSave', () => {
  it('lleva una partida v1 a la versión actual sin perder datos', () => {
    const migrated = migrateSave(saveV1());
    expect(migrated.version).toBe(SAVE_VERSION);
    expect(migrated.party).toEqual(saveV1().party);
    expect(migrated.inventory).toEqual(saveV1().inventory);
    expect(migrated.currentFloor).toBe(7);
    expect(migrated.coins).toBe(80);
  });

  it('v1 → v2: la semilla del piso pasa a ser la de la partida', () => {
    const migrated = migrateSave(saveV1());
    expect(migrated.runSeed).toBe(654321);
    expect(migrated).not.toHaveProperty('seed');
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
    const current = migrateSave(saveV1());
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
  ])('%s es corrupt', (_, raw) => {
    expect(parseSave(raw)).toEqual({ status: 'corrupt' });
  });
});
