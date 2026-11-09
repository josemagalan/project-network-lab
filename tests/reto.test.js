'use strict';
// reto: el modelo de la red del alumno (parte sin DOM de js/reto; F2b, T020). Criterios 9–12 y 14.
const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../js/core/project.js');
const E = require('../js/core/examples.js');
const A = require('../js/core/aoa.js');
const M = require('../js/core/mindummy.js');
const U = require('../js/core/urlstate.js');
const R = require('../js/reto.js');

const load = (id) => { const ex = E.get(id); return P.parse(ex.rows, ex.mode, { structureOnly: !!ex.structureOnly }).project; };
const p6 = load('ej6');
const min6 = M.solve(p6);

// Copia en la red del alumno una red PERT del núcleo (sucesos con su número; ids distintos de los números).
function fromAoa(net, st) {
  let s = st;
  const id = new Map();
  for (const ev of net.events) {
    if (ev.kind === 'start') { id.set(ev.n, s.net.events[0].id); continue; }
    if (ev.kind === 'end') { id.set(ev.n, s.net.events[1].id); continue; }
    s = R.apply(s, { type: 'addEvent', x: ev.n * 10, y: 5 });
    id.set(ev.n, s.net.events[s.net.events.length - 1].id);
  }
  for (const ev of net.events) s = R.apply(s, { type: 'number', id: id.get(ev.n), n: ev.n });
  for (const a of net.arcs) s = R.apply(s, { type: 'arc', act: a.act, from: id.get(a.from), to: id.get(a.to) });
  for (const d of net.dummies) s = R.apply(s, { type: 'addDummy', from: id.get(d.from), to: id.get(d.to) });
  return s;
}

test('T020 · el reto empieza con el suceso inicial y el final y una fila por actividad, sin sucesos', () => {
  const s = R.start(p6);
  assert.equal(s.net.events.length, 2);
  assert.deepEqual(s.net.events.map((e) => e.n), [null, null]);
  assert.deepEqual(s.net.arcs.map((a) => a.act), p6.activities.map((a) => a.id).sort());
  assert.ok(s.net.arcs.every((a) => a.from === null && a.to === null));
  assert.deepEqual(s.net.dummies, []);
  assert.equal(s.result, null);
});

test('T020 · crear, mover y borrar sucesos; borrar uno deja sin ese extremo a sus arcos y ficticias', () => {
  let s = R.start(p6);
  s = R.apply(s, { type: 'addEvent', x: 12, y: 7 });
  const id = s.net.events[2].id;
  assert.ok(!s.net.events.slice(0, 2).some((e) => e.id === id), 'id nuevo');
  assert.deepEqual([s.net.events[2].x, s.net.events[2].y], [12, 7]);
  s = R.apply(s, { type: 'moveEvent', id, x: 30, y: 9 });
  assert.deepEqual([s.net.events[2].x, s.net.events[2].y], [30, 9]);
  s = R.apply(s, { type: 'arc', act: 'A', from: s.net.events[0].id, to: id });
  s = R.apply(s, { type: 'addDummy', from: id, to: s.net.events[1].id });
  s = R.apply(s, { type: 'removeEvent', id });
  assert.equal(s.net.events.length, 2);
  assert.deepEqual(s.net.arcs.find((a) => a.act === 'A'), { act: 'A', from: s.net.events[0].id, to: null });
  assert.deepEqual(s.net.dummies, [{ from: null, to: s.net.events[1].id }]);
  // Los ids no se reutilizan: el siguiente suceso es otro.
  s = R.apply(s, { type: 'addEvent', x: 1, y: 1 });
  assert.notEqual(s.net.events[2].id, id);
});

