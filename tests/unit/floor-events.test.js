import { describe, it, expect } from 'vitest';
import { friendlyLevel } from '../../src/systems/FloorEvents.js';
import floorsData from '../../src/data/floors.json';

const zoneAt = (floor) => floorsData.zones.find((z) => floor >= z.floors[0] && floor <= z.floors[1]);
const margin = floorsData.friendlyLevelMargin;

describe('nivel de los Pokémon amistosos de los eventos de piso', () => {
  it('en la historia, el del piso, como siempre', () => {
    for (let floor = 1; floor <= 50; floor++) {
      expect(friendlyLevel(floor, zoneAt(floor), margin), `piso ${floor}`).toBe(floor);
    }
  });

  it('en el posjuego no sale del piso global: se queda cerca de los salvajes de la zona', () => {
    const postgame = floorsData.zones.filter((z) => z.floors[0] > 50);
    expect(postgame.length).toBeGreaterThan(0);
    for (const zone of postgame) {
      for (let floor = zone.floors[0]; floor <= zone.floors[1]; floor++) {
        const level = friendlyLevel(floor, zone, margin);
        expect(level, `piso ${floor}`).toBeGreaterThanOrEqual(zone.levelRange[0]);
        expect(level, `piso ${floor}`).toBeLessThanOrEqual(zone.levelRange[1] + margin);
      }
    }
    // En el jardín de Mew (pisos 75-84), no a nivel 84
    expect(friendlyLevel(84, zoneAt(84), margin)).toBe(zoneAt(84).levelRange[1] + margin);
  });

  it('sin zona, el del piso (y nunca menos de 1)', () => {
    expect(friendlyLevel(12, null, margin)).toBe(12);
    expect(friendlyLevel(0, undefined)).toBe(1);
  });
});
