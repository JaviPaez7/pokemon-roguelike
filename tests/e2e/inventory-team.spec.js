import {
  test,
  expect,
  panelTitle,
  startInDungeon,
  expectExploring,
  itemQuantity,
} from './fixtures.js';

/** @param {import('@playwright/test').Page} page @param {string} text */
const option = (page, text) => page.locator('#menu-container .menu-option', { hasText: text });

/** @param {import('@playwright/test').Page} page */
const leaderName = (page) => page.evaluate(() => window.game.party[0].name);

test('desde la pausa se entra en Mochila y Equipo y se vuelve a la pausa', async ({ page }) => {
  await startInDungeon(page);
  const bagSize = await page.evaluate(() => window.game.inventory.length);

  await page.keyboard.press('Escape');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('z');
  await expect(panelTitle(page)).toHaveText(`MOCHILA (${bagSize}/24)`);
  await expect(page.locator('#options-list .menu-option')).toHaveCount(bagSize);
  await page.keyboard.press('Escape');
  await expect(panelTitle(page)).toHaveText('PAUSA');

  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('z');
  await expect(panelTitle(page)).toHaveText('EQUIPO POKÉMON');
  await page.keyboard.press('Escape');
  await expect(panelTitle(page)).toHaveText('PAUSA');

  await page.keyboard.press('Escape');
  await expectExploring(page);
});

test('usar una Manzana desde la mochila la gasta y llena la tripa', async ({ page }) => {
  await startInDungeon(page);
  await page.evaluate(() => {
    const game = window.game;
    game.entityManager.getComponent(game.getPlayerId(), 'fighter').belly = 40;
  });
  const apples = await itemQuantity(page, 'apple');
  const leader = await leaderName(page);

  await page.keyboard.press('x');
  await option(page, 'Manzana').click();
  await expect(panelTitle(page)).toHaveText('Manzana');
  await option(page, 'Usar objeto').click();
  await expect(panelTitle(page)).toHaveText('¿USAR MANZANA EN?');
  await option(page, leader).click();

  await expect.poll(() => itemQuantity(page, 'apple')).toBe(apples - 1);
  const belly = await page.evaluate(() => {
    const game = window.game;
    return game.entityManager.getComponent(game.getPlayerId(), 'fighter').belly;
  });
  expect(belly).toBeGreaterThan(85);
});

test('C abre el equipo y se consultan los movimientos del protagonista', async ({ page }) => {
  await startInDungeon(page);
  const leader = await leaderName(page);

  await page.keyboard.press('c');
  await expect(panelTitle(page)).toHaveText('EQUIPO POKÉMON');
  await option(page, leader).first().click();
  await expect(panelTitle(page)).toHaveText(new RegExp(leader, 'i'));
  await option(page, 'Ver movimientos').click();
  await expect(panelTitle(page)).toHaveText(`MOVIMIENTOS DE ${leader.toUpperCase()}`);

  const moves = await page.evaluate(() => {
    const game = window.game;
    return game.entityManager.getComponent(game.getPlayerId(), 'pokemonInfo').currentMoves.map(
      (slot) => game.movesData.find((m) => m.id === slot.moveId)?.name ?? slot.moveId,
    );
  });
  expect(moves.length).toBeGreaterThan(0);
  for (const name of moves) {
    await expect(page.locator('#menu-container')).toContainText(name);
  }

  // Escape vuelve: movimientos → equipo → pausa → exploración
  await page.keyboard.press('Escape');
  await expect(panelTitle(page)).toHaveText('EQUIPO POKÉMON');
  await page.keyboard.press('Escape');
  await expect(panelTitle(page)).toHaveText('PAUSA');
  await page.keyboard.press('Escape');
  await expectExploring(page);
});
