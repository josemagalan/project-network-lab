'use strict';
// core/exam, segunda parte: los documentos (spec f3f-examen-imprimible, AC2–AC7, AC10, AC11, AC15 y AC23; plan §0 y §3;
// análisis H2, H3 y H7; T007). Contrato que fijan estas pruebas:
//
//   points(opts) → { [parte]: puntos }: la propuesta. Pesos: los apartados que quedan; stmt, minDummy y succ, 1; roy, pert
//     y det, 2. Cada parte, a 0,25 (al más cercano); el resto, a la de más peso (la primera si empatan): suman 10.
//   itemPoints(parte, puntos, apartados) → { [apartado]: puntos }: a partes iguales, a 0,25, el resto al primero; suman los
//     de la parte. Una parte sin apartados: { [parte]: puntos }.
//   check(opts): opts.points = { [parte]: puntos } (de 0 a 10, de 0,25 en 0,25; la que falta, la propuesta) → error
//     «points» si no vale; aviso { key: 'pointsSum', params: { sum } } si no suman 10 (se puede imprimir igual).
//   document(model, opts, ctx) → { ok, meta, student, solution, rubric, values, points, link } | { ok: false, reason }
//     model: el de project() o models(); ctx = { lang, nota, labels, tr, svg?, chart? } (svg: views/net-svg; chart:
//     views/chart-svg; sin ellos, el bloque lleva su modelo y svg null). Los textos nuevos llegan con tr('exam.…').
//     meta = { letter, seed, sdUsed, example, level }.
//     Bloques (una clave de KINDS cada uno): { part, title, pts } marca de parte, en los tres documentos y en el orden de
//     check().parts · { item, part, pts } apartado de la rúbrica, seguido de sus criterios · { consequent, p } ejemplo de
//     error consecuente (abajo) · { annex: 'normal' | 'grid' } · { link } · { page } · { h } · { p } · { quote: [líneas] }
//     · { table: { head, rows }, fill } (null = celda en blanco para rellenar; fill, si hay alguna) · { svg, model, alt,
//     wide } (redes con dx 95, el dibujo compacto de papel; wide si el SVG mide más de 829 px) · { box } · { grid, w, h }.
//     values[parte][clave]: las cifras de la solución (las mismas que el núcleo y que la etapa de Moodle; con el TCL, lo
//     determinista con las medias de dos decimales, y z, P y el plazo con μ y σ² redondeadas, como las series; H7).
//     points[parte] = { pts, items: { [apartado]: puntos } }.
//     consequent = { kind: 'calc' | 'tcl' | 'disc' | 'rep', ask?, answers, sown, carried }: una hoja del alumno con un
//       error sembrado (sown) y las casillas que lo arrastran (carried); corregida con grade.grade (calc, sobre la tabla
//       con las duraciones del examen) o probgrade, sown sale wrong y cada una de carried, carried.
//     link: el enlace corto del alumno (P3, H3): APP#v=ex&xk=<tipo>&lv=<nivel>&sd=<semilla usada>&lang=<idioma>
//       [&nota=es][&xo=1 | &mv=<variante>]; con un ejemplo, M6 o M7 con ue, o la ruta guiada con ex.
// Encadenado (decisiones del autor; la de la PERT, 2026-11-21): ninguna parte enseña lo que pide una anterior. Con
// «Construir la PERT», los sucesores y los tiempos de los sucesos se responden sobre la red del alumno (sin tabla de
// sucesos ni de arcos en el enunciado); con el enunciado, lo mismo, y el detective lleva su propio proyecto (T008).
const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('child_process');
const path = require('path');
const E = require('../js/core/exam.js');
const PG = require('../js/core/probgen.js');
const PGR = require('../js/core/probgrade.js');
const SR = require('../js/core/series.js');
const M = require('../js/core/moodle.js');
const G = require('../js/core/generator.js');
const GR = require('../js/core/grade.js');
const PR = require('../js/core/project.js');
const RC = require('../js/core/roycheck.js');
const MD = require('../js/core/mindummy.js');
const U = require('../js/core/urlstate.js');
const NS = require('../js/views/net-svg.js');
const IM = require('../js/i18n-moodle.js');

const trx = (lang) => { const base = IM.tr(lang); return (k, p) => (k.startsWith('exam.') ? `⟦${k}⟧${p ? JSON.stringify(p) : ''}` : base(k, p)); };
const ctxOf = (lang, nota, extra) => Object.assign({ lang: lang || 'es', nota: nota || 'en', labels: IM.labels(nota || 'en'), tr: trx(lang || 'es') }, extra);
const ctx = ctxOf();
const ALL = ['stmt', 'roy', 'pert', 'det', 'times', 'floats', 'minDummy', 'succ', 'tcl', 'read', 'disc', 'rep'];
const opts = (o) => Object.assign({ level: 'medium', seed: 1, models: 1 }, o);
const KINDS = ['item', 'part', 'consequent', 'annex', 'link', 'page', 'grid', 'svg', 'table', 'box', 'quote', 'h', 'p'];
const kind = (b) => KINDS.find((k) => k in b);
const SEP = ' – ';
const near = (a, b) => (typeof a === 'number' && typeof b === 'number' ? Math.abs(a - b) < 1e-9 : JSON.stringify(a) === JSON.stringify(b));
const r2 = (x) => Math.round(x * 100) / 100;

function make(o, c) {
  const cc = c || ctx;
  const m = E.project(o, 0, cc);
  assert.equal(m.ok, true, JSON.stringify(o));
  return { m, d: E.document(Object.assign({ letter: 'A' }, m), o, cc) };
}
/** Los bloques de una parte en un documento: de su marca a la siguiente marca o anexo. */
function partOf(blocks, p) {
  const i = blocks.findIndex((b) => b.part === p);
  if (i < 0) return null;
  const j = blocks.findIndex((b, k) => k > i && (kind(b) === 'part' || kind(b) === 'annex'));
  return blocks.slice(i + 1, j < 0 ? blocks.length : j);
}
const beforeParts = (blocks) => blocks.slice(0, Math.max(0, blocks.findIndex((b) => kind(b) === 'part')));
const tables = (blocks) => blocks.filter((b) => kind(b) === 'table').map((b) => b.table);
const svgs = (blocks) => blocks.filter((b) => kind(b) === 'svg');
const headHas = (t, label) => t.head.some((h) => String(h) === label);
const colFilled = (t, label) => { const i = t.head.findIndex((h) => String(h) === label); return i >= 0 && t.rows.some((r) => r[i] !== null && r[i] !== ''); };
const L = IM.labels('en');
const T = IM.tr('es');

