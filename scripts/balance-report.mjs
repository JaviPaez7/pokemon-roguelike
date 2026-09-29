/**
 * balance-report.mjs — Informe del equilibrio del juego (`npm run balance`).
 *
 * Imprime la curva de experiencia, el combate, la economía, el viento, el
 * reclutamiento y el CI tal como salen de `scripts/balance-model.mjs`, que usa
 * la lógica real del juego y los JSON de src/data. Al final, los avisos: lo
 * que se sale de los umbrales de `LIMITS`.
 *
 * El modelo importa módulos del juego que leen JSON sin atributos de
 * importación (como los sirve Vite), así que se carga con el ejecutor de
 * módulos de Vite (`runnerImport`), sin servidor ni navegador.
 *
 * Uso:
 *   npm run balance              texto
 *   npm run balance -- --md      tablas en Markdown (para un PR)
 *   npm run balance -- --json    los datos en bruto
 */

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runnerImport } from 'vite';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = new Set(process.argv.slice(2));
const MD = args.has('--md');

const { module: model } = await runnerImport('/scripts/balance-model.mjs', {
  configFile: false,
  root: ROOT,
  logLevel: 'silent',
});
const report = model.buildReport();

if (args.has('--json')) {
  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
}

// ─── Formato ─────────────────────────────────────────────────────────────────

/**
 * @param {number} value
 * @param {number} [decimals]
 */
function n(value, decimals = 0) {
  if (value == null || Number.isNaN(value)) return '—';
  return value.toLocaleString('es-ES', { maximumFractionDigits: decimals, minimumFractionDigits: 0 });
}

/** @param {number} value - Entre 0 y 1 */
function pct(value) {
  return `${Math.round(value * 100)} %`;
}

/** @param {number} hits */
function hits(hits) {
  return hits >= model.MAX_HITS ? '∞' : n(hits, 1);
}

/** @param {number} value */
function signed(value) {
  return value > 0 ? `+${value}` : String(value);
}

/**
 * Un rango de niveles `[a, b]` («58-59»), o uno solo si coinciden.
 * @param {[number, number]} range
 */
function span([a, b]) {
  return a === b ? String(a) : `${a}-${b}`;
}

/**
 * Un rango de diferencias de nivel `[a, b]` («-1 a 0»), o una sola si coinciden.
 * @param {[number, number]} range
 */
function signedSpan([a, b]) {
  return a === b ? signed(a) : `${signed(a)} a ${signed(b)}`;
}

/**
 * «a, b y c».
 * @param {string[]} items
 */
function list(items) {
  return items.length > 1 ? `${items.slice(0, -1).join(', ')} y ${items.at(-1)}` : items.join('');
}

/** @param {number} bonus - Niveles de más de la mazmorra (`levelBonus`) */
function extra(bonus) {
  return bonus ? ` (+${bonus})` : '';
}

/**
 * @param {string[]} headers
 * @param {(string | number)[][]} rows
 */
function table(headers, rows) {
  const cells = rows.map((r) => r.map(String));
  if (MD) {
    const line = (r) => `| ${r.join(' | ')} |`;
    return [line(headers), line(headers.map(() => '---')), ...cells.map(line)].join('\n');
  }
  const widths = headers.map((h, i) => Math.max(h.length, ...cells.map((r) => r[i].length)));
  const line = (r) => r.map((c, i) => c.padEnd(widths[i])).join('  ').trimEnd();
  return [line(headers), widths.map((w) => '-'.repeat(w)).join('  '), ...cells.map(line)].join('\n');
}

const out = [];
/** @param {string} text */
const title = (text) => out.push('', MD ? `### ${text}` : `== ${text} ==`, '');
/** @param {string} text */
const sub = (text) => out.push('', MD ? `#### ${text}` : `-- ${text} --`, '');
/** @param {string} text */
const para = (text) => out.push(text);

// ─── Cabecera ────────────────────────────────────────────────────────────────

