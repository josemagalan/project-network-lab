'use strict';
// core/crash: compresión coste–tiempo (spec f5b-coste-tiempo, AC1–AC3 y AC8; plan §0, §3, P1–P3; T004).
// Las cifras de referencia vienen de la tabla de la spec, calculada aparte en spikes/f5b-coste-tiempo/ (refs.py,
// fail.py, ct.js): T. Klastorin, Gestión de proyectos, cap. 5, figuras 5.8–5.13 (Tema 6c de J. M. Galán, UBU,
// diapositivas 10–16) y J. M. Nicholas y H. Steyn, Project Management for Engineering, Business and Technology,
// 4.ª ed., cap. 7, §7.1 (figura 7.3 y tabla 7.1). Los oráculos (fuerza bruta y enumeración) están en este archivo.
const test = require('node:test');
const assert = require('node:assert/strict');
const K = require('../js/core/crash.js');
const X = require('../js/core/crashex.js');
const C = require('../js/core/cpm.js');
const P = require('../js/core/project.js');
const E = require('../js/core/examples.js');
const R = require('../js/core/rng.js');

const row = (id, links, dn, dc, cn, cc) => ({ id, links, dn: String(dn), dc: String(dc), cn: String(cn), cc: String(cc) });
const ok = (rs) => { const { project, report } = K.parse(rs); assert.deepEqual(report.errors, []); return project; };
const codes = (rs) => K.parse(rs).report.errors.map((e) => e.code);
const ex = (id) => ok(X.get(id).rows);
const normal = (p) => Object.fromEntries(p.activities.map((a) => [a.id, a.dn]));
const crashed = (p) => Object.fromEntries(p.activities.map((a) => [a.id, a.dc]));

// ---------- Oráculos ----------

// Duración del proyecto con duraciones d (pasada hacia delante simple, independiente de core/cpm).
function length(p, d) {
  const EF = {};
  for (const a of p.activities) EF[a.id] = Math.max(0, ...p.preds[a.id].map((x) => EF[x])) + d[a.id];
  return Math.max(...Object.values(EF));
}
// Coste directo mínimo a duración ≤ T, enumerando todas las duraciones entre la urgente y la normal.
function brute(p, T) {
  let best = null; const d = {}; const acts = p.activities;
  const go = (k) => {
    if (k === acts.length) {
      if (length(p, d) <= T + 1e-9) { const c = acts.reduce((s, a) => s + a.cn + a.b * (a.dn - d[a.id]), 0); if (best === null || c < best - 1e-12) best = c; }
      return;
    }
    const a = acts[k]; for (let v = a.dc; v <= a.dn; v++) { d[a.id] = v; go(k + 1); }
  };
  go(0); return best;
}
// Todos los caminos críticos con las duraciones d (independiente de core/crash).
function critPaths(p, d) {
  const ES = {}; const EF = {}; for (const a of p.activities) { ES[a.id] = Math.max(0, ...p.preds[a.id].map((x) => EF[x])); EF[a.id] = ES[a.id] + d[a.id]; }
  const T = Math.max(...Object.values(EF)); const out = [];
  const LF = {}; const LS = {};
  for (const a of [...p.activities].reverse()) { LF[a.id] = Math.min(T, ...p.succs[a.id].map((s) => LS[s])); LS[a.id] = LF[a.id] - d[a.id]; }
  const crit = (id) => Math.abs(LS[id] - ES[id]) < 1e-9;
  const go = (id, path) => {
    path = path.concat(id);
    if (Math.abs(EF[id] - T) < 1e-9) out.push(path);
    for (const s of p.succs[id]) if (crit(s) && Math.abs(ES[s] - EF[id]) < 1e-9) go(s, path);
  };
  for (const a of p.activities) if (crit(a.id) && ES[a.id] < 1e-9) go(a.id, []);
  return out;
}
// El conjunto de críticas acortables más barato que corta todos los caminos críticos, por enumeración.
function cheapestCut(p, d) {
  const paths = critPaths(p, d); const cand = [...new Set(paths.flat())].filter((id) => d[id] > p.byId[id].dc);
  let best = null; let count = 0;
  for (let mask = 1; mask < (1 << cand.length); mask++) {
    const S = cand.filter((_, k) => (mask >> k) & 1);
    if (!paths.every((path) => path.some((x) => S.includes(x)))) continue;
    const c = S.reduce((s, id) => s + p.byId[id].b, 0);
    if (best === null || c < best - 1e-9) { best = c; count = 1; } else if (Math.abs(c - best) < 1e-9) count++;
  }
  return { cost: best, count };
}
// Tabla al azar con semilla (core/rng; plan §5 y `analyze` B6).
function randomTable(r, nMin, nMax) {
  const n = R.int(r, nMin, nMax); const rows = [];
  for (let i = 0; i < n; i++) {
    const id = 'ABCDEFGHIJ'[i]; const dn = R.int(r, 1, 7); const dc = Math.max(0, dn - R.int(r, 0, 3)); const cn = R.int(r, 0, 20);
    const links = [...Array(i).keys()].filter(() => r() < 0.45).map((j) => 'ABCDEFGHIJ'[j]).join(', ');
    rows.push(row(id, links, dn, dc, cn, cn + R.int(r, 0, 6) * (dn - dc)));
  }
  return ok(rows);
}

