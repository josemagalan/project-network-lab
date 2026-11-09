'use strict';
/*
 * Pruebas de navegador (T024, tier 2): Chromium con Playwright y axe-core sobre el servidor de
 * vista previa. Cubre la ruta en ES y EN (AC6), la predicción (AC7), el enlace y la recarga
 * (AC8, AC19), el idioma (AC9), la notación (AC10), el teclado y axe (AC14), el tamaño de
 * pantalla (AC15), la matriz (AC16), el formato de caja (AC17), la portada (AC20) y el
 * presupuesto de 1 MB por vista (principio 27).
 *
 * Playwright y axe-core no van en package.json (constitución, principio 3): la CI los instala con
 * `npm i --no-save playwright axe-core`. En local, si no están, la prueba se omite y sale con 0;
 * con CI=true falta una dependencia es un fallo.
 *
 *   node tests/browser/run.js                  → todas las comprobaciones
 *   node tests/browser/run.js --only axe       → solo las que contienen «axe» en el nombre
 *   node tests/browser/run.js --shots <dir>    → además, capturas de cada paso e informe de axe
 *                                                (axe-report.json) en <dir>: evidencia de T025
 */
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const ROOT = path.resolve(__dirname, '..', '..');
const arg = (name) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : null; };
const ONLY = arg('--only');
const SHOTS = arg('--shots') ? path.resolve(arg('--shots')) : null;

let chromium;
let axeSource;
try {
  ({ chromium } = require('playwright'));
  axeSource = fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
} catch (err) {
  if (process.env.CI) throw err;
  console.log('Pruebas de navegador omitidas: faltan playwright o axe-core (npm i --no-save playwright axe-core).');
  process.exit(0);
}

const BUDGET = 1024 * 1024;
// best-practice añade, entre otras, page-has-heading-one y heading-order (T027).
const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];

// ---------- Servidor y utilidades ----------

function serve() {
  const port = Number(process.env.PORT) || 4300 + Math.floor(Math.random() * 600);
  const child = spawn(process.execPath, [path.join(ROOT, 'scripts', 'serve.cjs'), '--port', String(port)], { stdio: ['ignore', 'pipe', 'pipe'] });
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('El servidor no arrancó')), 10000);
    child.stdout.on('data', (d) => { if (String(d).includes('Local:')) { clearTimeout(timer); resolve({ child, base: `http://127.0.0.1:${port}` }); } });
    child.stderr.on('data', (d) => process.stderr.write(d));
    child.on('exit', (code) => { clearTimeout(timer); reject(new Error(`El servidor terminó con ${code}`)); });
  });
}

let browser;
let BASE;
let errors = [];

async function open(url, opts = {}) {
  const ctx = await browser.newContext({
    viewport: { width: opts.width || 1280, height: opts.height || 720 },
    colorScheme: opts.scheme || 'light',
    locale: opts.locale || 'es-ES',
    javaScriptEnabled: opts.js !== false,
    reducedMotion: 'reduce',
  });
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`${url}: ${m.text()}`); });
  page.on('pageerror', (e) => errors.push(`${url}: ${e.message}`));
  await page.goto(`${BASE}/${url}`);
  if (url.startsWith('cpm.html') && opts.js !== false) await page.waitForFunction(() => window.PNL && PNL.app && PNL.app.state());
  return page;
}
const close = (page) => page.context().close();
const lab = (hash, opts) => open(`cpm.html#${hash}`, opts);
const state = (page) => page.evaluate(() => PNL.app.state());
const step = (page) => page.evaluate(() => PNL.app.step());
const go = (page, n) => page.evaluate((k) => PNL.app.go(k), n);
const visible = (page, sel) => page.locator(sel).first().isVisible();
const trace = (page) => page.evaluate(() => PNL.app.model().solution.trace.map((s) => ({ kind: s.kind, act: s.act, fields: s.reveals.map((r) => r.field) })));

const axeLog = [];
async function axe(page, label) {
  if (!(await page.evaluate(() => !!window.axe))) await page.addScriptTag({ content: axeSource });
  const r = await page.evaluate(async (tags) => {
    const res = await window.axe.run(document, { runOnly: { type: 'tag', values: tags } });
    return {
      violations: res.violations.map((v) => `${v.id} (${v.impact}): ${v.nodes.slice(0, 4).map((n) => n.target.join(' ')).join(' | ')}`),
      passes: res.passes.length, incomplete: res.incomplete.map((v) => v.id), inapplicable: res.inapplicable.length,
    };
  }, AXE_TAGS);
  axeLog.push(Object.assign({ view: label }, r));
  assert.deepEqual(r.violations, [], `axe en «${label}»`);
}

async function shot(page, name, full) {
  if (!SHOTS) return;
  fs.mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: !!full });
}

const cases = [];
const check = (name, fn) => cases.push({ name, fn });

// ---------- AC6 y AC15: la ruta guiada en los dos idiomas ----------

for (const lang of ['es', 'en']) {
  check(`AC6 · ruta guiada en ${lang.toUpperCase()}: pasos en orden, fórmula activa y red y explicación a la vista en 1280×720`, async () => {
    const page = await lab(`v=route&ex=ej6&step=0&lang=${lang}`);
    const steps = await trace(page);
    const preds = await page.evaluate(() => PNL.app.model().project.preds);
    const kinds = steps.map((s) => s.kind).join(' ');
    assert.match(kinds, /^table build (forward )+(backward )+(float ){4}critical gantt$/);
    assert.equal(steps.filter((s) => s.kind === 'forward').length, steps.filter((s) => s.kind === 'backward').length);

    const seenF = new Set(); const seenB = new Set();
    for (let i = 0; i < steps.length; i++) {
      const s = await step(page);
      assert.equal(s.kind, steps[i].kind, `paso ${i}`);
      const formula = (await page.locator('#formula').innerText()).trim();
      if (s.kind === 'forward') {
        assert.deepEqual([...new Set(s.reveals.map((r) => r.field))].sort(), ['EF', 'ES'], `paso ${i}`);
        for (const p of preds[s.act] || []) assert.ok(seenF.has(p), `${s.act} antes que su predecesora ${p}`);
        seenF.add(s.act);
        assert.ok(formula.length > 0, `paso ${i}: sin fórmula`);
      } else if (s.kind === 'backward') {
        assert.deepEqual([...new Set(s.reveals.map((r) => r.field))].sort(), ['LF', 'LS'], `paso ${i}`);
        for (const [a, ps] of Object.entries(preds)) if (ps.includes(s.act)) assert.ok(seenB.has(a), `${s.act} después de su posterior ${a}`);
        seenB.add(s.act);
        assert.ok(formula.length > 0, `paso ${i}: sin fórmula`);
      }
      if (!['float', 'critical', 'gantt'].includes(s.kind)) {
        // AC15: con 15 actividades o menos, la red y la explicación caben sin desplazar la página.
        const box = await page.evaluate(() => {
          const r = (sel) => document.querySelector(sel).getBoundingClientRect();
          const nv = document.getElementById('netView');
          return { net: r('#netView svg').bottom, text: r('.narration').bottom, over: nv.scrollWidth - nv.clientWidth, y: window.scrollY };
        });
        assert.ok(box.y === 0 && box.net <= 720 && box.text <= 720, `paso ${i}: la red o la explicación quedan por debajo de 720 px (${JSON.stringify(box)})`);
        assert.ok(box.over <= 1, `paso ${i}: la red se desborda en horizontal`);
      }
      await shot(page, `route-${lang}-1280-${String(i + 1).padStart(2, '0')}-${s.kind}`);
      if (i < steps.length - 1) await page.keyboard.press('ArrowRight');
    }
    assert.ok(await visible(page, '#ganttView svg.gantt'), 'el último paso muestra el Gantt');
    assert.ok((await page.locator('.crit-path').count()) >= 1, 'se ve el camino crítico');
    await close(page);
  });
}

check('AC15 · los seis ejemplos caben en 1280×720 y la matriz o la red se desplazan dentro de su panel', async () => {
  const probe = await lab('v=route&ex=ej6&step=0&lang=es');
  const ids = await probe.evaluate(() => PNL.examples.list().filter((e) => !e.structureOnly).map((e) => e.id));
  await close(probe);
  assert.ok(ids.length >= 6);
  for (const ex of ids) {
    const page = await lab(`v=route&ex=${ex}&step=2&lang=es`);
    const n = await page.evaluate(() => PNL.app.model().project.activities.length);
    const box = await page.evaluate(() => ({ net: document.querySelector('#netView svg').getBoundingClientRect().bottom, text: document.querySelector('.narration').getBoundingClientRect().bottom, page: document.documentElement.scrollWidth }));
    assert.ok(box.page <= 1280, `${ex}: desplazamiento horizontal de página`);
    if (n <= 15) assert.ok(box.net <= 720 && box.text <= 720, `${ex} (${n} actividades): ${JSON.stringify(box)}`);
    await close(page);
  }
});

check('AC15 · a 360 px no hay desplazamiento horizontal de página en la portada, el taller ni en ningún paso de la ruta', async () => {
  for (const [url, name] of [['index.html', 'index'], ['cpm.html#v=work&lang=es', 'work-es'], ['cpm.html#v=route&ex=ej6&step=6&view=matrix&lang=es', 'matrix-es']]) {
    const page = await open(url, { width: 360, height: 740 });
    const w = await page.evaluate(() => document.documentElement.scrollWidth);
    assert.ok(w <= 360, `${url}: ${w} px`);
    await shot(page, `w360-${name}`, true);
    await close(page);
  }
  for (const lang of ['es', 'en']) {
    const page = await lab(`v=route&ex=ej6&step=0&lang=${lang}`, { width: 360, height: 740 });
    const total = (await trace(page)).length;
    for (let i = 0; i < total; i++) {
      const s = await step(page);
      const w = await page.evaluate(() => document.documentElement.scrollWidth);
      assert.ok(w <= 360, `${lang}, paso ${i}: ${w} px`);
      await shot(page, `route-${lang}-360-${String(i + 1).padStart(2, '0')}-${s.kind}`, true);
      if (i < total - 1) await page.locator('#btnNext').click();
    }
    await close(page);
  }
});

// ---------- AC7: predicción ----------

check('AC7 · modo predicción: oculta el paso, marca cada valor y no deja avanzar antes de tiempo', async () => {
  const page = await lab('v=route&ex=ej6&step=2&lang=es');
  await page.locator('#chkPredict').check();
  const s = await step(page);
  assert.equal(s.kind, 'forward');
  assert.ok(await visible(page, '#predictBox'));
  assert.equal((await page.locator('#formula').innerText()).trim(), '', 'la fórmula no se revela');
  assert.ok(await page.locator('#btnNext').isDisabled(), '→ queda bloqueado');
  const inputs = page.locator('#predictBox input');
  assert.equal(await inputs.count(), s.reveals.length);
  await inputs.nth(0).fill(String(s.reveals[0].value + 1));
  for (let i = 1; i < s.reveals.length; i++) await inputs.nth(i).fill(String(s.reveals[i].value).replace('.', ','));
  await page.locator('#predictBox button').first().click();
  assert.equal(await page.locator('#predictBox .mark.wrong').count(), 1);
  assert.equal(await page.locator('#predictBox .mark.ok').count(), s.reveals.length - 1);
  assert.ok(!(await page.locator('#btnNext').isDisabled()), 'tras comprobar se puede avanzar');
  await page.keyboard.press('ArrowRight');
  assert.equal((await state(page)).step, 3);
  assert.equal((await page.locator('#formula').innerText()).trim(), '', 'el paso siguiente tampoco se revela antes de tiempo');
  await close(page);
});

