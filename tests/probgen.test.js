'use strict';
// core/probgen — ejercicios de probabilidad (TCL) y de Montecarlo con semilla (spec f3e-probabilidad-montecarlo, AC1, AC5,
// AC7, AC11 y AC24; plan §0 y §3, P3; análisis H2, H3, H8 y H9).
// Ejemplos de referencia citados (core/stochex): Klastorin (2010) en el Tema 6c de J. M. Galán, con tres tiempos (A–C–E–F,
// 23,83, 8,25 y 0,66) y con tiempos discretos (E[T] = 23,248, P(T ≤ 20) = 0,157 y la criticidad de C, 0,660, contando
// empates); Hillier y Lieberman (2015), tablas 22.4 y 22.6 (44, 9 y 0,84); las dos rutas del Tema 6c con plazo 17 (0,81 y
// 0,71). Oráculos independientes: la regla de a y b del plan §0 escrita aquí otra vez; core/tcl (exam y paths) para el
// camino de las medias, los empates y la otra ruta; js/m7.js con la tabla del ejercicio como tabla propia (lo que abre
// «Ver la solución»), core/sim y core/mc para «Leer una simulación»; core/mc.exact para las discretas; una pasada hacia
// delante y otra hacia atrás escritas aquí para las réplicas; mc.replicaTrace de M7 para el sorteo de las réplicas.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const R = require('../js/core/rng.js');
const G = require('../js/core/generator.js');
const T = require('../js/core/threept.js');
const L = require('../js/core/tcl.js');
const S = require('../js/core/sim.js');
const MC = require('../js/core/mc.js');
const U = require('../js/core/urlstate.js');
const M7 = require('../js/m7.js');
const PG = require('../js/core/probgen.js');