test('T020 · trazar, reasignar y borrar arcos y ficticias; las operaciones no cambian el estado de partida', () => {
  const s0 = R.apply(R.start(p6), { type: 'addEvent', x: 20, y: 0 });
  const [i, f, x] = s0.net.events.map((e) => e.id);
  const frozen = JSON.stringify(s0);
  let s = R.apply(s0, { type: 'arc', act: 'A', from: i, to: x });
  s = R.apply(s, { type: 'arc', act: 'B', from: i });
  assert.deepEqual(s.net.arcs.find((a) => a.act === 'B'), { act: 'B', from: i, to: null }, 'un extremo cada vez');
  s = R.apply(s, { type: 'arc', act: 'B', to: f });
  assert.deepEqual(s.net.arcs.find((a) => a.act === 'B'), { act: 'B', from: i, to: f });
  // Reasignar: el arco de A pasa a ser de C (y C deja el suyo a A).
  s = R.apply(s, { type: 'reassign', act: 'A', to: 'C' });
  assert.deepEqual(s.net.arcs.find((a) => a.act === 'C'), { act: 'C', from: i, to: x });
  assert.deepEqual(s.net.arcs.find((a) => a.act === 'A'), { act: 'A', from: null, to: null });
  s = R.apply(s, { type: 'clearArc', act: 'C' });
  assert.deepEqual(s.net.arcs.find((a) => a.act === 'C'), { act: 'C', from: null, to: null });
  s = R.apply(s, { type: 'addDummy', from: x, to: f });
  s = R.apply(s, { type: 'dummy', i: 0, from: i });
  assert.deepEqual(s.net.dummies, [{ from: i, to: f }]);
  s = R.apply(s, { type: 'removeDummy', i: 0 });
  assert.deepEqual(s.net.dummies, []);
  assert.equal(JSON.stringify(s0), frozen);
  // Lo que no existe no cambia nada.
  for (const op of [{ type: 'arc', act: 'Z', from: i }, { type: 'arc', act: 'A', from: 999 }, { type: 'moveEvent', id: 999, x: 1, y: 1 },
    { type: 'removeDummy', i: 5 }, { type: 'reassign', act: 'A', to: 'Z' }, { type: 'number', id: i, n: -1 }, { type: 'xyz' }]) {
    assert.deepEqual(R.apply(s0, op).net, s0.net, JSON.stringify(op));
  }
});

test('T020 · numerar a mano y con la herramienta (orden topológico; con un ciclo no numera)', () => {
  let s = R.start(load('tipo'));
  s = R.apply(s, { type: 'number', id: s.net.events[1].id, n: 7 });
  assert.equal(s.net.events[1].n, 7);
  s = R.apply(s, { type: 'number', id: s.net.events[1].id, n: null });
  assert.equal(s.net.events[1].n, null);
  const net = A.build(load('tipo'));
  s = fromAoa(net, R.start(load('tipo')));
  s = R.apply(Object.assign({}, s, { net: Object.assign({}, s.net, { events: s.net.events.map((e) => Object.assign({}, e, { n: null })) }) }), { type: 'autoNumber' });
  const num = new Map(s.net.events.map((e) => [e.id, e.n]));
  assert.deepEqual([...num.values()].sort((a, b) => a - b), [1, 2, 3, 4, 5, 6]);
  for (const a of [...s.net.arcs, ...s.net.dummies]) assert.ok(num.get(a.from) < num.get(a.to));
  // Con un ciclo, la numeración no cambia.
  let c = R.apply(R.start(load('tipo')), { type: 'addEvent', x: 1, y: 1 });
  const [i, , x] = c.net.events.map((e) => e.id);
  c = R.apply(c, { type: 'addDummy', from: i, to: x });
  c = R.apply(c, { type: 'addDummy', from: x, to: i });
  assert.deepEqual(R.apply(c, { type: 'autoNumber' }).net, c.net);
});

test('T020 · AC12: ninguna operación deja un diagnóstico: solo «Comprobar» lo da, y editar lo borra', () => {
  let s = fromAoa(A.build(p6), R.start(p6));
  assert.equal(s.result, null);
  s = R.check(s, p6, min6);
  assert.ok(s.result);
  for (const op of [{ type: 'addEvent', x: 0, y: 0 }, { type: 'moveEvent', id: s.net.events[0].id, x: 3, y: 3 }, { type: 'clearArc', act: 'A' }, { type: 'autoNumber' }]) {
    assert.equal(R.apply(s, op).result, null, op.type);
  }
});

test('T020 · AC10–AC11: la red de las reglas del Ejercicio 6, hecha con las operaciones, es correcta y está en el mínimo', () => {
  const s = R.check(fromAoa(A.build(p6), R.start(p6)), p6, min6);
  const r = s.result;
  assert.equal(r.correct, true);
  assert.deepEqual(r.problems, []);
  assert.equal(r.dummies, 3);
  assert.deepEqual(r.min, { value: 3, lower: 3, exact: true });
  assert.equal(r.extra, 0);
  assert.deepEqual(r.removable, []);
  assert.equal(r.structural, false);
  // Las ficticias del alumno se nombran F1, F2… en su orden, para el diagnóstico y la vista.
  assert.deepEqual(R.named(s.net).dummies.map((d) => d.name), ['F1', 'F2', 'F3']);
});

