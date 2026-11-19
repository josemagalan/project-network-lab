/*
 * core/series — las series encadenadas de Moodle (spec f3e-probabilidad-montecarlo, AC16 y AC26; plan §0 y P7; análisis
 * H4; tablero 101). Una serie es una sola pregunta cloze con un solo proyecto y las etapas que elige el profesor, en el
 * orden de ADMITTED (el enunciado primero y después el de STAGES_ALL), cada una en su parte («Parte 3 · Holguras»).
 * Una parte no da los resultados de las otras: la tabla del proyecto (o el enunciado) va una vez, arriba.
 * - Admitidas: el enunciado (0), las siete de cálculo de la F3b (1–6), el mínimo de ficticias (7), los sucesores (8) y
 *   las del TCL (11–14). Las precedencias inmediatas y el detective cambian la tabla o enseñan una red con errores, y las
 *   de Montecarlo usan otra tabla de datos: no entran (RangeError).
 * - El proyecto de la semilla s es la tabla del generador de la F3a; con alguna etapa del TCL, la de core/probgen
 *   (la misma tabla con a, m y b; con la 14, la que tiene la otra ruta), así que s abre el mismo ejercicio en el laboratorio.
 * - Con alguna etapa del TCL, las partes de tiempos, holguras, caminos y sucesos van con las medias tₑ: valen las de dos
 *   decimales (como en el examen) y las exactas, cada una ±0,01 (NUMERICAL con dos respuestas al 100 %). Se calculan con
 *   duraciones enteras (tₑ·100 y a + 4m + b = 6·tₑ) y se dividen, sin errores del binario; si con unas y otras no salen
 *   las mismas actividades y caminos críticos, la semilla no vale. Sin TCL, con las duraciones de la tabla (exactas).
 * - En las del TCL, z, P y el plazo valen con μ y σ² redondeadas al final y con las sumas de las medias redondeadas.
 * - Con el enunciado y el TCL, el enunciado da m y una tabla debajo da a y b (H4), en un contexto en semanas (decisión del
 *   autor en T015: los del TCL hablan de semanas). Con la parte 8, las 5 y 6 no dan la tabla de arcos (es su respuesta;
 *   decisión del autor en T015): usan los sucesos de la parte 8. Sin ella, la tabla de arcos va en la primera de las dos.
 * - Categoría Series/<códigos de las etapas>/<nivel>, p. ej. «Series/0-1-3-11-12-13/Media».
 * runner(opts, tr) va por pasos, como el de core/moodle; generate(opts, tr) da el banco entero para toXml.
 * Sin DOM ni azar.
 */
