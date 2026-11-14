/*
 * core/sim — simulación con semilla de la duración de un proyecto (spec f4a-tres-tiempos-tcl; plan §3, P3, P6 y P8).
 * La F4a la usa en los contraejemplos de M6; la F4b la ampliará (índices, percentiles, convergencia).
 *
 * start({ kind, model, n, us, keepActs }) → job; step(job, { reps, ms }) → { done, k }; result(job) → { durations,
 * acts? }; run(opts) hace todo de una vez. summary(durations) → { n, mean, sd, min, max, pLE(T), hist(bins), ks(mu, sd) }.
 * - kind 'project': model.acts = [{ id, preds: [índices anteriores], dist }] en orden topológico; la duración de una
 *   réplica sale de la pasada hacia delante con las duraciones muestreadas.
 * - kind 'paths': model.paths = [{ acts: [dist], rho }]; la duración es el máximo de las sumas de cada camino. Con
 *   rho > 0, las duraciones de un camino se correlacionan con una cópula gaussiana de un factor (P8):
 *   Zᵢ = √ρ·W + √(1 − ρ)·εᵢ y la duración es la inversa de su distribución en Φ(Zᵢ) (en una rejilla de 1024 puntos).
 * - dist: { kind: 'pert' | 'classic' | 'tri', a, m, b } (core/threept), { kind: 'normal', mu, var } (truncada en 0) o
 *   { kind: 'fixed', d }.
 * F4b (spec f4b-montecarlo-indices; plan §0, §3 y P1): también { kind: 'unif', a, b }, { kind: 'logn', mu, sd } (lognormal con esa
 * media y desviación) y { kind: 'disc', x, p } (valores distintos ≥ 0 con probabilidades > 0 que suman 1; por inversión).
 * start({ track: true }) guarda por réplica la duración de cada actividad (acts) y su holgura total (tf, de una pasada hacia
 * atrás con las duraciones de esa réplica), para los índices de core/mc. Ni lo uno ni lo otro cambia el orden de la semilla.
 * Todo el azar sale de rng.mulberry32(us) y se consume siempre en el mismo orden (réplica a réplica, actividad a
 * actividad), así que el resultado no depende de cómo se corte en trozos con step (AC5). Muestreo (P3): normal por
 * Box–Muller con el par guardado; gamma de Marsaglia–Tsang; beta como cociente de gammas; triangular por inversión.
 */
