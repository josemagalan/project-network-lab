'use strict';
// core/aoamethods: dibujo progresivo, agrupar por precedentes (Cohen y Sadeh, 2007) y Kim (2008)
// (spec f2b-metodos-reto, T007; AC1, AC2, AC5 y AC8). Lecturas exactas: spec §Behaviour.
const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../js/core/project.js');
const E = require('../js/core/examples.js');
const A = require('../js/core/aoa.js');
const M = require('../js/core/mindummy.js');
const K = require('../js/core/aoacheck.js');
require('../js/core/aoamethods.js');

const load = (rows, mode = 'succ', opts) => {
  const { project, report } = P.parse(rows, mode, opts);
  assert.ok(project, JSON.stringify(report));
  return project;
};
const loadEx = (id) => { const ex = E.get(id); return load(ex.rows, ex.mode, { structureOnly: !!ex.structureOnly }); };
const fromSucc = (succ) => load(Object.keys(succ).map((id) => ({ id, duration: '1', links: succ[id].join(', ') })));
function rng(seed) { let s = seed >>> 0; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; }
function randomSucc(rand, n) {
  const ids = Array.from({ length: n }, (_, i) => `A${i + 1}`);
  return Object.fromEntries(ids.map((id, i) => [id, ids.slice(i + 1, i + 7).filter(() => rand() < 0.35)]));
}
const METHODS = ['prog', 'cs', 'kim'];
const logicErrors = (net, p) => K.diagnose(net, p).problems.filter((x) => x.code !== 'unnecessaryDummy');

test('los tres métodos están registrados en aoa.methods con el contrato de la F2a', () => {
  for (const m of METHODS) {
    assert.equal(typeof A.methods[m], 'function', m);
    const net = A.build(loadEx('ej6'), { method: m });
    assert.equal(net.method, m);
    for (const k of ['events', 'arcs', 'dummies', 'trace']) assert.ok(Array.isArray(net[k]), `${m}.${k}`);
  }
});

test('cifras de la spec en los seis ejercicios y en el caso tipo (ficticias y sucesos)', () => {
  for (const id of ['ej1', 'ej2', 'ej3', 'ej4', 'ej6', 'ej7', 'tipo']) {
    const p = loadEx(id);
    for (const m of METHODS) {
      const want = E.get(id).expected.methods[m];
      const net = A.build(p, { method: m });
      assert.equal(net.dummies.length, want.dummies, `${id}.${m}: ficticias`);
      if (want.events !== undefined) assert.equal(net.events.length, want.events, `${id}.${m}: sucesos`);
    }
  }
});

test('Cohen y Sadeh (2007), tabla 1: 5 ficticias y 13 sucesos, como su tabla 4 (D1 en D, la que va después de C)', () => {
  const net = A.build(loadEx('cs2007'), { method: 'cs' });
  assert.deepEqual([net.dummies.length, net.events.length], [5, 13]);
  const uniq = net.dummies.filter((d) => d.rule === 'uniqueness');
  assert.deepEqual(uniq.map((d) => d.because), [['C', 'D']]);
});

test('Kim (2008), tabla 1: 8 ficticias lógicas (su figura 4) y 2 de unicidad al dejar un solo inicio y un solo fin', () => {
  const net = A.build(loadEx('kim2008'), { method: 'kim' });
  assert.equal(net.dummies.filter((d) => d.rule === 'dependency').length, 8);
  assert.equal(net.dummies.filter((d) => d.rule === 'uniqueness').length, 2);
});

test('redes correctas e i < j en 2000 tablas de hasta 12 actividades y en 300 de 16 a 30', () => {
  const rand = rng(20261109);
  for (let k = 0; k < 2300; k++) {
    const n = k < 2000 ? 1 + Math.floor(rand() * 12) : 16 + Math.floor(rand() * 15);
    const p = fromSucc(randomSucc(rand, n));
    for (const m of METHODS) assert.deepEqual(logicErrors(A.build(p, { method: m }), p), [], `${m} n=${n}`);
  }
});

test('nunca menos ficticias que el mínimo exacto (400 tablas de hasta 9 actividades)', () => {
  const rand = rng(31);
  let exact = 0;
  for (let k = 0; k < 400; k++) {
    const p = fromSucc(randomSucc(rand, 1 + Math.floor(rand() * 9)));
    const min = M.solve(p);
    if (!min.exact) continue;
    exact++;
    for (const m of METHODS) assert.ok(A.build(p, { method: m }).dummies.length >= min.value, m);
  }
  assert.ok(exact > 350, `exactas: ${exact}`);
});

