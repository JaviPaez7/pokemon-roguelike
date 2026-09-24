import { test, expect, startInDungeon, playerPosition } from './fixtures.js';

/** Huella del piso actual: casillas, entrada y escalera. */
function floorFingerprint(page) {
  return page.evaluate(() => {
    const game = window.game;
    return {
      tiles: game.tileMap.tiles.map((row) => row.join('')).join('|'),
      stairs: game._stairsPos,
      runSeed: game.runSeed,
    };
  });
}

test('la misma semilla en la URL genera la misma mazmorra', async ({ page }) => {
  // startInDungeon recarga la página: cada vuelta es un juego desde cero
  const prints = [];
  for (let i = 0; i < 2; i++) {
    await startInDungeon(page, { seed: 777 });
    prints.push({ floor: await floorFingerprint(page), start: await playerPosition(page) });
  }
  expect(prints[0].floor.runSeed).toBe(777);
  expect(prints[1]).toEqual(prints[0]);
});

test('semillas distintas generan mazmorras distintas', async ({ page }) => {
  await startInDungeon(page, { seed: 1 });
  const first = await floorFingerprint(page);
  await startInDungeon(page, { seed: 2 });
  const second = await floorFingerprint(page);
  expect(second.tiles).not.toBe(first.tiles);
});
