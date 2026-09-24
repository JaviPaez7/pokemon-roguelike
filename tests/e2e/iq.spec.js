import {
  test,
  expect,
  panelTitle,
  startInDungeon,
  expectExploring,
  dismissDialog,
  findFreeStep,
  walk,
} from './fixtures.js';

/** @param {import('@playwright/test').Page} page @param {string} text */
const option = (page, text) => page.locator('#menu-container .menu-option', { hasText: text });

/** @param {import('@playwright/test').Page} page */
const log = (page) => page.evaluate(() => window.game._messageLog.join('\n'));

/** @param {import('@playwright/test').Page} page */
const leader = (page) => page.evaluate(() => {
  const game = window.game;
  const info = game.entityManager.getComponent(game.getPlayerId(), 'pokemonInfo');
  return { name: info.name, types: info.types, iq: info.iq || 0 };
});

test('una gominola sube el CI, enseña una habilidad y se guarda con la partida', async ({ page }) => {
  await startInDungeon(page);
  await page.evaluate(() => window.game.inventory.push({ itemId: 'red_gummi', quantity: 1 }));
  const before = await leader(page);
  const gained = before.types.includes('fire') ? 5 : 2;

  await page.keyboard.press('x');
  await option(page, 'Gominola Roja').click();
  await option(page, 'Usar objeto').click();
  await option(page, before.name).click();
  await expect.poll(() => leader(page).then((l) => l.iq)).toBe(gained);
  const text = await log(page);
  expect(text).toContain(`CI +${gained} (${gained}).`);
  // 5 de CI basta para Ojo Trampas; 2 no
  if (gained >= 5) expect(text).toContain(`¡${before.name} aprendió la habilidad de CI Ojo Trampas!`);

  await expectExploring(page);
  await page.keyboard.press('c');
  await expect(panelTitle(page)).toHaveText('EQUIPO POKÉMON');
  await option(page, before.name).click();
  await expect(page.locator('#menu-container')).toContainText(`CI: ${gained}`);

  await page.evaluate(() => window.game.saveGameData());
  await page.reload();
  await option(page, 'Continuar partida').click();
  await dismissDialog(page);
  await expectExploring(page);
  expect((await leader(page)).iq).toBe(gained);
});

test('con Ojo Trampas se ven las trampas ocultas que hay a la vista', async ({ page }) => {
  await startInDungeon(page);
  const step = await findFreeStep(page);
  // Una trampa oculta a la vista, lejos del camino
  const trapId = await page.evaluate(({ dx, dy }) => {
    const game = window.game;
    const em = game.entityManager;
    const { x, y } = em.getComponent(game.getPlayerId(), 'position');
    for (let r = 2; r <= 4; r++) {
      for (const [ox, oy] of [[r, 0], [-r, 0], [0, r], [0, -r], [r, r], [-r, -r]]) {
        const tx = x + ox; const ty = y + oy;
        if (ox === dx && oy === dy) continue;
        if (game.tileMap.isWalkable(tx, ty) && game.tileMap.getVisibility(tx, ty) === 2 && em.getEntityAt(tx, ty, true) === null && em.getTrapAt(tx, ty) === null && !game.tileMap.isStairs(tx, ty)) {
          return em.createTrapEntity('poison', tx, ty, true);
        }
      }
    }
    throw new Error('No hay casilla libre a la vista');
  }, step);
  const hidden = () => page.evaluate((id) => window.game.entityManager.getComponent(id, 'trap').isHidden, trapId);

  // Sin la habilidad, sigue oculta al moverse
  await walk(page, step.key);
  expect(await hidden()).toBe(true);

  await page.evaluate(() => {
    const game = window.game;
    game.entityManager.getComponent(game.getPlayerId(), 'pokemonInfo').iq = 5;
  });
  const back = { ArrowRight: 'ArrowLeft', ArrowLeft: 'ArrowRight', ArrowUp: 'ArrowDown', ArrowDown: 'ArrowUp' }[step.key];
  await walk(page, back);
  expect(await hidden()).toBe(false);
  expect(await log(page)).toContain('ha visto una trampa! (Ojo Trampas)');
});
