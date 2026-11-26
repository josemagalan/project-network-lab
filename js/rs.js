/*
 * rs — controlador de la vista de recursos (spec f5c-recursos; plan §4, P1, P12, P13; tableros 130, 131 y 139).
 * T009: la barra (extensión, proyecto, «Partir del taller» y, en la segunda fila, el modo), la tabla del proyecto (de solo
 * lectura en los ejemplos, con un uso por recurso y, con recursos limitados, sus disponibilidades; editable con «Tabla
 * propia», con el error o el aviso de cada fila) y los recursos de la tabla propia. El Gantt con perfiles y la nivelación
 * (T010), los recursos limitados (T011), el paso a paso (T012) y «Aprende más» (T013) llegan con sus tareas. Hasta T014 la
 * vista solo se abre por enlace (v=rs).
 *
 * La parte sin DOM (source, resources, model, resRows, resFromRows, issueText, rowMarks, workRows, pasteRows) se prueba
 * en Node (tests/rs-tab.test.js); create() pinta la vista. Para las pruebas de navegador, PNL.rsTab.state() da lo pintado.
 */
(function (root) {
  'use strict';

  const isNode = typeof module !== 'undefined' && module.exports;
  const req = (path, name) => (isNode ? require(path) : root.PNL[name]);
  const I = req('./i18n.js', 'i18n');
  if (isNode) require('./i18n-rs.js');
  const R = req('./core/resource.js', 'resource');
  const X = req('./core/resex.js', 'resex');
  const U = req('./core/urlstate.js', 'urlstate');
  const NR = req('./narrate.js', 'narrate');

  const USE = ['r1', 'r2', 'r3'];
  const FIELDS = ['id', 'name', 'links', 'd', 'r1', 'r2', 'r3'];
  // Campos de la fila que señala cada código de core/resource (los de uso, según el recurso: is.res).
  const FIELD = { badId: ['id'], reservedId: ['id'], duplicateId: ['id'], unknownRef: ['links'], badDuration: ['d'] };
  const str = (v) => (v == null ? '' : String(v));
  const blank = () => ({ id: '', name: '', links: '', d: '', r1: '', r2: '', r3: '' });

  // ---------- El proyecto ----------

  /** El proyecto de la vista: la tabla propia (como la escribe el alumno) o un ejemplo de core/resex. */
  function source(state, lang) {
    if (state.we === 'own' && state.wt) {
      return { kind: 'own', id: 'own', rows: state.wt.map((r) => Object.fromEntries(FIELDS.map((f) => [f, str(r[f])]))), title: I.t(lang, 'rs.own'),
        unit: '', source: '', mode: 'lev', res: [] };
    }
    const ex = X.get(state.we) || X.get('k81');
    return { kind: 'example', id: ex.id, rows: ex.rows.map((r) => Object.assign(blank(), Object.fromEntries(Object.entries(r).map(([k, v]) => [k, str(v)])))),
      title: ex.title[lang], unit: ex.unit[lang], source: ex.source[lang], mode: ex.mode, res: ex.res };
  }

  /**
   * Los recursos que valen: los de wr (con un nombre vacío, el del ejemplo o «Recurso n») o, si no hay, los del ejemplo
   * (con la tabla propia, uno sin límite). label: el nombre que se enseña; cap: la disponibilidad (null, sin límite).
   */
  function resources(state, src, lang) {
    const def = (k) => (src.res[k] ? src.res[k].name[lang] : I.t(lang, 'rs.res.n', { n: k + 1 }));
    const list = state.wr ? state.wr : src.res.length ? src.res.map((r) => ({ name: '', cap: r.cap })) : [{ name: '', cap: null }];
    return list.map((r, k) => ({ name: str(r.name), cap: r.cap == null || r.cap === '' ? null : Number(r.cap), label: str(r.name).trim() || def(k) }));
  }

  /** Lo que pinta la vista: la fuente, el modo, los recursos, el proyecto leído (o null), sus errores y sus avisos. */
  function model(state, lang) {
    const src = source(state, lang);
    const mode = state.wm || src.mode || 'lev';
    const res = resources(state, src, lang);
    const { project, report } = R.parse(src.rows, res.map((r) => ({ name: r.label, cap: r.cap == null ? '' : String(r.cap) })), mode);
    return { src, mode, res, p: project, report, empty: !project && !report.errors.length };
  }

  // ---------- Los recursos de la tabla propia (tablero 139) ----------

  /** Las tres filas del editor de recursos, con lo escrito (texto). */
  function resRows(state) {
    const wr = state.wr || [];
    return [0, 1, 2].map((k) => (wr[k] ? { name: str(wr[k].name), cap: wr[k].cap == null ? '' : str(wr[k].cap) } : { name: '', cap: '' }));
  }
  /** Lo escrito en el editor → la lista para wr: sin los recursos sin nombre del final (el primero siempre cuenta). */
  function resFromRows(rows) {
    let n = 1;
    rows.forEach((r, k) => { if (k > 0 && str(r.name).trim()) n = k + 1; });
    return rows.slice(0, n).map((r) => ({ name: str(r.name), cap: str(r.cap) }));
  }

  // ---------- Errores y avisos ----------

  /** El texto de un error o un aviso de la tabla, sin «Fila n» (va en su fila, o en la lista si no tiene fila). k: el recurso. */
  function issueText(is, lang, m, k) {
    const ids = (is.ids || []).join(', ');
    if (is.code === 'cycle') return I.t(lang, 'issue.cycle', { ids });
    if (is.code === 'badUse' || is.code === 'overCap') {
      const row = m.src.rows[is.row] || {};
      return I.t(lang, `rs.issue.${is.code}`, { res: m.res[k].label, use: str(row[USE[k]]).trim(), cap: m.res[k].cap });
    }
    return I.t(lang, `rs.issue.${is.code}`, Object.assign({}, is, { ids }));
  }

  /** Marcas de la tabla propia: por fila, los campos con error, los avisos, los hitos y sus textos; aparte, los errores sin fila. */
  function rowMarks(m, lang) {
    const rows = new Map();
    const general = [];
    const at = (i) => { if (!rows.has(i)) rows.set(i, { bad: new Set(), warn: new Set(), msgs: [] }); return rows.get(i); };
    const K = m.res.length;
    for (const is of m.report.errors) {
      if (is.row == null) { general.push(issueText(is, lang, m, 0)); continue; }
      const r = at(is.row);
      if (is.code === 'badUse' || is.code === 'overCap') {
        for (const k of is.res) { r.bad.add(USE[k]); r.msgs.push({ kind: 'err', text: issueText(is, lang, m, k) }); }
        continue;
      }
      for (const f of FIELD[is.code] || []) r.bad.add(f);
      r.msgs.push({ kind: 'err', text: issueText(is, lang, m, 0) });
    }
    for (const is of m.report.warnings) {
      if (is.code !== 'noUse') continue;   // los avisos de core/project (redundancias) no se enseñan aquí
      const r = at(is.row);
      for (const f of USE.slice(0, K)) r.warn.add(f);
      r.msgs.push({ kind: 'warn', text: issueText(is, lang, m, 0) });
    }
    // Un hito (duración 0) no es un error ni un aviso: se dice en su fila.
    m.src.rows.forEach((row, i) => {
      if (str(row.d).trim() === '0' && str(row.id).trim()) at(i).msgs.push({ kind: 'info', text: I.t(lang, 'rs.issue.milestone') });
    });
    const badRows = [...rows.entries()].filter(([, r]) => r.bad.size).map(([i]) => i).sort((a, b) => a - b)
      .map((i) => str(m.src.rows[i].id).trim().toUpperCase() || String(i + 1));
    return { rows, general, badRows };
  }

  // ---------- Entradas ----------

  /** «Partir del taller» (AC9): las filas del taller tal cual; el store las pasa a la tabla de la vista. */
  const workRows = (rows) => rows.map((r) => ({ id: str(r.id), name: str(r.name), duration: str(r.duration), links: str(r.links) }));

  /** Filas pegadas de una hoja de cálculo: actividad, nombre, predecesoras, duración y un uso por recurso (K), con tabuladores o punto y coma. */
  function pasteRows(text, K) {
    const lines = str(text).split(/\r?\n/).filter((l) => l.trim());
    if (!lines.length) return [];
    const sep = lines.some((l) => l.includes('\t')) ? '\t' : ';';
    const cols = FIELDS.slice(0, 4 + K);
    const out = lines.map((l) => { const c = l.split(sep).map((x) => x.trim()); return Object.assign(blank(), Object.fromEntries(cols.map((f, i) => [f, c[i] || '']))); });
    // Una primera fila de cabeceras (sin cifras en la duración) se salta.
    if (out.length && !/^\d/.test(out[0].d) && /[a-zá-ú]/i.test(out[0].d)) out.shift();
    return out;
  }

  // ---------- La vista ----------

  function create(container, hooks) {
    const { h, clear } = root.PNL.dom;
    const lang = () => hooks.lang();
    const state = () => hooks.state();
    const tr = (k, p) => I.t(lang(), `rs.${k}`, p);
    const num = (v) => NR.fmt(lang(), v);
    let m = null;
    const go = (action, opts) => hooks.dispatch(Object.assign({ type: 'rs' }, action), opts);

    function focus(id) { const el = root.document.getElementById(id); if (el) el.focus(); }
    function keepFocus(fn) {
      const a = root.document.activeElement;
      const id = a && container.contains(a) ? a.id : null;
      fn();
      if (id) { const el = root.document.getElementById(id); if (el) el.focus(); }
    }
    const button = (label, onclick, attrs) => h('button', Object.assign({ type: 'button', class: 'ghost', onclick }, attrs || {}), [label]);

    // ---------- Barra (tablero 130): dos filas ----------
    function bar() {
      const sel = h('select', { id: 'rsProj', onchange: (e) => pickProject(e.target.value) },
        X.list().map((ex) => h('option', { value: ex.id, selected: m.src.id === ex.id }, [ex.title[lang()]]))
          .concat([h('option', { value: 'own', selected: m.src.kind === 'own' }, [tr('own')])]));
      const mode = (k) => h('button', { type: 'button', class: 'ghost', id: `rsMode-${k}`, 'aria-pressed': String(m.mode === k),
        onclick: () => { if (m.mode !== k) go({ wm: k }, { push: true }); focus(`rsMode-${k}`); } }, [tr(`mode.${k}`)]);
      return h('div', { class: 'card rs-bar' }, [
        h('div', { class: 'rs-row' }, [
          hooks.ext ? hooks.ext('rs') : null,
          h('label', { class: 'rs-field' }, [tr('project'), ' ', sel]),
          button(tr('fromWork'), fromWork, { id: 'rsFromWork' }),
        ]),
        h('div', { class: 'rs-row' }, [
          h('div', { class: 'seg rs-mode', role: 'group', 'aria-label': tr('mode.label') }, [mode('lev'), mode('lim')]),
        ]),
      ]);
    }
    function pickProject(id) {
      if (id === 'own' && !state().wt) { hooks.dispatch({ type: 'rsTable', rows: [Object.assign(blank(), { id: 'A' })] }, { push: true }); focus('rsProj'); return; }
      go({ we: id }, { push: true });
    }
    function fromWork() {
      const w = hooks.workRows();
      hooks.dispatch({ type: 'rsFromWork', rows: workRows(w.rows), mode: w.mode }, { push: true });
      if (hooks.announce) hooks.announce(tr('fromWorkDone'));
      focus('rsProj');
    }

    // Las disponibilidades (con recursos limitados).
    const capsLine = () => (m.mode === 'lim' ? h('p', { class: 'small rs-caps', id: 'rsCaps' }, [h('span', { class: 'sr-only' }, [`${tr('capsLabel')}: `]),
      m.res.map((r) => (r.cap == null ? tr('unlimited', { name: r.label }) : tr('cap', { name: r.label, cap: num(r.cap) }))).join(' · ')]) : null);

    // ---------- La tabla de un ejemplo, de solo lectura (tablero 131) ----------
    function exampleCard() {
      const head = h('tr', {}, [tr('col.id'), tr('col.links'), tr('col.d')].concat(m.res.map((r) => r.label)).map((c) => h('th', { scope: 'col' }, [c])));
      const body = m.p.table.map((id) => {
        const a = m.p.byId[id];
        return h('tr', { 'data-act': id }, [h('th', { scope: 'row' }, [id]), h('td', { class: 'rs-mono' }, [m.p.preds[id].join(', ') || '—']),
          h('td', {}, [num(a.d)])].concat(a.r.map((v) => h('td', {}, [num(v)]))));
      });
      return h('section', { class: 'card rs-card', 'aria-labelledby': 'rsTableHead' }, [
        h('h2', { id: 'rsTableHead' }, [m.src.unit ? tr('tableTitleUnit', { unit: m.src.unit }) : tr('tableTitle')]),
        h('div', { class: 'rs-scroll', tabindex: '0', role: 'region', 'aria-label': tr('tableLabel', { name: m.src.title }) }, [
          h('table', { class: 'data rs-proj', id: 'rsProjTable' }, [h('thead', {}, [head]), h('tbody', {}, body)])]),
        capsLine(),
        h('p', { class: 'muted small', id: 'rsSource' }, [tr('source', { source: m.src.source, unit: m.src.unit })]),
      ]);
    }

    // ---------- La tabla propia (tablero 139) ----------
    let ownTable = null; let issuesSlot = null; let pasteNote = false; let ownK = 0;
    const SIZE = { id: 4, name: 12, links: 9, d: 4, r1: 4, r2: 4, r3: 4 };
    const FIELD_MAX = { id: U.LIMITS.id, name: U.LIMITS.name, links: U.LIMITS.links, d: U.LIMITS.duration, r1: U.LIMITS.duration, r2: U.LIMITS.duration, r3: U.LIMITS.duration };
    const colName = (f) => (USE.includes(f) ? m.res[USE.indexOf(f)].label : tr(`col.${f}`));
    function readOwn() {
      return [...container.querySelectorAll('#rsOwn tbody tr')].map((row) => {
        const r = blank();
        const i = Number(row.getAttribute('data-row'));
        // Los usos de los recursos que no se ven (sin nombre) se conservan.
        const old = m.src.rows[i];
        if (old) for (const f of USE) r[f] = str(old[f]);
        for (const inp of row.querySelectorAll('input[data-f]')) r[inp.getAttribute('data-f')] = inp.value;
        return r;
      });
    }
    const commit = (next) => hooks.dispatch({ type: 'rsTable', rows: next.length ? next : [blank()] });
    function ownCard() {
      ownK = m.res.length;
      const fields = FIELDS.slice(0, 4 + ownK);
      const typed = () => hooks.dispatch({ type: 'rsTable', rows: readOwn() }, { fromEditor: true });
      const body = m.src.rows.map((r, i) => h('tr', { 'data-row': String(i) }, fields.map((f) => h('td', {}, [h('input', {
        id: `rsT-${i}-${f}`, value: str(r[f]), size: String(SIZE[f]), class: f === 'links' ? 'rs-mono' : null, 'aria-label': tr('cell', { col: colName(f), n: i + 1 }),
        'aria-invalid': 'false', 'data-f': f, maxlength: String(FIELD_MAX[f]), oninput: typed, spellcheck: 'false', autocomplete: 'off',
        inputmode: f === 'd' || USE.includes(f) ? 'numeric' : null,
      })])).concat([h('td', { class: 'rs-msg', 'data-msg': '' }, []), h('td', {}, [button('×', () => { commit(readOwn().filter((_, j) => j !== i)); focus(i > 0 ? `rsDel-${i - 1}` : 'rsAdd'); },
        { class: 'ghost small-btn', id: `rsDel-${i}`, 'aria-label': tr('removeRow', { n: i + 1 }) })])])));
      const head = h('tr', {}, fields.map((f) => h('th', { scope: 'col', 'data-col': f }, [colName(f)]))
        .concat([h('th', { scope: 'col' }, [tr('col.msg')]), h('th', { scope: 'col' }, [h('span', { class: 'sr-only' }, [tr('col.remove')])])]));
      ownTable = h('table', { class: 'data rs-own', id: 'rsOwn' }, [h('thead', {}, [head]), h('tbody', {}, body)]);
      issuesSlot = h('div', { class: 'rs-issues-slot' });
      const area = h('textarea', { id: 'rsPasteText', rows: '4', 'aria-describedby': 'rsPasteHint' });
      const paste = h('details', { class: 'rs-paste', id: 'rsPaste' }, [h('summary', {}, [tr('paste')]), h('p', { class: 'muted small', id: 'rsPasteHint' }, [tr('pasteHint')]), area,
        button(tr('pasteApply'), () => {
          const rows = pasteRows(area.value, ownK);
          if (!rows.length) return;
          const now = readOwn().filter((r) => FIELDS.some((f) => r[f].trim())).concat(rows);
          const cut = now.length > U.LIMITS.rows;
          pasteNote = cut;
          commit(now.slice(0, U.LIMITS.rows));
          focus(cut ? 'rsPasteCut' : 'rsAdd');
        }, { id: 'rsPasteApply' })]);
      const cutNote = pasteNote ? h('p', { class: 'rs-m rs-m-warn', id: 'rsPasteCut', role: 'status', tabindex: '-1' }, [tr('pasteCut', { rows: U.LIMITS.rows })]) : null;
      pasteNote = false;
      const card = h('section', { class: 'card rs-card', 'aria-labelledby': 'rsOwnHead' }, [
        h('h2', { id: 'rsOwnHead' }, [tr('own')]), issuesSlot, cutNote,
        h('div', { class: 'rs-scroll', tabindex: '0', role: 'region', 'aria-label': tr('tableLabel', { name: tr('own') }) }, [ownTable]),
        h('div', { class: 'rs-row' }, [
          button(tr('addRow'), () => { const now = readOwn(); commit(now.concat([blank()])); focus(`rsT-${now.length}-id`); },
            { id: 'rsAdd', disabled: m.src.rows.length >= U.LIMITS.rows }),
          button(tr('clear'), () => { commit([blank()]); focus('rsT-0-id'); }, { id: 'rsClear' }),
        ]),
        paste,
        h('p', { class: 'muted small', id: 'rsHelp' }, [tr('help')]),
      ]);
      markOwn();
      return card;
    }
    // Marca cada fila con su error, su aviso o su hito sin rehacer la tabla (el foco y el cursor no se mueven), y el resumen.
    function markOwn() {
      const mk = rowMarks(m, lang());
      for (const row of ownTable.querySelectorAll('tbody tr')) {
        const r = mk.rows.get(Number(row.getAttribute('data-row'))) || { bad: new Set(), warn: new Set(), msgs: [] };
        row.classList.toggle('bad', r.bad.size > 0);
        row.classList.toggle('warn', !r.bad.size && r.warn.size > 0);
        for (const inp of row.querySelectorAll('input[data-f]')) {
          const f = inp.getAttribute('data-f');
          inp.setAttribute('aria-invalid', String(r.bad.has(f)));
          inp.classList.toggle('rs-warn', !r.bad.has(f) && r.warn.has(f));
        }
        const cell = row.querySelector('[data-msg]');
        clear(cell);
        for (const x of r.msgs) cell.appendChild(h('span', { class: `rs-m rs-m-${x.kind}` }, [h('span', { 'aria-hidden': 'true' }, [x.kind === 'err' ? '✕ ' : x.kind === 'warn' ? '! ' : '· ']), x.text]));
      }
      // Los nombres de los recursos en las cabeceras y las etiquetas de sus celdas.
      for (const th of ownTable.querySelectorAll('thead th[data-col]')) th.textContent = colName(th.getAttribute('data-col'));
      for (const inp of ownTable.querySelectorAll('input[data-f]')) {
        const f = inp.getAttribute('data-f');
        if (USE.includes(f)) inp.setAttribute('aria-label', tr('cell', { col: colName(f), n: Number(inp.closest('tr').getAttribute('data-row')) + 1 }));
      }
      clear(issuesSlot);
      const n = m.report.errors.length;
      if (!n && !m.empty) return;
      const lines = [h('strong', {}, [m.empty ? tr('issues.empty') : n === 1 ? tr('issues.errorsOne') : tr('issues.errors', { n })])];
      if (mk.badRows.length) lines.push(' ', tr(mk.badRows.length === 1 ? 'issues.rowOne' : 'issues.rows', { list: I.list(lang(), mk.badRows) }));
      const general = mk.general.length ? h('ul', { class: 'small' }, mk.general.map((x) => h('li', {}, [x]))) : null;
      issuesSlot.appendChild(h('div', { class: 'rs-issues', id: 'rsIssues', role: 'status' }, [h('p', {}, lines), general]));
    }

    // ---------- Los recursos de la tabla propia (tablero 139) ----------
    // Cada valor válido vale al escribirlo (como los costes de la F5b, I-F8); uno no válido se marca al salir del campo.
    const capOk = (v) => !str(v).trim() || /^\d{1,4}$/.test(str(v).trim()) && Number(v) >= 1;
    function readRes() {
      return [0, 1, 2].map((k) => ({ name: root.document.getElementById(`rsResName-${k}`).value, cap: root.document.getElementById(`rsResCap-${k}`).value }));
    }
    function resCard() {
      const rows = resRows(state());
      const typed = () => {
        const all = readRes();
        const bad = all.some((r) => !capOk(r.cap));
        badCap.hidden = !all.some((r, k) => !capOk(r.cap) && root.document.getElementById(`rsResCap-${k}`).getAttribute('aria-invalid') === 'true');
        if (bad) return;
        for (let k = 0; k < 3; k++) root.document.getElementById(`rsResCap-${k}`).setAttribute('aria-invalid', 'false');
        badCap.hidden = true;
        hooks.dispatch({ type: 'rsRes', wr: resFromRows(all) }, { fromEditor: true });
      };
      const marked = (e) => { if (capOk(e.target.value)) return; e.target.setAttribute('aria-invalid', 'true'); badCap.hidden = false; };
      const badCap = h('p', { class: 'rs-m rs-m-err', id: 'rsResBad', role: 'alert', hidden: true }, [tr('res.bad')]);
      const body = rows.map((r, k) => h('tr', {}, [
        h('th', { scope: 'row' }, [tr('res.n', { n: k + 1 })]),
        h('td', {}, [h('input', { id: `rsResName-${k}`, value: r.name, size: '14', maxlength: String(U.RS.LIMITS.name), autocomplete: 'off', spellcheck: 'false',
          'aria-label': tr('res.nameLabel', { n: k + 1 }), oninput: typed })]),
        h('td', {}, [h('input', { id: `rsResCap-${k}`, value: r.cap, size: '5', inputmode: 'numeric', autocomplete: 'off', 'aria-invalid': 'false',
          'aria-label': tr('res.capLabel', { n: k + 1 }), 'aria-describedby': 'rsResHint', oninput: typed, onchange: marked })]),
        h('td', { class: 'muted small' }, [k === 0 ? tr('res.unlimited') : tr('res.unused')]),
      ]));
      return h('section', { class: 'card rs-card', 'aria-labelledby': 'rsResHead' }, [
        h('h2', { id: 'rsResHead' }, [tr('res.title')]),
        h('table', { class: 'data rs-res', id: 'rsRes' }, [h('thead', {}, [h('tr', {}, [h('td', {}, []), h('th', { scope: 'col' }, [tr('res.name')]), h('th', { scope: 'col' }, [tr('res.cap')]), h('td', {}, [])])]),
          h('tbody', {}, body)]),
        badCap,
        h('p', { class: 'muted small', id: 'rsResHint' }, [tr('res.hint')]),
      ]);
    }

    function draw() {
      clear(container);
      ownTable = null; issuesSlot = null;
      container.appendChild(bar());
      container.appendChild(h('div', { class: 'rs-top' }, m.src.kind === 'own' ? [ownCard(), resCard()] : [exampleCard()]));
    }
    function render(model, opts) {
      // Al teclear no se rehace la tabla (el foco y el cursor no se mueven): se marcan las filas. Si cambia el número de
      // recursos (se nombra o se borra uno), la tabla se rehace con una columna más o menos.
      const typing = opts && opts.fromEditor && m && model.src.kind === 'own' && m.src.kind === 'own' && ownTable && ownTable.isConnected
        && model.src.rows.length === m.src.rows.length && model.res.length === ownK;
      m = model;
      if (typing) {
        const cut = root.document.getElementById('rsPasteCut');
        if (cut) cut.remove();
        markOwn();
        return;
      }
      keepFocus(draw);
    }
    function debug() {
      if (!m) return null;
      return { src: { kind: m.src.kind, id: m.src.id }, mode: m.mode, res: m.res.map((r) => ({ label: r.label, cap: r.cap })),
        errors: m.report.errors.map((e) => e.code), warnings: m.report.warnings.map((e) => e.code).filter((c) => c === 'noUse'), ok: !!m.p };
    }
    function leave() { /* T009: nada que parar */ }
    return { render, debug, leave };
  }

  const api = { FIELDS, source, resources, model, resRows, resFromRows, issueText, rowMarks, workRows, pasteRows, create };
  root.PNL = root.PNL || {};
  root.PNL.rsTab = api;
  if (isNode) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
