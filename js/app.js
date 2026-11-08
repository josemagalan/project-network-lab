/*
 * app — controlador de la página: estado (store) ↔ URL viva (urlstate), cálculo (core) y vistas.
 * Cada cambio pasa por dispatch(): reduce el estado, recalcula si cambian los datos, reescribe el
 * #hash y vuelve a pintar. Las vistas solo leen la Solution y el paso actual (plan f1-cpm-roy §2).
 * Para las pruebas de navegador expone PNL.app.state(), PNL.app.step() y PNL.app.go(n).
 * F2a: con graph=aoa se reproduce la traza de la red PERT (core/aoa) en lugar de la de ROY (plan f2a §2 y §4),
 * con el contador de ficticias (reglas frente al mínimo de core/mindummy) y, con min=1, la red mínima al lado.
 */
(function () {
  'use strict';

  const G = window.PNL;
  const { i18n: I, urlstate: U, store: S, project: P, cpm: C, matrix: MX, examples: EX, narrate: NR,
    layout: L, predict: PR, learn: LR, aoa: A, aoaLayout: AL, mindummy: MD, dom } = G;
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

  const lang = () => state.lang || 'es';
  const t = (k, p) => I.t(lang(), k, p);
  const numFmt = (v) => NR.fmt(lang(), v);
  const nameOf = (r) => (r.name && typeof r.name === 'object' ? r.name[lang()] : (r.name || ''));

  // ---------- Modelo ----------

  function compute() {
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
  }

  const pert = () => state.graph === 'aoa';
  // Una tabla solo de estructura no tiene red ROY: se pasa a la red PERT, desde su primer paso (T022), y sin
  // la vista lado a lado ni la matriz, que necesitan la red ROY (revisión de cierre, F2).
  function fitGraph() {
    if (!model.structureOnly || !model.project) return;
    const view = state.view === 'matrix' || state.view === 'side' ? 'net' : state.view;
    if (pert() && view === state.view) return;
    state = Object.assign({}, state, { graph: 'aoa', view, step: pert() ? state.step : 0 });
  }
  // La traza que se reproduce: la de la red PERT con graph=aoa y la de ROY en otro caso.
  function trace() {
    if (!model) return null;
    if (pert()) return model.net ? model.net.trace : null;
    return model.solution ? model.solution.trace : null;
  }
  const total = () => { const tr = trace(); return tr ? tr.length : 1; };

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
    if (dataChanged) { compute(); fitGraph(); if (['t', 'ex', 'mode'].some((k) => JSON.stringify(before[k]) !== JSON.stringify(state[k]))) selected = null; }
    if (dataChanged || before.graph !== state.graph) state = S.reduce(state, { type: 'go', n: state.step }, total());
    if (before.step !== state.step || dataChanged || before.graph !== state.graph) resetPred();
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
    if (!state.pred || !tr || !model.solution) return false;
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
    if (work) editor.render(Object.assign({}, model, { showComputed, numFmt, hideDuration: durationHidden() }), !!(opts && opts.fullEditor));
    const sol = model.solution;
    const tr = trace();
    $('stage').hidden = !tr;
    if (!tr) return;

    const isPert = pert();
    const k = Math.min(state.step, tr.length - 1);
    const step = tr[k];
    const hide = predicting(step);
    const revealed = revealedMap(tr, k, hide);
    const critIdx = tr.findIndex((s) => s.kind === 'critical');
    const criticalOn = critIdx >= 0 && k >= critIdx;
    const ctx = { project: model.project, solution: sol, lay: model.lay, matrix: model.matrix, step, stepIndex: k, revealed,
      box: state.box, lang: lang(), nota: state.nota, criticalOn, numFmt, name: model.name, unit: model.unit, hide, net: model.net };

    $('btnAon').setAttribute('aria-pressed', String(!isPert));
    $('btnAoa').setAttribute('aria-pressed', String(isPert));
    $('btnAon').disabled = !sol;
    // Contador de ficticias (AC9): mientras se predicen las reglas no da números, para no adelantar la respuesta.
    const placeIdx = isPert ? tr.findIndex((s) => s.kind === 'place') : -1;
    const countHidden = isPert && !!state.pred && k < placeIdx;
    const count = renderCounter(isPert, countHidden);
    // Con min=1 y una red con menos ficticias que las reglas, las dos se ven juntas (y no la ROY de al lado).
    const minOn = !!(count && count.extra && state.min);
    // Lado a lado solo en PERT y con duraciones: los ejemplos solo de estructura no tienen red ROY.
    const side = isPert && state.view === 'side' && !!sol && !minOn;
    $('btnNet').setAttribute('aria-pressed', String(!minOn && (state.view === 'net' || (state.view === 'side' && !side))));
    $('btnMatrix').setAttribute('aria-pressed', String(state.view === 'matrix'));
    $('btnMatrix').hidden = isPert;
    $('btnSide').hidden = !isPert;
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
    const selInfo = NR.selection(selected, Object.assign({}, ctx, { numbered: !isPert || k >= tr.findIndex((s) => s.kind === 'number') }));
    const royCtx = (c) => Object.assign({}, c, { selected, selPrecs: selInfo ? selInfo.precs : [], onSelect: toggleSel });
    if (isPert && minOn) {
      minCompare(pctx, count);
      $('boxHint').textContent = t('view.pertHint');
    } else if (isPert) {
      const holder = side ? sideBySide() : $('netView');
      if (k < placeIdx) G.pertView.succTable(holder, pctx); else G.pertView.render(holder, pctx);
      $('boxHint').textContent = t(side ? 'view.sideHint' : (k < placeIdx ? 'view.succHint' : 'view.pertHint'));
      if (side) G.royView.render($('royHolder'), royCtx(sideRoyCtx(ctx, tr, k)));
    } else {
      if (state.view === 'net') G.royView.render($('netView'), royCtx(ctx)); else G.matrixView.render($('matrixView'), ctx);
      $('boxHint').textContent = state.view === 'matrix' ? t('view.matrixHint') : NR.relabel(t(`view.boxHint${state.box}`), state.nota);
    }

    renderSelInfo(isPert && k < placeIdx && !minOn ? null : selInfo);

    const lateSteps = ['float', 'floats', 'critical', 'gantt'].includes(step.kind);
    // En PERT la tabla de arcos es la alternativa en texto de la red: se ofrece en todos los pasos desde «colocar».
    const tableOk = isPert ? k >= placeIdx : !lateSteps;
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
    if (!hide) {
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

  const PHASE = { forward: 'forward', backward: 'backward', float: 'float', eventForward: 'forward', eventBackward: 'backward' };

  // Contexto de views/pert-view: el de ROY más la colocación, la numeración, las duraciones y la selección.
  function pertCtx(ctx, tr, k) {
    return Object.assign({}, ctx, {
      lay: model.aoaLay, numbered: k >= tr.findIndex((s) => s.kind === 'number'), succs: model.succs, selected,
      durations: Object.fromEntries(model.project.activities.map((a) => [a.id, a.d])),
      onSelect: toggleSel,
    });
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
        learn]));
    } else if (res && !res.exact) box.appendChild(h('div', { class: 'row-wrap' }, [learn]));
    return c;
  }

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
    return rows.map((r) => ({ id: r.id, name: nameOf(r), duration: String(r.duration), links: r.links }));
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
    $('btnAon').addEventListener('click', () => switchGraph('aon'));
    $('btnAoa').addEventListener('click', () => switchGraph('aoa'));
    $('selLang').addEventListener('change', (e) => dispatch({ type: 'set', key: 'lang', value: e.target.value }));
    $('selNota').addEventListener('change', (e) => dispatch({ type: 'set', key: 'nota', value: e.target.value }));
    $('selBox').addEventListener('change', (e) => dispatch({ type: 'set', key: 'box', value: e.target.value }));
    $('chkPredict').addEventListener('change', (e) => dispatch({ type: 'set', key: 'pred', value: e.target.checked ? 1 : 0 }));
    $('btnTable').addEventListener('click', () => { tableOpen = !tableOpen; render(); });
    $('btnWhatIf').addEventListener('click', () => { whatIfOpen = !whatIfOpen; render(); });
    $('btnLearn').addEventListener('click', () => openLearn());
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
    state = s;
    compute();
    fitGraph();
    state = S.reduce(state, { type: 'go', n: state.step }, total());
    resetPred();
    const banner = $('urlWarning');
    banner.hidden = !warning;
    if (warning) banner.textContent = I.t(state.lang, warning === 'structureOnly' ? 'app.structureOnlyWarning' : 'app.urlWarning');
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

  G.app = { state: () => Object.assign({ sel: selected }, state), step: () => { const tr = trace(); return tr ? tr[state.step] : null; }, go: (n) => dispatch({ type: 'go', n }), model: () => model };
  init();
})();
