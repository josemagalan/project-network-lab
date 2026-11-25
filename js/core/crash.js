/*
 * core/crash — compresión coste–tiempo (spec f5b-coste-tiempo; plan §0, §3, P1–P5, P9).
 *   parse(rows) → { project, report }
 *       rows = [{ id, name?, links, dn, dc, cn, cc }] en texto, como el taller (P1). project = { activities: [{ id, name,
 *       dn, dc, cn, cc, b }] en orden topológico, preds, succs, byId }. Errores: los de core/project (badId,
 *       reservedId, duplicateId, unknownRef, tooMany, cycle) y badDuration, badCrash, badCost, costOrder; aviso noCrash.
 *   schedule(p, d) → { T, times, critical, criticalPaths, solution }   core/cpm con las duraciones d
 *   directCost(p, d) → coste directo (Σ cn + Σ b·(dn − d))
 *   ruleCut(p, d) → { set, cost, unique, other } | null                  P2: corte mínimo de la subred crítica
 *   optimum(p, T) → { d, cost } | null · curve(p) → [{ T, d, cost }]     P3: modelo lineal de Klastorin (core/lp)
 *   move(p, base, T) → { shorten, lengthen, cost }                       P4: ±1 alrededor de base
 *   rule(p) → pasos de la regla, con el óptimo de cada duración y el movimiento en la primera que queda por encima
 *   shortcut(p) → atajo de Nicholas (P5) · totals(p, k) · best(p, k) → duraciones de coste total mínimo (§0)
 *   trace(p, k) → pasos del reproductor (P9) · stepData(p, d) y setCheck(data, set) → corrección del conjunto que
 *       predice el alumno (`analyze` B3); checkSet(p, d, set) = setCheck(stepData(p, d), set)
 * Duraciones enteras; costes con decimales, redondeados a 10⁻⁹. Sin DOM ni azar.
 */
