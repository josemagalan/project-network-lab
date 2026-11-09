/*
 * core/aoamethods — métodos de construcción de la red PERT del comparador (spec f2b-metodos-reto, plan §3).
 *
 * Se registran en aoa.methods con el contrato de la F2a (P7): proyecto → AoaNet. Cada método produce
 * sucesos con clave, arcos y ficticias con su motivo ('dependency' o 'uniqueness'), y aoa._assemble los
 * numera (i < j) y los nombra (F1, F2…). Lecturas exactas en la spec, §Behaviour:
 *   - prog: dibujo progresivo (formalización de la herramienta, aprobada por el autor), con su traza.
 *   - cs: agrupar por precedentes, Cohen y Sadeh (2007), pasos 1–7.
 *   - kim: Kim (2008), lectura «contenidos en los de cada una de las demás predecesoras».
 * Todos trabajan sobre la tabla sin precedencias redundantes, con un único suceso inicial y uno final, y
 * con ficticia de unicidad en la actividad que va después en orden alfabético. Sin DOM ni azar.
 */
(function (root) {
  'use strict';

  const isNode = typeof module !== 'undefined' && module.exports;
  const A = isNode ? require('./aoa.js') : root.PNL.aoa;
  const byId = (x, y) => (x < y ? -1 : x > y ? 1 : 0);

  // Tabla sin redundancias: posteriores y precedentes directas, antecesoras (cierre) y orden topológico.
  function table(p) {
    const { ids, reach, direct } = A._reduce(p);
    const preds = Object.fromEntries(ids.map((b) => [b, ids.filter((a) => direct[a].includes(b))]));
    const anc = Object.fromEntries(ids.map((b) => [b, new Set(ids.filter((a) => reach[a].has(b)))]));
    const deg = Object.fromEntries(ids.map((a) => [a, preds[a].length]));
    const ready = ids.filter((a) => !deg[a]);
    const topo = [];
    while (ready.length) {
      ready.sort(byId);
      const a = ready.shift(); topo.push(a);
      for (const b of direct[a]) if (--deg[b] === 0) ready.push(b);
    }
    const pairs = ids.flatMap((a) => direct[a].map((b) => [a, b]));
    return { ids, succ: direct, preds, anc, reach, topo, pairs };
  }

  // Sucesos con unión-búsqueda; al final, claves de texto para _assemble ('INI', 'FIN', 'e<n>', '#<act>').
  function Events() {
    const parent = [];
    const make = () => { parent.push(parent.length); return parent.length - 1; };
    const find = (x) => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
    const union = (x, y) => { x = find(x); y = find(y); if (x !== y) parent[y] = x; return x; };
    return { make, find, union };
  }

  // Cierra una red: resuelve uniones, quita bucles y duplicados (uniendo sus motivos), funde los sucesos sin
  // entradas en el inicial y los sin salidas en el final, añade las ficticias de unicidad y la monta.
  function finish(method, T, ev, arcs, dummies) {
    const f = ev.find;
    const merge = (list) => {
      const out = new Map();
      for (const d of list) {
        const from = f(d.from); const to = f(d.to);
        if (from === to) continue;
        const k = `${from}>${to}`;
        if (out.has(k)) { const o = out.get(k); o.because = [...new Set([...o.because, ...d.because])].sort(byId); } else out.set(k, { from, to, rule: d.rule, because: [...d.because].sort(byId), tag: d.tag });
      }
      return [...out.values()];
    };
    let ds = merge(dummies);
    const edges = () => [...arcs.map((e) => [f(e.from), f(e.to)]), ...ds.map((d) => [d.from, d.to])];
    const nodes = [...new Set(edges().flat())];
    const indeg = new Map(nodes.map((u) => [u, 0])); const outdeg = new Map(nodes.map((u) => [u, 0]));
    for (const [x, y] of edges()) { outdeg.set(x, outdeg.get(x) + 1); indeg.set(y, indeg.get(y) + 1); }
    const sources = nodes.filter((u) => !indeg.get(u)); const sinks = nodes.filter((u) => !outdeg.get(u));
    for (const u of sources.slice(1)) ev.union(sources[0], u);
    for (const u of sinks.slice(1)) ev.union(sinks[0], u);
    const INI = f(sources[0]); const FIN = f(sinks[0]);
    ds = merge(ds);
    // Unicidad: dos actividades con el mismo origen y destino → la que va después termina en su suceso propio.
    const own = {};
    const seen = new Map();
    for (const e of [...arcs].sort((x, y) => byId(x.act, y.act))) {
      const k = `${f(e.from)}>${f(e.to)}`;
      if (seen.has(k)) { own[e.act] = true; ds.push({ from: `#${e.act}`, to: f(e.to), rule: 'uniqueness', because: [seen.get(k), e.act], tag: 'u' }); } else seen.set(k, e.act);
    }
    const key = (u) => (typeof u === 'string' ? u : u === INI ? 'INI' : u === FIN ? 'FIN' : `e${u}`);
    const arcsK = arcs.map((e) => ({ act: e.act, from: key(f(e.from)), to: own[e.act] ? `#${e.act}` : key(f(e.to)) }));
    const dummiesK = ds.map((d) => ({ from: key(typeof d.from === 'string' ? d.from : f(d.from)), to: key(f(d.to)), rule: d.rule, because: d.because }));
    const kindOf = (u) => (u === 'INI' ? 'start' : u === 'FIN' ? 'end' : u[0] === '#' ? 'identity' : 'event');
    const { events, arcs: arcsN, dummies: dummiesN } = A._assemble(arcsK, dummiesK, T.pairs, kindOf, () => []);
    return { method, events, arcs: arcsN, dummies: dummiesN, trace: [] };
  }

  // ---------- Dibujo progresivo ----------
  function progressive(p) {
    const T = table(p);
    const ev = Events();
    const INI = ev.make();
    const start = {}; const end = {}; const merged = {};
    const startOfSet = new Map();
    const dummies = [];
    const steps = [];
    const need = (P) => { const s = new Set(); for (const q of P) { s.add(q); for (const r of T.anc[q]) s.add(r); } return [...s].sort(byId).join(','); };
    for (const x of T.topo) {
      const P = T.preds[x];
      const step = { kind: 'progAct', act: x, reveals: [], prog: { start: null, preds: [], dummies: [] }, born: [] };
      if (!P.length) { start[x] = INI; step.prog.start = 'initial'; }
      else if (P.length === 1) { start[x] = end[P[0]]; step.prog.start = 'pred'; step.prog.preds.push({ act: P[0], how: 'direct', why: 'single' }); }
      else {
        const k = need(P);
        if (startOfSet.has(k)) {
          start[x] = startOfSet.get(k); step.prog.start = 'existing';
          for (const q of P) step.prog.preds.push({ act: q, how: 'existing' });
        } else {
          const S = ev.make(); startOfSet.set(k, S); start[x] = S; step.prog.start = 'new';
          for (const q of P) {
            const used = T.ids.some((z) => start[z] !== undefined && z !== x && ev.find(start[z]) === ev.find(end[q]));
            const others = T.succ[q].every((y) => P.every((r) => r === q || T.anc[y].has(r)));
            if (!merged[q] && !used && others) {
              ev.union(S, end[q]); merged[q] = true;
              step.prog.preds.push({ act: q, how: 'direct', why: 'free' });
            } else {
              const d = { from: end[q], to: S, rule: 'dependency', because: [q, x], tag: `${q}>${x}` };
              dummies.push(d); step.born.push(d.tag);
              step.prog.preds.push({ act: q, how: 'dummy', why: used || merged[q] ? 'notFree' : 'otherSuccs' });
            }
          }
        }
      }
      end[x] = ev.make();
      steps.push(step);
    }
    const arcs = T.ids.map((a) => ({ act: a, from: start[a], to: end[a] }));
    const net = finish('prog', T, ev, arcs, dummies);
    // Nombres de las ficticias de cada paso (por sus actividades: dependencia [q, x], unicidad [primera, otra]).
    const nameOf = (rule, because) => {
      const d = net.dummies.find((z) => z.rule === rule && because.every((b) => z.because.includes(b)));
      return d ? d.name : null;
    };
    for (const s of steps) {
      s.prog.dummies = [...new Set(s.born.map((tag) => nameOf('dependency', tag.split('>'))).filter(Boolean))];
      delete s.born;
    }
    const seenNames = new Set(steps.flatMap((s) => s.prog.dummies));
    const leftover = net.dummies.filter((d) => d.rule === 'dependency' && !seenNames.has(d.name)).map((d) => d.name);
    if (leftover.length) throw new Error(`aoamethods.prog: ficticias sin paso (${leftover.join(', ')})`);
    const uniq = net.dummies.filter((d) => d.rule === 'uniqueness').map((d) => d.name);
    net.trace = [{ kind: 'progTable', reveals: [] }, ...steps,
      { kind: 'progUnique', reveals: [], prog: { start: null, preds: [], dummies: uniq } }, { kind: 'progEnd', reveals: [] }];
    return net;
  }

  // ---------- Agrupar por precedentes (Cohen y Sadeh, 2007) ----------
  function cohenSadeh(p) {
    const T = table(p);
    const ev = Events();
    const node = new Map();
    const setKey = (a) => T.preds[a].join(',');
    for (const a of T.topo) if (!node.has(setKey(a))) node.set(setKey(a), ev.make());
    const FIN = ev.make();
    const to = {}; const dummies = [];
    for (const a of T.ids) {
      const sets = [...new Set(T.succ[a].map(setKey))];
      if (!sets.length) to[a] = FIN;
      else if (sets.length === 1) to[a] = node.get(sets[0]);
      else {
        to[a] = sets.includes(a) ? node.get(a) : ev.make();
        for (const s of sets) if (s !== a || !sets.includes(a)) {
          if (node.get(s) === to[a]) continue;
          const users = T.ids.filter((b) => setKey(b) === s);
          dummies.push({ from: to[a], to: node.get(s), rule: 'dependency', because: [a, ...users] });
        }
      }
    }
    const arcs = T.ids.map((a) => ({ act: a, from: node.get(setKey(a)), to: to[a] }));
    return finish('cs', T, ev, arcs, dummies);
  }

  // ---------- Kim (2008) ----------
  function kim(p) {
    const T = table(p);
    const ev = Events();
    const start = {}; const end = {};
    for (const a of T.ids) { start[a] = ev.make(); end[a] = ev.make(); }
    const sub = (x, y) => T.succ[x].every((s) => T.succ[y].includes(s));
    const pairs = [];
    for (const x of T.ids) {
      const P = T.preds[x];
      for (const q of P) {
        const free = P.length === 1 || P.filter((r) => r !== q).every((r) => sub(q, r));
        if (free) ev.union(end[q], start[x]); else pairs.push([q, x]);
      }
    }
    // Uno a varios (y varios a varios): los destinos de ficticias desde un mismo suceso con las mismas
    // precedentes comparten su suceso de inicio.
    for (let changed = true; changed;) {
      changed = false;
      const bySrc = new Map();
      for (const [q, x] of pairs) { const k = ev.find(end[q]); if (!bySrc.has(k)) bySrc.set(k, []); bySrc.get(k).push(x); }
      for (const xs of bySrc.values()) {
        const groups = new Map();
        for (const x of xs) { const k = T.preds[x].join(','); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(x); }
        for (const g of groups.values()) for (const x of g.slice(1)) {
          if (ev.find(start[x]) !== ev.find(start[g[0]])) { ev.union(start[g[0]], start[x]); changed = true; }
        }
      }
    }
    const arcs = T.ids.map((a) => ({ act: a, from: start[a], to: end[a] }));
    const dummies = pairs.map(([q, x]) => ({ from: end[q], to: start[x], rule: 'dependency', because: [q, x] }));
    return finish('kim', T, ev, arcs, dummies);
  }

  A.methods.prog = progressive;
  A.methods.cs = cohenSadeh;
  A.methods.kim = kim;
  const api = { progressive, cohenSadeh, kim, _table: table };
  root.PNL = root.PNL || {};
  root.PNL.aoamethods = api;
  if (isNode) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
