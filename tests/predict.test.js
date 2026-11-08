'use strict';
// predict: corrección del modo predicción (AC7).
const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../js/core/project.js');
const E = require('../js/core/examples.js');
const C = require('../js/core/cpm.js');
const Pr = require('../js/predict.js');
const N = require('../js/narrate.js');

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

test('redondea al más cercano, no hacia abajo (revisión F16)', () => {
  const step = { reveals: [{ act: 'A', field: 'EF', value: 2.666667 }] };
  assert.equal(Pr.check(step, new Map([['A.EF', '2,67']])).get('A.EF'), 'ok');
  assert.equal(Pr.check(step, new Map([['A.EF', '2,66']])).get('A.EF'), 'wrong');
});

test('acepta exactamente lo que enseña la pantalla, también con tres decimales (revisión F17)', () => {
  for (const [value, lang] of [[0.285, 'es'], [1.005, 'en'], [1.255, 'es'], [12.345, 'en'], [7, 'es']]) {
    const step = { reveals: [{ act: 'A', field: 'ES', value }] };
    const onScreen = N.fmt(lang, value);
    assert.equal(Pr.check(step, new Map([['A.ES', onScreen]])).get('A.ES'), 'ok', `${value} se ve «${onScreen}»`);
    assert.equal(Pr.check(step, new Map([['A.ES', String(value)]])).get('A.ES'), 'ok', `${value} escrito entero`);
  }
});

