'use strict';
// ex: la lógica de «Ejercicios» que no necesita DOM (F3a, T010; AC4–AC10, AC13, AC14). La interacción con la página
// (escribir, Intro, comprobar, entregar, plegar la red, la selección sincronizada) la comprueban las pruebas de navegador.
const test = require('node:test');
const assert = require('node:assert/strict');
const U = require('../js/core/urlstate.js');
const P = require('../js/core/project.js');
const GEN = require('../js/core/generator.js');
const GR = require('../js/core/grade.js');
const OR = require('./oracle-grade.js');
const X = require('../js/ex.js');

const exState = (extra) => Object.assign(U.defaults(), { v: 'ex', ex: null, sd: 14844 }, extra || {});
// El alumno de los tableros 39 y 48: ES de D mal (8 en lugar de 11) y lo demás calculado con él.
function boardStudent(m, wrong, ask, extra) {
  const a = OR.answersFrom(OR.fromProject(m.project), m.sol.net, wrong, ask);
  return Object.assign(a, extra || {});
}

test('T010 · los niveles y «Personalizar» dan los parámetros del generador', () => {
  for (const lv of ['easy', 'medium', 'hard']) assert.deepEqual(X.params(exState({ lv })), GEN.LEVELS[lv]);
  const gp = { n: [6, 7], pred: 1.2, dummies: null, critical: [1, 1], dmax: 9 };
  assert.deepEqual(X.params(exState({ lv: 'custom', gp })), gp);
  // Sin parámetros guardados, «Personalizar» parte del nivel medio.
  assert.deepEqual(X.params(exState({ lv: 'custom', gp: null })), GEN.LEVELS.medium);
});

test('T010 · AC1: el modelo da la tabla del generador para la semilla y los parámetros, y la solución del núcleo', () => {
  for (const [sd, lv] of [[14844, 'medium'], [39595, 'easy'], [92846, 'hard']]) {
    const m = X.model(exState({ sd, lv }), 'es');
    const g = GEN.generate(sd, GEN.LEVELS[lv]);
    assert.deepEqual(m.rows, g.rows, `${lv} ${sd}`);
    assert.deepEqual(m.sol.cpm.times, GR.solve(P.parse(g.rows, 'pred').project).cpm.times);
    assert.equal(m.issues.length, 0);
    assert.equal(m.notFound, null);
  }
  // El mismo estado da el mismo objeto (sin volver a generar) y otra semilla, otra tabla.
  const a = X.model(exState(), 'es'); const b = X.model(exState(), 'en');
  assert.equal(a.rows, b.rows, 'la tabla generada se guarda por (versión, semilla, parámetros)');
  assert.notDeepEqual(X.model(exState({ sd: 14845 }), 'es').rows, a.rows);
});

test('T010 · AC14: parámetros imposibles se dicen antes de generar, y una tabla que no sale se dice sin bloquear', () => {
  const bad = X.model(exState({ lv: 'custom', gp: { n: [6, 7], pred: 1.2, dummies: [3, 4], critical: [1, 1], dmax: 9 } }), 'es');
  assert.equal(bad.rows, null);
  assert.deepEqual(bad.issues.map((i) => i.code), ['dummiesTooMany']);
  assert.equal(X.issueText(bad.issues[0], bad.params, 'es'), 'Con 7 actividades como mucho se pueden exigir 2 ficticias (un tercio de las actividades). Baja el mínimo de ficticias o sube el número de actividades.');
  assert.match(X.issueText(bad.issues[0], bad.params, 'en'), /^With 7 activities you can require at most 2 dummies/);
  const noExact = X.model(exState({ lv: 'custom', gp: { n: [17, 18], pred: 1.6, dummies: [2, 3], critical: [1, 2], dmax: 12 } }), 'es');
  assert.deepEqual(noExact.issues.map((i) => i.code), ['dummiesNoExact']);
  for (const lang of ['es', 'en']) assert.ok(X.issueText(noExact.issues[0], noExact.params, lang).length > 30);
  const nf = X.model(exState({ sd: 40, lv: 'custom', gp: { n: [16, 16], pred: 3.0, dummies: [5, 5], critical: [3, 3], dmax: 30 } }), 'es');
  assert.equal(nf.rows, null);
  assert.equal(nf.notFound.worst, 'critical');
  assert.equal(X.notFoundText(nf.notFound, 'es'), 'No he encontrado una tabla con estos parámetros en 500 intentos. Lo que más ha fallado: el número de caminos críticos. Prueba a pedir menos caminos críticos o menos predecesoras por actividad.');
  assert.match(X.notFoundText(nf.notFound, 'en'), /^I could not find a table with these parameters in 500 tries\./);
});