const LEVELS = ['easy', 'medium', 'hard'];
const SWEEP = Number(process.env.PNL_PROBGEN_SWEEP || 1000);   // semillas por nivel (tareas, T003); menos, solo para probar deprisa
const SEED_MAX = 999999;
const EPS = 1e-9;
const close = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg || ''}: ${a} frente a ${b}`);
const natural = (x, y) => x.localeCompare(y, 'en', { numeric: true });
const byIds = (x, y) => {
  for (let i = 0; i < Math.min(x.length, y.length); i++) { const c = natural(x[i], y[i]); if (c) return c; }
  return x.length - y.length;
};
const PFIX = { easy: 0.30, medium: 0.20, hard: 0.15 };
// Las tablas del generador que comprueban los oráculos, una vez por semilla y nivel (el barrido ya las ha pedido a probgen).
const genCache = new Map();
const gen = (s, level) => {
  const key = `${level}|${s}`;
  if (!genCache.has(key)) genCache.set(key, G.generate(s, G.LEVELS[level]));
  return genCache.get(key);
};
const st7 = (extra) => Object.assign(U.defaults(), { v: 'unc', ex: null, um: 'm7', lang: 'es' }, extra || {});

// ---------- oráculos ----------

/** La regla de a y b del plan §0, escrita otra vez: secuencia mulberry32((s · 7 + SALT.amb) >>> 0), fila a fila. */
function ambOracle(s, genRows, level) {
  const r = R.mulberry32((s * 7 + PG.SALT.amb) >>> 0);
  return genRows.map((row) => {
    const m = Number(row.duration);
    if (r() < PFIX[level]) return { a: m, m, b: m };
    const left = R.int(r, 0, Math.min(m - 1, Math.ceil(m / 2)));
    const right = R.int(r, 1, m);
    return { a: m - left, m, b: m + right };
  });
}
const pertModel = (rows) => ({ acts: rows.map((r) => ({ id: r.id, preds: r.preds.slice(), dist: { kind: 'pert', a: r.a, m: r.m, b: r.b } })) });

/** La otra ruta según la spec: sin actividades en común con el crítico, la de más media (empate: más σ²; después, ids). */
function routeOracle(model, ex) {
  const crit = new Set(ex.path);
  const P = L.paths(model, 0);
  if (!P.list) return null;
  const dis = P.list.filter((p) => p.acts.every((id) => !crit.has(id)))
    .sort((x, y) => (Math.abs(y.mu - x.mu) > EPS ? y.mu - x.mu : Math.abs(y.var - x.var) > EPS ? y.var - x.var : byIds(x.acts, y.acts)));
  return dis[0] || null;
}

/** CPM de una réplica con duraciones enteras: { T, crit (ids con holgura total 0) }, en el orden de las filas. */
function cpmOracle(rows, d) {
  const ids = rows.map((r) => r.id);
  const ef = {}; const es = {};
  for (const r of rows) { es[r.id] = Math.max(0, ...r.preds.map((p) => ef[p])); ef[r.id] = es[r.id] + d[r.id]; }
  const T = Math.max(...ids.map((id) => ef[id]));
  const succ = Object.fromEntries(ids.map((id) => [id, []]));
  for (const r of rows) for (const p of r.preds) succ[p].push(r.id);
  const lf = {};
  for (const r of rows.slice().reverse()) lf[r.id] = Math.min(T, ...succ[r.id].map((s) => lf[s] - d[s]));
  return { T, crit: ids.filter((id) => lf[id] - ef[id] === 0) };
}

// ---------- barrido común (una sola vez por nivel, compartido por varias pruebas) ----------
// Para cada semilla de 1 a SWEEP: el ejercicio TCL sin y con la otra ruta, las discretas y las réplicas. probgen guarda las
// tablas del generador por semilla y parámetros, así que las búsquedas de semillas consecutivas comparten el trabajo.
const sweeps = {};
function sweep(level) {
  if (sweeps[level]) return sweeps[level];
  const out = { tcl: [], route: [], disc: [], rep: [], ms: { route: [] } };
  for (let sd = 1; sd <= SWEEP; sd++) {
    out.tcl.push(PG.tcl(sd, level));
    const t0 = process.hrtime.bigint();
    out.route.push(PG.tcl(sd, level, { route: true }));
    out.ms.route.push(Number(process.hrtime.bigint() - t0) / 1e6);
    out.disc.push(PG.disc(sd, level));
    out.rep.push(PG.rep(sd, level));
  }
  sweeps[level] = out;
  return out;
}

// ---------- constantes y contrato ----------

test('constantes del plan §0: tope de intentos, sales, fijas por nivel, probabilidades, z, réplicas y tamaños', () => {
  assert.equal(PG.VERSION, 1);
  assert.equal(PG.TRIES_TCL, 400);
  assert.deepEqual(PG.PFIX, PFIX);
  assert.deepEqual(PG.PROBS, [0.80, 0.85, 0.90, 0.95, 0.99]);
  assert.deepEqual(PG.Z_RANGE, [-0.5, 2.0]);
  assert.equal(PG.ROUTE_K, 2);
  assert.equal(PG.ROUTE_PMAX, 0.97);
  assert.deepEqual(PG.PCTS, [0.5, 0.8, 0.9]);
  assert.deepEqual(PG.SIM, { ur: 4, n: 10000, bins: 40 });
  assert.equal(PG.MARGIN, 0.05);
  assert.deepEqual(PG.REPS, { easy: 5, medium: 8, hard: 10 });
  const salts = Object.values(PG.SALT);
  for (const k of ['amb', 'plan', 'sim', 'ask', 'disc', 'rep']) assert.ok(Number.isInteger(PG.SALT[k]), k);
  assert.equal(new Set(salts).size, salts.length, 'cada secuencia con su sal');
  // Probabilidades «fáciles de sumar» (spec): ½, ⅓, ¼, ⅕ y sus complementos; con tres valores, sumando 1.
  for (const ps of PG.P2.concat(PG.P3)) close(ps.reduce((s, p) => s + p, 0), 1, 1e-12, 'suman 1');
  for (const ps of PG.P2) for (const p of ps) assert.ok([1 / 2, 1 / 3, 2 / 3, 1 / 4, 3 / 4, 1 / 5, 4 / 5].some((q) => Math.abs(q - p) < 1e-12), String(p));
  const prod = (pat) => pat.reduce((c, k) => c * k, 1);
  assert.deepEqual(PG.DISC.easy.map(prod), [4]);
  assert.deepEqual(PG.DISC.medium.map(prod).sort((a, b) => a - b), [8, 9]);
  for (const pat of PG.DISC.hard) assert.ok(prod(pat) >= 12 && prod(pat) <= 36 && pat.every((k) => k === 2 || k === 3), pat.join('·'));
  assert.ok(PG.DISC.hard.some((pat) => prod(pat) === 36), 'hasta 36 combinaciones, como el ejemplo de Klastorin');
});

test('semilla siguiente: de sd a sd + 1… y, pasada la última (999 999), vuelta a 1', () => {
  assert.equal(PG.seedAt(5, 0), 5);
  assert.equal(PG.seedAt(5, 3), 8);
  assert.equal(PG.seedAt(SEED_MAX, 0), SEED_MAX);
  assert.equal(PG.seedAt(SEED_MAX, 1), 1);
  assert.equal(PG.seedAt(SEED_MAX - 1, 3), 2);
});

test('semilla de la simulación en el rango de us de M7 (H2): 1 + ((s · 7 + SALT.sim) >>> 0) mod 999 999', () => {
  for (const s of [1, 2, 77, 123456, SEED_MAX]) {
    const us = PG.simSeed(s);
    assert.equal(us, 1 + (((s * 7 + PG.SALT.sim) >>> 0) % SEED_MAX));
    assert.ok(Number.isInteger(us) && us >= 1 && us <= SEED_MAX && /^\d{1,6}$/.test(String(us)), String(us));
  }
});

test('entradas no válidas: semilla fuera de rango, nivel desconocido o «Personalizar» que no pasa generator.check', () => {
  for (const sd of [0, -1, 1.5, SEED_MAX + 1, '7', null]) assert.equal(PG.tcl(sd, 'easy').reason, 'seed', String(sd));
  assert.equal(PG.tcl(7, 'imposible').reason, 'params');
  const bad = Object.assign({}, G.LEVELS.medium, { n: [3, 2] });
  const r = PG.tcl(7, bad);
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'check');
  assert.ok(r.issues.some((i) => i.key === 'n'));
  assert.throws(() => PG.start('nada', 7, 'easy'), /probgen/);
});

// ---------- TCL ----------

test('TCL: la tabla es la del generador de la F3a para ese nivel y la semilla usada; a y b según el plan §0 (AC11, H9)', () => {
  for (const level of LEVELS) {
    for (const r of sweep(level).tcl.slice(0, 300)) {
      assert.equal(r.ok, true);
      const { ex, info } = r;
      assert.equal(ex.kind, 'tcl');
      assert.equal(ex.level, level);
      assert.equal(ex.sdUsed, info.sdUsed);
      assert.equal(info.sdUsed, PG.seedAt(ex.sd, info.tries - 1), 'tries cuenta las semillas probadas');
      const g = gen(ex.sdUsed, level);
      assert.deepEqual(ex.rows.map((x) => [x.id, x.preds.join(', ')]), g.rows.map((x) => [x.id, x.links]));
      const abm = ambOracle(ex.sdUsed, g.rows, level);
      ex.rows.forEach((x, i) => {
        assert.deepEqual({ a: x.a, m: x.m, b: x.b }, abm[i], `${level} ${ex.sdUsed} ${x.id}`);
        assert.ok(Number.isInteger(x.a) && x.a >= 1 && x.a <= x.m && x.m <= x.b);
      });
    }
  }
});

test('TCL: «Personalizar» usa los parámetros dados y la proporción de fijas del nivel medio', () => {
  const prm = { n: [8, 8], pred: 1.5, dummies: null, critical: [1, 1], dmax: 10 };
  const r = PG.tcl(4242, prm);
  assert.equal(r.ok, true);
  assert.equal(r.ex.level, 'custom');
  const g = G.generate(r.ex.sdUsed, prm);
  assert.deepEqual(r.ex.rows.map((x) => ({ a: x.a, m: x.m, b: x.b })), ambOracle(r.ex.sdUsed, g.rows, 'medium'));
});

test('TCL: las fijas (a = m = b) salen con la proporción del nivel (0,30, 0,20 y 0,15)', () => {
  for (const level of LEVELS) {
    let fixed = 0; let all = 0;
    for (const r of sweep(level).tcl) for (const x of r.ex.rows) { all++; if (x.a === x.b) fixed++; }
    close(fixed / all, PFIX[level], 0.03, level);
  }
});

test('TCL: sin dos caminos críticos de las medias con la misma varianza, con varianza positiva, en 1000 semillas por nivel (AC24)', () => {
  for (const level of LEVELS) {
    for (const r of sweep(level).tcl.concat(sweep(level).route)) {
      assert.equal(r.ok, true, `${level}: ${r.reason}`);
      const e = L.exam(pertModel(r.ex.rows), { deadline: r.ex.deadline });
      assert.ok(!e.ties.some((t) => Math.abs(t.var - e.var) < EPS), `${level} ${r.ex.sdUsed}: empate de igual varianza`);
      assert.ok(e.var > EPS, `${level} ${r.ex.sdUsed}: camino crítico sin incertidumbre`);
    }
  }
});

test('TCL: cada semilla saltada no valía (la semilla siguiente, H9)', () => {
  for (const level of LEVELS) {
    for (const [i, r] of sweep(level).route.slice(0, 40).entries()) {
      for (let t = 0; t < r.info.tries - 1; t++) assert.equal(PG.candidate('tcl', PG.seedAt(i + 1, t), level, { route: true }).ok, false);
      assert.deepEqual(PG.candidate('tcl', r.ex.sdUsed, level, { route: true }).ex, r.ex.sdUsed === r.ex.sd ? r.ex : Object.assign({}, r.ex, { sd: r.ex.sdUsed }));
    }
  }
});

test('TCL: plazo entero ⌈μ + zσ⌉ con z en [−0,5, 2,0) y probabilidad pedida de la lista', () => {
  for (const level of LEVELS) {
    for (const r of sweep(level).tcl) {
      const { ex } = r;
      const e = L.exam(pertModel(ex.rows), { deadline: ex.deadline });
      assert.ok(Number.isInteger(ex.deadline) && ex.deadline >= 1);
      assert.ok((ex.deadline - e.mu) / e.sd >= PG.Z_RANGE[0] - EPS, `${ex.deadline} con μ = ${e.mu}`);
      assert.ok((ex.deadline - 1 - e.mu) / e.sd < PG.Z_RANGE[1], `${ex.deadline} con μ = ${e.mu}`);
      assert.ok(PG.PROBS.includes(ex.prob));
      assert.equal(ex.route, null);
    }
  }
  // Se usan todas las probabilidades de la lista.
  const seen = new Set(sweep('medium').tcl.map((r) => r.ex.prob));
  assert.equal(seen.size, PG.PROBS.length);
});

test('TCL, la otra ruta: sin actividades en común con el crítico, a 2σ como mucho, la de más media y P(ruta) ≤ 0,97 (AC24)', () => {
  for (const level of LEVELS) {
    let moved = 0;
    for (const r of sweep(level).route) {
      assert.equal(r.ok, true, `${level}: ${r.reason}`);
      const { ex } = r;
      const model = pertModel(ex.rows);
      const e = L.exam(model, { deadline: ex.deadline });
      const want = routeOracle(model, e);
      assert.ok(want, `${level} ${ex.sdUsed}: sin ruta`);
      assert.deepEqual(ex.route, want.acts);
      assert.ok(ex.route.every((id) => !e.path.includes(id)));
      assert.ok(want.var > 0 && (e.mu - want.mu) / Math.sqrt(want.var) <= PG.ROUTE_K + EPS);
      assert.ok(T.tableP((ex.deadline - want.mu) / Math.sqrt(want.var)).p4 <= PG.ROUTE_PMAX);
      if (ex.sdUsed !== ex.sd) moved++;
    }
    assert.ok(moved > 0, `${level}: la otra ruta tiene que hacer falta buscarla alguna vez`);
  }
});

test('TCL, la otra ruta: el tiempo de la búsqueda (puerta T001: peor caso en segundos; se hace a trozos)', () => {
  for (const level of LEVELS) {
    const ms = sweep(level).ms.route.slice().sort((a, b) => a - b);
    const tries = sweep(level).route.map((r) => r.info.tries).sort((a, b) => a - b);
    console.log(`# ${level}: búsqueda de la otra ruta, mediana ${ms[ms.length >> 1].toFixed(1)} ms, peor ${ms[ms.length - 1].toFixed(1)} ms; intentos peor ${tries[tries.length - 1]}`);
    assert.ok(tries[tries.length - 1] < PG.TRIES_TCL / 2, 'lejos del tope');
  }
});

