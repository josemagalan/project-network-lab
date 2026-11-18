/*
 * ex-mc — «Montecarlo» en «Ejercicios» (spec f3e-probabilidad-montecarlo, AC6–AC10, AC13, AC18 y AC19; plan §0, §4 y P1;
 * análisis H2, H3 y H9; tableros 96–98 y 104). ex.js le cede el cuerpo de la vista con xk=mc; la barra (con «Variante»,
 * mv) sigue siendo la de ex.js. Tres variantes: «Leer una simulación» (aquí) y «Discretas a mano» y «Réplicas a mano»
 * (ex-mc-hand.js, grupo mxh). La vista de «Leer» y sus imágenes (ex-mc-read.js y views/chart-svg) van en el grupo mxr.
 *
 * El ejercicio sale de core/probgen (read, disc o rep) con la semilla y el nivel (o «Personalizar»); si la tabla de la
 * semilla no sirve, la de la siguiente que sirve, y se dice (H9). En el navegador la búsqueda va a trozos, con aviso: en
 * «Leer» cada intento simula 10 000 réplicas como M7 (H2). Lo escrito vive en la clave pa del enlace (texto tal cual; una
 * opción de «Leer», su posición; las críticas de una réplica, lista de ids). core/probgrade corrige casilla a casilla, con
 * error consecuente en las discretas y las réplicas. Practicar y Examen como en TCL (ex-prob). La solución se abre en M7
 * con la misma tabla: «Leer» con su semilla y 10 000 réplicas; las discretas con sus valores; las réplicas, réplica a
 * réplica con su semilla.
 *
 * La parte sin DOM (exercise, answers, setField, setMark, grade, label, explain, levelText, movedText, m7Hash, charts,
 * question…) se prueba en Node (tests/ex-mc.test.js); create() pinta la vista. Para las pruebas de navegador,
 * PNL.exMc.state() da el ejercicio, lo escrito y la corrección.
 */
