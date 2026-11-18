'use strict';
// moodle-app: la página propia del exportador, moodle.html (spec f3e-probabilidad-montecarlo, AC13, AC21 y AC23;
// plan P2; T013). La parte sin DOM: las familias de etapas que se cargan al marcarlas, el estado del enlace (el mismo
// que cpm.html#v=moodle), el enlace «Volver al laboratorio» y que la página cargue lo que necesita, sin el laboratorio.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const MA = require('../js/moodle-app.js');
const M = require('../js/core/moodle.js');
const U = require('../js/core/urlstate.js');
const I = require('../js/i18n.js');
require('../js/i18n-moodle.js');

const html = fs.readFileSync(path.join(ROOT, 'moodle.html'), 'utf8');
const scriptsOf = (page) => [...page.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/g)].map((m) => m[1]);

test('moodle.html solo carga scripts locales que existen, sin módulos ES, sin CDN y sin scripts en línea (principios 2 y 29)', () => {
  const tags = [...html.matchAll(/<script\b([^>]*)>/g)].map((m) => m[1]);
  assert.ok(tags.length > 0);
  for (const attrs of tags) {
    assert.doesNotMatch(attrs, /type=["']module["']/, 'sin módulos ES');
    const src = (attrs.match(/src=["']([^"']+)["']/) || [])[1];
    assert.ok(src, 'sin scripts en línea');
    assert.doesNotMatch(src, /^(https?:)?\/\//, `sin CDN: ${src}`);
    assert.ok(fs.existsSync(path.join(ROOT, src)), `existe ${src}`);
  }
  for (const href of [...html.matchAll(/<link\b[^>]*href=["']([^"']+)["']/g)].map((m) => m[1])) assert.ok(fs.existsSync(path.join(ROOT, href)), `existe ${href}`);
});

test('moodle.html no carga el laboratorio: ni D3, ni app.js, ni sus vistas; moodle-app.js, el último', () => {
  const src = scriptsOf(html);
  for (const re of [/d3/, /\/app\.js$/, /narrate|predict|editor|roy-view|pert-view|matrix-view|results|gantt|learn/]) {
    assert.equal(src.some((s) => re.test(s)), false, `${re}`);
  }
  assert.equal(src[src.length - 1], 'js/moodle-app.js');
  assert.ok(src.includes('js/moodle-page.js') && src.includes('js/core/moodle.js') && src.includes('js/i18n-moodle.js'));
  // Las familias van aparte: ni el generador de enunciados ni el detective ni la imagen de la red en la base.
  for (const f of Object.values(MA.FAMILIES).flat()) assert.equal(src.includes(f), false, `${f} en la base`);
});

test('cada etapa de core/moodle tiene su familia: la base (F3b), el enunciado (sg) o la construcción (lab)', () => {
  for (const s of M.STAGES) assert.deepEqual(MA.familiesOf([s]), [], s);
  assert.deepEqual(MA.familiesOf(['stmt']), ['sg']);
  for (const s of ['minDummy', 'succ', 'immPred', 'detective']) assert.deepEqual(MA.familiesOf([s]), ['lab'], s);
  assert.deepEqual(MA.familiesOf(['detective', 'early', 'stmt', 'succ']), ['sg', 'lab']);
  assert.deepEqual(MA.familiesOf([]), []);
  assert.deepEqual(MA.familiesOf(['otra']), []);
  // Las etapas 11 a 17 de la F3e (al final de STAGES_ALL) tendrán su familia en T016.
  const upToF3d = M.STAGES_ALL.slice(0, M.STAGES_ALL.indexOf('detective') + 1);
  assert.deepEqual(Object.keys(MA.FAMILY_OF).sort(), upToF3d.filter((s) => !M.STAGES.includes(s)).sort());
  for (const f of Object.values(MA.FAMILIES).flat()) assert.ok(fs.existsSync(path.join(ROOT, f)), `existe ${f}`);
});

test('la base y las familias se cargan en el orden de la página sin errores y dejan lo que piden las etapas', () => {
  const ctx = vm.createContext({ console, URLSearchParams });
  ctx.globalThis = ctx;
  const run = (f) => vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
  scriptsOf(html).forEach(run);
  for (const k of ['i18n', 'urlstate', 'moodle', 'i18nMoodle', 'dom', 'questionView', 'moodlePage', 'moodleApp']) assert.ok(ctx.PNL[k], k);
  assert.equal(ctx.PNL.stmtgen, undefined);
  assert.equal(ctx.PNL.detective, undefined);
  for (const fam of ['sg', 'lab']) MA.FAMILIES[fam].forEach(run);
  for (const k of ['stmtgen', 'contexts', 'detective', 'aoacheck', 'roycheck', 'netSvg']) assert.ok(ctx.PNL[k], k);
  // Con la base y las familias, el núcleo da una pregunta de cada etapa (la misma que en Node).
  const IM = ctx.PNL.i18nMoodle;
  const qctx = { lang: 'es', nota: 'en', sf: false, labels: IM.labels('en'), svg: ctx.PNL.netSvg.render };
  for (const st of ['early', 'stmt', 'detective']) {
    let q = null;
    for (let sd = 1; sd < 50 && !q; sd++) q = ctx.PNL.moodle.question(st, ctx.PNL.moodle.exercise('medium', sd), qctx, IM.tr('es'));
    assert.ok(q && q.stage === st, st);
  }
  // «Detective» con las dos redes: la ROY (views/layout) y la PERT de las reglas (views/aoa-layout), con su imagen.
  const graphs = new Set();
  for (let sd = 1; sd < 60 && graphs.size < 2; sd++) {
    const q = ctx.PNL.moodle.question('detective', ctx.PNL.moodle.exercise('medium', sd), qctx, IM.tr('es'));
    const text = q ? JSON.stringify(q) : '';
    if (text.includes('La red ROY que sigue') && text.includes('<svg')) graphs.add('aon');
    if (text.includes('La red PERT de las reglas que sigue') && text.includes('<svg')) graphs.add('aoa');
  }
  assert.deepEqual([...graphs].sort(), ['aoa', 'aon']);
});

test('el estado del enlace es el de cpm.html#v=moodle: idioma del enlace, de ?lang= o del navegador, y la notación', () => {
  const cpm = (hash) => U.encode(U.decode(hash).state);
  for (const hash of ['#v=moodle&lang=en', '#v=moodle&lang=es&nota=es', '#v=moodle&lang=en&nota=es&box=4&sd=5']) {
    const s = MA.stateFrom(hash, '', 'es-ES');
    assert.equal(MA.hashOf(s), cpm(hash), hash);
    assert.equal(s.v, 'moodle');
  }
  assert.equal(MA.stateFrom('#v=moodle', '?lang=en', 'es-ES').lang, 'en');
  assert.equal(MA.stateFrom('#v=moodle', '', 'en-GB').lang, 'en');
  assert.equal(MA.stateFrom('', '', 'es-ES').lang, 'es');
  assert.equal(MA.stateFrom('#v=moodle&lang=en', '?lang=es', 'es-ES').lang, 'en');
  // Otra vista en el enlace: la página solo tiene el exportador.
  assert.equal(MA.stateFrom('#v=route&ex=ej6&lang=en', '', 'es').v, 'moodle');
  assert.equal(MA.hashOf(MA.stateFrom('#v=route&ex=ej6&lang=en&nota=es', '', 'es')), '#v=moodle&lang=en&nota=es');
  // Un valor que no vale se descarta y se avisa, como en cpm.html.
  const bad = MA.load('#v=moodle&lang=xx&nota=zz', '', 'en');
  assert.equal(bad.state.lang, 'en'); assert.equal(bad.state.nota, 'en');
  assert.equal(bad.warning, U.decode('#v=moodle&lang=xx&nota=zz').warning);
  assert.ok(bad.warning);
  assert.equal(MA.load('#v=moodle&lang=en', '', 'es').warning, undefined);
});

test('«Volver al laboratorio» abre cpm.html con el mismo idioma y la misma notación', () => {
  assert.equal(MA.backHref({ lang: 'es', nota: 'en' }), 'cpm.html#lang=es&nota=en');
  assert.equal(MA.backHref({ lang: 'en', nota: 'es' }), 'cpm.html#lang=en&nota=es');
  const back = U.decode('#lang=en&nota=es').state;
  assert.equal(back.lang, 'en'); assert.equal(back.nota, 'es');
});

test('los textos de la cabecera de moodle.html están en los dos idiomas', () => {
  for (const lang of I.languages) {
    for (const k of ['docTitle', 'sub', 'back', 'backShort', 'langEs', 'langEn', 'notaEn', 'notaEs']) {
      const v = I.t(lang, `mq.app.${k}`);
      assert.ok(v && v !== `mq.app.${k}`, `${lang}.mq.app.${k}`);
    }
  }
  assert.equal(I.t('es', 'mq.page.title'), 'Bancos de preguntas para Moodle');
  assert.equal(I.t('en', 'mq.page.title'), 'Question banks for Moodle');
});

test('moodle.html: idioma, enlace para saltar, un solo <h1> y los controles de la cabecera con su etiqueta', () => {
  assert.match(html, /<html lang="es">/);
  assert.match(html, /<a class="skip" href="#main"/);
  assert.match(html, /<main id="main"/);
  assert.equal((html.match(/<h1[\s>]/g) || []).length, 1);
  for (const id of ['selLang', 'selNota', 'backLink', 'mqView', 'loadFailed', 'urlWarning', 'live']) assert.match(html, new RegExp(`id="${id}"`), id);
  assert.match(html, /<link rel="stylesheet" href="css\/styles\.css">/);
  assert.match(html, /<link rel="stylesheet" href="css\/moodle\.css">/);
});