// ---------- Lectura (P1, AC8) ----------

test('F5b T004: lectura de una tabla válida: orden, predecesoras, dos puntos y pendiente', () => {
  const p = ex('kl');
  assert.deepEqual(p.activities.map((a) => [a.id, a.dn, a.dc, a.cn, a.cc, a.b]), [['A', 7, 5, 60, 76, 8], ['B', 6, 4, 85, 95, 5], ['C', 15, 13, 55, 75, 10], ['D', 10, 8, 120, 128, 4]]);
  assert.deepEqual(p.preds.C, ['A', 'B']);
  assert.deepEqual(p.succs.B, ['C', 'D']);
  assert.equal(p.byId.D.b, 4);
});

test('F5b T004: costes con coma decimal, pendiente 0 sin acortamiento y pendiente 0 con acortamiento gratis (aclaración)', () => {
  const p = ok([row('A', '', 4, 2, '10,5', '13,5'), row('B', 'A', 3, 3, 7, 7), row('C', 'A', 5, 3, 2, 2)]);
  assert.equal(p.byId.A.cn, 10.5); assert.equal(p.byId.A.b, 1.5);
  assert.equal(p.byId.B.b, 0);
  assert.equal(p.byId.C.b, 0); assert.equal(p.byId.C.dc, 3);
});

test('F5b T004: errores por fila: badDuration, badCrash, badCost, costOrder', () => {
  assert.deepEqual(codes([row('A', '', '4.5', 2, 1, 2)]), ['badDuration']);
  assert.deepEqual(codes([row('A', '', 'x', 2, 1, 2)]), ['badDuration']);
  assert.deepEqual(codes([row('A', '', 4, 5, 1, 2)]), ['badCrash']);
  assert.deepEqual(codes([row('A', '', 4, '1.5', 1, 2)]), ['badCrash']);
  assert.deepEqual(codes([row('A', '', 4, '-1', 1, 2)]), ['badCrash']);
  assert.deepEqual(codes([row('A', '', 4, 2, 'x', 2)]), ['badCost']);
  assert.deepEqual(codes([row('A', '', 4, 2, 1, '-2')]), ['badCost']);
  assert.deepEqual(codes([row('A', '', 4, 2, 5, 3)]), ['costOrder']);
  // Solo alguno de los tres vacío: error en ese campo (P1).
  assert.deepEqual(codes([row('A', '', 4, '', 1, 2)]), ['badCrash']);
  assert.deepEqual(codes([row('A', '', 4, 2, 1, '')]), ['badCost']);
  const e = K.parse([row('A', '', 4, 2, 1, 2), row('B', 'A', 3, 4, 1, 2)]).report.errors;
  assert.deepEqual(e, [{ code: 'badCrash', row: 1, ids: ['B'] }]);
});

test('F5b T004: los errores de estructura de core/project (id, repetida, desconocida, ciclo, 30 actividades)', () => {
  assert.deepEqual(codes([row('a b', '', 4, 2, 1, 2)]), ['badId']);
  assert.deepEqual(codes([row('A', '', 4, 2, 1, 2), row('A', '', 3, 2, 1, 2)]), ['duplicateId']);
  assert.deepEqual(codes([row('A', 'Z', 4, 2, 1, 2)]), ['unknownRef']);
  assert.deepEqual(codes([row('A', 'B', 4, 2, 1, 2), row('B', 'A', 3, 2, 1, 2)]), ['cycle']);
  const many = Array.from({ length: 31 }, (_, i) => row(`A${i}`, '', 2, 1, 1, 2));
  assert.deepEqual(codes(many), ['tooMany']);
  // Un error de campo y otro de estructura salen juntos, ordenados por fila.
  assert.deepEqual(codes([row('A', 'Z', 4, 2, 1, 2), row('B', '', 4, 5, 1, 2)]), ['unknownRef', 'badCrash']);
  // Filas vacías: se saltan; tabla vacía, ni proyecto ni errores.
  assert.deepEqual(K.parse([row('', '', '', '', '', '')]), { project: null, report: { errors: [], warnings: [] } });
});

