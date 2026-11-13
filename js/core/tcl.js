/*
 * core/tcl — el TCL aplicado al camino crítico y sus trampas (spec f4a-tres-tiempos-tcl; plan §0, §3 y P7).
 * model = { acts: [{ id, name?, preds: [ids], dist }] }, con dist como en core/sim: { kind: 'pert' | 'classic' | 'tri',
 * a, m, b }, { kind: 'normal', mu, var } o { kind: 'fixed', d }.
 * - exam(model, { deadline } | { prob }): el cálculo de examen. Media y varianza de cada actividad con las fórmulas de
 *   examen (threept.exam; las normales, con su μ y σ²), camino crítico de las medias (core/cpm) y, si hay varios, el
 *   de mayor σ² (con la misma, el primero en orden natural de los ids); μ y σ² del camino; z y P «de tabla» (z a
 *   dos decimales) y exacta; o, al revés, el plazo para una probabilidad. Con σ² = 0, P es 0 o 1 (degenerate).
 *   Con más de LIST_LIMIT caminos críticos (core/cpm solo lista los primeros), el de mayor σ² se busca por programación
 *   dinámica sobre las actividades críticas y los demás se cuentan (tiesCount) sin listarlos todos (revisión F4a, F1).
 * - paths(model, deadline): todos los caminos con su μ, σ² y P, si son independientes (sin actividades comunes) y el
 *   producto de sus P (la cuenta exacta del Tema 6c cuando las duraciones son normales e independientes). Con más de
 *   LIST_LIMIT caminos, list = null y count (con 40 actividades como mucho, tantos caminos comparten actividades: no son
 *   independientes).
 * - trace(model, query): los pasos del cálculo para el reproductor y la predicción (campos unc.*; alt = de tabla).
 * - simModel(model): el modelo de core/sim para simular el proyecto entero (orden topológico, beta-PERT tal cual).
 * - cases: los contraejemplos de M6. merge (P7: cada camino es una normal, así que la cuenta del producto es exacta);
 *   few, skew y corr (un camino de actividades beta-PERT; su normal usa la media y la varianza de la beta-PERT, de modo
 *   que la distancia a la simulación mide solo la forma o la correlación).
 */
