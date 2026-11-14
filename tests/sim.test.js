'use strict';
// core/sim: simulación con semilla, a trozos, de un proyecto o de caminos en paralelo (spec f4a-tres-tiempos-tcl,
// AC5, AC6 y AC10; plan §3, P3, P6 y P8). La F4b la ampliará (índices, percentiles, convergencia).
const test = require('node:test');
const assert = require('node:assert/strict');
const S = require('../js/core/sim.js');
const T = require('../js/core/threept.js');
const rng = require('../js/core/rng.js');

// Las medidas de tiempo solo se comprueban sin cobertura (como en generator y mindummy).
const TIMED = !process.env.NODE_V8_COVERAGE;

const mean = (x) => x.reduce((s, v) => s + v, 0) / x.length;
const variance = (x) => { const m = mean(x); return x.reduce((s, v) => s + (v - m) ** 2, 0) / (x.length - 1); };
function pearson(x, y) {
  const mx = mean(x); const my = mean(y); let sxy = 0; let sx = 0; let sy = 0;
  for (let i = 0; i < x.length; i++) { sxy += (x[i] - mx) * (y[i] - my); sx += (x[i] - mx) ** 2; sy += (y[i] - my) ** 2; }
  return sxy / Math.sqrt(sx * sy);
}
const KL = { A: [2, 6, 14], B: [4, 7, 12], C: [2, 8, 13], D: [12, 14, 18], E: [3, 5, 7], F: [3, 4, 7] };
const pert = (a, m, b) => ({ kind: 'pert', a, m, b });
// Klastorin (Tema 6c) en orden topológico: B, C, D tras A; E tras B y C; F tras E.
const klastorin = () => ({ acts: [
  { id: 'A', preds: [], dist: pert(...KL.A) }, { id: 'B', preds: [0], dist: pert(...KL.B) },
  { id: 'C', preds: [0], dist: pert(...KL.C) }, { id: 'D', preds: [0], dist: pert(...KL.D) },
  { id: 'E', preds: [1, 2], dist: pert(...KL.E) }, { id: 'F', preds: [4], dist: pert(...KL.F) }] });

function randomProject(n, seed) {
  const u = rng.mulberry32(seed); const acts = [];
  for (let i = 0; i < n; i++) {
    const preds = new Set();
    if (i > 0) { const k = 1 + Math.floor(u() * Math.min(3, i)); for (let j = 0; j < k; j++) preds.add(Math.floor(u() * i)); }
    const a = 1 + Math.floor(u() * 5); const m = a + Math.floor(u() * 6); const b = m + 1 + Math.floor(u() * 10);
    acts.push({ id: `X${i}`, preds: [...preds], dist: pert(a, m, b) });
  }
  return { acts };
}

test('T005: la misma semilla da el mismo Float64Array, se corte en trozos de 1, 7 o 10 000 réplicas (AC5)', () => {
  const whole = S.run({ kind: 'project', model: klastorin(), n: 2000, us: 4242 }).durations;
  for (const reps of [1, 7, 10000]) {
    const job = S.start({ kind: 'project', model: klastorin(), n: 2000, us: 4242 });
    let guard = 0;
    while (!S.step(job, { reps }).done) assert.ok(++guard < 5000);
    assert.deepEqual(S.result(job).durations, whole, `trozos de ${reps}`);
  }
  const other = S.run({ kind: 'project', model: klastorin(), n: 2000, us: 4243 }).durations;
  assert.notDeepEqual(other, whole);
  assert.equal(S.run({ kind: 'project', model: klastorin(), us: 1 }).durations.length, S.DEFAULT_N);
});

test('T005: step con presupuesto de tiempo avanza y termina; result antes de terminar falla', () => {
  const job = S.start({ kind: 'project', model: klastorin(), n: 5000, us: 9 });
  assert.throws(() => S.result(job));
  let r; let guard = 0;
  do { r = S.step(job, { ms: 1 }); assert.ok(r.k >= 1 && r.k <= 5000); assert.ok(++guard < 6000); } while (!r.done);
  assert.equal(S.result(job).durations.length, 5000);
});

