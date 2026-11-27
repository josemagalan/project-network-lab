/*
 * unc-m56 — la vista de M5 (la actividad elegida con sus curvas) y de M6 (los casos, la simulación, el cálculo de examen)
 * y el paso a paso de los dos, aparte de js/unc.js (spec f4b-montecarlo-indices; reserva 2 de la puerta T001, T012): con
 * um=m7 no se carga (grupo u56), para que M7 con «Aprende más» quepa con margen en el presupuesto de 1 MB (principio 27).
 * unc.js sigue con la parte pura (que se prueba en Node), la barra, la tabla del proyecto, la red y el reparto de la
 * vista; esta parte recibe de él lo que comparte (ctx) y el modelo pintado (ctx.model()).
 */
(function (root) {
  'use strict';

  function create(ctx) {
    const U = root.PNL.unc; const I = root.PNL.i18n; const S = root.PNL.sim; const Tp = root.PNL.threept;
    const { FIELDS, SLIDERS, CASES, SYNTHETIC, TIES_SHOWN, PATHS_SHOWN, withValue, curvePts, niceTicks, parseNum, deadlineOf, examOf, simSpec,
      simSummary, seedOf, ukOf, hint } = U;
    const { h, DC, state, lang, t, tu, num, lab, hooks, focus, keepFocus, button, seg, go } = ctx;
    const M = ctx.model;
    const drawMain = ctx.redrawMain;

    // ---------- M5: la actividad elegida ----------
    function actCard() {
      const s = state(); const L5 = lab();
      const act = M().acts.find((a) => a.id === M().sel);
      const d = act.dist;
      const head = h('h2', { id: 'uncActHead' }, [act.name ? tu('actTitle', { id: act.id, name: act.name }) : tu('actTitleNoName', { id: act.id })]);
      const pick = h('label', { class: 'unc-field' }, [tu('act'), ' ', h('select', { id: 'uncAct', onchange: (e) => go({ ua: e.target.value }) },
        M().acts.map((a) => h('option', { value: a.id, selected: a.id === act.id }, [a.name ? `${a.id} · ${a.name}` : a.id])))]);
      const maxB = Math.max(...M().acts.map((a) => a.dist.b));
      const top = Math.max(20, Math.ceil(maxB * 1.25 / 5) * 5);
      const sliders = h('div', { class: 'unc-sliders' }, FIELDS.map((f) => {
        const out = h('output', { id: `uncOut-${f}`, for: `uncSl-${f}` }, [num(d[f])]);
        const input = h('input', { type: 'range', id: `uncSl-${f}`, min: '0', max: String(top), step: '0.5', value: String(d[f]), 'aria-label': L5[f],
          oninput: (e) => { out.textContent = num(clampTo(d, f, Number(e.target.value))); },
          onchange: (e) => setValue(act.id, f, clampTo(d, f, Number(e.target.value))) });
        return h('label', { class: 'unc-slider' }, [h('span', { class: 'unc-sym' }, [L5[f]]), input, out]);
      }));
      const parts = [h('div', { class: 'unc-head' }, [head, pick]), sliders];
      if (M().src.kind === 'example') parts.push(h('p', { class: 'muted small' }, [tu('toOwn', L5)]));
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
      const rows = withValue(M().src.rows, id, field, value);
      hooks.dispatch({ type: 'uncTable', rows, mode: M().src.mode });
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
      const curves = kinds.map((k) => ({ pts: curvePts(k, d, 160), cls: `c-${k}`, dash: k === 'tri' ? '6 4' : k === 'classic' ? '2 3' : null }));
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


    // ---------- M6: el TCL y sus trampas ----------
    const loc = () => (lang() === 'en' ? 'en-GB' : 'es-ES');
    // Cifras con k decimales fijos, con la coma del español (las probabilidades y la tabla, como en los apuntes).
    const fx = (v, k) => { const x = Number(v).toFixed(k); return lang() === 'en' ? x : x.replace('.', ','); };
    // Lo que escribe el alumno (plazo y probabilidad) se muestra con sus decimales, hasta 4 (revisión F4a, F4).
    const num4 = (v) => Number(v).toLocaleString(loc(), { maximumFractionDigits: 4, useGrouping: false });
    const big = (n) => Number(n).toLocaleString(loc());
    const pathText = (acts) => acts.join('–');
    const unitOf = () => (SYNTHETIC.includes(state().ux) ? tu('merge.unit') : M().src.unit);
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
        if (hooks.announce) hooks.announce(tu('sim.done', { T: num4(sim.spec.deadline), ps: fx(su.ps, 3) }));
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
      const input = h('input', { id, value: value == null ? '' : num4(value), size: '6', inputmode: 'decimal', 'aria-describedby': `${id}Err`,
        onchange: (e) => {
          const p = parseNum(e.target.value);
          const v = p.error ? NaN : p.value;
          if (!ok(v)) { e.target.setAttribute('aria-invalid', 'true'); err.hidden = false; return; }
          e.target.setAttribute('aria-invalid', 'false'); err.hidden = true; commit(v);
        } });
      return h('span', { class: 'unc-field' }, [h('label', { for: id }, [label]), input, unit ? h('span', { class: 'muted' }, [unit]) : null, err]);
    }
    function deadlineField() {
      return numField('uncDeadline', tu('ask.deadline'), M().model ? deadlineOf(state(), M()) : null, M().src.unit, (v) => v >= 0 && v <= 999999, tu('ask.badDeadline'), (v) => go({ ud: v }));
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
      const tieList = (xs) => I.list(lang(), xs.map((x) => tu('exam.tie', { path: pathText(x.acts), var: fx(x.var, 2) })));
      // Con más caminos críticos de los que se listan (más de 50), unos pocos y cuántos hay (revisión F4a, F1).
      const ties = !e.ties.length ? '' : e.tiesCount > e.ties.length
        ? ` ${tu('exam.tiesMany', { n: big(e.tiesCount), list: tieList(e.ties.slice(0, TIES_SHOWN)) })}`
        : ` ${tu('exam.ties', { list: tieList(e.ties) })}`;
      steps.push([tu('exam.path'), (unit ? tu('exam.pathText', { path: pathText(e.path), mu: fx(e.mu, 2), unit }) : tu('exam.pathTextNoUnit', { path: pathText(e.path), mu: fx(e.mu, 2) })) + near + ties]);
      steps.push([tu('exam.mu'), `${e.terms.map((x) => fx(x.mean, 2)).join(' + ')} = ${fx(e.mu, 2)}`]);
      steps.push([tu('exam.var'), `${e.terms.map((x) => fx(x.var, 2)).join(' + ')} = ${fx(e.var, 2)}`]);
      if (e.degenerate) {
        steps.push([tu('exam.degenerate'), e.inverse ? tu('exam.degT', { mu: num(e.mu) }) : tu('exam.degP', { mu: num(e.mu), T: num4(e.deadline), p: num(e.exact) })]);
      } else if (e.inverse) {
        steps.push([tu('exam.zFor', { p: num4(e.prob) }), tu('exam.zForText', { p: num4(e.prob), z: fx(e.z, 4), z2: fx(e.table.z2, 2) })]);
        steps.push([tu('exam.T'), tu('exam.TText', { mu: fx(e.mu, 2), z2: fx(e.table.z2, 2), var: fx(e.var, 2), Tt: fx(e.table.deadline, 2), T: fx(e.deadline, 2) })]);
      } else {
        steps.push([tu('exam.z'), tu('exam.zText', { T: num4(e.deadline), mu: fx(e.mu, 2), var: fx(e.var, 2), z: fx(e.z, 4), z2: fx(e.table.z2, 2) })]);
        steps.push([tu('exam.p', { T: num4(e.deadline) }), tu('exam.pText', { z2: fx(e.table.z2, 2), p4: fx(e.table.p4, 4), exact: fx(e.exact, 4) })]);
      }
      return steps;
    }
    function examCard(e) {
      const steps = examSteps(e);
      const tr = M().trace;
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
        const a = M().acts.find((q) => q.id === step.act); const d = a.dist; const L5 = lab();
        const p = Object.assign({ id: a.id, va: num(d.a), vm: num(d.m), vb: num(d.b), v: fx(step.reveals[0].value, 2) }, L5);
        return step.kind === 'unc.mean' ? [tu('walk.mean', p), tu('walk.meanText', p)] : [tu('walk.var', p), tu('walk.varText', p)];
      }
      const steps = examSteps(step.res);
      return steps[M().trace.indexOf(step)] || ['', ''];
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
        const hk = hint(step, given, M());
        if (hk) {
          const a = M().acts.find((q) => q.id === step.act);
          parts.push(tu(`walk.hint.${hk}`, Object.assign({ x: String(given).trim(), v: a && a.stats ? fx(a.stats.pert.var, 2) : '' }, lab())));
        }
      }
      return h('p', { class: `unc-fb ${res === 'ok' ? 'ok' : 'wrong'}`, id: 'uncPredFb', tabindex: '-1', role: 'status' }, parts);
    }
    function walkNav(tr, k) {
      const hide = hooks.predicting(tr[k]);
      const step = tr[k]; const [title, text] = stepTitleText(step);
      const wkey = `${M().src.id}|${lang()}|${k}|${tr.length}|${hide}`;
      if (wkey !== lastWalk) { lastWalk = wkey; if (hooks.announce) hooks.announce(`${t('player.counter', { i: k + 1, n: tr.length })}. ${title}. ${hide ? t('predict.hidden') : text}`); }
      return h('div', { class: 'unc-row unc-walknav' }, [
        h('button', { type: 'button', class: 'ghost', id: 'uncPrev', disabled: k === 0, onclick: () => { hooks.dispatch({ type: 'prev' }); focus('uncPrev'); } }, [`← ${t('player.prev')}`]),
        h('button', { type: 'button', class: 'ghost', id: 'uncNext', disabled: k >= tr.length - 1 || hide, onclick: () => { hooks.dispatch({ type: 'next' }); focus(hooks.predicting(M().trace[Math.min(state().step, M().trace.length - 1)]) ? 'uncPredIn' : 'uncNext'); } }, [`${t('player.next')} →`]),
        hide ? h('span', { class: 'muted small' }, [t('predict.hidden')]) : null]);
    }
    // M5 paso a paso: la actividad del paso, con su media y su varianza, y su curva al lado.
    function walkCard() {
      const tr = M().trace; const k = Math.min(state().step, tr.length - 1); const step = tr[k];
      const a = M().acts.find((q) => q.id === step.act); const d = a.dist; const L5 = lab();
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
      const tr = M().trace; const k = tr ? Math.min(state().step, tr.length - 1) : 0;
      const seen = (i) => !tr || !state().pred || i < k || (i === k && !hooks.predicting(tr[k]));
      const all = seen(tr ? tr.length - 1 : 0);
      const holder = h('div', { class: 'unc-chart', id: 'uncNormal' });
      const parts = [h('h2', { id: 'uncNormalHead' }, [seen(2) ? tu('exam.chartTitle', { mu: fx(e.mu, 2), var: fx(e.var, 2) }) : tu('sim.legendNormal')]), holder];
      const T = e.deadline;
      // El plazo escrito, con sus decimales; el calculado (plazo para una probabilidad), con 2, como el texto (revisión F4a, r2).
      const Tl = e.inverse ? fx(T, 2) : num4(T);
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
          curves: [{ pts, cls: 'c-normal' }], shade: { pts, to: T }, vlines: [{ x: e.mu, cls: 'v-sd', dash: '3 3' }, { x: T, cls: 'v-deadline', label: tu('exam.deadline', { T: Tl }) }],
          label: seen(2) ? tu('exam.chartLabel', { mu: fx(e.mu, 2), var: fx(e.var, 2), T: Tl }) : tu('sim.legendNormal') });
        parts.push(h('div', { class: 'unc-legend', 'aria-hidden': 'true' }, [key('k-normal', tu('exam.legendNormal'))].concat(seen(1) ? [key('k-sd', tu('exam.legendMu', { mu: fx(e.mu, 2) }))] : [])));
      }
      if (!all) return h('section', { class: 'card unc-normalcard', 'aria-labelledby': 'uncNormalHead' }, parts);
      const res = e.degenerate ? (e.inverse ? tu('exam.degT', { mu: num(e.mu) }) : tu('exam.degP', { mu: num(e.mu), T: num4(T), p: num(e.exact) }))
        : e.inverse ? tu('exam.resultT', { p: num4(e.prob), Tt: fx(e.table.deadline, 2), T: fx(e.deadline, 2) })
          : tu('exam.result', { T: num4(T), p4: fx(e.table.p4, 4), exact: fx(e.exact, 4) });
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
      if (s.ux === 'proj') return tu('proj.title', { name: M().src.title });
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
      // Sin incertidumbre (σ² = 0 y todas las réplicas iguales) el eje no tendría anchura: una unidad a cada lado.
      if (!(hi - lo > 1e-9)) { lo = mu - 1; hi = mu + 1; }
      lo = Math.max(lo, 0);   // las duraciones nunca son negativas (la normal se trunca en 0)
      const pts = sd > 0 ? normalPts(mu, spec.normal.var, lo, hi, 200) : [];
      const peak = Math.max(0, ...pts.map((q) => q[1]));
      const hpeak = su ? Math.max(...su.hist.counts) / (su.n * su.hist.width) : 0;
      const pert = state().ux === 'proj' && M().acts.some((a) => a.dist.kind === 'pert');
      DC.render(holder, { w: 640, h: 270, x: [lo, hi], ymax: Math.max(peak, hpeak) * 1.1 || 1, ticks: niceTicks(lo, hi, 8), fmt: num,
        hist: su ? Object.assign({ n: su.n }, su.hist) : null, curves: pts.length ? [{ pts, cls: 'c-normal' }] : [],
        vlines: [{ x: spec.deadline, cls: 'v-deadline', label: tu('exam.deadline', { T: num4(spec.deadline) }) }],
        label: su ? tu('sim.chartLabel', { n: big(su.n), mu: fx(mu, 2), var: fx(spec.normal.var, 2), T: num4(spec.deadline), pn: fx(su.pn, 3), ps: fx(su.ps, 3) })
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
      const s = state(); const T = num4(spec.deadline);
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
      const T = num4(spec.deadline); const all = spec.info.paths; const e = spec.info.exam; const crit = e.path.join('|');
      // Con más de 50 caminos no hay lista: solo el crítico del cálculo de examen y cuántos hay (revisión F4a, F1).
      const sd = Math.sqrt(e.var);
      const list = all.list ? all.list.slice().sort((x, y) => y.mu - x.mu)
        : [{ acts: e.path, mu: e.mu, var: e.var, p: sd > 0 ? Tp.phi((spec.deadline - e.mu) / sd) : (spec.deadline >= e.mu ? 1 : 0) }];
      const shown = list.slice(0, PATHS_SHOWN);
      const rows = shown.map((p) => h('tr', { class: p.acts.join('|') === crit ? 'sel' : '' }, [h('th', { scope: 'row' }, [pathText(p.acts)]),
        h('td', { class: 'num' }, [fx(p.mu, 2)]), h('td', { class: 'num' }, [fx(p.var, 2)]), h('td', { class: 'num' }, [fx(p.p, 3)])]));
      const parts = [h('h2', { id: 'uncPathsHead' }, [tu('proj.pathsTitle')]),
        h('table', { class: 'data unc-table', id: 'uncPaths' }, [h('thead', {}, [h('tr', {}, [tu('proj.colPath'), 'μ', 'σ²', `P(≤ ${T})`].map((c) => h('th', { scope: 'col' }, [c])))]), h('tbody', {}, rows)])];
      const rest = (all.list ? list.length : all.count) - shown.length;
      if (!all.list) parts.push(h('p', { class: 'muted small', id: 'uncPathsMany' }, [tu('proj.tooMany', { n: big(all.count) })]));
      else if (rest > 0) parts.push(h('p', { class: 'muted small', id: 'uncPathsMore' }, [tu(rest === 1 ? 'proj.moreOne' : 'proj.more', { n: rest })]));
      return h('section', { class: 'card unc-pathscard', 'aria-labelledby': 'uncPathsHead' }, parts);
    }
    function notesCards(spec, su) {
      const s = state(); const out = [];
      if (s.ux === 'merge') {
        const i = spec.info;
        if (i.n === 1) out.push(h('p', { class: 'card unc-callout' }, [tu('merge.note1')]));
        else if (su) {
          out.push(h('p', { class: 'card unc-callout', id: 'uncMergeNote' }, [tu('merge.note', { pn: fx(su.pn, 3), n: i.n, ps: fx(su.ps, 3) })]));
          if (su.mean > i.mu + 0.05) out.push(h('p', { class: 'card unc-info', id: 'uncSchonberger' }, [tu('merge.schonberger', { mean: fx(su.mean, 2), mu: num(i.mu) })]));
        }
      } else if (s.ux === 'proj') {
        const pert = M().acts.some((a) => a.dist.kind === 'pert');
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
        const e = examOf(s, M());
        grid.appendChild(h('div', { class: 'unc-left' }, [examCard(e)]));
        grid.appendChild(h('div', { class: 'unc-side' }, [examChartCard(e)]));
        return;
      }
      const spec = simSpec(s, M());
      ensureSim(spec);
      const su = sim.durations && sim.key === spec.key ? simSummary(spec, sim.durations) : null;
      grid.appendChild(h('div', { class: 'unc-left' }, [simChartCard(spec, su)]));
      const side = [probCard(spec, su)];
      if (s.ux === 'proj') side.push(pathsCard(spec));
      grid.appendChild(h('div', { class: 'unc-side' }, side.concat(notesCards(spec, su))));
    }


    return { actCard, walkCard, m6Controls, drawM6Main, cancelSim, sim: () => sim };
  }

  root.PNL = root.PNL || {};
  root.PNL.uncM56 = { create };
})(typeof globalThis !== 'undefined' ? globalThis : this);
