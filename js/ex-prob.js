/*
 * ex-prob — «Probabilidad (TCL)» en «Ejercicios» (spec f3e-probabilidad-montecarlo, AC1–AC5, AC9–AC11, AC13, AC18,
 * AC20, AC24 y AC25; plan §0, §4 y P1; análisis H1 y H9; tableros 93–95 y 103). ex.js le cede el cuerpo de la vista con
 * xk=tcl; la barra (con «Qué se pide: La otra ruta», xo) sigue siendo la de ex.js.
 *
 * El ejercicio sale de core/probgen.tcl con la semilla, el nivel (o «Personalizar») y la otra ruta si se pide; si la
 * tabla de la semilla no sirve, la de la siguiente que sirve, y se dice (H9). En el navegador la búsqueda va a trozos,
 * con aviso, porque con la otra ruta puede tardar unos segundos (puerta T001). Lo escrito vive en la clave pa del enlace
 * (texto tal cual; el camino, lista de ids). core/probgrade corrige casilla a casilla con error consecuente. En
 * Practicar, «Comprobar» corrige cuando se quiera y la corrección vive en la página (editar la borra); en Examen no hay
 * marcas hasta «Entregar» (xd=1), y la entrega se corrige al abrir el enlace. La tabla de la normal (views/normal-table)
 * es un panel al lado, no modal, en los dos modos. La solución se abre en M6 con la misma tabla (tabla propia, ut).
 *
 * La parte sin DOM (exercise, answers, setField, setPath, grade, label, explain, statement, levelText, movedText, m6Hash
 * y compañía) se prueba en Node (tests/ex-prob.test.js); create() pinta la vista. Para las pruebas de navegador,
 * PNL.exProb.state() da el ejercicio, lo escrito y la corrección.
 */
