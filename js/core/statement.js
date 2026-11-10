/*
 * core/statement — el enunciado de M0 como objeto (spec f2c-enunciado-tabla, plan §3, P1 y P2).
 *
 * La herramienta no interpreta el texto: las precedencias salen siempre de la tabla del alumno o de la
 * referencia del enunciado. Aquí solo se trabaja con palabras y fragmentos:
 * tokenize(text) divide el texto en palabras (posiciones estables, que la URL guarda);
 * build(def, lang) construye un enunciado de la herramienta (segmentos con fragId comunes a ES y EN) o
 * propio (rangos de palabras, un idioma); validate(def, { strict }) revisa su contenido;
 * match(st, marks, project) empareja las actividades del alumno con las de la referencia (al comprobar);
 * markWarnings(st, marks, project) da los avisos de las marcas del alumno sin mirar la referencia;
 * suggest(words, from, to, used) propone la letra y el número de un fragmento subrayado;
 * sources(st, marks, edge, { reveal, refEdge }) dice de qué frase sale una precedencia;
 * moveMarks(def, marks, from, to) pasa los subrayados al otro idioma; route(st) da la ruta guiada.
 * Sin DOM ni azar.
 */
(function (root) {
  'use strict';

  const isNode = typeof module !== 'undefined' && module.exports;
  const P = isNode ? require('./project.js') : root.PNL.project;
  const C = isNode ? require('./precheck.js') : root.PNL.precheck;

  const KINDS = ['activity', 'duration', 'precedence', 'none', 'start', 'end'];
  const WITH_ACT = ['activity', 'duration', 'start', 'end'];
  const LANGS = ['es', 'en'];
  const ID_RE = /^[A-Z0-9]{1,4}$/;
  const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
  const byId = (a, b) => a.localeCompare(b, 'en', { numeric: true });
  const byEdge = (x, y) => byId(x[0], y[0]) || byId(x[1], y[1]);
  const sameEdge = (e, x) => e[0] === x[0] && e[1] === x[1];
  const isOwn = (def) => typeof def.text === 'string';

  // Palabra = letras (Unicode), cifras o apóstrofo interno; el resto es separador.
  function tokenize(text) {
    const s = text == null ? '' : String(text);
    const re = /[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu;
    const words = [];
    let lead = '';
    let last = 0;
    let m;
    while ((m = re.exec(s))) {
      if (words.length) words[words.length - 1].sep = s.slice(last, m.index);
      else lead = s.slice(0, m.index);
      words.push({ i: words.length, t: m[0], at: m.index, sep: '' });
      last = m.index + m[0].length;
    }
    if (words.length) words[words.length - 1].sep = s.slice(last);
    else lead = s;
    return { lead, words };
  }

  function parseRef(ref, lang) {
    const rows = ref.rows.map((r) => ({ id: r.id, duration: r.duration == null ? '' : String(r.duration), links: r.links || '',
      name: r.name && typeof r.name === 'object' ? (r.name[lang] || '') : (r.name || '') }));
    const structureOnly = rows.every((r) => !r.duration.trim());
    return { parsed: P.parse(rows, ref.mode || 'pred', { structureOnly }), structureOnly };
  }

  const fragFields = (f) => {
    const out = { kind: f.kind };
    for (const k of ['act', 'value', 'gives', 'why']) if (f[k] !== undefined) out[k] = f[k];
    return out;
  };

  function build(def, lang) {
    if (isOwn(def)) {
      const tk = tokenize(def.text);
      const r = def.ref ? parseRef(def.ref, def.lang) : null;
      return { id: 'own', lang: def.lang, lead: tk.lead, words: tk.words,
        frags: (def.frags || []).map((f, k) => Object.assign({ id: `f${k}`, from: f.from, to: f.to }, fragFields(f))),
        ref: r ? r.parsed.project : null, refParsed: r ? r.parsed : null, structureOnly: r ? r.structureOnly : true };
    }
    const L = LANGS.includes(lang) ? lang : 'es';
    let text = '';
    const spans = [];
    for (const seg of def.text[L]) {
      if (Array.isArray(seg)) { spans.push({ id: seg[0], start: text.length, end: text.length + seg[1].length }); text += seg[1]; }
      else text += seg;
    }
    const tk = tokenize(text);
    const frags = spans.map((sp) => {
      const ws = tk.words.filter((w) => w.at >= sp.start && w.at < sp.end);
      return Object.assign({ id: sp.id, from: ws.length ? ws[0].i : -1, to: ws.length ? ws[ws.length - 1].i : -1 }, fragFields(def.frags[sp.id] || {}));
    });
    const r = parseRef(def.ref, L);
    return { id: def.id, lang: L, lead: tk.lead, words: tk.words, frags, ref: r.parsed.project, refParsed: r.parsed,
      structureOnly: !!def.structureOnly, title: def.title && def.title[L], unit: def.unit ? def.unit[L] : null };
  }

  function validate(def, opts) {
    const strict = !!(opts && opts.strict);
    const issues = [];
    let entries; // [{ key, frag }]
    if (isOwn(def)) {
      const n = tokenize(def.text).words.length;
      entries = (def.frags || []).map((f, k) => ({ key: k, frag: f }));
      for (const { key, frag } of entries) {
        if (!(Number.isInteger(frag.from) && Number.isInteger(frag.to) && frag.from >= 0 && frag.to >= frag.from && frag.to < n)) issues.push({ code: 'badRange', frag: key });
      }
    } else {
      const ids = {};
      for (const L of LANGS) {
        ids[L] = def.text[L].filter(Array.isArray).map((s) => s[0]);
        const seen = new Set();
        for (const id of ids[L]) { if (seen.has(id)) issues.push({ code: 'fragDuplicate', lang: L, frag: id }); seen.add(id); }
      }
      const keys = Object.keys(def.frags).sort().join();
      if (LANGS.some((L) => [...new Set(ids[L])].sort().join() !== keys)) issues.push({ code: 'fragMismatch' });
      for (const L of LANGS) for (const f of build(def, L).frags) if (f.from < 0) issues.push({ code: 'fragEmpty', lang: L, frag: f.id });
      entries = Object.keys(def.frags).map((k) => ({ key: k, frag: def.frags[k] }));
    }
    if (!def.ref) return issues;
    const parsed = parseRef(def.ref, isOwn(def) ? def.lang : 'es').parsed;
    if (!parsed.project) { issues.push({ code: 'refInvalid' }); return issues; }
    const ref = parsed.project;
    const known = new Set(ref.activities.map((a) => a.id));
    const reach = C.closure(ref);
    const given = [];
    for (const { key, frag } of entries) {
      if (!KINDS.includes(frag.kind)) { issues.push({ code: 'badKind', frag: key }); continue; }
      if (WITH_ACT.includes(frag.kind) && !known.has(frag.act)) issues.push({ code: 'unknownAct', frag: key, ids: [frag.act] });
      // La duración de un fragmento es la de la referencia (revisión de la F2c, F10): si no, la ruta enseña una y
      // la corrección pide otra.
      else if (frag.kind === 'duration') {
        const a = ref.activities.find((x) => x.id === frag.act);
        if (a.d == null || a.d !== frag.value) issues.push({ code: 'durMismatch', frag: key, ids: [frag.act] });
      }
      for (const e of frag.gives || []) {
        if (!known.has(e[0]) || !known.has(e[1])) { issues.push({ code: 'unknownAct', frag: key, ids: e.slice() }); continue; }
        if (!reach.get(e[0]).has(e[1])) issues.push({ code: 'fragNotInRef', frag: key, ids: e.slice() });
        given.push(e);
      }
    }
    const red = C.reduce(ref);
    for (const a of red.activities) {
      for (const p of red.preds[a.id]) {
        if (given.some((e) => sameEdge(e, [p, a.id]))) continue;
        const issue = { code: 'unjustified', ids: [p, a.id] };
        if (!strict) issue.warn = true;
        issues.push(issue);
      }
    }
    return issues;
  }

  const overlap = (m, f) => Math.max(0, Math.min(m.to, f.to) - Math.max(m.from, f.from) + 1);

  // Al comprobar: cada actividad del alumno con subrayados va con la actividad de la referencia con la que
  // comparte más palabras; los pares se eligen de mayor a menor solape en toda la tabla (empate: el fragmento
  // primero en el texto y, después, la fila primera de la tabla), así que una fila escrita antes con un subrayado
  // dudoso no le quita el fragmento a la que lo subrayó entero (revisión de la F2c, F13). Las demás, por identificador.
  function match(st, marks, project) {
    const refActs = st.ref ? st.ref.activities.map((a) => a.id) : [];
    if (!project) return { map: {}, extra: [], missing: refActs.slice() };
    const actFrags = st.frags.filter((f) => f.kind === 'activity' && f.from >= 0 && refActs.includes(f.act));
    const map = {};
    const claimed = new Set();
    const ids = project.activities.map((a) => a.id);
    const pairs = [];
    ids.forEach((id, row) => {
      const ms = (marks || []).filter((m) => m.kind === 'activity' && m.act === id);
      for (const f of actFrags) {
        const s = ms.reduce((acc, m) => acc + overlap(m, f), 0);
        if (s > 0) pairs.push({ id, row, f, s });
      }
    });
    pairs.sort((x, y) => y.s - x.s || x.f.from - y.f.from || x.row - y.row);
    for (const x of pairs) if (!(x.id in map) && !claimed.has(x.f.act)) { map[x.id] = x.f.act; claimed.add(x.f.act); }
    const pending = ids.filter((id) => !(id in map) && !pairs.some((x) => x.id === id));
    for (const id of pending) if (refActs.includes(id) && !claimed.has(id)) { map[id] = id; claimed.add(id); }
    return { map, extra: ids.filter((id) => !(id in map)), missing: refActs.filter((id) => !claimed.has(id)) };
  }

  // Avisos de las marcas del alumno; nunca miran la referencia (sin pistas antes de comprobar). rowIds son los
  // identificadores de las filas: con un error en la tabla no hay proyecto, pero una fila escrita sigue estando
  // (revisión de la F2c, F5); sin proyecto, los inicios y finales declarados no se comprueban.
  function markWarnings(st, marks, project, rowIds) {
    const out = [];
    const rows = rowIds ? new Set(rowIds) : null;
    const has = (id) => (project ? project.activities.some((a) => a.id === id) : !!rows && rows.has(id));
    (marks || []).forEach((m, k) => {
      if (m.decl) {
        const a = m.decl.act;
        if (!has(a)) out.push({ code: 'markedMissing', mark: k, ids: [a] });
        else if (project) {
          const end = m.decl.end === 'end';
          const side = end ? project.succs : project.preds;
          const others = project.activities.map((x) => x.id).filter((x) => x !== a && !side[x].length).sort(byId);
          if (side[a].length || others.length) out.push({ code: end ? 'declEnd' : 'declStart', mark: k, ids: [a], others });
        }
      }
      if (m.kind === 'activity' && m.act && !has(m.act)) out.push({ code: 'markedMissing', mark: k, ids: [m.act] });
    });
    return out;
  }

  function nextFree(used) {
    const taken = new Set(used || []);
    for (let n = 0; ; n++) for (const L of LETTERS) { const id = n ? `${L}${n}` : L; if (!taken.has(id)) return id; }
  }

  // Propuesta para un fragmento subrayado: la letra que el texto le da («A)», «A:», «A=») o la siguiente
  // libre (fromText dice cuál de las dos), y el primer número (con decimales si van pegados: «2,5»). Solo mira lo subrayado.
  function suggest(words, from, to, used) {
    const tagged = (w) => !!w && ID_RE.test(w.t) && /^\s*[):=]/.test(w.sep);
    const own = tagged(words[from]) ? words[from].t : (from > 0 && tagged(words[from - 1]) ? words[from - 1].t : null);
    const out = { id: own || nextFree(used), fromText: !!own };
    for (let i = from; i <= to && i < words.length; i++) {
      if (!/^\d+$/.test(words[i].t)) continue;
      const dec = (words[i].sep === ',' || words[i].sep === '.') && i + 1 <= to && /^\d+$/.test((words[i + 1] || {}).t || '');
      out.value = Number(dec ? `${words[i].t}.${words[i + 1].t}` : words[i].t);
      break;
    }
    return out;
  }

  function sources(st, marks, edge, opts) {
    const out = {};
    const k = (marks || []).findIndex((m) => (m.gives || []).some((g) => sameEdge(g, edge)));
    if (k >= 0) out.mark = k;
    if (opts && opts.reveal) {
      const re = opts.refEdge || edge;
      const f = st.frags.find((x) => (x.gives || []).some((g) => sameEdge(g, re)));
      if (f) out.frag = f.id;
    }
    return out;
  }

  function moveMarks(def, marks, fromLang, toLang) {
    const a = build(def, fromLang);
    const b = build(def, toLang);
    const out = [];
    let dropped = 0;
    for (const m of marks || []) {
      const best = a.frags.filter((f) => f.from >= 0).map((f) => ({ f, s: overlap(m, f) })).filter((x) => x.s > 0)
        .sort((x, y) => y.s - x.s || x.f.from - y.f.from)[0];
      const target = best && b.frags.find((f) => f.id === best.f.id && f.from >= 0);
      if (!target) { dropped++; continue; }
      out.push(Object.assign({}, m, { from: target.from, to: target.to }));
    }
    return { marks: out, dropped };
  }

  // Ruta guiada: un paso por fragmento en el orden del texto; cada paso añade a la tabla lo que da y dice
  // qué precedencias ya estaban implicadas; al final, la tabla depurada (la referencia sin redundancias).
  function route(st) {
    const steps = [{ kind: 'm0Text', reveals: [] }];
    const table = {};
    const has = (id) => Object.prototype.hasOwnProperty.call(table, id);
    const implies = (p, a) => {
      const seen = new Set();
      const stack = [...table[a]];
      while (stack.length) { const x = stack.pop(); if (x === p) return true; if (!seen.has(x)) { seen.add(x); stack.push(...table[x]); } }
      return false;
    };
    for (const f of st.frags.filter((x) => x.from >= 0).sort((x, y) => x.from - y.from)) {
      const acts = [];
      const durations = [];
      const edges = [];
      const addAct = (id) => { if (!has(id)) { table[id] = []; acts.push(id); } };
      if (f.act && f.kind !== 'duration') addAct(f.act);
      if (f.kind === 'duration') durations.push([f.act, f.value]);
      const gives = f.gives || [];
      const redundant = gives.filter(([p, a]) => has(p) && has(a) && implies(p, a)).map((e) => e.slice());
      for (const [p, a] of gives) {
        addAct(p); addAct(a);
        if (!table[a].includes(p)) { table[a].push(p); edges.push([p, a]); }
      }
      const step = { kind: 'm0Frag', frag: f.id, adds: { acts, durations, edges }, redundant, reveals: [] };
      if (gives.length || ['precedence', 'none', 'start', 'end'].includes(f.kind)) {
        step.fields = ['m0.gives'];
        if (!gives.length) step.answer = { kind: 'none', edges: [] };
        else step.answer = { kind: redundant.length === gives.length ? 'redundant' : 'edges', edges: gives.map((e) => e.slice()) };
      }
      steps.push(step);
    }
    if (st.ref) {
      const red = C.reduce(st.ref);
      const tableOut = Object.fromEntries(red.activities.map((a) => [a.id, red.preds[a.id].slice()]));
      const removes = [];
      for (const a of Object.keys(table)) for (const p of table[a]) if (!(tableOut[a] || []).includes(p)) removes.push([p, a]);
      steps.push({ kind: 'm0Clean', table: tableOut, removes: removes.sort(byEdge), reveals: [] });
    }
    return steps;
  }

  const api = { KINDS, tokenize, build, validate, match, markWarnings, suggest, sources, moveMarks, route };
  root.PNL = root.PNL || {};
  root.PNL.statement = api;
  if (isNode) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
