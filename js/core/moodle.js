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

  const STAGES = ['early', 'late', 'floats', 'critAct', 'critPath', 'evEarly', 'evLate'];
  const STAGES_ALL = [...STAGES, 'stmt'];
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
    const hole = (c) => { answers[c.key] = 'num' in c ? c.num : 'mr' in c ? c.answer : (c.yesNo ? 'yes' : 'no'); return c; };
    const table = (head, rows, extra) => ({ table: Object.assign({ head, rows }, extra || {}) });
    let text; let sol; let options = null;
    let l = null; let sv = null;

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
    return q;
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
    const ctx = { lang: opts.lang, nota: opts.nota, sf: !!opts.sf, labels: opts.labels };
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
          const q = question(stage, exercise(level, sd), ctx, tr);
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
        body = '    <single>false</single>\n    <shuffleanswers>1</shuffleanswers>\n    <answernumbering>abc</answernumbering>\n'
          + '    <showstandardinstruction>0</showstandardinstruction>\n'
          + '    <correctfeedback format="html"><text></text></correctfeedback>\n'
          + '    <partiallycorrectfeedback format="html"><text></text></partiallycorrectfeedback>\n'
          + '    <incorrectfeedback format="html"><text></text></incorrectfeedback>\n'
          + q.options.map((o) => `    <answer fraction="${o.fraction}" format="html">\n      <text>${cdata(escText(o.path))}</text>\n`
            + `      <feedback format="html"><text>${cdata(escText(o.feedback))}</text></feedback>\n    </answer>`).join('\n') + '\n';
      }
      out.push(`  <question type="${q.qtype}">\n    <name><text>${escText(q.name)}</text></name>\n`
        + `    <questiontext format="html"><text>${cdata(blocksHtml(q.text, tr))}</text></questiontext>\n`
        + `    <generalfeedback format="html"><text>${cdata(blocksHtml(q.general, tr))}</text></generalfeedback>\n`
        + '    <defaultgrade>1</defaultgrade>\n    <penalty>0</penalty>\n    <hidden>0</hidden>\n    <idnumber></idnumber>\n'
        + body
        + `    <tags>${q.tags.map((t) => `<tag><text>${escText(t)}</text></tag>`).join('')}</tags>\n  </question>`);
    }
    return `<?xml version="1.0" encoding="UTF-8"?>\n<!-- Project Network Lab · s=${bank.seed} · ${APP} -->\n<quiz>\n${out.join('\n')}\n</quiz>\n`;
  }

  const api = { STAGES, STAGES_ALL, LEVELS, APP, FRACTIONS, MR_FRACTIONS, MIN_DISTRACTORS, MAX_DISTRACTORS, MAX_COUNT, DEFAULT_COUNT, TRIES_PER,
    fraction, exercise, fromRows, links, question, runner, generate, toXml, cdata };
  root.PNL = root.PNL || {};
  root.PNL.moodle = api;
  if (isNode) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
