'use strict';
// core/series: las series encadenadas de Moodle (spec f3e-probabilidad-montecarlo, AC16 y AC26; plan §0 y P7; análisis
// H4; T015). Ejemplos citados (constitución, 8): Ej. 6 de los apuntes (Mecánicas del Sureste, Tema 6a, 13 días) y
// Klastorin (Tema 6c), tres tiempos: camino crítico de las medias A–C–E–F, 23,83 y 8,25.
const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../js/core/examples.js');
const G = require('../js/core/generator.js');
const GR = require('../js/core/grade.js');
const P = require('../js/core/project.js');
const C = require('../js/core/cpm.js');
const U = require('../js/core/urlstate.js');
const M = require('../js/core/moodle.js');
const PG = require('../js/core/probgen.js');
const TLc = require('../js/core/tcl.js');
const SG = require('../js/core/stmtgen.js');
const CX = require('../js/core/contexts.js');
const S = require('../js/core/series.js');
const X = require('./xml-check.js');

const tr = (k, p) => (p ? `${k}${JSON.stringify(p)}` : k);
const LABELS = { ES: 'ES', EF: 'EF', LS: 'LS', LF: 'LF', TF: 'TF', FF: 'FF', IF: 'IF', SF: 'SF', TE: 'TE', TL: 'TL' };
const ctx = (extra) => Object.assign({ labels: LABELS, lang: 'es', nota: 'en', sf: false }, extra || {});
const OPTS = (o) => Object.assign({ lang: 'es', nota: 'en', sf: false, labels: LABELS, level: 'medium', count: 2, seed: 2026 }, o);
const DET = M.STAGES;
const TCL = ['tclMoments', 'tclPath', 'tclProb', 'tclRoute'];
const ALL = ['stmt', ...DET, 'minDummy', 'succ', ...TCL];
const part = (st) => `series.part{"name":"stage.${st}"}`;
const r2 = (v) => Math.round(v * 100) / 100;

// Los bloques de cada parte (entre títulos h): { título: [bloques] }, y la cabecera (lo de antes del primero).
function parts(q) {
  const out = { head: [] }; let cur = 'head';
  for (const b of q.text) { if (b.h) { cur = b.h; out[cur] = []; } else out[cur].push(b); }
  return out;
}
// Todas las casillas de unos bloques: { key: casilla }.
function cells(blocks) {
  const out = {};
  const cell = (c) => { if (c && typeof c === 'object' && 'key' in c) out[c.key] = c; };
  for (const b of blocks) { if (b.hole) cell(b.hole); if (b.table) b.table.rows.forEach((r) => r.forEach(cell)); }
  return out;
}
const accepts = (c, v) => ('num' in c ? [{ v: c.num, tol: c.tol || 0 }] : c.nums).some((a) => Math.abs(v - a.v) <= a.tol + 1e-9);
const heads = (blocks) => blocks.filter((b) => b.table).map((b) => b.table.head);
const ej6 = () => S.fromRows(E.get('ej6').rows, E.get('ej6').mode);
const kl = () => S.fromTcl(PG.fromExample('kl'));
// La primera semilla de un nivel con la que una serie de esas etapas vale.
function firstSeries(stages, level, from, o) {
  for (let s = from || 1; s < (from || 1) + 400; s++) {
    const b = S.exercise(stages, level, s);
    const q = b && S.question(stages, b, ctx(o), tr);
    if (q) return { b, q, s };
  }
  return null;
}

test('T015: las etapas admitidas, sus códigos y el orden de la serie (el enunciado primero; después, el de STAGES_ALL)', () => {
  assert.deepEqual(S.ADMITTED, ALL);
  assert.deepEqual(S.ADMITTED.slice(1), M.STAGES_ALL.filter((s) => s !== 'stmt' && ALL.includes(s)));
  assert.deepEqual(ALL.map((s) => S.CODE[s]), ['0', '1', '2', '3', '4a', '4b', '5', '6', '7', '8', '11', '12', '13', '14']);
  // Los códigos son los números de los nombres de las etapas en el exportador.
  const IM = require('../js/i18n-moodle.js');
  for (const s of ALL) assert.ok(IM.tr('es')(`stage.${s}`).startsWith(`${S.CODE[s]} · `), s);
  assert.deepEqual(S.order(['tclProb', 'early', 'succ', 'stmt', 'early']), ['stmt', 'early', 'succ', 'tclProb']);
  for (const bad of ['immPred', 'detective', 'mcRead', 'mcDisc', 'mcRep', 'nada']) assert.throws(() => S.order(['early', bad]), RangeError, bad);
  assert.throws(() => S.order([]), RangeError);
  assert.throws(() => S.runner(OPTS({ stages: ['early'], level: 'custom' }), tr), RangeError);
});

