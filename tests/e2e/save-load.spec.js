import {
  test,
  expect,
  gameStatus,
  panelTitle,
  startNewGame,
  startInDungeon,
  expectExploring,
  expectInTown,
  dismissDialog,
  runSummary,
} from './fixtures.js';

/** @param {import('@playwright/test').Page} page @param {string} text */
const option = (page, text) => page.locator('#menu-container .menu-option', { hasText: text });

/** Guarda desde la pausa y vuelve a la pausa. */
async function saveFromPause(page) {
  await page.keyboard.press('Escape');
  await option(page, 'Guardar partida').click();
  await expect(page.locator('.dialog-panel')).toContainText('Partida guardada.');
  await dismissDialog(page);
  await expect(panelTitle(page)).toHaveText('PAUSA');
}

/** Recarga, pulsa «Continuar partida» (comprobando su resumen) y cierra el diálogo de carga. */
async function reloadAndContinue(page, hint) {
  await page.reload();
  const continueOption = option(page, 'Continuar partida');
  await expect(continueOption).toContainText(hint);
  await continueOption.click();
  await expect(page.locator('.dialog-panel')).toBeVisible();
  const text = await page.locator('.dialog-panel').textContent();
  await dismissDialog(page);
  return text;
}

test('guardar en la mazmorra, recargar y continuar retoma la expedición', async ({ page }) => {
  await startInDungeon(page);
  // Un valor que una partida nueva no tiene, para saber que se carga lo guardado
  await page.evaluate(() => {
    window.game.coins = 777;
  });
  const saved = await runSummary(page);

  await saveFromPause(page);
  const loadText = await reloadAndContinue(page, 'Equipo Aurora · Rango Normal · Bosque Verde P1');
  expect(loadText).toContain('Partida cargada.');

  await expectExploring(page);
  // El piso se regenera al cargar: la Pokédex suma lo que se vea en el mapa nuevo
  const { pokedexSeen, ...loaded } = await runSummary(page);
  const { pokedexSeen: savedPokedex, ...expected } = saved;
  expect(loaded).toEqual(expected);
  expect(pokedexSeen).toEqual(expect.arrayContaining(savedPokedex));
});

test('guardar en el pueblo, recargar y continuar vuelve al pueblo con todo', async ({ page }) => {
  await startNewGame(page);
  await page.evaluate(() => {
    window.game.coins = 55;
    window.game.profile.bank = 321;
    window.game.profile.storage.push({ itemId: 'potion', quantity: 4 });
  });
  const before = await page.evaluate(() => ({
    team: window.game.party.map((p) => p.name),
    bag: window.game.inventory,
  }));

  await saveFromPause(page);
  await reloadAndContinue(page, 'Equipo Aurora · Rango Normal · Pueblo Raíz');

  await expectInTown(page);
  const after = await page.evaluate(() => ({
    team: window.game.party.map((p) => p.name),
    bag: window.game.inventory,
    coins: window.game.coins,
    bank: window.game.profile.bank,
    storage: window.game.profile.storage,
  }));
  expect(after).toEqual({ ...before, coins: 55, bank: 321, storage: [{ itemId: 'potion', quantity: 4 }] });
});

test('una partida de la versión 2 (carrera de 50 pisos) se convierte en un perfil en el pueblo', async ({ page }) => {
  await startInDungeon(page);
  await page.evaluate(() => window.game.saveGameData());
  // Montar una partida con el formato v2 a partir de la expedición actual
  const v2 = await page.evaluate(() => {
    const v3 = JSON.parse(localStorage.getItem('pokerogue_save'));
    const old = {
      version: 2,
      timestamp: 1,
      runSeed: 4242,
      coins: 77,
      currentFloor: 12,
      party: v3.run.party,
      // Las Poké Balls ya no existen (v4): se cambian por dinero
      inventory: [...v3.bag, { itemId: 'pokeball', quantity: 2 }],
      stats: { turnsPlayed: 321 },
      pokedex: [1, 16],
      floorItems: [],
    };
    localStorage.setItem('pokerogue_save', JSON.stringify(old));
    return old;
  });

  const text = await reloadAndContinue(page, 'Equipo Pionero · Rango Normal · Pueblo Raíz');
  expect(text).toContain('¡El juego ha cambiado!');
  expect(text).toContain('Ya no hay Poké Balls');
  expect(text).toContain('se han cambiado por 96 Poké');

  await expectInTown(page);
  const state = await page.evaluate(() => ({
    team: window.game.profile.teamName,
    cleared: window.game.profile.clearedDungeons,
    party: window.game.party.map((p) => p.name),
    coins: window.game.coins,
    bag: window.game.inventory,
    turns: window.game.stats.turnsPlayed,
    backup: JSON.parse(localStorage.getItem('pokerogue_save_backup_v2')),
    noticeSaved: JSON.parse(localStorage.getItem('pokerogue_save')).profile.flags.migrationNoticeShown,
  }));
  expect(state.team).toBe('Equipo Pionero');
  expect(state.cleared).toEqual(['bosque_verde', 'cueva_oscura']);
  expect(state.party).toEqual(v2.party.map((p) => p.name));
  expect(state.coins).toBe(77 + 2 * 48);
  expect(state.bag).toEqual(v2.inventory.filter((s) => s.itemId !== 'pokeball'));
  expect(state.turns).toBe(321);
  expect(state.backup).toEqual(v2);
  expect(state.noticeSaved).toBe(true);
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
  const newer = JSON.stringify({ version: 999, profile: { roster: [{ name: 'Mew' }], heroUid: 1 } });
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

  await expect(option(page, 'Continuar partida')).toContainText('Equipo Aurora');
  expect((await gameStatus(page)).state).toBe('TITLE');
});

test('empezar otra aventura con una partida guardada pide confirmación y guarda una copia', async ({ page }) => {
  await startNewGame(page);
  await page.evaluate(() => window.game.saveGameData());
  await page.reload();

  await option(page, 'Nueva Partida').click();
  await expect(panelTitle(page)).toHaveText('¿EMPEZAR DE CERO?');
  await page.keyboard.press('z'); // «No, volver» es la opción por defecto
  await expect(option(page, 'Continuar partida')).toBeVisible();

  await option(page, 'Nueva Partida').click();
  await option(page, 'Sí, empezar otra').click();
  await expect(panelTitle(page)).toHaveText('UNA NUEVA AVENTURA');
  const keys = await page.evaluate(() => Object.keys(localStorage));
  expect(keys.some((k) => k.startsWith('pokerogue_save_backup_replaced_'))).toBe(true);
});
