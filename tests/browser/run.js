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
  for (const id of ['brandLink', 'navM0', 'navRoute', 'navWork', 'selLang', 'selNota', 'selBox', 'btnNet', 'btnMatrix', 'btnTable', 'chkPredict', 'btnWhatIf', 'btnLearn', 'btnNext', 'btnPlay']) {
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
  await page.selectOption('#selLang', 'en');
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
    await page.selectOption('#selLang', lang);
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
    const tabs = await page.locator('header nav a').allInnerTexts();
    assert.deepEqual(tabs.map((x) => x.trim())[0], label);
    assert.equal(tabs.length, 4, 'con «Ejercicios» (F3a, T017)');
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
    assert.equal(opts.length, 11);
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
      await page.selectOption('#selLang', 'en');
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
    assert.deepEqual(ps, LR0.topics.ex[lang]);
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
  for (const [lang, labels] of [['es', ['Del enunciado a la tabla', 'Ruta guiada', 'Taller', 'Ejercicios']], ['en', ['From statement to table', 'Guided tour', 'Workshop', 'Exercises']]]) {
    const page = await lab(`v=route&ex=ej6&step=3&lang=${lang}`);
    assert.deepEqual((await page.locator('header nav a').allInnerTexts()).map((x) => x.trim()), labels);
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

check('F3a T017 · la barra con cuatro pestañas: a 1280 px la cabecera cabe en una fila; a 360 px las pestañas pasan a dos filas sin desbordar', async () => {
  for (const lang of ['es', 'en']) {
    for (const hash of ['v=route&ex=ej6&step=0', 'v=work', 'v=m0&st=ej5', 'v=ex&sd=14844']) {
      const page = await lab(`${hash}&lang=${lang}`);
      const head = await page.evaluate(() => {
        const r = (el) => el.getBoundingClientRect();
        const tops = [document.querySelector('.brand'), document.querySelector('.tabs'), document.querySelector('.controls')].map((el) => Math.round(r(el).top + r(el).height / 2));
        return { h: r(document.querySelector('.site-head')).height, tops };
      });
      assert.ok(head.h <= 70, `${lang} ${hash}: la cabecera ocupa ${head.h} px`);
      assert.ok(Math.max(...head.tops) - Math.min(...head.tops) <= 12, `${lang} ${hash}: marca, pestañas y controles en una fila (${head.tops})`);
      await close(page);
    }
    const page = await lab(`v=ex&sd=14844&lang=${lang}`, { width: 360, height: 740 });
    const bar = await page.evaluate(() => {
      const links = [...document.querySelectorAll('.tabs a')].map((a) => a.getBoundingClientRect());
      const lh = parseFloat(getComputedStyle(document.querySelector('.tabs a')).lineHeight) || 20;
      return { w: document.documentElement.scrollWidth, right: Math.max(...links.map((x) => x.right)), rows: new Set(links.map((x) => Math.round(x.top))).size,
        lines: links.map((x) => Math.round((x.height - 16) / lh)) };
    });
    assert.ok(bar.w <= 360 && bar.right <= 360, `${lang} 360 px: ${JSON.stringify(bar)}`);
    assert.ok(bar.rows <= 2, `${lang} 360 px: ${bar.rows} filas de pestañas`);
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
  for (const [lang, sum, h1] of [['es', 'Se generarán 70 preguntas en 7 categorías.', 'Bancos de preguntas para Moodle'], ['en', '70 questions will be generated in 7 categories.', 'Question banks for Moodle']]) {
    const page = await mqOpen(lang);
    assert.equal(await page.locator('#mqView h1').textContent(), h1);
    assert.equal(await page.locator('.mq-summary').textContent(), sum);
    const st = await mq(page);
    assert.equal(st.preview.stage, 'early'); assert.equal(st.preview.level, 'medium'); assert.equal(st.preview.seed, 1);
    assert.equal(await page.locator('.mq-qname').textContent(), st.preview.name);
    assert.equal(await page.locator('.mq-preview input.mq-hole').count(), Object.keys(st.preview.answers).length);
    assert.equal(await page.locator('#stage').isVisible(), false);
    assert.equal(await page.locator('#selBox').isVisible(), false);
    await close(page);
  }
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

check('F3b AC8 · cambiar la notación rehace la vista previa y conserva la selección', async () => {
  const page = await mqOpen('es');
  await mqSelect(page, ['3 ·'], ['Difícil'], 7);
  await page.locator('#selNota').selectOption('es');
  await page.waitForFunction(() => [...document.querySelectorAll('.mq-preview th')].some((th) => th.textContent === 'HT'));
  const st = await mq(page);
  assert.deepEqual(st.sel.stages, ['floats']); assert.deepEqual(st.sel.levels, ['hard']); assert.equal(st.sel.count, 7);
  assert.equal(await page.locator('.mq-summary').textContent(), 'Se generarán 7 preguntas en una categoría.');
  await close(page);
});

// ---------- Principio 27: presupuesto de 1 MB ----------

check('Principio 27 · cada vista carga menos de 1 MB', async () => {
  for (const url of ['index.html', 'cpm.html#v=route&ex=ej6&step=0&lang=es', 'cpm.html#v=work&lang=es', 'cpm.html#v=route&ex=ej6&step=27&graph=aoa&view=side&lang=es',
    `cpm.html#graph=aoa&view=cmp&ex=ej6&ms=${ALL_MS}&lang=es`, 'cpm.html#graph=aoa&m=prog&ex=ej6&step=13&lang=es',
    `cpm.html#graph=aoa&view=reto&ex=ej6&lang=es&sn=${retoSn()}`, 'cpm.html#v=m0&st=ej5&lang=es', 'cpm.html#v=m0&st=ej5&mm=route&step=23&lang=es',
    exUrl({ sd: 92846, lv: 'hard', ask: ALL_ASK }), 'cpm.html#v=moodle&lang=es']) {
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
