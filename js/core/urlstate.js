/*
 * core/urlstate — el estado completo de la página en el #hash (spec AC8 y AC19).
 * decode() usa una lista blanca: parámetros desconocidos se ignoran, valores fuera de rango vuelven
 * a su valor por defecto y nada de lo que llega en la URL se evalúa ni se inserta como HTML
 * (constitución, principio 22). La tabla del taller viaja tal como se escribió, aunque tenga errores,
 * para que recargar no la pierda.
 */
(function (root) {
  'use strict';

  const EXAMPLES = ['ej6', 'roy10', 'roy6', 'klastorin', 'hillier', 'ej4'];
  const ENUMS = {
    v: ['route', 'work'], view: ['net', 'matrix'], lang: ['es', 'en'], nota: ['en', 'es'],
    box: ['4', '7', 'c'], mode: ['pred', 'succ'], pred: ['0', '1'],
  };
  const KEYS = ['v', 'ex', 't', 'step', 'view', 'lang', 'nota', 'box', 'mode', 'pred', 'wi'];
  const LIMITS = { hash: 8000, rows: 40, id: 8, duration: 12, links: 200, name: 80, step: 999 };
  const ID_RE = /^[A-Za-z0-9]{1,4}$/;

  function defaults() {
    return { v: 'route', ex: 'ej6', t: null, step: 0, view: 'net', lang: null, nota: 'en', box: '7', mode: 'pred', pred: 0, wi: null };
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

  function encode(state) {
    const s = Object.assign(defaults(), state);
    const q = new URLSearchParams();
    q.set('v', s.v);
    if (s.t) q.set('t', encodeTable(s.t)); else if (s.ex) q.set('ex', s.ex);
    q.set('step', String(s.step));
    q.set('view', s.view);
    if (s.lang) q.set('lang', s.lang);
    q.set('nota', s.nota);
    q.set('box', s.box);
    q.set('mode', s.mode);
    q.set('pred', String(s.pred));
    if (s.wi && s.wi.length) q.set('wi', s.wi.map(([id, d]) => `${id}:${d}`).join(';'));
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
      if (ENUMS[key].includes(val)) state[key] = key === 'pred' ? Number(val) : val;
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
    const out = { state };
    if (malformed) out.warning = 'malformed'; else if (unknown) out.warning = 'unknownParam';
    return out;
  }

  const api = { EXAMPLES, LIMITS, defaults, encode, decode };
  root.PNL = root.PNL || {};
  root.PNL.urlstate = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
