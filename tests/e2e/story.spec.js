// La historia (H4): escenas con retrato que salen en su momento y una sola vez.
import { readFileSync } from 'node:fs';
import {
  test,
  expect,
  panelTitle,
  openTitleScreen,
  startNewGame,
  enterDungeon,
  expectInTown,
  expectExploring,
  dismissDialog,
  skipDialogs,
  dialogText,
} from './fixtures.js';

/** @param {import('@playwright/test').Page} page @param {string} text */
const option = (page, text) => page.locator('#menu-container .menu-option', { hasText: text });

/**
 * Pulsa Z hasta que el diálogo abierto contiene `text` (los animados piden
 * dos pulsaciones: la primera completa el texto).
 * @param {import('@playwright/test').Page} page
 * @param {string} text
 */
async function advanceTo(page, text) {
  for (let i = 0; i < 200; i++) {
    if ((await dialogText(page)).includes(text)) return;
    await page.keyboard.press('z');
  }
  throw new Error(`No ha salido ningún diálogo con «${text}»`);
}

/** Nombre y retrato del diálogo abierto. */
async function speaker(page) {
  const portrait = page.locator('.dialog-portrait');
  return {
    name: await page.locator('.dialog-speaker').textContent().catch(() => null),
    portrait: (await portrait.count()) ? await portrait.getAttribute('src') : null,
  };
}

/** @param {import('@playwright/test').Page} page */
const seen = (page) => page.evaluate(() => [...window.game.profile.story.seen]);

/**
 * Marca mazmorras como completadas (y sus escenas como vistas), como si la
 * partida viniera de ahí, y vuelve a entrar en el pueblo.
 * @param {import('@playwright/test').Page} page
 * @param {string[]} cleared
 */
async function atChapter(page, cleared) {
  await page.evaluate((ids) => {
    const game = window.game;
    game.profile.clearedDungeons = [...ids];
    const chapter = 1 + ids.length;
    game.profile.story.seen = window.__storyScenes.filter((s) => s.chapter < chapter).map((s) => s.id);
  }, cleared);
}

/** Salta al piso del jefe de la mazmorra en curso. */
async function toBossFloor(page) {
  await page.evaluate(async () => {
    const game = window.game;
    game._currentFloor = game.dungeon.floors[1] - 1;
    await game.floorManager.changeFloor('down');
  });
}

/** El jefe cae como si lo hubiera derrotado el líder. */
async function defeatBoss(page) {
  await page.evaluate(() => {
    const game = window.game;
    const em = game.entityManager;
    const boss = em.getEntitiesWithComponents('isBoss')[0];
    em.getComponent(boss, 'fighter').hp = 0;
    game.eventBus.emit('pokemon_fainted', { entityId: boss, attackerId: game.getPlayerId() });
  });
}

/** Coloca al líder bajo el tablón, mirándolo. */
async function faceBoard(page) {
  await page.evaluate(() => {
    const game = window.game;
    const pos = game.entityManager.getComponent(game.getPlayerId(), 'position');
    Object.assign(pos, { x: 15, y: 4, prevX: 15, prevY: 4, facing: 'up', facingDx: 0, facingDy: -1 });
  });
}

const CHAPTERS = ['bosque_verde', 'cueva_oscura', 'ruta_electrica', 'monte_lunar', 'profundidades_oscuras', 'isla_volcanica', 'laboratorio_final'];

/** Código y capítulo de cada escena, para preparar el capítulo que haga falta. */
const SCENES = JSON.parse(readFileSync(new URL('../../src/data/story.json', import.meta.url), 'utf8')).scenes.map(({ id, chapter }) => ({ id, chapter }));

/**
 * Deja las escenas en `window.__storyScenes` (las usa `atChapter`).
 * @param {import('@playwright/test').Page} page
 */
async function loadScenes(page) {
  await page.evaluate((list) => {
    window.__storyScenes = list;
  }, SCENES);
}

/**
 * Pulsa Z mientras haya diálogo hasta volver al pueblo (tras una escena que
 * acaba la mazmorra). Con la mazmorra acabando, el juego no atiende al teclado.
 * @param {import('@playwright/test').Page} page
 */