check('AC7 · mientras se predice, ni la red, ni la matriz, ni el texto delatan el paso; «Mostrar» revela los valores', async () => {
  // Paso de E en el Ejercicio 6: ES(E) = máx{EF(A), EF(B)} = máx{2, 3} = 3 y EF(E) = 7; manda B.
  const page = await lab('v=route&ex=ej6&lang=es');
  const k = (await trace(page)).findIndex((s) => s.kind === 'forward' && s.act === 'E');
  await go(page, k);
  await page.locator('#chkPredict').check();
  const boxE = () => page.evaluate(() => {
    const own = (x) => (x.firstChild && x.firstChild.nodeType === 3 ? x.firstChild.nodeValue : '');   // sin el <title>
    const g = [...document.querySelectorAll('#netView g')].find((n) => n.querySelector(':scope > text.nid') && own(n.querySelector(':scope > text.nid')) === 'E');
    return g ? [...g.querySelectorAll(':scope > text')].map(own) : [];
  });
  const textE = await boxE();
  assert.ok(textE.length, 'la caja de E está en la red');
  assert.ok(!textE.includes('3') && !textE.includes('7'), `la caja de E no muestra ES ni EF: ${textE.join(' ')}`);
  assert.equal(await page.locator('#netView .chosen').count(), 0, 'ninguna flecha marcada como la que manda');
  assert.ok((await page.locator('#netView .compared').count()) >= 2, 'las dos predecesoras se ven como comparadas');
  assert.doesNotMatch(await page.locator('#stepText').innerText(), /:\s*B\.|Manda/, 'el texto no dice que manda B');
  await page.locator('#btnMatrix').click();
  assert.equal(await page.locator('#matrixView .cellchosen').count(), 0, 'la matriz tampoco marca la casilla que manda');
  await page.locator('#btnNet').click();
  await page.locator('#predictBox button').nth(1).click();   // Mostrar los valores correctos
  const shown = await page.locator('#predictBox input').evaluateAll((els) => els.map((e) => e.value));
  assert.deepEqual(shown, ['3', '7']);
  assert.ok((await page.locator('#netView .chosen').count()) >= 1, 'al mostrar, se marca la flecha que manda');
  assert.match(await page.locator('#stepText').innerText(), /B/);
  assert.ok((await boxE()).includes('3'), 'al mostrar, la caja de E enseña ES');
  assert.ok(!(await page.locator('#btnNext').isDisabled()));
  // Lo mismo en un paso de la pasada hacia atrás (A: LF = mín{LS(D), LS(E)}), en inglés y en la matriz (ronda 2, H1).
  const kb = (await trace(page)).findIndex((s) => s.kind === 'backward' && s.act === 'B');
  await page.selectOption('#selLang', 'en');
  await go(page, kb);
  assert.ok(await page.locator('#btnNext').isDisabled(), 'predicción activa en el paso hacia atrás');
  assert.equal(await page.locator('#netView .chosen').count(), 0, 'hacia atrás: ninguna flecha marcada');
  assert.doesNotMatch(await page.locator('#stepText').innerText(), /decides|manda/i);
  await page.locator('#btnMatrix').click();
  assert.equal(await page.locator('#matrixView .cellchosen').count(), 0, 'hacia atrás: ninguna casilla marcada en la matriz');
  await page.locator('#predictBox button').nth(1).click();
  assert.ok((await page.locator('#matrixView .cellchosen').count()) >= 1, 'al mostrar, la matriz marca la casilla');
  await close(page);
});

// ---------- F2a · AC8: predicción en un paso de regla de la red PERT ----------

check('F2a AC8 · predicción de una regla: nada se ve ni se resalta hasta comprobar; cada casilla dice si falta o sobra', async () => {
  // Ejercicio 6, regla de los conjuntos contenidos: A, B, C, E, F y G; ficticias F1, F2 y F3.
  for (const scheme of ['light', 'dark']) {
    const page = await lab('graph=aoa&ex=ej6&step=2&lang=es', { scheme });
    await page.locator('#chkPredict').check();
    const s = await step(page);
    assert.equal(s.kind, 'ruleContained');
    assert.ok(await visible(page, '#predictBox'));
    const n = await page.evaluate(() => PNL.app.model().project.activities.length);
    const boxes = page.locator('#predictBox input[type="checkbox"]');
    assert.equal(await boxes.count(), n, 'una casilla por actividad');
    assert.equal(await page.locator('#netView tr.sup, #netView tr.sub, #netView tr.share, #netView tr.equal').count(), 0, 'la tabla no marca papeles');
    assert.doesNotMatch(await page.locator('#stepText').innerText(), /\bF\d\b|\b[A-H], /, 'el texto no nombra actividades ni ficticias');
    assert.ok(await page.locator('#btnNext').isDisabled(), '→ queda bloqueado');
    await axe(page, `PERT regla con predicción ${scheme}`);
    for (const a of ['A', 'B', 'C', 'D', 'E', 'F']) await page.locator(`#predictBox input[type="checkbox"][value="${a}"]`).check();
    await page.locator('#predictBox input[inputmode="numeric"]').fill('3');
    await page.locator('#predictBox button').first().click();
    const marks = await page.locator('#predictBox .rule-acts .mark.wrong').allInnerTexts();
    assert.deepEqual(marks.map((x) => x.replace(/^\W+/, '')), ['sobra', 'falta'], 'D sobra y G falta');
    assert.equal(await page.locator('#predictBox .rule-count .mark.ok').count(), 1, 'el número de ficticias es correcto');
    assert.ok((await page.locator('#netView tr.sup, #netView tr.sub').count()) >= 6, 'tras comprobar, la tabla marca los papeles');
    assert.match(await page.locator('#stepText').innerText(), /F1/);
    assert.ok(!(await page.locator('#btnNext').isDisabled()), 'tras comprobar se puede avanzar');
    await axe(page, `PERT regla comprobada ${scheme}`);
    // La regla de identidad no se aplica: «Mostrar» deja todo sin marcar y pone 0.
    await go(page, 1);
    assert.ok(await page.locator('#btnNext').isDisabled(), 'también se predice una regla que no se aplica');
    await page.locator('#predictBox button').nth(1).click();
    assert.equal(await page.locator('#predictBox input[type="checkbox"]:checked').count(), 0);
    assert.equal(await page.locator('#predictBox input[inputmode="numeric"]').inputValue(), '0');
    assert.match(await page.locator('#stepText').innerText(), /no se aplica/);
    await close(page);
  }
  const page = await lab('graph=aoa&ex=ej7&step=1&lang=en', { width: 360, height: 740 });
  await page.locator('#chkPredict').check();
  await page.locator('#predictBox button').nth(1).click();
  assert.deepEqual(await page.locator('#predictBox input[type="checkbox"]:checked').evaluateAll((els) => els.map((e) => e.value)), ['G', 'I']);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'sin desbordar a 360 px');
  await axe(page, 'PERT regla con predicción a 360 px (EN)');
  await close(page);
});

check('F2a · la tabla de posteriores no cambia el ancho de sus columnas al rellenarse la de papeles', async () => {
  const page = await lab('graph=aoa&ex=ej6&step=0&lang=es');
  const widths = () => page.locator('#netView table.succ thead th').evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().width)));
  const before = await widths();
  await go(page, 2);
  assert.deepEqual(await widths(), before);
  await close(page);
});

// ---------- F2a · AC6 y AC7: selección compartida y lado a lado ----------

check('F2a AC6–AC7 · lado a lado: seleccionar una ficticia o una actividad la resalta en las dos redes y se conserva al cambiar de red', async () => {
  const n = await (async () => { const p = await lab('graph=aoa&ex=ej6&lang=es'); const k = await p.evaluate(() => PNL.app.model().net.trace.length); await close(p); return k; })();
  const page = await lab(`graph=aoa&view=side&ex=ej6&step=${n - 1}&lang=es`);
  assert.equal(await page.locator('#btnSide').getAttribute('aria-pressed'), 'true');
  assert.ok(await page.locator('#btnMatrix').isHidden(), 'en PERT no hay matriz');
  assert.equal(await page.locator('#netView svg.net.pert').count(), 1);
  assert.equal(await page.locator('#netView svg.net:not(.pert)').count(), 1, 'la red ROY está al lado');
  assert.match(await page.locator('#netView').innerText(), /3 ficticias/);
  assert.match(await page.locator('#netView').innerText(), /sin ficticias/);
  // Ficticia F3 (contenidos): en ROY representa E → I y F → I.
  await page.locator('#netView svg.pert text.elabel', { hasText: /^F3$/ }).click();
  assert.equal((await state(page)).sel, 'F3');
  assert.equal(await page.locator('#netView svg.pert .edge.sel').count(), 1);
  assert.equal(await page.locator('#netView svg.net:not(.pert) .edge.sel').count(), 2, 'en ROY, E → I y F → I');
  assert.ok(await visible(page, '#selInfo'));
  assert.match(await page.locator('#selInfo').innerText(), /Conjuntos contenidos/);
  await axe(page, 'lado a lado con una ficticia seleccionada');
  // Actividad E desde la red ROY.
  // El texto del nodo lleva dentro su <title>: se busca por el primer nodo de texto.
  const iE = await page.evaluate(() => [...document.querySelectorAll('#netView svg.net:not(.pert) g.node')]
    .findIndex((g) => { const n = g.querySelector('text.nid'); return n && n.firstChild.nodeValue === 'E'; }));
  await page.locator('#netView svg.net:not(.pert) g.node').nth(iE).click();
  assert.equal((await state(page)).sel, 'E');
  assert.equal(await page.locator('#netView svg.pert .edge.sel').count(), 1, 'la flecha E en PERT');
  assert.equal(await page.locator('#netView svg.net:not(.pert) .box.sel').count(), 1, 'el nodo E en ROY');
  // Al cambiar de red se conserva.
  await page.locator('#btnAon').click();
  assert.equal((await state(page)).view, 'net');
  assert.equal((await state(page)).sel, 'E');
  assert.equal(await page.locator('#netView .box.sel').count(), 1);
  await page.locator('#btnAoa').click();
  assert.equal(await page.locator('#netView svg.pert .edge.sel').count(), 1);
  // Con el teclado: la tabla de arcos selecciona y el panel quita la selección.
  await page.locator('#btnTable').click();
  await page.locator('#altTable button', { hasText: /^F1/ }).focus();
  await page.keyboard.press('Enter');
  assert.equal((await state(page)).sel, 'F1');
  await page.locator('#selInfo button', { hasText: /Quitar/ }).click();
  assert.equal((await state(page)).sel, null);
  assert.ok(await page.locator('#selInfo').isHidden());
  await close(page);
  // Mientras se predice un suceso, la red ROY de al lado no adelanta tiempos.
  const p2 = await lab('graph=aoa&view=side&ex=ej6&lang=es');
  const kf = await p2.evaluate(() => PNL.app.model().net.trace.findIndex((s) => s.kind === 'eventForward' && s.event === 3));
  await go(p2, kf);
  await p2.locator('#chkPredict').check();
  // Solo se ven las duraciones (dato de la tabla): ni tiempos, ni holguras, ni camino crítico.
  const royVals = await p2.locator('#netView svg.net:not(.pert) text.val:not(.hidden)').count();
  assert.equal(royVals, await p2.evaluate(() => PNL.app.model().project.activities.length), 'ROY sin tiempos mientras se predice');
  assert.equal(await p2.locator('#netView svg.net:not(.pert) .box.crit, #netView svg.net:not(.pert) .edge.crit').count(), 0);
  await close(p2);
  for (const [opts, label] of [[{ scheme: 'dark' }, 'oscuro'], [{ width: 360, height: 740 }, '360 px']]) {
    const p3 = await lab(`graph=aoa&view=side&ex=ej7&step=5&lang=en`, opts);
    assert.ok(await p3.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `sin desbordar (${label})`);
    await p3.locator('#netView svg.pert text.elabel', { hasText: /^F2$/ }).click();
    assert.match(await p3.locator('#selInfo').innerText(), /Shared sets/);
    await axe(p3, `lado a lado ${label} (EN)`);
    await close(p3);
  }
});

// ---------- F2a · AC9 y AC16: contador de ficticias y red mínima ----------

