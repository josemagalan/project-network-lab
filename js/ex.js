/*
 * ex — controlador de «Ejercicios» (spec f3a-generador-calculo; plan §2–§4, P3–P7; tableros 37–50).
 *
 * El generador del núcleo (core/generator) da la tabla de una semilla y unos parámetros (un nivel o «Personalizar»);
 * core/grade da la solución y la corrección con error consecuente. La página enseña la tabla dada, la red sin cifras
 * (ROY o la PERT de las reglas, plegable) y la tabla de respuestas (views/answer-table). En Practicar, «Comprobar»
 * corrige cuando se quiera y la corrección vive en la página (se borra al editar); en Examen no hay marcas ni pistas
 * hasta «Entregar», que guarda xd=1 en el enlace y bloquea la tabla (plan §0, «Sin pistas»).
 *
 * La parte sin DOM (params, model, columns, setCell y compañía, explain, pathExplain, visibility, stepState, blanks)
 * se prueba en Node (tests/ex.test.js); create() pinta la vista. Para las pruebas de navegador, PNL.ex.state() da el
 * ejercicio, las respuestas y la última corrección.
 */
(function (root) {
  'use strict';

  const isNode = typeof module !== 'undefined' && module.exports;
  const req = (path, name) => (isNode ? require(path) : root.PNL[name]);
  const I = req('./i18n.js', 'i18n');
  const P = req('./core/project.js', 'project');
  const GEN = req('./core/generator.js', 'generator');
  const GR = req('./core/grade.js', 'grade');
  const U = req('./core/urlstate.js', 'urlstate');
  const NR = req('./narrate.js', 'narrate');
  // F3c (plan P5): core/stmtgen llega con el grupo sg, solo con el proyecto como enunciado.
  const SG = () => (isNode ? require('./core/stmtgen.js') : root.PNL.stmtgen);

  const ACT_F = ['ES', 'EF', 'LS', 'LF', 'TF', 'FF', 'IF', 'SF'];
  const EV_F = ['TE', 'TL', 'slack'];
  const SEED_MAX = 999999;
  const fmt = (lang, v) => NR.fmt(lang, v);
  const t = (lang, k, p) => I.t(lang, k, p);

  // ---------- Parámetros y modelo ----------

  function params(state) {
    if (state.lv === 'custom') return state.gp ? Object.assign({}, state.gp) : Object.assign({}, GEN.LEVELS.medium);
    return GEN.LEVELS[state.lv] || GEN.LEVELS.medium;
  }

  // La tabla generada se guarda por (versión, semilla, parámetros): cambiar el idioma o escribir no vuelve a generar.
  const cache = new Map();
  function generated(sd, prm) {
    const key = `${GEN.VERSION}|${sd}|${JSON.stringify(prm)}`;
    if (!cache.has(key)) {
      if (cache.size > 20) cache.clear();
      const g = GEN.generate(sd, prm);
      const out = { g, rows: null, project: null, sol: null };
      if (g.ok) { out.rows = g.rows; out.project = P.parse(g.rows, 'pred').project; out.sol = GR.solve(out.project); }
      cache.set(key, out);
    }
    return cache.get(key);
  }

  function answersOf(state) {
    const a = state.ans || {};
    return { act: Object.assign({}, a.act || {}), dur: a.dur || '', ev: Object.assign({}, a.ev || {}), crit: (a.crit || []).slice(), paths: (a.paths || []).slice() };
  }

  function model(state, lang) {
    const prm = params(state);
    const chk = GEN.check(prm);
    const ask = U.cleanAsk(state.ask) || U.DEFAULT_ASK.slice();
    const base = { params: prm, issues: chk.issues, notFound: null, rows: null, project: null, sol: null, ask, ans: answersOf(state),
      mode: state.xm === 'exam' ? 'exam' : 'practice', delivered: state.xm === 'exam' && !!state.xd, seed: state.sd, lang,
      oldVersion: state.gv != null && state.gv !== GEN.VERSION, grading: null, text: null, textPending: false };
    if (!chk.ok || !state.sd) return base;
    const gen = generated(state.sd, prm);
    if (!gen.g.ok) return Object.assign(base, { notFound: gen.g });
    const m = Object.assign(base, { rows: gen.rows, project: gen.project, sol: gen.sol, info: gen.g.info, text: null, textPending: false });
    // F3c (T010, AC9): el enunciado de esta misma tabla, con el contexto de la semilla (como stmtgen.make).
    if (state.xt && state.lv !== 'custom') {
      const G3 = SG();
      if (!G3) m.textPending = true;
      else {
        const ctx = G3.contextOf(state.sd, state.lv);
        const r = G3.compose(gen.rows, state.lv, ctx, state.sd);
        m.text = r.ok ? { def: r.def, ctx } : null;
        m.textFailed = !r.ok;
      }
    }
    if (m.delivered) m.grading = GR.grade(m.sol, m.ans, ask);
    return m;
  }

  function levelSummary(prm, lang) {
    const pair = (k, kOne, v, one) => (v[0] === v[1] ? (one && v[0] === 1 ? t(lang, `ex.sum.${one}`) : t(lang, `ex.sum.${kOne}`, { n: v[0] })) : t(lang, `ex.sum.${k}`, { lo: v[0], hi: v[1] }));
    return [
      pair('acts', 'actsOne', prm.n),
      t(lang, 'ex.sum.pred', { p: fmt(lang, prm.pred) }),
      prm.dummies ? pair('dummies', 'dummiesOne', prm.dummies, 'dummyOne') : t(lang, 'ex.sum.dummiesFree'),
      pair('crit', 'critN', prm.critical, 'critOne'),
      t(lang, 'ex.sum.dmax', { max: prm.dmax }),
    ].join(' · ');
  }

  function issueText(issue, prm, lang) {
    if (issue.code === 'dummiesTooMany') return t(lang, 'ex.custom.dummiesTooMany', { n: prm.n[1], max: Math.floor(prm.n[1] / 3) });
    if (issue.code === 'dummiesNoExact') return t(lang, 'ex.custom.dummiesNoExact');
    const field = { n: 'acts', pred: 'pred', dummies: 'dummies', critical: 'crit', dmax: 'dmax' }[issue.key] || issue.key;
    return t(lang, 'ex.custom.range', { field: t(lang, `ex.custom.${field}`) });
  }
  function notFoundText(nf, lang) {
    return t(lang, 'ex.notFound', { n: nf.tries, worst: t(lang, `ex.worst.${nf.worst}`), advice: t(lang, `ex.advice.${nf.worst}`) });
  }

  // Columnas de la tabla de respuestas según lo que se pide y la notación (AC8, AC13).
  function columns(ask, nota) {
    const N = I.notation(nota);
    const E = I.eventNotation(nota);
    const act = [].concat(ask.includes('times') ? ['ES', 'EF', 'LS', 'LF'] : [], ask.includes('floats') ? ['TF', 'FF', 'IF'] : [],
      ask.includes('floats') && ask.includes('sf') ? ['SF'] : []).map((f) => ({ f, label: N[f] }));
    return { act, dur: ask.includes('times'), crit: ask.includes('critical'),
      events: ask.includes('events') ? [{ f: 'TE', sym: E.TE }, { f: 'TL', sym: E.TL }, { f: 'slack', sym: '' }] : null };
  }

  // ---------- Respuestas (siempre texto, sin interpretar) ----------

  const empty = () => ({ act: {}, dur: '', ev: {}, crit: [], paths: [] });
  const copy = (a) => ({ act: Object.fromEntries(Object.entries(a.act || {}).map(([k, v]) => [k, Object.assign({}, v)])), dur: a.dur || '',
    ev: Object.fromEntries(Object.entries(a.ev || {}).map(([k, v]) => [k, Object.assign({}, v)])), crit: (a.crit || []).slice(), paths: (a.paths || []).slice() });
  function setCell(a, key, text) {
    const out = copy(a); const v = String(text == null ? '' : text);
    if (key === 'dur') { out.dur = v; return out; }
    const m = /^e(\d+)\.(TE|TL|slack)$/.exec(key);
    if (m) { out.ev[m[1]] = Object.assign({}, out.ev[m[1]] || {}, { [m[2]]: v }); return out; }
    const [id, f] = key.split('.');
    out.act[id] = Object.assign({}, out.act[id] || {}, { [f]: v });
    return out;
  }
  function toggleCrit(a, id, on) {
    const out = copy(a);
    out.crit = out.crit.filter((x) => x !== id).concat(on ? [id] : []);
    return out;
  }
  const addPath = (a) => { const out = copy(a); out.paths.push(''); return out; };
  const setPath = (a, i, text) => { const out = copy(a); out.paths[i] = String(text == null ? '' : text); return out; };
  const removePath = (a, i) => { const out = copy(a); out.paths.splice(i, 1); return out; };
  // Lo que va al enlace: las respuestas limpias, o nada si no hay nada escrito.
  function forUrl(a) {
    const out = copy(a);
    for (const f of Object.values(out.act)) for (const k of ACT_F) if (f[k] === undefined) f[k] = '';
    for (const f of Object.values(out.ev)) for (const k of EV_F) if (f[k] === undefined) f[k] = '';
    while (out.paths.length && !out.paths[out.paths.length - 1].trim()) out.paths.pop();   // los vacíos del final, fuera
    // Se recorta a los límites del enlace (los mismos que el `maxlength` de los campos): nunca se anula todo (T020).
    const cut = (v) => String(v).slice(0, U.EX.value);
    for (const f of Object.values(out.act)) for (const k of ACT_F) f[k] = cut(f[k]);
    for (const f of Object.values(out.ev)) for (const k of EV_F) f[k] = cut(f[k]);
    out.dur = cut(out.dur == null ? '' : out.dur);
    out.paths = out.paths.slice(0, U.EX.paths).map((p) => p.slice(0, U.EX.path));
    return U.cleanAns(out);
  }
  const hasAnswers = (state) => !!state.ans && !!forUrl(answersOf(state));

  const seedFrom = (u32) => 1 + (Math.floor(Math.abs(Number(u32) || 0)) % SEED_MAX);

  // ---------- Qué se ve en cada modo (plan §0, «Sin pistas») ----------

  function visibility(state) {
    if (state.xm === 'exam') return state.xd ? { check: false, deliver: false, step: true, marks: 'always', locked: true }
      : { check: false, deliver: true, step: false, marks: 'none', locked: false };
    return { check: true, deliver: false, step: true, marks: 'checked', locked: false };
  }

  // «Ver la solución paso a paso» (AC12): la ruta de la F1 con la misma tabla, o los sucesos de la F2a.
  function stepState(state, m, view) {
    return { v: 'route', graph: view === 'events' ? 'aoa' : 'aon', rows: m.rows, mode: 'pred' };
  }

  function blanks(m, ans, ask) {
    const g = GR.grade(m.sol, ans, ask);
    return Object.values(g.cells).filter((c) => c.state === 'blank').length;
  }

  // ---------- Corrección explicada ----------

  function counts(g) {
    const c = { ok: 0, carried: 0, wrong: 0, blank: 0, invalid: 0 };
    for (const k of Object.keys(g.cells)) c[g.cells[k].state]++;
    for (const w of g.paths.written) if (w.state !== 'blank') c[w.state]++;   // un campo de camino vacío no cuenta (T020)
    return c;
  }
  const scoreText = (g, lang) => t(lang, 'ex.score', { pct: fmt(lang, g.score.pct), got: g.score.got, total: g.score.total });
  function countText(g, lang) {
    const c = counts(g);
    return ['wrong', 'carried', 'blank', 'invalid'].filter((k) => c[k]).map((k) => (c[k] === 1 ? t(lang, `ex.cnt.${k}One`) : t(lang, `ex.cnt.${k}`, { n: c[k] }))).join(' · ');
  }

  // El dato del alumno que usa una casilla: su número, o el correcto si está vacía o no es un número (P3).
  function usedVal(m, ans, key) {
    const num = (v) => { const x = GR.parse(v); return x === null || Number.isNaN(x) ? null : x; };
    if (key === 'dur') { const v = num(ans.dur); return v === null ? m.sol.cpm.duration : v; }
    const e = /^e(\d+)\.(\w+)$/.exec(key);
    if (e) { const v = num(((ans.ev || {})[e[1]] || {})[e[2]]); return v === null ? m.sol.events[e[2]][e[1]] : v; }
    const [a, f] = key.split('.');
    const v = num(((ans.act || {})[a] || {})[f]);
    if (v !== null) return v;
    return f in m.sol.cpm.times[a] ? m.sol.cpm.times[a][f] : m.sol.cpm.floats[a][f];
  }
  function keyLabel(key, lang, nota) {
    if (key === 'dur') return t(lang, 'ex.lab.dur');
    const e = /^e(\d+)\.(\w+)$/.exec(key);
    if (e) return t(lang, `ex.lab.${e[2]}`, { n: e[1] });
    const [a, f] = key.split('.');
    return t(lang, 'ex.lab.act', { f: I.notation(nota)[f], a });
  }
  // Dónde empezó el error: se sigue `uses` hacia atrás hasta una casilla incorrecta.
  function origin(g, key, seen) {
    const s = seen || new Set();
    if (s.has(key)) return null;
    s.add(key);
    const c = g.cells[key];
    if (!c) return null;
    if (c.state === 'wrong') return key;
    for (const u of c.uses) { const o = origin(g, u, s); if (o) return o; }
    return null;
  }

  function calcText(m, ans, g, key, lang, nota) {
    const c = g.cells[key];
    const f = (x) => fmt(lang, x);
    const L = (k) => `${keyLabel(k, lang, nota)} = ${f(usedVal(m, ans, k))}`;
    const fn = (op, ks) => (ks.length > 1 ? `${t(lang, `ex.${op}`)}(${ks.map(L).join(', ')})` : ks.length ? L(ks[0]) : '0');
    const [a] = key.split('.');
    const p = m.project;
    const act = p.activities.find((x) => x.id === a);
    const d = act ? act.d : 0;
    const nS = act ? (p.succs[a].length || 1) : 0;
    const u = c.uses;
    switch (c.formula) {
      case 'ES': case 'dur': return fn('max', u);
      case 'LF': return fn('min', u);
      case 'EF': return `${L(u[0])} + ${f(d)}`;
      case 'LS': return `${L(u[0])} − ${f(d)}`;
      case 'TF': case 'slack': return `${L(u[0])} − ${L(u[1])}`;
      case 'FF': return `${fn('min', u.slice(0, nS))} − ${L(u[nS])}`;
      case 'IF': return `${t(lang, 'ex.max')}(0, ${fn('min', u.slice(0, nS))} − ${fn('max', u.slice(nS))} − ${f(d)})`;
      case 'SF': return `${L(u[0])} − ${fn('max', u.slice(1))} − ${f(d)}`;
      case 'TE': case 'TL': {
        const n = Number(/^e(\d+)/.exec(key)[1]);
        const dd = Object.fromEntries(p.activities.map((x) => [x.id, x.d]));
        const E = m.sol.net.arcs.map((e) => ({ name: e.act, from: e.from, to: e.to, d: dd[e.act] }))
          .concat(m.sol.net.dummies.map((e) => ({ name: e.name, from: e.from, to: e.to, d: 0 })));
        const N = I.eventNotation(nota);
        const ev = (k, ff) => usedVal(m, ans, `e${k}.${ff}`);
        const wrap = (op, xs) => (xs.length > 1 ? `${t(lang, `ex.${op}`)}(${xs.join(', ')})` : xs[0]);
        if (c.formula === 'TE') {
          const inc = E.filter((e) => e.to === n);
          if (!inc.length) return '0';
          return `${wrap('max', inc.map((e) => `${N.TE}(${e.from}) + d(${e.name})`))} = ${wrap('max', inc.map((e) => `${f(ev(e.from, 'TE'))} + ${f(e.d)}`))}`;
        }
        const out = E.filter((e) => e.from === n);
        if (!out.length) return `${N.TE}(${n}) = ${f(ev(n, 'TE'))}`;
        return `${wrap('min', out.map((e) => `${N.TL}(${e.to}) − d(${e.name})`))} = ${wrap('min', out.map((e) => `${f(ev(e.to, 'TL'))} − ${f(e.d)}`))}`;
      }
      default: return f(c.expect);
    }
  }

  // La explicación de una casilla tras «Comprobar» o «Entregar» (AC6): '' si es correcta.
  function explain(m, ans, g, key, lang, nota) {
    const c = g.cells[key];
    if (!c || c.state === 'ok') return '';
    if (c.state === 'blank') return t(lang, 'ex.explain.blank');
    if (c.state === 'invalid') {
      const raw = key === 'dur' ? ans.dur : /^e\d+\./.test(key) ? ((ans.ev || {})[key.slice(1).split('.')[0]] || {})[key.split('.')[1]] : ((ans.act || {})[key.split('.')[0]] || {})[key.split('.')[1]];
      return t(lang, 'ex.explain.invalid', { v: String(raw == null ? '' : raw).trim() });
    }
    if (c.formula === 'crit') {
      const a = key.split('.')[0];
      const tf = I.notation(nota).TF;
      const v = fmt(lang, c.uses.length ? usedVal(m, ans, c.uses[0]) : m.sol.cpm.floats[a].TF);
      if (c.state === 'carried') return t(lang, 'ex.explain.critCarried', { a, tf, v });
      return t(lang, c.value ? 'ex.explain.critMarked' : 'ex.explain.critUnmarked', { a, tf, v });
    }
    const lab = keyLabel(key, lang, nota);
    const calc = calcText(m, ans, g, key, lang, nota);
    const o = c.state === 'carried' ? origin(g, key) : null;
    return t(lang, `ex.explain.${c.state}`, { v: fmt(lang, c.value), e: fmt(lang, c.expect), lab, calc,
      origin: o ? t(lang, 'ex.explain.origin', { lab: keyLabel(o, lang, nota) }) : '' });
  }

  function pathExplain(m, ans, i, g, lang) {
    const w = g.paths.written[i];
    const raw = String((ans.paths || [])[i] || '').trim();
    const acts = w.acts; const ps = acts.join('-');
    if (w.state === 'blank') return '';
    if (w.state === 'invalid') return t(lang, 'ex.explain.pathInvalid', { p: raw });
    if (w.state === 'ok') return t(lang, 'ex.explain.pathOk', { p: ps });
    if (w.state === 'carried') return t(lang, 'ex.explain.pathCarried', { p: ps });
    const before = g.paths.written.slice(0, i).map((x) => x.acts.join('-'));
    if (before.includes(ps)) return t(lang, 'ex.explain.pathRepeat', { p: ps });
    const p = m.project;
    for (let k = 1; k < acts.length; k++) if (!p.succs[acts[k - 1]].includes(acts[k])) return t(lang, 'ex.explain.pathNotDirect', { p: ps, a: acts[k - 1], b: acts[k] });
    if (p.preds[acts[0]].length) return t(lang, 'ex.explain.pathNotStart', { p: ps, a: acts[0] });
    if (p.succs[acts[acts.length - 1]].length) return t(lang, 'ex.explain.pathNotEnd', { p: ps });
    const d = Object.fromEntries(p.activities.map((x) => [x.id, x.d]));
    const len = acts.reduce((s, a) => s + d[a], 0);
    // Si dura lo que dice el alumno, falla porque pasa por una actividad que no marcó como crítica (T020).
    const unmarked = acts.find((a) => !(ans.crit || []).includes(a));
    if (Math.round(len * 100) === Math.round(usedVal(m, ans, 'dur') * 100) && unmarked) return t(lang, 'ex.explain.pathNotMarked', { p: ps, a: unmarked });
    return t(lang, 'ex.explain.pathLength', { p: ps, sum: acts.map((a) => fmt(lang, d[a])).join(' + '), len: fmt(lang, len), dur: fmt(lang, usedVal(m, ans, 'dur')) });
  }

  // ---------- Vista ----------

  function create(container, hooks) {
    const { h, clear } = root.PNL.dom;
    const AT = root.PNL.answerTable;
    const lang = () => hooks.lang();
    const tt = (k, p) => I.t(lang(), k, p);
    const numFmt = (v) => fmt(lang(), v);
    let m = null;                 // último modelo
    let exKey = null;             // ejercicio pintado (semilla, parámetros, lo que se pide, modo, entrega)
    let checked = null;           // Practicar: { grading } de la última comprobación (solo en la página, P7)
    let stale = false;            // se editó después de comprobar
    let selKey = null;            // casilla elegida (su explicación)
    let selAct = null;            // actividad o suceso resaltado en la red
    // En el móvil la red empieza plegada (tableros 47 y 48).
    let folded = !!(root.matchMedia && root.matchMedia('(max-width: 720px)').matches); let succ = false; let view = 'acts'; let arcs = false;
    let customOpen = false; let draft = null;
    // Campos de camino a la vista: el enlace no guarda los vacíos del final, así que «Añadir camino» vive en la página (T016).
    let pathFields = 1;
    let pending = null;           // acción que borraría las respuestas, a la espera de confirmación
    let confirmOpen = false;      // Examen: confirmación de «Entregar»
    let lay = { key: null, roy: null, pert: null };
    // F3c (T010): «Ver la tabla» abierta o cerrada (solo en la página) y si el enunciado ya estaba puesto.
    let tableOpen = false; let textOn = false;

    const state = () => hooks.state();
    const nota = () => state().nota;
    const vis = () => visibility(state());
    const grading = () => (m && m.grading ? m.grading : checked ? checked.grading : null);
    const marksOn = () => { const v = vis(); return v.marks === 'always' || (v.marks === 'checked' && !!checked && !stale); };
    const keyOf = (s) => JSON.stringify([s.sd, s.lv, s.gp, s.ask, s.xm, s.xd, s.gv]);

    // Un ejercicio nuevo (semilla, nivel, parámetros, lo que se pide o el modo): si hay respuestas, antes se confirma.
    function newExercise(action) {
      const s = state();
      const full = Object.assign({ type: 'ex', sd: s.sd, lv: s.lv, gp: s.gp, ask: s.ask, xm: s.xm }, action);
      if (hasAnswers(s) && !(s.xm === 'exam' && s.xd)) { pending = full; draw(); focus('exLoseYes'); return; }
      hooks.dispatch(full, { push: true });
    }
    const another = () => newExercise({ sd: hooks.newSeed() });

    function focus(id) { const el = root.document.getElementById(id); if (el) el.focus(); }
    function keepFocus(fn) {
      const a = root.document.activeElement;
      const id = a && container.contains(a) ? a.id : null;
      const pos = a && typeof a.selectionStart === 'number' ? a.selectionStart : null;
      fn();
      if (id) { const el = root.document.getElementById(id); if (el) { el.focus(); if (pos !== null && el.setSelectionRange) el.setSelectionRange(pos, pos); } }
    }

    // ---------- Respuestas ----------
    function setAns(next) {
      const wasMarked = marksOn();
      if (checked) stale = true;
      hooks.dispatch({ type: 'exAnswer', ans: forUrl(next) }, { fromEx: true });
      if (wasMarked) keepFocus(draw);
    }
    const onInput = (key, value) => setAns(setCell(m.ans, key, value));
    const onCrit = (id, on) => setAns(toggleCrit(m.ans, id, on));
    function onFocus(key) {
      selKey = key;
      const e = /^e(\d+)\./.exec(key);
      const next = e ? Number(e[1]) : key === 'dur' ? null : key.split('.')[0];
      if (next !== selAct) { selAct = next; markRows(); drawNet(); }
      drawExplain();
    }
    function onEnter(key) {
      const tbl = container.querySelector('table.ex-ans');
      const next = tbl && AT.below(tbl, key);
      if (next) next.focus();
    }

    function check() {
      checked = { grading: GR.grade(m.sol, m.ans, m.ask) };
      stale = false;
      keepFocus(draw);
      hooks.announce(`${scoreText(checked.grading, lang())}. ${countText(checked.grading, lang())}`);
    }
    function deliver() {
      confirmOpen = false;
      hooks.dispatch({ type: 'exDeliver' });
      focus('exStep');
      const g = grading();
      if (g) hooks.announce(`${scoreText(g, lang())}. ${countText(g, lang())}`);
    }

    // ---------- Piezas ----------
    const button = (label, onclick, o = {}) => h('button', Object.assign({ type: 'button', class: `ghost${o.primary ? ' primary' : ''}`, onclick }, o.attrs || {}), [label]);
    const seg = (items, label) => h('div', { class: 'seg', role: 'group', 'aria-label': label }, items.map(([text, on, fn, id]) => h('button', { type: 'button', 'aria-pressed': String(!!on), onclick: fn, id }, [text])));

    function bar() {
      const s = state();
      const prm = m.params;
      const levels = seg(['easy', 'medium', 'hard'].map((k) => [tt(`ex.levels.${k}`), s.lv === k && !customOpen, () => { customOpen = false; newExercise({ lv: k }); }, `exLv-${k}`])
        .concat([[tt('ex.levels.custom'), s.lv === 'custom' || customOpen, () => { customOpen = !customOpen; draft = draft || Object.assign({}, params(s)); draw(); if (customOpen) focus('exCustN0'); }, 'exLv-custom']]), tt('ex.level'));
      levels.querySelector('#exLv-custom').setAttribute('aria-expanded', String(customOpen));
      levels.querySelector('#exLv-custom').setAttribute('aria-controls', 'exCustom');
      const seedIn = h('input', { id: 'exSeed', type: 'text', inputmode: 'numeric', autocomplete: 'off', value: String(s.sd || ''), size: '7',
        onchange: (e) => { const v = Number(String(e.target.value).trim()); if (Number.isInteger(v) && v >= 1 && v <= SEED_MAX) newExercise({ sd: v }); else e.target.value = String(s.sd || ''); } });
      const row1 = h('div', { class: 'ex-row' }, [
        h('span', { class: 'ex-cap' }, [tt('ex.level')]), levels,
        h('span', { class: 'muted small ex-sum' }, [levelSummary(prm, lang())]),
        h('label', { class: 'ex-seed' }, [tt('ex.seed'), seedIn]),
        button(tt('ex.another'), another, { attrs: { id: 'exAnother' } }),
      ]);
      const ask = U.cleanAsk(s.ask) || U.DEFAULT_ASK;
      const asks = h('fieldset', { class: 'ex-ask' }, [h('legend', { class: 'ex-cap' }, [tt('ex.ask')])].concat(U.ASK.map((k) => {
        const off = k === 'sf' && !ask.includes('floats');
        return h('label', { class: off ? 'muted' : '' }, [h('input', { type: 'checkbox', id: `exAsk-${k}`, checked: ask.includes(k), disabled: off,
          onchange: (e) => { const next = U.ASK.filter((x) => (x === k ? e.target.checked : ask.includes(x))); const clean = U.cleanAsk(next); if (clean) newExercise({ ask: clean }); else e.target.checked = true; } }), ' ', tt(`ex.asks.${k}`)]);
      })));
      const row2 = h('div', { class: 'ex-row' }, [
        h('span', { class: 'ex-cap' }, [tt('ex.mode')]),
        seg([[tt('ex.practice'), s.xm !== 'exam', () => { if (s.xm === 'exam') newExercise({ xm: 'practice' }); }, 'exPractice'], [tt('ex.exam'), s.xm === 'exam', () => { if (s.xm !== 'exam') newExercise({ xm: 'exam' }); }, 'exExam']], tt('ex.mode')),
        h('span', { class: 'ex-sep', 'aria-hidden': 'true' }), asks,
      ]);
      // F3c (T010, tableros 60 y 61): dar el proyecto como enunciado; con «Personalizar», desactivado con su nota. Publicado
      // en T013 (textPublic); sin publicar, solo aparecería si el enlace ya lo pide.
      let row3 = null;
      if (api.textPublic || s.xt) {
        const custom = s.lv === 'custom';
        row3 = h('div', { class: 'ex-row ex-textrow' }, [
          h('label', { class: custom ? 'muted' : '' }, [h('input', { type: 'checkbox', id: 'exText', checked: !!s.xt && !custom, disabled: custom,
            'aria-describedby': custom ? 'exTextOff' : null, onchange: (e) => toggleText(e.target.checked) }), ' ', tt('ex.text.asText')]),
          custom ? h('p', { class: 'muted small', id: 'exTextOff' }, [tt('ex.text.customOff')]) : null]);
      }
      // Sin nombre propio: la vista entera ya es la región «Ejercicios» (axe, landmark-unique; T016).
      return h('section', { class: 'card ex-bar' }, [row1, row2, row3, customOpen ? customPanel() : null]);
    }

    function toggleText(on) {
      const go = () => hooks.dispatch({ type: 'exText', value: on ? 1 : 0 }, { push: true });
      if (on && hooks.need) hooks.need('sg').then(go); else go();
    }

    // F3c (T010): el enunciado de la tabla, con la tabla plegada en «Ver la tabla» (tablero 60).
    function textCard() {
      const def = m.text.def;
      const paras = SG().render(def, lang()).split('\n').filter(Boolean).map((x) => h('p', {}, [x]));
      const details = h('details', { class: 'ex-showtable', open: tableOpen || null, ontoggle: (e) => { tableOpen = e.target.open; } },
        [h('summary', {}, [tt('ex.text.showTable')]), givenCard()]);
      return h('section', { class: 'card ex-text-card', 'aria-labelledby': 'exTextHead' }, [
        h('h2', { id: 'exTextHead' }, [`${tt('ex.text.statement')} · ${def.title[lang()]}`]),
        h('div', { class: 'ex-text-body', tabindex: '0' }, paras), details]);
    }

    function customPanel() {
      const d = draft;
      const chk = GEN.check(d);
      const num = (id, val, set, o = {}) => h('input', { id, type: 'text', inputmode: o.dec ? 'decimal' : 'numeric', autocomplete: 'off', size: '4', value: o.dec ? fmt(lang(), val) : String(val),
        'aria-invalid': o.bad ? 'true' : null, 'aria-describedby': o.bad ? 'exCustIssue' : null, 'aria-label': o.label,
        onchange: (e) => { const v = Number(String(e.target.value).trim().replace(',', '.')); set(Number.isFinite(v) ? v : NaN); draw(); focus(id); } });
      const bad = (key) => chk.issues.some((i) => i.key === key);
      const field = (label, inputs, hint, o = {}) => h('div', { class: 'ex-field' }, [o.head || h('span', { class: 'ex-flabel' }, [label]), h('div', { class: 'ex-finputs' }, inputs), h('span', { class: 'muted small' }, [hint])]);
      const pairInputs = (key, base, label) => [tt('ex.custom.from'), ' ', num(`${base}0`, d[key][0], (v) => { d[key] = [v, d[key][1]]; }, { bad: bad(key), label: `${label}: ${tt('ex.custom.from')}` }),
        ' ', tt('ex.custom.to'), ' ', num(`${base}1`, d[key][1], (v) => { d[key] = [d[key][0], v]; }, { bad: bad(key), label: `${label}: ${tt('ex.custom.to')}` })];
      const dumOn = !!d.dummies;
      const dumHead = h('label', { class: 'ex-flabel' }, [h('input', { type: 'checkbox', id: 'exCustDum', checked: dumOn,
        onchange: (e) => { d.dummies = e.target.checked ? (GEN.LEVELS.medium.dummies.slice()) : null; draw(); focus('exCustDum'); } }), ' ', tt('ex.custom.dummies')]);
      const before = state().lv === 'custom' ? 'medium' : state().lv;
      const gen = () => { const c = GEN.check(d); if (!c.ok) return; customOpen = false; const gp = U.cleanGp(d); if (gp) newExercise({ lv: 'custom', gp }); };
      const issue = chk.ok ? null : h('p', { id: 'exCustIssue', class: 'ex-issue', role: 'alert' }, [AT.icon('invalid'), issueText(chk.issues[0], d, lang())]);
      return h('div', { id: 'exCustom', class: 'ex-custom', role: 'group', 'aria-label': tt('ex.custom.region') }, [
        h('div', { class: 'ex-fields' }, [
          field(tt('ex.custom.acts'), pairInputs('n', 'exCustN', tt('ex.custom.acts')), tt('ex.custom.hintActs')),
          field(tt('ex.custom.pred'), [num('exCustP', d.pred, (v) => { d.pred = Math.round(v * 10) / 10; }, { dec: true, bad: bad('pred'), label: tt('ex.custom.pred') })], tt('ex.custom.hintPred')),
          field('', dumOn ? pairInputs('dummies', 'exCustF', tt('ex.custom.dummies')) : [], tt('ex.custom.hintDummies'), { head: dumHead }),
          field(tt('ex.custom.crit'), pairInputs('critical', 'exCustC', tt('ex.custom.crit')), tt('ex.custom.hintCrit')),
          field(tt('ex.custom.dmax'), [num('exCustD', d.dmax, (v) => { d.dmax = v; }, { bad: bad('dmax'), label: tt('ex.custom.dmax') })], tt('ex.custom.hintDmax')),
          h('div', { class: 'ex-fbtns' }, [button(tt('ex.custom.generate'), gen, { primary: true, attrs: { id: 'exCustGo', disabled: !chk.ok } }),
            button(tt('ex.custom.back', { lv: tt(`ex.levels.${before}`) }), () => { customOpen = false; draft = null; if (state().lv === 'custom') newExercise({ lv: before }); else draw(); })]),
        ]), issue]);
    }

    function givenCard() {
      const ids = m.project.activities.map((a) => a.id);
      const d = Object.fromEntries(m.project.activities.map((a) => [a.id, a.d]));
      const links = (a) => (succ ? m.project.succs[a] : m.project.preds[a]).join(', ') || '—';
      const halves = ids.length > 7 ? 2 : 1;
      const per = Math.ceil(ids.length / halves);
      const tables = [];
      for (let k = 0; k < halves; k++) {
        tables.push(h('table', { class: 'data ex-given' }, [
          k === 0 ? h('caption', { class: 'sr-only' }, [tt('ex.given')]) : null,
          h('thead', {}, [h('tr', {}, [h('th', { scope: 'col' }, [tt('ex.act')]), h('th', { scope: 'col', class: 'd' }, [tt('ex.d')]), h('th', { scope: 'col' }, [succ ? tt('ex.succs') : tt('ex.preds')])])]),
          h('tbody', {}, ids.slice(k * per, (k + 1) * per).map((a) => h('tr', { class: selAct === a ? 'sel' : '', 'data-act': a }, [h('th', { scope: 'row' }, [a]), h('td', { class: 'd' }, [numFmt(d[a])]), h('td', {}, [links(a)])]))),
        ]));
      }
      return h('section', { class: 'card ex-given-card', 'aria-label': tt('ex.given') }, [
        h('div', { class: 'ex-head' }, [h('h2', {}, [tt('ex.given')]), seg([[tt('ex.preds'), !succ, () => { succ = false; draw(); }, 'exPreds'], [tt('ex.succs'), succ, () => { succ = true; draw(); }, 'exSuccs']], tt('ex.given'))]),
        h('div', { class: 'ex-halves' }, tables)]);
    }

    // La red (o la tabla de arcos) puede ser más ancha que su caja: la caja se alcanza con el teclado para desplazarla
    // (T018, axe scrollable-region-focusable). Sin role ni nombre propio: la tarjeta ya es la región con el título.
    const netHolder = h('div', { class: 'ex-net', id: 'exNet', tabindex: '0' });
    function netCard() {
      const pert = view === 'events';
      const title = pert ? tt('ex.pert') : tt('ex.roy');
      const fold = button(folded ? tt('ex.unfold') : tt('ex.fold'), () => { folded = !folded; draw(); focus('exFold'); }, { attrs: { id: 'exFold', 'aria-expanded': String(!folded), 'aria-controls': 'exNet' } });
      const foot = [];
      if (!folded && !pert) foot.push(h('p', { class: 'muted small' }, [tt('ex.royAlt')]));
      if (!folded && pert) foot.push(h('button', { type: 'button', class: 'linklike', id: 'exArcs', onclick: () => { arcs = !arcs; draw(); focus('exArcs'); } }, [arcs ? tt('ex.netLink') : tt('ex.arcLink')]));
      netHolder.hidden = folded;
      return h('section', { class: 'card ex-net-card', 'aria-label': title }, [h('div', { class: 'ex-head' }, [h('h2', {}, [title]), fold]), netHolder].concat(foot));
    }
    function drawNet() {
      if (!m || !m.sol || folded) return;
      const key = `${m.seed}|${JSON.stringify(m.params)}`;
      if (lay.key !== key) lay = { key, roy: root.PNL.layout.layout(m.sol.cpm, m.project), pert: root.PNL.aoaLayout.layout(m.sol.net) };
      const name = `${tt('ex.region')} · ${tt('ex.seed')} ${m.seed}`;
      if (view === 'events') {
        const sel = typeof selAct === 'number' ? selAct : null;
        const ctx = { net: m.sol.net, lay: lay.pert, revealed: new Map(), numFmt, lang: lang(), nota: nota(), numbered: true, name, fit: true, idPrefix: 'ex-pk',
          step: sel ? { event: sel } : null, selected: typeof selAct === 'string' ? selAct : null, geo: { colGap: 104, rowGap: 74 } };
        if (arcs) root.PNL.pertView.arcTable(netHolder, ctx); else root.PNL.pertView.render(netHolder, ctx);
        return;
      }
      root.PNL.royView.render(netHolder, { project: m.project, solution: m.sol.cpm, lay: lay.roy, step: null, revealed: new Map(), box: state().box, lang: lang(), nota: nota(),
        criticalOn: false, numFmt, name, selected: typeof selAct === 'string' ? selAct : null, selPrecs: [], fit: true, geo: { gx: 30, gy: 20 }, minWidth: 360,
        onSelect: (id) => { const first = container.querySelector(`tr[data-act="${id}"] input`); if (first) first.focus(); else { selAct = id; markRows(); drawNet(); } } });
    }
    function markRows() {
      for (const tr of container.querySelectorAll('tr[data-act]')) tr.classList.toggle('sel', tr.getAttribute('data-act') === selAct);
      for (const tr of container.querySelectorAll('tr[data-ev]')) tr.classList.toggle('sel', Number(tr.getAttribute('data-ev')) === selAct);
    }

    const explainBox = h('div', { class: 'ex-explain', id: 'exExplain', 'aria-live': 'polite' });
    function drawExplain() {
      clear(explainBox);
      const g = grading();
      if (!g || !marksOn() || !selKey) { explainBox.hidden = true; return; }
      let text = '';
      let state0 = null;
      const pm = /^path(\d+)$/.exec(selKey);
      if (pm && g.paths.written[Number(pm[1])]) { state0 = g.paths.written[Number(pm[1])].state; text = pathExplain(m, m.ans, Number(pm[1]), g, lang()); }
      else if (g.cells[selKey]) { state0 = g.cells[selKey].state; text = explain(m, m.ans, g, selKey, lang(), nota()); }
      if (!text) { explainBox.hidden = true; return; }
      explainBox.hidden = false;
      explainBox.className = `ex-explain st-${state0}`;
      const title = pm ? tt('ex.pathN', { n: Number(pm[1]) + 1 }) : keyLabel(selKey, lang(), nota());
      explainBox.appendChild(h('strong', {}, [`${tt(`ex.st.${state0}`)} · ${title}`]));
      explainBox.appendChild(h('p', {}, [text]));
    }

    function legend() {
      return h('ul', { class: 'ex-legend', 'aria-label': tt('ex.legend') }, ['ok', 'carried', 'wrong', 'blank', 'invalid'].map((s) => h('li', { class: `ex-chip st-${s}` }, [AT.icon(s), tt(`ex.st.${s}`)])));
    }

    function pathsBox(g, locked) {
      const n = Math.max(m.ans.paths.length, locked ? 1 : pathFields, 1);
      const paths = Array.from({ length: n }, (_, i) => m.ans.paths[i] || '');
      // Escribir en un campo vacío del final rellena con caminos vacíos los de antes (forUrl solo quita los del final).
      const upTo = (a, i) => { let out = a; while (out.paths.length < i) out = addPath(out); return out; };
      const rows = paths.map((p, i) => {
        const w0 = g && marksOn() && m.ans.paths.length ? g.paths.written[i] : null;
        const w = w0 && w0.state !== 'blank' ? w0 : null;      // un campo vacío no lleva marca (T020)
        const id = `exPath${i}`;
        const input = h('input', { type: 'text', id, autocomplete: 'off', spellcheck: 'false', class: 'mono', value: p, readonly: locked ? 'readonly' : null, maxlength: String(U.EX.path),
          'aria-describedby': w ? `${id}-m` : null,
          oninput: (e) => setAns(setPath(upTo(m.ans, i), i, e.target.value)), onfocus: () => { selKey = `path${i}`; drawExplain(); } });
        return h('div', { class: 'ex-path' }, [h('label', { for: id }, [tt('ex.pathN', { n: i + 1 })]),
          h('span', { class: `ex-cell ex-pcell${w ? ` st-${w.state}` : ''}` }, [input, w ? AT.mark(w.state, `${id}-m`, tt) : null]),
          locked ? null : h('button', { type: 'button', class: 'ghost ex-x', 'aria-label': tt('ex.removePath', { n: i + 1 }), onclick: () => {
            pathFields = Math.max(1, n - 1);
            if (i < m.ans.paths.length) setAns(removePath(m.ans, i));
            draw(); focus(`exPath${Math.min(i, pathFields - 1)}`);
          } }, ['×'])]);
      });
      return h('fieldset', { class: 'ex-paths' }, [h('legend', {}, [tt('ex.paths')]), locked || (g && marksOn()) ? null : h('p', { class: 'muted small' }, [tt('ex.pathsHelp')])].concat(rows)
        .concat(locked ? [] : [h('div', {}, [button(`+ ${tt('ex.addPath')}`, () => { pathFields = n + 1; draw(); focus(`exPath${n}`); },
          { attrs: { id: 'exAddPath', disabled: n >= U.EX.paths ? 'disabled' : null } })])]));
    }

    function answersCard() {
      const v = vis();
      const cols = columns(m.ask, nota());
      const hasActs = cols.act.length || cols.crit;
      if (!hasActs && cols.events) view = 'events';
      if (!cols.events) view = 'acts';
      const g = marksOn() ? grading() : null;
      const labelOf = (k) => keyLabel(k, lang(), nota());
      const common = { ans: m.ans, grading: g, locked: v.locked, selKey, labelOf, t: tt, onInput, onFocus, onEnter, numFmt };
      const table = view === 'events'
        ? AT.events(Object.assign({ events: m.sol.net.events.map((e) => e.n), cols, selEv: typeof selAct === 'number' ? selAct : null }, common))
        : AT.acts(Object.assign({ project: m.project, cols, sel: typeof selAct === 'string' ? selAct : null, onCrit }, common));
      const head = [h('h2', {}, [tt('ex.answers')])];
      if (g) head.push(h('p', { class: 'ex-score', role: 'status' }, [h('strong', {}, [scoreText(g, lang())]), ' ', h('span', { class: 'muted small' }, [countText(g, lang())])]));
      if (hasActs && cols.events) head.push(seg([[tt('ex.tabActs'), view === 'acts', () => { view = 'acts'; arcs = false; draw(); focus('exTabActs'); }, 'exTabActs'], [tt('ex.tabEvents'), view === 'events', () => { view = 'events'; draw(); focus('exTabEvents'); }, 'exTabEvents']], tt('ex.answers')));
      const side = [];
      if (g) side.push(legend());
      if (view === 'acts' && cols.dur) {
        const st = g && g.cells.dur ? g.cells.dur.state : null;
        side.push(h('div', { class: 'ex-dur' }, [h('label', { for: AT.cellId('dur') }, [tt('ex.projectDur')]), AT.cell({ key: 'dur', value: m.ans.dur, state: st, locked: v.locked, selected: selKey === 'dur',
          label: tt('ex.projectDur'), t: tt, onInput, onFocus, onEnter: () => {} })]));
      }
      if (view === 'acts' && cols.crit) side.push(pathsBox(g, v.locked));
      side.push(explainBox);
      if (stale && v.marks === 'checked') side.push(h('p', { class: 'banner small', role: 'status' }, [tt('ex.stale')]));
      if (confirmOpen && v.deliver) {
        side.push(h('div', { class: 'ex-confirm', role: 'alertdialog', 'aria-labelledby': 'exConfirmText' }, [h('p', { id: 'exConfirmText' }, [tt('ex.confirm', { n: blanks(m, m.ans, m.ask) })]),
          h('div', { class: 'ex-btns' }, [button(tt('ex.confirmYes'), deliver, { primary: true, attrs: { id: 'exConfirmYes' } }), button(tt('ex.confirmNo'), () => { confirmOpen = false; draw(); focus('exDeliver'); }, { attrs: { id: 'exConfirmNo' } })])]));
      }
      // Mientras se confirma la entrega, la pista de Intro se quita para que todo quepa a 1280×720 (T016).
      if (!v.locked && !g && !confirmOpen) side.push(h('p', { class: 'muted small' }, [tt('ex.enterHint')]));
      const actions = [];
      if (v.check) actions.push(button(tt('ex.check'), check, { primary: true, attrs: { id: 'exCheck' } }));
      if (v.deliver) actions.push(button(tt('ex.deliver'), () => { confirmOpen = true; draw(); focus('exConfirmYes'); }, { primary: true, attrs: { id: 'exDeliver' } }));
      if (v.step) actions.push(button(tt('ex.step'), () => hooks.open(stepState(state(), m, view)), { primary: v.locked, attrs: { id: 'exStep' } }));
      if (v.locked) actions.push(button(tt('ex.another'), another, { attrs: { id: 'exAnother2' } }));
      if (hooks.learn) actions.push(button(tt('learn.button'), () => hooks.learn(), { attrs: { id: 'exLearn' } }));
      const note = m.mode === 'exam' ? h('p', { class: 'muted small ex-note' }, [m.delivered ? tt('ex.delivered') : tt('ex.examNote')]) : null;
      return h('section', { class: 'card ex-answers', 'aria-label': tt('ex.answers') }, [
        h('div', { class: 'ex-head' }, head), note,
        h('div', { class: 'ex-body' }, [h('div', { class: 'ex-main' }, [h('div', { class: 'ex-table-box', tabindex: '0', role: 'region', 'aria-label': tt(view === 'events' ? 'ex.eventsCaption' : 'ex.tableCaption') }, [table]),
          h('div', { class: 'ex-btns' }, actions)]), h('div', { class: 'ex-side' }, side)])]);
    }

    function draw() {
      clear(container);
      if (!m) return;
      container.appendChild(bar());
      if (pending) {
        container.appendChild(h('div', { class: 'banner ex-lose', role: 'alertdialog', 'aria-labelledby': 'exLoseText' }, [h('span', { id: 'exLoseText' }, [tt('ex.lose')]),
          button(tt('ex.loseYes'), () => { const a = pending; pending = null; hooks.dispatch(a, { push: true }); }, { primary: true, attrs: { id: 'exLoseYes' } }),
          button(tt('ex.loseNo'), () => { pending = null; draw(); focus('exAnother'); }, { attrs: { id: 'exLoseNo' } })]));
      }
      if (m.oldVersion) container.appendChild(h('p', { class: 'banner', role: 'status' }, [tt('ex.oldVersion')]));
      if (!m.rows) {
        const text = m.notFound ? notFoundText(m.notFound, lang()) : m.issues.length ? issueText(m.issues[0], m.params, lang()) : '';
        if (text) container.appendChild(h('p', { class: 'banner', role: 'status' }, [text]));
        return;
      }
      if (m.textPending && hooks.need) hooks.need('sg').then(() => hooks.dispatch({ type: 'exText', value: 1 }));
      if (m.textFailed) container.appendChild(h('p', { class: 'banner', role: 'status' }, [tt('ex.text.none')]));
      const first = m.text ? textCard() : givenCard();
      container.appendChild(h('div', { class: 'ex-grid' }, [h('div', { class: 'ex-left' }, [first, netCard()]), answersCard()]));
      drawNet();
      drawExplain();
    }

    function render(model, opts) {
      m = model;
      const k = keyOf(state());
      if (k !== exKey) {
        // Otro ejercicio: lo que solo vivía en la página se olvida.
        exKey = k; checked = null; stale = false; selKey = null; selAct = null; confirmOpen = false; arcs = false; pending = null; pathFields = 1;
        if (state().lv !== 'custom') draft = null;
      }
      // Con el enunciado, la red y la tabla empiezan plegadas: las dos dejan ver las precedencias (decisión del autor, T008).
      const on = !!(m && m.text);
      if (on && !textOn) { folded = true; tableOpen = false; }
      textOn = on;
      if (opts && opts.fromEx) return;
      draw();
    }

    function debug() {
      return { seed: m && m.seed, rows: m && m.rows, params: m && m.params, ask: m && m.ask, ans: m && m.ans, grading: grading(), marks: marksOn(), stale, view, folded, selKey,
        text: !!(m && m.text), ctx: m && m.text ? m.text.ctx : null, tableOpen };
    }

    return { render, debug };
  }

  const api = { textPublic: true, ACT_F, EV_F, params, model, answersOf, levelSummary, issueText, notFoundText, columns, empty, setCell, toggleCrit, addPath, setPath, removePath,
    forUrl, hasAnswers, seedFrom, visibility, stepState, blanks, counts, scoreText, countText, usedVal, keyLabel, origin, explain, pathExplain, create };
  root.PNL = root.PNL || {};
  root.PNL.ex = api;
  if (isNode) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
