import {
  test,
  expect,
  panelTitle,
  startNewGame,
  enterDungeon,
  expectExploring,
  expectInTown,
  dismissDialog,
  skipDialogs,
  dialogText,
  walk,
} from './fixtures.js';

/** @param {import('@playwright/test').Page} page @param {string} text */
const option = (page, text) => page.locator('#menu-container .menu-option', { hasText: text });

const ESCORT = {
  id: 'e2e-escolta',
  type: 'escort',
  dungeonId: 'bosque_verde',
  floor: 2,
  clientSpeciesId: 43,
  clientName: 'Oddish',
  itemId: null,
  difficulty: 'E',
  reward: { money: 220, itemId: 'ether', rankPoints: 12 },
  reason: 'Su abuela vive allí y hace unas tortas de baya de otro mundo.',
};

const OUTLAW = {
  id: 'e2e-forajido',
  type: 'outlaw',
  dungeonId: 'bosque_verde',
  floor: 1,
  clientSpeciesId: 13,
  clientName: 'Weedle',
  itemId: null,
  difficulty: 'E',
  reward: { money: 290, itemId: null, rankPoints: 15 },
  crime: 'Pintó bigotes en todos los carteles del tablón. Pidgey no le habla.',
};

/**
 * Pone un encargo en el tablón de hoy y lo acepta desde el menú. Acaba en el pueblo.
 * @param {import('@playwright/test').Page} page
 * @param {Object} mission
 * @param {{ details: string, accepted: string }} expected - Textos del detalle y del diálogo de aceptar
 */
async function acceptOnBoard(page, mission, expected) {
  await page.evaluate((m) => {
    const missions = window.game.profile.missions;
    missions.day = window.game.profile.day; // que el tablón no se renueve al abrirlo
    missions.board = [{ ...m, status: 'open' }];
  }, mission);
  await page.evaluate(() => window.game.uiManager.openMissionBoard());
  await option(page, 'Encargos del día').click();
  await expect(panelTitle(page)).toHaveText('ENCARGOS DEL DÍA');
  await page.locator('#menu-container .menu-option[data-index="0"]').click();
  await expect(page.locator('#menu-container')).toContainText(expected.details);
  await option(page, 'Aceptar').click();
  expect(await dialogText(page)).toBe(expected.accepted);
  // Sin más encargos, el tablón lo dice y vuelve a su menú
  await skipDialogs(page);
  await expect(panelTitle(page)).toHaveText('TABLÓN DE MISIONES');
  await page.keyboard.press('Escape');
  await expectInTown(page);
  // Que el ratón, quieto sobre el tablón, no elija nada en el siguiente menú
  await page.mouse.move(0, 0);
  const accepted = await page.evaluate(() => window.game.profile.missions.accepted);
  expect(accepted).toEqual([expect.objectContaining({ id: mission.id, status: 'accepted' })]);
}

/**
 * Acepta un encargo sin pasar por el tablón (para los tests que no lo prueban).
 * @param {import('@playwright/test').Page} page
 * @param {Object} mission
 */
function acceptDirectly(page, mission) {
  return page.evaluate((m) => window.game.profile.missions.accepted.push({ ...m, status: 'accepted' }), mission);
}

/**
 * Apunta el texto de cada diálogo que se abra a partir de ahora. Se leen con `dialogs(page)`.
 * @param {import('@playwright/test').Page} page
 */
async function recordDialogs(page) {
  await page.evaluate(() => {
    const ui = window.game.uiManager;
    window.__dialogs = [];
    const show = ui.showDialog.bind(ui);
    ui.showDialog = (text, ...rest) => {
      window.__dialogs.push(text);
      return show(text, ...rest);
    };
  });
}

/** @param {import('@playwright/test').Page} page @returns {Promise<string[]>} */
const dialogs = (page) => page.evaluate(() => window.__dialogs.splice(0));

/**
 * Pasa los diálogos que haya hasta que sale la pregunta de volver al pueblo.
 * @param {import('@playwright/test').Page} page
 */
async function advanceToMissionPrompt(page) {
  for (let i = 0; i < 80; i++) {
    const menu = await page.evaluate(() => window.game.uiManager.currentMenuType);
    if (menu === 'mission_return') return;
    if (menu === 'dialog') await page.keyboard.press('z');
    else await page.waitForTimeout(50);
  }
  throw new Error('No ha salido la pregunta de volver al pueblo');
}

