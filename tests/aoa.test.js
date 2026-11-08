'use strict';
// core/aoa: la red PERT construida con las reglas de los conjuntos (spec f2a-pert-ficticias).
// AC1 (los seis ejercicios del autor), AC15 (exactitud general), AC16 (precedencia redundante), AC17 (cadena).
const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../js/core/project.js');
const E = require('../js/core/examples.js');
const A = require('../js/core/aoa.js');

const load = (rows, mode = 'succ', opts) => {
  const { project, report } = P.parse(rows, mode, opts);
  assert.ok(project, JSON.stringify(report));
  return project;
};
const loadEx = (id) => { const ex = E.get(id); return load(ex.rows, ex.mode, { structureOnly: !!ex.structureOnly }); };
// 'A<C,D;B<C' → filas en forma de posteriores, sin duraciones.
const table = (spec) => {
  const succ = {};
  for (const part of spec.split(';')) {
    const [l, r] = part.split('<');
    const R = r.split(',').map((x) => x.trim());
    for (const a of l.split(',').map((x) => x.trim())) { succ[a] = [...new Set([...(succ[a] || []), ...R])]; for (const b of R) succ[b] = succ[b] || []; }
  }
  return load(Object.keys(succ).sort().map((id) => ({ id, duration: '', links: succ[id].join(', ') })), 'succ', { structureOnly: true });
};
const ruleOf = (net) => net.dummies.map((d) => d.rule);
const eventOf = (net, act, end) => net.arcs.find((a) => a.act === act)[end];

// Generador con semilla (constitución, principio 9).
function rng(seed) { let s = seed >>> 0; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; }
function randomProject(rand, n) {
  const ids = Array.from({ length: n }, (_, i) => `A${i + 1}`);
  const rows = ids.map((id, i) => {
    const pool = ids.slice(i + 1, i + 7);
    const links = pool.filter(() => rand() < 0.35);
    return { id, duration: String(1 + Math.floor(rand() * 9)), links: links.join(', ') };
  });
  return load(rows, 'succ');
}

test('AC1: los seis ejercicios del autor dan sus ficticias y sus sucesos, y la red es exacta', () => {
  for (const id of ['ej1', 'ej2', 'ej3', 'ej4', 'ej6', 'ej7']) {
    const net = A.build(loadEx(id));
    const want = E.get(id).expected.aoa;
    assert.equal(net.dummies.length, want.dummies, `${id}: ficticias`);
    assert.equal(net.events.length, want.events, `${id}: sucesos`);
    assert.deepEqual(A.verify(net, loadEx(id)), { ok: true, problems: [] }, id);
  }
});

test('AC1: cada arco va de un suceso menor a uno mayor y los sucesos se numeran de 1 a N', () => {
  for (const id of ['ej1', 'ej2', 'ej3', 'ej4', 'ej6', 'ej7']) {
    const net = A.build(loadEx(id));
    assert.deepEqual(net.events.map((e) => e.n).sort((a, b) => a - b), net.events.map((_, i) => i + 1), id);
    for (const e of [...net.arcs, ...net.dummies]) assert.ok(e.from < e.to, `${id}: ${e.act || e.name} ${e.from}→${e.to}`);
    assert.equal(net.events.find((e) => e.kind === 'start').n, 1, `${id}: inicio = 1`);
    assert.equal(net.events.find((e) => e.kind === 'end').n, net.events.length, `${id}: fin = N`);
  }
});

test('AC15: en 5000 tablas aleatorias la red de las reglas es exacta y cada ficticia viene de una regla', () => {
  const rand = rng(20261109);
  for (let i = 0; i < 5000; i++) {
    const p = randomProject(rand, 1 + Math.floor(rand() * 14));
    const net = A.build(p);
    const v = A.verify(net, p);
    assert.ok(v.ok, `tabla ${i}: ${JSON.stringify(v.problems)}`);
    for (const d of net.dummies) {
      assert.ok(['equal', 'contained', 'shared'].includes(d.rule), `tabla ${i}: regla ${d.rule}`);
      assert.ok(d.because.length >= 1, `tabla ${i}: ${d.name} sin actividades que la justifiquen`);
    }
  }
});

test('AC1: Ejercicio 1 — dos ficticias de conjuntos contenidos (A ⊃ B por D; C ⊃ D por H)', () => {
  const net = A.build(loadEx('ej1'));
  assert.deepEqual(ruleOf(net), ['contained', 'contained']);
  assert.deepEqual(net.dummies.map((d) => d.because), [['A', 'B'], ['C', 'D']]);
  assert.deepEqual(net.dummies.map((d) => d.represents), [[['A', 'D']], [['C', 'H']]]);
  assert.deepEqual(net.dummies.map((d) => d.name), ['F1', 'F2']);
});

