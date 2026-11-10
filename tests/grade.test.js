'use strict';
// core/grade: solución y corrección con error consecuente (spec f3a-generador-calculo, AC4–AC6, AC8 y AC9;
// plan §3, P2, P3 y T005). Ejemplo de referencia citado: Ej. 6 de los apuntes (Mecánicas del Sureste, Tema 6a, 13 días).
const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../js/core/project.js');
const E = require('../js/core/examples.js');
const C = require('../js/core/cpm.js');
const A = require('../js/core/aoa.js');
const R = require('../js/core/rng.js');
const G = require('../js/core/generator.js');
const PR = require('../js/predict.js');
const O = require('./oracle-grade.js');
const K = require('../js/core/grade.js');

const ALL = ['times', 'events', 'floats', 'sf', 'critical'];
const fromEx = (id) => { const ex = E.get(id); return P.parse(ex.rows, ex.mode).project; };
const fromGen = (seed, lv) => P.parse(G.generate(seed, G.LEVELS[lv]).rows, 'pred').project;
const EXAMPLES = ['ej6', 'ej4', 'ej7', 'roy10', 'roy6', 'klastorin', 'hillier'];

// Las respuestas de quien copia la solución del núcleo.
function solutionAnswers(sol) {
  const act = {};
  for (const a of sol.project.activities) {
    act[a.id] = Object.fromEntries(['ES', 'EF', 'LS', 'LF'].map((f) => [f, String(sol.cpm.times[a.id][f])])
      .concat(['TF', 'FF', 'IF', 'SF'].map((f) => [f, String(sol.cpm.floats[a.id][f])])));
  }
  const ev = Object.fromEntries(sol.net.events.map((e) => [e.n, { TE: String(sol.events.TE[e.n]), TL: String(sol.events.TL[e.n]), slack: String(sol.events.slack[e.n]) }]));
  return { act, dur: String(sol.cpm.duration), ev, crit: sol.cpm.critical.slice(), paths: sol.cpm.criticalPaths.map((p) => p.acts.join('-')) };
}

test('ASK y parse: lo mismo que acepta la predicción de la F1 (coma o punto, vacío, no válido)', () => {
  assert.deepEqual(K.ASK, ['times', 'events', 'floats', 'sf', 'critical']);
  for (const s of ['3', ' 3 ', '3,5', '3.5', '-2', '.5', '0', '', '  ', 'tres', '3,5,1', '1e3', '3.', null, undefined]) {
    const a = K.parse(s); const b = PR.parseAnswer(s);
    if (Number.isNaN(b)) assert.ok(Number.isNaN(a), String(s)); else assert.equal(a, b, String(s));
  }
});

test('solve: la red de las reglas y los tiempos de suceso de la F2a', () => {
  const p = fromEx('ej6');
  const sol = K.solve(p);
  assert.equal(sol.cpm.duration, 13);
  assert.equal(sol.net.dummies.length, A.build(p).dummies.length);
  assert.deepEqual(sol.events, A.times(A.build(p), C.solve(p)));
});

test('AC4 y P2: con los datos de la solución, cada fórmula local da la solución (ejemplos y 300 tablas generadas)', () => {
  const tables = EXAMPLES.map(fromEx);
  for (const lv of ['easy', 'medium', 'hard']) for (let s = 1; s <= 100; s++) tables.push(fromGen(s, lv));
  tables.forEach((p, i) => {
    const sol = K.solve(p);
    const g = K.grade(sol, solutionAnswers(sol), ALL);
    for (const [k, c] of Object.entries(g.cells)) {
      assert.equal(c.state, 'ok', `tabla ${i}, ${k}`);
      assert.equal(c.expect, c.right, `tabla ${i}, ${k}: la fórmula local no da la solución`);
    }
    assert.ok(g.paths.written.every((w) => w.state === 'ok'), `tabla ${i}`);
    assert.deepEqual(g.score, { got: g.score.total, total: g.score.total, pct: 100 }, `tabla ${i}`);
  });
});

test('AC5: Ej. 6 con el ES de E mal (2 en lugar de 3) y lo demás calculado con él', () => {
  const p = fromEx('ej6');
  const sol = K.solve(p);
  const t = O.fromProject(p);
  const ans = O.answersFrom(t, sol.net, { 'E.ES': 2 }, ALL);
  const g = K.grade(sol, ans, ALL);
  assert.equal(g.cells['E.ES'].state, 'wrong');
  assert.equal(g.cells['E.ES'].expect, 3);
  assert.equal(g.cells['E.ES'].right, 3);
  assert.equal(g.cells['E.ES'].formula, 'ES');
  assert.deepEqual(g.cells['E.ES'].uses, ['A.EF', 'B.EF']);
  for (const k of ['E.EF', 'H.ES', 'I.ES', 'J.ES', 'K.ES', 'dur', 'K.LF']) assert.equal(g.cells[k].state, 'carried', k);
  assert.equal(g.cells['E.EF'].expect, 6);
  assert.deepEqual(g.cells['E.EF'].uses, ['E.ES']);
  assert.deepEqual(g.cells['K.LF'].uses, ['dur']);
  const wrong = Object.values(g.cells).filter((c) => c.state === 'wrong');
  assert.equal(wrong.length, 1);
  assert.equal(g.score.got, g.score.total - 1);
});

