/*
 * app — controlador de la página: estado (store) ↔ URL viva (urlstate), cálculo (core) y vistas.
 * Cada cambio pasa por dispatch(): reduce el estado, recalcula si cambian los datos, reescribe el
 * #hash y vuelve a pintar. Las vistas solo leen la Solution y el paso actual (plan f1-cpm-roy §2).
 * Para las pruebas de navegador expone PNL.app.state(), PNL.app.step() y PNL.app.go(n).
 * F2a: con graph=aoa se reproduce la traza de la red PERT (core/aoa) en lugar de la de ROY (plan f2a §2 y §4),
 * con el contador de ficticias (reglas frente al mínimo de core/mindummy) y, con min=1, la red mínima al lado.
 * F2b: con view=cmp, el comparador de métodos (core/compare y compare-view) ocupa el panel principal, en dos
 * tiempos: primero las tarjetas de los métodos visibles y, cuando termina la búsqueda del mínimo, las cifras.
 * F2b: con m=prog, el reproductor recorre la traza del dibujo progresivo (core/aoamethods) en lugar de la de las
 * reglas: solo lo dibujado hasta el paso, sin contador ni lado a lado, y con su predicción (T019).
 * F2b: con view=reto, el reto de ficticias (js/reto y views/reto-table) ocupa el panel principal; la red del alumno
 * vive en sn (URL) y el último diagnóstico, solo en la página (T021).
 * F2c: con v=m0, M0 (js/m0) ocupa la página: texto, tabla, matriz, validación y corrección (T016). Todavía sin pestaña
 * en la barra (P9): solo se llega escribiendo la URL. La URL se escribe con encodeSafe: si no cabe, se avisa.
 * F2c: con v=m0&mm=route, el reproductor recorre la ruta paso a paso (statement.route), con su predicción (T018).
 * F3a: con v=ex, «Ejercicios» (js/ex) ocupa la página: generador, tabla dada, red sin cifras y tabla de respuestas (T011).
 *   Todavía sin pestaña (P9). Los scripts de M0 y de «Ejercicios» se cargan al entrar en su vista (P10, puerta T001):
 *   antes de decodificar la URL se mira v en el enlace y, si hace falta, se cargan antes de arrancar.
 */