test('T010 · el resumen de cada nivel dice sus parámetros, con la coma decimal en español', () => {
  assert.equal(X.levelSummary(GEN.LEVELS.medium, 'es'), '9–10 actividades · 1,6 predecesoras de media · 2–3 ficticias · 1–2 caminos críticos · d de 1 a 12');
  assert.equal(X.levelSummary(GEN.LEVELS.easy, 'en'), '6–7 activities · 1.2 predecessors on average · 0–1 dummies · 1 critical path · d from 1 to 9');
  assert.equal(X.levelSummary({ n: [12, 12], pred: 2, dummies: null, critical: [3, 3], dmax: 15 }, 'es'), '12 actividades · 2 predecesoras de media · ficticias libres · 3 caminos críticos · d de 1 a 15');
});

test('T010 · AC8 y AC13: las columnas siguen lo que se pide y la notación', () => {
  assert.deepEqual(X.columns(['times', 'floats', 'critical'], 'en').act.map((c) => c.label), ['ES', 'EF', 'LS', 'LF', 'TF', 'FF', 'IF']);
  assert.deepEqual(X.columns(['times', 'floats', 'sf', 'critical'], 'es').act.map((c) => c.label), ['tᵢ', 'fᵢ', 'tᵢ*', 'fᵢ*', 'HT', 'HL', 'HI', 'HS']);
  assert.deepEqual(X.columns(['floats'], 'en').act.map((c) => c.f), ['TF', 'FF', 'IF']);
  const c = X.columns(['times', 'floats', 'critical'], 'en');
  assert.equal(c.crit, true); assert.equal(c.dur, true); assert.equal(c.events, null);
  const e = X.columns(['events'], 'es');
  assert.deepEqual(e.act, []); assert.equal(e.dur, false); assert.equal(e.crit, false);
  assert.deepEqual(e.events.map((x) => x.f), ['TE', 'TL', 'slack']);
  assert.deepEqual(X.columns(['events'], 'es').events.map((x) => x.sym), ['tᵢ', 'tᵢ*', '']);
  assert.deepEqual(X.columns(['events'], 'en').events.map((x) => x.sym), ['TE', 'TL', '']);
});

test('T010 · AC10: las respuestas se editan sin tocar el estado y van y vuelven por el enlace', () => {
  let a = X.empty();
  a = X.setCell(a, 'A.ES', '0');
  a = X.setCell(a, 'B.EF', '7,5');
  a = X.setCell(a, 'dur', '18');
  a = X.setCell(a, 'e3.TL', '9');
  a = X.toggleCrit(a, 'A', true);
  a = X.toggleCrit(a, 'B', true);
  a = X.toggleCrit(a, 'A', false);
  a = X.addPath(a); a = X.setPath(a, 0, 'A-E-J'); a = X.addPath(a); a = X.setPath(a, 1, 'B G');
  a = X.removePath(a, 0);
  assert.equal(X.empty().act.A, undefined, 'empty() no se comparte entre llamadas');
  assert.equal(a.act.A.ES, '0'); assert.equal(a.act.B.EF, '7,5'); assert.equal(a.dur, '18'); assert.equal(a.ev[3].TL, '9');
  assert.deepEqual(a.crit, ['B']); assert.deepEqual(a.paths, ['B G']);
  const s = exState({ ans: X.forUrl(a) });
  const back = U.decode(U.encode(s)).state;
  assert.deepEqual(X.answersOf(back), X.answersOf(s));
  assert.equal(X.hasAnswers(s), true);
  assert.equal(X.hasAnswers(exState()), false);
  assert.equal(X.forUrl(X.empty()), null, 'sin nada escrito no se escribe ans');
  // Lo escrito se guarda como texto, sin interpretarlo.
  assert.equal(X.setCell(X.empty(), 'A.ES', '<b>1</b>').act.A.ES, '<b>1</b>');
});

