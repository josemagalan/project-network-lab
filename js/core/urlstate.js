/*
 * core/urlstate — el estado completo de la página en el #hash (spec AC8 y AC19).
 * decode() usa una lista blanca: parámetros desconocidos se ignoran, valores fuera de rango vuelven
 * a su valor por defecto y nada de lo que llega en la URL se evalúa ni se inserta como HTML
 * (constitución, principio 22). La tabla del taller viaja tal como se escribió, aunque tenga errores,
 * para que recargar no la pierda.
 */
(function (root) {
  'use strict';

  const isNode = typeof module !== 'undefined' && module.exports;
  // textpack solo hace falta para el enunciado propio de M0; se busca al usarlo (F2c, plan P5).
  const textpack = () => (isNode ? require('./textpack.js') : (root.PNL && root.PNL.textpack) || null);

  // Los cuatro últimos son las tablas de las fuentes de la F2b: se abren por la URL aunque aún no salgan en la lista.
  const EXAMPLES = ['ej6', 'roy10', 'roy6', 'klastorin', 'hillier', 'ej4', 'ej7', 'ej1', 'ej2', 'ej3', 'kim2008', 'cs2007', 'syslo1981', 'tipo'];
  // Ejemplos solo de estructura (sin duraciones): no tienen red ROY, así que se abren siempre en PERT.
  const STRUCTURE_ONLY = ['ej1', 'ej2', 'ej3', 'kim2008', 'cs2007', 'syslo1981', 'tipo'];
  const ENUMS = {
    v: ['route', 'work', 'm0', 'ex', 'moodle'], view: ['net', 'matrix', 'side', 'cmp', 'reto'], m: ['rules', 'prog'], lang: ['es', 'en'], nota: ['en', 'es'],
    box: ['4', '7', 'c'], mode: ['pred', 'succ'], pred: ['0', '1'], graph: ['aon', 'aoa'], min: ['0', '1'],
    tv: ['list', 'matrix'], mm: ['practice', 'route', 'prepare'], sol: ['0', '1'],
    lv: ['easy', 'medium', 'hard', 'custom'], xm: ['practice', 'exam'], xd: ['0', '1'],   // F3a: «Ejercicios»
  };
  const NUMERIC = ['pred', 'min', 'sol', 'xd'];
  const KEYS = ['v', 'ex', 't', 'step', 'view', 'lang', 'nota', 'box', 'mode', 'pred', 'wi', 'graph', 'min', 'm', 'ms', 'pair', 'sn', 'sp', 'st', 'own', 'mk', 'tv', 'mm', 'sol', 'sd', 'lv', 'gp', 'ask', 'xm', 'ans', 'xd', 'gv'];
  // F2c: enunciados de M0 (core/statements) y límites de los subrayados y del enunciado propio.
  const STATEMENTS = ['ej1', 'ej2', 'ej3', 'ej4', 'ej5', 'ej6', 'ej7', 'cocina', 'congreso', 'mudanza', 'lanzamiento'];
  const DEFAULT_ST = 'ej5';
  const MK = { marks: 200, idx: /^\d{1,4}$/, gives: 60, value: /^\d{1,6}(\.\d{1,4})?$/ };
  const OWN = { text: 3000, frags: 200, packed: 20000 };
  const KIND_CODE = { activity: 'a', duration: 'd', precedence: 'p', none: 'n', start: 's', end: 'e' };
  const CODE_KIND = Object.fromEntries(Object.entries(KIND_CODE).map(([k, v]) => [v, k]));
  // F2b: métodos del comparador (los mismos que core/compare) y límites de la red del alumno.
  const METHODS = ['prog', 'rules', 'cs', 'kim', 'spinrad', 'cgl', 'min'];
  const DEFAULT_MS = ['prog', 'rules', 'min'];
  const SN = { events: 100, id: /^\d{1,3}$/, n: /^\d{0,3}$/, pos: /^\d{1,4}$/ };
  const LIMITS = { hash: 8000, rows: 40, id: 8, duration: 12, links: 200, name: 80, step: 999, ownText: OWN.text };
  const ID_RE = /^[A-Za-z0-9]{1,4}$/;
  const ID_UPPER = /^[A-Z0-9]{1,4}$/;
  // F3a: «Ejercicios» (plan f3a-generador-calculo, §3). Letras de ask en el orden de core/grade.ASK.
  const ASK = ['times', 'events', 'floats', 'sf', 'critical'];
  const ASK_CODE = { times: 't', events: 'e', floats: 'f', sf: 's', critical: 'c' };
  const DEFAULT_ASK = ['times', 'floats', 'critical'];
  const EX = { seed: 999999, acts: 30, events: 60, value: 8, paths: 10, path: 120, packed: 20000 };
  const ACT_FIELDS = ['ES', 'EF', 'LS', 'LF', 'TF', 'FF', 'IF', 'SF'];
  const EV_FIELDS = ['TE', 'TL', 'slack'];

  function defaults() {
    return { v: 'route', ex: 'ej6', t: null, step: 0, view: 'net', lang: null, nota: 'en', box: '7', mode: 'pred', pred: 0, wi: null, graph: 'aon', min: 0, m: 'rules', ms: DEFAULT_MS.slice(), pair: null, sn: null,
      st: null, own: null, mk: null, tv: 'list', mm: 'practice', sol: 0,
      sd: null, lv: 'medium', gp: null, ask: DEFAULT_ASK.slice(), xm: 'practice', ans: null, xd: 0, gv: null };
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

  // Subrayados de M0 (y fragmentos del enunciado propio): «desde-hasta:tipo:act:valor:A<B+C<D:eD», sin los
  // campos vacíos del final; separados por comas.
  function cleanMarks(marks) {
    if (!Array.isArray(marks) || !marks.length || marks.length > MK.marks) return null;
    const out = [];
    for (const m of marks) {
      if (!m || !Number.isInteger(m.from) || !Number.isInteger(m.to) || m.from < 0 || m.to < m.from || m.to > 9999 || !KIND_CODE[m.kind]) return null;
      const c = { from: m.from, to: m.to, kind: m.kind };
      if (m.act !== undefined) { if (!ID_UPPER.test(m.act)) return null; c.act = m.act; }
      if (m.value !== undefined) { if (!MK.value.test(String(m.value))) return null; c.value = Number(m.value); }
      if (m.gives !== undefined) {
        if (!Array.isArray(m.gives) || m.gives.length > MK.gives || !m.gives.every((e) => Array.isArray(e) && e.length === 2 && e.every((x) => ID_UPPER.test(x)))) return null;
        c.gives = m.gives.map((e) => e.slice());
      }
      if (m.decl !== undefined) {
        if (!m.decl || !['start', 'end'].includes(m.decl.end) || !ID_UPPER.test(m.decl.act)) return null;
        c.decl = { end: m.decl.end, act: m.decl.act };
      }
      out.push(c);
    }
    return out;
  }

  function encodeMarks(marks) {
    return (marks || []).map((m) => {
      const f = [`${m.from}-${m.to}`, KIND_CODE[m.kind], m.act || '', m.value === undefined ? '' : String(m.value),
        m.gives ? m.gives.map((e) => e.join('<')).join('+') : '', m.decl ? `${m.decl.end[0]}${m.decl.act}` : ''];
      while (f.length > 2 && f[f.length - 1] === '') f.pop();
      return f.join(':');
    }).join(',');
  }

  // Devuelve la lista de marcas ([] si el texto está vacío) o null si algo no es válido.
  function decodeMarks(text) {
    if (text === '') return [];
    const items = text.split(',');
    if (items.length > MK.marks) return null;
    const marks = [];
    for (const item of items) {
      const f = item.split(':');
      if (f.length < 2 || f.length > 6) return null;
      const r = f[0].match(/^(\d{1,4})-(\d{1,4})$/);
      if (!r || !CODE_KIND[f[1]]) return null;
      const m = { from: Number(r[1]), to: Number(r[2]), kind: CODE_KIND[f[1]] };
      if (f[2]) m.act = f[2];
      if (f[3]) { if (!MK.value.test(f[3])) return null; m.value = Number(f[3]); }
      if (f[4]) m.gives = f[4].split('+').map((e) => e.split('<'));
      if (f[5]) { const d = f[5].match(/^([se])(.+)$/); if (!d) return null; m.decl = { end: d[1] === 's' ? 'start' : 'end', act: d[2] }; }
      marks.push(m);
    }
    return cleanMarks(marks);
  }

  const rowArr = (r) => [String(r.id == null ? '' : r.id), String(r.duration == null ? '' : r.duration), String(r.links == null ? '' : r.links), String(r.name == null ? '' : r.name)];
  const rowOk = (a) => Array.isArray(a) && a.length === 4 && a.every((x) => typeof x === 'string')
    && a[0].length <= LIMITS.id && a[1].length <= LIMITS.duration && a[2].length <= LIMITS.links && a[3].length <= LIMITS.name;

  // Las filas se recortan a los límites de la tabla, como en encodeTable, para que unpackOwn las acepte siempre
  // (revisión de la F2c, F1).
  const packRows = (rows) => rows.slice(0, LIMITS.rows).map((r) => {
    const a = rowArr(r);
    return [cut(a[0], LIMITS.id), cut(a[1], LIMITS.duration), cut(a[2], LIMITS.links), cut(a[3], LIMITS.name)];
  });

  // Enunciado propio: el enunciado, la tabla del alumno y sus subrayados en un solo paquete (puerta T002).
  function packOwn(s) {
    const o = s.own;
    const payload = [1, o.lang, o.text, encodeMarks(o.frags), o.ref ? o.ref.mode : null, o.ref ? packRows(o.ref.rows) : null,
      s.t ? packRows(s.t) : null, s.mode, s.mk ? encodeMarks(s.mk) : null];
    return textpack().compress(JSON.stringify(payload));
  }

  function unpackOwn(packed) {
    const tp = textpack();
    const json = tp ? tp.decompress(packed, { max: OWN.packed }) : null;
    if (json === null) return null;
    let a;
    try { a = JSON.parse(json); } catch { return null; }
    if (!Array.isArray(a) || a.length !== 9 || a[0] !== 1 || !['es', 'en'].includes(a[1]) || typeof a[2] !== 'string' || a[2].length > OWN.text) return null;
    if (typeof a[3] !== 'string') return null;
    const frags = decodeMarks(a[3]);
    if (frags === null || frags.length > OWN.frags) return null;
    let ref = null;
    if (a[4] !== null || a[5] !== null) {
      if (!['pred', 'succ'].includes(a[4]) || !Array.isArray(a[5]) || a[5].length > LIMITS.rows || !a[5].every(rowOk)) return null;
      ref = { mode: a[4], rows: a[5].map((r) => ({ id: r[0], duration: r[1], links: r[2], name: r[3] })) };
    }
    let t = null;
    if (a[6] !== null) {
      if (!Array.isArray(a[6]) || a[6].length > LIMITS.rows || !a[6].every(rowOk)) return null;
      t = a[6].map((r) => ({ id: r[0], name: r[3], duration: r[1], links: r[2] }));
    }
    if (!ENUMS.mode.includes(a[7])) return null;
    let mk = null;
    if (a[8] !== null) { if (typeof a[8] !== 'string') return null; mk = decodeMarks(a[8]); if (mk === null) return null; if (!mk.length) mk = null; }
    return { own: { lang: a[1], text: a[2], frags, ref }, t, mode: a[7], mk };
  }

  // ---------- F3a: «Ejercicios» ----------
  const seedOk = (x) => Number.isInteger(x) && x >= 1 && x <= EX.seed;
  const pairIn = (x, lo, hi) => Array.isArray(x) && x.length === 2 && x.every(Number.isInteger) && x[0] >= lo && x[0] <= x[1] && x[1] <= hi;
  // Parámetros de «Personalizar»: solo los límites de la forma (generator.check dice lo que es imposible).
  function cleanGp(gp) {
    if (!gp || typeof gp !== 'object') return null;
    const pred10 = Math.round(gp.pred * 10);
    if (!pairIn(gp.n, 4, 30) || typeof gp.pred !== 'number' || Math.abs(gp.pred * 10 - pred10) > 1e-9 || pred10 < 10 || pred10 > 30) return null;
    if (!(gp.dummies === null || pairIn(gp.dummies, 0, 30)) || !pairIn(gp.critical, 1, 3) || !(Number.isInteger(gp.dmax) && gp.dmax >= 2 && gp.dmax <= 30)) return null;
    return { n: gp.n.slice(), pred: pred10 / 10, dummies: gp.dummies ? gp.dummies.slice() : null, critical: gp.critical.slice(), dmax: gp.dmax };
  }
  const encodeGp = (g) => [`n${g.n[0]}-${g.n[1]}`, `p${Math.round(g.pred * 10)}`].concat(g.dummies ? [`f${g.dummies[0]}-${g.dummies[1]}`] : [])
    .concat([`c${g.critical[0]}-${g.critical[1]}`, `d${g.dmax}`]).join('.');
  function decodeGp(text) {
    const m = String(text).match(/^n(\d{1,2})-(\d{1,2})\.p(\d{2})(?:\.f(\d{1,2})-(\d{1,2}))?\.c(\d)-(\d)\.d(\d{1,2})$/);
    if (!m) return null;
    const n = (i) => Number(m[i]);
    return cleanGp({ n: [n(1), n(2)], pred: n(3) / 10, dummies: m[4] === undefined ? null : [n(4), n(5)], critical: [n(6), n(7)], dmax: n(8) });
  }
  // Lo que se pide: un subconjunto no vacío de ASK, en su orden; la holgura de seguridad solo con las holguras.
  function cleanAsk(ask) {
    if (!Array.isArray(ask) || !ask.length || !ask.every((x) => ASK.includes(x)) || new Set(ask).size !== ask.length) return null;
    const out = ASK.filter((x) => ask.includes(x) && (x !== 'sf' || ask.includes('floats')));
    return out.length ? out : null;
  }
  function decodeAsk(text) {
    const letters = String(text).split('');
    const codes = ASK.map((x) => ASK_CODE[x]);
    if (!letters.length || letters.some((c) => !codes.includes(c)) || new Set(letters).size !== letters.length) return null;
    if (letters.map((c) => codes.indexOf(c)).some((v, i, a) => i && v < a[i - 1])) return null;
    return cleanAsk(letters.map((c) => ASK[codes.indexOf(c)]));
  }
  const str8 = (v) => typeof v === 'string' && v.length <= EX.value;
  // Respuestas: { act: { id: { ES… SF } }, dur, ev: { n: { TE, TL, slack } }, crit: [id], paths: [texto] }, todo texto.
  function cleanAns(ans) {
    if (!ans || typeof ans !== 'object') return null;
    const act = ans.act || {};
    const ev = ans.ev || {};
    const crit = ans.crit || [];
    const paths = ans.paths || [];
    if (typeof act !== 'object' || Object.keys(act).length > EX.acts || typeof ev !== 'object' || Object.keys(ev).length > EX.events) return null;
    if (!Array.isArray(crit) || crit.length > EX.acts || !crit.every((x) => typeof x === 'string' && ID_UPPER.test(x))) return null;
    if (!Array.isArray(paths) || paths.length > EX.paths || !paths.every((x) => typeof x === 'string' && x.length <= EX.path)) return null;
    if (!(ans.dur === undefined || ans.dur === null || str8(ans.dur))) return null;
    const out = { act: {}, dur: ans.dur == null ? '' : ans.dur, ev: {}, crit: crit.slice(), paths: paths.slice() };
    for (const [id, f] of Object.entries(act)) {
      if (!ID_UPPER.test(id) || !f || typeof f !== 'object' || Object.keys(f).some((k) => !ACT_FIELDS.includes(k))) return null;
      if (!ACT_FIELDS.every((k) => f[k] === undefined || str8(f[k]))) return null;
      out.act[id] = Object.fromEntries(ACT_FIELDS.map((k) => [k, f[k] === undefined ? '' : f[k]]));
    }
    for (const [n, f] of Object.entries(ev)) {
      if (!/^\d{1,2}$/.test(n) || Number(n) < 1 || Number(n) > EX.events || !f || typeof f !== 'object' || Object.keys(f).some((k) => !EV_FIELDS.includes(k))) return null;
      if (!EV_FIELDS.every((k) => f[k] === undefined || str8(f[k]))) return null;
      out.ev[n] = Object.fromEntries(EV_FIELDS.map((k) => [k, f[k] === undefined ? '' : f[k]]));
    }
    const empty = !out.dur && !out.crit.length && !out.paths.length
      && Object.values(out.act).every((f) => ACT_FIELDS.every((k) => !f[k])) && Object.values(out.ev).every((f) => EV_FIELDS.every((k) => !f[k]));
    return empty ? null : out;
  }
  function packAns(a) {
    const payload = [1, Object.fromEntries(Object.entries(a.act).map(([id, f]) => [id, ACT_FIELDS.map((k) => f[k])])), a.dur,
      Object.fromEntries(Object.entries(a.ev).map(([n, f]) => [n, EV_FIELDS.map((k) => f[k])])), a.crit, a.paths];
    return textpack().compress(JSON.stringify(payload));
  }
  function unpackAns(packed) {
    const tp = textpack();
    const json = tp ? tp.decompress(packed, { max: EX.packed }) : null;
    if (json === null) return null;
    let a;
    try { a = JSON.parse(json); } catch { return null; }
    if (!Array.isArray(a) || a.length !== 6 || a[0] !== 1 || !a[1] || typeof a[1] !== 'object' || Array.isArray(a[1]) || !a[3] || typeof a[3] !== 'object' || Array.isArray(a[3])) return null;
    const arr = (x, n) => Array.isArray(x) && x.length === n;
    if (!Object.values(a[1]).every((x) => arr(x, ACT_FIELDS.length)) || !Object.values(a[3]).every((x) => arr(x, EV_FIELDS.length))) return null;
    return cleanAns({
      act: Object.fromEntries(Object.entries(a[1]).map(([id, x]) => [id, Object.fromEntries(ACT_FIELDS.map((k, i) => [k, x[i]]))])),
      dur: a[2], ev: Object.fromEntries(Object.entries(a[3]).map(([n, x]) => [n, Object.fromEntries(EV_FIELDS.map((k, i) => [k, x[i]]))])),
      crit: a[4], paths: a[5] });
  }

  function encode(state) {
    const s = Object.assign(defaults(), state);
    const q = new URLSearchParams();
    q.set('v', s.v);
    // F3b: la vista del exportador de Moodle solo guarda el idioma y la notación (plan P7).
    if (s.v === 'moodle') {
      if (s.lang) q.set('lang', s.lang);
      q.set('nota', s.nota);
      return '#' + q.toString();
    }
    // graph y min solo se escriben si no valen lo de siempre: los enlaces de la fase 1 no cambian (F2a, P4).
    if (s.graph === 'aoa') q.set('graph', 'aoa');
    const m0 = s.v === 'm0';
    const exV = s.v === 'ex';
    const own = m0 && s.st === 'own' && s.own;
    if (exV) { /* la tabla sale de la semilla */ } else if (s.t && !own) q.set('t', encodeTable(s.t)); else if (s.ex && !m0) q.set('ex', s.ex);
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
    // F2c: M0, solo lo que no vale lo de siempre.
    if (m0) {
      q.set('st', s.st || DEFAULT_ST);
      if (own) q.set('own', packOwn(s));
      else if (s.mk && s.mk.length) q.set('mk', encodeMarks(s.mk));
      if (s.tv !== 'list') q.set('tv', s.tv);
      if (s.mm !== 'practice') q.set('mm', s.mm);
      if (s.sol) q.set('sol', '1');
    }
    // F3a: «Ejercicios», solo lo que no vale lo de siempre.
    if (exV) {
      if (seedOk(s.sd)) q.set('sd', String(s.sd));
      const gp = s.lv === 'custom' ? cleanGp(s.gp) : null;
      if (s.lv !== 'medium' && (s.lv !== 'custom' || gp)) q.set('lv', s.lv);
      if (gp) q.set('gp', encodeGp(gp));
      const ask = cleanAsk(s.ask) || DEFAULT_ASK;
      if (ask.join() !== DEFAULT_ASK.join()) q.set('ask', ask.map((x) => ASK_CODE[x]).join(''));
      if (s.xm === 'exam') q.set('xm', 'exam');
      const ans = cleanAns(s.ans);
      if (ans) q.set('ans', packAns(ans));
      if (s.xd) q.set('xd', '1');
      if (Number.isInteger(s.gv) && s.gv >= 1) q.set('gv', String(s.gv));
    }
    return '#' + q.toString();
  }

  // Como encode, pero nunca da un enlace que decode rechazaría por largo (F2c, P5; tarea apuntada de la F2b).
  // Un enlace que se da por bueno se abre: con un enunciado propio, además del largo, se comprueba que el paquete
  // se lee (un texto muy repetitivo puede pasar del tope de lo descomprimido; revisión de la F2c, F1).
  function encodeSafe(state) {
    const hash = encode(state);
    if (hash.length > LIMITS.hash) return { hash: null, reason: 'tooLong', length: hash.length };
    const s = Object.assign(defaults(), state);
    if (s.v === 'm0' && s.st === 'own' && s.own && decode(hash).warning === 'malformed') return { hash: null, reason: 'unreadable', length: hash.length };
    return { hash, length: hash.length };
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
      if (ENUMS[key].includes(val)) state[key] = NUMERIC.includes(key) ? Number(val) : val;
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
    // F2c: M0 (enunciado, enunciado propio en un solo paquete, subrayados).
    if (state.v === 'm0') {
      state.ex = null;
      const st = q.get('st');
      if (st === 'own') {
        const o = q.has('own') ? unpackOwn(q.get('own')) : null;
        if (o) { state.st = 'own'; state.own = o.own; state.t = o.t; state.mode = o.mode; state.mk = o.mk; }
        // Preparar un enunciado propio empieza sin paquete: el texto vacío, en el idioma de la página (T021).
        else if (!q.has('own') && state.mm === 'prepare') { state.st = 'own'; state.own = { lang: state.lang || 'es', text: '', frags: [], ref: null }; }
        else { state.st = DEFAULT_ST; malformed = true; }
      } else if (st === null) state.st = DEFAULT_ST;
      else if (STATEMENTS.includes(st)) state.st = st;
      else { state.st = DEFAULT_ST; malformed = true; }
      if (state.st !== 'own' && q.has('mk')) {
        const mk = decodeMarks(q.get('mk'));
        if (mk === null) malformed = true; else state.mk = mk.length ? mk : null;
      }
    }
    // F3b: el exportador de Moodle no tiene tabla ni ejemplo.
    if (state.v === 'moodle') { state.ex = null; state.t = null; }
    // F3a: «Ejercicios» (la tabla sale de la semilla: t y ex no se leen).
    if (state.v === 'ex') {
      state.ex = null; state.t = null;
      if (q.has('sd')) { const v = q.get('sd'); const n = /^\d{1,6}$/.test(v) ? Number(v) : NaN; if (seedOk(n)) state.sd = n; else malformed = true; }
      if (state.lv === 'custom') {
        const gp = q.has('gp') ? decodeGp(q.get('gp')) : null;
        if (gp) state.gp = gp; else { state.lv = 'medium'; malformed = true; }
      }
      if (q.has('ask')) { const a = decodeAsk(q.get('ask')); if (a) state.ask = a; else malformed = true; }
      if (q.has('ans')) { const a = unpackAns(q.get('ans')); if (a) state.ans = a; else malformed = true; }
      if (q.has('gv')) { const v = q.get('gv'); if (/^\d{1,3}$/.test(v) && Number(v) >= 1) state.gv = Number(v); else malformed = true; }
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

  const api = { EXAMPLES, STRUCTURE_ONLY, METHODS, LIMITS, MAX_MARKS: MK.marks, STATEMENTS, DEFAULT_ST, defaults, encode, encodeSafe, decode, cleanMarks,
    ASK, DEFAULT_ASK, EX, cleanGp, cleanAsk, cleanAns };
  root.PNL = root.PNL || {};
  root.PNL.urlstate = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
