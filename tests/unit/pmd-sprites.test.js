import { describe, it, expect } from 'vitest';
import { directionRow, frameAt, animFor, animDuration, portraitUrl, TICK_MS, hasPmdSprite } from '../../src/render/PmdSprites.js';
import manifest from '../../src/data/pmd-sprites.json';

describe('hojas de PMDCollab', () => {
  it('hay sprites para los 151, con reposo, andar, ataque, daño y dormir', () => {
    for (let id = 1; id <= 151; id++) {
      expect(hasPmdSprite(id)).toBe(true);
      for (const name of ['Idle', 'Walk', 'Attack', 'Hurt', 'Sleep', 'Shoot']) {
        const anim = animFor(id, name);
        expect(anim, `${id} ${name}`).not.toBeNull();
        expect(anim.w).toBeGreaterThan(0);
        expect(anim.d.length).toBeGreaterThan(0);
      }
      expect(manifest[id].portraits).toContain('Normal');
    }
  });

  it('las direcciones siguen el orden de Mundo Misterioso', () => {
    expect(directionRow(0, 1)).toBe(0); // abajo
    expect(directionRow(1, 0)).toBe(2); // derecha
    expect(directionRow(0, -1)).toBe(4); // arriba
    expect(directionRow(-1, 0)).toBe(6); // izquierda
    expect(directionRow(-1, 1)).toBe(7);
    expect(directionRow(1, 0, 1)).toBe(0); // hoja de una fila
  });

  it('el fotograma sale de las duraciones, en bucle o parado en el último', () => {
    const d = [2, 3, 1];
    expect(frameAt(d, 0)).toBe(0);
    expect(frameAt(d, 2 * TICK_MS)).toBe(1);
    expect(frameAt(d, 5 * TICK_MS)).toBe(2);
    expect(frameAt(d, 6 * TICK_MS)).toBe(0); // vuelve a empezar
    expect(frameAt(d, 60 * TICK_MS, false)).toBe(2);
    expect(frameAt([], 100)).toBe(0);
  });

  it('si falta una animación se usa otra parecida', () => {
    const noShoot = Object.keys(manifest).find((id) => !manifest[id].anims.Shoot);
    expect(noShoot).toBeDefined();
    expect(animFor(Number(noShoot), 'Shoot')).toBe(manifest[noShoot].anims.Attack);
    expect(animFor(9999, 'Idle')).toBeNull();
    expect(animDuration(25, 'Walk')).toBeCloseTo((8 + 10 + 8 + 10) * TICK_MS);
  });

  it('retrato: la emoción pedida o, si no existe, el normal', () => {
    expect(portraitUrl(25, 'Happy')).toMatch(/portraits\/0025\/Happy\.png$/);
    const onlyNormal = Object.keys(manifest).find((id) => manifest[id].portraits.length === 1);
    expect(portraitUrl(Number(onlyNormal), 'Angry')).toMatch(/\/Normal\.png$/);
    expect(portraitUrl(9999)).toBeNull();
  });
});
