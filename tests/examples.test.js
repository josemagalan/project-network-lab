'use strict';
// core/examples: los seis ejemplos de referencia están completos y se pueden cargar (AC1, AC18).
const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../js/core/examples.js');
const P = require('../js/core/project.js');
const U = require('../js/core/urlstate.js');

test('T024: los catorce ejemplos están a la vista, también los cuatro de la F2b, y se abren por la URL', () => {
  assert.equal(E.list().length, 14);
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
      if (k === 'duration' || k === 'aoa' || k === 'methods') continue;   // aoa (F2a) y methods (F2b) no llevan identificadores de actividad
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
  assert.ok(E.list().every((e) => !e.hidden));
  // ej1–ej3 solo tienen estructura (solo en la red PERT); ej7 tiene duraciones.
  assert.deepEqual(E.list().filter((e) => e.structureOnly).map((e) => e.id), ['ej1', 'ej2', 'ej3', 'kim2008', 'cs2007', 'syslo1981', 'tipo']);
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

// ---------- Fase 2b (T005): tablas de las fuentes de los métodos y cifras por método ----------

const F2B = ['kim2008', 'cs2007', 'syslo1981', 'tipo'];
const METHODS = ['min', 'prog', 'rules', 'cs', 'kim', 'spinrad', 'cgl'];

test('F2b: las cuatro tablas nuevas existen, a la vista desde T024 y solo de estructura, con título y fuente en ES y EN', () => {
  for (const id of F2B) {
    const ex = E.get(id);
    assert.ok(ex, id);
    assert.ok(!ex.hidden, `${id} a la vista (T024)`);
    assert.equal(ex.structureOnly, true, id);
    for (const k of ['title', 'source', 'unit']) assert.ok(ex[k].es && ex[k].en, `${id}.${k}`);
    assert.ok(E.list().some((e) => e.id === id), `${id} sale en la lista`);
    assert.ok(U.STRUCTURE_ONLY.includes(id), `${id} solo en la red PERT`);
    const { project, report } = P.parse(ex.rows, ex.mode, { structureOnly: true });
    assert.ok(project, id);
    assert.deepEqual(report, { errors: [], warnings: [] }, id);
  }
  assert.equal(E.get('kim2008').rows.length, 17);
  assert.equal(E.get('cs2007').rows.length, 15);
  assert.equal(E.get('syslo1981').rows.length, 14);
  assert.equal(E.get('tipo').rows.length, 5);
});

test('F2b: Sysło (1981) llama b\' a una actividad; aquí es B2 y la fuente lo dice', () => {
  const ex = E.get('syslo1981');
  assert.ok(ex.rows.some((r) => r.id === 'B2'));
  assert.ok(/B2/.test(ex.source.es) && /b′|b'/.test(ex.source.es), ex.source.es);
  assert.ok(/B2/.test(ex.source.en) && /b′|b'/.test(ex.source.en), ex.source.en);
});

test('F2b: cifras de las fuentes (spec, tabla de referencias)', () => {
  const m = (id) => E.get(id).expected.methods;
  assert.deepEqual(m('kim2008').kim, { dummies: 10, logical: 8 });
  assert.deepEqual(m('cs2007').cs, { dummies: 5, events: 13 });
  assert.equal(m('cs2007').min.dummies, 4);
  assert.deepEqual(m('syslo1981').cgl, { dummies: 9, events: 9 });
  assert.equal(m('syslo1981').rules.dummies, 8);
  const tipo = m('tipo');
  assert.deepEqual(METHODS.map((k) => tipo[k].dummies), [2, 2, 3, 3, 3, 2, 2]);
});

test('F2b: los seis ejercicios traen la tabla de cifras por método validada por el autor', () => {
  const want = {   // [ficticias, sucesos]; spinrad: contraída, y su modelo aparte
    ej1: { min: [2], prog: [2, 7], rules: [2, 7], cs: [2, 7], kim: [2, 7], spinrad: [2, 7, 7, 12], cgl: [2, 7] },
    ej2: { min: [2], prog: [2, 9], rules: [2, 9], cs: [5, 11], kim: [2, 9], spinrad: [2, 9, 9, 16], cgl: [2, 9] },
    ej3: { min: [4], prog: [4, 10], rules: [4, 10], cs: [4, 10], kim: [4, 10], spinrad: [4, 10, 12, 18], cgl: [4, 10] },
    ej4: { min: [3], prog: [3, 10], rules: [3, 10], cs: [3, 10], kim: [3, 10], spinrad: [3, 10, 11, 18], cgl: [3, 10] },
    ej6: { min: [3], prog: [3, 9], rules: [3, 9], cs: [6, 11], kim: [3, 9], spinrad: [3, 9, 10, 16], cgl: [3, 9] },
    ej7: { min: [5], prog: [5, 9], rules: [5, 9], cs: [5, 9], kim: [5, 9], spinrad: [5, 9, 8, 12], cgl: [5, 9] },
  };
  for (const [id, row] of Object.entries(want)) {
    const got = E.get(id).expected.methods;
    assert.ok(got, `${id}: expected.methods`);
    for (const k of METHODS) {
      const g = got[k];
      const flat = [g.dummies, g.events, g.model && g.model.dummies, g.model && g.model.events].filter((x) => x !== undefined);
      assert.deepEqual(flat, row[k], `${id}.${k}`);
    }
  }
});