test('T010 · la semilla nueva sale de un número de 32 bits y cae en 1–999 999', () => {
  assert.equal(X.seedFrom(0), 1);
  assert.equal(X.seedFrom(999998), 999999);
  assert.equal(X.seedFrom(999999), 1);
  assert.equal(X.seedFrom(4294967295), 1 + (4294967295 % 999999));
});

test('T010 · AC7: sin pistas en Examen hasta entregar; en Practicar, «Comprobar» y el enlace a la solución', () => {
  assert.deepEqual(X.visibility(exState({ xm: 'practice' })), { check: true, deliver: false, step: true, marks: 'checked', locked: false });
  assert.deepEqual(X.visibility(exState({ xm: 'exam', xd: 0 })), { check: false, deliver: true, step: false, marks: 'none', locked: false });
  assert.deepEqual(X.visibility(exState({ xm: 'exam', xd: 1 })), { check: false, deliver: false, step: true, marks: 'always', locked: true });
  // Entregado, el modelo trae la corrección (también al recargar el enlace); sin entregar, no.
  const m = X.model(exState({ sd: 39595, lv: 'easy' }), 'es');
  const ans = boardStudent(m, { 'E.ES': 9 }, U.DEFAULT_ASK);
  assert.equal(X.model(exState({ sd: 39595, lv: 'easy', xm: 'exam', ans: X.forUrl(ans) }), 'es').grading, null);
  const done = X.model(exState({ sd: 39595, lv: 'easy', xm: 'exam', xd: 1, ans: X.forUrl(ans) }), 'es');
  assert.equal(done.grading.cells['E.ES'].state, 'wrong');
  assert.equal(done.grading.cells['E.EF'].state, 'carried');
});

test('T010 · AC5 y AC6: la explicación de cada casilla usa los datos del alumno y dice dónde empezó el error (tablero 39)', () => {
  const m = X.model(exState(), 'es');
  const ans = boardStudent(m, { 'D.ES': 8, 'C.FF': 0 }, U.DEFAULT_ASK, { paths: ['A-E-J', 'B-G'] });
  const g = GR.grade(m.sol, ans, U.DEFAULT_ASK);
  assert.equal(X.explain(m, ans, g, 'D.ES', 'es', 'en'), 'Has escrito 8. Con tus datos esperaba 11: ES de D = máx(EF de B = 8, EF de C = 11) = 11.');
  assert.equal(X.explain(m, ans, g, 'I.ES', 'es', 'en'), 'Has escrito 9, que sale bien de tus datos: ES de I = máx(EF de D = 9, EF de H = 9) = 9. No coincide con la solución porque arrastra un error anterior (empieza en ES de D): no se penaliza.');
  assert.equal(X.explain(m, ans, g, 'D.ES', 'en', 'en'), 'You wrote 8. With your data I expected 11: ES of D = max(EF of B = 8, EF of C = 11) = 11.');
  assert.equal(X.explain(m, ans, g, 'D.ES', 'es', 'es'), 'Has escrito 8. Con tus datos esperaba 11: tᵢ de D = máx(fᵢ de B = 8, fᵢ de C = 11) = 11.');
  assert.equal(X.explain(m, ans, g, 'A.ES', 'es', 'en'), '', 'una casilla correcta no se explica');
  assert.equal(X.origin(g, 'I.TF'), 'D.ES');
  assert.equal(X.counts(g).wrong, 1); assert.equal(X.counts(g).carried, 8);
  assert.equal(X.scoreText(g, 'es'), 'Nota: 98,8 % (82 de 83)');
  assert.equal(X.scoreText(g, 'en'), 'Score: 98.8% (82 of 83)');
  assert.equal(X.countText(g, 'es'), '1 incorrecta · 8 con error consecuente');
  assert.equal(X.countText(g, 'en'), '1 wrong · 8 with a carried error');
});