// Taller con una tabla de posteriores en la red PERT (graph=aoa), esperando a que el contador tenga el mínimo.
async function pertWork(succ, opts = {}) {
  const page = await lab(`v=work&lang=${opts.lang || 'es'}`, opts);
  const rows = Object.keys(succ).map((id) => ({ id, name: '', duration: '2', links: succ[id].join(', ') }));
  const hash = await page.evaluate(([r, l, extra]) => PNL.urlstate.encode(Object.assign(PNL.urlstate.defaults(),
    { v: 'work', t: r, mode: 'succ', lang: l, graph: 'aoa' }, extra)), [rows, opts.lang || 'es', opts.extra || {}]);
  await page.evaluate((h) => { location.hash = h; }, hash);
  await page.waitForFunction(() => PNL.app.state().t && PNL.app.state().graph === 'aoa');
  await minReady(page);
  return page;
}
const minReady = (page) => page.waitForFunction(() => { const c = document.getElementById('dummyCounter'); return c && !c.hidden && !/calculando|working it out/.test(c.textContent); }, null, { timeout: 30000 });
const AC16 = { A: ['C', 'D', 'E'], B: ['C', 'E'], C: [], D: ['E'], E: [] };

check('F2a AC9 y AC16 · contador «reglas 3 · mínimo 2», su explicación y la red mínima al lado (min=1)', async () => {
  const page = await pertWork(AC16);
  const counter = page.locator('#dummyCounter');
  let txt = await counter.innerText();
  assert.match(txt, /3\s+reglas/, txt);
  assert.match(txt, /2\s+mínimo/, txt);
  assert.match(txt, /Exacto: no hay ninguna red con 1 ficticia/);
  assert.match(txt, /Las reglas ponen 1 ficticia de más/);
  await axe(page, 'contador con las reglas por encima del mínimo');
  const btn = page.locator('#btnMin');
  assert.equal(await btn.getAttribute('aria-pressed'), 'false');
  await btn.click();
  assert.equal((await state(page)).min, 1);
  assert.match(page.url(), /min=1/);
  assert.equal(await page.locator('#btnMin').getAttribute('aria-pressed'), 'true');
  assert.equal(await page.locator('#netView svg.net.pert').count(), 2, 'las dos redes PERT');
  const heads = await page.locator('#netView .side-by-side h2').allInnerTexts();
  assert.deepEqual(heads, ['Red de las reglas · 3 ficticias', 'Red mínima · 2 ficticias']);
  assert.match(await page.locator('#netView .count-explain').innerText(), /A → E \(A → D → E\)/);
  assert.equal(await page.locator('#netView .min-net .edge.rule').count(), 2, 'F1 y F2 destacadas en la mínima');
  assert.match(await page.locator('#legend').innerText(), /precedencia implícita/);
  const ids = await page.evaluate(() => [...document.querySelectorAll('[id]')].map((e) => e.id));
  assert.equal(new Set(ids).size, ids.length, 'sin id repetidos con dos redes PERT');
  assert.ok(await page.evaluate(() => document.getElementById('stage').classList.contains('wide')));
  await axe(page, 'red de las reglas y red mínima');
  await shot(page, 'f2a-min-compare');
  // El enlace reproduce la comparación.
  const url = page.url();
  await close(page);
  const ctx2 = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const p2 = await ctx2.newPage();
  await p2.goto(url);
  await p2.waitForFunction(() => window.PNL && PNL.app && PNL.app.state());
  await p2.waitForFunction(() => document.querySelectorAll('#netView svg.net.pert').length === 2, null, { timeout: 30000 });
  // «Lado a lado» deja la comparación.
  await p2.locator('#btnSide').click();
  assert.deepEqual([(await state(p2)).min, (await state(p2)).view], [0, 'side']);
  assert.equal(await p2.locator('#netView svg.net:not(.pert)').count(), 1);
  await ctx2.close();
  // Mientras se predicen las reglas, el contador no da números y no hay botón.
  const p3 = await pertWork(AC16, { extra: { pred: 1 } });
  txt = await p3.locator('#dummyCounter').innerText();
  assert.match(txt, /\?\s+reglas/, txt);
  assert.match(txt, /al colocar la red/);
  assert.equal(await p3.locator('#btnMin').count(), 0);
  await close(p3);
  // EN, oscuro y 360 px.
  for (const [opts, label] of [[{ scheme: 'dark' }, 'oscuro'], [{ width: 360, height: 740 }, '360 px']]) {
    const p4 = await pertWork(AC16, Object.assign({ lang: 'en', extra: { min: 1 } }, opts));
    await p4.waitForFunction(() => document.querySelectorAll('#netView svg.net.pert').length === 2);
    assert.match(await p4.locator('#dummyCounter').innerText(), /The rules add 1 dummy too many/);
    assert.ok(await p4.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `sin desbordar (${label})`);
    await axe(p4, `red mínima ${label} (EN)`);
    await close(p4);
  }
});

check('F2a AC9 · con las reglas en el mínimo no hay botón; con el presupuesto agotado, «entre L y V»', async () => {
  const page = await lab('graph=aoa&ex=ej6&step=0&lang=es');
  await minReady(page);
  const txt = await page.locator('#dummyCounter').innerText();
  assert.match(txt, /3\s+reglas/);
  assert.match(txt, /3\s+mínimo/);
  assert.match(txt, /ya dan el mínimo/);
  assert.equal(await page.locator('#btnMin').count(), 0);
  await page.locator('#btnAon').click();
  assert.ok(await page.locator('#dummyCounter').isHidden(), 'en ROY no hay contador');
  await close(page);
  // Tabla de 14 actividades que agota el presupuesto (cota 6, mejor red 7, reglas 10).
  const big = { A: ['C'], B: ['E', 'C'], C: ['H', 'I'], D: ['I', 'E'], E: ['J'], F: ['J'], G: ['H', 'L', 'M'], H: ['M'], I: ['N', 'J'], J: ['L', 'M'], K: ['M'], L: ['N'], M: ['N'], N: [] };
  const p2 = await pertWork(big);
  const t2 = await p2.locator('#dummyCounter').innerText();
  assert.match(t2, /10\s+reglas/, t2);
  assert.match(t2, /mínimo: entre 6 y 7/, t2);
  assert.match(t2, /presupuesto fijo/);
  await p2.locator('#btnMin').click();
  assert.deepEqual(await p2.locator('#netView .side-by-side h2').allInnerTexts(), ['Red de las reglas · 10 ficticias', 'Mejor red encontrada · 7 ficticias']);
  await p2.locator('#dummyCounter button', { hasText: /Aprende más/ }).click();
  assert.equal(await p2.locator('#learnTitle').innerText(), 'Ficticias: las reglas y el mínimo');
  assert.match(await p2.locator('#learnBody').innerText(), /Krishnamoorthy/);
  await axe(p2, '«Aprende más» del contador');
  await close(p2);
});

// ---------- F2a · T023: la ruta PERT completa, con y sin predicción, enlaces, 360 px y axe ----------

const pertTrace = (page) => page.evaluate(() => PNL.app.model().net.trace.map((s) => ({ kind: s.kind, event: s.event, reveals: s.reveals.length })));

for (const lang of ['es', 'en']) {
  check(`F2a AC5 y AC12 · ruta PERT del Ejercicio 6 en ${lang.toUpperCase()}: pasos en orden, texto y fórmula, red y explicación a la vista en 1280×720`, async () => {
    const page = await lab(`graph=aoa&ex=ej6&step=0&lang=${lang}`);
    const steps = await pertTrace(page);
    assert.match(steps.map((x) => x.kind).join(' '), /^succTable ruleEqual ruleContained ruleShared place number (eventForward ){9}(eventBackward ){9}eventSlack floats critical$/);
    assert.deepEqual(steps.filter((x) => x.kind === 'eventForward').map((x) => x.event), [1, 2, 3, 4, 5, 6, 7, 8, 9], 'hacia delante en orden de numeración');
    assert.deepEqual(steps.filter((x) => x.kind === 'eventBackward').map((x) => x.event), [9, 8, 7, 6, 5, 4, 3, 2, 1]);
    const placeIdx = steps.findIndex((x) => x.kind === 'place');
    for (let i = 0; i < steps.length; i++) {
      const sx = await step(page);
      assert.equal(sx.kind, steps[i].kind, `paso ${i}`);
      const title = (await page.locator('#stepTitle').innerText()).trim();
      const text = (await page.locator('#stepText').innerText()).trim();
      assert.ok(title && text, `paso ${i}: sin título o sin texto`);
      assert.doesNotMatch(`${title} ${text}`, /\b(pertNarr|pert|steps|count|narr)\.\w|\{\w+\}|undefined|NaN/, `paso ${i}`);
      if (sx.kind === 'eventForward' || sx.kind === 'eventBackward') {
        assert.match(await page.locator('#formula').innerText(), /T[EL]\(\d\) = /, `paso ${i}: sin fórmula`);
      }
      if (i >= placeIdx) assert.equal(await page.locator('#netView svg.net.pert').count(), 1, `paso ${i}: sin red`);
      else assert.equal(await page.locator('#netView table.succ').count(), 1, `paso ${i}: sin tabla de posteriores`);
      if (!['floats', 'critical'].includes(sx.kind)) {
        const box = await page.evaluate(() => {
          const r = (sel) => document.querySelector(sel).getBoundingClientRect();
          const nv = document.getElementById('netView');
          return { net: r('#netView > *').bottom, text: r('.narration').bottom, over: nv.scrollWidth - nv.clientWidth, page: document.documentElement.scrollWidth };
        });
        assert.ok(box.net <= 720 && box.text <= 720, `paso ${i}: la red o la explicación quedan por debajo de 720 px (${JSON.stringify(box)})`);
        assert.ok(box.over <= 1 && box.page <= 1280, `paso ${i}: desbordamiento horizontal`);
      }
      await shot(page, `pert-${lang}-1280-${String(i + 1).padStart(2, '0')}-${sx.kind}`);
      if (i < steps.length - 1) await page.keyboard.press('ArrowRight');
    }
    assert.ok((await page.locator('#netView svg.pert .edge.crit').count()) >= 1, 'el camino crítico se ve en la red PERT');
    assert.ok(await visible(page, '#resultsView table'), 'las holguras de ROY se ven debajo');
    await close(page);
  });
}

check('F2a AC13 · la red PERT de cada ejemplo cabe en 1280×720 sin desplazar la página', async () => {
  const probe = await lab('graph=aoa&ex=ej6&lang=es');
  const ids = await probe.evaluate(() => PNL.examples.list().map((e) => e.id));
  await close(probe);
  for (const ex of ids) {
    const page = await lab(`graph=aoa&ex=${ex}&lang=es`);
    const kinds = (await pertTrace(page)).map((x) => x.kind);
    for (const kind of ['number', kinds.includes('eventForward') ? 'eventForward' : 'number']) {
      await go(page, kinds.indexOf(kind));
      const box = await page.evaluate(() => {
        const r = (sel) => document.querySelector(sel).getBoundingClientRect();
        const nv = document.getElementById('netView');
        return { net: r('#netView svg').bottom, text: r('.narration').bottom, over: nv.scrollWidth - nv.clientWidth, page: document.documentElement.scrollWidth, n: PNL.app.model().project.activities.length };
      });
      assert.ok(box.page <= 1280, `${ex}: desplazamiento horizontal de página`);
      if (box.n <= 14) assert.ok(box.net <= 720 && box.text <= 720 && box.over <= 1, `${ex} ${kind}: ${JSON.stringify(box)}`);
    }
    await close(page);
  }
});

