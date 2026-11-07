'use strict';
// predict: corrección del modo predicción (AC7).
const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../js/core/project.js');
const E = require('../js/core/examples.js');
const C = require('../js/core/cpm.js');
const Pr = require('../js/predict.js');

const ex = E.get('ej6');
const s = C.solve(P.parse(ex.rows, ex.mode).project);
const stepE = s.trace.find((x) => x.kind === 'forward' && x.act === 'E');
const stepFF = s.trace.find((x) => x.kind === 'float' && x.float === 'FF');

test('correcto, incorrecto y vacío, campo a campo', () => {
  const r = Pr.check(stepE, new Map([['E.ES', '3'], ['E.EF', '8']]));
  assert.deepEqual([...r], [['E.ES', 'ok'], ['E.EF', 'wrong']]);
  const r2 = Pr.check(stepE, new Map([['E.ES', '  ']]));
  assert.deepEqual([...r2.values()], ['empty', 'empty']);
});

test('acepta coma decimal y compara redondeando a 2 decimales', () => {
  const step = { reveals: [{ act: 'A', field: 'EF', value: 2.333333 }] };
  assert.equal(Pr.check(step, new Map([['A.EF', '2,33']])).get('A.EF'), 'ok');
  assert.equal(Pr.check(step, new Map([['A.EF', '2.3']])).get('A.EF'), 'wrong');
  assert.equal(Pr.check(step, new Map([['A.EF', 'dos']])).get('A.EF'), 'wrong');
});

test('en un paso de holguras se corrige toda la columna y el resumen cuenta cada caso', () => {
  const answers = new Map([['A.FF', '1'], ['B.FF', '0'], ['C.FF', '3'], ['D.FF', '4']]);
  const r = Pr.check(stepFF, answers);
  assert.equal(r.size, 11);
  assert.equal(r.get('C.FF'), 'wrong');
  assert.deepEqual(Pr.summary(r), { ok: 3, wrong: 1, empty: 7 });
});

test('solo hay predicción en los pasos que revelan valores', () => {
  assert.equal(Pr.hasPrediction(stepE), true);
  assert.equal(Pr.hasPrediction(s.trace[0]), false);
  assert.equal(Pr.hasPrediction(s.trace.find((x) => x.kind === 'critical')), false);
});