test('TCL: con un tope de intentos menor que los necesarios, notFound; TRIES_TCL es el tope por defecto', () => {
  const r = sweep('easy').route.find((x) => x.info.tries > 3);
  assert.ok(r, 'alguna búsqueda de más de 3 intentos');
  const out = PG.tcl(r.ex.sd, 'easy', { route: true, tries: 3 });
  assert.deepEqual(out, { ok: false, reason: 'notFound', tries: 3 });
  // Sin ruta posible: una cadena (cada actividad con la anterior) no tiene dos caminos.
  const chain = { n: [4, 4], pred: 3, dummies: null, critical: [1, 1], dmax: 2 };
  const job = PG.start('tcl', 11, chain, { route: true, tries: 25 });
  while (!PG.step(job, { tries: 7 }).done);
  const res = PG.result(job);
  if (!res.ok) assert.deepEqual(res, { ok: false, reason: 'notFound', tries: 25 });
});

test('TCL: la búsqueda a trozos (start, step y result) da lo mismo que de una vez', () => {
  for (const [sd, level] of [[17, 'easy'], [33, 'medium'], [5, 'hard']]) {
    const whole = PG.tcl(sd, level, { route: true });
    const job = PG.start('tcl', sd, level, { route: true });
    let steps = 0;
    while (!PG.step(job, { tries: 1 }).done) steps++;
    assert.deepEqual(PG.result(job), whole);
    assert.equal(steps + 1, whole.info.tries);
    const job2 = PG.start('tcl', sd, level, { route: true });
    while (!PG.step(job2, { ms: 5 }).done);
    assert.deepEqual(PG.result(job2), whole);
  }
  const job = PG.start('tcl', 17, 'easy', { route: true });
  assert.throws(() => PG.result(job), /probgen/, 'sin terminar no hay resultado');
});

