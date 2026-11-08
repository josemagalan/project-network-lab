/*
 * core/mindummy — mínimo de ficticias de una red PERT (spec f2a-pert-ficticias, AC4 y AC9; plan P3, T002).
 *
 * Minimizar ficticias es NP-completo (Krishnamoorthy y Deo, 1979), así que se combinan dos cotas y una
 * búsqueda con presupuesto FIJO (unidades de trabajo, nunca tiempo: constitución 14, mismo enlace, mismo
 * resultado en cualquier ordenador):
 *   - cota superior: las ficticias de la red de las reglas (core/aoa);
 *   - cota inferior global: cada suceso de destino distinto (salvo el final) necesita una ficticia de salida,
 *     salvo que se funda con el único suceso de origen de todas sus posteriores directas; lo mismo al revés
 *     con los de origen (emparejamiento máximo); cada actividad paralela de más suma una necesidad a un lado.
 *   - si las cotas coinciden, el mínimo queda demostrado sin buscar; si no, búsqueda completa: se reparten
 *     los sucesos de destino entre las actividades con las mismas posteriores (en el cierre) y los de origen
 *     entre las que tienen las mismas precedentes, se funden un destino y un origen solo cuando es posible
 *     (a ≺ b y toda precedente de b precede a toda posterior de a), se admite un suceso sin actividades, y
 *     para cada reparto se buscan las ficticias: cada requisito pendiente obliga a una ficticia que sale (o
 *     llega) de un suceso concreto o alcanzable, y se ramifica sobre ella. Para en cuanto alcanza la cota.
 * Comprobado contra el oráculo de fuerza bruta (tests/oracle-mindummy.js). Prototipo: 02-DOCS (no público).
 */
