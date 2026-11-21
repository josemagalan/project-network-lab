/*
 * core/exam — el examen completo imprimible (spec f3f-examen-imprimible; plan §0, §3, P1–P3; análisis H1–H4, H7 y H9).
 * Primera parte (T005–T006): las partes y su orden, los apartados, la compatibilidad y los avisos, el detective en el
 * encadenado, el proyecto común y los modelos. Segunda parte (T007–T008): los puntos y los tres documentos.
 * - Partes, en el orden del recorrido (PARTS): enunciado → tabla, construir la ROY y la PERT, detective, tiempos,
 *   holguras y caminos, mínimo de ficticias, sucesores, TCL, «Leer», discretas a mano y réplicas a mano.
 * - Proyecto común (P1): una semilla s que vale para todas las partes marcadas a la vez, buscada desde la del modelo
 *   (s, s + 1…; tope TRIES_EXAM): la tabla del generador para s; con el TCL, «Leer», las discretas y las réplicas, las de
 *   core/probgen para s (probgen.candidate, sin cambios); con las partes que admiten las series, series.question no
 *   nulo (con el TCL, lo determinista con las medias; con el enunciado, que se pueda escribir); con el detective, que
 *   se pueda sembrar. Nada de lo existente cambia de salida.
 * - Detective (H1): con «Construir la ROY», sobre la PERT; con «Construir la PERT», sobre la ROY; con las dos (o con el
 *   enunciado, porque su red daría la tabla; T008), con su propio proyecto (detective.forSeed desde s + 1) y un aviso;
 *   sin construcción, la red que se elija. Con «Tiempos» u
 *   «Holguras», solo errores de red (los de cálculo darían esas respuestas); con un ejemplo sin duraciones, también.
 * - Modelos: el k parte de modelSeed(sd, k) = 1 + ((sd − 1 + k · MODEL_STEP) mod SEED_MAX); si su tabla repite la de un
 *   modelo anterior, sigue buscando. Con un ejemplo citado (EXAMPLES), el modelo A es el ejemplo y los demás, tablas
 *   generadas; las partes que permite cada ejemplo salen de sus datos (partsOf).
 * - Puntos: points (la propuesta: 10 según los apartados que quedan; stmt, minDummy y succ cuentan 1 y roy, pert y det,
 *   2; a 0,25 con el resto a la parte más grande) e itemPoints (los de una parte entre sus apartados, a partes iguales).
 * - document(model, opts, ctx) → { meta, student, solution, rubric, values, points, link }: listas de bloques sin DOM
 *   (marca de parte, apartado de la rúbrica, ejemplo de error consecuente, anexo, enlace, salto, encabezado, párrafo,
 *   cita, tabla con celdas en blanco, dibujo SVG con su modelo y su texto alternativo, recuadro y rejilla). Las cifras
 *   (values) son las del núcleo: lo determinista con grade.solve (con el TCL, con las medias de dos decimales, enteras
 *   ×100 como core/series), el TCL como las series (H7), Montecarlo con probgen.solve, la ROY con roycheck, la PERT con
 *   mindummy y el detective con detective.seed. El ejemplo de error consecuente de la rúbrica es una hoja del alumno con
 *   un error sembrado que se completa con las fórmulas de grade o probgrade (lo que arrastra). Ninguna parte enseña lo
 *   que pide una anterior; con «Construir la PERT» o con el enunciado, los sucesos y los sucesores se responden sobre la
 *   red del alumno. Las redes se dibujan con dx = 95 (papel), sin pasar de 1120 px (maxW, T012), y wide si pasan de 829 px
 *   (P2). Enlace del alumno: P3 y H3.
 *   Los textos nuevos llegan con tr('exam.…') (i18n-exam, T010–T011); los demás, los de i18n-moodle.
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
  // Los ejercicios de la F2a sin duraciones (structureOnly en core/examples; una prueba lo comprueba). Aquí, para que
  // partsOf y check no necesiten core/examples: en examen.html llega con su familia, después de elegir el ejemplo (T015).
  const STRUCT_ONLY = ['ej1', 'ej2', 'ej3'];
  function partsOf(id) {
    if (!EXAMPLES.includes(id)) return null;
    if (id === 'kd') return ['roy', 'pert', 'disc'];
    if (id === 'kl' || id === 'hl') return PARTS.filter((p) => p !== 'stmt' && !['read', 'disc'].includes(p));
    return STRUCT_ONLY.includes(id) ? STRUCT.slice() : PARTS.filter((p) => STRUCT.includes(p) || p === 'times' || p === 'floats');
  }
  const durationless = (id) => id === 'kd' || STRUCT_ONLY.includes(id);

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
    if (o.points != null) {
      const bad = typeof o.points !== 'object' || Object.entries(o.points).some(([p, v]) => !PARTS.includes(p) || typeof v !== 'number' || !(v >= 0 && v <= 10) || !Number.isInteger(v * 4));
      if (bad) errors.push({ key: 'points' });
      else if (parts.length && !errors.length) {
        const prop = proposal(parts, items);
        const sum = parts.reduce((t, p) => t + (p in o.points ? o.points[p] : prop[p]), 0);
        if (Math.abs(sum - 10) > 1e-9) warnings.push({ key: 'pointsSum', params: { sum: Math.round(sum * 100) / 100 } });
      }
    }
    let det = null;
    if (parts.includes('det')) {
      const roy = parts.includes('roy'); const pert = parts.includes('pert');
      // Aparte con las dos redes que construir y con el enunciado (la red con errores daría la tabla que se pide; T008).
      const own = (roy && pert) || parts.includes('stmt');
      const graph = roy && pert ? 'aon' : roy ? 'aoa' : pert ? 'aon' : (o.det === 'aoa' ? 'aoa' : 'aon');
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

  /** El proyecto de la semilla sin etapas de las series (solo construcción, detective o Montecarlo): la tabla del generador. */
  function plain(level, s) {
    const g = G.generate(s, G.LEVELS[level]);
    return g.ok ? { level, seed: s, gv: G.VERSION, rows: g.rows, info: g.info, tcl: null } : null;
  }

  const modelSeed = (sd, k) => 1 + ((((sd - 1 + k * MODEL_STEP) % SEED_MAX) + SEED_MAX) % SEED_MAX);
  const rowsKey = (base) => JSON.stringify(base.rows);

  /** El proyecto de la semilla s para todas las partes, o null si alguna no vale con ella. */
  function at(o, c, s, ctx) {
    const st = stagesOf(c);
    const base = st.length ? SR().exercise(st, o.level, s) : plain(o.level, s);
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

  // ---------- puntos (plan §0; análisis H9) ----------
  const WEIGHT = { stmt: 1, minDummy: 1, succ: 1, roy: 2, pert: 2, det: 2 };
  const q4 = (x) => Math.round(x * 4) / 4;
  /**
   * Reparte total entre claves con pesos: cada una a 0,25 (la más cercana) y el resto a la de más peso (la primera si
   * empatan). Si así alguna quedara por debajo de 0 (pocos puntos entre muchos apartados), por restos mayores en cuartos.
   */
  function share(keys, w, total) {
    const W = keys.reduce((t, k) => t + w[k], 0);
    const out = Object.fromEntries(keys.map((k) => [k, W ? q4(total * w[k] / W) : 0]));
    const rest = Math.round((total - keys.reduce((t, k) => t + out[k], 0)) * 4) / 4;
    if (rest && keys.length) {
      const big = keys.reduce((b, k) => (w[k] > w[b] ? k : b), keys[0]);
      out[big] = Math.round((out[big] + rest) * 4) / 4;
    }
    if (keys.every((k) => out[k] >= 0)) return out;
    const U = Math.round(total * 4);
    const exact = keys.map((k) => U * w[k] / W);
    const units = exact.map(Math.floor);
    let left = U - units.reduce((t, x) => t + x, 0);
    const order = keys.map((k, i) => i).sort((i, j) => (exact[j] - units[j]) - (exact[i] - units[i]) || w[keys[j]] - w[keys[i]] || i - j);
    for (const i of order) { if (!left) break; units[i]++; left--; }
    return Object.fromEntries(keys.map((k, i) => [k, units[i] / 4]));
  }
  function proposal(parts, items) {
    return share(parts, Object.fromEntries(parts.map((p) => [p, WEIGHT[p] || (items[p] || []).length])), 10);
  }
  /** La propuesta de puntos: 10 repartidos según los apartados que quedan de cada parte. */
  function points(o) {
    const c = check(o);
    return proposal(c.parts, c.items);
  }
  /** Los puntos de una parte repartidos entre sus apartados, a partes iguales (el resto, al primero). */
  function itemPoints(part, pts, items) {
    if (!items || !items.length) return { [part]: pts };
    return share(items, Object.fromEntries(items.map((x, i) => [x, i ? 1 : 1 + 1e-9])), pts);
  }

  // ---------- documentos (plan §0, §3, P2 y P3; análisis H2, H3 y H7) ----------
  const APP = 'https://josemagalan.github.io/project-network-lab/cpm.html';
  const PAPER_DX = 95;                 // dibujo compacto de las redes en papel (T001)
  const WIDE = 829;                    // ancho (px) por encima del cual una red va en su página girada (P2)
  const PAPER_MAX = 1120;              // ancho máximo de una red: 8 pt en la página girada de carta (T012; net-svg baja dx lo justo)
  const GRID = { aon: { easy: [880, 420], medium: [880, 420], hard: [1080, 480] }, aoa: { easy: [680, 360], medium: [680, 360], hard: [960, 420] } };
  const SEP = ' – ';
  const M = () => req('./moodle.js', 'moodle');
  const GRD = () => req('./grade.js', 'grade');
  const C = () => req('./cpm.js', 'cpm');
  const A = () => req('./aoa.js', 'aoa');
  const MD = () => req('./mindummy.js', 'mindummy');
  const RC = () => req('./roycheck.js', 'roycheck');
  const TL = () => req('./tcl.js', 'tcl');
  const PGR = () => req('./probgrade.js', 'probgrade');
  const STS = () => req('./statements.js', 'statements');
  const natural = (a, b) => String(a).localeCompare(String(b), 'en', { numeric: true });
  const r2 = (x) => Math.round(x * 100) / 100;
  /** Una probabilidad como fracción (1/3, 7/10), como en «Ejercicios» y en Moodle. */
  function fracText(p) {
    for (let d = 1; d <= 1000; d++) { const n = Math.round(p * d); if (Math.abs(n / d - p) < 1e-9) return d === 1 ? String(n) : `${n}/${d}`; }
    return String(p);
  }
  const oneNormal = (mu, v, query) => TL().exam({ acts: [{ id: 'T', preds: [], dist: { kind: 'normal', mu, var: v } }] }, query);
  const widthOf = (svg) => { const m = /width="(\d+(?:\.\d+)?)"/.exec(svg || ''); return m ? Number(m[1]) : 0; };

  /** Lo determinista del examen: con el TCL, con las medias de dos decimales (enteras ×100, como core/series). */
  function detSolution(base, tcl) {
    if (!tcl) return { sol: GRD().solve(PR.parse(base.rows, 'pred').project), scale: 1 };
    const amb = Object.fromEntries(tcl.rows.map((r) => [r.id, r]));
    const d = (r) => Math.round(M()._.roundTo((amb[r.id].a + 4 * amb[r.id].m + amb[r.id].b) / 6, 2) * 100);
    const project = PR.parse(base.rows.map((r) => ({ id: r.id, name: '', duration: String(d(r)), links: r.links })), 'pred').project;
    return { sol: GRD().solve(project), scale: 100 };
  }
  /** Las cifras del TCL como las series (H7): tₑ, σ², camino, μ y σ² exactos; z, P y el plazo con μ y σ² a dos decimales. */
  function tclValues(tcl) {
    const d = M()._.tclData(tcl);
    const c = d.crit; const q = oneNormal(d.mu, d.v, { prob: tcl.prob });
    const v = { mom: d.mom, path: d.exact.path.slice(), mu: d.exact.mu, var: d.exact.var, z: c.table.z2, p: c.table.p4, zp: q.table.z2, Tp: q.table.deadline, sd: c.sd, muR: d.mu, vR: d.v, pe: c.exact, zpe: q.z };
    if (tcl.route) {
      const muR = tcl.route.reduce((s, id) => s + d.mom[id].te, 0);
      const vR = tcl.route.reduce((s, id) => s + d.mom[id].var, 0);
      const rA = oneNormal(d.r2(muR), d.r2(vR), { deadline: tcl.deadline });
      v.route = { acts: tcl.route.slice(), mu: muR, var: vR, z: rA.table.z2, p: rA.table.p4, both: c.table.p4 * rA.table.p4, sd: rA.sd, pe: rA.exact };
    }
    return v;
  }

  /**
   * La hoja de quien se equivoca en sown y sigue bien con sus propios datos: cada casilla que, con los datos de la hoja,
   * debería valer otra cosa que la solución toma el valor de la fórmula (expected), hasta que no cambia nada.
   */
  function settle(gradeOf, ans, sown, fields, fmt) {
    for (let i = 0; i < 200; i++) {
      const cells = gradeOf(ans);
      let changed = false;
      for (const f of fields) {
        const c = cells[f];
        if (f === sown || !c || c.status === 'carried' || c.expected == null) continue;
        const moved = typeof c.expected === 'number' ? Math.abs(c.expected - c.right) > 1e-6 : fmt(c.expected) !== fmt(c.right);
        if (!moved || ans[f] === fmt(c.expected)) continue;
        ans[f] = fmt(c.expected);
        changed = true;
      }
      if (!changed) return cells;
    }
    return gradeOf(ans);
  }

  function document(model, o, ctx) {
    if (!model || !model.ok) return { ok: false, reason: (model && model.reason) || 'model' };
    const c = check(o);
    if (!c.ok) return { ok: false, reason: 'check', errors: c.errors };
    const tr = ctx.tr; const L = ctx.labels;
    const lang = ctx.lang === 'en' ? 'en' : 'es';
    const I = M()._;
    const n2 = (v) => I.numText(lang, v, 2);
    const n3 = (v) => I.numText(lang, v, 3);
    const n4 = (v) => I.numText(lang, v, 4);
    const none = (xs) => (xs.length ? xs.join(', ') : tr('none'));
    const has = (p) => c.parts.includes(p);
    const it = c.items;
    const level = LEVELS.includes(o.level) ? o.level : 'medium';
    const base = model.base;
    const project = PR.parse(base.rows, 'pred').project;
    const acts = project.activities.map((a) => a.id);
    const preds = project.preds;
    const tcl = has('tcl') ? model.tcl : null;
    const D0 = detSolution(base, has('tcl') && model.tcl && (has('times') || has('floats')) ? model.tcl : null);
    const sol = D0.sol; const sc = D0.scale;
    const show = (v) => (sc === 1 ? v : n2(v / sc));
    const val = (v) => v / sc;
    const table = (head, rows) => { const t = { table: { head, rows } }; if (rows.some((r) => r.includes(null))) t.fill = true; return t; };
    const extras = Object.assign({ id: true, normal: true, grid: true, qr: true }, o.extras || {});
    const ptsOf = Object.fromEntries(c.parts.map((p) => [p, p in (o.points || {}) ? o.points[p] : null]));
    const prop = proposal(c.parts, it);
    const points = Object.fromEntries(c.parts.map((p) => { const pts = ptsOf[p] == null ? prop[p] : ptsOf[p]; return [p, { pts, items: itemPoints(p, pts, it[p]) }]; }));
    const svgBlock = (m, alt, chart) => {
      const svg = chart ? (ctx.chart ? ctx.chart(m) : null) : (ctx.svg ? ctx.svg(m) : null);
      return { svg, model: m, alt, wide: !!svg && widthOf(svg) > WIDE };
    };
    const names = { start: tr('start'), end: tr('end') };
    const amb = model.tcl ? Object.fromEntries(model.tcl.rows.map((r) => [r.id, r])) : null;
    const stmtOn = has('stmt');
    // Con «Construir la PERT» o con el enunciado, los sucesos y los sucesores se responden sobre la red del alumno: una
    // tabla de sucesos o de arcos daría la red o las precedencias que se piden antes (decisión del autor, 2026-11-21).
    const ownNet = has('pert') || stmtOn;
    const values = {};
    const student = []; const solution = []; const rubric = [];

    // ---------- la cabecera de cada documento: los datos del proyecto ----------
    const needsData = !stmtOn && c.parts.some((p) => !['disc', 'rep'].includes(p) && !(p === 'det' && c.det && c.det.own));
    if (needsData) {
      if (tcl) {
        student.push({ p: tr('exam.dataTcl') }, table([tr('col.act'), tr('col.preds'), 'a', 'm', 'b'], acts.map((id) => [id, none(preds[id]), n2(amb[id].a), n2(amb[id].m), n2(amb[id].b)])));
        if (has('times') || has('floats')) student.push({ p: tr('exam.means') });
      } else {
        const dur = Object.fromEntries(project.activities.map((a) => [a.id, a.d]));
        student.push({ p: tr('exam.data') }, table([tr('col.act'), tr('col.dur'), tr('col.preds')], acts.map((id) => [id, dur[id], none(preds[id])])));
      }
    }
    // Con un ejemplo citado (T013), su nombre en vez de la semilla.
    solution.push({ p: model.example ? tr('exam.sol.introEx', { letter: model.letter || 'A', name: tr(`exam.ex.${model.example}`) })
      : tr('exam.sol.intro', { letter: model.letter || 'A', sd: model.sdUsed == null ? '—' : model.sdUsed }) });
    if (D0.scale !== 1) solution.push({ p: tr('exam.sol.means') });
    rubric.push({ p: tr('exam.rub.intro') }, { p: tr('exam.rub.carriedRule') });

    // ---------- las partes ----------
    const net = sol.net;
    const edges = [...net.arcs, ...net.dummies];
    const T = () => sol.cpm.times; const F = () => sol.cpm.floats;
    let tv = null; const TV = () => (tv = tv || tclValues(model.tcl));
    let calcExample = false;
    // La explicación de un error del detective con los datos de la red, como «Ejercicios» (ex-det; bocetos de T009).
    function detText(e, dp, seeded) {
      const x = D().explain(e).params;
      const nm = (id) => (id === '_S' ? names.start : id === '_E' ? names.end : id);
      const who = String(e.element).split('.')[0];
      const lab = () => { const [w, f] = String(e.element).split('.'); return /^e\d+$/.test(w) ? tr('exam.det.labEv', { f: L[f], n: w.slice(1) }) : tr('exam.det.lab', { f: L[f], a: w }); };
      const val = () => ({ lab: lab(), wrong: 'wrong' in x ? n2(x.wrong) : '', right: 'right' in x ? n2(x.right) : '' });
      switch (e.type) {
        case 'royMissing': case 'royFalse': case 'royInverted': case 'royCycle': return { key: e.type, params: { from: nm(x.from), to: nm(x.to) } };
        case 'pertFalseDummy': { const d = seeded.shown.pert.dummies.find((q) => q.from === x.from && q.to === x.to); return { key: e.type, params: { name: d ? d.name : '', from: x.from, to: x.to } }; }
        case 'pertMissingDummy': case 'pertInvertedDummy': return { key: e.type, params: { dummy: x.dummy, from: x.from, to: x.to } };
        case 'pertParallel': return { key: e.type, params: { act: x.act, twin: x.twin, from: x.from, to: x.to, dummy: x.dummy } };
        case 'calcES': return { key: e.type, params: Object.assign({ f: L.EF }, val()) };
        case 'calcLF': return { key: e.type, params: Object.assign({ f: L.LS }, val()) };
        case 'calcFloat': return { key: e.type, params: Object.assign({ lf: L.LF, es: L.ES }, val()) };
        case 'calcCrit': return { key: e.wrong ? 'calcCritOn' : 'calcCritOff', params: { x: who, tf: n2(C().solve(dp).floats[who].TF) } };
        case 'calcSlack': return { key: e.type, params: Object.assign({ tl: L.TL, te: L.TE }, val()) };
        default: return { key: e.type, params: val() };
      }
    }
    // El nombre de una casilla de una hoja (para el ejemplo de error consecuente), con la notación elegida.
    function cellName(kind, k) {
      const [w, f] = k.split('.');
      if (kind === 'calc') {
        if (k === 'dur') return tr('exam.cell.dur');
        if (f === 'crit') return tr('exam.cell.crit', { a: w });
        if (/^e\d+$/.test(w)) return tr('exam.cell.ev', { f: L[f], n: w.slice(1) });
        return tr('exam.cell.act', { f: L[f] || f, a: w });
      }
      if (kind === 'tcl') {
        if (w === 'r') return tr('exam.cell.route', { f: { mu: 'μ', var: 'σ²', z: 'z', p: 'P' }[f] });
        if (f) return tr('exam.cell.act', { f: f === 'te' ? 'tₑ' : 'σ²', a: w });
        return { mu: 'μ', var: 'σ²', z: 'z', p: 'P', zp: 'z', Tp: tr('exam.cell.Tp'), path: tr('exam.cell.path'), both: tr('exam.cell.both') }[k] || k;
      }
      if (k === 'mean') return 'E[T]';
      if (k === 'pT') return tr('exam.cell.pT');
      if (/^c\d+$/.test(w)) return tr('exam.cell.combo', { f: f === 'T' ? 'T' : 'P', i: w.slice(1) });
      if (/^r\d+$/.test(w)) return f === 'T' ? tr('exam.cell.run', { i: w.slice(1) }) : tr('exam.cell.runCrit', { i: w.slice(1) });
      return tr('exam.cell.critIdx', { a: w });
    }
    const P = {};

    P.stmt = () => {
      let lines; let nameOf;
      if (model.example) {
        const def = STS().get(model.example);
        lines = def.text[lang].map((x) => (typeof x === 'string' ? x : x[1])).join('').split('\n').filter((x) => x.trim());
        nameOf = Object.fromEntries((def.ref.rows || []).map((r) => [r.id, (r.name && (r.name[lang] || r.name)) || '']));
      } else {
        const q = SR().question(['stmt'].concat(model.tcl ? ['tclMoments'] : []), base, Object.assign({}, ctx, { tr }), tr);
        lines = q.text.find((b) => b.quote).quote;
        const solT = q.general.find((b) => b.table).table;
        nameOf = Object.fromEntries(solT.rows.map((r) => [r[0], r[1]]));
      }
      const s = [{ p: tr('exam.ask.stmt') }, { quote: lines }];
      if (tcl) s.push({ p: tr('series.ab') }, table([tr('col.act'), ...acts], [['a', ...acts.map((id) => n2(amb[id].a))], ['b', ...acts.map((id) => n2(amb[id].b))]]));
      s.push(table([tr('col.act'), tr('col.name'), tr('col.immPreds')], acts.map((id) => [id, nameOf[id] || '', null])));
      const v = Object.fromEntries(acts.map((id) => [`${id}.preds`, preds[id].slice().sort()]));
      return { s, o: [table([tr('col.act'), tr('col.name'), tr('col.preds')], acts.map((id) => [id, nameOf[id] || '', none(preds[id])]))],
        r: { stmt: [{ p: tr('exam.rub.stmt') }] }, v };
    };
    P.roy = () => {
      const roy = RC().fromTable(project);
      const alt = tr('exam.alt.roy', { n: roy.nodes.length, m: roy.arcs.length });
      const m = { graph: 'aon', project, solution: sol.cpm, roy, names, title: tr('exam.part.roy'), desc: alt, dx: PAPER_DX, maxW: PAPER_MAX };
      const name = (id) => (id === '_S' ? names.start : id === '_E' ? names.end : id);
      const ids = acts.concat(['_E']);
      return { s: [{ p: tr('exam.ask.roy') }, { grid: 'aon', w: GRID.aon[level][0], h: GRID.aon[level][1] }],
        o: [svgBlock(m, alt), table([tr('col.node'), tr('col.netPreds')], ids.map((id) => [name(id), roy.arcs.filter((e) => e.to === id).map((e) => name(e.from)).join(', ') || tr('none')]))],
        r: { roy: [{ p: tr('exam.rub.roy') }] }, v: { arcs: roy.arcs.map((e) => `${e.from}>${e.to}`) } };
    };
    P.pert = () => {
      const min = MD().solve(project);
      const k = base.info && Number.isInteger(base.info.dummies) ? base.info.dummies : min.value;
      const pn = min.net;
      const alt = tr('exam.alt.pert', { n: pn.events.length, m: pn.arcs.length, k: pn.dummies.length });
      const m = { graph: 'aoa', base: pn, pert: pn, title: tr('exam.part.pert'), desc: alt, dx: PAPER_DX, maxW: PAPER_MAX };
      const rows = [...pn.arcs.map((a) => ({ label: a.act, from: a.from, to: a.to, dummy: false })), ...pn.dummies.map((d, i) => ({ label: d.name || `f${i + 1}`, from: d.from, to: d.to, dummy: true }))]
        .sort((x, y) => x.from - y.from || x.to - y.to || natural(x.label, y.label));
      return { s: [{ p: tr('exam.ask.pert') }, { grid: 'aoa', w: GRID.aoa[level][0], h: GRID.aoa[level][1] }],
        o: [{ p: k === 0 ? tr('sol.minDummyNone') : k === 1 ? tr('sol.minDummyOne') : tr('sol.minDummy', { n: k }) }, svgBlock(m, alt),
          table([tr('col.arc'), tr('col.from'), tr('col.to')], rows.map((a) => [a.dummy ? tr('dummy', { name: a.label }) : a.label, a.from, a.to]))],
        r: { pert: [{ p: tr('exam.rub.pert', { n: k }) }] }, v: { dummies: k } };
    };
    P.det = () => {
      const dt = model.det;
      const dp = dt.own ? PR.parse(dt.rows, 'pred').project : project;
      const seeded = D().seed(dp, { graph: dt.graph, kind: dt.kind, level, sd: dt.sd });
      const dacts = dp.activities.map((a) => a.id);
      const one = seeded.errors.length === 1 ? 'One' : '';
      const s = [{ p: tr(dt.graph === 'aon' ? `exam.ask.detAon${one}` : `exam.ask.detAoa${one}`, { n: seeded.errors.length }) }];
      if (dt.own) {
        const dur = Object.fromEntries(dp.activities.map((a) => [a.id, a.d]));
        s.push({ p: tr('exam.detOwn') }, table([tr('col.act'), tr('col.dur'), tr('col.preds')], dacts.map((id) => [id, dur[id], none(dp.preds[id])])));
      }
      const name = (id) => (id === '_S' ? names.start : id === '_E' ? names.end : id);
      if (dt.graph === 'aon') {
        const R0 = seeded.shown.roy;
        const alt = tr('exam.alt.det', { n: R0.nodes.length, m: R0.arcs.length });
        s.push(svgBlock({ graph: 'aon', project: dp, solution: C().solve(dp), roy: R0, names, title: tr('exam.part.det'), desc: alt, dx: PAPER_DX, maxW: PAPER_MAX }, alt),
          table([tr('col.node'), tr('col.netPreds')], dacts.concat(['_E']).map((id) => {
            const ps = R0.arcs.filter((e) => e.to === id).map((e) => e.from).sort((a, b) => (a === '_S' ? -1 : b === '_S' ? 1 : natural(a, b)));
            return [name(id), ps.length ? ps.map(name).join(', ') : tr('none')];
          })));
      } else {
        const Pn = seeded.shown.pert;
        const alt = tr('exam.alt.detAoa', { n: Pn.events.length, m: Pn.arcs.length, k: Pn.dummies.length });
        s.push(svgBlock({ graph: 'aoa', base: A().build(dp, { method: 'rules' }), pert: Pn, title: tr('exam.part.det'), desc: alt, dx: PAPER_DX, maxW: PAPER_MAX }, alt));
        const rows = [...Pn.arcs.map((a) => ({ label: a.act, from: a.from, to: a.to, dummy: false })), ...Pn.dummies.map((d) => ({ label: d.name, from: d.from, to: d.to, dummy: true }))]
          .sort((x, y) => x.from - y.from || x.to - y.to || natural(x.label, y.label));
        s.push(table([tr('col.arc'), tr('col.from'), tr('col.to')], rows.map((a) => [a.dummy ? tr('dummy', { name: a.label }) : a.label, a.from, a.to])));
      }
      const vals = seeded.shown.values;
      if (vals) {
        if (dt.graph === 'aon') s.push({ p: tr('valuesTitle') }, table([tr('col.act'), L.ES, L.EF, L.LS, L.LF, L.TF, tr('col.crit')], dacts.map((id) => [id, vals.acts[id].ES, vals.acts[id].EF, vals.acts[id].LS, vals.acts[id].LF, vals.acts[id].TF, vals.acts[id].crit ? tr('yes') : tr('no')])));
        else s.push({ p: tr('valuesTitle') }, table([tr('col.event'), L.TE, L.TL, tr('col.slack')], seeded.shown.pert.events.map((e) => [e.n, vals.events[e.n].TE, vals.events[e.n].TL, vals.events[e.n].slack])), { p: tr('critMarked', { acts: dacts.filter((id) => vals.crit[id]).join(', ') || tr('none') }) });
      }
      s.push({ box: 4 });
      const o2 = seeded.errors.map((e, i) => { const x = detText(e, dp, seeded); return { p: tr('exam.sol.detErr', { i: i + 1, text: tr(`exam.det.${x.key}`, x.params) }) }; });
      return { s, o: o2, r: { det: [{ p: tr('exam.rub.det', { n: seeded.errors.length }) }] }, v: { errors: seeded.errors.map((e) => ({ type: e.type, element: e.element })) } };
    };
    P.times = () => {
      const s = []; const o2 = []; const r = {}; const v = {};
      if (sc !== 1) s.push({ p: tr('exam.withMeans') });
      if (it.times.includes('times')) {
        s.push({ p: tr('exam.ask.times') }, table([tr('col.act'), L.ES, L.EF, L.LS, L.LF], acts.map((id) => [id, null, null, null, null])), { p: tr('projectDur') }, { box: 1 });
        o2.push(table([tr('col.act'), L.ES, L.EF, L.LS, L.LF], acts.map((id) => [id, show(T()[id].ES), show(T()[id].EF), show(T()[id].LS), show(T()[id].LF)])), { p: `${tr('projectDur')} ${show(sol.cpm.duration)}` });
        for (const id of acts) for (const f of ['ES', 'EF', 'LS', 'LF']) v[`${id}.${f}`] = val(T()[id][f]);
        v.dur = val(sol.cpm.duration);
        r.times = [{ p: tr('exam.rub.times') }];
      }
      if (it.times.includes('events')) {
        const evs = net.events.map((e) => e.n);
        if (ownNet) s.push({ p: tr('exam.ask.eventsOwn') }, { box: 6 });
        else {
          if (has('succ')) s.push({ p: tr('exam.ask.eventsSucc') });
          else {
            const arcs = [...net.arcs.map((a) => ({ label: a.act, from: a.from, to: a.to, dummy: false })), ...net.dummies.map((x) => ({ label: x.name, from: x.from, to: x.to, dummy: true }))]
              .sort((x, y) => x.from - y.from || x.to - y.to || natural(x.label, y.label));
            s.push({ p: tr('series.ask.evNet') }, table([tr('col.arc'), tr('col.from'), tr('col.to')], arcs.map((a) => [a.dummy ? tr('dummy', { name: a.label }) : a.label, a.from, a.to])));
          }
          s.push({ p: tr('exam.ask.events') }, table([tr('col.event'), L.TE, L.TL, tr('col.slack')], evs.map((nn) => [nn, null, null, null])));
        }
        o2.push(table([tr('col.event'), L.TE, L.TL, tr('col.slack')], evs.map((nn) => [nn, show(sol.events.TE[nn]), show(sol.events.TL[nn]), show(sol.events.slack[nn])])));
        if (ownNet) o2.push({ p: tr('exam.sol.refNet') });
        for (const nn of evs) { v[`e${nn}.TE`] = val(sol.events.TE[nn]); v[`e${nn}.TL`] = val(sol.events.TL[nn]); v[`e${nn}.slack`] = val(sol.events.slack[nn]); }
        r.events = [{ p: tr(ownNet ? 'exam.rub.eventsOwn' : 'exam.rub.events') }];
      }
      return { s, o: o2, r, v };
    };
    P.floats = () => {
      const s = []; const o2 = []; const r = {}; const v = {};
      if (sc !== 1 && !has('times')) s.push({ p: tr('exam.withMeans') });
      const fs = (it.floats.includes('floats') ? ['TF', 'FF', 'IF'] : []).concat(it.floats.includes('sf') ? ['SF'] : []);
      if (fs.length) {
        s.push({ p: tr('exam.ask.floats') }, table([tr('col.act'), ...fs.map((x) => L[x])], acts.map((id) => [id, ...fs.map(() => null)])));
        o2.push(table([tr('col.act'), ...fs.map((x) => L[x])], acts.map((id) => [id, ...fs.map((x) => show(F()[id][x]))])));
        for (const id of acts) for (const x of fs) v[`${id}.${x}`] = val(F()[id][x]);
        if (it.floats.includes('floats')) r.floats = [{ p: tr('exam.rub.floats') }];
        if (it.floats.includes('sf')) r.sf = [{ p: tr('exam.rub.sf') }];
      }
      if (it.floats.includes('critical')) {
        const paths = sol.cpm.criticalPaths.map((x) => x.acts.join(SEP)).sort(natural);
        s.push({ p: tr('exam.ask.critical') }, { box: 2 });
        o2.push({ p: tr('sol.critical', { acts: sol.cpm.critical.join(', ') }) }, { p: tr('sol.paths', { paths: paths.join('; '), dur: show(sol.cpm.duration) }) });
        v.critical = sol.cpm.critical.slice();
        v.paths = paths;
        r.critical = [{ p: tr('exam.rub.critical') }];
      }
      return { s, o: o2, r, v };
    };
    P.minDummy = () => {
      const k = base.info && Number.isInteger(base.info.dummies) ? base.info.dummies : MD().solve(project).value;
      return { s: [{ p: tr('exam.ask.minDummy') }, { box: 1 }], o: [{ p: k === 0 ? tr('sol.minDummyNone') : k === 1 ? tr('sol.minDummyOne') : tr('sol.minDummy', { n: k }) }],
        r: { minDummy: [{ p: tr('exam.rub.minDummy') }] }, v: { dummies: k } };
    };
    P.succ = () => {
      const order = [...acts, ...net.dummies.map((d) => d.name)];
      const byOpt = (a, b) => order.indexOf(a) - order.indexOf(b);
      const lab = (xs) => xs.map((e) => e.act || e.name);
      const rows = []; const solRows = []; const v = {};
      for (const e of net.events) {
        const out = lab(edges.filter((x) => x.from === e.n)).sort(byOpt);
        if (!out.length) continue;
        rows.push([e.n, none(lab(edges.filter((x) => x.to === e.n)).sort(byOpt)), null]);
        solRows.push([e.n, out.join(', ')]);
        v[`e${e.n}.succ`] = out;
      }
      const s = ownNet ? [{ p: tr('exam.ask.succOwn') }, { box: 6 }] : [{ p: tr('exam.ask.succ') }, table([tr('col.event'), tr('col.arrives'), tr('col.leaves')], rows)];
      const o2 = [table([tr('col.event'), tr('col.leaves')], solRows)];
      if (ownNet) o2.push({ p: tr('exam.sol.refNet') });
      return { s, o: o2, r: { succ: [{ p: tr(ownNet ? 'exam.rub.succOwn' : 'exam.rub.succ') }] }, v };
    };
    P.tcl = () => {
      const t = TV(); const ti = it.tcl; const X = model.tcl;
      const s = []; const o2 = []; const r = {}; const v = {};
      const pct = Math.round(X.prob * 100);
      if (ti.includes('moments')) {
        s.push({ p: tr('exam.ask.moments') }, table([tr('col.act'), 'tₑ', 'σ²'], X.rows.map((x) => [x.id, null, null])));
        o2.push(table([tr('col.act'), 'tₑ', 'σ²'], X.rows.map((x) => [x.id, n2(t.mom[x.id].te), n2(t.mom[x.id].var)])));
        for (const x of X.rows) { v[`${x.id}.te`] = t.mom[x.id].te; v[`${x.id}.var`] = t.mom[x.id].var; }
        r.moments = [{ p: tr('exam.rub.moments') }];
      }
      if (ti.includes('path')) { s.push({ p: tr('ask.path') }, { box: 1 }); v.path = t.path.slice(); r.path = [{ p: tr('exam.rub.path') }]; }
      if (ti.includes('project')) { s.push({ p: tr('ask.mu') }, { box: 1 }, { p: tr('ask.var') }, { box: 1 }); v.mu = t.mu; v.var = t.var; r.project = [{ p: tr('exam.rub.project') }]; }
      if (ti.includes('path') || ti.includes('project')) o2.push({ p: tr('sol.tclPath', { path: t.path.join(SEP), mu: n2(t.mu), var: n2(t.var) }) });
      if (ti.includes('prob')) {
        s.push({ p: tr('ask.z', { T: X.deadline }) }, { box: 1 }, { p: tr('ask.p', { T: X.deadline }) }, { box: 1 });
        o2.push({ p: tr('sol.tclProb', { var: n2(t.vR), sd: n2(t.sd), T: X.deadline, mu: n2(t.muR), z: n2(t.z), p: n4(t.p), pe: n4(t.pe) }) });
        v.z = t.z; v.p = t.p; r.prob = [{ p: tr('exam.rub.prob') }];
      }
      if (ti.includes('deadline')) {
        s.push({ p: tr('ask.zp', { pct }) }, { box: 1 }, { p: tr('ask.Tp') }, { box: 1 });
        o2.push({ p: tr('sol.tclProbQ', { pct, zp: n2(t.zp), zpe: I.numText(lang, t.zpe, 3), Tp: n2(t.Tp) }) });
        if (X.prob === 0.95) o2.push({ p: tr('sol.tcl95') });
        v.zp = t.zp; v.Tp = t.Tp; r.deadline = [{ p: tr(X.prob === 0.95 ? 'exam.rub.deadline95' : 'exam.rub.deadline') }];
      }
      if (ti.includes('route') && t.route) {
        const R0 = t.route; const route = R0.acts.join(SEP);
        s.push({ p: tr('series.ask.tclRoute', { route }) }, { p: tr('ask.rMu', { route }) }, { box: 1 }, { p: tr('ask.rVar') }, { box: 1 },
          { p: tr('ask.rZ', { T: X.deadline }) }, { box: 1 }, { p: tr('ask.rP', { T: X.deadline }) }, { box: 1 }, { p: tr('ask.both', { T: X.deadline }) }, { box: 1 });
        o2.push({ p: tr('sol.tclRoute', { route, mu: n2(R0.mu), var: n2(R0.var), sd: n2(R0.sd), T: X.deadline, z: n2(R0.z), p: n4(R0.p), pe: n4(R0.pe) }) },
          { p: tr('sol.tclBoth', { pc: n4(t.p), pr: n4(R0.p), both: n4(R0.both) }) });
        Object.assign(v, { 'r.mu': R0.mu, 'r.var': R0.var, 'r.z': R0.z, 'r.p': R0.p, both: R0.both });
        r.route = [{ p: tr('exam.rub.route') }];
      }
      return { s, o: o2, r, v };
    };
    P.read = () => {
      const X = model.read; const so = PG().solve('read', X); const ri = it.read;
      const s = [{ p: tr('stem.mcRead') }]; const o2 = []; const r = {}; const v = {};
      const sameAmb = model.tcl && tcl && JSON.stringify(X.tcl.rows) === JSON.stringify(model.tcl.rows);
      if (!sameAmb) s.push(table([tr('col.act')].concat(stmtOn ? [] : [tr('col.preds')], ['a', 'm', 'b']), X.tcl.rows.map((x) => [x.id].concat(stmtOn ? [] : [none(x.preds)], [n2(x.a), n2(x.m), n2(x.b)]))));
      const dec = lang === 'es' ? ',' : '.';
      const ch = (key, pp) => tr(`chart.${key}`, pp);
      const deadline = X.ask.deadline;
      const ids = X.tcl.rows.map((x) => x.id);
      const dist = { kind: 'dist', durations: so.sorted, deadline, title: ch('dist'), desc: ch('distDesc'), dec,
        labels: { deadline: ch('deadline', { d: n2(deadline) }), x: ch('x'), hist: ch('hist'), cdf: ch('cdf') } };
      const idx = { kind: 'indices', rows: ids.map((id) => ({ id, crit: so.crit[id], cruc: so.cruc[id] })), title: ch('idx'), desc: ch('idxDesc'), dec, labels: { crit: ch('crit'), cruc: ch('cruc') } };
      s.push(svgBlock(dist, `${dist.title}. ${dist.desc}`, true), svgBlock(idx, `${idx.title}. ${idx.desc}`, true));
      const pct = Math.round(X.ask.pct * 100);
      const optText = (q, x) => (q.key === 'normal' ? tr(`mcq.${x}`) : q.key === 'promise' ? I.numText(lang, x, 1) : x);
      if (ri.includes('pct')) { s.push({ p: tr('ask.pct', { p: pct }) }, { box: 1 }); v.pct = so.pct.value; r.pct = [{ p: tr('exam.rub.pct', { w: n2(so.classW) }) }]; }
      if (ri.includes('pT')) { s.push({ p: tr('ask.p', { T: deadline }) }, { box: 1 }); v.pT = so.pT; r.pT = [{ p: tr('exam.rub.read') }]; }
      if (ri.includes('crit')) { s.push({ p: tr('ask.crit', { a: X.ask.act }) }, { box: 1 }); v.crit = so.act.crit; r.crit = [{ p: tr('exam.rub.read') }]; }
      if (ri.includes('pct') || ri.includes('pT') || ri.includes('crit')) o2.push({ p: tr('sol.mcRead', { p: pct, v: n2(so.pct.value), w: n2(so.classW), T: deadline, pT: n2(so.pT), a: X.ask.act, c: n2(so.act.crit) }) });
      if (ri.includes('questions')) {
        for (const q of X.questions) {
          const qt = tr(`mcq.${q.key}`, { T: deadline, pn: n4(so.normal.pT) });
          s.push({ p: qt }, { p: q.options.map((x) => optText(q, x)).join(' · ') });
          o2.push({ p: tr('exam.sol.mcq', { q: qt, a: optText(q, q.correct) }) });
          v[`q.${q.key}`] = q.correct;
        }
        r.questions = [{ p: tr('exam.rub.questions') }];
      }
      return { s, o: o2, r, v };
    };
    P.disc = () => {
      const X = model.disc; const so = PG().solve('disc', X); const di = it.disc;
      const durP = (x) => (x.x ? x.x.map((y, i) => `${y} (${fracText(x.p[i])})`).join(' · ') : String(x.d));
      const s = [{ p: tr('stem.mcDisc', { list: X.disc.join(', '), T: X.deadline }) },
        table([tr('col.act'), tr('col.durP')].concat(stmtOn ? [] : [tr('col.preds')]), X.rows.map((x) => [x.id, durP(x)].concat(stmtOn ? [] : [none(x.preds)])))];
      const o2 = []; const r = {}; const v = {};
      if (di.includes('combos')) {
        const head = [tr('exam.col.combo'), ...X.disc, 'T', tr('col.prob')];
        s.push({ p: tr('exam.ask.combos') }, table(head, so.combos.map((x, i) => [i + 1, ...X.disc.map((id) => x.vals[id]), null, null])));
        o2.push(table(head, so.combos.map((x, i) => [i + 1, ...X.disc.map((id) => x.vals[id]), x.T, fracText(x.p)])));
        so.combos.forEach((x, i) => { v[`c${i + 1}.T`] = x.T; v[`c${i + 1}.p`] = x.p; });
        r.combos = [{ p: tr('exam.rub.combos') }];
      }
      if (di.includes('mean')) { s.push({ p: tr('ask.mean') }, { box: 1 }); v.mean = so.mean; r.mean = [{ p: tr('exam.rub.mean') }]; }
      if (di.includes('pT')) { s.push({ p: tr('ask.p', { T: X.deadline }) }, { box: 1 }); v.pT = so.pT; r.pT = [{ p: tr('exam.rub.discP') }]; }
      if (di.includes('mean') || di.includes('pT')) o2.push({ p: tr('sol.mcDisc', { mean: n3(so.mean), T: X.deadline, pT: n3(so.pT) }) });
      if (di.includes('crit')) {
        s.push({ p: tr('exam.ask.critIdx') }, table([tr('col.act'), tr('col.critIdx')], X.disc.map((id) => [id, null])));
        o2.push({ p: tr('sol.crit', { list: X.disc.map((id) => `${id} ${n3(so.crit[id])}`).join(' · ') }) });
        for (const id of X.disc) v[`${id}.crit`] = so.crit[id];
        r.crit = [{ p: tr('exam.rub.discCrit') }];
      }
      return { s, o: o2, r, v };
    };
    P.rep = () => {
      const X = model.rep; const so = PG().solve('rep', X); const ri = it.rep;
      const ids = X.rows.map((x) => x.id);
      const head = [tr('col.run'), ...ids, 'T', tr('exam.col.critRun')];
      const s = [{ p: tr('stem.mcRep', { T: X.deadline }) }];
      if (!stmtOn && !needsData) s.push(table([tr('col.act'), tr('col.preds')], X.rows.map((x) => [x.id, none(x.preds)])));
      s.push(table(head, X.reps.map((row, i) => [i + 1, ...row, ri.includes('reps') ? null : so.reps[i].T, ri.includes('marks') ? null : so.reps[i].crit.join(', ')])));
      const o2 = [table(head, X.reps.map((row, i) => [i + 1, ...row, so.reps[i].T, so.reps[i].crit.join(', ')]))];
      const r = {}; const v = {};
      if (ri.includes('reps')) { so.reps.forEach((x, i) => { v[`r${i + 1}.T`] = x.T; }); r.reps = [{ p: tr('exam.rub.reps') }]; }
      if (ri.includes('marks')) { so.reps.forEach((x, i) => { v[`r${i + 1}.crit`] = x.crit.slice().sort(); }); r.marks = [{ p: tr('exam.rub.marks') }]; }
      if (ri.includes('pT')) { s.push({ p: tr('ask.p', { T: X.deadline }) }, { box: 1 }); v.pT = so.pT; o2.push({ p: tr('sol.mcRep', { k: so.k, n: X.n, T: X.deadline, p: n3(so.pT) }) }); r.pT = [{ p: tr('exam.rub.repP') }]; }
      if (ri.includes('crit')) {
        s.push({ p: tr('exam.ask.critIdx') }, table([tr('col.act'), tr('col.critIdx')], ids.map((id) => [id, null])));
        o2.push({ p: tr('sol.crit', { list: ids.map((id) => `${id} ${so.count[id]}/${X.n}`).join(' · ') }) });
        for (const id of ids) v[`${id}.crit`] = so.crit[id];
        r.crit = [{ p: tr('exam.rub.repCrit') }];
      }
      return { s, o: o2, r, v };
    };

    // ---------- los ejemplos de error consecuente (con el corrector del núcleo) ----------
    function calcExampleOf() {
      const ask = [...(it.times || []), ...(it.floats || [])];
      const shown = (x) => String(r2(x));
      const durRows = base.rows.map((r) => {
        const d0 = r2(sol.project.activities.find((x) => x.id === r.id).d / sc);
        return { id: r.id, name: '', duration: String(d0), links: r.links };
      });
      const gs = GRD().solve(PR.parse(durRows, 'pred').project);
      const sheetOf = () => {
        const sh = { act: {}, dur: shown(gs.cpm.duration) };
        for (const id of acts) sh.act[id] = { ES: shown(gs.cpm.times[id].ES), EF: shown(gs.cpm.times[id].EF), LS: shown(gs.cpm.times[id].LS), LF: shown(gs.cpm.times[id].LF),
          TF: shown(gs.cpm.floats[id].TF), FF: shown(gs.cpm.floats[id].FF), IF: shown(gs.cpm.floats[id].IF), SF: shown(gs.cpm.floats[id].SF) };
        return sh;
      };
      // La hoja de quien se equivoca en el EF de a (δ de más) y sigue bien con sus datos: tiempos, duración y holguras.
      const tryOne = (a, delta) => {
        const sheet = sheetOf();
        const sown = `${a}.EF`;
        sheet.act[a].EF = shown(gs.cpm.times[a].EF + delta);
        for (let i = 0; i < 200; i++) {
          const cl = GRD().grade(gs, sheet, ['times', 'floats', 'sf']).cells;
          let changed = false;
          for (const [k, cell] of Object.entries(cl)) {
            const [id, f] = k.split('.');
            if (k === sown || !sheet.act[id] || cell.state === 'carried' || r2(cell.expect) === r2(cell.right) || sheet.act[id][f] === String(cell.expect)) continue;
            sheet.act[id][f] = String(cell.expect);
            changed = true;
          }
          const ef = shown(Math.max(...acts.filter((id) => !gs.project.succs[id].length).map((id) => Number(sheet.act[id].EF))));
          if (ef !== sheet.dur) { sheet.dur = ef; changed = true; }
          if (!changed) break;
        }
        const cl = GRD().grade(gs, sheet, ask).cells;
        return { a, sown, sheet, wrong: Number(sheet.act[a].EF), carried: Object.keys(cl).filter((k) => cl[k].state === 'carried'), ok: !cl[sown] || cl[sown].state === 'wrong' };
      };
      // El ejemplo: de 3 a 15 casillas arrastradas, mejor si el error pasa a las posteriores; si no, el más corto de al
      // menos 3; si no, el que más arrastre. Primero las actividades no críticas; δ de 1 a 5 o su holgura total.
      const crit = new Set(gs.cpm.critical);
      const cands = acts.slice().sort((x, y) => Number(crit.has(x)) - Number(crit.has(y)));
      const tier = (t) => { const n = t.carried.length; const mid = n >= 3 && n <= 15; return [mid && gs.project.succs[t.a].length ? 0 : mid ? 1 : n >= 3 ? 2 : 3, n >= 3 ? n : -n]; };
      let best = null;
      for (const a of cands) for (const delta of [...new Set([1, 2, 3, 4, 5, r2(gs.cpm.floats[a].TF)])].filter((x) => x > 0)) {
        const t = tryOne(a, delta);
        if (!t.ok || !t.carried.length) continue;
        const [k1, k2] = tier(t);
        if (!best || k1 < best.k1 || (k1 === best.k1 && k2 < best.k2)) best = Object.assign(t, { k1, k2 });
      }
      if (!best) return null;
      const { sown, sheet, carried } = best;
      const a = best.a; const wrong = best.wrong;
      return { consequent: { kind: 'calc', ask, answers: sheet, sown, carried },
        p: tr('exam.rub.example', { cell: cellName('calc', sown), wrong: I.numText(lang, wrong, 2), right: I.numText(lang, gs.cpm.times[a].EF, 2), list: carried.map((k) => cellName('calc', k)).join(', ') }) };
    }
    function probExampleOf(kind) {
      const X = model[kind];
      const so = PG().solve(kind, X);
      const want = { tcl: { moments: (f) => /\.(te|var)$/.test(f) && !f.startsWith('r.'), path: (f) => f === 'path', project: (f) => f === 'mu' || f === 'var', prob: (f) => f === 'z' || f === 'p', deadline: (f) => f === 'zp' || f === 'Tp', route: (f) => f.startsWith('r.') || f === 'both' },
        disc: { combos: (f) => /^c\d+\./.test(f), mean: (f) => f === 'mean', pT: (f) => f === 'pT', crit: (f) => /^[^c].*\.crit$|^c[^\d].*\.crit$/.test(f) || (/\.crit$/.test(f) && !/^c\d+\./.test(f)) },
        rep: { reps: (f) => /^r\d+\.T$/.test(f), marks: (f) => /^r\d+\.crit$/.test(f), pT: (f) => f === 'pT', crit: (f) => /\.crit$/.test(f) && !/^r\d+\./.test(f) } }[kind];
      const fields = PGR().fields(kind, X).filter((f) => it[kind].some((x) => want[x] && want[x](f)));
      const fmt = (x) => (Array.isArray(x) ? x.join(', ') : String(x));
      const right = {};
      if (kind === 'tcl') {
        const t = TV();
        for (const x of X.rows) { right[`${x.id}.te`] = r2(t.mom[x.id].te); right[`${x.id}.var`] = r2(t.mom[x.id].var); }
        Object.assign(right, { path: t.path.join(', '), mu: r2(t.mu), var: r2(t.var), z: t.z, p: t.p, zp: t.zp, Tp: r2(t.Tp) });
        if (t.route) Object.assign(right, { 'r.mu': r2(t.route.mu), 'r.var': r2(t.route.var), 'r.z': t.route.z, 'r.p': t.route.p, both: Math.round(t.route.both * 1e4) / 1e4 });
      } else if (kind === 'disc') {
        so.combos.forEach((x, i) => { right[`c${i + 1}.T`] = x.T; right[`c${i + 1}.p`] = x.p; });
        Object.assign(right, { mean: so.mean, pT: so.pT });
        for (const id of X.disc) right[`${id}.crit`] = so.crit[id];
      } else {
        so.reps.forEach((x, i) => { right[`r${i + 1}.T`] = x.T; right[`r${i + 1}.crit`] = x.crit.join(', '); });
        right.pT = so.pT;
        for (const x of X.rows) right[`${x.id}.crit`] = so.crit[x.id];
      }
      const ans = Object.fromEntries(fields.map((f) => [f, fmt(right[f])]));
      let sown = null; let wrongTxt = null;
      if (kind === 'tcl') {
        const a = TV().path[0];
        sown = fields.includes(`${a}.te`) ? `${a}.te` : fields.includes('mu') ? 'mu' : fields.includes('var') ? 'var' : null;
        if (sown) { const w = r2(Number(right[sown]) + 1); ans[sown] = String(w); wrongTxt = I.numText(lang, w, 2); }
      } else if (kind === 'disc') {
        sown = fields.includes('c1.T') ? 'c1.T' : null;
        if (sown) { const w = Number(right[sown]) + 1; ans[sown] = String(w); wrongTxt = String(w); }
      } else {
        sown = fields.includes('r1.crit') ? 'r1.crit' : fields.includes('r1.T') ? 'r1.T' : null;
        if (sown === 'r1.crit') { const cr = so.reps[0].crit; const extra = X.rows.map((x) => x.id).find((id) => !cr.includes(id)); const w = extra ? cr.concat([extra]) : cr.slice(1); ans[sown] = w.join(', '); wrongTxt = w.join(', '); }
        else if (sown) { const w = Number(right[sown]) + 1; ans[sown] = String(w); wrongTxt = String(w); }
      }
      if (!sown) return null;
      const cells = settle((x) => PGR().grade(kind, X, x).cells, ans, sown, fields, fmt);
      const carried = fields.filter((f) => cells[f] && cells[f].status === 'carried');
      if (!carried.length || cells[sown].status !== 'wrong') return null;
      return { consequent: { kind, answers: ans, sown, carried }, p: tr('exam.rub.example', { cell: cellName(kind, sown), wrong: wrongTxt, right: fmt(right[sown]), list: carried.map((k) => cellName(kind, k)).join(', ') }) };
    }

    // ---------- montaje ----------
    for (const p of c.parts) {
      const part = P[p]();
      values[p] = part.v;
      const title = tr(`exam.part.${p}`);
      const mark = () => ({ part: p, title, pts: points[p].pts });
      student.push(mark(), ...part.s);
      solution.push(mark(), ...part.o);
      rubric.push(mark());
      const items = it[p] || [p];
      for (const x of items) {
        rubric.push({ item: x, part: p, pts: points[p].items[x] }, ...((part.r && part.r[x]) || [{ p: tr(`exam.rub.${p}`) }]));
      }
      if ((p === 'times' || (p === 'floats' && !has('times'))) && !calcExample) {
        calcExample = true;
        const ex = calcExampleOf();
        if (ex) rubric.push(ex);
      }
      if (['tcl', 'disc', 'rep'].includes(p)) {
        const ex = probExampleOf(p);
        if (ex) rubric.push(ex);
      }
    }
    const link = linkOf(model, o, c, ctx);
    if (extras.qr) student.push({ link });
    if (has('tcl') && extras.normal) student.push({ annex: 'normal' });
    if (extras.grid) student.push({ annex: 'grid', w: GRID.aon[level][0], h: GRID.aon[level][1] });
    const meta = { letter: model.letter || 'A', seed: model.seed, sdUsed: model.sdUsed, example: model.example || null, level: o.level };
    return { ok: true, meta, student, solution, rubric, values, points, link };
  }

  /** El enlace corto del alumno (P3; con un ejemplo, H3). */
  function linkOf(model, o, c, ctx) {
    const lang = ctx.lang === 'en' ? 'en' : 'es';
    const nota = ctx.nota === 'es' ? '&nota=es' : '';
    const id = model.example;
    if (id) {
      if (id === 'kl' || id === 'hl') return `${APP}#v=unc&um=m6&ue=${id}&lang=${lang}${nota}`;
      if (id === 'kd') return `${APP}#v=unc&um=m7&ue=kd&lang=${lang}${nota}`;
      return `${APP}#v=route&ex=${id}&lang=${lang}${nota}`;
    }
    const head = (xk) => `${APP}#v=ex&xk=${xk}&lv=${o.level}&sd=${model.sdUsed}&lang=${lang}${nota}`;
    if (c.parts.includes('tcl')) return head('tcl') + (c.items.tcl.includes('route') ? '&xo=1' : '');
    const mc = ['read', 'disc', 'rep'].filter((p) => c.parts.includes(p)).pop();
    if (mc) return `${head('mc')}&mv=${mc}`;
    return head('calc');
  }

  const api = { PARTS, ITEMS, LEVELS, MAX_MODELS, TRIES_EXAM, MODEL_STEP, SEED_MAX, EXAMPLES, STRUCT_ONLY, partsOf, check, stagesOf,
    modelSeed, start, step, result, project, models, APP, PAPER_DX, PAPER_MAX, WIDE, GRID, points, itemPoints, document };
  root.PNL = root.PNL || {};
  root.PNL.exam = api;
  if (isNode) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
