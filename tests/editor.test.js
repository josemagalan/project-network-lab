'use strict';
// editor: la lógica del taller que no necesita DOM (T020; AC3, AC4, AC5 y la tabla vacía).
// La interacción con la página (pegar, el selector y los mensajes en pantalla) la comprueban las
// pruebas de navegador «Taller · …» en tests/browser/run.js.
const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../js/core/project.js');
const C = require('../js/core/cpm.js');
const N = require('../js/narrate.js');
const Ed = require('../js/editor.js');

const row = (id, duration, links = '') => ({ id, name: '', duration, links });
const show = (lang, rows) => {
  const { project, report } = P.parse(rows, 'pred');
  return { report, msg: Ed.messages(lang, report, project, project && C.solve(project), (v) => N.fmt(lang, v)) };
};

test('AC3: un ciclo da un error que nombra sus actividades, en el idioma activo, y no hay resumen', () => {
  const rows = [row('A', 1, 'C'), row('B', 2, 'A'), row('C', 3, 'B')];
  for (const [lang, word] of [['es', 'ciclo'], ['en', 'cycle']]) {
    const { msg } = show(lang, rows);
    assert.equal(msg.errors.length, 1);
    assert.match(msg.errors[0], new RegExp(word));
    for (const id of ['A', 'B', 'C']) assert.match(msg.errors[0], new RegExp(`\\b${id}\\b`));
    assert.equal(msg.ready, null, 'sin resultados hasta romper el ciclo');
    assert.equal(msg.empty, null);
  }
});

test('AC4: cada error de fila da un mensaje propio, con el número de fila, en los dos idiomas', () => {
  const rows = [row('A', 1), row('A', 2), row('B', -1), row('C', 1, 'Z'), row('INI', 1), row('ABCDE', 1)];
  const es = show('es', rows);
  const en = show('en', rows);
  const codes = es.report.errors.map((e) => e.code).sort();
  assert.deepEqual(codes, ['badDuration', 'badId', 'duplicateId', 'reservedId', 'unknownRef']);
  assert.equal(es.msg.errors.length, 5);
  es.report.errors.forEach((is, i) => {
    assert.match(es.msg.errors[i], new RegExp(`Fila ${is.row + 1}\\b`), es.msg.errors[i]);
    assert.match(en.msg.errors[i], new RegExp(`Row ${is.row + 1}\\b`), en.msg.errors[i]);
    assert.notEqual(es.msg.errors[i], en.msg.errors[i]);
  });
  assert.match(es.msg.errorsHead, /5/);
  // Cada error señala el campo de su fila; no se marca nada como aviso.
  const m = Ed.marks(es.report);
  assert.deepEqual(m.map((x) => `${x.row}:${x.field}:${x.kind}`).sort(),
    ['1:id:invalid', '2:duration:invalid', '3:links:invalid', '4:id:invalid', '5:id:invalid']);
});

test('AC5: una redundancia es un aviso en su campo, y la tabla sigue dando resultados', () => {
  for (const lang of ['es', 'en']) {
    const { report, msg } = show(lang, [row('A', 1), row('B', 1, 'A'), row('C', 5, 'A, B')]);
    assert.equal(msg.errors.length, 0);
    assert.equal(msg.warnings.length, 1);
    assert.match(msg.warnings[0], /A/);
    assert.match(msg.warnings[0], /C/);
    assert.ok(msg.ready, 'se calcula igual');
    assert.match(msg.ready, /\b7\b/, 'duración 1 + 1 + 5 = 7');
    assert.deepEqual(Ed.marks(report), [{ row: 2, field: 'links', kind: 'warn' }]);
  }
});

test('una tabla vacía invita a empezar en vez de dar resultados', () => {
  for (const lang of ['es', 'en']) {
    const { msg } = show(lang, []);
    assert.equal(msg.errorsHead, null);
    assert.equal(msg.ready, null);
    assert.ok(msg.empty && msg.empty.length > 10);
  }
});

test('cada código que señala una fila tiene campo y texto en los dos idiomas', () => {
  for (const code of Object.keys(Ed.FIELD)) {
    for (const lang of ['es', 'en']) {
      const s = Ed.issueText(lang, { code, row: 0, ids: ['A', 'B'] });
      assert.ok(s && !s.startsWith('issue.') && !/[{}]/.test(s), `${lang} ${code}: ${s}`);
    }
  }
});
