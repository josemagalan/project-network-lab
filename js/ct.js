/*
 * ct — controlador de la pestaña de coste–tiempo (spec f5b-coste-tiempo; plan §4, P1, P7; tableros 122, 123 y 126).
 * T010: la barra (proyecto y «Partir del taller»), la tabla del proyecto (de solo lectura en los ejemplos, con la
 * pendiente; editable con «Tabla propia», con el error o el aviso de cada fila) y los costes del proyecto. La tabla de la
 * compresión, la curva, las redes y el Gantt (T011), el paso a paso (T012), el atajo (T013) y «Aprende más» (T014) llegan
 * con sus tareas. La pestaña no se ve en la barra hasta T015.
 *
 * La parte sin DOM (source, model, costs, issueText, rowMarks, workRows, pasteRows, parseCost) se prueba en Node
 * (tests/ct-tab.test.js); create() pinta la vista. Para las pruebas de navegador, PNL.ctTab.state() da lo pintado.
 */
(function (root) {
  'use strict';

  const isNode = typeof module !== 'undefined' && module.exports;
  const req = (path, name) => (isNode ? require(path) : root.PNL[name]);
  const I = req('./i18n.js', 'i18n');
  if (isNode) require('./i18n-ct.js');
  const K = req('./core/crash.js', 'crash');
  const X = req('./core/crashex.js', 'crashex');
  const U = req('./core/urlstate.js', 'urlstate');
  const NR = req('./narrate.js', 'narrate');

  const FIELDS = ['id', 'name', 'links', 'dn', 'dc', 'cn', 'cc'];
  const KC = ['fixed', 'perUnit', 'due', 'penalty', 'bonus'];
  // Campos de la fila que señala cada código de core/crash.
  const FIELD = { badId: ['id'], reservedId: ['id'], duplicateId: ['id'], unknownRef: ['links'], badDuration: ['dn'], badCrash: ['dc'],
    badCost: ['cn', 'cc'], costOrder: ['cc'], noCrash: ['dc', 'cn', 'cc'] };
  const str = (v) => (v == null ? '' : String(v));
  const blank = () => ({ id: '', name: '', links: '', dn: '', dc: '', cn: '', cc: '' });

  // ---------- El proyecto ----------

  /** El proyecto de la pestaña: la tabla propia (como la escribe el alumno) o un ejemplo de core/crashex. */
  function source(state, lang) {
    if (state.ke === 'own' && state.kt) {
      return { kind: 'own', id: 'own', rows: state.kt.map((r) => Object.fromEntries(FIELDS.map((f) => [f, str(r[f])]))), title: I.t(lang, 'ct.own'),
        unit: '', costUnit: '', source: '', k: {} };
    }
    const ex = X.get(state.ke) || X.get('kl');
    return { kind: 'example', id: ex.id, rows: ex.rows.map((r) => Object.assign(blank(), r)), title: ex.title[lang], unit: ex.unit[lang],
      costUnit: ex.costUnit[lang], source: ex.source[lang], k: ex.k };
  }

  /** Los costes del proyecto que valen: los escritos (kc) o, si no hay, los del ejemplo. */
  function costs(state, src) {
    const k = state.kc || src.k || {};
    return Object.fromEntries(KC.map((x) => [x, k[x] == null ? null : k[x]]));
  }

  /** Lo que pinta la pestaña: la fuente, el proyecto leído (o null), sus errores y avisos y los costes del proyecto. */
  function model(state, lang) {
    const src = source(state, lang);
    const { project, report } = K.parse(src.rows);
    return { src, p: project, report, empty: !project && !report.errors.length, k: costs(state, src), edited: !!state.kc };
  }

  // ---------- Errores y avisos ----------

  /** El texto de un error o un aviso de la tabla, sin «Fila n» (va en su fila, o en la lista si no tiene fila). */
  function issueText(is, lang) {
    const ids = (is.ids || []).join(', ');
    if (is.code === 'cycle') return I.t(lang, 'issue.cycle', { ids });
    return I.t(lang, `ct.issue.${is.code}`, { ids });
  }

  /** Marcas de la tabla propia: por fila, los campos con error, los avisos y sus textos; aparte, los errores sin fila. */
  function rowMarks(m, lang) {
    const rows = new Map();
    const general = [];
    const at = (i) => { if (!rows.has(i)) rows.set(i, { bad: new Set(), warn: new Set(), msgs: [] }); return rows.get(i); };
    for (const is of m.report.errors) {
      if (is.row == null) { general.push(issueText(is, lang)); continue; }
      const r = at(is.row);
      for (const f of FIELD[is.code] || []) r.bad.add(f);
      r.msgs.push({ kind: 'err', text: issueText(is, lang) });
    }
    for (const is of m.report.warnings) {
      if (!FIELD[is.code]) continue;   // los avisos de core/project (redundancias) no se enseñan aquí
      const r = at(is.row);
      for (const f of FIELD[is.code]) r.warn.add(f);
      r.msgs.push({ kind: 'warn', text: issueText(is, lang) });
    }
    const badRows = [...rows.entries()].filter(([, r]) => r.bad.size).map(([i]) => i).sort((a, b) => a - b)
      .map((i) => str(m.src.rows[i].id).trim().toUpperCase() || String(i + 1));
    return { rows, general, badRows };
  }

  // ---------- Entradas ----------

  /** «Partir del taller» (AC9): las filas del taller tal cual; el store las pasa a la tabla de la pestaña. */
  const workRows = (rows) => rows.map((r) => ({ id: str(r.id), name: str(r.name), duration: str(r.duration), links: str(r.links) }));

  /** Filas pegadas de una hoja de cálculo: actividad, nombre, predecesoras, dn, dc, cn y cc (tabuladores o punto y coma). */
  function pasteRows(text) {
    const lines = str(text).split(/\r?\n/).filter((l) => l.trim());
    if (!lines.length) return [];
    const sep = lines.some((l) => l.includes('\t')) ? '\t' : ';';
    const out = lines.map((l) => { const c = l.split(sep).map((x) => x.trim()); return Object.fromEntries(FIELDS.map((f, i) => [f, c[i] || ''])); });
    // Una primera fila de cabeceras (sin cifras en la duración normal) se salta.
    if (out.length && !/^\d/.test(out[0].dn) && /[a-zá-ú]/i.test(out[0].dn)) out.shift();
    return out;
  }

  /** Un coste del proyecto escrito: '' → null; un número ≥ 0 con punto o coma → el número; si no, undefined. */
  function parseCost(text) {
    const s = str(text).trim();
    if (!s) return null;
    return /^\d{1,9}(?:[.,]\d{1,4})?$/.test(s) ? Number(s.replace(',', '.')) : undefined;
  }

  // ---------- La vista ----------

  function create(container, hooks) {
    const { h, clear } = root.PNL.dom;
    const lang = () => hooks.lang();
    const state = () => hooks.state();
    const tc = (k, p) => I.t(lang(), `ct.${k}`, p);
    const num = (v) => NR.fmt(lang(), v);
    let m = null;
    const go = (action, opts) => hooks.dispatch(Object.assign({ type: 'ct' }, action), opts);

    function focus(id) { const el = root.document.getElementById(id); if (el) el.focus(); }
    function keepFocus(fn) {
      const a = root.document.activeElement;
      const id = a && container.contains(a) ? a.id : null;
      fn();
      if (id) { const el = root.document.getElementById(id); if (el) el.focus(); }
    }
    const button = (label, onclick, attrs) => h('button', Object.assign({ type: 'button', class: 'ghost', onclick }, attrs || {}), [label]);

    // ---------- Barra (tablero 122: proyecto y «Partir del taller»; lo demás llega con sus tareas) ----------
    function bar() {
      const sel = h('select', { id: 'ctProj', onchange: (e) => pickProject(e.target.value) },
        X.list().map((ex) => h('option', { value: ex.id, selected: m.src.id === ex.id }, [ex.title[lang()]]))
          .concat([h('option', { value: 'own', selected: m.src.kind === 'own' }, [tc('own')])]));
      return h('div', { class: 'card ct-bar' }, [h('div', { class: 'ct-row' }, [
        h('label', { class: 'ct-field' }, [tc('project'), ' ', sel]),
        button(tc('fromWork'), fromWork, { id: 'ctFromWork' }),
      ])]);
    }
    function pickProject(id) {
      if (id === 'own' && !state().kt) { hooks.dispatch({ type: 'ctTable', rows: [Object.assign(blank(), { id: 'A' })] }, { push: true }); focus('ctProj'); return; }
      go({ ke: id }, { push: true });
    }
    function fromWork() {
      const w = hooks.workRows();
      hooks.dispatch({ type: 'ctFromWork', rows: workRows(w.rows), mode: w.mode }, { push: true });
      if (hooks.announce) hooks.announce(tc('fromWorkDone'));
      focus('ctProj');
    }

    // ---------- La tabla de un ejemplo, de solo lectura (tablero 123) ----------
    function exampleCard() {
      const cols = ['id', 'links', 'dn', 'dc', 'cn', 'cc', 'slope'];
      const head = h('tr', {}, cols.map((c) => h('th', { scope: 'col' }, [tc(`col.${c}`)])));
      const body = m.p.activities.map((a) => h('tr', { 'data-act': a.id }, [
        h('th', { scope: 'row' }, [a.id]), h('td', { class: 'ct-mono' }, [m.p.preds[a.id].join(', ') || '—']),
        h('td', {}, [num(a.dn)]), h('td', {}, [num(a.dc)]), h('td', {}, [num(a.cn)]), h('td', {}, [num(a.cc)]),
        h('td', {}, [a.dn > a.dc ? h('strong', {}, [num(a.b)]) : '—']),
      ]));
      return h('section', { class: 'card ct-card', 'aria-labelledby': 'ctTableHead' }, [
        h('h2', { id: 'ctTableHead' }, [m.src.unit ? tc('tableTitleUnit', { unit: m.src.unit }) : tc('tableTitle')]),
        h('div', { class: 'ct-scroll', tabindex: '0', role: 'region', 'aria-label': tc('tableLabel', { name: m.src.title }) }, [
          h('table', { class: 'data ct-proj', id: 'ctProjTable' }, [h('thead', {}, [head]), h('tbody', {}, body)])]),
        h('p', { class: 'muted small', id: 'ctSource' }, [tc('source', { source: m.src.source, unit: m.src.unit, costUnit: m.src.costUnit })]),
      ]);
    }

    // ---------- La tabla propia (tablero 126) ----------
    let ownTable = null; let issuesSlot = null; let pasteNote = false;
    const SIZE = { id: 4, name: 14, links: 10, dn: 4, dc: 4, cn: 6, cc: 6 };
    const FIELD_MAX = { id: U.LIMITS.id, name: U.LIMITS.name, links: U.LIMITS.links, dn: U.LIMITS.duration, dc: U.LIMITS.duration, cn: U.LIMITS.duration, cc: U.LIMITS.duration };
    function readOwn() {
      return [...container.querySelectorAll('#ctOwn tbody tr')].map((tr) => {
        const r = blank();
        for (const inp of tr.querySelectorAll('input[data-f]')) r[inp.getAttribute('data-f')] = inp.value;
        return r;
      });
    }
    const commit = (next) => hooks.dispatch({ type: 'ctTable', rows: next.length ? next : [blank()] });
    function ownCard() {
      const typed = () => hooks.dispatch({ type: 'ctTable', rows: readOwn() }, { fromEditor: true });
      const body = m.src.rows.map((r, i) => h('tr', { 'data-row': String(i) }, FIELDS.map((f) => h('td', {}, [h('input', {
        id: `ctT-${i}-${f}`, value: str(r[f]), size: String(SIZE[f]), class: f === 'links' ? 'ct-mono' : null, 'aria-label': tc('cell', { col: tc(`col.${f}`), n: i + 1 }),
        'aria-invalid': 'false', 'data-f': f, maxlength: String(FIELD_MAX[f]), oninput: typed, spellcheck: 'false', autocomplete: 'off',
        inputmode: ['dn', 'dc'].includes(f) ? 'numeric' : ['cn', 'cc'].includes(f) ? 'decimal' : null,
      })])).concat([h('td', { class: 'ct-msg', 'data-msg': '' }, []), h('td', {}, [button('×', () => { commit(readOwn().filter((_, j) => j !== i)); focus(i > 0 ? `ctDel-${i - 1}` : 'ctAdd'); },
        { class: 'ghost small-btn', id: `ctDel-${i}`, 'aria-label': tc('removeRow', { n: i + 1 }) })])])));
      const head = h('tr', {}, FIELDS.map((f) => h('th', { scope: 'col' }, [tc(`col.${f}`)]))
        .concat([h('th', { scope: 'col' }, [tc('col.msg')]), h('th', { scope: 'col' }, [h('span', { class: 'sr-only' }, [tc('col.remove')])])]));
      ownTable = h('table', { class: 'data ct-own', id: 'ctOwn' }, [h('thead', {}, [head]), h('tbody', {}, body)]);
      issuesSlot = h('div', { class: 'ct-issues-slot' });
      const area = h('textarea', { id: 'ctPasteText', rows: '4', 'aria-describedby': 'ctPasteHint' });
      const paste = h('details', { class: 'ct-paste', id: 'ctPaste' }, [h('summary', {}, [tc('paste')]), h('p', { class: 'muted small', id: 'ctPasteHint' }, [tc('pasteHint')]), area,
        button(tc('pasteApply'), () => {
          const rows = pasteRows(area.value);
          if (!rows.length) return;
          const now = readOwn().filter((r) => FIELDS.some((f) => r[f].trim())).concat(rows);
          pasteNote = now.length > U.LIMITS.rows;
          commit(now.slice(0, U.LIMITS.rows));
          focus(pasteNote ? 'ctPasteCut' : 'ctAdd');
        }, { id: 'ctPasteApply' })]);
      const cutNote = pasteNote ? h('p', { class: 'ct-m ct-m-warn', id: 'ctPasteCut', role: 'status', tabindex: '-1' }, [tc('pasteCut', { rows: U.LIMITS.rows })]) : null;
      pasteNote = false;
      const card = h('section', { class: 'card ct-card', 'aria-labelledby': 'ctOwnHead' }, [
        h('h2', { id: 'ctOwnHead' }, [tc('own')]), issuesSlot, cutNote,
        h('div', { class: 'ct-scroll', tabindex: '0' }, [ownTable]),
        h('div', { class: 'ct-row' }, [
          button(tc('addRow'), () => { const now = readOwn(); commit(now.concat([blank()])); focus(`ctT-${now.length}-id`); },
            { id: 'ctAdd', disabled: m.src.rows.length >= U.LIMITS.rows }),
          button(tc('clear'), () => { commit([blank()]); focus('ctT-0-id'); }, { id: 'ctClear' }),
        ]),
        paste,
        h('p', { class: 'muted small', id: 'ctHelp' }, [tc('help')]),
      ]);
      markOwn();
      return card;
    }
    // Marca cada fila con su error o su aviso sin rehacer la tabla (el foco y el cursor no se mueven), y el resumen.
    function markOwn() {
      const mk = rowMarks(m, lang());
      for (const tr of ownTable.querySelectorAll('tbody tr')) {
        const r = mk.rows.get(Number(tr.getAttribute('data-row'))) || { bad: new Set(), warn: new Set(), msgs: [] };
        tr.classList.toggle('bad', r.bad.size > 0);
        tr.classList.toggle('warn', !r.bad.size && r.warn.size > 0);
        for (const inp of tr.querySelectorAll('input[data-f]')) {
          const f = inp.getAttribute('data-f');
          inp.setAttribute('aria-invalid', String(r.bad.has(f)));
          inp.classList.toggle('ct-warn', !r.bad.has(f) && r.warn.has(f));
        }
        const cell = tr.querySelector('[data-msg]');
        clear(cell);
        for (const x of r.msgs) cell.appendChild(h('span', { class: `ct-m ct-m-${x.kind}` }, [h('span', { 'aria-hidden': 'true' }, [x.kind === 'err' ? '✕ ' : '! ']), x.text]));
      }
      clear(issuesSlot);
      const n = m.report.errors.length;
      if (!n && !m.empty) return;
      const lines = [h('strong', {}, [m.empty ? tc('issues.empty') : n === 1 ? tc('issues.errorsOne') : tc('issues.errors', { n })])];
      if (mk.badRows.length) lines.push(' ', tc(mk.badRows.length === 1 ? 'issues.rowOne' : 'issues.rows', { list: I.list(lang(), mk.badRows) }));
      const general = mk.general.length ? h('ul', { class: 'small' }, mk.general.map((x) => h('li', {}, [x]))) : null;
      issuesSlot.appendChild(h('div', { class: 'ct-issues', id: 'ctIssues', role: 'status' }, [h('p', {}, lines), general]));
    }

    // ---------- Costes del proyecto (tableros 123 y 126) ----------
    function costsCard() {
      const field = (key) => {
        const id = `ctCost-${key}`;
        const inp = h('input', { id, value: m.k[key] == null ? '' : num(m.k[key]), size: '6', inputmode: 'decimal', autocomplete: 'off', 'aria-invalid': 'false',
          'aria-describedby': 'ctCostsHint', onchange: (e) => {
            const v = parseCost(e.target.value);
            if (v === undefined) { e.target.setAttribute('aria-invalid', 'true'); badCost.hidden = false; return; }
            e.target.setAttribute('aria-invalid', 'false'); badCost.hidden = true;
            hooks.dispatch({ type: 'ctCosts', kc: Object.assign({}, m.k, { [key]: v }) });
          } });
        return h('label', { class: 'ct-field', for: id }, [tc(`costs.${key}`), ' ', inp]);
      };
      const badCost = h('p', { class: 'ct-m ct-m-err', id: 'ctCostsBad', role: 'alert', hidden: true }, [tc('costs.bad')]);
      return h('section', { class: 'card ct-card', 'aria-labelledby': 'ctCostsHead' }, [
        h('h2', { id: 'ctCostsHead' }, [tc('costs.title')]),
        h('div', { class: 'ct-row ct-costs' }, KC.map(field)),
        badCost,
        h('p', { class: 'muted small', id: 'ctCostsHint' }, [m.src.kind === 'example' && !m.edited ? `${tc('costs.fromExample')} ${tc('costs.hint')}` : tc('costs.hint')]),
      ]);
    }

    function draw() {
      clear(container);
      ownTable = null; issuesSlot = null;
      container.appendChild(bar());
      container.appendChild(h('div', { class: 'ct-top' }, [m.src.kind === 'own' ? ownCard() : exampleCard(), costsCard()]));
    }
    function render(model, opts) {
      // Al teclear en la tabla propia no se rehace la tabla: se marcan las filas.
      const typing = opts && opts.fromEditor && m && m.src.kind === 'own' && model.src.kind === 'own' && ownTable && ownTable.isConnected
        && model.src.rows.length === m.src.rows.length;
      m = model;
      if (typing) {
        const cut = root.document.getElementById('ctPasteCut');
        if (cut) cut.remove();
        markOwn(); return;
      }
      keepFocus(draw);
    }
    function debug() {
      if (!m) return null;
      return { src: { kind: m.src.kind, id: m.src.id }, errors: m.report.errors.map((e) => e.code), warnings: m.report.warnings.map((e) => e.code).filter((c) => FIELD[c]),
        ok: !!m.p, k: m.k };
    }
    function leave() { /* T010: nada que parar */ }
    return { render, debug, leave };
  }

  const api = { FIELDS, KC, source, costs, model, issueText, rowMarks, workRows, pasteRows, parseCost, create };
  root.PNL = root.PNL || {};
  root.PNL.ctTab = api;
  if (isNode) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
