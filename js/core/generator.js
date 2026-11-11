/*
 * core/generator — proyectos nuevos con semilla para los ejercicios (spec f3a-generador-calculo, AC1–AC3 y AC14;
 * plan §3, P1 y P6). Algoritmo y niveles calibrados en clarify con un prototipo:
 *   1. estructura: las actividades en orden 0..n−1; cada una, salvo los inicios extra (probabilidad 1/(1+j)),
 *      elige k ≈ pred ± 1 predecesoras entre las anteriores a una distancia geométrica (sesgo a las cercanas);
 *      después, reducción transitiva: la tabla sale sin precedencias redundantes;
 *   2. duraciones enteras uniformes en [1, dmax];
 *   3. caminos críticos: se sortea cuántos; mientras falten, se alarga una actividad no crítica en su holgura
 *      total (no cambia la duración y crea uno o más caminos críticos), probando las candidatas en orden
 *      aleatorio y aceptando la primera que no se pasa;
 *   4. ficticias (si se piden): cota de las reglas de los conjuntos y mínimo de core/mindummy con presupuesto
 *      BUDGET; solo valen los mínimos demostrados (exact) dentro del rango.
 * Hasta MAX_TRIES intentos. Determinista: misma semilla y parámetros, misma tabla en cualquier motor (core/rng y
 * aritmética exacta; la distancia geométrica se sortea con pruebas de Bernoulli, sin logaritmos). Cambiar el
 * algoritmo, los niveles o el presupuesto es cambiar VERSION (plan P6). Sin DOM.
 */
