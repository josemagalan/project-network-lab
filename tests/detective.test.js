'use strict';
// core/detective — errores sembrados en una red ya hecha y su corrección (spec f3d-construir-detectar, AC9–AC11 y AC20;
// plan §0 y §3, P5, P6, H2 y H9). Ejemplo de referencia: el Ejercicio 6 de los apuntes (J. M. Galán, Gestión de
// Proyectos, UBU, Tema 6a y hoja de ejercicios del Tema 6, ejercicio 6), con los tiempos y holguras de los apuntes
// (examples.js, expected). Oráculos: core/roycheck y core/aoacheck para la red; los tiempos de los apuntes y cpm para
// los cálculos; el criterio del prototipo de clarify (spikes/f3d-construir-detectar/sembrado.js) para los tipos admisibles.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const P = require('../js/core/project.js');
const E = require('../js/core/examples.js');
const G = require('../js/core/generator.js');
const C = require('../js/core/cpm.js');
const A = require('../js/core/aoa.js');
const K = require('../js/core/aoacheck.js');
const RC = require('../js/core/roycheck.js');
const D = require('../js/core/detective.js');

const ex6 = E.get('ej6');
const p6 = P.parse(ex6.rows, ex6.mode).project;
const X = ex6.expected;
const ROY = ['royMissing', 'royFalse', 'royInverted', 'royCycle'];
const PERT = ['pertFalseDummy', 'pertMissingDummy', 'pertInvertedDummy', 'pertParallel'];
const CALC = { aon: ['calcES', 'calcLF', 'calcFloat', 'calcCrit'], aoa: ['calcTE', 'calcTL', 'calcSlack', 'calcCrit'] };
const group = (graph, kind) => [...(kind === 'calc' ? [] : graph === 'aon' ? ROY : PERT), ...(kind === 'net' ? [] : CALC[graph])];
const els = (type) => D.candidates(p6, type.startsWith('roy') || ['calcES', 'calcLF', 'calcFloat'].includes(type) ? 'aon' : 'aoa', type);

// ---------- Ejercicio 6, comprobado a mano con los tiempos de los apuntes ----------

test('T004 · Ejercicio 6: cálculos que admiten su error típico, con el valor erróneo y el bueno de los apuntes', () => {
  // ES con el mínimo: E (A 2, B 3), G (B 3, C 2), H (E 7, F 6), I (E 7, F 6, G 5) y K (D 8, H 8, J 12).
  assert.deepEqual(els('calcES').map((c) => [c.element, c.wrong, c.right]),
    [['E.ES', 2, 3], ['G.ES', 2, 3], ['H.ES', 6, 7], ['I.ES', 5, 7], ['K.ES', 8, 12]]);
  for (const c of els('calcES')) assert.equal(c.right, X.ES[c.element[0]]);
  // LF con el máximo: B (LS de E 3, F 4, G 5), E y F (LS de H 11, I 7).
  assert.deepEqual(els('calcLF').map((c) => [c.element, c.wrong, c.right]), [['B.LF', 5, 3], ['E.LF', 11, 7], ['F.LF', 11, 7]]);
  // Holgura total como LF − ES: todas (ninguna dura 0); K: 13 − 12 = 1 frente a 0.
  assert.equal(els('calcFloat').length, 11);
  assert.deepEqual(els('calcFloat').find((c) => c.element === 'K.TF'), { element: 'K.TF', accept: ['K.TF'], wrong: 1, right: 0 });
  assert.deepEqual(els('calcCrit').filter((c) => c.right).map((c) => c.element), X.critical.map((a) => `${a}.crit`));
});

test('T004 · Ejercicio 6: sucesos de la PERT de las reglas con su error típico (TE, TL y holgura)', () => {
  // Red de las reglas (M2): A 1-3, B 1-2, C 1-4, D 1-8, E 3-5, F 2-5, G 4-6, H 5-8, I 6-7, J 7-8, K 8-9 y F1 2-3, F2 2-4, F3 5-6.
  assert.deepEqual(D.candidates(p6, 'aoa', 'calcTE').map((c) => [c.element, c.wrong, c.right]),
    [['e3.TE', 2, 3], ['e4.TE', 2, 3], ['e5.TE', 6, 7], ['e6.TE', 5, 7], ['e8.TE', 8, 12]]);
  assert.deepEqual(D.candidates(p6, 'aoa', 'calcTL').map((c) => [c.element, c.wrong, c.right]),
    [['e1.TL', 4, 0], ['e2.TL', 5, 3], ['e5.TL', 11, 7]]);
  assert.deepEqual(D.candidates(p6, 'aoa', 'calcSlack').map((c) => [c.element, c.wrong, c.right]), [['e4.slack', -2, 2]]);
});