test('T005: media y varianza muestrales de cada distribución dentro de 4 errores estándar', () => {
  const n = 100000;
  const dists = [pert(2, 6, 14), { kind: 'classic', a: 2, m: 6, b: 14 }, { kind: 'tri', a: 2, m: 6, b: 14 },
    pert(3, 3, 9), { kind: 'normal', mu: 30, var: 4 }, { kind: 'fixed', d: 7 }];
  dists.forEach((dist, i) => {
    const x = S.run({ kind: 'project', model: { acts: [{ id: 'A', preds: [], dist }] }, n, us: 100 + i }).durations;
    const th = dist.kind === 'normal' ? { mean: dist.mu, var: dist.var } : dist.kind === 'fixed' ? { mean: dist.d, var: 0 }
      : T.moments(dist.kind, dist);
    const m = mean(x); const v = variance(x);
    if (th.var === 0) { assert.ok(x.every((y) => y === dist.d)); return; }
    const m4 = x.reduce((s, y) => s + (y - m) ** 4, 0) / n;
    assert.ok(Math.abs(m - th.mean) <= 4 * Math.sqrt(th.var / n), `${dist.kind} media ${m} frente a ${th.mean}`);
    assert.ok(Math.abs(v - th.var) <= 4 * Math.sqrt((m4 - v * v) / n), `${dist.kind} varianza ${v} frente a ${th.var}`);
    if (dist.kind !== 'normal') assert.ok(x.every((y) => y >= dist.a && y <= dist.b), dist.kind);
  });
});

test('T005: la normal se trunca en 0 (μ = 1, σ² = 1): nunca negativa y con la media de la truncada', () => {
  const x = S.run({ kind: 'project', model: { acts: [{ id: 'A', preds: [], dist: { kind: 'normal', mu: 1, var: 1 } }] }, n: 100000, us: 5 }).durations;
  assert.ok(x.every((y) => y >= 0));
  const truncMean = 1 + Math.exp(-0.5) / Math.sqrt(2 * Math.PI) / T.phi(1);   // μ + σ φ(α)/(1 − Φ(α)), α = −1
  assert.ok(Math.abs(mean(x) - truncMean) < 0.01, `${mean(x)} frente a ${truncMean}`);
});

test('T005: caminos en paralelo: la duración es el máximo de las sumas; con un solo camino, su suma', () => {
  const one = S.run({ kind: 'paths', model: { paths: [{ acts: [pert(2, 6, 14), pert(3, 5, 7)] }] }, n: 50000, us: 3 }).durations;
  const th = T.moments('pert', { a: 2, m: 6, b: 14 }).mean + 5;
  assert.ok(Math.abs(mean(one) - th) < 4 * Math.sqrt(5.5 / 50000));
  const two = S.run({ kind: 'paths', model: { paths: [{ acts: [{ kind: 'normal', mu: 30, var: 4 }] }, { acts: [{ kind: 'normal', mu: 30, var: 4 }] }] }, n: 40000, us: 8 }).durations;
  const p = S.summary(two).pLE(30);
  assert.ok(Math.abs(p - 0.25) <= 3 * Math.sqrt(0.25 * 0.75 / 40000), `P(máx ≤ 30) = ${p}`);   // Tema 6c, paralelización
});

test('T005: cópula gaussiana dentro de un camino: con ρ = 0, independientes; la correlación de Pearson crece con ρ (P8)', () => {
  const pairs = (rho, us) => {
    const job = S.start({ kind: 'paths', model: { paths: [{ acts: [pert(2, 6, 14), pert(2, 6, 14)], rho }] }, n: 20000, us, keepActs: true });
    while (!S.step(job, { reps: 20000 }).done);
    const r = S.result(job); return [r.acts[0], r.acts[1], r.durations];
  };
  const rs = [0, 0.3, 0.6, 0.9].map((rho, i) => { const [x, y] = pairs(rho, 50 + i); return pearson(x, y); });
  assert.ok(Math.abs(rs[0]) < 0.03, `ρ = 0 → ${rs[0]}`);
  for (let i = 1; i < rs.length; i++) assert.ok(rs[i] > rs[i - 1] + 0.1, `Pearson ${rs}`);
  const [x0, , sum0] = pairs(0, 77);
  assert.ok(Math.abs(variance(sum0) - 2 * (44 / 9)) < 0.3, `varianza de la suma con ρ = 0: ${variance(sum0)}`);
  const vx = variance(x0); assert.ok(Math.abs(vx - 44 / 9) < 0.2, `marginal ${vx}`);
  const [, , sum9] = pairs(0.9, 78);
  assert.ok(variance(sum9) > 1.6 * 2 * (44 / 9), `varianza de la suma con ρ = 0,9: ${variance(sum9)}`);
});

