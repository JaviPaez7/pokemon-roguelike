import { test, expect, startInDungeon, playerPosition } from './fixtures.js';

/**
 * Deja al líder con un único movimiento (por nombre) con PP de sobra y quita
 * a los salvajes del piso, para montar la escena a mano.
 * @param {import('@playwright/test').Page} page
 * @param {string} moveName
 */
function prepareLeader(page, moveName) {
  return page.evaluate((name) => {
    const game = window.game;
    const em = game.entityManager;
    const move = game.movesData.find((m) => m.name === name);
    const info = em.getComponent(game.getPlayerId(), 'pokemonInfo');
    info.currentMoves = [{ moveId: move.id, currentPP: 20, maxPP: 20, enabled: true }];
    for (const id of em.getEntitiesWithComponents('aiControlled', 'fighter')) {
      if (em.hasComponent(id, 'partyMember')) continue;
      game.turnManager.removeEntity(id);
      em.destroyEntity(id);
    }
    return move.id;
  }, moveName);
}

/**
 * Una dirección con `length` casillas libres en línea recta desde el líder.
 * @returns {Promise<{ dx: number, dy: number, key: string } | null>}
 */
function freeLine(page, length) {
  return page.evaluate((n) => {
    const game = window.game;
    const em = game.entityManager;
    const { x, y } = em.getComponent(game.getPlayerId(), 'position');
    const dirs = [[1, 0, 'ArrowRight'], [-1, 0, 'ArrowLeft'], [0, 1, 'ArrowDown'], [0, -1, 'ArrowUp']];
    for (const [dx, dy, key] of dirs) {
      let ok = true;
      for (let i = 1; i <= n; i++) {
        const tx = x + dx * i;
        const ty = y + dy * i;
        if (!game.tileMap.isWalkable(tx, ty) || game.tileMap.isStairs(tx, ty) || em.getEntityAt(tx, ty, true) !== null || em.getTrapAt(tx, ty) !== null) ok = false;
      }
      if (ok) return { dx, dy, key };
    }
    return null;
  }, length);
}

/** Crea un salvaje en (x, y) y devuelve su id. */
function spawnWild(page, x, y, speciesId = 19, level = 10) {
  return page.evaluate(({ x, y, speciesId, level }) => {
    const game = window.game;
    const id = game.entityManager.createPokemon(speciesId, level, x, y, true);
    const f = game.entityManager.getComponent(id, 'fighter');
    game.turnManager.addEntity(id, f.speed, false);
    return id;
  }, { x, y, speciesId, level });
}

const hpOf = (page, id) =>
  page.evaluate((i) => window.game.entityManager.getComponent(i, 'fighter')?.hp ?? 0, id);

test('Ctrl + dirección gira sin gastar turno y un movimiento en línea alcanza a un rival lejano', async ({ page }) => {
  await startInDungeon(page);
  await prepareLeader(page, 'Pistola Agua');
  const line = await freeLine(page, 4);
  expect(line, 'hay 4 casillas libres en línea').not.toBeNull();
  const me = await playerPosition(page);
  const foe = await spawnWild(page, me.x + line.dx * 4, me.y + line.dy * 4);
  const hpBefore = await hpOf(page, foe);
  const turns = await page.evaluate(() => window.game.stats.turnsPlayed);

  await page.keyboard.press(`Control+${line.key}`);
  await page.waitForFunction(() => window.game.inputHandler.peekAction() === null);
  const facing = await page.evaluate(() => {
    const p = window.game.entityManager.getComponent(window.game.getPlayerId(), 'position');
    return { dx: p.facingDx, dy: p.facingDy };
  });
  expect(facing).toEqual({ dx: line.dx, dy: line.dy });
  expect(await playerPosition(page)).toEqual(me);
  expect(await page.evaluate(() => window.game.stats.turnsPlayed)).toBe(turns);

  await page.keyboard.press('1');
  await expect.poll(() => hpOf(page, foe)).toBeLessThan(hpBefore);
  const pp = await page.evaluate(() => window.game.entityManager.getComponent(window.game.getPlayerId(), 'pokemonInfo').currentMoves[0].currentPP);
  expect(pp).toBe(19);
});

test('Terremoto golpea a todos los rivales de la sala y gasta un solo PP', async ({ page }) => {
  await startInDungeon(page);
  await prepareLeader(page, 'Terremoto');
  const line = await freeLine(page, 3);
  expect(line).not.toBeNull();
  const me = await playerPosition(page);
  const a = await spawnWild(page, me.x + line.dx * 2, me.y + line.dy * 2, 19, 30);
  const b = await spawnWild(page, me.x + line.dx * 3, me.y + line.dy * 3, 10, 30); // Caterpie (un volador sería inmune)
  const [hpA, hpB] = [await hpOf(page, a), await hpOf(page, b)];

  await page.keyboard.press('1');

  await expect.poll(() => hpOf(page, a)).toBeLessThan(hpA);
  expect(await hpOf(page, b)).toBeLessThan(hpB);
  const pp = await page.evaluate(() => window.game.entityManager.getComponent(window.game.getPlayerId(), 'pokemonInfo').currentMoves[0].currentPP);
  expect(pp).toBe(19);
});

test('sin rivales a tiro, un movimiento en línea no gasta el turno', async ({ page }) => {
  await startInDungeon(page);
  await prepareLeader(page, 'Pistola Agua');
  const turns = await page.evaluate(() => window.game.stats.turnsPlayed);

  await page.keyboard.press('1');
  await page.waitForFunction(() => window.game.inputHandler.peekAction() === null);

  expect(await page.evaluate(() => window.game.stats.turnsPlayed)).toBe(turns);
  const pp = await page.evaluate(() => window.game.entityManager.getComponent(window.game.getPlayerId(), 'pokemonInfo').currentMoves[0].currentPP);
  expect(pp).toBe(20);
});

test('Mayús + dirección corre varias casillas de una vez', async ({ page }) => {
  await startInDungeon(page);
  await prepareLeader(page, 'Placaje');
  const line = await freeLine(page, 3);
  expect(line).not.toBeNull();
  const start = await playerPosition(page);

  await page.keyboard.press(`Shift+${line.key}`);

  await expect
    .poll(async () => {
      const p = await playerPosition(page);
      return Math.abs(p.x - start.x) + Math.abs(p.y - start.y);
    })
    .toBeGreaterThanOrEqual(2);
  // Parado al final: sin carrera pendiente
  await expect.poll(() => page.evaluate(() => window.game._run)).toBeNull();
});
