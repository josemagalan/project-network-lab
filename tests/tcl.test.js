'use strict';
// core/tcl: el cálculo de examen con la normal del camino crítico de las medias, su traza y los contraejemplos de M6
// (spec f4a-tres-tiempos-tcl, AC1–AC3, AC6–AC9 y AC18; plan §0 y §3, P7). Referencias: Tema 6c (Klastorin, 2010) y
// Hillier y Lieberman (2015), cap. 22, tablas 22.4 y 22.6.
const test = require('node:test');
const assert = require('node:assert/strict');
const L = require('../js/core/tcl.js');
const X = require('../js/core/stochex.js');
const S = require('../js/core/sim.js');

const close = (x, y, tol, msg) => assert.ok(Math.abs(x - y) <= tol, `${msg || ''} ${x} ≠ ${y} (±${tol})`);
const r2 = (x) => Math.round(x * 100) / 100;
const se = (p, n) => Math.sqrt((p * (1 - p)) / n);

test('T006: Klastorin (Tema 6c): camino A–C–E–F, μ = 23,83, σ² = 8,25 y P(≤ 25) = 0,66 de tabla y 0,658 exacta (AC1)', () => {
  const r = L.exam(L.fromExample(X.get('kl')), { deadline: 25 });
  assert.deepEqual(r.path, ['A', 'C', 'E', 'F']);
  close(r.mu, 143 / 6, 1e-9); close(r.var, 8.25, 1e-9); close(r.sd, Math.sqrt(8.25), 1e-12);
  assert.deepEqual(r.table, { z2: 0.41, p4: 0.6591 });
  assert.equal(r2(r.table.p4), 0.66);
  assert.equal(Math.round(r.exact * 1000) / 1000, 0.658);
  assert.deepEqual(r.ties, []);
  assert.equal(r.degenerate, false);
});

test('T006: Hillier (tablas 22.4 y 22.6): A–B–C–E–F–J–L–N, μ = 44, σ² = 9, P(≤ 47) = 0,84 (AC1)', () => {
  const r = L.exam(L.fromExample(X.get('hl')), { deadline: 47 });
  assert.deepEqual(r.path, ['A', 'B', 'C', 'E', 'F', 'J', 'L', 'N']);
  close(r.mu, 44, 1e-9); close(r.var, 9, 1e-9);
  assert.deepEqual(r.table, { z2: 1, p4: 0.8413 });
  assert.equal(r2(r.exact), 0.84);
});

test('T006: dos rutas, plazo 17: 0,81 con la ruta crítica (B–D) y 0,71 con las dos, independientes (AC2)', () => {
  const m = L.fromExample(X.get('tr'));
  const r = L.exam(m, { deadline: 17 });
  assert.deepEqual(r.path, ['B', 'D']);
  assert.equal(r2(r.table.p4), 0.81); assert.equal(r2(r.exact), 0.81);
  const all = L.paths(m, 17);
  assert.equal(all.independent, true);
  assert.deepEqual(all.list.map((p) => p.acts.join('')).sort(), ['AC', 'BD']);
  assert.equal(r2(all.product), 0.71);
});

test('T006: paralelización: dos tareas de media 30, plazo 30: 0,5 cada una y 0,25 las dos (AC3)', () => {
  const m = L.fromExample(X.get('pa'));
  const r = L.exam(m, { deadline: 30 });
  assert.equal(r.exact, 0.5);
  assert.equal(r.ties.length, 1);
  close(L.paths(m, 30).product, 0.25, 1e-12);
});

test('T006: al revés, el plazo para una probabilidad (95 %): de tabla con z a dos decimales y exacto', () => {
  const r = L.exam(L.fromExample(X.get('hl')), { prob: 0.95 });
  close(r.z, 1.6448536269514722, 1e-9);
  close(r.deadline, 44 + 3 * 1.6448536269514722, 1e-9);
  assert.equal(r.table.z2, 1.64); close(r.table.deadline, 44 + 3 * 1.64, 1e-12);
  assert.throws(() => L.exam(L.fromExample(X.get('hl')), { prob: 1 }));
  assert.throws(() => L.exam(L.fromExample(X.get('hl')), {}));
});