async function advanceUntilTown(page) {
  for (let i = 0; i < 100; i++) {
    if ((await page.evaluate(() => window.game.getState())) === 'TOWN') return;
    if (await page.locator('.dialog-panel').isVisible()) await page.keyboard.press('z');
    else await page.waitForTimeout(50);
  }
  throw new Error('No se ha vuelto al pueblo');
}

test('el prólogo: la voz a oscuras y después el compañero con su retrato y el nombre del equipo', async ({ page }) => {
  await openTitleScreen(page);
  await page.keyboard.press('z');
  for (let i = 0; i < 9; i++) await page.keyboard.press('z');
  await page.keyboard.press('z'); // ¡Seré…!
  await page.keyboard.press('z'); // primer compañero
  await page.keyboard.press('Enter'); // nombre por defecto

  // P-1: la voz, sin retrato y sobre negro
  await expect(page.locator('#ui-overlay.story-black')).toBeVisible();
  expect(await dialogText(page)).toBe('…¿Me oyes?');
  expect(await speaker(page)).toEqual({ name: '???', portrait: null });

  // P-2: el compañero, con su retrato
  await advanceTo(page, '¡Eh! ¡Eh! ¿Me oyes?');
  await expect(page.locator('#ui-overlay.story-black')).toHaveCount(0);
  const { partner, partnerId, hero, team } = await page.evaluate(() => {
    const { roster, partnerUid, heroUid, teamName } = window.game.profile;
    const p = roster.find((m) => m.uid === partnerUid);
    return { partner: p.name, partnerId: p.speciesId, hero: roster.find((m) => m.uid === heroUid).name, team: teamName };
  });
  const who = await speaker(page);
  expect(who.name).toBe(partner);
  expect(who.portrait).toMatch(new RegExp(`portraits/${String(partnerId).padStart(4, '0')}/Worried\\.png$`));

  // Los marcadores se sustituyen por los nombres de la partida
  await advanceTo(page, 'tienes una pinta de');
  expect(await dialogText(page)).toContain(`tienes una pinta de ${hero} impresionante`);
  await advanceTo(page, '¡Desde hoy somos el');
  expect(await dialogText(page)).toContain(`¡Desde hoy somos el ${team}!`);

  await skipDialogs(page);
  await expectInTown(page);
  expect(await seen(page)).toEqual(['P-1', 'P-2', 'P-3']);

  // Sale una sola vez: al cargar la partida no se repite
  await page.reload();
  await option(page, 'Continuar partida').click();
  expect(await dialogText(page)).toContain('Partida cargada');
  await dismissDialog(page);
  await expectInTown(page);
});

test('capítulo 1: entrada, Pidgeotto en el piso 5, el protagonista le contesta y vuelta al pueblo', async ({ page }) => {
  await startNewGame(page);
  const hero = await page.evaluate(() => {
    const { roster, heroUid } = window.game.profile;
    const h = roster.find((m) => m.uid === heroUid);
    return { name: h.name, speciesId: h.speciesId };
  });

  // 1-B, detrás de la presentación de la mazmorra
  await page.evaluate(() => window.game.uiManager.openDungeonSelect());
  await page.keyboard.press('z');
  await page.keyboard.press('z'); // ¡En marcha!
  await expect.poll(() => page.evaluate(() => window.game.getState())).toBe('EXPLORING');
  expect(await dialogText(page)).toContain('Bosque Verde');
  await advanceTo(page, 'Así que esto es una mazmorra');
  await skipDialogs(page);
  await expectExploring(page);

  // 1-C en el piso del jefe, que ahora es Pidgeotto
  await toBossFloor(page);
  expect(await dialogText(page)).toContain('Una silueta cae de las ramas');
  const boss = await page.evaluate(() => {
    const em = window.game.entityManager;
    return em.getComponent(em.getEntitiesWithComponents('isBoss')[0], 'pokemonInfo').speciesId;
  });
  expect(boss).toBe(17);
  await advanceTo(page, '¿¡QUIÉN ERES!?');
  expect((await speaker(page)).name).toBe('Pidgeotto');
  await skipDialogs(page);

  // 1-D al derrotarla: el protagonista contesta a la pregunta
  await defeatBoss(page);
  expect(await dialogText(page)).toContain('Pidgeotto ha sido derrotado');
  await advanceTo(page, `Soy ${hero.name}.`);
  expect((await speaker(page)).portrait).toMatch(new RegExp(`portraits/${String(hero.speciesId).padStart(4, '0')}/Determined\\.png$`));

  // Al acabar la escena se completa la mazmorra; en el pueblo, el resumen y 1-E
  await advanceUntilTown(page);
  expect(await dialogText(page)).toContain('¡Bosque Verde completada!');
  await advanceTo(page, '¡¡Hermana!!');
  await advanceTo(page, '¡Mis carros no llegan!');
  expect((await speaker(page)).name).toBe('Kecleon');
  await skipDialogs(page);
  await expectInTown(page);
  expect(await seen(page)).toEqual(expect.arrayContaining(['1-B', '1-C', '1-D', '1-E']));

  // Capítulo 2: Pidgey ya habla de otra cosa
  await page.evaluate(() => {
    const game = window.game;
    const pos = game.entityManager.getComponent(game.getPlayerId(), 'position');
    Object.assign(pos, { x: 19, y: 6, prevX: 19, prevY: 6, facing: 'up', facingDx: 0, facingDy: -1 });
  });
  await page.keyboard.press('z');
  expect(await dialogText(page)).toContain('¡Mi hermana vuelve a repartir el correo!');
});

