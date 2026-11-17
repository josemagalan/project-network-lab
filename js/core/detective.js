/*
 * core/detective — una red ya hecha con errores sembrados, y la corrección de las marcas del alumno (spec
 * f3d-construir-detectar, AC9–AC11 y AC20; plan §0 y §3, P5, P6, H2 y H9).
 *
 * Redes: la ROY de la F1 (roycheck.fromTable) o la PERT de las reglas con la numeración de M2 (H9).
 * Tipos (grupos: red ROY, red PERT y cálculos de cada una):
 *   royMissing (falta un arco), royFalse (arco entre dos actividades sin relación), royInverted (una inmediata al revés),
 *   royCycle (arco que cierra un ciclo: de una actividad a otra anterior que no es inmediata);
 *   pertFalseDummy (ficticia entre sucesos sin relación), pertMissingDummy / pertInvertedDummy (de dependencia: falta o
 *   va al revés), pertParallel (sin una ficticia de identidad: dos actividades con los mismos sucesos);
 *   calcES (mínimo de los EF de las predecesoras), calcLF (máximo de los LS de las posteriores), calcFloat (LF − ES),
 *   calcCrit (crítica mal marcada), calcTE (mínimo), calcTL (máximo), calcSlack (signo cambiado). Una casilla en la que
 *   el error típico da el valor correcto no es candidata.
 * Elementos: nodo «A», arco ROY «A>B», suceso «e3», ficticia «d:3-5», valor «A.ES» o «e3.TE», crítica «A.crit». Cada
 *   error dice en qué elementos se acepta su marca (accept): lo que falta, en sus dos extremos; dos actividades
 *   paralelas, en cualquiera de las dos.
 * candidates(p, graph, type) · admissible(p, graph) · seed(p, { sd, level, graph, kind, count? }) →
 *   { graph, kind, count, errors, shown: { roy | pert, values }, skipped } o null si la tabla no admite ningún tipo del
 *   grupo · forSeed(params, sd, opts): la primera semilla desde sd cuya tabla siembra (H2) · grade(seeded, marks) ·
 *   explain(error) → { key, params }.
 * Sembrado: secuencias propias mulberry32((sd · 7 + SALT[…]) >>> 0), que no tocan la del generador; tipos sorteados entre
 *   los admisibles del grupo; ningún error comparte elemento ni objeto de la red con otro; los de la red se confirman con
 *   roycheck o aoacheck (cada uno se ve solo, y juntos dan la unión de lo que da cada uno). Valores (P6): los de la
 *   tabla verdadera salvo los sembrados; con solo errores de la red, sin cifras. Sin DOM ni azar.
 */
