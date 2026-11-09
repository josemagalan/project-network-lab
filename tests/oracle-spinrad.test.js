'use strict';
// Oráculo del modelo de Spinrad (1986) (F2b, T001; AC3).
const test = require('node:test');
const assert = require('node:assert/strict');
const S = require('./oracle-spinrad.js');

test('una cadena A→B necesita un arco añadido (A+ → B−)', () => {
  assert.equal(S.optimum({ A: ['B'], B: [] }).arcs, 1);
});

test('dos tareas con las mismas posteriores comparten su fin (preprocesado) y necesitan un solo arco', () => {
  const r = S.optimum({ A: ['C'], B: ['C'], C: [] });
  assert.equal(r.arcs, 1);
  assert.equal(r.nodes, 5, 'A+ y B+ fundidos: A−, B−, AB+, C−, C+');
});

test('tareas independientes no necesitan arcos', () => {
  assert.equal(S.optimum({ A: [], B: [], C: [] }).arcs, 0);
});

test('el oráculo termina en menos de 10 s con 5 tareas', () => {
  const t0 = Date.now();
  const r = S.optimum({ A: ['C', 'D'], B: ['D', 'E'], C: [], D: [], E: [] });
  assert.ok(r, 'encuentra una red');
  assert.ok(Date.now() - t0 < 10000, `${Date.now() - t0} ms`);
});
