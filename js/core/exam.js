/*
 * core/exam — el examen completo imprimible (spec f3f-examen-imprimible; plan §0, §3, P1; análisis H1 y H4). Primera
 * parte (T005–T006): las partes y su orden, los apartados, la compatibilidad y los avisos, el detective en el encadenado,
 * el proyecto común y los modelos. Los documentos (enunciado, solución y rúbrica) se añaden en T007–T008.
 * - Partes, en el orden del recorrido (PARTS): enunciado → tabla, construir la ROY y la PERT, detective, tiempos,
 *   holguras y caminos, mínimo de ficticias, sucesores, TCL, «Leer», discretas a mano y réplicas a mano.
 * - Proyecto común (P1): una semilla s que vale para todas las partes marcadas a la vez, buscada desde la del modelo
 *   (s, s + 1…; tope TRIES_EXAM): la tabla del generador para s; con el TCL, «Leer», las discretas y las réplicas, las de
 *   core/probgen para s (probgen.candidate, sin cambios); con las partes que admiten las series, series.question no
 *   nulo (con el TCL, lo determinista con las medias; con el enunciado, que se pueda escribir); con el detective, que
 *   se pueda sembrar. Nada de lo existente cambia de salida.
 * - Detective (H1): con «Construir la ROY», sobre la PERT; con «Construir la PERT», sobre la ROY; con las dos, con su
 *   propio proyecto (detective.forSeed desde s + 1) y un aviso; sin construcción, la red que se elija. Con «Tiempos» u
 *   «Holguras», solo errores de red (los de cálculo darían esas respuestas); con un ejemplo sin duraciones, también.
 * - Modelos: el k parte de modelSeed(sd, k) = 1 + ((sd − 1 + k · MODEL_STEP) mod SEED_MAX); si su tabla repite la de un
 *   modelo anterior, sigue buscando. Con un ejemplo citado (EXAMPLES), el modelo A es el ejemplo y los demás, tablas
 *   generadas; las partes que permite cada ejemplo salen de sus datos (partsOf).
 * La búsqueda va a trozos (start, step, result), como probgen. ctx = { lang, nota, labels, tr }, como core/moodle (lo usa
 * series.question). Sin DOM ni azar.
 */
