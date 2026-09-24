import { defineConfig } from 'vitest/config';

// Tests unitarios de la lógica pura (sin navegador). Los E2E de Playwright
// viven en tests/e2e y no deben entrar aquí.
export default defineConfig({
  test: {
    include: ['tests/unit/**/*.test.js'],
    environment: 'node',
  },
});