test('T015 · Ej. 6 por las siete etapas de cálculo: la tabla una vez arriba; cada parte, solo sus huecos, con los valores del tema', () => {
  const q = S.question(DET, ej6(), ctx(), tr);
  const p = parts(q);
  assert.deepEqual(Object.keys(p), ['head', ...DET.map(part)]);
  assert.deepEqual(p.head.map((b) => b.p).filter(Boolean), ['series.intro', 'series.table']);
  assert.deepEqual(heads(p.head), [['col.act', 'col.dur', 'col.preds']]);
  // Ninguna parte repite la tabla ni da los resultados de otra (sin ES/EF en la 2, sin tiempos en la 3…).
  assert.deepEqual(heads(p[part('late')]), [['col.act', 'LS', 'LF']]);
  assert.deepEqual(heads(p[part('floats')]), [['col.act', 'TF', 'FF', 'IF']]);
  assert.deepEqual(heads(p[part('critAct')]), [['col.act', 'col.crit']]);
  assert.deepEqual(heads(p[part('critPath')]), []);
  for (const st of DET) for (const h of heads(p[part(st)])) assert.ok(!h.includes('col.dur') && !h.includes('col.preds'), st);
  const L = 'A B C D E F G H I J K'.split(' ');
  const map = (vals) => Object.fromEntries(L.map((id, i) => [id, vals[i]]));
  const ES = map([0, 0, 0, 0, 3, 3, 3, 7, 7, 9, 12]); const LF = map([3, 3, 5, 12, 7, 7, 7, 12, 9, 12, 13]);
  const D = map([2, 3, 2, 8, 4, 3, 2, 1, 2, 3, 1]);
  const TF = map([1, 0, 3, 4, 0, 1, 2, 4, 0, 0, 0]); const FF = map([1, 0, 1, 4, 0, 1, 2, 4, 0, 0, 0]); const IF = map([1, 0, 1, 4, 0, 1, 0, 4, 0, 0, 0]);
  const c = cells(q.text);
  assert.equal(c['1:dur'].num, 13);
  for (const id of L) {
    assert.equal(c[`1:${id}.ES`].num, ES[id]); assert.equal(c[`1:${id}.EF`].num, ES[id] + D[id]);
    assert.equal(c[`2:${id}.LF`].num, LF[id]); assert.equal(c[`2:${id}.LS`].num, LF[id] - D[id]);
    assert.equal(c[`3:${id}.TF`].num, TF[id]); assert.equal(c[`3:${id}.FF`].num, FF[id]); assert.equal(c[`3:${id}.IF`].num, IF[id]);
    assert.equal(c[`4a:${id}.crit`].yesNo, ['B', 'E', 'I', 'J', 'K'].includes(id), id);
    assert.equal(c[`1:${id}.ES`].tol, undefined);   // sin TCL, exactos (enteros)
  }
  // 4b: casillas en vertical; el crítico suma 100, los demás restan.
  const mr = c['4b:paths'];
  assert.equal(mr.vertical, true);
  assert.deepEqual(mr.mr.filter((o) => !o.fraction.startsWith('-')).map((o) => [o.label, o.fraction]), [['B – E – I – J – K', '100']]);
  assert.ok(mr.mr.filter((o) => o.fraction.startsWith('-')).length >= M.MIN_DISTRACTORS);
  // 5 y 6: la red por sus arcos una vez (en la 5), sin duraciones; 9 sucesos y 3 ficticias, con los tiempos del tema.
  assert.deepEqual(heads(p[part('evEarly')])[0], ['col.arc', 'col.from', 'col.to']);
  assert.equal(p[part('evEarly')].find((b) => b.table).table.rows.filter((r) => String(r[0]).startsWith('dummy')).length, 3);
  assert.deepEqual(heads(p[part('evLate')]), [['col.event', 'TL', 'col.slack']]);
  const times = [[0, 0], [3, 3], [3, 3], [3, 5], [7, 7], [7, 7], [9, 9], [12, 12], [13, 13]];
  times.forEach(([te, tl], i) => { assert.equal(c[`5:e${i + 1}.TE`].num, te); assert.equal(c[`6:e${i + 1}.TL`].num, tl); assert.equal(c[`6:e${i + 1}.slack`].num, tl - te); });
  // Cada casilla tiene su respuesta en q.answers, con la clave de su parte.
  assert.deepEqual(Object.keys(q.answers).sort(), Object.keys(c).sort());
  assert.equal(q.answers['1:dur'], 13);
  // Modelo: una sola pregunta cloze, su categoría (sin nivel: es un ejemplo) y la solución por partes.
  assert.equal(q.stage, 'series');
  assert.deepEqual(q.stages, DET);
  assert.equal(q.qtype, 'cloze');
  assert.deepEqual(q.category, ['root', 'series.cat', '1-2-3-4a-4b-5-6']);
  assert.equal(q.seed, null);
  assert.deepEqual(q.general.filter((b) => b.strong).map((b) => b.strong), ['sol.title', ...DET.map(part)]);
  assert.equal(q.general[1].p, 'series.solNote');
  assert.equal(q.links.ex, null);
  assert.equal(U.decode(q.links.step.slice(q.links.step.indexOf('#'))).state.v, 'route');
  const xml = M.toXml({ seed: 1, questions: [q] }, tr);
  assert.deepEqual(X.check(xml), { ok: true });
  assert.ok(xml.includes(`<h4>${part('early')}</h4>`));
  assert.ok(xml.includes('{1:MULTIRESPONSE:') && xml.includes('{1:NUMERICAL:=13:0}'));
});