test('T006: empates: se usa el camino crítico de mayor σ² y se listan los demás con la suya (AC18)', () => {
  // Dos caminos de media 10: A (σ² = 1) y B–C (σ² = 4 + 0).
  const m = { acts: [
    { id: 'A', preds: [], dist: { kind: 'normal', mu: 10, var: 1 } },
    { id: 'B', preds: [], dist: { kind: 'pert', a: 2, m: 5, b: 14 } },     // media 6, σ² 4
    { id: 'C', preds: ['B'], dist: { kind: 'fixed', d: 4 } }] };
  const r = L.exam(m, { deadline: 12 });
  assert.deepEqual(r.path, ['B', 'C']);
  close(r.var, 4, 1e-12);
  assert.deepEqual(r.ties.map((t) => [t.acts, t.var]), [[['A'], 1]]);
  // Con la misma σ², el primero en orden natural de los ids (aunque B vaya antes en la tabla).
  const same = L.exam({ acts: [{ id: 'B', preds: [], dist: { kind: 'normal', mu: 5, var: 1 } },
    { id: 'A', preds: [], dist: { kind: 'normal', mu: 5, var: 1 } }] }, { deadline: 6 });
  assert.deepEqual(same.path, ['A']);
});

test('T006: σ² = 0 en el camino crítico: P es 0 o 1 y se marca degenerate', () => {
  const m = { acts: [{ id: 'A', preds: [], dist: { kind: 'fixed', d: 5 } }, { id: 'B', preds: ['A'], dist: { kind: 'pert', a: 3, m: 3, b: 3 } }] };
  const r = L.exam(m, { deadline: 8 });
  assert.equal(r.degenerate, true); assert.equal(r.exact, 1); assert.equal(r.z, null);
  assert.equal(L.exam(m, { deadline: 7.9 }).exact, 0);
  assert.equal(L.exam(m, { prob: 0.9 }).deadline, 8);
});

test('T006: la traza del cálculo de examen lleva sus valores en orden (camino → μ → σ² → z → P; al revés, p → z → plazo)', () => {
  const m = L.fromExample(X.get('kl'));
  const tr = L.trace(m, { deadline: 25 });
  assert.deepEqual(tr.map((s) => s.kind), ['tcl.path', 'tcl.mu', 'tcl.var', 'tcl.z', 'tcl.p']);
  const r = L.exam(m, { deadline: 25 });
  assert.deepEqual(tr[1].values, [{ field: 'unc.mu', value: r.mu }]);
  assert.deepEqual(tr[2].values, [{ field: 'unc.var2', value: r.var }]);
  assert.deepEqual(tr[3].values, [{ field: 'unc.z', value: r.z, alt: 0.41 }]);
  assert.deepEqual(tr[4].values, [{ field: 'unc.p', value: r.exact, alt: 0.6591 }]);
  const inv = L.trace(m, { prob: 0.95 });
  assert.deepEqual(inv.map((s) => s.kind), ['tcl.path', 'tcl.mu', 'tcl.var', 'tcl.zFor', 'tcl.deadline']);
  const deg = L.trace({ acts: [{ id: 'A', preds: [], dist: { kind: 'fixed', d: 5 } }] }, { deadline: 6 });
  assert.deepEqual(deg.map((s) => s.kind), ['tcl.path', 'tcl.mu', 'tcl.var', 'tcl.degenerate']);
});