test('T004 · Ejercicio 6: elementos de los errores de red y dónde se aceptan las marcas', () => {
  const miss = D.candidates(p6, 'aon', 'royMissing');
  assert.equal(miss.length, 14);
  assert.deepEqual(miss.find((c) => c.element === 'F>I').accept, ['F', 'I'], 'lo que falta, en cualquiera de sus extremos');
  assert.deepEqual(D.candidates(p6, 'aon', 'royInverted').find((c) => c.element === 'I>F').accept, ['I>F']);
  assert.ok(D.candidates(p6, 'aon', 'royFalse').some((c) => c.element === 'C>F'));
  assert.ok(D.candidates(p6, 'aon', 'royCycle').some((c) => c.element === 'J>E'), 'E → I → J y J → E');
  assert.ok(!D.candidates(p6, 'aon', 'royCycle').some((c) => c.element === 'I>E'), 'invertir una inmediata no es este tipo');
  assert.deepEqual(D.candidates(p6, 'aoa', 'pertMissingDummy').map((c) => [c.element, c.accept]),
    [['d:2-3', ['e2', 'e3']], ['d:2-4', ['e2', 'e4']], ['d:5-6', ['e5', 'e6']]]);
  assert.deepEqual(D.candidates(p6, 'aoa', 'pertInvertedDummy').map((c) => c.element), ['d:3-2', 'd:4-2', 'd:6-5']);
  assert.ok(D.candidates(p6, 'aoa', 'pertFalseDummy').some((c) => c.element === 'd:3-4'));
  assert.deepEqual(D.candidates(p6, 'aoa', 'pertParallel'), [], 'el Ejercicio 6 no tiene ficticias de identidad');
  assert.deepEqual(D.admissible(p6, 'aoa'), { pertFalseDummy: true, pertMissingDummy: true, pertInvertedDummy: true, pertParallel: false,
    calcTE: true, calcTL: true, calcSlack: true, calcCrit: true });
});

// ---------- tipos admisibles frente al criterio del prototipo ----------

function reach(nodes, edges) {
  const out = new Map(nodes.map((n) => [n, []]));
  for (const [a, b] of edges) out.get(a).push(b);
  const R = new Map();
  for (const s of nodes) { const seen = new Set(); const st = [...out.get(s)]; while (st.length) { const x = st.pop(); if (!seen.has(x)) { seen.add(x); st.push(...out.get(x)); } } R.set(s, seen); }
  return R;
}
function prototype(p) {      // sembrado.js de clarify, sin cambios de criterio
  const ids = p.activities.map((a) => a.id);
  const arcs = []; for (const b of ids) for (const a of p.preds[b]) arcs.push([a, b]);
  const R = reach(ids, arcs); const imm = new Set(arcs.map(([a, b]) => `${a}>${b}`));
  let unrelated = 0; let cyc = 0;
  for (const x of ids) for (const y of ids) if (x !== y && !R.get(x).has(y) && !R.get(y).has(x)) unrelated++;
  for (const x of ids) for (const y of R.get(x)) if (!imm.has(`${x}>${y}`)) cyc++;
  const net = A.build(p, { method: 'rules' });
  const evs = net.events.map((e) => e.n);
  const ER = reach(evs, [...net.arcs, ...net.dummies].map((e) => [e.from, e.to]));
  let f = 0; for (const u of evs) for (const v of evs) if (u !== v && !ER.get(u).has(v) && !ER.get(v).has(u)) f++;
  const dep = net.dummies.some((d) => d.rule !== 'equal'); const id = net.dummies.some((d) => d.rule === 'equal');
  return { royMissing: arcs.length > 0, royFalse: unrelated > 0, royInverted: arcs.length > 0, royCycle: cyc > 0,
    pertFalseDummy: f > 0, pertMissingDummy: dep, pertInvertedDummy: dep, pertParallel: id };
}

const TABLES = { easy: [], medium: [], hard: [] };
for (const lv of Object.keys(TABLES)) for (let s = 1; TABLES[lv].length < 200; s++) {
  const g = G.generate(s, G.LEVELS[lv]);
  if (g.ok) TABLES[lv].push({ sd: s, p: P.parse(g.rows, g.mode).project });
}

