import {
  test,
  expect,
  panelTitle,
  startNewGame,
  enterDungeon,
  expectExploring,
  expectInTown,
  dismissDialog,
  dialogText,
  itemQuantity,
} from './fixtures.js';

/** @param {import('@playwright/test').Page} page @param {string} text */
const option = (page, text) => page.locator('#menu-container .menu-option', { hasText: text });

/**
 * Añade una misión aceptada en el piso 1 del Bosque Verde.
 * @param {import('@playwright/test').Page} page
 * @param {Partial<import('../../src/core/Missions.js').Mission>} mission
 */
function acceptTestMission(page, mission) {
  return page.evaluate((m) => {
    window.game.profile.missions.accepted.push({
      id: 'test-1',
      dungeonId: 'bosque_verde',
      floor: 1,
      clientSpeciesId: 19,
      clientName: 'Rattata',
      itemId: null,
      difficulty: 'E',
      reward: { money: 200, itemId: 'ether', rankPoints: 10 },
      status: 'accepted',
      ...m,
    });
  }, mission);
}

/**
 * Pone al líder junto a la entidad con ese componente y devuelve la tecla para
 * chocar con ella (o pisarla).
 * @param {import('@playwright/test').Page} page
 * @param {'missionClient' | 'missionItem'} component
 */
function standNextTo(page, component) {
  return page.evaluate((comp) => {
    const game = window.game;
    const em = game.entityManager;
    const [target] = em.getEntitiesWithComponents(comp, 'position');
    const t = em.getComponent(target, 'position');
    const keys = { '1,0': 'ArrowLeft', '-1,0': 'ArrowRight', '0,1': 'ArrowUp', '0,-1': 'ArrowDown' };
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const x = t.x + dx;
      const y = t.y + dy;
      if (!game.tileMap.isWalkable(x, y) || em.getEntityAt(x, y, true) !== null || em.getTrapAt(x, y) !== null) continue;
      const leader = em.getComponent(game.getPlayerId(), 'position');
      Object.assign(leader, { x, y, prevX: x, prevY: y });
      game._updateCamera();
      game._updateFOV();
      return keys[`${dx},${dy}`];
    }
    throw new Error('No hay sitio junto al objetivo');
  }, component);
}

/** Tras cumplir: aceptar volver al pueblo y devolver el resumen. */
async function returnToTown(page) {
  await expect(panelTitle(page)).toHaveText('¡MISIÓN CUMPLIDA!');
  await option(page, 'Volver al pueblo').click();
  await expect.poll(() => page.evaluate(() => window.game.getState())).toBe('TOWN');
  const summary = await dialogText(page);
  await dismissDialog(page);
  await expectInTown(page);
  return summary;
}

test('el tablón ofrece encargos que se aceptan y se abandonan', async ({ page }) => {
  await startNewGame(page);
  await page.evaluate(() => window.game.uiManager.openMissionBoard());
  await expect(panelTitle(page)).toHaveText('TABLÓN DE MISIONES');

  await option(page, 'Encargos del día').click();
  await expect(panelTitle(page)).toHaveText('ENCARGOS DEL DÍA');
  const offered = await page.evaluate(() => window.game.profile.missions.board.length);
  expect(offered).toBeGreaterThan(0);
  await page.locator('#menu-container .menu-option[data-index="0"]').click();
  await expect(page.locator('#menu-container')).toContainText('Recompensa:');
  await option(page, 'Aceptar').click();
  await dismissDialog(page);

  let missions = await page.evaluate(() => window.game.profile.missions);
  expect(missions.accepted).toHaveLength(1);
  expect(missions.board).toHaveLength(offered - 1);

  await page.keyboard.press('Escape'); // lista → menú del tablón
  await option(page, 'Misiones aceptadas').click();
  await page.locator('#menu-container .menu-option[data-index="0"]').click();
  await option(page, 'Abandonar').click();
  await dismissDialog(page);
  missions = await page.evaluate(() => window.game.profile.missions);
  expect(missions.accepted).toHaveLength(0);
});