// ---------- el oráculo de las cifras (AC2, H7) ----------

/** Las cifras que debe dar cada parte, del núcleo y de las etapas de Moodle equivalentes. */
function oracle(m, o) {
  const c = E.check(o);
  const it = c.items;
  const out = {};
  const project = PR.parse(m.base.rows, 'pred').project;
  const acts = project.activities.map((a) => a.id);
  const st = E.stagesOf(c);
  const sq = st.length ? SR.question(st, m.base, Object.assign({}, ctx, { sf: !!(it.floats && it.floats.includes('sf')), tr: IM.tr('es') }), IM.tr('es')) : null;
  const A = sq ? sq.answers : {};
  // Lo determinista: con el TCL, con las medias de dos decimales (las de la serie).
  const amb = m.tcl ? Object.fromEntries(m.tcl.rows.map((r) => [r.id, r])) : null;
  const durOf = (r) => (amb ? String(r2((amb[r.id].a + 4 * amb[r.id].m + amb[r.id].b) / 6)) : r.duration);
  const sol = GR.solve(PR.parse(m.base.rows.map((r) => Object.assign({}, r, { duration: durOf(r) })), 'pred').project);
  for (const p of c.parts) {
    const v = {};
    if (p === 'stmt') for (const id of acts) v[`${id}.preds`] = project.preds[id].slice().sort();
    if (p === 'roy') v.arcs = RC.fromTable(project).arcs.map((e) => `${e.from}>${e.to}`);
    if (p === 'pert') v.dummies = m.base.info && Number.isInteger(m.base.info.dummies) ? m.base.info.dummies : MD.solve(project).value;
    if (p === 'det') v.errors = m.det.errors.map((e) => ({ type: e.type, element: e.element }));
    if (p === 'times') {
      if (it.times.includes('times')) {
        for (const id of acts) for (const f of ['ES', 'EF', 'LS', 'LF']) v[`${id}.${f}`] = sq ? A[`${f[0] === 'E' ? 1 : 2}:${id}.${f}`] : sol.cpm.times[id][f];
        v.dur = sq ? A['1:dur'] : sol.cpm.duration;
      }
      if (it.times.includes('events')) {
        for (const e of sol.net.events) {
          v[`e${e.n}.TE`] = sq ? A[`5:e${e.n}.TE`] : sol.events.TE[e.n];
          v[`e${e.n}.TL`] = sq ? A[`6:e${e.n}.TL`] : sol.events.TL[e.n];
          v[`e${e.n}.slack`] = sq ? A[`6:e${e.n}.slack`] : sol.events.slack[e.n];
        }
      }
    }
    if (p === 'floats') {
      const fs = (it.floats.includes('floats') ? ['TF', 'FF', 'IF'] : []).concat(it.floats.includes('sf') ? ['SF'] : []);
      for (const id of acts) for (const f of fs) v[`${id}.${f}`] = sq ? A[`3:${id}.${f}`] : sol.cpm.floats[id][f];
      if (it.floats.includes('critical')) {
        v.critical = sol.cpm.critical.slice();
        v.paths = sol.cpm.criticalPaths.map((x) => x.acts.join(SEP)).sort(M._.natural);
      }
    }
    if (p === 'minDummy') v.dummies = m.base.info && Number.isInteger(m.base.info.dummies) ? m.base.info.dummies : MD.solve(project).value;
    if (p === 'succ') {
      const edges = [...sol.net.arcs, ...sol.net.dummies];
      const order = [...acts, ...sol.net.dummies.map((x) => x.name)];
      for (const e of sol.net.events) {
        const outs = edges.filter((x) => x.from === e.n).map((x) => x.act || x.name).sort((a, b) => order.indexOf(a) - order.indexOf(b));
        if (outs.length) v[`e${e.n}.succ`] = outs;
      }
    }
    if (p === 'tcl') {
      const s = PG.solve('tcl', m.tcl);
      const ti = it.tcl;
      if (ti.includes('moments')) for (const r of m.tcl.rows) { v[`${r.id}.te`] = s.acts[r.id].te; v[`${r.id}.var`] = s.acts[r.id].var; }
      if (ti.includes('path')) v.path = s.path.slice();
      if (ti.includes('project')) { v.mu = s.mu; v.var = s.var; }
      if (ti.includes('prob')) { v.z = A['13:z']; v.p = A['13:p']; }
      if (ti.includes('deadline')) { v.zp = A['13:zp']; v.Tp = A['13:Tp']; }
      if (ti.includes('route')) for (const k of ['r.mu', 'r.var', 'r.z', 'r.p', 'both']) v[k] = A[`14:${k}`];
    }
    if (p === 'read') {
      const s = PG.solve('read', m.read);
      const ri = it.read;
      if (ri.includes('pct')) v.pct = s.pct.value;
      if (ri.includes('pT')) v.pT = s.pT;
      if (ri.includes('crit')) v.crit = s.act.crit;
      if (ri.includes('questions')) for (const q of m.read.questions) v[`q.${q.key}`] = q.correct;
    }
    if (p === 'disc') {
      const s = PG.solve('disc', m.disc);
      const di = it.disc;
      if (di.includes('combos')) s.combos.forEach((x, i) => { v[`c${i + 1}.T`] = x.T; v[`c${i + 1}.p`] = x.p; });
      if (di.includes('mean')) v.mean = s.mean;
      if (di.includes('pT')) v.pT = s.pT;
      if (di.includes('crit')) for (const id of m.disc.disc) v[`${id}.crit`] = s.crit[id];
    }
    if (p === 'rep') {
      const s = PG.solve('rep', m.rep);
      const ri = it.rep;
      if (ri.includes('reps')) s.reps.forEach((x, i) => { v[`r${i + 1}.T`] = x.T; });
      if (ri.includes('marks')) s.reps.forEach((x, i) => { v[`r${i + 1}.crit`] = x.crit.slice().sort(); });
      if (ri.includes('pT')) v.pT = s.pT;
      if (ri.includes('crit')) for (const r of m.rep.rows) v[`${r.id}.crit`] = s.crit[r.id];
    }
    // Con la serie del mismo proyecto (la etapa de Moodle equivalente), las mismas cifras.
    if (sq) {
      const code = { stmt: '0', minDummy: '7', succ: '8' }[p];
      if (code) for (const [k, x] of Object.entries(v)) assert.ok(near(A[`${code}:${k}`], x), `serie ${code}:${k}`);
      if (p === 'floats' && v.paths) assert.deepEqual(A['4b:paths'], v.paths);
    }
    out[p] = v;
  }
  return out;
}
function sameValues(got, exp, tag) {
  assert.deepEqual(Object.keys(got).sort(), Object.keys(exp).sort(), `${tag}: partes`);
  for (const p of Object.keys(exp)) {
    assert.deepEqual(Object.keys(got[p]).sort(), Object.keys(exp[p]).sort(), `${tag} ${p}: claves`);
    for (const k of Object.keys(exp[p])) assert.ok(near(got[p][k], exp[p][k]), `${tag} ${p}.${k}: ${JSON.stringify(got[p][k])} ≠ ${JSON.stringify(exp[p][k])}`);
  }
}