test('TCL: la semilla pasada la última vuelve a 1 y la usada queda en el rango del enlace', () => {
  const r = PG.tcl(SEED_MAX, 'easy', { route: true });
  assert.equal(r.ok, true);
  assert.ok(r.ex.sdUsed >= 1 && r.ex.sdUsed <= SEED_MAX);
  assert.equal(r.ex.sdUsed, PG.seedAt(SEED_MAX, r.info.tries - 1));
});

test('TCL: solve da el cálculo de examen de core/tcl (medias, camino, μ, σ², z y P de tabla y exactas, plazo y la otra ruta)', () => {
  for (const level of LEVELS) {
    for (const r of sweep(level).route.slice(0, 50)) {
      const { ex } = r;
      const model = pertModel(ex.rows);
      const s = PG.solve('tcl', ex);
      for (const x of ex.rows) {
        const e = T.exam(x);
        close(s.acts[x.id].te, e.mean, 1e-12, x.id);
        close(s.acts[x.id].var, e.var, 1e-12, x.id);
      }
      const ed = L.exam(model, { deadline: ex.deadline });
      const ep = L.exam(model, { prob: ex.prob });
      assert.deepEqual(s.path, ed.path);
      close(s.mu, ed.mu, 1e-12); close(s.var, ed.var, 1e-12); close(s.sd, ed.sd, 1e-12);
      assert.equal(s.z, ed.table.z2); assert.equal(s.p, ed.table.p4);
      close(s.zExact, ed.z, 1e-12); close(s.pExact, ed.exact, 1e-12);
      assert.equal(s.zp, ep.table.z2); close(s.zpExact, ep.z, 1e-12);
      close(s.Tp, ep.table.deadline, 1e-12); close(s.TpExact, ep.deadline, 1e-12);
      assert.deepEqual(s.zpAlt, ex.prob === 0.95 ? [1.64, 1.645, 1.65] : [ep.table.z2]);
      s.zpAlt.forEach((z, i) => close(s.TpAlt[i], ed.mu + z * ed.sd, 1e-12));
      const rt = routeOracle(model, ed);
      assert.deepEqual(s.route.acts, rt.acts);
      close(s.route.mu, rt.mu, 1e-12); close(s.route.var, rt.var, 1e-12);
      const zr = (ex.deadline - rt.mu) / Math.sqrt(rt.var);
      assert.equal(s.route.z, T.tableP(zr).z2);
      assert.equal(s.route.p, T.tableP(zr).p4);
      close(s.route.pExact, T.phi(zr), 1e-12);
      close(s.route.both, s.p * s.route.p, 1e-12, 'el producto de las dos probabilidades de tabla');
      close(s.route.bothExact, s.pExact * s.route.pExact, 1e-12);
    }
  }
  const noRoute = PG.solve('tcl', sweep('easy').tcl[0].ex);
  assert.equal(noRoute.route, null);
});

