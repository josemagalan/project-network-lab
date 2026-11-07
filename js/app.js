/*
 * app — controlador de la página: estado (store) ↔ URL viva (urlstate), cálculo (core) y vistas.
 * Cada cambio pasa por dispatch(): reduce el estado, recalcula si cambian los datos, reescribe el
 * #hash y vuelve a pintar. Las vistas solo leen la Solution y el paso actual (plan f1-cpm-roy §2).
 * Para las pruebas de navegador expone PNL.app.state(), PNL.app.step() y PNL.app.go(n).
 */
(function () {
  'use strict';

  const G = window.PNL;
  const { i18n: I, urlstate: U, store: S, project: P, cpm: C, matrix: MX, examples: EX, narrate: NR,
    layout: L, predict: PR, learn: LR, dom } = G;
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

  const lang = () => state.lang || 'es';
  const t = (k, p) => I.t(lang(), k, p);
  const numFmt = (v) => NR.fmt(lang(), v);
  const nameOf = (r) => (r.name && typeof r.name === 'object' ? r.name[lang()] : (r.name || ''));

  // ---------- Modelo ----------

  function compute() {
    let rows; let mode; let name; let unit = '';
    if (state.t) {
      rows = state.t; mode = state.mode; name = t('nav.work');
    } else {
      const ex = EX.get(state.ex) || EX.get('ej6');
      rows = ex.rows.map((r) => Object.assign({}, r, { name: nameOf(r) }));
      mode = ex.mode; name = ex.title[lang()]; unit = ex.unit[lang()];
    }
    const { project, report } = P.parse(rows, mode);
    // Un ejemplo abierto en el Taller se muestra en la forma elegida (predecesoras o posteriores).
    if (!state.t && state.v === 'work' && project && state.mode !== mode) { rows = P.toRows(project, state.mode); mode = state.mode; }
    model = { rows, mode, name, unit, project: null, base: null, report, solution: null, matrix: null, lay: null };
    if (!project) return;
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
  }

  const total = () => (model && model.solution ? model.solution.trace.length : 1);

  function writeHash(push) {
    const hash = U.encode(state);
    if (location.hash === hash) return;
    if (push) history.pushState(null, '', hash); else history.replaceState(null, '', hash);
  }

  function resetPred() { pred = { step: state.step, answers: new Map(), result: null, done: false }; }

  function dispatch(action, opts) {
    const before = state;
    state = S.reduce(state, action, total());
    const dataChanged = ['t', 'ex', 'mode', 'wi', 'lang'].some((k) => JSON.stringify(before[k]) !== JSON.stringify(state[k]));
    if (dataChanged) { compute(); state = S.reduce(state, { type: 'go', n: state.step }, total()); }
    if (before.step !== state.step || dataChanged) resetPred();
    writeHash(before.v !== state.v);
    const fullEditor = before.v !== state.v || before.lang !== state.lang || before.mode !== state.mode
      || (dataChanged && !(opts && opts.fromEditor));
    render(Object.assign({ fullEditor }, opts));
  }

  // ---------- Paso actual ----------

  function revealedMap(trace, k, hideCurrent) {
    const m = new Map();
    for (let i = 0; i <= k && i < trace.length; i++) {
      if (i === k && hideCurrent) break;
      for (const rv of trace[i].reveals) m.set(`${rv.act}.${rv.field}`, rv.value);
    }
    return m;
  }

  function predicting(step) {
    return !!state.pred && PR.hasPrediction(step) && !(pred.step === state.step && pred.done);
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
    $('navRoute').setAttribute('aria-current', state.v === 'route' ? 'page' : 'false');
    $('navWork').setAttribute('aria-current', state.v === 'work' ? 'page' : 'false');
    $('navRoute').href = U.encode(Object.assign({}, state, { v: 'route', t: null, ex: state.ex || 'ej6', step: 0, wi: null }));
    $('navWork').href = U.encode(Object.assign({}, state, { v: 'work', step: 0 }));
    $('brandLink').href = `index.html?lang=${lang()}`;
  }

  function render(opts) {
    renderTexts();
    const work = state.v === 'work';
    $('workshop').hidden = !work;
    if (work) editor.render(Object.assign({}, model, { showComputed, numFmt }), !!(opts && opts.fullEditor));
    const sol = model.solution;
    $('stage').hidden = !sol;
    if (!sol) return;

    const trace = sol.trace;
    const k = Math.min(state.step, trace.length - 1);
    const step = trace[k];
    const hide = predicting(step);
    const revealed = revealedMap(trace, k, hide);
    const critIdx = trace.findIndex((s) => s.kind === 'critical');
    const criticalOn = k >= critIdx;
    const ctx = { project: model.project, solution: sol, lay: model.lay, matrix: model.matrix, step, stepIndex: k, revealed,
      box: state.box, lang: lang(), nota: state.nota, criticalOn, numFmt, name: model.name, unit: model.unit };

    $('btnNet').setAttribute('aria-pressed', String(state.view === 'net'));
    $('btnMatrix').setAttribute('aria-pressed', String(state.view === 'matrix'));
    $('unitLine').textContent = t('view.unitLine', { name: model.name, n: model.project.activities.length, unit: model.unit || '—' });
    $('netView').hidden = state.view !== 'net';
    $('matrixView').hidden = state.view !== 'matrix';
    if (state.view === 'net') G.royView.render($('netView'), ctx); else G.matrixView.render($('matrixView'), ctx);
    $('boxHint').textContent = state.view === 'matrix' ? t('view.matrixHint') : NR.relabel(t(`view.boxHint${state.box}`), state.nota);

    const lateSteps = step.kind === 'float' || step.kind === 'critical' || step.kind === 'gantt';
    $('btnTable').hidden = lateSteps;
    $('btnTable').textContent = tableOpen ? t('view.hideTable') : t('view.asTable');
    $('btnTable').setAttribute('aria-expanded', String(tableOpen));
    $('altTable').hidden = !tableOpen || lateSteps;
    if (tableOpen && !lateSteps) G.results.table($('altTable'), ctx);
    $('resultsView').hidden = !lateSteps;
    if (lateSteps) {
      const rv = clear($('resultsView'));
      const tb = h('div', { class: 'scroll-box', tabindex: '0' });
      rv.appendChild(tb);
      G.results.table(tb, ctx);
      if (criticalOn) { const pv = h('div', { class: 'paths-box' }); rv.appendChild(pv); G.results.paths(pv, ctx); }
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
    if (!hide) {
      n.lines.forEach((line) => {
        const parts = line.split(' = ');
        f.appendChild(h('div', {}, parts.map((p, i) => h('span', { class: 'seg' }, [i < parts.length - 1 ? `${p} = ` : p]))));
      });
    }
    renderPredict(step, hide);
    renderWhatIf();
    $('chkPredict').checked = !!state.pred;

    $('stepCounter').textContent = t('player.counter', { i: k + 1, n: trace.length });
    if (step.kind === 'forward' || step.kind === 'backward' || step.kind === 'float') {
      const same = trace.filter((s) => s.kind === step.kind);
      $('phaseCounter').textContent = t('player.phase', { phase: t(`phase.${step.kind}`), i: same.indexOf(step) + 1, n: same.length });
    } else $('phaseCounter').textContent = '';
    $('barFill').style.width = `${Math.round(((k + 1) / trace.length) * 100)}%`;
    $('btnPrev').disabled = k === 0;
    $('btnFirst').disabled = k === 0;
    $('btnNext').disabled = k >= trace.length - 1 || hide;
    $('btnPlay').textContent = timer ? '⏸' : '▶';
    $('btnPlay').setAttribute('aria-label', t(timer ? 'player.pause' : 'player.play'));
    renderLegend();

    const announce = `${n.title}. ${hide ? t('predict.hidden') : n.text}`;
    if (announce !== lastAnnounced) { $('live').textContent = announce; lastAnnounced = announce; }
  }

  function renderPredict(step, hide) {
    const box = clear($('predictBox'));
    const on = !!state.pred && PR.hasPrediction(step);
    box.hidden = !on;
    if (!on) return;
    const N = I.notation(state.nota);
    const fields = h('div', { class: 'fields' });
    for (const rv of step.reveals) {
      const key = PR.key(rv);
      const res = pred.result ? pred.result.get(key) : null;
      const shown = pred.done && !pred.result;
      const input = h('input', { inputmode: 'decimal', 'aria-label': `${N[rv.field]}(${rv.act})`,
        value: shown ? numFmt(rv.value) : (pred.answers.get(key) || ''),
        class: res === 'ok' ? 'ok' : res === 'wrong' ? 'wrong' : '', oninput: (e) => { pred.answers.set(key, e.target.value); } });
      fields.appendChild(h('label', {}, [`${N[rv.field]}(${NR.nodeName(lang(), rv.act)})`, input,
        res === 'ok' || res === 'wrong' ? h('span', { class: `mark ${res}` }, [res === 'ok' ? `✓ ${t('predict.ok')}` : `✗ ${t('predict.wrong')}`]) : null]));
    }
    box.appendChild(fields);
    box.appendChild(h('div', { class: 'row-wrap' }, [
      h('button', { type: 'button', class: 'ghost primary', onclick: () => { pred.result = PR.check(step, pred.answers); pred.step = state.step; pred.done = true; render(); } }, [t('predict.check')]),
      h('button', { type: 'button', class: 'ghost', onclick: () => { pred.step = state.step; pred.done = true; pred.result = null; render(); } }, [t('predict.show')]),
    ]));
    if (pred.result) box.appendChild(h('p', { class: 'small', role: 'status' }, [t('predict.summary', PR.summary(pred.result))]));
    else if (hide) box.appendChild(h('p', { class: 'muted small' }, [t('predict.hidden')]));
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

  function renderLegend() {
    const lg = clear($('legend'));
    const sw = (style, label) => h('span', {}, [h('span', { class: 'sw', style, 'aria-hidden': 'true' }), label]);
    lg.appendChild(sw('border:2.5px solid var(--accent);background:var(--accent-soft)', t('legend.active')));
    lg.appendChild(sw('height:0;border-top:3px solid var(--accent)', t('legend.chosen')));
    lg.appendChild(sw('height:0;border-top:2px dashed var(--accent)', t('legend.compared')));
    lg.appendChild(sw('border:2.5px solid var(--critical)', t('legend.critical')));
  }

  function openLearn() {
    const sol = model.solution;
    if (!sol) return;
    const step = sol.trace[state.step];
    const topic = LR.topicFor(step, state.view);
    const body = clear($('learnBody'));
    $('learnTitle').textContent = NR.narrate(step, { lang: lang(), nota: state.nota, solution: sol, project: model.project, unit: model.unit }).title;
    LR.topics[topic][lang()].forEach((p) => body.appendChild(h('p', {}, [p])));
    if (topic === 'table' || topic === 'build') { body.appendChild(h('h3', {}, [t('learn.history')])); body.appendChild(h('p', {}, [LR.history[lang()]])); }
    body.appendChild(h('h3', {}, [t('learn.pseudo')]));
    const on = new Set(LR.pseudoLines(step));
    body.appendChild(h('pre', { class: 'code', tabindex: '0', 'aria-label': t('learn.pseudo') }, LR.pseudo[lang()].map((line, i) => h('span', { class: on.has(i) ? 'on' : '' }, [line]))));
    body.appendChild(h('h3', {}, [t('learn.refs')]));
    body.appendChild(h('ul', {}, LR.refs.map((r) => h('li', {}, [r]))));
    const dlg = $('learnDialog');
    if (typeof dlg.showModal === 'function') dlg.showModal(); else dlg.setAttribute('open', '');
  }

  // ---------- Reproductor y teclado ----------

  function stopPlay() { if (timer) { clearInterval(timer); timer = null; } }
  function togglePlay() {
    if (timer) { stopPlay(); render(); return; }
    timer = setInterval(() => {
      const step = model.solution && model.solution.trace[state.step];
      if (!step || state.step >= total() - 1 || predicting(step)) { stopPlay(); render(); return; }
      dispatch({ type: 'next' });
    }, 1800);
    render();
  }

  function workRows(rows) {
    return rows.map((r) => ({ id: r.id, name: nameOf(r), duration: String(r.duration), links: r.links }));
  }

  function bind() {
    $('btnNext').addEventListener('click', () => dispatch({ type: 'next' }));
    $('btnPrev').addEventListener('click', () => dispatch({ type: 'prev' }));
    $('btnFirst').addEventListener('click', () => dispatch({ type: 'first' }));
    $('btnPlay').addEventListener('click', togglePlay);
    $('btnNet').addEventListener('click', () => dispatch({ type: 'set', key: 'view', value: 'net' }));
    $('btnMatrix').addEventListener('click', () => dispatch({ type: 'set', key: 'view', value: 'matrix' }));
    $('selLang').addEventListener('change', (e) => dispatch({ type: 'set', key: 'lang', value: e.target.value }));
    $('selNota').addEventListener('change', (e) => dispatch({ type: 'set', key: 'nota', value: e.target.value }));
    $('selBox').addEventListener('change', (e) => dispatch({ type: 'set', key: 'box', value: e.target.value }));
    $('chkPredict').addEventListener('change', (e) => dispatch({ type: 'set', key: 'pred', value: e.target.checked ? 1 : 0 }));
    $('btnTable').addEventListener('click', () => { tableOpen = !tableOpen; render(); });
    $('btnWhatIf').addEventListener('click', () => { whatIfOpen = !whatIfOpen; render(); });
    $('btnLearn').addEventListener('click', openLearn);
    $('btnLearnClose').addEventListener('click', () => $('learnDialog').close());
    $('navRoute').addEventListener('click', (e) => { e.preventDefault(); stopPlay(); dispatch({ type: 'example', id: state.ex || 'ej6' }); dispatch({ type: 'route' }); });
    $('navWork').addEventListener('click', (e) => { e.preventDefault(); stopPlay(); if (state.v !== 'work') dispatch({ type: 'work', rows: workRows(model.rows), mode: model.mode }); });
    document.addEventListener('keydown', (e) => {
      const tag = (e.target.tagName || '').toLowerCase();
      if (['input', 'select', 'textarea'].includes(tag) || $('learnDialog').open || $('stage').hidden) return;
      if (tag === 'button' && (e.key === ' ' || e.key === 'Enter')) return;
      if (e.key === 'ArrowRight' && !$('btnNext').disabled) { e.preventDefault(); dispatch({ type: 'next' }); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); dispatch({ type: 'prev' }); }
      else if (e.key === 'Home') { e.preventDefault(); dispatch({ type: 'first' }); }
      else if (e.key === ' ') { e.preventDefault(); togglePlay(); }
    });
    window.addEventListener('hashchange', () => {
      if (location.hash === U.encode(state)) return;
      load();
      render({ fullEditor: true });
    });
  }

  function load() {
    const { state: s, warning } = U.decode(location.hash);
    const q = new URLSearchParams(location.search).get('lang');
    if (!s.lang) s.lang = q === 'en' || q === 'es' ? q : ((navigator.language || '').toLowerCase().startsWith('en') ? 'en' : 'es');
    state = s;
    compute();
    state = S.reduce(state, { type: 'go', n: state.step }, total());
    resetPred();
    const banner = $('urlWarning');
    banner.hidden = !warning;
    if (warning) banner.textContent = I.t(state.lang, 'app.urlWarning');
  }

  function init() {
    editor = G.editor.create($('workshop'), {
      state: () => state, lang, dispatch,
      loadExample: (id) => { const ex = EX.get(id); dispatch({ type: 'work', rows: workRows(ex.rows), mode: ex.mode }); },
      switchMode: (mode) => {
        // Si la tabla es válida se convierte a la otra forma; si no, solo cambia cómo se leen las precedencias.
        const rows = model.project ? workRows(P.toRows(model.project, mode)) : state.t;
        dispatch({ type: 'work', rows, mode });
      },
      toggleComputed: (v) => { showComputed = v; render(); },
      goStage: (where) => {
        const n = where === 'critical' ? model.solution.trace.findIndex((s) => s.kind === 'critical') : 0;
        dispatch({ type: 'go', n });
        $('stage').scrollIntoView({ behavior: 'smooth', block: 'start' });
      },
    });
    load();
    writeHash(false);
    bind();
    render({ fullEditor: true });
  }

  G.app = { state: () => state, step: () => (model.solution ? model.solution.trace[state.step] : null), go: (n) => dispatch({ type: 'go', n }), model: () => model };
  init();
})();