test('T004 · admissible coincide con el criterio del prototipo en 600 tablas (200 por nivel)', () => {
  for (const lv of Object.keys(TABLES)) for (const { p } of TABLES[lv]) {
    const want = prototype(p);
    const got = Object.assign({}, D.admissible(p, 'aon'), D.admissible(p, 'aoa'));
    for (const t of [...ROY, ...PERT]) assert.equal(got[t], want[t], `${lv} ${t}`);
  }
});

// ---------- sembrado ----------

function trueValues(p, graph) {
  const s = C.solve(p);
  const crit = new Set(s.critical);
  if (graph === 'aon') {
    return { acts: Object.fromEntries(p.activities.map((a) => [a.id, { ES: s.times[a.id].ES, EF: s.times[a.id].EF, LS: s.times[a.id].LS,
      LF: s.times[a.id].LF, TF: s.floats[a.id].TF, crit: crit.has(a.id) }])) };
  }
  const net = A.build(p, { method: 'rules' }); const t = A.times(net, s);
  return { events: Object.fromEntries(net.events.map((e) => [e.n, { TE: t.TE[e.n], TL: t.TL[e.n], slack: t.slack[e.n] }])),
    crit: Object.fromEntries(p.activities.map((a) => [a.id, crit.has(a.id)])) };
}
const cell = (values, element) => {
  const [who, f] = element.split('.');
  if (who.startsWith('e') && values.events) return values.events[who.slice(1)][f];
  if (values.acts) return values.acts[who][f];
  return values.crit[who];
};
const arcSet = (net) => new Set(net.arcs.map((a) => `${a.from}>${a.to}`));
const issueKey = (i) => `${i.code}:${i.ids.join(',')}`;

function checkSeeded(p, graph, kind, level, sd, res) {
  const n = { easy: 1, medium: 2, hard: 3 }[level];
  assert.equal(res.count, n);
  assert.equal(res.errors.length, n, 'tantos errores como dice el nivel (AC20)');
  const adm = D.admissible(p, graph);
  for (const e of res.errors) assert.ok(group(graph, kind).includes(e.type) && adm[e.type], `${e.type} admisible y del grupo`);
  const accepted = res.errors.flatMap((e) => e.accept);
  assert.equal(new Set(accepted).size, accepted.length, 'ningún error toca el elemento de otro');
  assert.deepEqual(res.skipped, group(graph, kind).filter((t) => !adm[t]));
  const netErr = res.errors.filter((e) => !e.type.startsWith('calc'));
  const calcErr = res.errors.filter((e) => e.type.startsWith('calc'));
  // Valores: los de la tabla verdadera salvo los sembrados (P6); sin cifras con solo errores de la red.
  if (kind === 'net') assert.equal(res.shown.values, null);
  else {
    const truth = trueValues(p, graph);
    const changed = new Set(calcErr.map((e) => e.element));
    for (const e of calcErr) {
      assert.equal(e.right, cell(truth, e.element));
      assert.equal(cell(res.shown.values, e.element), e.wrong);
      assert.notEqual(e.wrong, e.right, 'el error típico no puede dar el valor correcto');
    }
    const sections = graph === 'aon' ? Object.entries(truth.acts).flatMap(([id, v]) => Object.keys(v).map((f) => `${id}.${f}`))
      : [...Object.keys(truth.events).flatMap((k) => ['TE', 'TL', 'slack'].map((f) => `e${k}.${f}`)), ...Object.keys(truth.crit).map((id) => `${id}.crit`)];
    for (const el of sections) if (!changed.has(el)) assert.equal(cell(res.shown.values, el), cell(truth, el), `sin errores de más: ${el}`);
  }
  if (graph === 'aon') {
    const base = arcSet(RC.fromTable(p)); const want = new Set(base);
    for (const e of netErr) {
      const [x, y] = e.element.split('>');
      if (e.type === 'royMissing') want.delete(`${x}>${y}`);
      if (e.type === 'royFalse' || e.type === 'royCycle') want.add(`${x}>${y}`);
      if (e.type === 'royInverted') { want.delete(`${y}>${x}`); want.add(`${x}>${y}`); }
    }
    assert.deepEqual([...arcSet(res.shown.roy)].sort(), [...want].sort(), 'la red cambia solo en los errores');
    const r = RC.diagnose(p, res.shown.roy);
    const keys = new Set(r.issues.map(issueKey));
    let expected = 0;
    for (const e of netErr) {
      const [x, y] = e.element.split('>');
      if (e.type === 'royMissing') { assert.ok(keys.has(`missingPrecedence:${x},${y}`)); expected++; }
      if (e.type === 'royFalse') { assert.ok(keys.has(`falsePrecedence:${x},${y}`)); expected++; }
      if (e.type === 'royInverted') { assert.ok(keys.has(`inverted:${y},${x}`)); expected++; }
      if (e.type === 'royCycle') {
        assert.ok(keys.has(`falsePrecedence:${x},${y}`));
        assert.ok(r.issues.some((i) => i.code === 'cycle' && i.nodes.includes(x) && i.nodes.includes(y)));
        expected += 2;
      }
    }
    assert.equal(r.issues.length, expected, 'roycheck no ve ningún error de más');
  } else {
    const rules = A.build(p, { method: 'rules' });
    if (kind === 'calc') assert.deepEqual(res.shown.pert.arcs, rules.arcs);
    if (netErr.length) {
      const r = K.diagnose(res.shown.pert, p);
      assert.equal(r.ok, false);
      for (const e of netErr.filter((x) => x.type === 'pertParallel')) assert.ok(r.problems.some((q) => q.code === 'parallel' && e.accept.every((a) => q.ids.includes(a))));
      for (const e of netErr.filter((x) => x.type !== 'pertParallel')) {
        const [u, v] = e.element.slice(2).split('-').map(Number);
        const has = res.shown.pert.dummies.some((d) => d.from === u && d.to === v);
        assert.equal(has, e.type !== 'pertMissingDummy', e.element);
      }
    } else assert.equal(K.diagnose(res.shown.pert, p).problems.filter((q) => q.code !== 'unnecessaryDummy').length, 0);
  }
}

