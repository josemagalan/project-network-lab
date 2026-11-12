/*
 * core/stmtgen — el generador de enunciados (spec f3c-enunciados; plan §3, P2 y P4). De una tabla del generador de
 * la F3a, o de unas filas cualesquiera, a un enunciado con contexto en el formato StatementDef de M0 (texto ES y EN
 * en segmentos con los mismos fragmentos; cada fragmento dice qué da). M0 lo trabaja como a los once enunciados de
 * core/statements, y su ida y vuelta es la de M0: statement.validate(def, { strict: true }) sin avisos.
 *
 * make(sd, lv, { ctx, version }) toma la tabla de generator.generate(sd, LEVELS[lv]) y llama a compose;
 * compose(rows, lv, ctx, seed) reparte los nombres del catálogo (assign) y escribe el texto del nivel:
 *   easy   — lista con letras y una frase hacia atrás por actividad con predecesoras;
 *   medium — lista, frases en los dos sentidos (algunas con varias precedencias) y una «a la vez»;
 *   hard   — prosa por etapa y letra, frase común para las actividades con las mismas predecesoras, «a la vez»,
 *            recurso, una redundancia escrita y «lo primero» o «lo último» solo con una única actividad inicial o
 *            final (si no, «desde el primer día»).
 * El texto usa su propia secuencia de rng (mix de la semilla y el nivel), así que la tabla es siempre la de la F3a;
 * el contexto sin pedir sale de otra secuencia, así que pedirlo da lo mismo que dejarlo al azar. Sin DOM ni
 * Math.random. Contenido (catálogos y formas de frase) en core/contexts.
 */
