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
  // sin críticas marcadas no hay caminos esperados: los caminos solo cuentan lo escrito (T018, decisión del autor)
  const a3 = solutionAnswers(sol); a3.crit = []; a3.paths = [];
  g = K.grade(sol, a3, ['critical']);
  assert.deepEqual(g.paths.expect, []);
  assert.equal(g.score.total, p.activities.length);
  // …los de la solución suman y los erróneos restan, sin bajar de 0
  const cellsGood = (gr) => Object.values(gr.cells).filter((c) => c.state === 'ok' || c.state === 'carried').length;
  a3.paths = ['B-E-I-J-K'];
  g = K.grade(sol, a3, ['critical']);
  assert.deepEqual([g.score.got, g.score.total], [cellsGood(g) + 1, p.activities.length + 1]);
  a3.paths = ['B-E-I-J-K', 'A-E-I-J-K'];
  g = K.grade(sol, a3, ['critical']);
  assert.deepEqual([g.score.got, g.score.total], [cellsGood(g), p.activities.length + 1]);
  a3.paths = [];
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

test('AC5 con caminos (T018): un solo error en un tiempo temprano, arrastrado en todo, solo pierde esa casilla también con los caminos pedidos', () => {
  // Si el error cambia la duración del proyecto, las holguras del alumno aguas arriba salen negativas y sus críticas no
  // forman ningún camino: los caminos que no puede deducir no se le exigen (antes perdía 1–3 puntos más en el 42–62 %).
  for (const lv of ['easy', 'medium', 'hard']) {
    let lost = 0;
    for (let sd = 1; sd <= 150; sd++) {
      const p = fromGen(sd, lv);
      const sol = K.solve(p);
      const rnd = R.mulberry32(sd * 7919 + 13);
      const cands = p.activities.filter((a) => p.preds[a.id].length && sol.cpm.times[a.id].ES >= 1).map((a) => a.id);
      const a = cands[R.int(rnd, 0, cands.length - 1)];
      for (const ask of [['times', 'floats', 'critical'], ALL]) {
        const ans = O.answersFrom(O.fromProject(p), sol.net, { [`${a}.ES`]: sol.cpm.times[a].ES - 1 }, ask);
        const g = K.grade(sol, ans, ask);
        assert.equal(g.cells[`${a}.ES`].state, 'wrong');
        if (g.score.got !== g.score.total - 1) lost++;
      }
    }
    assert.equal(lost, 0, `${lv}: casos que pierden más que la casilla`);
  }
  // El caso del tablero: el difícil 92846 con el ES de G mal (16 en lugar de 17).
  const p = fromGen(92846, 'hard');
  const sol = K.solve(p);
  const ans = O.answersFrom(O.fromProject(p), sol.net, { 'G.ES': 16 }, ['times', 'floats', 'critical']);
  assert.deepEqual(ans.paths, []);
  const g = K.grade(sol, ans, ['times', 'floats', 'critical']);
  assert.deepEqual([g.score.got, g.score.total], [112, 113]);
  // Si escribe los caminos de la solución, cuentan: el total crece con ellos.
  ans.paths = sol.cpm.criticalPaths.map((x) => x.acts.join('-'));
  const g2 = K.grade(sol, ans, ['times', 'floats', 'critical']);
  assert.deepEqual([g2.score.got, g2.score.total], [115, 116]);
});

// ---------- Revisión de cierre (T020, ronda 1) ----------