// ---------- un fallo de la primera parte que destapan los documentos ----------

test('exam-doc · project con solo partes de construcción (sin etapas de las series): la tabla del generador de la semilla', () => {
  for (const parts of [['roy'], ['pert'], ['roy', 'pert'], ['det'], ['roy', 'det'], ['roy', 'pert', 'det']]) {
    const r = E.project(opts({ level: 'easy', seed: 23, parts }), 0, ctx);
    assert.equal(r.ok, true, `${parts}`);
    assert.deepEqual(r.base.rows, G.generate(r.sdUsed, G.LEVELS.easy).rows, `${parts}`);
    assert.equal(r.tcl, null);
  }
});

// ---------- forma ----------

test('exam-doc · document: tres documentos en bloques, las partes en orden en los tres y la cabecera del modelo', () => {
  const o = opts({ level: 'medium', seed: 3, parts: ALL });
  const { m, d } = make(o);
  const c = E.check(o);
  assert.equal(d.ok, true);
  assert.deepEqual(d.meta, { letter: 'A', seed: m.seed, sdUsed: m.sdUsed, example: null, level: 'medium' });
  for (const doc of ['student', 'solution', 'rubric']) {
    assert.ok(Array.isArray(d[doc]) && d[doc].length, doc);
    for (const b of d[doc]) assert.ok(kind(b), `${doc}: bloque sin tipo ${JSON.stringify(b).slice(0, 80)}`);
    const marks = d[doc].filter((b) => kind(b) === 'part');
    assert.deepEqual(marks.map((b) => b.part), c.parts, doc);
    for (const b of marks) assert.equal(b.pts, d.points[b.part].pts, `${doc} ${b.part}`);
    for (const t of tables(d[doc])) for (const row of t.rows) assert.equal(row.length, t.head.length, `${doc}: fila de otro ancho`);
  }
  // Las celdas en blanco solo en el enunciado, y la tabla las anuncia.
  for (const b of d.student.filter((x) => kind(x) === 'table')) assert.equal(!!b.fill, b.table.rows.some((r) => r.includes(null)));
  for (const doc of ['solution', 'rubric']) for (const t of tables(d[doc])) assert.ok(t.rows.every((r) => !r.includes(null)), doc);
  assert.equal(typeof d.link, 'string');
  assert.deepEqual(E.document({ ok: false, reason: 'tries' }, o, ctx), { ok: false, reason: 'tries' });
});

// ---------- las cifras (AC2, H7) ----------

const COMBOS = [
  ['times', 'floats'], ['times', 'floats', 'minDummy', 'succ'], ['stmt', 'times', 'floats'], ['times', 'floats', 'tcl'],
  ['stmt', 'times', 'tcl'], ['tcl', 'read', 'disc', 'rep'], ['roy', 'pert', 'times', 'floats', 'minDummy'],
  ['times', 'floats', 'tcl', 'rep'], ['pert', 'det', 'times', 'succ'], ['roy', 'det', 'floats', 'disc'],
];
for (const level of ['easy', 'medium', 'hard']) {
  test(`exam-doc · las cifras de la solución son las del núcleo y las de Moodle: 300 exámenes en ${level}`, () => {
    let read = 0;
    for (let i = 0; i < 300; i++) {
      let parts = COMBOS[i % COMBOS.length];
      if (parts.includes('read') && i % 30 >= 10) parts = parts.filter((p) => p !== 'read'); // «Leer» simula: una de cada tres
      const items = {};
      if (i % 3 === 0) items.floats = { off: ['sf'] };
      if (i % 5 === 0) items.times = { off: ['events'] };
      if (i % 7 === 0 && parts.includes('tcl') && level !== 'hard') items.tcl = { on: ['route'] };
      if (i % 4 === 1) items.tcl = Object.assign({}, items.tcl, { off: ['deadline'] });
      const o = opts({ level, seed: 1 + i * 37, parts, items });
      const { m, d } = make(o);
      sameValues(d.values, oracle(m, o), `${level} ${parts} s=${o.seed}`);
      if (parts.includes('read')) {
        read++;
        const q = M.question('mcRead', Object.assign({}, m.read), Object.assign({}, ctx, { tr: IM.tr('es') }), IM.tr('es'));
        if (q) for (const k of ['pct', 'pT', 'crit']) assert.ok(near(d.values.read[k], q.answers[k]), `read ${k}`);
      }
      for (const [p, stage] of [['disc', 'mcDisc'], ['rep', 'mcRep']]) {
        if (!parts.includes(p)) continue;
        const q = M.question(stage, m[p], Object.assign({}, ctx, { tr: IM.tr('es') }), IM.tr('es'));
        for (const k of Object.keys(q.answers)) assert.ok(near(d.values[p][k], q.answers[k]), `${p} ${k}`);
      }
    }
    assert.ok(read > 0);
  });
}

test('exam-doc · la solución enseña las cifras: tiempos y holguras en sus tablas (con el TCL, a dos decimales)', () => {
  for (const parts of [['times', 'floats'], ['times', 'floats', 'tcl']]) {
    const { d } = make(opts({ level: 'medium', seed: 21, parts }));
    for (const p of ['times', 'floats']) {
      const cells = new Set(tables(partOf(d.solution, p)).flatMap((t) => t.rows.flat().map(String)));
      const ps = partOf(d.solution, p).filter((b) => kind(b) === 'p').map((b) => b.p);
      for (const [k, v] of Object.entries(d.values[p])) {
        if (typeof v !== 'number') continue;
        const txt = parts.includes('tcl') ? M._.numText('es', v, 2) : String(v);
        assert.ok(cells.has(txt) || cells.has(String(v)) || ps.some((x) => x.endsWith(` ${txt}`)), `${parts} ${p} ${k} = ${v} no está en la solución`);
      }
    }
  }
});

