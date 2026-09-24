// Regresión del bug de 75eebf4: abrir un menú desde exploración entraba en un
// ciclo openPauseMenu → changeState(MENU) → state_changed → openPauseMenu… que
// acababa en «Maximum call stack size exceeded». Cada apertura debe provocar
// exactamente un cambio de estado.
import {
  test,
  expect,
  gameStatus,
  panelTitle,
  openTitleScreen,
  startNewGame,
  expectExploring,
  recordStateChanges,
  stateChanges,
} from './fixtures.js';

const OPENERS = [
  { key: 'Escape', title: 'PAUSA', menu: 'pause' },
  { key: 'x', title: /^MOCHILA/, menu: 'inventory' },
  { key: 'c', title: 'EQUIPO POKÉMON', menu: 'team' },
];

for (const { key, title, menu } of OPENERS) {
  test(`${key} abre «${menu}» desde exploración con un solo cambio de estado`, async ({ page }) => {
    await startNewGame(page);
    await recordStateChanges(page);

    await page.keyboard.press(key);

    await expect(panelTitle(page)).toHaveText(title);
    expect(await gameStatus(page)).toEqual({ state: 'MENU', menu, input: 'menu' });
    expect(await stateChanges(page)).toEqual(['MENU']);
  });
}

test('el botón táctil de pausa abre la pausa con un solo cambio de estado', async ({ page }) => {
  await startNewGame(page);
  await recordStateChanges(page);

  await page.locator('.touch-btn[data-action="pause"]').dispatchEvent('pointerdown');

  await expect(panelTitle(page)).toHaveText('PAUSA');
  expect(await stateChanges(page)).toEqual(['MENU']);
});

test('Escape y «Continuar» cierran la pausa y devuelven el control', async ({ page }) => {
  await startNewGame(page);
  await recordStateChanges(page);

  await page.keyboard.press('Escape');
  await expect(panelTitle(page)).toHaveText('PAUSA');
  await page.keyboard.press('Escape');
  await expectExploring(page);

  await page.keyboard.press('Escape');
  await expect(panelTitle(page)).toHaveText('PAUSA');
  await page.keyboard.press('z'); // «Continuar» es la opción seleccionada al abrir
  await expectExploring(page);

  expect(await stateChanges(page)).toEqual(['MENU', 'EXPLORING', 'MENU', 'EXPLORING']);
});

test('changeState es idempotente: pedir el estado actual no emite nada', async ({ page }) => {
  await startNewGame(page);
  await recordStateChanges(page);

  await page.evaluate(() => window.game.changeState('EXPLORING'));

  expect(await stateChanges(page)).toEqual([]);
  await expectExploring(page);
});

test('Escape en la selección de inicial vuelve al título y se puede volver a entrar', async ({ page }) => {
  await openTitleScreen(page);
  await page.keyboard.press('z');
  await expect(panelTitle(page)).toHaveText('ELIGE TU COMPAÑERO INICIAL');

  await page.keyboard.press('Escape');
  await expect(page.locator('.menu-option', { hasText: 'Nueva Partida' })).toBeVisible();
  expect((await gameStatus(page)).state).toBe('TITLE');

  await page.keyboard.press('z');
  await expect(panelTitle(page)).toHaveText('ELIGE TU COMPAÑERO INICIAL');
});

test('changeState rechaza que quien reacciona a state_changed vuelva a cambiar el estado', async ({ page, pageErrors }) => {
  await openTitleScreen(page);

  const finalState = await page.evaluate(() => {
    const game = window.game;
    const reentrant = ({ state }) => {
      if (state === 'STARTER_SELECT') game.changeState('TITLE');
    };
    game.eventBus.on('state_changed', reentrant);
    game.changeState('STARTER_SELECT');
    game.eventBus.off('state_changed', reentrant);
    return game.getState();
  });

  expect(finalState).toBe('STARTER_SELECT');
  await expect(panelTitle(page)).toHaveText('ELIGE TU COMPAÑERO INICIAL');
  await expect.poll(() => pageErrors.length).toBe(1);
  expect(pageErrors[0]).toContain("changeState('TITLE')");
  pageErrors.length = 0;
});