test('T015 · AC26: con una etapa del TCL, tiempos, holguras y caminos con las medias (dos decimales y exactas, ±0,01); Klastorin', () => {
  const base = kl();
  const st = ['early', 'late', 'floats', 'critAct', 'critPath', 'tclPath'];
  const q = S.question(st, base, ctx(), tr);
  const p = parts(q);
  assert.deepEqual(heads(p.head), [['col.act', 'col.preds', 'a', 'm', 'b']]);
  assert.deepEqual(p.head.map((b) => b.p).filter(Boolean), ['series.intro', 'series.tableTcl', 'series.means']);
  for (const s of ['early', 'late', 'floats', 'critAct', 'critPath']) assert.equal(p[part(s)][0].p, 'series.withMeans', s);
  // Oráculo: la F1 con las medias como duraciones (con decimales), exactas y a dos decimales.
  const rows = base.tcl.rows;
  const te = (r) => (r.a + 4 * r.m + r.b) / 6;
  const solve = (f) => C.solve(P.parse(rows.map((r) => ({ id: r.id, duration: String(f(r)), links: r.preds.join(', ') })), 'pred').project);
  const exact = solve(te); const two = solve((r) => r2(te(r)));
  const c = cells(q.text);
  for (const r of rows) {
    for (const [k, f] of [['1', 'ES'], ['1', 'EF'], ['2', 'LS'], ['2', 'LF']]) {
      const h = c[`${k}:${r.id}.${f}`];
      assert.ok(h.nums.every((a) => a.tol === 0.01), `${r.id}.${f}`);
      assert.ok(accepts(h, exact.times[r.id][f]) && accepts(h, two.times[r.id][f]), `${r.id}.${f}`);
      assert.ok(!accepts(h, two.times[r.id][f] + 0.03), `${r.id}.${f}`);
    }
    assert.ok(accepts(c[`3:${r.id}.TF`], exact.floats[r.id].TF) && accepts(c[`3:${r.id}.TF`], two.floats[r.id].TF), r.id);
  }
  assert.ok(accepts(c['1:dur'], 23.83) && accepts(c['1:dur'], 143 / 6));
  assert.deepEqual(Object.entries(c).filter(([k, h]) => k.startsWith('4a:') && h.yesNo).map(([k]) => k), ['4a:A.crit', '4a:C.crit', '4a:E.crit', '4a:F.crit']);
  assert.deepEqual(c['4b:paths'].answer, ['A – C – E – F']);
  assert.equal(c['12:path'].answer, 'A – C – E – F');
  assert.ok(accepts(c['12:mu'], 23.83) && accepts(c['12:var'], 8.25));
  // La 12 no da las medias (son de la 11): solo el camino, μ y σ².
  assert.deepEqual(heads(p[part('tclPath')]), []);
  assert.equal(p[part('tclPath')][0].p, 'series.ask.tclPath');
  assert.ok(q.general.some((b) => b.p === 'series.solMeans'));
  // La solución, a dos decimales.
  const sol = q.general.slice(q.general.findIndex((b) => b.strong === part('early')));
  assert.deepEqual(sol[1].table.rows.find((r) => r[0] === 'F'), ['F', '19,5', '23,83']);
  // Con los datos a dos decimales el camino de las medias tiene que ser el mismo (como la 12 suelta, T014): si no, null.
  const row = (id, a, m, bb, preds) => ({ id, a, m, b: bb, preds: preds || [] });
  const xyz = { kind: 'tcl', level: 'example', sd: null, rows: [row('X', 3, 4, 6), row('Y', 3, 4, 6, ['X']), row('Z', 6, 8, 12), row('W', 1, 1, 1)], deadline: 9, prob: 0.9, route: null };
  assert.equal(S.question(['tclProb'], S.fromTcl(xyz), ctx(), tr), null);
  assert.notEqual(S.question(['tclMoments'], S.fromTcl(xyz), ctx(), tr), null);
  xyz.rows[2] = row('Z', 6, 8, 13);
  assert.notEqual(S.question(['tclProb'], S.fromTcl(xyz), ctx(), tr), null);
  // Una serie del TCL pide un proyecto con a, m y b.
  assert.throws(() => S.question(['tclMoments'], ej6(), ctx(), tr));
  assert.equal(S.question(['tclProb'], S.fromTcl(PG.fromExample('tr', { route: true })), ctx(), tr), null);
});

