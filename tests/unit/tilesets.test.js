import { describe, it, expect } from 'vitest';
import { tilesetIdForFloor, getBiomeForFloor, TILESETS } from '../../src/map/Biomes.js';
import { DUNGEONS } from '../../src/core/Dungeons.js';

describe('aspecto de las mazmorras', () => {
  it('cada mazmorra normal tiene un tema que existe, y ninguno se repite', () => {
    const normal = DUNGEONS.filter((d) => !d.challenge);
    for (const d of normal) expect(TILESETS[d.tileset], d.id).toBeDefined();
    expect(new Set(normal.map((d) => d.tileset)).size).toBe(normal.length);
  });

  it('el tema sale del piso global: la Torre cambia según el tramo', () => {
    expect(tilesetIdForFloor(1)).toBe('bosque');
    expect(tilesetIdForFloor(5)).toBe('bosque');
    expect(tilesetIdForFloor(6)).toBe('cueva');
    expect(tilesetIdForFloor(12)).toBe('electrica');
    expect(tilesetIdForFloor(18)).toBe('lunar');
    expect(tilesetIdForFloor(25)).toBe('oscuras');
    expect(tilesetIdForFloor(33)).toBe('volcanica');
    expect(tilesetIdForFloor(50)).toBe('laboratorio');
  });

  it('los temas traen todo lo que usa el pintor', () => {
    for (const [id, ts] of Object.entries(TILESETS)) {
      for (const key of ['floor', 'floorAlt', 'corridor', 'wall', 'wallTop', 'wallEdge', 'water', 'lava', 'stairs', 'void', 'gridLines', 'deco']) {
        expect(ts[key], `${id}.${key}`).toBeDefined();
      }
      expect(ts.decoColors.length).toBeGreaterThanOrEqual(2);
    }
    expect(getBiomeForFloor(33)).toMatchObject({ id: 'volcanica', deco: 'cracks' });
  });
});
