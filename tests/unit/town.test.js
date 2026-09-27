import { describe, it, expect } from 'vitest';
import { TOWN, buildTownMap, isTownExit, townThingAt } from '../../src/map/Town.js';
import { keepInTown, keepTownMember } from '../../src/core/TownSession.js';
import { createProfile, getMember } from '../../src/core/Profile.js';

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
    expect(townThingAt(4, 15)).toEqual({ kind: 'npc', id: 'kecleon', role: 'shop', name: 'Kecleon', speciesId: 352 });
    expect(townThingAt(15, 3)).toEqual(expect.objectContaining({ kind: 'fixture', role: 'board' }));
    expect(townThingAt(TOWN.start.x, TOWN.start.y)).toBeNull();
  });

  it('una fila de otro ancho es un error claro', () => {
    const broken = { ...TOWN, rows: [...TOWN.rows.slice(0, -1), 'TT'] };
    expect(() => buildTownMap(broken)).toThrow('fila');
  });
});

describe('lo que cambia en el equipo del pueblo se apunta en la plantilla', () => {
  /**
   * Juego mínimo con el compañero en la entidad 7, ya evolucionado en el pueblo.
   * @param {{ dungeonId?: string | null }} [options]
   */
  function fakeGame({ dungeonId = null } = {}) {
    const profile = createProfile({
      teamName: 'Equipo Aurora',
      hero: { name: 'Charmander', speciesId: 4, level: 16, maxHp: 40, currentMoves: [] },
      partner: { name: 'Squirtle', speciesId: 7, level: 16, maxHp: 42, currentMoves: [] },
    });
    const evolved = {
      ...getMember(profile, profile.partnerUid),
      name: 'Wartortle',
      speciesId: 8,
      hp: 30,
      maxHp: 51,
      currentMoves: [{ moveId: 'bubble', currentPP: 10, maxPP: 30, enabled: true }],
      isLeader: true,
    };
    return {
      dungeonId,
      profile,
      saves: 0,
      movesData: [],
      saveGameData() {
        this.saves += 1;
        return true;
      },
      entityManager: {
        getComponent: (id, name) => (id === 7 && name === 'partyMember' ? { uid: profile.partnerUid } : null),
      },
      memberData: (id) => (id === 7 ? evolved : null),
    };
  }

  it('keepInTown apunta el cambio y guarda en el pueblo; en la mazmorra no hace nada', () => {
    const town = fakeGame();
    expect(keepInTown(town, (profile) => { profile.flags.touched = true; })).toBe(true);
    expect(town.profile.flags.touched).toBe(true);
    expect(town.saves).toBe(1);

    const dungeon = fakeGame({ dungeonId: 'bosque_verde' });
    expect(keepInTown(dungeon, (profile) => { profile.flags.touched = true; })).toBe(false);
    expect(dungeon.profile.flags.touched).toBeUndefined();
    expect(dungeon.saves).toBe(0);
  });

  it('keepTownMember guarda la ficha como está ahora (una evolución), descansada y sin ser líder', () => {
    const game = fakeGame();
    expect(keepTownMember(game, 7)).toBe(true);
    expect(getMember(game.profile, game.profile.partnerUid)).toMatchObject({
      name: 'Wartortle',
      speciesId: 8,
      hp: 51,
      maxHp: 51,
      currentMoves: [{ moveId: 'bubble', currentPP: 30, maxPP: 30, enabled: true }],
      isLeader: false,
    });
    expect(game.profile.roster).toHaveLength(2);
    expect(game.saves).toBe(1);
  });

  it('keepTownMember no toca la plantilla en la mazmorra ni con un Pokémon que no está en ella', () => {
    const dungeon = fakeGame({ dungeonId: 'bosque_verde' });
    expect(keepTownMember(dungeon, 7)).toBe(false);
    expect(getMember(dungeon.profile, dungeon.profile.partnerUid).name).toBe('Squirtle');

    const town = fakeGame();
    const before = structuredClone(town.profile.roster);
    keepTownMember(town, 99);
    expect(town.profile.roster).toEqual(before);
  });
});
