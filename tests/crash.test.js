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
// Con la cobertura (NODE_V8_COVERAGE) el código va instrumentado y más lento: los tiempos límite solo se miran sin ella, como en mc y sim.
const TIMED = !process.env.NODE_V8_COVERAGE;

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

// ---------- Traza y corrección del conjunto (T007: AC4, AC7; plan P9, `analyze` B3) ----------

test('F5b T007: traza de Klastorin: tabla, cuatro pasos con su conjunto y su coste, fin y costes totales', () => {
  const p = ex('kl'); const tr = K.trace(p, X.get('kl').k);
  assert.deepEqual(tr.map((s) => s.kind), ['ctTable', 'ctStep', 'ctStep', 'ctStep', 'ctStep', 'ctEnd', 'ctTotals']);
  assert.deepEqual([tr[0].T, tr[0].cost, tr[0].paths], [22, 320, [['A', 'C']]]);
  const s1 = tr[1];
  assert.deepEqual([s1.from, s1.T, s1.set, s1.stepCost, s1.cost], [22, 21, ['A'], 8, 328]);
  assert.deepEqual(s1.cand, [{ id: 'A', b: 8, can: true }, { id: 'C', b: 10, can: true }]);
  assert.deepEqual(s1.reveals.map((r) => r.field), ['ct.set', 'ct.cost']);
  assert.deepEqual(s1.reveals[0].value, ['A']); assert.equal(s1.reveals[1].value, 8);
  assert.deepEqual(tr[2].paths, [['A', 'C'], ['B', 'C']]);  // a 21 semanas, dos caminos críticos
  assert.deepEqual(tr[4].reached, ['A']);          // B queda en 5 (su urgente es 4)
  assert.deepEqual([tr[5].T, tr[5].cost, tr[5].path], [18, 361, ['A', 'C']]);
  assert.deepEqual(tr[6].best, [19]);
  assert.equal(tr[6].rows.find((x) => x.T === 19).total, 481);
  // Sin costes del proyecto no hay paso de totales.
  assert.deepEqual(K.trace(ex('rf'), {}).map((s) => s.kind).slice(-2), ['ctStep', 'ctEnd']);
});

test('F5b T007: traza de la regla que falla: el paso de 9 a 8 lleva el aviso y el movimiento; el de 8 a 7, solo la marca', () => {
  const tr = K.trace(ex('rf'), {});
  const s8 = tr.find((s) => s.kind === 'ctStep' && s.T === 8); const s7 = tr.find((s) => s.kind === 'ctStep' && s.T === 7);
  assert.equal(s8.above, true); assert.deepEqual(s8.move, { shorten: ['B', 'E'], lengthen: ['C'], cost: 8 });
  assert.equal(s8.opt, 83); assert.equal(s8.cost, 85);
  assert.equal(s7.above, true); assert.equal(s7.move, undefined); assert.equal(s7.opt, 93);
  assert.equal(s8.unique, false); assert.deepEqual(s8.other, ['B', 'E']);
});

test('F5b T007: setCheck: acierto con cualquiera de los empatados; no crítica, en su punto urgente, camino sin cortar y más caro', () => {
  const p = ex('kl');
  // A 21 semanas (A en 6): caminos A–C y B–C. Lo más barato: C (10); A y B cuestan 13.
  const d21 = { A: 6, B: 6, C: 15, D: 10 };
  assert.deepEqual(K.checkSet(p, d21, ['C']), { ok: true, cost: 10 });
  assert.deepEqual(K.checkSet(p, d21, ['D']), { ok: false, reason: 'notCritical', ids: ['D'] });
  assert.deepEqual(K.checkSet(p, d21, ['B']), { ok: false, reason: 'pathUncut', path: ['A', 'C'] });
  assert.deepEqual(K.checkSet(p, d21, ['A', 'B']), { ok: false, reason: 'dearer', cost: 13, best: 10 });
  assert.deepEqual(K.checkSet(p, d21, []), { ok: false, reason: 'pathUncut', path: ['A', 'C'] });
  // En su punto urgente: a 19 semanas C ya está en 13.
  assert.deepEqual(K.checkSet(p, { A: 6, B: 6, C: 13, D: 10 }, ['C']), { ok: false, reason: 'atLimit', ids: ['C'] });
  // Empate (la regla que falla, de 9 a 8): A y B o B y E, los dos valen.
  const rf = ex('rf'); const d9 = { A: 5, B: 4, C: 1, D: 5, E: 4 };
  assert.deepEqual(K.checkSet(rf, d9, ['A', 'B']), { ok: true, cost: 10 });
  assert.deepEqual(K.checkSet(rf, d9, ['B', 'E']), { ok: true, cost: 10 });
  // setCheck trabaja con los datos del paso (lo que usa predict).
  const step = K.trace(rf, {}).find((s) => s.kind === 'ctStep' && s.T === 8);
  assert.deepEqual(K.setCheck(step.reveals[0].check, ['E', 'B']), { ok: true, cost: 10 });
  assert.deepEqual(K.setCheck(step.reveals[0].check, ['B']), { ok: false, reason: 'pathUncut', path: ['A', 'E'] });
});

