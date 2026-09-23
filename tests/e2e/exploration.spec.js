import {
  test,
  expect,
  openTitleScreen,
  startNewGame,
  expectExploring,
  runSummary,
  playerPosition,
  findFreeStep,
  itemQuantity,
} from './fixtures.js';

test('nueva partida con el ratón: título, inicial y bienvenida', async ({ page }) => {
  await openTitleScreen(page);

  await page.locator('.menu-option', { hasText: 'Nueva Partida' }).click();
  await page.locator('.menu-option', { hasText: 'Bulbasaur' }).click();
  const welcome = page.locator('.dialog-panel');
  await expect(welcome).toContainText('¡Bienvenido a PokéRogue!');
  await welcome.click();

  await expectExploring(page);
  const run = await runSummary(page);
  expect(run.floor).toBe(1);
  expect(run.coins).toBe(140);
  expect(run.party).toEqual([expect.objectContaining({ name: 'Bulbasaur', level: 5 })]);
  expect(run.inventory).toHaveLength(10);
});

test('las flechas mueven al jugador una casilla y gastan un turno', async ({ page }) => {
  await startNewGame(page);
  const step = await findFreeStep(page);
  expect(step, 'hay una casilla libre junto al jugador').not.toBeNull();
  const start = await playerPosition(page);
  const turns = await page.evaluate(() => window.game.stats.turnsPlayed);

  await page.keyboard.press(step.key);

  await expect
    .poll(() => playerPosition(page))
    .toEqual({ x: start.x + step.dx, y: start.y + step.dy });
  expect(await page.evaluate(() => window.game.stats.turnsPlayed)).toBeGreaterThan(turns);
});

test('al pisar un objeto se guarda en la mochila', async ({ page }) => {
  await startNewGame(page);
  const step = await findFreeStep(page);
  expect(step, 'hay una casilla libre junto al jugador').not.toBeNull();
  const before = await itemQuantity(page, 'oran_berry');

  const dropId = await page.evaluate(({ dx, dy }) => {
    const game = window.game;
    const { x, y } = game.entityManager.getComponent(game.getPlayerId(), 'position');
    return game.entityManager.createItemEntity('oran_berry', 1, x + dx, y + dy);
  }, step);
  await page.keyboard.press(step.key);

  await expect.poll(() => itemQuantity(page, 'oran_berry')).toBe(before + 1);
  expect(await page.evaluate((id) => window.game.entityManager.entityExists(id), dropId)).toBe(false);
});