test('T010 · AC5: cada fórmula de la tabla de la spec se explica en ES y EN, con decimales y casillas vacías o no válidas', () => {
  const m = X.model(exState(), 'es');
  const ask = ['times', 'events', 'floats', 'sf', 'critical'];
  const ans = boardStudent(m, { 'D.ES': 8.5, 'e2.TE': 8, 'H.TF': 0 }, ask, { crit: ['A', 'B', 'C', 'E', 'G', 'H'], paths: ['A-E-J', 'A-H-I', 'B-G', 'B-G', 'X'] });
  ans.act.F.LS = ''; ans.act.G.IF = 'abc';
  const g = GR.grade(m.sol, ans, ask);
  const seen = new Set();
  for (const lang of ['es', 'en']) {
    for (const [key, c] of Object.entries(g.cells)) {
      const text = X.explain(m, ans, g, key, lang, lang === 'es' ? 'es' : 'en');
      if (c.state === 'ok') { assert.equal(text, ''); continue; }
      seen.add(`${c.formula}.${c.state}`);
      assert.ok(text.length > 20, `${lang} ${key} ${c.state}`);
      assert.doesNotMatch(text, /undefined|NaN|\{|\}/, `${lang} ${key}: ${text}`);
      if (lang === 'es') assert.doesNotMatch(text, /\d\.\d/, `coma decimal en español: ${text}`);
    }
    g.paths.written.forEach((w, i) => {
      const text = X.pathExplain(m, ans, i, g, lang);
      assert.ok(text.length > 10, `${lang} camino ${i}`);
      assert.doesNotMatch(text, /undefined|NaN|\{|\}/);
    });
  }
  for (const k of ['ES.wrong', 'EF.carried', 'TF.wrong', 'TE.wrong', 'TL.carried', 'slack.carried', 'crit.carried', 'crit.wrong', 'LS.blank', 'IF.invalid']) assert.ok(seen.has(k), k);
  assert.equal(X.explain(m, ans, g, 'F.LS', 'es', 'en'), 'Sin contestar. Para las casillas que dependen de esta se usa el valor correcto.');
  assert.equal(X.explain(m, ans, g, 'G.IF', 'en', 'en'), '«abc» is not a number: write a figure with a decimal comma or point.');
  assert.equal(X.explain(m, ans, g, 'e2.TE', 'es', 'es'), 'Has escrito 8. Con tus datos esperaba 7: temprano del suceso 2 = tᵢ(1) + d(A) = 0 + 7 = 7.');
  assert.equal(X.explain(m, ans, g, 'C.crit', 'en', 'en'), 'You marked C as critical, but your TF of C is 1: an activity is critical when its total float is 0.');
  assert.equal(X.pathExplain(m, ans, 1, g, 'en'), 'A-H-I lasts 7 + 2 + 5 = 14, not 18: a critical path lasts as long as the project.');
  assert.equal(X.pathExplain(m, ans, 3, g, 'es'), 'B-G ya está escrito.');
  assert.equal(X.pathExplain(m, ans, 4, g, 'es'), '«X» no es una secuencia de actividades de la tabla.');
});

test('T010 · AC12: «Ver la solución paso a paso» abre la ruta con la misma tabla (la PERT si solo se piden sucesos)', () => {
  const m = X.model(exState(), 'es');
  assert.deepEqual(X.stepState(exState(), m, 'acts'), { v: 'route', graph: 'aon', rows: m.rows, mode: 'pred' });
  assert.equal(X.stepState(exState({ ask: ['events'] }), m, 'events').graph, 'aoa');
  assert.equal(X.stepState(exState({ ask: ['times', 'events'] }), m, 'events').graph, 'aoa');
  assert.equal(X.stepState(exState({ ask: ['times', 'events'] }), m, 'acts').graph, 'aon');
});

test('T010 · antes de entregar, la confirmación cuenta las casillas vacías', () => {
  const m = X.model(exState({ sd: 39595, lv: 'easy' }), 'es');
  const ans = boardStudent(m, { 'E.ES': 9, 'D.FF': 0 }, U.DEFAULT_ASK, { paths: ['A-C'] });
  delete ans.act.B.IF; delete ans.act.G.FF; delete ans.act.G.IF; ans.act.G.TF = '';
  assert.equal(X.blanks(m, ans, U.DEFAULT_ASK), 4);
  assert.equal(X.blanks(m, X.empty(), ['critical']), 0, 'las casillas de verificación no cuentan como vacías');
});
