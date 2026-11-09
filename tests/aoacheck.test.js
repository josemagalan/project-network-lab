'use strict';
// core/aoacheck: diagnóstico de cualquier red PERT y ficticias que se pueden quitar (spec f2b-metodos-reto,
// T003; AC6, AC10 y AC11). Referencias independientes: tests/oracle-mindummy.js y tests/oracle-removable.js.
const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../js/core/project.js');
const E = require('../js/core/examples.js');
const A = require('../js/core/aoa.js');
const M = require('../js/core/mindummy.js');
const K = require('../js/core/aoacheck.js');
const OM = require('./oracle-mindummy.js');
const OR = require('./oracle-removable.js');

const load = (rows, mode = 'succ', opts) => {
  const { project, report } = P.parse(rows, mode, opts);
  assert.ok(project, JSON.stringify(report));
  return project;
};
const loadEx = (id) => { const ex = E.get(id); return load(ex.rows, ex.mode, { structureOnly: !!ex.structureOnly }); };
const fromSucc = (succ) => load(Object.keys(succ).map((id) => ({ id, duration: '1', links: succ[id].join(', ') })));
const succOf = (p) => Object.fromEntries(p.activities.map((a) => [a.id, [...p.succs[a.id]]]));
function rng(seed) { let s = seed >>> 0; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; }
function randomSucc(rand, n) {
  const ids = Array.from({ length: n }, (_, i) => `A${i + 1}`);
  return Object.fromEntries(ids.map((id, i) => [id, ids.slice(i + 1, i + 7).filter(() => rand() < 0.35)]));
}
// AoaNet (sucesos 1..N) → red del oráculo (sucesos 0..N−1), y al revés como red del alumno.
const toOracle = (net) => ({ nodes: net.events.length, arcs: net.arcs.map((e) => ({ act: e.act, from: e.from - 1, to: e.to - 1 })),
  dummies: net.dummies.map((d) => ({ from: d.from - 1, to: d.to - 1 })) });
const toStudent = (o) => ({ events: Array.from({ length: o.nodes }, (_, i) => ({ id: i, n: null })),
  arcs: o.arcs.map((e) => ({ ...e })), dummies: o.dummies.map((d) => ({ ...d })) });
const codes = (r) => r.problems.map((x) => x.code);

// Ejercicio 6 en forma de red del alumno, numerada como la de las reglas.
const ej6 = () => {
  const net = A.build(loadEx('ej6'));
  return { events: net.events.map((e) => ({ id: `s${e.n}`, n: e.n })),
    arcs: net.arcs.map((e) => ({ act: e.act, from: `s${e.from}`, to: `s${e.to}` })),
    dummies: net.dummies.map((d) => ({ from: `s${d.from}`, to: `s${d.to}` })) };
};

test('referencia: las redes de los seis ejercicios del autor (Tema 6) no tienen ningún error', () => {
  for (const id of ['ej1', 'ej2', 'ej3', 'ej4', 'ej6', 'ej7']) {
    const p = loadEx(id);
    assert.deepEqual(K.diagnose(A.build(p), p), { ok: true, problems: [] }, id);
  }
});

test('referencia: Corneil, Gotlieb y Lee (1973), figura 6, antes de quitar a8: solo sobra la de tipo (3) redundante', () => {
  // a < e, f, g; b < f, g, h; c < g, h, i; d < g, i, j (sin duraciones). Red de sus §2–§3 sin el recubrimiento.
  const p = fromSucc({ A: ['E', 'F', 'G'], B: ['F', 'G', 'H'], C: ['G', 'H', 'I'], D: ['G', 'I', 'J'], E: [], F: [], G: [], H: [], I: [], J: [] });
  const net = { events: Array.from({ length: 10 }, (_, i) => ({ id: i, n: null })),
    arcs: [['A', 0, 1], ['B', 0, 2], ['C', 0, 3], ['D', 0, 4], ['E', 1, 5], ['F', 6, 5], ['G', 7, 5], ['H', 8, 5], ['I', 9, 5], ['J', 4, 5]]
      .map(([act, from, to]) => ({ act, from, to })),
    dummies: [[1, 6], [6, 7], [2, 6], [8, 7], [2, 8], [9, 7], [3, 8], [3, 9], [4, 9]].map(([from, to]) => ({ from, to })) };
  assert.deepEqual(K.removable(net, p), [{ i: 3, name: undefined, how: 'delete' }], 'la ficticia del inicio de H al de G');
});

test('un error de cada tipo, con las actividades o sucesos implicados', () => {
  const p = loadEx('ej6');
  const cases = [
    ['missingArc', (n) => { n.arcs = n.arcs.filter((e) => e.act !== 'K'); }],
    ['duplicateArc', (n) => { n.arcs.push({ ...n.arcs[0] }); }],
    ['unknownAct', (n) => { n.arcs.push({ act: 'Z', from: 's1', to: 's2' }); }],
    ['incompleteArc', (n) => { n.arcs.find((e) => e.act === 'K').to = null; }],
    ['parallel', (n) => { const a = n.arcs.find((e) => e.act === 'A'); const b = n.arcs.find((e) => e.act === 'B'); b.from = a.from; b.to = a.to; }],
    ['looseEvent', (n) => { n.events.push({ id: 'suelto', n: 99 }); }],
    ['start', (n) => { n.events.push({ id: 'x', n: 98 }); n.arcs.find((e) => e.act === 'D').from = 'x'; }],
    ['end', (n) => { n.events.push({ id: 'y', n: 97 }); n.arcs.find((e) => e.act === 'H').to = 'y'; }],
    ['cycle', (n) => { const k = n.arcs.find((e) => e.act === 'K'); n.dummies.push({ from: k.to, to: 's1' }); }],
    ['order', (n) => { n.events.forEach((e) => { e.n = 100 - e.n; }); }],
    ['unnumbered', (n) => { n.events[2].n = null; }],
    ['missingPrecedence', (n) => { n.dummies.pop(); }],
    ['falsePrecedence', (n) => { const c = n.arcs.find((e) => e.act === 'C'); n.dummies.push({ from: c.to, to: n.arcs.find((e) => e.act === 'E').from }); }],
  ];
  for (const [code, mutate] of cases) {
    const net = ej6(); mutate(net);
    const r = K.diagnose(net, p);
    assert.equal(r.ok, false, code);
    assert.ok(codes(r).includes(code), `${code}: ${JSON.stringify(r.problems)}`);
  }
  const r = K.diagnose((() => { const n = ej6(); n.dummies.pop(); return n; })(), p);
  assert.ok(r.problems.find((x) => x.code === 'missingPrecedence').ids.length === 2, 'nombra las dos actividades');
});