test('T015 · AC26: con las medias, las de dos decimales y las exactas pueden diferir en más de 0,01 (valen las dos); si no dan las mismas críticas, la tabla no vale', () => {
  const st = ['early', 'floats', 'critAct', 'tclMoments'];
  const b = S.exercise(st, 'hard', 5);
  const c = cells(S.question(st, b, ctx(), tr).text);
  const te = (r) => (r.a + 4 * r.m + r.b) / 6;
  const solve = (f) => C.solve(P.parse(b.tcl.rows.map((r) => ({ id: r.id, duration: String(f(r)), links: r.preds.join(', ') })), 'pred').project);
  const exact = solve(te).floats.F.TF; const two = solve((r) => r2(te(r))).floats.F.TF;
  assert.ok(Math.abs(exact - two) > 0.01);
  assert.ok(accepts(c['3:F.TF'], exact) && accepts(c['3:F.TF'], two));
  // Difícil 50: con las medias exactas y con las de dos decimales no salen las mismas actividades críticas.
  const b50 = S.exercise(st, 'hard', 50);
  assert.notEqual(b50, null);
  const solve50 = (f) => C.solve(P.parse(b50.tcl.rows.map((r) => ({ id: r.id, duration: String(f(r)), links: r.preds.join(', ') })), 'pred').project);
  assert.notDeepEqual(solve50(te).critical, solve50((r) => r2(te(r))).critical);
  assert.equal(S.question(st, b50, ctx(), tr), null);
  assert.notEqual(S.question(['early', 'floats'], S.exercise(['early', 'floats'], 'hard', 50), ctx(), tr), null);
});

test('T015 · AC26: sin etapas del TCL, con las duraciones de la tabla del generador (exactas)', () => {
  const b = S.exercise(['early', 'floats'], 'medium', 4321);
  assert.deepEqual(b.rows, G.generate(4321, G.LEVELS.medium).rows);
  assert.equal(b.tcl, null);
  const q = S.question(['early', 'floats'], b, ctx(), tr);
  const sol = GR.solve(P.parse(b.rows, 'pred').project).cpm;
  const c = cells(q.text);
  for (const id of b.rows.map((r) => r.id)) {
    assert.equal(c[`1:${id}.ES`].num, sol.times[id].ES); assert.equal(c[`1:${id}.EF`].num, sol.times[id].EF);
    assert.equal(c[`3:${id}.FF`].num, sol.floats[id].FF);
  }
  assert.equal(c['1:dur'].num, sol.duration);
  // Con el TCL, la misma tabla del generador con a, m y b de probgen (la misma semilla abre el mismo ejercicio).
  const t = firstSeries(['early', 'tclProb'], 'medium', 4321);
  assert.deepEqual(t.b.tcl, PG.candidate('tcl', t.s, 'medium', { route: false }).ex);
  assert.deepEqual(t.b.tcl.rows.map((r) => String(r.m)), G.generate(t.s, G.LEVELS.medium).rows.map((r) => r.duration));
});