test('AC5: igual que el oráculo en 3000 respuestas perturbadas al azar (errores arrastrados, vacías y no válidas)', () => {
  const r = R.mulberry32(2026);
  const keysOf = (t, net) => {
    const ks = t.ids.flatMap((a) => O.FIELDS.map((f) => `${a}.${f}`)).concat(['dur']);
    return ks.concat(net.events.flatMap((e) => [`e${e.n}.TE`, `e${e.n}.TL`]));
  };
  for (let i = 0; i < 3000; i++) {
    const lv = ['easy', 'medium', 'hard'][i % 3];
    const p = fromGen(1 + Math.floor(i / 3) % 200, lv);
    const sol = K.solve(p);
    const t = O.fromProject(p);
    const ks = keysOf(t, sol.net);
    const wrong = {};
    for (let k = R.int(r, 0, 3); k > 0; k--) wrong[ks[R.int(r, 0, ks.length - 1)]] = R.int(r, 0, 40);
    const ask = ALL.filter(() => r() < 0.7);
    const ans = O.answersFrom(t, sol.net, wrong, ALL);
    // vacías, no válidas y críticas cambiadas
    for (let k = R.int(r, 0, 2); k > 0; k--) { const a = t.ids[R.int(r, 0, t.ids.length - 1)]; ans.act[a][O.FIELDS[R.int(r, 0, 7)]] = ['', 'x', ' '][R.int(r, 0, 2)]; }
    if (r() < 0.3) ans.crit = t.ids.filter(() => r() < 0.5);
    if (r() < 0.3) ans.paths = ans.paths.concat([t.ids.slice(0, 3).join('-'), 'Z-Q', '']);
    const g = K.grade(sol, ans, ask);
    const o = O.classify(t, sol.net, ans, ask);
    assert.deepEqual(Object.keys(g.cells).sort(), Object.keys(o.cells).sort(), `caso ${i}: casillas`);
    for (const k of Object.keys(o.cells)) assert.equal(g.cells[k].state, o.cells[k], `caso ${i}, ${k}`);
    assert.deepEqual(g.paths.written.map((w) => w.state), o.paths, `caso ${i}: caminos`);
  }
});

test('AC6: cada casilla dice qué esperaba, de qué fórmula sale y qué datos del alumno usa', () => {
  const p = fromEx('ej6');
  const sol = K.solve(p);
  const ans = O.answersFrom(O.fromProject(p), sol.net, { 'H.LF': 11 }, ALL);
  ans.act.H.LS = '9';                       // con LF = 11 debía ser 10
  const g = K.grade(sol, ans, ALL);
  assert.equal(g.cells['H.LS'].state, 'wrong');
  assert.equal(g.cells['H.LS'].expect, 10);
  assert.equal(g.cells['H.LS'].right, 11);
  assert.equal(g.cells['H.LS'].value, 9);
  assert.equal(g.cells['H.LS'].formula, 'LS');
  assert.deepEqual(g.cells['H.LS'].uses, ['H.LF']);
  assert.deepEqual(g.cells['H.LF'].uses, ['K.LS']);
  assert.deepEqual(g.cells['B.FF'].uses, ['E.ES', 'F.ES', 'G.ES', 'B.EF']);
  assert.deepEqual(g.cells['E.IF'].uses, ['H.ES', 'I.ES', 'A.LF', 'B.LF']);
  assert.deepEqual(g.cells['E.SF'].uses, ['E.LF', 'A.LF', 'B.LF']);
  assert.deepEqual(g.cells['E.TF'].uses, ['E.LS', 'E.ES']);
  assert.deepEqual(g.cells.dur.uses, ['K.EF']);
  assert.equal(g.cells['e1.TE'].formula, 'TE');
  assert.deepEqual(g.cells['e1.TE'].uses, []);
});

test('AC8: solo las casillas pedidas, y la nota solo cuenta esas', () => {
  const p = fromEx('ej6');
  const sol = K.solve(p);
  const ans = solutionAnswers(sol);
  const n = p.activities.length;
  const N = sol.net.events.length;
  const count = (ask) => Object.keys(K.grade(sol, ans, ask).cells);
  assert.equal(count(['times']).length, 4 * n + 1);
  assert.equal(count(['floats']).length, 3 * n);
  assert.equal(count(['floats', 'sf']).length, 4 * n);
  assert.equal(count(['sf']).length, 0);                    // sf solo con floats
  assert.equal(count(['events']).length, 3 * N);
  assert.equal(count(['critical']).length, n);
  assert.ok(count(['times']).every((k) => /\.(ES|EF|LS|LF)$|^dur$/.test(k)));
  const g = K.grade(sol, ans, ['times', 'critical']);
  assert.equal(g.score.total, 4 * n + 1 + n + 1);           // casillas, críticas y un camino crítico
  assert.equal(g.score.pct, 100);
  assert.deepEqual(K.grade(sol, ans, ['times']).paths, { written: [], right: [], expect: [] });
});