(function (root) {
  'use strict';

  const isNode = typeof module !== 'undefined' && module.exports;
  const T = isNode ? require('./threept.js') : root.PNL.threept;
  const C = isNode ? require('./cpm.js') : root.PNL.cpm;

  const EPS = 1e-9;
  const LIST_LIMIT = 50;   // el pathLimit por defecto de core/cpm
  const round2 = (z) => Math.sign(z) * (Math.round(Number((Math.abs(z) * 100).toFixed(8))) / 100) || 0;

  function moments(dist) {
    if (dist.kind === 'normal') return { mean: dist.mu, var: dist.var };
    if (dist.kind === 'fixed') return { mean: dist.d, var: 0 };
    return T.exam(dist);
  }

  const splitIds = (s) => String(s || '').split(/[,\s]+/).filter(Boolean);
  function fromExample(ex) {
    return { acts: ex.rows.map((r) => ({ id: r.id, name: r.name, preds: splitIds(r.links),
      dist: ex.m6only ? { kind: 'normal', mu: r.mu, var: r.var } : { kind: 'pert', a: r.a, m: r.m, b: r.b } })) };
  }

  function analyse(model) {
    const mom = {};
    model.acts.forEach((a) => { mom[a.id] = moments(a.dist); });
    const preds = {}; const succs = {};
    for (const a of model.acts) { preds[a.id] = a.preds.slice(); succs[a.id] = []; }
    for (const a of model.acts) for (const p of a.preds) succs[p].push(a.id);
    const project = { activities: model.acts.map((a) => ({ id: a.id, name: a.name || '', d: mom[a.id].mean })), preds, succs };
    const sol = C.solve(project);
    const sum = (acts, k) => acts.reduce((s, id) => s + mom[id][k], 0);
    const info = (acts) => ({ acts, mu: sum(acts, 'mean'), var: sum(acts, 'var') });
    // Empate de σ²: el primero en orden natural de los ids (A2 < A10), actividad a actividad.
    const byIds = (x, y) => {
      for (let i = 0; i < Math.min(x.length, y.length); i++) {
        const c = x[i].localeCompare(y[i], 'en', { numeric: true });
        if (c) return c;
      }
      return x.length - y.length;
    };
    const order = (x, y) => (Math.abs(y.var - x.var) > EPS ? y.var - x.var : byIds(x.acts, y.acts));
    let crit = sol.criticalPaths.map((p) => info(p.acts)).sort(order);
    if (sol.criticalCount > crit.length) {
      // Más caminos críticos de los que lista cpm: el de mayor σ² (y, a igualdad, el primero en orden natural) por
      // programación dinámica hacia atrás sobre los arcos críticos; la lista de cpm queda para nombrar algunos más.
      const best = maxVarPath(model, sol, mom, byIds);
      crit = [info(best)].concat(crit.filter((p) => p.acts.join('|') !== best.join('|')));
    }
    return { sol, crit, info, critCount: sol.criticalCount };
  }

  /** El camino crítico de mayor σ² (empates: orden natural de los ids) sin enumerar los caminos. */
  function maxVarPath(model, sol, mom, byIds) {
    const crit = new Set(sol.critical);
    const ids = model.acts.map((a) => a.id);
    const succs = {}; for (const id of ids) succs[id] = [];
    for (const a of model.acts) for (const p of a.preds) succs[p].push(a.id);
    const tight = (a, b) => crit.has(a) && crit.has(b) && Math.abs(sol.times[a].EF - sol.times[b].ES) < EPS;
    const isEnd = (id) => crit.has(id) && !succs[id].length && Math.abs(sol.times[id].EF - sol.duration) < EPS;
    const isStart = (id) => crit.has(id) && !model.acts.find((a) => a.id === id).preds.length && Math.abs(sol.times[id].ES) < EPS;
    const memo = {};
    const best = (id) => {             // { var, path } del mejor camino crítico de id al final
      if (memo[id]) return memo[id];
      let out = isEnd(id) ? { var: 0, path: [] } : null;
      for (const s of succs[id].filter((x) => tight(id, x))) {
        const r = best(s);
        if (!r) continue;
        const cand = { var: r.var, path: [s].concat(r.path) };
        if (!out || cand.var - out.var > EPS || (Math.abs(cand.var - out.var) <= EPS && byIds(cand.path, out.path) < 0)) out = cand;
      }
      if (out) out = { var: out.var + mom[id].var, path: out.path };
      memo[id] = out;
      return out;
    };
    let top = null;
    for (const id of ids.filter(isStart)) {
      const r = best(id);
      if (!r) continue;
      const cand = { var: r.var, path: [id].concat(r.path) };
      if (!top || cand.var - top.var > EPS || (Math.abs(cand.var - top.var) <= EPS && byIds(cand.path, top.path) < 0)) top = cand;
    }
    return top.path;
  }

  function exam(model, query) {
    const q = query || {};
    const { crit, critCount } = analyse(model);
    const best = crit[0];
    const out = { path: best.acts, ties: crit.slice(1).map((p) => ({ acts: p.acts, var: p.var })), tiesCount: critCount - 1, mu: best.mu, var: best.var,
      sd: Math.sqrt(best.var), degenerate: best.var < EPS, z: null, table: null, exact: null };
    if (typeof q.deadline === 'number' && Number.isFinite(q.deadline)) {
      out.deadline = q.deadline;
      if (out.degenerate) { out.exact = q.deadline >= out.mu - EPS ? 1 : 0; return out; }
      out.z = (q.deadline - out.mu) / out.sd;
      out.table = T.tableP(out.z);
      out.exact = T.phi(out.z);
      return out;
    }
    if (typeof q.prob === 'number' && q.prob > 0 && q.prob < 1) {
      out.prob = q.prob;
      if (out.degenerate) { out.deadline = out.mu; return out; }
      out.z = T.phiInv(q.prob);
      out.deadline = out.mu + out.z * out.sd;
      const z2 = round2(out.z);
      out.table = { z2, deadline: out.mu + z2 * out.sd };
      return out;
    }
    throw new Error('tcl.exam: hace falta un plazo o una probabilidad entre 0 y 1');
  }

  function paths(model, deadline) {
    const { sol, info } = analyse(model);
    if (!sol.paths.list) return { list: null, count: sol.paths.count, independent: false, product: null };
    const list = sol.paths.list.map((p) => {
      const x = info(p.acts);
      x.p = x.var < EPS ? (deadline >= x.mu - EPS ? 1 : 0) : T.phi((deadline - x.mu) / Math.sqrt(x.var));
      return x;
    });
    const seen = new Set(); let independent = true;
    for (const p of list) for (const id of p.acts) { if (seen.has(id)) independent = false; seen.add(id); }
    return { list, count: list.length, independent, product: list.reduce((s, p) => s * p.p, 1) };
  }

  function trace(model, query) {
    const r = exam(model, query);
    const steps = [{ kind: 'tcl.path', path: r.path, ties: r.ties, values: [] },
      { kind: 'tcl.mu', values: [{ field: 'unc.mu', value: r.mu }] },
      { kind: 'tcl.var', values: [{ field: 'unc.var2', value: r.var }] }];
    if (r.degenerate) { steps.push({ kind: 'tcl.degenerate', result: r, values: [] }); return steps; }
    if (r.prob != null) {
      steps.push({ kind: 'tcl.zFor', values: [{ field: 'unc.z', value: r.z, alt: r.table.z2 }] },
        { kind: 'tcl.deadline', values: [{ field: 'unc.T', value: r.deadline, alt: r.table.deadline }] });
    } else {
      steps.push({ kind: 'tcl.z', values: [{ field: 'unc.z', value: r.z, alt: r.table.z2 }] },
        { kind: 'tcl.p', values: [{ field: 'unc.p', value: r.exact, alt: r.table.p4 }] });
    }
    return steps;
  }

  function simModel(model) {
    const pos = {}; const done = new Set(); const order = [];
    let progress = true;
    while (order.length < model.acts.length && progress) {
      progress = false;
      for (const a of model.acts) {
        if (!done.has(a.id) && a.preds.every((p) => done.has(p))) { done.add(a.id); pos[a.id] = order.length; order.push(a); progress = true; }
      }
    }
    if (order.length < model.acts.length) throw new Error('tcl.simModel: el proyecto tiene un ciclo');
    return { acts: order.map((a) => ({ id: a.id, preds: a.preds.map((p) => pos[p]), dist: a.dist })) };
  }

  // ---------- contraejemplos de M6 ----------
  const MERGE = { mu: 20, var: 4 };
  const intIn = (x, lo, hi) => Number.isInteger(x) && x >= lo && x <= hi;
  const numIn = (x, lo, hi) => typeof x === 'number' && x >= lo && x <= hi;
  function merge({ n, slack }) {
    if (!intIn(n, 1, 8) || !numIn(slack, 0, 20)) throw new Error('tcl.cases.merge: fuera de rango');
    const sd = Math.sqrt(MERGE.var); const deadline = MERGE.mu + sd;
    const mus = Array.from({ length: n }, (_, i) => (i === 0 ? MERGE.mu : MERGE.mu - slack));
    return { paths: mus.map((mu) => ({ acts: [{ kind: 'normal', mu, var: MERGE.var }] })), normal: { mu: MERGE.mu, var: MERGE.var },
      deadline, exact: mus.reduce((p, mu) => p * T.phi((deadline - mu) / sd), 1) };
  }
  function chain(k, d, rho) {
    const m = T.moments('pert', d); const mu = k * m.mean; const v = k * m.var;
    return { paths: [{ acts: Array.from({ length: k }, () => ({ kind: 'pert', a: d.a, m: d.m, b: d.b })), rho }],
      normal: { mu, var: v }, deadline: mu + Math.sqrt(v), terna: d, k };
  }
  const SKEWED = { a: 0, m: 0, b: 12 };
  function few({ k }) {
    if (!intIn(k, 1, 30)) throw new Error('tcl.cases.few: fuera de rango');
    return chain(k, SKEWED, 0);
  }
  function skew({ s }) {
    if (!numIn(s, 0, 1)) throw new Error('tcl.cases.skew: fuera de rango');
    return chain(3, { a: 0, m: 6 - 6 * s, b: 12 }, 0);
  }
  function corr({ rho }) {
    if (!numIn(rho, 0, 1)) throw new Error('tcl.cases.corr: fuera de rango');
    return chain(10, { a: 0, m: 6, b: 12 }, rho);
  }

  const api = { LIST_LIMIT, exam, paths, trace, simModel, fromExample, moments, cases: { merge, few, skew, corr, MERGE, SKEWED } };
  root.PNL = root.PNL || {};
  root.PNL.tcl = api;
  if (isNode) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
