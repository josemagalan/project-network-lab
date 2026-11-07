/*
 * store — transiciones puras del estado de la página. El estado tiene la forma de core/urlstate
 * (v, ex, t, step, view, lang, nota, box, mode, pred, wi); app lo escribe en la URL tras cada cambio.
 * reduce(state, action, total) nunca muta el estado recibido y solo acepta valores de la lista blanca.
 */
(function (root) {
  'use strict';

  const isNode = typeof module !== 'undefined' && module.exports;
  const U = isNode ? require('./core/urlstate.js') : root.PNL.urlstate;

  const SETTABLE = {
    view: ['net', 'matrix'], lang: ['es', 'en'], nota: ['en', 'es'], box: ['4', '7', 'c'], mode: ['pred', 'succ'], pred: [0, 1],
  };
  const clamp = (n, total) => Math.max(0, Math.min(Number.isInteger(n) ? n : 0, Math.max(0, total - 1)));

  function reduce(state, action, total) {
    const s = Object.assign({}, state);
    switch (action.type) {
      case 'next': s.step = clamp(s.step + 1, total); break;
      case 'prev': s.step = clamp(s.step - 1, total); break;
      case 'first': s.step = 0; break;
      case 'go': s.step = clamp(action.n, total); break;
      case 'set':
        if (Object.prototype.hasOwnProperty.call(SETTABLE, action.key) && SETTABLE[action.key].includes(action.value)) s[action.key] = action.value;
        break;
      case 'route': s.v = 'route'; s.step = 0; break;
      case 'work':
        s.v = 'work'; s.ex = null; s.step = 0; s.wi = null;
        s.t = (action.rows || []).map((r) => Object.assign({}, r));
        if (SETTABLE.mode.includes(action.mode)) s.mode = action.mode;
        break;
      case 'example':
        if (U.EXAMPLES.includes(action.id)) { s.ex = action.id; s.t = null; s.step = 0; s.wi = null; }
        break;
      case 'table':
        s.t = (action.rows || []).map((r) => Object.assign({}, r)); s.ex = null; s.wi = null;
        s.step = clamp(s.step, action.total == null ? total : action.total);
        break;
      case 'whatif': {
        const others = (s.wi || []).filter(([id]) => id !== action.id);
        const d = Number(action.d);
        s.wi = action.d == null || !(d >= 0) ? (others.length ? others : null) : [...others, [action.id, d]];
        break;
      }
      default: break;
    }
    return s;
  }

  const api = { reduce };
  root.PNL = root.PNL || {};
  root.PNL.store = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
