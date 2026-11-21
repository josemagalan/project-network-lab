'use strict';
// exam-app: la página del examen imprimible, examen.html (spec f3f-examen-imprimible, AC9 y AC15–AC17; plan P6 y P7,
// §3; T010; tableros 107–109). La parte sin DOM: el estado del «#» con las claves de §3 (lista blanca y valores por
// defecto; un valor que no vale vuelve al defecto y se avisa), las opciones que recibe core/exam, las familias que
// piden las partes, el enlace «Volver al laboratorio», y que la página cargue su base sin el laboratorio y siga oculta.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const EA = require('../js/exam-app.js');
const E = require('../js/core/exam.js');
const FL = require('../js/family-load.js');
const I = require('../js/i18n.js');
const IM = require('../js/i18n-moodle.js');
require('../js/i18n-exam.js');

const html = fs.readFileSync(path.join(ROOT, 'examen.html'), 'utf8');
const scriptsOf = (page) => [...page.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/g)].map((m) => m[1]);
const DEF = '#lang=es&nota=en';

test('F3f T010 · el estado por defecto: partes «Tiempos» y «Holguras», nivel medio, semilla 1, un modelo, extras ingq, A4, el enunciado del modelo A', () => {
  const { state, warning } = EA.load('', '', 'es-ES');
  assert.equal(warning, undefined);
  assert.deepEqual(state, {
    lang: 'es', nota: 'en', ep: ['times', 'floats'], lv: 'medium', sd: 1, em: 1, eq: [], pt: {}, ee: '', ed: 'aon', ea: 'ingq',
    eh: { subject: '', call: '', date: '', duration: '', instructions: '' }, pp: 'a4', dv: 's', mi: 0,
  });
  assert.equal(EA.encode(state), DEF);
  assert.deepEqual(EA.KEYS, ['lang', 'nota', 'ep', 'lv', 'sd', 'em', 'eq', 'pt', 'ee', 'ed', 'ea', 'eh', 'pp', 'dv', 'mi']);
});

test('F3f T010 · el idioma: el del «#», si no el de ?lang= y si no el del navegador (como moodle.html)', () => {
  assert.equal(EA.load('#lang=en', '', 'es-ES').state.lang, 'en');
  assert.equal(EA.load('', '?lang=en', 'es-ES').state.lang, 'en');
  assert.equal(EA.load('', '', 'en-GB').state.lang, 'en');
  assert.equal(EA.load('#lang=es', '?lang=en', 'en-GB').state.lang, 'es');
  assert.equal(EA.load('', '?lang=xx', 'fr').state.lang, 'es');
});

test('F3f T010 · cada clave de §3 va y vuelve por el «#» en su forma canónica (orden de las claves, de las partes y de los apartados)', () => {
  const full = '#lang=en&nota=es&ep=stmt-det-times-tcl&lv=hard&sd=2026&em=4&eq=times.events-tcl.route&pt=stmt:1-tcl:2.5&ed=aoa&ea=nq'
    + '&eh=OGP|Convocatoria%20ordinaria|19%2F01%2F2027|2%20h|Sin%20apuntes%20%26%20con%20calculadora&pp=letter&dv=r&mi=3';
  const { state, warning } = EA.load(full, '', 'es');
  assert.equal(warning, undefined);
  assert.deepEqual(state.ep, ['stmt', 'det', 'times', 'tcl']);
  assert.equal(state.lv, 'hard'); assert.equal(state.sd, 2026); assert.equal(state.em, 4);
  assert.deepEqual(state.eq, ['times.events', 'tcl.route']);
  assert.deepEqual(state.pt, { stmt: 1, tcl: 2.5 });
  assert.equal(state.ed, 'aoa'); assert.equal(state.ea, 'nq'); assert.equal(state.pp, 'letter');
  assert.deepEqual(state.eh, { subject: 'OGP', call: 'Convocatoria ordinaria', date: '19/01/2027', duration: '2 h', instructions: 'Sin apuntes & con calculadora' });
  assert.equal(state.dv, 'r'); assert.equal(state.mi, 3);
  assert.equal(EA.encode(state), full);
  // Desordenado y con repeticiones: la misma forma canónica.
  const messy = '#mi=3&dv=r&pp=letter&ea=qn&ed=aoa&pt=tcl:2.5-stmt:1&eq=tcl.route-times.events-times.events&em=4&sd=2026&lv=hard&ep=tcl-times-det-stmt-tcl&nota=es&lang=en'
    + '&eh=OGP|Convocatoria%20ordinaria|19%2F01%2F2027|2%20h|Sin%20apuntes%20%26%20con%20calculadora';
  assert.equal(EA.encode(EA.load(messy, '', 'es').state), full);
  // Sin partes marcadas, ep vacía (se puede escribir, y core/exam lo dice).
  const none = EA.load('#lang=es&ep=', '', 'es');
  assert.deepEqual(none.state.ep, []); assert.equal(none.warning, undefined);
  assert.equal(EA.encode(none.state), '#lang=es&nota=en&ep=');
  // Sin extras, ea vacía.
  assert.equal(EA.load('#ea=', '', 'es').state.ea, '');
  assert.equal(EA.encode(EA.load('#ea=', '', 'es').state), '#lang=es&nota=en&ea=');
  // Un ejemplo citado del modelo A.
  assert.equal(EA.load('#ee=kl', '', 'es').state.ee, 'kl');
});

