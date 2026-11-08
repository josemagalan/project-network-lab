'use strict';
/*
 * Oráculo del mínimo de ficticias de una red PERT (F2a, T001). Solo para pruebas: lento, sin
 * dependencias de js/ y escrito para leerse, no para correr deprisa. Referencia de core/mindummy.
 *
 * Una red es un conjunto de sucesos; cada actividad va de su suceso de origen a su suceso de destino y
 * las ficticias unen sucesos. Es válida si a precede a b (directa o indirectamente) exactamente cuando
 * hay un camino del destino de a al origen de b, sin dos actividades con el mismo par de sucesos, sin
 * ciclos y con un solo suceso inicial y un solo suceso final.
 *
 * Búsqueda exhaustiva, con una sola poda que se deduce de esa definición: dos actividades pueden
 * terminar en el mismo suceso solo si tienen exactamente las mismas posteriores (en el cierre
 * transitivo), y empezar en el mismo suceso solo si tienen exactamente las mismas precedentes.
 * Prueba todas las maneras de repartir destinos y orígenes en sucesos, de fundir un suceso de destino
 * con uno de origen y de añadir sucesos sin actividades (hasta maxPure). Para cada reparto busca el menor
 * número de ficticias con una búsqueda completa: cada requisito que falta obliga a añadir una ficticia
 * que sale de (o llega a) un suceso concreto, y se prueban todas. Se queda con la red de menos ficticias.
 */

function closure(succ) {
  const acts = Object.keys(succ).sort();
  const reach = {};
  const visit = (a) => {
    if (reach[a]) return reach[a];
    const r = new Set();
    for (const b of succ[a]) { r.add(b); for (const c of visit(b)) r.add(c); }
    reach[a] = r;
    return r;
  };
  acts.forEach(visit);
  return { acts, before: (a, b) => reach[a].has(b), reach };
}

// Todas las particiones de un conjunto (listas de bloques).
function* partitions(items) {
  if (!items.length) { yield []; return; }
  const [first, ...rest] = items;
  for (const p of partitions(rest)) {
    for (let i = 0; i < p.length; i++) yield [...p.slice(0, i), [first, ...p[i]], ...p.slice(i + 1)];
    yield [[first], ...p];
  }
}

// Particiones que refinan las clases dadas (producto de las particiones de cada clase).
function* refining(classes) {
  if (!classes.length) { yield []; return; }
  const [c, ...rest] = classes;
  for (const p of partitions(c)) for (const q of refining(rest)) yield [...p, ...q];
}

function groupBy(acts, key) {
  const m = new Map();
  for (const a of acts) { const k = key(a); if (!m.has(k)) m.set(k, []); m.get(k).push(a); }
  return [...m.values()];
}

// Comprueba una red { nodes: int, arcs: [{act, from, to}], dummies: [{from, to}] } contra la tabla.
function check(succ, net) {
  const { acts, before } = closure(succ);
  const N = net.nodes;
  const out = Array.from({ length: N }, () => []);
  const indeg = new Array(N).fill(0);
  const seen = new Set();
  for (const { from, to } of net.arcs) {
    const key = `${from}>${to}`;
    if (from === to || seen.has(key)) return false;        // bucle o actividades paralelas
    seen.add(key);
  }
  for (const e of [...net.arcs, ...net.dummies]) { if (e.from === e.to) return false; out[e.from].push(e.to); indeg[e.to]++; }
  if (indeg.filter((d) => d === 0).length !== 1) return false;               // un solo suceso inicial
  if (out.filter((o) => o.length === 0).length !== 1) return false;          // un solo suceso final
  // Alcance y ausencia de ciclos (Kahn).
  const order = [];
  const deg = indeg.slice();
  const queue = deg.map((d, i) => (d === 0 ? i : -1)).filter((i) => i >= 0);
  while (queue.length) { const u = queue.shift(); order.push(u); for (const v of out[u]) if (--deg[v] === 0) queue.push(v); }
  if (order.length !== N) return false;
  const reach = Array.from({ length: N }, (_, i) => new Set([i]));
  for (const u of [...order].reverse()) for (const v of out[u]) for (const w of reach[v]) reach[u].add(w);
  const arc = Object.fromEntries(net.arcs.map((e) => [e.act, e]));
  if (acts.some((a) => !arc[a])) return false;
  for (const a of acts) for (const b of acts) {
    if (a === b) continue;
    if (reach[arc[a].to].has(arc[b].from) !== before(a, b)) return false;
  }
  return true;
}

