/*
 * core/probgen — ejercicios de probabilidad (TCL) y de Montecarlo con semilla (spec f3e-probabilidad-montecarlo, AC1, AC5,
 * AC7, AC11 y AC24; plan §0, §3 y P3; análisis H2, H3, H8 y H9).
 *
 * Cuatro tipos, todos sobre las tablas del generador de la F3a (core/generator, sin cambios):
 *   tcl  — a, m y b por actividad (m = la duración de la tabla; a y b de una secuencia propia, con fijas según el nivel),
 *          plazo entero ⌈μ + zσ⌉ con z en [−0,5, 2,0), probabilidad pedida de PROBS y, si se pide, «la otra ruta»: el
 *          camino de más media sin actividades en común con el crítico, a ROUTE_K σ como mucho, con P(ruta) ≤ ROUTE_PMAX.
 *   read — «Leer una simulación»: la tabla del ejercicio TCL de la misma semilla, beta-PERT en todas y 10 000 réplicas con
 *          la semilla us = simSeed(s), en el rango de la clave us de M7 (H2), llamadas como las llama M7 (core/sim con
 *          track y core/mc.indices con Pearson); un percentil, P(T ≤ plazo), un índice de criticidad y las preguntas de
 *          interpretación que tienen una respuesta clara (MARGIN; H3).
 *   disc — «Discretas a mano»: unas actividades con dos o tres valores enteros alrededor de m y probabilidades de P2 o P3
 *          (4, 8–9 o de 12 a 36 combinaciones, DISC); el resto, fijas con la duración de la tabla.
 *   rep  — «Réplicas a mano»: REPS réplicas de la beta-PERT de la tabla TCL de la misma semilla, redondeadas a enteros
 *          (el sorteo es el de M7 con esa semilla; H8).
 * Semilla siguiente (H9): si la tabla de la semilla s no vale (empate de igual varianza en el camino de las medias,
 * camino crítico sin incertidumbre, sin la otra ruta, menos de tres preguntas claras, discretas triviales…), se prueba la
 * de seedAt(sd, 1), seedAt(sd, 2)… hasta TRIES_TCL; la usada queda en ex.sdUsed (y la pedida en ex.sd).
 * Búsqueda a trozos (puerta T001: la otra ruta tarda hasta unos segundos): start(kind, sd, params, opts) →
 * step(job, { tries, ms }) → { done } → result(job); tcl, read, disc y rep lo hacen de una vez. candidate(kind, s, …)
 * prueba una sola semilla. solve(kind, ex) da la solución; fromExample los ejemplos citados de core/stochex; toUt la tabla
 * propia de M5–M7 para «Ver la solución».
 * Secuencias propias mulberry32((s · 7 + SALT[…]) >>> 0): no tocan la del generador. Sin DOM ni azar del navegador.
 * core/sim y core/mc (grupo mx) solo hacen falta para read y rep; core/stochex, para fromExample.
 */
