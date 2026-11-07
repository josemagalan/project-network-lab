/*
 * core/matrix — matriz de encadenamiento del método ROY (Tema 6b del autor).
 * Fila = actividad; columna = su predecesora; celda = valor del arco = duración de la predecesora.
 * A la derecha, la columna t (tiempo mínimo de comienzo = ES); abajo, la fila T (tiempo máximo de
 * comienzo = LS). active(k) dice qué se resalta en el paso k de la MISMA traza que usa la red (AC16).
 */
(function (root) {
  'use strict';

  const isNode = typeof module !== 'undefined' && module.exports;
  const T = isNode ? require('./topo.js') : root.PNL.topo;
  const { START, END } = T;

  function build(solution, project) {
    const s = solution;
    const labels = [START, ...s.order, END];
    const index = new Map(labels.map((l, i) => [l, i]));
    const dur = Object.fromEntries(project.activities.map((a) => [a.id, a.d]));
    dur[START] = 0; dur[END] = 0;
    const predsOf = (id) => {
      if (id === START) return [];
      if (id === END) return s.order.filter((x) => !project.succs[x].length);
      return project.preds[id].length ? project.preds[id] : [START];
    };
    const grid = labels.map((row) => {
      const ps = new Set(predsOf(row));
      return labels.map((col) => (ps.has(col) ? dur[col] : null));
    });
    const tCol = labels.map((l) => s.times[l].ES);
    const TRow = labels.map((l) => s.times[l].LS);

    function active(k) {
      const st = s.trace[k];
      if (!st || (st.kind !== 'forward' && st.kind !== 'backward')) return { cells: [], chosen: [] };
      const a = index.get(st.act);
      const chosen = new Set(st.formula.chosen);
      if (st.kind === 'forward') {
        const cells = st.formula.terms.map((t) => [a, index.get(t.from)]);
        return { row: a, target: 't', cells, chosen: cells.filter(([, j]) => chosen.has(labels[j])) };
      }
      const cells = st.formula.terms.map((t) => [index.get(t.from), a]);
      return { col: a, target: 'T', cells, chosen: cells.filter(([i]) => chosen.has(labels[i])) };
    }

    return { labels, cell: (i, j) => grid[i][j], tCol, TRow, active };
  }

  const api = { build };
  root.PNL = root.PNL || {};
  root.PNL.matrix = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