test('exam-doc · con un ejemplo citado: sus cifras (Klastorin) y su enunciado de los apuntes (ej4)', () => {
  const o = opts({ example: 'kl', parts: ['times', 'tcl'] });
  const { m, d } = make(o);
  const s = PG.solve('tcl', PG.fromExample('kl'));
  for (const r of m.tcl.rows) assert.ok(near(d.values.tcl[`${r.id}.te`], s.acts[r.id].te));
  assert.ok(near(d.values.tcl.mu, s.mu));
  assert.equal(d.meta.example, 'kl');
  assert.equal(d.meta.sdUsed, null);
  const e = make(opts({ example: 'ej4', parts: ['stmt', 'times'] }));
  assert.ok(partOf(e.d.student, 'stmt').some((b) => kind(b) === 'quote'));
  sameValues(e.d.values, oracle(e.m, opts({ example: 'ej4', parts: ['stmt', 'times'] })), 'ej4');
});

// ---------- encadenado (AC3–AC5, AC21, AC22) ----------

test('exam-doc · con «Del enunciado a la tabla», el enunciado no da las precedencias; sin ella, la tabla va una vez, arriba', () => {
  for (const parts of [['stmt', 'times', 'floats', 'succ'], ['stmt', 'times', 'tcl']]) {
    const { d } = make(opts({ level: 'easy', seed: 8, parts }));
    for (const t of tables(d.student)) for (const label of [T('col.preds'), T('col.immPreds')]) assert.equal(colFilled(t, label), false, `${parts}: ${label}`);
    assert.ok(!tables(d.student).some((t) => headHas(t, T('col.netPreds')) || headHas(t, T('col.arc')) || headHas(t, T('col.arrives'))), `${parts}: una red`);
    assert.ok(partOf(d.student, 'stmt').some((b) => kind(b) === 'quote'));
    // La solución trae la tabla.
    assert.ok(tables(partOf(d.solution, 'stmt')).some((t) => colFilled(t, T('col.preds'))));
  }
  const { d } = make(opts({ level: 'easy', seed: 8, parts: ['times', 'floats'] }));
  const top = tables(beforeParts(d.student)).filter((t) => colFilled(t, T('col.preds')));
  assert.equal(top.length, 1);
  assert.equal(tables(d.student).filter((t) => colFilled(t, T('col.preds'))).length, 1);
});

test('exam-doc · con el TCL y lo determinista: el enunciado da a, m y b, y lo determinista va con las medias (AC5)', () => {
  const o = opts({ level: 'medium', seed: 40, parts: ['times', 'floats', 'tcl'] });
  const { m, d } = make(o);
  const data = tables(beforeParts(d.student));
  assert.ok(data.some((t) => ['a', 'm', 'b'].every((x) => headHas(t, x))));
  const amb = Object.fromEntries(m.tcl.rows.map((r) => [r.id, r]));
  const id = m.tcl.rows.find((r) => !r.preds.length).id;
  assert.ok(near(d.values.times[`${id}.EF`], r2((amb[id].a + 4 * amb[id].m + amb[id].b) / 6)));
  assert.ok(!data.some((t) => headHas(t, T('col.dur'))), 'sin la columna de duraciones (son las medias)');
});

test('exam-doc · construir la ROY: rejilla en el enunciado y ninguna ROY dibujada después; la solución la trae (AC3)', () => {
  const o = opts({ level: 'medium', seed: 12, parts: ['roy', 'det', 'times'] });
  const { m, d } = make(o);
  assert.ok(!svgs(d.student).some((b) => b.model.graph === 'aon'));
  assert.ok(!tables(d.student).some((t) => headHas(t, T('col.netPreds'))));
  const g = partOf(d.student, 'roy').find((b) => kind(b) === 'grid');
  assert.deepEqual({ grid: g.grid, w: g.w, h: g.h }, { grid: 'aon', w: 880, h: 420 });
  const s = svgs(partOf(d.solution, 'roy'));
  assert.equal(s.length, 1);
  assert.equal(s[0].model.graph, 'aon');
  assert.deepEqual(s[0].model.roy, RC.fromTable(PR.parse(m.base.rows, 'pred').project));
  assert.equal(s[0].model.dx, 95);
  assert.ok(s[0].alt);
});

test('exam-doc · construir la PERT: ni la PERT ni sus sucesos en el enunciado; sucesores y sucesos, sobre la red del alumno', () => {
  const o = opts({ level: 'medium', seed: 12, parts: ['pert', 'det', 'times', 'minDummy', 'succ'] });
  const { m, d } = make(o);
  assert.ok(!svgs(d.student).some((b) => b.model.graph === 'aoa'));
  for (const label of [T('col.arc'), T('col.arrives'), T('col.event')]) assert.ok(!tables(d.student).some((t) => headHas(t, label)), label);
  const g = partOf(d.student, 'pert').find((b) => kind(b) === 'grid');
  assert.deepEqual({ grid: g.grid, w: g.w, h: g.h }, { grid: 'aoa', w: 680, h: 360 });
  assert.ok(partOf(d.student, 'succ').some((b) => kind(b) === 'box'));
  // La solución: la PERT con el mínimo de ficticias, y los sucesos de la red de referencia.
  const s = svgs(partOf(d.solution, 'pert'));
  assert.equal(s.length, 1);
  assert.equal(s[0].model.graph, 'aoa');
  assert.equal(s[0].model.pert.dummies.length, MD.solve(PR.parse(m.base.rows, 'pred').project).value);
  assert.equal(d.values.pert.dummies, s[0].model.pert.dummies.length);
  assert.ok(Object.keys(d.values.times).some((k) => k.endsWith('.TE')));
});

