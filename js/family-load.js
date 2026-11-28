/*
 * family-load — la carga por familias que comparten moodle.html y examen.html (spec f3f-examen-imprimible, AC17 y AC18;
 * plan P6; análisis H5; T010). Sale de moodle-app (F3e, T013) sin cambiar lo que hace: los scripts de una familia se
 * añaden con async = false en su orden; los que ya están en la página no se piden otra vez, salvo el último, que dice
 * que la familia llegó; un script que no carga se quita y se avisa (onFail), y el reintento pide la familia entera; al
 * llegar todas las que fallaron, onOk (quita el aviso). La familia está cuando están los globales que deja (READY).
 * Familias: el enunciado (sg), las redes y el detective (lab) y lo estocástico (st), las de moodle.html; examen.html
 * añade la rúbrica de probabilidad y la tabla de la normal (pr) y las explicaciones del detective (dt).
 * create({ doc, PNL, onFail, onOk }) → { need(familias) (null si ya están; si no, la promesa), ready(familias), family(f) }.
 */
(function (root) {
  'use strict';

  /** Los archivos de cada familia, en el orden en que se cargan. */
  const FAMILIES = {
    // F3c (P5): el generador de enunciados.
    sg: ['js/core/contexts.js', 'js/core/stmtgen.js'],
    // F3d (H1, P4): aoacheck y roycheck (antes que detective) y la imagen de la red (net-svg, con layout y aoa-layout).
    lab: ['js/core/aoacheck.js', 'js/core/roycheck.js', 'js/core/detective.js', 'js/views/layout.js', 'js/views/aoa-layout.js', 'js/views/net-svg.js'],
    // F3e (T016, H10): los tres tiempos, el TCL, la simulación, probgen y los gráficos de «Leer una simulación».
    st: ['js/core/threept.js', 'js/core/tcl.js', 'js/core/sim.js', 'js/core/mc.js', 'js/core/probgen.js', 'js/views/chart-svg.js'],
    // F3f (P6): la rúbrica de probabilidad y Montecarlo (probgrade), la tabla de la normal y sus textos. Después de st.
    pr: ['js/core/probgrade.js', 'js/views/normal-table.js', 'js/i18n-prob.js', 'js/i18n-mc.js'],
    // F3f (T010): las explicaciones de los errores del detective, las de «Ejercicios».
    dt: ['js/i18n-det.js'],
    // F3f (T013): los ejemplos citados como proyecto del modelo A (examples y stochex) y, con «Del enunciado a la tabla»,
    // los enunciados de los apuntes (statements, que usa examples: después de xe).
    xe: ['js/core/examples.js', 'js/core/stochex.js'],
    xs: ['js/core/statements.js'],
    // F5d (T008, P8): exportar una red del documento, al abrir el menú «Exportar» (con su hoja, que no hace esperar).
    fx: ['css/fx.css', 'js/i18n-fx.js', 'js/views/fig-tikz.js', 'js/fig-export.js'],
  };
  /** Los globales que deja cada familia (la familia está cargada). */
  const READY = {
    sg: (P) => !!P.stmtgen,
    lab: (P) => !!P.detective && !!P.netSvg,
    st: (P) => !!P.probgen && !!P.chartSvg,
    pr: (P) => !!P.probgrade && !!P.normalTable && !!P.i18nProb && !!P.i18nMc,
    dt: (P) => !!P.i18nDet,
    xe: (P) => !!P.examples && !!P.stochex,
    xs: (P) => !!P.statements,
    fx: (P) => !!P.figExport && !!P.figTikz && !!P.i18nFx,
  };

  function create(o) {
    const doc = o.doc || root.document;
    const P = () => o.PNL || root.PNL;
    const broken = new Set();
    const loading = {};
    const isReady = (f) => !broken.has(f) && READY[f](P());
    const ready = (fams) => (fams || []).every(isReady);
    function family(f) {
      if (isReady(f)) return Promise.resolve();
      if (!loading[f]) {
        const retry = broken.has(f);
        const have = new Set([...doc.scripts].map((x) => x.getAttribute('src')));
        for (const href of FAMILIES[f].filter((src) => src.endsWith('.css') && !doc.querySelector(`link[href="${src}"]`))) {
          const el = doc.createElement('link'); el.rel = 'stylesheet'; el.href = href; doc.head.appendChild(el);
        }
        const files = FAMILIES[f].filter((src) => !src.endsWith('.css')).filter((src, i, list) => retry || !have.has(src) || i === list.length - 1);
        loading[f] = new Promise((resolve, reject) => {
          files.forEach((src, i) => {
            const el = doc.createElement('script');
            el.src = src; el.async = false;
            if (i === files.length - 1) el.onload = () => resolve();
            // Un script que no carga se quita, para que el reintento lo vuelva a pedir.
            el.onerror = () => { el.remove(); reject(new Error(src)); };
            doc.body.appendChild(el);
          });
        }).then(() => {
          broken.delete(f);
          if (!READY[f](P())) throw new Error(`family ${f}`);
          delete loading[f];
          if (!broken.size && o.onOk) o.onOk();
        }).catch((err) => { delete loading[f]; broken.add(f); if (o.onFail) o.onFail(err); throw err; });
      }
      return loading[f];
    }
    /** null si las familias ya están; si no, la promesa de cargarlas (en el orden de FAMILIES). */
    const need = (fams) => {
      const list = Object.keys(FAMILIES).filter((f) => (fams || []).includes(f));
      return ready(list) ? null : Promise.all(list.map(family));
    };
    return { need, ready, family };
  }

  const api = { FAMILIES, READY, create };
  root.PNL = root.PNL || {};
  root.PNL.familyLoad = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
