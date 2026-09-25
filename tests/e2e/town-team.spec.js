// En el pueblo el equipo son copias de las fichas de la plantilla: lo que se
// cambia desde el menú de equipo (líder, táctica, una evolución) tiene que
// llegar a la plantilla para durar al guardar, al recargar y en la expedición.
import {
  test,
  expect,
  panelTitle,
  startNewGame,
  enterDungeon,
  expectInTown,
  expectExploring,
  dismissDialog,
  dialogText,
  skipDialogs,
} from './fixtures.js';

/** @param {import('@playwright/test').Page} page @param {string} text */
const option = (page, text) => page.locator('#menu-container .menu-option', { hasText: text }).first();

/**
 * Líder, orden y tácticas del equipo en juego y de la plantilla del perfil.
 * @param {import('@playwright/test').Page} page
 */
const teamState = (page) =>
  page.evaluate(() => {
    const game = window.game;
    const { profile } = game;
    return {
      leaderUid: game.entityManager.getComponent(game.getPlayerId(), 'partyMember').uid,
      partyUids: game.party.map((p) => p.uid),
      tactics: Object.fromEntries(game.party.map((p) => [p.uid, p.tactic])),
      teamUids: [...profile.teamUids],
      rosterTactics: Object.fromEntries(profile.roster.map((p) => [p.uid, p.tactic])),
    };
  });

/** @param {import('@playwright/test').Page} page */
async function saveFromPauseAndReload(page) {
  await page.keyboard.press('Escape');
  await expect(panelTitle(page)).toHaveText('PAUSA');
  await option(page, 'Guardar partida').click();
  await expect(page.locator('.dialog-panel')).toContainText('Partida guardada.');
  await dismissDialog(page);
  await page.reload();
  await option(page, 'Continuar partida').click();
  await dismissDialog(page);
  await expectInTown(page);
}

test('el líder y la táctica elegidos en el pueblo duran al guardar, al recargar, en la expedición y al volver', async ({ page }) => {
  await startNewGame(page);
  const cast = await page.evaluate(() => {
    const { profile } = window.game;
    const name = (uid) => profile.roster.find((p) => p.uid === uid).name;
    return { heroUid: profile.heroUid, partnerUid: profile.partnerUid, hero: name(profile.heroUid), partner: name(profile.partnerUid) };
  });

  // Equipo → compañero → liderar
  await page.keyboard.press('c');
  await expect(panelTitle(page)).toHaveText('EQUIPO POKÉMON');
  await option(page, cast.partner).click();
  await option(page, 'Establecer como Líder').click();
  expect(await dialogText(page)).toContain(`¡${cast.partner} ahora lidera el equipo!`);
  await dismissDialog(page);
  await expect(panelTitle(page)).toHaveText('EQUIPO POKÉMON');

  // Protagonista (ya no lidera) → táctica «A por ellos»
  await option(page, cast.hero).click();
  await option(page, 'Cambiar táctica').click();
  await expect(panelTitle(page)).toHaveText(`TÁCTICAS DE ${cast.hero.toUpperCase()}`);
  await option(page, 'A por ellos').click();
  await dismissDialog(page);
  for (let i = 0; i < 3; i++) await page.keyboard.press('Escape'); // ficha → equipo → pausa → pueblo
  await expectInTown(page);

  const expected = {
    leaderUid: cast.partnerUid,
    partyUids: [cast.partnerUid, cast.heroUid],
    tactics: { [cast.heroUid]: 'aggressive', [cast.partnerUid]: 'follow' },
    teamUids: [cast.partnerUid, cast.heroUid],
    rosterTactics: { [cast.heroUid]: 'aggressive', [cast.partnerUid]: 'follow' },
  };
  // La plantilla ya lo tiene, sin esperar a guardar
  expect(await teamState(page)).toEqual(expected);

  await saveFromPauseAndReload(page);
  expect(await teamState(page)).toEqual(expected);

  await enterDungeon(page);
  expect(await teamState(page)).toEqual(expected);

  await page.evaluate(() => window.game.completeDungeon());
  await expect.poll(() => page.evaluate(() => window.game.getState())).toBe('TOWN');
  await skipDialogs(page); // resumen y cierre del capítulo 1
  await expectInTown(page);
  expect(await teamState(page)).toEqual(expected);
});

test('una evolución hecha desde el equipo en el pueblo dura al recargar', async ({ page }) => {
  await startNewGame(page);
  // Un miembro que evoluciona por nivel, subido a ese nivel y con la evolución
  // rechazada (como si la hubiera cancelado en la mazmorra)
  const target = await page.evaluate(() => {
    const game = window.game;
    const levelEvo = (p) => game.evolutionsData.find((e) => e.from === p.speciesId && e.trigger === 'level');
    const member = game.party.find(levelEvo);
    if (!member) return null;
    const evo = levelEvo(member);
    const info = game.entityManager.getComponent(member.id, 'pokemonInfo');
    info.level = evo.level;
    info.evolutionDeclinedAtLevel = evo.level;
    return { uid: member.uid, name: member.name, to: evo.to, toName: game.pokemonData.find((p) => p.id === evo.to).name };
  });
  test.skip(!target, 'con esta semilla nadie del equipo evoluciona por nivel');

  await page.keyboard.press('c');
  await option(page, target.name).click();
  await option(page, 'Intentar evolucionar').click();
  await expect(panelTitle(page)).toHaveText('¡EVOLUCIÓN!');
  await option(page, 'Sí').click();
  expect(await dialogText(page)).toContain(`evolucionó a ${target.toName}`);
  await skipDialogs(page);
  await expectInTown(page);

  const member = () =>
    page.evaluate((uid) => {
      const { speciesId, name } = window.game.profile.roster.find((p) => p.uid === uid);
      return { speciesId, name };
    }, target.uid);
  expect(await member()).toEqual({ speciesId: target.to, name: target.toName });

  // La evolución guarda la partida: al recargar sigue evolucionado, también en el pueblo
  await page.reload();
  await option(page, 'Continuar partida').click();
  await dismissDialog(page);
  await expectInTown(page);
  expect(await member()).toEqual({ speciesId: target.to, name: target.toName });
  expect(await page.evaluate(() => window.game.party.map((p) => p.name))).toContain(target.toName);
});

test('en la mazmorra, cambiar de líder dura solo esa expedición', async ({ page }) => {
  await startNewGame(page);
  await enterDungeon(page);
  const { heroUid, partnerUid } = await page.evaluate(() => window.game.profile);
  await page.keyboard.press('Tab');
  await expect
    .poll(() => page.evaluate(() => window.game.entityManager.getComponent(window.game.getPlayerId(), 'partyMember').uid))
    .toBe(partnerUid);
  await expectExploring(page);

  await page.evaluate(() => window.game.completeDungeon());
  await expect.poll(() => page.evaluate(() => window.game.getState())).toBe('TOWN');
  await skipDialogs(page);
  await expectInTown(page);
  const state = await teamState(page);
  expect(state.teamUids).toEqual([heroUid, partnerUid]);
  expect(state.leaderUid).toBe(heroUid);
});
