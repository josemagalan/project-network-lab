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
    v: ['route', 'work', 'm0', 'ex', 'moodle', 'unc'], view: ['net', 'matrix', 'side', 'cmp', 'reto'], m: ['rules', 'prog'], lang: ['es', 'en'], nota: ['en', 'es'],
    box: ['4', '7', 'c'], mode: ['pred', 'succ'], pred: ['0', '1'], graph: ['aon', 'aoa'], min: ['0', '1'],
    tv: ['list', 'matrix'], mm: ['practice', 'route', 'prepare'], sol: ['0', '1'],
    lv: ['easy', 'medium', 'hard', 'custom'], xm: ['practice', 'exam'], xd: ['0', '1'],   // F3a: «Ejercicios»
    cx: ['home', 'product', 'congress', 'lab'], xt: ['0', '1'],   // F3c: contexto del enunciado al azar y enunciado en «Ejercicios»
    // F4a: pestaña de tres tiempos y el TCL (plan f4a-tres-tiempos-tcl, §3): apartado, proyecto, curva clásica y caso de M6.
    um: ['m5', 'm6', 'm7'], ue: ['kl', 'hl', 'tr', 'pa', 'own', 'kd', 'wa', 'wb', 'wc', 'wd'], uc: ['0', '1'], ux: ['exam', 'merge', 'few', 'skew', 'corr', 'proj'], uw: ['0', '1'],
    // F4b: M7 (plan f4b-montecarlo-indices, §3): distribución para todas, réplicas (10^ur), Pearson o Spearman, vista e índice de la red.
    ug: ['pert', 'classic', 'tri', 'unif', 'norm', 'logn'], ur: ['2', '3', '4', '5'], uo: ['p', 's'], uy: ['dist', 'idx', 'rep', 'conv'], ui: ['cr', 'cu', 'si'],
    // F4b (T010; bocetos aprobados, T009): orden del tornado en espejo, por criticidad (c) o por crucialidad (u).
    uz: ['c', 'u'],
  };
  const NUMERIC = ['pred', 'min', 'sol', 'xd', 'xt', 'uc', 'uw', 'ur'];
  const KEYS = ['v', 'ex', 't', 'step', 'view', 'lang', 'nota', 'box', 'mode', 'pred', 'wi', 'graph', 'min', 'm', 'ms', 'pair', 'sn', 'sp', 'st', 'own', 'mk', 'tv', 'mm', 'sol', 'sd', 'lv', 'gp', 'ask', 'xm', 'ans', 'xd', 'gv', 'cx', 'sv', 'xt',
    'um', 'ue', 'ut', 'ua', 'uc', 'ux', 'ud', 'up', 'uk', 'us', 'uw', 'ug', 'uf', 'uq', 'ur', 'uv', 'uo', 'uy', 'ui', 'uz'];
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
      sd: null, lv: 'medium', gp: null, ask: DEFAULT_ASK.slice(), xm: 'practice', ans: null, xd: 0, gv: null,
      cx: null, sv: null, xt: 0,
      um: 'm5', ue: 'kl', ut: null, ua: null, uc: 0, ux: 'exam', ud: null, up: null, uk: null, us: null, uw: 0,
      ug: 'pert', uf: null, uq: null, ur: 4, uv: 95, uo: 'p', uy: 'dist', ui: 'cr', uz: 'c' };
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
  const verOk = (x) => Number.isInteger(x) && x >= 1 && x <= 999;   // F3c: sv, versión del generador de enunciados
  // Versión actual de core/stmtgen (que se carga bajo demanda): la escriben los enlaces de «Ejercicios» con el enunciado.
  // tests/stmtgen.test.js comprueba que es la misma que stmtgen.VERSION (revisión de la F3c, ronda 2, F2).
  const STMT_VERSION = 2;
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

  // ---------- F4a: la pestaña de tres tiempos y el TCL (v=unc) ----------
  // Los casos del Tema 6c con media y varianza solo existen en M6 (core/stochex, m6only).
  const UNC_M6_ONLY = ['tr', 'pa'];
  const UNC_DEFAULTS = { um: 'm5', ue: 'kl', ut: null, ua: null, uc: 0, ux: 'exam', ud: null, up: null, uk: null, us: null, uw: 0,
    ug: 'pert', uf: null, uq: null, ur: 4, uv: 95, uo: 'p', uy: 'dist', ui: 'cr', uz: 'c' };
  // F4b: los ejemplos con tiempos discretos solo existen en M7 (core/stochex, m7only).
  const UNC_M7_ONLY = ['kd', 'wa', 'wb', 'wc', 'wd'];
  // F4b: distribución propia de cada actividad (uf, «A-u.C-l») y discretas editadas (uq, como texto, empaquetadas).
  const UF_LETTER = { pert: 'p', classic: 'c', tri: 't', unif: 'u', norm: 'n', logn: 'l', disc: 'd' };
  const UF_KIND = Object.fromEntries(Object.entries(UF_LETTER).map(([k, v]) => [v, k]));
  const DISC_MAX = 20;
  function cleanUf(uf) {
    if (!uf || typeof uf !== 'object' || Array.isArray(uf)) return null;
    const e = Object.entries(uf);
    if (!e.length || e.length > LIMITS.rows || !e.every(([id, k]) => ID_RE.test(id) && UF_LETTER[k])) return null;
    return Object.fromEntries(e);
  }
  const encodeUf = (uf) => Object.entries(uf).map(([id, k]) => `${id}-${UF_LETTER[k]}`).join('.');
  function decodeUf(text) {
    const out = {};
    for (const part of String(text).split('.')) {
      const m = part.match(/^([A-Za-z0-9]{1,4})-([a-z])$/);
      if (!m || !UF_KIND[m[2]] || m[1] in out) return null;
      out[m[1]] = UF_KIND[m[2]];
    }
    return cleanUf(out);
  }
  const strList = (a) => Array.isArray(a) && a.length >= 1 && a.length <= DISC_MAX && a.every((x) => typeof x === 'string' && x.length <= LIMITS.duration);
  function cleanUq(uq) {
    if (!uq || typeof uq !== 'object' || Array.isArray(uq)) return null;
    const e = Object.entries(uq);
    if (!e.length || e.length > LIMITS.rows) return null;
    if (!e.every(([id, q]) => ID_RE.test(id) && q && strList(q.x) && strList(q.p) && q.x.length === q.p.length)) return null;
    return Object.fromEntries(e.map(([id, q]) => [id, { x: q.x.slice(), p: q.p.slice() }]));
  }
  const packUq = (uq) => textpack().compress(JSON.stringify([1, Object.entries(uq).map(([id, q]) => [id, q.x, q.p])]));
  function unpackUq(packed) {
    const tp = textpack();
    const json = tp ? tp.decompress(packed, { max: EX.packed }) : null;
    if (json === null) return null;
    let a;
    try { a = JSON.parse(json); } catch { return null; }
    if (!Array.isArray(a) || a.length !== 2 || a[0] !== 1 || !Array.isArray(a[1]) || !a[1].every((r) => Array.isArray(r) && r.length === 3)) return null;
    const ids = a[1].map((r) => r[0]);
    if (new Set(ids).size !== ids.length) return null;
    return cleanUq(Object.fromEntries(a[1].map((r) => [r[0], { x: r[1], p: r[2] }])));
  }
  const pctOk = (x) => Number.isInteger(x) && x >= 1 && x <= 99;
  // Deslizadores: n caminos (1–8), s holgura (0–20, en décimas), k actividades (1–30), w asimetría y r correlación (0–1, en
  // centésimas). En la URL, letra y entero separados por puntos: n3.s25.k4.w25.r90.
  const UK = { n: { lo: 1, hi: 8, scale: 1 }, s: { lo: 0, hi: 20, scale: 10 }, k: { lo: 1, hi: 30, scale: 1 }, w: { lo: 0, hi: 1, scale: 100 }, r: { lo: 0, hi: 1, scale: 100 } };
  const onGrid = (x, scale) => Math.abs(x * scale - Math.round(x * scale)) < 1e-9;
  function cleanUk(uk) {
    if (!uk || typeof uk !== 'object') return null;
    const out = {};
    for (const [k, v] of Object.entries(uk)) {
      const d = UK[k];
      if (!d || typeof v !== 'number' || !(v >= d.lo && v <= d.hi) || !onGrid(v, d.scale)) return null;
      out[k] = Math.round(v * d.scale) / d.scale;
    }
    return Object.keys(out).length ? out : null;
  }
  const encodeUk = (uk) => Object.keys(UK).filter((k) => k in uk).map((k) => `${k}${Math.round(uk[k] * UK[k].scale)}`).join('.');
  function decodeUk(text) {
    const out = {};
    for (const part of String(text).split('.')) {
      const m = part.match(/^([a-z])(\d{1,4})$/);
      if (!m || !UK[m[1]] || m[1] in out) return null;
      out[m[1]] = Number(m[2]) / UK[m[1]].scale;
    }
    return cleanUk(out);
  }
  const deadlineOk = (x) => typeof x === 'number' && Number.isFinite(x) && x >= 0 && x <= 999999;
  const probOk = (x) => typeof x === 'number' && x > 0 && x < 1;
  const actOk = (x) => typeof x === 'string' && ID_RE.test(x);
  const num4 = (x) => String(Number(x.toFixed(4)));
  // Tabla propia: modo y filas como texto (id, a, m, b, precedencias, nombre), recortadas a los límites del taller.
  const UT_ROW = (r) => [cut(r.id, LIMITS.id), cut(r.a, LIMITS.duration), cut(r.m, LIMITS.duration), cut(r.b, LIMITS.duration), cut(r.links, LIMITS.links), cut(r.name, LIMITS.name)];
  const utRowOk = (a) => Array.isArray(a) && a.length === 6 && a.every((x) => typeof x === 'string')
    && a[0].length <= LIMITS.id && [1, 2, 3].every((i) => a[i].length <= LIMITS.duration) && a[4].length <= LIMITS.links && a[5].length <= LIMITS.name;
  function cleanUt(ut) {
    if (!ut || !ENUMS.mode.includes(ut.mode) || !Array.isArray(ut.rows)) return null;
    const rows = ut.rows.slice(0, LIMITS.rows).map((r) => UT_ROW(r || {}));
    return { mode: ut.mode, rows: rows.map((a) => ({ id: a[0], name: a[5], a: a[1], m: a[2], b: a[3], links: a[4] })) };
  }
  const packUt = (ut) => textpack().compress(JSON.stringify([1, ut.mode, ut.rows.slice(0, LIMITS.rows).map(UT_ROW)]));
  function unpackUt(packed) {
    const tp = textpack();
    const json = tp ? tp.decompress(packed, { max: EX.packed }) : null;
    if (json === null) return null;
    let a;
    try { a = JSON.parse(json); } catch { return null; }
    if (!Array.isArray(a) || a.length !== 3 || a[0] !== 1 || !ENUMS.mode.includes(a[1]) || !Array.isArray(a[2]) || a[2].length > LIMITS.rows || !a[2].every(utRowOk)) return null;
    return { mode: a[1], rows: a[2].map((r) => ({ id: r[0], name: r[5], a: r[1], m: r[2], b: r[3], links: r[4] })) };
  }
  function encodeUnc(s, q) {
    if (s.um !== 'm5') q.set('um', s.um);
    const own = s.ue === 'own' && cleanUt(s.ut);
    if (s.ue !== 'kl' && (s.ue !== 'own' || own)) q.set('ue', s.ue);
    if (own) q.set('ut', packUt(own));
    if (actOk(s.ua)) q.set('ua', s.ua);
    if (s.uc) q.set('uc', '1');
    if (s.uw) q.set('uw', '1');
    if (s.ux !== 'exam') q.set('ux', s.ux);
    if (deadlineOk(s.ud)) q.set('ud', num4(s.ud));
    if (probOk(s.up)) q.set('up', num4(s.up));
    const uk = cleanUk(s.uk);
    if (uk) q.set('uk', encodeUk(uk));
    if (seedOk(s.us)) q.set('us', String(s.us));
    // F4b: M7.
    if (s.ug !== 'pert') q.set('ug', s.ug);
    const uf = cleanUf(s.uf);
    if (uf) q.set('uf', encodeUf(uf));
    const uq = cleanUq(s.uq);
    if (uq) q.set('uq', packUq(uq));
    if (s.ur !== 4) q.set('ur', String(s.ur));
    if (pctOk(s.uv) && s.uv !== 95) q.set('uv', String(s.uv));
    for (const [k, d] of [['uo', 'p'], ['uy', 'dist'], ['ui', 'cr'], ['uz', 'c']]) if (s[k] !== d) q.set(k, s[k]);
  }
  function decodeUnc(q, state) {
    let bad = false;
    state.ex = null; state.t = null;
    if (q.has('ut')) { const ut = unpackUt(q.get('ut')); if (ut) state.ut = ut; else bad = true; }
    if (state.ue === 'own' && !state.ut) { state.ue = 'kl'; bad = true; }
    if (state.ue !== 'own') state.ut = null;
    if (state.um === 'm5' && UNC_M6_ONLY.includes(state.ue)) { state.ue = 'kl'; bad = true; }
    if (state.um !== 'm7' && UNC_M7_ONLY.includes(state.ue)) { state.ue = 'kl'; bad = true; }
    if (state.um === 'm7' && UNC_M6_ONLY.includes(state.ue)) { state.ue = 'kl'; bad = true; }
    if (q.has('uf')) { const uf = decodeUf(q.get('uf')); if (uf) state.uf = uf; else bad = true; }
    if (q.has('uq')) { const uq = unpackUq(q.get('uq')); if (uq) state.uq = uq; else bad = true; }
    if (q.has('uv')) { const v = q.get('uv'); const n = /^\d{1,2}$/.test(v) ? Number(v) : NaN; if (pctOk(n)) state.uv = n; else bad = true; }
    if (q.has('ua')) { if (actOk(q.get('ua'))) state.ua = q.get('ua'); else bad = true; }
    if (q.has('ud')) { const v = q.get('ud'); const n = /^\d{1,6}(\.\d{1,4})?$/.test(v) ? Number(v) : NaN; if (deadlineOk(n)) state.ud = n; else bad = true; }
    if (q.has('up')) { const v = q.get('up'); const n = /^0\.\d{1,4}$/.test(v) ? Number(v) : NaN; if (probOk(n)) state.up = n; else bad = true; }
    if (q.has('uk')) { const uk = decodeUk(q.get('uk')); if (uk) state.uk = uk; else bad = true; }
    if (q.has('us')) { const v = q.get('us'); const n = /^\d{1,6}$/.test(v) ? Number(v) : NaN; if (seedOk(n)) state.us = n; else bad = true; }
    return bad;
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
    // F4a: la pestaña de tres tiempos y el TCL no tiene tabla del taller ni ejemplo de la ruta (plan §3).
    if (s.v === 'unc') {
      if (s.graph === 'aoa') q.set('graph', 'aoa');
      q.set('step', String(s.step));
      if (s.lang) q.set('lang', s.lang);
      q.set('nota', s.nota);
      if (s.pred) q.set('pred', '1');
      encodeUnc(s, q);
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
      // F3c: el enunciado al azar se guarda por su semilla, nivel, contexto y versión del generador (plan P7).
      if (s.st === 'gen') {
        if (seedOk(s.sd)) q.set('sd', String(s.sd));
        if (s.lv === 'easy' || s.lv === 'hard') q.set('lv', s.lv);
        if (ENUMS.cx.includes(s.cx)) q.set('cx', s.cx);
        if (verOk(s.sv)) q.set('sv', String(s.sv));
      }
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
      // Con el enunciado, también la versión de su generador (plan P7; revisión de la F3c, ronda 2, F2).
      if (s.xt && s.lv !== 'custom') { q.set('xt', '1'); q.set('sv', String(verOk(s.sv) ? s.sv : STMT_VERSION)); }
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
      else if (st === 'gen') {
        state.st = 'gen';
        if (q.has('sd')) { const n = /^\d{1,6}$/.test(q.get('sd')) ? Number(q.get('sd')) : NaN; if (seedOk(n)) state.sd = n; else malformed = true; }
        if (state.lv === 'custom') { state.lv = 'medium'; malformed = true; }
        if (q.has('sv')) { const v = q.get('sv'); if (/^\d{1,3}$/.test(v) && verOk(Number(v))) state.sv = Number(v); else malformed = true; }
      } else if (STATEMENTS.includes(st)) state.st = st;
      else { state.st = DEFAULT_ST; malformed = true; }
      if (state.st !== 'own' && q.has('mk')) {
        const mk = decodeMarks(q.get('mk'));
        if (mk === null) malformed = true; else state.mk = mk.length ? mk : null;
      }
    }
    // F3c: el contexto solo cuenta con el enunciado al azar, y el enunciado de «Ejercicios» solo con los tres niveles.
    if (!(state.v === 'm0' && state.st === 'gen')) state.cx = null;
    if (state.v !== 'ex') state.xt = 0;
    else if (state.xt && state.lv === 'custom') { state.xt = 0; malformed = true; }
    // F4a: las claves u* solo cuentan en la pestaña de tres tiempos y el TCL.
    if (state.v === 'unc') { if (decodeUnc(q, state)) malformed = true; } else Object.assign(state, UNC_DEFAULTS);
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
      // F3c (ronda 2, F2): la versión del enunciado. Los enlaces con xt=1 de antes no la guardaban: eran de la versión 1.
      if (state.xt) {
        if (!q.has('sv')) state.sv = 1;
        else { const v = q.get('sv'); if (/^\d{1,3}$/.test(v) && verOk(Number(v))) state.sv = Number(v); else malformed = true; }
      }
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
    ASK, DEFAULT_ASK, EX, STMT_VERSION, cleanGp, cleanAsk, cleanAns,
    UNC: { M6_ONLY: UNC_M6_ONLY, M7_ONLY: UNC_M7_ONLY, cleanUf, cleanUq, pctOk, cleanUk, cleanUt, deadlineOk, probOk, actOk, seedOk } };
  root.PNL = root.PNL || {};
  root.PNL.urlstate = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
