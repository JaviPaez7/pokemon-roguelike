import {
  test,
  expect,
  panelTitle,
  openTitleScreen,
  startNewGame,
  startInDungeon,
  enterDungeon,
  expectInTown,
  expectExploring,
  dismissDialog,
  dialogText,
  walk,
  playerPosition,
  itemQuantity,
  skipDialogs,
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

/**
 * Espera a volver al pueblo tras una expedición y devuelve el texto del
 * resumen. Pasa también la escena de la historia que venga detrás.
 */
async function backInTown(page) {
  await expect.poll(() => page.evaluate(() => window.game.getState())).toBe('TOWN');
  const text = await dialogText(page);
  await skipDialogs(page);
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
    // La primera vez en el capítulo saluda antes de abrir la tienda
    expect(await dialogText(page)).toContain('hoy no se fía');
    await expect(page.locator('.dialog-speaker')).toHaveText('Kecleon');
    await dismissDialog(page);
    await expect(panelTitle(page)).toHaveText('TIENDA KECLEON');
    await option(page, 'Comprar objetos').click();
    // Solo la Manzana (no la Manzana Grande, que puede estar entre los extras del día)
    const apple = page.locator('#menu-container .menu-option', { hasText: /Manzana\s*\d+ Poké/ });
    const price = Number((await apple.textContent()).match(/(\d+) Poké/)[1]);
    await apple.click();
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
  await skipDialogs(page);

  await expectInTown(page);
  expect((await town(page)).team.map((p) => p.name)).toEqual(['Squirtle', 'Charmander']);
});

test('el líder y la táctica que se cambian en el pueblo se guardan y valen para la expedición', async ({ page }) => {
  await startNewGame(page);
  const { hero, partner } = await page.evaluate(() => {
    const { roster, heroUid, partnerUid } = window.game.profile;
    const name = (uid) => roster.find((m) => m.uid === uid).name;
    return { hero: { uid: heroUid, name: name(heroUid) }, partner: { uid: partnerUid, name: name(partnerUid) } };
  });

  // El compañero pasa a liderar y el protagonista se queda esperando
  await page.keyboard.press('c');
  await expect(panelTitle(page)).toHaveText('EQUIPO POKÉMON');
  await option(page, partner.name).first().click();
  await option(page, 'Establecer como Líder').click();
  await dismissDialog(page);
  await option(page, hero.name).first().click();
  await option(page, 'Cambiar táctica').click();
  await option(page, 'Esperar ahí').click();
  await dismissDialog(page);
  const saved = () =>
    page.evaluate((heroUid) => {
      const { teamUids, roster } = window.game.profile;
      return { leader: teamUids[0], heroTactic: roster.find((m) => m.uid === heroUid).tactic };
    }, hero.uid);
  expect(await saved()).toEqual({ leader: partner.uid, heroTactic: 'stay' });

  // Se guarda: al recargar sigue igual
  await page.reload();
  await option(page, 'Continuar partida').click();
  await dismissDialog(page);
  await expectInTown(page);
  const inTown = () =>
    page.evaluate(() => {
      const game = window.game;
      const em = game.entityManager;
      const tactics = game.party.map((p) => em.getComponent(p.id, 'partyMember').tactic);
      return { leader: game.party[0].name, tactics };
    });
  expect(await inTown()).toEqual({ leader: partner.name, tactics: ['follow', 'stay'] });

  // Y la expedición sale con ese líder; al volver, el orden se conserva
  await enterDungeon(page);
  expect(await inTown()).toEqual({ leader: partner.name, tactics: ['follow', 'stay'] });
  await page.evaluate(() => window.game.endExpedition('escaped'));
  await backInTown(page);
  expect(await saved()).toEqual({ leader: partner.uid, heroTactic: 'stay' });
});

