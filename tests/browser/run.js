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
 *   node tests/browser/run.js --shots <dir>    → además, capturas de cada paso (evidencia T025)
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
const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

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

async function axe(page, label) {
  if (!(await page.evaluate(() => !!window.axe))) await page.addScriptTag({ content: axeSource });
  const violations = await page.evaluate(async (tags) => {
    const r = await window.axe.run(document, { runOnly: { type: 'tag', values: tags }, resultTypes: ['violations'] });
    return r.violations.map((v) => `${v.id} (${v.impact}): ${v.nodes.slice(0, 4).map((n) => n.target.join(' ')).join(' | ')}`);
  }, AXE_TAGS);
  assert.deepEqual(violations, [], `axe en «${label}»`);
}

async function shot(page, name) {
  if (!SHOTS) return;
  fs.mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: path.join(SHOTS, `${name}.png`) });
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
  const ids = await probe.evaluate(() => PNL.examples.list().map((e) => e.id));
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

check('AC15 · a 360 px no hay desplazamiento horizontal de página (portada, ruta, matriz y taller)', async () => {
  const views = [['index.html', 'index'], ['cpm.html#v=route&ex=ej6&step=0&lang=es', 'route-0'], ['cpm.html#v=route&ex=ej6&step=6&lang=es', 'route-6'],
    ['cpm.html#v=route&ex=ej6&step=6&view=matrix&lang=es', 'matrix-6'], ['cpm.html#v=route&ex=ej6&step=31&lang=en', 'route-31'], ['cpm.html#v=work&lang=es', 'work']];
  for (const [url, name] of views) {
    const page = await open(url, { width: 360, height: 740 });
    const w = await page.evaluate(() => document.documentElement.scrollWidth);
    assert.ok(w <= 360, `${url}: ${w} px`);
    await shot(page, `w360-${name}`);
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

// ---------- AC9: idioma ----------

check('AC9 · al cambiar de idioma no queda ninguna cadena del otro', async () => {
  const page = await lab('v=route&ex=ej6&step=0&lang=es');
  const foreign = await page.evaluate(() => {
    const flat = (o, out = {}, pre = '') => { for (const [k, v] of Object.entries(o)) { if (v && typeof v === 'object') flat(v, out, `${pre}${k}.`); else out[pre + k] = String(v); } return out; };
    const es = flat(PNL.i18n.dict.es); const en = flat(PNL.i18n.dict.en);
    const pieces = (a, b) => Object.keys(a).filter((k) => a[k] !== b[k]).flatMap((k) => a[k].split(/\{[^}]*\}/)).map((s) => s.trim()).filter((s) => s.length >= 10);
    return { es: [...new Set(pieces(es, en))], en: [...new Set(pieces(en, es))] };
  });
  const corpus = (p) => p.evaluate(() => [document.body.innerText, document.title,
    ...[...document.querySelectorAll('[aria-label]')].filter((e) => e.checkVisibility()).map((e) => e.getAttribute('aria-label'))].join('\n'));
  for (const [lang, other] of [['en', 'es'], ['es', 'en']]) {
    await page.selectOption('#selLang', lang);
    for (const n of [0, 2, 14, 26, 29, 31]) {
      await go(page, n);
      for (const view of ['#btnNet', '#btnMatrix']) {
        await page.locator(view).click();
        const text = await corpus(page);
        const left = foreign[other].filter((s) => text.includes(s));
        assert.deepEqual(left, [], `${lang}, paso ${n}, ${view}`);
      }
    }
    await page.locator('#btnNet').click();
  }
  await page.locator('#navWork').click();
  for (const [lang, other] of [['en', 'es'], ['es', 'en']]) {
    await page.selectOption('#selLang', lang);
    const text = await corpus(page);
    assert.deepEqual(foreign[other].filter((s) => text.includes(s)), [], `taller en ${lang}`);
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
  for (const lab of ['m1', 'm3', 'm4']) assert.match(await noJs.locator(`a[data-lab="${lab}"]`).getAttribute('href'), /^cpm\.html#v=route/);
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

// ---------- Principio 27: presupuesto de 1 MB ----------

check('Principio 27 · cada vista carga menos de 1 MB', async () => {
  for (const url of ['index.html', 'cpm.html#v=route&ex=ej6&step=0&lang=es', 'cpm.html#v=work&lang=es']) {
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
  console.log(`\n${run.length - failed} de ${run.length} comprobaciones de navegador en verde (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
  process.exitCode = failed ? 1 : 0;
})().catch((err) => { console.error(err); process.exit(1); });
