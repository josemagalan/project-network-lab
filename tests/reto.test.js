'use strict';
// reto: el modelo de la red del alumno (parte sin DOM de js/reto; F2b, T020). Criterios 9–12 y 14.
const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../js/core/project.js');
const E = require('../js/core/examples.js');
const A = require('../js/core/aoa.js');
const M = require('../js/core/mindummy.js');
const U = require('../js/core/urlstate.js');
require('../js/core/aoamethods.js');
const R = require('../js/reto.js');

const load = (id) => { const ex = E.get(id); return P.parse(ex.rows, ex.mode, { structureOnly: !!ex.structureOnly }).project; };
const p6 = load('ej6');
const min6 = M.solve(p6);

// Copia en la red del alumno una red PERT del núcleo, como en el lienzo (sucesos con posición y su número; ids
// distintos de los números).
function fromAoa(net, st) {
  let s = st;
  const id = new Map();
  for (const ev of net.events) {
    s = R.apply(s, { type: 'addEvent', x: ev.n * 10, y: 5 });
    id.set(ev.n, s.net.events[s.net.events.length - 1].id);
  }
  for (const ev of net.events) s = R.apply(s, { type: 'number', id: id.get(ev.n), n: ev.n });
  for (const a of net.arcs) s = R.apply(s, { type: 'arc', act: a.act, from: id.get(a.from), to: id.get(a.to) });
  for (const d of net.dummies) s = R.apply(s, { type: 'addDummy', from: id.get(d.from), to: id.get(d.to) });
  return s;
}

test('T020 · el reto empieza sin sucesos y con una fila por actividad (decisión del autor, T021)', () => {
  const s = R.start(p6);
  assert.deepEqual(s.net.events, []);
  assert.deepEqual(s.net.arcs.map((a) => a.act), p6.activities.map((a) => a.id).sort());
  assert.ok(s.net.arcs.every((a) => a.from === null && a.to === null));
  assert.deepEqual(s.net.dummies, []);
  assert.equal(s.result, null);
});

test('T020 · crear, mover y borrar sucesos; borrar uno deja sin ese extremo a sus arcos y ficticias', () => {
  let s = R.start(p6);
  s = R.apply(R.apply(s, { type: 'addEvent', x: 0, y: 0 }), { type: 'addEvent', x: 90, y: 0 });
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
  const s0 = [0, 90, 20].reduce((s, x) => R.apply(s, { type: 'addEvent', x, y: 0 }), R.start(p6));
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
  let s = R.apply(R.start(load('tipo')), { type: 'addEvent', x: 0, y: 0 });
  s = R.apply(s, { type: 'number', id: s.net.events[0].id, n: 7 });
  assert.equal(s.net.events[0].n, 7);
  s = R.apply(s, { type: 'number', id: s.net.events[0].id, n: null });
  assert.equal(s.net.events[0].n, null);
  const net = A.build(load('tipo'));
  s = fromAoa(net, R.start(load('tipo')));
  s = R.apply(Object.assign({}, s, { net: Object.assign({}, s.net, { events: s.net.events.map((e) => Object.assign({}, e, { n: null })) }) }), { type: 'autoNumber' });
  const num = new Map(s.net.events.map((e) => [e.id, e.n]));
  assert.deepEqual([...num.values()].sort((a, b) => a - b), [1, 2, 3, 4, 5, 6]);
  for (const a of [...s.net.arcs, ...s.net.dummies]) assert.ok(num.get(a.from) < num.get(a.to));
  // Con un ciclo, la numeración no cambia.
  let c = [0, 90, 1].reduce((t, x0) => R.apply(t, { type: 'addEvent', x: x0, y: 1 }), R.start(load('tipo')));
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
    ['order', (s) => R.apply(s, { type: 'number', id: ev(8), n: 10 })],
    ['sameNumber', (s) => R.apply(s, { type: 'number', id: ev(4), n: 3 })],
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
  assert.deepEqual([s.net.events[0].x, s.net.events[0].y], [0, R.LIMIT.pos]);
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
  assert.deepEqual(R.fromUrl(p6, null), R.start(p6), 'sin red en la URL, la de partida');
});

// Escribe en la tabla de sucesos (solo números) la red PERT de un método: lo que hace el alumno sin el lienzo.
function typed(net, st) {
  let s = st;
  for (const a of net.arcs) for (const side of ['from', 'to']) s = R.apply(s, { type: 'endNumber', act: a.act, side, n: a[side] });
  net.dummies.forEach((d, i) => {
    s = R.apply(s, { type: 'addDummy' });
    for (const side of ['from', 'to']) s = R.apply(s, { type: 'endNumber', i, side, n: d[side] });
  });
  return s;
}