test('exam-doc · sin construir la PERT: la tabla de arcos en los sucesos, salvo con «Sucesores» (como las series)', () => {
  const a = make(opts({ level: 'easy', seed: 30, parts: ['times'] })).d;
  assert.equal(tables(partOf(a.student, 'times')).filter((t) => headHas(t, T('col.arc'))).length, 1);
  const b = make(opts({ level: 'easy', seed: 30, parts: ['times', 'succ'] })).d;
  assert.ok(!tables(b.student).some((t) => headHas(t, T('col.arc'))));
  assert.ok(tables(partOf(b.student, 'succ')).some((t) => headHas(t, T('col.arrives'))));
});

test('exam-doc · detective: sobre la red del otro tipo, o con su propio proyecto y su tabla; la solución dice cada error', () => {
  const r = make(opts({ level: 'medium', seed: 12, parts: ['roy', 'det'] }));
  const dr = partOf(r.d.student, 'det');
  assert.deepEqual(svgs(dr).map((b) => b.model.graph), ['aoa']);
  assert.ok(tables(dr).some((t) => headHas(t, T('col.arc'))));
  assert.deepEqual(r.d.values.det.errors, r.m.det.errors.map((e) => ({ type: e.type, element: e.element })));
  assert.ok(partOf(r.d.solution, 'det').filter((b) => kind(b) === 'p').length >= r.m.det.errors.length);
  const own = make(opts({ level: 'medium', seed: 12, parts: ['roy', 'pert', 'det'] }));
  const dp = partOf(own.d.student, 'det');
  assert.deepEqual(svgs(dp).map((b) => b.model.graph), ['aon']);
  const t = tables(dp).find((x) => colFilled(x, T('col.preds')));
  assert.deepEqual(t.rows.map((row) => row[0]), own.m.det.rows.map((x) => x.id));
  assert.ok(!svgs(own.d.student).some((b) => b.model.graph === 'aoa'));
});

test('exam-doc · con «Del enunciado a la tabla», el detective va con su propio proyecto (su red daría la tabla) y se avisa', () => {
  const c = E.check(opts({ parts: ['stmt', 'roy', 'det'] }));
  assert.deepEqual(c.det, { graph: 'aoa', kind: 'all', own: true });
  assert.deepEqual(c.warnings.map((w) => w.key), ['detOwn']);
  assert.deepEqual(E.check(opts({ parts: ['stmt', 'det'], det: 'aoa' })).det, { graph: 'aoa', kind: 'all', own: true });
  const { m, d } = make(opts({ level: 'easy', seed: 4, parts: ['stmt', 'det', 'times'] }));
  assert.equal(m.det.own, true);
  assert.notDeepEqual(m.det.rows, m.base.rows);
  const t = tables(partOf(d.student, 'det')).find((x) => colFilled(x, T('col.preds')));
  assert.deepEqual(t.rows.map((row) => row[0]), m.det.rows.map((x) => x.id));
});

test('exam-doc · discretas y réplicas al final, con sus datos en su propia parte (AC22)', () => {
  const { d } = make(opts({ level: 'easy', seed: 9, parts: ['rep', 'disc', 'times', 'tcl'] }));
  const marks = d.student.filter((b) => kind(b) === 'part').map((b) => b.part);
  assert.deepEqual(marks.slice(-2), ['disc', 'rep']);
  assert.ok(tables(partOf(d.student, 'disc')).some((t) => headHas(t, T('col.durP'))));
  assert.ok(tables(partOf(d.student, 'rep')).some((t) => headHas(t, T('col.run'))));
  assert.ok(!tables(beforeParts(d.student)).some((t) => headHas(t, T('col.durP')) || headHas(t, T('col.run'))));
});

// ---------- puntos (AC6, AC7, AC23) ----------

test('exam-doc · points: la propuesta suma 10, de 0,25 en 0,25, con los pesos del plan y el resto a la parte más grande', () => {
  assert.deepEqual(E.points(opts({ parts: ['times', 'floats'] })), { times: 4, floats: 6 });
  assert.deepEqual(E.points(opts({ parts: ['roy', 'times', 'floats', 'tcl'] })), { roy: 1.75, times: 1.75, floats: 2.5, tcl: 4 });
  assert.deepEqual(E.points(opts({ parts: ['times', 'floats'], items: { floats: { off: ['sf'] } } })), { times: 5, floats: 5 });
  const combos = [ALL, ['stmt'], ['roy', 'pert'], ['minDummy', 'succ', 'det'], ['tcl', 'read', 'disc', 'rep'], ['stmt', 'roy', 'times', 'tcl', 'rep']];
  for (const parts of combos) {
    const p = E.points(opts({ parts }));
    assert.deepEqual(Object.keys(p), E.check(opts({ parts })).parts);
    const sum = Object.values(p).reduce((s, x) => s + x, 0);
    assert.ok(Math.abs(sum - 10) < 1e-9, `${parts}: ${sum}`);
    for (const x of Object.values(p)) { assert.ok(x >= 0); assert.ok(Number.isInteger(x * 4), `${x}`); }
  }
});

test('exam-doc · itemPoints: a partes iguales, de 0,25 en 0,25, el resto al primero; suman los de la parte', () => {
  assert.deepEqual(E.itemPoints('floats', 2.5, ['floats', 'sf', 'critical']), { floats: 1, sf: 0.75, critical: 0.75 });
  assert.deepEqual(E.itemPoints('times', 4, ['times', 'events']), { times: 2, events: 2 });
  assert.deepEqual(E.itemPoints('roy', 1.75, null), { roy: 1.75 });
  for (const pts of [0, 0.25, 0.5, 1, 1.75, 3.25, 10]) {
    for (const items of [['a'], ['a', 'b'], ['a', 'b', 'c'], ['a', 'b', 'c', 'd', 'e', 'f']]) {
      const r = E.itemPoints('x', pts, items);
      assert.deepEqual(Object.keys(r), items);
      assert.ok(Math.abs(Object.values(r).reduce((s, x) => s + x, 0) - pts) < 1e-9);
      for (const x of Object.values(r)) { assert.ok(x >= 0); assert.ok(Number.isInteger(x * 4)); }
    }
  }
});

