'use strict';
// core/mindummy: mínimo de ficticias con presupuesto fijo (spec f2a-pert-ficticias, AC4, AC9 y AC16; plan P3 y T002).
const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../js/core/project.js');
const E = require('../js/core/examples.js');
const A = require('../js/core/aoa.js');
const M = require('../js/core/mindummy.js');
const O = require('./oracle-mindummy.js');

const load = (rows, mode = 'succ', opts) => {
  const { project, report } = P.parse(rows, mode, opts);
  assert.ok(project, JSON.stringify(report));
  return project;
};
const loadEx = (id) => { const ex = E.get(id); return load(ex.rows, ex.mode, { structureOnly: !!ex.structureOnly }); };
const fromSucc = (succ) => load(Object.keys(succ).sort().map((id) => ({ id, duration: '', links: succ[id].join(', ') })), 'succ', { structureOnly: true });
function rng(seed) { let s = seed >>> 0; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; }
const randomSucc = (rand, n, dens) => {
  const ids = Array.from({ length: n }, (_, i) => String.fromCharCode(65 + i));
  return Object.fromEntries(ids.map((a, j) => [a, ids.slice(j + 1).filter(() => rand() < dens)]));
};

test('AC4: coincide con el oráculo de fuerza bruta en 400 tablas aleatorias de hasta 6 actividades', () => {
  const rand = rng(4);
  for (let i = 0; i < 400; i++) {
    const succ = randomSucc(rand, 1 + Math.floor(rand() * 6), 0.45);
    const r = M.solve(fromSucc(succ));
    assert.equal(r.value, O.minDummies(succ).value, `tabla ${i}: ${JSON.stringify(succ)}`);
    assert.equal(r.exact, true, `tabla ${i}: debería demostrarse`);
  }
});

test('AC4: nunca pone más ficticias que las reglas, y la red que devuelve es exacta', () => {
  const rand = rng(99);
  for (let i = 0; i < 150; i++) {
    const p = fromSucc(randomSucc(rand, 2 + Math.floor(rand() * 11), 0.3));
    const r = M.solve(p, { budget: 3000 });   // basta para comprobar las cotas y la red; no hace falta demostrar
    assert.ok(r.value <= A.build(p).dummies.length, `tabla ${i}`);
    assert.ok(r.lower <= r.value, `tabla ${i}: cota`);
    assert.equal(r.net.dummies.length, r.value, `tabla ${i}: la red tiene value ficticias`);
    assert.deepEqual(A.verify(r.net, p), { ok: true, problems: [] }, `tabla ${i}`);
  }
});

test('AC16: A<C,D,E; B<C,E; D<E — el mínimo es 2 (las reglas ponen 3)', () => {
  const p = fromSucc({ A: ['C', 'D', 'E'], B: ['C', 'E'], C: [], D: ['E'], E: [] });
  const r = M.solve(p);
  assert.deepEqual([r.value, r.exact], [2, true]);
  assert.equal(A.build(p).dummies.length, 3);
  assert.deepEqual(A.verify(r.net, p), { ok: true, problems: [] });
});

test('AC4: los seis ejercicios del autor, exactos y en menos de 2 s cada uno', () => {
  const want = { ej1: 2, ej2: 2, ej3: 4, ej4: 3, ej6: 3, ej7: 5 };
  for (const [id, v] of Object.entries(want)) {
    const t0 = Date.now();
    const r = M.solve(loadEx(id));
    assert.ok(Date.now() - t0 < 2000, `${id}: ${Date.now() - t0} ms`);
    assert.deepEqual([r.value, r.exact], [v, true], id);
  }
});

test('AC9: con el presupuesto agotado no se declara exacto, y la cota queda por debajo', () => {
  const r = M.solve(loadEx('ej7'), { budget: 1 });
  assert.equal(r.exact, false);
  assert.ok(r.lower <= r.value);
  assert.equal(r.value, 5, 'sin buscar, el valor es el de las reglas');
  assert.deepEqual(M.solve(loadEx('ej7'), { budget: 1 }), r, 'mismo presupuesto, mismo resultado');
});

test('determinista y sin reloj: dos llamadas con el presupuesto por defecto dan lo mismo', () => {
  const p = fromSucc({ X: ['P', 'Q'], Y: ['Q', 'R'], Z: ['P', 'R'], P: [], Q: [], R: [] });
  const a = M.solve(p); const b = M.solve(p);
  assert.deepEqual(a, b);
  assert.deepEqual([a.value, a.exact], [6, true]);
  assert.equal(M.DEFAULT_BUDGET, 80000, "presupuesto calibrado en T010 (plan §7)");
});

test('aoa.methods.min delega en el mínimo', () => {
  const p = fromSucc({ A: ['C', 'D', 'E'], B: ['C', 'E'], C: [], D: ['E'], E: [] });
  const net = A.build(p, { method: 'min' });
  assert.equal(net.method, 'min');
  assert.equal(net.dummies.length, 2);
  assert.deepEqual(A.verify(net, p), { ok: true, problems: [] });
});
