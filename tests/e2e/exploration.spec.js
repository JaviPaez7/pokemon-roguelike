import {
  test,
  expect,
  panelTitle,
  openTitleScreen,
  startNewGame,
  startInDungeon,
  expectInTown,
  playerPosition,
  walk,
  findFreeStep,
  itemQuantity,
} from './fixtures.js';

/** @param {import('@playwright/test').Page} page @param {string | RegExp} text */
const option = (page, text) => page.locator('#menu-container .menu-option', { hasText: text });

test('nueva aventura con el ratón: test, compañero, nombre y llegada al pueblo', async ({ page }) => {
  await openTitleScreen(page);

  await option(page, 'Nueva Partida').click();
  await option(page, 'Empezar').click();
  for (let i = 1; i <= 8; i++) {
    await expect(panelTitle(page)).toHaveText(`PREGUNTA ${i} DE 8`);
    await page.locator('#menu-container .menu-option[data-index="0"]').click();
  }
  const hero = (await option(page, '¡Seré').textContent()).match(/¡Seré (.+)!/)[1].trim();
  await option(page, '¡Seré').click();
  await expect(panelTitle(page)).toHaveText('¿QUIÉN SERÁ TU COMPAÑERO?');
  await page.locator('#menu-container .menu-option[data-index="0"]').click();
  await page.locator('#team-name-input').fill('Equipo Ratón');
  await option(page, '¡Empezar la aventura!').click();
  const welcome = page.locator('.dialog-panel');
  await expect(welcome).toContainText('¡Bienvenidos a Pueblo Raíz, Equipo Ratón!');
  await welcome.click();
  if (await welcome.isVisible()) await welcome.click();
  await page.mouse.move(0, 0);

  await expectInTown(page);
  const run = await page.evaluate(() => ({
    team: window.game.profile.teamName,
    party: window.game.party.map((p) => ({ name: p.name, level: p.level })),
    coins: window.game.coins,
    bag: window.game.inventory.length,
  }));
  expect(run.team).toBe('Equipo Ratón');
  expect(run.party).toHaveLength(2);
  expect(run.party[0]).toEqual({ name: hero, level: 5 });
  expect(run.party[1].level).toBe(5);
  expect(run.coins).toBe(150);
  expect(run.bag).toBe(4);
});

test('en el pueblo las flechas mueven al líder y el compañero le sigue', async ({ page }) => {
  await startNewGame(page);
  const leader = await playerPosition(page);

  await walk(page, 'ArrowUp');

  await expect.poll(() => playerPosition(page)).toEqual({ x: leader.x, y: leader.y - 1 });
  const partner = await page.evaluate(() => {
    const game = window.game;
    const id = game.party[1].id;
    const { x, y } = game.entityManager.getComponent(id, 'position');
    return { x, y };
  });
  expect(partner).toEqual(leader);
  // En el pueblo no pasan turnos
  expect(await page.evaluate(() => window.game.stats.turnsPlayed)).toBe(0);
});

test('en la mazmorra las flechas mueven al jugador una casilla y gastan un turno', async ({ page }) => {
  await startInDungeon(page);
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
  await startInDungeon(page);
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
