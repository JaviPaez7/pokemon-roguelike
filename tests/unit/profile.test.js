import { describe, it, expect } from 'vitest';
import {
  createProfile,
  addToRoster,
  getMember,
  updateMember,
  setTeam,
  rankFor,
  nextRank,
  addRankPoints,
  bankDeposit,
  bankWithdraw,
  transferItem,
  defeatLosses,
  markCleared,
  setLeader,
  setTactic,
} from '../../src/core/Profile.js';

const poke = (name, level = 5) => ({ name, level, speciesId: name.toLowerCase() });

function newProfile() {
  return createProfile({ teamName: 'Equipo Prueba', hero: poke('Pikachu'), partner: poke('Squirtle') });
}

describe('plantilla y equipo', () => {
  it('un perfil nuevo tiene al protagonista y al compañero en el equipo', () => {
    const profile = newProfile();
    expect(profile.teamName).toBe('Equipo Prueba');
    expect(getMember(profile, profile.heroUid).name).toBe('Pikachu');
    expect(getMember(profile, profile.partnerUid).name).toBe('Squirtle');
    expect(profile.teamUids).toEqual([profile.heroUid, profile.partnerUid]);
  });

  it('cada reclutado recibe un uid distinto', () => {
    const profile = newProfile();
    const a = addToRoster(profile, poke('Rattata'));
    const b = addToRoster(profile, poke('Pidgey'));
    expect(new Set([profile.heroUid, profile.partnerUid, a, b]).size).toBe(4);
  });

  it('updateMember sustituye la ficha por uid', () => {
    const profile = newProfile();
    updateMember(profile, { ...getMember(profile, profile.heroUid), level: 12 });
    expect(getMember(profile, profile.heroUid).level).toBe(12);
    expect(() => updateMember(profile, { uid: 999 })).toThrow('999');
  });

  it('setLeader pone al elegido al frente y el líder anterior ocupa su sitio', () => {
    const profile = newProfile();
    const a = addToRoster(profile, poke('Rattata'));
    setTeam(profile, [profile.heroUid, profile.partnerUid, a]);
    expect(setLeader(profile, a)).toBe(true);
    expect(profile.teamUids).toEqual([a, profile.partnerUid, profile.heroUid]);
    expect(setLeader(profile, a)).toBe(false); // ya lo era
    expect(setLeader(profile, 999)).toBe(false); // no está en el equipo
    expect(profile.teamUids).toEqual([a, profile.partnerUid, profile.heroUid]);
  });

  it('setTactic apunta la táctica en la ficha', () => {
    const profile = newProfile();
    setTactic(profile, profile.partnerUid, 'wait');
    expect(getMember(profile, profile.partnerUid).tactic).toBe('wait');
    setTactic(profile, 999, 'wait'); // sin ficha, nada
  });

  it('setTeam acepta hasta 4 con protagonista y compañero', () => {
    const profile = newProfile();
    const a = addToRoster(profile, poke('Rattata'));
    const b = addToRoster(profile, poke('Pidgey'));
    expect(setTeam(profile, [profile.heroUid, profile.partnerUid, a, b])).toEqual({ ok: true });
    expect(profile.teamUids).toHaveLength(4);
  });

  it.each([
    ['sin protagonista', (p, a) => [p.partnerUid, a], 'protagonista'],
    ['sin compañero', (p, a) => [p.heroUid, a], 'compañero'],
    ['repetidos', (p) => [p.heroUid, p.heroUid, p.partnerUid], 'repetido'],
    ['uid inexistente', (p) => [p.heroUid, p.partnerUid, 999], 'no está'],
    ['más de 4', (p, a, b, c) => [p.heroUid, p.partnerUid, a, b, c], '1 a 4'],
  ])('setTeam rechaza un equipo %s', (_, build, error) => {
    const profile = newProfile();
    const extra = [1, 2, 3].map((i) => addToRoster(profile, poke(`Extra${i}`)));
    const result = setTeam(profile, build(profile, ...extra));
    expect(result.ok).toBe(false);
    expect(result.error).toContain(error);
  });
});

