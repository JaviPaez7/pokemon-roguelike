import { test, expect, panelTitle, startNewGame, startInDungeon, dismissDialog, expectExploring } from './fixtures.js';

test('un diálogo con el texto ya completo se cierra con una sola Z', async ({ page }) => {
  await startNewGame(page);
  await page.keyboard.press('Escape');
  await page.locator('#menu-container .menu-option', { hasText: 'Guardar partida' }).click();
  const dialog = page.locator('.dialog-panel');
  await expect(dialog).toContainText('Partida guardada.');
  // Esperar a que termine la animación letra a letra
  await expect
    .poll(() => page.evaluate(() => window.game.uiManager.dialog.dialogTimer))
    .toBeNull();

  await page.keyboard.press('z');

  await expect(dialog).toBeHidden();
  await expect(panelTitle(page)).toHaveText('PAUSA');
});

test('al reclutar, el diálogo «se ha unido» sigue en pantalla hasta cerrarlo', async ({ page }) => {
  await startInDungeon(page);
  const name = await page.evaluate(() => {
    const game = window.game;
    const em = game.entityManager;
    const wild = em
      .getEntitiesWithComponents('pokemonInfo', 'fighter')
      .find((id) => !em.hasComponent(id, 'partyMember'));
    const info = em.getComponent(wild, 'pokemonInfo');
    game.uiManager.openRecruitMenu(wild, info);
    return info.name;
  });
  await expect(panelTitle(page)).toHaveText(`¿RECLUTAR A ${name.toUpperCase()}?`);

  await page.keyboard.press('z'); // «Sí»

  const dialog = page.locator('.dialog-panel');
  await expect(dialog).toContainText(`¡${name} se ha unido a vuestro equipo`);
  expect(await page.evaluate(() => window.game.party.length)).toBe(3);
  await dismissDialog(page);
  await expectExploring(page);
});