test('actividades paralelas: la que va después en orden alfabético lleva la ficticia de unicidad', () => {
  const p = fromSucc({ A: [], B: [] });
  for (const m of METHODS) {
    const net = A.build(p, { method: m });
    assert.equal(net.dummies.length, 1, m);
    assert.equal(net.dummies[0].rule, 'uniqueness', m);
    assert.deepEqual(net.dummies[0].because, ['A', 'B'], m);
    assert.equal(net.arcs.find((e) => e.act === 'B').to, net.dummies[0].from, `${m}: B termina en su suceso propio`);
  }
});

test('deterministas: la misma tabla da la misma red', () => {
  const p = loadEx('ej3');
  for (const m of METHODS) assert.deepEqual(A.build(p, { method: m }), A.build(loadEx('ej3'), { method: m }), m);
});

test('traza del dibujo progresivo del Ejercicio 6: tabla, una actividad por paso en orden topológico, unicidad y fin', () => {
  const p = loadEx('ej6');
  const net = A.build(p, { method: 'prog' });
  const kinds = net.trace.map((s) => s.kind);
  assert.equal(kinds[0], 'progTable');
  assert.deepEqual(kinds.slice(-2), ['progUnique', 'progEnd']);
  const acts = net.trace.filter((s) => s.kind === 'progAct').map((s) => s.act);
  assert.deepEqual([...acts].sort(), 'ABCDEFGHIJK'.split(''));
  const pos = Object.fromEntries(acts.map((a, i) => [a, i]));
  for (const a of acts) for (const b of p.succs[a]) assert.ok(pos[a] < pos[b], `${a} antes que ${b}`);
  const named = new Set(net.dummies.map((d) => d.name));
  const inTrace = net.trace.flatMap((s) => (s.prog ? s.prog.dummies : []));
  assert.deepEqual([...inTrace].sort(), [...named].sort(), 'cada ficticia nace en un paso');
  for (const s of net.trace.filter((x) => x.kind === 'progAct')) {
    assert.ok(['initial', 'pred', 'existing', 'new'].includes(s.prog.start), s.act);
    for (const q of s.prog.preds) {
      assert.ok(p.activities.some((a) => a.id === q.act), q.act);
      assert.ok(['direct', 'dummy', 'existing'].includes(q.how), `${s.act}: ${q.how}`);
    }
  }
  const h = net.trace.find((s) => s.act === 'H');
  assert.equal(h.prog.start, 'new', 'H depende de E y F, que no llegan a un mismo suceso');
});

test('el dibujo progresivo llega al mínimo en el caso tipo (aprovecha la precedencia implícita A→E)', () => {
  assert.equal(A.build(loadEx('tipo'), { method: 'prog' }).dummies.length, 2);
});

// ---------- T009: Spinrad (1986) y Corneil, Gotlieb y Lee (1973) ----------
const S = require('./oracle-spinrad.js');
const AM = require('../js/core/aoamethods.js');

// Órdenes serie-paralelo (composición recursiva) y de intervalo (intervalos al azar), como tablas de posteriores.
function seriesParallel(rand, ids) {
  if (ids.length === 1) return { acts: ids, rel: [] };
  const cut = 1 + Math.floor(rand() * (ids.length - 1));
  const L = seriesParallel(rand, ids.slice(0, cut)); const R = seriesParallel(rand, ids.slice(cut));
  const rel = [...L.rel, ...R.rel];
  if (rand() < 0.5) for (const a of L.acts) for (const b of R.acts) rel.push([a, b]);
  return { acts: ids, rel };
}
function intervalOrder(rand, ids) {
  const iv = ids.map(() => { const l = Math.floor(rand() * 10); return [l, l + Math.floor(rand() * 4)]; });
  const rel = [];
  ids.forEach((a, i) => ids.forEach((b, j) => { if (iv[i][1] < iv[j][0]) rel.push([a, b]); }));
  return { acts: ids, rel };
}
const toSucc = ({ acts, rel }) => Object.fromEntries(acts.map((a) => [a, rel.filter(([x]) => x === a).map(([, y]) => y)]));

test('Spinrad: en su modelo, igual al óptimo de su modelo en órdenes serie-paralelo y de intervalo (oráculo, hasta 5 tareas)', () => {
  const rand = rng(1986);
  let n = 0;
  for (let k = 0; k < 120; k++) {
    const ids = ['A', 'B', 'C', 'D', 'E'].slice(0, 2 + Math.floor(rand() * 4));
    const succ = toSucc(k % 2 ? seriesParallel(rand, ids) : intervalOrder(rand, ids));
    const p = fromSucc(succ);
    assert.equal(AM.spinradModel(p).arcs, S.optimum(succ).arcs, JSON.stringify(succ));
    n++;
  }
  assert.equal(n, 120);
});