test('T004 · AC20 y P6: sembrado en 200 tablas por nivel, ROY y PERT, de la red, de cálculo y todos', () => {
  const stats = {};
  for (const lv of Object.keys(TABLES)) for (const { sd, p } of TABLES[lv]) for (const graph of ['aon', 'aoa']) for (const kind of ['net', 'calc', 'all']) {
    const res = D.seed(p, { sd, level: lv, graph, kind });
    const k = `${lv}/${graph}/${kind}`; stats[k] = stats[k] || { ok: 0, none: 0 };
    if (!res) { stats[k].none++; continue; }
    stats[k].ok++;
    checkSeeded(p, graph, kind, lv, sd, res);
  }
  // Solo la PERT con errores de la red puede quedarse sin tipos (el 19,9 % de las fáciles, H2); el resto siempre siembra.
  for (const [k, v] of Object.entries(stats)) if (!k.endsWith('aoa/net')) assert.equal(v.none, 0, k);
  assert.ok(stats['easy/aoa/net'].none > 0 && stats['easy/aoa/net'].none < 80, JSON.stringify(stats['easy/aoa/net']));
});

test('T004 · AC10: la misma semilla siembra lo mismo, y el generador de la F3a no cambia', () => {
  const before = JSON.stringify(G.generate(77, G.LEVELS.hard));
  const { sd, p } = TABLES.hard[5];
  for (const graph of ['aon', 'aoa']) {
    const a = D.seed(p, { sd, level: 'hard', graph, kind: 'all' });
    const b = D.seed(p, { sd, level: 'hard', graph, kind: 'all' });
    assert.deepEqual(a, b);
    assert.deepEqual(JSON.parse(JSON.stringify(a)), a, 'se puede guardar y recuperar como JSON');
  }
  assert.equal(JSON.stringify(G.generate(77, G.LEVELS.hard)), before);
  const other = D.seed(p, { sd: sd + 1, level: 'hard', graph: 'aon', kind: 'all' });
  assert.notDeepEqual(other.errors, D.seed(p, { sd, level: 'hard', graph: 'aon', kind: 'all' }).errors, 'otra semilla, otros errores');
});

test('T004 · «Personalizar» siembra 2; count explícito manda', () => {
  const { sd, p } = TABLES.medium[3];
  assert.equal(D.seed(p, { sd, level: 'custom', graph: 'aon', kind: 'all' }).errors.length, 2);
  assert.equal(D.seed(p, { sd, level: 'easy', graph: 'aon', kind: 'all', count: 3 }).errors.length, 3);
});