(function (root) {
  'use strict';

  const isNode = typeof module !== 'undefined' && module.exports;
  const R = isNode ? require('./rng.js') : root.PNL.rng;
  const P = isNode ? require('./project.js') : root.PNL.project;
  const C = isNode ? require('./cpm.js') : root.PNL.cpm;
  const A = isNode ? require('./aoa.js') : root.PNL.aoa;
  const M = isNode ? require('./mindummy.js') : root.PNL.mindummy;

  const VERSION = 1;
  const MAX_TRIES = 500;
  const BUDGET = 1000;        // unidades de trabajo de mindummy al generar (puerta T001: peor caso 0,35 s en el difícil)
  const EXACT_N = 16;         // hasta aquí el mínimo sale exacto en ≥ 50 % de las estructuras (puerta T001)
  const STAY = 0.67;          // probabilidad de alejarse un paso más al elegir una predecesora (media ≈ 3)
  const MAX_TIE = 6;          // alargamientos como mucho para llegar a los caminos críticos pedidos
  const LEVELS = {
    easy: { n: [6, 7], pred: 1.2, dummies: [0, 1], critical: [1, 1], dmax: 9 },
    medium: { n: [9, 10], pred: 1.6, dummies: [2, 3], critical: [1, 2], dmax: 12 },
    hard: { n: [12, 14], pred: 2.0, dummies: [3, 5], critical: [2, 3], dmax: 15 },
  };
  const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const idOf = (i) => (i < 26 ? LETTERS[i] : `A${LETTERS[i - 26]}`);   // A…Z, AA…AD
  const isInt = (x) => Number.isInteger(x);
  const pair = (x, lo, hi) => Array.isArray(x) && x.length === 2 && isInt(x[0]) && isInt(x[1]) && x[0] >= lo && x[0] <= x[1] && x[1] <= hi;

  function check(params) {
    const p = params || {};
    const issues = [];
    const bad = (key) => issues.push({ code: 'range', key });
    const nOk = pair(p.n, 4, 30);
    if (!nOk) bad('n');
    if (!(typeof p.pred === 'number' && p.pred >= 1 && p.pred <= 3 && Math.abs(p.pred * 10 - Math.round(p.pred * 10)) < 1e-9)) bad('pred');
    const dOk = p.dummies === null || pair(p.dummies, 0, 30);
    if (!dOk) bad('dummies');
    if (!pair(p.critical, 1, 3)) bad('critical');
    if (!(isInt(p.dmax) && p.dmax >= 2 && p.dmax <= 30)) bad('dmax');
    if (nOk && dOk && p.dummies) {
      if (p.n[1] > EXACT_N) issues.push({ code: 'dummiesNoExact', key: 'dummies' });
      else if (p.dummies[0] > Math.floor(p.n[1] / 3)) issues.push({ code: 'dummiesTooMany', key: 'dummies' });
    }
    return { ok: !issues.length, issues };
  }

  // preds[j] = predecesoras de j (índices menores que j), ya sin redundancias.
  function structure(r, n, mean) {
    const preds = Array.from({ length: n }, () => new Set());
    for (let j = 1; j < n; j++) {
      if (r() < 1 / (1 + j)) continue;
      const k = Math.min(j, Math.max(1, Math.round(mean + (r() - 0.5) * 2)));
      while (preds[j].size < k) {
        let back = 1;
        while (back < j && r() < STAY) back++;
        preds[j].add(j - back);
      }
    }
    const reach = Array.from({ length: n }, () => new Set());
    for (let j = 0; j < n; j++) for (const i of preds[j]) { reach[j].add(i); for (const x of reach[i]) reach[j].add(x); }
    for (let j = 0; j < n; j++) {
      for (const i of [...preds[j]]) {
        for (const k of preds[j]) if (k !== i && reach[k].has(i)) { preds[j].delete(i); break; }
      }
    }
    return preds;
  }

  const toRows = (preds, durs) => preds.map((ps, j) => ({
    id: idOf(j), duration: String(durs[j]), links: [...ps].sort((a, b) => a - b).map(idOf).join(', '),
  }));

  function timing(rows) {
    const project = P.parse(rows, 'pred').project;
    return { project, sol: C.solve(project) };
  }

  // Alarga una actividad no crítica en su holgura total; la primera, en orden aleatorio, que no se pasa de want.
  function tieUp(r, rows, ev, dmax, want) {
    const cand = R.shuffle(r, ev.project.activities.map((a) => a.id).filter((id) => ev.sol.floats[id].TF > 0));
    for (const id of cand) {
      const nd = Number(rows.find((x) => x.id === id).duration) + ev.sol.floats[id].TF;
      if (nd > dmax) continue;
      const next = rows.map((x) => (x.id === id ? Object.assign({}, x, { duration: String(nd) }) : x));
      const e2 = timing(next);
      if (e2.sol.criticalCount <= want) return { rows: next, ev: e2 };
    }
    return null;
  }

  function generate(seed, params) {
    const ck = check(params);
    if (!ck.ok) return { ok: false, reason: 'check', issues: ck.issues };
    const L = params;
    const r = R.mulberry32(seed);
    const why = { critical: 0, dummies: 0, exact: 0 };
    for (let t = 1; t <= MAX_TRIES; t++) {
      const n = R.int(r, L.n[0], L.n[1]);
      const preds = structure(r, n, L.pred);
      let rows = toRows(preds, preds.map(() => R.int(r, 1, L.dmax)));
      let ev = timing(rows);
      const want = R.int(r, L.critical[0], L.critical[1]);
      for (let g = 0; ev.sol.criticalCount < want && g < MAX_TIE; g++) {
        const next = tieUp(r, rows, ev, L.dmax, want);
        if (!next) break;
        ({ rows, ev } = next);
      }
      if (ev.sol.criticalCount !== want) { why.critical++; continue; }
      let dummies = null;
      let rulesDummies = A.build(ev.project, { method: 'rules' }).dummies.length;
      if (L.dummies) {
        if (rulesDummies < L.dummies[0]) { why.dummies++; continue; }
        const md = M.solve(ev.project, { budget: BUDGET });
        if (!md.exact) { why.exact++; continue; }
        if (md.value < L.dummies[0] || md.value > L.dummies[1]) { why.dummies++; continue; }
        dummies = md.value;
      }
      return { ok: true, rows, mode: 'pred',
        info: { n, dummies, rulesDummies, critical: ev.sol.criticalCount, paths: ev.sol.paths.count, tries: t } };
    }
    const worst = ['critical', 'dummies', 'exact'].reduce((a, b) => (why[b] > why[a] ? b : a));
    return { ok: false, reason: 'notFound', worst, tries: MAX_TRIES };
  }

  const api = { VERSION, LEVELS, EXACT_N, MAX_TRIES, BUDGET, check, generate };
  root.PNL = root.PNL || {};
  root.PNL.generator = api;
  if (isNode) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