(function (root) {
  'use strict';

  const G = root.PNL || {};
  const Pr = G.project || (typeof require !== 'undefined' ? require('./project.js') : null);
  const Cpm = G.cpm || (typeof require !== 'undefined' ? require('./cpm.js') : null);
  const Lp = G.lp || (typeof require !== 'undefined' ? require('./lp.js') : null);

  const EPS = 1e-9;
  const INF = 1e15;
  const rnd = (v) => Math.round(v * 1e9) / 1e9;
  const str = (v) => (v == null ? '' : String(v));
  const INT_RE = /^\d+$/;
  const NUM_RE = /^\d+(?:[.,]\d+)?$/;
  const num = (s) => Number(s.replace(',', '.'));

  // ---------- Lectura (P1) ----------

  const blank = (r) => ['id', 'links', 'dn', 'dc', 'cn', 'cc'].every((k) => !str(r[k]).trim());

  function parse(rows) {
    const errors = []; const warnings = []; const fields = new Map();
    rows.forEach((r, i) => {
      if (blank(r)) return;
      const id = str(r.id).trim().toUpperCase();
      const dn = str(r.dn).trim(); const dc = str(r.dc).trim(); const cn = str(r.cn).trim(); const cc = str(r.cc).trim();
      const err = (code) => errors.push({ code, row: i, ids: [id] });
      const f = {};
      if (INT_RE.test(dn)) f.dn = Number(dn); else err('badDuration');
      if (!dc && !cn && !cc) {
        if (f.dn != null) { f.dc = f.dn; f.cn = 0; f.cc = 0; warnings.push({ code: 'noCrash', row: i, ids: [id] }); }
      } else {
        if (INT_RE.test(dc) && (f.dn == null || Number(dc) <= f.dn)) f.dc = Number(dc); else err('badCrash');
        if (NUM_RE.test(cn) && NUM_RE.test(cc)) {
          f.cn = num(cn); f.cc = num(cc);
          if (f.cc < f.cn) err('costOrder');
        } else err('badCost');
      }
      fields.set(i, f);
    });
    // Estructura con core/project (identificadores, predecesoras, ciclo, 30 actividades); la duración, ya comprobada.
    const base = rows.map((r) => (blank(r) ? { id: '', duration: '', links: '' } : { id: r.id, name: r.name, duration: '0', links: r.links }));
    const st = Pr.parse(base, 'pred');
    const all = errors.concat(st.report.errors.filter((e) => e.code !== 'badDuration'));
    if (all.length) {
      const at = (e) => (e.row == null ? Infinity : e.row);
      return { project: null, report: { errors: all.sort((a, b) => at(a) - at(b)), warnings } };
    }
    if (!st.project) return { project: null, report: { errors: [], warnings: [] } };
    const rowOf = new Map(); rows.forEach((r, i) => { if (!blank(r)) rowOf.set(str(r.id).trim().toUpperCase(), i); });
    const solved = Cpm.solve(Object.assign({}, st.project, { activities: st.project.activities.map((a) => Object.assign({}, a, { d: 0 })) }));
    const activities = solved.order.map((id) => {
      const a = st.project.activities.find((x) => x.id === id);
      const f = fields.get(rowOf.get(id));
      const b = f.dn > f.dc ? rnd((f.cc - f.cn) / (f.dn - f.dc)) : 0;
      return { id, name: a.name, dn: f.dn, dc: f.dc, cn: f.cn, cc: f.cc, b };
    });
    const project = { activities, preds: st.project.preds, succs: st.project.succs, byId: Object.fromEntries(activities.map((a) => [a.id, a])) };
    return { project, report: { errors: [], warnings: warnings.concat(st.report.warnings).sort((a, b) => a.row - b.row) } };
  }

  // ---------- Calendario ----------

  function schedule(p, d) {
    const proj = { activities: p.activities.map((a) => ({ id: a.id, name: a.name, d: d[a.id] })), preds: p.preds, succs: p.succs };
    const s = Cpm.solve(proj);
    return { T: s.duration, times: s.times, critical: s.critical, criticalPaths: s.criticalPaths.map((x) => x.acts), solution: s };
  }

  const directCost = (p, d) => rnd(p.activities.reduce((s, a) => s + a.cn + a.b * (a.dn - d[a.id]), 0));

  // ---------- La regla: corte mínimo de la subred crítica (P2) ----------
  // Nodos: fuente, sumidero y, por cada crítica, entrada y salida. Arco de la actividad: capacidad b si se puede
  // acortar, infinita si no; los demás, infinitos. Flujo máximo de Edmonds–Karp; el corte más cercano al comienzo es el
  // conjunto; hay empate si el más cercano al final es distinto.
  function ruleCut(p, d, sch) {
    sch = sch || schedule(p, d);
    const crit = p.activities.filter((a) => sch.critical.includes(a.id));
    const ix = new Map(crit.map((a, i) => [a.id, i]));
    const n = 2 * crit.length + 2; const S = n - 2; const T = n - 1;
    const cap = Array.from({ length: n }, () => new Float64Array(n));
    const tm = sch.times;
    crit.forEach((a, i) => {
      cap[2 * i][2 * i + 1] = d[a.id] > a.dc ? a.b : INF;
      if (tm[a.id].ES < EPS) cap[S][2 * i] = INF;
      if (Math.abs(tm[a.id].EF - sch.T) < EPS) cap[2 * i + 1][T] = INF;
      for (const s of p.succs[a.id]) if (ix.has(s) && Math.abs(tm[s].ES - tm[a.id].EF) < EPS) cap[2 * i + 1][2 * ix.get(s)] = INF;
    });
    let flow = 0;
    for (;;) {
      const prev = new Int32Array(n).fill(-1); prev[S] = S; const q = [S];
      while (q.length && prev[T] < 0) {
        const u = q.shift();
        for (let v = 0; v < n; v++) if (prev[v] < 0 && cap[u][v] > EPS) { prev[v] = u; q.push(v); }
      }
      if (prev[T] < 0) break;
      let f = INF;
      for (let v = T; v !== S; v = prev[v]) f = Math.min(f, cap[prev[v]][v]);
      if (f >= INF / 2) return null;                       // un camino crítico que no se puede acortar
      for (let v = T; v !== S; v = prev[v]) { cap[prev[v]][v] -= f; cap[v][prev[v]] += f; }
      flow += f;
    }
    const reach = (from, forward) => {
      const seen = new Uint8Array(n); seen[from] = 1; const q = [from];
      while (q.length) {
        const u = q.shift();
        for (let v = 0; v < n; v++) if (!seen[v] && (forward ? cap[u][v] : cap[v][u]) > EPS) { seen[v] = 1; q.push(v); }
      }
      return seen;
    };
    const fromS = reach(S, true); const toT = reach(T, false);
    const set = crit.filter((a, i) => fromS[2 * i] && !fromS[2 * i + 1]).map((a) => a.id);
    const other = crit.filter((a, i) => !toT[2 * i] && toT[2 * i + 1]).map((a) => a.id);
    return { set, cost: rnd(flow), unique: set.join() === other.join(), other };
  }

  // Un camino crítico hecho solo de actividades que no se pueden acortar (por qué termina la compresión).
  function stuckPath(p, d, sch) {
    const tm = sch.times; const ok = (id) => sch.critical.includes(id) && d[id] <= p.byId[id].dc;
    const go = (id) => {
      if (Math.abs(tm[id].EF - sch.T) < EPS) return [id];
      for (const s of p.succs[id]) if (ok(s) && Math.abs(tm[s].ES - tm[id].EF) < EPS) { const r = go(s); if (r) return [id].concat(r); }
      return null;
    };
    for (const a of p.activities) if (ok(a.id) && tm[a.id].ES < EPS) { const r = go(a.id); if (r) return r; }
    return null;
  }

  // ---------- Óptimo: modelo lineal de Klastorin (P3) ----------
  // Variables: comienzo S y fin F de cada actividad; dc ≤ F − S ≤ dn; S de cada actividad ≥ F de sus predecesoras de
  // la reducción transitiva; F ≤ T. Objetivo: Σ b·(dn − (F − S)). Con opts.base, las cotas son ±1 alrededor de base y
  // hay un coste ε por unidad movida (P4, movimiento).
  function reduction(p) {
    const anc = {};
    for (const a of p.activities) { anc[a.id] = new Set(); for (const x of p.preds[a.id]) { anc[a.id].add(x); for (const y of anc[x]) anc[a.id].add(y); } }
    return Object.fromEntries(p.activities.map((a) => [a.id, p.preds[a.id].filter((x) => !p.preds[a.id].some((y) => y !== x && anc[y].has(x)))]));
  }

  function solveModel(p, T, red, opts) {
    const acts = p.activities; const n = acts.length; const base = opts && opts.base;
    const ix = new Map(acts.map((a, i) => [a.id, i]));
    const nv = base ? 3 * n : 2 * n; const c = new Array(nv).fill(0); const rows = [];
    const vec = (pairs) => { const v = new Array(nv).fill(0); for (const [j, x] of pairs) v[j] += x; return v; };
    acts.forEach((a, i) => {
      const lo = base ? Math.max(a.dc, base[a.id] - 1) : a.dc; const hi = base ? Math.min(a.dn, base[a.id] + 1) : a.dn;
      c[i] += a.b; c[n + i] -= a.b;                                    // −b·(F − S)
      rows.push({ a: vec([[n + i, 1], [i, -1]]), op: '<=', b: hi });
      rows.push({ a: vec([[n + i, 1], [i, -1]]), op: '>=', b: lo });
      rows.push({ a: vec([[n + i, 1]]), op: '<=', b: T });
      for (const x of red[a.id]) rows.push({ a: vec([[n + ix.get(x), 1], [i, -1]]), op: '<=', b: 0 });
      if (base) {                                                      // u ≥ |F − S − base|, con coste ε
        c[2 * n + i] = 1e-6;
        rows.push({ a: vec([[n + i, 1], [i, -1], [2 * n + i, -1]]), op: '<=', b: base[a.id] });
        rows.push({ a: vec([[n + i, -1], [i, 1], [2 * n + i, -1]]), op: '<=', b: -base[a.id] });
      }
    });
    const x = Lp.simplex(c, rows);
    if (!x) return null;
    const d = Object.fromEntries(acts.map((a, i) => [a.id, Math.round(x[n + i] - x[i])]));
    return { d, cost: directCost(p, d) };
  }

  const optimum = (p, T, red) => solveModel(p, T, red || reduction(p));

  const normalD = (p) => Object.fromEntries(p.activities.map((a) => [a.id, a.dn]));
  const crashD = (p) => Object.fromEntries(p.activities.map((a) => [a.id, a.dc]));

  function curve(p) {
    const red = reduction(p);
    const Tn = schedule(p, normalD(p)).T; const Tm = schedule(p, crashD(p)).T;
    const out = [];
    for (let T = Tn; T >= Tm; T--) out.push(Object.assign({ T }, solveModel(p, T, red)));
    return out;
  }

  // ---------- Movimiento (P4): ±1 alrededor de base, con el modelo lineal ----------

  function move(p, base, T) {
    const r = solveModel(p, T, reduction(p), { base });
    if (!r) return null;
    const shorten = p.activities.filter((a) => r.d[a.id] < base[a.id]).map((a) => a.id);
    const lengthen = p.activities.filter((a) => r.d[a.id] > base[a.id]).map((a) => a.id);
    return { shorten, lengthen, cost: rnd(r.cost - directCost(p, base)) };
  }

  // ---------- La regla paso a paso ----------

  function rule(p) {
    const d = normalD(p); let prevD = Object.assign({}, d);
    const opt = new Map(curve(p).map((o) => [o.T, o.cost]));
    let sch = schedule(p, d);
    const steps = [];
    // Tope: cada paso quita al menos una unidad a alguna actividad (defensa ante un corte mal hecho, que si no daría
    // vueltas sin fin).
    const limit = p.activities.reduce((t, a) => t + a.dn - a.dc, 0);
    for (;;) {
      if (steps.length > limit) throw new Error('crash.rule: más pasos que unidades que se pueden quitar');
      const cut = ruleCut(p, d, sch);
      if (!cut) { steps.push({ end: true, T: sch.T, cost: directCost(p, d), path: stuckPath(p, d, sch), d: Object.assign({}, d) }); break; }
      const from = sch.T; const before = sch.criticalPaths.map((x) => x.join());
      for (const id of cut.set) d[id] -= 1;
      sch = schedule(p, d);
      const cost = directCost(p, d);
      const step = {
        from, T: sch.T, set: cut.set, stepCost: cut.cost, cost, opt: opt.get(sch.T), above: cost > opt.get(sch.T) + EPS,
        unique: cut.unique, other: cut.other, d: Object.assign({}, d),
        reached: cut.set.filter((id) => d[id] === p.byId[id].dc),
        newCrit: sch.criticalPaths.filter((x) => !before.includes(x.join())),
      };
      // El movimiento, solo en la primera duración en que la regla queda por encima (AC4; `analyze` B1): desde el
      // estado de la regla en el paso anterior, que todavía era óptimo.
      if (step.above && !steps.some((x) => x.above)) step.move = move(p, prevD, sch.T);
      steps.push(step);
      prevD = Object.assign({}, d);
    }
    return steps;
  }

  // ---------- Corrección del conjunto que predice el alumno (P9; `analyze` B3) ----------
  // Los datos del paso (lo que guarda la traza y usa predict): críticas, arcos ajustados entre críticas, las que
  // empiezan y acaban el proyecto, pendientes de las que se pueden acortar y el coste del corte mínimo.
  function stepData(p, d, sch, cut) {
    sch = sch || schedule(p, d);
    cut = cut === undefined ? ruleCut(p, d, sch) : cut;
    const tm = sch.times; const crit = p.activities.map((a) => a.id).filter((id) => sch.critical.includes(id));
    const edges = {}; const slopes = {};
    for (const id of crit) {
      edges[id] = p.succs[id].filter((x) => crit.includes(x) && Math.abs(tm[x].ES - tm[id].EF) < EPS);
      if (d[id] > p.byId[id].dc) slopes[id] = p.byId[id].b;
    }
    return { crit, edges, starts: crit.filter((id) => tm[id].ES < EPS), ends: crit.filter((id) => Math.abs(tm[id].EF - sch.T) < EPS),
      slopes, min: cut ? cut.cost : null };
  }

  // { ok, cost } o { ok: false, reason: notCritical | atLimit | pathUncut | dearer, … }, en ese orden.
  function setCheck(data, set) {
    const ids = [...new Set(set)];
    const notCrit = ids.filter((id) => !data.crit.includes(id));
    if (notCrit.length) return { ok: false, reason: 'notCritical', ids: data.crit.concat(notCrit).filter((x) => notCrit.includes(x)) };
    const atLimit = data.crit.filter((id) => ids.includes(id) && !(id in data.slopes));
    if (atLimit.length) return { ok: false, reason: 'atLimit', ids: atLimit };
    const inSet = new Set(ids);
    const go = (id) => {
      if (inSet.has(id)) return null;
      if (data.ends.includes(id)) return [id];
      for (const x of data.edges[id]) { const r = go(x); if (r) return [id].concat(r); }
      return null;
    };
    for (const s of data.starts) { const path = go(s); if (path) return { ok: false, reason: 'pathUncut', path }; }
    const cost = rnd(ids.reduce((t, id) => t + data.slopes[id], 0));
    if (data.min != null && cost > data.min + EPS) return { ok: false, reason: 'dearer', cost, best: data.min };
    return { ok: true, cost };
  }

  const checkSet = (p, d, set) => setCheck(stepData(p, d), set);

  // ---------- Atajo de Nicholas (P5) ----------
  // Todo urgente; de una en una, se alarga una unidad la actividad de mayor pendiente que no alarga el proyecto
  // (desempate: el orden de la tabla) y se vuelve a empezar, hasta que ninguna se puede alargar.
  function shortcut(p) {
    const d = crashD(p);
    const T = schedule(p, d).T;
    const order = p.activities.map((a, i) => [a, i]).sort((x, y) => y[0].b - x[0].b || x[1] - y[1]).map((x) => x[0]);
    const steps = [];
    for (let moved = true; moved;) {
      moved = false;
      for (const a of order) {
        if (d[a.id] >= a.dn) continue;
        d[a.id] += 1;
        if (schedule(p, d).T <= T) { steps.push({ id: a.id, saving: a.b }); moved = true; break; }
        d[a.id] -= 1;
      }
    }
    const units = {}; for (const s of steps) units[s.id] = (units[s.id] || 0) + 1;
    const cost = directCost(p, d); const opt = optimum(p, T).cost;
    return { T, crashCost: directCost(p, crashD(p)), cost, d, steps, units, opt, above: cost > opt + EPS };
  }

  // ---------- Costes totales (§0) ----------

  // ---------- Traza para el reproductor (P9) ----------
  // ctTable (duración y coste normales) → ctStep por cada unidad (caminos críticos de partida, candidatas con su
  // pendiente, conjunto, coste, óptimo, aviso; predicción de ct.set y ct.cost) → ctEnd (por qué termina) → ctTotals
  // (si hay costes del proyecto).
  function trace(p, k) {
    const steps = rule(p); const d0 = normalD(p); const sch0 = schedule(p, d0);
    const out = [{ kind: 'ctTable', reveals: [], T: sch0.T, cost: directCost(p, d0), paths: sch0.criticalPaths, critical: sch0.critical }];
    let d = d0; let sch = sch0;
    for (const s of steps) {
      if (s.end) { out.push({ kind: 'ctEnd', reveals: [], T: s.T, cost: s.cost, path: s.path, d: s.d }); break; }
      const check = stepData(p, d, sch);
      const cand = check.crit.map((id) => ({ id, b: p.byId[id].b, can: id in check.slopes }));
      out.push(Object.assign({ kind: 'ctStep', paths: sch.criticalPaths, critical: sch.critical, cand, dBefore: d }, s, {
        reveals: [{ field: 'ct.set', value: s.set, check }, { field: 'ct.cost', value: s.stepCost }],
      }));
      d = s.d; sch = schedule(p, d);
    }
    if (hasCosts(k)) { const rows = totals(p, k); out.push({ kind: 'ctTotals', reveals: [], rows, best: best(p, k, null, rows) }); }
    return out;
  }

  const hasCosts = (k) => !!k && ['fixed', 'perUnit', 'due', 'penalty', 'bonus'].some((x) => k[x] != null && k[x] !== '' && Number(k[x]) !== 0);

  const val = (v) => (v == null || v === '' || !Number.isFinite(Number(v)) ? 0 : Number(v));
  function totals(p, k, cur) {
    k = k || {};
    const hasDue = k.due != null && k.due !== '' && Number.isFinite(Number(k.due));
    return (cur || curve(p)).map((o) => {
      const ind = rnd(val(k.fixed) + val(k.perUnit) * o.T);
      const pen = hasDue ? rnd(val(k.penalty) * Math.max(0, o.T - Number(k.due))) : 0;
      const bonus = hasDue ? rnd(val(k.bonus) * Math.max(0, Number(k.due) - o.T)) : 0;
      return { T: o.T, direct: o.cost, ind, pen, bonus, total: rnd(o.cost + ind + pen - bonus) };
    });
  }

  function best(p, k, cur, rows) {
    const t = rows || totals(p, k, cur); const min = Math.min(...t.map((x) => x.total));
    return t.filter((x) => x.total <= min + EPS).map((x) => x.T).sort((a, b) => a - b);
  }

  const api = { EPS, parse, schedule, directCost, ruleCut, reduction, optimum, curve, move, rule, shortcut, totals, best, trace, stepData, setCheck, checkSet, normalD, crashD };
  root.PNL = root.PNL || {};
  root.PNL.crash = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
