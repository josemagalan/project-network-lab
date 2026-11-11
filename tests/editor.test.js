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

test('con hideDuration el resumen da el número de actividades pero no la duración (revisión, H5)', () => {
  const rows = [row('A', 6), row('B', 7, 'A'), row('C', 2)];
  for (const lang of ['es', 'en']) {
    const { report } = show(lang, rows);
    const { project } = P.parse(rows, 'pred');
    const fmt = (v) => N.fmt(lang, v);
    const hidden = Ed.messages(lang, report, project, C.solve(project), fmt, true).ready;
    const shown = Ed.messages(lang, report, project, C.solve(project), fmt, false).ready;
    assert.match(hidden, /\b3\b/);
    assert.doesNotMatch(hidden, /13/);
    assert.match(shown, /\b13\b/);
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

test('T022: una tabla sin ninguna duración se da por buena, solo para la red PERT, y no ofrece resultados', () => {
  for (const lang of ['es', 'en']) {
    const rows = [row('A', '', 'B, C'), row('B', ''), row('C', '')];
    const { project, report } = P.parse(rows, 'succ', { structureOnly: P.blankDurations(rows) });
    const msg = Ed.messages(lang, report, project, null, (v) => N.fmt(lang, v));
    assert.equal(msg.structureOnly, true);
    assert.match(msg.ready, lang === 'es' ? /3 actividades, sin duraciones/ : /3 activities, no durations/);
    assert.match(msg.ready, lang === 'es' ? /red PERT/ : /activity-on-arrow/);
    assert.equal(msg.errorsHead, null);
  }
  // Con una duración escrita, las vacías vuelven a ser errores.
  const mixed = [row('A', '2', 'B'), row('B', '')];
  assert.equal(P.blankDurations(mixed), false);
  assert.ok(show('es', mixed).msg.errorsHead);
});

// ---------- F2c (T015): ganchos del editor para M0 y la matriz de precedencias ----------
const PM = require('../js/views/prec-matrix.js');

const parseRows = (rows, mode) => P.parse(rows, mode, { structureOnly: P.blankDurations(rows) });

test('T015 · sin decoración, el taller no cambia: ninguna fila ni campo marcado y sin columna de correspondencia', () => {
  const rows = [row('A', 1), row('B', 1, 'A'), row('C', 5, 'A, B')];
  for (const deco of [null, undefined, {}]) {
    const d = Ed.decorate(rows, 'pred', deco, 'es');
    assert.equal(d.length, rows.length);
    for (const x of d) assert.deepEqual(x, { tag: null, links: null, note: null });
  }
});

test('T015 · AC4: la redundancia marca su campo y el camino elegido marca las filas y campos de sus precedencias, en los dos sentidos', () => {
  // A → B → C hace redundante A → C.
  const pred = [row('A', 1), row('B', 1, 'A'), row('C', 5, 'A, B'), row('D', 1, 'C')];
  const deco = { redundant: [['A', 'C']], path: { edge: ['A', 'C'], path: ['A', 'B', 'C'] } };
  const d = Ed.decorate(pred, 'pred', deco, 'es');
  assert.deepEqual(d.map((x) => x.links), [null, 'path', 'red', null], 'con predecesoras, cada precedencia vive en la fila de la posterior');
  assert.deepEqual(d.map((x) => x.tag), ['path', 'path', 'path', null]);
  const succ = [row('A', 1, 'B, C'), row('B', 1, 'C'), row('C', 5, 'D'), row('D', 1)];
  const s = Ed.decorate(succ, 'succ', deco, 'en');
  assert.deepEqual(s.map((x) => x.links), ['red', 'path', null, null], 'con posteriores, en la fila de la precedente');
  // Sin camino elegido, solo el campo redundante.
  assert.deepEqual(Ed.decorate(pred, 'pred', { redundant: [['A', 'C']] }, 'es').map((x) => x.links), [null, null, 'red', null]);
});

test('T015 · AC5: el ciclo marca sus filas y el campo de cada precedencia del recorrido, aunque la tabla no sea válida', () => {
  const rows = [row('A', 1, 'C'), row('B', 2, 'A'), row('C', 3, 'B'), row('D', 1, 'C')];
  const parsed = parseRows(rows, 'pred');
  assert.equal(parsed.project, null);
  const cycle = parsed.report.errors.find((e) => e.code === 'cycle').ids;
  const d = Ed.decorate(rows, 'pred', { cycle }, 'es');
  assert.deepEqual(d.map((x) => x.tag), ['cycle', 'cycle', 'cycle', null]);
  assert.deepEqual(d.map((x) => x.links), ['cycle', 'cycle', 'cycle', null]);
});

test('T015 · AC7: tras comprobar, cada fila dice a qué actividad corresponde y si está bien, mal o con aviso', () => {
  const rows = [row('A', 2), row('T', 1, 'A'), row('X', 1), row('', '', '')];
  const deco = { map: { A: 'A', T: 'E' }, bad: ['X'], warn: ['T'] };
  for (const lang of ['es', 'en']) {
    const d = Ed.decorate(rows, 'pred', deco, lang);
    assert.deepEqual(d.map((x) => x.tag), ['ok', 'warn', 'bad', null]);
    assert.equal(d[0].note, '= A');
    assert.match(d[1].note, /^= E \(.+\)$/, 'otra letra: emparejada por el subrayado');
    assert.equal(d[2].note, '—');
    assert.equal(d[3].note, null, 'una fila vacía no corresponde a nada');
    assert.notEqual(Ed.decorate(rows, 'pred', deco, 'es')[1].note, Ed.decorate(rows, 'pred', deco, 'en')[1].note);
  }
});

test('T015 · AC3: la matriz lee la misma tabla que la lista, con predecesoras o con posteriores', () => {
  const pred = [row('A', 1), row('B', 1, 'a'), row('C', 5, 'A; B'), row('', '', ''), row('D', 1, 'C, Z')];
  const m = PM.model(pred, 'pred');
  assert.deepEqual(m.ids, ['A', 'B', 'C', 'D']);
  assert.deepEqual([...m.has].sort(), ['A>B', 'A>C', 'B>C', 'C>D'], 'las referencias desconocidas no tienen casilla');
  const succ = [row('A', 1, 'B, C'), row('B', 1, 'C'), row('C', 5, 'D'), row('D', 1)];
  assert.deepEqual([...PM.model(succ, 'succ').has].sort(), ['A>B', 'A>C', 'B>C', 'C>D']);
});

test('T015 · AC3: marcar o desmarcar una casilla cambia la lista, en los dos sentidos, sin tocar lo demás', () => {
  const pred = [row('A', 1), row('B', 1, 'A'), row('C', 5, 'A, B')];
  const on = PM.toggle(pred, 'pred', 'B', 'A', true);
  assert.equal(on[0].links, 'B');
  assert.equal(pred[0].links, '', 'no muta la tabla recibida');
  const off = PM.toggle(pred, 'pred', 'A', 'C', false);
  assert.equal(off[2].links, 'B');
  assert.deepEqual(off.map((r) => [r.id, r.duration, r.name]), pred.map((r) => [r.id, r.duration, r.name]));
  assert.equal(PM.toggle(pred, 'pred', 'A', 'B', true)[1].links, 'A', 'marcar una que ya está no la repite');
  assert.equal(PM.toggle(pred, 'pred', 'A', 'Q', true), pred, 'sin fila para la actividad, nada cambia');
  const succ = [row('A', 1, 'B'), row('B', 1), row('C', 2)];
  const s = PM.toggle(succ, 'succ', 'B', 'C', true);
  assert.equal(s[1].links, 'C', 'con posteriores, la casilla cambia la fila de la precedente');
  const back = PM.model(s, 'succ');
  assert.ok(back.has.has('B>C'));
  // Lista ⇔ matriz: la tabla que sale de la matriz da el mismo proyecto que la escrita a mano.
  const hand = [row('A', 1, 'B, C'), row('B', 1), row('C', 2)];
  const viaMatrix = PM.toggle(PM.toggle([row('A', 1), row('B', 1), row('C', 2)], 'succ', 'A', 'B', true), 'succ', 'A', 'C', true);
  assert.deepEqual(parseRows(viaMatrix, 'succ').project.succs, parseRows(hand, 'succ').project.succs);
});

test('T015: cada casilla de la matriz se nombra con su precedencia y dice si es redundante, del ciclo o del camino', () => {
  const ids = ['A', 'B', 'C'];
  const has = new Set(['A>B', 'B>C', 'A>C']);
  for (const lang of ['es', 'en']) {
    const cells = PM.cells(ids, has, { redundant: [['A', 'C']], path: { edge: ['A', 'C'], path: ['A', 'B', 'C'] } }, lang);
    const c = (p, a) => cells.find((x) => x.p === p && x.a === a);
    assert.equal(cells.length, 6, 'sin la diagonal');
    assert.equal(c('A', 'C').mark, 'red');
    assert.equal(c('A', 'B').mark, 'path');
    assert.equal(c('B', 'A').mark, null);
    assert.equal(c('A', 'B').checked, true);
    assert.equal(c('B', 'A').checked, false);
    assert.match(c('A', 'C').label, /^A → C\b.+/);
    assert.equal(c('B', 'A').label, 'B → A');
    const cyc = PM.cells(ids, has, { cycle: ['A', 'B', 'C'] }, lang);
    assert.equal(cyc.find((x) => x.p === 'C' && x.a === 'A').mark, 'cycle');
    assert.notEqual(PM.cells(ids, has, { redundant: [['A', 'C']] }, 'es').find((x) => x.p === 'A' && x.a === 'C').label,
      PM.cells(ids, has, { redundant: [['A', 'C']] }, 'en').find((x) => x.p === 'A' && x.a === 'C').label);
  }
});

// ---------- F3a, T012: «Tabla al azar» ----------
const GEN = require('../js/core/generator.js');

test('T012 · AC11: «Tabla al azar» da la tabla del generador para la semilla y el nivel, como filas del taller', () => {
  for (const [sd, lv] of [[35873, 'medium'], [39595, 'easy'], [92846, 'hard']]) {
    const g = GEN.generate(sd, GEN.LEVELS[lv]);
    const rows = Ed.randomRows(sd, lv, 'pred');
    assert.deepEqual(rows, g.rows.map((r) => ({ id: r.id, name: '', duration: String(r.duration), links: r.links })));
    // Con posteriores, la misma tabla escrita al revés.
    const succ = Ed.randomRows(sd, lv, 'succ');
    const a = P.parse(rows, 'pred').project; const b = P.parse(succ, 'succ').project;
    assert.deepEqual(b.preds, a.preds);
    assert.deepEqual(b.activities, a.activities);
  }
  assert.throws(() => Ed.randomRows(1, 'nope', 'pred'), /nivel/);
});

test('T012 · el aviso de «Tabla al azar» dice el nivel y el número de actividades, y que «Atrás» recupera la tabla anterior', () => {
  assert.equal(Ed.randomNotice('es', 'medium', 10), 'Tabla al azar de nivel medio (10 actividades). «Atrás» del navegador recupera la tabla que tenías.');
  assert.equal(Ed.randomNotice('en', 'hard', 13), 'Random table, hard level (13 activities). The browser’s «Back» brings back the table you had.');
  for (const lang of ['es', 'en']) for (const lv of ['easy', 'medium', 'hard']) assert.doesNotMatch(Ed.randomNotice(lang, lv, 7), /\{|\}|undefined/);
});

test('F3a T017 · «Tabla al azar» está publicada (P8)', () => {
  assert.equal(Ed.RANDOM_VISIBLE, true);
});