test('Spinrad y Corneil-Gotlieb-Lee: cifras de la spec en los seis ejercicios y en el caso tipo', () => {
  for (const id of ['ej1', 'ej2', 'ej3', 'ej4', 'ej6', 'ej7', 'tipo']) {
    const p = loadEx(id);
    for (const m of ['spinrad', 'cgl']) {
      const want = E.get(id).expected.methods[m];
      const net = A.build(p, { method: m });
      assert.equal(net.dummies.length, want.dummies, `${id}.${m}: ficticias`);
      if (want.events !== undefined) assert.equal(net.events.length, want.events, `${id}.${m}: sucesos`);
      if (want.model) assert.deepEqual(net.model, want.model, `${id}.${m}: en su modelo`);
    }
  }
});

test('Corneil, Gotlieb y Lee (1973), figura 6: 9 ficticias creadas y 8 tras quitar la redundante de tipo (3)', () => {
  const p = fromSucc({ A: ['E', 'F', 'G'], B: ['F', 'G', 'H'], C: ['G', 'H', 'I'], D: ['G', 'I', 'J'], E: [], F: [], G: [], H: [], I: [], J: [] });
  assert.equal(AM.cgl(p, { cover: false }).dummies.length, 9);
  const net = A.build(p, { method: 'cgl' });
  assert.equal(net.dummies.length, 8);
  assert.equal(net.approx, false);
});

test('Sysło (1981), figura 2.3: Corneil-Gotlieb-Lee da 9 ficticias y 9 sucesos; las reglas, 8', () => {
  const p = loadEx('syslo1981');
  const net = A.build(p, { method: 'cgl' });
  assert.deepEqual([net.dummies.length, net.events.length], [9, 9]);
  assert.equal(A.build(p).dummies.length, 8);
});

test('contraejemplo propio: Corneil-Gotlieb-Lee da 4 ficticias y el mínimo exacto es 3 (9 actividades, sin paralelas)', () => {
  const p = fromSucc({ A1: ['A4', 'A5', 'A7'], A2: ['A3', 'A7'], A3: ['A7', 'A8', 'A9'], A4: ['A7', 'A8'], A5: ['A7'], A6: ['A8'], A7: [], A8: [], A9: [] });
  assert.equal(A.build(p, { method: 'cgl' }).dummies.length, 4);
  const min = M.solve(p);
  assert.deepEqual([min.value, min.exact], [3, true]);
});

test('Spinrad y Corneil-Gotlieb-Lee: redes correctas en 1000 tablas de hasta 12 actividades y 150 de 16 a 30', () => {
  const rand = rng(1973);
  for (let k = 0; k < 1150; k++) {
    const n = k < 1000 ? 1 + Math.floor(rand() * 12) : 16 + Math.floor(rand() * 15);
    const p = fromSucc(randomSucc(rand, n));
    for (const m of ['spinrad', 'cgl']) assert.deepEqual(logicErrors(A.build(p, { method: m }), p), [], `${m} n=${n}`);
  }
});

test('Spinrad y Corneil-Gotlieb-Lee: nunca menos ficticias que el mínimo exacto (300 tablas de hasta 9 actividades)', () => {
  const rand = rng(1981);
  for (let k = 0; k < 300; k++) {
    const p = fromSucc(randomSucc(rand, 1 + Math.floor(rand() * 9)));
    const min = M.solve(p);
    if (!min.exact) continue;
    for (const m of ['spinrad', 'cgl']) assert.ok(A.build(p, { method: m }).dummies.length >= min.value, m);
  }
});

test('Corneil-Gotlieb-Lee: con el presupuesto agotado, recubrimiento voraz marcado y la red sigue siendo correcta', () => {
  const p = fromSucc({ A: ['E', 'F', 'G'], B: ['F', 'G', 'H'], C: ['G', 'H', 'I'], D: ['G', 'I', 'J'], E: [], F: [], G: [], H: [], I: [], J: [] });
  const net = AM.cgl(p, { budget: 1 });
  assert.equal(net.approx, true);
  assert.deepEqual(logicErrors(net, p), []);
  assert.equal(AM.CGL_BUDGET, 65536);
});

test('Spinrad: la red contraída no tiene ficticias que se puedan quitar y guarda la cifra de su modelo', () => {
  const p = loadEx('ej6');
  const net = A.build(p, { method: 'spinrad' });
  assert.deepEqual(K.removable(net, p), []);
  assert.ok(net.model.dummies > net.dummies.length);
});