test('T015 · H4: con el enunciado y el TCL, el enunciado da m y una tabla debajo da a y b, en un contexto en semanas', () => {
  const st = ['stmt', 'early', 'tclMoments'];
  let n = 0; let moved = 0;
  for (let s = 1; s <= 60; s++) {
    const b = S.exercise(st, 'medium', s);
    const q = b && S.question(st, b, ctx(), tr);
    if (!q) continue;
    n++;
    assert.equal(CX.CONTEXTS[q.cx].unit.many.es, 'semanas', s);
    const own = SG.contextOf(s, 'medium');
    if (CX.CONTEXTS[own].unit.many.es === 'semanas') assert.equal(q.cx, own, s); else moved++;
    const p = parts(q);
    assert.deepEqual(p.head.map((b2) => b2.p).filter(Boolean), ['series.intro', 'series.stmt', 'series.ab', 'series.means']);
    const quote = p.head.find((b2) => b2.quote).quote;
    assert.deepEqual(quote, SG.render(SG.compose(b.rows, 'medium', q.cx, s).def, 'es').split('\n').filter(Boolean));
    const ab = p.head.find((b2) => b2.table).table;
    assert.deepEqual(ab.head, ['col.act', ...b.tcl.rows.map((r) => r.id)]);
    assert.deepEqual(ab.rows, [['a', ...b.tcl.rows.map((r) => r.a)], ['b', ...b.tcl.rows.map((r) => r.b)]]);
    // Ni la tabla de precedencias ni las m: el enunciado da las m y la parte 0 pide las predecesoras.
    assert.equal(heads(p.head).length, 1);
    assert.deepEqual(heads(p[part('stmt')]), [['col.act', 'col.name', 'col.immPreds']]);
    assert.ok(Object.values(cells(p[part('stmt')])).every((c) => 'mr' in c));
  }
  assert.ok(n >= 40 && moved >= 5, `${n} ${moved}`);
  // Sin el TCL, el contexto de la semilla aunque vaya en días (el de la etapa 0 suelta).
  const days = Array.from({ length: 60 }, (_, i) => i + 1).find((s) => CX.CONTEXTS[SG.contextOf(s, 'medium')].unit.many.es === 'días'
    && S.exercise(['stmt', 'early'], 'medium', s) && S.question(['stmt', 'early'], S.exercise(['stmt', 'early'], 'medium', s), ctx(), tr));
  const q = S.question(['stmt', 'early'], S.exercise(['stmt', 'early'], 'medium', days), ctx(), tr);
  assert.equal(q.cx, SG.contextOf(days, 'medium'));
  assert.deepEqual(parts(q).head.map((b) => b.p).filter(Boolean), ['series.intro', 'series.stmt']);
  // Enlaces del enunciado (sin TCL ni cálculo): el mismo enunciado en M0, con su contexto.
  const only = S.question(['stmt'], S.exercise(['stmt'], 'medium', days), ctx(), tr);
  const st0 = U.decode(only.links.ex.slice(only.links.ex.indexOf('#'))).state;
  assert.equal(st0.v, 'm0'); assert.equal(st0.sd, days); assert.equal(st0.cx, only.cx);
});

