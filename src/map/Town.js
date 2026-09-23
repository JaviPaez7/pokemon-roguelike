/**
 * Town.js — Mapa del pueblo base.
 *
 * El pueblo está dibujado a mano en data/town.json, una fila de caracteres por
 * línea (la leyenda los traduce a tipos de casilla). Aquí se convierte en un
 * TileMap totalmente visible, sin niebla de guerra.
 */

import townData from '../data/town.json';
import { TileMap, VISIBILITY } from './TileMap.js';
import { TILES } from './TileTypes.js';

/** @typedef {{ x: number, y: number }} Point */

export const TOWN = townData;

/** Colores de fondo del pueblo (las casillas del pueblo traen los suyos). */
export const TOWN_BIOME = {
  name: 'Pueblo',
  floor: '#3f7a3a',
  wall: '#1d4a1b',
  corridor: '#b99b69',
  stairs: '#cdb685',
  water: '#3a86b8',
  gridLines: 'rgba(0, 0, 0, 0.05)',
  void: '#16331a',
};

/**
 * @param {typeof townData} [data]
 * @returns {TileMap}
 */
export function buildTownMap(data = townData) {
  const height = data.rows.length;
  const width = data.rows[0].length;
  const map = new TileMap(width, height);
  data.rows.forEach((row, y) => {
    if (row.length !== width) throw new Error(`La fila ${y} del pueblo mide ${row.length}, no ${width}`);
    [...row].forEach((char, x) => {
      const tile = TILES[data.legend[char]];
      if (!tile) throw new Error(`Carácter desconocido en el pueblo: '${char}' en (${x}, ${y})`);
      map.setTile(x, y, tile.id);
      map.visibility[y][x] = VISIBILITY.VISIBLE;
    });
  });
  map.biome = TOWN_BIOME;
  map.rooms = [];
  map.isTown = true;
  return map;
}

/** @param {TileMap} map @param {number} x @param {number} y */
export function isTownExit(map, x, y) {
  return map.getTile(x, y)?.id === TILES.TOWN_EXIT.id;
}

/**
 * Lo que hay en una casilla del pueblo con lo que se puede interactuar.
 * @param {number} x
 * @param {number} y
 * @param {typeof townData} [data]
 * @returns {{ kind: 'npc' | 'fixture', id: string, role: string, name: string } | null}
 */
export function townThingAt(x, y, data = townData) {
  const npc = data.npcs.find((n) => n.x === x && n.y === y);
  if (npc) return { kind: 'npc', id: npc.id, role: npc.role, name: npc.name };
  const fixture = data.fixtures.find((f) => f.x === x && f.y === y);
  if (fixture) return { kind: 'fixture', id: fixture.id, role: fixture.role, name: fixture.name };
  return null;
}
