/*
 * exam-app — la página del examen imprimible, examen.html (spec f3f-examen-imprimible, AC9 y AC15–AC17; plan P6 y P7,
 * §3; T010; tableros 107–109). Como moodle.html: cabecera con el título, Idioma, Notación y «Volver al laboratorio»;
 * carga su base (núcleo de la F3b, series, core/exam, core/qr, exam-view y sus textos) y, al marcar una parte, sus
 * familias (family-load). A la izquierda, nivel, semilla y modelos; la tabla «Partes, apartados y puntos» por grupos
 * (cada parte con su casilla, sus apartados y sus puntos; el total o el aviso y «Volver a la propuesta»); el aviso del
 * detective aparte y la red del detective sin construcción; plegados, la cabecera, los extras y el papel. A la derecha,
 * las pestañas del documento y los botones del modelo, «Copiar enlace» y la vista previa (sus documentos, en T011).
 * Estado en el «#» (P7): las claves de §3, con lista blanca; un valor que no vale vuelve al defecto y se avisa, como
 * en cpm.html. La cabecera del enunciado va siempre como texto (textContent y value), 600 caracteres como mucho.
 * La parte sin DOM (KEYS, DEFAULTS, decode, load, encode, optsOf, familiesOf, backHref, GROUPS) se prueba en Node;
 * PNL.examApp.state() da el estado a las pruebas de navegador.
 */
