/*
 * core/aoa — la red PERT (actividad en arco) de un proyecto (spec f2a-pert-ficticias, plan §2–§3).
 *
 * Método por defecto: las reglas de los conjuntos del autor (Tema 6a), con la lectura validada en la spec:
 * sobre la tabla de posteriores SIN precedencias redundantes,
 *   - las actividades con el mismo conjunto de posteriores terminan en el mismo suceso;
 *   - conjuntos contenidos: ficticia del suceso del conjunto mayor al del menor, solo entre vecinos;
 *   - conjuntos compartidos: la parte común tiene su propio suceso (reutilizado si ya existe), al que llega
 *     una ficticia desde cada uno; las partes comunes entran a su vez en las reglas;
 *   - cada actividad sale del suceso del conjunto más pequeño que la contiene (o del inicial);
 *   - conjuntos iguales con las mismas precedentes (actividades paralelas): la que va después en orden
 *     alfabético termina en un suceso propio unido al común por una ficticia de identidad.
 * Equivale a cerrar los conjuntos de posteriores por intersección y unir cada uno con los inmediatamente
 * contenidos (diagrama de Hasse). Sin DOM ni azar: el mismo proyecto da siempre la misma red.
 *
 * Numeración (plan P5): columnas por nivel, en las que las actividades avanzan una columna y las ficticias
 * ninguna; dentro de cada columna, el orden que exigen las ficticias y, después, la primera actividad
 * (en orden de identificador) que termina en el suceso. Así cada arco va de un número menor a uno mayor.
 */