check('F2a AC8 · la ruta PERT entera en modo predicción: cada paso con preguntas espera a «Mostrar» y nada se adelanta', async () => {
  const page = await lab('graph=aoa&ex=ej6&step=0&pred=1&lang=es');
  const steps = await pertTrace(page);
  const placeIdx = steps.findIndex((x) => x.kind === 'place');
  let asked = 0;
  for (let i = 0; i < steps.length; i++) {
    const hidden = await page.locator('#predictBox').isVisible();
    if (i < placeIdx) assert.match(await page.locator('#dummyCounter').innerText(), /\?\s+reglas/, `paso ${i}: el contador no adelanta las reglas`);
    if (hidden) {
      asked++;
      assert.ok(await page.locator('#btnNext').isDisabled(), `paso ${i}: se puede avanzar sin responder`);
      assert.equal((await page.locator('#formula').innerText()).trim(), '', `paso ${i}: la fórmula delata el resultado`);
      await page.locator('#predictBox button', { hasText: /Mostrar/ }).click();
      assert.ok(await page.locator('#btnNext').isEnabled() || i === steps.length - 1, `paso ${i}: tras mostrar sigue bloqueado`);
    }
    if (i < steps.length - 1) await page.keyboard.press('ArrowRight');
  }
  // Se predicen las tres reglas, los 18 tiempos de sucesos, las holguras de suceso y las de actividad.
  assert.equal(asked, 3 + 18 + 2, `pasos con preguntas: ${asked}`);
  await close(page);
});

check('F2a AC11 · enlaces: los de la fase 1 siguen igual, los de la red PERT se reproducen y los imposibles avisan', async () => {
  // Un enlace de la fase 1 (sin graph) abre la red ROY en su paso y la URL no gana claves nuevas.
  const old = 'v=route&ex=ej6&step=5&lang=en';
  const p1 = await lab(old);
  const s1 = await state(p1);
  assert.deepEqual([s1.graph, s1.step, s1.lang], ['aon', 5, 'en']);
  assert.doesNotMatch(p1.url(), /graph=|min=/);
  assert.ok(await p1.locator('#urlWarning').isHidden());
  await close(p1);
  // Un enlace de la red PERT se reproduce en otro navegador.
  const p2 = await lab('graph=aoa&view=side&ex=ej7&step=12&nota=es&lang=en');
  const before = await state(p2);
  const url = p2.url();
  await close(p2);
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const p3 = await ctx.newPage();
  await p3.goto(url);
  await p3.waitForFunction(() => window.PNL && PNL.app && PNL.app.state());
  assert.deepEqual(await state(p3), before);
  assert.equal(await p3.locator('#btnSide').getAttribute('aria-pressed'), 'true');
  await ctx.close();
  // Un ejemplo sin duraciones pedido en ROY abre la red PERT con aviso.
  const p4 = await lab('graph=aon&ex=ej1&lang=es');
  assert.equal((await state(p4)).graph, 'aoa');
  assert.ok(await p4.locator('#urlWarning').isVisible());
  assert.match(await p4.locator('#urlWarning').innerText(), /solo tiene precedencias/);
  await close(p4);
});

check('Revisión F2 · sin red ROY no hay lado a lado: un enlace con ej1 y view=side y una tabla del taller que se queda sin duraciones', async () => {
  const page = await lab('v=route&graph=aoa&ex=ej1&step=5&view=side&lang=es');
  assert.deepEqual([(await state(page)).view, (await state(page)).graph], ['net', 'aoa']);
  assert.equal(await page.locator('#netView svg.net.pert').count(), 1, 'la red PERT se pinta');
  assert.ok(await page.locator('#btnSide').isDisabled());
  await close(page);
  // En el taller: lado a lado con una tabla con duraciones; al vaciar todas las duraciones pasa a la red sola.
  const p2 = await pertWork({ A: ['C'], B: ['C'], C: [] }, { extra: { view: 'side', step: 6 } });
  assert.equal((await state(p2)).view, 'side');
  const inputs = p2.locator('#workshop input[data-f="duration"]');
  for (let i = 0; i < 3; i++) await inputs.nth(i).fill('');
  await p2.waitForFunction(() => PNL.app.state().view === 'net');
  assert.equal(await p2.locator('#netView svg.net.pert').count() + await p2.locator('#netView table.succ').count(), 1, 'se ve la red PERT o su tabla');
  assert.equal(await p2.locator('#netView svg.net:not(.pert)').count(), 0);
  await close(p2);
});

check('Revisión F4 · la selección se borra al pasar a otro ejemplo o a otra tabla, y se conserva al cambiar de paso', async () => {
  const page = await lab('v=route&graph=aoa&ex=ej6&step=6&lang=es');
  await page.locator('#netView svg.pert text.elabel', { hasText: /^F1$/ }).click();
  assert.equal((await state(page)).sel, 'F1');
  await page.keyboard.press('ArrowRight');
  assert.equal((await state(page)).sel, 'F1', 'cambiar de paso no la borra');
  // Otro ejemplo por la dirección.
  const hash = await page.evaluate(() => PNL.urlstate.encode(Object.assign({}, PNL.app.state(), { ex: 'ej7', step: 6 })));
  await page.evaluate((h) => { location.hash = h; }, hash);
  await page.waitForFunction(() => PNL.app.state().ex === 'ej7');
  assert.equal((await state(page)).sel, null);
  assert.ok(await page.locator('#selInfo').isHidden());
  // Otra tabla por la dirección (cambia t).
  await page.locator('#netView svg.pert text.elabel', { hasText: /^F1$/ }).click();
  assert.equal((await state(page)).sel, 'F1');
  const rows = await page.evaluate(() => PNL.examples.get('ej6').rows.map((r) => ({ id: r.id, name: '', duration: String(r.duration), links: r.links })));
  const hashT = await page.evaluate((r) => PNL.urlstate.encode(Object.assign({}, PNL.app.state(), { v: 'work', ex: null, t: r, mode: 'succ', step: 6 })), rows);
  await page.evaluate((h) => { location.hash = h; }, hashT);
  await page.waitForFunction(() => PNL.app.state().t);
  assert.equal((await state(page)).sel, null, 'al cambiar de tabla por la dirección');
  await close(page);
});

check('F2a AC13 · a 360 px no hay desplazamiento horizontal de página en ningún paso de la ruta PERT, en ES y EN', async () => {
  for (const lang of ['es', 'en']) {
    const page = await lab(`graph=aoa&ex=ej6&step=0&lang=${lang}`, { width: 360, height: 740 });
    const steps = await pertTrace(page);
    for (let i = 0; i < steps.length; i++) {
      await go(page, i);
      const w = await page.evaluate(() => document.documentElement.scrollWidth);
      assert.ok(w <= 360, `${lang} paso ${i}: ${w} px`);
      await shot(page, `pert-${lang}-360-${String(i + 1).padStart(2, '0')}-${steps[i].kind}`, true);
    }
    await close(page);
  }
});

check('F2a AC14 · axe sin violaciones en cada tipo de paso de la red PERT, en claro y oscuro, ES y EN', async () => {
  for (const scheme of ['light', 'dark']) {
    for (const lang of ['es', 'en']) {
      const page = await lab(`graph=aoa&ex=ej6&step=0&lang=${lang}`, { scheme });
      const kinds = (await pertTrace(page)).map((x) => x.kind);
      for (const kind of ['succTable', 'ruleContained', 'place', 'number', 'eventForward', 'eventBackward', 'eventSlack', 'floats', 'critical']) {
        await go(page, kinds.indexOf(kind));
        await axe(page, `PERT ${lang} ${scheme} ${kind}`);
        // Una fórmula que se desplaza se alcanza con el teclado; si no se desplaza, no añade una parada de tabulación.
        const f = await page.evaluate(() => { const el = document.getElementById('formula'); return { scrolls: el.scrollWidth > el.clientWidth + 1, tab: el.getAttribute('tabindex') }; });
        assert.equal(f.tab, f.scrolls ? '0' : null, `PERT ${lang} ${kind}: fórmula ${JSON.stringify(f)}`);
      }
      await page.locator('#btnTable').click();
      await page.locator('#chkPredict').check();
      await axe(page, `PERT ${lang} ${scheme} tabla de arcos y predicción`);
      await page.locator('#btnLearn').click();
      await axe(page, `PERT ${lang} ${scheme} aprende más`);
      await page.keyboard.press('Escape');
      await close(page);
    }
  }
});

// ---------- AC8 y AC19: enlace y recarga ----------

check('AC8 · el enlace copiado reproduce el mismo estado en otro navegador', async () => {
  const page = await lab('v=route&ex=roy10&step=0&lang=es');
  for (let i = 0; i < 7; i++) await page.keyboard.press('ArrowRight');
  await page.locator('#btnMatrix').click();
  await page.selectOption('#selNota', 'es');
  await page.selectOption('#selBox', '4');
  await page.selectOption('#selLang', 'en');
  const before = await state(page);
  const url = page.url();
  await close(page);
  const other = await browser.newContext({ locale: 'es-ES', viewport: { width: 1280, height: 720 } });
  const p2 = await other.newPage();
  await p2.goto(url);
  await p2.waitForFunction(() => window.PNL && PNL.app && PNL.app.state());
  assert.deepEqual(await state(p2), before);
  assert.equal(await p2.evaluate(() => document.documentElement.lang), 'en');
  assert.ok(await visible(p2, '#matrixView table'));
  assert.equal(await p2.inputValue('#selBox'), '4');
  assert.equal(await p2.inputValue('#selNota'), 'es');
  await other.close();
});

check('AC19 · una tabla editada en el taller sigue ahí al recargar', async () => {
  const page = await lab('v=work&lang=es');
  const d0 = await page.evaluate(() => PNL.app.model().solution.duration);
  const dur = page.locator('#workshop input[data-f="duration"]').first();
  await dur.fill('5');
  await page.waitForFunction(() => PNL.app.state().t);
  const d1 = await page.evaluate(() => PNL.app.model().solution.duration);
  await page.reload();
  await page.waitForFunction(() => window.PNL && PNL.app && PNL.app.state());
  assert.equal(await page.locator('#workshop input[data-f="duration"]').first().inputValue(), '5');
  assert.equal(await page.evaluate(() => PNL.app.model().solution.duration), d1);
  assert.notEqual(d1, d0, 'el cambio altera la duración del Ejercicio 6');
  await close(page);
});

// ---------- Taller (AC2, AC3, AC4, AC5, AC11, AC13, AC18 y la tabla vacía; revisión F3, F5 y F6) ----------

// Abre el taller con una tabla dada (filas con id, name, duration y links).
async function workshop(rows, opts = {}) {
  const page = await lab('v=work&lang=es', opts);
  const hash = await page.evaluate(([r, m, l]) => PNL.urlstate.encode(Object.assign(PNL.urlstate.defaults(), { v: 'work', t: r, mode: m, lang: l })),
    [rows, opts.mode || 'pred', opts.lang || 'es']);
  await page.evaluate((h) => { location.hash = h; }, hash);
  await page.waitForFunction((h) => location.hash === h && PNL.app.state().t, hash);
  return page;
}
const R = (id, duration, links = '') => ({ id, name: '', duration: String(duration), links });
const sideText = (page) => page.locator('#workshop .work-side').innerText();

check('Taller · AC3 y AC4: los errores se nombran en su fila, en el idioma activo, y no hay resultados', async () => {
  for (const [lang, cycle, row] of [['es', /ciclo/, /Fila 3/], ['en', /cycle/, /Row 3/]]) {
    const page = await workshop([R('A', 1, 'C'), R('B', 2, 'A'), R('C', 3, 'B')], { lang });
    const txt = await sideText(page);
    assert.match(txt, cycle, txt);
    for (const id of ['A', 'B', 'C']) assert.match(txt, new RegExp(`\\b${id}\\b`));
    assert.ok(await page.locator('#stage').isHidden(), 'sin resultados mientras haya un ciclo');
    await close(page);
    const p2 = await workshop([R('A', 1), R('B', 2, 'A'), R('C', -1, 'B')], { lang });
    assert.match(await sideText(p2), row);
    assert.equal(await p2.locator('#workshop tbody tr').nth(2).locator('[data-f="duration"]').getAttribute('aria-invalid'), 'true');
    assert.ok(await p2.locator('#stage').isHidden());
    await close(p2);
  }
});

