import { describe, it, expect, afterEach, vi } from 'vitest';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import items from '../../src/data/items.json';
import { SpriteManager } from '../../src/render/SpriteManager.js';

const publicDir = fileURLToPath(new URL('../../public', import.meta.url));

describe('imágenes de los objetos', () => {
  it('cada spriteUrl de items.json apunta a un fichero que existe', () => {
    const missing = items.filter((i) => i.spriteUrl && !existsSync(publicDir + i.spriteUrl)).map((i) => i.id);
    expect(missing).toEqual([]);
  });
});

describe('SpriteManager', () => {
  /** Imagen falsa: cuenta las peticiones y falla siempre, como un 404. */
  function stubFailingImage() {
    const requests = [];
    vi.stubGlobal('Image', class {
      set src(url) {
        requests.push(url);
        queueMicrotask(() => this.onerror?.(new Error('404')));
      }
    });
    vi.stubGlobal('window', {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    return requests;
  }

  const ctx = {
    beginPath() {}, arc() {}, fill() {}, stroke() {}, fillText() {}, drawImage() {},
  };

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('una imagen que no existe se pide una sola vez aunque se dibuje en cada fotograma', async () => {
    const requests = stubFailingImage();
    const sprites = new SpriteManager();
    for (let frame = 0; frame < 30; frame++) {
      sprites.drawSprite(ctx, '/sprites/items/no_existe.png', 0, 0, 16, 16, 'X');
      await new Promise((r) => setTimeout(r, 0));
    }
    expect(requests).toEqual(['/sprites/items/no_existe.png']);
    expect(await sprites.loadSprite('/sprites/items/no_existe.png')).toBeNull();
    expect(requests).toHaveLength(1);
  });
});
