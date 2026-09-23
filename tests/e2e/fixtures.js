import { test as base, expect } from '@playwright/test';

export { expect };

// PNG transparente de 1×1 para responder a las imágenes externas.
const EMPTY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64',
);

/**
 * `test` con dos garantías para todos los specs:
 * - Las peticiones a otros dominios (Google Fonts, sprites de PokeAPI) se
 *   responden en local con contenido vacío, para que los tests no dependan de
 *   la red. Abortarlas no vale: Chrome lo registra como error de consola.
 * - Cualquier `console.error` o excepción no capturada hace fallar el test. El bug
 *   del menú de pausa solo asomaba así: el EventBus se tragaba el RangeError.
 *   Un test que espere un error concreto lo comprueba y lo retira de `pageErrors`.
 */
export const test = base.extend({
  page: async ({ page, baseURL }, use) => {
    const origin = new URL(baseURL).origin;
    await page.route(
      (url) => url.origin !== origin,
      (route) =>
        route.request().resourceType() === 'image'
          ? route.fulfill({ contentType: 'image/png', body: EMPTY_PNG })
          : route.fulfill({ contentType: 'text/css', body: '' }),
    );
    await use(page);
  },

  pageErrors: [
    async ({ page }, use) => {
      /** @type {string[]} */
      const errors = [];
      page.on('console', (msg) => {
        if (msg.type() === 'error') errors.push(msg.text());
      });
      page.on('pageerror', (err) => errors.push(`${err.name}: ${err.message}`));
      await use(errors);
      expect(errors, 'la página no debe registrar errores').toEqual([]);
    },
    { auto: true },
  ],
});

/**
 * Estado del juego visto desde fuera: máquina de estados, menú abierto y
 * contexto de entrada. Usa `window.game`, que `main.js` expone.
 * @param {import('@playwright/test').Page} page
 */
export function gameStatus(page) {
  return page.evaluate(() => ({
    state: window.game.getState(),
    menu: window.game.uiManager.currentMenuType,
    input: window.game.inputHandler._context,
  }));
}

/** @param {import('@playwright/test').Page} page */
export function panelTitle(page) {
  return page.locator('#menu-container .game-panel-title').first();
}

/** @param {import('@playwright/test').Page} page */
export async function openTitleScreen(page) {
  await page.goto('/');
  await expect(page.locator('.menu-option', { hasText: 'Nueva Partida' })).toBeVisible();
}

/**
 * Nueva partida con el primer inicial (Bulbasaur), usando solo el teclado,
 * y con el diálogo de bienvenida ya cerrado.
 * @param {import('@playwright/test').Page} page
 */
export async function startNewGame(page) {
  await openTitleScreen(page);
  await page.keyboard.press('z');
  await expect(panelTitle(page)).toHaveText('ELIGE TU COMPAÑERO INICIAL');
  await page.keyboard.press('z');
  await expect(page.locator('.dialog-panel')).toContainText('¡Bienvenido a PokéRogue!');
  await page.keyboard.press('z');
  await expectExploring(page);
}

/**
 * Sin menús ni diálogos abiertos y con el teclado moviendo al jugador.
 * @param {import('@playwright/test').Page} page
 */
export async function expectExploring(page) {
  await expect(page.locator('#ui-overlay')).toBeHidden();
  await expect
    .poll(() => gameStatus(page))
    .toEqual({ state: 'EXPLORING', menu: null, input: 'exploration' });
}

/**
 * Registra en la página cada `state_changed` emitido a partir de ahora.
 * Se leen con `stateChanges(page)`.
 * @param {import('@playwright/test').Page} page
 */
export async function recordStateChanges(page) {
  await page.evaluate(() => {
    window.__stateChanges = [];
    window.game.eventBus.on('state_changed', ({ state }) => window.__stateChanges.push(state));
  });
}

/**
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<string[]>}
 */
export function stateChanges(page) {
  return page.evaluate(() => window.__stateChanges.splice(0));
}
