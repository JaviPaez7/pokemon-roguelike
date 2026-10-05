// Experiencia: cada Pokémon llega con la de su nivel (createPokemon), así que
// un recluta sube al ritmo del resto del equipo, y las partidas v6, en las que
// los reclutas llegaban con 0, se corrigen al cargar.
import { test, expect, startInDungeon, expectExploring, dismissDialog, dialogText } from './fixtures.js';

const RATTATA = 19;

/** @param {import('@playwright/test').Page} page @param {string} text */
const option = (page, text) => page.locator('#menu-container .menu-option', { hasText: text });

/**
 * Crea un Rattata salvaje de ese nivel en una casilla libre, el líder lo
 * derrota y, con la tirada forzada, se une al equipo.
 * @param {import('@playwright/test').Page} page
 * @param {number} level
 * @returns {Promise<number>} Id de la entidad del recluta
 */
async function recruitWild(page, level) {
  const { id, name } = await page.evaluate(
    ({ speciesId, level }) => {
      const game = window.game;
      const em = game.entityManager;
      const map = game.tileMap;
      let spot = null;
      for (let y = 0; y < map.height && !spot; y++) {
        for (let x = 0; x < map.width && !spot; x++) {
          if (map.isWalkable(x, y) && !map.isStairs(x, y) && em.getEntityAt(x, y, true) === null) spot = { x, y };
        }
      }
      const id = em.createPokemon(speciesId, level, spot.x, spot.y, true);
      game.turnManager.addEntity(id, em.getComponent(id, 'fighter').speed, false);
      em.getComponent(id, 'fighter').hp = 0;
      game.debug.forceRecruit = true;
      game.eventBus.emit('pokemon_fainted', { entityId: id, attackerId: game.getPlayerId() });
      return { id, name: em.getComponent(id, 'pokemonInfo').name };
    },
    { speciesId: RATTATA, level },
  );
  await dismissDialog(page);
  await option(page, 'Sí').click();
  expect(await dialogText(page)).toContain(`¡${name} se ha unido a vuestro equipo!`);
  await dismissDialog(page);
  await expectExploring(page);
  await page.evaluate(() => {
    window.game.debug.forceRecruit = null;
  });
  return id;
}

/** Nivel y experiencia de cada miembro del equipo. */
const partyExp = (page) => page.evaluate(() => window.game.party.map((p) => ({ id: p.id, level: p.level, xp: p.xp })));

test('un recluta llega con la experiencia de su nivel y sube tras unos pocos salvajes', async ({ page }) => {
  await startInDungeon(page);
  // El protagonista y el compañero también empiezan con la de su nivel
  for (const member of await partyExp(page)) expect(member.xp).toBe(member.level ** 3);

  const recruitId = await recruitWild(page, 20);
  const recruit = (await partyExp(page)).find((p) => p.id === recruitId);
  expect(recruit).toEqual({ id: recruitId, level: 20, xp: 20 ** 3 });

  // El líder derrota salvajes del nivel del recluta con un movimiento que no
  // falla, por el camino normal del combate, que reparte la experiencia
  const kills = await page.evaluate(
    ({ recruitId, speciesId, level }) => {
      const game = window.game;
      const em = game.entityManager;
      const map = game.tileMap;
      const move = game.movesData.find((m) => m.effect === 'never_miss' && m.power > 0);
      game.debug.forceRecruit = false;
      for (let kills = 1; kills <= 50; kills++) {
        let spot = null;
        for (let y = 0; y < map.height && !spot; y++) {
          for (let x = 0; x < map.width && !spot; x++) {
            if (map.isWalkable(x, y) && !map.isStairs(x, y) && em.getEntityAt(x, y, true) === null) spot = { x, y };
          }
        }
        const id = em.createPokemon(speciesId, level, spot.x, spot.y, true);
        game.turnManager.addEntity(id, em.getComponent(id, 'fighter').speed, false);
        em.getComponent(id, 'fighter').hp = 1;
        game.combat._resolveMoveOn(game.getPlayerId(), id, move, false);
        if ((em.getComponent(id, 'fighter')?.hp ?? 0) > 0) throw new Error('El salvaje no ha caído');
        if (em.getComponent(recruitId, 'pokemonInfo').level > level) return kills;
      }
      return null;
    },
    { recruitId, speciesId: RATTATA, level: 20 },
  );
  // Seis salvajes de su nivel; cuando llegaba con 0 de experiencia eran cuarenta
  expect(kills).not.toBeNull();
  expect(kills).toBeLessThanOrEqual(8);
  expect((await partyExp(page)).find((p) => p.id === recruitId).level).toBe(21);
});

test('una partida v6 con un recluta a 0 de experiencia se carga con la de su nivel y guarda la original', async ({ page }) => {
  await startInDungeon(page);
  await recruitWild(page, 30);
  await page.evaluate(() => window.game.saveGameData());
  // En la v6 los reclutas llegaban con 0 de experiencia, y el protagonista y
  // el compañero empezaban igual
  const v6 = await page.evaluate((speciesId) => {
    const save = JSON.parse(localStorage.getItem('pokerogue_save'));
    const { heroUid, partnerUid } = save.profile;
    save.run.party.find((p) => p.speciesId === speciesId && p.level === 30).xp = 0;
    save.profile.roster.find((p) => p.uid === heroUid).xp = 0;
    const partner = save.run.party.find((p) => p.uid === partnerUid);
    partner.xp = partner.level ** 3 + 50;
    const old = { ...save, version: 6 };
    localStorage.setItem('pokerogue_save', JSON.stringify(old));
    return old;
  }, RATTATA);

  await page.reload();
  const continueOption = option(page, 'Continuar partida');
  await expect(continueOption).toContainText('Bosque Verde P1');
  await continueOption.click();
  expect(await dialogText(page)).toContain('Partida cargada.');
  await dismissDialog(page);
  await expectExploring(page);

  const state = await page.evaluate(
    ({ speciesId, heroUid, partnerUid }) => {
      const game = window.game;
      return {
        recruit: game.party.find((p) => p.speciesId === speciesId && p.level === 30)?.xp,
        partner: game.party.find((p) => p.uid === partnerUid)?.xp,
        hero: game.profile.roster.find((p) => p.uid === heroUid)?.xp,
        version: JSON.parse(localStorage.getItem('pokerogue_save')).version,
        backup: JSON.parse(localStorage.getItem('pokerogue_save_backup_v6')),
      };
    },
    { speciesId: RATTATA, heroUid: v6.profile.heroUid, partnerUid: v6.profile.partnerUid },
  );
  const partnerLevel = v6.run.party.find((p) => p.uid === v6.profile.partnerUid).level;
  expect(state.recruit).toBe(30 ** 3);
  expect(state.hero).toBe(5 ** 3);
  // Nunca se baja
  expect(state.partner).toBe(partnerLevel ** 3 + 50);
  expect(state.version).toBe(7);
  expect(state.backup).toEqual(v6);
});
