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

/** Carpeta de datos del juego, en cualquier sistema (Windows usa `\\`). */
const DATA = String.raw`src[\/]data[\/]`;

export default defineConfig(({ mode }) => ({
  base: resolveBase(mode),
  build: {
    rolldownOptions: {
      output: {
        // El juego en trozos: ninguno pasa de 500 kB y cada uno se cachea por su
        // cuenta (cambiar un diálogo no invalida el motor ni los datos). Los
        // créditos de PMDCollab siguen aparte: se cargan al abrir su pantalla.
        codeSplitting: {
          groups: [
            { name: 'historia', test: new RegExp(`${DATA}story\\.json$`) },
            { name: 'sprites', test: new RegExp(`${DATA}pmd-sprites\\.json$`) },
            {
              name: 'datos',
              test: new RegExp(`${DATA}(pokemon|moves|items|types|evolutions|floors|dungeons|tilesets|town|personality|recruitment|iq)\\.json$`),
            },
            { name: 'libs', test: /node_modules/ },
          ],
        },
      },
    },
  },
}));
