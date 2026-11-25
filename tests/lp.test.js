'use strict';
// core/lp: símplex de dos fases con la regla de Bland (spec f5b-coste-tiempo, AC2; plan P3, T003).
// Programas pequeños con la solución calculada a mano.
const test = require('node:test');
const assert = require('node:assert/strict');
const L = require('../js/core/lp.js');

const near = (x, y, msg) => { assert.equal(x.length, y.length, msg); x.forEach((v, i) => assert.ok(Math.abs(v - y[i]) < 1e-9, `${msg}: x${i} = ${v}, esperado ${y[i]}`)); };
const obj = (c, x) => c.reduce((s, v, i) => s + v * x[i], 0);

test('F5b T003: máximo de x + y con x + y ≤ 4, x ≤ 3 e y ≥ 1 (min −x − y): valor −4', () => {
  const x = L.simplex([-1, -1], [{ a: [1, 1], op: '<=', b: 4 }, { a: [1, 0], op: '<=', b: 3 }, { a: [0, 1], op: '>=', b: 1 }]);
  assert.ok(Math.abs(obj([-1, -1], x) + 4) < 1e-9);
  assert.ok(x[0] + x[1] <= 4 + 1e-9 && x[0] <= 3 + 1e-9 && x[1] >= 1 - 1e-9);
});

test('F5b T003: término independiente negativo (x − y ≤ −1) e igualdades', () => {
  near(L.simplex([1, 1], [{ a: [1, -1], op: '<=', b: -1 }, { a: [1, 0], op: '>=', b: 2 }]), [2, 3], 'y ≥ x + 1, x ≥ 2');
  near(L.simplex([2, 3], [{ a: [1, 1], op: '=', b: 5 }, { a: [0, 1], op: '>=', b: 1 }]), [4, 1], 'x + y = 5, y ≥ 1');
});

test('F5b T003: sin solución (x ≥ 3 y x ≤ 2) da null', () => {
  assert.equal(L.simplex([1], [{ a: [1], op: '>=', b: 3 }, { a: [1], op: '<=', b: 2 }]), null);
});

test('F5b T003: no acotado (min −x sin cota) lanza un error', () => {
  assert.throws(() => L.simplex([-1, 0], [{ a: [0, 1], op: '<=', b: 1 }]), /no acotado/);
});

test('F5b T003: una fila redundante (dos igualdades iguales) no estorba', () => {
  near(L.simplex([1, 2], [{ a: [1, 1], op: '=', b: 3 }, { a: [2, 2], op: '=', b: 6 }]), [3, 0], 'x + y = 3 dos veces');
});

// El error del prototipo (plan, §5 y P3): tras la fase 1 queda una artificial en la base a nivel 0; si no sale, la
// fase 2 la vuelve positiva y la solución no cumple su fila. El modelo de Klastorin a 18 semanas lo provocaba (daba
// un coste de 20 en lugar de 41). Aquí, el mismo programa: comienzos S y fines F de A, B, C y D.
test('F5b T003: el modelo de Klastorin a 18 semanas (artificiales a nivel 0): factible y con sobrecoste 41', () => {
  const act = [[7, 5, 8, []], [6, 4, 5, []], [15, 13, 10, [0, 1]], [10, 8, 4, [1]]]; // dn, dc, b, predecesoras
  const n = act.length; const c = new Array(2 * n).fill(0); const rows = [];
  const row = (pairs) => { const a = new Array(2 * n).fill(0); for (const [j, v] of pairs) a[j] += v; return a; };
  act.forEach(([dn, dc, b, preds], i) => {
    c[i] = b; c[n + i] = -b;
    rows.push({ a: row([[n + i, 1], [i, -1]]), op: '<=', b: dn });
    rows.push({ a: row([[n + i, 1], [i, -1]]), op: '>=', b: dc });
    rows.push({ a: row([[n + i, 1]]), op: '<=', b: 18 });
    for (const p of preds) rows.push({ a: row([[n + p, 1], [i, -1]]), op: '<=', b: 0 });
  });
  const x = L.simplex(c, rows);
  for (const r of rows) {
    const lhs = obj(r.a, x);
    assert.ok(r.op === '<=' ? lhs <= r.b + 1e-7 : lhs >= r.b - 1e-7, `fila ${JSON.stringify(r)}: ${lhs}`);
  }
  const extra = act.reduce((s, [dn, , b], i) => s + b * (dn - (x[n + i] - x[i])), 0);
  assert.ok(Math.abs(extra - 41) < 1e-9, `sobrecoste ${extra}`);
});

// El mismo modelo en pequeño, encontrado al azar (semilla 1) con el símplex sin esa salida: A (2 → 0, pendiente 5),
// B (6 → 4, 5) y C (6, no se acorta) tras A, a 6 unidades. Sin sacar la artificial, la solución incumplía una fila.
// La única forma de llegar a 6 es acortar A a 0: sobrecoste 10.
test('F5b T003: el modelo de A, B y C a 6 unidades, que deja una artificial a nivel 0 al acabar la fase 1', () => {
  // Variables: S_A, S_B, S_C, F_A, F_B, F_C.
  const c = [5, 5, 0, -5, -5, 0];
  const rows = [
    { a: [-1, 0, 0, 1, 0, 0], op: '<=', b: 2 }, { a: [-1, 0, 0, 1, 0, 0], op: '>=', b: 0 }, { a: [0, 0, 0, 1, 0, 0], op: '<=', b: 6 },
    { a: [0, -1, 0, 0, 1, 0], op: '<=', b: 6 }, { a: [0, -1, 0, 0, 1, 0], op: '>=', b: 4 }, { a: [0, 0, 0, 0, 1, 0], op: '<=', b: 6 },
    { a: [0, 0, -1, 0, 0, 1], op: '<=', b: 6 }, { a: [0, 0, -1, 0, 0, 1], op: '>=', b: 6 }, { a: [0, 0, 0, 0, 0, 1], op: '<=', b: 6 },
    { a: [0, 0, -1, 1, 0, 0], op: '<=', b: 0 },
  ];
  const x = L.simplex(c, rows);
  for (const r of rows) {
    const lhs = obj(r.a, x);
    assert.ok(r.op === '<=' ? lhs <= r.b + 1e-7 : lhs >= r.b - 1e-7, `fila ${JSON.stringify(r)}: ${lhs}`);
  }
  assert.ok(Math.abs(x[3] - x[0]) < 1e-9, `A a 0: ${x[3] - x[0]}`);
});
