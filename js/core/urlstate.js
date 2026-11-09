/*
 * core/urlstate — el estado completo de la página en el #hash (spec AC8 y AC19).
 * decode() usa una lista blanca: parámetros desconocidos se ignoran, valores fuera de rango vuelven
 * a su valor por defecto y nada de lo que llega en la URL se evalúa ni se inserta como HTML
 * (constitución, principio 22). La tabla del taller viaja tal como se escribió, aunque tenga errores,
 * para que recargar no la pierda.
 */
(function (root) {
  'use strict';

  // Los cuatro últimos son las tablas de las fuentes de la F2b: se abren por la URL aunque aún no salgan en la lista.
  const EXAMPLES = ['ej6', 'roy10', 'roy6', 'klastorin', 'hillier', 'ej4', 'ej7', 'ej1', 'ej2', 'ej3', 'kim2008', 'cs2007', 'syslo1981', 'tipo'];
  // Ejemplos solo de estructura (sin duraciones): no tienen red ROY, así que se abren siempre en PERT.
  const STRUCTURE_ONLY = ['ej1', 'ej2', 'ej3', 'kim2008', 'cs2007', 'syslo1981', 'tipo'];
  const ENUMS = {
    v: ['route', 'work'], view: ['net', 'matrix', 'side', 'cmp', 'reto'], m: ['rules', 'prog'], lang: ['es', 'en'], nota: ['en', 'es'],
    box: ['4', '7', 'c'], mode: ['pred', 'succ'], pred: ['0', '1'], graph: ['aon', 'aoa'], min: ['0', '1'],
  };
  const KEYS = ['v', 'ex', 't', 'step', 'view', 'lang', 'nota', 'box', 'mode', 'pred', 'wi', 'graph', 'min', 'm', 'ms', 'pair', 'sn', 'sp'];
  // F2b: métodos del comparador (los mismos que core/compare) y límites de la red del alumno.
  const METHODS = ['prog', 'rules', 'cs', 'kim', 'spinrad', 'cgl', 'min'];
  const DEFAULT_MS = ['prog', 'rules', 'min'];
  const SN = { events: 100, id: /^\d{1,3}$/, n: /^\d{0,3}$/, pos: /^\d{1,4}$/ };
  const LIMITS = { hash: 8000, rows: 40, id: 8, duration: 12, links: 200, name: 80, step: 999 };
  const ID_RE = /^[A-Za-z0-9]{1,4}$/;
  const ID_UPPER = /^[A-Z0-9]{1,4}$/;

  function defaults() {
    return { v: 'route', ex: 'ej6', t: null, step: 0, view: 'net', lang: null, nota: 'en', box: '7', mode: 'pred', pred: 0, wi: null, graph: 'aon', min: 0, m: 'rules', ms: DEFAULT_MS.slice(), pair: null, sn: null };
  }

  const enc = (s) => encodeURIComponent(String(s == null ? '' : s));
  const cut = (s, n) => String(s == null ? '' : s).slice(0, n);

  function encodeTable(rows) {
    return rows.slice(0, LIMITS.rows).map((r) => [
      cut(r.id, LIMITS.id), cut(r.duration, LIMITS.duration), cut(r.links, LIMITS.links), cut(r.name, LIMITS.name),
    ].map(enc).join(',')).join(';');
  }

  function decodeTable(text) {
    return text.split(';').slice(0, LIMITS.rows).map((line) => {
      const f = line.split(',').map((x) => decodeURIComponent(x));
      return { id: cut(f[0], LIMITS.id), name: cut(f[3], LIMITS.name), duration: cut(f[1], LIMITS.duration), links: cut(f[2], LIMITS.links) };
    });
  }

  // Red del alumno (F2b, plan §3): «sucesos|arcos|ficticias» con sucesos «id.n» (n vacío si no tiene número),
  // arcos «ACT:origen-destino» y ficticias «origen-destino» (extremos vacíos si están a medias); posiciones
  // aparte, en sp, como «id:x.y».
  const end = (v) => (v === null || v === undefined ? '' : String(v));
  function encodeNet(net) {
    const sn = [
      net.events.map((e) => `${e.id}.${end(e.n)}`).join(','),
      net.arcs.map((e) => `${e.act}:${end(e.from)}-${end(e.to)}`).join(','),
      net.dummies.map((d) => `${end(d.from)}-${end(d.to)}`).join(','),
    ].join('|');
    const pos = net.events.filter((e) => e.x !== undefined && e.y !== undefined);
    return { sn, sp: pos.length ? pos.map((e) => `${e.id}:${e.x}.${e.y}`).join(',') : null };
  }

  function decodeNet(sn, sp) {
    const parts = sn.split('|');
    if (parts.length !== 3) return null;
    const list = (x) => (x === '' ? [] : x.split(','));
    const events = [];
    const ids = new Set();
    for (const item of list(parts[0])) {
      const [id, n, extra] = item.split('.');
      if (extra !== undefined || !SN.id.test(id) || n === undefined || !SN.n.test(n) || ids.has(Number(id))) return null;
      ids.add(Number(id));
      events.push({ id: Number(id), n: n === '' ? null : Number(n) });
    }
    if (events.length > SN.events) return null;
    const ref = (x) => (x === '' ? null : SN.id.test(x) && ids.has(Number(x)) ? Number(x) : undefined);
    const ends = (txt) => { const m = txt.match(/^(\d*)-(\d*)$/); if (!m) return null; const a = ref(m[1]); const b = ref(m[2]); return a === undefined || b === undefined ? null : [a, b]; };
    const arcs = [];
    for (const item of list(parts[1])) {
      const m = item.match(/^([^:]+):(.*)$/);
      if (!m || !ID_UPPER.test(m[1])) return null;
      const e = ends(m[2]); if (!e) return null;
      arcs.push({ act: m[1], from: e[0], to: e[1] });
    }
    if (arcs.length > LIMITS.rows) return null;
    const dummies = [];
    for (const item of list(parts[2])) { const e = ends(item); if (!e) return null; dummies.push({ from: e[0], to: e[1] }); }
    if (dummies.length > SN.events) return null;
    if (sp !== null) {
      for (const item of list(sp)) {
        const m = item.match(/^(\d{1,3}):(\d+)\.(\d+)$/);
        if (!m || !ids.has(Number(m[1])) || !SN.pos.test(m[2]) || !SN.pos.test(m[3])) return null;
        const ev = events.find((e) => e.id === Number(m[1]));
        ev.x = Number(m[2]); ev.y = Number(m[3]);
      }
    }
    return { events, arcs, dummies };
  }

  function encode(state) {
    const s = Object.assign(defaults(), state);
    const q = new URLSearchParams();
    q.set('v', s.v);
    // graph y min solo se escriben si no valen lo de siempre: los enlaces de la fase 1 no cambian (F2a, P4).
    if (s.graph === 'aoa') q.set('graph', 'aoa');
    if (s.t) q.set('t', encodeTable(s.t)); else if (s.ex) q.set('ex', s.ex);
    q.set('step', String(s.step));
    q.set('view', s.view);
    if (s.lang) q.set('lang', s.lang);
    q.set('nota', s.nota);
    q.set('box', s.box);
    q.set('mode', s.mode);
    q.set('pred', String(s.pred));
    if (s.wi && s.wi.length) q.set('wi', s.wi.map(([id, d]) => `${id}:${d}`).join(';'));
    if (s.min) q.set('min', '1');
    // F2b: solo si no valen lo de siempre (los enlaces de la F1 y la F2a no cambian).
    if (s.m === 'prog') q.set('m', 'prog');
    if (s.ms && s.ms.join() !== DEFAULT_MS.join()) q.set('ms', s.ms.join(','));
    if (s.pair) q.set('pair', s.pair.join(','));
    if (s.sn) {
      const { sn, sp } = encodeNet(s.sn);
      q.set('sn', sn);
      if (sp) q.set('sp', sp);
    }
    return '#' + q.toString();
  }

  function decode(hash) {
    const state = defaults();
    let raw = String(hash || '');
    if (raw.startsWith('#')) raw = raw.slice(1);
    if (!raw) return { state };
    if (raw.length > LIMITS.hash) return { state, warning: 'malformed' };

    let malformed = false;
    let unknown = false;
    let q;
    try { q = new URLSearchParams(raw); } catch { return { state, warning: 'malformed' }; }

    for (const key of q.keys()) if (!KEYS.includes(key)) unknown = true;

    for (const key of Object.keys(ENUMS)) {
      if (!q.has(key)) continue;
      const val = q.get(key);
      if (ENUMS[key].includes(val)) state[key] = key === 'pred' || key === 'min' ? Number(val) : val;
      else malformed = true;
    }
    if (q.has('step')) {
      const v = q.get('step');
      const n = /^\d{1,3}$/.test(v) ? Number(v) : NaN;
      if (Number.isInteger(n) && n <= LIMITS.step) state.step = n; else malformed = true;
    }
    if (q.has('t')) {
      try { state.t = decodeTable(q.get('t')); state.ex = null; }
      catch { malformed = true; state.t = null; state.v = 'route'; state.ex = 'ej6'; }
    } else if (q.has('ex')) {
      if (EXAMPLES.includes(q.get('ex'))) state.ex = q.get('ex'); else malformed = true;
    }
    if (q.has('wi')) {
      // Como mucho un par por fila y duraciones de la misma longitud que en la tabla (revisión, F15).
      const pairs = [];
      const parts = q.get('wi').split(';');
      if (parts.length > LIMITS.rows) malformed = true;
      for (const part of parts.slice(0, LIMITS.rows)) {
        const m = part.match(/^([^:]+):(\d+(?:\.\d+)?)$/);
        if (m && ID_RE.test(m[1]) && m[2].length <= LIMITS.duration) pairs.push([m[1].toUpperCase(), Number(m[2])]); else malformed = true;
      }
      state.wi = pairs.length ? pairs : null;
    }
    // F2b: métodos visibles, par lado a lado y red del alumno.
    if (q.has('ms')) {
      const ms = q.get('ms').split(',');
      if (ms.length && ms.length <= METHODS.length && ms.every((x) => METHODS.includes(x)) && new Set(ms).size === ms.length) state.ms = ms;
      else malformed = true;
    }
    if (q.has('pair')) {
      const pair = q.get('pair').split(',');
      if (pair.length === 2 && pair.every((x) => METHODS.includes(x)) && pair[0] !== pair[1]) state.pair = pair; else malformed = true;
    }
    if (q.has('sn')) {
      const net = decodeNet(q.get('sn'), q.has('sp') ? q.get('sp') : null);
      if (net) state.sn = net; else malformed = true;
    }
    // El comparador y el reto son de la red PERT (F2b, plan §3).
    if ((state.view === 'cmp' || state.view === 'reto') && state.graph !== 'aoa') { state.view = 'net'; malformed = true; }
    // La matriz es de la red ROY y la vista lado a lado, de la PERT (F2a, plan §3).
    if ((state.view === 'matrix' && state.graph === 'aoa') || (state.view === 'side' && state.graph === 'aon')) {
      state.view = 'net'; malformed = true;
    }
    // Un ejemplo solo de estructura no tiene red ROY, así que tampoco vista lado a lado (revisión de cierre, F2).
    if (!state.t && STRUCTURE_ONLY.includes(state.ex) && state.view === 'side') { state.view = 'net'; malformed = true; }
    let structure = false;
    if (!state.t && STRUCTURE_ONLY.includes(state.ex) && state.graph === 'aon') {
      state.graph = 'aoa'; structure = true;
      if (state.view === 'matrix') state.view = 'net';
    }
    const out = { state };
    if (malformed) out.warning = 'malformed'; else if (unknown) out.warning = 'unknownParam'; else if (structure) out.warning = 'structureOnly';
    return out;
  }

  const api = { EXAMPLES, STRUCTURE_ONLY, METHODS, LIMITS, defaults, encode, decode };
  root.PNL = root.PNL || {};
  root.PNL.urlstate = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
