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
