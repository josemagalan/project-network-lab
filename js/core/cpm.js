/*
 * core/cpm — método del camino crítico sobre una red ROY (actividad en nodo).
 * solve(project) devuelve los tiempos (ES, EF, LS, LF), las cuatro holguras de Klastorin (2010),
 * las actividades y caminos críticos y la TRAZA de pasos: la única fuente de verdad que leen la red,
 * la matriz, la tabla, el Gantt, la predicción y la URL (plan f1-cpm-roy, §2).
 *   TF = LF − ES − d          FF = mín(ES sucesoras) − ES − d
 *   IF = máx(0, mín(ES sucesoras) − máx(LF predecesoras) − d)      SF = LF − máx(LF predecesoras) − d
 * Inicio (@S) y fin (@E) son actividades implícitas de duración 0. El tiempo empieza en 0.
 */
(function (root) {
  'use strict';

  const isNode = typeof module !== 'undefined' && module.exports;
  const T = isNode ? require('./topo.js') : root.PNL.topo;
  const { START, END } = T;
  const EPS = 1e-9;
  const rnd = (x) => { const v = Math.round(x * 1e9) / 1e9; return v === 0 ? 0 : v; };   // nunca −0
  const FLOATS = ['TF', 'FF', 'IF', 'SF'];

  function solve(project, opts) {
    const pathLimit = (opts && opts.pathLimit) || 50;
    const topo = T.order(project);
    if (topo.cycle) throw new Error('cpm.solve: el proyecto tiene un ciclo');
    const order = topo.order;
    const d = Object.fromEntries(project.activities.map((a) => [a.id, a.d]));
    d[START] = 0; d[END] = 0;
    const preds = (id) => (id === END ? order.filter((x) => !project.succs[x].length)
      : (project.preds[id].length ? project.preds[id] : [START]));
    const succs = (id) => (id === START ? order.filter((x) => !project.preds[x].length)
      : (project.succs[id].length ? project.succs[id] : [END]));

    const times = { [START]: { ES: 0, EF: 0 } };
    const trace = [{ kind: 'table', reveals: [] }, { kind: 'build', reveals: [] }];

    for (const id of [...order, END]) {
      const terms = preds(id).map((p) => ({ from: p, value: times[p].EF }));
      const ES = rnd(Math.max(...terms.map((t) => t.value)));
      const EF = rnd(ES + d[id]);
      times[id] = { ES, EF };
      trace.push({ kind: 'forward', act: id,
        reveals: [{ act: id, field: 'ES', value: ES }, { act: id, field: 'EF', value: EF }],
        formula: { op: 'max', terms, chosen: terms.filter((t) => Math.abs(t.value - ES) < EPS).map((t) => t.from) } });
    }
    const duration = times[END].EF;

    times[END].LF = duration; times[END].LS = duration;
    trace.push({ kind: 'backward', act: END,
      reveals: [{ act: END, field: 'LF', value: duration }, { act: END, field: 'LS', value: duration }],
      formula: { op: 'min', terms: [], chosen: [] } });
    for (const id of [...order].reverse()) {
      const terms = succs(id).map((s) => ({ from: s, value: times[s].LS }));
      const LF = rnd(Math.min(...terms.map((t) => t.value)));
      const LS = rnd(LF - d[id]);
      Object.assign(times[id], { LF, LS });
      trace.push({ kind: 'backward', act: id,
        reveals: [{ act: id, field: 'LF', value: LF }, { act: id, field: 'LS', value: LS }],
        formula: { op: 'min', terms, chosen: terms.filter((t) => Math.abs(t.value - LF) < EPS).map((t) => t.from) } });
    }
    const startLF = Math.min(...succs(START).map((s) => times[s].LS));
    Object.assign(times[START], { LF: startLF, LS: startLF });

    const floats = {};
    for (const id of order) {
      const t = times[id];
      const esMin = Math.min(...succs(id).map((s) => times[s].ES));
      const lfMax = Math.max(...preds(id).map((p) => times[p].LF));
      floats[id] = {
        TF: rnd(t.LF - t.ES - d[id]),
        FF: rnd(esMin - t.ES - d[id]),
        IF: rnd(Math.max(0, esMin - lfMax - d[id])),
        SF: rnd(t.LF - lfMax - d[id]),
      };
    }
    for (const f of FLOATS) {
      trace.push({ kind: 'float', float: f, reveals: order.map((id) => ({ act: id, field: f, value: floats[id][f] })) });
    }
    const critical = order.filter((id) => Math.abs(floats[id].TF) < EPS);
    trace.push({ kind: 'critical', reveals: [] }, { kind: 'gantt', reveals: [] });

    // Caminos de inicio a fin. Se cuentan siempre; se listan si hay como mucho pathLimit.
    const count = new Map([[END, 1]]);
    for (const id of [...order].reverse()) count.set(id, succs(id).reduce((a, s) => a + count.get(s), 0));
    const total = succs(START).reduce((a, s) => a + count.get(s), 0);
    const walk = (filterArc, limit) => {
      const out = [];
      const go = (id, acc, len) => {
        if (out.length >= limit) return;
        if (id === END) { out.push({ acts: acc, length: rnd(len), critical: Math.abs(len - duration) < EPS }); return; }
        for (const s of succs(id).filter((x) => filterArc(id, x))) go(s, s === END ? acc : [...acc, s], len + d[s]);
      };
      for (const s of succs(START).filter((x) => filterArc(START, x))) go(s, [s], d[s]);
      return out;
    };
    const tight = (a, b) => Math.abs(times[a].EF - times[b].ES) < EPS
      && (a === START || critical.includes(a)) && (b === END || critical.includes(b));
    const criticalPaths = walk(tight, pathLimit);
    let list = null;
    if (total <= pathLimit) {
      list = walk(() => true, pathLimit).sort((x, y) => y.length - x.length || x.acts.join(' ').localeCompare(y.acts.join(' ')));
    }

    return { duration, order, levels: topo.levels, times, floats, critical, criticalPaths, paths: { count: total, list }, trace };
  }

  function whatIf(project, act, newDuration) {
    const copy = { activities: project.activities.map((a) => (a.id === act ? Object.assign({}, a, { d: newDuration }) : a)),
      preds: project.preds, succs: project.succs };
    return solve(copy);
  }

  const api = { START, END, FLOATS, solve, whatIf };
  root.PNL = root.PNL || {};
  root.PNL.cpm = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