test('T005: resumen: P(≤ T), histograma que suma n y distancia KS a una normal', () => {
  const x = S.run({ kind: 'project', model: { acts: [{ id: 'A', preds: [], dist: { kind: 'normal', mu: 50, var: 25 } }] }, n: 10000, us: 12 }).durations;
  const s = S.summary(x);
  assert.equal(s.n, 10000);
  assert.ok(Math.abs(s.mean - 50) < 0.2 && Math.abs(s.sd - 5) < 0.2);
  assert.ok(Math.abs(s.pLE(50) - 0.5) < 0.02);
  assert.equal(s.pLE(-1), 0); assert.equal(s.pLE(1000), 1);
  const h = s.hist(20);
  assert.equal(h.counts.length, 20);
  assert.equal(h.counts.reduce((a, b) => a + b, 0), 10000);
  assert.ok(h.lo <= s.min && h.lo + 20 * h.width >= s.max);
  assert.ok(s.ks(50, 5) < 0.02, `KS ${s.ks(50, 5)}`);           // muestra de la misma normal
  assert.ok(s.ks(55, 5) > 0.3, `KS desplazada ${s.ks(55, 5)}`);
  const flat = S.summary(new Float64Array([3, 3, 3])).hist(5);
  assert.equal(flat.counts.reduce((a, b) => a + b, 0), 3);
});

test('T005: Klastorin simulado: media mayor que la del camino crítico y P(≤ 25) < 0,658 (AC7, cifra del prototipo ≈ 0,556)', () => {
  const s = S.summary(S.run({ kind: 'project', model: klastorin(), n: 20000, us: 20261113 }).durations);
  assert.ok(s.mean > 143 / 6);
  assert.ok(s.pLE(25) < 0.658 - 3 * Math.sqrt(0.25 / 20000), `${s.pLE(25)}`);
  assert.ok(Math.abs(s.pLE(25) - 0.556) < 0.02, `${s.pLE(25)}`);
});

test('T005: modelos mal formados se rechazan', () => {
  assert.throws(() => S.start({ kind: 'project', model: { acts: [{ id: 'A', preds: [1], dist: pert(1, 2, 3) }, { id: 'B', preds: [], dist: pert(1, 2, 3) }] }, us: 1 }));
  assert.throws(() => S.start({ kind: 'cosa', model: {}, us: 1 }));
  assert.throws(() => S.start({ kind: 'project', model: { acts: [{ id: 'A', preds: [], dist: { kind: 'gamma' } }] }, us: 1 }));
  assert.throws(() => S.start({ kind: 'paths', model: { paths: [{ acts: [{ kind: 'normal', mu: 1, var: 1 }], rho: 1.5 }] }, us: 1 }));
});

test('T005: 10 000 réplicas de 30 y de 40 actividades en menos de 2 s (principio 26)', { skip: !TIMED }, () => {
  for (const n of [30, 40]) {
    const t0 = process.hrtime.bigint();
    S.run({ kind: 'project', model: randomProject(n, n), n: 10000, us: 1 });
    const ms = Number(process.hrtime.bigint() - t0) / 1e6;
    assert.ok(ms < 2000, `${n} actividades: ${ms} ms`);
  }
});

// ---------- Revisión de nivel 2 de la F4a (T017, ronda 1) ----------

test('F4a r1 (F3): huella fija de una semilla (AC5, AC14): un enlace ya compartido da siempre el mismo histograma', () => {
  // Si cambia el orden o el número de números aleatorios que consume una réplica, cambian estos valores: cambiar el
  // muestreo obliga a decidir qué pasa con los enlaces publicados.
  const d = S.run({ kind: 'project', model: klastorin(), n: 1000, us: 2026 }).durations;
  assert.deepEqual(Array.from(d.slice(0, 4)).map((x) => x.toFixed(10)), ['23.1209857710', '28.7551874187', '22.8137917632', '22.4392094705']);
  assert.equal(d.reduce((s, x) => s + x, 0).toFixed(8), '24680.98264496');
  const c = S.run({ kind: 'paths', model: { paths: [{ acts: [pert(2, 6, 14), pert(3, 5, 7)], rho: 0.5 }] }, n: 1000, us: 2026 }).durations;
  assert.deepEqual(Array.from(c.slice(0, 3)).map((x) => x.toFixed(10)), ['12.1444127023', '11.7869455424', '11.5830267262']);
  assert.equal(c.reduce((s, x) => s + x, 0).toFixed(8), '11706.52484518');
});

