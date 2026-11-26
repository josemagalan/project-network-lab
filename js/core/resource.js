/*
 * core/resource — recursos: nivelación y programación con recursos limitados (spec f5c-recursos; plan §0, §3, P1–P9).
 *   parse(rows, res, mode) → { project, report }
 *       rows = [{ id, name?, links, d, r1, r2, r3 }] en texto, como el taller (P1); res = [{ name, cap }] (1 a 3; cap
 *       vacía = sin límite, `analyze` C5); mode = 'lev' | 'lim'. project = { activities: [{ id, name, d, r }] en orden
 *       topológico, preds, succs, byId, res: [{ name, cap|null }], T, times: { id: { ES, EF, LS, LF, TF } } }.
 *       Errores: los de core/project (badId, reservedId, duplicateId, unknownRef, tooMany, cycle) y badDuration
 *       (entero de 0 a 999), badUse (entero de 0 a 999), overCap (con 'lim', un uso mayor que la disponibilidad) y,
 *       sin fila, badCap; aviso noUse (todos los usos vacíos: valen 0).
 *   profile(p, S, k) → uso del recurso k en cada periodo 1 … T' (T' = fin del calendario S; S = { id: comienzo })
 *   stats(u) → { peak, ssq, work }
 *   check(p, S, mode, id?) → { ok: true } | { ok: false, reason: pred | succ | late | over, … } (P3)
 *   baker(p) → { list: [{ k, W, wasteStart, wasteEnd, Dmin, Rmin }], bound } (Klastorin, figuras 8.6 y 8.7)
 *   burgess(p, k) → { S, steps: [{ id, from, to, window, options: [{ s, ssq }], before, after }], passes } (P4)
 *   minPeak(p, k, budget?) → { peak, S, lb, proved, nodes } (P5, P6; tope BUDGET nodos)
 *   sgs(p, { scheme: 's'|'p', dir: 'f'|'b', rule | list }) → { S, T, steps } (P7) · compare(p) → [{ scheme, dir, rule, T }]
 *   optimum(p, budget?) → { T, S, lb, proved, nodes } (P5, P6) · chains(p, S) → [[ids]] (P8)
 * Periodos enteros: una actividad que empieza en s ocupa los periodos s+1 … s+d (internamente, [s, s+d)). Sin DOM ni azar.
 */
