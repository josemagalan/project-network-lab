'use strict';
// core/resex: los ejemplos de la F5c con su fuente (spec f5c-recursos, AC1 y «Qué resultado obtiene»; plan P11, T002).
// Los datos y los valores esperados vienen de las fuentes citadas y de la tabla de la spec, no del núcleo.
const test = require('node:test');
const assert = require('node:assert/strict');
const X = require('../js/core/resex.js');

const INT = /^\d+$/;

test('F5c T002: seis ejemplos, en este orden', () => {
  assert.deepEqual(X.list().map((e) => e.id), ['k81', 'k85', 'lg', 'lgi', 'gb', 'n723']);
  assert.equal(X.get('gb').id, 'gb');
  assert.equal(X.get('nada'), null);
});

test('F5c T002: cada ejemplo tiene título, fuente y unidad en ES y EN, su modo y de 1 a 3 recursos con nombre en ES y EN', () => {
  for (const ex of X.list()) {
    for (const k of ['title', 'source', 'unit']) assert.ok(ex[k].es && ex[k].en, `${ex.id}.${k}`);
    assert.ok(['lev', 'lim'].includes(ex.mode), `${ex.id}.mode`);
    assert.ok(ex.res.length >= 1 && ex.res.length <= 3, `${ex.id}.res`);
    for (const r of ex.res) {
      assert.ok(r.name.es && r.name.en && r.name.es.length <= 20 && r.name.en.length <= 20, `${ex.id}: ${r.name.es}`);
      assert.ok(r.cap === null || (Number.isInteger(r.cap) && r.cap >= 1 && r.cap <= 9999), `${ex.id}.cap`);
    }
  }
});

test('F5c T002: ids únicos, predecesoras de antes, duraciones y usos enteros de 0 a 999, un uso por recurso', () => {
  for (const ex of X.list()) {
    const ids = ex.rows.map((r) => r.id);
    assert.equal(new Set(ids).size, ids.length, ex.id);
    ex.rows.forEach((r, i) => {
      assert.match(r.d, INT, `${ex.id}.${r.id}.d`);
      assert.ok(Number(r.d) <= 999);
      ex.res.forEach((_, k) => { assert.match(r[`r${k + 1}`], INT, `${ex.id}.${r.id}.r${k + 1}`); assert.ok(Number(r[`r${k + 1}`]) <= 999); });
      for (let k = ex.res.length; k < 3; k++) assert.equal(r[`r${k + 1}`], '', `${ex.id}.${r.id}.r${k + 1} vacío`);
      for (const l of r.links.split(', ').filter(Boolean)) assert.ok(ids.indexOf(l) >= 0 && ids.indexOf(l) < i, `${ex.id}.${r.id}: ${l}`);
    });
  }
});

const pick = (ex) => Object.fromEntries(X.get(ex).rows.map((r) => [r.id, [r.links, Number(r.d), ...X.get(ex).res.map((_, k) => Number(r[`r${k + 1}`]))]]));

test('F5c T002: Klastorin, figura 8.1 (nivelación de los trabajadores)', () => {
  assert.deepEqual(pick('k81'), { A: ['', 3, 7], B: ['', 2, 3], C: ['A', 9, 2], D: ['A', 5, 10], E: ['B', 3, 4], F: ['B', 2, 5], G: ['D, E', 5, 6] });
  assert.equal(X.get('k81').mode, 'lev');
  assert.deepEqual(X.get('k81').res.map((r) => r.cap), [null]);
});

test('F5c T002: Klastorin, figura 8.5 (nueve trabajadores como máximo)', () => {
  assert.deepEqual(pick('k85'), { A: ['', 4, 3], B: ['', 3, 5], C: ['A, B', 1, 6], D: ['B', 5, 8], E: ['C, D', 4, 7] });
  assert.equal(X.get('k85').mode, 'lim');
  assert.deepEqual(X.get('k85').res.map((r) => r.cap), [9]);
});