function minDummies(succ, opts = {}) {
  const maxPure = opts.maxPure == null ? 1 : opts.maxPure;
  const { acts, before, reach } = closure(succ);
  const preds = Object.fromEntries(acts.map((b) => [b, acts.filter((a) => reach[a].has(b)).join(',')]));
  const headClasses = groupBy(acts, (a) => [...reach[a]].sort().join(','));
  const tailClasses = groupBy(acts, (a) => preds[a]);
  // Precedencias directas (cobertura): solo un camino de ficticias puede cumplirlas.
  const hasse = [];
  for (const a of acts) for (const b of acts) {
    if (before(a, b) && !acts.some((c) => before(a, c) && before(c, b))) hasse.push([a, b]);
  }

  // Estructuras de sucesos: reparto de destinos, de orígenes, fusiones y sucesos sin actividades.
  function* structures() {
    for (const heads of refining(headClasses)) {
      for (const tails of refining(tailClasses)) {
        const hb = new Map(); heads.forEach((b, i) => b.forEach((a) => hb.set(a, i)));
        const tb = new Map(); tails.forEach((b, i) => b.forEach((a) => tb.set(a, i)));
        const pairs = new Set();   // mismo bloque de destino y de origen → paralelas
        if (acts.some((a) => { const k = `${hb.get(a)}|${tb.get(a)}`; if (pairs.has(k)) return true; pairs.add(k); return false; })) continue;
        // Fundir el destino de a con el origen de b exige a ≺ b y, además, que toda precedente de b preceda a
        // toda posterior de a: si h(a) = t(b), cualquier d ≺ b llega a ese suceso y, desde él, a todo lo que
        // sigue a a.
        const predSet = (b) => acts.filter((d) => before(d, b));
        const canMerge = (i, j) => heads[i].every((a) => tails[j].every((b) => before(a, b)
          && predSet(b).every((d) => [...reach[a]].every((c) => before(d, c)))));
        const match = function* (i, used, acc) {
          if (i === heads.length) { yield acc; return; }
          for (let j = 0; j < tails.length; j++) if (!used.has(j) && canMerge(i, j)) yield* match(i + 1, new Set([...used, j]), [...acc, [i, j]]);
          yield* match(i + 1, used, acc);
        };
        for (const m of match(0, new Set(), [])) {
          for (let pure = 0; pure <= maxPure; pure++) {
            const headNode = []; const tailNode = []; let n = 0;
            const mergedTail = new Map(m.map(([i, j]) => [j, i]));
            heads.forEach((_, i) => { headNode[i] = n++; });
            tails.forEach((_, j) => { tailNode[j] = mergedTail.has(j) ? headNode[mergedTail.get(j)] : n++; });
            const nodes = n + pure;
            const arcs = acts.map((a) => ({ act: a, from: tailNode[tb.get(a)], to: headNode[hb.get(a)] }));
            const endsAt = Array.from({ length: nodes }, () => []);
            const startsAt = Array.from({ length: nodes }, () => []);
            for (const e of arcs) { endsAt[e.to].push(e.act); startsAt[e.from].push(e.act); }
            // Ficticia u→v posible solo si toda actividad que termina en u precede a toda la que empieza en v.
            const ok = (u, v) => u !== v && endsAt[u].every((a) => startsAt[v].every((c) => before(a, c)));
            // Cota inferior: todo suceso sin actividades que salgan (salvo el final) necesita una ficticia que
            // salga; y todo destino de a con una posterior directa b que no empieza ahí, también (ese camino solo
            // puede empezar por una ficticia). Lo mismo, al revés, para las que llegan. Cada ficticia cubre una
            // necesidad de cada lado como mucho.
            const arcOf = Object.fromEntries(arcs.map((e) => [e.act, e]));
            const needOut = new Set(); const needIn = new Set();
            for (const [a, b] of hasse) if (arcOf[a].to !== arcOf[b].from) { needOut.add(arcOf[a].to); needIn.add(arcOf[b].from); }
            const noOut = [...Array(nodes).keys()].filter((u) => !startsAt[u].length);
            const noIn = [...Array(nodes).keys()].filter((u) => !endsAt[u].length);
            const lbOut = new Set([...needOut, ...noOut]).size - (noOut.length ? 1 : 0);
            const lbIn = new Set([...needIn, ...noIn]).size - (noIn.length ? 1 : 0);
            // Descarte previo: si ni con todas las ficticias posibles hay camino para una precedencia directa,
            // este reparto no tiene solución.
            const out = Array.from({ length: nodes }, () => []);
            for (const e of arcs) out[e.from].push(e.to);
            for (let u = 0; u < nodes; u++) for (let v = 0; v < nodes; v++) if (ok(u, v)) out[u].push(v);
            const reachable = (u, w) => { const seen = new Set([u]); const st = [u]; while (st.length) { const x = st.pop(); if (x === w) return true; for (const y of out[x]) if (!seen.has(y)) { seen.add(y); st.push(y); } } return false; };
            if (hasse.some(([a, b]) => !reachable(arcOf[a].to, arcOf[b].from))) continue;
            yield { nodes, arcs, ok, lower: Math.max(0, lbOut, lbIn) };
          }
        }
      }
    }
  }

  // ¿Hay un conjunto de como mucho k ficticias que haga válida la estructura? Búsqueda completa: cada
  // requisito que falta (una precedencia directa sin camino, un segundo suceso final o inicial) obliga a
  // añadir una ficticia que sale (o entra) de un suceso concreto, y se ramifica sobre ella.
  function fit(s, k) {
    const arc = Object.fromEntries(s.arcs.map((e) => [e.act, e]));
    const dummies = [];
    const failed = new Set();   // conjuntos de ficticias ya descartados (el orden en que se añadieron no importa)
    const keyOf = () => dummies.map((d) => `${d.from}>${d.to}`).sort().join(' ');
    const reachOf = () => {
      const out = Array.from({ length: s.nodes }, () => []);
      for (const e of [...s.arcs, ...dummies]) out[e.from].push(e.to);
      const r = Array.from({ length: s.nodes }, () => null);
      const visit = (u, stack) => {
        if (r[u]) return r[u];
        if (stack.has(u)) return null;                       // ciclo
        stack.add(u);
        const set = new Set([u]);
        for (const v of out[u]) { const rv = visit(v, stack); if (!rv) return null; for (const w of rv) set.add(w); }
        stack.delete(u);
        r[u] = set;
        return set;
      };
      for (let u = 0; u < s.nodes; u++) if (!visit(u, new Set())) return { cyclic: true };
      return { r, out };
    };
    const dfs = () => {
      const key = keyOf();
      if (failed.has(key)) return false;
      const res = explore();
      if (!res) failed.add(key);
      return res;
    };
    const explore = () => {
      const R = reachOf();
      if (R.cyclic) return false;
      for (const a of acts) for (const b of acts) {
        if (a !== b && !before(a, b) && R.r[arc[a].to].has(arc[b].from)) return false;   // precedencia falsa
      }
      const branch = (froms, tos) => {
        if (dummies.length >= k) return false;
        for (const u of froms) for (const v of tos) {
          if (!s.ok(u, v) || dummies.some((d) => d.from === u && d.to === v)) continue;
          dummies.push({ from: u, to: v });
          if (dfs()) return true;
          dummies.pop();
        }
        return false;
      };
      const all = [...Array(s.nodes).keys()];
      const unmet = hasse.filter(([a, b]) => !R.r[arc[a].to].has(arc[b].from));
      // Cota inferior dinámica: cada suceso final sobrante y cada destino con un requisito pendiente y sin
      // ninguna ficticia de salida necesitan una ficticia nueva que salga de él (distintas entre sí); lo
      // mismo con los iniciales y las ficticias que llegan.
      const hasOutD = new Set(dummies.map((d) => d.from)); const hasInD = new Set(dummies.map((d) => d.to));
      const indeg0 = new Array(s.nodes).fill(0);
      for (const e of [...s.arcs, ...dummies]) indeg0[e.to]++;
      const sinks0 = all.filter((u) => R.out[u].length === 0);
      const sources0 = all.filter((u) => indeg0[u] === 0);
      const needO = new Set(sinks0); const needI = new Set(sources0);
      for (const [a, b] of unmet) { if (!hasOutD.has(arc[a].to)) needO.add(arc[a].to); if (!hasInD.has(arc[b].from)) needI.add(arc[b].from); }
      const lbo = needO.size - (sinks0.length ? 1 : 0); const lbi = needI.size - (sources0.length ? 1 : 0);
      if (dummies.length + Math.max(lbo, lbi, 0) > k) return false;
      const miss = unmet[0];
      // El camino que falta sale del destino de a; la primera ficticia que le falte sale de un suceso ya alcanzable.
      if (miss) return branch([...R.r[arc[miss[0]].to]], all);
      const sinks = all.filter((u) => R.out[u].length === 0);
      if (sinks.length > 1) return branch(sinks.slice(0, 2), all);
      const indeg = new Array(s.nodes).fill(0);
      for (const e of [...s.arcs, ...dummies]) indeg[e.to]++;
      const sources = all.filter((u) => indeg[u] === 0);
      if (sources.length > 1) {
        if (dummies.length >= k) return false;
        for (const v of sources.slice(0, 2)) for (const u of all) {
          if (!s.ok(u, v) || dummies.some((d) => d.from === u && d.to === v)) continue;
          dummies.push({ from: u, to: v });
          if (dfs()) return true;
          dummies.pop();
        }
        return false;
      }
      return check(succ, { nodes: s.nodes, arcs: s.arcs, dummies });
    };
    return dfs() ? { nodes: s.nodes, arcs: s.arcs, dummies: dummies.slice() } : null;
  }

  // Cota superior de partida (no afecta al resultado, solo acota la búsqueda): la construcción clásica
  // por conjuntos de posteriores directas, cerrados por intersección, con una ficticia por cada par de
  // conjuntos contenidos inmediatos y una más por cada actividad paralela sobrante.
  const direct = Object.fromEntries(acts.map((a) => [a, acts.filter((b) => hasse.some(([x, y]) => x === a && y === b))]));
  const fam = new Set(acts.map((a) => direct[a].join(',')).filter(Boolean));
  for (let grew = true; grew;) {
    grew = false;
    for (const x of [...fam]) for (const y of [...fam]) {
      const i = x.split(',').filter((e) => y.split(',').includes(e)).join(',');
      if (i && !fam.has(i)) { fam.add(i); grew = true; }
    }
  }
  const sets = [...fam].map((k) => new Set(k.split(',')));
  const sub = (X, Y) => X.size < Y.size && [...X].every((e) => Y.has(e));
  let upper = 0;
  for (const X of sets) for (const Y of sets) if (sub(Y, X) && !sets.some((Z) => sub(Y, Z) && sub(Z, X))) upper++;
  const startOf = (b) => { const sup = sets.filter((X) => X.has(b)); return sup.length ? sup.reduce((m, X) => (X.size < m.size ? X : m)) : null; };
  const par = new Map();
  for (const a of acts) { const k = `${startOf(a) ? [...startOf(a)].sort().join(',') : 'INI'}|${direct[a].join(',') || 'FIN'}`; par.set(k, (par.get(k) || 0) + 1); }
  for (const c of par.values()) upper += c - 1;

  let best = null;
  for (const s of structures()) {
    const limit = best ? best.dummies.length - 1 : upper;
    if (s.lower > limit) continue;
    for (let k = s.lower; k <= limit; k++) {
      const net = fit(s, k);
      if (net) { best = net; break; }
    }
    if (best && best.dummies.length === 0) break;
  }
  if (!best) throw new Error('oráculo: sin red válida (no debería ocurrir)');
  return { value: best.dummies.length, net: best };
}

module.exports = { minDummies, check, closure };
