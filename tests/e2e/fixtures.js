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

/**
 * Semilla de las partidas de los tests: con la misma semilla y las mismas
 * teclas, la partida se repite. `E2E_SEED=123 npm run test:e2e` prueba otra.
 */
export const SEED = Number(process.env.E2E_SEED ?? 20260923);

/**
 * @param {import('@playwright/test').Page} page
 * @param {{ seed?: number }} [options]
 */
export async function openTitleScreen(page, { seed = SEED } = {}) {
  await page.goto(`/?seed=${seed}`);
  await expect(page.locator('.menu-option', { hasText: 'Nueva Partida' })).toBeVisible();
}

/**
 * Nueva aventura solo con el teclado: responde siempre la primera opción del
 * test de personalidad, acepta el Pokémon propuesto y el primer compañero, deja
 * el nombre de equipo por defecto y cierra la bienvenida. Acaba en el pueblo.
 * @param {import('@playwright/test').Page} page
 * @param {{ seed?: number }} [options]
 */
export async function startNewGame(page, options) {
  await openTitleScreen(page, options);
  await page.keyboard.press('z');
  // Con una partida guardada se pide confirmación: empezar otra
  if ((await panelTitle(page).textContent()) === '¿EMPEZAR DE CERO?') {
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('z');
  }
  await expect(panelTitle(page)).toHaveText('UNA NUEVA AVENTURA');
  // Las pantallas del test responden al instante: basta con pulsar (las
  // comprueba una a una exploration.spec.js)
  for (let i = 0; i < 9; i++) await page.keyboard.press('z');
  await expect(panelTitle(page)).toContainText('TU NATURALEZA');
  await page.keyboard.press('z');
  await expect(panelTitle(page)).toHaveText('¿QUIÉN SERÁ TU COMPAÑERO?');
  await page.keyboard.press('z');
  await expect(page.locator('#team-name-input')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('.dialog-panel')).toContainText('Bienvenidos');
  await dismissDialog(page);
  await expectInTown(page);
}

/**
 * Sale del pueblo hacia una mazmorra por el menú de la salida y cierra el
 * diálogo de entrada. Acaba explorando el piso 1.
 * @param {import('@playwright/test').Page} page
 * @param {number} [index=0] - Posición de la mazmorra en la lista de desbloqueadas
 */
export async function enterDungeon(page, index = 0) {
  await page.evaluate(() => window.game.uiManager.openDungeonSelect());
  await expect(panelTitle(page)).toHaveText('¿A DÓNDE VAMOS?');
  for (let i = 0; i < index; i++) await page.keyboard.press('ArrowDown');
  await page.keyboard.press('z');
  await page.keyboard.press('z'); // ¡En marcha!
  await expect(page.locator('.dialog-panel')).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.game.getState())).toBe('EXPLORING');
  await dismissDialog(page);
  await expectExploring(page);
}

/**
 * Nueva aventura y directo al Bosque Verde.
 * @param {import('@playwright/test').Page} page
 * @param {{ seed?: number }} [options]
 */
export async function startInDungeon(page, options) {
  await startNewGame(page, options);
  await enterDungeon(page);
}

/**
 * En el pueblo, sin menús ni diálogos y con el teclado moviendo al líder.
 * @param {import('@playwright/test').Page} page
 */
export async function expectInTown(page) {
  await expect(page.locator('#ui-overlay')).toBeHidden();
  await expect
    .poll(() => gameStatus(page))
    .toEqual({ state: 'TOWN', menu: null, input: 'exploration' });
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
 * Cierra el diálogo visible con Z. Los diálogos animados piden dos pulsaciones
 * (la primera completa el texto), los instantáneos una.
 * @param {import('@playwright/test').Page} page
 */
export async function dismissDialog(page) {
  const dialog = page.locator('.dialog-panel');
  await expect(dialog).toBeVisible();
  for (let i = 0; i < 3 && (await dialog.isVisible()); i++) {
    await page.keyboard.press('z');
  }
  await expect(dialog).toBeHidden();
}

/**
 * Pulsa una tecla de movimiento `times` veces, esperando a que el juego consuma
 * cada una (el juego procesa una acción por fotograma y una pulsación más
 * rápida sustituiría a la anterior en la cola).
 * @param {import('@playwright/test').Page} page
 * @param {string} key
 * @param {number} [times=1]
 */
export async function walk(page, key, times = 1) {
  for (let i = 0; i < times; i++) {
    await page.keyboard.press(key);
    await page.waitForFunction(() => window.game.inputHandler.peekAction() === null);
  }
}

/**
 * Texto completo del diálogo abierto (aunque siga escribiéndose letra a letra).
 * @param {import('@playwright/test').Page} page
 */
export async function dialogText(page) {
  await expect(page.locator('.dialog-panel')).toBeVisible();
  return page.evaluate(() => window.game.uiManager.dialog.dialogTextRaw);
}

/**
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<{ x: number, y: number }>}
 */
export function playerPosition(page) {
  return page.evaluate(() => {
    const game = window.game;
    const { x, y } = game.entityManager.getComponent(game.getPlayerId(), 'position');
    return { x, y };
  });
}

/**
 * Una dirección ortogonal en la que el jugador da un paso normal: suelo
 * transitable, sin escaleras, trampas, objetos ni Pokémon. `null` si no hay.
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<{ key: string, dx: number, dy: number } | null>}
 */
export function findFreeStep(page) {
  return page.evaluate(() => {
    const game = window.game;
    const em = game.entityManager;
    const map = game.tileMap;
    const { x, y } = em.getComponent(game.getPlayerId(), 'position');
    const steps = [
      { key: 'ArrowRight', dx: 1, dy: 0 },
      { key: 'ArrowLeft', dx: -1, dy: 0 },
      { key: 'ArrowDown', dx: 0, dy: 1 },
      { key: 'ArrowUp', dx: 0, dy: -1 },
    ];
    return (
      steps.find(({ dx, dy }) => {
        const tx = x + dx;
        const ty = y + dy;
        return (
          map.isWalkable(tx, ty) &&
          !map.isStairs(tx, ty) &&
          !map.isTrap(tx, ty) &&
          em.getTrapAt(tx, ty) === null &&
          em.getEntityAt(tx, ty, true) === null
        );
      }) ?? null
    );
  });
}

/**
 * Unidades de un objeto en la mochila, sumando todas sus casillas.
 * @param {import('@playwright/test').Page} page
 * @param {string} itemId
 */
export function itemQuantity(page, itemId) {
  return page.evaluate(
    (id) => window.game.inventory.filter((s) => s.itemId === id).reduce((n, s) => n + s.quantity, 0),
    itemId,
  );
}

/**
 * Lo que una partida guardada debe conservar.
 * @param {import('@playwright/test').Page} page
 */
export function runSummary(page) {
  return page.evaluate(() => {
    const game = window.game;
    return {
      state: game.getState(),
      dungeon: game.dungeonId,
      floor: game.getCurrentFloor(),
      coins: game.coins,
      party: game.party.map((p) => ({ name: p.name, level: p.level, hp: p.hp, maxHp: p.maxHp })),
      inventory: game.inventory.map(({ itemId, quantity }) => ({ itemId, quantity })),
      pokedexSeen: [...game.pokedexSeen].sort(),
    };
  });
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