(function (root) {
  'use strict';

  const G = root.PNL || {};
  const Pr = G.project || (typeof require !== 'undefined' ? require('./project.js') : null);
  const Cpm = G.cpm || (typeof require !== 'undefined' ? require('./cpm.js') : null);

  const MAX = 999;          // duración y usos
  const MAX_CAP = 9999;     // disponibilidad por periodo
  const INT_RE = /^\d+$/;
  const str = (v) => (v == null ? '' : String(v));
  const USE = ['r1', 'r2', 'r3'];
  const intIn = (s, lo, hi) => INT_RE.test(s) && Number(s) >= lo && Number(s) <= hi;

  // ---------- Lectura (P1) ----------

  const blank = (r) => ['id', 'links', 'd', ...USE].every((k) => !str(r[k]).trim());

  function parse(rows, res, mode) {
    if (!Array.isArray(res) || res.length < 1 || res.length > 3) throw new Error('resource.parse: de 1 a 3 recursos');
    const errors = []; const warnings = []; const fields = new Map();
    const caps = res.map((x, k) => {
      const c = str(x.cap).trim();
      if (!c) return null;
      if (!intIn(c, 1, MAX_CAP)) { errors.push({ code: 'badCap', row: null, ids: [], res: [k] }); return null; }
      return Number(c);
    });
    rows.forEach((r, i) => {
      if (blank(r)) return;
      const id = str(r.id).trim().toUpperCase();
      const err = (code, extra) => errors.push(Object.assign({ code, row: i, ids: [id] }, extra || {}));
      const d = str(r.d).trim();
      const f = { d: intIn(d, 0, MAX) ? Number(d) : null, r: [] };
      if (f.d === null) err('badDuration');
      const uses = res.map((_, k) => str(r[USE[k]]).trim());
      if (uses.every((u) => !u)) warnings.push({ code: 'noUse', row: i, ids: [id] });
      const bad = []; const over = [];
      uses.forEach((u, k) => {
        if (u && !intIn(u, 0, MAX)) { bad.push(k); f.r.push(0); return; }
        const v = u ? Number(u) : 0;
        f.r.push(v);
        if (mode === 'lim' && caps[k] != null && v > caps[k] && f.d !== 0) over.push(k);   // un hito no ocupa ningún periodo
      });
      if (bad.length) err('badUse', { res: bad });
      if (over.length) err('overCap', { res: over });
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
    const byIdF = Object.fromEntries(st.project.activities.map((a) => [a.id, fields.get(rowOf.get(a.id))]));
    const s = Cpm.solve({ activities: st.project.activities.map((a) => ({ id: a.id, name: a.name, d: byIdF[a.id].d })), preds: st.project.preds, succs: st.project.succs });
    const activities = s.order.map((id) => {
      const a = st.project.activities.find((x) => x.id === id);
      return { id, name: a.name || '', d: byIdF[id].d, r: byIdF[id].r };
    });
    const times = Object.fromEntries(activities.map((a) => {
      const t = s.times[a.id];
      return [a.id, { ES: t.ES, EF: t.EF, LS: t.LS, LF: t.LF, TF: s.floats[a.id].TF }];
    }));
    const project = {
      activities, preds: st.project.preds, succs: st.project.succs, byId: Object.fromEntries(activities.map((a) => [a.id, a])),
      res: res.map((x, k) => ({ name: str(x.name), cap: caps[k] })), T: s.duration, times,
      table: rows.filter((r) => !blank(r)).map((r) => str(r.id).trim().toUpperCase()),   // orden de la tabla (desempates)
    };
    const warn = warnings.concat(st.report.warnings.filter((w) => w.code !== 'redundant')).sort((a, b) => a.row - b.row);
    return { project, report: { errors: [], warnings: warn } };
  }

  // ---------- Perfiles (P2) ----------

  const end = (p, S) => Math.max(0, ...p.activities.map((a) => S[a.id] + a.d));

  function profile(p, S, k, T) {
    const u = new Array(T == null ? end(p, S) : T).fill(0);
    for (const a of p.activities) for (let t = S[a.id]; t < S[a.id] + a.d; t++) u[t] += a.r[k];
    return u;
  }

  const stats = (u) => ({ peak: Math.max(0, ...u), ssq: u.reduce((s, x) => s + x * x, 0), work: u.reduce((s, x) => s + x, 0) });

  // ---------- Comprobación de un calendario (P3) ----------
  // Sin id, todo el calendario; con id, solo lo que toca a esa actividad (un movimiento a mano). Orden de los motivos:
  // predecesora sin acabar, sucesora adelantada, fin después de T (nivelación) y periodo que se pasa (recursos limitados).
  function check(p, S, mode, id) {
    const acts = id ? [p.byId[id]] : p.activities;
    for (const a of acts) {
      for (const x of p.preds[a.id]) if (S[a.id] < S[x] + p.byId[x].d) return { ok: false, reason: 'pred', ids: [x, a.id] };
      if (id) for (const x of p.succs[a.id]) if (S[x] < S[a.id] + a.d) return { ok: false, reason: 'succ', ids: [a.id, x] };
    }
    if (mode === 'lev') {
      for (const a of acts) if (S[a.id] + a.d > p.T) return { ok: false, reason: 'late', ids: [a.id] };
    } else {
      const span = id ? [S[id], S[id] + p.byId[id].d] : [0, end(p, S)];
      for (let k = 0; k < p.res.length; k++) {
        const cap = p.res[k].cap;
        if (cap == null) continue;
        const u = profile(p, S, k, Math.max(end(p, S), span[1]));
        for (let t = span[0]; t < span[1]; t++) if (u[t] > cap) return { ok: false, reason: 'over', res: k, period: t + 1, use: u[t], cap };
      }
    }
    return { ok: true };
  }

  // ---------- Cota de Baker (Klastorin, figuras 8.6 y 8.7) ----------
  // Para cada recurso con límite R: el trabajo W, las unidades que se desperdician al principio del calendario temprano
  // (hasta el primer periodo que se pasa de R) y al final del tardío (desde el último que se pasa), y de ahí la duración
  // mínima ⌈(W + desperdicio) / R⌉ y, con la duración del CPM, los recursos mínimos ⌈(W + desperdicio) / T⌉.
  function baker(p) {
    const ES = Object.fromEntries(p.activities.map((a) => [a.id, p.times[a.id].ES]));
    const LS = Object.fromEntries(p.activities.map((a) => [a.id, p.times[a.id].LS]));
    const list = [];
    p.res.forEach((x, k) => {
      const R = x.cap;
      if (R == null) return;
      const ue = profile(p, ES, k, p.T); const ul = profile(p, LS, k, p.T);
      const W = ue.reduce((s, v) => s + v, 0);
      let TE = 0; let wasteStart = 0;
      for (; TE < ue.length && ue[TE] <= R; TE++) wasteStart += R - ue[TE];
      // El desperdicio del final, solo en periodos que no ha contado el del principio (si no, contaría dos veces el
      // mismo hueco: sin ningún periodo que se pase, la cota es la duración del CPM).
      let wasteEnd = 0;
      for (let t = ul.length - 1; t >= TE && ul[t] <= R; t--) wasteEnd += R - ul[t];
      const waste = wasteStart + wasteEnd;
      list.push({ k, W, wasteStart, wasteEnd, Dmin: Math.ceil((W + waste) / R - 1e-9), Rmin: p.T ? Math.ceil((W + waste) / p.T - 1e-9) : 0 });
    });
    return { list, bound: Math.max(p.T, ...list.map((b) => b.Dmin)) };
  }

  // ---------- Nivelación (P4) ----------

  const ESof = (p) => Object.fromEntries(p.activities.map((a) => [a.id, p.times[a.id].ES]));

  // Burgess: en cada pasada, de mayor a menor comienzo temprano (empate: el orden de la tabla al revés), cada actividad
  // va al comienzo, entre el fin de sus predecesoras y el comienzo de sus sucesoras (sin pasar de T), que da la menor
  // suma de cuadrados del recurso k; con empate, el más tardío. Se repite hasta una pasada sin movimientos. Un paso por
  // actividad con hueco (las demás no pueden moverse).
  function burgess(p, k) {
    const S = ESof(p); const steps = [];
    const idx = new Map(p.activities.map((a, i) => [a.id, i]));
    const order = [...p.activities].sort((x, y) => p.times[y.id].ES - p.times[x.id].ES || idx.get(y.id) - idx.get(x.id));
    let passes = 0;
    for (let moved = true; moved && passes < 1000;) {
      moved = false; passes += 1;
      for (const a of order) {
        const lo = Math.max(0, ...p.preds[a.id].map((x) => S[x] + p.byId[x].d));
        const hi = Math.min(p.T, ...p.succs[a.id].map((x) => S[x])) - a.d;
        if (hi <= lo) continue;
        const base = profile(p, S, k, p.T);
        for (let t = S[a.id]; t < S[a.id] + a.d; t++) base[t] -= a.r[k];
        const options = [];
        for (let s0 = lo; s0 <= hi; s0++) {
          let q = 0;
          for (let t = 0; t < p.T; t++) { const v = base[t] + (t >= s0 && t < s0 + a.d ? a.r[k] : 0); q += v * v; }
          options.push({ s: s0, ssq: q });
        }
        const before = options.find((o) => o.s === S[a.id]).ssq;
        const after = Math.min(...options.map((o) => o.ssq));
        const to = Math.max(...options.filter((o) => o.ssq === after).map((o) => o.s));
        steps.push({ id: a.id, pass: passes, from: S[a.id], to, window: [lo, hi], options, before, after });
        if (to !== S[a.id]) { S[a.id] = to; moved = true; }
      }
    }
    return { S, steps, passes };
  }

  // ---------- Búsquedas exactas como factibilidad (P5, P6) ----------
  // ¿Hay un calendario de las actividades, cada una en una ventana [lo, hi] que se recalcula con las ya colocadas, en el
  // que ningún periodo pasa de lim[k]? Búsqueda en profundidad: se colocan de menor a mayor holgura (desempate: mayor uso ×
  // duración, y el orden de la tabla); en cada nodo, las partes obligatorias de las no colocadas ([hi, lo + d)) no pueden
  // pasar de lim. counter.n cuenta los nodos y corta al llegar a counter.max.
  const BUDGET = 300000;
  class Cut extends Error {}

  function feasible(p, opts, counter) {
    const { lim, LS, H } = opts;              // lim por recurso (null = sin límite), comienzo tardío de cada una, horizonte
    const acts = p.activities; const n = acts.length; const ix = new Map(acts.map((a, i) => [a.id, i]));
    const ks = lim.map((v, k) => (v == null ? -1 : k)).filter((k) => k >= 0);
    const slack = (a) => LS[a.id] - p.times[a.id].ES;
    const weight = (a) => ks.reduce((t, k) => t + a.r[k], 0) * a.d;
    const order = acts.map((a, i) => [a, i]).sort((x, y) => slack(x[0]) - slack(y[0]) || weight(y[0]) - weight(x[0]) || x[1] - y[1]).map((x) => x[0]);
    const S = new Array(n).fill(-1);
    const u = ks.map(() => new Array(H).fill(0));
    const lo = new Array(n); const hi = new Array(n);
    function windows() {
      for (const a of acts) { const i = ix.get(a.id); lo[i] = S[i] >= 0 ? S[i] : Math.max(p.times[a.id].ES, ...p.preds[a.id].map((x) => lo[ix.get(x)] + p.byId[x].d)); }
      for (let j = n - 1; j >= 0; j--) { const a = acts[j]; hi[j] = S[j] >= 0 ? S[j] : Math.min(LS[a.id], ...p.succs[a.id].map((x) => hi[ix.get(x)] - a.d)); }
    }
    function compulsory() {
      for (let i = 0; i < n; i++) if (lo[i] > hi[i]) return false;
      for (let q = 0; q < ks.length; q++) {
        const k = ks[q]; const v = u[q].slice();
        for (let i = 0; i < n; i++) {
          if (S[i] >= 0 || !acts[i].r[k]) continue;
          for (let t = hi[i]; t < lo[i] + acts[i].d; t++) { v[t] += acts[i].r[k]; if (v[t] > lim[k]) return false; }
        }
      }
      return true;
    }
    const fits = (a, s0) => { for (let q = 0; q < ks.length; q++) for (let t = s0; t < s0 + a.d; t++) if (u[q][t] + a.r[ks[q]] > lim[ks[q]]) return false; return true; };
    const add = (a, s0, sign) => { for (let q = 0; q < ks.length; q++) for (let t = s0; t < s0 + a.d; t++) u[q][t] += sign * a.r[ks[q]]; };
    function go(depth) {
      if (++counter.n > counter.max) throw new Cut();
      if (depth === n) return true;
      windows();
      if (!compulsory()) return false;
      const a = order[depth]; const i = ix.get(a.id);
      const from = lo[i]; const to = hi[i];
      for (let s0 = from; s0 <= to; s0++) {
        if (!fits(a, s0)) continue;
        add(a, s0, 1); S[i] = s0;
        if (go(depth + 1)) return true;
        add(a, s0, -1); S[i] = -1;
      }
      return false;
    }
    return go(0) ? Object.fromEntries(acts.map((a, i) => [a.id, S[i]])) : null;
  }

  const LSof = (p) => Object.fromEntries(p.activities.map((a) => [a.id, p.times[a.id].LS]));

  // Pico mínimo del recurso k sin alargar el proyecto: se prueba P desde la cota hacia arriba. Cota: el mayor uso, el
  // trabajo repartido en T y el pico de las partes obligatorias del calendario del CPM. Si se agota el tope, lo mejor
  // conocido (Burgess o el temprano) y la cota a la que se había llegado.
  function minPeak(p, k, budget) {
    const counter = { n: 0, max: budget == null ? BUDGET : budget };
    const work = p.activities.reduce((t, a) => t + a.r[k] * a.d, 0);
    const mand = new Array(p.T).fill(0);
    for (const a of p.activities) for (let t = p.times[a.id].LS; t < p.times[a.id].ES + a.d; t++) mand[t] += a.r[k];
    // Un hito (d = 0) no ocupa ningún periodo: su uso no cuenta.
    const lb0 = Math.max(0, ...p.activities.filter((a) => a.d > 0).map((a) => a.r[k]), p.T ? Math.ceil(work / p.T) : 0, ...mand);
    const bur = burgess(p, k).S;
    const cands = [ESof(p), bur].map((S) => ({ S, peak: stats(profile(p, S, k, p.T)).peak })).sort((x, y) => x.peak - y.peak);
    let best = cands[0];
    const LS = LSof(p);
    let P = lb0;
    try {
      for (; P < best.peak; P++) {
        const lim = p.res.map((_, j) => (j === k ? P : null));
        const S = feasible(p, { lim, LS, H: p.T }, counter);
        if (S) { best = { S, peak: P }; break; }
      }
    } catch (e) {
      if (!(e instanceof Cut)) throw e;
      return { peak: best.peak, S: best.S, lb: Math.min(P, best.peak), proved: false, nodes: counter.n };
    }
    return { peak: best.peak, S: best.S, lb: lb0, proved: true, nodes: counter.n };
  }

  // ---------- Esquemas serie y paralelo (P7) ----------
  // Reglas de prioridad: menor clave primero; desempate, el orden de la tabla. Las claves usan los tiempos del CPM del
  // proyecto que se programa (hacia atrás, los de la red invertida).
  const RULES = {
    slk: (q) => (a) => [q.times[a.id].TF, q.times[a.id].LS],       // menor holgura total
    lft: (q) => (a) => [q.times[a.id].LF, q.times[a.id].TF],       // menor fin tardío
    spt: () => (a) => [a.d],                                       // menor duración
    res: () => (a) => [-a.r.reduce((t, v) => t + v, 0)],           // más recursos (suma de usos)
    act: (q) => (a) => [q.times[a.id].LS - q.T],                   // camino más largo hasta el final (ACTIM)
    esf: (q) => (a) => [q.times[a.id].ES],                         // lo antes posible
    lsf: (q) => (a) => [q.times[a.id].LS],                         // comienzo tardío
  };
  const RULE_IDS = Object.keys(RULES);

  // La red invertida (hacia atrás): predecesoras y sucesoras cambiadas, con sus tiempos del CPM.
  function reversed(p) {
    const s = Cpm.solve({ activities: p.activities.map((a) => ({ id: a.id, d: a.d })), preds: p.succs, succs: p.preds });
    const times = Object.fromEntries(p.activities.map((a) => [a.id, { ES: s.times[a.id].ES, EF: s.times[a.id].EF, LS: s.times[a.id].LS, LF: s.times[a.id].LF, TF: s.floats[a.id].TF }]));
    return Object.assign({}, p, { preds: p.succs, succs: p.preds, times, T: s.duration });
  }

  function schedule(q, opts) {
    const caps = q.res.map((r) => r.cap);
    const ks = caps.map((c, k) => (c == null ? -1 : k)).filter((k) => k >= 0);
    const pos = new Map(q.table.map((id, i) => [id, i]));
    let cmp;
    if (opts.list) { const at = new Map(opts.list.map((id, i) => [id, i])); cmp = (x, y) => at.get(x.id) - at.get(y.id); }
    else {
      const key = RULES[opts.rule](q);
      cmp = (x, y) => { const a = key(x); const b = key(y); for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] - b[i]; return pos.get(x.id) - pos.get(y.id); };
    }
    const u = ks.map(() => []);
    const fits = (a, s0) => { for (let j = 0; j < ks.length; j++) for (let t = s0; t < s0 + a.d; t++) if ((u[j][t] || 0) + a.r[ks[j]] > caps[ks[j]]) return false; return true; };
    const blocker = (a, s0) => { for (let t = s0; t < s0 + a.d; t++) for (let j = 0; j < ks.length; j++) if ((u[j][t] || 0) + a.r[ks[j]] > caps[ks[j]]) return { res: ks[j], period: t + 1, use: (u[j][t] || 0) + a.r[ks[j]], cap: caps[ks[j]] }; return null; };
    const put = (a, s0) => { for (let j = 0; j < ks.length; j++) for (let t = s0; t < s0 + a.d; t++) u[j][t] = (u[j][t] || 0) + a.r[ks[j]]; };
    const S = {}; const steps = []; const table = q.table.map((id) => q.byId[id]);
    const prio = (a) => (opts.list ? null : RULES[opts.rule](q)(a)[0]);
    // Datos para corregir la predicción (opts.record): la clave de prioridad de cada elegible y el uso de los recursos
    // con límite antes de colocar.
    const keyOf = opts.list ? (a) => [opts.list.indexOf(a.id)] : RULES[opts.rule](q);
    const snap = () => ks.map((k, j) => ({ k, cap: caps[k], u: u[j].slice() }));
    if (opts.scheme === 's') {
      while (steps.length < table.length) {
        const elig = table.filter((a) => !(a.id in S) && q.preds[a.id].every((x) => x in S)).sort(cmp);
        const a = elig[0];
        const ready = Math.max(0, ...q.preds[a.id].map((x) => S[x] + q.byId[x].d));
        let s0 = ready; const waits = [];
        const before = opts.record ? snap() : null;
        while (!fits(a, s0)) { waits.push(blocker(a, s0)); s0++; }
        S[a.id] = s0; put(a, s0);
        const step = { id: a.id, ready, start: s0, wait: waits[0] || null, elig: elig.map((x) => ({ id: x.id, prio: prio(x) })) };
        if (opts.record) {
          step.pick = { elig: elig.map((x) => ({ id: x.id, key: keyOf(x) })), all: table.filter((x) => !(x.id in S) || x === a).map((x) => x.id) };
          step.place = { kind: 's', id: a.id, ready, start: s0, d: a.d, r: a.r, res: before };
        }
        steps.push(step);
      }
    } else {
      let t = 0;
      while (Object.keys(S).length < table.length) {
        // Un hito (d = 0) acaba en el mismo instante: sus sucesoras se miran en ese instante (se repite mientras empiece
        // alguno).
        let elig; const started = []; let waiting; let again = true;
        const before = opts.record ? snap() : null;
        const eligAt = new Set();
        while (again) {
          again = false; waiting = [];
          elig = table.filter((a) => !(a.id in S) && q.preds[a.id].every((x) => x in S && S[x] + q.byId[x].d <= t)).sort(cmp);
          for (const a of elig) eligAt.add(a.id);
          for (const a of elig) {
            if (fits(a, t)) { S[a.id] = t; put(a, t); started.push(a.id); if (!a.d) again = true; } else waiting.push({ id: a.id, block: blocker(a, t) });
          }
        }
        const seen = new Set(); const all = started.map((id) => q.byId[id]).concat(waiting.map((w) => q.byId[w.id])).filter((a) => !seen.has(a.id) && seen.add(a.id)).sort(cmp);
        const step = { t, elig: all.map((x) => ({ id: x.id, prio: prio(x) })), started, waiting };
        if (opts.record) {
          step.set = { t, elig: all.map((x) => ({ id: x.id, key: keyOf(x), d: x.d, r: x.r, preds: q.preds[x.id] })), res: before, started: started.slice(),
            done: Object.fromEntries(Object.keys(S).filter((id) => !started.includes(id)).map((id) => [id, S[id] + q.byId[id].d])) };
        }
        steps.push(step);
        const next = q.activities.filter((a) => a.id in S && S[a.id] + a.d > t).map((a) => S[a.id] + a.d);
        t = next.length ? Math.min(...next) : t + 1;
      }
    }
    return { S, T: end(q, S), steps };
  }

  function sgs(p, opts) {
    if (opts.dir !== 'b') return schedule(p, opts);
    // Hacia atrás, los pasos van en el tiempo de la red invertida (desde el final).
    const r = schedule(reversed(p), opts);
    const S = Object.fromEntries(p.activities.map((a) => [a.id, r.T - r.S[a.id] - a.d]));
    return { S, T: r.T, steps: r.steps, reversed: true };
  }

  function compare(p) {
    const out = [];
    for (const scheme of ['s', 'p']) for (const dir of ['f', 'b']) for (const rule of RULE_IDS) out.push({ scheme, dir, rule, T: sgs(p, { scheme, dir, rule }).T });
    return out;
  }

  // Duración mínima con las disponibilidades: se prueba D desde la cota (CPM y Baker) hasta la mejor regla. Si se agota
  // el tope, la mejor regla y la cota a la que se había llegado.
  function optimum(p, budget) {
    const counter = { n: 0, max: budget == null ? BUDGET : budget };
    let best = null;
    for (const c of compare(p)) if (!best || c.T < best.T) best = c;
    best = Object.assign({}, best, { S: sgs(p, best).S });
    const lim = p.res.map((r) => r.cap);
    const lb0 = baker(p).bound;
    if (lim.every((c) => c == null)) return { T: p.T, S: ESof(p), lb: p.T, proved: true, nodes: 0 };
    let D = lb0;
    try {
      for (; D < best.T; D++) {
        const LS = Object.fromEntries(p.activities.map((a) => [a.id, p.times[a.id].LS + (D - p.T)]));
        const S = feasible(p, { lim, LS, H: D }, counter);
        if (S) return { T: D, S: leftJustify(p, S), lb: lb0, proved: true, nodes: counter.n };
      }
    } catch (e) {
      if (!(e instanceof Cut)) throw e;
      return { T: best.T, S: best.S, lb: D, proved: false, nodes: counter.n };
    }
    return { T: best.T, S: best.S, lb: lb0, proved: true, nodes: counter.n };
  }

  // Pega al comienzo un calendario válido: de la que empieza antes a la que empieza después, cada una al primer comienzo
  // que respeta sus predecesoras y cabe con las demás. Nunca se alarga, y la cadena crítica se puede leer en él.
  function leftJustify(p, S0) {
    const S = Object.assign({}, S0);
    const ks = p.res.map((r, k) => (r.cap == null ? -1 : k)).filter((k) => k >= 0);
    for (let moved = true; moved;) {
      moved = false;
      for (const a of [...p.activities].sort((x, y) => S[x.id] - S[y.id])) {
        const ready = Math.max(0, ...p.preds[a.id].map((x) => S[x] + p.byId[x].d));
        for (let s0 = ready; s0 < S[a.id]; s0++) {
          const others = Object.assign({}, S); delete others[a.id];
          const ok = ks.every((k) => { for (let t = s0; t < s0 + a.d; t++) { let v = a.r[k]; for (const b of p.activities) if (b !== a && S[b.id] <= t && t < S[b.id] + b.d) v += b.r[k]; if (v > p.res[k].cap) return false; } return true; });
          if (ok) { S[a.id] = s0; moved = true; break; }
        }
      }
    }
    return S;
  }

  // ---------- Cadena crítica (P8) ----------
  // j «espera» a i si j empieza justo cuando i acaba y, además, i precede a j, o j no cabía un periodo antes por un
  // recurso con límite que usan las dos (en un calendario pegado al comienzo, si j no cabía un periodo antes, el periodo
  // que fallaba es ese, y alguna de las que acaban justo entonces usa el recurso). Una cadena va de una que empieza en 0 a una que acaba
  // al final del calendario, de espera en espera.
  function chains(p, S, dir) {
    // Hacia atrás, el calendario está pegado al final: la cadena se busca en la red invertida y se da la vuelta.
    if (dir === 'b') {
      const T0 = end(p, S); const q = reversed(p);
      return chains(q, Object.fromEntries(p.activities.map((a) => [a.id, T0 - S[a.id] - a.d]))).map((c) => c.slice().reverse());
    }
    const T = end(p, S);
    const u = p.res.map((_, k) => profile(p, S, k, T));
    const waits = new Map(p.activities.map((a) => [a.id, []]));
    for (const j of p.activities) {
      if (S[j.id] === 0) continue;
      const t = S[j.id] - 1;
      for (const i of p.table.map((id) => p.byId[id])) {
        if (i === j || S[i.id] + i.d !== S[j.id]) continue;
        if (p.preds[j.id].includes(i.id)) { waits.get(j.id).push(i.id); continue; }
        // j no cabía un periodo antes (en ese periodo se pasaba de lo disponible de un recurso que usan las dos).
        const blocked = p.res.some((r, k) => r.cap != null && j.r[k] && i.r[k] && u[k][t] + j.r[k] > r.cap);
        if (blocked) waits.get(j.id).push(i.id);
      }
    }
    const out = [];
    const walk = (id, path) => {
      if (out.length >= 50) return;
      const ws = waits.get(id);
      if (!ws.length) { if (S[id] === 0) out.push([id].concat(path)); return; }
      for (const x of ws) walk(x, [id].concat(path));
    };
    for (const id of p.table) if (S[id] + p.byId[id].d === T) walk(id, []);
    return out;
  }

  // ---------- Traza para el reproductor y corrección de la predicción (P9; `analyze` C4) ----------
  // Burgess: rsTable → rsMove por cada actividad con hueco (predicción de rs.start) → rsEnd. Esquema serie: rsTable →
  // rsPick por actividad (rs.pick y rs.start) → rsEnd. Paralelo: rsTable → rsTime por instante con elegibles (rs.set) →
  // rsEnd. Cada reveal lleva en check lo que hace falta para corregir (pickCheck, startCheck, setCheck).
  function trace(p, opts) {
    const out = [{ kind: 'rsTable', reveals: [], T: p.T, S: ESof(p) }];
    if (opts.kind === 'bur') {
      const b = burgess(p, opts.k); const S = ESof(p);
      for (const st of b.steps) {
        S[st.id] = st.to;
        out.push(Object.assign({ kind: 'rsMove', S: Object.assign({}, S) }, st, { reveals: [{ field: 'rs.start', value: st.to, check: { kind: 'b', id: st.id, window: st.window, options: st.options } }] }));
      }
      out.push({ kind: 'rsEnd', reveals: [], S: b.S, passes: b.passes, stats: stats(profile(p, b.S, opts.k, p.T)) });
      return out;
    }
    const q = opts.dir === 'b' ? reversed(p) : p;
    const r = schedule(q, Object.assign({}, opts, { record: true }));
    const S = {};
    for (const st of r.steps) {
      if (opts.scheme === 's') {
        S[st.id] = st.start;
        out.push(Object.assign({ kind: 'rsPick', S: Object.assign({}, S) }, st, { reveals: [{ field: 'rs.pick', value: st.id, check: st.pick }, { field: 'rs.start', value: st.start, check: st.place }] }));
      } else {
        for (const id of st.started) S[id] = st.t;
        // Un instante en que no cabe ninguna se cuenta, pero no se pregunta.
        if (st.elig.length) out.push(Object.assign({ kind: 'rsTime', S: Object.assign({}, S) }, st, { reveals: st.started.length ? [{ field: 'rs.set', value: st.started, check: st.set }] : [] }));
      }
    }
    const fin = opts.dir === 'b' ? Object.fromEntries(p.activities.map((a) => [a.id, r.T - r.S[a.id] - a.d])) : r.S;
    out.push({ kind: 'rsEnd', reveals: [], S: fin, T: r.T, bound: baker(p).bound, chains: chains(p, fin, opts.dir), reversed: opts.dir === 'b' });
    return out;
  }

  const sameKey = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);
  const lessKey = (a, b) => { for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] < b[i]; return false; };

  // rs.pick: la elegida o una empatada con ella (misma clave).
  function pickCheck(c, id) {
    const best = c.elig[0];
    const e = c.elig.find((x) => x.id === id);
    if (!e) return { ok: false, reason: 'notElig', id };
    if (sameKey(e.key, best.key)) return { ok: true };
    return { ok: false, reason: 'lower', id, best: c.elig.filter((x) => sameKey(x.key, best.key)).map((x) => x.id) };
  }

  const overAt = (res, a, s0) => {
    for (let t = s0; t < s0 + a.d; t++) for (const x of res) if ((x.u[t] || 0) + a.r[x.k] > x.cap) return { res: x.k, period: t + 1, use: (x.u[t] || 0) + a.r[x.k], cap: x.cap };
    return null;
  };

  // rs.start: en el esquema serie, el primer comienzo que respeta las predecesoras y cabe; en Burgess, cualquiera de los
  // de menor suma de cuadrados en la ventana.
  function startCheck(c, s0) {
    if (c.kind === 'b') {
      if (s0 < c.window[0] || s0 > c.window[1]) return { ok: false, reason: 'window', window: c.window };
      const min = Math.min(...c.options.map((o) => o.ssq));
      const o = c.options.find((x) => x.s === s0);
      return o.ssq === min ? { ok: true } : { ok: false, reason: 'ssq', ssq: o.ssq, best: min };
    }
    if (s0 < c.ready) return { ok: false, reason: 'preds', ready: c.ready };
    if (s0 === c.start) return { ok: true };
    const over = overAt(c.res, c, s0);
    if (over) return Object.assign({ ok: false, reason: 'over' }, over);
    return { ok: false, reason: 'later', start: c.start };
  }

  // rs.set: el conjunto que empieza en el instante t del esquema paralelo; vale el de cualquier orden de prioridad que
  // solo cambie el de las empatadas.
  function setCheck(c, ids) {
    const given = [...new Set(ids)];
    const by = new Map(c.elig.map((x) => [x.id, x]));
    const notElig = given.filter((id) => !by.has(id));
    if (notElig.length) return { ok: false, reason: 'notElig', ids: notElig };
    const greedy = (order) => {
      const res = c.res.map((x) => ({ k: x.k, cap: x.cap, u: x.u.slice() })); const out = [];
      for (const a of order) if (!overAt(res, a, c.t)) { out.push(a.id); for (const x of res) for (let t = c.t; t < c.t + a.d; t++) x.u[t] = (x.u[t] || 0) + a.r[x.k]; }
      return out;
    };
    // Grupos de empatadas, en el orden de prioridad; se prueban sus permutaciones (como mucho 720 órdenes).
    const groups = [];
    for (const x of c.elig) { const g = groups[groups.length - 1]; if (g && sameKey(g[0].key, x.key)) g.push(x); else groups.push([x]); }
    const perms = (arr) => (arr.length <= 1 ? [arr] : arr.flatMap((x, i) => perms(arr.filter((_, j) => j !== i)).map((r) => [x].concat(r))));
    let orders = [[]];
    for (const g of groups) { const ps = perms(g); orders = orders.flatMap((o) => ps.map((pp) => o.concat(pp))); if (orders.length > 720) { orders = [c.elig]; break; } }
    const want = given.slice().sort().join();
    if (orders.some((o) => greedy(o).slice().sort().join() === want)) return { ok: true };
    // Por qué no: no caben juntas, falta una que cabía o se ha dejado fuera una de más prioridad.
    const res = c.res.map((x) => ({ k: x.k, cap: x.cap, u: x.u.slice() }));
    for (const id of given) {
      const a = by.get(id); const over = overAt(res, a, c.t);
      if (over) return Object.assign({ ok: false, reason: 'over', id }, over);
      for (const x of res) for (let t = c.t; t < c.t + a.d; t++) x.u[t] = (x.u[t] || 0) + a.r[x.k];
    }
    const fitsToo = c.elig.find((x) => !given.includes(x.id) && !overAt(res, x, c.t));
    if (fitsToo) return { ok: false, reason: 'missing', id: fitsToo.id };
    const left = c.elig.find((x) => !given.includes(x.id) && given.some((id) => lessKey(x.key, by.get(id).key)));
    return { ok: false, reason: 'lower', ids: left ? [left.id, given.find((id) => lessKey(left.key, by.get(id).key))] : [] };
  }

  const api = { MAX, MAX_CAP, BUDGET, RULES: RULE_IDS, trace, pickCheck, startCheck, setCheck, parse, profile, stats, check, baker, burgess, minPeak, feasible, sgs, compare, optimum, chains };
  root.PNL = root.PNL || {};
  root.PNL.resource = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
