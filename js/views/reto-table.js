/*
 * reto-table — el reto de ficticias con la tabla de sucesos (F2b, T021; tableros 21, 22 y 24 de los bocetos).
 * El alumno escribe en cada actividad y en cada ficticia el número de su suceso de origen y el de su destino
 * (un número nuevo crea el suceso), numera o borra los sucesos y pide «Comprobar»; hasta entonces no se marca
 * nada (criterio 12). «Ver una solución» enseña la red de un método del comparador sin tocar la del alumno.
 * No calcula: el modelo es js/reto y los textos, narrate (retoResult, diagnosis). Todo texto entra con
 * textContent (dom.h), nunca HTML.
 *   render(container, ctx): ctx = { reto: { net, seq, result }, project, lang, nota, numFmt, name, methods,
 *     solution: { method, net, dummies, events } | null, solutionMethod, live (región que anuncia los avisos),
 *     onOp(op) → true si la red cambia (y repinta), onCheck(), onSolution(method | null), onRepaint() }.
 *   El lienzo (views/reto-canvas) va en la columna de la derecha, sobre «Comprobar» (T022).
 *   state(): el mensaje de la tabla y la casilla con el foco, para las pruebas de navegador.
 */
(function (root) {
  'use strict';

  const G = root.PNL;
  let msg = null;            // { key, params }: aviso de la tabla (entrada que no vale, numerar con un ciclo)
  let focusResult = false;   // tras «Comprobar», el foco va al resultado
  let box = null;

  function render(container, ctx) {
    const { h, clear } = G.dom;
    const R = G.reto;
    const { lang, reto } = ctx;
    const t = (k, p) => G.i18n.t(lang, k, p);
    const net = reto.net;
    // Si el foco estaba en una casilla, vuelve a ella después de pintar (las ediciones repintan la tabla).
    const active = root.document.activeElement;
    const keep = active && container.contains(active) && active.dataset ? active.dataset.k : null;
    box = container;

    clear(container);
    container.appendChild(h('p', { class: 'reto-title' }, [t('reto.title')]));
    const grid = h('div', { class: 'reto-grid' });
    container.appendChild(grid);

    // ---- Tabla de sucesos ----
    // Sin nombre propio: la región con desplazamiento de dentro ya se llama «Tabla de sucesos» (axe, landmark-unique).
    const tableBox = h('section', { class: 'card reto-table' }, [
      h('h2', { id: 'pnl-reto-th' }, [t('reto.tableTitle')]),
      h('p', { class: 'small muted' }, [t('reto.tableHint')]),
    ]);
    // A la izquierda, el resultado de «Comprobar» (si lo hay) sobre la tabla; a la derecha, el lienzo (T022).
    const left = h('div', { class: 'reto-left' });
    grid.appendChild(left);
    const resBox = h('div', { class: 'reto-res' });
    left.appendChild(resBox);
    left.appendChild(tableBox);
    const lbl = (id) => (id === null ? '' : R.label(net, id) || '');
    const say = (key, params) => { msg = { key, params }; showMsg(); if (ctx.live) ctx.live.textContent = t(key, params); };
    // Texto de una casilla de extremo → operación del modelo (o null si no vale).
    const endOp = (target, side, text) => {
      const v = String(text).trim();
      if (v === '') return Object.assign({ type: 'endNumber', side, n: null }, target);
      if (/^\d+$/.test(v) && Number(v) >= 1 && Number(v) <= R.LIMIT.n) return Object.assign({ type: 'endNumber', side, n: Number(v) }, target);
      const id = /^[a-z]+$/i.test(v) ? R.byLabel(net, v) : null;
      if (id === null) return null;
      return target.act !== undefined ? { type: 'arc', act: target.act, [side]: id } : { type: 'dummy', i: target.i, [side]: id };
    };
    // Las ediciones se aplican después del cambio de foco: así, con el tabulador, el foco no se pierde al repintar.
    const commit = (input, op, bad) => {
      if (!op) { input.setAttribute('aria-invalid', 'true'); say(bad, { v: input.value.trim() }); return; }
      setTimeout(() => { msg = null; if (!ctx.onOp(op)) { input.value = input.defaultValue; showMsg(); } }, 0);
    };
    const cell = (k, target, side, value, label) => {
      const input = h('input', { type: 'text', inputmode: 'numeric', autocomplete: 'off', spellcheck: 'false', class: 'reto-cell',
        size: '4', maxlength: '4', 'data-k': k, 'aria-label': label, value });
      input.defaultValue = value;
      input.addEventListener('change', () => commit(input, endOp(target, side, input.value), 'reto.badCell'));
      return input;
    };

    const acts = h('table', { class: 'data reto-tbl' }, [
      h('thead', {}, [h('tr', {}, [
        h('th', { scope: 'col' }, [t('reto.colAct')]), h('th', { scope: 'col' }, [t('reto.colFrom')]), h('th', { scope: 'col' }, [t('reto.colTo')]),
      ])]),
      h('tbody', {}, net.arcs.map((a) => h('tr', {}, [
        h('th', { scope: 'row' }, [a.act]),
        h('td', {}, [cell(`a:${a.act}:from`, { act: a.act }, 'from', lbl(a.from), t('reto.cellFrom', { x: a.act }))]),
        h('td', {}, [cell(`a:${a.act}:to`, { act: a.act }, 'to', lbl(a.to), t('reto.cellTo', { x: a.act }))]),
      ]))),
    ]);
    tableBox.appendChild(h('div', { class: 'scroll-box', tabindex: '0', role: 'region', 'aria-label': t('reto.tableTitle') }, [acts]));

    // Ficticias, con su nombre F1, F2… en su orden.
    tableBox.appendChild(h('h3', {}, [t('reto.dummies')]));
    const named = R.named(net, ctx.project).dummies;
    if (!named.length) tableBox.appendChild(h('p', { class: 'small muted' }, [t('reto.dummiesNone')]));
    else {
      tableBox.appendChild(h('table', { class: 'data reto-tbl' }, [
        h('thead', {}, [h('tr', {}, [
          h('th', { scope: 'col' }, [t('legend.dummy')]), h('th', { scope: 'col' }, [t('reto.colFrom')]), h('th', { scope: 'col' }, [t('reto.colTo')]),
          h('th', { scope: 'col' }, [h('span', { class: 'sr-only' }, [t('reto.remove')])]),
        ])]),
        h('tbody', {}, named.map((d, i) => h('tr', {}, [
          h('th', { scope: 'row' }, [d.name]),
          h('td', {}, [cell(`d:${i}:from`, { i }, 'from', lbl(d.from), t('reto.cellFrom', { x: d.name }))]),
          h('td', {}, [cell(`d:${i}:to`, { i }, 'to', lbl(d.to), t('reto.cellTo', { x: d.name }))]),
          h('td', {}, [h('button', { type: 'button', class: 'ghost small-btn', 'data-k': `dx:${i}`, 'aria-label': t('reto.removeDummy', { x: d.name }),
            onclick: () => { msg = null; ctx.onOp({ type: 'removeDummy', i }); } }, [t('reto.remove')])]),
        ]))),
      ]));
    }
    tableBox.appendChild(h('div', { class: 'row-wrap' }, [
      h('button', { type: 'button', class: 'ghost', 'data-k': 'addDummy', onclick: () => { msg = null; ctx.onOp({ type: 'addDummy' }); } }, [t('reto.addDummy')]),
    ]));

    // Sucesos: su número (o letras, si no tiene) y borrar.
    tableBox.appendChild(h('h3', {}, [t('reto.events')]));
    if (!net.events.length) tableBox.appendChild(h('p', { class: 'small muted' }, [t('reto.eventsNone')]));
    else {
      const sorted = net.events.slice().sort((a, b) => (a.n == null ? 1e9 + a.id : a.n) - (b.n == null ? 1e9 + b.id : b.n) || a.id - b.id);
      tableBox.appendChild(h('ul', { class: 'reto-events' }, sorted.map((e) => {
        const name = e.n == null ? t('reto.unnumbered', { x: R.label(net, e.id) }) : String(e.n);
        const value = e.n == null ? '' : String(e.n);
        const input = h('input', { type: 'text', inputmode: 'numeric', autocomplete: 'off', class: 'reto-cell', size: '4', maxlength: '3',
          'data-k': `e:${e.id}`, 'aria-label': t('reto.eventNumber', { x: name }), value });
        input.defaultValue = value;
        input.addEventListener('change', () => {
          const v = input.value.trim();
          const ok = v === '' || (/^\d+$/.test(v) && Number(v) >= 1 && Number(v) <= R.LIMIT.n);
          commit(input, ok ? { type: 'number', id: e.id, n: v === '' ? null : Number(v) } : null, 'reto.badNumber');
        });
        return h('li', {}, [
          e.n == null ? h('span', { class: 'muted small' }, [name]) : null, input,
          h('button', { type: 'button', class: 'ghost small-btn', 'data-k': `ex:${e.id}`, 'aria-label': t('reto.removeEventLabel', { x: name }),
            onclick: () => { msg = null; ctx.onOp({ type: 'removeEvent', id: e.id }); } }, [t('reto.removeEvent')]),
        ]);
      })));
    }
    tableBox.appendChild(h('div', { class: 'row-wrap' }, [
      h('button', { type: 'button', class: 'ghost', 'data-k': 'autoNumber', disabled: !net.events.length, onclick: () => {
        msg = null;
        if (!ctx.onOp({ type: 'autoNumber' })) say('reto.autoNumberCycle');
      } }, [t('reto.autoNumber')]),
    ]));
    const msgEl = h('p', { class: 'reto-msg small' });
    tableBox.appendChild(msgEl);
    function showMsg() { msgEl.textContent = msg ? t(msg.key, msg.params) : ''; }
    showMsg();

    // ---- Resultado ----
    const res = reto.result;
    if (!res) resBox.appendChild(h('p', { class: 'small muted' }, [t('reto.noHints')]));
    else {
      const o = G.narrate.retoResult(Object.assign({}, res, { problems: R.shown(res.problems, net) }), { lang });
      const head = h('h2', { tabindex: '-1', id: 'pnl-reto-res', 'data-k': 'result' }, [o.title]);
      const r = h('div', { class: `reto-result ${o.tone}`, role: 'region', 'aria-labelledby': 'pnl-reto-res' }, [head]);
      if (o.count) r.appendChild(h('p', { class: 'reto-count' }, [o.count]));
      if (o.lines.length) r.appendChild(h('ul', {}, o.lines.map((l) => h('li', { class: l.tone }, [l.text]))));
      resBox.appendChild(r);
    }

    // ---- Lienzo (o la solución, sin perder la red del alumno), comprobar ----
    // Con la solución a la vista, la sección toma el nombre de su título visible (un solo punto de referencia).
    const work = h('section', { class: 'card reto-work', 'aria-labelledby': ctx.solution ? 'pnl-reto-sol' : 'pnl-reto-ch' },
      ctx.solution ? [] : [h('h2', { id: 'pnl-reto-ch', class: 'sr-only' }, [t('reto.canvasTitle')])]);
    grid.appendChild(work);
    if (ctx.solution) work.appendChild(solution(ctx, t));
    else {
      const canvas = h('div', { class: 'reto-canvas' });
      work.appendChild(canvas);
      G.retoCanvas.render(canvas, Object.assign({}, ctx, { removable: res && res.correct ? res.removable.map((r) => r.name) : [] }));
    }
    work.appendChild(h('div', { class: 'row-wrap reto-actions' }, [
      ctx.solution
        ? h('button', { type: 'button', class: 'ghost', 'data-k': 'back', onclick: () => ctx.onSolution(null) }, [t('reto.back')])
        : h('button', { type: 'button', class: 'ghost', 'data-k': 'solution', onclick: () => ctx.onSolution(ctx.solutionMethod) }, [t('reto.solution')]),
      h('button', { type: 'button', class: 'ghost primary', 'data-k': 'check', onclick: () => { focusResult = true; ctx.onCheck(); } }, [t('reto.check')]),
    ]));

    // Tras «Comprobar», el foco va al título del resultado (también si se repinta antes, al llegar el mínimo).
    const fromCanvas = G.retoCanvas.takeFocus();
    const target = focusResult && res ? 'result' : fromCanvas || keep;
    if (res) focusResult = false;
    if (target) {
      const el = container.querySelector(`[data-k="${target}"]`);
      if (el && !el.disabled) el.focus();
    }
  }

  function solution(ctx, t) {
    const { h } = G.dom;
    const s = ctx.solution;
    const sec = h('div', { class: 'reto-solution' }, [h('h2', { id: 'pnl-reto-sol' }, [t('reto.solutionTitle')])]);
    const sel = h('select', { id: 'pnl-reto-method', 'data-k': 'method', onchange: (e) => ctx.onSolution(e.target.value) },
      ctx.methods.map((m) => h('option', { value: m, selected: m === s.method }, [t(`cmp.names.${m}`)])));
    sec.appendChild(h('p', { class: 'row-wrap' }, [h('label', { for: 'pnl-reto-method' }, [t('reto.solutionMethod')]), sel]));
    if (!s.net) { sec.appendChild(h('p', { class: 'muted' }, [t('cmp.pending')])); return sec; }
    sec.appendChild(h('p', { class: 'reto-count' }, [`${s.dummies} ${t(s.dummies === 1 ? 'cmp.unitOne' : 'cmp.unitN', { e: s.events })}`]));
    const name = `${ctx.name} · ${t(`cmp.names.${s.method}`)}`;
    const holder = h('div', { class: 'cmp-net scroll-box', tabindex: '0', role: 'region', 'aria-label': name });
    sec.appendChild(holder);
    const nctx = { net: s.net, lay: G.aoaLayout.layout(s.net), revealed: new Map(), step: null, lang: ctx.lang, nota: ctx.nota,
      numFmt: ctx.numFmt, name, criticalOn: false, numbered: true, fit: true, idPrefix: 'pnl-rs' };
    G.pertView.render(holder, nctx);
    const tbl = h('div', { class: 'scroll-box', tabindex: '0', role: 'region', 'aria-label': t('pert.arcsCaption', { name }) });
    sec.appendChild(h('details', { class: 'cmp-table' }, [h('summary', {}, [t('view.asTable')]), tbl]));
    G.pertView.arcTable(tbl, nctx);
    sec.appendChild(h('p', { class: 'small muted' }, [t('reto.solutionKeep')]));
    return sec;
  }

  const api = { render, state: () => ({ msg: msg ? Object.assign({}, msg) : null, focus: box && box.contains(root.document.activeElement) ? root.document.activeElement.dataset.k || null : null }) };
  root.PNL = root.PNL || {};
  root.PNL.retoTable = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