test('T021 · AC10–AC11: el Ejercicio 6, escrito solo con números en la tabla de sucesos, es correcto y está en el mínimo', () => {
  const s = typed(A.build(p6), R.start(p6));
  assert.equal(s.net.events.length, 9);
  assert.ok(s.net.events.every((e) => e.x === undefined), 'sin posición: la vista los coloca');
  assert.deepEqual(s.net.events.map((e) => e.n).sort((a, b) => a - b), [1, 2, 3, 4, 5, 6, 7, 8, 9]);
  const r = R.check(s, p6, min6).result;
  assert.deepEqual([r.correct, r.dummies, r.extra], [true, 3, 0]);
  // Las otras redes de los métodos también.
  for (const m of ['prog', 'cs', 'kim']) {
    const p = load('tipo');
    assert.equal(R.check(typed(A.build(p, { method: m }), R.start(p)), p, M.solve(p)).result.correct, true, m);
  }
});

test('T021 · tabla de sucesos: un número nuevo crea el suceso y, si se queda sin flechas, desaparece; uno del lienzo no', () => {
  let s = R.apply(R.start(p6), { type: 'endNumber', act: 'A', side: 'from', n: 1 });
  s = R.apply(s, { type: 'endNumber', act: 'A', side: 'to', n: 3 });
  assert.deepEqual(s.net.events.map((e) => e.n), [1, 3]);
  s = R.apply(s, { type: 'endNumber', act: 'B', side: 'from', n: 1 });
  assert.equal(s.net.events.length, 2, 'el 1 ya existe');
  assert.equal(s.net.arcs.find((a) => a.act === 'B').from, s.net.arcs.find((a) => a.act === 'A').from);
  // Corregir el 3 por un 2: el 3 se queda sin flechas y desaparece.
  s = R.apply(s, { type: 'endNumber', act: 'A', side: 'to', n: 2 });
  assert.deepEqual(s.net.events.map((e) => e.n), [1, 2]);
  s = R.apply(s, { type: 'endNumber', act: 'A', side: 'to', n: null });
  assert.deepEqual(s.net.events.map((e) => e.n), [1]);
  // Una ficticia escrita a medias también sostiene su suceso; al borrarla, desaparece.
  s = R.apply(R.apply(s, { type: 'addDummy' }), { type: 'endNumber', i: 0, side: 'to', n: 5 });
  assert.deepEqual(s.net.dummies, [{ from: null, to: s.net.events[1].id }]);
  s = R.apply(s, { type: 'removeDummy', i: 0 });
  assert.deepEqual(s.net.events.map((e) => e.n), [1]);
  // Un suceso del lienzo (con posición) se queda aunque no tenga flechas.
  s = R.apply(s, { type: 'addEvent', x: 4, y: 4 });
  s = R.apply(s, { type: 'clearArc', act: 'A' });
  s = R.apply(s, { type: 'clearArc', act: 'B' });
  assert.deepEqual(s.net.events.map((e) => [e.n, e.x]), [[null, 4]]);
  // Lo que no vale no cambia nada.
  for (const op of [{ type: 'endNumber', act: 'Z', side: 'to', n: 1 }, { type: 'endNumber', act: 'A', side: 'mid', n: 1 },
    { type: 'endNumber', act: 'A', side: 'to', n: 0 }, { type: 'endNumber', i: 3, side: 'to', n: 1 }, { type: 'endNumber', act: 'A', side: 'to', n: '2' }]) {
    assert.equal(R.apply(s, op), s, JSON.stringify(op));
  }
});

test('T021 · con números repetidos, la tabla enlaza el primero y el diagnóstico lo dice', () => {
  let s = typed(A.build(p6), R.start(p6));
  const e4 = s.net.events.find((e) => e.n === 4).id;
  s = R.apply(s, { type: 'number', id: e4, n: 3 });
  const r = R.check(s, p6, min6).result;
  assert.equal(r.correct, false);
  const same = r.problems.find((x) => x.code === 'sameNumber');
  assert.equal(same.n, 3);
  assert.deepEqual(R.shown(r.problems, s.net).find((x) => x.code === 'sameNumber').events, ['3', '3']);
  const first = s.net.events.find((e) => e.n === 3).id;
  assert.equal(R.apply(s, { type: 'endNumber', act: 'K', side: 'from', n: 3 }).net.arcs.find((a) => a.act === 'K').from, first);
});

