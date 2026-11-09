/*
 * store — transiciones puras del estado de la página. El estado tiene la forma de core/urlstate
 * (v, ex, t, step, view, lang, nota, box, mode, pred, wi, graph, min y, en la F2b, m, ms, pair y sn); app lo escribe en
 * la URL tras cada cambio.
 * reduce(state, action, total) nunca muta el estado recibido y solo acepta valores de la lista blanca.
 */
(function (root) {
  'use strict';

  const isNode = typeof module !== 'undefined' && module.exports;
  const U = isNode ? require('./core/urlstate.js') : root.PNL.urlstate;

  const SETTABLE = {
    view: ['net', 'matrix', 'side', 'cmp', 'reto'], m: ['rules', 'prog'], lang: ['es', 'en'], nota: ['en', 'es'], box: ['4', '7', 'c'], mode: ['pred', 'succ'], pred: [0, 1], min: [0, 1],
  };
  // La matriz es de la red ROY y la vista lado a lado, de la PERT (F2a, plan §3).
  const VIEW_OK = { aon: ['net', 'matrix'], aoa: ['net', 'side', 'cmp', 'reto'] };   // el comparador y el reto también son de la PERT (F2b)
  const structureOnly = (s) => !s.t && U.STRUCTURE_ONLY.includes(s.ex);
  const clamp = (n, total) => Math.max(0, Math.min(Number.isInteger(n) ? n : 0, Math.max(0, total - 1)));

  function reduce(state, action, total) {
    const s = Object.assign({}, state);
    switch (action.type) {
      case 'next': s.step = clamp(s.step + 1, total); break;
      case 'prev': s.step = clamp(s.step - 1, total); break;
      case 'first': s.step = 0; break;
      case 'go': s.step = clamp(action.n, total); break;
      case 'set':
        if (Object.prototype.hasOwnProperty.call(SETTABLE, action.key) && SETTABLE[action.key].includes(action.value)
          && (action.key !== 'view' || VIEW_OK[s.graph || 'aon'].includes(action.value))) s[action.key] = action.value;
        break;
      // F2b: métodos visibles del comparador (al menos uno, sin repetir) y par lado a lado (dos distintos o null).
      case 'methods': {
        const v = Array.isArray(action.value) ? action.value : [];
        const ms = U.METHODS.filter((m) => v.includes(m));
        if (ms.length && ms.length === v.length) s.ms = ms;
        break;
      }
      case 'pair': {
        const p = action.value;
        if (p === null) s.pair = null;
        else if (Array.isArray(p) && p.length === 2 && p[0] !== p[1] && p.every((m) => U.METHODS.includes(m))) s.pair = p.slice();
        break;
      }
      // F2b: la red del alumno del reto (la ajusta js/reto a la tabla); null es la de partida.
      case 'sn': {
        const v = action.value;
        if (v === null) s.sn = null;
        else if (v && ['events', 'arcs', 'dummies'].every((k) => Array.isArray(v[k]))) s.sn = v;
        break;
      }
      case 'graph':
        // Cambiar de red cambia de traza: app calcula el paso equivalente (equivalentStep) y lo pasa aquí.
        if (!VIEW_OK[action.value] || (action.value === 'aon' && structureOnly(s))) break;
        s.graph = action.value;
        if (!VIEW_OK[s.graph].includes(s.view)) s.view = 'net';
        s.step = Number.isInteger(action.step) && action.step >= 0 ? action.step : 0;
        break;
      case 'route': s.v = 'route'; s.step = 0; break;
      case 'work':
        s.v = 'work'; s.ex = null; s.step = 0; s.wi = null;
        s.t = (action.rows || []).map((r) => Object.assign({}, r));
        if (SETTABLE.mode.includes(action.mode)) s.mode = action.mode;
        break;
      case 'example':
        if (U.EXAMPLES.includes(action.id)) {
          s.ex = action.id; s.t = null; s.step = 0; s.wi = null; s.sn = null;
          if (structureOnly(s) && s.graph !== 'aoa') { s.graph = 'aoa'; if (s.view === 'matrix') s.view = 'net'; }
        }
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

  // Paso equivalente al cambiar de red (plan §4): en la tabla o la construcción, el paso 0 de la otra; con todos
  // los tiempos ya revelados (pasada hacia atrás terminada), su camino crítico; en cualquier otro caso, el paso 0.
  const BACKWARD = ['backward', 'eventBackward'];
  function equivalentStep(from, k, to) {
    let lastBack = -1;
    from.forEach((st, i) => { if (BACKWARD.includes(st.kind)) lastBack = i; });
    if (lastBack < 0 || k < lastBack) return 0;
    const crit = to.findIndex((st) => st.kind === 'critical');
    return crit >= 0 ? crit : to.length - 1;
  }

  const api = { reduce, equivalentStep };
  root.PNL = root.PNL || {};
  root.PNL.store = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
