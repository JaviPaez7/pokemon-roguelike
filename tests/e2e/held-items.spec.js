import {
  test,
  expect,
  panelTitle,
  startNewGame,
  startInDungeon,
  expectExploring,
  expectInTown,
  dismissDialog,
  skipDialogs,
  dialogText,
  itemQuantity,
} from './fixtures.js';

/** @param {import('@playwright/test').Page} page @param {string} text */
const option = (page, text) => page.locator('#menu-container .menu-option', { hasText: text });

/** @param {import('@playwright/test').Page} page @param {string} itemId */
const giveToBag = (page, itemId) => page.evaluate((id) => window.game.inventory.push({ itemId: id, quantity: 1 }), itemId);

/** @param {import('@playwright/test').Page} page */
const leaderHeld = (page) => page.evaluate(() => {
  const game = window.game;
  return game.entityManager.getComponent(game.getPlayerId(), 'pokemonInfo').heldItem ?? null;
});

/** @param {import('@playwright/test').Page} page */
const leaderName = (page) => page.evaluate(() => window.game.party[0].name);

test('en la mazmorra se da un objeto desde la mochila sin gastar turno, y se quita desde el equipo', async ({ page }) => {
  await startInDungeon(page);
  await giveToBag(page, 'power_band');
  const leader = await leaderName(page);
  const turns = await page.evaluate(() => window.game.turnManager.getTurnCount());

  await page.keyboard.press('x');
  await option(page, 'Banda Poder').click();
  await option(page, 'Usar objeto').click();
  await expect(panelTitle(page)).toHaveText('¿QUIÉN LLEVA BANDA PODER?');
  await option(page, leader).click();
  expect(await dialogText(page)).toContain(`${leader} lleva ahora Banda Poder.`);
  await dismissDialog(page);

  // Tras equipar se ve el equipo con el objeto puesto
  await expect(panelTitle(page)).toHaveText('EQUIPO POKÉMON');
  await expect(option(page, leader)).toContainText('Banda Poder');
  expect(await leaderHeld(page)).toBe('power_band');
  expect(await itemQuantity(page, 'power_band')).toBe(0);
  expect(await page.evaluate(() => window.game.turnManager.getTurnCount())).toBe(turns);

  await option(page, leader).click();
  await expect(page.locator('#menu-container')).toContainText('Objeto: Banda Poder');
  await option(page, 'Quitar objeto').click();
  expect(await dialogText(page)).toContain('Banda Poder vuelve a la mochila.');
  await dismissDialog(page);
  expect(await leaderHeld(page)).toBeNull();
  expect(await itemQuantity(page, 'power_band')).toBe(1);

  await page.keyboard.press('Escape'); // acciones → equipo
  await page.keyboard.press('Escape'); // equipo → pausa
  await page.keyboard.press('Escape');
  await expectExploring(page);
});

test('el objeto equipado se guarda con la partida y vuelve con el equipo al pueblo', async ({ page }) => {
  await startInDungeon(page);
  await page.evaluate(() => {
    const game = window.game;
    game.entityManager.getComponent(game.getPlayerId(), 'pokemonInfo').heldItem = 'friend_bow';
    game.saveGameData();
  });
  await page.reload();
  await option(page, 'Continuar partida').click();
  await dismissDialog(page);
  await expectExploring(page);
  expect(await leaderHeld(page)).toBe('friend_bow');

  await page.evaluate(() => window.game.completeDungeon());
  await expect.poll(() => page.evaluate(() => window.game.getState())).toBe('TOWN');
  await skipDialogs(page); // resumen y cierre del capítulo 1
  await expectInTown(page);
  const hero = await page.evaluate(() => {
    const { roster, heroUid } = window.game.profile;
    return roster.find((p) => p.uid === heroUid).heldItem;
  });
  expect(hero).toBe('friend_bow');
  expect(await leaderHeld(page)).toBe('friend_bow');
});

test('en el pueblo se equipa desde la mochila', async ({ page }) => {
  await startNewGame(page);
  await giveToBag(page, 'pecha_scarf');
  const leader = await leaderName(page);
  await page.keyboard.press('x');
  await option(page, 'Pañuelo Meloc').click();
  await option(page, 'Equipar').click();
  await option(page, leader).click();
  expect(await dialogText(page)).toContain(`${leader} lleva ahora Pañuelo Meloc.`);
  await dismissDialog(page);
  expect(await leaderHeld(page)).toBe('pecha_scarf');
  // También en la ficha de la plantilla, que es de donde salen las expediciones
  const hero = await page.evaluate(() => {
    const { roster, heroUid } = window.game.profile;
    return roster.find((p) => p.uid === heroUid).heldItem;
  });
  expect(hero).toBe('pecha_scarf');
});

test('en la Torre del Desafío se entra sin objetos equipados y al volver siguen puestos', async ({ page }) => {
  await startNewGame(page);
  await page.evaluate(() => {
    const game = window.game;
    game.profile.clearedDungeons.push('bosque_verde', 'cueva_oscura', 'ruta_electrica', 'monte_lunar', 'profundidades_oscuras', 'isla_volcanica', 'laboratorio_final');
    game.inventory.push({ itemId: 'power_band', quantity: 1 });
    game.useInventoryItem('power_band', game.getPlayerId());
  });
  await dismissDialog(page);
  await page.evaluate(() => window.game.uiManager.closeMenu());
  await expectInTown(page);
  await page.evaluate(() => window.game.uiManager.openDungeonSelect());
  await option(page, 'Torre del Desafío').click();
  await option(page, '¡En marcha!').click();
  await expect.poll(() => page.evaluate(() => window.game.getState())).toBe('EXPLORING');
  await dismissDialog(page);
  expect(await page.evaluate(() => window.game.party.map((p) => p.heldItem))).toEqual([null, null]);

  await page.evaluate(() => window.game.endExpedition('escaped'));
  await expect.poll(() => page.evaluate(() => window.game.getState())).toBe('TOWN');
  await dismissDialog(page);
  expect(await leaderHeld(page)).toBe('power_band');
});