test('F5b T007: en 1000 tablas al azar, el conjunto de la regla siempre acierta y quitarle una actividad nunca', () => {
  const r = R.mulberry32(333);
  for (let i = 0; i < 1000; i++) {
    const p = randomTable(r, 3, 7);
    for (const s of K.trace(p, {}).filter((x) => x.kind === 'ctStep')) {
      const chk = s.reveals[0].check;
      assert.equal(K.setCheck(chk, s.set).ok, true, `tabla ${i}, T ${s.T}`);
      if (!s.unique) assert.equal(K.setCheck(chk, s.other).ok, true, `tabla ${i}, T ${s.T}: el empatado`);
      for (const id of s.set) if (p.byId[id].b > 0) assert.equal(K.setCheck(chk, s.set.filter((x) => x !== id)).ok, false, `tabla ${i}: sin ${id}`);
    }
  }
});

// ---------- Revisión de nivel 2 de la F5b (T019, ronda 1) ----------

test('F5b T019 · N-F4: duraciones de 0 a 999 y como mucho 150 duraciones en la compresión; un enlace enorme no cuelga', () => {
  assert.deepEqual(codes([row('A', '', 1000, 0, 1, 2)]), ['badDuration']);
  assert.deepEqual(codes([row('A', '', '999999999999', 0, 1, 2)]), ['badDuration']);
  assert.deepEqual(codes([row('A', '', 149, 0, 1, 2)]), []);                       // 150 duraciones: vale
  const { project, report } = K.parse([row('A', '', 150, 0, 1, 2)]);
  assert.equal(project, null);
  assert.deepEqual(report.errors, [{ code: 'wide', row: null, ids: [], from: 150, to: 0, n: 151, max: 150 }]);
  assert.deepEqual(codes([row('A', '', 999, 900, 1, 2)]), []);                     // 999 vale (100 duraciones)
  // Por la URL: la tabla llega tal cual y la lectura la rechaza sin calcular nada.
  const U = require('../js/core/urlstate.js');
  const kt = [{ id: 'A', name: '', links: '', dn: '999999999999', dc: '0', cn: '1', cc: '2' }];
  const back = U.decode(U.encode(Object.assign(U.defaults(), { v: 'ct', ke: 'own', kt }))).state.kt;
  assert.deepEqual(codes(back), ['badDuration']);
  // 30 actividades en cadena con 149 unidades que quitar: 150 duraciones (el tope), en poco tiempo.
  const chain = Array.from({ length: 30 }, (_, i) => row(`A${i}`, i ? `A${i - 1}` : '', 10, i ? 5 : 6, 10, 10 + (i % 7) + 1));
  const p = ok(chain);
  const t1 = Date.now();
  assert.equal(K.curve(p).length, 150);
  if (TIMED) assert.ok(Date.now() - t1 < 5000, `curva: ${Date.now() - t1} ms`);
});

test('F5b T019 · N-F1: costes con decimales: pendientes de 0,05 y 0,08, la regla, el «más caro» y la curva a 10⁻⁴', () => {
  let p = ok([row('A', '', 3, 1, 0, '0,10'), row('B', 'A', 3, 1, 0, '0,16')]);
  assert.deepEqual(K.rule(p).map((s) => (s.end ? ['fin', s.T] : [s.T, s.set.join(), s.stepCost, s.cost])),
    [[5, 'A', 0.05, 0.05], [4, 'A', 0.05, 0.1], [3, 'B', 0.08, 0.18], [2, 'B', 0.08, 0.26], ['fin', 2]]);
  assert.deepEqual(K.checkSet(p, { A: 3, B: 3 }, ['B']), { ok: false, reason: 'dearer', cost: 0.08, best: 0.05 });
  assert.deepEqual(K.checkSet(p, { A: 3, B: 3 }, ['A']), { ok: true, cost: 0.05 });
  p = ok([row('A', '', 3, 1, 0, '0.0018'), row('B', 'A', 3, 1, 0, '0.0008')]);
  assert.deepEqual(K.curve(p).map((o) => [o.T, o.cost]), [[6, 0], [5, 0.0004], [4, 0.0008], [3, 0.0017], [2, 0.0026]]);
  assert.equal(K.directCost(ok([row('A', '', 3, 0, 0, 1)]), { A: 0 }), 1);
  assert.equal(K.directCost(ok([row('A', '', 1, 1, '0.0000004', '0.0000004')]), { A: 1 }), 4e-7);   // costes a 10⁻⁹
  // Pendientes que se diferencian en 5 diezmilésimas: el óptimo acorta antes la más barata.
  p = ok([row('A', '', 3, 1, 0, 2), row('B', 'A', 3, 1, 0, '2.001')]);
  assert.deepEqual(K.curve(p).map((o) => [o.T, o.cost]), [[6, 0], [5, 1], [4, 2], [3, 3.0005], [2, 4.001]]);
});

