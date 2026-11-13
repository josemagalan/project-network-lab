'use strict';
// core/stochex: los ejemplos con tres estimaciones (M5 y M6) y los casos del Tema 6c (solo M6), con su fuente
// (spec f4a-tres-tiempos-tcl, AC1–AC3; plan §3). Los valores esperados vienen de las fuentes citadas, no del núcleo.
const test = require('node:test');
const assert = require('node:assert/strict');
const X = require('../js/core/stochex.js');
const E = require('../js/core/examples.js');
const P = require('../js/core/project.js');

const exam = (r) => ({ mean: (r.a + 4 * r.m + r.b) / 6, var: ((r.b - r.a) / 6) ** 2 });
const round2 = (x) => Math.round(x * 100) / 100;

test('T002: cuatro ejemplos, en este orden; dos rutas y paralelización solo en M6', () => {
  assert.deepEqual(X.list().map((e) => e.id), ['kl', 'hl', 'tr', 'pa']);
  assert.deepEqual(X.list().filter((e) => e.m6only).map((e) => e.id), ['tr', 'pa']);
  assert.equal(X.get('kl').id, 'kl');
  assert.equal(X.get('nada'), null);
});

test('T002: cada ejemplo tiene título, fuente y unidad en ES y EN, y nombres en los dos idiomas', () => {
  for (const ex of X.list()) {
    for (const k of ['title', 'source', 'unit']) assert.ok(ex[k].es && ex[k].en, `${ex.id}.${k}`);
    for (const r of ex.rows) assert.ok(r.name.es && r.name.en, `${ex.id}.${r.id}`);
  }
});

test('T002: tres estimaciones válidas (0 ≤ a ≤ m ≤ b), ids únicos y la estructura se carga sin errores', () => {
  for (const ex of X.list()) {
    const ids = ex.rows.map((r) => r.id);
    assert.equal(new Set(ids).size, ids.length, ex.id);
    for (const r of ex.rows) {
      if (ex.m6only) assert.ok(r.mu > 0 && r.var > 0, `${ex.id}.${r.id}`);
      else assert.ok(r.a >= 0 && r.a <= r.m && r.m <= r.b, `${ex.id}.${r.id}`);
    }
    const rows = ex.rows.map((r) => ({ id: r.id, duration: String(ex.m6only ? r.mu : exam(r).mean), links: r.links }));
    const { project, report } = P.parse(rows, 'pred');
    assert.ok(project, ex.id);
    assert.deepEqual(report.errors, [], ex.id);
  }
});

test('T002: Klastorin (Tema 6c): las medias y varianzas de la diapositiva', () => {
  const kl = X.get('kl');
  assert.deepEqual(kl.rows.map((r) => round2(exam(r).mean)), [6.67, 7.33, 7.83, 14.33, 5, 4.33]);
  assert.deepEqual(kl.rows.map((r) => round2(exam(r).var)), [4, 1.78, 3.36, 1, 0.44, 0.44]);
  assert.deepEqual(kl.expected.path, ['A', 'C', 'E', 'F']);
  assert.equal(kl.expected.deadline, 25);
});

test('T002: Hillier (tabla 22.4): las medias son las duraciones del ejemplo hillier, con sus nombres y precedencias', () => {
  const hl = X.get('hl');
  const ref = E.get('hillier');
  assert.deepEqual(hl.rows.map((r) => r.id), ref.rows.map((r) => r.id));
  hl.rows.forEach((r, i) => {
    assert.equal(exam(r).mean, Number(ref.rows[i].duration), r.id);
    assert.equal(r.links, ref.rows[i].links, r.id);
    assert.deepEqual(r.name, ref.rows[i].name, r.id);
  });
  // Tabla 22.6: el camino crítico medio tiene μ = 44 y σ² = 9.
  const on = new Set(hl.expected.path);
  const path = hl.rows.filter((r) => on.has(r.id));
  assert.equal(path.reduce((s, r) => s + exam(r).mean, 0), 44);
  assert.ok(Math.abs(path.reduce((s, r) => s + exam(r).var, 0) - 9) < 1e-12);
  assert.equal(hl.expected.deadline, 47);
});

test('T002: dos rutas y paralelización (Tema 6c): μ y σ² de la diapositiva y su plazo', () => {
  const tr = X.get('tr');
  assert.deepEqual(tr.rows.map((r) => [r.id, r.mu, r.var, r.links]),
    [['A', 4, 2, ''], ['B', 12, 4, ''], ['C', 10, 5, 'A'], ['D', 3, 1, 'B']]);
  assert.equal(tr.expected.deadline, 17);
  const pa = X.get('pa');
  assert.deepEqual(pa.rows.map((r) => [r.id, r.mu, r.links]), [['A', 30, ''], ['B', 30, '']]);
  assert.equal(pa.expected.deadline, 30);
});
