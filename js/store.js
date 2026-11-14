/*
 * store — transiciones puras del estado de la página. El estado tiene la forma de core/urlstate
 * (v, ex, t, step, view, lang, nota, box, mode, pred, wi, graph, min y, en la F2b, m, ms, pair y sn; en la F2c, st, own, mk, tv,
 * mm y sol; en la F3a, sd, lv, gp, ask, xm, ans, xd y gv; en la F4a, um, ue, ut, ua, uc, ux, ud, up, uk y us); app lo escribe en
 * la URL tras cada cambio.
 * reduce(state, action, total) nunca muta el estado recibido y solo acepta valores de la lista blanca.
 */
(function (root) {
  'use strict';

  const isNode = typeof module !== 'undefined' && module.exports;
  const U = isNode ? require('./core/urlstate.js') : root.PNL.urlstate;

  const SETTABLE = {
    view: ['net', 'matrix', 'side', 'cmp', 'reto'], m: ['rules', 'prog'], lang: ['es', 'en'], nota: ['en', 'es'], box: ['4', '7', 'c'], mode: ['pred', 'succ'], pred: [0, 1], min: [0, 1],
    tv: ['list', 'matrix'], mm: ['practice', 'route', 'prepare'], sol: [0, 1],   // F2c: M0
  };
  // La matriz es de la red ROY y la vista lado a lado, de la PERT (F2a, plan §3).
  const VIEW_OK = { aon: ['net', 'matrix'], aoa: ['net', 'side', 'cmp', 'reto'] };   // el comparador y el reto también son de la PERT (F2b)
  const structureOnly = (s) => !s.t && U.STRUCTURE_ONLY.includes(s.ex);
  // F4a: al cambiar de proyecto, el plazo vuelve al del proyecto y la probabilidad, si se pedía, al 95 %.
  const resetAsk = (s) => { s.ud = null; if (typeof s.up === 'number') s.up = 0.95; };
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
      // F2c: M0 con un enunciado de la herramienta, o con uno propio si llega su definición; tabla y subrayados vacíos.
      case 'm0': {
        const own = action.st === 'own' && action.own && typeof action.own.text === 'string';
        s.v = 'm0'; s.ex = null; s.step = 0; s.t = null; s.mk = null; s.wi = null; s.sol = 0;
        // Con un enunciado propio pueden llegar su tabla, sus subrayados y su forma (preparar; abrir con la solución).
        if (own) {
          s.st = 'own'; s.own = action.own; s.cx = null; s.sv = null;
          if (Array.isArray(action.rows) && action.rows.length) s.t = action.rows.map((r) => Object.assign({}, r));
          if (Array.isArray(action.marks) && action.marks.length) s.mk = U.cleanMarks(action.marks);
          if (SETTABLE.mode.includes(action.mode)) s.mode = action.mode;
        } else if (action.st === 'gen') {
          // F3c (plan §4, P7): el enunciado al azar, por su semilla, nivel (uno de los tres), contexto y versión.
          s.own = null; s.st = 'gen';
          if (Number.isInteger(action.sd) && action.sd >= 1 && action.sd <= U.EX.seed) s.sd = action.sd;
          // Lo que no llega (la entrada desde la pestaña) se conserva; el nivel, siempre uno de los tres.
          const lv = action.lv !== undefined ? action.lv : s.lv;
          s.lv = ['easy', 'medium', 'hard'].includes(lv) ? lv : 'medium';
          if (action.cx !== undefined) s.cx = ['home', 'product', 'congress', 'lab'].includes(action.cx) ? action.cx : null;
          if (action.sv !== undefined) s.sv = Number.isInteger(action.sv) && action.sv >= 1 ? action.sv : null;
        } else {
          s.own = null; s.cx = null; s.sv = null;
          if (U.STATEMENTS.includes(action.st)) s.st = action.st; else if (!U.STATEMENTS.includes(s.st)) s.st = U.DEFAULT_ST;
        }
        s.mm = SETTABLE.mm.includes(action.mm) ? action.mm : 'practice';
        break;
      }
      case 'marks': {
        if (action.value === null || (Array.isArray(action.value) && !action.value.length)) { s.mk = null; break; }
        const mk = U.cleanMarks(action.value);
        if (mk) s.mk = mk;
        break;
      }
      // F2c: la tabla depurada de M0 se abre en la ruta (ROY o PERT) o en el taller, desde el principio (AC15).
      case 'open':
        if (!['route', 'work'].includes(action.v) || !VIEW_OK[action.graph]) break;
        s.v = action.v; s.graph = action.graph; s.ex = null; s.step = 0; s.wi = null; s.view = 'net'; s.min = 0; s.m = 'rules'; s.sn = null;
        s.t = (action.rows || []).map((r) => Object.assign({}, r));
        if (SETTABLE.mode.includes(action.mode)) s.mode = action.mode;
        break;
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
      // F3a: ejercicio nuevo (semilla, nivel, parámetros, qué se pide, modo): sin respuestas, sin entregar.
      case 'ex': {
        s.v = 'ex'; s.ex = null; s.t = null; s.step = 0; s.wi = null; s.ans = null; s.xd = 0; s.gv = null;
        if (Number.isInteger(action.sd) && action.sd >= 1 && action.sd <= U.EX.seed) s.sd = action.sd;
        if (['easy', 'medium', 'hard'].includes(action.lv)) { s.lv = action.lv; s.gp = null; }
        else if (action.lv === 'custom') { const gp = U.cleanGp(action.gp); if (gp) { s.lv = 'custom'; s.gp = gp; } }
        if (action.ask !== undefined) { const ask = U.cleanAsk(action.ask); if (ask) s.ask = ask; }
        if (['practice', 'exam'].includes(action.xm)) s.xm = action.xm;
        if (s.lv === 'custom') s.xt = 0;   // F3c (P8): con «Personalizar» no hay enunciado
        s.sv = U.STMT_VERSION;   // un ejercicio nuevo es de la versión actual (como gv; revisión de la F3c, ronda 2, F2)
        break;
      }
      // F3c (T010): dar el proyecto como enunciado; no cambia el ejercicio ni las respuestas.
      // Al ponerlo, el enunciado es de la versión actual; si ya estaba puesto (enlace de otra versión), se conserva la suya.
      case 'exText': {
        const on = action.value && s.lv !== 'custom' ? 1 : 0;
        if (on && !s.xt) s.sv = U.STMT_VERSION;
        s.xt = on;
        break;
      }
      case 'exAnswer':
        if (s.xd) break;
        if (action.ans === null) { s.ans = null; break; }
        { const a = U.cleanAns(action.ans); if (a || !action.ans) s.ans = a; }
        break;
      case 'exDeliver': if (s.xm === 'exam') s.xd = 1; break;
      // F4a (plan f4a-tres-tiempos-tcl, §3): la pestaña de tres tiempos y el TCL. Solo se aceptan valores válidos; cambiar de
      // apartado, proyecto, actividad, caso, plazo, probabilidad o deslizadores vuelve al paso 0. El ejemplo de la ruta y la
      // tabla del taller se conservan para volver a ellos. Otro proyecto vuelve a su plazo por defecto y, si se pedía el
      // plazo para una probabilidad, al 95 % (decisión del autor, revisión F4a, F13).
      case 'unc': {
        const sig = () => [s.v, s.um, s.ue, s.ua, s.ux, s.ud, s.up, JSON.stringify(s.uk), s.uw, s.ug, JSON.stringify(s.uf), JSON.stringify(s.uq), s.ur, s.us, s.uy].join('|');
        const before = sig();
        const ue0 = s.ue;
        s.v = 'unc';
        const V = U.UNC;
        if (['m5', 'm6', 'm7'].includes(action.um)) s.um = action.um;
        if (['kl', 'hl', 'tr', 'pa'].includes(action.ue) || V.M7_ONLY.includes(action.ue) || (action.ue === 'own' && s.ut)) s.ue = action.ue;
        if (s.um === 'm5' && V.M6_ONLY.includes(s.ue)) s.ue = 'kl';
        if (s.um !== 'm7' && V.M7_ONLY.includes(s.ue)) s.ue = 'kl';   // F4b: los ejemplos discretos, solo en M7
        if (s.um === 'm7' && V.M6_ONLY.includes(s.ue)) s.ue = 'kl';
        if (s.ue !== ue0) { resetAsk(s); s.uf = null; s.uq = null; }   // F4b: las distribuciones propias son de cada proyecto
        // F4b (plan §3): M7.
        if (['pert', 'classic', 'tri', 'unif', 'norm', 'logn'].includes(action.ug)) s.ug = action.ug;
        if (action.uf !== undefined) { const uf = V.cleanUf(action.uf); if (uf || action.uf === null) s.uf = uf; }
        if (action.uq !== undefined) { const uq = V.cleanUq(action.uq); if (uq || action.uq === null) s.uq = uq; }
        if ([2, 3, 4, 5].includes(action.ur)) s.ur = action.ur;
        if (V.pctOk(action.uv)) s.uv = action.uv;
        if (['p', 's'].includes(action.uo)) s.uo = action.uo;
        if (['dist', 'idx', 'rep', 'conv'].includes(action.uy)) s.uy = action.uy;
        if (['cr', 'cu', 'si'].includes(action.ui)) s.ui = action.ui;
        if (action.ua === null || V.actOk(action.ua)) s.ua = action.ua;
        if (action.uc === 0 || action.uc === 1) s.uc = action.uc;
        if (action.uw === 0 || action.uw === 1) s.uw = action.uw;   // T011: paso a paso
        if (['exam', 'merge', 'few', 'skew', 'corr', 'proj'].includes(action.ux)) s.ux = action.ux;
        if (action.ud === null || V.deadlineOk(action.ud)) s.ud = action.ud;
        if (action.up === null || V.probOk(action.up)) s.up = action.up;
        if (action.uk !== undefined) { const uk = V.cleanUk(action.uk); if (uk || action.uk === null) s.uk = uk; }
        if (V.seedOk(action.us)) s.us = action.us;
        if (sig() !== before) s.step = 0;
        break;
      }
      // F4a (AC12): partir del taller copia la estructura con a = m = b = duración; el taller no cambia (A8: tal cual).
      case 'uncFromWork': {
        const ut = U.UNC.cleanUt({ mode: action.mode, rows: (action.rows || []).map((r) => ({ id: r.id, name: r.name || '',
          a: r.duration, m: r.duration, b: r.duration, links: r.links })) });
        if (!ut) break;
        Object.assign(s, { v: 'unc', ue: 'own', ut, ua: null, step: 0 });
        resetAsk(s);
        break;
      }
      case 'uncTable': {
        const ut = U.UNC.cleanUt({ mode: action.mode, rows: action.rows });
        if (ut) { if (s.ue !== 'own') resetAsk(s); Object.assign(s, { ue: 'own', ut }); }
        break;
      }
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
