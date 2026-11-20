/*
 * moodle-page — vista del exportador de Moodle, en su página moodle.html (js/moodle-app; spec f3b-moodle; plan §4, P2,
 * P7; tableros 51–56).
 *
 * Formulario (etapas, holgura de seguridad, niveles y ejemplares por categoría), resumen y descarga; la generación va
 * a trozos de unos 40 ms (core/moodle.runner.step) con una barra de progreso y «Cancelar», y el banco se descarga con
 * un Blob. La semilla del banco la elige la interfaz (crypto.getRandomValues), nunca el núcleo. La vista previa es
 * una pregunta de la primera etapa y el primer nivel marcados, con semilla fija 1 (views/question-view).
 * La selección vive en la página (no en la URL) y se conserva al cambiar de idioma o de notación; un cambio de
 * idioma o de notación mientras se genera cancela la generación.
 * Marcar una casilla o cambiar los ejemplares no redibuja el formulario: solo el resumen, el botón y la vista previa,
 * para que el foco y el clic siguiente se queden donde estaban (revisión T016). El estado (descarga o cancelación) se
 * guarda como clave y parámetros y se escribe en el idioma de la página.
 * La parte sin DOM (summary, fileName, missingText) se prueba en Node; PNL.moodlePage.state() da la selección, el
 * progreso y el último banco para las pruebas de navegador.
 * F3c (spec f3c-enunciados, plan §4 y P6; tablero 62): la etapa «0 · Enunciado → tabla» va la primera de la lista y
 * marcada al abrir, y se ofrece con stmtPublic (publicada en T013); si no se ofreciera, no entraría en el resumen, en la
 * vista previa ni en el banco. En el núcleo sigue al final de STAGES_ALL.
 * F3d (spec f3d-construir-detectar, AC14–AC16 y AC21; plan §4 y H1; tablero 90): las etapas 7 a 10 (LAB_STAGES) van
 * al final de la lista, aparte, cada una con su descripción y con el aviso de que piden trabajar en el laboratorio; se
 * ofrecen con f3dPublic (publicadas en T014). La imagen de la red de «Detective» la da views/net-svg (ctx.svg, plan P4), en el banco y
 * en la vista previa.
 * F3e (plan P2, T013): en su página propia, moodle.html (js/moodle-app), las familias de etapas (el enunciado y la
 * construcción) llegan al marcarlas: hooks.ready(etapas) dice si ya están y hooks.need(etapas) las pide (null si ya
 * están). La vista previa espera a la familia de su etapa y «Descargar», a las de todas las marcadas; al llegar, se
 * rehacen el resumen y la vista previa. El título va en la cabecera de la página.
 * F3e (plan P2 y P7; T016; tableros 100, 101, 102 y 105): las etapas en tres familias
 * plegables (0–6, 7–10 y 11–17; las 11 a 17 sin marcar al abrir y con su descripción), la vista previa con «Etapa» (la
 * etapa elegida entre las marcadas) y las «Respuestas que acepta Moodle», y las pestañas «Preguntas por etapas» ·
 * «Series encadenadas». En las series (core/series, en la base de moodle.html): todas las etapas, en gris las que no
 * pueden ir en una serie; un nivel y el número de series; la vista previa de una serie (la primera semilla desde 1) con
 * «Ir a la parte». La imagen de «Leer una simulación» la da views/chart-svg (ctx.chart), que llega con la familia
 * estocástica. Las vistas previas se guardan (algunas tardan: la otra ruta difícil, hasta 2 s) y no se rehacen al marcar
 * otra casilla. Desde T017, cpm.html#v=moodle lleva a moodle.html; el camino de antes (sin hooks.f3e, need ni ready)
 * se quitó en T021 (revisión de nivel 2, N-F4).
 */
