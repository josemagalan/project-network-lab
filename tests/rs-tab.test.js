'use strict';
// js/rs: la parte sin DOM del controlador de la vista de recursos (spec f5c-recursos, AC8 y AC9; plan §4, P1; T009).
const test = require('node:test');
const assert = require('node:assert/strict');
const T = require('../js/rs.js');
const U = require('../js/core/urlstate.js');
const X = require('../js/core/resex.js');

const st = (extra) => Object.assign(U.defaults(), { v: 'rs' }, extra);
const row = (id, links, d, r1, r2, r3, name) => ({ id, name: name || '', links, d, r1: r1 || '', r2: r2 || '', r3: r3 || '' });

test('F5c T009: un ejemplo da su tabla, su fuente, su unidad, sus recursos y su modo', () => {
  for (const ex of X.list()) {
    for (const lang of ['es', 'en']) {
      const m = T.model(st({ we: ex.id }), lang);
      assert.deepEqual([m.src.kind, m.src.id, m.src.unit, m.src.source, m.mode], ['example', ex.id, ex.unit[lang], ex.source[lang], ex.mode]);
      assert.deepEqual(m.res.map((r) => [r.label, r.cap]), ex.res.map((r) => [r.name[lang], r.cap]));
      assert.equal(m.p.activities.length, ex.rows.length, ex.id);
      assert.deepEqual(m.report.errors, []);
    }
  }
  // Un ejemplo que no existe: el primero (Klastorin 8.1).
  assert.equal(T.model(st({ we: 'nada' }), 'en').src.id, 'k81');
});

test('F5c T009: el modo de la URL manda sobre el del ejemplo; con recursos limitados, la disponibilidad cuenta (overCap)', () => {
  assert.equal(T.model(st({ we: 'lg' }), 'es').mode, 'lev');
  assert.equal(T.model(st({ we: 'lg', wm: 'lim' }), 'es').mode, 'lim');
  assert.equal(T.model(st({ we: 'k85', wm: 'lev' }), 'es').mode, 'lev');
  // En un ejemplo, wr cambia la disponibilidad y un nombre vacío es el del ejemplo.
  const m = T.model(st({ we: 'k85', wr: [{ name: '', cap: 6 }] }), 'es');
  assert.deepEqual(m.res.map((r) => [r.label, r.cap]), [['Trabajadores', 6]]);
  assert.deepEqual(m.report.errors.map((e) => [e.code, e.ids[0]]), [['overCap', 'D'], ['overCap', 'E']]);
});

test('F5c T009: la tabla propia: un recurso sin límite si no hay wr; nombres por defecto «Recurso n»; hasta tres', () => {
  const wt = [row('A', '', '3', '2'), row('B', 'A', '2', '1')];
  let m = T.model(st({ we: 'own', wt }), 'es');
  assert.deepEqual([m.src.kind, m.src.title, m.mode, m.res.map((r) => [r.label, r.cap])], ['own', 'Tabla propia', 'lev', [['Recurso 1', null]]]);
  assert.ok(m.p);
  m = T.model(st({ we: 'own', wt, wr: [{ name: 'Grúa', cap: 2 }, { name: '', cap: null }, { name: 'Pintores', cap: 4 }] }), 'en');
  assert.deepEqual(m.res.map((r) => [r.label, r.cap]), [['Grúa', 2], ['Resource 2', null], ['Pintores', 4]]);
  // Las filas del editor de recursos: siempre tres, con lo escrito.
  assert.deepEqual(T.resRows(st({ we: 'own', wt, wr: [{ name: 'Grúa', cap: 2 }] })), [{ name: 'Grúa', cap: '2' }, { name: '', cap: '' }, { name: '', cap: '' }]);
  // Lo escrito en el editor → wr: se quitan los recursos sin nombre del final (el primero siempre cuenta).
  assert.deepEqual(T.resFromRows([{ name: 'Grúa', cap: '2' }, { name: '', cap: '' }, { name: '', cap: '' }]), [{ name: 'Grúa', cap: '2' }]);
  assert.deepEqual(T.resFromRows([{ name: '', cap: '' }, { name: '', cap: '5' }, { name: 'C', cap: '' }]), [{ name: '', cap: '' }, { name: '', cap: '5' }, { name: 'C', cap: '' }]);
  assert.deepEqual(T.resFromRows([{ name: '', cap: '' }, { name: '', cap: '' }, { name: '', cap: '' }]), [{ name: '', cap: '' }]);
});

test('F5c T009: marcas de la tabla propia: campos con error, avisos, hitos y el texto de cada uno, en los dos idiomas', () => {
  const wt = [row('A', '', '4', '3', '2'), row('B', 'A', '2.5', '1'), row('C', 'A', '3', '12', '1'), row('D', 'B, C', '2', '', ''), row('E', 'C', '0', '2'), row('F', 'D, E', '3', '-1', '2'), row('G', 'Z', '1', '1')];
  const wr = [{ name: 'Trabajadores', cap: 10 }, { name: 'Grúa', cap: null }];
  for (const lang of ['es', 'en']) {
    const m = T.model(st({ we: 'own', wt, wr, wm: 'lim' }), lang);
    assert.equal(m.p, null);
    const mk = T.rowMarks(m, lang);
    assert.deepEqual([...mk.rows.get(1).bad], ['d']);
    assert.deepEqual([...mk.rows.get(2).bad], ['r1']);
    assert.deepEqual([...mk.rows.get(3).warn], ['r1', 'r2']);
    assert.deepEqual(mk.rows.get(4).msgs.map((x) => x.kind), ['info']);
    assert.deepEqual([...mk.rows.get(5).bad], ['r1']);
    assert.deepEqual([...mk.rows.get(6).bad], ['links']);
    assert.deepEqual(mk.badRows, ['B', 'C', 'F', 'G']);
    for (const r of mk.rows.values()) for (const x of r.msgs) assert.ok(x.text && !/\{|undefined/.test(x.text), x.text);
    const over = mk.rows.get(2).msgs[0].text;
    assert.ok(over.includes('12') && over.includes('10') && over.includes('Trabajadores'), over);
  }
  // Nivelando, la disponibilidad no cuenta: C no da error.
  const lev = T.model(st({ we: 'own', wt: [wt[0], wt[2], row('D', 'C', '2', '', ''), wt[4]], wr, wm: 'lev' }), 'es');
  assert.ok(lev.p);
  assert.deepEqual(lev.report.warnings.map((w) => w.code), ['noUse']);
});

test('F5c T009: pegar desde una hoja de cálculo (con cabeceras o sin ellas) con tantos usos como recursos', () => {
  const text = 'Actividad\tNombre\tPredecesoras\tDuración\tTrabajadores\tGrúa\nA\tCimientos\t\t4\t3\t1\nB\t\tA\t2\t5\n';
  assert.deepEqual(T.pasteRows(text, 2), [row('A', '', '4', '3', '1', '', 'Cimientos'), row('B', 'A', '2', '5', '', '')]);
  assert.deepEqual(T.pasteRows('A;;;3;2;1;9', 1), [row('A', '', '3', '2', '', '')]);
  assert.deepEqual(T.pasteRows('  \n', 1), []);
});

test('F5c T009: «Partir del taller» lleva las filas del taller tal cual', () => {
  assert.deepEqual(T.workRows([{ id: 'A', name: 'x', duration: 3, links: '' }]), [{ id: 'A', name: 'x', duration: '3', links: '' }]);
});