test('TCL, referencias: Klastorin (A–C–E–F, 23,83, 8,25, 0,66) y Hillier y Lieberman (44, 9, 0,84) (AC1)', () => {
  const kl = PG.fromExample('kl', { prob: 0.95 });
  assert.equal(kl.kind, 'tcl');
  assert.equal(kl.deadline, 25);
  assert.deepEqual(kl.rows.map((r) => [r.id, r.a, r.m, r.b, r.preds.join(',')]),
    [['A', 2, 6, 14, ''], ['B', 4, 7, 12, 'A'], ['C', 2, 8, 13, 'A'], ['D', 12, 14, 18, 'A'], ['E', 3, 5, 7, 'B,C'], ['F', 3, 4, 7, 'E']]);
  const s = PG.solve('tcl', kl);
  assert.deepEqual(s.path, ['A', 'C', 'E', 'F']);
  assert.equal(Math.round(s.mu * 100) / 100, 23.83);
  assert.equal(Math.round(s.var * 100) / 100, 8.25);
  assert.equal(s.z, 0.41);
  assert.equal(Math.round(s.p * 100) / 100, 0.66);
  assert.deepEqual(s.zpAlt, [1.64, 1.645, 1.65], 'para el 95 % valen las tres (AC25)');
  const hl = PG.solve('tcl', PG.fromExample('hl'));
  assert.equal(hl.mu, 44);
  assert.equal(hl.var, 9);
  assert.equal(hl.z, 1);
  assert.equal(Math.round(hl.p * 100) / 100, 0.84);
});

test('TCL, referencia de las dos rutas con plazo 17: 0,81 solo la crítica y 0,71 las dos (AC5)', () => {
  const tr = PG.fromExample('tr', { route: true });
  assert.equal(tr.deadline, 17);
  assert.deepEqual(tr.route, ['A', 'C']);
  const s = PG.solve('tcl', tr);
  assert.deepEqual(s.path, ['B', 'D']);
  assert.equal(Math.round(s.p * 100) / 100, 0.81);
  assert.equal(s.route.p, 0.8708);
  assert.equal(Math.round(s.route.both * 100) / 100, 0.71);
  assert.equal(PG.fromExample('tr').route, null, 'sin la opción, sin la otra ruta');
  assert.throws(() => PG.fromExample('no-existe'), /probgen/);
});

test('TCL: toUt da la tabla propia de M5–M7 con a, m y b como texto (para «Ver la solución»)', () => {
  const ex = sweep('medium').tcl[3].ex;
  const ut = PG.toUt(ex);
  assert.equal(ut.mode, 'pred');
  assert.deepEqual(ut.rows, ex.rows.map((r) => ({ id: r.id, name: '', a: String(r.a), m: String(r.m), b: String(r.b), links: r.preds.join(', ') })));
  const m = M7.model(st7({ ue: 'own', ut }), 'es');
  assert.equal(m.ok, true);
  const s = PG.solve('tcl', ex);
  assert.deepEqual(m.normal.path, s.path);
  close(m.normal.mu, s.mu, 1e-12);
});

// ---------- Leer una simulación ----------

const READS = [];
function reads() {
  if (READS.length) return READS;
  for (const level of LEVELS) for (const sd of [3, 41, 1009]) READS.push({ level, sd, r: PG.read(sd, level) });
  return READS;
}

/** Lo que M7 da con la tabla del ejercicio, su us, 10 000 réplicas y el plazo (H2). */
function m7Of(ex) {
  const m = M7.model(st7({ ue: 'own', ut: PG.toUt(ex.tcl), us: ex.sim.us, ur: 4, ud: ex.ask.deadline }), 'es');
  assert.equal(m.ok, true);
  const res = S.run({ kind: 'project', model: m.sim.model, n: m.sim.n, us: m.sim.us, track: true });
  const r = M7.results(m, res);
  const idx = MC.indices(res, m.sim.model, { corr: m.corr });
  const ids = m.sim.model.acts.map((a) => a.id);
  const by = (v) => Object.fromEntries(ids.map((id, i) => [id, v[i]]));
  return { m, res, r, ids, crit: by(idx.crit), cruc: by(idx.cruc), su: S.summary(res.durations) };
}

test('Leer: la tabla del ejercicio TCL de esa semilla, us en el rango de M7 y 10 000 réplicas (H2)', () => {
  for (const { level, r } of reads()) {
    assert.equal(r.ok, true);
    const { ex } = r;
    assert.equal(ex.kind, 'read');
    assert.equal(ex.level, level);
    assert.deepEqual(ex.tcl, PG.candidate('tcl', ex.sdUsed, level).ex);
    assert.deepEqual(ex.sim, { us: PG.simSeed(ex.sdUsed), ur: 4, n: 10000 });
    assert.ok(PG.PCTS.includes(ex.ask.pct));
    assert.equal(ex.ask.deadline, ex.tcl.deadline);
    assert.ok(ex.tcl.rows.some((x) => x.id === ex.ask.act));
  }
});

