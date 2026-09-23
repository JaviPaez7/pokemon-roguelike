import { describe, it, expect } from 'vitest';
import { TOWN, buildTownMap, isTownExit, townThingAt } from '../../src/map/Town.js';

const map = buildTownMap();
const npcTiles = new Set(TOWN.npcs.map((n) => `${n.x},${n.y}`));

/** Casillas alcanzables a pie desde el inicio (los PNJ bloquean el paso). */
function reachable() {
  const seen = new Set([`${TOWN.start.x},${TOWN.start.y}`]);
  const queue = [[TOWN.start.x, TOWN.start.y]];
  while (queue.length) {
    const [x, y] = queue.shift();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const key = `${x + dx},${y + dy}`;
      if (seen.has(key) || npcTiles.has(key) || !map.isWalkable(x + dx, y + dy)) continue;
      seen.add(key);
      queue.push([x + dx, y + dy]);
    }
  }
  return seen;
}

/** Si se puede hablar con lo que hay en (x, y) desde alguna casilla vecina alcanzable. */
function canInteract(seen, { x, y }) {
  return [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => seen.has(`${x + dx},${y + dy}`));
}

describe('mapa del pueblo', () => {
  it('se construye entero, visible y con la leyenda completa', () => {
    expect(map.width).toBe(TOWN.rows[0].length);
    expect(map.height).toBe(TOWN.rows.length);
    expect(map.visibility.flat().every((v) => v === 2)).toBe(true);
  });

  it('el inicio y el punto de regreso son transitables', () => {
    expect(map.isWalkable(TOWN.start.x, TOWN.start.y)).toBe(true);
    expect(map.isWalkable(TOWN.exitReturn.x, TOWN.exitReturn.y)).toBe(true);
  });

  it('cada PNJ está sobre suelo y se puede hablar con él', () => {
    const seen = reachable();
    for (const npc of TOWN.npcs) {
      expect(map.isWalkable(npc.x, npc.y), npc.id).toBe(true);
      expect(canInteract(seen, npc), npc.id).toBe(true);
    }
  });

  it('se llega a la base, al tablón y a la salida', () => {
    const seen = reachable();
    for (const fixture of TOWN.fixtures) {
      expect(canInteract(seen, fixture), fixture.id).toBe(true);
    }
    const exits = [...seen].map((k) => k.split(',').map(Number)).filter(([x, y]) => isTownExit(map, x, y));
    expect(exits.length).toBeGreaterThan(0);
  });

  it('townThingAt encuentra PNJ y elementos fijos', () => {
    expect(townThingAt(4, 15)).toEqual({ kind: 'npc', id: 'kecleon', role: 'shop', name: 'Kecleon' });
    expect(townThingAt(15, 3)).toEqual(expect.objectContaining({ kind: 'fixture', role: 'board' }));
    expect(townThingAt(TOWN.start.x, TOWN.start.y)).toBeNull();
  });

  it('una fila de otro ancho es un error claro', () => {
    const broken = { ...TOWN, rows: [...TOWN.rows.slice(0, -1), 'TT'] };
    expect(() => buildTownMap(broken)).toThrow('fila');
  });
});
