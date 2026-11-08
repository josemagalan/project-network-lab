'use strict';
// views/layout: colocación por niveles con menos cruces (AC15) y campos de cada formato de caja (AC17).
const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../js/core/project.js');
const E = require('../js/core/examples.js');
const C = require('../js/core/cpm.js');
const L = require('../js/views/layout.js');

const prep = (id) => {
  const ex = E.get(id);
  const p = P.parse(ex.rows, ex.mode).project;
  return { p, s: C.solve(p) };
};

test('cada actividad va en la columna de su nivel; inicio en la 0 y fin en la última', () => {
  for (const ex of E.list().filter((e) => !e.structureOnly)) {
    const { p, s } = prep(ex.id);
    const lay = L.layout(s, p);
    for (const [id, lv] of s.levels) assert.equal(lay.nodes[id].col, lv, `${ex.id}:${id}`);
    assert.equal(lay.cols, s.levels.get(P.END) + 1);
  }
});

test('no hay dos nodos en la misma posición', () => {
  for (const ex of E.list().filter((e) => !e.structureOnly)) {
    const { p, s } = prep(ex.id);
    const lay = L.layout(s, p);
    const seen = new Set();
    for (const n of Object.values(lay.nodes)) {
      const key = `${n.col}:${n.row}`;
      assert.ok(!seen.has(key), `${ex.id}: ${key} repetida`);
      seen.add(key);
    }
  }
});

test('los barridos por baricentro no aumentan los cruces respecto al orden inicial', () => {
  for (const ex of E.list().filter((e) => !e.structureOnly)) {
    const { p, s } = prep(ex.id);
    const lay = L.layout(s, p);
    const initial = L.layout(s, p, { sweeps: 0 });
    assert.ok(L.crossings(lay, s, p) <= L.crossings(initial, s, p), ex.id);
  }
});

test('el Ejercicio 6 queda con un solo cruce: el inevitable de E y F hacia H e I', () => {
  // E y F preceden ambas a H e I (un K2,2): con niveles en columnas ese cruce no se puede evitar.
  const { p, s } = prep('ej6');
  assert.equal(L.crossings(L.layout(s, p), s, p), 1);
});

test('las flechas largas tienen un punto de paso por columna intermedia y nunca coinciden con una caja', () => {
  for (const ex of E.list().filter((e) => !e.structureOnly)) {
    const { p, s } = prep(ex.id);
    const lay = L.layout(s, p);
    const g = L.graph(s, p);
    const taken = new Set(Object.values(lay.nodes).map((n) => `${n.col}:${n.row}`));
    for (const u of [P.START, ...s.order]) {
      for (const v of g.succs(u)) {
        const span = lay.nodes[v].col - lay.nodes[u].col;
        const bends = lay.bends[`${u}>${v}`] || [];
        assert.equal(bends.length, span - 1, `${ex.id}: ${u}>${v}`);
        bends.forEach((b, i) => {
          assert.equal(b.col, lay.nodes[u].col + i + 1);
          const key = `${b.col}:${b.row}`;
          assert.ok(!taken.has(key), `${ex.id}: ${u}>${v} pasa por ${key}`);
          taken.add(key);
        });
      }
    }
  }
});

test('la colocación es determinista', () => {
  const { p, s } = prep('hillier');
  assert.deepEqual(L.layout(s, p), L.layout(s, p));
});

test('AC17: campos de cada formato de caja', () => {
  assert.deepEqual(L.BOX_FIELDS['7'], ['ES', 'd', 'EF', 'id', 'LS', 'TF', 'LF']);
  assert.deepEqual(L.BOX_FIELDS['4'], ['id', 'ES', 'LS', 'd']);
  assert.deepEqual(L.BOX_FIELDS.c, ['ES', 'd', 'LS', 'id']);
});
