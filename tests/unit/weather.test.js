import { describe, it, expect } from 'vitest';
import { weatherOptions, WeatherSystem } from '../../src/systems/WeatherSystem.js';
import floorsData from '../../src/data/floors.json';

const zoneAt = (floor) => floorsData.zones.find((z) => floor >= z.floors[0] && floor <= z.floors[1]);

describe('clima de cada piso', () => {
  it('como siempre en la historia: nada al principio, lluvia o sol después y de todo desde el piso 8', () => {
    expect(weatherOptions(3, zoneAt(3)).chance).toBe(0);
    expect(weatherOptions(5, zoneAt(5))).toEqual({ chance: 0.2, types: ['lluvia', 'sol'] });
    expect(weatherOptions(40, zoneAt(40))).toEqual({ chance: 0.2, types: ['lluvia', 'sol', 'tormenta_arena', 'granizo'] });
  });

  it('las mazmorras de los legendarios tienen el suyo: granizo, lluvia y sol', () => {
    expect(weatherOptions(51, zoneAt(51)).types).toEqual(['granizo']);
    expect(weatherOptions(60, zoneAt(60)).types).toEqual(['lluvia']);
    expect(weatherOptions(70, zoneAt(70)).types).toEqual(['sol']);
  });

  it('los climas de las zonas existen', () => {
    const known = new WeatherSystem().weatherTypes;
    for (const zone of floorsData.zones.filter((z) => z.weather)) {
      expect(zone.weather.chance, zone.name).toBeGreaterThan(0);
      for (const type of zone.weather.types) expect(known, zone.name).toContain(type);
    }
  });
});