test('F5b T004: aviso noCrash (dc, cn y cc vacíos): urgente = normal y costes 0; la fila se calcula', () => {
  const { project, report } = K.parse([row('A', '', 4, '', '', ''), row('B', 'A', 3, 2, 1, 3)]);
  assert.deepEqual(report.errors, []);
  assert.deepEqual(report.warnings, [{ code: 'noCrash', row: 0, ids: ['A'] }]);
  assert.deepEqual([project.byId.A.dc, project.byId.A.cn, project.byId.A.cc, project.byId.A.b], [4, 0, 0, 0]);
});

// ---------- Calendario (`analyze` B4) ----------

test('F5b T004: con las duraciones normales, schedule da lo mismo que core/cpm (ejemplos y 500 tablas al azar)', () => {
  const same = (p) => {
    const s = K.schedule(p, normal(p));
    const proj = P.parse(p.activities.map((a) => ({ id: a.id, duration: String(a.dn), links: p.preds[a.id].join(', ') })), 'pred').project;
    const c = C.solve(proj);
    assert.equal(s.T, c.duration);
    assert.deepEqual(s.critical, c.critical);
    for (const a of p.activities) { assert.equal(s.times[a.id].ES, c.times[a.id].ES); assert.equal(s.times[a.id].LF, c.times[a.id].LF); }
  };
  for (const e of X.list()) same(ex(e.id));
  for (const e of E.list().filter((x) => x.rows.every((r) => /^\d+$/.test(String(r.duration))) && x.mode !== 'succ')) {
    same(ok(e.rows.map((r) => row(r.id, r.links, r.duration, r.duration, 0, 0))));
  }
  const r = R.mulberry32(20261125);
  for (let i = 0; i < 500; i++) same(randomTable(r, 2, 8));
});

// ---------- Referencias (AC1) ----------

const ruleTable = (p) => K.rule(p).filter((s) => !s.end).map((s) => [s.T, s.set.join('+'), s.cost, s.opt]);

test('F5b T004: Klastorin (figura 5.9): 22 → 18 semanas, 320, 328 (A), 338 (C), 348 (C), 361 (A y B); regla = óptimo', () => {
  const p = ex('kl');
  assert.deepEqual(ruleTable(p), [[21, 'A', 328, 328], [20, 'C', 338, 338], [19, 'C', 348, 348], [18, 'A+B', 361, 361]]);
  const end = K.rule(p).at(-1);
  assert.equal(end.end, true); assert.equal(end.T, 18);
  assert.deepEqual(end.path, ['A', 'C']); // A–C ya no se puede acortar
  assert.deepEqual(K.curve(p).map((o) => [o.T, o.cost]), [[22, 320], [21, 328], [20, 338], [19, 348], [18, 361]]);
  // El óptimo de 19 semanas (figura 5.13): A en 6 y C en 13.
  assert.deepEqual(K.optimum(p, 19).d, { A: 6, B: 6, C: 13, D: 10 });
});

test('F5b T004: Nicholas (tabla 7.1): 22 → 15 semanas, de 55 a 86 K$, con A, A, A y E, G, G, G y C, D y E', () => {
  const p = ex('ni');
  assert.deepEqual(ruleTable(p), [[21, 'A', 57, 57], [20, 'A', 59, 59], [19, 'A+E', 63, 63], [18, 'G', 68, 68], [17, 'G', 73, 73], [16, 'G', 78, 78], [15, 'C+D+E', 86, 86]]);
  assert.equal(K.rule(p).at(-1).T, 15);
});

test('F5b T004: la regla que falla: 60, 63 (D), 68 (C y D), 75 (D y E), 85 (A y B) y 95 frente al óptimo 83 y 93', () => {
  const p = ex('rf');
  assert.deepEqual(ruleTable(p), [[11, 'D', 63, 63], [10, 'C+D', 68, 68], [9, 'D+E', 75, 75], [8, 'A+B', 85, 83], [7, 'A+B', 95, 93]]);
  const s8 = K.rule(p).find((s) => s.T === 8);
  assert.equal(s8.unique, false); assert.deepEqual(s8.other, ['B', 'E']); // A y B, o B y E (spec)
  assert.equal(s8.above, true);
});