test('AC1: Ejercicio 7 — dos de compartidos por D y H, una de identidad en I (después de G) y nombres en orden de reglas', () => {
  const net = A.build(loadEx('ej7'));
  assert.equal(ruleOf(net).filter((r) => r === 'shared').length, 4);
  const id = net.dummies.find((d) => d.rule === 'equal');
  assert.deepEqual(id.because, ['G', 'I']);
  assert.equal(id.name, 'F1', 'la regla de iguales va primero');
  assert.equal(eventOf(net, 'G', 'to'), net.events.find((e) => e.kind === 'end').n, 'G termina en el fin');
  assert.equal(eventOf(net, 'I', 'to'), id.from, 'I termina en su suceso propio');
  assert.equal(net.events.find((e) => e.n === id.from).kind, 'identity');
});

test('AC16: A<C,D,E; B<C,E; D<E — tres ficticias y la misma red con o sin la redundante A→E', () => {
  const withA = A.build(table('A<C,D,E;B<C,E;D<E'));
  const without = A.build(table('A<C,D;B<C,E;D<E'));
  assert.equal(withA.dummies.length, 3);
  assert.deepEqual(withA.arcs, without.arcs);
  assert.deepEqual(withA.dummies, without.dummies);
  assert.deepEqual(withA.events, without.events);
});

test('AC17: en una cadena de contenidos solo se unen los vecinos (Z→Y, Y→X, nunca Z→X)', () => {
  const net = A.build(table('Z<P,Q,R;Y<P,Q;X<P'));
  const at = (act) => eventOf(net, act, 'to');
  const pairs = net.dummies.map((d) => `${d.from}>${d.to}`).sort();
  assert.deepEqual(pairs, [`${at('Y')}>${at('X')}`, `${at('Z')}>${at('Y')}`].sort());
  assert.ok(net.dummies.every((d) => d.rule === 'contained'));
});

test('sin ficticias: una cadena y un abanico simple', () => {
  assert.equal(A.build(table('A<B;B<C')).dummies.length, 0);
  assert.equal(A.build(table('A<B,C;B<D;C<D')).dummies.length, 1, 'B y C paralelas: una de identidad');
  assert.equal(A.build(table('A<B;A<C')).dummies.length, 1, 'B y C sin posteriores y con la misma precedente: identidad');
});

test('una parte común que es la de otra actividad reutiliza su suceso (sin suceso nuevo)', () => {
  // X{P,Q} y Y{Q,R} comparten {Q}, que es el conjunto de W: la ficticia va al suceso de W y no hay suceso extra.
  const net = A.build(table('X<P,Q;Y<Q,R;W<Q'));
  assert.equal(net.dummies.length, 2, 'X→W y Y→W');
  assert.equal(net.events.filter((e) => e.kind === 'shared').length, 0);
  assert.ok(net.dummies.every((d) => d.rule === 'contained'));
});

test('verify detecta una red mal construida', () => {
  const p = loadEx('ej1');
  const net = A.build(p);
  const broken = Object.assign({}, net, { dummies: net.dummies.slice(1) });
  const v = A.verify(broken, p);
  assert.equal(v.ok, false);
  assert.ok(v.problems.length >= 1);
});

test('determinismo: la misma tabla da la misma red', () => {
  assert.ok(A.build(loadEx('ej3')).events.length > 0);
  assert.deepEqual(A.build(loadEx('ej3')), A.build(loadEx('ej3')));
});

test('aoa.methods registra el método de las reglas', () => {
  assert.equal(typeof A.methods.rules, 'function');
  assert.deepEqual(A.methods.rules(loadEx('ej6')), A.build(loadEx('ej6')));
});

test('un método de construcción desconocido es un error explícito', () => {
  assert.throws(() => A.build(loadEx('ej6'), { method: 'nope' }), /método desconocido/);
});

// ---------- T007: tiempos de sucesos y traza de la red PERT (AC2, AC3, AC5, AC10) ----------

const C = require('../js/core/cpm.js');
const pairsOf = (t) => Object.keys(t.TE).map((n) => [t.TE[n], t.TL[n]]).sort((x, y) => x[0] - y[0] || x[1] - y[1]);
const sortPairs = (ps) => ps.slice().sort((x, y) => x[0] - y[0] || x[1] - y[1]);
const durOf = (s, a) => s.times[a].EF - s.times[a].ES;

test('AC2: los tiempos de los sucesos de los ejercicios 4, 6 y 7 coinciden con la solución del autor', () => {
  for (const id of ['ej4', 'ej6', 'ej7']) {
    const p = loadEx(id);
    const s = C.solve(p);
    const t = A.times(A.build(p), s);
    assert.deepEqual(pairsOf(t), sortPairs(E.get(id).expected.aoa.eventTimes), id);
    assert.equal(t.TE[A.build(p).events.length], E.get(id).expected.duration, `${id}: duración`);
  }
});