(function (root) {
  'use strict';

  const isNode = typeof module !== 'undefined' && module.exports;
  const T = isNode ? require('./topo.js') : root.PNL.topo;
  const { byId } = T;
  const RULE_ORDER = { equal: 0, contained: 1, shared: 2, min: 3 };

  const keyOf = (ids) => [...ids].sort(byId).join(',');

  // Alcance (cierre transitivo) y posteriores directas sin redundancias.
  function reduce(p) {
    const ids = p.activities.map((a) => a.id);
    const reach = {};
    const visit = (a) => {
      if (reach[a]) return reach[a];
      const r = new Set();
      for (const b of p.succs[a]) { r.add(b); for (const c of visit(b)) r.add(c); }
      reach[a] = r;
      return r;
    };
    ids.forEach(visit);
    const direct = {};
    for (const a of ids) direct[a] = p.succs[a].filter((b) => !p.succs[a].some((c) => c !== b && reach[c].has(b))).sort(byId);
    return { ids: [...ids].sort(byId), reach, direct };
  }

  function rules(p) {
    const { ids, direct } = reduce(p);
    const preds = Object.fromEntries(ids.map((b) => [b, ids.filter((a) => direct[a].includes(b))]));

    // Familia de conjuntos de posteriores, cerrada por intersección.
    const fam = new Map();
    for (const a of ids) if (direct[a].length) fam.set(keyOf(direct[a]), new Set(direct[a]));
    for (let grew = true; grew;) {
      grew = false;
      const sets = [...fam.values()];
      for (let i = 0; i < sets.length; i++) {
        for (let j = i + 1; j < sets.length; j++) {
          const common = [...sets[i]].filter((x) => sets[j].has(x));
          const k = keyOf(common);
          if (common.length && !fam.has(k)) { fam.set(k, new Set(common)); grew = true; }
        }
      }
    }
    const keys = [...fam.keys()].sort();
    const strictSub = (y, x) => fam.get(y).size < fam.get(x).size && [...fam.get(y)].every((e) => fam.get(x).has(e));
    const hasse = [];
    for (const x of keys) for (const y of keys) {
      if (strictSub(y, x) && !keys.some((z) => strictSub(y, z) && strictSub(z, x))) hasse.push([x, y]);
    }
    const owners = (k) => ids.filter((a) => keyOf(direct[a]) === k);

    // Sucesos de origen y destino de cada actividad.
    const from = {}; const to = {};
    for (const b of ids) {
      if (!preds[b].length) from[b] = 'INI';
      else from[b] = keys.filter((k) => fam.get(k).has(b)).reduce((m, k) => (fam.get(k).size < fam.get(m).size ? k : m));
      to[b] = direct[b].length ? keyOf(direct[b]) : 'FIN';
    }
    const kind = { INI: 'start', FIN: 'end' };
    for (const k of keys) kind[k] = owners(k).length ? 'set' : 'shared';

    const dummies = [];
    // Conjuntos iguales con las mismas precedentes: identidad en la que va después alfabéticamente.
    const byPair = new Map();
    for (const a of ids) { const k = `${from[a]}|${to[a]}`; if (!byPair.has(k)) byPair.set(k, []); byPair.get(k).push(a); }
    for (const group of byPair.values()) {
      for (const extra of group.slice(1)) {
        const node = `#${extra}`;
        kind[node] = 'identity';
        dummies.push({ from: node, to: to[extra], rule: 'equal', because: [group[0], extra] });
        to[extra] = node;
      }
    }
    // Contenidos y compartidos: un diagrama de Hasse.
    for (const [x, y] of hasse) {
      const contained = owners(y).length > 0;
      let because;
      if (contained) because = [...owners(x), ...owners(y)];
      else {
        because = [...owners(x)];
        for (const [z, w] of hasse) if (w === y) because.push(...owners(z));
        if (!because.length) because = ids.filter((b) => from[b] === y);
      }
      dummies.push({ from: x, to: y, rule: contained ? 'contained' : 'shared', because: [...new Set(because)].sort(byId) });
    }
    return { ids, direct, from, to, kind, dummies, sets: (k) => (fam.has(k) ? [...fam.get(k)].sort(byId) : []) };
  }

  // Numeración por columnas (actividades +1, ficticias +0) y orden de Kahn con desempate determinista.
  function number(nodes, arcs, dummies) {
    const out = new Map(nodes.map((u) => [u, []]));
    const indeg = new Map(nodes.map((u) => [u, 0]));
    for (const e of arcs) { out.get(e.from).push([e.to, 1]); indeg.set(e.to, indeg.get(e.to) + 1); }
    for (const e of dummies) { out.get(e.from).push([e.to, 0]); indeg.set(e.to, indeg.get(e.to) + 1); }
    const col = new Map(nodes.map((u) => [u, 0]));
    const deg = new Map(indeg);
    const queue = nodes.filter((u) => deg.get(u) === 0);
    const topo = [];
    while (queue.length) {
      const u = queue.shift(); topo.push(u);
      for (const [v, w] of out.get(u)) { col.set(v, Math.max(col.get(v), col.get(u) + w)); deg.set(v, deg.get(v) - 1); if (deg.get(v) === 0) queue.push(v); }
    }
    const ending = (u) => arcs.filter((e) => e.to === u).map((e) => e.act).sort(byId)[0];
    const starting = (u) => arcs.filter((e) => e.from === u).map((e) => e.act).sort(byId)[0];
    const tie = (u) => (u === 'INI' ? '' : u === 'FIN' ? '￿' : ending(u) || starting(u) || u);
    const less = (u, v) => (col.get(u) - col.get(v)) || byId(tie(u), tie(v)) || (u < v ? -1 : u > v ? 1 : 0);
    const deg2 = new Map(indeg);
    const ready = nodes.filter((u) => deg2.get(u) === 0);
    const n = new Map();
    while (ready.length) {
      ready.sort(less);
      const u = ready.shift();
      n.set(u, n.size + 1);
      for (const [v] of out.get(u)) { deg2.set(v, deg2.get(v) - 1); if (deg2.get(v) === 0) ready.push(v); }
    }
    return { n, col };
  }

  function build(p, opts) {
    const method = (opts && opts.method) || 'rules';
    if (method !== 'rules') {
      if (methods[method]) return methods[method](p, opts);
      throw new Error(`aoa.build: método desconocido «${method}»`);
    }
    const r = rules(p);
    const arcsK = r.ids.map((a) => ({ act: a, from: r.from[a], to: r.to[a] }));
    const nodes = [...new Set(['INI', 'FIN', ...arcsK.flatMap((e) => [e.from, e.to]), ...r.dummies.flatMap((d) => [d.from, d.to])])];
    const { n } = number(nodes, arcsK, r.dummies);

    // Precedencias directas que representa cada ficticia: los pares (a, b) cuyo camino de ficticias pasa por ella.
    const dOut = new Map(nodes.map((u) => [u, []]));
    for (const d of r.dummies) dOut.get(d.from).push(d.to);
    const dReach = new Map();
    const reachD = (u) => {
      if (dReach.has(u)) return dReach.get(u);
      const s = new Set([u]);
      for (const v of dOut.get(u)) for (const w of reachD(v)) s.add(w);
      dReach.set(u, s);
      return s;
    };
    const pairs = r.ids.flatMap((a) => r.direct[a].map((b) => [a, b]));
    const dummiesN = r.dummies.map((d) => ({
      from: n.get(d.from), to: n.get(d.to), rule: d.rule, because: d.because,
      represents: pairs.filter(([a, b]) => reachD(r.to[a]).has(d.from) && reachD(d.to).has(r.from[b])).sort((x, y) => byId(x[0], y[0]) || byId(x[1], y[1])),
    }));
    dummiesN.sort((x, y) => (RULE_ORDER[x.rule] - RULE_ORDER[y.rule]) || byId(x.because[0], y.because[0]) || (x.from - y.from) || (x.to - y.to));
    const dummies = dummiesN.map((d, i) => Object.assign({ name: `F${i + 1}` }, d));
    const events = nodes.map((u) => ({ n: n.get(u), set: u === 'INI' || u === 'FIN' ? u : r.sets(u), kind: r.kind[u] }))
      .sort((x, y) => x.n - y.n);
    const arcs = arcsK.map((e) => ({ act: e.act, from: n.get(e.from), to: n.get(e.to) }));
    return { method: 'rules', events, arcs, dummies, trace: [] };
  }

  // ¿La red representa exactamente las precedencias del proyecto? (plan §3, postcondición de build)
  function verify(net, p) {
    const problems = [];
    const { ids, reach } = reduce(p);
    const N = net.events.length;
    const arcOf = Object.fromEntries(net.arcs.map((e) => [e.act, e]));
    for (const a of ids) if (!arcOf[a]) problems.push({ code: 'missingArc', ids: [a] });
    const seen = new Map();
    for (const e of net.arcs) {
      const k = `${e.from}>${e.to}`;
      if (seen.has(k)) problems.push({ code: 'parallel', ids: [seen.get(k), e.act] }); else seen.set(k, e.act);
    }
    const edges = [...net.arcs, ...net.dummies];
    for (const e of edges) if (!(e.from < e.to)) problems.push({ code: 'order', ids: [e.act || e.name] });
    const indeg = new Array(N + 1).fill(0); const outdeg = new Array(N + 1).fill(0);
    for (const e of edges) { outdeg[e.from]++; indeg[e.to]++; }
    const sources = net.events.filter((e) => indeg[e.n] === 0).length;
    const sinks = net.events.filter((e) => outdeg[e.n] === 0).length;
    if (sources !== 1) problems.push({ code: 'start', ids: [] });
    if (sinks !== 1) problems.push({ code: 'end', ids: [] });
    if (problems.length) return { ok: false, problems };
    // Con i < j en todo arco, el alcance se calcula de mayor a menor número.
    const out = Array.from({ length: N + 1 }, () => []);
    for (const e of edges) out[e.from].push(e.to);
    const R = Array.from({ length: N + 1 }, (_, i) => new Set([i]));
    for (let u = N; u >= 1; u--) for (const v of out[u]) for (const w of R[v]) R[u].add(w);
    for (const a of ids) for (const b of ids) {
      if (a === b) continue;
      const linked = R[arcOf[a].to].has(arcOf[b].from);
      const should = reach[a].has(b);
      if (linked && !should) problems.push({ code: 'falsePrecedence', ids: [a, b] });
      if (!linked && should) problems.push({ code: 'missingPrecedence', ids: [a, b] });
    }
    return { ok: problems.length === 0, problems };
  }

  // Métodos de construcción intercambiables (plan P7): la F2b añadirá otros con el mismo contrato.
  const methods = { rules: (p) => build(p, { method: 'rules' }) };

  const api = { build, verify, methods };
  root.PNL = root.PNL || {};
  root.PNL.aoa = api;
  if (isNode) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