// ---------- Propiedades (AC2, AC3) ----------

test('F5b T004: el óptimo es el de la fuerza bruta en todas las duraciones de 2000 tablas al azar; la curva es convexa', () => {
  const r = R.mulberry32(5);
  for (let i = 0; i < 2000; i++) {
    const p = randomTable(r, 3, 7);
    const cur = K.curve(p);
    assert.equal(cur[0].T, length(p, normal(p)));
    assert.equal(cur.at(-1).T, length(p, crashed(p)));
    for (const o of cur) {
      assert.ok(Math.abs(o.cost - brute(p, o.T)) < 1e-6, `tabla ${i}, T ${o.T}: ${o.cost} frente a ${brute(p, o.T)}`);
      assert.ok(length(p, o.d) <= o.T, `tabla ${i}: el óptimo de ${o.T} dura ${length(p, o.d)}`);
      for (const a of p.activities) assert.ok(Number.isInteger(o.d[a.id]) && o.d[a.id] >= a.dc && o.d[a.id] <= a.dn);
    }
    const inc = cur.slice(1).map((o, k) => o.cost - cur[k].cost);
    inc.forEach((v, k) => { assert.ok(v >= -1e-9); if (k) assert.ok(v >= inc[k - 1] - 1e-9, `tabla ${i}: no convexa`); });
  }
});

test('F5b T004: la regla, en 3000 tablas al azar: el corte más barato, una unidad por paso, nunca bajo el óptimo, fin correcto y empates', () => {
  const r = R.mulberry32(77);
  for (let i = 0; i < 3000; i++) {
    const p = randomTable(r, 3, 7);
    const d = normal(p);
    let T = length(p, d);
    for (;;) {
      const cut = K.ruleCut(p, d);
      const enumd = cheapestCut(p, d);
      if (!cut) { assert.equal(enumd.cost, null, `tabla ${i}: la regla para y hay un corte`); break; }
      assert.ok(Math.abs(cut.cost - enumd.cost) < 1e-9, `tabla ${i}: corte ${cut.cost} frente a ${enumd.cost}`);
      assert.equal(cut.unique, enumd.count === 1, `tabla ${i}: empate`);
      const paths = critPaths(p, d);
      assert.ok(paths.every((path) => path.some((x) => cut.set.includes(x))), `tabla ${i}: un camino crítico sin cortar`);
      for (const id of cut.set) { assert.ok(d[id] > p.byId[id].dc); d[id] -= 1; }
      assert.equal(length(p, d), T - 1, `tabla ${i}: el paso no acorta una unidad`);
      T -= 1;
    }
    for (const s of K.rule(p)) if (!s.end) assert.ok(s.cost >= s.opt - 1e-9, `tabla ${i}: la regla bajo el óptimo`);
  }
});

// ---------- Movimiento, atajo y costes totales (T006: AC1, AC4–AC6) ----------

test('F5b T006: la regla que falla, de 9 a 8: el óptimo acorta B y E y vuelve a alargar C (6 + 4 − 2 = 8, frente a 10)', () => {
  const p = ex('rf');
  const s9 = K.rule(p).find((s) => s.T === 9);
  assert.deepEqual(s9.d, { A: 5, B: 4, C: 1, D: 5, E: 4 });
  const mv = K.move(p, s9.d, 8);
  assert.deepEqual(mv, { shorten: ['B', 'E'], lengthen: ['C'], cost: 8 });
  const steps = K.rule(p);
  const s8 = steps.find((s) => s.T === 8); const s7 = steps.find((s) => s.T === 7);
  assert.deepEqual(s8.move, mv);                    // solo en la primera duración por encima (AC4, `analyze` B1)
  assert.equal(s7.above, true); assert.equal(s7.move, undefined);
  for (const e of ['kl', 'ni']) assert.ok(K.rule(ex(e)).every((s) => !s.move && !s.above), e);
});

test('F5b T006: atajo de Nicholas: todo urgente 104 → 86 alargando B tres semanas, E dos y D una; igual que el óptimo', () => {
  const sc = K.shortcut(ex('ni'));
  assert.equal(sc.T, 15); assert.equal(sc.crashCost, 104); assert.equal(sc.cost, 86); assert.equal(sc.opt, 86); assert.equal(sc.above, false);
  assert.deepEqual(sc.units, { B: 3, E: 2, D: 1 });
  // De una en una, la de mayor pendiente que no alarga el proyecto: D (5) primero; después B (3) y E (2).
  assert.deepEqual(sc.steps.map((s) => s.id), ['D', 'B', 'B', 'B', 'E', 'E']);
  assert.deepEqual(sc.steps.map((s) => s.saving), [5, 3, 3, 3, 2, 2]);
  assert.deepEqual(sc.d, { A: 6, B: 8, C: 4, D: 7, E: 5, F: 5, G: 2 });
  const kl = K.shortcut(ex('kl'));
  assert.deepEqual([kl.T, kl.crashCost, kl.cost, kl.above], [18, 374, 361, false]);
});

