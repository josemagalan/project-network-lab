// F4b T010 · la parte sin DOM de M7 (js/m7.js): el modelo de la vista (proyecto, distribución de cada actividad, discretas
// escritas, normal de M6, plazo, simulación y cuenta exacta), las probabilidades escritas y los resultados de una simulación.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const U = require('../js/core/urlstate.js');
const S = require('../js/core/sim.js');
const MC = require('../js/core/mc.js');
const M7 = require('../js/m7.js');

const st = (extra) => Object.assign(U.defaults(), { v: 'unc', ex: null, um: 'm7', lang: 'es' }, extra || {});
const close = (a, b, tol = 1e-9, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg || ''}: ${a} frente a ${b}`);

test('parseProb: decimales con coma o punto y fracciones; fmtProb las escribe como se leen', () => {
  assert.deepEqual(M7.parseProb('0,2'), { value: 0.2 });
  assert.deepEqual(M7.parseProb(' 0.25 '), { value: 0.25 });
  assert.deepEqual(M7.parseProb('1/3'), { value: 1 / 3 });
  assert.deepEqual(M7.parseProb('1'), { value: 1 });
  for (const bad of ['', 'x', '1/0', '-0.2', '1/', '0,2,3']) assert.ok(M7.parseProb(bad).error, bad);
  assert.equal(M7.fmtProb(0.2, 'es'), '0,2');
  assert.equal(M7.fmtProb(0.2, 'en'), '0.2');
  assert.equal(M7.fmtProb(1 / 3, 'es'), '1/3');
  assert.equal(M7.fmtProb(4 / 6, 'en'), '2/3');
  assert.equal(M7.fmtProb(1 / 6, 'en'), '1/6');
  assert.equal(M7.fmtProb(1, 'es'), '1');
});

test('Klastorin por defecto: beta-PERT en todas, medias y varianzas de la distribución, normal de M6 con las fórmulas de examen (A2)', () => {
  const m = M7.model(st(), 'es');
  assert.equal(m.ok, true);
  assert.equal(m.src.id, 'kl');
  assert.equal(m.discrete, false);
  assert.deepEqual(m.acts.map((a) => a.kind), ['pert', 'pert', 'pert', 'pert', 'pert', 'pert']);
  close(m.acts[0].var, 4.888888888888888, 1e-9, 'varianza de la beta-PERT de A');
  close(m.normal.mu, 23.833333333333332, 1e-9);
  close(m.normal.var, 8.25, 1e-9);
  assert.deepEqual(m.normal.path, ['A', 'C', 'E', 'F']);
  assert.equal(m.deadline, 25);
  assert.equal(m.pct, 0.95);
  assert.equal(m.sim.n, 10000);
  assert.equal(m.sim.us, 2026);
  assert.equal(m.exact.notDiscrete, true);
  assert.equal(m.mixed, false);
});

test('ug para todas y uf por actividad; con distribuciones distintas, «varias»; el núcleo da la media y la varianza', () => {
  const m = M7.model(st({ ug: 'unif', uf: { B: 'logn', C: 'disc' } }), 'es');
  assert.deepEqual(m.acts.map((a) => a.kind), ['unif', 'logn', 'disc', 'unif', 'unif', 'unif']);
  assert.equal(m.mixed, true);
  const A = m.acts[0];
  close(A.mean, 8, 1e-12, 'uniforme en [2, 14]');
  close(A.var, 12, 1e-12);
  const C = m.acts[2];
  assert.deepEqual(C.dist, MC.distFor('disc', { a: 2, m: 8, b: 13 }));
  assert.equal(C.edited, false);
  // La normal de M6 no cambia con la distribución elegida (A2).
  close(m.normal.mu, 23.833333333333332, 1e-9);
  // Ni la simulación ni la clave dependen del idioma.
  assert.equal(M7.model(st({ ug: 'unif', uf: { B: 'logn', C: 'disc' } }), 'en').sim.key, m.sim.key);
});

test('Discreta escrita (uq): se lee con fracciones y se conserva aunque cambien a, m y b (A4); con errores no se simula', () => {
  const good = M7.model(st({ uf: { C: 'disc' }, uq: { C: { x: ['2', '8', '13'], p: ['1/4', '0,5', '0.25'] } } }), 'es');
  const C = good.acts[2];
  assert.equal(C.edited, true);
  assert.deepEqual(C.dist, { kind: 'disc', x: [2, 8, 13], p: [0.25, 0.5, 0.25] });
  close(C.mean, 7.75, 1e-12);
  assert.equal(good.ok, true);
  // La normal de M6 toma la media y la varianza de la discreta escrita (A2).
  const v = 0.25 * 4 + 0.5 * 64 + 0.25 * 169 - 7.75 * 7.75;
  close(good.normal.var, 4 + v + 4 / 9 + 4 / 9, 1e-9, 'σ² de A–C–E–F con la discreta de C');
  for (const [q, code] of [[{ x: ['2', '8', '13'], p: ['0.2', '0.5', '0.2'] }, 'sum'], [{ x: ['2', '2'], p: ['0.5', '0.5'] }, 'repeated'],
    [{ x: ['-1', '3'], p: ['0.5', '0.5'] }, 'negative'], [{ x: ['2', 'x'], p: ['0.5', '0.5'] }, 'nan'], [{ x: ['2', '3'], p: ['1', '0'] }, 'prob']]) {
    const m = M7.model(st({ uf: { C: 'disc' }, uq: { C: q } }), 'es');
    assert.equal(m.acts[2].err, code, JSON.stringify(q));
    assert.equal(m.ok, false);
    assert.deepEqual(m.discErrors.map((e) => e.id), ['C']);
  }
  // Una discreta escrita de una actividad que no la usa se ignora.
  assert.equal(M7.model(st({ uq: { C: { x: ['1'], p: ['0.5'] } } }), 'es').ok, true);
});

test('Ejemplos discretos: solo discretas, sin a, m ni b; la cuenta exacta y la normal con sus momentos', () => {
  const m = M7.model(st({ ue: 'kd', ud: null }), 'es');
  assert.equal(m.discrete, true);
  assert.deepEqual(m.acts.map((a) => [a.kind, a.a]), [['disc', null], ['disc', null], ['disc', null], ['disc', null]]);
  assert.equal(m.deadline, 20);
  close(m.exact.mean, 23.248, 1e-9);
  close(m.exact.crit[2], 0.66, 1e-9);
  // ug no cambia nada en un ejemplo discreto; uf tampoco, salvo la propia discreta.
  assert.equal(M7.model(st({ ue: 'kd', ug: 'logn', uf: { A: 'unif' } }), 'es').sim.key, m.sim.key);
  const w = M7.model(st({ ue: 'wd' }), 'en');
  assert.equal(w.ok, true);
  assert.equal(w.deadline, Math.ceil(w.normal.mu + Math.sqrt(w.normal.var)), 'sin plazo en la fuente, μ + σ redondeado arriba');
  const e = M7.model(st({ ue: 'kd', uq: { A: { x: ['7', '9'], p: ['0.5', '0.5'] } } }), 'es');
  assert.equal(e.acts[0].edited, true);
  close(e.acts[0].mean, 8, 1e-12);
});

test('Tabla propia con errores de a, m o b: los errores de M5 y nada que simular', () => {
  const ut = { mode: 'pred', rows: [{ id: 'A', name: '', a: '3', m: '2', b: '5', links: '' }, { id: 'B', name: '', a: '1', m: '2', b: '3', links: 'A' }] };
  const m = M7.model(st({ ue: 'own', ut }), 'es');
  assert.equal(m.ok, false);
  assert.equal(m.issues[0].code, 'aGtM');
  assert.equal(m.sim, null);
  const okm = M7.model(st({ ue: 'own', ut: { mode: 'pred', rows: [Object.assign({}, ut.rows[1], { links: '' }), { id: 'C', name: '', a: '4', m: '4', b: '4', links: 'B' }] } }), 'es');
  assert.equal(okm.ok, true);
  assert.equal(okm.acts[1].var, 0, 'a = m = b: fija');
});

test('Réplicas (10^ur), semilla, plazo, percentil y correlación salen del estado', () => {
  const m = M7.model(st({ ur: 3, us: 77, ud: 27.5, uv: 80, uo: 's' }), 'es');
  assert.equal(m.sim.n, 1000);
  assert.equal(m.sim.us, 77);
  assert.equal(m.deadline, 27.5);
  assert.equal(m.pct, 0.8);
  assert.equal(m.corr, 'spearman');
  assert.notEqual(m.sim.key, M7.model(st({ ur: 3, us: 78 }), 'es').sim.key);
});

test('results: media con su intervalo, desviación, P(≤ plazo) con el suyo, percentiles y los de la normal de M6', () => {
  const m = M7.model(st(), 'es');
  const res = S.run({ kind: 'project', model: m.sim.model, n: m.sim.n, us: m.sim.us, track: true });
  const r = M7.results(m, res);
  const su = S.summary(res.durations);
  close(r.mean, su.mean, 1e-12);
  close(r.sd, su.sd, 1e-12);
  close(r.seMean, su.sd / 100, 1e-12);
  close(r.pT, su.pLE(25), 1e-12);
  close(r.seP, Math.sqrt(r.pT * (1 - r.pT) / 10000), 1e-12);
  const sorted = Float64Array.from(res.durations).sort();
  assert.deepEqual(r.q.map((x) => x.p), [0.5, 0.8, 0.9, 0.95]);
  for (const x of r.q) close(x.sim, MC.percentile(sorted, x.p), 0);
  close(r.q[0].normal, m.normal.mu, 1e-9);
  close(r.q[3].normal, m.normal.mu + 1.6448536269514722 * Math.sqrt(8.25), 1e-6);
  close(r.pN, 0.6576952657166104, 1e-9);
  assert.ok(r.mean > 23.83 && r.pT < 0.66, 'AC5');
  // El percentil elegido se añade si no es uno de los tres fijos, en su orden.
  const r2 = M7.results(M7.model(st({ uv: 85 }), 'es'), res);
  assert.deepEqual(r2.q.map((x) => x.p), [0.5, 0.8, 0.85, 0.9]);
});

test('tornadoOrder: por criticidad o por crucialidad, de mayor a menor, con empates por id (orden natural)', () => {
  const rows = [{ id: 'A10', crit: 0.5, cruc: 0.2 }, { id: 'A2', crit: 0.5, cruc: 0.9 }, { id: 'B', crit: 1, cruc: 0.1 }];
  assert.deepEqual(M7.tornadoOrder(rows, 'c').map((r) => r.id), ['B', 'A2', 'A10']);
  assert.deepEqual(M7.tornadoOrder(rows, 'u').map((r) => r.id), ['A2', 'A10', 'B']);
});