test('F5b T019 · N-F5 y N-F7: pendientes en tercios y séptimos: la regla no queda «por encima» por el redondeo y el empate se acepta', () => {
  // Con aritmética exacta, la regla es óptima en las 12 duraciones (el redondeo de la pendiente la ponía por encima).
  let p = ok([row('A', '', 4, 1, 2, 4), row('B', '', 7, 1, 0, 1), row('C', 'A, B', 6, 0, 9, 14), row('D', '', 7, 1, 9, 12)]);
  const steps = K.rule(p, K.curve(p)).filter((s) => !s.end);
  assert.equal(steps.length, 12);
  assert.deepEqual(steps.filter((s) => s.above).map((s) => s.T), []);
  assert.ok(steps.every((s) => !s.move));
  // C (pendiente 10) frente a A1…A7 tras C (10/7 cada una): los dos cortes cuestan 10.
  const rs = [row('C', '', 4, 3, 0, 10)];
  for (let i = 1; i <= 7; i++) rs.push(row(`A${i}`, 'C', 9, 2, 0, 10));
  p = ok(rs);
  const all = rs.slice(1).map((r) => r.id);
  assert.deepEqual(K.checkSet(p, normal(p), all), { ok: true, cost: 10 });
  const cut = K.ruleCut(p, normal(p));
  assert.deepEqual([cut.set, cut.unique, cut.other], [['C'], false, all]);
  assert.equal(K.best(p, { fixed: 1 }).length, 1);
});

test('F5b T019 · N-F9: con costes de millones, la curva, la regla y el atajo salen como con los mismos costes en unidades', () => {
  const t = [['A', '', 3, 0, 36, 58], ['B', 'A', 5, 4, 14, 15], ['C', '', 4, 0, 29, 57], ['D', 'A, B, C', 5, 4, 34, 54], ['E', 'D', 2, 2, 18, 30], ['F', 'A, D', 3, 0, 24, 50]];
  const small = ok(t.map((r) => row(...r)));
  for (const f of [1e6, 1e7, 1e8, 1e9]) {
    const big = ok(t.map(([id, l, dn, dc, cn, cc]) => row(id, l, dn, dc, cn * f, cc * f)));
    const cs = K.curve(small); const cb = K.curve(big);
    assert.deepEqual(cb.map((o) => o.d), cs.map((o) => o.d), `× ${f}`);
    cb.forEach((o, i) => assert.ok(Math.abs(o.cost / f - cs[i].cost) < 1e-6, `× ${f}, T ${o.T}`));
    assert.deepEqual(K.rule(big, cb).map((s) => s.set || s.path), K.rule(small, cs).map((s) => s.set || s.path));
    assert.deepEqual(K.shortcut(big).d, K.shortcut(small).d);
  }
});

test('F5b T019 · N-F2: el camino que explica el fin es uno que no se puede acortar, también con varios caminos críticos', () => {
  // A–B y A–Z son críticos de 5; B todavía se puede acortar, Z no: el fin lo explica A–Z.
  const p = ok([row('A', '', 2, 2, 0, 0), row('B', 'A', 3, 1, 0, 2), row('Z', 'A', 3, 3, 0, 0)]);
  const end = K.rule(p).at(-1);
  assert.deepEqual([end.end, end.T, end.path], [true, 5, ['A', 'Z']]);
  assert.deepEqual(['kl', 'ni', 'rf'].map((id) => K.rule(ex(id)).at(-1).path), [['A', 'C'], ['A', 'C', 'F'], ['B', 'D']]);
});

