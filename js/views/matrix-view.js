/*
 * views/matrix-view — la matriz de encadenamiento (core/matrix) como tabla HTML, sincronizada con el
 * paso: misma traza, misma casilla activa (spec AC16). Sin innerHTML.
 */
(function (root) {
  'use strict';

  const G = root.PNL;

  function render(container, ctx) {
    const { h, clear } = G.dom;
    const { matrix, stepIndex, revealed, lang, nota, numFmt } = ctx;
    const N = G.i18n.notation(nota);
    const a = matrix.active(stepIndex);
    const labels = matrix.labels;
    const name = (id) => G.narrate.nodeName(lang, id);
    const cells = new Set(a.cells.map(([i, j]) => `${i},${j}`));
    const chosen = new Set(ctx.hide ? [] : a.chosen.map(([i, j]) => `${i},${j}`));   // decisión F7
    const tVal = (i) => {
      const id = labels[i];
      if (id === G.topo.START) return numFmt(0);
      return revealed.has(`${id}.ES`) ? numFmt(revealed.get(`${id}.ES`)) : '';
    };
    const TVal = (j) => {
      const id = labels[j];
      if (id === G.topo.START) return revealed.has(`${labels[1]}.LS`) ? numFmt(matrix.TRow[0]) : '';
      return revealed.has(`${id}.LS`) ? numFmt(revealed.get(`${id}.LS`)) : '';
    };
    // La esquina lleva texto solo para lectores de pantalla (axe: empty-table-header).
    const corner = h('th', { scope: 'col' }, [h('span', { class: 'sr-only' }, [G.i18n.t(lang, 'view.matrixCorner')])]);
    const head = h('tr', {}, [corner,
      ...labels.map((l, j) => h('th', { scope: 'col', class: a.col === j ? 'on' : '' }, [name(l)])),
      h('th', { scope: 'col', class: 'on' }, [N.ES])]);
    const body = labels.map((row, i) => h('tr', {}, [
      h('th', { scope: 'row', class: a.row === i ? 'on' : '' }, [name(row)]),
      ...labels.map((_, j) => {
        const v = matrix.cell(i, j);
        const k = `${i},${j}`;
        const cls = i === j ? 'diag' : chosen.has(k) ? 'cellchosen' : cells.has(k) ? 'cellon' : (a.row === i || a.col === j) ? 'rowon' : '';
        return h('td', { class: cls }, [i === j ? '·' : v == null ? '' : numFmt(v)]);
      }),
      h('td', { class: `tcell${a.row === i && a.target === 't' ? ' on' : ''}` }, [tVal(i)]),
    ]));
    const foot = h('tr', {}, [h('th', { scope: 'row', class: 'on' }, [N.LS]),
      ...labels.map((_, j) => h('td', { class: `tcell${a.col === j && a.target === 'T' ? ' on' : ''}` }, [TVal(j)])), h('td', { class: 'diag' }, [''])]);
    clear(container).appendChild(h('table', { class: 'grid' }, [h('thead', {}, [head]), h('tbody', {}, [...body, foot])]));
  }

  const api = { render };
  root.PNL = root.PNL || {};
  root.PNL.matrixView = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
