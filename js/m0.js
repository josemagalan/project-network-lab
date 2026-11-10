/*
 * m0 — controlador de M0, del enunciado a la tabla (spec f2c-enunciado-tabla; plan §2 y §4, P1–P4; tableros 27–36).
 *
 * Practicar (T016): el texto del enunciado (views/statement-view), la tabla del alumno como lista (el editor del
 * taller, en modo compacto) o como matriz (views/prec-matrix), la validación explicada (redundancias con su camino,
 * ciclo con su recorrido, iniciales y finales, avisos de los subrayados) y, al pulsar «Comprobar», la corrección
 * frente a la referencia con la correspondencia de cada fila. Desde la tabla depurada se abre M1, M2 o el taller.
 *
 * Sin pistas antes de comprobar (plan §0): validation() no mira la referencia; solo diagnosis() la usa.
 * La parte sin DOM (model, proposal, applyMark, putMark, removeMark, cleanRows, openState, validation, diagnosis,
 * markLabel, fragText) se prueba en Node (tests/m0.test.js y tests/content.test.js); create() pinta la vista.
 * Para las pruebas de navegador, PNL.m0.state() da el enunciado, la tabla, los subrayados y el último diagnóstico.
 */
(function (root) {
  'use strict';

  const isNode = typeof module !== 'undefined' && module.exports;
  const req = (path, name) => (isNode ? require(path) : root.PNL[name]);
  const I = req('./i18n.js', 'i18n');
  const P = req('./core/project.js', 'project');
  const S = req('./core/statement.js', 'statement');
  const ST = req('./core/statements.js', 'statements');
  const PC = req('./core/precheck.js', 'precheck');
  const U = req('./core/urlstate.js', 'urlstate');
  const Store = req('./store.js', 'store');
  const PM = req('./views/prec-matrix.js', 'precMatrix');
  const Ed = req('./editor.js', 'editor');
  const NR = req('./narrate.js', 'narrate');
  const PR = req('./predict.js', 'predict');

  const ID_RE = /^[A-Z0-9]{1,4}$/;
  const norm = (v) => String(v == null ? '' : v).trim().toUpperCase();
  const arrow = (e) => `${e[0]} → ${e[1]}`;

  // ---------- Lógica sin DOM ----------

  function defOf(state) {
    if (state.st === 'own' && state.own) return state.own;
    return ST.get(state.st) || ST.get(U.DEFAULT_ST);
  }

  // El enunciado construido en el idioma, la tabla del alumno validada y lo que se explica sin mirar la referencia.
  function model(state, lang) {
    const def = defOf(state);
    const st = S.build(def, lang);
    const rows = (state.t || []).map((r) => Object.assign({}, r));
    const mode = state.mode === 'succ' ? 'succ' : 'pred';
    // Mientras el alumno no escribe ninguna duración, la tabla se valida solo por su estructura (como en el taller).
    const structureOnly = !!st.structureOnly || P.blankDurations(rows);
    const parsed = P.parse(rows, mode, { structureOnly });
    const marks = state.mk || [];
    return { def, st, route: S.route(st), rows, mode, parsed, project: parsed.project, report: parsed.report, explain: PC.explain(parsed),
      warnings: S.markWarnings(st, marks, parsed.project), structureOnly, marks, lang };
  }

  function fragText(st, from, to) {
    const ws = st.words.slice(Math.max(0, from), to + 1);
    return ws.map((w, k) => w.t + (k < ws.length - 1 ? w.sep : '')).join('').replace(/\s+/g, ' ').trim();
  }

  // Propuesta para un fragmento subrayado (solo mira el texto subrayado): identificador, nombre y número.
  function proposal(st, from, to, rows) {
    const used = (rows || []).map((r) => norm(r.id)).filter(Boolean);
    const sg = S.suggest(st.words, from, to, used);
    const start = sg.fromText && st.words[from] && st.words[from].t === sg.id ? from + 1 : from;
    let name = start <= to ? fragText(st, start, to) : '';
    name = name.slice(0, U.LIMITS.name).trim();
    if (name) name = name[0].toLocaleUpperCase() + name.slice(1);
    const out = { id: sg.id, fromText: sg.fromText, name };
    if (sg.value !== undefined) out.value = sg.value;
    return out;
  }

  // Lo que un subrayado nuevo hace en la tabla (spec, Behaviour): una actividad crea su fila; una duración la
  // pone (y crea la fila si no está); una frase de dependencia pone sus precedencias. Nunca borra nada.
  function applyMark(rows, mode, mark, opts) {
    const r = (rows || []).slice();
    const find = (id) => r.findIndex((x) => norm(x.id) === id);
    if (mark.kind === 'activity') {
      const id = norm(mark.act);
      if (!ID_RE.test(id)) return rows;
      const name = String((opts && opts.name) || '').slice(0, U.LIMITS.name);
      const k = find(id);
      if (k < 0) return r.concat({ id, name, duration: '', links: '' });
      if (!String(r[k].name || '').trim() && name) { r[k] = Object.assign({}, r[k], { name }); return r; }
      return rows;
    }
    if (mark.kind === 'duration') {
      const id = norm(mark.act);
      if (!ID_RE.test(id) || mark.value === undefined) return rows;
      const k = find(id);
      if (k < 0) return r.concat({ id, name: '', duration: String(mark.value), links: '' });
      r[k] = Object.assign({}, r[k], { duration: String(mark.value) });
      return r;
    }
    if (mark.kind === 'precedence') {
      let out = rows;
      for (const [p, a] of mark.gives || []) out = PM.toggle(out, mode, p, a, true);
      return out;
    }
    return rows;
  }

  // Cada palabra tiene como mucho un subrayado: el nuevo sustituye a los que pisa.
  function putMark(marks, m) {
    return (marks || []).filter((x) => x.to < m.from || x.from > m.to).concat(m).sort((x, y) => x.from - y.from);
  }
  function removeMark(marks, k) {
    const out = (marks || []).filter((_, i) => i !== k);
    return out.length ? out : null;
  }

  // La tabla depurada: la del alumno sin las precedencias redundantes (reducción transitiva), en su forma.
  function cleanRows(project, mode) {
    const red = PC.reduce(project);
    const links = mode === 'succ' ? red.succs : red.preds;
    return red.activities.map((a) => ({ id: a.id, name: a.name || '', duration: a.d == null ? '' : String(a.d), links: links[a.id].join(', ') }));
  }

  const OPEN = { m1: { v: 'route', graph: 'aon' }, m2: { v: 'route', graph: 'aoa' }, work: { v: 'work', graph: 'aon' } };
  function openState(state, where, rows, mode) {
    return Store.reduce(state, Object.assign({ type: 'open', rows, mode }, OPEN[where] || {}), 1);
  }

  const markPhrase = (m, edge) => {
    const src = S.sources(m.st, m.marks, edge, {});
    return src.mark === undefined ? null : fragText(m.st, m.marks[src.mark].from, m.marks[src.mark].to);
  };

  // Validación explicada (AC4–AC6). Solo usa la tabla y los subrayados del alumno, nunca la referencia.
  function validation(lang, m) {
    const t = (k, p) => I.t(lang, k, p);
    const out = { errors: [], cycle: null, redundant: [], ends: null, warnings: [], ok: null, note: null };
    out.errors = m.report.errors.filter((e) => e.code !== 'cycle').map((is) => Ed.issueText(lang, is));
    const cyc = m.explain.cycle;
    if (cyc && cyc.length) {
      const edges = cyc.map((x, i) => [x, cyc[(i + 1) % cyc.length]]);
      out.cycle = { ids: cyc.slice(), text: t('m0.val.cycle', { path: cyc.concat(cyc[0]).join(' → ') }),
        edges: edges.map((e) => { const f = markPhrase(m, e); return { edge: e, text: f ? t('m0.val.cycleEdgeFrom', { edge: arrow(e), frag: f }) : t('m0.val.cycleEdge', { edge: arrow(e) }) }; }) };
    }
    out.redundant = m.explain.redundant.map((r) => {
      const f = markPhrase(m, r.edge);
      const text = t('m0.val.redundant', { edge: arrow(r.edge), path: r.path.join(' → ') });
      return { edge: r.edge.slice(), path: r.path.slice(), text: f ? t('m0.val.redundantFrom', { text, frag: f }) : text };
    });
    const p = m.project;
    if (p) out.ends = t('m0.val.ends', { starts: m.explain.starts.join(', '), ends: m.explain.ends.join(', ') });
    out.warnings = m.warnings.map((w) => {
      const mk = m.marks[w.mark];
      const frag = mk ? fragText(m.st, mk.from, mk.to) : '';
      const act = w.ids[0];
      if (w.code === 'markedMissing') return t('m0.val.markedMissing', { act });
      const end = w.code === 'declEnd';
      const own = end ? p.succs[act] : p.preds[act];
      const key = own.length ? (end ? 'declEndSuccs' : 'declStartPreds') : (end ? 'declEndOthers' : 'declStartOthers');
      return t(`m0.val.${key}`, { frag, act, list: (own.length ? own : w.others).join(', ') });
    });
    if (p && !out.redundant.length && !out.errors.length) out.ok = t('m0.val.ok');
    if (out.redundant.length) out.redundantNote = t('m0.val.redundantNote');
    out.note = !p && !m.report.errors.length ? t('m0.val.empty') : t('m0.val.checkNote');
    return out;
  }

  // Corrección frente a la referencia (AC7), solo al pulsar «Comprobar».
  function diagnosis(lang, m) {
    const t = (k, p) => I.t(lang, k, p);
    if (!m.st.ref) return { ok: false, noRef: true, head: t('m0.diag.noRef'), items: [], warnings: [], deco: null };
    const match = S.match(m.st, m.marks, m.project);
    const res = PC.diagnose(m.st.ref, m.parsed, match.map, { durations: !m.st.structureOnly });
    const refFrag = (edge) => {
      const src = S.sources(m.st, [], edge, { reveal: true });
      const f = src.frag && m.st.frags.find((x) => x.id === src.frag);
      return f && f.from >= 0 ? fragText(m.st, f.from, f.to) : null;
    };
    const withFrag = (text, f, key) => (f ? t(`m0.diag.${key}`, { text, frag: f }) : text);
    const items = res.issues.map((is) => {
      const [a, b] = is.ids;
      let text;
      switch (is.code) {
        case 'missingActivity': {
          const id = is.ref[0];
          const f = m.st.frags.find((x) => x.kind === 'activity' && x.act === id && x.from >= 0);
          const ra = m.st.ref.activities.find((x) => x.id === id);
          text = t('m0.diag.missingActivity', { frag: f ? fragText(m.st, f.from, f.to) : (ra && ra.name) || id });
          break;
        }
        case 'inverted': case 'missingPrecedence':
          text = withFrag(t(`m0.diag.${is.code}`, { a, b }), refFrag(is.ref || is.ids), 'fromFrag'); break;
        case 'falsePrecedence':
          text = withFrag(t('m0.diag.falsePrecedence', { a, b }), markPhrase(m, is.ids), 'fromMark'); break;
        case 'cycle': text = t('m0.diag.cycle', { path: is.ids.concat(is.ids[0]).join(' → ') }); break;
        case 'invalid': text = t('m0.diag.invalid'); break;
        default: text = t(`m0.diag.${is.code}`, { a, b });
      }
      return { code: is.code, ids: is.ids.slice(), ref: is.ref ? is.ref.slice() : null, text };
    });
    const warnings = res.warnings.map((w) => ({ ids: w.ids.slice(), path: w.path.slice(),
      text: t('m0.diag.redundant', { a: w.ids[0], b: w.ids[1], path: w.path.join(' → ') }) }));
    const n = items.length;
    const nw = warnings.length;
    const count = (k, x) => t(x === 1 ? `m0.diag.${k}One` : `m0.diag.${k}`, { n: x });
    const head = res.ok ? t('m0.diag.ok') : [count('errors', n), nw ? count('warnings', nw) : null].filter(Boolean).join(' · ');
    const blocked = items.some((i) => i.code === 'cycle' || i.code === 'invalid');
    const bad = [...new Set(items.flatMap((i) => i.ids))];
    return { ok: res.ok, head, items, warnings, okWarn: res.ok && nw ? count('warnings', nw) : null,
      deco: blocked ? null : { map: match.map, bad, warn: [...new Set(warnings.flatMap((w) => w.ids))].filter((x) => !bad.includes(x)) } };
  }

  // Etiqueta de un subrayado en el texto y su descripción en la lista de subrayados.
  function markLabel(lang, st, mk) {
    const t = (k, p) => I.t(lang, k, p);
    const frag = fragText(st, mk.from, mk.to);
    const num = (v) => (lang === 'es' ? String(v).replace('.', ',') : String(v));
    if (mk.kind === 'activity') return { frag, badge: mk.act || '?', what: t('m0.marks.activity', { act: mk.act || '?' }) };
    if (mk.kind === 'duration') return { frag, badge: `= ${num(mk.value)}`, what: t('m0.marks.duration', { act: mk.act || '?', value: num(mk.value) }) };
    if (mk.kind === 'precedence') {
      const gives = mk.gives || [];
      const decl = mk.decl ? [t(`m0.marks.${mk.decl.end === 'end' ? 'last' : 'first'}`, { act: mk.decl.act })] : [];
      const badge = gives.map((e) => `${e[0]}→${e[1]}`).concat(decl).join(' ');
      const what = [gives.length ? t('m0.marks.precedence', { list: I.list(lang, gives.map(arrow)) }) : null,
        mk.decl ? t(`m0.marks.${mk.decl.end === 'end' ? 'declEnd' : 'declStart'}`, { act: mk.decl.act }) : null].filter(Boolean).join('; ');
      return { frag, badge: badge || '…', what: what || t('m0.marks.precedenceNone') };
    }
    return { frag, badge: t('m0.marks.noPrec'), what: t('m0.marks.noPrec') };
  }

  // Cambio de idioma de un enunciado de la herramienta: cada subrayado pasa por el fragmento que solapa (AC17).
  function switchLang(state, from, to) {
    if (!state.mk || !state.mk.length || state.st === 'own') return { marks: state.mk || null, dropped: 0 };
    const res = S.moveMarks(defOf(state), state.mk, from, to);
    return { marks: res.marks.length ? res.marks : null, dropped: res.dropped };
  }

  // Filas de un proyecto en la otra forma (predecesoras ↔ posteriores), con las duraciones vacías si no las tiene.
  const rowsOf = (project, mode) => {
    const links = mode === 'succ' ? project.succs : project.preds;
    return project.activities.map((a) => ({ id: a.id, name: a.name || '', duration: a.d == null ? '' : String(a.d), links: links[a.id].join(', ') }));
  };

  // ---------- Enunciado propio (T021, T022; AC13, AC14) ----------
  // Preparar es practicar con la tabla y los subrayados del docente, que pasan a ser la referencia y los fragmentos.

  const cellStr = (v) => String(v == null ? '' : v);
  const blankRow = (r) => ['id', 'name', 'duration', 'links'].every((k) => !cellStr(r[k]).trim());
  const emptyOwn = (lang) => ({ lang: lang === 'en' ? 'en' : 'es', text: '', frags: [], ref: null });

  // Un subrayado del docente como fragmento: «es la primera/la última» pasa a ser un fragmento «start»/«end».
  function markToFrag(mk) {
    const f = { from: mk.from, to: mk.to, kind: mk.kind };
    if (mk.kind === 'precedence' && mk.decl) { f.kind = mk.decl.end; f.act = mk.decl.act; }
    else if (mk.act !== undefined) f.act = mk.act;
    if (mk.value !== undefined) f.value = mk.value;
    if (mk.gives && mk.gives.length) f.gives = mk.gives.map((e) => e.slice());
    return f;
  }
  function fragToMark(f) {
    const mk = { from: f.from, to: f.to, kind: f.kind };
    if (f.kind === 'start' || f.kind === 'end') { mk.kind = 'precedence'; mk.decl = { end: f.kind, act: f.act }; }
    else if (f.act !== undefined) mk.act = f.act;
    if (f.value !== undefined) mk.value = f.value;
    if (f.gives && f.gives.length) mk.gives = f.gives.map((e) => e.slice());
    return mk;
  }
  const refRows = (ref) => ref.rows.map((r) => ({ id: cellStr(r.id), name: cellStr(r.name), duration: cellStr(r.duration), links: cellStr(r.links) }));

  // Del estado de «preparar» al OwnDef que viaja en el enlace.
  function ownDef(state) {
    const o = state.own || emptyOwn(state.lang);
    const rows = (state.t || []).filter((r) => !blankRow(r))
      .map((r) => ({ id: cellStr(r.id), duration: cellStr(r.duration), links: cellStr(r.links), name: cellStr(r.name) }));
    return { lang: o.lang === 'en' ? 'en' : 'es', text: cellStr(o.text), frags: (state.mk || []).map(markToFrag).sort((a, b) => a.from - b.from || a.to - b.to),
      ref: rows.length ? { mode: state.mode === 'succ' ? 'succ' : 'pred', rows } : null };
  }

  // De un enunciado propio (el que se practica) a «preparar» con su tabla y sus subrayados.
  function toPrepare(state) {
    if (state.mm === 'prepare' && state.st === 'own') return state;
    const def = state.st === 'own' && state.own ? state.own : emptyOwn(state.lang);
    return Object.assign({}, state, { v: 'm0', st: 'own', ex: null, mm: 'prepare', step: 0, sol: 0, own: { lang: def.lang, text: def.text, frags: [], ref: null },
      t: def.ref ? refRows(def.ref) : null, mk: def.frags && def.frags.length ? def.frags.map(fragToMark) : null, mode: def.ref ? def.ref.mode : state.mode });
  }

  // El enlace con la solución (sol=1) se abre una vez con la tabla y los subrayados del docente puestos.
  function openSolution(state) {
    if (state.sol !== 1) return state;
    const own = state.v === 'm0' && state.st === 'own' && state.own;
    if (!own || !own.ref || state.t || state.mk) return Object.assign({}, state, { sol: 0 });
    return Object.assign({}, state, { sol: 0, t: refRows(own.ref), mk: own.frags.length ? own.frags.map(fragToMark) : null, mode: own.ref.mode });
  }

  // Aceptar el texto del docente: límite, al menos una palabra y los subrayados que siguen casando (los de antes y
  // después del cambio, desplazados); los demás se quitan y se cuentan.
  function acceptText(state, text, textLang, uiLang) {
    const ui = uiLang || textLang;
    const tx = cellStr(text);
    const max = U.LIMITS.ownText;
    if (tx.length > max) return { error: { code: 'tooLong', text: I.t(ui, 'm0.prep.tooLong', { n: tx.length, max }) }, own: null, marks: null, dropped: 0 };
    const nw = S.tokenize(tx).words;
    if (!nw.length) return { error: { code: 'empty', text: I.t(ui, 'm0.prep.emptyText') }, own: null, marks: null, dropped: 0 };
    const ow = S.tokenize(state.own ? state.own.text : '').words;
    let p = 0;
    while (p < ow.length && p < nw.length && ow[p].t === nw[p].t) p++;
    let q = 0;
    while (q < ow.length - p && q < nw.length - p && ow[ow.length - 1 - q].t === nw[nw.length - 1 - q].t) q++;
    const shift = nw.length - ow.length;
    const marks = [];
    let dropped = 0;
    for (const mk of state.mk || []) {
      if (mk.to < p) marks.push(Object.assign({}, mk));
      else if (mk.from >= ow.length - q) marks.push(Object.assign({}, mk, { from: mk.from + shift, to: mk.to + shift }));
      else dropped++;
    }
    return { error: null, own: { lang: textLang === 'en' ? 'en' : 'es', text: tx, frags: [], ref: null }, marks: marks.length ? marks : null, dropped };
  }

  // Lo que hace falta para compartir: los dos enlaces, o por qué no los hay (ciclo, tabla con errores, subrayados
  // que no casan con la tabla, texto vacío o enlace demasiado largo), y los avisos (redundancias, precedencias que
  // no salen de ninguna frase, sin tabla).
  function share(state, lang) {
    const t = (k, p) => I.t(lang, k, p);
    const def = ownDef(state);
    const out = { def, blocked: null, issues: [], warnings: [], student: null, solution: null };
    const block = (code, issues) => { out.blocked = code; out.issues = issues; return out; };
    if (!S.tokenize(def.text).words.length) return block('empty', [{ code: 'empty', text: t('m0.prep.emptyShare') }]);
    const st = S.build(def);
    const phrase = (k) => { const f = def.frags[k]; return f ? fragText(st, f.from, f.to) : ''; };
    if (def.ref) {
      const m = model(Object.assign({}, state, { own: { lang: def.lang, text: def.text, frags: [], ref: null } }), lang);
      const cyc = m.explain.cycle;
      if (cyc && cyc.length) return block('cycle', [{ code: 'cycle', ids: cyc.slice(), text: t('m0.prep.cycle', { path: cyc.concat(cyc[0]).join(' → ') }) }]);
      if (!m.project) return block('invalid', [{ code: 'invalid', text: t('m0.prep.invalid') }]);
      out.warnings = m.explain.redundant.map((r) => ({ code: 'redundant', ids: r.edge.slice(), path: r.path.slice(),
        text: t('m0.prep.redundant', { edge: arrow(r.edge), path: r.path.join(' → ') }) }));
    } else out.warnings.push({ code: 'noRef', text: t('m0.prep.noRef') });
    const bad = [];
    for (const is of S.validate(def, { strict: false })) {
      if (is.code === 'unjustified') out.warnings.push({ code: 'unjustified', ids: is.ids.slice(), text: t('m0.prep.unjustified', { edge: arrow(is.ids) }) });
      else if (is.code === 'unknownAct') bad.push({ code: is.code, ids: is.ids.slice(), text: t('m0.prep.unknownAct', { frag: phrase(is.frag), list: is.ids.join(', ') }) });
      else if (is.code === 'fragNotInRef') bad.push({ code: is.code, ids: is.ids.slice(), text: t('m0.prep.fragNotInRef', { frag: phrase(is.frag), edge: arrow(is.ids) }) });
      else bad.push({ code: is.code, text: t('m0.prep.badFrag', { frag: phrase(is.frag) }) });
    }
    if (bad.length) return block('mismatch', bad);
    const base = Object.assign(U.defaults(), { v: 'm0', st: 'own', ex: null, own: def, lang: def.lang, mm: 'practice', tv: state.tv === 'matrix' ? 'matrix' : 'list' });
    const stu = U.encodeSafe(base);
    const sol = def.ref ? U.encodeSafe(Object.assign({}, base, { sol: 1 })) : null;
    if (!stu.hash || (sol && !sol.hash)) return block('tooLong', [{ code: 'tooLong', text: t('m0.prep.linkTooLong') }]);
    out.student = stu.hash;
    out.solution = sol ? sol.hash : null;
    return out;
  }

  // ---------- Vista ----------

  const KINDS = ['activity', 'duration', 'precedence', 'none'];
  const hasWords = (text) => S.tokenize(text || '').words.length > 0;

  function create(container, hooks) {
    const { h, clear } = root.PNL.dom;
    const lang = () => hooks.lang();
    const t = (k, p) => I.t(lang(), k, p);
    let m = null;               // último modelo
    let ul = false;             // modo «Subrayar»
    let sel = null;             // { anchor, from, to } en el texto
    let focusWord = 0;
    let panel = null;           // borrador del subrayado que se está poniendo o editando
    let pick = 0;               // redundancia elegida
    let diag = null;            // { key, res }: el último diagnóstico (solo en la página)
    let cleanOpen = false;
    let notice = null;          // aviso del cambio de idioma
    let keepNotice = false;     // el aviso acaba de ponerse: los subrayados movidos al otro idioma no lo quitan
    let lastTv = null;
    let editText = false;       // preparar: el cuadro de texto está abierto
    let draft = null;           // preparar: { text, lang, err } del cuadro de texto
    let copied = null;          // preparar: { which, hash, url, ok } del último enlace copiado

    // Esqueleto: barra, texto (izquierda) y tabla, validación, corrección y salida (derecha).
    const selSt = h('select', { id: 'm0St', onchange: (e) => { closePanel(); hooks.dispatch({ type: 'm0', st: e.target.value, mm: 'practice' }, { push: true }); } });
    const btnList = h('button', { type: 'button', onclick: () => hooks.dispatch({ type: 'set', key: 'tv', value: 'list' }) });
    const btnMatrix = h('button', { type: 'button', onclick: () => hooks.dispatch({ type: 'set', key: 'tv', value: 'matrix' }) });
    const btnUl = h('button', { type: 'button', class: 'ghost', id: 'm0Ul', onclick: () => { ul = !ul; sel = null; draw({ focusText: ul }); } });
    const btnCheck = h('button', { type: 'button', class: 'ghost primary', id: 'm0Check', onclick: check });
    const lblSt = h('span', {});
    const segTv = h('div', { class: 'seg', role: 'group' }, [btnList, btnMatrix]);
    // Modos (T018, T022, T024): practicar, ruta paso a paso y preparar un enunciado propio. De «preparar» a los otros dos
    // se practica el enunciado tal como lo vería el alumno; de un enunciado propio a «preparar», con la tabla y los
    // subrayados del docente. Los dos saltos dejan una entrada en el historial.
    const setMode = (mm) => {
      const s = hooks.state();
      if (s.mm === mm) return;
      closePanel(); ul = false; hooks.stop(); copied = null;
      if (mm === 'prepare') {
        const p = toPrepare(s);
        editText = !hasWords(p.own.text); draft = null;
        hooks.dispatch({ type: 'm0', st: 'own', own: p.own, rows: p.t, marks: p.mk, mode: p.mode, mm: 'prepare' }, { push: true });
        return;
      }
      if (s.mm === 'prepare') { hooks.dispatch({ type: 'm0', st: 'own', own: ownDef(s), mm }, { push: true }); return; }
      hooks.dispatch({ type: 'set', key: 'mm', value: mm }); hooks.dispatch({ type: 'first' });
    };
    const btnPractice = h('button', { type: 'button', id: 'm0Practice', onclick: () => setMode('practice') });
    const btnRoute = h('button', { type: 'button', id: 'm0Route', onclick: () => setMode('route') });
    const btnPrepare = h('button', { type: 'button', id: 'm0Prepare', onclick: () => setMode('prepare') });
    const segMode = h('div', { class: 'seg', role: 'group' }, [btnPractice, btnRoute, btnPrepare]);
    const btnLearn = h('button', { type: 'button', class: 'ghost', id: 'm0Learn', onclick: () => hooks.learn() });
    const bar = h('div', { class: 'card m0-bar' }, [h('label', { class: 'small' }, [lblSt, ' ', selSt]), segMode, segTv, h('div', { class: 'row-wrap push' }, [btnUl, btnCheck, btnLearn])]);
    const textHead = h('h2', { id: 'm0TextHead' });
    const textSrc = h('p', { class: 'muted small m0-src' });
    const textHint = h('p', { class: 'small m0-hint', id: 'm0Hint' });
    const textNotice = h('p', { class: 'banner small', role: 'status', hidden: true });
    // En el móvil el texto se desplaza por dentro (tablero 35); por eso se alcanza también con el teclado.
    const textBody = h('div', { class: 'm0-textbody', tabindex: '0' });
    const marksBox = h('div', { class: 'm0-marks' });
    // Preparar (T022): el cuadro de texto del docente, o el botón para volver a él.
    const prepBox = h('div', { class: 'm0-prep', hidden: true });
    const btnEditText = h('button', { type: 'button', class: 'ghost', id: 'm0EditText', hidden: true, onclick: () => { closePanel(); ul = false; editText = true; draft = null; draw({ focusDraft: true }); } });
    const textCard = h('section', { class: 'card m0-text', 'aria-labelledby': 'm0TextHead' }, [textHead, textSrc, textNotice, textHint, prepBox, textBody, marksBox, btnEditText]);
    const panelBox = h('section', { class: 'card m0-panel', role: 'dialog', 'aria-modal': 'false', 'aria-labelledby': 'm0PanelHead', hidden: true });
    const tableHead = h('h2', { id: 'm0TableHead' });
    const tableCount = h('span', { class: 'chip' });
    const listBox = h('div', { class: 'm0-list' });
    const matrixBox = h('div', { class: 'm0-matrix', role: 'region' });
    const tableCard = h('section', { class: 'card m0-table', 'aria-labelledby': 'm0TableHead' }, [h('div', { class: 'm0-head' }, [tableHead, tableCount]), listBox, matrixBox]);
    const valHead = h('h2', { id: 'm0ValHead' });
    const valBody = h('div', { 'aria-live': 'polite' });
    const valCard = h('section', { class: 'card m0-val', 'aria-labelledby': 'm0ValHead' }, [valHead, valBody]);
    const diagHead = h('h2', { id: 'm0DiagHead' });
    const diagBody = h('div', {});
    const diagCard = h('section', { class: 'card m0-diag', 'aria-labelledby': 'm0DiagHead', hidden: true }, [diagHead, diagBody]);
    const openBox = h('div', { class: 'm0-open' });
    const shareHead = h('h2', { id: 'm0ShareHead' });
    const shareBody = h('div', {});
    const shareCard = h('section', { class: 'card m0-share', 'aria-labelledby': 'm0ShareHead', hidden: true }, [shareHead, shareBody]);
    // Ruta paso a paso (T018): el paso con su predicción, la tabla hasta el paso y el reproductor.
    const rHead = h('h2', { id: 'm0StepHead', class: 'eyebrow' });
    const rText = h('p', { class: 'm0-step-text' });
    const rPredict = h('div', { class: 'predict m0-predict' });
    const rStep = h('section', { class: 'card m0-step', 'aria-labelledby': 'm0StepHead' }, [rHead, rText, rPredict]);
    const rTableHead = h('h2', { id: 'm0RTableHead' });
    // A 360 px la tabla se desplaza dentro de su caja (T025): se alcanza con el teclado y, con el foco en ella, las flechas
    // la desplazan en lugar de cambiar de paso.
    const rTableBody = h('div', { class: 'scroll-box', tabindex: '0', 'data-own-keys': '' });
    const rOpen = h('div', { class: 'm0-open' });
    const rTable = h('section', { class: 'card m0-table', 'aria-labelledby': 'm0RTableHead' }, [rTableHead, rTableBody, rOpen]);
    const rCounter = h('span', {});
    const rFirst = h('button', { type: 'button', onclick: () => hooks.dispatch({ type: 'first' }) }, ['⏮']);
    const rPrev = h('button', { type: 'button', onclick: () => hooks.dispatch({ type: 'prev' }) }, ['←']);
    const rPlay = h('button', { type: 'button', class: 'primary', onclick: () => hooks.togglePlay() });
    const rNext = h('button', { type: 'button', onclick: () => hooks.dispatch({ type: 'next' }) }, ['→']);
    const rPred = h('input', { type: 'checkbox', onchange: (e) => hooks.dispatch({ type: 'set', key: 'pred', value: e.target.checked ? 1 : 0 }) });
    const rPredLbl = h('span', {});
    const rKeys = h('span', { class: 'muted small center' });
    const rBar = h('div', { class: 'bar' }, [h('div', { class: 'm0-fill' })]);
    const rPlayer = h('div', { class: 'card player m0-player' }, [h('div', { class: 'player-buttons' }, [rFirst, rPrev, rPlay, rNext]),
      h('div', { class: 'm0-player-info' }, [h('span', { class: 'muted small' }, [rCounter]), rBar, h('label', { class: 'check' }, [rPred, ' ', rPredLbl])]), rKeys]);
    const right = h('div', { class: 'm0-right' }, [panelBox, tableCard, valCard, diagCard, openBox, shareCard, rStep, rPlayer, rTable]);
    clear(container);
    container.appendChild(bar);
    container.appendChild(h('div', { class: 'm0-grid' }, [textCard, right]));

    const editor = Ed.create(listBox, { compact: true, radioName: 'pnlModeM0', state: hooks.state, lang, dispatch: hooks.dispatch,
      loadExample: () => {}, toggleComputed: () => {}, goStage: () => {},
      switchMode: (mode) => {
        const s = hooks.state();
        const rows = m && m.project ? rowsOf(m.project, mode) : (s.t || []);
        hooks.dispatch({ type: 'set', key: 'mode', value: mode });
        hooks.dispatch({ type: 'table', rows });
      } });

    const diagKey = () => JSON.stringify([m.st.id, m.rows, m.mode, m.marks]);
    const curDiag = () => (diag && m && diag.key === diagKey() ? diag.res : null);

    function check() {
      if (!m || !m.st.ref) return;
      diag = { key: diagKey(), res: diagnosis(lang(), m) };
      draw({ focusDiag: true });
    }

    // ---------- Subrayar ----------

    const markAt = (i) => m.marks.findIndex((x) => i >= x.from && i <= x.to);
    function openPanel(from, to, edit) {
      const rows = m.rows;
      const mk = edit !== null && edit !== undefined ? m.marks[edit] : null;
      const pr = proposal(m.st, from, to, rows);
      const prevAct = [...m.marks].reverse().find((x) => x.to < from && x.kind === 'activity');
      panel = { from, to, edit: mk ? edit : null, kind: mk ? mk.kind : 'activity', id: mk && mk.act ? mk.act : pr.id, fromText: !mk && pr.fromText, name: pr.name,
        act: mk && mk.act ? mk.act : (pr.fromText ? pr.id : (prevAct ? prevAct.act : '')), value: mk && mk.value !== undefined ? String(mk.value) : (pr.value !== undefined ? String(pr.value) : ''),
        gives: new Set(mk && mk.gives ? mk.gives.map((e) => e.join('>')) : []), adds: [], declAct: mk && mk.decl ? mk.decl.act : '', declEnd: mk && mk.decl ? mk.decl.end : 'end', err: null };
      // Un fragmento con un número es, casi siempre, una duración («D=7», «2 días»).
      if (!mk && pr.value !== undefined) panel.kind = 'duration';
      sel = { anchor: null, from, to };
      draw({ focusPanel: true });
    }
    function closePanel(back) {
      const to = panel ? panel.to : null;
      panel = null; sel = null;
      if (back && to !== null) { focusWord = to; if (m) draw({ focusText: ul }); }
    }
    function onWord(i, e) {
      focusWord = i;
      if (sel && sel.anchor !== null && sel.anchor !== undefined) { openPanel(Math.min(sel.anchor, i), Math.max(sel.anchor, i), null); return; }
      const k = markAt(i);
      if (k >= 0) { openPanel(m.marks[k].from, m.marks[k].to, k); return; }
      sel = { anchor: i, from: i, to: i };
      draw({ focusText: true });
      if (e) e.preventDefault();
    }
    function onKey(i, e) {
      const n = m.st.words.length;
      const go = (j) => { focusWord = Math.max(0, Math.min(n - 1, j)); };
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft' || e.key === 'Home' || e.key === 'End') {
        e.preventDefault(); e.stopPropagation();
        const j = e.key === 'Home' ? 0 : e.key === 'End' ? n - 1 : i + (e.key === 'ArrowRight' ? 1 : -1);
        if (e.shiftKey) {
          const anchor = sel && sel.anchor !== null && sel.anchor !== undefined ? sel.anchor : i;
          go(j);
          sel = { anchor, from: Math.min(anchor, focusWord), to: Math.max(anchor, focusWord) };
        } else { go(j); if (sel && sel.from === sel.to) sel = null; }
        draw({ focusText: true });
      } else if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault(); e.stopPropagation();
        if (sel && sel.to > sel.from) { openPanel(sel.from, sel.to, null); return; }
        const k = markAt(i);
        if (k >= 0) openPanel(m.marks[k].from, m.marks[k].to, k); else openPanel(i, i, null);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        sel = null; draw({ focusText: true });
      }
    }

    function confirmPanel() {
      const p = panel;
      const mk = { from: p.from, to: p.to, kind: p.kind };
      let rows = m.rows;
      if (p.kind === 'activity') {
        const id = norm(p.id);
        if (!ID_RE.test(id)) { p.err = t('m0.ul.badId'); draw({ focusPanel: true }); return; }
        mk.act = id;
        rows = applyMark(rows, m.mode, mk, { name: p.name });
      } else if (p.kind === 'duration') {
        const id = norm(p.act);
        const v = P.parseDuration(p.value);
        if (!ID_RE.test(id)) { p.err = t('m0.ul.pickAct'); draw({ focusPanel: true }); return; }
        if (v === null) { p.err = t('m0.ul.badValue'); draw({ focusPanel: true }); return; }
        mk.act = id; mk.value = v;
        rows = applyMark(rows, m.mode, mk);
      } else if (p.kind === 'precedence') {
        const adds = p.adds.filter(([a, b]) => a && b && a !== b);
        rows = applyMark(rows, m.mode, { kind: 'precedence', gives: adds });
        const gives = [...new Set([...p.gives, ...adds.map((e) => e.join('>'))])].map((x) => x.split('>'));
        if (gives.length) mk.gives = gives;
        if (p.declAct) mk.decl = { end: p.declEnd, act: p.declAct };
      }
      let marks = m.marks.slice();
      if (p.edit !== null) marks = removeMark(marks, p.edit) || [];
      marks = putMark(marks, mk);
      const back = p.to;
      panel = null; sel = null; focusWord = back;
      if (rows !== m.rows) hooks.dispatch({ type: 'table', rows });
      hooks.dispatch({ type: 'marks', value: marks }, { focusText: ul });
    }
    function removePanel() {
      const k = panel.edit;
      focusWord = panel.to;
      panel = null; sel = null;
      hooks.dispatch({ type: 'marks', value: removeMark(m.marks, k) }, { focusText: ul });
    }

    function drawPanel() {
      clear(panelBox);
      panelBox.hidden = !panel;
      if (!panel) return;
      const p = panel;
      const frag = fragText(m.st, p.from, p.to);
      const short = frag.length > 60 ? `${frag.slice(0, 57)}…` : frag;
      panelBox.appendChild(h('h2', { id: 'm0PanelHead' }, [t(p.edit !== null ? 'm0.ul.titleEdit' : 'm0.ul.title', { frag: short })]));
      const kinds = h('fieldset', { class: 'm0-kinds' }, [h('legend', { class: 'sr-only' }, [t('m0.ul.kind')]), ...KINDS.map((k) => h('label', {}, [
        h('input', { type: 'radio', name: 'm0Kind', value: k, checked: p.kind === k, onchange: () => { p.kind = k; p.err = null; draw({ keepFocus: true }); } }), t(`m0.kinds.${k}`)]))]);
      panelBox.appendChild(kinds);
      const ids = PM.model(m.rows, m.mode).ids;
      const idSelect = (value, label, onchange, empty) => h('select', { 'aria-label': label, onchange: (e) => onchange(e.target.value) },
        [empty ? h('option', { value: '' }, [empty]) : null, ...ids.map((x) => h('option', { value: x, selected: x === value }, [x]))]);
      const fields = h('div', { class: 'm0-fields' });
      if (p.kind === 'activity') {
        fields.appendChild(h('label', {}, [t('m0.ul.actId'), h('input', { value: p.id, maxlength: '4', class: 'short', oninput: (e) => { p.id = e.target.value; } }),
          p.fromText ? h('span', { class: 'muted small' }, [`(${t('m0.ul.fromText', { id: p.id })})`]) : null]));
        fields.appendChild(h('label', { class: 'grow' }, [t('m0.ul.actName'), h('input', { value: p.name, maxlength: String(U.LIMITS.name), oninput: (e) => { p.name = e.target.value; } })]));
      } else if (p.kind === 'duration') {
        fields.appendChild(h('label', {}, [t('m0.ul.durAct'), h('input', { value: p.act, maxlength: '4', class: 'short', oninput: (e) => { p.act = e.target.value; } })]));
        fields.appendChild(h('label', {}, [t('m0.ul.durValue'), h('input', { value: p.value, inputmode: 'decimal', class: 'short', oninput: (e) => { p.value = e.target.value; } })]));
      } else if (p.kind === 'precedence') {
        const edges = [...PM.model(m.rows, m.mode).has].sort();
        const ex = h('fieldset', { class: 'm0-edges' }, [h('legend', {}, [t('m0.ul.linkExisting')]),
          ...(edges.length ? edges.map((k) => h('label', {}, [h('input', { type: 'checkbox', checked: p.gives.has(k),
            onchange: (e) => { if (e.target.checked) p.gives.add(k); else p.gives.delete(k); } }), k.replace('>', ' → ')])) : [h('span', { class: 'muted small' }, [t('m0.ul.noEdges')])])]);
        fields.appendChild(ex);
        let a = ids[0] || '';
        let b = ids[1] || ids[0] || '';
        const adds = h('fieldset', { class: 'm0-add' }, [h('legend', {}, [t('m0.ul.addEdge')]),
          h('label', {}, [t('m0.ul.from'), idSelect(a, t('m0.ul.from'), (v) => { a = v; })]), ' → ',
          h('label', {}, [t('m0.ul.to'), idSelect(b, t('m0.ul.to'), (v) => { b = v; })]),
          h('button', { type: 'button', class: 'ghost', disabled: ids.length < 2, onclick: () => { if (a && b && a !== b && !p.adds.some((e) => e[0] === a && e[1] === b)) p.adds.push([a, b]); draw({ keepFocus: true }); } }, [t('m0.ul.add')]),
          p.adds.length ? h('span', { class: 'small' }, [p.adds.map(arrow).join(', ')]) : null]);
        fields.appendChild(adds);
        fields.appendChild(h('fieldset', { class: 'm0-add' }, [h('legend', {}, [t('m0.ul.declare')]),
          idSelect(p.declAct, t('m0.ul.declare'), (v) => { p.declAct = v; }, t('m0.ul.declNone')),
          h('select', { 'aria-label': t('m0.ul.declare'), onchange: (e) => { p.declEnd = e.target.value; } }, [
            h('option', { value: 'start', selected: p.declEnd === 'start' }, [t('m0.ul.declStart')]), h('option', { value: 'end', selected: p.declEnd === 'end' }, [t('m0.ul.declEnd')])])]));
      } else fields.appendChild(h('p', { class: 'muted small' }, [t('m0.ul.noneNote')]));
      panelBox.appendChild(fields);
      if (p.err) panelBox.appendChild(h('p', { class: 'm0-err small', role: 'alert' }, [p.err]));
      panelBox.appendChild(h('div', { class: 'row-wrap' }, [
        h('button', { type: 'button', class: 'ghost primary', id: 'm0PanelOk', onclick: confirmPanel }, [t(p.edit !== null ? 'm0.ul.save' : 'm0.ul.ok')]),
        p.edit !== null ? h('button', { type: 'button', class: 'ghost', onclick: removePanel }, [t('m0.ul.remove')]) : null,
        h('button', { type: 'button', class: 'ghost', onclick: () => closePanel(true) }, [t('m0.ul.cancel')])]));
    }

    function drawMarks() {
      clear(marksBox);
      const items = m.marks.map((mk, k) => {
        const l = markLabel(lang(), m.st, mk);
        return h('li', {}, [h('span', {}, [`«${l.frag}»: ${l.what}`]),
          h('button', { type: 'button', class: 'linklike', 'data-fk': `mk-e-${k}`, onclick: () => openPanel(mk.from, mk.to, k) }, [t('m0.marks.edit')]),
          h('button', { type: 'button', class: 'linklike', 'data-fk': `mk-r-${k}`, onclick: () => hooks.dispatch({ type: 'marks', value: removeMark(m.marks, k) }) }, [t('m0.marks.remove')])]);
      });
      const det = h('details', { open: m.marks.length > 0 && m.marks.length <= 3 ? null : null }, [h('summary', {}, [t('m0.marks.title', { n: m.marks.length })]),
        m.marks.length ? h('ul', { class: 'small' }, items) : h('p', { class: 'muted small' }, [t('m0.marks.none')])]);
      marksBox.appendChild(det);
    }

    function drawText(o) {
      textHead.textContent = t(ul ? 'm0.textUnderline' : 'm0.text');
      textSrc.textContent = m.def.source ? t('m0.source', { src: m.def.source[lang()] }) : '';
      textSrc.hidden = !m.def.source;
      textNotice.hidden = !notice;
      textNotice.textContent = notice || '';
      textHint.hidden = !ul;
      textHint.textContent = sel && sel.anchor !== null && sel.anchor !== undefined ? t('m0.ul.pickEnd') : t('m0.ul.hint');
      root.PNL.statementView.render(textBody, { st: m.st, marks: m.marks, label: (mk) => markLabel(lang(), m.st, mk), underline: ul,
        sel: sel ? { from: sel.from, to: sel.to } : null, focus: focusWord, hl: null, region: t('m0.textUnderline'), hintId: 'm0Hint',
        onWord, onKey, focusNow: !!(o && o.focusText) });
      drawMarks();
    }

    function decoration(v, d) {
      const red = v.redundant;
      const chosen = red.length ? red[Math.min(pick, red.length - 1)] : null;
      const deco = { cycle: v.cycle ? v.cycle.ids : null, redundant: red.map((r) => r.edge), path: chosen ? { edge: chosen.edge, path: chosen.path } : null };
      if (d && d.deco) Object.assign(deco, d.deco);
      return deco;
    }

    function drawValidation(v) {
      valHead.textContent = t('m0.validation');
      clear(valBody);
      const p = (x, cls) => h('p', { class: cls || null }, [x]);
      if (v.errors.length) valBody.appendChild(h('div', { class: 'issues err' }, [h('strong', {}, [v.errors.length === 1 ? t('work.errorsOne') : t('work.errors', { n: v.errors.length })]), ...v.errors.map((x) => p(x))]));
      if (v.cycle) valBody.appendChild(h('div', { class: 'issues err' }, [h('p', {}, [h('strong', {}, [v.cycle.text])]), h('ul', {}, v.cycle.edges.map((e) => h('li', {}, [e.text])))]));
      if (v.redundant.length) {
        const chosen = Math.min(pick, v.redundant.length - 1);
        valBody.appendChild(h('div', { class: 'issues warn' }, [
          h('strong', {}, [v.redundant.length === 1 ? t('work.warningsOne') : t('work.warnings', { n: v.redundant.length })]),
          h('ul', { class: 'm0-reds' }, v.redundant.map((r, k) => h('li', {}, [h('button', { type: 'button', class: 'm0-red', 'data-fk': `red-${k}`, 'aria-pressed': String(k === chosen),
            onclick: () => { pick = k; draw({ keepFocus: true }); } }, [r.text])]))),
          p(v.redundantNote, 'small')]));
      }
      if (v.ok) valBody.appendChild(p(v.ok));
      if (v.ends) valBody.appendChild(p(v.ends));
      if (v.warnings.length) valBody.appendChild(h('div', { class: 'issues warn' }, v.warnings.map((x) => p(x))));
      if (v.note) valBody.appendChild(p(v.note, 'muted small'));
    }

    function drawDiag(d, focus) {
      diagCard.hidden = !d;
      clear(diagBody);
      if (!d) return;
      diagHead.textContent = t('m0.correction');
      diagBody.appendChild(h('p', { class: `m0-head-line ${d.ok ? 'ok' : 'bad'}`, role: 'status', tabindex: '-1', id: 'm0DiagLine' }, [h('strong', {}, [d.head]), d.okWarn ? ` · ${d.okWarn}` : '']));
      if (d.items.length) diagBody.appendChild(h('ul', {}, d.items.map((i) => h('li', {}, [i.text]))));
      if (d.warnings.length) diagBody.appendChild(h('ul', { class: 'muted' }, d.warnings.map((w) => h('li', {}, [w.text]))));
      if (focus) diagBody.querySelector('#m0DiagLine').focus();
    }

    function drawOpen() {
      clear(openBox);
      const p = m.project;
      const cyc = !!m.explain.cycle;
      const ok = !!p && !cyc;
      const noM1 = ok && m.structureOnly;
      const go = (where) => hooks.open(where, cleanRows(p, m.mode), m.mode);
      openBox.appendChild(h('div', { class: 'row-wrap' }, [h('span', { class: 'small' }, [`${t('m0.open.label')}:`]),
        h('button', { type: 'button', class: 'ghost', id: 'm0OpenM1', disabled: !ok || noM1, onclick: () => go('m1') }, [t('m0.open.m1')]),
        h('button', { type: 'button', class: 'ghost', id: 'm0OpenM2', disabled: !ok, onclick: () => go('m2') }, [t('m0.open.m2')]),
        h('button', { type: 'button', class: 'ghost', id: 'm0OpenWork', disabled: !ok, onclick: () => go('work') }, [t('m0.open.work')]),
        h('button', { type: 'button', class: 'linklike', disabled: !ok, 'aria-expanded': String(ok && cleanOpen), 'data-fk': 'clean', onclick: () => { cleanOpen = !cleanOpen; draw({ keepFocus: true }); } },
          [t(cleanOpen && ok ? 'm0.open.hide' : 'm0.open.show')])]));
      if (!ok && (m.rows.length || cyc)) openBox.appendChild(h('p', { class: 'muted small' }, [t('m0.open.disabled')]));
      else if (noM1) openBox.appendChild(h('p', { class: 'muted small' }, [t('m0.open.noM1')]));
      if (ok && cleanOpen) {
        const rows = cleanRows(p, m.mode);
        const red = m.explain.redundant.map((r) => arrow(r.edge));
        openBox.appendChild(h('table', { class: 'data m0-clean' }, [h('caption', {}, [t('m0.open.caption')]),
          h('thead', {}, [h('tr', {}, [h('th', { scope: 'col' }, [t('work.colId')]), h('th', { scope: 'col' }, [t(m.mode === 'succ' ? 'work.colSucc' : 'work.colPred')])])]),
          h('tbody', {}, rows.map((r) => h('tr', {}, [h('th', { scope: 'row' }, [r.id]), h('td', {}, [r.links || '—'])])))]));
        openBox.appendChild(h('p', { class: 'muted small' }, [red.length ? t('m0.open.removed', { list: I.list(lang(), red) }) : t('m0.open.same')]));
      }
    }

    function drawBar() {
      lblSt.textContent = t('m0.statement');
      const visible = ST.list();
      const cur = m.st.id;
      const opts = visible.concat(visible.some((s) => s.id === cur) || cur === 'own' ? [] : [ST.get(cur)]).filter(Boolean);
      clear(selSt);
      for (const s of opts) selSt.appendChild(h('option', { value: s.id, selected: s.id === cur }, [s.title[lang()]]));
      if (cur === 'own') selSt.appendChild(h('option', { value: 'own', selected: true }, [t('m0.own')]));
      selSt.value = cur;
      segTv.setAttribute('aria-label', t('m0.tableView'));
      btnList.textContent = t('m0.list'); btnMatrix.textContent = t('m0.matrixView');
      const tv = hooks.state().tv;
      btnList.setAttribute('aria-pressed', String(tv !== 'matrix'));
      btnMatrix.setAttribute('aria-pressed', String(tv === 'matrix'));
      btnUl.textContent = t('m0.underline');
      btnUl.setAttribute('aria-pressed', String(ul));
      btnCheck.textContent = t('m0.check');
      btnCheck.hidden = hooks.state().mm === 'prepare';
      btnCheck.disabled = !m.st.ref;
      btnCheck.title = m.st.ref ? '' : t('m0.diag.noRef');
    }

    // ---------- Preparar un enunciado propio (T022) ----------

    function useText() {
      const s = hooks.state();
      const res = acceptText(s, draft.text, draft.lang, lang());
      if (res.error) { draft.err = res.error.text; draw({ focusDraft: true }); return; }
      editText = false; draft = null; copied = null;
      notice = res.dropped ? (res.dropped === 1 ? t('m0.prep.droppedOne') : t('m0.prep.dropped', { n: res.dropped })) : null;
      keepNotice = !!res.dropped;
      hooks.dispatch({ type: 'm0', st: 'own', own: res.own, rows: s.t, marks: res.marks, mode: s.mode, mm: 'prepare' }, { focusTextBody: true });
    }

    function drawPrepText(o) {
      clear(prepBox);
      const own = hooks.state().own || { text: '', lang: lang() };
      if (!draft) draft = { text: own.text || '', lang: own.lang || lang(), err: null };
      const max = U.LIMITS.ownText;
      const count = h('span', { class: 'muted small', id: 'm0DraftCount' });
      const setCount = () => { count.textContent = t('m0.prep.count', { n: draft.text.length, max }); count.classList.toggle('m0-over', draft.text.length > max); };
      setCount();
      const area = h('textarea', { id: 'm0Draft', rows: '12', spellcheck: 'true', 'aria-describedby': 'm0DraftCount m0DraftIntro',
        oninput: (e) => { draft.text = e.target.value; setCount(); } });
      area.value = draft.text;
      const langSel = h('select', { id: 'm0DraftLang', onchange: (e) => { draft.lang = e.target.value; } },
        [h('option', { value: 'es', lang: 'es', selected: draft.lang === 'es' }, ['Español']), h('option', { value: 'en', lang: 'en', selected: draft.lang === 'en' }, ['English'])]);
      prepBox.appendChild(h('p', { class: 'small', id: 'm0DraftIntro' }, [t('m0.prep.intro')]));
      prepBox.appendChild(h('label', { class: 'm0-draft', for: 'm0Draft' }, [t('m0.prep.textLabel')]));
      prepBox.appendChild(area);
      prepBox.appendChild(count);
      if (draft.err) prepBox.appendChild(h('p', { class: 'm0-err small', role: 'alert' }, [draft.err]));
      prepBox.appendChild(h('div', { class: 'row-wrap' }, [h('label', { class: 'small' }, [t('m0.prep.textLang'), ' ', langSel]),
        h('button', { type: 'button', class: 'ghost primary', id: 'm0UseText', onclick: useText }, [t('m0.prep.use')]),
        hasWords(own.text) ? h('button', { type: 'button', class: 'ghost', onclick: () => { editText = false; draft = null; draw({ focusTextBody: true }); } }, [t('m0.prep.cancel')]) : null]));
      if (o && o.focusDraft) area.focus();
    }

    function copyLink(which, hash) {
      const url = root.location.href.split('#')[0] + hash;
      copied = { which, hash, url, ok: null };
      const done = (ok) => { if (copied && copied.hash === hash) { copied.ok = ok; draw({ keepFocus: true }); } };
      const cb = root.navigator && root.navigator.clipboard;
      if (cb && cb.writeText) cb.writeText(url).then(() => done(true), () => done(false)); else done(false);
    }

    function drawShare() {
      shareHead.textContent = t('m0.prep.share');
      clear(shareBody);
      const res = share(hooks.state(), lang());
      const p = (x, cls) => h('p', { class: cls || null }, [x]);
      if (res.blocked) shareBody.appendChild(h('div', { class: 'issues err' }, res.issues.map((i) => p(i.text))));
      else shareBody.appendChild(p(t('m0.prep.ready')));
      if (!res.blocked && res.warnings.length) shareBody.appendChild(h('div', { class: 'issues warn' }, [h('ul', {}, res.warnings.map((w) => h('li', {}, [w.text])))]));
      shareBody.appendChild(h('div', { class: 'row-wrap' }, [
        h('button', { type: 'button', class: 'ghost primary', id: 'm0CopyStudent', 'data-fk': 'copy-student', disabled: !res.student, onclick: () => copyLink('student', res.student) }, [t('m0.prep.copyStudent')]),
        h('button', { type: 'button', class: 'ghost', id: 'm0CopySolution', 'data-fk': 'copy-solution', disabled: !res.solution, onclick: () => copyLink('solution', res.solution) }, [t('m0.prep.copySolution')])]));
      if (copied && copied.hash !== res[copied.which]) copied = null;
      if (copied) {
        const msg = copied.ok === null ? '' : copied.ok ? t(copied.which === 'student' ? 'm0.prep.copiedStudent' : 'm0.prep.copiedSolution') : t('m0.prep.copyFail');
        shareBody.appendChild(h('p', { class: 'small', role: 'status', id: 'm0CopyStatus' }, [msg]));
        shareBody.appendChild(h('label', { class: 'small m0-link' }, [t('m0.prep.link'),
          h('input', { type: 'text', readonly: true, id: 'm0Link', value: copied.url, onfocus: (e) => e.target.select() })]));
      }
      shareBody.appendChild(p(t('m0.prep.shareNote'), 'muted small'));
    }

    // ---------- Ruta paso a paso ----------

    let lastStep = null;

    function drawRoutePredict(step, k) {
      clear(rPredict);
      const s = hooks.state();
      rPredict.hidden = !(s.pred && step.fields);
      if (rPredict.hidden) return;
      const pred = hooks.pred();
      if (!pred.answers.has(PR.M0_GIVES)) pred.answers.set(PR.M0_GIVES, new Set());
      const chosen = pred.answers.get(PR.M0_GIVES);
      const shown = pred.done && !pred.result;
      const want = new Set(step.answer.edges.map((e) => e.join('>')).concat(step.answer.kind === 'none' ? ['none'] : step.answer.kind === 'redundant' ? ['redundant'] : []));
      const diff = pred.result ? PR.m0Diff(step, pred.answers) : null;
      const res = pred.result ? pred.result.get(PR.M0_GIVES) : null;
      const mark = (key) => {
        if (!diff) return null;
        const bad = diff.missing.includes(key) ? 'missing' : diff.extra.includes(key) ? 'extra'
          : (key === 'none' && diff.none) || (key === 'redundant' && diff.redundant) ? (chosen.has(key) ? 'extra' : 'missing') : null;
        return bad ? h('span', { class: 'mark wrong' }, [`✗ ${t(`m0.rt.${bad}`)}`]) : null;
      };
      const box = (key, label) => h('label', { class: diff && mark(key) ? 'wrong' : '' }, [
        h('input', { type: 'checkbox', checked: shown ? want.has(key) : chosen.has(key), disabled: shown, onchange: (e) => { if (e.target.checked) chosen.add(key); else chosen.delete(key); } }),
        label, mark(key)]);
      const f = m.st.frags.find((x) => x.id === step.frag);
      const { cands, ids: known, label: optLabel } = routeOptions(m.st, m.route, k);
      const lbl = (key) => key.replace('>', ' → ');
      // La pregunta ya está en el texto del paso: la leyenda queda para el lector de pantalla.
      const fs = h('fieldset', { class: 'rule-acts' }, [h('legend', { class: 'sr-only' }, [t('m0.rt.question', { frag: fragText(m.st, f.from, f.to) })])]);
      if (cands) cands.forEach((key) => fs.appendChild(box(key, lbl(key))));
      else {
        const extra = [...(shown ? want : chosen)].filter((x) => x.includes('>'));
        extra.forEach((key) => fs.appendChild(box(key, lbl(key))));
        let a = known[0] || '';
        let b = known[1] || known[0] || '';
        const sel = (v, label, on) => h('select', { 'aria-label': label, disabled: shown, onchange: (e) => on(e.target.value) }, known.map((x) => h('option', { value: x, selected: x === v }, [optLabel(x)])));
        fs.appendChild(h('span', { class: 'm0-add-edge' }, [h('label', {}, [t('m0.rt.from'), ' ', sel(a, t('m0.rt.from'), (v) => { a = v; })]), ' → ',
          h('label', {}, [t('m0.rt.to'), ' ', sel(b, t('m0.rt.to'), (v) => { b = v; })]),
          h('button', { type: 'button', class: 'ghost', disabled: shown || known.length < 2, onclick: () => { if (a && b && a !== b) chosen.add(`${a}>${b}`); draw({ keepFocus: true }); }, 'data-fk': 'rt-add' }, [t('m0.rt.add')])]));
        if (diff && diff.missing.length) fs.appendChild(h('p', { class: 'mark wrong' }, [`✗ ${t('m0.rt.missing')}: ${diff.missing.map(lbl).join(', ')}`]));
      }
      fs.appendChild(box('none', t('m0.rt.none')));
      fs.appendChild(box('redundant', t('m0.rt.redundant')));
      rPredict.appendChild(fs);
      if (res === 'ok') rPredict.appendChild(h('p', { class: 'mark ok' }, [`✓ ${t('predict.ok')}`]));
      rPredict.appendChild(h('div', { class: 'row-wrap' }, [
        h('button', { type: 'button', class: 'ghost primary', id: 'm0PredCheck', onclick: () => hooks.predCheck(step) }, [t('predict.check')]),
        h('button', { type: 'button', class: 'ghost', onclick: () => hooks.predShow() }, [t('predict.show')])]));
      if (hooks.predicting(step)) rPredict.appendChild(h('p', { class: 'muted small' }, [t('predict.hidden')]));
    }

    function drawRoute() {
      const s = hooks.state();
      const tr = m.route;
      const k = Math.min(s.step, tr.length - 1);
      const step = tr[k];
      const hide = hooks.predicting(step);
      const n = NR.narrate(step, { lang: lang(), st: m.st, trace: tr, hide });
      const f = step.kind === 'm0Frag' ? m.st.frags.find((x) => x.id === step.frag) : null;
      textHead.textContent = t('m0.text');
      textSrc.textContent = m.def.source ? t('m0.source', { src: m.def.source[lang()] }) : '';
      textNotice.hidden = true; textHint.hidden = true; marksBox.hidden = true;
      root.PNL.statementView.render(textBody, { st: m.st, marks: [], label: () => ({ badge: '' }), underline: false, hl: f ? { from: f.from, to: f.to } : null });
      const key = `${m.st.id}|${lang()}|${k}`;
      if (key !== lastStep) {
        lastStep = key;
        const hl = textBody.querySelector('.hl');
        if (hl && hl.scrollIntoView) hl.scrollIntoView({ block: 'nearest' });
        hooks.announce(`${n.title}. ${n.text}`);
      }
      rHead.textContent = n.title;
      rText.textContent = n.text;
      drawRoutePredict(step, k);
      const tb = routeTable(m.st, tr, k, hide);
      const clean = step.kind === 'm0Clean';
      rTableHead.textContent = t(clean ? 'm0.rt.cleanTitle' : 'm0.rt.tableTitle');
      clear(rTableBody);
      const noDur = !!m.st.structureOnly;
      const newRow = new Set(tb.added);
      const newIn = new Set(tb.edges.map((e) => e[1]));
      if (!tb.rows.length) rTableBody.appendChild(h('p', { class: 'muted small' }, [t('m0.rt.empty')]));
      else {
        rTableBody.appendChild(h('table', { class: 'data m0-rtable' }, [h('caption', { class: 'sr-only' }, [rTableHead.textContent]),
          h('thead', {}, [h('tr', {}, [h('th', { scope: 'col' }, [t('work.colId')]), h('th', { scope: 'col' }, [t('work.colName')]),
            noDur ? null : h('th', { scope: 'col' }, [t('work.colDuration')]), h('th', { scope: 'col' }, [t('work.colPred')])])]),
          h('tbody', {}, tb.rows.map((r) => h('tr', { class: newRow.has(r.id) || newIn.has(r.id) ? 'new' : null }, [h('th', { scope: 'row' }, [r.id]), h('td', { class: 'name' }, [r.name]),
            noDur ? null : h('td', {}, [r.duration || '—']), h('td', {}, [newIn.has(r.id) ? h('strong', {}, [r.links]) : (r.links || '—')])])))]));
      }
      clear(rOpen);
      rOpen.hidden = !clean;
      if (clean) {
        const go = (where) => hooks.open(where, tb.rows, 'pred');
        rOpen.appendChild(h('div', { class: 'row-wrap' }, [h('span', { class: 'small' }, [`${t('m0.open.label')}:`]),
          h('button', { type: 'button', class: 'ghost', disabled: noDur, onclick: () => go('m1') }, [t('m0.open.m1')]),
          h('button', { type: 'button', class: 'ghost', onclick: () => go('m2') }, [t('m0.open.m2')]),
          h('button', { type: 'button', class: 'ghost', onclick: () => go('work') }, [t('m0.open.work')])]));
        if (noDur) rOpen.appendChild(h('p', { class: 'muted small' }, [t('m0.open.noM1')]));
      }
      rCounter.textContent = t('player.counter', { i: k + 1, n: tr.length });
      rBar.firstChild.style.width = `${Math.round(((k + 1) / tr.length) * 100)}%`;
      rFirst.disabled = k === 0; rPrev.disabled = k === 0; rNext.disabled = k >= tr.length - 1 || hide;
      rFirst.setAttribute('aria-label', t('player.first')); rPrev.setAttribute('aria-label', t('player.prev')); rNext.setAttribute('aria-label', t('player.next'));
      rPlay.textContent = hooks.playing() ? '⏸' : '▶';
      rPlay.setAttribute('aria-label', t(hooks.playing() ? 'player.pause' : 'player.play'));
      rPred.checked = !!s.pred;
      rPredLbl.textContent = t('predict.toggle');
      rKeys.textContent = t('player.keys');
    }

    function draw(o) {
      if (!m) return;
      const mm = hooks.state().mm;
      const route = mm === 'route';
      const prep = mm === 'prepare';
      btnPractice.textContent = t('m0.practice'); btnRoute.textContent = t('m0.route'); btnPrepare.textContent = t('m0.prepare');
      btnPractice.setAttribute('aria-pressed', String(mm === 'practice')); btnRoute.setAttribute('aria-pressed', String(route));
      btnPrepare.setAttribute('aria-pressed', String(prep));
      shareCard.hidden = !prep;
      prepBox.hidden = true; btnEditText.hidden = true; textBody.hidden = false;
      segMode.setAttribute('aria-label', t('m0.modes'));
      btnLearn.textContent = t('m0.learn');
      for (const el of [segTv, btnUl, btnCheck, panelBox, tableCard, valCard, diagCard, openBox]) el.hidden = route;
      for (const el of [rStep, rTable, rPlayer]) el.hidden = !route;
      if (route) { drawBar(); segTv.hidden = true; btnUl.hidden = true; btnCheck.hidden = true; panelBox.hidden = true; drawRoute(); return; }
      marksBox.hidden = false;
      lastStep = null;
      const keep = o && o.keepFocus && container.contains(root.document.activeElement) ? root.document.activeElement.getAttribute('data-fk') : null;
      const s = hooks.state();
      const v = validation(lang(), m);
      const d = curDiag();
      pick = Math.min(pick, Math.max(0, v.redundant.length - 1));
      drawBar();
      drawText(o);
      drawPanel();
      tableHead.textContent = t('m0.table');
      const n = m.project ? m.project.activities.length : PM.model(m.rows, m.mode).ids.length;
      tableCount.textContent = n === 1 ? t('m0.nActsOne') : t('m0.nActs', { n });
      const matrix = s.tv === 'matrix';
      listBox.hidden = matrix;
      matrixBox.hidden = !matrix;
      const deco = decoration(v, d);
      if (matrix) {
        matrixBox.setAttribute('aria-label', t('m0.matrix.region'));
        PM.render(matrixBox, { rows: m.rows, mode: m.mode, lang: lang(), deco, onToggle: (p, a, on) => hooks.dispatch({ type: 'table', rows: PM.toggle(hooks.state().t || [], m.mode, p, a, on) }) });
      } else {
        editor.render({ rows: m.rows, report: m.report, project: m.project, solution: null, showComputed: false, numFmt: String, deco, noDuration: !!m.st.structureOnly && m.st.id !== 'own' },
          !!(o && o.fullEditor) || lastTv !== 'list');
      }
      lastTv = matrix ? 'matrix' : 'list';
      if (prep) { v.note = null; tableHead.textContent = t('m0.prep.table'); }
      drawValidation(v);
      // Preparar con la tabla vacía no tiene nada que validar: lo dice «Compartir».
      valCard.hidden = prep && !valBody.childElementCount;
      drawDiag(prep ? null : d, o && o.focusDiag);
      openBox.hidden = prep;
      if (!prep) drawOpen();
      else {
        drawShare();
        // El cuadro de texto, si aún no hay texto o el docente lo ha pedido; si no, el texto para subrayar.
        if (editText || !hasWords(m.def.text)) {
          if (!editText) { editText = true; draft = null; }
          ul = false;
          textHead.textContent = t('m0.prep.textHead');
          textHint.hidden = true; textBody.hidden = true; marksBox.hidden = true; prepBox.hidden = false;
          btnUl.disabled = true;
          drawPrepText(o);
        } else { btnEditText.hidden = false; btnEditText.textContent = t('m0.prep.edit'); btnUl.disabled = false; }
      }
      if (!prep) btnUl.disabled = false;
      if (o && o.focusTextBody && !textBody.hidden) textBody.focus();
      if (o && o.focusPanel) { const f = panelBox.querySelector('input:checked') || panelBox.querySelector('input, select, button'); if (f) f.focus(); }
      if (keep) { const el = container.querySelector(`[data-fk="${keep}"]`) || panelBox.querySelector(`input[name="m0Kind"]:checked`); if (el) el.focus(); }
    }

    return {
      render(model, opts) {
        const before = m;
        m = model;
        if (before && (before.st.id !== m.st.id || before.lang !== m.lang)) { panel = null; sel = null; focusWord = 0; }
        // El aviso del cambio de idioma dura hasta la siguiente edición o el siguiente enunciado.
        const edited = before && before.st.id === m.st.id && before.lang === m.lang && JSON.stringify([before.rows, before.marks]) !== JSON.stringify([m.rows, m.marks]);
        if (before && before.st.id !== m.st.id) notice = null;
        else if (edited && keepNotice) keepNotice = false;
        else if (edited) notice = null;
        draw(opts);
      },
      // Lo llama app al cambiar de idioma, entre el cambio de idioma y el de los subrayados (que no debe quitarlo).
      langNotice(dropped) { notice = dropped ? (dropped === 1 ? t('m0.langMovedOne') : t('m0.langMoved', { n: dropped })) : null; keepNotice = !!dropped; },
      debug: () => ({ st: m && m.st.id, rows: m && m.rows, marks: m && m.marks, underline: ul, sel, panel: panel ? { from: panel.from, to: panel.to, kind: panel.kind, edit: panel.edit } : null,
        diag: curDiag(), validation: m ? validation(lang(), m) : null }),
    };
  }

  // Tabla de la ruta paso a paso hasta el paso k (narrate.m0Table).
  const routeTable = (st, tr, k, hide) => NR.m0Table(st, tr, k, hide);

  // Opciones de la predicción del paso k de la ruta (T019). En la descripción de una actividad o en «lo primero» y
  // «lo último», una casilla por actividad ya conocida. En una frase de dependencia, dos listas con todas las
  // actividades del enunciado, en orden y con su nombre de la referencia: la frase puede nombrar actividades que el
  // texto aún no ha presentado (Ej. 2: «A precede a D y E» con la tabla vacía).
  const natural = (u, v) => u.localeCompare(v, 'en', { numeric: true });
  function routeOptions(st, tr, k) {
    const f = st.frags.find((x) => x.id === tr[k].frag);
    const known = routeTable(st, tr, k, true).rows.map((r) => r.id);
    const refAct = (id) => (st.ref ? st.ref.activities.find((a) => a.id === id) : null);
    const label = (id) => { const a = refAct(id); return a && a.name ? `${id} · ${a.name}` : id; };
    if (f && f.act && (f.kind === 'activity' || f.kind === 'end')) return { cands: known.filter((x) => x !== f.act).map((p) => `${p}>${f.act}`), ids: known, label };
    if (f && f.act && f.kind === 'start') return { cands: known.filter((x) => x !== f.act).map((a) => `${f.act}>${a}`), ids: known, label };
    const ids = st.ref ? st.ref.activities.map((a) => a.id).sort(natural) : known;
    return { cands: null, ids, label };
  }

  const api = { routeTable, routeOptions, ownDef, toPrepare, openSolution, acceptText, share, model, fragText, proposal, applyMark, putMark, removeMark, cleanRows, openState, validation, diagnosis, markLabel, switchLang, create };
  root.PNL = root.PNL || {};
  root.PNL.m0 = api;
  if (isNode) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
