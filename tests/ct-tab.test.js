'use strict';
// js/ct: la parte sin DOM del controlador de la pestaña de coste–tiempo (spec f5b-coste-tiempo, AC8 y AC9; plan §4, P1; T010).
const test = require('node:test');
const assert = require('node:assert/strict');
const T = require('../js/ct.js');
const U = require('../js/core/urlstate.js');
const X = require('../js/core/crashex.js');

const st = (extra) => Object.assign(U.defaults(), { v: 'ct' }, extra);
const row = (id, links, dn, dc, cn, cc) => ({ id, name: '', links, dn, dc, cn, cc });

test('F5b T010: un ejemplo da su tabla, su fuente, sus unidades y sus costes del proyecto', () => {
  const m = T.model(st({ ke: 'ni' }), 'es');
  assert.deepEqual([m.src.kind, m.src.id, m.src.unit, m.src.costUnit], ['example', 'ni', 'semanas', 'miles de dólares']);
  assert.equal(m.p.activities.length, 7);
  assert.deepEqual(m.k, X.get('ni').k);
  assert.equal(m.edited, false);
  // Un ejemplo que no existe: el primero.
  assert.equal(T.model(st({ ke: 'nada' }), 'en').src.id, 'kl');
});

test('F5b T010: los costes escritos (kc) mandan sobre los del ejemplo; la tabla propia sin kc no tiene costes', () => {
  const kc = { fixed: 1, perUnit: null, due: null, penalty: null, bonus: null };
  assert.deepEqual(T.model(st({ ke: 'kl', kc }), 'es').k, kc);
  assert.equal(T.model(st({ ke: 'kl', kc }), 'es').edited, true);
  const own = T.model(st({ ke: 'own', kt: [row('A', '', '3', '2', '1', '2')] }), 'es');
  assert.deepEqual(own.k, { fixed: null, perUnit: null, due: null, penalty: null, bonus: null });
  assert.equal(own.src.title, 'Tabla propia');
});

test('F5b T010: marcas de la tabla propia: campos con error, avisos y el texto de cada uno, en los dos idiomas', () => {
  const kt = [row('A', '', '7', '5', '60', '76'), row('B', '', '6', '7', '85', '95'), row('C', 'A, B', '15', '13', '55', '45'), row('D', 'B', '10', '', '', ''), row('E', 'Z', '4.5', '2', 'x', '1')];
  for (const lang of ['es', 'en']) {
    const m = T.model(st({ ke: 'own', kt }), lang);
    const mk = T.rowMarks(m, lang);
    assert.deepEqual([...mk.rows.get(1).bad], ['dc']);
    assert.deepEqual([...mk.rows.get(2).bad], ['cc']);
    assert.deepEqual([...mk.rows.get(3).warn], ['dc', 'cn', 'cc']);
    assert.deepEqual([...mk.rows.get(4).bad].sort(), ['cn', 'cc', 'dn', 'links'].sort());
    assert.deepEqual(mk.badRows, ['B', 'C', 'E']);
    for (const r of mk.rows.values()) for (const x of r.msgs) assert.ok(x.text && !/^ct\./.test(x.text), x.text);
  }
  assert.match(T.issueText({ code: 'noCrash', ids: ['D'] }, 'es'), /^Sin punto urgente: D/);
  assert.match(T.issueText({ code: 'cycle', ids: ['A', 'B'] }, 'en'), /A, B/);
});

test('F5b T010: pegar filas (con o sin cabecera) y leer un coste escrito', () => {
  assert.deepEqual(T.pasteRows('Act\tName\tPred\tNormal\tCrash\tCn\tCc\nA\tUno\t\t7\t5\t60\t76\nB\t\tA\t6\t4\t85\t95'),
    [{ id: 'A', name: 'Uno', links: '', dn: '7', dc: '5', cn: '60', cc: '76' }, { id: 'B', name: '', links: 'A', dn: '6', dc: '4', cn: '85', cc: '95' }]);
  assert.deepEqual(T.pasteRows('A;;;3;2;1;2'), [{ id: 'A', name: '', links: '', dn: '3', dc: '2', cn: '1', cc: '2' }]);
  assert.deepEqual(T.pasteRows('  \n'), []);
  assert.equal(T.parseCost(''), null);
  assert.equal(T.parseCost(' 12,5 '), 12.5);
  assert.equal(T.parseCost('7'), 7);
  for (const bad of ['x', '-1', '1e3', '1,23456']) assert.equal(T.parseCost(bad), undefined, bad);
  assert.deepEqual(T.workRows([{ id: 'A', duration: 3, links: 'B' }]), [{ id: 'A', name: '', duration: '3', links: 'B' }]);
});

// ---------- T011: tabla de la compresión, curva y duración elegida (AC6, AC10; tableros 123, 125 y 127) ----------

const CH = require('../js/views/ct-chart.js');

