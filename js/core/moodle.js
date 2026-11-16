/*
 * core/moodle — el banco de preguntas de Moodle XML por etapas (spec f3b-moodle; plan §3, P1–P6).
 * Cada pregunta es un modelo (bloques de texto, tablas con datos y huecos, opciones) construido con la solución
 * de grade.solve, sin recalcular el método (constitución, 4 y 15); de él salen el XML (toXml) y la vista previa
 * (views/question-view). Etapas: early (ES, EF y duración), late (LS y LF), floats (TF, FF, IF y, con sf, SF),
 * critAct (¿crítica?), critPath (caminos), evEarly (TE) y evLate (TL y holgura de suceso). Cada una da como datos
 * la solución de la anterior; critAct y critPath dan los de late (los cuatro tiempos, sin holguras).
 * F3c (spec f3c-enunciados, plan P6): stmt («0 · Enunciado → tabla») da un enunciado de core/stmtgen y pide las
 * predecesoras inmediatas con una fila de casillas por actividad (MULTIRESPONSE_H): inmediata +100/c, redundante 0,
 * falsa −100/c. Va al final de STAGES_ALL para no mover las semillas de las siete etapas de la F3b.
 * F3d (spec f3d-construir-detectar, AC14 y AC21; plan §0, P4, P8, P9, H5 y H9), al final de STAGES_ALL para no mover las
 * semillas de las anteriores: minDummy (cuántas ficticias tiene la red PERT mínima; numérica, y el único enunciado con
 * enlace, a «Construir la PERT» en Examen), succ (la red de las reglas de M2 suceso a suceso: se marca lo que sale de
 * cada uno, ±100/c), immPred (la tabla con 1, 2 o 3 precedencias redundantes según el nivel: inmediata +100/c,
 * redundante −100/c; si la tabla no tiene bastantes, la de la semilla siguiente) y detective (un error sembrado por
 * core/detective en la ROY o la PERT según la semilla; cuatro opciones de una sola respuesta: la buena y tres
 * afirmaciones falsas sobre la red que se enseña; la red como imagen, si llega ctx.svg, y como tabla).
 * Los textos llegan con tr(key, params) (catálogo i18n-moodle) y los encabezados con ctx.labels (la notación).
 * Sin DOM ni azar.
 */
