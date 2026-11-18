'use strict';
// core/probgrade — corrección casilla a casilla, con error consecuente, de los ejercicios de probabilidad (TCL) y de
// Montecarlo (spec f3e-probabilidad-montecarlo, AC2–AC4, AC6, AC8, AC10 y AC25; plan §0 «Corrección TCL» y
// «Montecarlo», §3; análisis H3 y H6). Pruebas en rojo de T005: fallan mientras no exista js/core/probgrade.js.
// Ejemplos de referencia citados (core/stochex): Klastorin (2010) en el Tema 6c de J. M. Galán, con tres tiempos
// (A–C–E–F, 23,83, 8,25 y 0,66) y con tiempos discretos (E[T] = 23,248, P(T ≤ 20) = 0,157 y la criticidad de C, 0,660);
// Hillier y Lieberman (2015), tablas 22.4 y 22.6 (44, 9 y 0,84); las dos rutas del Tema 6c con plazo 17 (0,81 y 0,71).
// Oráculo independiente: tests/oracle-probgrade.js (la normal y los caminos por su cuenta; sin probgrade, probgen,
// tcl, threept ni mc), sobre 3000 ejercicios TCL y 600 de discretas y de réplicas con 1–3 errores sembrados.
//
// Contrato (plan §3, con las decisiones técnicas de T005 en decisions.md):
//   tcl(ex, ans, sol?) · read · disc · rep · grade(kind, ex, ans, sol?) → { cells: { [campo]: cell }, score: { got, total, pct } }
//     sol, por defecto probgen.solve(kind, ex); ans, { campo: texto } (las marcas, lista de ids o texto con separadores;
//     una opción de «Leer», su posición en la lista, desde 0).
//   cell = { status, value, right, expected, formula, uses, from }
//     status: ok (la solución, dentro de su tolerancia) · carried (la fórmula con los datos del alumno) · wrong ·
//     blank (vacía) · invalid (no es un número, un id que no existe, una opción que no está).
//     right, el valor de la solución; expected, el de la fórmula con los datos del alumno tal como los escribió;
//     uses, las casillas de las que sale; from, las de uses que están wrong o carried (las que arrastran el error).
//   fields(kind, ex) → los campos, en orden · explain(cell) → { key: cell.formula, params } · EXPLAIN, las claves.
//   Datos del alumno con error consecuente, dos lecturas y vale cualquiera: «tal como los escribió» (su número; el de la
//   solución si la casilla está vacía o no es válida) y «con los buenos exactos» (el de la solución si su casilla es ok).
//   Un número: coma o punto decimal, o una fracción de enteros (3/8).
const test = require('node:test');
const assert = require('node:assert/strict');
const R = require('../js/core/rng.js');
const T = require('../js/core/threept.js');
const PG = require('../js/core/probgen.js');
const O = require('./oracle-probgrade.js');
const PGR = require('../js/core/probgrade.js');