const a = report.assumptions;
out.push(MD ? '## Informe de equilibrio' : 'INFORME DE EQUILIBRIO — PokéRogue');
para('');
para(`Modelo: scripts/balance-model.mjs (semilla ${a.seed}; ${a.damageSamples} muestras de daño por pareja; ${a.windRuns} partidas por mazmorra para el viento).`);
para(`Equipo: sale a nivel ${a.startLevel} con 0 de experiencia y ${a.startMoney} Poké. Toda la experiencia va entera a cada miembro en pie.`);
para(`Ritmos: «todo» derrota a todos los salvajes de cada piso (el máximo sin repetir); «típico», al ${pct(a.typicalKillRate)}. Combate, economía y reclutamiento, con el típico.`);
para('Protagonista típico: los nueve del test de personalidad, evolucionados por nivel y con su mejor movimiento o el ataque básico. Golpes: mediana de los nueve («peor»: el que menos aguanta).');

// ─── 1. Experiencia ──────────────────────────────────────────────────────────

title('1. Curva de experiencia');
sub('1.1 Experiencia por zona (pisos normales)');
out.push(
  table(
    ['Zona', 'Pisos', 'Salvajes', 'Enemigos/piso', 'EXP/salvaje', 'EXP/piso', 'Jefe', 'EXP jefe'],
    report.zones.map((z) => [
      z.name,
      z.floors.join('-'),
      z.levelRange.join('-'),
      n(z.enemies, 1),
      n(z.expPerEnemy),
      n(z.expPerFloor),
      z.boss ? `${z.boss.name} ${z.boss.level} (PS ×${n(z.boss.hpMultiplier, 2)})` : '—',
      z.boss ? n(z.boss.exp) : '—',
    ]),
  ),
);
for (const g of report.levelScaling) {
  const names = g.dungeons.map((id) => report.progress.typical.postgame.dungeons.find((d) => d.dungeonId === id)?.name ?? id);
  para('');
  para(`${list(names)} se hacen en cualquier orden: sus niveles (salvajes, jefe, amistosos, forajidos y escoltas) suben ${list(g.levels.map((v) => `+${v}`))} según cuántos de los otros se han completado ya (levelScaling en dungeons.json). En esta tabla, sin subir.`);
}

/**
 * @param {any[]} typical
 * @param {any[]} full
 */
function progressTable(typical, full) {
  return table(
    ['Mazmorra', 'Salvajes', 'Jefe', 'Entrada (típ./todo)', 'Ante el jefe (típ./todo)', 'Equipo − jefe (típ./todo)', 'Salida (típ./todo)'],
    typical.map((t, i) => {
      const f = full[i];
      return [
        t.name,
        `${t.wild.join('-')}${extra(t.bonus)}`,
        t.boss ? `${t.boss.name} ${t.boss.level}` : '—',
        `${t.entry} / ${f.entry}`,
        t.boss ? `${t.atBoss} / ${f.atBoss}` : '—',
        t.boss ? `${signed(t.atBoss - t.boss.level)} / ${signed(f.atBoss - f.boss.level)}` : '—',
        `${t.exit} / ${f.exit}`,
      ];
    }),
  );
}

sub('1.2 Historia en orden, sin repetir');
out.push(progressTable(report.progress.typical.story.dungeons, report.progress.full.story.dungeons));
sub('1.3 Posjuego, justo después de Mewtwo (en el orden del menú)');
out.push(progressTable(report.progress.typical.postgame.dungeons, report.progress.full.postgame.dungeons));
para('');
para('En cualquier orden: cada mazmorra en cada puesto (1.º = la primera que se hace tras Mewtwo), con lo que sale en todos los órdenes que la ponen ahí.');
para('');
out.push(
  table(
    ['Mazmorra', 'Puesto', 'Salvajes', 'Jefe', 'Entrada (típ./todo)', 'Ante el jefe (típ./todo)', 'Equipo − jefe (típ./todo)'],
    report.orders.typical.map((t, i) => {
      const f = report.orders.full[i];
      return [
        t.name,
        `${t.position + 1}.º`,
        `${t.wild.join('-')}${extra(t.bonus)}`,
        t.boss ? `${t.boss.name} ${t.boss.level}` : '—',
        `${span(t.entry)} / ${span(f.entry)}`,
        t.boss ? `${span(t.atBoss)} / ${span(f.atBoss)}` : '—',
        t.boss ? `${signedSpan(t.gap)} / ${signedSpan(f.gap)}` : '—',
      ];
    }),
  ),
);
sub('1.4 Torre del Desafío (copias de nivel 5, los 50 pisos seguidos)');
out.push(progressTable(report.tower.typical, report.tower.full));
para('');
para(`Premio de la Torre: ${n(report.tower.prize.money)} Poké y ${n(report.tower.prize.rankPoints)} puntos de rango.`);