test('exam-doc · puntos del profesor: se usan, se avisa si no suman 10 y se rechazan los que no valen', () => {
  const o = opts({ parts: ['times', 'floats'], points: { times: 5, floats: 4 } });
  const c = E.check(o);
  assert.equal(c.ok, true);
  assert.deepEqual(c.warnings, [{ key: 'pointsSum', params: { sum: 9 } }]);
  const { d } = make(o);
  assert.equal(d.points.times.pts, 5);
  assert.equal(d.points.floats.pts, 4);
  assert.deepEqual(d.points.floats.items, E.itemPoints('floats', 4, ['floats', 'sf', 'critical']));
  // La parte que falta toma la propuesta.
  assert.deepEqual(E.check(opts({ parts: ['times', 'floats'], points: { times: 4 } })).warnings, []);
  for (const bad of [{ times: 0.3 }, { times: 11 }, { times: -1 }, { times: 'x' }]) {
    assert.deepEqual(E.check(opts({ parts: ['times', 'floats'], points: bad })).errors.map((e) => e.key), ['points'], JSON.stringify(bad));
  }
});

test('exam-doc · rúbrica: cada apartado con sus puntos y sus criterios; los de la parte suman los suyos (AC6)', () => {
  const o = opts({ level: 'medium', seed: 5, parts: ALL });
  const { d } = make(o);
  const c = E.check(o);
  for (const p of c.parts) {
    const bl = partOf(d.rubric, p);
    const items = bl.filter((b) => kind(b) === 'item');
    const want = c.items[p] || [p];
    assert.deepEqual(items.map((b) => b.item), want, p);
    assert.deepEqual(Object.fromEntries(items.map((b) => [b.item, b.pts])), d.points[p].items, p);
    const sum = items.reduce((s, b) => s + b.pts, 0);
    assert.ok(Math.abs(sum - d.points[p].pts) < 1e-9, p);
    // Cada apartado lleva al menos un criterio antes del siguiente.
    items.forEach((b) => {
      const i = bl.indexOf(b);
      const next = bl.findIndex((x, k) => k > i && kind(x) === 'item');
      assert.ok(bl.slice(i + 1, next < 0 ? bl.length : next).some((x) => kind(x) === 'p'), `${p}.${b.item} sin criterio`);
    });
  }
  const total = c.parts.reduce((s, p) => s + d.points[p].pts, 0);
  assert.ok(Math.abs(total - 10) < 1e-9);
});

test('exam-doc · un apartado quitado no está en el enunciado, la solución ni la rúbrica, y los puntos se reparten de nuevo (AC23)', () => {
  const o = opts({ level: 'medium', seed: 6, parts: ['times', 'floats', 'tcl'], items: { floats: { off: ['sf'] }, tcl: { off: ['deadline'] } } });
  const { d } = make(o);
  assert.ok(!Object.keys(d.values.floats).some((k) => k.endsWith('.SF')));
  assert.ok(!('zp' in d.values.tcl) && !('Tp' in d.values.tcl));
  assert.ok(!partOf(d.rubric, 'floats').some((b) => b.item === 'sf'));
  assert.ok(!partOf(d.rubric, 'tcl').some((b) => b.item === 'deadline'));
  for (const doc of ['student', 'solution']) assert.ok(!tables(partOf(d[doc], 'floats')).some((t) => headHas(t, L.SF)), doc);
  assert.deepEqual(d.points.floats.items, E.itemPoints('floats', d.points.floats.pts, ['floats', 'critical']));
  assert.deepEqual(Object.fromEntries(Object.entries(d.points).map(([p, x]) => [p, x.pts])), E.points(o));
});

// ---------- el error consecuente de la rúbrica (AC6) ----------

function checkConsequent(b, m, o) {
  const x = b.consequent;
  assert.ok(Array.isArray(x.carried) && x.carried.length > 0, `${x.kind}: sin casillas que arrastren`);
  assert.ok(b.p, `${x.kind}: sin texto`);
  let cells; let st;
  if (x.kind === 'calc') {
    const amb = m.tcl ? Object.fromEntries(m.tcl.rows.map((r) => [r.id, r])) : null;
    const rows = m.base.rows.map((r) => Object.assign({}, r, { duration: amb ? String(r2((amb[r.id].a + 4 * amb[r.id].m + amb[r.id].b) / 6)) : r.duration }));
    cells = GR.grade(GR.solve(PR.parse(rows, 'pred').project), x.answers, x.ask).cells;
    st = (k) => cells[k] && cells[k].state;
  } else {
    cells = PGR.grade(x.kind, m[x.kind], x.answers).cells;
    st = (k) => cells[k] && cells[k].status;
  }
  if (cells[x.sown]) assert.equal(st(x.sown), 'wrong', `${x.kind}: ${x.sown}`);
  for (const k of x.carried) assert.equal(st(k), 'carried', `${x.kind}: ${k}`);
  assert.ok(!x.carried.includes(x.sown));
  void o;
}

test('exam-doc · la rúbrica trae un ejemplo de error consecuente del propio modelo que el corrector del núcleo da por arrastrado', () => {
  for (const [level, seed, parts] of [['easy', 2, ['times', 'floats']], ['medium', 4, ['times', 'floats', 'tcl', 'disc', 'rep']], ['hard', 11, ['times', 'tcl']], ['medium', 19, ['floats', 'rep']]]) {
    const o = opts({ level, seed, parts });
    const { m, d } = make(o);
    const ex = d.rubric.filter((b) => kind(b) === 'consequent');
    const kinds = ex.map((b) => b.consequent.kind);
    if (parts.includes('times')) assert.equal(kinds.filter((k) => k === 'calc').length, 1, `${parts}`);
    for (const k of ['tcl', 'disc', 'rep']) if (parts.includes(k)) assert.equal(kinds.filter((x) => x === k).length, 1, `${parts}: ${k}`);
    for (const b of ex) checkConsequent(b, m, o);
    // Cada ejemplo va en la rúbrica de su parte.
    for (const b of ex) {
      const owner = b.consequent.kind === 'calc' ? ['times', 'floats'] : [b.consequent.kind];
      assert.ok(owner.some((p) => (partOf(d.rubric, p) || []).includes(b)), b.consequent.kind);
    }
  }
});

// ---------- hallazgos de los bocetos de T009 ----------