test('con un Squirtle en el equipo grita «¡Vamo\' a hacesla!» y Kecleon ofrece un monstersito', async ({ page }) => {
  await openTitleScreen(page);
  await page.keyboard.press('z');
  for (let i = 0; i < 9; i++) await page.keyboard.press('z');
  await option(page, 'Prefiero elegir yo').click();
  await option(page, 'Squirtle').click();
  await option(page, 'Charmander').click();
  await page.keyboard.press('Enter');
  await skipDialogs(page);
  await loadScenes(page);
  await atChapter(page, ['bosque_verde']);

  await enterDungeon(page, 1); // Cueva Oscura
  await toBossFloor(page);
  await advanceTo(page, 'Si os dejo pasar');
  await page.keyboard.press('z');
  await page.keyboard.press('z');
  expect(await dialogText(page)).toBe("¡Vamo' a hacesla!");
  expect(await speaker(page)).toEqual({ name: 'Squirtle', portrait: expect.stringMatching(/portraits\/0007\/Determined\.png$/) });
  await skipDialogs(page);

  await page.evaluate(() => window.game.completeDungeon());
  await expect.poll(() => page.evaluate(() => window.game.getState())).toBe('TOWN');
  await advanceTo(page, '¿un monstersito o quéee?');
  expect((await speaker(page)).name).toBe('Kecleon');
  await skipDialogs(page);
  await expectInTown(page);
});

test('capítulo 3: el tablón tiene un sobre sin remite que se apunta como encargo', async ({ page }) => {
  await startNewGame(page);
  await loadScenes(page);
  await atChapter(page, CHAPTERS.slice(0, 2));

  await faceBoard(page);
  await page.keyboard.press('z');
  expect(await dialogText(page)).toContain('Entre los encargos del día hay un sobre cerrado');
  await advanceTo(page, 'marcas de garras');
  expect((await speaker(page)).name).toBe('Pidgey');
  await skipDialogs(page);
  await expect(panelTitle(page)).toHaveText('TABLÓN DE MISIONES');

  const letter = await page.evaluate(() => window.game.profile.missions.accepted.find((m) => m.id === 'story_letter'));
  expect(letter).toMatchObject({ type: 'deliver', dungeonId: 'ruta_electrica', floor: 5, story: true, reward: { money: 500, rankPoints: 20 } });

  // En la lista de aceptadas se lee el sobre y no se puede abandonar
  await option(page, 'Misiones aceptadas').click();
  await option(page, 'Raichu').click();
  await expect(page.locator('#menu-container')).toContainText('Huele a perfume caro');
  await expect(option(page, 'Abandonar')).toHaveCount(0);

  // La segunda vez, el tablón se abre directamente
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await expectInTown(page);
  await faceBoard(page);
  await page.keyboard.press('z');
  await expect(panelTitle(page)).toHaveText('TABLÓN DE MISIONES');
});