(function (root) {
  'use strict';

  const isNode = typeof module !== 'undefined' && module.exports;
  const req = (f, k) => (isNode ? require(f) : root.PNL[k]);
  const G = req('./generator.js', 'generator');
  const PR = req('./project.js', 'project');
  // Los de las familias de examen.html se piden al usarlos (en Node, al cargarse).
  const SR = () => req('./series.js', 'series');
  const PG = () => req('./probgen.js', 'probgen');
  const D = () => req('./detective.js', 'detective');
  const X = () => req('./examples.js', 'examples');

  const PARTS = ['stmt', 'roy', 'pert', 'det', 'times', 'floats', 'minDummy', 'succ', 'tcl', 'read', 'disc', 'rep'];
  const ITEMS = {
    times: ['times', 'events'],
    floats: ['floats', 'sf', 'critical'],
    tcl: ['moments', 'path', 'project', 'prob', 'deadline', 'route'],
    read: ['pct', 'pT', 'crit', 'questions'],
    disc: ['combos', 'mean', 'pT', 'crit'],
    rep: ['reps', 'marks', 'pT', 'crit'],
  };
  const OFF_BY_DEFAULT = { tcl: ['route'] };
  const LEVELS = ['easy', 'medium', 'hard'];
  const MAX_MODELS = 8;
  const TRIES_EXAM = 2000;
  const MODEL_STEP = 7919;
  const SEED_MAX = 999999;
  const LETTERS = 'ABCDEFGH';

  // ---------- ejemplos citados (H4) ----------
  const EXAMPLES = ['ej1', 'ej2', 'ej3', 'ej4', 'ej6', 'ej7', 'kl', 'hl', 'kd'];
  const STRUCT = ['stmt', 'roy', 'pert', 'det', 'minDummy', 'succ'];
  /** Las partes que permite un ejemplo, según sus datos: solo la estructura, duraciones, a, m y b, o discretas. */
  function partsOf(id) {
    if (!EXAMPLES.includes(id)) return null;
    if (id === 'kd') return ['roy', 'pert', 'disc'];
    if (id === 'kl' || id === 'hl') return PARTS.filter((p) => p !== 'stmt' && !['read', 'disc'].includes(p));
    const e = X().get(id);
    return e.structureOnly ? STRUCT.slice() : PARTS.filter((p) => STRUCT.includes(p) || p === 'times' || p === 'floats');
  }
  const durationless = (id) => id === 'kd' || (id && id.startsWith('ej') && X().get(id).structureOnly);

  // ---------- comprobación de las opciones ----------
  function check(o) {
    const errors = []; const warnings = [];
    if (!LEVELS.includes(o.level)) errors.push({ key: 'level' });
    if (!(Number.isInteger(o.models) && o.models >= 1 && o.models <= MAX_MODELS)) errors.push({ key: 'models' });
    const asked = Array.isArray(o.parts) ? o.parts : [];
    if (asked.some((p) => !PARTS.includes(p))) errors.push({ key: 'part' });
    const parts = PARTS.filter((p) => asked.includes(p));
    if (!parts.length && !asked.length) errors.push({ key: 'empty' });
    const items = {};
    for (const p of parts) {
      if (!ITEMS[p]) continue;
      const cfg = (o.items && o.items[p]) || {};
      const off = new Set([...(OFF_BY_DEFAULT[p] || []), ...(cfg.off || [])]);
      for (const x of cfg.on || []) if (!(cfg.off || []).includes(x)) off.delete(x);
      items[p] = ITEMS[p].filter((x) => !off.has(x));
      if (!items[p].length && !errors.some((e) => e.key === 'items')) errors.push({ key: 'items' });
    }
    const example = o.example == null || o.example === '' ? null : o.example;
    if (example != null) {
      const ok = partsOf(example);
      if (!ok) errors.push({ key: 'example' });
      else {
        const bad = parts.filter((p) => !ok.includes(p));
        if (bad.length) errors.push({ key: 'exampleParts', params: { parts: bad } });
        if (items.tcl && items.tcl.includes('route')) errors.push({ key: 'exampleRoute' });
      }
    }
    let det = null;
    if (parts.includes('det')) {
      const roy = parts.includes('roy'); const pert = parts.includes('pert');
      const own = roy && pert;
      const graph = own ? 'aon' : roy ? 'aoa' : pert ? 'aon' : (o.det === 'aoa' ? 'aoa' : 'aon');
      const net = parts.includes('times') || parts.includes('floats') || (example != null && EXAMPLES.includes(example) && durationless(example));
      det = { graph, kind: net ? 'net' : 'all', own };
      if (own) warnings.push({ key: 'detOwn' });
    }
    return { ok: !errors.length, parts, items, det, warnings, errors, example };
  }

  /** Las etapas de las series que corresponden a las partes (las que admite core/series). */
  function stagesOf(c) {
    const st = [];
    for (const p of c.parts) {
      if (p === 'stmt') st.push('stmt');
      if (p === 'times') st.push('early', 'late', ...(c.items.times.includes('events') ? ['evEarly', 'evLate'] : []));
      if (p === 'floats') st.push('floats', 'critPath');
      if (p === 'minDummy' || p === 'succ') st.push(p);
      if (p === 'tcl') st.push('tclMoments', 'tclPath', 'tclProb', ...(c.items.tcl.includes('route') ? ['tclRoute'] : []));
    }
    return st;
  }

  const modelSeed = (sd, k) => 1 + ((((sd - 1 + k * MODEL_STEP) % SEED_MAX) + SEED_MAX) % SEED_MAX);
  const rowsKey = (base) => JSON.stringify(base.rows);

  /** El proyecto de la semilla s para todas las partes, o null si alguna no vale con ella. */
  function at(o, c, s, ctx) {
    const st = stagesOf(c);
    const base = SR().exercise(st, o.level, s);
    if (!base) return null;
    const pick = (k) => {
      if (!c.parts.includes(k)) return null;
      const r = PG().candidate(k, s, o.level);
      return r.ok ? r.ex : undefined;
    };
    const read = pick('read'); const disc = pick('disc'); const rep = pick('rep');
    if (read === undefined || disc === undefined || rep === undefined) return null;
    if (st.length && !SR().question(st, base, ctx, ctx.tr)) return null;
    let det = null;
    if (c.det) {
      const { graph, kind, own } = c.det;
      if (own) {
        const r = D().forSeed(G.LEVELS[o.level], s + 1, { graph, kind, level: o.level });
        if (!r) return null;
        det = { own: true, graph, kind, sd: r.sd, rows: r.rows, errors: r.seeded.errors };
      } else {
        const seeded = D().seed(PR.parse(base.rows, 'pred').project, { graph, kind, level: o.level, sd: s });
        if (!seeded) return null;
        det = { own: false, graph, kind, sd: s, errors: seeded.errors };
      }
    }
    return { base, tcl: base.tcl || null, read, disc, rep, det };
  }

  /** El modelo A con un ejemplo citado (sin semilla). */
  function fromExample(o, c) {
    const id = c.example;
    let base; let tcl = null; let disc = null; let rep = null;
    if (id === 'kl' || id === 'hl') {
      tcl = PG().fromExample(id);
      base = SR().fromTcl(tcl);
      if (c.parts.includes('rep')) rep = PG().fromExample(id, { kind: 'rep', n: PG().REPS[o.level], us: o.seed });
      if (!c.parts.includes('tcl')) tcl = null;
    } else if (id === 'kd') {
      disc = PG().fromExample('kd');
      base = SR().fromRows(disc.rows.map((r) => ({ id: r.id, name: '', duration: String(r.x[0]), links: r.preds.join(', ') })), 'pred');
      if (!c.parts.includes('disc')) disc = null;
    } else {
      const e = X().get(id);
      // Los de solo estructura no tienen duraciones: se dibujan y se construyen igual (con duración 1, que no se enseña).
      base = SR().fromRows(e.structureOnly ? e.rows.map((r) => Object.assign({}, r, { duration: '1' })) : e.rows, e.mode);
    }
    let det = null;
    if (c.det) {
      const { graph, kind, own } = c.det;
      if (own) {
        const r = D().forSeed(G.LEVELS[o.level], modelSeed(o.seed, 0), { graph, kind, level: o.level });
        det = r && { own: true, graph, kind, sd: r.sd, rows: r.rows, errors: r.seeded.errors };
      } else {
        const seeded = D().seed(PR.parse(base.rows, 'pred').project, { graph, kind, level: o.level, sd: o.seed });
        det = seeded && { own: false, graph, kind, sd: o.seed, errors: seeded.errors };
      }
      if (!det) return { ok: false, reason: 'det' };
    }
    return { ok: true, seed: null, sdUsed: null, tries: 0, example: id, base, tcl, read: null, disc, rep, det };
  }

  // ---------- búsqueda a trozos ----------
  function start(o, k, ctx, avoid) {
    const c = check(o);
    const job = { o, c, k, ctx, done: false, res: null, tries: 0, avoid: avoid || [] };
    if (!c.ok) { job.done = true; job.res = { ok: false, reason: 'check', errors: c.errors }; return job; }
    if (c.example && k === 0) { job.done = true; job.res = fromExample(o, c); return job; }
    job.seed = o._seeds && o._seeds[k] != null ? o._seeds[k] : modelSeed(o.seed, k);
    job.s = job.seed;
    job.valid = (s) => at(o, c, s, ctx);
    return job;
  }
  function step(job, limit) {
    for (let i = 0; !job.done && i < limit; i++) {
      if (job.tries >= TRIES_EXAM) { job.done = true; job.res = { ok: false, reason: 'tries' }; break; }
      const s = job.s;
      job.tries++;
      job.s = s >= SEED_MAX ? 1 : s + 1;
      const r = job.valid(s);
      if (r && !job.avoid.includes(rowsKey(r.base))) {
        job.done = true;
        job.res = Object.assign({ ok: true, seed: job.seed, sdUsed: s, tries: job.tries, example: null }, r);
      }
    }
    return job.done;
  }
  const result = (job) => job.res;

  function project(o, k, ctx) {
    const job = start(o, k || 0, ctx);
    while (!step(job, Infinity));
    return result(job);
  }

  function models(o, ctx) {
    const out = [];
    for (let k = 0; k < o.models; k++) {
      const job = start(o, k, ctx, out.filter((m) => m.ok).map((m) => rowsKey(m.base)));
      while (!step(job, Infinity));
      out.push(Object.assign({ letter: LETTERS[k] }, result(job)));
    }
    return out;
  }

  const api = { PARTS, ITEMS, LEVELS, MAX_MODELS, TRIES_EXAM, MODEL_STEP, SEED_MAX, EXAMPLES, partsOf, check, stagesOf,
    modelSeed, start, step, result, project, models };
  root.PNL = root.PNL || {};
  root.PNL.exam = api;
  if (isNode) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