/** Tras cumplir: aceptar volver al pueblo y devolver el resumen. */
async function returnToTown(page) {
  await expect(panelTitle(page)).toHaveText('¡MISIÓN CUMPLIDA!');
  await option(page, 'Volver al pueblo').click();
  await expect.poll(() => page.evaluate(() => window.game.getState())).toBe('TOWN');
  const summary = await dialogText(page);
  await skipDialogs(page);
  await expectInTown(page);
  return summary;
}

/** @param {import('@playwright/test').Page} page */
const party = (page) =>
  page.evaluate(() => window.game.party.map((p) => ({ name: p.name, isLeader: p.isLeader, guestOf: p.guestOf, uid: p.uid, hp: p.hp })));

/** @param {import('@playwright/test').Page} page */
const roster = (page) => page.evaluate(() => ({ uids: window.game.profile.roster.map((p) => p.uid), team: [...window.game.profile.teamUids] }));

/** @param {import('@playwright/test').Page} page */
const missionStatus = (page, id) => page.evaluate((m) => window.game.profile.missions.accepted.find((x) => x.id === m)?.status ?? null, id);

test('escolta: el cliente se une al entrar, llega a su piso, la misión se cobra y no pasa a la plantilla', async ({ page }) => {
  await startNewGame(page);
  const before = await roster(page);
  await acceptOnBoard(page, ESCORT, {
    details: 'Oddish quiere llegar a Bosque Verde, piso 2. Su abuela vive allí',
    accepted: 'Misión aceptada: Oddish espera en la entrada de Bosque Verde para llegar al piso 2.',
  });
  const coins = await page.evaluate(() => window.game.coins);

  await recordDialogs(page);
  await enterDungeon(page);
  expect((await dialogs(page)).join('\n')).toContain('¡Por fin! Hasta el piso 2');
  const team = await party(page);
  expect(team).toHaveLength(3);
  expect(team[2]).toMatchObject({ name: 'Oddish', guestOf: ESCORT.id, isLeader: false, uid: null });

  // El invitado no lidera: Tab lo salta
  for (let i = 0; i < 3; i++) {
    await walk(page, 'Tab');
    const leader = (await party(page)).find((p) => p.isLeader);
    expect(leader.guestOf).toBeNull();
  }
  // En el menú del equipo solo se miran sus movimientos
  await page.evaluate(() => window.game.uiManager.openTeamMenu());
  await expect(page.locator('#menu-container')).toContainText('[CLIENTE]');
  await page.locator('#menu-container .menu-option[data-index="2"]').click();
  await expect(page.locator('#menu-container')).toContainText('Cliente de vuestra escolta hasta el piso 2');
  await expect(option(page, 'Establecer como Líder')).toHaveCount(0);
  await expect(option(page, 'Cambiar táctica')).toHaveCount(0);
  await page.evaluate(() => window.game.uiManager.closeMenu());
  await page.mouse.move(0, 0);
  await expectExploring(page);

  // Bajar al piso 2 con el cliente en pie
  await page.evaluate(() => window.game.floorManager.changeFloor('down'));
  await advanceToMissionPrompt(page);
  expect((await dialogs(page)).join('\n')).toContain('¡Hemos llegado!');
  expect(await missionStatus(page, ESCORT.id)).toBe('done');
  expect((await party(page)).some((p) => p.guestOf)).toBe(false);

  const summary = await returnToTown(page);
  expect(summary).toContain('Misión de Oddish: +220 Poké y Éter.');
  expect(summary).toContain('+12 puntos de rango.');
  expect(summary).not.toContain('se une a la base');
  expect(await page.evaluate(() => window.game.coins)).toBeGreaterThanOrEqual(coins + 220);
  expect(await missionStatus(page, ESCORT.id)).toBeNull();
  expect(await page.evaluate(() => window.game.profile.missions.completed)).toBe(1);
  // Ni en la plantilla ni en la formación
  expect(await roster(page)).toEqual(before);
  expect((await party(page)).map((p) => p.name)).not.toContain('Oddish');
});