(function (root) {
  'use strict';

  const isNode = typeof module !== 'undefined' && module.exports;
  const req = (path, name) => (isNode ? require(path) : root.PNL[name]);
  const M = req('./core/moodle.js', 'moodle');
  const IM = req('./i18n-moodle.js', 'i18nMoodle');
  const I = req('./i18n.js', 'i18n');
  // core/series va en la base de moodle.html (no en cpm.html): se pide al usarla.
  const S = () => req('./core/series.js', 'series');

  const CHUNK_MS = 40;
  const PREVIEW_CACHE = 40;
  const pt = (lang, k, p) => I.t(lang, `mq.page.${k}`, p);

  /** Las etapas de la F3d (7 a 10), en el orden del núcleo: las que siguen a la 0 en STAGES_ALL, hasta el detective. */
  const LAB_STAGES = M.STAGES_ALL.slice(M.STAGES_ALL.indexOf('stmt') + 1, M.STAGES_ALL.indexOf('detective') + 1);
  /** Las de la F3e (11 a 17), al final de STAGES_ALL. */
  const F3E_STAGES = M.STAGES_F3E;
  /** Las etapas que ofrece el formulario, en su orden: la 0 la primera, solo si está publicada (F3c, P6); las 7 a 10,
   *  solo si están publicadas (F3d, T014); las 11 a 17 al final (F3e, T016; desde T021, siempre: solo hay moodle.html). */
  const stagesOf = (pub, lab) => [...(pub ? ['stmt'] : []), ...M.STAGES, ...(lab ? LAB_STAGES : []), ...F3E_STAGES];
  /** Las familias de la lista (tablero 100): cálculo (0–6), construir y detectar (7–10), probabilidad y Montecarlo (11–17). */
  const FAMILY_GROUPS = [['calc', ['stmt', ...M.STAGES]], ['lab', LAB_STAGES], ['prob', F3E_STAGES]];
  const groupsOf = (shown) => FAMILY_GROUPS.map(([key, all]) => ({ key, stages: shown.filter((s) => all.includes(s)) })).filter((g) => g.stages.length);
  /** Marcadas al abrir: todas menos las 11 a 17 (su familia se carga al marcar una). */
  const DEFAULT_STAGES = M.STAGES_ALL.filter((s) => !F3E_STAGES.includes(s));
  /** Las de una serie al abrir la pestaña (tablero 101). */
  const SERIES_DEFAULT = ['stmt', 'early', 'floats', 'tclMoments', 'tclPath', 'tclProb'];
  const seriesOk = (s) => S().ADMITTED.includes(s);
  const seriesCodes = (stages) => S().order(stages).map((s) => S().CODE[s]).join('-');
  /** La categoría de las series, sin la raíz: Series/<códigos>/<nivel> (como la del núcleo). */
  function seriesCategory(lang, stages, level) {
    const tr = IM.tr(lang);
    return [tr('series.cat'), seriesCodes(stages), tr(`level.${level}`)].join('/');
  }
  /** El resumen de las series: { stages, level, count }. */
  function seriesSummaryText(lang, s) {
    if (!s.stages.length) return pt(lang, 'sr.nothing');
    const cat = seriesCategory(lang, s.stages, s.level);
    return s.count === 1 ? pt(lang, 'sr.summaryOne', { cat }) : pt(lang, 'sr.summary', { q: s.count, cat });
  }

  /** Cuántas preguntas y categorías da una selección (contando solo las etapas que se ofrecen, stages). */
  function summary(sel, stages) {
    const c = stages.filter((s) => sel.stages.has(s)).length * M.LEVELS.filter((l) => sel.levels.has(l)).length;
    return { categories: c, questions: c * sel.count };
  }
  /** El resumen, con el singular cuando hay una sola categoría o una sola pregunta. */
  function summaryText(lang, s) {
    if (!s.categories) return pt(lang, 'nothing');
    if (s.categories > 1) return pt(lang, 'summary', { q: s.questions, c: s.categories });
    return s.questions === 1 ? pt(lang, 'summaryOne') : pt(lang, 'summaryOneCat', { q: s.questions });
  }
  /** Nombre del archivo: banco-redes-AAAA-MM-DD-s<semilla>.xml (o network-bank-…). */
  const fileName = (lang, date, seed) => `${pt(lang, 'file')}-${date}-s${seed}.xml`;
  /** Las categorías que se quedan cortas, en el idioma del banco (una serie, con los códigos de sus etapas). */
  function missingText(lang, missing) {
    if (!missing.length) return '';
    const tr = IM.tr(lang);
    const name = (m) => (m.stage === 'series' ? `${tr('series.name')} ${seriesCodes(m.stages)}` : tr(`stage.${m.stage}`));
    const list = missing.map((m) => pt(lang, 'missingItem', { stage: name(m), level: tr(`level.${m.level}`), made: m.made, wanted: m.wanted })).join('; ');
    return pt(lang, 'missing', { list });
  }

  function create(container, hooks) {
    const { h, clear } = root.PNL.dom;
    const QV = root.PNL.questionView;
    const lang = () => hooks.lang();
    const nota = () => hooks.state().nota;
    const t = (k, p) => pt(lang(), k, p);
    const sel = { mode: 'stages', stages: new Set(DEFAULT_STAGES), sf: false, levels: new Set(['medium']), count: M.DEFAULT_COUNT, preview: null,
      series: { stages: new Set(SERIES_DEFAULT), level: 'medium', count: M.DEFAULT_COUNT } };
    const openFam = {};
    const shown = () => stagesOf(api.stmtPublic, api.f3dPublic);
    // La imagen de la red (F3d, plan P4): views/net-svg llega con el grupo mq o con la familia lab.
    const svg = (model) => root.PNL.netSvg.render(model);
    // F3e (T016): los gráficos de «Leer una simulación» (views/chart-svg), con la familia estocástica.
    const chart = (model) => (model.kind === 'dist' ? root.PNL.chartSvg.dist(model) : root.PNL.chartSvg.indices(model));
    const chosen = () => shown().filter((s) => sel.stages.has(s));
    const isSeries = () => sel.mode === 'series';
    const seriesChosen = () => S().ADMITTED.filter((s) => sel.series.stages.has(s));
    /** Las etapas de lo que se va a generar: las marcadas o las de la serie. */
    const wanted = () => (isSeries() ? seriesChosen() : chosen());
    let run = null;          // { runner, seed, lang, nota, made, total, timer }
    let status = null;       // último estado: { key: 'done' | 'doneOne' | 'cancelled', file, q, seed, missing }
    let last = null;         // { seed, file, questions, missing } del último banco descargado
    let drawn = null;        // idioma y notación de lo dibujado (para cancelar si cambian)
    let focusAfter = null;
    // F3e (T013): las familias de etapas de moodle.html.
    const ready = (stages) => hooks.ready(stages);
    /** Pide las familias de las etapas marcadas y, si faltaba alguna, rehace el resumen y la vista previa al llegar. */
    function fetchFamilies() {
      const p = hooks.need(wanted());
      if (p) p.then(() => refresh(), () => {});
    }
    let waitingStart = false;

    function newSeed() {
      const c = root.crypto;
      if (c && c.getRandomValues) return c.getRandomValues(new Uint32Array(1))[0];
      return Date.now() >>> 0;
    }

    function start() {
      const stages = wanted();
      // F3e (T013): «Descargar» espera a las familias de las etapas marcadas (un fallo lo avisa la página).
      if (!ready(stages)) {
        if (waitingStart) return;
        waitingStart = true;
        Promise.resolve(hooks.need(stages)).then(() => { waitingStart = false; if (!run) start(); }, () => { waitingStart = false; });
        return;
      }
      const L = lang(); const N = nota();
      const seed = newSeed();
      const opts = { lang: L, nota: N, sf: sel.sf, labels: IM.labels(N), seed };
      const series = isSeries();
      const runner = series
        ? S().runner(Object.assign(opts, { stages, level: sel.series.level, count: sel.series.count }), IM.tr(L))
        : M.runner(Object.assign(opts, { stages, levels: [...sel.levels], count: sel.count, svg, chart }), IM.tr(L));
      run = { runner, seed, lang: L, nota: N, made: 0, total: series ? sel.series.count : summary(sel, shown()).questions, timer: null };
      status = null;
      focusAfter = 'cancel';
      draw();
      run.timer = setTimeout(tick, 0);
    }

    function tick() {
      if (!run) return;
      const t0 = Date.now();
      let s;
      do { s = run.runner.step(1); } while (!s.done && Date.now() - t0 < CHUNK_MS);
      run.made = s.made;
      if (s.done) { finish(); return; }
      updateProgress();
      run.timer = setTimeout(tick, 0);
    }

    function finish() {
      const r = run; run = null;
      const bank = r.runner.result();
      const xml = M.toXml(bank, IM.tr(r.lang));
      const file = fileName(r.lang, new Date().toISOString().slice(0, 10), r.seed);
      download(file, xml);
      last = { seed: r.seed, file, questions: bank.questions.length, missing: bank.missing, bytes: xml.length };
      status = { key: bank.questions.length === 1 ? 'doneOne' : 'done', file, q: bank.questions.length, seed: r.seed, missing: bank.missing };
      focusAfter = 'download';
      draw();
      hooks.announce(statusText());
    }

    function cancel() {
      if (!run) return;
      stop();
      focusAfter = 'download';
      draw();
      hooks.announce(statusText());
    }

    /** Detiene la generación sin descargar nada. */
    function stop() {
      clearTimeout(run.timer);
      run = null;
      status = { key: 'cancelled' };
    }

    /** El estado en el idioma de la página (el nombre del archivo es el del banco descargado). */
    function statusText() {
      if (!status) return '';
      if (status.key === 'cancelled') return t('cancelled');
      return [t(status.key, { file: status.file, q: status.q, seed: status.seed }), missingText(lang(), status.missing)].filter(Boolean).join(' ');
    }

    function download(name, content) {
      const blob = new Blob([content], { type: 'application/xml' });
      const url = URL.createObjectURL(blob);
      const a = h('a', { href: url, download: name, hidden: true });
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    let progressEl = null; let progressText = null;
    function updateProgress() {
      if (!progressEl || !run) return;
      progressEl.value = run.made;
      progressText.textContent = t('progress', { made: run.made, total: run.total });
    }

    let summaryEl = null; let downloadEl = null; let previewEl = null; let pvSelectEl = null; let gotoEl = null;
    const currentSummary = () => (isSeries()
      ? { text: seriesSummaryText(lang(), { stages: seriesChosen(), level: sel.series.level, count: sel.series.count }), any: seriesChosen().length > 0 }
      : (() => { const s = summary(sel, shown()); return { text: summaryText(lang(), s), any: s.categories > 0 }; })());
    /** Tras marcar una casilla o cambiar los ejemplares: el resumen, el botón y la vista previa, sin redibujar. */
    function refresh() {
      const s = currentSummary();
      if (summaryEl) summaryEl.textContent = s.text;
      if (downloadEl) downloadEl.disabled = !s.any;
      if (pvSelectEl) fillPvSelect();
      if (previewEl) drawPreview(previewEl);
      fetchFamilies();
    }

    const check = (label, on, onChange, o) => h('label', { class: 'mq-check' }, [
      h('input', { type: 'checkbox', checked: on, disabled: !!run || !!(o && o.off), onchange: (e) => onChange(e.target.checked) }),
      h('span', {}, o && o.hint ? [label, h('span', { class: 'mq-hint' }, [o.hint])] : [label]),
    ]);
    const fieldset = (legend, kids, cls) => h('fieldset', { class: `mq-group${cls ? ` ${cls}` : ''}` }, [h('legend', {}, [legend]), ...kids]);

    function actions() {
      if (run) {
        progressEl = h('progress', { id: 'mqProgress', max: run.total, value: run.made });
        progressText = h('p', { class: 'mq-status', role: 'status' }, [t('progress', { made: run.made, total: run.total })]);
        return h('div', { class: 'mq-actions' }, [
          h('label', { for: 'mqProgress', class: 'mq-hint' }, [t('progressLabel')]), progressEl,
          h('div', { class: 'mq-row' }, [h('button', { type: 'button', id: 'mqCancel', class: 'ghost', onclick: cancel }, [t('cancel')]), progressText]),
        ]);
      }
      progressEl = null;
      const s = currentSummary();
      summaryEl = h('p', { class: 'mq-summary' }, [s.text]);
      downloadEl = h('button', { type: 'button', id: 'mqDownload', class: 'ghost primary', disabled: !s.any, onclick: start }, [t('download')]);
      return h('div', { class: 'mq-actions' }, [
        h('div', { class: 'mq-row' }, [summaryEl, downloadEl]),
        h('p', { class: 'mq-status', role: 'status' }, [statusText()]),
      ]);
    }

    // ---------- Vista previa (semilla fija 1, plan §4; guardada: algunas tardan) ----------
    const cache = new Map();
    function cached(key, make) {
      if (!cache.has(key)) {
        if (cache.size >= PREVIEW_CACHE) cache.delete(cache.keys().next().value);
        cache.set(key, make());
      }
      return cache.get(key);
    }
    /** La etapa de la vista previa: la elegida en «Etapa» si sigue marcada; si no, la primera marcada. */
    const previewStage = () => { const c = chosen(); return c.includes(sel.preview) ? sel.preview : c[0]; };

    function previewQuestion() {
      const L = lang(); const N = nota(); const tr = IM.tr(L);
      const ctx = { lang: L, nota: N, sf: sel.sf, labels: IM.labels(N), svg, chart };
      if (isSeries()) {
        const st = seriesChosen(); const lv = sel.series.level;
        if (!st.length || !ready(st)) return null;
        // La primera semilla desde 1 que da una serie (las del TCL descartan empates; la otra ruta sale en pocas tablas).
        return cached(['series', st.join(','), lv, L, N, sel.sf].join('|'), () => {
          for (let sd = 1; sd < 200; sd++) { const b = S().exercise(st, lv, sd); const q = b && S().question(st, b, ctx, tr); if (q) return q; }
          return null;
        });
      }
      const st = previewStage();
      const lv = M.LEVELS.find((l) => sel.levels.has(l));
      if (!st || !lv || !ready([st])) return null;
      // Semilla fija 1 (plan §4); en la 4b (o en la 0, si la tabla no admite enunciado) se prueba la siguiente.
      return cached([st, lv, L, N, sel.sf].join('|'), () => {
        for (let sd = 1; sd < 50; sd++) { const q = M.question(st, M.exercise(lv, sd), ctx, tr); if (q) return q; }
        return null;
      });
    }

    function drawPreview(el) {
      const q = previewQuestion();
      if (q) {
        QV.render(el, q, IM.tr(lang()), { holeLabel: t('hole'), feedbackLabel: t('previewFeedback'), lang: lang(), partId: 'mqPart',
          accepted: { label: t('accepted'), option: t('acceptedOption'), open: !isSeries() } });
      } else clear(el);
      if (gotoEl) drawGoto(q);
    }

    /** «Etapa» (F3e, tablero 100): las etapas marcadas; la de la vista previa, elegida. */
    function fillPvSelect() {
      const c = chosen();
      clear(pvSelectEl);
      for (const s of c) pvSelectEl.appendChild(h('option', { value: s, selected: s === previewStage() }, [IM.tr(lang())(`stage.${s}`)]));
      pvSelectEl.disabled = !c.length;
    }

    /** «Ir a la parte» (tablero 101): un botón por parte de la serie; lleva el foco a su título. */
    function drawGoto(q) {
      clear(gotoEl);
      if (!q || !q.stages) return;
      // El nombre del grupo, también a la vista (tablero 101); para el lector de pantalla basta el del grupo.
      gotoEl.appendChild(h('span', { class: 'mq-hint', 'aria-hidden': 'true' }, [t('sr.goTo')]));
      q.stages.forEach((s, i) => gotoEl.appendChild(h('button', { type: 'button', class: 'ghost', onclick: () => {
        const head = previewEl.querySelector(`#mqPart-${i}`);
        if (!head) return;
        head.scrollIntoView({ block: 'start' });
        head.focus({ preventScroll: true });
      } }, [S().CODE[s]])));
    }

    // ---------- Pestañas (F3e, tablero 101): «Preguntas por etapas» · «Series encadenadas» ----------
    const MODES = ['stages', 'series'];
    const tabId = (m) => (m === 'stages' ? 'mqTabStages' : 'mqTabSeries');
    function setMode(m, focus) {
      if (run || sel.mode === m) return;
      sel.mode = m;
      focusAfter = focus ? tabId(m) : null;
      draw();
    }
    function tabs() {
      const key = (e) => {
        const i = MODES.indexOf(sel.mode);
        const to = { ArrowRight: (i + 1) % 2, ArrowLeft: (i + 1) % 2, Home: 0, End: 1 }[e.key];
        if (to == null) return;
        e.preventDefault();
        setMode(MODES[to], true);
      };
      return h('div', { class: 'mq-tabs', role: 'tablist', 'aria-label': t('modeLabel') }, MODES.map((m) => h('button', {
        type: 'button', role: 'tab', id: tabId(m), 'aria-selected': String(sel.mode === m), 'aria-controls': 'mqPanel',
        tabindex: sel.mode === m ? '0' : '-1', disabled: !!run, onclick: () => setMode(m, true), onkeydown: key,
      }, [t(m === 'stages' ? 'modeStages' : 'modeSeries')])));
    }

    const stageCheck = (s, o) => check(IM.tr(lang())(`stage.${s}`), sel.stages.has(s), (on) => { if (on) sel.stages.add(s); else sel.stages.delete(s); refresh(); }, o);
    const sfCheck = () => check(t('sf'), sel.sf, (on) => { sel.sf = on; refresh(); });

    /** Las etapas, en tres familias plegables (tablero 100); las 7 a 10, con su descripción y el aviso del laboratorio. */
    function stagesFieldset() {
      const hint = (s) => ({ hint: t(`stageHint.${s}`) });
      const fams = groupsOf(shown()).map((g) => {
        const kids = g.key === 'calc' ? [h('div', { class: 'mq-stages' }, g.stages.map((s) => stageCheck(s)))]
          : g.key === 'lab' ? [h('div', { class: 'mq-stages mq-lab' }, g.stages.map((s) => stageCheck(s, hint(s)))), h('p', { class: 'mq-labnote' }, [t('labNote')])]
            : [h('div', { class: 'mq-stages mq-prob' }, g.stages.map((s) => stageCheck(s, hint(s))))];
        return h('details', { class: 'mq-fam', open: openFam[g.key] !== false, ontoggle: (e) => { openFam[g.key] = e.target.open; } }, [
          h('summary', {}, [t(`fam.${g.key}`)]), h('div', { class: 'mq-fam-body' }, kids)]);
      });
      return fieldset(t('stagesTitle'), [h('p', { class: 'mq-hint' }, [t('stagesHint')]), ...fams, sfCheck()]);
    }

    function countInput(id, get, put) {
      return h('input', { type: 'number', id, min: 1, max: M.MAX_COUNT, step: 1, value: String(get()), disabled: !!run,
        onchange: (e) => {
          const v = Math.round(Number(e.target.value));
          put(Number.isFinite(v) && e.target.value !== '' ? Math.max(1, Math.min(M.MAX_COUNT, v)) : get());
          e.target.value = String(get());
          refresh();
        } });
    }

    function stagesForm() {
      const tr = IM.tr(lang());
      const levels = fieldset(t('levelsTitle'), M.LEVELS.map((l) => check(tr(`level.${l}`), sel.levels.has(l), (on) => { if (on) sel.levels.add(l); else sel.levels.delete(l); refresh(); }, { hint: t(`levelHint.${l}`) })));
      const count = countInput('mqCount', () => sel.count, (v) => { sel.count = v; });
      const size = fieldset(t('sizeTitle'), [h('label', { for: 'mqCount', class: 'mq-count' }, [t('count')]), count, h('span', { class: 'mq-hint' }, [t('countHint')])], 'mq-size');
      return [
        h('p', { class: 'mq-lead' }, [t('lead')]),
        h('div', { class: 'mq-box' }, [actions()]),
        stagesFieldset(),
        h('div', { class: 'mq-two' }, [levels, size]),
        how(['how1', 'how2', 'how3', 'how4']),
      ];
    }

    /** La pestaña de las series (tablero 101). */
    function seriesForm() {
      const tr = IM.tr(lang());
      const ser = sel.series;
      const boxes = shown().map((s) => check(tr(`stage.${s}`), ser.stages.has(s), (on) => { if (on) ser.stages.add(s); else ser.stages.delete(s); refresh(); }, { off: !seriesOk(s) }));
      const stages = fieldset(t('sr.stagesTitle'), [
        h('div', { class: 'mq-stages mq-series' }, boxes),
        h('p', { class: 'mq-hint mq-series-off' }, [t('sr.off')]),
        h('p', { class: 'mq-labnote mq-series-means' }, [t('sr.means')]),
        sfCheck(),
      ]);
      const level = fieldset(t('sr.levelTitle'), M.LEVELS.map((l) => h('label', { class: 'mq-check' }, [
        h('input', { type: 'radio', name: 'mqSeriesLevel', value: l, checked: ser.level === l, disabled: !!run, onchange: () => { ser.level = l; refresh(); } }),
        h('span', {}, [tr(`level.${l}`), h('span', { class: 'mq-hint' }, [t(`levelHint.${l}`)])]),
      ])));
      const count = countInput('mqSeriesCount', () => ser.count, (v) => { ser.count = v; });
      const size = fieldset(t('sizeTitle'), [h('label', { for: 'mqSeriesCount', class: 'mq-count' }, [t('sr.count')]), count, h('span', { class: 'mq-hint' }, [t('countHint')])], 'mq-size');
      return [
        h('p', { class: 'mq-lead' }, [t('sr.lead')]),
        h('div', { class: 'mq-box' }, [actions()]),
        stages,
        h('div', { class: 'mq-two' }, [level, size]),
        how(['sr.how', 'how3', 'how4']),
      ];
    }

    const how = (keys) => h('details', { class: 'mq-how' }, [
      h('summary', {}, [t('howTitle')]),
      h('ol', {}, keys.map((k) => h('li', {}, [t(k)]))),
      h('p', { class: 'mq-hint' }, [t('seedNote')]),
    ]);

    function draw() {
      drawn = { lang: lang(), nota: nota() };
      summaryEl = null; downloadEl = null; pvSelectEl = null; gotoEl = null;
      container.setAttribute('aria-label', t('title'));
      const form = isSeries() ? seriesForm() : stagesForm();
      const preview = h('section', { class: 'mq-preview card', 'aria-label': t('previewTitle') });
      previewEl = preview;
      // F3e (tableros 100 y 101): «Etapa» junto al título de la vista previa; en las series, «Ir a la parte».
      let tools = null;
      if (isSeries()) tools = gotoEl = h('div', { class: 'mq-goto', role: 'group', 'aria-label': t('sr.goTo') });
      else {
        pvSelectEl = h('select', { id: 'mqPvStage', onchange: (e) => { sel.preview = e.target.value; drawPreview(previewEl); fetchFamilies(); } });
        fillPvSelect();
        tools = h('div', { class: 'mq-pvstage' }, [h('label', { for: 'mqPvStage' }, [t('previewStage')]), pvSelectEl]);
      }
      drawPreview(preview);
      fetchFamilies();
      clear(container);
      const formCol = h('div', { class: 'mq-form' }, [tabs(), h('div', { id: 'mqPanel', role: 'tabpanel', class: 'mq-panel', 'aria-labelledby': tabId(sel.mode) }, form)]);
      container.appendChild(h('div', { class: 'mq-layout' }, [
        formCol,
        h('div', { class: 'mq-side' }, [h('div', { class: 'mq-side-head' }, [h('h2', {}, [t('previewTitle')]), tools]), h('p', { class: 'mq-hint' }, [t('previewHint')]), preview]),
      ]));
      if (focusAfter) {
        const id = { cancel: 'mqCancel', download: 'mqDownload' }[focusAfter] || focusAfter;
        const el = container.querySelector(`#${id}`);
        if (el) el.focus();
        focusAfter = null;
      }
    }

    function render() {
      // Un cambio de idioma o de notación mientras se genera cancela la generación (el banco sería de otro idioma).
      if (run && drawn && (drawn.lang !== lang() || drawn.nota !== nota())) stop();
      draw();
    }

    const debug = () => ({ sel: { mode: sel.mode, stages: chosen(), sf: sel.sf, levels: [...sel.levels], count: sel.count,
      series: { stages: seriesChosen(), level: sel.series.level, count: sel.series.count } },
    running: !!run, made: run ? run.made : null, total: run ? run.total : null, status: statusText(), last, preview: previewQuestion() });
    return { render, debug };
  }

  const api = { stmtPublic: true, f3dPublic: true, LAB_STAGES, F3E_STAGES, FAMILY_GROUPS, DEFAULT_STAGES, SERIES_DEFAULT, stagesOf, groupsOf,
    seriesOk, seriesCategory, seriesSummaryText, summary, summaryText, fileName, missingText, create, CHUNK_MS };
  root.PNL = root.PNL || {};
  root.PNL.moodlePage = api;
  if (isNode) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
