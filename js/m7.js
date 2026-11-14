/*
 * m7 — M7, Montecarlo e índices, el tercer apartado de «Duraciones inciertas» (spec f4b-montecarlo-indices; plan §3–§4,
 * P1–P8; tableros 72–80 aprobados en T009). Se carga bajo demanda solo con um=m7 (grupo u7) y unc.js le pasa la vista.
 * - Parte sin DOM (tests/m7.test.js): model(state, lang) da el proyecto con la distribución de cada actividad (desde a, m
 *   y b, la discreta escrita o la del ejemplo), sus errores, la normal de M6 con las fórmulas de examen (A2), el plazo, lo
 *   que se simula y la cuenta exacta; results(m, res) resume una simulación; parseProb/fmtProb leen y escriben las
 *   probabilidades (decimales o fracciones); tornadoOrder ordena el tornado en espejo (uz).
 * - create(hooks) pinta las filas de la barra y las vistas «Duración del proyecto» e «Índices» (T010). La simulación
 *   (con track) y los índices van a trozos de unos 12 ms en el hilo principal (P6 de la F4a; sin Worker por file://).
 */
(function (root) {
  'use strict';

  const isNode = typeof module !== 'undefined' && module.exports;
  const req = (path, name) => (isNode ? require(path) : root.PNL[name]);
  const I = req('./i18n.js', 'i18n');
  if (isNode) require('./i18n-m7.js');
  const UNC = req('./unc.js', 'unc');
  const L = req('./core/tcl.js', 'tcl');
  const X = req('./core/stochex.js', 'stochex');
  const S = req('./core/sim.js', 'sim');
  const MC = req('./core/mc.js', 'mc');
  const T = req('./core/threept.js', 'threept');

  const EXAMPLES = ['kl', 'hl', 'kd', 'wa', 'wb', 'wc', 'wd'];
  const KINDS = ['pert', 'classic', 'tri', 'unif', 'norm', 'logn', 'disc'];
  const FIXED_P = [0.5, 0.8, 0.9];
  const BINS = 40;
  const str = (v) => (v == null ? '' : String(v));
  const splitIds = (s) => str(s).split(/[,\s]+/).filter(Boolean);

  // ---------- Probabilidades escritas ----------

  /** Una probabilidad escrita: decimal (coma o punto) o fracción n/d. */
  function parseProb(v) {
    const s = str(v).trim().replace(',', '.');
    if (/^\d+(\.\d+)?$/.test(s)) return { value: Number(s) };
    const f = s.match(/^(\d+)\/(\d+)$/);
    if (f && Number(f[2]) > 0) return { value: Number(f[1]) / Number(f[2]) };
    return { error: 'nan' };
  }
  /** Un valor de una discreta: un número (también negativo, para que el error lo nombre checkDisc). */
  function parseValue(v) {
    const s = str(v).trim().replace(',', '.');
    return /^-?\d+(\.\d+)?$/.test(s) ? { value: Number(s) } : { error: 'nan' };
  }
  /** Cómo se escribe una probabilidad: con hasta 4 decimales, si los tiene; si no, como fracción (1/3, 2/3, 1/6…). */
  function fmtProb(p, lang) {
    const dec = (x) => { const s = String(Number(x.toFixed(4))); return lang === 'es' ? s.replace('.', ',') : s; };
    if (Math.abs(p * 1e4 - Math.round(p * 1e4)) < 1e-7) return dec(p);
    for (let d = 2; d <= 24; d++) { const n = Math.round(p * d); if (Math.abs(p * d - n) < 1e-9) return `${n}/${d}`; }
    return dec(p);
  }
  const fmtVal = (x, lang) => { const s = String(Number(Number(x).toFixed(4))); return lang === 'es' ? s.replace('.', ',') : s; };
  /** Los textos con los que se abre el editor de una discreta. */
  const discText = (dist, lang) => ({ x: dist.x.map((v) => fmtVal(v, lang)), p: dist.p.map((v) => fmtProb(v, lang)) });

  // ---------- El modelo ----------

  function readDisc(q) {
    const x = q.x.map(parseValue); const p = q.p.map(parseProb);
    if (x.concat(p).some((r) => r.error)) return { err: 'nan' };
    const dist = { kind: 'disc', x: x.map((r) => r.value), p: p.map((r) => r.value) };
    const e = MC.checkDisc(dist);
    return e.length ? { err: e[0] } : { dist };
  }

  /**
   * El modelo de M7: { src, issues, discrete, acts, discErrors, ok, normal, deadline, pct, corr, mixed, sim, exact }.
   * acts[i] = { id, name, preds, a, m, b (null en los ejemplos discretos), kind, dist (null con error), mean, var, edited,
   * err }. normal = la de M6 (camino crítico de las medias; fórmulas de examen salvo las discretas escritas o de un
   * ejemplo, que aportan sus momentos; A2). sim = { model, n, us, key } (null si no se puede simular).
   */
  function model(state, lang) {
    const ex = state.ue !== 'own' ? X.get(state.ue) : null;
    const discrete = !!(ex && ex.m7only);
    let src; let base;
    if (discrete) {
      src = { kind: 'example', id: ex.id, unit: ex.unit[lang], mode: 'pred', title: ex.title[lang], expected: ex.expected,
        rows: ex.rows.map((r) => ({ id: r.id, name: r.name[lang], links: r.links })) };
      base = { issues: [], acts: ex.rows.map((r) => ({ id: r.id, name: r.name[lang], preds: splitIds(r.links), abc: null, disc: r.disc })) };
    } else {
      src = UNC.source(state.ue === 'own' && !state.ut ? Object.assign({}, state, { ue: 'kl' }) : state, lang);
      const v = UNC.validate(src);
      base = { issues: v.issues, acts: v.model ? v.model.acts.map((a) => ({ id: a.id, name: a.name || '', preds: a.preds, abc: { a: a.dist.a, m: a.dist.m, b: a.dist.b } })) : [] };
    }
    const uf = state.uf || {}; const uq = state.uq || {};
    const ug = KINDS.includes(state.ug) ? state.ug : 'pert';
    const acts = base.acts.map((a) => {
      const kind = discrete ? 'disc' : (KINDS.includes(uf[a.id]) ? uf[a.id] : ug);
      const out = { id: a.id, name: a.name, preds: a.preds, a: a.abc ? a.abc.a : null, m: a.abc ? a.abc.m : null, b: a.abc ? a.abc.b : null,
        kind, dist: null, mean: null, var: null, edited: false, err: null };
      if (kind === 'disc' && uq[a.id]) {
        out.edited = true;
        const r = readDisc(uq[a.id]);
        if (r.err) out.err = r.err; else out.dist = r.dist;
      } else if (kind === 'disc') {
        out.dist = a.disc ? { kind: 'disc', x: a.disc.x.slice(), p: a.disc.p.slice() } : MC.distFor('disc', a.abc);
      } else out.dist = MC.distFor(kind, a.abc);
      if (out.dist) { const mo = MC.moments(out.dist); out.mean = mo.mean; out.var = mo.var; }
      return out;
    });
    const discErrors = acts.filter((a) => a.err).map((a) => ({ id: a.id, code: a.err }));
    const ok = !base.issues.length && acts.length > 0 && !discErrors.length;
    const out = { src, issues: base.issues, discrete, acts, discErrors, ok, normal: null, deadline: null,
      pct: (Number.isInteger(state.uv) ? state.uv : 95) / 100, corr: state.uo === 's' ? 'spearman' : 'pearson',
      mixed: !discrete && new Set(acts.map((a) => a.kind)).size > 1, sim: null, exact: null, empty: !acts.length && !base.issues.length };
    if (!ok) return out;
    // La normal de M6 (A2): las fórmulas de examen de a, m y b; las discretas escritas o de un ejemplo, con sus momentos.
    const examModel = { acts: acts.map((a) => ({ id: a.id, preds: a.preds,
      dist: a.a != null && !a.edited ? { kind: 'pert', a: a.a, m: a.m, b: a.b } : { kind: 'normal', mu: a.mean, var: a.var } })) };
    const e = L.exam(examModel, { prob: 0.5 });
    out.examModel = examModel;
    out.normal = { mu: e.mu, var: e.var, sd: e.sd, path: e.path };
    out.deadline = UNC.deadlineOf(state, { src, exam: e });
    const simModel = L.simModel({ acts: acts.map((a) => ({ id: a.id, preds: a.preds, dist: a.dist })) });
    const n = 10 ** (state.ur || 4); const us = UNC.seedOf(state);
    out.sim = { model: simModel, n, us, key: JSON.stringify([simModel, n, us]) };
    out.exact = MC.exact(simModel);
    return out;
  }

  /** Resumen de una simulación terminada: media y su intervalo, desviación, P(≤ plazo) y percentiles, con los de la normal. */
  function results(m, res) {
    const su = S.summary(res.durations);
    const sorted = Float64Array.from(res.durations).sort();
    const n = su.n; const pT = su.pLE(m.deadline);
    const ps = FIXED_P.concat(FIXED_P.includes(m.pct) ? [] : [m.pct]).sort((x, y) => x - y);
    const q = ps.map((p) => ({ p, sim: MC.percentile(sorted, p), normal: L.exam(m.examModel, { prob: p }).deadline, chosen: p === m.pct }));
    const pN = L.exam(m.examModel, { deadline: m.deadline }).exact;
    const ex = m.exact && m.exact.dist ? m.exact : null;
    return { n, mean: su.mean, sd: su.sd, seMean: su.sd / Math.sqrt(n), pT, seP: Math.sqrt(pT * (1 - pT) / n), pN, q, sorted, su,
      min: su.min, max: su.max, hist: su.hist(BINS), exact: ex ? { mean: ex.mean, sd: Math.sqrt(Math.max(0, ex.var)), pT: ex.pLE(m.deadline) } : null };
  }

  /** El orden del tornado en espejo: por criticidad (c) o por crucialidad (u), de mayor a menor; empates por id. */
  function tornadoOrder(rows, uz) {
    const k = uz === 'u' ? 'cruc' : 'crit';
    return rows.slice().sort((x, y) => y[k] - x[k] || x.id.localeCompare(y.id, 'en', { numeric: true }));
  }

  // ---------- Vista ----------

  function create(hooks) {
    const { h } = root.PNL.dom;
    const DC = root.PNL.distChart; const MCC = root.PNL.mcCharts;
    const lang = () => hooks.lang();
    const state = () => hooks.state();
    const t = (k, p) => I.t(lang(), k, p);
    const tm = (k, p) => I.t(lang(), `m7.${k}`, p);
    const tu = (k, p) => I.t(lang(), `unc.${k}`, p);
    const loc = () => (lang() === 'en' ? 'en-GB' : 'es-ES');
    const fx = (v, k) => { const x = Number(v).toFixed(k); return lang() === 'en' ? x : x.replace('.', ','); };
    const num4 = (v) => Number(v).toLocaleString(loc(), { maximumFractionDigits: 4, useGrouping: false });
    const big = (n) => Number(n).toLocaleString(loc());
    const lab = () => UNC.labels(state().nota);
    const go = (action, opts) => hooks.dispatch(Object.assign({ type: 'unc' }, action), opts);
    const focus = hooks.focus;
    // A 360 px el tornado y la red se dibujan más estrechos, para que el texto no se encoja (bocetos, tablero 79).
    const narrow = () => (root.innerWidth || 1280) < 640;
    let m = null;
    let perOpen = false;           // «Distribuciones por actividad» abierta (estado de la vista, no del enlace)
    const editOpen = new Set();    // discretas con el editor abierto
    let binsOpen = false;

    // ---------- Simulación e índices, a trozos ----------
    let run = { key: null, job: null, res: null, timer: null, ikey: null, ijob: null, idx: null };
    let last = null;               // la última simulación terminada { m, res, r } (se ve en gris mientras haya errores)
    function cancel() { if (run.timer) root.clearTimeout(run.timer); run = { key: null, job: null, res: null, timer: null, ikey: null, ijob: null, idx: null }; }
    function ensure() {
      if (!m.ok) { if (run.timer) root.clearTimeout(run.timer); run.timer = null; return; }
      const key = m.sim.key; const ikey = `${key}|${m.corr}`;
      if (run.key === key && run.ikey === ikey) return;
      if (run.key === key && run.res) { startIdx(ikey); return; }
      cancel();
      run.key = key; run.ikey = ikey;
      hooks.announce(tm('running', { n: big(m.sim.n) }));
      const spec = m.sim;
      const tick = () => {
        if (run.key !== key) return;
        if (!run.job) run.job = S.start({ kind: 'project', model: spec.model, n: spec.n, us: spec.us, track: true });
        if (!S.step(run.job, { ms: 12 }).done) { run.timer = root.setTimeout(tick, 0); return; }
        run.res = S.result(run.job); run.job = null; run.timer = null;
        last = { m, res: run.res, r: results(m, run.res) };
        startIdx(ikey);
        hooks.redraw();
        hooks.announce(tm('done', { n: big(spec.n), T: num4(m.deadline), p: fx(last.r.pT, 3) }));
      };
      run.timer = root.setTimeout(tick, 120);
    }
    function startIdx(ikey) {
      run.ikey = ikey; run.idx = null; run.ijob = MC.startIndices(run.res, m.sim.model, { corr: m.corr });
      const key = run.key;
      const tick = () => {
        if (run.key !== key || run.ikey !== ikey) return;
        if (!MC.stepIndices(run.ijob, { ms: 12 }).done) { run.timer = root.setTimeout(tick, 0); return; }
        run.idx = MC.resultIndices(run.ijob); run.ijob = null; run.timer = null;
        if (state().uy === 'idx') hooks.redraw();
      };
      run.timer = root.setTimeout(tick, 0);
    }
    const ready = () => m.ok && run.key === m.sim.key && run.res;
    const current = () => (ready() ? { m, res: run.res, r: last && last.res === run.res ? last.r : results(m, run.res) } : null);

    // ---------- Filas de la barra ----------
    function seg(items, label) {
      return h('div', { class: 'seg', role: 'group', 'aria-label': label },
        items.map(([text, on, fn, id]) => h('button', { type: 'button', 'aria-pressed': String(!!on), onclick: fn, id }, [text])));
    }
    function rows() {
      const s = state();
      const views = seg(['dist', 'idx'].map((v) => [tm(`views.${v}`), s.uy === v, () => { go({ uy: v }); focus(`m7View-${v}`); }, `m7View-${v}`]), tm('views.label'));
      const down = h('span', { class: 'unc-field m7-down' }, [tm('download'), ' ',
        h('a', { href: 'python/pnl_montecarlo.py', download: 'pnl_montecarlo.py', id: 'm7Py' }, [tm('py')]), ' · ',
        h('button', { type: 'button', class: 'linklike', id: 'm7Json', disabled: !m.ok, onclick: downloadJson }, [tm('json')])]);
      const r2 = h('div', { class: 'unc-row' }, [h('span', { class: 'unc-field muted' }, [tm('views.label')]), views, h('span', { class: 'unc-push' }), down]);
      return [r2, controls()];
    }
    function controls() {
      const s = state();
      const parts = [];
      if (m.discrete) parts.push(h('span', { class: 'unc-field muted', id: 'm7DistFixed' }, [tm('distDisc')]));
      else {
        const opts = KINDS.filter((k) => k !== 'disc').map((k) => h('option', { value: k, selected: !m.mixed && s.ug === k }, [tm(`kind.${k}`)]));
        if (m.mixed) opts.unshift(h('option', { value: '', selected: true, disabled: true }, [tm('mixed')]));
        parts.push(h('label', { class: 'unc-field' }, [tm('distAll'), ' ', h('select', { id: 'm7Dist',
          onchange: (e) => { go({ ug: e.target.value, uf: null }); focus('m7Dist'); } }, opts)]));
      }
      parts.push(h('button', { type: 'button', class: 'ghost', id: 'm7PerAct', 'aria-expanded': String(perOpen), 'aria-controls': 'm7Dists',
        onclick: () => { perOpen = !perOpen; hooks.redraw(); focus('m7PerAct'); } }, [`${tm('perAct')} ${perOpen ? '▴' : '▾'}`]));
      parts.push(h('label', { class: 'unc-field' }, [tm('reps'), ' ', h('select', { id: 'm7Reps', onchange: (e) => { go({ ur: Number(e.target.value) }); focus('m7Reps'); } },
        [2, 3, 4, 5].map((k) => h('option', { value: String(k), selected: (s.ur || 4) === k }, [big(10 ** k)])))]));
      if (m.ok) {
        parts.push(numField('m7Deadline', tu('ask.deadline'), m.deadline, m.src.unit, (v) => v >= 0 && v <= 999999, tu('ask.badDeadline'), (v) => go({ ud: v })));
        if (s.uy === 'dist') parts.push(numField('m7Pct', tm('pct'), Math.round(m.pct * 100), '%', (v) => Number.isInteger(v) && v >= 1 && v <= 99, tm('badPct'), (v) => go({ uv: v })));
      }
      if (s.uy === 'idx') {
        parts.push(h('fieldset', { class: 'unc-mode', id: 'm7Corr' }, [h('legend', {}, [tm('corr')])].concat(['p', 's'].map((k) => h('label', {}, [
          h('input', { type: 'radio', name: 'm7Corr', id: `m7Corr-${k}`, value: k, checked: (s.uo || 'p') === k, onchange: () => { go({ uo: k }); focus(`m7Corr-${k}`); } }), ' ', tm(`corrName.${k}`)])))));
      }
      parts.push(h('span', { class: 'unc-field' }, [h('button', { type: 'button', class: 'ghost', id: 'm7Again', onclick: () => { go({ us: hooks.newSeed() }); focus('m7Again'); } }, [tu('sim.again')]),
        h('span', { class: 'muted small', id: 'm7Seed' }, [tu('sim.seed', { us: UNC.seedOf(s) })])]));
      return h('div', { class: 'unc-row m7-controls' }, parts);
    }
    function numField(id, label, value, unit, ok, bad, commit) {
      const err = h('span', { class: 'unc-err small', id: `${id}Err`, hidden: true }, [bad]);
      const input = h('input', { id, value: value == null ? '' : num4(value), size: '5', inputmode: 'decimal', 'aria-describedby': `${id}Err`,
        onchange: (e) => {
          const p = UNC.parseNum(e.target.value);
          const v = p.error ? NaN : p.value;
          if (!ok(v)) { e.target.setAttribute('aria-invalid', 'true'); err.hidden = false; return; }
          e.target.setAttribute('aria-invalid', 'false'); err.hidden = true; commit(v); focus(id);
        } });
      return h('span', { class: 'unc-field' }, [h('label', { for: id }, [label]), input, unit ? h('span', { class: 'muted' }, [unit]) : null, err]);
    }
    function downloadJson() {
      if (!m.ok) return;
      const names = Object.fromEntries(m.acts.filter((a) => a.name).map((a) => [a.id, a.name]));
      const data = MC.toJSON(m.sim.model, { unit: m.src.unit, reps: m.sim.n, us: m.sim.us, deadline: m.deadline, p: m.pct, corr: m.corr, names });
      const blob = new root.Blob([`${JSON.stringify(data, null, 1)}\n`], { type: 'application/json' });
      const url = root.URL.createObjectURL(blob);
      const a = h('a', { href: url, download: `pnl-montecarlo-${m.src.id}.json` });
      root.document.body.appendChild(a); a.click(); a.remove();
      root.setTimeout(() => root.URL.revokeObjectURL(url), 1000);
      hooks.announce(tm('jsonDone'));
    }

    // ---------- Distribuciones por actividad ----------
    function distsCard() {
      const L5 = lab(); const s = state();
      const head = h('tr', {}, [t('work.colId'), t('work.colName'), tm('colDist'), L5.a, L5.m, L5.b, tm('colMean'), tm('colVar')].map((c) => h('th', { scope: 'col' }, [c])));
      const body = [];
      for (const a of m.acts) {
        const kinds = m.discrete ? ['disc'] : KINDS;
        const sel = h('select', { id: `m7K-${a.id}`, 'aria-label': tm('distOf', { id: a.id }), disabled: m.discrete,
          onchange: (e) => { setKind(a.id, e.target.value); focus(`m7K-${a.id}`); } }, kinds.map((k) => h('option', { value: k, selected: a.kind === k }, [tm(`kind.${k}`)])));
        const editing = a.kind === 'disc' && (editOpen.has(a.id) || !!a.err);
        const edit = a.kind === 'disc' ? h('button', { type: 'button', class: 'ghost small-btn', id: `m7Edit-${a.id}`, 'aria-expanded': String(editing), 'aria-controls': `m7Q-${a.id}`,
          onclick: () => { if (editOpen.has(a.id)) editOpen.delete(a.id); else editOpen.add(a.id); hooks.redraw(); focus(`m7Edit-${a.id}`); } }, [`${tm('edit')} ${editing ? '▴' : '▾'}`]) : null;
        const v = (x) => h('td', { class: 'num' }, [x == null ? '—' : num4(x)]);
        body.push(h('tr', { class: a.err ? 'bad' : '', 'data-act': a.id }, [h('th', { scope: 'row' }, [a.id]), h('td', {}, [a.name]), h('td', { class: 'm7-kind' }, [sel, ' ', edit]),
          v(a.a), v(a.m), v(a.b), h('td', { class: 'num' }, [a.mean == null ? '—' : fx(a.mean, 2)]), h('td', { class: 'num' }, [a.var == null ? '—' : fx(a.var, 2)])]));
        if (editing) body.push(h('tr', { class: a.err ? 'bad' : '' }, [h('td', {}), h('td', { colspan: '7' }, [discEditor(a, s)])]));
      }
      const notes = [h('p', { class: 'muted small' }, [tm('normalNote')])];
      if (m.acts.some((a) => a.kind === 'norm')) notes.push(h('p', { class: 'muted small' }, [tm('truncNote')]));
      return h('section', { class: 'card m7-dists', id: 'm7Dists', 'aria-labelledby': 'm7DistsHead' }, [
        h('h2', { id: 'm7DistsHead' }, [m.src.unit ? tm('distsTitleUnit', { unit: m.src.unit }) : tm('distsTitle')]),
        h('div', { class: 'unc-scroll', tabindex: '0', role: 'region', 'aria-label': tm('distsTitle') }, [h('table', { class: 'data unc-table m7-table', id: 'm7DistTable' }, [h('thead', {}, [head]), h('tbody', {}, body)])]),
      ].concat(notes));
    }
    function setKind(id, kind) {
      const s = state(); const uf = Object.assign({}, s.uf || {});
      uf[id] = kind;
      const ug = KINDS.includes(s.ug) ? s.ug : 'pert';
      for (const a of m.acts) if (uf[a.id] === ug) delete uf[a.id];
      if (kind === 'disc') editOpen.add(id);
      go({ uf: Object.keys(uf).length ? uf : null });
    }
    // Lo escrito en el editor de una discreta (o, sin editar, sus valores de partida).
    function qOf(a, s) {
      const uq = s.uq || {};
      if (uq[a.id]) return { x: uq[a.id].x.slice(), p: uq[a.id].p.slice() };
      return discText(a.dist, lang());
    }
    function discEditor(a, s) {
      const q = qOf(a, s);
      const save = (next) => { const uq = Object.assign({}, s.uq || {}); uq[a.id] = next; go({ uq }); };
      const read = () => {
        const box = root.document.getElementById(`m7Q-${a.id}`);
        const x = [...box.querySelectorAll('input[data-q="x"]')].map((i) => i.value);
        const p = [...box.querySelectorAll('input[data-q="p"]')].map((i) => i.value);
        return { x, p };
      };
      const rowsQ = q.x.map((x, j) => h('tr', {}, [
        h('td', {}, [h('input', { id: `m7Q-${a.id}-x-${j}`, 'data-q': 'x', value: x, size: '6', inputmode: 'decimal', 'aria-label': tm('valueN', { id: a.id, n: j + 1 }),
          'aria-invalid': String(!!a.err), onchange: () => { save(read()); focus(`m7Q-${a.id}-x-${j}`); } })]),
        h('td', {}, [h('input', { id: `m7Q-${a.id}-p-${j}`, 'data-q': 'p', value: q.p[j], size: '6', inputmode: 'decimal', 'aria-label': tm('probN', { id: a.id, n: j + 1 }),
          'aria-invalid': String(!!a.err), onchange: () => { save(read()); focus(`m7Q-${a.id}-p-${j}`); } })]),
        h('td', {}, [h('button', { type: 'button', class: 'ghost small-btn', id: `m7QDel-${a.id}-${j}`, 'aria-label': tm('removeValue', { id: a.id, n: j + 1 }), disabled: q.x.length <= 1,
          onclick: () => { const r = read(); r.x.splice(j, 1); r.p.splice(j, 1); save(r); focus(`m7QAdd-${a.id}`); } }, ['×'])])]));
      const table = h('table', { class: 'data unc-table m7-q' }, [h('caption', { class: 'muted small' }, [a.edited ? tm('discEdited', { id: a.id }) : tm('discStart', { id: a.id })]),
        h('thead', {}, [h('tr', {}, [tm('value'), tm('prob')].map((c) => h('th', { scope: 'col' }, [c])).concat([h('td', {})]))]), h('tbody', {}, rowsQ)]);
      const err = a.err ? h('p', { class: 'unc-err small', id: `m7QErr-${a.id}`, role: 'alert' }, [tm(`disc.${a.err}`, { id: a.id, sum: sumText(q) })]) : null;
      const btns = h('div', { class: 'unc-row' }, [
        h('button', { type: 'button', class: 'ghost', id: `m7QAdd-${a.id}`, disabled: q.x.length >= 20, onclick: () => { const r = read(); r.x.push(''); r.p.push(''); save(r); focus(`m7Q-${a.id}-x-${r.x.length - 1}`); } }, [tm('addValue')]),
        a.a != null ? h('button', { type: 'button', class: 'ghost', id: `m7QReset-${a.id}`, disabled: !a.edited, onclick: () => { const uq = Object.assign({}, s.uq || {}); delete uq[a.id]; go({ uq: Object.keys(uq).length ? uq : null }); focus(`m7Edit-${a.id}`); } },
          [tm('reset', lab())]) : null]);
      return h('div', { class: 'm7-qbox', id: `m7Q-${a.id}` }, [table, h('div', { class: 'm7-qside' }, [err, btns, h('p', { class: 'muted small' }, [tm('discHint')])])]);
    }
    function sumText(q) {
      const ps = q.p.map(parseProb);
      return ps.some((r) => r.error) ? '—' : fx(ps.reduce((x, r) => x + r.value, 0), 2);
    }

    // ---------- Duración del proyecto ----------
    function niceTicks(lo, hi) { return UNC.niceTicks(lo, hi, 8); }
    function axisOf(r) {
      const mu = m.normal.mu; const sd = m.normal.sd;
      let lo = Math.min(r ? r.min : mu, mu - 4 * sd); let hi = Math.max(r ? r.max : mu, mu + 4 * sd);
      if (!(hi - lo > 1e-9)) { lo = mu - 1; hi = mu + 1; }
      return [Math.max(0, lo), hi];
    }
    function normalPts(lo, hi) {
      const { mu, sd } = m.normal;
      if (!(sd > 0)) return [];
      return Array.from({ length: 201 }, (_, i) => { const x = lo + ((hi - lo) * i) / 200; return [x, Math.exp(-0.5 * ((x - mu) / sd) ** 2) / (sd * Math.sqrt(2 * Math.PI))]; });
    }
    function histCard(cur) {
      const r = cur && cur.r; const holder = h('div', { class: 'unc-chart', id: 'm7Hist' });
      const kinds = new Set(m.acts.map((a) => a.kind));
      const what = kinds.size === 1 ? tm(`kind.${[...kinds][0]}`) : tm('mixedShort');
      const parts = [h('h2', { id: 'm7HistHead' }, [tm('histTitle', { n: big(m.sim.n), what })]), holder];
      const [lo, hi] = axisOf(r);
      const pts = normalPts(lo, hi);
      const peak = Math.max(0, ...pts.map((q) => q[1]));
      const hpeak = r ? Math.max(...r.hist.counts) / (r.n * r.hist.width) : 0;
      const vlines = [{ x: m.deadline, cls: 'v-deadline', label: tu('exam.deadline', { T: num4(m.deadline) }) }];
      if (r) vlines.push({ x: r.mean, cls: 'v-sd', dash: '4 3' });
      DC.render(holder, { w: 620, h: 270, x: [lo, hi], ymax: Math.max(peak, hpeak) * 1.1 || 1, ticks: niceTicks(lo, hi), fmt: (v) => num4(v),
        hist: r ? Object.assign({ n: r.n }, r.hist) : null, curves: pts.length ? [{ pts, cls: 'c-normal' }] : [], vlines,
        label: r ? tm('histLabel', { n: big(r.n), mean: fx(r.mean, 2), mu: fx(m.normal.mu, 2), var: fx(m.normal.var, 2), T: num4(m.deadline), ps: fx(r.pT, 3), pn: fx(r.pN, 3) }) : tm('running', { n: big(m.sim.n) }) });
      parts.push(h('div', { class: 'unc-legend', 'aria-hidden': 'true' }, [key('k-hist', tm('legendSim')), key('k-normal', tm('legendNormal', { mu: fx(m.normal.mu, 2), var: fx(m.normal.var, 2) })), r ? key('k-sd', tm('legendMean')) : null]));
      if (!r) { parts.push(h('p', { class: 'muted small', id: 'm7Wait' }, [tm('running', { n: big(m.sim.n) })])); return h('section', { class: 'card unc-simcard', 'aria-labelledby': 'm7HistHead' }, parts); }
      const toggle = h('button', { type: 'button', class: 'linklike', id: 'm7Bins', 'aria-expanded': String(binsOpen), 'aria-controls': 'm7BinsTable',
        onclick: () => { binsOpen = !binsOpen; hooks.redraw(); focus('m7Bins'); } }, [binsOpen ? tu('sim.hideTable') : tu('sim.showTable')]);
      parts.push(h('p', { class: 'muted small' }, [toggle, ` · ${tm('normalOnly', { path: m.normal.path.join('–') })}`]));
      if (binsOpen) parts.push(binsTable(r));
      if (r.sd === 0) parts.push(h('p', { class: 'card unc-info', id: 'm7Fixed' }, [tm('allFixed', { T: num4(r.mean) })]));
      else if (r.mean > m.normal.mu + 1e-9 && r.pT < r.pN) parts.push(h('p', { class: 'card unc-callout', id: 'm7Note' }, [tm('mergeNote', { mean: fx(r.mean, 2), mu: fx(m.normal.mu, 2), T: num4(m.deadline), pn: fx(r.pN, 3), ps: fx(r.pT, 3) })]));
      return h('section', { class: 'card unc-simcard', 'aria-labelledby': 'm7HistHead' }, parts);
    }
    function binsTable(r) {
      const { lo, width, counts } = r.hist; const { mu, sd } = m.normal;
      const F = (x) => (sd > 0 ? T.phi((x - mu) / sd) : (x >= mu ? 1 : 0));
      const rowsB = counts.map((c, i) => { const a = lo + i * width; const b = a + width;
        return h('tr', {}, [h('th', { scope: 'row' }, [`${fx(a, 2)} – ${fx(b, 2)}`]), h('td', { class: 'num' }, [big(c)]), h('td', { class: 'num' }, [fx(c / r.n, 3)]), h('td', { class: 'num' }, [fx(F(b) - F(a), 3)])]); });
      return h('div', { class: 'unc-scroll unc-bins', tabindex: '0', role: 'region', 'aria-label': tu('sim.binsCaption'), id: 'm7BinsTable' }, [h('table', { class: 'data unc-table' }, [
        h('caption', { class: 'sr-only' }, [tu('sim.binsCaption')]),
        h('thead', {}, [h('tr', {}, ['colBin', 'colCount', 'colShare', 'colNormal'].map((k) => h('th', { scope: 'col' }, [tu(`sim.${k}`)])))]), h('tbody', {}, rowsB)])]);
    }
    function cdfCard(cur) {
      const r = cur && cur.r; const holder = h('div', { class: 'unc-chart', id: 'm7Cdf' });
      const parts = [h('h2', { id: 'm7CdfHead' }, [tm('cdfTitle')]), holder];
      if (r) {
        const [lo, hi] = axisOf(r);
        MCC.cdf(holder, { w: 580, h: 190, x: [lo, hi], ticks: niceTicks(lo, hi), fmt: (v) => num4(v), yfmt: (v) => fx(v, 1), sorted: r.sorted,
          normal: m.normal.sd > 0 ? { mu: m.normal.mu, sd: m.normal.sd } : null, deadline: m.deadline,
          marks: r.q.map((q) => ({ p: q.p, x: q.sim, label: `P${Math.round(q.p * 100)}`, chosen: q.chosen })),
          label: tm('cdfLabel', { list: r.q.map((q) => `P${Math.round(q.p * 100)} = ${fx(q.sim, 2)}`).join(', ') }) });
        parts.push(h('div', { class: 'unc-legend', 'aria-hidden': 'true' }, [key('k-cdf', tm('legendCdf')), key('k-normal-dash', tm('legendNormalShort'))]));
      } else parts.push(h('p', { class: 'muted small' }, [tm('running', { n: big(m.sim.n) })]));
      return h('section', { class: 'card unc-simcard m7-cdf', 'aria-labelledby': 'm7CdfHead' }, parts);
    }
    function resCard(cur) {
      const r = cur && cur.r; const T0 = num4(m.deadline);
      const ex = r && r.exact;
      const cols = [tm('colSim'), tm('colNormal')].concat(ex ? [tm('colExact')] : []);
      const row = (label, cells, cls) => h('tr', { class: cls || '' }, [h('th', { scope: 'row' }, [label])].concat(cells.map((c) => h('td', { class: 'num' }, [c]))));
      const wait = '…';
      const body = [
        row(tm('rowMean'), [r ? tm('pm', { v: fx(r.mean, 2), e: fx(1.96 * r.seMean, 2) }) : wait, fx(m.normal.mu, 2)].concat(ex ? [fx(ex.mean, 2)] : [])),
        row(tm('rowSd'), [r ? fx(r.sd, 2) : wait, fx(m.normal.sd, 2)].concat(ex ? [fx(ex.sd, 2)] : [])),
        row(tm('rowP', { T: T0 }), [r ? tm('pm', { v: fx(r.pT, 3), e: fx(1.96 * r.seP, 3) }) : wait, r ? fx(r.pN, 3) : wait].concat(ex ? [fx(ex.pT, 3)] : []), 'strong'),
      ];
      if (r) for (const q of r.q) body.push(row(`P${Math.round(q.p * 100)}${q.chosen ? ` ${tm('chosen')}` : ''}`, [fx(q.sim, 2), fx(q.normal, 2)].concat(ex ? ['—'] : []), q.chosen ? 'sel' : ''));
      const parts = [h('h2', { id: 'm7ResHead' }, [tm('resTitle')]),
        h('table', { class: 'data unc-table', id: 'm7Res' }, [h('thead', {}, [h('tr', {}, [h('td', {})].concat(cols.map((c) => h('th', { scope: 'col' }, [c]))))]), h('tbody', {}, body)])];
      if (r) { const q = r.q.find((x) => x.chosen); if (q) parts.push(h('p', { class: 'muted small', id: 'm7PctText' }, [tm(m.src.unit ? 'pctText' : 'pctTextNoUnit', { p: Math.round(q.p * 100), T: fx(q.sim, 2), unit: m.src.unit })])); }
      return h('section', { class: 'card unc-probcard', 'aria-labelledby': 'm7ResHead' }, parts);
    }
    function key(cls, text) { return h('span', { class: 'unc-key' }, [h('span', { class: `unc-swatch ${cls}`, 'aria-hidden': 'true' }), text]); }

    // ---------- Índices ----------
    function idxCard(cur, idx) {
      const s = state(); const exOk = m.exact && m.exact.dist; const spear = m.corr === 'spearman';
      const cols = [tm('colAct'), tm('crit')].concat(exOk ? [tm('colExact')] : []).concat([tm(spear ? 'crucS' : 'crucP')]).concat(exOk && !spear ? [tm('colExact')] : [])
        .concat([tm('sig')]).concat(exOk ? [tm('colExact')] : []);
      const rowsI = idx ? tornadoOrder(m.acts.map((a, i) => ({ id: a.id, i, crit: idx.crit[i], cruc: idx.cruc[i], sig: idx.sig[i] })), s.uz) : [];
      const cell = (v) => h('td', { class: 'num' }, [fx(Math.abs(v) < 5e-4 ? 0 : v, 3)]);
      const body = rowsI.map((r) => h('tr', { 'data-act': r.id }, [h('th', { scope: 'row' }, [r.id]), cell(r.crit)].concat(exOk ? [cell(m.exact.crit[r.i])] : [])
        .concat([cell(r.cruc)]).concat(exOk && !spear ? [cell(m.exact.cruc[r.i])] : []).concat([cell(r.sig)]).concat(exOk ? [cell(m.exact.sig[r.i])] : [])));
      const parts = [h('h2', { id: 'm7IdxHead' }, [tm('idxTitle', { n: big(m.sim.n) })])];
      if (!idx) parts.push(h('p', { class: 'muted small', id: 'm7IdxWait' }, [tm('idxRunning')]));
      else {
        parts.push(h('div', { class: 'unc-scroll', tabindex: '0', role: 'region', 'aria-label': tm('idxTable') }, [h('table', { class: 'data unc-table', id: 'm7Idx' }, [
          h('caption', { class: 'muted small' }, [tm(exOk ? 'idxCaptionExact' : 'idxCaption', { order: tm(`order.${s.uz === 'u' ? 'u' : 'c'}`), combos: big(exOk ? m.exact.combos : 0) })]),
          h('thead', {}, [h('tr', {}, cols.map((c) => h('th', { scope: 'col' }, [c])))]), h('tbody', {}, body)])]));
        if (cur && cur.r.sd === 0) parts.push(h('p', { class: 'small', id: 'm7NoUnc', role: 'status' }, [tm('noUnc')]));
        if (m.acts.some((a) => a.var === 0) && cur && cur.r.sd > 0) parts.push(h('p', { class: 'muted small' }, [tm('fixedCruc')]));
      }
      return h('section', { class: 'card m7-idx', 'aria-labelledby': 'm7IdxHead' }, parts);
    }
    function tornadoCard(idx) {
      const s = state(); const holder = h('div', { class: 'unc-chart', id: 'm7Tor' });
      const order = h('select', { id: 'm7Order', onchange: (e) => { go({ uz: e.target.value }); focus('m7Order'); } },
        ['c', 'u'].map((k) => h('option', { value: k, selected: (s.uz || 'c') === k }, [tm(`order.${k}`)])));
      const parts = [h('div', { class: 'unc-head' }, [h('h2', { id: 'm7TorHead' }, [tm('torTitle')]), h('label', { class: 'unc-field' }, [tm('orderLabel'), ' ', order])]), holder];
      if (idx) {
        const rowsT = tornadoOrder(m.acts.map((a, i) => ({ id: a.id, crit: idx.crit[i], cruc: Math.max(0, idx.cruc[i]) })), s.uz);
        MCC.tornado(holder, { w: narrow() ? 330 : 580, rows: rowsT, left: tm('crit'), right: tm(m.corr === 'spearman' ? 'crucS' : 'crucP'), fmt: (v) => fx(v, 2),
          label: tm('torLabel', { order: tm(`order.${s.uz === 'u' ? 'u' : 'c'}`), list: rowsT.map((r) => tm('torItem', { id: r.id, c: fx(r.crit, 2), u: fx(r.cruc, 2) })).join('; ') }) });
      }
      return h('section', { class: 'card m7-tor', 'aria-labelledby': 'm7TorHead' }, parts);
    }
    function pathsCard(idx) {
      const parts = [h('h2', { id: 'm7PathsHead' }, [tm('pathsTitle')])];
      if (!idx) { parts.push(h('p', { class: 'muted small' }, [tm('idxRunning')])); return h('section', { class: 'card unc-pathscard', 'aria-labelledby': 'm7PathsHead' }, parts); }
      const exOk = m.exact && m.exact.dist;
      const shown = idx.paths.list.slice(0, 8);
      const exactOf = (p) => { const q = exOk ? m.exact.paths.list.find((x) => x.ids.join() === p.ids.join()) : null; return q ? fx(q.crit, 3) : '—'; };
      const bodyP = shown.map((p) => h('tr', { class: p.ids.join() === m.normal.path.join() ? 'sel' : '' }, [h('th', { scope: 'row' }, [p.ids.join('–')]),
        h('td', { class: 'num' }, [fx(p.mean, 2)]), h('td', { class: 'num' }, [fx(p.crit, 3)])].concat(exOk ? [h('td', { class: 'num' }, [exactOf(p)])] : [])));
      parts.push(h('table', { class: 'data unc-table', id: 'm7Paths' }, [h('thead', {}, [h('tr', {}, [tm('colPath'), tm('colMean'), tm('crit')].concat(exOk ? [tm('colExact')] : []).map((c) => h('th', { scope: 'col' }, [c])))]), h('tbody', {}, bodyP)]));
      const rest = idx.paths.count - shown.length;
      if (rest > 0) parts.push(h('p', { class: 'muted small', id: 'm7PathsMore' }, [tu(rest === 1 ? 'proj.moreOne' : 'proj.more', { n: big(rest) })]));
      const sum = idx.paths.list.reduce((x, p) => x + p.crit, 0);
      if (idx.paths.count === idx.paths.list.length && sum > 1 + 1e-9) parts.push(h('p', { class: 'card unc-info', id: 'm7PathsTie' }, [tm('tieNote', { sum: fx(sum, 3) })]));
      const off = shown.find((p) => p.ids.join() !== m.normal.path.join() && p.crit > 0.05);
      if (off && !m.discrete) parts.push(h('p', { class: 'card unc-callout', id: 'm7PathsOff' }, [tm('offNote', { path: off.ids.join('–'), mean: m.normal.path.join('–'), p: Math.round(off.crit * 100) })]));
      return h('section', { class: 'card unc-pathscard', 'aria-labelledby': 'm7PathsHead' }, parts);
    }
    let lay = { key: null, roy: null, sol: null, project: null };
    function netCard(idx) {
      const s = state(); const ui = ['cr', 'cu', 'si'].includes(s.ui) ? s.ui : 'cr';
      const sel = h('select', { id: 'm7Shade', onchange: (e) => { go({ ui: e.target.value }); focus('m7Shade'); } },
        ['cr', 'cu', 'si'].map((k) => h('option', { value: k, selected: ui === k }, [tm(`shade.${k}`)])));
      const holder = h('div', { class: 'unc-net', id: 'm7Net', tabindex: '0' });
      const parts = [h('div', { class: 'unc-head' }, [h('h2', { id: 'm7NetHead' }, [tm('netTitle')]), h('label', { class: 'unc-field' }, [tm('shadeLabel'), ' ', sel])]), holder];
      const key2 = JSON.stringify(m.acts.map((a) => [a.id, a.preds]));
      if (lay.key !== key2) {
        const preds = {}; const succs = {};
        for (const a of m.acts) { preds[a.id] = a.preds.slice(); succs[a.id] = []; }
        for (const a of m.acts) for (const p of a.preds) succs[p].push(a.id);
        const project = { activities: m.acts.map((a) => ({ id: a.id, name: a.name, d: a.mean })), preds, succs };
        const sol = root.PNL.cpm.solve(project);
        lay = { key: key2, project, sol, roy: root.PNL.layout.layout(sol, project) };
      }
      if (idx) {
        const vals = ui === 'cu' ? idx.cruc.map((v) => Math.max(0, v)) : ui === 'si' ? idx.sig : idx.crit;
        const shade = Object.fromEntries(m.acts.map((a, i) => [a.id, vals[i]]));
        root.PNL.royView.render(holder, { project: lay.project, solution: lay.sol, lay: lay.roy, step: null, revealed: new Map(), box: '7', lang: lang(), nota: s.nota,
          criticalOn: false, numFmt: (v) => fx(v, 2), name: m.src.title, fit: true, minWidth: 280, geo: narrow() ? { w: 50, h: 40, gx: 20, gy: 14, lab: 0 } : { w: 64, h: 44, gx: 38, gy: 18, lab: 0 },
          shade: { values: shade, fmt: (v) => fx(v, 2), label: tm(`shade.${ui}`) } });
        parts.push(h('div', { class: 'unc-legend m7-scale', 'aria-hidden': 'true' }, [`${tm(`shade.${ui}`)}: 0`].concat([0, 1, 2, 3, 4].map((k) => h('span', { class: `m7-swatch shade-${k}` }))).concat(['1', ' ', tm('scaleNote')])));
      } else parts.push(h('p', { class: 'muted small' }, [tm('idxRunning')]));
      return h('section', { class: 'card unc-netcard', 'aria-labelledby': 'm7NetHead' }, parts);
    }

    // ---------- Pintar ----------
    function issues() {
      if (m.issues.length || m.empty) {
        return h('section', { class: 'card unc-issues', id: 'm7Issues', role: 'status', 'aria-labelledby': 'm7IssuesHead' }, [h('h2', { id: 'm7IssuesHead' }, [tm('ownErrors', { n: m.issues.length })]),
          h('p', { class: 'small' }, [tm('ownErrorsText'), ' ', h('button', { type: 'button', class: 'linklike', id: 'm7ToM5', onclick: () => { go({ um: 'm5' }); focus('uncM5'); } }, [tm('toM5')])])]);
      }
      return h('p', { class: 'card unc-callout', id: 'm7Blocked', role: 'status' }, [tm('blocked', { ids: m.discErrors.map((e) => e.id).join(', ') })]);
    }
    function main() {
      const s = state(); const out = [];
      ensure();
      if (perOpen && m.acts.length) out.push(distsCard());
      let cur = current();
      if (!m.ok) {
        out.push(issues());
        // Mientras haya errores, la última simulación válida del mismo proyecto se ve en gris (bocetos, tablero 73).
        if (!last || last.m.src.id !== m.src.id || !last.m.acts.length) return out;
        cur = last;
      }
      const mm = m; if (!m.ok) m = cur.m;
      const grid = h('div', { class: `unc-main${mm.ok ? '' : ' m7-stale'}`, inert: !mm.ok });
      if (s.uy === 'idx') {
        const idx = mm.ok ? (run.idx && run.key === m.sim.key && run.ikey === `${m.sim.key}|${m.corr}` ? run.idx : null) : (cur.idx || null);
        if (mm.ok && idx && last) last.idx = idx;
        grid.appendChild(h('div', { class: 'unc-left' }, [idxCard(cur, idx), tornadoCard(idx)]));
        grid.appendChild(h('div', { class: 'unc-side' }, [pathsCard(idx), netCard(idx)]));
      } else {
        grid.appendChild(h('div', { class: 'unc-left' }, [histCard(cur)]));
        grid.appendChild(h('div', { class: 'unc-side' }, [cdfCard(cur), resCard(cur)]));
      }
      m = mm;
      out.push(grid);
      return out;
    }
    function setModel(model) { m = model; }
    function leave() { cancel(); }
    function debug() {
      if (!m) return null;
      const cur = current();
      return { ok: m.ok, src: m.src, acts: m.acts.map((a) => ({ id: a.id, kind: a.kind, mean: a.mean, var: a.var, edited: a.edited, err: a.err, dist: a.dist })),
        normal: m.normal, deadline: m.deadline, sim: m.sim && { n: m.sim.n, us: m.sim.us, key: m.sim.key },
        done: !!cur, results: cur ? { mean: cur.r.mean, sd: cur.r.sd, pT: cur.r.pT, pN: cur.r.pN, q: cur.r.q, counts: cur.r.hist.counts } : null,
        idx: cur && run.idx && run.ikey === `${m.sim.key}|${m.corr}` ? run.idx : null, exact: m.exact && m.exact.dist ? { mean: m.exact.mean, crit: m.exact.crit, cruc: m.exact.cruc, sig: m.exact.sig } : null };
    }
    return { setModel, rows, main, leave, debug };
  }

  const api = { EXAMPLES, KINDS, parseProb, fmtProb, discText, model, results, tornadoOrder, create };
  root.PNL = root.PNL || {};
  root.PNL.m7 = api;
  if (isNode) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