test('acepta «.5» y «5.» como 0,5 y 5', () => {
  assert.equal(Pr.parseAnswer('.5'), 0.5);
  assert.equal(Pr.parseAnswer(',5'), 0.5);
  assert.equal(Pr.parseAnswer('5.'), 5);
  assert.ok(Number.isNaN(Pr.parseAnswer('.')));
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

// ---------- F2a · AC8: predicción en la red PERT ----------
const A = require('../js/core/aoa.js');

function pertNet(id) {
  const e = E.get(id);
  const p = P.parse(e.rows, e.mode, { structureOnly: !!e.structureOnly }).project;
  const net = A.build(p);
  if (!e.structureOnly) A.times(net, C.solve(p));
  return net;
}
const net6 = pertNet('ej6');
const net7 = pertNet('ej7');
const rule = (net, k) => net.trace.find((x) => x.kind === k);
const ans = (acts, count) => new Map([[Pr.RULE_ACTS, new Set(acts)], [Pr.RULE_COUNT, count]]);

test('AC8: hay predicción en los tres pasos de regla, también cuando la regla no se aplica', () => {
  for (const k of ['ruleEqual', 'ruleContained', 'ruleShared']) assert.equal(Pr.hasPrediction(rule(net6, k)), true, k);
  for (const k of ['succTable', 'place', 'number', 'critical']) assert.equal(Pr.hasPrediction(rule(net6, k)), false, k);
  for (const k of ['eventForward', 'eventBackward', 'eventSlack', 'floats']) assert.equal(Pr.hasPrediction(rule(net6, k)), true, k);
});

test('AC8: un paso de regla se corrige en dos campos, actividades (conjunto exacto) y número de ficticias', () => {
  const st = rule(net6, 'ruleContained');            // A, B, C, E, F, G · F1, F2, F3
  const ok = Pr.check(st, ans(['G', 'F', 'E', 'C', 'B', 'A'], '3'));
  assert.deepEqual([...ok], [[Pr.RULE_ACTS, 'ok'], [Pr.RULE_COUNT, 'ok']]);
  assert.equal(Pr.check(st, ans(['A', 'B', 'C', 'E', 'F'], '3')).get(Pr.RULE_ACTS), 'wrong', 'falta una');
  assert.equal(Pr.check(st, ans(['A', 'B', 'C', 'D', 'E', 'F', 'G'], '3')).get(Pr.RULE_ACTS), 'wrong', 'sobra una');
  assert.equal(Pr.check(st, ans(['A', 'B', 'C', 'E', 'F', 'G'], ' 2 ')).get(Pr.RULE_COUNT), 'wrong');
  assert.equal(Pr.check(st, ans(['A', 'B', 'C', 'E', 'F', 'G'], '3,5')).get(Pr.RULE_COUNT), 'wrong');
  assert.equal(Pr.check(st, ans(['A', 'B', 'C', 'E', 'F', 'G'], '')).get(Pr.RULE_COUNT), 'empty');
  assert.deepEqual(Pr.summary(Pr.check(st, ans(['A'], ''))), { ok: 0, wrong: 1, empty: 1 });
});

test('AC8: si la regla no se aplica, lo correcto es no marcar ninguna actividad y 0 ficticias', () => {
  const st = rule(net6, 'ruleEqual');
  assert.deepEqual([...Pr.check(st, ans([], '0')).values()], ['ok', 'ok']);
  assert.deepEqual([...Pr.check(st, new Map()).entries()], [[Pr.RULE_ACTS, 'ok'], [Pr.RULE_COUNT, 'empty']]);
  assert.equal(Pr.check(st, ans(['D'], '0')).get(Pr.RULE_ACTS), 'wrong');
});

test('AC8: Ejercicio 7, identidad (G e I, 1 ficticia) y compartidos (A, B y E, 4 ficticias)', () => {
  assert.deepEqual([...Pr.check(rule(net7, 'ruleEqual'), ans(['I', 'G'], '1')).values()], ['ok', 'ok']);
  assert.deepEqual([...Pr.check(rule(net7, 'ruleShared'), ans(['A', 'B', 'E'], '4')).values()], ['ok', 'ok']);
  assert.equal(Pr.check(rule(net7, 'ruleShared'), ans(['A', 'B', 'E'], '2')).get(Pr.RULE_COUNT), 'wrong');
});

test('AC8: ruleDiff dice qué actividades faltan y cuáles sobran, en orden', () => {
  const st = rule(net6, 'ruleContained');
  assert.deepEqual(Pr.ruleDiff(st, ans(['H', 'A', 'D', 'B'], '')), { missing: ['C', 'E', 'F', 'G'], extra: ['D', 'H'] });
  assert.deepEqual(Pr.ruleDiff(st, ans(['A', 'B', 'C', 'E', 'F', 'G'], '')), { missing: [], extra: [] });
  assert.deepEqual(Pr.ruleDiff(rule(net6, 'ruleShared'), new Map()), { missing: [], extra: [] });
});

test('AC8: las respuestas de regla también llegan como lista y no rompen los pasos de valores', () => {
  const st = rule(net6, 'ruleContained');
  const r = Pr.check(st, new Map([[Pr.RULE_ACTS, ['A', 'B', 'C', 'E', 'F', 'G']], [Pr.RULE_COUNT, '3']]));
  assert.deepEqual([...r.values()], ['ok', 'ok']);
  assert.equal(Pr.check(stepE, new Map([[Pr.RULE_ACTS, new Set(['A'])]])).has(Pr.RULE_ACTS), false);
});

test('AC8: los sucesos se predicen con el mecanismo general (tiempos y holgura de suceso)', () => {
  const f3 = net6.trace.find((x) => x.kind === 'eventForward' && x.event === 3);
  assert.deepEqual([...Pr.check(f3, new Map([['3.TE', '3']]))], [['3.TE', 'ok']]);
  const b5 = net6.trace.find((x) => x.kind === 'eventBackward' && x.event === 5);
  assert.equal(Pr.check(b5, new Map([['5.TL', '11']])).get('5.TL'), 'wrong');
  const sl = rule(net6, 'eventSlack');
  const r = Pr.check(sl, new Map([['4.slack', '2'], ['1.slack', '0']]));
  assert.equal(r.size, net6.events.length);
  assert.deepEqual(Pr.summary(r), { ok: 2, wrong: 0, empty: net6.events.length - 2 });
});
