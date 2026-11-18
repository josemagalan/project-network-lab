/*
 * views/normal-table — la tabla de la normal de «Probabilidad (TCL)» (spec f3e-probabilidad-montecarlo; análisis H1;
 * tablero 95; decisión 3 de los bocetos: panel lateral no modal). Φ(z) de 0,00 a 3,49 con cuatro decimales, como las
 * tablas impresas, calculada con threept.tableP (el mismo redondeo que la corrección): no es un dato copiado.
 *
 * rows() y locate() no usan el DOM (tests/ex-prob.test.js). render(ctx) pinta el panel: «Buscar z», el valor de Φ y la
 * tabla HTML con encabezados de fila (unidades y décimas) y de columna (centésimas); la fila, la columna y la casilla
 * de la z buscada van resaltadas (también con borde y negrita, no solo color). Esc lo cierra.
 */
(function (root) {
  'use strict';

  const isNode = typeof module !== 'undefined' && module.exports;
  const T = isNode ? require('../core/threept.js') : root.PNL.threept;

  const ROWS = 35;
  const COLS = 10;
  let memo = null;

  /** Las 35 filas (z0 = 0,0 … 3,4) con Φ(z0 + j/100) de la tabla, j = 0…9. */
  function rows() {
    if (!memo) {
      memo = [];
      for (let i = 0; i < ROWS; i++) memo.push({ z0: i / 10, p: Array.from({ length: COLS }, (_, j) => T.tableP((i * 10 + j) / 100).p4) });
    }
    return memo;
  }

  /** La casilla de una z escrita (coma o punto), redondeada a dos decimales como la tabla; null si no es un número o se sale. */
  function locate(text) {
    const s = String(text == null ? '' : text).trim().replace(',', '.');
    if (!/^[-−]?\d*\.?\d+$/.test(s)) return null;
    const x = Number(s.replace('−', '-'));
    const t = T.tableP(x);
    const k = Math.round(Math.abs(t.z2) * 100);
    if (!Number.isFinite(x) || k >= ROWS * COLS) return null;
    return { z: t.z2, row: Math.floor(k / COLS), col: k % COLS, p: t.p4, neg: t.z2 < 0 };
  }

  const fmt = (lang, x, k) => (lang === 'es' ? x.toFixed(k).replace('.', ',').replace('-', '−') : x.toFixed(k).replace('-', '−'));

  /**
   * ctx: { lang, t(key, params), z (texto de «Buscar z»), onSearch(texto), onClose() }. Devuelve el panel (una región con su título).
   */
  function render(ctx) {
    const { h } = root.PNL.dom;
    const lang = ctx.lang;
    const t = ctx.t;
    const hit = locate(ctx.z);
    const head = h('tr', {}, [h('th', { scope: 'col' }, ['z'])].concat(Array.from({ length: COLS }, (_, j) =>
      h('th', { scope: 'col', class: hit && hit.col === j ? 'hit' : null }, [fmt(lang, j / 100, 2)]))));
    const body = rows().map((r, i) => h('tr', { class: hit && hit.row === i ? 'hit' : null }, [h('th', { scope: 'row' }, [fmt(lang, r.z0, 1)])]
      .concat(r.p.map((p, j) => h('td', { class: hit && hit.row === i && hit.col === j ? 'hit' : hit && (hit.row === i || hit.col === j) ? 'line' : null }, [fmt(lang, p, 4)])))));
    let found = '';
    if (String(ctx.z || '').trim()) {
      if (!hit) found = t('pb.normal.out');
      else if (hit.neg) found = t('pb.normal.neg', { z: fmt(lang, hit.z, 2), a: fmt(lang, -hit.z, 2), p: fmt(lang, hit.p, 4) });
      else found = t('pb.normal.found', { z: fmt(lang, hit.z, 2), p: fmt(lang, hit.p, 4) });
    }
    const input = h('input', { type: 'text', id: 'pbNormalZ', inputmode: 'decimal', autocomplete: 'off', spellcheck: 'false', value: ctx.z || '', size: '6',
      'aria-describedby': 'pbNormalP', oninput: (e) => ctx.onSearch(e.target.value) });
    return h('section', { class: 'card pb-normal', id: 'pbNormal', 'aria-labelledby': 'pbNormalHead',
      onkeydown: (e) => { if (e.key === 'Escape') { e.preventDefault(); ctx.onClose(); } } }, [
      h('div', { class: 'ex-head' }, [h('h2', { id: 'pbNormalHead' }, [t('pb.normal.title')]),
        h('button', { type: 'button', class: 'ghost pb-x', id: 'pbNormalClose', 'aria-label': t('pb.normal.close'), onclick: () => ctx.onClose() }, ['×'])]),
      h('div', { class: 'pb-nsearch' }, [h('label', { for: 'pbNormalZ' }, [t('pb.normal.search')]), input,
        h('span', { id: 'pbNormalP', role: 'status' }, [found])]),
      h('div', { class: 'pb-nbox', tabindex: '0' }, [
        h('table', { class: 'data pb-ntable' }, [h('caption', {}, [t('pb.normal.caption')]), h('thead', {}, [head]), h('tbody', {}, body)])]),
      h('p', { class: 'muted small' }, [t('pb.normal.note')])]);
  }

  /** Lleva la fila buscada a la vista dentro de su caja (sin mover la página). */
  function reveal(panel) {
    const box = panel && panel.querySelector('.pb-nbox');
    const row = box && box.querySelector('tr.hit');
    if (row) box.scrollTop = Math.max(0, row.offsetTop - box.clientHeight / 2);
  }

  const api = { ROWS, COLS, rows, locate, render, reveal };
  root.PNL = root.PNL || {};
  root.PNL.normalTable = api;
  if (isNode) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