// ─── 2. Combate ──────────────────────────────────────────────────────────────

title('2. Combate (fórmulas reales: calculateDamage, selectBestMove y TurnManager)');
sub('2.1 Salvajes del piso de en medio de cada zona');
out.push(
  table(
    ['Zona', 'Piso', 'Nv. equipo', 'Nv. salvaje', 'Golpes para derrotarlo (mejor)', 'Daño del prota', 'Golpes que aguanta (peor)', 'Daño del salvaje', 'Acciones del salvaje/turno'],
    report.combat.map((c) => [
      c.zone,
      c.floor,
      c.heroLevel,
      `${c.wildLevel}${extra(c.bonus)}`,
      `${hits(c.wild.heroHits)} (${hits(c.wild.heroHitsBest)})`,
      pct(c.wild.heroDamagePct),
      `${hits(c.wild.foeHits)} (${hits(c.wild.foeHitsWorst)}, ${c.wild.worstHero})`,
      pct(c.wild.foeDamagePct),
      n(c.wild.foeActions, 2),
    ]),
  ),
);
sub('2.2 Jefes (con su hpMultiplier y su kit)');
const bosses = report.combat.filter((c) => c.boss);
out.push(
  table(
    ['Jefe', 'Nv.', 'PS', 'Nv. equipo', 'Golpes para derrotarlo (mejor)', 'Daño del prota', 'Golpes que aguanta el prota (peor)', 'Daño del jefe', 'Acciones del jefe/turno'],
    bosses.map(({ boss: b, bonus }) => [
      b.name,
      `${b.level}${extra(bonus)}`,
      `${b.hp} (×${n(b.hpMultiplier, 2)})`,
      b.heroLevel,
      `${hits(b.heroHits)} (${hits(b.heroHitsBest)})`,
      pct(b.heroDamagePct),
      `${hits(b.foeHits)} (${hits(b.foeHitsWorst)}, ${b.worstHero})`,
      pct(b.foeDamagePct),
      n(b.foeActions, 2),
    ]),
  ),
);
para('');
para('Por protagonista (golpes para derrotar al jefe / golpes que aguanta; ∞ = no se hacen daño):');
for (const { boss: b } of bosses) {
  para(`- ${b.name}: ${b.perHero.map((h) => `${h.name} ${hits(h.heroHits)}/${hits(h.foeHits)}`).join(', ')}`);
}

// ─── 3. Economía ─────────────────────────────────────────────────────────────