test('Leer: solve da los mismos valores que M7 abierto con la tabla, us = el del ejercicio y ur = 4 (AC6, H2)', () => {
  for (const { r } of reads()) {
    const { ex } = r;
    const o = m7Of(ex);
    assert.equal(o.m.sim.us, ex.sim.us);
    assert.equal(o.m.sim.n, 10000);
    const s = PG.solve('read', ex);
    assert.equal(s.pT, o.r.pT);
    assert.equal(s.pct.p, ex.ask.pct);
    assert.equal(s.pct.value, MC.percentile(o.r.sorted, ex.ask.pct));
    assert.equal(s.act.id, ex.ask.act);
    assert.equal(s.act.crit, o.crit[ex.ask.act]);
    assert.deepEqual(s.crit, o.crit);
    assert.deepEqual(s.cruc, o.cruc);
    assert.deepEqual(s.hist, o.r.hist);
    assert.equal(s.classW, o.r.hist.width, 'tolerancia de los tiempos: una clase del histograma de 40');
    assert.equal(s.mean, o.r.mean);
    close(s.normal.pT, o.r.pN, 1e-12);
    assert.deepEqual(s.questions, ex.questions);
    // El índice que se pregunta, entre 0,1 y 0,9 si alguna actividad lo está.
    const mid = o.ids.filter((id) => o.crit[id] >= 0.1 && o.crit[id] <= 0.9);
    if (mid.length) assert.ok(mid.includes(ex.ask.act), `${ex.ask.act} con criticidad ${o.crit[ex.ask.act]}`);
    // read devuelve la solución que calculó al generar.
    assert.deepEqual(Object.assign({}, r.sol, { sorted: null }), Object.assign({}, s, { sorted: null }));
  }
});

/** Las preguntas de interpretación que entran (H3), calculadas aquí desde lo que da M7. */
function questionsOracle(o) {
  const out = {};
  const q90 = MC.percentile(o.r.sorted, 0.9);
  const ranked = (score) => o.ids.slice().sort((x, y) => score(y) - score(x) || natural(x, y));
  const lead = (score) => { const k = ranked(score); return { best: k[0], margin: score(k[0]) - score(k[1]) }; };
  const c = lead((id) => o.crit[id]);
  if (c.margin >= PG.MARGIN - EPS) out.mostCrit = c.best;
  const u = lead((id) => o.cruc[id]);
  if (u.margin >= PG.MARGIN - EPS) out.mostCruc = u.best;
  const w = lead((id) => o.crit[id] - o.cruc[id]);
  if (w.margin >= PG.MARGIN - EPS && o.crit[w.best] >= 0.5) out.critLowCruc = w.best;
  const pN = o.r.pN; const pS = o.r.pT;
  if (Math.abs(pN - pS) >= PG.MARGIN - EPS) out.normal = pN > pS ? 'optimistic' : 'pessimistic';
  const width = o.r.hist.width;
  const cand = [o.r.mean, L.exam(o.m.examModel, { prob: 0.9 }).deadline, MC.percentile(o.r.sorted, 0.75), MC.percentile(o.r.sorted, 0.99)];
  const kept = [];
  for (const x of cand) {
    if (Math.abs(o.su.pLE(x) - 0.9) < PG.MARGIN - EPS || Math.abs(x - q90) <= width) continue;
    if (kept.some((y) => Math.abs(y - x) <= width)) continue;
    if (kept.length < 3) kept.push(x);
  }
  if (kept.length >= 2) out.promise = q90;
  return out;
}

test('Leer: las preguntas de interpretación solo con respuesta clara (margen 0,05), en su orden, y al menos tres (H3)', () => {
  const KEYS = ['mostCrit', 'mostCruc', 'critLowCruc', 'normal', 'promise'];
  for (const { r } of reads()) {
    const { ex } = r;
    const o = m7Of(ex);
    const want = questionsOracle(o);
    assert.deepEqual(ex.questions.map((q) => q.key), KEYS.filter((k) => k in want), `${ex.level} ${ex.sdUsed}`);
    assert.ok(ex.questions.length >= 3);
    for (const q of ex.questions) {
      assert.deepEqual(q.correct, want[q.key], q.key);
      assert.ok(q.options.includes(q.correct), q.key);
      assert.ok(q.options.length >= 3 && q.options.length <= 4, `${q.key}: ${q.options.length} opciones`);
      assert.equal(new Set(q.options).size, q.options.length);
      assert.ok(q.margin >= PG.MARGIN - EPS, q.key);
      if (q.key === 'normal') assert.deepEqual(q.options, ['optimistic', 'pessimistic', 'exact']);
      else if (q.key === 'promise') assert.deepEqual(q.options, q.options.slice().sort((a, b) => a - b), 'tiempos de menor a mayor');
      else {
        assert.deepEqual(q.options, q.options.slice().sort(natural), 'actividades en orden natural (el orden no delata la respuesta)');
        // Las otras opciones son las que siguen en la misma medida.
        const score = q.key === 'mostCrit' ? (id) => o.crit[id] : q.key === 'mostCruc' ? (id) => o.cruc[id] : (id) => o.crit[id] - o.cruc[id];
        const top = o.ids.slice().sort((x, y) => score(y) - score(x) || natural(x, y)).slice(0, q.options.length);
        assert.deepEqual(q.options, top.sort(natural));
      }
    }
  }
});

test('Leer: con menos de tres preguntas claras, la semilla siguiente; y cada semilla saltada no valía (H3, H9)', () => {
  let few = 0;
  for (const { level, sd, r } of reads()) {
    for (let t = 0; t < r.info.tries - 1; t++) {
      const c = PG.candidate('read', PG.seedAt(sd, t), level);
      assert.equal(c.ok, false);
      if (c.reason === 'few') few++;
    }
  }
  // Una semilla fácil con pocas preguntas claras: se busca entre las primeras.
  let found = null;
  for (let s = 1; s <= 60 && !found; s++) { const c = PG.candidate('read', s, 'easy'); if (!c.ok && c.reason === 'few') found = s; }
  assert.ok(found || few, 'alguna tabla con menos de tres preguntas claras');
  if (found) {
    const r = PG.read(found, 'easy');
    assert.equal(r.ok, true);
    assert.notEqual(r.ex.sdUsed, found);
    assert.equal(r.ex.sd, found);
  }
});

