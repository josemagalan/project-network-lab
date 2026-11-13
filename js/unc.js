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
  const S = req('./core/sim.js', 'sim');
  const Tp = T;
  const NR = req('./narrate.js', 'narrate');

  const M6_READY = true;
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

  // ---------- M6: el TCL y sus trampas (parte pura) ----------

  // Deslizadores al abrir (tableros 64 y 65): la fusión con 4 caminos a 1 día, y los tres límites en su extremo.
  const UK_DEFAULT = { n: 4, s: 1, k: 1, w: 1, r: 0.9 };
  const SLIDERS = { n: { lo: 1, hi: 8, step: 1 }, s: { lo: 0, hi: 6, step: 0.5 }, k: { lo: 1, hi: 30, step: 1 }, w: { lo: 0, hi: 1, step: 0.05 }, r: { lo: 0, hi: 0.95, step: 0.05 } };
  const SEED_DEFAULT = 2026;   // sin «us» en el enlace, la misma simulación (reproducible); «Otra simulación» la cambia
  const BINS = 40;
  const ukOf = (state) => Object.assign({}, UK_DEFAULT, state.uk || {});
  const seedOf = (state) => (Number.isInteger(state.us) ? state.us : SEED_DEFAULT);
  const CASES = ['exam', 'merge', 'few', 'skew', 'corr', 'proj'];
  const SYNTHETIC = ['merge', 'few', 'skew', 'corr'];

  /** Plazo del cálculo: el del enlace o, si no hay, el del ejemplo; en la tabla propia, μ + σ del camino redondeado arriba. */
  function deadlineOf(state, m) {
    if (typeof state.ud === 'number') return state.ud;
    if (m.src.expected && typeof m.src.expected.deadline === 'number') return m.src.expected.deadline;
    return m.exam ? Math.ceil(m.exam.mu + m.exam.sd) : 0;
  }

  /** El cálculo de examen de M6: plazo → P o, con «up», probabilidad → plazo. */
  function examOf(state, m) {
    if (!m.model) return null;
    const inverse = typeof state.up === 'number';
    const q = inverse ? { prob: state.up } : { deadline: deadlineOf(state, m) };
    const r = L.exam(m.model, q);
    const all = L.paths(m.model, inverse ? r.deadline : q.deadline);
    // El casi crítico: el camino de más media que no es crítico (para la nota del primer paso).
    const crit = new Set([r.path].concat(r.ties.map((x) => x.acts)).map((p) => p.join('|')));
    const near = all.list.filter((p) => !crit.has(p.acts.join('|'))).sort((x, y) => y.mu - x.mu)[0] || null;
    return Object.assign({ inverse, near, terms: r.path.map((id) => L.moments(m.model.acts.find((a) => a.id === id).dist)) }, r);
  }

  /**
   * Lo que se simula en un caso de M6 (sin DOM; la vista lo corre a trozos y las pruebas, de una vez en Node):
   * { key, kind, model, n, us, normal: { mu, var }, deadline, exact?, info }. null en el cálculo de examen o sin tabla.
   */
  function simSpec(state, m) {
    const ux = state.ux; const us = seedOf(state); const n = S.DEFAULT_N;
    let spec = null;
    if (SYNTHETIC.includes(ux)) {
      const uk = ukOf(state);
      const c = ux === 'merge' ? L.cases.merge({ n: uk.n, slack: uk.s }) : ux === 'few' ? L.cases.few({ k: uk.k })
        : ux === 'skew' ? L.cases.skew({ s: uk.w }) : L.cases.corr({ rho: uk.r });
      spec = { kind: 'paths', model: { paths: c.paths }, normal: c.normal, deadline: c.deadline, exact: ux === 'merge' ? c.exact : null,
        info: ux === 'merge' ? { n: uk.n, slack: uk.s, mu: L.cases.MERGE.mu, var: L.cases.MERGE.var } : { k: c.k, terna: c.terna, rho: ux === 'corr' ? uk.r : 0 } };
    } else if (ux === 'proj' && m.model) {
      const T = deadlineOf(state, m);
      const r = L.exam(m.model, { deadline: T });
      const all = L.paths(m.model, T);
      spec = { kind: 'project', model: L.simModel(m.model), normal: { mu: r.mu, var: r.var }, deadline: T,
        exact: all.independent && m.src.m6only ? all.product : null, info: { paths: all, exam: r } };
    }
    if (!spec) return null;
    spec.n = n; spec.us = us;
    spec.key = JSON.stringify([ux, spec.kind, spec.model, n, us]);
    return spec;
  }

  /** Resumen de una simulación terminada frente a su normal (lo que se pinta y se compara con Node: la huella). */
  function simSummary(spec, durations) {
    const su = S.summary(durations);
    const sd = Math.sqrt(spec.normal.var);
    const T = spec.deadline;
    const pn = sd > 0 ? Tp.phi((T - spec.normal.mu) / sd) : (T >= spec.normal.mu ? 1 : 0);
    return { n: su.n, mean: su.mean, sd: su.sd, min: su.min, max: su.max, ps: su.pLE(T), pn, hist: su.hist(BINS), ks: sd > 0 ? su.ks(spec.normal.mu, sd) : null };
  }

  // ---------- Paso a paso con predicción (T011) ----------

  /**
   * Los pasos que recorre el reproductor de app con «uw» (P10): en M5, la media y la varianza de examen de cada
   * actividad, en el orden de la tabla; en M6, el cálculo de examen (core/tcl.trace). Cada valor va en «reveals», con
   * su actividad (en M6, «P», el camino), para la predicción de siempre (predict.check), y la alternativa de tabla en «alt».
   * Sin «uw», sin tabla o en un caso simulado de M6: null.
   */
  function trace(state, m) {
    if (!state.uw || !m || !m.model) return null;
    if (state.um === 'm6') {
      if (state.ux !== 'exam') return null;
      const e = examOf(state, m);
      return L.trace(m.model, e.inverse ? { prob: e.prob } : { deadline: e.deadline }).map((st) => Object.assign({}, st, {
        res: e, reveals: st.values.map((v) => Object.assign({ act: 'P', field: v.field, value: v.value }, v.alt != null ? { alt: v.alt } : {})) }));
    }
    return [].concat(...m.acts.filter((a) => a.stats).map((a) => T.trace(a.dist).map((st) => Object.assign({}, st, {
      act: a.id, reveals: st.values.map((v) => ({ act: a.id, field: v.field, value: v.value })) }))));
  }

  // Igual que la pantalla y predict: dos decimales.
  const same2 = (x, y) => Math.abs(Math.round(x * 100) - Math.round(y * 100)) < 0.5;
  /**
   * Pista para un valor equivocado del paso a paso: el error típico que explica el número escrito, o null.
   * sd (la desviación en lugar de la varianza), pertVar (la varianza de la curva beta-PERT, no la fórmula), triMean (la
   * media de la triangular), sumSd (la suma de las desviaciones), divVar (dividir por σ² en lugar de σ), otherTail (la
   * otra cola: 1 − P).
   */
  function hint(step, answer, m) {
    const p = parseNum(answer);
    if (p.error || !step || !step.reveals || !step.reveals.length) return null;
    const x = p.value; const rv = step.reveals[0];
    if (same2(x, rv.value) || (rv.alt != null && same2(x, rv.alt))) return null;
    if (step.kind === 'unc.mean' || step.kind === 'unc.var') {
      const a = m.acts.find((q) => q.id === step.act);
      if (!a || !a.stats) return null;
      if (step.kind === 'unc.mean') return same2(x, a.stats.tri.mean) ? 'triMean' : null;
      if (same2(x, Math.sqrt(a.stats.exam.var))) return 'sd';
      return same2(x, a.stats.pert.var) ? 'pertVar' : null;
    }
    const e = step.res;
    if (!e) return null;
    if (step.kind === 'tcl.var') return same2(x, e.terms.reduce((t, q) => t + Math.sqrt(q.var), 0)) ? 'sumSd' : null;
    if (step.kind === 'tcl.z' && e.var > 0) return same2(x, (e.deadline - e.mu) / e.var) ? 'divVar' : null;
    if (step.kind === 'tcl.p') return same2(x, 1 - e.exact) || same2(x, 1 - e.table.p4) ? 'otherTail' : null;
    return null;
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
      const synthetic = s.um === 'm6' && SYNTHETIC.includes(s.ux);
      const rows = [h('div', { class: 'unc-row' }, [
        sections,
        synthetic ? h('span', { class: 'unc-field muted', id: 'uncSynthetic' }, [tu('synthetic')]) : h('label', { class: 'unc-field' }, [tu('project'), ' ', sel]),
        button(tu('fromWork'), fromWork, { id: 'uncFromWork' }),
      ].concat([h('span', { class: 'unc-push' })], walkControls(), [learnButton()]))];
      if (s.um === 'm6') rows.push(m6Controls());
      return h('div', { class: 'card unc-bar' }, rows);
    }
    // «Paso a paso» (T011): en M5 y en el cálculo de examen de M6, con la casilla de la predicción.
    function walkControls() {
      const s = state();
      if (!m || !m.model || (s.um === 'm6' && s.ux !== 'exam')) return [];
      const on = !!s.uw;
      const out = [seg([[tu('walk.toggle'), on, () => { go({ uw: on ? 0 : 1 }); focus('uncWalk'); }, 'uncWalk']], tu('walk.toggle'))];
      if (on) out.push(h('label', { class: 'unc-check' }, [h('input', { type: 'checkbox', id: 'uncPred', checked: !!s.pred,
        onchange: (e) => { hooks.dispatch({ type: 'set', key: 'pred', value: e.target.checked ? 1 : 0 }); focus('uncPred'); } }), ' ', t('predict.toggle')]));
      return out;
    }
    // «Aprende más» del apartado (T012), en el diálogo de la página; su texto se carga al abrirlo.
    function learnButton() {
      return h('button', { type: 'button', class: 'ghost', id: 'uncLearn', onclick: () => hooks.learn(state().um) }, [t('learn.button')]);
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
    function drawCurves(holder, act, uc, show) {
      const sh = show || { mean: true, sd: true };
      const d = act.dist; const st = act.stats; const L5 = lab();
      const fixed = !(d.b > d.a);
      const pad = fixed ? Math.max(1, d.a * 0.2) : (d.b - d.a) * 0.06;
      const lo = Math.max(0, d.a - pad); const hi = d.b + pad;
      const kinds = fixed ? [] : ['pert', 'tri'].concat(uc ? ['classic'] : []);
      const curves = kinds.map((k) => ({ pts: curvePts(k, d, k === 'tri' ? 2 : 160), cls: `c-${k}`, dash: k === 'tri' ? '6 4' : k === 'classic' ? '2 3' : null }));
      const ymax = fixed ? 1 : Math.max(...curves.map((c) => Math.max(...c.pts.map((p) => p[1])))) * 1.12;
      const vlines = sh.mean ? [{ x: st.exam.mean, cls: 'v-mean', label: `${L5.mean} ${num(st.exam.mean)}` }] : [];
      if (!fixed && sh.sd) { const sd = Math.sqrt(st.pert.var); vlines.push({ x: st.pert.mean - sd, cls: 'v-sd', dash: '3 3' }, { x: st.pert.mean + sd, cls: 'v-sd', dash: '3 3' }); }
      const list = kinds.map((k) => tu(`legend.${k}`)).join(', ');
      DC.render(holder, { w: 600, h: 240, x: [lo, hi], ymax, ticks: niceTicks(lo, hi, 6), fmt: num, curves, vlines,
        label: tu('chartLabel', { id: act.id, a: num(d.a), b: num(d.b), list: list || '—', mean: sh.mean ? num(st.exam.mean) : '…' }) });
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
      })])).concat(['mean', 'var'].map((k) => h('td', { class: 'num', 'data-out': k }, [ownStat(r, k)]))).concat([h('td', {}, [h('button', { type: 'button', class: 'ghost small-btn', id: `uncDel-${i}`, 'aria-label': tu('removeRow', { n: i + 1 }),
        onclick: () => { commit(readOwn().filter((_, j) => j !== i)); focus(i > 0 ? `uncDel-${i - 1}` : 'uncAdd'); } }, ['×'])])])));
      const head = h('tr', {}, cols.map(([, label]) => h('th', { scope: 'col' }, [label])).concat([L5.mean, L5.var].map((label) => h('th', { scope: 'col' }, [label])))
        .concat([h('th', { scope: 'col' }, [h('span', { class: 'sr-only' }, [tu('removeRow', { n: '' }).trim()])])]));
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
    // μ y σ² de examen de una fila de la tabla propia (T015); «—» mientras haya errores o si la fila no tiene actividad.
    function ownStat(r, k) {
      const a = m.model && !m.issues.length ? m.acts.find((x) => x.id === str(r.id).trim()) : null;
      return a ? num(a[k]) : '—';
    }
    function markOwn() {
      const bad = badMap();
      for (const tr of container.querySelectorAll('#uncOwn tbody tr')) {
        const i = Number(tr.getAttribute('data-row'));
        tr.classList.toggle('bad', bad.has(i));
        for (const inp of tr.querySelectorAll('input[data-f]')) inp.setAttribute('aria-invalid', String((bad.get(i) || []).includes(inp.getAttribute('data-f'))));
        for (const td of tr.querySelectorAll('td[data-out]')) td.textContent = ownStat(m.src.rows[i] || {}, td.getAttribute('data-out'));
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

    // ---------- M6: el TCL y sus trampas ----------
    const loc = () => (lang() === 'en' ? 'en-GB' : 'es-ES');
    // Cifras con k decimales fijos, con la coma del español (las probabilidades y la tabla, como en los apuntes).
    const fx = (v, k) => { const x = Number(v).toFixed(k); return lang() === 'en' ? x : x.replace('.', ','); };
    const big = (n) => Number(n).toLocaleString(loc());
    const pathText = (acts) => acts.join('–');
    const unitOf = () => (SYNTHETIC.includes(state().ux) ? tu('merge.unit') : m.src.unit);
    const normalPts = (mu, v, lo, hi, n) => {
      const sd = Math.sqrt(v);
      return Array.from({ length: n + 1 }, (_, i) => { const x = lo + ((hi - lo) * i) / n; return [x, Math.exp(-0.5 * ((x - mu) / sd) ** 2) / (sd * Math.sqrt(2 * Math.PI))]; });
    };
    let binsOpen = false;
    let sim = { key: null, spec: null, job: null, durations: null, timer: null };
    function cancelSim() { if (sim.timer) root.clearTimeout(sim.timer); sim = { key: null, spec: null, job: null, durations: null, timer: null }; }
    // La simulación va a trozos de unos 12 ms en el hilo principal (P6), tras un retardo corto para no relanzarla en cada tecla.
    function ensureSim(spec) {
      if (!spec) { cancelSim(); return; }
      if (sim.key === spec.key) { sim.spec = spec; return; }
      cancelSim();
      const key = spec.key;
      sim = { key, spec, job: null, durations: null, timer: null };
      if (hooks.announce) hooks.announce(tu('sim.running', { n: big(spec.n) }));
      const tick = () => {
        if (sim.key !== key) return;
        if (!sim.job) sim.job = S.start({ kind: spec.kind, model: spec.model, n: spec.n, us: spec.us });
        const r = S.step(sim.job, { ms: 12 });
        if (!r.done) { sim.timer = root.setTimeout(tick, 0); return; }
        sim.durations = S.result(sim.job).durations; sim.job = null; sim.timer = null;
        keepFocus(drawMain);
        const su = simSummary(sim.spec, sim.durations);
        if (hooks.announce) hooks.announce(tu('sim.done', { T: num(sim.spec.deadline), ps: fx(su.ps, 3) }));
      };
      sim.timer = root.setTimeout(tick, 120);
    }

    // Segunda fila de la barra en M6: los casos y los controles del caso elegido.
    function m6Controls() {
      const s = state();
      const cases = seg(CASES.map((c) => [tu(`cases.${c}`), s.ux === c, () => go({ ux: c }), `uncCase-${c}`]), tu('cases.label'));
      const row = [cases];
      if (s.ux === 'exam') row.push(askControls());
      else if (s.ux === 'proj') row.push(deadlineField(), againButton());
      else row.push(...sliderControls(), againButton());
      return h('div', { class: 'unc-row unc-cases' }, row);
    }
    function askControls() {
      const s = state(); const inverse = typeof s.up === 'number';
      const radios = h('fieldset', { class: 'unc-mode' }, [h('legend', {}, [tu('ask.legend')])].concat([['p', !inverse], ['t', inverse]].map(([k, on]) => h('label', {}, [
        h('input', { type: 'radio', name: 'uncAsk', id: `uncAsk-${k}`, value: k, checked: on,
          onchange: () => { go(k === 'p' ? { up: null } : { up: typeof s.up === 'number' ? s.up : 0.95 }); focus(`uncAsk-${k}`); } }), ' ', tu(`ask.${k}`)]))));
      return h('div', { class: 'unc-row' }, [radios, inverse ? probField() : deadlineField()]);
    }
    function numField(id, label, value, unit, ok, bad, commit) {
      const err = h('span', { class: 'unc-err small', id: `${id}Err`, hidden: true }, [bad]);
      const input = h('input', { id, value: value == null ? '' : num(value), size: '6', inputmode: 'decimal', 'aria-describedby': `${id}Err`,
        onchange: (e) => {
          const p = parseNum(e.target.value);
          const v = p.error ? NaN : p.value;
          if (!ok(v)) { e.target.setAttribute('aria-invalid', 'true'); err.hidden = false; return; }
          e.target.setAttribute('aria-invalid', 'false'); err.hidden = true; commit(v);
        } });
      return h('span', { class: 'unc-field' }, [h('label', { for: id }, [label]), input, unit ? h('span', { class: 'muted' }, [unit]) : null, err]);
    }
    function deadlineField() {
      return numField('uncDeadline', tu('ask.deadline'), m.model ? deadlineOf(state(), m) : null, m.src.unit, (v) => v >= 0 && v <= 999999, tu('ask.badDeadline'), (v) => go({ ud: v }));
    }
    function probField() {
      return numField('uncProb', tu('ask.prob'), state().up, '', (v) => v > 0 && v < 1, tu('ask.badProb'), (v) => go({ up: v }));
    }
    function againButton() {
      return h('span', { class: 'unc-field' }, [button(tu('sim.again'), () => { go({ us: hooks.newSeed() }); focus('uncAgain'); }, { id: 'uncAgain' }),
        h('span', { class: 'muted small', id: 'uncSeed' }, [tu('sim.seed', { us: seedOf(state()) })])]);
    }
    function sliderControls() {
      const s = state(); const uk = ukOf(s);
      const keys = s.ux === 'merge' ? ['n', 's'] : s.ux === 'few' ? ['k'] : s.ux === 'skew' ? ['w'] : ['r'];
      return keys.map((k) => {
        const d = SLIDERS[k];
        const label = k === 'n' || k === 's' ? tu(`merge.${k}`) : tu(`lim.${k}`);
        const show = (v) => (k === 'w' || k === 'r' ? fx(v, 2) : num(v));
        const out = h('output', { id: `uncOut-${k}`, for: `uncK-${k}` }, [show(uk[k])]);
        const input = h('input', { type: 'range', id: `uncK-${k}`, min: String(d.lo), max: String(d.hi), step: String(d.step), value: String(uk[k]), 'aria-label': label,
          oninput: (e) => { out.textContent = show(Number(e.target.value)); },
          onchange: (e) => { go({ uk: Object.assign({}, s.uk || {}, { [k]: Number(e.target.value) }) }); focus(`uncK-${k}`); } });
        return h('label', { class: 'unc-kslider' }, [h('span', {}, [label]), input, out, h('span', { class: 'muted small', 'aria-hidden': 'true' }, [`${show(d.lo)}–${show(d.hi)}`])]);
      });
    }

    // Cálculo de examen: los pasos (la predicción llega con T011) y la normal del camino crítico.
    function examSteps(e) {
      const unit = unitOf();
      const steps = [];
      const near = e.near && !e.ties.length ? ` ${tu('exam.near', { path: pathText(e.near.acts), mu: num(e.near.mu) })}` : '';
      const ties = e.ties.length ? ` ${tu('exam.ties', { list: I.list(lang(), e.ties.map((x) => tu('exam.tie', { path: pathText(x.acts), var: fx(x.var, 2) }))) })}` : '';
      steps.push([tu('exam.path'), (unit ? tu('exam.pathText', { path: pathText(e.path), mu: fx(e.mu, 2), unit }) : tu('exam.pathTextNoUnit', { path: pathText(e.path), mu: fx(e.mu, 2) })) + near + ties]);
      steps.push([tu('exam.mu'), `${e.terms.map((x) => fx(x.mean, 2)).join(' + ')} = ${fx(e.mu, 2)}`]);
      steps.push([tu('exam.var'), `${e.terms.map((x) => fx(x.var, 2)).join(' + ')} = ${fx(e.var, 2)}`]);
      if (e.degenerate) {
        steps.push([tu('exam.degenerate'), e.inverse ? tu('exam.degT', { mu: num(e.mu) }) : tu('exam.degP', { mu: num(e.mu), T: num(e.deadline), p: num(e.exact) })]);
      } else if (e.inverse) {
        steps.push([tu('exam.zFor', { p: num(e.prob) }), tu('exam.zForText', { p: num(e.prob), z: fx(e.z, 4), z2: fx(e.table.z2, 2) })]);
        steps.push([tu('exam.T'), tu('exam.TText', { mu: fx(e.mu, 2), z2: fx(e.table.z2, 2), var: fx(e.var, 2), Tt: fx(e.table.deadline, 2), T: fx(e.deadline, 2) })]);
      } else {
        steps.push([tu('exam.z'), tu('exam.zText', { T: num(e.deadline), mu: fx(e.mu, 2), var: fx(e.var, 2), z: fx(e.z, 4), z2: fx(e.table.z2, 2) })]);
        steps.push([tu('exam.p', { T: num(e.deadline) }), tu('exam.pText', { z2: fx(e.table.z2, 2), p4: fx(e.table.p4, 4), exact: fx(e.exact, 4) })]);
      }
      return steps;
    }
    function examCard(e) {
      const steps = examSteps(e);
      const tr = m.trace;
      if (!tr) {
        return h('section', { class: 'card unc-examcard', 'aria-labelledby': 'uncExamHead' }, [h('h2', { id: 'uncExamHead' }, [tu('exam.title')]),
          h('ol', { class: 'unc-steps', id: 'uncSteps' }, steps.map(([title, text]) => h('li', {}, [h('strong', {}, [title]), h('span', {}, [text])])))]);
      }
      // Paso a paso (T011): los pasos hasta el actual; el actual, oculto mientras se predice.
      const k = Math.min(state().step, tr.length - 1);
      const items = steps.slice(0, k + 1).map(([title, text], i) => {
        const cur = i === k;
        const hide = cur && hooks.predicting(tr[i]);
        return h('li', { class: cur ? 'cur' : '', 'aria-current': cur ? 'step' : null }, [h('strong', {}, [title]),
          h('span', { class: hide ? 'muted' : '' }, [hide ? tu('walk.yours') : text]), cur ? predictBox(tr[i]) : null]);
      });
      return h('section', { class: 'card unc-examcard', 'aria-labelledby': 'uncExamHead' }, [h('h2', { id: 'uncExamHead' }, [tu('walk.examHead', { i: k + 1, n: tr.length })]),
        h('ol', { class: 'unc-steps', id: 'uncSteps' }, items), walkNav(tr, k)]);
    }

    // ---------- Paso a paso (T011) ----------
    const PRm = () => root.PNL.predict;
    let lastWalk = null;
    function stepTitleText(step) {
      if (step.kind === 'unc.mean' || step.kind === 'unc.var') {
        const a = m.acts.find((q) => q.id === step.act); const d = a.dist; const L5 = lab();
        const p = Object.assign({ id: a.id, va: num(d.a), vm: num(d.m), vb: num(d.b), v: fx(step.reveals[0].value, 2) }, L5);
        return step.kind === 'unc.mean' ? [tu('walk.mean', p), tu('walk.meanText', p)] : [tu('walk.var', p), tu('walk.varText', p)];
      }
      const steps = examSteps(step.res);
      return steps[m.trace.indexOf(step)] || ['', ''];
    }
    // La casilla de predicción del paso actual, o lo que dijo la comprobación.
    function predictBox(step) {
      if (!step.reveals || !step.reveals.length || !state().pred) return null;
      const pred = hooks.pred(); const rv = step.reveals[0]; const key = PRm().key(rv);
      const hide = hooks.predicting(step);
      const checked = pred.done && pred.step === state().step;
      const field = rv.field.slice(4);
      const label = tu(`walk.field.${field}`, Object.assign({ id: step.act }, lab()));
      if (hide) {
        const msg = h('p', { class: 'small unc-err', id: 'uncPredEmpty', hidden: true }, [tu('walk.empty')]);
        const check = () => {
          const v = String(pred.answers.get(key) || '').trim();
          if (!v) { msg.hidden = false; focus('uncPredIn'); return; }
          hooks.predCheck(step);
          focus('uncPredFb');
        };
        const input = h('input', { id: 'uncPredIn', value: pred.answers.get(key) || '', size: '7', inputmode: 'decimal', 'aria-describedby': 'uncPredEmpty',
          oninput: (e) => { pred.answers.set(key, e.target.value); },
          onkeydown: (e) => { if (e.key === 'Enter') { e.preventDefault(); check(); } } });
        return h('div', { class: 'unc-predict' }, [h('div', { class: 'unc-row' }, [h('label', { for: 'uncPredIn' }, [label]), input,
          h('button', { type: 'button', class: 'primary', id: 'uncPredCheck', onclick: check }, [t('predict.check')]),
          button(t('predict.show'), () => { hooks.predShow(); focus('uncNext'); }, { id: 'uncPredShow' })]), msg]);
      }
      if (!checked || !pred.result) return null;
      const res = pred.result.get(key);
      const given = pred.answers.get(key);
      const parts = [h('strong', {}, [tu(res === 'ok' ? 'walk.ok' : 'walk.wrong')]), ' '];
      if (res !== 'ok') {
        parts.push(rv.alt != null ? tu('walk.answerAlt', { t: fx(rv.alt, rv.field === 'unc.p' ? 4 : 2), v: fx(rv.value, rv.field === 'unc.p' || rv.field === 'unc.z' ? 4 : 2) }) : tu('walk.answer', { v: fx(rv.value, 2) }), ' ');
        const hk = hint(step, given, m);
        if (hk) {
          const a = m.acts.find((q) => q.id === step.act);
          parts.push(tu(`walk.hint.${hk}`, Object.assign({ x: String(given).trim(), v: a && a.stats ? fx(a.stats.pert.var, 2) : '' }, lab())));
        }
      }
      return h('p', { class: `unc-fb ${res === 'ok' ? 'ok' : 'wrong'}`, id: 'uncPredFb', tabindex: '-1', role: 'status' }, parts);
    }
    function walkNav(tr, k) {
      const hide = hooks.predicting(tr[k]);
      const step = tr[k]; const [title, text] = stepTitleText(step);
      const wkey = `${m.src.id}|${lang()}|${k}|${tr.length}|${hide}`;
      if (wkey !== lastWalk) { lastWalk = wkey; if (hooks.announce) hooks.announce(`${t('player.counter', { i: k + 1, n: tr.length })}. ${title}. ${hide ? t('predict.hidden') : text}`); }
      return h('div', { class: 'unc-row unc-walknav' }, [
        h('button', { type: 'button', class: 'ghost', id: 'uncPrev', disabled: k === 0, onclick: () => { hooks.dispatch({ type: 'prev' }); focus('uncPrev'); } }, [`← ${t('player.prev')}`]),
        h('button', { type: 'button', class: 'ghost', id: 'uncNext', disabled: k >= tr.length - 1 || hide, onclick: () => { hooks.dispatch({ type: 'next' }); focus(hooks.predicting(m.trace[Math.min(state().step, m.trace.length - 1)]) ? 'uncPredIn' : 'uncNext'); } }, [`${t('player.next')} →`]),
        hide ? h('span', { class: 'muted small' }, [t('predict.hidden')]) : null]);
    }
    // M5 paso a paso: la actividad del paso, con su media y su varianza, y su curva al lado.
    function walkCard() {
      const tr = m.trace; const k = Math.min(state().step, tr.length - 1); const step = tr[k];
      const a = m.acts.find((q) => q.id === step.act); const d = a.dist; const L5 = lab();
      const iMean = tr.findIndex((x) => x.act === a.id && x.kind === 'unc.mean'); const iVar = iMean + 1;
      const shown = (i) => i < k || (i === k && !hooks.predicting(tr[i]));
      const item = (i) => {
        const [title, text] = stepTitleText(tr[i]);
        const cur = i === k;
        if (i > k) return h('li', { class: 'later muted' }, [h('strong', {}, [title])]);
        return h('li', { class: cur ? 'cur' : '', 'aria-current': cur ? 'step' : null }, [h('strong', {}, [title]),
          h('span', { class: shown(i) ? '' : 'muted' }, [shown(i) ? text : tu('walk.yours')]), cur ? predictBox(tr[i]) : null]);
      };
      const next = tr[iVar + 1];
      const head = tu(a.name ? 'walk.headName' : 'walk.head', { i: k + 1, n: tr.length, id: a.id, name: a.name });
      const terna = tu('walk.terna', Object.assign({ va: num(d.a), vm: num(d.m), vb: num(d.b) }, L5));
      const list = h('ol', { class: 'unc-steps', id: 'uncSteps' }, [item(iMean), item(iVar)]);
      const card = h('section', { class: 'card unc-examcard unc-walk', 'aria-labelledby': 'uncWalkHead' }, [h('h2', { id: 'uncWalkHead' }, [`${head} ${terna}`]), list,
        h('p', { class: 'muted small' }, [next ? tu('walk.nextAct', { id: next.act }) : tu('walk.last')]), walkNav(tr, k)]);
      const holder = h('div', { class: 'unc-chart', id: 'uncChart' });
      const chart = h('section', { class: 'card unc-act', 'aria-labelledby': 'uncWalkChartHead' }, [h('h2', { id: 'uncWalkChartHead' }, [tu('walk.chartTitle', { id: a.id })]), holder,
        legend(false), state().pred ? h('p', { class: 'muted small' }, [tu('walk.note')]) : null]);
      drawCurves(holder, a, false, { mean: shown(iMean), sd: shown(iVar) });
      return [card, chart];
    }
    function examChartCard(e) {
      // Paso a paso con predicción: las cifras del gráfico salen cuando su paso está a la vista (T011).
      const tr = m.trace; const k = tr ? Math.min(state().step, tr.length - 1) : 0;
      const seen = (i) => !tr || !state().pred || i < k || (i === k && !hooks.predicting(tr[k]));
      const all = seen(tr ? tr.length - 1 : 0);
      const holder = h('div', { class: 'unc-chart', id: 'uncNormal' });
      const parts = [h('h2', { id: 'uncNormalHead' }, [seen(2) ? tu('exam.chartTitle', { mu: fx(e.mu, 2), var: fx(e.var, 2) }) : tu('sim.legendNormal')]), holder];
      const T = e.deadline;
      if (!all && e.inverse) {
        if (!e.degenerate) {
          const lo = Math.max(0, e.mu - 4 * e.sd); const hi = e.mu + 4 * e.sd; const pts = normalPts(e.mu, e.var, lo, hi, 160);
          DC.render(holder, { w: 600, h: 260, x: [lo, hi], ymax: Math.max(...pts.map((q) => q[1])) * 1.12, ticks: niceTicks(lo, hi, 8), fmt: num,
            curves: [{ pts, cls: 'c-normal' }], vlines: [], label: tu('sim.legendNormal') });
        }
        return h('section', { class: 'card unc-normalcard', 'aria-labelledby': 'uncNormalHead' }, parts);
      }
      if (!e.degenerate) {
        const lo = Math.max(0, e.mu - 4 * e.sd); const hi = e.mu + 4 * e.sd;
        const pts = normalPts(e.mu, e.var, lo, hi, 160);
        DC.render(holder, { w: 600, h: 260, x: [lo, hi], ymax: Math.max(...pts.map((q) => q[1])) * 1.12, ticks: niceTicks(lo, hi, 8), fmt: num,
          curves: [{ pts, cls: 'c-normal' }], shade: { pts, to: T }, vlines: [{ x: e.mu, cls: 'v-sd', dash: '3 3' }, { x: T, cls: 'v-deadline', label: tu('exam.deadline', { T: num(T) }) }],
          label: seen(2) ? tu('exam.chartLabel', { mu: fx(e.mu, 2), var: fx(e.var, 2), T: num(T) }) : tu('sim.legendNormal') });
        parts.push(h('div', { class: 'unc-legend', 'aria-hidden': 'true' }, [key('k-normal', tu('exam.legendNormal'))].concat(seen(1) ? [key('k-sd', tu('exam.legendMu', { mu: fx(e.mu, 2) }))] : [])));
      }
      if (!all) return h('section', { class: 'card unc-normalcard', 'aria-labelledby': 'uncNormalHead' }, parts);
      const res = e.degenerate ? (e.inverse ? tu('exam.degT', { mu: num(e.mu) }) : tu('exam.degP', { mu: num(e.mu), T: num(T), p: num(e.exact) }))
        : e.inverse ? tu('exam.resultT', { p: num(e.prob), Tt: fx(e.table.deadline, 2), T: fx(e.deadline, 2) })
          : tu('exam.result', { T: num(T), p4: fx(e.table.p4, 4), exact: fx(e.exact, 4) });
      parts.push(h('p', { class: 'unc-note', id: 'uncExamResult' }, [h('strong', {}, [res]), ' ', tu('exam.credible'), ' ',
        h('button', { type: 'button', class: 'linklike', id: 'uncToProj', onclick: () => { go({ ux: 'proj', ud: e.inverse ? null : state().ud }); focus('uncCase-proj'); } }, [tu('exam.toProj')])]));
      return h('section', { class: 'card unc-normalcard', 'aria-labelledby': 'uncNormalHead' }, parts);
    }
    function key(cls, text) { return h('span', { class: 'unc-key' }, [h('span', { class: `unc-swatch ${cls}`, 'aria-hidden': 'true' }), text]); }

    // Casos simulados: normal sobre el histograma, con su alternativa en texto (tabla de clases).
    function simTitle(spec) {
      const s = state(); const i = spec.info;
      if (s.ux === 'merge') {
        const p = { mu: num(i.mu), var: num(i.var), k: i.n - 1, s: num(i.slack) };
        return i.n === 1 ? tu('merge.title1', p) : tu(i.slack === 0 ? 'merge.titleSame' : i.slack === 1 ? 'merge.titleOneDay' : 'merge.title', p);
      }
      if (s.ux === 'proj') return tu('proj.title', { name: m.src.title });
      const d = { a: num(i.terna.a), m: num(i.terna.m), b: num(i.terna.b) };
      if (s.ux === 'few') return i.k === 1 ? tu('lim.fewTitleOne', d) : tu('lim.fewTitle', Object.assign({ k: i.k }, d));
      if (s.ux === 'skew') return tu('lim.skewTitle', d);
      return tu('lim.corrTitle', Object.assign({ rho: fx(i.rho, 2) }, d));
    }
    function simChartCard(spec, su) {
      const holder = h('div', { class: 'unc-chart', id: 'uncSimChart' });
      const parts = [h('h2', { id: 'uncSimHead' }, [simTitle(spec)]), holder];
      const mu = spec.normal.mu; const sd = Math.sqrt(spec.normal.var);
      let lo = mu - 4 * sd; let hi = mu + 4 * sd;
      if (su) { lo = Math.min(lo, su.min); hi = Math.max(hi, su.max); }
      lo = Math.max(lo, 0);   // las duraciones nunca son negativas (la normal se trunca en 0)
      const pts = sd > 0 ? normalPts(mu, spec.normal.var, lo, hi, 200) : [];
      const peak = Math.max(0, ...pts.map((q) => q[1]));
      const hpeak = su ? Math.max(...su.hist.counts) / (su.n * su.hist.width) : 0;
      const pert = state().ux === 'proj' && m.acts.some((a) => a.dist.kind === 'pert');
      DC.render(holder, { w: 640, h: 270, x: [lo, hi], ymax: Math.max(peak, hpeak) * 1.1 || 1, ticks: niceTicks(lo, hi, 8), fmt: num,
        hist: su ? Object.assign({ n: su.n }, su.hist) : null, curves: pts.length ? [{ pts, cls: 'c-normal' }] : [],
        vlines: [{ x: spec.deadline, cls: 'v-deadline', label: tu('exam.deadline', { T: num(spec.deadline) }) }],
        label: su ? tu('sim.chartLabel', { n: big(su.n), mu: fx(mu, 2), var: fx(spec.normal.var, 2), T: num(spec.deadline), pn: fx(su.pn, 3), ps: fx(su.ps, 3) })
          : tu('sim.running', { n: big(spec.n) }) });
      parts.push(h('div', { class: 'unc-legend', 'aria-hidden': 'true' }, [key('k-normal', tu('sim.legendNormal')), key('k-hist', tu(pert ? 'sim.legendSimPert' : 'sim.legendSim', { n: big(spec.n) }))]));
      if (!su) { parts.push(h('p', { class: 'muted small', id: 'uncSimWait' }, [tu('sim.running', { n: big(spec.n) })])); return h('section', { class: 'card unc-simcard', 'aria-labelledby': 'uncSimHead' }, parts); }
      const toggle = h('button', { type: 'button', class: 'linklike', id: 'uncBins', 'aria-expanded': String(binsOpen), 'aria-controls': 'uncBinsTable',
        onclick: () => { binsOpen = !binsOpen; keepFocus(drawMain); } }, [binsOpen ? tu('sim.hideTable') : tu('sim.showTable')]);
      parts.push(h('p', { class: 'muted small' }, [toggle, su.ks == null ? '' : ` · ${tu('sim.ks', { ks: fx(su.ks, 3) })}`]));
      if (binsOpen) parts.push(binsTable(spec, su));
      return h('section', { class: 'card unc-simcard', 'aria-labelledby': 'uncSimHead' }, parts);
    }
    function binsTable(spec, su) {
      const { lo, width, counts } = su.hist; const mu = spec.normal.mu; const sd = Math.sqrt(spec.normal.var);
      const F = (x) => (sd > 0 ? Tp.phi((x - mu) / sd) : (x >= mu ? 1 : 0));
      const rows = counts.map((c, i) => { const a = lo + i * width; const b = a + width;
        return h('tr', {}, [h('th', { scope: 'row' }, [`${fx(a, 2)} – ${fx(b, 2)}`]), h('td', { class: 'num' }, [big(c)]), h('td', { class: 'num' }, [fx(c / su.n, 3)]), h('td', { class: 'num' }, [fx(F(b) - F(a), 3)])]); });
      return h('div', { class: 'unc-scroll unc-bins', tabindex: '0', role: 'region', 'aria-label': tu('sim.binsCaption'), id: 'uncBinsTable' }, [h('table', { class: 'data unc-table' }, [
        h('caption', { class: 'sr-only' }, [tu('sim.binsCaption')]),
        h('thead', {}, [h('tr', {}, ['colBin', 'colCount', 'colShare', 'colNormal'].map((k) => h('th', { scope: 'col' }, [tu(`sim.${k}`)])))]), h('tbody', {}, rows)])]);
    }
    function probCard(spec, su) {
      const s = state(); const T = num(spec.deadline);
      const ks = SYNTHETIC.includes(s.ux) && s.ux !== 'merge';
      const cols = [tu(s.ux === 'proj' ? 'proj.colP' : 'sim.colP', { T })].concat(ks ? [tu('sim.colKs')] : [tu('sim.colMean')]);
      const pn = su ? su.pn : (Math.sqrt(spec.normal.var) > 0 ? Tp.phi((spec.deadline - spec.normal.mu) / Math.sqrt(spec.normal.var)) : (spec.deadline >= spec.normal.mu ? 1 : 0));
      const row = (label, cells, cls) => h('tr', { class: cls || '' }, [h('th', { scope: 'row' }, [label])].concat(cells.map((c) => h('td', { class: 'num' }, [c]))));
      const body = [row(tu('sim.rowNormal'), [fx(pn, 3), ks ? '—' : fx(spec.normal.mu, 2)], 'k-normal-row'),
        row(tu('sim.rowSim', { n: big(spec.n) }), su ? [fx(su.ps, 3), ks ? fx(su.ks, 3) : fx(su.mean, 2)] : ['…', '…'], 'strong')];
      if (spec.exact != null) body.push(row(s.ux === 'proj' ? tu('proj.exact') : tu('sim.rowExact'), [fx(spec.exact, 3), '—']));
      const title = s.ux === 'proj' ? tu('proj.probTitle', { T }) : tu('sim.probTitle');
      return h('section', { class: 'card unc-probcard', 'aria-labelledby': 'uncProbHead' }, [h('h2', { id: 'uncProbHead' }, [title]),
        h('table', { class: 'data unc-table', id: 'uncProb' }, [h('thead', {}, [h('tr', {}, [h('td', {})].concat(cols.map((c) => h('th', { scope: 'col' }, [c]))))]), h('tbody', {}, body)])]);
    }
    function pathsCard(spec) {
      const T = num(spec.deadline); const all = spec.info.paths; const crit = spec.info.exam.path.join('|');
      const list = all.list.slice().sort((x, y) => y.mu - x.mu);
      const shown = list.slice(0, 8);
      const rows = shown.map((p) => h('tr', { class: p.acts.join('|') === crit ? 'sel' : '' }, [h('th', { scope: 'row' }, [pathText(p.acts)]),
        h('td', { class: 'num' }, [fx(p.mu, 2)]), h('td', { class: 'num' }, [fx(p.var, 2)]), h('td', { class: 'num' }, [fx(p.p, 3)])]));
      const parts = [h('h2', { id: 'uncPathsHead' }, [tu('proj.pathsTitle')]),
        h('table', { class: 'data unc-table', id: 'uncPaths' }, [h('thead', {}, [h('tr', {}, [tu('proj.colPath'), 'μ', 'σ²', `P(≤ ${T})`].map((c) => h('th', { scope: 'col' }, [c])))]), h('tbody', {}, rows)])];
      if (list.length > shown.length) parts.push(h('p', { class: 'muted small' }, [tu('proj.more', { n: list.length - shown.length })]));
      return h('section', { class: 'card unc-pathscard', 'aria-labelledby': 'uncPathsHead' }, parts);
    }
    function notesCards(spec, su) {
      const s = state(); const out = [];
      if (s.ux === 'merge') {
        const i = spec.info;
        if (i.n === 1) out.push(h('p', { class: 'card unc-callout' }, [tu('merge.note1')]));
        else if (su) {
          out.push(h('p', { class: 'card unc-callout', id: 'uncMergeNote' }, [tu('merge.note', { pn: fx(su.pn, 3), n: i.n, ps: fx(su.ps, 3) })]));
          if (su.mean > i.mu + 0.05) out.push(h('p', { class: 'card unc-info', id: 'uncSchoenberger' }, [tu('merge.schoenberger', { mean: fx(su.mean, 2), mu: num(i.mu) })]));
        }
      } else if (s.ux === 'proj') {
        const pert = m.acts.some((a) => a.dist.kind === 'pert');
        out.push(h('p', { class: 'card unc-callout' }, [pert ? tu('proj.causesPert', lab()) : tu('proj.causes')]));
      } else {
        out.push(h('p', { class: 'card unc-info' }, [tu(`lim.${s.ux}`, lab())]));
      }
      return out;
    }
    function drawM6Main(grid) {
      const s = state();
      if (s.ux === 'exam') {
        cancelSim();
        const e = examOf(s, m);
        grid.appendChild(h('div', { class: 'unc-left' }, [examCard(e)]));
        grid.appendChild(h('div', { class: 'unc-side' }, [examChartCard(e)]));
        return;
      }
      const spec = simSpec(s, m);
      ensureSim(spec);
      const su = sim.durations && sim.key === spec.key ? simSummary(spec, sim.durations) : null;
      grid.appendChild(h('div', { class: 'unc-left' }, [simChartCard(spec, su)]));
      const side = [probCard(spec, su)];
      if (s.ux === 'proj') side.push(pathsCard(spec));
      grid.appendChild(h('div', { class: 'unc-side' }, side.concat(notesCards(spec, su))));
    }

    // A la izquierda, la actividad (o los errores de la tabla); a la derecha, la tabla del proyecto y la red.
    let left = null; let side = null; let proj = null;
    const walking = () => state().um === 'm5' && !!m.trace;
    function fill() {
      clear(left);
      left.appendChild(m.model ? actCard() : issuesCard());
      while (side.lastChild && side.lastChild !== proj) side.removeChild(side.lastChild);
      if (m.model) side.appendChild(netCard());
    }
    // M6 (salvo una tabla propia con errores, que se corrige aquí mismo): la barra con los casos y, debajo, el caso.
    let main = null;
    function drawMain() {
      if (!main) return;
      clear(main);
      drawM6Main(main);
    }
    const m6On = () => state().um === 'm6' && (!!m.model || SYNTHETIC.includes(state().ux));
    function draw() {
      clear(container);
      container.appendChild(bar());
      main = null;
      if (m6On()) {
        main = h('div', { class: 'unc-main' });
        container.appendChild(main);
        drawMain();
        return;
      }
      cancelSim();
      if (walking()) {
        const [card, chart] = walkCard();
        container.appendChild(h('div', { class: 'unc-main' }, [h('div', { class: 'unc-left' }, [card]), h('div', { class: 'unc-side' }, [chart])]));
        left = null; side = null; proj = null;
        return;
      }
      left = h('div', { class: 'unc-left' }); proj = projectCard(); side = h('div', { class: 'unc-side' }, [proj]);
      container.appendChild(h('div', { class: 'unc-main' }, [left, side]));
      fill();
    }
    function render(model, opts) {
      const typing = opts && opts.fromEditor && m && m.src.kind === 'own' && model.src.kind === 'own' && proj && proj.isConnected && !main
        && model.src.rows.length === m.src.rows.length && model.src.mode === m.src.mode;
      m = model;
      if (typing) { markOwn(); fill(); return; }
      keepFocus(draw);
    }
    function debug() {
      if (!m) return null;
      const out = { src: m.src, issues: m.issues, acts: m.acts.map((a) => ({ id: a.id, mean: a.mean, var: a.var })), sel: m.sel, path: m.exam ? m.exam.path : null };
      // M6: la huella de la simulación (se compara con la de Node para la misma semilla, A4).
      if (sim.key) {
        const su = sim.durations ? simSummary(sim.spec, sim.durations) : null;
        out.sim = { key: sim.key, us: sim.spec.us, done: !!su, ps: su && su.ps, pn: su && su.pn, mean: su && su.mean, ks: su && su.ks, counts: su && su.hist.counts, lo: su && su.hist.lo, width: su && su.hist.width };
      }
      return out;
    }
    return { render, debug };
  }

  const api = { M6_READY, SECTION_EXAMPLES, LABELS, labels, source, parseNum, validate, model, pasteRows, withValue, curvePts, niceTicks,
    UK_DEFAULT, SLIDERS, SEED_DEFAULT, BINS, CASES, SYNTHETIC, ukOf, seedOf, deadlineOf, examOf, simSpec, simSummary, trace, hint, create };
  root.PNL = root.PNL || {};
  root.PNL.unc = api;
  if (isNode) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
