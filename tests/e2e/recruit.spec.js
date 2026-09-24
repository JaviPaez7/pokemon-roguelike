import {
  test,
  expect,
  panelTitle,
  startInDungeon,
  expectExploring,
  expectInTown,
  dismissDialog,
  skipDialogs,
  dialogText,
} from './fixtures.js';

/** @param {import('@playwright/test').Page} page @param {string} text */
const option = (page, text) => page.locator('#menu-container .menu-option', { hasText: text });

/**
 * Crea un Rattata salvaje en una casilla libre y hace que el líder lo derrote
 * (sin depender de la precisión del golpe). `recruit` fuerza la tirada.
 * @param {import('@playwright/test').Page} page
 * @param {boolean} recruit
 * @returns {Promise<{ id: number, name: string }>}
 */
function leaderDefeatsWild(page, recruit) {
  return page.evaluate((forceRecruit) => {
    const game = window.game;
    const em = game.entityManager;
    const map = game.tileMap;
    let spot = null;
    for (let y = 0; y < map.height && !spot; y++) {
      for (let x = 0; x < map.width && !spot; x++) {
        if (map.isWalkable(x, y) && !map.isStairs(x, y) && em.getEntityAt(x, y, true) === null) spot = { x, y };
      }
    }
    const id = em.createPokemon(19, 3, spot.x, spot.y, true);
    game.turnManager.addEntity(id, em.getComponent(id, 'fighter').speed, false);
    em.getComponent(id, 'fighter').hp = 0;
    const name = em.getComponent(id, 'pokemonInfo').name;
    game.debug.forceRecruit = forceRecruit;
    game.eventBus.emit('pokemon_fainted', { entityId: id, attackerId: game.getPlayerId() });
    return { id, name };
  }, recruit);
}

/** @param {import('@playwright/test').Page} page */
const partyNames = (page) => page.evaluate(() => window.game.party.map((p) => p.name));

/** @param {import('@playwright/test').Page} page @param {number} id */
const exists = (page, id) => page.evaluate((e) => window.game.entityManager.hasComponent(e, 'pokemonInfo'), id);

test('el salvaje que derrota el líder a veces pide unirse, y al aceptar entra en el equipo', async ({ page }) => {
  await startInDungeon(page);
  const before = await partyNames(page);
  const wild = await leaderDefeatsWild(page, true);

  expect(await dialogText(page)).toContain(`¡${wild.name} se ha levantado!`);
  await dismissDialog(page);
  await expect(panelTitle(page)).toHaveText(`¿RECLUTAR A ${wild.name.toUpperCase()}?`);

  // Hay que responder: Escape no cierra la pregunta
  await page.keyboard.press('Escape');
  await expect(panelTitle(page)).toHaveText(`¿RECLUTAR A ${wild.name.toUpperCase()}?`);

  await option(page, 'Sí').click();
  // El diálogo de bienvenida no se borra al volver a exploración
  expect(await dialogText(page)).toContain(`¡${wild.name} se ha unido a vuestro equipo!`);
  await page.waitForTimeout(300);
  await expect(page.locator('.dialog-panel')).toBeVisible();
  await dismissDialog(page);
  await expectExploring(page);

  expect(await partyNames(page)).toEqual([...before, wild.name]);
  expect(await page.evaluate(() => window.game.stats.pokemonCaptured)).toBe(1);
});

test('si se rechaza, el Pokémon se marcha', async ({ page }) => {
  await startInDungeon(page);
  const before = await partyNames(page);
  const wild = await leaderDefeatsWild(page, true);
  await dismissDialog(page);
  await option(page, 'No').click();
  await expectExploring(page);
  expect(await exists(page, wild.id)).toBe(false);
  expect(await partyNames(page)).toEqual(before);
});

test('si no quiere unirse, se debilita sin más', async ({ page }) => {
  await startInDungeon(page);
  const wild = await leaderDefeatsWild(page, false);
  await expect(page.locator('.dialog-panel')).toBeHidden();
  expect(await exists(page, wild.id)).toBe(false);
  await expectExploring(page);
});

test('con el equipo completo, el recluta se va a la base', async ({ page }) => {
  await startInDungeon(page);
  // Completar el equipo (2 + 2)
  for (let i = 0; i < 2; i++) {
    await leaderDefeatsWild(page, true);
    await dismissDialog(page);
    await option(page, 'Sí').click();
    await dismissDialog(page);
  }
  const team = await partyNames(page);
  expect(team).toHaveLength(4);

  const wild = await leaderDefeatsWild(page, true);
  await dismissDialog(page);
  await expect(page.locator('#menu-container')).toContainText('os esperará en la base');
  await option(page, 'Sí').click();
  expect(await dialogText(page)).toContain('Como ya sois cuatro, os esperará en la base.');
  await dismissDialog(page);
  await expectExploring(page);
  expect(await partyNames(page)).toEqual(team);
  expect(await exists(page, wild.id)).toBe(false);

  // Al volver, los cinco están en la plantilla y el equipo sigue siendo el de cuatro
  await page.evaluate(() => window.game.completeDungeon());
  await expect.poll(() => page.evaluate(() => window.game.getState())).toBe('TOWN');
  await skipDialogs(page); // resumen y cierre del capítulo 1
  await expectInTown(page);
  const profile = await page.evaluate(() => ({
    roster: window.game.profile.roster.map((p) => p.name),
    team: window.game.profile.teamUids.length,
  }));
  expect(profile.roster).toHaveLength(5);
  expect(profile.roster.filter((n) => n === wild.name)).toHaveLength(3);
  expect(profile.team).toBe(4);
});