// Los parámetros que necesita cada explicación del detective (los de «Ejercicios», ex-det).
const DET_PARAMS = { royMissing: ['from', 'to'], royFalse: ['from', 'to'], royInverted: ['from', 'to'], royCycle: ['from', 'to'],
  pertFalseDummy: ['name', 'from', 'to'], pertMissingDummy: ['dummy', 'from', 'to'], pertInvertedDummy: ['dummy', 'from', 'to'],
  pertParallel: ['act', 'twin', 'from', 'to', 'dummy'], calcES: ['lab', 'wrong', 'right', 'f'], calcLF: ['lab', 'wrong', 'right', 'f'],
  calcFloat: ['lab', 'wrong', 'right', 'lf', 'es'], calcCritOn: ['x', 'tf'], calcCritOff: ['x', 'tf'], calcTE: ['lab', 'wrong', 'right'],
  calcTL: ['lab', 'wrong', 'right'], calcSlack: ['lab', 'wrong', 'right', 'tl', 'te'] };
test('exam-doc · la solución del detective explica cada error con los datos de la red, como «Ejercicios» (bocetos de T009)', () => {
  const seen = new Set();
  for (const [parts, seed, level] of [[['roy', 'det'], 12, 'medium'], [['pert', 'det'], 12, 'medium'], [['det'], 3, 'hard'], [['roy', 'det'], 7, 'hard'], [['pert', 'det'], 31, 'easy'], [['det'], 44, 'medium'], [['det'], 5, 'easy'], [['det'], 46, 'easy']]) {
    const { m, d } = make(opts({ level, seed, parts }));
    const ps = partOf(d.solution, 'det').filter((b) => kind(b) === 'p').map((b) => b.p);
    assert.equal(ps.length, m.det.errors.length);
    m.det.errors.forEach((e, i) => {
      const text = JSON.parse(ps[i].slice(ps[i].indexOf('{'))).text;
      const inner = /^⟦exam\.det\.(\w+)⟧/.exec(text);
      assert.ok(inner, ps[i]);
      const key = inner[1]; const params = text.includes('{') ? JSON.parse(text.slice(text.indexOf('{'))) : {};
      const want = e.type === 'calcCrit' ? (e.wrong ? 'calcCritOn' : 'calcCritOff') : e.type;
      assert.equal(key, want);
      seen.add(key);
      for (const k of DET_PARAMS[key]) assert.ok(params[k] != null && params[k] !== '', `${key}: falta ${k} en ${JSON.stringify(params)}`);
      if (key.startsWith('roy')) for (const k of ['from', 'to']) assert.ok(!/^_[SE]$/.test(params[k]), 'Inicio y Fin con su nombre');
    });
  }
  assert.ok(seen.size >= 4, [...seen].join());
  assert.ok(seen.has('calcCritOn') && seen.has('calcCritOff'), [...seen].join());
});

test('exam-doc · el ejemplo de error consecuente arrastra pocas casillas y las nombra con la notación (bocetos de T009)', () => {
  for (const [level, seed, parts] of [['medium', 2026, ['roy', 'det', 'times', 'floats', 'tcl', 'rep']], ['hard', 11, ['times', 'floats']], ['medium', 4, ['times', 'floats']]]) {
    const { d } = make(opts({ level, seed, parts }));
    const b = d.rubric.find((x) => kind(x) === 'consequent' && x.consequent.kind === 'calc');
    assert.ok(b.consequent.carried.length <= 15, `${level} ${seed}: ${b.consequent.carried.length}`);
    assert.ok(!/[A-Z]\.(ES|EF|LS|LF|TF|FF|IF|SF|crit)\b/.test(b.p), b.p);
    assert.ok(b.p.includes('⟦exam.cell.act⟧'), b.p);
  }
});

// ---------- anexos, enlace y QR (AC10, AC11; P3, H3) ----------

test('exam-doc · anexos: la tabla de la normal solo con el TCL y marcada; las hojas para dibujar y el enlace, si se marcan', () => {
  const cases = [
    [['times', 'tcl'], { id: true, normal: true, grid: true, qr: true }, { normal: 1, grid: 1, link: 1 }],
    [['times', 'tcl'], { id: true, normal: false, grid: false, qr: false }, { normal: 0, grid: 0, link: 0 }],
    [['times', 'floats', 'rep'], { id: true, normal: true, grid: true, qr: true }, { normal: 0, grid: 1, link: 1 }],
    [['roy', 'read'], undefined, { normal: 0, grid: 1, link: 1 }],
    [['tcl'], undefined, { normal: 1, grid: 1, link: 1 }],
  ];
  for (const [parts, extras, want] of cases) {
    const { d } = make(opts({ level: 'easy', seed: 14, parts, extras }));
    const annex = d.student.filter((b) => kind(b) === 'annex').map((b) => b.annex);
    assert.equal(annex.filter((a) => a === 'normal').length, want.normal, `${parts} normal`);
    assert.equal(annex.filter((a) => a === 'grid').length, want.grid, `${parts} grid`);
    assert.equal(d.student.filter((b) => kind(b) === 'link').length, want.link, `${parts} link`);
    // Los anexos, al final del enunciado (la normal antes que las hojas), y nunca en la solución ni en la rúbrica.
    const last = d.student.map(kind).lastIndexOf('part');
    for (const b of d.student.filter((x) => kind(x) === 'annex')) assert.ok(d.student.indexOf(b) > last);
    if (want.normal && want.grid) assert.deepEqual(annex, ['normal', 'grid']);
    for (const doc of ['solution', 'rubric']) assert.ok(!d[doc].some((b) => kind(b) === 'annex'), doc);
  }
});

const hashOf = (link) => link.slice(link.indexOf('#'));
test('exam-doc · enlace del alumno (P3): la parte calculable más avanzada, la semilla usada y el mismo proyecto, sin xm=exam', () => {
  const t = make(opts({ level: 'hard', seed: 44, parts: ['times', 'tcl', 'read'], items: { tcl: { on: ['route'] } } }));
  assert.equal(t.d.link, `${M.APP}#v=ex&xk=tcl&lv=hard&sd=${t.m.sdUsed}&lang=es&xo=1`);
  const ts = U.decode(hashOf(t.d.link)).state;
  assert.deepEqual(PG.candidate('tcl', ts.sd, ts.lv, { route: ts.xo === 1 }).ex.rows, t.m.tcl.rows);
  assert.equal(ts.xm, 'practice');
  const mc = make(opts({ level: 'easy', seed: 44, parts: ['times', 'read', 'disc'] }), ctxOf('en', 'es'));
  assert.equal(mc.d.link, `${M.APP}#v=ex&xk=mc&lv=easy&sd=${mc.m.sdUsed}&lang=en&nota=es&mv=disc`);
  const ms = U.decode(hashOf(mc.d.link)).state;
  assert.deepEqual(PG.candidate(ms.mv, ms.sd, ms.lv).ex, mc.m.disc);
  assert.equal(ms.nota, 'es');
  const calc = make(opts({ level: 'medium', seed: 44, parts: ['roy', 'times', 'floats'] }));
  assert.equal(calc.d.link, `${M.APP}#v=ex&xk=calc&lv=medium&sd=${calc.m.sdUsed}&lang=es`);
  const cs = U.decode(hashOf(calc.d.link)).state;
  assert.deepEqual(G.generate(cs.sd, G.LEVELS[cs.lv]).rows, calc.m.base.rows);
  // Cabe en un QR de la versión 7 con corrección M (122 bytes) con la semilla más larga.
  const big = make(opts({ level: 'medium', seed: 999990, parts: ['tcl'], items: { tcl: { on: ['route'] } } }), ctxOf('es', 'es'));
  assert.ok(Buffer.byteLength(big.d.link) <= 122, big.d.link);
});

