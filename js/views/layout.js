/*
 * views/layout — dónde va cada nodo de la red ROY. Sin DOM: se prueba en Node.
 * Columnas = niveles (inicio en la 0, fin en la última). Las flechas que saltan columnas reciben un
 * nodo virtual en cada columna intermedia (método de Sugiyama): así ocupan su propio carril y nunca
 * pasan por detrás de una caja. Dentro de cada columna, el orden inicial es el topológico y después se
 * aplican barridos por baricentro (hacia delante con las predecesoras y hacia atrás con las sucesoras)
 * para reducir cruces; se conserva el mejor orden encontrado.
 * row es una posición centrada (…, −0,5, 0,5, …) para que columnas de distinto tamaño queden alineadas.
 * bends['U>V'] da los puntos {col,row} por los que pasa una flecha larga, en orden.
 */
(function (root) {
  'use strict';

  const isNode = typeof module !== 'undefined' && module.exports;
  const T = isNode ? require('../core/topo.js') : root.PNL.topo;
  const { START, END, byId } = T;

  // Campos de cada formato de caja, en orden de lectura (spec AC17; tableros aprobados).
  const BOX_FIELDS = { '7': ['ES', 'd', 'EF', 'id', 'LS', 'TF', 'LF'], '4': ['id', 'ES', 'LS', 'd'], c: ['ES', 'd', 'LS', 'id'] };

  function graph(solution, project) {
    const order = solution.order;
    const preds = (id) => (id === END ? order.filter((x) => !project.succs[x].length)
      : id === START ? [] : (project.preds[id].length ? project.preds[id] : [START]));
    const succs = (id) => (id === START ? order.filter((x) => !project.preds[x].length)
      : id === END ? [] : (project.succs[id].length ? project.succs[id] : [END]));
    return { preds, succs };
  }

  const virt = (u, v, c) => `${u}>${v}#${c}`;

  // Grafo ampliado: nodos reales y virtuales, todas las aristas entre columnas contiguas.
  function expand(solution, project) {
    const g = graph(solution, project);
    const col = (id) => solution.levels.get(id);
    const preds = new Map();
    const succs = new Map();
    const colOf = new Map();
    const add = (m, k, x) => { if (!m.has(k)) m.set(k, []); m.get(k).push(x); };
    const all = [START, ...solution.order, END];
    for (const id of all) { colOf.set(id, col(id)); preds.set(id, []); succs.set(id, []); }
    const chains = [];
    for (const u of [START, ...solution.order]) {
      for (const v of g.succs(u)) {
        const chain = [u];
        for (let c = col(u) + 1; c < col(v); c++) {
          const w = virt(u, v, c);
          colOf.set(w, c); preds.set(w, []); succs.set(w, []);
          chain.push(w);
        }
        chain.push(v);
        for (let i = 0; i + 1 < chain.length; i++) { add(succs, chain[i], chain[i + 1]); add(preds, chain[i + 1], chain[i]); }
        if (chain.length > 2) chains.push({ key: `${u}>${v}`, ids: chain.slice(1, -1) });
      }
    }
    return { preds, succs, colOf, chains };
  }

  function place(columns) {
    const nodes = {};
    columns.forEach((col, c) => col.forEach((id, i) => { nodes[id] = { col: c, row: i - (col.length - 1) / 2 }; }));
    return nodes;
  }

  function countCrossings(nodes, edges) {
    let n = 0;
    for (let i = 0; i < edges.length; i++) {
      for (let j = i + 1; j < edges.length; j++) {
        const [a, b] = edges[i];
        const [c, d] = edges[j];
        if (nodes[a].col !== nodes[c].col) continue;
        if ((nodes[a].row - nodes[c].row) * (nodes[b].row - nodes[d].row) < 0) n++;
      }
    }
    return n;
  }

  const edgeList = (x) => {
    const edges = [];
    for (const [u, vs] of x.succs) for (const v of vs) edges.push([u, v]);
    return edges;
  };

  function layout(solution, project, opts) {
    const sweeps = opts && opts.sweeps != null ? opts.sweeps : 4;
    const x = expand(solution, project);
    const last = solution.levels.get(END);
    const columns = Array.from({ length: last + 1 }, () => []);
    columns[0].push(START);
    for (const id of solution.order) columns[solution.levels.get(id)].push(id);
    // Cada nodo virtual entra en su columna justo después de los reales, en el orden de su origen.
    for (const ch of x.chains) for (const w of ch.ids) columns[x.colOf.get(w)].push(w);
    columns[last].push(END);
    const edges = edgeList(x);

    let nodes = place(columns);
    let best = { nodes, score: countCrossings(nodes, edges) };
    const mean = (ids) => (ids.length ? ids.reduce((a, id) => a + nodes[id].row, 0) / ids.length : 0);
    for (let k = 0; k < sweeps; k++) {
      for (let c = 1; c < last; c++) {
        columns[c].sort((a, b) => mean(x.preds.get(a)) - mean(x.preds.get(b)) || byId(a, b));
        nodes = place(columns);
      }
      for (let c = last - 1; c >= 1; c--) {
        columns[c].sort((a, b) => mean(x.succs.get(a)) - mean(x.succs.get(b)) || byId(a, b));
        nodes = place(columns);
      }
      const score = countCrossings(nodes, edges);
      if (score < best.score) best = { nodes, score };
    }
    const real = {};
    for (const id of [START, ...solution.order, END]) real[id] = best.nodes[id];
    const bends = {};
    for (const ch of x.chains) bends[ch.key] = ch.ids.map((w) => best.nodes[w]);
    const rows = Math.max(...columns.map((c) => c.length));
    return { cols: last + 1, rows, nodes: real, bends };
  }

  // Cruces entre columnas contiguas, contando los tramos de las flechas largas.
  function crossings(lay, solution, project) {
    const x = expand(solution, project);
    const nodes = Object.assign({}, lay.nodes);
    for (const ch of x.chains) ch.ids.forEach((w, i) => { nodes[w] = lay.bends[ch.key][i]; });
    return countCrossings(nodes, edgeList(x));
  }

  const api = { BOX_FIELDS, layout, crossings, graph };
  root.PNL = root.PNL || {};
  root.PNL.layout = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