check('Taller · AC5: una redundancia se avisa en su campo y se calcula igual', async () => {
  const page = await workshop([R('A', 1), R('B', 1, 'A'), R('C', 5, 'A, B')]);
  assert.equal(await page.locator('#workshop .issues.warn').count(), 1);
  assert.ok((await page.locator('#workshop tbody tr').nth(2).locator('[data-f="links"]').getAttribute('class')).includes('warn'));
  assert.ok(await page.locator('#stage').isVisible());
  assert.equal(await page.evaluate(() => PNL.app.model().solution.duration), 7);
  await close(page);
});

check('Taller · AC13: el botón de pegar añade las filas de una hoja de cálculo', async () => {
  const page = await workshop([R('A', 2)]);
  await page.locator('#workshop .work-tools button').first().click();
  await page.locator('#workshop textarea.paste').fill('B\tSegunda\t3\tA\nC\tTercera\t4\tB');
  await page.locator('#workshop textarea.paste + button').click();
  await page.waitForFunction(() => PNL.app.state().t.length === 3);
  assert.deepEqual(await page.locator('#workshop input[data-f="id"]').evaluateAll((els) => els.map((e) => e.value)), ['A', 'B', 'C']);
  assert.equal(await page.evaluate(() => PNL.app.model().solution.duration), 9);
  await close(page);
});

check('Taller · AC18: el selector pasa de posteriores a predecesoras con los mismos resultados', async () => {
  const ex = await (async () => { const p = await lab('v=route&lang=es'); const r = await p.evaluate(() => PNL.examples.get('ej6')); await close(p); return r; })();
  const rows = ex.rows.map((r) => ({ id: r.id, name: '', duration: String(r.duration), links: r.links }));
  const page = await workshop(rows, { mode: ex.mode });
  assert.equal((await state(page)).mode, 'succ');
  const before = await page.evaluate(() => { const s = PNL.app.model().solution; return { d: s.duration, crit: s.critical.join(','), preds: PNL.app.model().project.preds }; });
  await page.locator('#workshop input[name="pnlMode"][value="pred"]').check();
  await page.waitForFunction(() => PNL.app.state().mode === 'pred');
  const after = await page.evaluate(() => { const s = PNL.app.model().solution; return { d: s.duration, crit: s.critical.join(','), preds: PNL.app.model().project.preds }; });
  assert.deepEqual(after, before);
  const linksE = await page.locator('#workshop tbody tr').evaluateAll((trs) => trs.map((tr) => [tr.querySelector('[data-f="id"]').value, tr.querySelector('[data-f="links"]').value]));
  assert.deepEqual(Object.fromEntries(linksE).E.split(/,\s*/).sort(), before.preds.E, 'la columna muestra ahora las predecesoras');
  await close(page);
});

check('Taller · tabla vacía: invita a empezar, sin −∞ ni errores', async () => {
  const page = await lab('v=work&t=&lang=es');
  await page.locator('#workshop .work-tools button').nth(1).click();   // Limpiar
  await page.waitForFunction(() => !PNL.app.model().project);
  const txt = await sideText(page);
  assert.doesNotMatch(txt, /∞|NaN|0 actividades/, txt);
  assert.ok((await page.locator('#workshop .work-side p.muted').first().innerText()).length > 10, 'invitación a empezar');
  assert.ok(await page.locator('#stage').isHidden());
  await close(page);
});

check('Taller · con la predicción activa, el resumen no adelanta la duración hasta revelar el fin (revisión, H5)', async () => {
  const page = await workshop([R('A', 6), R('B', 7, 'A'), R('C', 2)]);
  assert.match(await sideText(page), /\b13\b/, 'sin predicción, el resumen da la duración');
  await page.locator('#chkPredict').check();
  assert.doesNotMatch(await sideText(page), /13/, 'con predicción, en el paso 0');
  const kEnd = await page.evaluate(() => PNL.app.model().solution.trace.findIndex((s) => s.kind === 'forward' && s.act === PNL.cpm.END));
  await go(page, kEnd);
  assert.ok(await visible(page, '#predictBox'), 'se predice el paso del fin');
  assert.doesNotMatch(await sideText(page), /13/, 'mientras se predice el fin');
  await page.locator('#predictBox button').nth(1).click();   // Mostrar los valores correctos
  assert.match(await sideText(page), /\b13\b/, 'al revelar el fin, vuelve la duración');
  await close(page);
});

check('AC2 · dos caminos críticos se resaltan en la red, en la tabla y en la lista', async () => {
  const page = await workshop([R('A', 3), R('B', 3), R('C', 1, 'A, B')]);
  const k = await page.evaluate(() => PNL.app.model().solution.trace.findIndex((s) => s.kind === 'critical'));
  await page.evaluate((n) => PNL.app.go(n), k);
  assert.deepEqual((await page.locator('#resultsView .crit-path').allInnerTexts()).sort(), ['A → C', 'B → C']);
  assert.deepEqual((await page.locator('#resultsView tr.crit th').allInnerTexts()).map((x) => x.trim()[0]).sort(), ['A', 'B', 'C']);
  assert.ok((await page.locator('#netView path.edge.crit').count()) >= 4, 'inicio→A, inicio→B, A→C y B→C resaltadas');
  assert.match(await page.locator('#stepText').innerText(), /\b2\b/);
  await close(page);
});

check('Resultados · con más caminos críticos de los que se listan, se avisa de cuántos faltan (ronda 2, H2)', async () => {
  const rows = []; let prev = '';
  for (let k = 1; k <= 6; k++) { rows.push(R(`P${k}`, 1, prev), R(`Q${k}`, 1, prev), R(`J${k}`, 1, `P${k}, Q${k}`)); prev = `J${k}`; }
  const page = await workshop(rows);
  await page.evaluate(() => PNL.app.go(PNL.app.model().solution.trace.findIndex((s) => s.kind === 'critical')));
  assert.equal(await page.locator('#resultsView .crit-path').count(), 6);
  assert.match(await page.locator('#resultsView .crit-more').innerText(), /\b58\b/);
  assert.match(await page.locator('#stepText').innerText(), /\b64\b/);
  await close(page);
});

check('Ruta · un enlace con la tabla vacía abre el ejemplo en vez de una página en blanco (ronda 2, H3)', async () => {
  const page = await lab('v=route&t=&lang=es');
  assert.ok(await page.locator('#stage').isVisible());
  assert.ok((await page.evaluate(() => PNL.app.model().project.activities.length)) > 0);
  await close(page);
});

check('AC11 · «¿Y si…?» en la ruta: dentro de la holgura no cambia la duración; por encima, crece en el exceso', async () => {
  const page = await lab('v=route&ex=ej6&lang=es');
  await page.evaluate(() => PNL.app.go(PNL.app.model().solution.trace.findIndex((s) => s.kind === 'critical')));
  await page.locator('#btnWhatIf').click();
  const box = page.locator('#whatIfBox');
  await box.locator('select').selectOption('A');            // A: d = 2, holgura total 1
  await box.locator('input').fill('3');
  await box.locator('button').first().click();
  await page.waitForFunction(() => PNL.app.state().wi);
  assert.equal(await page.evaluate(() => PNL.app.model().solution.duration), 13);
  assert.match(await box.innerText(), /13 días \(antes 13\)/);
  await box.locator('select').selectOption('A');
  await box.locator('input').fill('5');                     // 3 de más con 1 de holgura: +2
  await box.locator('button').first().click();
  await page.waitForFunction(() => PNL.app.model().solution.duration === 15);
  assert.match(await box.innerText(), /15 días \(antes 13\)/);
  assert.ok(await page.evaluate(() => PNL.app.model().solution.critical.includes('A')), 'A pasa a ser crítica');
  assert.match(await page.locator('#stepText').innerText() + (await page.locator('#resultsView').innerText()), /A/);
  await close(page);
});

// ---------- AC9: idioma ----------

check('AC9 · al cambiar de idioma no queda ninguna cadena del otro', async () => {
  const page = await lab('v=route&ex=ej6&step=0&lang=es');
  const foreign = await page.evaluate(() => {
    const flat = (o, out = {}, pre = '') => { for (const [k, v] of Object.entries(o)) { if (v && typeof v === 'object') flat(v, out, `${pre}${k}.`); else out[pre + k] = String(v); } return out; };
    const es = flat(PNL.i18n.dict.es); const en = flat(PNL.i18n.dict.en);
    // Trozos de cada cadena que cambia de un idioma a otro, sin los huecos {x}, con al menos tres caracteres y una letra.
    const pieces = (a, b) => [...new Set(Object.keys(a).filter((k) => a[k] !== b[k]).flatMap((k) => a[k].split(/\{[^}]*\}/))
      .map((s) => s.trim()).filter((s) => s.length >= 3 && /\p{L}/u.test(s)))];
    return { es: pieces(es, en), en: pieces(en, es), all: { es: Object.values(es).join('\n'), en: Object.values(en).join('\n') } };
  });
  // Revisión, F18: también se buscan los trozos cortos (antes, solo los de 10 caracteres o más). Un trozo corto solo cuenta
  // como palabra completa («Red» no salta dentro de «Reduce») y se descarta si el otro idioma también usa esa palabra
  // («total» es español e inglés), porque entonces su presencia no prueba nada.
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const found = (text, s) => (s.length >= 10 ? text.includes(s) : new RegExp(`(?<![\\p{L}\\p{N}])${esc(s)}(?![\\p{L}\\p{N}])`, 'u').test(text));
  for (const [a, b] of [['es', 'en'], ['en', 'es']]) foreign[a] = foreign[a].filter((s) => !found(foreign.all[b], s));
  assert.ok(foreign.es.filter((s) => s.length < 10).length > 20, 'quedan trozos cortos que vigilar');
  const corpus = (p) => p.evaluate(() => [document.body.innerText, document.title,
    ...[...document.querySelectorAll('[aria-label]')].filter((e) => e.checkVisibility()).map((e) => e.getAttribute('aria-label'))].join('\n'));
  for (const [lang, other] of [['en', 'es'], ['es', 'en']]) {
    await page.selectOption('#selLang', lang);
    for (const n of [0, 2, 14, 26, 29, 31]) {
      await go(page, n);
      for (const view of ['#btnNet', '#btnMatrix']) {
        await page.locator(view).click();
        const text = await corpus(page);
        const left = foreign[other].filter((s) => found(text, s));
        assert.deepEqual(left, [], `${lang}, paso ${n}, ${view}`);
      }
    }
    await page.locator('#btnNet').click();
  }
  await page.locator('#navWork').click();
  for (const [lang, other] of [['en', 'es'], ['es', 'en']]) {
    await page.selectOption('#selLang', lang);
    const text = await corpus(page);
    assert.deepEqual(foreign[other].filter((s) => found(text, s)), [], `taller en ${lang}`);
  }
  await close(page);
});

// ---------- AC10 y AC17: notación y formato de caja ----------

check('AC10 · la notación española cambia las etiquetas y no los valores', async () => {
  const page = await lab('v=route&ex=roy10&step=0&lang=es');
  const firstFloat = (await trace(page)).findIndex((s) => s.kind === 'float');
  await go(page, firstFloat + 3);
  const read = () => page.evaluate(() => {
    const t = document.querySelector('#resultsView table');
    return { head: [...t.querySelectorAll('thead th')].map((e) => e.textContent), body: [...t.querySelectorAll('tbody tr')].map((r) => r.textContent) };
  });
  const en = await read();
  await page.selectOption('#selNota', 'es');
  const es = await read();
  assert.deepEqual(es.body, en.body);
  for (const l of ['tᵢ', 'fᵢ', 'tᵢ*', 'fᵢ*', 'HT', 'HL', 'HI', 'HS']) assert.ok(es.head.includes(l), `falta ${l}`);
  for (const l of ['ES', 'EF', 'LS', 'LF', 'TF', 'FF', 'IF', 'SF']) assert.ok(en.head.includes(l), `falta ${l}`);
  await close(page);
});