(function (root) {
  'use strict';

  const isNode = typeof module !== 'undefined' && module.exports;
  const E = isNode ? require('./core/exam.js') : root.PNL.exam;
  const FL = isNode ? require('./family-load.js') : root.PNL.familyLoad;

  // ---------- estado del enlace (§3) ----------
  const KEYS = ['lang', 'nota', 'ep', 'lv', 'sd', 'em', 'eq', 'pt', 'ee', 'ed', 'ea', 'eh', 'pp', 'dv', 'mi'];
  const HEAD_FIELDS = ['subject', 'call', 'date', 'duration', 'instructions'];
  const HEADER_MAX = 600;
  const EXTRAS = 'ingq';
  const DEFAULTS = {
    lang: 'es', nota: 'en', ep: ['times', 'floats'], lv: 'medium', sd: 1, em: 1, eq: [], pt: {}, ee: '', ed: 'aon', ea: EXTRAS,
    eh: { subject: '', call: '', date: '', duration: '', instructions: '' }, pp: 'a4', dv: 's', mi: 0,
  };
  /** Los grupos de la tabla de partes (tablero 107). */
  const GROUPS = [
    { id: 'calc', parts: ['stmt', 'times', 'floats', 'minDummy', 'succ'] },
    { id: 'build', parts: ['roy', 'pert'] },
    { id: 'det', parts: ['det'] },
    { id: 'prob', parts: ['tcl', 'read', 'disc', 'rep'] },
  ];
  const clone = (v) => JSON.parse(JSON.stringify(v));
  const headerLength = (eh) => HEAD_FIELDS.reduce((n, k) => n + String((eh && eh[k]) || '').length, 0);
  const sameList = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);
  const dec = (v) => { try { return decodeURIComponent(v); } catch { return null; } };
  const allItems = () => E.PARTS.flatMap((p) => (E.ITEMS[p] || []).map((x) => `${p}.${x}`));
  const ptsOk = (x) => /^\d{1,2}(\.\d{1,2})?$/.test(x) && Number(x) <= 10 && Number.isInteger(Number(x) * 4);
  const intIn = (x, lo, hi) => (/^\d+$/.test(x) && Number(x) >= lo && Number(x) <= hi ? Number(x) : undefined);
  /** Cada clave: su valor a partir del texto del «#», o undefined si no vale. */
  const PARSE = {
    lang: (v) => (v === 'es' || v === 'en' ? v : undefined),
    nota: (v) => (v === 'es' || v === 'en' ? v : undefined),
    ep: (v) => {
      const xs = v ? v.split('-') : [];
      return xs.every((p) => E.PARTS.includes(p)) ? E.PARTS.filter((p) => xs.includes(p)) : undefined;
    },
    lv: (v) => (E.LEVELS.includes(v) ? v : undefined),
    sd: (v) => intIn(v, 1, E.SEED_MAX),
    em: (v) => intIn(v, 1, E.MAX_MODELS),
    eq: (v) => {
      const xs = v ? v.split('-') : [];
      const ok = allItems();
      return xs.every((x) => ok.includes(x)) ? ok.filter((x) => xs.includes(x)) : undefined;
    },
    pt: (v) => {
      const out = {};
      for (const kv of v ? v.split('-') : []) {
        const [p, x] = kv.split(':');
        if (!E.PARTS.includes(p) || x == null || !ptsOk(x)) return undefined;
        out[p] = Number(x);
      }
      return Object.fromEntries(E.PARTS.filter((p) => p in out).map((p) => [p, out[p]]));
    },
    ee: (v) => (v === '' || E.EXAMPLES.includes(v) ? v : undefined),
    ed: (v) => (v === 'aon' || v === 'aoa' ? v : undefined),
    ea: (v) => ([...v].every((c) => EXTRAS.includes(c)) ? [...EXTRAS].filter((c) => v.includes(c)).join('') : undefined),
    eh: (v) => {
      const xs = v.split('|');
      if (xs.length !== HEAD_FIELDS.length) return undefined;
      const vals = xs.map(dec);
      if (vals.some((x) => x == null)) return undefined;
      const eh = Object.fromEntries(HEAD_FIELDS.map((k, i) => [k, vals[i]]));
      return headerLength(eh) <= HEADER_MAX ? eh : undefined;
    },
    pp: (v) => (v === 'a4' || v === 'letter' ? v : undefined),
    dv: (v) => (['s', 'o', 'r'].includes(v) ? v : undefined),
    mi: (v) => intIn(v, 0, E.MAX_MODELS - 1),
  };

  /** El estado del «#» (sin idioma si no lo trae) y si había algo que no valía. */
  function decode(hash) {
    const s = clone(DEFAULTS); s.lang = null;
    let warning;
    for (const pair of String(hash || '').replace(/^#/, '').split('&')) {
      if (!pair) continue;
      const i = pair.indexOf('=');
      const k = i < 0 ? pair : pair.slice(0, i);
      const raw = i < 0 ? null : pair.slice(i + 1);
      if (!KEYS.includes(k) || raw == null) { warning = true; continue; }
      const v = k === 'eh' ? raw : dec(raw);
      const r = v == null ? undefined : PARSE[k](v);
      if (r === undefined) { warning = true; s[k] = k === 'lang' ? null : clone(DEFAULTS[k]); continue; }
      s[k] = r;
    }
    if (s.mi >= s.em) { if (s.mi) warning = true; s.mi = 0; }
    return { state: s, warning };
  }

  /** El estado de un enlace: el idioma del «#», si no el de ?lang= y si no el del navegador (como moodle.html). */
  function load(hash, search, navLang) {
    const { state, warning } = decode(hash);
    if (!state.lang) {
      const q = new URLSearchParams(search || '').get('lang');
      state.lang = q === 'en' || q === 'es' ? q : (String(navLang || '').toLowerCase().startsWith('en') ? 'en' : 'es');
    }
    return { state, warning };
  }

  /** El «#» canónico: idioma y notación siempre; lo demás, solo si no es el valor por defecto, en el orden de §3. */
  function encode(s) {
    const out = [`lang=${s.lang}`, `nota=${s.nota}`];
    if (!sameList(s.ep, DEFAULTS.ep)) out.push(`ep=${s.ep.join('-')}`);
    if (s.lv !== DEFAULTS.lv) out.push(`lv=${s.lv}`);
    if (s.sd !== DEFAULTS.sd) out.push(`sd=${s.sd}`);
    if (s.em !== DEFAULTS.em) out.push(`em=${s.em}`);
    if (s.eq.length) out.push(`eq=${s.eq.join('-')}`);
    const pt = E.PARTS.filter((p) => p in s.pt);
    if (pt.length) out.push(`pt=${pt.map((p) => `${p}:${s.pt[p]}`).join('-')}`);
    if (s.ee) out.push(`ee=${s.ee}`);
    if (s.ed !== DEFAULTS.ed) out.push(`ed=${s.ed}`);
    if (s.ea !== DEFAULTS.ea) out.push(`ea=${s.ea}`);
    if (headerLength(s.eh)) out.push(`eh=${HEAD_FIELDS.map((k) => encodeURIComponent(s.eh[k] || '')).join('|')}`);
    if (s.pp !== DEFAULTS.pp) out.push(`pp=${s.pp}`);
    if (s.dv !== DEFAULTS.dv) out.push(`dv=${s.dv}`);
    if (s.mi !== DEFAULTS.mi) out.push(`mi=${s.mi}`);
    return `#${out.join('&')}`;
  }

  /** Los apartados que van marcados por defecto (los de core/exam: todos menos la otra ruta del TCL). */
  let defaultItems = null;
  const itemsOn = () => (defaultItems = defaultItems || E.check({ parts: E.PARTS, level: 'medium', models: 1 }).items);

  /** Las opciones de core/exam: eq cambia cada apartado respecto a su defecto; los puntos, solo de las partes marcadas. */
  function optsOf(s) {
    const items = {};
    for (const p of s.ep) {
      if (!E.ITEMS[p]) continue;
      const toggled = s.eq.filter((x) => x.startsWith(`${p}.`)).map((x) => x.slice(p.length + 1));
      if (!toggled.length) continue;
      items[p] = { off: toggled.filter((x) => itemsOn()[p].includes(x)), on: toggled.filter((x) => !itemsOn()[p].includes(x)) };
    }
    const pts = s.ep.filter((p) => p in s.pt);
    return {
      parts: s.ep.slice(), items, level: s.lv, seed: s.sd, models: s.em,
      points: pts.length ? Object.fromEntries(pts.map((p) => [p, s.pt[p]])) : null,
      example: s.ee || null, det: s.ed, paper: s.pp, header: Object.assign({}, s.eh),
      extras: { id: s.ea.includes('i'), normal: s.ea.includes('n'), grid: s.ea.includes('g'), qr: s.ea.includes('q') },
    };
  }

  /** Las familias que piden las partes, en el orden de family-load. */
  const FAMILY_OF = { stmt: ['sg'], roy: ['lab'], pert: ['lab'], minDummy: ['lab'], succ: ['lab'], det: ['lab', 'dt'], tcl: ['st', 'pr'], read: ['st', 'pr'], disc: ['st', 'pr'], rep: ['st', 'pr'] };
  const familiesOf = (parts) => { const set = new Set((parts || []).flatMap((p) => FAMILY_OF[p] || [])); return Object.keys(FL.FAMILIES).filter((f) => set.has(f)); };
  /** «Volver al laboratorio»: cpm.html con el mismo idioma y la misma notación. */
  const backHref = (s) => `cpm.html#lang=${s.lang}&nota=${s.nota}`;

  // ---------- la página ----------
  function boot() {
    const I = root.PNL.i18n;
    const { h, clear } = root.PNL.dom;
    const doc = root.document;
    const $ = (id) => doc.getElementById(id);
    let state = null;
    let moreOpen = false;
    let lastAnnounced = '';
    const t = (k, p) => I.t(state.lang, k, p);
    const num = (v) => (state.lang === 'es' ? String(v).replace('.', ',') : String(v));
    const announce = (text) => { if (text !== lastAnnounced) { $('live').textContent = text; lastAnnounced = text; } };
    const loader = FL.create({ doc, onFail: () => { $('loadFailed').hidden = false; }, onOk: () => { $('loadFailed').hidden = true; } });

    function writeHash() {
      const hash = encode(state);
      if (root.location.hash !== hash) root.history.replaceState(null, '', hash);
    }
    function set(patch) {
      state = Object.assign({}, state, patch);
      if (state.mi >= state.em) state.mi = 0;
      writeHash();
      render();
    }
    function read() {
      const { state: s, warning } = load(root.location.hash, root.location.search, root.navigator.language);
      state = s;
      const banner = $('urlWarning');
      banner.hidden = !warning;
      if (warning) banner.textContent = I.t(state.lang, 'app.urlWarning');
    }

    function renderTexts() {
      doc.documentElement.lang = state.lang;
      doc.title = t('exam.page.docTitle');
      doc.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(el.getAttribute('data-i18n')); });
      $('selLang').value = state.lang;
      $('selNota').value = state.nota;
      $('backLink').href = backHref(state);
    }

    // ---------- controles ----------
    const select = (id, label, options, value, onchange) => h('label', { class: 'xm-field' }, [label,
      h('select', { id, onchange: (e) => onchange(e.target.value) }, options.map(([v, text]) => h('option', { value: v, selected: String(v) === String(value) }, [text])))]);

    function partRow(p, c, prop) {
      const on = state.ep.includes(p);
      const name = t(`exam.part.${p}`);
      const toggle = (e) => {
        const ep = E.PARTS.filter((x) => (x === p ? e.target.checked : state.ep.includes(x)));
        const pt = Object.assign({}, state.pt); delete pt[p];
        set({ ep, pt, eq: e.target.checked ? state.eq : state.eq.filter((x) => !x.startsWith(`${p}.`)) });
      };
      const items = on && E.ITEMS[p] ? h('div', { class: 'xm-items', role: 'group', 'aria-label': t('exam.page.itemsOf', { part: name }) }, E.ITEMS[p].map((x) => {
        const checked = c.items[p] && c.items[p].includes(x);
        const last = checked && c.items[p].length === 1;
        return h('label', { class: 'xm-item-check' }, [h('input', { type: 'checkbox', id: `exItem-${p}-${x}`, checked, disabled: last,
          onchange: () => { const k = `${p}.${x}`; set({ eq: allItems().filter((y) => (y === k ? !state.eq.includes(k) : state.eq.includes(y))) }); } }), t(`exam.item.${x}`)]);
      })) : h('div', { class: 'xm-items' }, []);
      const value = p in state.pt ? state.pt[p] : prop[p];
      const pts = on ? h('input', { type: 'text', inputmode: 'decimal', id: `exPts-${p}`, class: 'xm-pts-in', size: 4, value: num(value), 'aria-label': t('exam.page.pointsOf', { part: name }),
        onchange: (e) => {
          const x = String(e.target.value).trim().replace(',', '.');
          if (!ptsOk(x)) { announce(t('exam.page.pointsBad')); render(); return; }
          set({ pt: Object.assign({}, state.pt, { [p]: Number(x) }) });
        } }) : null;
      return h('div', { class: on ? 'xm-prow on' : 'xm-prow' }, [
        h('label', { class: 'xm-pcheck' }, [h('input', { type: 'checkbox', id: `exPart-${p}`, checked: on, onchange: toggle }), name]),
        items, h('div', { class: 'xm-pts' }, [pts]),
      ]);
    }

    function form() {
      const opts = optsOf(state);
      const c = E.check(opts);
      const prop = c.ok || c.errors.every((e) => e.key !== 'empty') ? E.points(opts) : {};
      const levels = E.LEVELS.map((l) => [l, t(`mq.level.${l}`)]);
      const top = h('div', { class: 'xm-row' }, [
        select('exLevel', t('exam.page.level'), levels, state.lv, (v) => set({ lv: v })),
        h('label', { class: 'xm-field' }, [t('exam.page.seed'), h('input', { type: 'number', id: 'exSeed', min: 1, max: E.SEED_MAX, step: 1, inputmode: 'numeric', value: String(state.sd),
          onchange: (e) => { const v = intIn(String(e.target.value).trim(), 1, E.SEED_MAX); if (v === undefined) { render(); return; } set({ sd: v }); } })]),
        select('exModels', t('exam.page.models'), Array.from({ length: E.MAX_MODELS }, (_, i) => [i + 1, String(i + 1)]), state.em, (v) => set({ em: Number(v) })),
      ]);
      const groups = GROUPS.map((g) => h('div', { class: 'xm-group' }, [h('p', { class: 'xm-group-name' }, [t(`exam.page.group.${g.id}`)]), ...g.parts.map((p) => partRow(p, c, prop))]));
      let total;
      if (!state.ep.length) total = h('p', { class: 'xm-warn', role: 'status' }, [t('exam.page.empty')]);
      else {
        const w = c.warnings.find((x) => x.key === 'pointsSum');
        total = w ? h('p', { class: 'xm-warn', role: 'status' }, [t('exam.page.sumWarn', { n: num(w.params.sum) })])
          : h('p', { class: 'xm-total', role: 'status' }, [t('exam.page.total', { n: 10 })]);
      }
      const reset = h('button', { type: 'button', id: 'exReset', class: 'ghost', disabled: !Object.keys(state.pt).length, onclick: () => set({ pt: {} }) }, [t('exam.page.reset')]);
      const parts = h('fieldset', { class: 'xm-parts' }, [h('legend', {}, [t('exam.page.parts')]), h('p', { class: 'xm-hint' }, [t('exam.page.partsHint')]), ...groups,
        h('div', { class: 'xm-sum' }, [total, reset])]);
      const out = [h('p', { class: 'xm-lead' }, [t('exam.page.lead')]), top, parts];
      if (c.warnings.some((x) => x.key === 'detOwn')) out.push(h('p', { class: 'xm-warn', role: 'status' }, [t('exam.page.detOwn')]));
      if (state.ep.includes('det') && !state.ep.includes('roy') && !state.ep.includes('pert')) {
        out.push(h('div', { class: 'xm-row' }, [select('exDetGraph', t('exam.page.detGraph'), [['aon', t('exam.page.graphAon')], ['aoa', t('exam.page.graphAoa')]], state.ed, (v) => set({ ed: v }))]));
      }
      out.push(more());
      return out;
    }

    function more() {
      const field = (k) => h('label', { class: 'xm-field xm-head-field' }, [t(`exam.page.${k}`), h('input', { type: 'text', id: `exHead-${k}`, value: state.eh[k], autocomplete: 'off',
        oninput: limit, onchange: (e) => setHead(k, e.target.value) })]);
      const count = h('p', { class: 'xm-hint', id: 'exHeadCount', 'aria-live': 'polite' }, [t('exam.page.headerCount', { n: headerLength(state.eh), max: HEADER_MAX })]);
      function limit(e) {
        // Ningún campo deja pasar de 600 caracteres en total: lo que sobra se corta.
        const k = e.target.id.replace('exHead-', '');
        const others = headerLength(Object.assign({}, state.eh, { [k]: '' }));
        if (others + e.target.value.length > HEADER_MAX) e.target.value = e.target.value.slice(0, HEADER_MAX - others);
        count.textContent = t('exam.page.headerCount', { n: others + e.target.value.length, max: HEADER_MAX });
      }
      function setHead(k, v) { set({ eh: Object.assign({}, state.eh, { [k]: v }) }); }
      const instr = h('label', { class: 'xm-field xm-head-field xm-wide-field' }, [t('exam.page.instructions'), h('textarea', { id: 'exHead-instructions', rows: 3, placeholder: t('exam.head.instructions'),
        oninput: limit, onchange: (e) => setHead('instructions', e.target.value) })]);
      instr.lastChild.value = state.eh.instructions;
      const extra = (ch, key) => h('label', { class: 'xm-check' }, [h('input', { type: 'checkbox', id: `exExtra-${ch}`, checked: state.ea.includes(ch),
        onchange: (e) => set({ ea: [...EXTRAS].filter((x) => (x === ch ? e.target.checked : state.ea.includes(x))).join('') }) }), t(`exam.page.${key}`)]);
      return h('details', { class: 'xm-more', open: moreOpen, ontoggle: (e) => { moreOpen = e.target.open; } }, [
        h('summary', {}, [t('exam.page.more')]),
        h('fieldset', { class: 'xm-sub' }, [h('legend', {}, [t('exam.page.header')]), h('div', { class: 'xm-head-grid' }, [field('subject'), field('call'), field('date'), field('duration'), instr]), count]),
        h('fieldset', { class: 'xm-sub' }, [h('legend', {}, [t('exam.page.extras')]), extra('i', 'extraId'), extra('n', 'extraNormal'), extra('g', 'extraGrid'), extra('q', 'extraQr')]),
        h('div', { class: 'xm-row' }, [select('exPaper', t('exam.page.paper'), [['a4', t('exam.page.paperA4')], ['letter', t('exam.page.paperLetter')]], state.pp, (v) => set({ pp: v }))]),
      ]);
    }

    // ---------- documento y modelo a la vista ----------
    const DOCS = ['s', 'o', 'r'];
    function side() {
      const tabs = h('div', { class: 'xm-tabs', role: 'tablist', 'aria-label': t('exam.page.docs.label') }, DOCS.map((d) => h('button', {
        type: 'button', role: 'tab', id: `exDoc-${d}`, 'aria-selected': d === state.dv ? 'true' : 'false', 'aria-controls': 'exPreview', tabindex: d === state.dv ? '0' : '-1',
        onclick: () => set({ dv: d }),
        onkeydown: (e) => {
          const i = DOCS.indexOf(d);
          const j = e.key === 'ArrowRight' ? (i + 1) % 3 : e.key === 'ArrowLeft' ? (i + 2) % 3 : e.key === 'Home' ? 0 : e.key === 'End' ? 2 : -1;
          if (j < 0) return;
          e.preventDefault();
          set({ dv: DOCS[j] });
          $(`exDoc-${DOCS[j]}`).focus();
        },
      }, [t(`exam.page.docs.${d}`)])));
      const models = h('div', { class: 'xm-models', role: 'group', 'aria-label': t('exam.page.modelsLabel') }, Array.from({ length: state.em }, (_, i) => h('button', {
        type: 'button', id: `exModel-${i}`, class: 'ghost', 'aria-pressed': i === state.mi ? 'true' : 'false', onclick: () => set({ mi: i }),
      }, [t('exam.page.model', { l: 'ABCDEFGH'[i] })])));
      const copy = h('button', { type: 'button', id: 'exCopy', class: 'ghost', onclick: () => {
        const done = () => announce(t('exam.page.copied'));
        const fail = () => announce(t('exam.page.copyFailed'));
        try { root.navigator.clipboard.writeText(root.location.href).then(done, fail); } catch { fail(); }
      } }, [t('exam.page.copy')]);
      return [h('div', { class: 'xm-side-head' }, [tabs, models]), h('div', { class: 'xm-actions' }, [copy]),
        h('div', { id: 'exPreview', class: 'xm-preview', role: 'tabpanel', 'aria-labelledby': `exDoc-${state.dv}`, tabindex: '0' }, [])];
    }

    function render() {
      const focused = doc.activeElement && doc.activeElement.id;
      renderTexts();
      const view = $('exView');
      clear(view);
      view.appendChild(h('div', { class: 'xm-layout' }, [
        h('div', { class: 'xm-form' }, form()),
        h('section', { class: 'xm-side', 'aria-label': t(`exam.page.docs.${state.dv}`) }, side()),
      ]));
      // Las familias de las partes marcadas se piden en cuanto se marcan (la vista previa las usa en T011).
      const fams = familiesOf(state.ep);
      const p = loader.need(fams);
      if (p) p.catch(() => {});
      if (focused && $(focused)) $(focused).focus();
    }

    read();
    writeHash();
    render();
    $('selLang').addEventListener('change', (e) => set({ lang: e.target.value }));
    $('selNota').addEventListener('change', (e) => set({ nota: e.target.value }));
    root.addEventListener('hashchange', () => {
      if (root.location.hash === encode(state)) return;
      read();
      writeHash();
      render();
    });
    api.state = () => ({ state: clone(state), hash: root.location.hash, opts: optsOf(state), families: familiesOf(state.ep), ready: loader.ready(familiesOf(state.ep)) });
  }

  const api = { KEYS, DEFAULTS, HEADER_MAX, GROUPS, headerLength, decode, load, encode, optsOf, familiesOf, backHref };
  root.PNL = root.PNL || {};
  root.PNL.examApp = api;
  if (isNode) module.exports = api;
  else if (root.document && root.document.getElementById('exView')) boot();
})(typeof globalThis !== 'undefined' ? globalThis : this);
