/*
 * moodle-app — la página propia del exportador de Moodle, moodle.html (spec f3e-probabilidad-montecarlo, AC13, AC21 y
 * AC23; plan P2; T013; tableros 100 y 105).
 *
 * Con las etapas de la F3e, el exportador no cabe en cpm.html (≈ 1049–1092 KiB): la carga común del laboratorio (D3,
 * app.js, vistas, narración) no le sirve, porque dibuja con SVG en texto. Esta página carga la base de la F3b (núcleo,
 * textos, vista previa y moodle-page, en moodle.html) y, al marcar una etapa, su familia (FAMILIES): el enunciado (sg,
 * etapa 0) y la construcción (lab, etapas 7 a 10). moodle-page no cambia lo que hace: recibe need y ready para esperar a
 * la familia antes de la vista previa y de «Descargar»; en cpm.html (grupo mq) no los recibe y todo sigue igual.
 * F3e (T016): la familia estocástica (st) de las etapas 11 a 17, y core/series en la base (la pestaña de las series).
 * F3f (T010; análisis H5): las familias y su carga, en js/family-load.js (las comparte con examen.html), sin cambios.
 * El estado del enlace es el de cpm.html#v=moodle (urlstate: idioma y notación; v=moodle siempre), para que la
 * redirección de T017 solo cambie la página. La cabecera lleva el título, Idioma, Notación y «Volver al laboratorio».
 * La parte sin DOM (FAMILIES, familiesOf, load, hashOf, backHref) se prueba en Node; PNL.moodleApp.state() da el idioma
 * y la notación a las pruebas de navegador.
 */
(function (root) {
  'use strict';

  const isNode = typeof module !== 'undefined' && module.exports;
  const U = isNode ? require('./core/urlstate.js') : root.PNL.urlstate;

  // F3f (T010; análisis H5): las familias y su carga están en js/family-load.js, que comparte con examen.html.
  const FL = isNode ? require('./family-load.js') : root.PNL.familyLoad;
  /** Las familias de etapas que no van en la base: sus archivos, en el orden en que se cargan (las de family-load). */
  const FAMILIES = FL.FAMILIES;
  /** La familia de cada etapa que no es de la base (las siete de la F3b van en la base). */
  const FAMILY_OF = { stmt: 'sg', minDummy: 'lab', succ: 'lab', immPred: 'lab', detective: 'lab',
    tclMoments: 'st', tclPath: 'st', tclProb: 'st', tclRoute: 'st', mcRead: 'st', mcDisc: 'st', mcRep: 'st' };
  /** Las familias que piden unas etapas, sin repetir y en el orden de FAMILIES. */
  const familiesOf = (stages) => Object.keys(FAMILIES).filter((f) => (stages || []).some((s) => FAMILY_OF[s] === f));

  /** El estado de un enlace, como cpm.html: el idioma del «#», si no el de ?lang= y si no el del navegador. */
  function load(hash, search, navLang) {
    const { state, warning } = U.decode(hash);
    const q = new URLSearchParams(search || '').get('lang');
    const s = Object.assign({}, state, { v: 'moodle' });
    if (!s.lang) s.lang = q === 'en' || q === 'es' ? q : (String(navLang || '').toLowerCase().startsWith('en') ? 'en' : 'es');
    return { state: s, warning };
  }
  const stateFrom = (hash, search, navLang) => load(hash, search, navLang).state;
  /** El «#» que escribe la página: el mismo que escribe cpm.html con v=moodle. */
  const hashOf = (s) => U.encode(Object.assign({}, s, { v: 'moodle' }));
  /** «Volver al laboratorio»: cpm.html con el mismo idioma y la misma notación. */
  const backHref = (s) => `cpm.html#lang=${s.lang}&nota=${s.nota}`;

  function boot() {
    const I = root.PNL.i18n;
    const MP = root.PNL.moodlePage;
    const $ = (id) => root.document.getElementById(id);
    let state = null;
    let lastAnnounced = '';
    const lang = () => state.lang;
    const t = (k, p) => I.t(lang(), k, p);

    // ---------- Familias bajo demanda (family-load: async = false, reintento entero tras un fallo) ----------
    const loader = FL.create({ doc: root.document, onFail: () => { $('loadFailed').hidden = false; }, onOk: () => { $('loadFailed').hidden = true; } });
    const ready = (stages) => loader.ready(familiesOf(stages));
    /** null si las familias de estas etapas ya están; si no, la promesa de cargarlas. */
    const need = (stages) => loader.need(familiesOf(stages));

    // ---------- Cabecera ----------
    function renderTexts() {
      root.document.documentElement.lang = lang();
      root.document.title = t('mq.app.docTitle');
      root.document.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(el.getAttribute('data-i18n')); });
      root.document.querySelectorAll('[data-i18n-label]').forEach((el) => { el.setAttribute('aria-label', t(el.getAttribute('data-i18n-label'))); });
      $('selLang').value = lang();
      $('selNota').value = state.nota;
      $('backLink').href = backHref(state);
    }

    function writeHash() {
      const { hash } = U.encodeSafe(state);
      if (hash && root.location.hash !== hash) root.history.replaceState(null, '', hash);
    }

    let mqc = null;
    function render() {
      renderTexts();
      mqc.render();
    }

    function set(key, value) {
      state = Object.assign({}, state, { [key]: value });
      writeHash();
      render();
    }

    function read() {
      const { state: s, warning } = load(root.location.hash, root.location.search, root.navigator.language);
      state = s;
      const banner = $('urlWarning');
      banner.hidden = !warning;
      if (warning) banner.textContent = I.t(state.lang, warning === 'structureOnly' ? 'app.structureOnlyWarning' : 'app.urlWarning');
    }

    read();
    mqc = MP.create($('mqView'), {
      state: () => state, lang,
      announce: (text) => { if (text !== lastAnnounced) { $('live').textContent = text; lastAnnounced = text; } },
      // F3e (T013): la familia de cada etapa marcada; el título va en la cabecera de la página. Desde T021, moodle-page
      // solo tiene el camino de moodle.html (etapas 11 a 17, familias plegables y series).
      need, ready,
    });
    MP.state = () => mqc.debug();
    writeHash();
    render();
    $('selLang').addEventListener('change', (e) => set('lang', e.target.value));
    $('selNota').addEventListener('change', (e) => set('nota', e.target.value));
    root.addEventListener('hashchange', () => {
      if (root.location.hash === hashOf(state)) return;
      read();
      writeHash();
      render();
    });
    api.state = () => ({ lang: state.lang, nota: state.nota, hash: root.location.hash });
  }

  const api = { FAMILIES, FAMILY_OF, familiesOf, load, stateFrom, hashOf, backHref };
  root.PNL = root.PNL || {};
  root.PNL.moodleApp = api;
  if (isNode) module.exports = api;
  else if (root.document && root.document.getElementById('mqView')) boot();
})(typeof globalThis !== 'undefined' ? globalThis : this);
