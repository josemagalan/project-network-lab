'use strict';
// core/crashex: los ejemplos de la F5b con su fuente (spec f5b-coste-tiempo, AC1 y «Qué resultado obtiene»; plan P6, T002).
// Los datos y los valores esperados vienen de las fuentes citadas y de la tabla de la spec, no del núcleo.
const test = require('node:test');
const assert = require('node:assert/strict');
const X = require('../js/core/crashex.js');

const INT = /^\d+$/;
const NUM = /^\d+(\.\d+)?$/;

test('F5b T002: cuatro ejemplos, en este orden', () => {
  assert.deepEqual(X.list().map((e) => e.id), ['kl', 'ni', 'nip', 'rf']);
  assert.equal(X.get('ni').id, 'ni');
  assert.equal(X.get('nada'), null);
});

test('F5b T002: cada ejemplo tiene título, fuente, unidad de tiempo y unidad de coste en ES y EN', () => {
  for (const ex of X.list()) for (const k of ['title', 'source', 'unit', 'costUnit']) assert.ok(ex[k].es && ex[k].en, `${ex.id}.${k}`);
});

test('F5b T002: ids únicos, predecesoras de antes, duraciones enteras con dc ≤ dn y costes con cc ≥ cn', () => {
  for (const ex of X.list()) {
    const ids = ex.rows.map((r) => r.id);
    assert.equal(new Set(ids).size, ids.length, ex.id);
    ex.rows.forEach((r, i) => {
      assert.match(r.dn, INT, `${ex.id}.${r.id}.dn`); assert.match(r.dc, INT, `${ex.id}.${r.id}.dc`);
      assert.match(r.cn, NUM, `${ex.id}.${r.id}.cn`); assert.match(r.cc, NUM, `${ex.id}.${r.id}.cc`);
      assert.ok(Number(r.dc) <= Number(r.dn), `${ex.id}.${r.id}: dc ≤ dn`);
      assert.ok(Number(r.cc) >= Number(r.cn), `${ex.id}.${r.id}: cc ≥ cn`);
      for (const l of r.links.split(', ').filter(Boolean)) assert.ok(ids.indexOf(l) >= 0 && ids.indexOf(l) < i, `${ex.id}.${r.id}: ${l}`);
    });
    for (const k of ['fixed', 'perUnit', 'due', 'penalty', 'bonus']) assert.ok(ex.k[k] === null || Number.isFinite(ex.k[k]), `${ex.id}.k.${k}`);
  }
});

const pick = (ex) => Object.fromEntries(X.get(ex).rows.map((r) => [r.id, [r.links, Number(r.dn), Number(r.dc), Number(r.cn), Number(r.cc)]]));
const slope = ([, dn, dc, cn, cc]) => (dn > dc ? (cc - cn) / (dn - dc) : 0);

test('F5b T002: Klastorin (Tema 6c, diapositiva 10; figura 5.8): duraciones, costes normales, pendientes y 2 semanas de reducción', () => {
  const k = pick('kl');
  assert.deepEqual(Object.keys(k), ['A', 'B', 'C', 'D']);
  assert.deepEqual([k.A[0], k.B[0], k.C[0], k.D[0]], ['', '', 'A, B', 'B']);
  assert.deepEqual(Object.values(k).map((v) => [v[1], v[3], slope(v), v[1] - v[2]]), [[7, 60, 8, 2], [6, 85, 5, 2], [15, 55, 10, 2], [10, 120, 4, 2]]);
  // En las columnas de la pestaña (spec, aclaración): A 7/5, 60/76; B 6/4, 85/95; C 15/13, 55/75; D 10/8, 120/128.
  assert.deepEqual(Object.values(k).map((v) => v[4]), [76, 95, 75, 128]);
  // Figura 5.13: indirecto de 7 por semana, plazo de 19 semanas y penalización de 5 por semana de retraso.
  assert.deepEqual(X.get('kl').k, { fixed: null, perUnit: 7, due: 19, penalty: 5, bonus: null });
});

test('F5b T002: Nicholas (§7.1, figura 7.3): normal y urgente de cada actividad; indirectos de la figura 7.6 y primas de la 7.7', () => {
  const n = pick('ni');
  assert.deepEqual(Object.keys(n), ['A', 'B', 'C', 'D', 'E', 'F', 'G']);
  assert.deepEqual(Object.values(n).map((v) => v[0]), ['', '', 'A', 'A', 'B', 'C', 'D, E']);
  assert.deepEqual(Object.values(n).map((v) => v.slice(1)), [[9, 6, 10, 16], [8, 5, 9, 18], [5, 4, 7, 8], [8, 6, 9, 19], [7, 3, 7, 15], [5, 5, 5, 5], [5, 2, 8, 23]]);
  assert.deepEqual(Object.values(n).map(slope), [2, 3, 1, 5, 2, 0, 5]);
  assert.deepEqual(X.get('ni').k, { fixed: 10, perUnit: 3, due: null, penalty: null, bonus: null });
  assert.deepEqual(X.get('nip').rows, X.get('ni').rows);
  assert.deepEqual(X.get('nip').k, { fixed: 10, perUnit: 3, due: 18, penalty: 1, bonus: 2 });
});

test('F5b T002: la regla que falla (spec, `fail.py`): pendientes 4, 6, 2, 3 y 4; C y D tras B, E tras A y C; sin costes del proyecto', () => {
  const f = pick('rf');
  assert.deepEqual(Object.values(f).map((v) => v[0]), ['', '', 'B', 'B', 'A, C']);
  assert.deepEqual(Object.values(f).map((v) => [v[1], v[2], slope(v)]), [[5, 3, 4], [4, 2, 6], [2, 1, 2], [8, 5, 3], [5, 3, 4]]);
  assert.deepEqual(X.get('rf').k, { fixed: null, perUnit: null, due: null, penalty: null, bonus: null });
});

test('F5b T002: los valores esperados de la spec van con el ejemplo', () => {
  assert.deepEqual(X.get('kl').expected.rule, { 22: 320, 21: 328, 20: 338, 19: 348, 18: 361 });
  assert.deepEqual(X.get('kl').expected.best, [19]);
  assert.deepEqual(X.get('ni').expected.rule, { 22: 55, 21: 57, 20: 59, 19: 63, 18: 68, 17: 73, 16: 78, 15: 86 });
  assert.deepEqual(X.get('ni').expected.best, [20]);
  assert.deepEqual(X.get('nip').expected.best, [19, 20]);
  assert.deepEqual(X.get('rf').expected.rule, { 12: 60, 11: 63, 10: 68, 9: 75, 8: 85, 7: 95 });
  assert.deepEqual(X.get('rf').expected.opt, { 12: 60, 11: 63, 10: 68, 9: 75, 8: 83, 7: 93 });
});