title('3. Economía');
sub('3.1 Una expedición completa, la primera vez (ritmo típico)');
out.push(
  table(
    ['Mazmorra', 'Poké del suelo', 'Objetos del suelo', 'Valor si se venden', 'Misión media allí', 'Comida (manzanas)', 'Coste de la comida'],
    report.economy.map((e) => [e.name, n(e.ground), n(e.items, 1), n(e.itemValue), n(e.mission), n(e.apples, 1), n(e.foodCost)]),
  ),
);
para('');
para('Poké del suelo: salvajes derrotados, botín del jefe y tesoros de los eventos de piso.');
sub('3.2 Misiones por rango (Poké en el primer y el último piso del rango)');
const types = Object.keys(report.missions[0].money);
out.push(
  table(
    ['Rango', 'Pisos', 'Puntos', ...types, 'Media'],
    report.missions.map((m) => [m.rank, m.floors.join('-'), m.points, ...types.map((t) => m.money[t].join('-')), m.mean.map((v) => n(v)).join('-')]),
  ),
);
para('');
para(`Forajido: +${report.outlaw.levelBonus} niveles y PS ×${n(report.outlaw.hpMultiplier, 1)}. Historia completa (primera vez): ${n(report.storyClearPoints)} puntos de rango.`);
para(`Rangos: ${report.ranks.map((r) => `${r.name} ${n(r.points)}`).join(', ')}.`);
sub('3.3 Tienda del pueblo');
out.push(
  table(
    ['Objeto', 'Tipo', 'Sale', 'Compra', 'Venta'],
    report.shop.map((s) => [s.name, s.type, s.staple ? 'siempre' : `${pct(s.days)} de los días`, `${s.buy}${s.fixed ? ' (fijo)' : ''}`, s.sell]),
  ),
);
para('');
para('Compra: `price` de items.json o `floor(18 / rareza)` entre 8 y 250 (core/Shop.js). Venta: `floor(12 / rareza)` entre 8 y 120 (MerchantMenu).');
sub('3.4 Al caer');
para('Se pierden todo el dinero de la cartera y toda la mochila salvo los objetos únicos; el banco, el almacén y la plantilla no se tocan (Profile.defeatLosses). Las misiones cumplidas sin cobrar vuelven a quedar pendientes.');

// ─── 4. Otros ────────────────────────────────────────────────────────────────

title('4. Viento, reclutamiento y CI');
sub(`4.1 Viento: ${report.wind[0].limit} turnos por piso, avisos a ${report.wind[0].warnings.join(', ')}`);
out.push(
  table(
    ['Mazmorra', 'A la escalera (máx.)', 'Todas las salas (máx.)', 'Turnos de combate', 'Piso entero (máx.)', 'Margen'],
    report.wind.map((w) => [w.name, `${n(w.toStairs)} (${n(w.toStairsMax)})`, `${n(w.tour)} (${n(w.tourMax)})`, n(w.fights), `${n(w.full)} (${n(w.fullMax)})`, `×${n(w.limit / w.fullMax, 1)}`]),
  ),
);
para('');
para('Pisos generados con DungeonGenerator y la semilla de cada piso; pasos en 8 direcciones sin cortar esquinas. «Piso entero»: todas las salas, la más cercana cada vez, y la escalera, más los turnos para derrotar a los salvajes.');
sub('4.2 Reclutamiento (el líder remata a la mitad de los salvajes)');
const rc = report.recruitConfig;
para(`recruitment.json: ${n(rc.speciesFactor, 2)} × ratio de captura / 255, ±${n(rc.levelBonusPerLevel * 100)} % por nivel de diferencia (tope ±${n(rc.levelBonusMax * 100)} %), Lazo Amigo +${n(rc.friendBowBonus * 100)} %, máximo ${n(rc.maxChance * 100)} %.`);
para('');
out.push(
  table(
    ['Mazmorra', 'Probabilidad media', 'Por especie', 'Reclutas por pasada', 'Nv. recluta', 'Salvajes para subir 1 nivel (miembro / recluta)'],
    report.recruit.map((r) => [r.name, pct(r.chance), `${pct(r.min)}-${pct(r.max)}`, n(r.offers, 1), r.recruitLevel, `${n(r.killsToLevelUp.member, 1)} / ${n(r.killsToLevelUp.recruit, 1)}`]),
  ),
);
sub('4.3 CI (iq.json)');
const iq = report.iq;
para(`Gominola: +${iq.favorite} de CI si es de su tipo favorito, +${iq.other} si no. En la tienda, desde ${iq.gummiPrice} Poké.`);
para('');
out.push(table(['Habilidad', 'CI', 'Gominolas favoritas', 'Otras'], iq.skills.map((s) => [s.name, s.iq, s.favorite, s.other])));
para('');
out.push(table(['Mazmorra', 'Gominolas en el suelo (una pasada)'], iq.perDungeon.map((d) => [d.name, n(d.gummis, 1)])));

// ─── 5. Avisos ───────────────────────────────────────────────────────────────

title('5. Avisos');
if (!report.issues.length) para('Nada fuera de los umbrales.');
for (const issue of report.issues) para(`- [${issue.level}] ${issue.area}: ${issue.text}`);

console.log(out.join('\n'));
