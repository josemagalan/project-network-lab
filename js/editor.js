/*
 * editor — la tabla del taller (spec AC3–AC5, AC13, AC18, AC19). Cada edición se envía a app como
 * acción 'table'; app valida con core/project y actualiza la URL. Mientras se escribe no se redibuja
 * la tabla (para no perder el foco): solo los mensajes, las marcas de error y la columna calculada.
 */
(function (root) {
  'use strict';

  const G = root.PNL;
  const I = (typeof module !== 'undefined' && module.exports) ? require('./i18n.js') : root.PNL.i18n;

  // ---------- Lógica sin DOM (tests/editor.test.js) ----------

  // Campo de la fila que señala cada código de core/project.
  const FIELD = { badDuration: 'duration', unknownRef: 'links', duplicateId: 'id', badId: 'id', reservedId: 'id', redundant: 'links' };

  const issueText = (lang, is) => I.t(lang, `issue.${is.code}`, { row: is.row == null ? '' : is.row + 1, ids: is.ids.join(', '), a: is.ids[0], b: is.ids[1] });

  // Marcas por fila: un error deja el campo inválido; una redundancia, solo en aviso.
  function marks(report) {
    return [...report.errors, ...report.warnings].filter((is) => is.row != null && FIELD[is.code])
      .map((is) => ({ row: is.row, field: FIELD[is.code], kind: is.code === 'redundant' ? 'warn' : 'invalid' }));
  }

  // Lo que dice el panel lateral: errores, avisos y, si la tabla es válida, el resumen o la invitación a empezar.
  // Con hideDuration (predicción activa y fin aún sin revelar) el resumen no da la duración (revisión, H5).
  function messages(lang, report, project, solution, numFmt, hideDuration) {
    const t = (k, p) => I.t(lang, k, p);
    const n = report.errors.length;
    const w = report.warnings.length;
    return {
      errorsHead: n ? (n === 1 ? t('work.errorsOne') : t('work.errors', { n })) : null,
      errors: report.errors.map((is) => issueText(lang, is)),
      warningsHead: w ? (w === 1 ? t('work.warningsOne') : t('work.warnings', { n: w })) : null,
      warnings: report.warnings.map((is) => issueText(lang, is)),
      // Sin ninguna duración (T022) la tabla vale para construir la red PERT, pero no hay tiempos que dar.
      ready: !n && project && solution ? (hideDuration ? t('work.readyNoDuration', { n: project.activities.length })
        : t('work.ready', { n: project.activities.length, d: numFmt(solution.duration) }))
        : (!n && project ? t('work.readyStructure', { n: project.activities.length }) : null),
      structureOnly: !n && !!project && !solution,
      empty: !n && !project ? t('work.empty') : null,
    };
  }

  function create(container, hooks) {
    const { h, clear } = G.dom;
    let refs = null;

    const t = (k, p) => G.i18n.t(hooks.lang(), k, p);

    function readRows() {
      return [...refs.tbody.querySelectorAll('tr')].map((tr) => {
        const q = (n) => tr.querySelector(`[data-f="${n}"]`).value;
        return { id: q('id'), name: q('name'), duration: q('duration'), links: q('links') };
      });
    }
    const changed = () => hooks.dispatch({ type: 'table', rows: readRows() }, { fromEditor: true });

    function rowEl(r) {
      const inp = (f, label, w) => h('input', { 'data-f': f, 'aria-label': label, value: r[f] == null ? '' : String(r[f]), style: w ? `max-width:${w}` : null, oninput: changed });
      return h('tr', {}, [
        h('td', {}, [inp('id', t('work.colId'), '84px')]),
        h('td', {}, [inp('name', t('work.colName'))]),
        h('td', {}, [inp('duration', t('work.colDuration'), '96px')]),
        h('td', {}, [inp('links', t(hooks.state().mode === 'succ' ? 'work.colSucc' : 'work.colPred'))]),
        h('td', { class: 'computed', 'data-computed': '' }, ['']),
        h('td', {}, [h('button', { type: 'button', class: 'ghost', 'aria-label': t('work.remove'), onclick: (e) => { e.currentTarget.closest('tr').remove(); changed(); } }, ['×'])]),
      ]);
    }

    function full(ctx) {
      const s = hooks.state();
      const mode = s.mode;
      const exSelect = h('select', { 'aria-label': t('work.example'), onchange: (e) => { if (e.target.value) hooks.loadExample(e.target.value); } }, [
        h('option', { value: '' }, [t('work.choose')]),
        ...G.examples.list().map((ex) => h('option', { value: ex.id }, [ex.title[hooks.lang()]])),
      ]);
      const pasteArea = h('textarea', { class: 'paste', 'aria-label': t('work.paste'), placeholder: t('work.pasteHint') });
      const pasteBox = h('div', { hidden: true }, [pasteArea, h('button', { type: 'button', class: 'ghost', onclick: () => {
        const rows = G.project.parsePasted(pasteArea.value);
        if (rows.length) { hooks.dispatch({ type: 'table', rows: readRows().filter((r) => r.id || r.duration || r.links).concat(rows) }, {}); }
      } }, [t('work.pasteApply')])]);
      const radio = (value, label) => h('label', {}, [h('input', { type: 'radio', name: 'pnlMode', value, checked: mode === value,
        onchange: () => hooks.switchMode(value) }), ' ', label]);
      const showComputed = h('input', { type: 'checkbox', checked: ctx.showComputed, onchange: (e) => hooks.toggleComputed(e.target.checked) });
      const tbody = h('tbody', {}, (ctx.rows.length ? ctx.rows : [{ id: '', name: '', duration: '', links: '' }]).map(rowEl));
      const otherHead = h('th', { scope: 'col', class: 'computed', 'data-computed': '' }, [`${t(mode === 'succ' ? 'work.colPred' : 'work.colSucc')} ${t('work.computed')}`]);
      const table = h('table', { class: 'data edit-table' }, [
        h('thead', {}, [h('tr', {}, [h('th', { scope: 'col' }, [t('work.colId')]), h('th', { scope: 'col' }, [t('work.colName')]),
          h('th', { scope: 'col' }, [t('work.colDuration')]), h('th', { scope: 'col' }, [t(mode === 'succ' ? 'work.colSucc' : 'work.colPred')]),
          otherHead, h('th', { scope: 'col' }, [h('span', { class: 'sr-only' }, [t('work.remove')])])])]),
        tbody,
      ]);
      const side = h('div', { class: 'work-side', 'aria-live': 'polite' });
      clear(container);
      container.appendChild(h('div', { class: 'work-main' }, [
        h('div', { class: 'work-tools' }, [
          h('label', { class: 'small' }, [t('work.example'), ' ', exSelect]),
          h('button', { type: 'button', class: 'ghost', onclick: () => { pasteBox.hidden = !pasteBox.hidden; if (!pasteBox.hidden) pasteArea.focus(); } }, [t('work.paste')]),
          h('button', { type: 'button', class: 'ghost', onclick: () => hooks.dispatch({ type: 'table', rows: [] }, {}) }, [t('work.clear')]),
        ]),
        pasteBox,
        h('fieldset', { class: 'mode' }, [h('legend', {}, [t('work.modeLegend')]), radio('pred', t('work.modePred')), radio('succ', t('work.modeSucc')),
          h('label', { style: 'margin-left:auto' }, [showComputed, ' ', t('work.showComputed')])]),
        h('div', { class: 'scroll-box' }, [table]),
        h('button', { type: 'button', class: 'ghost', style: 'align-self:flex-start', onclick: () => { tbody.appendChild(rowEl({})); tbody.lastChild.querySelector('input').focus(); } }, [t('work.add')]),
      ]));
      container.appendChild(side);
      refs = { tbody, side, table };
      partial(ctx);
    }

    function partial(ctx) {
      if (!refs) return;
      const { h, clear } = G.dom;
      const s = hooks.state();
      const report = ctx.report;
      const trs = [...refs.tbody.querySelectorAll('tr')];
      trs.forEach((tr) => tr.querySelectorAll('input').forEach((i) => { i.removeAttribute('aria-invalid'); i.classList.remove('warn'); }));
      // Las filas vacías no cuentan para core/project pero sí están en la tabla: el índice coincide con el de las filas.
      for (const m of marks(report)) {
        const el = trs[m.row] && trs[m.row].querySelector(`[data-f="${m.field}"]`);
        if (!el) continue;
        if (m.kind === 'warn') el.classList.add('warn'); else el.setAttribute('aria-invalid', 'true');
      }
      const other = ctx.project ? Object.fromEntries(G.project.toRows(ctx.project, s.mode === 'succ' ? 'pred' : 'succ').map((r) => [r.id, r.links])) : {};
      refs.table.querySelectorAll('[data-computed]').forEach((c) => { c.hidden = !ctx.showComputed; });
      trs.forEach((tr) => {
        const id = tr.querySelector('[data-f="id"]').value.trim().toUpperCase();
        tr.querySelector('td[data-computed]').textContent = other[id] || (ctx.project && other[id] === '' ? '—' : '');
      });
      clear(refs.side);
      const msg = messages(hooks.lang(), report, ctx.project, ctx.solution, ctx.numFmt, ctx.hideDuration);
      if (msg.errorsHead) refs.side.appendChild(h('div', { class: 'issues err', role: 'alert' }, [h('strong', {}, [msg.errorsHead]),
        ...msg.errors.map((x) => h('p', {}, [x]))]));
      if (msg.warningsHead) refs.side.appendChild(h('div', { class: 'issues warn' }, [h('strong', {}, [msg.warningsHead]),
        ...msg.warnings.map((x) => h('p', {}, [x]))]));
      if (msg.ready) {
        refs.side.appendChild(h('div', { class: 'issues okbox' }, [
          h('p', {}, [msg.ready]),
          h('div', { class: 'row-wrap' }, [
            h('button', { type: 'button', class: 'ghost', onclick: () => hooks.goStage(0) }, [t('work.stepByStep')]),
            msg.structureOnly ? null : h('button', { type: 'button', class: 'ghost', onclick: () => hooks.goStage('critical') }, [t('work.results')]),
            h('button', { type: 'button', class: 'ghost', onclick: () => hooks.goStage('cmp') }, [t('work.compare')]),
            h('button', { type: 'button', class: 'ghost', onclick: () => hooks.goStage('reto') }, [t('work.reto')]),
          ]),
        ]));
      } else if (msg.empty) {
        refs.side.appendChild(h('p', { class: 'muted' }, [msg.empty]));
      }
      refs.side.appendChild(h('p', { class: 'muted small' }, [t('work.urlNote')]));
    }

    return { render: (ctx, isFull) => (isFull || !refs ? full(ctx) : partial(ctx)) };
  }

  const api = { create, FIELD, issueText, marks, messages };
  root.PNL = root.PNL || {};
  root.PNL.editor = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