test('exam-doc · enlace con un ejemplo citado (H3): M6 o M7 con ue, o la ruta guiada con ex', () => {
  const kl = make(opts({ example: 'kl', parts: ['tcl'] })).d.link;
  assert.equal(kl, `${M.APP}#v=unc&um=m6&ue=kl&lang=es`);
  assert.equal(U.decode(hashOf(kl)).state.ue, 'kl');
  assert.equal(make(opts({ example: 'kd', parts: ['disc'] })).d.link, `${M.APP}#v=unc&um=m7&ue=kd&lang=es`);
  const ej = make(opts({ example: 'ej4', parts: ['times'] })).d.link;
  assert.equal(ej, `${M.APP}#v=route&ex=ej4&lang=es`);
  assert.equal(U.decode(hashOf(ej)).state.ex, 'ej4');
});

// ---------- rejillas (H2), dibujos de papel e idiomas ----------

test('exam-doc · rejillas de tamaño fijo por nivel y red, iguales en todos los modelos (H2)', () => {
  const want = { easy: { aon: [880, 420], aoa: [680, 360] }, medium: { aon: [880, 420], aoa: [680, 360] }, hard: { aon: [1080, 480], aoa: [960, 420] } };
  for (const level of ['easy', 'medium', 'hard']) {
    const o = opts({ level, seed: 70, parts: ['roy', 'pert', 'times'], models: 2 });
    for (const m of E.models(o, ctx)) {
      const d = E.document(m, o, ctx);
      for (const [p, g] of [['roy', 'aon'], ['pert', 'aoa']]) {
        const grids = partOf(d.student, p).filter((b) => kind(b) === 'grid');
        assert.deepEqual(grids.map((b) => [b.grid, b.w, b.h]), [[g, ...want[level][g]]], `${level} ${m.letter} ${p}`);
      }
    }
  }
});

test('exam-doc · dibujos de papel: net-svg con dx (95 en el examen; 110 por defecto, sin cambios) y wide por encima de 829 px', () => {
  const o = opts({ level: 'hard', seed: 3, parts: ['roy', 'pert'] });
  const cs = ctxOf('es', 'en', { svg: (mm) => NS.render(mm) });
  const { d } = make(o, cs);
  const roy = svgs(partOf(d.solution, 'roy'))[0];
  const width = (s) => Number(/width="(\d+(?:\.\d+)?)"/.exec(s)[1]);
  assert.equal(typeof roy.svg, 'string');
  assert.equal(roy.svg, NS.render(roy.model));
  const base = Object.assign({}, roy.model); delete base.dx;
  assert.equal(NS.render(base), NS.render(Object.assign({}, base, { dx: 110 })));
  assert.ok(width(NS.render(roy.model)) < width(NS.render(base)), 'dx 95 más estrecho que 110');
  for (const b of svgs(d.solution)) assert.equal(b.wide, width(b.svg) > 829, `${b.model.graph}: ${width(b.svg)}`);
  // Sin ctx.svg, el bloque lleva su modelo y svg null.
  assert.equal(svgs(partOf(make(o).d.solution, 'roy'))[0].svg, null);
});

test('exam-doc · inglés y notación española: las mismas cifras, otros encabezados (AC15)', () => {
  const o = opts({ level: 'medium', seed: 25, parts: ['times', 'floats', 'tcl'] });
  const es = make(o).d;
  const en = make(o, ctxOf('en', 'es')).d;
  assert.deepEqual(en.values, es.values);
  assert.deepEqual(en.points, es.points);
  const head = (d) => tables(partOf(d.student, 'times')).flatMap((t) => t.head.map(String));
  assert.ok(head(en).includes(IM.labels('es').ES));
  assert.ok(head(es).includes(IM.labels('en').ES));
});

test('exam-doc · modelos: cada documento con su letra y su semilla; proyectos distintos (AC8)', () => {
  const o = opts({ level: 'easy', seed: 90, parts: ['times', 'floats'], models: 3 });
  const docs = E.models(o, ctx).map((m) => E.document(m, o, ctx));
  assert.deepEqual(docs.map((d) => d.meta.letter), ['A', 'B', 'C']);
  assert.equal(new Set(docs.map((d) => d.meta.sdUsed)).size, 3);
  assert.equal(new Set(docs.map((d) => JSON.stringify(d.values))).size, 3);
});

test('exam-doc · la misma salida en otro proceso (AC1)', () => {
  const o = opts({ level: 'medium', seed: 2026, parts: ['stmt', 'roy', 'det', 'times', 'floats', 'tcl', 'rep'] });
  const here = JSON.stringify(make(o).d);
  const code = `const E=require(${JSON.stringify(path.join(__dirname, '../js/core/exam.js'))});const IM=require(${JSON.stringify(path.join(__dirname, '../js/i18n-moodle.js'))});`
    + 'const base=IM.tr("es");const tr=(k,p)=>(k.startsWith("exam.")?`⟦${k}⟧${p?JSON.stringify(p):""}`:base(k,p));'
    + `const ctx={lang:'es',nota:'en',labels:IM.labels('en'),tr};const o=${JSON.stringify(o)};`
    + 'process.stdout.write(JSON.stringify(E.document(Object.assign({letter:"A"},E.project(o,0,ctx)),o,ctx)));';
  assert.equal(execFileSync(process.execPath, ['-e', code], { maxBuffer: 64 * 1024 * 1024 }).toString(), here);
});
