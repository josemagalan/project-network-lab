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

// ---------- F3f T011: los documentos en la página (AC1–AC8, AC19, AC21–AC23; bloques 2 y 3 de textos) ----------

const NS = require('../js/views/net-svg.js');
const CS = require('../js/views/chart-svg.js');
require('../js/i18n-det.js');

const docCtx = (lang, nota) => EA.docCtx(lang, nota, { netSvg: NS, chartSvg: CS });
const COMBOS = [
  ['easy', ['stmt', 'roy', 'det', 'times', 'floats', 'minDummy', 'succ', 'tcl', 'read', 'disc', 'rep']],
  ['medium', ['roy', 'det', 'times', 'floats', 'tcl', 'rep']],
  ['hard', ['pert', 'det', 'times', 'floats', 'succ', 'tcl', 'read']],
  ['easy', ['det', 'disc']],
  ['medium', ['stmt', 'det', 'minDummy']],
  ['easy', ['roy', 'pert', 'det', 'tcl']],
];
const texts = (d) => JSON.stringify([d.student, d.solution, d.rubric], (k, v) => (k === 'svg' || k === 'model' ? undefined : v));

test('F3f T011 · docCtx: los textos de core/exam salen de i18n-exam (exam.…), los del detective de i18n-det (det.exp.…) y los demás de i18n-moodle', () => {
  const c = docCtx('es', 'es');
  assert.equal(c.lang, 'es'); assert.equal(c.nota, 'es');
  assert.deepEqual(c.labels, IM.labels('es'));
  assert.equal(c.tr('exam.part.times'), 'Tiempos');
  assert.equal(c.tr('exam.det.calcES', { lab: 'X', f: 'EF', wrong: 1, right: 2 }), I.t('es', 'det.exp.calcES', { lab: 'X', f: 'EF', wrong: 1, right: 2 }));
  assert.equal(c.tr('exam.det.lab', { f: 'EF', a: 'B' }), 'El EF de B');
  assert.equal(c.tr('exam.det.labEv', { f: 'TE', n: 3 }), 'El TE del suceso 3');
  assert.equal(c.tr('col.act'), I.t('es', 'mq.col.act'));
  assert.equal(typeof c.svg, 'function'); assert.equal(typeof c.chart, 'function');
  // Los dibujos son los de net-svg y chart-svg (histograma con dist, tornado con indices).
  const fake = EA.docCtx('es', 'en', { netSvg: { render: (m) => `net ${m.id}` }, chartSvg: { dist: (m) => `dist ${m.id}`, indices: (m) => `idx ${m.id}` } });
  assert.deepEqual([fake.svg({ id: 1 }), fake.chart({ kind: 'dist', id: 2 }), fake.chart({ kind: 'indices', id: 3 })], ['net 1', 'dist 2', 'idx 3']);
  // Sin las familias de las redes y los gráficos, sin dibujos (la vista previa pone su texto alternativo).
  const bare = EA.docCtx('en', 'en', {});
  assert.equal(bare.svg, null); assert.equal(bare.chart, null);
});

