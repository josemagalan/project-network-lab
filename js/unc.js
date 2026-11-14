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
  // F4b (T013): M7 publicado (oculto en T010–T012; con um=m7 en el enlace sí se veía su botón).
  const M7_READY = true;
  const SECTION_EXAMPLES = { m5: ['kl', 'hl'], m6: ['kl', 'hl', 'tr', 'pa'], m7: ['kl', 'hl', 'kd', 'wa', 'wb', 'wc', 'wd'] };
  const FIELDS = ['a', 'm', 'b'];
  // Notación (decisión del autor en clarify): a, m, b con μ y σ² / to, tm, tp con te y σ², como en los apuntes.
  const LABELS = { en: { a: 'a', m: 'm', b: 'b', mean: 'μ', var: 'σ²' }, es: { a: 'tₒ', m: 'tₘ', b: 'tₚ', mean: 'tₑ', var: 'σ²' } };
  const labels = (nota) => LABELS[nota === 'es' ? 'es' : 'en'];
  const str = (v) => (v == null ? '' : String(v));
  // El identificador como lo lee core/project (sin espacios y en mayúsculas): «a» es la actividad A (revisión F4a, F2).
  const idOf = (v) => str(v).trim().toUpperCase();

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
        else nums[idOf(r.id)] = v;
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
    // F4b (T010): M7 tiene su propio modelo (js/m7.js, grupo u7).
    if (state.um === 'm7' && root.PNL && root.PNL.m7) return Object.assign(root.PNL.m7.model(state, lang), { m7: true });
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
    return rows.map((r) => (idOf(r.id) === id ? Object.assign({}, r, { [field]: str(value) }) : Object.assign({}, r)));
  }

  /** Puntos de una curva sobre [a, b] (sin pasar de ymax, por si la densidad se dispara en un extremo). */
  function curvePts(kind, d, n) {
    // La triangular es una poligonal: sus vértices a, m y b (con dos tramos rectos, el pico cae en m; revisión F4a).
    if (kind === 'tri') return [[d.a, 0], [d.m, T.pdf('tri', d, d.m)], [d.b, 0]];
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
  const TIES_SHOWN = 5;   // con más de 50 caminos críticos, los que se nombran en el primer paso del cálculo de examen
  const PATHS_SHOWN = 8;  // los caminos del proyecto entero que se listan (los de más media)
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
    const near = all.list ? all.list.filter((p) => !crit.has(p.acts.join('|'))).sort((x, y) => y.mu - x.mu)[0] || null : null;
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
    // F4b (T011): en M7, las réplicas de «Réplica a réplica» (js/m7.js).
    if (state.um === 'm7') return m && m.m7 && root.PNL.m7 ? root.PNL.m7.trace(state, m) : null;
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
    // M7 (F4b, T010): su vista, creada al entrar por primera vez (js/m7.js llega con el grupo u7).
    let m7c = null;
    const m7v = () => m7c || (m7c = root.PNL.m7.create({ state, lang, dispatch: hooks.dispatch, newSeed: hooks.newSeed, focus,
      pred: hooks.pred, predicting: hooks.predicting, predCheck: hooks.predCheck, predShow: hooks.predShow,
      announce: (text) => { if (hooks.announce) hooks.announce(text); }, redraw: () => keepFocus(draw) }));
    // M5 y M6 (F4b, T012, reserva 2 de T001): su vista va en js/unc-m56.js (grupo u56), que no se carga con um=m7.
    let v56 = null;
    const v5 = () => v56 || (v56 = root.PNL.uncM56.create({ h, DC, state, lang, t, tu, num, lab, hooks, focus, keepFocus, button, seg, go,
      model: () => m, redrawMain: () => drawMain() }));
    const cancelSim = () => { if (v56) v56.cancelSim(); };

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
      const sections = seg([[tu('m5'), s.um === 'm5', () => go({ um: 'm5' }), 'uncM5'], [tu('m6'), s.um === 'm6', () => go({ um: 'm6' }), 'uncM6', !M6_READY],
        [tu('m7'), s.um === 'm7', () => go({ um: 'm7' }), 'uncM7', !M7_READY && s.um !== 'm7']], tu('sections'));
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
      if (s.um === 'm6') rows.push(v5().m6Controls());
      if (m.m7) rows.push(...m7v().rows());
      return h('div', { class: 'card unc-bar' }, rows);
    }
    // «Paso a paso» (T011): en M5 y en el cálculo de examen de M6, con la casilla de la predicción.
    function walkControls() {
      const s = state();
      if (!m || !m.model || s.um === 'm7' || (s.um === 'm6' && s.ux !== 'exam')) return [];
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
      const a = m.model && !m.issues.length ? m.acts.find((x) => x.id === idOf(r.id)) : null;
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
        hooks.dispatch({ type: 'uncTable', mode, rows: m.src.rows.map((r) => Object.assign({}, r, { links: back[idOf(r.id)] != null ? back[idOf(r.id)] : r.links })) });
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
    const walking = () => state().um === 'm5' && !!m.trace;
    function fill() {
      clear(left);
      left.appendChild(m.model ? v5().actCard() : issuesCard());
      while (side.lastChild && side.lastChild !== proj) side.removeChild(side.lastChild);
      if (m.model) side.appendChild(netCard());
    }
    // M6 (salvo una tabla propia con errores, que se corrige aquí mismo): la barra con los casos y, debajo, el caso.
    let main = null;
    function drawMain() {
      if (!main) return;
      clear(main);
      v5().drawM6Main(main);
    }
    const m6On = () => state().um === 'm6' && (!!m.model || SYNTHETIC.includes(state().ux));
    function draw() {
      clear(container);
      if (m.m7) {
        cancelSim(); main = null; left = null; side = null; proj = null;
        m7v().setModel(m);
        container.appendChild(bar());
        for (const el of m7v().main()) container.appendChild(el);
        return;
      }
      if (m7c) m7c.leave();
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
        const [card, chart] = v5().walkCard();
        container.appendChild(h('div', { class: 'unc-main' }, [h('div', { class: 'unc-left' }, [card]), h('div', { class: 'unc-side' }, [chart])]));
        left = null; side = null; proj = null;
        return;
      }
      left = h('div', { class: 'unc-left' }); proj = projectCard(); side = h('div', { class: 'unc-side' }, [proj]);
      container.appendChild(h('div', { class: 'unc-main' }, [left, side]));
      fill();
    }
    function render(model, opts) {
      const typing = opts && opts.fromEditor && m && !m.m7 && !model.m7 && m.src.kind === 'own' && model.src.kind === 'own' && proj && proj.isConnected && !main
        && model.src.rows.length === m.src.rows.length && model.src.mode === m.src.mode;
      m = model;
      // Al teclear se repinta solo lo de M5; si la tabla pasa a ser válida estando en M6, toca la vista de M6 (revisión F4a, F14).
      if (typing && !m6On()) { markOwn(); fill(); return; }
      keepFocus(draw);
    }
    function debug() {
      if (!m) return null;
      if (m.m7) return { m7: m7c ? m7c.debug() : null, src: m.src };
      const out = { src: m.src, issues: m.issues, acts: m.acts.map((a) => ({ id: a.id, mean: a.mean, var: a.var })), sel: m.sel, path: m.exam ? m.exam.path : null };
      // M6: la huella de la simulación (se compara con la de Node para la misma semilla, A4).
      const sim = v56 ? v56.sim() : {};
      if (sim.key) {
        const su = sim.durations ? simSummary(sim.spec, sim.durations) : null;
        out.sim = { key: sim.key, us: sim.spec.us, done: !!su, ps: su && su.ps, pn: su && su.pn, mean: su && su.mean, ks: su && su.ks, counts: su && su.hist.counts, lo: su && su.hist.lo, width: su && su.hist.width };
      }
      return out;
    }
    return { render, debug };
  }

  const api = { M6_READY, M7_READY, SECTION_EXAMPLES, LABELS, FIELDS, labels, source, parseNum, validate, model, pasteRows, withValue, curvePts, niceTicks,
    UK_DEFAULT, SLIDERS, SEED_DEFAULT, BINS, CASES, SYNTHETIC, TIES_SHOWN, PATHS_SHOWN, ukOf, seedOf, deadlineOf, examOf, simSpec, simSummary, trace, hint, create };
  root.PNL = root.PNL || {};
  root.PNL.unc = api;
  if (isNode) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
