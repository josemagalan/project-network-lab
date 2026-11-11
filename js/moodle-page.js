/*
 * moodle-page — vista del exportador de Moodle, cpm.html#v=moodle (spec f3b-moodle; plan §4, P2, P7; tableros 51–56).
 *
 * Formulario (etapas, holgura de seguridad, niveles y ejemplares por categoría), resumen y descarga; la generación va
 * a trozos de unos 40 ms (core/moodle.runner.step) con una barra de progreso y «Cancelar», y el banco se descarga con
 * un Blob. La semilla del banco la elige la interfaz (crypto.getRandomValues), nunca el núcleo. La vista previa es
 * una pregunta de la primera etapa y el primer nivel marcados, con semilla fija 1 (views/question-view).
 * La selección vive en la página (no en la URL) y se conserva al cambiar de idioma o de notación; un cambio de
 * idioma o de notación mientras se genera cancela la generación.
 * La parte sin DOM (summary, fileName, missingText) se prueba en Node; PNL.moodlePage.state() da la selección, el
 * progreso y el último banco para las pruebas de navegador.
 */
(function (root) {
  'use strict';

  const isNode = typeof module !== 'undefined' && module.exports;
  const req = (path, name) => (isNode ? require(path) : root.PNL[name]);
  const M = req('./core/moodle.js', 'moodle');
  const IM = req('./i18n-moodle.js', 'i18nMoodle');
  const I = req('./i18n.js', 'i18n');

  const CHUNK_MS = 40;
  const pt = (lang, k, p) => I.t(lang, `mq.page.${k}`, p);

  /** Cuántas preguntas y categorías da una selección. */
  function summary(sel) {
    const c = M.STAGES.filter((s) => sel.stages.has(s)).length * M.LEVELS.filter((l) => sel.levels.has(l)).length;
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
  /** Las categorías que se quedan cortas, en el idioma del banco. */
  function missingText(lang, missing) {
    if (!missing.length) return '';
    const tr = IM.tr(lang);
    const list = missing.map((m) => pt(lang, 'missingItem', { stage: tr(`stage.${m.stage}`), level: tr(`level.${m.level}`), made: m.made, wanted: m.wanted })).join('; ');
    return pt(lang, 'missing', { list });
  }

  function create(container, hooks) {
    const { h, clear } = root.PNL.dom;
    const QV = root.PNL.questionView;
    const lang = () => hooks.lang();
    const nota = () => hooks.state().nota;
    const t = (k, p) => pt(lang(), k, p);
    const sel = { stages: new Set(M.STAGES), sf: false, levels: new Set(['medium']), count: M.DEFAULT_COUNT };
    let run = null;          // { runner, seed, lang, nota, made, total, timer }
    let status = '';         // último mensaje del estado (descarga, cancelación)
    let last = null;         // { seed, file, questions, missing } del último banco descargado
    let drawn = null;        // idioma y notación de lo dibujado (para cancelar si cambian)
    let focusAfter = null;

    function newSeed() {
      const c = root.crypto;
      if (c && c.getRandomValues) return c.getRandomValues(new Uint32Array(1))[0];
      return Date.now() >>> 0;
    }

    function start() {
      const L = lang(); const N = nota();
      const seed = newSeed();
      const runner = M.runner({ lang: L, nota: N, sf: sel.sf, labels: IM.labels(N), stages: [...sel.stages], levels: [...sel.levels], count: sel.count, seed }, IM.tr(L));
      run = { runner, seed, lang: L, nota: N, made: 0, total: summary(sel).questions, timer: null };
      status = '';
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
      status = [bank.questions.length === 1 ? pt(r.lang, 'doneOne', { file, seed: r.seed }) : pt(r.lang, 'done', { file, q: bank.questions.length, seed: r.seed }), missingText(r.lang, bank.missing)].filter(Boolean).join(' ');
      focusAfter = 'download';
      draw();
      hooks.announce(status);
    }

    function cancel() {
      if (!run) return;
      clearTimeout(run.timer);
      const L = run.lang;
      run = null;
      status = pt(L, 'cancelled');
      focusAfter = 'download';
      draw();
      hooks.announce(status);
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

    const check = (label, on, onChange, o) => h('label', { class: 'mq-check' }, [
      h('input', { type: 'checkbox', checked: on, disabled: !!run, onchange: (e) => onChange(e.target.checked) }),
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
      const s = summary(sel);
      return h('div', { class: 'mq-actions' }, [
        h('div', { class: 'mq-row' }, [
          h('p', { class: 'mq-summary' }, [summaryText(lang(), s)]),
          h('button', { type: 'button', id: 'mqDownload', class: 'ghost primary', disabled: !s.categories, onclick: start }, [t('download')]),
        ]),
        h('p', { class: 'mq-status', role: 'status' }, [status]),
      ]);
    }

    function previewQuestion() {
      const st = M.STAGES.find((s) => sel.stages.has(s));
      const lv = M.LEVELS.find((l) => sel.levels.has(l));
      if (!st || !lv) return null;
      const ctx = { lang: lang(), nota: nota(), sf: sel.sf, labels: IM.labels(nota()) };
      // Semilla fija 1 (plan §4); en la 4b se prueba la siguiente si la tabla no tiene dos distractores.
      for (let sd = 1; sd < 50; sd++) { const q = M.question(st, M.exercise(lv, sd), ctx, IM.tr(lang())); if (q) return q; }
      return null;
    }

    function draw() {
      const tr = IM.tr(lang());
      drawn = { lang: lang(), nota: nota() };
      container.setAttribute('aria-label', t('title'));
      const stages = fieldset(t('stagesTitle'), [
        h('p', { class: 'mq-hint' }, [t('stagesHint')]),
        h('div', { class: 'mq-stages' }, M.STAGES.map((s) => check(tr(`stage.${s}`), sel.stages.has(s), (on) => { if (on) sel.stages.add(s); else sel.stages.delete(s); draw(); }))),
        check(t('sf'), sel.sf, (on) => { sel.sf = on; draw(); }),
      ]);
      const levels = fieldset(t('levelsTitle'), M.LEVELS.map((l) => check(tr(`level.${l}`), sel.levels.has(l), (on) => { if (on) sel.levels.add(l); else sel.levels.delete(l); draw(); }, { hint: t(`levelHint.${l}`) })));
      const count = h('input', { type: 'number', id: 'mqCount', min: 1, max: M.MAX_COUNT, step: 1, value: String(sel.count), disabled: !!run,
        onchange: (e) => { const v = Math.round(Number(e.target.value)); sel.count = Number.isFinite(v) && e.target.value !== '' ? Math.max(1, Math.min(M.MAX_COUNT, v)) : sel.count; draw(); } });
      const size = fieldset(t('sizeTitle'), [h('label', { for: 'mqCount', class: 'mq-count' }, [t('count')]), count, h('span', { class: 'mq-hint' }, [t('countHint')])], 'mq-size');
      const preview = h('section', { class: 'mq-preview card', 'aria-label': t('previewTitle') });
      const q = previewQuestion();
      if (q) QV.render(preview, q, tr, { holeLabel: t('hole'), feedbackLabel: t('previewFeedback') });
      clear(container);
      container.appendChild(h('div', { class: 'mq-layout' }, [
        h('div', { class: 'mq-form' }, [
          h('h1', {}, [t('title')]),
          h('p', { class: 'mq-lead' }, [t('lead')]),
          h('div', { class: 'mq-box' }, [actions()]),
          stages,
          h('div', { class: 'mq-two' }, [levels, size]),
          h('details', { class: 'mq-how' }, [
            h('summary', {}, [t('howTitle')]),
            h('ol', {}, ['how1', 'how2', 'how3', 'how4'].map((k) => h('li', {}, [t(k)]))),
            h('p', { class: 'mq-hint' }, [t('seedNote')]),
          ]),
        ]),
        h('div', { class: 'mq-side' }, [h('h2', {}, [t('previewTitle')]), h('p', { class: 'mq-hint' }, [t('previewHint')]), preview]),
      ]));
      if (focusAfter) { const el = container.querySelector(focusAfter === 'cancel' ? '#mqCancel' : '#mqDownload'); if (el) el.focus(); focusAfter = null; }
    }

    function render() {
      // Un cambio de idioma o de notación mientras se genera cancela la generación (el banco sería de otro idioma).
      if (run && drawn && (drawn.lang !== lang() || drawn.nota !== nota())) { clearTimeout(run.timer); run = null; status = t('cancelled'); }
      draw();
    }

    const debug = () => ({ sel: { stages: [...sel.stages], sf: sel.sf, levels: [...sel.levels], count: sel.count },
      running: !!run, made: run ? run.made : null, total: run ? run.total : null, status, last, preview: previewQuestion() });
    return { render, debug };
  }

  const api = { summary, summaryText, fileName, missingText, create, CHUNK_MS };
  root.PNL = root.PNL || {};
  root.PNL.moodlePage = api;
  if (isNode) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
