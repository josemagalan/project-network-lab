/*
 * core/aoamethods — métodos de construcción de la red PERT del comparador (spec f2b-metodos-reto, plan §3).
 *
 * Se registran en aoa.methods con el contrato de la F2a (P7): proyecto → AoaNet. Cada método produce
 * sucesos con clave, arcos y ficticias con su motivo ('dependency' o 'uniqueness'), y aoa._assemble los
 * numera (i < j) y los nombra (F1, F2…). Lecturas exactas en la spec, §Behaviour:
 *   - prog: dibujo progresivo (formalización de la herramienta, aprobada por el autor), con su traza.
 *   - cs: agrupar por precedentes, Cohen y Sadeh (2007), pasos 1–7.
 *   - kim: Kim (2008), lectura «contenidos en los de cada una de las demás predecesoras».
 *   - spinrad: Spinrad (1986), fases 1–3 en su modelo; la red se contrae después (paso de la herramienta).
 *   - cgl: Corneil, Gotlieb y Lee (1973), teoremas 1–3 y §3, con el recubrimiento mínimo de las de tipo (3).
 * Todos trabajan sobre la tabla sin precedencias redundantes, con un único suceso inicial y uno final, y
 * con ficticia de unicidad en la actividad que va después en orden alfabético. Sin DOM ni azar.
 */