test('T020 · AC11: una ficticia de más se nombra como que se puede quitar, y la red sigue siendo correcta', () => {
  let s = fromAoa(A.build(p6), R.start(p6));
  const k = s.net.events.find((e) => e.n === 9).id;
  const k8 = s.net.arcs.find((a) => a.act === 'K').from;
  // K termina en un suceso propio (10) unido por una ficticia al final (que pasa a ser el 11): sobra.
  s = R.apply(s, { type: 'addEvent', x: 99, y: 9 });
  const extra = s.net.events[s.net.events.length - 1].id;
  s = R.apply(s, { type: 'number', id: extra, n: 10 });
  s = R.apply(s, { type: 'arc', act: 'K', from: k8, to: extra });
  s = R.apply(s, { type: 'addDummy', from: extra, to: k });
  s = R.apply(s, { type: 'number', id: k, n: 11 });
  s = R.check(s, p6, min6);
  assert.equal(s.result.correct, true, JSON.stringify(s.result.problems));
  assert.equal(s.result.dummies, 4);
  assert.equal(s.result.extra, 1);
  assert.deepEqual(s.result.removable, [{ name: 'F4', how: 'merge' }]);
  assert.deepEqual(s.result.problems.map((x) => x.code), ['unnecessaryDummy']);
  // Sin el mínimo todavía, no se compara.
  const pending = R.check(Object.assign({}, s, { result: null }), p6, null).result;
  assert.equal(pending.min, null);
  assert.equal(pending.extra, null);
});

test('T020 · AC10: cada tipo de error de la spec se diagnostica con lo implicado', () => {
  const base = fromAoa(A.build(p6), R.start(p6));
  const ev = (n) => base.net.events.find((e) => e.n === n).id;
  const arcOf = (a) => base.net.arcs.find((x) => x.act === a);
  const cases = [
    ['missingPrecedence', (s) => R.apply(s, { type: 'removeDummy', i: 0 })],
    ['falsePrecedence', (s) => R.apply(s, { type: 'addDummy', from: arcOf('C').to, to: arcOf('H').from })],
    ['parallel', (s) => R.apply(s, { type: 'arc', act: 'J', from: arcOf('K').from, to: arcOf('K').to })],
    ['incompleteArc', (s) => R.apply(s, { type: 'arc', act: 'D', to: null })],
    // Un suceso nuevo del que sale una actividad (E sale de él y no del 3): dos sucesos iniciales.
    ['start', (s) => { const t = R.apply(s, { type: 'addEvent', x: 1, y: 1 }); return R.apply(t, { type: 'arc', act: 'E', from: t.net.events[t.net.events.length - 1].id }); }],
    // Un suceso nuevo en el que termina una actividad (E termina en él y no en el 5): dos sucesos finales.
    ['end', (s) => { const t = R.apply(s, { type: 'addEvent', x: 1, y: 1 }); return R.apply(t, { type: 'arc', act: 'E', to: t.net.events[t.net.events.length - 1].id }); }],
    ['looseEvent', (s) => R.apply(s, { type: 'addEvent', x: 1, y: 1 })],
    ['cycle', (s) => R.apply(s, { type: 'addDummy', from: arcOf('K').to, to: arcOf('A').from })],
    ['order', (s) => R.apply(s, { type: 'number', id: ev(9), n: 1 })],
    ['unnumbered', (s) => R.apply(s, { type: 'number', id: ev(5), n: null })],
  ];
  for (const [code, mutate] of cases) {
    const r = R.check(mutate(base), p6, min6).result;
    assert.ok(r.problems.some((x) => x.code === code), `${code}: ${JSON.stringify(r.problems)}`);
    assert.equal(r.correct, false, code);
    assert.equal(r.extra, null, `${code}: sin distancia al mínimo si la red no es correcta`);
  }
  // Los sucesos iniciales de más se nombran (para que la vista los señale).
  const two = R.check(cases[4][1](base), p6, min6).result.problems.find((x) => x.code === 'start');
  assert.equal(two.events.length, 2);
  assert.ok(two.events.includes(ev(1)));
  // Actividad sin sucesos (falta en la red).
  const r = R.check(R.apply(base, { type: 'clearArc', act: 'G' }), p6, min6).result;
  assert.ok(r.problems.some((x) => x.code === 'incompleteArc' && x.ids.includes('G')));
});

