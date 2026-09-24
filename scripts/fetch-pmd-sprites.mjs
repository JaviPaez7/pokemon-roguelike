#!/usr/bin/env node
/**
 * fetch-pmd-sprites.mjs — Descarga de PMDCollab/SpriteCollab los sprites
 * animados y los retratos de los 151 Pokémon de 1.ª generación, más los de
 * fuera que salen en el juego (EXTRA_SPECIES).
 *
 * Genera:
 * - public/sprites/pmd/NNNN/<Anim>-Anim.png   (hojas: 8 filas de dirección)
 * - public/sprites/pmd/portraits/NNNN/<Emoción>.png
 * - public/sprites/pmd/LICENSE.md y CREDITS.txt
 * - src/data/pmd-sprites.json   (tamaño de fotograma y duraciones por animación)
 * - src/data/pmd-credits.json   (autores, para la pantalla de créditos)
 *
 * Uso: node scripts/fetch-pmd-sprites.mjs [--from 1] [--to 151]
 * Sin dependencias: Node 18+ (fetch global).
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const REPO = 'https://raw.githubusercontent.com/PMDCollab/SpriteCollab/master';
const OUT_SPRITES = join(ROOT, 'public', 'sprites', 'pmd');
const OUT_DATA = join(ROOT, 'src', 'data');

/** Animaciones que usa el juego. Si falta Shoot, el juego usa Attack. */
const ANIMS = ['Idle', 'Walk', 'Attack', 'Shoot', 'Hurt', 'Sleep'];
/**
 * Emociones de los retratos. Se prueban todas: `portrait_files` de
 * tracker.json no dice qué ficheros existen, así que un 404 simplemente se salta.
 */
const EMOTIONS = ['Normal', 'Happy', 'Joyous', 'Inspired', 'Surprised', 'Determined', 'Angry', 'Shouting',
  'Worried', 'Sad', 'Crying', 'Teary-Eyed', 'Pain', 'Dizzy', 'Stunned', 'Sigh'];
const CONCURRENCY = 8;
/** Especies de fuera de la 1.ª generación que usa el juego: Kecleon (tiendas). */
const EXTRA_SPECIES = [352];

const args = process.argv.slice(2);
const argValue = (name, fallback) => {
  const i = args.indexOf(name);
  return i === -1 ? fallback : Number(args[i + 1]);
};
const FROM = argValue('--from', 1);
const TO = argValue('--to', 151);

const pad = (n) => String(n).padStart(4, '0');

/**
 * @param {string} path - Ruta dentro del repositorio
 * @param {'text' | 'buffer'} as
 * @param {{ optional?: boolean }} [options] - Con `optional`, un 404 devuelve null
 */
async function download(path, as, { optional = false } = {}) {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(`${REPO}/${path}`);
      if (res.status === 404 && optional) return null;
      if (!res.ok) throw new Error(`HTTP ${res.status} en ${path}`);
      return as === 'text' ? await res.text() : Buffer.from(await res.arrayBuffer());
    } catch (err) {
      lastError = err;
      await new Promise((r) => setTimeout(r, 500 * attempt));
    }
  }
  throw lastError;
}

/** Ejecuta las tareas con un máximo de `limit` a la vez. */
async function pool(tasks, limit) {
  const results = [];
  let next = 0;
  const workers = Array.from({ length: limit }, async () => {
    while (next < tasks.length) {
      const i = next++;
      results[i] = await tasks[i]();
    }
  });
  await Promise.all(workers);
  return results;
}

/**
 * Lee AnimData.xml sin dependencias (el formato es fijo y sencillo).
 * @param {string} xml
 * @returns {{ shadow: number, anims: Record<string, { copyOf?: string, w?: number, h?: number, d?: number[] }> }}
 */
function parseAnimData(xml) {
  const tag = (block, name) => block.match(new RegExp(`<${name}>([^<]*)</${name}>`))?.[1];
  const anims = {};
  for (const [, block] of xml.matchAll(/<Anim>([\s\S]*?)<\/Anim>/g)) {
    const name = tag(block, 'Name');
    const copyOf = tag(block, 'CopyOf');
    if (copyOf) {
      anims[name] = { copyOf };
      continue;
    }
    anims[name] = {
      w: Number(tag(block, 'FrameWidth')),
      h: Number(tag(block, 'FrameHeight')),
      d: [...block.matchAll(/<Duration>(\d+)<\/Duration>/g)].map((m) => Number(m[1])),
    };
  }
  return { shadow: Number(tag(xml, 'ShadowSize') ?? 1), anims };
}

/** Sigue las copias (Idle → CopyOf Walk) hasta la animación con hoja propia. */
function resolveAnim(anims, name) {
  let current = name;
  for (let i = 0; i < 5 && anims[current]?.copyOf; i++) current = anims[current].copyOf;
  const data = anims[current];
  return data && !data.copyOf ? { file: current, ...data } : null;
}