const LEVELS = ['easy', 'medium', 'hard'];
const SWEEP = Number(process.env.PNL_PROBGRADE_SWEEP || 1000);   // ejercicios TCL por nivel (T005: 3000 en total)
const SWEEP_MC = Math.max(1, Math.round(SWEEP / 5));                // de discretas y de réplicas, por nivel
const EPS = 1e-9;
const close = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg || ''}: ${a} frente a ${b}`);
const statusOf = (g) => Object.fromEntries(Object.entries(g.cells).map(([k, c]) => [k, c.status]));
const comma = (x, k) => Number(x).toFixed(k).replace('.', ',');
const FORMULAS = ['te', 'tvar', 'path', 'mu', 'pvar', 'z', 'p', 'zp', 'Tp', 'rmu', 'rvar', 'rz', 'rp', 'both',
  'readPct', 'readP', 'readCrit', 'readQ', 'discT', 'discP', 'discMean', 'discPT', 'discCrit', 'repT', 'repCrit', 'repPT', 'repEst'];

/** La hoja de la solución de un ejercicio TCL, como la escribiría un alumno (dos decimales; P con cuatro). */
function tclSheet(ex) {
  const s = O.tcl.solution(ex);
  const a = {};
  for (const r of ex.rows) if (r.mu == null) { a[`${r.id}.te`] = comma(s.acts[r.id].te, 2); a[`${r.id}.var`] = comma(s.acts[r.id].var, 2); }
  Object.assign(a, { path: s.path.slice(), mu: comma(s.mu, 2), var: comma(s.var, 2), z: comma(s.z, 2), p: comma(s.p, 4), zp: comma(s.zp2, 2),
    Tp: comma(s.mu + s.zp2 * s.sd, 2) });
  if (ex.route) {
    const r = s.route;
    Object.assign(a, { 'r.mu': comma(r.mu, 2), 'r.var': comma(r.var, 2), 'r.z': comma(r.z, 2), 'r.p': comma(r.p, 4), both: comma(r.both, 4) });
  }
  return a;
}
const kl = (o) => PG.fromExample('kl', o);

// ---------- contrato ----------

test('constantes del plan §0: estados, tolerancias, las tres z del 95 % y las claves de las explicaciones', () => {
  assert.deepEqual(PGR.STATES, ['ok', 'carried', 'wrong', 'blank', 'invalid']);
  assert.deepEqual(PGR.TOL, { act: 0.01, perAct: 0.01, z: 0.01, pTable: 0.0005, pExact: 0.005, z3: 0.0005, T: 0.05, read: 0.05, disc: 0.001, rep: 0.001 });
  assert.deepEqual(PGR.Z95, [1.64, 1.645, 1.65]);
  assert.deepEqual(PGR.EXPLAIN.slice().sort(), FORMULAS.slice().sort());
});

test('parse: coma o punto, fracciones de enteros; vacía → null; lo demás → NaN (igual que el oráculo)', () => {
  const cases = ['', '  ', '4,17', '4.17', '-1,5', '.5', '3/8', ' 3 / 8 ', '-1/4', '7', '1/0', '1/2/3', '1,2,3', 'abc', '1.5/2', '2/-4', '--1', '1e3', null, undefined];
  for (const c of cases) {
    const a = PGR.parse(c); const b = O.num(c);
    if (Number.isNaN(b)) assert.ok(Number.isNaN(a), `${c}: ${a}`); else assert.equal(a, b, String(c));
  }
  assert.equal(PGR.parse('3/8'), 0.375);
  assert.equal(PGR.parse('4,17'), 4.17);
});

test('marks: lista de ids o texto con separadores, en mayúsculas y sin repetir', () => {
  for (const v of [['A', 'C', 'E', 'F'], 'A-C-E-F', 'a c e f', 'A, C; E → F', ['a', 'C', 'C', ' E ', 'F'], '', [], null, 'A--C']) {
    assert.deepEqual(PGR.marks(v), O.marks(v), JSON.stringify(v));
  }
});

test('fields: los campos de cada tipo, en orden (TCL con y sin la otra ruta, filas dadas, discretas y réplicas)', () => {
  const k = kl();
  assert.deepEqual(PGR.fields('tcl', k), O.tcl.fields(k));
  assert.deepEqual(PGR.fields('tcl', k).slice(0, 4), ['A.te', 'A.var', 'B.te', 'B.var']);
  const tr = PG.fromExample('tr', { route: true });
  assert.deepEqual(PGR.fields('tcl', tr), ['path', 'mu', 'var', 'z', 'p', 'zp', 'Tp', 'r.mu', 'r.var', 'r.z', 'r.p', 'both']);
  const kd = PG.fromExample('kd');
  assert.deepEqual(PGR.fields('disc', kd), O.disc.fields(kd, O.disc.solution(kd)));
  assert.equal(PGR.fields('disc', kd).length, 36 * 2 + 2 + 4);
  const rp = PG.rep(7, 'medium').ex;
  assert.deepEqual(PGR.fields('rep', rp), O.rep.fields(rp));
  const rd = PG.read(3, 'easy').ex;
  assert.deepEqual(PGR.fields('read', rd), ['pct', 'pT', 'crit'].concat(rd.questions.map((q) => `q.${q.key}`)));
  assert.throws(() => PGR.fields('xx', k));
  assert.throws(() => PGR.grade('xx', k, {}));
});

// ---------- TCL: referencias ----------

test('AC1 · Klastorin resuelto: todo ok (A–C–E–F, 23,83, 8,25, z 0,41, P 0,66), nota 19 de 19', () => {
  const ex = kl();
  const ans = Object.assign(tclSheet(ex), { p: '0,66' });
  const g = PGR.tcl(ex, ans);
  for (const [k, c] of Object.entries(g.cells)) assert.equal(c.status, 'ok', k);
  assert.deepEqual(Object.keys(g.cells), PGR.fields('tcl', ex));
  assert.deepEqual(g.cells.path.right, ['A', 'C', 'E', 'F']);
  close(g.cells.mu.right, 23.8333333, 1e-6, 'μ'); close(g.cells.var.right, 8.25, 1e-9, 'σ²');
  assert.deepEqual(g.score, { got: 19, total: 19, pct: 100 });
  // con el texto del camino y con punto decimal
  const g2 = PGR.tcl(ex, Object.assign({}, ans, { path: 'A-C-E-F', mu: '23.83' }));
  assert.equal(g2.cells.path.status, 'ok'); assert.equal(g2.cells.mu.status, 'ok');
});

test('AC1 · Hillier y Lieberman (plazo 47): 44, 9 y P = 0,84', () => {
  const ex = PG.fromExample('hl');
  const ans = Object.assign(tclSheet(ex), { mu: '44', var: '9', z: '1', p: '0,84' });
  const g = PGR.tcl(ex, ans);
  for (const [k, c] of Object.entries(g.cells)) assert.equal(c.status, 'ok', k);
});

test('H6 · la media de la triangular, (a + m + b)/3, no vale: wrong en las actividades asimétricas de Klastorin', () => {
  const ex = kl();
  const ans = tclSheet(ex);
  for (const r of ex.rows) ans[`${r.id}.te`] = comma((r.a + r.m + r.b) / 3, 2);
  const g = PGR.tcl(ex, ans);
  for (const r of ex.rows) {
    const sym = Math.abs((r.a + r.m + r.b) / 3 - (r.a + 4 * r.m + r.b) / 6) <= 0.01;
    assert.equal(g.cells[`${r.id}.te`].status, sym ? 'ok' : 'wrong', r.id);
  }
  assert.equal(g.cells['A.te'].status, 'wrong');
});

test('AC5 · las dos rutas (plazo 17): la ruta crítica sola 0,81 y las dos 0,71, todo ok', () => {
  const ex = PG.fromExample('tr', { route: true });
  assert.deepEqual(ex.route, ['A', 'C']);
  const ans = Object.assign(tclSheet(ex), { p: '0,81', both: '0,71' });
  const g = PGR.tcl(ex, ans);
  for (const [k, c] of Object.entries(g.cells)) assert.equal(c.status, 'ok', k);
  close(g.cells.both.right, 0.8133 * 0.8708, 1e-9, 'P(las dos) con la tabla');
});

// ---------- TCL: error consecuente ----------

test('AC2 · una media mal en el camino crítico: wrong ella sola; μ, z, P y el plazo, carried (cada error cuenta una vez)', () => {
  const ex = kl();
  const ans = Object.assign(tclSheet(ex), { 'C.te': '8,83', mu: '24,83', z: '0,06', p: comma(T.tableP(0.06).p4, 4), Tp: comma(24.83 + 1.645 * Math.sqrt(8.25), 2) });
  ans.zp = '1,645';
  const g = PGR.tcl(ex, ans);
  const st = statusOf(g);
  assert.equal(st['C.te'], 'wrong');
  assert.equal(st.path, 'ok');
  for (const k of ['mu', 'z', 'p', 'Tp']) assert.equal(st[k], 'carried', k);
  assert.equal(st.var, 'ok');
  assert.equal(Object.values(st).filter((s) => s === 'wrong').length, 1);
  assert.deepEqual(g.cells.mu.from, ['C.te']);
  assert.deepEqual(g.cells.mu.uses, ['path', 'A.te', 'C.te', 'E.te', 'F.te']);
  assert.deepEqual(g.cells.z.from, ['mu']);
  assert.deepEqual(g.cells.p.from, ['z']);
  assert.deepEqual(g.cells.Tp.from, ['mu']);
  close(g.cells.mu.expected, 24.83, 1e-9, 'μ con sus medias');
  close(g.cells.mu.right, 23.8333333, 1e-6, 'μ de la solución');
  assert.deepEqual(g.score, { got: 18, total: 19, pct: 94.7 });
});

test('una varianza del proyecto mal: z, P y el plazo con su desviación (carried), no con la de la solución', () => {
  const ex = kl();
  const sd = Math.sqrt(10.25);
  const z = (25 - 23.83) / sd;
  const ans = Object.assign(tclSheet(ex), { var: '10,25', z: comma(z, 2), p: comma(T.tableP(z).p4, 4), zp: '1,645', Tp: comma(23.83 + 1.645 * sd, 2) });
  const st = statusOf(PGR.tcl(ex, ans));
  assert.equal(st.var, 'wrong');
  for (const k of ['z', 'p', 'Tp']) assert.equal(st[k], 'carried', k);
  assert.equal(st.mu, 'ok');
});

test('AC3 · una media que cambia el camino crítico: el camino de sus medias es carried, y μ y σ² sobre su camino', () => {
  const ex = kl();
  // B = 8,83 en lugar de 7,33: A–B–E–F (24,83) pasa a A–C–E–F (23,83)
  const base = Object.assign(tclSheet(ex), { 'B.te': '8,83' });
  const his = PGR.tcl(ex, Object.assign({}, base, { path: ['A', 'B', 'E', 'F'], mu: '24,83', var: '6,67' }));
  assert.equal(his.cells['B.te'].status, 'wrong');
  assert.equal(his.cells.path.status, 'carried');
  assert.deepEqual(his.cells.path.from, ['B.te']);
  assert.equal(his.cells.mu.status, 'carried');
  assert.equal(his.cells.var.status, 'carried');
  assert.deepEqual(his.cells.var.uses, ['path', 'A.var', 'B.var', 'E.var', 'F.var']);
  // el camino verdadero sigue siendo ok aunque sus medias digan otro
  assert.equal(PGR.tcl(ex, Object.assign({}, base, { path: ['A', 'C', 'E', 'F'] })).cells.path.status, 'ok');
  // y un camino que no es crítico ni con sus medias, wrong
  assert.equal(PGR.tcl(ex, Object.assign({}, base, { path: ['A', 'D'] })).cells.path.status, 'wrong');
  // sin el error en B, marcar A–B–E–F es wrong
  assert.equal(PGR.tcl(ex, Object.assign(tclSheet(ex), { path: ['A', 'B', 'E', 'F'] })).cells.path.status, 'wrong');
});

test('camino con empate de medias: decide la varianza del alumno (con sus varianzas)', () => {
  // A (te 7, σ² 1) y B (te 7, σ² 4) antes de C (te 2): A–C y B–C miden 9; la regla de M6 elige B–C (más varianza).
  const ex = { kind: 'tcl', level: 'example', sd: null, sdUsed: null, deadline: 10, prob: 0.9, route: null,
    rows: [{ id: 'A', a: 4, m: 7, b: 10, preds: [] }, { id: 'B', a: 1, m: 7, b: 13, preds: [] }, { id: 'C', a: 1, m: 2, b: 3, preds: ['A', 'B'] }] };
  const sheet = tclSheet(ex);
  assert.deepEqual(sheet.path, ['B', 'C']);
  assert.equal(PGR.tcl(ex, sheet).cells.path.status, 'ok');
  assert.equal(PGR.tcl(ex, Object.assign({}, sheet, { path: ['A', 'C'] })).cells.path.status, 'wrong');
  // con σ²(A) = 9 (mal), sus varianzas dan A–C: carried
  const g = PGR.tcl(ex, Object.assign({}, sheet, { 'A.var': '9', path: ['A', 'C'] }));
  assert.equal(g.cells['A.var'].status, 'wrong');
  assert.equal(g.cells.path.status, 'carried');
});

test('marcas que no forman un camino: wrong, y μ y σ² se juzgan sobre el camino de la solución', () => {
  const ex = kl();
  const g = PGR.tcl(ex, Object.assign(tclSheet(ex), { path: ['A', 'C', 'F'] }));
  assert.equal(g.cells.path.status, 'wrong');
  assert.equal(g.cells.mu.status, 'ok');
  assert.deepEqual(g.cells.mu.uses, ['A.te', 'C.te', 'E.te', 'F.te']);
  const inv = PGR.tcl(ex, Object.assign(tclSheet(ex), { path: ['A', 'X'] }));
  assert.equal(inv.cells.path.status, 'invalid');
});

test('casillas vacías o ilegibles: blank / invalid, cuentan en el total y las que dependen de ellas usan la solución', () => {
  const ex = kl();
  const ans = Object.assign(tclSheet(ex), { 'C.te': '', 'E.te': 'cinco', mu: '' });
  const g = PGR.tcl(ex, ans);
  assert.equal(g.cells['C.te'].status, 'blank');
  assert.equal(g.cells['E.te'].status, 'invalid');
  assert.equal(g.cells.mu.status, 'blank');
  assert.equal(g.cells.z.status, 'ok');
  assert.equal(g.cells['C.te'].value, null);
  assert.deepEqual(g.score, { got: 16, total: 19, pct: 84.2 });
  const none = PGR.tcl(ex, null);
  assert.ok(Object.values(none.cells).every((c) => c.status === 'blank'));
  assert.deepEqual(none.score, { got: 0, total: 19, pct: 0 });
  assert.deepEqual(PGR.tcl(ex, ans, PG.solve('tcl', ex)), g);
  assert.deepEqual(PGR.grade('tcl', ex, ans), g);
});

test('AC4 · plazo de una probabilidad (0,90): la z de la tabla y el plazo con su media y su desviación', () => {
  const ex = kl({ prob: 0.9 });
  const sd = Math.sqrt(8.25);
  for (const z of ['1,28', '1,282', '1,29', '1,2816']) {
    const zz = O.num(z);
    const g = PGR.tcl(ex, Object.assign(tclSheet(ex), { zp: z, Tp: comma(23.8333333 + zz * sd, 2) }));
    assert.equal(g.cells.zp.status, 'ok', z); assert.equal(g.cells.Tp.status, 'ok', z);
  }
  assert.equal(PGR.tcl(ex, Object.assign(tclSheet(ex), { zp: '1,30' })).cells.zp.status, 'wrong');
  // con su media mal (25,83), el plazo con ella es carried
  const g = PGR.tcl(ex, Object.assign(tclSheet(ex), { mu: '25,83', zp: '1,28', Tp: comma(25.83 + 1.28 * sd, 2) }));
  assert.equal(g.cells.mu.status, 'wrong');
  assert.equal(g.cells.zp.status, 'ok');
  assert.equal(g.cells.Tp.status, 'carried');
  assert.deepEqual(g.cells.Tp.from, ['mu']);
});

test('AC25 · el 95 %: z = 1,64, 1,645 y 1,65 ok, cada una con su plazo (y con el de otra); 1,66 wrong', () => {
  const ex = kl();
  const sd = Math.sqrt(8.25); const mu = 23.8333333;
  for (const z of PGR.Z95) {
    for (const z2 of PGR.Z95) {
      const g = PGR.tcl(ex, Object.assign(tclSheet(ex), { zp: comma(z, 3), Tp: comma(mu + z2 * sd, 2) }));
      assert.equal(g.cells.zp.status, 'ok', `${z}`); assert.equal(g.cells.Tp.status, 'ok', `${z} con el plazo de ${z2}`);
    }
  }
  const g = PGR.tcl(ex, Object.assign(tclSheet(ex), { zp: '1,66', Tp: comma(mu + 1.66 * sd, 2) }));
  assert.equal(g.cells.zp.status, 'wrong');
  assert.notEqual(g.cells.Tp.status, 'wrong');
  assert.equal(PGR.tcl(ex, Object.assign(tclSheet(ex), { zp: '1,63' })).cells.zp.status, 'ok');   // ±0,01 de 1,64 (plan §0)
  assert.equal(PGR.tcl(ex, Object.assign(tclSheet(ex), { zp: '1,6' })).cells.zp.status, 'wrong');
});

test('AC25 (T006) · con σ grande, el plazo con 1,65 es ok por sí mismo (no por estar a ±0,05 del de 1,64); fuera del 95 %, no', () => {
  // μ = 35 y σ = 15: con 1,65, 59,75; con 1,64, 59,60; con la exacta, 59,67. Mutante del plan §5 («1,645 no aceptado»).
  const one = (prob) => ({ kind: 'tcl', level: 'example', sd: null, sdUsed: null, deadline: 50, prob, route: null,
    rows: [{ id: 'A', a: 0, m: 30, b: 90, preds: [] }] });
  const g = PGR.tcl(one(0.95), Object.assign(tclSheet(one(0.95)), { zp: '1,65', Tp: '59,75' }));
  assert.equal(g.cells.zp.status, 'ok'); assert.equal(g.cells.Tp.status, 'ok');
  const g90 = PGR.tcl(one(0.9), Object.assign(tclSheet(one(0.9)), { zp: '1,65', Tp: '59,75' }));
  assert.equal(g90.cells.zp.status, 'wrong'); assert.equal(g90.cells.Tp.status, 'carried');
  assert.deepEqual(g90.cells.Tp.from, ['zp']);
});

test('P en el borde: la de la tabla ±0,0005 y la exacta ±0,005; fuera de las dos, wrong', () => {
  const ex = kl();
  const s = O.tcl.solution(ex);
  const st = (p) => PGR.tcl(ex, Object.assign(tclSheet(ex), { p: String(p) })).cells.p.status;
  assert.equal(st(s.p + 0.0005 - 1e-7), 'ok');
  assert.equal(st(s.p - 0.0005 + 1e-7), 'ok');
  assert.equal(st(s.pE + 0.005 - 1e-7), 'ok');
  assert.equal(st(s.pE - 0.005 + 1e-7), 'ok');
  // del lado de la exacta que se aleja de la de la tabla
  const away = s.pE < s.p ? -1 : 1;
  assert.equal(st(s.pE + away * (0.005 + 1e-4)), 'wrong');
  assert.equal(st(s.p - away * (0.005 + 0.0005 + 1e-3)), 'wrong');
  // la z también en el borde, ±0,01
  const zst = (z) => PGR.tcl(ex, Object.assign(tclSheet(ex), { z: String(z) })).cells.z.status;
  assert.equal(zst(s.z + 0.01 - 1e-7), 'ok');
  assert.equal(zst(s.z + 0.03), 'wrong');
});

test('la otra ruta: una media mal en la ruta arrastra μ, σ², z, P de la ruta y P(las dos) = el producto (no la suma)', () => {
  let ex = null;
  for (let s = 1; !ex; s++) { const o = PG.tcl(s, 'medium', { route: true }); if (o.ok) ex = o.ex; }
  const sol = O.tcl.solution(ex);
  const x = ex.route.find((id) => !sol.path.includes(id));
  const bad = sol.acts[x].te + 2;
  const sheet = tclSheet(ex);
  const rmu = ex.route.reduce((s, id) => s + (id === x ? Number(bad.toFixed(2)) : Number(sol.acts[id].te.toFixed(2))), 0);
  const rz = (ex.deadline - rmu) / Math.sqrt(sol.route.var);
  const rp = T.tableP(rz).p4;
  const ans = Object.assign({}, sheet, { [`${x}.te`]: comma(bad, 2), 'r.mu': comma(rmu, 2), 'r.z': comma(rz, 2), 'r.p': comma(rp, 4),
    both: comma(O.num(sheet.p) * rp, 4) });
  const g = PGR.tcl(ex, ans);
  const st = statusOf(g);
  assert.equal(st[`${x}.te`], 'wrong');
  for (const k of ['r.mu', 'r.z', 'r.p', 'both']) assert.equal(st[k], 'carried', k);
  for (const k of ['path', 'mu', 'var', 'z', 'p', 'zp', 'Tp', 'r.var']) assert.equal(st[k], 'ok', k);
  assert.deepEqual(g.cells.both.from, ['r.p']);
  // P(las dos) con la suma: wrong
  const sumP = O.num(sheet.p) + rp;
  assert.equal(PGR.tcl(ex, Object.assign({}, ans, { both: comma(sumP, 4) })).cells.both.status, 'wrong');
  // una P de la ruta mal (0,5): P(las dos) con ella, carried
  const g2 = PGR.tcl(ex, Object.assign({}, sheet, { 'r.p': '0,5', both: comma(O.num(sheet.p) * 0.5, 4) }));
  assert.equal(g2.cells['r.p'].status, 'wrong');
  assert.equal(g2.cells.both.status, 'carried');
});

test('AC10 · explain: la clave de la fórmula y qué se esperaba, de dónde sale y qué dato del alumno lo arrastró', () => {
  const ex = kl();
  const ans = Object.assign(tclSheet(ex), { 'C.te': '8,83', mu: '24,83', z: '0,9', p: '0,1' });
  const g = PGR.tcl(ex, ans);
  for (const [k, c] of Object.entries(g.cells)) {
    const e = PGR.explain(c);
    assert.equal(e.key, c.formula, k);
    assert.ok(PGR.EXPLAIN.includes(e.key), k);
    assert.equal(e.params.status, c.status, k);
    assert.deepEqual(e.params.right, c.right, k);
    assert.deepEqual(e.params.expected, c.expected, k);
    assert.deepEqual(e.params.from, c.from || [], k);
    assert.deepEqual(e.params.value, c.value, k);
  }
  assert.equal(g.cells.z.status, 'wrong');
  assert.deepEqual(PGR.explain(g.cells.z).params.from, ['mu']);
  close(g.cells.z.expected, (25 - 24.83) / Math.sqrt(8.25), 1e-9, 'z con su μ');
  assert.equal(g.cells.p.status, 'wrong');
  close(g.cells.p.expected, T.tableP(0.9).p4, 1e-12, 'P con su z');
  const formulas = { 'A.te': 'te', 'A.var': 'tvar', path: 'path', mu: 'mu', var: 'pvar', z: 'z', p: 'p', zp: 'zp', Tp: 'Tp' };
  for (const [k, f] of Object.entries(formulas)) assert.equal(g.cells[k].formula, f, k);
});

// ---------- Montecarlo ----------

test('AC6 · «Leer una simulación»: los valores de M7 ok; en el borde, ± una clase y ±0,05; las opciones, por su posición', () => {
  for (const level of LEVELS) {
    for (const sd of [1, 2]) {
      const o = PG.read(sd, level); assert.ok(o.ok, `${level} ${sd}`);
      const ex = o.ex; const sol = PG.solve('read', ex);
      const qs = Object.fromEntries(ex.questions.map((q) => [`q.${q.key}`, String(q.options.indexOf(q.correct))]));
      const good = Object.assign({ pct: String(sol.pct.value), pT: String(sol.pT), crit: String(sol.act.crit) }, qs);
      const g = PGR.read(ex, good, sol);
      for (const [k, c] of Object.entries(g.cells)) assert.equal(c.status, 'ok', `${level} ${sd} ${k}`);
      assert.deepEqual(Object.keys(g.cells), PGR.fields('read', ex));
      const st = (k, v) => PGR.read(ex, Object.assign({}, good, { [k]: String(v) }), sol).cells[k].status;
      const w = sol.classW;
      assert.equal(st('pct', sol.pct.value + w - 1e-6), 'ok'); assert.equal(st('pct', sol.pct.value - w + 1e-6), 'ok');
      assert.equal(st('pct', sol.pct.value + w + 0.01), 'wrong');
      assert.equal(st('pT', sol.pT + 0.05 - 1e-6), 'ok'); assert.equal(st('pT', sol.pT - 0.05 - 1e-3), 'wrong');
      assert.equal(st('crit', sol.act.crit - 0.05 + 1e-6), 'ok'); assert.equal(st('crit', sol.act.crit + 0.06), 'wrong');
      for (const q of ex.questions) {
        const k = `q.${q.key}`; const right = q.options.indexOf(q.correct);
        for (let i = 0; i < q.options.length; i++) assert.equal(st(k, i), i === right ? 'ok' : 'wrong', `${k} ${i}`);
        assert.equal(st(k, q.options.length), 'invalid');
        assert.equal(st(k, 'x'), 'invalid');
        assert.equal(st(k, ''), 'blank');
        assert.equal(g.cells[k].formula, 'readQ');
        assert.equal(g.cells[k].right, right);
      }
      assert.deepEqual(g.score, { got: g.score.total, total: 3 + ex.questions.length, pct: 100 });
    }
  }
});

test('H3 · «Leer»: cada opción mala de una pregunta de actividades queda a 0,05 o más de la buena en la simulación', () => {
  for (const level of LEVELS) {
    const ex = PG.read(4, level).ex; const sol = PG.solve('read', ex);
    for (const q of ex.questions) {
      const score = { mostCrit: (id) => sol.crit[id], mostCruc: (id) => sol.cruc[id], critLowCruc: (id) => sol.crit[id] - sol.cruc[id] }[q.key];
      if (!score) continue;
      for (const opt of q.options) if (opt !== q.correct) assert.ok(score(q.correct) - score(opt) >= 0.05 - EPS, `${level} ${q.key} ${opt}`);
    }
  }
});

test('AC7 · Klastorin discreto: E[T] = 23,248, P(T ≤ 20) = 0,157 y la criticidad de C, 0,660; las 36 combinaciones ok', () => {
  const ex = PG.fromExample('kd');
  const sol = O.disc.solution(ex);
  close(sol.mean, 23.248, 5e-4, 'E[T] del oráculo'); close(sol.pT, 0.157, 5e-4, 'P del oráculo'); close(sol.crit.C, 0.66, 5e-4, 'crit C');
  const ans = { mean: '23,248', pT: '0,157', 'A.crit': comma(sol.crit.A, 3), 'B.crit': comma(sol.crit.B, 3), 'C.crit': '0,660', 'D.crit': comma(sol.crit.D, 3) };
  // la mitad de las probabilidades, como fracción (1/250…)
  sol.combos.forEach((c, i) => { ans[`c${i + 1}.T`] = String(c.T); ans[`c${i + 1}.p`] = i % 2 ? comma(c.p, 4) : O.fraction(c.p); });
  const g = PGR.disc(ex, ans);
  for (const [k, c] of Object.entries(g.cells)) assert.equal(c.status, 'ok', k);
  assert.deepEqual(Object.keys(g.cells), PGR.fields('disc', ex));
});

test('discretas con error consecuente: una combinación mal sumada arrastra E[T] y P (carried), no la criticidad', () => {
  const ex = PG.fromExample('kd');
  const sol = O.disc.solution(ex);
  const i = sol.combos.findIndex((c) => c.T <= ex.deadline);
  const ans = { 'C.crit': '0,660' };
  sol.combos.forEach((c, j) => { ans[`c${j + 1}.T`] = String(c.T); ans[`c${j + 1}.p`] = comma(c.p, 4); });
  ans[`c${i + 1}.T`] = String(ex.deadline + 5);
  const T2 = sol.combos.map((c, j) => (j === i ? ex.deadline + 5 : c.T));
  ans.mean = comma(sol.combos.reduce((s, c, j) => s + c.p * T2[j], 0), 3);
  ans.pT = comma(sol.combos.reduce((s, c, j) => s + (T2[j] <= ex.deadline ? c.p : 0), 0), 3);
  const g = PGR.disc(ex, ans);
  assert.equal(g.cells[`c${i + 1}.T`].status, 'wrong');
  assert.equal(g.cells.mean.status, 'carried');
  assert.equal(g.cells.pT.status, 'carried');
  assert.deepEqual(g.cells.mean.from, [`c${i + 1}.T`]);
  assert.equal(g.cells['C.crit'].status, 'ok');
  assert.equal(Object.values(g.cells).filter((c) => c.status === 'wrong').length, 1);
});

test('AC8 · réplicas: una réplica mal sumada es wrong y la estimación con sus T, carried (no con la T verdadera)', () => {
  let ex = null; let sol = null; let i = -1;
  for (let s = 1; i < 0; s++) {
    ex = PG.rep(s, 'medium').ex; sol = O.rep.solution(ex);
    i = sol.reps.findIndex((o) => o.T <= ex.deadline);
  }
  const ans = {};
  sol.reps.forEach((o, k) => { ans[`r${k + 1}.T`] = String(o.T); ans[`r${k + 1}.crit`] = o.crit.slice(); });
  for (const r of ex.rows) ans[`${r.id}.crit`] = `${Math.round(sol.crit[r.id] * ex.n)}/${ex.n}`;
  ans.pT = comma(sol.pT, 3);
  const ok = PGR.rep(ex, ans);
  for (const [k, c] of Object.entries(ok.cells)) assert.equal(c.status, 'ok', k);
  assert.deepEqual(Object.keys(ok.cells), PGR.fields('rep', ex));
  // la réplica i, sumada de más: pasa del plazo
  const bad = Object.assign({}, ans, { [`r${i + 1}.T`]: String(ex.deadline + 3), pT: comma(sol.pT - 1 / ex.n, 3) });
  const g = PGR.rep(ex, bad);
  assert.equal(g.cells[`r${i + 1}.T`].status, 'wrong');
  assert.equal(g.cells.pT.status, 'carried');
  assert.deepEqual(g.cells.pT.from, [`r${i + 1}.T`]);
  // unas marcas mal: la estimación de la criticidad con sus marcas, carried
  const x = ex.rows.map((r) => r.id).find((id) => !sol.reps[i].crit.includes(id));
  const marks = sol.reps[i].crit.concat([x]);
  const cnt = sol.reps.filter((o, k) => (k === i ? marks : o.crit).includes(x)).length;
  const g2 = PGR.rep(ex, Object.assign({}, ans, { [`r${i + 1}.crit`]: marks.join(' '), [`${x}.crit`]: `${cnt}/${ex.n}` }));
  assert.equal(g2.cells[`r${i + 1}.crit`].status, 'wrong');
  assert.equal(g2.cells[`${x}.crit`].status, 'carried');
  assert.deepEqual(g2.cells[`${x}.crit`].from, [`r${i + 1}.crit`]);
  assert.equal(PGR.rep(ex, Object.assign({}, ans, { [`r${i + 1}.crit`]: ['Z'] })).cells[`r${i + 1}.crit`].status, 'invalid');
});

// ---------- oráculo independiente ----------

test('el oráculo: su tabla de la normal es la de core/threept (z de −4 a 4 cada 0,01) y su Φ⁻¹, la de threept', () => {
  for (let i = -400; i <= 400; i++) {
    const z = i / 100;
    assert.equal(O.tableP(z).p4, T.tableP(z).p4, `z = ${z}`);
  }
  for (const p of PG.PROBS) close(O.phiInv(p), T.phiInv(p), 1e-9, `Φ⁻¹(${p})`);
});

/** El barrido: la corrección de probgrade frente al oráculo, casilla a casilla, con 1–3 errores sembrados. */
function sweepCheck(kind, ex, sol, r, errs, tally) {
  const { ans, sown } = O[kind].student(ex, sol, r, errs);
  const g = PGR.grade(kind, ex, ans);
  const o = O[kind].classify(ex, ans, sol);
  const where = `${kind} ${ex.level} ${ex.sd} ${JSON.stringify(ans)}`;
  assert.deepEqual(Object.keys(g.cells), Object.keys(o.status), where);
  assert.deepEqual(statusOf(g), o.status, where);
  for (const [k, c] of Object.entries(g.cells)) {
    if (c.status === 'wrong') assert.ok(sown.includes(k), `${where}: ${k} wrong sin error sembrado`);
    for (const f of c.from || []) {
      assert.ok(c.uses.includes(f), `${where}: ${k}.from ${f}`);
      assert.ok(['wrong', 'carried'].includes(g.cells[f].status), `${where}: ${k}.from ${f} ${g.cells[f].status}`);
    }
  }
  const got = Object.values(o.status).filter((s) => s === 'ok' || s === 'carried').length;
  assert.equal(g.score.got, got, where); assert.equal(g.score.total, Object.keys(o.status).length, where);
  tally.sown += sown.length; tally.wrong += sown.filter((k) => o.status[k] === 'wrong').length; tally.n++;
}

for (const level of LEVELS) {
  test(`AC2–AC4 · oráculo, TCL, ${level}: ${SWEEP} ejercicios (uno de cada cuatro con la otra ruta) con 1–3 errores; cada error cuenta una vez`, () => {
    const r = R.mulberry32(20261117 + level.length);
    const tally = { sown: 0, wrong: 0, n: 0 };
    let routes = 0;
    for (let s = 1; tally.n < SWEEP; s++) {
      const o = PG.tcl(s, level, { route: tally.n % 4 === 3 });
      assert.ok(o.ok, `${level} ${s}`);
      const ex = o.ex; const sol = O.tcl.solution(ex);
      // el oráculo y probgen dan la misma solución
      const ps = PG.solve('tcl', ex);
      assert.deepEqual(ps.path, sol.path, `${level} ${s}`);
      close(ps.mu, sol.mu, 1e-9, 'μ'); close(ps.var, sol.var, 1e-9, 'σ²');
      assert.equal(ps.z, sol.z); assert.equal(ps.p, sol.p); assert.equal(ps.zp, sol.zp2);
      if (ex.route) { routes++; assert.equal(ps.route.p, sol.route.p); }
      sweepCheck('tcl', ex, sol, r, 1 + (tally.n % 3), tally);
    }
    assert.ok(routes >= Math.floor(SWEEP / 4), `${routes} con la otra ruta`);
    assert.ok(tally.wrong >= 0.9 * tally.sown, `errores sembrados que salen wrong: ${tally.wrong} de ${tally.sown}`);
  });
}

for (const level of LEVELS) {
  test(`AC8 · oráculo, discretas y réplicas, ${level}: ${SWEEP_MC} de cada con 1–3 errores; cada error cuenta una vez`, () => {
    const r = R.mulberry32(77 + level.length);
    for (const kind of ['disc', 'rep']) {
      const tally = { sown: 0, wrong: 0, n: 0 };
      for (let s = 1; tally.n < SWEEP_MC; s++) {
        const o = PG[kind](s, level);
        assert.ok(o.ok, `${kind} ${level} ${s}`);
        const sol = O[kind].solution(o.ex);
        const ps = PG.solve(kind, o.ex);
        if (kind === 'disc') { close(ps.mean, sol.mean, 1e-9, 'E[T]'); close(ps.pT, sol.pT, 1e-9, 'P'); } else {
          assert.deepEqual(ps.reps.map((x) => x.T), sol.reps.map((x) => x.T));
          assert.deepEqual(ps.reps.map((x) => x.crit.slice().sort()), sol.reps.map((x) => x.crit));
        }
        sweepCheck(kind, o.ex, sol, r, 1 + (tally.n % 3), tally);
      }
      assert.ok(tally.wrong >= 0.9 * tally.sown, `${kind}: ${tally.wrong} de ${tally.sown}`);
    }
  });
}