test('T006: el modelo de simulación del proyecto entero: Klastorin simulado < 0,658 (AC7)', () => {
  const m = L.fromExample(X.get('kl'));
  for (const us of [1, 2, 3, 4, 5]) {
    const s = S.summary(S.run({ kind: 'project', model: L.simModel(m), n: 10000, us }).durations);
    assert.ok(s.pLE(25) < 0.658 - 3 * se(0.6, 10000), `semilla ${us}: ${s.pLE(25)}`);
  }
  assert.throws(() => L.simModel({ acts: [{ id: 'A', preds: ['B'], dist: { kind: 'fixed', d: 1 } }, { id: 'B', preds: ['A'], dist: { kind: 'fixed', d: 1 } }] }));
});

test('T006: fusión de caminos: la simulada queda dentro de 3 errores estándar de la cuenta exacta en 20 semillas (AC6)', () => {
  for (let us = 1; us <= 20; us++) {
    const c = L.cases.merge({ n: 1 + (us % 6), slack: us % 4 });
    const p = S.summary(S.run({ kind: 'paths', model: { paths: c.paths }, n: 10000, us }).durations).pLE(c.deadline);
    assert.ok(Math.abs(p - c.exact) <= 3 * se(c.exact, 10000), `semilla ${us}: ${p} frente a ${c.exact}`);
  }
});

test('T006: fusión de caminos: más caminos o menos holgura → la simulada no sube; la normal no cambia (AC8)', () => {
  const sim = (c, us) => S.summary(S.run({ kind: 'paths', model: { paths: c.paths }, n: 10000, us }).durations).pLE(c.deadline);
  const base = L.cases.merge({ n: 1, slack: 0 });
  let prev = Infinity;
  for (const n of [1, 2, 4, 8]) {
    const c = L.cases.merge({ n, slack: 1 });
    assert.deepEqual(c.normal, base.normal); assert.equal(c.deadline, base.deadline);
    const p = sim(c, 31); assert.ok(p <= prev + 3 * se(p, 10000), `n = ${n}: ${p}`); prev = p;
  }
  prev = -Infinity;
  for (const slack of [0, 1, 2, 4, 8]) {
    const p = sim(L.cases.merge({ n: 4, slack }), 32); assert.ok(p >= prev - 3 * se(p, 10000), `holgura ${slack}: ${p}`); prev = p;
  }
  assert.ok(sim(L.cases.merge({ n: 8, slack: 0 }), 33) < 0.5 * base.exact);
});

test('T006: otros límites del TCL: la distancia KS es mayor en el extremo de cada deslizador (AC9)', () => {
  const ks = (c, us) => S.summary(S.run({ kind: 'paths', model: { paths: c.paths }, n: 20000, us }).durations).ks(c.normal.mu, Math.sqrt(c.normal.var));
  for (const us of [41, 42, 43]) {
    assert.ok(ks(L.cases.few({ k: 1 }), us) > ks(L.cases.few({ k: 30 }), us) + 0.02, 'pocas actividades');
    assert.ok(ks(L.cases.skew({ s: 1 }), us) > ks(L.cases.skew({ s: 0 }), us) + 0.02, 'asimetría');
    assert.ok(ks(L.cases.corr({ rho: 0.9 }), us) > ks(L.cases.corr({ rho: 0 }), us) + 0.02, 'correlación');
  }
  assert.throws(() => L.cases.few({ k: 0 }));
  assert.throws(() => L.cases.corr({ rho: 2 }));
});

// ---------- Revisión de nivel 2 de la F4a (T017, ronda 1) ----------

// k rombos en serie: S_i (1, 1, 1) → X_i (5, 5, 5) | Y_i (2, 5, 8) → S_{i+1} … → Z. Todos los caminos son críticos (2^k).
function diamonds(k, reversed) {
  const pert = (a, m, b) => ({ kind: 'pert', a, m, b });
  const acts = []; let prev = null;
  for (let i = 0; i < k; i++) {
    const s = { id: `S${i}`, preds: prev || [], dist: pert(1, 1, 1) };
    const x = { id: `X${i}`, preds: [s.id], dist: pert(5, 5, 5) };
    const y = { id: `Y${i}`, preds: [s.id], dist: pert(2, 5, 8) };
    acts.push(s, ...(reversed ? [y, x] : [x, y])); prev = [x.id, y.id];
  }
  acts.push({ id: 'Z', preds: prev, dist: pert(1, 1, 1) });
  return { acts };
}

