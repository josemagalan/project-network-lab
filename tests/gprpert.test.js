'use strict';
// core/gprpert: la red PERT equivalente por piezas (spec f5a-precedencias-generalizadas, AC9 y AC10; plan §3, P3, P4;
// T006). Las cifras de los ejemplos vienen del prototipo del plan (spikes/f5a-precedencias-generalizadas/pert-equiv.js).
const test = require('node:test');
const assert = require('node:assert/strict');
const GP = require('../js/core/gprpert.js');
const G = require('../js/core/gpr.js');
const X = require('../js/core/gprex.js');
const A = require('../js/core/aoa.js');
const R = require('../js/core/rng.js');

const ok = (rs) => { const { project, report } = G.parse(rs); assert.deepEqual(report.errors, []); return project; };
const ex = (id) => ok(X.get(id).rows);
const ids = (b) => b.pieces.acts.map((a) => a.id);

test('F5a T006: Tema 6b con FC+3: una espera de 3 entre A y B, sin partir nada', () => {
  const b = GP.build(ex('fc'));
  assert.deepEqual(ids(b), ['A', 'B', 'w1']);
  assert.equal(b.pieces.acts.find((a) => a.id === 'w1').d, 3);
  assert.deepEqual([b.Tpert, b.gaps, b.omitted], [18, [], []]);
  assert.deepEqual(b.map[0].arcs, ['A', 'w1', 'B']);
});

test('F5a T006: Tema 6b con CC+3: A se parte en A₁ (3) y A₂ (5), y B sigue a A₁', () => {
  const b = GP.build(ex('cc'));
  assert.deepEqual(b.pieces.acts.map((a) => [a.id, a.d]), [['A₁', 3], ['A₂', 5], ['B', 7]]);
  assert.deepEqual(b.pieces.project.preds.B, ['A₁']);
  assert.deepEqual([b.Tpert, b.gaps], [10, []]);
});

test('F5a T006: figura 6.16: B se parte y queda separada en el tiempo; misma duración', () => {
  const b = GP.build(ex('n16'));
  assert.equal(b.Tpert, 25);
  assert.deepEqual(b.gaps, [{ act: 'B', after: 'B₁', before: 'B₂', gap: 5 }]);
});

test('F5a T006: ROSEBUD: 24 = 24 con L, Y y W separadas; crítica al revés: 10 frente a 14', () => {
  const rb = GP.build(ex('rb'));
  assert.equal(rb.Tpert, 24);
  assert.deepEqual(rb.gaps.map((g) => [g.act, g.gap]), [['L', 1], ['Y', 2], ['W', 2]]);
  assert.equal(rb.pieces.waits.length, 1);
  const rv = GP.build(ex('rv'));
  assert.equal(rv.Tpert, 10);
  assert.equal(G.solve(ex('rv')).duration, 14);
  assert.deepEqual(rv.gaps.map((g) => [g.act, g.gap]), [['B', 4]]);
});

test('F5a T006: el origen «fin de i» es la pieza de 0 si existe (el error que encontró el prototipo: ROSEBUD daba 22)', () => {
  const b = GP.build(ex('rb'));
  const W = b.pieces.pieceAt.W;
  assert.ok(W[W.length - 1].zero);
  const wait = b.pieces.acts.find((a) => a.wait);
  assert.deepEqual(b.pieces.project.preds[wait.id], [W[W.length - 1].id]);
});

test('F5a T006: un adelanto que no cabe en ninguna actividad no se representa (CF con desfase negativo)', () => {
  const gp = ok([{ id: 'A', duration: '4', links: '' }, { id: 'B', duration: '3', links: 'A SF-1' }]);
  const b = GP.build(gp);
  assert.deepEqual(b.omitted, [0]);
  assert.equal(b.map[0], undefined);
  assert.ok(b.Tpert <= G.solve(gp).duration);
});

test('F5a T006: el mapa de cada relación lleva sus piezas, su espera y sus ficticias (AC10)', () => {
  const b = GP.build(ex('rb'));
  const gp = ex('rb');
  for (const [k, m] of Object.entries(b.map)) {
    const r = gp.rels[k];
    assert.ok(m.arcs.length >= 1, k);
    assert.ok(m.arcs.every((a) => ids(b).includes(a)), k);
    assert.ok(m.arcs.some((a) => b.pieces.acts.find((p) => p.id === a).of === r.to), `${k} llega a ${r.to}`);
    for (const dm of m.dummies) assert.ok(b.net.dummies.some((x) => x.name === dm), dm);
  }
  // Y CC+2 de V: V₁ (2) antes de Y₁.
  const k = gp.rels.findIndex((r) => r.from === 'V' && r.to === 'Y' && r.type === 'SS');
  assert.deepEqual(b.map[k].arcs, ['V₁', 'Y₁']);
});

test('F5a T006: en 3000 tablas al azar se cumplen las postcondiciones (AC9)', () => {
  const r = R.mulberry32(909);
  const types = ['FS', 'FS', 'SS', 'FF', 'SF'];
  let equal = 0; let less = 0; let omitted = 0;
  for (let it = 0; it < 3000; it++) {
    const k = R.int(r, 2, 10);
    const names = Array.from({ length: k }, (_, i) => String.fromCharCode(65 + i));
    const rs = names.map((id, j) => {
      const links = []; const used = new Set();
      for (let i = 0; i < j; i++) {
        if (r() < 0.3) {
          const type = types[R.int(r, 0, 4)];
          if (used.has(type + i)) continue;
          used.add(type + i);
          links.push(G.format({ from: names[i], type, lag: [0, 0, 1, 2, 3, -1, -2, 12][R.int(r, 0, 7)] }, 'en'));
        }
      }
      return { id, duration: String(R.int(r, 1, 9)), links: links.join(', ') };
    });
    const gp = ok(rs);
    const T = G.solve(gp).duration;
    const b = GP.build(gp);
    assert.ok(A.verify(b.net, b.pieces.project).ok, `it ${it}`);
    assert.ok(b.Tpert <= T + 1e-9, `it ${it}`);
    // Cada relación representada se cumple en el calendario temprano de las piezas, a la altura de trabajo donde va.
    const at = (a, o) => { const ps = b.pieces.pieceAt[a]; if (o < 1e-9) return b.times[ps[0].id].ES;
      return b.times[ps.filter((x) => Math.abs(x.s1 - o) < 1e-9).pop().id].EF; };
    for (const [kk, l] of Object.entries(b.pieces.links)) {
      const rel = gp.rels[kk];
      const tgt = b.pieces.acts.find((p) => p.id === l.to);
      const w = l.wait ? b.pieces.acts.find((p) => p.id === l.wait).d : 0;
      const from = l.startOf ? at(rel.from, 0) : b.times[l.from].EF;
      assert.ok(from + w <= b.times[tgt.id].ES + 1e-9, `it ${it} relación ${kk}`);
    }
    if (!b.gaps.length && !b.omitted.length) { assert.ok(Math.abs(b.Tpert - T) < 1e-9, `it ${it}`); equal++; }
    if (b.Tpert < T - 1e-9) less++;
    if (b.omitted.length) omitted++;
  }
  assert.ok(equal > 500 && less > 20 && omitted > 50, JSON.stringify({ equal, less, omitted }));
});
