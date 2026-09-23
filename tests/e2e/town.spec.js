import {
  test,
  expect,
  panelTitle,
  openTitleScreen,
  startNewGame,
  startInDungeon,
  enterDungeon,
  expectInTown,
  dismissDialog,
  dialogText,
  walk,
  playerPosition,
  itemQuantity,
} from './fixtures.js';

/** @param {import('@playwright/test').Page} page @param {string} text */
const option = (page, text) => page.locator('#menu-container .menu-option', { hasText: text });

/** @param {import('@playwright/test').Page} page */
const town = (page) =>
  page.evaluate(() => ({
    coins: window.game.coins,
    bag: window.game.inventory.map((s) => ({ ...s })),
    bank: window.game.profile.bank,
    storage: window.game.profile.storage.map((s) => ({ ...s })),
    day: window.game.profile.day,
    team: window.game.party.map((p) => ({ name: p.name, level: p.level, hp: p.hp, maxHp: p.maxHp })),
    roster: window.game.profile.roster.map((p) => p.name),
    cleared: window.game.profile.clearedDungeons,
    rankPoints: window.game.profile.rankPoints,
  }));

/** Espera a volver al pueblo tras una expedición y devuelve el texto del resumen. */
async function backInTown(page) {
  await expect.poll(() => page.evaluate(() => window.game.getState())).toBe('TOWN');
  const text = await dialogText(page);
  await dismissDialog(page);
  await expectInTown(page);
  return text;
}

test.describe('servicios del pueblo', () => {
  test('chocar con Kecleon abre la tienda y comprar una Manzana cuesta dinero', async ({ page }) => {
    await startNewGame(page);
    // De la plaza (15,10) a la casilla bajo Kecleon (4,16)
    await walk(page, 'ArrowDown', 7);
    await walk(page, 'ArrowLeft', 11);
    await walk(page, 'ArrowUp', 1);
    await expect.poll(() => playerPosition(page)).toEqual({ x: 4, y: 16 });
    const apples = await itemQuantity(page, 'apple');
    const coins = (await town(page)).coins;

    await page.keyboard.press('ArrowUp'); // choca con Kecleon
    await expect(panelTitle(page)).toHaveText('TIENDA KECLEON');
    await option(page, 'Comprar objetos').click();
    const price = Number((await option(page, 'Manzana').textContent()).match(/(\d+) Poké/)[1]);
    await option(page, 'Manzana').click();
    await dismissDialog(page);

    expect(await itemQuantity(page, 'apple')).toBe(apples + 1);
    expect((await town(page)).coins).toBe(coins - price);
  });

  test('Kangaskhan guarda y devuelve objetos', async ({ page }) => {
    await startNewGame(page);
    const before = await town(page);
    const first = before.bag[0];

    await page.evaluate(() => window.game.uiManager.openStorageMenu());
    await option(page, 'Guardar objetos').click();
    await page.locator('#menu-container .menu-option[data-index="0"]').click();
    let now = await town(page);
    expect(now.bag.find((s) => s.itemId === first.itemId)).toBeUndefined();
    expect(now.storage).toEqual([first]);

    await page.keyboard.press('Escape');
    await option(page, 'Sacar objetos').click();
    await page.locator('#menu-container .menu-option[data-index="0"]').click();
    now = await town(page);
    expect(now.storage).toEqual([]);
    expect(now.bag).toContainEqual(first);
  });

  test('Persian: ingresar todo y sacar 100', async ({ page }) => {
    await startNewGame(page);
    await page.evaluate(() => window.game.uiManager.openBankMenu());

    await option(page, 'Ingresar todo').click();
    expect(await town(page)).toMatchObject({ coins: 0, bank: 150 });
    await option(page, 'Sacar 100').click();
    expect(await town(page)).toMatchObject({ coins: 100, bank: 50 });
    await expect(page.locator('#menu-container')).toContainText('Llevas 100 Poké · Ahorrado: 50 Poké');
  });

  test('dormir en la base pasa al día siguiente', async ({ page }) => {
    await startNewGame(page);
    await page.evaluate(() => window.game.uiManager.openBaseMenu());
    await option(page, 'Dormir hasta mañana').click();
    await expect(page.locator('.dialog-panel')).toContainText('Amanece el día 2');
    await dismissDialog(page);
    expect((await town(page)).day).toBe(2);
  });

  test('la salida abre la lista de mazmorras y «Quedarse» aparta al equipo', async ({ page }) => {
    await startNewGame(page);
    await walk(page, 'ArrowDown', 10);

    await expect(panelTitle(page)).toHaveText('¿A DÓNDE VAMOS?');
    await expect(page.locator('#options-list .menu-option')).toHaveCount(2); // Bosque Verde + Quedarse
    await option(page, 'Quedarse en el pueblo').click();

    await expectInTown(page);
    expect(await playerPosition(page)).toEqual({ x: 15, y: 18 });
  });
});

