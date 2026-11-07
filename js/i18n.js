/*
 * Textos de la interfaz en español e inglés, y etiquetas de las dos notaciones.
 * t(lang, key, params) sustituye {param} por su valor. Funciona en el navegador (window.PNL.i18n)
 * y en Node (module.exports), como el resto de scripts del laboratorio (constitución, principio 29).
 */
(function (root) {
  'use strict';

  const languages = ['es', 'en'];

  const dict = {
    es: {
      appTitle: 'Laboratorio de redes de proyectos',
      appSubtitle: 'PERT · CPM · ROY',
      noscript: 'Esta herramienta necesita JavaScript para funcionar.',
      skipToContent: 'Saltar al contenido',
      comingSoon: 'En construcción: fase 1 (CPM determinista con la red ROY).',
    },
    en: {
      appTitle: 'Project Network Lab',
      appSubtitle: 'PERT · CPM · ROY',
      noscript: 'This tool needs JavaScript to work.',
      skipToContent: 'Skip to content',
      comingSoon: 'Under construction: phase 1 (deterministic CPM with activity-on-node networks).',
    },
  };

  function t(lang, key, params) {
    const table = dict[lang] || dict.es;
    let s = Object.prototype.hasOwnProperty.call(table, key) ? table[key] : key;
    if (params) s = s.replace(/\{(\w+)\}/g, (m, p) => (params[p] == null ? m : String(params[p])));
    return s;
  }

  const api = { languages, dict, t };
  root.PNL = root.PNL || {};
  root.PNL.i18n = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