(function (root) {
  'use strict';

  const isNode = typeof module !== 'undefined' && module.exports;
  const req = (f, k) => (isNode ? require(f) : root.PNL[k]);
  const M = req('./moodle.js', 'moodle');
  const PR = req('./project.js', 'project');
  const C = req('./cpm.js', 'cpm');
  const G = req('./generator.js', 'generator');
  const GR = req('./grade.js', 'grade');
  const U = req('./urlstate.js', 'urlstate');
  const R = req('./rng.js', 'rng');
  const MD = req('./mindummy.js', 'mindummy');
  // Las familias del enunciado y la estocástica llegan al marcarlas; en Node, al pedirlas.
  const SG = () => req('./stmtgen.js', 'stmtgen');
  const CX = () => req('./contexts.js', 'contexts');
  const PG = () => req('./probgen.js', 'probgen');
  const TL = () => req('./tcl.js', 'tcl');
  const I = M._;

  const DET = M.STAGES;
  const TCL = ['tclMoments', 'tclPath', 'tclProb', 'tclRoute'];
  const ADMITTED = ['stmt', ...DET, 'minDummy', 'succ', ...TCL];
  const CODE = { stmt: '0', early: '1', late: '2', floats: '3', critAct: '4a', critPath: '4b', evEarly: '5', evLate: '6',
    minDummy: '7', succ: '8', tclMoments: '11', tclPath: '12', tclProb: '13', tclRoute: '14' };
  const TOL_T = 0.01;                       // tiempos con las medias (plan P7)
  const SALT_CTX = 89;                      // contexto en semanas cuando el de la semilla va en días
  // Intentos por serie (× M.TRIES_PER): la otra ruta sale en el 4–12 % de las tablas (T014) y el TCL descarta empates.
  const SERIES_MULT = { tclRoute: 20, tcl: 3, base: 1 };

  /** Las etapas de una serie en su orden; RangeError si alguna no puede ir en una serie o no hay ninguna. */
  function order(stages) {
    const want = new Set(stages || []);
    for (const s of want) if (!ADMITTED.includes(s)) throw new RangeError(`series: la etapa ${s} no puede ir en una serie`);
    const out = ADMITTED.filter((s) => want.has(s));
    if (!out.length) throw new RangeError('series: sin etapas');
    return out;
  }
  const hasTcl = (stages) => stages.some((s) => TCL.includes(s));
  const multOf = (stages) => (stages.includes('tclRoute') ? SERIES_MULT.tclRoute : hasTcl(stages) ? SERIES_MULT.tcl : SERIES_MULT.base);

  /** El proyecto de una semilla y un nivel para esas etapas; null si no vale (sin tabla, sin la otra ruta…). */
  function exercise(stages0, level, sd) {
    const stages = order(stages0);
    const g = G.generate(sd, G.LEVELS[level]);
    if (!g.ok) return null;
    let tcl = null;
    if (hasTcl(stages)) {
      const c = PG().candidate('tcl', sd, level, { route: stages.includes('tclRoute') });
      if (!c.ok) return null;
      tcl = c.ex;
    }
    return { level, seed: sd, gv: G.VERSION, rows: g.rows, info: g.info, tcl };
  }
  /** Un proyecto sin semilla (ejemplos citados): una tabla de la F1 (de predecesoras o de sucesoras). */
  function fromRows(rows, mode) {
    const r = PR.toRows(PR.parse(rows, mode || 'pred').project, 'pred').map((x) => ({ id: x.id, name: '', duration: x.duration, links: x.links }));
    return { level: null, seed: null, gv: G.VERSION, rows: r, info: null, tcl: null };
  }
  /** Un proyecto del TCL sin semilla (probgen.fromExample): la tabla de sus m, con a, m y b. */
  function fromTcl(tcl) {
    const rows = tcl.rows.map((x) => ({ id: x.id, name: '', duration: String(x.m), links: x.preds.join(', ') }));
    return { level: null, seed: null, gv: G.VERSION, rows, info: null, tcl };
  }

  // La solución de la F1 con unas duraciones enteras d(fila) y su escala (los valores se dividen por ella).
  function scaled(rows, d, scale) {
    const project = PR.parse(rows.map((r) => ({ id: r.id, name: '', duration: String(d(r)), links: r.links })), 'pred').project;
    return { sol: GR.solve(project), paths: C.solve(project, { pathLimit: I.PATH_LIMIT }).paths.list, scale };
  }
  const same = (x, y) => JSON.stringify(x) === JSON.stringify(y);

  /** ¿Vale la tabla del TCL? Con los datos a dos decimales, el mismo camino de las medias y sin empate de igual σ². */
  function tclOk(ex) {
    const d = I.tclData(ex);
    const shown = TL().exam(d.shownModel, { prob: 0.5 });
    return same(shown.path, d.exact.path) && !shown.ties.some((t) => Math.abs(t.var - shown.var) < 1e-9);
  }
  /** M6 con una sola normal: z, la tabla, la exacta y el plazo de una probabilidad. */
  const oneNormal = (mu, v, query) => TL().exam({ acts: [{ id: 'T', preds: [], dist: { kind: 'normal', mu, var: v } }] }, query);
  /** Respuestas sin repetir (las que Moodle escribe igual). */
  const uniq = (xs) => xs.filter((x, i) => xs.findIndex((y) => I.clozeNum(y.v) === I.clozeNum(x.v)) === i);

  /** La pregunta de una serie: stages (admitidas), el proyecto de exercise o fromRows; null si el proyecto no vale. */
  function question(stages0, base, ctx, tr) {
    const stages = order(stages0);
    const withTcl = hasTcl(stages);
    if (withTcl && !base.tcl) throw new Error('series: las etapas del TCL piden un proyecto con a, m y b');
    const tcl = base.tcl;
    // Con μ y σ² dados (ejemplo de las dos rutas) no hay a, m y b: no vale para una serie.
    if (tcl && tcl.rows.some((r) => r.a == null)) return null;
    const lang = ctx.lang === 'en' ? 'en' : 'es';
    const L = ctx.labels;
    const project = PR.parse(base.rows, 'pred').project;
    const acts = project.activities.map((a) => a.id);
    const preds = project.preds;
    const amb = tcl ? Object.fromEntries(tcl.rows.map((r) => [r.id, r])) : null;
    if (tcl && !same(tcl.rows.map((r) => r.id), acts)) return null;
    if (withTcl && stages.some((s) => s !== 'tclMoments' && TCL.includes(s)) && !tclOk(tcl)) return null;

    // Las soluciones deterministas: con las duraciones de la tabla, o con las medias a dos decimales y las exactas.
    const V = tcl
      ? [scaled(base.rows, (r) => Math.round(I.roundTo((amb[r.id].a + 4 * amb[r.id].m + amb[r.id].b) / 6, 2) * 100), 100),
        scaled(base.rows, (r) => amb[r.id].a + 4 * amb[r.id].m + amb[r.id].b, 6)]
      : [scaled(base.rows, (r) => r.duration, 1)];
    const main = V[0];
    // Las críticas tienen que ser las mismas con unas medias y otras (solo si hay partes que las usan).
    if (V.length > 1 && stages.some((st) => DET.includes(st)) && (!same(V[0].sol.cpm.critical, V[1].sol.cpm.critical)
      || !same(V[0].sol.cpm.criticalPaths.map((p) => p.acts), V[1].sol.cpm.criticalPaths.map((p) => p.acts)))) return null;
    const net = main.sol.net;
    const answers = {};
    let code = '';
    const hole = (c) => {
      const key = `${code}:${c.key}`;
      answers[key] = 'nums' in c ? c.nums[0].v : 'mc' in c || 'mr' in c ? c.answer : 'yesNo' in c ? (c.yesNo ? 'yes' : 'no') : c.num;
      return Object.assign({}, c, { key });
    };
    // Un valor determinista: f(solución) / escala en cada variante; con dos, las dos respuestas ±0,01.
    const T = (f, key) => {
      const vals = V.map((S) => f(S.sol) / S.scale);
      return hole(vals.length === 1 ? { num: vals[0], key } : { nums: uniq(vals.map((v) => ({ v, tol: TOL_T }))), key });
    };
    const show = (f) => (tcl ? I.numText(lang, f(main.sol) / main.scale, 2) : f(main.sol) / main.scale);
    const table = (head, rows) => ({ table: { head, rows } });
    const none = (xs) => (xs.length ? xs.join(', ') : tr('none'));
    const k = {
      tr, lang, table, hole: (c) => hole(c),
      preds: (r) => none(r.preds),
      list: (xs) => (xs.length < 2 ? xs.join('') : tr('and', { a: xs.slice(0, -1).join(', '), b: xs[xs.length - 1] })),
    };
    const n2 = (v) => I.numText(lang, v, 2);
    const times = (id) => ({ ES: (s) => s.cpm.times[id].ES, EF: (s) => s.cpm.times[id].EF, LS: (s) => s.cpm.times[id].LS, LF: (s) => s.cpm.times[id].LF });
    const fs = ['TF', 'FF', 'IF'].concat(ctx.sf ? ['SF'] : []);
    const evs = net.events.map((e) => e.n);
    const firstEv = stages.find((s) => s === 'evEarly' || s === 'evLate');
    const edges = [...net.arcs, ...net.dummies];
    const SEP = I.PATH_SEP;

    // ---------- la cabecera: la tabla o el enunciado ----------
    const text = [{ p: tr('series.intro') }];
    let cx = null; let sv = null; let made = null;
    if (stages.includes('stmt')) {
      const G3 = SG();
      const level = base.level || 'medium';
      const seed = base.seed == null ? 1 : base.seed;
      cx = G3.contextOf(seed, level);
      const weeks = (c) => CX().CONTEXTS[c].unit.many.en === 'weeks';
      if (tcl && !weeks(cx)) {
        const W = CX().KEYS.filter(weeks);
        cx = W[R.int(R.mulberry32(((seed * 7) + SALT_CTX) >>> 0), 0, W.length - 1)];
      }
      made = G3.compose(base.rows, level, cx, seed);
      if (!made.ok || acts.some((id) => preds[id].length > 8)) return null;
      sv = G3.VERSION;
      text.push({ p: tr('series.stmt') }, { quote: G3.render(made.def, lang).split('\n').filter(Boolean) });
      if (tcl) text.push({ p: tr('series.ab') }, table([tr('col.act'), ...acts], [['a', ...acts.map((id) => amb[id].a)], ['b', ...acts.map((id) => amb[id].b)]]));
    } else if (tcl) {
      text.push({ p: tr('series.tableTcl') }, table([tr('col.act'), tr('col.preds'), 'a', 'm', 'b'], acts.map((id) => [id, none(preds[id]), amb[id].a, amb[id].m, amb[id].b])));
    } else {
      const dur = Object.fromEntries(project.activities.map((a) => [a.id, a.d]));
      text.push({ p: tr('series.table') }, table([tr('col.act'), tr('col.dur'), tr('col.preds')], acts.map((id) => [id, dur[id], none(preds[id])])));
    }
    if (tcl && stages.some((s) => DET.includes(s))) text.push({ p: tr('series.means') });

    // ---------- las partes ----------
    const means = () => (tcl ? [{ p: tr('series.withMeans') }] : []);
    const PART = {
      stmt() {
        const name = Object.fromEntries(made.def.ref.rows.map((r) => [r.id, r.name[lang]]));
        const anc = {};
        for (const id of acts) { anc[id] = new Set(); const go = (x) => preds[x].forEach((p) => { if (!anc[id].has(p)) { anc[id].add(p); go(p); } }); go(id); }
        const mr = (id) => {
          const P = preds[id];
          const fr = M.MR_FRACTIONS[P.length];
          const opts = acts.filter((x) => x !== id).map((x) => ({ label: x, fraction: P.includes(x) ? fr : anc[id].has(x) ? '0' : P.length ? `-${fr}` : '-100' }));
          opts.push({ label: tr('noneOpt'), fraction: P.length ? `-${fr}` : '100' });
          return hole({ mr: opts, key: `${id}.preds`, answer: [...P].sort() });
        };
        return { text: [{ p: tr('stem.stmt') }, table([tr('col.act'), tr('col.name'), tr('col.immPreds')], acts.map((id) => [id, name[id], mr(id)]))],
          sol: [table([tr('col.act'), tr('col.name'), tr('col.preds')], acts.map((id) => [id, name[id], none(preds[id])]))] };
      },
      early() {
        return { text: [...means(), { p: tr('series.ask.early') },
          table([tr('col.act'), L.ES, L.EF], acts.map((id) => [id, T(times(id).ES, `${id}.ES`), T(times(id).EF, `${id}.EF`)])),
          { p: tr('projectDur'), hole: T((s) => s.cpm.duration, 'dur') }],
        sol: [table([tr('col.act'), L.ES, L.EF], acts.map((id) => [id, show(times(id).ES), show(times(id).EF)])), { p: `${tr('projectDur')} ${show((s) => s.cpm.duration)}` }] };
      },
      late() {
        return { text: [...means(), { p: tr('series.ask.late') },
          table([tr('col.act'), L.LS, L.LF], acts.map((id) => [id, T(times(id).LS, `${id}.LS`), T(times(id).LF, `${id}.LF`)]))],
        sol: [table([tr('col.act'), L.LS, L.LF], acts.map((id) => [id, show(times(id).LS), show(times(id).LF)]))] };
      },
      floats() {
        const f = (id, x) => (s) => s.cpm.floats[id][x];
        return { text: [...means(), { p: tr(ctx.sf ? 'series.ask.floatsSf' : 'series.ask.floats') },
          table([tr('col.act'), ...fs.map((x) => L[x])], acts.map((id) => [id, ...fs.map((x) => T(f(id, x), `${id}.${x}`))]))],
        sol: [table([tr('col.act'), ...fs.map((x) => L[x])], acts.map((id) => [id, ...fs.map((x) => show(f(id, x)))]))] };
      },
      critAct() {
        const crit = new Set(main.sol.cpm.critical);
        return { text: [...means(), { p: tr('series.ask.critAct') },
          table([tr('col.act'), tr('col.crit')], acts.map((id) => [id, hole({ yesNo: crit.has(id), key: `${id}.crit` })]))],
        sol: critSol() };
      },
      critPath() {
        const critical = main.sol.cpm.criticalPaths.map((p) => p.acts.join(SEP));
        const non = main.paths.filter((p) => !p.critical).slice(0, M.MAX_DISTRACTORS).map((p) => p.acts.join(SEP));
        if (non.length < M.MIN_DISTRACTORS || !M.MR_FRACTIONS[critical.length]) return null;
        const fr = M.MR_FRACTIONS[critical.length]; const fn = M.MR_FRACTIONS[non.length];
        const opts = [...critical.map((x) => ({ label: x, fraction: fr })), ...non.map((x) => ({ label: x, fraction: `-${fn}` }))]
          .sort((x, y) => I.natural(x.label, y.label));
        return { text: [...means(), { p: tr('series.ask.critPath'), hole: hole({ mr: opts, vertical: true, key: 'paths', answer: critical.slice().sort(I.natural) }) }],
          sol: critSol() };
      },
      evEarly() {
        return { text: [...means(), ...evNet('evEarly'), { p: tr('series.ask.evEarly') },
          table([tr('col.event'), L.TE], evs.map((n) => [n, T((s) => s.events.TE[n], `e${n}.TE`)]))],
        sol: [table([tr('col.event'), L.TE], evs.map((n) => [n, show((s) => s.events.TE[n])]))] };
      },
      evLate() {
        return { text: [...means(), ...evNet('evLate'), { p: tr('series.ask.evLate') },
          table([tr('col.event'), L.TL, tr('col.slack')], evs.map((n) => [n, T((s) => s.events.TL[n], `e${n}.TL`), T((s) => s.events.slack[n], `e${n}.slack`)]))],
        sol: [table([tr('col.event'), L.TL, tr('col.slack')], evs.map((n) => [n, show((s) => s.events.TL[n]), show((s) => s.events.slack[n])]))] };
      },
      minDummy() {
        const min = base.info && Number.isInteger(base.info.dummies) ? base.info.dummies : MD.solve(project);
        const value = typeof min === 'number' ? min : min.exact ? min.value : null;
        if (value === null) return null;
        return { text: [{ p: tr('series.ask.minDummy'), hole: hole({ num: value, key: 'dummies' }) }],
          sol: [{ p: value === 0 ? tr('sol.minDummyNone') : value === 1 ? tr('sol.minDummyOne') : tr('sol.minDummy', { n: value }) }] };
      },
      succ() {
        const labelsOf = (xs) => xs.map((e) => e.act || e.name);
        const optsAll = [...acts, ...net.dummies.map((d) => d.name)];
        const byOpt = (a, b) => optsAll.indexOf(a) - optsAll.indexOf(b);
        const rows = []; const solRows = [];
        for (const e of net.events) {
          const out = labelsOf(edges.filter((x) => x.from === e.n)).sort(byOpt);
          if (!out.length) continue;
          const fr = M.MR_FRACTIONS[out.length];
          if (!fr) return null;
          const into = labelsOf(edges.filter((x) => x.to === e.n)).sort(byOpt);
          rows.push([e.n, none(into), hole({ mr: optsAll.map((x) => ({ label: x, fraction: out.includes(x) ? fr : `-${fr}` })), key: `e${e.n}.succ`, answer: out })]);
          solRows.push([e.n, out.join(', ')]);
        }
        return { text: [{ p: tr('stem.succ') }, table([tr('col.event'), tr('col.arrives'), tr('col.leaves')], rows)],
          sol: [table([tr('col.event'), tr('col.leaves')], solRows)] };
      },
      tclMoments() {
        const m = (id) => TL().moments({ kind: 'pert', a: amb[id].a, m: amb[id].m, b: amb[id].b });
        return { text: [{ p: tr('series.ask.tclMoments') },
          table([tr('col.act'), 'tₑ', 'σ²'], acts.map((id) => [id, hole({ num: m(id).mean, tol: M.TOL.mom, key: `${id}.te` }), hole({ num: m(id).var, tol: M.TOL.mom, key: `${id}.var` })]))],
        sol: [table([tr('col.act'), 'tₑ', 'σ²'], acts.map((id) => [id, n2(m(id).mean), n2(m(id).var)]))] };
      },
      tclPath() {
        const b = I.BUILD.tclPath(tcl, k);
        return b && { text: [{ p: tr('series.ask.tclPath') }, ...b.text.filter((x) => x.hole)], sol: b.sol };
      },
      tclProb() {
        const P = prob();
        const pct = Math.round(tcl.prob * 100);
        const A = P.A;
        const sol = [{ p: tr('sol.tclProb', { var: n2(A.v), sd: n2(A.c.sd), T: tcl.deadline, mu: n2(A.mu), z: n2(A.c.table.z2), p: I.numText(lang, A.c.table.p4, 4), pe: I.numText(lang, A.c.exact, 4) }) },
          { p: tr('sol.tclProbQ', { pct, zp: n2(A.q.table.z2), zpe: I.numText(lang, A.q.z, 3), Tp: n2(A.q.table.deadline) }) }];
        if (tcl.prob === 0.95) sol.push({ p: tr('sol.tcl95') });
        // z y P de las dos maneras, y con σ redondeada a dos decimales (T021, N-F5).
        const zp = I.zpHoles(P.both.map((x) => x.c), tcl.deadline);
        return { text: [{ p: tr('series.ask.tclProb') },
          { p: tr('ask.z', { T: tcl.deadline }), hole: hole({ nums: zp.z, key: 'z' }) },
          { p: tr('ask.p', { T: tcl.deadline }), hole: hole({ nums: zp.p, key: 'p' }) },
          { p: tr('ask.zp', { pct }), hole: hole({ nums: uniq(P.both.flatMap((x) => x.zs)), key: 'zp' }) },
          { p: tr('ask.Tp'), hole: hole({ nums: uniq(P.both.flatMap((x) => x.Ts)), key: 'Tp' }) }],
        sol };
      },
      tclRoute() {
        if (!tcl.route) return null;
        const P = prob();
        const d = I.tclData(tcl);
        const muR = tcl.route.reduce((s, id) => s + d.mom[id].te, 0);
        const vR = tcl.route.reduce((s, id) => s + d.mom[id].var, 0);
        // Las dos maneras de llegar a μ y σ² de la ruta: redondeadas al final (A) o sumando las medias redondeadas (B).
        const rA = oneNormal(d.r2(muR), d.r2(vR), { deadline: tcl.deadline });
        const rB = oneNormal(d.r2(tcl.route.reduce((s, id) => s + d.r2(d.mom[id].te), 0)), d.r2(tcl.route.reduce((s, id) => s + d.r2(d.mom[id].var), 0)), { deadline: tcl.deadline });
        const pairs = [[P.A.c, rA], [P.B.c, rB]];
        // Con σ redondeada a dos decimales (T021, N-F5): la z y la P de la ruta y «las dos» con las dos z así.
        const zp = I.zpHoles([rA, rB], tcl.deadline);
        const sig = (x) => I.zpHoles([x], tcl.deadline).sig[0];
        const sigBoth = pairs.map(([x, r]) => [sig(x), sig(r)]).filter(([a, b]) => a && b).map(([a, b]) => ({ v: a.p4 * b.p4, tol: M.TOL.pTable }));
        const kk = tcl.route.length;
        const route = tcl.route.join(SEP);
        const c = P.A.c;
        return { text: [{ p: tr('series.ask.tclRoute', { route }) },
          { p: tr('ask.rMu', { route }), hole: hole({ num: muR, tol: M.TOL.mom * kk, key: 'r.mu' }) },
          { p: tr('ask.rVar'), hole: hole({ num: vR, tol: M.TOL.mom * kk, key: 'r.var' }) },
          { p: tr('ask.rZ', { T: tcl.deadline }), hole: hole({ nums: zp.z, key: 'r.z' }) },
          { p: tr('ask.rP', { T: tcl.deadline }), hole: hole({ nums: zp.p, key: 'r.p' }) },
          { p: tr('ask.both', { T: tcl.deadline }), hole: hole({ nums: uniq(pairs.flatMap(([x, r]) => [{ v: x.table.p4 * r.table.p4, tol: M.TOL.pTable }, { v: x.exact * r.exact, tol: M.TOL.pExact }]).concat(sigBoth)), key: 'both' }) }],
        sol: [{ p: tr('sol.tclRoute', { route, mu: n2(muR), var: n2(vR), sd: n2(rA.sd), T: tcl.deadline, z: n2(rA.table.z2), p: I.numText(lang, rA.table.p4, 4), pe: I.numText(lang, rA.exact, 4) }) },
          { p: tr('sol.tclBoth', { pc: I.numText(lang, c.table.p4, 4), pr: I.numText(lang, rA.table.p4, 4), both: I.numText(lang, c.table.p4 * rA.table.p4, 4) }) }] };
      },
    };
    function critSol() {
      const D = show((s) => s.cpm.duration);
      return [{ p: tr('sol.critical', { acts: main.sol.cpm.critical.join(', ') }) },
        { p: tr('sol.paths', { paths: main.sol.cpm.criticalPaths.map((p) => p.acts.join(SEP)).join('; '), dur: D }) }];
    }
    // La red de los sucesos: con la parte 8, la suya; sin ella, la tabla de arcos en la primera parte de sucesos.
    function evNet(stage) {
      if (stage !== firstEv) return [];
      if (stages.includes('succ')) return [{ p: tr('series.ask.evSucc') }];
      const arcs = [...net.arcs.map((a) => ({ label: a.act, from: a.from, to: a.to, dummy: false })), ...net.dummies.map((x) => ({ label: x.name, from: x.from, to: x.to, dummy: true }))]
        .sort((x, y) => x.from - y.from || x.to - y.to || I.natural(x.label, y.label));
      return [{ p: tr('series.ask.evNet') }, table([tr('col.arc'), tr('col.from'), tr('col.to')], arcs.map((a) => [a.dummy ? tr('dummy', { name: a.label }) : a.label, a.from, a.to]))];
    }
    // El TCL del camino crítico de las medias, de las dos maneras (A: μ y σ² redondeadas al final; B: sumas de las medias
    // redondeadas): z y P del plazo, z y plazo de la probabilidad (con 0,95, las z de las tablas impresas).
    let probMemo = null;
    function prob() {
      if (probMemo) return probMemo;
      const d = I.tclData(tcl);
      const one = (mu, v) => {
        const c = oneNormal(mu, v, { deadline: tcl.deadline }); const q = oneNormal(mu, v, { prob: tcl.prob });
        const zs = [{ v: q.table.z2, tol: M.TOL.z }, { v: I.roundTo(q.z, 3), tol: M.TOL.zExact }];
        const Ts = [{ v: q.table.deadline, tol: M.TOL.deadline }, { v: q.deadline, tol: M.TOL.deadline }];
        if (tcl.prob === 0.95) for (const z of I.Z95) { zs.push({ v: z, tol: M.TOL.zExact }); Ts.push({ v: mu + z * c.sd, tol: M.TOL.deadline }); }
        return { mu, v, c, q, zs, Ts };
      };
      const path = d.exact.path;
      const A = one(d.mu, d.v);
      const B = one(d.r2(path.reduce((s, id) => s + d.r2(d.mom[id].te), 0)), d.r2(path.reduce((s, id) => s + d.r2(d.mom[id].var), 0)));
      probMemo = { A, B, both: [A, B] };
      return probMemo;
    }

    const general = [{ strong: tr('sol.title') }, { p: tr('series.solNote') }];
    if (tcl && stages.some((s) => DET.includes(s))) general.push({ p: tr('series.solMeans') });
    if (stages.includes('tclProb') || stages.includes('tclRoute')) general.push({ p: tr('series.solTcl') });
    for (const st of stages) {
      code = CODE[st];
      const part = PART[st]();
      if (!part) return null;
      const title = tr('series.part', { name: tr(`stage.${st}`) });
      text.push({ h: title }, ...part.text);
      general.push({ strong: title }, ...part.sol);
    }
    const l = linksOf(stages, base, ctx, cx, sv);
    general.push({ links: l });

    const codes = stages.map((s) => CODE[s]).join('-');
    const level = M.LEVELS.includes(base.level) ? base.level : null;
    const levelName = level ? tr(`level.${level}`) : null;
    const pg = tcl ? PG().VERSION : null;
    const nameParts = [`${tr('series.name')} ${codes}`].concat(levelName ? [levelName.toLowerCase()] : [], [`n=${acts.length}`],
      base.seed != null ? [`s=${base.seed}`] : [], [`gv=${base.gv}`], pg ? [`pg=${pg}`] : [], sv ? [`sv=${sv}`] : []);
    const q = {
      stage: 'series', stages, level, seed: base.seed, gv: base.gv, n: acts.length,
      category: [tr('root'), tr('series.cat'), codes].concat(levelName ? [levelName] : []),
      name: nameParts.join(' · '),
      tags: ['pnl-series', `series-${codes}`, `level-${level || 'example'}`, `lang-${ctx.lang}`, `gv-${base.gv}`].concat(pg ? [`pg-${pg}`] : [], sv ? [`sv-${sv}`] : []),
      qtype: 'cloze',
      text,
      general,
      links: l,
      answers,
    };
    if (pg) q.pg = pg;
    if (sv) { q.sv = sv; q.cx = cx; }
    return q;
  }

  /** «Abrir este ejercicio en el laboratorio» y la solución: los del TCL, los de las etapas de cálculo, los del enunciado o los de la PERT. */
  function linksOf(stages, base, ctx, cx, sv) {
    const loc = { lang: ctx.lang, nota: ctx.nota };
    const seeded = base.seed != null && M.LEVELS.includes(base.level);
    if (hasTcl(stages)) return I.stochLinks(stages.includes('tclRoute') ? 'tclRoute' : 'tclProb', base.tcl, ctx);
    const calc = stages.filter((s) => DET.includes(s));
    if (calc.length) {
      const ask = [...new Set(calc.flatMap((s) => I.ASK[s]))].concat(calc.includes('floats') && ctx.sf ? ['sf'] : []);
      return {
        ex: seeded ? M.APP + U.encode(Object.assign({ v: 'ex', sd: base.seed, lv: base.level, ask, gv: base.gv }, loc)) : null,
        step: M.APP + U.encode(Object.assign({ v: 'route', ex: null, t: base.rows, mode: 'pred', graph: calc.every((s) => s.startsWith('ev')) ? 'aoa' : 'aon' }, loc)),
      };
    }
    if (stages.includes('stmt') && seeded) {
      const m0 = Object.assign({ v: 'm0', st: 'gen', sd: base.seed, lv: base.level, cx, sv }, loc);
      return { ex: M.APP + U.encode(m0), step: M.APP + U.encode(Object.assign({}, m0, { mm: 'route' })), exKey: 'link.stmt', stepKey: 'link.stmtRoute' };
    }
    return { ex: seeded ? M.APP + U.encode(Object.assign({ v: 'ex', sd: base.seed, lv: base.level, xk: 'pert', xm: 'practice' }, loc)) : null,
      step: M.APP + U.encode(Object.assign({ v: 'route', ex: null, t: base.rows, mode: 'pred', graph: 'aoa' }, loc)) };
  }

  // ---------- Ejecutor por pasos (como el de core/moodle) ----------

  /**
   * opts: { lang, nota, sf, labels, stages[], level, count, seed (semilla del banco, entero de 32 bits), triesPer?,
   * seedMax? (solo pruebas) }. Las semillas salen de mulberry32(seed + índice del nivel), sin repetir; cada intento prueba
   * una. step(n) hace como mucho n intentos y el resultado no depende del reparto de los pasos.
   */
  function runner(opts, tr) {
    const stages = order(opts.stages);
    const level = opts.level;
    if (!M.LEVELS.includes(level)) throw new RangeError(`series: nivel ${level}`);
    const ctx = { lang: opts.lang, nota: opts.nota, sf: !!opts.sf, labels: opts.labels };
    const asked = Number(opts.count);
    const count = Number.isFinite(asked) && opts.count !== null ? Math.max(1, Math.min(M.MAX_COUNT, Math.round(asked))) : M.DEFAULT_COUNT;
    const limit = (opts.triesPer || M.TRIES_PER) * count * multOf(stages);
    const seedMax = opts.seedMax || I.SEED_MAX;
    const rng = R.mulberry32((opts.seed + M.LEVELS.indexOf(level)) >>> 0);
    const used = new Set();
    const questions = [];
    let tries = 0;
    const done = () => questions.length >= count || tries >= limit;
    function step(n) {
      for (let i = 0; i < n && !done(); i++) {
        tries++;
        const sd = R.int(rng, 1, seedMax);
        if (used.has(sd)) continue;
        used.add(sd);
        const b = exercise(stages, level, sd);
        const q = b && question(stages, b, ctx, tr);
        if (q) questions.push(q);
      }
      return { done: done(), made: questions.length, total: count };
    }
    const result = () => ({ seed: opts.seed, lang: opts.lang, nota: opts.nota, questions: questions.slice(),
      missing: done() && questions.length < count ? [{ stage: 'series', stages, level, made: questions.length, wanted: count }] : [] });
    return { step, result };
  }

  function generate(opts, tr) {
    const r = runner(opts, tr);
    while (!r.step(1000).done);
    return r.result();
  }

  const api = { ADMITTED, CODE, TCL, SERIES_MULT, TOL_T, order, multOf, exercise, fromRows, fromTcl, question, runner, generate };
  root.PNL = root.PNL || {};
  root.PNL.series = api;
  if (isNode) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
