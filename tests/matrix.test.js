'use strict';
// core/matrix: matriz de encadenamiento del Tema 6b y su sincronía con la traza (AC16).
const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../js/core/project.js');
const E = require('../js/core/examples.js');
const C = require('../js/core/cpm.js');
const M = require('../js/core/matrix.js');

const build = (id) => {
  const ex = E.get(id);
  const p = P.parse(ex.rows, ex.mode).project;
  const s = C.solve(p);
  return { p, s, m: M.build(s, p) };
};
const at = (m, row, col) => m.cell(m.labels.indexOf(row), m.labels.indexOf(col));

test('etiquetas: inicio, actividades en orden topológico y fin', () => {
  const { s, m } = build('roy10');
  assert.deepEqual(m.labels, [P.START, ...s.order, P.END]);
});

test('ROY de 10 actividades: cada celda vale la duración de la predecesora, como en el Tema 6b', () => {
  const { m } = build('roy10');
  const S = P.START, F = P.END;
  const expected = [
    ['A', S, 0], ['B', S, 0], ['C', 'A', 2], ['D', 'A', 2], ['E', 'B', 3], ['E', 'C', 7],
    ['F', 'B', 3], ['F', 'C', 7], ['F', 'D', 8], ['G', 'F', 9], ['H', 'E', 3], ['I', 'G', 8], ['I', 'J', 10],
    ['J', 'F', 9], [F, 'H', 2], [F, 'I', 2],
  ];
  for (const [r, c, v] of expected) assert.equal(at(m, r, c), v, `${r}←${c}`);
  const filled = m.labels.flatMap((_, i) => m.labels.map((__, j) => m.cell(i, j))).filter((v) => v !== null);
  assert.equal(filled.length, expected.length, 'no hay celdas de más');
});

test('ROY de 10 actividades: columna t y fila T coinciden con la matriz resuelta del Tema 6b', () => {
  const { m } = build('roy10');
  const order = (labels, vals) => Object.fromEntries(labels.map((l, i) => [l, vals[i]]));
  const t = order(m.labels, m.tCol);
  const T = order(m.labels, m.TRow);
  assert.deepEqual(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', P.END].map((x) => t[x]), [0, 0, 2, 2, 9, 10, 19, 12, 29, 19, 31]);
  assert.deepEqual(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', P.END].map((x) => T[x]), [0, 7, 3, 2, 26, 10, 21, 29, 29, 19, 31]);
  assert.equal(t[P.START], 0);
});

test('ROY de 6 actividades: celdas, t y T del ejemplo resuelto del Tema 6b', () => {
  const { m } = build('roy6');
  assert.equal(at(m, 'C', 'A'), 2);
  assert.equal(at(m, 'C', 'B'), 3);
  assert.equal(at(m, P.END, 'C'), 7);
  assert.equal(at(m, P.END, 'E'), 3);
  assert.equal(at(m, P.END, 'F'), 9);
  const t = Object.fromEntries(m.labels.map((l, i) => [l, m.tCol[i]]));
  const T = Object.fromEntries(m.labels.map((l, i) => [l, m.TRow[i]]));
  assert.deepEqual(['A', 'B', 'C', 'D', 'E', 'F', P.END].map((x) => t[x]), [0, 0, 3, 2, 2, 10, 19]);
  assert.deepEqual(['A', 'B', 'C', 'D', 'E', 'F', P.END].map((x) => T[x]), [0, 9, 12, 2, 16, 10, 19]);
});

test('AC16: en un paso hacia delante se activa la fila de la actividad y las celdas de sus predecesoras', () => {
  const { s, m } = build('roy10');
  const k = s.trace.findIndex((st) => st.kind === 'forward' && st.act === 'F');
  const a = m.active(k);
  const iF = m.labels.indexOf('F');
  assert.equal(a.row, iF);
  assert.equal(a.col, undefined);
  assert.equal(a.target, 't');
  assert.deepEqual(a.cells.map(([i, j]) => [m.labels[i], m.labels[j]]).sort(), [['F', 'B'], ['F', 'C'], ['F', 'D']]);
  assert.deepEqual(a.chosen.map(([i, j]) => m.labels[j]), ['D']);   // 2 + 8 = 10 decide el máximo
});

test('AC16: en un paso hacia atrás se activa la columna de la actividad y las celdas de sus sucesoras', () => {
  const { s, m } = build('roy10');
  const k = s.trace.findIndex((st) => st.kind === 'backward' && st.act === 'B');
  const a = m.active(k);
  assert.equal(a.col, m.labels.indexOf('B'));
  assert.equal(a.target, 'T');
  assert.deepEqual(a.cells.map(([i, j]) => [m.labels[i], m.labels[j]]).sort(), [['E', 'B'], ['F', 'B']]);
  assert.deepEqual(a.chosen.map(([i]) => m.labels[i]), ['F']);   // T(F) − 3 = 7 decide el mínimo
});

test('en los pasos que no son pasadas no se activa nada', () => {
  const { s, m } = build('roy6');
  for (const k of [0, 1, s.trace.length - 1]) assert.deepEqual(m.active(k), { cells: [], chosen: [] });
});
