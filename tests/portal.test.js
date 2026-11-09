'use strict';
// Portada (AC20): textos en los dos idiomas, enlaces al laboratorio en el paso correcto, sin JavaScript y sin CDN.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { messages, resolveLanguage, labHref, TARGETS } = require('../js/portal-content.js');
const U = require('../js/core/urlstate.js');
const P = require('../js/core/project.js');
const E = require('../js/core/examples.js');
const C = require('../js/core/cpm.js');
const A = require('../js/core/aoa.js');

const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const amp = (s) => s.replace(/&/g, '&amp;');

test('cada texto visible y cada etiqueta accesible existen en los dos idiomas', () => {
  assert.deepEqual(Object.keys(messages.es).sort(), Object.keys(messages.en).sort());
  const keys = [...html.matchAll(/data-i18n(?:-aria)?="([^"]+)"/g)].map((m) => m[1]);
  assert.ok(keys.length > 100);
  for (const key of keys) {
    for (const lang of ['es', 'en']) assert.ok(typeof messages[lang][key] === 'string' && messages[lang][key].trim(), `${lang}: ${key}`);
  }
  for (const key of ['docTitle', 'description']) assert.ok(messages.es[key] && messages.en[key]);
});

test('el HTML trae el texto español de cada clave, para que sin JavaScript se lea igual', () => {
  for (const m of html.matchAll(/data-i18n="([^"]+)">([^<]*)</g)) {
    assert.equal(m[2].replace(/&amp;/g, '&'), messages.es[m[1]], m[1]);
  }
});

test('un enlace compartido manda sobre la preferencia guardada; los valores no válidos caen en uno admitido', () => {
  assert.equal(resolveLanguage('?lang=en', 'es', 'es-ES'), 'en');
  assert.equal(resolveLanguage('?lang=es', 'en', 'en-GB'), 'es');
  assert.equal(resolveLanguage('?lang=fr', 'en', 'es-ES'), 'en');
  assert.equal(resolveLanguage('', null, 'en-US'), 'en');
  assert.equal(resolveLanguage('', 'fr', 'fr-FR'), 'es');
  assert.equal(resolveLanguage('', null, null), 'es');
});

test('M1, M3 y M4 abren la ruta del Ejercicio 6 en el paso de su tipo, y el estado se decodifica sin avisos', () => {
  const ex = E.get('ej6');
  const trace = C.solve(P.parse(ex.rows, ex.mode).project).trace;
  const stepOf = (target) => U.decode('#' + labHref(target, 'es').split('#')[1]);
  const expect = { route: 'table', m1: 'build', m3: 'forward', m4: 'float' };
  for (const [target, kind] of Object.entries(expect)) {
    const { state, warning } = stepOf(target);
    assert.equal(warning, undefined, target);
    assert.equal(state.v, 'route');
    assert.equal(state.ex, 'ej6');
    assert.equal(trace[state.step].kind, kind, target);
  }
  assert.equal(trace[stepOf('m3').state.step - 1].kind, 'build', 'M3 empieza en la primera actividad');
  assert.equal(trace[stepOf('m4').state.step].float, 'TF', 'M4 empieza en la holgura total');
  assert.equal(stepOf('work').state.v, 'work');
});

test('todos los destinos conservan el idioma, y el HTML ya los trae en español', () => {
  for (const target of Object.keys(TARGETS)) {
    for (const lang of ['es', 'en']) assert.equal(U.decode('#' + labHref(target, lang).split('#')[1]).state.lang, lang);
    assert.ok(html.includes(`href="${amp(labHref(target, 'es'))}" data-lab="${target}"`), target);
  }
  assert.throws(() => labHref('m9', 'es'));
  assert.throws(() => labHref('m1', 'fr'));
});

test('ocho módulos, cuatro de ellos disponibles; ids únicos y anclas que existen', () => {
  assert.equal((html.match(/class="module-card tone-/g) || []).length, 8);
  for (const m of ['M0', 'M1', 'M2', 'M3', 'M4', 'M5', 'M6', 'M7']) assert.ok(html.includes(`<span class="card-num">${m}</span>`), m);
  assert.equal((html.match(/class="ok" data-i18n="available"/g) || []).length, 5, 'M1, M2, M3, M4 y el taller');
  assert.equal((html.match(/data-i18n="soonPhase2"/g) || []).length, 1, 'de la fase 2 solo queda M0 en preparación');
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]);
  assert.equal(ids.length, new Set(ids).size);
  for (const m of html.matchAll(/href="#([^"]+)"/g)) assert.ok(ids.includes(m[1]), m[1]);
});

test('scripts, estilos, iconos y logotipos son locales y existen; sin CDN ni innerHTML', () => {
  const files = [...html.matchAll(/(?:src|href)="((?:css|js|img)\/[^"]+)"/g)].map((m) => m[1]);
  assert.ok(files.length >= 8);
  for (const file of files) assert.ok(fs.existsSync(path.join(ROOT, file)), file);
  assert.ok(fs.existsSync(path.join(ROOT, 'cpm.html')));
  assert.ok(!/https?:\/\/cdn/.test(html));
  for (const f of ['js/portal.js', 'js/portal-content.js']) assert.doesNotMatch(fs.readFileSync(path.join(ROOT, f), 'utf8'), /innerHTML/);
  const images = [...html.matchAll(/<img\b[^>]*>/g)].map((m) => m[0]);
  for (const img of images) assert.match(img, /alt="[^"]+"/);
});

test('AC14: M2 abre la construcción de la red PERT del Ejercicio 6 (paso 0) en el idioma elegido', () => {
  const ex = E.get('ej6');
  const trace = A.build(P.parse(ex.rows, ex.mode).project).trace;
  for (const lang of ['es', 'en']) {
    const { state, warning } = U.decode('#' + labHref('m2', lang).split('#')[1]);
    assert.equal(warning, undefined);
    assert.deepEqual([state.v, state.ex, state.graph, state.step, state.lang], ['route', 'ej6', 'aoa', 0, lang]);
    assert.equal(trace[state.step].kind, 'succTable');
  }
  assert.ok(html.includes('data-lab="m2"'));
  // T024: el segundo enlace de M2 abre el comparador de métodos con los métodos por defecto.
  for (const lang of ['es', 'en']) {
    const { state, warning } = U.decode('#' + labHref('cmp', lang).split('#')[1]);
    assert.equal(warning, undefined);
    assert.deepEqual([state.v, state.ex, state.graph, state.view, state.lang, state.pair], ['route', 'ej6', 'aoa', 'cmp', lang, null]);
    assert.ok(messages[lang].m2Compare, lang);
  }
  assert.ok(html.includes('data-lab="cmp"><span data-i18n="m2Compare">'));
  for (const lang of ['es', 'en']) assert.ok(messages[lang].m2Open, lang);
});