// ---------- Discretas a mano ----------

const discModel = (ex) => ({ acts: ex.rows.map((r) => ({ id: r.id, preds: r.preds.slice(),
  dist: r.x ? { kind: 'disc', x: r.x.slice(), p: r.p.slice() } : { kind: 'fixed', d: r.d } })) });

test('Discretas: 4, 8 o 9 y de 12 a 36 combinaciones; valores enteros alrededor de m, probabilidades de la lista; el resto fijas (AC7)', () => {
  const inSet = (ps, set) => set.some((q) => q.length === ps.length && q.every((v, i) => Math.abs(v - ps[i]) < 1e-12));
  for (const level of LEVELS) {
    const sizes = new Set();
    for (const [k, r] of sweep(level).disc.entries()) {
      assert.equal(r.ok, true, `${level}: ${r.reason}`);
      const { ex } = r;
      assert.equal(ex.kind, 'disc');
      // La tabla, frente al generador, en las 300 primeras (las mismas semillas que la prueba de la tabla TCL).
      const g = k < 300 ? gen(ex.sdUsed, level) : null;
      if (g) assert.deepEqual(ex.rows.map((x) => [x.id, x.preds.join(', ')]), g.rows.map((x) => [x.id, x.links]));
      const pat = [];
      ex.rows.forEach((x, i) => {
        const m = g ? Number(g.rows[i].duration) : null;
        if (!x.x) { if (g) assert.equal(x.d, m, 'fija = la duración del generador'); return; }
        pat.push(x.x.length);
        assert.ok(x.x.every((v) => Number.isInteger(v) && v >= 1), x.x.join());
        assert.ok(x.x.every((v, j) => j === 0 || v > x.x[j - 1]), 'de menor a mayor');
        if (g) assert.ok(x.x[0] <= m && m < x.x[x.x.length - 1], 'alrededor de m');
        if (g && x.x.length === 3) assert.equal(x.x[1], m);
        assert.ok(inSet(x.p, x.x.length === 2 ? PG.P2 : PG.P3), x.p.join());
      });
      assert.deepEqual(ex.disc, ex.rows.filter((x) => x.x).map((x) => x.id));
      const combos = pat.reduce((c, k) => c * k, 1);
      assert.equal(ex.combos, combos);
      assert.ok(PG.DISC[level].some((p) => p.length === pat.length && p.slice().sort().join() === pat.slice().sort().join()), pat.join('·'));
      sizes.add(combos);
    }
    if (level === 'easy') assert.deepEqual([...sizes], [4]);
    if (level === 'medium') assert.deepEqual([...sizes].sort(), [8, 9]);
    if (level === 'hard') assert.ok(sizes.has(36) && [...sizes].every((c) => c >= 12 && c <= 36));
  }
});

test('Discretas: solve coincide con la cuenta exacta de M7 (mc.exact) y enumera las combinaciones en orden', () => {
  for (const level of LEVELS) {
    for (const r of sweep(level).disc.slice(0, 150)) {
      const { ex } = r;
      const sm = L.simModel(discModel(ex));
      const e = MC.exact(sm);
      const s = PG.solve('disc', ex);
      close(s.mean, e.mean, 1e-9, 'E[T]');
      close(s.pT, e.pLE(ex.deadline), 1e-9, 'P(T ≤ plazo)');
      sm.acts.forEach((a, i) => close(s.crit[a.id], e.crit[i], 1e-9, a.id));
      assert.ok(s.pT > 0 && s.pT < 1, 'el plazo deja probabilidad entre 0 y 1');
      assert.ok(Number.isInteger(ex.deadline) && s.combos.some((c) => c.T === ex.deadline));
      assert.ok(ex.disc.some((id) => s.crit[id] > EPS && s.crit[id] < 1 - EPS), 'alguna discreta crítica a veces');
      assert.equal(s.combos.length, ex.combos);
      close(s.combos.reduce((t, c) => t + c.p, 0), 1, 1e-12);
      // Orden: las discretas en el orden de la tabla y sus valores de menor a mayor (la última, la más rápida).
      const disc = ex.rows.filter((x) => x.x);
      let k = 0;
      const idx = disc.map(() => 0);
      for (;;) {
        const c = s.combos[k++];
        const vals = Object.fromEntries(disc.map((x, j) => [x.id, x.x[idx[j]]]));
        assert.deepEqual(c.vals, vals);
        close(c.p, disc.reduce((p, x, j) => p * x.p[idx[j]], 1), 1e-12);
        const d = Object.fromEntries(ex.rows.map((x) => [x.id, x.x ? vals[x.id] : x.d]));
        const o = cpmOracle(ex.rows, d);
        assert.equal(c.T, o.T);
        assert.deepEqual(c.crit, o.crit);
        let j = disc.length - 1;
        while (j >= 0 && ++idx[j] === disc[j].x.length) { idx[j] = 0; j--; }
        if (j < 0) break;
      }
      assert.equal(k, ex.combos);
      // La distribución de T: probabilidad de cada duración, de menor a mayor.
      assert.deepEqual(s.dist.map((x) => x.t), e.dist.map((x) => x.t));
      s.dist.forEach((x, i) => close(x.p, e.dist[i].p, 1e-12));
    }
  }
});