test('AC9: los sucesos se corrigen sobre la red de las reglas, con su error consecuente', () => {
  const p = fromEx('ej6');
  const sol = K.solve(p);
  const ans = O.answersFrom(O.fromProject(p), sol.net, { 'e5.TE': 6 }, ['events']);
  const g = K.grade(sol, ans, ['events']);
  assert.equal(g.cells['e5.TE'].state, 'wrong');
  assert.equal(g.cells['e5.TE'].right, 7);
  assert.equal(g.cells['e9.TE'].right, 13);
  assert.equal(g.cells['e9.TL'].formula, 'TL');
  assert.deepEqual(g.cells['e9.TL'].uses, ['e9.TE']);
  assert.ok(Object.values(g.cells).filter((c) => c.state === 'carried').length > 0);
  assert.equal(Object.values(g.cells).filter((c) => c.state === 'wrong').length, 1);
});

test('críticas y caminos: con las holguras del alumno si las escribió; caminos de más restan; total si no forman ninguno', () => {
  const p = fromEx('ej6');
  const sol = K.solve(p);
  const ans = solutionAnswers(sol);
  assert.deepEqual(K.grade(sol, ans, ['critical']).paths.right, [['B', 'E', 'I', 'J', 'K']]);
  // marca F como crítica habiendo escrito TF de F = 0 (mal): la marca es consecuente
  ans.act.F.TF = '0'; ans.crit = ans.crit.concat(['F']);
  let g = K.grade(sol, ans, ['floats', 'critical']);
  assert.equal(g.cells['F.TF'].state, 'wrong');
  assert.equal(g.cells['F.crit'].state, 'carried');
  g = K.grade(sol, ans, ['critical']);                       // sin holguras pedidas, se juzga con la solución
  assert.equal(g.cells['F.crit'].state, 'wrong');
  // un camino de más resta; uno repetido cuenta como de más
  const a2 = solutionAnswers(sol);
  a2.paths = ['B-E-I-J-K', 'b e i j k', 'A-E-I-J-K'];
  g = K.grade(sol, a2, ['critical']);
  assert.deepEqual(g.paths.written.map((w) => w.state), ['ok', 'wrong', 'wrong']);
  assert.deepEqual(g.paths.written[1].acts, ['B', 'E', 'I', 'J', 'K']);
  assert.equal(g.score.total, p.activities.length + 1);
  assert.equal(g.score.got, p.activities.length + 0);       // 1 bien − 2 de más, sin bajar de 0
  // sin críticas marcadas no hay caminos esperados: el total es el de la solución
  const a3 = solutionAnswers(sol); a3.crit = []; a3.paths = [];
  g = K.grade(sol, a3, ['critical']);
  assert.deepEqual(g.paths.expect, []);
  assert.equal(g.score.total, p.activities.length + 1);
  // un camino esperado empieza en una actividad inicial y acaba en una final, aunque un tramo dure lo que dice el alumno
  const a4 = solutionAnswers(sol); a4.dur = '10'; a4.crit = ['E', 'I', 'J', 'K']; a4.paths = ['E-I-J-K'];
  g = K.grade(sol, a4, ['times', 'critical']);
  assert.deepEqual(g.paths.expect, []);
  assert.equal(g.paths.written[0].state, 'wrong');
  // un camino con actividades que no existen no es válido
  a3.paths = ['B-E-X'];
  assert.equal(K.grade(sol, a3, ['critical']).paths.written[0].state, 'invalid');
});

test('el dato del alumno solo vale si es un número; con la duración del alumno, las finales toman su LF de ella', () => {
  const p = fromEx('ej6');
  const sol = K.solve(p);
  const ans = solutionAnswers(sol);
  ans.dur = '14'; ans.act.K.LF = '14'; ans.act.K.LS = '13';
  const g = K.grade(sol, ans, ['times']);
  assert.equal(g.cells.dur.state, 'wrong');
  assert.equal(g.cells['K.LF'].state, 'carried');
  assert.equal(g.cells['K.LS'].state, 'carried');
  ans.dur = 'trece';
  const g2 = K.grade(sol, ans, ['times']);
  assert.equal(g2.cells.dur.state, 'invalid');
  assert.equal(g2.cells['K.LF'].state, 'wrong');            // sin duración válida, se espera la correcta (13)
  assert.equal(g2.cells['K.LF'].expect, 13);
});
