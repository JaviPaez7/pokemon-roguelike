/**
 * La tienda de Kecleon en el pueblo: los surtidos de rango y la mochila más
 * grande (core/Shop.js, shop.json). La lógica (precios, surtidos, el Kecleon
 * Mercader de las mazmorras) la prueba tests/unit/shop.test.js; aquí, que se
 * compra desde la tienda, que se nota y que dura.
 */
import {
  test,
  expect,
  panelTitle,
  startNewGame,
  enterDungeon,
  expectInTown,
  dismissDialog,
  dialogText,
  skipDialogs,
} from './fixtures.js';

/** @param {import('@playwright/test').Page} page @param {string | RegExp} text */
const option = (page, text) => page.locator('#menu-container .menu-option', { hasText: text });

/**
 * Abre la tienda del pueblo y devuelve la nota de Kecleon sobre su surtido.
 * @param {import('@playwright/test').Page} page
 */
async function openShop(page) {
  await page.evaluate(() => window.game.uiManager.openTownShop());
  await expect(panelTitle(page)).toHaveText('TIENDA KECLEON');
  return page.locator('#menu-container .merchant-note').textContent();
}

/** @param {import('@playwright/test').Page} page */
async function openBuyList(page) {
  await option(page, 'Comprar objetos').click();
  await expect(panelTitle(page)).toContainText('COMPRAR');
}

/** @param {import('@playwright/test').Page} page */
async function closeShop(page) {
  await page.evaluate(() => window.game.uiManager.closeMenu());
  await expectInTown(page);
}

/** @param {import('@playwright/test').Page} page */
const wallet = (page) =>
  page.evaluate(() => ({
    coins: window.game.coins,
    bag: window.game.inventory.map((s) => ({ ...s })),
    slots: window.game.maxInventorySize,
    upgrades: window.game.profile.upgrades ?? null,
  }));

/**
 * Espera a volver al pueblo tras una expedición y pasa el resumen y la
 * escena que venga detrás.
 * @param {import('@playwright/test').Page} page
 */
async function backInTown(page) {
  await expect.poll(() => page.evaluate(() => window.game.getState())).toBe('TOWN');
  await skipDialogs(page);
  await expectInTown(page);
}

test('Kecleon amplía la tienda con el rango: las piedras, a su precio, desde el Surtido Plata', async ({ page }) => {
  await startNewGame(page);
  expect(await openShop(page)).toContain('Con rango Bronce, Kecleon traerá más cosas');
  await openBuyList(page);
  await expect(option(page, 'Piedra Fuego')).toHaveCount(0);
  await expect(option(page, 'Gominola')).toHaveCount(0);
  await closeShop(page);

  // Rango Plata: el Surtido Bronce y el Plata, siempre a la venta
  await page.evaluate(() => {
    window.game.profile.rankPoints = 500;
    window.game.coins = 1500;
  });
  expect(await openShop(page)).toContain('Surtido Plata. Con rango Oro');
  await openBuyList(page);
  await expect(option(page, 'Gominola Roja')).toContainText('Bronce');
  const stone = option(page, 'Piedra Fuego');
  await expect(stone).toContainText('Plata');
  await expect(stone).toContainText('1000 Poké');
  await stone.click();
  expect(await dialogText(page)).toContain('¡Compraste Piedra Fuego por 1000 monedas!');
  await dismissDialog(page);
  let now = await wallet(page);
  expect(now.coins).toBe(500);
  expect(now.bag).toContainEqual({ itemId: 'fire_stone', quantity: 1 });

  // Kecleon la compra por una parte de su precio
  await option(page, 'Volver atrás').click();
  await option(page, 'Vender objetos').click();
  const sale = option(page, 'Piedra Fuego');
  await expect(sale).toContainText('+300 Poké');
  await sale.click();
  expect(await dialogText(page)).toContain('¡Vendiste 1 Piedra Fuego por 300 monedas!');
  await dismissDialog(page);
  now = await wallet(page);
  expect(now.coins).toBe(800);
  expect(now.bag.some((s) => s.itemId === 'fire_stone')).toBe(false);
});

