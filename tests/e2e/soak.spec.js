// Prueba de resistencia: un bot juega cientos de turnos con semilla fija
// (busca enemigos, pelea, recoge y baja pisos) y cualquier error de consola
// hace fallar el test. Cubre combate, IA, experiencia y generación de pisos.
import { test, expect, startNewGame } from './fixtures.js';

/**
 * Decide la siguiente tecla: resuelve menús y diálogos; en exploración va a
 * por el enemigo más cercano y, si no hay, a la escalera.
 */
function botKey() {
  const game = window.game;
  const ui = game.uiManager;
  const state = game.getState();
  if (state === 'GAME_OVER' || state === 'VICTORY') return null;
  if (ui.hasOpenDialog()) return 'KeyZ';
  if (state === 'MENU') {
    // Escaleras: bajar. Aprender movimiento / evolucionar / reclutar: aceptar.
    if (['stairs_menu', 'learn_move', 'evolution', 'recruit_menu'].includes(ui.currentMenuType)) return 'KeyZ';
    return 'Escape';
  }
  if (state !== 'EXPLORING') return 'KeyZ';

  const em = game.entityManager;
  const me = em.getComponent(game.getPlayerId(), 'position');
  const foes = em
    .getEntitiesWithComponents('pokemonInfo', 'fighter', 'position')
    .filter((id) => !em.hasComponent(id, 'partyMember') && !em.hasComponent(id, 'npcMerchant') && em.getComponent(id, 'fighter').hp > 0)
    .map((id) => em.getComponent(id, 'position'));
  const goals = foes.length ? foes : [game._stairsPos];

  // BFS ortogonal desde el jugador hasta el objetivo alcanzable más cercano
  const key = (x, y) => `${x},${y}`;
  const goalKeys = new Set(goals.map((g) => key(g.x, g.y)));
  const prev = new Map([[key(me.x, me.y), null]]);
  const queue = [[me.x, me.y]];
  let reached = null;
  while (queue.length) {
    const [x, y] = queue.shift();
    if (goalKeys.has(key(x, y))) {
      reached = [x, y];
      break;
    }
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx;
      const ny = y + dy;
      if (prev.has(key(nx, ny)) || !game.tileMap.isWalkable(nx, ny)) continue;
      prev.set(key(nx, ny), [x, y]);
      queue.push([nx, ny]);
    }
  }
  if (!reached) return 'Space';
  let step = reached;
  while (prev.get(key(...step)) && key(...prev.get(key(...step))) !== key(me.x, me.y)) {
    step = prev.get(key(...step));
  }
  if (key(...step) === key(me.x, me.y)) return 'KeyZ'; // encima de la escalera
  const codes = { '1,0': 'ArrowRight', '-1,0': 'ArrowLeft', '0,1': 'ArrowDown', '0,-1': 'ArrowUp' };
  return codes[`${step[0] - me.x},${step[1] - me.y}`];
}

/**
 * Deja que el bot juegue hasta `turns` turnos (o hasta perder o ganar).
 * El límite es de turnos y no de pulsaciones: los diálogos animados piden una
 * o dos Z según el tiempo real, y eso no debe cambiar dónde acaba la partida.
 * @param {import('@playwright/test').Page} page
 * @param {number} turns
 */
async function playUntil(page, turns) {
  for (let i = 0; i < turns * 6; i++) {
    const code = await page.evaluate(
      ([bot, target]) => (window.game.stats.turnsPlayed >= target ? null : new Function(`return (${bot})()`)()),
      [botKey.toString(), turns],
    );
    if (code === null) break;
    await page.keyboard.press(code);
    // Esperar a que el bucle del juego consuma la acción antes de decidir otra
    await page.waitForFunction(() => window.game.inputHandler.peekAction() === null);
  }
}

/** Todo lo que debería repetirse con la misma semilla y las mismas teclas. */
function fingerprint(page) {
  return page.evaluate(() => {
    const game = window.game;
    const em = game.entityManager;
    return {
      state: game.getState(),
      floor: game.getCurrentFloor(),
      stats: game.stats,
      coins: game.coins,
      inventory: game.inventory,
      party: game.party.map((p) => ({ name: p.name, level: p.level, hp: p.hp, xp: p.xp })),
      // Sin moveStartTime: es la marca de tiempo de la animación, no estado de juego
      position: (({ x, y, facing }) => ({ x, y, facing }))(em.getComponent(game.getPlayerId(), 'position')),
      enemies: em
        .getEntitiesWithComponents('pokemonInfo', 'fighter', 'position')
        .filter((id) => !em.hasComponent(id, 'partyMember'))
        .map((id) => {
          const pos = em.getComponent(id, 'position');
          return [em.getComponent(id, 'pokemonInfo').name, em.getComponent(id, 'fighter').hp, pos.x, pos.y];
        }),
    };
  });
}

test('un bot juega 300 turnos sin errores', async ({ page }) => {
  test.setTimeout(180_000);
  await startNewGame(page);

  await playUntil(page, 300);

  const { state, floor, stats, party } = await fingerprint(page);
  const result = { state, floor, turns: stats.turnsPlayed, dealt: stats.totalDamageDealt, defeated: stats.pokemonDefeated, level: party[0]?.level };
  test.info().annotations.push({ type: 'resultado', description: JSON.stringify(result) });
  expect(result.turns >= 300 || ['GAME_OVER', 'VICTORY'].includes(state), JSON.stringify(result)).toBe(true);
  expect(result.dealt, JSON.stringify(result)).toBeGreaterThan(0);
});

test('con la misma semilla y las mismas teclas la partida se repite exactamente', async ({ page }) => {
  test.setTimeout(180_000);
  const runs = [];
  for (let i = 0; i < 2; i++) {
    await startNewGame(page, { seed: 4242 });
    await playUntil(page, 120);
    runs.push(await fingerprint(page));
  }
  expect(runs[0].stats.turnsPlayed).toBeGreaterThanOrEqual(120);
  expect(runs[1]).toEqual(runs[0]);
});
