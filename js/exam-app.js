/*
 * exam-app — la página del examen imprimible, examen.html (spec f3f-examen-imprimible, AC9 y AC15–AC17; plan P6 y P7,
 * §3; T010; tableros 107–109). Como moodle.html: cabecera con el título, Idioma, Notación y «Volver al laboratorio»;
 * carga su base (núcleo de la F3b, series, core/exam, core/qr, exam-view y sus textos) y, al marcar una parte, sus
 * familias (family-load). A la izquierda, nivel, semilla y modelos; la tabla «Partes, apartados y puntos» por grupos
 * (cada parte con su casilla, sus apartados y sus puntos; el total o el aviso y «Volver a la propuesta»); el aviso del
 * detective aparte y la red del detective sin construcción; plegados, la cabecera, los extras y el papel. A la derecha,
 * las pestañas del documento y los botones del modelo, «Copiar enlace» y la vista previa del documento a la vista (T011):
 * los modelos se buscan a trozos, uno tras otro (core/exam start y step, un intento cada vez), con «Buscando…» si tarda
 * más de 300 ms; los documentos se guardan por modelo, idioma, notación, puntos, extras y apartados.
 * T012 (plan P2; tableros 110–113): la vista previa en hojas de papel (exam-view.pages), a escala para caber en su columna,
 * con la línea de estado (modelo, semilla, páginas y papel); la regla @page del papel elegido (un <style> propio);
 * «Imprimir» (window.print con el documento a la vista: en papel solo salen sus hojas) e «Imprimir todos los enunciados»
 * (espera a los modelos con el progreso a la vista, pone los enunciados de todos en #exPrintOut, cada uno desde una hoja
 * nueva, e imprime; al acabar, afterprint deja la página como estaba).
 * T013: «Proyecto»: la tabla generada o un ejemplo de los apuntes como modelo A (ee); las partes que no permite se quitan y
 * no se pueden marcar (withExample), y sus archivos llegan al elegirlo (familias xe y xs).
 * Estado en el «#» (P7): las claves de §3, con lista blanca; un valor que no vale vuelve al defecto y se avisa, como
 * en cpm.html. La cabecera del enunciado va siempre como texto (textContent y value), 600 caracteres como mucho.
 * La parte sin DOM (KEYS, DEFAULTS, decode, load, encode, optsOf, familiesOf, backHref, GROUPS, docCtx, searchKey,
 * viewBlocks, pageCss, footOf, statusOf, withExample) se prueba en Node;
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
  /** El texto con max unidades como mucho, sin dejar medio carácter (un sustituto alto suelto) al final (I-F1). */
  const clipText = (v, max) => { const x = String(v).slice(0, Math.max(0, max)); return /[\uD800-\uDBFF]$/.test(x) ? x.slice(0, -1) : x; };
  /** Sin sustitutos sueltos, que encodeURIComponent no admite (por si llegan de otro sitio que la cabecera). */
  const wellFormed = (v) => String(v).replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, '\uFFFD');
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
      if (!xs.every((x) => ok.includes(x))) return undefined;
      // Ninguna parte se queda sin apartados (la página no deja quitar el último; un enlace tampoco; I-F6).
      return bareParts(xs).length ? undefined : ok.filter((x) => xs.includes(x));
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
    const r = decode(hash);
    let { state, warning } = r;
    // Un ejemplo con partes que no permite (T013): se quitan y se avisa.
    if (state.ee) { const w = withExample(state, state.ee); if (JSON.stringify(w) !== JSON.stringify(state)) { state = w; warning = true; } }
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
    if (headerLength(s.eh)) out.push(`eh=${HEAD_FIELDS.map((k) => encodeURIComponent(wellFormed(s.eh[k] || ''))).join('|')}`);
    if (s.pp !== DEFAULTS.pp) out.push(`pp=${s.pp}`);
    if (s.dv !== DEFAULTS.dv) out.push(`dv=${s.dv}`);
    if (s.mi !== DEFAULTS.mi) out.push(`mi=${s.mi}`);
    return `#${out.join('&')}`;
  }

  /** Los apartados que van marcados por defecto (los de core/exam: todos menos la otra ruta del TCL). */
  let defaultItems = null;
  /** Las partes que los apartados cambiados xs (los de eq) dejarían sin ninguno. */
  const bareParts = (xs) => Object.keys(E.ITEMS).filter((p) => E.ITEMS[p].every((x) => itemsOn()[p].includes(x) === xs.includes(`${p}.${x}`)));
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
  /** Con un ejemplo citado (T013): examples y stochex (xe); los de tres tiempos y discretas, además probgen (st); con el
   *  enunciado, los de los apuntes (xs). */
  const familiesOf = (parts, example) => {
    const set = new Set((parts || []).flatMap((p) => FAMILY_OF[p] || []));
    if (example) {
      set.add('xe');
      if (['kl', 'hl', 'kd'].includes(example)) set.add('st');
      else if ((parts || []).includes('stmt')) set.add('xs');
    }
    return Object.keys(FL.FAMILIES).filter((f) => set.has(f));
  };
  /** Elegir el proyecto (T013): con un ejemplo, fuera las partes que no permite (con sus puntos y apartados) y la otra ruta. */
  function withExample(s, id) {
    const out = clone(s);
    out.ee = id || '';
    if (!id) return out;
    const ok = E.partsOf(id) || [];
    out.ep = s.ep.filter((p) => ok.includes(p));
    out.eq = s.eq.filter((x) => out.ep.includes(x.split('.')[0]) && x !== 'tcl.route');
    // Si sin la otra ruta el TCL se queda sin apartados, vuelve a los suyos por defecto (revisión de nivel 2, ronda 2, F5).
    const bare = bareParts(out.eq);
    if (bare.length) out.eq = out.eq.filter((x) => !bare.includes(x.split('.')[0]));
    out.pt = Object.fromEntries(Object.entries(s.pt).filter(([p]) => out.ep.includes(p)));
    return out;
  }
  /** «Volver al laboratorio»: cpm.html con el mismo idioma y la misma notación. */
  const backHref = (s) => `cpm.html#lang=${s.lang}&nota=${s.nota}`;

  // ---------- los documentos (T011) ----------
  /** El ctx de core/exam: textos exam.… de i18n-exam, exam.det.<tipo> de i18n-det (det.exp) y los demás de i18n-moodle; dibujos
   *  de las redes y de los gráficos si sus familias están (P = PNL). */
  function docCtx(lang, nota, P) {
    const I = isNode ? require('./i18n.js') : root.PNL.i18n;
    const IM = isNode ? require('./i18n-moodle.js') : root.PNL.i18nMoodle;
    const det = (k) => k.startsWith('exam.det.') && k !== 'exam.det.lab' && k !== 'exam.det.labEv';
    const tr = (k, p) => (det(k) ? I.t(lang, `det.exp.${k.slice(9)}`, p) : k.startsWith('exam.') ? I.t(lang, k, p) : I.t(lang, `mq.${k}`, p));
    const NS = P && P.netSvg; const CS = P && P.chartSvg;
    return { lang, nota, labels: IM.labels(nota), tr, svg: NS ? (m) => NS.render(m) : null, chart: CS ? (m) => (m.kind === 'dist' ? CS.dist(m) : CS.indices(m)) : null };
  }
  /** Lo que decide la búsqueda de los modelos: las partes, las etapas de las series, el nivel, la semilla, el ejemplo y la red
   *  del detective (los puntos, los extras, la cabecera, el papel, el idioma y lo que está a la vista, no). */
  function searchKey(o) {
    const c = E.check(o);
    return JSON.stringify({ parts: c.parts, stages: c.ok ? E.stagesOf(c) : null, level: o.level, seed: o.seed, example: o.example || null, det: o.det });
  }
  /** Los bloques del documento a la vista: el enunciado con su cabecera delante; la solución y la rúbrica con su título. */
  function viewBlocks(d, dv, st, t) {
    if (dv === 'o') return [{ title: t('exam.head.solTitle') }, ...d.solution];
    if (dv === 'r') return [{ title: t('exam.head.rubTitle') }, ...d.rubric];
    return [{ head: st.eh, id: st.ea.includes('i'), instructions: st.eh.instructions || t('exam.head.instructions') }, ...d.student];
  }

  // ---------- el papel (T012) ----------
  /** La regla @page del papel elegido: A4 o carta, con márgenes de 15 mm (plan P2). */
  const pageCss = (pp) => `@page { size: ${pp === 'letter' ? 'letter' : 'A4'}; margin: 15mm; }`;
  const seedText = (v) => (v == null ? '—' : v);
  /** El pie de cada hoja: el modelo, la semilla usada y el documento. */
  const footOf = (meta, dv, t) => `${meta.example ? t('exam.head.footEx', { l: meta.letter, name: t(`exam.ex.${meta.example}`) })
    : t('exam.head.foot', { l: meta.letter, s: seedText(meta.sdUsed) })} · ${t(`exam.page.docs.${dv}`)}`;
  /** La línea de estado de la vista previa: modelo, semilla (y la usada, si es otra), páginas y papel. */
  function statusOf(m, n, pp, t) {
    const paper = t(pp === 'letter' ? 'exam.page.paperLetter' : 'exam.page.paperA4');
    const pages = n === 1 ? t('exam.page.pagesOne', { paper }) : t('exam.page.pages', { n, paper });
    if (m.example) return t('exam.page.statusEx', { l: m.letter, name: t(`exam.ex.${m.example}`), pages });
    return t('exam.page.status', {
      l: m.letter, s: seedText(m.seed), u: m.sdUsed != null && m.sdUsed !== m.seed ? t('exam.page.used', { u: m.sdUsed }) : '',
      pages: n === 1 ? t('exam.page.pagesOne', { paper }) : t('exam.page.pages', { n, paper }),
    });
  }

  // ---------- la página ----------
  function boot() {
    const I = root.PNL.i18n;
    const { h, clear } = root.PNL.dom;
    const EV = root.PNL.examView;
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

    // La regla @page del papel elegido, en un <style> propio (T012).
    const pageStyle = doc.createElement('style');
    pageStyle.id = 'xmPage';
    doc.head.appendChild(pageStyle);
    function renderTexts() {
      if (pageStyle.textContent !== pageCss(state.pp)) pageStyle.textContent = pageCss(state.pp);
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
      // Con un ejemplo (T013), las partes que no permite no se pueden marcar.
      const barred = !!state.ee && !(E.partsOf(state.ee) || []).includes(p);
      const name = t(`exam.part.${p}`);
      const toggle = (e) => {
        const ep = E.PARTS.filter((x) => (x === p ? e.target.checked : state.ep.includes(x)));
        const pt = Object.assign({}, state.pt); delete pt[p];
        set({ ep, pt, eq: e.target.checked ? state.eq : state.eq.filter((x) => !x.startsWith(`${p}.`)) });
      };
      const items = on && E.ITEMS[p] ? h('div', { class: 'xm-items', role: 'group', 'aria-label': t('exam.page.itemsOf', { part: name }) }, E.ITEMS[p].map((x) => {
        const checked = c.items[p] && c.items[p].includes(x);
        const last = checked && c.items[p].length === 1;
        return h('label', { class: 'xm-item-check' }, [h('input', { type: 'checkbox', id: `exItem-${p}-${x}`, checked, disabled: last || (!!state.ee && x === 'route'),
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
        h('label', { class: 'xm-pcheck' }, [h('input', { type: 'checkbox', id: `exPart-${p}`, checked: on, disabled: barred && !on, onchange: toggle }), name]),
        items, h('div', { class: 'xm-pts' }, [pts]),
      ]);
    }

    function form() {
      const opts = optsOf(state);
      const c = E.check(opts);
      const prop = c.ok || c.errors.every((e) => e.key !== 'empty') ? E.points(opts) : {};
      const levels = E.LEVELS.map((l) => [l, t(`mq.level.${l}`)]);
      // El proyecto (T013): la tabla generada o un ejemplo de los apuntes; encoge con su columna (los nombres son largos).
      const project = select('exProject', t('exam.page.project'), [['', t('exam.page.projectGen')], ...E.EXAMPLES.map((id) => [id, t(`exam.ex.${id}`)])], state.ee, (v) => set(withExample(state, v)));
      project.classList.add('xm-project');
      const top = h('div', { class: 'xm-row' }, [
        select('exLevel', t('exam.page.level'), levels, state.lv, (v) => set({ lv: v })),
        h('label', { class: 'xm-field' }, [t('exam.page.seed'), h('input', { type: 'number', id: 'exSeed', min: 1, max: E.SEED_MAX, step: 1, inputmode: 'numeric', value: String(state.sd),
          onchange: (e) => { const v = intIn(String(e.target.value).trim(), 1, E.SEED_MAX); if (v === undefined) { render(); return; } set({ sd: v }); } })]),
        select('exModels', t('exam.page.models'), Array.from({ length: E.MAX_MODELS }, (_, i) => [i + 1, String(i + 1)]), state.em, (v) => set({ em: Number(v) })),
        project,
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
      const out = [h('p', { class: 'xm-lead' }, [t('exam.page.lead')]), top];
      if (state.ee) out.push(h('p', { id: 'exExampleNote', class: 'xm-hint', role: 'status' }, [t('exam.page.exampleNote')]));
      out.push(parts);
      for (const k of ['detOwn', 'detOwnEx']) if (c.warnings.some((x) => x.key === k)) out.push(h('p', { class: 'xm-warn', role: 'status' }, [t(`exam.page.${k}`)]));
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
        if (others + e.target.value.length > HEADER_MAX) e.target.value = clipText(e.target.value, HEADER_MAX - others);
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
      const ok = E.check(optsOf(state)).ok;
      const print = h('button', { type: 'button', id: 'exPrint', class: 'ghost primary', disabled: true, onclick: () => { endPrintAll(); root.print(); } }, [t('exam.page.print')]);
      const all = h('button', { type: 'button', id: 'exPrintAll', class: 'ghost', disabled: !ok || !!printJob, onclick: startPrintAll }, [t('exam.page.printAll')]);
      return [h('div', { class: 'xm-side-head' }, [tabs, models]), h('div', { class: 'xm-actions' }, [print, all, copy]),
        h('p', { id: 'exPrintStatus', class: 'xm-print-wait', role: 'status' }, [printJob ? printWait() : '']),
        h('div', { id: 'exPreview', class: 'xm-preview', role: 'tabpanel', 'aria-labelledby': `exDoc-${state.dv}`, tabindex: '0' }, []),
        h('p', { id: 'exStatus', class: 'xm-status' }, [])];
    }

    function render() {
      const focused = doc.activeElement && doc.activeElement.id;
      // Lo plegado se lee del DOM: el evento toggle llega más tarde que un cambio hecho justo después de abrirlo (CI 149).
      const more = doc.querySelector('.xm-more');
      if (more) moreOpen = more.open;
      renderTexts();
      const view = $('exView');
      clear(view);
      view.appendChild(h('div', { class: 'xm-layout' }, [
        h('div', { class: 'xm-form' }, form()),
        h('section', { class: 'xm-side', 'aria-label': t(`exam.page.docs.${state.dv}`) }, side()),
      ]));
      preview();
      if (focused && $(focused)) $(focused).focus();
    }

    // ---------- la vista previa (T011): modelos a trozos y documentos en caché ----------
    // Los modelos se buscan uno tras otro (el B evita la tabla del A…), un intento cada vez: la página recupera el control
    // entre intentos (como el exportador de la F3b: un intento difícil puede pasar de 40 ms; decisión de T011).
    const LETTERS = 'ABCDEFGH';
    const search = { key: null, o: null, models: [], job: null, gen: 0, running: false, searches: 0 };
    const docs = new Map();
    let current = null;
    let pendingSince = 0;
    let sheets = 0;
    let printJob = null;
    const now = () => (root.performance ? root.performance.now() : Date.now());
    const viewCtx = () => ({
      lang: state.lang, t,
      qr: (text) => { try { return root.PNL.qr.svg(root.PNL.qr.encode(text, { ecc: 'M' }), { title: 'QR' }); } catch { return null; } },
      normal: root.PNL.normalTable ? () => root.PNL.normalTable.rows() : null,
    });
    function message(text, cls) {
      const box = $('exPreview');
      clear(box);
      box.appendChild(h('p', { class: cls, role: 'status' }, [text]));
    }
    /** Sin documento a la vista: «Imprimir» espera y no hay línea de estado. */
    function idle() {
      current = null; sheets = 0;
      if ($('exPrint')) $('exPrint').disabled = true;
      if ($('exStatus')) $('exStatus').textContent = '';
    }
    /** La escala de las hojas para caber en la columna (las hojas miden lo que miden en papel). */
    function fit() {
      const box = $('exPreview');
      const paper = box && box.querySelector('.xm-paper');
      if (!paper) return;
      const s = Math.min(1, Math.max(0.2, (box.clientWidth - 24) / paper.offsetWidth));
      box.style.setProperty('--xm-s', s.toFixed(4));
    }
    /** El documento k (en caché por modelo, idioma, notación, puntos, extras y apartados). */
    function docOf(k, o) {
      const dk = JSON.stringify([search.key, k, state.lang, state.nota, o.points, o.extras, E.check(o).items]);
      let d = docs.get(dk);
      if (!d) { d = E.document(search.models[k], o, docCtx(state.lang, state.nota, root.PNL)); docs.set(dk, d); }
      return d;
    }
    function pending() {
      idle();
      if (!pendingSince) pendingSince = now();
      const box = $('exPreview');
      clear(box);
      const show = () => { if (pendingSince && $('exPreview') === box && !box.firstChild) message(t('exam.page.searching'), 'xm-searching'); };
      if (now() - pendingSince >= 300) show(); else root.setTimeout(show, 300 - (now() - pendingSince));
    }
    function draw() {
      const k = state.mi;
      const model = search.models[k];
      if (!model) { pending(); return; }
      pendingSince = 0;
      if (!model.ok) { idle(); message(t('exam.page.noProject', { n: E.TRIES_EXAM }), 'xm-warn'); return; }
      const d = docOf(k, optsOf(state));
      if (!d.ok) { idle(); clear($('exPreview')); return; }
      current = { k, d };
      sheets = EV.pages($('exPreview'), viewBlocks(d, state.dv, state, t), Object.assign(viewCtx(), { paper: state.pp, foot: footOf(d.meta, state.dv, t) }));
      fit();
      $('exPrint').disabled = false;
      $('exStatus').textContent = statusOf(model, sheets, state.pp, t);
    }

    // ---------- «Imprimir todos los enunciados» (T012, AC14) ----------
    const printWait = () => t('exam.page.printWait', { k: Math.min(search.models.length, state.em), n: state.em });
    function startPrintAll() {
      printJob = { gen: search.gen };
      $('exPrintAll').disabled = true;
      $('exPrintStatus').textContent = printWait();
      printAllWhenReady();
    }
    function printAllWhenReady() {
      if (!printJob) return;
      if (printJob.gen !== search.gen) { endPrintAll(); return; }
      if ($('exPrintStatus')) $('exPrintStatus').textContent = printWait();
      if (search.models.some((m) => !m.ok)) { endPrintAll(); return; }
      if (search.models.length < state.em) return;
      const out = $('exPrintOut');
      clear(out);
      const o = optsOf(state);
      for (let k = 0; k < state.em; k++) {
        const d = docOf(k, o);
        const tmp = h('div', {}, []);
        EV.pages(tmp, viewBlocks(d, 's', state, t), Object.assign(viewCtx(), { paper: state.pp, foot: footOf(d.meta, 's', t) }));
        while (tmp.firstChild) out.appendChild(tmp.firstChild);
      }
      printJob = null;
      if ($('exPrintStatus')) $('exPrintStatus').textContent = '';
      if ($('exPrintAll')) $('exPrintAll').disabled = !E.check(optsOf(state)).ok;
      doc.documentElement.classList.add('xm-print-all');
      root.print();
    }
    /** Después de imprimir (o si se cancela): la página vuelve a ser la de antes. */
    function endPrintAll() {
      printJob = null;
      doc.documentElement.classList.remove('xm-print-all');
      clear($('exPrintOut'));
      if ($('exPrintStatus')) $('exPrintStatus').textContent = '';
      if ($('exPrintAll')) $('exPrintAll').disabled = !E.check(optsOf(state)).ok;
    }
    /** Las opciones ya no son las de la búsqueda (no valen o faltan familias): se abandona, sin dibujar nada (I-F4). */
    function stop() {
      if (search.key == null) return;
      search.gen++;
      Object.assign(search, { key: null, o: null, models: [], job: null });
      docs.clear();
    }
    function pump() {
      if (search.running) return;
      search.running = true;
      const gen = search.gen;
      const tick = () => {
        if (gen !== search.gen) { search.running = false; pump(); return; }
        if (!search.o) { search.running = false; return; }
        const fail = search.models.some((m) => !m.ok);
        if (search.models.length >= state.em || fail) { search.running = false; return; }
        const k = search.models.length;
        if (!search.job) {
          search.job = E.start(search.o, k, docCtx(state.lang, state.nota, root.PNL), search.models.map((m) => JSON.stringify(m.base.rows)));
          search.searches++;
        }
        const t0 = now();
        while (!E.step(search.job, 1) && now() - t0 < 40);
        if (search.job.done) {
          const m = Object.assign({ letter: LETTERS[k] }, E.result(search.job));
          search.job = null;
          search.models.push(m);
          if (k === state.mi || !m.ok) draw();
          printAllWhenReady();
        }
        root.setTimeout(tick, 0);
      };
      root.setTimeout(tick, 0);
    }
    function preview() {
      const o = optsOf(state);
      if (!E.check(o).ok) { stop(); idle(); pendingSince = 0; clear($('exPreview')); if (printJob) endPrintAll(); return; }
      // Las familias de las partes marcadas, antes de buscar.
      const p = loader.need(familiesOf(state.ep, state.ee));
      if (p) { if (searchKey(o) !== search.key) stop(); pending(); p.then(() => { if (loader.ready(familiesOf(state.ep, state.ee))) preview(); }, () => {}); return; }
      const key = searchKey(o);
      if (key !== search.key) {
        search.gen++;
        Object.assign(search, { key, o, models: [], job: null });
        docs.clear();
        if (printJob) endPrintAll();
      }
      draw();
      pump();
    }

    read();
    writeHash();
    render();
    root.addEventListener('afterprint', () => { if (doc.documentElement.classList.contains('xm-print-all')) endPrintAll(); });
    root.addEventListener('resize', fit);
    $('selLang').addEventListener('change', (e) => set({ lang: e.target.value }));
    $('selNota').addEventListener('change', (e) => set({ nota: e.target.value }));
    root.addEventListener('hashchange', () => {
      if (root.location.hash === encode(state)) return;
      read();
      writeHash();
      render();
    });
    api.state = () => ({
      state: clone(state), hash: root.location.hash, opts: optsOf(state), families: familiesOf(state.ep, state.ee), ready: loader.ready(familiesOf(state.ep, state.ee)),
      models: search.models.map((m) => ({ letter: m.letter, ok: m.ok, sdUsed: m.sdUsed, tries: m.tries })), searches: search.searches,
      pending: !current, doc: current && { k: current.k, meta: current.d.meta, values: current.d.values, points: current.d.points, link: current.d.link }, sheets: current ? sheets : 0,
    });
  }

  const api = { KEYS, DEFAULTS, HEADER_MAX, GROUPS, headerLength, clipText, decode, load, encode, optsOf, familiesOf, backHref, docCtx, searchKey, viewBlocks, pageCss, footOf, statusOf, withExample };
  root.PNL = root.PNL || {};
  root.PNL.examApp = api;
  if (isNode) module.exports = api;
  else if (root.document && root.document.getElementById('exView')) boot();
})(typeof globalThis !== 'undefined' ? globalThis : this);
