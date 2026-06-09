import puppeteer from 'puppeteer';
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..');

async function run() {
  const server = spawn('npm', ['run', 'dev'], { cwd: rootDir, shell: true });
  
  server.stdout.on('data', (data) => console.log(`server: ${data}`));
  server.stderr.on('data', (data) => console.error(`server err: ${data}`));

  // Wait for server to start
  await new Promise(r => setTimeout(r, 3000));

  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  
  let gotError = false;
  page.on('console', msg => {
    console.log('BROWSER:', msg.text());
    if (msg.text().toLowerCase().includes('error') || msg.text().toLowerCase().includes('exception')) {
      // Ignore favicon and vite HMR logs if they are not real app errors
      if (!msg.text().includes('404') && !msg.text().includes('[vite]')) {
        gotError = true;
      }
    }
  });
  page.on('pageerror', err => {
    console.log('BROWSER ERROR:', err);
    gotError = true;
  });

  await page.goto('http://localhost:5173');
  await new Promise(r => setTimeout(r, 2000));
  
  console.log('--- EMPEZANDO TEST DE JUEGO COMPLETO ---');
  
  console.log('1. Click en Nueva Partida');
  await page.click('.menu-option[data-index="0"]');
  await new Promise(r => setTimeout(r, 1000));
  
  console.log('2. Click en Bulbasaur');
  await page.click('.menu-option[data-index="0"]');
  await new Promise(r => setTimeout(r, 2000));

  if (gotError) {
    console.error('ERROR AL INICIAR PARTIDA');
    process.exit(1);
  }

  console.log('3. Moviendo al jugador (10 pasos)...');
  const movements = ['ArrowRight', 'ArrowRight', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowLeft', 'ArrowUp', 'ArrowUp', 'Space', 'Space'];
  for (const key of movements) {
    console.log(`Pulsando tecla: ${key}`);
    await page.keyboard.press(key);
    await new Promise(r => setTimeout(r, 150));
    if (gotError) {
      console.error(`ERROR AL MOVER: tecla ${key}`);
      process.exit(1);
    }
  }

  console.log('4. Abriendo Menú de Pausa (Escape)');
  await page.keyboard.press('Escape');
  await new Promise(r => setTimeout(r, 500));
  if (gotError) {
    console.error('ERROR AL ABRIR PAUSA');
    process.exit(1);
  }

  console.log('5. Navegando por el Menú de Pausa');
  await page.keyboard.press('ArrowDown');
  await new Promise(r => setTimeout(r, 200));
  await page.keyboard.press('ArrowDown');
  await new Promise(r => setTimeout(r, 200));
  await page.keyboard.press('ArrowDown'); // Seleccionar "Movimientos" o "Equipo"
  await new Promise(r => setTimeout(r, 200));
  
  console.log('6. Cerrando Menú de Pausa');
  await page.keyboard.press('Escape');
  await new Promise(r => setTimeout(r, 500));
  if (gotError) {
    console.error('ERROR AL CERRAR PAUSA');
    process.exit(1);
  }

  console.log('7. Abriendo Menú de Equipo directamente (C)');
  await page.keyboard.press('KeyC');
  await new Promise(r => setTimeout(r, 500));
  if (gotError) {
    console.error('ERROR AL ABRIR EQUIPO');
    process.exit(1);
  }

  console.log('8. Cerrando Menú de Equipo');
  await page.keyboard.press('Escape');
  await new Promise(r => setTimeout(r, 500));

  console.log('--- TEST DE JUEGO COMPLETADO CON ÉXITO ---');
  await browser.close();
  server.kill();
  if (gotError) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

run().catch(err => {
  console.error('Test script crashed:', err);
  process.exit(1);
});
