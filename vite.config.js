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

export default defineConfig(({ mode }) => ({
  base: resolveBase(mode),
}));
