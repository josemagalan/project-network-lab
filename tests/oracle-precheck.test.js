'use strict';
// Oráculo de core/precheck (F2c, T001; AC4 y AC7).
const test = require('node:test');
const assert = require('node:assert/strict');
const O = require('./oracle-precheck.js');
const P = require('../js/core/project.js');
const E = require('../js/core/examples.js');

const predOf = (p) => Object.fromEntries(p.activities.map((a) => [a.id, [...p.preds[a.id]]]));
const sortE = (es) => es.map((e) => e.join('>')).sort();

test('cadena A→B→C con A→C: la reducción no tiene A→C y el camino que la hace redundante es A, B, C', () => {
  const pred = { A: [], B: ['A'], C: ['A', 'B'] };
  assert.deepEqual(sortE(O.reduction(pred)), ['A>B', 'B>C']);
  assert.deepEqual(O.shortestWithout(pred, ['A', 'C']), ['A', 'B', 'C']);
  assert.equal(O.shortestWithout(pred, ['A', 'B']), null);
  assert.deepEqual([...O.closure(pred).get('A')].sort(), ['B', 'C']);
});

test('dos caminos alternativos de distinta longitud: se da el más corto', () => {
  // A→B→C→E, A→D→E y A→E: el camino de A a E sin la directa es A, D, E.
  const pred = { A: [], B: ['A'], C: ['B'], D: ['A'], E: ['C', 'D', 'A'] };
  assert.deepEqual(O.shortestWithout(pred, ['A', 'E']), ['A', 'D', 'E']);
});

test('con dos caminos igual de cortos, el primero en orden de identificadores', () => {
  const pred = { A: [], C: ['A'], B: ['A'], D: ['B', 'C', 'A'] };
  assert.deepEqual(O.shortestWithout(pred, ['A', 'D']), ['A', 'B', 'D']);
});

test('en el Ejercicio 6 (Tema 6, hoja de ejercicios) la reducción es la propia tabla', () => {
  const ex = E.get('ej6');
  const pred = predOf(P.parse(ex.rows, ex.mode).project);
  const all = Object.keys(pred).flatMap((a) => pred[a].map((p) => [p, a]));
  assert.deepEqual(sortE(O.reduction(pred)), sortE(all));
});

test('Electrona (Tema 6, ejercicio 5) con «K es lo último» traducido a todas: la reducción es la referencia', () => {
  const ref = { A: [], B: [], C: [], D: ['A', 'B'], E: ['B', 'C'], F: ['A', 'B'], G: ['F'], H: ['D', 'E'], I: ['H'], J: ['G', 'I'], K: ['J'] };
  const lazy = Object.assign({}, ref, { K: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'] });
  const refEdges = Object.keys(ref).flatMap((a) => ref[a].map((p) => [p, a]));
  assert.deepEqual(sortE(O.reduction(lazy)), sortE(refEdges));
  assert.deepEqual(O.shortestWithout(lazy, ['F', 'K']), ['F', 'G', 'K']);
});