test('un cambio de líder en la mazmorra dura solo esa expedición', async ({ page }) => {
  await startInDungeon(page);
  const { heroUid, partnerUid } = await page.evaluate(() => window.game.profile);
  const leaderUid = () =>
    page.evaluate(() => window.game.entityManager.getComponent(window.game.getPlayerId(), 'partyMember').uid);
  expect(await leaderUid()).toBe(heroUid);

  await page.keyboard.press('Tab');
  await expect.poll(leaderUid).toBe(partnerUid);
  await expectExploring(page);

  await page.evaluate(() => window.game.endExpedition('escaped'));
  await backInTown(page);
  expect(await page.evaluate(() => window.game.profile.teamUids)).toEqual([heroUid, partnerUid]);
  expect(await leaderUid()).toBe(heroUid);
});

test('una evolución hecha desde el equipo en el pueblo se guarda y vale para la expedición', async ({ page }) => {
  await startNewGame(page);
  // Un miembro que evoluciona por nivel, ya a ese nivel y con la evolución
  // rechazada en la mazmorra: así queda su ficha en la plantilla al volver
  const target = await page.evaluate(() => {
    const game = window.game;
    const { profile } = game;
    const levelEvo = (m) => game.evolutionsData.find((e) => e.from === m.speciesId && e.trigger === 'level');
    const member = profile.teamUids.map((uid) => profile.roster.find((m) => m.uid === uid)).find(levelEvo);
    if (!member) return null;
    const evo = levelEvo(member);
    Object.assign(member, { level: evo.level, evolutionDeclinedAtLevel: evo.level });
    game.saveGameData();
    return { uid: member.uid, name: member.name, to: evo.to, toName: game.pokemonData.find((p) => p.id === evo.to).name };
  });
  expect(target, 'el protagonista o el compañero de la partida de prueba evoluciona por nivel').not.toBeNull();
  const continueGame = async () => {
    await page.reload();
    await option(page, 'Continuar partida').click();
    await dismissDialog(page);
    await expectInTown(page);
  };
  await continueGame();

  // Equipo → el Pokémon → Intentar evolucionar → Sí
  await page.keyboard.press('c');
  await expect(panelTitle(page)).toHaveText('EQUIPO POKÉMON');
  await option(page, target.name).first().click();
  await option(page, 'Intentar evolucionar').click();
  await expect(panelTitle(page)).toHaveText('¡EVOLUCIÓN!');
  await option(page, 'Sí').click();
  expect(await dialogText(page)).toContain(`evolucionó a ${target.toName}`);
  await skipDialogs(page);
  await expectInTown(page);

  const inProfile = () =>
    page.evaluate((uid) => {
      const { speciesId, name } = window.game.profile.roster.find((m) => m.uid === uid);
      return { speciesId, name };
    }, target.uid);
  const evolved = { speciesId: target.to, name: target.toName };
  expect(await inProfile()).toEqual(evolved);

  // Se guarda: al recargar sigue evolucionado, en la plantilla y en el pueblo
  await continueGame();
  expect(await inProfile()).toEqual(evolved);
  expect((await town(page)).team.map((p) => p.name)).toContain(target.toName);

  // Y la expedición sale con él evolucionado
  await enterDungeon(page);
  expect((await town(page)).team.map((p) => p.name)).toContain(target.toName);
});

/**
 * El compañero y el primer movimiento suyo que golpea al de al lado (para
 * poder usarlo a mano cuando lidere).
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<{ uid: number, name: string, index: number, moveId: number, moveName: string }>}
 */
const partnerMove = (page) =>
  page.evaluate(() => {
    const game = window.game;
    const { roster, partnerUid } = game.profile;
    const partner = roster.find((m) => m.uid === partnerUid);
    const moveOf = (slot) => game.movesData.find((m) => m.id === slot?.moveId);
    const index = partner.currentMoves.findIndex((s) => moveOf(s)?.power > 0 && (moveOf(s).range ?? 'front') === 'front');
    const slot = partner.currentMoves[index];
    return { uid: partnerUid, name: partner.name, index, moveId: slot?.moveId, moveName: moveOf(slot)?.name };
  });

/**
 * Si el movimiento está reservado en la plantilla y en el Pokémon en juego.
 * @param {import('@playwright/test').Page} page
 * @param {{ uid: number, moveId: number }} target
 */
