'use strict';
// m0: la lógica de practicar que no necesita DOM (F2c, T015; AC1, AC2, AC3, AC8, AC15). La interacción con la
// página (subrayar con ratón y teclado, la matriz y los saltos a M1 y M2) la comprueban las pruebas de navegador.
const test = require('node:test');
const assert = require('node:assert/strict');
const U = require('../js/core/urlstate.js');
const P = require('../js/core/project.js');
const S = require('../js/core/statement.js');
const ST = require('../js/core/statements.js');
const PC = require('../js/core/precheck.js');
const C = require('../js/core/cpm.js');
const M0 = require('../js/m0.js');

const m0State = (extra) => Object.assign(U.defaults(), { v: 'm0', st: 'ej5', ex: null }, extra || {});
const row = (id, duration, links = '', name = '') => ({ id, name, duration: String(duration), links });
const frag = (st, id) => st.frags.find((f) => f.id === id);

test('T015 · AC1: al abrir un enunciado, la tabla está vacía y no hay errores, avisos ni nada de la referencia', () => {
  for (const id of ST.list({ all: true }).map((s) => s.id)) {
    for (const lang of ['es', 'en']) {
      const m = M0.model(m0State({ st: id }), lang);
      assert.equal(m.st.id, id);
      assert.deepEqual(m.rows, []);
      assert.equal(m.project, null);
      assert.deepEqual(m.report.errors, []);
      assert.deepEqual(m.warnings, []);
      assert.deepEqual(m.explain.redundant, []);
    }
  }
  // Un enunciado desconocido no rompe: se abre el de por defecto.
  assert.equal(M0.model(m0State({ st: 'nada' }), 'es').st.id, U.DEFAULT_ST);
});

test('T015: el modelo lee la tabla del alumno; en un enunciado con duraciones, una tabla sin ninguna aún no da errores', () => {
  const m = M0.model(m0State({ t: [row('A', ''), row('D', '', 'A')] }), 'es');
  assert.ok(m.project);
  assert.deepEqual(m.report.errors, []);
  const half = M0.model(m0State({ t: [row('A', 3), row('D', '', 'A')] }), 'es');
  assert.deepEqual(half.report.errors.map((e) => e.code), ['badDuration'], 'con una escrita, las demás hacen falta');
  // En uno solo de estructura, nunca se piden.
  assert.deepEqual(M0.model(m0State({ st: 'ej1', t: [row('A', 3), row('D', '', 'A')] }), 'es').report.errors, []);
});

test('T015 · AC2: la propuesta de un subrayado sale solo del texto subrayado: letra del texto o la siguiente libre, nombre y número', () => {
  const st = S.build(ST.get('ej5'), 'es');
  const d = frag(st, 'aD');
  const p = M0.proposal(st, d.from, d.to, [row('A', ''), row('B', '')]);
  assert.equal(p.id, 'D');
  assert.equal(p.fromText, true);
  assert.equal(p.name, 'Fabricar el componente Y');
  const k = S.build(ST.get('cocina'), 'es');
  const a = frag(k, 'aA');
  const q = M0.proposal(k, a.from, a.to, [row('A', '')]);
  assert.equal(q.id, 'B', 'sin letra en el texto, la siguiente libre');
  assert.equal(q.fromText, false);
  assert.equal(q.name, 'Desmontar la cocina vieja');
  const dur = frag(k, 'dA');
  assert.equal(M0.proposal(k, dur.from, dur.to, []).value, 2);
  // El nombre propuesto no pasa del límite de la URL.
  const long = S.build({ lang: 'es', text: 'x '.repeat(120), frags: [], ref: null });
  assert.ok(M0.proposal(long, 0, 119, []).name.length <= U.LIMITS.name);
});

test('T015 · AC2: subrayar una actividad crea su fila; una duración la pone; una frase de dependencia crea las precedencias nuevas', () => {
  let rows = M0.applyMark([], 'pred', { from: 0, to: 2, kind: 'activity', act: 'A' }, { name: 'Materiales' });
  assert.deepEqual(rows, [{ id: 'A', name: 'Materiales', duration: '', links: '' }]);
  rows = M0.applyMark(rows, 'pred', { from: 5, to: 6, kind: 'activity', act: 'a' }, { name: 'Otra vez' });
  assert.equal(rows.length, 1, 'la misma letra no crea otra fila');
  assert.equal(rows[0].name, 'Materiales', 'ni cambia un nombre ya escrito');
  rows = M0.applyMark(rows, 'pred', { from: 8, to: 9, kind: 'activity', act: 'D' }, { name: 'Fabricar Y' });
  rows = M0.applyMark(rows, 'pred', { from: 20, to: 20, kind: 'duration', act: 'D', value: 7 });
  assert.equal(rows[1].duration, '7');
  rows = M0.applyMark(rows, 'pred', { from: 21, to: 21, kind: 'duration', act: 'B', value: 1 });
  assert.deepEqual(rows[2], { id: 'B', name: '', duration: '1', links: '' }, 'la duración de una actividad sin fila la crea');
  rows = M0.applyMark(rows, 'pred', { from: 30, to: 34, kind: 'precedence', gives: [['A', 'D'], ['B', 'D']] });
  assert.equal(rows[1].links, 'A, B');
  const succ = M0.applyMark([row('A', ''), row('D', '')], 'succ', { from: 0, to: 1, kind: 'precedence', gives: [['A', 'D']] });
  assert.equal(succ[0].links, 'D', 'con posteriores, en la fila de la precedente');
  const none = [row('A', ''), row('B', '')];
  assert.equal(M0.applyMark(none, 'pred', { from: 0, to: 1, kind: 'none' }), none, '«no da precedencia» no cambia la tabla');
  // La tabla sale igual que si se escribiera a mano.
  const parsed = P.parse(rows, 'pred', { structureOnly: true });
  assert.deepEqual(parsed.project.preds.D, ['A', 'B']);
});