test('F3f T010 · lista blanca: una clave desconocida o un valor fuera de rango vuelve al defecto y se avisa; lo demás se conserva', () => {
  const bad = [
    'lang=xx', 'nota=zz', 'ep=times-nada', 'lv=extreme', 'sd=0', 'sd=1000000', 'sd=1.5', 'sd=abc', 'em=0', 'em=9', 'eq=times.nada', 'eq=roy.roy',
    'pt=tcl:11', 'pt=tcl:2.3', 'pt=nada:1', 'pt=tcl', 'ee=ej99', 'ed=xx', 'ea=ingqz', 'eh=a|b', 'eh=%E0%A4%A|||||', 'pp=a3', 'dv=x', 'mi=8', 'mi=2', 'v=moodle', 'xk=tcl',
  ];
  for (const kv of bad) {
    const { state, warning } = EA.load(`#lang=en&lv=hard&${kv}`, '', 'es');
    assert.ok(warning, kv);
    assert.equal(state.lv, kv.startsWith('lv=') ? 'medium' : 'hard', kv);
    const k = kv.split('=')[0];
    if (EA.KEYS.includes(k) && k !== 'lang' && k !== 'lv') assert.deepEqual(state[k], EA.DEFAULTS[k], kv);
  }
  // mi tiene que ser un modelo que existe (con em = 3, de 0 a 2).
  assert.equal(EA.load('#em=3&mi=2', '', 'es').state.mi, 2);
  assert.equal(EA.load('#em=3&mi=2', '', 'es').warning, undefined);
});

test('F3f T010 AC9 · la cabecera va como texto, con 600 caracteres como mucho en total; <script> es solo texto', () => {
  const eh = { subject: '<script>alert(1)</script>', call: 'a|b&c=d', date: '#', duration: '%', instructions: 'Línea 1\nLínea 2' };
  const s = Object.assign({}, EA.DEFAULTS, { lang: 'es', eh });
  const hash = EA.encode(s);
  assert.doesNotMatch(hash, /[<>\s]/);
  assert.deepEqual(EA.load(hash, '', 'es').state.eh, eh);
  assert.equal(EA.HEADER_MAX, 600);
  assert.equal(EA.headerLength(eh), Object.values(eh).join('').length);
  const long = Object.assign({}, eh, { instructions: 'x'.repeat(601 - EA.headerLength(Object.assign({}, eh, { instructions: '' }))) });
  assert.equal(EA.headerLength(long), 601);
  const r = EA.load(EA.encode(Object.assign({}, s, { eh: long })), '', 'es');
  assert.ok(r.warning);
  assert.deepEqual(r.state.eh, EA.DEFAULTS.eh);
});

test('F3f T010 · optsOf da a core/exam las opciones del estado; con los valores por defecto, check sale bien', () => {
  const st = EA.load('', '', 'es').state;
  const o = EA.optsOf(st);
  assert.deepEqual(o.parts, ['times', 'floats']);
  assert.equal(o.level, 'medium'); assert.equal(o.seed, 1); assert.equal(o.models, 1);
  assert.equal(o.points, null); assert.equal(o.example, null); assert.equal(o.det, 'aon'); assert.equal(o.paper, 'a4');
  assert.deepEqual(o.extras, { id: true, normal: true, grid: true, qr: true });
  const c = E.check(o);
  assert.equal(c.ok, true);
  assert.deepEqual(c.items, { times: ['times', 'events'], floats: ['floats', 'sf', 'critical'] });
  // eq cambia cada apartado respecto a su defecto: quita los que van marcados y pone la otra ruta del TCL.
  const s2 = EA.load('#ep=times-tcl&eq=times.events-tcl.route-tcl.moments&pt=tcl:6-floats:1&ea=q', '', 'es').state;
  const o2 = EA.optsOf(s2);
  assert.deepEqual(E.check(o2).items, { times: ['times'], tcl: ['path', 'project', 'prob', 'deadline', 'route'] });
  assert.deepEqual(o2.points, { tcl: 6 }, 'solo los puntos de las partes marcadas');
  assert.deepEqual(o2.extras, { id: false, normal: false, grid: false, qr: true });
  assert.equal(E.check(o2).ok, true);
  assert.equal(E.check(EA.optsOf(EA.load('#ep=', '', 'es').state)).errors[0].key, 'empty');
  assert.equal(EA.optsOf(EA.load('#ee=kl', '', 'es').state).example, 'kl');
});

