// El piso que ve el jugador frente al global. La Cueva Oscura va de los pisos
// globales 6 a 10: por dentro, el global decide zona, enemigos y jefe, pero lo
// que se lee (escaleras, menús) y las reglas del primer piso van por el de la
// mazmorra, del 1 al 5.
import { test, expect, startNewGame, enterDungeon, expectExploring } from './fixtures.js';

/** @param {import('@playwright/test').Page} page */
const floors = (page) =>
  page.evaluate(() => ({ dungeonId: window.game.dungeonId, floor: window.game.getCurrentFloor(), global: window.game._currentFloor }));

/** @param {import('@playwright/test').Page} page @returns {Promise<string>} */
const log = (page) => page.evaluate(() => window.game._messageLog.join('\n'));

/**
 * Pasa los diálogos que haya (según la semilla, un piso puede traer un evento o
 * una escena) hasta volver a explorar.
 * @param {import('@playwright/test').Page} page
 */
async function skipAnyDialogs(page) {
  for (let i = 0; i < 100 && (await page.locator('.dialog-panel').isVisible()); i++) await page.keyboard.press('z');
  await expectExploring(page);
}

/**
 * Pone unas escaleras en una casilla libre junto al líder, lo gira hacia ellas
 * y las examina con Z (sin gastar turno). Devuelve lo que dice el registro y
 * la tecla que da el paso hasta ellas.
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<{ text: string, key: string }>}
 */
async function examineStairsAhead(page) {
  const key = await page.evaluate(() => {
    const game = window.game;
    const em = game.entityManager;
    const map = game.tileMap;
    const pos = em.getComponent(game.getPlayerId(), 'position');
    // Z recoge antes lo que haya bajo los pies
    const underfoot = em.getItemAt(pos.x, pos.y);
    if (underfoot != null) em.destroyEntity(underfoot);
    for (const [dx, dy, key] of [[1, 0, 'ArrowRight'], [-1, 0, 'ArrowLeft'], [0, 1, 'ArrowDown'], [0, -1, 'ArrowUp']]) {
      const x = pos.x + dx;
      const y = pos.y + dy;
      if (map.getTile(x, y)?.id !== 1 || map.isTrap(x, y) || em.getTrapAt(x, y) !== null) continue;
      if (em.getEntityAt(x, y, true) !== null || em.getItemAt(x, y) != null) continue;
      map.setTile(x, y, 3);
      Object.assign(pos, { facingDx: dx, facingDy: dy, facing: key.slice(5).toLowerCase() });
      game._messageLog = [];
      return key;
    }
    throw new Error('No hay casilla libre junto al líder');
  });
  await page.keyboard.press('z');
  const stairs = () => page.evaluate(() => window.game._messageLog.find((m) => m.startsWith('Escaleras')) ?? null);
  await expect.poll(stairs).not.toBeNull();
  return { text: await stairs(), key };
}

test('en la Cueva Oscura, las escaleras, su menú y los consejos van por el piso de la mazmorra', async ({ page }) => {
  await startNewGame(page);
  await page.evaluate(() => {
    window.game.profile.clearedDungeons = ['bosque_verde'];
  });
  await enterDungeon(page, 1);
  expect(await floors(page)).toEqual({ dungeonId: 'cueva_oscura', floor: 1, global: 6 });
  // El primer piso no trae consejo (el piso global 6 es par: antes salía)
  expect(await log(page)).not.toContain('Consejo:');

  // Examinar: al piso 2, no al 7
  const { text, key } = await examineStairsAhead(page);
  expect(text).toMatch(/^Escaleras al piso 2\. (Quedan \d+ salvajes\.|Zona despejada\.)$/);

  // Pisarlas: el menú de bajar también habla de los pisos de la mazmorra
  await page.keyboard.press(key);
  await expect(page.locator('#menu-container .game-panel-title')).toHaveText('¿Bajar las escaleras?');
  await expect(page.locator('#menu-container')).toContainText('Piso 1 → Piso 2');
  await expect(page.locator('#menu-container')).toContainText('Cueva Oscura: piso 2/5');
  await page.evaluate(() => {
    window.game._messageLog = [];
  });
  await page.keyboard.press('z'); // Sí, bajar
  // El cambio de piso deshabilita el teclado hasta que acaba
  await expect.poll(() => page.evaluate(() => window.game.inputHandler.enabled && window.game.getCurrentFloor())).toBe(2);
  expect(await floors(page)).toEqual({ dungeonId: 'cueva_oscura', floor: 2, global: 7 });
  await skipAnyDialogs(page);
  // El consejo va en los pisos pares de la mazmorra (el global 7 es impar)
  expect(await log(page)).toContain('Consejo:');
  expect((await examineStairsAhead(page)).text).toMatch(/^Escaleras al piso 3\./);

  // En el último piso, las escaleras sacan de la mazmorra
  await page.evaluate(async () => {
    const game = window.game;
    game._currentFloor = game.dungeon.floors[1] - 1;
    await game.floorManager.changeFloor('down');
  });
  await skipAnyDialogs(page);
  expect(await floors(page)).toEqual({ dungeonId: 'cueva_oscura', floor: 5, global: 10 });
  expect((await examineStairsAhead(page)).text).toMatch(/^Escaleras de salida de la mazmorra\./);
});
