import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const SRC = join(import.meta.dirname, '..', '..', 'src');

/** @param {string} dir @returns {string[]} */
function jsFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return jsFiles(path);
    return entry.name.endsWith('.js') ? [path] : [];
  });
}

describe('reglas de arquitectura', () => {
  it('la partida solo usa el RNG con semilla: Math.random solo en render/ y audio/', () => {
    const allowed = [`render${sep}`, `audio${sep}`];
    const offenders = jsFiles(SRC)
      .map((file) => relative(SRC, file))
      .filter((file) => !allowed.some((dir) => file.startsWith(dir)))
      .filter((file) => {
        const code = readFileSync(join(SRC, file), 'utf8')
          .replace(/\/\*[\s\S]*?\*\//g, '')
          .replace(/\/\/.*$/gm, '');
        return code.includes('Math.random');
      });
    expect(offenders, 'usa random() de src/core/Random.js').toEqual([]);
  });
});