test('F3f T010 · las familias que piden las partes: enunciado (sg), redes y detective (lab, y dt para sus explicaciones), probabilidad y Montecarlo (st y pr)', () => {
  assert.deepEqual(EA.familiesOf(['times', 'floats']), []);
  assert.deepEqual(EA.familiesOf(['stmt']), ['sg']);
  for (const p of ['roy', 'pert', 'minDummy', 'succ']) assert.deepEqual(EA.familiesOf([p]), ['lab'], p);
  assert.deepEqual(EA.familiesOf(['det']), ['lab', 'dt']);
  for (const p of ['tcl', 'read', 'disc', 'rep']) assert.deepEqual(EA.familiesOf([p]), ['st', 'pr'], p);
  assert.deepEqual(EA.familiesOf(['rep', 'det', 'stmt', 'times']), ['sg', 'lab', 'st', 'pr', 'dt']);
  for (const f of EA.familiesOf(E.PARTS)) assert.ok(FL.FAMILIES[f], f);
  // Cada parte de core/exam, en un grupo de la tabla de partes (tablero 107).
  assert.deepEqual(EA.GROUPS.map((g) => g.id), ['calc', 'build', 'det', 'prob']);
  assert.deepEqual(EA.GROUPS.flatMap((g) => g.parts).sort(), E.PARTS.slice().sort());
});

test('F3f T010 · «Volver al laboratorio» abre cpm.html con el mismo idioma y la misma notación', () => {
  assert.equal(EA.backHref({ lang: 'es', nota: 'en' }), 'cpm.html#lang=es&nota=en');
  assert.equal(EA.backHref({ lang: 'en', nota: 'es' }), 'cpm.html#lang=en&nota=es');
});