test('F5b T006: costes totales y duración de coste mínimo (figuras 5.13, 7.6 y 7.7)', () => {
  const tot = (id) => K.totals(ex(id), X.get(id).k).map((t) => [t.T, t.total]);
  assert.deepEqual(tot('kl'), [[22, 489], [21, 485], [20, 483], [19, 481], [18, 487]]);
  assert.deepEqual(tot('ni'), [[22, 131], [21, 130], [20, 129], [19, 130], [18, 132], [17, 134], [16, 136], [15, 141]]);
  assert.deepEqual(tot('nip'), [[22, 135], [21, 133], [20, 131], [19, 131], [18, 132], [17, 132], [16, 132], [15, 135]]);
  for (const e of X.list()) assert.deepEqual(K.best(ex(e.id), e.k), e.expected.best, e.id);
  const k19 = K.totals(ex('kl'), X.get('kl').k).find((t) => t.T === 19);
  assert.deepEqual(k19, { T: 19, direct: 348, ind: 133, pen: 0, bonus: 0, total: 481 });
  const n15 = K.totals(ex('nip'), X.get('nip').k).find((t) => t.T === 15);
  assert.deepEqual(n15, { T: 15, direct: 86, ind: 55, pen: 0, bonus: 6, total: 135 });
  // Sin costes del proyecto, la duración normal (spec, Behaviour).
  assert.deepEqual(K.best(ex('rf'), {}), [12]);
});

// Semillas de tablas al azar (randomTable con mulberry32(semilla), de 4 a 7 actividades) en las que la regla queda
// por encima del óptimo: las 20 primeras, buscadas fuera de la prueba porque pasa en una de cada ~4000 (plan §5).
const RULE_FAILS = [1153, 7657, 13954, 24879, 25401, 29747, 29995, 31682, 32475, 36973, 38439, 46488, 50220, 53587, 57022, 57838, 63925, 70878, 75324, 79025];

test('F5b T006: en las 20 tablas en que la regla falla, el movimiento de ±1 llega al óptimo y vuelve a alargar algo', () => {
  for (const seed of RULE_FAILS) {
    const p = randomTable(R.mulberry32(seed), 4, 7);
    const steps = K.rule(p);
    const first = steps.find((s) => s.above);
    assert.ok(first && first.move, `semilla ${seed}: la regla no falla`);
    assert.ok(Math.abs(first.cost - first.stepCost + first.move.cost - first.opt) < 1e-9, `semilla ${seed}: el movimiento no da el óptimo`);
    assert.ok(first.move.lengthen.length > 0, `semilla ${seed}: el movimiento no alarga nada`);
    assert.equal(steps.filter((s) => s.move).length, 1, `semilla ${seed}: más de un movimiento`);
    // Desde el estado anterior, el movimiento cumple la duración.
    const prev = steps[steps.indexOf(first) - 1]; const base = prev ? prev.d : K.normalD(p);
    const d = Object.assign({}, base);
    for (const id of first.move.shorten) d[id] -= 1;
    for (const id of first.move.lengthen) d[id] += 1;
    assert.ok(length(p, d) <= first.T, `semilla ${seed}: el movimiento no llega a ${first.T}`);
  }
});

test('F5b T006: el atajo llega a la duración mínima y nunca baja del óptimo (1000 tablas); la semilla 370 queda por encima', () => {
  const r = R.mulberry32(91);
  for (let i = 0; i < 1000; i++) {
    const p = randomTable(r, 3, 7); const sc = K.shortcut(p);
    assert.equal(sc.T, length(p, crashed(p)));
    assert.equal(length(p, sc.d), sc.T);
    assert.ok(sc.cost >= sc.opt - 1e-9, `tabla ${i}: el atajo bajo el óptimo`);
    assert.equal(sc.above, sc.cost > sc.opt + 1e-9);
  }
  const sc = K.shortcut(randomTable(R.mulberry32(370), 4, 7));
  assert.equal(sc.above, true);
  assert.ok(sc.cost > sc.opt);
});
