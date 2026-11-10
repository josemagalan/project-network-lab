'use strict';
// Comprobaciones a mano del oráculo de la corrección (plan f3a-generador-calculo, T004).
const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../js/core/project.js');
const E = require('../js/core/examples.js');
const A = require('../js/core/aoa.js');
const O = require('./oracle-grade.js');

const ej6 = () => { const ex = E.get('ej6'); const p = P.parse(ex.rows, ex.mode).project; return { t: O.fromProject(p), net: A.build(p) }; };
const ALL = ['times', 'events', 'floats', 'sf', 'critical'];

test('Ej. 6 (Mecánicas del Sureste, Tema 6a): la solución por definición es la del tema (13 días)', () => {
  const { t } = ej6();
  const s = O.solution(t);
  assert.equal(s.dur, 13);
  assert.deepEqual(t.ids.map((a) => s.act[a].ES), [0, 0, 0, 0, 3, 3, 3, 7, 7, 9, 12]);
  assert.deepEqual(t.ids.map((a) => s.act[a].LF), [3, 3, 5, 12, 7, 7, 7, 12, 9, 12, 13]);
  assert.deepEqual(t.ids.map((a) => s.act[a].TF), [1, 0, 3, 4, 0, 1, 2, 4, 0, 0, 0]);
  assert.deepEqual(t.ids.map((a) => s.act[a].IF), [1, 0, 1, 4, 0, 1, 0, 4, 0, 0, 0]);
});

test('Ej. 6 resuelto: todo ok', () => {
  const { t, net } = ej6();
  const ans = O.answersFrom(t, net, {}, ALL);
  const r = O.classify(t, net, ans, ALL);
  assert.ok(Object.values(r.cells).every((s) => s === 'ok'), JSON.stringify(r.cells));
  assert.deepEqual(r.paths, ['ok']);
  assert.deepEqual(ans.paths, ['B-E-I-J-K']);
});

test('Ej. 6 con el ES de E mal (2 en lugar de 3): una wrong y las que dependen de ella, carried', () => {
  const { t, net } = ej6();
  const ans = O.answersFrom(t, net, { 'E.ES': 2 }, ALL);
  const r = O.classify(t, net, ans, ALL);
  assert.equal(r.cells['E.ES'], 'wrong');
  assert.equal(ans.act.E.EF, '6');
  for (const k of ['E.EF', 'H.ES', 'I.ES', 'J.ES', 'K.ES', 'dur', 'K.LF']) assert.equal(r.cells[k], 'carried', k);
  for (const k of ['A.ES', 'B.ES', 'C.ES', 'D.ES', 'F.ES', 'G.ES', 'A.EF']) assert.equal(r.cells[k], 'ok', k);
  assert.equal(Object.values(r.cells).filter((s) => s === 'wrong').length, 1);
});

test('una casilla vacía cuenta como no contestada y las que dependen de ella usan el valor correcto', () => {
  const { t, net } = ej6();
  const ans = O.answersFrom(t, net, {}, ['times']);
  ans.act.E.EF = '';
  ans.act.H.ES = 'siete';
  const r = O.classify(t, net, ans, ['times']);
  assert.equal(r.cells['E.EF'], 'blank');
  assert.equal(r.cells['H.ES'], 'invalid');
  assert.equal(r.cells['I.ES'], 'ok');   // máx(EF de E correcto = 7, EF de F = 6, EF de G = 5)
  assert.equal(r.cells['H.EF'], 'ok');   // ES de H no válido → el correcto (7) + 1
});

test('holgura total: vale LS − ES o LF − EF con los datos del alumno', () => {
  const { t, net } = ej6();
  const ans = O.answersFrom(t, net, {}, ['times', 'floats']);
  ans.act.A.LS = '2'; ans.act.A.TF = '2';      // LS mal (debía ser 1): TF = LS − ES = 2 → carried
  let r = O.classify(t, net, ans, ['times', 'floats']);
  assert.equal(r.cells['A.LS'], 'wrong');
  assert.equal(r.cells['A.TF'], 'carried');
  ans.act.A.LS = '1'; ans.act.A.EF = '1'; ans.act.A.TF = '2';   // EF mal: TF = LF − EF = 3 − 1 = 2 → carried
  r = O.classify(t, net, ans, ['times', 'floats']);
  assert.equal(r.cells['A.TF'], 'carried');
});
