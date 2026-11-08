/*
 * views/aoa-layout — dónde va cada suceso de la red PERT (spec f2a-pert-ficticias, AC13; plan P5). Sin DOM.
 * Columnas por nivel: una actividad avanza una columna y una ficticia ninguna, así que las ficticias entre
 * sucesos de la misma columna quedan verticales, como en las diapositivas del autor. Las flechas que saltan
 * columnas reciben un carril (nodo virtual) en cada columna intermedia (Sugiyama), como en views/layout.
 * Dentro de cada columna, los sucesos unidos por ficticias verticales van juntos y en el orden que evita que
 * una ficticia pase por encima de otro suceso; después, barridos por baricentro para reducir cruces. Si una
 * ficticia vertical no puede ir recta (un suceso con tres o más), se marca en `curved` y se dibuja curvada.
 * La numeración de los sucesos es la de core/aoa (i < j); la colocación no la cambia.
 */
(function (root) {
  'use strict';

  const MAX_PERM = 6;

  function columns(net) {
    const N = net.events.length;
    const col = { 1: 0 };
    const edges = [...net.arcs.map((e) => ({ label: e.act, from: e.from, to: e.to, w: 1 })),
      ...net.dummies.map((d) => ({ label: d.name, from: d.from, to: d.to, w: 0 }))];
    for (let n = 2; n <= N; n++) col[n] = Math.max(0, ...edges.filter((e) => e.to === n).map((e) => col[e.from] + e.w));
    return { col, edges, cols: col[N] + 1 };
  }

  function* permutations(xs) {
    if (xs.length <= 1) { yield xs; return; }
    for (let i = 0; i < xs.length; i++) for (const p of permutations([...xs.slice(0, i), ...xs.slice(i + 1)])) yield [xs[i], ...p];
  }

  function expand(net) {
    const { col, edges, cols } = columns(net);
    const N = net.events.length;
    const vertical = edges.filter((e) => e.w === 0 && col[e.from] === col[e.to]);
    const preds = new Map(); const succs = new Map(); const colOf = new Map();
    const node = (k, c) => { if (!colOf.has(k)) { colOf.set(k, c); preds.set(k, []); succs.set(k, []); } };
    for (let n = 1; n <= N; n++) node(n, col[n]);
    const chains = {};
    for (const e of edges) {
      if (vertical.includes(e)) continue;
      const chain = [e.from];
      for (let c = col[e.from] + 1; c < col[e.to]; c++) { const v = `${e.label}#${c}`; node(v, c); chain.push(v); }
      chain.push(e.to);
      for (let i = 0; i + 1 < chain.length; i++) { succs.get(chain[i]).push(chain[i + 1]); preds.get(chain[i + 1]).push(chain[i]); }
      if (chain.length > 2) chains[e.label] = chain.slice(1, -1);
    }
    return { col, cols, N, vertical, preds, succs, colOf, chains };
  }

  function countCrossings(rowOf, colOf, succs) {
    const edges = [];
    for (const [u, vs] of succs) for (const v of vs) edges.push([u, v]);
    let n = 0;
    for (let i = 0; i < edges.length; i++) {
      for (let j = i + 1; j < edges.length; j++) {
        const [a, b] = edges[i]; const [c, d] = edges[j];
        if (colOf.get(a) !== colOf.get(c)) continue;
        if ((rowOf.get(a) - rowOf.get(c)) * (rowOf.get(b) - rowOf.get(d)) < 0) n++;
      }
    }
    return n;
  }

  function layout(net, opts) {
    const sweeps = opts && opts.sweeps != null ? opts.sweeps : 4;
    const x = expand(net);
    // Grupos de sucesos unidos por ficticias verticales (unión-búsqueda).
    const parent = new Map([...x.colOf.keys()].map((k) => [k, k]));
    const find = (k) => (parent.get(k) === k ? k : find(parent.get(k)));
    for (const e of x.vertical) parent.set(find(e.from), find(e.to));
    const key = (k) => (typeof k === 'number' ? `0${String(k).padStart(4, '0')}` : `1${k}`);
    const columnsList = Array.from({ length: x.cols }, () => []);
    for (const k of [...x.colOf.keys()].sort((a, b) => (key(a) < key(b) ? -1 : 1))) columnsList[x.colOf.get(k)].push(k);
    const spans = (order) => {   // ficticias verticales que pasan por encima de otro suceso
      const at = new Map(order.map((k, i) => [k, i]));
      return x.vertical.filter((e) => at.has(e.from) && at.has(e.to)).map((e) => {
        const lo = Math.min(at.get(e.from), at.get(e.to)); const hi = Math.max(at.get(e.from), at.get(e.to));
        return hi - lo > 1 ? e.label : null;
      }).filter(Boolean);
    };
    // Mejor orden interno de un grupo: el que menos ficticias hace pasar por encima de otro suceso.
    const bestCache = new Map();
    const groupOrder = (members) => {
      const k = members.join(',');
      if (bestCache.has(k)) return bestCache.get(k);
      let best = members;
      if (members.length > 1 && members.length <= MAX_PERM) {
        let score = Infinity;
        for (const p of permutations(members)) { const sc = spans(p).length; if (sc < score) { score = sc; best = p; } }
      }
      bestCache.set(k, best);
      return best;
    };
    const arrange = (list, weight) => {
      const groups = new Map();
      for (const k of list) { const r = find(k); if (!groups.has(r)) groups.set(r, []); groups.get(r).push(k); }
      const items = [...groups.values()].map((m) => ({ members: groupOrder(m), w: m.reduce((a, k) => a + weight(k), 0) / m.length, first: key(m[0]) }));
      items.sort((a, b) => a.w - b.w || (a.first < b.first ? -1 : 1));
      return items.flatMap((it) => it.members);
    };
    const place = () => {
      const rowOf = new Map();
      columnsList.forEach((c) => c.forEach((k, i) => rowOf.set(k, i - (c.length - 1) / 2)));
      return rowOf;
    };
    for (let c = 0; c < x.cols; c++) columnsList[c] = arrange(columnsList[c], () => 0);
    let rowOf = place();
    let best = { rowOf, score: countCrossings(rowOf, x.colOf, x.succs) };
    const mean = (ids, fallback) => (ids.length ? ids.reduce((a, k) => a + rowOf.get(k), 0) / ids.length : fallback);
    for (let s = 0; s < sweeps; s++) {
      for (let c = 1; c < x.cols; c++) { columnsList[c] = arrange(columnsList[c], (k) => mean(x.preds.get(k), rowOf.get(k))); rowOf = place(); }
      for (let c = x.cols - 2; c >= 0; c--) { columnsList[c] = arrange(columnsList[c], (k) => mean(x.succs.get(k), rowOf.get(k))); rowOf = place(); }
      const score = countCrossings(rowOf, x.colOf, x.succs);
      if (score < best.score) best = { rowOf, score };
    }
    // Ajuste final por intercambios: dos bloques vecinos de una columna (un suceso, un carril o un grupo
    // unido por ficticias verticales) cambian de sitio si eso reduce los cruces.
    if (sweeps > 0) {
      columnsList.forEach((c, i) => { columnsList[i] = c.slice().sort((a, b) => best.rowOf.get(a) - best.rowOf.get(b)); });
      rowOf = place();
      const blocks = (c) => {
        const out = [];
        for (const k of columnsList[c]) { const r = find(k); if (out.length && find(out[out.length - 1][0]) === r) out[out.length - 1].push(k); else out.push([k]); }
        return out;
      };
      let score = countCrossings(rowOf, x.colOf, x.succs);
      for (let pass = 0, improved = true; improved && pass < 10; pass++) {
        improved = false;
        for (let c = 0; c < x.cols; c++) {
          const bl = blocks(c);
          for (let i = 0; i + 1 < bl.length; i++) {
            const trial = [...bl.slice(0, i), bl[i + 1], bl[i], ...bl.slice(i + 2)];
            const saved = columnsList[c];
            columnsList[c] = trial.flat();
            const r2 = place();
            const sc = countCrossings(r2, x.colOf, x.succs);
            if (sc < score) { score = sc; rowOf = r2; improved = true; bl.splice(0, bl.length, ...trial); } else columnsList[c] = saved;
          }
        }
      }
      if (score <= best.score) best = { rowOf, score };
    }
    const pos = {};
    for (let n = 1; n <= x.N; n++) pos[n] = { col: x.col[n], row: best.rowOf.get(n) };
    const bends = {};
    for (const [label, ids] of Object.entries(x.chains)) bends[label] = ids.map((k) => ({ col: x.colOf.get(k), row: best.rowOf.get(k) }));
    const curved = [];
    for (let c = 0; c < x.cols; c++) {
      const order = [...x.colOf.keys()].filter((k) => x.colOf.get(k) === c).sort((a, b) => best.rowOf.get(a) - best.rowOf.get(b));
      curved.push(...spans(order));
    }
    return { cols: x.cols, rows: Math.max(...columnsList.map((c) => c.length)), pos, bends, curved: curved.sort() };
  }

  // Cruces entre columnas contiguas, contando los tramos de las flechas largas.
  function crossings(lay, net) {
    const x = expand(net);
    const rowOf = new Map();
    for (const [n, p] of Object.entries(lay.pos)) rowOf.set(Number(n), p.row);
    for (const [label, ids] of Object.entries(x.chains)) ids.forEach((k, i) => rowOf.set(k, lay.bends[label][i].row));
    return countCrossings(rowOf, x.colOf, x.succs);
  }

  const api = { layout, crossings, columns: (net) => columns(net).col };
  root.PNL = root.PNL || {};
  root.PNL.aoaLayout = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