test('F4a r1 (F4): la cópula da la correlación pedida (Pearson ≈ ρ con la terna simétrica) y respeta la marginal con ρ > 0', () => {
  const draw = (acts, rho, us, n) => {
    const job = S.start({ kind: 'paths', model: { paths: [{ acts, rho }] }, n, us, keepActs: true });
    while (!S.step(job, { reps: n }).done);
    return S.result(job).acts;
  };
  for (const [rho, us] of [[0.3, 91], [0.6, 92], [0.9, 93]]) {
    const [x, y] = draw([pert(0, 6, 12), pert(0, 6, 12)], rho, us, 20000);
    const r = pearson(x, y);
    assert.ok(Math.abs(r - rho) < 0.03, `ρ = ${rho} → Pearson ${r}`);
  }
  // La marginal de (2, 6, 14) con ρ = 0,3 sigue siendo la beta-PERT: media 20/3 y varianza 44/9.
  const [x] = draw([pert(2, 6, 14), pert(2, 6, 14)], 0.3, 94, 40000);
  assert.ok(Math.abs(mean(x) - 20 / 3) < 0.05, `media ${mean(x)}`);
  assert.ok(Math.abs(variance(x) - 44 / 9) < 0.15, `varianza ${variance(x)}`);
});

test('F4a r1 (F5): P(≤ T) cuenta las réplicas iguales a T (a = m = b con el plazo en la duración)', () => {
  const s = S.summary(Float64Array.from([5, 5, 5, 5]));
  assert.equal(s.pLE(5), 1);
  assert.equal(s.pLE(4.999), 0);
  assert.equal(S.summary(Float64Array.from([1, 2, 2, 3])).pLE(2), 0.75);
});

test('F4a r1 (F6): la distancia KS mira los dos lados (simulación a la derecha y a la izquierda de la normal)', () => {
  const n = 400;
  const x = Float64Array.from({ length: n }, (_, i) => 50 + 5 * T.phiInv((i + 0.5) / n));   // cuantiles de N(50, 5)
  const s = S.summary(x);
  const expect = 2 * T.phi(0.5) - 1;   // 0,3829: la distancia entre N(50, 5) y N(45, 5) o N(55, 5), en 47,5 o 52,5
  assert.ok(Math.abs(s.ks(45, 5) - expect) < 0.01, `a la derecha de la normal: ${s.ks(45, 5)}`);
  assert.ok(Math.abs(s.ks(55, 5) - expect) < 0.01, `a la izquierda de la normal: ${s.ks(55, 5)}`);
  assert.ok(s.ks(50, 5) < 0.01);
});

// ---------- F4b T004: distribuciones nuevas y track (spec f4b-montecarlo-indices; plan §0 y §3) ----------

const KLD = () => ({ acts: [   // Klastorin con tiempos discretos (Tema 6c): D tras A y B; C sola
  { id: 'A', preds: [], dist: { kind: 'disc', x: [7, 8, 9], p: [1 / 3, 1 / 3, 1 / 3] } },
  { id: 'B', preds: [], dist: { kind: 'disc', x: [2, 12], p: [0.2, 0.8] } },
  { id: 'C', preds: [], dist: { kind: 'disc', x: [5, 15, 25], p: [0.2, 0.2, 0.6] } },
  { id: 'D', preds: [0, 1], dist: { kind: 'disc', x: [3, 12], p: [0.3, 0.7] } }] });

test('F4b T004: uniforme, lognormal y discreta: media y varianza muestrales dentro de 4 errores estándar, sin negativos', () => {
  const ln = { mu: 6.667, sd: 2 };
  const s2 = Math.log(1 + (ln.sd / ln.mu) ** 2);
  const cases = [
    [{ kind: 'unif', a: 2, b: 14 }, 8, 144 / 12],
    [{ kind: 'logn', mu: ln.mu, sd: ln.sd }, ln.mu, ln.sd ** 2],
    [{ kind: 'disc', x: [5, 15, 25], p: [0.2, 0.2, 0.6] }, 19, 0.2 * 196 + 0.2 * 16 + 0.6 * 36],
  ];
  for (const [dist, mu, v] of cases) {
    const n = 40000;
    const d = Array.from(S.run({ kind: 'paths', model: { paths: [{ acts: [dist] }] }, n, us: 99 }).durations);
    assert.ok(d.every((x) => x >= 0), dist.kind);
    assert.ok(Math.abs(mean(d) - mu) < 4 * Math.sqrt(v / n), `${dist.kind}: media ${mean(d)} frente a ${mu}`);
    const kurt = dist.kind === 'logn' ? Math.exp(4 * s2) + 2 * Math.exp(3 * s2) + 3 * Math.exp(2 * s2) - 3 : 3;
    assert.ok(Math.abs(variance(d) - v) < 4 * v * Math.sqrt((kurt - 1) / n), `${dist.kind}: varianza ${variance(d)} frente a ${v}`);
  }
  const disc = Array.from(S.run({ kind: 'paths', model: { paths: [{ acts: [cases[2][0]] }] }, n: 1000, us: 3 }).durations);
  assert.ok(disc.every((x) => [5, 15, 25].includes(x)), 'la discreta solo da sus valores');
});