describe('rangos', () => {
  it('rankFor y nextRank', () => {
    expect(rankFor(0).id).toBe('normal');
    expect(rankFor(49).id).toBe('normal');
    expect(rankFor(50).id).toBe('bronce');
    expect(nextRank(0)).toEqual({ rank: expect.objectContaining({ id: 'bronce' }), missing: 50 });
    expect(nextRank(999999)).toBeNull();
  });

  it('addRankPoints avisa solo al subir de rango', () => {
    const profile = newProfile();
    expect(addRankPoints(profile, 30)).toBeNull();
    expect(addRankPoints(profile, 30)).toEqual(expect.objectContaining({ id: 'bronce' }));
    expect(profile.rankPoints).toBe(60);
  });
});

describe('banco', () => {
  it('ingresar y sacar mueven dinero sin crear ni perder nada', () => {
    const profile = newProfile();
    let wallet = bankDeposit(profile, 300, 120);
    expect([wallet, profile.bank]).toEqual([180, 120]);
    wallet = bankWithdraw(profile, wallet, 50);
    expect([wallet, profile.bank]).toEqual([230, 70]);
  });

  it('no se ingresa más de lo que hay ni se saca más de lo ahorrado', () => {
    const profile = newProfile();
    expect(bankDeposit(profile, 40, 100)).toBe(0);
    expect(profile.bank).toBe(40);
    expect(bankWithdraw(profile, 0, 500)).toBe(40);
    expect(profile.bank).toBe(0);
    expect(bankDeposit(profile, 10, -5)).toBe(10);
  });
});

describe('transferItem', () => {
  it('mueve unidades y junta las del mismo objeto', () => {
    const bag = [{ itemId: 'apple', quantity: 3 }];
    const storage = [{ itemId: 'apple', quantity: 1 }];
    expect(transferItem(bag, storage, 'apple', 2)).toBe(2);
    expect(bag).toEqual([{ itemId: 'apple', quantity: 1 }]);
    expect(storage).toEqual([{ itemId: 'apple', quantity: 3 }]);
  });

  it('quita la casilla de origen al vaciarla', () => {
    const bag = [{ itemId: 'potion', quantity: 1 }];
    const storage = [];
    expect(transferItem(bag, storage, 'potion', 5)).toBe(1);
    expect(bag).toEqual([]);
    expect(storage).toEqual([{ itemId: 'potion', quantity: 1 }]);
  });

  it('respeta las casillas libres y el máximo por objeto del destino', () => {
    const storage = [{ itemId: 'apple', quantity: 2 }];
    const bag = [{ itemId: 'potion', quantity: 1 }];
    expect(transferItem(storage, bag, 'apple', 1, { maxSlots: 1 })).toBe(0);
    expect(transferItem(storage, bag, 'apple', 5, { maxSlots: 2, stackMax: 1 })).toBe(1);
    expect(transferItem([], bag, 'apple', 1)).toBe(0);
  });
});

describe('derrota y mazmorras completadas', () => {
  it('defeatLosses cuenta el dinero y las unidades perdidas', () => {
    expect(defeatLosses([{ itemId: 'apple', quantity: 2 }, { itemId: 'potion', quantity: 1 }], 75)).toEqual({
      lostMoney: 75,
      lostItems: 3,
      kept: [],
    });
  });

  it('defeatLosses conserva lo que se le diga (los objetos únicos)', () => {
    const bag = [{ itemId: 'apple', quantity: 2 }, { itemId: 'centella_scarf', quantity: 1 }];
    expect(defeatLosses(bag, 10, (id) => id === 'centella_scarf')).toEqual({
      lostMoney: 10,
      lostItems: 2,
      kept: [{ itemId: 'centella_scarf', quantity: 1 }],
    });
  });

  it('markCleared devuelve lo que se acaba de abrir y no repite', () => {
    const profile = newProfile();
    expect(markCleared(profile, 'bosque_verde')).toEqual(['cueva_oscura']);
    expect(markCleared(profile, 'bosque_verde')).toEqual([]);
    expect(profile.clearedDungeons).toEqual(['bosque_verde']);
  });
});