test('T021 · nombres de los sucesos: su número o, sin número, letras; el diagnóstico los usa', () => {
  let s = R.apply(R.apply(R.start(p6), { type: 'addEvent', x: 0, y: 0 }), { type: 'addEvent', x: 5, y: 0 });
  const [a, b] = s.net.events.map((e) => e.id);
  s = R.apply(s, { type: 'number', id: b, n: 12 });
  assert.deepEqual([R.label(s.net, a), R.label(s.net, b), R.label(s.net, 99)], ['a', '12', null]);
  assert.deepEqual([R.byLabel(s.net, ' A '), R.byLabel(s.net, '12'), R.byLabel(s.net, '13'), R.byLabel(s.net, 'b'), R.byLabel(s.net, '')], [a, b, null, null, null]);
  const r = R.check(s, p6, min6).result;
  const loose = R.shown(r.problems, s.net).filter((x) => x.code === 'looseEvent').map((x) => x.events[0]);
  assert.deepEqual(loose, ['a', '12']);
  assert.deepEqual(R.shown([{ code: 'incompleteArc', ids: ['F1'], events: [null] }], s.net)[0].events, ['?']);
  // Las listas de sucesos salen en orden (números y luego letras); el origen y el destino de una ficticia, no.
  s = R.apply(s, { type: 'addEvent', x: 9, y: 9 });
  const c = s.net.events[2].id;
  s = R.apply(s, { type: 'number', id: c, n: 3 });
  assert.deepEqual(R.shown([{ code: 'cycle', ids: [], events: [b, a, c] }], s.net)[0].events, ['3', '12', 'a']);
  assert.deepEqual(R.shown([{ code: 'order', ids: [], events: [b, c] }], s.net)[0].events, ['12', '3']);
});

test('T022 · lienzo: los sucesos de la tabla se colocan por niveles sin pisar a los del lienzo; huecos para sucesos nuevos', () => {
  const s = typed(A.build(p6), R.start(p6));
  const pl = R.place(s.net);
  const at = (n) => pl.get(s.net.events.find((e) => e.n === n).id);
  assert.ok([...pl.values()].every((p) => p.auto));
  // Una actividad avanza una columna; una ficticia, ninguna (F1 del 2 al 3: misma columna).
  assert.equal(at(1).x, R.CANVAS.pad);
  assert.equal(at(2).x, at(1).x + R.CANVAS.col);
  assert.equal(at(3).x, at(2).x);
  assert.ok(at(9).x > at(8).x);
  // Nunca dos sucesos en el mismo sitio.
  const key = (p) => `${p.x},${p.y}`;
  assert.equal(new Set([...pl.values()].map(key)).size, pl.size);
  // Un suceso del lienzo en el hueco del 1: el 1 se coloca debajo.
  const t = R.apply(s, { type: 'addEvent', x: R.CANVAS.pad, y: R.CANVAS.pad });
  const pl2 = R.place(t.net);
  const one = pl2.get(t.net.events.find((e) => e.n === 1).id);
  assert.equal(one.x, R.CANVAS.pad);
  assert.ok(one.y > R.CANVAS.pad);
  // Con un ciclo también coloca a todos.
  const c = R.apply(t, { type: 'addDummy', from: t.net.events.find((e) => e.n === 9).id, to: t.net.events.find((e) => e.n === 1).id });
  assert.equal(R.place(c.net).size, c.net.events.length);
  // Huecos: a la derecha del de referencia si está libre; si no, otro libre; y en la rejilla.
  const sp = R.spot(pl, at(9));
  assert.deepEqual(sp, { x: R.snap(at(9).x + R.CANVAS.col), y: R.snap(at(9).y) });
  const first = R.spot(new Map(), null);
  assert.deepEqual(first, { x: R.CANVAS.pad, y: R.CANVAS.pad });
  const busy = R.spot(new Map([[0, { x: R.CANVAS.pad, y: R.CANVAS.pad }]]), null);
  assert.notDeepEqual(busy, first);
  assert.equal(busy.x % R.CANVAS.grid + busy.y % R.CANVAS.grid, 0);
  const ext = R.extent(pl);
  assert.ok(ext.w >= at(9).x + R.CANVAS.pad && ext.h >= R.CANVAS.h);
});

test('revisión F2b, ronda 2: en el reto, con actividades llamadas F1, F2…, las ficticias del alumno se llaman f1, f2…', () => {
  const p = P.parse(['F1:F3, F4', 'F2:F3, F5', 'F3:', 'F4:F5', 'F5:'].map((x) => { const [id, l] = x.split(':'); return { id, duration: '1', links: l }; }), 'succ').project;
  const net = A.build(p);
  const first = net.dummies[0];
  const dup = Object.assign({}, net, { dummies: [...net.dummies, first] });
  const s = fromAoa(dup, R.start(p));
  assert.deepEqual(R.named(s.net, p).dummies.map((d) => d.name), ['f1', 'f2', 'f3', 'f4']);
  assert.deepEqual(R.named(s.net).dummies.map((d) => d.name), ['F1', 'F2', 'F3', 'F4'], 'sin tabla, como siempre');
  const r = R.check(s, p, M.solve(p)).result;
  assert.equal(r.correct, true);
  assert.ok(r.removable.length >= 2 && r.removable.every((x) => /^f[0-9]+$/.test(x.name)), JSON.stringify(r.removable));
});