(function (root) {
  'use strict';

  const isNode = typeof module !== 'undefined' && module.exports;
  const req = (f, k) => (isNode ? require(f) : root.PNL[k]);
  const PR = req('./project.js', 'project');
  const G = req('./generator.js', 'generator');
  const R = req('./rng.js', 'rng');
  const C = req('./cpm.js', 'cpm');
  const A = req('./aoa.js', 'aoa');
  const K = req('./aoacheck.js', 'aoacheck');
  const RC = req('./roycheck.js', 'roycheck');

  const TYPES = {
    aon: { net: ['royMissing', 'royFalse', 'royInverted', 'royCycle'], calc: ['calcES', 'calcLF', 'calcFloat', 'calcCrit'] },
    aoa: { net: ['pertFalseDummy', 'pertMissingDummy', 'pertInvertedDummy', 'pertParallel'], calc: ['calcTE', 'calcTL', 'calcSlack', 'calcCrit'] },
  };
  const SALT = { pick: 1, royMissing: 11, royFalse: 13, royInverted: 17, royCycle: 19, pertFalseDummy: 23, pertMissingDummy: 29,
    pertInvertedDummy: 31, pertParallel: 37, calcES: 41, calcLF: 43, calcFloat: 47, calcCrit: 53, calcTE: 59, calcTL: 61, calcSlack: 67 };
  const COUNT = { easy: 1, medium: 2, hard: 3, custom: 2 };
  const TRIES = 60;
  const byId = (a, b) => a.localeCompare(b, 'en', { numeric: true });
  const rnd = (x) => { const v = Math.round(x * 1e9) / 1e9; return v === 0 ? 0 : v; };
  const groupOf = (graph, kind) => [...(kind === 'calc' ? [] : TYPES[graph].net), ...(kind === 'net' ? [] : TYPES[graph].calc)];

  // ---------- la tabla verdadera ----------
  function context(p) {
    const ids = p.activities.map((a) => a.id).sort(byId);
    const red = A._reduce(p);
    const sol = C.solve(p);
    const crit = new Set(sol.critical);
    const net = A.build(p, { method: 'rules' });
    const t = A.times(net, sol);
    const d = (e) => (e.act ? sol.times[e.act].EF - sol.times[e.act].ES : 0);
    const edges = [...net.arcs, ...net.dummies];
    const evs = net.events.map((e) => e.n);
    const out = new Map(evs.map((n) => [n, []]));
    for (const e of edges) out.get(e.from).push(e.to);
    const ereach = new Map(evs.map((n) => {
      const seen = new Set(); const st = [...out.get(n)];
      while (st.length) { const x = st.pop(); if (!seen.has(x)) { seen.add(x); st.push(...out.get(x)); } }
      return [n, seen];
    }));
    const acts = Object.fromEntries(ids.map((a) => [a, { ES: sol.times[a].ES, EF: sol.times[a].EF, LS: sol.times[a].LS, LF: sol.times[a].LF,
      TF: sol.floats[a].TF, crit: crit.has(a) }]));
    const events = Object.fromEntries(evs.map((n) => [n, { TE: t.TE[n], TL: t.TL[n], slack: t.slack[n] }]));
    return { p, ids, red, sol, crit, net, edges, d, evs, ereach, acts, events };
  }

  // ---------- candidatos ----------
  const arcKey = (a, b) => `${a}>${b}`;
  function list(ctx, graph, type) {
    const { p, ids, red: { reach, direct }, acts, events, net, edges, d, evs, ereach } = ctx;
    const out = [];
    const imm = []; for (const b of ids) for (const a of p.preds[b]) if (direct[a].includes(b)) imm.push([a, b]);
    // Los valores de un suceso (eN.TE, eN.TL, eN.slack) tocan también «goneN»: un error pertParallel que borra ese suceso
    // de la red que se enseña no puede ir con un error de cálculo en él (no se dibujaría; revisión de T018, N-F1).
    const calc = (element, wrong, right) => {
      if (rnd(wrong) === rnd(right)) return;
      const ev = /^e(\d+)\./.exec(element);
      out.push(Object.assign({ element, accept: [element], wrong: rnd(wrong), right }, ev ? { touches: [element, `gone${ev[1]}`] } : {}));
    };
    switch (type) {
      case 'royMissing': for (const [a, b] of imm) out.push({ element: arcKey(a, b), accept: [a, b], data: { from: a, to: b }, touches: [arcKey(a, b)] }); break;
      case 'royInverted': for (const [a, b] of imm) out.push({ element: arcKey(b, a), accept: [arcKey(b, a)], data: { from: b, to: a }, touches: [arcKey(a, b), arcKey(b, a)] }); break;
      case 'royFalse':
        for (const x of ids) for (const y of ids) if (x !== y && !reach[x].has(y) && !reach[y].has(x)) out.push({ element: arcKey(x, y), accept: [arcKey(x, y)], data: { from: x, to: y }, touches: [arcKey(x, y), arcKey(y, x)] });
        break;
      case 'royCycle':
        for (const x of ids) for (const y of [...reach[x]].sort(byId)) if (!direct[x].includes(y)) out.push({ element: arcKey(y, x), accept: [arcKey(y, x)], data: { from: y, to: x }, touches: [arcKey(y, x), arcKey(x, y)] });
        break;
      case 'pertFalseDummy':
        for (const u of evs) for (const v of evs) if (u < v && !ereach.get(u).has(v) && !ereach.get(v).has(u)) out.push({ element: `d:${u}-${v}`, accept: [`d:${u}-${v}`], data: { from: u, to: v }, touches: [`ev${u}`, `ev${v}`] });
        break;
      case 'pertMissingDummy': case 'pertInvertedDummy':
        for (const x of net.dummies) {
          if (x.rule === 'equal') continue;
          const shown = type === 'pertMissingDummy' ? `d:${x.from}-${x.to}` : `d:${x.to}-${x.from}`;
          out.push({ element: shown, accept: type === 'pertMissingDummy' ? [`e${x.from}`, `e${x.to}`] : [shown],
            data: { dummy: x.name, from: x.from, to: x.to }, touches: [x.name] });
        }
        break;
      case 'pertParallel':
        for (const x of net.dummies) {
          if (x.rule !== 'equal') continue;
          const into = edges.filter((e) => e.to === x.from); const from = edges.filter((e) => e.from === x.from);
          if (into.length !== 1 || !into[0].act || from.length !== 1) continue;
          const mover = into[0];
          const twin = net.arcs.find((e) => e.from === mover.from && e.to === x.to && e !== mover);
          if (!twin) continue;
          const pair = [mover.act, twin.act].sort(byId);
          out.push({ element: pair.join('='), accept: pair, data: { dummy: x.name, act: mover.act, twin: twin.act, from: mover.from, to: x.to, gone: x.from },
            touches: [x.name, `ev${x.from}`, `ev${x.to}`, `ev${mover.from}`, `gone${x.from}`] });
        }
        break;
      case 'calcES':
        for (const a of ids) if (p.preds[a].length >= 2) calc(`${a}.ES`, Math.min(...p.preds[a].map((q) => acts[q].EF)), acts[a].ES);
        break;
      case 'calcLF':
        for (const a of ids) if (p.succs[a].length >= 2) calc(`${a}.LF`, Math.max(...p.succs[a].map((q) => acts[q].LS)), acts[a].LF);
        break;
      case 'calcFloat': for (const a of ids) calc(`${a}.TF`, acts[a].LF - acts[a].ES, acts[a].TF); break;
      case 'calcCrit': for (const a of ids) out.push({ element: `${a}.crit`, accept: [`${a}.crit`], wrong: !acts[a].crit, right: acts[a].crit }); break;
      case 'calcTE':
        for (const n of evs) { const inc = edges.filter((e) => e.to === n); if (inc.length >= 2) calc(`e${n}.TE`, Math.min(...inc.map((e) => events[e.from].TE + d(e))), events[n].TE); }
        break;
      case 'calcTL':
        for (const n of evs) { const o = edges.filter((e) => e.from === n); if (o.length >= 2) calc(`e${n}.TL`, Math.max(...o.map((e) => events[e.to].TL - d(e))), events[n].TL); }
        break;
      case 'calcSlack': for (const n of evs) if (events[n].slack !== 0) calc(`e${n}.slack`, -events[n].slack, events[n].slack); break;
      default: throw new RangeError(`detective: tipo ${type}`);
    }
    void graph;
    return out;
  }
  const strip = (c) => { const o = { element: c.element, accept: c.accept }; if ('wrong' in c) { o.wrong = c.wrong; o.right = c.right; } return o; };
  function candidates(p, graph, type) { return list(context(p), graph, type).map(strip); }

  function admissible(p, graph) {
    const ctx = context(p);
    return Object.fromEntries(groupOf(graph, 'all').map((t) => [t, list(ctx, graph, t).length > 0]));
  }

  // ---------- la red con los errores ----------
  function royWith(ctx, errs) {
    const net = RC.fromTable(ctx.p);
    let arcs = net.arcs.slice();
    for (const e of errs) {
      const { from, to } = e.data;
      if (e.type === 'royMissing') arcs = arcs.filter((a) => !(a.from === from && a.to === to));
      else if (e.type === 'royInverted') { arcs = arcs.filter((a) => !(a.from === to && a.to === from)); arcs.push({ from, to }); }
      else arcs.push({ from, to });
    }
    return { nodes: net.nodes, arcs };
  }
  function pertWith(ctx, errs) {
    const base = ctx.net;
    let events = base.events.map((e) => Object.assign({}, e));
    const arcs = base.arcs.map((a) => ({ act: a.act, from: a.from, to: a.to }));
    let dummies = base.dummies.map((x) => ({ name: x.name, from: x.from, to: x.to }));
    const prefix = A.dummyPrefix(ctx.ids);
    // Cada ficticia de más, con su número (revisión de T018, N-F2: dos se llamaban igual).
    let extra = 0;
    for (const e of errs) {
      const x = e.data;
      if (e.type === 'pertFalseDummy') dummies.push({ name: `${prefix}${base.dummies.length + (++extra)}`, from: x.from, to: x.to });
      else if (e.type === 'pertMissingDummy') dummies = dummies.filter((q) => q.name !== x.dummy);
      else if (e.type === 'pertInvertedDummy') dummies = dummies.map((q) => (q.name === x.dummy ? { name: q.name, from: x.to, to: x.from } : q));
      else if (e.type === 'pertParallel') {
        dummies = dummies.filter((q) => q.name !== x.dummy);
        arcs.find((a) => a.act === x.act).to = x.to;
        events = events.filter((q) => q.n !== x.gone);
      }
    }
    return { events, arcs, dummies };
  }

  const keyR = (i) => `${i.code}:${i.ids.join(',')}:${(i.nodes || []).join(',')}`;
  const keyA = (q) => `${q.code}:${(q.ids || []).join(',')}:${(q.events || []).join(',')}:${q.dummy === undefined ? '' : q.dummy}`;
  const SIGN = { royMissing: 1, royFalse: 1, royInverted: 1, royCycle: 2 };
  function confirm(ctx, graph, netErrs) {
    if (!netErrs.length) return true;
    const probs = graph === 'aon'
      ? (errs) => RC.diagnose(ctx.p, royWith(ctx, errs)).issues.map(keyR)
      : (errs) => K.diagnose(pertWith(ctx, errs), ctx.p).problems.filter((q) => q.code !== 'unnecessaryDummy').map(keyA);
    const union = new Set();
    for (const e of netErrs) {
      const s = probs([e]);
      if (!s.length || (graph === 'aon' && s.length !== SIGN[e.type])) return false;
      s.forEach((k) => union.add(k));
    }
    const all = probs(netErrs);
    return all.length === union.size && all.every((k) => union.has(k));
  }

  function valuesWith(ctx, graph, calcErrs) {
    const v = graph === 'aon'
      ? { acts: Object.fromEntries(Object.entries(ctx.acts).map(([k, x]) => [k, Object.assign({}, x)])) }
      : { events: Object.fromEntries(Object.entries(ctx.events).map(([k, x]) => [k, Object.assign({}, x)])),
        crit: Object.fromEntries(ctx.ids.map((a) => [a, ctx.acts[a].crit])) };
    for (const e of calcErrs) {
      const [who, f] = e.element.split('.');
      if (graph === 'aon') v.acts[who][f] = e.wrong;
      else if (f === 'crit') v.crit[who] = e.wrong;
      else v.events[who.slice(1)][f] = e.wrong;
    }
    return v;
  }

  // ---------- sembrado ----------
  function seed(p, opts) {
    const o = opts || {};
    const graph = o.graph === 'aoa' ? 'aoa' : 'aon';
    const kind = ['net', 'calc', 'all'].includes(o.kind) ? o.kind : 'all';
    const count = Number.isInteger(o.count) && o.count > 0 ? o.count : (COUNT[o.level] || 2);
    const sd = Number(o.sd) || 0;
    const ctx = context(p);
    const types = groupOf(graph, kind);
    const cands = Object.fromEntries(types.map((t) => [t, list(ctx, graph, t)]));
    const adm = types.filter((t) => cands[t].length);
    const skipped = types.filter((t) => !cands[t].length);
    if (!adm.length) return null;
    const pick = R.mulberry32((sd * 7 + SALT.pick) >>> 0);
    const rngs = {};
    const rngOf = (t) => (rngs[t] = rngs[t] || R.mulberry32((sd * 7 + SALT[t]) >>> 0));
    for (let attempt = 0; attempt < TRIES; attempt++) {
      const chosen = []; const accepted = new Set(); const touched = new Set();
      let bag = [];
      for (let k = 0; k < count; k++) {
        if (!bag.length) bag = R.shuffle(pick, adm);
        const first = bag.pop();
        const order = [first, ...adm.filter((t) => t !== first)];
        let got = null;
        for (const t of order) {
          const free = cands[t].filter((c) => c.accept.every((x) => !accepted.has(x)) && !accepted.has(c.element) && (c.touches || [c.element]).every((x) => !touched.has(x)));
          if (!free.length) continue;
          got = Object.assign({ type: t }, free[R.int(rngOf(t), 0, free.length - 1)]);
          break;
        }
        if (!got) break;
        chosen.push(got);
        got.accept.forEach((x) => accepted.add(x)); accepted.add(got.element);
        (got.touches || [got.element]).forEach((x) => touched.add(x));
      }
      if (chosen.length < count) continue;
      const netErrs = chosen.filter((e) => !e.type.startsWith('calc'));
      if (!confirm(ctx, graph, netErrs)) continue;
      const errors = chosen.map((e, i) => {
        const x = { id: i + 1, type: e.type, element: e.element, accept: e.accept.slice() };
        if ('wrong' in e) { x.wrong = e.wrong; x.right = e.right; }
        if (e.data) x.data = Object.assign({}, e.data);
        return x;
      });
      const shown = { values: kind === 'net' ? null : valuesWith(ctx, graph, errors.filter((e) => e.type.startsWith('calc'))) };
      if (graph === 'aon') shown.roy = royWith(ctx, netErrs); else shown.pert = pertWith(ctx, netErrs);
      return { graph, kind, count, errors, shown, skipped };
    }
    return null;
  }

  // H2: la primera semilla desde sd cuya tabla siembra algo del grupo pedido.
  function forSeed(params, sd, opts) {
    for (let s = sd; s < sd + 200; s++) {
      const g = G.generate(s, params);
      if (!g.ok) continue;
      const project = PR.parse(g.rows, g.mode).project;
      const seeded = seed(project, Object.assign({}, opts, { sd: s }));
      if (seeded) return { sd: s, moved: s !== sd, rows: g.rows, mode: g.mode, project, seeded };
    }
    return null;
  }

  // ---------- corrección ----------
  function grade(seeded, marks) {
    const ms = Array.isArray(marks) ? marks : [];
    const errors = seeded.errors;
    const perError = errors.map((e) => {
      const on = ms.filter((m) => e.accept.includes(m.element));
      const hit = on.find((m) => m.type === e.type);
      if (hit) return { id: e.id, status: 'found', mark: hit };
      if (on.length) return { id: e.id, status: 'half', mark: on[0] };
      return { id: e.id, status: 'missed' };
    });
    const falseAlarms = ms.filter((m) => !errors.some((e) => e.accept.includes(m.element)));
    const found = perError.filter((x) => x.status === 'found').length;
    const half = perError.filter((x) => x.status === 'half').length;
    const n = seeded.count || errors.length;
    const score = 100 * Math.max(0, found + 0.5 * half - 0.5 * falseAlarms.length) / n;
    return { perError, falseAlarms, score };
  }

  function explain(error) {
    const params = Object.assign({ element: error.element }, error.data || {});
    if ('wrong' in error) { params.wrong = error.wrong; params.right = error.right; }
    return { key: `det.${error.type}`, params };
  }

  const api = { TYPES, COUNT, candidates, admissible, seed, forSeed, grade, explain };
  root.PNL = root.PNL || {};
  root.PNL.detective = api;
  if (isNode) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
