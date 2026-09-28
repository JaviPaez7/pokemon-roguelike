// Posjuego (H5): las mazmorras de los legendarios se abren con el final y
// cada legendario se ofrece a unirse al derrotarlo.
import { readFileSync } from 'node:fs';
import {
  test,
  expect,
  panelTitle,
  startNewGame,
  expectInTown,
  expectExploring,
  skipDialogs,
  dismissDialog,
  dialogText,
} from './fixtures.js';

/** @param {import('@playwright/test').Page} page @param {string} text */
const option = (page, text) => page.locator('#menu-container .menu-option', { hasText: text });

const STORY = JSON.parse(readFileSync(new URL('../../src/data/story.json', import.meta.url), 'utf8'));
/** Escenas que ha visto quien ha terminado la historia (todas menos las del posjuego). */
const STORY_SCENES = STORY.scenes.filter((s) => !s.id.startsWith('L')).map((s) => s.id);

/**
 * Deja la partida como si viniera de ahí: mazmorras completadas y escenas vistas.
 * @param {import('@playwright/test').Page} page
 * @param {{ cleared?: string[], seen: string[] }} state
 */
async function setProgress(page, { cleared = [], seen }) {
  await page.evaluate(
    ({ cleared, seen }) => {
      const profile = window.game.profile;
      profile.clearedDungeons = [...cleared];
      profile.story.seen = [...seen];
    },
    { cleared: [...STORY.chapters, ...cleared], seen },
  );
}

/**
 * Pulsa Z hasta que el diálogo abierto contiene `text`.
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

/**
 * Sale del pueblo hacia una mazmorra por su nombre y pasa la presentación y
 * la escena de entrada, si la hay.
 * @param {import('@playwright/test').Page} page
 * @param {string} name
 */
async function enterByName(page, name) {
  await page.evaluate(() => window.game.uiManager.openDungeonSelect());
  await option(page, name).click();
  await option(page, '¡En marcha!').click();
  await expect.poll(() => page.evaluate(() => window.game.getState())).toBe('EXPLORING');
  // Según la semilla, un evento del piso puede salir antes de la presentación
  await advanceTo(page, `${name}\n\n`);
}

/** Salta al piso del jefe de la mazmorra en curso. */
async function toBossFloor(page) {
  await page.evaluate(async () => {
    const game = window.game;
    game._currentFloor = game.dungeon.floors[1] - 1;
    await game.floorManager.changeFloor('down');
  });
}

/** El jefe, como lo ve el juego. */
const bossInfo = (page) =>
  page.evaluate(() => {
    const em = window.game.entityManager;
    const id = em.getEntitiesWithComponents('isBoss')[0];
    const info = em.getComponent(id, 'pokemonInfo');
    return { speciesId: info.speciesId, level: info.level, moves: info.currentMoves.map((m) => m.moveId) };
  });

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

/**
 * Pulsa Z mientras haya diálogo hasta volver al pueblo.
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

/** Ficha de la plantilla de una especie, o null. */
const rosterMember = (page, speciesId) =>
  page.evaluate((id) => {
    const profile = window.game.profile;
    const m = profile.roster.find((p) => p.speciesId === id);
    return m ? { uid: m.uid, level: m.level, maxHp: m.maxHp, moves: m.currentMoves.map((s) => s.moveId), inTeam: profile.teamUids.includes(m.uid) } : null;
  }, speciesId);

/**
 * Pone al líder junto a la entidad con ese componente y devuelve la tecla para
 * chocar con ella.
 * @param {import('@playwright/test').Page} page
 * @param {string} component
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

/** PS máximos de una especie a un nivel, sin extras de jefe. */
const normalMaxHp = (page, speciesId, level) =>
  page.evaluate(
    ({ speciesId, level }) => {
      const em = window.game.entityManager;
      const id = em.createPokemon(speciesId, level, 0, 0, false);
      const hp = em.getComponent(id, 'fighter').maxHp;
      em.destroyEntity(id);
      return hp;
    },
    { speciesId, level },
  );