(function (root) {
  'use strict';

  const isNode = typeof module !== 'undefined' && module.exports;
  const A = isNode ? require('./aoa.js') : root.PNL.aoa;
  const K = isNode ? require('./aoacheck.js') : root.PNL.aoacheck;
  // Presupuesto del recubrimiento de Corneil-Gotlieb-Lee en unidades de trabajo (revisión F2b, F2): cada subconjunto
  // examinado cuesta (actividades + ficticias)², lo que crece montar y validar su red; antes contaba subconjuntos y una
  // tabla de 28 actividades congelaba la pestaña más de 30 s. Con 400 000 unidades, el peor caso medido es < 0,5 s.
  const CGL_BUDGET = 400000;
  // Orden natural, como las reglas (topo): A2 antes que A10. Con desempate exacto, porque localeCompare da 0 para A1 y
  // A01 (ids distintos) y Spinrad partía sus grupos (revisión F2b, ronda 2).
  const byId = (x, y) => x.localeCompare(y, 'en', { numeric: true }) || (x < y ? -1 : x > y ? 1 : 0);

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

  // Sucesos con unión-búsqueda (clonable); al final, claves de texto para _assemble ('INI', 'FIN', 'e<n>', '#<act>').
  function Events(from) {
    const parent = from ? from.slice() : [];
    const make = () => { parent.push(parent.length); return parent.length - 1; };
    const find = (x) => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
    const union = (x, y) => { x = find(x); y = find(y); if (x !== y) parent[y] = x; return x; };
    const clone = () => Events(parent);
    return { make, find, union, clone };
  }

  // Cierra una red: resuelve uniones, quita bucles y duplicados (uniendo sus motivos), funde los sucesos sin
  // entradas en el inicial y los sin salidas en el final, añade las ficticias de unicidad y la monta.
  function finish(method, T, ev0, arcs, dummies) {
    const ev = ev0.clone();   // las uniones del cierre no deben pasar a otra llamada (recubrimiento de Corneil-Gotlieb-Lee)
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

  // ---------- Spinrad (1986) ----------
  // Su modelo: cada tarea u con un suceso de inicio u− y uno de fin u+; preprocesado (§3): se funden los u+
  // con el mismo conjunto no vacío de posteriores (cierre) y los u− con el mismo de precedentes. Fases 1–3
  // con sus definiciones de restricción satisfecha (condiciones 1, 2, 3 y 5), arco legal y arco útil.
  function spinradModel(p) {
    const T = table(p);
    const ids = T.ids;
    const C = (a, b) => T.reach[a].has(b);
    const key = (set) => [...set].sort(byId).join(',');
    const Pg = {}; const Mg = {}; const groups = new Map(); let n = 0;
    const group = (k) => { if (!groups.has(k)) groups.set(k, n++); return groups.get(k); };
    for (const a of ids) {
      Pg[a] = group(T.reach[a].size ? `+${key(T.reach[a])}` : `+#${a}`);
      Mg[a] = group(T.anc[a].size ? `-${key(T.anc[a])}` : `-#${a}`);
    }
    const E1 = new Set(); const E2 = new Set(); const E3 = new Set();
    const has = (S, x, y) => S.has(`${x}>${y}`);
    const sat = (a, b) => ids.some((c) => C(a, c) && C(c, b))
      || ids.some((c) => C(c, b) && has(E1, Pg[a], Pg[c]))
      || ids.some((c) => C(a, c) && has(E2, Mg[c], Mg[b]))
      || has(E3, Pg[a], Mg[b]);
    const legal1 = (u, w) => ids.every((a) => Pg[a] !== Pg[u] || ids.every((b) => !ids.some((c) => Pg[c] === Pg[w] && C(c, b)) || C(a, b)));
    const legal2 = (w, u) => ids.every((b) => Mg[b] !== Mg[u] || ids.every((a) => !ids.some((c) => Mg[c] === Mg[w] && C(a, c)) || C(a, b)));
    const sortBy = (f) => [...ids].sort((x, y) => f(y) - f(x) || byId(x, y));
    // Fase 1: arcos (u+, w+), por grado de salida decreciente.
    let L = sortBy((a) => T.reach[a].size);
    while (L.length) {
      const u = L.shift();
      for (const w of L) {
        if (Pg[u] === Pg[w] || has(E1, Pg[u], Pg[w]) || !legal1(u, w)) continue;
        if (ids.some((c) => C(w, c) && ids.some((a) => Pg[a] === Pg[u] && !sat(a, c)))) E1.add(`${Pg[u]}>${Pg[w]}`);
      }
    }
    // Fase 2: arcos (w−, u−), por grado de entrada decreciente.
    L = sortBy((a) => T.anc[a].size);
    while (L.length) {
      const u = L.shift();
      for (const w of L) {
        if (Mg[u] === Mg[w] || has(E2, Mg[w], Mg[u]) || !legal2(w, u)) continue;
        if (ids.some((c) => C(c, w) && ids.some((b) => Mg[b] === Mg[u] && !sat(c, b)))) E2.add(`${Mg[w]}>${Mg[u]}`);
      }
    }
    // Fase 3: arcos (a+, b−) para lo que siga sin satisfacer.
    for (const a of ids) for (const b of ids) {
      if (!C(a, b) || sat(a, b)) continue;
      if (ids.every((x) => Pg[x] !== Pg[a] || ids.every((y) => Mg[y] !== Mg[b] || C(x, y)))) E3.add(`${Pg[a]}>${Mg[b]}`);
    }
    const edges = [...E1, ...E2, ...E3].map((e) => e.split('>').map(Number));
    const actsIn = (g, side) => ids.filter((a) => (side === '+' ? Pg[a] : Mg[a]) === g);
    return { T, groups: n, Pg, Mg, edges, arcs: edges.length, actsIn };
  }

  // Contrae una red: mientras haya ficticias que se puedan quitar, quita la primera por nombre (borrándola o
  // fundiendo sus sucesos) y vuelve a numerar.
  function contract(net, p, T) {
    let cur = net;
    for (;;) {
      const r = K.removable(cur, p, { first: true });   // las ficticias van en orden de nombre (F1, F2…)
      if (!r.length) return cur;
      const pick = r[0];
      const d = cur.dummies.find((x) => x.name === pick.name);
      const kind = new Map(cur.events.map((e) => [e.n, e.kind]));
      const key = (n) => (kind.get(n) === 'start' ? 'INI' : kind.get(n) === 'end' ? 'FIN' : `e${n}`);
      let map = (k) => k;
      if (pick.how === 'merge') {
        const a = key(d.from); const b = key(d.to);
        const into = a === 'INI' || b === 'INI' ? 'INI' : a === 'FIN' || b === 'FIN' ? 'FIN' : a;
        map = (k) => (k === a || k === b ? into : k);
      }
      const arcsK = cur.arcs.map((e) => ({ act: e.act, from: map(key(e.from)), to: map(key(e.to)) }));
      const dummiesK = cur.dummies.filter((x) => x !== d).map((x) => ({ from: map(key(x.from)), to: map(key(x.to)), rule: x.rule, because: x.because }))
        .filter((x) => x.from !== x.to);
      const kindOf = (u) => (u === 'INI' ? 'start' : u === 'FIN' ? 'end' : 'event');
      const { events, arcs, dummies } = A._assemble(arcsK, dummiesK, T.pairs, kindOf, () => []);
      cur = Object.assign({}, cur, { events, arcs, dummies });
    }
  }

  function spinrad(p) {
    const S = spinradModel(p);
    const ev = Events();
    const nodes = Array.from({ length: S.groups }, () => ev.make());
    const arcs = S.T.ids.map((a) => ({ act: a, from: nodes[S.Mg[a]], to: nodes[S.Pg[a]] }));
    const dummies = S.edges.map(([x, y]) => {
      const from = S.actsIn(x, '+').concat(S.actsIn(x, '-')); const to = S.actsIn(y, '-').concat(S.actsIn(y, '+'));
      return { from: nodes[x], to: nodes[y], rule: 'dependency', because: [...new Set([from[0], to[0]])].sort(byId) };
    });
    const model = finish('spinrad', S.T, ev, arcs, dummies);
    const net = contract(model, p, S.T);
    net.model = { dummies: model.dummies.length, events: model.events.length };
    return net;
  }

  // ---------- Corneil, Gotlieb y Lee (1973) ----------
  function cgl(p, opts) {
    const cover = !(opts && opts.cover === false);
    const budget = opts && opts.budget != null ? opts.budget : CGL_BUDGET;
    const T = table(p);
    const ids = T.ids;
    const ev = Events();
    const I = {}; const Tm = {};
    for (const a of ids) { I[a] = ev.make(); Tm[a] = ev.make(); }
    const same = (x, y) => x.length === y.length && x.every((e) => y.includes(e));
    const eqSet = (x, y) => x.size === y.size && [...x].every((e) => y.has(e));
    // §2, teoremas 1–3: el menor número de sucesos.
    for (const i of ids) for (const j of ids) {
      if (i === j) continue;
      if (same(T.preds[i], T.preds[j])) ev.union(I[i], I[j]);
      if (same(T.succ[i], T.succ[j])) ev.union(Tm[i], Tm[j]);
      if (T.preds[j].includes(i)) {
        const inter = T.preds[j].map((x) => T.reach[x]).reduce((s, y) => new Set([...s].filter((e) => y.has(e))));
        if (eqSet(inter, T.reach[i])) ev.union(Tm[i], I[j]);
      }
    }
    // §3: ficticias desde T(k) o desde I(l) hasta I(j).
    const sub = (x, y) => x.size < y.size && [...x].every((e) => y.has(e));
    const raw = []; const seen = new Set();
    const add = (from, to, because) => {
      const k = `${ev.find(from)}>${ev.find(to)}`;
      if (ev.find(from) === ev.find(to) || seen.has(k)) return;
      seen.add(k); raw.push({ from, to, rule: 'dependency', because });
    };
    for (const k of ids) {
      const X = T.succ[k].filter((l) => ev.find(Tm[k]) !== ev.find(I[l]));
      for (const j of X) {
        const below = X.filter((q) => q !== j && sub(T.anc[q], T.anc[j]));
        const G = below.filter((q) => !below.some((z) => z !== q && sub(T.anc[q], T.anc[z])));
        if (!G.length) add(Tm[k], I[j], [k, j]); else for (const l of G) add(I[l], I[j], [l, j]);
      }
    }
    const arcs = ids.map((a) => ({ act: a, from: I[a], to: Tm[a] }));
    const terminal = new Set(ids.map((a) => ev.find(Tm[a]))); const initial = new Set(ids.map((a) => ev.find(I[a])));
    const type3 = (d) => !terminal.has(ev.find(d.from)) && initial.has(ev.find(d.from));
    const fixed = raw.filter((d) => !type3(d)); const t3 = raw.filter(type3);
    const build = (ds) => finish('cgl', T, ev, arcs, ds);
    if (!cover) return Object.assign(build(raw), { approx: false });
    // Recubrimiento mínimo de las de tipo (3): el menor subconjunto que deja la red correcta, con presupuesto.
    const cost = (ids.length + raw.length) ** 2;
    let spent = 0; let best = null;
    for (let size = 0; size <= t3.length && !best && spent <= budget; size++) {
      const pick = [];
      const rec = (start) => {
        if (best || spent > budget) return;
        if (pick.length === size) { spent += cost; const net = build([...fixed, ...pick]); if (K.valid(net, p)) best = net; return; }
        for (let i = start; i < t3.length; i++) { pick.push(t3[i]); rec(i + 1); pick.pop(); }
      };
      rec(0);
    }
    if (best) return Object.assign(best, { approx: false });
    // Presupuesto agotado: recubrimiento voraz (se quita cada una de tipo 3 si la red sigue correcta).
    let keep = t3.slice();
    for (const d of t3) { const rest = keep.filter((x) => x !== d); if (K.valid(build([...fixed, ...rest]), p)) keep = rest; }
    return Object.assign(build([...fixed, ...keep]), { approx: true });
  }

  A.methods.prog = progressive;
  A.methods.cs = cohenSadeh;
  A.methods.kim = kim;
  A.methods.spinrad = spinrad;
  A.methods.cgl = (q) => cgl(q);
  const api = { progressive, cohenSadeh, kim, spinrad, spinradModel, cgl, CGL_BUDGET, _table: table };
  root.PNL = root.PNL || {};
  root.PNL.aoamethods = api;
  if (isNode) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