test('escolta: si el cliente cae sin Semilla Revivir, falla y queda para otro intento', async ({ page }) => {
  await startNewGame(page);
  const before = await roster(page);
  await acceptDirectly(page, ESCORT);
  await enterDungeon(page);

  /** El cliente cae (como si le hubiera derrotado un salvaje). */
  const guestFaints = () =>
    page.evaluate(() => {
      const game = window.game;
      const em = game.entityManager;
      const [guest] = em.getEntitiesWithComponents('missionGuest');
      em.getComponent(guest, 'fighter').hp = 0;
      game.eventBus.emit('pokemon_fainted', { entityId: guest, attackerId: null });
    });

  // Con Semilla Revivir se levanta, como cualquier aliado
  const seeds = await page.evaluate(() => window.game.inventory.find((s) => s.itemId === 'reviver_seed')?.quantity ?? 0);
  expect(seeds).toBeGreaterThan(0);
  await guestFaints();
  const revived = (await party(page)).find((p) => p.guestOf);
  expect(revived.hp).toBeGreaterThan(0);

  // Sin semillas, la escolta falla
  await page.evaluate(() => {
    window.game.inventory = window.game.inventory.filter((s) => s.itemId !== 'reviver_seed');
  });
  await guestFaints();
  expect(await dialogText(page)).toContain('La escolta ha fallado');
  await dismissDialog(page);
  await expectExploring(page);
  expect((await party(page)).some((p) => p.guestOf)).toBe(false);
  expect(await missionStatus(page, ESCORT.id)).toBe('accepted');

  // Llegar a su piso sin el cliente no la cumple
  await recordDialogs(page);
  await page.evaluate(() => window.game.floorManager.changeFloor('down'));
  await page.waitForTimeout(300);
  if (await page.locator('.dialog-panel').isVisible()) await skipDialogs(page);
  await expectExploring(page);
  expect((await dialogs(page)).join('\n')).not.toContain('¡Hemos llegado!');
  expect(await missionStatus(page, ESCORT.id)).toBe('accepted');

  // De vuelta en el pueblo, la misión sigue en la lista y nadie se ha unido a la plantilla
  await page.evaluate(() => window.game.endExpedition('escaped'));
  await expect.poll(() => page.evaluate(() => window.game.getState())).toBe('TOWN');
  await skipDialogs(page);
  await expectInTown(page);
  expect(await missionStatus(page, ESCORT.id)).toBe('accepted');
  expect(await roster(page)).toEqual(before);

  // Otro intento: el cliente vuelve a unirse
  await enterDungeon(page);
  expect((await party(page)).filter((p) => p.guestOf)).toHaveLength(1);
});

test('escolta: con el equipo completo el cliente no cabe y espera a otra expedición', async ({ page }) => {
  await startNewGame(page);
  // Dos miembros más en la formación (copias del protagonista): cuatro en total
  await page.evaluate(() => {
    const profile = window.game.profile;
    for (let i = 0; i < 2; i++) {
      const copy = { ...profile.roster[0], uid: profile.nextUid++ };
      profile.roster.push(copy);
      profile.teamUids.push(copy.uid);
    }
  });
  await acceptDirectly(page, ESCORT);
  await recordDialogs(page);
  await enterDungeon(page);
  expect((await dialogs(page)).join('\n')).toContain('Oddish esperaba en la entrada, pero en el equipo no cabe nadie más.');
  const team = await party(page);
  expect(team).toHaveLength(4);
  expect(team.some((p) => p.guestOf)).toBe(false);
  expect(await missionStatus(page, ESCORT.id)).toBe('accepted');
});

test('escolta: si solo queda en pie el cliente, no toma el mando: el equipo cae', async ({ page }) => {
  await startNewGame(page);
  const before = await roster(page);
  await acceptDirectly(page, ESCORT);
  await enterDungeon(page);
  await page.evaluate(() => {
    const game = window.game;
    const em = game.entityManager;
    game.inventory = game.inventory.filter((s) => s.itemId !== 'reviver_seed');
    // Cae el compañero y después el líder
    const team = em.getEntitiesWithComponents('partyMember').filter((id) => !em.hasComponent(id, 'missionGuest'));
    const leader = game.getPlayerId();
    for (const id of [...team.filter((id) => id !== leader), leader]) {
      em.getComponent(id, 'fighter').hp = 0;
      game.eventBus.emit('pokemon_fainted', { entityId: id, attackerId: null });
    }
  });
  await expect.poll(() => page.evaluate(() => window.game.getState())).toBe('TOWN');
  const summary = await dialogText(page);
  expect(summary).toContain('¡El equipo ha caído!');
  expect(summary).toContain('Oddish vuelve a casa por su cuenta: la escolta queda pendiente.');
  await skipDialogs(page);
  await expectInTown(page);
  expect(await missionStatus(page, ESCORT.id)).toBe('accepted');
  expect(await roster(page)).toEqual(before);
});