test('T020 · una red correcta con menos ficticias que el mínimo conocido (no exacto) lo mejora', () => {
  const s = fromAoa(A.build(p6), R.start(p6));
  const r = R.check(s, p6, { value: 5, lower: 2, exact: false }).result;
  assert.equal(r.correct, true);
  assert.deepEqual(r.min, { value: 3, lower: 2, exact: false });
  assert.equal(r.extra, 0);
  assert.deepEqual(R.check(s, p6, { value: 4, lower: 3, exact: false }).result.min, { value: 3, lower: 3, exact: true }, 'en la cota, demostrado');
  // Con errores no se compara ni se mejora nada.
  const bad = R.check(R.apply(s, { type: 'removeDummy', i: 0 }), p6, { value: 5, lower: 2, exact: false }).result;
  assert.deepEqual([bad.correct, bad.min, bad.extra, bad.structural], [false, { value: 5, lower: 2, exact: false }, null, null]);
});

test('T020 · límites: posiciones dentro de la rejilla, números de 1 a 999, reasignar a sí misma no cambia nada', () => {
  let s = R.apply(R.start(p6), { type: 'addEvent', x: -4, y: 12345.6 });
  assert.deepEqual([s.net.events[2].x, s.net.events[2].y], [0, R.LIMIT.pos]);
  for (const op of [{ type: 'addEvent', x: 'a', y: 1 }, { type: 'number', id: 0, n: 0 }, { type: 'number', id: 0, n: 1000 }, { type: 'number', id: 0, n: 2.5 },
    { type: 'reassign', act: 'A', to: 'A' }, { type: 'arc', act: 'A' }, { type: 'dummy', i: 0, from: 0 }, { type: 'addDummy', from: 999, to: null }, null]) {
    assert.equal(R.apply(s, op), s, JSON.stringify(op));
  }
  // Sin sitio para más sucesos, no se crean.
  let full = R.start(p6);
  for (let k = 0; k < R.LIMIT.events + 5; k++) full = R.apply(full, { type: 'addEvent', x: k, y: 0 });
  assert.equal(full.net.events.length, R.LIMIT.events);
});

test('T020 · AC14: la red de la URL con extremos que no existen o un arco repetido se ajusta', () => {
  const sn = { events: [{ id: 0, n: 1 }, { id: 5, n: 2, x: 3, y: 4 }], arcs: [{ act: 'A', from: 0, to: 7 }, { act: 'A', from: 5, to: 0 }], dummies: [{ from: 9, to: 5 }] };
  const s = R.fromUrl(p6, sn);
  assert.deepEqual(s.net.arcs[0], { act: 'A', from: 0, to: null }, 'el primero de A, sin el extremo que no existe');
  assert.deepEqual(s.net.dummies, [{ from: null, to: 5 }]);
  assert.equal(s.seq, 6, 'el siguiente id, después del mayor');
  assert.equal(R.apply(s, { type: 'addEvent', x: 0, y: 0 }).net.events[2].id, 6);
  assert.notEqual(s.net.events, sn.events, 'no comparte los sucesos de la URL');
});

test('T020 · AC14: la red del alumno con posiciones va y vuelve por la URL, también a medias', () => {
  let s = fromAoa(A.build(p6), R.start(p6));
  s = R.apply(s, { type: 'clearArc', act: 'C' });
  s = R.apply(s, { type: 'addDummy', from: s.net.events[2].id, to: null });
  const hash = U.encode(Object.assign(U.defaults(), { graph: 'aoa', view: 'reto', ex: 'ej6', sn: s.net }));
  const back = U.decode(hash).state.sn;
  assert.deepEqual(back, s.net);
  assert.deepEqual(R.fromUrl(p6, back).net, s.net);
  // Una red de la URL que no casa con la tabla (actividades de más o de menos) se completa o se recorta.
  const odd = { events: back.events, arcs: [...back.arcs.filter((a) => a.act !== 'B'), { act: 'Z', from: null, to: null }], dummies: back.dummies };
  const fixed = R.fromUrl(p6, odd).net;
  assert.deepEqual(fixed.arcs.map((a) => a.act), p6.activities.map((a) => a.id).sort());
  assert.deepEqual(fixed.arcs.find((a) => a.act === 'B'), { act: 'B', from: null, to: null });
  assert.equal(R.fromUrl(p6, null).net.events.length, 2, 'sin red en la URL, la de partida');
});
