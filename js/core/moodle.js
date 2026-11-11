/*
 * core/moodle — el banco de preguntas de Moodle XML por etapas (spec f3b-moodle; plan §3, P1–P6).
 * Cada pregunta es un modelo (bloques de texto, tablas con datos y huecos, opciones) construido con la solución
 * de grade.solve, sin recalcular el método (constitución, 4 y 15); de él salen el XML (toXml) y la vista previa
 * (views/question-view). Etapas: early (ES, EF y duración), late (LS y LF), floats (TF, FF, IF y, con sf, SF),
 * critAct (¿crítica?), critPath (caminos), evEarly (TE) y evLate (TL y holgura de suceso). Cada una da como datos
 * la solución de la anterior; critAct y critPath dan los de late (los cuatro tiempos, sin holguras).
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

  const STAGES = ['early', 'late', 'floats', 'critAct', 'critPath', 'evEarly', 'evLate'];
  const LEVELS = ['easy', 'medium', 'hard'];
  const APP = 'https://josemagalan.github.io/project-network-lab/cpm.html';
  const PATH_LIMIT = 100000;
  const MAX_DISTRACTORS = 4;
  const MIN_DISTRACTORS = 2;
  // Fracciones de la lista de Moodle (100/k con k = 1…4); otra cualquiera no se importa.
  const FRACTIONS = { 1: '100', 2: '50', 3: '33.33333', 4: '25' };
  const ASK = { early: ['times'], late: ['times'], floats: ['floats'], critAct: ['critical'], critPath: ['critical'], evEarly: ['events'], evLate: ['events'] };
  const PATH_SEP = ' – ';

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

  function question(stage, ex, ctx, tr) {
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
    const hole = (c) => { answers[c.key] = 'num' in c ? c.num : (c.yesNo ? 'yes' : 'no'); return c; };
    const table = (head, rows, extra) => ({ table: Object.assign({ head, rows }, extra || {}) });
    let text; let sol; let options = null;

    if (stage === 'early') {
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

    const l = links(ex, stage, ctx);
    const stageName = tr(`stage.${stage}`);
    const levelName = ex.level ? tr(`level.${ex.level}`) : null;
    const nameParts = [stageName];
    if (levelName) nameParts.push(levelName.toLowerCase());
    nameParts.push(`n=${acts.length}`);
    if (ex.seed != null) nameParts.push(`s=${ex.seed}`);
    nameParts.push(`gv=${ex.gv}`);
    const q = {
      stage, level: ex.level, seed: ex.seed, gv: ex.gv, n: acts.length,
      category: [tr('root'), stageName].concat(levelName ? [levelName] : []),
      name: nameParts.join(' · '),
      tags: [`pnl-${stage}`, `level-${ex.level || 'example'}`, `lang-${ctx.lang}`, `gv-${ex.gv}`],
      qtype: options ? 'multichoice' : 'cloze',
      text,
      general: [{ strong: tr('sol.title') }, ...sol, { links: l }],
      links: l,
      answers,
    };
    if (options) q.options = options;
    return q;
  }

  const api = { STAGES, LEVELS, APP, FRACTIONS, MIN_DISTRACTORS, MAX_DISTRACTORS, fraction, exercise, fromRows, links, question };
  root.PNL = root.PNL || {};
  root.PNL.moodle = api;
  if (isNode) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
