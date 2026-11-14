'use strict';
// core/mc: distribuciones de M7, cuenta exacta, índices, caminos, percentiles, convergencia y JSON de intercambio
// (spec f4b-montecarlo-indices, AC1–AC5, AC8, AC10–AC13, AC20 y AC22; plan §0 y §3, P1–P3). Las cifras exactas de los
// ejemplos vienen de las fuentes citadas, recalculadas por enumeración con fracciones (spikes/f4b-montecarlo-indices).
const test = require('node:test');
const assert = require('node:assert/strict');
const MC = require('../js/core/mc.js');
const S = require('../js/core/sim.js');
const X = require('../js/core/stochex.js');
const rng = require('../js/core/rng.js');

const TIMED = !process.env.NODE_V8_COVERAGE;
const close = (a, b, tol = 1e-9, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg || ''}: ${a} frente a ${b}`);

// Un ejemplo de core/stochex como modelo de la simulación (orden topológico de la tabla, que ya lo cumple).
function modelOf(id) {
  const ex = X.get(id); const idx = new Map(ex.rows.map((r, i) => [r.id, i]));
  return { acts: ex.rows.map((r) => ({ id: r.id, preds: r.links ? r.links.split(',').map((s) => idx.get(s.trim())) : [],
    dist: r.disc ? { kind: 'disc', x: r.disc.x, p: r.disc.p } : { kind: 'pert', a: r.a, m: r.m, b: r.b } })) };
}
const sim = (model, n, us) => S.run({ kind: 'project', model, n, us, track: true });

// ---------- AC22: parámetros desde a, m y b ----------

test('AC22: distFor saca las seis distribuciones (y la clásica) de a, m y b', () => {
  const d = { a: 2, m: 6, b: 14 };
  assert.deepEqual(MC.distFor('pert', d), { kind: 'pert', a: 2, m: 6, b: 14 });
  assert.deepEqual(MC.distFor('classic', d), { kind: 'classic', a: 2, m: 6, b: 14 });
  assert.deepEqual(MC.distFor('tri', d), { kind: 'tri', a: 2, m: 6, b: 14 });
  assert.deepEqual(MC.distFor('unif', d), { kind: 'unif', a: 2, b: 14 });
  const n = MC.distFor('norm', d);
  assert.equal(n.kind, 'normal'); close(n.mu, 20 / 3); close(n.var, 4);
  const l = MC.distFor('logn', d);
  assert.equal(l.kind, 'logn'); close(l.mu, 20 / 3); close(l.sd, 2);
  assert.deepEqual(MC.distFor('disc', d), { kind: 'disc', x: [2, 6, 14], p: [1 / 6, 4 / 6, 1 / 6] });
  assert.deepEqual(MC.distFor('disc', d, { x: [1, 9], p: [0.5, 0.5] }), { kind: 'disc', x: [1, 9], p: [0.5, 0.5] });
});

test('AC22: la discreta inicial funde los valores iguales (a = m, m = b, a = m = b)', () => {
  assert.deepEqual(MC.distFor('disc', { a: 4, m: 4, b: 10 }), { kind: 'disc', x: [4, 10], p: [5 / 6, 1 / 6] });
  assert.deepEqual(MC.distFor('disc', { a: 1, m: 7, b: 7 }), { kind: 'disc', x: [1, 7], p: [1 / 6, 5 / 6] });
  assert.deepEqual(MC.distFor('disc', { a: 3, m: 3, b: 3 }), { kind: 'disc', x: [3], p: [1] });
});

test('AC22: moments da los momentos de cada distribución (la normal truncada con los suyos)', () => {
  const d = { a: 2, m: 6, b: 14 };
  close(MC.moments(MC.distFor('pert', d)).mean, 20 / 3);
  close(MC.moments(MC.distFor('tri', d)).mean, 22 / 3);
  close(MC.moments(MC.distFor('tri', d)).var, (4 + 36 + 196 - 12 - 28 - 84) / 18);
  assert.deepEqual(MC.moments(MC.distFor('unif', d)), { mean: 8, var: 12 });
  const l = MC.moments(MC.distFor('logn', d)); close(l.mean, 20 / 3); close(l.var, 4);
  const dd = MC.moments(MC.distFor('disc', d)); close(dd.mean, 20 / 3); close(dd.var, (4 + 4 * 36 + 196) / 6 - (20 / 3) ** 2);
  // Normal μ = 1, σ = 1 truncada en 0: media 1 + φ(1)/Φ(1) = 1,2876; varianza 1 − λ(λ − α)… (tablas de la truncada).
  const t = MC.moments({ kind: 'normal', mu: 1, var: 1 });
  close(t.mean, 1.2875999709391783, 1e-9, 'media de la truncada');
  close(t.var, 0.6296862857766157, 1e-9, 'varianza de la truncada');
  // Lejos de 0, casi la normal de PERT; mayor que la de PERT cuando σ es grande (dicho en pantalla, AC22).
  const far = MC.moments(MC.distFor('norm', { a: 20, m: 22, b: 24 })); close(far.mean, 22, 1e-9); close(far.var, 4 / 9, 1e-9);
  assert.ok(MC.moments(MC.distFor('norm', { a: 0, m: 1, b: 12 })).mean > (0 + 4 + 12) / 6);
  assert.deepEqual(MC.moments({ kind: 'fixed', d: 5 }), { mean: 5, var: 0 });
  assert.deepEqual(MC.moments({ kind: 'normal', mu: 3, var: 0 }), { mean: 3, var: 0 });
  assert.deepEqual(MC.moments({ kind: 'logn', mu: 3, sd: 0 }), { mean: 3, var: 0 });
});

// ---------- AC12: discreta mal escrita ----------

test('AC12: checkDisc nombra el error de una discreta', () => {
  assert.deepEqual(MC.checkDisc({ x: [1, 2], p: [0.5, 0.5] }), []);
  assert.deepEqual(MC.checkDisc({ x: [], p: [] }), ['empty']);
  assert.deepEqual(MC.checkDisc({ x: [1, 2], p: [0.5, 0.6] }), ['sum']);
  assert.deepEqual(MC.checkDisc({ x: [1, 1], p: [0.5, 0.5] }), ['repeated']);
  assert.deepEqual(MC.checkDisc({ x: [-1, 2], p: [0.5, 0.5] }), ['negative']);
  assert.deepEqual(MC.checkDisc({ x: [1, 2], p: [0, 1] }), ['prob']);
  assert.deepEqual(MC.checkDisc({ x: [1, NaN], p: [0.5, 0.5] }), ['nan']);
  assert.deepEqual(MC.checkDisc({ x: [1, 2], p: [1 / 3, 2 / 3] }), []);
});

// ---------- AC1 y AC2: cuenta exacta ----------

test('AC1: Klastorin con tiempos discretos (Tema 6c; Klastorin 2010, fig. 6.5–6.7): la cuenta exacta', () => {
  const ex = MC.exact(modelOf('kd'));
  assert.equal(ex.combos, 36);
  close(ex.mean, 2906 / 125, 1e-9, 'duración esperada (23,248; la diapositiva da 23,22 con 0,333)');
  const want = [[10, 0.004], [11, 0.004], [12, 0.004], [15, 0.108], [19, 0.056 / 3], [20, 0.056 / 3], [21, 0.056 / 3], [24, 0.224], [25, 0.6]];
  assert.equal(ex.dist.length, want.length);
  ex.dist.forEach((e, i) => { close(e.t, want[i][0]); close(e.p, want[i][1], 1e-12, `P(${e.t})`); });
  close(ex.pLE(20), 0.15733333333333333, 1e-12, 'P(≤ 20)');
  // Criticidad con holgura total 0 (empates contados; decisión del autor en clarify): C = 0,660, no 0,611.
  [0.068, 0.32, 0.66, 0.388].forEach((v, i) => close(ex.crit[i], v, 1e-12, `criticidad de ${'ABCD'[i]}`));
  assert.deepEqual(ex.paths.list.map((p) => p.ids.join('-')).sort(), ['A-D', 'B-D', 'C']);
  const pc = Object.fromEntries(ex.paths.list.map((p) => [p.ids.join('-'), p.crit]));
  close(pc['A-D'], 0.068, 1e-12); close(pc['B-D'], 0.32, 1e-12); close(pc.C, 0.66, 1e-12);
  [0.01619610356961226, 0.158688758267277, 0.5837062597294508, 0.4598491118827776].forEach((v, i) => close(ex.cruc[i], v, 1e-9, `crucialidad de ${'ABCD'[i]}`));
  [0.6028003311210469, 0.7434295697802236, 0.8172746042670337, 0.7904252047714104].forEach((v, i) => close(ex.sig[i], v, 1e-9, `significación de ${'ABCD'[i]}`));
});

test('AC2: Williams (2002, fig. 5.17–5.19): criticidad, crucialidad y significación exactas; la fija tiene crucialidad 0', () => {
  const want = {
    wa: { crit: [0.99, 0.01], cruc: [0.004982348335513804, 0.9999874626512375], sig: [0.13060513713539398, 0.87070091423596] },
    wb: { crit: [0.99, 0.01], cruc: [0.5044786562907853, 0.8619342151577696], sig: [0.9463722397476341, 0.06309148264984227] },
    wc: { crit: [0.99, 0.01], cruc: [0.9898453704365728, 0.10153440291366377], sig: [0.9902931659966664, 0.019609765663300322] },
    wd: { crit: [1, 1], cruc: [0, 1], sig: [1, 1] },
  };
  for (const [id, w] of Object.entries(want)) {
    const ex = MC.exact(modelOf(id));
    for (const k of ['crit', 'cruc', 'sig']) w[k].forEach((v, i) => close(ex[k][i], v, 1e-9, `${id} ${k} ${'AB'[i]}`));
  }
});

test('AC1: la cuenta exacta solo con discretas o fijas, y con un tope de combinaciones (P3)', () => {
  assert.equal(MC.exact(modelOf('kl')).notDiscrete, true);
  const fixedPert = { acts: [{ id: 'A', preds: [], dist: { kind: 'pert', a: 3, m: 3, b: 3 } }, { id: 'B', preds: [0], dist: { kind: 'disc', x: [1, 2], p: [0.5, 0.5] } }] };
  const e = MC.exact(fixedPert);
  assert.equal(e.combos, 2); close(e.mean, 4.5);
  const many = { acts: Array.from({ length: 18 }, (_, i) => ({ id: `A${i}`, preds: [], dist: { kind: 'disc', x: [1, 2], p: [0.5, 0.5] } })) };
  const r = MC.exact(many, { limit: 100000 });
  assert.equal(r.tooMany, true); assert.equal(r.combos, 2 ** 18);
});

// ---------- AC3: la simulación se acerca a la exacta ----------

test('AC3: discreto de Klastorin y Williams (b): media, P y cada criticidad simuladas dentro de 3 errores estándar de la exacta', () => {
  for (const id of ['kd', 'wb']) {
    const model = modelOf(id); const ex = MC.exact(model);
    for (const us of [1, 2, 3, 4, 5]) {
      const res = sim(model, 10000, us); const ix = MC.indices(res, model);
      const n = 10000; const T = Array.from(res.durations);
      const m = T.reduce((s, v) => s + v, 0) / n; const sd = Math.sqrt(T.reduce((s, v) => s + (v - m) ** 2, 0) / (n - 1));
      assert.ok(Math.abs(m - ex.mean) <= 3 * sd / Math.sqrt(n), `${id} semilla ${us}: media`);
      const t = ex.dist[Math.floor(ex.dist.length / 2)].t; const p = ex.pLE(t); const ps = T.filter((v) => v <= t).length / n;
      assert.ok(Math.abs(ps - p) <= 3 * Math.sqrt(p * (1 - p) / n) + 1e-12, `${id} semilla ${us}: P(≤ ${t})`);
      ix.crit.forEach((c, i) => assert.ok(Math.abs(c - ex.crit[i]) <= 3 * Math.sqrt(ex.crit[i] * (1 - ex.crit[i]) / n) + 1e-12, `${id} semilla ${us}: criticidad ${i}`));
    }
  }
});

// ---------- AC4: las siete distribuciones ----------

test('AC4: media y varianza muestrales de las siete dentro de 4 errores estándar de moments; ningún valor negativo', () => {
  const d = { a: 0, m: 1, b: 12 };   // asimétrica y pegada a 0: la truncada se nota
  for (const kind of MC.KINDS) {
    const dist = MC.distFor(kind, d); const mo = MC.moments(dist); const n = 40000;
    const x = Array.from(S.run({ kind: 'paths', model: { paths: [{ acts: [dist] }] }, n, us: 17 }).durations);
    assert.ok(x.every((v) => v >= 0), kind);
    const m = x.reduce((s, v) => s + v, 0) / n;
    assert.ok(Math.abs(m - mo.mean) <= 4 * Math.sqrt(mo.var / n), `${kind}: media ${m} frente a ${mo.mean}`);
    const v = x.reduce((s, q) => s + (q - m) ** 2, 0) / (n - 1);
    assert.ok(Math.abs(v - mo.var) <= 0.06 * mo.var, `${kind}: varianza ${v} frente a ${mo.var}`);
  }
});

// ---------- AC5: Klastorin continuo ----------

test('AC5: Klastorin con beta-PERT: media > 23,83, P(≤ 25) < 0,66, CI(A) = 1, CI(B) > 0 y E, F más críticas que B y C', () => {
  const model = modelOf('kl');
  for (const us of [1, 2, 3, 4, 5]) {
    const res = sim(model, 10000, us); const ix = MC.indices(res, model);
    const T = Array.from(res.durations);
    assert.ok(T.reduce((s, v) => s + v, 0) / T.length > 23.83, `semilla ${us}: media`);
    assert.ok(T.filter((v) => v <= 25).length / T.length < 0.66, `semilla ${us}: P(≤ 25)`);
    const [A, B, C, , E, F] = ix.crit;
    assert.equal(A, 1);
    assert.ok(B > 0.05, `semilla ${us}: CI(B) = ${B}`);
    for (const v of [E, F]) assert.ok(v > B && v > C, `semilla ${us}: E y F`);
  }
});

// ---------- índices: propiedades ----------

test('Índices: todo fijo → criticidad 0 o 1, crucialidad 0, significación d/(d + HT)·1', () => {
  const model = { acts: [{ id: 'A', preds: [], dist: { kind: 'fixed', d: 4 } }, { id: 'B', preds: [], dist: { kind: 'fixed', d: 2 } },
    { id: 'C', preds: [0, 1], dist: { kind: 'fixed', d: 3 } }] };
  const ix = MC.indices(sim(model, 50, 1), model);
  assert.deepEqual(ix.crit, [1, 0, 1]);
  assert.deepEqual(ix.cruc, [0, 0, 0]);
  close(ix.sig[0], 1); close(ix.sig[1], 2 / 4); close(ix.sig[2], 1);
});

test('AC20: Spearman = Pearson de los rangos (rangos medios); invariante con una transformación creciente', () => {
  const x = [3, 1, 4, 1, 5, 9, 2, 6];
  assert.deepEqual(Array.from(MC.ranks(x)), [4, 1.5, 5, 1.5, 6, 8, 3, 7]);
  const y = [2, 7, 1, 8, 2, 8, 1, 8];
  close(MC.spearman(x, y), MC.pearson(MC.ranks(x), MC.ranks(y)), 1e-15);
  close(MC.spearman(x.map((v) => Math.exp(v)), y), MC.spearman(x, y), 1e-15);
  assert.equal(MC.pearson([1, 1, 1], [1, 2, 3]), 0);
  const model = modelOf('kl'); const res = sim(model, 3000, 9);
  const sp = MC.indices(res, model, { corr: 'spearman' }); const pe = MC.indices(res, model, { corr: 'pearson' });
  assert.deepEqual(sp.crit, pe.crit);
  assert.notDeepEqual(sp.cruc, pe.cruc);
  sp.cruc.forEach((v, i) => close(v, MC.spearman(res.acts[i], res.durations), 1e-12));
});

test('Índices: Pearson con desviaciones en el denominador (no con varianzas)', () => {
  close(MC.pearson([1, 2, 3, 4], [2, 4, 6, 8]), 1, 1e-15);
  close(MC.pearson([1, 2, 3, 4], [10, 20, 30, 40]), 1, 1e-15);
});

// ---------- AC13: muchos caminos ----------

test('AC13: con más de 50 caminos, índices de actividad bien, caminos cortados en 50 por media y more con el resto', () => {
  // Rejilla de 6 capas de 3 actividades, todas unidas con la capa siguiente: 3⁶ = 729 caminos.
  const acts = [];
  for (let l = 0; l < 6; l++) for (let j = 0; j < 3; j++) {
    acts.push({ id: `L${l}${j}`, preds: l ? [0, 1, 2].map((q) => (l - 1) * 3 + q) : [], dist: { kind: 'pert', a: 1, m: 2 + j, b: 6 + j } });
  }
  const model = { acts };
  const res = sim(model, 2000, 4); const ix = MC.indices(res, model);
  assert.equal(ix.paths.list.length, 50);
  assert.equal(ix.paths.count, 729);
  assert.equal(ix.paths.more, 679);
  const means = ix.paths.list.map((p) => p.mean);
  assert.ok(means.every((m, i) => i === 0 || means[i - 1] >= m - 1e-12), 'ordenados por media');
  assert.deepEqual(ix.paths.list[0].ids, ['L02', 'L12', 'L22', 'L32', 'L42', 'L52']);
  // Cada capa tiene exactamente una actividad crítica por réplica (sin empates con continuas).
  for (let l = 0; l < 6; l++) close(ix.crit[l * 3] + ix.crit[l * 3 + 1] + ix.crit[l * 3 + 2], 1, 1e-12, `capa ${l}`);
});

// ---------- AC8: percentiles ----------

test('AC8: percentil = el menor valor con F ≥ p; plazo para una probabilidad coherente con P(≤ t)', () => {
  const x = Float64Array.from([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  assert.equal(MC.percentile(x, 0.5), 5);
  assert.equal(MC.percentile(x, 0.7), 7);   // 0,7 · 10 = 7,000000000000001 en coma flotante
  assert.equal(MC.percentile(x, 0.8), 8);
  assert.equal(MC.percentile(x, 0.91), 10);
  assert.equal(MC.percentile(x, 0.01), 1);
  assert.equal(MC.percentile(Float64Array.from([4]), 0.9), 4);
  assert.equal(MC.percentile(Float64Array.from([2, 2, 2, 7]), 0.75), 2);
  assert.equal(MC.percentile(Float64Array.from([2, 2, 2, 7]), 0.76), 7);
  const res = sim(modelOf('kl'), 5000, 3);
  const sorted = Float64Array.from(res.durations).sort();
  const s = S.summary(res.durations);
  for (const p of [0.5, 0.8, 0.9, 0.95]) {
    const t = MC.deadlineFor(sorted, p);
    assert.ok(s.pLE(t) >= p, `P(≤ ${t}) ≥ ${p}`);
    assert.ok(s.pLE(t - 1e-9) < p, `justo antes, < ${p}`);
  }
});

// ---------- AC10: convergencia ----------

test('AC10: convergencia: el error estándar de la media decrece como 1/√n y el intervalo rodea la estimación', () => {
  const model = modelOf('kl'); const res = sim(model, 20000, 6);
  const cv = MC.convergence(res, model, { deadline: 25, p: 0.8 });
  assert.equal(cv.length, 20);
  assert.equal(cv[0].n, 10); assert.equal(cv[cv.length - 1].n, 20000);
  assert.ok(cv.every((c, i) => i === 0 || c.n > cv[i - 1].n));
  const k = cv.slice(5).map((c) => c.se * Math.sqrt(c.n));
  const mk = k.reduce((s, v) => s + v, 0) / k.length;
  assert.ok(k.every((v) => Math.abs(v - mk) < 0.15 * mk), 'se·√n casi constante');
  const last = cv[cv.length - 1]; const T = Array.from(res.durations);
  close(last.mean, T.reduce((s, v) => s + v, 0) / T.length, 1e-9);
  close(last.pT, T.filter((v) => v <= 25).length / T.length, 1e-12);
  close(last.seP, Math.sqrt(last.pT * (1 - last.pT) / last.n), 1e-12);
  assert.equal(last.q, MC.percentile(Float64Array.from(T).sort(), 0.8));
  assert.deepEqual(last.crit, MC.indices(res, model).crit);
});

// ---------- JSON y réplica ----------

test('P6: toJSON da el formato de intercambio con el .py (ids, predecesoras por id, distribución y opciones)', () => {
  const model = modelOf('kd');
  const j = MC.toJSON(model, { unit: 'weeks', reps: 10000, us: 2026, deadline: 20, p: 0.8, corr: 'pearson', names: { A: 'Task A' } });
  assert.equal(j.format, 'pnl-montecarlo'); assert.equal(j.version, 1);
  assert.deepEqual([j.reps, j.seed, j.deadline, j.percentile, j.corr, j.unit], [10000, 2026, 20, 0.8, 'pearson', 'weeks']);
  assert.deepEqual(j.activities.map((a) => [a.id, a.preds]), [['A', []], ['B', []], ['C', []], ['D', ['A', 'B']]]);
  assert.equal(j.activities[0].name, 'Task A');
  assert.deepEqual(j.activities[3].dist, { kind: 'disc', x: [3, 12], p: [0.3, 0.7] });
  assert.deepEqual(JSON.parse(JSON.stringify(j)), j);
});

test('Réplica a réplica: replicaTrace da las duraciones, ES y EF, la duración y lo crítico de la réplica k', () => {
  const model = modelOf('kd'); const res = sim(model, 30, 8);
  for (let k = 0; k < 30; k++) {
    const r = MC.replicaTrace(res, model, k);
    const [a, b, c, d] = r.d;
    assert.deepEqual(r.d, res.acts.map((x) => x[k]));
    assert.equal(r.T, res.durations[k]);
    assert.deepEqual(r.es, [0, 0, 0, Math.max(a, b)]);
    assert.deepEqual(r.ef, [a, b, c, Math.max(a, b) + d]);
    assert.deepEqual(r.crit, [0, 1, 2, 3].filter((i) => res.tf[i][k] <= 1e-9 * Math.max(1, r.T)));
  }
});

// ---------- AC11: tiempo ----------

function randomProject(n, seed) {
  const u = rng.mulberry32(seed); const acts = [];
  for (let i = 0; i < n; i++) {
    const preds = []; for (let j = Math.max(0, i - 6); j < i; j++) if (u() < 0.35) preds.push(j);
    const a = 1 + Math.floor(u() * 5); const m = a + Math.floor(u() * 6); const b = m + 1 + Math.floor(u() * 8);
    acts.push({ id: `A${i}`, preds, dist: { kind: 'pert', a, m, b } });
  }
  return { acts };
}

test('AC11: 10 000 réplicas de 30 y de 40 actividades con track e índices (Pearson y Spearman) en menos de 2 s', { skip: !TIMED }, () => {
  for (const k of [30, 40]) for (const corr of ['pearson', 'spearman']) {
    const model = randomProject(k, 2026 + k);
    const t0 = Date.now();
    MC.indices(sim(model, 10000, 7), model, { corr });
    const ms = Date.now() - t0;
    assert.ok(ms < 2000, `${k} actividades, ${corr}: ${ms} ms`);
  }
});

test('Índices: la significación y la crucialidad simuladas se acercan a las exactas (discreto de Klastorin, 40 000 réplicas)', () => {
  const model = modelOf('kd'); const ex = MC.exact(model);
  const ix = MC.indices(sim(model, 40000, 12), model);
  ix.sig.forEach((v, i) => close(v, ex.sig[i], 0.006, `significación de ${'ABCD'[i]}`));
  ix.cruc.forEach((v, i) => close(v, ex.cruc[i], 0.02, `crucialidad de ${'ABCD'[i]}`));
});