(function (root) {
  'use strict';

  const isNode = typeof module !== 'undefined' && module.exports;
  const req = (f, k) => (isNode ? require(f) : root.PNL[k]);
  const R = req('./rng.js', 'rng');
  const G = req('./generator.js', 'generator');
  const T = req('./threept.js', 'threept');
  const L = req('./tcl.js', 'tcl');
  const SIM = () => req('./sim.js', 'sim');
  const MC = () => req('./mc.js', 'mc');
  const X = () => req('./stochex.js', 'stochex');

  const VERSION = 1;
  const SEED_MAX = 999999;
  const TRIES_TCL = 400;
  const SALT = { amb: 101, plan: 103, sim: 107, ask: 109, disc: 113, rep: 127, repDeadline: 131 };
  const PFIX = { easy: 0.30, medium: 0.20, hard: 0.15 };
  const PROBS = [0.80, 0.85, 0.90, 0.95, 0.99];
  const Z_RANGE = [-0.5, 2.0];
  const Z_TRIES = 20;                 // sorteos de z para que la otra ruta no quede casi segura
  const ROUTE_K = 2;
  const ROUTE_PMAX = 0.97;
  const Z95 = [1.64, 1.645, 1.65];    // las tres que dan las tablas impresas para el 95 % (AC25)
  const PCTS = [0.5, 0.8, 0.9];
  const SIM_OPTS = { ur: 4, n: 10000, bins: 40 };
  const MARGIN = 0.05;
  const REPS = { easy: 5, medium: 8, hard: 10 };
  const DISC = {
    easy: [[2, 2]],
    medium: [[2, 2, 2], [3, 3]],
    hard: [[3, 2, 2], [3, 3, 2], [3, 3, 3], [2, 2, 2, 2], [3, 2, 2, 2], [3, 3, 2, 2]],
  };
  const P2 = [[1 / 2, 1 / 2], [1 / 3, 2 / 3], [2 / 3, 1 / 3], [1 / 4, 3 / 4], [3 / 4, 1 / 4], [1 / 5, 4 / 5], [4 / 5, 1 / 5]];
  const P3 = [[1 / 3, 1 / 3, 1 / 3], [1 / 4, 1 / 2, 1 / 4], [1 / 5, 3 / 5, 1 / 5], [1 / 4, 1 / 4, 1 / 2], [1 / 2, 1 / 4, 1 / 4],
    [1 / 5, 1 / 5, 3 / 5], [3 / 5, 1 / 5, 1 / 5]];
  const KINDS = ['tcl', 'read', 'disc', 'rep'];
  const QUESTIONS = ['mostCrit', 'mostCruc', 'critLowCruc', 'normal', 'promise'];
  const EPS = 1e-9;
  const now = () => (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now());
  const natural = (x, y) => x.localeCompare(y, 'en', { numeric: true });
  const byIds = (x, y) => {
    for (let i = 0; i < Math.min(x.length, y.length); i++) { const c = natural(x[i], y[i]); if (c) return c; }
    return x.length - y.length;
  };
  const splitIds = (s) => String(s || '').split(/[,\s]+/).filter(Boolean);
  const seedOk = (s) => Number.isInteger(s) && s >= 1 && s <= SEED_MAX;
  const seedAt = (sd, t) => ((sd - 1 + t) % SEED_MAX) + 1;
  const derived = (s, salt) => 1 + (((s * 7 + salt) >>> 0) % SEED_MAX);
  const simSeed = (s) => derived(s, SALT.sim);
  const seq = (s, salt) => R.mulberry32((s * 7 + salt) >>> 0);

  // ---------- parámetros y tablas ----------

  /** { level, prm } de un nivel ('easy'…) o de unos parámetros de «Personalizar» (level 'custom'); null si no vale. */
  function levelOf(params) {
    if (typeof params === 'string') return G.LEVELS[params] ? { level: params, prm: G.LEVELS[params] } : null;
    if (params && typeof params === 'object') return { level: 'custom', prm: params };
    return null;
  }
  const base = (level) => (level === 'custom' ? 'medium' : level);   // fijas, discretas y réplicas de «Personalizar»

  // Las tablas del generador por semilla y parámetros (las búsquedas de semillas consecutivas las comparten).
  const memo = new Map();
  const MEMO_MAX = 256;
  function generated(s, prm) {
    const key = `${G.VERSION}|${s}|${JSON.stringify(prm)}`;
    if (!memo.has(key)) {
      if (memo.size >= MEMO_MAX) memo.delete(memo.keys().next().value);
      memo.set(key, G.generate(s, prm));
    }
    return memo.get(key);
  }

  /** a, m y b de cada fila del generador (plan §0). */
  function amb(s, genRows, level) {
    const r = seq(s, SALT.amb); const pfix = PFIX[base(level)];
    return genRows.map((row) => {
      const m = Number(row.duration);
      const out = { id: row.id, a: m, m, b: m, preds: splitIds(row.links) };
      if (r() < pfix) return out;
      out.a = m - R.int(r, 0, Math.min(m - 1, Math.ceil(m / 2)));
      out.b = m + R.int(r, 1, m);
      return out;
    });
  }

  const distOf = (r) => (r.mu != null ? { kind: 'normal', mu: r.mu, var: r.var } : { kind: 'pert', a: r.a, m: r.m, b: r.b });
  const tclModel = (rows) => ({ acts: rows.map((r) => ({ id: r.id, preds: r.preds.slice(), dist: distOf(r) })) });
  /** El modelo de simulación de M7 para una tabla de a, m y b: beta-PERT en todas (mc.distFor) en orden topológico. */
  const simModel = (rows) => L.simModel({ acts: rows.map((r) => ({ id: r.id, preds: r.preds.slice(), dist: MC().distFor('pert', r) })) });

  /** La otra ruta: sin actividades en común con el crítico; la de más media (empate: más σ²; después, ids). */
  function routeOf(model, path) {
    const crit = new Set(path);
    const P = L.paths(model, 0);
    if (!P.list) return { none: 'paths' };
    const dis = P.list.filter((p) => p.acts.every((id) => !crit.has(id)))
      .sort((x, y) => (Math.abs(y.mu - x.mu) > EPS ? y.mu - x.mu : Math.abs(y.var - x.var) > EPS ? y.var - x.var : byIds(x.acts, y.acts)));
    return dis.length ? { route: dis[0] } : { none: 'route' };
  }

  // ---------- un candidato por tipo (una sola semilla) ----------

  function tclAt(s, lv, opts) {
    const g = generated(s, lv.prm);
    if (!g.ok) return { ok: false, reason: 'gen' };
    const rows = amb(s, g.rows, lv.level);
    const model = tclModel(rows);
    const e = L.exam(model, { prob: 0.5 });
    if (!(e.var > EPS)) return { ok: false, reason: 'flat' };
    if (e.ties.some((t) => Math.abs(t.var - e.var) < EPS)) return { ok: false, reason: 'tie' };
    let route = null;
    if (opts && opts.route) {
      const o = routeOf(model, e.path);
      if (o.none) return { ok: false, reason: o.none };
      route = o.route;
      if (!(route.var > EPS) || (e.mu - route.mu) / Math.sqrt(route.var) > ROUTE_K + EPS) return { ok: false, reason: 'route' };
    }
    const r = seq(s, SALT.plan);
    const prob = PROBS[R.int(r, 0, PROBS.length - 1)];
    let deadline = null;
    for (let k = 0; k < Z_TRIES && deadline == null; k++) {
      const z = Z_RANGE[0] + (Z_RANGE[1] - Z_RANGE[0]) * r();
      const d = Math.ceil(e.mu + z * e.sd);
      if (d < 1) continue;
      if (route && T.tableP((d - route.mu) / Math.sqrt(route.var)).p4 > ROUTE_PMAX) continue;
      deadline = d;
    }
    if (deadline == null) return { ok: false, reason: 'deadline' };
    return { ok: true, ex: { kind: 'tcl', level: lv.level, sd: s, sdUsed: s, rows, deadline, prob, route: route ? route.acts.slice() : null } };
  }

  /** Las preguntas de interpretación con respuesta clara (H3), en el orden de QUESTIONS. */
  function questions(ids, crit, cruc, sim) {
    const out = [];
    const ranked = (score) => ids.slice().sort((x, y) => score(y) - score(x) || natural(x, y));
    const actQ = (key, score, extra) => {
      const k = ranked(score);
      const margin = score(k[0]) - score(k[1]);
      if (margin >= MARGIN - EPS && (!extra || extra(k[0]))) out.push({ key, options: k.slice(0, 4).sort(natural), correct: k[0], margin });
    };
    actQ('mostCrit', (id) => crit[id]);
    actQ('mostCruc', (id) => cruc[id]);
    actQ('critLowCruc', (id) => crit[id] - cruc[id], (id) => crit[id] >= 0.5);
    const gap = Math.abs(sim.normal.pT - sim.pT);
    if (gap >= MARGIN - EPS) {
      out.push({ key: 'normal', options: ['optimistic', 'pessimistic', 'exact'], correct: sim.normal.pT > sim.pT ? 'optimistic' : 'pessimistic', margin: gap });
    }
    // Qué plazo prometer con un 90 %: el percentil 90 frente a la media, el de la normal del TCL y otros percentiles;
    // solo las opciones que no se confunden con él (a más de una clase y con F lejos de 0,9).
    const q90 = sim.q90; const w = sim.classW; const kept = [];
    for (const x of [sim.mean, sim.normal.q90, sim.p75, sim.p99]) {
      if (Math.abs(sim.pLE(x) - 0.9) < MARGIN - EPS || Math.abs(x - q90) <= w) continue;
      if (kept.some((y) => Math.abs(y - x) <= w)) continue;
      if (kept.length < 3) kept.push(x);
    }
    if (kept.length >= 2) {
      out.push({ key: 'promise', options: [q90].concat(kept).sort((a, b) => a - b), correct: q90,
        margin: Math.min(...kept.map((x) => Math.abs(sim.pLE(x) - 0.9))) });
    }
    return out;
  }

  /** La simulación de «Leer» como en M7 y todo lo que se lee de ella. */
  function readSol(tclEx, us, ask) {
    const S = SIM(); const M = MC();
    const sm = simModel(tclEx.rows);
    const res = S.run({ kind: 'project', model: sm, n: SIM_OPTS.n, us, track: true });
    const su = S.summary(res.durations);
    const sorted = Float64Array.from(res.durations).sort();
    const idx = M.indices(res, sm, { corr: 'pearson' });
    const simIds = sm.acts.map((a) => a.id);
    const by = (v) => Object.fromEntries(simIds.map((id, i) => [id, v[i]]));
    const crit = by(idx.crit); const cruc = by(idx.cruc);
    const examModel = tclModel(tclEx.rows);
    const ne = L.exam(examModel, { deadline: ask.deadline });
    const hist = su.hist(SIM_OPTS.bins);
    const sol = { n: SIM_OPTS.n, us, hist, classW: hist.width, mean: su.mean, sd: su.sd,
      pct: { p: ask.pct, value: M.percentile(sorted, ask.pct) }, pT: su.pLE(ask.deadline), act: ask.act ? { id: ask.act, crit: crit[ask.act] } : null,
      crit, cruc, normal: { mu: ne.mu, var: ne.var, pT: ne.exact, q90: L.exam(examModel, { prob: 0.9 }).deadline }, questions: null, sorted };
    const ids = tclEx.rows.map((r) => r.id);
    sol.questions = questions(ids, crit, cruc, { pT: sol.pT, normal: sol.normal, mean: su.mean, classW: hist.width, pLE: su.pLE,
      q90: M.percentile(sorted, 0.9), p75: M.percentile(sorted, 0.75), p99: M.percentile(sorted, 0.99) });
    return sol;
  }

  function readAt(s, lv) {
    const c = tclAt(s, lv, {});
    if (!c.ok) return c;
    const tclEx = c.ex;
    const us = simSeed(s);
    const r = seq(s, SALT.ask);
    const pct = PCTS[R.int(r, 0, PCTS.length - 1)];
    const ask = { pct, deadline: tclEx.deadline, act: null };
    const pre = readSol(tclEx, us, ask);
    const ids = tclEx.rows.map((x) => x.id);
    const mid = ids.filter((id) => pre.crit[id] >= 0.1 && pre.crit[id] <= 0.9);
    const pool = mid.length ? mid : ids;
    ask.act = pool[R.int(r, 0, pool.length - 1)];
    pre.act = { id: ask.act, crit: pre.crit[ask.act] };
    if (pre.questions.length < 3) return { ok: false, reason: 'few' };
    const ex = { kind: 'read', level: lv.level, sd: s, sdUsed: s, tcl: tclEx, sim: { us, ur: SIM_OPTS.ur, n: SIM_OPTS.n }, ask, questions: pre.questions };
    return { ok: true, ex, sol: pre };
  }

  /** Las combinaciones de las discretas (la última, la más rápida), con T y las críticas de cada una. */
  function enumerate(rows) {
    const disc = rows.filter((r) => r.x);
    const succ = Object.fromEntries(rows.map((r) => [r.id, []]));
    for (const r of rows) for (const p of r.preds) succ[p].push(r.id);
    const idx = disc.map(() => 0); const out = [];
    for (;;) {
      const vals = {}; let p = 1;
      disc.forEach((r, j) => { vals[r.id] = r.x[idx[j]]; p *= r.p[idx[j]]; });
      const d = Object.fromEntries(rows.map((r) => [r.id, r.x ? vals[r.id] : r.d]));
      out.push(Object.assign({ vals, p }, cpm(rows, succ, d)));
      let j = disc.length - 1;
      while (j >= 0 && ++idx[j] === disc[j].x.length) { idx[j] = 0; j--; }
      if (j < 0) return out;
    }
  }
  /** CPM con duraciones enteras (filas en orden topológico): { T, crit } con holgura total 0 exacta. */
  function cpm(rows, succ, d) {
    const ef = {}; let Tend = 0;
    for (const r of rows) {
      let es = 0;
      for (const p of r.preds) if (ef[p] > es) es = ef[p];
      ef[r.id] = es + d[r.id]; if (ef[r.id] > Tend) Tend = ef[r.id];
    }
    const lf = {};
    for (let i = rows.length - 1; i >= 0; i--) {
      const id = rows[i].id; let v = Tend;
      for (const q of succ[id]) { const ls = lf[q] - d[q]; if (ls < v) v = ls; }
      lf[id] = v;
    }
    return { T: Tend, crit: rows.map((r) => r.id).filter((id) => lf[id] - ef[id] === 0) };
  }

  function discSol(ex) {
    const combos = enumerate(ex.rows);
    const dist = new Map(); let mean = 0; let m2 = 0;
    const crit = Object.fromEntries(ex.rows.map((r) => [r.id, 0]));
    for (const c of combos) {
      dist.set(c.T, (dist.get(c.T) || 0) + c.p);
      mean += c.p * c.T; m2 += c.p * c.T * c.T;
      for (const id of c.crit) crit[id] += c.p;
    }
    const table = [...dist.entries()].sort((x, y) => x[0] - y[0]).map(([t, p]) => ({ t, p }));
    const pT = combos.reduce((s, c) => s + (c.T <= ex.deadline ? c.p : 0), 0);
    return { combos, dist: table, mean, var: Math.max(0, m2 - mean * mean), pT, crit };
  }

  function discAt(s, lv) {
    const g = generated(s, lv.prm);
    if (!g.ok) return { ok: false, reason: 'gen' };
    const r = seq(s, SALT.disc);
    const pats = DISC[base(lv.level)];
    const pat = pats[R.int(r, 0, pats.length - 1)];
    const ms = g.rows.map((x) => Number(x.duration));
    const order = R.shuffle(r, ms.map((_, i) => i));
    const size = {};                  // fila → número de valores (las de tres, primero: necesitan m ≥ 2)
    for (const k of pat) {
      const i = order.find((j) => !(j in size) && (k === 2 || ms[j] >= 2));
      if (i === undefined) return { ok: false, reason: 'disc' };
      size[i] = k;
    }
    const rows = g.rows.map((x, i) => {
      const m = ms[i]; const row = { id: x.id, preds: splitIds(x.links) };
      if (!(i in size)) return Object.assign(row, { d: m });
      if (size[i] === 2) {
        const lo = m - R.int(r, 0, Math.min(m - 1, Math.ceil(m / 2)));
        return Object.assign(row, { x: [lo, m + R.int(r, 1, m)], p: P2[R.int(r, 0, P2.length - 1)].slice() });
      }
      const lo = m - R.int(r, 1, Math.min(m - 1, Math.ceil(m / 2)));
      return Object.assign(row, { x: [lo, m, m + R.int(r, 1, m)], p: P3[R.int(r, 0, P3.length - 1)].slice() });
    });
    const disc = rows.filter((x) => x.x).map((x) => x.id);
    const sol = discSol({ rows, deadline: Infinity });
    if (sol.dist.length < 2) return { ok: false, reason: 'flat' };
    if (!disc.some((id) => sol.crit[id] > EPS && sol.crit[id] < 1 - EPS)) return { ok: false, reason: 'trivial' };
    const deadline = sol.dist[R.int(r, 0, sol.dist.length - 2)].t;
    const combos = pat.reduce((c, k) => c * k, 1);
    return { ok: true, ex: { kind: 'disc', level: lv.level, sd: s, sdUsed: s, rows, disc, deadline, combos } };
  }

  /** Las réplicas: el sorteo de M7 (simModel, track) con la semilla us, sin redondear (raw) y redondeado (reps). */
  function draws(rows, n, us) {
    const sm = simModel(rows);
    const res = SIM().run({ kind: 'project', model: sm, n, us, track: true });
    const pos = Object.fromEntries(sm.acts.map((a, i) => [a.id, i]));
    const raw = Array.from({ length: n }, (_, k) => rows.map((x) => res.acts[pos[x.id]][k]));
    return { raw, reps: raw.map((row) => row.map((v) => Math.round(v))) };
  }

  function repSol(ex) {
    const succ = Object.fromEntries(ex.rows.map((r) => [r.id, []]));
    for (const r of ex.rows) for (const p of r.preds) succ[p].push(r.id);
    const reps = ex.reps.map((row) => cpm(ex.rows, succ, Object.fromEntries(ex.rows.map((x, i) => [x.id, row[i]]))));
    const k = reps.filter((o) => o.T <= ex.deadline).length;
    const count = Object.fromEntries(ex.rows.map((x) => [x.id, reps.filter((o) => o.crit.includes(x.id)).length]));
    return { reps, k, pT: k / ex.n, count, crit: Object.fromEntries(Object.entries(count).map(([id, c]) => [id, c / ex.n])) };
  }

  function repAt(s, lv) {
    const c = tclAt(s, lv, {});
    if (!c.ok) return c;
    const rows = c.ex.rows;
    const n = REPS[base(lv.level)];
    const us = derived(s, SALT.rep);
    const ex = Object.assign({ kind: 'rep', level: lv.level, sd: s, sdUsed: s, rows, n, us }, draws(rows, n, us), { deadline: null });
    const sol = repSol(Object.assign({}, ex, { deadline: Infinity }));
    const ts = [...new Set(sol.reps.map((o) => o.T))].sort((x, y) => x - y);
    if (ts.length < 2) return { ok: false, reason: 'flat' };
    ex.deadline = ts[R.int(seq(s, SALT.repDeadline), 0, ts.length - 2)];
    return { ok: true, ex };
  }

  const AT = { tcl: tclAt, read: readAt, disc: discAt, rep: repAt };
  function checkKind(kind) {
    if (!KINDS.includes(kind)) throw new Error(`probgen: tipo desconocido ${kind}`);
  }
  /** Una sola semilla, sin buscar: { ok, ex (, sol con read) } o { ok: false, reason }. */
  function candidate(kind, s, params, opts) {
    checkKind(kind);
    const lv = levelOf(params);
    if (!lv) return { ok: false, reason: 'params' };
    return AT[kind](s, lv, opts || {});
  }

  // ---------- búsqueda de la semilla siguiente, a trozos ----------

  function start(kind, sd, params, opts) {
    checkKind(kind);
    const o = opts || {};
    const job = { kind, sd, opts: o, t: 0, tries: Number.isInteger(o.tries) && o.tries > 0 ? o.tries : TRIES_TCL, lv: null, out: null };
    if (!seedOk(sd)) { job.out = { ok: false, reason: 'seed' }; return job; }
    const lv = levelOf(params);
    if (!lv) { job.out = { ok: false, reason: 'params' }; return job; }
    if (lv.level === 'custom') {
      const ck = G.check(lv.prm);
      if (!ck.ok) { job.out = { ok: false, reason: 'check', issues: ck.issues }; return job; }
    }
    job.lv = lv;
    return job;
  }
  function step(job, limit) {
    const lim = limit || {};
    const until = lim.ms != null ? now() + lim.ms : Infinity;
    let left = lim.tries != null ? Math.max(1, lim.tries) : Infinity;
    while (!job.out && left > 0) {
      const s = seedAt(job.sd, job.t);
      const c = AT[job.kind](s, job.lv, job.opts);
      job.t++; left--;
      if (c.ok) {
        job.out = { ok: true, ex: Object.assign({}, c.ex, { sd: job.sd }), info: { tries: job.t, sdUsed: s } };
        if (c.sol) job.out.sol = c.sol;
      } else if (job.t >= job.tries) job.out = { ok: false, reason: 'notFound', tries: job.tries };
      if (now() >= until) break;
    }
    return { done: !!job.out };
  }
  function result(job) {
    if (!job.out) throw new Error('probgen: la búsqueda no ha terminado');
    return job.out;
  }
  const run = (kind) => (sd, params, opts) => { const job = start(kind, sd, params, opts); step(job, {}); return result(job); };

  // ---------- soluciones ----------

  function tclSol(ex) {
    const model = tclModel(ex.rows);
    const acts = Object.fromEntries(model.acts.map((a) => { const m = L.moments(a.dist); return [a.id, { te: m.mean, var: m.var }]; }));
    const ed = L.exam(model, { deadline: ex.deadline });
    const ep = L.exam(model, { prob: ex.prob });
    const zpAlt = ex.prob === 0.95 ? Z95.slice() : [ep.table.z2];
    const out = { acts, path: ed.path, ties: ed.tiesCount, mu: ed.mu, var: ed.var, sd: ed.sd,
      z: ed.table.z2, zExact: ed.z, p: ed.table.p4, pExact: ed.exact,
      zp: ep.table.z2, zpExact: ep.z, Tp: ep.table.deadline, TpExact: ep.deadline, zpAlt, TpAlt: zpAlt.map((z) => ed.mu + z * ed.sd), route: null };
    if (ex.route) {
      const mu = ex.route.reduce((s, id) => s + acts[id].te, 0);
      const v = ex.route.reduce((s, id) => s + acts[id].var, 0);
      const zr = (ex.deadline - mu) / Math.sqrt(v);
      const tp = T.tableP(zr); const pExact = T.phi(zr);
      out.route = { acts: ex.route.slice(), mu, var: v, sd: Math.sqrt(v), z: tp.z2, zExact: zr, p: tp.p4, pExact,
        both: out.p * tp.p4, bothExact: out.pExact * pExact };
    }
    return out;
  }

  function solve(kind, ex) {
    checkKind(kind);
    if (kind === 'tcl') return tclSol(ex);
    if (kind === 'read') return readSol(ex.tcl, ex.sim.us, ex.ask);
    if (kind === 'disc') return discSol(ex);
    return repSol(ex);
  }

  // ---------- ejemplos citados y enlace a M5–M7 ----------

  /**
   * kl, hl y tr (TCL; tr con μ y σ² normales, la otra ruta con { route: true }) y kd (discretas). Con { kind: 'rep', us, n }
   * un ejemplo de tres tiempos da sus réplicas (H8). Opciones: deadline (por defecto, el de la fuente), prob (0,95).
   */
  function fromExample(id, opts) {
    const o = opts || {};
    const e = X().get(id);
    if (!e) throw new Error(`probgen: ejemplo desconocido ${id}`);
    const deadline = o.deadline != null ? o.deadline : (e.expected && e.expected.deadline);
    const meta = { level: 'example', example: id, sd: null, sdUsed: null };
    if (e.rows[0].disc) {
      const rows = e.rows.map((r) => ({ id: r.id, preds: splitIds(r.links), x: r.disc.x.slice(), p: r.disc.p.slice() }));
      return Object.assign({ kind: 'disc' }, meta, { rows, disc: rows.map((r) => r.id), deadline,
        combos: rows.reduce((c, r) => c * r.x.length, 1) });
    }
    const rows = e.rows.map((r) => (e.m6only ? { id: r.id, mu: r.mu, var: r.var, preds: splitIds(r.links) }
      : { id: r.id, a: r.a, m: r.m, b: r.b, preds: splitIds(r.links) }));
    if (o.kind === 'rep') {
      const n = o.n || REPS.easy; const us = o.us || 1;
      return Object.assign({ kind: 'rep' }, meta, { rows, n, us }, draws(rows, n, us), { deadline });
    }
    let route = null;
    if (o.route) {
      const model = tclModel(rows);
      const r = routeOf(model, L.exam(model, { prob: 0.5 }).path);
      route = r.route ? r.route.acts.slice() : null;
    }
    return Object.assign({ kind: 'tcl' }, meta, { rows, deadline, prob: o.prob != null ? o.prob : 0.95, route });
  }

  /** La tabla propia de M5–M7 (clave ut): a, m y b como texto, para abrir la solución con el mismo proyecto. */
  function toUt(ex) {
    return { mode: 'pred', rows: ex.rows.map((r) => ({ id: r.id, name: '', a: String(r.a), m: String(r.m), b: String(r.b), links: r.preds.join(', ') })) };
  }

  const api = { VERSION, SEED_MAX, TRIES_TCL, SALT, PFIX, PROBS, Z_RANGE, ROUTE_K, ROUTE_PMAX, PCTS, SIM: SIM_OPTS, MARGIN, REPS, DISC, P2, P3,
    KINDS, QUESTIONS, seedAt, simSeed, candidate, start, step, result,
    tcl: run('tcl'), read: run('read'), disc: run('disc'), rep: run('rep'), solve, fromExample, toUt };
  root.PNL = root.PNL || {};
  root.PNL.probgen = api;
  if (isNode) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