async function main() {
  console.log(`SpriteCollab: Pokémon ${FROM}–${TO}`);
  const [tracker, creditNames, license] = await Promise.all([
    download('tracker.json', 'text').then(JSON.parse),
    download('credit_names.txt', 'text'),
    download('LICENSE.md', 'text'),
  ]);

  // credit_names.txt: Name \t Discord \t Contact
  const names = new Map();
  for (const line of creditNames.split(/\r?\n/).slice(1)) {
    const [name, discord] = line.split('\t');
    if (name && discord) names.set(discord.trim(), name.trim());
  }
  const creditName = (id) => names.get(id) ?? id;
  const creditsOf = (credit) =>
    credit?.primary ? [credit.primary, ...(credit.secondary ?? [])].map(creditName) : [];

  const manifest = {};
  const speciesCredits = {};
  const files = [];

  const speciesIds = [...Array.from({ length: TO - FROM + 1 }, (_, i) => FROM + i), ...EXTRA_SPECIES];
  for (const id of speciesIds) {
    const key = pad(id);
    const entry = tracker[key];
    if (!entry) throw new Error(`SpriteCollab no tiene la especie ${key}`);
    const { shadow, anims } = parseAnimData(await download(`sprite/${key}/AnimData.xml`, 'text'));

    const used = {};
    for (const name of ANIMS) {
      const anim = resolveAnim(anims, name);
      if (!anim) continue;
      used[name] = { file: anim.file, w: anim.w, h: anim.h, d: anim.d };
      files.push({ from: `sprite/${key}/${anim.file}-Anim.png`, to: join(OUT_SPRITES, key, `${anim.file}-Anim.png`) });
    }
    for (const emotion of EMOTIONS) {
      files.push({
        from: `portrait/${key}/${emotion}.png`,
        to: join(OUT_SPRITES, 'portraits', key, `${emotion}.png`),
        portrait: { id, emotion },
      });
    }

    manifest[id] = { shadow, anims: used, portraits: [] };
    speciesCredits[id] = {
      name: entry.name,
      sprite: creditsOf(entry.sprite_credit),
      portrait: creditsOf(entry.portrait_credit),
    };
    process.stdout.write(`\rAnimData ${id}`);
  }
  console.log();

  // Sin repetir descargas (Idle y Walk pueden compartir hoja)
  const unique = [...new Map(files.map((f) => [f.to, f])).values()];
  let done = 0;
  let saved = 0;
  await pool(
    unique.map((f) => async () => {
      const data = await download(f.from, 'buffer', { optional: !!f.portrait });
      process.stdout.write(`\rImágenes ${++done}/${unique.length}`);
      if (!data) return;
      await mkdir(dirname(f.to), { recursive: true });
      await writeFile(f.to, data);
      saved++;
      if (f.portrait) manifest[f.portrait.id].portraits.push(f.portrait.emotion);
    }),
    CONCURRENCY,
  );
  console.log();
  // Mismo orden que EMOTIONS, sea cual sea el orden de llegada
  for (const entry of Object.values(manifest)) {
    entry.portraits.sort((a, b) => EMOTIONS.indexOf(a) - EMOTIONS.indexOf(b));
  }

  const artists = [...new Set(Object.values(speciesCredits).flatMap((c) => [...c.sprite, ...c.portrait]))].sort((a, b) =>
    a === 'CHUNSOFT' ? -1 : b === 'CHUNSOFT' ? 1 : a.localeCompare(b),
  );
  const credits = {
    source: 'PMDCollab / SpriteCollab',
    url: 'https://sprites.pmdcollab.org/',
    license: 'CC BY-NC 4.0 (aportaciones de la comunidad); el arte de CHUNSOFT es el oficial de Pokémon Mundo Misterioso',
    artists,
    species: speciesCredits,
  };

  await mkdir(OUT_DATA, { recursive: true });
  await writeFile(join(OUT_DATA, 'pmd-sprites.json'), JSON.stringify(manifest) + '\n');
  await writeFile(join(OUT_DATA, 'pmd-credits.json'), JSON.stringify(credits, null, 2) + '\n');
  await writeFile(join(OUT_SPRITES, 'LICENSE.md'), license);
  await writeFile(
    join(OUT_SPRITES, 'CREDITS.txt'),
    `Sprites y retratos: ${credits.source} (${credits.url})\nLicencia: ${credits.license}\n\nAutores:\n${artists.map((a) => `- ${a}`).join('\n')}\n`,
  );
  console.log(`Listo: ${Object.keys(manifest).length} especies, ${saved} imágenes, ${artists.length} autores.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
