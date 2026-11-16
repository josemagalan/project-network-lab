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
  // F3a (T016): un guion que corre antes que los de la página (p. ej., «Tabla al azar» visible o una semilla fija).
  if (opts.init) await ctx.addInitScript(opts.init);
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
// F4a (T013): Idioma, Notación y Caja van en el desplegable «Ajustes»: se abre, se elige y se cierra, como haría el usuario.
async function setCtl(page, sel, value) {
  const s = page.locator('#settings');
  if (!(await s.evaluate((d) => d.open))) await s.locator('summary').click();
  await page.selectOption(sel, value);
  if (await s.evaluate((d) => d.open)) await s.locator('summary').click();
}
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
// Escapado de los comandos de GitHub Actions (mensaje y, en las propiedades, también «:» y «,»).
const ghEscape = (text, prop) => {
  const t = String(text).replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
  return prop ? t.replace(/:/g, '%3A').replace(/,/g, '%2C') : t;
};
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
  await setCtl(page, '#selLang', 'en');
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
  // F4a: «Aprende más» se carga al abrirlo (learn.js bajo demanda).
  await p2.locator('#learnDialog[open]').waitFor();
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
      // Sysło (14 actividades) no cabe: sus flechas largas al suceso final ocupan siete filas (decisión del autor, T024).
      if (box.n <= 14 && ex !== 'syslo1981') assert.ok(box.net <= 720 && box.text <= 720 && box.over <= 1, `${ex} ${kind}: ${JSON.stringify(box)}`);
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
  await setCtl(page, '#selNota', 'es');
  await setCtl(page, '#selBox', '4');
  await setCtl(page, '#selLang', 'en');
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

// Trozos de las cadenas de cada idioma que no están en el otro (AC9; revisión, F18). Un trozo corto solo cuenta como
// palabra completa («Red» no salta dentro de «Reduce») y se descarta si el otro idioma también usa esa palabra
// («total» es español e inglés), porque entonces su presencia no prueba nada.
async function foreignPieces(page) {
  const foreign = await page.evaluate(() => {
    const flat = (o, out = {}, pre = '') => { for (const [k, v] of Object.entries(o)) { if (v && typeof v === 'object') flat(v, out, `${pre}${k}.`); else out[pre + k] = String(v); } return out; };
    const es = flat(PNL.i18n.dict.es); const en = flat(PNL.i18n.dict.en);
    // Trozos de cada cadena que cambia de un idioma a otro, sin los huecos {x}, con al menos tres caracteres y una letra.
    const pieces = (a, b) => [...new Set(Object.keys(a).filter((k) => a[k] !== b[k]).flatMap((k) => a[k].split(/\{[^}]*\}/))
      .map((s) => s.trim()).filter((s) => s.length >= 3 && /\p{L}/u.test(s)))];
    return { es: pieces(es, en), en: pieces(en, es), all: { es: Object.values(es).join('\n'), en: Object.values(en).join('\n') } };
  });
  for (const [a, b] of [['es', 'en'], ['en', 'es']]) foreign[a] = foreign[a].filter((s) => !foundIn(foreign.all[b], s));
  return foreign;
}
const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const foundIn = (text, s) => (s.length >= 10 ? text.includes(s) : new RegExp(`(?<![\\p{L}\\p{N}])${escRe(s)}(?![\\p{L}\\p{N}])`, 'u').test(text));
// Todo el texto visible de la página, el título y las etiquetas accesibles visibles.
const corpusOf = (p) => p.evaluate(() => [document.body.innerText, document.title,
  ...[...document.querySelectorAll('[aria-label]')].filter((e) => e.checkVisibility()).map((e) => e.getAttribute('aria-label'))].join('\n'));

check('AC9 · al cambiar de idioma no queda ninguna cadena del otro', async () => {
  const page = await lab('v=route&ex=ej6&step=0&lang=es');
  const foreign = await foreignPieces(page);
  const found = foundIn;
  const corpus = corpusOf;
  assert.ok(foreign.es.filter((s) => s.length < 10).length > 20, 'quedan trozos cortos que vigilar');
  for (const [lang, other] of [['en', 'es'], ['es', 'en']]) {
    await setCtl(page, '#selLang', lang);
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
    await setCtl(page, '#selLang', lang);
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
  await setCtl(page, '#selNota', 'es');
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
    await setCtl(page, '#selBox', box);
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
  for (const id of ['brandLink', 'navM0', 'navRoute', 'navWork', 'navUnc', 'navEx', 'settingsBtn', 'btnNet', 'btnMatrix', 'btnTable', 'chkPredict', 'btnWhatIf', 'btnLearn', 'btnNext', 'btnPlay']) {
    assert.ok(reached.has(id), `#${id} no se alcanza con Tab`);
  }
  // F4a (T013): Idioma, Notación y Caja están en «Ajustes»: abierto con Intro, el tabulador los recorre en orden.
  await page.locator('#settingsBtn').focus();
  await page.keyboard.press('Enter');
  for (const id of ['selLang', 'selNota', 'selBox']) {
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement.id), id, `#${id} no se alcanza con Tab dentro de «Ajustes»`);
  }
  await page.keyboard.press('Escape');
  await page.locator('#btnTable').focus();
  await page.keyboard.press('Enter');
  const rows = await page.locator('#altTable table tbody tr').count();
  assert.equal(rows, await page.evaluate(() => PNL.app.model().project.activities.length), 'la tabla alternativa tiene una fila por actividad');
  await page.locator('#btnLearn').focus();
  await page.keyboard.press('Enter');
  // F4a: «Aprende más» se carga al abrirlo (learn.js bajo demanda).
  await page.locator('#learnDialog[open]').waitFor();
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
  // F4a: «Aprende más» se carga al abrirlo (learn.js bajo demanda).
  await page.locator('#learnDialog[open]').waitFor();
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
    await all.locator('#learnDialog[open]').waitFor();
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
  // F1 existe en las tres tarjetas, pero son ficticias distintas: solo se resalta la pulsada (revisión F2b, descartado F13).
  await cmpPick(page, 'cs', 'F1');
  cards = await cmpCards(page);
  assert.deepEqual([cards.rules.sel, cards.cs.sel, cards.min.sel], [0, 1, 0], 'F1 solo en su tarjeta');
  await cmpPick(page, 'cs', 'F4');
  cards = await cmpCards(page);
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
    await page.locator('#learnDialog[open]').waitFor();
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
    // Revisión F2b, F6: tampoco la ficticia de B, que es la respuesta.
    const own = (await step(page)).prog.dummies;
    assert.deepEqual(own.length, 1);
    assert.ok(!(await svgTexts(page, '#netView text.elabel.dummy')).includes(own[0]), `${own[0]} no está dibujada`);
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
    assert.ok((await svgTexts(page, '#netView text.elabel.dummy')).includes(own[0]), `${own[0]} ya está dibujada`);
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

check('F2b revisión F4 · actividades llamadas F1, F2…: las ficticias pasan a f1, f2… en el comparador y en el progresivo', async () => {
  const succ = { F1: ['F3', 'F4'], F2: ['F3', 'F5'], F3: [], F4: ['F5'], F5: [] };   // el caso tipo, con otros nombres
  const rows = Object.keys(succ).map((id) => ({ id, name: '', duration: '2', links: succ[id].join(', ') }));
  const page = await lab('v=work&lang=es');
  const go2 = async (extra) => {
    const hash = await page.evaluate(([r, x]) => PNL.urlstate.encode(Object.assign(PNL.urlstate.defaults(),
      { v: 'work', t: r, mode: 'succ', lang: 'es', graph: 'aoa' }, x)), [rows, extra]);
    await page.evaluate((h) => { location.hash = h; }, hash);
  };
  await go2({ view: 'cmp', ms: ['prog', 'rules', 'min'] });
  await page.waitForFunction(() => { const m = document.querySelector('#cmpView .cmp-min'); return m && !/calculando|working it out/.test(m.textContent); }, null, { timeout: 30000 });
  const cards = await cmpCards(page);
  assert.equal(cards.rules.rm, 1, 'solo la ficticia que sobra, no la actividad F3');
  const dummies = await svgTexts(page, '#cmpView .cmp-card[data-method="rules"] text.elabel.dummy');
  assert.deepEqual(dummies, ['f1', 'f2', 'f3']);
  await cmpPick(page, 'rules', 'f3');
  assert.match(await page.locator('#cmpView .sel-info').innerText(), /f3 se puede quitar|se puede quitar/);
  // Progresivo con predicción: en ningún paso se ve antes de comprobar la ficticia que es la respuesta.
  await go2({ m: 'prog', step: 0 });
  await page.waitForFunction(() => PNL.app.state().m === 'prog');
  await page.locator('#chkPredict').check();
  const n = await page.evaluate(() => PNL.app.model().solution.trace.length);
  let asked = 0;
  for (let k = 0; k < n; k++) {
    await go(page, k);
    const st = await step(page);
    if (st.kind !== 'progAct' || !st.prog.dummies.length) continue;
    asked++;
    const drawn = await svgTexts(page, '#netView text.elabel.dummy');
    for (const d of st.prog.dummies) assert.ok(!drawn.includes(d), `paso ${k} (${st.act}): ${d} no está dibujada (${drawn})`);
  }
  assert.ok(asked >= 1);
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

check('F2b T024 · entradas al comparador: la barra de vistas de la red PERT y del progresivo, la tarjeta del contador, el taller y la portada', async () => {
  // Barra de vistas: solo en la red PERT; «Red» vuelve.
  const roy = await lab('ex=ej6&step=5&lang=es');
  assert.ok(await roy.locator('#btnCmp').isHidden(), 'no en la red ROY');
  await close(roy);
  const page = await lab('graph=aoa&ex=ej6&step=5&lang=es');
  assert.equal(await page.locator('#btnCmp').innerText(), 'Comparar métodos');
  assert.equal(await page.locator('#btnCmp').getAttribute('aria-pressed'), 'false');
  await page.locator('#btnCmp').click();
  await page.waitForFunction(() => PNL.app.state().view === 'cmp');
  assert.equal(await page.locator('#btnCmp').getAttribute('aria-pressed'), 'true');
  assert.deepEqual(Object.keys(await cmpCards(page)), ['prog', 'rules', 'min']);
  await page.locator('#btnNet').click();
  await page.waitForFunction(() => PNL.app.state().view === 'net');
  assert.equal((await state(page)).step, 5, 'vuelve al mismo paso');
  await close(page);
  // Desde el progresivo, el comparador deja el método en las reglas.
  const prog = await lab('graph=aoa&m=prog&ex=ej6&step=3&lang=en');
  assert.equal(await prog.locator('#btnCmp').innerText(), 'Compare methods');
  await prog.locator('#btnCmp').click();
  await prog.waitForFunction(() => PNL.app.state().view === 'cmp' && PNL.app.state().m === 'rules');
  await close(prog);
  // Contador por encima del mínimo, con la red mínima al lado: «Comparar con otros métodos» la cierra.
  const tipo = await lab('graph=aoa&ex=tipo&step=0&min=1&lang=es');
  await minReady(tipo);
  await tipo.locator('#dummyCounter button', { hasText: 'Comparar con otros métodos' }).click();
  await tipo.waitForFunction(() => PNL.app.state().view === 'cmp' && !PNL.app.state().min);
  await close(tipo);
  // Taller: los cuatro ejemplos nuevos en el selector y «Comparar métodos» en el resumen, también desde la red ROY.
  const work = await lab('v=work&lang=es');
  const options = await work.locator('#workshop .work-tools select option').evaluateAll((os) => os.map((o) => o.value).filter(Boolean));
  for (const id of ['kim2008', 'cs2007', 'syslo1981', 'tipo']) assert.ok(options.includes(id), id);
  assert.equal((await state(work)).graph, 'aon');
  await work.locator('#workshop .work-side button', { hasText: 'Comparar métodos' }).click();
  await work.waitForFunction(() => PNL.app.state().view === 'cmp' && PNL.app.state().graph === 'aoa');
  assert.equal((await state(work)).v, 'work', 'sigue en el taller');
  assert.ok(await work.locator('#cmpView').isVisible());
  await work.locator('#workshop .work-tools select').selectOption('syslo1981');
  await work.waitForFunction(() => /14 actividades/.test(document.getElementById('unitLine').textContent));
  assert.equal((await cmpCards(work)).rules.count, '8', 'las reglas de la tabla de Sysło');
  await axe(work, 'taller con el comparador de la tabla de Sysło');
  await close(work);
  // Portada: el segundo enlace de M2, en el idioma elegido, y sin JavaScript en español.
  const noJs = await open('index.html', { js: false });
  assert.match(await noJs.locator('a[data-lab="cmp"]').getAttribute('href'), /^cpm\.html#v=route&ex=ej6&step=0&graph=aoa&view=cmp&lang=es$/);
  await close(noJs);
  const portal = await open('index.html?lang=en');
  assert.match(await portal.locator('a[data-lab="cmp"]').innerText(), /Compare methods/);
  await portal.locator('a[data-lab="cmp"]').click();
  await portal.waitForFunction(() => window.PNL && PNL.app && PNL.app.state() && PNL.app.state().view === 'cmp');
  assert.equal((await state(portal)).lang, 'en');
  await close(portal);
  for (const scheme of ['light', 'dark']) {
    const home = await open('index.html?lang=es', { scheme });
    await axe(home, `portada con el enlace al comparador (${scheme})`);
    await shot(home, `f2b-portada-m2-${scheme}`);
    await close(home);
  }
});

// ---------- F2b, hito 2: reto de ficticias (T025) ----------

// Red mínima del Ejercicio 6 en la forma de la URL (sn): sucesos «id.número», arcos «ACT:origen-destino» y ficticias.
const RETO_EV = '0.1,1.2,2.3,3.4,4.5,5.6,6.7,7.8,8.9';
const RETO_ARC = { A: '0-2', B: '0-1', C: '0-3', D: '0-7', E: '2-4', F: '1-4', G: '3-5', H: '4-7', I: '5-6', J: '6-7', K: '7-8' };
const RETO_DUM = ['1-2', '1-3', '4-5'];
const retoSn = (ev = RETO_EV, arc = RETO_ARC, dum = RETO_DUM) => `${ev}|${Object.entries(arc).map(([k, v]) => `${k}:${v}`).join(',')}|${dum.join(',')}`;
const retoLab = (hash, opts) => lab(`graph=aoa&view=reto&${hash}`, opts);
const retoNet = (page) => page.evaluate(() => PNL.app.reto().net);
// «Comprobar» y esperar al resultado con el mínimo ya calculado.
async function retoCheck(page) {
  await page.locator('#retoView [data-k="check"]').click();
  await page.waitForFunction(() => { const r = PNL.app.reto(); return r && r.result && (!r.result.correct || r.result.min); }, null, { timeout: 30000 });
  return page.locator('#retoView .reto-result').innerText();
}
// Escribir en una casilla de la tabla de sucesos (la edición se aplica al salir de la casilla).
async function retoCell(page, k, v) {
  const before = JSON.stringify(await retoNet(page));
  await page.locator(`#retoView [data-k="${k}"]`).fill(v);
  await page.keyboard.press('Tab');
  await page.waitForFunction((b) => JSON.stringify(PNL.app.reto().net) !== b, before);
}
const noMarks = async (page, tag) => {
  assert.equal(await page.locator('#retoView .reto-result').count(), 0, `${tag}: sin resultado`);
  assert.equal(await page.locator('#retoView .rm, #retoView [aria-invalid="true"]').count(), 0, `${tag}: nada marcado`);
  assert.match(await page.locator('#retoView .reto-res').innerText(), /No se marca nada hasta que pidas comprobar|Nothing is marked until you ask to check/, tag);
};

check('F2b AC9, AC12, AC14 y AC15 · reto: la tabla y el lienzo se siguen al momento, nada se marca antes de comprobar y la red vuelve por el enlace', async () => {
  const page = await retoLab('ex=ej6&lang=es');
  assert.deepEqual((await retoNet(page)).events, [], 'el reto empieza sin sucesos');
  assert.equal(await page.locator('#retoView .reto-svg .reto-ev').count(), 0);
  await noMarks(page, 'al empezar');
  await axe(page, 'reto vacío (ES, claro)');
  // Tabla → lienzo: A del 1 al 3 crea los dos sucesos y la flecha.
  await retoCell(page, 'a:A:from', '1');
  await retoCell(page, 'a:A:to', '3');
  assert.deepEqual(await page.locator('#retoView .reto-svg .reto-ev text').evaluateAll((els) => els.map((e) => e.textContent).sort()), ['1', '3']);
  assert.equal(await page.locator('#retoView .reto-svg [data-k="arc:A"]').getAttribute('aria-label'), await page.locator('#retoView .reto-svg [data-k="arc:A"]').getAttribute('aria-label'));
  assert.match(await page.locator('#retoView .reto-svg [data-k="arc:A"]').getAttribute('aria-label'), /\bA\b.*\b1\b.*\b3\b/);
  // Lienzo → tabla: un suceso nuevo en un hueco, B del 1 a él y una ficticia del 3 a él.
  await page.locator('#retoView [data-k="tool:event"]').click();
  const svg = page.locator('#retoView .reto-svg');
  const bb = await svg.boundingBox();
  const vb = (await svg.getAttribute('viewBox')).split(' ').map(Number);
  await page.mouse.click(bb.x + (500 / vb[2]) * bb.width, bb.y + (260 / vb[3]) * bb.height);
  await page.waitForFunction(() => PNL.app.reto().net.events.length === 3);
  const fresh = (await retoNet(page)).events.find((e) => e.n === null);
  assert.ok(fresh && fresh.x !== undefined, 'el suceso del lienzo tiene posición y no tiene número');
  assert.match(await page.locator('#retoView .reto-events').innerText(), /sin número \(c\)/);
  await page.locator('#retoView [data-k="tool:activity"]').click();
  await page.locator('#retoView select[data-k="act"]').selectOption('B');
  const ev1 = (await retoNet(page)).events.find((e) => e.n === 1).id;
  const ev3 = (await retoNet(page)).events.find((e) => e.n === 3).id;
  await page.locator(`#retoView [data-k="ev:${ev1}"]`).click();
  await page.locator(`#retoView [data-k="ev:${fresh.id}"]`).click();
  assert.deepEqual([await page.locator('#retoView [data-k="a:B:from"]').inputValue(), await page.locator('#retoView [data-k="a:B:to"]').inputValue()], ['1', 'c']);
  await page.locator('#retoView [data-k="tool:dummy"]').click();
  await page.locator(`#retoView [data-k="ev:${ev3}"]`).click();
  await page.locator(`#retoView [data-k="ev:${fresh.id}"]`).click();
  assert.deepEqual([await page.locator('#retoView [data-k="d:0:from"]').inputValue(), await page.locator('#retoView [data-k="d:0:to"]').inputValue()], ['3', 'c']);
  // La tabla es la alternativa en texto de la red (AC15): cada flecha dibujada tiene su fila con sus dos sucesos.
  const drawn = await page.locator('#retoView .reto-svg .reto-edge').evaluateAll((els) => els.map((e) => e.dataset.k).sort());
  assert.deepEqual(drawn, ['arc:A', 'arc:B', 'dm:0']);
  // Numerar en la tabla: «c» pasa a ser el 2 y el lienzo lo dice.
  await retoCell(page, `e:${fresh.id}`, '2');
  assert.match(await page.locator(`#retoView [data-k="ev:${fresh.id}"]`).getAttribute('aria-label'), /^Suceso 2\b/);
  await noMarks(page, 'tras editar');
  await axe(page, 'reto a medias (ES, claro)');
  // El enlace guarda la red y las posiciones del lienzo; en otro navegador (y en inglés) se ve igual.
  const hash = await page.evaluate(() => location.hash.slice(1));
  assert.match(hash, /(^|&)sn=/);
  assert.match(hash, /(^|&)sp=/);
  const net = await retoNet(page);
  await close(page);
  const again = await lab(hash.replace('lang=es', 'lang=en'));
  assert.deepEqual(await retoNet(again), net);
  assert.equal(await again.locator('#retoView .reto-svg .reto-edge').count(), 3);
  await noMarks(again, 'al volver por el enlace');
  await close(again);
});

// Un error de cada tipo que puede dar la red del alumno, a partir de la red mínima del Ejercicio 6.
const RETO_ERRORS = [
  ['incompleteArc', retoSn(RETO_EV, Object.assign({}, RETO_ARC, { A: '0-' })), /A la flecha de A le falta el suceso inicial o el final/],
  ['incompleteArc (ficticia)', retoSn(RETO_EV, RETO_ARC, [...RETO_DUM, '4-']), /ficticia/],
  ['parallel', retoSn(RETO_EV, Object.assign({}, RETO_ARC, { F: '2-4' })), /E y F van del mismo suceso al mismo suceso/],
  ['looseEvent', `${retoSn(`${RETO_EV},9.`)}&sp=9:600.40`, /está suelto/],
  ['start', retoSn(`${RETO_EV},9.10`, Object.assign({}, RETO_ARC, { B: '9-1' })), /un solo suceso inicial.*y tiene 2: 1 y 10/],
  ['end', retoSn(`${RETO_EV},9.10`, Object.assign({}, RETO_ARC, { D: '0-9' })), /un solo suceso final.*y tiene 2: 9 y 10/],
  ['cycle', retoSn(RETO_EV, RETO_ARC, [...RETO_DUM, '6-5']), /ciclo que pasa por los sucesos 6 y 7/],
  ['falsePrecedence', retoSn(RETO_EV, RETO_ARC, [...RETO_DUM, '2-3']), /Precedencia falsa: la red hace esperar a G a que termine A/],
  ['missingPrecedence', retoSn(RETO_EV, RETO_ARC, ['1-3', '4-5']), /Falta una precedencia: B tiene que ir antes de E/],
  ['unnumbered', retoSn('0.1,1.,2.3,3.4,4.5,5.6,6.7,7.8,8.9'), /Falta por numerar el suceso/],
  ['order', retoSn('0.1,1.2,2.3,3.4,4.5,5.7,6.6,7.8,8.9'), /La flecha de I no cumple i < j/],
  ['order (ficticia)', retoSn('0.1,1.3,2.2,3.4,4.5,5.6,6.7,7.8,8.9'), /La ficticia del suceso 3 al 2 no cumple i < j/],
  ['sameNumber', retoSn('0.1,1.2,2.2,3.4,4.5,5.6,6.7,7.8,8.9'), /Hay 2 sucesos con el número 2/],
];

check('F2b AC10 y AC12 · diagnóstico: cada error se nombra con sus actividades o sucesos, solo después de comprobar; la red mínima no da ninguno', async () => {
  for (const [code, sn, want] of RETO_ERRORS) {
    const page = await retoLab(`ex=ej6&lang=es&sn=${sn}`);
    await noMarks(page, code);
    const text = await retoCheck(page);
    assert.match(text, /^Hay \d+ cosas? que corregir/, `${code}: ${text}`);
    assert.match(text, want, `${code}: ${text}`);
    if (code === 'falsePrecedence') {
      await axe(page, 'reto con un error (ES, claro)');
      // Editar la red borra el diagnóstico: hasta volver a comprobar no se marca nada.
      await page.locator('#retoView [data-k="dx:3"]').click();
      await page.waitForFunction(() => PNL.app.reto().net.dummies.length === 3);
      await noMarks(page, 'tras editar');
    }
    await close(page);
  }
  const page = await retoLab(`ex=ej6&lang=en&sn=${retoSn()}`, { scheme: 'dark' });
  const text = await retoCheck(page);
  assert.match(text, /^Correct network/, text);
  assert.doesNotMatch(text, /to fix/);
  await axe(page, 'reto en el mínimo (EN, oscuro)');
  await close(page);
});

check('F2b T027 · en el lienzo ninguna flecha pasa por encima de otro suceso, también con los sucesos colocados por niveles', async () => {
  // Hallazgo de la evidencia (T027): con la red mínima del Ejercicio 6 colocada sola, D (1 → 8) y H (5 → 8) iban en
  // línea recta por la fila de arriba y quedaban tapadas, y F2 (2 → 4) cruzaba el suceso 3.
  for (const hash of [`ex=ej6&lang=es&sn=${retoSn()}`, `ex=ej6&lang=en&sn=${retoSn(RETO_EV, RETO_ARC, [...RETO_DUM, '0-1'])}`]) {
    const page = await retoLab(hash);
    const hits = await page.evaluate(() => {
      const svg = document.querySelector('#retoView .reto-svg');
      const evs = [...svg.querySelectorAll('g.reto-ev')].map((g) => { const m = /translate\(([-\d.]+),([-\d.]+)\)/.exec(g.getAttribute('transform')); return { x: +m[1], y: +m[2] }; });
      const out = [];
      for (const g of svg.querySelectorAll('g.reto-edge')) {
        const path = g.querySelector('path.edge'); const len = path.getTotalLength();
        const a = path.getPointAtLength(0); const b = path.getPointAtLength(len);
        const ends = [a, b].map((q) => evs.reduce((best, e) => (Math.hypot(e.x - q.x, e.y - q.y) < Math.hypot(best.x - q.x, best.y - q.y) ? e : best)));
        for (let i = 1; i < 40; i++) {
          const q = path.getPointAtLength(len * i / 40);
          const near = evs.find((e) => !ends.includes(e) && Math.hypot(e.x - q.x, e.y - q.y) < 20);
          if (near) { out.push(`${g.querySelector('text').textContent} por (${near.x}, ${near.y})`); break; }
        }
      }
      return out;
    });
    assert.deepEqual(hits, [], hash);
    await close(page);
  }
});

check('F2b AC11 · red correcta: cuántas ficticias frente al mínimo y cuáles se pueden quitar, también en el lienzo', async () => {
  const page = await retoLab(`ex=ej6&lang=es&sn=${retoSn(RETO_EV, RETO_ARC, [...RETO_DUM, '0-1'])}`);
  await noMarks(page, 'red correcta con una ficticia de más, antes de comprobar');   // revisión F2b, F7 (AC12)
  const text = await retoCheck(page);
  assert.match(text, /^Red correcta/, text);
  assert.match(text, /4 ficticias/, text);
  assert.match(text, /F4/, text);
  assert.equal(await page.locator('#retoView .reto-svg .edge.rm').count(), 1, 'F4 en rojo en el lienzo');
  assert.equal(await page.locator('#retoView .reto-svg .elabel.rm').evaluate((e) => e.textContent), 'F4');
  await axe(page, 'reto correcto con una ficticia de más');
  await close(page);
  const min = await retoLab(`ex=ej6&lang=es&sn=${retoSn()}`);
  const t2 = await retoCheck(min);
  assert.match(t2, /3 ficticias/, t2);
  assert.equal(await min.locator('#retoView .reto-svg .edge.rm').count(), 0);
  await close(min);
});

check('F2b revisión, ronda 2 · reto con actividades llamadas F1, F2…: la tabla, el lienzo y el diagnóstico dicen f1, f2…', async () => {
  const succ = { F1: ['F3', 'F4'], F2: ['F3', 'F5'], F3: [], F4: ['F5'], F5: [] };
  const rows = Object.keys(succ).map((id) => ({ id, name: '', duration: '2', links: succ[id].join(', ') }));
  const page = await lab('v=work&lang=es');
  // La red de las reglas con la primera ficticia repetida (correcta, con ficticias que sobran).
  const hash = await page.evaluate((r) => {
    const p = PNL.project.parse(r, 'succ').project;
    const net = PNL.aoa.build(p);
    const sn = { events: net.events.map((e) => ({ id: e.n, n: e.n })), arcs: net.arcs.map((a) => ({ act: a.act, from: a.from, to: a.to })),
      dummies: [...net.dummies, net.dummies[0]].map((d) => ({ from: d.from, to: d.to })) };
    return PNL.urlstate.encode(Object.assign(PNL.urlstate.defaults(), { v: 'work', t: r, mode: 'succ', lang: 'es', graph: 'aoa', view: 'reto', sn }));
  }, rows);
  await page.evaluate((h) => { location.hash = h; }, hash);
  await page.waitForFunction(() => PNL.app.reto() && PNL.app.reto().net.dummies.length === 4);
  const labels = await svgTexts(page, '#retoView .reto-svg text.elabel.dummy');
  assert.deepEqual(labels.sort(), ['f1', 'f2', 'f3', 'f4']);
  assert.deepEqual(await page.locator('#retoView table.reto-tbl tbody th').allInnerTexts(), ['F1', 'F2', 'F3', 'F4', 'F5', 'f1', 'f2', 'f3', 'f4'], 'actividades y ficticias de la tabla');
  const text = await retoCheck(page);
  assert.match(text, /^Red correcta/, text);
  assert.match(text, /La ficticia f[0-9]+ sobra/, text);
  assert.doesNotMatch(text, /La ficticia F[0-9]/, text);
  assert.ok(await page.locator('#retoView .reto-svg .edge.rm').count() >= 1, 'el lienzo marca las que sobran');
  await close(page);
});

check('F2b · rendirse y volver: «Ver una solución» enseña la red de un método sin borrar la del alumno y «Volver a mi red» la devuelve', async () => {
  const sn = retoSn(RETO_EV, Object.assign({}, RETO_ARC, { A: '0-' }));
  const page = await retoLab(`ex=ej6&lang=es&sn=${sn}`);
  const mine = await retoNet(page);
  await page.locator('#retoView [data-k="solution"]').click();
  assert.ok(await page.locator('#retoView .reto-solution').isVisible());
  assert.equal(await page.locator('#retoView .reto-canvas').count(), 0, 'la solución ocupa el sitio del lienzo');
  assert.match(await page.locator('#retoView .reto-solution .reto-count').innerText(), /^3 ficticias · 9 sucesos$/);
  await page.locator('#retoView select[data-k="method"]').selectOption('cs');
  await page.waitForFunction(() => PNL.app.reto().solution === 'cs');
  assert.match(await page.locator('#retoView .reto-solution .reto-count').innerText(), /^6 ficticias · 11 sucesos$/);
  assert.deepEqual(await retoNet(page), mine, 'la red del alumno sigue igual');
  await axe(page, 'reto con una solución a la vista');
  await page.locator('#retoView [data-k="back"]').click();
  assert.ok(await page.locator('#retoView .reto-canvas').isVisible());
  assert.deepEqual(await retoNet(page), mine);
  // La próxima vez se ofrece el último método elegido.
  await page.locator('#retoView [data-k="solution"]').click();
  assert.equal(await page.locator('#retoView select[data-k="method"]').inputValue(), 'cs');
  await close(page);
});

// Red mínima del Ejercicio 6 por sucesos (posición en la lista = número): arcos y ficticias entre ellos.
const EJ6_ARCS = Object.entries(RETO_ARC).map(([a, v]) => [a, ...v.split('-').map(Number)]);
const EJ6_DUMS = RETO_DUM.map((v) => v.split('-').map(Number));

check('F2b AC13 · lienzo solo con el teclado: la red del Ejercicio 6, correcta y en el mínimo', async () => {
  const page = await retoLab('ex=ej6&lang=es');
  await page.locator('#retoView [data-k="svg"]').focus();
  for (let i = 0; i < 9; i++) await page.keyboard.press('n');
  await page.waitForFunction(() => PNL.app.reto().net.events.length === 9);
  const ids = (await retoNet(page)).events.map((e) => e.id);
  const at = async (i, key) => { await page.locator(`#retoView [data-k="ev:${ids[i]}"]`).focus(); await page.keyboard.press(key); };
  // La actividad que se dibuja avanza sola a la siguiente sin dibujar: A, B, C… en orden.
  for (const [, from, to] of EJ6_ARCS) { await at(from, 'a'); await at(to, 'a'); }
  for (const [from, to] of EJ6_DUMS) { await at(from, 'd'); await at(to, 'd'); }
  // Las flechas mueven el suceso enfocado.
  const before = (await retoNet(page)).events.find((e) => e.id === ids[8]);
  await at(8, 'ArrowRight');
  assert.equal((await retoNet(page)).events.find((e) => e.id === ids[8]).x, before.x + 20);
  await page.locator('#retoView [data-k="autoNumber"]').focus();
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => PNL.app.reto().net.events.every((e) => e.n !== null));
  await page.locator('#retoView [data-k="check"]').focus();
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => { const r = PNL.app.reto().result; return r && r.min; }, null, { timeout: 30000 });
  const r = await page.evaluate(() => PNL.app.reto().result);
  assert.ok(r.correct, JSON.stringify(r.problems));
  assert.equal(r.extra, 0);
  assert.equal(await page.evaluate(() => document.activeElement.dataset.k), 'result', 'el foco va al resultado');
  await axe(page, 'reto hecho con el teclado');
  await close(page);
});

check('F2b AC13 · lienzo solo con pulsaciones, sin arrastrar: la red del Ejercicio 6, correcta y en el mínimo', async () => {
  const page = await retoLab('ex=ej6&lang=en');
  await page.locator('#retoView [data-k="tool:event"]').click();
  const svg = page.locator('#retoView .reto-svg');
  const spots = [[60, 160], [180, 100], [180, 40], [180, 220], [300, 100], [300, 220], [420, 220], [540, 160], [620, 160]];
  for (const [x, y] of spots) {
    const bb = await svg.boundingBox();
    const vb = (await svg.getAttribute('viewBox')).split(' ').map(Number);
    const n = (await retoNet(page)).events.length;
    await page.mouse.click(bb.x + (x / vb[2]) * bb.width, bb.y + (y / vb[3]) * bb.height);
    await page.waitForFunction((k) => PNL.app.reto().net.events.length === k + 1, n);
  }
  const ids = (await retoNet(page)).events.map((e) => e.id);
  const tap = (i) => page.locator(`#retoView [data-k="ev:${ids[i]}"]`).click();
  await page.locator('#retoView [data-k="tool:activity"]').click();
  for (const [, from, to] of EJ6_ARCS) { await tap(from); await tap(to); }
  await page.locator('#retoView [data-k="tool:dummy"]').click();
  for (const [from, to] of EJ6_DUMS) { await tap(from); await tap(to); }
  await page.locator('#retoView [data-k="autoNumber"]').click();
  const text = await retoCheck(page);
  assert.match(text, /^Correct network/, text);
  const r = await page.evaluate(() => PNL.app.reto().result);
  assert.equal(r.extra, 0);
  await shot(page, 'f2b-reto-pulsaciones-en');
  await close(page);
});

check('F2b AC16 y AC15 · reto a 1280×720 sin desplazar la página y a 360 px sin desplazamiento horizontal; axe en claro y oscuro', async () => {
  for (const [hash, scheme] of [[`ex=ej6&lang=es&sn=${retoSn()}`, 'light'], [`ex=ej6&lang=en&sn=${retoSn()}`, 'dark']]) {
    const page = await retoLab(hash, { scheme });
    await retoCheck(page);
    const box = await page.evaluate(() => ({ y: window.scrollY, grid: document.querySelector('#retoView .reto-grid').getBoundingClientRect().bottom, w: document.documentElement.scrollWidth }));
    assert.ok(box.y === 0 && box.grid <= 720 && box.w <= 1280, `1280×720: ${JSON.stringify(box)}`);
    await axe(page, `reto comprobado a 1280×720 (${scheme})`);
    await shot(page, `f2b-reto-${scheme}`);
    await close(page);
  }
  for (const lang of ['es', 'en']) {
    const page = await retoLab(`ex=ej6&lang=${lang}&sn=${retoSn(RETO_EV, RETO_ARC, [...RETO_DUM, '2-3'])}`, { width: 360, height: 740 });
    await retoCheck(page);
    assert.ok(await noHScroll(page), `360 px (${lang})`);
    await page.locator('#retoView [data-k="solution"]').click();
    assert.ok(await noHScroll(page), `360 px con la solución (${lang})`);
    await axe(page, `reto a 360 px con la solución (${lang.toUpperCase()})`);
    await shot(page, `f2b-reto-360-${lang}`, true);
    await close(page);
  }
});

check('F2b AC18 · reto con el Ejercicio 1 (solo estructura): se escribe en la tabla y se comprueba igual', async () => {
  const page = await retoLab('ex=ej1&lang=es');
  assert.ok(await page.locator('#urlWarning').isHidden());
  // Red mínima del Ejercicio 1 escrita en la tabla de sucesos.
  const ej1 = { A: [1, 2], B: [1, 3], C: [1, 4], D: [3, 5], E: [2, 7], G: [2, 6], H: [5, 6], I: [4, 7], J: [6, 7] };
  for (const [a, [from, to]] of Object.entries(ej1)) { await retoCell(page, `a:${a}:from`, String(from)); await retoCell(page, `a:${a}:to`, String(to)); }
  for (const [i, [from, to]] of [[2, 3], [4, 5]].entries()) {
    await page.locator('#retoView [data-k="addDummy"]').click();
    await retoCell(page, `d:${i}:from`, String(from));
    await retoCell(page, `d:${i}:to`, String(to));
  }
  const text = await retoCheck(page);
  assert.match(text, /^Red correcta/, text);
  assert.match(text, /2 ficticias/, text);
  assert.equal((await page.evaluate(() => PNL.app.reto().result)).extra, 0);
  await close(page);
});

check('F2b T026 · entradas al reto: la barra de vistas de la red PERT, del progresivo y del comparador, el taller y la portada', async () => {
  const page = await lab('graph=aoa&ex=ej6&step=5&min=1&lang=es');
  assert.equal(await page.locator('#btnReto').innerText(), 'Reto de ficticias');
  assert.equal(await page.locator('#btnReto').getAttribute('aria-pressed'), 'false');
  await page.locator('#btnReto').click();
  await page.waitForFunction(() => PNL.app.state().view === 'reto' && !PNL.app.state().min);
  assert.equal(await page.locator('#btnReto').getAttribute('aria-pressed'), 'true');
  assert.ok(await page.locator('#retoView .reto-canvas').isVisible());
  // Del reto al comparador y vuelta: la barra es la misma; la red del alumno se conserva.
  await retoCell(page, 'a:A:from', '1');
  const mine = await retoNet(page);
  await page.locator('#btnCmp').click();
  await page.waitForFunction(() => PNL.app.state().view === 'cmp');
  assert.ok(await page.locator('#btnReto').isVisible(), 'el comparador también lleva al reto');
  await page.locator('#btnReto').click();
  await page.waitForFunction(() => PNL.app.state().view === 'reto');
  assert.deepEqual(await retoNet(page), mine);
  await page.locator('#btnNet').click();
  await page.waitForFunction(() => PNL.app.state().view === 'net');
  await close(page);
  const roy = await lab('ex=ej6&lang=es');
  assert.ok(await roy.locator('#btnReto').isHidden(), 'no en la red ROY');
  await close(roy);
  const prog = await lab('graph=aoa&m=prog&ex=ej6&step=3&lang=en');
  assert.equal(await prog.locator('#btnReto').innerText(), 'Dummy challenge');
  await prog.locator('#btnReto').click();
  await prog.waitForFunction(() => PNL.app.state().view === 'reto' && PNL.app.state().m === 'rules');
  await close(prog);
  // Taller: «Reto de ficticias» en el resumen, también desde la red ROY y con una tabla solo de estructura.
  const work = await lab('v=work&lang=es');
  await work.locator('#workshop .work-side button', { hasText: 'Reto de ficticias' }).click();
  await work.waitForFunction(() => PNL.app.state().view === 'reto' && PNL.app.state().graph === 'aoa');
  assert.equal((await state(work)).v, 'work');
  await work.locator('#workshop .work-tools select').selectOption('tipo');
  await work.waitForFunction(() => PNL.app.reto() && PNL.app.reto().net.arcs.length === 5);
  assert.deepEqual((await retoNet(work)).events, [], 'otra tabla empieza el reto de cero');
  await axe(work, 'taller con el reto del caso tipo');
  await close(work);
  // Portada: el tercer enlace de M2.
  const noJs = await open('index.html', { js: false });
  assert.match(await noJs.locator('a[data-lab="reto"]').getAttribute('href'), /^cpm\.html#v=route&ex=ej6&step=0&graph=aoa&view=reto&lang=es$/);
  await close(noJs);
  const portal = await open('index.html?lang=en');
  assert.match(await portal.locator('a[data-lab="reto"]').innerText(), /Dummy challenge/);
  await portal.locator('a[data-lab="reto"]').click();
  await portal.waitForFunction(() => window.PNL && PNL.app && PNL.app.state() && PNL.app.state().view === 'reto');
  assert.equal((await state(portal)).lang, 'en');
  await close(portal);
  for (const [scheme, width] of [['light', 1280], ['dark', 360]]) {
    const home = await open('index.html?lang=es', { scheme, width, height: 800 });
    assert.ok(await noHScroll(home), `portada a ${width} px`);
    await axe(home, `portada con los tres enlaces de M2 (${scheme}, ${width} px)`);
    await home.locator('a[data-lab="m2"]').scrollIntoViewIfNeeded();
    await shot(home, `f2b-portada-m2-reto-${scheme}-${width}`);
    await close(home);
  }
});

// ---------- F2c, hito 1: M0, del enunciado a la tabla (T019) ----------

const U0 = require(path.join(ROOT, 'js', 'core', 'urlstate.js'));
// Abre M0 con un estado dado (enunciado, tabla, subrayados, vista y modo) directamente desde la URL.
const m0Url = (s) => `cpm.html${U0.encode(Object.assign(U0.defaults(), { v: 'm0', st: 'ej5', lang: 'es' }, s))}`;
async function m0Lab(s = {}, opts = {}) {
  const page = await open(m0Url(s), opts);
  await page.waitForFunction(() => PNL.m0.state && PNL.m0.state().st);
  return page;
}
const m0st = (page) => page.evaluate(() => PNL.m0.state());
// Fragmentos del enunciado en un idioma, por su id (para saber qué palabras subrayar).
const fragsOf = (page, id, lang) => page.evaluate(([i, l]) => Object.fromEntries(PNL.statement.build(PNL.statements.get(i), l).frags.map((f) => [f.id, { from: f.from, to: f.to }])), [id, lang]);
const word = (page, i) => page.locator(`#m0View .st-text.ul [data-i="${i}"]`);
const m0Panel = (page) => page.locator('#m0View .m0-panel');
// Subraya de la palabra «from» a la «to» con dos pulsaciones (sin arrastrar) y acepta la propuesta del panel.
async function underline(page, from, to, opts = {}) {
  if ((await page.locator('#m0Ul').getAttribute('aria-pressed')) !== 'true') await page.locator('#m0Ul').click();
  const press = (loc) => (opts.tap ? loc.tap() : loc.click());
  await press(word(page, from));
  await press(word(page, to));
  await m0Panel(page).waitFor({ state: 'visible' });
  if (opts.kind) assert.equal(await m0Panel(page).locator('input[name="m0Kind"]:checked').getAttribute('value'), opts.kind, `propuesta de «${from}–${to}»`);
  if (opts.fill) await opts.fill(m0Panel(page));
  await press(page.locator('#m0PanelOk'));
  await m0Panel(page).waitFor({ state: 'hidden' });
}
const m0Seg = (page, k) => page.locator('#m0View .m0-bar .seg').nth(1).locator('button').nth(k);   // 0: lista, 1: matriz
const cell = (page, key) => page.locator(`#m0View [data-cell="${key}"]`);
const cellTd = (page, key) => cell(page, key).locator('xpath=..');
// Campo de precedencias de la fila de una actividad en la lista (las filas van en el orden de la tabla).
async function listLinks(page, id) {
  const i = (await m0st(page)).rows.findIndex((r) => r.id === id);
  assert.ok(i >= 0, `no hay fila ${id}`);
  return page.locator('#m0View .m0-list tbody tr').nth(i).locator('[data-f="links"]');
}
async function m0Check(page) {
  await page.locator('#m0Check').click();
  await page.locator('#m0DiagLine').waitFor();
  return (await m0st(page)).diag;
}
const EJ5_PRED = [['A', 'D'], ['B', 'D'], ['B', 'E'], ['C', 'E'], ['A', 'F'], ['B', 'F'], ['F', 'G'], ['D', 'H'], ['E', 'H'], ['H', 'I'], ['G', 'J'], ['I', 'J'], ['J', 'K']];
const EJ5_DUR = { A: 3, B: 1, C: 2, D: 7, E: 5, F: 6, G: 1, H: 2, I: 1, J: 3, K: 1 };
const COCINA = [R('A', 2), R('B', 3, 'A'), R('C', 2, 'A'), R('D', 4, 'B, C'), R('E', 1, 'A'), R('F', 2, 'D, E'), R('G', 1, 'F'), R('H', 1, 'G')];
const CONGRESO = [R('A', ''), R('B', '', 'C'), R('C', '', 'A'), R('D', '', 'B'), R('E', '', 'D'), R('F', '', 'B'), R('G', '', 'E, F')];
const markOf = (f, kind, extra) => Object.assign({ from: f.from, to: f.to, kind }, extra || {});

// Subraya las once actividades (con su letra) y sus duraciones del Ej. 5, y comprueba lo que la propuesta pone en la tabla.
async function underlineEj5(page, lang) {
  const fr = await fragsOf(page, 'ej5', lang);
  const words = await page.evaluate((l) => PNL.statement.build(PNL.statements.get('ej5'), l).words.map((w) => w.t), lang);
  for (const id of Object.keys(EJ5_DUR)) {
    const f = fr[`a${id}`];
    assert.equal(words[f.from - 1], id, `${lang}: la letra ${id} va justo antes de su descripción`);
    await underline(page, f.from - 1, f.to, { kind: 'activity' });
  }
  for (const id of Object.keys(EJ5_DUR)) await underline(page, fr[`d${id}`].from, fr[`d${id}`].to, { kind: 'duration' });
  const s = await m0st(page);
  assert.deepEqual(s.rows.map((r) => r.id), Object.keys(EJ5_DUR));
  assert.deepEqual(Object.fromEntries(s.rows.map((r) => [r.id, Number(r.duration)])), EJ5_DUR, 'las duraciones salen del texto');
  assert.ok(s.rows.every((r) => r.name.length > 3 && r.links === ''), 'cada fila con su nombre y sin precedencias');
  assert.equal(s.marks.length, 22);
}

for (const lang of ['es', 'en']) {
  check(`F2c AC1–AC3, AC7 y AC15 · Ej. 5 en ${lang.toUpperCase()}: subrayado y ${lang === 'es' ? 'matriz' : 'lista'}, «Comprobar», M1 (17 días) y M2 y vuelta con «Atrás»`, async () => {
    const es = lang === 'es';
    const page = await m0Lab({ lang });
    assert.deepEqual((await m0st(page)).rows, [], 'la tabla empieza vacía');
    assert.ok(await page.locator('#m0View .m0-diag').isHidden(), 'nada de la corrección antes de comprobar');
    await underlineEj5(page, lang);
    if (es) {
      await m0Seg(page, 1).click();
      await page.waitForFunction(() => PNL.app.state().tv === 'matrix');
      for (const [p, a] of EJ5_PRED) await cell(page, `${p}>${a}`).check();
    } else {
      const preds = {};
      for (const [p, a] of EJ5_PRED) (preds[a] = preds[a] || []).push(p);
      for (const [a, ps] of Object.entries(preds)) await (await listLinks(page, a)).fill(ps.join(', '));
      await m0Seg(page, 1).click();
      for (const [p, a] of EJ5_PRED) assert.ok(await cell(page, `${p}>${a}`).isChecked(), `la matriz refleja ${p} → ${a}`);
      assert.equal(await page.locator('#m0View [data-cell]:checked').count(), EJ5_PRED.length);
    }
    await page.waitForFunction((n) => PNL.app.state().t.filter((r) => r.links).length === n, 8);
    assert.match(await page.locator('#m0View .m0-val').innerText(), es ? /Sin ciclos ni precedencias redundantes/ : /No cycles and no redundant/);
    const d = await m0Check(page);
    assert.equal(d.ok, true, JSON.stringify(d.items));
    assert.match(await page.locator('#m0DiagLine').innerText(), es ? /correcta/ : /correct/);
    await shot(page, `f2c-ej5-${lang}-1280-corregido`);
    // M1: la tabla depurada da 17 días; «Atrás» devuelve M0 tal como estaba, con la corrección.
    await page.locator('#m0OpenM1').click();
    await page.waitForFunction(() => PNL.app.state().v === 'route' && PNL.app.state().graph === 'aon');
    const sol = await page.evaluate(() => { const s = PNL.app.model().solution; return { d: s.duration, crit: s.critical.join('') }; });
    assert.deepEqual(sol, { d: 17, crit: 'ADHIJK' });
    await page.goBack();
    await page.waitForFunction(() => PNL.app.state().v === 'm0' && PNL.m0.state().rows.length === 11);
    assert.equal((await m0st(page)).marks.length, 22, 'los subrayados siguen');
    assert.ok(await page.locator('#m0DiagLine').isVisible(), 'la corrección vuelve si nada cambió');
    // M2: la red PERT de la tabla depurada (2 ficticias).
    await page.locator('#m0OpenM2').click();
    await page.waitForFunction(() => PNL.app.state().v === 'route' && PNL.app.state().graph === 'aoa');
    const net = await page.evaluate(() => { const n = PNL.app.model().net; return { dummies: n.dummies.length, events: n.events.length }; });
    assert.deepEqual(net, { dummies: 2, events: 10 });
    await page.goBack();
    await page.waitForFunction(() => PNL.app.state().v === 'm0' && PNL.m0.state().rows.length === 11);
    assert.equal((await state(page)).tv, 'matrix');
    await close(page);
  });
}

check('F2c AC2 · quitar un subrayado (en la lista de subrayados o en su panel) no borra la fila ni lo que puso en la tabla', async () => {
  const page = await m0Lab();
  const fr = await fragsOf(page, 'ej5', 'es');
  await underline(page, fr.aA.from - 1, fr.aA.to);
  await underline(page, fr.dA.from, fr.dA.to);
  assert.equal((await m0st(page)).marks.length, 2);
  // Desde la lista de subrayados.
  await page.locator('#m0View .m0-marks summary').click();
  await page.locator('#m0View [data-fk="mk-r-1"]').click();
  await page.waitForFunction(() => PNL.m0.state().marks.length === 1);
  // Desde el panel: pulsar una palabra subrayada lo abre para editarlo o quitarlo.
  await word(page, fr.aA.from + 1).click();
  await m0Panel(page).waitFor({ state: 'visible' });
  assert.equal((await m0st(page)).panel.edit, 0);
  await m0Panel(page).locator('button', { hasText: 'Quitar' }).click();
  await page.waitForFunction(() => PNL.m0.state().marks.length === 0);
  const s = await m0st(page);
  assert.deepEqual(s.rows.map((r) => [r.id, r.duration]), [['A', '3']], 'la fila sigue, con su duración');
  assert.match(s.rows[0].name, /^Aprovisionamiento/);
  await close(page);
});

check('F2c AC4 · redundancias con su camino y la frase de su subrayado, en la lista y en la matriz; se elige cuál', async () => {
  for (const lang of ['es', 'en']) {
    const probe = await m0Lab({ st: 'cocina', lang });
    const fr = await fragsOf(probe, 'cocina', lang);
    await close(probe);
    const rows = COCINA.map((r) => (r.id === 'G' ? R('G', 1, 'F, D') : r.id === 'H' ? R('H', 1, 'G, A') : r));
    const page = await m0Lab({ st: 'cocina', lang, t: rows, mk: [markOf(fr.r1, 'precedence', { gives: [['D', 'G']] })] });
    const v = (await m0st(page)).validation;
    assert.deepEqual(v.redundant.map((r) => r.edge.join('>')).sort(), ['A>H', 'D>G']);
    const dg = v.redundant.find((r) => r.edge.join('>') === 'D>G');
    assert.deepEqual(dg.path, ['D', 'F', 'G']);
    const text = await page.locator('#m0View .m0-val').innerText();
    assert.ok(text.includes(lang === 'es' ? 'D → G es redundante: D → F → G ya la implica.' : 'D → G'), text);
    assert.match(text, lang === 'es' ? /Tu subrayado: «Ana insiste/ : /«Ana /, 'la frase subrayada que la dio');
    assert.equal(v.errors.length, 0, 'una redundancia es un aviso');
    // En la lista: el campo de la redundante (discontinuo) y el camino elegido (continuo).
    const k = v.redundant.indexOf(dg);
    await page.locator(`#m0View [data-fk="red-${k}"]`).click();
    assert.match(await (await listLinks(page, 'G')).getAttribute('class'), /m0-red/);
    assert.match(await (await listLinks(page, 'F')).getAttribute('class'), /m0-path/);
    assert.equal(await page.locator(`#m0View [data-fk="red-${k}"]`).getAttribute('aria-pressed'), 'true');
    // En la matriz: «r» en la redundante y marco en su camino; elegir la otra cambia el camino.
    await m0Seg(page, 1).click();
    await page.waitForFunction(() => PNL.app.state().tv === 'matrix');
    assert.match(await cellTd(page, 'D>G').getAttribute('class'), /m-red/);
    assert.equal(await cellTd(page, 'D>G').locator('.sym').innerText(), 'r');
    for (const e of ['D>F', 'F>G']) assert.match(await cellTd(page, e).getAttribute('class'), /m-path/, e);
    assert.match(await cell(page, 'D>G').getAttribute('aria-label'), lang === 'es' ? /D → G, redundante/ : /D → G, redundant/);
    const other = v.redundant.find((r) => r !== dg);
    await page.locator(`#m0View [data-fk="red-${v.redundant.indexOf(other)}"]`).click();
    for (let i = 0; i + 1 < other.path.length; i++) assert.match(await cellTd(page, `${other.path[i]}>${other.path[i + 1]}`).getAttribute('class'), /m-path|m-red/);
    if (lang === 'es') await shot(page, 'f2c-cocina-es-redundancia-matriz');
    await close(page);
  }
});

check('F2c AC5 · ciclo de la trampa de lectura: su recorrido en la lista y en la matriz, con la frase que lo provocó; sin tabla depurada', async () => {
  for (const lang of ['es', 'en']) {
    const probe = await m0Lab({ st: 'congreso', lang });
    const fr = await fragsOf(probe, 'congreso', lang);
    await close(probe);
    const rows = CONGRESO.map((r) => (r.id === 'A' ? R('A', '', 'B') : r));
    const page = await m0Lab({ st: 'congreso', lang, t: rows, mk: [markOf(fr.p1, 'precedence', { gives: [['B', 'A']] })] });
    const v = (await m0st(page)).validation;
    assert.deepEqual(v.cycle.ids.slice().sort(), ['A', 'B', 'C']);
    const text = await page.locator('#m0View .m0-val').innerText();
    assert.match(text, lang === 'es' ? /Ciclo: [ABC] → [ABC] → [ABC] → [ABC]/ : /Cycle: [ABC] → [ABC] → [ABC] → [ABC]/, text);
    assert.match(text, lang === 'es' ? /B → A, de tu subrayado «B sigue a A»/ : /B → A, .*«B follows A»/, text);
    for (const id of ['A', 'B', 'C']) assert.match(await (await listLinks(page, id)).getAttribute('class'), /m0-cycle/, `fila ${id}`);
    assert.ok(await page.locator('#m0OpenM2').isDisabled(), 'con un ciclo no hay tabla depurada');
    await m0Seg(page, 1).click();
    for (const e of ['B>A', 'A>C', 'C>B']) {
      assert.match(await cellTd(page, e).getAttribute('class'), /m-cycle/, e);
      assert.equal(await cellTd(page, e).locator('.sym').innerText(), '!');
    }
    const d = await m0Check(page);
    assert.deepEqual(d.items.map((i) => i.code), ['cycle']);
    if (lang === 'es') await shot(page, 'f2c-congreso-es-ciclo-matriz');
    await close(page);
  }
});

check('F2c AC6 · iniciales y finales, y los avisos de «es lo primero» y «es lo último» que la tabla contradice', async () => {
  const probe = await m0Lab({ st: 'congreso' });
  const fr = await fragsOf(probe, 'congreso', 'es');
  await close(probe);
  const page = await m0Lab({ st: 'congreso', t: CONGRESO, mk: [markOf(fr.s1, 'precedence', { decl: { end: 'start', act: 'B' } }), markOf(fr.e1, 'precedence', { decl: { end: 'end', act: 'F' } })] });
  const text = await page.locator('#m0View .m0-val').innerText();
  assert.match(text, /Iniciales: A · Finales: G\./);
  assert.match(text, /Tu subrayado «todo empieza por A» dice que B es la primera, pero en la tabla B tiene predecesoras: C\./);
  assert.match(text, /Tu subrayado «G es lo último» dice que F es la última, pero en la tabla F tiene posteriores: G\./);
  await close(page);
  const two = await m0Lab({ st: 'congreso', t: CONGRESO.filter((r) => r.id !== 'G'), mk: [markOf(fr.e1, 'precedence', { decl: { end: 'end', act: 'E' } }), markOf({ from: fr.e1.from - 2, to: fr.e1.from - 2 }, 'activity', { act: 'G' })] });
  const t2 = await two.locator('#m0View .m0-val').innerText();
  assert.match(t2, /Iniciales: A · Finales: E, F\./);
  assert.match(t2, /dice que E es la última, pero en la tabla también son finales: F\./);
  assert.match(t2, /Has subrayado la actividad G en el texto, pero no está en la tabla\./);
  await close(two);
});

check('F2c AC7 · «Comprobar»: un error de cada tipo, con su frase; la columna «Corresponde a»; editar oculta la corrección', async () => {
  // Cocina: A con otra duración, falta C → D, D → E no está, G → F al revés, Z de más y falta H.
  const rows = [R('A', 5), R('B', 3, 'A'), R('C', 2, 'A'), R('D', 4, 'B'), R('E', 1, 'A, D'), R('F', 2, 'D, E, G'), R('G', 1), R('Z', 1, 'F')];
  for (const lang of ['es', 'en']) {
    const page = await m0Lab({ st: 'cocina', lang, t: rows });
    const corr = await page.evaluate((l) => PNL.i18n.t(l, 'm0.diag.corresponds'), lang);
    assert.ok(await page.locator('#m0View .m0-diag').isHidden(), 'nada de la corrección antes de comprobar');
    assert.ok(!(await page.locator('#m0View .m0-list thead').innerText()).includes(corr), 'sin la columna de la correspondencia');
    const d = await m0Check(page);
    assert.deepEqual([...new Set(d.items.map((i) => i.code))].sort(), ['duration', 'extraActivity', 'falsePrecedence', 'inverted', 'missingActivity', 'missingPrecedence']);
    const text = await page.locator('#m0View .m0-diag').innerText();
    if (lang === 'es') {
      for (const re of [/Falta una actividad del enunciado: «limpiar la obra»\./i, /Z no es ninguna actividad del enunciado\./, /La duración de A no es la del enunciado\./,
        /Precedencia invertida: el enunciado dice F → G y la tabla tiene la contraria\./, /Falta C → D: el enunciado la implica y la tabla no\. En el enunciado: «Las paredes/, /D → E no está en el enunciado\./]) assert.match(text, re, text);
      await shot(page, 'f2c-cocina-es-errores');
    }
    assert.ok((await page.locator('#m0View .m0-list thead').innerText()).includes(corr), 'columna de la correspondencia');
    // Editar la tabla oculta la corrección (ya no es la de esta tabla).
    await (await listLinks(page, 'D')).fill('B, C');
    await page.waitForFunction(() => !PNL.m0.state().diag);
    assert.ok(await page.locator('#m0View .m0-diag').isHidden());
    await close(page);
  }
  const bad = await m0Lab({ st: 'cocina', t: [R('A', -1), R('B', 3, 'A')] });
  assert.deepEqual((await m0Check(bad)).items.map((i) => i.code), ['invalid']);
  await close(bad);
});

check('F2c plan §0 · las flechas dentro del texto y de la matriz mueven el foco y no cambian de paso ni de modo', async () => {
  const page = await m0Lab({ t: COCINA.slice(0, 4), tv: 'matrix' });
  const before = await state(page);
  await page.locator('#m0Ul').click();
  assert.equal(await page.evaluate(() => document.activeElement.getAttribute('data-i')), '0', 'al subrayar, el foco va al texto');
  for (const k of ['ArrowRight', 'ArrowRight', 'ArrowRight', 'ArrowLeft', 'End', 'Home', 'ArrowRight']) await page.keyboard.press(k);
  assert.equal(await page.evaluate(() => document.activeElement.getAttribute('data-i')), '1');
  await page.locator('#m0View [data-cell][tabindex="0"]').focus();
  const start = await page.evaluate(() => document.activeElement.getAttribute('data-cell'));
  for (const k of ['ArrowDown', 'ArrowRight', 'ArrowUp', 'ArrowLeft', 'ArrowDown']) await page.keyboard.press(k);
  const end = await page.evaluate(() => document.activeElement.getAttribute('data-cell'));
  assert.ok(end && end !== start, `el foco se mueve por la matriz (${start} → ${end})`);
  const after = await state(page);
  assert.deepEqual([after.step, after.mm, after.tv, after.t], [before.step, before.mm, before.tv, before.t]);
  // En la ruta paso a paso, en cambio, las flechas son las del reproductor.
  const route = await m0Lab({ mm: 'route' });
  await route.locator('#m0View .m0-textbody').focus();
  await route.keyboard.press('ArrowRight');
  await route.keyboard.press('ArrowRight');
  assert.equal((await state(route)).step, 2);
  await route.keyboard.press('Home');
  assert.equal((await state(route)).step, 0);
  await close(route);
  await close(page);
});

check('F2c AC18 · alternativas en texto: la lista y la matriz dicen lo mismo, cada casilla dice qué es y la lista de subrayados dice lo del texto', async () => {
  const probe = await m0Lab({ st: 'cocina' });
  const fr = await fragsOf(probe, 'cocina', 'es');
  await close(probe);
  const marks = [markOf(fr.aA, 'activity', { act: 'A' }), markOf(fr.dA, 'duration', { act: 'A', value: 2 }), markOf(fr.p1, 'precedence', { gives: [['A', 'B'], ['A', 'C']] }), markOf(fr.n1, 'none')];
  const page = await m0Lab({ st: 'cocina', t: COCINA, mk: marks });
  // Lectura: cada subrayado lleva su etiqueta escrita, no solo un color.
  const reading = await page.locator('#m0View .st-text').innerText();
  for (const b of ['A', '= 2', 'A→B A→C', 'no da precedencia']) assert.ok(reading.includes(b), `etiqueta «${b}»`);
  await page.locator('#m0View .m0-marks summary').click();
  const list = await page.locator('#m0View .m0-marks').innerText();
  assert.match(list, /Subrayados \(4\)/);
  assert.match(list, /«desmontar la cocina vieja»: actividad A/);
  assert.match(list, /«2 días»: duración de A: 2/);
  assert.match(list, /«Con la cocina vacía»: da A → B y A → C/);
  assert.match(list, /no da precedencia/);
  // La matriz: título, cabeceras y cada casilla con su nombre; las mismas precedencias que la lista.
  const fromList = Object.fromEntries(await Promise.all(COCINA.map(async (r) => [r.id, await (await listLinks(page, r.id)).inputValue()])));
  await m0Seg(page, 1).click();
  assert.match(await page.locator('#m0View .pm caption').innerText(), /Fila: actividad · columna: su predecesora/);
  assert.equal(await page.locator('#m0View .pm thead th').count(), COCINA.length + 1);
  const checked = await page.locator('#m0View [data-cell]:checked').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')));
  const want = Object.entries(fromList).flatMap(([a, l]) => (l ? l.split(/,\s*/).map((p) => `${p} → ${a}`) : []));
  assert.deepEqual(checked.sort(), want.sort());
  await close(page);
});

check('F2c AC3 · lista ⇔ matriz: marcar en la matriz escribe en la lista y al revés, también con posteriores', async () => {
  const page = await m0Lab({ t: [R('A', 3), R('B', 1), R('D', 7)] });
  await (await listLinks(page, 'D')).fill('A');
  await m0Seg(page, 1).click();
  assert.ok(await cell(page, 'A>D').isChecked());
  await cell(page, 'B>D').check();
  await cell(page, 'A>D').uncheck();
  await m0Seg(page, 0).click();
  assert.equal(await (await listLinks(page, 'D')).inputValue(), 'B');
  // Con posteriores, la matriz cambia la fila de la precedente.
  await page.locator('#m0View input[name="pnlModeM0"][value="succ"]').check();
  await page.waitForFunction(() => PNL.app.state().mode === 'succ');
  assert.equal(await (await listLinks(page, 'B')).inputValue(), 'D');
  await m0Seg(page, 1).click();
  await cell(page, 'A>B').check();
  await m0Seg(page, 0).click();
  assert.equal(await (await listLinks(page, 'A')).inputValue(), 'B');
  assert.deepEqual((await page.evaluate(() => PNL.app.model().project.preds)), { A: [], B: ['A'], D: ['B'] });
  await close(page);
});

check('F2c AC18 · solo con el teclado: subrayar tres actividades, marcar A → D en la matriz y comprobar, con el foco siempre a la vista', async () => {
  const page = await m0Lab();
  const fr = await fragsOf(page, 'ej5', 'es');
  const focusOk = () => page.evaluate(() => { const cs = getComputedStyle(document.activeElement); return document.activeElement !== document.body && cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) >= 2; });
  await page.locator('#m0Ul').focus();
  await page.keyboard.press('Enter');
  let at = 0;
  for (const id of ['A', 'B', 'D']) {
    const f = fr[`a${id}`];
    const to = f.from - 1;
    for (let i = 0; i < Math.abs(to - at); i++) await page.keyboard.press(to > at ? 'ArrowRight' : 'ArrowLeft');
    assert.equal(await page.evaluate(() => document.activeElement.getAttribute('data-i')), String(to));
    assert.ok(await focusOk(), 'foco visible en el texto');
    for (let i = to; i < f.to; i++) await page.keyboard.press('Shift+ArrowRight');
    await page.keyboard.press('Enter');
    await m0Panel(page).waitFor({ state: 'visible' });
    for (let i = 0; i < 8 && (await page.evaluate(() => document.activeElement.id)) !== 'm0PanelOk'; i++) await page.keyboard.press('Tab');
    assert.ok(await focusOk(), 'foco visible en el panel');
    await page.keyboard.press('Enter');
    await m0Panel(page).waitFor({ state: 'hidden' });
    at = f.to;
  }
  assert.deepEqual((await m0st(page)).rows.map((r) => r.id), ['A', 'B', 'D']);
  // A la matriz y, con las flechas, de la primera casilla (B → A) a A → D.
  for (let i = 0; i < 60 && (await page.evaluate(() => document.activeElement.textContent)) !== 'Matriz'; i++) await page.keyboard.press('Shift+Tab');
  assert.equal(await page.evaluate(() => document.activeElement.textContent), 'Matriz');
  await page.keyboard.press('Enter');
  for (let i = 0; i < 30 && !(await page.evaluate(() => document.activeElement.hasAttribute('data-cell'))); i++) await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(() => document.activeElement.getAttribute('data-cell')), 'B>A');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowLeft');
  assert.equal(await page.evaluate(() => document.activeElement.getAttribute('data-cell')), 'A>D');
  assert.ok(await focusOk(), 'foco visible en la matriz');
  await page.keyboard.press('Space');
  await page.waitForFunction(() => PNL.app.model().project && PNL.app.model().project.preds.D.join() === 'A');
  for (let i = 0; i < 60 && (await page.evaluate(() => document.activeElement.id)) !== 'm0Check'; i++) await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Enter');
  await page.locator('#m0DiagLine').waitFor();
  assert.equal(await page.evaluate(() => document.activeElement.id), 'm0DiagLine', 'el foco va al resultado');
  assert.ok((await m0st(page)).diag.items.length > 0);
  await close(page);
});

check('F2c AC18 · solo con pulsaciones, sin arrastrar: subrayar en una pantalla táctil y marcar en la matriz', async () => {
  const ctx = await browser.newContext({ viewport: { width: 360, height: 740 }, hasTouch: true, isMobile: true, locale: 'es-ES', reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`táctil: ${e.message}`));
  await page.goto(`${BASE}/${m0Url({})}`);
  await page.waitForFunction(() => window.PNL && PNL.m0 && PNL.m0.state && PNL.m0.state().st);
  const fr = await fragsOf(page, 'ej5', 'es');
  await page.locator('#m0Ul').tap();
  for (const id of ['A', 'D']) await underline(page, fr[`a${id}`].from - 1, fr[`a${id}`].to, { tap: true, kind: 'activity' });
  for (const id of ['A', 'D']) await underline(page, fr[`d${id}`].from, fr[`d${id}`].to, { tap: true, kind: 'duration' });
  await m0Seg(page, 1).tap();
  await cell(page, 'A>D').tap();
  await page.waitForFunction(() => PNL.app.model().project && PNL.app.model().project.preds.D.join() === 'A');
  assert.deepEqual((await m0st(page)).rows.map((r) => [r.id, r.duration]), [['A', '3'], ['D', '7']]);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= 360), 'sin desplazamiento horizontal');
  await shot(page, 'f2c-ej5-es-360-pulsaciones', true);
  await ctx.close();
});

check('F2c AC17 · cambio de idioma: el texto y los subrayados pasan al otro idioma, se avisa del que se quita y la tabla no cambia', async () => {
  const probe = await m0Lab();
  const fr = await fragsOf(probe, 'ej5', 'es');
  await close(probe);
  const rows = [R('A', 3), R('D', 7, 'A')];
  const page = await m0Lab({ t: rows, mk: [{ from: 0, to: 1, kind: 'none' }, markOf({ from: fr.aA.from - 1, to: fr.aA.to }, 'activity', { act: 'A' }), markOf(fr.dD, 'duration', { act: 'D', value: 7 })] });
  await setCtl(page, '#selLang', 'en');
  await page.waitForFunction(() => PNL.app.state().lang === 'en');
  const en = await fragsOf(page, 'ej5', 'en');
  const s = await m0st(page);
  assert.deepEqual(s.rows, rows, 'la tabla no cambia');
  assert.equal(s.marks.length, 2);
  assert.ok(s.marks[0].from <= en.aA.to && s.marks[0].to >= en.aA.from && s.marks[0].act === 'A', JSON.stringify(s.marks[0]));
  assert.ok(s.marks[1].from <= en.dD.to && s.marks[1].to >= en.dD.from && s.marks[1].value === 7);
  const text = await page.locator('#m0View').innerText();
  assert.match(text, /1 underline .*removed|removed 1 underline/i, 'aviso del subrayado quitado');
  assert.match(text, /Supply of materials|materials/i);
  // Ninguna cadena del español en la vista en inglés, ni al revés.
  const foreign = await foreignPieces(page);
  for (const [lang, other] of [['en', 'es'], ['es', 'en']]) {
    await setCtl(page, '#selLang', lang);
    for (const tv of [0, 1]) {
      await m0Seg(page, tv).click();
      const text = await corpusOf(page);
      const left = foreign[other].filter((x) => foundIn(text, x));
      assert.deepEqual(left, [], `${lang}, ${tv ? 'matriz' : 'lista'}`);
    }
  }
  await close(page);
});

check('F2c AC10 · ruta paso a paso del Ej. 5 sin predicción: cada paso resalta su fragmento y llena la tabla; al final, la depurada abre M1', async () => {
  for (const lang of ['es', 'en']) {
    const page = await m0Lab({ mm: 'route', lang });
    const n = await page.evaluate(() => PNL.app.model().route.length);
    assert.equal(n, 24);
    for (let k = 0; k < n; k++) {
      assert.equal((await state(page)).step, k);
      const head = (await page.locator('#m0StepHead').innerText()).trim();
      assert.ok(head.length > 0, `paso ${k}: sin título`);
      const rowsN = await page.locator('#m0View .m0-rtable tbody tr').count();
      assert.equal(rowsN, Math.min(k, 11), `paso ${k}: filas de la tabla`);
      if (k > 0 && k < n - 1) assert.equal(await page.locator('#m0View .st-text .hl').count(), 1, `paso ${k}: fragmento resaltado`);
      const box = await page.evaluate(() => ({ y: window.scrollY, player: document.querySelector('#m0View .m0-player').getBoundingClientRect().bottom, w: document.documentElement.scrollWidth }));
      assert.ok(box.y === 0 && box.player <= 720 && box.w <= 1280, `paso ${k}: el reproductor no cabe en 1280×720 (${JSON.stringify(box)})`);
      if (lang === 'es' && [0, 4, 12, n - 1].includes(k)) await shot(page, `f2c-ruta-es-1280-${String(k).padStart(2, '0')}`);
      if (k < n - 1) await page.keyboard.press('ArrowRight');
    }
    assert.match(await page.locator('#m0RTableHead').innerText(), lang === 'es' ? /Tabla final, sin redundancias/ : /./);
    await page.locator('#m0View .m0-table:not([hidden]) .m0-open button').first().click();
    await page.waitForFunction(() => PNL.app.state().v === 'route' && PNL.app.state().graph === 'aon');
    assert.equal(await page.evaluate(() => PNL.app.model().solution.duration), 17);
    await page.goBack();
    await page.waitForFunction(() => PNL.app.state().v === 'm0' && PNL.app.state().mm === 'route');
    assert.equal((await state(page)).step, n - 1);
    await close(page);
  }
});

check('F2c AC10 · ruta con predicción: nada se adelanta; una respuesta incompleta dice qué falta; las frases de dependencia se responden con todas las actividades', async () => {
  const page = await m0Lab({ mm: 'route', pred: 1 });
  await go(page, 4);                       // «Fabricar el componente Y» = D: da A → D y B → D
  const next = page.locator('#m0View .m0-player .player-buttons button').nth(3);
  assert.ok(await next.isDisabled(), '→ espera a comprobar');
  const boxes = page.locator('#m0View .m0-predict input[type="checkbox"]');
  assert.deepEqual(await page.locator('#m0View .m0-predict label').allInnerTexts(), ['A → D', 'B → D', 'C → D', 'Ninguna', 'Redundante con las que ya hay']);
  assert.doesNotMatch(await page.locator('#m0View .m0-rtable').innerText(), /\bD\b/, 'la tabla no adelanta la fila de D');
  await boxes.nth(0).check();
  await page.locator('#m0PredCheck').click();
  assert.match(await page.locator('#m0View .m0-predict').innerText(), /✗ falta/);
  await boxes.nth(1).check();
  await page.locator('#m0PredCheck').click();
  assert.match(await page.locator('#m0View .m0-predict').innerText(), /✓/);
  assert.ok(await next.isEnabled());
  await next.click();
  assert.equal((await state(page)).step, 5);
  await close(page);
  // Ej. 2: la primera frase llega con la tabla vacía y nombra A, D y E; la cocina nombra B y C antes de presentarlas.
  for (const [st, k, edges, lang] of [['ej2', 1, [['A', 'D'], ['A', 'E']], 'es'], ['cocina', 3, [['A', 'B'], ['A', 'C']], 'es'], ['ej2', 1, [['A', 'D'], ['A', 'E']], 'en']]) {
    const p = await m0Lab({ st, mm: 'route', pred: 1, lang });
    await go(p, k);
    const sels = p.locator('#m0View .m0-predict select');
    const opts = await sels.first().locator('option').allInnerTexts();
    assert.ok(opts.length >= 8 && opts.includes(st === 'cocina' ? 'B · Instalación eléctrica' : 'D'), `${st}: ${opts}`);
    for (const [a, b] of edges) {
      await sels.nth(0).selectOption(a);
      await sels.nth(1).selectOption(b);
      await p.locator('#m0View [data-fk="rt-add"]').click();
    }
    await p.locator('#m0PredCheck').click();
    assert.match(await p.locator('#m0View .m0-predict').innerText(), /✓/, `${st} (${lang}), paso ${k}`);
    assert.ok(await p.locator('#m0View .m0-player .player-buttons button').nth(3).isEnabled());
    if (st === 'cocina') await shot(p, 'f2c-ruta-cocina-es-prediccion-frase');
    await close(p);
  }
});

check('F2c AC16 · la URL guarda el enunciado, la tabla, los subrayados, la vista y el modo, y otro navegador abre lo mismo', async () => {
  const page = await m0Lab({ st: 'cocina' });
  const fr = await fragsOf(page, 'cocina', 'es');
  await underline(page, fr.aA.from, fr.aA.to, { fill: (p) => p.locator('input:not([type])').first().fill('A') });
  await underline(page, fr.dA.from, fr.dA.to);
  await m0Seg(page, 1).click();
  const url = page.url();
  assert.match(url, /v=m0/);
  assert.match(url, /st=cocina/);
  assert.match(url, /tv=matrix/);
  const before = await m0st(page);
  const other = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const p2 = await other.newPage();
  await p2.goto(url);
  await p2.waitForFunction(() => window.PNL && PNL.m0 && PNL.m0.state && PNL.m0.state().st === 'cocina');
  const after = await m0st(p2);
  assert.deepEqual([after.rows, after.marks], [before.rows, before.marks]);
  assert.equal((await state(p2)).tv, 'matrix');
  await other.close();
  // Un enlace solo con v=m0 abre Electrona; los enunciados nuevos siguen ocultos fuera de la lista hasta publicar.
  const bare = await lab('v=m0');
  await bare.waitForFunction(() => PNL.m0.state && PNL.m0.state().st === 'ej5');
  await close(bare);
  const route = await m0Lab({ st: 'mudanza', mm: 'route', step: 5 });
  assert.equal((await state(route)).step, 5);
  assert.equal((await state(route)).mm, 'route');
  await close(route);
  await close(page);
});

check('F2c AC19 · a 1280×720 el texto y la tabla se ven a la vez; a 360 px nada desborda la página en practicar, la matriz, el panel ni la ruta', async () => {
  const wide = await m0Lab({ t: COCINA, st: 'cocina' });
  const b = await wide.evaluate(() => { const r = (s) => document.querySelector(s).getBoundingClientRect(); return { text: r('#m0View .m0-text'), table: r('#m0View .m0-table'), w: document.documentElement.scrollWidth }; });
  assert.ok(b.text.top < 720 && b.table.top < 720 && b.table.left >= b.text.right - 1 && b.w <= 1280, JSON.stringify(b));
  await close(wide);
  for (const lang of ['es', 'en']) {
    for (const s of [{}, { t: COCINA, st: 'cocina', tv: 'matrix' }, { t: COCINA, st: 'cocina' }, { mm: 'route', step: 6 }, { mm: 'route', step: 6, pred: 1, st: 'cocina' }]) {
      const page = await m0Lab(Object.assign({ lang }, s), { width: 360, height: 740 });
      assert.ok(await noHScroll(page), `${lang} ${JSON.stringify(s)}`);
      if (!s.mm && !s.tv && s.t) {
        await page.locator('#m0Ul').click();
        await word(page, 2).click();
        await word(page, 4).click();
        await m0Panel(page).waitFor({ state: 'visible' });
        assert.ok(await noHScroll(page), `${lang}: con el panel abierto`);
        if (lang === 'es') await shot(page, 'f2c-cocina-es-360-panel', true);
      }
      await close(page);
    }
  }
});

check('F2c AC18 · axe sin violaciones en M0 (practicar, subrayar, panel, matriz, validación, corrección y ruta), en claro y oscuro, y la ruta a 360 px con el teclado', async () => {
  const probe = await m0Lab({ st: 'congreso' });
  const fc = await fragsOf(probe, 'congreso', 'es');
  await close(probe);
  const cyc = { st: 'congreso', t: CONGRESO.map((r) => (r.id === 'A' ? R('A', '', 'B') : r)), mk: [markOf(fc.p1, 'precedence', { gives: [['B', 'A']] })] };
  const red = { st: 'cocina', t: COCINA.map((r) => (r.id === 'G' ? R('G', 1, 'F, D') : r)) };
  for (const scheme of ['light', 'dark']) {
    for (const lang of ['es', 'en']) {
      for (const [name, s, act] of [['vacía', {}, null], ['subrayar con panel', { st: 'cocina', t: COCINA }, 'panel'], ['matriz con redundancia', Object.assign({ tv: 'matrix' }, red), null],
        ['lista con ciclo', cyc, null], ['corrección', { st: 'cocina', t: COCINA.slice(0, 7) }, 'check'], ['ruta', { mm: 'route', step: 4 }, null],
        ['ruta con predicción', { mm: 'route', step: 3, pred: 1, st: 'cocina' }, null], ['ruta, tabla final', { mm: 'route', step: 23 }, null]]) {
        const page = await m0Lab(Object.assign({ lang }, s), { scheme });
        if (act === 'panel') { await page.locator('#m0Ul').click(); await word(page, 13).click(); await word(page, 16).click(); await m0Panel(page).waitFor({ state: 'visible' }); }
        if (act === 'check') await m0Check(page);
        await axe(page, `M0 · ${name} (${lang}, ${scheme})`);
        await close(page);
      }
    }
  }
  // T025: a 360 px la tabla de la ruta se desplaza dentro de su caja, que tiene que alcanzarse con el teclado; con el
  // foco en ella, las flechas la desplazan y no cambian de paso. (La tabla del Ej. 5 en inglés sobresale solo unos
  // píxeles; la de la cocina en el paso 20, unos 60.)
  for (const lang of ['es', 'en']) {
    for (const [name, s] of [['ruta a 360 px', { mm: 'route', step: 4 }], ['ruta con predicción a 360 px', { mm: 'route', step: 4, pred: 1 }],
      ['ruta de la cocina a 360 px', { mm: 'route', step: 20, st: 'cocina' }]]) {
      const page = await m0Lab(Object.assign({ lang }, s), { width: 360, height: 740 });
      await axe(page, `M0 · ${name} (${lang}, light)`);
      const box = page.locator('section[aria-labelledby="m0RTableHead"] > .scroll-box');
      assert.equal(await box.getAttribute('tabindex'), '0', `${name} (${lang}): la caja de la tabla se alcanza con el teclado`);
      await box.focus();
      await page.keyboard.press('ArrowRight');
      await page.waitForTimeout(100);
      assert.equal((await state(page)).step, s.step, `${name} (${lang}): las flechas en la caja no cambian de paso`);
      if (s.st === 'cocina' && lang === 'es') {
        assert.ok(await box.evaluate((b) => b.scrollWidth - b.clientWidth > 30), 'la tabla de la cocina se desplaza dentro de su caja');
        assert.ok(await box.evaluate((b) => b.scrollLeft > 0), 'las flechas desplazan la tabla');
      }
      await close(page);
    }
  }
});

// ---------- F2c, T020: publicación del hito 1 (pestaña, portada, taller y enunciados nuevos) ----------

check('F2c T020 · P10: la pestaña «Del enunciado a la tabla» va la primera de la barra y abre practicar; las demás siguen igual', async () => {
  for (const [lang, label] of [['es', 'Del enunciado a la tabla'], ['en', 'From statement to table']]) {
    const page = await lab(`v=route&ex=ej6&step=3&lang=${lang}`);
    const tabs = await page.locator('header nav a:visible').allInnerTexts();
    assert.deepEqual(tabs.map((x) => x.trim())[0], label);
    assert.equal(tabs.length, 5, 'con «Duraciones inciertas» (F4a, T013)');
    assert.equal(await page.locator('#navM0').getAttribute('aria-current'), 'false');
    await page.locator('#navM0').click();
    await page.waitForFunction(() => PNL.app.state().v === 'm0' && PNL.m0.state().st);
    const s = await state(page);
    assert.deepEqual([s.st, s.mm, s.t, s.lang], ['ej5', 'practice', null, lang]);
    assert.equal(await page.locator('#navM0').getAttribute('aria-current'), 'page');
    assert.equal(await page.locator('#navRoute').getAttribute('aria-current'), 'false');
    assert.match(await page.locator('#navM0').getAttribute('href'), /^#v=m0/);
    // «Atrás» vuelve a la ruta donde estaba.
    await page.goBack();
    await page.waitForFunction(() => PNL.app.state().v === 'route' && PNL.app.state().step === 3);
    // Desde M0, la ruta guiada y el taller.
    await page.goForward();
    await page.waitForFunction(() => PNL.app.state().v === 'm0');
    await page.locator('#navRoute').click();
    await page.waitForFunction(() => PNL.app.state().v === 'route');
    await page.locator('#navM0').click();
    await page.waitForFunction(() => PNL.app.state().v === 'm0');
    await page.locator('#navWork').click();
    await page.waitForFunction(() => PNL.app.state().v === 'work');
    await close(page);
  }
});

check('F2c T020 · AC20: la tarjeta M0 de la portada está disponible y abre practicar en el idioma elegido', async () => {
  const noJs = await open('index.html', { js: false });
  assert.equal(await noJs.locator('a[data-lab="m0"]').getAttribute('href'), 'cpm.html#v=m0&st=ej5&lang=es');
  await close(noJs);
  const portal = await open('index.html?lang=en');
  const card = portal.locator('article.module-card').filter({ has: portal.locator('.card-num', { hasText: 'M0' }) });
  assert.match(await card.innerText(), /Practise with a statement[\s\S]*Available/);
  await card.locator('a[data-lab="m0"]').click();
  await portal.waitForFunction(() => window.PNL && PNL.m0 && PNL.m0.state && PNL.m0.state() && PNL.m0.state().st === 'ej5');
  assert.equal((await state(portal)).lang, 'en');
  await close(portal);
  for (const [scheme, width] of [['light', 1280], ['dark', 360]]) {
    const home = await open('index.html?lang=es', { scheme, width, height: 800 });
    assert.ok(await noHScroll(home), `portada a ${width} px`);
    await axe(home, `portada con M0 disponible (${scheme}, ${width} px)`);
    await home.locator('a[data-lab="m0"]').scrollIntoViewIfNeeded();
    await shot(home, `f2c-portada-m0-${scheme}-${width}`);
    await close(home);
  }
});

check('F2c T020 · el taller lleva a practicar desde un enunciado y «Atrás» devuelve su tabla', async () => {
  for (const [lang, label] of [['es', 'Practicar desde un enunciado (M0)'], ['en', 'Practise from a statement (M0)']]) {
    const page = await workshop([R('A', 2), R('B', 3, 'A')], { lang });
    const btn = page.locator('#workshop .work-tools button', { hasText: label });
    assert.equal(await btn.count(), 1);
    await btn.click();
    await page.waitForFunction(() => PNL.app.state().v === 'm0' && PNL.m0.state().st);
    assert.deepEqual((await m0st(page)).rows, [], 'practicar empieza con su propia tabla vacía');
    await page.goBack();
    await page.waitForFunction(() => PNL.app.state().v === 'work');
    assert.deepEqual((await state(page)).t.map((r) => r.id), ['A', 'B']);
    if (lang === 'es') await shot(page, 'f2c-taller-entrada-m0');
    await close(page);
  }
});

check('F2c T020 · AC11: los once enunciados están en el selector, y los nuevos se practican y corrigen como los de los apuntes', async () => {
  for (const lang of ['es', 'en']) {
    const page = await m0Lab({ lang });
    const opts = await page.locator('#m0St option').allInnerTexts();
    // F3c (T013): tras los once, «Enunciado al azar».
    assert.equal(opts.length, 12);
    assert.equal(opts[11], lang === 'es' ? 'Enunciado al azar' : 'Random statement');
    assert.ok(opts.includes(lang === 'es' ? 'Reforma de la cocina' : 'Kitchen refit'), opts.join(' | '));
    await page.selectOption('#m0St', 'lanzamiento');
    await page.waitForFunction(() => PNL.m0.state().st === 'lanzamiento');
    const ref = await page.evaluate(() => PNL.statements.get('lanzamiento').ref.rows.map((r) => ({ id: r.id, name: '', duration: String(r.duration == null ? '' : r.duration), links: r.links })));
    await page.evaluate((h) => { location.hash = h; }, U0.encode(Object.assign(U0.defaults(), { v: 'm0', st: 'lanzamiento', lang, t: ref })));
    await page.waitForFunction((n) => PNL.m0.state().rows.length === n, ref.length);
    assert.equal((await m0Check(page)).ok, true);
    await close(page);
  }
  for (const [width, lang] of [[360, 'es'], [360, 'en'], [1280, 'es']]) {
    for (const url of [`cpm.html#v=m0&st=ej5&lang=${lang}`, `cpm.html#v=route&ex=ej6&step=0&lang=${lang}`, `cpm.html#v=work&lang=${lang}`]) {
      const page = await open(url, { width, height: 740 });
      assert.ok(await noHScroll(page), `${url} a ${width} px: la barra con tres pestañas no desborda`);
      await close(page);
    }
  }
});

// ---------- F2c, hito 2: el enunciado propio del docente (T023) ----------

const S0 = require(path.join(ROOT, 'js', 'core', 'statement.js'));
const OWN_TEXT = {
  es: 'Para la feria de ciencias hay que reservar el aula, preparar los carteles y montar los experimentos. Los carteles se preparan después de reservar el aula. '
    + 'Montar los experimentos requiere los carteles hechos. Al final, alguien tiene que recoger el aula.',
  en: 'For the science fair we have to book the room, make the posters and set up the experiments. The posters are made after booking the room. '
    + 'Setting up the experiments needs the posters made. Finally, someone has to tidy the room.',
};
const OWN_PH = {
  es: { acts: ['reservar el aula', 'preparar los carteles', 'montar los experimentos', 'recoger el aula'], dep: 'Los carteles se preparan después de reservar el aula' },
  en: { acts: ['book the room', 'make the posters', 'set up the experiments', 'tidy the room'], dep: 'The posters are made after booking the room' },
};
// Rango de palabras de una frase en un texto (la primera aparición).
function wordsAt(text, phrase) {
  const w = S0.tokenize(text).words;
  const ph = S0.tokenize(phrase).words.map((x) => x.t);
  const i = w.findIndex((_, k) => ph.every((q, j) => w[k + j] && w[k + j].t === q));
  assert.ok(i >= 0, `«${phrase}» no está en el texto`);
  return { from: i, to: i + ph.length - 1 };
}
const OWN_ROWS = (lang) => [R('A', '', ''), R('B', '', 'A'), R('C', '', 'B'), R('D', '', 'C')].map((r, k) => Object.assign(r, { name: `${lang}-${k}` }));
const ownPrep = (lang, extra) => Object.assign({ st: 'own', mm: 'prepare', lang, own: { lang, text: OWN_TEXT[lang], frags: [], ref: null } }, extra || {});
const shareState = (page) => page.evaluate(() => ({ student: !document.getElementById('m0CopyStudent').disabled, solution: !document.getElementById('m0CopySolution').disabled,
  text: document.querySelector('#m0View .m0-share').innerText }));
// Copia un enlace de «Compartir» y lo devuelve relativo al servidor (el campo de solo lectura lo muestra siempre).
async function copyLink(page, which) {
  await page.locator(which === 'student' ? '#m0CopyStudent' : '#m0CopySolution').click();
  // El campo puede venir del enlace anterior: se espera al de este botón (el de la solución lleva sol=1).
  await page.waitForFunction((sol) => { const l = document.getElementById('m0Link'); const st = document.getElementById('m0CopyStatus');
    return l && st && st.textContent.length > 0 && /[&#]sol=1/.test(l.value) === sol; }, which === 'solution');
  const url = await page.locator('#m0Link').inputValue();
  assert.ok(url.startsWith(`${BASE}/cpm.html#`), url);
  return url.slice(BASE.length + 1);
}
const focusVisible = (page) => page.evaluate(() => { const cs = getComputedStyle(document.activeElement); return document.activeElement !== document.body && cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) >= 2; });

for (const lang of ['es', 'en']) {
  check(`F2c AC13 · enunciado propio en ${lang.toUpperCase()}: preparar (texto, subrayado y tabla), compartir y resolver en otro navegador; el enlace con la solución lo abre resuelto`, async () => {
    const es = lang === 'es';
    const text = OWN_TEXT[lang];
    const page = await open(`cpm.html#v=m0&st=own&mm=prepare&lang=${lang}`);
    await page.waitForFunction(() => PNL.m0.state && PNL.m0.state().st === 'own');
    assert.ok(await page.locator('#m0Draft').isVisible(), 'empieza con el cuadro de texto');
    assert.equal((await shareState(page)).student, false, 'sin texto no hay enlace');
    await page.locator('#m0Draft').fill(text);
    assert.match(await page.locator('#m0DraftCount').innerText(), new RegExp(`^${text.length} / 3000`));
    await page.selectOption('#m0DraftLang', lang);
    await page.locator('#m0UseText').click();
    await page.locator('#m0View .st-text').waitFor();
    assert.equal((await state(page)).own.text, text);
    // Subrayar las cuatro actividades (la propuesta da A, B, C y D) y escribir la tabla del docente.
    for (const ph of OWN_PH[lang].acts) { const r = wordsAt(text, ph); await underline(page, r.from, r.to, { kind: 'activity' }); }
    assert.deepEqual((await m0st(page)).rows.map((r) => r.id), ['A', 'B', 'C', 'D']);
    for (const [id, l] of [['B', 'A'], ['C', 'B'], ['D', 'C']]) await (await listLinks(page, id)).fill(l);
    await page.waitForFunction(() => PNL.app.model().project && PNL.app.model().project.preds.D.join() === 'C');
    // La frase de dependencia enlazada a A → B, que ya está en la tabla.
    const dep = wordsAt(text, OWN_PH[lang].dep);
    await underline(page, dep.from, dep.to, { fill: async (panel) => {
      await panel.locator('input[name="m0Kind"][value="precedence"]').check();
      await panel.locator('.m0-edges label', { hasText: 'A → B' }).locator('input').check();
    } });
    const prep = await state(page);
    assert.equal(prep.mk.length, 5);
    assert.match(await page.locator('#m0TableHead').innerText(), es ? /Tabla de referencia \(la solución\)/ : /Reference table \(the solution\)/);
    const sh = await shareState(page);
    assert.ok(sh.student && sh.solution, sh.text);
    assert.match(sh.text, es ? /B → C no sale de ninguna frase subrayada/ : /B → C does not come from any underlined phrase/);
    assert.match(sh.text, es ? /no es un modo examen/ : /not an exam mode/);
    await shot(page, `f2c-propio-${lang}-preparar`);
    const student = await copyLink(page, 'student');
    const solution = await copyLink(page, 'solution');
    // La URL guarda la preparación: al recargar sigue todo.
    await page.reload();
    await page.waitForFunction(() => PNL.m0.state && PNL.m0.state().st === 'own');
    const again = await state(page);
    assert.deepEqual([again.mm, again.own, again.t, again.mk], [prep.mm, prep.own, prep.t, prep.mk]);
    if (es) {
      // La interfaz cambia de idioma y el enunciado propio sigue en el suyo, con sus subrayados.
      await setCtl(page, '#selLang', 'en');
      await page.waitForFunction(() => PNL.app.state().lang === 'en');
      const s = await state(page);
      assert.deepEqual([s.own.lang, s.mk], ['es', prep.mk]);
      assert.equal(await page.locator('#m0View .m0-text .banner').isVisible(), false, 'no se quita ningún subrayado');
    }
    // «Practicar» prueba el ejercicio como el alumno; «Atrás» vuelve a preparar.
    await page.locator('#m0Practice').click();
    await page.waitForFunction(() => PNL.app.state().mm === 'practice');
    assert.deepEqual((await m0st(page)).rows, []);
    await page.goBack();
    await page.waitForFunction(() => PNL.app.state().mm === 'prepare');
    assert.deepEqual((await state(page)).t, prep.t);
    await close(page);

    // El alumno, en otro navegador (con el idioma contrario): el texto, la tabla vacía y nada de la solución.
    const other = lang === 'es' ? 'en-US' : 'es-ES';
    const st = await open(student, { locale: other });
    await st.waitForFunction(() => PNL.m0.state && PNL.m0.state().st === 'own');
    const s0 = await state(st);
    assert.deepEqual([s0.mm, s0.lang, s0.t, s0.mk, s0.sol], ['practice', lang, null, null, 0]);
    assert.equal(await st.locator('#m0St').inputValue(), 'own');
    assert.equal((await st.locator('#m0View .st-text').innerText()).replace(/\s+/g, ' ').trim(), text);
    const body = await st.locator('#m0View').innerText();
    assert.ok(!body.includes(`${lang}-0`) && !body.includes(`${lang}-3`), 'los nombres de la tabla del docente no se ven');
    assert.ok(await st.locator('#m0View .m0-diag').isHidden());
    assert.ok(await st.locator('#m0View .m0-share').isHidden());
    assert.ok(await st.locator('#m0Check').isEnabled(), 'se puede comprobar');
    await shot(st, `f2c-propio-${lang}-alumno`);
    // Resuelve: con una precedencia de menos, un error; con la tabla del docente, correcta.
    const solve = (rows) => st.evaluate((h) => { location.hash = h; }, U0.encode(Object.assign({}, s0, { t: rows })));
    await solve(OWN_ROWS(lang).map((r) => (r.id === 'C' ? Object.assign({}, r, { links: '' }) : r)));
    await st.waitForFunction(() => PNL.m0.state().rows.length === 4);
    const bad = await m0Check(st);
    assert.deepEqual(bad.items.map((i) => i.code), ['missingPrecedence']);
    await solve(OWN_ROWS(lang));
    await st.waitForFunction(() => PNL.m0.state().rows[2].links === 'B');
    assert.equal((await m0Check(st)).ok, true);
    // La ruta paso a paso recorre los cinco subrayados del docente.
    await st.locator('#m0Route').click();
    await st.waitForFunction(() => PNL.app.state().mm === 'route');
    assert.equal(await st.evaluate(() => PNL.app.model().route.filter((x) => x.kind === 'm0Frag').length), 5);
    await close(st);

    // Con la solución: el ejercicio resuelto (tabla y subrayados del docente) y correcto al comprobar.
    const so = await open(solution, { locale: other });
    await so.waitForFunction(() => PNL.m0.state && PNL.m0.state().rows.length === 4);
    const s1 = await state(so);
    assert.equal(s1.sol, 0);
    assert.deepEqual(s1.t.map((r) => [r.id, r.links]), prep.t.map((r) => [r.id, r.links]));
    assert.equal(s1.mk.length, 5);
    assert.equal((await m0Check(so)).ok, true);
    await close(so);
  });
}

check('F2c AC14 · con un ciclo en la tabla del docente no se puede compartir hasta romperlo; las redundancias solo avisan', async () => {
  for (const lang of ['es', 'en']) {
    const es = lang === 'es';
    const cyc = OWN_ROWS(lang).map((r) => (r.id === 'A' ? Object.assign({}, r, { links: 'D' }) : r));
    const page = await m0Lab(ownPrep(lang, { t: cyc }));
    let sh = await shareState(page);
    assert.deepEqual([sh.student, sh.solution], [false, false]);
    assert.match(sh.text, es ? /Ciclo en la tabla: A → B → C → D → A\. Rómpelo/ : /Cycle in the table: A → B → C → D → A\. Break it/);
    await shot(page, `f2c-propio-${lang}-ciclo`);
    await (await listLinks(page, 'A')).fill('');
    await page.waitForFunction(() => !document.getElementById('m0CopyStudent').disabled);
    sh = await shareState(page);
    assert.ok(sh.student && sh.solution);
    // Una redundancia (C después de A y de B): aviso con su camino, y los dos enlaces.
    await (await listLinks(page, 'C')).fill('A, B');
    await page.waitForFunction(() => /A → C/.test(document.querySelector('#m0View .m0-share').innerText));
    sh = await shareState(page);
    assert.ok(sh.student && sh.solution);
    assert.match(sh.text, es ? /A → C es redundante \(A → B → C\)/ : /A → C is redundant \(A → B → C\)/);
    await close(page);
  }
});

check('F2c AC13 · el texto malicioso se ve y se comparte como texto: sin etiquetas, sin scripts y sin diálogos', async () => {
  const evil = 'A) <img src=x onerror="alert(1)"> pintar. B) <script>alert(\'x\')</script> <a href="javascript:alert(2)">enlace</a> después de A.';
  const page = await open('cpm.html#v=m0&st=own&mm=prepare&lang=es');
  let dialogs = 0;
  page.on('dialog', (d) => { dialogs++; d.dismiss(); });
  await page.waitForFunction(() => PNL.m0.state && PNL.m0.state().st === 'own');
  await page.locator('#m0Draft').fill(evil);
  await page.locator('#m0UseText').click();
  await page.locator('#m0View .st-text').waitFor();
  const shown = (p) => p.locator('#m0View .st-text').innerText();
  assert.equal((await shown(page)).replace(/\s+/g, ' ').trim(), evil);
  const injected = (p) => p.evaluate(() => document.querySelectorAll('#m0View img, #m0View script, #m0View a[href^="javascript"]').length);
  assert.equal(await injected(page), 0);
  await (await page.locator('#m0View .m0-list tbody tr').first().locator('[data-f="id"]')).fill('A');
  await page.waitForFunction(() => !document.getElementById('m0CopyStudent').disabled);
  const link = await copyLink(page, 'student');
  await close(page);
  const st = await open(link);
  st.on('dialog', (d) => { dialogs++; d.dismiss(); });
  await st.waitForFunction(() => PNL.m0.state && PNL.m0.state().st === 'own');
  assert.equal((await shown(st)).replace(/\s+/g, ' ').trim(), evil);
  assert.equal(await injected(st), 0);
  await st.waitForTimeout(200);
  assert.equal(dialogs, 0, 'ningún alert');
  await close(st);
});

check('F2c AC18 · preparar solo con el teclado: escribir el texto, usarlo, volver a editarlo y copiar el enlace, con el foco a la vista', async () => {
  const page = await open('cpm.html#v=m0&st=own&mm=prepare&lang=es');
  await page.waitForFunction(() => PNL.m0.state && PNL.m0.state().st === 'own');
  const active = () => page.evaluate(() => document.activeElement.id || document.activeElement.className);
  const tabTo = async (id, back) => { for (let i = 0; i < 40 && (await page.evaluate(() => document.activeElement.id)) !== id; i++) await page.keyboard.press(back ? 'Shift+Tab' : 'Tab'); assert.equal(await active(), id); };
  await page.locator('#m0Draft').focus();
  await page.keyboard.type('Pintar las paredes y después barrer el suelo.');
  assert.ok(await focusVisible(page), 'foco visible en el cuadro de texto');
  await tabTo('m0DraftLang');
  await tabTo('m0UseText');
  assert.ok(await focusVisible(page), 'foco visible en «Usar este texto»');
  await page.keyboard.press('Enter');
  await page.locator('#m0View .st-text').waitFor();
  assert.equal(await active(), 'm0-textbody', 'el foco va al texto');
  await tabTo('m0EditText');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => document.activeElement.id === 'm0Draft');
  assert.equal(await page.locator('#m0Draft').inputValue(), 'Pintar las paredes y después barrer el suelo.');
  await page.keyboard.press('End');
  await page.keyboard.type(' Al final, recoger.');
  await tabTo('m0UseText');
  await page.keyboard.press('Enter');
  await page.locator('#m0View .st-text').waitFor();
  assert.match((await state(page)).own.text, /recoger\.$/);
  await tabTo('m0CopyStudent');
  assert.ok(await focusVisible(page), 'foco visible en «Copiar enlace para el alumno»');
  await page.keyboard.press('Enter');
  await page.locator('#m0Link').waitFor();
  assert.equal(await active(), 'm0CopyStudent', 'el foco sigue en el botón');
  await close(page);
});

check('F2c AC19 y AC18 · preparar a 1280×720 (texto y tabla a la vez) y a 360 px sin desbordar; axe sin violaciones en claro y oscuro', async () => {
  const page = await open('cpm.html#v=m0&st=own&mm=prepare&lang=es');
  await page.waitForFunction(() => PNL.m0.state && PNL.m0.state().st === 'own');
  for (const sel of ['#m0Draft', '#m0View [aria-labelledby="m0TableHead"]']) {
    const b = await page.locator(sel).boundingBox();
    assert.ok(b && b.y >= 0 && b.y + 40 <= 720, `${sel} a la vista`);
  }
  await close(page);
  const views = (lang) => [
    ['vacío', ownPrep(lang, { own: { lang, text: '', frags: [], ref: null } }), null],
    ['texto, tabla y enlace', ownPrep(lang, { t: OWN_ROWS(lang), mk: [Object.assign(wordsAt(OWN_TEXT[lang], OWN_PH[lang].acts[0]), { kind: 'activity', act: 'A' })] }), 'copy'],
    ['ciclo en la matriz', ownPrep(lang, { tv: 'matrix', t: OWN_ROWS(lang).map((r) => (r.id === 'A' ? Object.assign({}, r, { links: 'D' }) : r)) }), null],
    ['texto demasiado largo', ownPrep(lang), 'long'],
  ];
  for (const width of [360, 1280]) {
    for (const lang of ['es', 'en']) {
      for (const [name, s, act] of views(lang)) {
        for (const scheme of width === 1280 ? ['light', 'dark'] : ['light']) {
          const p = await m0Lab(s, { width, height: 740, scheme });
          if (act === 'copy') await copyLink(p, 'student');
          if (act === 'long') { await p.locator('#m0EditText').click(); await p.locator('#m0Draft').fill('palabra '.repeat(400)); await p.locator('#m0UseText').click(); await p.locator('.m0-prep .m0-err').waitFor(); }
          assert.ok(await noHScroll(p), `${name} (${lang}) a ${width} px no desborda`);
          if (width === 360 && lang === 'es') await shot(p, `f2c-propio-360-${name.replace(/[^a-záéíóúñ]+/gi, '-')}`, true);
          await axe(p, `M0 · preparar · ${name} (${lang}, ${width}, ${scheme})`);
          await close(p);
        }
      }
    }
  }
});

check('F2c T024 · «Preparar un enunciado» está en la barra de M0: abre el cuadro vacío en el idioma de la página, «Atrás» vuelve y «Aprende más» dice que no es un modo examen', async () => {
  for (const lang of ['es', 'en']) {
    const es = lang === 'es';
    const page = await m0Lab({ lang, st: 'cocina', t: COCINA });
    const btn = page.locator('#m0Prepare');
    assert.ok(await btn.isVisible());
    assert.equal(await btn.innerText(), es ? 'Preparar un enunciado' : 'Prepare a statement');
    await btn.click();
    await page.waitForFunction(() => PNL.app.state().mm === 'prepare');
    const s = await state(page);
    assert.deepEqual([s.st, s.own, s.t, s.mk], ['own', { lang, text: '', frags: [], ref: null }, null, null]);
    assert.ok(await page.locator('#m0Draft').isVisible());
    await page.locator('#m0Learn').click();
    await page.locator('#learnDialog').waitFor();
    assert.match(await page.locator('#learnDialog').innerText(), es ? /no es un modo examen/ : /not an exam mode/);
    await page.locator('#btnLearnClose').click();
    await page.goBack();
    await page.waitForFunction(() => PNL.app.state().st === 'cocina');
    assert.equal((await m0st(page)).rows.length, COCINA.length, '«Atrás» devuelve el enunciado y su tabla');
    for (const width of [1280, 360]) {
      await page.setViewportSize({ width, height: 720 });
      assert.ok(await noHScroll(page), `la barra con tres modos no desborda a ${width} px`);
    }
    await close(page);
  }
});

// ---------- F2c, T027: correcciones de la revisión de nivel 2 (ronda 1) ----------

check('F2c T027 · AC10 · con predicción, el título de una frase no delata su tipo hasta comprobar', async () => {
  for (const lang of ['es', 'en']) {
    const page = await m0Lab({ st: 'cocina', mm: 'route', pred: 1, lang });
    await go(page, 8);                     // «… pueden trabajar a la vez»: no da precedencias
    const neutral = await page.evaluate((l) => PNL.i18n.t(l, 'm0Steps.phrase'), lang);
    assert.equal((await page.locator('#m0StepHead').innerText()).trim().toLowerCase(), neutral.toLowerCase());
    assert.doesNotMatch(await page.locator('#m0View').innerText(), lang === 'es' ? /Frase sin precedencia/i : /Phrase with no precedence/i);
    await page.locator('#m0View .m0-predict label', { hasText: lang === 'es' ? 'Ninguna' : 'None' }).locator('input').check();
    await page.locator('#m0PredCheck').click();
    assert.match((await page.locator('#m0StepHead').innerText()).trim(), lang === 'es' ? /Frase sin precedencia/i : /Phrase with no precedence/i);
    await close(page);
  }
});

check('F2c T027 · un subrayado de duración con demasiadas cifras se dice en el panel y no se pierde', async () => {
  const page = await m0Lab({ t: [R('A', '')] });
  const fr = await fragsOf(page, 'ej5', 'es');
  await page.locator('#m0Ul').click();
  await word(page, fr.dA.from).click();
  await word(page, fr.dA.to).click();
  await m0Panel(page).waitFor({ state: 'visible' });
  await m0Panel(page).locator('input[name="m0Kind"][value="duration"]').check();
  const inputs = m0Panel(page).locator('label input:not([type])');
  await inputs.nth(0).fill('A');
  await inputs.nth(1).fill('0,00001');
  await page.locator('#m0PanelOk').click();
  assert.ok(await m0Panel(page).isVisible(), 'el panel sigue abierto');
  assert.match(await m0Panel(page).locator('.m0-err').innerText(), /6 cifras y 4 decimales/);
  assert.equal((await m0st(page)).marks.length, 0);
  await close(page);
});

check('F2c T027 · desde un archivo del equipo, «Copiar» avisa de que el enlace solo se abre en él', async () => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`file://: ${e.message}`));
  await page.goto(require('node:url').pathToFileURL(path.join(ROOT, 'cpm.html')).href + U0.encode(Object.assign(U0.defaults(), { v: 'm0' }, ownPrep('es', { t: OWN_ROWS('es') }))));
  await page.waitForFunction(() => window.PNL && PNL.m0 && PNL.m0.state && PNL.m0.state() && PNL.m0.state().st === 'own');
  await page.locator('#m0CopyStudent').click();
  await page.locator('#m0FileLink').waitFor();
  assert.match(await page.locator('#m0Link').inputValue(), /^file:\/\//);
  assert.match(await page.locator('#m0FileLink').innerText(), /archivo de tu equipo/);
  await ctx.close();
});

check('F2c T027 · en la web, «Copiar» da la página sin su consulta y sin el aviso de archivo del equipo', async () => {
  const page = await open(`cpm.html?lang=en&x=1${U0.encode(Object.assign(U0.defaults(), { v: 'm0' }, ownPrep('es', { t: OWN_ROWS('es') })))}`);
  await page.waitForFunction(() => PNL.m0.state && PNL.m0.state().st === 'own');
  const student = await copyLink(page, 'student');
  assert.ok(!student.includes('?'), student);
  assert.equal(await page.locator('#m0FileLink').count(), 0);
  await close(page);
});

// ---------- F3a: ejercicios generados con semilla y corrección con error consecuente (T016) ----------

const GEN0 = require(path.join(ROOT, 'js', 'core', 'generator.js'));
const P0 = require(path.join(ROOT, 'js', 'core', 'project.js'));
const GR0 = require(path.join(ROOT, 'js', 'core', 'grade.js'));
const I0 = require(path.join(ROOT, 'js', 'i18n.js'));
const LR0 = require(path.join(ROOT, 'js', 'learn.js'));
const ED0 = require(path.join(ROOT, 'js', 'editor.js'));
const X0 = require(path.join(ROOT, 'js', 'ex.js'));
const OR0 = require(path.join(ROOT, 'tests', 'oracle-grade.js'));

// Las semillas de los bocetos (tableros 37–50) y un error temprano en cada una, que arrastra otros.
const EX_CASES = { easy: { sd: 39595, wrong: { 'E.ES': 9 } }, medium: { sd: 14844, wrong: { 'D.ES': 8 } }, hard: { sd: 92846, wrong: { 'D.ES': 13 } } };
const ALL_ASK = ['times', 'events', 'floats', 'sf', 'critical'];
const exState0 = (s) => Object.assign(U0.defaults(), { v: 'ex', ex: null, lang: 'es' }, s);
const exUrl = (s) => `cpm.html${U0.encode(exState0(s))}`;
const exModel = (s) => X0.model(exState0(s), s.lang || 'es');
const askOf = (s) => U0.cleanAsk(s.ask) || U0.DEFAULT_ASK.slice();
// Un alumno que calcula bien salvo en `wrong` y arrastra lo demás (el de los tableros), con lo de `extra` encima.
function exStudent(s, wrong, extra) {
  const m = exModel(s);
  return Object.assign(OR0.answersFrom(OR0.fromProject(m.project), m.sol.net, wrong || {}, askOf(s)), extra || {});
}
async function exLab(s, opts) {
  const page = await open(exUrl(s), opts);
  await page.waitForFunction(() => PNL.ex && PNL.ex.state && PNL.ex.state().seed);
  return page;
}
const exSt = (page) => page.evaluate(() => PNL.ex.state());
const exId = (key) => `exc-${key.replace(/[^A-Za-z0-9]/g, '_')}`;
const exCell = (page, key) => page.locator(`#${exId(key)}`);
// La marca de cada casilla de la tabla a la vista (null sin marca).
const exMarks = (page) => page.evaluate(() => Object.fromEntries([...document.querySelectorAll('#exView [data-key]')]
  .map((i) => [i.dataset.key, (/(?:^| )st-(\w+)/.exec(i.closest('.ex-cell').className) || [])[1] || null])));
const marksOf = (g, view) => Object.fromEntries(Object.entries(g.cells).filter(([k]) => (view === 'events') === /^e\d/.test(k)).map(([k, c]) => [k, c.state]));
const noMarksOf = (g, view) => Object.fromEntries(Object.keys(marksOf(g, view)).map((k) => [k, null]));
const exScore = (page) => page.locator('#exView .ex-score strong').innerText();
const exExplain = (page) => page.locator('#exExplain p').innerText();
const exHash = (s) => U0.encode(exState0(s));
const setHash = (page, hash) => page.evaluate((x) => { location.hash = x; }, hash);
const activeId = (page) => page.evaluate(() => document.activeElement && document.activeElement.id);
async function tabTo(page, id, key = 'Tab', max = 150) {
  for (let i = 0; i < max && (await activeId(page)) !== id; i++) await page.keyboard.press(key);
  assert.equal(await activeId(page), id, `el foco no llega a #${id}`);
}

check('F3a AC1 · la tabla generada en el navegador es la de Node para 3 semillas por nivel, también en la tabla dada', async () => {
  const page = await exLab({ sd: 1, lv: 'easy' });
  for (const lv of ['easy', 'medium', 'hard']) {
    for (const sd of [1, 2, 3]) {
      await setHash(page, exHash({ sd, lv }));
      await page.waitForFunction(([x, l]) => PNL.ex.state().seed === x && PNL.app.state().lv === l, [sd, lv]);
      const g = GEN0.generate(sd, GEN0.LEVELS[lv]);
      assert.ok(g.ok, `${lv} ${sd}`);
      assert.deepEqual((await exSt(page)).rows, g.rows, `${lv}, semilla ${sd}`);
      const p = P0.parse(g.rows, 'pred').project;
      const given = await page.locator('#exView table.ex-given tbody tr').evaluateAll((trs) => trs.map((tr) => [...tr.children].map((c) => c.textContent).join('|')));
      assert.deepEqual(given, p.activities.map((a) => `${a.id}|${a.d}|${p.preds[a.id].join(', ') || '—'}`), `${lv}, semilla ${sd}: tabla dada`);
      assert.equal(await page.locator('#exView table.ex-ans tbody tr').count(), p.activities.length);
    }
  }
  await close(page);
});

for (const lv of ['easy', 'medium', 'hard']) {
  for (const lang of ['es', 'en']) {
    check(`F3a AC4–AC7 · nivel ${lv} en ${lang.toUpperCase()}: Practicar corrige al comprobar; Examen sin marcas ni pistas, entrega con confirmación, bloquea y se mantiene al recargar con xd=1`, async () => {
      const { sd, wrong } = EX_CASES[lv];
      const s = { sd, lv, lang };
      const m = exModel(s);
      const ans = exStudent(s, wrong);
      ans.act.B.IF = '';
      const ask = U0.DEFAULT_ASK;
      const g = GR0.grade(m.sol, ans, ask);
      const wk = Object.keys(wrong)[0];
      const ck = Object.keys(g.cells).find((k) => g.cells[k].state === 'carried');
      assert.ok(ck, 'el error arrastra alguna casilla');
      // Practicar: sin marcas hasta «Comprobar».
      let page = await exLab(Object.assign({ ans: X0.forUrl(ans) }, s));
      assert.deepEqual((await exSt(page)).rows, m.rows);
      assert.equal(await exCell(page, wk).inputValue(), String(wrong[wk]));
      assert.deepEqual(await exMarks(page), noMarksOf(g));
      assert.equal(await page.locator('#exDeliver').count(), 0);
      await page.locator('#exCheck').click();
      assert.deepEqual(await exMarks(page), marksOf(g));
      assert.equal(await exScore(page), X0.scoreText(g, lang));
      assert.equal(await page.locator('#exView .ex-score .muted').innerText(), X0.countText(g, lang));
      // La marca no es solo color: icono y estado en texto, enlazado a la casilla.
      assert.equal(await page.locator(`#${exId(wk)}-m .sr-only`).innerText(), I0.t(lang, 'ex.st.wrong'));
      assert.equal(await page.locator(`#${exId(wk)}-m svg`).count(), 1);
      assert.equal(await exCell(page, wk).getAttribute('aria-describedby'), `${exId(wk)}-m`);
      for (const k of [wk, ck, 'B.IF']) {
        await exCell(page, k).focus();
        assert.equal(await exExplain(page), X0.explain(m, ans, g, k, lang, 'en'), k);
      }
      assert.ok(await visible(page, '#exStep'), 'en Practicar se ve «Ver la solución paso a paso»');
      await close(page);

      // Examen: ni marcas, ni «Comprobar», ni enlace a la solución hasta entregar.
      page = await exLab(Object.assign({ ans: X0.forUrl(ans), xm: 'exam' }, s));
      assert.deepEqual(await exMarks(page), noMarksOf(g));
      assert.equal(await page.locator('#exCheck').count(), 0);
      assert.equal(await page.locator('#exStep').count(), 0);
      assert.equal(await page.locator('#exView .ex-score').count(), 0);
      await exCell(page, wk).focus();
      assert.equal(await page.locator('#exExplain').isVisible(), false, 'sin explicación antes de entregar');
      assert.equal(await page.locator('#exView .ex-note').innerText(), I0.t(lang, 'ex.examNote'));
      await page.locator('#exDeliver').click();
      const dlg = page.locator('#exView .ex-confirm[role="alertdialog"]');
      assert.equal(await dlg.locator('p').innerText(), I0.t(lang, 'ex.confirm', { n: X0.blanks(m, ans, ask) }));
      assert.equal(await activeId(page), 'exConfirmYes');
      assert.equal((await state(page)).xd, 0, 'confirmar no entrega todavía');
      await page.locator('#exConfirmYes').click();
      await page.waitForFunction(() => !!PNL.app.state().xd);
      assert.match(page.url(), /[#&]xd=1(&|$)/);
      const delivered = async (label) => {
        assert.deepEqual(await exMarks(page), marksOf(g), label);
        assert.equal(await exScore(page), X0.scoreText(g, lang), label);
        assert.equal(await page.locator('#exView table.ex-ans input[type="text"]:not([readonly])').count(), 0, `${label}: casillas bloqueadas`);
        assert.equal(await page.locator('#exView table.ex-ans input[type="checkbox"]:not([disabled])').count(), 0, `${label}: críticas bloqueadas`);
        assert.equal(await page.locator('#exView .ex-paths input:not([readonly])').count(), 0, `${label}: caminos bloqueados`);
        assert.equal(await page.locator('#exDeliver').count(), 0);
        assert.ok(await visible(page, '#exStep'), `${label}: tras entregar se ve la solución paso a paso`);
        assert.ok(await visible(page, '#exAnother2'));
        assert.equal(await page.locator('#exView .ex-note').innerText(), I0.t(lang, 'ex.delivered'));
        await exCell(page, wk).focus();
        assert.equal(await exExplain(page), X0.explain(m, ans, g, wk, lang, 'en'), label);
      };
      await delivered('al entregar');
      await page.reload();
      await page.waitForFunction(() => PNL.ex && PNL.ex.state && PNL.ex.state().seed);
      await delivered('al recargar');
      await close(page);
    });
  }
}

check('F3a AC5 · un error con sus consecuentes, una casilla vacía y una no válida: lo escrito con el teclado va al enlace y se corrige con los datos del alumno', async () => {
  const s = { sd: 14844, lv: 'medium', lang: 'es' };
  const m = exModel(s);
  // El alumno calculó con ES de D = 8, pero aún no lo ha escrito; F.LS vacía y G.IF no válida.
  const ans = exStudent(s, { 'D.ES': 8 });
  ans.act.D.ES = ''; ans.act.F.LS = ''; ans.act.G.IF = 'abc';
  const g1 = GR0.grade(m.sol, ans, U0.DEFAULT_ASK);
  assert.equal(g1.cells['D.ES'].state, 'blank');
  assert.equal(g1.cells['D.EF'].state, 'wrong', 'con la casilla vacía se usa el valor correcto');
  const page = await exLab(Object.assign({ ans: X0.forUrl(ans) }, s));
  await page.locator('#exCheck').click();
  assert.deepEqual(await exMarks(page), marksOf(g1));
  for (const k of ['D.ES', 'F.LS', 'G.IF']) {
    await exCell(page, k).focus();
    assert.equal(await exExplain(page), X0.explain(m, ans, g1, k, 'es', 'en'), k);
  }
  assert.equal(await exExplain(page), '«abc» no es un número: escribe una cifra con coma o punto decimal.');
  // Al escribir, las marcas se van y se avisa de que hay que volver a comprobar (P7).
  await exCell(page, 'D.ES').click();
  await page.keyboard.type('8');
  await page.waitForFunction(() => { const a = PNL.app.state().ans; return a && a.act.D && a.act.D.ES === '8'; });
  assert.deepEqual(await exMarks(page), noMarksOf(g1));
  assert.equal(await page.locator('#exView p.banner[role="status"]').innerText(), I0.t('es', 'ex.stale'));
  assert.equal(await activeId(page), exId('D.ES'), 'el foco sigue en la casilla');
  const ans2 = Object.assign({}, ans, { act: Object.assign({}, ans.act, { D: Object.assign({}, ans.act.D, { ES: '8' }) }) });
  const g2 = GR0.grade(m.sol, ans2, U0.DEFAULT_ASK);
  await page.locator('#exCheck').click();
  assert.deepEqual(await exMarks(page), marksOf(g2));
  assert.equal(g2.cells['D.ES'].state, 'wrong');
  assert.equal(g2.cells['D.EF'].state, 'carried');
  assert.equal(g2.cells['I.ES'].state, 'carried');
  await exCell(page, 'I.ES').focus();
  assert.equal(await exExplain(page), 'Has escrito 9, que sale bien de tus datos: ES de I = máx(EF de D = 9, EF de H = 9) = 9. No coincide con la solución porque arrastra un error anterior (empieza en ES de D): no se penaliza.');
  assert.equal(await exCell(page, 'G.IF').inputValue(), 'abc', 'lo no válido se queda como se escribió');
  assert.equal(await page.locator('#exView .ex-score .muted').innerText(), X0.countText(g2, 'es'));
  await close(page);
});

check('F3a AC9 · sucesos: pestañas Actividades y Sucesos, la red PERT de las reglas con sus sucesos, la tabla de arcos y la corrección de los sucesos', async () => {
  const s = { sd: 14844, lv: 'medium', lang: 'es', nota: 'es', ask: ['times', 'events'] };
  const m = exModel(s);
  const ans = exStudent(s, { 'e3.TE': m.sol.events.TE[3] + 2 });
  const g = GR0.grade(m.sol, ans, s.ask);
  const page = await exLab(Object.assign({ ans: X0.forUrl(ans) }, s));
  assert.equal(await page.locator('#exTabActs').getAttribute('aria-pressed'), 'true');
  assert.equal(await page.locator('#exView .ex-net-card h2').innerText(), I0.t('es', 'ex.roy'));
  await page.locator('#exTabEvents').click();
  assert.equal(await page.locator('#exTabEvents').getAttribute('aria-pressed'), 'true');
  assert.equal(await activeId(page), 'exTabEvents');
  assert.equal(await page.locator('#exView .ex-net-card h2').innerText(), I0.t('es', 'ex.pert'));
  const evs = m.sol.net.events.map((e) => String(e.n));
  assert.deepEqual(await page.locator('#exView table.ex-ans tbody th').allInnerTexts(), evs);
  assert.deepEqual(await page.locator('#exView table.ex-ans thead th').allInnerTexts(), ['Suceso', 'Temprano (tᵢ)', 'Tardío (tᵢ*)', 'Holgura']);
  // La red, numerada y sin tiempos.
  assert.deepEqual(await page.locator('#exNet svg g.ev text.nid').allTextContents(), evs);
  assert.equal(await page.locator('#exNet svg g.tbox').count(), 0, 'la red no enseña tiempos');
  await page.locator('#exCheck').click();
  assert.deepEqual(await exMarks(page), marksOf(g, 'events'));
  assert.equal(g.cells['e3.TE'].state, 'wrong');
  assert.ok(Object.values(marksOf(g, 'events')).includes('carried'));
  assert.equal(await exScore(page), X0.scoreText(g, 'es'));
  await exCell(page, 'e3.TE').focus();
  assert.equal(await exExplain(page), X0.explain(m, ans, g, 'e3.TE', 'es', 'es'));
  // Alternativa en texto: la tabla de arcos, con las ficticias.
  await page.locator('#exArcs').click();
  assert.equal(await activeId(page), 'exArcs');
  assert.equal(await page.locator('#exArcs').innerText(), I0.t('es', 'ex.netLink'));
  assert.equal(await page.locator('#exNet table.arcs tbody tr').count(), m.sol.net.arcs.length + m.sol.net.dummies.length);
  assert.equal(await page.locator('#exNet svg').count(), 0);
  for (const d of m.sol.net.dummies) assert.ok((await page.locator('#exNet table.arcs').innerText()).includes(d.name), d.name);
  await page.locator('#exArcs').click();
  assert.equal(await page.locator('#exNet svg').count(), 1);
  // Volver a Actividades devuelve la red ROY y la tabla de actividades, con sus marcas.
  await page.locator('#exTabActs').click();
  assert.equal(await page.locator('#exView .ex-net-card h2').innerText(), I0.t('es', 'ex.roy'));
  assert.deepEqual(await exMarks(page), marksOf(g));
  await close(page);
  // Solo sucesos: sin pestañas, la tabla de sucesos directamente.
  const only = await exLab({ sd: 14844, lv: 'medium', lang: 'en', ask: ['events'] });
  assert.equal(await only.locator('#exTabEvents').count(), 0);
  assert.equal(await only.locator('#exView table.ex-ans tbody tr').count(), evs.length);
  assert.deepEqual(await only.locator('#exView table.ex-ans thead th').allInnerTexts(), ['Event', 'Earliest (TE)', 'Latest (TL)', 'Slack']);
  await close(only);
});

check('F3a AC8, AC13 · caminos críticos, lo que se pide y la notación española: columnas, casillas de críticas, caminos escritos y la misma nota', async () => {
  const s = { sd: 92846, lv: 'hard', lang: 'es', nota: 'es', ask: ALL_ASK };
  const m = exModel(s);
  const full = exStudent(s);
  const ans = Object.assign({}, full, { crit: [], paths: [] });
  const page = await exLab(Object.assign({ ans: X0.forUrl(ans) }, s));
  await page.locator('#exTabActs').click();
  assert.deepEqual(await page.locator('#exView table.ex-ans thead th').allInnerTexts(), ['Act.', 'd', 'tᵢ', 'fᵢ', 'tᵢ*', 'fᵢ*', 'HT', 'HL', 'HI', 'HS', 'Crítica']);
  assert.equal(await page.locator('#exView table.ex-ans tbody tr').count(), 14);
  // Las críticas, con su casilla; los caminos, cada uno en su campo, con guiones, comas o espacios.
  for (const a of full.crit) await exCell(page, `${a}.crit`).check();
  await page.waitForFunction((n) => (PNL.app.state().ans.crit || []).length === n, full.crit.length);
  const right = m.sol.cpm.paths.list.filter((p) => p.critical).map((p) => p.acts);
  assert.equal(right.length, 3);
  const written = [right[0].join('-'), right[1].join(', '), right[2].join(' '), `${right[0][0]}-${right[0][1]}`];
  for (let i = 0; i < written.length; i++) {
    if (i) await page.locator('#exAddPath').click(); else await page.locator('#exPath0').click();
    assert.equal(await activeId(page), `exPath${i}`, 'el foco va al camino nuevo');
    await page.keyboard.type(written[i]);
  }
  await page.waitForFunction((n) => (PNL.app.state().ans.paths || []).length === n, written.length);
  const ans2 = Object.assign({}, ans, { crit: full.crit.slice(), paths: written });
  const g = GR0.grade(m.sol, ans2, s.ask);
  await page.locator('#exCheck').click();
  assert.deepEqual(await exMarks(page), marksOf(g));
  const pst = await page.locator('#exView .ex-pcell').evaluateAll((els) => els.map((e) => (/st-(\w+)/.exec(e.className) || [])[1]));
  assert.deepEqual(pst, g.paths.written.map((w) => w.state));
  assert.deepEqual(pst, ['ok', 'ok', 'ok', 'wrong']);
  await page.locator('#exPath3').focus();
  assert.equal(await exExplain(page), X0.pathExplain(m, ans2, 3, g, 'es'));
  const scoreEs = await exScore(page);
  assert.equal(scoreEs, X0.scoreText(g, 'es'));
  // «×» quita un camino.
  await page.getByRole('button', { name: 'Quitar el camino 4' }).click();
  await page.waitForFunction(() => PNL.app.state().ans.paths.length === 3);
  assert.equal(await page.locator('#exView .ex-path').count(), 3);
  const url = page.url();
  await close(page);
  // La notación no cambia la corrección: el mismo enlace en notación inglesa da la misma nota.
  const en = await open(url.slice(BASE.length + 1).replace('nota=es', 'nota=en'));
  await en.waitForFunction(() => PNL.ex && PNL.ex.state && PNL.ex.state().seed);
  await en.locator('#exTabActs').click();
  assert.deepEqual(await en.locator('#exView table.ex-ans thead th').allInnerTexts(), ['Act.', 'd', 'ES', 'EF', 'LS', 'LF', 'TF', 'FF', 'IF', 'SF', 'Crítica']);
  await en.locator('#exCheck').click();
  const g3 = GR0.grade(m.sol, Object.assign({}, ans2, { paths: written.slice(0, 3) }), s.ask);
  assert.equal(await exScore(en), X0.scoreText(g3, 'es'));
  assert.equal(g3.score.pct, 100);
  await close(en);
  // Lo que se pide: solo holguras (sin duración, críticas ni caminos); la nota cuenta solo esas casillas.
  const fl = await exLab({ sd: 92846, lv: 'hard', lang: 'en', ask: ['floats'] });
  assert.deepEqual(await fl.locator('#exView table.ex-ans thead th').allInnerTexts(), ['Act.', 'd', 'TF', 'FF', 'IF']);
  assert.equal(await fl.locator(`#${exId('dur')}`).count(), 0);
  assert.equal(await fl.locator('#exView .ex-paths').count(), 0);
  assert.ok(await fl.locator('#exAsk-sf').isEnabled());
  await fl.locator('#exCheck').click();
  const gf = GR0.grade(m.sol, X0.empty(), ['floats']);
  assert.equal(gf.score.total, 14 * 3);
  assert.equal(await exScore(fl), X0.scoreText(gf, 'en'));
  // Pedir otra cosa es otro ejercicio con la misma semilla: la tabla no cambia.
  await fl.locator('#exAsk-sf').check();
  await fl.waitForFunction(() => PNL.app.state().ask.join() === 'floats,sf');
  assert.deepEqual(await fl.locator('#exView table.ex-ans thead th').allInnerTexts(), ['Act.', 'd', 'TF', 'FF', 'IF', 'SF']);
  assert.deepEqual((await exSt(fl)).rows, m.rows);
  assert.equal((await state(fl)).sd, 92846);
  // La holgura de seguridad sola no se puede pedir: quitar las holguras no hace nada.
  await fl.locator('#exAsk-floats').click();
  assert.equal(await fl.locator('#exAsk-floats').isChecked(), true);
  assert.equal((await state(fl)).ask.join(), 'floats,sf');
  await close(fl);
});

check('F3a AC14 · «Personalizar»: los parámetros imposibles se dicen antes de generar; un caso sin tabla lo dice sin bloquear la página', async () => {
  const page = await exLab({ sd: 14844, lv: 'medium', lang: 'es' });
  await page.locator('#exLv-custom').click();
  assert.equal(await page.locator('#exLv-custom').getAttribute('aria-expanded'), 'true');
  assert.ok(await visible(page, '#exCustom'));
  assert.equal(await activeId(page), 'exCustN0');
  const setNum = async (id, v) => { await page.locator(`#${id}`).fill(String(v)); await page.locator(`#${id}`).press('Tab'); };
  const draft = Object.assign({}, GEN0.LEVELS.medium, { n: [6, 7] });
  await setNum('exCustN0', 6); await setNum('exCustN1', 7);
  assert.equal(await page.locator('#exCustDum').isChecked(), true);
  await setNum('exCustF0', 3); await setNum('exCustF1', 4);
  draft.dummies = [3, 4];
  let chk = GEN0.check(draft);
  assert.deepEqual(chk.issues.map((i) => i.code), ['dummiesTooMany']);
  assert.equal(await page.locator('#exCustIssue').innerText(), X0.issueText(chk.issues[0], draft, 'es'));
  assert.equal(await page.locator('#exCustIssue').getAttribute('role'), 'alert');
  assert.equal(await page.locator('#exCustF0').getAttribute('aria-invalid'), 'true');
  assert.equal(await page.locator('#exCustF0').getAttribute('aria-describedby'), 'exCustIssue');
  assert.ok(await page.locator('#exCustGo').isDisabled());
  // Fuera de los límites: la duración máxima.
  await page.locator('#exCustDum').uncheck();
  draft.dummies = null;
  await setNum('exCustD', 1);
  draft.dmax = 1;
  chk = GEN0.check(draft);
  assert.deepEqual(chk.issues.map((i) => i.key), ['dmax']);
  assert.equal(await page.locator('#exCustIssue').innerText(), X0.issueText(chk.issues[0], draft, 'es'));
  assert.ok(await page.locator('#exCustGo').isDisabled());
  assert.equal((await state(page)).lv, 'medium', 'nada cambia mientras no se genera');
  // Con valores posibles, «Generar» da una tabla con esos parámetros.
  await setNum('exCustD', 9);
  assert.equal(await page.locator('#exCustIssue').count(), 0);
  await page.locator('#exCustGo').click();
  await page.waitForFunction(() => PNL.app.state().lv === 'custom');
  const st = await state(page);
  assert.deepEqual(st.gp, { n: [6, 7], pred: 1.6, dummies: null, critical: [1, 2], dmax: 9 });
  assert.deepEqual((await exSt(page)).rows, GEN0.generate(st.sd, st.gp).rows);
  assert.equal(await page.locator('#exCustom').count(), 0);
  await close(page);
  // Sin tabla en 500 intentos: se dice qué falló y la página sigue respondiendo.
  const gp = { n: [4, 4], pred: 1, dummies: [0, 0], critical: [3, 3], dmax: 2 };
  const nf = GEN0.generate(1, gp);
  assert.equal(nf.ok, false);
  const bad = await exLab({ sd: 1, lv: 'custom', gp, lang: 'es' });
  assert.equal(await bad.locator('#exView p.banner').innerText(), X0.notFoundText(nf, 'es'));
  assert.equal(await bad.locator('#exView table.ex-ans').count(), 0);
  await bad.locator('#exLv-medium').click();
  await bad.waitForFunction(() => PNL.app.state().lv === 'medium');
  assert.equal(await bad.locator('#exView table.ex-ans tbody tr').count(), GEN0.generate(1, GEN0.LEVELS.medium).rows.length);
  await close(bad);
});

check('F3a AC10 · el enlace con la semilla y las respuestas abre lo mismo en otro navegador, sin las marcas de Practicar; el de un Examen entregado, entregado', async () => {
  const page = await exLab({ sd: 14844, lv: 'medium', lang: 'en' });
  await exCell(page, 'A.ES').click();
  await page.keyboard.type('0');
  await page.keyboard.press('Tab');
  await page.keyboard.type('7,5');
  await exCell(page, 'A.crit').check();
  await page.locator('#exPath0').fill('A-E-J');
  await page.waitForFunction(() => { const a = PNL.app.state().ans; return a && a.paths && a.paths[0] === 'A-E-J' && a.act.A.EF === '7,5'; });
  await page.locator('#exCheck').click();
  const url = page.url().slice(BASE.length + 1);
  assert.match(url, /[#&]sd=14844(&|$)/);
  assert.match(url, /[#&]ans=/);
  await close(page);
  const other = await open(url);
  await other.waitForFunction(() => PNL.ex && PNL.ex.state && PNL.ex.state().seed);
  assert.deepEqual((await exSt(other)).rows, exModel({ sd: 14844, lv: 'medium' }).rows);
  assert.equal(await exCell(other, 'A.ES').inputValue(), '0');
  assert.equal(await exCell(other, 'A.EF').inputValue(), '7,5');
  assert.equal(await exCell(other, 'A.crit').isChecked(), true);
  assert.equal(await other.locator('#exPath0').inputValue(), 'A-E-J');
  assert.equal(await other.locator('#exView .ex-score').count(), 0, 'la corrección de Practicar vive solo en la página');
  assert.equal(Object.values(await exMarks(other)).filter(Boolean).length, 0);
  await close(other);
  // Examen entregado.
  const s = { sd: 39595, lv: 'easy', lang: 'es', xm: 'exam' };
  const ans = exStudent(s, { 'E.ES': 9 });
  const ex = await exLab(Object.assign({ ans: X0.forUrl(ans) }, s));
  await ex.locator('#exDeliver').click();
  await ex.locator('#exConfirmYes').click();
  await ex.waitForFunction(() => !!PNL.app.state().xd);
  const done = ex.url().slice(BASE.length + 1);
  await close(ex);
  const back = await open(done, { scheme: 'dark' });
  await back.waitForFunction(() => PNL.ex && PNL.ex.state && PNL.ex.state().seed);
  const g = GR0.grade(exModel(s).sol, ans, U0.DEFAULT_ASK);
  assert.deepEqual(await exMarks(back), marksOf(g));
  assert.equal(await back.locator('#exView table.ex-ans input[type="text"]:not([readonly])').count(), 0);
  await close(back);
});

check('F3a AC12 · «Ver la solución paso a paso» abre la ruta (o los sucesos) con la misma tabla y «Atrás» vuelve al ejercicio; en Examen no está hasta entregar', async () => {
  const s = { sd: 14844, lv: 'medium', lang: 'es', ask: ['times', 'events', 'critical'] };
  const m = exModel(s);
  const ans = exStudent(s, { 'D.ES': 8 });
  const page = await exLab(Object.assign({ ans: X0.forUrl(ans) }, s));
  const before = await state(page);
  await page.locator('#exStep').click();
  await page.waitForFunction(() => PNL.app.state().v === 'route');
  let st = await state(page);
  assert.equal(st.graph, 'aon');
  assert.deepEqual(st.t.map((r) => [r.id, String(r.duration), r.links]), m.rows.map((r) => [r.id, String(r.duration), r.links]));
  assert.ok(await visible(page, '#stage'));
  assert.equal(await page.locator('#exView').isVisible(), false);
  assert.equal((await trace(page))[0].kind, 'table');
  await page.goBack();
  await page.waitForFunction(() => PNL.app.state().v === 'ex');
  st = await state(page);
  assert.equal(st.sd, before.sd);
  assert.deepEqual(st.ans, before.ans);
  assert.equal(await exCell(page, 'D.ES').inputValue(), '8');
  // Desde la pestaña Sucesos, la construcción de la red PERT.
  await page.locator('#exTabEvents').click();
  await page.locator('#exStep').click();
  await page.waitForFunction(() => PNL.app.state().v === 'route');
  assert.equal((await state(page)).graph, 'aoa');
  await page.goBack();
  await page.waitForFunction(() => PNL.app.state().v === 'ex');
  await close(page);
  const exam = await exLab(Object.assign({ ans: X0.forUrl(ans), xm: 'exam' }, s));
  assert.equal(await exam.locator('#exStep').count(), 0);
  assert.equal(await exam.locator('#exView a[href*="v=route"]').count(), 0, 'ningún enlace a la ruta antes de entregar');
  await close(exam);
});

check('F3a · aviso antes de perder respuestas: otro nivel, otro ejercicio, otra semilla o lo que se pide piden confirmación en la página; sin respuestas, no', async () => {
  const s = { sd: 14844, lv: 'medium', lang: 'es' };
  const ans = exStudent(s, { 'D.ES': 8 });
  const page = await exLab(Object.assign({ ans: X0.forUrl(ans) }, s));
  const before = await state(page);
  const lose = page.locator('#exView .ex-lose[role="alertdialog"]');
  await page.locator('#exLv-hard').click();
  assert.ok(await lose.isVisible());
  assert.equal(await lose.locator('#exLoseText').innerText(), I0.t('es', 'ex.lose'));
  assert.equal(await activeId(page), 'exLoseYes');
  assert.equal((await state(page)).lv, 'medium');
  await page.locator('#exLoseNo').click();
  assert.equal(await lose.count(), 0);
  assert.equal(await activeId(page), 'exAnother');
  assert.deepEqual((await state(page)).ans, before.ans);
  for (const act of [() => page.locator('#exAnother').click(), () => page.locator('#exAsk-events').click(),
    async () => { await page.locator('#exSeed').fill('777'); await page.locator('#exSeed').press('Tab'); }]) {
    await act();
    assert.ok(await lose.isVisible());
    assert.equal((await state(page)).sd, 14844);
    await page.locator('#exLoseNo').click();
  }
  assert.equal(await page.locator('#exAsk-events').isChecked(), false);
  await page.locator('#exLv-hard').click();
  await page.locator('#exLoseYes').click();
  await page.waitForFunction(() => PNL.app.state().lv === 'hard');
  const st = await state(page);
  assert.equal(st.ans, null);
  assert.equal(st.sd, 14844, 'otro nivel conserva la semilla');
  // Sin respuestas, el cambio es directo; «Atrás» vuelve al ejercicio con sus respuestas.
  await page.locator('#exLv-easy').click();
  await page.waitForFunction(() => PNL.app.state().lv === 'easy');
  assert.equal(await lose.count(), 0);
  await page.goBack();
  await page.goBack();
  await page.waitForFunction(() => PNL.app.state().lv === 'medium');
  assert.deepEqual((await state(page)).ans, before.ans);
  await close(page);
});

check('F3a AC15 · seleccionar una fila resalta la actividad en la red ROY y en la tabla dada, o el suceso en la red PERT; pulsar una actividad en la red lleva a su fila', async () => {
  const page = await exLab({ sd: 14844, lv: 'medium', lang: 'es', ask: ['times', 'events'] });
  await exCell(page, 'D.EF').focus();
  const selRows = (sel) => page.locator(`#exView ${sel}.sel`).evaluateAll((els) => els.map((e) => e.getAttribute('data-act') || e.getAttribute('data-ev')));
  assert.deepEqual(await selRows('table.ex-ans tr'), ['D']);
  assert.deepEqual(await selRows('table.ex-given tr'), ['D']);
  // El texto de cada caja lleva su <title>: se busca por el primer nodo de texto.
  const royNode = async (id) => page.locator('#exNet g.node').nth(await page.locator('#exNet g.node').evaluateAll((gs, x) => gs.findIndex((g) => {
    const n = g.querySelector('text.nid'); return n && n.firstChild && n.firstChild.nodeValue === x; }), id));
  assert.equal(await (await royNode('D')).locator('rect.sel').count(), 1);
  assert.equal(await page.locator('#exNet rect.sel').count(), 1);
  await (await royNode('H')).click();
  assert.equal(await activeId(page), exId('H.ES'));
  assert.deepEqual(await selRows('table.ex-ans tr'), ['H']);
  assert.equal(await (await royNode('H')).locator('rect.sel').count(), 1);
  // Un suceso.
  await page.locator('#exTabEvents').click();
  await exCell(page, 'e3.TL').focus();
  assert.deepEqual(await selRows('table.ex-ans tr'), ['3']);
  assert.deepEqual(await page.locator('#exNet g.ev.active text.nid').allTextContents(), ['3']);
  await exCell(page, 'e5.TE').focus();
  assert.deepEqual(await page.locator('#exNet g.ev.active text.nid').allTextContents(), ['5']);
  // Plegar la red y volver a mostrarla.
  await page.locator('#exFold').click();
  assert.equal(await page.locator('#exFold').getAttribute('aria-expanded'), 'false');
  assert.equal(await page.locator('#exNet').isVisible(), false);
  assert.equal(await activeId(page), 'exFold');
  await page.locator('#exFold').click();
  assert.equal(await page.locator('#exNet g.ev.active text.nid').count(), 1);
  await close(page);
});

check('F3a · la tabla dada se lee con predecesoras o con posteriores', async () => {
  const s = { sd: 92846, lv: 'hard', lang: 'en' };
  const m = exModel(s);
  const page = await exLab(s);
  const links = () => page.locator('#exView table.ex-given tbody tr').evaluateAll((trs) => trs.map((tr) => [tr.children[0].textContent, tr.children[2].textContent]));
  const want = (k) => m.project.activities.map((a) => [a.id, m.project[k][a.id].join(', ') || '—']);
  assert.deepEqual(await links(), want('preds'));
  assert.equal(await page.locator('#exPreds').getAttribute('aria-pressed'), 'true');
  await page.locator('#exSuccs').click();
  assert.equal(await page.locator('#exSuccs').getAttribute('aria-pressed'), 'true');
  assert.deepEqual(await links(), want('succs'));
  assert.equal(await page.locator('#exView table.ex-given thead th').nth(2).innerText(), I0.t('en', 'ex.succs'));
  assert.equal((await state(page)).sd, 92846, 'cambiar la lectura no cambia el ejercicio');
  await page.locator('#exPreds').click();
  assert.deepEqual(await links(), want('preds'));
  await close(page);
});

check('F3a plan §0 · las teclas del reproductor no actúan en «Ejercicios»; Intro baja de fila y Tab sigue el orden de lectura', async () => {
  const page = await exLab({ sd: 14844, lv: 'medium', lang: 'es' });
  const before = JSON.stringify(await state(page));
  await page.locator('#exView .ex-given-card h2').click();
  for (const k of ['ArrowRight', 'ArrowRight', 'ArrowLeft', 'Home', 'End', 'Space']) await page.keyboard.press(k);
  assert.equal(JSON.stringify(await state(page)), before);
  assert.equal(await page.locator('#stage').isVisible(), false);
  await exCell(page, 'A.ES').click();
  await page.keyboard.type('0');
  for (const k of ['ArrowRight', 'ArrowLeft', 'Home', 'End']) await page.keyboard.press(k);
  assert.equal(await activeId(page), exId('A.ES'));
  await page.keyboard.press('Enter');
  assert.equal(await activeId(page), exId('B.ES'), 'Intro baja a la misma columna');
  await page.keyboard.press('Tab');
  assert.equal(await activeId(page), exId('B.EF'), 'Tab sigue la fila');
  await exCell(page, 'J.LF').click();
  await page.keyboard.press('Enter');
  assert.equal(await activeId(page), exId('J.LF'), 'en la última fila, Intro no se mueve');
  const st = await state(page);
  assert.equal(st.v, 'ex');
  assert.equal(st.step, 0);
  assert.equal(st.ans.act.A.ES, '0');
  await close(page);
});

// «Tabla al azar» se ve al publicar (T017); aquí se activa antes de cargar la página. La semilla se fija con
// crypto.getRandomValues para comparar con la tabla de Node.
const RAND_K = 123456788;
const RAND_SEED = 1 + (RAND_K % 999999);
const randomInit = `(() => {
  let ed; const P = window.PNL || {};
  Object.defineProperty(P, 'editor', { configurable: true, enumerable: true, get: () => ed, set: (v) => { ed = v; if (v) v.RANDOM_VISIBLE = true; } });
  window.PNL = P;
  crypto.getRandomValues = (a) => { a[0] = ${RAND_K}; return a; };
})();`;

check('F3a AC11 · «Tabla al azar» (visible en la prueba): pone la tabla del generador con el nivel elegido, avisa y «Atrás» recupera la anterior', async () => {
  const page = await open('cpm.html#v=work&lang=es', { init: randomInit });
  const rows = () => page.evaluate(() => PNL.app.model().rows.map((r) => [r.id, String(r.duration), r.links]));
  const prev = await rows();
  assert.ok(await visible(page, '#workRandom'));
  assert.equal(await page.locator('#workRandLevel').inputValue(), 'medium');
  await page.locator('#workRandLevel').selectOption('hard');
  await page.locator('#workRandom').click();
  const want = ED0.randomRows(RAND_SEED, 'hard', 'pred');
  await page.waitForFunction((n) => PNL.app.state().t && PNL.app.state().t.length === n, want.length);
  assert.equal((await state(page)).ex, null, 'la tabla al azar va en t, sin ejemplo');
  assert.deepEqual(await rows(), want.map((r) => [r.id, r.duration, r.links]));
  assert.equal(await page.locator('#workshop .work-notice').innerText(), ED0.randomNotice('es', 'hard', want.length));
  assert.equal(await activeId(page), 'workRandom');
  assert.equal((await state(page)).sd, null, 'la tabla del taller no lleva semilla');
  // Se abre en M1 como cualquier tabla del taller.
  assert.equal(await page.evaluate(() => PNL.app.model().project.activities.length), want.length);
  // Editar quita el aviso.
  await page.locator('#workshop tbody tr').first().locator('input').nth(1).fill('Otra');
  await page.waitForFunction(() => !document.querySelector('#workshop .work-notice'));
  await page.goBack();
  await page.waitForFunction(() => PNL.app.state().ex === 'ej6' && !PNL.app.state().t);
  assert.deepEqual(await rows(), prev);
  // Con posteriores, la tabla al azar se escribe con posteriores.
  await page.locator('#workshop input[type="radio"][value="succ"]').check();
  await page.waitForFunction(() => PNL.app.state().mode === 'succ');
  assert.equal(await page.locator('#workRandLevel').inputValue(), 'hard', 'el nivel elegido se conserva en la página');
  await page.locator('#workRandLevel').selectOption('medium');
  await page.locator('#workRandom').click();
  const succ = ED0.randomRows(RAND_SEED, 'medium', 'succ');
  await page.waitForFunction((n) => PNL.app.state().t && PNL.app.state().t.length === n && PNL.app.state().mode === 'succ', succ.length);
  assert.deepEqual(await rows(), succ.map((r) => [r.id, r.duration, r.links]));
  await close(page);
});

check('F3a AC15 · solo con el teclado: escribir, marcar una crítica, comprobar, pasar a Examen, entregar y abrir «Personalizar», con el foco a la vista', async () => {
  const page = await exLab({ sd: 14844, lv: 'medium', lang: 'es' });
  await page.locator('#exAnother').focus();
  await tabTo(page, exId('A.ES'));
  assert.ok(await focusVisible(page), 'foco visible en la casilla');
  await page.keyboard.type('0');
  await page.keyboard.press('Enter');
  await page.keyboard.type('0');
  await page.keyboard.press('Tab');
  await page.keyboard.type('8');
  await tabTo(page, exId('B.crit'));
  assert.ok(await focusVisible(page), 'foco visible en la casilla de crítica');
  await page.keyboard.press('Space');
  await page.waitForFunction(() => { const a = PNL.app.state().ans; return a && a.crit.includes('B') && a.act.B.EF === '8'; });
  await tabTo(page, 'exPath0');
  await page.keyboard.type('B-G');
  await tabTo(page, 'exCheck');
  assert.ok(await focusVisible(page), 'foco visible en «Comprobar»');
  await page.keyboard.press('Enter');
  assert.equal(await activeId(page), 'exCheck', 'el foco se queda en «Comprobar»');
  assert.ok(await page.locator('#exView .ex-score').isVisible());
  assert.equal(await page.locator('#live').innerText(), (await exScore(page)) + '. ' + (await page.locator('#exView .ex-score .muted').innerText()));
  // A Examen (con respuestas, se confirma en la página).
  await tabTo(page, 'exExam', 'Shift+Tab');
  await page.keyboard.press('Enter');
  assert.equal(await activeId(page), 'exLoseYes');
  assert.ok(await focusVisible(page));
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => PNL.app.state().xm === 'exam');
  await page.locator('#exExam').focus();
  await tabTo(page, 'exDeliver');
  await page.keyboard.press('Enter');
  assert.equal(await activeId(page), 'exConfirmYes');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => !!PNL.app.state().xd);
  assert.equal(await activeId(page), 'exStep', 'tras entregar, el foco va a la solución paso a paso');
  assert.ok(await focusVisible(page));
  // «Personalizar» se abre y se recorre con el teclado.
  await tabTo(page, 'exLv-custom', 'Shift+Tab');
  await page.keyboard.press('Enter');
  assert.equal(await activeId(page), 'exCustN0');
  assert.ok(await focusVisible(page));
  await tabTo(page, 'exCustGo');
  await close(page);
});

check('F3a AC15 · axe sin violaciones en «Ejercicios» (Practicar, corrección, sucesos, arcos, «Personalizar», aviso, Examen, entrega, sin tabla y «Aprende más»), en claro y oscuro', async () => {
  for (const scheme of ['light', 'dark']) {
    const lang = scheme === 'light' ? 'es' : 'en';
    const s = { sd: 14844, lv: 'medium', lang, ask: ALL_ASK, nota: lang };
    const ans = exStudent(s, { 'D.ES': 8 });
    ans.act.F.LS = ''; ans.act.G.IF = 'x';
    let page = await exLab(Object.assign({ ans: X0.forUrl(ans) }, s), { scheme });
    await page.locator('#exTabActs').click();
    await axe(page, `ex practicar ${scheme}`);
    await page.locator('#exCheck').click();
    await exCell(page, 'I.ES').focus();
    await axe(page, `ex corrección ${scheme}`);
    await page.locator('#exTabEvents').click();
    await axe(page, `ex sucesos ${scheme}`);
    await page.locator('#exArcs').click();
    await axe(page, `ex arcos ${scheme}`);
    await page.locator('#exLv-custom').click();
    await page.locator('#exCustD').fill('40'); await page.locator('#exCustD').press('Tab');
    await axe(page, `ex personalizar ${scheme}`);
    await page.locator('#exLv-hard').click();
    await axe(page, `ex aviso ${scheme}`);
    await page.locator('#exLearn').click();
    await page.locator('#learnDialog[open]').waitFor();
    await axe(page, `ex aprende más ${scheme}`);
    await close(page);
    page = await exLab(Object.assign({ ans: X0.forUrl(ans), xm: 'exam' }, s), { scheme });
    await page.locator('#exDeliver').click();
    await axe(page, `ex examen ${scheme}`);
    await page.locator('#exConfirmYes').click();
    await page.waitForFunction(() => !!PNL.app.state().xd);
    await axe(page, `ex entregado ${scheme}`);
    await close(page);
    page = await exLab({ sd: 1, lv: 'custom', gp: { n: [4, 4], pred: 1, dummies: [0, 0], critical: [3, 3], dmax: 2 }, lang }, { scheme });
    await axe(page, `ex sin tabla ${scheme}`);
    await close(page);
  }
});

check('F3a AC16 · a 1280×720 «Ejercicios» cabe sin desplazar la página (también el difícil de 14 actividades con todo pedido); a 360 px no hay desplazamiento horizontal', async () => {
  const fits = async (page, label) => {
    const b = await page.evaluate(() => ({ bottom: document.getElementById('exView').getBoundingClientRect().bottom, y: window.scrollY, w: document.documentElement.scrollWidth }));
    assert.ok(b.y === 0 && b.bottom <= 720 && b.w <= 1280, `${label}: ${JSON.stringify(b)}`);
  };
  for (const lang of ['es', 'en']) {
    for (const s of [{ sd: 14844, lv: 'medium' }, { sd: 39595, lv: 'easy', xm: 'exam' }, { sd: 92846, lv: 'hard', ask: ALL_ASK }, { sd: 14844, lv: 'medium', ask: ['times', 'events'] }]) {
      const full = Object.assign({ lang }, s);
      const ans = exStudent(full, { 'D.ES': s.lv === 'easy' ? 0 : 8 });
      const page = await exLab(Object.assign({ ans: X0.forUrl(ans) }, full));
      const label = `${lang} ${s.lv} ${(s.ask || []).join('+')}`;
      if (await page.locator('#exTabActs').count()) await page.locator('#exTabActs').click();
      await fits(page, label);
      if (s.xm === 'exam') {
        await page.locator('#exDeliver').click();
        await fits(page, `${label}, confirmación`);
        await page.locator('#exConfirmYes').click();
        await page.waitForFunction(() => !!PNL.app.state().xd);
      } else await page.locator('#exCheck').click();
      await exCell(page, 'D.EF').focus();
      await fits(page, `${label}, corregido`);
      await shot(page, `ex-${lang}-1280-${s.lv}${s.ask ? `-${s.ask.length}` : ''}`);
      if (await page.locator('#exTabEvents').count()) {
        await page.locator('#exTabEvents').click();
        await fits(page, `${label}, sucesos`);
      }
      await close(page);
    }
    // 360 px: vacío, corregido, sucesos y arcos, «Personalizar», aviso y Examen entregado.
    const s = { sd: 92846, lv: 'hard', lang, ask: ALL_ASK };
    const ans = exStudent(s, { 'D.ES': 13 });
    const page = await exLab(Object.assign({ ans: X0.forUrl(ans) }, s), { width: 360, height: 740 });
    const narrow = async (label) => { const w = await page.evaluate(() => document.documentElement.scrollWidth); assert.ok(w <= 360, `${lang} 360 px, ${label}: ${w} px`); };
    assert.equal(await page.locator('#exFold').getAttribute('aria-expanded'), 'false', 'en el móvil la red empieza plegada');
    await narrow('al abrir');
    await page.locator('#exTabActs').click();
    await page.locator('#exCheck').click();
    await exCell(page, 'D.EF').focus();
    await narrow('corregido');
    await shot(page, `ex-${lang}-360-hard`, true);
    await page.locator('#exFold').click();
    await narrow('con la red');
    await page.locator('#exTabEvents').click();
    await narrow('sucesos');
    await page.locator('#exArcs').click();
    await narrow('arcos');
    // La tabla de arcos es más ancha que su caja: la caja se alcanza con el teclado (T018, scrollable-region-focusable).
    await axe(page, `ex arcos a 360 px (${lang})`);
    await page.locator('#exLv-custom').click();
    await narrow('personalizar');
    await page.locator('#exLv-medium').click();
    await narrow('aviso');
    await close(page);
    const ex = await exLab({ sd: 39595, lv: 'easy', lang, xm: 'exam', ans: X0.forUrl(exStudent({ sd: 39595, lv: 'easy' }, { 'E.ES': 9 })) }, { width: 360, height: 740 });
    await ex.locator('#exDeliver').click();
    await ex.locator('#exConfirmYes').click();
    await ex.waitForFunction(() => !!PNL.app.state().xd);
    const w = await ex.evaluate(() => document.documentElement.scrollWidth);
    assert.ok(w <= 360, `${lang} 360 px, entregado: ${w} px`);
    await close(ex);
  }
});

check('F3a AC7 · «Aprende más» de «Ejercicios» abre su tema en el idioma de la página y se cierra', async () => {
  for (const lang of ['es', 'en']) {
    const page = await exLab({ sd: 14844, lv: 'medium', lang, xm: 'exam' });
    await page.locator('#exLearn').click();
    await page.locator('#learnDialog[open]').waitFor();
    assert.equal(await page.locator('#learnTitle').innerText(), I0.t(lang, 'ex.learnTitle'));
    const ps = await page.locator('#learnBody > p').allInnerTexts();
    // F3b (T012): el tema termina con el párrafo del banco de Moodle y su enlace.
    assert.deepEqual(ps, [...LR0.topics.ex[lang], `${I0.t(lang, 'ex.learnMoodle')} ${I0.t(lang, 'ex.moodle')}.`]);
    await page.locator('#btnLearnClose').click();
    assert.equal(await page.locator('#learnDialog[open]').count(), 0);
    assert.equal(await activeId(page), 'exLearn', 'el foco vuelve al botón');
    assert.equal((await state(page)).xd, 0, 'abrir la ayuda no entrega el examen');
    await close(page);
  }
});

check('F3a P10 · un enlace pegado carga lo que falta: M0 desde «Ejercicios» y «Ejercicios» desde la ruta, y «Atrás» vuelve', async () => {
  const loaded = (page) => page.evaluate(() => performance.getEntriesByType('resource').map((e) => new URL(e.name).pathname).filter((p) => /\/js\/(m0|ex|core\/grade|core\/statement)\.js$/.test(p)).sort());
  const page = await exLab({ sd: 14844, lv: 'medium', lang: 'es' });
  assert.equal(await page.evaluate(() => !!PNL.m0), false, 'M0 no se carga con «Ejercicios»');
  await setHash(page, U0.encode(Object.assign(U0.defaults(), { v: 'm0', st: 'ej5', lang: 'es' })));
  await page.waitForFunction(() => PNL.m0 && PNL.m0.state && !document.getElementById('m0View').hidden);
  assert.equal(await page.locator('#exView').isVisible(), false);
  assert.equal(await page.evaluate(() => PNL.app.state().st), 'ej5');
  assert.ok((await page.locator('#m0View .st-text').innerText()).length > 50, 'se ve el enunciado');
  await page.goBack();
  await page.waitForFunction(() => PNL.app.state().v === 'ex' && !document.getElementById('exView').hidden);
  assert.equal((await exSt(page)).seed, 14844);
  await close(page);
  const route = await lab('v=route&ex=ej6&step=0&lang=es');
  assert.deepEqual(await loaded(route), [], 'la ruta no carga los scripts de M0 ni de «Ejercicios»');
  await setHash(route, exHash({ sd: 39595, lv: 'easy', lang: 'es' }));
  await route.waitForFunction(() => PNL.ex && PNL.ex.state && PNL.ex.state().seed === 39595);
  assert.deepEqual(await loaded(route), ['/js/core/grade.js', '/js/ex.js']);
  assert.equal(await route.locator('#exView table.ex-ans tbody tr').count(), 7);
  assert.equal(await route.locator('#stage').isVisible(), false);
  await route.goBack();
  await route.waitForFunction(() => PNL.app.state().v === 'route');
  assert.ok(await visible(route, '#stage'));
  await close(route);
});

// ---------- F3a, T017: publicación (pestaña, barra, portada y «Tabla al azar» visible) ----------

check('F3a T017 · P11: la pestaña «Ejercicios» va la última de la barra, abre un ejercicio con semilla y «Atrás» vuelve', async () => {
  for (const [lang, labels] of [['es', ['Del enunciado a la tabla', 'Ruta guiada', 'Taller', 'Duraciones inciertas', 'Ejercicios']], ['en', ['From statement to table', 'Guided tour', 'Workshop', 'Uncertain durations', 'Exercises']]]) {
    const page = await lab(`v=route&ex=ej6&step=3&lang=${lang}`);
    assert.deepEqual((await page.locator('header nav a:visible').allInnerTexts()).map((x) => x.trim()), labels);
    assert.equal(await page.locator('#navEx').getAttribute('aria-current'), 'false');
    assert.match(await page.locator('#navEx').getAttribute('href'), /^#v=ex&.*sd=\d+/);
    await page.locator('#navEx').click();
    await page.waitForFunction(() => PNL.app.state().v === 'ex' && PNL.ex && PNL.ex.state && PNL.ex.state().rows);
    const s = await state(page);
    assert.ok(Number.isInteger(s.sd) && s.sd >= 1 && s.sd <= 999999);
    assert.deepEqual([s.lv, s.xm, s.ans, s.lang], ['medium', 'practice', null, lang]);
    assert.match(page.url(), new RegExp(`[#&]sd=${s.sd}(&|$)`));
    assert.equal(await page.locator('#navEx').getAttribute('aria-current'), 'page');
    assert.equal(await page.locator('#navRoute').getAttribute('aria-current'), 'false');
    // Pulsarla otra vez no cambia el ejercicio.
    await page.locator('#navEx').click();
    assert.equal((await state(page)).sd, s.sd);
    await page.goBack();
    await page.waitForFunction(() => PNL.app.state().v === 'route' && PNL.app.state().step === 3);
    // De «Ejercicios» a las demás pestañas y vuelta: el ejercicio es el mismo, sin respuestas.
    await page.goForward();
    await page.waitForFunction(() => PNL.app.state().v === 'ex');
    await exCell(page, 'A.ES').fill('0');
    await page.locator('#navWork').click();
    await page.waitForFunction(() => PNL.app.state().v === 'work');
    await page.locator('#navEx').click();
    await page.waitForFunction(() => PNL.app.state().v === 'ex');
    assert.equal((await state(page)).sd, s.sd);
    await page.locator('#navM0').click();
    await page.waitForFunction(() => PNL.app.state().v === 'm0');
    await page.locator('#navEx').click();
    await page.waitForFunction(() => PNL.app.state().v === 'ex' && PNL.ex.state().rows);
    await close(page);
  }
});

check('F3a T017 · la barra con cinco pestañas: a 1280 px la cabecera cabe en una fila; a 360 px las pestañas pasan a tres filas como mucho sin desbordar', async () => {
  for (const lang of ['es', 'en']) {
    for (const hash of ['v=route&ex=ej6&step=0', 'v=work', 'v=m0&st=ej5', 'v=ex&sd=14844', 'v=unc&um=m5', 'v=unc&um=m6', 'v=moodle']) {
      const page = await lab(`${hash}&lang=${lang}`);
      const head = await page.evaluate(() => {
        const r = (el) => el.getBoundingClientRect();
        const tops = [document.querySelector('.brand'), document.querySelector('.tabs'), document.querySelector('.settings')].map((el) => Math.round(r(el).top + r(el).height / 2));
        return { h: r(document.querySelector('.site-head')).height, tops };
      });
      assert.ok(head.h <= 70, `${lang} ${hash}: la cabecera ocupa ${head.h} px`);
      assert.ok(Math.max(...head.tops) - Math.min(...head.tops) <= 12, `${lang} ${hash}: marca, pestañas y controles en una fila (${head.tops})`);
      await close(page);
    }
    const page = await lab(`v=ex&sd=14844&lang=${lang}`, { width: 360, height: 740 });
    const bar = await page.evaluate(() => {
      const links = [...document.querySelectorAll('.tabs a:not([hidden])')].map((a) => a.getBoundingClientRect());
      const lh = parseFloat(getComputedStyle(document.querySelector('.tabs a')).lineHeight) || 20;
      return { w: document.documentElement.scrollWidth, right: Math.max(...links.map((x) => x.right)), rows: new Set(links.map((x) => Math.round(x.top))).size,
        lines: links.map((x) => Math.round((x.height - 16) / lh)) };
    });
    assert.ok(bar.w <= 360 && bar.right <= 360, `${lang} 360 px: ${JSON.stringify(bar)}`);
    // F4a (T013): con cinco pestañas, a 360 px caben en tres filas como mucho (boceto de «Ajustes» aprobado); en inglés no caben en dos.
    assert.ok(bar.rows <= 3, `${lang} 360 px: ${bar.rows} filas de pestañas`);
    assert.ok(bar.lines.every((n) => n <= 1), `${lang} 360 px: alguna pestaña se parte (${bar.lines})`);
    await shot(page, `f3a-barra-360-${lang}`);
    await close(page);
  }
});

check('F3a T017 · AC17: la tarjeta «Ejercicios generados» de la portada está disponible y abre «Ejercicios» en el idioma elegido', async () => {
  const noJs = await open('index.html', { js: false });
  assert.equal(await noJs.locator('a[data-lab="ex"]').getAttribute('href'), 'cpm.html#v=ex&lang=es');
  await close(noJs);
  const portal = await open('index.html?lang=en');
  const card = portal.locator('article.module-card').filter({ has: portal.locator('a[data-lab="ex"]') });
  assert.match(await card.innerText(), /Generated exercises[\s\S]*Generate an exercise[\s\S]*Available/);
  await card.locator('a[data-lab="ex"]').click();
  await portal.waitForFunction(() => window.PNL && PNL.ex && PNL.ex.state && PNL.ex.state() && PNL.ex.state().rows);
  const s = await state(portal);
  assert.equal(s.lang, 'en');
  assert.ok(s.sd >= 1, 'la interfaz elige la semilla');
  assert.match(portal.url(), /[#&]sd=\d+/);
  await close(portal);
  for (const [scheme, width] of [['light', 1280], ['dark', 360]]) {
    const home = await open('index.html?lang=es', { scheme, width, height: 800 });
    assert.ok(await noHScroll(home), `portada a ${width} px`);
    await axe(home, `portada con «Ejercicios generados» disponible (${scheme}, ${width} px)`);
    await home.locator('a[data-lab="ex"]').scrollIntoViewIfNeeded();
    await shot(home, `f3a-portada-${scheme}-${width}`);
    await close(home);
  }
});

check('F3a T017 · AC11: «Tabla al azar» se ve en el taller sin activarla a mano, con su nivel, y el taller la resuelve', async () => {
  for (const lang of ['es', 'en']) {
    const page = await lab(`v=work&lang=${lang}`);
    assert.ok(await visible(page, '#workRandom'));
    assert.equal(await page.locator('#workRandom').innerText(), I0.t(lang, 'work.random'));
    assert.equal(await page.locator('#workRandLevel').inputValue(), 'medium');
    await page.locator('#workRandom').click();
    await page.waitForFunction(() => PNL.app.state().t && PNL.app.state().ex === null);
    const n = (await state(page)).t.length;
    assert.ok(n >= 9 && n <= 10, `nivel medio: ${n} actividades`);
    await axe(page, `taller con «Tabla al azar» (${lang})`);
    assert.equal(await page.evaluate(() => PNL.app.model().project.activities.length), n, 'el taller calcula la tabla al azar');
    assert.ok(await visible(page, '#stage'), 'con su red y su paso a paso debajo');
    await close(page);
  }
});

check('F3a T020 · un valor largo se corta en el campo y no borra lo escrito; diez caminos como mucho; un campo de camino vacío no cuenta; la semilla fuera de límites no se acepta; tras entregar, «Otro ejercicio» no pide confirmación', async () => {
  const s = { sd: 14844, lv: 'medium', lang: 'es' };
  const m = exModel(s);
  const page = await exLab(s);
  for (const [k, v] of [['A.ES', '0'], ['A.EF', '7'], ['B.ES', '3,3333333']]) { await exCell(page, k).click(); await page.keyboard.type(v); }
  await page.waitForFunction(() => { const a = PNL.app.state().ans; return a && a.act.B && a.act.B.ES === '3,333333'; });
  assert.equal(await exCell(page, 'B.ES').inputValue(), '3,333333', 'el campo no admite más de 8 caracteres');
  assert.deepEqual(await page.evaluate(() => [PNL.app.state().ans.act.A.ES, PNL.app.state().ans.act.A.EF]), ['0', '7']);
  assert.match(page.url(), /[#&]ans=/);
  // Caminos: 120 caracteres por campo y 10 campos como mucho.
  assert.equal(await page.locator('#exPath0').getAttribute('maxlength'), '120');
  for (let i = 1; i < 10; i++) await page.locator('#exAddPath').click();
  assert.equal(await page.locator('#exView .ex-path').count(), 10);
  assert.ok(await page.locator('#exAddPath').isDisabled(), '«Añadir camino» se desactiva con 10');
  // Un campo vacío delante de un camino escrito no lleva marca ni resta.
  await page.locator('#exPath1').click(); await page.keyboard.type('A-E-J');
  await page.waitForFunction(() => (PNL.app.state().ans.paths || []).length === 2);
  await page.locator('#exCheck').click();
  const pst = await page.locator('#exView .ex-pcell').evaluateAll((els) => els.slice(0, 2).map((e) => (/st-(\w+)/.exec(e.className) || [])[1] || null));
  const ans = await page.evaluate(() => PNL.app.state().ans);
  const a1 = X0.answersOf(Object.assign(exState0(s), { ans }));
  const g = GR0.grade(m.sol, Object.assign({}, a1, { paths: ['A-E-J'] }), U0.DEFAULT_ASK);
  assert.deepEqual(pst, [null, g.paths.written[0].state]);
  assert.equal(await exScore(page), X0.scoreText(g, 'es'));
  // La semilla fuera de 1–999 999 no se acepta y no pide confirmación.
  await page.locator('#exSeed').fill('1000000'); await page.locator('#exSeed').press('Tab');
  assert.equal(await page.locator('#exSeed').inputValue(), '14844');
  assert.equal(await page.locator('#exLoseYes').count(), 0);
  assert.equal((await exSt(page)).seed, 14844);
  await close(page);
  // Entregado el Examen, «Otro ejercicio» empieza otro sin pedir confirmación.
  const done = await exLab(Object.assign({ ans: X0.forUrl(exStudent(s)), xm: 'exam', xd: 1 }, s));
  await done.locator('#exAnother').click();
  await done.waitForFunction(() => PNL.ex.state().seed !== 14844);
  assert.equal(await done.locator('#exLoseYes').count(), 0);
  await close(done);
});

// ---------- F3b: exportador de Moodle (spec f3b-moodle; tableros 51–56) ----------

const mq = (page) => page.evaluate(() => PNL.moodlePage.state());
const mqOpen = async (lang, opts) => { const p = await lab(`v=moodle&lang=${lang}`, opts); await p.waitForFunction(() => PNL.moodlePage && PNL.moodlePage.state); return p; };
// Deja marcadas solo estas etapas y niveles (por su texto) y fija los ejemplares.
async function mqSelect(page, stages, levels, count) {
  const labels = await page.$$eval('#mqView .mq-check', (ls) => ls.map((l) => l.textContent));
  for (let i = 0; i < labels.length; i++) {
    const want = [...stages, ...levels].some((x) => labels[i].startsWith(x));
    const box = page.locator('#mqView .mq-check input').nth(i);
    if ((await box.isChecked()) !== want) await box.click();
  }
  if (count) { await page.locator('#mqCount').fill(String(count)); await page.locator('#mqCount').press('Tab'); }
}

check('F3b AC8 · v=moodle: título, resumen y vista previa igual al modelo del núcleo, en ES y EN', async () => {
  // F3d (T014): con las etapas 7 a 10 publicadas, once categorías sin la 0.
  for (const [lang, sum, h1] of [['es', 'Se generarán 110 preguntas en 11 categorías.', 'Bancos de preguntas para Moodle'], ['en', '110 questions will be generated in 11 categories.', 'Question banks for Moodle']]) {
    const page = await mqOpen(lang);
    assert.equal(await page.locator('#mqView h1').textContent(), h1);
    // F3c (T013): la etapa 0 va marcada al abrir; sin ella, las siete etapas de la F3b como antes.
    await page.locator('#mqView .mq-stages .mq-check input').first().click();
    assert.equal(await page.locator('.mq-summary').textContent(), sum);
    const st = await mq(page);
    assert.equal(st.preview.stage, 'early'); assert.equal(st.preview.level, 'medium'); assert.equal(st.preview.seed, 1);
    assert.equal(await page.locator('.mq-qname').textContent(), st.preview.name);
    assert.equal(await page.locator('.mq-preview input.mq-hole').count(), Object.keys(st.preview.answers).length);
    assert.equal(await page.locator('#stage').isVisible(), false);
    assert.equal(await page.locator('#selBox').evaluate((s) => s.closest('label').hidden), true);   // F4a (T013): el selector va en «Ajustes»
    await close(page);
  }
});

check('F3b · la vista previa no recorta sus tablas aunque el recuadro se desplace (4b con la retroalimentación abierta)', async () => {
  const page = await mqOpen('es');
  await mqSelect(page, ['4b ·'], ['Difícil']);
  await page.locator('.mq-feedback summary').click();
  assert.equal(await page.locator('.mq-preview tbody tr').count(), (await mq(page)).preview.n);
  assert.ok(await page.$$eval('.mq-tables', (ds) => ds.every((d) => d.scrollHeight <= d.clientHeight + 1)), 'tablas recortadas');
  await close(page);
});

check('F3b AC9 · descarga: un banco bien formado con el evento download, y el estado lo resume', async () => {
  const page = await mqOpen('es');
  await mqSelect(page, ['1 ·', '6 ·'], ['Fácil'], 2);
  assert.equal(await page.locator('.mq-summary').textContent(), 'Se generarán 4 preguntas en 2 categorías.');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.locator('#mqDownload').click()]);
  assert.match(dl.suggestedFilename(), /^banco-redes-\d{4}-\d{2}-\d{2}-s\d+\.xml$/);
  const xml = fs.readFileSync(await dl.path(), 'utf8');
  assert.ok(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>'));
  assert.equal((xml.match(/<question type="cloze">/g) || []).length, 4);
  assert.ok(xml.includes('$course$/top/Redes de proyectos/1 · Tiempos tempranos/Fácil'));
  assert.ok(xml.includes('$course$/top/Redes de proyectos/6 · Sucesos: tiempos tardíos y holguras/Fácil'));
  assert.deepEqual(require('../xml-check.js').check(xml), { ok: true });
  await page.waitForFunction(() => /Descargado banco-redes-/.test(document.querySelector('.mq-status').textContent));
  const st = await mq(page);
  assert.equal(st.last.questions, 4); assert.equal(st.running, false);
  assert.equal(await page.evaluate(() => document.activeElement.id), 'mqDownload');
  await close(page);
});

check('F3b AC9 · un banco grande no bloquea la página: avanza la barra y «Cancelar» lo detiene sin descargar', async () => {
  const page = await mqOpen('en', { scheme: 'dark' });
  await mqSelect(page, ['1 ·', '2 ·', '3 ·', '4a ·', '4b ·', '5 ·', '6 ·'], ['Easy', 'Medium', 'Hard'], 50);
  let downloaded = false; page.on('download', () => { downloaded = true; });
  await page.locator('#mqDownload').click();
  await page.waitForFunction(() => { const p = document.querySelector('#mqProgress'); return p && p.value > 0; });
  assert.equal(await page.evaluate(() => document.activeElement.id), 'mqCancel');
  assert.equal((await mq(page)).total, 1050);
  await axe(page, 'F3b · generando (EN, oscuro)');
  await page.locator('#mqCancel').click();
  await page.waitForFunction(() => /cancelled/.test(document.querySelector('.mq-status').textContent));
  const st = await mq(page);
  assert.equal(st.running, false); assert.ok(st.made < 1050);
  assert.equal(downloaded, false);
  await close(page);
});

check('F3b AC12 · axe sin violaciones en claro y oscuro, ES y EN; sin desplazamiento horizontal a 1280 y 360 px', async () => {
  for (const [lang, scheme, width] of [['es', 'light', 1280], ['en', 'dark', 1280], ['es', 'dark', 360], ['en', 'light', 360]]) {
    const page = await mqOpen(lang, { scheme, width, height: width === 360 ? 800 : 720 });
    await axe(page, `F3b · exportador (${lang}, ${scheme}, ${width} px)`);
    await page.locator('.mq-feedback summary').click();
    await axe(page, `F3b · retroalimentación abierta (${lang}, ${scheme}, ${width} px)`);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `${lang} ${width}`);
    await close(page);
  }
});

check('F3b · «Cómo usarlo en Moodle» y la nota de la semilla, plegados bajo el formulario (ES y EN)', async () => {
  for (const [lang, title, first] of [['es', 'Cómo usarlo en Moodle', 'En el curso: Banco de preguntas'], ['en', 'How to use it in Moodle', 'In the course: Question bank']]) {
    const page = await mqOpen(lang);
    assert.equal(await page.locator('.mq-how summary').textContent(), title);
    assert.equal(await page.locator('.mq-how ol li').first().isVisible(), false);
    await page.locator('.mq-how summary').click();
    assert.equal(await page.locator('.mq-how ol li').count(), 4);
    assert.ok((await page.locator('.mq-how ol li').first().textContent()).startsWith(first));
    assert.ok(/semilla|seed/.test(await page.locator('.mq-how p').textContent()));
    await axe(page, `F3b · «Cómo usarlo en Moodle» abierto (${lang})`);
    await close(page);
  }
});

check('F3b AC13 · entradas: la tarjeta de la portada y el «Aprende más» de «Ejercicios» abren el exportador en el idioma elegido', async () => {
  for (const lang of ['es', 'en']) {
    const home = await open(`index.html?lang=${lang}`);
    const card = home.locator('a[data-lab="moodle"]');
    assert.equal(await card.getAttribute('href'), `cpm.html#v=moodle&lang=${lang}`);
    await card.click();
    await home.waitForFunction(() => window.PNL && PNL.moodlePage && PNL.moodlePage.state);
    assert.equal((await state(home)).v, 'moodle'); assert.equal((await state(home)).lang, lang);
    await close(home);
  }
  const page = await lab(exUrl({ sd: 14844 }).replace('cpm.html#', ''));
  assert.equal(await page.locator('#exMoodle').count(), 0, 'sin enlace en la barra (no cabe en 1280×720; decisión del autor)');
  await page.locator('#exLearn').click();
  await page.locator('#exLearnMoodle').click();
  await page.waitForFunction(() => PNL.app.state().v === 'moodle');
  assert.equal(await page.locator('#learnDialog').evaluate((d) => d.open), false);
  await close(page);
});

check('F3b AC8 · cambiar la notación rehace la vista previa y conserva la selección', async () => {
  const page = await mqOpen('es');
  await mqSelect(page, ['3 ·'], ['Difícil'], 7);
  await setCtl(page, '#selNota', 'es');
  await page.waitForFunction(() => [...document.querySelectorAll('.mq-preview th')].some((th) => th.textContent === 'HT'));
  const st = await mq(page);
  assert.deepEqual(st.sel.stages, ['floats']); assert.deepEqual(st.sel.levels, ['hard']); assert.equal(st.sel.count, 7);
  assert.equal(await page.locator('.mq-summary').textContent(), 'Se generarán 7 preguntas en una categoría.');
  await close(page);
});

// ---------- F3b · revisión de nivel 2 (T016) ----------

const mqDownload = async (page) => {
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 15000 }), page.locator('#mqDownload').click()]);
  return { name: dl.suggestedFilename(), xml: fs.readFileSync(await dl.path(), 'utf8') };
};

check('F3b T016 · tras editar los ejemplares, el primer clic en «Descargar» descarga; marcar una casilla no pierde el foco', async () => {
  const page = await mqOpen('es');
  await mqSelect(page, ['1 ·'], ['Fácil']);
  // Sin salir del campo: el clic (con su mousedown y mouseup) es lo que dispara el cambio.
  await page.locator('#mqCount').fill('2');
  // F3d (T014): con doce etapas, desmarcar las de abajo desplaza la página; se trae el botón a la vista sin mover el foco.
  await page.locator('#mqDownload').evaluate((el) => el.scrollIntoView({ block: 'center' }));
  assert.equal(await page.evaluate(() => document.activeElement.id), 'mqCount', 'el foco sigue en el campo');
  const box = await page.locator('#mqDownload').boundingBox();
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 5000 }),
    page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)]);
  assert.match(dl.suggestedFilename(), /^banco-redes-/);
  assert.equal((await mq(page)).last.questions, 2);
  // Teclado: Espacio en una casilla deja el foco en ella y Tab sigue el orden del formulario (F3c, T013: la de la etapa 1
  // es la segunda, tras la de la etapa 0).
  const first = page.locator('#mqView .mq-check input').nth(1);
  await first.focus();
  await page.keyboard.press('Space');
  assert.equal(await first.isChecked(), false);
  assert.ok(await first.evaluate((el) => el === document.activeElement), 'el foco sigue en la casilla');
  await page.keyboard.press('Tab');
  assert.ok(await page.locator('#mqView .mq-check input').nth(2).evaluate((el) => el === document.activeElement), 'Tab va a la casilla siguiente');
  await page.locator('#mqCount').fill('3');
  await page.keyboard.press('Tab');
  assert.notEqual(await page.evaluate(() => document.activeElement.tagName), 'BODY');
  assert.equal(await page.locator('#mqCount').inputValue(), '3');
  await close(page);
});

check('F3b T016 · ejemplares acotados de 1 a 50 y botón desactivado sin selección', async () => {
  const page = await mqOpen('es');
  await mqSelect(page, ['1 ·'], ['Fácil']);
  for (const [typed, want] of [['500', '50'], ['0', '1'], ['', '1'], ['7.6', '8']]) {
    await page.locator('#mqCount').fill(typed);
    await page.locator('#mqCount').press('Tab');
    assert.equal(await page.locator('#mqCount').inputValue(), want, typed);
    assert.equal((await mq(page)).sel.count, Number(want));
  }
  assert.equal(await page.locator('.mq-summary').textContent(), 'Se generarán 8 preguntas en una categoría.');
  await page.locator('#mqView .mq-check input').nth(1).click();
  assert.equal(await page.locator('.mq-summary').textContent(), 'Elige al menos una etapa y un nivel.');
  assert.equal(await page.locator('#mqDownload').isDisabled(), true);
  await close(page);
});

check('F3b T016 AC3 y AC8 · el banco descargado va en el idioma y la notación de la página, con la holgura de seguridad marcada', async () => {
  const page = await mqOpen('en');
  await setCtl(page, '#selNota', 'es');
  await mqSelect(page, ['3 ·'], ['Easy'], 1);
  await page.locator('#mqView .mq-check', { hasText: 'safety float' }).locator('input').check();
  assert.ok((await mq(page)).sel.sf);
  assert.ok(await page.locator('.mq-preview th', { hasText: /^HS$/ }).count() > 0, 'vista previa con la holgura de seguridad');
  const { name, xml } = await mqDownload(page);
  assert.match(name, /^network-bank-/);
  assert.ok(xml.includes('$course$/top/Project networks/3 · Floats/Easy'));
  assert.ok(xml.includes('safety float') && !xml.includes('Holgura'));
  assert.ok(xml.includes('>Open this exercise in the lab</a>') && !xml.includes('Abrir este ejercicio'));
  for (const h of ['tᵢ', 'fᵢ', 'tᵢ*', 'fᵢ*', 'HT', 'HL', 'HI', 'HS']) assert.ok(xml.includes(`<th scope="col">${h}</th>`), h);
  const n = Number(/ · n=(\d+) · /.exec(xml)[1]);
  assert.equal((xml.match(/\{1:NUMERICAL:/g) || []).length, 4 * n);
  await close(page);
});

check('F3b T016 · cada descarga usa una semilla nueva, la misma en el archivo, el XML y el estado', async () => {
  const page = await mqOpen('es');
  await mqSelect(page, ['1 ·'], ['Fácil'], 1);
  const seeds = [];
  for (let i = 0; i < 2; i++) {
    const { name, xml } = await mqDownload(page);
    const seed = Number(/-s(\d+)\.xml$/.exec(name)[1]);
    assert.equal((await mq(page)).last.seed, seed);
    assert.ok(xml.split('\n')[1].includes(`s=${seed} `));
    await page.waitForFunction((s) => document.querySelector('.mq-status').textContent.includes(`semilla del banco ${s}`), seed);
    seeds.push(seed);
  }
  assert.notEqual(seeds[0], seeds[1]);
  await close(page);
});

check('F3b T016 AC10 · el estado dice qué categorías se quedan cortas y sigue el idioma de la página', async () => {
  const page = await mqOpen('es');
  await mqSelect(page, ['1 ·'], ['Fácil', 'Media'], 5);
  // Solo tres semillas posibles por nivel: cada categoría se queda en 3 de 5 (como un descarte real, sin esperar a él).
  await page.evaluate(() => { const orig = PNL.moodle.runner; PNL.moodle.runner = (o, tr) => orig(Object.assign({}, o, { seedMax: 3 }), tr); });
  const { xml } = await mqDownload(page);
  assert.equal((xml.match(/<question type="cloze">/g) || []).length, 6);
  await page.waitForFunction(() => /^Descargado/.test(document.querySelector('.mq-status').textContent));
  assert.match(await page.locator('.mq-status').textContent(),
    /: 6 preguntas, semilla del banco \d+\. No se han encontrado bastantes ejemplares distintos para: 1 · Tiempos tempranos, Fácil \(3 de 5\); 1 · Tiempos tempranos, Media \(3 de 5\)\.$/);
  await setCtl(page, '#selLang', 'en');
  await page.waitForFunction(() => /^Downloaded banco-redes-/.test(document.querySelector('.mq-status').textContent));
  assert.match(await page.locator('.mq-status').textContent(),
    /: 6 questions, bank seed \d+\. Not enough distinct instances were found for: 1 · Early times, Easy \(3 of 5\); 1 · Early times, Medium \(3 of 5\)\.$/);
  await close(page);
});

// Un banco grande en marcha (1050 preguntas), con la barra ya avanzando.
async function mqBig(page, levels) {
  await mqSelect(page, ['1 ·', '2 ·', '3 ·', '4a ·', '4b ·', '5 ·', '6 ·'], levels, 50);
  await page.locator('#mqDownload').click();
  await page.waitForFunction(() => { const p = document.querySelector('#mqProgress'); return p && p.value > 0; });
}

check('F3b T016 AC9 · mientras genera, la página atiende en menos de medio segundo', async () => {
  const page = await mqOpen('es');
  await mqBig(page, ['Fácil', 'Media', 'Difícil']);
  const worst = await page.evaluate(async () => {
    let max = 0;
    for (let i = 0; i < 20; i++) {
      const t0 = performance.now();
      await new Promise((r) => setTimeout(r, 0));
      max = Math.max(max, performance.now() - t0);
    }
    return max;
  });
  assert.ok((await mq(page)).running, 'sigue generando');
  assert.ok(worst < 500, `espera máxima ${worst.toFixed(0)} ms`);
  await page.locator('#mqCancel').click();
  await close(page);
});

check('F3b T016 · cambiar de idioma o salir de la vista mientras se genera la cancela, sin descargar', async () => {
  const page = await mqOpen('es');
  let downloaded = false; page.on('download', () => { downloaded = true; });
  await mqBig(page, ['Fácil', 'Media', 'Difícil']);
  await setCtl(page, '#selLang', 'en');
  await page.waitForFunction(() => document.querySelector('.mq-status').textContent === 'Generation cancelled: nothing was downloaded.');
  assert.equal((await mq(page)).running, false);
  // Salir a la ruta guiada con un banco en marcha: la vista se oculta, la caja del nodo vuelve y nada se descarga.
  await mqBig(page, ['Easy', 'Medium', 'Hard']);
  await page.locator('#navRoute').click();
  await page.waitForFunction(() => PNL.app.state().v === 'route');
  assert.equal(await page.locator('#mqView').isVisible(), false);
  assert.equal(await page.locator('#selBox').evaluate((s) => s.closest('label').hidden), false);
  assert.equal((await mq(page)).running, false);
  await page.waitForTimeout(1500);
  assert.equal(downloaded, false);
  await page.goBack();
  await page.waitForFunction(() => PNL.app.state().v === 'moodle');
  assert.equal(await page.locator('.mq-status').textContent(), 'Generation cancelled: nothing was downloaded.');
  assert.ok(await page.locator('#mqDownload').isEnabled());
  await close(page);
});

check('F3b T016 AC13 · el «Aprende más» de «Ejercicios» en inglés abre el exportador en inglés y con la notación elegida', async () => {
  const page = await lab(exUrl({ sd: 14844, lang: 'en' }).replace('cpm.html#', ''));
  await setCtl(page, '#selNota', 'es');
  await page.locator('#exLearn').click();
  await page.locator('#exLearnMoodle').click();
  await page.waitForFunction(() => PNL.app.state().v === 'moodle' && PNL.moodlePage && PNL.moodlePage.state);
  const s = await state(page);
  assert.equal(s.lang, 'en'); assert.equal(s.nota, 'es');
  assert.equal(await page.locator('#mqView h1').textContent(), 'Question banks for Moodle');
  // F3c (T013): la vista previa es la de la etapa 0; sin ella, la de la etapa 1 con la notación española.
  await page.locator('#mqView .mq-stages .mq-check input').first().click();
  assert.ok(await page.locator('.mq-preview th', { hasText: /^tᵢ$/ }).count() > 0);
  await close(page);
});

// ---------- F3c, T009: enunciado al azar en M0 (spec f3c-enunciados, AC7, AC8, AC12 y AC13; plan §4, P5 y P12) ----------

const genUrl = (s) => m0Url(Object.assign({ st: 'gen', sd: 15, lv: 'medium', sv: 2 }, s));
// El enunciado y su referencia, del núcleo cargado en la página.
const genDef = (page) => page.evaluate(() => { const s = PNL.app.state(); return PNL.stmtgen.make(s.sd, s.lv, s.cx ? { ctx: s.cx } : {}).def; });
const genFrags = (page, lang) => page.evaluate((l) => { const s = PNL.app.state(); const d = PNL.stmtgen.make(s.sd, s.lv, s.cx ? { ctx: s.cx } : {}).def; return Object.fromEntries(PNL.statement.build(d, l).frags.map((f) => [f.id, { from: f.from, to: f.to }])); }, lang);
const loaded = (page, re) => page.evaluate((src) => performance.getEntriesByType('resource').some((e) => new RegExp(src).test(e.name)), re.source);

check('F3c AC7 · M0 con un enunciado al azar: el texto es el de stmtgen; nivel, contexto y «Otro enunciado» lo cambian, con confirmación si hay trabajo', async () => {
  const p = await open(genUrl());
  await p.waitForFunction(() => PNL.m0.state && PNL.m0.state().gen);
  const def = await genDef(p);
  const text = await p.locator('#m0View .m0-textbody').innerText();
  assert.ok(text.includes(def.text.es[0]), 'la entradilla del contexto');
  assert.equal(await p.locator('#m0St').inputValue(), 'gen');
  assert.ok(await p.locator('#m0View .m0-gen').isVisible());
  assert.match(await p.locator('#m0TextHead').innerText(), new RegExp(def.title.es));
  assert.match(await p.locator('#m0Drawn').innerText(), new RegExp(def.title.es));
  assert.equal(await p.locator('#m0Lv-medium').getAttribute('aria-pressed'), 'true');
  // Nivel: misma semilla, otra tabla.
  await p.locator('#m0Lv-hard').click();
  await p.waitForFunction(() => PNL.app.state().lv === 'hard');
  let s = await state(p);
  assert.deepEqual([s.st, s.sd, s.lv, s.sv], ['gen', 15, 'hard', 2]);
  assert.match(await p.evaluate(() => location.hash), /lv=hard/);
  // Contexto elegido: deja de decir lo que ha salido.
  await p.selectOption('#m0Cx', 'lab');
  await p.waitForFunction(() => PNL.app.state().cx === 'lab');
  assert.ok(await p.locator('#m0Drawn').isHidden());
  assert.match(await p.locator('#m0TextHead').innerText(), /Mudar un laboratorio/);
  // Con trabajo hecho, «Otro enunciado» pregunta; «Cancelar» no cambia nada y «Sí, cambiar» da otro enunciado vacío.
  const fr = await genFrags(p, 'es');
  await underline(p, fr.aA.from, fr.aA.to, { kind: 'activity' });
  const key = (await m0st(p)).stKey;
  await p.locator('#m0Another').click();
  await p.locator('#m0LoseYes').waitFor();
  await p.locator('#m0LoseNo').click();
  assert.equal((await m0st(p)).stKey, key);
  assert.equal((await m0st(p)).rows.length, 1);
  await p.locator('#m0Another').click();
  await p.locator('#m0LoseYes').click();
  await p.waitForFunction((k) => PNL.m0.state().stKey !== k, key);
  s = await state(p);
  assert.deepEqual([s.st, s.lv, s.cx, s.t, s.mk], ['gen', 'hard', 'lab', null, null]);
  // «Atrás» vuelve al enunciado anterior.
  await p.goBack();
  await p.waitForFunction((k) => PNL.m0.state().stKey === k || PNL.app.state().sd === 15, key);
  await close(p);
});

check('F3c AC7 · con un enunciado al azar, «Comprobar» y la ruta paso a paso funcionan en ES y EN, y el cambio de idioma mueve los subrayados', async () => {
  for (const lang of ['es', 'en']) {
    const probe = await open(genUrl({ lang }));
    await probe.waitForFunction(() => PNL.m0.state && PNL.m0.state().gen);
    const def = await genDef(probe);
    await close(probe);
    const ref = def.ref.rows.map((r) => ({ id: r.id, name: r.name[lang], duration: r.duration, links: r.links }));
    // La tabla de referencia: sin errores.
    const ok = await open(genUrl({ lang, t: ref }));
    await ok.waitForFunction(() => PNL.m0.state && PNL.m0.state().gen);
    let d = await m0Check(ok);
    assert.equal(d.ok, true, `${lang}: ${JSON.stringify(d.items)}`);
    // Sin la última precedencia: falta.
    const cut = ref.map((r) => Object.assign({}, r));
    const last = cut.filter((r) => r.links).pop();
    last.links = last.links.split(', ').slice(1).join(', ');
    await close(ok);
    const bad = await open(genUrl({ lang, t: cut }));
    await bad.waitForFunction(() => PNL.m0.state && PNL.m0.state().gen);
    d = await m0Check(bad);
    assert.deepEqual(d.items.map((x) => x.code), ['missingPrecedence'], `${lang}: falta una precedencia`);
    await close(bad);
    // Ruta paso a paso hasta el final: la tabla depurada es la referencia.
    const route = await open(genUrl({ lang, mm: 'route' }));
    await route.waitForFunction(() => PNL.m0.state && PNL.m0.state().gen);
    const n = await route.evaluate(() => PNL.app.model().m0 && PNL.statement.route(PNL.statement.build(PNL.app.model().def, PNL.app.state().lang)).length);
    assert.ok(n > 5);
    await route.evaluate((k) => PNL.app.go(k), n - 1);
    assert.ok(await route.locator('#m0View .m0-step').isVisible());
    await close(route);
  }
  // Cambio de idioma con un subrayado.
  const p = await open(genUrl());
  await p.waitForFunction(() => PNL.m0.state && PNL.m0.state().gen);
  const es = await genFrags(p, 'es');
  await underline(p, es.aB.from, es.aB.to, { kind: 'activity' });
  await setCtl(p, '#selLang', 'en');
  await p.waitForFunction(() => PNL.app.state().lang === 'en');
  const en = await genFrags(p, 'en');
  const mk = (await m0st(p)).marks;
  assert.deepEqual([mk.length, mk[0].from, mk[0].to], [1, en.aB.from, en.aB.to]);
  assert.equal(await p.locator('#m0Another').innerText(), 'Another statement');
  await close(p);
});

check('F3c AC8 · el enlace de un enunciado al azar se abre igual en otra página; otra versión avisa; sin semilla, se elige una', async () => {
  const a = await open(genUrl({ sd: 777, lv: 'easy', cx: 'product' }));
  await a.waitForFunction(() => PNL.m0.state && PNL.m0.state().gen);
  const ta = await a.locator('#m0View .m0-textbody').innerText();
  const href = await a.evaluate(() => location.hash);
  await close(a);
  const b = await open(`cpm.html${href}`);
  await b.waitForFunction(() => PNL.m0.state && PNL.m0.state().gen);
  assert.equal(await b.locator('#m0View .m0-textbody').innerText(), ta);
  assert.ok(await b.locator('#m0GenOld').isHidden());
  await close(b);
  const old = await open(genUrl({ sv: 1 }));
  await old.waitForFunction(() => PNL.m0.state && PNL.m0.state().gen);
  assert.ok(await old.locator('#m0GenOld').isVisible());
  assert.match(await old.locator('#m0GenOld').innerText(), /otra versión del generador de enunciados/);
  await close(old);
  const none = await lab('v=m0&st=gen&lang=es');
  await none.waitForFunction(() => PNL.m0.state && PNL.m0.state().gen);
  const s = await state(none);
  assert.ok(Number.isInteger(s.sd) && s.sd >= 1 && s.sv === 2);
  assert.match(await none.evaluate(() => location.hash), /sd=\d+.*sv=2/);
  await close(none);
});

check('F3c P12 y T013 · M0 con un enunciado al azar no carga statements.js, ni con uno de la lista stmtgen.js; el selector ofrece «Enunciado al azar»', async () => {
  const g = await open(genUrl());
  await g.waitForFunction(() => PNL.m0.state && PNL.m0.state().gen);
  assert.equal(await loaded(g, /statements\.js/), false, 'statements.js con st=gen');
  assert.equal(await loaded(g, /statements-index\.js/), true);
  // De un enunciado al azar a uno de la lista: se pide statements.js y se abre.
  await g.selectOption('#m0St', 'ej2');
  await g.waitForFunction(() => PNL.m0.state().st === 'ej2');
  assert.ok(await g.locator('#m0View .m0-gen').isHidden());
  assert.equal(await loaded(g, /statements\.js/), true);
  await close(g);
  const e = await m0Lab();
  assert.equal(await loaded(e, /stmtgen\.js|contexts\.js/), false, 'el generador con st=ej5');
  assert.deepEqual(await e.locator('#m0St option').evaluateAll((os) => os.filter((o) => o.value === 'gen').map((o) => o.textContent)), ['Enunciado al azar']);
  // Elegirlo abre un enunciado al azar de nivel medio y pide el generador.
  await e.selectOption('#m0St', 'gen');
  await e.waitForFunction(() => PNL.m0.state && PNL.m0.state().gen);
  const s = await state(e);
  assert.deepEqual([s.st, s.lv, s.sv], ['gen', 'medium', 2]);
  assert.equal(await loaded(e, /stmtgen\.js/), true);
  await close(e);
});

check('F3c AC12 · M0 con un enunciado al azar: axe sin violaciones en claro y oscuro, ES y EN; a 360 px sin desplazamiento horizontal', async () => {
  for (const [lang, scheme] of [['es', 'light'], ['en', 'dark']]) {
    const p = await open(genUrl({ lang, lv: 'hard', sd: 22, cx: 'lab' }), { scheme });
    await p.waitForFunction(() => PNL.m0.state && PNL.m0.state().gen);
    await axe(p, `M0 enunciado al azar (${lang}, ${scheme})`);
    await close(p);
  }
  const m = await open(genUrl({ lv: 'easy', sd: 4 }), { width: 360, height: 800 });
  await m.waitForFunction(() => PNL.m0.state && PNL.m0.state().gen);
  assert.ok(await m.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'sin desbordar a 360 px');
  await close(m);
});

// ---------- F3c, T010: el proyecto como enunciado en «Ejercicios» (spec f3c-enunciados, AC9, AC12 y AC13; plan §4, P5 y P8) ----------

const exText = (page) => page.waitForFunction(() => PNL.ex && PNL.ex.state && PNL.ex.state().text);

check('F3c AC9 · «Ejercicios» con el proyecto como enunciado: el texto de esa tabla, «Ver la tabla» y la red plegadas, la misma corrección; quitarlo no borra nada', async () => {
  for (const xm of ['practice', 'exam']) {
    const s = { sd: 14844, lv: 'medium', xt: 1, xm, ans: exStudent({ sd: 14844, lv: 'medium' }, { 'D.ES': 8 }) };
    const p = await exLab(s);
    await exText(p);
    const def = await p.evaluate(() => PNL.stmtgen.make(14844, 'medium').def);
    assert.match(await p.locator('#exTextHead').innerText(), new RegExp(def.title.es));
    assert.ok((await p.locator('#exView .ex-text-body').innerText()).includes(def.text.es[0]));
    assert.equal(await p.locator('#exView .ex-showtable').evaluate((d) => d.open), false, 'la tabla, plegada');
    assert.ok(await p.locator('#exView .ex-showtable .ex-given-card').isHidden());
    assert.equal(await p.locator('#exFold').getAttribute('aria-expanded'), 'false', 'la red, plegada');
    // «Ver la tabla» la abre en la página (no va al enlace).
    await p.locator('#exView .ex-showtable summary').click();
    assert.ok(await p.locator('#exView .ex-showtable .ex-given-card').isVisible());
    if (xm === 'practice') {
      await p.locator('#exCheck').click();
      const g = (await exSt(p)).grading;
      const ref = await p.evaluate(() => { const st = PNL.app.state(); const m = PNL.ex.model(Object.assign({}, st, { xt: 0 }), 'es'); return PNL.grade.grade(m.sol, m.ans, m.ask).score; });
      assert.deepEqual(g.score, ref, 'la corrección no cambia');
    }
    // Quitar el enunciado: vuelve la tabla y las respuestas siguen.
    const before = (await exSt(p)).ans;
    await p.locator('#exText').uncheck();
    await p.waitForFunction(() => PNL.app.state().xt === 0);
    assert.deepEqual((await exSt(p)).ans, before);
    assert.ok(await p.locator('#exView .ex-given-card').first().isVisible());
    assert.ok(await p.locator('#exView .ex-text-card').count() === 0);
    assert.equal(await p.locator('#exText').isChecked(), false, 'la casilla sigue, desmarcada (T013)');
    await close(p);
  }
});

check('F3c P8 y T013 · «Ejercicios» ofrece el enunciado (marcarlo lo pone); con «Personalizar», la casilla está desactivada y lleva su nota', async () => {
  const p = await exLab({ sd: 14844, lv: 'medium' });
  assert.equal(await p.locator('#exText').isChecked(), false);
  await p.locator('#exText').check();
  await p.waitForFunction(() => PNL.app.state().xt === 1);
  await exText(p);
  assert.equal(await loaded(p, /stmtgen\.js/), true);
  await close(p);
  const c = await exLab({ sd: 14844, lv: 'custom', gp: { n: [12, 16], pred: 2, dummies: [3, 5], critical: [2, 3], dmax: 15 } });
  await setCtl(c, '#selLang', 'en');
  await c.waitForFunction(() => document.getElementById('exText'));
  assert.equal(await c.locator('#exText').isDisabled(), true);
  assert.match(await c.locator('#exTextOff').innerText(), /Customise/);
  assert.equal(await c.locator('#exText').getAttribute('aria-describedby'), 'exTextOff');
  await close(c);
});

check('F3c P5 · «Ejercicios» solo carga el generador de enunciados con el enunciado; axe sin violaciones en claro y oscuro; a 360 px sin desplazamiento horizontal', async () => {
  const plain = await exLab({ sd: 14844, lv: 'medium' });
  assert.equal(await loaded(plain, /stmtgen\.js|contexts\.js/), false);
  await close(plain);
  for (const [lang, scheme] of [['es', 'light'], ['en', 'dark']]) {
    const p = await exLab({ sd: 92846, lv: 'hard', xt: 1, lang }, { scheme });
    await exText(p);
    assert.equal(await loaded(p, /stmtgen\.js/), true);
    await p.locator('#exView .ex-showtable summary').click();
    await axe(p, `Ejercicios con enunciado (${lang}, ${scheme})`);
    await close(p);
  }
  const m = await exLab({ sd: 39595, lv: 'easy', xt: 1 }, { width: 360, height: 800 });
  await exText(m);
  assert.ok(await m.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'sin desbordar a 360 px');
  await close(m);
});

// ---------- F3c, T011: la etapa «0 · Enunciado → tabla» en el exportador (spec f3c-enunciados, AC10, AC12 y AC13; plan §4, P5 y P6; tablero 62) ----------

// Publicada en T013: la etapa 0 es la primera marcada al abrir, y su pregunta, la de la vista previa.
async function mqStmt(lang, opts) {
  const p = await mqOpen(lang, opts);
  await p.waitForFunction(() => { const q = PNL.moodlePage.state().preview; return q && q.stage === 'stmt'; });
  return p;
}
const xmlOf = async (dl) => fs.readFileSync(await dl.path(), 'utf8');

check('F3c P6 · sin publicar (stmtPublic falso, y sin las etapas de la F3d), el exportador no ofrece la etapa 0 ni la mete en el banco; el banco carga el generador de enunciados', async () => {
  const p = await mqOpen('en');
  // F3d (T014): sin las etapas 7 a 10, para seguir probando solo las siete de la F3b.
  await p.evaluate(() => { PNL.moodlePage.stmtPublic = false; PNL.moodlePage.f3dPublic = false; });
  await setCtl(p, '#selLang', 'es');
  await p.waitForFunction(() => PNL.moodlePage.state().preview.stage === 'early');
  const labels = await p.$$eval('#mqView .mq-stages .mq-check', (ls) => ls.map((l) => l.textContent));
  assert.equal(labels.length, 7);
  assert.ok(labels[0].startsWith('1 ·'));
  const st = await mq(p);
  assert.deepEqual(st.sel.stages, ['early', 'late', 'floats', 'critAct', 'critPath', 'evEarly', 'evLate']);
  assert.equal(st.preview.stage, 'early');
  assert.equal(await loaded(p, /stmtgen\.js/), true);
  await p.locator('#mqCount').fill('1'); await p.locator('#mqCount').press('Tab');
  const [dl] = await Promise.all([p.waitForEvent('download'), p.locator('#mqDownload').click()]);
  const xml = await xmlOf(dl);
  assert.equal((xml.match(/<question type="cloze">/g) || []).length + (xml.match(/<question type="multichoice">/g) || []).length, 7);
  assert.ok(!xml.includes('MULTIRESPONSE_H') && !xml.includes('Enunciado → tabla'));
  await close(p);
});

check('F3c AC10 · con la etapa 0 publicada: la primera y marcada; la vista previa es su pregunta, con la cita del enunciado y las casillas desactivadas (ES y EN)', async () => {
  for (const [lang, first, sum, none, links] of [
    ['es', '0 · Enunciado → tabla', 'Se generarán 120 preguntas en 12 categorías.', 'ninguna', ['Abrir este enunciado en el laboratorio', 'Ver la ruta paso a paso del enunciado']],
    ['en', '0 · Statement → table', '120 questions will be generated in 12 categories.', 'none', ['Open this statement in the lab', 'See the step-by-step route of the statement']]]) {
    const p = await mqStmt(lang);
    const box = p.locator('#mqView .mq-stages .mq-check').first();
    assert.equal(await box.textContent(), first);
    assert.equal(await box.locator('input').isChecked(), true);
    assert.equal(await p.locator('.mq-summary').textContent(), sum);
    const q = (await mq(p)).preview;
    assert.deepEqual([q.stage, q.level, q.seed], ['stmt', 'medium', 1]);
    assert.equal(await p.locator('.mq-qname').textContent(), q.name);
    assert.deepEqual(await p.$$eval('.mq-preview blockquote p', (ps) => ps.map((x) => x.textContent)), q.text.find((b) => b.quote).quote);
    // Una fila de casillas por actividad: las demás actividades y «ninguna», todas desactivadas.
    assert.equal(await p.locator('.mq-preview .mq-mr').count(), q.n);
    assert.equal(await p.locator('.mq-preview .mq-mr input[type="checkbox"]').count(), q.n * q.n);
    assert.equal(await p.locator('.mq-preview .mq-mr input:not([disabled])').count(), 0);
    assert.deepEqual(await p.$$eval('.mq-preview .mq-mr', (ms) => ms.map((m) => m.lastElementChild.textContent.trim())), Array(q.n).fill(none));
    // Los enlaces de la retroalimentación son los del modelo: el enunciado en M0 y su ruta.
    assert.deepEqual(await p.$$eval('.mq-feedback a', (as) => as.map((a) => [a.getAttribute('href'), a.textContent])), [[q.links.ex, links[0]], [q.links.step, links[1]]]);
    await close(p);
  }
});

check('F3c AC10 · el enlace de la vista previa abre en M0 el mismo enunciado de la pregunta', async () => {
  const p = await mqStmt('es');
  const q = (await mq(p)).preview;
  await close(p);
  const quote = q.text.find((b) => b.quote).quote;
  const m = await open(q.links.ex.replace(/^https:\/\/josemagalan\.github\.io\/project-network-lab\//, ''));
  await m.waitForFunction(() => PNL.m0.state && PNL.m0.state().gen);
  const s = await state(m);
  assert.deepEqual([s.st, s.sd, s.lv, s.sv], ['gen', 1, 'medium', 2]);
  assert.deepEqual(await m.evaluate(() => { const st = PNL.app.state(); return PNL.stmtgen.render(PNL.stmtgen.make(st.sd, st.lv, { ctx: st.cx }).def, 'es').split('\n').filter(Boolean); }), quote);
  assert.ok((await m.locator('#m0View .m0-textbody').innerText()).includes(quote[0]));
  await close(m);
});

check('F3c AC10 · descarga con la etapa 0: su categoría con MULTIRESPONSE_H, bien formada, en ES y EN', async () => {
  for (const [lang, cat, level] of [['es', 'Redes de proyectos/0 · Enunciado → tabla/Fácil', 'Fácil'], ['en', 'Project networks/0 · Statement → table/Easy', 'Easy']]) {
    const p = await mqStmt(lang);
    await mqSelect(p, ['0 ·'], [level], 2);
    const [dl] = await Promise.all([p.waitForEvent('download'), p.locator('#mqDownload').click()]);
    const xml = await xmlOf(dl);
    assert.equal((xml.match(/<question type="cloze">/g) || []).length, 2);
    assert.ok(xml.includes(`$course$/top/${cat}`), cat);
    assert.ok(xml.includes('MULTIRESPONSE_H'));
    assert.deepEqual(require('../xml-check.js').check(xml), { ok: true });
    await close(p);
  }
});

check('F3c AC12 · el exportador con la etapa 0: axe sin violaciones en claro y oscuro, ES y EN; a 360 px sin desplazamiento horizontal', async () => {
  for (const [lang, scheme, width] of [['es', 'light', 1280], ['en', 'dark', 1280], ['es', 'dark', 360], ['en', 'light', 360]]) {
    const p = await mqStmt(lang, { scheme, width, height: width === 360 ? 800 : 720 });
    await p.locator('.mq-feedback summary').click();
    await axe(p, `F3c · exportador con la etapa 0 (${lang}, ${scheme}, ${width} px)`);
    assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `${lang} ${width}`);
    await close(p);
  }
});

// ---------- F3c, T014: teclado, accesibilidad y pantalla de lo publicado (spec f3c-enunciados, AC7, AC9, AC10, AC12 y AC13) ----------

const notBody = (page) => page.evaluate(() => document.activeElement && document.activeElement !== document.body);

check('F3c T014 AC12 · M0 con el teclado: «Enunciado al azar» en el selector, nivel, contexto y «Otro enunciado», sin perder el foco', async () => {
  const p = await m0Lab();
  await tabTo(p, 'm0St');
  await p.keyboard.press('End');
  await p.waitForFunction(() => PNL.m0.state && PNL.m0.state().gen);
  assert.equal((await state(p)).st, 'gen');
  assert.ok(await notBody(p), 'el foco tras elegir el enunciado');
  await tabTo(p, 'm0Lv-hard');
  await p.keyboard.press('Enter');
  await p.waitForFunction(() => PNL.app.state().lv === 'hard');
  assert.equal(await activeId(p), 'm0Lv-hard', 'el foco sigue en el nivel');
  assert.equal(await p.locator('#m0Lv-hard').getAttribute('aria-pressed'), 'true');
  await tabTo(p, 'm0Cx');
  await p.keyboard.press('ArrowDown');
  await p.waitForFunction(() => !!PNL.app.state().cx);
  assert.equal(await activeId(p), 'm0Cx', 'el foco sigue en el contexto');
  const key = (await m0st(p)).stKey;
  await tabTo(p, 'm0Another');
  await p.keyboard.press('Enter');
  await p.waitForFunction((k) => PNL.m0.state().stKey !== k, key);
  assert.equal(await activeId(p), 'm0Another', 'el foco sigue en «Otro enunciado»');
  await close(p);
});

check('F3c T014 AC12 · «Ejercicios» con el teclado: Espacio en la casilla pone el enunciado y Enter en «Ver la tabla» la abre', async () => {
  const p = await exLab({ sd: 14844, lv: 'medium' });
  await tabTo(p, 'exText');
  await p.keyboard.press('Space');
  await p.waitForFunction(() => PNL.app.state().xt === 1);
  await exText(p);
  assert.equal(await activeId(p), 'exText', 'el foco sigue en la casilla');
  const summary = p.locator('#exView .ex-showtable summary');
  await summary.focus();
  await p.keyboard.press('Enter');
  assert.equal(await p.locator('#exView .ex-showtable').evaluate((d) => d.open), true);
  assert.ok(await p.locator('#exView .ex-showtable .ex-given-card').isVisible());
  await close(p);
});

check('F3c T014 AC12 · exportador con el teclado: Espacio en la etapa 0 la desmarca y la vista previa pasa a la etapa 1', async () => {
  const p = await mqOpen('es');
  const box = p.locator('#mqView .mq-stages .mq-check input').first();
  await box.focus();
  await p.keyboard.press('Space');
  assert.equal(await box.isChecked(), false);
  assert.ok(await box.evaluate((el) => el === document.activeElement), 'el foco sigue en la casilla');
  assert.equal(await p.locator('.mq-summary').textContent(), 'Se generarán 110 preguntas en 11 categorías.');
  assert.equal((await mq(p)).preview.stage, 'early');
  await p.keyboard.press('Space');
  assert.equal((await mq(p)).preview.stage, 'stmt');
  await close(p);
});

check('F3c T014 AC12 · axe sin violaciones en las combinaciones que faltaban: M0 al azar con «Comprobar», ruta y «Aprende más»; «Ejercicios» con enunciado en Examen', async () => {
  for (const [lang, scheme] of [['es', 'dark'], ['en', 'light']]) {
    const probe = await open(genUrl({ lang, lv: 'hard', sd: 22 }));
    await probe.waitForFunction(() => PNL.m0.state && PNL.m0.state().gen);
    const def = await genDef(probe);
    await close(probe);
    // Una tabla con un error: el diagnóstico a la vista.
    const t = def.ref.rows.map((r) => ({ id: r.id, name: r.name[lang], duration: r.duration, links: r.links }));
    t[t.length - 1] = Object.assign({}, t[t.length - 1], { links: '' });
    const p = await open(genUrl({ lang, lv: 'hard', sd: 22, t }), { scheme });
    await p.waitForFunction(() => PNL.m0.state && PNL.m0.state().gen);
    await m0Check(p);
    await axe(p, `F3c · M0 al azar con el diagnóstico (${lang}, ${scheme})`);
    await p.locator('#m0Learn').click();
    await p.locator('#learnDialog').waitFor();
    await axe(p, `F3c · «Aprende más» de M0 (${lang}, ${scheme})`);
    await close(p);
    const r = await open(genUrl({ lang, lv: 'medium', sd: 15, mm: 'route', step: 4 }), { scheme });
    await r.waitForFunction(() => PNL.m0.state && PNL.m0.state().gen);
    await axe(r, `F3c · ruta de un enunciado al azar (${lang}, ${scheme})`);
    await close(r);
    const x = await exLab({ sd: 92846, lv: 'hard', xt: 1, xm: 'exam', lang }, { scheme });
    await exText(x);
    await axe(x, `F3c · «Ejercicios» con enunciado en Examen (${lang}, ${scheme})`);
    await close(x);
  }
});

check('F3c T014 AC12 · a 1280×720 y a 360 px, sin desplazamiento horizontal con lo más largo: M0 y «Ejercicios» difíciles con enunciado y la vista previa difícil del exportador', async () => {
  for (const [width, height] of [[1280, 720], [360, 800]]) {
    const m = await open(genUrl({ lv: 'hard', sd: 22, cx: 'lab' }), { width, height });
    await m.waitForFunction(() => PNL.m0.state && PNL.m0.state().gen);
    assert.ok(await noHScroll(m), `M0 ${width}`);
    await close(m);
    const x = await exLab({ sd: 92846, lv: 'hard', xt: 1 }, { width, height });
    await exText(x);
    await x.locator('#exView .ex-showtable summary').click();
    assert.ok(await noHScroll(x), `Ejercicios ${width}`);
    await close(x);
    const q = await mqOpen('en', { width, height });
    await mqSelect(q, ['0 ·'], ['Hard']);
    await q.waitForFunction(() => PNL.moodlePage.state().preview.level === 'hard');
    await q.locator('.mq-feedback summary').click();
    assert.ok(await noHScroll(q), `exportador ${width}`);
    await close(q);
  }
});

// ---------- F3c, T017: correcciones de la revisión de nivel 2 (reviews/f3c-enunciados.md) ----------

check('F3c revisión F1 · un enlace de enunciado propio sin paquete abre Electrona con el aviso, sin errores', async () => {
  const p = await lab('v=m0&st=own&lang=es');
  await p.waitForFunction(() => window.PNL && PNL.app && PNL.m0 && PNL.m0.state);
  assert.equal((await state(p)).st, 'ej5');
  assert.ok(await p.locator('#m0View').isVisible());
  assert.ok(await p.locator('#urlWarning').isVisible());
  await close(p);
});

check('F3c revisión F2 · con un enunciado propio, ir a otra pestaña y volver a «Del enunciado a la tabla» no rompe M0', async () => {
  const p = await m0Lab(ownPrep('es'));
  for (const tab of ['#navRoute', '#navWork']) {
    await p.locator(tab).click();
    await p.waitForFunction(() => PNL.app.state().v !== 'm0');
    await p.locator('#navM0').click();
    await p.waitForFunction(() => PNL.app.state().v === 'm0' && !document.getElementById('m0View').hidden);
    assert.ok(await p.locator('#m0View').isVisible(), tab);
  }
  await close(p);
});

check('F3c revisión F3 · confirmación con tabla o con subrayados, vuelta a «Al azar» y nivel medio al elegir «Enunciado al azar»', async () => {
  // Solo una fila en la tabla (sin subrayados): «Otro enunciado» pide confirmación.
  const a = await open(genUrl({ t: [R('A', '', '')] }));
  await a.waitForFunction(() => PNL.m0.state && PNL.m0.state().gen);
  assert.equal((await m0st(a)).marks.length, 0);
  await a.locator('#m0Another').click();
  assert.ok(await a.locator('#m0LoseYes').isVisible(), 'confirmación con solo la tabla');
  await close(a);
  // Solo subrayados (sin filas): también.
  const probe = await open(genUrl());
  await probe.waitForFunction(() => PNL.m0.state && PNL.m0.state().gen);
  const fr = await genFrags(probe, 'es');
  await close(probe);
  const b = await open(genUrl({ mk: [{ from: fr.p1.from, to: fr.p1.to, kind: 'none' }] }));
  await b.waitForFunction(() => PNL.m0.state && PNL.m0.state().gen);
  assert.deepEqual([(await m0st(b)).rows.length, (await m0st(b)).marks.length], [0, 1]);
  await b.locator('#m0Another').click();
  assert.ok(await b.locator('#m0LoseYes').isVisible(), 'confirmación con solo subrayados');
  await close(b);
  // Contexto elegido y vuelta a «Al azar».
  const c = await open(genUrl({ cx: 'lab' }));
  await c.waitForFunction(() => PNL.m0.state && PNL.m0.state().gen);
  await c.selectOption('#m0Cx', '');
  await c.waitForFunction(() => PNL.app.state().cx === null);
  assert.ok(await c.locator('#m0Drawn').isVisible());
  await close(c);
  // Con el nivel difícil en el estado (de «Ejercicios»), elegir «Enunciado al azar» abre uno de nivel medio.
  const d = await exLab({ lv: 'hard', sd: 92846 });
  await d.locator('#navM0').click();
  await d.waitForFunction(() => PNL.app.state().v === 'm0' && PNL.m0 && PNL.m0.state);
  assert.equal((await state(d)).lv, 'hard');
  await d.selectOption('#m0St', 'gen');
  await d.waitForFunction(() => PNL.m0.state && PNL.m0.state().gen);
  assert.equal((await state(d)).lv, 'medium');
  await close(d);
});

check('F3c revisión F4 y F6 · el diagnóstico caduca al cambiar de enunciado; el nivel ya elegido no hace nada', async () => {
  const p = await open(genUrl());
  await p.waitForFunction(() => PNL.m0.state && PNL.m0.state().gen);
  await m0Check(p);
  assert.ok((await m0st(p)).diag);
  await p.locator('#m0Lv-hard').click();
  await p.waitForFunction(() => PNL.app.state().lv === 'hard');
  assert.equal((await m0st(p)).diag, null, 'tras cambiar de nivel');
  await m0Check(p);
  const key = (await m0st(p)).stKey;
  await p.locator('#m0Another').click();
  await p.waitForFunction((k) => PNL.m0.state().stKey !== k, key);
  assert.equal((await m0st(p)).diag, null, 'tras «Otro enunciado»');
  await close(p);
  // Con trabajo hecho, pulsar el nivel que ya está elegido no pide confirmación ni borra nada.
  const q = await open(genUrl({ t: [R('A', '', '')] }));
  await q.waitForFunction(() => PNL.m0.state && PNL.m0.state().gen);
  const before = await q.evaluate(() => history.length);
  await q.locator('#m0Lv-medium').click();
  assert.ok(await q.locator('#m0LoseYes').isHidden());
  assert.equal((await m0st(q)).rows.length, 1);
  assert.equal(await q.evaluate(() => history.length), before);
  await close(q);
});

check('F3c revisión F5 · «Ejercicios» con enunciado conserva la red desplegada y «Ver la tabla» abierto al cambiar de idioma', async () => {
  const p = await exLab({ sd: 14844, lv: 'medium', xt: 1 });
  await exText(p);
  await p.locator('#exFold').click();
  await p.waitForFunction(() => document.getElementById('exFold').getAttribute('aria-expanded') === 'true');
  // Abrir «Ver la tabla» y cambiar de idioma en la misma tarea, antes de que llegue el evento toggle: así la prueba no
  // depende del orden de los eventos (revisión de la F3c, ronda 2, F5).
  await p.evaluate(() => {
    document.querySelector('#exView .ex-showtable summary').click();
    const sel = document.getElementById('selLang');
    sel.value = 'en';
    sel.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await p.waitForFunction(() => document.querySelector('#exView .ex-showtable summary').textContent === 'Show the table');
  assert.equal(await p.locator('#exFold').getAttribute('aria-expanded'), 'true', 'la red, desplegada');
  assert.equal(await p.locator('#exView .ex-showtable').evaluate((d) => d.open), true, '«Ver la tabla», abierto');
  await close(p);
});

// ---------- F3c, T017: correcciones de la ronda 2 de la revisión (reviews/f3c-enunciados.md, «Ronda 2») ----------

check('F3c revisión r2 F1 · de un enunciado al azar a «Preparar» y, pasando por otra pestaña, otra vez a M0', async () => {
  // Sin statements.js: el enlace es de un enunciado al azar; «Preparar» lo cambia a uno propio (toM0 lo tiene que pedir).
  for (const tab of ['#navRoute', '#navWork']) {
    const p = await open(genUrl());
    await p.waitForFunction(() => PNL.m0.state && PNL.m0.state().gen);
    assert.equal(await loaded(p, /js\/core\/statements\.js/), false, 'el enunciado al azar no carga statements.js');
    await p.locator('#m0Prepare').click();
    await p.waitForFunction(() => PNL.app.state().st === 'own');
    await p.locator(tab).click();
    await p.waitForFunction(() => PNL.app.state().v !== 'm0');
    await p.locator('#navM0').click();
    await p.waitForFunction(() => PNL.app.state().v === 'm0' && !document.getElementById('m0View').hidden);
    assert.ok(await p.locator('#m0View').isVisible(), tab);
    await close(p);
  }
});

check('F3c revisión r2 F2 · «Ejercicios» con enunciado: el enlace guarda sv y el de otra versión avisa hasta otro ejercicio', async () => {
  const sv = () => new URLSearchParams(location.hash.slice(1)).get('sv');
  const msg = I0.t('es', 'm0.gen.oldVersion');
  // Poner el enunciado: el enlace lleva la versión actual y no hay aviso.
  const a = await exLab({ sd: 7, lv: 'medium' });
  await a.locator('#exText').check();
  await exText(a);
  assert.equal(await a.evaluate(sv), String(U0.STMT_VERSION));
  assert.equal(await a.locator('#exTextOld').count(), 0);
  await close(a);
  // Un enlace de antes (xt=1 sin sv, versión 1): el texto de la versión actual, con el aviso, y el enlace sigue diciendo 1.
  const b = await open('cpm.html#v=ex&sd=7&xt=1&lang=es');
  await exText(b);
  assert.equal(await b.locator('#exTextOld').innerText(), msg);
  assert.equal(await b.evaluate(sv), '1');
  assert.equal(await b.locator('#urlWarning').isVisible(), false, 'no es un enlace mal formado');
  // Otro ejercicio ya es de la versión actual.
  await b.locator('#exAnother').click();
  await b.waitForFunction(() => PNL.app.state().sd !== 7);
  await exText(b);
  assert.equal(await b.locator('#exTextOld').count(), 0);
  assert.equal(await b.evaluate(sv), String(U0.STMT_VERSION));
  await close(b);
  // Con la versión actual en el enlace, sin aviso.
  const c = await open(`cpm.html#v=ex&sd=7&xt=1&sv=${U0.STMT_VERSION}&lang=es`);
  await exText(c);
  assert.equal(await c.locator('#exTextOld').count(), 0);
  await close(c);
});

// ---------- F4a, T009: «Duraciones inciertas», M5 (tres tiempos) ----------

const uncLab = (hash, opts) => open(`cpm.html#v=unc${hash ? `&${hash}` : ''}`, opts).then(async (p) => {
  await p.waitForFunction(() => PNL.unc && PNL.unc.state && PNL.unc.state() && !document.getElementById('uncView').hidden);
  return p;
});
const uncSt = (page) => page.evaluate(() => PNL.unc.state());
const hashGet = (page, k) => page.evaluate((key) => new URLSearchParams(location.hash.slice(1)).get(key), k);
const uncAfter = (page, fn) => page.waitForFunction(fn);

check('F4a T009 · M5 con Klastorin: medias, varianzas, camino crítico de las medias, curva y red, con la pestaña publicada', async () => {
  const p = await uncLab('lang=es');
  assert.equal(await p.locator('#navUnc').isVisible(), true, 'pestaña publicada en T013');
  assert.equal(await p.locator('#stage').isVisible(), false);
  assert.equal(await p.locator('#workshop').isVisible(), false);
  const st = await uncSt(p);
  assert.equal(st.src.id, 'kl');
  assert.deepEqual(st.path, ['A', 'C', 'E', 'F']);
  assert.deepEqual(st.acts.map((a) => a.mean.toFixed(2)), ['6.67', '7.33', '7.83', '14.33', '5.00', '4.33']);
  assert.equal(await p.locator('#uncTable tbody tr').count(), 6);
  assert.deepEqual(await p.locator('#uncTable tbody tr.crit').evaluateAll((rs) => rs.map((r) => r.dataset.act)), ['A', 'C', 'E', 'F']);
  assert.match(await p.locator('#uncNetHead').innerText(), /A–C–E–F/);
  assert.equal(await p.locator('#uncNet svg').count(), 1, 'red ROY con las medias');
  // La curva de A: beta-PERT y triangular; la clásica, solo al pedirla.
  assert.match(await p.locator('#uncActHead').innerText(), /^Actividad A/);
  assert.equal(await p.locator('#uncChart path.c-pert').count(), 1);
  assert.equal(await p.locator('#uncChart path.c-tri').count(), 1);
  assert.equal(await p.locator('#uncChart path.c-classic').count(), 0);
  assert.match(await p.locator('#uncChart svg').getAttribute('aria-label'), /6,67/);
  assert.equal(await p.locator('#uncCmp thead th').count(), 3);
  await p.locator('#uncClassic').check();
  await uncAfter(p, () => document.querySelector('#uncChart path.c-classic'));
  assert.equal(await hashGet(p, 'uc'), '1');
  assert.equal(await p.locator('#uncCmp thead th').count(), 4);
  assert.equal(await activeId(p), 'uncClassic', 'el foco sigue en la casilla');
  await shot(p, 'f4a-m5-klastorin');
  await axe(p, 'F4a · M5 · Klastorin con la beta clásica');
  await close(p);
});

check('F4a T009 · elegir actividad (lista, fila o nodo) cambia la curva y queda en el enlace', async () => {
  const p = await uncLab('lang=es');
  await p.locator('#uncAct').selectOption('D');
  await uncAfter(p, () => PNL.unc.state().sel === 'D');
  assert.equal(await hashGet(p, 'ua'), 'D');
  assert.match(await p.locator('#uncActHead').innerText(), /^Actividad D/);
  assert.equal(await p.locator('#uncTable tr.sel').getAttribute('data-act'), 'D');
  await p.locator('#uncTable tr[data-act="E"] th button').click();
  await uncAfter(p, () => PNL.unc.state().sel === 'E');
  // Recargar con el enlace conserva la actividad.
  const url = await p.evaluate(() => location.hash);
  await close(p);
  const q = await open(`cpm.html${url}`);
  await q.waitForFunction(() => PNL.unc && PNL.unc.state && PNL.unc.state() && PNL.unc.state().sel === 'E');
  await close(q);
});

check('F4a T009 · un deslizador de un ejemplo pasa a tabla propia, recalcula y conserva el foco; a ≤ m ≤ b', async () => {
  const p = await uncLab('lang=es');
  await p.locator('#uncSl-m').focus();
  await p.keyboard.press('ArrowRight');
  await uncAfter(p, () => PNL.unc.state().src.kind === 'own');
  assert.equal(await hashGet(p, 'ue'), 'own');
  const st = await uncSt(p);
  assert.equal(st.src.rows[0].m, '6.5');
  assert.equal(st.acts[0].mean.toFixed(4), ((2 + 4 * 6.5 + 14) / 6).toFixed(4));
  assert.equal(await activeId(p), 'uncSl-m');
  // tₒ no pasa de tₘ: con End el deslizador se queda en m.
  await p.locator('#uncSl-a').focus();
  await p.keyboard.press('End');
  await uncAfter(p, () => PNL.unc.state().src.rows[0].a === '6.5');
  assert.equal((await uncSt(p)).issues.length, 0);
  await close(p);
});

check('F4a T009 · tabla propia: errores de a, m y b y de estructura, pegar y cambiar la forma', async () => {
  const p = await uncLab('lang=es');
  await p.locator('#uncProj').selectOption('own');
  await uncAfter(p, () => PNL.unc.state().src.kind === 'own' && document.getElementById('uncIssues'));
  assert.equal(await activeId(p), 'uncT-0-a');
  assert.match(await p.locator('#uncIssuesHead').innerText(), /3 errores/);
  assert.equal(await p.locator('#uncOwn input[aria-invalid="true"]').count(), 3);
  assert.equal(await p.locator('#uncNet').count(), 0, 'sin red mientras hay errores');
  // Cada tecla se aplica sin rehacer la tabla: el foco sigue en la casilla y las marcas cambian en su sitio.
  await p.locator('#uncT-0-a').fill('5');
  await uncAfter(p, () => PNL.unc.state().issues.length === 2);
  assert.equal(await activeId(p), 'uncT-0-a');
  assert.equal(await p.locator('#uncT-0-a').getAttribute('aria-invalid'), 'false');
  await p.locator('#uncT-0-m').fill('3');
  await p.locator('#uncT-0-b').fill('9');
  await uncAfter(p, () => PNL.unc.state().issues.some((i) => i.code === 'aGtM'));
  assert.equal(await activeId(p), 'uncT-0-b');
  assert.equal(await p.locator('#uncT-0-a').getAttribute('aria-invalid'), 'true');
  assert.equal(await p.locator('#uncNet').count(), 0);
  await p.locator('#uncT-0-m').fill('7');
  await uncAfter(p, () => document.getElementById('uncNet'));
  assert.equal(await activeId(p), 'uncT-0-m', 'con la tabla ya correcta aparecen la curva y la red sin perder el foco');
  await p.locator('#uncT-0-m').fill('3');
  await uncAfter(p, () => PNL.unc.state().issues.some((i) => i.code === 'aGtM'));
  assert.match(await p.locator('#uncIssues li').first().innerText(), /Fila 1: a no puede ser mayor que m/);
  // Pegar una tabla de dos actividades con coma decimal.
  await p.locator('#uncPaste summary').click();
  await p.locator('#uncPasteText').fill('Act\tNombre\ta\tm\tb\tPrec\nA\tDiseño\t1\t2\t4\t\nB\tPrueba\t1\t2,5\t4\tA');
  await p.locator('#uncPasteApply').click();
  await uncAfter(p, () => PNL.unc.state().acts.length === 2 && !PNL.unc.state().issues.length);
  assert.deepEqual((await uncSt(p)).path, ['A', 'B']);
  assert.equal(await p.locator('#uncNet svg').count(), 1);
  // Posteriores: la tabla se reescribe en la otra forma.
  await p.locator('#uncMode-succ').check();
  await uncAfter(p, () => PNL.unc.state().src.mode === 'succ');
  assert.deepEqual((await uncSt(p)).src.rows.map((r) => r.links), ['B', '']);
  assert.deepEqual((await uncSt(p)).path, ['A', 'B']);
  // Quitar una fila: B era posterior de A, así que ya no hay error y A queda sola.
  await p.locator('#uncDel-1').click();
  await uncAfter(p, () => PNL.unc.state().src.rows.length === 1);
  assert.equal((await uncSt(p)).issues[0].code, 'unknownRef');
  await axe(p, 'F4a · M5 · tabla propia con errores');
  await close(p);
});

check('F4a T009 · «Partir del taller»: la estructura del taller con a = m = b = la duración, y el taller no cambia', async () => {
  const p = await open('cpm.html#v=work&ex=ej6&lang=es');
  const before = await state(p);
  await setHash(p, 'v=unc&lang=es');
  await p.waitForFunction(() => PNL.unc && PNL.unc.state && PNL.unc.state());
  await p.locator('#uncFromWork').click();
  await uncAfter(p, () => PNL.unc.state().src.kind === 'own');
  const st = await uncSt(p);
  assert.ok(st.acts.length > 5);
  assert.ok(st.acts.every((a) => a.var === 0), 'sin incertidumbre');
  assert.ok(st.src.rows.every((r) => r.a === r.m && r.m === r.b));
  assert.match(await p.locator('#live').innerText(), /taller/);
  assert.equal(await p.locator('#uncFixed').count(), 1, 'duración fija: marca en lugar de curva');
  assert.equal(await p.locator('#uncClassic').isDisabled(), true);
  await p.goBack();
  await p.goBack();
  await p.waitForFunction(() => PNL.app.state().v === 'work');
  assert.deepEqual((await state(p)).t, before.t);
  await close(p);
});

check('F4a T009 · red PERT con las medias, inglés y notación española', async () => {
  const p = await uncLab('ue=hl&lang=en&nota=es');
  assert.match(await p.locator('#uncProjHead').innerText(), /^Project · mean and variance/);
  const heads = await p.locator('#uncTable thead th').allInnerTexts();
  assert.deepEqual(heads.slice(2), ['tₒ', 'tₘ', 'tₚ', 'tₑ', 'σ²']);
  assert.match(await p.locator('#uncNetHead').innerText(), /A–B–C–E–F–J–L–N/);
  await p.locator('#uncAoa').click();
  await uncAfter(p, () => PNL.app.state().graph === 'aoa');
  assert.equal(await p.locator('#uncNet svg').count(), 1);
  assert.equal(await activeId(p), 'uncAoa');
  await axe(p, 'F4a · M5 · Hillier, red PERT, EN');
  await close(p);
});

check('F4a T009 · tema oscuro, 360 px sin desbordar la página y el grupo bajo demanda solo en v=unc', async () => {
  const d = await uncLab('lang=es&uc=1', { scheme: 'dark' });
  await axe(d, 'F4a · M5 · tema oscuro');
  await close(d);
  const m = await uncLab('lang=es', { width: 360, height: 740 });
  assert.equal(await m.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), true, 'sin desbordar a lo ancho');
  await shot(m, 'f4a-m5-360', true);
  await close(m);
  const r = await lab('v=route&ex=ej6&step=0&lang=es');
  assert.equal(await r.evaluate(() => !!PNL.unc || !!PNL.threept), false);
  // Ir a la pestaña por enlace carga el grupo.
  await setHash(r, 'v=unc&lang=es');
  await r.waitForFunction(() => PNL.unc && PNL.unc.state && PNL.unc.state());
  assert.equal(await r.locator('#uncView').isVisible(), true);
  await close(r);
});

// ---------- F4a, T010: M6, el TCL y sus trampas ----------

const UNC = require(path.join(ROOT, 'js', 'unc.js'));
const SIMC = require(path.join(ROOT, 'js', 'core', 'sim.js'));
const U4 = require(path.join(ROOT, 'js', 'core', 'urlstate.js'));
// Espera a que la simulación del caso abierto termine y devuelve su huella.
const simDone = async (page) => { await page.waitForFunction(() => { const s = PNL.unc.state(); return s && s.sim && s.sim.done; }, null, { timeout: 20000 }); return (await uncSt(page)).sim; };
// La misma huella, calculada en Node con el núcleo a partir del enlace (A4).
function nodePrint(hash) {
  const st = U4.decode(hash).state;
  const spec = UNC.simSpec(st, UNC.model(st, st.lang || 'es'));
  const su = UNC.simSummary(spec, SIMC.run({ kind: spec.kind, model: spec.model, n: spec.n, us: spec.us }).durations);
  return { ps: su.ps, mean: su.mean, counts: su.hist.counts, us: spec.us };
}

check('F4a T010 · cálculo de examen de Klastorin: los cinco pasos, la normal con el plazo y el plazo para una probabilidad', async () => {
  const p = await uncLab('um=m6&lang=es');
  assert.equal(await p.locator('#uncCase-exam').getAttribute('aria-pressed'), 'true');
  const steps = await p.locator('#uncSteps li').allInnerTexts();
  assert.equal(steps.length, 5);
  assert.match(steps[0], /A–C–E–F \(de 23,83 semanas\)\. Casi crítico: A–B–E–F \(23,33\)/);
  assert.match(steps[1], /6,67 \+ 7,83 \+ 5,00 \+ 4,33 = 23,83/);
  assert.match(steps[2], /= 8,25/);
  assert.match(steps[3], /con la tabla, z = 0,41/);
  assert.match(steps[4], /Φ\(0,41\) = 0,6591; sin redondear z, 0,6577/);
  assert.equal(await p.locator('#uncNormal svg path.c-normal').count(), 1);
  assert.equal(await p.locator('#uncNormal svg .dc-shade').count(), 1);
  // Otro plazo: se escribe con coma y queda en el enlace; uno no válido se marca y no cambia nada.
  await p.locator('#uncDeadline').fill('26,5');
  await p.locator('#uncDeadline').press('Enter');
  await p.locator('#uncDeadline').blur();
  await p.waitForFunction(() => new URLSearchParams(location.hash.slice(1)).get('ud') === '26.5');
  assert.match((await p.locator('#uncSteps li').allInnerTexts())[4], /P\(duración ≤ 26,5\)/);
  await p.locator('#uncDeadline').fill('-3');
  await p.locator('#uncDeadline').blur();
  assert.equal(await p.locator('#uncDeadline').getAttribute('aria-invalid'), 'true');
  assert.equal(await p.locator('#uncDeadlineErr').isVisible(), true);
  assert.equal(await hashGet(p, 'ud'), '26.5');
  // Al revés: la probabilidad del 95 % da z = 1,64 con la tabla.
  await p.locator('#uncAsk-t').check();
  await p.waitForFunction(() => new URLSearchParams(location.hash.slice(1)).get('up') === '0.95');
  const inv = await p.locator('#uncSteps li').allInnerTexts();
  assert.match(inv[3], /con la tabla, 1,64/);
  assert.match(inv[4], /23,83 \+ 1,64·√8,25 = 28,54/);
  assert.equal(await activeId(p), 'uncAsk-t');
  await axe(p, 'F4a · M6 · cálculo de examen');
  await p.locator('#uncToProj').click();
  await p.waitForFunction(() => PNL.app.state().ux === 'proj');
  await close(p);
});

check('F4a T010 · σ² = 0 (desde el taller): se explica en lugar de dividir por cero', async () => {
  const p = await uncLab('um=m6&lang=es');
  await p.locator('#uncFromWork').click();
  await p.waitForFunction(() => PNL.unc.state().src.kind === 'own' && document.querySelectorAll('#uncSteps li').length === 4);
  assert.match((await p.locator('#uncSteps li').allInnerTexts())[3], /σ² = 0: sin incertidumbre\s+La duración del camino es fija, 13: P\(duración ≤ 13\) = 1, sin normal ni z\./);
  await close(p);
});

check('F4a T010 · fusión de caminos: normal fija, simulación y cuenta exacta; deslizadores, «Otra simulación» y la huella de Node', async () => {
  const hash = 'v=unc&um=m6&ux=merge&lang=es';
  const p = await uncLab('um=m6&ux=merge&lang=es');
  assert.equal(await p.locator('#uncProj').count(), 0, 'caso sintético: sin selector de proyecto');
  const a = await simDone(p);
  const n = nodePrint(`#${hash}`);
  assert.equal(a.us, 2026);
  assert.deepEqual(a.counts, n.counts, 'el histograma del navegador es el de Node');
  assert.equal(a.ps, n.ps);
  const rows = await p.locator('#uncProb tbody tr').allInnerTexts();
  assert.equal(rows.length, 3);
  assert.match(rows[0], /0,841/);
  assert.match(rows[2], /Cuenta exacta/);
  assert.match(await p.locator('#uncMergeNote').innerText(), /4 caminos/);
  assert.equal(await p.locator('#uncSchoenberger').count(), 1);
  assert.match(await p.locator('#uncSimChart svg').getAttribute('aria-label'), /Plazo 22: normal 0,841, simulación 0,6/);
  // Más caminos: la probabilidad simulada baja y la normal sigue igual; el foco se queda en el deslizador.
  await p.locator('#uncK-n').focus();
  await p.keyboard.press('End');
  await p.waitForFunction((ps) => { const s = PNL.unc.state().sim; return s && s.done && s.ps < ps; }, a.ps, { timeout: 20000 });
  assert.equal(await hashGet(p, 'uk'), 'n8', 'solo el deslizador movido; la holgura sigue en su valor por defecto');
  assert.equal(await activeId(p), 'uncK-n');
  assert.match((await p.locator('#uncProb tbody tr').allInnerTexts())[0], /0,841/);
  // Otra simulación: semilla nueva en el enlace; ese enlace, abierto en otra página, da el mismo histograma.
  await p.locator('#uncAgain').click();
  await p.waitForFunction(() => new URLSearchParams(location.hash.slice(1)).get('us'));
  const b = await simDone(p);
  assert.notEqual(b.us, 2026);
  const url = await p.evaluate(() => location.hash);
  assert.deepEqual(b.counts, nodePrint(url).counts);
  const q = await open(`cpm.html${url}`);
  await q.waitForFunction(() => PNL.unc && PNL.unc.state && PNL.unc.state());
  assert.deepEqual((await simDone(q)).counts, b.counts);
  await close(q);
  // La alternativa en texto: la tabla de clases del histograma.
  await p.locator('#uncBins').click();
  await p.waitForFunction(() => document.querySelector('#uncBinsTable tbody tr'));
  assert.equal(await p.locator('#uncBinsTable tbody tr').count(), 40);
  assert.equal(await p.locator('#uncBins').getAttribute('aria-expanded'), 'true');
  assert.equal(await activeId(p), 'uncBins');
  await axe(p, 'F4a · M6 · fusión con la tabla de clases');
  await close(p);
});

check('F4a T010 · los tres límites: en su extremo la KS es mayor; el proyecto entero de Klastorin da menos que la normal', async () => {
  const ks = {};
  for (const [ux, hi, lo] of [['few', 'k1', 'k30'], ['skew', 'w100', 'w0'], ['corr', 'r95', 'r0']]) {
    for (const uk of [hi, lo]) {
      const p = await uncLab(`um=m6&ux=${ux}&uk=${uk}&lang=en`);
      ks[`${ux}.${uk}`] = (await simDone(p)).ks;
      if (uk === hi) assert.match(await p.locator('#uncProb thead').innerText(), /KS/);
      await close(p);
    }
    assert.ok(ks[`${ux}.${hi}`] > ks[`${ux}.${lo}`], `${ux}: ${ks[`${ux}.${hi}`]} frente a ${ks[`${ux}.${lo}`]}`);
  }
  const p = await uncLab('um=m6&ux=proj&lang=es');
  const s = await simDone(p);
  assert.ok(s.ps < s.pn - 0.05, `${s.ps} frente a ${s.pn}`);
  const paths = await p.locator('#uncPaths tbody tr').allInnerTexts();
  assert.match(paths[0], /A–C–E–F\s+23,83\s+8,25\s+0,658/);
  assert.equal(await p.locator('#uncPaths tbody tr.sel').count(), 1);
  await shot(p, 'f4a-m6-proyecto');
  await axe(p, 'F4a · M6 · el proyecto entero');
  await close(p);
  const d = await uncLab('um=m6&ux=corr&lang=es', { scheme: 'dark' });
  await simDone(d);
  await axe(d, 'F4a · M6 · correlación, tema oscuro');
  await close(d);
});

check('F4a T010 · la página atiende el teclado mientras simula y avisa al empezar y al terminar', async () => {
  const p = await uncLab('um=m6&ux=corr&uk=r95&lang=es');
  await simDone(p);
  await p.evaluate(() => {
    window.__lag = [];
    document.addEventListener('keydown', (e) => { const s = PNL.unc.state().sim; window.__lag.push({ lag: performance.now() - e.timeStamp, running: !!s && !s.done }); });
  });
  await p.locator('#uncAgain').click();
  assert.match(await p.locator('#live').innerText(), /Simulando 10\.000 réplicas/);
  await p.waitForFunction(() => { const s = PNL.unc.state().sim; return s && !s.done && document.querySelector('#uncSimWait'); });
  await p.waitForTimeout(150);
  for (let i = 0; i < 3; i++) { await p.keyboard.press('Shift'); await p.waitForTimeout(20); }
  const lags = await p.evaluate(() => window.__lag);
  assert.ok(lags.some((x) => x.running), `sin teclas durante la simulación: ${JSON.stringify(lags)}`);
  for (const x of lags) assert.ok(x.lag < 100, `${x.lag.toFixed(1)} ms`);
  await simDone(p);
  assert.match(await p.locator('#live').innerText(), /Simulación terminada: P\(duración ≤ /);
  await close(p);
});

check('F4a T010 · M6 en inglés con la notación española, dos rutas y paralelización; 360 px sin desbordar', async () => {
  const p = await uncLab('um=m6&ue=tr&lang=en&nota=es');
  assert.match((await p.locator('#uncSteps li').allInnerTexts())[0], /B–D/);
  assert.match((await p.locator('#uncSteps li').allInnerTexts())[4], /Φ\(0.89\) = 0.8133/);
  await p.locator('#uncCase-proj').click();
  await simDone(p);
  const rows = await p.locator('#uncProb tbody tr').allInnerTexts();
  assert.match(rows[2], /Exact count \(independent paths\)\s+0.710/);
  await p.locator('#uncProj').selectOption('pa');
  await p.waitForFunction(() => PNL.unc.state().src.id === 'pa');
  const s = await simDone(p);
  assert.ok(Math.abs(s.ps - 0.25) < 3 * Math.sqrt(0.25 * 0.75 / 10000), `${s.ps}`);
  await close(p);
  const m = await uncLab('um=m6&ux=merge&lang=es', { width: 360, height: 740 });
  await simDone(m);
  assert.equal(await m.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), true, 'sin desbordar a lo ancho');
  await shot(m, 'f4a-m6-360', true);
  await close(m);
});

// ---------- F4a, T011: paso a paso con predicción en M5 y M6 ----------

const predict = async (page, value, how = 'click') => {
  await page.locator('#uncPredIn').fill(value);
  if (how === 'enter') await page.locator('#uncPredIn').press('Enter'); else await page.locator('#uncPredCheck').click();
  await page.waitForFunction(() => document.getElementById('uncPredFb'));
  return page.locator('#uncPredFb').innerText();
};
const walkStep = (page) => page.evaluate(() => PNL.app.state().step);

check('F4a T011 · M5 paso a paso con predicción: oculto hasta comprobar, acierto, fallo con pista y «Mostrar la solución»', async () => {
  const p = await uncLab('ue=hl&lang=en');
  await p.locator('#uncWalk').click();
  await p.waitForFunction(() => PNL.app.state().uw === 1);
  assert.equal(await p.locator('#uncPredIn').count(), 0, 'sin predicción, sin casilla');
  assert.match(await p.locator('#uncWalkHead').innerText(), /^Step 1 of 28 · Activity A/);
  assert.match((await p.locator('#uncSteps li').allInnerTexts())[0], /\(a \+ 4m \+ b\)\/6 = /);
  await p.locator('#uncPred').check();
  await p.waitForFunction(() => PNL.app.state().pred === 1 && document.getElementById('uncPredIn'));
  assert.equal(await hashGet(p, 'uw'), '1');
  // Oculto: ni el valor, ni la línea de la media, ni «Next», ni la flecha del teclado.
  assert.match((await p.locator('#uncSteps li').allInnerTexts())[0], /Your prediction/);
  assert.equal(await p.locator('#uncChart line.v-mean').count(), 0);
  assert.equal(await p.locator('#uncNext').isDisabled(), true);
  await p.locator('#uncWalkHead').click();
  await p.keyboard.press('ArrowRight');
  assert.equal(await walkStep(p), 0);
  // Media de A de Hillier (1, 2, 3): la de la triangular también es 2, así que se prueba un fallo sin pista.
  const ok = await predict(p, '2', 'enter');
  assert.match(ok, /^Right\./);
  assert.equal(await p.locator('#uncChart line.v-mean').count(), 1);
  assert.equal(await activeId(p), 'uncPredFb');
  await p.keyboard.press('ArrowRight');
  await p.waitForFunction(() => PNL.app.state().step === 1);
  assert.match(await p.locator('#live').innerText(), /Step 2 of 28\. Variance of A\. The next step stays hidden/);
  const bad = await predict(p, '0,33');
  assert.match(bad, /^Not quite\. The value is 0\.11\. 0,33 is the standard deviation/);
  // «Show the answers» sin escribir nada; un «Check» vacío no revela.
  await p.locator('#uncNext').click();
  await p.waitForFunction(() => PNL.app.state().step === 2);
  await p.locator('#uncPredCheck').click();
  assert.equal(await p.locator('#uncPredEmpty').isVisible(), true);
  assert.equal(await p.locator('#uncNext').isDisabled(), true);
  await p.locator('#uncPredShow').click();
  await p.waitForFunction(() => !document.getElementById('uncPredIn'));
  assert.equal(await p.locator('#uncNext').isDisabled(), false);
  // Actividad C de Hillier (6, 9, 18): la varianza de la curva beta-PERT es la pista del boceto 67.
  await go(p, 5);
  await p.waitForFunction(() => document.getElementById('uncPredIn'));
  assert.match(await predict(p, '4,57'), /Not quite\. The value is 4\.00\. 4,57 is the variance of the beta-PERT curve drawn here \(4\.57\)/);
  await go(p, 4);
  await p.waitForFunction(() => document.getElementById('uncPredIn'));
  assert.match(await predict(p, '11'), /11 is the mean of the triangular/);
  await axe(p, 'F4a · M5 · paso a paso con predicción');
  await close(p);
  const d = await uncLab('ue=kl&uw=1&pred=1&step=1&lang=es&nota=es', { scheme: 'dark' });
  assert.match(await d.locator('#uncPredIn').evaluate((el) => el.labels[0].textContent), /σ² de A =/);
  await axe(d, 'F4a · M5 · paso a paso, tema oscuro');
  await d.locator('#uncWalk').click();
  await d.waitForFunction(() => PNL.app.state().uw === 0 && document.getElementById('uncActCard'));
  assert.equal(await walkStep(d), 0);
  await close(d);
});

check('F4a T011 · M6 paso a paso: camino, μ, σ², z y P con la tabla o la exacta; pistas; las cifras del gráfico salen con su paso', async () => {
  const p = await uncLab('um=m6&uw=1&pred=1&lang=es');
  assert.match(await p.locator('#uncExamHead').innerText(), /paso 1 de 5/);
  assert.equal(await p.locator('#uncPredIn').count(), 0, 'el camino no se predice');
  assert.match(await p.locator('#uncNormalHead').innerText(), /^Normal del camino crítico$/);
  assert.equal(await p.locator('#uncExamResult').count(), 0);
  await p.locator('#uncNext').click();
  await p.waitForFunction(() => document.getElementById('uncPredIn'));
  assert.match(await predict(p, '23,83'), /^Bien\./);
  await p.locator('#uncNext').click();
  await p.waitForFunction(() => document.getElementById('uncPredIn'));
  assert.match(await predict(p, '5,17'), /Has sumado las desviaciones/);
  assert.match(await p.locator('#uncNormalHead').innerText(), /N\(23,83; 8,25\)/);
  await p.locator('#uncNext').click();
  await p.waitForFunction(() => document.getElementById('uncPredIn'));
  assert.match(await predict(p, '0,14'), /Has dividido entre σ²/);
  await p.locator('#uncNext').click();
  await p.waitForFunction(() => document.getElementById('uncPredIn'));
  assert.equal(await p.locator('#uncExamResult').count(), 0);
  assert.match(await predict(p, '0,6591'), /^Bien\./);
  assert.equal(await p.locator('#uncExamResult').count(), 1);
  await go(p, 3);
  await go(p, 4);
  await p.waitForFunction(() => document.getElementById('uncPredIn'));
  assert.match(await predict(p, '0,34'), /Con la tabla, 0,6591; sin redondear, 0,6577\. Esa es la probabilidad de pasarse del plazo/);
  await close(p);
  // Al revés: el plazo de tabla (z = 1,64) y el exacto valen los dos.
  for (const v of ['28,54', '28,56']) {
    const q = await uncLab('um=m6&uw=1&pred=1&up=0.95&step=4&lang=es');
    assert.match(await predict(q, v), /^Bien\./, v);
    await close(q);
  }
  // σ² = 0 (desde el taller): el paso explica que no hay normal ni z, y no se predice.
  const z = await uncLab('um=m6&lang=es');
  await z.locator('#uncFromWork').click();
  await z.waitForFunction(() => PNL.unc.state().src.kind === 'own');
  await z.locator('#uncWalk').click();
  await z.waitForFunction(() => PNL.app.state().uw === 1);
  await go(z, 3);
  await z.waitForFunction(() => document.querySelectorAll('#uncSteps li').length === 4);
  assert.match((await z.locator('#uncSteps li').allInnerTexts())[3], /σ² = 0: sin incertidumbre/);
  assert.equal(await z.locator('#uncNext').isDisabled(), true, 'último paso');
  await axe(z, 'F4a · M6 · paso a paso con σ² = 0');
  await close(z);
});

// ---------- F4a, T012: «Aprende más» de M5 y M6 ----------

check('F4a T012 · «Aprende más» de M5 y de M6 se carga al abrirlo, en el idioma de la página, con sus referencias', async () => {
  const p = await uncLab('lang=es');
  assert.equal(await p.evaluate(() => performance.getEntriesByType('resource').some((e) => /learn-unc\.js/.test(e.name))), false, 'no viene con la pestaña');
  await p.locator('#uncLearn').click();
  await p.locator('#learnDialog[open]').waitFor();
  assert.equal(await p.locator('#learnTitle').innerText(), 'Tres tiempos: de dónde salen las fórmulas');
  const heads = await p.locator('#learnBody h3').allInnerTexts();
  assert.deepEqual(heads, ['La idea del PERT', 'Dos betas para las mismas fórmulas', 'La triangular', 'Supuestos', 'Referencias']);
  assert.match(await p.locator('#learnBody').innerText(), /varianza 4,89/);
  assert.equal(await p.locator('#learnBody li').count(), 6);
  await axe(p, 'F4a · «Aprende más» de M5');
  await p.keyboard.press('Escape');
  assert.equal(await p.locator('#learnDialog[open]').count(), 0);
  await p.locator('#uncM6').click();
  await p.waitForFunction(() => PNL.app.state().um === 'm6');
  await p.locator('#uncLearn').click();
  await p.locator('#learnDialog[open]').waitFor();
  assert.equal(await p.locator('#learnTitle').innerText(), 'El TCL y sus trampas');
  assert.match(await p.locator('#learnBody').innerText(), /tres aproximaciones/);
  await p.locator('#btnLearnClose').click();
  await close(p);
  const e = await uncLab('um=m6&ux=merge&lang=en', { scheme: 'dark' });
  await e.locator('#uncLearn').click();
  await e.locator('#learnDialog[open]').waitFor();
  assert.equal(await e.locator('#learnTitle').innerText(), 'The CLT and its pitfalls');
  assert.match(await e.locator('#learnBody').innerText(), /MacCrimmon and Ryavec, 1964/);
  await axe(e, 'F4a · «Aprende más» de M6, tema oscuro');
  await close(e);
});

// ---------- Contador de la portada (constitución v2.1.0) ----------

const COUNT_FAKE = '12,345';

check('Contador · la portada muestra en el pie las páginas vistas en su idioma; el laboratorio no llama a GoatCounter', async () => {
  const p = await open('index.html?lang=es');
  await p.waitForFunction(() => !document.getElementById('visitCount').hidden);
  assert.equal(await p.locator('#visitCount').innerText(), 'Páginas vistas: 12.345');
  assert.equal(await p.locator('footer #visitCount').count(), 1);
  assert.match(await p.locator('[data-i18n="statsNote"]').innerText(), /sin cookies/);
  await p.locator('button[data-lang="en"]').click();
  await p.waitForFunction(() => document.getElementById('visitCount').textContent === 'Page views: 12,345');
  const hits = p.context().counterHits;
  assert.ok(hits.some((u) => u.endsWith('/count.js')), 'carga count.js');
  assert.ok(hits.some((u) => u.includes('/counter/%2Fproject-network-lab%2F.json')), 'lee el total de la ruta de la portada');
  await axe(p, 'Portada con el contador');
  await close(p);
  for (const url of ['cpm.html#v=route&ex=ej6&step=0&lang=es', 'cpm.html#v=work&lang=es', 'cpm.html#v=unc&lang=es']) {
    const q = await open(url);
    await q.waitForTimeout(200);
    assert.deepEqual(q.context().counterHits, [], `${url} no llama a GoatCounter`);
    await close(q);
  }
});

check('Contador · sin respuesta de GoatCounter no aparece y la portada funciona igual', async () => {
  const ctx = await browser.newContext();
  await ctx.unrouteAll();
  await ctx.route(/goatcounter\.com|gc\.zgo\.at/, (route) => route.abort());
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  await page.goto(`${BASE}/index.html?lang=es`);
  await page.waitForTimeout(300);
  assert.equal(await page.locator('#visitCount').isVisible(), false);
  assert.equal(await page.locator('button[data-lang="en"]').isEnabled(), true, 'el cambio de idioma sigue activo');
  assert.deepEqual(errs, []);
  await ctx.close();
});


check('F4a T013 · portada y pestaña abren M5 y M6 en ES y EN (y M7 desde F4b T013)', async () => {
  const noJs = await open('index.html', { js: false });
  for (const um of ['m5', 'm6', 'm7']) assert.equal(await noJs.locator(`a[data-lab="${um}"]`).getAttribute('href'), `cpm.html#v=unc&um=${um}&lang=es`);
  await close(noJs);
  for (const lang of ['es', 'en']) {
    for (const um of ['m5', 'm6', 'm7']) {
      const p = await open(`index.html?lang=${lang}`);
      const card = p.locator('article').filter({ has: p.locator(`a[data-lab="${um}"]`) });
      assert.equal(await card.locator('.ok').innerText(), lang === 'es' ? 'Disponible' : 'Available');
      await card.locator('a').click();
      await p.waitForFunction(() => window.PNL && PNL.unc && PNL.unc.state && PNL.unc.state());
      assert.deepEqual([(await state(p)).v, (await state(p)).um, (await state(p)).lang], ['unc', um, lang]);
      assert.equal(await p.locator('#navUnc').getAttribute('aria-current'), 'page');
      await close(p);
    }
    const p = await lab(`v=work&lang=${lang}`);
    assert.equal(await p.evaluate(() => !!PNL.unc), false);
    await p.locator('#navUnc').focus();
    await p.keyboard.press('Enter');
    await p.waitForFunction(() => PNL.unc && PNL.unc.state && PNL.unc.state());
    assert.equal((await state(p)).v, 'unc');
    await p.goBack();
    await p.waitForFunction(() => PNL.app.state().v === 'work');
    await close(p);
  }
});

check('F4a T013 · «Ajustes»: cerrado al abrir; se abre con el ratón y con el teclado, Esc lo cierra y devuelve el foco, pulsar fuera lo cierra; axe con el panel abierto', async () => {
  for (const [lang, label] of [['es', 'Ajustes'], ['en', 'Settings']]) {
    for (const scheme of ['light', 'dark']) {
      const page = await lab(`v=route&ex=ej6&step=3&lang=${lang}`, { scheme });
      const s = page.locator('#settings');
      const sum = s.locator('summary');
      assert.equal((await sum.innerText()).replace('▾', '').trim(), label);
      assert.equal(await s.evaluate((d) => d.open), false);
      assert.equal(await page.locator('#selLang').isVisible(), false);
      // Con el teclado: Intro abre; la barra espaciadora también, sin poner en marcha la ruta guiada.
      await sum.focus();
      await page.keyboard.press('Enter');
      assert.equal(await s.evaluate((d) => d.open), true);
      for (const id of ['#selLang', '#selNota', '#selBox']) assert.equal(await page.locator(id).isVisible(), true, id);
      await axe(page, `Ajustes abierto (${lang}, ${scheme})`);
      await page.keyboard.press('Escape');
      assert.equal(await s.evaluate((d) => d.open), false);
      assert.equal(await page.evaluate(() => document.activeElement.tagName), 'SUMMARY');
      const before = (await state(page)).step;
      await page.keyboard.press(' ');
      assert.equal(await s.evaluate((d) => d.open), true);
      await page.waitForTimeout(1500);
      assert.equal((await state(page)).step, before, 'la barra espaciadora en «Ajustes» no reproduce la ruta');
      // Pulsar fuera lo cierra; un cambio dentro se aplica y queda en el enlace.
      await page.mouse.click(400, 400);
      assert.equal(await s.evaluate((d) => d.open), false);
      await setCtl(page, '#selNota', 'es');
      assert.equal((await state(page)).nota, 'es');
      await close(page);
    }
  }
  // A 360 px el panel abierto no desborda la página.
  const page = await lab('v=unc&um=m5&lang=es', { width: 360, height: 740 });
  await page.locator('#settings summary').click();
  const box = await page.locator('#settingsPanel').evaluate((el) => { const r = el.getBoundingClientRect(); return { l: r.left, r: r.right, w: document.documentElement.scrollWidth }; });
  assert.ok(box.l >= 0 && box.r <= 360 && box.w <= 360, JSON.stringify(box));
  await close(page);
});

// ---------- F4a, T014: accesibilidad, teclado y tamaños de «Duraciones inciertas» (AC15 y AC16) ----------

// Todas las vistas de la pestaña: M5 con Klastorin, Hillier (beta clásica y red PERT) y la tabla propia; M6 con cada caso,
// y el cálculo de examen con los cuatro ejemplos (las dos rutas y la paralelización solo existen en M6).
const UNC_VIEWS = ['um=m5&ue=kl', 'um=m5&ue=hl&uc=1&graph=aoa', 'OWN',
  'um=m6&ux=exam', 'um=m6&ux=exam&ue=hl', 'um=m6&ux=exam&ue=tr', 'um=m6&ux=exam&ue=pa',
  'um=m6&ux=merge', 'um=m6&ux=few', 'um=m6&ux=skew', 'um=m6&ux=corr', 'um=m6&ux=proj', 'um=m6&ux=proj&ue=hl'];
// La tabla propia sale de mover un deslizador de Klastorin: su enlace lleva la tabla en `ut`.
async function uncOwnHash(lang) {
  const p = await uncLab(`lang=${lang}`);
  await p.locator('#uncSl-a').focus();
  await p.keyboard.press('ArrowRight');
  await uncAfter(p, () => PNL.unc.state().src.kind === 'own');
  const hash = await p.evaluate(() => location.hash.slice(1));
  await close(p);
  return hash;
}
// Abre una vista en la misma página (cambiando el enlace) y espera a que se pinte y, si simula, a que termine.
async function uncShow(page, hash) {
  await setHash(page, hash);
  // Primero el estado de la vista pedida (apartado, ejemplo y caso); después, la simulación de esa vista terminada.
  await page.waitForFunction((h) => {
    const q = new URLSearchParams(h); const a = PNL.app.state();
    return !document.getElementById('uncView').hidden && (q.get('um') || 'm5') === a.um && (q.get('ue') || 'kl') === a.ue && (q.get('ux') || 'exam') === a.ux;
  }, hash, { timeout: 20000 }).catch(async (e) => { throw new Error(`${hash.slice(0, 80)}: ${JSON.stringify(await page.evaluate(() => { const a = PNL.app.state(); return [a.um, a.ue, a.ux, location.hash.slice(0, 80)]; }))} ${e.message}`); });
  await page.waitForTimeout(250);
  await page.waitForFunction(() => { const s = PNL.unc.state(); return s && (!s.sim || s.sim.done); }, null, { timeout: 20000 });
}
// Cada gráfico de la pestaña lleva su texto: role="img" con una etiqueta que no está vacía; el histograma, además, su tabla.
const uncCharts = (page) => page.evaluate(() => [...document.querySelectorAll('#uncView svg')].filter((s) => !s.parentElement.closest('svg'))
  .map((s) => ({ id: s.parentElement.id || s.id, role: s.getAttribute('role'), label: (s.getAttribute('aria-label') || '').trim(), hidden: s.getAttribute('aria-hidden') === 'true' })));

check('F4a T014 · AC15: axe sin violaciones en claro y oscuro, ES y EN, en M5 y en cada caso de M6; cada gráfico con su texto; a 1280×720, sin desplazamiento horizontal y la cabecera en una fila', async () => {
  for (const lang of ['es', 'en']) {
    const own = await uncOwnHash(lang);
    for (const scheme of ['light', 'dark']) {
      const page = await uncLab(`lang=${lang}`, { scheme });
      for (const v of UNC_VIEWS) {
        const hash = v === 'OWN' ? own : `v=unc&${v}&lang=${lang}`;
        await uncShow(page, hash);
        const label = `F4a T014 · ${v} (${lang}, ${scheme})`;
        await axe(page, label);
        const charts = await uncCharts(page);
        assert.ok(charts.length >= 1, `${label}: sin gráfico`);
        for (const c of charts) assert.ok(c.hidden || (c.role === 'img' && c.label.length > 10), `${label}: el gráfico de #${c.id} no tiene texto (${JSON.stringify(c)})`);
        // La red se anuncia una sola vez como red (antes, «Red ROY de Red de …»).
        for (const c of charts) assert.doesNotMatch(c.label, /\b(red|network) (de|of) (red|network)\b/i, `${label}: ${c.label}`);
        if (v === 'um=m5&ue=kl') {
          const net = charts.find((c) => c.id === 'uncNet');
          assert.equal(net.label, lang === 'es' ? 'Red ROY de Proyecto informático de 6 tareas (Klastorin), con las medias como duraciones: 6 actividades'
            : `Activity-on-node network of ${await page.evaluate(() => PNL.unc.state().src.title)}, with the means as durations: 6 activities`);
        }
        if (charts.some((c) => c.id === 'uncSimChart')) assert.equal(await page.locator('#uncBins').count(), 1, `${label}: el histograma sin «Ver como tabla»`);
        const box = await page.evaluate(() => ({ w: document.documentElement.scrollWidth, vw: window.innerWidth, head: document.querySelector('.site-head').getBoundingClientRect().height }));
        assert.ok(box.w <= box.vw + 1, `${label}: desplazamiento horizontal (${box.w} px)`);
        assert.ok(box.head <= 70, `${label}: la cabecera ocupa ${box.head} px`);
      }
      await close(page);
    }
  }
});

check('F4a T014 · AC15: a 360 px ninguna vista de la pestaña desplaza la página a lo ancho, en ES y EN', async () => {
  for (const lang of ['es', 'en']) {
    const own = await uncOwnHash(lang);
    const page = await uncLab(`lang=${lang}`, { width: 360, height: 740 });
    for (const v of UNC_VIEWS) {
      await uncShow(page, v === 'OWN' ? own : `v=unc&${v}&lang=${lang}`);
      const w = await page.evaluate(() => ({ w: document.documentElement.scrollWidth, vw: window.innerWidth }));
      assert.ok(w.w <= w.vw + 1, `${v} (${lang}) a 360 px: ${w.w} px`);
    }
    await shot(page, `f4a-t014-360-${lang}`, true);
    await close(page);
  }
});

check('F4a T014 · AC15: con el teclado, los deslizadores de M5 (a ≤ m ≤ b) y de cada caso de M6 se mueven con las flechas, Inicio y Fin, el foco se ve y no se pierde', async () => {
  const focusOk = (page) => page.evaluate(() => { const cs = getComputedStyle(document.activeElement); return cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) >= 2; });
  // M5: el tabulador llega a a, m y b en orden; cada tecla mueve medio día y respeta a ≤ m ≤ b.
  const p = await uncLab('lang=es');
  await p.locator('#uncSl-a').focus();
  assert.ok(await focusOk(p), 'foco visible en a');
  for (const id of ['uncSl-m', 'uncSl-b']) { await p.keyboard.press('Tab'); assert.equal(await activeId(p), id); }
  const val = (id) => p.locator(`#${id}`).inputValue().then(Number);
  await p.locator('#uncSl-m').focus();
  const m0 = await val('uncSl-m');
  await p.keyboard.press('ArrowRight');
  await uncAfter(p, () => PNL.unc.state().src.kind === 'own');
  assert.equal(await val('uncSl-m'), m0 + 0.5);
  assert.equal(await activeId(p), 'uncSl-m', 'el foco sigue en el deslizador tras recalcular');
  await p.keyboard.press('Home');
  await p.waitForTimeout(200);
  assert.equal(await val('uncSl-m'), await val('uncSl-a'), 'm no baja de a');
  await p.keyboard.press('End');
  await p.waitForTimeout(200);
  assert.equal(await val('uncSl-m'), await val('uncSl-b'), 'm no sube de b');
  assert.ok(await focusOk(p), 'foco visible en m');
  await close(p);
  // M6: cada deslizador de cada caso cambia su valor en el enlace y vuelve a simular sin perder el foco.
  for (const [ux, ids] of [['merge', ['n', 's']], ['few', ['k']], ['skew', ['w']], ['corr', ['r']]]) {
    const q = await uncLab(`um=m6&ux=${ux}&lang=es`);
    await simDone(q);
    for (const k of ids) {
      const id = `uncK-${k}`;
      await q.locator(`#${id}`).focus();
      assert.ok(await focusOk(q), `foco visible en #${id}`);
      const before = await q.locator(`#${id}`).inputValue();
      await q.keyboard.press(before === (await q.locator(`#${id}`).getAttribute('max')) ? 'ArrowLeft' : 'ArrowRight');
      await q.waitForFunction(([x, b]) => new URLSearchParams(location.hash.slice(1)).get('uk') && document.getElementById(x).value !== b, [id, before]);
      await q.waitForFunction(() => { const s = PNL.unc.state().sim; return s && s.done; }, null, { timeout: 20000 });
      assert.notEqual(await q.locator(`#${id}`).inputValue(), before, `#${id} no se movió`);
      assert.match(await hashGet(q, 'uk'), new RegExp(`${k}`), `#${id} no llega al enlace`);
      assert.equal(await activeId(q), id, `#${id} pierde el foco al simular`);
    }
    // «Ver como tabla» se abre y se cierra con el teclado.
    await q.locator('#uncBins').focus();
    await q.keyboard.press('Enter');
    await q.waitForFunction(() => document.getElementById('uncBins').getAttribute('aria-expanded') === 'true');
    assert.equal(await q.locator('#uncBinsTable tbody tr').count(), 40);
    assert.equal(await activeId(q), 'uncBins');
    await close(q);
  }
  // Los casos de M6 se eligen con el teclado: Intro en un caso lo abre.
  const c = await uncLab('um=m6&lang=es');
  await c.locator('#uncCase-corr').focus();
  await c.keyboard.press('Enter');
  await uncAfter(c, () => PNL.app.state().ux === 'corr');
  await close(c);
});

check('F4a T014 · AC16: la pestaña con M6 y con «Aprende más» abierto sigue por debajo de 1 MB', async () => {
  for (const hash of ['v=unc&um=m6&ux=proj&lang=es', 'v=unc&um=m5&ue=kl&lang=en']) {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.goto(`${BASE}/cpm.html#${hash}`, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => window.PNL && PNL.unc && PNL.unc.state && PNL.unc.state());
    await page.locator('#uncLearn').click();
    await page.locator('#learnDialog[open]').waitFor();
    await page.waitForLoadState('networkidle');
    const bytes = await page.evaluate(() => [...performance.getEntriesByType('navigation'), ...performance.getEntriesByType('resource')]
      .reduce((sum, e) => sum + (e.encodedBodySize || e.transferSize || 0), 0));
    console.log(`    cpm.html#${hash} + «Aprende más»: ${(bytes / 1024).toFixed(0)} KB`);
    assert.equal(await page.evaluate(() => performance.getEntriesByType('resource').some((e) => /learn-unc\.js/.test(e.name))), true);
    assert.ok(bytes <= BUDGET, `${hash} con «Aprende más»: ${bytes} bytes`);
    await ctx.close();
  }
});

// ---------- F4a, T015: lo que encontró la evidencia ----------

// Tabla propia de la pestaña en el enlace (`ut`).
const ownUrl = (rows, extra) => U4.encode(Object.assign(U4.defaults(), { v: 'unc', ue: 'own', lang: 'es', ut: { mode: 'pred', rows } }, extra || {})).slice(1);
const ownRow = (id, a, m, b, links = '') => ({ id, name: '', a: String(a), m: String(m), b: String(b), links });
const ownStats = (page) => page.locator('#uncOwn tbody tr').evaluateAll((trs) => trs.map((tr) => [...tr.querySelectorAll('td[data-out]')].map((td) => td.textContent)));

check('F4a T015 · tabla propia: μ y σ² de cada fila (tₑ con la notación española), «—» con errores y al día mientras se escribe', async () => {
  const p = await uncLab(ownUrl([ownRow('A', 2, 4, 6), ownRow('B', 1, 4, 9, 'A'), ownRow('D', 3, 3, 3, 'A')]));
  const heads = await p.locator('#uncOwn thead th').allInnerTexts();
  assert.deepEqual(heads.slice(6, 8), ['μ', 'σ²']);
  assert.deepEqual(await ownStats(p), [['4', '0,44'], ['4,33', '1,78'], ['3', '0']]);
  // Al escribir, la tabla no se rehace (el foco sigue en la casilla) y las cifras cambian en su sitio.
  await p.locator('#uncT-1-b').fill('13');
  await uncAfter(p, () => PNL.unc.state().acts.some((a) => a.id === 'B' && Math.abs(a.mean - 5) < 1e-9));
  assert.equal(await activeId(p), 'uncT-1-b');
  assert.deepEqual((await ownStats(p))[1], ['5', '4']);
  // Con un error no se calcula: «—» en todas las filas.
  await p.locator('#uncT-0-a').fill('5');
  await uncAfter(p, () => PNL.unc.state().issues.length === 1);
  assert.deepEqual(await ownStats(p), [['—', '—'], ['—', '—'], ['—', '—']]);
  await axe(p, 'F4a · M5 · tabla propia con μ y σ²');
  await close(p);
  const e = await uncLab(ownUrl([ownRow('A', 2, 4, 6)], { nota: 'es', lang: 'en' }));
  assert.deepEqual((await e.locator('#uncOwn thead th').allInnerTexts()).slice(6, 8), ['tₑ', 'σ²']);
  assert.deepEqual(await ownStats(e), [['4', '0.44']]);
  await close(e);
  // A 360 px la tabla se desplaza dentro de su región, no la página.
  const n = await uncLab(ownUrl([ownRow('A', 2, 4, 6), ownRow('B', 1, 4, 9, 'A')]), { width: 360, height: 740 });
  assert.equal(await n.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), true, 'sin desbordar a lo ancho');
  await close(n);
});

check('F4a T015 · pista de z en la predicción de M6: con la tabla a dos decimales y sin redondear a cuatro', async () => {
  const p = await uncLab('um=m6&uw=1&pred=1&step=3&lang=es');
  assert.match(await predict(p, '0,14'), /Con la tabla, 0,41; sin redondear, 0,4062\./);
  await close(p);
  const e = await uncLab('um=m6&uw=1&pred=1&step=3&lang=en');
  assert.match(await predict(e, '0.14'), /With the table, 0\.41; without rounding, 0\.4062\./);
  await close(e);
  const i = await uncLab('um=m6&uw=1&pred=1&up=0.95&step=3&lang=es');
  assert.match(await predict(i, '1'), /Con la tabla, 1,64; sin redondear, 1,6449\./);
  await close(i);
});

// ---------- F4a, T017: revisión de nivel 2, ronda 1 ----------

require(path.join(ROOT, 'js', 'i18n-unc.js'));
const tuEs = (k, p) => I0.t('es', `unc.${k}`, p);
const setRange = (page, sel, v) => page.locator(sel).evaluate((el, val) => { el.value = String(val); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); }, v);

check('F4a T017 · «Taller» desde «Duraciones inciertas» abre el taller (F1) y «Partir del taller» copia la tabla editada con su forma (F5)', async () => {
  const p = await uncLab('lang=es');
  await p.locator('#navWork').click();
  await p.waitForFunction(() => PNL.app.state().v === 'work');
  assert.equal((await state(p)).t.length, require(path.join(ROOT, 'js', 'core', 'examples.js')).get('ej6').rows.length, 'el taller con el ejemplo que mostraba');
  await close(p);
  // Una tabla editada en el taller, en forma de posteriores: «Partir del taller» la copia tal cual, con a = m = b.
  const rows = [{ id: 'P', name: 'Primera', duration: '3', links: 'Q, R' }, { id: 'Q', name: '', duration: '2', links: 'R' }, { id: 'R', name: '', duration: '4', links: '' }];
  const w = await lab(U4.encode(Object.assign(U4.defaults(), { v: 'work', ex: null, t: rows, mode: 'succ', lang: 'es' })).slice(1));
  await w.locator('#navUnc').click();
  await w.waitForFunction(() => PNL.unc && PNL.unc.state && PNL.unc.state());
  await w.locator('#uncFromWork').click();
  await uncAfter(w, () => PNL.unc.state().src.kind === 'own');
  const st = await uncSt(w);
  assert.equal(st.src.mode, 'succ');
  assert.deepEqual(st.src.rows.map((r) => [r.id, r.name, r.a, r.m, r.b, r.links]), [['P', 'Primera', '3', '3', '3', 'Q, R'], ['Q', '', '2', '2', '2', 'R'], ['R', '', '4', '4', '4', '']]);
  assert.deepEqual(st.path, ['P', 'Q', 'R']);
  await w.locator('#navWork').click();
  await w.waitForFunction(() => PNL.app.state().v === 'work');
  assert.deepEqual((await state(w)).t.map((r) => r.id), ['P', 'Q', 'R'], 'el taller no cambia');
  await close(w);
});

check('F4a T017 · tabla propia con identificadores en minúsculas: se calcula al escribir y al abrir el enlace (F2)', async () => {
  const p = await uncLab(ownUrl([ownRow('a', 2, 4, 6), ownRow('b', 1, 4, 9, 'a')]));
  const st = await uncSt(p);
  assert.deepEqual([st.issues.length, st.acts.map((a) => a.id)], [0, ['A', 'B']]);
  assert.deepEqual(await ownStats(p), [['4', '0,44'], ['4,33', '1,78']]);
  await p.locator('#uncT-1-id').fill('c');
  await p.locator('#uncT-1-id').fill('b');
  await uncAfter(p, () => PNL.unc.state().acts.length === 2);
  await close(p);
});

check('F4a T017 · la probabilidad y el plazo escritos se muestran con sus decimales (F4)', async () => {
  const p = await uncLab('um=m6&up=0.975&lang=es');
  const steps = (await p.locator('#uncSteps li').allInnerTexts()).join('\n');
  assert.match(steps, /0,975/);
  assert.doesNotMatch(steps, /Φ\(z\) = 0,98 /);
  assert.match(await p.locator('#uncExamResult').innerText(), /P = 0,975/);
  assert.equal(await p.locator('#uncProb').inputValue(), '0,975');
  await close(p);
  const q = await uncLab('um=m6&ud=25.125&lang=en');
  assert.match((await q.locator('#uncSteps li').allInnerTexts()).join('\n'), /25\.125/);
  assert.equal(await q.locator('#uncDeadline').inputValue(), '25.125');
  await close(q);
});

check('F4a T017 · con más de 50 caminos, M6 calcula el examen y simula el proyecto entero sin lista (F3)', async () => {
  const rows = [];
  for (let i = 0; i < 6; i++) for (const j of [0, 1]) rows.push(ownRow(`L${i}S${j}`, 1, 2, j ? 5 : 4, i ? `L${i - 1}S0, L${i - 1}S1` : ''));
  const p = await uncLab(ownUrl(rows, { um: 'm6' }));
  assert.match((await p.locator('#uncSteps li').allInnerTexts())[0], /L0S1–L1S1–L2S1–L3S1–L4S1–L5S1/);
  await p.locator('#uncCase-proj').click();
  await uncAfter(p, () => PNL.unc.state().sim && PNL.unc.state().sim.done);
  assert.equal(await p.locator('#uncPaths tbody tr').count(), 1, 'solo el crítico del cálculo de examen');
  assert.equal(await p.locator('#uncPathsMany').innerText(), tuEs('proj.tooMany', { n: '64' }));
  await close(p);
  // 7 rombos en serie: 128 caminos críticos de las medias; se usa el de mayor σ² (el de todas las Y) y se dice cuántos hay.
  const d = [];
  for (let i = 0; i < 7; i++) d.push(ownRow(`S${i}`, 1, 1, 1, i ? `X${i - 1}, Y${i - 1}` : ''), ownRow(`X${i}`, 5, 5, 5, `S${i}`), ownRow(`Y${i}`, 2, 5, 8, `S${i}`));
  d.push(ownRow('Z', 1, 1, 1, 'X6, Y6'));
  const q = await uncLab(ownUrl(d, { um: 'm6' }));
  const first = (await q.locator('#uncSteps li').allInnerTexts())[0];
  assert.match(first, /S0–Y0–S1–Y1–S2–Y2–S3–Y3–S4–Y4–S5–Y5–S6–Y6–Z/);
  assert.match(first, /Hay otros 127 caminos críticos de las medias, por ejemplo: /);
  assert.equal((await q.locator('#uncSteps li').allInnerTexts())[2].endsWith('= 7,00'), true, 'σ² del camino');
  await close(q);
});

check('F4a T017 · con un solo camino más de los que se listan: «y 1 camino más» (nit)', async () => {
  const p = await uncLab('um=m6&ux=proj&lang=es');
  await p.locator('#uncFromWork').click();
  await uncAfter(p, () => PNL.unc.state().src.kind === 'own' && PNL.unc.state().sim && PNL.unc.state().sim.done);
  assert.equal(await p.locator('#uncPaths tbody tr').count(), 8);
  assert.equal(await p.locator('#uncPathsMore').innerText(), tuEs('proj.moreOne'));
  await close(p);
});

check('F4a T017 · σ² = 0 en el proyecto entero: el gráfico sin NaN y la normal en 1 (F13, F7)', async () => {
  const p = await uncLab(ownUrl([ownRow('A', 5, 5, 5), ownRow('B', 3, 3, 3, 'A')], { um: 'm6', ux: 'proj' }));
  await uncAfter(p, () => PNL.unc.state().sim && PNL.unc.state().sim.done);
  assert.doesNotMatch(await p.locator('#uncSimChart svg').evaluate((el) => el.outerHTML), /NaN/);
  assert.deepEqual(await p.locator('#uncProb tbody td').allInnerTexts(), ['1,000', '8,00', '1,000', '8,00']);
  await close(p);
});

check('F4a T017 · en M6, al dejar válida la tabla propia escribiendo, se ve el cálculo de examen y no M5 (F14)', async () => {
  const p = await uncLab('um=m6&lang=es');
  await p.locator('#uncProj').selectOption('own');
  await uncAfter(p, () => PNL.unc.state().src.kind === 'own' && document.getElementById('uncIssues'));
  await p.locator('#uncT-0-a').fill('1');
  await p.locator('#uncT-0-m').fill('2');
  await p.locator('#uncT-0-b').fill('4');
  await uncAfter(p, () => document.getElementById('uncSteps'));
  assert.equal(await p.locator('#uncActHead').count(), 0, 'sin la tarjeta de la actividad de M5');
  assert.equal(await p.locator('#uncExamHead').count(), 1);
  await close(p);
});

check('F4a T017 · M5: la tabla comparativa dice 4,89 de la curva frente a 4 de examen (F8, AC4); con notación española, tₒ tₘ tₚ (F19)', async () => {
  const p = await uncLab('lang=es');
  const rows = await p.locator('#uncCmp tbody tr').evaluateAll((trs) => trs.map((tr) => [...tr.querySelectorAll('td')].map((td) => td.textContent)));
  assert.deepEqual(rows, [['6,67', '6,67', '7,33'], ['4', '4,89', '6,22']]);
  // La red con las medias resalta el camino crítico A–C–E–F (F20).
  assert.equal(await p.locator('#uncNet rect.box.crit').count(), 4);
  await close(p);
  const e = await uncLab(ownUrl([ownRow('A', 2, 4, 6)], { nota: 'es' }));
  assert.deepEqual((await e.locator('#uncOwn thead th').allInnerTexts()).slice(2, 5), ['tₒ', 'tₘ', 'tₚ']);
  await close(e);
});

check('F4a T017 · fusión: mover la holgura conserva el número de caminos en el estado y en el enlace (F9)', async () => {
  const p = await uncLab('um=m6&ux=merge&lang=es');
  await setRange(p, '#uncK-n', 6);
  await p.waitForFunction(() => PNL.app.state().uk && PNL.app.state().uk.n === 6);
  await setRange(p, '#uncK-s', 2);
  await p.waitForFunction(() => PNL.app.state().uk && PNL.app.state().uk.s === 2);
  assert.equal((await state(p)).uk.n, 6);
  assert.match(await hashGet(p, 'uk'), /n6/);
  await close(p);
});

check('F4a T017 · empates de las medias: se nombran los otros caminos críticos con su σ² (F10, AC18)', async () => {
  const p = await uncLab(ownUrl([ownRow('A', 1, 2, 3), ownRow('B', 0, 2, 4)], { um: 'm6' }));
  const first = (await p.locator('#uncSteps li').allInnerTexts())[0];
  assert.match(first, /^Camino crítico de las medias\s+B /);
  assert.ok(first.includes(tuEs('exam.ties', { list: tuEs('exam.tie', { path: 'A', var: '0,11' }) })), first);
  await close(p);
});

check('F4a T017 · M6 con predicción: el paso actual no enseña su valor (F11) y el resultado dice tabla y exacta en su orden (F12)', async () => {
  const p = await uncLab('um=m6&uw=1&pred=1&step=1&lang=es');
  const cur = await p.locator('#uncSteps li.cur').innerText();
  assert.doesNotMatch(cur, /23,83/);
  assert.match(cur, new RegExp(tuEs('walk.yours').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  await close(p);
  const q = await uncLab('um=m6&lang=es');
  assert.match(await q.locator('#uncExamResult').innerText(), new RegExp(tuEs('exam.result', { T: '25', p4: '0,6591', exact: '0,6577' }).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  await close(q);
});

check('F4a T017 · el histograma no se recorta: la barra más alta queda por debajo del borde (F15)', async () => {
  const p = await uncLab('um=m6&ux=few&uk=k1&lang=es');
  await uncAfter(p, () => PNL.unc.state().sim && PNL.unc.state().sim.done);
  const top = await p.locator('#uncSimChart rect').evaluateAll((rs) => Math.min(...rs.map((r) => Number(r.getAttribute('y')))));
  assert.ok(top > 18 + 5, `y de la barra más alta: ${top}`);
  await close(p);
});

check('F4a T017 r2 · «Taller» desde la pestaña conserva la forma del ejemplo (F1) y la tabla propia en minúsculas cambia de forma bien (F6)', async () => {
  const p = await uncLab('lang=es');
  await p.locator('#navWork').click();
  await p.waitForFunction(() => PNL.app.state().v === 'work');
  assert.equal((await state(p)).mode, require(path.join(ROOT, 'js', 'core', 'examples.js')).get('ej6').mode);
  await close(p);
  const q = await uncLab(ownUrl([ownRow('a', 2, 4, 6), ownRow('b', 1, 4, 9, 'a')]));
  await q.locator('#uncMode-succ').check();
  await uncAfter(q, () => PNL.unc.state().src.mode === 'succ');
  const st = await uncSt(q);
  assert.deepEqual(st.src.rows.map((r) => r.links), ['B', '']);
  assert.deepEqual(st.path, ['A', 'B']);
  await close(q);
});

check('F4a T017 r2 · lo escrito con sus decimales en todas partes, sin separador de miles (F7), y el plazo calculado con 2 (F11)', async () => {
  const p = await uncLab('um=m6&ux=proj&ud=25.1255&lang=es');
  await uncAfter(p, () => PNL.unc.state().sim && PNL.unc.state().sim.done);
  for (const sel of ['#uncProbHead', '#uncPaths thead', '#uncSimChart .dc-vlabel']) {
    const text = await p.locator(sel).first().innerText().catch(() => p.locator(sel).first().textContent());
    assert.match(text, /25,1255/, sel);
  }
  assert.match(await p.locator('#uncSimChart svg').getAttribute('aria-label'), /25,1255/);
  assert.equal(await p.locator('#uncDeadline').inputValue(), '25,1255');
  await close(p);
  const q = await uncLab('um=m6&ud=12000.5&lang=es');
  assert.equal(await q.locator('#uncDeadline').inputValue(), '12000,5');
  assert.match((await q.locator('#uncSteps li').allInnerTexts()).join('\n'), /12000,5/);
  await close(q);
  // Plazo para una probabilidad: el plazo es calculado, con 2 decimales en el texto, el gráfico y su etiqueta.
  const r = await uncLab('um=m6&up=0.9&lang=es');
  assert.equal(await r.locator('#uncNormal .dc-vlabel').textContent(), tuEs('exam.deadline', { T: '27,51' }));
  assert.doesNotMatch(await r.locator('#uncNormal svg').getAttribute('aria-label'), /27,514/);
  await close(r);
});

check('F4a T017 r2 · con más de 50 críticos se nombran 5 de los otros (nit F10)', async () => {
  const d = [];
  for (let i = 0; i < 7; i++) d.push(ownRow(`S${i}`, 1, 1, 1, i ? `X${i - 1}, Y${i - 1}` : ''), ownRow(`X${i}`, 5, 5, 5, `S${i}`), ownRow(`Y${i}`, 2, 5, 8, `S${i}`));
  d.push(ownRow('Z', 1, 1, 1, 'X6, Y6'));
  const p = await uncLab(ownUrl(d, { um: 'm6' }));
  const first = (await p.locator('#uncSteps li').allInnerTexts())[0];
  assert.equal((first.match(/\(σ² = /g) || []).length, 5, first);
  await close(p);
});

// ---------- F4b, T010: M7, distribución de la duración e índices (oculto hasta T013) ----------

const M7N = require(path.join(ROOT, 'js', 'm7.js'));
const M7L = require(path.join(ROOT, 'js', 'learn-m7.js'));
const m7Lab = (hash, opts) => uncLab(`um=m7${hash ? `&${hash}` : ''}`, opts);
const m7St = (page) => page.evaluate(() => PNL.unc.state().m7);
// Espera a que la simulación (y, si se piden, los índices) del estado actual terminen.
const m7Done = async (page, idx) => {
  await page.waitForFunction((withIdx) => { const s = PNL.unc.state(); return s && s.m7 && s.m7.done && (!withIdx || s.m7.idx); }, !!idx, { timeout: 30000 });
  return m7St(page);
};
// Lo mismo en Node, con el núcleo, a partir del enlace de la página (reproducible, AC6 y AC14).
async function m7Node(page) {
  const st = U4.decode(await page.evaluate(() => location.hash)).state;
  const m = M7N.model(st, st.lang || 'es');
  const res = SIMC.run({ kind: 'project', model: m.sim.model, n: m.sim.n, us: m.sim.us, track: true });
  return { m, res, r: M7N.results(m, res), idx: require(path.join(ROOT, 'js', 'core', 'mc.js')).indices(res, m.sim.model, { corr: m.corr }) };
}
const m7Groups = (page) => page.evaluate(() => performance.getEntriesByType('resource').filter((e) => /m7\.js|core\/mc\.js|i18n-m7\.js|mc-charts\.js|m7\.css/.test(e.name)).length);

check('F4b T010 · M7 con Klastorin: histograma, función de distribución, percentiles y resultados iguales a los de Node; u7 solo con um=m7', async () => {
  const p0 = await uncLab('lang=es');
  assert.equal(await p0.locator('#uncM7').getAttribute('aria-pressed'), 'false', 'M7 publicado (T013): su botón se ve en M5');
  assert.equal(await m7Groups(p0), 0, 'sin el grupo u7 en M5');
  await close(p0);
  const p = await m7Lab('lang=es');
  assert.equal(await p.locator('#uncM7').getAttribute('aria-pressed'), 'true');
  assert.equal(await m7Groups(p), 5, 'el grupo u7 entero');
  assert.equal(await p.locator('#uncLearn').count(), 1, '«Aprende más» de M7 (T012)');
  assert.equal(await p.locator('#uncWalk').count(), 0, 'en M7 no hay «Paso a paso»');
  const st = await m7Done(p);
  const N = await m7Node(p);
  assert.equal(st.results.mean, N.r.mean);
  assert.equal(st.results.pT, N.r.pT);
  assert.deepEqual(st.results.counts, N.r.hist.counts);
  assert.deepEqual(st.results.q.map((q) => q.sim), N.r.q.map((q) => q.sim));
  assert.ok(st.results.mean > 23.83 && st.results.pT < 0.66, 'AC5');
  assert.equal(await p.locator('#m7Hist svg rect').count() > 20, true, 'histograma');
  assert.equal(await p.locator('#m7Hist path.c-normal').count(), 1, 'normal de M6');
  assert.equal(await p.locator('#m7Cdf path.mc-cdf').count(), 1, 'función de distribución');
  assert.deepEqual(await p.locator('#m7Cdf text.mc-label').allTextContents(), ['P50', 'P80', 'P90', 'P95']);
  assert.match(await p.locator('#m7Cdf svg').getAttribute('aria-label'), /P95 = 29,49/);
  const res = await p.locator('#m7Res tbody tr').allInnerTexts();
  assert.match(res[0], /24,67 ± 0,06\s+23,83/);
  assert.match(res[2], /P\(duración ≤ 25\)\s+0,554 ± 0,010\s+0,658/);
  assert.match(res[6], /P95 \(elegido\)\s+29,49\s+28,56/);
  assert.match(await p.locator('#m7PctText').innerText(), /95\s% .* 29,49 semanas/);
  assert.match(await p.locator('#m7Note').innerText(), /0,658 a 0,554/);
  await p.locator('#m7Bins').click();
  assert.equal(await p.locator('#m7BinsTable tbody tr').count(), 40);
  assert.equal(await activeId(p), 'm7Bins');
  await shot(p, 'f4b-m7-dist');
  await axe(p, 'F4b · M7 · duración del proyecto');
  // Percentil, plazo y réplicas: quedan en el enlace y Node da lo mismo.
  await p.locator('#m7Pct').fill('85'); await p.locator('#m7Pct').press('Enter');
  await uncAfter(p, () => PNL.app.state().uv === 85);
  await p.locator('#m7Deadline').fill('27'); await p.locator('#m7Deadline').press('Enter');
  await uncAfter(p, () => PNL.app.state().ud === 27);
  await p.locator('#m7Reps').selectOption('3');
  await uncAfter(p, () => PNL.app.state().ur === 3);
  const st2 = await m7Done(p);
  const N2 = await m7Node(p);
  assert.equal(st2.results.pT, N2.r.pT);
  assert.deepEqual(st2.results.q.map((q) => q.p), [0.5, 0.8, 0.85, 0.9]);
  assert.equal(await hashGet(p, 'uv'), '85');
  assert.equal(await hashGet(p, 'ud'), '27');
  assert.equal(await hashGet(p, 'ur'), '3');
  await p.locator('#m7Pct').fill('100'); await p.locator('#m7Pct').press('Enter');
  assert.equal(await p.locator('#m7PctErr').isVisible(), true);
  assert.equal((await state(p)).uv, 85);
  // Otro navegador (otro contexto) con el mismo enlace da lo mismo (AC14).
  const q = await open(`cpm.html${await p.evaluate(() => location.hash)}`);
  await q.waitForFunction(() => PNL.unc && PNL.unc.state && PNL.unc.state() && PNL.unc.state().m7);
  assert.deepEqual((await m7Done(q)).results, st2.results);
  await close(q);
  await close(p);
});

check('F4b T010 · índices del Klastorin discreto con la cuenta exacta; Spearman, orden del tornado y red coloreada en el enlace', async () => {
  const p = await m7Lab('ue=kd&uy=idx&lang=es');
  const st = await m7Done(p, true);
  const N = await m7Node(p);
  assert.deepEqual(st.idx, JSON.parse(JSON.stringify(N.idx)));
  const rows = await p.locator('#m7Idx tbody tr').evaluateAll((rs) => rs.map((r) => [...r.cells].map((c) => c.textContent)));
  assert.deepEqual(rows.map((r) => r[0]), ['C', 'D', 'B', 'A'], 'por criticidad');
  assert.deepEqual(rows[0].slice(1), ['0,657', '0,660', '0,592', '0,584', '0,817', '0,817']);
  assert.match(await p.locator('#m7Idx caption').innerText(), /36 combinaciones/);
  assert.match(await p.locator('#m7PathsTie').innerText(), /Suman 1,046/);
  assert.equal(await p.locator('#m7Tor rect.mc-bar.crit').count(), 4);
  assert.match(await p.locator('#m7Tor svg').getAttribute('aria-label'), /C, criticidad 0,66 y crucialidad 0,59/);
  assert.match(await p.locator('#m7Net svg').getAttribute('aria-label'), /criticidad: A 0,07, B 0,32, C 0,66, D 0,39/);
  assert.equal(await p.locator('#m7Net rect.shade-3').count(), 1, 'C en el cuarto tono');
  await axe(p, 'F4b · M7 · índices del discreto');
  await p.locator('#m7Order').selectOption('u');
  await uncAfter(p, () => PNL.app.state().uz === 'u');
  assert.deepEqual(await p.locator('#m7Idx tbody tr th').allTextContents(), ['C', 'D', 'B', 'A']);
  assert.equal(await hashGet(p, 'uz'), 'u');
  await p.locator('#m7Corr-s').check();
  await uncAfter(p, () => PNL.app.state().uo === 's');
  const st2 = await m7Done(p, true);
  assert.deepEqual(st2.idx, JSON.parse(JSON.stringify((await m7Node(p)).idx)));
  assert.deepEqual(await p.locator('#m7Idx thead th').allTextContents(), ['Actividad', 'Criticidad', 'Exacta', 'Crucialidad (Spearman)', 'Significación', 'Exacta'], 'la exacta es de Pearson');
  assert.equal(await activeId(p), 'm7Corr-s');
  await p.locator('#m7Shade').selectOption('cu');
  await uncAfter(p, () => PNL.app.state().ui === 'cu');
  assert.match(await p.locator('#m7Net svg').getAttribute('aria-label'), /crucialidad: /);
  await shot(p, 'f4b-m7-idx-kd');
  await close(p);
  // Klastorin con beta-PERT: B no está en el camino de las medias y es crítica muchas veces (AC5).
  const k = await m7Lab('uy=idx&lang=en', { scheme: 'dark' });
  const sk = await m7Done(k, true);
  assert.ok(sk.idx.crit[1] > 0.3 && sk.idx.crit[0] === 1 && sk.idx.crit[4] > sk.idx.crit[2], 'AC5');
  assert.match(await k.locator('#m7PathsOff').innerText(), /A–B–E–F is not the critical path of the means \(A–C–E–F\), but it is critical in 40\s%/);
  await axe(k, 'F4b · M7 · índices, oscuro, EN');
  await close(k);
});

check('F4b T010 · distribuciones por actividad: cambiar una, la discreta con sus errores, restablecer y la misma para todas', async () => {
  const p = await m7Lab('lang=es');
  await m7Done(p);
  await p.locator('#m7PerAct').click();
  assert.equal(await p.locator('#m7PerAct').getAttribute('aria-expanded'), 'true');
  assert.equal(await p.locator('#m7DistTable tbody tr').count(), 6);
  await p.locator('#m7K-B').selectOption('unif');
  await uncAfter(p, () => JSON.stringify(PNL.app.state().uf) === '{"B":"unif"}');
  assert.equal(await hashGet(p, 'uf'), 'B-u');
  assert.equal(await activeId(p), 'm7K-B');
  assert.deepEqual(await p.locator('#m7DistTable tr[data-act="B"] td.num').allTextContents(), ['4', '7', '12', '8,00', '5,33']);
  assert.equal(await p.locator('#m7Dist option:checked').innerText(), 'varias');
  await p.locator('#m7K-C').selectOption('disc');
  await uncAfter(p, () => document.getElementById('m7Q-C'));
  assert.deepEqual(await p.locator('#m7Q-C input[data-q="p"]').evaluateAll((xs) => xs.map((x) => x.value)), ['1/6', '2/3', '1/6']);
  await p.locator('#m7Q-C-p-1').fill('0,5'); await p.locator('#m7Q-C-p-1').press('Tab');
  await uncAfter(p, () => document.getElementById('m7QErr-C'));
  assert.match(await p.locator('#m7QErr-C').innerText(), /suman 0,83; tienen que sumar 1/);
  assert.match(await p.locator('#m7Blocked').innerText(), /Mientras C tenga errores/);
  assert.equal(await p.locator('.m7-stale').count(), 1, 'la última simulación, en gris');
  assert.equal(await p.locator('#m7Json').isDisabled(), true);
  await axe(p, 'F4b · M7 · discreta con errores');
  await p.locator('#m7Q-C-p-0').fill('0,25'); await p.locator('#m7Q-C-p-0').press('Tab');
  await p.locator('#m7Q-C-p-2').fill('1/4'); await p.locator('#m7Q-C-p-2').press('Tab');
  await uncAfter(p, () => PNL.unc.state().m7.ok);
  const C = (await m7St(p)).acts.find((a) => a.id === 'C');
  assert.deepEqual(C.dist, { kind: 'disc', x: [2, 8, 13], p: [0.25, 0.5, 0.25] });
  assert.ok(await hashGet(p, 'uq'));
  await m7Done(p);
  // Añadir y quitar un valor; restablecer vuelve a a, m y b.
  await p.locator('#m7QAdd-C').click();
  await uncAfter(p, () => document.querySelectorAll('#m7Q-C input[data-q="x"]').length === 4);
  assert.equal(await activeId(p), 'm7Q-C-x-3');
  await p.locator('#m7QDel-C-3').click();
  await uncAfter(p, () => document.querySelectorAll('#m7Q-C input[data-q="x"]').length === 3);
  await p.locator('#m7QReset-C').click();
  await uncAfter(p, () => !PNL.app.state().uq);
  assert.equal(await hashGet(p, 'uq'), null);
  await p.locator('#m7Dist').selectOption('logn');
  await uncAfter(p, () => PNL.app.state().ug === 'logn' && !PNL.app.state().uf);
  assert.deepEqual((await m7St(p)).acts.map((a) => a.kind), ['logn', 'logn', 'logn', 'logn', 'logn', 'logn']);
  await shot(p, 'f4b-m7-dists');
  await close(p);
  // En un ejemplo discreto no hay a, m ni b ni distribución para todas.
  const d = await m7Lab('ue=wb&lang=en');
  await d.locator('#m7PerAct').click();
  assert.equal(await d.locator('#m7Dist').count(), 0);
  assert.equal(await d.locator('#m7K-A').isDisabled(), true);
  assert.deepEqual(await d.locator('#m7DistTable tr[data-act="A"] td.num').allTextContents(), ['—', '—', '—', '15.00', '25.00']);
  await close(d);
});

check('F4b T010 · descargas: el .py y el proyecto en JSON; el informe del .py coincide con la página (AC7)', async () => {
  const p = await m7Lab('ue=hl&ug=tri&uf=C-n.D-l.E-d&ur=3&us=4242&ud=46&uv=80&lang=es');
  const st = await m7Done(p);
  assert.equal(await p.locator('#m7Py').getAttribute('download'), 'pnl_montecarlo.py');
  const py = await p.evaluate(async () => { const r = await fetch(document.getElementById('m7Py').href); return r.ok ? (await r.text()).slice(0, 200) : null; });
  assert.match(py, /python|Python/);
  const [dl] = await Promise.all([p.waitForEvent('download'), p.locator('#m7Json').click()]);
  assert.equal(dl.suggestedFilename(), 'pnl-montecarlo-hl.json');
  const file = path.join(require('node:os').tmpdir(), `pnl-m7-${process.pid}.json`);
  await dl.saveAs(file);
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.deepEqual([data.format, data.version, data.reps, data.seed, data.deadline, data.percentile], ['pnl-montecarlo', 1, 1000, 4242, 46, 0.8]);
  const { spawnSync } = require('node:child_process');
  const pyBin = ['python3', 'python'].find((b) => { const r = spawnSync(b, ['--version'], { encoding: 'utf8' }); return r.status === 0 && /Python 3/.test(r.stdout + r.stderr); });
  if (!pyBin) { assert.ok(!process.env.CI, 'Python 3 en la CI'); console.log('    (sin Python 3: se salta la comparación con el .py)'); }
  else {
    const out = spawnSync(pyBin, [path.join(ROOT, 'python', 'pnl_montecarlo.py'), file, '--json'], { encoding: 'utf8' });
    assert.equal(out.status, 0, out.stderr);
    const r = JSON.parse(out.stdout);
    assert.ok(Math.abs(r.mean - st.results.mean) < 1e-9, `${r.mean} frente a ${st.results.mean}`);
    assert.ok(Math.abs(r.p_deadline - st.results.pT) < 1e-12);
    assert.ok(Math.abs(r.percentiles['80'] - st.results.q.find((q) => q.p === 0.8).sim) < 1e-9);
    const txt = spawnSync(pyBin, [path.join(ROOT, 'python', 'pnl_montecarlo.py'), file], { encoding: 'utf8' });
    assert.equal(txt.status, 0, txt.stderr);
    assert.ok(txt.stdout.includes(st.results.mean.toFixed(4)), 'el informe en texto da la misma media');
  }
  fs.unlinkSync(file);
  assert.match(await p.locator('#live').innerText(), /Proyecto descargado en JSON/);
  await close(p);
});

check('F4b T010 · tabla propia con errores, todo fijo y Williams (d): avisos de M7', async () => {
  const bad = await uncLab(ownUrl([{ id: 'A', name: '', a: '3', m: '2', b: '5', links: '' }], { um: 'm7' }));
  assert.match(await bad.locator('#m7Issues').innerText(), /1 errores|errores/);
  await bad.locator('#m7ToM5').click();
  await uncAfter(bad, () => PNL.app.state().um === 'm5');
  assert.equal(await activeId(bad), 'uncM5');
  await close(bad);
  const fixed = await uncLab(ownUrl([{ id: 'A', name: '', a: '3', m: '3', b: '3', links: '' }, { id: 'B', name: '', a: '2', m: '2', b: '2', links: 'A' }], { um: 'm7' }));
  await m7Done(fixed);
  assert.match(await fixed.locator('#m7Fixed').innerText(), /siempre 5/);
  await fixed.locator('#m7View-idx').click();
  await m7Done(fixed, true);
  assert.match(await fixed.locator('#m7NoUnc').innerText(), /Sin incertidumbre/);
  await close(fixed);
  const w = await m7Lab('ue=wd&uy=idx&lang=es');
  const sw = await m7Done(w, true);
  assert.equal(sw.idx.cruc[0], 0, 'A fija: crucialidad 0');
  assert.match(await w.locator('.m7-idx').innerText(), /duración fija tiene crucialidad 0/);
  await close(w);
});

check('F4b T010 · notación española, 360 px sin desbordar y la página atiende el teclado mientras simula 100 000 réplicas', async () => {
  const n = await m7Lab('lang=es&nota=es');
  await n.locator('#m7PerAct').click();
  assert.deepEqual((await n.locator('#m7DistTable thead th').allTextContents()).slice(3, 6), ['tₒ', 'tₘ', 'tₚ']);
  await close(n);
  for (const uy of ['dist', 'idx']) {
    const m = await m7Lab(`uy=${uy}&lang=es`, { width: 360, height: 740 });
    await m7Done(m, uy === 'idx');
    assert.equal(await m.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), true, `${uy} a 360 px`);
    await shot(m, `f4b-m7-${uy}-360`, true);
    await axe(m, `F4b · M7 · ${uy} a 360 px`);
    await close(m);
  }
  const p = await m7Lab('ur=5&uy=idx&uo=s&lang=es');
  await p.evaluate(() => {
    window.__lag = [];
    document.addEventListener('keydown', (e) => { const s = PNL.unc.state().m7; window.__lag.push({ lag: performance.now() - e.timeStamp, running: !(s && s.done && s.idx) }); });
  });
  await p.waitForTimeout(300);
  for (let i = 0; i < 6; i++) { await p.keyboard.press('Shift'); await p.waitForTimeout(60); }
  const lags = await p.evaluate(() => window.__lag);
  assert.ok(lags.some((x) => x.running), `sin teclas durante la simulación: ${JSON.stringify(lags)}`);
  for (const x of lags) assert.ok(x.lag < 100, `${x.lag.toFixed(1)} ms`);
  await m7Done(p, true);
  await close(p);
});

// ---------- F4b, T011: réplica a réplica con predicción y convergencia ----------

const repStep = (page) => page.evaluate(() => { const tr = PNL.app.model().trace; const k = Math.min(PNL.app.state().step, tr.length - 1); const s = tr[k]; return { k, T: s.rep.T, d: s.rep.d, crit: s.crit, options: s.options, n: tr.length }; });

check('F4b T011 · réplica a réplica: predecir la duración, el error típico del camino de las medias, el histograma que crece y las teclas', async () => {
  const p = await m7Lab('uy=rep&pred=1&step=3&lang=es');
  await p.locator('#m7PredIn').waitFor();
  const r = await repStep(p);
  assert.equal(r.n, 20);
  const N = await m7Node(p);
  assert.equal(r.T, N.res.durations[3], 'la réplica 4 de la misma simulación');
  assert.deepEqual(r.crit, ['A–D']);
  assert.equal(await p.locator('#uncWalk').count(), 0);
  assert.match(await p.locator('#m7RepNet svg').getAttribute('aria-label'), /réplica 4/);
  assert.equal(await p.locator('#m7RepNet text.val:not(.hidden)').count() > 0, true, 'las duraciones se ven');
  assert.equal(await p.locator('#m7RepNet text.val.hidden').count() > 0, true, 'los tiempos, no');
  assert.equal(await p.locator('#m7RepTable tbody tr').count(), 3, 'la réplica 4 aún no está en la tabla');
  assert.equal(await p.locator('#m7Next').isDisabled(), true);
  await p.locator('#m7PredCheck').click();
  assert.equal(await p.locator('#m7PredEmpty').isVisible(), true);
  // El error típico: sumar A–C–E–F con las duraciones de la réplica.
  const ids = ['A', 'B', 'C', 'D', 'E', 'F'];
  const acef = ['A', 'C', 'E', 'F'].reduce((x, id) => x + r.d[ids.indexOf(id)], 0);
  await p.locator('#m7PredIn').fill(acef.toFixed(2).replace('.', ','));
  await p.locator('#m7PredIn').press('Enter');
  await p.locator('#m7PredFb').waitFor();
  assert.match(await p.locator('#m7PredFb').innerText(), new RegExp(`No es[\\s\\S]*A–C–E–F, el camino crítico de las medias; en esta réplica el crítico es A–D y dura ${r.T.toFixed(2).replace('.', ',')}`));
  assert.equal(await activeId(p), 'm7PredFb');
  assert.equal(await p.locator('#m7RepTable tbody tr').count(), 4);
  assert.match(await p.locator('#m7RepHist svg').getAttribute('aria-label'), /las 4 réplicas vistas/);
  assert.equal(await p.locator('#m7RepNet text.val.hidden').count(), 0, 'tiempos revelados');
  assert.equal(await p.locator('#m7RepNet rect.crit').count(), 2, 'A y D en rojo');
  await axe(p, 'F4b · M7 · réplica a réplica, predicción');
  await shot(p, 'f4b-m7-rep');
  // Teclado: → pasa a la réplica 5; con la predicción pendiente, → no avanza.
  await p.locator('body').press('ArrowRight');
  await uncAfter(p, () => PNL.app.state().step === 4);
  const r5 = await repStep(p);
  assert.equal(r5.T, N.res.durations[4]);
  await p.locator('body').press('ArrowRight');
  await p.waitForTimeout(150);
  assert.equal((await state(p)).step, 4);
  await p.locator('#m7PredIn').fill(r5.T.toFixed(2));
  await p.locator('#m7PredCheck').click();
  assert.match(await p.locator('#m7PredFb').innerText(), /^Bien/);
  await p.locator('#m7Prev').click();
  await uncAfter(p, () => PNL.app.state().step === 3);
  // Sin predicción, cada réplica se ve entera.
  await p.locator('#m7Pred-none').check();
  await uncAfter(p, () => PNL.app.state().pred === 0);
  assert.match(await p.locator('#m7RepResult').innerText(), new RegExp(`dura ${r.T.toFixed(2).replace('.', ',')}; camino crítico: A–D`));
  assert.equal(await activeId(p), 'm7Pred-none');
  await close(p);
});

check('F4b T011 · réplica a réplica: predecir el camino crítico, con el empate de la réplica 7 del Klastorin discreto', async () => {
  const p = await m7Lab('ue=kd&uy=rep&pred=1&step=6&lang=en', { scheme: 'dark' });
  await p.locator('#m7PredIn').waitFor();
  await p.locator('#m7Pred-p').check();
  await uncAfter(p, () => PNL.app.state().uh === 'p');
  assert.equal((await state(p)).step, 0, 'cambiar lo que se predice vuelve a la primera réplica');
  await p.evaluate(() => PNL.app.go(6));
  await p.locator('#m7Path-0').waitFor();
  const r = await repStep(p);
  assert.deepEqual(r.options, ['B–D', 'C', 'A–D']);
  assert.deepEqual(r.crit, ['B–D', 'C']);
  // Con el estado de cada etiqueta en el mensaje: en la CI 107 y 108 salieron con un espacio delante (sin m7.css o sin pintar).
  const labs = await p.locator('.m7-paths label').evaluateAll((ls) => ls.map((l) => ({ t: l.innerText, d: getComputedStyle(l).display, v: l.checkVisibility(), hid: l.closest('[hidden]') ? l.closest('[hidden]').id || l.closest('[hidden]').tagName : null,
    up: l.parentElement.parentElement ? l.parentElement.parentElement.id || l.parentElement.parentElement.className : null })));
  const css = await p.evaluate(() => [...document.styleSheets].map((s) => (s.href || 'inline').split('/').pop() + (s.disabled ? ':off' : '')).join(','));
  assert.deepEqual(labs.map((x) => x.t), ['B–D', 'C', 'A–D'], `${JSON.stringify(labs)} · hojas: ${css}`);
  await p.locator('#m7Path-1').check();
  await p.locator('#m7PredCheck').click();
  assert.match(await p.locator('#m7PredFb').innerText(), /Right[\s\S]*B–D and C tie at 15\.00: both are critical/);
  assert.equal(await hashGet(p, 'uh'), 'p');
  await axe(p, 'F4b · M7 · run by run, path, dark');
  await p.locator('#m7Next').click();
  await p.locator('#m7Path-2').check();
  await p.locator('#m7PredCheck').click();
  assert.match(await p.locator('#m7PredFb').innerText(), /^Not quite|^Not/);
  await close(p);
});

check('F4b T011 · convergencia: cuatro gráficos con su banda y la exacta, la actividad en el enlace, la tabla y 360 px', async () => {
  const p = await m7Lab('ue=kd&uy=conv&ua=C&lang=es');
  await p.locator('#m7Conv-mean svg').waitFor({ timeout: 30000 });
  const N = await m7Node(p);
  const c = M7N.convergence(U4.decode(await p.evaluate(() => location.hash)).state, N.m, N.res);
  const last = c.rows[c.rows.length - 1];
  const f = (v, k) => v.toFixed(k).replace('.', ',');
  assert.equal(await p.locator('#m7ConvHead-mean').innerText(), `Media · ${f(last.mean, 2)} ± ${f(1.96 * last.se, 2)}`);
  assert.match(await p.locator('#m7ConvHead-pT').innerText(), new RegExp(`P\\(duración ≤ 20\\) · ${f(last.pT, 3)}`));
  assert.match(await p.locator('#m7ConvHead-crit').innerText(), new RegExp(`· ${f(last.crit[2], 3)}`));
  for (const id of ['mean', 'pT', 'crit']) assert.equal(await p.locator(`#m7Conv-${id} path.mc-band`).count(), 1, id);
  assert.equal(await p.locator('#m7Conv-q path.mc-band').count(), 0, 'el percentil, sin banda');
  assert.deepEqual(await p.locator('text.mc-reflabel').allTextContents(), ['exacta 23,25', 'exacta 0,157', 'exacta 25,00', 'exacta 0,660']);
  assert.match(await p.locator('#m7Conv-mean svg').getAttribute('aria-label'), /10\.000: 23,2/);
  await p.locator('#m7ConvTable').click();
  assert.equal(await p.locator('#m7ConvRows tbody tr').count(), c.rows.length);
  await axe(p, 'F4b · M7 · convergencia');
  await shot(p, 'f4b-m7-conv');
  await p.locator('#m7ConvAct').selectOption('D');
  await uncAfter(p, () => PNL.app.state().ua === 'D');
  assert.match(await p.locator('#m7ConvHead-crit').innerText(), new RegExp(`· ${f(last.crit[3], 3)}`));
  assert.equal(await activeId(p), 'm7ConvAct');
  await close(p);
  // Sin cuenta exacta, la referencia es la normal de M6; a 360 px, uno debajo de otro y sin desbordar.
  const m = await m7Lab('uy=conv&lang=es', { width: 360, height: 740, scheme: 'dark' });
  await m.locator('#m7Conv-mean svg').waitFor({ timeout: 30000 });
  assert.match(await m.locator('#m7Conv-mean text.mc-reflabel').textContent(), /normal de M6 23,83/);
  assert.equal(await m.locator('#m7Conv-crit text.mc-reflabel').count(), 0);
  assert.equal(await m.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), true);
  await axe(m, 'F4b · M7 · convergencia a 360 px, oscuro');
  await shot(m, 'f4b-m7-conv-360', true);
  await close(m);
  const r = await m7Lab('uy=rep&lang=es', { width: 360, height: 740 });
  await r.locator('#m7RepResult').waitFor();
  assert.equal(await r.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), true);
  await axe(r, 'F4b · M7 · réplica a réplica a 360 px');
  await close(r);
});

// ---------- F4b, T012: «Aprende más» de M7 ----------

check('F4b T012 · «Aprende más» de M7 se carga al abrirlo (grupo l7), en el idioma de la página, y M7 con él sigue por debajo de 1 MB', async () => {
  const learnM7 = (page) => page.evaluate(() => performance.getEntriesByType('resource').filter((e) => /learn-(m7|unc)\.js/.test(e.name)).map((e) => e.name.replace(/^.*\/js\//, '')));
  const p = await m7Lab('ue=kd&uy=idx&lang=es');
  await m7Done(p, true);
  assert.deepEqual(await learnM7(p), [], 'no viene con M7');
  await p.locator('#uncLearn').click();
  await p.locator('#learnDialog[open]').waitFor();
  assert.deepEqual(await learnM7(p), ['learn-m7.js'], 'solo el de M7, no el de M5 y M6');
  assert.equal(await p.locator('#learnTitle').innerText(), 'Montecarlo e índices: qué mide cada número');
  const heads = await p.locator('#learnBody h3').allInnerTexts();
  assert.deepEqual(heads, [...M7L.es.m7.sections.map((x) => x.head), 'Referencias']);
  const body = await p.locator('#learnBody').innerText();
  assert.match(body, /0,612 \+ 0,048 = 0,660/);
  assert.match(body, /python3 pnl_montecarlo\.py/);
  assert.equal(await p.locator('#learnBody li').count(), M7L.refs.es.length);
  await axe(p, 'F4b · «Aprende más» de M7');
  await p.keyboard.press('Escape');
  assert.equal(await p.locator('#learnDialog[open]').count(), 0);
  assert.equal(await p.evaluate(() => document.activeElement && document.activeElement.id), 'uncLearn', 'el foco vuelve al botón');
  // De M7 a M5: «Aprende más» de M5 sigue siendo el suyo.
  await p.locator('#uncM5').click();
  await p.waitForFunction(() => PNL.app.state().um === 'm5');
  await p.locator('#uncLearn').click();
  await p.locator('#learnDialog[open]').waitFor();
  assert.equal(await p.locator('#learnTitle').innerText(), 'Tres tiempos: de dónde salen las fórmulas');
  await p.locator('#btnLearnClose').click();
  await close(p);
  const e = await m7Lab('uy=rep&lang=en', { scheme: 'dark' });
  await e.locator('#uncLearn').click();
  await e.locator('#learnDialog[open]').waitFor();
  assert.equal(await e.locator('#learnTitle').innerText(), 'Monte Carlo and indices: what each number measures');
  assert.deepEqual(await e.locator('#learnBody h3').allInnerTexts(), [...M7L.en.m7.sections.map((x) => x.head), 'References']);
  assert.match(await e.locator('#learnBody').innerText(), /Van Slyke \(1963\)/);
  await axe(e, 'F4b · «Aprende más» de M7, inglés y tema oscuro');
  await close(e);
  // Principio 27 (AC16): la vista más pesada de M7 (convergencia, con u7r) y la de los índices, con «Aprende más» abierto.
  for (const hash of ['v=unc&um=m7&ue=hl&uy=conv&lang=es', 'v=unc&um=m7&ue=kd&uy=idx&lang=en']) {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.goto(`${BASE}/cpm.html#${hash}`, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => window.PNL && PNL.unc && PNL.unc.state && PNL.unc.state());
    await page.locator('#uncLearn').click();
    await page.locator('#learnDialog[open]').waitFor();
    await page.waitForLoadState('networkidle');
    const bytes = await page.evaluate(() => [...performance.getEntriesByType('navigation'), ...performance.getEntriesByType('resource')]
      .reduce((sum, x) => sum + (x.encodedBodySize || x.transferSize || 0), 0));
    console.log(`    cpm.html#${hash} + «Aprende más»: ${(bytes / 1024).toFixed(0)} KB`);
    assert.ok(bytes <= BUDGET, `${hash} con «Aprende más»: ${bytes} bytes`);
    await ctx.close();
  }
});

// ---------- F4b, T013: publicación ----------

check('F4b T013 · M7 publicado: el botón del apartado lo abre desde M6, carga u7 y vuelve a M6; la tarjeta de la portada dice «Abrir Montecarlo»', async () => {
  const p = await uncLab('um=m6&lang=es');
  assert.equal(await m7Groups(p), 0, 'sin el grupo u7 en M6');
  assert.equal(await p.locator('#uncM7').innerText(), 'Montecarlo e índices (M7)');
  await p.locator('#uncM7').click();
  await p.waitForFunction(() => PNL.app.state().um === 'm7');
  await m7Done(p);
  assert.equal(await m7Groups(p), 5, 'el grupo u7 entero');
  assert.equal(await p.locator('#uncM7').getAttribute('aria-pressed'), 'true');
  assert.match(await p.evaluate(() => location.hash), /um=m7/);
  await p.locator('#uncM6').click();
  await p.waitForFunction(() => PNL.app.state().um === 'm6');
  assert.equal(await p.locator('#uncM6').getAttribute('aria-pressed'), 'true');
  await p.locator('#uncSteps').waitFor();
  await close(p);
  for (const lang of ['es', 'en']) {
    const home = await open(`index.html?lang=${lang}`);
    const a = home.locator('a[data-lab="m7"]');
    assert.equal(await a.locator('[data-i18n="m7Open"]').innerText(), lang === 'es' ? 'Abrir Montecarlo' : 'Open Monte Carlo');
    assert.equal(await a.getAttribute('href'), `cpm.html#v=unc&um=m7&lang=${lang}`);
    if (lang === 'en') await axe(home, 'F4b · portada con M7 disponible');
    await close(home);
  }
});

// ---------- F4b, T014: accesibilidad, teclado y tamaño de M7 ----------

// Las vistas de M7 que recorren las pruebas de accesibilidad: las cuatro vistas, con ejemplos de tiempos continuos y
// discretos, otra distribución, Spearman con la red coloreada por crucialidad, la predicción del camino y todo fijo.
const M7_VIEWS = ['uy=dist&ue=kl', 'uy=dist&ue=hl&ug=tri', 'uy=dist&ue=kd', 'uy=dist&ue=wd', 'uy=idx&ue=kd', 'uy=idx&ue=hl&uo=s&ui=cu&uz=u',
  'uy=rep&ue=kl&uh=t', 'uy=rep&ue=kd&uh=p', 'uy=conv&ue=kd', 'uy=conv&ue=hl'];
// Abre una vista de M7 en la misma página y espera a que termine (la simulación, los índices o la convergencia).
async function m7Show(page, hash) {
  await setHash(page, `v=unc&um=m7&${hash}`);
  await page.waitForFunction((h) => {
    const q = new URLSearchParams(h); const a = PNL.app.state();
    return a.um === 'm7' && (q.get('uy') || 'dist') === a.uy && (q.get('ue') || 'kl') === a.ue;
  }, hash, { timeout: 20000 });
  const uy = new URLSearchParams(hash).get('uy');
  await m7Done(page, uy === 'idx');
  if (uy === 'conv') await page.locator('#m7Conv-mean svg').waitFor({ timeout: 30000 });
  if (uy === 'rep') await page.locator('#m7RepNet svg').waitFor({ timeout: 30000 });
  await page.waitForTimeout(150);
}

check('F4b T014 · AC15: axe sin violaciones en claro y oscuro, ES y EN, en las cuatro vistas de M7; cada gráfico con su texto; a 1280×720, sin desplazamiento horizontal, la cabecera en una fila y la barra de M7 baja', async () => {
  for (const lang of ['es', 'en']) {
    for (const scheme of ['light', 'dark']) {
      const page = await m7Lab(`lang=${lang}`, { scheme });
      for (const v of M7_VIEWS) {
        await m7Show(page, `${v}&lang=${lang}`);
        const label = `F4b T014 · ${v} (${lang}, ${scheme})`;
        await axe(page, label);
        const charts = await uncCharts(page);
        assert.ok(charts.length >= 1, `${label}: sin gráfico`);
        for (const c of charts) assert.ok(c.hidden || (c.role === 'img' && c.label.length > 10), `${label}: el gráfico de #${c.id} no tiene texto (${JSON.stringify(c)})`);
        const box = await page.evaluate(() => ({ w: document.documentElement.scrollWidth, vw: window.innerWidth, head: document.querySelector('.site-head').getBoundingClientRect().height,
          bar: document.querySelector('.unc-bar').getBoundingClientRect().height, rows: [...document.querySelectorAll('.unc-bar > .unc-row')].map((r) => r.getBoundingClientRect().height) }));
        assert.ok(box.w <= box.vw + 1, `${label}: desplazamiento horizontal (${box.w} px)`);
        assert.ok(box.head <= 70, `${label}: la cabecera ocupa ${box.head} px`);
        // La barra de M7 (boceto 80): apartado y proyecto (en una fila en español; en inglés, «Learn more» puede bajar);
        // vistas y descargas, siempre en una; los controles, en una o dos según la vista. Como mucho, 200 px.
        assert.equal(box.rows.length, 3, `${label}: filas de la barra`);
        if (lang === 'es') assert.ok(box.rows[0] <= 48, `${label}: la primera fila ocupa ${box.rows[0]} px`);
        assert.ok(box.rows[1] <= 48, `${label}: la fila de las vistas ocupa ${box.rows[1]} px`);
        assert.ok(box.bar <= 200, `${label}: la barra ocupa ${box.bar} px (${box.rows.join(', ')})`);
      }
      // «Distribuciones por actividad» abierto, con el editor de la discreta.
      await m7Show(page, `uy=dist&ue=kl&uf=A-d&lang=${lang}`);
      await page.locator('#m7PerAct').click();
      await page.locator('#m7Dists').waitFor();
      await page.locator('#m7Edit-A').click();
      await page.locator('#m7Q-A').waitFor();
      await axe(page, `F4b T014 · distribuciones por actividad y editor de la discreta (${lang}, ${scheme})`);
      await close(page);
    }
  }
});

check('F4b T014 · AC15: a 360 px ninguna vista de M7 desplaza la página a lo ancho, en ES y EN, tampoco con las distribuciones por actividad abiertas', async () => {
  for (const lang of ['es', 'en']) {
    const page = await m7Lab(`lang=${lang}`, { width: 360, height: 740 });
    for (const v of M7_VIEWS) {
      await m7Show(page, `${v}&lang=${lang}`);
      const w = await page.evaluate(() => ({ w: document.documentElement.scrollWidth, vw: window.innerWidth }));
      assert.ok(w.w <= w.vw + 1, `${v} (${lang}) a 360 px: ${w.w} px`);
    }
    await m7Show(page, `uy=dist&ue=kl&uf=A-d&lang=${lang}`);
    await page.locator('#m7PerAct').click();
    await page.locator('#m7Edit-A').click();
    await page.locator('#m7Q-A').waitFor();
    const w = await page.evaluate(() => ({ w: document.documentElement.scrollWidth, vw: window.innerWidth }));
    assert.ok(w.w <= w.vw + 1, `distribuciones por actividad (${lang}) a 360 px: ${w.w} px`);
    await shot(page, `f4b-t014-360-${lang}`, true);
    await close(page);
  }
});

check('F4b T014 · AC15: con el teclado se eligen las vistas, la distribución, las réplicas, el orden del tornado, el índice de la red y Pearson o Spearman; el foco se ve y no se pierde al recalcular', async () => {
  const p = await m7Lab('ue=kd&lang=es');
  await m7Done(p);
  // Las vistas: el tabulador llega a los cuatro botones en orden; Intro y espacio los pulsan y el foco se queda.
  await p.locator('#m7View-dist').focus();
  assert.ok(await focusVisible(p), 'foco visible en la vista');
  for (const v of ['idx', 'rep', 'conv']) { await p.keyboard.press('Tab'); assert.equal(await activeId(p), `m7View-${v}`); }
  await p.locator('#m7View-idx').focus();
  await p.keyboard.press('Enter');
  await p.waitForFunction(() => PNL.app.state().uy === 'idx');
  await m7Done(p, true);
  assert.equal(await activeId(p), 'm7View-idx');
  // Pearson o Spearman, con las flechas del grupo de radios.
  await p.locator('#m7Corr-p').focus();
  await p.keyboard.press('ArrowRight');
  await p.waitForFunction(() => PNL.app.state().uo === 's');
  await m7Done(p, true);
  assert.equal(await activeId(p), 'm7Corr-s');
  assert.ok(await focusVisible(p), 'foco visible en Spearman');
  // Los desplegables (orden del tornado, índice de la red, réplicas) cambian con las flechas sin perder el foco.
  for (const [id, key] of [['m7Order', 'uz'], ['m7Shade', 'ui'], ['m7Reps', 'ur']]) {
    const before = await hashGet(p, key);
    await p.locator(`#${id}`).focus();
    assert.ok(await focusVisible(p), `foco visible en #${id}`);
    await p.keyboard.press('ArrowDown');
    await p.waitForFunction(([k, b]) => new URLSearchParams(location.hash.slice(1)).get(k) !== b, [key, before]);
    await m7Done(p, true);
    assert.equal(await activeId(p), id, `#${id} pierde el foco`);
  }
  // El plazo se escribe y se confirma con Intro.
  await p.locator('#m7Deadline').focus();
  await p.keyboard.press('Control+A');
  await p.keyboard.type('22');
  await p.keyboard.press('Enter');
  await p.waitForFunction(() => PNL.app.state().ud === 22);
  await m7Done(p, true);
  assert.equal(await activeId(p), 'm7Deadline');
  await close(p);
  // La distribución para todas y «Distribuciones por actividad», con el teclado.
  const q = await m7Lab('ue=kl&lang=en');
  await m7Done(q);
  await q.locator('#m7Dist').focus();
  await q.keyboard.press('ArrowDown');
  await q.waitForFunction(() => PNL.app.state().ug && PNL.app.state().ug !== 'pert');
  await m7Done(q);
  assert.equal(await activeId(q), 'm7Dist');
  await q.locator('#m7PerAct').focus();
  await q.keyboard.press('Enter');
  await q.locator('#m7Dists').waitFor();
  assert.equal(await q.locator('#m7PerAct').getAttribute('aria-expanded'), 'true');
  assert.equal(await activeId(q), 'm7PerAct');
  await q.keyboard.press(' ');
  await q.waitForFunction(() => document.getElementById('m7PerAct').getAttribute('aria-expanded') === 'false');
  assert.equal(await activeId(q), 'm7PerAct');
  await close(q);
});

check('F4b T014 · AC16: cada vista de M7 con «Aprende más» abierto sigue por debajo de 1 MB, y sin el código de M5 y M6', async () => {
  for (const uy of ['dist', 'idx', 'rep', 'conv']) {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.goto(`${BASE}/cpm.html#v=unc&um=m7&ue=hl&uy=${uy}&lang=es`, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => window.PNL && PNL.unc && PNL.unc.state && PNL.unc.state());
    await page.locator('#uncLearn').click();
    await page.locator('#learnDialog[open]').waitFor();
    await page.waitForLoadState('networkidle');
    const bytes = await page.evaluate(() => [...performance.getEntriesByType('navigation'), ...performance.getEntriesByType('resource')]
      .reduce((sum, x) => sum + (x.encodedBodySize || x.transferSize || 0), 0));
    console.log(`    uy=${uy} + «Aprende más»: ${(bytes / 1024).toFixed(0)} KB`);
    assert.ok(bytes <= BUDGET, `uy=${uy} con «Aprende más»: ${bytes} bytes`);
    assert.equal(await page.evaluate(() => performance.getEntriesByType('resource').some((e) => /unc-m56\.js|learn-unc\.js/.test(e.name))), false, `uy=${uy}: código de M5 y M6`);
    await ctx.close();
  }
});

// ---------- F4b, T017: lo que encontró la revisión de nivel 2 (ronda 1) ----------

// La tabla de resultados de «Duración del proyecto», fila a fila (cabecera → celdas).
const m7ResRows = (page) => page.evaluate(() => Object.fromEntries([...document.querySelectorAll('#m7Res tbody tr')].map((tr) => [tr.querySelector('th').textContent, [...tr.querySelectorAll('td')].map((td) => td.textContent)])));
const fxEs = (v, k) => v.toFixed(k).replace('.', ',');

check('F4b T017 r1 · I-F1: al cambiar el plazo o el percentil, «Duración del proyecto» rehace P(duración ≤ plazo), la P de la normal y los percentiles', async () => {
  const p = await m7Lab('ur=3&ue=kl&lang=es');
  await m7Done(p);
  for (const [id, v, key] of [['m7Deadline', '30', 'ud'], ['m7Pct', '70', 'uv']]) {
    await p.locator(`#${id}`).fill(v);
    await p.locator(`#${id}`).press('Enter');
    await p.waitForFunction(([k, x]) => new URLSearchParams(location.hash.slice(1)).get(k) === x, [key, v]);
    await m7Done(p);
    const N = await m7Node(p);
    const rows = await m7ResRows(p);
    const pRow = rows[`P(duración ≤ ${N.m.deadline})`];
    assert.ok(pRow, `fila del plazo ${N.m.deadline}: ${Object.keys(rows)}`);
    assert.equal(pRow[0].split(' ± ')[0], fxEs(N.r.pT, 3), 'P simulada del plazo nuevo');
    assert.equal(pRow[1], fxEs(N.r.pN, 3), 'P de la normal del plazo nuevo');
    for (const q of N.r.q) assert.equal(rows[`P${Math.round(q.p * 100)}${q.chosen ? ' (elegido)' : ''}`][0], fxEs(q.sim, 2), `P${q.p}`);
  }
  assert.ok((await m7ResRows(p))['P70 (elegido)'], 'la fila del percentil elegido');
  await close(p);
});

check('F4b T017 r1 · I-F10, I-F14 e I-F26: una discreta que se rompe a mitad de la simulación y se arregla vuelve a simular; la suma con sus decimales; «Índices» con errores enseña los últimos', async () => {
  const p = await m7Lab('ur=5&ue=kl&uf=A-d&lang=es');
  await p.locator('#m7PerAct').click();
  await p.locator('#m7Edit-A').click();
  await p.locator('#m7Q-A').waitFor();
  // Cada probabilidad, con Intro, esperando a que llegue al enlace.
  const setP = async (j, v) => {
    await p.locator(`#m7Q-A-p-${j}`).fill(v);
    await p.locator(`#m7Q-A-p-${j}`).press('Enter');
    await p.waitForFunction(([k, x]) => ((PNL.app.state().uq || {}).A || { p: [] }).p[k] === x, [j, v]);
  };
  await p.waitForTimeout(200);                                   // ya simulando
  for (const j of [0, 1, 2]) await setP(j, '0,333');
  await p.locator('#m7QErr-A').waitFor();
  assert.match(await p.locator('#m7QErr-A').innerText(), /suman 0,999; tienen que sumar 1/);
  for (const j of [0, 1, 2]) await setP(j, '1/3');
  await p.waitForFunction(() => !document.getElementById('m7QErr-A'));
  await m7Done(p);                                               // antes se quedaba en «Simulando 100 000 réplicas…»
  await close(p);
  // «Índices» con errores en una discreta, sin haber pasado antes por «Índices»: los últimos índices válidos, en gris.
  const q = await m7Lab('ue=kd&lang=es');
  await m7Done(q, true);
  await q.locator('#m7PerAct').click();
  await q.locator('#m7Edit-A').click();
  await q.locator('#m7Q-A-p-0').fill('0,9');
  await q.locator('#m7Q-A-p-0').press('Enter');
  await q.locator('#m7Blocked').waitFor();
  await q.locator('#m7View-idx').click();
  await q.waitForFunction(() => PNL.app.state().uy === 'idx');
  await q.locator('#m7Idx').waitFor();
  assert.equal(await q.locator('#m7IdxWait').count(), 0, 'no se queda en «Calculando los índices…»');
  assert.equal(await q.locator('.m7-stale #m7Idx').count(), 1, 'en gris');
  await close(q);
});

check('F4b T017 r1 · I-F13: en el editor de la discreta, Tab tras cambiar un valor pasa a la casilla siguiente y el cambio se guarda', async () => {
  const p = await m7Lab('ue=kl&uf=A-d&lang=es');
  await m7Done(p);
  await p.locator('#m7PerAct').click();
  await p.locator('#m7Edit-A').click();
  await p.locator('#m7Q-A-x-0').fill('3');
  await p.keyboard.press('Tab');
  await p.waitForFunction(() => { const q = (PNL.app.state().uq || {}).A; return q && q.x[0] === '3'; });
  assert.equal(await activeId(p), 'm7Q-A-p-0', 'el foco pasa a la probabilidad de al lado');
  await p.keyboard.press('Control+A');
  await p.keyboard.type('0,2');
  await p.keyboard.press('Tab');
  await p.waitForFunction(() => PNL.app.state().uq.A.p[0] === '0,2');
  assert.equal(await activeId(p), 'm7QDel-A-0');
  await close(p);
});

check('F4b T017 r1 · I-F7 e I-F8: con la predicción, ni el camino crítico ni la duración de la réplica se ven antes de comprobar', async () => {
  for (const uh of ['p', 't']) {
    const p = await m7Lab(`ue=kd&uy=rep&pred=1&uh=${uh}&step=6&lang=es`);
    await p.locator('#m7RepNet svg').waitFor();
    assert.equal(await p.locator('#m7RepNet rect.crit, #m7RepNet .crit').count(), 0, `${uh}: el camino crítico pintado antes de comprobar`);
    assert.equal(await p.locator('#m7RepHist .v-deadline').count(), 0, `${uh}: la línea de la réplica nueva`);
    assert.doesNotMatch(await p.locator('#m7RepHist').innerText(), /réplica 7/, `${uh}: la réplica nueva en el histograma`);
    assert.equal(await p.locator('#m7RepTable tbody tr').count(), 6, `${uh}: la tabla, solo con las vistas`);
    assert.doesNotMatch(await p.locator('#live').innerText(), /15/, `${uh}: el aviso hablado con la duración`);
    await close(p);
  }
});

check('F4b T017 r1 · I-F9: «Convergencia» sigue al plazo y al percentil', async () => {
  const p = await m7Lab('ue=kd&uy=conv&lang=es');
  await p.locator('#m7Conv-pT svg').waitFor({ timeout: 30000 });
  await p.locator('#m7Deadline').fill('25');
  await p.locator('#m7Deadline').press('Enter');
  await p.waitForFunction(() => /≤ 25\)/.test(document.getElementById('m7ConvHead-pT').textContent));
  assert.match(await p.locator('#m7ConvHead-pT').innerText(), /1,000/);
  await p.locator('#m7Pct').fill('50');
  await p.locator('#m7Pct').press('Enter');
  await p.waitForFunction(() => /Percentil 50/.test(document.getElementById('m7ConvHead-q').textContent));
  await close(p);
});

check('F4b T017 r1 · I-F11: con 30 actividades y 100 000 réplicas, la simulación va a trozos (sin tareas largas) y atiende el teclado', async () => {
  const rows = Array.from({ length: 30 }, (_, i) => ownRow(`A${i}`, 1 + (i % 3), 3 + (i % 4), 9 + (i % 5), i ? `A${i - 1}${i > 2 ? `, A${i - 3}` : ''}` : ''));
  const p = await uncLab(ownUrl(rows, { um: 'm7', ur: 5 }));
  await p.evaluate(() => {
    window.__long = []; window.__lag = [];
    new PerformanceObserver((l) => { for (const e of l.getEntries()) { const s = PNL.unc.state().m7; if (s && !s.done) window.__long.push(e.duration); } }).observe({ type: 'longtask' });
    document.addEventListener('keydown', (e) => { const s = PNL.unc.state().m7; if (s && !s.done) window.__lag.push(performance.now() - e.timeStamp); });
  });
  for (let i = 0; i < 8; i++) { await p.keyboard.press('Shift'); await p.waitForTimeout(80); }
  await m7Done(p);
  const { long, lag } = await p.evaluate(() => ({ long: window.__long, lag: window.__lag }));
  assert.ok(lag.length >= 3, `sin teclas durante la simulación: ${JSON.stringify(lag)}`);
  for (const x of lag) assert.ok(x < 100, `${x.toFixed(1)} ms`);
  for (const x of long) assert.ok(x < 100, `tarea larga de ${x.toFixed(0)} ms mientras simula`);
  await close(p);
});

check('F4b T017 r1 · I-F12: el JSON que descarga M7 lleva Spearman, la unidad y los nombres, y el .py da la misma crucialidad', async () => {
  const p = await m7Lab('ue=kl&uo=s&uy=idx&ur=3&lang=es');
  const st = await m7Done(p, true);
  const [dl] = await Promise.all([p.waitForEvent('download'), p.locator('#m7Json').click()]);
  const file = path.join(require('node:os').tmpdir(), `pnl-m7-s-${process.pid}.json`);
  await dl.saveAs(file);
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.equal(data.corr, 'spearman');
  assert.equal(data.unit, 'semanas');
  assert.ok(data.activities.every((a) => a.name), 'los nombres de las actividades');
  const { spawnSync } = require('node:child_process');
  const pyBin = ['python3', 'python'].find((b) => { const r = spawnSync(b, ['--version'], { encoding: 'utf8' }); return r.status === 0 && /Python 3/.test(r.stdout + r.stderr); });
  if (pyBin) {
    const out = spawnSync(pyBin, [path.join(ROOT, 'python', 'pnl_montecarlo.py'), file, '--json'], { encoding: 'utf8' });
    assert.equal(out.status, 0, out.stderr);
    JSON.parse(out.stdout).cruc.forEach((v, i) => assert.ok(Math.abs(v - st.idx.cruc[i]) < 1e-9, `crucialidad de ${i}`));
  } else assert.ok(!process.env.CI, 'Python 3 en la CI');
  fs.unlinkSync(file);
  await close(p);
});

check('F4b T017 r1 · I-F15, I-F16 e I-F17: la nota del sesgo de fusión solo cuando la P baja, la tabla de clases con sus cifras y la columna «Exacta»', async () => {
  const a = await m7Lab('ue=kl&ud=40&lang=es');
  await m7Done(a);
  assert.equal(await a.locator('#m7Note').count(), 0, 'con un plazo de 40 no hay sesgo que contar');
  await close(a);
  const p = await m7Lab('ue=kl&lang=es');
  await m7Done(p);
  await p.locator('#m7Bins').click();
  const t = await p.evaluate(() => [...document.querySelectorAll('#m7BinsTable tbody tr')].map((tr) => [...tr.children].map((c) => c.textContent)));
  const num = (x) => Number(x.replace('.', '').replace(',', '.'));
  const N = await m7Node(p);
  assert.equal(t.length, N.r.hist.counts.length);
  t.forEach((r, i) => { assert.equal(num(r[1]), N.r.hist.counts[i]); assert.equal(r[2], fxEs(N.r.hist.counts[i] / N.r.n, 3)); });
  const [lo, hi] = t[10][0].split(' – ').map(num);
  const T = require(path.join(ROOT, 'js', 'core', 'threept.js'));
  assert.equal(t[10][3], fxEs(T.phi((hi - N.m.normal.mu) / N.m.normal.sd) - T.phi((lo - N.m.normal.mu) / N.m.normal.sd), 3), 'la normal de la clase');
  await close(p);
  // La misma tabla en M6 (unc-m56.js): las proporciones suman 1 y la normal de cada clase es la diferencia de Φ.
  const m6 = await uncLab('um=m6&ux=merge&lang=es');
  await m6.waitForFunction(() => { const s = PNL.unc.state().sim; return s && s.done; }, null, { timeout: 30000 });
  await m6.locator('#uncBins').click();
  const t6 = await m6.evaluate(() => [...document.querySelectorAll('#uncBinsTable tbody tr')].map((tr) => [...tr.children].map((c) => c.textContent)));
  const sum = (j) => t6.reduce((x, r) => x + num(r[j]), 0);
  assert.ok(Math.abs(sum(2) - 1) < 0.03, `proporciones: ${sum(2)}`);
  assert.ok(sum(3) > 0.9 && sum(3) <= 1.03, `normal: ${sum(3)}`);
  await close(m6);
  const d = await m7Lab('ue=kd&lang=es');
  await m7Done(d);
  const rows = await m7ResRows(d);
  assert.deepEqual([rows['Media'][2], rows['Desviación'][2], rows['P(duración ≤ 20)'][2]], ['23,25', fxEs(Math.sqrt((await m7Node(d)).m.exact.var), 2), '0,157']);
  await close(d);
});

check('F4b T017 r1 · I-F18 e I-F19: más de 8 caminos en la lista con «y N caminos más», y la red coloreada con el índice elegido', async () => {
  const rows = [];
  for (let i = 0; i < 4; i++) for (const s of ['X', 'Y']) rows.push(ownRow(`${s}${i}`, 2, 4, s === 'X' ? 6 : 9, i ? `X${i - 1}, Y${i - 1}` : ''));
  const p = await uncLab(ownUrl(rows, { um: 'm7', uy: 'idx', ur: 3 }));
  await m7Done(p, true);
  assert.equal(await p.locator('#m7Paths tbody tr').count(), 8);
  assert.match(await p.locator('#m7PathsMore').innerText(), /y 8 caminos más/);
  await close(p);
  const shades = (page) => page.evaluate(() => Object.fromEntries([...document.querySelectorAll('#m7Net g')].filter((g) => g.querySelector('rect.shade') && g.querySelector('text.nid'))
    .map((g) => [g.querySelector('text.nid').textContent, Number(g.querySelector('rect.shade').getAttribute('class').match(/shade-(\d)/)[1])])));
  for (const ui of ['cr', 'cu', 'si']) {
    const q = await m7Lab(`ue=kd&uy=idx&ui=${ui}&lang=es`);
    const st = await m7Done(q, true);
    const vals = ui === 'cr' ? st.idx.crit : ui === 'cu' ? st.idx.cruc.map((v) => Math.max(0, v)) : st.idx.sig;
    const got = await shades(q);
    ['A', 'B', 'C', 'D'].forEach((id, i) => assert.equal(got[id], Math.min(4, Math.floor(vals[i] * 5)), `${ui}: tono de ${id} (${vals[i]})`));
    await close(q);
  }
});

check('F4b T017 r1 · I-F2: el texto de la red coloreada se lee (contraste ≥ 4,5:1) en claro y en oscuro', async () => {
  for (const scheme of ['light', 'dark']) {
    const p = await m7Lab('ue=kd&uy=idx&lang=es', { scheme });
    await m7Done(p, true);
    const pairs = await p.evaluate(() => [...document.querySelectorAll('#m7Net g')].filter((g) => g.querySelector('rect.shade')).map((g) => [getComputedStyle(g.querySelector('rect.shade')).fill, getComputedStyle(g.querySelector('text.nid')).fill]));
    const lum = (c) => { const v = c.match(/\d+(\.\d+)?/g).slice(0, 3).map((x) => Number(x) / 255).map((x) => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4)); return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]; };
    const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };
    assert.ok(pairs.length >= 4);
    for (const [bg, fg] of pairs) assert.ok(ratio(bg, fg) >= 4.5, `${scheme}: ${fg} sobre ${bg} = ${ratio(bg, fg).toFixed(2)}`);
    // Los cinco tonos, también los que no salen en este ejemplo.
    const all = await p.evaluate(() => [0, 1, 2, 3, 4].map((k) => { const cs = getComputedStyle(document.documentElement); return [cs.getPropertyValue(`--shade-${k}`).trim(), k >= 3 ? cs.getPropertyValue('--card').trim() : getComputedStyle(document.body).color]; }));
    const hex = (c) => (c.startsWith('#') ? `rgb(${[1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16)).join(',')})` : c);
    for (const [bg, fg] of all) assert.ok(ratio(hex(bg), hex(fg)) >= 4.5, `${scheme}: tono ${bg} con ${fg}`);
    await close(p);
  }
});

check('F4b T017 r1 · I-F25: el tornado enseña la crucialidad con su signo y en el mismo orden que la tabla', async () => {
  // Klastorin con 100 réplicas: D casi nunca es crítica y su crucialidad sale negativa por el azar del muestreo (−0,05).
  const p = await m7Lab('ue=kl&ur=2&uy=idx&uz=u&lang=es');
  const st = await m7Done(p, true);
  const iD = 3;
  assert.ok(st.idx.cruc[iD] < -0.01, `crucialidad de D: ${st.idx.cruc[iD]}`);
  const table = await p.evaluate(() => [...document.querySelectorAll('#m7Idx tbody tr')].map((tr) => tr.getAttribute('data-act')));
  const tor = await p.evaluate(() => [...document.querySelectorAll('#m7Tor text.mc-id')].map((t) => t.textContent));
  assert.deepEqual(tor, table, 'mismo orden que la tabla');
  assert.equal(table[table.length - 1], 'D', 'D, la última por crucialidad');
  assert.match(await p.locator('#m7Tor svg').getAttribute('aria-label'), new RegExp(`D, criticidad [0-9,]+ y crucialidad ${fxEs(st.idx.cruc[iD], 2).replace('-', '−?-?')}`));
  const dRow = await p.evaluate(() => [...document.querySelector('#m7Idx tr[data-act="D"]').children].map((c) => c.textContent));
  assert.ok(dRow.some((c) => c.startsWith('-0,0')), `la tabla con el signo: ${dRow}`);
  await close(p);
});

check('F4b T017 r1 · I-F27: al salir de la pestaña, la simulación de M7 se para y no anuncia nada en otra vista', async () => {
  const p = await m7Lab('ur=5&ue=kl&lang=es');
  await p.waitForTimeout(150);
  await p.locator('#navWork').click();
  await p.waitForFunction(() => PNL.app.state().v === 'work');
  await p.waitForTimeout(2500);
  assert.doesNotMatch(await p.locator('#live').innerText(), /réplicas simuladas/);
  await p.goBack();
  await p.waitForFunction(() => PNL.app.state().v === 'unc');
  await m7Done(p);
  await close(p);
});

check('F4b T017 r1 · I-F3, I-F4 e I-F5: la carga bajo demanda se recupera de un fallo, avisa y no congela la página; un enlace de M7 no carga el comparador', async () => {
  // I-F3: mc.js falla una vez; al volver a pedir M7, se carga y funciona. Mientras, el aviso.
  const p = await uncLab('um=m6&lang=es');
  let fail = true;
  await p.route('**/js/core/mc.js', (r) => (fail ? r.abort() : r.continue()));
  await p.locator('#uncM7').click();
  await p.locator('#loadFailed:not([hidden])').waitFor();
  assert.match(await p.locator('#loadFailed').innerText(), /No se pudo cargar/);
  fail = false;
  await p.locator('#uncM7').click();
  await p.waitForFunction(() => PNL.app.state().um === 'm7' && PNL.mc);
  await m7Done(p);
  assert.equal(await p.locator('#loadFailed').isHidden(), true);
  await close(p);
  // I-F5: m7.js llega con 200 pero no es el script: la página no se congela y avisa.
  const q = await uncLab('um=m6&lang=es');
  await q.route('**/js/m7.js', (r) => r.fulfill({ status: 200, contentType: 'application/javascript', body: '/* otra cosa */' }));
  await q.locator('#uncM7').click();
  await q.locator('#loadFailed:not([hidden])').waitFor();
  assert.equal(await q.evaluate(() => 1 + 1), 2, 'la página responde');
  await close(q);
  // I-F4: un enlace de M7 con graph=aoa&view=cmp no carga el grupo del comparador.
  const r = await m7Lab('uy=conv&graph=aoa&view=cmp&lang=es');
  await r.locator('#m7Conv-mean svg').waitFor({ timeout: 30000 });
  assert.equal(await r.evaluate(() => !!PNL.retoTable), false);
  await close(r);
  // El fallo de red provocado (y solo ese) sale en la consola: no es un error de la página.
  for (let i = errors.length - 1; i >= 0; i--) if (/Failed to load resource: net::ERR_FAILED/.test(errors[i])) errors.splice(i, 1);
});

// ---------- F4b T017, ronda 2 de la revisión ----------

const dropNetErrors = () => { for (let i = errors.length - 1; i >= 0; i--) if (/Failed to load resource: net::ERR_FAILED/.test(errors[i])) errors.splice(i, 1); };
check('F4b T017 r2 · F1, F2 y F9: un grupo que falla en un script que no es el último se vuelve a pedir entero (pestaña, «Ejercicios», M0 y exportador) y el aviso sigue mientras quede uno roto', async () => {
  // La pestaña: threept.js (el primero de un) falla una vez; al volver a pulsarla se piden también sim.js y tcl.js.
  const p = await lab('lang=es');
  let fail = true;
  await p.route('**/js/core/threept.js', (r) => (fail ? r.abort() : r.continue()));
  await p.locator('#navUnc').click();
  await p.locator('#loadFailed:not([hidden])').waitFor();
  fail = false;
  await p.locator('#navUnc').click();
  await p.waitForFunction(() => PNL.app.state().v === 'unc' && !document.getElementById('uncView').hidden && PNL.unc.state());
  assert.equal(await p.locator('#loadFailed').isHidden(), true);
  await p.locator('#uncM7').click();
  await m7Done(p);
  await close(p);
  // «Ejercicios» (F2): grade.js falla una vez; el segundo clic lo vuelve a pedir y la vista se abre entera.
  const q = await lab('lang=es');
  fail = true;
  await q.route('**/js/core/grade.js', (r) => (fail ? r.abort() : r.continue()));
  await q.locator('#navEx').click();
  await q.locator('#loadFailed:not([hidden])').waitFor();
  fail = false;
  await q.locator('#navEx').click();
  await q.waitForFunction(() => PNL.app.state().v === 'ex' && PNL.grade && document.getElementById('exView').childElementCount > 0);
  await close(q);
  // El exportador después de un fallo de grade.js en «Ejercicios»: grade.js se vuelve a pedir (el script fallido se quitó).
  const r = await lab('lang=es');
  fail = true;
  await r.route('**/js/core/grade.js', (x) => (fail ? x.abort() : x.continue()));
  await r.locator('#navEx').click();
  await r.locator('#loadFailed:not([hidden])').waitFor();
  fail = false;
  await r.evaluate(() => { location.hash = '#v=moodle&lang=es'; });
  await r.waitForFunction(() => PNL.app.state().v === 'moodle' && PNL.grade && PNL.moodlePage);
  await close(r);
  // M0 (F2 y F9): precheck.js falla y statements.js carga después; el aviso sigue (m0 sigue roto) y el segundo clic abre M0.
  const m = await lab('lang=es');
  fail = true;
  await m.route('**/js/core/precheck.js', (x) => (fail ? x.abort() : x.continue()));
  await m.locator('#navM0').click();
  await m.locator('#loadFailed:not([hidden])').waitFor();
  await m.waitForFunction(() => !!PNL.statements);
  await m.waitForTimeout(300);
  assert.equal(await m.locator('#loadFailed').isHidden(), false, 'el aviso sigue mientras m0 está roto');
  fail = false;
  await m.locator('#navM0').click();
  await m.waitForFunction(() => PNL.app.state().v === 'm0' && PNL.precheck && !document.getElementById('m0View').hidden);
  assert.equal(await m.locator('#loadFailed').isHidden(), true);
  await close(m);
  dropNetErrors();
});
check('F4b T017 r2 · F3: el resumen y «Convergencia» siguen a la normal de M6 aunque la simulación no cambie; en gris, los índices con su correlación', async () => {
  const klRows = (mA) => [['A', 2, mA, 14, ''], ['B', 4, 7, 12, 'A'], ['C', 2, 8, 13, 'A'], ['D', 12, 14, 18, 'A'], ['E', 3, 5, 7, 'B, C'], ['F', 3, 4, 7, 'E']].map((x) => ownRow(...x));
  // A uniforme: su m no cambia la simulación, pero sí la normal de M6 (a, m y b de examen).
  const url = (mA, uy) => ownUrl(klRows(mA), { um: 'm7', ug: 'pert', uf: { A: 'unif' }, ud: 25, ur: 3, uy });
  for (const uy of ['dist', 'conv']) {
    const p = await uncLab(url(6, uy));
    await m7Done(p);
    const key = await p.evaluate(() => PNL.unc.state().m7.sim.key);
    await p.evaluate((h) => { location.hash = `#${h}`; }, url(10, uy));
    await p.waitForFunction(() => PNL.app.state().ut.rows[0].m === '10');
    await m7Done(p);
    assert.equal(await p.evaluate(() => PNL.unc.state().m7.sim.key), key, 'la simulación es la misma');
    const N = await m7Node(p);
    if (uy === 'dist') {
      const rows = await m7ResRows(p);
      assert.equal(rows['P(duración ≤ 25)'][1], fxEs(N.r.pN, 3), 'P de la normal nueva');
      assert.equal(rows.P50[1], fxEs(N.r.q.find((q) => q.p === 0.5).normal, 2), 'P50 de la normal nueva');
    } else {
      await p.waitForFunction((v) => document.querySelector('#m7Conv-pT .mc-reflabel').textContent.includes(v), fxEs(N.r.pN, 3));
    }
    await close(p);
  }
  // Pearson → Spearman con la misma simulación y después una discreta con errores: en gris, Spearman con sus valores.
  const q = await m7Lab('ue=kd&uy=idx&ur=3&lang=es');
  await m7Done(q, true);
  await q.locator('#m7Corr-s').check();
  await q.waitForFunction(() => PNL.app.state().uo === 's' && PNL.unc.state().m7.idx);
  const cOf = () => q.evaluate(() => ({ head: [...document.querySelectorAll('#m7Idx thead th')].map((x) => x.textContent).join('|'),
    c: [...document.querySelectorAll('#m7Idx tbody tr')].map((r) => [...r.cells].map((x) => x.textContent)).find((r) => r[0] === 'C') }));
  await q.waitForFunction(() => /Spearman/.test(document.querySelector('#m7Idx thead').textContent));
  const live = await cOf();
  await q.locator('#m7PerAct').click();
  await q.locator('#m7Edit-A').click();
  await q.locator('#m7Q-A-p-0').fill('0,9');
  await q.locator('#m7Q-A-p-0').press('Enter');
  await q.locator('#m7Blocked').waitFor();
  await q.locator('.m7-stale #m7Idx').waitFor();
  const stale = await cOf();
  assert.match(stale.head, /Crucialidad \(Spearman\)/);
  assert.deepEqual(stale, live, 'la tabla en gris es la de Spearman');
  await close(q);
  // Con la discreta rota antes de que lleguen los índices de Spearman: en gris, los de Pearson con su nombre (no los de
  // Pearson con el de Spearman, ni «Calculando…» para siempre).
  const big30 = Array.from({ length: 30 }, (_, i) => ownRow(`A${i}`, 1 + (i % 3), 3 + (i % 4), 9 + (i % 5), i ? `A${i - 1}${i > 2 ? `, A${i - 3}` : ''}` : ''));
  const w = await uncLab(`${ownUrl(big30, { um: 'm7', ur: 5, uy: 'idx' })}&uf=A0-d`);
  await m7Done(w, true);
  await w.waitForFunction(() => /Pearson/.test(document.querySelector('#m7Idx thead').textContent));
  const cOfW = () => w.evaluate(() => ({ head: [...document.querySelectorAll('#m7Idx thead th')].map((x) => x.textContent).join('|'),
    c: [...document.querySelectorAll('#m7Idx tbody tr')].map((r) => [...r.cells].map((x) => x.textContent)).find((r) => r[0] === 'A0') }));
  const pearson = await cOfW();
  await w.locator('#m7PerAct').click();
  await w.locator('#m7Edit-A0').click();
  await w.locator('#m7Corr-s').check();
  assert.equal(await w.evaluate(() => !!PNL.unc.state().m7.idx), false, 'los de Spearman, todavía sin llegar');
  await w.locator('#m7Q-A0-p-0').fill('0,9');
  await w.locator('#m7Q-A0-p-0').press('Enter');
  await w.locator('.m7-stale #m7Idx').waitFor();
  assert.deepEqual(await cOfW(), pearson, 'en gris, los de Pearson con su nombre');
  assert.equal(await w.locator('#m7IdxWait').count(), 0);
  await close(w);
});
check('F4b T017 r2 · F4: el cambio de una discreta se guarda en el momento, también con un clic rápido en otro botón, y el foco va a donde se hace clic', async () => {
  const p = await m7Lab('ue=kl&uf=A-d&ur=2&lang=es');
  await m7Done(p);
  await p.locator('#m7PerAct').click();
  await p.locator('#m7Edit-A').click();
  await p.locator('#m7Q-A-x-0').fill('1');
  await p.locator('#m7View-idx').click();                       // Playwright baja y sube el ratón a la vez
  await p.waitForFunction(() => { const q = (PNL.app.state().uq || {}).A; return q && q.x[0] === '1'; }, null, { timeout: 5000 });
  await p.locator('#m7Q-A-x-1').fill('5');
  await p.locator('#m7Q-A-p-2').click();
  await p.waitForFunction(() => PNL.app.state().uq.A.x[1] === '5');
  assert.equal(await activeId(p), 'm7Q-A-p-2', 'el foco, en la casilla del clic');
  await close(p);
});
check('F4b T017 r2 · F4: el repintado del editor llega con el foco a la casilla siguiente (aunque el temporizador tarde) y no se pierde lo que se teclea en ella', async () => {
  const p = await m7Lab('ue=kl&uf=A-d&ur=2&lang=es');
  await m7Done(p);
  await p.locator('#m7PerAct').click();
  await p.locator('#m7Edit-A').click();
  // Los temporizadores de 0 ms, a 500 ms: el repintado tiene que llegar con el focusin, no con el temporizador.
  await p.evaluate(() => { const st = window.setTimeout; window.setTimeout = (f, ms, ...a) => st(f, ms === 0 ? 500 : ms, ...a); });
  await p.locator('#m7Q-A-x-0').fill('3');
  await p.keyboard.press('Tab');
  await p.keyboard.press('Control+A');
  await p.keyboard.type('0,');
  await p.waitForTimeout(800);
  await p.keyboard.type('2');
  await p.keyboard.press('Enter');
  await p.waitForFunction(() => { const q = PNL.app.state().uq.A; return q.x[0] === '3' && q.p[0] === '0,2'; }, null, { timeout: 5000 });
  assert.equal(await activeId(p), 'm7Q-A-p-0');
  // Con Intro el foco no se mueve: se guarda y se repinta ya (el aviso de la suma, sin esperar al temporizador).
  assert.equal(await p.locator('#m7QErr-A').count(), 1, 'el aviso de la suma, en el momento');
  await close(p);
});
check('F4b T017 r2 · F7: una discreta que se rompe y vuelve a sus valores a mitad de la simulación (la misma clave) la termina', async () => {
  const rows = Array.from({ length: 30 }, (_, i) => ownRow(`A${i}`, 1 + (i % 3), 3 + (i % 4), 9 + (i % 5), i ? `A${i - 1}${i > 2 ? `, A${i - 3}` : ''}` : ''));
  const p = await uncLab(`${ownUrl(rows, { um: 'm7', ur: 5 })}&uf=A0-d`);
  await p.locator('#m7PerAct').click();
  await p.locator('#m7Edit-A0').click();
  const p0 = await p.locator('#m7Q-A0-p-0').inputValue();
  assert.equal(await p.evaluate(() => PNL.unc.state().m7.done), false, 'todavía simulando');
  await p.locator('#m7Q-A0-p-0').fill('0,9');
  await p.locator('#m7Q-A0-p-0').press('Enter');
  await p.locator('#m7Blocked').waitFor();
  await p.locator('#m7Q-A0-p-0').fill(p0);
  await p.locator('#m7Q-A0-p-0').press('Enter');
  await p.waitForFunction(() => !document.getElementById('m7Blocked'));
  await m7Done(p);                                               // antes se quedaba en «Simulando 100 000 réplicas…»
  await close(p);
});
check('F4b T017 r2 · F8: al salir de la pestaña la simulación de M7 se para (no sigue en segundo plano) y al volver se hace entera', async () => {
  const rows = Array.from({ length: 30 }, (_, i) => ownRow(`A${i}`, 1 + (i % 3), 3 + (i % 4), 9 + (i % 5), i ? `A${i - 1}` : ''));
  const p = await uncLab(ownUrl(rows, { um: 'm7', ur: 5 }));
  await p.waitForTimeout(150);
  assert.equal(await p.evaluate(() => PNL.unc.state().m7.done), false, 'todavía simulando');
  await p.locator('#navWork').click();
  await p.waitForFunction(() => PNL.app.state().v === 'work');
  await p.waitForTimeout(3000);
  assert.equal(await p.evaluate(() => PNL.unc.state().m7.done), false, 'la simulación no siguió fuera de la pestaña');
  assert.doesNotMatch(await p.locator('#live').innerText(), /réplicas simuladas/);
  await p.goBack();
  await p.waitForFunction(() => PNL.app.state().v === 'unc');
  await m7Done(p);
  const N = await m7Node(p);
  assert.equal((await m7St(p)).results.mean, N.r.mean, 'la misma media que en Node');
  await close(p);
});

// ---------- F3d, T008: construir la ROY en «Ejercicios» (oculto hasta T014; tableros 81–83, 89 y 92) ----------

const RC0 = require(path.join(ROOT, 'js', 'core', 'roycheck.js'));
const XB0 = require(path.join(ROOT, 'js', 'ex-build.js'));
const xbUrl = (s) => exUrl(Object.assign({ xk: 'roy' }, s));
async function xbLab(s, opts) {
  const page = await open(xbUrl(s), opts);
  await page.waitForFunction(() => PNL.exBuild && PNL.exBuild.state && PNL.exBuild.state() && PNL.exBuild.state().net);
  return page;
}
const xbSt = (page) => page.evaluate(() => PNL.exBuild.state());
const xbNet = async (page) => (await xbSt(page)).net;
const xbFiles = /ex-build\.js|roy-canvas\.js|roy-table\.js|i18n-build\.js|core\/roycheck\.js|build\.css/;
const xbGroups = (page) => page.evaluate((src) => performance.getEntriesByType('resource').filter((e) => new RegExp(src).test(e.name)).length, xbFiles.source);
const xbGood = (s) => XB0.placeLevels(RC0.fromTable(exModel(s).project));
const arcSet = (net) => net.arcs.map((a) => `${a.from}>${a.to}`).sort();
const xbNode = (id) => `#xb-n-${id}`;
// Con el teclado: el foco va al elemento (como con Tab) y se pulsa la tecla.
async function xbKey(page, id, key) { await page.focus(id); await page.keyboard.press(key); }

for (const lv of ['easy', 'medium', 'hard']) {
  const lang = lv === 'medium' ? 'en' : 'es';
  check(`F3d T008 AC1, AC8 y AC22 · nivel ${lv} en ${lang.toUpperCase()}: la red de la F1 es correcta en Practicar y da 100 al entregarla en Examen; al recargar sigue entregada`, async () => {
    const s = { sd: EX_CASES[lv].sd, lv, lang };
    const good = xbGood(s);
    let page = await xbLab(Object.assign({ rn: good }, s));
    assert.equal(await page.locator('#exKind-roy').getAttribute('aria-pressed'), 'true');
    assert.deepEqual(arcSet(await xbNet(page)), arcSet(good));
    assert.equal(await page.locator('#xbDiagTitle').count(), 0, 'sin diagnóstico hasta comprobar');
    await page.locator('#xbCheck').click();
    assert.equal(await page.locator('#xbDiagTitle').innerText(), I0.t(lang, 'xb.diag.ok'));
    assert.equal(await activeId(page), 'xbDiagTitle');
    assert.equal(await page.locator('#xbDiag li').count(), 0);
    assert.equal(await page.locator('#xbScore').count(), 0, 'en Practicar no hay nota');
    await close(page);

    page = await xbLab(Object.assign({ rn: good, xm: 'exam' }, s));
    for (const id of ['#xbCheck', '#xbSee', '#xbScore', '#xbDiagTitle']) assert.equal(await page.locator(id).count(), 0, `Examen sin ${id}`);
    await page.locator('#xbDeliver').click();
    assert.equal(await page.locator('#xbConfirmText').innerText(), I0.t(lang, 'xb.exam.confirm'));
    await page.locator('#xbConfirmYes').click();
    await page.waitForFunction(() => PNL.app.state().xd === 1);
    assert.equal(await page.locator('#xbScore').innerText(), '100 %');
    assert.equal(await page.locator('#xbGradeText').innerText(), XB0.gradeText(RC0.diagnose(exModel(s).project, good), lang));
    assert.equal(await page.locator('[data-k^="tool:"]').count(), 0, 'entregada: sin herramientas');
    assert.equal(await page.locator('#xbCorrect svg .xb-node').count(), exModel(s).project.activities.length + 2, 'la red correcta al lado');
    await page.reload();
    await page.waitForFunction(() => PNL.exBuild && PNL.exBuild.state && PNL.exBuild.state() && PNL.exBuild.state().score !== null);
    assert.equal(await page.locator('#xbScore').innerText(), '100 %');
    assert.equal((await xbSt(page)).score, 100);
    await close(page);
  });
}

check('F3d T008 AC5 y AC6 · una red entera solo con el teclado (nivel fácil): colocar con N, unir con U, mover con las flechas, quitar con Supr; la tabla cambia al momento', async () => {
  const s = { sd: EX_CASES.easy.sd, lv: 'easy', lang: 'es' };
  const { project: p, sol } = exModel(s);
  const good = RC0.fromTable(p);
  const page = await xbLab(s);
  assert.deepEqual((await xbNet(page)).nodes.map((n) => n.id), ['_S', '_E'], 'Inicio y Fin ya puestos');
  // Colocar: la ficha con Intro y N junto al nodo enfocado (cada actividad tras la anterior).
  let near = '_S';
  for (const a of sol.cpm.order) {
    await xbKey(page, `#xb-c-${a}`, 'Enter');
    assert.equal(await page.locator(`#xb-c-${a}`).getAttribute('aria-pressed'), 'true');
    await xbKey(page, xbNode(near), 'n');
    assert.ok((await xbNet(page)).nodes.some((n) => n.id === a), `${a} colocada`);
    assert.equal(await activeId(page), `xb-n-${a}`, 'el foco pasa al nodo nuevo');
    assert.equal(await page.locator(`#xbPred-${a}`).getAttribute('aria-label'), I0.t('es', 'xb.predsOf', { x: a }));
    near = a;
  }
  assert.equal(await page.locator('.xb-chip').count(), 0);
  // Unir: U en el origen y U en el destino; la fila del destino en «Tu red como tabla» cambia al momento.
  for (const e of good.arcs) {
    await xbKey(page, xbNode(e.from), 'u');
    await xbKey(page, xbNode(e.to), 'u');
    assert.ok(arcSet(await xbNet(page)).includes(`${e.from}>${e.to}`), `${e.from} → ${e.to}`);
    assert.equal(await page.locator(`#xbPred-${e.to}`).inputValue(), XB0.predsText(await xbNet(page), e.to, 'es'));
  }
  assert.deepEqual(arcSet(await xbNet(page)), arcSet(good));
  // Esc cancela un arco a medias; un arco de un nodo a sí mismo no se crea.
  const a0 = sol.cpm.order[0];
  await xbKey(page, xbNode(a0), 'u');
  assert.equal((await xbSt(page)).canvas.pending.from, a0);
  await page.keyboard.press('Escape');
  assert.equal((await xbSt(page)).canvas.pending, null);
  await xbKey(page, xbNode(a0), 'u');
  await page.keyboard.press('u');
  assert.equal((await xbSt(page)).canvas.status, 'xb.bad.same');
  assert.deepEqual(arcSet(await xbNet(page)), arcSet(good));
  // Mover con las flechas (20 por pulsación) sin cambiar los arcos.
  const x0 = (await xbNet(page)).nodes.find((n) => n.id === a0).x;
  await xbKey(page, xbNode(a0), 'ArrowRight');
  assert.equal((await xbNet(page)).nodes.find((n) => n.id === a0).x, x0 + 20);
  assert.equal(await activeId(page), `xb-n-${a0}`);
  // Supr en un arco lo quita; Supr en Inicio no hace nada; Supr en una actividad la devuelve a «Por colocar».
  const e0 = good.arcs.find((e) => e.from !== '_S' && e.to !== '_E');
  await xbKey(page, `#xb-a-${e0.from}-${e0.to}`, 'Delete');
  assert.ok(!arcSet(await xbNet(page)).includes(`${e0.from}>${e0.to}`));
  await xbKey(page, xbNode('_S'), 'Delete');
  assert.equal((await xbSt(page)).canvas.status, 'xb.bad.fixed');
  await xbKey(page, xbNode(e0.from), 'u');
  await xbKey(page, xbNode(e0.to), 'u');
  // Comprobar con el teclado: la red es correcta.
  await xbKey(page, '#xbCheck', 'Enter');
  assert.equal(await page.locator('#xbDiagTitle').innerText(), I0.t('es', 'xb.diag.ok'));
  // Una edición borra el diagnóstico y vuelve a la tabla.
  await xbKey(page, xbNode(a0), 'ArrowLeft');
  assert.equal(await page.locator('#xbDiagTitle').count(), 0);
  assert.ok(await visible(page, '#xbGiven'));
  // Supr en una actividad: vuelve a «Por colocar» con sus arcos fuera.
  await xbKey(page, xbNode(a0), 'Delete');
  assert.ok(!(await xbNet(page)).nodes.some((n) => n.id === a0));
  assert.ok(!(await xbNet(page)).arcs.some((e) => e.from === a0 || e.to === a0));
  assert.equal(await page.locator(`#xb-c-${a0}`).count(), 1);
  await axe(page, 'Construir la ROY a medio hacer (ES, claro)');
  await close(page);
});

check('F3d T008 AC6 · la red entera desde «Tu red como tabla» (EN, medio): cada fila cambia el lienzo; lo que no es una actividad se avisa y no cambia nada', async () => {
  const s = { sd: EX_CASES.medium.sd, lv: 'medium', lang: 'en' };
  const { project: p } = exModel(s);
  const good = RC0.fromTable(p);
  const page = await xbLab(s);
  for (const id of p.activities.map((a) => a.id).concat(['_E'])) {
    const preds = good.arcs.filter((e) => e.to === id).map((e) => (e.from === '_S' ? 'Start' : e.from));
    await page.locator(`#xbPred-${id}`).fill(preds.join(', '));
    await page.keyboard.press('Tab');
    await page.waitForFunction(([x, n]) => PNL.exBuild.state().net.arcs.filter((e) => e.to === x).length === n, [id, preds.length]);
  }
  const net = await xbNet(page);
  assert.deepEqual(arcSet(net), arcSet(good));
  assert.equal(net.nodes.length, p.activities.length + 2, 'todas en el lienzo');
  assert.equal(await page.locator('.xb-chip').count(), 0);
  // «Inicio» también vale en inglés; lo que no es una actividad se avisa.
  const a = p.activities.find((x) => !p.preds[x.id].length).id;
  await page.locator(`#xbPred-${a}`).fill('ZZ');
  await page.keyboard.press('Tab');
  assert.equal(await page.locator(`#xbPred-${a}`).getAttribute('aria-invalid'), 'true');
  assert.equal(await page.locator('#xbTableMsg').innerText(), I0.t('en', 'xb.bad.unknown', { v: 'ZZ' }));
  assert.deepEqual(arcSet(await xbNet(page)), arcSet(good), 'sin cambios');
  await page.locator(`#xbPred-${a}`).fill('Inicio');
  await page.keyboard.press('Tab');
  await page.waitForFunction((x) => !document.getElementById(`xbPred-${x}`).hasAttribute('aria-invalid'), a);
  assert.equal(await page.locator(`#xbPred-${a}`).inputValue(), 'Start');
  await page.locator('#xbCheck').click();
  assert.equal(await page.locator('#xbDiagTitle').innerText(), I0.t('en', 'xb.diag.ok'));
  await close(page);
});

check('F3d T008 AC5 · «Colocar por niveles» no cambia los arcos: cada arco va hacia la derecha y no hay dos nodos en el mismo sitio', async () => {
  const s = { sd: EX_CASES.hard.sd, lv: 'hard', lang: 'es' };
  const good = xbGood(s);
  // Todos los nodos amontonados en una columna.
  const messy = { nodes: good.nodes.map((n, i) => ({ id: n.id, x: 60, y: 40 + 20 * i })), arcs: good.arcs };
  const page = await xbLab(Object.assign({ rn: messy }, s));
  await page.locator('#xbPlace').click();
  const net = await xbNet(page);
  assert.deepEqual(arcSet(net), arcSet(good));
  const at = Object.fromEntries(net.nodes.map((n) => [n.id, n]));
  for (const e of net.arcs) assert.ok(at[e.from].x < at[e.to].x, `${e.from} → ${e.to} hacia la derecha`);
  assert.equal(new Set(net.nodes.map((n) => `${n.x},${n.y}`)).size, net.nodes.length);
  assert.equal((await xbSt(page)).canvas.status, 'xb.did.place');
  await close(page);
});

check('F3d T008 AC2–AC4 · Practicar con errores (EN, oscuro): «Comprobar» numera los problemas de roycheck en la lista y en el dibujo; el aviso de redundancia; una edición los borra', async () => {
  const s = { sd: EX_CASES.hard.sd, lv: 'hard', lang: 'en' };
  const { project: p } = exModel(s);
  const good = xbGood(s);
  const acts = good.arcs.filter((e) => e.from !== '_S' && e.to !== '_E');
  const [drop, flip] = acts;
  const red = require(path.join(ROOT, 'js', 'core', 'aoa.js'))._reduce(p);
  const ids = p.activities.map((a) => a.id);
  const transitive = ids.flatMap((x) => [...red.reach[x]].filter((y) => !red.direct[x].includes(y)).map((y) => ({ from: x, to: y })))
    .find((e) => e.from !== drop.from && e.from !== flip.from && e.from !== flip.to);
  const rn = { nodes: good.nodes, arcs: good.arcs.filter((e) => e !== drop && e !== flip).concat([{ from: flip.to, to: flip.from }, transitive]) };
  const r = RC0.diagnose(p, rn);
  assert.ok(r.issues.length >= 2 && r.warnings.length >= 1, 'el caso tiene problemas y un aviso');
  const page = await xbLab(Object.assign({ rn }, s), { scheme: 'dark' });
  assert.equal(await page.locator('.xb-svg .xb-badge').count(), 0, 'sin marcas hasta comprobar');
  await page.locator('#xbCheck').click();
  assert.equal(await page.locator('#xbDiagTitle').innerText(), r.issues.length === 1 ? I0.t('en', 'xb.diag.titleOne') : I0.t('en', 'xb.diag.title', { n: r.issues.length }));
  assert.deepEqual(await page.locator('#xbDiag li > span:last-child').allInnerTexts(), r.issues.map((i) => XB0.issueText(i, p, 'en')));
  assert.deepEqual(await page.locator('#xbDiag li .xb-badge').allInnerTexts(), r.issues.map((i, k) => String(k + 1)));
  assert.equal(await page.locator('#xbWarn li').count(), r.warnings.length);
  // Cada problema se marca con su número en el dibujo, con trazo discontinuo (no solo color).
  const badges = await page.locator('.xb-svg .xb-badge.bad text').allTextContents();
  for (let k = 1; k <= r.issues.length; k++) if (r.issues[k - 1].code !== 'missingNode') assert.ok(badges.includes(String(k)), `marca ${k}`);
  assert.equal(await page.locator(`#xb-a-${flip.to}-${flip.from}`).getAttribute('class'), 'xb-arc bad');
  assert.equal(await page.locator(`#xb-a-${transitive.from}-${transitive.to}`).getAttribute('class'), 'xb-arc warn');
  assert.match(await page.locator(`#xb-a-${flip.to}-${flip.from}`).getAttribute('aria-label'), /problem \d/);
  assert.ok(!(await visible(page, '#xbGiven')), 'con el diagnóstico, la tabla va plegada');
  await axe(page, 'Construir la ROY tras comprobar (EN, oscuro)');
  await xbKey(page, xbNode(drop.from), 'ArrowDown');
  assert.equal(await page.locator('#xbDiagTitle').count(), 0);
  assert.equal(await page.locator('.xb-svg .xb-badge').count(), 0);
  await close(page);
});

check('F3d T008 AC8 y AC22 · Examen con un ciclo (ES, oscuro): sin marcas hasta entregar; nota con el tope del 50 %, lista numerada y la red correcta; al recargar, igual y bloqueada', async () => {
  const s = { sd: EX_CASES.medium.sd, lv: 'medium', lang: 'es' };
  const { project: p } = exModel(s);
  const good = xbGood(s);
  const red = require(path.join(ROOT, 'js', 'core', 'aoa.js'))._reduce(p);
  const ids = p.activities.map((a) => a.id);
  let back = null;
  for (const x of ids) { const y = [...red.reach[x]].find((z) => !red.direct[x].includes(z)); if (y) { back = { from: y, to: x }; break; } }
  const rn = { nodes: good.nodes, arcs: good.arcs.concat([back]) };
  const r = RC0.diagnose(p, rn);
  assert.ok(r.counts.cycle);
  const page = await xbLab(Object.assign({ rn, xm: 'exam' }, s), { scheme: 'dark' });
  assert.equal(await page.locator('.xb-svg .xb-badge').count(), 0);
  assert.equal(await page.locator('.xb-foot p').first().innerText(), I0.t('es', 'xb.exam.note'));
  await page.locator('#xbDeliver').click();
  await page.locator('#xbConfirmNo').click();
  assert.equal(await activeId(page), 'xbDeliver');
  assert.equal((await state(page)).xd, 0);
  await page.locator('#xbDeliver').click();
  await page.locator('#xbConfirmYes').click();
  await page.waitForFunction(() => PNL.app.state().xd === 1);
  const want = async () => {
    assert.equal(await page.locator('#xbScore').innerText(), XB0.scoreText(r, 'es'));
    assert.equal(RC0.score(r), Math.min(50, RC0.score(r)));
    assert.equal(await page.locator('#xbGradeText').innerText(), XB0.gradeText(r, 'es'));
    assert.ok((await page.locator('#xbGradeText').innerText()).includes(I0.t('es', 'xb.grade.cycle')));
    assert.equal(await page.locator('#xbDiag li').count(), r.issues.length);
    assert.equal(await page.locator('.xb-svg [role="button"]').count(), 0, 'entregada: nada que pulsar en el dibujo');
    assert.equal(await page.locator('#xbCorrect .xb-node').count(), ids.length + 2);
    assert.equal(await page.locator('#xbPred-_E').getAttribute('readonly'), 'readonly');
    assert.equal(await page.locator('#xbAnother2').count(), 1);
  };
  await want();
  await axe(page, 'Construir la ROY entregada (ES, oscuro)');
  await page.reload();
  await page.waitForFunction(() => PNL.exBuild && PNL.exBuild.state && PNL.exBuild.state() && PNL.exBuild.state().score !== null);
  await want();
  assert.deepEqual(arcSet(await xbNet(page)), arcSet(rn), 'la red entregada no cambia');
  await close(page);
});

check('F3d T008 · sin xk, el cálculo con el tipo en la barra (publicado en T014) y sin el grupo xb; con xk=roy, el grupo entero; cambiar de tipo con algo hecho pide confirmación y vuelve al cálculo de siempre', async () => {
  let page = await exLab({ sd: EX_CASES.medium.sd, lv: 'medium' });
  assert.equal(await page.locator('#exKind-calc').getAttribute('aria-pressed'), 'true', 'el tipo, publicado en T014');
  assert.equal(await page.locator('#exKindSel').count(), 1);
  assert.equal(await xbGroups(page), 0, 'sin el grupo xb');
  await close(page);
  page = await xbLab({ sd: EX_CASES.medium.sd, lv: 'medium', lang: 'es' });
  assert.equal(await xbGroups(page), 6, 'el grupo xb entero');
  assert.deepEqual(await page.locator('.ex-kind-seg button').allInnerTexts(), [I0.t('es', 'ex.kind.calc'), I0.t('es', 'ex.kind.roy'), I0.t('es', 'ex.kind.pert'), I0.t('es', 'ex.kind.det')], 'solo los tipos ya hechos (T010: también la PERT; T011, el detective)');
  // Sin nada hecho, otro ejercicio no pregunta.
  const sd0 = (await state(page)).sd;
  await page.locator('#exAnother').click();
  await page.waitForFunction((x) => PNL.app.state().sd !== x, sd0);
  assert.equal(await page.locator('#exLoseText').count(), 0);
  assert.equal((await state(page)).xk, 'roy');
  // Con una actividad colocada, cambiar de tipo pide confirmación.
  const a = exModel({ sd: (await state(page)).sd, lv: 'medium' }).project.activities[0].id;
  await xbKey(page, `#xb-c-${a}`, 'Enter');
  await xbKey(page, xbNode('_S'), 'n');
  await page.locator('#exKind-calc').click();
  assert.equal(await page.locator('#exLoseText').innerText(), I0.t('es', 'ex.loseKind'));
  assert.equal(await page.locator('#exLoseYes').innerText(), I0.t('es', 'ex.loseKindYes'));
  await page.locator('#exLoseNo').click();
  assert.equal((await state(page)).xk, 'roy');
  await page.locator('#exAnother').click();
  assert.equal(await page.locator('#exLoseText').innerText(), I0.t('es', 'ex.loseWork'));
  await page.locator('#exLoseNo').click();
  await page.locator('#exKind-calc').click();
  await page.locator('#exLoseYes').click();
  await page.waitForFunction(() => PNL.app.state().xk === 'calc');
  const st = await state(page);
  assert.equal(st.rn, null);
  assert.ok(await visible(page, 'table.ex-ans'), 'el cálculo de siempre');
  assert.equal(await page.locator('#exKind-calc').getAttribute('aria-pressed'), 'true', 'con el cálculo, el tipo sigue en la barra (T014)');
  assert.ok(!(await page.evaluate(() => location.hash)).includes('xk='));
  await close(page);
});

check('F3d T008 AC18 · 360 px: el tipo en un desplegable, la tabla, el lienzo con desplazamiento propio y «Tu red como tabla», sin desplazar la página de lado', async () => {
  const s = { sd: EX_CASES.hard.sd, lv: 'hard', lang: 'es', rn: xbGood({ sd: EX_CASES.hard.sd, lv: 'hard' }) };
  const page = await xbLab(s, { width: 360, height: 740 });
  assert.ok(await visible(page, '#exKindSel'));
  assert.equal(await page.locator('#exKindSel').inputValue(), 'roy');
  assert.ok(!(await visible(page, '#exKind-roy')));
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'sin desplazamiento horizontal de la página');
  const order = await page.evaluate(() => ['xbGiven', 'xbSvg', 'xbPred-A'].map((id) => document.getElementById(id).getBoundingClientRect().top));
  assert.ok(order[0] < order[1] && order[1] < order[2], 'tabla, lienzo y «Tu red como tabla», en ese orden');
  assert.ok(await page.locator('.xb-canvas-box').evaluate((b) => b.scrollWidth > b.clientWidth), 'el lienzo se desplaza dentro de su recuadro');
  await axe(page, 'Construir la ROY a 360 px');
  await close(page);
});

check('F3d T008 AC18 · 1280×720, nivel difícil a medio hacer y tras comprobar: la página no se desplaza', async () => {
  const s = { sd: 15, lv: 'hard', lang: 'es' };
  const good = xbGood(s);
  // Tablero 81: tres actividades por colocar.
  const nodes = good.nodes.filter((n, i) => n.id === '_E' || i < good.nodes.length - 4);
  const has = (id) => nodes.some((n) => n.id === id);
  const page = await xbLab(Object.assign({ rn: { nodes, arcs: good.arcs.filter((e) => has(e.from) && has(e.to)) } }, s));
  // El criterio de la F3a (AC16): «Ejercicios» acaba dentro de la ventana, sin desplazar la página.
  const fits = () => page.evaluate(() => window.scrollY === 0 && document.getElementById('exView').getBoundingClientRect().bottom <= 720 && document.documentElement.scrollWidth <= 1280);
  assert.ok(await fits(), 'a medio hacer');
  for (const id of ['#xbCheck', '#xbSee', '#xbPlace', '.xb-chip']) {
    const b = await page.locator(id).first().boundingBox();
    assert.ok(b && b.y + b.height <= 720, `${id} a la vista`);
  }
  await page.locator('#xbCheck').click();
  assert.ok(await fits(), 'tras comprobar');
  await page.locator('#xbSee').click();
  assert.ok(await fits(), 'con la red correcta');
  await close(page);
});

// ---------- F3d, T009: reto ROY en el taller (oculto hasta T014; tableros 88 y 92) ----------

const EXS0 = require(path.join(ROOT, 'js', 'core', 'examples.js'));
const PRJ0 = require(path.join(ROOT, 'js', 'core', 'project.js'));
const ej6 = () => { const e = EXS0.get('ej6'); return PRJ0.parse(e.rows, e.mode).project; };
const rrState = (s) => Object.assign(U0.defaults(), { v: 'route', ex: 'ej6', step: 0, view: 'reto', lang: 'es' }, s);
const rrUrl = (s) => `cpm.html${U0.encode(rrState(s))}`;
async function rrLab(s, opts) {
  const page = await open(rrUrl(s), opts);
  await page.waitForFunction(() => PNL.app.royReto && PNL.app.royReto() && PNL.app.royReto().net);
  return page;
}
const rrSt = (page) => page.evaluate(() => PNL.app.royReto());
const crFiles = /core\/aoacheck\.js|\/reto\.js|reto-canvas\.js|reto-table\.js/;
const crGroups = (page) => page.evaluate((src) => performance.getEntriesByType('resource').filter((e) => new RegExp(src).test(e.name)).length, crFiles.source);
// El caso comprobado a mano en T002 (Ejercicio 6): falta F → I, sobra C → F y K → H va al revés.
const ej6Bad = (good) => ({ nodes: good.nodes,
  arcs: good.arcs.filter((e) => !(e.from === 'F' && e.to === 'I') && !(e.from === 'H' && e.to === 'K')).concat([{ from: 'C', to: 'F' }, { from: 'K', to: 'H' }]) });

check('F3d T009 AC12 y AC13 · reto ROY del taller (ES, Ejercicio 6 en la ruta): «Reto ROY» pulsado junto a Red y Matriz; empieza con Inicio y Fin; lo colocado va al enlace y vuelve al recargar; sin nota ni Examen; grupo xb entero y sin cr', async () => {
  const page = await rrLab({});
  assert.equal((await state(page)).view, 'reto');
  assert.ok(await visible(page, '#btnRetoRoy'), 'el botón, pulsado, junto a Red y Matriz');
  assert.equal(await page.locator('#btnRetoRoy').innerText(), I0.t('es', 'view.retoRoy'));
  assert.equal(await page.locator('#btnRetoRoy').getAttribute('aria-pressed'), 'true');
  assert.equal(await page.locator('#btnNet').getAttribute('aria-pressed'), 'false');
  assert.equal(await page.locator('#btnMatrix').getAttribute('aria-pressed'), 'false');
  assert.ok(await visible(page, '#btnMatrix'));
  assert.ok(!(await visible(page, '#btnReto')), 'el reto de ficticias es de la red PERT');
  assert.equal(await page.locator('#btnAon').getAttribute('aria-pressed'), 'true');
  assert.ok(await visible(page, '#royRetoView'));
  assert.equal(await page.locator('#royRetoView').getAttribute('aria-label'), I0.t('es', 'xb.reto.region'));
  for (const id of ['#netView', '#side', '#retoView', '#cmpView', '#matrixView']) assert.ok(!(await visible(page, id)), `sin ${id}`);
  assert.equal(await page.locator('#xbRetoTitle').innerText(), I0.t('es', 'xb.reto.title'));
  assert.deepEqual((await rrSt(page)).net.nodes.map((n) => n.id), ['_S', '_E'], 'Inicio y Fin ya puestos');
  assert.equal(await page.locator('#royRetoView .xb-chip').count(), ej6().activities.length, 'todas por colocar');
  // Sin nota ni Examen: «Ver la red correcta» y «Comprobar».
  for (const id of ['#xbDeliver', '#xbScore', '#xbGrade', '#xbAnother2']) assert.equal(await page.locator(id).count(), 0, `sin ${id}`);
  assert.ok(await visible(page, '#xbCheck'));
  assert.ok(await visible(page, '#xbSee'));
  // Colocar A con el teclado: va al enlace (rn) y vuelve al recargar.
  await xbKey(page, '#xb-c-A', 'Enter');
  await xbKey(page, xbNode('_S'), 'n');
  await page.waitForFunction(() => PNL.app.state().rn && PNL.app.state().rn.nodes.some((n) => n.id === 'A'));
  assert.match(await page.evaluate(() => location.hash), /[#&]rn=/);
  await xbKey(page, xbNode('_S'), 'u');
  await xbKey(page, xbNode('A'), 'u');
  await page.waitForFunction(() => PNL.app.state().rn.arcs.length === 1);
  await page.reload();
  await page.waitForFunction(() => PNL.app.royReto && PNL.app.royReto() && PNL.app.royReto().net);
  const net = (await rrSt(page)).net;
  assert.deepEqual(net.nodes.map((n) => n.id).sort(), ['A', '_E', '_S']);
  assert.deepEqual(arcSet(net), ['_S>A']);
  assert.equal(await xbGroups(page), 6, 'el grupo xb entero');
  assert.equal(await crGroups(page), 0, 'sin el grupo del reto de ficticias');
  await axe(page, 'Reto ROY del taller (ES)');
  await close(page);
});

check('F3d T009 AC12 · reto ROY en el taller con el Ejercicio 6 (EN, oscuro): la red de la F1 es correcta; con errores, «Comprobar» da el diagnóstico de roycheck numerado y sin nota; una edición lo borra', async () => {
  const p = ej6();
  const good = XB0.placeLevels(RC0.fromTable(p));
  let page = await rrLab({ v: 'work', lang: 'en', rn: good }, { scheme: 'dark' });
  assert.deepEqual(arcSet((await rrSt(page)).net), arcSet(good));
  await page.locator('#xbCheck').click();
  assert.equal(await page.locator('#xbDiagTitle').innerText(), I0.t('en', 'xb.diag.ok'));
  assert.equal(await activeId(page), 'xbDiagTitle');
  assert.equal(await page.locator('#xbDiag li').count(), 0);
  assert.equal(await page.locator('#xbScore').count(), 0, 'sin nota');
  await page.locator('#xbSee').click();
  assert.equal(await page.locator('#xbCorrect svg .xb-node').count(), p.activities.length + 2, 'la red correcta');
  await close(page);

  const bad = ej6Bad(good);
  const r = RC0.diagnose(p, bad);
  assert.ok(r.issues.length >= 3, 'el caso tiene sus tres problemas');
  page = await rrLab({ v: 'work', lang: 'en', rn: bad }, { scheme: 'dark' });
  assert.equal(await page.locator('#royRetoView .xb-svg .xb-badge').count(), 0, 'sin marcas hasta comprobar');
  await page.locator('#xbCheck').click();
  assert.equal(await page.locator('#xbDiagTitle').innerText(), I0.t('en', 'xb.diag.title', { n: r.issues.length }));
  assert.deepEqual(await page.locator('#xbDiag li > span:last-child').allInnerTexts(), r.issues.map((i) => XB0.issueText(i, p, 'en')));
  assert.equal(await page.locator('#xbWarn li').count(), r.warnings.length);
  assert.equal(await page.locator('#xb-a-K-H').getAttribute('class'), 'xb-arc bad');
  assert.equal(await page.locator('#xbScore').count(), 0, 'sin nota');
  assert.equal((await rrSt(page)).score, null);
  await axe(page, 'Reto ROY tras comprobar (EN, oscuro)');
  await xbKey(page, xbNode('C'), 'ArrowDown');
  assert.equal(await page.locator('#xbDiagTitle').count(), 0, 'una edición borra el diagnóstico');
  assert.equal(await page.locator('#royRetoView .xb-svg .xb-badge').count(), 0);
  await close(page);
});

check('F3d T009 AC12 · tabla con errores en el taller: el reto ROY no se abre, salen los mensajes de la F1 y el aviso; con la tabla corregida, se abre', async () => {
  const rows = [{ id: 'A', name: '', duration: '2', links: 'B' }, { id: 'B', name: '', duration: '3', links: 'A' }, { id: 'C', name: '', duration: '1', links: '' }];
  const page = await open(rrUrl({ v: 'work', ex: null, t: rows, mode: 'succ' }));
  await page.waitForFunction(() => document.getElementById('royRetoBad') && !document.getElementById('royRetoBad').hidden);
  assert.equal(await page.locator('#royRetoBad').innerText(), I0.t('es', 'xb.reto.bad'));
  assert.ok(await visible(page, '#workshop .issues.err'), 'los mensajes de la F1');
  assert.ok(!(await visible(page, '#stage')), 'el reto no se abre');
  assert.equal(await page.locator('#royRetoView .xb-svg').count(), 0);
  const ok = [{ id: 'A', name: '', duration: '2', links: 'B' }, { id: 'B', name: '', duration: '3', links: '' }, { id: 'C', name: '', duration: '1', links: '' }];
  await setHash(page, U0.encode(rrState({ v: 'work', ex: null, t: ok, mode: 'succ' })));
  await page.waitForFunction(() => PNL.app.royReto && PNL.app.royReto() && PNL.app.royReto().net);
  assert.ok(await visible(page, '#royRetoView'));
  assert.ok(!(await visible(page, '#royRetoBad')));
  assert.equal(await page.locator('#royRetoView .xb-chip').count(), 3);
  await close(page);
});

check('F3d T009 · sin view=reto, el botón sin pulsar (publicado en T014) y sin grupo xb; «Red» y «Red PERT» vuelven a la red; el reto de ficticias no ve el botón; de «Ejercicios» al reto ROY, un solo lienzo', async () => {
  let page = await lab('v=route&ex=ej6&step=0&lang=es');
  assert.equal(await page.locator('#btnRetoRoy').count(), 1);
  assert.ok(await visible(page, '#btnRetoRoy'), 'el botón, publicado en T014');
  assert.equal(await page.locator('#btnRetoRoy').getAttribute('aria-pressed'), 'false');
  assert.equal(await xbGroups(page), 0, 'sin el grupo xb');
  await close(page);
  const good = XB0.placeLevels(RC0.fromTable(ej6()));
  page = await rrLab({ rn: good });
  await page.locator('#btnNet').click();
  await page.waitForFunction(() => PNL.app.state().view === 'net');
  assert.ok(await visible(page, '#netView'));
  assert.ok(!(await visible(page, '#royRetoView')));
  assert.equal(await page.locator('#royRetoView *').count(), 0, 'el reto ROY se vacía al salir');
  assert.equal(await page.locator('#btnRetoRoy').getAttribute('aria-pressed'), 'false');
  await setHash(page, U0.encode(rrState({ rn: good })));
  await page.waitForFunction(() => PNL.app.royReto() && PNL.app.royReto().net.nodes.length > 2);
  assert.ok(await visible(page, '#btnRetoRoy'));
  await page.locator('#btnAoa').click();
  await page.waitForFunction(() => PNL.app.state().graph === 'aoa');
  assert.equal((await state(page)).view, 'net', 'desde el reto, la red PERT');
  assert.ok(!(await visible(page, '#btnRetoRoy')));
  await close(page);
  page = await retoLab('ex=ej6&lang=es');
  assert.ok(await visible(page, '#retoView'));
  assert.ok(!(await visible(page, '#btnRetoRoy')), 'el reto de ficticias no ve el botón');
  assert.equal(await xbGroups(page), 0, 'ni carga xb');
  await close(page);
  // De construir la ROY en «Ejercicios» al reto ROY del taller: un solo lienzo con sus ids.
  page = await xbLab({ sd: EX_CASES.easy.sd, lv: 'easy', lang: 'es' });
  await setHash(page, U0.encode(rrState({ rn: good })));
  await page.waitForFunction(() => PNL.app.royReto && PNL.app.royReto() && PNL.app.royReto().net && PNL.app.royReto().net.nodes.length > 2);
  assert.equal(await page.locator('[id="xbCheck"]').count(), 1);
  assert.equal(await page.locator('[id="xb-n-_S"]').count(), 1);
  await page.locator('#xbCheck').click();
  assert.equal(await page.locator('#xbDiagTitle').innerText(), I0.t('es', 'xb.diag.ok'));
  await close(page);
});

// ---------- F3d, T010: construir la PERT en «Ejercicios» (oculto hasta T014; tableros 84 y 85) ----------

const RT0 = require(path.join(ROOT, 'js', 'reto.js'));
const MD0 = require(path.join(ROOT, 'js', 'core', 'mindummy.js'));
const xpUrl = (s) => exUrl(Object.assign({ xk: 'pert' }, s));
async function xpLab(s, opts) {
  const page = await open(xpUrl(s), opts);
  await page.waitForFunction(() => PNL.exBuild && PNL.exBuild.state && PNL.exBuild.state() && PNL.exBuild.state().pert);
  return page;
}
const xpSt = (page) => page.evaluate(() => PNL.exBuild.state().pert);
// La red PERT del alumno (la del reto, js/reto) que dibuja una red de sucesos numerados (la mínima o la de las reglas).
function xpFrom(net, p) {
  let s = RT0.start(p); const id = new Map();
  for (const ev of net.events) { s = RT0.apply(s, { type: 'addEvent', x: 40 + ev.n * 60, y: 40 }); id.set(ev.n, s.net.events[s.net.events.length - 1].id); }
  for (const ev of net.events) s = RT0.apply(s, { type: 'number', id: id.get(ev.n), n: ev.n });
  for (const a of net.arcs) s = RT0.apply(s, { type: 'arc', act: a.act, from: id.get(a.from), to: id.get(a.to) });
  for (const d of net.dummies) s = RT0.apply(s, { type: 'addDummy', from: id.get(d.from), to: id.get(d.to) });
  return { s, id };
}
const xpMin = (m) => ({ value: m.info.dummies, lower: m.info.dummies, exact: true });
const xpPct = (v, lang) => { const r = Math.round(v * 10) / 10; return `${lang === 'es' ? String(r).replace('.', ',') : r} %`; };
async function xpDeliver(page) {
  await page.locator('#xbDeliver').click();
  assert.equal(await page.locator('#xbConfirmText').count(), 1);
  await page.locator('#xbConfirmYes').click();
  await page.waitForFunction(() => PNL.app.state().xd === 1);
  await page.waitForFunction(() => PNL.exBuild.state().pert && PNL.exBuild.state().pert.score !== null);
}

check('F3d T010 AC7 y AC13 · construir la PERT en Practicar (ES, medio): la tabla dada, la de sucesos y el lienzo; «Comprobar» da el diagnóstico del reto sin nota; «Ver una solución»; grupos xb y cr', async () => {
  const s = { sd: EX_CASES.medium.sd, lv: 'medium', lang: 'es' };
  const m = exModel(Object.assign({ xk: 'pert' }, s));
  const page = await xpLab(s);
  assert.equal(await page.locator('#exKind-pert').getAttribute('aria-pressed'), 'true');
  assert.deepEqual(await page.locator('.ex-kind-seg button').allInnerTexts(), ['calc', 'roy', 'pert', 'det'].map((k) => I0.t('es', `ex.kind.${k}`)), 'los tipos hechos');
  assert.ok(await visible(page, '#xbGiven'), 'la tabla de precedencias');
  assert.equal(await page.locator('#xbGiven tbody tr').count(), m.project.activities.length);
  assert.equal(await page.locator('#exView .reto-title').innerText(), I0.t('es', 'reto.title'));
  assert.equal(await page.locator('#exView table.reto-tbl tbody th').count(), m.project.activities.length, 'la tabla de sucesos');
  assert.ok(await visible(page, '#exView .reto-svg'), 'el lienzo');
  assert.ok(await visible(page, '#exView [data-k="solution"]'));
  assert.equal(await page.locator('#xbDeliver').count(), 0);
  assert.equal(await crGroups(page), 4, 'el grupo cr');
  for (const re of [/ex-build\.js/, /core\/roycheck\.js/, /i18n-build\.js/]) {
    assert.ok(await page.evaluate((src) => performance.getEntriesByType('resource').some((e) => new RegExp(src).test(e.name)), re.source), re.source);
  }
  // Una actividad con el lienzo: va al enlace (sn).
  await page.locator('#exView [data-k="tool:event"]').click();
  await page.locator('#exView .reto-svg').click({ position: { x: 60, y: 60 } });
  await page.waitForFunction(() => PNL.app.state().sn && PNL.app.state().sn.events.length === 1);
  assert.match(await page.evaluate(() => location.hash), /[#&]sn=/);
  await close(page);
  // La red mínima: correcta, sin nota.
  const { s: st } = xpFrom(MD0.solve(m.project).net, m.project);
  const page2 = await xpLab(Object.assign({ sn: st.net }, s));
  await page2.locator('#exView [data-k="check"]').click();
  await page2.waitForFunction(() => PNL.exBuild.state().pert.result);
  assert.match(await page2.locator('#exView .reto-result').innerText(), /^Red correcta/);
  assert.equal((await xpSt(page2)).result.min.value, m.info.dummies, 'el mínimo de la tabla generada');
  assert.equal(await page2.locator('#xbScore').count(), 0, 'en Practicar no hay nota');
  await page2.locator('#exView [data-k="solution"]').click();
  assert.ok(await visible(page2, '#exView .reto-solution'));
  await page2.locator('#exView [data-k="back"]').click();
  assert.ok(await visible(page2, '#exView .reto-svg'));
  await axe(page2, 'Construir la PERT en Practicar (ES)');
  await close(page2);
});

check('F3d T010 AC7, AC8 y AC22 · Examen (ES, medio): sin «Ver una solución» ni diagnóstico; entregada con una ficticia de más, 95 %; bloqueada; la red mínima y la de las reglas; al recargar, igual', async () => {
  const s = { sd: EX_CASES.medium.sd, lv: 'medium', lang: 'es', xm: 'exam' };
  const m = exModel(Object.assign({ xk: 'pert' }, s));
  const md = MD0.solve(m.project);
  const { s: base, id } = xpFrom(md.net, m.project);
  const last = id.get(Math.max(...md.net.events.map((e) => e.n)));
  const st = RT0.apply(base, { type: 'addDummy', from: id.get(1), to: last });
  const c = RT0.check(st, m.project, xpMin(m)).result;
  assert.equal(c.correct, true);
  assert.equal(c.extra, 1);
  const page = await xpLab(Object.assign({ sn: st.net }, s));
  for (const k of ['solution', 'check']) assert.equal(await page.locator(`#exView [data-k="${k}"]`).count(), 0, `Examen sin ${k}`);
  assert.equal(await page.locator('#exView .reto-res').innerText(), I0.t('es', 'xb.exam.note'));
  assert.equal(await page.locator('#xbScore').count(), 0);
  await xpDeliver(page);
  assert.equal(await page.locator('#xbScore').innerText(), '95 %');
  assert.equal(await page.locator('#xbGradeText').innerText(), I0.t('es', 'xb.pert.extra', { k: c.dummies, e: 1, min: m.info.dummies, pct: 95 }));
  assert.equal(await activeId(page), 'xbGradeHead');
  assert.match(await page.locator('#exView .reto-result').innerText(), /^Red correcta/, 'la corrección del reto');
  assert.equal(await page.locator('#exView [data-k^="tool:"]').count(), 0, 'entregada: sin herramientas');
  assert.equal(await page.locator('#exView [data-k="addDummy"]').count(), 0);
  assert.equal(await page.locator('#exView input.reto-cell:not([readonly])').count(), 0, 'la tabla de sucesos, solo de lectura');
  await page.locator('#xpSeeMin').click();
  assert.match(await page.locator('#exView .reto-solution .reto-count').innerText(), new RegExp(`^${m.info.dummies} `));
  assert.equal(await page.locator('#exView select[data-k="method"]').inputValue(), 'min');
  await page.locator('#xpSeeRules').click();
  assert.equal(await page.locator('#exView select[data-k="method"]').inputValue(), 'rules');
  await page.locator('#exView [data-k="back"]').click();
  assert.ok(await visible(page, '#exView .reto-svg'));
  await axe(page, 'Construir la PERT entregada (ES)');
  await page.reload();
  await page.waitForFunction(() => PNL.exBuild && PNL.exBuild.state && PNL.exBuild.state() && PNL.exBuild.state().pert && PNL.exBuild.state().pert.score !== null);
  assert.equal(await page.locator('#xbScore').innerText(), '95 %');
  assert.equal((await xpSt(page)).score, 95);
  await close(page);
});

for (const [lv, lang, kind] of [['easy', 'es', 'min'], ['hard', 'en', 'wrong']]) {
  check(`F3d T010 AC7 y AC22 · Examen (${lang.toUpperCase()}, ${lv}): ${kind === 'min' ? 'la red mínima da 100' : 'una red incorrecta da como mucho 60, con las precedencias representadas'}`, async () => {
    const s = { sd: EX_CASES[lv].sd, lv, lang, xm: 'exam' };
    const m = exModel(Object.assign({ xk: 'pert' }, s));
    const { s: base } = xpFrom(MD0.solve(m.project).net, m.project);
    const last = m.sol.cpm.order[m.sol.cpm.order.length - 1];
    const st = kind === 'min' ? base : RT0.apply(base, { type: 'arc', act: last, from: null, to: null });
    const c = RT0.check(st, m.project, xpMin(m)).result;
    const score = RC0.scorePert(st.net, m.project, c);
    const page = await xpLab(Object.assign({ sn: st.net }, s));
    await xpDeliver(page);
    assert.equal(await page.locator('#xbScore').innerText(), xpPct(score, lang));
    const want = kind === 'min' ? I0.t(lang, 'xb.pert.min', { min: m.info.dummies })
      : I0.t(lang, 'xb.pert.wrong', Object.assign(RC0.pertHits(st.net, m.project), { pct: xpPct(score, lang).replace(' %', '') }));
    assert.equal(await page.locator('#xbGradeText').innerText(), want);
    if (kind === 'min') assert.equal(score, 100); else assert.ok(score <= 60 && score > 0, String(score));
    await close(page);
  });
}

check('F3d T010 AC7 y H3 · «Personalizar» sin rango de ficticias y sin mínimo exacto (ES): el mejor conocido, con el aviso; Examen entregado, 100', async () => {
  const s = { sd: 5, lv: 'custom', gp: { n: [24, 24], pred: 2.2, dummies: null, critical: [1, 3], dmax: 9 }, lang: 'es', xm: 'exam' };
  const m = exModel(Object.assign({ xk: 'pert' }, s));
  assert.equal(m.info.dummies, null);
  const md = MD0.solve(m.project);
  assert.equal(md.exact, false);
  const { s: st } = xpFrom(md.net, m.project);
  const page = await xpLab(Object.assign({ sn: st.net }, s));
  await xpDeliver(page);
  assert.equal(await page.locator('#xbScore').innerText(), '100 %');
  assert.equal(await page.locator('#xbGradeText').innerText(), `${I0.t('es', 'xb.pert.min', { min: md.value })} ${I0.t('es', 'xb.pert.notExact', { min: md.value })}`);
  await close(page);
});

check('F3d T010 · cambiar de tipo: de la ROY a la PERT con algo hecho pide confirmación y borra rn; el reto de ficticias del taller sigue igual (sin xb)', async () => {
  const s = { sd: EX_CASES.easy.sd, lv: 'easy', lang: 'es' };
  let page = await xbLab(s);
  const a = exModel(s).project.activities[0].id;
  await xbKey(page, `#xb-c-${a}`, 'Enter');
  await xbKey(page, xbNode('_S'), 'n');
  await page.locator('#exKind-pert').click();
  assert.equal(await page.locator('#exLoseText').innerText(), I0.t('es', 'ex.loseKind'));
  await page.locator('#exLoseYes').click();
  await page.waitForFunction(() => PNL.app.state().xk === 'pert' && PNL.exBuild.state() && PNL.exBuild.state().pert);
  assert.equal((await state(page)).rn, null);
  assert.ok(await visible(page, '#exView .reto-svg'));
  assert.equal(await page.locator('#xb-n-_S').count(), 0, 'sin el lienzo ROY');
  await close(page);
  page = await retoLab('ex=ej6&lang=es');
  assert.ok(await visible(page, '#retoView .reto-svg'));
  assert.ok(await visible(page, '#retoView [data-k="solution"]'));
  assert.equal(await page.evaluate(() => performance.getEntriesByType('resource').some((e) => /ex-build\.js/.test(e.name))), false);
  await close(page);
});

// ---------- F3d, T011: detective en «Ejercicios» (oculto hasta T014; tableros 86, 87 y 92) ----------

const DT0 = require(path.join(ROOT, 'js', 'core', 'detective.js'));
require(path.join(ROOT, 'js', 'i18n-det.js'));
// Al pedirlo (las pruebas en rojo de T011 corrían sin el módulo).
const XD0 = new Proxy({}, { get: (o, k) => require(path.join(ROOT, 'js', 'ex-det.js'))[k] });
const dtUrl = (s) => exUrl(Object.assign({ xk: 'det' }, s));
async function dtLab(s, opts) {
  const page = await open(dtUrl(s), opts);
  await page.waitForFunction(() => PNL.exDet && PNL.exDet.state && PNL.exDet.state() && PNL.exDet.state().seeded);
  return page;
}
const dtSt = (page) => page.evaluate(() => PNL.exDet.state());
// Lo mismo que siembra el navegador, en Node (AC10): la tabla de la semilla (o la siguiente que admite el grupo, H2).
const dtSeed = (s) => DT0.forSeed(X0.params(exState0(s)), s.sd, { level: s.lv, graph: s.dg || 'aon', kind: s.dk || 'all' });
const dtFiles = /ex-det\.js|det-view\.js|i18n-det\.js|core\/detective\.js|core\/aoacheck\.js|core\/roycheck\.js|det\.css/;
const dtGroups = (page) => page.evaluate((src) => performance.getEntriesByType('resource').filter((e) => new RegExp(src).test(e.name)).length, dtFiles.source);
const dtEl = (el) => `#exView [data-el="${el}"]`;
// Marca un elemento con el teclado (foco, Intro y la opción del menú) o con el ratón.
async function dtMark(page, el, type, how) {
  if (how === 'click') await page.locator(dtEl(el)).first().click();
  else { await page.focus(dtEl(el)); await page.keyboard.press('Enter'); }
  await page.waitForSelector('#dtMenu');
  await page.locator(`#dtMenu [data-type="${type}"]`).click();
  await page.waitForFunction((t) => (PNL.app.state().dm || []).some((m) => m.type === t), type);
}
const dtCtx = (r, s) => ({ graph: r.seeded.graph, project: r.project, shown: r.seeded.shown, lang: s.lang || 'es', nota: s.nota || 'en', numFmt: (v) => XD0.num(v, s.lang || 'es') });

check('F3d T011 AC9, AC10, AC11 y AC20 · detective ROY en Practicar (ES, medio, todos): los mismos errores que en Node; marcar con el teclado y con el ratón; encontrado, a medias y falsa alarma; nota y explicaciones; grupo dt sin xb', async () => {
  const s = { sd: EX_CASES.medium.sd, lv: 'medium', lang: 'es', dg: 'aon', dk: 'all' };
  const r = dtSeed(s);
  assert.equal(r.moved, false);
  const page = await dtLab(s);
  const st = await dtSt(page);
  assert.deepEqual(st.seeded.errors, r.seeded.errors, 'AC10: la misma semilla siembra lo mismo en el navegador y en Node');
  assert.equal(st.seeded.count, 2);
  assert.equal(await page.locator('#exKind-det').getAttribute('aria-pressed'), 'true');
  assert.equal(await page.locator('#dtNet-aon').getAttribute('aria-pressed'), 'true');
  assert.equal(await page.locator('#dtKind-all').getAttribute('aria-pressed'), 'true');
  assert.equal(await page.locator('#dtTitle').innerText(), I0.t('es', 'det.title', { n: 2 }));
  assert.equal(await page.locator('#dtMoved').count(), 0);
  assert.equal(await dtGroups(page), 7, 'el grupo dt');
  assert.equal(await page.evaluate(() => performance.getEntriesByType('resource').some((e) => /ex-build\.js|roy-canvas\.js|i18n-build\.js|\/reto\.js/.test(e.name))), false, 'sin xb ni cr');
  // La red que se enseña: los arcos de la red con errores y los valores de la tabla verdadera salvo los sembrados (P6).
  for (const a of r.seeded.shown.roy.arcs) assert.equal(await page.locator(dtEl(`${a.from}>${a.to}`)).count(), 1, `${a.from}>${a.to}`);
  const [eNet, eCalc] = r.seeded.errors;
  assert.equal(await page.locator(dtEl(eCalc.element)).textContent(), String(eCalc.wrong), 'el valor sembrado');
  const other = r.project.activities.map((a) => a.id).find((a) => a !== eCalc.element.split('.')[0] && !eNet.accept.includes(a));
  assert.equal(await page.locator(dtEl(`${other}.LS`)).textContent(), String(exModel(s).sol.cpm.times[other].LS), 'el valor verdadero');
  assert.equal(await page.locator('#dtCheck').count(), 1);
  assert.equal(await page.locator('#dtDeliver').count(), 0);
  // El menú de un arco: los tres tipos de la red ROY; Esc lo cierra y el foco vuelve al arco.
  await page.focus(dtEl(eNet.element));
  await page.keyboard.press('Enter');
  assert.equal(await page.locator('#dtMenuHead').innerText(), I0.t('es', 'det.menuOf', { x: I0.t('es', 'det.el.arc', { from: eNet.data.from, to: eNet.data.to }) }));
  assert.deepEqual(await page.locator('#dtMenu [data-type]').evaluateAll((xs) => xs.map((x) => x.getAttribute('data-type'))), ['royFalse', 'royInverted', 'royCycle']);
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#dtMenu').count(), 0);
  assert.equal(await page.evaluate(() => document.activeElement.getAttribute('data-el')), eNet.element);
  // A medias (otro tipo), encontrado (con el ratón) y una falsa alarma; cada marca con su número, no solo color.
  await dtMark(page, eNet.element, 'royInverted');
  await dtMark(page, eCalc.element, 'calcES', 'click');
  await dtMark(page, `${other}.LS`, 'calcLF');
  assert.match(await page.evaluate(() => location.hash), /[#&]dm=/);
  assert.equal(await page.locator('#dtMarks li').count(), 3, 'la lista de marcas (alternativa en texto)');
  assert.deepEqual((await page.locator('#exView .dt-net [data-el] .dt-badge').allTextContents()).sort(), ['1', '2', '3'], 'insignias numeradas');
  assert.equal(await page.locator('#dtResult').count(), 0, 'sin corrección hasta comprobar');
  await page.locator('#dtCheck').click();
  const g = DT0.grade(r.seeded, (await state(page)).dm);
  assert.deepEqual(g.perError.map((x) => x.status), ['half', 'found']);
  assert.equal(g.falseAlarms.length, 1);
  assert.equal(await page.locator('#dtScore').innerText(), '50 %');
  assert.equal(await page.locator('#dtResultHead').innerText(), I0.t('es', 'det.res.title', { f: 1, n: 2 }));
  assert.equal(await activeId(page), 'dtResultHead');
  assert.deepEqual(await page.locator('#dtResult li .dt-st').allInnerTexts(), ['½ A medias', '✓ Encontrado', '✗ Falsa alarma']);
  const ctx = dtCtx(r, s);
  for (const [k, e] of r.seeded.errors.entries()) assert.equal(await page.locator(`#dtResult li[data-error="${e.id}"] .dt-exp`).innerText(), XD0.explainText(e, ctx), `explicación ${k + 1}`);
  assert.equal(await page.locator(`${dtEl(eNet.element)}.half`).count(), 1, 'la marca del dibujo cambia con la corrección');
  await axe(page, 'Detective ROY en Practicar, comprobado (ES)');
  // Cambiar una marca borra la corrección; con el tipo bueno, 75 %.
  await dtMark(page, eNet.element, 'royFalse');
  assert.equal(await page.locator('#dtResult').count(), 0);
  await page.locator('#dtCheck').click();
  assert.equal(await page.locator('#dtScore').innerText(), '75 %');
  // Quitar una marca con Supr en el dibujo (la corrección se va) y otra desde la lista de marcas.
  await page.focus(dtEl(`${other}.LS`));
  await page.keyboard.press('Delete');
  await page.waitForFunction(() => PNL.app.state().dm.length === 2);
  assert.equal(await page.locator('#dtResult').count(), 0);
  await page.locator(`#dtMarks [data-unmark="${eCalc.element}"]`).click();
  await page.waitForFunction(() => PNL.app.state().dm.length === 1);
  assert.equal(await activeId(page), 'dtMarksHead');
  await close(page);
});

check('F3d T011 AC9 y AC17 · detective PERT en Practicar (EN, difícil, de la red, oscuro): sin cifras; lo que falta, marcado en su otro extremo; no encontrado con su arco punteado; «Ver los errores»', async () => {
  const s = { sd: EX_CASES.hard.sd, lv: 'hard', lang: 'en', dg: 'aoa', dk: 'net' };
  const r = dtSeed(s);
  const page = await dtLab(s, { scheme: 'dark' });
  assert.deepEqual((await dtSt(page)).seeded.errors, r.seeded.errors);
  assert.equal(await page.locator('#dtTitle').innerText(), I0.t('en', 'det.title', { n: 3 }));
  assert.equal(await page.locator('#exView [data-el*="."]').count(), 0, 'sin cifras ni críticas');
  assert.equal(await page.locator('#dtLegend').innerText(), I0.t('en', 'det.noFigures'));
  for (const e of r.seeded.shown.pert.events) assert.equal(await page.locator(dtEl(`e${e.n}`)).count(), 1);
  const miss = r.seeded.errors.find((e) => e.type === 'pertMissingDummy');
  const fals = r.seeded.errors.find((e) => e.type === 'pertFalseDummy');
  const inv = r.seeded.errors.find((e) => e.type === 'pertInvertedDummy');
  // El menú de un suceso: solo «le falta una ficticia»; el de una actividad, «mismos sucesos».
  await page.focus(dtEl(miss.accept[1]));
  await page.keyboard.press('Enter');
  assert.deepEqual(await page.locator('#dtMenu [data-type]').evaluateAll((xs) => xs.map((x) => x.getAttribute('data-type'))), ['pertMissingDummy']);
  await page.keyboard.press('Escape');
  await dtMark(page, miss.accept[1], 'pertMissingDummy');
  await dtMark(page, fals.element, 'pertFalseDummy');
  await page.locator('#dtCheck').click();
  assert.equal(await page.locator('#dtScore').innerText(), '66.7 %');
  assert.deepEqual(await page.locator('#dtResult li .dt-st').allInnerTexts(), r.seeded.errors.map((e) => (e === inv ? '? Not found' : '✓ Found')));
  assert.equal(await page.locator(`${dtEl(inv.element)}.missed`).count(), 1, 'lo no encontrado, marcado en el dibujo');
  await axe(page, 'Detective PERT comprobado (EN, oscuro)');
  // «Ver los errores»: la lista con su explicación.
  await page.locator('#dtSee').click();
  assert.equal(await page.locator('#dtErrors li').count(), 3);
  assert.equal(await page.locator(`#dtErrors li[data-error="${miss.id}"] .dt-exp`).innerText(), XD0.explainText(miss, dtCtx(r, s)));
  await close(page);
});

// Un error de cada tipo (los 16), encontrado al comprobar con las marcas del enlace.
const DT_TYPES = { aon: DT0.TYPES.aon.net.concat(DT0.TYPES.aon.calc), aoa: DT0.TYPES.aoa.net.concat(DT0.TYPES.aoa.calc) };
for (const graph of ['aon', 'aoa']) {
  check(`F3d T011 AC9, AC10 y AC11 · los ocho tipos de la red ${graph === 'aon' ? 'ROY' : 'PERT'}: cada uno encontrado (nota 100) con su explicación, y los mismos errores que en Node`, async () => {
    const want = new Set(DT_TYPES[graph]);
    for (let sd = 1; want.size && sd < 400; sd++) {
      const s = { sd, lv: 'hard', lang: sd % 2 ? 'es' : 'en', dg: graph, dk: 'all' };
      const r = dtSeed(s);
      if (!r || r.moved || !r.seeded.errors.some((e) => want.has(e.type))) continue;
      const dm = r.seeded.errors.map((e) => ({ element: e.accept[e.accept.length - 1], type: e.type }));
      const page = await dtLab(Object.assign({ dm }, s));
      assert.deepEqual((await dtSt(page)).seeded.errors, r.seeded.errors, `semilla ${sd}`);
      await page.locator('#dtCheck').click();
      assert.equal(await page.locator('#dtScore').innerText(), '100 %', `semilla ${sd}`);
      for (const e of r.seeded.errors) {
        assert.equal(await page.locator(`#dtResult li[data-error="${e.id}"] .dt-exp`).innerText(), XD0.explainText(e, dtCtx(r, s)), `${e.type} (semilla ${sd})`);
        want.delete(e.type);
      }
      await close(page);
    }
    assert.deepEqual([...want], [], 'todos los tipos');
  });
}

check('F3d T011 AC8 y AC13 · Examen (EN, fácil, ROY, de cálculo): marcas sin corrección; «Entregar» con confirmación; bloqueado; nota; al recargar, igual', async () => {
  const s = { sd: EX_CASES.easy.sd, lv: 'easy', lang: 'en', dg: 'aon', dk: 'calc', xm: 'exam' };
  const r = dtSeed(s);
  const [e] = r.seeded.errors;
  const page = await dtLab(s);
  for (const id of ['#dtCheck', '#dtSee', '#dtScore']) assert.equal(await page.locator(id).count(), 0, `Examen sin ${id}`);
  assert.equal(await page.locator('#dtNote').innerText(), I0.t('en', 'det.exam.note'));
  assert.equal(await page.locator('#exView .dt-net [data-el*=">"]').count(), r.seeded.shown.roy.arcs.length, 'los arcos se ven');
  // Con errores de cálculo, el menú de un arco no tiene nada que ofrecer: los arcos no se pueden pulsar.
  assert.equal(await page.locator('#exView .dt-net g[data-el*=">"][tabindex]').count(), 0);
  await dtMark(page, e.element, e.type);
  assert.equal(await page.locator(`${dtEl(e.element)}.marked`).count(), 1, 'marcado, sin decir si está bien');
  await page.locator('#dtDeliver').click();
  assert.equal(await page.locator('#dtConfirmText').innerText(), I0.t('en', 'det.exam.confirm'));
  await page.locator('#dtConfirmYes').click();
  await page.waitForFunction(() => PNL.app.state().xd === 1);
  assert.equal(await page.locator('#dtScore').innerText(), '100 %');
  assert.equal(await activeId(page), 'dtResultHead');
  await page.locator(dtEl(e.element)).first().click();
  assert.equal(await page.locator('#dtMenu').count(), 0, 'entregado: sin menú');
  assert.equal(await page.locator('#dtMarks [data-unmark]').count(), 0);
  await axe(page, 'Detective entregado (EN)');
  await page.reload();
  await page.waitForFunction(() => PNL.exDet && PNL.exDet.state && PNL.exDet.state() && PNL.exDet.state().grading);
  assert.equal(await page.locator('#dtScore').innerText(), '100 %');
  assert.equal((await dtSt(page)).grading.score, 100);
  await close(page);
});

check('F3d T011 H2 · la tabla de la semilla no admite ningún error del grupo (fácil, PERT, de la red): se usa la de la semilla siguiente y el enunciado lo dice', async () => {
  let sd = 1;
  while (!dtSeed({ sd, lv: 'easy', dg: 'aoa', dk: 'net' }).moved) sd++;
  const s = { sd, lv: 'easy', lang: 'es', dg: 'aoa', dk: 'net' };
  const r = dtSeed(s);
  const page = await dtLab(s);
  const st = await dtSt(page);
  assert.equal(st.used, r.sd);
  assert.deepEqual(st.seeded.errors, r.seeded.errors);
  assert.equal(await page.locator('#dtMoved').innerText(), I0.t('es', 'det.moved', { sd, used: r.sd }));
  assert.equal(await page.locator('#dtGiven tbody tr').count(), r.project.activities.length);
  assert.equal((await state(page)).sd, sd, 'el enlace guarda la semilla pedida');
  await close(page);
});

check('F3d T011 P5 · los dos selectores (Red y Errores) y el tipo: cambiar con marcas pide confirmación y las borra; de otro tipo al detective', async () => {
  const s = { sd: EX_CASES.medium.sd, lv: 'medium', lang: 'es' };
  const page = await dtLab(Object.assign({ dg: 'aon', dk: 'all' }, s));
  assert.deepEqual(await page.locator('.ex-kind-seg button').allInnerTexts(), ['calc', 'roy', 'pert', 'det'].map((k) => I0.t('es', `ex.kind.${k}`)), 'los cuatro tipos');
  const e = dtSeed(Object.assign({ dg: 'aon', dk: 'all' }, s)).seeded.errors[0];
  await dtMark(page, e.element, e.type);
  await page.locator('#dtNet-aoa').click();
  assert.equal(await page.locator('#exLoseText').innerText(), I0.t('es', 'ex.loseWork'));
  await page.locator('#exLoseYes').click();
  await page.waitForFunction(() => PNL.app.state().dg === 'aoa' && PNL.exDet.state().seeded && PNL.exDet.state().seeded.graph === 'aoa');
  assert.equal((await state(page)).dm, null);
  await page.locator('#dtKind-calc').click();
  await page.waitForFunction(() => PNL.app.state().dk === 'calc' && PNL.exDet.state().seeded.kind === 'calc');
  assert.deepEqual((await dtSt(page)).seeded.errors, dtSeed(Object.assign({ dg: 'aoa', dk: 'calc' }, s)).seeded.errors);
  await page.locator('#exKind-roy').click();
  await page.waitForFunction(() => PNL.app.state().xk === 'roy' && PNL.exBuild && PNL.exBuild.state && PNL.exBuild.state());
  await page.locator('#exKind-det').click();
  await page.waitForFunction(() => PNL.app.state().xk === 'det' && PNL.exDet.state() && PNL.exDet.state().seeded);
  await close(page);
});

check('F3d T011 AC16 y AC17 · notación española y 360 px: la leyenda con tᵢ y fᵢ; sin desplazamiento horizontal de la página; la red como tabla', async () => {
  const s = { sd: EX_CASES.hard.sd, lv: 'hard', lang: 'es', dg: 'aon', dk: 'all', nota: 'es' };
  let page = await dtLab(s);
  assert.equal(await page.locator('#dtLegend').innerText(), I0.t('es', 'det.legendAon', I0.notation('es')));
  await page.locator('#dtAlt summary').click();
  assert.equal(await page.locator('#dtAlt tbody tr').count(), dtSeed(s).project.activities.length + 2, 'Inicio, actividades y Fin');
  await close(page);
  page = await dtLab(s, { width: 360, height: 740 });
  assert.ok((await page.evaluate(() => document.documentElement.scrollWidth)) <= 360, 'sin desplazamiento horizontal');
  await axe(page, 'Detective a 360 px (ES)');
  await close(page);
});

// ---------- F3d, T013: las etapas 7 a 10 en el exportador (oculto hasta T014; tableros 90 y 91) ----------

const MQ0 = require(path.join(ROOT, 'js', 'core', 'moodle.js'));
const IM0 = require(path.join(ROOT, 'js', 'i18n-moodle.js'));
const NS0 = require(path.join(ROOT, 'js', 'views', 'net-svg.js'));
const LAB = ['minDummy', 'succ', 'immPred', 'detective'];
// Publicadas en T014: el exportador las ofrece al abrirlo.
async function mqLab(lang, opts) {
  const p = await mqOpen(lang, opts);
  await p.waitForFunction((n) => document.querySelectorAll('#mqView .mq-stages .mq-check').length === n, 12);
  return p;
}
// La pregunta de la vista previa, en Node: la primera semilla desde 1 que da pregunta (como moodle-page), con la imagen.
function mqPreview0(stage, level, lang, nota) {
  const ctx = { lang, nota, sf: false, labels: IM0.labels(nota), svg: NS0.render };
  for (let sd = 1; sd < 50; sd++) { const q = MQ0.question(stage, MQ0.exercise(level, sd), ctx, IM0.tr(lang)); if (q) return JSON.parse(JSON.stringify(q)); }
  return null;
}
const mqFiles = /core\/aoacheck\.js|core\/roycheck\.js|core\/detective\.js|views\/net-svg\.js/;

check('F3d T013 · sin publicar (f3dPublic falso), el exportador no ofrece las etapas 7 a 10 ni su aviso; con ellas, al final, marcadas, con su descripción y el aviso del laboratorio (ES y EN)', async () => {
  const p0 = await mqOpen('en');
  await p0.evaluate(() => { PNL.moodlePage.f3dPublic = false; });
  await setCtl(p0, '#selLang', 'es');
  await p0.waitForFunction(() => document.querySelectorAll('#mqView .mq-stages .mq-check').length === 8);
  assert.equal(await p0.locator('#mqView .mq-labnote').count(), 0);
  assert.equal(await p0.locator('.mq-summary').textContent(), 'Se generarán 80 preguntas en 8 categorías.');
  // El grupo mq ya trae lo que necesitan las etapas nuevas (H1): aoacheck, roycheck, detective y net-svg.
  assert.equal(await p0.evaluate((src) => performance.getEntriesByType('resource').filter((e) => new RegExp(src).test(e.name)).length, mqFiles.source), 4);
  await close(p0);
  for (const [lang, sum] of [['es', 'Se generarán 120 preguntas en 12 categorías.'], ['en', '120 questions will be generated in 12 categories.']]) {
    const p = await mqLab(lang);
    const tr = IM0.tr(lang);
    const st = await mq(p);
    assert.deepEqual(st.sel.stages, ['stmt', ...MQ0.STAGES, ...LAB]);
    assert.equal(await p.locator('.mq-summary').textContent(), sum);
    // Las cuatro, aparte de las de la F3b y la F3c (tablero 90), cada una con su descripción.
    const lab = p.locator('#mqView .mq-lab .mq-check');
    assert.equal(await lab.count(), 4);
    for (let i = 0; i < 4; i++) {
      assert.equal(await lab.nth(i).locator('input').isChecked(), true);
      assert.equal(await lab.nth(i).textContent(), tr(`stage.${LAB[i]}`) + I0.t(lang, `mq.page.stageHint.${LAB[i]}`));
      assert.equal(await lab.nth(i).locator('.mq-hint').textContent(), I0.t(lang, `mq.page.stageHint.${LAB[i]}`));
    }
    assert.equal(await p.locator('#mqView .mq-labnote').textContent(), I0.t(lang, 'mq.page.labNote'));
    await close(p);
  }
});

check('F3d T013 AC14 y AC16 · la vista previa de cada etapa nueva es la pregunta del núcleo (ES y EN, las dos notaciones)', async () => {
  for (const [lang, nota, level, lvName] of [['es', 'es', 'medium', 'Media'], ['en', 'en', 'easy', 'Easy']]) {
    const p = await mqLab(lang);
    await setCtl(p, '#selNota', nota);
    const tr = IM0.tr(lang);
    for (let i = 0; i < 4; i++) {
      const stage = LAB[i];
      await mqSelect(p, [tr(`stage.${stage}`).split(' ')[0] + ' ·'], [lvName]);
      await p.waitForFunction((s) => PNL.moodlePage.state().preview.stage === s, stage);
      const q = (await mq(p)).preview;
      assert.deepEqual(q, mqPreview0(stage, level, lang, nota), `${stage} ${lang}: el modelo del núcleo`);
      assert.equal(await p.locator('.mq-qname').textContent(), q.name);
      if (stage === 'minDummy') {
        assert.equal(await p.locator('.mq-preview input.mq-hole').count(), 1);
        const link = q.text.find((b) => b.link).link;
        assert.deepEqual(await p.$$eval('.mq-preview > p > a', (as) => as.map((a) => [a.getAttribute('href'), a.textContent])), [[link.href, tr(link.key)]]);
      }
      if (stage === 'succ' || stage === 'immPred') {
        // En immPred, solo las filas que listan dos o más predecesoras llevan casillas (importación en UBUVirtual).
        const rows = q.text.filter((b) => b.table).pop().table.rows.filter((r) => typeof r[r.length - 1] === 'object');
        assert.ok(rows.length >= 1);
        assert.equal(await p.locator('.mq-preview .mq-mr').count(), rows.length);
        assert.ok(await p.$$eval('.mq-preview .mq-mr', (ms) => ms.every((m) => m.querySelectorAll('input').length >= 2)), 'dos casillas o más por fila');
        assert.equal(await p.locator('.mq-preview .mq-mr input:not([disabled])').count(), 0);
      }
      if (stage === 'detective') {
        // La imagen es el archivo SVG de la pregunta (el mismo que va en el XML), con su texto alternativo (AC21).
        const img = q.text.find((b) => b.img).img;
        const file = q.files.find((f) => f.name === img.src);
        assert.equal(await p.locator('.mq-preview img').count(), 1);
        assert.equal(await p.locator('.mq-preview img').getAttribute('alt'), img.alt);
        assert.equal(await p.locator('.mq-preview img').getAttribute('src'), `data:image/svg+xml;base64,${MQ0.base64(file.svg)}`);
        assert.ok(await p.locator('.mq-preview img').evaluate((el) => el.complete && el.naturalWidth > 0), 'la imagen se dibuja');
        // Cuatro opciones de una sola respuesta: botones de radio desactivados con el texto de cada una.
        assert.equal(await p.locator('.mq-preview .mq-options input[type="radio"][disabled]').count(), 4);
        assert.deepEqual(await p.$$eval('.mq-preview .mq-options li', (ls) => ls.map((l) => l.textContent.trim())), q.options.map((o) => o.text));
      }
      await p.locator('.mq-feedback summary').click();
      assert.ok(await p.locator('.mq-feedback a').count() >= 1, 'enlaces de la retroalimentación');
    }
    await close(p);
  }
});

check('F3d T013 AC14, AC16 y AC21 · el banco descargado con las etapas 7 a 10 es el de Node con la misma semilla, bien formado y con la imagen (ES y EN)', async () => {
  for (const [lang, nota, levels, lvNames] of [['es', 'en', ['easy'], ['Fácil']], ['en', 'es', ['hard'], ['Hard']]]) {
    const p = await mqLab(lang);
    await setCtl(p, '#selNota', nota);
    const tr = IM0.tr(lang);
    await mqSelect(p, LAB.map((s) => tr(`stage.${s}`).split(' ')[0] + ' ·'), lvNames, 2);
    const { name, xml } = await mqDownload(p);
    const seed = Number(/-s(\d+)\.xml$/.exec(name)[1]);
    const bank = MQ0.generate({ lang, nota, sf: false, labels: IM0.labels(nota), stages: LAB, levels, count: 2, seed, svg: NS0.render }, tr);
    assert.equal(xml, MQ0.toXml(bank, tr), 'el XML del navegador es el de Node');
    assert.deepEqual(require('../xml-check.js').check(xml), { ok: true });
    for (const s of LAB) assert.ok(xml.includes(`$course$/top/${tr('root')}/${tr(`stage.${s}`)}/${tr(`level.${levels[0]}`)}`), s);
    const det = bank.questions.filter((q) => q.stage === 'detective');
    assert.equal(det.length, 2);
    assert.equal((xml.match(/<file name="pnl-detective-s\d+\.svg" path="\/" encoding="base64">/g) || []).length, 2);
    assert.equal((xml.match(/<img src="@@PLUGINFILE@@\/pnl-detective-s\d+\.svg" alt="[^"]+">/g) || []).length, 2);
    assert.equal((xml.match(/<single>true<\/single>/g) || []).length, 2);
    await close(p);
  }
});

check('F3d T013 AC16 · el exportador con las etapas nuevas: axe en claro y oscuro, ES y EN, con la vista previa de «Detective»; a 360 px sin desplazamiento horizontal', async () => {
  for (const [lang, scheme, width] of [['es', 'light', 1280], ['en', 'dark', 1280], ['es', 'dark', 360], ['en', 'light', 360]]) {
    const p = await mqLab(lang, { scheme, width, height: width === 360 ? 800 : 720 });
    await mqSelect(p, ['10 ·'], [lang === 'es' ? 'Difícil' : 'Hard']);
    await p.waitForFunction(() => PNL.moodlePage.state().preview.stage === 'detective');
    await p.locator('.mq-feedback summary').click();
    await axe(p, `F3d · exportador con «Detective» (${lang}, ${scheme}, ${width} px)`);
    assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `${lang} ${width}`);
    const box = await p.locator('.mq-preview img').boundingBox();
    const pv = await p.locator('.mq-preview').boundingBox();
    assert.ok(box.width <= pv.width, 'la imagen cabe en la vista previa');
    await close(p);
  }
});

// ---------- F3d, T014: publicación (P7; tableros 89, 90 y 92) ----------
// Sin claves ocultas en la URL: se entra por la pestaña, por la barra o por la vista del taller, como un visitante.

check('F3d T014 AC13 y AC19 · «Ejercicios» desde la pestaña: el tipo en la barra (Cálculo pulsado) y cada tipo se abre con un clic, con su grupo solo entonces (ES y EN)', async () => {
  for (const lang of ['es', 'en']) {
    const page = await lab(`v=route&ex=ej6&step=0&lang=${lang}`);
    await page.locator('#navEx').click();
    await page.waitForFunction(() => PNL.ex && PNL.ex.state && PNL.ex.state() && PNL.ex.state().seed);
    assert.equal((await state(page)).xk, 'calc');
    assert.deepEqual(await page.locator('.ex-kind-seg button').allInnerTexts(), ['calc', 'roy', 'pert', 'det'].map((k) => I0.t(lang, `ex.kind.${k}`)));
    assert.equal(await page.locator('#exKind-calc').getAttribute('aria-pressed'), 'true');
    assert.ok(await visible(page, 'table.ex-ans'), 'el cálculo de siempre');
    assert.equal(await xbGroups(page), 0, 'sin xb hasta elegir otro tipo');
    assert.equal(await dtGroups(page), 0, 'sin dt');
    await page.locator('#exKind-roy').click();
    await page.waitForFunction(() => PNL.app.state().xk === 'roy' && PNL.exBuild && document.querySelector('#xbCheck'));
    assert.equal(await page.locator('#exKind-roy').getAttribute('aria-pressed'), 'true');
    assert.equal(await xbGroups(page), 6);
    await page.locator('#exKind-pert').click();
    await page.waitForFunction(() => PNL.app.state().xk === 'pert' && document.querySelector('#exView .reto-table, #exView table'));
    assert.equal(await page.locator('#exKind-pert').getAttribute('aria-pressed'), 'true');
    await page.locator('#exKind-det').click();
    await page.waitForFunction(() => PNL.app.state().xk === 'det' && PNL.exDet && PNL.exDet.state && PNL.exDet.state() && PNL.exDet.state().seeded);
    assert.ok(await visible(page, '#dtNet-aon') && await visible(page, '#dtKind-all'), 'Red y Errores en la segunda fila');
    await page.locator('#exKind-calc').click();
    await page.waitForFunction(() => PNL.app.state().xk === 'calc');
    assert.ok(await visible(page, 'table.ex-ans'));
    await close(page);
  }
});

check('F3d T014 · a 360 px, el tipo en un desplegable que abre el detective', async () => {
  const page = await lab('v=route&ex=ej6&step=0&lang=es', { width: 360, height: 800 });
  await page.locator('#navEx').click();
  await page.waitForFunction(() => PNL.ex && PNL.ex.state && PNL.ex.state() && PNL.ex.state().seed);
  assert.ok(await visible(page, '#exKindSel'));
  assert.ok(!(await visible(page, '.ex-kind-seg')));
  await page.locator('#exKindSel').selectOption('det');
  await page.waitForFunction(() => PNL.app.state().xk === 'det' && PNL.exDet && PNL.exDet.state && PNL.exDet.state() && PNL.exDet.state().seeded);
  assert.equal(await page.locator('#exKindSel').inputValue(), 'det');
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  await close(page);
});

check('F3d T014 AC12 · taller con la red ROY: «Reto ROY» junto a Red y Matriz, sin pulsar; un clic abre el reto; con la PERT no está (ES y EN)', async () => {
  for (const lang of ['es', 'en']) {
    const page = await lab(`v=route&ex=ej6&step=0&lang=${lang}`);
    await page.locator('#navWork').click();
    await page.waitForFunction(() => PNL.app.state().v === 'work');
    assert.ok(await visible(page, '#btnRetoRoy'));
    assert.equal(await page.locator('#btnRetoRoy').innerText(), I0.t(lang, 'view.retoRoy'));
    assert.equal(await page.locator('#btnRetoRoy').getAttribute('aria-pressed'), 'false');
    assert.equal(await xbGroups(page), 0);
    await page.locator('#btnRetoRoy').click();
    await page.waitForFunction(() => PNL.app.state().view === 'reto' && PNL.app.royReto && PNL.app.royReto());
    assert.ok(await visible(page, '#royRetoView'));
    assert.equal(await page.locator('#btnRetoRoy').getAttribute('aria-pressed'), 'true');
    await page.locator('#btnAoa').click();
    await page.waitForFunction(() => PNL.app.state().graph === 'aoa');
    assert.ok(!(await visible(page, '#btnRetoRoy')));
    await close(page);
  }
});

check('F3d T014 AC14 · el exportador ofrece las etapas 7 a 10 al abrirlo, marcadas, con el aviso del laboratorio', async () => {
  const page = await mqOpen('es');
  assert.equal(await page.evaluate(() => PNL.moodlePage.f3dPublic), true);
  assert.equal(await page.locator('#mqView .mq-stages .mq-check').count(), 12);
  assert.equal(await page.locator('#mqView .mq-lab .mq-check input:checked').count(), 4);
  assert.equal(await page.locator('.mq-summary').textContent(), 'Se generarán 120 preguntas en 12 categorías.');
  assert.ok(await visible(page, '#mqView .mq-labnote'));
  await close(page);
});

// ---------- Principio 27: presupuesto de 1 MB ----------

check('Principio 27 · cada vista carga menos de 1 MB', async () => {
  for (const url of ['index.html', 'cpm.html#v=route&ex=ej6&step=0&lang=es', 'cpm.html#v=work&lang=es', 'cpm.html#v=route&ex=ej6&step=27&graph=aoa&view=side&lang=es', 'cpm.html#graph=aoa&ex=ej6&step=5&lang=es',
    `cpm.html#graph=aoa&view=cmp&ex=ej6&ms=${ALL_MS}&lang=es`, 'cpm.html#graph=aoa&m=prog&ex=ej6&step=13&lang=es',
    `cpm.html#graph=aoa&view=reto&ex=ej6&lang=es&sn=${retoSn()}`, 'cpm.html#v=m0&st=ej5&lang=es', 'cpm.html#v=m0&st=ej5&mm=route&step=23&lang=es', 'cpm.html#v=m0&st=gen&sd=22&lv=hard&cx=lab&sv=2&lang=es',
    exUrl({ sd: 92846, lv: 'hard', ask: ALL_ASK }), exUrl({ sd: 92846, lv: 'hard', ask: ALL_ASK, xt: 1 }), exUrl({ sd: 92846, lv: 'hard', xk: 'roy' }), exUrl({ sd: 92846, lv: 'hard', xk: 'pert' }), exUrl({ sd: 92846, lv: 'hard', xk: 'det', dg: 'aoa', dk: 'all' }), exUrl({ sd: 92846, lv: 'hard', xk: 'det', dg: 'aon', dk: 'all' }), rrUrl({ ex: 'ej6', rn: XB0.placeLevels(RC0.fromTable(ej6())) }), 'cpm.html#v=moodle&lang=es', 'cpm.html#v=unc&ue=hl&uc=1&lang=es', 'cpm.html#v=unc&um=m7&ue=hl&uy=idx&lang=es', 'cpm.html#v=unc&um=m7&ue=hl&uy=conv&lang=es']) {
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
    // F3b (plan P5 y P7): solo la vista del exportador carga el banco de Moodle y sus textos.
    if (!url.includes('v=moodle')) assert.equal(await page.evaluate(() => performance.getEntriesByType('resource').some((e) => /moodle/.test(e.name))), false, `${url} carga Moodle`);
    // F3c (P5): el generador de enunciados, solo con un enunciado al azar, con el enunciado en «Ejercicios» y en el exportador.
    const gen = /st=gen|xt=1|v=moodle/.test(url);
    assert.equal(await page.evaluate(() => performance.getEntriesByType('resource').some((e) => /stmtgen\.js|contexts\.js/.test(e.name))), gen, `${url}: generador de enunciados`);
    // F4a (decisión del autor): «Aprende más» (learn.js) no se carga al abrir ninguna vista, solo al abrir su diálogo.
    assert.equal(await page.evaluate(() => performance.getEntriesByType('resource').some((e) => /\/js\/learn(-unc|-m7)?\.js/.test(e.name))), false, `${url}: learn.js`);
    // F4a (plan P3): los tres tiempos, la simulación y el TCL, solo en «Duraciones inciertas».
    assert.equal(await page.evaluate(() => performance.getEntriesByType('resource').some((e) => /threept\.js|core\/sim\.js|tcl\.js|unc\.js/.test(e.name))), url.includes('v=unc'), `${url}: grupo de la F4a`);
    // F4b (plan P4, T002): el comparador, el reto y el dibujo progresivo (grupo cr), solo con view=cmp, view=reto o m=prog.
    // F3d (T009 y T010): el reto ROY (view=reto sin graph=aoa) no carga el grupo cr; construir la PERT, sí.
    const cr = (/graph=aoa/.test(url) && /view=(cmp|reto)|m=prog/.test(url)) || url.includes('xk=pert');
    // F3d (T011, H1): el detective usa aoacheck (y roycheck) sin el resto de cr ni de xb.
    for (const re of [/core\/aoacheck\.js/, /core\/aoamethods\.js/, /core\/compare\.js/, /compare-view\.js/, /\/reto\.js/, /reto-canvas\.js/, /reto-table\.js/]) {
      // F3d (T013, H1): el exportador también, para las etapas 7 a 10.
      const want = cr || (re.source.includes('aoacheck') && (url.includes('xk=det') || url.includes('v=moodle')));
      assert.equal(await page.evaluate((src) => performance.getEntriesByType('resource').some((e) => new RegExp(src).test(e.name)), re.source), want, `${url}: ${re.source}`);
    }
    // F3d (plan P1, T011): el detective (grupo dt), solo con xk=det; su núcleo, también en el exportador (T013, H1), con net-svg.
    assert.equal(await page.evaluate(() => performance.getEntriesByType('resource').some((e) => /ex-det\.js|det-view\.js|i18n-det\.js|det\.css/.test(e.name))), url.includes('xk=det'), `${url}: grupo dt`);
    assert.equal(await page.evaluate(() => performance.getEntriesByType('resource').some((e) => /core\/detective\.js/.test(e.name))), url.includes('xk=det') || url.includes('v=moodle'), `${url}: core/detective`);
    assert.equal(await page.evaluate(() => performance.getEntriesByType('resource').some((e) => /views\/net-svg\.js/.test(e.name))), url.includes('v=moodle'), `${url}: net-svg`);
    // F3d (plan P1, T008 y T009): construir la ROY (grupo xb), solo con xk=roy o con el reto ROY del taller.
    assert.equal(await page.evaluate((src) => performance.getEntriesByType('resource').filter((e) => new RegExp(src).test(e.name)).length, xbFiles.source), url.includes('xk=roy') || url.includes('xk=pert') || (/view=reto/.test(url) && !/graph=aoa/.test(url)) ? 6 : url.includes('xk=det') || url.includes('v=moodle') ? 1 : 0, `${url}: grupo xb (con el detective y el exportador, solo roycheck)`);
    // F4b (plan P4, T010): M7 (grupo u7), solo con um=m7.
    assert.equal(await page.evaluate(() => performance.getEntriesByType('resource').some((e) => /m7-rep\.js/.test(e.name))), url.includes('uy=conv'), `${url}: grupo u7r`);
    assert.equal(await page.evaluate(() => performance.getEntriesByType('resource').some((e) => /\/m7\.js|core\/mc\.js|mc-charts\.js/.test(e.name))), url.includes('um=m7'), `${url}: grupo u7`);
    // F4b (T012, reserva 2 de T001): la vista de M5 y M6 (grupo u56), en la pestaña salvo con um=m7.
    assert.equal(await page.evaluate(() => performance.getEntriesByType('resource').some((e) => /unc-m56\.js/.test(e.name))), url.includes('v=unc') && !url.includes('um=m7'), `${url}: grupo u56`);
    assert.ok(bytes > 0 && bytes <= BUDGET, `${url}: ${bytes} bytes`);
    await ctx.close();
  }
});

// ---------- Ejecución ----------

(async () => {
  const { child, base } = await serve();
  BASE = base;
  browser = await chromium.launch();
  // Contador de la portada (constitución v2.1.0): ninguna prueba sale a GoatCounter. count.js se sustituye por un guion
  // vacío y el total, por COUNT_FAKE; cada contexto anota las peticiones para comprobar que el laboratorio no las hace.
  const newContext = browser.newContext.bind(browser);
  browser.newContext = async (opts) => {
    const ctx = await newContext(opts);
    ctx.counterHits = [];
    await ctx.route(/goatcounter\.com|gc\.zgo\.at/, (route) => {
      const url = route.request().url();
      ctx.counterHits.push(url);
      if (url.includes('/counter/')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ count: COUNT_FAKE }) });
      return route.fulfill({ status: 200, contentType: 'application/javascript', body: '' });
    });
    return ctx;
  };
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
      if (process.env.STACK) console.log(err.stack);
      console.log(`✗ ${c.name}\n    ${String(err.message).split('\n').join('\n    ')}`);
      // En GitHub Actions, cada fallo sale también como anotación: se lee en el resumen de la ejecución sin abrir el registro.
      if (process.env.GITHUB_ACTIONS) console.log(`::error title=${ghEscape(c.name, true)}::${ghEscape(String(err.message).split('\n').slice(0, 6).join('\n'))}`);
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