test('rescate: se cumple hablando con el cliente y se cobra al volver', async ({ page }) => {
  await startNewGame(page);
  await acceptTestMission(page, { type: 'rescue' });
  const coins = await page.evaluate(() => window.game.coins);
  await enterDungeon(page);

  const key = await standNextTo(page, 'missionClient');
  await page.keyboard.press(key);
  expect(await dialogText(page)).toContain('¡Habéis venido a por mí!');
  await dismissDialog(page);

  const summary = await returnToTown(page);
  expect(summary).toContain('¡Misión cumplida! Volvéis al pueblo.');
  expect(summary).toContain('Misión de Rattata: +200 Poké y Éter.');
  expect(summary).toContain('+10 puntos de rango.');
  const after = await page.evaluate(() => ({
    coins: window.game.coins,
    accepted: window.game.profile.missions.accepted.length,
    completed: window.game.profile.missions.completed,
    rankPoints: window.game.profile.rankPoints,
  }));
  expect(after).toEqual({ coins: coins + 200, accepted: 0, completed: 1, rankPoints: 10 });
  expect(await itemQuantity(page, 'ether')).toBe(1);
});

test('buscar objeto: recogerlo cumple la misión y el objeto se entrega al volver', async ({ page }) => {
  await startNewGame(page);
  await acceptTestMission(page, { type: 'find_item', itemId: 'moon_stone', clientName: 'Clefairy', clientSpeciesId: 35 });
  await enterDungeon(page);

  const key = await standNextTo(page, 'missionItem');
  await page.keyboard.press(key);
  expect(await dialogText(page)).toContain('¡Es el Piedra Lunar que perdió Clefairy!');
  await dismissDialog(page);
  expect(await itemQuantity(page, 'moon_stone')).toBe(1);

  const summary = await returnToTown(page);
  expect(summary).toContain('Misión de Clefairy');
  expect(await itemQuantity(page, 'moon_stone')).toBe(0);
});

test('entrega: el cliente se queda el objeto y la misión se cumple', async ({ page }) => {
  await startNewGame(page);
  await acceptTestMission(page, { type: 'deliver', itemId: 'apple', reward: { money: 90, itemId: null, rankPoints: 10 } });
  const apples = await itemQuantity(page, 'apple');
  await enterDungeon(page);

  const key = await standNextTo(page, 'missionClient');
  await page.keyboard.press(key);
  expect(await dialogText(page)).toContain('¡Mi Manzana!');
  await dismissDialog(page);
  expect(await itemQuantity(page, 'apple')).toBe(apples - 1);

  const summary = await returnToTown(page);
  expect(summary).toContain('Misión de Rattata: +90 Poké.');
});

test('si el equipo cae tras cumplir una misión, vuelve a quedar pendiente', async ({ page }) => {
  await startNewGame(page);
  await acceptTestMission(page, { type: 'rescue' });
  await enterDungeon(page);
  const key = await standNextTo(page, 'missionClient');
  await page.keyboard.press(key);
  await dismissDialog(page);
  await option(page, 'Seguir explorando').click();
  await expectExploring(page);

  await page.evaluate(() => window.game.gameOver('combate'));
  await expect.poll(() => page.evaluate(() => window.game.getState())).toBe('TOWN');
  expect(await dialogText(page)).toContain('queda pendiente');
  await dismissDialog(page);
  const accepted = await page.evaluate(() => window.game.profile.missions.accepted);
  expect(accepted).toHaveLength(1);
  expect(accepted[0].status).toBe('accepted');
});

test('al cargar una partida en el piso de la misión, el cliente vuelve a estar', async ({ page }) => {
  await startNewGame(page);
  await acceptTestMission(page, { type: 'rescue' });
  await enterDungeon(page);
  await page.evaluate(() => window.game.saveGameData());

  await page.reload();
  await option(page, 'Continuar partida').click();
  await dismissDialog(page);
  await expectExploring(page);

  const clients = await page.evaluate(() => window.game.entityManager.getEntitiesWithComponents('missionClient').length);
  expect(clients).toBe(1);
});
