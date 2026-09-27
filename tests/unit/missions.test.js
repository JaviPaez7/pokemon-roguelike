import { describe, it, expect } from 'vitest';
import {
  generateBoard,
  refreshBoard,
  acceptMission,
  abandonMission,
  missionsHere,
  markMissionDone,
  revertDoneMissions,
  claimRewards,
  difficultyFor,
  describeMission,
  MAX_ACCEPTED,
  BOARD_SIZE,
  LOST_ITEMS,
  DELIVERY_ITEMS,
  REWARD_ITEMS,
} from '../../src/core/Missions.js';
import { createProfile } from '../../src/core/Profile.js';
import { getDungeon, floorCount } from '../../src/core/Dungeons.js';
import pokemonData from '../../src/data/pokemon.json';
import itemsData from '../../src/data/items.json';
import storyData from '../../src/data/story.json';

const itemName = (id) => itemsData.find((i) => i.id === id)?.name ?? id;

function newProfile() {
  const profile = createProfile({ teamName: 'Test', hero: { name: 'Pikachu' }, partner: { name: 'Squirtle' } });
  refreshBoard(profile, pokemonData);
  return profile;
}

describe('generateBoard', () => {
  it('el mismo día da el mismo tablón y otro día, otro', () => {
    const a = generateBoard({ day: 3, clearedDungeons: [], pokemonData });
    expect(generateBoard({ day: 3, clearedDungeons: [], pokemonData })).toEqual(a);
    expect(generateBoard({ day: 4, clearedDungeons: [], pokemonData })).not.toEqual(a);
    expect(a).toHaveLength(BOARD_SIZE);
  });

  it('solo propone mazmorras desbloqueadas y nunca el piso del jefe ni la Torre', () => {
    for (let day = 1; day <= 30; day++) {
      const cleared = ['bosque_verde', 'cueva_oscura'];
      for (const m of generateBoard({ day, clearedDungeons: cleared, pokemonData })) {
        expect(['bosque_verde', 'cueva_oscura', 'ruta_electrica']).toContain(m.dungeonId);
        const dungeon = getDungeon(m.dungeonId);
        expect(m.floor).toBeGreaterThanOrEqual(1);
        // Cueva Oscura y Ruta Eléctrica tienen jefe en el último piso
        const max = floorCount(dungeon) - (m.dungeonId === 'bosque_verde' ? 0 : 1);
        expect(m.floor).toBeLessThanOrEqual(max);
      }
    }
  });

  it('los objetos y los clientes existen en los datos', () => {
    for (let day = 1; day <= 20; day++) {
      for (const m of generateBoard({ day, clearedDungeons: ['bosque_verde'], pokemonData })) {
        expect(pokemonData.some((p) => p.id === m.clientSpeciesId)).toBe(true);
        if (m.itemId) expect(itemsData.some((i) => i.id === m.itemId), m.itemId).toBe(true);
        if (m.reward.itemId) expect(itemsData.some((i) => i.id === m.reward.itemId), m.reward.itemId).toBe(true);
        if (m.type === 'find_item') expect(LOST_ITEMS).toContain(m.itemId);
        if (m.type === 'deliver') expect(DELIVERY_ITEMS).toContain(m.itemId);
        if (m.type === 'rescue') expect(m.itemId).toBeNull();
      }
    }
    for (const id of [...LOST_ITEMS, ...DELIVERY_ITEMS, ...REWARD_ITEMS]) {
      expect(itemsData.some((i) => i.id === id), id).toBe(true);
    }
  });

  it('la dificultad y la recompensa crecen con el piso', () => {
    expect(difficultyFor(1).rank).toBe('E');
    expect(difficultyFor(12).rank).toBe('D');
    expect(difficultyFor(50).rank).toBe('S');
    expect(difficultyFor(51).rank).toBe('★');
    expect(difficultyFor(84).points).toBeGreaterThan(difficultyFor(50).points);
  });

  it('tras el final también hay encargos en las mazmorras de los legendarios, nunca en el piso del legendario', () => {
    const postgame = ['cumbre_escarcha', 'pico_tronador', 'caldera_ascua', 'jardin_primer_sueno'];
    const cleared = [...storyData.chapters, 'cumbre_escarcha', 'pico_tronador', 'caldera_ascua'];
    const found = new Set();
    for (let day = 1; day <= 40; day++) {
      // Sin haber visto el final, ninguno
      for (const m of generateBoard({ day, clearedDungeons: storyData.chapters, pokemonData })) {
        expect(postgame).not.toContain(m.dungeonId);
      }
      for (const m of generateBoard({ day, clearedDungeons: cleared, storySeen: ['F-3'], pokemonData })) {
        if (!postgame.includes(m.dungeonId)) continue;
        found.add(m.dungeonId);
        const dungeon = getDungeon(m.dungeonId);
        expect(m.floor).toBeLessThan(floorCount(dungeon));
        expect(m.difficulty).toBe('★');
        expect(pokemonData.some((p) => p.id === m.clientSpeciesId)).toBe(true);
        // Los legendarios no hacen encargos
        expect([144, 145, 146, 150, 151]).not.toContain(m.clientSpeciesId);
      }
    }
    expect([...found].sort()).toEqual([...postgame].sort());
  });

  it('refreshBoard lee las escenas vistas del perfil', () => {
    const profile = newProfile();
    profile.clearedDungeons = [...storyData.chapters];
    profile.story.seen = ['F-3'];
    const postgame = new Set(['cumbre_escarcha', 'pico_tronador', 'caldera_ascua']);
    let any = false;
    for (let day = 2; day <= 30 && !any; day++) {
      profile.day = day;
      refreshBoard(profile, pokemonData);
      any = profile.missions.board.some((m) => postgame.has(m.dungeonId));
    }
    expect(any).toBe(true);
  });
});

