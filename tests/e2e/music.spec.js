// La música (H5): cada lugar suena con su tema, elegido desde data/music.json.
import {
  test,
  expect,
  panelTitle,
  openTitleScreen,
  startNewGame,
  expectInTown,
  expectExploring,
  skipDialogs,
  dialogText,
} from './fixtures.js';

/**
 * Tema que suena ahora (o que sonará en cuanto el navegador deje reanudar el audio).
 * @param {import('@playwright/test').Page} page
 */
const theme = (page) => page.evaluate(() => window.game.uiManager.music.currentTheme);

/**
 * Temporizador del tema: si no cambia, el tema no se ha reiniciado.
 * @param {import('@playwright/test').Page} page
 */
const themeTimer = (page) => page.evaluate(() => window.game.uiManager.music.intervalId);

/** @param {import('@playwright/test').Page} page @param {string} text */
const option = (page, text) => page.locator('#menu-container .menu-option', { hasText: text });

/**
 * Pulsa Z hasta que el diálogo abierto contiene `text`.
 * @param {import('@playwright/test').Page} page
 * @param {string} text
 */
async function advanceTo(page, text) {
  for (let i = 0; i < 200; i++) {
    if ((await dialogText(page)).includes(text)) return;
    await page.keyboard.press('z');
  }
  throw new Error(`No ha salido ningún diálogo con «${text}»`);
}

/**
 * Pulsa Z mientras haya diálogo hasta volver al pueblo.
 * @param {import('@playwright/test').Page} page
 */
async function advanceUntilTown(page) {
  for (let i = 0; i < 100; i++) {
    if ((await page.evaluate(() => window.game.getState())) === 'TOWN') return;
    if (await page.locator('.dialog-panel').isVisible()) await page.keyboard.press('z');
    else await page.waitForTimeout(50);
  }
  throw new Error('No se ha vuelto al pueblo');
}

test('título, prólogo, pueblo, mazmorra, jefe, escenas y vuelta al pueblo: cada uno con su tema', async ({ page }) => {
  await openTitleScreen(page);
  expect(await theme(page)).toBe('titulo');
  const titleTimer = await themeTimer(page);

  // El test de personalidad sigue con el tema del título, sin reiniciarlo
  await page.keyboard.press('z');
  await expect(panelTitle(page)).toHaveText('UNA NUEVA AVENTURA');
  for (let i = 0; i < 9; i++) await page.keyboard.press('z');
  await expect(panelTitle(page)).toContainText('TU NATURALEZA');
  await page.keyboard.press('z');
  await expect(panelTitle(page)).toHaveText('¿QUIÉN SERÁ TU COMPAÑERO?');
  expect(await theme(page)).toBe('titulo');
  expect(await themeTimer(page)).toBe(titleTimer);
  await page.keyboard.press('z');
  await expect(page.locator('#team-name-input')).toBeFocused();
  await page.keyboard.press('Enter');

  // P-1: la voz a oscuras suena con el tema del Eco
  await expect(page.locator('#ui-overlay.story-black .dialog-panel')).toBeVisible();
  expect(await theme(page)).toBe('eco');
  // P-2 y P-3, con el tema general de la historia (sin reiniciarlo entre escenas)
  await advanceTo(page, '¡Eh! ¡Eh! ¿Me oyes?');
  expect(await theme(page)).toBe('historia');
  const storyTimer = await themeTimer(page);
  await advanceTo(page, '¡Eh, gente de fuera!');
  expect(await theme(page)).toBe('historia');
  expect(await themeTimer(page)).toBe(storyTimer);
  await skipDialogs(page);
  await expectInTown(page);
  expect(await theme(page)).toBe('pueblo');

  // La presentación del Bosque Verde suena con su tema; la escena de entrada, con el de la historia
  await page.evaluate(() => window.game.uiManager.openDungeonSelect());
  await page.keyboard.press('z');
  await page.keyboard.press('z'); // ¡En marcha!
  await expect.poll(() => page.evaluate(() => window.game.getState())).toBe('EXPLORING');
  expect(await dialogText(page)).toContain('Bosque Verde');
  expect(await theme(page)).toBe('bosque_verde');
  await advanceTo(page, 'Así que esto es una mazmorra');
  expect(await theme(page)).toBe('historia');
  await skipDialogs(page);
  await expectExploring(page);
  expect(await theme(page)).toBe('bosque_verde');

  // Piso del jefe: la escena con tensión y, al acabar, el tema del jefe
  await page.evaluate(async () => {
    const game = window.game;
    game._currentFloor = game.dungeon.floors[1] - 1;
    await game.floorManager.changeFloor('down');
  });
  expect(await dialogText(page)).toContain('Una silueta cae de las ramas');
  expect(await theme(page)).toBe('historia_tension');
  await skipDialogs(page);
  await expectExploring(page);
  expect(await theme(page)).toBe('jefe');

  // Sin jefe vuelve el tema de la mazmorra, y la escena de después suena con el de la historia
  await page.evaluate(() => {
    const game = window.game;
    const em = game.entityManager;
    const boss = em.getEntitiesWithComponents('isBoss')[0];
    em.getComponent(boss, 'fighter').hp = 0;
    game.eventBus.emit('pokemon_fainted', { entityId: boss, attackerId: game.getPlayerId() });
  });
  expect(await dialogText(page)).toContain('Pidgeotto ha sido derrotado');
  expect(await theme(page)).toBe('bosque_verde');
  await advanceTo(page, '¿Quién eres…?');
  expect(await theme(page)).toBe('historia');

  // De vuelta: el resumen con el tema del pueblo, la escena con el de la historia y otra vez el pueblo
  await advanceUntilTown(page);
  expect(await dialogText(page)).toContain('¡Bosque Verde completada!');
  expect(await theme(page)).toBe('pueblo');
  await advanceTo(page, '¡¡Hermana!!');
  expect(await theme(page)).toBe('historia');
  await skipDialogs(page);
  await expectInTown(page);
  expect(await theme(page)).toBe('pueblo');
});