test('tras los créditos, Pidgeotto ve tres picos nuevos y se abren en el menú de la salida', async ({ page }) => {
  await startNewGame(page);
  // Recién vuelto del laboratorio (F-1 vista): toca el epílogo al dormir
  await setProgress(page, { seen: STORY_SCENES.filter((id) => !['F-2', 'F-3', 'F-4'].includes(id)) });

  // Antes del final, ninguna mazmorra de legendario
  await page.evaluate(() => window.game.uiManager.openDungeonSelect());
  await expect(panelTitle(page)).toHaveText('¿A DÓNDE VAMOS?');
  await expect(option(page, 'Cumbre Escarcha')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expectInTown(page);

  await page.evaluate(() => window.game.uiManager.openBaseMenu());
  await option(page, 'Dormir hasta mañana').click();
  await advanceTo(page, 'Por primera vez, no pregunta nada.');
  await dismissDialog(page);
  await expect(page.locator('.credits-roll')).toBeVisible();
  await page.keyboard.press('z'); // Continuar
  expect(await dialogText(page)).toBe('Cincuenta pisos. Sin ascensor. Os espero arriba.');

  // L-0, detrás de Mewtwo
  await advanceTo(page, '¡Noticias del cielo!');
  expect(await speaker(page)).toEqual({ name: 'Pidgeotto', portrait: expect.stringMatching(/portraits\/0017\/Normal\.png$/) });
  await advanceTo(page, 'uno helado, otro que no para de tronar y otro que arde');
  await skipDialogs(page);
  await expectInTown(page);
  expect(await page.evaluate(() => window.game.profile.story.seen)).toEqual(expect.arrayContaining(['F-3', 'F-4', 'L-0']));

  // Los tres picos, con estrella; el jardín todavía no
  await page.evaluate(() => window.game.uiManager.openDungeonSelect());
  for (const name of ['Cumbre Escarcha', 'Pico Tronador', 'Caldera Ascua']) {
    await expect(option(page, name)).toContainText('★ 8 pisos');
  }
  await expect(option(page, 'Jardín del Primer Sueño')).toHaveCount(0);

  // La lista ya no cabe entera: al bajar con el teclado, la seleccionada se ve
  const index = await option(page, 'Caldera Ascua').getAttribute('data-index');
  for (let i = 1; i <= Number(index); i++) {
    await page.keyboard.press('ArrowDown');
    await page.waitForFunction((n) => window.game.uiManager.selectedIndex === n, i);
  }
  await expect(option(page, 'Caldera Ascua')).toHaveClass(/selected/);
  const visible = await page.evaluate(() => {
    const list = document.querySelector('#options-list').getBoundingClientRect();
    const selected = document.querySelector('#options-list .menu-option.selected').getBoundingClientRect();
    return selected.top >= list.top - 1 && selected.bottom <= list.bottom + 1;
  });
  expect(visible).toBe(true);
  // (El scroll bajo un ratón quieto no cambia la selección; moverlo, sí)
  await option(page, 'Pico Tronador').hover();
  await expect(option(page, 'Pico Tronador')).toHaveClass(/selected/);
});

test('Cumbre Escarcha: Articuno habla con su retrato y, al derrotarlo, se une al equipo', async ({ page }) => {
  await startNewGame(page);
  await setProgress(page, { seen: [...STORY_SCENES, 'L-0'] });

  await enterByName(page, 'Cumbre Escarcha');
  await advanceTo(page, 'Se me congelan hasta las ideas');
  await skipDialogs(page);
  await expectExploring(page);

  // L1-C en el piso del jefe: Articuno, nivel 55
  await toBossFloor(page);
  // Según la semilla, antes puede salir un evento del piso (un claro, un tesoro…)
  await advanceTo(page, 'la nieve cae hacia arriba');
  expect(await bossInfo(page)).toMatchObject({ speciesId: 144, level: 55 });
  await advanceTo(page, 'subís a hacer ruido');
  expect(await speaker(page)).toEqual({ name: 'Articuno', portrait: expect.stringMatching(/portraits\/0144\/Normal\.png$/) });
  await skipDialogs(page);
  await expectExploring(page);

  // L1-D y, detrás, la oferta de unirse
  const before = await page.evaluate(() => window.game.party.length);
  await defeatBoss(page);
  expect(await dialogText(page)).toContain('¡Articuno ha sido derrotado!');
  await advanceTo(page, 'el frío guarda las cosas');
  await advanceTo(page, 'Parece que quiere acompañaros');
  expect((await speaker(page)).name).toBe('Articuno');
  await dismissDialog(page);
  await expect(panelTitle(page)).toHaveText('¿RECLUTAR A ARTICUNO?');
  await option(page, 'Sí').click();
  expect(await dialogText(page)).toContain('¡Articuno se ha unido a vuestro equipo!');
  expect(await page.evaluate(() => window.game.party.length)).toBe(before + 1);

  // Al cerrar la bienvenida se completa la mazmorra
  await advanceUntilTown(page);
  expect(await dialogText(page)).toContain('¡Cumbre Escarcha completada!');
  expect(await dialogText(page)).toContain('Articuno se une a la base del equipo.');
  await skipDialogs(page);
  await expectInTown(page);

  // En la plantilla y en el equipo, a su nivel y sin los PS extra de jefe
  const articuno = await rosterMember(page, 144);
  expect(articuno).toMatchObject({ level: 55, inTeam: true });
  expect(articuno.maxHp).toBe(await normalMaxHp(page, 144, 55));
  expect(await page.evaluate(() => window.game.profile.clearedDungeons)).toContain('cumbre_escarcha');
});

test('Caldera Ascua: Moltres trae su kit; si se le dice que no, se va y a la siguiente vuelve a ofrecerse', async ({ page }) => {
  await startNewGame(page);
  await setProgress(page, { seen: [...STORY_SCENES, 'L-0', 'L3-B', 'L3-C', 'L3-D'] });

  await enterByName(page, 'Caldera Ascua');
  await skipDialogs(page);
  await toBossFloor(page);
  // Su lista de movimientos casi no tiene fuego: el jefe lleva Lanzallamas
  expect(await bossInfo(page)).toMatchObject({ speciesId: 146, moves: [53, 143, 83, 97] });

  await defeatBoss(page);
  await advanceTo(page, 'Parece que quiere acompañaros');
  await dismissDialog(page);
  await option(page, 'No').click();
  expect(await dialogText(page)).toContain('Moltres se aleja sin prisa.');
  await advanceUntilTown(page);
  expect(await dialogText(page)).toContain('¡Caldera Ascua completada!');
  await skipDialogs(page);
  await expectInTown(page);
  expect(await rosterMember(page, 146)).toBeNull();

  // Otra vez, con el equipo completo: se ofrece de nuevo y va a la base
  await page.evaluate(() => {
    const profile = window.game.profile;
    const partner = profile.roster.find((m) => m.uid === profile.partnerUid);
    for (let i = 0; i < 2; i++) {
      const uid = profile.nextUid++;
      profile.roster.push({ ...structuredClone(partner), uid });
      profile.teamUids.push(uid);
    }
  });
  await enterByName(page, 'Caldera Ascua');
  await skipDialogs(page);
  await toBossFloor(page);
  await defeatBoss(page);
  await advanceTo(page, 'Parece que quiere acompañaros');
  await dismissDialog(page);
  await expect(page.locator('#menu-container')).toContainText('os esperará en la base');
  await option(page, 'Sí').click();
  expect(await dialogText(page)).toContain('Como ya sois cuatro, os esperará en la base.');
  await advanceUntilTown(page);
  await skipDialogs(page);
  await expectInTown(page);

  const moltres = await rosterMember(page, 146);
  expect(moltres).toMatchObject({ level: 55, inTeam: false, moves: [53, 143, 83, 97] });

  // Ya está en la base: al derrotarlo otra vez no se repite la oferta
  await enterByName(page, 'Caldera Ascua');
  await skipDialogs(page);
  await toBossFloor(page);
  await defeatBoss(page);
  await advanceTo(page, '¡Moltres ha sido derrotado!');
  await advanceUntilTown(page);
  expect(await dialogText(page)).toContain('¡Caldera Ascua completada!');
  expect(await page.evaluate(() => window.game.profile.roster.filter((m) => m.speciesId === 146).length)).toBe(1);
});

test('al completar el tercer pico llega un sobre sin remite y se abre el jardín de Mew', async ({ page }) => {
  await startNewGame(page);
  const peaks = STORY.scenes.filter((s) => /^L[123]-/.test(s.id)).map((s) => s.id);
  await setProgress(page, { cleared: ['cumbre_escarcha', 'pico_tronador'], seen: [...STORY_SCENES, 'L-0', ...peaks] });

  await enterByName(page, 'Caldera Ascua');
  await skipDialogs(page);
  await page.evaluate(() => window.game.completeDungeon());
  await expect.poll(() => page.evaluate(() => window.game.getState())).toBe('TOWN');
  expect(await dialogText(page)).toContain('Nueva mazmorra: Jardín del Primer Sueño.');
  await advanceTo(page, '¡Ha llegado otro sobre sin remite!');
  expect((await speaker(page)).name).toBe('Pidgey');
  await advanceTo(page, '«¿Jugamos?»');
  await skipDialogs(page);
  await expectInTown(page);

  // El jardín: diez pisos y, al fondo, Mew
  await enterByName(page, 'Jardín del Primer Sueño');
  await advanceTo(page, '¡Frío, frío!');
  expect((await speaker(page)).name).toBe('???');
  await skipDialogs(page);
  await toBossFloor(page);
  expect(await bossInfo(page)).toMatchObject({ speciesId: 151, level: 66 });
  await advanceTo(page, '¡Me habéis encontrado!');
  expect(await speaker(page)).toEqual({ name: 'Mew', portrait: expect.stringMatching(/portraits\/0151\/Joyous\.png$/) });
  await skipDialogs(page);
  await expectExploring(page);
});

test('el Diario guarda el posjuego detrás del final, con una parte por mazmorra', async ({ page }) => {
  await startNewGame(page);
  await setProgress(page, { seen: [...STORY_SCENES, 'L-0', 'L1-B', 'L1-C'] });
  const before = await page.evaluate(() => [...window.game.profile.story.seen]);

  await page.evaluate(() => window.game.uiManager.openBaseMenu());
  await option(page, 'Diario').click();
  await expect(panelTitle(page)).toHaveText('DIARIO DEL EQUIPO');
  const parts = await page.locator('#options-list .menu-option .town-option-label').allTextContents();
  expect(parts.slice(-4)).toEqual(['Final · «Antes de que anochezca»', 'Posjuego · «Las leyendas del valle»', 'Cumbre Escarcha', 'Volver']);

  await option(page, 'Cumbre Escarcha').click();
  await expect(panelTitle(page)).toHaveText('CUMBRE ESCARCHA');
  await expect(page.locator('#options-list .menu-option .town-option-label')).toHaveText(['Entrada', 'Antes del jefe (piso 8)', 'Volver']);
  await option(page, 'Antes del jefe').click();
  expect(await dialogText(page)).toContain('la nieve cae hacia arriba');
  await advanceTo(page, 'subís a hacer ruido');
  expect(await speaker(page)).toEqual({ name: 'Articuno', portrait: expect.stringMatching(/portraits\/0144\/Normal\.png$/) });
  await skipDialogs(page);
  await expect(panelTitle(page)).toHaveText('CUMBRE ESCARCHA');
  // Volver a verla no cambia la partida
  expect(await page.evaluate(() => window.game.profile.story.seen)).toEqual(before);
});

test('el tablón da encargos ★ en los picos, y la partida se guarda y se carga dentro de uno', async ({ page }) => {
  await startNewGame(page);
  await setProgress(page, { seen: [...STORY_SCENES, 'L-0', 'L1-B', 'L2-B', 'L3-B'] });

  // El primer día con un rescate en un pico
  const { mission, index } = await page.evaluate(() => {
    const game = window.game;
    const profile = game.profile;
    const peaks = ['cumbre_escarcha', 'pico_tronador', 'caldera_ascua'];
    for (let day = 2; day < 100; day++) {
      profile.day = day;
      game.uiManager.openMissionBoard();
      const board = profile.missions.board;
      const i = board.findIndex((m) => peaks.includes(m.dungeonId) && m.type === 'rescue');
      if (i >= 0) return { mission: board[i], index: i };
    }
    throw new Error('Ningún rescate en los picos en 100 días');
  });
  expect(mission.difficulty).toBe('★');
  expect(mission.reward.rankPoints).toBe(160);
  const peak = {
    cumbre_escarcha: { name: 'Cumbre Escarcha', tileset: 'escarcha', weather: 'granizo' },
    pico_tronador: { name: 'Pico Tronador', tileset: 'tronador', weather: 'lluvia' },
    caldera_ascua: { name: 'Caldera Ascua', tileset: 'ascua', weather: 'sol' },
  }[mission.dungeonId];

  await option(page, 'Encargos del día').click();
  await page.locator(`#menu-container .menu-option[data-index="${index}"]`).click();
  await expect(panelTitle(page)).toHaveText('RESCATE · ★');
  await option(page, 'Aceptar').click();
  expect(await dialogText(page)).toContain(`${mission.clientName} os espera en`);
  await dismissDialog(page);
  await page.evaluate(() => window.game.uiManager.closeMenu());
  await expectInTown(page);

  // Al piso del encargo
  await enterByName(page, peak.name);
  await skipDialogs(page);
  await expectExploring(page);
  if (mission.floor > 1) {
    await page.evaluate(async (floor) => {
      const game = window.game;
      game._currentFloor = game.dungeon.floors[0] + floor - 2;
      await game.floorManager.changeFloor('down');
    }, mission.floor);
    // Según la semilla, el piso trae algún aviso (una casa de monstruos…) o nada
    for (let i = 0; i < 50 && (await page.locator('.dialog-panel').isVisible()); i++) await page.keyboard.press('z');
    await expectExploring(page);
  }

  /** Dónde está el equipo y cómo es el piso. */
  const where = () =>
    page.evaluate(() => {
      const game = window.game;
      return {
        dungeonId: game.dungeonId,
        floor: game.getCurrentFloor(),
        globalFloor: game._currentFloor,
        biome: game.tileMap.biome.id,
        weather: game.currentWeather,
        clients: game.entityManager.getEntitiesWithComponents('missionClient').length,
      };
    });
  const here = await where();
  expect(here).toMatchObject({ dungeonId: mission.dungeonId, floor: mission.floor, biome: peak.tileset, clients: 1 });
  expect(here.globalFloor).toBeGreaterThan(50);
  expect(['normal', peak.weather]).toContain(here.weather);

  // Guardar y cargar dentro del pico: mismo sitio, mismo tema y el cliente sigue ahí
  await page.evaluate(() => window.game.saveGameData());
  await page.reload();
  await option(page, 'Continuar partida').click();
  await dismissDialog(page);
  await expectExploring(page);
  expect(await where()).toEqual(here);

  // Se cumple hablando con el cliente y se cobra al volver
  const key = await standNextTo(page, 'missionClient');
  await page.keyboard.press(key);
  expect(await dialogText(page)).toContain('¡Habéis venido a por mí!');
  await dismissDialog(page);
  await expect(panelTitle(page)).toHaveText('¡MISIÓN CUMPLIDA!');
  await option(page, 'Volver al pueblo').click();
  await expect.poll(() => page.evaluate(() => window.game.getState())).toBe('TOWN');
  const summary = await dialogText(page);
  expect(summary).toContain(`Misión de ${mission.clientName}: +${mission.reward.money} Poké`);
  expect(summary).toContain('+160 puntos de rango.');
});