const reservedIn = (page, { uid, moveId }) =>
  page.evaluate(({ uid, moveId }) => {
    const game = window.game;
    const slotIn = (member) => member?.currentMoves.find((s) => s && s.moveId === moveId);
    return {
      roster: !!slotIn(game.profile.roster.find((m) => m.uid === uid))?.reserved,
      inPlay: !!slotIn(game.party.find((p) => p.uid === uid))?.reserved,
    };
  }, { uid, moveId });

/**
 * Equipo → el Pokémon → Ver movimientos → Z en el movimiento (lo reserva o lo
 * deja libre) y cierra los menús.
 * @param {import('@playwright/test').Page} page
 * @param {{ name: string, moveName: string }} target
 * @param {'USAR' | 'RESERVAR'} expected - Lo que debe poner después
 */
async function toggleReserve(page, target, expected) {
  await page.keyboard.press('c');
  await expect(panelTitle(page)).toHaveText('EQUIPO POKÉMON');
  await option(page, target.name).first().click();
  await option(page, 'Ver movimientos').click();
  await expect(panelTitle(page)).toHaveText(`MOVIMIENTOS DE ${target.name.toUpperCase()}`);
  await option(page, target.moveName).click();
  await expect(option(page, target.moveName)).toContainText(expected);
  await page.evaluate(() => window.game.uiManager.closeMenu());
  await page.mouse.move(0, 0);
}

/**
 * Deja en el piso un solo salvaje, al lado de un Pokémon del equipo, con
 * muchos PS y sin fuerza, y apunta desde ahora los movimientos que usa ese
 * Pokémon (en `window.__movesUsed`; -1 es el ataque básico).
 * @param {import('@playwright/test').Page} page
 * @param {number} uid
 */
async function wildNextTo(page, uid) {
  const placed = await page.evaluate((uid) => {
    const game = window.game;
    const em = game.entityManager;
    for (const id of em.getEntitiesWithComponents('aiControlled', 'fighter')) {
      if (em.hasComponent(id, 'partyMember')) continue;
      game.turnManager.removeEntity(id);
      em.destroyEntity(id);
    }
    const allyId = game.party.find((p) => p.uid === uid).id;
    const { x, y } = em.getComponent(allyId, 'position');
    const spot = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]]
      .map(([dx, dy]) => ({ x: x + dx, y: y + dy }))
      .find((p) => game.tileMap.isWalkable(p.x, p.y) && !game.tileMap.isStairs(p.x, p.y)
        && em.getEntityAt(p.x, p.y, true) === null && em.getTrapAt(p.x, p.y) === null);
    if (!spot) return false;
    const wild = em.createPokemon(19, 5, spot.x, spot.y, true);
    Object.assign(em.getComponent(wild, 'fighter'), { hp: 999, maxHp: 999, attack: 1, spAtk: 1 });
    game.turnManager.addEntity(wild, em.getComponent(wild, 'fighter').speed, false);
    window.__movesUsed = [];
    window.__watchedId = allyId;
    if (!window.__watchingMoves) {
      window.__watchingMoves = true;
      game.eventBus.on('move_used', ({ attackerId, moveId }) => {
        if (attackerId === window.__watchedId) window.__movesUsed.push(moveId);
      });
    }
    return true;
  }, uid);
  expect(placed, 'hay una casilla libre junto al Pokémon').toBe(true);
}

/**
 * Pasa `turns` turnos con Espacio, uno a uno.
 * @param {import('@playwright/test').Page} page
 * @param {number} turns
 */
async function waitTurns(page, turns) {
  for (let i = 0; i < turns; i++) {
    const before = await page.evaluate(() => window.game.stats.turnsPlayed);
    await page.keyboard.press('Space');
    await expect.poll(() => page.evaluate(() => window.game.stats.turnsPlayed)).toBeGreaterThan(before);
  }
}

/**
 * PP del movimiento en el Pokémon en juego.
 * @param {import('@playwright/test').Page} page
 * @param {{ uid: number, moveId: number }} target
 */