(function (root) {
  'use strict';

  const isNode = typeof module !== 'undefined' && module.exports;
  const req = (path, name) => (isNode ? require(path) : root.PNL[name]);
  const I = req('./i18n.js', 'i18n');
  if (isNode) require('./i18n-prob.js');
  const GEN = req('./core/generator.js', 'generator');
  const PG = req('./core/probgen.js', 'probgen');
  const PR = req('./core/probgrade.js', 'probgrade');
  const U = req('./core/urlstate.js', 'urlstate');

  const tt = (lang, k, p) => I.t(lang, k, p);
  const num = (lang, x, k) => Number(x).toLocaleString(lang === 'es' ? 'es-ES' : 'en-GB', { maximumFractionDigits: k == null ? 2 : k, useGrouping: false });
  const pctOf = (lang, p) => `${num(lang, p * 100, 1)}${lang === 'es' ? ' %' : '%'}`;
  const dash = (ids) => ids.join('–');
  const isNum = (x) => typeof x === 'number' && !Number.isNaN(x);

  // ---------- El ejercicio ----------

  /** Lo que se pasa a probgen: el nombre del nivel o los parámetros de «Personalizar» (como ex.params). */
  function levelArg(state) {
    if (state.lv === 'custom') return Object.assign({}, state.gp || GEN.LEVELS.medium);
    return GEN.LEVELS[state.lv] ? state.lv : 'medium';
  }
  const exKey = (state) => JSON.stringify([PG.VERSION, state.sd, levelArg(state), !!state.xo]);
  /** La búsqueda de la tabla (probgen.start), para hacerla a trozos. */
  const job = (state) => PG.start('tcl', state.sd, levelArg(state), { route: !!state.xo });
  const found = new Map();
  function remember(key, r) {
    if (found.size > 20) found.clear();
    found.set(key, r);
    return r;
  }
  /** El ejercicio de una semilla, de una vez: { ok, ex, info } (o { ok: false, reason }). */
  function exercise(state) {
    const key = exKey(state);
    if (!found.has(key)) { const j = job(state); PG.step(j, {}); remember(key, PG.result(j)); }
    return found.get(key);
  }
  const sols = new WeakMap();
  function solution(ex) {
    if (!sols.has(ex)) sols.set(ex, PG.solve('tcl', ex));
    return sols.get(ex);
  }

  // ---------- Lo escrito (pa): siempre texto, sin interpretar ----------

  function answers(state) {
    const a = Object.assign({}, state.pa || {});
    if (a.path) a.path = a.path.slice();
    return a;
  }
  const done = (a) => (Object.keys(a).length ? a : null);
  function setField(pa, key, text) {
    const out = Object.assign({}, pa || {});
    const v = String(text == null ? '' : text).slice(0, U.PA.value);
    if (v) out[key] = v; else delete out[key];
    return done(out);
  }
  function setPath(pa, ex, id, on) {
    const out = Object.assign({}, pa || {});
    const marked = new Set(out.path || []);
    if (on) marked.add(id); else marked.delete(id);
    const path = ex.rows.map((r) => r.id).filter((x) => marked.has(x));
    if (path.length) out.path = path; else delete out.path;
    return done(out);
  }

  const grade = (ex, pa) => PR.tcl(ex, pa || {}, solution(ex));
  const order = (ex) => PR.fields('tcl', ex);

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

  const LAB = { path: 'path', mu: 'mu', var: 'pvar', z: 'z', p: 'p', zp: 'zp', Tp: 'Tp', 'r.mu': 'rmu', 'r.var': 'rvar', 'r.z': 'rz', 'r.p': 'rp', both: 'both' };
  function label(key, ex, lang) {
    const m = /^(\w+)\.(te|var)$/.exec(key);
    if (m && m[1] !== 'r') return tt(lang, `pb.lab.${m[2] === 'te' ? 'te' : 'tvar'}`, { a: m[1] });
    return tt(lang, `pb.lab.${LAB[key]}`, { T: num(lang, ex.deadline), p: pctOf(lang, ex.prob) });
  }

  /** Un texto con {claves} en trozos: los valores, en negrita ({ b }). */
  function rich(template, params) {
    return template.split(/(\{\w+\})/).filter(Boolean).map((x) => { const k = /^\{(\w+)\}$/.exec(x); return k && params[k[1]] != null ? { b: String(params[k[1]]) } : x; });
  }
  function statement(ex, lang) {
    const out = rich(tt(lang, 'pb.stmt'), { T: tt(lang, 'pb.weeks', { n: num(lang, ex.deadline) }), p: pctOf(lang, ex.prob) });
    return ex.route ? out.concat(rich(tt(lang, 'pb.stmtRoute'), { r: dash(ex.route) })) : out;
  }

  /** La descripción del nivel: actividades, caminos críticos y la parte de duraciones fijas (tableros 93 y 94). */
  function levelText(prm, level, lang) {
    const pair = (k, kOne, v, one) => (v[0] === v[1] ? (one && v[0] === 1 ? tt(lang, `ex.sum.${one}`) : tt(lang, `ex.sum.${kOne}`, { n: v[0] })) : tt(lang, `ex.sum.${k}`, { lo: v[0], hi: v[1] }));
    const fixed = PG.PFIX[PG.PFIX[level] ? level : 'medium'];
    return [pair('acts', 'actsOne', prm.n), pair('crit', 'critN', prm.critical, 'critOne'), tt(lang, 'pb.fixed', { p: num(lang, fixed * 100) })].join(' · ');
  }

  /** Si se usa la tabla de otra semilla (H9): cuál; '' si es la pedida. */
  const movedText = (r, lang) => (r && r.ok && r.info.sdUsed !== r.ex.sd ? tt(lang, 'pb.moved', { sd: r.ex.sd, used: r.info.sdUsed }) : '');

  /** «Ver la solución en M6»: el mismo proyecto como tabla propia, con el plazo y la probabilidad del ejercicio. */
  function m6Hash(ex, state) {
    return U.encode(Object.assign(U.defaults(), { v: 'unc', um: 'm6', ue: 'own', ut: PG.toUt(ex), ud: ex.deadline, up: ex.prob, lang: state.lang, nota: state.nota }));
  }

  // ---------- Explicaciones (AC10) ----------

  function net(ex) {
    const pos = Object.fromEntries(ex.rows.map((r, i) => [r.id, i]));
    const preds = Object.fromEntries(ex.rows.map((r) => [r.id, r.preds]));
    const succs = Object.fromEntries(ex.rows.map((r) => [r.id, []]));
    for (const r of ex.rows) for (const p of r.preds) succs[p].push(r.id);
    return { pos, preds, succs };
  }
  /** Las marcas, en el orden de la tabla, como camino completo de inicio a fin (null si no lo son). */
  function asPath(n, ids) {
    const p = ids.filter((x) => x in n.pos).sort((x, y) => n.pos[x] - n.pos[y]);
    if (!p.length || p.length < ids.length || n.preds[p[0]].length || n.succs[p[p.length - 1]].length) return null;
    for (let i = 1; i < p.length; i++) if (!n.preds[p[i]].includes(p[i - 1])) return null;
    return p;
  }
  /** El camino más largo con unas medias (empate: más varianza), de atrás adelante en orden topológico. */
  function longest(ex, te, va) {
    const n = net(ex); const best = {};
    const deg = Object.fromEntries(ex.rows.map((r) => [r.id, r.preds.length]));
    const topo = ex.rows.filter((r) => !r.preds.length).map((r) => r.id);
    for (let i = 0; i < topo.length; i++) for (const x of n.succs[topo[i]]) if (--deg[x] === 0) topo.push(x);
    for (let i = topo.length - 1; i >= 0; i--) {
      const id = topo[i]; let b = { len: 0, v: 0, path: [] };
      for (const s of n.succs[id]) {
        const c = best[s];
        if (!b.path.length || c.len > b.len + 1e-9 || (Math.abs(c.len - b.len) <= 1e-9 && c.v > b.v)) b = c;
      }
      best[id] = { len: b.len + te(id), v: b.v + va(id), path: [id].concat(b.path) };
    }
    let top = null;
    for (const r of ex.rows) {
      if (r.preds.length) continue;
      const c = best[r.id];
      if (!top || c.len > top.len + 1e-9 || (Math.abs(c.len - top.len) <= 1e-9 && c.v > top.v)) top = c;
    }
    return top;
  }

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

  /** La explicación de una casilla tras «Comprobar» o «Entregar»: '' si está bien. */
  function explain(ex, ans, g, key, lang) {
    const c = g.cells[key];
    if (!c || c.status === 'ok') return '';
    if (c.status === 'blank') return tt(lang, 'ex.explain.blank');
    if (c.status === 'invalid') return tt(lang, 'ex.explain.invalid', { v: Array.isArray(c.value) ? dash(c.value) : String(ans[key] == null ? '' : ans[key]).trim() });
    const sol = solution(ex);
    const f = (x, k) => num(lang, x, k == null ? 4 : k);
    const v = f(c.value);
    const o = origin(g, key);
    const from = o && o !== key ? tt(lang, 'ex.explain.origin', { lab: label(o, ex, lang) }) : '';
    const row = ex.rows.find((r) => `${r.id}.te` === key || `${r.id}.var` === key);
    if (c.formula === 'te') return tt(lang, 'pb.explain.te', { v, a: f(row.a), m: f(row.m), b: f(row.b), r: f(c.right, 2) });
    if (c.formula === 'tvar') return tt(lang, 'pb.explain.tvar', { v, a: f(row.a), b: f(row.b), r: f(c.right, 2) });
    if (c.formula === 'zp') return ex.prob === 0.95 ? tt(lang, 'pb.explain.zp95', { v }) : tt(lang, 'pb.explain.zp', { v, p: f(ex.prob, 2), r: f(c.right, 2) });
    // Los datos del alumno tal como los escribió (los de la solución si la casilla está vacía o no es un número).
    const exact = { mu: sol.mu, var: sol.var, z: sol.z, p: sol.p, zp: sol.zp };
    if (sol.route) Object.assign(exact, { 'r.mu': sol.route.mu, 'r.var': sol.route.var, 'r.z': sol.route.z, 'r.p': sol.route.p });
    const val = (k) => {
      const x = PR.parse(ans[k]);
      if (isNum(x)) return x;
      const m = /^(\w+)\.(te|var)$/.exec(k);
      return m && m[1] !== 'r' ? sol.acts[m[1]][m[2]] : exact[k];
    };
    const te = (id) => val(`${id}.te`);
    const va = (id) => val(`${id}.var`);
    // La otra lectura de probgrade: los buenos, exactos (así el redondeo de un dato bueno no decide un empate).
    const BAD = new Set(['wrong', 'carried']);
    const snap = (k) => (g.cells[k] && BAD.has(g.cells[k].status) ? val(k) : sol.acts[k.split('.')[0]][k.split('.')[1]]);
    if (c.formula === 'path') {
      const marks = PR.marks(ans.path);
      const n = net(ex);
      const his = asPath(n, marks);
      const ordered = marks.slice().sort((x, y) => (n.pos[x] ?? 1e9) - (n.pos[y] ?? 1e9));
      if (c.status === 'carried') return tt(lang, 'pb.explain.pathCarried', { p: dash(his || ordered), r: dash(sol.path), origin: from });
      if (!his) return tt(lang, 'pb.explain.pathBroken', { p: dash(ordered) });
      // Con lo que escribió y con los buenos exactos: si en alguna empata con el más largo, perdió por la varianza (si no, sería
      // crítico con sus datos y probgrade lo daría por bueno con error consecuente).
      const reads = [[te, va], [(id) => snap(`${id}.te`), (id) => snap(`${id}.var`)]].map(([T1, V1]) => ({ top: longest(ex, T1, V1),
        len: his.reduce((x, id) => x + T1(id), 0), v: his.reduce((x, id) => x + V1(id), 0) }));
      const tie = reads.find((q) => Math.abs(q.top.len - q.len) <= 1e-6);
      if (tie) return tt(lang, 'pb.explain.pathVar', { p: dash(his), best: dash(tie.top.path), len: f(tie.len, 2), v: f(tie.v, 2), top: f(tie.top.v, 2) });
      const q = reads[0];
      return tt(lang, 'pb.explain.pathShort', { p: dash(his), len: f(q.len, 2), top: f(q.top.len, 2), best: dash(q.top.path) });
    }
    const his = asPath(net(ex), PR.marks(ans.path)) || sol.path;
    const sum = (ids, g1) => ids.map((id) => f(g1(id))).join(' + ');
    const calc = {
      mu: () => sum(his, te), pvar: () => sum(his, va),
      z: () => `(${f(ex.deadline)} − ${f(val('mu'))}) / √${f(val('var'))}`,
      p: () => `Φ(${f(val('z'))})`,
      Tp: () => `${f(val('mu'))} + ${f(val('zp'))} · √${f(val('var'))}`,
      rmu: () => sum(ex.route, te), rvar: () => sum(ex.route, va),
      rz: () => `(${f(ex.deadline)} − ${f(val('r.mu'))}) / √${f(val('r.var'))}`,
      rp: () => `Φ(${f(val('r.z'))})`,
      both: () => `${f(val('p'))} · ${f(val('r.p'))}`,
    }[c.formula]();
    const e = c.expected == null ? '—' : f(c.expected, ['p', 'rp', 'both'].includes(c.formula) ? 4 : 2);
    const lab = label(key, ex, lang);
    if (c.status === 'carried') return tt(lang, 'ex.explain.carried', { v, e, lab, calc, origin: from });
    return tt(lang, 'ex.explain.wrong', { v, e, lab, calc });
  }

  // ---------- Vista ----------

  function create(hooks) {
    const G = root.PNL;
    const { h, clear } = G.dom;
    const AT = G.answerTable;
    const NT = G.normalTable;
    const lang = () => hooks.lang();
    const t = (k, p) => I.t(lang(), k, p);
    let checked = null;        // Practicar: { key, g } de la última comprobación (solo en la página)
    let confirmOpen = false;   // Examen: confirmación de «Entregar»
    let selKey = null;         // casilla elegida (su explicación)
    let zKey = null;           // la última casilla de z por la que se pasó (la que abre la tabla de la normal)
    let normal = null;         // tabla de la normal abierta: { z } (texto de «Buscar z»)
    // En el móvil la red empieza plegada (como el cálculo), y con más de 10 actividades también (tablero 94): no cabría.
    const narrow = !!(root.matchMedia && root.matchMedia('(max-width: 720px)').matches);
    let folded = null;
    let search = null;         // búsqueda a trozos en curso: { key, job, timer }
    let focusAfter = null;
    let last = null;           // { container, m }
    let view = null;           // lo último pintado (pruebas)
    let lay = { ex: null };

    function reset() {
      checked = null; confirmOpen = false; selKey = null; normal = null; folded = null;
      if (search) { root.clearTimeout(search.timer); search = null; }
    }
    const redraw = () => { if (last) draw(last.container, last.m); };
    // Repinta y deja el foco (y el cursor) donde estaba.
    function keepFocus() {
      const a = root.document.activeElement;
      const id = a && a.id ? a.id : null;
      const pos = a && typeof a.selectionStart === 'number' ? a.selectionStart : null;
      redraw();
      const el = id && root.document.getElementById(id);
      if (el) { el.focus({ preventScroll: true }); if (pos !== null && el.setSelectionRange) el.setSelectionRange(pos, pos); }
    }

    // La tabla de la semilla: de una vez si llega pronto; si no, a trozos, con aviso (puerta T001).
    function lookup(s) {
      const key = exKey(s);
      if (found.has(key)) return found.get(key);
      if (search && search.key === key) return null;
      if (search) root.clearTimeout(search.timer);
      const j = job(s);
      PG.step(j, { ms: 40 });
      if (j.out) return remember(key, PG.result(j));
      search = { key, job: j, timer: null };
      const tick = () => {
        if (!search || search.job !== j) return;
        PG.step(j, { ms: 40 });
        if (!j.out) { search.timer = root.setTimeout(tick, 0); return; }
        remember(key, PG.result(j));
        search = null;
        keepFocus();
      };
      search.timer = root.setTimeout(tick, 0);
      return null;
    }

    function draw(container, m) {
      last = { container, m };
      const s = hooks.state();
      const lg = lang();
      clear(container);
      const r = lookup(s);
      if (!r) { view = null; container.appendChild(h('p', { class: 'banner', role: 'status', id: 'pbSearching' }, [t('pb.searching')])); return; }
      if (!r.ok) { view = null; container.appendChild(h('p', { class: 'banner', role: 'status', id: 'pbNotFound' }, [t('pb.notFound', { n: PG.TRIES_TCL })])); return; }
      const ex = r.ex;
      if (folded === null) folded = narrow || ex.rows.length > 10;
      const ans = answers(s);
      const exam = s.xm === 'exam';
      const delivered = exam && !!s.xd;
      if (delivered) confirmOpen = false;
      const key = JSON.stringify(ans);
      const g = delivered ? grade(ex, ans) : checked && checked.key === key ? checked.g : null;
      const stale = !exam && !!checked && checked.key !== key;
      const locked = delivered;
      const st = (k) => (g && g.cells[k] ? g.cells[k].status : null);
      view = { r, ex, ans, g, stale };

      // ---- Datos del proyecto ----
      const halves = ex.rows.length > 7 && !normal ? 2 : 1;
      const per = Math.ceil(ex.rows.length / halves);
      const tables = [];
      for (let k = 0; k < halves; k++) {
        tables.push(h('table', { class: 'data ex-given' }, [
          k === 0 ? h('caption', { class: 'sr-only' }, [t('pb.given')]) : null,
          h('thead', {}, [h('tr', {}, [h('th', { scope: 'col' }, [t('ex.act')]), ...['a', 'm', 'b'].map((x) => h('th', { scope: 'col', class: 'd' }, [x])), h('th', { scope: 'col' }, [t('ex.preds')])])]),
          h('tbody', {}, ex.rows.slice(k * per, (k + 1) * per).map((row) => h('tr', { 'data-act': row.id, class: selKey && selKey.split('.')[0] === row.id ? 'sel' : null }, [h('th', { scope: 'row' }, [row.id]),
            ...['a', 'm', 'b'].map((x) => h('td', { class: 'd' }, [num(lg, row[x])])), h('td', {}, [row.preds.join(', ') || '—'])]))),
        ]));
      }
      const moved = movedText(r, lg);
      const data = h('section', { class: 'card ex-given-card', id: 'pbData', 'aria-labelledby': 'pbDataHead' }, [
        h('h2', { id: 'pbDataHead' }, [t('ex.given')]),
        moved ? h('p', { class: 'banner small', id: 'pbMoved', role: 'status' }, [moved]) : null,
        h('p', { id: 'pbStmt', class: 'pb-stmt' }, statement(ex, lg).map((x) => (typeof x === 'string' ? x : h('strong', {}, [x.b])))),
        h('div', { class: 'ex-halves', id: 'pbGiven' }, tables),
        h('p', { class: 'muted pb-tie' }, [t('pb.tie')])]);

      // ---- Red ROY sin cifras (plegable) ----
      const holder = h('div', { class: 'ex-net', id: 'pbNet', tabindex: '0', hidden: folded || null });
      const netCard = normal ? null : h('section', { class: 'card ex-net-card', 'aria-label': t('ex.roy') }, [
        h('div', { class: 'ex-head' }, [h('h2', {}, [t('ex.roy')]), h('button', { type: 'button', class: 'ghost', id: 'pbFold', 'aria-expanded': String(!folded), 'aria-controls': 'pbNet',
          onclick: () => { folded = !folded; focusAfter = 'pbFold'; redraw(); } }, [folded ? t('ex.unfold') : t('ex.fold')])]),
        holder, folded ? null : h('p', { class: 'muted small' }, [t('ex.royAlt')])]);

      // ---- Respuestas ----
      const onInput = (k, value) => { hooks.dispatch({ type: 'pa', value: setField(answers(hooks.state()), k, value) }, { fromEx: true }); if (g) keepFocus(); };
      const onFocus = (k) => { selKey = k; if (k === 'z' || k === 'zp' || k === 'r.z') zKey = k; markRows(container); drawExplain(); };
      const onEnter = (k) => { const tbl = container.querySelector('table.pb-ans'); const next = tbl && AT.below(tbl, k); if (next) next.focus(); };
      const cell = (k) => AT.cell({ key: k, value: ans[k], state: st(k), locked, selected: selKey === k, label: label(k, ex, lg), t, onInput, onFocus, onEnter });
      const marks = new Set(ans.path || []);
      const pst = st('path');
      const rows = ex.rows.map((row) => h('tr', { 'data-act': row.id, class: selKey && selKey.split('.')[0] === row.id ? 'sel' : null }, [
        h('th', { scope: 'row', class: 'id' }, [row.id]),
        h('td', {}, [cell(`${row.id}.te`)]), h('td', {}, [cell(`${row.id}.var`)]),
        h('td', { class: 'pb-pc' }, [h('span', { class: `ex-cell ex-check${pst && marks.has(row.id) ? ` st-${pst}` : ''}` }, [
          h('input', { type: 'checkbox', id: `pbPath-${row.id}`, checked: marks.has(row.id), disabled: locked, 'aria-label': t('pb.pathOf', { a: row.id }),
            'aria-describedby': pst ? 'pbPathSt' : null, onfocus: () => { selKey = 'path'; markRows(container); drawExplain(); },
            onchange: (e) => { focusAfter = `pbPath-${row.id}`; hooks.dispatch({ type: 'pa', value: setPath(answers(hooks.state()), ex, row.id, e.target.checked) }, { fromEx: true }); redraw(); } })])]),
      ]));
      const te = h('span', {}, ['t', h('sub', {}, ['e'])]);
      const table = h('table', { class: 'data ex-ans pb-ans' }, [h('caption', { class: 'sr-only' }, [t('pb.caption')]),
        h('thead', {}, [h('tr', {}, [h('th', { scope: 'col', class: 'id' }, [t('ex.act')]), h('th', { scope: 'col' }, [te]), h('th', { scope: 'col' }, ['σ²']), h('th', { scope: 'col' }, [t('pb.path')])])]),
        h('tbody', {}, rows)]);
      const his = PR.marks(ans.path);
      const pathSt = h('p', { id: 'pbPathSt', class: `small pb-pathst${pst ? ` st-${pst}` : ''}${his.length ? '' : ' muted'}` }, [his.length ? t('pb.yourPath', { p: dash(his) }) : t('pb.pathHelp'),
        pst ? AT.mark(pst, 'pbPathSt-m', t) : null]);
      const field = (k, text) => h('span', { class: 'pb-f' }, [h('label', { for: AT.cellId(k) }, [text]), cell(k)]);
      const group = (id, title, items) => h('div', { class: 'pb-group', role: 'group', 'aria-labelledby': id }, [h('span', { class: 'pb-gtitle', id }, [title]), h('div', { class: 'pb-gcells' }, items)]);
      const T = num(lg, ex.deadline);
      const groups = [
        group('pbGProj', t('pb.proj'), [field('mu', 'μ'), field('var', 'σ²')]),
        group('pbGDl', t('pb.dl', { T: t('pb.weeks', { n: T }) }), [field('z', 'z'), field('p', `P(T ≤ ${T})`)]),
        group('pbGPr', t('pb.pr', { p: pctOf(lg, ex.prob) }), [field('zp', 'z'), field('Tp', t('pb.deadline'))]),
      ];
      if (ex.route) {
        groups.push(group('pbGRoute', t('pb.routeOf', { r: dash(ex.route) }), [field('r.mu', 'μ'), field('r.var', 'σ²'), field('r.z', 'z'), field('r.p', 'P')]));
        groups.push(group('pbGBoth', t('pb.both'), [field('both', 'P')]));
      }

      const side = [];
      if (g) side.push(h('ul', { class: 'ex-legend', 'aria-label': t('ex.legend') }, ['ok', 'carried', 'wrong', 'blank', 'invalid'].map((x) => h('li', { class: `ex-chip st-${x}` }, [AT.icon(x), t(`ex.st.${x}`)]))));
      const explainBox = h('div', { class: 'ex-explain', id: 'pbExplain', 'aria-live': 'polite', hidden: true });
      side.push(explainBox);
      if (stale) side.push(h('p', { class: 'banner small', role: 'status', id: 'pbStale' }, [t('ex.stale')]));
      if (confirmOpen && exam && !delivered) {
        const blanks = Object.values(grade(ex, ans).cells).filter((c) => c.status === 'blank').length;
        side.push(h('div', { class: 'ex-confirm', role: 'alertdialog', 'aria-labelledby': 'pbConfirmText' }, [h('p', { id: 'pbConfirmText' }, [t('ex.confirm', { n: blanks })]),
          h('div', { class: 'ex-btns' }, [h('button', { type: 'button', class: 'ghost primary', id: 'pbConfirmYes', onclick: deliver }, [t('ex.confirmYes')]),
            h('button', { type: 'button', class: 'ghost', id: 'pbConfirmNo', onclick: () => { confirmOpen = false; focusAfter = 'pbDeliver'; redraw(); } }, [t('ex.confirmNo')])])]));
      }
      if (!locked && !g && !confirmOpen) side.push(h('p', { class: 'muted small' }, [t('ex.enterHint')]));

      const actions = [];
      if (!exam) actions.push(h('button', { type: 'button', class: 'ghost primary', id: 'pbCheck', onclick: check }, [t('ex.check')]));
      if (exam && !delivered) actions.push(h('button', { type: 'button', class: 'ghost primary', id: 'pbDeliver', onclick: () => { confirmOpen = true; focusAfter = 'pbConfirmYes'; redraw(); } }, [t('ex.deliver')]));
      actions.push(h('button', { type: 'button', class: 'ghost', id: 'pbTable', 'aria-expanded': String(!!normal), 'aria-controls': normal ? 'pbNormal' : null,
        onclick: () => { normal = normal ? null : { z: zKey && ans[zKey] ? ans[zKey] : '' }; focusAfter = normal ? 'pbNormalZ' : 'pbTable'; redraw(); } }, [t('pb.table')]));
      if (!exam || delivered) actions.push(h('a', { class: `pb-link${delivered ? ' primary' : ''}`, id: 'pbSol', href: m6Hash(ex, s) }, [t('pb.sol')]));
      if (delivered) actions.push(h('button', { type: 'button', class: 'ghost', id: 'pbAnother2', onclick: hooks.another }, [t('ex.another')]));
      if (hooks.learn) actions.push(h('button', { type: 'button', class: 'ghost', id: 'pbLearn', onclick: () => hooks.learn() }, [t('learn.button')]));

      const head = [h('h2', {}, [t('ex.answers')])];
      if (g) head.push(h('p', { class: 'ex-score', role: 'status' }, [h('strong', { id: 'pbScore' }, [scoreText(g, lg)]), ' ', h('span', { class: 'muted small', id: 'pbCount' }, [countText(g, lg)])]));
      const answersCard = h('section', { class: 'card ex-answers', id: 'pbAnswers', 'aria-label': t('ex.answers') }, [
        h('div', { class: 'ex-head' }, head),
        exam ? h('p', { class: 'muted small ex-note', id: 'pbNote' }, [delivered ? t('ex.delivered') : t('ex.examNote')]) : null,
        h('div', { class: 'pb-cols' }, [
          h('div', { class: 'pb-c1' }, [h('div', { class: 'ex-table-box pb-table-box', tabindex: '0', role: 'region', 'aria-label': t('pb.caption') }, [table]), pathSt,
            locked ? null : h('p', { class: 'muted small' }, [t('pb.help')])]),
          h('div', { class: 'pb-c2' }, groups),
          h('div', { class: 'ex-side pb-c3' }, side)]),
        h('div', { class: 'ex-btns' }, actions)]);

      const panel = normal ? NT.render({ lang: lg, t, z: normal.z, onSearch: (z) => { normal.z = z; keepFocus(); }, onClose: () => { normal = null; focusAfter = 'pbTable'; redraw(); } }) : null;
      container.appendChild(h('div', { class: `ex-grid pb-grid${normal ? ' pb-with-normal' : ''}` }, [h('div', { class: 'ex-left' }, [data, netCard]), answersCard, panel]));

      if (netCard && !folded) drawNet(holder, ex, s);
      if (panel) NT.reveal(panel);
      function drawExplain() {
        clear(explainBox);
        const c = g && selKey ? g.cells[selKey] : null;
        const text = c ? explain(ex, ans, g, selKey, lg) : '';
        explainBox.hidden = !text;
        if (!text) return;
        explainBox.className = `ex-explain st-${c.status}`;
        explainBox.appendChild(h('strong', {}, [`${t(`ex.st.${c.status}`)} · ${label(selKey, ex, lg)}`]));
        explainBox.appendChild(h('p', {}, [text]));
      }
      drawExplain();
      const want = focusAfter;
      focusAfter = null;
      if (want) { const el = root.document.getElementById(want); if (el) el.focus(); }
    }

    // Resalta la fila de la actividad elegida en las dos tablas, sin repintar (el foco sigue en su casilla).
    function markRows(container) {
      const a = selKey && /^\w+\.(te|var)$/.test(selKey) && !selKey.startsWith('r.') ? selKey.split('.')[0] : null;
      for (const tr of container.querySelectorAll('tr[data-act]')) tr.classList.toggle('sel', tr.getAttribute('data-act') === a);
    }

    function drawNet(holder, ex, s) {
      if (lay.ex !== ex) {
        const project = G.project.parse(ex.rows.map((r) => ({ id: r.id, duration: String(r.m), links: r.preds.join(', ') })), 'pred').project;
        const sol = G.cpm.solve(project);
        lay = { ex, project, sol, roy: G.layout.layout(sol, project) };
      }
      // Sin cifras: ni duraciones ni tiempos, solo los nombres (tablero 93).
      G.royView.render(holder, { project: lay.project, solution: lay.sol, lay: lay.roy, step: null, revealed: new Map(), box: 'c', lang: lang(), nota: s.nota,
        criticalOn: false, numFmt: () => '·', name: `${t('ex.region')} · ${t('ex.seed')} ${s.sd}`, selected: null, selPrecs: [], fit: true, geo: { gx: 30, gy: 20 }, minWidth: 360 });
    }

    function check() {
      if (!view) return;
      checked = { key: JSON.stringify(view.ans), g: grade(view.ex, view.ans) };
      focusAfter = 'pbCheck';
      redraw();
      hooks.announce(`${scoreText(checked.g, lang())}. ${countText(checked.g, lang())}`);
    }
    function deliver() {
      confirmOpen = false;
      focusAfter = 'pbSol';
      hooks.dispatch({ type: 'exDeliver' });
      if (view) { const g = grade(view.ex, view.ans); hooks.announce(`${scoreText(g, lang())}. ${countText(g, lang())}`); }
    }

    function debug() {
      const s = hooks.state();
      if (!view) return { sd: s.sd, ex: null, searching: !!search };
      return { sd: s.sd, used: view.r.info.sdUsed, ex: view.ex, ans: view.ans, grading: view.g, stale: view.stale, normal: normal ? { z: normal.z } : null, searching: !!search };
    }

    return { draw, reset, debug };
  }

  const api = { levelArg, exKey, job, exercise, solution, answers, setField, setPath, grade, order, counts, scoreText, countText, label, statement, levelText, movedText,
    m6Hash, explain, create };
  root.PNL = root.PNL || {};
  root.PNL.exProb = api;
  if (isNode) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
