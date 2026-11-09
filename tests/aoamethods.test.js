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
  assert.equal(AM.CGL_BUDGET, 400000);
});

test('Spinrad: la red contraída no tiene ficticias que se puedan quitar y guarda la cifra de su modelo', () => {
  const p = loadEx('ej6');
  const net = A.build(p, { method: 'spinrad' });
  assert.deepEqual(K.removable(net, p), []);
  assert.ok(net.model.dummies > net.dummies.length);
});

test('revisión F2b, F5: las lecturas de Kim, Corneil-Gotlieb-Lee y Spinrad, fijadas también fuera de las tablas de las fuentes', () => {
  // Tablas en las que quitar la fusión de Kim, el teorema 1 de Corneil-Gotlieb-Lee, invertir la fase 1 de Spinrad o
  // quitar su fase 2 cambia las cifras (los cuatro mutantes sobrevivían; ver la revisión de cierre de la F2b).
  const cases = [
    [{ A: ['D', 'E', 'G'], B: ['C', 'D', 'G'], C: ['H'], D: ['H'], E: ['F', 'I'], F: ['H', 'I'], G: [], H: [], I: [] },
      { kim: [3, 8], cgl: [3, 8], spinrad: [3, 8, 8, 13] }],
    [{ A1: [], A2: ['A7'], A3: ['A6', 'A8'], A4: ['A6', 'A7', 'A9'], A5: ['A7', 'A9', 'A10'], A6: ['A11'], A7: [], A8: ['A10', 'A11', 'A12'], A9: ['A12'], A10: ['A11'], A11: [], A12: [] },
      { kim: [9, 12], cgl: [7, 11], spinrad: [8, 11, 13, 16] }],
    [{ A1: ['A2', 'A6'], A2: ['A4', 'A6', 'A7'], A3: ['A7', 'A8'], A4: [], A5: ['A6', 'A7', 'A9', 'A11'], A6: ['A9'], A7: ['A9'], A8: ['A10', 'A11'], A9: [], A10: ['A11'], A11: [] },
      { kim: [6, 11], cgl: [5, 11], spinrad: [5, 11, 11, 17] }],
  ];
  for (const [succ, want] of cases) {
    const p = fromSucc(succ);
    for (const [m, w] of Object.entries(want)) {
      const net = A.build(p, { method: m });
      const got = [net.dummies.length, net.events.length, ...(net.model ? [net.model.dummies, net.model.events] : [])];
      assert.deepEqual(got, w, `${Object.keys(succ).length} actividades, ${m}`);
    }
  }
});

test('revisión F2b, F2: el presupuesto de Corneil-Gotlieb-Lee acota el trabajo (28 actividades, < 2 s, voraz marcado)', () => {
  // Tabla aleatoria (semilla 6817 del generador del refutador): con el presupuesto en subconjuntos congelaba la
  // pestaña unos 30 s. Ahora cada subconjunto cuesta (actividades + ficticias)².
  const p = fromSucc({ A1: ['A2', 'A6', 'A8', 'A10'], A2: ['A4', 'A6', 'A9', 'A11', 'A13', 'A14', 'A16'], A3: ['A5', 'A7', 'A8', 'A10', 'A13', 'A17'], A4: ['A7', 'A9', 'A11', 'A12', 'A13', 'A16', 'A17', 'A22'], A5: ['A6', 'A7', 'A8', 'A9', 'A10', 'A11', 'A15', 'A17', 'A18', 'A20', 'A21', 'A22', 'A24'], A6: ['A9', 'A12', 'A14', 'A19', 'A22'], A7: ['A13', 'A14'], A8: ['A12', 'A14'], A9: ['A13', 'A14', 'A22', 'A25', 'A27'], A10: ['A12', 'A20', 'A22'], A11: ['A13', 'A18', 'A24', 'A26', 'A28'], A12: ['A13', 'A16', 'A19', 'A21', 'A25', 'A26', 'A27'], A13: ['A19', 'A25', 'A27'], A14: ['A16', 'A20', 'A21', 'A26', 'A27', 'A28'], A15: ['A17', 'A18', 'A20', 'A21', 'A25', 'A26', 'A27', 'A28'], A16: ['A25', 'A26', 'A28'], A17: ['A18', 'A19', 'A22', 'A23'], A18: ['A25'], A19: [], A20: ['A21', 'A22', 'A26'], A21: ['A24'], A22: [], A23: ['A25'], A24: [], A25: ['A26'], A26: [], A27: [], A28: [] });
  const t0 = Date.now();
  const net = A.build(p, { method: 'cgl' });
  assert.ok(Date.now() - t0 < 2000, `${Date.now() - t0} ms`);
  assert.equal(net.approx, true);
  assert.deepEqual(logicErrors(net, p), []);
});

test('revisión F2b, F11: los métodos desempatan como las reglas, en orden natural (A2 antes que A10)', () => {
  const p = fromSucc({ A1: ['A2', 'A10'], A2: ['A3'], A10: ['A3'], A3: [] });
  for (const m of ['rules', 'prog', 'cs', 'kim', 'spinrad', 'cgl']) {
    const net = A.build(p, { method: m });
    const d = net.dummies[0];
    const owner = net.arcs.find((a) => a.to === d.from);
    assert.deepEqual(d.because, ['A2', 'A10'], m);
    assert.equal(owner.act, 'A10', `${m}: la ficticia de unicidad va con A10`);
  }
});

test('revisión F2b, F4: si una actividad se llama F1, F2…, las ficticias se llaman f1, f2… (sin chocar con ellas)', () => {
  const p = fromSucc({ F1: ['F3', 'F4'], F2: ['F3', 'F5'], F3: [], F4: ['F5'], F5: [] });
  for (const m of ['rules', 'prog', 'cs', 'kim', 'spinrad', 'cgl']) {
    const net = A.build(p, { method: m });
    assert.ok(net.dummies.length && net.dummies.every((d, i) => d.name === `f${i + 1}`), m);
  }
  assert.deepEqual(A.build(p, { method: 'prog' }).trace.filter((s) => s.prog).flatMap((s) => s.prog.dummies), ['f1', 'f2']);
  assert.equal(A.build(loadEx('ej6')).dummies[0].name, 'F1', 'sin choque, F1, F2… como siempre');
});

test('revisión F2b, ronda 2: el orden natural desempata ids distintos que comparan igual (A1 y A01) y Spinrad no se rompe', () => {
  const p = fromSucc({ B2: ['A010', 'A01'], C03: ['A010'], D: ['A010', 'A01'], A010: ['A10', 'A1'], A10: ['A01'], A01: [], A1: [] });
  for (const m of ['prog', 'cs', 'kim', 'spinrad', 'cgl']) {
    const net = A.build(p, { method: m });
    assert.deepEqual(logicErrors(net, p), [], m);
    assert.equal(net.dummies.length, 2, m);
  }
});

test('revisión F2b, ronda 2: basta una actividad llamada F<n> para que las ficticias pasen a f1, f2…', () => {
  const p = fromSucc({ A: ['F3', 'F4'], F2: ['F3', 'F5'], F3: [], F4: ['F5'], F5: [] });
  assert.equal(A.dummyPrefix(['A', 'F2']), 'f');
  assert.equal(A.dummyPrefix(['A', 'FA', 'F']), 'F');
  for (const m of ['rules', 'prog', 'cs', 'kim', 'spinrad', 'cgl']) assert.ok(A.build(p, { method: m }).dummies.every((d) => /^f[0-9]+$/.test(d.name)), m);
});