test('F3f T011 · bloques 2 y 3: cada texto que pide core/exam está en i18n-exam o en i18n-det, en los dos idiomas', () => {
  const src = fs.readFileSync(path.join(ROOT, 'js', 'core', 'exam.js'), 'utf8');
  const keys = [...new Set([...src.matchAll(/tr\('(exam\.[a-zA-Z.]+)'/g)].map((m) => m[1]))];
  assert.ok(keys.length > 60, String(keys.length));
  for (const lang of I.languages) {
    const c = docCtx(lang, 'en');
    for (const k of keys) {
      if (k.startsWith('exam.det.') && !['exam.det.lab', 'exam.det.labEv'].includes(k)) continue;
      assert.notEqual(I.t(lang, k), k, `${lang} ${k}`);
    }
    for (const k of ['calcCritOn', 'calcCritOff', 'royMissing', 'pertFalseDummy']) assert.notEqual(c.tr(`exam.det.${k}`), `exam.det.${k}`, `${lang} ${k}`);
  }
});

test('F3f T011 · los tres documentos, en ES y EN y con las dos notaciones, sin claves sueltas, parámetros sin rellenar, undefined ni NaN; «1 error» en singular', () => {
  for (const [level, parts] of COMBOS) {
    for (const [lang, nota] of [['es', 'en'], ['en', 'es']]) {
      const o = EA.optsOf(EA.load(`#ep=${parts.join('-')}&lv=${level}&sd=3`, '', lang).state);
      const c = docCtx(lang, nota);
      const m = E.project(o, 0, c);
      assert.equal(m.ok, true, `${level} ${parts}`);
      const d = E.document(Object.assign({ letter: 'A' }, m), o, c);
      assert.equal(d.ok, true);
      const s = texts(d);
      const where = `${lang} ${level} ${parts.join('-')}`;
      assert.doesNotMatch(s, /"(exam|mq|det)\.[a-zA-Z]+\.[a-zA-Z.]+|"(exam|mq|det)\.[a-zA-Z]+"/, where);
      assert.doesNotMatch(s, /\{[a-zA-Z]+\}/, where);
      assert.doesNotMatch(s, /undefined|NaN|\[object Object\]/, where);
      assert.doesNotMatch(s, /tiene 1 errores|has 1 errors/, where);
    }
  }
  // En fácil, el detective siembra un solo error.
  const o = EA.optsOf(EA.load('#ep=det&lv=easy', '', 'es').state);
  const d = E.document(Object.assign({ letter: 'A' }, E.project(o, 0, docCtx('es', 'en'))), o, docCtx('es', 'en'));
  assert.ok(d.student.some((b) => b.p === 'La red ROY de este proyecto tiene 1 error. Márcalo en la red y explica en qué consiste.'), JSON.stringify(d.student[0]));
});

test('F3f T011 · searchKey: la búsqueda solo depende de las partes, los apartados, el nivel, la semilla, el ejemplo y la red del detective', () => {
  const base = EA.load('#ep=times-floats-tcl', '', 'es').state;
  const k0 = EA.searchKey(EA.optsOf(base));
  for (const patch of [{ pt: { tcl: 3 } }, { ea: 'q' }, { pp: 'letter' }, { dv: 'r' }, { em: 4, mi: 2 }, { lang: 'en' }, { nota: 'es' }, { eh: Object.assign({}, base.eh, { subject: 'OGP' }) }, { eq: ['tcl.deadline', 'floats.sf'] }]) {
    assert.equal(EA.searchKey(EA.optsOf(Object.assign({}, base, patch))), k0, JSON.stringify(patch));
  }
  for (const patch of [{ ep: ['times', 'floats'] }, { eq: ['times.events'] }, { lv: 'hard' }, { sd: 2 }, { ee: 'kl' }, { ed: 'aoa' }]) {
    assert.notEqual(EA.searchKey(EA.optsOf(Object.assign({}, base, patch))), k0, JSON.stringify(patch));
  }
});

test('F3f T011 · el documento a la vista: la cabecera del enunciado delante (con las instrucciones por defecto si están vacías) y el título delante de la solución y de la rúbrica', () => {
  const st = EA.load('#ep=times&ea=nq', '', 'es').state;
  const d = { student: [{ p: 'a' }], solution: [{ p: 'b' }], rubric: [{ p: 'c' }] };
  const t = (k) => I.t('es', k);
  assert.deepEqual(EA.viewBlocks(d, 's', st, t)[0], { head: st.eh, id: false, instructions: t('exam.head.instructions') });
  assert.deepEqual(EA.viewBlocks(d, 's', Object.assign({}, st, { ea: 'i', eh: Object.assign({}, st.eh, { instructions: 'Sin apuntes' }) }), t)[0], { head: Object.assign({}, st.eh, { instructions: 'Sin apuntes' }), id: true, instructions: 'Sin apuntes' });
  assert.deepEqual(EA.viewBlocks(d, 'o', st, t), [{ title: 'Solución' }, { p: 'b' }]);
  assert.deepEqual(EA.viewBlocks(d, 'r', st, t), [{ title: 'Rúbrica' }, { p: 'c' }]);
});

// ---------- T012: el papel ----------

test('F3f T012 · pageCss: la regla @page del papel elegido (A4 o carta), con márgenes de 15 mm', () => {
  assert.equal(EA.pageCss('a4'), '@page { size: A4; margin: 15mm; }');
  assert.equal(EA.pageCss('letter'), '@page { size: letter; margin: 15mm; }');
  assert.equal(EA.pageCss('otro'), '@page { size: A4; margin: 15mm; }');
});

test('F3f T012 · el pie de página (modelo, semilla usada y documento) y la línea de estado de la vista previa, con «1 página» en singular (ES y EN)', () => {
  const t = (lang) => (k, p) => I.t(lang, k, p);
  assert.equal(EA.footOf({ letter: 'A', sdUsed: 7 }, 's', t('es')), 'Modelo A · semilla 7 · Enunciado');
  assert.equal(EA.footOf({ letter: 'B', sdUsed: 1234 }, 'r', t('en')), 'Version B · seed 1234 · Marking guide');
  assert.equal(EA.statusOf({ letter: 'A', seed: 7, sdUsed: 7 }, 3, 'a4', t('es')), 'Modelo A · semilla 7 · 3 páginas en A4');
  assert.equal(EA.statusOf({ letter: 'B', seed: 7926, sdUsed: 7930 }, 1, 'letter', t('es')), 'Modelo B · semilla 7926 (usada: 7930) · 1 página en Carta');
  assert.equal(EA.statusOf({ letter: 'A', seed: 2, sdUsed: 2 }, 1, 'letter', t('en')), 'Version A · seed 2 · 1 page on Letter');
  assert.equal(I.t('es', 'exam.page.printWait', { k: 2, n: 4 }), 'Preparando los enunciados: 2 de 4 modelos…');
  assert.equal(I.t('en', 'exam.page.printWait', { k: 2, n: 4 }), 'Preparing the statements: 2 of 4 versions…');
  assert.equal(I.t('es', 'exam.page.previewNote'), 'exam.page.previewNote', 'la nota de la vista previa seguida ya no hace falta');
});

// ---------- T013: los extras y el ejemplo citado como proyecto del modelo A ----------

test('F3f T013 · familiesOf con un ejemplo: examples y stochex (xe); los de tres tiempos y discretas, también st; con el enunciado, statements (xs)', () => {
  assert.deepEqual(EA.familiesOf(['times', 'floats'], 'ej6'), ['xe']);
  assert.deepEqual(EA.familiesOf(['times', 'floats', 'tcl'], 'kl'), ['st', 'pr', 'xe']);
  assert.deepEqual(EA.familiesOf(['roy'], 'kd'), ['lab', 'st', 'xe']);
  assert.deepEqual(EA.familiesOf(['stmt', 'roy'], 'ej1'), ['sg', 'lab', 'xe', 'xs']);
  assert.deepEqual(EA.familiesOf(['stmt'], ''), ['sg']);
  assert.deepEqual(EA.familiesOf(['stmt']), ['sg']);
});

test('F3f T013 · los nombres de los ejemplos (exam.ex.<id>) son los títulos de core/examples y core/stochex, en ES y EN', () => {
  const X = require('../js/core/examples.js');
  const SX = require('../js/core/stochex.js');
  for (const id of E.EXAMPLES) {
    const e = ['kl', 'hl', 'kd'].includes(id) ? SX.get(id) : X.get(id);
    for (const lang of ['es', 'en']) assert.equal(I.t(lang, `exam.ex.${id}`), e.title[lang], `${id} ${lang}`);
  }
  assert.equal(I.t('es', 'exam.page.project'), 'Proyecto');
  assert.equal(I.t('es', 'exam.page.projectGen'), 'Tabla generada con la semilla');
  assert.equal(I.t('en', 'exam.page.projectGen'), 'Table generated from the seed');
});

test('F3f T013 · el pie y la línea de estado del modelo de un ejemplo llevan su nombre en vez de la semilla (ES y EN)', () => {
  const t = (lang) => (k, p) => I.t(lang, k, p);
  const ex = { letter: 'A', example: 'kl', seed: null, sdUsed: null };
  assert.equal(EA.footOf(ex, 's', t('es')), 'Modelo A · Proyecto informático de 6 tareas (Klastorin) · Enunciado');
  assert.equal(EA.footOf(ex, 'o', t('en')), 'Version A · 6-task IT project (Klastorin) · Solution');
  assert.equal(EA.statusOf(ex, 4, 'a4', t('es')), 'Modelo A · Proyecto informático de 6 tareas (Klastorin) · 4 páginas en A4');
  assert.equal(EA.statusOf({ letter: 'B', example: null, seed: 7920, sdUsed: 7920 }, 2, 'a4', t('es')), 'Modelo B · semilla 7920 · 2 páginas en A4');
});

test('F3f T013 · withExample: al elegir un ejemplo se quitan las partes que no permite (con sus puntos y apartados) y la otra ruta; sin ejemplo, nada cambia', () => {
  const s = EA.load('#lang=es&ep=stmt-times-floats-tcl-read&eq=tcl.route-times.events&pt=read:2-tcl:3', '', 'es').state;
  const k = EA.withExample(s, 'kl');
  assert.equal(k.ee, 'kl');
  assert.deepEqual(k.ep, ['times', 'floats', 'tcl']);
  assert.deepEqual(k.eq, ['times.events']);
  assert.deepEqual(k.pt, { tcl: 3 });
  assert.equal(E.check(EA.optsOf(k)).ok, true);
  const d = EA.withExample(s, 'kd');
  assert.deepEqual([d.ep, d.pt], [[], {}]);
  const g = EA.withExample(k, '');
  assert.deepEqual([g.ee, g.ep, g.eq, g.pt], ['', k.ep, k.eq, k.pt]);
  assert.notEqual(EA.withExample(s, 'kl'), s, 'un estado nuevo');
  assert.deepEqual(s.ep, ['stmt', 'times', 'floats', 'tcl', 'read'], 'sin tocar el de antes');
});

test('F3f T013 · un enlace con un ejemplo y partes que no permite: se quitan al abrirlo y se avisa; si todo vale, sin aviso', () => {
  const bad = EA.load('#lang=es&ep=stmt-times-floats&ee=kl', '', 'es');
  assert.deepEqual([bad.state.ee, bad.state.ep, bad.warning], ['kl', ['times', 'floats'], true]);
  const ok = EA.load('#lang=es&ep=times-floats&ee=kl', '', 'es');
  assert.deepEqual([ok.state.ep, ok.warning], [['times', 'floats'], undefined]);
});
