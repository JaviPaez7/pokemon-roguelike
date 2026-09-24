import {
  test,
  expect,
  gameStatus,
  panelTitle,
  startNewGame,
  expectExploring,
  dismissDialog,
  runSummary,
} from './fixtures.js';

/** @param {import('@playwright/test').Page} page @param {string} text */
const option = (page, text) => page.locator('#menu-container .menu-option', { hasText: text });

test('guardar desde la pausa, recargar y continuar restaura la partida', async ({ page }) => {
  await startNewGame(page);
  // Un valor que una partida nueva no tiene, para saber que se carga lo guardado
  await page.evaluate(() => {
    window.game.coins = 777;
  });
  const saved = await runSummary(page);

  await page.keyboard.press('Escape');
  await option(page, 'Guardar partida').click();
  await expect(page.locator('.dialog-panel')).toContainText('Partida guardada.');
  await dismissDialog(page);
  await expect(panelTitle(page)).toHaveText('PAUSA');

  await page.reload();
  const continueOption = option(page, 'Continuar partida');
  await expect(continueOption).toContainText('Piso 1 · Bulbasaur Nv.5 · 777 Poké');
  await continueOption.click();
  await expect(page.locator('.dialog-panel')).toContainText('Partida cargada.');
  await dismissDialog(page);

  await expectExploring(page);
  // El piso se regenera al cargar: la Pokédex suma lo que se vea en el mapa nuevo
  const { pokedexSeen, ...loaded } = await runSummary(page);
  const { pokedexSeen: savedPokedex, ...expected } = saved;
  expect(loaded).toEqual(expected);
  expect(pokedexSeen).toEqual(expect.arrayContaining(savedPokedex));
});

test('una partida de la versión 1 se migra al cargar y se guarda una copia de la original', async ({ page }) => {
  await startNewGame(page);
  await page.evaluate(() => window.game.saveGameData());
  // Convertir la partida recién guardada al formato v1 (semilla del piso, sin runSeed)
  const v1 = await page.evaluate(() => {
    const { runSeed, ...rest } = JSON.parse(localStorage.getItem('pokerogue_save'));
    const old = { ...rest, version: 1, seed: 4242 };
    localStorage.setItem('pokerogue_save', JSON.stringify(old));
    return old;
  });

  await page.reload();
  const continueOption = option(page, 'Continuar partida');
  await expect(continueOption).toContainText('Piso 1 · Bulbasaur Nv.5');
  await continueOption.click();
  await dismissDialog(page);
  await expectExploring(page);

  const stored = await page.evaluate(() => ({
    save: JSON.parse(localStorage.getItem('pokerogue_save')),
    backup: JSON.parse(localStorage.getItem('pokerogue_save_backup_v1')),
    runSeed: window.game.runSeed,
  }));
  expect(stored.backup).toEqual(v1);
  expect(stored.save.version).toBe(2);
  expect(stored.save.runSeed).toBe(4242);
  expect(stored.runSeed).toBe(4242);
});

test('una partida ilegible se aparta a una copia y el título sigue funcionando', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.setItem('pokerogue_save', '{esto no es json'));
  await page.reload();

  await expect(page.locator('.dialog-panel')).toContainText('no se podía leer');
  await dismissDialog(page);
  await expect(option(page, 'Nueva Partida')).toBeVisible();
  await expect(option(page, 'Continuar partida')).toHaveCount(0);
  const keys = await page.evaluate(() => Object.keys(localStorage));
  expect(keys).not.toContain('pokerogue_save');
  expect(keys.some((k) => k.startsWith('pokerogue_save_backup_corrupt_'))).toBe(true);
});

test('una partida de una versión más nueva no se borra', async ({ page }) => {
  await page.goto('/');
  const newer = JSON.stringify({ version: 999, party: [{ name: 'Mew' }] });
  await page.evaluate((raw) => localStorage.setItem('pokerogue_save', raw), newer);
  await page.reload();

  await expect(page.locator('.dialog-panel')).toContainText('versión más nueva');
  await dismissDialog(page);
  await expect(option(page, 'Continuar partida')).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem('pokerogue_save'))).toBe(newer);
});

test('«Guardar y salir» vuelve al título con la partida lista para continuar', async ({ page }) => {
  await startNewGame(page);

  await page.keyboard.press('Escape');
  await option(page, 'Guardar y salir').click();
  await dismissDialog(page);

  await expect(option(page, 'Continuar partida')).toContainText('Piso 1 · Bulbasaur Nv.5');
  expect((await gameStatus(page)).state).toBe('TITLE');
});