(function (root) {
  'use strict';

  const isNode = typeof module !== 'undefined' && module.exports;
  const R = isNode ? require('./rng.js') : root.PNL.rng;
  const GEN = isNode ? require('./generator.js') : root.PNL.generator;
  const X = isNode ? require('./contexts.js') : root.PNL.contexts;

  const VERSION = 1;
  const LEVELS = ['easy', 'medium', 'hard'];
  const STAGES = 6;
  const BUDGET = 20000;            // pasos de la vuelta atrás del reparto (no se ha acercado en 3600 tablas)
  const SOURCE = { es: 'Project Network Lab (enunciado generado)', en: 'Project Network Lab (generated statement)' };
  const LANGS = ['es', 'en'];
  const F = X.FORMS;
  const { list, cap } = X;

  const mix = (sd, lv) => (Math.imul(sd >>> 0, 2654435761) + 0x5f3759df + 97 * LEVELS.indexOf(lv)) >>> 0;
  const ctxSeed = (sd, lv) => (mix(sd, lv) ^ 0x2545f491) >>> 0;
  const pick = (r, arr) => arr[Math.floor(r() * arr.length)];
  const dur = (d, unit, L) => `${d} ${d === 1 ? unit.one[L] : unit.many[L]}`;
  const yE = (next) => list(['', next], 'es').trim().split(' ')[0];       // «y» o «e» ante next

  // ── Tabla: orden topológico (empates por el orden de las filas), antecesoras, profundidad ────────────────────
  function table(rows) {
    const given = rows.map((x) => x.id);
    const preds = {};
    const d = {};
    for (const x of rows) {
      preds[x.id] = String(x.links || '').split(/\s*,\s*/).map((s) => s.trim()).filter(Boolean);
      d[x.id] = Number(x.duration);
    }
    if (given.some((id) => preds[id].some((p) => !(p in preds)))) return null;
    const ids = [];
    const placed = new Set();
    while (ids.length < given.length) {
      const next = given.find((id) => !placed.has(id) && preds[id].every((p) => placed.has(p)));
      if (next === undefined) return null;                               // ciclo
      ids.push(next); placed.add(next);
    }
    const succs = Object.fromEntries(ids.map((id) => [id, []]));
    for (const id of ids) for (const p of preds[id]) succs[p].push(id);
    const anc = {};
    const depth = {};
    for (const id of ids) {
      anc[id] = new Set();
      for (const p of preds[id]) { anc[id].add(p); for (const q of anc[p]) anc[id].add(q); }
      depth[id] = preds[id].length ? 1 + Math.max(...preds[id].map((p) => depth[p])) : 0;
    }
    return { ids, preds, succs, anc, depth, d };
  }
  const independent = (t, x, y) => x !== y && !t.anc[x].has(y) && !t.anc[y].has(x);
  function pathBetween(t, x, y) {                                        // x → … → y por predecesoras inmediatas
    if (t.preds[y].includes(x)) return [x, y];
    const p = t.preds[y].find((q) => t.anc[q].has(x));
    return [...pathBetween(t, x, p), y];
  }

  // ── Reparto verosímil: etapa(p) ≤ etapa(s) en cada precedencia y sin repetir (vuelta atrás) ─────────────────
  function assign(r, t, cat, budget) {
    const maxDepth = Math.max(...t.ids.map((id) => t.depth[id]));
    const target = (id) => 1 + Math.floor(t.depth[id] * STAGES / (maxDepth + 1));
    const items = cat.acts.map((a, k) => ({ k, stage: a[0] }));
    const used = new Set();
    const out = {};
    let ops = 0;
    const rec = (i) => {
      if (i === t.ids.length) return true;
      if (++ops > (budget || BUDGET)) return false;
      const id = t.ids[i];
      const lo = Math.max(1, ...t.preds[id].map((p) => items[out[p]].stage));
      const cands = items.filter((it) => !used.has(it.k) && it.stage >= lo)
        .map((it) => ({ it, key: Math.abs(it.stage - target(id)) + r() * 1.5 })).sort((a, b) => a.key - b.key);
      for (const { it } of cands) {
        used.add(it.k); out[id] = it.k;
        if (rec(i + 1)) return true;
        used.delete(it.k);
      }
      delete out[id];
      return false;
    };
    return t.ids.length <= items.length && rec(0) ? out : null;
  }

  // ── Texto ───────────────────────────────────────────────────────────────────────────────────────────────────
  function compose(rows, lv, ctx, seed) {
    if (!LEVELS.includes(lv)) return { ok: false, reason: 'level' };
    const cat = X.CONTEXTS[ctx];
    if (!cat) return { ok: false, reason: 'context' };
    const t = table(rows);
    if (!t) return { ok: false, reason: 'table' };
    const r = R.mulberry32(mix(seed, lv));
    const asg = assign(r, t, cat);
    if (!asg) return { ok: false, reason: 'assign' };
    const A = Object.fromEntries(t.ids.map((id) => { const c = cat.acts[asg[id]]; return [id, { stage: c[0], es: c[1], en: c[2], g: c[3] }]; }));
    const text = { es: [cat.intro.es], en: [cat.intro.en] };
    const frags = {};
    const feat = { back: 0, fwd: 0, multi: 0, par: 0, res: 0, red: 0, start: 0, end: 0, day1: 0, same: 0 };
    const push = (segEs, segEn) => { text.es.push(...segEs); text.en.push(...segEn); };
    const actFr = (id) => {
      frags[`a${id}`] = { kind: 'activity', act: id };
      frags[`d${id}`] = { kind: 'duration', act: id, value: t.d[id] };
    };
    const aD = (id, L) => [[`a${id}`, A[id][L]], ' (', [`d${id}`, dur(t.d[id], cat.unit, L)], ')'];
    let k = 0;
    if (lv !== 'hard') listText();
    else proseText();

    function listText() {
      for (const id of t.ids) {
        actFr(id);
        push([`\n${id}) `, [`a${id}`, cap(A[id].es)], ' (', [`d${id}`, dur(t.d[id], cat.unit, 'es')], ').'],
          [`\n${id}) `, [`a${id}`, cap(A[id].en)], ' (', [`d${id}`, dur(t.d[id], cat.unit, 'en')], ').']);
      }
      const withPreds = t.ids.filter((id) => t.preds[id].length);
      let back = new Set(withPreds);
      if (lv === 'medium') {
        back = new Set(withPreds.filter(() => r() < 0.5));
        if (back.size === withPreds.length && withPreds.length > 1) back.delete(withPreds[withPreds.length - 1]);
        if (back.size === 0 && withPreds.length > 1) back.add(withPreds[0]);
      }
      const sentences = [];
      for (const s of withPreds.filter((x) => back.has(x))) {
        const f = pick(r, F.back);
        const P = t.preds[s];
        sentences.push({ es: f.es(s, P), en: f.en(s, P), gives: P.map((p) => [p, s]) });
        feat.back++; if (P.length > 1) feat.multi++;
      }
      const byPred = {};
      for (const s of withPreds.filter((x) => !back.has(x))) for (const p of t.preds[s]) (byPred[p] = byPred[p] || []).push(s);
      for (const p of t.ids.filter((x) => byPred[x])) {
        const f = pick(r, F.fwd);
        const Q = byPred[p];
        sentences.push({ es: f.es(p, Q), en: f.en(p, Q), gives: Q.map((s) => [p, s]) });
        feat.fwd++; if (Q.length > 1) feat.multi++;
      }
      let order = sentences;
      if (lv === 'medium') {
        const pairs = [];
        for (const x of t.ids) for (const y of t.ids) if (t.ids.indexOf(x) < t.ids.indexOf(y) && independent(t, x, y)) pairs.push([x, y]);
        if (pairs.length) {
          const [x, y] = pick(r, pairs);
          sentences.push({ none: true, es: F.par.es(x, y), en: F.par.en(x, y), why: { es: F.par.why.es(x, y), en: F.par.why.en(x, y) } });
          feat.par++;
        }
        order = R.shuffle(r, sentences);
      }
      push(['\n'], ['\n']);
      order.forEach((x, i) => {
        const id = x.none ? `n${++k}` : `p${++k}`;
        frags[id] = x.none ? { kind: 'none', why: x.why } : { kind: 'precedence', gives: x.gives };
        const sp = i ? [' '] : [];
        push([...sp, [id, x.es], '.'], [...sp, [id, x.en], '.']);
      });
    }

    function proseText() {
      // Orden de presentación: etapa y después el orden topológico (es topológico: etapa(p) ≤ etapa(s)).
      const order = t.ids.slice().sort((x, y) => A[x].stage - A[y].stage || t.ids.indexOf(x) - t.ids.indexOf(y));
      const pos = (id) => order.indexOf(id);
      const lastOf = (ids) => ids.reduce((a, b) => (pos(a) > pos(b) ? a : b));
      const byPos = (ids) => ids.slice().sort((x, y) => pos(x) - pos(y));
      const sources = t.ids.filter((id) => !t.preds[id].length);
      const sinks = t.ids.filter((id) => !t.succs[id].length);
      const useStart = sources.length === 1 && (sinks.length !== 1 || r() < 0.5);
      const startId = useStart ? sources[0] : null;
      const endId = !useStart && sinks.length === 1 ? sinks[0] : null;
      const inClause = {};
      for (const id of t.ids) inClause[id] = t.preds[id].length > 0 && id !== endId && r() < 0.6;
      const groupOf = {};
      const groups = [];
      for (const id of order) {
        if (!inClause[id]) continue;
        const key = t.preds[id].slice().sort().join();
        const g = groups.find((x) => x.key === key);
        if (g) { g.ids.push(id); groupOf[id] = g; } else { groupOf[id] = { key, ids: [id] }; groups.push(groupOf[id]); }
      }
      const fwd = {};
      for (const s of t.ids) {
        if (inClause[s] || s === endId) continue;
        for (const p of t.preds[s]) if (p !== startId) (fwd[p] = fwd[p] || []).push(s);
      }
      const pairs = [];
      for (const x of t.ids) for (const y of t.ids) if (t.ids.indexOf(x) < t.ids.indexOf(y) && independent(t, x, y)) pairs.push([x, y]);
      const shuffled = R.shuffle(r, pairs);
      const reds = [];
      for (const y of t.ids) for (const x of t.ids) if (t.anc[y].has(x) && !t.preds[y].includes(x)) reds.push([x, y]);
      const red = reds.length ? pick(r, reds) : null;
      const after = {};
      const later = (id, item) => (after[id] = after[id] || []).push(item);
      for (const p of t.ids.filter((x) => fwd[x])) later(lastOf([p, ...fwd[p]]), { type: 'fwd', p, Q: byPos(fwd[p]) });
      if (shuffled[0]) later(lastOf(shuffled[0]), { type: 'par', x: shuffled[0][0], y: shuffled[0][1] });
      if (shuffled[1]) later(lastOf(shuffled[1]), { type: 'res', x: shuffled[1][0], y: shuffled[1][1] });
      if (red) later(red[1], { type: 'red', x: red[0], y: red[1] });
      if (!startId && !endId) later(lastOf(sources), { type: 'day1', ids: byPos(sources) });
      push(['\n'], ['\n']);
      let first = true;
      const say = (segEs, segEn) => { const sp = first ? [] : [' ']; first = false; push([...sp, ...segEs], [...sp, ...segEn]); };
      const acts = (ids, L) => {
        const out = [];
        ids.forEach((id, i) => {
          if (i) out.push(i === ids.length - 1 ? (L === 'es' ? ` ${yE(A[id].es)} ` : ' and ') : ', ');
          out.push(...aD(id, L));
        });
        return out;
      };
      const done = new Set();
      let plain = 0;
      for (const id of order) {
        if (done.has(id)) continue;
        if (id === startId) {
          actFr(id);
          frags.s1 = { kind: 'start', act: id, gives: t.ids.filter((x) => x !== id).map((x) => [id, x]) };
          say([['s1', F.start.es], ' ', ...aD(id, 'es'), '.'], [['s1', F.start.en], ' ', ...aD(id, 'en'), '.']);
          feat.start++;
        } else if (id === endId) {
          actFr(id);
          frags.e1 = { kind: 'end', act: id, gives: t.ids.filter((x) => x !== id).map((x) => [x, id]) };
          say([F.end.lead.es, ...aD(id, 'es'), ': ', ['e1', F.end.frag.es], '.'], [F.end.lead.en, ...aD(id, 'en'), ': ', ['e1', F.end.frag.en], '.']);
          feat.end++;
        } else if (inClause[id]) {
          const g = groupOf[id];
          for (const x of g.ids) { actFr(x); done.add(x); }
          const f = pick(r, F.pBack);
          const P = byPos(t.preds[id]).map((p) => A[p]);
          const pid = `p${++k}`;
          frags[pid] = { kind: 'precedence', gives: g.ids.flatMap((s) => t.preds[id].map((p) => [p, s])) };
          say([[pid, f.es(P)], f.joinEs, ...acts(g.ids, 'es'), '.'], [[pid, f.en(P)], f.joinEn, ...acts(g.ids, 'en'), '.']);
          feat.back++; if (P.length > 1 || g.ids.length > 1) feat.multi++;
          if (g.ids.length > 1) feat.same++;
        } else {
          actFr(id);
          const [pe, pn] = plain++ === 0 ? F.plain[0] : pick(r, F.plain);
          say([pe, ...aD(id, 'es'), '.'], [pn, ...aD(id, 'en'), '.']);
        }
        const members = inClause[id] ? groupOf[id].ids : [id];
        for (const m of members) for (const it of after[m] || []) sentence(it);
      }
      function sentence(it) {
        if (it.type === 'fwd') {
          const f = pick(r, F.pFwd);
          const pid = `p${++k}`;
          frags[pid] = { kind: 'precedence', gives: it.Q.map((s) => [it.p, s]) };
          const Q = it.Q.map((s) => A[s]);
          say([[pid, cap(f.es(A[it.p], Q))], '.'], [[pid, cap(f.en(A[it.p], Q))], '.']);
          feat.fwd++; if (Q.length > 1) feat.multi++;
        } else if (it.type === 'par') {
          const nid = `n${++k}`;
          frags[nid] = { kind: 'none', why: F.parProse.why };
          say([[nid, F.parProse.es(A[it.x], A[it.y])], '.'], [[nid, F.parProse.en(A[it.x], A[it.y])], '.']);
          feat.par++;
        } else if (it.type === 'res') {
          const nid = `n${++k}`;
          frags[nid] = { kind: 'none', why: F.res.why };
          say([[nid, F.res.es(A[it.x], A[it.y], cat.resource.es)], '.'], [[nid, F.res.en(A[it.x], A[it.y], cat.resource.en)], '.']);
          feat.res++;
        } else if (it.type === 'red') {
          const path = pathBetween(t, it.x, it.y).map((id) => A[id]);
          frags.r1 = { kind: 'precedence', gives: [[it.x, it.y]], why: { es: F.red.why.es(path), en: F.red.why.en(path) } };
          say([['r1', F.red.es(A[it.x], A[it.y])], '.'], [['r1', F.red.en(A[it.x], A[it.y])], '.']);
          feat.red++;
        } else {
          frags.n0 = { kind: 'none', why: F.day1.why };
          const ids = it.ids.map((id) => A[id]);
          say([['n0', F.day1.es(ids)], '.'], [['n0', F.day1.en(ids)], '.']);
          feat.day1++;
        }
      }
    }

    const def = {
      id: 'gen', structureOnly: false, unit: { es: cat.unit.many.es, en: cat.unit.many.en }, source: SOURCE,
      title: cat.title, text, frags,
      ref: { mode: 'pred', rows: rows.map((x) => ({ id: x.id, duration: String(x.duration), links: String(x.links || ''),
        name: { es: cap(A[x.id].es), en: cap(A[x.id].en) } })) },
    };
    return { ok: true, def, feat };
  }

  function make(sd, lv, opts) {
    const o = opts || {};
    if (o.version !== undefined && o.version !== VERSION) return { ok: false, reason: 'version' };
    if (!LEVELS.includes(lv)) return { ok: false, reason: 'level' };
    const ctx = o.ctx || X.KEYS[R.int(R.mulberry32(ctxSeed(sd, lv)), 0, X.KEYS.length - 1)];
    if (!X.CONTEXTS[ctx]) return { ok: false, reason: 'context' };
    const gen = GEN.generate(sd, GEN.LEVELS[lv]);
    if (!gen.ok) return { ok: false, reason: 'table' };
    const res = compose(gen.rows, lv, ctx, sd);
    return res.ok ? Object.assign({ ctx }, res) : res;
  }

  const render = (def, L) => def.text[LANGS.includes(L) ? L : 'es'].map((s) => (Array.isArray(s) ? s[1] : s)).join('');

  const api = { VERSION, LEVELS, make, compose, assign, render, table };
  root.PNL = root.PNL || {};
  root.PNL.stmtgen = api;
  if (isNode) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
