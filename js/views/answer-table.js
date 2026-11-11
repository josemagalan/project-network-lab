/*
 * views/answer-table — la tabla de respuestas de «Ejercicios» (F3a; plan P4; tableros 37–48): una tabla HTML de campos
 * de texto, sin cuadrícula ARIA ni teclas propias. Tab y Mayús + Tab recorren las casillas en orden de lectura; Intro
 * baja a la misma columna de la fila siguiente. Las críticas son casillas de verificación. Con corrección, cada casilla
 * lleva su marca por icono, borde y fondo, y su estado en texto para el lector de pantalla (nunca solo color, AC15).
 * Lo que escribe el alumno entra siempre como valor del campo, sin interpretarlo (constitución, principio 22).
 */
(function (root) {
  'use strict';

  const G = root.PNL;
  const ICON = {
    ok: 'M2 6.5l2.5 2.5L10 3', carried: 'M2 2v4a2 2 0 0 0 2 2h6M7.5 5.5L10 8l-2.5 2.5', wrong: 'M3 3l6 6M9 3l-6 6', blank: 'M3 6h6', invalid: 'M6 2v5M6 9v1.2',
  };
  const NS = 'http://www.w3.org/2000/svg';

  function icon(state) {
    const svg = root.document.createElementNS(NS, 'svg');
    svg.setAttribute('width', '12'); svg.setAttribute('height', '12'); svg.setAttribute('viewBox', '0 0 12 12');
    svg.setAttribute('aria-hidden', 'true'); svg.setAttribute('focusable', 'false');
    const p = root.document.createElementNS(NS, 'path');
    p.setAttribute('d', ICON[state]); p.setAttribute('fill', 'none'); p.setAttribute('stroke', 'currentColor'); p.setAttribute('stroke-width', '2');
    svg.appendChild(p);
    return svg;
  }

  // Una marca: icono y estado en texto (el texto solo lo lee el lector de pantalla; se enlaza con aria-describedby).
  function mark(state, id, t) {
    const { h } = G.dom;
    return h('span', { class: 'ex-mark', id }, [icon(state), h('span', { class: 'sr-only' }, [t(`ex.st.${state}`)])]);
  }

  const cellId = (key) => `exc-${key.replace(/[^A-Za-z0-9]/g, '_')}`;

  // Campo de una casilla. ctx: { value, state, locked, label, key, onInput, onFocus, onEnter, t }
  function cell(c) {
    const { h } = G.dom;
    const markId = `${cellId(c.key)}-m`;
    const input = h('input', { type: 'text', inputmode: 'decimal', autocomplete: 'off', spellcheck: 'false', id: cellId(c.key), 'data-key': c.key, value: c.value || '',
      maxlength: String(G.urlstate.EX.value),                    // el límite de cada valor en el enlace (T020): escribir de más no vacía las respuestas
      'aria-label': c.label, 'aria-describedby': c.state ? markId : null, readonly: c.locked ? 'readonly' : null,
      oninput: (e) => c.onInput(c.key, e.target.value), onfocus: () => c.onFocus(c.key),
      onkeydown: (e) => { if (e.key === 'Enter') { e.preventDefault(); c.onEnter(c.key); } } });
    return h('span', { class: `ex-cell${c.state ? ` st-${c.state}` : ''}${c.selected ? ' sel' : ''}` }, [input, c.state ? mark(c.state, markId, c.t) : null]);
  }

  // Tabla de las actividades. ctx: { project, cols, ans, grading, locked, sel, selKey, labelOf, t, onInput, onFocus, onCrit, onEnter, numFmt }
  function acts(ctx) {
    const { h } = G.dom;
    const t = ctx.t;
    const ids = ctx.project.activities.map((a) => a.id);
    const d = Object.fromEntries(ctx.project.activities.map((a) => [a.id, a.d]));
    const st = (k) => (ctx.grading && ctx.grading.cells[k] ? ctx.grading.cells[k].state : null);
    const head = h('tr', {}, [h('th', { scope: 'col', class: 'id' }, [t('ex.act')]), h('th', { scope: 'col', class: 'd' }, [t('ex.d')])]
      .concat(ctx.cols.act.map((c) => h('th', { scope: 'col' }, [c.label])))
      .concat(ctx.cols.crit ? [h('th', { scope: 'col' }, [t('ex.crit')])] : []));
    const body = ids.map((a) => {
      const v = ctx.ans.act[a] || {};
      const crit = (ctx.ans.crit || []).includes(a);
      const cst = st(`${a}.crit`);
      const critId = `${cellId(`${a}.crit`)}`;
      return h('tr', { class: ctx.sel === a ? 'sel' : '', 'data-act': a }, [
        h('th', { scope: 'row', class: 'id' }, [a]),
        h('td', { class: 'd' }, [ctx.numFmt(d[a])]),
      ].concat(ctx.cols.act.map((c) => h('td', {}, [cell({ key: `${a}.${c.f}`, value: v[c.f], state: st(`${a}.${c.f}`), locked: ctx.locked, selected: ctx.selKey === `${a}.${c.f}`,
        label: ctx.labelOf(`${a}.${c.f}`), t, onInput: ctx.onInput, onFocus: ctx.onFocus, onEnter: ctx.onEnter })])))
        .concat(ctx.cols.crit ? [h('td', {}, [h('span', { class: `ex-cell ex-check${cst ? ` st-${cst}` : ''}${ctx.selKey === `${a}.crit` ? ' sel' : ''}` }, [
          h('input', { type: 'checkbox', id: critId, 'data-key': `${a}.crit`, checked: crit, disabled: ctx.locked, 'aria-label': t('ex.lab.act', { f: t('ex.crit'), a }),
            'aria-describedby': cst ? `${critId}-m` : null, onchange: (e) => ctx.onCrit(a, e.target.checked), onfocus: () => ctx.onFocus(`${a}.crit`) }),
          cst ? mark(cst, `${critId}-m`, t) : null])])] : []));
    });
    return h('table', { class: 'data ex-ans' }, [h('caption', { class: 'sr-only' }, [t('ex.tableCaption')]), h('thead', {}, [head]), h('tbody', {}, body)]);
  }

  // Tabla de los sucesos. ctx: { events: [n], cols, ans, grading, locked, selEv, selKey, labelOf, t, onInput, onFocus, onEnter }
  function events(ctx) {
    const { h } = G.dom;
    const t = ctx.t;
    const st = (k) => (ctx.grading && ctx.grading.cells[k] ? ctx.grading.cells[k].state : null);
    const head = h('tr', {}, [h('th', { scope: 'col', class: 'id' }, [t('ex.event')])]
      .concat(ctx.cols.events.map((c) => h('th', { scope: 'col' }, [c.f === 'slack' ? t('ex.slack') : t(`ex.${c.f}`, { s: c.sym })]))));
    const body = ctx.events.map((n) => {
      const v = ctx.ans.ev[n] || {};
      return h('tr', { class: ctx.selEv === n ? 'sel' : '', 'data-ev': String(n) }, [h('th', { scope: 'row', class: 'id' }, [String(n)])]
        .concat(ctx.cols.events.map((c) => h('td', {}, [cell({ key: `e${n}.${c.f}`, value: v[c.f], state: st(`e${n}.${c.f}`), locked: ctx.locked, selected: ctx.selKey === `e${n}.${c.f}`,
          label: ctx.labelOf(`e${n}.${c.f}`), t, onInput: ctx.onInput, onFocus: ctx.onFocus, onEnter: ctx.onEnter })]))));
    });
    return h('table', { class: 'data ex-ans' }, [h('caption', { class: 'sr-only' }, [t('ex.eventsCaption')]), h('thead', {}, [head]), h('tbody', {}, body)]);
  }

  // La casilla de abajo en la misma columna (Intro), o null en la última fila.
  function below(table, key) {
    const input = table.querySelector(`[id="${cellId(key)}"]`);
    if (!input) return null;
    const td = input.closest('td'); const tr = td.closest('tr');
    const col = [...tr.children].indexOf(td);
    const next = tr.nextElementSibling;
    return next ? next.children[col].querySelector('input') : null;
  }

  const api = { acts, events, cell, mark, icon, below, cellId };
  root.PNL = root.PNL || {};
  root.PNL.answerTable = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