test('T015 · sucesos: sin la parte 8, la tabla de arcos sale una vez; con la 8, ninguna (es su respuesta) y se usan sus sucesos', () => {
  const only6 = parts(S.question(['evLate'], ej6(), ctx(), tr));
  assert.deepEqual(heads(only6[part('evLate')]), [['col.arc', 'col.from', 'col.to'], ['col.event', 'TL', 'col.slack']]);
  const both = parts(S.question(['evEarly', 'evLate'], ej6(), ctx(), tr));
  assert.equal(both[part('evEarly')][0].p, 'series.ask.evNet');
  assert.equal(heads(both[part('evLate')]).length, 1);
  const q = S.question(['evEarly', 'evLate', 'succ', 'minDummy'], ej6(), ctx(), tr);
  const p = parts(q);
  assert.ok(!q.text.some((b) => b.table && b.table.head.includes('col.arc')));
  assert.equal(p[part('evEarly')][0].p, 'series.ask.evSucc');
  assert.ok(!p[part('evLate')].some((b) => b.p === 'series.ask.evSucc'));
  assert.deepEqual(heads(p[part('succ')]), [['col.event', 'col.arrives', 'col.leaves']]);
  const c = cells(q.text);
  assert.equal(c['7:dummies'].num, 3);   // Ej. 6: 3 ficticias (Tema 6a)
  // La 8 son los sucesos de la red de las reglas (los mismos que numeran la 5 y la 6).
  const net = GR.solve(P.parse(E.get('ej6').rows, 'pred').project).net;
  assert.deepEqual(Object.keys(c).filter((k) => k.startsWith('8:')).map((k) => Number(k.slice(3, k.indexOf('.')))),
    net.events.map((e) => e.n).filter((n) => [...net.arcs, ...net.dummies].some((x) => x.from === n)));
  assert.equal(Object.keys(c).filter((k) => k.startsWith('5:')).length, net.events.length);
});