(function (root) {
  'use strict';

  const isNode = typeof module !== 'undefined' && module.exports;
  const A = isNode ? require('./aoa.js') : root.PNL.aoa;
  const DEFAULT_BUDGET = 80000;   // calibrado en T010: ≈ 2 s como mucho con 30 actividades (plan §7)
  const MAX_PURE = 1;

  function* partitions(items) {
    if (!items.length) { yield []; return; }
    const [first, ...rest] = items;
    for (const p of partitions(rest)) {
      for (let i = 0; i < p.length; i++) yield [...p.slice(0, i), [first, ...p[i]], ...p.slice(i + 1)];
      yield [[first], ...p];
    }
  }
  function* refining(classes) {
    if (!classes.length) { yield []; return; }
    const [c, ...rest] = classes;
    for (const p of partitions(c)) for (const q of refining(rest)) yield [...p, ...q];
  }
  function groupBy(items, key) {
    const m = new Map();
    for (const x of items) { const k = key(x); if (!m.has(k)) m.set(k, []); m.get(k).push(x); }
    return [...m.values()];
  }

  // Datos del orden: cierre, cobertura (precedencias directas) y claves de bloques.
  function order(p) {
    const { ids, reach, direct } = A._reduce(p);
    const before = (a, b) => reach[a].has(b);
    const hasse = ids.flatMap((a) => direct[a].map((b) => [a, b]));
    const predStar = Object.fromEntries(ids.map((b) => [b, ids.filter((d) => before(d, b))]));
    const headKey = (a) => [...reach[a]].sort().join(',');
    const tailKey = (b) => predStar[b].slice().sort().join(',');
    // Fundir el destino de a con el origen de b: a ≺ b y toda precedente de b precede a toda posterior de a.
    const mergeable = (a, b) => before(a, b) && predStar[b].every((d) => [...reach[a]].every((c) => before(d, c)));
    return { ids, reach, before, hasse, predStar, headKey, tailKey, mergeable };
  }

  function lowerBound(o) {
    const { ids, hasse, headKey, tailKey, mergeable } = o;
    const heads = [...new Set(ids.map(headKey))];
    const tails = [...new Set(ids.map(tailKey))];
    const blockOk = (h, t) => ids.filter((a) => headKey(a) === h).every((a) => ids.filter((b) => tailKey(b) === t).every((b) => mergeable(a, b)));
    const outFree = new Set(); const inFree = new Set();
    for (const h of heads) {
      if (h === '') continue;
      const a = ids.find((x) => headKey(x) === h);
      const ts = new Set(hasse.filter(([x]) => x === a).map(([, b]) => tailKey(b)));
      if (ts.size === 1) { const t = [...ts][0]; if (blockOk(h, t)) outFree.add(t); }
    }
    for (const t of tails) {
      if (t === '') continue;
      const b = ids.find((x) => tailKey(x) === t);
      const hs = new Set(hasse.filter(([, y]) => y === b).map(([a]) => headKey(a)));
      if (hs.size === 1) { const h = [...hs][0]; if (blockOk(h, t)) inFree.add(h); }
    }
    const lbOut = heads.filter((h) => h !== '').length - outFree.size;
    const lbIn = tails.filter((t) => t !== '').length - inFree.size;
    const par = new Map();
    for (const a of ids) { const k = `${headKey(a)}|${tailKey(a)}`; par.set(k, (par.get(k) || 0) + 1); }
    const extra = [...par.values()].reduce((s, c) => s + c - 1, 0);
    let lower = Infinity;
    for (let x = 0; x <= extra; x++) lower = Math.min(lower, Math.max(0, lbOut + x, lbIn + extra - x));
    return lower;
  }

  // Búsqueda completa con presupuesto. Devuelve la mejor red encontrada por debajo de upper (o null).
  function search(o, upper, lower, budget) {
    const { ids, before, hasse, headKey, tailKey, mergeable } = o;
    let work = 0; let exhausted = false;
    let best = null; let bestVal = upper;

    function* structures() {
      for (const heads of refining(groupBy(ids, headKey))) {
        for (const tails of refining(groupBy(ids, tailKey))) {
          const hb = new Map(); heads.forEach((b, i) => b.forEach((a) => hb.set(a, i)));
          const tb = new Map(); tails.forEach((b, i) => b.forEach((a) => tb.set(a, i)));
          const pairs = new Set();
          if (ids.some((a) => { const k = `${hb.get(a)}|${tb.get(a)}`; if (pairs.has(k)) return true; pairs.add(k); return false; })) continue;
          const canMerge = (i, j) => heads[i].every((a) => tails[j].every((b) => mergeable(a, b)));
          const match = function* (i, used, acc) {
            if (i === heads.length) { yield acc; return; }
            for (let j = 0; j < tails.length; j++) if (!used.has(j) && canMerge(i, j)) yield* match(i + 1, new Set([...used, j]), [...acc, [i, j]]);
            yield* match(i + 1, used, acc);
          };
          for (const m of match(0, new Set(), [])) {
            for (let pure = 0; pure <= MAX_PURE; pure++) {
              const headNode = []; const tailNode = []; let n = 0;
              const merged = new Map(m.map(([i, j]) => [j, i]));
              heads.forEach((_, i) => { headNode[i] = n++; });
              tails.forEach((_, j) => { tailNode[j] = merged.has(j) ? headNode[merged.get(j)] : n++; });
              const nodes = n + pure;
              const arcs = ids.map((a) => ({ act: a, from: tailNode[tb.get(a)], to: headNode[hb.get(a)] }));
              const endsAt = Array.from({ length: nodes }, () => []);
              const startsAt = Array.from({ length: nodes }, () => []);
              for (const e of arcs) { endsAt[e.to].push(e.act); startsAt[e.from].push(e.act); }
              const ok = (u, v) => u !== v && endsAt[u].every((a) => startsAt[v].every((c) => before(a, c)));
              const arcOf = Object.fromEntries(arcs.map((e) => [e.act, e]));
              const needOut = new Set(); const needIn = new Set();
              for (const [a, b] of hasse) if (arcOf[a].to !== arcOf[b].from) { needOut.add(arcOf[a].to); needIn.add(arcOf[b].from); }
              const noOut = [...Array(nodes).keys()].filter((u) => !startsAt[u].length);
              const noIn = [...Array(nodes).keys()].filter((u) => !endsAt[u].length);
              const lb = Math.max(0, new Set([...needOut, ...noOut]).size - (noOut.length ? 1 : 0),
                new Set([...needIn, ...noIn]).size - (noIn.length ? 1 : 0));
              const out = Array.from({ length: nodes }, () => []);
              for (const e of arcs) out[e.from].push(e.to);
              for (let u = 0; u < nodes; u++) for (let v = 0; v < nodes; v++) if (ok(u, v)) out[u].push(v);
              const reachable = (u, w) => { const seen = new Set([u]); const st = [u]; while (st.length) { const x = st.pop(); if (x === w) return true; for (const y of out[x]) if (!seen.has(y)) { seen.add(y); st.push(y); } } return false; };
              if (hasse.some(([a, b]) => !reachable(arcOf[a].to, arcOf[b].from))) continue;
              yield { nodes, arcs, arcOf, ok, lower: lb };
            }
          }
        }
      }
    }

    function fit(s, k) {
      const dummies = [];
      const failed = new Set();
      const reachOf = () => {
        const out = Array.from({ length: s.nodes }, () => []);
        for (const e of [...s.arcs, ...dummies]) out[e.from].push(e.to);
        const r = new Array(s.nodes).fill(null);
        const visit = (u, stack) => {
          if (r[u]) return r[u];
          if (stack.has(u)) return null;
          stack.add(u);
          const set = new Set([u]);
          for (const v of out[u]) { const rv = visit(v, stack); if (!rv) return null; for (const w of rv) set.add(w); }
          stack.delete(u);
          r[u] = set;
          return set;
        };
        for (let u = 0; u < s.nodes; u++) if (!visit(u, new Set())) return null;
        return { r, out };
      };
      const tryAdd = (u, v) => {
        if (!s.ok(u, v) || dummies.some((d) => d.from === u && d.to === v)) return false;
        dummies.push({ from: u, to: v });
        if (dfs()) return true;
        dummies.pop();
        return false;
      };
      const dfs = () => {
        if (++work > budget) { exhausted = true; return false; }
        const key = dummies.map((d) => `${d.from}>${d.to}`).sort().join(' ');
        if (failed.has(key)) return false;
        const res = explore();
        if (!res && !exhausted) failed.add(key);
        return res;
      };
      const explore = () => {
        const R = reachOf();
        if (!R) return false;
        const { arcOf } = s;
        for (const a of ids) for (const b of ids) if (a !== b && !before(a, b) && R.r[arcOf[a].to].has(arcOf[b].from)) return false;
        const all = [...Array(s.nodes).keys()];
        const unmet = hasse.filter(([a, b]) => !R.r[arcOf[a].to].has(arcOf[b].from));
        const indeg = new Array(s.nodes).fill(0);
        for (const e of [...s.arcs, ...dummies]) indeg[e.to]++;
        const sinks = all.filter((u) => R.out[u].length === 0);
        const sources = all.filter((u) => indeg[u] === 0);
        const hasOutD = new Set(dummies.map((d) => d.from)); const hasInD = new Set(dummies.map((d) => d.to));
        const needO = new Set(sinks); const needI = new Set(sources);
        for (const [a, b] of unmet) { if (!hasOutD.has(arcOf[a].to)) needO.add(arcOf[a].to); if (!hasInD.has(arcOf[b].from)) needI.add(arcOf[b].from); }
        const lb = Math.max(needO.size - (sinks.length ? 1 : 0), needI.size - (sources.length ? 1 : 0), 0);
        if (dummies.length + lb > k) return false;
        if (unmet.length) {
          if (dummies.length >= k) return false;
          for (const u of R.r[arcOf[unmet[0][0]].to]) for (const v of all) if (tryAdd(u, v)) return true;
          return false;
        }
        if (sinks.length > 1) {
          if (dummies.length >= k) return false;
          for (const u of sinks.slice(0, 2)) for (const v of all) if (tryAdd(u, v)) return true;
          return false;
        }
        if (sources.length > 1) {
          if (dummies.length >= k) return false;
          for (const v of sources.slice(0, 2)) for (const u of all) if (tryAdd(u, v)) return true;
          return false;
        }
        return true;
      };
      return dfs() ? { nodes: s.nodes, arcs: s.arcs, dummies: dummies.slice() } : null;
    }

    for (const s of structures()) {
      if (bestVal <= lower) break;
      if (++work > budget) { exhausted = true; break; }
      const limit = bestVal - 1;
      if (s.lower > limit) continue;
      for (let k = s.lower; k <= limit; k++) {
        const net = fit(s, k);
        if (net) { best = net; bestVal = k; break; }
        if (exhausted) break;
      }
      if (exhausted) break;
    }
    return { best, bestVal, exhausted };
  }

  // De una red con sucesos numerados 0..n−1 a una red del formato de core/aoa.
  function toNet(found, o) {
    const indeg = new Array(found.nodes).fill(0); const outdeg = new Array(found.nodes).fill(0);
    for (const e of [...found.arcs, ...found.dummies]) { outdeg[e.from]++; indeg[e.to]++; }
    const key = (u) => (indeg[u] === 0 ? 'INI' : outdeg[u] === 0 ? 'FIN' : `m${u}`);
    const arcsK = found.arcs.map((e) => ({ act: e.act, from: key(e.from), to: key(e.to) }));
    const dummiesK = found.dummies.map((d) => ({ from: key(d.from), to: key(d.to), rule: 'min' }));
    const kindOf = (u) => (u === 'INI' ? 'start' : u === 'FIN' ? 'end' : 'event');
    const { events, arcs, dummies } = A._assemble(arcsK, dummiesK, o.hasse, kindOf, () => []);
    return { method: 'min', events, arcs, dummies, trace: [] };
  }

  function solve(p, opts) {
    const budget = opts && opts.budget != null ? opts.budget : DEFAULT_BUDGET;
    const rulesNet = A.build(p, { method: 'rules' });
    const upper = rulesNet.dummies.length;
    const o = order(p);
    const lower = Math.min(upper, lowerBound(o));
    const asMin = Object.assign({}, rulesNet, { method: 'min', trace: [] });
    if (lower === upper) return { value: upper, exact: true, lower, net: asMin };
    const { best, bestVal, exhausted } = search(o, upper, lower, budget);
    const net = best ? toNet(best, o) : asMin;
    return { value: bestVal, exact: !exhausted, lower: exhausted ? lower : bestVal, net };
  }

  const api = { solve, DEFAULT_BUDGET };
  root.PNL = root.PNL || {};
  root.PNL.mindummy = api;
  if (isNode) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
