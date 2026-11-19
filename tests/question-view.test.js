'use strict';
// views/question-view: «Respuestas que acepta Moodle (salen del núcleo)», la parte sin DOM de la vista previa
// (spec f3e-probabilidad-montecarlo, AC14–AC16; T016; tableros 100–102).
const test = require('node:test');
const assert = require('node:assert/strict');
const QV = require('../js/views/question-view.js');
const M = require('../js/core/moodle.js');
const S = require('../js/core/series.js');
const IM = require('../js/i18n-moodle.js');
const CS = require('../js/views/chart-svg.js');

const q0 = {
  text: [
    { p: 'Con esta tabla:' },
    { table: { head: ['Actividad', 'ES', '¿Es crítica?', 'Predecesoras'], rows: [
      ['A', { num: 0, key: 'A.ES' }, { yesNo: true, key: 'A.crit' }, { mr: [{ label: 'B', fraction: 50 }, { label: 'C', fraction: '-50' }, { label: 'D', fraction: 50 }], key: 'A.p' }],
      ['B', { num: 7.5, tol: 0.01, key: 'B.ES' }, { yesNo: false, key: 'B.crit' }, 'ninguna'],
    ] } },
    { h: 'Parte 13 · Probabilidad de un plazo' },
    { p: 'P(T ≤ 30):', hole: { nums: [{ v: 0.8413, tol: 0.0005 }, { v: 0.84134, tol: 0.005 }], key: 'p' } },
    { p: 'Camino crítico de las medias:', hole: { mc: [{ label: 'A–B' }, { label: 'A–C', ok: true }], key: 'path' } },
    { fold: { summary: 'Los gráficos como tabla', blocks: [{ p: 'Dentro:', hole: { num: 3, key: 'in' } }] } },
  ],
  options: [{ text: 'Una ficticia de más', fraction: 0 }, { text: 'Falta un arco', fraction: 100 }],
};

test('F3e T016 · accepted: cada hueco con su etiqueta y lo que acepta Moodle, en el orden del texto (ES y EN)', () => {
  const es = QV.accepted(q0, IM.tr('es'), 'es');
  assert.deepEqual(es, [
    { label: 'A · ES', value: '0' },
    { label: 'A · ¿Es crítica?', value: 'Sí' },
    { label: 'A · Predecesoras', value: 'B, D' },
    { label: 'B · ES', value: '7,5 ± 0,01' },
    { label: 'B · ¿Es crítica?', value: 'No' },
    { head: 'Parte 13 · Probabilidad de un plazo' },
    { label: 'P(T ≤ 30)', value: '0,8413 ± 0,0005 · 0,84134 ± 0,005' },
    { label: 'Camino crítico de las medias', value: 'A–C' },
    { label: 'Dentro', value: '3' },
    { label: null, value: 'Falta un arco' },
  ]);
  const en = QV.accepted(q0, IM.tr('en'), 'en');
  assert.equal(en[1].value, 'Yes');
  assert.equal(en[3].value, '7.5 ± 0.01');
  assert.equal(en[6].value, '0.8413 ± 0.0005 · 0.84134 ± 0.005');
});

test('F3e T016 · accepted cubre todos los huecos de las preguntas del núcleo: etapas 11 a 17 y una serie', () => {
  const holes = (q) => (JSON.stringify(q.text).match(/"key":/g) || []).length;
  const chart = (m) => (m.kind === 'dist' ? CS.dist(m) : CS.indices(m));
  const ctx = { lang: 'es', nota: 'en', sf: false, labels: IM.labels('en'), chart };
  for (const st of ['tclMoments', 'tclPath', 'tclProb', 'mcRead', 'mcDisc', 'mcRep']) {
    let q = null;
    for (let sd = 1; sd < 50 && !q; sd++) q = M.question(st, M.exercise('easy', sd), ctx, IM.tr('es'));
    const acc = QV.accepted(q, IM.tr('es'), 'es');
    assert.equal(acc.filter((x) => 'value' in x).length, holes(q), st);
    assert.ok(acc.every((x) => x.head || (x.value && x.value !== 'undefined' && !/NaN/.test(x.value))), st);
  }
  const stages = ['early', 'floats', 'tclMoments', 'tclProb'];
  let q = null;
  for (let sd = 1; sd < 50 && !q; sd++) { const b = S.exercise(stages, 'easy', sd); q = b && S.question(stages, b, ctx, IM.tr('es')); }
  const acc = QV.accepted(q, IM.tr('es'), 'es');
  assert.equal(acc.filter((x) => 'value' in x).length, holes(q));
  assert.deepEqual(acc.filter((x) => x.head).map((x) => x.head), ['Parte 1 · Tiempos tempranos', 'Parte 3 · Holguras', 'Parte 11 · Medias y varianzas', 'Parte 13 · Probabilidad de un plazo']);
});

test('T021 I-F9 · accepted en las etapas 0 a 10 y en la 14; la opción correcta de «4b · Caminos críticos» es su camino (path)', () => {
  const NS = require('../js/views/net-svg.js');
  const ctx = { lang: 'es', nota: 'en', sf: false, labels: IM.labels('en'), svg: NS.render };
  const isHole = (c) => c && typeof c === 'object' && ['num', 'nums', 'mc', 'mr', 'yesNo'].some((k) => k in c);
  const count = (bs) => bs.reduce((n, b) => n + (b.table ? b.table.rows.flat().filter(isHole).length : 0) + (b.hole && isHole(b.hole) ? 1 : 0) + (b.fold ? count(b.fold.blocks) : 0), 0);
  for (const st of [...M.STAGES_ALL.slice(0, 12), 'tclRoute']) {
    let q = null;
    for (let sd = 1; sd < 80 && !q; sd++) q = st === 'tclRoute' ? M.question(st, M.stochExercise(st, 'easy', sd), ctx, IM.tr('es')) : M.question(st, M.exercise('easy', sd), ctx, IM.tr('es'));
    const acc = QV.accepted(q, IM.tr('es'), 'es');
    assert.equal(acc.filter((x) => x.label !== null && 'value' in x).length, count(q.text), st);
    assert.ok(acc.every((x) => x.head || (x.value && x.value !== 'undefined' && !/NaN/.test(x.value))), st);
    if (q.options) {
      const right = q.options.filter((o) => Number(o.fraction) > 0).map((o) => (o.text != null ? o.text : o.path));
      assert.ok(right.length && right.every(Boolean), st);
      assert.deepEqual(acc.filter((x) => x.label === null).map((x) => x.value), [right.join(' · ')], st);
    }
  }
  const q4b = M.question('critPath', M.exercise('easy', 1), ctx, IM.tr('es'));
  assert.ok(q4b.options.every((o) => o.text == null && o.path), 'las opciones de 4b llevan path, no text');
  assert.deepEqual(QV.accepted(q4b, IM.tr('es'), 'es').filter((x) => x.label === null), [{ label: null, value: 'A – B – D' }]);
});
