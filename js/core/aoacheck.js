/*
 * core/aoacheck — comprobación y diagnóstico de cualquier red PERT (spec f2b-metodos-reto, plan §3).
 *
 * Sirve para las redes de los métodos (AoaNet, sucesos numerados 1..N) y para la red del alumno
 * (StudentNet: sucesos con identificador propio y número quizá vacío, arcos y ficticias quizá a medias).
 * La red es correcta si: cada actividad de la tabla tiene un arco y solo uno, completo; no hay dos con el
 * mismo par de sucesos; no hay ciclos ni sucesos sueltos; hay un único suceso inicial y uno final; y a
 * precede a b (cierre transitivo) exactamente cuando hay camino del destino de a al origen de b.
 * La numeración (i < j en cada arco) se juzga aparte. Sin DOM ni azar.
 */
(function (root) {
  'use strict';

  const isNode = typeof module !== 'undefined' && module.exports;
  const A = isNode ? require('./aoa.js') : root.PNL.aoa;

  // Forma común: sucesos con clave, arcos y ficticias entre claves; una ficticia lleva su índice y su nombre.
  function normalize(net) {
    const student = net.events.some((e) => e.id !== undefined);
    const events = net.events.map((e) => ({ key: student ? e.id : e.n, n: e.n == null ? null : e.n }));
    const arcs = net.arcs.map((e) => ({ act: e.act, from: e.from == null ? null : e.from, to: e.to == null ? null : e.to }));
    const dummies = net.dummies.map((d, i) => ({ i, name: d.name, from: d.from == null ? null : d.from, to: d.to == null ? null : d.to }));
    return { events, arcs, dummies };
  }

  const label = (d) => (d.name ? [d.name] : []);

  // Alcance entre sucesos; null si hay un ciclo.
  function reachability(keys, edges) {
    const out = new Map(keys.map((k) => [k, []]));
    const indeg = new Map(keys.map((k) => [k, 0]));
    for (const e of edges) { out.get(e.from).push(e.to); indeg.set(e.to, indeg.get(e.to) + 1); }
    const order = []; const deg = new Map(indeg);
    const queue = keys.filter((k) => deg.get(k) === 0);
    while (queue.length) { const u = queue.shift(); order.push(u); for (const v of out.get(u)) { deg.set(v, deg.get(v) - 1); if (deg.get(v) === 0) queue.push(v); } }
    if (order.length !== keys.length) return null;
    const R = new Map(keys.map((k) => [k, new Set([k])]));
    for (const u of [...order].reverse()) for (const v of out.get(u)) for (const w of R.get(v)) R.get(u).add(w);
    return R;
  }

  // Sucesos que están en algún ciclo (desde los que se puede volver a ellos mismos), en el orden de la red.
  function inCycles(keys, edges) {
    const out = new Map(keys.map((k) => [k, []]));
    for (const e of edges) out.get(e.from).push(e.to);
    return keys.filter((k) => {
      const seen = new Set(); const stack = [...out.get(k)];
      while (stack.length) { const u = stack.pop(); if (u === k) return true; if (seen.has(u)) continue; seen.add(u); stack.push(...out.get(u)); }
      return false;
    });
  }

  // Problemas de lógica (sin numeración ni ficticias sobrantes), en un orden fijo.
  function logic(g, p) {
    const { ids, reach } = A._reduce(p);
    const known = new Set(ids);
    const problems = [];
    const arcOf = {};
    for (const e of g.arcs) {
      if (!known.has(e.act)) { problems.push({ code: 'unknownAct', ids: [e.act] }); continue; }
      if (arcOf[e.act]) { problems.push({ code: 'duplicateArc', ids: [e.act] }); continue; }
      arcOf[e.act] = e;
    }
    for (const a of ids) if (!arcOf[a]) problems.push({ code: 'missingArc', ids: [a] });
    const complete = (e) => e.from !== null && e.to !== null;
    for (const a of ids) if (arcOf[a] && !complete(arcOf[a])) problems.push({ code: 'incompleteArc', ids: [a] });
    for (const d of g.dummies) if (!complete(d)) problems.push({ code: 'incompleteArc', ids: label(d), events: [d.from, d.to].filter((x) => x !== null) });
    const seen = new Map();
    for (const e of g.arcs) {
      if (!complete(e) || arcOf[e.act] !== e) continue;
      const k = `${e.from}>${e.to}`;
      if (seen.has(k)) problems.push({ code: 'parallel', ids: [seen.get(k), e.act] }); else seen.set(k, e.act);
    }
    const edges = [...g.arcs.filter((e) => complete(e) && arcOf[e.act] === e), ...g.dummies.filter(complete)];
    const keys = g.events.map((e) => e.key);
    const indeg = new Map(keys.map((k) => [k, 0])); const outdeg = new Map(keys.map((k) => [k, 0]));
    for (const e of edges) { outdeg.set(e.from, outdeg.get(e.from) + 1); indeg.set(e.to, indeg.get(e.to) + 1); }
    const loose = keys.filter((k) => indeg.get(k) === 0 && outdeg.get(k) === 0);
    for (const k of loose) problems.push({ code: 'looseEvent', ids: [], events: [k] });
    const live = keys.filter((k) => !loose.includes(k));
    // Con lo implicado: los sucesos iniciales (o finales) que hay, y los sucesos de los ciclos.
    const starts = live.filter((k) => indeg.get(k) === 0);
    const ends = live.filter((k) => outdeg.get(k) === 0);
    if (starts.length !== 1) problems.push({ code: 'start', ids: [], events: starts });
    if (ends.length !== 1) problems.push({ code: 'end', ids: [], events: ends });
    const R = reachability(keys, edges);
    if (!R) { problems.push({ code: 'cycle', ids: [], events: inCycles(keys, edges) }); return problems; }
    for (const a of ids) for (const b of ids) {
      if (a === b || !arcOf[a] || !arcOf[b] || !complete(arcOf[a]) || !complete(arcOf[b])) continue;
      const linked = R.get(arcOf[a].to).has(arcOf[b].from);
      const should = reach[a].has(b);
      if (linked && !should) problems.push({ code: 'falsePrecedence', ids: [a, b] });
      if (!linked && should) problems.push({ code: 'missingPrecedence', ids: [a, b] });
    }
    return problems;
  }

  // Numeración: todos los sucesos con número y cada arco de uno menor a uno mayor.
  function numbering(g) {
    const problems = [];
    const nOf = new Map(g.events.map((e) => [e.key, e.n]));
    const missing = g.events.filter((e) => e.n === null).map((e) => e.key);
    if (missing.length) { problems.push({ code: 'unnumbered', ids: [], events: missing }); return problems; }
    for (const e of g.arcs) if (e.from !== null && e.to !== null && !(nOf.get(e.from) < nOf.get(e.to))) problems.push({ code: 'order', ids: [e.act] });
    for (const d of g.dummies) if (d.from !== null && d.to !== null && !(nOf.get(d.from) < nOf.get(d.to))) problems.push({ code: 'order', ids: label(d), events: [d.from, d.to] });
    return problems;
  }

  // Ficticias que se pueden quitar: borrándola o, si no, fundiendo su destino con su origen (sin mirar
  // la numeración). Solo tiene sentido en una red lógicamente correcta.
  function removableIn(g, p, first) {
    const out = [];
    for (const d of g.dummies) {
      if (first && out.length) break;
      if (d.from === null || d.to === null) continue;
      const rest = g.dummies.filter((x) => x !== d);
      if (!logic({ events: g.events, arcs: g.arcs, dummies: rest }, p).length) { out.push({ i: d.i, name: d.name, how: 'delete' }); continue; }
      const m = (k) => (k === d.to ? d.from : k);
      const merged = {
        events: g.events.filter((e) => e.key !== d.to),
        arcs: g.arcs.map((e) => ({ act: e.act, from: e.from === null ? null : m(e.from), to: e.to === null ? null : m(e.to) })),
        dummies: rest.map((x) => ({ i: x.i, name: x.name, from: x.from === null ? null : m(x.from), to: x.to === null ? null : m(x.to) }))
          .filter((x) => x.from !== x.to),
      };
      if (!logic(merged, p).length) out.push({ i: d.i, name: d.name, how: 'merge' });
    }
    return out;
  }

  function diagnose(net, p) {
    const g = normalize(net);
    const problems = [...logic(g, p), ...numbering(g)];
    if (!problems.length) for (const r of removableIn(g, p)) problems.push({ code: 'unnecessaryDummy', ids: r.name ? [r.name] : [], dummy: r.i, how: r.how });
    return { ok: problems.length === 0, problems };
  }

  // opts.first: solo la primera que se pueda quitar, en el orden de las ficticias (lo usa la contracción de Spinrad).
  function removable(net, p, opts) {
    const g = normalize(net);
    return logic(g, p).length ? [] : removableIn(g, p, !!(opts && opts.first));
  }

  // ¿Correcta en lógica y numeración? (sin buscar ficticias que sobran; lo usan los métodos que prueban redes)
  function valid(net, p) {
    const g = normalize(net);
    return logic(g, p).length === 0 && numbering(g).length === 0;
  }

  const api = { diagnose, removable, valid };
  root.PNL = root.PNL || {};
  root.PNL.aoacheck = api;
  if (isNode) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
