'use strict';
// views/aoa-layout: colocación legible de la red PERT (spec f2a-pert-ficticias, AC13; plan P5).
// Columnas por nivel en las que las actividades avanzan y las ficticias no; dentro de cada columna,
// menos cruces y ninguna ficticia vertical que pase por encima de otro suceso.
const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../js/core/project.js');
const E = require('../js/core/examples.js');
const A = require('../js/core/aoa.js');
const L = require('../js/views/aoa-layout.js');

const netOf = (id) => {
  const ex = E.get(id);
  return A.build(P.parse(ex.rows, ex.mode, { structureOnly: !!ex.structureOnly }).project);
};
const ALL = ['ej1', 'ej2', 'ej3', 'ej4', 'ej6', 'ej7', 'roy10', 'roy6', 'klastorin', 'hillier'];
function rng(seed) { let s = seed >>> 0; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; }
const randomNet = (rand) => {
  const n = 2 + Math.floor(rand() * 13);
  const ids = Array.from({ length: n }, (_, i) => `A${i + 1}`);
  const rows = ids.map((id, i) => ({ id, duration: '1', links: ids.slice(i + 1, i + 7).filter(() => rand() < 0.35).join(', ') }));
  return A.build(P.parse(rows, 'succ').project);
};

const checkColumns = (net, lay, tag) => {
  for (const e of net.arcs) assert.ok(lay.pos[e.to].col >= lay.pos[e.from].col + 1, `${tag}: actividad ${e.act}`);
  for (const d of net.dummies) assert.ok(lay.pos[d.to].col >= lay.pos[d.from].col, `${tag}: ficticia ${d.name}`);
  assert.equal(lay.pos[1].col, 0, `${tag}: el suceso inicial en la columna 0`);
  assert.equal(lay.pos[net.events.length].col, lay.cols - 1, `${tag}: el final en la última`);
};
const checkNoOverlap = (net, lay, tag) => {
  const seen = new Set();
  for (const ev of net.events) {
    const p = lay.pos[ev.n];
    assert.ok(p, `${tag}: suceso ${ev.n} sin posición`);
    const k = `${p.col}:${p.row}`;
    assert.ok(!seen.has(k), `${tag}: ${k} repetida`);
    seen.add(k);
  }
};
const checkVertical = (net, lay, tag) => {
  for (const d of net.dummies) {
    const a = lay.pos[d.from]; const b = lay.pos[d.to];
    // Una ficticia que no puede ir recta (un suceso con tres o más ficticias verticales) se dibuja curvada.
    if (a.col !== b.col || lay.curved.includes(d.name)) continue;
    const lo = Math.min(a.row, b.row); const hi = Math.max(a.row, b.row);
    for (const ev of net.events) {
      const p = lay.pos[ev.n];
      if (ev.n !== d.from && ev.n !== d.to && p.col === a.col) assert.ok(p.row < lo || p.row > hi, `${tag}: ${d.name} pasa por encima del suceso ${ev.n}`);
    }
  }
};

test('AC13: columnas por nivel (actividades +1, ficticias +0), sin solapes, en los diez ejemplos', () => {
  for (const id of ALL) {
    const net = netOf(id);
    const lay = L.layout(net);
    checkColumns(net, lay, id);
    checkNoOverlap(net, lay, id);
  }
});

test('AC13: ninguna ficticia vertical pasa por encima de otro suceso (ejemplos y 500 tablas aleatorias)', () => {
  for (const id of ALL) { const net = netOf(id); checkVertical(net, L.layout(net), id); }
  const rand = rng(13);
  for (let i = 0; i < 500; i++) {
    const net = randomNet(rand);
    const lay = L.layout(net);
    checkColumns(net, lay, `tabla ${i}`);
    checkNoOverlap(net, lay, `tabla ${i}`);
    checkVertical(net, lay, `tabla ${i}`);
  }
});

test('Ejercicio 6: como en la diapositiva del autor, las tres ficticias son verticales y el suceso 2 queda entre el 3 y el 4', () => {
  const net = netOf('ej6');
  const lay = L.layout(net);
  for (const d of net.dummies) assert.equal(lay.pos[d.from].col, lay.pos[d.to].col, d.name);
  assert.deepEqual(lay.curved, [], 'ninguna curvada');
  const r = (n) => lay.pos[n].row;
  assert.ok((r(3) - r(2)) * (r(4) - r(2)) < 0, 'el 2 entre el 3 y el 4');
  assert.equal(lay.bends.D.length, lay.pos[8].col - lay.pos[1].col - 1, 'D pasa por un carril en cada columna intermedia');
});

test('los barridos no aumentan los cruces respecto al orden inicial', () => {
  for (const id of ALL) {
    const net = netOf(id);
    assert.equal(Object.keys(L.layout(net).pos).length, net.events.length, id);
    assert.ok(L.crossings(L.layout(net), net) <= L.crossings(L.layout(net, { sweeps: 0 }), net), id);
  }
});

test('determinista: la misma red da la misma colocación', () => {
  assert.ok(Object.keys(L.layout(netOf('ej3')).pos).length > 0);
  assert.deepEqual(L.layout(netOf('ej3')), L.layout(netOf('ej3')));
});
