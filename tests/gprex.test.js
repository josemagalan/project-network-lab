'use strict';
// core/gprex: los ejemplos de la F5a con su fuente (spec f5a-precedencias-generalizadas, AC1; plan §3, T002).
// Los valores esperados vienen de las fuentes citadas y de la tabla de la spec, no del núcleo.
const test = require('node:test');
const assert = require('node:assert/strict');
const X = require('../js/core/gprex.js');

const CANON = /^[A-Z0-9]{1,4}( (FS|SS|FF|SF)([+-]\d+(\.\d+)?)?)?$/;

test('F5a T002: cinco ejemplos, en este orden', () => {
  assert.deepEqual(X.list().map((e) => e.id), ['fc', 'cc', 'n16', 'rb', 'rv']);
  assert.equal(X.get('rb').id, 'rb');
  assert.equal(X.get('nada'), null);
});

test('F5a T002: cada ejemplo tiene título, fuente y unidad en ES y EN', () => {
  for (const ex of X.list()) for (const k of ['title', 'source', 'unit']) assert.ok(ex[k].es && ex[k].en, `${ex.id}.${k}`);
});

test('F5a T002: ids únicos, duraciones numéricas y relaciones escritas en forma canónica, hacia actividades de antes', () => {
  for (const ex of X.list()) {
    const ids = ex.rows.map((r) => r.id);
    assert.equal(new Set(ids).size, ids.length, ex.id);
    ex.rows.forEach((r, i) => {
      assert.match(r.duration, /^\d+(\.\d+)?$/, `${ex.id}.${r.id}`);
      for (const l of r.links.split(', ').filter(Boolean)) {
        assert.match(l, CANON, `${ex.id}.${r.id}: ${l}`);
        assert.ok(ids.indexOf(l.split(' ')[0]) < i, `${ex.id}.${r.id}: ${l}`);
      }
    });
  }
});

test('F5a T002: las relaciones de las fuentes', () => {
  // Tema 6b: A (8) y B (7) con demora D = 3, FC y CC.
  assert.deepEqual(X.get('fc').rows, [{ id: 'A', duration: '8', links: '' }, { id: 'B', duration: '7', links: 'A FS+3' }]);
  assert.deepEqual(X.get('cc').rows, [{ id: 'A', duration: '8', links: '' }, { id: 'B', duration: '7', links: 'A SS+3' }]);
  // Nicholas, fig. 6.16: A y B de 15, SS = 5 y FF = 10.
  assert.equal(X.get('n16').rows[1].links, 'A SS+5, A FF+10');
  // Nicholas, ejemplo 6.1: L CC+3 y FF de G; Y CC+2 y FF+6 de V; W CC+5 y FF de Y (y FC de Q); X FC+1 de W.
  const rb = Object.fromEntries(X.get('rb').rows.map((r) => [r.id, r]));
  assert.deepEqual(Object.fromEntries(Object.entries(rb).map(([k, v]) => [k, Number(v.duration)])),
    { G: 6, M: 4, L: 2, V: 6, Q: 8, Y: 8, W: 1, X: 1 });
  assert.equal(rb.L.links, 'G SS+3, G FF');
  assert.equal(rb.Y.links, 'V SS+2, V FF+6');
  assert.equal(rb.W.links, 'Y SS+5, Y FF, Q');
  assert.equal(rb.X.links, 'W FS+1');
  assert.deepEqual(X.get('rb').expected.ES, { G: 0, M: 6, L: 4, V: 10, Q: 6, Y: 14, W: 21, X: 23 });
});