test('Discretas, referencia de Klastorin (Tema 6c): E[T] = 23,248, P(T ≤ 20) = 0,157 y la criticidad de C, 0,660 (AC7)', () => {
  const kd = PG.fromExample('kd');
  assert.equal(kd.kind, 'disc');
  assert.equal(kd.deadline, 20);
  assert.equal(kd.combos, 36);
  const s = PG.solve('disc', kd);
  assert.equal(Math.round(s.mean * 1000) / 1000, 23.248);
  assert.equal(Math.round(s.pT * 1000) / 1000, 0.157);
  assert.equal(Math.round(s.crit.C * 1000) / 1000, 0.66);
  assert.equal(s.combos.length, 36);
});

// ---------- Réplicas a mano ----------

test('Réplicas: 5, 8 y 10; duraciones enteras, redondeo de la beta-PERT con su semilla, dentro de [a, b] (AC8)', () => {
  for (const level of LEVELS) {
    for (const r of sweep(level).rep.slice(0, 200)) {
      assert.equal(r.ok, true, `${level}: ${r.reason}`);
      const { ex } = r;
      assert.equal(ex.kind, 'rep');
      assert.deepEqual(ex.rows, PG.candidate('tcl', ex.sdUsed, level).ex.rows, 'a, m y b del ejercicio TCL de la misma semilla');
      assert.equal(ex.n, PG.REPS[level]);
      assert.equal(ex.reps.length, ex.n);
      assert.equal(ex.us, 1 + (((ex.sdUsed * 7 + PG.SALT.rep) >>> 0) % SEED_MAX));
      // Sorteo como M7 (mismo modelo, misma semilla y track): la duración redondeada de cada actividad.
      const sm = L.simModel({ acts: ex.rows.map((x) => ({ id: x.id, preds: x.preds, dist: MC.distFor('pert', x) })) });
      const res = S.run({ kind: 'project', model: sm, n: ex.n, us: ex.us, track: true });
      const pos = Object.fromEntries(sm.acts.map((a, i) => [a.id, i]));
      ex.reps.forEach((row, k) => ex.rows.forEach((x, i) => {
        assert.equal(row[i], Math.round(res.acts[pos[x.id]][k]), `${x.id} en la réplica ${k + 1}`);
        assert.ok(Number.isInteger(row[i]) && row[i] >= x.a && row[i] <= x.b);
      }));
    }
  }
});

test('Réplicas: solve con el CPM de cada réplica (T y críticas, empates incluidos) y las estimaciones k/n', () => {
  for (const level of LEVELS) {
    for (const r of sweep(level).rep.slice(0, 200)) {
      const { ex } = r;
      const s = PG.solve('rep', ex);
      const oracle = ex.reps.map((row) => cpmOracle(ex.rows, Object.fromEntries(ex.rows.map((x, i) => [x.id, row[i]]))));
      assert.deepEqual(s.reps, oracle);
      const k = oracle.filter((o) => o.T <= ex.deadline).length;
      assert.ok(Number.isInteger(ex.deadline) && k > 0 && k < ex.n, 'el plazo deja una estimación entre 0 y 1');
      assert.equal(s.pT, k / ex.n);
      assert.equal(s.k, k);
      for (const x of ex.rows) {
        const c = oracle.filter((o) => o.crit.includes(x.id)).length;
        assert.equal(s.count[x.id], c);
        assert.equal(s.crit[x.id], c / ex.n);
      }
    }
  }
});

test('Réplicas, referencia: las cinco primeras de Klastorin con la semilla 2026 son las de «Réplica a réplica» de M7 (H8)', () => {
  const ex = PG.fromExample('kl', { kind: 'rep', us: 2026, n: 5 });
  assert.equal(ex.kind, 'rep');
  assert.equal(ex.n, 5);
  const m = M7.model(st7({ ue: 'kl', us: 2026 }), 'es');
  const res = S.run({ kind: 'project', model: m.sim.model, n: m.sim.n, us: m.sim.us, track: true });
  const pos = Object.fromEntries(m.sim.model.acts.map((a, i) => [a.id, i]));
  for (let k = 0; k < 5; k++) {
    const tr = MC.replicaTrace(res, m.sim.model, k);
    ex.rows.forEach((x, i) => {
      assert.equal(ex.raw[k][i], tr.d[pos[x.id]], `${x.id}, réplica ${k + 1}`);
      assert.equal(ex.reps[k][i], Math.round(tr.d[pos[x.id]]));
    });
  }
  const s = PG.solve('rep', ex);
  assert.equal(s.reps.length, 5);
});

// ---------- reproducible ----------

test('misma semilla y parámetros, mismo ejercicio: dos veces y en otro proceso de Node (AC11)', () => {
  const cases = [['tcl', 404, 'hard', { route: true }], ['tcl', 9, 'easy', {}], ['disc', 77, 'hard', {}], ['rep', 31, 'medium', {}], ['read', 12, 'medium', {}]];
  const here = cases.map(([k, sd, lv, o]) => JSON.stringify(PG[k](sd, lv, o)));
  assert.deepEqual(cases.map(([k, sd, lv, o]) => JSON.stringify(PG[k](sd, lv, o))), here);
  const code = `const PG = require(${JSON.stringify(path.join(__dirname, '../js/core/probgen.js'))});
    const cases = ${JSON.stringify(cases)};
    process.stdout.write(JSON.stringify(cases.map(([k, sd, lv, o]) => JSON.stringify(PG[k](sd, lv, o)))));`;
  const other = JSON.parse(execFileSync(process.execPath, ['-e', code], { encoding: 'utf8', maxBuffer: 1 << 26 }));
  assert.deepEqual(other, here);
});
