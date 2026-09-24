import { defineConfig } from 'vite';

const BASE_BY_MODE = {
  ghpages: '/pokemon-roguelike/',
  itch: './',
};

/** @param {'development' | 'production' | 'ghpages' | 'itch'} mode */
function resolveBase(mode) {
  if (process.env.VITE_BASE_PATH) {
    return process.env.VITE_BASE_PATH;
  }
  return BASE_BY_MODE[mode] ?? '/';
}

/**
 * Contenido del juego (`src/data/*.json`): va en su propio chunk, `data`, que
 * `index.html` precarga junto al código (`modulepreload`), así que todo sigue
 * disponible al arrancar y nada se pide a mitad de partida. Separarlo del
 * código deja el chunk principal por debajo de 500 kB y hace que un cambio de
 * código no invalide la caché de los datos (ni al revés).
 *
 * `pmd-credits.json` se queda fuera: la pantalla de créditos lo pide al abrirse.
 */
const DATA_CHUNK = /src[\\/]data[\\/](?!pmd-credits\.json$)[^\\/]+\.json$/;

export default defineConfig(({ mode }) => ({
  base: resolveBase(mode),
  build: {
    rolldownOptions: {
      // rot-js no tiene efectos al importarse. Sin decirlo, el empaquetador
      // conserva módulos que el juego no usa (Display, Color, Text…): ~20 kB.
      treeshake: {
        moduleSideEffects: [{ test: /node_modules[\\/]rot-js[\\/]/, sideEffects: false }],
      },
      output: {
        codeSplitting: {
          groups: [{ name: 'data', test: DATA_CHUNK }],
        },
      },
    },
  },
}));
