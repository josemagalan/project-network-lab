'use strict';
// core/examples: los seis ejemplos de referencia están completos y se pueden cargar (AC1, AC18).
const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../js/core/examples.js');
const P = require('../js/core/project.js');
const U = require('../js/core/urlstate.js');

test('hay diez ejemplos visibles y sus identificadores coinciden con los que admite la URL', () => {
  assert.equal(E.list().length, 10);
  assert.deepEqual(E.list().map((e) => e.id), U.EXAMPLES);
  assert.deepEqual(E.list({ all: true }).map((e) => e.id), U.EXAMPLES);
});

test('cada ejemplo tiene título y fuente en ES y EN, unidad y duración esperada', () => {
  for (const ex of E.list()) {
    for (const k of ['title', 'source', 'unit']) {
      assert.ok(ex[k].es && ex[k].en, `${ex.id}.${k}`);
    }
    if (!ex.structureOnly) assert.ok(Number.isFinite(ex.expected.duration), ex.id);
  }
});

test('cada ejemplo se carga sin errores ni avisos en su forma original', () => {
  for (const ex of E.list()) {
    const { project, report } = P.parse(ex.rows, ex.mode, { structureOnly: !!ex.structureOnly });
    assert.ok(project, ex.id);
    assert.deepEqual(report, { errors: [], warnings: [] }, ex.id);
  }
});

test('los valores esperados solo citan actividades que existen', () => {
  for (const ex of E.list()) {
    const ids = new Set(ex.rows.map((r) => r.id));
    for (const [k, v] of Object.entries(ex.expected)) {
      if (k === 'duration' || k === 'aoa') continue;   // aoa (F2a) no lleva identificadores de actividad
      for (const id of Array.isArray(v) ? v : Object.keys(v)) assert.ok(ids.has(id), `${ex.id}.${k}.${id}`);
    }
  }
});

test('el Ejercicio 6 está en forma de posteriores, como en el enunciado', () => {
  assert.equal(E.get('ej6').mode, 'succ');
  assert.equal(E.get('ej6').rows.find((r) => r.id === 'B').links, 'E, F, G');
  assert.equal(E.get('nope'), null);
});

// ---------- Fase 2a (T003): ejercicios de la red PERT ----------

test('T022: con M2 activo, los cuatro ejercicios nuevos salen en la lista y ninguno queda oculto', () => {
  const shown = E.list().map((e) => e.id);
  for (const id of ['ej1', 'ej2', 'ej3', 'ej7']) assert.ok(shown.includes(id), id);
  assert.ok(E.list({ all: true }).every((e) => !e.hidden));
  // ej1–ej3 solo tienen estructura (solo en la red PERT); ej7 tiene duraciones.
  assert.deepEqual(E.list().filter((e) => e.structureOnly).map((e) => e.id), ['ej1', 'ej2', 'ej3']);
});

test('F2a: los ejercicios 1, 2 y 3 son solo de estructura y se cargan con structureOnly', () => {
  for (const id of ['ej1', 'ej2', 'ej3']) {
    const ex = E.get(id);
    assert.equal(ex.structureOnly, true, id);
    assert.ok(ex.rows.every((r) => r.duration === ''), `${id} sin duraciones`);
    const { project, report } = P.parse(ex.rows, ex.mode, { structureOnly: true });
    assert.ok(project, id);
    assert.deepEqual(report, { errors: [], warnings: [] }, id);
    assert.ok(project.activities.every((a) => a.d === null), id);
  }
});

test('F2a: los seis ejercicios traen la referencia de la red PERT del autor', () => {
  const want = { ej1: [2, 7], ej2: [2, 9], ej3: [4, 10], ej4: [3, 10], ej6: [3, 9], ej7: [5, 9] };
  for (const [id, [dummies, events]] of Object.entries(want)) {
    const aoa = E.get(id).expected.aoa;
    assert.deepEqual([aoa.dummies, aoa.events], [dummies, events], id);
    assert.ok(E.get(id).source.es && E.get(id).source.en, `${id} con fuente`);
  }
  for (const id of ['ej4', 'ej6', 'ej7']) {
    const times = E.get(id).expected.aoa.eventTimes;
    assert.equal(times.length, E.get(id).expected.aoa.events, `${id}: un par por suceso`);
    assert.ok(times.every(([te, tl]) => Number.isFinite(te) && te <= tl), id);
  }
});

test('F2a: el Ejercicio 7 se carga con sus duraciones y dura 27 días', () => {
  const ex = E.get('ej7');
  const { project, report } = P.parse(ex.rows, ex.mode);
  assert.ok(project);
  assert.deepEqual(report, { errors: [], warnings: [] });
  assert.equal(ex.expected.duration, 27);
});
