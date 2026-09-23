import { describe, it, expect } from 'vitest';
import { DungeonGenerator } from '../../src/map/DungeonGenerator.js';
import { MAP_WIDTH, MAP_HEIGHT } from '../../src/constants.js';

/** Lo que define un piso: casillas, salida y entrada. */
function layout(seed, theme = 'forest', isBossRoom = false) {
  const result = new DungeonGenerator().generate(MAP_WIDTH, MAP_HEIGHT, seed, theme, isBossRoom);
  return {
    tiles: result.tileMap.tiles.map((row) => row.join(',')),
    stairs: result.stairsPos,
    start: result.playerStart,
  };
}

describe('DungeonGenerator', () => {
  it('con la misma semilla genera el mismo piso', () => {
    expect(layout(20260923)).toEqual(layout(20260923));
  });

  it('con otra semilla genera otro piso', () => {
    expect(layout(1).tiles).not.toEqual(layout(2).tiles);
  });

  it('la entrada y la escalera caen en casillas transitables y distintas', () => {
    for (const seed of [1, 2, 3, 42, 777]) {
      const result = new DungeonGenerator().generate(MAP_WIDTH, MAP_HEIGHT, seed, 'cave');
      const { playerStart, stairsPos, tileMap } = result;
      expect(tileMap.isWalkable(playerStart.x, playerStart.y)).toBe(true);
      expect(tileMap.isStairs(stairsPos.x, stairsPos.y)).toBe(true);
      expect(stairsPos).not.toEqual(playerStart);
    }
  });
});