test('F5c T002: Nicholas, LOGON (tablas 6.3 y 6.5): predecesoras, duraciones, trabajadores y equipo por semana; 14 trabajadores y equipo sin límite', () => {
  const g = pick('lg');
  assert.deepEqual(Object.keys(g), ['H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z']);
  assert.deepEqual(Object.values(g).map((v) => v[0]), ['', 'H', 'H', 'J', 'J', 'J', 'I', 'I', 'I, J', 'L', 'M', 'N', 'Q', 'O, S', 'K, R', 'U', 'V', 'P, W, X', 'Y, T']);
  assert.deepEqual(Object.values(g).map((v) => v[1]), [10, 8, 6, 4, 2, 4, 4, 5, 5, 5, 5, 3, 3, 1, 5, 2, 3, 8, 6]);
  assert.deepEqual(Object.values(g).map((v) => v[2]), [5, 4, 8, 2, 6, 3, 2, 5, 6, 2, 0, 0, 0, 9, 14, 6, 6, 14, 5]);
  assert.deepEqual(Object.values(g).map((v) => v[3]), [8, 2, 6, 1, 2, 2, 0, 0, 6, 0, 4, 4, 0, 8, 8, 8, 8, 8, 8]);
  assert.deepEqual(X.get('lg').res.map((r) => r.cap), [14, null]);
  assert.equal(X.get('lg').mode, 'lev');
});

test('F5c T002: Nicholas, LOGON con el inspector técnico (figura 6.29): una unidad, en H, J, P, K, L, V y X', () => {
  const g = pick('lgi');
  assert.deepEqual(Object.values(g).map((v) => v[0]), Object.values(pick('lg')).map((v) => v[0]));
  assert.deepEqual(Object.entries(g).filter(([, v]) => v[2] === 1).map(([id]) => id), ['H', 'J', 'K', 'L', 'P', 'V', 'X']);
  assert.deepEqual(X.get('lgi').res.map((r) => r.cap), [1]);
  assert.equal(X.get('lgi').mode, 'lim');
});

test('F5c T002: Nicholas, GUMBY (problema 22 del cap. 6): 8 analistas y 5 programadores', () => {
  assert.deepEqual(pick('gb'), { J: ['', 6, 8, 3], M: ['J', 4, 5, 4], V: ['M', 6, 3, 2], Y: ['V', 8, 2, 3], L: ['J', 2, 5, 3], Q: ['L', 8, 3, 2], Z: ['Y, Q', 2, 5, 3] });
  assert.deepEqual(X.get('gb').res.map((r) => r.cap), [8, 5]);
});

test('F5c T002: Nicholas, figura 7.23 (10 trabajadores)', () => {
  assert.deepEqual(pick('n723'), { A: ['', 2, 5], B: ['', 1, 5], C: ['B', 2, 10], D: ['B', 1, 10], E: ['A', 3, 5], F: ['C', 6, 5] });
  assert.deepEqual(X.get('n723').res.map((r) => r.cap), [10]);
  assert.equal(X.get('n723').mode, 'lim');
});

test('F5c T002: lo esperado (tabla de la spec) va con cada ejemplo, para que las pruebas del núcleo lo comparen', () => {
  assert.deepEqual(X.get('k81').expected, { T: 13, peakES: [21], peakLS: [16], minPeak: [16], burgessSsq: 1735 });
  assert.deepEqual(X.get('k85').expected, { T: 12, bakerD: 13, bakerR: 10, opt: 14 });
  assert.deepEqual(X.get('lg').expected, { T: 47, peakES: [23, 16], minPeak: [15, 16], opt: 49 });
  assert.deepEqual(X.get('lgi').expected, { T: 47, opt: 49 });
  assert.deepEqual(X.get('gb').expected, { T: 26, peakES: [10, 7], opt: 26 });
  assert.deepEqual(X.get('n723').expected, { T: 9, opt: 10 });
});