test('F5b T019 · N-F3: el movimiento con pendientes en cuartos llega al óptimo (ε por unidad movida, pequeño frente a las pendientes)', () => {
  const p = ok([row('A', '', 1, 1, 5, 5), row('B', 'A', 6, 3, 8, 11), row('C', '', 6, 3, 6, 9), row('D', 'C', 4, 1, 0, '1.5'),
    row('E', 'A, B, C, D', 7, 4, 17, '20.75'), row('F', 'A, C', 7, 4, 19, '23.5'), row('G', 'A, B, C, D, E, F', 4, 2, 0, 5)]);
  const f = K.rule(p).find((s) => s.above);
  assert.deepEqual([f.T, f.cost, f.opt], [16, 59.75, 59.5]);
  assert.deepEqual(f.move, { shorten: ['C', 'E'], lengthen: ['D'], cost: 1.75 });
  assert.equal(f.cost - f.stepCost + f.move.cost, f.opt);
  // Con los costes en cienmilésimas (diferencias de 2,5·10⁻⁶), el ε del movimiento, relativo a la menor pendiente, sigue
  // sin pesar (ronda 2).
  const t = [['A', '', 1, 1, 5, 5], ['B', 'A', 6, 3, 8, 11], ['C', '', 6, 3, 6, 9], ['D', 'C', 4, 1, 0, 1.5], ['E', 'A, B, C, D', 7, 4, 17, 20.75], ['F', 'A, C', 7, 4, 19, 23.5], ['G', 'A, B, C, D, E, F', 4, 2, 0, 5]];
  const small = K.rule(ok(t.map(([id, l, dn, dc, cn, cc]) => row(id, l, dn, dc, cn / 1e5, cc / 1e5)))).find((s) => s.above);
  assert.deepEqual([small.T, small.move.shorten, small.move.lengthen, small.move.cost], [16, ['C', 'E'], ['D'], 0.0000175]);
});

// ---------- Revisión de nivel 2 de la F5b (T019, ronda 2: los arreglos) ----------

test('F5b T019 r2: una actividad de pendiente enorme no estropea el óptimo ni el movimiento de las demás (tolerancia del símplex por columna)', () => {
  const rf = X.get('rf').rows;
  const base = K.rule(ex('rf')).filter((x) => !x.end);
  for (const cc of ['2500000', '9999999', '100000000', '10000000000', '999999999999']) {
    const p = ok(rf.concat([row('Z', '', 1, 0, 0, cc)]));
    assert.deepEqual(K.curve(p).map((o) => o.cost), [60, 63, 68, 75, 83, 93], cc);
    const f = K.rule(p).find((x) => x.above);
    assert.deepEqual([f.T, f.cost, f.opt, f.move], [8, 85, 83, { shorten: ['B', 'E'], lengthen: ['C'], cost: 8 }], cc);
    assert.deepEqual(K.rule(p).filter((x) => !x.end).map((x) => x.set), base.map((x) => x.set), cc);
  }
  const p = ok([row('A', '', 3, 1, 0, 1), row('B', 'A', 3, 1, 0, '1.2'), row('H', '', 1, 0, 0, '999999999')]);
  assert.deepEqual(K.curve(p).map((o) => o.cost), [0, 0.5, 1, 1.6, 2.2]);
  assert.deepEqual(K.best(p, { perUnit: 0.5 }), [4, 5, 6]);   // 3, 3, 3 y 3,1: empate exacto
  // La tabla de N-F3 con una actividad aparte de pendiente 10⁶: el mismo movimiento.
  const q = ok([row('A', '', 1, 1, 5, 5), row('B', 'A', 6, 3, 8, 11), row('C', '', 6, 3, 6, 9), row('D', 'C', 4, 1, 0, '1.5'),
    row('E', 'A, B, C, D', 7, 4, 17, '20.75'), row('F', 'A, C', 7, 4, 19, '23.5'), row('G', 'A, B, C, D, E, F', 4, 2, 0, 5), row('H', '', 1, 0, 0, '1000000')]);
  assert.deepEqual(K.rule(q).find((x) => x.above).move, { shorten: ['C', 'E'], lengthen: ['D'], cost: 1.75 });
  // En la misma cadena que una de pendiente 10¹¹: C (1,67 por unidad) antes que B (2,33) y D, la última.
  const c = ok([row('A', '', 5, 3, 27, '29.5'), row('B', '', 6, 4, 23, '27.6667'), row('C', 'B', 4, 2, 10, '13.3333'), row('D', 'C', 5, 4, 11, '100000000011')]);
  assert.deepEqual(K.curve(c).map((o) => [o.T, o.cost]), [[15, 71], [14, 72.66665], [13, 74.3333], [12, 76.66665], [11, 79], [10, 100000000079]]);
  // El corte con una crítica de pendiente ~10¹²: Q (0,1) antes que P (0,9); la predicción de Q, bien.
  const r = ok([row('H', '', 2, 1, 0, '999999999999'), row('P', 'H', 3, 1, 0, '1.8'), row('Q', 'P', 3, 1, 0, '0.2')]);
  assert.deepEqual(K.ruleCut(r, normal(r)), { set: ['Q'], cost: 0.1, unique: true, other: ['Q'] });
  assert.deepEqual(K.checkSet(r, normal(r), ['Q']), { ok: true, cost: 0.1 });
});

