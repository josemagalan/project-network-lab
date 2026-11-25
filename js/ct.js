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
  const PRD = () => req('./predict.js', 'predict');

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

  // ---------- La compresión (T011; tableros 123, 125 y 127) ----------

  const hasCosts = (k) => KC.some((x) => k[x] != null && Number(k[x]) !== 0);
  let cmpCache = { key: null, val: null };

  /**
   * La tabla de la compresión: una fila por duración, de la normal a la mínima, con la regla (conjunto, coste del paso,
   * coste directo, duraciones, empate), el óptimo (coste y duraciones), los totales con los costes del proyecto y la marca
   * de la regla que queda por encima. `first` es la primera fila por encima (con el movimiento, AC4); `best`, las
   * duraciones de coste total mínimo. Se guarda la última: cambiar de idioma o de fila no la recalcula.
   */
  function compression(m) {
    if (!m.p) return null;
    const key = JSON.stringify([m.p.activities.map((a) => [a.id, a.dn, a.dc, a.cn, a.cc, m.p.preds[a.id]]), m.k]);
    if (cmpCache.key === key) return cmpCache.val;
    const cur = K.curve(m.p);
    const steps = K.rule(m.p, cur);
    const tot = new Map(K.totals(m.p, m.k, cur).map((x) => [x.T, x]));
    const opt = new Map(cur.map((o) => [o.T, o]));
    const d0 = K.normalD(m.p);
    const sch0 = K.schedule(m.p, d0);
    const row = (T, extra) => Object.assign({ T, opt: opt.get(T).cost, optD: opt.get(T).d, tot: tot.get(T) }, extra);
    const rows = [row(sch0.T, { paths: sch0.criticalPaths, set: [], stepCost: null, rule: K.directCost(m.p, d0), d: d0, above: false })];
    for (const x of steps) {
      if (x.end) break;
      rows.push(row(x.T, { paths: K.schedule(m.p, x.d).criticalPaths, set: x.set, stepCost: x.stepCost, rule: x.cost, d: x.d, above: x.above,
        unique: x.unique, other: x.other, move: x.move || null, from: x.from }));
    }
    const val = { rows, best: K.best(m.p, m.k, cur), hasCosts: hasCosts(m.k), normalT: rows[0].T, minT: rows[rows.length - 1].T,
      first: rows.find((r) => r.above) || null, end: steps[steps.length - 1] };
    cmpCache = { key, val };
    return val;
  }

  /** La duración elegida (AC10): kd dentro de [mínima, normal]; sin kd, la primera de coste total mínimo. */
  function chosenT(state, c) {
    const kd = state.kd;
    if (kd == null) return c.best[0];
    return Math.max(c.minT, Math.min(c.normalT, kd));
  }

  /** Las cuentas del movimiento: las pendientes de las que se acortan, menos las de las que se vuelven a alargar. */
  function moveTerms(m, mv, lang) {
    const b = (id) => NR.fmt(lang, m.p.byId[id].b);
    return mv.shorten.map(b).join(' + ') + mv.lengthen.map((id) => ` − ${b(id)}`).join('');
  }

  /** Marcas de las redes: 'short' (se acorta en el paso) y 'min' (en su duración urgente, si se puede acortar). */
  function netTags(p, d, set) {
    const out = new Map();
    for (const a of p.activities) {
      const t = [];
      if (set.includes(a.id)) t.push('short');
      if (a.dn > a.dc && d[a.id] <= a.dc) t.push('min');
      if (t.length) out.set(a.id, t);
    }
    return out;
  }

  /** Lo que dibuja views/ct-chart: con costes del proyecto, total, directo e indirecto (con penalización y prima); sin
   * ellos, solo el directo; la regla, si se queda por encima en alguna duración. */
  function curveSpec(m, c, chosen, lang, width) {
    const rows = c.rows.slice().reverse();
    const pts = (f) => rows.map((r) => [r.T, f(r)]);
    const series = [];
    if (c.hasCosts) series.push({ key: 'total', pts: pts((r) => r.tot.total), cls: 'ctc-total' });
    series.push({ key: 'direct', pts: pts((r) => r.opt), cls: 'ctc-direct' });
    if (c.hasCosts) series.push({ key: 'extra', pts: pts((r) => r.tot.ind + r.tot.pen - r.tot.bonus), cls: 'ctc-extra', dash: '6 4' });
    if (c.rows.some((r) => r.above)) series.push({ key: 'rule', pts: pts((r) => r.rule), cls: 'ctc-rule', dash: '2 3' });
    const tc = (k, q) => I.t(lang, `ct.curve.${k}`, q);
    const main = series[0];
    const min = Math.min(...main.pts.map((q) => q[1]));
    // A 360 px la curva se dibuja a su ancho (tablero 129), para que las cifras se lean.
    const w = Math.round(Math.max(300, Math.min(500, width || 500)));
    return { w, h: w < 420 ? 210 : 250, ts: rows.map((r) => r.T), series, best: c.best, chosen, pick: main.key, fmt: (v) => NR.fmt(lang, v),
      xLabel: tc('x'), label: tc('label', { name: m.src.title, what: tc(main.key), v: NR.fmt(lang, min), list: I.list(lang, c.best.map(String)) }),
      pointTitle: (T, v) => tc('point', { T, what: tc(main.key), v: NR.fmt(lang, v) }) };
  }

  // ---------- El paso a paso (T012; tablero 124) ----------

  let trCache = { key: null, val: null };
  /** La traza del reproductor (crash.trace): tabla, un paso por unidad, fin y totales; null si la tabla no se lee. */
  function trace(m) {
    if (!m.p) return null;
    const key = JSON.stringify([m.p.activities.map((a) => [a.id, a.dn, a.dc, a.cn, a.cc, m.p.preds[a.id]]), m.k]);
    if (trCache.key !== key) trCache = { key, val: K.trace(m.p, m.k) };
    return trCache.val;
  }

  /** Las redes de un paso: antes de comprobar, las duraciones de partida sin marcas; después, las del paso con lo acortado. */
  function walkNets(m, step, hide) {
    if (step.kind === 'ctStep') return hide ? { T: step.from, d: step.dBefore, set: [] } : { T: step.T, d: step.d, set: step.set };
    if (step.kind === 'ctTable') return { T: step.T, d: K.normalD(m.p), set: [] };
    const tr = trace(m);
    const end = tr.find((x) => x.kind === 'ctEnd');
    return { T: end.T, d: end.d, set: [] };
  }

  /** Lo que se le dice al alumno al comprobar un paso: el conjunto (acierto o por qué no sirve) y el coste del paso. */
  function feedback(m, step, answers, lang) {
    const tw = (k, q) => I.t(lang, `ct.walk.${k}`, q);
    const num = (v) => NR.fmt(lang, v);
    const tT = (T) => (m.src.unit ? `${T} ${m.src.unit}` : String(T));
    const given = [...(answers.get('ct.set') || [])];
    const order = m.p.activities.map((a) => a.id).filter((id) => given.includes(id));
    const out = [];
    const r = K.setCheck(step.reveals[0].check, order);
    if (r.ok) out.push({ kind: 'ok', text: tw('ok', { set: I.list(lang, order), cost: num(r.cost) }) });
    else if (r.reason === 'notCritical' || r.reason === 'atLimit') out.push({ kind: 'wrong', text: tw(r.ids.length === 1 ? `${r.reason}One` : r.reason, { list: I.list(lang, r.ids) }) });
    else if (r.reason === 'pathUncut') out.push({ kind: 'wrong', text: tw('pathUncut', { path: r.path.join('–'), from: tT(step.from) }) });
    else out.push({ kind: 'wrong', text: tw('dearer', { cost: num(r.cost), best: num(r.best) }) });
    const c = PRD().parseAnswer(answers.get('ct.cost'));
    const v = num(step.stepCost);
    if (c === null) out.push({ kind: 'wrong', text: tw('costEmpty', { v }) });
    else out.push(PRD().check(step, answers).get('ct.cost') === 'ok' ? { kind: 'ok', text: tw('costOk', { v }) } : { kind: 'wrong', text: tw('costWrong', { v }) });
    return out;
  }

  // ---------- El atajo de Nicholas (T013; tablero 128) ----------

  let scCache = { key: null, val: null };
  /** crash.shortcut con las duraciones del óptimo a la misma duración (para explicar cuándo queda por encima). */
  function shortcut(m) {
    if (!m.p) return null;
    const key = JSON.stringify(m.p.activities.map((a) => [a.id, a.dn, a.dc, a.cn, a.cc, m.p.preds[a.id]]));
    if (scCache.key !== key) {
      const sc = K.shortcut(m.p);
      scCache = { key, val: Object.assign({}, sc, { optD: K.optimum(m.p, sc.T).d }) };
    }
    return scCache.val;
  }

  /** Una fila por actividad: urgente, pendiente, unidades que se alarga y duración al final. */
  const shortcutRows = (m, sc) => m.p.activities.map((a) => ({ id: a.id, dc: a.dc, b: a.b, ext: sc.units[a.id] || 0, final: sc.d[a.id], can: a.dn > a.dc }));

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
      const s = state();
      const seg = (kn) => h('button', { type: 'button', class: 'ghost', id: `ctNets-${kn}`, 'aria-pressed': String(s.kn === kn), disabled: !m.p,
        onclick: () => { go({ kn }); focus(`ctNets-${kn}`); } }, [tc(`bar.${kn}`)]);
      return h('div', { class: 'card ct-bar' }, [h('div', { class: 'ct-row' }, [
        h('label', { class: 'ct-field' }, [tc('project'), ' ', sel]),
        button(tc('fromWork'), fromWork, { id: 'ctFromWork' }),
        h('div', { class: 'seg', role: 'group', 'aria-label': tc('bar.nets') }, [h('span', { class: 'ct-seg-label', 'aria-hidden': 'true' }, [tc('bar.nets')]),
          seg('roy'), seg('pert'), seg('both')]),
        h('div', { class: 'seg' }, [h('button', { type: 'button', class: 'ghost', id: 'ctGanttBtn', 'aria-pressed': String(s.kg === 1), disabled: !m.p,
          onclick: () => { go({ kg: s.kg === 1 ? 0 : 1 }); focus('ctGanttBtn'); } }, [tc('bar.gantt')])]),
        // «Atajo» (T013, tablero 128): el atajo de Nicholas en lugar de la compresión (ka); fuera del paso a paso.
        h('div', { class: 'seg' }, [h('button', { type: 'button', class: 'ghost', id: 'ctShortBtn', 'aria-pressed': String(s.ka === 1 && !walking()), disabled: !m.p,
          onclick: () => { if (walking()) hooks.dispatch({ type: 'go', n: 0 }); go({ ka: s.ka === 1 && !walking() ? 0 : 1 }); focus('ctShortBtn'); } }, [tc('short.toggle')])]),
        h('span', { class: 'ct-push' }),
        // «Paso a paso» (T012): del paso 1 en adelante; volver al paso 0 es volver a la tabla y la curva.
        h('div', { class: 'seg' }, [h('button', { type: 'button', class: 'ghost', id: 'ctWalk', 'aria-pressed': String(walking()), disabled: !m.trace,
          onclick: () => { hooks.dispatch({ type: 'go', n: walking() ? 0 : 1 }); focus('ctWalk'); } }, [tc('walk.toggle')])]),
        walking() ? h('label', { class: 'ct-check' }, [h('input', { type: 'checkbox', id: 'ctPred', checked: !!s.pred,
          onchange: (e) => { hooks.dispatch({ type: 'set', key: 'pred', value: e.target.checked ? 1 : 0 }); focus('ctPred'); } }), ' ', I.t(lang(), 'predict.toggle')]) : null,
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

    // ---------- La compresión, la curva, las redes y el Gantt (T011; tableros 123, 125, 127 y 129) ----------
    let lower = null;
    let optView = false;   // P8: en una fila en que la regla queda por encima, las redes con las duraciones del óptimo
    let optKey = null;
    const tT = (T) => (m.src.unit ? `${T} ${m.src.unit}` : String(T));
    const list = (ids) => I.list(lang(), ids);
    const sr = (text) => h('span', { class: 'sr-only' }, [text]);

    function cmpCard(c, T) {
      const cols = ['T', 'paths', 'set', 'step', 'rule', 'opt'].concat(c.hasCosts ? ['ind', 'pb', 'total'] : []);
      const best = new Set(c.best);
      const head = h('tr', {}, cols.map((k) => h('th', { scope: 'col' }, [tc(`cmp.col.${k}`)])));
      const body = c.rows.map((r) => {
        const radio = h('input', { type: 'radio', name: 'ctKd', id: `ctKd-${r.T}`, value: String(r.T), checked: r.T === T, 'aria-label': tc('cmp.pick', { T: tT(r.T) }),
          onchange: () => { go({ kd: r.T }); focus(`ctKd-${r.T}`); } });
        const set = r.set.length ? [h('strong', { class: 'ct-set' }, [list(r.set)])].concat(r.unique === false ? [' ', h('span', { class: 'muted' }, [tc('cmp.other', { list: list(r.other) })])] : []) : ['—'];
        const rule = [num(r.rule)].concat(r.above ? [' ', h('span', { class: 'ct-above' }, [h('span', { 'aria-hidden': 'true' }, [`▲ +${num(r.rule - r.opt)}`]),
          sr(tc('cmp.above', { d: num(r.rule - r.opt) }))])] : []);
        const cells = [
          h('th', { scope: 'row' }, [h('label', { class: 'ct-pick' }, [radio, h('strong', {}, [String(r.T)])])]),
          h('td', { class: 'ct-mono' }, [r.paths.map((x) => x.join('–')).join(', ')]),
          h('td', {}, set),
          h('td', { class: 'num' }, [r.stepCost == null ? '—' : num(r.stepCost)]),
          h('td', { class: 'num' }, rule),
          h('td', { class: 'num' }, [num(r.opt)]),
        ];
        if (c.hasCosts) {
          const t = r.tot;
          cells.push(h('td', { class: 'num' }, [num(t.ind)]),
            h('td', { class: 'num' }, [t.pen ? `+${num(t.pen)}` : t.bonus ? `−${num(t.bonus)}` : '—']),
            h('td', { class: 'num' }, [h('strong', { class: best.has(r.T) ? 'ct-best' : null }, [num(t.total)].concat(best.has(r.T) ? [h('span', { 'aria-hidden': 'true' }, [' ●']), sr(` (${tc('cmp.best')})`)] : []))]));
        }
        return h('tr', { class: [r.T === T ? 'chosen' : '', r.above ? 'above' : ''].join(' ').trim() || null, 'data-t': String(r.T) }, cells);
      });
      const v = c.hasCosts ? c.rows.find((r) => r.T === c.best[0]).tot.total : null;
      const notes = [h('p', { class: c.hasCosts ? 'ct-note ct-note-ok' : 'ct-note', id: 'ctBest' }, [c.hasCosts
        ? (c.best.length === 1 ? tc('cmp.bestOne', { T: tT(c.best[0]), v: num(v) }) : tc('cmp.bestMany', { list: list(c.best.map(String)) + (m.src.unit ? ` ${m.src.unit}` : ''), v: num(v) }))
        : tc('cmp.noCosts', { T: tT(c.normalT) }), ' ', tc('cmp.pickHint')])];
      notes.push(h('p', { class: 'muted small', id: 'ctEnd' }, [tc('cmp.end', { T: tT(c.minT), path: c.end.path.join('–') })]));
      const f = c.first;
      if (f && f.move) {
        notes.push(h('div', { class: 'ct-note ct-note-warn', id: 'ctFail' }, [
          h('p', {}, [h('strong', {}, [tc('cmp.failTitle', { T: tT(f.T) })])]),
          h('p', {}, [tc('cmp.fail', { rule: num(f.rule), opt: num(f.opt), from: tT(f.from), step: num(f.stepCost),
            set: list(f.set) + (f.unique === false ? ` ${tc('cmp.other', { list: list(f.other) })}` : ''),
            shorten: list(f.move.shorten), lengthen: list(f.move.lengthen), terms: moveTerms(m, f.move, lang()), cost: num(f.move.cost) })]),
          h('p', {}, [tc('cmp.failWhy')]),
        ]));
      }
      const r = c.rows.find((x) => x.T === T);
      if (r.above && (!f || r.T !== f.T)) notes.push(h('p', { class: 'ct-note ct-note-warn', id: 'ctFailLater' }, [tc('cmp.failLater', { T: tT(T), rule: num(r.rule), opt: num(r.opt) })]));
      return h('section', { class: 'card ct-card', 'aria-labelledby': 'ctCmpHead' }, [
        h('h2', { id: 'ctCmpHead' }, [tc('cmp.title')]),
        h('div', { class: 'ct-scroll', tabindex: '0', role: 'region', 'aria-label': tc('cmp.label', { name: m.src.title }) }, [
          h('table', { class: 'data ct-cmp', id: 'ctCmp' }, [h('thead', {}, [head]), h('tbody', {}, body)])]),
      ].concat(notes));
    }

    function curveCard(c, T) {
      const holder = h('div', { class: 'ct-curve', id: 'ctCurve' });
      const vw = root.innerWidth || 1280;
      const spec = curveSpec(m, c, T, lang(), vw < 1100 ? vw - 64 : 500);
      spec.onPick = (t) => { go({ kd: t }); focus(`ctKd-${t}`); };
      root.PNL.ctChart.render(holder, spec);
      const sw = (cls, text) => h('span', {}, [h('span', { class: `ct-sw ${cls}`, 'aria-hidden': 'true' }), text]);
      const legend = h('p', { class: 'ct-legend', id: 'ctCurveLegend' }, spec.series.map((x) => sw(x.cls, tc(`curve.${x.key}`)))
        .concat([sw('ct-sw-best', tc(c.hasCosts ? 'curve.best' : 'curve.bestDirect'))]));
      return h('section', { class: 'card ct-card', 'aria-labelledby': 'ctCurveHead' }, [h('h2', { id: 'ctCurveHead' }, [tc('curve.title')]), holder, legend]);
    }

    // Las redes y el Gantt a la duración elegida, con las duraciones de la regla en esa fila o, con el conmutador, las
    // del óptimo (P8).
    function netsBlock(c, T) {
      const r = c.rows.find((x) => x.T === T);
      const useOpt = optView && r.above;
      return netsFor({ T, d: useOpt ? r.optD : r.d, set: useOpt ? [] : r.set, useOpt, toggle: r.above });
    }
    function netsFor({ T, d, set, useOpt, toggle }) {
      const s = state();
      const proj = { activities: m.p.activities.map((a) => ({ id: a.id, name: a.name, d: d[a.id] })), preds: m.p.preds, succs: m.p.succs };
      const sol = K.schedule(m.p, d).solution;
      const head = (k) => (useOpt ? tc('net.ofOpt', { head: tc(`net.${k}`, { T: tT(T) }) }) : tc(`net.${k}`, { T: tT(T) }));
      const tagsOf = netTags(m.p, d, set);
      const tagTitle = { short: tc('net.short'), min: tc('net.min') };
      const tagText = { short: tc('net.shortTag'), min: tc('net.minTag') };
      const out = [];
      if (toggle) {
        const pick = (on, id, key) => h('button', { type: 'button', class: 'ghost', id, 'aria-pressed': String(optView === on),
          onclick: () => { optView = on; keepFocus(draw); } }, [tc(`net.${key}`)]);
        out.push(h('div', { class: 'seg ct-durs', role: 'group', 'aria-label': tc('net.durs') }, [h('span', { class: 'ct-seg-label', 'aria-hidden': 'true' }, [tc('net.durs')]),
          pick(false, 'ctDurRule', 'fromRule'), pick(true, 'ctDurOpt', 'fromOpt')]));
      }
      const cards = [];
      if (s.kn !== 'pert') {
        const revealed = new Map();
        for (const a of m.p.activities) {
          for (const f of ['ES', 'EF', 'LS', 'LF']) revealed.set(`${a.id}.${f}`, sol.times[a.id][f]);
          for (const f of ['TF', 'FF']) revealed.set(`${a.id}.${f}`, sol.floats[a.id][f]);
        }
        const holder = h('div', { class: 'ct-net', id: 'ctRoy', tabindex: '0' });
        const tags = new Map([...tagsOf].map(([id, ks]) => [id, ks.map((k) => ({ text: tagText[k], cls: `ntag-${k}`, title: tagTitle[k] }))]));
        root.PNL.royView.render(holder, { project: proj, solution: sol, lay: root.PNL.layout.layout(sol, proj), step: null, revealed, box: '7', lang: lang(), nota: s.nota,
          criticalOn: true, numFmt: num, name: m.src.title, fit: true, minWidth: 560, tags });
        const N = I.notation(s.nota);
        cards.push(h('section', { class: 'card ct-card', 'aria-labelledby': 'ctRoyHead' }, [h('h2', { id: 'ctRoyHead' }, [head('roy')]), holder,
          h('p', { class: 'ct-swipe muted small', 'aria-hidden': 'true' }, [tc('net.swipe')]),
          h('p', { class: 'ct-legend', id: 'ctRoyLegend' }, [h('span', {}, [tc('net.box', N)]), h('span', { class: 'ct-l-crit' }, [tc('net.crit')]),
            h('span', { class: 'ct-l-short' }, [tc('net.short')]), h('span', { class: 'ct-l-min' }, [tc('net.min')])])]));
      }
      if (s.kn !== 'roy') {
        const net = root.PNL.aoa.build(proj, { solution: sol });
        const tm = root.PNL.aoa.times(net, sol);
        const revealed = new Map();
        for (const ev of net.events) { revealed.set(`${ev.n}.TE`, tm.TE[ev.n]); revealed.set(`${ev.n}.TL`, tm.TL[ev.n]); }
        const holder = h('div', { class: 'ct-net', id: 'ctPert', tabindex: '0' });
        const arcText = (label, dummy) => {
          if (dummy || d[label] == null) return null;
          const ks = tagsOf.get(label) || [];
          return [`${label} = ${num(d[label])}`].concat(ks.map((k) => tagText[k])).join(' ');
        };
        root.PNL.pertView.render(holder, { net, lay: root.PNL.aoaLayout.layout(net), revealed, step: null, solution: sol, lang: lang(), nota: s.nota, criticalOn: true,
          numFmt: num, name: m.src.title, numbered: true, fit: true, minWidth: 560, idPrefix: 'ct-pk', declutter: true, durations: d, arcText });
        cards.push(h('section', { class: 'card ct-card', 'aria-labelledby': 'ctPertHead' }, [h('h2', { id: 'ctPertHead' }, [head('pert')]), holder,
          h('p', { class: 'ct-swipe muted small', 'aria-hidden': 'true' }, [tc('net.swipe')]),
          h('p', { class: 'ct-legend', id: 'ctPertLegend' }, [tc('net.pertLegend')])]));
      }
      out.push(h('div', { class: `ct-nets${cards.length === 2 ? ' two' : ''}` }, cards));
      if (s.kg === 1) {
        const holder = h('div', { class: 'ct-gantt', id: 'ctGantt' });
        root.PNL.gantt.render(holder, { solution: sol, lang: lang(), late: false });
        out.push(h('section', { class: 'card ct-card', 'aria-labelledby': 'ctGanttHead' }, [h('h2', { id: 'ctGanttHead' }, [head('gantt')]), holder]));
      }
      return out;
    }

    // ---------- El paso a paso (T012; tablero 124) ----------
    const walking = () => !!m.trace && state().step > 0;
    let lastWalk = '';
    const tw = (k, q) => tc(`walk.${k}`, q);
    const pathList = (paths) => list(paths.map((x) => x.join('–')));
    function walkCard() {
      const tr = m.trace; const k = Math.min(state().step, tr.length - 1); const step = tr[k];
      const hide = hooks.predicting(step);
      const parts = [];
      let title; let text = [];
      if (step.kind === 'ctStep') {
        title = hide ? tw('askTitle', { from: tT(step.from), T: tT(step.T) }) : tw('stepTitle', { from: tT(step.from), T: tT(step.T), set: list(step.set) });
        text.push(tw(step.paths.length === 1 ? 'pathsOne' : 'paths', { from: tT(step.from), n: step.paths.length, list: pathList(step.paths) }));
        if (hide) text.push(tw('ask'));
        else {
          text.push(tw('did', { set: list(step.set), cost: num(step.stepCost), T: tT(step.T), direct: num(step.cost) }));
          if (step.unique === false) text.push(tw('tie', { list: list(step.other) }));
          if (step.reached.length) text.push(tw(step.reached.length === 1 ? 'reachedOne' : 'reached', { list: list(step.reached) }));
          if (step.newCrit.length) text.push(tw(step.newCrit.length === 1 ? 'newCritOne' : 'newCrit', { list: pathList(step.newCrit) }));
        }
      } else if (step.kind === 'ctEnd') {
        title = tw('endTitle', { T: tT(step.T) });
        text = [tw('endText', { path: step.path.join('–'), cost: num(step.cost) })];
      } else {
        title = tw('totalsTitle');
        const c = compression(m);
        const v = c.rows.find((r) => r.T === c.best[0]).tot.total;
        text = [c.best.length === 1 ? tc('cmp.bestOne', { T: tT(c.best[0]), v: num(v) }) : tc('cmp.bestMany', { list: list(c.best.map(String)) + (m.src.unit ? ` ${m.src.unit}` : ''), v: num(v) }),
          tw('totalsText')];
      }
      parts.push(h('h2', { id: 'ctStepHead' }, [title]), h('p', { id: 'ctStepText' }, [text.join(' ')]));
      if (step.kind === 'ctStep') {
        if (!hide && step.move) {
          const f = step;
          parts.push(h('div', { class: 'ct-note ct-note-warn', id: 'ctStepFail' }, [
            h('p', {}, [h('strong', {}, [tc('cmp.failTitle', { T: tT(f.T) })])]),
            h('p', {}, [tc('cmp.fail', { rule: num(f.cost), opt: num(f.opt), from: tT(f.from), step: num(f.stepCost),
              set: list(f.set) + (f.unique === false ? ` ${tc('cmp.other', { list: list(f.other) })}` : ''),
              shorten: list(f.move.shorten), lengthen: list(f.move.lengthen), terms: moveTerms(m, f.move, lang()), cost: num(f.move.cost) })]),
            h('p', {}, [tc('cmp.failWhy')])]));
        } else if (!hide && step.above) parts.push(h('p', { class: 'ct-note ct-note-warn', id: 'ctStepAbove' }, [tw('above', { rule: num(step.cost), T: tT(step.T), opt: num(step.opt) })]));
        parts.push(candTable(step, hide), predictBox(step, hide));
      }
      parts.push(walkNav(tr, k, hide, step, title, text.join(' ')));
      return { card: h('section', { class: 'card ct-card ct-step', id: 'ctStepCard', 'aria-labelledby': 'ctStepHead' }, parts), step, hide };
    }
    // Las actividades del paso: pendiente (o «mín.» si ya está en su urgente) y los caminos críticos en que están; con
    // predicción, una casilla en cada una (también en las no críticas: el error es parte de la lección).
    function candTable(step, hide) {
      const pred = hooks.pred();
      const chosen = pred.answers.get('ct.set') || new Set();
      const ask = hide;
      const crit = new Set(step.critical);
      const cols = ['pick', 'act', 'slope', 'paths'];
      const body = m.p.activities.map((a) => {
        const on = step.paths.filter((x) => x.includes(a.id));
        const atLimit = a.dn > a.dc && step.dBefore[a.id] <= a.dc;
        const pickCell = ask
          ? h('td', {}, [h('input', { type: 'checkbox', id: `ctPick-${a.id}`, checked: chosen.has(a.id), 'aria-label': tw('pickLabel', { id: a.id }),
            onchange: (e) => { const set = new Set(pred.answers.get('ct.set') || []); if (e.target.checked) set.add(a.id); else set.delete(a.id); pred.answers.set('ct.set', set); } })])
          : h('td', {}, [!hide && step.set.includes(a.id) ? h('strong', { class: 'ct-set' }, [tw('shortCell')]) : '']);
        return h('tr', { class: [crit.has(a.id) ? 'crit' : '', !hide && step.set.includes(a.id) ? 'chosen' : ''].join(' ').trim() || null, 'data-act': a.id }, [
          pickCell, h('th', { scope: 'row' }, [a.id]),
          h('td', { class: 'num' }, [a.dn > a.dc ? (atLimit ? h('span', { class: 'ct-l-min', title: tc('net.min') }, [tw('atLimitCell')]) : num(a.b)) : '—']),
          h('td', { class: crit.has(a.id) ? 'ct-mono' : 'muted' }, [crit.has(a.id) ? pathList(on) : tw('notCritCell')]),
        ]);
      });
      return h('div', { class: 'ct-scroll', tabindex: '0', role: 'region', 'aria-label': tw('tableLabel', { from: tT(step.from) }) }, [
        h('table', { class: 'data ct-cand', id: 'ctCand' }, [h('thead', {}, [h('tr', {}, cols.map((x) => h('th', { scope: 'col' }, [tw(`col.${x}`)])))]), h('tbody', {}, body)])]);
    }
    function predictBox(step, hide) {
      if (!state().pred) return null;
      const pred = hooks.pred();
      if (hide) {
        const msg = h('p', { class: 'ct-m ct-m-err', id: 'ctPredEmpty', hidden: true }, [tw('empty')]);
        const check = () => {
          const set = pred.answers.get('ct.set');
          if (!set || !set.size) { msg.hidden = false; focus(`ctPick-${m.p.activities[0].id}`); return; }
          hooks.predCheck(step);
          focus('ctPredFb');
        };
        return h('div', { class: 'ct-predict' }, [h('div', { class: 'ct-row' }, [
          h('label', { class: 'ct-field', for: 'ctPredCost' }, [tw('cost')]),
          h('input', { id: 'ctPredCost', value: pred.answers.get('ct.cost') || '', size: '7', inputmode: 'decimal', autocomplete: 'off', 'aria-describedby': 'ctPredEmpty',
            oninput: (e) => { pred.answers.set('ct.cost', e.target.value); }, onkeydown: (e) => { if (e.key === 'Enter') { e.preventDefault(); check(); } } }),
          h('button', { type: 'button', class: 'primary', id: 'ctPredCheck', onclick: check }, [I.t(lang(), 'predict.check')]),
          button(I.t(lang(), 'predict.show'), () => { hooks.predShow(); focus('ctNext'); }, { id: 'ctPredShow' }),
        ]), msg]);
      }
      if (!(pred.done && pred.step === state().step && pred.result)) return null;
      const fb = feedback(m, step, pred.answers, lang());
      return h('div', { class: 'ct-fb', id: 'ctPredFb', tabindex: '-1', role: 'status' }, fb.map((x) => h('p', { class: `ct-fb-${x.kind}` }, [
        h('span', { 'aria-hidden': 'true' }, [x.kind === 'ok' ? '✓ ' : '✕ ']), x.text])));
    }
    function walkNav(tr, k, hide, step, title, text) {
      const n = tr.length - 1;
      const wkey = `${m.src.id}|${lang()}|${k}|${n}|${hide}`;
      if (wkey !== lastWalk) { lastWalk = wkey; if (hooks.announce) hooks.announce(`${I.t(lang(), 'player.counter', { i: k, n })}. ${title}. ${hide ? I.t(lang(), 'predict.hidden') : text}`); }
      const c = I.t(lang(), 'player.counter', { i: k, n });
      return h('div', { class: 'ct-row ct-walknav' }, [
        h('button', { type: 'button', class: 'ghost', id: 'ctPrev', disabled: k <= 1, onclick: () => { hooks.dispatch({ type: 'prev' }); focus('ctPrev'); } }, [`← ${I.t(lang(), 'player.prev')}`]),
        h('button', { type: 'button', class: 'ghost', id: 'ctNext', disabled: k >= n || hide, onclick: () => {
          hooks.dispatch({ type: 'next' });
          const st = m.trace[Math.min(state().step, n)];
          focus(hooks.predicting(st) ? `ctPick-${m.p.activities[0].id}` : 'ctNext');
        } }, [`${I.t(lang(), 'player.next')} →`]),
        h('span', { class: 'muted small', id: 'ctCounter' }, [`${step.kind === 'ctStep' ? tw('counter', { c, from: tT(step.from), T: tT(step.T) }) : c} · ${tw('keys')}`]),
        hide ? h('span', { class: 'muted small' }, [I.t(lang(), 'predict.hidden')]) : null]);
    }

    function shortcutBlock() {
      const ts = (k, q) => tc(`short.${k}`, q);
      const sc = shortcut(m);
      const rows = shortcutRows(m, sc);
      const head = h('tr', {}, ['act', 'dc', 'slope', 'ext', 'final'].map((k) => h('th', { scope: 'col' }, [ts(`col.${k}`)])));
      const body = rows.map((r) => h('tr', { 'data-act': r.id, class: r.ext ? 'chosen' : null }, [h('th', { scope: 'row' }, [r.id]), h('td', { class: 'num' }, [num(r.dc)]),
        h('td', { class: 'num' }, [r.can ? num(r.b) : '—']), h('td', { class: 'num' }, [r.ext ? h('strong', { class: 'ct-set' }, [`+${r.ext}`]) : '—']),
        h('td', { class: 'num' }, [h('strong', {}, [num(r.final)])])]));
      const parts = [h('h2', { id: 'ctShortHead' }, [ts('title')]),
        h('p', { id: 'ctShortIntro' }, [ts('intro', { T: tT(sc.T), cost: num(sc.crashCost) })]),
        h('div', { class: 'ct-scroll', tabindex: '0', role: 'region', 'aria-label': ts('tableLabel', { name: m.src.title }) }, [
          h('table', { class: 'data ct-cand', id: 'ctShortTable' }, [h('thead', {}, [head]), h('tbody', {}, body)])]),
        h('h3', { class: 'ct-h3' }, [ts('stepsTitle')]),
        sc.steps.length ? h('ol', { class: 'ct-steps', id: 'ctShortSteps' }, sc.steps.map((x) => h('li', {}, [ts('step', { id: x.id, v: num(x.saving) })])))
          : h('p', { id: 'ctShortSteps' }, [ts('none')])];
      if (sc.above) {
        parts.push(h('div', { class: 'ct-note ct-note-warn', id: 'ctShortEnd' }, [h('p', {}, [h('strong', {}, [ts('above', { cost: num(sc.cost), T: tT(sc.T), opt: num(sc.opt), diff: num(sc.cost - sc.opt) })])]),
          h('p', {}, [ts('aboveWhy', { list: list(m.p.activities.map((a) => `${a.id} ${num(sc.optD[a.id])}`)) })])]));
      } else parts.push(h('p', { class: 'ct-note ct-note-ok', id: 'ctShortEnd' }, [ts('ok', { cost: num(sc.cost), T: tT(sc.T), opt: num(sc.opt) })]));
      parts.push(h('p', { class: 'muted small' }, [ts('note')]));
      const gantt = (id, key, d, cost) => {
        const holder = h('div', { class: 'ct-gantt', id });
        root.PNL.gantt.render(holder, { solution: K.schedule(m.p, d).solution, lang: lang(), late: false });
        return h('section', { class: 'card ct-card', 'aria-labelledby': `${id}Head` }, [h('h2', { id: `${id}Head` }, [ts(key, { T: tT(sc.T), cost: num(cost) })]), holder]);
      };
      return h('div', { class: 'ct-short' }, [h('section', { class: 'card ct-card ct-step', id: 'ctShort', 'aria-labelledby': 'ctShortHead' }, parts),
        h('div', { class: 'ct-short-gantts' }, [gantt('ctShortG0', 'ganttCrash', K.crashD(m.p), sc.crashCost), gantt('ctShortG1', 'ganttEnd', sc.d, sc.cost)])]);
    }

    function fillLower() {
      clear(lower);
      if (!m.p) return;
      if (state().ka === 1) { lower.appendChild(shortcutBlock()); return; }
      const c = compression(m);
      const T = chosenT(state(), c);
      const key = `${m.src.id}|${T}`;
      if (key !== optKey) { optView = false; optKey = key; }
      lower.appendChild(h('div', { class: 'ct-mid' }, [cmpCard(c, T), curveCard(c, T)]));
      for (const el of netsBlock(c, T)) lower.appendChild(el);
    }

    function draw() {
      clear(container);
      ownTable = null; issuesSlot = null; lower = null;
      container.appendChild(bar());
      if (walking()) {
        const w = walkCard();
        container.appendChild(w.card);
        for (const el of netsFor(walkNets(m, w.step, w.hide))) container.appendChild(el);
        return;
      }
      container.appendChild(h('div', { class: 'ct-top' }, [m.src.kind === 'own' ? ownCard() : exampleCard(), costsCard()]));
      lower = h('div', { class: 'ct-lower', id: 'ctLower' });
      container.appendChild(lower);
      fillLower();
    }
    function render(model, opts) {
      // Al teclear en la tabla propia no se rehace la tabla: se marcan las filas.
      const typing = opts && opts.fromEditor && m && m.src.kind === 'own' && model.src.kind === 'own' && ownTable && ownTable.isConnected && lower
        && model.src.rows.length === m.src.rows.length;
      m = model;
      if (typing) {
        const cut = root.document.getElementById('ctPasteCut');
        if (cut) cut.remove();
        markOwn(); fillLower(); return;
      }
      keepFocus(draw);
    }
    function debug() {
      if (!m) return null;
      const c = m.p ? compression(m) : null;
      return { src: { kind: m.src.kind, id: m.src.id }, errors: m.report.errors.map((e) => e.code), warnings: m.report.warnings.map((e) => e.code).filter((c) => FIELD[c]),
        ok: !!m.p, k: m.k, T: c ? chosenT(state(), c) : null, rows: c ? c.rows.map((r) => r.T) : [], best: c ? c.best : [], opt: optView,
        short: !walking() && state().ka === 1,
        walk: walking() ? { k: state().step, kind: m.trace[Math.min(state().step, m.trace.length - 1)].kind, n: m.trace.length - 1 } : null };
    }
    function leave() { /* T010: nada que parar */ }
    return { render, debug, leave };
  }

  const api = { FIELDS, KC, source, costs, model, compression, chosenT, moveTerms, netTags, curveSpec, trace, walkNets, feedback, shortcut, shortcutRows, issueText, rowMarks, workRows, pasteRows, parseCost, create };
  root.PNL = root.PNL || {};
  root.PNL.ctTab = api;
  if (isNode) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