test('AC3: en 2000 tablas aleatorias y en los ejemplos de ROY, duración, crítico y holgura total salen igual en PERT', () => {
  const rand = rng(7);
  const projects = ['roy10', 'roy6', 'klastorin', 'hillier', 'ej4', 'ej6', 'ej7'].map(loadEx);
  for (let i = 0; i < 2000; i++) projects.push(randomProject(rand, 1 + Math.floor(rand() * 14)));
  projects.forEach((p, i) => {
    const s = C.solve(p);
    const net = A.build(p);
    const t = A.times(net, s);
    assert.equal(t.TE[net.events.length], s.duration, `tabla ${i}: duración`);
    for (const e of net.arcs) {
      const tf = t.TL[e.to] - t.TE[e.from] - durOf(s, e.act);
      assert.ok(Math.abs(tf - s.floats[e.act].TF) < 1e-9, `tabla ${i}: TF(${e.act}) ${tf} ≠ ${s.floats[e.act].TF}`);
    }
  });
});

test('AC5: la traza PERT tiene el orden de pasos del plan y un paso por suceso hacia delante y hacia atrás', () => {
  const p = loadEx('ej6');
  const net = A.build(p);
  const kinds = net.trace.map((st) => st.kind);
  const N = net.events.length;
  assert.deepEqual(kinds, ['succTable', 'ruleEqual', 'ruleContained', 'ruleShared', 'place', 'number',
    ...Array(N).fill('eventForward'), ...Array(N).fill('eventBackward'), 'eventSlack', 'floats', 'critical']);
  assert.deepEqual(net.trace.filter((st) => st.kind === 'eventForward').map((st) => st.event), net.events.map((e) => e.n));
  assert.deepEqual(net.trace.filter((st) => st.kind === 'eventBackward').map((st) => st.event), net.events.map((e) => e.n).reverse());
});

test('AC5: cada paso de regla nombra sus actividades y sus ficticias, o queda vacío si no se aplica', () => {
  const net = A.build(loadEx('ej1'));
  const step = (k) => net.trace.find((st) => st.kind === k);
  assert.deepEqual(step('ruleEqual').rule, { acts: [], dummies: [] });
  assert.deepEqual(step('ruleContained').rule, { acts: ['A', 'B', 'C', 'D'], dummies: ['F1', 'F2'] });
  assert.deepEqual(step('ruleShared').rule, { acts: [], dummies: [] });
  const n7 = A.build(loadEx('ej7'));
  assert.deepEqual(n7.trace.find((st) => st.kind === 'ruleEqual').rule, { acts: ['G', 'I'], dummies: ['F1'] });
});

test('AC5: un paso hacia delante revela el tiempo temprano con su fórmula (máximo sobre lo que llega)', () => {
  const p = loadEx('ej6');
  const net = A.build(p);
  const t = A.times(net, C.solve(p));
  assert.equal(net.trace.filter((x) => x.kind === 'eventForward').length, net.events.length);
  for (const st of net.trace.filter((x) => x.kind === 'eventForward')) {
    assert.deepEqual(st.reveals, [{ event: st.event, field: 'TE', value: t.TE[st.event] }]);
    if (st.event === 1) continue;
    assert.equal(st.formula.op, 'max');
    assert.equal(Math.max(...st.formula.terms.map((x) => x.value)), t.TE[st.event]);
    assert.ok(st.formula.chosen.length >= 1);
  }
  for (const st of net.trace.filter((x) => x.kind === 'eventBackward')) {
    assert.deepEqual(st.reveals, [{ event: st.event, field: 'TL', value: t.TL[st.event] }]);
  }
});

test('AC10: el paso de holguras de actividad revela las cuatro de ROY; Ejercicio 7: suceso de I 21 | 27 y HL(I) = 6', () => {
  const p = loadEx('ej7');
  const s = C.solve(p);
  const net = A.build(p);
  const fl = net.trace.find((st) => st.kind === 'floats');
  for (const a of p.activities.map((x) => x.id)) {
    for (const f of ['TF', 'FF', 'IF', 'SF']) {
      assert.deepEqual(fl.reveals.find((r) => r.act === a && r.field === f).value, s.floats[a][f], `${a}.${f}`);
    }
  }
  const t = A.times(net, s);
  const endI = net.arcs.find((e) => e.act === 'I').to;
  assert.deepEqual([t.TE[endI], t.TL[endI], t.slack[endI]], [21, 27, 6]);
  assert.equal(fl.reveals.find((r) => r.act === 'I' && r.field === 'FF').value, 6);
  const slack = net.trace.find((st) => st.kind === 'eventSlack');
  assert.equal(slack.reveals.length, net.events.length);
});

test('las tablas solo de estructura terminan la traza en la numeración', () => {
  for (const id of ['ej1', 'ej2', 'ej3']) {
    const kinds = A.build(loadEx(id)).trace.map((st) => st.kind);
    assert.deepEqual(kinds, ['succTable', 'ruleEqual', 'ruleContained', 'ruleShared', 'place', 'number'], id);
  }
});