test('F4b T004: casos fijos: uniforme y lognormal sin anchura, discreta de un valor', () => {
  const one = (dist) => Array.from(S.run({ kind: 'paths', model: { paths: [{ acts: [dist] }] }, n: 50, us: 1 }).durations);
  assert.ok(one({ kind: 'unif', a: 4, b: 4 }).every((x) => x === 4));
  assert.ok(one({ kind: 'logn', mu: 5, sd: 0 }).every((x) => x === 5));
  assert.ok(one({ kind: 'logn', mu: 0, sd: 0 }).every((x) => x === 0));
  assert.ok(one({ kind: 'disc', x: [100], p: [1] }).every((x) => x === 100));
});

test('F4b T004: distribuciones nuevas mal formadas se rechazan', () => {
  const bad = (dist) => assert.throws(() => S.start({ kind: 'paths', model: { paths: [{ acts: [dist] }] }, n: 1, us: 1 }), undefined, JSON.stringify(dist));
  bad({ kind: 'unif', a: 5, b: 4 });
  bad({ kind: 'unif', a: -1, b: 4 });
  bad({ kind: 'logn', mu: -1, sd: 1 });
  bad({ kind: 'logn', mu: 1, sd: -1 });
  bad({ kind: 'disc', x: [1, 2], p: [0.5, 0.6] });
  bad({ kind: 'disc', x: [1, 1], p: [0.5, 0.5] });
  bad({ kind: 'disc', x: [-1, 2], p: [0.5, 0.5] });
  bad({ kind: 'disc', x: [1, 2], p: [0, 1] });
  bad({ kind: 'disc', x: [], p: [] });
});

test('F4b T004: track guarda dᵢ, HTᵢ y T por réplica; HT coincide con una pasada hacia atrás hecha aparte', () => {
  const model = KLD();
  const res = S.run({ kind: 'project', model, n: 500, us: 11, track: true });
  assert.equal(res.acts.length, 4);
  assert.equal(res.tf.length, 4);
  for (let r = 0; r < 500; r++) {
    const [a, b, c, d] = res.acts.map((x) => x[r]);
    const T = Math.max(Math.max(a, b) + d, c);
    assert.equal(res.durations[r], T);
    const want = [T - (Math.max(a, b) + d) + Math.max(a, b) - a, T - (Math.max(a, b) + d) + Math.max(a, b) - b, T - c, T - (Math.max(a, b) + d)];
    want.forEach((w, i) => assert.ok(Math.abs(res.tf[i][r] - w) < 1e-12, `réplica ${r}, actividad ${i}`));
  }
});

test('F4b T004: track no cambia la secuencia: mismas duraciones con y sin track, y con trozos de 1, 7 y 10 000', () => {
  const model = klastorin();
  const base = S.run({ kind: 'project', model, n: 2000, us: 2026 }).durations;
  const tracked = S.run({ kind: 'project', model, n: 2000, us: 2026, track: true }).durations;
  assert.deepEqual(Array.from(tracked), Array.from(base));
  for (const reps of [1, 7, 10000]) {
    const job = S.start({ kind: 'project', model, n: 2000, us: 2026, track: true });
    while (!S.step(job, { reps }).done);
    const r = S.result(job);
    assert.deepEqual(Array.from(r.durations), Array.from(base), `trozos de ${reps}`);
    assert.equal(r.tf.length, 6);
  }
});

test('F4b T004: la cópula también vale con uniforme, lognormal y discreta (marginal respetada con ρ > 0)', () => {
  const dists = [[{ kind: 'unif', a: 2, b: 14 }, 8], [{ kind: 'logn', mu: 6, sd: 2 }, 6], [{ kind: 'disc', x: [5, 15, 25], p: [0.2, 0.2, 0.6] }, 19],
    [{ kind: 'unif', a: 3, b: 3 }, 3], [{ kind: 'logn', mu: 4, sd: 0 }, 4], [{ kind: 'disc', x: [7], p: [1] }, 7]];
  const n = 20000;
  const res = S.run({ kind: 'paths', model: { paths: [{ acts: dists.map((d) => d[0]), rho: 0.5 }] }, n, us: 5, keepActs: true });
  dists.forEach(([d, mu], i) => {
    const x = Array.from(res.acts[i]);
    assert.ok(x.every((v) => v >= 0), d.kind);
    assert.ok(Math.abs(mean(x) - mu) < 0.15 + 0.02 * mu, `${d.kind}: ${mean(x)} frente a ${mu}`);
  });
  assert.ok(pearson(Array.from(res.acts[0]), Array.from(res.acts[1])) > 0.3, 'correladas');
});
