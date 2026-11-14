/*
 * core/mc — Montecarlo e índices de M7 (spec f4b-montecarlo-indices; plan §0, §3 y P1–P3, P6).
 * - distFor(kind, { a, m, b }, q?) → la distribución de core/sim que sale de a, m y b (las seis y la clásica):
 *   pert/classic/tri con a, m, b; unif en [a, b]; norm = normal de la media y la desviación de PERT, truncada en 0
 *   ('normal' de sim); logn con esa media y desviación; disc con sus valores q o, si no hay, {a, m, b} con 1/6, 4/6,
 *   1/6 (fundiendo los iguales). moments(dist) → { mean, var } cerrados (la normal, los de la truncada).
 * - checkDisc(q) → errores de una discreta escrita: empty, nan, negative, repeated, prob, sum.
 * - indices(res, model, { corr }) sobre una simulación con track: criticidad (holgura total ≤ 1e-9·máx(1, T), empates
 *   contados), crucialidad (Pearson o Spearman; 0 si algo no varía) y significación SI = media de r·T/T̄, con
 *   r = 1 si HT = 0 y d/(d + HT) si no (Williams 1992, según Acebes et al. 2021, ec. 6). Caminos: los 50 de mayor
 *   duración media (búsqueda por cota), con su criticidad; count = todos los caminos, more = los que no se listan.
 * - exact(model, { limit }) → la cuenta exacta enumerando combinaciones (solo discretas o fijas; tope 100 000).
 * - percentile(sorted, p): el menor valor con F ≥ p; deadlineFor = percentile. convergence(res, model, opts) en 20
 *   puntos logarítmicos. toJSON(model, opts): formato de intercambio con python/pnl_montecarlo.py.
 *   replicaTrace(res, model, k): lo que el reproductor enseña de la réplica k.
 * model = { acts: [{ id, preds: [índices anteriores], dist }] } en orden topológico, como en core/sim.
 */