(function (root) {
  'use strict';

  const isNode = typeof module !== 'undefined' && module.exports;
  const req = (path, name) => (isNode ? require(path) : root.PNL[name]);
  const I = req('./i18n.js', 'i18n');
  if (isNode) require('./i18n-mc.js');
  const GEN = req('./core/generator.js', 'generator');
  const PG = req('./core/probgen.js', 'probgen');
  const PR = req('./core/probgrade.js', 'probgrade');
  const U = req('./core/urlstate.js', 'urlstate');
  const CS = () => req('./views/chart-svg.js', 'chartSvg');
  const HAND = () => req('./ex-mc-hand.js', 'exMcHand');

  const VARIANTS = ['read', 'disc', 'rep'];
  const tt = (lang, k, p) => I.t(lang, k, p);
  const num = (lang, x, k) => Number(x).toLocaleString(lang === 'es' ? 'es-ES' : 'en-GB', { maximumFractionDigits: k == null ? 2 : k, useGrouping: false });
  const fix = (lang, x, k) => { const s = (Math.abs(x) < 1e-12 ? 0 : x).toFixed(k); return lang === 'es' ? s.replace('.', ',') : s; };
  const weeks = (lang, n) => tt(lang, 'mx.weeks', { n: num(lang, n) });
  /** Una probabilidad como fracción (denominador ≤ 1000) o con cuatro decimales. */
  function frac(lang, p) {
    for (let d = 1; d <= 1000; d++) {
      const n = Math.round(p * d);
      if (Math.abs(n / d - p) < 1e-9) return d === 1 ? String(n) : `${n}/${d}`;
    }
    return num(lang, p, 4);
  }
  /** Lo que escribió el alumno, para las explicaciones: una fracción tal cual; un número, con su separador. */
  function said(lang, text, value) {
    const s = String(text == null ? '' : text).trim();
    return s.includes('/') || typeof value !== 'number' || Number.isNaN(value) ? s : num(lang, value, 4);
  }

  // ---------- El ejercicio ----------

  const variant = (state) => (VARIANTS.includes(state.mv) ? state.mv : 'read');
  function levelArg(state) {
    if (state.lv === 'custom') return Object.assign({}, state.gp || GEN.LEVELS.medium);
    return GEN.LEVELS[state.lv] ? state.lv : 'medium';
  }
  const exKey = (state) => JSON.stringify([PG.VERSION, variant(state), state.sd, levelArg(state)]);
  /** La búsqueda de la tabla (probgen.start), para hacerla a trozos. */
  const job = (state) => PG.start(variant(state), state.sd, levelArg(state));
  const found = new Map();
  const sols = new WeakMap();
  function remember(key, r) {
    if (found.size > 12) found.clear();
    found.set(key, r);
    if (r.ok && r.sol) sols.set(r.ex, r.sol);
    return r;
  }
  /** El ejercicio de una semilla, de una vez: { ok, ex, info (, sol en «Leer») } o { ok: false, reason }. */
  function exercise(state) {
    const key = exKey(state);
    if (!found.has(key)) { const j = job(state); PG.step(j, {}); remember(key, PG.result(j)); }
    return found.get(key);
  }
  function solution(ex) {
    if (!sols.has(ex)) sols.set(ex, PG.solve(ex.kind, ex));
    return sols.get(ex);
  }

  // ---------- Lo escrito (pa): siempre texto, sin interpretar ----------

  function answers(state) {
    const a = Object.assign({}, state.pa || {});
    for (const k of Object.keys(a)) if (Array.isArray(a[k])) a[k] = a[k].slice();
    return a;
  }
  const done = (a) => (Object.keys(a).length ? a : null);
  function setField(pa, key, text) {
    const out = Object.assign({}, pa || {});
    const v = String(text == null ? '' : text).slice(0, U.PA.value);
    if (v) out[key] = v; else delete out[key];
    return done(out);
  }
  /** Marca o desmarca una actividad como crítica en una réplica (rK.crit), en el orden de las filas. */
  function setMark(pa, ex, key, id, on) {
    const out = Object.assign({}, pa || {});
    const marked = new Set(out[key] || []);
    if (on) marked.add(id); else marked.delete(id);
    const list = ex.rows.map((r) => r.id).filter((x) => marked.has(x));
    if (list.length) out[key] = list; else delete out[key];
    return done(out);
  }

  const grade = (ex, pa) => PR.grade(ex.kind, ex, pa || {}, solution(ex));
  function counts(g) {
    const c = { ok: 0, carried: 0, wrong: 0, blank: 0, invalid: 0 };
    for (const k of Object.keys(g.cells)) c[g.cells[k].status]++;
    return c;
  }
  const scoreText = (g, lang) => tt(lang, 'ex.score', { pct: num(lang, g.score.pct, 1), got: g.score.got, total: g.score.total });
  function countText(g, lang) {
    const c = counts(g);
    return ['wrong', 'carried', 'blank', 'invalid'].filter((k) => c[k]).map((k) => (c[k] === 1 ? tt(lang, `ex.cnt.${k}One`) : tt(lang, `ex.cnt.${k}`, { n: c[k] }))).join(' · ');
  }

  // ---------- Textos ----------

  function label(ex, key, lang) {
    if (ex.kind !== 'read') return HAND().label(ex, key, lang);
    if (key === 'pct') return tt(lang, 'mx.lab.pct', { p: Math.round(ex.ask.pct * 100) });
    if (key === 'pT') return tt(lang, 'mx.lab.pT', { T: num(lang, ex.ask.deadline) });
    if (key === 'crit') return tt(lang, 'mx.lab.crit', { a: ex.ask.act });
    return tt(lang, `mx.lab.q.${key.slice(2)}`);
  }

  /** «a o b» o «de a a b» con los valores distintos de una lista. */
  function spread(lang, xs) {
    const v = [...new Set(xs)].sort((a, b) => a - b);
    if (v.length === 1) return String(v[0]);
    if (v.length === 2) return tt(lang, 'mx.or', { a: v[0], b: v[1] });
    return tt(lang, 'mx.range', { a: v[0], b: v[v.length - 1] });
  }
  /** La descripción del nivel de cada variante (tableros 96–98); con «Personalizar», la del medio (como probgen). */
  function levelText(prm, level, mv, lang) {
    const base = PG.REPS[level] ? level : 'medium';
    const v = VARIANTS.includes(mv) ? mv : 'read';
    if (v === 'rep') return tt(lang, 'mx.sum.rep', { n: PG.REPS[base] });
    if (v === 'disc') {
      const pats = PG.DISC[base];
      return tt(lang, 'mx.sum.disc', { k: spread(lang, pats.map((p) => p.length)), c: spread(lang, pats.map((p) => p.reduce((a, b) => a * b, 1))) });
    }
    return tt(lang, 'mx.sum.read');
  }

  /** Si se usa la tabla de otra semilla (H9): cuál; '' si es la pedida. */
  const movedText = (r, lang) => (r && r.ok && r.info.sdUsed !== r.ex.sd ? tt(lang, 'mx.moved', { sd: r.ex.sd, used: r.info.sdUsed }) : '');

  /** La tabla propia de M7 de unas discretas: las fijas con a = m = b; las discretas, con sus valores y probabilidades (uf, uq). */
  function discUt(ex) {
    return { mode: 'pred', rows: ex.rows.map((r) => {
      const x = r.x || [r.d];
      return { id: r.id, name: '', a: String(x[0]), m: String(x[x.length === 3 ? 1 : 0]), b: String(x[x.length - 1]), links: r.preds.join(', ') };
    }) };
  }
  /** «Ver la solución en M7»: el mismo proyecto como tabla propia (H2). */
  function m7Hash(ex, state) {
    const s = Object.assign(U.defaults(), { v: 'unc', um: 'm7', ue: 'own', lang: state.lang, nota: state.nota });
    if (ex.kind === 'read') Object.assign(s, { ut: PG.toUt(ex.tcl), us: ex.sim.us, ur: ex.sim.ur, ud: ex.ask.deadline, uv: Math.round(ex.ask.pct * 100) });
    else if (ex.kind === 'rep') Object.assign(s, { ut: PG.toUt(ex), us: ex.us, ud: ex.deadline, uy: 'rep' });
    else {
      const disc = ex.rows.filter((r) => r.x);
      Object.assign(s, { ut: discUt(ex), ud: ex.deadline, uf: Object.fromEntries(disc.map((r) => [r.id, 'disc'])),
        uq: Object.fromEntries(disc.map((r) => [r.id, { x: r.x.map(String), p: r.p.map((p) => frac('en', p)) }])) });
    }
    return U.encode(s);
  }

  // ---------- «Leer una simulación»: gráficos y preguntas ----------

  /** Las dos imágenes de chart-svg y su alternativa en texto (P4), en el idioma pedido. */
  function charts(ex, lang) {
    const sol = solution(ex);
    const C = CS();
    const dec = lang === 'es' ? ',' : '.';
    const c = (k, p) => tt(lang, `mx.chart.${k}`, p);
    const dist = { title: c('dist'), desc: c('distDesc') };
    dist.svg = C.dist({ durations: sol.sorted, deadline: ex.ask.deadline, title: dist.title, desc: dist.desc, dec,
      labels: { deadline: c('deadline', { d: num(lang, ex.ask.deadline) }), x: c('x'), hist: c('hist'), cdf: c('cdf') } });
    const rows = ex.tcl.rows.map((r) => ({ id: r.id, crit: sol.crit[r.id], cruc: sol.cruc[r.id] }));
    const idx = { title: c('idx'), desc: c('idxDesc') };
    idx.svg = C.indices({ rows, title: idx.title, desc: idx.desc, dec, labels: { crit: c('crit'), cruc: c('cruc') } });
    return { dist, idx, table: C.table(sol.sorted), itable: C.indexTable(rows) };
  }

  /** El texto de una pregunta de interpretación y el de sus opciones. */
  function question(ex, q, lang) {
    const text = tt(lang, `mx.q.${q.key}`, { T: weeks(lang, ex.ask.deadline) });
    const options = q.options.map((o) => (q.key === 'normal' ? tt(lang, `mx.q.${o}`) : q.key === 'promise' ? fix(lang, o, 1) : o));
    return { text, options };
  }

  // ---------- Explicaciones (AC10) ----------

  // Dónde empezó el error: se sigue from hasta una casilla incorrecta.
  function origin(g, key, seen) {
    const s = seen || new Set();
    if (s.has(key)) return null;
    s.add(key);
    const c = g.cells[key];
    if (!c) return null;
    if (c.status === 'wrong') return key;
    for (const u of c.from || []) { const o = origin(g, u, s); if (o) return o; }
    return null;
  }
  /** Lo común a todas: '' si está bien; vacía o ilegible; si no, null (la explica su variante). */
  function common(ans, g, key, lang) {
    const c = g.cells[key];
    if (!c || c.status === 'ok') return '';
    if (c.status === 'blank') return tt(lang, 'ex.explain.blank');
    if (c.status === 'invalid') return tt(lang, 'ex.explain.invalid', { v: Array.isArray(c.value) ? c.value.join(', ') : String(ans[key] == null ? '' : ans[key]).trim() });
    return null;
  }
  /** Una casilla que sale de otras, con los textos de la F3a: la cuenta (calc) con los datos del alumno y dónde empieza. */
  function generic(ex, ans, g, key, lang, calc, k) {
    const c = g.cells[key];
    const v = said(lang, ans[key], c.value);
    const e = c.expected == null ? '—' : fix(lang, c.expected, k == null ? 3 : k).replace(/([.,]\d*?)0+$/, '$1').replace(/[.,]$/, '');
    const lab = label(ex, key, lang);
    if (c.status === 'carried') {
      const o = origin(g, key);
      return tt(lang, 'ex.explain.carried', { v, e, lab, calc, origin: o && o !== key ? tt(lang, 'ex.explain.origin', { lab: label(ex, o, lang) }) : '' });
    }
    return tt(lang, 'ex.explain.wrong', { v, e, lab, calc });
  }

  function explain(ex, ans, g, key, lang) {
    const head = common(ans, g, key, lang);
    if (head !== null) return head;
    if (ex.kind !== 'read') return HAND().explain(ex, ans, g, key, lang, { said, generic, frac, num, fix, solution });
    const sol = solution(ex);
    const c = g.cells[key];
    const v = said(lang, ans[key], c.value);
    const f2 = (x) => fix(lang, x, 2);
    if (key === 'pct') return tt(lang, 'mx.explain.readPct', { v, q: f2(ex.ask.pct), r: f2(sol.pct.value), p: Math.round(ex.ask.pct * 100), w: f2(sol.classW) });
    if (key === 'pT') return tt(lang, 'mx.explain.readP', { v, r: f2(sol.pT) });
    if (key === 'crit') return tt(lang, 'mx.explain.readCrit', { v, a: ex.ask.act, r: f2(sol.act.crit) });
    const q = ex.questions.find((x) => `q.${x.key}` === key);
    const r = q.correct;
    const ids = ex.tcl.rows.map((x) => x.id);
    const second = (by) => ids.filter((id) => id !== r).sort((x, y) => by[y] - by[x] || x.localeCompare(y, 'en', { numeric: true }))[0];
    if (q.key === 'mostCrit' || q.key === 'mostCruc') {
      const by = q.key === 'mostCrit' ? sol.crit : sol.cruc;
      const n2 = second(by);
      return tt(lang, `mx.explain.${q.key}`, { r, c: f2(by[r]), n2, c2: f2(by[n2]) });
    }
    if (q.key === 'critLowCruc') return tt(lang, 'mx.explain.critLowCruc', { r, c: f2(sol.crit[r]), u: f2(sol.cruc[r]) });
    if (q.key === 'normal') return tt(lang, `mx.explain.${r}`, { o: tt(lang, `mx.q.${r}`), T: num(lang, ex.ask.deadline), pn: f2(sol.normal.pT), ps: f2(sol.pT) });
    return tt(lang, 'mx.explain.promise', { r: fix(lang, r, 1) });
  }

  // ---------- Vista ----------

  function create(hooks) {
    const G = root.PNL;
    const { h, clear } = G.dom;
    const AT = G.answerTable;
    const lang = () => hooks.lang();
    const t = (k, p) => I.t(lang(), k, p);
    let checked = null;        // Practicar: { key, g } de la última comprobación (solo en la página)
    let confirmOpen = false;   // Examen: confirmación de «Entregar»
    let selKey = null;         // casilla elegida (su explicación)
    let open = {};             // desplegables abiertos («Ver los gráficos como tabla», «Ver los datos»)
    let search = null;         // búsqueda a trozos en curso: { key, job, timer }
    let focusAfter = null;
    let last = null;           // { container }
    let view = null;           // lo último pintado (pruebas)

    function reset() {
      checked = null; confirmOpen = false; selKey = null; open = {};
      if (search) { root.clearTimeout(search.timer); search = null; }
    }
    const redraw = () => { if (last) draw(last.container); };
    function keepFocus() {
      const a = root.document.activeElement;
      const id = a && a.id ? a.id : null;
      const pos = a && typeof a.selectionStart === 'number' ? a.selectionStart : null;
      redraw();
      const el = id && root.document.getElementById(id);
      if (el) { el.focus({ preventScroll: true }); if (pos !== null && el.setSelectionRange) el.setSelectionRange(pos, pos); }
    }

    // La tabla de la semilla, siempre a trozos (en «Leer» cada intento simula 10 000 réplicas), con aviso.
    function lookup(s) {
      const key = exKey(s);
      if (found.has(key)) return found.get(key);
      if (search && search.key === key) return null;
      if (search) root.clearTimeout(search.timer);
      const j = job(s);
      search = { key, job: j, timer: null };
      const tick = () => {
        if (!search || search.job !== j) return;
        PG.step(j, { ms: 30 });
        if (!j.out) { search.timer = root.setTimeout(tick, 0); return; }
        remember(key, PG.result(j));
        search = null;
        keepFocus();
      };
      search.timer = root.setTimeout(tick, 0);
      return null;
    }

    function draw(container) {
      last = { container };
      const s = hooks.state();
      const lg = lang();
      const kind = variant(s);
      clear(container);
      const r = lookup(s);
      if (!r) { view = null; container.appendChild(h('p', { class: 'banner', role: 'status', id: 'mxSearching' }, [t(kind === 'read' ? 'mx.simulating' : 'mx.searching')])); return; }
      if (!r.ok) { view = null; container.appendChild(h('p', { class: 'banner', role: 'status', id: 'mxNotFound' }, [t('mx.notFound', { n: PG.TRIES_TCL })])); return; }
      const ex = r.ex;
      const ans = answers(s);
      const exam = s.xm === 'exam';
      const delivered = exam && !!s.xd;
      if (delivered) confirmOpen = false;
      const key = JSON.stringify(ans);
      const g = delivered ? grade(ex, ans) : checked && checked.key === key ? checked.g : null;
      const stale = !exam && !!checked && checked.key !== key;
      view = { r, ex, ans, g, stale };
      const st = (k) => (g && g.cells[k] ? g.cells[k].status : null);
      const explainBox = h('div', { class: 'ex-explain', id: 'mxExplain', 'aria-live': 'polite', hidden: true });

      const ctx = {
        h, t, lg, s, ex, ans, g, st, exam, delivered, locked: delivered, AT, open, sel: () => selKey, fix: (x, k) => fix(lg, x, k),
        sol: () => solution(ex),
        num: (x, k) => num(lg, x, k), frac: (p) => frac(lg, p), weeks: (n) => weeks(lg, n),
        label: (k) => label(ex, k, lg),
        moved: () => { const m = movedText(r, lg); return m ? h('p', { class: 'banner small', id: 'mxMoved', role: 'status' }, [m]) : null; },
        onFocus: (k) => { selKey = k; drawExplain(); },
        input: (k, value) => { hooks.dispatch({ type: 'pa', value: setField(answers(hooks.state()), k, value) }, { fromEx: true }); if (g) keepFocus(); },
        choose: (k, i, id) => { focusAfter = id; selKey = k; hooks.dispatch({ type: 'pa', value: setField(answers(hooks.state()), k, String(i)) }, { fromEx: true }); redraw(); },
        mark: (k, id, on, el) => { focusAfter = el; hooks.dispatch({ type: 'pa', value: setMark(answers(hooks.state()), ex, k, id, on) }, { fromEx: true }); redraw(); },
        cell: (k, o) => AT.cell(Object.assign({ key: k, value: ans[k], state: st(k), locked: delivered, selected: selKey === k, label: label(ex, k, lg), t,
          onInput: ctx.input, onFocus: ctx.onFocus, onEnter: (k2) => { const tb = container.querySelector(`[data-key="${k2}"]`); const tbl = tb && tb.closest('table'); const nx = tbl && AT.below(tbl, k2); if (nx) nx.focus(); } }, o || {})),
        field: (k, text, o) => h('label', { class: 'mx-f', for: AT.cellId(k) }, [text, ctx.cell(k, o)]),
        head: (title) => {
          const out = [h('h2', {}, [title])];
          if (g) out.push(h('p', { class: 'ex-score', role: 'status' }, [h('strong', { id: 'mxScore' }, [scoreText(g, lg)]), ' ', h('span', { class: 'muted small', id: 'mxCount' }, [countText(g, lg)])]));
          return h('div', { class: 'ex-head' }, out);
        },
        note: () => (exam ? h('p', { class: 'muted small ex-note', id: 'mxNote' }, [delivered ? t('ex.delivered') : t('ex.examNote')]) : null),
        side: () => {
          const out = [];
          // La leyenda, con los estados que hay (tableros 96–98): así cabe en 1280×720.
          if (g) { const c = counts(g); out.push(h('ul', { class: 'ex-legend', 'aria-label': t('ex.legend') }, ['ok', 'carried', 'wrong', 'blank', 'invalid'].filter((x) => c[x])
            .map((x) => h('li', { class: `ex-chip st-${x}` }, [AT.icon(x), t(`ex.st.${x}`)])))); }
          out.push(explainBox);
          if (stale) out.push(h('p', { class: 'banner small', role: 'status', id: 'mxStale' }, [t('ex.stale')]));
          if (confirmOpen && exam && !delivered) {
            const blanks = Object.values(grade(ex, ans).cells).filter((c) => c.status === 'blank').length;
            out.push(h('div', { class: 'ex-confirm', role: 'alertdialog', 'aria-labelledby': 'mxConfirmText' }, [h('p', { id: 'mxConfirmText' }, [t('ex.confirm', { n: blanks })]),
              h('div', { class: 'ex-btns' }, [h('button', { type: 'button', class: 'ghost primary', id: 'mxConfirmYes', onclick: deliver }, [t('ex.confirmYes')]),
                h('button', { type: 'button', class: 'ghost', id: 'mxConfirmNo', onclick: () => { confirmOpen = false; focusAfter = 'mxDeliver'; redraw(); } }, [t('ex.confirmNo')])])]));
          }
          if (!delivered && !g && !confirmOpen) out.push(h('p', { class: 'muted small' }, [t('ex.enterHint')]));
          return h('div', { class: 'ex-side mx-side' }, out);
        },
        actions: () => {
          const out = [];
          if (!exam) out.push(h('button', { type: 'button', class: 'ghost primary', id: 'mxCheck', onclick: check }, [t('ex.check')]));
          if (exam && !delivered) out.push(h('button', { type: 'button', class: 'ghost primary', id: 'mxDeliver', onclick: () => { confirmOpen = true; focusAfter = 'mxConfirmYes'; redraw(); } }, [t('ex.deliver')]));
          if (!exam || delivered) out.push(h('a', { class: `mx-link${delivered ? ' primary' : ''}`, id: 'mxSol', href: m7Hash(ex, s) }, [t('mx.sol')]));
          if (delivered) out.push(h('button', { type: 'button', class: 'ghost', id: 'mxAnother2', onclick: hooks.another }, [t('ex.another')]));
          return h('div', { class: 'ex-btns' }, out);
        },
        details: (id, summary, body) => {
          const d = h('details', { class: 'mx-details', id, open: open[id] ? 'open' : null, ontoggle: (e) => { open[id] = e.target.open; } }, [h('summary', {}, [summary])].concat(body));
          return d;
        },
      };

      container.appendChild(kind === 'read' ? G.exMcRead.draw(ctx) : HAND()[kind](ctx));
      function drawExplain() {
        clear(explainBox);
        const c = g && selKey ? g.cells[selKey] : null;
        const text = c ? explain(ex, ans, g, selKey, lg) : '';
        explainBox.hidden = !text;
        if (!text) return;
        explainBox.className = `ex-explain st-${c.status}`;
        explainBox.appendChild(h('strong', {}, [`${t(`ex.st.${c.status}`)} · ${label(ex, selKey, lg)}`]));
        explainBox.appendChild(h('p', {}, [text]));
      }
      drawExplain();
      const want = focusAfter;
      focusAfter = null;
      if (want) { const el = root.document.getElementById(want); if (el) el.focus(); }
    }

    function check() {
      if (!view) return;
      // Lo escrito ahora (escribir no repinta la vista: view.ans puede ser de antes; revisión de T011).
      const ans = answers(hooks.state());
      checked = { key: JSON.stringify(ans), g: grade(view.ex, ans) };
      focusAfter = 'mxCheck';
      redraw();
      hooks.announce(`${scoreText(checked.g, lang())}. ${countText(checked.g, lang())}`);
    }
    function deliver() {
      confirmOpen = false;
      focusAfter = 'mxSol';
      hooks.dispatch({ type: 'exDeliver' });
      if (view) { const g = grade(view.ex, answers(hooks.state())); hooks.announce(`${scoreText(g, lang())}. ${countText(g, lang())}`); }
    }

    function debug() {
      const s = hooks.state();
      if (!view) return { sd: s.sd, ex: null, searching: !!search };
      return { sd: s.sd, used: view.r.info.sdUsed, kind: view.ex.kind, ex: view.ex, ans: view.ans, grading: view.g, stale: view.stale, searching: !!search, open: Object.assign({}, open) };
    }

    return { draw, reset, debug };
  }

  const api = { VARIANTS, variant, levelArg, exKey, job, exercise, solution, answers, setField, setMark, grade, counts, scoreText, countText, label, levelText,
    movedText, discUt, m7Hash, charts, question, frac, explain, create };
  root.PNL = root.PNL || {};
  root.PNL.exMc = api;
  if (isNode) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