test('F5b T019 r2: tolerancias fijadas: el ruido con costes de 10⁹ no es «por encima», 0,055 sí es más caro que 0,05 y el empate en séptimos con costes de 10¹⁰', () => {
  // Pendientes no decimales con costes de mil millones: ningún paso «por encima».
  const p = ok([row('A', '', 6, 4, 1000000000, '1228571428.5714'), row('B', '', 6, 5, 100000000, '157142857.1429'), row('C', 'B', 3, 0, 900000000, '1033333333.3333'),
    row('D', 'C', 5, 3, 300000000, '314285714.2857'), row('E', 'B, C, D', 4, 3, 0, 1600000000), row('F', 'B, D', 7, 5, 600000000, '714285714.2857')]);
  assert.deepEqual(K.rule(p).filter((x) => x.above).map((x) => x.T), []);
  const q = ok([row('A', '', 3, 1, 0, '0,10'), row('B', 'A', 3, 1, 0, '0,11')]);
  assert.deepEqual(K.checkSet(q, normal(q), ['B']), { ok: false, reason: 'dearer', cost: 0.055, best: 0.05 });
  assert.equal(K.over(1.000001, 1), true);
  assert.equal(K.over(1e9 + 1e-4, 1e9), false);
  const rs = [row('C', '', 4, 3, 0, '10000000000')];
  for (let i = 1; i <= 7; i++) rs.push(row(`A${i}`, 'C', 9, 2, 0, '10000000000'));
  const s = ok(rs);
  const cut = K.ruleCut(s, normal(s));
  assert.deepEqual([cut.set, cut.unique], [['C'], false]);
});

test('F5b T019 r2: el atajo alarga cada actividad lo que le deja su holgura (igual que unidad a unidad, y en poco tiempo con mucho que alargar)', () => {
  // El procedimiento literal de P5, unidad a unidad, como oráculo.
  const unitByUnit = (p) => {
    const d = crashed(p); const T = length(p, d);
    const order = p.activities.map((a, i) => [a, i]).sort((x, y) => y[0].b - x[0].b || x[1] - y[1]).map((x) => x[0]);
    const steps = [];
    for (let moved = true; moved;) {
      moved = false;
      for (const a of order) {
        if (d[a.id] >= a.dn) continue;
        d[a.id] += 1;
        if (length(p, d) <= T) { steps.push(a.id); moved = true; break; }
        d[a.id] -= 1;
      }
    }
    return { d, steps };
  };
  const rng = R.mulberry32(20261126);
  for (let t = 0; t < 300; t++) {
    const n = 3 + Math.floor(rng() * 6); const rs = [];
    for (let i = 0; i < n; i++) {
      const dn = 1 + Math.floor(rng() * 8); const dc = Math.floor(rng() * (dn + 1)); const cn = Math.floor(rng() * 20);
      rs.push(row(`A${i}`, Array.from({ length: i }, (_, j) => `A${j}`).filter(() => rng() < 0.35).join(', '), dn, dc, cn, cn + Math.floor(rng() * 25)));
    }
    const p = ok(rs); const sc = K.shortcut(p); const o = unitByUnit(p);
    assert.deepEqual(sc.d, o.d, `tabla ${t}`);
    assert.deepEqual(sc.steps.map((x) => x.id), o.steps, `tabla ${t}`);
  }
  const big = [row('A', '', 998, 998, 0, 0)];
  for (let i = 1; i <= 29; i++) big.push(row(`B${i}`, '', 998, 0, 0, i));
  const t0 = Date.now();
  const sc = K.shortcut(ok(big));
  assert.equal(sc.steps.length, 29 * 998);
  if (TIMED) assert.ok(Date.now() - t0 < 3000, `${Date.now() - t0} ms`);
});
