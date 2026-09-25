// Tamaño del build de producción (el que sirve `vite preview` a los E2E).
// Vite avisa a partir de 500 kB por chunk, pero un aviso no para la CI: este
// test sí. Si falla, no subas `chunkSizeWarningLimit`: separa o carga aparte
// lo que no haga falta al arrancar (ver vite.config.js).
import { test, expect } from '@playwright/test';
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ASSETS = join(import.meta.dirname, '..', '..', 'dist', 'assets');
const LIMIT = 500 * 1000;

test('ningún chunk de JavaScript pasa de 500 kB', () => {
  const chunks = readdirSync(ASSETS)
    .filter((file) => file.endsWith('.js'))
    .map((file) => ({ file, bytes: statSync(join(ASSETS, file)).size }));
  expect(chunks.length).toBeGreaterThan(1);
  expect(chunks.filter((c) => c.bytes > LIMIT)).toEqual([]);
});

test('los datos del juego se precargan con el código, no a mitad de partida', async ({ request }) => {
  const html = await (await request.get('/')).text();
  const entry = html.match(/<script type="module"[^>]*src="([^"]+)"/)?.[1];
  const preloads = [...html.matchAll(/<link rel="modulepreload"[^>]*href="([^"]+)"/g)].map((m) => m[1]);
  expect(entry).toMatch(/assets\/index-[\w-]+\.js$/);
  expect(preloads).toEqual([expect.stringMatching(/assets\/data-[\w-]+\.js$/)]);
  // Lo que se sirve es lo mismo que hay en dist/
  for (const url of [entry, ...preloads]) {
    const response = await request.get(url);
    expect(response.ok()).toBe(true);
    expect((await response.body()).length).toBeLessThanOrEqual(LIMIT);
  }
});
