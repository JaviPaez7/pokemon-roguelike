import { describe, it, expect } from 'vitest';
import { EntityManager } from '../../src/entities/EntityManager.js';
import { EventBus } from '../../src/core/EventBus.js';
import { TileMap } from '../../src/map/TileMap.js';
import { TILES } from '../../src/map/TileTypes.js';
import { getMoveTargets, lineDirectionTo, inRoomReach, areFoes, moveRange } from '../../src/systems/MoveTargeting.js';

/**
 * Mapa de 20×9: una sala (1..10, 1..7) y un pasillo hacia la derecha en y=4.
 * Muro en (6, 2) para cortar líneas.
 */
function makeWorld() {
  const map = new TileMap(20, 9);
  for (let y = 1; y <= 7; y++) for (let x = 1; x <= 10; x++) map.setTile(x, y, TILES.FLOOR.id);
  for (let x = 11; x <= 18; x++) map.setTile(x, 4, TILES.CORRIDOR.id);
  map.setTile(6, 2, TILES.WALL.id);
  map.rooms = [{ x: 1, y: 1, w: 10, h: 7 }];
  const em = new EntityManager(new EventBus());
  const game = { entityManager: em, tileMap: map };
  const spawn = (x, y, { party = false, facing = 'right', npc = null, hp = 10 } = {}) => {
    const id = em.createEntity();
    em.setComponent(id, 'position', { x, y, facing });
    em.setComponent(id, 'pokemonInfo', { name: `e${id}` });
    em.setComponent(id, 'fighter', { hp, maxHp: 10 });
    if (party) em.setComponent(id, 'partyMember', { slot: 0 });
    if (npc) em.setComponent(id, npc, {});
    return id;
  };
  return { game, em, spawn };
}

const move = (range) => ({ range });

describe('moveRange', () => {
  it('por defecto es front', () => {
    expect(moveRange({})).toBe('front');
    expect(moveRange(null)).toBe('front');
    expect(moveRange({ range: 'room' })).toBe('room');
  });
});

describe('areFoes', () => {
  it('el equipo y los salvajes son rivales; los del mismo bando, no', () => {
    const { em, spawn } = makeWorld();
    const hero = spawn(2, 4, { party: true });
    const ally = spawn(3, 4, { party: true });
    const wild = spawn(5, 4);
    expect(areFoes(em, hero, wild)).toBe(true);
    expect(areFoes(em, hero, ally)).toBe(false);
    expect(areFoes(em, hero, hero)).toBe(false);
  });
});

describe('línea recta', () => {
  it('alcanza al primer rival hacia donde se mira, atravesando aliados', () => {
    const { game, spawn } = makeWorld();
    const hero = spawn(2, 4, { party: true, facing: 'right' });
    spawn(4, 4, { party: true });
    const first = spawn(6, 4);
    spawn(8, 4);
    expect(getMoveTargets(game, hero, move('line'))).toEqual([first]);
  });

  it('los muros la paran y fuera de alcance no hay objetivo', () => {
    const { game, spawn } = makeWorld();
    const hero = spawn(6, 5, { party: true, facing: 'up' });
    spawn(6, 1); // detrás del muro de (6, 2)
    expect(getMoveTargets(game, hero, move('line'))).toEqual([]);

    const far = makeWorld();
    const h = far.spawn(1, 4, { party: true, facing: 'right' });
    far.spawn(12, 4); // 11 casillas
    expect(getMoveTargets(far.game, h, move('line'))).toEqual([]);
  });

  it('también en diagonal', () => {
    const { game, em, spawn } = makeWorld();
    const hero = spawn(2, 2, { party: true });
    Object.assign(em.getComponent(hero, 'position'), { facingDx: 1, facingDy: 1 });
    const foe = spawn(5, 5);
    expect(getMoveTargets(game, hero, move('line'))).toEqual([foe]);
  });

  it('ignora a los debilitados y a los PNJ', () => {
    const { game, spawn } = makeWorld();
    const hero = spawn(2, 4, { party: true });
    spawn(3, 4, { hp: 0 });
    spawn(4, 4, { npc: 'npcMerchant' });
    const foe = spawn(5, 4);
    expect(getMoveTargets(game, hero, move('line'))).toEqual([foe]);
  });
});

describe('alrededor y sala', () => {
  it('alrededor: todos los rivales de las 8 casillas vecinas', () => {
    const { game, spawn } = makeWorld();
    const hero = spawn(5, 4, { party: true });
    const a = spawn(4, 3);
    const b = spawn(6, 5);
    spawn(7, 4); // a 2 casillas
    spawn(5, 5, { party: true });
    expect(getMoveTargets(game, hero, move('around')).sort()).toEqual([a, b].sort());
  });

  it('sala: todos los rivales de la sala, del más cercano al más lejano', () => {
    const { game, spawn } = makeWorld();
    const hero = spawn(2, 4, { party: true });
    const near = spawn(4, 4);
    const far = spawn(9, 7);
    spawn(15, 4); // en el pasillo
    expect(getMoveTargets(game, hero, move('room'))).toEqual([near, far]);
  });

  it('sala desde un pasillo: los que estén a 2 casillas o menos', () => {
    const { game, spawn } = makeWorld();
    const hero = spawn(14, 4, { party: true });
    const close = spawn(16, 4);
    spawn(18, 4);
    expect(getMoveTargets(game, hero, move('room'))).toEqual([close]);
  });
});

describe('uno mismo y equipo', () => {
  it('self es el usuario y team, el usuario y sus aliados de la zona', () => {
    const { game, spawn } = makeWorld();
    const hero = spawn(2, 4, { party: true });
    const ally = spawn(3, 4, { party: true });
    spawn(15, 4, { party: true }); // aliado en el pasillo, lejos
    spawn(4, 4);
    expect(getMoveTargets(game, hero, move('self'))).toEqual([hero]);
    expect(getMoveTargets(game, hero, move('team'))).toEqual([hero, ally]);
  });
});

describe('ayudas para la IA', () => {
  it('lineDirectionTo solo si está alineado, a tiro y sin nadie delante', () => {
    const { game, spawn } = makeWorld();
    const wild = spawn(8, 4);
    const hero = spawn(3, 4, { party: true });
    expect(lineDirectionTo(game, wild, hero)).toEqual([-1, 0]);

    const other = makeWorld();
    const w = other.spawn(8, 4);
    const h = other.spawn(3, 5, { party: true });
    expect(lineDirectionTo(other.game, w, h)).toBeNull(); // no alineado
  });

  it('inRoomReach: misma sala', () => {
    const { game, spawn } = makeWorld();
    const wild = spawn(9, 6);
    const hero = spawn(2, 2, { party: true });
    const outside = spawn(16, 4, { party: true });
    expect(inRoomReach(game, wild, hero)).toBe(true);
    expect(inRoomReach(game, wild, outside)).toBe(false);
  });
});