const ppOf = (page, { uid, moveId }) =>
  page.evaluate(
    ({ uid, moveId }) => window.game.party.find((p) => p.uid === uid).currentMoves.find((s) => s.moveId === moveId).currentPP,
    { uid, moveId },
  );

test('un movimiento reservado en el pueblo dura: la IA no lo usa, el líder sí, y sigue al volver y al recargar', async ({ page }) => {
  await startNewGame(page);
  const target = await partnerMove(page);
  expect(target.moveName, 'el compañero tiene un movimiento que golpea al de al lado').toBeTruthy();

  await toggleReserve(page, target, 'RESERVAR');
  await expectInTown(page);
  expect(await reservedIn(page, target)).toEqual({ roster: true, inPlay: true });

  // Sale de expedición reservado
  await enterDungeon(page);
  expect(await reservedIn(page, target)).toEqual({ roster: true, inPlay: true });

  // La IA no lo usa aunque sea lo único con PP: ataca sin movimiento
  await page.evaluate(({ uid, moveId }) => {
    const member = window.game.party.find((p) => p.uid === uid);
    for (const slot of member.currentMoves) if (slot.moveId !== moveId) slot.currentPP = 0;
  }, target);
  const fullPP = await ppOf(page, target);
  await wildNextTo(page, target.uid);
  await waitTurns(page, 6);
  const used = await page.evaluate(() => window.__movesUsed);
  expect(used.length, 'el compañero ha atacado').toBeGreaterThan(0);
  expect(used.every((id) => id === -1)).toBe(true);
  expect(await ppOf(page, target)).toBe(fullPP);

  // Como líder sí lo puede usar a mano: no está anulado
  await page.keyboard.press('Tab');
  await expect.poll(() => page.evaluate(() => window.game.party.find((p) => p.isLeader).uid)).toBe(target.uid);
  await wildNextTo(page, target.uid);
  await page.keyboard.press(String(target.index + 1));
  await expect.poll(() => ppOf(page, target)).toBe(fullPP - 1);
  expect(await page.evaluate(() => window.__movesUsed)).toEqual([target.moveId]);

  // Vuelve reservado a la plantilla y al pueblo, y así se guarda
  await page.evaluate(() => window.game.endExpedition('escaped'));
  await backInTown(page);
  expect(await reservedIn(page, target)).toEqual({ roster: true, inPlay: true });
  await page.reload();
  await option(page, 'Continuar partida').click();
  await dismissDialog(page);
  await expectInTown(page);
  expect(await reservedIn(page, target)).toEqual({ roster: true, inPlay: true });
});

test('un movimiento reservado en la mazmorra dura al guardar, al cambiar de piso y al volver', async ({ page }) => {
  await startInDungeon(page);
  const target = await partnerMove(page);
  expect(target.moveName, 'el compañero tiene un movimiento que golpea al de al lado').toBeTruthy();

  await toggleReserve(page, target, 'RESERVAR');
  await expectExploring(page);
  // En la mazmorra se apunta en el Pokémon; la plantilla se pone al día al volver
  expect(await reservedIn(page, target)).toEqual({ roster: false, inPlay: true });

  // Guardar y cargar
  await page.evaluate(() => window.game.saveGameData());
  await page.reload();
  await option(page, 'Continuar partida').click();
  await dismissDialog(page);
  await expectExploring(page);
  expect((await reservedIn(page, target)).inPlay).toBe(true);

  // Otro piso
  await page.evaluate(() => window.game.floorManager.changeFloor('down'));
  await expect.poll(() => page.evaluate(() => window.game.getCurrentFloor())).toBe(2);
  expect((await reservedIn(page, target)).inPlay).toBe(true);

  // Al volver pasa a la plantilla
  await page.evaluate(() => window.game.endExpedition('escaped'));
  await backInTown(page);
  expect(await reservedIn(page, target)).toEqual({ roster: true, inPlay: true });

  // Y en el pueblo se puede dejar libre otra vez
  await toggleReserve(page, target, 'USAR');
  await expectInTown(page);
  expect(await reservedIn(page, target)).toEqual({ roster: false, inPlay: false });
});