test('F4a r1 (F1, F2): con más de 50 caminos críticos, el de mayor σ² es el de verdad y los demás se cuentan; paths no lanza', () => {
  for (const reversed of [false, true]) {
    const e = L.exam(diamonds(7, reversed), { deadline: 50 });   // 128 caminos críticos de media 42
    assert.equal(e.var, 7, 'el de todas las Y');
    assert.deepEqual(e.path, ['S0', 'Y0', 'S1', 'Y1', 'S2', 'Y2', 'S3', 'Y3', 'S4', 'Y4', 'S5', 'Y5', 'S6', 'Y6', 'Z']);
    assert.equal(e.tiesCount, 127);
    assert.ok(e.ties.length >= 49 && e.ties.length <= 50, 'se nombran los que lista cpm');
    const p = L.paths(diamonds(7, reversed), 50);
    assert.deepEqual([p.list, p.count, p.independent, p.product], [null, 128, false, null]);
  }
  // Con 32 caminos (los lista cpm) da lo mismo que antes, y la lista está entera.
  const e5 = L.exam(diamonds(5), { deadline: 40 });
  assert.deepEqual([e5.var, e5.ties.length, e5.tiesCount], [5, 31, 31]);
  const p5 = L.paths(diamonds(5), 40);
  assert.deepEqual([p5.list.length, p5.count], [32, 32]);
});

test('F4a r1 (F14): empates de σ² en orden natural (A2 antes que A10) y todos los demás críticos en la lista', () => {
  const act = (id) => ({ id, preds: [], dist: { kind: 'pert', a: 1, m: 2, b: 3 } });
  const e = L.exam({ acts: [act('A10'), act('A2'), act('B')] }, { deadline: 3 });
  assert.deepEqual(e.path, ['A2']);
  assert.deepEqual(e.ties.map((x) => x.acts), [['A10'], ['B']]);
  assert.equal(e.tiesCount, 2);
});

test('F4a r1 (F7): el plazo de tabla para una probabilidad menor que 0,5 (Hillier, 0,05): z = −1,64 y 39,08', () => {
  const e = L.exam(L.fromExample(X.get('hl')), { prob: 0.05 });
  close(e.z, -1.6449, 1e-4);
  assert.deepEqual(e.table, { z2: -1.64, deadline: 39.08 });
  close(e.deadline, 39.0654, 1e-4);
});

test('F4a r1 (F8): la normal de pocas actividades, asimetría y correlación usa los momentos de la beta-PERT y el plazo μ + σ', () => {
  const T = require('../js/core/threept.js');
  for (const [c, k, d] of [[L.cases.few({ k: 1 }), 1, { a: 0, m: 0, b: 12 }], [L.cases.few({ k: 7 }), 7, { a: 0, m: 0, b: 12 }],
    [L.cases.skew({ s: 0.5 }), 3, { a: 0, m: 3, b: 12 }], [L.cases.corr({ rho: 0.5 }), 10, { a: 0, m: 6, b: 12 }]]) {
    const m = T.moments('pert', d);
    assert.equal(c.paths[0].acts.length, k);
    close(c.normal.mu, k * m.mean, 1e-12); close(c.normal.var, k * m.var, 1e-12);
    close(c.deadline, c.normal.mu + Math.sqrt(c.normal.var), 1e-12);
  }
  // (0, 0, 12): la varianza de la beta-PERT es 20/7 = 2,857, no la de examen (4).
  close(L.cases.few({ k: 1 }).normal.var, 20 / 7, 1e-12);
});