test('ficticia innecesaria: solo cuando la red es correcta en todo lo demás', () => {
  const p = fromSucc({ A: ['B'], B: [] });
  const net = { events: [0, 1, 2, 3].map((id) => ({ id, n: id + 1 })), arcs: [{ act: 'A', from: 0, to: 1 }, { act: 'B', from: 2, to: 3 }], dummies: [{ from: 1, to: 2 }] };
  assert.deepEqual(K.diagnose(net, p).problems, [{ code: 'unnecessaryDummy', ids: [], dummy: 0, how: 'merge' }]);
  net.events[3].n = null;
  assert.deepEqual(codes(K.diagnose(net, p)), ['unnumbered'], 'con otro error no se habla de la ficticia');
});

test('removable coincide con el oráculo en 500 redes pequeñas (con ficticias sobrantes añadidas al azar)', () => {
  const rand = rng(20261109);
  let withExtra = 0;
  for (let k = 0; k < 500; k++) {
    const succ = randomSucc(rand, 2 + Math.floor(rand() * 5));
    const p = fromSucc(succ);
    const o = toOracle(A.build(p));
    const a = Math.floor(rand() * o.nodes); const b = Math.floor(rand() * o.nodes);
    const extra = { ...o, dummies: [...o.dummies, { from: a, to: b }] };
    const net = a !== b && OM.check(succOf(p), extra) ? (withExtra++, extra) : o;
    assert.deepEqual(K.removable(toStudent(net), p).map(({ i, how }) => ({ i, how })), OR.removable(succOf(p), net), JSON.stringify(succ));
  }
  assert.ok(withExtra > 50, `casos con una ficticia sobrante: ${withExtra}`);
});

test('las redes de las reglas (2000 tablas) y del mínimo (300) no dan errores de lógica', () => {
  const rand = rng(7);
  for (let k = 0; k < 2000; k++) {
    const p = fromSucc(randomSucc(rand, 1 + Math.floor(rand() * 12)));
    const nets = k < 300 ? [A.build(p), M.solve(p, { budget: 2000 }).net] : [A.build(p)];
    for (const net of nets) {
      const bad = K.diagnose(net, p).problems.filter((x) => x.code !== 'unnecessaryDummy');
      assert.deepEqual(bad, [], net.method);
    }
  }
});

test('diagnóstico = oráculo: una red mutada al azar es correcta para uno exactamente cuando lo es para el otro', () => {
  const rand = rng(11);
  let broken = 0;
  for (let k = 0; k < 1500; k++) {
    const p = fromSucc(randomSucc(rand, 2 + Math.floor(rand() * 7)));
    const o = toOracle(A.build(p));
    const pick = (n) => Math.floor(rand() * n);
    const m = { nodes: o.nodes, arcs: o.arcs.map((e) => ({ ...e })), dummies: o.dummies.map((d) => ({ ...d })) };
    const kind = pick(3);
    if (kind === 0) { const e = m.arcs[pick(m.arcs.length)]; e[rand() < 0.5 ? 'from' : 'to'] = pick(m.nodes); }
    else if (kind === 1 && m.dummies.length) m.dummies.splice(pick(m.dummies.length), 1);
    else m.dummies.push({ from: pick(m.nodes), to: pick(m.nodes) });
    if (m.arcs.some((e) => e.from === e.to) || m.dummies.some((d) => d.from === d.to)) continue;
    const want = OM.check(succOf(p), m);
    const got = K.diagnose(toStudent(m), p).problems.filter((x) => !['unnecessaryDummy', 'unnumbered', 'looseEvent'].includes(x.code)).length === 0;
    if (!want) broken++;
    if (m.nodes === new Set([...m.arcs, ...m.dummies].flatMap((e) => [e.from, e.to])).size) assert.equal(got, want, JSON.stringify(m));
  }
  assert.ok(broken > 300, `redes rotas: ${broken}`);
});

test('aoa.verify (F2a) y diagnose coinciden en si una red de un método es correcta', () => {
  const rand = rng(5);
  for (let k = 0; k < 1000; k++) {
    const p = fromSucc(randomSucc(rand, 1 + Math.floor(rand() * 10)));
    const net = A.build(p);
    const dummies = rand() < 0.5 && net.dummies.length ? net.dummies.slice(1) : net.dummies;
    const mutated = { ...net, dummies };
    const ok = K.diagnose(mutated, p).problems.filter((x) => x.code !== 'unnecessaryDummy').length === 0;
    assert.equal(ok, A.verify(mutated, p).ok);
  }
});
