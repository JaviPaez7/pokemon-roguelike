/**
 * MissionSystem.js — Las misiones dentro de la mazmorra.
 *
 * Al generar un piso aparecen los clientes (rescate y entrega) o los objetos
 * perdidos (buscar objeto) de las misiones aceptadas para ese piso. Chocar con
 * un cliente es hablar con él; recoger el objeto perdido cumple la misión. Al
 * cumplir una, se pregunta si volver al pueblo a cobrarla.
 */

import { missionsHere, getAccepted, markMissionDone } from '../core/Missions.js';

/**
 * Coloca los objetivos de misión del piso actual lejos de la entrada.
 * @param {import('../core/Game.js').Game} game
 */
export function spawnMissionTargets(game) {
  if (!game.profile || !game.dungeonId) return;
  // Las misiones de historia las resuelve su escena (la carta la recibe el jefe)
  const missions = missionsHere(game.profile, game.dungeonId, game.getCurrentFloor()).filter((m) => !m.story);
  if (missions.length === 0) return;

  const spots = candidateSpots(game);
  for (const mission of missions) {
    const spot = spots.shift();
    if (!spot) break;
    if (mission.type === 'find_item') {
      const meta = game.itemsData.find((i) => i.id === mission.itemId);
      const id = game.entityManager.createItemEntity(mission.itemId, 1, spot.x, spot.y, meta?.spriteUrl ?? '');
      game.entityManager.setComponent(id, 'missionItem', { missionId: mission.id });
      game.eventBus.emit('message', { text: `El ${meta?.name ?? mission.itemId} de ${mission.clientName} está en este piso.`, color: '#ffd166' });
    } else {
      spawnClient(game, mission, spot);
      game.eventBus.emit('message', { text: `¡${mission.clientName}, de vuestra misión, está en este piso!`, color: '#ffd166' });
    }
  }
}

/**
 * Casillas libres de suelo, de la más lejana a la entrada a la más cercana.
 * @param {import('../core/Game.js').Game} game
 * @returns {{ x: number, y: number }[]}
 */
function candidateSpots(game) {
  const em = game.entityManager;
  const start = game._playerStart ?? { x: 0, y: 0 };
  const seen = new Set();
  const points = [...(game._spawnPoints ?? []), ...(game._itemPoints ?? [])].filter((p) => {
    const key = `${p.x},${p.y}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return (
      game.tileMap.isWalkable(p.x, p.y) &&
      !game.tileMap.isStairs(p.x, p.y) &&
      em.getEntityAt(p.x, p.y, true) === null &&
      em.getTrapAt(p.x, p.y) === null
    );
  });
  const distance = (p) => Math.abs(p.x - start.x) + Math.abs(p.y - start.y);
  return points.sort((a, b) => distance(b) - distance(a) || a.y - b.y || a.x - b.x);
}

/**
 * Cliente de una misión: no pelea, no se mueve y los enemigos no lo atacan.
 * @param {import('../core/Game.js').Game} game
 * @param {import('../core/Missions.js').Mission} mission
 * @param {{ x: number, y: number }} spot
 */
function spawnClient(game, mission, spot) {
  const em = game.entityManager;
  const species = game.pokemonData.find((p) => p.id === mission.clientSpeciesId);
  const id = em.createEntity();
  em.setComponent(id, 'position', { x: spot.x, y: spot.y, facing: 'down', prevX: spot.x, prevY: spot.y, moveStartTime: 0 });
  em.setComponent(id, 'pokemonInfo', {
    speciesId: mission.clientSpeciesId,
    name: mission.clientName,
    level: 1,
    types: species?.types ?? ['normal'],
  });
  em.setComponent(id, 'sprite', { url: species?.sprite ?? '', image: null, loaded: false });
  em.setComponent(id, 'missionClient', { missionId: mission.id });
}

/**
 * El líder habla con un cliente de misión.
 * @param {import('../core/Game.js').Game} game
 * @param {number} clientId
 */
export function talkToMissionClient(game, clientId) {
  const em = game.entityManager;
  const { missionId } = em.getComponent(clientId, 'missionClient');
  const mission = getAccepted(game.profile, missionId);
  const ui = game.uiManager;
  if (!mission || mission.status !== 'accepted') {
    ui.showDialog('¡Gracias otra vez!');
    return;
  }
  const itemName = (id) => game.itemsData.find((i) => i.id === id)?.name ?? id;
  /** @param {string} emotion */
  const client = (emotion) => ({ speaker: mission.clientName, portrait: { speciesId: mission.clientSpeciesId, emotion } });

  if (mission.type === 'deliver') {
    const slot = game.inventory.find((s) => s.itemId === mission.itemId);
    if (!slot) {
      ui.showDialog(`¿Me traéis ${itemName(mission.itemId)}? Lo necesito de verdad…`, null, false, client('Worried'));
      return;
    }
    slot.quantity -= 1;
    if (slot.quantity === 0) game.inventory.splice(game.inventory.indexOf(slot), 1);
    markMissionDone(game.profile, mission.id);
    em.destroyEntity(clientId);
    ui.showDialog(
      `¡Mi ${itemName(mission.itemId)}! Muchísimas gracias.\n\nOs espero en el pueblo con la recompensa.`,
      () => afterMissionDone(game),
      false,
      client('Joyous'),
    );
    return;
  }

  // Rescate: el cliente vuelve al pueblo con su insignia de rescate
  markMissionDone(game.profile, mission.id);
  em.destroyEntity(clientId);
  ui.showDialog(
    `¡Habéis venido a por mí! Gracias, de verdad.\n\nVuelvo al pueblo; allí os daré la recompensa.`,
    () => afterMissionDone(game),
    false,
    client('Teary-Eyed'),
  );
}

/**
 * Se ha recogido el objeto perdido de una misión.
 * @param {import('../core/Game.js').Game} game
 * @param {string} missionId
 */
export function onMissionItemFound(game, missionId) {
  const mission = getAccepted(game.profile, missionId);
  if (!mission || mission.status !== 'accepted') return;
  markMissionDone(game.profile, mission.id);
  const name = game.itemsData.find((i) => i.id === mission.itemId)?.name ?? mission.itemId;
  game.uiManager.showDialog(`¡Es el ${name} que perdió ${mission.clientName}!\n\nLlevádselo al pueblo para cobrar la misión.`, () =>
    afterMissionDone(game),
  );
}

/** Tras cumplir una misión, ofrecer volver al pueblo. */
function afterMissionDone(game) {
  game.saveGameData();
  game.uiManager.openMissionReturnPrompt();
}