test('T020 B1: la nota nunca pasa del total y el 100 % exige no tener casillas mal (caminos de la solución que no se deducen de las marcas)', () => {
  const ask = ['times', 'floats', 'critical'];
  // Difícil, semilla 6: H.TF mal (3) y H sin marcar (error consecuente); escribe los 3 caminos críticos de la solución.
  const p = fromGen(6, 'hard');
  const sol = K.solve(p);
  const ans = solutionAnswers(sol);
  ans.act.H.TF = '3'; ans.crit = ans.crit.filter((x) => x !== 'H');
  const g = K.grade(sol, ans, ask);
  assert.equal(g.cells['H.TF'].state, 'wrong');
  assert.equal(g.cells['H.crit'].state, 'carried');
  assert.equal(g.paths.expect.length, 1);
  assert.equal(sol.cpm.criticalPaths.length, 3);
  assert.deepEqual(g.paths.written.map((w) => w.state), ['ok', 'ok', 'ok']);
  // Tope (decisión del autor): el apartado de caminos vale lo deducible de sus marcas; solo pierde H.TF.
  assert.deepEqual([g.score.got, g.score.total], [g.score.total - 1, Object.keys(g.cells).length + 1]);
  // Propiedad: quitar una marca crítica (y, a veces, escribir mal su holgura total) en 300 tablas.
  const r = R.mulberry32(20261111);
  for (const lv of ['easy', 'medium', 'hard']) {
    for (let sd = 1; sd <= 100; sd++) {
      const q = fromGen(sd, lv);
      const sq = K.solve(q);
      for (const ak of [ask, ['critical'], ALL]) {
        const a = solutionAnswers(sq);
        const x = a.crit[R.int(r, 0, a.crit.length - 1)];
        a.crit = a.crit.filter((y) => y !== x);
        if (r() < 0.5) a.act[x].TF = String(R.int(r, 1, 5));
        if (r() < 0.3) a.paths = a.paths.concat(['', a.paths[0]]);
        const gq = K.grade(sq, a, ak);
        const bad = Object.values(gq.cells).some((c) => c.state !== 'ok' && c.state !== 'carried') || gq.paths.written.some((w) => w.state === 'wrong' || w.state === 'invalid');
        assert.ok(gq.score.got <= gq.score.total, `${lv} ${sd} ${ak}: ${gq.score.got} de ${gq.score.total}`);
        if (bad) assert.ok(gq.score.pct < 100, `${lv} ${sd} ${ak}: 100 % con algo mal`);
      }
    }
  }
});

test('T020: un campo de camino vacío no cuenta (ni suma ni resta) y queda como «vacío»', () => {
  const sol = K.solve(fromEx('ej6'));
  const a = solutionAnswers(sol);
  const base = K.grade(sol, a, ['critical']).score;
  for (const paths of [['', 'B-E-I-J-K'], ['B-E-I-J-K', ''], ['', '  ', 'B-E-I-J-K']]) {
    a.paths = paths;
    const g = K.grade(sol, a, ['critical']);
    assert.deepEqual(g.score, base, JSON.stringify(paths));
    assert.deepEqual(g.paths.written.map((w) => w.state), paths.map((x) => (x.trim() ? 'ok' : 'blank')));
  }
});

test('T020: la holgura total que sale por LF − EF dice esa vía en `uses` y en `expect`', () => {
  const sol = K.solve(fromEx('ej6'));
  const a = solutionAnswers(sol);
  const T = sol.cpm.times.B;
  a.act.B.EF = String(T.EF + 2);                        // EF de B mal
  a.act.B.TF = String(T.LF - (T.EF + 2));               // y su TF por LF − EF
  let g = K.grade(sol, a, ['times', 'floats']);
  assert.equal(g.cells['B.TF'].state, 'carried');
  assert.deepEqual(g.cells['B.TF'].uses, ['B.LF', 'B.EF']);
  assert.equal(g.cells['B.TF'].expect, T.LF - (T.EF + 2));
  a.act.B.TF = String(T.LS - T.ES + 7);                 // ni por una vía ni por otra: la primera
  g = K.grade(sol, a, ['times', 'floats']);
  assert.equal(g.cells['B.TF'].state, 'wrong');
  assert.deepEqual(g.cells['B.TF'].uses, ['B.LS', 'B.ES']);
});

test('T020: tolerancia de 2 decimales, separadores de los caminos y nada pedido', () => {
  const sol = K.solve(fromEx('ej6'));
  const a = solutionAnswers(sol);
  for (const [v, st] of [['0.004', 'ok'], ['0,004', 'ok'], ['-0.004', 'ok'], ['0.006', 'wrong'], ['0.01', 'wrong']]) {
    a.act.A.ES = v;
    assert.equal(K.grade(sol, a, ['times']).cells['A.ES'].state, st, v);
  }
  a.act.A.ES = '0';
  for (const w of ['B→E→I→J→K', 'B,E,I,J,K', 'B;E;I;J;K', 'B>E>I>J>K', 'B – E – I – J – K', 'b e i j k', 'B->E->I->J->K']) {
    a.paths = [w];
    assert.equal(K.grade(sol, a, ['critical']).paths.written[0].state, 'ok', w);
  }
  assert.deepEqual(K.grade(sol, a, []).score, { got: 0, total: 0, pct: 0 });
  assert.deepEqual(K.grade(sol, a, ['sf']).score, { got: 0, total: 0, pct: 0 });
});
