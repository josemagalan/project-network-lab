'use strict';
// Oráculo del mínimo de ficticias: búsqueda exhaustiva, lenta pero fácil de leer (F2a, T001; AC4 y AC16).
// Sirve de referencia independiente para core/mindummy en tablas de hasta 6 actividades.
const test = require('node:test');
const assert = require('node:assert/strict');
const O = require('./oracle-mindummy.js');

// Tabla de posteriores directas: { A: ['C', 'D'], … }.
const T = (spec) => {
  const succ = {};
  for (const part of spec.split(';')) {
    const [l, r] = part.split('<');
    const L = l.split(',').map((x) => x.trim()).filter(Boolean);
    const R = (r || '').split(',').map((x) => x.trim()).filter(Boolean);
    for (const a of L) { succ[a] = [...new Set([...(succ[a] || []), ...R])]; for (const b of R) succ[b] = succ[b] || []; }
  }
  return succ;
};

test('una cadena no necesita ficticias', () => {
  assert.equal(O.minDummies(T('A<B;B<C')).value, 0);
});

test('dos actividades paralelas necesitan una ficticia de identidad', () => {
  assert.equal(O.minDummies({ A: [], B: [] }).value, 1);
});

test('A<C,D,E; B<C,E; D<E: el mínimo es 2 (aprovecha la precedencia implícita A→E)', () => {
  assert.equal(O.minDummies(T('A<C,D,E;B<C,E;D<E')).value, 2);
  assert.equal(O.minDummies(T('A<C,D;B<C,E;D<E')).value, 2, 'misma tabla sin la redundante');
});

test('tres actividades que comparten posteriores en ciclo ({P,Q}, {Q,R}, {P,R}) necesitan 6', () => {
  assert.equal(O.minDummies(T('X<P,Q;Y<Q,R;Z<P,R')).value, 6);
});

test('la red que devuelve representa exactamente las precedencias', () => {
  const succ = T('A<C,D,E;B<C,E;D<E');
  const { value, net } = O.minDummies(succ);
  assert.ok(O.check(succ, net), 'red válida');
  assert.equal(net.dummies.length, value);
});
