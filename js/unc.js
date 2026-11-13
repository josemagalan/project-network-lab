/*
 * unc — controlador de la pestaña «Duraciones inciertas» (spec f4a-tres-tiempos-tcl; plan §3–§4, P5, P9 y P14;
 * tableros 63–71). M5 (tres tiempos): el proyecto (un ejemplo de core/stochex o la tabla propia), la actividad elegida
 * con sus tres curvas (core/threept), la tabla de medias y varianzas y la red con las medias. M6 llega en T010.
 *
 * La parte sin DOM (labels, source, parseNum, validate, model, pasteRows, withValue) se prueba en Node
 * (tests/unc.test.js); create() pinta la vista. Para las pruebas de navegador, PNL.unc.state() da el modelo pintado.
 */
(function (root) {
  'use strict';

  const isNode = typeof module !== 'undefined' && module.exports;
  const req = (path, name) => (isNode ? require(path) : root.PNL[name]);
  const I = req('./i18n.js', 'i18n');
  if (isNode) require('./i18n-unc.js');
  const P = req('./core/project.js', 'project');
  const C = req('./core/cpm.js', 'cpm');
  const T = req('./core/threept.js', 'threept');
  const L = req('./core/tcl.js', 'tcl');
  const X = req('./core/stochex.js', 'stochex');
  const NR = req('./narrate.js', 'narrate');

  // El apartado M6 se publica con T010.
  const M6_READY = false;
  const SECTION_EXAMPLES = { m5: ['kl', 'hl'], m6: ['kl', 'hl', 'tr', 'pa'] };
  const FIELDS = ['a', 'm', 'b'];
  // Notación (decisión del autor en clarify): a, m, b con μ y σ² / to, tm, tp con te y σ², como en los apuntes.
  const LABELS = { en: { a: 'a', m: 'm', b: 'b', mean: 'μ', var: 'σ²' }, es: { a: 'tₒ', m: 'tₘ', b: 'tₚ', mean: 'tₑ', var: 'σ²' } };
  const labels = (nota) => LABELS[nota === 'es' ? 'es' : 'en'];
  const str = (v) => (v == null ? '' : String(v));

  // ---------- El proyecto ----------

  /** El proyecto de la pestaña: la tabla propia (texto, como la escribe el alumno) o un ejemplo, con sus nombres en el idioma. */
  function source(state, lang) {
    if (state.ue === 'own' && state.ut) {
      return { kind: 'own', id: 'own', unit: '', mode: state.ut.mode, rows: state.ut.rows.map((r) => Object.assign({}, r)), title: I.t(lang, 'unc.own') };
    }
    const ex = X.get(state.ue) || X.get('kl');
    const rows = ex.rows.map((r) => (ex.m6only ? { id: r.id, name: r.name[lang], mu: r.mu, var: r.var, links: r.links }
      : { id: r.id, name: r.name[lang], a: str(r.a), m: str(r.m), b: str(r.b), links: r.links }));
    return { kind: 'example', id: ex.id, unit: ex.unit[lang], mode: 'pred', rows, title: ex.title[lang], m6only: !!ex.m6only, expected: ex.expected };
  }

  /** Un valor de a, m o b: número ≥ 0 con coma o punto, hasta 6 cifras y 4 decimales (como las duraciones del taller). */
  function parseNum(v) {
    const s = str(v).trim().replace(',', '.');
    if (!s) return { error: 'missing' };
    if (/^\d{1,6}(\.\d{1,4})?$/.test(s)) return { value: Number(s) };
    if (/^\d+(\.\d+)?$/.test(s)) return { error: 'tooBig' };
    return { error: 'badNum' };
  }
  const blankRow = (r) => !str(r.id).trim() && FIELDS.every((f) => !str(r[f]).trim()) && !str(r.links).trim() && !str(r.name).trim();

  /**
   * Comprueba la tabla: a, m y b de cada fila (falta, no es un número, a > m, m > b) y la estructura con core/project
   * (identificadores, precedencias desconocidas, ciclos). Sin errores, da el modelo de core/tcl (actividades con su
   * beta-PERT) y el proyecto con las medias de examen como duraciones.
   */
  function validate(src) {
    if (src.m6only) {
      const model = L.fromExample(X.get(src.id));
      return { issues: [], warnings: [], model, rows: src.rows };
    }
    const issues = []; const nums = {};
    src.rows.forEach((r, i) => {
      if (blankRow(r)) return;
      const v = {};
      for (const f of FIELDS) {
        const p = parseNum(r[f]);
        if (p.error) issues.push({ code: p.error, row: i, f }); else v[f] = p.value;
      }
      if (FIELDS.every((f) => f in v)) {
        if (v.a > v.m) issues.push({ code: 'aGtM', row: i });
        else if (v.m > v.b) issues.push({ code: 'mGtB', row: i });
        else nums[str(r.id).trim()] = v;
      }
    });
    // La estructura, con una duración cualquiera en las filas con algo escrito (las vacías se saltan, como en el taller).
    const { project, report } = P.parse(src.rows.map((r) => ({ id: r.id, name: r.name, duration: blankRow(r) ? '' : '1', links: r.links })), src.mode);
    for (const e of report.errors) issues.push(Object.assign({ struct: true }, e));
    issues.sort((x, y) => (x.row == null ? 1e9 : x.row) - (y.row == null ? 1e9 : y.row));
    if (issues.length || !project) return { issues, warnings: report.warnings, model: null, rows: src.rows, empty: !project && !issues.length };
    const model = { acts: project.activities.map((a) => ({ id: a.id, name: a.name, preds: project.preds[a.id].slice(),
      dist: { kind: 'pert', a: nums[a.id].a, m: nums[a.id].m, b: nums[a.id].b } })) };
    return { issues, warnings: report.warnings, model, rows: src.rows, structure: project };
  }

  /** El modelo de la vista: proyecto, comprobación, medias y varianzas, camino crítico de las medias y actividad elegida. */
  function model(state, lang) {
    const src = source(state, lang);
    const v = validate(src);
    const out = { src, issues: v.issues, warnings: v.warnings, model: v.model, empty: !!v.empty, acts: [], sel: null, solution: null, project: null, exam: null };
    if (!v.model) return out;
    out.acts = v.model.acts.map((a) => {
      const d = a.dist;
      const st = d.kind === 'normal' ? null : { exam: T.exam(d), pert: T.moments('pert', d), classic: T.moments('classic', d), tri: T.moments('tri', d) };
      const mom = L.moments(d);
      return { id: a.id, name: a.name || '', preds: a.preds, dist: d, mean: mom.mean, var: mom.var, stats: st };
    });
    const preds = {}; const succs = {};
    for (const a of out.acts) { preds[a.id] = a.preds.slice(); succs[a.id] = []; }
    for (const a of out.acts) for (const p of a.preds) succs[p].push(a.id);
    out.project = { activities: out.acts.map((a) => ({ id: a.id, name: a.name, d: a.mean })), preds, succs };
    out.solution = C.solve(out.project);
    out.exam = L.exam(v.model, { prob: 0.5 });
    const ids = out.acts.map((a) => a.id);
    out.sel = ids.includes(state.ua) ? state.ua : ids[0];
    return out;
  }

  /** Filas pegadas: actividad, [nombre,] a, m, b[, precedencias], separadas por tabuladores o por punto y coma. */
  function pasteRows(text) {
    const lines = str(text).split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const out = [];
    for (const line of lines) {
      const c = line.split(/\t|;/).map((x) => x.trim());
      if (c.length >= 6) out.push({ id: c[0], name: c[1], a: c[2], m: c[3], b: c[4], links: c.slice(5).join(', ') });
      else if (c.length === 5) out.push(parseNum(c[1]).error ? { id: c[0], name: c[1], a: c[2], m: c[3], b: c[4], links: '' } : { id: c[0], name: '', a: c[1], m: c[2], b: c[3], links: c[4] });
      else if (c.length === 4) out.push({ id: c[0], name: '', a: c[1], m: c[2], b: c[3], links: '' });
    }
    // Una primera fila de encabezados (a, m y b que no son números) no es una actividad.
    if (out.length && FIELDS.every((f) => parseNum(out[0][f]).error === 'badNum')) out.shift();
    return out;
  }

  /** Las filas de la tabla propia con un valor cambiado en una actividad (los deslizadores de M5). */
  function withValue(rows, id, field, value) {
    return rows.map((r) => (str(r.id).trim() === id ? Object.assign({}, r, { [field]: str(value) }) : Object.assign({}, r)));
  }

  /** Puntos de una curva sobre [a, b] (sin pasar de ymax, por si la densidad se dispara en un extremo). */
  function curvePts(kind, d, n) {
    return Array.from({ length: n + 1 }, (_, i) => { const x = d.a + ((d.b - d.a) * i) / n; return [x, T.pdf(kind, d, x)]; });
  }
  function niceTicks(lo, hi, count) {
    const raw = (hi - lo) / count; const p = 10 ** Math.floor(Math.log10(raw));
    const step = [1, 2, 2.5, 5, 10].map((k) => k * p).find((s) => s >= raw) || raw;
    const out = [];
    for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(Math.round(v * 1e6) / 1e6);
    return out;
  }

  // ---------- Vista ----------

  function create(container, hooks) {
    const { h, clear } = root.PNL.dom;
    const DC = root.PNL.distChart;
    const lang = () => hooks.lang();
    const state = () => hooks.state();
    const t = (k, p) => I.t(lang(), k, p);
    const tu = (k, p) => I.t(lang(), `unc.${k}`, p);
    const num = (v) => NR.fmt(lang(), v);
    const lab = () => labels(state().nota);
    let m = null;

    function focus(id) { const el = root.document.getElementById(id); if (el) el.focus(); }
    function keepFocus(fn) {
      const a = root.document.activeElement;
      const id = a && container.contains(a) ? a.id : null;
      fn();
      if (id) { const el = root.document.getElementById(id); if (el) el.focus(); }
    }
    const button = (label, onclick, attrs) => h('button', Object.assign({ type: 'button', class: 'ghost', onclick }, attrs || {}), [label]);
    const seg = (items, label) => h('div', { class: 'seg', role: 'group', 'aria-label': label },
      items.filter((x) => !x[4]).map(([text, on, fn, id]) => h('button', { type: 'button', 'aria-pressed': String(!!on), onclick: fn, id }, [text])));
    const go = (action, opts) => hooks.dispatch(Object.assign({ type: 'unc' }, action), opts);

    // ---------- Barra ----------
    function bar() {
      const s = state();
      const sections = seg([[tu('m5'), s.um === 'm5', () => go({ um: 'm5' }), 'uncM5'], [tu('m6'), s.um === 'm6', () => go({ um: 'm6' }), 'uncM6', !M6_READY]], tu('sections'));
      const ids = SECTION_EXAMPLES[s.um] || SECTION_EXAMPLES.m5;
      const sel = h('select', { id: 'uncProj', onchange: (e) => pickProject(e.target.value) },
        ids.map((id) => h('option', { value: id, selected: s.ue === id }, [X.get(id).title[lang()]]))
          .concat([h('option', { value: 'own', selected: s.ue === 'own' }, [tu('own')])]));
      return h('div', { class: 'card unc-bar' }, [h('div', { class: 'unc-row' }, [
        sections,
        h('label', { class: 'unc-field' }, [tu('project'), ' ', sel]),
        button(tu('fromWork'), fromWork, { id: 'uncFromWork' }),
      ])]);
    }
    function pickProject(id) {
      if (id === 'own' && !state().ut) { hooks.dispatch({ type: 'uncTable', mode: 'pred', rows: [{ id: 'A', name: '', a: '', m: '', b: '', links: '' }] }, { push: true }); focus('uncT-0-a'); return; }
      go({ ue: id, ua: null }, { push: true });
    }
    function fromWork() {
      const w = hooks.workRows();
      hooks.dispatch({ type: 'uncFromWork', rows: w.rows, mode: w.mode }, { push: true });
      if (hooks.announce) hooks.announce(tu('ownFromWork', lab()));
      focus('uncProj');
    }

    // ---------- M5: la actividad elegida ----------
    function actCard() {
      const s = state(); const L5 = lab();
      const act = m.acts.find((a) => a.id === m.sel);
      const d = act.dist;
      const head = h('h2', { id: 'uncActHead' }, [act.name ? tu('actTitle', { id: act.id, name: act.name }) : tu('actTitleNoName', { id: act.id })]);
      const pick = h('label', { class: 'unc-field' }, [tu('act'), ' ', h('select', { id: 'uncAct', onchange: (e) => go({ ua: e.target.value }) },
        m.acts.map((a) => h('option', { value: a.id, selected: a.id === act.id }, [a.name ? `${a.id} · ${a.name}` : a.id])))]);
      const maxB = Math.max(...m.acts.map((a) => a.dist.b));
      const top = Math.max(20, Math.ceil(maxB * 1.25 / 5) * 5);
      const sliders = h('div', { class: 'unc-sliders' }, FIELDS.map((f) => {
        const out = h('output', { id: `uncOut-${f}`, for: `uncSl-${f}` }, [num(d[f])]);
        const input = h('input', { type: 'range', id: `uncSl-${f}`, min: '0', max: String(top), step: '0.5', value: String(d[f]), 'aria-label': L5[f],
          oninput: (e) => { out.textContent = num(clampTo(d, f, Number(e.target.value))); },
          onchange: (e) => setValue(act.id, f, clampTo(d, f, Number(e.target.value))) });
        return h('label', { class: 'unc-slider' }, [h('span', { class: 'unc-sym' }, [L5[f]]), input, out]);
      }));
      const parts = [h('div', { class: 'unc-head' }, [head, pick]), sliders];
      if (m.src.kind === 'example') parts.push(h('p', { class: 'muted small' }, [tu('toOwn', L5)]));
      const holder = h('div', { class: 'unc-chart', id: 'uncChart' });
      parts.push(holder);
      const fixed = !(d.b > d.a);
      if (fixed) parts.push(h('p', { class: 'small', id: 'uncFixed', role: 'status' }, [tu('fixed', Object.assign({ d: num(d.a) }, L5))]));
      else parts.push(legend(s.uc));
      parts.push(h('label', { class: 'unc-check' }, [h('input', { type: 'checkbox', id: 'uncClassic', checked: !!s.uc, disabled: fixed,
        onchange: (e) => go({ uc: e.target.checked ? 1 : 0 }) }), ' ', tu('classic')]));
      parts.push(cmpTable(act, s.uc));
      const card = h('section', { class: 'card unc-act', id: 'uncActCard', 'aria-labelledby': 'uncActHead' }, parts);
      drawCurves(holder, act, s.uc);
      return card;
    }
    // a ≤ m ≤ b: un deslizador no pasa de sus vecinos (la tabla propia sí admite el error y lo explica).
    function clampTo(d, f, v) { return f === 'a' ? Math.min(v, d.m) : f === 'b' ? Math.max(v, d.m) : Math.min(Math.max(v, d.a), d.b); }
    function setValue(id, field, value) {
      const rows = withValue(m.src.rows, id, field, value);
      hooks.dispatch({ type: 'uncTable', rows, mode: m.src.mode });
      focus(`uncSl-${field}`);
    }
    function legend(uc) {
      const L5 = lab();
      const item = (cls, text) => h('span', { class: 'unc-key' }, [h('span', { class: `unc-swatch ${cls}`, 'aria-hidden': 'true' }), text]);
      return h('div', { class: 'unc-legend', 'aria-hidden': 'true' }, [item('k-pert', tu('legend.pert')), item('k-tri', tu('legend.tri'))]
        .concat(uc ? [item('k-classic', tu('legend.classic', L5))] : []).concat([item('k-mean', tu('legend.mean')), item('k-sd', tu('legend.sd'))]));
    }
    function drawCurves(holder, act, uc) {
      const d = act.dist; const st = act.stats; const L5 = lab();
      const fixed = !(d.b > d.a);
      const pad = fixed ? Math.max(1, d.a * 0.2) : (d.b - d.a) * 0.06;
      const lo = Math.max(0, d.a - pad); const hi = d.b + pad;
      const kinds = fixed ? [] : ['pert', 'tri'].concat(uc ? ['classic'] : []);
      const curves = kinds.map((k) => ({ pts: curvePts(k, d, k === 'tri' ? 2 : 160), cls: `c-${k}`, dash: k === 'tri' ? '6 4' : k === 'classic' ? '2 3' : null }));
      const ymax = fixed ? 1 : Math.max(...curves.map((c) => Math.max(...c.pts.map((p) => p[1])))) * 1.12;
      const vlines = [{ x: st.exam.mean, cls: 'v-mean', label: `${L5.mean} ${num(st.exam.mean)}` }];
      if (!fixed) { const sd = Math.sqrt(st.pert.var); vlines.push({ x: st.pert.mean - sd, cls: 'v-sd', dash: '3 3' }, { x: st.pert.mean + sd, cls: 'v-sd', dash: '3 3' }); }
      const list = kinds.map((k) => tu(`legend.${k}`)).join(', ');
      DC.render(holder, { w: 600, h: 240, x: [lo, hi], ymax, ticks: niceTicks(lo, hi, 6), fmt: num, curves, vlines,
        label: tu('chartLabel', { id: act.id, a: num(d.a), b: num(d.b), list: list || '—', mean: num(st.exam.mean) }) });
    }
    function cmpTable(act, uc) {
      const st = act.stats;
      const cols = ['exam', 'pert'].concat(uc ? ['classic'] : []).concat(['tri']);
      const head = h('tr', {}, [h('td', {})].concat(cols.map((c) => h('th', { scope: 'col' }, [tu(`cmp.${c}`)]))));
      const row = (k) => h('tr', {}, [h('th', { scope: 'row' }, [tu(`cmp.${k}`)])].concat(cols.map((c) => h('td', { class: 'num' }, [num(st[c][k])]))));
      return h('table', { class: 'data unc-table unc-cmp', id: 'uncCmp' }, [h('caption', { class: 'muted small' }, [tu('cmp.caption', { id: act.id })]),
        h('thead', {}, [head]), h('tbody', {}, [row('mean'), row('var')])]);
    }

    // ---------- La tabla del proyecto ----------
    function projectCard() {
      const L5 = lab();
      const title = m.src.unit ? tu('tableTitleUnit', { unit: m.src.unit }) : tu('tableTitle');
      const linkCol = m.src.mode === 'succ' ? t('work.colSucc') : t('work.colPred');
      if (m.src.kind === 'own') return ownCard(title, linkCol);
      const crit = new Set(m.exam ? m.exam.path : []);
      const head = h('tr', {}, [t('work.colId'), t('work.colName'), L5.a, L5.m, L5.b, L5.mean, L5.var].map((c) => h('th', { scope: 'col' }, [c])));
      const body = m.acts.map((a) => h('tr', { class: `${a.id === m.sel ? 'sel' : ''}${crit.has(a.id) ? ' crit' : ''}`, 'data-act': a.id }, [
        h('th', { scope: 'row' }, [h('button', { type: 'button', class: 'linklike', onclick: () => go({ ua: a.id }), 'aria-pressed': String(a.id === m.sel) }, [a.id])]),
        h('td', {}, [a.name]), h('td', { class: 'num' }, [num(a.dist.a)]), h('td', { class: 'num' }, [num(a.dist.m)]), h('td', { class: 'num' }, [num(a.dist.b)]),
        h('td', { class: 'num' }, [num(a.mean)]), h('td', { class: 'num' }, [num(a.var)])]));
      return h('section', { class: 'card unc-proj', 'aria-labelledby': 'uncProjHead' }, [h('h2', { id: 'uncProjHead' }, [title]),
        h('div', { class: 'unc-scroll', tabindex: '0', role: 'region', 'aria-label': tu('tableCaption', { name: m.src.title }) }, [h('table', { class: 'data unc-table', id: 'uncTable' },
          [h('caption', { class: 'sr-only' }, [tu('tableCaption', { name: m.src.title })]), h('thead', {}, [head]), h('tbody', {}, body)])])]);
    }
    function ownCard(title, linkCol) {
      const L5 = lab(); const rows = m.src.rows;
      const cols = [['id', t('work.colId'), 4], ['name', t('work.colName'), 14], ['a', L5.a, 5], ['m', L5.m, 5], ['b', L5.b, 5], ['links', linkCol, 9]];
      const bad = badMap();
      const commit = (next, mode) => hooks.dispatch({ type: 'uncTable', rows: next, mode: mode || m.src.mode });
      // Como en el taller, cada tecla se aplica sin rehacer la tabla (fromEditor): el foco y el cursor no se mueven.
      const typed = () => hooks.dispatch({ type: 'uncTable', rows: readOwn(), mode: m.src.mode }, { fromEditor: true });
      const body = rows.map((r, i) => h('tr', { class: bad.has(i) ? 'bad' : '', 'data-row': String(i) }, cols.map(([f, label, size]) => h('td', {}, [h('input', {
        id: `uncT-${i}-${f}`, value: str(r[f]), size: String(size), 'aria-label': tu('cell', { col: label, n: i + 1 }), 'aria-invalid': String(!!(bad.get(i) || []).includes(f)),
        'data-f': f, oninput: typed,
      })])).concat([h('td', {}, [h('button', { type: 'button', class: 'ghost small-btn', id: `uncDel-${i}`, 'aria-label': tu('removeRow', { n: i + 1 }),
        onclick: () => { commit(readOwn().filter((_, j) => j !== i)); focus(i > 0 ? `uncDel-${i - 1}` : 'uncAdd'); } }, ['×'])])])));
      const head = h('tr', {}, cols.map(([, label]) => h('th', { scope: 'col' }, [label])).concat([h('th', { scope: 'col' }, [h('span', { class: 'sr-only' }, [tu('removeRow', { n: '' }).trim()])])]));
      const mode = h('fieldset', { class: 'unc-mode' }, [h('legend', {}, [t('work.modeLegend')])].concat(['pred', 'succ'].map((k) => h('label', {}, [
        h('input', { type: 'radio', name: 'uncMode', id: `uncMode-${k}`, value: k, checked: m.src.mode === k, onchange: () => switchMode(k) }), ' ', t(k === 'pred' ? 'work.modePred' : 'work.modeSucc')]))));
      const area = h('textarea', { id: 'uncPasteText', rows: '4', 'aria-describedby': 'uncPasteHint' });
      const paste = h('details', { class: 'unc-paste', id: 'uncPaste' }, [h('summary', {}, [tu('paste')]), h('p', { class: 'muted small', id: 'uncPasteHint' }, [tu('pasteHint', L5)]), area,
        button(tu('pasteApply'), () => { const next = pasteRows(area.value); if (next.length) { commit(next); focus('uncT-0-a'); } }, { id: 'uncPasteApply' })]);
      const parts = [h('h2', { id: 'uncProjHead' }, [title]), h('p', { class: 'muted small' }, [tu('ownHint', L5)]), mode,
        h('div', { class: 'unc-scroll', tabindex: '0', role: 'region', 'aria-label': tu('ownTitle') }, [h('table', { class: 'data unc-table unc-own', id: 'uncOwn' }, [h('thead', {}, [head]), h('tbody', {}, body)])]),
        h('div', { class: 'unc-row' }, [button(tu('addRow'), () => { const now = readOwn(); commit(now.concat([{ id: '', name: '', a: '', m: '', b: '', links: '' }])); focus(`uncT-${now.length}-id`); }, { id: 'uncAdd' })]),
        paste];
      return h('section', { class: 'card unc-proj', 'aria-labelledby': 'uncProjHead' }, parts);
    }
    // Errores por fila: qué casillas marcar.
    function badMap() {
      const bad = new Map();
      for (const is of m.issues) if (is.row != null) bad.set(is.row, (bad.get(is.row) || []).concat(is.f ? [is.f] : is.code === 'aGtM' ? ['a', 'm'] : is.code === 'mGtB' ? ['m', 'b'] : ['id', 'links']));
      return bad;
    }
    // Las filas tal como están escritas en la tabla propia.
    function readOwn() {
      return [...container.querySelectorAll('#uncOwn tbody tr')].map((tr) => {
        const r = {};
        for (const inp of tr.querySelectorAll('input[data-f]')) r[inp.getAttribute('data-f')] = inp.value;
        return r;
      });
    }
    function markOwn() {
      const bad = badMap();
      for (const tr of container.querySelectorAll('#uncOwn tbody tr')) {
        const i = Number(tr.getAttribute('data-row'));
        tr.classList.toggle('bad', bad.has(i));
        for (const inp of tr.querySelectorAll('input[data-f]')) inp.setAttribute('aria-invalid', String((bad.get(i) || []).includes(inp.getAttribute('data-f'))));
      }
    }
    function switchMode(mode) {
      const v = validate(m.src);
      if (v.structure) {
        // Con la estructura bien, las precedencias se reescriben en la otra forma; si no, solo cambia cómo se leen.
        const back = Object.fromEntries(P.toRows(v.structure, mode).map((r) => [r.id, r.links]));
        hooks.dispatch({ type: 'uncTable', mode, rows: m.src.rows.map((r) => Object.assign({}, r, { links: back[str(r.id).trim()] != null ? back[str(r.id).trim()] : r.links })) });
      } else hooks.dispatch({ type: 'uncTable', mode, rows: m.src.rows });
      focus(`uncMode-${mode}`);
    }
    function issuesCard() {
      const L5 = lab();
      const text = (is) => (is.struct ? t(`issue.${is.code}`, { row: is.row == null ? '' : is.row + 1, ids: (is.ids || []).join(', '), a: (is.ids || [])[0], b: (is.ids || [])[1] })
        : tu(`issue.${is.code}`, Object.assign({ row: is.row + 1, f: L5[is.f] }, L5)));
      const n = m.issues.length;
      return h('section', { class: 'card unc-issues', id: 'uncIssues', role: 'status', 'aria-labelledby': 'uncIssuesHead' }, [
        h('h2', { id: 'uncIssuesHead' }, [m.empty ? tu('empty') : n === 1 ? tu('issuesOne') : tu('issues', { n })]),
        n ? h('ul', { class: 'small' }, m.issues.map((is) => h('li', {}, [text(is)]))) : null,
        h('p', { class: 'small' }, [tu('invalid')])]);
    }

    // ---------- La red con las medias ----------
    let lay = { key: null, roy: null, net: null, pert: null };
    function netCard() {
      const s = state(); const pert = s.graph === 'aoa';
      const path = m.exam ? m.exam.path.join('–') : '';
      const holder = h('div', { class: 'unc-net', id: 'uncNet', tabindex: '0' });
      const graphs = seg([[t('view.graphAon'), !pert, () => hooks.dispatch({ type: 'graph', value: 'aon' }), 'uncAon'], [t('view.graphAoa'), pert, () => hooks.dispatch({ type: 'graph', value: 'aoa' }), 'uncAoa']], t('view.graphLabel'));
      const card = h('section', { class: 'card unc-netcard', 'aria-labelledby': 'uncNetHead' }, [h('div', { class: 'unc-head' }, [h('h2', { id: 'uncNetHead' }, [tu('net', { path })]), graphs]), holder]);
      const key = JSON.stringify(m.project.activities.map((a) => [a.id, a.d, m.project.preds[a.id]]));
      if (lay.key !== key) {
        const net = root.PNL.aoa.build(m.project, { solution: m.solution });
        lay = { key, roy: root.PNL.layout.layout(m.solution, m.project), net, pert: root.PNL.aoaLayout.layout(net) };
      }
      const all = (tr) => new Map(tr.flatMap((st) => st.reveals || []).map((rv) => [root.PNL.predict.key(rv), rv.value]));
      const name = tu('netLabel', { name: m.src.title });
      if (pert) root.PNL.pertView.render(holder, { net: lay.net, lay: lay.pert, step: null, revealed: all(lay.net.trace), solution: m.solution, lang: lang(), nota: s.nota,
        criticalOn: true, numFmt: num, name, numbered: true, fit: true, idPrefix: 'unc-pk', geo: { colGap: 104, rowGap: 74 } });
      else root.PNL.royView.render(holder, { project: m.project, solution: m.solution, lay: lay.roy, step: null, revealed: all(m.solution.trace), box: s.box, lang: lang(), nota: s.nota,
        criticalOn: true, numFmt: num, name, selected: m.sel, selPrecs: [], fit: true, geo: { gx: 30, gy: 20 }, minWidth: 360, onSelect: (id) => go({ ua: id }) });
      return card;
    }

    // ---------- Pintar ----------
    // A la izquierda, la actividad (o los errores de la tabla); a la derecha, la tabla del proyecto y la red.
    let left = null; let side = null; let proj = null;
    function fill() {
      clear(left);
      left.appendChild(m.model ? actCard() : issuesCard());
      while (side.lastChild && side.lastChild !== proj) side.removeChild(side.lastChild);
      if (m.model) side.appendChild(netCard());
    }
    function draw() {
      clear(container);
      container.appendChild(bar());
      left = h('div', { class: 'unc-left' }); proj = projectCard(); side = h('div', { class: 'unc-side' }, [proj]);
      container.appendChild(h('div', { class: 'unc-main' }, [left, side]));
      fill();
    }
    function render(model, opts) {
      const typing = opts && opts.fromEditor && m && m.src.kind === 'own' && model.src.kind === 'own' && proj && proj.isConnected
        && model.src.rows.length === m.src.rows.length && model.src.mode === m.src.mode;
      m = model;
      if (typing) { markOwn(); fill(); return; }
      keepFocus(draw);
    }
    function debug() { return m ? { src: m.src, issues: m.issues, acts: m.acts.map((a) => ({ id: a.id, mean: a.mean, var: a.var })), sel: m.sel, path: m.exam ? m.exam.path : null } : null; }
    return { render, debug };
  }

  const api = { M6_READY, SECTION_EXAMPLES, LABELS, labels, source, parseNum, validate, model, pasteRows, withValue, curvePts, niceTicks, create };
  root.PNL = root.PNL || {};
  root.PNL.unc = api;
  if (isNode) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