(function (root) {
  'use strict';

  const isNode = typeof module !== 'undefined' && module.exports;
  const T = isNode ? require('./threept.js') : root.PNL.threept;

  const KINDS = ['pert', 'classic', 'tri', 'unif', 'norm', 'logn', 'disc'];
  const LETTER = { p: 'pert', c: 'classic', t: 'tri', u: 'unif', n: 'norm', l: 'logn', d: 'disc' };
  const PATH_LIMIT = 50;
  const EXACT_LIMIT = 100000;
  const tolOf = (t) => 1e-9 * Math.max(1, Math.abs(t));
  const isNum = (x) => typeof x === 'number' && Number.isFinite(x);

  // ---------- distribuciones ----------
  function defaultDisc(d) {
    const x = []; const w = [];        // pesos enteros 1, 4, 1 y después /6: 5/6 sale exacto al fundir
    for (const [v, k] of [[d.a, 1], [d.m, 4], [d.b, 1]]) {
      const j = x.indexOf(v);
      if (j >= 0) w[j] += k; else { x.push(v); w.push(k); }
    }
    return { kind: 'disc', x, p: w.map((k) => k / 6) };
  }
  function distFor(kind, d, q) {
    const { a, m, b } = d;
    const e = T.exam(d);
    switch (kind) {
      case 'pert': case 'classic': case 'tri': return { kind, a, m, b };
      case 'unif': return { kind: 'unif', a, b };
      case 'norm': return { kind: 'normal', mu: e.mean, var: e.var };
      case 'logn': return { kind: 'logn', mu: e.mean, sd: Math.sqrt(e.var) };
      case 'disc': return q ? { kind: 'disc', x: q.x.slice(), p: q.p.slice() } : defaultDisc(d);
      default: throw new Error(`mc: distribución desconocida ${kind}`);
    }
  }
  function moments(dist) {
    switch (dist.kind) {
      case 'fixed': return { mean: dist.d, var: 0 };
      case 'unif': return { mean: (dist.a + dist.b) / 2, var: (dist.b - dist.a) ** 2 / 12 };
      case 'logn': return { mean: dist.mu, var: dist.mu > 0 ? dist.sd ** 2 : 0 };
      case 'normal': {
        const s = Math.sqrt(dist.var);
        if (!(s > 0)) return { mean: Math.max(0, dist.mu), var: 0 };
        const al = -dist.mu / s; const z = 1 - T.phi(al);
        const lam = Math.exp(-al * al / 2) / Math.sqrt(2 * Math.PI) / z;
        return { mean: dist.mu + s * lam, var: s * s * (1 + al * lam - lam * lam) };
      }
      case 'disc': {
        let mu = 0; let m2 = 0;
        dist.x.forEach((v, j) => { mu += v * dist.p[j]; m2 += v * v * dist.p[j]; });
        return { mean: mu, var: Math.max(0, m2 - mu * mu) };
      }
      default: return T.moments(dist.kind, dist);
    }
  }
  function checkDisc(q) {
    const x = (q && q.x) || []; const p = (q && q.p) || [];
    if (!x.length || x.length !== p.length) return ['empty'];
    if (!x.concat(p).every(isNum)) return ['nan'];
    if (x.some((v) => v < 0)) return ['negative'];
    if (new Set(x).size !== x.length) return ['repeated'];
    if (p.some((v) => v <= 0)) return ['prob'];
    if (Math.abs(p.reduce((s, v) => s + v, 0) - 1) > 1e-9) return ['sum'];
    return [];
  }

  // ---------- correlaciones ----------
  function pearson(x, y) {
    const n = x.length; let mx = 0; let my = 0;
    for (let i = 0; i < n; i++) { mx += x[i]; my += y[i]; }
    mx /= n; my /= n;
    let sxy = 0; let sx = 0; let sy = 0;
    for (let i = 0; i < n; i++) { const dx = x[i] - mx; const dy = y[i] - my; sxy += dx * dy; sx += dx * dx; sy += dy * dy; }
    if (!(sx > 0 && sy > 0)) return 0;
    const r = sxy / Math.sqrt(sx * sy);
    return Math.max(-1, Math.min(1, r));
  }
  function ranks(x) {                 // rangos medios, de 1 a n
    const n = x.length;
    const idx = Array.from({ length: n }, (_, i) => i).sort((a, b) => x[a] - x[b] || a - b);
    const r = new Float64Array(n);
    for (let i = 0; i < n;) {
      let j = i;
      while (j + 1 < n && x[idx[j + 1]] === x[idx[i]]) j++;
      const v = (i + j) / 2 + 1;
      for (let k = i; k <= j; k++) r[idx[k]] = v;
      i = j + 1;
    }
    return r;
  }
  const spearman = (x, y) => pearson(ranks(x), ranks(y));

  // ---------- caminos ----------
  function succsOf(model) {
    const s = model.acts.map(() => []);
    model.acts.forEach((a, i) => a.preds.forEach((q) => s[q].push(i)));
    return s;
  }
  function countPaths(model, succ) {  // número de caminos de inicio a fin (puede ser grande)
    const k = model.acts.length; const c = new Array(k).fill(0);
    for (let i = k - 1; i >= 0; i--) c[i] = succ[i].length ? succ[i].reduce((s, j) => s + c[j], 0) : 1;
    return model.acts.reduce((s, a, i) => s + (a.preds.length ? 0 : c[i]), 0);
  }
  // Los `limit` caminos más largos con las duraciones w, en orden no creciente (búsqueda por cota: largo hecho + lo
  // más largo que queda hasta el fin). Con empates, por orden de los índices.
  function topPaths(model, succ, w, limit) {
    const k = model.acts.length; const rest = new Array(k).fill(0);
    for (let i = k - 1; i >= 0; i--) rest[i] = w[i] + (succ[i].length ? Math.max(...succ[i].map((j) => rest[j])) : 0);
    const heap = [];
    const push = (e) => { heap.push(e); heap.sort((x, y) => y.key - x.key || cmpArr(x.path, y.path)); };
    model.acts.forEach((a, i) => { if (!a.preds.length) push({ key: rest[i], done: w[i], path: [i] }); });
    const out = [];
    while (heap.length && out.length < limit) {
      const e = heap.shift(); const last = e.path[e.path.length - 1];
      if (!succ[last].length) { out.push({ path: e.path, mean: e.done }); continue; }
      for (const j of succ[last]) push({ key: e.done + rest[j], done: e.done + w[j], path: e.path.concat(j) });
    }
    return out;
  }
  function cmpArr(a, b) {
    for (let i = 0; i < Math.min(a.length, b.length); i++) if (a[i] !== b[i]) return a[i] - b[i];
    return a.length - b.length;
  }

  // ---------- índices de una simulación con track ----------
  function indices(res, model, opts) {
    const corr = (opts && opts.corr) || 'pearson';
    const D = res.acts; const TF = res.tf; const Td = res.durations; const n = Td.length; const k = model.acts.length;
    let tbar = 0;
    for (let r = 0; r < n; r++) tbar += Td[r];
    tbar /= n;
    const crit = []; const sig = []; const cruc = [];
    const RT = corr === 'spearman' ? ranks(Td) : null;
    for (let i = 0; i < k; i++) {
      let c = 0; let s = 0; const d = D[i]; const tf = TF[i];
      for (let r = 0; r < n; r++) {
        const isCrit = tf[r] <= tolOf(Td[r]);
        if (isCrit) c++;
        s += (isCrit ? 1 : d[r] / (d[r] + tf[r])) * Td[r];
      }
      crit.push(c / n);
      sig.push(tbar > 0 ? s / n / tbar : 0);
      cruc.push(corr === 'spearman' ? pearson(ranks(d), RT) : pearson(d, Td));
    }
    const succ = succsOf(model);
    const w = model.acts.map((a) => moments(a.dist).mean);
    const list = topPaths(model, succ, w, PATH_LIMIT).map(({ path, mean }) => {
      let c = 0;
      for (let r = 0; r < n; r++) {
        let len = 0;
        for (const i of path) len += D[i][r];
        if (len >= Td[r] - tolOf(Td[r])) c++;
      }
      return { ids: path.map((i) => model.acts[i].id), idx: path, mean, crit: c / n };
    });
    const count = countPaths(model, succ);
    return { crit, cruc, sig, paths: { list, count, more: Math.max(0, count - list.length) } };
  }

  // ---------- cuenta exacta ----------
  function supportOf(dist) {          // [[valor, probabilidad]] o null si no es discreta ni fija
    if (dist.kind === 'disc') return dist.x.map((v, j) => [v, dist.p[j]]);
    if (dist.kind === 'fixed') return [[dist.d, 1]];
    if (T.KINDS.includes(dist.kind) && dist.a === dist.b) return [[dist.a, 1]];
    if (dist.kind === 'unif' && dist.a === dist.b) return [[dist.a, 1]];
    if (dist.kind === 'logn' && !(dist.mu > 0 && dist.sd > 0)) return [[dist.mu, 1]];
    if (dist.kind === 'normal' && !(dist.var > 0)) return [[Math.max(0, dist.mu), 1]];
    return null;
  }
  function exact(model, opts) {
    const limit = (opts && opts.limit) || EXACT_LIMIT;
    const sup = model.acts.map((a) => supportOf(a.dist));
    if (sup.some((s) => !s)) return { notDiscrete: true };
    const combos = sup.reduce((c, s) => c * s.length, 1);
    if (combos > limit) return { tooMany: true, combos };
    const k = model.acts.length; const succ = succsOf(model);
    const w = model.acts.map((a) => moments(a.dist).mean);
    const top = topPaths(model, succ, w, PATH_LIMIT);
    const idx = new Array(k).fill(0); const d = new Float64Array(k); const ef = new Float64Array(k); const lf = new Float64Array(k);
    let mean = 0; let t2 = 0; const dist = new Map();
    const crit = new Array(k).fill(0); const sd = new Array(k).fill(0); const sd2 = new Array(k).fill(0); const sdt = new Array(k).fill(0);
    const srt = new Array(k).fill(0); const pc = new Array(top.length).fill(0);
    for (let c = 0; c < combos; c++) {
      let p = 1;
      for (let i = 0; i < k; i++) { d[i] = sup[i][idx[i]][0]; p *= sup[i][idx[i]][1]; }
      let end = 0;
      for (let i = 0; i < k; i++) {
        let es = 0;
        for (const q of model.acts[i].preds) if (ef[q] > es) es = ef[q];
        ef[i] = es + d[i]; if (ef[i] > end) end = ef[i];
      }
      for (let i = k - 1; i >= 0; i--) {
        let l = end;
        for (const q of succ[i]) { const ls = lf[q] - d[q]; if (ls < l) l = ls; }
        lf[i] = l;
      }
      mean += p * end; t2 += p * end * end;
      const key = Math.round(end * 1e9) / 1e9;
      dist.set(key, (dist.get(key) || 0) + p);
      for (let i = 0; i < k; i++) {
        const tf = lf[i] - ef[i]; const isCrit = tf <= tolOf(end);
        if (isCrit) crit[i] += p;
        sd[i] += p * d[i]; sd2[i] += p * d[i] * d[i]; sdt[i] += p * d[i] * end;
        srt[i] += p * (isCrit ? 1 : d[i] / (d[i] + tf)) * end;
      }
      top.forEach((tp, j) => { let len = 0; for (const i of tp.path) len += d[i]; if (len >= end - tolOf(end)) pc[j] += p; });
      for (let i = k - 1; i >= 0; i--) { idx[i]++; if (idx[i] < sup[i].length) break; idx[i] = 0; }
    }
    const vt = t2 - mean * mean;
    const cruc = sd.map((m, i) => {
      const vx = sd2[i] - m * m; const cov = sdt[i] - m * mean;
      return vx > 1e-15 * Math.max(1, sd2[i]) && vt > 1e-15 * Math.max(1, t2) ? Math.max(-1, Math.min(1, cov / Math.sqrt(vx * vt))) : 0;
    });
    const table = [...dist.entries()].sort((x, y) => x[0] - y[0]).map(([t, p]) => ({ t, p }));
    const pLE = (t) => table.reduce((s, e) => s + (e.t <= t + tolOf(t) ? e.p : 0), 0);
    const count = countPaths(model, succ);
    return { combos, mean, var: vt, dist: table, pLE, crit, cruc, sig: srt.map((s) => (mean > 0 ? s / mean : 0)),
      paths: { list: top.map((tp, j) => ({ ids: tp.path.map((i) => model.acts[i].id), idx: tp.path, mean: tp.mean, crit: pc[j] })),
        count, more: Math.max(0, count - top.length) } };
  }

  // ---------- percentiles y convergencia ----------
  function percentile(sorted, p) {
    const n = sorted.length;
    const i = Math.min(n - 1, Math.max(0, Math.ceil(p * n - 1e-9) - 1));
    return sorted[i];
  }
  const deadlineFor = (sorted, prob) => percentile(sorted, prob);

  function checkpoints(n, count) {
    if (n <= 10) return [n];
    const out = [];
    for (let j = 0; j < count; j++) {
      const v = Math.round(Math.exp(Math.log(10) + (Math.log(n) - Math.log(10)) * j / (count - 1)));
      if (!out.length || v > out[out.length - 1]) out.push(v);
    }
    out[out.length - 1] = n;
    return out;
  }
  function convergence(res, model, opts) {
    const o = opts || {};
    const Td = res.durations; const n = Td.length; const k = model.acts.length;
    const at = o.at || checkpoints(n, 20);
    const out = []; let s = 0; let s2 = 0; let le = 0; let r = 0;
    const cc = new Array(k).fill(0);
    for (const m of at) {
      for (; r < m; r++) {
        const t = Td[r]; s += t; s2 += t * t;
        if (o.deadline != null && t <= o.deadline) le++;
        if (res.tf) for (let i = 0; i < k; i++) if (res.tf[i][r] <= tolOf(t)) cc[i]++;
      }
      const mean = s / m; const v = m > 1 ? Math.max(0, (s2 - m * mean * mean) / (m - 1)) : 0;
      const pT = le / m;
      const row = { n: m, mean, se: Math.sqrt(v / m), pT, seP: Math.sqrt(pT * (1 - pT) / m), crit: cc.map((c) => c / m) };
      if (o.p != null) row.q = percentile(Float64Array.from(Td.subarray ? Td.subarray(0, m) : Td.slice(0, m)).sort(), o.p);
      out.push(row);
    }
    return out;
  }

  // ---------- JSON y réplica ----------
  function toJSON(model, opts) {
    const o = opts || {};
    return {
      format: 'pnl-montecarlo', version: 1,
      unit: o.unit || '', reps: o.reps, seed: o.us, deadline: o.deadline == null ? null : o.deadline,
      percentile: o.p == null ? null : o.p, corr: o.corr || 'pearson',
      activities: model.acts.map((a) => Object.assign({ id: a.id },
        o.names && o.names[a.id] ? { name: o.names[a.id] } : {},
        { preds: a.preds.map((q) => model.acts[q].id), dist: JSON.parse(JSON.stringify(a.dist)) })),
    };
  }
  function replicaTrace(res, model, k) {
    const d = res.acts.map((x) => x[k]); const Tk = res.durations[k];
    const es = []; const ef = [];
    model.acts.forEach((a, i) => {
      let v = 0;
      for (const q of a.preds) if (ef[q] > v) v = ef[q];
      es.push(v); ef.push(v + d[i]);
    });
    const crit = model.acts.map((_, i) => i).filter((i) => res.tf[i][k] <= tolOf(Tk));
    return { k, d, es, ef, T: Tk, crit };
  }

  const api = { KINDS, LETTER, PATH_LIMIT, EXACT_LIMIT, distFor, moments, checkDisc, pearson, spearman, ranks, indices, exact,
    percentile, deadlineFor, convergence, toJSON, replicaTrace };
  root.PNL = root.PNL || {};
  root.PNL.mc = api;
  if (isNode) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