test('capítulo 5: Slowpoke no está en el pueblo mientras Gengar lo tiene', async ({ page }) => {
  await startNewGame(page);
  await loadScenes(page);
  const slowpokeHere = () =>
    page.evaluate(() => {
      const em = window.game.entityManager;
      return em.getEntitiesWithComponents('npcTown').some((id) => em.getComponent(id, 'npcTown').id === 'slowpoke');
    });
  await atChapter(page, CHAPTERS.slice(0, 4));
  await page.evaluate(() => window.game.saveGameData());
  await page.reload();
  await option(page, 'Continuar partida').click();
  await dismissDialog(page);
  expect(await slowpokeHere()).toBe(false);

  // Rescatado (Profundidades Oscuras completadas), vuelve a su sitio
  await page.evaluate(() => {
    window.game.profile.clearedDungeons.push('profundidades_oscuras');
    window.game.saveGameData();
  });
  await page.reload();
  await option(page, 'Continuar partida').click();
  await dismissDialog(page);
  expect(await slowpokeHere()).toBe(true);
});

test('el final: la víspera, la vuelta del laboratorio y, al dormir, el epílogo y los créditos', async ({ page }) => {
  await startNewGame(page);
  await loadScenes(page);
  await atChapter(page, CHAPTERS.slice(0, 6));

  // 7-A antes de salir hacia el laboratorio
  await page.evaluate(() => window.game.uiManager.openDungeonSelect());
  await option(page, 'Laboratorio Final').click();
  await option(page, '¡En marcha!').click();
  expect(await dialogText(page)).toContain('tiro la casa por la ventana');
  await advanceTo(page, 'Antes de que anochezca.');
  expect((await speaker(page)).name).toBe('Persian');
  await dismissDialog(page);
  // Después sale hacia el laboratorio: presentación y 7-B
  await expect.poll(() => page.evaluate(() => window.game.getState())).toBe('EXPLORING');
  await expect(page.locator('.dialog-panel')).toContainText('Laboratorio Final');
  await advanceTo(page, 'Los Antiguos construían cosas muy raras');
  await skipDialogs(page);
  await expectExploring(page);
  expect(await page.evaluate(() => window.game.dungeonId)).toBe('laboratorio_final');

  // F-1 al volver con el laboratorio completado
  await page.evaluate(() => window.game.completeDungeon());
  await expect.poll(() => page.evaluate(() => window.game.getState())).toBe('TOWN');
  await advanceTo(page, '¿¡CON CEBOLLA!?');
  await advanceTo(page, 'Id a dormir');
  await skipDialogs(page);
  await expectInTown(page);

  // Al día siguiente: epílogo, créditos y la escena de después
  await page.evaluate(() => window.game.uiManager.openBaseMenu());
  await option(page, 'Dormir hasta mañana').click();
  await advanceTo(page, 'Viene de Aldea Musgo');
  await advanceTo(page, 'A buenas horas, mangas verdes');
  await advanceTo(page, 'Mañana, entonces.');
  // La última línea de F-3 y, sin pulsar más, los créditos
  await advanceTo(page, 'Por primera vez, no pregunta nada.');
  await dismissDialog(page);
  const roll = page.locator('.credits-roll');
  await expect(roll).toBeVisible();
  await expect(page.locator('#ui-overlay.story-black')).toBeVisible();
  await expect(panelTitle(page)).toHaveText('EL ECO DEL NORTE');
  for (const text of ['Guion y desarrollo', 'PMDCollab', 'CHUNSOFT', 'CC BY-NC 4.0', '¡Gracias por jugar!']) {
    await expect(roll).toContainText(text);
  }
  await page.keyboard.press('z'); // Continuar
  expect(await dialogText(page)).toBe('Cincuenta pisos. Sin ascensor. Os espero arriba.');
  expect((await speaker(page)).name).toBe('Mewtwo');
  await skipDialogs(page);
  await expectInTown(page);
  expect(await seen(page)).toEqual(expect.arrayContaining(['7-A', 'F-1', 'F-2', 'F-3', 'F-4']));

  // Y después del final los vecinos hablan de la torre nueva
  await page.evaluate(() => {
    const game = window.game;
    const pos = game.entityManager.getComponent(game.getPlayerId(), 'position');
    Object.assign(pos, { x: 19, y: 6, prevX: 19, prevY: 6, facing: 'up', facingDx: 0, facingDy: -1 });
  });
  await page.keyboard.press('z');
  expect(await dialogText(page)).toContain('la torre nueva del norte');
});