(function () {
  'use strict';

  const G = window.PNL;
  const { i18n: I, urlstate: U, store: S, project: P, cpm: C, matrix: MX, examples: EX, narrate: NR,
    layout: L, predict: PR, learn: LR, aoa: A, aoaLayout: AL, mindummy: MD, compare: CM, reto: RT, dom } = G;
  const { h, clear } = dom;
  const $ = (id) => document.getElementById(id);

  let state;
  let model;
  let pred = { step: -1, answers: new Map(), result: null, done: false };
  let timer = null;
  let tableOpen = false;
  let showComputed = true;
  let ganttLate = false;
  let whatIfOpen = false;
  let lastAnnounced = '';
  let editor;
  let selected = null;     // actividad o ficticia seleccionada (sin URL; se borra al cambiar de tabla)
  let minCache = { key: null, res: null, lay: null };   // mínimo de ficticias de la estructura actual
  let cmpCache = { key: null, cards: new Map() };        // tarjetas del comparador de la estructura actual
  let reto = null;          // { key, st }: la red del alumno (st de js/reto) de la estructura actual
  let retoSol = null;       // método cuya red se enseña con «Ver una solución» (null: ninguna)
  let retoMethod = 'rules'; // el último elegido
  let m0 = null;            // controlador de M0 (F2c)
  let exc = null;           // controlador de «Ejercicios» (F3a)
  let mqc = null;           // controlador del exportador de Moodle (F3b)
  let uncc = null;          // controlador de «Duraciones inciertas» (F4a)
  const UNC_PUBLIC = false; // F4a: la pestaña se publica en T013

  // ---------- Carga bajo demanda (F3a, P10) ----------
  // Los scripts que solo usan M0 y «Ejercicios» no van en cpm.html: se añaden con <script> (también en file://) al
  // entrar en su vista. async = false los ejecuta en orden; la promesa se cumple con el último.
  const LAZY = {
    // F3c (plan P12): M0 lleva el índice de títulos; el texto de los once enunciados (st) y el generador (sg) van aparte.
    m0: ['js/core/precheck.js', 'js/core/statement.js', 'js/core/statements-index.js', 'js/views/prec-matrix.js', 'js/views/statement-view.js', 'js/m0.js'],
    st: ['js/core/statements.js'],
    sg: ['js/core/contexts.js', 'js/core/stmtgen.js'],
    ex: ['js/core/grade.js', 'js/views/answer-table.js', 'js/ex.js'],
    // F3b (plan P5 y P7): el banco de Moodle, sus textos y su vista; F3c (P5): con el generador de enunciados (etapa 0).
    mq: ['js/core/grade.js', 'js/core/contexts.js', 'js/core/stmtgen.js', 'js/core/moodle.js', 'js/i18n-moodle.js', 'js/views/question-view.js', 'js/moodle-page.js'],
    // F4a (plan P3): «Duraciones inciertas», con su núcleo (tres tiempos, simulación, TCL y ejemplos), textos y vista.
    // Con su hoja de estilos: M0 ya roza el presupuesto de 1 MB y no debe pagarla.
    un: ['css/unc.css', 'js/core/threept.js', 'js/core/sim.js', 'js/core/tcl.js', 'js/core/stochex.js', 'js/i18n-unc.js', 'js/views/dist-chart.js', 'js/unc.js'],
  };
  const READY = { m0: () => !!G.m0, ex: () => !!G.ex, mq: () => !!G.moodlePage, st: () => !!G.statements, sg: () => !!G.stmtgen, un: () => !!G.unc };
  const loading = {};
  function need(group) {
    if (!group || READY[group]()) return Promise.resolve();
    if (!loading[group]) {
      // Una hoja de estilos del grupo (F4a) se pide a la vez; la vista se pinta cuando han llegado los scripts y ella.
      const sheets = LAZY[group].filter((src) => src.endsWith('.css') && !document.querySelector(`link[href="${src}"]`)).map((src) => new Promise((resolve, reject) => {
        const el = document.createElement('link');
        el.rel = 'stylesheet'; el.href = src;
        el.onload = () => resolve();
        el.onerror = () => { el.remove(); reject(new Error(src)); };
        document.head.appendChild(el);
      }));
      const scripts = new Promise((resolve, reject) => {
        // Un script que ya cargó otro grupo (core/grade lo usan «Ejercicios» y Moodle) no se vuelve a pedir.
        const have = new Set([...document.scripts].map((x) => x.getAttribute('src')));
        const files = LAZY[group].filter((src, i, all) => !src.endsWith('.css') && (!have.has(src) || i === all.length - 1));
        files.forEach((src, i) => {
          const el = document.createElement('script');
          el.src = src; el.async = false;
          if (i === files.length - 1) { el.onload = () => resolve(); }
          el.onerror = () => reject(new Error(src));
          document.body.appendChild(el);
        });
      });
      loading[group] = Promise.all([scripts, ...sheets]).then(() => { ensureControllers(); }, (err) => { delete loading[group]; throw err; });
    }
    return loading[group];
  }
  const groupOf = (v) => (v === 'm0' || v === 'ex' ? v : v === 'moodle' ? 'mq' : v === 'unc' ? 'un' : null);
  // Grupos que pide un enlace (F3c, P5 y P12): M0 con el texto de su enunciado (st) o con el generador (sg).
  function groupsOf(hash) {
    const q = new URLSearchParams(String(hash || '').replace(/^#/, ''));
    const v = q.get('v');
    // Con st=own también se pide statements.js: un enunciado propio dañado o sin paquete pasa a Electrona (ej5), que sí lo
    // necesita (revisión de la F3c, F1).
    if (v === 'm0') { const st = q.get('st'); return ['m0', st === 'gen' ? 'sg' : 'st']; }
    if (v === 'ex' && q.get('xt') === '1') return ['ex', 'sg'];
    return [groupOf(v)];
  }
  const needAll = (groups) => Promise.all(groups.filter(Boolean).map((g) => need(g)));

  const lang = () => state.lang || 'es';
  const t = (k, p) => I.t(lang(), k, p);
  const numFmt = (v) => NR.fmt(lang(), v);
  const nameOf = (r) => (r.name && typeof r.name === 'object' ? r.name[lang()] : (r.name || ''));

  // ---------- Modelo ----------

  function compute() {
    // M0 (F2c): el enunciado y la tabla del alumno; sin traza que reproducir en practicar.
    if (state.v === 'm0') { model = Object.assign(G.m0.model(state, lang()), { m0: true }); return; }
    // «Ejercicios» (F3a): la tabla generada, su solución y lo escrito; sin traza que reproducir.
    if (state.v === 'ex') { model = Object.assign(G.ex.model(state, lang()), { exm: true }); return; }
    // El exportador de Moodle (F3b): sin tabla ni traza; la vista guarda su selección.
    if (state.v === 'moodle') { model = { mqm: true }; return; }
    // «Duraciones inciertas» (F4a): su proyecto, medias y varianzas y, con «uw», la traza del paso a paso (T011).
    if (state.v === 'unc') { model = Object.assign(G.unc.model(state, lang()), { uncm: true }); model.trace = G.unc.trace(state, model); return; }
    let rows; let mode; let name; let unit = ''; let structureOnly = false;
    // En la ruta, una tabla sin filas con datos no tiene nada que recorrer: se usa el ejemplo (revisión, ronda 2, H3).
    const hasRows = state.t && state.t.some((r) => [r.id, r.duration, r.links].some((v) => String(v == null ? '' : v).trim()));
    if (state.t && (hasRows || state.v === 'work')) {
      rows = state.t; mode = state.mode; name = t('nav.work');
      // Sin ninguna duración, la tabla del taller es solo de estructura, como los ejercicios 1–3 (T022).
      structureOnly = P.blankDurations(rows);
    } else {
      const ex = EX.get(state.ex) || EX.get('ej6');
      structureOnly = !!ex.structureOnly;
      rows = ex.rows.map((r) => Object.assign({}, r, { name: nameOf(r) }));
      mode = ex.mode; name = ex.title[lang()]; unit = ex.unit[lang()];
    }
    const { project, report } = P.parse(rows, mode, { structureOnly });
    // Un ejemplo abierto en el Taller se muestra en la forma elegida (predecesoras o posteriores).
    if (!state.t && state.v === 'work' && project && state.mode !== mode) { rows = P.toRows(project, state.mode); mode = state.mode; }
    model = { rows, mode, name, unit, project: null, base: null, report, solution: null, matrix: null, lay: null,
      net: null, aoaLay: null, succs: null, structureOnly };
    if (!project) return;
    if (structureOnly) { model.project = project; computePert(); return; }
    model.base = C.solve(project);
    let proj = project;
    if (state.wi) {
      const wi = new Map(state.wi);
      proj = Object.assign({}, project, { activities: project.activities.map((a) => (wi.has(a.id) ? Object.assign({}, a, { d: wi.get(a.id) }) : a)) });
    }
    model.project = proj;
    model.solution = proj === project ? model.base : C.solve(proj);
    model.matrix = MX.build(model.solution, proj);
    model.lay = L.layout(model.solution, proj);
    computePert();
  }

  // La red PERT de la misma tabla (con las duraciones de «¿Y si…?»): cuesta milisegundos, se calcula siempre.
  function computePert() {
    model.net = A.build(model.project, { solution: model.solution });
    model.aoaLay = AL.layout(model.net);
    model.succs = A._reduce(model.project).direct;
    // Dibujo progresivo (F2b, T019): su red final, con su traza, colocada una vez; los pasos enseñan una parte.
    model.progNet = A.build(model.project, { method: 'prog' });
    model.progLay = AL.layout(model.progNet);
  }

  const pert = () => state.graph === 'aoa';
  const prog = () => pert() && state.m === 'prog';
  // Una tabla solo de estructura no tiene red ROY: se pasa a la red PERT, desde su primer paso (T022), y sin
  // la vista lado a lado ni la matriz, que necesitan la red ROY (revisión de cierre, F2).
  function fitGraph() {
    if (model.m0 || model.exm || model.mqm || model.uncm || !model.structureOnly || !model.project) return;
    const view = state.view === 'matrix' || state.view === 'side' ? 'net' : state.view;
    if (pert() && view === state.view) return;
    state = Object.assign({}, state, { graph: 'aoa', view, step: pert() ? state.step : 0 });
  }
  // La traza que se reproduce: la de la red PERT con graph=aoa y la de ROY en otro caso.
  function trace() {
    if (!model) return null;
    if (model.m0) return state.mm === 'route' ? model.route : null;
    if (model.uncm) return model.trace || null;
    if (model.exm || model.mqm) return null;
    if (pert()) return model.net ? (prog() ? model.progNet.trace : model.net.trace) : null;
    return model.solution ? model.solution.trace : null;
  }
  const total = () => { const tr = trace(); return tr ? tr.length : 1; };

  // Si el estado no cabe en el enlace (encodeSafe, F2c), la URL se queda como estaba y se avisa (también en el reto).
  function writeHash(push) {
    const { hash } = U.encodeSafe(state);
    $('urlTooLong').hidden = !!hash;
    if (!hash || location.hash === hash) return;
    if (push) history.pushState(null, '', hash); else history.replaceState(null, '', hash);
  }

  function resetPred() { pred = { step: state.step, answers: new Map(), result: null, done: false }; }

  // Entrada a M0 desde la barra o el taller (T020): practicar con el enunciado de antes, o Electrona, y la tabla vacía.
  const m0Entry = () => (state.v === 'm0' ? Object.assign({}, state, { mm: 'practice', step: 0 }) : S.reduce(state, { type: 'm0', st: state.st, mm: 'practice' }, 1));
  // Entrada a «Ejercicios» desde la barra (F3a, T017): el ejercicio de antes (semilla y parámetros) sin respuestas, o uno
  // nuevo con una semilla de la interfaz, elegida una vez para que el enlace de la pestaña no cambie en cada repintado.
  let tabSeed = null;
  const exEntry = () => (state.v === 'ex' ? state : S.reduce(state, { type: 'ex', sd: state.sd || (tabSeed = tabSeed || newSeed()) }, 1));
  // Entrada a «Duraciones inciertas»: lo que hubiera (apartado, proyecto, tabla propia); por defecto, M5 con Klastorin.
  const uncEntry = () => Object.assign({}, state, { v: 'unc', step: 0 });
  function toUnc() {
    stopPlay();
    if (state.v === 'unc') return;
    if (!G.unc) { need('un').then(toUnc); return; }
    dispatch({ type: 'unc' }, { push: true });
    window.scrollTo(0, 0);
  }
  function toEx() {
    stopPlay();
    if (state.v === 'ex') return;
    if (!G.ex) { need('ex').then(toEx); return; }
    dispatch({ type: 'ex', sd: exEntry().sd });
    window.scrollTo(0, 0);
  }
  function toM0() {
    stopPlay();
    // La acción m0 sin paquete propio pasa a ej5: con st=own también hace falta statements.js (revisión de la F3c, F2).
    if (!G.m0 || (state.st === 'gen' ? !G.stmtgen : !G.statements)) { needAll(['m0', state.st === 'gen' ? 'sg' : 'st']).then(toM0); return; }
    // Ya en M0: de la ruta paso a paso vuelve a practicar sin perder la tabla.
    if (state.v === 'm0') { if (state.mm !== 'practice') { dispatch({ type: 'set', key: 'mm', value: 'practice' }); dispatch({ type: 'first' }); } return; }
    dispatch({ type: 'm0', st: state.st, mm: 'practice' });
    window.scrollTo(0, 0);
  }

  function dispatch(action, opts) {
    const before = state;
    state = S.reduce(state, action, total());
    const dataChanged = ['t', 'ex', 'mode', 'wi', 'lang', 'v', 'st', 'own', 'mk', 'sd', 'lv', 'gp', 'ask', 'xm', 'ans', 'xd', 'gv', 'cx', 'sv', 'xt', 'um', 'ue', 'ut', 'ua', 'uc', 'ux', 'ud', 'up', 'uw'].some((k) => JSON.stringify(before[k]) !== JSON.stringify(state[k]));
    if (dataChanged) { compute(); fitGraph(); if (['t', 'ex', 'mode'].some((k) => JSON.stringify(before[k]) !== JSON.stringify(state[k]))) selected = null; }
    const traceChanged = before.graph !== state.graph || before.m !== state.m || before.mm !== state.mm;
    if (dataChanged || traceChanged) state = S.reduce(state, { type: 'go', n: state.step }, total());
    if (before.step !== state.step || dataChanged || traceChanged) resetPred();
    if (!(opts && opts.noHash)) writeHash(before.v !== state.v || !!(opts && opts.push));
    const fullEditor = before.v !== state.v || before.lang !== state.lang || before.mode !== state.mode
      || (dataChanged && !(opts && opts.fromEditor));
    render(Object.assign({ fullEditor }, opts));
  }

  // ---------- Paso actual ----------

  function revealedMap(trace, k, hideCurrent) {
    const m = new Map();
    for (let i = 0; i <= k && i < trace.length; i++) {
      if (i === k && hideCurrent) break;
      for (const rv of trace[i].reveals) m.set(PR.key(rv), rv.value);
    }
    return m;
  }

  function predicting(step) {
    return !!state.pred && PR.hasPrediction(step) && !(pred.step === state.step && pred.done);
  }

  // Con la predicción activa, el resumen del taller calla la duración hasta que se revela EF del fin (revisión, H5).
  function durationHidden() {
    const tr = trace();
    if (!state.pred || !tr || !model.solution || prog()) return false;
    const k = Math.min(state.step, tr.length - 1);
    const rev = revealedMap(tr, k, predicting(tr[k]));
    if (pert()) return !rev.has(`${model.net.events.find((e) => e.kind === 'end').n}.TE`);
    return !rev.has(`${C.END}.EF`);
  }

  // ---------- Render ----------

  function renderTexts() {
    document.documentElement.lang = lang();
    document.title = t('app.docTitle');
    document.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(el.getAttribute('data-i18n')); });
    document.querySelectorAll('[data-i18n-label]').forEach((el) => { el.setAttribute('aria-label', t(el.getAttribute('data-i18n-label'))); });
    $('selLang').value = lang();
    $('selNota').value = state.nota;
    $('selBox').value = state.box;
    $('navM0').setAttribute('aria-current', state.v === 'm0' ? 'page' : 'false');
    $('navRoute').setAttribute('aria-current', state.v === 'route' ? 'page' : 'false');
    $('navWork').setAttribute('aria-current', state.v === 'work' ? 'page' : 'false');
    $('navEx').setAttribute('aria-current', state.v === 'ex' ? 'page' : 'false');
    $('navUnc').setAttribute('aria-current', state.v === 'unc' ? 'page' : 'false');
    // F4a: la pestaña se ve al publicarse (T013); hasta entonces solo se llega por enlace.
    $('navUnc').hidden = !UNC_PUBLIC;
    $('navUnc').href = U.encode(uncEntry());
    $('navM0').href = U.encode(m0Entry());
    $('navRoute').href = U.encode(Object.assign({}, state, { v: 'route', t: null, ex: state.ex || 'ej6', step: 0, wi: null }));
    $('navWork').href = U.encode(Object.assign({}, state, { v: 'work', step: 0 }));
    $('navEx').href = U.encode(exEntry());
    $('brandLink').href = `index.html?lang=${lang()}`;
  }

  function render(opts) {
    renderTexts();
    const m0On = state.v === 'm0';
    const exOn = state.v === 'ex';
    const mqOn = state.v === 'moodle';
    $('m0View').hidden = !m0On;
    $('exView').hidden = !exOn;
    $('mqView').hidden = !mqOn;
    const uncOn = state.v === 'unc';
    $('uncView').hidden = !uncOn;
    // La caja del nodo no tiene sentido en el exportador (bocetos de la F3b).
    $('selBox').closest('label').hidden = mqOn;
    if (!mqOn && mqc) mqc.leave();
    if (m0On) { $('workshop').hidden = true; $('stage').hidden = true; m0.render(model, opts); return; }
    if (exOn) { $('workshop').hidden = true; $('stage').hidden = true; exc.render(model, opts); return; }
    if (mqOn) { $('workshop').hidden = true; $('stage').hidden = true; mqc.render(model, opts); return; }
    if (uncOn) { $('workshop').hidden = true; $('stage').hidden = true; uncc.render(model, opts); return; }
    const work = state.v === 'work';
    $('workshop').hidden = !work;
    if (work) editor.render(Object.assign({}, model, { showComputed, numFmt, hideDuration: durationHidden() }), !!(opts && opts.fullEditor));
    const sol = model.solution;
    const tr = trace();
    $('stage').hidden = !tr;
    if (!tr) return;

    const isPert = pert();
    // F2b: el comparador y el reto sustituyen a la red y al panel del paso; sus botones están junto a «Red» y
    // «Lado a lado» (T024 y T026).
    const cmpOn = isPert && state.view === 'cmp';
    const retoOn = isPert && state.view === 'reto';
    $('btnCmp').hidden = !isPert;
    $('btnCmp').setAttribute('aria-pressed', String(cmpOn));
    $('btnReto').hidden = !isPert;
    $('btnReto').setAttribute('aria-pressed', String(retoOn));
    $('cmpView').hidden = !cmpOn;
    $('retoView').hidden = !retoOn;
    $('side').hidden = cmpOn || retoOn;
    for (const id of ['netView', 'selInfo', 'altTable', 'resultsView', 'ganttView', 'matrixView']) if (cmpOn || retoOn) $(id).hidden = true;
    $('boxHint').parentNode.hidden = cmpOn || retoOn;
    if (cmpOn) { $('methodLine').hidden = true; renderCompare(); return; }
    if (retoOn) { $('methodLine').hidden = true; renderReto(); return; }
    $('netView').hidden = false;
    const k = Math.min(state.step, tr.length - 1);
    const step = tr[k];
    const hide = predicting(step);
    const revealed = revealedMap(tr, k, hide);
    const critIdx = tr.findIndex((s) => s.kind === 'critical');
    const criticalOn = critIdx >= 0 && k >= critIdx;
    const ctx = { project: model.project, solution: sol, lay: model.lay, matrix: model.matrix, step, stepIndex: k, revealed,
      box: state.box, lang: lang(), nota: state.nota, criticalOn, numFmt, name: model.name, unit: model.unit, hide, net: model.net };
    const progOn = prog();
    if (progOn) ctx.net = model.progNet;

    $('btnAon').setAttribute('aria-pressed', String(!isPert));
    $('btnAoa').setAttribute('aria-pressed', String(isPert));
    $('btnAon').disabled = !sol;
    // Contador de ficticias (AC9): mientras se predicen las reglas no da números, para no adelantar la respuesta.
    // En el progresivo no hay paso «colocar»: la red se dibuja desde el primer paso de actividad.
    const placeIdx = isPert ? tr.findIndex((s) => s.kind === (progOn ? 'progAct' : 'place')) : -1;
    const countHidden = isPert && !!state.pred && k < placeIdx;
    const count = renderCounter(isPert && !progOn, countHidden);
    // Con min=1 y una red con menos ficticias que las reglas, las dos se ven juntas (y no la ROY de al lado).
    const minOn = !!(count && count.extra && state.min);
    // Lado a lado solo en PERT y con duraciones: los ejemplos solo de estructura no tienen red ROY.
    const side = isPert && state.view === 'side' && !!sol && !minOn && !progOn;
    $('btnNet').setAttribute('aria-pressed', String(!minOn && (state.view === 'net' || (state.view === 'side' && !side))));
    $('btnMatrix').setAttribute('aria-pressed', String(state.view === 'matrix'));
    $('btnMatrix').hidden = isPert;
    $('btnSide').hidden = !isPert || progOn;
    renderMethodLine(progOn);
    $('btnSide').disabled = !sol;
    $('btnSide').setAttribute('aria-pressed', String(side));
    $('stage').classList.toggle('wide', side || minOn);
    // Lado a lado ocupa todo el ancho: el panel del paso pasa debajo de las redes y antes de la tabla
    // de resultados, para que la explicación y los controles sigan junto a ellas (el orden del DOM es
    // el orden de lectura y de tabulación).
    const sideEl = $('side');
    // Dentro de la sección principal deja de ser un punto de referencia (complementary) propio.
    const wide = side || minOn;
    if (wide && sideEl.parentNode !== $('panelMain')) { $('panelMain').insertBefore(sideEl, $('altTable')); sideEl.setAttribute('role', 'none'); }
    else if (!wide && sideEl.parentNode !== $('stage')) { $('stage').appendChild(sideEl); sideEl.removeAttribute('role'); }
    $('unitLine').textContent = t('view.unitLine', { name: model.name, n: model.project.activities.length, unit: model.unit || '—' });
    $('netView').hidden = state.view === 'matrix';
    $('matrixView').hidden = state.view !== 'matrix';

    const pctx = isPert ? pertCtx(ctx, tr, k) : null;
    const numIdx = tr.findIndex((s) => s.kind === (progOn ? 'progEnd' : 'number'));
    const selInfo = NR.selection(selected, Object.assign({}, ctx, { numbered: !isPert || k >= numIdx }));
    const royCtx = (c) => Object.assign({}, c, { selected, selPrecs: selInfo ? selInfo.precs : [], onSelect: toggleSel });
    if (isPert && minOn) {
      minCompare(pctx, count);
      $('boxHint').textContent = t('view.pertHint');
    } else if (isPert) {
      const holder = side ? sideBySide() : $('netView');
      if (progOn && k < placeIdx) G.pertView.predTable(holder, pctx);
      else if (k < placeIdx) G.pertView.succTable(holder, pctx); else G.pertView.render(holder, pctx);
      $('boxHint').textContent = progOn ? t('cmp.progHint') : t(side ? 'view.sideHint' : (k < placeIdx ? 'view.succHint' : 'view.pertHint'));
      if (side) G.royView.render($('royHolder'), royCtx(sideRoyCtx(ctx, tr, k)));
    } else {
      if (state.view === 'net') G.royView.render($('netView'), royCtx(ctx)); else G.matrixView.render($('matrixView'), ctx);
      $('boxHint').textContent = state.view === 'matrix' ? t('view.matrixHint') : NR.relabel(t(`view.boxHint${state.box}`), state.nota);
    }

    renderSelInfo(isPert && k < placeIdx && !minOn ? null : selInfo);

    const lateSteps = ['float', 'floats', 'critical', 'gantt'].includes(step.kind);
    // En PERT la tabla de arcos es la alternativa en texto de la red: se ofrece en todos los pasos desde «colocar».
    const tableOk = isPert ? (progOn ? step.kind === 'progEnd' : k >= placeIdx) : !lateSteps;
    $('btnTable').hidden = !tableOk;
    $('btnTable').textContent = tableOpen ? t('view.hideTable') : t('view.asTable');
    $('btnTable').setAttribute('aria-expanded', String(tableOpen));
    $('altTable').hidden = !tableOpen || !tableOk;
    if (tableOpen && tableOk) { if (isPert) G.pertView.arcTable($('altTable'), pctx); else G.results.table($('altTable'), ctx); }
    $('resultsView').hidden = !lateSteps;
    if (lateSteps) {
      // En PERT, las holguras y el camino crítico son los de ROY (spec, Behaviour): se muestran con su traza completa.
      const rctx = isPert ? Object.assign({}, ctx, { revealed: revealedMap(sol.trace, sol.trace.length - 1, false) }) : ctx;
      const rv = clear($('resultsView'));
      const tb = h('div', { class: 'scroll-box', tabindex: '0' });
      rv.appendChild(tb);
      G.results.table(tb, rctx);
      if (criticalOn) { const pv = h('div', { class: 'paths-box' }); rv.appendChild(pv); G.results.paths(pv, rctx); }
    }
    $('ganttView').hidden = step.kind !== 'gantt';
    if (step.kind === 'gantt') {
      const gv = clear($('ganttView'));
      gv.appendChild(h('p', { class: 'row-wrap small' }, [h('strong', {}, [t(ganttLate ? 'results.late' : 'results.early')]),
        h('button', { type: 'button', class: 'ghost push', onclick: () => { ganttLate = !ganttLate; render(); } }, [t(ganttLate ? 'results.early' : 'results.late')])]));
      const holder = h('div');
      gv.appendChild(holder);
      G.gantt.render(holder, Object.assign({}, ctx, { late: ganttLate }));
    }

    const n = NR.narrate(step, ctx);
    $('stepTitle').textContent = n.title;
    $('stepText').textContent = n.text;
    const f = clear($('formula'));
    // Cada línea se parte solo en los signos «=», para que la fórmula no se corte a mitad de una expresión.
    // En el dibujo progresivo las líneas son frases (por qué cada precedente termina allí o lleva ficticia), no fórmulas.
    const prose = /^prog/.test(step.kind);
    f.classList.toggle('prose', prose);
    if (!hide && prose) n.lines.forEach((line) => f.appendChild(h('p', {}, [line])));
    else if (!hide) {
      n.lines.forEach((line) => {
        const parts = line.split(' = ');
        f.appendChild(h('div', {}, parts.map((p, i) => h('span', { class: 'seg' }, [i < parts.length - 1 ? `${p} = ` : p]))));
      });
    }
    // Si alguna línea no cabe, la fórmula se desplaza en horizontal: entonces también se alcanza con el teclado
    // (WCAG 2.1.1; axe, scrollable-region-focusable). Pasa con las cuatro holguras de la red PERT (T023).
    if (f.scrollWidth > f.clientWidth + 1) {
      f.setAttribute('tabindex', '0'); f.setAttribute('role', 'region'); f.setAttribute('aria-label', t('view.formula'));
    } else { f.removeAttribute('tabindex'); f.removeAttribute('role'); f.removeAttribute('aria-label'); }
    renderPredict(step, hide);
    $('btnWhatIf').hidden = !sol;
    renderWhatIf();
    $('chkPredict').checked = !!state.pred;

    $('stepCounter').textContent = t('player.counter', { i: k + 1, n: tr.length });
    const phase = PHASE[step.kind];
    if (phase) {
      const same = tr.filter((s) => s.kind === step.kind);
      $('phaseCounter').textContent = t('player.phase', { phase: t(`phase.${phase}`), i: same.indexOf(step) + 1, n: same.length });
    } else $('phaseCounter').textContent = '';
    $('barFill').style.width = `${Math.round(((k + 1) / tr.length) * 100)}%`;
    $('btnPrev').disabled = k === 0;
    $('btnFirst').disabled = k === 0;
    $('btnNext').disabled = k >= tr.length - 1 || hide;
    $('btnPlay').textContent = timer ? '⏸' : '▶';
    $('btnPlay').setAttribute('aria-label', t(timer ? 'player.pause' : 'player.play'));
    renderLegend(isPert, minOn && count.emph.length > 0);

    const announce = `${n.title}. ${hide ? t('predict.hidden') : n.text}`;
    if (announce !== lastAnnounced) { $('live').textContent = announce; lastAnnounced = announce; }
  }

  const PHASE = { forward: 'forward', backward: 'backward', float: 'float', eventForward: 'forward', eventBackward: 'backward', progAct: 'prog' };

  // Contexto de views/pert-view: el de ROY más la colocación, la numeración, las duraciones y la selección.
  function pertCtx(ctx, tr, k) {
    const c = Object.assign({}, ctx, {
      lay: model.aoaLay, numbered: k >= tr.findIndex((s) => s.kind === 'number'), succs: model.succs, selected,
      durations: Object.fromEntries(model.project.activities.map((a) => [a.id, a.d])),
      onSelect: toggleSel,
    });
    return prog() ? Object.assign(c, progView(tr, k, ctx.hide)) : c;
  }

  // Dibujo progresivo (F2b, T019): lo dibujado hasta el paso k con la colocación de la red final. Mientras se
  // predice, sin la actividad del paso; después, con ella y sus ficticias resaltadas (AC8).
  function progView(tr, k, hide) {
    const net = model.progNet;
    const step = tr[k];
    const upto = hide ? k - 1 : k;
    const acts = new Set(tr.slice(0, upto + 1).filter((s) => s.kind === 'progAct').map((s) => s.act));
    const dums = new Set(tr.slice(0, upto + 1).flatMap((s) => (s.prog ? s.prog.dummies : [])));
    const done = step.kind === 'progUnique' || step.kind === 'progEnd';
    const visible = done ? null : new Set([...acts, ...dums]);
    const emph = hide || !step.prog ? [] : [step.act, ...step.prog.dummies].filter(Boolean);
    return { net, lay: model.progLay, visible, emph, numbered: step.kind === 'progEnd', act: step.act,
      name: `${model.name} · ${t('cmp.names.prog')}` };
  }

  // Línea del método en el reproductor (solo con m=prog): de dónde viene la red y cómo volver.
  function renderMethodLine(on) {
    const box = clear($('methodLine'));
    box.hidden = !on;
    if (!on) return;
    box.appendChild(h('strong', {}, [t('cmp.progLine')]));
    box.appendChild(h('button', { type: 'button', class: 'linklike', onclick: () => { stopPlay(); dispatch({ type: 'set', key: 'm', value: 'rules' }); } }, [t('cmp.progBackRules')]));
    box.appendChild(h('button', { type: 'button', class: 'linklike', onclick: () => { stopPlay(); dispatch({ type: 'set', key: 'm', value: 'rules' }); dispatch({ type: 'set', key: 'view', value: 'cmp' }); } }, [t('cmp.progBackCmp')]));
  }

  // ---------- Selección compartida y lado a lado (F2a, AC6 y AC7) ----------

  function toggleSel(x) { selected = selected === x ? null : x; render(); }

  // Dos columnas dentro de #netView: la red PERT (devuelve su contenedor) y la ROY (#royHolder).
  function sideBySide() {
    const nd = model.net.dummies.length;
    const count = t(nd === 0 ? 'view.dummiesNone' : nd === 1 ? 'view.dummiesOne' : 'view.dummiesN', { n: nd });
    const pertBox = h('div', { class: 'scroll-box', tabindex: '0', role: 'region', 'aria-label': t('view.graphAoa') });
    const royBox = h('div', { class: 'scroll-box', tabindex: '0', role: 'region', 'aria-label': t('view.graphAon'), id: 'royHolder' });
    clear($('netView')).appendChild(h('div', { class: 'side-by-side' }, [
      h('section', {}, [h('h2', {}, [`${t('view.graphAoa')} · ${count}`]), pertBox]),
      h('section', {}, [h('h2', {}, [`${t('view.graphAon')} · ${t('view.dummiesNone')}`]), royBox]),
    ]));
    return pertBox;
  }

  // La red ROY de al lado enseña el resultado final; mientras se predice, sin valores hasta que la
  // red PERT haya revelado todos los tiempos (paso de holguras), para no adelantar la respuesta.
  function sideRoyCtx(ctx, tr, k) {
    const sol = model.solution;
    const floatsIdx = tr.findIndex((s) => s.kind === 'floats');
    const quiet = !!state.pred && k < floatsIdx;
    return Object.assign({}, ctx, { step: null, hide: false, fit: true, criticalOn: !quiet,
      revealed: quiet ? new Map() : revealedMap(sol.trace, sol.trace.length - 1, false) });
  }

  // ---------- Contador de ficticias y red mínima (F2a, AC9 y AC16) ----------

  // El mínimo solo depende de la estructura (no de las duraciones de «¿Y si…?»). Se calcula después de pintar:
  // el contador dice «calculando…» y cambiar de paso no espera a la búsqueda. Devuelve null mientras tanto.
  function minResult() {
    const project = model.project;
    const key = JSON.stringify(project.activities.map((a) => [a.id, project.succs[a.id]]));
    if (minCache.key === key) return minCache.res;
    minCache = { key, res: null, lay: null };
    setTimeout(() => {
      if (minCache.key !== key) return;
      const res = MD.solve(project);
      minCache = { key, res, lay: AL.layout(res.net) };
      render();
    }, 0);
    return null;
  }

  // Pinta #dummyCounter y devuelve los textos de narrate.dummyCount (null si no se muestra).
  function renderCounter(isPert, hidden) {
    const box = clear($('dummyCounter'));
    box.hidden = !(isPert && model.net);
    if (box.hidden) return null;
    const rules = model.net.dummies.length;
    const res = hidden ? null : minResult();
    const c = NR.dummyCount(hidden ? null : Object.assign({ rules }, res), { lang: lang(), succs: model.succs, hidden });
    const numeric = /^(\d+|\?)$/.test(c.min);
    box.appendChild(h('p', { class: 'count-line' }, [
      h('span', { class: 'eyebrow' }, [c.label]),
      h('span', {}, [h('strong', {}, [c.rules]), ` ${t('count.rules')}`]),
      h('span', {}, numeric ? [h('strong', {}, [c.min]), ` ${t('count.min')}`] : [`${t('count.min')}: `, h('strong', {}, [c.min])]),
    ]));
    if (c.note) box.appendChild(h('p', { class: 'muted small' }, [c.note]));
    const learn = h('button', { type: 'button', class: 'ghost', onclick: () => openLearn({ topic: 'minDummies' }) }, [t('learn.button')]);
    if (c.title) {
      box.appendChild(h('p', { class: 'count-title' }, [h('strong', {}, [c.title])]));
      box.appendChild(h('p', {}, [c.text]));
      box.appendChild(h('div', { class: 'row-wrap' }, [
        h('button', { type: 'button', class: 'ghost', id: 'btnMin', 'aria-pressed': String(!!state.min), onclick: toggleMin }, [c.show]),
        h('button', { type: 'button', class: 'ghost', onclick: openCompare }, [t('count.compare')]),
        learn]));
    } else if (res && !res.exact) box.appendChild(h('div', { class: 'row-wrap' }, [learn]));
    return c;
  }

  // Abre el comparador (T024) o el reto (T026): deja la red mínima al lado y el dibujo progresivo.
  function openView(view) {
    stopPlay();
    if (state.min) dispatch({ type: 'set', key: 'min', value: 0 });
    if (state.m !== 'rules') dispatch({ type: 'set', key: 'm', value: 'rules' });
    dispatch({ type: 'set', key: 'view', value: view });
  }
  const openCompare = () => openView('cmp');

  function toggleMin() {
    stopPlay();
    if (!state.min && state.view === 'side') dispatch({ type: 'set', key: 'view', value: 'net' });
    dispatch({ type: 'set', key: 'min', value: state.min ? 0 : 1 });
  }

  // Las dos redes juntas en #netView: la de las reglas en el paso actual (numerada) y la mínima, con las
  // ficticias que aprovechan precedencias implícitas destacadas y la explicación debajo.
  function minCompare(pctx, c) {
    const res = minCache.res;
    const n = (v) => t(v === 0 ? 'view.dummiesNone' : v === 1 ? 'view.dummiesOne' : 'view.dummiesN', { n: v });
    const rulesBox = h('div', { class: 'scroll-box', tabindex: '0', role: 'region', 'aria-label': t('count.rulesNet') });
    const minBox = h('div', { class: 'scroll-box', tabindex: '0', role: 'region', 'aria-label': c.netTitle });
    const nv = clear($('netView'));
    nv.appendChild(h('div', { class: 'side-by-side' }, [
      h('section', {}, [h('h2', {}, [`${t('count.rulesNet')} · ${n(model.net.dummies.length)}`]), rulesBox]),
      h('section', { class: 'min-net' }, [h('h2', {}, [`${c.netTitle} · ${n(res.value)}`]), minBox]),
    ]));
    nv.appendChild(h('p', { class: 'small count-explain' }, [c.explain]));
    G.pertView.render(rulesBox, Object.assign({}, pctx, { numbered: true }));
    G.pertView.render(minBox, { net: res.net, lay: minCache.lay, revealed: new Map(), step: null, lang: lang(), nota: state.nota,
      numFmt, name: `${model.name} · ${c.netTitle}`, criticalOn: false, numbered: true, emph: c.emph, idPrefix: 'pnl-pm' });
  }

  // ---------- Comparador de métodos (F2b, T017) ----------

  // Tarjetas de los métodos pedidos, guardadas por estructura: cambiar de idioma o de métodos visibles no recalcula.
  function cmpCards(project, methods) {
    const key = JSON.stringify(project.activities.map((a) => [a.id, project.succs[a.id]]));
    if (cmpCache.key !== key) cmpCache = { key, cards: new Map() };
    const missing = methods.filter((m) => m !== 'min' && !cmpCache.cards.has(m));
    if (missing.length) for (const c of CM.run(project, { methods: missing }).cards) cmpCache.cards.set(c.method, c);
    return methods.map((m) => (m === 'min' ? CM.run(project, { methods: ['min'] }).cards[0] : cmpCache.cards.get(m)));
  }

  function renderCompare() {
    const project = model.project;
    const want = CM.METHODS.filter((m) => state.ms.includes(m) || (state.pair && state.pair.includes(m)));
    const res = minResult();
    // Con el mínimo como intervalo, V se corrige con todos los métodos (criterio 19), no solo con los visibles.
    const methods = res && !res.exact ? CM.METHODS : want;
    let cmp = { project, cards: cmpCards(project, methods), min: null };
    if (res) cmp = CM.combine(cmp, res);
    $('boxHint').textContent = '';
    G.compareView.render($('cmpView'), {
      cmp, project, lang: lang(), nota: state.nota, numFmt, name: model.name, ms: state.ms, pair: state.pair,
      onMethods: (ms) => dispatch({ type: 'methods', value: ms }),
      onPair: (pair) => dispatch({ type: 'pair', value: pair }),
      onLearn: (m) => openMethodLearn(m),
      onLearnTopic: (topic) => openLearn(topic),
      // «Ver paso a paso» del dibujo progresivo: el reproductor con su traza, desde el principio (T019).
      onStep: () => { dispatch({ type: 'set', key: 'view', value: 'net' }); dispatch({ type: 'set', key: 'm', value: 'prog' }); dispatch({ type: 'first' }); },
    });
    $('stage').classList.add('wide');
    $('unitLine').textContent = t('view.unitLine', { name: model.name, n: project.activities.length, unit: model.unit || '—' });
    $('btnNet').setAttribute('aria-pressed', 'false');
    $('btnSide').setAttribute('aria-pressed', 'false');
    $('btnSide').hidden = false;
    $('btnSide').disabled = !model.solution;
    $('btnMatrix').hidden = true;
    $('btnAon').setAttribute('aria-pressed', 'false');
    $('btnAoa').setAttribute('aria-pressed', 'true');
    $('btnAon').disabled = !model.solution;
  }

  // ---------- Reto de ficticias (F2b, T021) ----------

  const structKey = (project) => JSON.stringify(project.activities.map((a) => [a.id, project.succs[a.id]]));
  const isStart = (net) => !net.events.length && !net.dummies.length && net.arcs.every((a) => a.from === null && a.to === null);

  // El mínimo con el que se compara la red del alumno: el combinado del comparador (criterio 19), o null mientras se calcula.
  function combinedMin(project) {
    const res = minResult();
    if (!res) return null;
    return CM.combine({ project, cards: cmpCards(project, res.exact ? [] : CM.METHODS), min: null }, res).min;
  }

  // La red del alumno sale de la URL (sn) ajustada a la tabla; si el ajuste la cambia, la URL se corrige.
  function retoState(project) {
    const key = structKey(project);
    const want = JSON.stringify(state.sn || RT.start(project).net);
    if (!reto || reto.key !== key || JSON.stringify(reto.st.net) !== want) {
      if (reto && reto.key !== key) retoSol = null;
      reto = { key, st: RT.fromUrl(project, state.sn) };
      const sn = isStart(reto.st.net) ? null : reto.st.net;
      if (JSON.stringify(sn) !== JSON.stringify(state.sn)) { state = Object.assign({}, state, { sn }); writeHash(false); }
    }
    return reto.st;
  }

  function retoSolution(project, m) {
    if (m === 'min') {
      const min = combinedMin(project);
      return min ? { method: m, net: min.net, dummies: min.net.dummies.length, events: min.net.events.length } : { method: m, net: null };
    }
    const c = cmpCards(project, [m])[0];
    return { method: m, net: c.net, dummies: c.dummies, events: c.events };
  }

  function renderReto() {
    const project = model.project;
    let st = retoState(project);
    // Si se comprobó mientras se calculaba el mínimo, al tenerlo se completa la comparación.
    if (st.result && !st.result.min) {
      const min = combinedMin(project);
      if (min) { st = RT.check(st, project, min); reto.st = st; }
    }
    G.retoTable.render($('retoView'), {
      reto: st, project, lang: lang(), nota: state.nota, numFmt, name: model.name, methods: CM.METHODS,
      solution: retoSol ? retoSolution(project, retoSol) : null, solutionMethod: retoMethod,
      onOp: (op) => {
        const next = RT.apply(reto.st, op);
        if (next === reto.st) return false;
        reto.st = next;
        dispatch({ type: 'sn', value: isStart(next.net) ? null : next.net });
        return true;
      },
      onCheck: () => { reto.st = RT.check(reto.st, project, combinedMin(project)); render(); },
      onSolution: (m) => { retoSol = m; if (m) retoMethod = m; render(); },
      onRepaint: () => render(), live: $('retoLive'),
    });
    $('stage').classList.add('wide');
    $('unitLine').textContent = t('view.unitLine', { name: model.name, n: project.activities.length, unit: model.unit || '—' });
    $('btnNet').setAttribute('aria-pressed', 'false');
    $('btnSide').setAttribute('aria-pressed', 'false');
    $('btnSide').hidden = false;
    $('btnSide').disabled = !model.solution;
    $('btnMatrix').hidden = true;
    $('btnAon').setAttribute('aria-pressed', 'false');
    $('btnAoa').setAttribute('aria-pressed', 'true');
    $('btnAon').disabled = !model.solution;
  }

  // «Aprende más» de un método (AC17): qué hace, qué garantiza, cómo lo aplica el laboratorio y sus referencias.
  function openMethodLearn(m) {
    const L = LR.methods[m];
    const body = clear($('learnBody'));
    $('learnTitle').textContent = L.title[lang()];
    L.what[lang()].forEach((p) => body.appendChild(h('p', {}, [p])));
    body.appendChild(h('h3', {}, [t('cmp.learnGuarantee')]));
    body.appendChild(h('p', {}, [L.guarantee[lang()]]));
    if (L.reading[lang()]) { body.appendChild(h('h3', {}, [t('cmp.learnReading')])); body.appendChild(h('p', {}, [L.reading[lang()]])); }
    body.appendChild(h('h3', {}, [t('learn.refs')]));
    body.appendChild(h('ul', {}, L.refs.map((r) => h('li', {}, [r]))));
    if (L.open && L.open !== state.ex) {
      const href = U.encode(Object.assign({}, state, { v: 'route', t: null, ex: L.open, step: 0, wi: null, graph: 'aoa', view: 'cmp', ms: CM.METHODS.slice(), pair: null, min: 0 }));
      body.appendChild(h('p', {}, [h('a', { href, onclick: () => $('learnDialog').close() }, [t('cmp.learnOpen')])]));
    }
    const dlg = $('learnDialog');
    if (typeof dlg.showModal === 'function') dlg.showModal(); else dlg.setAttribute('open', '');
  }

  function renderSelInfo(info) {
    const box = clear($('selInfo'));
    box.hidden = !info;
    if (!info) return;
    box.appendChild(h('span', { class: 'tag' }, [info.title]));
    box.appendChild(h('p', {}, [info.text]));
    if (info.learn) box.appendChild(h('button', { type: 'button', class: 'ghost', onclick: () => openLearn(info.learn) }, [t('learn.button')]));
    box.appendChild(h('button', { type: 'button', class: 'ghost', onclick: () => toggleSel(selected) }, [t('sel.clear')]));
  }

  function predictLabel(rv) {
    if (rv.act != null) return `${I.notation(state.nota)[rv.field]}(${NR.nodeName(lang(), rv.act)})`;
    return `${rv.field === 'slack' ? t('pert.slackShort') : I.eventNotation(state.nota)[rv.field]}(${rv.event})`;
  }

  function renderPredict(step, hide) {
    const box = clear($('predictBox'));
    const on = !!state.pred && PR.hasPrediction(step);
    box.hidden = !on;
    if (!on) return;
    if (step.rule) box.appendChild(ruleFields(step));
    if (step.kind === 'progAct') box.appendChild(progFields(step));
    const fields = h('div', { class: 'fields' });
    for (const rv of step.reveals) {
      const key = PR.key(rv);
      const res = pred.result ? pred.result.get(key) : null;
      const shown = pred.done && !pred.result;
      const input = h('input', { inputmode: 'decimal', 'aria-label': predictLabel(rv),
        value: shown ? numFmt(rv.value) : (pred.answers.get(key) || ''),
        class: res === 'ok' ? 'ok' : res === 'wrong' ? 'wrong' : '', oninput: (e) => { pred.answers.set(key, e.target.value); } });
      fields.appendChild(h('label', {}, [predictLabel(rv), input,
        res === 'ok' || res === 'wrong' ? h('span', { class: `mark ${res}` }, [res === 'ok' ? `✓ ${t('predict.ok')}` : `✗ ${t('predict.wrong')}`]) : null]));
    }
    if (step.reveals.length) box.appendChild(fields);
    box.appendChild(h('div', { class: 'row-wrap' }, [
      h('button', { type: 'button', class: 'ghost primary', onclick: () => { pred.result = PR.check(step, pred.answers); pred.step = state.step; pred.done = true; render(); } }, [t('predict.check')]),
      h('button', { type: 'button', class: 'ghost', onclick: () => { pred.step = state.step; pred.done = true; pred.result = null; render(); } }, [t('predict.show')]),
    ]));
    const sum = pred.result && PR.summary(pred.result);
    if (sum) box.appendChild(h('p', { class: 'small', role: 'status' }, [t(sum.ok === 1 ? 'predict.summaryOne' : 'predict.summary', sum)]));
    else if (hide) box.appendChild(h('p', { class: 'muted small' }, [t('predict.hidden')]));
  }

  // Paso de regla (AC8): una casilla por actividad y el número de ficticias que crea la regla.
  // Tras comprobar, cada casilla mal puesta dice si falta o sobra; «Mostrar» marca las correctas.
  function ruleFields(step) {
    const shown = pred.done && !pred.result;
    if (!pred.answers.has(PR.RULE_ACTS)) pred.answers.set(PR.RULE_ACTS, new Set());
    const chosen = pred.answers.get(PR.RULE_ACTS);
    const diff = pred.result ? PR.ruleDiff(step, pred.answers) : null;
    const res = pred.result ? pred.result.get(PR.RULE_COUNT) : null;
    const ids = model.project.activities.map((a) => a.id).sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
    const acts = h('fieldset', { class: 'rule-acts' }, [h('legend', {}, [t('predict.ruleActs')]), ...ids.map((a) => {
      const mark = diff && (diff.missing.includes(a) ? 'missing' : diff.extra.includes(a) ? 'extra' : null);
      return h('label', { class: mark ? 'wrong' : '' }, [
        h('input', { type: 'checkbox', value: a, checked: shown ? step.rule.acts.includes(a) : chosen.has(a),
          onchange: (e) => { if (e.target.checked) chosen.add(a); else chosen.delete(a); } }),
        NR.nodeName(lang(), a),
        mark ? h('span', { class: 'mark wrong' }, [`✗ ${t(`predict.${mark}`)}`]) : null]);
    })]);
    const count = h('input', { inputmode: 'numeric', 'aria-label': t('predict.ruleCount'),
      value: shown ? String(step.rule.dummies.length) : (pred.answers.get(PR.RULE_COUNT) || ''),
      class: res === 'ok' ? 'ok' : res === 'wrong' ? 'wrong' : '', oninput: (e) => { pred.answers.set(PR.RULE_COUNT, e.target.value); } });
    const actsRes = pred.result ? pred.result.get(PR.RULE_ACTS) : null;
    return h('div', { class: 'rule-predict' }, [acts,
      actsRes === 'ok' ? h('p', { class: 'mark ok' }, [`✓ ${t('predict.ok')}`]) : null,
      h('label', { class: 'rule-count' }, [t('predict.ruleCount'), count,
        res === 'ok' || res === 'wrong' ? h('span', { class: `mark ${res}` }, [res === 'ok' ? `✓ ${t('predict.ok')}` : `✗ ${t('predict.wrong')}`]) : null])]);
  }

  // Paso del dibujo progresivo (AC8): de qué suceso sale la actividad y, con varias precedentes, cuáles llevan
  // ficticia de dependencia. Tras comprobar, cada opción mal marcada dice si falta o sobra.
  function progFields(step) {
    const shown = pred.done && !pred.result;
    if (!pred.answers.has(PR.PROG_DUMMIES)) pred.answers.set(PR.PROG_DUMMIES, new Set());
    const chosen = pred.answers.get(PR.PROG_DUMMIES);
    const mark = (res) => (res === 'ok' || res === 'wrong' ? h('span', { class: `mark ${res}` }, [res === 'ok' ? `✓ ${t('predict.ok')}` : `✗ ${t('predict.wrong')}`]) : null);
    const startRes = pred.result ? pred.result.get(PR.PROG_START) : null;
    const name = `pnl-prog-start-${state.step}`;
    const start = h('fieldset', { class: 'rule-acts prog-start' }, [h('legend', {}, [t('predict.progStart', { act: step.act })]),
      ...PR.PROG_STARTS.map((v) => h('label', {}, [
        h('input', { type: 'radio', name, value: v, checked: shown ? step.prog.start === v : pred.answers.get(PR.PROG_START) === v,
          onchange: () => pred.answers.set(PR.PROG_START, v) }),
        t(`predict.progStarts.${v}`)])),
      mark(startRes)]);
    const out = h('div', { class: 'rule-predict' }, [start]);
    if (step.prog.preds.length > 1) {
      const want = step.prog.preds.filter((q) => q.how === 'dummy').map((q) => q.act);
      const diff = pred.result ? PR.progDiff(step, pred.answers) : null;
      out.appendChild(h('fieldset', { class: 'rule-acts' }, [h('legend', {}, [t('predict.progDummies')]),
        ...step.prog.preds.map((q) => {
          const m = diff && (diff.missing.includes(q.act) ? 'missing' : diff.extra.includes(q.act) ? 'extra' : null);
          return h('label', { class: m ? 'wrong' : '' }, [
            h('input', { type: 'checkbox', value: q.act, checked: shown ? want.includes(q.act) : chosen.has(q.act),
              onchange: (e) => { if (e.target.checked) chosen.add(q.act); else chosen.delete(q.act); } }),
            q.act, m ? h('span', { class: 'mark wrong' }, [`✗ ${t(`predict.${m}`)}`]) : null]);
        }),
        mark(pred.result ? pred.result.get(PR.PROG_DUMMIES) : null)]));
    }
    return out;
  }

  function renderWhatIf() {
    const box = clear($('whatIfBox'));
    box.hidden = !whatIfOpen;
    $('btnWhatIf').setAttribute('aria-expanded', String(whatIfOpen));
    if (!whatIfOpen) return;
    const acts = model.project.activities;
    const sel = h('select', {}, acts.map((a) => h('option', { value: a.id }, [a.id])));
    const inp = h('input', { type: 'number', min: '0', step: 'any', value: String(acts[0].d) });
    sel.addEventListener('change', () => { inp.value = String(acts.find((a) => a.id === sel.value).d); });
    box.appendChild(h('strong', { style: 'flex-basis:100%' }, [t('whatif.title')]));
    box.appendChild(h('label', {}, [t('whatif.activity'), sel]));
    box.appendChild(h('label', {}, [t('whatif.duration'), inp]));
    box.appendChild(h('button', { type: 'button', class: 'ghost', onclick: () => dispatch({ type: 'whatif', id: sel.value, d: inp.value === '' ? null : Number(inp.value) }) }, [t('whatif.apply')]));
    if (state.wi) {
      box.appendChild(h('button', { type: 'button', class: 'ghost', onclick: () => { for (const [id] of state.wi) dispatch({ type: 'whatif', id, d: null }); } }, [t('whatif.reset')]));
      box.appendChild(h('p', { class: 'small', style: 'flex-basis:100%;margin:0' }, [t('whatif.note', { d: numFmt(model.solution.duration), unit: model.unit, d0: numFmt(model.base.duration) })]));
    }
  }

  function renderLegend(isPert, implied) {
    const lg = clear($('legend'));
    const sw = (style, label) => h('span', {}, [h('span', { class: 'sw', style, 'aria-hidden': 'true' }), label]);
    lg.appendChild(sw('border:2.5px solid var(--accent);background:var(--accent-soft)', t('legend.active')));
    lg.appendChild(sw('height:0;border-top:3px solid var(--accent)', t('legend.chosen')));
    lg.appendChild(sw('height:0;border-top:2px dashed var(--accent)', t('legend.compared')));
    lg.appendChild(sw('border:2.5px solid var(--critical)', t('legend.critical')));
    if (isPert) {
      lg.appendChild(sw('height:0;border-top:2px dashed var(--edge)', t('legend.dummy')));
      lg.appendChild(sw('height:0;border-top:3px solid var(--select)', t('legend.rule')));
      if (implied) lg.appendChild(sw('height:0;border-top:3px dashed var(--select)', t('legend.implied')));
    }
  }

  // Con un tema (el de la regla de una ficticia seleccionada), «Aprende más» abre ese tema. Con { topic }, un
  // tema que no es de ningún paso (el del contador): su pseudocódigo es el de colocar la red.
  function openLearn(forTopic) {
    const tr = trace();
    if (!tr) return;
    const cur = tr[Math.min(state.step, tr.length - 1)];
    const own = forTopic && typeof forTopic === 'object' ? forTopic.topic : null;
    // El tema de una regla vive en la traza PERT, también si se abre desde la red ROY.
    const kind = own ? 'place' : forTopic;
    const ruleStep = typeof kind === 'string' && model.net ? model.net.trace.find((s) => s.kind === kind) : null;
    const graph = ruleStep ? 'aoa' : state.graph;
    const step = ruleStep || cur;
    const topic = own || LR.topicFor(step, state.view, graph);
    const body = clear($('learnBody'));
    $('learnTitle').textContent = own ? t('count.learnTitle')
      : NR.narrate(step, { lang: lang(), nota: state.nota, solution: model.solution, project: model.project, unit: model.unit, net: model.net }).title;
    LR.topics[topic][lang()].forEach((p) => body.appendChild(h('p', {}, [p])));
    if (LR.schemes[topic]) renderScheme(body, LR.schemes[topic], topic);
    if (['table', 'build', 'succTable'].includes(topic)) { body.appendChild(h('h3', {}, [t('learn.history')])); body.appendChild(h('p', {}, [LR.history[lang()]])); }
    body.appendChild(h('h3', {}, [t('learn.pseudo')]));
    const on = new Set(LR.pseudoLines(step, graph));
    const code = graph === 'aoa' ? LR.pseudoPert : LR.pseudo;
    body.appendChild(h('pre', { class: 'code', tabindex: '0', role: 'region', 'aria-label': t('learn.pseudo') }, code[lang()].map((line, i) => h('span', { class: on.has(i) ? 'on' : '' }, [line]))));
    body.appendChild(h('h3', {}, [t('learn.refs')]));
    body.appendChild(h('ul', {}, LR.refs.map((r) => h('li', {}, [r]))));
    const dlg = $('learnDialog');
    if (typeof dlg.showModal === 'function') dlg.showModal(); else dlg.setAttribute('open', '');
  }

  // «Aprende más» de M0 (F2c, T018): precedencias inmediatas, transitivas y redundantes, depurar y leer el texto.
  function openM0Learn() { openTopicLearn('m0Narr.learnTitle', 'm0'); }
  // «Aprende más» de «Ejercicios» (F3a, T015): el mismo diálogo, con su tema.
  function openExLearn() { openTopicLearn('ex.learnTitle', 'ex'); }
  function openTopicLearn(titleKey, topic) {
    const body = clear($('learnBody'));
    $('learnTitle').textContent = t(titleKey);
    LR.topics[topic][lang()].forEach((p) => body.appendChild(h('p', {}, [p])));
    // F3b (T012): «Ejercicios» termina con el enlace al exportador de Moodle (tablero 56).
    if (topic === 'ex') {
      const close = () => { const d = $('learnDialog'); if (typeof d.close === 'function') d.close(); else d.removeAttribute('open'); };
      body.appendChild(h('p', {}, [t('ex.learnMoodle'), ' ', h('a', { id: 'exLearnMoodle', href: U.encode({ v: 'moodle', lang: lang(), nota: state.nota }), onclick: close }, [t('ex.moodle')]), '.']));
    }
    body.appendChild(h('h3', {}, [t('learn.refs')]));
    body.appendChild(h('ul', {}, LR.refs.map((r) => h('li', {}, [r]))));
    const dlg = $('learnDialog');
    if (typeof dlg.showModal === 'function') dlg.showModal(); else dlg.setAttribute('open', '');
  }

  // Esquema de ejemplo de una regla de los conjuntos: tabla horizontal y dibujo, como en los apuntes del autor.
  function renderScheme(body, sc, key) {
    const hl = new Set(sc.table.hl);
    const cell = (xs) => h('td', {}, xs.flatMap((x, i) => [i ? ', ' : null, hl.has(x) ? h('strong', { class: 'hl' }, [x]) : x]));
    const row = (key, cells, head) => h('tr', {}, [h('th', { scope: 'row' }, [t(key)]), ...cells.map((c) => (head ? h('td', {}, [h('strong', {}, [c])]) : cell(c)))]);
    const rows = [];
    if (sc.table.pre) rows.push(row('learn.schemePre', sc.table.pre.map((x) => [x])));
    rows.push(row('learn.schemeAct', sc.table.act, true));
    rows.push(row('learn.schemePost', sc.table.post));
    const pic = h('div', { class: 'scheme-pic' });
    body.appendChild(h('h3', {}, [t('learn.example')]));
    body.appendChild(h('figure', { class: 'scheme-box' }, [
      h('table', { class: 'data scheme-tab' }, [h('caption', { class: 'sr-only' }, [t('learn.schemeTable')]), h('tbody', {}, rows)]),
      pic,
      h('figcaption', { class: 'muted small' }, [LR.schemeCredit[lang()]]),
    ]));
    G.pertView.scheme(pic, sc, lang(), key);
  }

  // ---------- Reproductor y teclado ----------

  function stopPlay() { if (timer) { clearInterval(timer); timer = null; } }
  function togglePlay() {
    if (timer) { stopPlay(); render(); return; }
    timer = setInterval(() => {
      const tr = trace();
      const step = tr && tr[state.step];
      if (!step || state.step >= total() - 1 || predicting(step)) { stopPlay(); render(); return; }
      dispatch({ type: 'next' });
    }, 1800);
    render();
  }

  // Cambiar de red lleva al paso equivalente de la otra traza (plan §4).
  function switchGraph(value) {
    if (value === state.graph) return;
    const from = trace();
    const to = value === 'aoa' ? (model.net && model.net.trace) : (model.solution && model.solution.trace);
    if (!to) return;
    stopPlay();
    dispatch({ type: 'graph', value, step: from ? S.equivalentStep(from, Math.min(state.step, from.length - 1), to) : 0 });
  }

  function workRows(rows) {
    return rows.map((r) => ({ id: r.id, name: nameOf(r), duration: r.duration == null ? '' : String(r.duration), links: r.links }));
  }

  function bind() {
    $('btnNext').addEventListener('click', () => dispatch({ type: 'next' }));
    $('btnPrev').addEventListener('click', () => dispatch({ type: 'prev' }));
    $('btnFirst').addEventListener('click', () => dispatch({ type: 'first' }));
    $('btnPlay').addEventListener('click', togglePlay);
    // «Red» y «Lado a lado» dejan la comparación con la red mínima.
    $('btnNet').addEventListener('click', () => { if (state.min) dispatch({ type: 'set', key: 'min', value: 0 }); dispatch({ type: 'set', key: 'view', value: 'net' }); });
    $('btnMatrix').addEventListener('click', () => dispatch({ type: 'set', key: 'view', value: 'matrix' }));
    $('btnSide').addEventListener('click', () => { if (state.min) dispatch({ type: 'set', key: 'min', value: 0 }); dispatch({ type: 'set', key: 'view', value: 'side' }); });
    $('btnCmp').addEventListener('click', openCompare);
    $('btnReto').addEventListener('click', () => openView('reto'));
    $('btnAon').addEventListener('click', () => switchGraph('aon'));
    $('btnAoa').addEventListener('click', () => switchGraph('aoa'));
    $('selLang').addEventListener('change', (e) => {
      // En M0, los subrayados pasan al otro idioma por los fragmentos del enunciado (F2c, AC17).
      if (state.v === 'm0') {
        const moved = G.m0.switchLang(state, lang(), e.target.value);
        dispatch({ type: 'set', key: 'lang', value: e.target.value }, { noHash: true });
        m0.langNotice(moved.dropped);
        dispatch({ type: 'marks', value: moved.marks }, { fullEditor: true });
        return;
      }
      dispatch({ type: 'set', key: 'lang', value: e.target.value });
    });
    $('selNota').addEventListener('change', (e) => dispatch({ type: 'set', key: 'nota', value: e.target.value }));
    $('selBox').addEventListener('change', (e) => dispatch({ type: 'set', key: 'box', value: e.target.value }));
    $('chkPredict').addEventListener('change', (e) => dispatch({ type: 'set', key: 'pred', value: e.target.checked ? 1 : 0 }));
    $('btnTable').addEventListener('click', () => { tableOpen = !tableOpen; render(); });
    $('btnWhatIf').addEventListener('click', () => { whatIfOpen = !whatIfOpen; render(); });
    $('btnLearn').addEventListener('click', () => (prog() ? openMethodLearn('prog') : openLearn()));
    $('btnLearnClose').addEventListener('click', () => $('learnDialog').close());
    // F2c, T020 (P10): la pestaña de M0 abre practicar con el enunciado de antes (o Electrona) y su tabla vacía.
    $('navM0').addEventListener('click', (e) => { e.preventDefault(); toM0(); });
    $('navEx').addEventListener('click', (e) => { e.preventDefault(); toEx(); });
    $('navUnc').addEventListener('click', (e) => { e.preventDefault(); toUnc(); });
    $('navRoute').addEventListener('click', (e) => { e.preventDefault(); stopPlay(); dispatch({ type: 'example', id: state.ex || 'ej6' }, { noHash: state.v === 'm0' }); dispatch({ type: 'route' }); });
    $('navWork').addEventListener('click', (e) => { e.preventDefault(); stopPlay(); if (state.v !== 'work') dispatch({ type: 'work', rows: workRows(model.rows), mode: model.mode }); });
    document.addEventListener('keydown', (e) => {
      const tag = (e.target.tagName || '').toLowerCase();
      const m0Route = state.v === 'm0' && state.mm === 'route';
      // F4a (T011): el paso a paso de «Duraciones inciertas» usa el reproductor de la página con su propia botonera.
      const uncRoute = state.v === 'unc' && !!trace();
      if (['input', 'select', 'textarea'].includes(tag) || $('learnDialog').open || ($('stage').hidden && !m0Route && !uncRoute) || !$('cmpView').hidden || !$('retoView').hidden) return;
      // El texto en modo «Subrayar» y la matriz de M0 usan las flechas para moverse (F2c, plan §0).
      if (e.target.closest && e.target.closest('[data-own-keys]')) return;
      if (tag === 'button' && (e.key === ' ' || e.key === 'Enter')) return;
      const nextOff = uncRoute ? state.step >= total() - 1 || predicting(trace()[state.step]) : $('btnNext').disabled;
      if (e.key === 'ArrowRight' && !nextOff) { e.preventDefault(); dispatch({ type: 'next' }); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); dispatch({ type: 'prev' }); }
      else if (e.key === 'Home') { e.preventDefault(); dispatch({ type: 'first' }); }
      else if (e.key === ' ' && !uncRoute) { e.preventDefault(); togglePlay(); }
    });
    window.addEventListener('hashchange', () => {
      if (location.hash === U.encode(state)) return;
      const groups = groupsOf(location.hash).filter((g) => g && !READY[g]());
      if (groups.length) { needAll(groups).then(() => window.dispatchEvent(new Event('hashchange'))); return; }
      // Otro ejemplo u otra tabla: la selección era de la red anterior (revisión de cierre, F4).
      const before = state;
      load();
      if (['t', 'ex', 'mode'].some((k) => JSON.stringify(before[k]) !== JSON.stringify(state[k]))) selected = null;
      render({ fullEditor: true });
    });
  }

  function load() {
    const { state: s, warning } = U.decode(location.hash);
    const q = new URLSearchParams(location.search).get('lang');
    if (!s.lang) s.lang = q === 'en' || q === 'es' ? q : ((navigator.language || '').toLowerCase().startsWith('en') ? 'en' : 'es');
    // F2c, T022: el enlace con la solución de un enunciado propio se abre con la tabla y los subrayados del docente.
    state = G.m0 ? G.m0.openSolution(s) : s;
    // «Ejercicios» sin semilla: la interfaz elige una (nunca el núcleo, plan §0) y se escribe con replaceState.
    if (state.v === 'ex' && !state.sd) state = Object.assign({}, state, { sd: newSeed() });
    // F3c: un enunciado al azar sin semilla también la recibe de la interfaz, con la versión actual del generador.
    if (state.v === 'm0' && state.st === 'gen' && !state.sd && G.stmtgen) {
      state = Object.assign({}, state, { sd: G.m0.genSeed(newSeed(), state.lv, state.cx), sv: G.stmtgen.VERSION });
    }
    // Y si la semilla del enlace no da enunciado, la siguiente que lo dé (spec, Behaviour; revisión de la F3c, F7).
    if (state.v === 'm0' && state.st === 'gen' && state.sd && G.stmtgen) state = G.m0.genFix(state);
    compute();
    fitGraph();
    state = S.reduce(state, { type: 'go', n: state.step }, total());
    resetPred();
    const banner = $('urlWarning');
    banner.hidden = !warning;
    if (warning) banner.textContent = I.t(state.lang, warning === 'structureOnly' ? 'app.structureOnlyWarning' : 'app.urlWarning');
  }

  // Semilla nueva con crypto.getRandomValues (file:// y GitHub Pages); si faltara, con la hora (fuera del núcleo).
  function newSeed() {
    const c = window.crypto;
    if (c && c.getRandomValues) return 1 + (c.getRandomValues(new Uint32Array(1))[0] % 999999);
    return 1 + (Date.now() % 999999);
  }

  function ensureControllers() {
    if (G.m0 && !m0) createM0();
    if (G.ex && !exc) {
      exc = G.ex.create($('exView'), {
        state: () => state, lang, dispatch, newSeed, need,
        // «Ver la solución paso a paso» (AC12): la ruta (o los sucesos) con la misma tabla, con entrada en el historial.
        open: (s) => { stopPlay(); dispatch({ type: 'open', v: s.v, graph: s.graph, rows: s.rows, mode: s.mode }, { push: true }); window.scrollTo(0, 0); },
        announce: (text) => { if (text !== lastAnnounced) { $('live').textContent = text; lastAnnounced = text; } },
        learn: openExLearn,
      });
      G.ex.state = () => exc.debug();
    }
    if (G.moodlePage && !mqc) {
      mqc = G.moodlePage.create($('mqView'), {
        state: () => state, lang,
        announce: (text) => { if (text !== lastAnnounced) { $('live').textContent = text; lastAnnounced = text; } },
      });
      G.moodlePage.state = () => mqc.debug();
    }
    if (G.unc && !uncc) {
      uncc = G.unc.create($('uncView'), {
        state: () => state, lang, dispatch, newSeed, need,
        // Paso a paso (T011): la predicción de la página, como en la ruta de M0.
        pred: () => pred, predicting,
        predCheck: (step) => { pred.result = PR.check(step, pred.answers); pred.step = state.step; pred.done = true; render(); },
        predShow: () => { pred.step = state.step; pred.done = true; pred.result = null; render(); },
        // «Partir del taller»: la tabla del taller (o el ejemplo que muestra) con su forma; a = m = b = la duración.
        workRows: () => {
          if (state.t) return { rows: workRows(state.t), mode: state.mode };
          const ex = EX.get(state.ex) || EX.get('ej6');
          return { rows: workRows(ex.rows), mode: ex.mode };
        },
        announce: (text) => { if (text !== lastAnnounced) { $('live').textContent = text; lastAnnounced = text; } },
      });
      G.unc.state = () => uncc.debug();
    }
  }

  function createM0() {
    m0 = G.m0.create($('m0View'), {
      state: () => state, lang, dispatch, newSeed, need,
      // La tabla depurada se abre en M1, M2 o el taller con una entrada nueva en el historial: «Atrás» vuelve a M0.
      open: (where, rows, mode) => { stopPlay(); const s = G.m0.openState(state, where, rows, mode); dispatch({ type: 'open', v: s.v, graph: s.graph, rows, mode }); window.scrollTo(0, 0); },
      // Ruta paso a paso (T018): el reproductor y la predicción son los de la página.
      pred: () => pred, predicting,
      predCheck: (step) => { pred.result = PR.check(step, pred.answers); pred.step = state.step; pred.done = true; render(); },
      predShow: () => { pred.step = state.step; pred.done = true; pred.result = null; render(); },
      togglePlay, playing: () => !!timer, stop: stopPlay,
      announce: (text) => { if (text !== lastAnnounced) { $('live').textContent = text; lastAnnounced = text; } },
      learn: openM0Learn,
    });
    G.m0.state = () => m0.debug();
  }

  function init() {
    ensureControllers();
    editor = G.editor.create($('workshop'), {
      state: () => state, lang, dispatch,
      loadExample: (id) => { const ex = EX.get(id); dispatch({ type: 'work', rows: workRows(ex.rows), mode: ex.mode }); },
      switchMode: (mode) => {
        // Si la tabla es válida se convierte a la otra forma; si no, solo cambia cómo se leen las precedencias.
        const rows = model.project ? workRows(P.toRows(model.project, mode)) : state.t;
        dispatch({ type: 'work', rows, mode });
      },
      toggleComputed: (v) => { showComputed = v; render(); },
      toM0,
      // «Tabla al azar» (F3a, T013): semilla nueva de la interfaz, tabla del generador en la forma elegida y entrada en el
      // historial («Atrás» recupera la anterior). La tabla va en t, como siempre, sin semilla.
      random: (level) => {
        const rows = G.editor.randomRows(newSeed(), level, state.mode);
        dispatch({ type: 'work', rows, mode: state.mode }, { push: true });
        return rows;
      },
      goStage: (where) => {
        // «Comparar métodos» (T024) y «Reto de ficticias» (T026) se abren sobre la red PERT de la tabla.
        if (where === 'cmp' || where === 'reto') {
          if (!pert()) dispatch({ type: 'graph', value: 'aoa', step: 0 });
          openView(where);
          $('stage').scrollIntoView({ behavior: 'smooth', block: 'start' });
          return;
        }
        const n = where === 'critical' ? trace().findIndex((s) => s.kind === 'critical') : 0;
        dispatch({ type: 'go', n });
        $('stage').scrollIntoView({ behavior: 'smooth', block: 'start' });
      },
    });
    load();
    writeHash(false);
    bind();
    render({ fullEditor: true });
  }

  function start() {
    init();
    G.app = { state: () => Object.assign({ sel: selected }, state), step: () => { const tr = trace(); return tr ? tr[state.step] : null; }, go: (n) => dispatch({ type: 'go', n }), model: () => model,
      reto: () => (reto ? { net: reto.st.net, result: reto.st.result, solution: retoSol } : null) };
  }
  needAll(groupsOf(location.hash)).then(start, start);
})();
