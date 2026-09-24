import {
  test,
  expect,
  panelTitle,
  openTitleScreen,
  startNewGame,
  startInDungeon,
  findFreeStep,
  dialogText,
} from './fixtures.js';
import credits from '../../src/data/pmd-credits.json' with { type: 'json' };

/** @param {import('@playwright/test').Page} page @param {string} text */
const option = (page, text) => page.locator('#menu-container .menu-option', { hasText: text });

/**
 * Espera (fotograma a fotograma) a que el líder se dibuje con esa animación.
 * @param {import('@playwright/test').Page} page
 * @param {string} name
 */
const leaderAnimation = (page, name) =>
  page.waitForFunction(
    (anim) => window.game.renderer.entityRenderer.animationOf(window.game.getPlayerId()) === anim,
    name,
    { polling: 'raf', timeout: 3000 },
  );

test('los Pokémon se dibujan con los sprites animados de PMDCollab', async ({ page }) => {
  await startInDungeon(page);
  await expect
    .poll(() => page.evaluate(() => window.game.renderer.entityRenderer.pmd.stats()))
    .toMatchObject({ failed: 0 });
  await leaderAnimation(page, 'Idle');

  // Al andar
  const step = await findFreeStep(page);
  await page.keyboard.press(step.key);
  await leaderAnimation(page, 'Walk');
  await leaderAnimation(page, 'Idle');

  // Al atacar a un salvaje que tiene delante
  await page.evaluate(() => {
    const game = window.game;
    const em = game.entityManager;
    const pos = em.getComponent(game.getPlayerId(), 'position');
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const x = pos.x + dx;
      const y = pos.y + dy;
      if (!game.tileMap.isWalkable(x, y) || em.getEntityAt(x, y, true) !== null) continue;
      const id = em.createPokemon(19, 2, x, y, true);
      game.turnManager.addEntity(id, em.getComponent(id, 'fighter').speed, false);
      Object.assign(pos, { facingDx: dx, facingDy: dy, facing: dx > 0 ? 'right' : dx < 0 ? 'left' : dy > 0 ? 'down' : 'up' });
      window.__attackKey = { '1,0': 'ArrowRight', '-1,0': 'ArrowLeft', '0,1': 'ArrowDown', '0,-1': 'ArrowUp' }[`${dx},${dy}`];
      return;
    }
    throw new Error('No hay sitio junto al líder');
  });
  await page.keyboard.press(await page.evaluate(() => window.__attackKey));
  await leaderAnimation(page, 'Attack');

  // Dormido
  await page.evaluate(() => {
    const game = window.game;
    game.entityManager.getComponent(game.getPlayerId(), 'fighter').statusEffects = [{ type: 'sleep', turnsLeft: 3 }];
  });
  await leaderAnimation(page, 'Sleep');
});

test('los vecinos del pueblo hablan con su retrato', async ({ page }) => {
  await startNewGame(page);
  const key = await page.evaluate(() => {
    const game = window.game;
    const em = game.entityManager;
    const pidgey = em.getEntitiesWithComponents('npcTown').find((id) => em.getComponent(id, 'npcTown').id === 'pidgey');
    const p = em.getComponent(pidgey, 'position');
    for (const [dx, dy, k] of [[-1, 0, 'ArrowRight'], [1, 0, 'ArrowLeft'], [0, 1, 'ArrowUp'], [0, -1, 'ArrowDown']]) {
      const x = p.x + dx;
      const y = p.y + dy;
      if (!game.tileMap.isWalkable(x, y) || em.getEntityAt(x, y, true) !== null) continue;
      Object.assign(em.getComponent(game.getPlayerId(), 'position'), { x, y, prevX: x, prevY: y });
      game._updateCamera();
      return k;
    }
    throw new Error('No hay sitio junto a Pidgey');
  });
  await page.keyboard.press(key);
  expect(await dialogText(page)).toContain('El tablón tiene encargos nuevos cada día');
  await expect(page.locator('.dialog-speaker')).toHaveText('Pidgey');
  const portrait = page.locator('.dialog-portrait');
  await expect(portrait).toHaveAttribute('src', /portraits\/0016\/Happy\.png$/);
  await expect.poll(() => portrait.evaluate((img) => img.naturalWidth)).toBe(40);
});

test('el test de personalidad enseña el retrato del Pokémon que te toca', async ({ page }) => {
  await openTitleScreen(page);
  await page.keyboard.press('z'); // Nueva partida
  for (let i = 0; i < 9; i++) await page.keyboard.press('z'); // presentación y respuestas
  const portrait = page.locator('.quiz-portrait');
  await expect(portrait).toHaveAttribute('src', /portraits\/\d{4}\/Happy\.png$/);
  await expect.poll(() => portrait.evaluate((img) => img.naturalWidth)).toBe(40);
});

test('la pantalla de créditos cita a PMDCollab y a sus artistas', async ({ page }) => {
  await openTitleScreen(page);
  await option(page, 'Créditos').click();
  await expect(panelTitle(page)).toHaveText('CRÉDITOS');
  const text = page.locator('#credits-text');
  await expect(text).toContainText('PMDCollab / SpriteCollab');
  await expect(text).toContainText('CHUNSOFT');
  await expect(text).toContainText('CC BY-NC 4.0');
  const named = credits.artists.filter((a) => a !== 'CHUNSOFT' && !a.startsWith('<@'));
  for (const artist of [named[0], named[named.length - 1]]) await expect(text).toContainText(artist);
  await expect(text).not.toContainText('<@');
  await page.keyboard.press('Escape');
  await expect(option(page, 'Nueva Partida')).toBeVisible();
});

test('cada mazmorra tiene su aspecto y unas escaleras nuevas se ven en el mapa', async ({ page }) => {
  await startInDungeon(page);
  expect(await page.evaluate(() => window.game.tileMap.biome.id)).toBe('bosque');

  // Una casilla libre y visible junto al líder
  const spot = await page.evaluate(() => {
    const game = window.game;
    const em = game.entityManager;
    const pos = em.getComponent(game.getPlayerId(), 'position');
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
      const x = pos.x + dx;
      const y = pos.y + dy;
      if (game.tileMap.getTile(x, y).id === 1 && game.tileMap.getVisibility(x, y) === 2
        && em.getEntityAt(x, y, true) === null && em.getItemAt(x, y) == null && em.getTrapAt(x, y) === null) {
        return { x, y };
      }
    }
    throw new Error('No hay casilla libre a la vista');
  });
  // Se lee la capa del mapa (el lienzo del juego puede tener imágenes de otro
  // origen y entonces no deja leer píxeles)
  const pixel = () => page.evaluate(({ x, y }) => {
    const game = window.game;
    const capa = game.renderer.mapRenderer._capa;
    const ts = game.camera.tileSize;
    return Array.from(capa.getContext('2d').getImageData(x * ts + 4, y * ts + 5, 1, 1).data.slice(0, 3));
  }, spot);

  const before = await pixel();
  await page.evaluate(({ x, y }) => {
    window.game.tileMap.setTile(x, y, 3);
    window.game.needsRender = true;
  }, spot);
  // Ahora es escalera: el marrón del tema con el brillo dorado encima (cálido, no verde)
  await expect.poll(pixel).not.toEqual(before);
  const [r, g, b] = await pixel();
  expect(r).toBeGreaterThan(g);
  expect(g).toBeGreaterThan(b);
});