test('al completar el Bosque Verde, el resumen avisa de que Kecleon amplía su tienda', async ({ page }) => {
  await startNewGame(page);
  await enterDungeon(page);
  await page.evaluate(() => window.game.completeDungeon());
  await expect.poll(() => page.evaluate(() => window.game.getState())).toBe('TOWN');
  const summary = await dialogText(page);
  expect(summary).toContain('¡El equipo sube a rango Bronce!');
  expect(summary).toContain('Kecleon amplía su tienda: Surtido Bronce.');
  await skipDialogs(page);
  await expectInTown(page);
  await openShop(page);
  await openBuyList(page);
  await expect(option(page, 'Mochila más grande')).toContainText('1000 Poké');
});

test('la mochila más grande se compra una vez y dura al guardar, al recargar y en las expediciones (en la Torre, la de siempre)', async ({ page }) => {
  await startNewGame(page);
  // Mochila llena: 24 objetos distintos, ninguno el Antídoto
  await page.evaluate(() => {
    const game = window.game;
    const ids = game.itemsData.filter((i) => !i.unique && i.id !== 'antidote').slice(0, 24).map((i) => i.id);
    game.inventory = ids.map((itemId) => ({ itemId, quantity: 1 }));
    game.coins = 1200;
    game.profile.clearedDungeons = ['bosque_verde']; // Surtido Bronce por la historia
  });
  expect((await wallet(page)).slots).toBe(24);

  await openShop(page);
  await openBuyList(page);
  // Con la mochila llena no cabe nada nuevo
  await option(page, 'Antídoto').click();
  expect(await dialogText(page)).toContain('¡Tu mochila está llena!');
  await dismissDialog(page);

  const upgrade = option(page, 'Mochila más grande');
  await expect(upgrade).toContainText('1000 Poké');
  await expect(upgrade).toContainText('De 24 a 32 huecos');
  await upgrade.click();
  expect(await dialogText(page)).toContain('Ahora caben 32 objetos distintos.');
  await dismissDialog(page);
  expect(await wallet(page)).toMatchObject({ coins: 200, slots: 32, upgrades: { bag: 1 } });
  // Solo se compra una vez: la siguiente espera al Surtido Plata
  await expect(option(page, 'Mochila más grande')).toHaveCount(0);

  // Ahora sí cabe
  await option(page, 'Antídoto').click();
  expect(await dialogText(page)).toContain('¡Compraste Antídoto');
  await dismissDialog(page);
  expect((await wallet(page)).bag).toHaveLength(25);
  await closeShop(page);

  // Se guarda al comprar: dura al recargar
  await page.reload();
  await option(page, 'Continuar partida').click();
  await dismissDialog(page);
  await expectInTown(page);
  expect(await wallet(page)).toMatchObject({ slots: 32, upgrades: { bag: 1 } });
  expect((await wallet(page)).bag).toHaveLength(25);

  // Vale en la mazmorra y al volver
  await enterDungeon(page);
  expect((await wallet(page)).slots).toBe(32);
  await page.evaluate(() => window.game.endExpedition('escaped'));
  await backInTown(page);
  expect(await wallet(page)).toMatchObject({ slots: 32, upgrades: { bag: 1 } });

  // En la Torre del Desafío la mochila es la de siempre; al volver, otra vez la grande
  await page.evaluate(() => {
    window.game.profile.clearedDungeons = ['bosque_verde', 'cueva_oscura', 'ruta_electrica', 'monte_lunar', 'profundidades_oscuras', 'isla_volcanica', 'laboratorio_final'];
  });
  await enterDungeon(page, 7); // la Torre es la octava de la lista
  expect(await page.evaluate(() => window.game.dungeonId)).toBe('torre_desafio');
  expect((await wallet(page)).slots).toBe(24);
  await page.evaluate(() => window.game.endExpedition('escaped'));
  await backInTown(page);
  const after = await wallet(page);
  expect(after).toMatchObject({ slots: 32, upgrades: { bag: 1 } });
  expect(after.bag).toHaveLength(25);
});