test('F3f T010 · examen.html solo carga scripts locales que existen, sin módulos ES, sin CDN y sin scripts en línea (principios 2 y 29)', () => {
  const tags = [...html.matchAll(/<script\b([^>]*)>/g)].map((m) => m[1]);
  assert.ok(tags.length > 0);
  for (const attrs of tags) {
    assert.doesNotMatch(attrs, /type=["']module["']/);
    const src = (attrs.match(/src=["']([^"']+)["']/) || [])[1];
    assert.ok(src, 'sin scripts en línea');
    assert.doesNotMatch(src, /^(https?:)?\/\//, `sin CDN: ${src}`);
    assert.ok(fs.existsSync(path.join(ROOT, src)), `existe ${src}`);
  }
  for (const href of [...html.matchAll(/<link\b[^>]*href=["']([^"']+)["']/g)].map((m) => m[1])) assert.ok(fs.existsSync(path.join(ROOT, href)), `existe ${href}`);
  assert.doesNotMatch(html, /\son[a-z]+=/i, 'sin manejadores en línea');
  assert.doesNotMatch(html, /<style/i, 'sin estilos en línea');
});

test('F3f T010 · examen.html no carga el laboratorio ni el exportador: su base, sin las familias; exam-app.js, el último', () => {
  const src = scriptsOf(html);
  for (const re of [/d3/, /\/app\.js$/, /narrate|predict|editor|roy-view|pert-view|matrix-view|results|gantt|learn|moodle-page|moodle-app|question-view/]) {
    assert.equal(src.some((s) => re.test(s)), false, `${re}`);
  }
  assert.equal(src[src.length - 1], 'js/exam-app.js');
  for (const f of ['js/i18n.js', 'js/i18n-moodle.js', 'js/i18n-exam.js', 'js/core/exam.js', 'js/core/qr.js', 'js/core/series.js', 'js/core/moodle.js', 'js/dom.js', 'js/views/exam-view.js', 'js/family-load.js']) {
    assert.ok(src.includes(f), f);
  }
  for (const f of Object.values(FL.FAMILIES).flat()) assert.equal(src.includes(f), false, `${f} en la base`);
  assert.match(html, /<link rel="stylesheet" href="css\/styles\.css">/);
  assert.match(html, /<link rel="stylesheet" href="css\/exam\.css">/);
  assert.doesNotMatch(html, /moodle\.css/);
});

test('F3f T010 · examen.html: idioma, enlace para saltar, un solo <h1>, la cabecera y los huecos de la página', () => {
  assert.match(html, /<html lang="es">/);
  assert.match(html, /<a class="skip" href="#main"/);
  assert.match(html, /<main id="main"/);
  assert.equal((html.match(/<h1[\s>]/g) || []).length, 1);
  for (const id of ['selLang', 'selNota', 'backLink', 'exView', 'loadFailed', 'urlWarning', 'live']) assert.match(html, new RegExp(`id="${id}"`), id);
  assert.match(html, /<meta name="viewport" content="width=device-width, initial-scale=1">/);
});

test('F3f T010 · la base y las familias se cargan en el orden de la página sin errores, y el núcleo encuentra el proyecto del examen', () => {
  const ctx = vm.createContext({ console, URLSearchParams, TextEncoder, TextDecoder });
  ctx.globalThis = ctx;
  const run = (f) => vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
  scriptsOf(html).forEach(run);
  for (const k of ['i18n', 'i18nMoodle', 'exam', 'qr', 'series', 'moodle', 'grade', 'dom', 'examView', 'familyLoad', 'examApp']) assert.ok(ctx.PNL[k], k);
  for (const k of ['stmtgen', 'detective', 'netSvg', 'probgen', 'probgrade', 'normalTable', 'i18nDet']) assert.equal(ctx.PNL[k], undefined, k);
  assert.equal(ctx.PNL.i18n.t('es', 'exam.page.title'), 'Examen imprimible');
  const c = { lang: 'es', nota: 'en', labels: IM.labels('en'), tr: ctx.PNL.i18nMoodle.tr('es') };
  const base = ctx.PNL.exam.project(EA.optsOf(EA.load('', '', 'es').state), 0, c);
  assert.equal(base.ok, true);
  for (const f of Object.keys(FL.FAMILIES)) FL.FAMILIES[f].forEach(run);
  for (const f of Object.keys(FL.READY)) assert.equal(FL.READY[f](ctx.PNL), true, f);
  const all = EA.optsOf(EA.load('#ep=roy-det-times-floats-tcl-rep&lv=easy', '', 'es').state);
  const m = ctx.PNL.exam.project(all, 0, c);
  assert.equal(m.ok, true);
  assert.deepEqual(JSON.parse(JSON.stringify(m.base.rows)), JSON.parse(JSON.stringify(E.project(all, 0, Object.assign({}, c, { tr: IM.tr('es') })).base.rows)));
});

test('F3f T010 · los textos de la cabecera de la página están en los dos idiomas', () => {
  for (const lang of I.languages) {
    for (const k of ['docTitle', 'title', 'lead', 'parts', 'partsHint', 'level', 'seed', 'models', 'header', 'extras', 'paper', 'copy', 'empty']) {
      const v = I.t(lang, `exam.page.${k}`);
      assert.ok(v && v !== `exam.page.${k}`, `${lang}.exam.page.${k}`);
    }
    for (const p of E.PARTS) assert.notEqual(I.t(lang, `exam.part.${p}`), `exam.part.${p}`, `${lang} ${p}`);
    for (const x of new Set(Object.values(E.ITEMS).flat())) assert.notEqual(I.t(lang, `exam.item.${x}`), `exam.item.${x}`, `${lang} ${x}`);
    for (const g of EA.GROUPS) assert.notEqual(I.t(lang, `exam.page.group.${g.id}`), `exam.page.group.${g.id}`);
  }
  assert.equal(I.t('es', 'exam.page.title'), 'Examen imprimible');
  assert.equal(I.t('en', 'exam.page.title'), 'Printable exam');
});

test('F3f T010 · examen.html está oculta: ni la portada, ni el laboratorio, ni «Aprende más» la enlazan (plan §0)', () => {
  const files = ['index.html', 'cpm.html', 'moodle.html', ...fs.readdirSync(path.join(ROOT, 'js')).filter((f) => f.endsWith('.js')).map((f) => `js/${f}`)];
  for (const f of files) {
    // Un enlace es la ruta entre comillas (href o una cadena del código); los comentarios pueden nombrarla.
    assert.doesNotMatch(fs.readFileSync(path.join(ROOT, f), 'utf8'), /["'`]examen\.html/, f);
  }
});
