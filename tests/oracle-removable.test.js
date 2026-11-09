'use strict';
// Oráculo de las ficticias que se pueden quitar (F2b, T001; AC6 y AC11).
const test = require('node:test');
const assert = require('node:assert/strict');
const R = require('./oracle-removable.js');
const P = require('../js/core/project.js');
const E = require('../js/core/examples.js');
const A = require('../js/core/aoa.js');

const toOracle = (net) => {
  const re = new Map(net.events.map((e, i) => [e.n, i]));
  return { nodes: net.events.length, arcs: net.arcs.map((e) => ({ act: e.act, from: re.get(e.from), to: re.get(e.to) })),
    dummies: net.dummies.map((d) => ({ from: re.get(d.from), to: re.get(d.to) })) };
};

test('una cadena A→B con una ficticia en medio: esa ficticia se puede quitar (fundiendo)', () => {
  const net = { nodes: 4, arcs: [{ act: 'A', from: 0, to: 1 }, { act: 'B', from: 2, to: 3 }], dummies: [{ from: 1, to: 2 }] };
  assert.deepEqual(R.removable({ A: ['B'], B: [] }, net), [{ i: 0, how: 'merge' }]);
});

test('una ficticia duplicada por otro camino se puede borrar', () => {
  // A→B por dos ficticias en serie y una directa: la directa sobra.
  const net = { nodes: 5, arcs: [{ act: 'A', from: 0, to: 1 }, { act: 'B', from: 3, to: 4 }],
    dummies: [{ from: 1, to: 2 }, { from: 2, to: 3 }, { from: 1, to: 3 }] };
  assert.deepEqual(R.removable({ A: ['B'], B: [] }, net).find((r) => r.i === 2), { i: 2, how: 'delete' });
});

test('en la red de las reglas del Ejercicio 6 (Tema 6a) no sobra ninguna ficticia', () => {
  const ex = E.get('ej6');
  const p = P.parse(ex.rows, ex.mode).project;
  const succ = Object.fromEntries(p.activities.map((a) => [a.id, [...p.succs[a.id]]]));
  assert.deepEqual(R.removable(succ, toOracle(A.build(p))), []);
});
