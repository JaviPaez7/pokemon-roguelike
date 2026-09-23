import { defineConfig, devices } from '@playwright/test';

// Puerto propio para los E2E, distinto del de `npm run dev` (5173) y del de
// `npm run preview` (4173). Con --strictPort, si está ocupado Playwright falla
// con un error claro en lugar de probar otro servidor.
const PORT = Number(process.env.E2E_PORT) || 4317;
const BASE_URL = `http://127.0.0.1:${PORT}`;
const CI = !!process.env.CI;

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: CI,
  // La mazmorra es aleatoria hasta que haya RNG con semilla (fase 2): un
  // reintento en CI evita bloquear el despliegue por un mapa raro, y el
  // informe marca el test como «flaky» para que no pase desapercibido.
  retries: CI ? 1 : 0,
  workers: CI ? 2 : undefined,
  reporter: CI
    ? [['github'], ['list'], ['html', { open: 'never' }]]
    : [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  // Los tests corren contra el build de producción, que es lo que se despliega.
  // Playwright arranca el servidor, espera a que responda y lo mata al acabar.
  webServer: {
    command: `npm run build && npm run preview -- --host 127.0.0.1 --port ${PORT} --strictPort`,
    url: BASE_URL,
    reuseExistingServer: false,
    timeout: 60_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
