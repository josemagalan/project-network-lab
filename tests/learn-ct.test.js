'use strict';
// F5b T014: «Aprende más» de coste–tiempo (js/learn-ct.js, grupo cl): las mismas secciones en los dos idiomas, lo que pide la
// spec (la recta y la pendiente, solo críticas y todos los caminos, por qué la regla puede fallar con el caso rf, el modelo
// lineal, indirectos, penalizaciones y primas, el atajo, Ackoff y Sasieni y las reglas estocásticas) y sus referencias. Las
// cifras que cuenta son las del núcleo.
const test = require('node:test');
const assert = require('node:assert/strict');
const L = require('../js/learn-ct.js');
const K = require('../js/core/crash.js');
const X = require('../js/core/crashex.js');

const all = (lang) => L[lang].sections.flatMap((s) => [s.head, ...s.paras]).join(' ');

test('F5b T014: «Aprende más» tiene las mismas secciones y párrafos en español e inglés, y las mismas referencias', () => {
  assert.ok(L.es.title && L.en.title);
  assert.equal(L.es.sections.length, L.en.sections.length);
  L.es.sections.forEach((s, i) => assert.equal(s.paras.length, L.en.sections[i].paras.length, s.head));
  assert.equal(L.refs.es.length, L.refs.en.length);
  // Las cifras de un idioma están en el otro.
  const nums = (t) => (t.match(/\d+(?:[.,]\d+)?/g) || []).map((x) => x.replace(',', '.')).sort();
  L.es.sections.forEach((s, i) => s.paras.forEach((p, j) => assert.deepEqual(nums(p), nums(L.en.sections[i].paras[j]), `${s.head} · ${j}`)));
});

test('F5b T014: cuenta lo que pide la spec y cita sus fuentes', () => {
  const es = all('es');
  for (const w of ['pendiente', 'punto normal', 'punto urgente', 'críticas', 'todos los caminos críticos', 'corte mínimo', 'vuelve a alargar', 'modelo lineal',
    'indirecto', 'penalización', 'prima', 'atajo', 'Ackoff y Sasieni', 'índice de criticidad']) assert.ok(es.includes(w), w);
  const refs = L.refs.es.join(' ');
  for (const w of ['Klastorin', 'Nicholas', 'Tema 6c', 'Kelley', 'Fulkerson', 'Phillips', 'Ackoff', 'Domínguez Machuca', 'Dios Palomares', 'Johnson', 'Van Slyke']) assert.ok(refs.includes(w), w);
});

test('F5b T014: las cifras de los ejemplos que cuenta son las del núcleo (Klastorin, Nicholas y la regla que falla)', () => {
  const es = all('es');
  const kl = K.parse(X.get('kl').rows).project;
  const tot = K.totals(kl, X.get('kl').k);
  const best = K.best(kl, X.get('kl').k);
  assert.deepEqual(best, [19]);
  assert.ok(es.includes(`${tot.find((t) => t.T === 19).total} a 19 semanas`));
  assert.ok(es.includes('A y B') && es.includes('13') && es.includes('C') && es.includes('10'));
  const ni = K.parse(X.get('ni').rows).project;
  const sc = K.shortcut(ni);
  assert.ok(es.includes(`${sc.crashCost}`) && es.includes(`${sc.cost}`));
  const nip = K.parse(X.get('nip').rows).project;
  assert.deepEqual(K.best(nip, X.get('nip').k), [19, 20]);
  assert.ok(es.includes('131'));
  const rf = K.parse(X.get('rf').rows).project;
  const st = K.rule(rf).find((s) => s.T === 8);
  assert.deepEqual([st.cost, st.opt, st.move.shorten, st.move.lengthen, st.move.cost], [85, 83, ['B', 'E'], ['C'], 8]);
  assert.ok(es.includes('85') && es.includes('83') && es.includes('6 + 4 − 2 = 8'));
});