(function (root) {
  'use strict';

  const isNode = typeof module !== 'undefined' && module.exports;
  const rng = isNode ? require('./rng.js') : root.PNL.rng;
  const T = isNode ? require('./threept.js') : root.PNL.threept;

  const DEFAULT_N = 10000;
  const GRID = 1024;
  const now = () => Date.now();

  function sampler(seed) {
    const u = rng.mulberry32(seed);
    let spare = null;
    const unif = () => { let x = u(); while (x <= 0) x = u(); return x; };   // (0, 1)
    function normal() {
      if (spare !== null) { const s = spare; spare = null; return s; }
      const r = Math.sqrt(-2 * Math.log(unif())); const t = 2 * Math.PI * u();
      spare = r * Math.sin(t);
      return r * Math.cos(t);
    }
    function gamma(k) {               // Marsaglia–Tsang, k ≥ 1
      const d = k - 1 / 3; const c = 1 / Math.sqrt(9 * d);
      for (;;) {
        let x; let v;
        do { x = normal(); v = 1 + c * x; } while (v <= 0);
        v = v * v * v;
        const w = unif();
        if (w < 1 - 0.0331 * x * x * x * x || Math.log(w) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
      }
    }
    return { u, normal, gamma };
  }

  // ---------- distribuciones ----------
  const isNum = (x) => typeof x === 'number' && Number.isFinite(x);
  function prepare(dist, copula) {
    if (!dist || typeof dist !== 'object') throw new Error('sim: distribución vacía');
    const { kind } = dist;
    if (kind === 'fixed') {
      if (!isNum(dist.d) || dist.d < 0) throw new Error('sim: duración fija no válida');
      return { kind, d: dist.d };
    }
    if (kind === 'normal') {
      if (!isNum(dist.mu) || !isNum(dist.var) || dist.var < 0) throw new Error('sim: normal no válida');
      const sd = Math.sqrt(dist.var);
      return { kind, mu: dist.mu, sd, lo: sd > 0 ? T.phi(-dist.mu / sd) : 0 };
    }
    if (kind === 'unif') {
      const { a, b } = dist;
      if (!isNum(a) || !isNum(b) || !(a >= 0 && a <= b)) throw new Error('sim: uniforme no válida');
      return { kind, a, w: b - a, fixed: !(b > a) };
    }
    if (kind === 'logn') {
      const { mu, sd } = dist;
      if (!isNum(mu) || !isNum(sd) || mu < 0 || sd < 0) throw new Error('sim: lognormal no válida');
      if (!(mu > 0 && sd > 0)) return { kind, fixed: true, d: mu };
      const s2 = Math.log(1 + (sd / mu) ** 2);
      return { kind, fixed: false, m: Math.log(mu) - s2 / 2, s: Math.sqrt(s2) };
    }
    if (kind === 'disc') {
      const x = dist.x || []; const pr = dist.p || [];
      if (!x.length || x.length !== pr.length || !x.every((v) => isNum(v) && v >= 0) || !pr.every((v) => isNum(v) && v > 0)
        || new Set(x).size !== x.length) throw new Error('sim: discreta no válida');
      const c = []; let acc = 0;
      for (const v of pr) { acc += v; c.push(acc); }
      if (Math.abs(acc - 1) > 1e-9) throw new Error('sim: las probabilidades de la discreta no suman 1');
      return { kind, x: x.slice(), c, fixed: x.length === 1 };
    }
    if (T.KINDS.includes(kind)) {
      const { a, m, b } = dist;
      if (![a, m, b].every(isNum) || !(a >= 0 && a <= m && m <= b)) throw new Error('sim: a, m, b no válidos');
      const d = { a, m, b };
      const p = { kind, d, w: b - a, fixed: !(b > a) };
      if (!p.fixed && kind !== 'tri') { const { alpha, beta } = T.params(kind, d); p.alpha = alpha; p.beta = beta; }
      if (copula && !p.fixed) p.grid = T.invTable(kind, d, GRID);
      return p;
    }
    throw new Error(`sim: distribución desconocida ${kind}`);
  }
  function draw(p, s) {
    switch (p.kind) {
      case 'fixed': return p.d;
      case 'normal': {
        if (p.sd === 0) return Math.max(0, p.mu);
        for (let k = 0; k < 1000; k++) { const x = p.mu + p.sd * s.normal(); if (x >= 0) return x; }
        return 0;
      }
      case 'tri': return p.fixed ? p.d.a : T.quantile('tri', p.d, s.u());
      case 'unif': return p.fixed ? p.a : p.a + p.w * s.u();
      case 'logn': return p.fixed ? p.d : Math.exp(p.m + p.s * s.normal());
      case 'disc': return p.fixed ? p.x[0] : discAt(p, s.u());
      default: {
        if (p.fixed) return p.d.a;
        const x = s.gamma(p.alpha);
        return p.d.a + (p.w * x) / (x + s.gamma(p.beta));
      }
    }
  }
  function discAt(p, u) {             // el primer valor cuya probabilidad acumulada supera u
    for (let j = 0; j < p.c.length - 1; j++) if (u < p.c[j]) return p.x[j];
    return p.x[p.x.length - 1];
  }
  function fromUniform(p, u) {        // la inversa de cada distribución, para la cópula
    switch (p.kind) {
      case 'fixed': return p.d;
      case 'unif': return p.fixed ? p.a : p.a + p.w * u;
      case 'logn': return p.fixed ? p.d : Math.exp(p.m + p.s * T.phiInv(Math.min(1 - 1e-12, Math.max(1e-12, u))));
      case 'disc': return p.fixed ? p.x[0] : discAt(p, u);
      case 'normal': return p.sd === 0 ? Math.max(0, p.mu) : Math.max(0, p.mu + p.sd * T.phiInv(p.lo + u * (1 - p.lo)));
      default: {
        if (p.fixed) return p.d.a;
        const x = u * GRID; const j = Math.min(GRID - 1, Math.floor(x)); const f = x - j;
        return p.grid[j] + f * (p.grid[j + 1] - p.grid[j]);
      }
    }
  }

  // ---------- trabajos ----------
  function start(opts) {
    const o = opts || {};
    const n = o.n == null ? DEFAULT_N : o.n;
    if (!Number.isInteger(n) || n < 1) throw new Error('sim: n no válido');
    const job = { kind: o.kind, n, i: 0, s: sampler(o.us >>> 0), out: new Float64Array(n), keep: !!o.keepActs || (o.kind === 'project' && !!o.track),
      track: o.kind === 'project' && !!o.track };
    if (o.kind === 'project') {
      const acts = (o.model && o.model.acts) || [];
      job.acts = acts.map((a, i) => {
        const preds = a.preds || [];
        if (!preds.every((p) => Number.isInteger(p) && p >= 0 && p < i)) throw new Error(`sim: ${a.id} no está en orden topológico`);
        return { preds, p: prepare(a.dist, false) };
      });
      job.ef = new Float64Array(acts.length);
      if (job.keep) job.store = acts.map(() => new Float64Array(n));
      if (job.track) {
        job.succ = acts.map(() => []);
        job.acts.forEach((a, i) => a.preds.forEach((q) => job.succ[q].push(i)));
        job.dur = new Float64Array(acts.length); job.lf = new Float64Array(acts.length);
        job.tf = acts.map(() => new Float64Array(n));
      }
    } else if (o.kind === 'paths') {
      const paths = (o.model && o.model.paths) || [];
      job.paths = paths.map((pa) => {
        const rho = pa.rho || 0;
        if (!(isNum(rho) && rho >= 0 && rho <= 1)) throw new Error('sim: ρ fuera de [0, 1]');
        return { rho, sr: Math.sqrt(rho), sq: Math.sqrt(1 - rho), acts: pa.acts.map((d) => prepare(d, rho > 0)) };
      });
      if (job.keep) job.store = [].concat(...job.paths.map((pa) => pa.acts.map(() => new Float64Array(n))));
    } else {
      throw new Error(`sim: tipo desconocido ${o.kind}`);
    }
    return job;
  }

  function replica(job) {
    const { s } = job; const r = job.i;
    if (job.kind === 'project') {
      let end = 0;
      for (let i = 0; i < job.acts.length; i++) {
        const a = job.acts[i]; let es = 0;
        for (const p of a.preds) if (job.ef[p] > es) es = job.ef[p];
        const d = draw(a.p, s);
        if (job.keep) job.store[i][r] = d;
        if (job.track) job.dur[i] = d;
        job.ef[i] = es + d;
        if (job.ef[i] > end) end = job.ef[i];
      }
      if (job.track) {                 // pasada hacia atrás de esta réplica: holgura total de cada actividad
        for (let i = job.acts.length - 1; i >= 0; i--) {
          let lf = end;
          for (const q of job.succ[i]) { const ls = job.lf[q] - job.dur[q]; if (ls < lf) lf = ls; }
          job.lf[i] = lf;
          job.tf[i][r] = lf - job.ef[i];
        }
      }
      return end;
    }
    let end = 0; let k = 0;
    for (const pa of job.paths) {
      let tot = 0;
      const w = pa.rho > 0 ? s.normal() : 0;
      for (const p of pa.acts) {
        const d = pa.rho > 0 ? fromUniform(p, T.phi(pa.sr * w + pa.sq * s.normal())) : draw(p, s);
        if (job.keep) job.store[k][r] = d;
        k++; tot += d;
      }
      if (tot > end) end = tot;
    }
    return end;
  }

  function step(job, limit) {
    const lim = limit || {};
    const until = lim.ms != null ? now() + lim.ms : Infinity;
    const stop = Math.min(job.n, job.i + (lim.reps != null ? Math.max(1, lim.reps) : job.n));
    let k = 0;
    while (job.i < stop) {
      job.out[job.i] = replica(job); job.i++; k++;
      if ((k & 63) === 0 && now() >= until) break;
    }
    return { done: job.i >= job.n, k };
  }

  function result(job) {
    if (job.i < job.n) throw new Error('sim: la simulación no ha terminado');
    const r = { durations: job.out };
    if (job.keep) r.acts = job.store;
    if (job.track) r.tf = job.tf;
    return r;
  }

  const run = (opts) => { const job = start(opts); step(job, {}); return result(job); };

  // ---------- resumen ----------
  function summary(durations) {
    const x = Float64Array.from(durations).sort();
    const n = x.length;
    let m = 0;
    for (let i = 0; i < n; i++) m += x[i];
    m /= n;
    let v = 0;
    for (let i = 0; i < n; i++) v += (x[i] - m) ** 2;
    const sd = n > 1 ? Math.sqrt(v / (n - 1)) : 0;
    function pLE(t) {                  // proporción de réplicas ≤ t (búsqueda binaria)
      let lo = 0; let hi = n;
      while (lo < hi) { const mid = (lo + hi) >> 1; if (x[mid] <= t) lo = mid + 1; else hi = mid; }
      return lo / n;
    }
    function hist(bins) {
      let lo = x[0]; let hi = x[n - 1];
      if (!(hi > lo)) { lo -= 0.5; hi += 0.5; }
      const width = (hi - lo) / bins; const counts = new Array(bins).fill(0);
      for (let i = 0; i < n; i++) counts[Math.min(bins - 1, Math.floor((x[i] - lo) / width))]++;
      return { lo, width, counts };
    }
    function ks(mu, s) {               // máx |F_n − Φ((x − μ)/σ)|
      let d = 0;
      for (let i = 0; i < n; i++) {
        const f = T.phi((x[i] - mu) / s);
        d = Math.max(d, (i + 1) / n - f, f - i / n);
      }
      return d;
    }
    return { n, mean: m, sd, min: x[0], max: x[n - 1], pLE, hist, ks };
  }

  const api = { DEFAULT_N, GRID, start, step, result, run, summary };
  root.PNL = root.PNL || {};
  root.PNL.sim = api;
  if (isNode) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
