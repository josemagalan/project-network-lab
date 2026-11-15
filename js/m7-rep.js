/*
 * m7-rep — «Réplica a réplica» y «Convergencia» de M7 (spec f4b-montecarlo-indices; plan §4, P7; tableros 76–78; T011).
 * Van aparte de js/m7.js (grupo u7r, solo con uy=rep o uy=conv): la reserva de la puerta T001 cuando u7 pasó de 100 KiB.
 * - trace(state, m): los pasos del reproductor, las 20 primeras réplicas de la misma simulación (la semilla da la misma
 *   secuencia con 20 que con todas), con la duración (uh=t) o el camino crítico (uh=p) que predecir.
 * - convergence(state, m, res): las cuatro series de «Convergencia» con su intervalo y su referencia.
 * - views(ctx): las piezas de la vista (controles, réplica y convergencia), con las de js/m7.js en ctx.
 * Sus textos (bloque 3) se añaden a i18n (dict.es.m7 y dict.en.m7: rep y conv) al cargarse.
 */
(function (root) {
  'use strict';

  const isNode = typeof module !== 'undefined' && module.exports;
  const req = (path, name) => (isNode ? require(path) : root.PNL[name]);
  const I = req('./i18n.js', 'i18n');
  if (isNode) require('./i18n-m7.js');
  const UNC = req('./unc.js', 'unc');
  const L = req('./core/tcl.js', 'tcl');
  const S = req('./core/sim.js', 'sim');
  const MC = req('./core/mc.js', 'mc');

  const TEXTS = {
    es: {
      rep: {
        pred: { legend: 'Predecir:', none: 'nada', t: 'la duración', p: 'el camino crítico' },
        note: 'Las {n} primeras réplicas de la misma simulación (semilla {us}) · ← →',
        head: 'Réplica {k} de {n}', title: 'Réplica {k} de {n} · duración muestreada (d) de cada actividad y sus tiempos',
        netName: 'Red de la réplica {k}', hiddenNote: 'Se ven las duraciones de la réplica; los tiempos y el camino crítico, al comprobar.',
        shownNote: 'En rojo, el camino crítico de esta réplica.',
        askT: '¿Cuánto dura el proyecto en la réplica {k}?', askPath: '¿Qué camino es crítico en la réplica {k}?', navTitle: 'Réplica {k}',
        fieldT: 'Duración de la réplica {k}', empty: 'Escribe la duración o elige un camino antes de comprobar.',
        result: 'El proyecto dura {T}; camino crítico: {path}.', or: 'o', and: 'y',
        okT: 'Dura {T}; camino crítico: {path}.', wrongT: 'Tu {x} no es: dura {T}, por {path}.',
        wrongTMeans: 'Tu {x} es lo que dura {mean}, el camino crítico de las medias; en esta réplica el crítico es {path} y dura {T}.',
        okPath: '{path} es el crítico de esta réplica ({T}).', okPathTie: '{list} empatan con {T}: los dos son críticos y vale cualquiera. Por eso la criticidad de los caminos suma más de 1.',
        wrongPath: '{path} no es crítico en esta réplica: lo es {list} ({T}).',
        this: 'réplica {k}', histTitle: 'El histograma crece réplica a réplica ({k} de {n})',
        histLabel: 'Histograma de las {n} réplicas vistas: {list}.',
        tableTitle: 'Réplicas vistas', tableRegion: 'Tabla de las réplicas vistas', colRun: 'Réplica', colT: 'Duración', colPath: 'Camino crítico', colRuns: 'Réplicas', none: 'Todavía ninguna.',
      },
      conv: {
        mean: 'Media · {v} ± {e}', pT: 'P(duración ≤ {T}) · {v} ± {e}', q: 'Percentil {p} · {v}', crit: 'Criticidad de', critOf: 'Criticidad de {id}', actLabel: 'Actividad',
        refExact: 'exacta {v}', refNormal: 'normal de M6 {v}',
        meanNote: 'Banda: intervalo al 95 % (± 1,96·s/√n). Con 100 veces más réplicas, 10 veces más estrecha.',
        pTNote: 'Una proporción: su intervalo es ± 1,96·√(p(1 − p)/n).', qNote: 'El percentil no lleva intervalo: se ve cómo se asienta.',
        critNote: 'La criticidad también es una proporción, con su intervalo al 95 %.',
        axis: 'Eje horizontal: réplicas, en escala logarítmica', label: '{what} frente a las réplicas: {list}.', tableLabel: 'Convergencia en cifras',
      },
    },
    en: {
      rep: {
        pred: { legend: 'Predict:', none: 'nothing', t: 'the duration', p: 'the critical path' },
        note: 'The first {n} runs of the same simulation (seed {us}) · ← →',
        head: 'Run {k} of {n}', title: 'Run {k} of {n} · sampled duration (d) of each activity and its times',
        netName: 'Network of run {k}', hiddenNote: 'The sampled durations are shown; the times and the critical path, once you check.',
        shownNote: 'In red, the critical path of this run.',
        askT: 'How long does the project take in run {k}?', askPath: 'Which path is critical in run {k}?', navTitle: 'Run {k}',
        fieldT: 'Duration of run {k}', empty: 'Write the duration or choose a path before checking.',
        result: 'The project takes {T}; critical path: {path}.', or: 'or', and: 'and',
        okT: 'It takes {T}; critical path: {path}.', wrongT: 'Your {x} is not it: it takes {T}, along {path}.',
        wrongTMeans: 'Your {x} is how long {mean} takes, the critical path of the means; in this run the critical path is {path} and it takes {T}.',
        okPath: '{path} is the critical path of this run ({T}).', okPathTie: '{list} tie at {T}: both are critical and either counts. That is why the path criticalities add up to more than 1.',
        wrongPath: '{path} is not critical in this run: {list} is ({T}).',
        this: 'run {k}', histTitle: 'The histogram grows run by run ({k} of {n})',
        histLabel: 'Histogram of the {n} runs seen: {list}.',
        tableTitle: 'Runs so far', tableRegion: 'Table of the runs so far', colRun: 'Run', colT: 'Duration', colPath: 'Critical path', colRuns: 'Runs', none: 'None yet.',
      },
      conv: {
        mean: 'Mean · {v} ± {e}', pT: 'P(duration ≤ {T}) · {v} ± {e}', q: 'Percentile {p} · {v}', crit: 'Criticality of', critOf: 'Criticality of {id}', actLabel: 'Activity',
        refExact: 'exact {v}', refNormal: 'normal of M6 {v}',
        meanNote: 'Band: 95 % interval (± 1.96·s/√n). With 100 times more runs, 10 times narrower.',
        pTNote: 'A proportion: its interval is ± 1.96·√(p(1 − p)/n).', qNote: 'The percentile has no interval: watch it settle.',
        critNote: 'Criticality is a proportion too, with its 95 % interval.',
        axis: 'Horizontal axis: runs, on a log scale', label: '{what} against the runs: {list}.', tableLabel: 'Convergence in figures',
      },
    },
  };
  for (const lang of ['es', 'en']) Object.assign(I.dict[lang].m7, TEXTS[lang]);

  // ---------- Réplica a réplica (T011) ----------
  const REPLAY = 20;
  const pathText = (ids) => ids.join('–');
  // Los caminos críticos de una réplica: de una actividad sin precedentes a una sin siguientes, solo por actividades
  // críticas (holgura total 0) y enlaces justos (el fin de una es el inicio de la siguiente). Como mucho 20.
  function critPaths(model, rep) {
    const k = model.acts.length; const succ = model.acts.map(() => []);
    model.acts.forEach((a, i) => a.preds.forEach((q) => succ[q].push(i)));
    const crit = new Set(rep.crit); const tol = 1e-9 * Math.max(1, rep.T); const out = [];
    const walk = (i, path) => {
      if (out.length >= 20) return;
      const next = succ[i].filter((j) => crit.has(j) && Math.abs(rep.ef[i] - rep.es[j]) <= tol);
      if (!succ[i].length) { if (Math.abs(rep.ef[i] - rep.T) <= tol) out.push(path); return; }
      for (const j of next) walk(j, path.concat(j));
    };
    for (let i = 0; i < k; i++) if (crit.has(i) && !model.acts[i].preds.length) walk(i, [i]);
    return out.map((p) => pathText(p.map((i) => model.acts[i].id)));
  }
  /**
   * Los pasos del reproductor en «Réplica a réplica» (uy=rep): las 20 primeras réplicas de la misma simulación (P7; la
   * semilla da la misma secuencia con 20 que con todas). Cada paso: { kind: 'm7.rep', k, rep (core/mc.replicaTrace),
   * crit (sus caminos críticos), options (los de más media y los críticos), reveals } con la duración (uh=t) o el camino
   * (uh=p; con empates vale cualquiera de los críticos) para la predicción. Sin tabla válida o en otra vista: null.
   */
  function trace(state, m) {
    if (state.uy !== 'rep' || !m || !m.ok) return null;
    const model = m.sim.model; const n = Math.min(REPLAY, m.sim.n);
    const res = S.run({ kind: 'project', model, n, us: m.sim.us, track: true });
    const listed = MC.indices(res, model).paths.list.slice(0, 8).map((p) => pathText(p.ids));
    return Array.from({ length: n }, (_, k) => {
      const rep = MC.replicaTrace(res, model, k);
      const all = critPaths(model, rep);
      const options = listed.concat(all.filter((c) => !listed.includes(c)));
      const crit = options.filter((c) => all.includes(c));
      const reveals = state.uh === 'p' ? [{ act: 'R', field: 'm7.path', value: crit[0], ok: crit }] : [{ act: 'R', field: 'm7.T', value: rep.T }];
      return { kind: 'm7.rep', k, rep, crit, options, reveals };
    });
  }

  // ---------- Convergencia (T011) ----------
  /**
   * Las cuatro series de «Convergencia» (core/mc.convergence en 20 puntos logarítmicos): media y P(≤ plazo) con su
   * intervalo al 95 %, el percentil elegido (sin intervalo) y la criticidad de una actividad (ua; si no vale, la primera
   * que no es crítica siempre ni nunca). ref: la cuenta exacta si la hay; si no, la normal de M6 (la criticidad, sin ella).
   */
  function convergence(state, m, res) {
    const rows = MC.convergence(res, m.sim.model, { deadline: m.deadline, p: m.pct });
    const last = rows[rows.length - 1];
    const ids = m.acts.map((a) => a.id);
    let i = ids.indexOf(state.ua);
    if (i < 0) { i = last.crit.findIndex((c) => c > 0 && c < 1); if (i < 0) i = 0; }
    const ex = m.exact && m.exact.dist ? m.exact : null;
    const exQ = ex ? (() => { let c = 0; for (const e of ex.dist) { c += e.p; if (c >= m.pct - 1e-9) return e.t; } return ex.dist[ex.dist.length - 1].t; })() : null;
    const band = (v, se) => ({ v, lo: v - 1.96 * se, hi: v + 1.96 * se });
    return {
      act: ids[i], rows,
      series: {
        mean: { rows: rows.map((r) => Object.assign({ n: r.n }, band(r.mean, r.se))), ref: ex ? ex.mean : m.normal.mu },
        pT: { rows: rows.map((r) => Object.assign({ n: r.n }, band(r.pT, r.seP))), ref: ex ? ex.pLE(m.deadline) : L.exam(m.examModel, { deadline: m.deadline }).exact },
        q: { rows: rows.map((r) => ({ n: r.n, v: r.q })), ref: ex ? exQ : L.exam(m.examModel, { prob: m.pct }).deadline },
        crit: { rows: rows.map((r) => { const p = r.crit[i]; return Object.assign({ n: r.n }, band(p, Math.sqrt(p * (1 - p) / r.n))); }), ref: ex ? ex.crit[i] : null },
      },
    };
  }


  // La convergencia frente a las réplicas en escala logarítmica, con la banda del intervalo y la referencia a trazos.
  // o = { w, h, rows: [{ n, v, lo?, hi? }], y: [lo, hi], yticks, yfmt, nfmt, ref, refLabel, label }
  function conv(holder, o) {
    const { svg, el } = root.PNL.mcCharts.make(holder, o.w, o.h, o.label);
    const pl = 44; const pr = 12; const pt = 10; const pb = 24;
    const n0 = o.rows[0].n; const n1 = o.rows[o.rows.length - 1].n; const lg = Math.log10;
    const X = (n) => (n1 > n0 ? pl + ((lg(n) - lg(n0)) / (lg(n1) - lg(n0))) * (o.w - pl - pr) : (pl + o.w - pr) / 2);
    const [y0, y1] = o.y;
    const Y = (v) => o.h - pb - ((Math.min(y1, Math.max(y0, v)) - y0) / (y1 - y0)) * (o.h - pt - pb);
    for (const v of o.yticks) {
      svg.appendChild(el('line', { class: 'mc-grid', x1: pl, y1: Y(v), x2: o.w - pr, y2: Y(v) }));
      svg.appendChild(el('text', { class: 'dc-tick', x: pl - 4, y: Y(v) + 4, 'text-anchor': 'end' }, o.yfmt(v)));
    }
    for (let e = 1; e <= 5; e++) {
      const n = 10 ** e;
      if (n < n0 || n > n1) continue;
      svg.appendChild(el('text', { class: 'dc-tick', x: X(n), y: o.h - pb + 15, 'text-anchor': n === n1 ? 'end' : 'middle' }, o.nfmt(n)));
    }
    if (o.rows[0].lo != null) {
      const up = o.rows.map((r) => `${X(r.n).toFixed(1)},${Y(r.hi).toFixed(1)}`); const dn = o.rows.slice().reverse().map((r) => `${X(r.n).toFixed(1)},${Y(r.lo).toFixed(1)}`);
      svg.appendChild(el('path', { class: 'mc-band', d: `M${up.join(' L')} L${dn.join(' L')} Z` }));
    }
    if (o.ref != null) {
      svg.appendChild(el('line', { class: 'mc-ref', x1: pl, y1: Y(o.ref), x2: o.w - pr, y2: Y(o.ref) }));
      svg.appendChild(el('text', { class: 'mc-reflabel', x: pl + 6, y: Y(o.ref) - 5 }, o.refLabel));
    }
    svg.appendChild(el('path', { class: 'mc-line', d: `M${o.rows.map((r) => `${X(r.n).toFixed(1)},${Y(r.v).toFixed(1)}`).join(' L')}` }));
    for (const r of o.rows) svg.appendChild(el('circle', { class: 'mc-dot', cx: X(r.n).toFixed(1), cy: Y(r.v).toFixed(1), r: 2.2 }));
    svg.appendChild(el('line', { class: 'dc-axis', x1: pl, y1: o.h - pb, x2: o.w - pr, y2: o.h - pb }));
    return svg;
  }

  function views(ctx) {
    const { h, t, tm, tu, fx, num4, big, go, focus, narrow, hooks, state, lang } = ctx;
    const DC = root.PNL.distChart;
    let m = null;
    const setModel = (model) => { m = model; };
    const PRm = () => root.PNL.predict;
    let lastRep = null;
    function repControls() {
      const s = state(); const on = !!s.pred; const what = s.uh === 'p' ? 'p' : 't';
      const opt = (k, checked, fn) => h('label', {}, [h('input', { type: 'radio', name: 'm7Pred', id: `m7Pred-${k}`, value: k, checked, onchange: () => { fn(); focus(`m7Pred-${k}`); } }), ' ', tm(`rep.pred.${k}`)]);
      const radios = h('fieldset', { class: 'unc-mode', id: 'm7Pred' }, [h('legend', {}, [tm('rep.pred.legend')]),
        opt('none', !on, () => hooks.dispatch({ type: 'set', key: 'pred', value: 0 })),
        opt('t', on && what === 't', () => { go({ uh: 't' }); hooks.dispatch({ type: 'set', key: 'pred', value: 1 }); }),
        opt('p', on && what === 'p', () => { go({ uh: 'p' }); hooks.dispatch({ type: 'set', key: 'pred', value: 1 }); })]);
      return h('div', { class: 'unc-row m7-controls' }, [radios, h('span', { class: 'muted small', id: 'm7RepNote' }, [tm('rep.note', { n: REPLAY, us: UNC.seedOf(s) })]),
        h('button', { type: 'button', class: 'ghost', id: 'm7Again', onclick: () => { go({ us: hooks.newSeed() }); focus('m7Again'); } }, [tu('sim.again')])]);
    }
    function repMain() {
      const tr = m.trace; const s = state();
      const k = Math.min(s.step, tr.length - 1); const step = tr[k]; const r = step.rep;
      const hide = hooks.predicting(step);
      // Lo que se ve de la réplica actual: con la predicción pendiente, solo las duraciones muestreadas.
      const announce = hide ? `${tm('rep.head', { k: k + 1, n: tr.length })}. ${t('predict.hidden')}` : `${tm('rep.head', { k: k + 1, n: tr.length })}. ${tm('rep.result', { T: fx(r.T, 2), path: step.crit.join(` ${tm('rep.or')} `) })}`;
      const wkey = `${m.sim.key}|${s.uh}|${k}|${hide}|${lang()}`;
      if (wkey !== lastRep) { lastRep = wkey; hooks.announce(announce); }
      const left = h('div', { class: 'unc-left' }, [netRep(step, hide), predictCard(step, hide, k, tr)]);
      const right = h('div', { class: 'unc-side' }, [repHist(tr, k, hide), repTable(tr, k, hide)]);
      return h('div', { class: 'unc-main' }, [left, right]);
    }
    function netRep(step, hide) {
      const r = step.rep; const s = state();
      const preds = {}; const succs = {};
      for (const a of m.acts) { preds[a.id] = a.preds.slice(); succs[a.id] = []; }
      for (const a of m.acts) for (const p of a.preds) succs[p].push(a.id);
      const project = { activities: m.sim.model.acts.map((a, i) => ({ id: a.id, name: '', d: r.d[i] })), preds, succs };
      const sol = root.PNL.cpm.solve(project);
      const lay2 = root.PNL.layout.layout(sol, project);
      const revealed = new Map(hide ? [] : sol.trace.flatMap((st) => st.reveals || []).map((rv) => [PRm().key(rv), rv.value]));
      const holder = h('div', { class: 'unc-net', id: 'm7RepNet', tabindex: '0' });
      root.PNL.royView.render(holder, { project, solution: sol, lay: lay2, step: null, revealed, box: s.box, lang: lang(), nota: s.nota, criticalOn: !hide,
        numFmt: (v) => fx(v, 2), name: tm('rep.netName', { k: step.k + 1 }), fit: true, minWidth: 300, geo: narrow() ? { gx: 24, gy: 14 } : { gx: 30, gy: 18 } });
      return h('section', { class: 'card m7-rep', 'aria-labelledby': 'm7RepHead' }, [h('h2', { id: 'm7RepHead' }, [tm('rep.title', { k: step.k + 1, n: m.trace.length })]), holder,
        h('p', { class: 'muted small' }, [tm(hide ? 'rep.hiddenNote' : 'rep.shownNote')])]);
    }
    function predictCard(step, hide, k, tr) {
      const s = state(); const rv = step.reveals[0]; const key2 = PRm().key(rv); const pred = hooks.pred();
      const parts = [h('h2', { id: 'm7PredHead' }, [tm(s.pred ? (rv.field === 'm7.path' ? 'rep.askPath' : 'rep.askT') : 'rep.navTitle', { k: k + 1 })])];
      if (s.pred && hide) {
        const msg = h('p', { class: 'small unc-err', id: 'm7PredEmpty', hidden: true }, [tm('rep.empty')]);
        const check = () => {
          const v = String(pred.answers.get(key2) || '').trim();
          if (!v) { msg.hidden = false; focus(rv.field === 'm7.path' ? 'm7Path-0' : 'm7PredIn'); return; }
          hooks.predCheck(step); focus('m7PredFb');
        };
        if (rv.field === 'm7.path') {
          parts.push(h('fieldset', { class: 'm7-paths', 'aria-describedby': 'm7PredEmpty' }, [h('legend', { class: 'sr-only' }, [tm('rep.askPath', { k: k + 1 })])].concat(step.options.map((o, i) => h('label', {}, [
            h('input', { type: 'radio', name: 'm7Path', id: `m7Path-${i}`, value: o, checked: pred.answers.get(key2) === o, onchange: () => { pred.answers.set(key2, o); } }), ' ', o])))));
        } else {
          parts.push(h('div', { class: 'unc-row' }, [h('label', { for: 'm7PredIn' }, [tm('rep.fieldT', { k: k + 1 })]),
            h('input', { id: 'm7PredIn', value: pred.answers.get(key2) || '', size: '7', inputmode: 'decimal', 'aria-describedby': 'm7PredEmpty',
              oninput: (e) => { pred.answers.set(key2, e.target.value); }, onkeydown: (e) => { if (e.key === 'Enter') { e.preventDefault(); check(); } } }),
            m.src.unit ? h('span', { class: 'muted' }, [m.src.unit]) : null]));
        }
        parts.push(h('div', { class: 'unc-row' }, [h('button', { type: 'button', class: 'primary', id: 'm7PredCheck', onclick: check }, [t('predict.check')]),
          h('button', { type: 'button', class: 'ghost', id: 'm7PredShow', onclick: () => { hooks.predShow(); focus('m7Next'); } }, [t('predict.show')])]), msg);
      } else if (s.pred && pred.done && pred.step === s.step && pred.result) {
        const res = pred.result.get(key2); const given = String(pred.answers.get(key2) || '').trim();
        const r = step.rep;
        const text = rv.field === 'm7.path'
          ? (res === 'ok' ? tm(step.crit.length > 1 ? 'rep.okPathTie' : 'rep.okPath', { path: given, list: step.crit.join(` ${tm('rep.and')} `), T: fx(r.T, 2) })
            : tm('rep.wrongPath', { path: given, list: step.crit.join(` ${tm('rep.or')} `), T: fx(r.T, 2) }))
          : (res === 'ok' ? tm('rep.okT', { T: fx(r.T, 2), path: step.crit.join(` ${tm('rep.or')} `) })
            : tm(wrongMeans(step, given) ? 'rep.wrongTMeans' : 'rep.wrongT', { x: given, T: fx(r.T, 2), path: step.crit.join(` ${tm('rep.or')} `), mean: m.normal.path.join('–') }));
        parts.push(h('p', { class: `unc-fb ${res === 'ok' ? 'ok' : 'wrong'}`, id: 'm7PredFb', tabindex: '-1', role: 'status' }, [h('strong', {}, [tu(res === 'ok' ? 'walk.ok' : 'walk.wrong')]), ' ', text]));
      } else {
        parts.push(h('p', { class: 'small', id: 'm7RepResult' }, [tm('rep.result', { T: fx(step.rep.T, 2), path: step.crit.join(` ${tm('rep.or')} `) })]));
      }
      parts.push(h('div', { class: 'unc-row unc-walknav' }, [
        h('button', { type: 'button', class: 'ghost', id: 'm7Prev', disabled: k === 0, onclick: () => { hooks.dispatch({ type: 'prev' }); focus('m7Prev'); } }, [`← ${t('player.prev')}`]),
        h('button', { type: 'button', class: 'ghost', id: 'm7Next', disabled: k >= tr.length - 1 || hide, onclick: () => { hooks.dispatch({ type: 'next' }); focusNext(); } }, [`${t('player.next')} →`]),
        hide ? h('span', { class: 'muted small' }, [t('predict.hidden')]) : null]));
      return h('section', { class: 'card m7-rep', 'aria-labelledby': 'm7PredHead' }, parts);
    }
    function focusNext() {
      const tr = m.trace; const st = tr[Math.min(state().step, tr.length - 1)];
      if (!hooks.predicting(st)) { focus('m7Next'); return; }
      focus(st.reveals[0].field === 'm7.path' ? 'm7Path-0' : 'm7PredIn');
    }
    // El error típico: sumar el camino crítico de las medias con las duraciones de la réplica.
    function wrongMeans(step, given) {
      const p = UNC.parseNum(given); if (p.error) return false;
      const ids = m.sim.model.acts.map((a) => a.id);
      const len = m.normal.path.reduce((x, id) => x + step.rep.d[ids.indexOf(id)], 0);
      return Math.abs(Math.round(p.value * 100) - Math.round(len * 100)) < 0.5 && Math.abs(len - step.rep.T) > 1e-9;
    }
    function repHist(tr, k, hide) {
      const all = tr.map((x) => x.rep.T); const seen = all.slice(0, hide ? k : k + 1);
      let lo = Math.min(...all); let hi = Math.max(...all);
      if (!(hi - lo > 1e-9)) { lo -= 1; hi += 1; }
      const pad = (hi - lo) * 0.05; lo = Math.max(0, lo - pad); hi += pad;
      const bins = 12; const width = (hi - lo) / bins; const counts = new Array(bins).fill(0);
      for (const v of seen) counts[Math.min(bins - 1, Math.floor((v - lo) / width))]++;
      const holder = h('div', { class: 'unc-chart', id: 'm7RepHist' });
      const ymax = Math.max(3, ...counts) / (Math.max(1, seen.length) * width) * 1.15;
      DC.render(holder, { w: 560, h: 200, x: [lo, hi], ymax, ticks: UNC.niceTicks(lo, hi, 6), fmt: (v) => num4(v),
        hist: seen.length ? { lo, width, counts, n: Math.max(1, seen.length) } : null, curves: [],
        vlines: hide ? [] : [{ x: all[k], cls: 'v-deadline', label: tm('rep.this', { k: k + 1 }) }],
        label: tm('rep.histLabel', { n: seen.length, list: seen.map((v) => fx(v, 2)).join('; ') || '—' }) });
      return h('section', { class: 'card m7-rep', 'aria-labelledby': 'm7RepHistHead' }, [h('h2', { id: 'm7RepHistHead' }, [tm('rep.histTitle', { k: seen.length, n: tr.length })]), holder]);
    }
    function repTable(tr, k, hide) {
      const rowsR = tr.slice(0, hide ? k : k + 1).map((x, i) => h('tr', { class: i === k ? 'sel' : '' }, [h('th', { scope: 'row' }, [String(i + 1)]),
        h('td', { class: 'num' }, [fx(x.rep.T, 2)]), h('td', {}, [x.crit.join(` ${tm('rep.and')} `)])]));
      return h('section', { class: 'card m7-rep', 'aria-labelledby': 'm7RepTabHead' }, [h('h2', { id: 'm7RepTabHead' }, [tm('rep.tableTitle')]),
        rowsR.length ? h('div', { class: 'unc-scroll unc-bins', tabindex: '0', role: 'region', 'aria-label': tm('rep.tableRegion') }, [h('table', { class: 'data unc-table', id: 'm7RepTable' }, [
          h('thead', {}, [h('tr', {}, [tm('rep.colRun'), tm('rep.colT'), tm('rep.colPath')].map((c) => h('th', { scope: 'col' }, [c])))]), h('tbody', {}, rowsR)])])
          : h('p', { class: 'muted small' }, [tm('rep.none')])]);
    }

    // ---------- Convergencia (T011) ----------
    let convCache = { key: null, c: null };
    let convOpen = false;
    function convMain(cur) {
      const s = state();
      if (!cur) return h('p', { class: 'card muted', id: 'm7ConvWait' }, [tm('running', { n: big(m.sim.n) })]);
      const ckey = `${m.sim.key}|${m.rkey}|${s.ua}`;   // con la normal de M6 (revisión de la F4b, ronda 2, F3)
      if (convCache.key !== ckey) convCache = { key: ckey, c: convergence(s, m, cur.res) };
      const c = convCache.c; const S4 = c.series; const last = c.rows[c.rows.length - 1];
      const w = narrow() ? 330 : 570; const hgt = 160;
      const range = (rows, ref, clamp) => {
        const vals = rows.flatMap((r) => [r.v, r.lo, r.hi]).filter((v) => v != null && Number.isFinite(v)).concat(ref != null ? [ref] : []);
        let lo = Math.min(...vals); let hi = Math.max(...vals);
        if (!(hi - lo > 1e-9)) { lo -= 0.5; hi += 0.5; }
        const pad = (hi - lo) * 0.08; lo -= pad; hi += pad;
        if (clamp) { lo = Math.max(0, lo); hi = Math.min(1, hi); }
        return [lo, hi];
      };
      const card = (id, title, ser, clamp, dec, refName, note) => {
        const holder = h('div', { class: 'unc-chart', id: `m7Conv-${id}` });
        const y = range(ser.rows, ser.ref, clamp);
        conv(holder, { w, h: hgt, rows: ser.rows, y, yticks: UNC.niceTicks(y[0], y[1], 4), yfmt: (v) => num4(v), nfmt: big, ref: ser.ref,
          refLabel: ser.ref != null ? tm(refName, { v: fx(ser.ref, dec) }) : '',
          label: tm('conv.label', { what: typeof title === 'string' ? title : tm('conv.critOf', { id: c.act }), list: ser.rows.map((r) => `${big(r.n)}: ${fx(r.v, dec)}`).join('; ') }) });
        return h('section', { class: 'card m7-conv-card', 'aria-labelledby': `m7ConvHead-${id}` }, [h('h2', { id: `m7ConvHead-${id}` }, [].concat(title)), holder, h('p', { class: 'muted small' }, [note])]);
      };
      const exact = m.exact && m.exact.dist;
      const refName = exact ? 'conv.refExact' : 'conv.refNormal';
      const actSel = h('select', { id: 'm7ConvAct', 'aria-label': tm('conv.actLabel'), onchange: (e) => { go({ ua: e.target.value }); focus('m7ConvAct'); } },
        m.acts.map((a) => h('option', { value: a.id, selected: a.id === c.act }, [a.id])));
      const iAct = m.acts.findIndex((a) => a.id === c.act);
      const grid = h('div', { class: 'm7-conv' }, [
        card('mean', tm('conv.mean', { v: fx(last.mean, 2), e: fx(1.96 * last.se, 2) }), S4.mean, false, 2, refName, tm('conv.meanNote')),
        card('pT', tm('conv.pT', { T: num4(m.deadline), v: fx(last.pT, 3), e: fx(1.96 * last.seP, 3) }), S4.pT, true, 3, refName, tm('conv.pTNote')),
        card('q', tm('conv.q', { p: Math.round(m.pct * 100), v: fx(last.q, 2) }), S4.q, false, 2, refName, tm('conv.qNote')),
        card('crit', [tm('conv.crit'), ' ', actSel, ` · ${fx(last.crit[iAct], 3)}`], S4.crit, true, 3, 'conv.refExact', tm('conv.critNote')),
      ]);
      const toggle = h('button', { type: 'button', class: 'linklike', id: 'm7ConvTable', 'aria-expanded': String(convOpen), 'aria-controls': 'm7ConvRows',
        onclick: () => { convOpen = !convOpen; hooks.redraw(); focus('m7ConvTable'); } }, [convOpen ? tu('sim.hideTable') : tu('sim.showTable')]);
      const out = [grid, h('p', { class: 'muted small' }, [tm('conv.axis'), ' · ', toggle])];
      if (convOpen) {
        const rowsC = c.rows.map((r) => h('tr', {}, [h('th', { scope: 'row' }, [big(r.n)]), h('td', { class: 'num' }, [tm('pm', { v: fx(r.mean, 2), e: fx(1.96 * r.se, 2) })]),
          h('td', { class: 'num' }, [tm('pm', { v: fx(r.pT, 3), e: fx(1.96 * r.seP, 3) })]), h('td', { class: 'num' }, [fx(r.q, 2)]), h('td', { class: 'num' }, [fx(r.crit[iAct], 3)])]));
        out.push(h('div', { class: 'unc-scroll unc-bins', tabindex: '0', role: 'region', 'aria-label': tm('conv.tableLabel'), id: 'm7ConvRows' }, [h('table', { class: 'data unc-table' }, [
          h('thead', {}, [h('tr', {}, [tm('rep.colRuns'), tm('rowMean'), tm('rowP', { T: num4(m.deadline) }), `P${Math.round(m.pct * 100)}`, tm('conv.critOf', { id: c.act })].map((x) => h('th', { scope: 'col' }, [x])))]),
          h('tbody', {}, rowsC)])]));
      }
      return h('div', { class: 'm7-convwrap' }, out);
    }


    return { setModel, repControls, repMain, convMain };
  }

  const api = { TEXTS, REPLAY, critPaths, trace, convergence, views };
  root.PNL = root.PNL || {};
  root.PNL.m7rep = api;
  if (isNode) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