test.describe('expediciones', () => {
  test('con la Cuerda Huida se vuelve al pueblo conservándolo todo', async ({ page }) => {
    await startInDungeon(page);
    await page.evaluate(() => {
      window.game.coins = 999;
    });
    const before = await town(page);

    await page.keyboard.press('x');
    await option(page, 'Cuerda Huida').click();
    await option(page, 'Usar objeto').click();
    await option(page, 'Sí').click();

    const summary = await backInTown(page);
    expect(summary).toContain('Habéis vuelto al pueblo.');
    const after = await town(page);
    expect(after.coins).toBe(999);
    expect(after.bag).toEqual(before.bag.filter((s) => s.itemId !== 'escape_rope'));
    expect(after.day).toBe(2);
  });

  test('si el equipo cae, pierde el dinero y la mochila pero no el banco ni el almacén', async ({ page }) => {
    await startNewGame(page);
    await page.evaluate(() => {
      window.game.profile.bank = 100;
      window.game.profile.storage.push({ itemId: 'potion', quantity: 2 });
    });
    await enterDungeon(page);
    await page.evaluate(() => {
      const game = window.game;
      game.entityManager.getComponent(game.getPlayerId(), 'fighter').hp = 1;
      game.gameOver('combate');
    });

    const summary = await backInTown(page);
    expect(summary).toContain('¡El equipo ha caído!');
    expect(summary).toContain('Se perdieron 150 Poké');
    const after = await town(page);
    expect(after).toMatchObject({ coins: 0, bag: [], bank: 100, storage: [{ itemId: 'potion', quantity: 2 }] });
    // El equipo vuelve curado
    for (const member of after.team) expect(member.hp).toBe(member.maxHp);
  });

  test('completar una mazmorra da puntos de rango y abre la siguiente', async ({ page }) => {
    await startInDungeon(page);
    await page.evaluate(() => window.game.completeDungeon());

    const summary = await backInTown(page);
    expect(summary).toContain('¡Bosque Verde completada!');
    expect(summary).toContain('+50 puntos de rango.');
    expect(summary).toContain('¡El equipo sube a rango Bronce!');
    expect(summary).toContain('Nueva mazmorra: Cueva Oscura.');
    expect(await town(page)).toMatchObject({ cleared: ['bosque_verde'], rankPoints: 50 });

    await page.evaluate(() => window.game.uiManager.openDungeonSelect());
    await expect(option(page, 'Cueva Oscura')).toBeVisible();
    await expect(option(page, 'Bosque Verde')).toContainText('✔');
  });

  test('quien se une en la mazmorra pasa a la base y se puede dejar fuera del equipo', async ({ page }) => {
    await startInDungeon(page);
    const recruit = await page.evaluate(() => {
      const game = window.game;
      const em = game.entityManager;
      const wild = em.getEntitiesWithComponents('pokemonInfo', 'fighter').find((id) => !em.hasComponent(id, 'partyMember'));
      const info = em.getComponent(wild, 'pokemonInfo');
      game.uiManager.openRecruitMenu(wild, info);
      return info.name;
    });
    await page.keyboard.press('z');
    await dismissDialog(page);
    await page.evaluate(() => window.game.completeDungeon());
    await backInTown(page);
    let now = await town(page);
    expect(now.roster).toContain(recruit);
    expect(now.team.map((p) => p.name)).toContain(recruit);

    await page.evaluate(() => window.game.uiManager.openBaseMenu());
    await option(page, 'Formar equipo').click();
    await option(page, recruit).click();
    await option(page, 'Confirmar').click();

    await expectInTown(page);
    now = await town(page);
    expect(now.team).toHaveLength(2);
    expect(now.roster).toContain(recruit);
  });

  test('en la Torre del Desafío se entra a nivel 5 con el kit y al volver todo sigue igual', async ({ page }) => {
    await startNewGame(page);
    await page.evaluate(() => {
      const game = window.game;
      game.profile.clearedDungeons = ['bosque_verde', 'cueva_oscura', 'ruta_electrica', 'monte_lunar', 'profundidades_oscuras', 'isla_volcanica', 'laboratorio_final'];
      game.profile.roster.forEach((p) => { p.level = 30; });
      game.coins = 2222;
    });
    const before = await town(page);

    await enterDungeon(page, 7); // la Torre es la octava de la lista
    const inside = await page.evaluate(() => ({
      dungeon: window.game.dungeonId,
      levels: window.game.party.map((p) => p.level),
      coins: window.game.coins,
      bag: window.game.inventory.map((s) => s.itemId),
    }));
    expect(inside.dungeon).toBe('torre_desafio');
    expect(inside.levels).toEqual([5, 5]);
    expect(inside.coins).toBe(140);
    expect(inside.bag).toContain('escape_rope');

    await page.evaluate(() => window.game.endExpedition('escaped'));
    await backInTown(page);
    const after = await town(page);
    expect(after.coins).toBe(2222);
    expect(after.bag).toEqual(before.bag);
    expect(after.team.map((p) => p.level)).toEqual([30, 30]);
  });
});

test('se puede elegir el protagonista a mano y el compañero no comparte tipo', async ({ page }) => {
  await openTitleScreen(page);
  await page.keyboard.press('z');
  await page.keyboard.press('z');
  for (let i = 0; i < 8; i++) await page.keyboard.press('z');
  await option(page, 'Prefiero elegir yo').click();
  await expect(panelTitle(page)).toHaveText('¿QUIÉN QUIERES SER?');
  await option(page, 'Squirtle').click();

  await expect(panelTitle(page)).toHaveText('¿QUIÉN SERÁ TU COMPAÑERO?');
  await expect(option(page, 'Squirtle')).toHaveCount(0);
  await expect(option(page, 'Psyduck')).toHaveCount(0); // también de agua
  await option(page, 'Charmander').click();
  await page.keyboard.press('Enter');
  await dismissDialog(page);

  await expectInTown(page);
  expect((await town(page)).team.map((p) => p.name)).toEqual(['Squirtle', 'Charmander']);
});