test('T015 · AC2: quitar un subrayado no borra nada de la tabla', () => {
  const marks = [{ from: 0, to: 2, kind: 'activity', act: 'A' }, { from: 4, to: 6, kind: 'precedence', gives: [['A', 'B']] }];
  const out = M0.removeMark(marks, 1);
  assert.deepEqual(out, [marks[0]]);
  assert.equal(marks.length, 2, 'no muta la lista recibida');
  assert.equal(M0.removeMark([marks[0]], 0), null, 'sin subrayados, la URL no los guarda');
});

test('T015: un subrayado nuevo sustituye a los que pisa (cada palabra tiene como mucho uno)', () => {
  const marks = [{ from: 0, to: 2, kind: 'activity', act: 'A' }, { from: 4, to: 6, kind: 'none' }, { from: 9, to: 9, kind: 'duration', act: 'A', value: 2 }];
  const out = M0.putMark(marks, { from: 2, to: 5, kind: 'none' });
  assert.deepEqual(out.map((m) => `${m.from}-${m.to}`), ['2-5', '9-9'], 'ordenados por posición');
  assert.deepEqual(M0.putMark(null, { from: 3, to: 3, kind: 'none' }), [{ from: 3, to: 3, kind: 'none' }]);
});

test('T015 · AC8 y AC15: la tabla depurada de Electrona con una redundancia añadida es la referencia: 17 días y 2 ficticias', () => {
  const st = S.build(ST.get('ej5'), 'es');
  const rows = st.ref.activities.map((a) => ({ id: a.id, name: a.name, duration: String(a.d), links: st.ref.preds[a.id].join(', ') }));
  rows.find((r) => r.id === 'K').links = 'J, A, B';
  const m = M0.model(m0State({ t: rows }), 'es');
  assert.equal(m.explain.redundant.length, 2);
  const clean = M0.cleanRows(m.project, 'pred');
  assert.equal(clean.find((r) => r.id === 'K').links, 'J');
  assert.equal(clean.find((r) => r.id === 'D').name, 'Fabricar Y');
  const p = P.parse(clean, 'pred').project;
  assert.deepEqual(p.preds, PC.reduce(st.ref).preds);
  assert.equal(C.solve(p).duration, 17);
  // Solo de estructura: las duraciones quedan vacías (no «null»), y con posteriores se escriben las posteriores.
  const ej1 = S.build(ST.get('ej1'), 'es');
  const c1 = M0.cleanRows(ej1.ref, 'succ');
  assert.ok(c1.every((r) => r.duration === ''));
  assert.equal(c1.find((r) => r.id === 'A').links, 'D, E, G');
});

test('T015 · AC15: abrir la tabla depurada en M1, M2 o el taller deja la URL lista para volver con «Atrás»', () => {
  const st = m0State({ t: [row('A', 1), row('B', 2, 'A')], mk: [{ from: 1, to: 2, kind: 'none' }], tv: 'matrix' });
  const back = U.encode(st);
  const rows = [row('A', 1), row('B', 2, 'A')];
  for (const [where, v, graph] of [['m1', 'route', 'aon'], ['m2', 'route', 'aoa'], ['work', 'work', 'aon']]) {
    const s = M0.openState(st, where, rows, 'pred');
    assert.equal(s.v, v);
    assert.equal(s.graph, graph);
    assert.equal(s.step, 0);
    assert.deepEqual(s.t, rows);
    assert.equal(s.view, 'net');
    assert.equal(s.st, 'ej5', 'el enunciado se queda en el estado, pero fuera de M0 no se escribe');
    assert.doesNotMatch(U.encode(s), /[?&]st=|[?&]mk=/);
  }
  assert.equal(U.encode(st), back, 'el estado de M0 no cambia');
});
