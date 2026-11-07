'use strict';
// core/examples: los seis ejemplos de referencia están completos y se pueden cargar (AC1, AC18).
const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../js/core/examples.js');
const P = require('../js/core/project.js');
const U = require('../js/core/urlstate.js');

test('hay seis ejemplos y sus identificadores coinciden con los que admite la URL', () => {
  assert.deepEqual(E.list().map((e) => e.id), U.EXAMPLES);
});

test('cada ejemplo tiene título y fuente en ES y EN, unidad y duración esperada', () => {
  for (const ex of E.list()) {
    for (const k of ['title', 'source', 'unit']) {
      assert.ok(ex[k].es && ex[k].en, `${ex.id}.${k}`);
    }
    assert.ok(Number.isFinite(ex.expected.duration), ex.id);
  }
});

test('cada ejemplo se carga sin errores ni avisos en su forma original', () => {
  for (const ex of E.list()) {
    const { project, report } = P.parse(ex.rows, ex.mode);
    assert.ok(project, ex.id);
    assert.deepEqual(report, { errors: [], warnings: [] }, ex.id);
  }
});

test('los valores esperados solo citan actividades que existen', () => {
  for (const ex of E.list()) {
    const ids = new Set(ex.rows.map((r) => r.id));
    for (const [k, v] of Object.entries(ex.expected)) {
      if (k === 'duration') continue;
      for (const id of Array.isArray(v) ? v : Object.keys(v)) assert.ok(ids.has(id), `${ex.id}.${k}.${id}`);
    }
  }
});

test('el Ejercicio 6 está en forma de posteriores, como en el enunciado', () => {
  assert.equal(E.get('ej6').mode, 'succ');
  assert.equal(E.get('ej6').rows.find((r) => r.id === 'B').links, 'E, F, G');
  assert.equal(E.get('nope'), null);
});