test('F5b T011 · AC6: la compresión de Klastorin, fila a fila: regla, óptimo y totales, con el mínimo a 19 semanas (Tema 6c, diapositivas 10–16)', () => {
  const m = T.model(st({ ke: 'kl' }), 'es');
  const c = T.compression(m);
  assert.deepEqual(c.rows.map((r) => r.T), [22, 21, 20, 19, 18]);
  assert.deepEqual(c.rows.map((r) => r.rule), [320, 328, 338, 348, 361]);
  assert.deepEqual(c.rows.map((r) => r.opt), [320, 328, 338, 348, 361]);
  assert.deepEqual(c.rows.map((r) => r.tot.total), [489, 485, 483, 481, 487]);
  assert.deepEqual(c.rows.map((r) => r.set), [[], ['A'], ['C'], ['C'], ['A', 'B']]);
  assert.deepEqual([c.best, c.hasCosts, c.normalT, c.minT], [[19], true, 22, 18]);
  assert.equal(c.rows.some((r) => r.above), false);
  assert.match(c.end.path.join('–'), /A–C/);
  // La misma tabla para el mismo proyecto y costes: se calcula una vez.
  assert.equal(T.compression(T.model(st({ ke: 'kl' }), 'en')), c);
});

test('F5b T011 · AC10: la duración elegida: kd, o la de coste total mínimo, dentro de [mínima, normal]', () => {
  const c = T.compression(T.model(st({ ke: 'kl' }), 'es'));
  assert.equal(T.chosenT(st({ ke: 'kl' }), c), 19);
  assert.equal(T.chosenT(st({ ke: 'kl', kd: 21 }), c), 21);
  assert.equal(T.chosenT(st({ ke: 'kl', kd: 40 }), c), 22);
  assert.equal(T.chosenT(st({ ke: 'kl', kd: 3 }), c), 18);
  // Nicholas: 20 semanas (129); con prima y penalización, la primera de las empatadas (19).
  assert.equal(T.chosenT(st({ ke: 'ni' }), T.compression(T.model(st({ ke: 'ni' }), 'es'))), 20);
  const nip = T.compression(T.model(st({ ke: 'nip' }), 'es'));
  assert.deepEqual(nip.best, [19, 20]);
  assert.equal(T.chosenT(st({ ke: 'nip' }), nip), 19);
});

test('F5b T011 · AC4 y P8: la regla que falla: marca en 8 y 7, el movimiento en la primera, y sin costes del proyecto la duración normal', () => {
  const m = T.model(st({ ke: 'rf' }), 'es');
  const c = T.compression(m);
  assert.deepEqual(c.rows.map((r) => [r.T, r.rule, r.opt, r.above]), [[12, 60, 60, false], [11, 63, 63, false], [10, 68, 68, false], [9, 75, 75, false],
    [8, 85, 83, true], [7, 95, 93, true]]);
  assert.equal(c.hasCosts, false);
  assert.deepEqual(c.best, [12]);
  assert.equal(c.first.T, 8);
  assert.deepEqual([c.first.move.shorten, c.first.move.lengthen, c.first.move.cost], [['B', 'E'], ['C'], 8]);
  assert.equal(T.moveTerms(m, c.first.move, 'es'), '6 + 4 − 2');
  // Las duraciones de las redes: las de la regla, o con el conmutador, las del óptimo.
  const r8 = c.rows.find((r) => r.T === 8);
  assert.deepEqual(r8.optD, { A: 5, B: 3, C: 2, D: 5, E: 3 });
  assert.notDeepEqual(r8.d, r8.optD);
});

test('F5b T011 · AC10: marcas de las redes: −1 en las que se acortan en el paso y «mín.» en las que están en su duración urgente', () => {
  const m = T.model(st({ ke: 'kl' }), 'es');
  const r19 = T.compression(m).rows.find((r) => r.T === 19);
  const tags = T.netTags(m.p, r19.d, r19.set);
  assert.deepEqual([...tags.keys()], ['C']);
  assert.deepEqual(tags.get('C'), ['short', 'min']);
  const r18 = T.compression(m).rows.find((r) => r.T === 18);
  assert.deepEqual(Object.fromEntries(T.netTags(m.p, r18.d, r18.set)), { A: ['short', 'min'], B: ['short'], C: ['min'] });
  // Sin paso (la duración normal) no hay marcas.
  assert.equal(T.netTags(m.p, T.compression(m).rows[0].d, []).size, 0);
});

test('F5b T011 · la curva (views/ct-chart): series, mínimos y escalas, sin DOM', () => {
  const m = T.model(st({ ke: 'rf' }), 'es');
  const spec = T.curveSpec(m, T.compression(m), 8, 'es');
  assert.deepEqual(spec.series.map((x) => x.key), ['direct', 'rule']);
  assert.deepEqual(spec.series[0].pts.map((q) => q[0]), [7, 8, 9, 10, 11, 12]);
  assert.deepEqual(spec.best, [12]);
  const kl = T.model(st({ ke: 'kl' }), 'es');
  const s2 = T.curveSpec(kl, T.compression(kl), 19, 'es');
  assert.deepEqual(s2.series.map((x) => x.key), ['total', 'direct', 'extra']);
  assert.deepEqual(s2.series[0].pts.find((q) => q[0] === 19), [19, 481]);
  const sc = CH.scales(s2);
  assert.ok(sc.X(18) < sc.X(22));
  assert.ok(sc.Y(481) > sc.Y(489));
  assert.ok(sc.lo <= 0 && sc.top >= 489);
});