test('T004 · H2: una tabla sin ningún tipo del grupo pide la de la semilla siguiente, y lo dice', () => {
  const bad = TABLES.easy.find(({ sd, p }) => !D.seed(p, { sd, level: 'easy', graph: 'aoa', kind: 'net' }));
  assert.ok(bad, 'hay tablas fáciles sin errores posibles en la red PERT');
  const r = D.forSeed(G.LEVELS.easy, bad.sd, { level: 'easy', graph: 'aoa', kind: 'net' });
  assert.ok(r.sd > bad.sd && r.moved === true);
  const g = G.generate(r.sd, G.LEVELS.easy);
  assert.deepEqual(r.rows, g.rows);
  assert.ok(r.seeded && r.seeded.errors.length === 1);
  for (let s = bad.sd + 1; s < r.sd; s++) {
    const q = G.generate(s, G.LEVELS.easy);
    assert.ok(!q.ok || !D.seed(P.parse(q.rows, q.mode).project, { sd: s, level: 'easy', graph: 'aoa', kind: 'net' }), 'la primera que admite');
  }
  const same = D.forSeed(G.LEVELS.easy, r.sd, { level: 'easy', graph: 'aoa', kind: 'net' });
  assert.deepEqual([same.sd, same.moved], [r.sd, false]);
  assert.deepEqual(same.seeded, r.seeded, 'la semilla usada reproduce lo mismo');
});

// ---------- corrección (AC9) ----------

test('T004 · AC9: encontrado, a medias, no encontrado y falsa alarma; nota 1, ½ y −½ sin bajar de 0', () => {
  const seeded = { count: 3, errors: [
    { id: 1, type: 'royMissing', element: 'F>I', accept: ['F', 'I'] },
    { id: 2, type: 'calcES', element: 'K.ES', accept: ['K.ES'], wrong: 8, right: 12 },
    { id: 3, type: 'royInverted', element: 'I>E', accept: ['I>E'] },
  ] };
  let g = D.grade(seeded, [{ element: 'I', type: 'royMissing' }, { element: 'K.ES', type: 'calcLF' }, { element: 'A>E', type: 'royFalse' }]);
  assert.deepEqual(g.perError.map((x) => x.status), ['found', 'half', 'missed']);
  assert.deepEqual(g.falseAlarms, [{ element: 'A>E', type: 'royFalse' }]);
  assert.equal(g.score, 100 * (1 + 0.5 - 0.5) / 3);
  // Lo que falta, marcado en los dos extremos: uno lo encuentra y el otro no es falsa alarma.
  g = D.grade(seeded, [{ element: 'F', type: 'royMissing' }, { element: 'I', type: 'royMissing' }]);
  assert.deepEqual([g.perError[0].status, g.falseAlarms.length], ['found', 0]);
  // Encontrado gana a medias en el mismo error.
  g = D.grade(seeded, [{ element: 'F', type: 'royFalse' }, { element: 'I', type: 'royMissing' }]);
  assert.equal(g.perError[0].status, 'found');
  // Todo encontrado: 100; muchas falsas alarmas: 0.
  assert.equal(D.grade(seeded, [{ element: 'F', type: 'royMissing' }, { element: 'K.ES', type: 'calcES' }, { element: 'I>E', type: 'royInverted' }]).score, 100);
  assert.equal(D.grade(seeded, ['A', 'B', 'C', 'D', 'E', 'G', 'H'].map((x) => ({ element: x, type: 'royMissing' }))).score, 0);
  assert.equal(D.grade(seeded, []).score, 0);
});

// ---------- explicaciones (AC11) ----------

test('T004 · AC11: cada error sembrado tiene su explicación (clave y datos)', () => {
  const seen = new Set();
  for (const lv of Object.keys(TABLES)) for (const { sd, p } of TABLES[lv].slice(0, 60)) for (const graph of ['aon', 'aoa']) {
    const res = D.seed(p, { sd, level: lv, graph, kind: 'all' });
    for (const e of res.errors) {
      const x = D.explain(e);
      assert.equal(x.key, `det.${e.type}`);
      assert.equal(x.params.element, e.element);
      for (const v of Object.values(x.params)) assert.notEqual(v, undefined);
      if (e.type.startsWith('calc')) assert.deepEqual([x.params.wrong, x.params.right], [e.wrong, e.right]);
      seen.add(e.type);
    }
  }
  for (const t of [...ROY, ...PERT, ...CALC.aon, ...CALC.aoa]) assert.ok(seen.has(t), `sale alguna vez: ${t}`);
});

test('T004 · el núcleo del detective no usa Math.random', () => {
  const src = fs.readFileSync(path.join(__dirname, '../js/core/detective.js'), 'utf8');
  assert.ok(!/Math\.random/.test(src));
});
