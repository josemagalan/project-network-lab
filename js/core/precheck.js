/*
 * core/precheck — la tabla de precedencias sin mirar ningún texto (spec f2c-enunciado-tabla, plan §3, P1).
 *
 * closure(p) y reduce(p): cierre y reducción transitiva de un proyecto sin ciclos.
 * explain(parsed): sobre el resultado de project.parse, cada precedencia redundante con el camino más corto
 * que la implica (sin usar la propia precedencia; vecinos en orden natural), el ciclo de la F1, y las
 * actividades iniciales y finales.
 * diagnose(ref, parsed, map, { durations }): la tabla del alumno frente a la de referencia, con la lectura de
 * la spec: faltan las precedencias de la reducción de la referencia que el alumno no implica; son falsas las
 * que escribe el alumno fuera del cierre de la referencia; la invertida es el par de las dos; las redundantes
 * son aviso. map empareja actividades del alumno con las de la referencia (null: por identificador); con
 * map, cada problema lleva también los identificadores de la referencia en `ref`. Sin DOM ni azar.
 */
(function (root) {
  'use strict';

  const isNode = typeof module !== 'undefined' && module.exports;
  const T = isNode ? require('./topo.js') : root.PNL.topo;
  const byId = (a, b) => a.localeCompare(b, 'en', { numeric: true });
  const byEdge = (x, y) => byId(x[0], y[0]) || byId(x[1], y[1]);
  const EMPTY = { activities: [], preds: {}, succs: {} };

  // reach.get(i) = actividades alcanzables desde i (sin incluir i).
  function closure(p) {
    const order = T.order(p).order;
    const reach = new Map();
    for (const id of [...order].reverse()) {
      const set = new Set();
      for (const s of p.succs[id]) { set.add(s); for (const x of reach.get(s)) set.add(x); }
      reach.set(id, set);
    }
    return reach;
  }

  // i → j es redundante si otra predecesora k de j ya es alcanzable desde i.
  function redundantEdges(p, reach) {
    const out = [];
    for (const a of p.activities) {
      const ps = p.preds[a.id];
      for (const i of ps) if (ps.some((k) => k !== i && reach.get(i).has(k))) out.push([i, a.id]);
    }
    return out.sort(byEdge);
  }

  function reduce(p) {
    const reach = closure(p);
    const drop = new Set(redundantEdges(p, reach).map((e) => e.join('\u0000')));
    const preds = {};
    const succs = {};
    for (const a of p.activities) { preds[a.id] = []; succs[a.id] = []; }
    for (const a of p.activities) {
      for (const i of p.preds[a.id]) {
        if (drop.has(`${i}\u0000${a.id}`)) continue;
        preds[a.id].push(i); succs[i].push(a.id);
      }
    }
    for (const id of Object.keys(preds)) { preds[id].sort(byId); succs[id].sort(byId); }
    return { activities: p.activities.map((a) => Object.assign({}, a)), preds, succs };
  }

  // Camino más corto de p a a sin la arista directa (BFS con vecinos en orden natural).
  function pathWithout(proj, p, a) {
    const prev = new Map([[p, null]]);
    const queue = [p];
    while (queue.length) {
      const x = queue.shift();
      if (x === a) break;
      for (const y of [...proj.succs[x]].sort(byId)) {
        if (x === p && y === a) continue;
        if (!prev.has(y)) { prev.set(y, x); queue.push(y); }
      }
    }
    if (!prev.has(a)) return null;
    const path = [];
    for (let x = a; x !== null; x = prev.get(x)) path.unshift(x);
    return path;
  }

  const cycleOf = (parsed) => {
    const e = parsed && parsed.report && parsed.report.errors.find((x) => x.code === 'cycle');
    return e ? e.ids.slice() : null;
  };

  function explain(parsed) {
    const p = parsed && parsed.project;
    if (!p) return { redundant: [], cycle: cycleOf(parsed), starts: [], ends: [] };
    const reach = closure(p);
    const ids = p.activities.map((a) => a.id);
    return {
      redundant: redundantEdges(p, reach).map(([i, j]) => ({ edge: [i, j], path: pathWithout(p, i, j) })),
      cycle: null,
      starts: ids.filter((id) => !p.preds[id].length).sort(byId),
      ends: ids.filter((id) => !p.succs[id].length).sort(byId),
    };
  }

  function diagnose(ref, parsed, map, opts) {
    const durations = !!(opts && opts.durations);
    const cycle = cycleOf(parsed);
    if (cycle) return { ok: false, issues: [{ code: 'cycle', ids: cycle }], warnings: [] };
    if (parsed && parsed.report && parsed.report.errors.length) return { ok: false, issues: [{ code: 'invalid', ids: [] }], warnings: [] };
    const stu = (parsed && parsed.project) || EMPTY;
    const withRef = map !== null && map !== undefined;
    const refIds = new Set(ref.activities.map((a) => a.id));

    // Emparejamiento: alumno → referencia, sin repetir destino (el primero en el orden de la tabla del alumno).
    const m = new Map();
    const inv = new Map();
    for (const a of stu.activities) {
      const r = withRef ? map[a.id] : a.id;
      if (r !== undefined && refIds.has(r) && !inv.has(r)) { m.set(a.id, r); inv.set(r, a.id); }
    }
    const tag = (issue, refIdsOf) => (withRef ? Object.assign(issue, { ref: refIdsOf }) : issue);

    const missingAct = ref.activities.filter((a) => !inv.has(a.id)).map((a) => ({ code: 'missingActivity', ids: [], ref: [a.id] }));
    const extraAct = stu.activities.filter((a) => !m.has(a.id)).map((a) => ({ code: 'extraActivity', ids: [a.id] }));
    const dur = [];
    if (durations) {
      const refD = new Map(ref.activities.map((a) => [a.id, a.d]));
      for (const a of stu.activities) if (m.has(a.id) && a.d !== refD.get(m.get(a.id))) dur.push(tag({ code: 'duration', ids: [a.id] }, [m.get(a.id)]));
    }

    const refReach = closure(ref);
    const stuReach = closure(stu);
    const written = [];
    for (const a of stu.activities) for (const x of stu.preds[a.id]) if (m.has(x) && m.has(a.id)) written.push([x, a.id]);
    const wrote = new Set(written.map((e) => e.join('\u0000')));

    // Faltan las precedencias de la reducción de la referencia que el alumno no implica.
    const refRed = new Set(redundantEdges(ref, refReach).map((e) => e.join('\u0000')));
    const missing = [];
    for (const act of ref.activities) {
      for (const p of ref.preds[act.id]) {
        const a = act.id;
        if (refRed.has(`${p}\u0000${a}`) || !inv.has(p) || !inv.has(a)) continue;
        if (!stuReach.get(inv.get(p)).has(inv.get(a))) missing.push([p, a]);
      }
    }

    const falseE = written.filter(([x, y]) => !refReach.get(m.get(x)).has(m.get(y)));
    const inverted = [];
    const missingOnly = [];
    for (const [p, a] of missing.sort(byEdge)) {
      const back = `${inv.get(a)}\u0000${inv.get(p)}`;
      if (wrote.has(back)) {
        inverted.push(tag({ code: 'inverted', ids: [inv.get(p), inv.get(a)] }, [p, a]));
        const k = falseE.findIndex(([x, y]) => x === inv.get(a) && y === inv.get(p));
        if (k >= 0) falseE.splice(k, 1);
      } else missingOnly.push(tag({ code: 'missingPrecedence', ids: [inv.get(p), inv.get(a)] }, [p, a]));
    }
    const falseIssues = falseE.sort(byEdge).map(([x, y]) => tag({ code: 'falsePrecedence', ids: [x, y] }, [m.get(x), m.get(y)]));

    const warnings = [];
    for (const [x, y] of redundantEdges(stu, stuReach)) {
      if (!m.has(x) || !m.has(y) || !refReach.get(m.get(x)).has(m.get(y))) continue;
      warnings.push(tag({ code: 'redundant', ids: [x, y], path: pathWithout(stu, x, y) }, [m.get(x), m.get(y)]));
    }

    const byIds = (u, v) => byEdge(u.ids.concat(''), v.ids.concat(''));
    const issues = [].concat(missingAct, extraAct.sort(byIds), dur.sort(byIds), inverted.sort(byIds), missingOnly.sort(byIds), falseIssues);
    return { ok: issues.length === 0, issues, warnings };
  }

  const api = { closure, reduce, explain, diagnose };
  root.PNL = root.PNL || {};
  root.PNL.precheck = api;
  if (isNode) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