(function (root) {
  'use strict';

  const isNode = typeof module !== 'undefined' && module.exports;
  const PR = isNode ? require('./project.js') : root.PNL.project;
  const C = isNode ? require('./cpm.js') : root.PNL.cpm;
  const G = isNode ? require('./generator.js') : root.PNL.generator;
  const GR = isNode ? require('./grade.js') : root.PNL.grade;
  const U = isNode ? require('./urlstate.js') : root.PNL.urlstate;
  const R = isNode ? require('./rng.js') : root.PNL.rng;
  const A = isNode ? require('./aoa.js') : root.PNL.aoa;
  const MD = isNode ? require('./mindummy.js') : root.PNL.mindummy;
  // core/detective (y con él aoacheck y roycheck) llega con el grupo mq (plan, H1); en Node, al pedirlo.
  const DT = () => (isNode ? require('./detective.js') : root.PNL.detective);

  const STAGES = ['early', 'late', 'floats', 'critAct', 'critPath', 'evEarly', 'evLate'];
  const STAGES_ALL = [...STAGES, 'stmt', 'minDummy', 'succ', 'immPred', 'detective'];
  // Secuencias propias de las etapas nuevas, derivadas de la semilla del ejercicio (no tocan la del generador).
  const SALT = { graph: 71, distract: 73, immPred: 79 };
  const IMM = { easy: 1, medium: 2, hard: 3 };
  // core/stmtgen se carga con el grupo sg (plan P5); en Node, al pedirlo.
  const SG = () => (isNode ? require('./stmtgen.js') : root.PNL.stmtgen);
  const LEVELS = ['easy', 'medium', 'hard'];
  const APP = 'https://josemagalan.github.io/project-network-lab/cpm.html';
  const PATH_LIMIT = 100000;
  const MAX_DISTRACTORS = 4;
  const MIN_DISTRACTORS = 2;
  // Fracciones de la lista de Moodle (100/k con k = 1…4); otra cualquiera no se importa.
  const FRACTIONS = { 1: '100', 2: '50', 3: '33.33333', 4: '25' };
  // Casillas de la etapa stmt: 100/c con c = 1…8 (más predecesoras inmediatas que 8 descartan el ejemplar).
  const MR_FRACTIONS = { 1: '100', 2: '50', 3: '33.33333', 4: '25', 5: '20', 6: '16.66667', 7: '14.28571', 8: '12.5' };
  const ASK = { early: ['times'], late: ['times'], floats: ['floats'], critAct: ['critical'], critPath: ['critical'], evEarly: ['events'], evLate: ['events'] };
  const PATH_SEP = ' – ';
  const MAX_COUNT = 50;
  const DEFAULT_COUNT = 10;
  const TRIES_PER = 20;       // intentos por ejemplar pedido en cada categoría (plan P3)
  const SEED_MAX = 999999;    // las semillas que admite sd

  function fraction(k) {
    if (!FRACTIONS[k]) throw new RangeError(`fraction: k = ${k} fuera de 1–4`);
    return FRACTIONS[k];
  }

  function build(rows, mode, level, seed) {
    const project = PR.parse(rows, mode).project;
    const paths = C.solve(project, { pathLimit: PATH_LIMIT }).paths.list;
    return { level, seed, gv: G.VERSION, rows: PR.toRows(project, 'pred'), sol: GR.solve(project), paths };
  }

  /** El ejercicio de una semilla y un nivel de la F3a: la tabla del generador, su solución y todos sus caminos. */
  function exercise(level, seed) {
    const g = G.generate(seed, G.LEVELS[level]);
    if (!g.ok) throw new Error(`generator: ${g.reason}`);
    const ex = build(g.rows, g.mode, level, seed);
    ex.rows = g.rows;
    ex.info = g.info;
    return ex;
  }

  /** Un ejercicio a partir de una tabla (los ejemplos de referencia), sin semilla ni nivel. */
  function fromRows(rows, mode) {
    return build(rows, mode || 'pred', null, null);
  }

  /** «Abrir este ejercicio en el laboratorio» (con gv siempre) y «Ver la solución paso a paso» (con la tabla). */
  function links(ex, stage, ctx) {
    const ask = ASK[stage].concat(stage === 'floats' && ctx.sf ? ['sf'] : []);
    const base = { lang: ctx.lang, nota: ctx.nota };
    const exLink = ex.seed == null ? null
      : APP + U.encode(Object.assign({ v: 'ex', sd: ex.seed, lv: ex.level, ask, gv: ex.gv }, base));
    const step = APP + U.encode(Object.assign({ v: 'route', ex: null, t: ex.rows, mode: 'pred', graph: stage.startsWith('ev') ? 'aoa' : 'aon' }, base));
    return { ex: exLink, step };
  }

  // ---------- Bloques ----------

  const num = (v, key) => ({ num: v, key });
  const yesNo = (v, key) => ({ yesNo: v, key });

  function question(stage, ex0, ctx, tr) {
    let ex = ex0;
    if (stage === 'immPred') { ex = immPredExercise(ex0); if (!ex) return null; }
    const { cpm, events, net } = ex.sol;
    const T = cpm.times; const F = cpm.floats; const D = cpm.duration;
    const L = ctx.labels;
    const acts = ex.sol.project.activities.map((a) => a.id);
    const preds = ex.sol.project.preds;
    const dur = Object.fromEntries(ex.sol.project.activities.map((a) => [a.id, a.d]));
    const precHead = [tr('col.act'), tr('col.dur'), tr('col.preds')];
    const prec = (id) => [id, dur[id], preds[id].length ? preds[id].join(', ') : tr('none')];
    const times = (id) => [T[id].ES, T[id].EF, T[id].LS, T[id].LF];
    const timeHead = [L.ES, L.EF, L.LS, L.LF];
    const answers = {};
    const hole = (c) => { answers[c.key] = 'num' in c ? c.num : 'mr' in c ? c.answer : (c.yesNo ? 'yes' : 'no'); return c; };
    const table = (head, rows, extra) => ({ table: Object.assign({ head, rows }, extra || {}) });
    let text; let sol; let options = null;
    let l = null; let sv = null; let extraQ = null;

    if (stage === 'stmt') {
      const G3 = SG();
      const level = ex.level || 'medium';
      const seed = ex.seed == null ? 1 : ex.seed;
      const cx = G3.contextOf(seed, level);
      const made = G3.compose(ex.rows, level, cx, seed);
      if (!made.ok || acts.some((id) => preds[id].length > 8)) return null;
      const lang = ctx.lang === 'en' ? 'en' : 'es';
      const name = Object.fromEntries(made.def.ref.rows.map((r) => [r.id, r.name[lang]]));
      const anc = {};
      for (const id of acts) { anc[id] = new Set(); const go = (x) => preds[x].forEach((p) => { if (!anc[id].has(p)) { anc[id].add(p); go(p); } }); go(id); }
      const none = tr('noneOpt');
      const mr = (id) => {
        const P = preds[id];
        const fr = MR_FRACTIONS[P.length];
        const opts = acts.filter((x) => x !== id).map((x) => ({ label: x, fraction: P.includes(x) ? fr : anc[id].has(x) ? '0' : P.length ? `-${fr}` : '-100' }));
        // «ninguna» en una fila con predecesoras es una casilla falsa más: −100/c (plan §3; revisión de la F3c, F1).
        opts.push({ label: none, fraction: P.length ? `-${fr}` : '100' });
        return { mr: opts, key: `${id}.preds`, answer: [...P].sort() };
      };
      text = [{ p: tr('stem.stmt') }, { quote: G3.render(made.def, lang).split('\n').filter(Boolean) },
        table([tr('col.act'), tr('col.name'), tr('col.immPreds')], acts.map((id) => [id, name[id], hole(mr(id))]))];
      sol = [table([tr('col.act'), tr('col.name'), tr('col.preds')], acts.map((id) => [id, name[id], preds[id].length ? preds[id].join(', ') : tr('none')]))];
      sv = G3.VERSION;
      if (ex.seed != null) {
        const m0 = { v: 'm0', st: 'gen', sd: ex.seed, lv: level, cx, sv, lang: ctx.lang, nota: ctx.nota };
        l = { ex: APP + U.encode(m0), step: APP + U.encode(Object.assign({}, m0, { mm: 'route' })), exKey: 'link.stmt', stepKey: 'link.stmtRoute' };
      } else l = links(ex, 'early', ctx);
    } else if (stage === 'minDummy') {
      const min = ex.info && Number.isInteger(ex.info.dummies) ? ex.info.dummies : MD.solve(ex.sol.project);
      const value = typeof min === 'number' ? min : min.exact ? min.value : null;
      if (value === null) return null;
      const base = { v: 'ex', sd: ex.seed, lv: ex.level, xk: 'pert', lang: ctx.lang, nota: ctx.nota };
      const exam = ex.seed == null ? null : APP + U.encode(Object.assign({ xm: 'exam' }, base));
      text = [{ p: tr('stem.minDummy') }, table(precHead, acts.map(prec)), { p: tr('dummiesLabel'), hole: hole(num(value, 'dummies')) }]
        .concat(exam ? [{ link: { href: exam, key: 'link.buildExam' } }] : []);
      sol = [{ p: value === 0 ? tr('sol.minDummyNone') : value === 1 ? tr('sol.minDummyOne') : tr('sol.minDummy', { n: value }) }];
      l = { ex: ex.seed == null ? null : APP + U.encode(Object.assign({ xm: 'practice' }, base)),
        step: APP + U.encode({ v: 'route', ex: null, t: ex.rows, mode: 'pred', graph: 'aoa', view: 'cmp', lang: ctx.lang, nota: ctx.nota }), stepKey: 'link.min' };
    } else if (stage === 'succ') {
      const labelsOf = (xs) => xs.map((e) => e.act || e.name);
      const edges = [...net.arcs, ...net.dummies];
      const opts = [...acts, ...net.dummies.map((d) => d.name)];
      const rows = []; const solRows = [];
      for (const e of net.events) {
        const out = labelsOf(edges.filter((x) => x.from === e.n)).sort(byOpt(opts));
        if (!out.length) continue;
        const fr = MR_FRACTIONS[out.length];
        if (!fr) return null;
        const into = labelsOf(edges.filter((x) => x.to === e.n)).sort(byOpt(opts));
        rows.push([e.n, into.length ? into.join(', ') : tr('none'), hole({ mr: opts.map((x) => ({ label: x, fraction: out.includes(x) ? fr : `-${fr}` })), key: `e${e.n}.succ`, answer: out })]);
        solRows.push([e.n, out.join(', ')]);
      }
      text = [{ p: tr('stem.succ') }, table(precHead, acts.map(prec)), table([tr('col.event'), tr('col.arrives'), tr('col.leaves')], rows)];
      sol = [table([tr('col.event'), tr('col.leaves')], solRows)];
      l = { ex: ex.seed == null ? null : APP + U.encode({ v: 'ex', sd: ex.seed, lv: ex.level, xk: 'pert', xm: 'practice', lang: ctx.lang, nota: ctx.nota }),
        step: APP + U.encode({ v: 'route', ex: null, t: ex.rows, mode: 'pred', graph: 'aoa', lang: ctx.lang, nota: ctx.nota }) };
    } else if (stage === 'immPred') {
      const added = ex.added;
      const red = A._reduce(ex.sol.project);
      const listed = (id) => preds[id].concat(added.filter((x) => x.to === id).map((x) => x.from)).sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
      const mr = (id) => {
        const imm = preds[id].filter((x) => red.direct[x].includes(id));
        const fr = MR_FRACTIONS[imm.length];
        const all = listed(id);
        return { mr: all.length ? all.map((x) => ({ label: x, fraction: imm.includes(x) ? fr : `-${fr}` })) : [{ label: tr('noneOpt'), fraction: '100' }],
          key: `${id}.imm`, answer: imm.slice().sort() };
      };
      if (acts.some((id) => preds[id].filter((x) => red.direct[x].includes(id)).length > 8)) return null;
      text = [{ p: tr('stem.immPred') },
        table([tr('col.act'), tr('col.dur'), tr('col.preds'), tr('col.immPreds')], acts.map((id) => [id, dur[id], listed(id).length ? listed(id).join(', ') : tr('none'), hole(mr(id))]))];
      sol = [{ p: tr('sol.added', { list: added.map((x) => `${x.from} → ${x.to}`).join(', ') }) },
        table([tr('col.act'), tr('col.immPreds')], acts.map((id) => [id, preds[id].length ? preds[id].join(', ') : tr('none')]))];
      const withAdded = ex.rows.map((r) => { const extra = added.filter((x) => x.to === r.id).map((x) => x.from); return extra.length ? Object.assign({}, r, { links: [r.links, ...extra].filter(Boolean).join(', ') }) : Object.assign({}, r); });
      l = { ex: APP + U.encode({ v: 'work', ex: null, t: withAdded, mode: 'pred', lang: ctx.lang, nota: ctx.nota }), exKey: 'link.work',
        step: APP + U.encode({ v: 'route', ex: null, t: ex.rows, mode: 'pred', graph: 'aon', lang: ctx.lang, nota: ctx.nota }) };
    } else if (stage === 'detective') {
      const made = detective(ex, ctx, tr, { acts, preds, dur, L, prec, precHead, table });
      if (!made) return null;
      ({ text, sol, l, options } = made);
      extraQ = made.extra;
    } else if (stage === 'early') {
      text = [{ p: tr('stem.early') }, table(precHead, acts.map(prec)),
        table([tr('col.act'), L.ES, L.EF], acts.map((id) => [id, hole(num(T[id].ES, `${id}.ES`)), hole(num(T[id].EF, `${id}.EF`))])),
        { p: tr('projectDur'), hole: hole(num(D, 'dur')) }];
      sol = [table([tr('col.act'), L.ES, L.EF], acts.map((id) => [id, T[id].ES, T[id].EF])), { p: `${tr('projectDur')} ${D}` }];
    } else if (stage === 'late') {
      text = [{ p: tr('stem.late', { dur: D }) },
        table([...precHead, L.ES, L.EF, L.LS, L.LF], acts.map((id) => [...prec(id), T[id].ES, T[id].EF, hole(num(T[id].LS, `${id}.LS`)), hole(num(T[id].LF, `${id}.LF`))]))];
      sol = [table([tr('col.act'), L.LS, L.LF], acts.map((id) => [id, T[id].LS, T[id].LF]))];
    } else if (stage === 'floats') {
      const fs = ['TF', 'FF', 'IF'].concat(ctx.sf ? ['SF'] : []);
      text = [{ p: tr(ctx.sf ? 'stem.floatsSf' : 'stem.floats') },
        table([...precHead, ...timeHead, ...fs.map((f) => L[f])], acts.map((id) => [...prec(id), ...times(id), ...fs.map((f) => hole(num(F[id][f], `${id}.${f}`)))]))];
      sol = [table([tr('col.act'), ...fs.map((f) => L[f])], acts.map((id) => [id, ...fs.map((f) => F[id][f])]))];
    } else if (stage === 'critAct' || stage === 'critPath') {
      const yn = stage === 'critAct';
      const crit = new Set(cpm.critical);
      text = [{ p: tr(yn ? 'stem.critAct' : 'stem.critPath', { dur: D }) },
        table([...precHead, ...timeHead, ...(yn ? [tr('col.crit')] : [])],
          acts.map((id) => [...prec(id), ...times(id), ...(yn ? [hole(yesNo(crit.has(id), `${id}.crit`))] : [])]))];
      const critical = cpm.criticalPaths.map((p) => p.acts.join(PATH_SEP));
      sol = [{ p: tr('sol.critical', { acts: cpm.critical.join(', ') }) }, { p: tr('sol.paths', { paths: critical.join('; '), dur: D }) }];
      if (!yn) {
        if (!ex.paths) return null;
        const non = ex.paths.filter((p) => !p.critical).slice(0, MAX_DISTRACTORS);
        if (non.length < MIN_DISTRACTORS) return null;
        options = [
          ...critical.map((path) => ({ path, fraction: fraction(critical.length), feedback: tr('fb.pathCrit') })),
          ...non.map((p) => ({ path: p.acts.join(PATH_SEP), fraction: `-${fraction(non.length)}`, feedback: tr('fb.pathNot', { len: p.length }) })),
        ];
      }
    } else {
      const evs = net.events.map((e) => e.n);
      const arcs = [
        ...net.arcs.map((a) => ({ label: a.act, from: a.from, to: a.to, d: dur[a.act], dummy: false })),
        ...net.dummies.map((d) => ({ label: d.name, from: d.from, to: d.to, d: 0, dummy: true })),
      ].sort((x, y) => x.from - y.from || x.to - y.to || (x.label < y.label ? -1 : x.label > y.label ? 1 : 0));
      const arcTable = table([tr('col.arc'), tr('col.from'), tr('col.to'), tr('col.dur')],
        arcs.map((a) => [a.dummy ? tr('dummy', { name: a.label }) : a.label, a.from, a.to, a.d]), { arcs });
      if (stage === 'evEarly') {
        text = [{ p: tr('stem.evEarly') }, arcTable, table([tr('col.event'), L.TE], evs.map((n) => [n, hole(num(events.TE[n], `e${n}.TE`))]))];
        sol = [table([tr('col.event'), L.TE], evs.map((n) => [n, events.TE[n]]))];
      } else {
        text = [{ p: tr('stem.evLate') }, arcTable,
          table([tr('col.event'), L.TE, L.TL, tr('col.slack')], evs.map((n) => [n, events.TE[n], hole(num(events.TL[n], `e${n}.TL`)), hole(num(events.slack[n], `e${n}.slack`))]))];
        sol = [table([tr('col.event'), L.TL, tr('col.slack')], evs.map((n) => [n, events.TL[n], events.slack[n]]))];
      }
    }

    l = l || links(ex, stage, ctx);
    const stageName = tr(`stage.${stage}`);
    const levelName = ex.level ? tr(`level.${ex.level}`) : null;
    const nameParts = [stageName];
    if (levelName) nameParts.push(levelName.toLowerCase());
    nameParts.push(`n=${acts.length}`);
    if (ex.seed != null) nameParts.push(`s=${ex.seed}`);
    nameParts.push(`gv=${ex.gv}`);
    if (sv) nameParts.push(`sv=${sv}`);
    const q = {
      stage, level: ex.level, seed: ex.seed, gv: ex.gv, n: acts.length,
      category: [tr('root'), stageName].concat(levelName ? [levelName] : []),
      name: nameParts.join(' · '),
      tags: [`pnl-${stage}`, `level-${ex.level || 'example'}`, `lang-${ctx.lang}`, `gv-${ex.gv}`].concat(sv ? [`sv-${sv}`] : []),
      qtype: options ? 'multichoice' : 'cloze',
      text,
      general: [{ strong: tr('sol.title') }, ...sol, { links: l }],
      links: l,
      answers,
    };
    if (options) q.options = options;
    if (extraQ) Object.assign(q, extraQ);
    return q;
  }

  const byOpt = (order) => (a, b) => order.indexOf(a) - order.indexOf(b);

  // ---------- immPred: precedencias redundantes añadidas (spec, Behaviour; plan §0) ----------

  // Las precedencias transitivas que se pueden añadir (a antes que b sin ser inmediata ni estar ya en la tabla).
  function transitive(project) {
    const ids = project.activities.map((a) => a.id);
    const { reach } = A._reduce(project);
    const out = [];
    for (const b of ids) for (const a of ids) if (a !== b && reach[a].has(b) && !project.preds[b].includes(a)) out.push({ from: a, to: b });
    return out;
  }
  function immPredExercise(ex) {
    const k = IMM[ex.level] || 2;
    const pick = (e) => {
      const all = transitive(e.sol.project);
      if (all.length < k) return null;
      const rng = R.mulberry32((((e.seed == null ? 1 : e.seed) * 7) + SALT.immPred) >>> 0);
      const added = R.shuffle(rng, all).slice(0, k).sort((x, y) => x.to.localeCompare(y.to, 'en', { numeric: true }) || x.from.localeCompare(y.from, 'en', { numeric: true }));
      return Object.assign({}, e, { added });
    };
    const first = pick(ex);
    if (first || ex.seed == null || !ex.level) return first;
    // Sin bastantes, la tabla de la semilla siguiente del mismo nivel (spec, Clarifications).
    for (let s = ex.seed + 1; s < ex.seed + 50 && s <= SEED_MAX; s++) { const e = pick(exercise(ex.level, s)); if (e) return e; }
    return null;
  }

  // ---------- detective: afirmaciones sobre la red que se enseña (plan §0, H5 y H9) ----------

  // Una afirmación: { type, a, b } (arcos, sucesos o actividades) o { type, a, field } (una casilla). claimHolds dice si
  // es verdad en la red que se enseña (shown: { roy | pert, values }), con la tabla verdadera como referencia.
  function truth(project) {
    const red = A._reduce(project);
    const cpm = C.solve(project);
    const base = A.build(project, { method: 'rules' });
    return { red, cpm, base, ev: A.times(base, cpm), crit: new Set(cpm.critical) };
  }
  const pathIn = (edges, a, b) => {
    const seen = new Set(); const st = edges.filter((e) => e.from === a).map((e) => e.to);
    while (st.length) { const x = st.pop(); if (x === b) return true; if (!seen.has(x)) { seen.add(x); edges.filter((e) => e.from === x).forEach((e) => st.push(e.to)); } }
    return false;
  };
  function claimHolds(c, shown, project, tt) {
    const t = tt || truth(project);
    const { reach, direct } = t.red;
    if (c.type.startsWith('roy')) {
      const arcs = shown.roy.arcs.filter((e) => e.from !== '_S' && e.to !== '_E');
      const has = arcs.some((e) => e.from === c.a && e.to === c.b);
      if (c.type === 'royMissing') return direct[c.a].includes(c.b) && !pathIn(arcs, c.a, c.b);
      if (c.type === 'royFalse') return has && !reach[c.a].has(c.b) && !reach[c.b].has(c.a);
      if (c.type === 'royInverted') return has && direct[c.b].includes(c.a);
      return has && reach[c.b].has(c.a) && !direct[c.b].includes(c.a);
    }
    if (c.type.startsWith('pert')) {
      const P = shown.pert;
      const dm = (net, u, v) => net.dummies.some((d) => d.from === u && d.to === v);
      if (c.type === 'pertFalseDummy') return dm(P, c.a, c.b) && !dm(t.base, c.a, c.b) && !pathIn([...t.base.arcs, ...t.base.dummies], c.a, c.b);
      if (c.type === 'pertMissingDummy') return dm(t.base, c.a, c.b) && !pathIn([...P.arcs, ...P.dummies], c.a, c.b);
      if (c.type === 'pertInvertedDummy') return dm(P, c.a, c.b) && dm(t.base, c.b, c.a);
      const x = P.arcs.find((e) => e.act === c.a); const y = P.arcs.find((e) => e.act === c.b);
      return !!x && !!y && x.from === y.from && x.to === y.to;
    }
    const v = shown.values;
    if (!v) return false;
    if (v.acts) {
      if (c.field === 'crit') return v.acts[c.a].crit !== t.crit.has(c.a);
      const right = c.field === 'TF' ? t.cpm.floats[c.a].TF : t.cpm.times[c.a][c.field];
      return Math.abs(v.acts[c.a][c.field] - right) > 1e-9;
    }
    if (c.field === 'crit') return v.crit[c.a] !== t.crit.has(c.a);
    return Math.abs(v.events[c.a][c.field] - t.ev[c.field][c.a]) > 1e-9;
  }

  // La afirmación que describe un error sembrado.
  function claimOf(e) {
    const d = e.data || {};
    if (e.type === 'pertInvertedDummy') return { type: e.type, a: d.to, b: d.from };
    if (e.type === 'pertParallel') return { type: e.type, a: [d.act, d.twin].sort()[0], b: [d.act, d.twin].sort()[1] };
    if (e.type.startsWith('roy') || e.type.startsWith('pert')) return { type: e.type, a: d.from, b: d.to };
    const [who, field] = e.element.split('.');
    return { type: e.type, a: who.startsWith('e') && /^e\d+$/.test(who) ? Number(who.slice(1)) : who, field };
  }
  const FIELD = { calcES: 'ES', calcLF: 'LF', calcFloat: 'TF', calcCrit: 'crit', calcTE: 'TE', calcTL: 'TL', calcSlack: 'slack' };
  function claimText(c, tr, L) {
    const f = c.field && c.field !== 'crit' && c.field !== 'slack' ? L[c.field] : undefined;
    return tr(`opt.${c.type}`, Object.assign({ a: c.a, b: c.b }, f ? { f } : {}));
  }
  const pairOf = (c) => (c.b === undefined ? null : [String(c.a), String(c.b)].sort().join('|'));

  // Afirmaciones falsas sobre la red que se enseña (distractores), sin tocar el par del error.
  function falseClaims(ex, graph, err, shown, t) {
    const p = ex.sol.project;
    const ids = p.activities.map((a) => a.id);
    const { reach, direct } = t.red;
    const out = [];
    const errPair = pairOf(claimOf(err));
    if (graph === 'aon') {
      const arcs = shown.roy.arcs.filter((e) => e.from !== '_S' && e.to !== '_E');
      for (const e of arcs) if (direct[e.from].includes(e.to)) for (const type of ['royFalse', 'royInverted', 'royCycle']) out.push({ type, a: e.from, b: e.to });
      for (const a of ids) for (const b of ids) if (reach[a].has(b) && !direct[a].includes(b) && !arcs.some((e) => e.from === a && e.to === b)) out.push({ type: 'royMissing', a, b });
    } else {
      const P = shown.pert;
      const edges = [...P.arcs, ...P.dummies];
      for (const d of P.dummies) if (t.base.dummies.some((x) => x.from === d.from && x.to === d.to)) out.push({ type: 'pertInvertedDummy', a: d.from, b: d.to });
      const evs = P.events.map((e) => e.n);
      for (const u of evs) for (const v of evs) if (u < v && pathIn(edges, u, v) && !edges.some((e) => e.from === u && e.to === v)) out.push({ type: 'pertMissingDummy', a: u, b: v });
      for (const x of P.arcs) for (const y of P.arcs) if (x.act < y.act && x.from === y.from && x.to !== y.to) out.push({ type: 'pertParallel', a: x.act, b: y.act });
    }
    if (err.type.startsWith('calc') && shown.values) {
      const v = shown.values;
      if (v.acts) for (const a of ids) for (const type of ['calcES', 'calcLF', 'calcFloat', 'calcCrit']) out.push({ type, a, field: FIELD[type] });
      else {
        for (const n of Object.keys(v.events).map(Number)) for (const type of ['calcTE', 'calcTL', 'calcSlack']) out.push({ type, a: n, field: FIELD[type] });
        for (const a of ids) out.push({ type: 'calcCrit', a, field: 'crit' });
      }
    }
    const errCell = err.type.startsWith('calc') ? err.element : null;
    return out.filter((c) => (pairOf(c) === null || pairOf(c) !== errPair) && !(errCell && c.field && `${typeof c.a === 'number' ? `e${c.a}` : c.a}.${c.field}` === errCell)
      && !claimHolds(c, shown, p, t));
  }

  function detective(ex, ctx, tr, k) {
    const D = DT();
    const sd = ex.seed == null ? 1 : ex.seed;
    const graph = ex.seed == null ? 'aon' : (R.int(R.mulberry32(((sd * 7) + SALT.graph) >>> 0), 0, 1) ? 'aoa' : 'aon');
    const seeded = D.seed(ex.sol.project, { sd, graph, kind: 'all', count: 1 });
    if (!seeded) return null;
    const err = seeded.errors[0];
    const calc = err.type.startsWith('calc');
    const shown = { values: calc ? seeded.shown.values : null };
    if (graph === 'aon') shown.roy = seeded.shown.roy; else shown.pert = seeded.shown.pert;
    const t = truth(ex.sol.project);
    // Tres afirmaciones falsas, de tipos distintos mientras se pueda, con la secuencia propia de la semilla.
    const pool = falseClaims(ex, graph, err, shown, t);
    const right = claimOf(err);
    const rightText = claimText(right, tr, k.L);
    const byType = new Map();
    for (const c of pool) { if (claimText(c, tr, k.L) === rightText) continue; if (!byType.has(c.type)) byType.set(c.type, []); byType.get(c.type).push(c); }
    const rng = R.mulberry32(((sd * 7) + SALT.distract) >>> 0);
    const types = R.shuffle(rng, [...byType.keys()].sort());
    const picked = [];
    for (let i = 0; picked.length < 3 && types.some((x) => byType.get(x).length); i++) {
      const list = byType.get(types[i % types.length]);
      if (!list.length) continue;
      picked.push(list.splice(R.int(rng, 0, list.length - 1), 1)[0]);
    }
    if (picked.length < 3) return null;
    const options = [{ claim: right, text: rightText, fraction: '100', feedback: tr('fb.detOk') },
      ...picked.map((c) => ({ claim: c, text: claimText(c, tr, k.L), fraction: '0', feedback: tr('fb.detNo') }))];
    const name = (id) => (id === '_S' ? tr('start') : id === '_E' ? tr('end') : id);
    let netTable; let alt;
    if (graph === 'aon') {
      const R0 = shown.roy;
      netTable = k.table([tr('col.node'), tr('col.netPreds')], k.acts.concat(['_E']).map((id) => {
        const ps = R0.arcs.filter((e) => e.to === id).map((e) => e.from).sort((a, b) => (a === '_S' ? -1 : b === '_S' ? 1 : a.localeCompare(b, 'en', { numeric: true })));
        return [name(id), ps.length ? ps.map(name).join(', ') : tr('none')];
      }));
      alt = tr('alt.aon', { n: R0.nodes.length, m: R0.arcs.length });
    } else {
      const P = shown.pert;
      const rows = [...P.arcs.map((a) => ({ label: a.act, from: a.from, to: a.to, dummy: false })), ...P.dummies.map((d) => ({ label: d.name, from: d.from, to: d.to, dummy: true }))]
        .sort((x, y) => x.from - y.from || x.to - y.to || (x.label < y.label ? -1 : x.label > y.label ? 1 : 0));
      netTable = k.table([tr('col.arc'), tr('col.from'), tr('col.to')], rows.map((a) => [a.dummy ? tr('dummy', { name: a.label }) : a.label, a.from, a.to]));
      alt = tr('alt.aoa', { n: P.events.length, m: P.arcs.length, k: P.dummies.length });
    }
    const text = [{ p: tr(graph === 'aon' ? 'stem.detAon' : 'stem.detAoa') }, k.table(k.precHead, k.acts.map(k.prec))];
    const extra = { single: true, graph, error: err, shown };
    if (ctx.svg) {
      const file = `pnl-detective-s${ex.seed == null ? 'ej' : ex.seed}.svg`;
      const model = graph === 'aon'
        ? { graph, project: ex.sol.project, solution: ex.sol.cpm, roy: shown.roy, names: { start: tr('start'), end: tr('end') }, title: tr('stage.detective'), desc: alt }
        : { graph, base: t.base, pert: shown.pert, title: tr('stage.detective'), desc: alt };
      extra.files = [{ name: file, svg: ctx.svg(model) }];
      text.push({ img: { src: file, alt } });
    }
    text.push({ p: tr('netTitle') }, netTable);
    if (calc) {
      const v = shown.values; const L = k.L;
      if (graph === 'aon') {
        text.push({ p: tr('valuesTitle') }, k.table([tr('col.act'), L.ES, L.EF, L.LS, L.LF, L.TF, tr('col.crit')],
          k.acts.map((id) => [id, v.acts[id].ES, v.acts[id].EF, v.acts[id].LS, v.acts[id].LF, v.acts[id].TF, v.acts[id].crit ? tr('yes') : tr('no')])));
      } else {
        text.push({ p: tr('valuesTitle') }, k.table([tr('col.event'), L.TE, L.TL, tr('col.slack')], shown.pert.events.map((e) => [e.n, v.events[e.n].TE, v.events[e.n].TL, v.events[e.n].slack])),
          { p: tr('critMarked', { acts: k.acts.filter((id) => v.crit[id]).join(', ') || tr('none') }) });
      }
    }
    const sol = [{ p: tr('sol.det', { text: rightText }) }];
    const l = { ex: null, step: APP + U.encode({ v: 'route', ex: null, t: ex.rows, mode: 'pred', graph, lang: ctx.lang, nota: ctx.nota }), stepKey: 'link.net' };
    return { text, sol, l, options, extra };
  }

  // ---------- Ejecutor por pasos (plan P2 y P3) ----------

  /**
   * opts: { lang, nota, sf, labels, stages[], levels[], count, seed (semilla del banco, entero de 32 bits),
   *         triesPer?, seedMax? (solo pruebas) }.
   * Recorre las categorías en orden fijo (nivel y después etapa, en el orden de LEVELS y STAGES). Cada nivel tiene
   * su secuencia de semillas, mulberry32(seed + índice del nivel en LEVELS), así que no depende de qué otros niveles
   * se marcan; una semilla ya usada en el nivel se salta. step(n) hace como mucho n intentos: el resultado no
   * depende del reparto de los pasos.
   */
  function runner(opts, tr) {
    const ctx = { lang: opts.lang, nota: opts.nota, sf: !!opts.sf, labels: opts.labels, svg: opts.svg };
    const asked = Number(opts.count);
    const count = Number.isFinite(asked) && opts.count !== null ? Math.max(1, Math.min(MAX_COUNT, Math.round(asked))) : DEFAULT_COUNT;
    const triesPer = opts.triesPer || TRIES_PER;
    const seedMax = opts.seedMax || SEED_MAX;
    const levels = LEVELS.filter((lv) => (opts.levels || []).includes(lv));
    const stages = STAGES_ALL.filter((st) => (opts.stages || []).includes(st));
    const cats = levels.flatMap((level) => stages.map((stage) => ({ level, stage })));
    const total = cats.length * count;
    const rngs = {}; const used = {};
    for (const lv of levels) { rngs[lv] = R.mulberry32((opts.seed + LEVELS.indexOf(lv)) >>> 0); used[lv] = new Set(); }
    const questions = []; const missing = [];
    let c = 0; let made = 0; let tries = 0;
    const closeCat = () => {
      if (made < count) missing.push({ stage: cats[c].stage, level: cats[c].level, made, wanted: count });
      c++; made = 0; tries = 0;
    };
    function step(n) {
      for (let k = 0; k < n && c < cats.length; k++) {
        const { level, stage } = cats[c];
        tries++;
        const sd = R.int(rngs[level], 1, seedMax);
        if (!used[level].has(sd)) {
          used[level].add(sd);
          let q = question(stage, exercise(level, sd), ctx, tr);
          // immPred puede tomar la tabla de una semilla siguiente: si ya salió en el nivel, se descarta (sin repetir).
          if (q && q.seed !== sd) { if (used[level].has(q.seed)) q = null; else used[level].add(q.seed); }
          if (q) { questions.push(q); made++; }
        }
        if (made >= count || tries >= triesPer * count) closeCat();
      }
      return { done: c >= cats.length, made: questions.length, total };
    }
    return { step, result: () => ({ seed: opts.seed, lang: opts.lang, nota: opts.nota, questions: questions.slice(), missing: missing.slice() }) };
  }

  function generate(opts, tr) {
    const r = runner(opts, tr);
    while (!r.step(1000).done);
    return r.result();
  }

  // ---------- Moodle XML (plan P4) ----------

  // Base64 del texto en UTF-8, sin Buffer ni btoa (el núcleo corre igual en Node y en el navegador).
  function base64(text) {
    const bytes = [];
    for (const ch of String(text)) {
      const c = ch.codePointAt(0);
      if (c < 0x80) bytes.push(c);
      else if (c < 0x800) bytes.push(0xc0 | (c >> 6), 0x80 | (c & 63));
      else if (c < 0x10000) bytes.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
      else bytes.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    }
    const abc = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    let out = '';
    for (let i = 0; i < bytes.length; i += 3) {
      const n = (bytes[i] << 16) | ((bytes[i + 1] || 0) << 8) | (bytes[i + 2] || 0);
      out += abc[n >> 18] + abc[(n >> 12) & 63] + (i + 1 < bytes.length ? abc[(n >> 6) & 63] : '=') + (i + 2 < bytes.length ? abc[n & 63] : '=');
    }
    return out;
  }

  const escText = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const escAttr = (s) => escText(s).replace(/"/g, '&quot;');
  const cdata = (s) => `<![CDATA[${String(s).replace(/\]\]>/g, ']]]]><![CDATA[>')}]]>`;
  // Caracteres reservados del cloze dentro de una respuesta: } # ~ / " y la barra invertida.
  const escCloze = (s) => String(s).replace(/[\\}#~/"]/g, (m) => `\\${m}`);

  function cellHtml(c, tr) {
    if (c && typeof c === 'object' && 'num' in c) return `{1:NUMERICAL:=${c.num}:0}`;
    if (c && typeof c === 'object' && 'mr' in c) return `{1:MULTIRESPONSE_H:${c.mr.map((o) => `%${o.fraction}%${escText(escCloze(o.label))}`).join('~')}}`;
    if (c && typeof c === 'object' && 'yesNo' in c) {
      const yes = escText(escCloze(tr('yes'))); const no = escText(escCloze(tr('no')));
      return `{1:MULTICHOICE:${c.yesNo ? '=' : ''}${yes}~${c.yesNo ? '' : '='}${no}}`;
    }
    return escText(c);
  }

  function blocksHtml(blocks, tr) {
    return blocks.map((b) => {
      if (b.table) {
        const head = b.table.head.map((h) => `<th scope="col">${escText(h)}</th>`).join('');
        const rows = b.table.rows.map((r) => `<tr>${r.map((c, i) => (i === 0 ? `<th scope="row">${cellHtml(c, tr)}</th>` : `<td>${cellHtml(c, tr)}</td>`)).join('')}</tr>`).join('');
        return `<table class="table table-sm table-bordered" style="width:auto"><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table>`;
      }
      if (b.links) {
        const a = (href, key) => `<a href="${escAttr(href)}" target="_blank" rel="noopener">${escText(tr(key))}</a>`;
        return `<p>${[b.links.ex ? a(b.links.ex, b.links.exKey || 'link.ex') : null, a(b.links.step, b.links.stepKey || 'link.step')].filter(Boolean).join(' · ')}</p>`;
      }
      if (b.img) return `<p><img src="@@PLUGINFILE@@/${escAttr(b.img.src)}" alt="${escAttr(b.img.alt)}"></p>`;
      if (b.link) return `<p><a href="${escAttr(b.link.href)}" target="_blank" rel="noopener">${escText(tr(b.link.key))}</a></p>`;
      if (b.quote) return `<blockquote>${b.quote.map((x) => `<p>${escText(x)}</p>`).join('')}</blockquote>`;
      if (b.strong) return `<p><strong>${escText(b.strong)}</strong></p>`;
      return `<p>${escText(b.p)}${b.hole ? ` ${cellHtml(b.hole, tr)}` : ''}</p>`;
    }).join('');
  }

  // En el nombre de una categoría, «/» separa niveles: una barra del texto se escribe doble.
  const catPath = (parts) => parts.map((x) => String(x).replace(/\//g, '//')).join('/');

  function toXml(bank, tr) {
    const out = [];
    let last = null;
    for (const q of bank.questions) {
      const cat = catPath(q.category);
      if (cat !== last) {
        out.push(`  <question type="category">\n    <category><text>$course$/top/${escText(cat)}</text></category>\n  </question>`);
        last = cat;
      }
      let body = '';
      if (q.qtype === 'multichoice') {
        body = `    <single>${q.single ? 'true' : 'false'}</single>\n    <shuffleanswers>1</shuffleanswers>\n    <answernumbering>abc</answernumbering>\n`
          + '    <showstandardinstruction>0</showstandardinstruction>\n'
          + '    <correctfeedback format="html"><text></text></correctfeedback>\n'
          + '    <partiallycorrectfeedback format="html"><text></text></partiallycorrectfeedback>\n'
          + '    <incorrectfeedback format="html"><text></text></incorrectfeedback>\n'
          + q.options.map((o) => `    <answer fraction="${o.fraction}" format="html">\n      <text>${cdata(escText(o.text != null ? o.text : o.path))}</text>\n`
            + `      <feedback format="html"><text>${cdata(escText(o.feedback))}</text></feedback>\n    </answer>`).join('\n') + '\n';
      }
      out.push(`  <question type="${q.qtype}">\n    <name><text>${escText(q.name)}</text></name>\n`
        + `    <questiontext format="html"><text>${cdata(blocksHtml(q.text, tr))}</text>${(q.files || []).map((f) => `\n      <file name="${escAttr(f.name)}" path="/" encoding="base64">${base64(f.svg)}</file>`).join('')}${q.files ? '\n    ' : ''}</questiontext>\n`
        + `    <generalfeedback format="html"><text>${cdata(blocksHtml(q.general, tr))}</text></generalfeedback>\n`
        + '    <defaultgrade>1</defaultgrade>\n    <penalty>0</penalty>\n    <hidden>0</hidden>\n    <idnumber></idnumber>\n'
        + body
        + `    <tags>${q.tags.map((t) => `<tag><text>${escText(t)}</text></tag>`).join('')}</tags>\n  </question>`);
    }
    return `<?xml version="1.0" encoding="UTF-8"?>\n<!-- Project Network Lab · s=${bank.seed} · ${APP} -->\n<quiz>\n${out.join('\n')}\n</quiz>\n`;
  }

  const api = { STAGES, STAGES_ALL, LEVELS, APP, FRACTIONS, MR_FRACTIONS, MIN_DISTRACTORS, MAX_DISTRACTORS, MAX_COUNT, DEFAULT_COUNT, TRIES_PER,
    fraction, exercise, fromRows, links, question, runner, generate, toXml, cdata, base64, claimHolds, transitive };
  root.PNL = root.PNL || {};
  root.PNL.moodle = api;
  if (isNode) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