test('créditos finales, Diario y Torre con su tema; al acabar vuelve el del lugar y al salir, el del título', async ({ page }) => {
  await startNewGame(page);
  expect(await theme(page)).toBe('pueblo');

  // Los créditos del final y, al cerrarlos, otra vez el pueblo
  await page.evaluate(() => window.game.uiManager.openEndingCredits(() => window.game.uiManager.closeMenu()));
  await expect(page.locator('.credits-roll')).toBeVisible();
  expect(await theme(page)).toBe('creditos');
  await page.keyboard.press('z'); // Continuar
  await expectInTown(page);
  expect(await theme(page)).toBe('pueblo');

  // Abrir y cerrar un menú no cambia ni reinicia la música
  const townTimer = await themeTimer(page);
  await page.keyboard.press('Escape');
  await expect(panelTitle(page)).toHaveText('PAUSA');
  await page.keyboard.press('Escape');
  await expectInTown(page);
  expect(await themeTimer(page)).toBe(townTimer);

  // Una escena del Diario suena como en la historia y al acabar vuelve el pueblo
  await page.evaluate(() => window.game.uiManager.openBaseMenu());
  await option(page, 'Diario').click();
  await option(page, 'Prólogo').click();
  await option(page, 'La voz').click();
  expect(await dialogText(page)).toBe('…¿Me oyes?');
  expect(await theme(page)).toBe('eco');
  await skipDialogs(page);
  await expect(panelTitle(page)).toHaveText('PRÓLOGO · «ALGUIEN CONTESTÓ»');
  expect(await theme(page)).toBe('pueblo');
  await page.evaluate(() => window.game.uiManager.closeMenu());
  await expectInTown(page);

  // La Torre del Desafío suena con su tema
  await page.evaluate(() => {
    window.game.profile.clearedDungeons = ['bosque_verde', 'cueva_oscura', 'ruta_electrica', 'monte_lunar', 'profundidades_oscuras', 'isla_volcanica', 'laboratorio_final'];
  });
  await page.evaluate(() => window.game.uiManager.openDungeonSelect());
  await option(page, 'Torre del Desafío').click();
  await option(page, '¡En marcha!').click();
  await expect.poll(() => page.evaluate(() => window.game.dungeonId)).toBe('torre_desafio');
  await skipDialogs(page);
  await expectExploring(page);
  expect(await theme(page)).toBe('torre_desafio');

  // Salir al título
  await page.evaluate(() => window.game.changeState('TITLE'));
  await expect(option(page, 'Nueva Partida')).toBeVisible();
  expect(await theme(page)).toBe('titulo');
});