test('T015 · TCL: la 13 y la 14 no dan μ ni σ²; z, P y el plazo valen con μ y σ² redondeadas al final o sumando las medias redondeadas', () => {
  const st = ['tclProb', 'tclRoute'];
  let found = 0;
  for (let s = 1; s < 3000 && found < 3; s++) {
    const b = S.exercise(st, 'medium', s);
    const q = b && S.question(st, b, ctx(), tr);
    if (!q) continue;
    const p = parts(q);
    assert.deepEqual(p[part('tclProb')].map((x) => x.p.replace(/\{.*$/, '')), ['series.ask.tclProb', 'ask.z', 'ask.p', 'ask.zp', 'ask.Tp']);
    assert.equal(p[part('tclRoute')][0].p, `series.ask.tclRoute{"route":"${b.tcl.route.join(' – ')}"}`);
    const s3 = PG.solve('tcl', b.tcl);
    const muA = r2(s3.mu); const vA = r2(s3.var);
    const muB = r2(s3.path.reduce((a, id) => a + r2(s3.acts[id].te), 0)); const vB = r2(s3.path.reduce((a, id) => a + r2(s3.acts[id].var), 0));
    const c = cells(q.text);
    for (const [mu, v] of [[muA, vA], [muB, vB]]) {
      const e = TLc.exam({ acts: [{ id: 'T', preds: [], dist: { kind: 'normal', mu, var: v } }] }, { deadline: b.tcl.deadline });
      assert.ok(accepts(c['13:z'], e.table.z2) && accepts(c['13:p'], e.table.p4) && accepts(c['13:p'], e.exact), s);
      const ep = TLc.exam({ acts: [{ id: 'T', preds: [], dist: { kind: 'normal', mu, var: v } }] }, { prob: b.tcl.prob });
      assert.ok(accepts(c['13:Tp'], ep.table.deadline) && accepts(c['13:zp'], ep.table.z2), s);
    }
    assert.ok(accepts(c['14:r.mu'], s3.route.mu) && accepts(c['14:r.var'], s3.route.var) && accepts(c['14:both'], s3.route.both), s);
    // La ruta, de las dos maneras (y «las dos» con la del camino crítico de la misma manera).
    const rB = TLc.exam({ acts: [{ id: 'T', preds: [], dist: { kind: 'normal', mu: r2(b.tcl.route.reduce((a, id) => a + r2(s3.acts[id].te), 0)), var: r2(b.tcl.route.reduce((a, id) => a + r2(s3.acts[id].var), 0)) } }] }, { deadline: b.tcl.deadline });
    const cB = TLc.exam({ acts: [{ id: 'T', preds: [], dist: { kind: 'normal', mu: muB, var: vB } }] }, { deadline: b.tcl.deadline });
    assert.ok(accepts(c['14:r.z'], rB.table.z2) && accepts(c['14:r.p'], rB.table.p4) && accepts(c['14:both'], cB.table.p4 * rB.table.p4), s);
    if (Math.abs(muA - muB) >= 0.01 || Math.abs(vA - vB) >= 0.01) found++;
  }
  assert.equal(found, 3);
  // Media 17 (la 13) y 357 (la 14): la z de una manera queda a más de 0,01 de la de la otra; valen las dos.
  for (const [s, key, z, sts] of [[17, '13:z', [1.8, 1.82], ['tclProb']], [357, '14:r.z', [1.71, 1.69], ['tclRoute']]]) {
    const q = S.question(sts, S.exercise(sts, 'medium', s), ctx(), tr);
    const c = cells(q.text)[key];
    assert.deepEqual(c.nums.map((a) => a.v), z, s);
    if (s === 357) {
      // «Las dos», con la z de la ruta de cada manera (por la tabla): Moodle lleva las dos respuestas.
      const both = cells(q.text)['14:both'].nums.map((a) => a.v);
      const ex = S.exercise(sts, 'medium', s).tcl;
      const s3 = PG.solve('tcl', ex);
      const nrm = (mu, v) => TLc.exam({ acts: [{ id: 'T', preds: [], dist: { kind: 'normal', mu, var: v } }] }, { deadline: ex.deadline }).table.p4;
      const pc = nrm(r2(s3.path.reduce((a, id) => a + r2(s3.acts[id].te), 0)), r2(s3.path.reduce((a, id) => a + r2(s3.acts[id].var), 0)));
      const pr = nrm(r2(ex.route.reduce((a, id) => a + r2(s3.acts[id].te), 0)), r2(ex.route.reduce((a, id) => a + r2(s3.acts[id].var), 0)));
      assert.ok(both.some((v) => Math.abs(v - pc * pr) < 1e-12), s);
    }
  }
});

test('T015: categoría Series/<etapas>/<nivel>, nombre, etiquetas y enlaces (los del TCL o los de las etapas de cálculo)', () => {
  const st = ['stmt', 'early', 'floats', 'tclMoments', 'tclPath', 'tclProb'];
  const { q, s } = firstSeries(st, 'medium', 2026);
  assert.deepEqual(q.category, ['root', 'series.cat', '0-1-3-11-12-13', 'level.medium']);
  assert.equal(q.name, `series.name 0-1-3-11-12-13 · level.medium · n=${q.n} · s=${s} · gv=${G.VERSION} · pg=${PG.VERSION} · sv=${SG.VERSION}`);
  assert.deepEqual(q.tags, ['pnl-series', 'series-0-1-3-11-12-13', 'level-medium', 'lang-es', `gv-${G.VERSION}`, `pg-${PG.VERSION}`, `sv-${SG.VERSION}`]);
  const ex = U.decode(q.links.ex.slice(q.links.ex.indexOf('#'))).state;
  assert.deepEqual([ex.v, ex.xk, ex.xm, ex.sd, ex.lv, ex.xo], ['ex', 'tcl', 'exam', s, 'medium', 0]);
  assert.equal(U.decode(q.links.step.slice(q.links.step.indexOf('#'))).state.um, 'm6');
  const r = firstSeries(['tclRoute'], 'easy', 1).q;
  assert.equal(U.decode(r.links.ex.slice(r.links.ex.indexOf('#'))).state.xo, 1);
  // Sin TCL: el ejercicio de «Ejercicios» con lo que piden las etapas de cálculo.
  const d = S.question(['early', 'floats', 'critPath'], S.exercise(['early'], 'hard', 77), ctx({ sf: true }), tr);
  const e = U.decode(d.links.ex.slice(d.links.ex.indexOf('#'))).state;
  assert.deepEqual([e.v, e.sd, e.lv, e.ask], ['ex', 77, 'hard', ['times', 'floats', 'sf', 'critical']]);
  assert.deepEqual(heads(parts(d)[part('floats')]), [['col.act', 'TF', 'FF', 'IF', 'SF']]);
  assert.deepEqual(d.category, ['root', 'series.cat', '1-3-4b', 'level.hard']);
  assert.deepEqual(d.tags, ['pnl-series', 'series-1-3-4b', 'level-hard', 'lang-es', `gv-${G.VERSION}`]);
});

for (const lv of M.LEVELS) {
  test(`T015 · AC16: N series de todas las etapas en su categoría, un proyecto cada una, sin semillas repetidas y XML bien formado · ${lv}`, () => {
    const o = OPTS({ stages: ALL, level: lv, count: 2, seed: 20261118 });
    const a = S.generate(o, tr);
    assert.deepEqual(a.missing, []);
    assert.equal(a.questions.length, 2);
    assert.equal(new Set(a.questions.map((q) => q.seed)).size, 2);
    for (const q of a.questions) {
      assert.deepEqual(q.category, ['root', 'series.cat', '0-1-2-3-4a-4b-5-6-7-8-11-12-13-14', `level.${lv}`]);
      assert.deepEqual(Object.keys(parts(q)), ['head', ...ALL.map(part)]);
      assert.equal(q.n, G.generate(q.seed, G.LEVELS[lv]).rows.length);
      const c = cells(q.text);
      assert.deepEqual(Object.keys(q.answers).sort(), Object.keys(c).sort());
      for (const h of Object.values(c)) if ('nums' in h) assert.ok(h.nums.length >= 1);
    }
    const xml = M.toXml(a, tr);
    assert.deepEqual(X.check(xml), { ok: true });
    assert.equal((xml.match(/<question type="category">/g) || []).length, 1);
    assert.ok(!/NaN|undefined|Infinity/.test(xml));
    // El mismo banco con cualquier reparto de pasos.
    const r = S.runner(o, tr);
    while (!r.step(3).done);
    assert.equal(M.toXml(r.result(), tr), xml);
  });
}

test('T015: el tope de intentos es triesPer × series × SERIES_MULT; lo que falta va en missing', () => {
  assert.deepEqual(S.SERIES_MULT, { tclRoute: 20, tcl: 3, base: 1 });
  const few = S.generate(OPTS({ stages: ['early'], level: 'easy', count: 5, triesPer: 1, seedMax: 3 }), tr);
  assert.ok(few.questions.length <= 3);
  assert.deepEqual(few.missing, [{ stage: 'series', stages: ['early'], level: 'easy', made: few.questions.length, wanted: 5 }]);
  assert.deepEqual([['early', 'stmt'], ['early', 'tclMoments'], ['tclProb', 'tclRoute']].map(S.multOf), [1, 3, 20]);
  // Las semillas 1 y 2 de fácil no tienen la otra ruta: se agotan los 1 × 1 × 20 intentos, contando los repetidos.
  let n = 1;
  const r = S.runner(OPTS({ stages: ['tclRoute'], level: 'easy', count: 1, triesPer: 1, seed: 5, seedMax: 2 }), tr);
  while (!r.step(1).done) n++;
  assert.equal(n, 20);
  assert.equal(r.result().missing[0].made, 0);
  const count = S.runner(OPTS({ stages: ['early'], count: 999 }), tr).step(0);
  assert.equal(count.total, M.MAX_COUNT);
});

test('T015: series en español y en inglés con los textos de i18n-moodle, sin claves ni parámetros sin sustituir (bloque 3)', () => {
  const IM = require('../js/i18n-moodle.js');
  const I = require('../js/i18n.js');
  for (const lang of ['es', 'en']) {
    const t = IM.tr(lang);
    for (const stages of [ALL, DET.concat('succ'), ['stmt', 'early', 'critPath', 'tclRoute']]) {
      const bank = S.generate({ lang, nota: lang, sf: true, labels: IM.labels(lang), stages, level: 'medium', count: 1, seed: 11 }, t);
      assert.equal(bank.questions.length, 1);
      const xml = M.toXml(bank, t);
      assert.deepEqual(X.check(xml), { ok: true });
      const words = xml.replace(/href="[^"]*"/g, '').replace(/<tags>.*?<\/tags>/g, '');
      assert.ok(!/(^|[^\w.])(series|stem|col|sol|ask|stage|level|link)\.[a-z]/i.test(words.replace(/<name>.*?<\/name>/g, '')), lang);
      assert.ok(!/\{(name|route|T|pct|path|mu|var|sd|z|p|pe|zp|zpe|Tp|pc|pr|both|n|acts|paths|dur)\}/.test(words), lang);
      const other = lang === 'es' ? ['Activity', 'Part ', 'weeks', 'Solution', 'Every part'] : ['Actividad', 'Parte ', 'semanas', 'Solución', 'Todas las partes'];
      for (const w of other) assert.ok(!words.includes(w), `${lang}: ${w}`);
    }
  }
  const keys = (o, pre) => Object.entries(o).flatMap(([k, v]) => (v && typeof v === 'object' ? keys(v, `${pre}${k}.`) : [`${pre}${k}`]));
  assert.deepEqual(keys(I.dict.es.mq.series, '').sort(), keys(I.dict.en.mq.series, '').sort());
  assert.equal(I.t('es', 'mq.series.part', { name: '3 · Holguras' }), 'Parte 3 · Holguras');
});
