import {
  test,
  expect,
  startInDungeon,
  expectExploring,
  expectInTown,
  dismissDialog,
  dialogText,
} from './fixtures.js';

/**
 * Quita a los salvajes del piso para que nada interrumpa la espera.
 * @param {import('@playwright/test').Page} page
 */
function clearWilds(page) {
  return page.evaluate(() => {
    const game = window.game;
    const em = game.entityManager;
    for (const id of em.getEntitiesWithComponents('aiControlled', 'fighter')) {
      if (em.hasComponent(id, 'partyMember')) continue;
      game.turnManager.removeEntity(id);
      em.destroyEntity(id);
    }
  });
}

/**
 * Pone el contador del viento en `turns` y espera un turno con Espacio.
 * @param {import('@playwright/test').Page} page
 * @param {number} turns
 */
async function waitOneTurnFrom(page, turns) {
  await page.evaluate((n) => { window.game._floorTurns = n; }, turns);
  await page.keyboard.press('Space');
  await expect.poll(() => page.evaluate(() => window.game._floorTurns)).toBe(turns + 1);
}

/** @param {import('@playwright/test').Page} page */
const logText = (page) => page.evaluate(() => window.game._messageLog.join('\n'));

test('el viento avisa, se guarda con la partida y acaba expulsando al equipo', async ({ page }) => {
  await startInDungeon(page);
  await clearWilds(page);
  const wind = await page.evaluate(() => window.game._floorTurns);
  expect(wind).toBe(0);

  await waitOneTurnFrom(page, 599);
  expect(await logText(page)).toContain('Algo se agita a lo lejos…');

  // El último aviso abre un diálogo
  await waitOneTurnFrom(page, 759);
  expect(await dialogText(page)).toContain('Buscad la escalera cuanto antes');
  await dismissDialog(page);

  // Guardar y cargar no calma el viento
  await page.evaluate(() => window.game.saveGameData());
  await page.reload();
  await page.locator('#menu-container .menu-option', { hasText: 'Continuar partida' }).click();
  await dismissDialog(page);
  await expectExploring(page);
  expect(await page.evaluate(() => window.game._floorTurns)).toBe(760);

  // Al llegar al límite, de vuelta al pueblo con las pérdidas de caer
  await clearWilds(page);
  const coins = await page.evaluate(() => window.game.coins);
  expect(coins).toBeGreaterThan(0);
  await page.evaluate(() => { window.game._floorTurns = 799; });
  await page.keyboard.press('Space');
  await expect.poll(() => page.evaluate(() => window.game.getState())).toBe('TOWN');
  const summary = await dialogText(page);
  expect(summary).toContain('¡El viento os ha expulsado de la mazmorra!');
  expect(summary).toContain(`Se perdieron ${coins} Poké`);
  await dismissDialog(page);
  await expectInTown(page);
  expect(await page.evaluate(() => ({ coins: window.game.coins, bag: window.game.inventory.length }))).toEqual({ coins: 0, bag: 0 });
});

test('el viento vuelve a empezar en cada piso', async ({ page }) => {
  await startInDungeon(page);
  await page.evaluate(() => { window.game._floorTurns = 500; });
  await page.evaluate(() => window.game.floorManager.changeFloor('down'));
  await expect.poll(() => page.evaluate(() => window.game._floorTurns)).toBe(0);
});
