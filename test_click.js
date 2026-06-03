import puppeteer from 'puppeteer';
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function run() {
  const server = spawn('npm', ['run', 'dev'], { cwd: __dirname, shell: true });
  
  server.stdout.on('data', (data) => console.log(`server: ${data}`));
  server.stderr.on('data', (data) => console.error(`server err: ${data}`));

  // Wait for server to start
  await new Promise(r => setTimeout(r, 3000));

  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  
  page.on('console', msg => console.log('BROWSER:', msg.text()));
  page.on('pageerror', err => console.log('BROWSER ERROR:', err));

  await page.goto('http://localhost:5173');
  await new Promise(r => setTimeout(r, 2000));
  
  console.log('Clicking on option 0 (Nueva Partida)...');
  await page.click('.menu-option[data-index="0"]');
  
  await new Promise(r => setTimeout(r, 1000));
  
  console.log('Clicking on starter 0 (Bulbasaur)...');
  try {
    await page.click('.menu-option[data-index="0"]');
  } catch (e) {
    console.log('Could not click starter:', e.message);
  }

  await new Promise(r => setTimeout(r, 2000));

  await browser.close();
  server.kill();
  process.exit(0);
}

run();
