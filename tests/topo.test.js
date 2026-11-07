'use strict';
// core/topo: orden topológico determinista y niveles de la red ROY.
const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../js/core/project.js');
const T = require('../js/core/topo.js');

const row = (id, duration, links = '') => ({ id, duration, links });

test('orden topológico: respeta las precedencias y desempata por identificador', () => {
  const { project } = P.parse([row('C', 1), row('B', 1, 'A'), row('A', 1), row('D', 1, 'B, C')], 'pred');
  const { order } = T.order(project);
  assert.deepEqual(order, ['A', 'B', 'C', 'D']);
});

test('los identificadores con números se ordenan de forma natural (A2 antes que A10)', () => {
  const { project } = P.parse([row('A10', 1), row('A2', 1), row('A1', 1)], 'pred');
  assert.deepEqual(T.order(project).order, ['A1', 'A2', 'A10']);
});

test('niveles: las actividades sin predecesoras están en el nivel 1; inicio en 0 y fin en el último', () => {
  const { project } = P.parse([row('A', 1), row('B', 1), row('C', 1, 'A'), row('D', 1, 'A, C'), row('E', 1, 'B')], 'pred');
  const { levels } = T.order(project);
  assert.equal(levels.get(P.START), 0);
  assert.equal(levels.get('A'), 1);
  assert.equal(levels.get('B'), 1);
  assert.equal(levels.get('C'), 2);
  assert.equal(levels.get('D'), 3);
  assert.equal(levels.get('E'), 2);
  assert.equal(levels.get(P.END), 4);
});

test('un grafo con ciclo devuelve las actividades del ciclo en lugar de un orden', () => {
  const project = { activities: ['A', 'B', 'C'].map((id) => ({ id, d: 1 })),
    preds: { A: ['C'], B: ['A'], C: ['B'] }, succs: { A: ['B'], B: ['C'], C: ['A'] } };
  const out = T.order(project);
  assert.equal(out.order, undefined);
  assert.deepEqual([...out.cycle].sort(), ['A', 'B', 'C']);
});