describe('aceptar, cumplir y cobrar', () => {
  it('refreshBoard llena el tablón una vez por día', () => {
    const profile = newProfile();
    const board = profile.missions.board;
    refreshBoard(profile, pokemonData);
    expect(profile.missions.board).toBe(board);
    profile.day += 1;
    refreshBoard(profile, pokemonData);
    expect(profile.missions.board).not.toBe(board);
  });

  it('aceptar pasa el encargo del tablón a las tareas, con un máximo', () => {
    const profile = newProfile();
    const [first] = profile.missions.board;
    expect(acceptMission(profile, first.id)).toEqual({ ok: true });
    expect(profile.missions.board.some((m) => m.id === first.id)).toBe(false);
    expect(profile.missions.accepted[0]).toMatchObject({ id: first.id, status: 'accepted' });
    expect(acceptMission(profile, first.id).ok).toBe(false);

    profile.missions.board = Array.from({ length: MAX_ACCEPTED }, (_, i) => ({ ...first, id: `x${i}` }));
    for (let i = 0; i < MAX_ACCEPTED - 1; i++) acceptMission(profile, `x${i}`);
    const full = acceptMission(profile, `x${MAX_ACCEPTED - 1}`);
    expect(full.ok).toBe(false);
    expect(full.error).toContain(`${MAX_ACCEPTED}`);
  });

  it('missionsHere encuentra lo pendiente en ese piso y abandonar lo quita', () => {
    const profile = newProfile();
    const [m] = profile.missions.board;
    acceptMission(profile, m.id);
    expect(missionsHere(profile, m.dungeonId, m.floor).map((x) => x.id)).toEqual([m.id]);
    markMissionDone(profile, m.id);
    expect(missionsHere(profile, m.dungeonId, m.floor)).toEqual([]);
    abandonMission(profile, m.id);
    expect(profile.missions.accepted).toEqual([]);
  });

  it('si el equipo cae, las cumplidas vuelven a pendientes', () => {
    const profile = newProfile();
    const [m] = profile.missions.board;
    acceptMission(profile, m.id);
    markMissionDone(profile, m.id);
    expect(revertDoneMissions(profile)).toBe(1);
    expect(profile.missions.accepted[0].status).toBe('accepted');
  });

  it('claimRewards paga dinero, objeto y puntos, y entrega el objeto buscado', () => {
    const profile = newProfile();
    profile.missions.accepted = [
      { id: 'a', type: 'rescue', clientName: 'Rattata', itemId: null, status: 'done', reward: { money: 100, itemId: 'ether', rankPoints: 10 } },
      { id: 'b', type: 'find_item', clientName: 'Pidgey', itemId: 'moon_stone', status: 'done', reward: { money: 50, itemId: null, rankPoints: 20 } },
      { id: 'c', type: 'rescue', clientName: 'Weedle', itemId: null, status: 'accepted', reward: { money: 999, itemId: null, rankPoints: 99 } },
    ];
    const bag = [{ itemId: 'moon_stone', quantity: 1 }, { itemId: 'apple', quantity: 2 }];

    const result = claimRewards(profile, { bag, wallet: 10, maxSlots: 24, itemName });

    expect(result.wallet).toBe(160);
    expect(result.rankPoints).toBe(30);
    expect(bag).toEqual([{ itemId: 'apple', quantity: 2 }, { itemId: 'ether', quantity: 1 }]);
    expect(profile.missions.accepted.map((m) => m.id)).toEqual(['c']);
    expect(profile.missions.completed).toBe(2);
    expect(result.lines).toHaveLength(2);
  });

  it('una misión de buscar objeto sin el objeto no se cobra', () => {
    const profile = newProfile();
    profile.missions.accepted = [
      { id: 'b', type: 'find_item', clientName: 'Pidgey', itemId: 'moon_stone', status: 'done', reward: { money: 50, itemId: null, rankPoints: 20 } },
    ];
    const result = claimRewards(profile, { bag: [], wallet: 0, maxSlots: 24, itemName });
    expect(result.wallet).toBe(0);
    expect(profile.missions.accepted[0].status).toBe('accepted');
  });

  it('con la mochila llena, el objeto de recompensa va al almacén', () => {
    const profile = newProfile();
    profile.missions.accepted = [
      { id: 'a', type: 'rescue', clientName: 'Rattata', itemId: null, status: 'done', reward: { money: 0, itemId: 'ether', rankPoints: 0 } },
    ];
    const bag = [{ itemId: 'apple', quantity: 1 }];
    claimRewards(profile, { bag, wallet: 0, maxSlots: 1, itemName });
    expect(bag).toEqual([{ itemId: 'apple', quantity: 1 }]);
    expect(profile.storage).toEqual([{ itemId: 'ether', quantity: 1 }]);
  });

  it('describeMission explica el encargo', () => {
    const [m] = generateBoard({ day: 1, clearedDungeons: [], pokemonData });
    const text = describeMission(m, { dungeonName: 'Bosque Verde', itemName });
    expect(text).toContain(m.clientName);
    expect(text).toContain(`Bosque Verde, piso ${m.floor}`);
  });
});