check('AC17 · los tres formatos de caja muestran sus campos con los mismos valores', async () => {
  const page = await lab('v=route&ex=ej6&step=31&lang=en');
  const n = await page.evaluate(() => PNL.app.model().project.activities.length);
  const read = () => page.evaluate(() => {
    const out = {};
    for (const g of document.querySelectorAll('#netView svg g')) {
      const id = g.querySelector(':scope > text.nid');
      if (!id) continue;
      const vals = [...g.querySelectorAll(':scope > text.val')];
      out[id.firstChild.textContent] = vals.length === 1
        ? Object.fromEntries(vals[0].textContent.split('/').map((v, i) => [['ES', 'd', 'LS'][i], v]))
        : Object.fromEntries(vals.map((v) => [v.querySelector('title').textContent, v.firstChild.textContent]));
    }
    return out;
  });
  const fields = { 7: 6, 4: 3, c: 3 };
  const seen = {};
  for (const box of ['7', '4', 'c']) {
    await page.selectOption('#selBox', box);
    seen[box] = await read();
    assert.equal(Object.keys(seen[box]).length, n, `caja ${box}: una caja por actividad`);
    for (const v of Object.values(seen[box])) assert.equal(Object.keys(v).length, fields[box], `caja ${box}`);
  }
  for (const id of Object.keys(seen['7'])) {
    for (const f of ['ES', 'd', 'LS']) {
      assert.equal(seen['4'][id][f], seen['7'][id][f], `${id}.${f} en la caja de 4`);
      assert.equal(seen.c[id][f], seen['7'][id][f], `${id}.${f} en la compacta`);
    }
  }
  await close(page);
});

// ---------- AC16: matriz ----------

check('AC16 · la matriz muestra el mismo paso con la casilla activa y la red sigue en él al volver', async () => {
  const page = await lab('v=route&ex=ej6&step=0&lang=es');
  for (let i = 0; i < 6; i++) await page.keyboard.press('ArrowRight');
  await page.locator('#btnMatrix').click();
  assert.equal((await state(page)).step, 6);
  assert.ok(await visible(page, '#matrixView table.grid'));
  assert.ok(!(await visible(page, '#netView')));
  const active = () => page.locator('#matrixView td.cellon, #matrixView td.cellchosen, #matrixView td.tcell.on').count();
  assert.ok((await active()) >= 1, 'hay casilla activa');
  const snap = await page.locator('#matrixView').innerText();
  await page.keyboard.press('ArrowRight');
  assert.equal((await state(page)).step, 7);
  assert.notEqual(await page.locator('#matrixView').innerText(), snap, 'la matriz avanza con el paso');
  await page.locator('#btnNet').click();
  assert.equal((await state(page)).step, 7);
  assert.ok(await visible(page, '#netView svg'));
  await close(page);
});

// ---------- AC14: teclado, tabla alternativa y axe ----------

check('AC14 · con el teclado se alcanza todo, el foco se ve y cada red tiene su tabla', async () => {
  const page = await lab('v=route&ex=ej6&step=0&lang=es');
  const reached = new Set();
  for (let i = 0; i < 40; i++) {
    await page.keyboard.press('Tab');
    const f = await page.evaluate(() => {
      const e = document.activeElement; const cs = getComputedStyle(e);
      return { id: e.id, body: e === document.body, style: cs.outlineStyle, w: parseFloat(cs.outlineWidth) };
    });
    if (f.body) continue; // el foco sale de la página tras el último control y vuelve a empezar
    if (f.id) reached.add(f.id);
    assert.ok(f.style !== 'none' && f.w >= 2, `foco invisible en #${f.id}`);
  }
  for (const id of ['brandLink', 'navRoute', 'navWork', 'selLang', 'selNota', 'selBox', 'btnNet', 'btnMatrix', 'btnTable', 'chkPredict', 'btnWhatIf', 'btnLearn', 'btnNext', 'btnPlay']) {
    assert.ok(reached.has(id), `#${id} no se alcanza con Tab`);
  }
  await page.locator('#btnTable').focus();
  await page.keyboard.press('Enter');
  const rows = await page.locator('#altTable table tbody tr').count();
  assert.equal(rows, await page.evaluate(() => PNL.app.model().project.activities.length), 'la tabla alternativa tiene una fila por actividad');
  await page.locator('#btnLearn').focus();
  await page.keyboard.press('Enter');
  assert.ok(await page.evaluate(() => document.getElementById('learnDialog').open));
  await page.keyboard.press('Escape');
  assert.ok(!(await page.evaluate(() => document.getElementById('learnDialog').open)));
  await page.locator('body').click({ position: { x: 5, y: 700 } });
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  assert.equal((await state(page)).step, 2);
  await page.keyboard.press('Home');
  assert.equal((await state(page)).step, 0);
  await page.locator('#navWork').focus();
  await page.keyboard.press('Enter');
  assert.equal((await state(page)).v, 'work');
  await page.keyboard.press('Tab');
  assert.ok(await page.evaluate(() => document.getElementById('workshop').contains(document.activeElement) || document.activeElement.closest('header')), 'el taller es alcanzable');
  await close(page);
});

check('AC14 · axe sin violaciones en la portada y en cada vista del laboratorio, en claro y oscuro', async () => {
  for (const scheme of ['light', 'dark']) {
    for (const lang of ['es', 'en']) {
      let page = await open(`index.html?lang=${lang}`, { scheme });
      await axe(page, `portada ${lang} ${scheme}`);
      await close(page);

      page = await lab(`v=route&ex=ej6&step=0&lang=${lang}`, { scheme });
      const kinds = (await trace(page)).map((s) => s.kind);
      for (const n of [0, 1, 2, kinds.indexOf('backward'), kinds.indexOf('float'), kinds.indexOf('critical'), kinds.length - 1]) {
        await go(page, n);
        await axe(page, `ruta ${lang} ${scheme} paso ${n} red`);
      }
      await go(page, 4);
      await page.locator('#btnMatrix').click();
      await axe(page, `ruta ${lang} ${scheme} matriz`);
      await page.locator('#btnNet').click();
      await page.locator('#btnTable').click();
      await page.locator('#btnWhatIf').click();
      await page.locator('#chkPredict').check();
      await axe(page, `ruta ${lang} ${scheme} tabla, ¿y si…? y predicción`);
      await page.locator('#btnLearn').click();
      await axe(page, `ruta ${lang} ${scheme} aprende más`);
      await page.keyboard.press('Escape');
      await close(page);

      page = await lab(`v=work&lang=${lang}`, { scheme });
      await axe(page, `taller ${lang} ${scheme}`);
      await page.locator('#workshop input[data-f="links"]').first().fill('K');
      await page.waitForTimeout(100);
      await axe(page, `taller ${lang} ${scheme} con un ciclo`);
      await close(page);
    }
  }
  const page = await lab('v=route&ex=ej6&step=6&lang=es', { width: 360, height: 740 });
  await axe(page, 'ruta a 360 px');
  await close(page);
});

// ---------- AC20: portada ----------