test('escolta: al cargar a mitad de expedición, el cliente sigue con el equipo y aparte de él', async ({ page }) => {
  await startNewGame(page);
  await acceptDirectly(page, ESCORT);
  await enterDungeon(page);
  await page.evaluate(() => window.game.saveGameData());
  const run = await page.evaluate(() => JSON.parse(localStorage.getItem('pokerogue_save')).run);
  expect(run.party).toHaveLength(2);
  expect(run.guests).toEqual([expect.objectContaining({ missionId: ESCORT.id, name: 'Oddish', uid: null })]);

  await page.reload();
  await option(page, 'Continuar partida').click();
  await dismissDialog(page);
  await expectExploring(page);
  const team = await party(page);
  expect(team).toHaveLength(3);
  expect(team.filter((p) => p.guestOf === ESCORT.id)).toEqual([expect.objectContaining({ name: 'Oddish', isLeader: false })]);
  expect(team.find((p) => p.isLeader).guestOf).toBeNull();
});

test('forajido: está en su piso, es más fuerte, huye, no se une al caer y la misión se cobra', async ({ page }) => {
  await startNewGame(page);
  await acceptOnBoard(page, OUTLAW, {
    details: 'SE BUSCA: Weedle, visto en Bosque Verde, piso 1. Pintó bigotes',
    accepted: 'Misión aceptada: Weedle anda suelto por Bosque Verde, piso 1.',
  });
  await enterDungeon(page);

  const outlaw = await page.evaluate(() => {
    const em = window.game.entityManager;
    const [id] = em.getEntitiesWithComponents('outlaw');
    const wild = em
      .getEntitiesWithComponents('aiControlled', 'pokemonInfo')
      .filter((e) => !em.hasComponent(e, 'partyMember') && !em.hasComponent(e, 'outlaw'))
      .map((e) => em.getComponent(e, 'pokemonInfo').level);
    const info = em.getComponent(id, 'pokemonInfo');
    return { id, speciesId: info.speciesId, level: info.level, wild, log: window.game._messageLog.join('\n') };
  });
  expect(outlaw.speciesId).toBe(13);
  expect(outlaw.wild.length).toBeGreaterThan(0);
  for (const level of outlaw.wild) expect(outlaw.level).toBeGreaterThan(level);
  expect(outlaw.log).toContain('¡Se busca! Weedle, el forajido de vuestra misión, anda por este piso.');

  // Con poca vida intenta escapar
  const fled = await page.evaluate((id) => {
    const game = window.game;
    const fighter = game.entityManager.getComponent(id, 'fighter');
    fighter.hp = Math.max(1, Math.floor(fighter.maxHp * 0.1));
    game.combat.getEnemyAIAction(id);
    return { behavior: game.entityManager.getComponent(id, 'aiControlled').behavior, log: game._messageLog.join('\n') };
  }, outlaw.id);
  expect(fled.behavior).toBe('flee');
  expect(fled.log).toContain('¡Weedle intenta escapar!');

  // El líder lo derrota: aunque la tirada de reclutar saliera, no se une
  await recordDialogs(page);
  await page.evaluate((id) => {
    const game = window.game;
    game.debug.forceRecruit = true;
    game.entityManager.getComponent(id, 'fighter').hp = 0;
    game.eventBus.emit('pokemon_fainted', { entityId: id, attackerId: game.getPlayerId() });
  }, outlaw.id);
  await advanceToMissionPrompt(page);
  const said = (await dialogs(page)).join('\n');
  expect(said).toContain('¡Vale, vale, me rindo!');
  expect(said).not.toContain('se ha levantado');
  expect(await missionStatus(page, OUTLAW.id)).toBe('done');
  expect(await page.evaluate((id) => window.game.entityManager.entityExists(id), outlaw.id)).toBe(false);

  const summary = await returnToTown(page);
  expect(summary).toContain('Misión de Weedle: +290 Poké.');
  expect(summary).toContain('+15 puntos de rango.');
  expect(await page.evaluate(() => window.game.profile.rankPoints)).toBe(15);
  expect((await party(page)).map((p) => p.name)).not.toContain('Weedle');
});
