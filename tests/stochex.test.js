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

test('T002 y F4b T003: nueve ejemplos, en este orden; dos rutas y paralelización solo en M6; los discretos solo en M7', () => {
  assert.deepEqual(X.list().map((e) => e.id), ['kl', 'hl', 'tr', 'pa', 'kd', 'wa', 'wb', 'wc', 'wd']);
  assert.deepEqual(X.list().filter((e) => e.m6only).map((e) => e.id), ['tr', 'pa']);
  assert.deepEqual(X.list().filter((e) => e.m7only).map((e) => e.id), ['kd', 'wa', 'wb', 'wc', 'wd']);
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
      else if (ex.m7only) assert.ok(r.disc && r.disc.x.length === r.disc.p.length, `${ex.id}.${r.id}`);
      else assert.ok(r.a >= 0 && r.a <= r.m && r.m <= r.b, `${ex.id}.${r.id}`);
    }
    const mean = (r) => (ex.m6only ? r.mu : ex.m7only ? r.disc.x.reduce((s, x, j) => s + x * r.disc.p[j], 0) : exam(r).mean);
    const rows = ex.rows.map((r) => ({ id: r.id, duration: String(Math.round(mean(r) * 1e4) / 1e4), links: r.links }));
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

// ---------- F4b T003: ejemplos con tiempos discretos (spec f4b-montecarlo-indices, «Qué resultado obtiene») ----------

test('F4b T003: discretas bien formadas: valores ≥ 0 distintos, probabilidades > 0 que suman 1', () => {
  for (const ex of X.list().filter((e) => e.m7only)) {
    for (const r of ex.rows) {
      const { x, p } = r.disc;
      assert.ok(x.length >= 1 && x.every((v) => Number.isFinite(v) && v >= 0), `${ex.id}.${r.id}`);
      assert.equal(new Set(x).size, x.length, `${ex.id}.${r.id}`);
      assert.ok(p.every((v) => v > 0), `${ex.id}.${r.id}`);
      assert.ok(Math.abs(p.reduce((s, v) => s + v, 0) - 1) < 1e-9, `${ex.id}.${r.id}`);
      assert.equal(r.a, undefined, `${ex.id}.${r.id}: sin a, m ni b (analyze A3)`);
    }
  }
});

test('F4b T003: Klastorin con tiempos discretos (Tema 6c; Klastorin 2010, fig. 6.5): valores y probabilidades de la diapositiva', () => {
  const kd = X.get('kd');
  assert.deepEqual(kd.rows.map((r) => [r.id, r.disc.x, r.links]),
    [['A', [7, 8, 9], ''], ['B', [2, 12], ''], ['C', [5, 15, 25], ''], ['D', [3, 12], 'A, B']]);
  assert.deepEqual(kd.rows.slice(1).map((r) => r.disc.p), [[0.2, 0.8], [0.2, 0.2, 0.6], [0.3, 0.7]]);
  assert.deepEqual(kd.rows[0].disc.p, [1 / 3, 1 / 3, 1 / 3]);
  assert.equal(kd.expected.deadline, 20);
});

test('F4b T003: Williams (2002, fig. 5.17–5.19): A y B en paralelo en (a)–(c) y en serie en (d)', () => {
  const B = [[0, 100], [0.99, 0.01]];
  for (const [id, a] of [['wa', [0.1, 0.2]], ['wb', [10, 20]], ['wc', [2, 99]]]) {
    const ex = X.get(id);
    assert.deepEqual(ex.rows.map((r) => [r.id, r.links]), [['A', ''], ['B', '']], id);
    assert.deepEqual([ex.rows[0].disc.x, ex.rows[0].disc.p], [a, [0.5, 0.5]], id);
    assert.deepEqual([ex.rows[1].disc.x, ex.rows[1].disc.p], B, id);
  }
  const wd = X.get('wd');
  assert.deepEqual(wd.rows.map((r) => [r.id, r.disc.x, r.disc.p, r.links]), [['A', [100], [1], ''], ['B', [0.1, 0.2], [0.5, 0.5], 'A']]);
});
