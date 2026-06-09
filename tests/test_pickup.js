import fs from 'fs';
import { Game } from '../src/core/Game.js';
import { ACTIONS } from '../src/constants.js';

// Mock Canvas/Audio
global.window = {
  requestAnimationFrame: (cb) => setTimeout(cb, 16),
  cancelAnimationFrame: clearTimeout
};
global.document = {
  createElement: () => ({ getContext: () => ({ fillText: () => {}, fillRect: () => {}, clearRect: () => {}, measureText: () => ({ width: 10 }) }) }),
  getElementById: () => ({ classList: { add: () => {}, remove: () => {} }, style: {}, innerHTML: '', focus: () => {} })
};
global.Audio = class { play() {} };

const game = new Game('test-canvas');
game.loadData(
  JSON.parse(fs.readFileSync('./public/data/pokemon.json')),
  JSON.parse(fs.readFileSync('./public/data/moves.json')),
  JSON.parse(fs.readFileSync('./public/data/items.json'))
);
game._initNewGame(1);

const playerPos = game.entityManager.getComponent(game._playerId, 'position');

// Spawn item at player's right
const itemX = playerPos.x + 1;
const itemY = playerPos.y;
const itemId = game.entityManager.createItem('oran_berry', itemX, itemY);

console.log("Item created:", itemId, "at", itemX, itemY);
console.log("Player pos:", playerPos.x, playerPos.y);

// Make sure the tile is walkable
game.tileMap.map[itemY][itemX] = 1;

// Move right
game._processPlayerAction({ type: ACTIONS.MOVE, dx: 1, dy: 0 });

console.log("Player pos after move:", playerPos.x, playerPos.y);
console.log("Inventory size:", game.inventory.length);
if (game.inventory.length > 0) {
  console.log("Inventory contents:", game.inventory);
} else {
  console.log("Item was not picked up!");
}
console.log("Message log:", game._messageLog);