check('AC20 · la portada abre cada módulo en su paso con el idioma elegido y el laboratorio vuelve a ella', async () => {
  const noJs = await open('index.html', { js: false });
  for (const lab of ['m1', 'm2', 'm3', 'm4']) assert.match(await noJs.locator(`a[data-lab="${lab}"]`).getAttribute('href'), /^cpm\.html#v=route/);
  await close(noJs);
  const page = await open('index.html?lang=en');
  for (const [labId, n] of [['m1', 1], ['m3', 2], ['m4', 26]]) {
    await page.locator(`a[data-lab="${labId}"]`).click();
    await page.waitForFunction(() => window.PNL && PNL.app && PNL.app.state());
    const s = await state(page);
    assert.equal(s.step, n, labId);
    assert.equal(s.lang, 'en', labId);
    await shot(page, `portal-${labId}`);
    await page.locator('#brandLink').click();
    await page.waitForURL(/index\.html\?lang=en/);
  }
  await close(page);
});

// ---------- F2a · T022: M2 visible en la portada y ejemplos nuevos en el taller ----------

check('F2a AC14 · M2 abre la construcción de la red PERT del Ejercicio 6 en el idioma elegido; el selector de red está a la vista', async () => {
  const page = await open('index.html?lang=en');
  const card = page.locator('a[data-lab="m2"]');
  assert.match(await card.innerText(), /^Open activity on arrow/);
  await card.click();
  await page.waitForFunction(() => window.PNL && PNL.app && PNL.app.state());
  const s = await state(page);
  assert.deepEqual([s.graph, s.ex, s.step, s.lang], ['aoa', 'ej6', 0, 'en']);
  assert.equal((await step(page)).kind, 'succTable');
  assert.ok(await visible(page, '#graphGroup'));
  assert.equal(await page.locator('#btnAoa').getAttribute('aria-pressed'), 'true');
  await close(page);
  // En la ruta de la fase 1 (ROY) el selector también se ve y lleva a la red PERT.
  const p2 = await lab('v=route&ex=ej6&step=0&lang=es');
  assert.ok(await visible(p2, '#graphGroup'));
  await p2.locator('#btnAoa').click();
  assert.equal((await state(p2)).graph, 'aoa');
  assert.ok(await visible(p2, '#dummyCounter'));
  await close(p2);
});

check('F2a T022 · el taller ofrece los ejercicios 1, 2, 3 y 7; una tabla sin duraciones se construye en la red PERT', async () => {
  const page = await lab('v=work&lang=es');
  const options = await page.locator('#workshop .work-tools select option').evaluateAll((os) => os.map((o) => o.value).filter(Boolean));
  for (const id of ['ej1', 'ej2', 'ej3', 'ej7']) assert.ok(options.includes(id), id);
  await page.locator('#workshop .work-tools select').selectOption('ej1');
  await page.waitForFunction(() => PNL.app.state().t && PNL.app.state().graph === 'aoa');
  await minReady(page);
  const side = await sideText(page);
  assert.match(side, /9 actividades, sin duraciones/, side);
  assert.doesNotMatch(side, /error/i);
  assert.equal(await page.locator('#workshop .work-side button', { hasText: /Resultados/ }).count(), 0);
  assert.ok(await page.locator('#stage').isVisible());
  assert.ok(await page.locator('#btnAon').isDisabled(), 'sin duraciones no hay red ROY');
  assert.match(await page.locator('#dummyCounter').innerText(), /2\s+reglas/);
  await axe(page, 'taller con el Ejercicio 1 (sin duraciones)');
  // Con una sola duración escrita, las demás vuelven a ser errores.
  await page.locator('#workshop input[data-f="duration"]').first().fill('3');
  await page.waitForFunction(() => /error/i.test(document.querySelector('#workshop .work-side').textContent));
  assert.ok(await page.locator('#stage').isHidden());
  await close(page);
});

// ---------- F2b, hito 1: comparador de métodos y dibujo progresivo (T023) ----------

const ALL_MS = 'prog,rules,cs,kim,spinrad,cgl,min';
// El comparador está listo cuando el mínimo ya no se está calculando.
async function cmpLab(hash, opts) {
  const page = await lab(`graph=aoa&view=cmp&${hash}`, opts);
  await page.waitForFunction(() => { const m = document.querySelector('#cmpView .cmp-min'); return m && !/calculando|working it out/.test(m.textContent); }, null, { timeout: 30000 });
  return page;
}
// Lo que dice cada tarjeta, por método.
const cmpCards = (page) => page.locator('#cmpView .cmp-card').evaluateAll((els) => Object.fromEntries(els.map((e) => [e.dataset.method, {
  count: e.querySelector('.cmp-count strong').textContent, unit: e.querySelector('.cmp-count .muted').textContent,
  chips: [...e.querySelectorAll('.chips li')].map((x) => x.textContent), notes: [...e.querySelectorAll('.cmp-note')].map((x) => x.textContent),
  arcs: e.querySelectorAll('.cmp-table tbody tr').length, sel: e.querySelectorAll('.cmp-net path.edge.sel').length,
  rm: e.querySelectorAll('.cmp-net path.edge.rm').length,
}])));
const cmpCard = (page, m) => page.locator(`#cmpView .cmp-card[data-method="${m}"]`);
// Pulsa la etiqueta de una flecha (actividad o ficticia) en la red de una tarjeta.
const cmpPick = (page, m, x) => cmpCard(page, m).locator('.cmp-net text.elabel').filter({ hasText: new RegExp(`^${x}$`) }).click();
// Textos de las etiquetas de flecha de un SVG (los elementos SVG no tienen innerText).
const svgTexts = (page, sel) => page.locator(sel).evaluateAll((els) => els.map((e) => e.textContent));
const noHScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

// Cifras de la spec F2b para el Ejercicio 6: ficticias, sucesos y, en Spinrad, las de su modelo.
const EJ6_CMP = { prog: [3, 9], rules: [3, 9], cs: [6, 11], kim: [3, 9], spinrad: [3, 9], cgl: [3, 9], min: [3, 9] };

for (const [lang, scheme] of [['es', 'light'], ['en', 'dark']]) {
  check(`F2b AC5 y AC15 · comparador del Ejercicio 6 en ${lang.toUpperCase()} (${scheme === 'light' ? 'claro' : 'oscuro'}): cifras de cada método, lo que sobra, tabla de arcos y axe`, async () => {
    const page = await cmpLab(`ex=ej6&ms=${ALL_MS}&lang=${lang}`, { scheme });
    const es = lang === 'es';
    assert.equal((await page.locator('#cmpView .cmp-min').innerText()).trim(), es ? 'Mínimo: 3 ficticias (exacto)' : 'Minimum: 3 dummies (exact)');
    const cards = await cmpCards(page);
    assert.deepEqual(Object.keys(cards), ['prog', 'rules', 'cs', 'kim', 'spinrad', 'cgl', 'min'], 'siete tarjetas en el orden de los métodos');
    for (const [m, [d, e]] of Object.entries(EJ6_CMP)) {
      const c = cards[m];
      assert.equal(c.count, String(d), `${m}: ficticias`);
      assert.match(c.unit, new RegExp(`\\b${e} ${es ? 'sucesos' : 'events'}$`), `${m}: sucesos`);
      assert.equal(c.chips[0], es ? 'Correcta' : 'Correct', m);
      // La tabla de arcos (alternativa en texto, AC15) tiene una fila por actividad y por ficticia.
      assert.equal(c.arcs, 11 + d, `${m}: filas de la tabla de arcos`);
    }
    for (const m of ['prog', 'rules', 'kim', 'spinrad', 'cgl', 'min']) assert.equal(cards[m].chips[1], es ? 'En el mínimo' : 'At the minimum', m);
    // Agrupar por precedentes: 6 frente a 3, con dos ficticias que sobran marcadas en su red (AC6).
    assert.equal(cards.cs.chips[1], es ? '+3 sobre el mínimo' : '+3 over the minimum');
    assert.ok(cards.cs.notes.includes(es ? 'F4 y F6 se pueden quitar' : 'F4 and F6 can be removed'), cards.cs.notes.join(' | '));
    assert.equal(cards.cs.rm, 2, 'F4 y F6 en rojo');
    assert.equal(Object.values(cards).reduce((s, c) => s + c.rm, 0), 2, 'nada más en rojo');
    assert.ok(cards.spinrad.notes.includes(es ? 'En su modelo: 10 ficticias y 16 sucesos' : 'In its own model: 10 dummies and 16 events'), cards.spinrad.notes.join(' | '));
    assert.ok(await noHScroll(page), 'sin desplazamiento horizontal de página');
    await axe(page, `comparador del Ejercicio 6, siete métodos (${lang.toUpperCase()}, ${scheme})`);
    // Las tablas de arcos abiertas también pasan axe.
    await page.locator('#cmpView .cmp-table summary').evaluateAll((els) => els.forEach((s) => s.click()));
    await axe(page, `comparador del Ejercicio 6 con las tablas de arcos abiertas (${lang.toUpperCase()}, ${scheme})`);
    await shot(page, `f2b-cmp-ej6-${lang}-${scheme}`, true);
    await close(page);
  });
}

check('F2b AC4 y AC6 · Sysło (1981): Corneil-Gotlieb-Lee 9 y reglas 8; su tarjeta queda por encima de la mejor encontrada, con diferencia de estructura, y «Aprende más» da el contraejemplo', async () => {
  const page = await cmpLab('ex=syslo1981&ms=rules,cgl,min&lang=es');
  assert.match(await page.locator('#cmpView .cmp-min').innerText(), /^Mínimo: entre \d+ y 8 ficticias/);
  const cards = await cmpCards(page);
  assert.equal(cards.cgl.count, '9');
  assert.equal(cards.rules.count, '8');
  assert.deepEqual(cards.cgl.chips, ['Correcta', '+1 sobre la mejor encontrada']);
  assert.deepEqual(cards.rules.chips, ['Correcta', 'Igual que la mejor encontrada']);
  assert.ok(cards.cgl.notes.includes('Diferencia de estructura: ninguna ficticia sobra por sí sola'), cards.cgl.notes.join(' | '));
  assert.equal(cards.cgl.rm, 0, 'ninguna ficticia en rojo');
  await cmpCard(page, 'cgl').locator('button', { hasText: 'Aprende más' }).click();
  assert.ok(await page.locator('#learnDialog').evaluate((d) => d.open));
  assert.equal(await page.locator('#learnTitle').innerText(), 'Corneil, Gotlieb y Lee (1973)');
  assert.match(await page.locator('#learnBody').innerText(), /Sysło dio una tabla de 14 actividades/);
  await axe(page, 'Aprende más de Corneil, Gotlieb y Lee');
  await page.locator('#btnLearnClose').click();
  // Cada método tiene su «Aprende más» con su nombre (AC17).
  await close(page);
  const all = await cmpLab(`ex=ej6&ms=${ALL_MS}&lang=en`);
  for (const m of ['prog', 'rules', 'cs', 'kim', 'spinrad', 'cgl', 'min']) {
    await cmpCard(all, m).locator('button', { hasText: 'Learn more' }).click();
    const title = await all.locator('#learnTitle').innerText();
    assert.ok(title.startsWith(await cmpCard(all, m).locator('h2').innerText()), `${m}: ${title}`);
    await all.locator('#btnLearnClose').click();
  }
  await close(all);
});

check('F2b AC6 y AC7 · selección: una actividad se resalta en todas las tarjetas; una ficticia, solo en la suya, con lo que representa y por qué sobra', async () => {
  const page = await cmpLab('ex=ej6&ms=rules,cs,min&lang=es');
  await cmpPick(page, 'rules', 'E');
  let cards = await cmpCards(page);
  for (const m of ['rules', 'cs', 'min']) assert.equal(cards[m].sel, 1, `${m}: E resaltada`);
  assert.deepEqual(await page.evaluate(() => PNL.compareView.state().sel), { m: 'rules', x: 'E' });
  assert.match(await page.locator('#cmpView .sel-info').innerText(), /\bE\b/);
  await axe(page, 'comparador con una actividad seleccionada');
  // Una ficticia que sobra: se resalta solo en su red y se explica.
  await cmpPick(page, 'cs', 'F4');
  cards = await cmpCards(page);
  assert.deepEqual([cards.rules.sel, cards.cs.sel, cards.min.sel], [0, 1, 0], 'F4 solo en su tarjeta');
  const info = await page.locator('#cmpView .sel-info').innerText();
  assert.match(info, /F4 · Agrupar por precedentes/);
  assert.match(info, /→/, `nombra las precedencias que representa: ${info}`);
  assert.match(info, /quitar|sobra/i, `dice por qué sobra: ${info}`);
  await axe(page, 'comparador con una ficticia que sobra seleccionada');
  // Volver a pulsarla la deselecciona; «Quitar la selección» también.
  await cmpPick(page, 'cs', 'F4');
  assert.equal(await page.evaluate(() => PNL.compareView.state().sel), null);
  await cmpPick(page, 'min', 'K');
  await page.locator('#cmpView .sel-info button').last().click();
  assert.equal(await page.locator('#cmpView .sel-info').count(), 0);
  await close(page);
});

check('F2b AC14 y AC16 · par lado a lado: se elige con dos tarjetas, va a la URL, cabe en 1280×720 y se reproduce en otro navegador', async () => {
  const page = await cmpLab('ex=ej6&lang=es');
  assert.deepEqual(Object.keys(await cmpCards(page)), ['prog', 'rules', 'min'], 'métodos por defecto');
  await cmpCard(page, 'prog').locator('button', { hasText: 'Ver lado a lado' }).click();
  assert.match(await page.locator('#cmpView .cmp-hint').innerText(), /Dibujo progresivo/);
  await cmpCard(page, 'min').locator('button', { hasText: 'Lado a lado con esta' }).click();
  await page.waitForFunction(() => /pair=prog%2Cmin|pair=prog,min/.test(location.hash));
  assert.deepEqual((await state(page)).pair, ['prog', 'min']);
  assert.deepEqual(Object.keys(await cmpCards(page)), ['prog', 'min']);
  const box = await page.evaluate(() => ({ y: window.scrollY, over: document.documentElement.scrollHeight - window.innerHeight,
    nets: [...document.querySelectorAll('#cmpView .cmp-net svg')].map((s) => s.getBoundingClientRect().bottom) }));
  assert.equal(box.nets.length, 2);
  assert.ok(box.y === 0 && box.nets.every((b) => b <= 720), `las dos redes a la vista en 1280×720: ${JSON.stringify(box)}`);
  await cmpPick(page, 'prog', 'H');
  assert.deepEqual(Object.values(await cmpCards(page)).map((c) => c.sel), [1, 1], 'H resaltada en las dos');
  await axe(page, 'par lado a lado del comparador');
  await shot(page, 'f2b-cmp-pair-es');
  // El enlace copiado abre el mismo par, en inglés también.
  const hash = await page.evaluate(() => location.hash.slice(1));
  await close(page);
  const again = await cmpLab(hash.replace('lang=es', 'lang=en'));
  assert.deepEqual(Object.keys(await cmpCards(again)), ['prog', 'min']);
  assert.equal(await cmpCard(again, 'prog').locator('h2').innerText(), 'Progressive drawing');
  await again.locator('#cmpView button', { hasText: 'Back to all methods' }).click();
  assert.deepEqual(Object.keys(await cmpCards(again)), ['prog', 'rules', 'min']);
  assert.equal((await state(again)).pair, null);
  await close(again);
  // Los métodos visibles también van en el enlace; el último no se puede quitar.
  const two = await cmpLab('ex=ej6&ms=kim,cgl&lang=es');
  assert.deepEqual(Object.keys(await cmpCards(two)), ['kim', 'cgl']);
  await two.locator('#cmpView .cmp-methods button', { hasText: 'Kim (2008)' }).click();
  await two.waitForFunction(() => /ms=cgl(&|$)/.test(location.hash));
  assert.ok(await two.locator('#cmpView .cmp-methods button[aria-pressed="true"]').isDisabled(), 'queda uno y no se puede quitar');
  await two.locator('#cmpView .cmp-methods button', { hasText: 'Agrupar por precedentes' }).click();
  assert.deepEqual((await state(two)).ms, ['cs', 'cgl'], 'en el orden de los métodos');
  await close(two);
});

const progTrace = (page) => page.evaluate(() => PNL.app.model().progNet.trace.map((s) => ({ kind: s.kind, act: s.act || null })));

for (const lang of ['es', 'en']) {
  check(`F2b AC8 · dibujo progresivo del Ejercicio 6 en ${lang.toUpperCase()}: «Ver paso a paso» abre el reproductor; cada paso dice qué se dibuja y por qué, a la vista en 1280×720`, async () => {
    const page = await cmpLab(`ex=ej6&lang=${lang}`);
    await cmpCard(page, 'prog').locator('button', { hasText: lang === 'es' ? 'Ver paso a paso' : 'Step by step' }).click();
    await page.waitForFunction(() => PNL.app.state().m === 'prog' && PNL.app.state().view === 'net');
    assert.equal((await state(page)).step, 0);
    assert.match(await page.locator('#methodLine').innerText(), lang === 'es' ? /Método: dibujo progresivo/ : /Method: progressive drawing/);
    const steps = await progTrace(page);
    assert.equal(steps.map((s) => s.kind).join(' '), `progTable ${'progAct '.repeat(11)}progUnique progEnd`);
    const texts = new Set();
    for (let i = 0; i < steps.length; i++) {
      const text = (await page.locator('#stepText').innerText()).trim();
      assert.ok(text.length > 0 && !texts.has(text), `paso ${i}: sin texto o repetido`);
      texts.add(text);
      if (steps[i].kind === 'progAct') {
        assert.match(text, new RegExp(`\\b${steps[i].act}\\b`), `paso ${i}: nombra la actividad`);
        // Lo dibujado hasta aquí: las actividades de los pasos anteriores y la del paso, resaltada.
        const drawn = await svgTexts(page, '#netView text.elabel:not(.dummy)');
        assert.equal(drawn.length, steps.slice(0, i + 1).filter((s) => s.kind === 'progAct').length, `paso ${i}: actividades dibujadas`);
        assert.ok(drawn.some((x) => x.startsWith(`${steps[i].act} `)), `paso ${i}: ${steps[i].act} dibujada`);
      }
      if (i > 0) {
        const box = await page.evaluate(() => {
          const r = (sel) => document.querySelector(sel).getBoundingClientRect();
          return { net: r('#netView svg').bottom, text: r('.narration').bottom, y: window.scrollY };
        });
        assert.ok(box.y === 0 && box.net <= 720 && box.text <= 720, `paso ${i}: red o explicación fuera de 1280×720 (${JSON.stringify(box)})`);
      }
      if (i < steps.length - 1) await page.keyboard.press('ArrowRight');
    }
    // Al final, los sucesos numerados y la tabla de arcos de la red del progresivo.
    assert.ok(await page.locator('#btnTable').isVisible());
    await page.locator('#btnLearn').click();
    assert.equal(await page.locator('#learnTitle').innerText(), lang === 'es' ? 'Dibujo progresivo' : 'Progressive drawing');
    await page.locator('#btnLearnClose').click();
    await page.locator('#methodLine button').nth(1).click();
    await page.waitForFunction(() => PNL.app.state().view === 'cmp' && PNL.app.state().m === 'rules');
    await close(page);
  });
}

check('F2b AC8 · progresivo con predicción: de qué suceso sale y qué precedentes llevan ficticia; nada se dibuja ni se dice hasta comprobar', async () => {
  for (const scheme of ['light', 'dark']) {
    // Paso 5: E sale de un suceso nuevo; A llega directa y B con ficticia.
    const page = await lab('graph=aoa&m=prog&ex=ej6&step=5&lang=es', { scheme });
    await page.locator('#chkPredict').check();
    assert.equal((await step(page)).act, 'E');
    assert.ok(await visible(page, '#predictBox'));
    assert.equal(await page.locator('#predictBox input[type="radio"]').count(), 4, 'cuatro orígenes posibles');
    assert.deepEqual(await page.locator('#predictBox input[type="checkbox"]').evaluateAll((els) => els.map((e) => e.value)), ['A', 'B']);
    assert.ok(await page.locator('#btnNext').isDisabled(), '→ queda bloqueado');
    const drawn = await svgTexts(page, '#netView text.elabel:not(.dummy)');
    assert.ok(!drawn.some((x) => x.startsWith('E ')), 'E no está dibujada');
    assert.equal(await page.locator('#netView .edge.rule, #netView .elabel.rule').count(), 0, 'nada resaltado');
    assert.equal((await page.locator('#formula').innerText()).trim(), '', 'sin el porqué');
    const asked = await page.locator('#stepText').innerText();
    assert.match(asked, /¿De qué suceso sale\?/);
    assert.doesNotMatch(asked, /nuevo|directa/i, 'la pregunta no da la respuesta');
    await axe(page, `progresivo con predicción (${scheme})`);
    await page.locator('#predictBox input[type="radio"][value="pred"]').check();
    await page.locator('#predictBox input[type="checkbox"][value="B"]').check();
    await page.locator('#predictBox button', { hasText: 'Comprobar' }).click();
    assert.equal(await page.locator('#predictBox .prog-start .mark.wrong').count(), 1, 'el origen está mal');
    assert.equal(await page.locator('#predictBox .rule-acts:not(.prog-start) .mark.ok').count(), 1, 'las ficticias están bien');
    assert.ok(!(await page.locator('#btnNext').isDisabled()), 'tras comprobar se puede avanzar');
    assert.ok((await svgTexts(page, '#netView text.elabel:not(.dummy)')).some((x) => x.startsWith('E ')), 'E ya está dibujada');
    assert.ok((await page.locator('#netView .edge.rule').count()) >= 2, 'E y su ficticia resaltadas');
    assert.notEqual((await page.locator('#formula').innerText()).trim(), '', 'y el porqué');
    assert.notEqual(await page.locator('#stepText').innerText(), asked, 'el texto ya dice lo que se dibuja');
    await axe(page, `progresivo comprobado (${scheme})`);
    await close(page);
  }
  // Todo el recorrido con predicción: pregunta en cada actividad y nada se adelanta.
  const page = await lab('graph=aoa&m=prog&ex=ej6&step=0&pred=1&lang=en', { width: 360, height: 740 });
  const steps = await progTrace(page);
  let asked = 0;
  for (let i = 0; i < steps.length; i++) {
    if (await page.locator('#predictBox').isVisible()) {
      asked++;
      assert.equal(steps[i].kind, 'progAct', `paso ${i}`);
      assert.ok(await page.locator('#btnNext').isDisabled(), `paso ${i}: se puede avanzar sin responder`);
      await page.locator('#predictBox button', { hasText: 'Show' }).click();
    }
    assert.ok(await noHScroll(page), `paso ${i}: desborda a 360 px`);
    if (i < steps.length - 1) await page.locator('#btnNext').click();
  }
  assert.equal(asked, 11, 'una pregunta por actividad');
  await axe(page, 'progresivo con predicción a 360 px (EN)');
  await close(page);
});

check('F2b AC16 · a 360 px el comparador, el par y el progresivo no desbordan la página', async () => {
  for (const hash of [`graph=aoa&view=cmp&ex=ej6&ms=${ALL_MS}&lang=es`, 'graph=aoa&view=cmp&ex=ej6&pair=rules,cs&lang=en',
    'graph=aoa&view=cmp&ex=syslo1981&lang=es', 'graph=aoa&m=prog&ex=ej6&step=13&lang=es']) {
    const page = await lab(hash, { width: 360, height: 740 });
    await page.waitForTimeout(200);
    assert.ok(await noHScroll(page), hash);
    await axe(page, `${hash} a 360 px`);
    await shot(page, `f2b-360-${hash.replace(/[^a-z0-9]+/gi, '-')}`, true);
    await close(page);
  }
});

check('F2b AC18 · solo estructura: el comparador funciona igual con el Ejercicio 1, el caso tipo y las tablas de Kim y de Cohen y Sadeh', async () => {
  const want = {
    ej1: { min: 'Mínimo: 2 ficticias (exacto)', d: { prog: 2, rules: 2, cs: 2, kim: 2, spinrad: 2, cgl: 2, min: 2 } },
    tipo: { min: 'Mínimo: 2 ficticias (exacto)', d: { prog: 2, rules: 3, cs: 3, kim: 3, spinrad: 2, cgl: 2, min: 2 } },
    kim2008: { min: /^Mínimo: entre \d+ y 10 ficticias/, d: { kim: 10, rules: 10 } },
    cs2007: { min: /^Mínimo: entre \d+ y 4 ficticias/, d: { cs: 5, prog: 4 } },
  };
  for (const [ex, w] of Object.entries(want)) {
    const page = await cmpLab(`ex=${ex}&ms=${Object.keys(w.d).join(',')}&lang=es`);
    assert.ok(await page.locator('#urlWarning').isHidden(), `${ex}: sin aviso`);
    const min = (await page.locator('#cmpView .cmp-min').innerText()).trim();
    if (typeof w.min === 'string') assert.equal(min, w.min, ex); else assert.match(min, w.min, ex);
    const cards = await cmpCards(page);
    for (const [m, d] of Object.entries(w.d)) {
      assert.equal(cards[m].count, String(d), `${ex} · ${m}`);
      assert.equal(cards[m].chips[0], 'Correcta', `${ex} · ${m}`);
    }
    // Sin duraciones, las flechas llevan solo la letra.
    assert.ok((await svgTexts(page, '#cmpView .cmp-net text.elabel')).every((x) => !x.includes('=')), ex);
    if (ex === 'tipo') {
      assert.ok(cards.rules.notes.includes('F3 se puede quitar'), cards.rules.notes.join(' | '));
      await axe(page, 'comparador del caso tipo');
    }
    await close(page);
  }
});

// ---------- Principio 27: presupuesto de 1 MB ----------

check('Principio 27 · cada vista carga menos de 1 MB', async () => {
  for (const url of ['index.html', 'cpm.html#v=route&ex=ej6&step=0&lang=es', 'cpm.html#v=work&lang=es', 'cpm.html#v=route&ex=ej6&step=27&graph=aoa&view=side&lang=es',
    `cpm.html#graph=aoa&view=cmp&ex=ej6&ms=${ALL_MS}&lang=es`, 'cpm.html#graph=aoa&m=prog&ex=ej6&step=13&lang=es']) {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.goto(`${BASE}/${url}`, { waitUntil: 'networkidle' });
    // Se baja hasta el final para que entren también las imágenes con carga diferida (logotipos).
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(300);
    // El servidor no comprime: el cuerpo recibido es el tamaño real de cada recurso.
    const bytes = await page.evaluate(() => [...performance.getEntriesByType('navigation'), ...performance.getEntriesByType('resource')]
      .reduce((sum, e) => sum + (e.encodedBodySize || e.transferSize || 0), 0));
    console.log(`    ${url}: ${(bytes / 1024).toFixed(0)} KB`);
    assert.ok(bytes > 0 && bytes <= BUDGET, `${url}: ${bytes} bytes`);
    await ctx.close();
  }
});

// ---------- Ejecución ----------

(async () => {
  const { child, base } = await serve();
  BASE = base;
  browser = await chromium.launch();
  let failed = 0;
  const t0 = Date.now();
  const run = cases.filter((c) => !ONLY || c.name.toLowerCase().includes(ONLY.toLowerCase()));
  for (const c of run) {
    errors = [];
    try {
      await c.fn();
      assert.deepEqual(errors, [], 'errores en la consola');
      console.log(`✓ ${c.name}`);
    } catch (err) {
      failed++;
      console.log(`✗ ${c.name}\n    ${String(err.message).split('\n').join('\n    ')}`);
    }
  }
  await browser.close();
  child.kill();
  if (SHOTS) {
    fs.mkdirSync(SHOTS, { recursive: true });
    fs.writeFileSync(path.join(SHOTS, 'axe-report.json'), JSON.stringify({ axe: require('axe-core/package.json').version, tags: AXE_TAGS, views: axeLog }, null, 2));
  }
  console.log(`\n${run.length - failed} de ${run.length} comprobaciones de navegador en verde (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
  process.exitCode = failed ? 1 : 0;
})().catch((err) => { console.error(err); process.exit(1); });
