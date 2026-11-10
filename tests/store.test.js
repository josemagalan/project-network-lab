'use strict';
// store: transiciones del estado de la página, que luego se escribe en la URL (AC8, AC19).
const test = require('node:test');
const assert = require('node:assert/strict');
const S = require('../js/store.js');
const U = require('../js/core/urlstate.js');

const s0 = () => U.defaults();

test('avanzar y retroceder respetan los límites de la traza', () => {
  let s = s0();
  s = S.reduce(s, { type: 'prev' }, 32);
  assert.equal(s.step, 0);
  s = S.reduce(s, { type: 'next' }, 32);
  assert.equal(s.step, 1);
  s = S.reduce(s, { type: 'go', n: 99 }, 32);
  assert.equal(s.step, 31);
  s = S.reduce(s, { type: 'next' }, 32);
  assert.equal(s.step, 31);
  s = S.reduce(s, { type: 'first' }, 32);
  assert.equal(s.step, 0);
});

test('AC16: cambiar de vista, idioma, notación o caja no cambia el paso', () => {
  let s = S.reduce(s0(), { type: 'go', n: 6 }, 32);
  for (const [key, value] of [['view', 'matrix'], ['lang', 'en'], ['nota', 'es'], ['box', 'c'], ['pred', 1]]) {
    s = S.reduce(s, { type: 'set', key, value }, 32);
    assert.equal(s[key], value);
    assert.equal(s.step, 6);
  }
});

test('solo se aceptan claves y valores de la lista blanca', () => {
  const s = S.reduce(s0(), { type: 'set', key: 'view', value: '3d' }, 32);
  assert.equal(s.view, 'net');
  const s2 = S.reduce(s0(), { type: 'set', key: '__proto__', value: 'x' }, 32);
  assert.deepEqual(s2, s0());
});

test('pasar al taller conserva la tabla del ejemplo como punto de partida editable', () => {
  const s = S.reduce(s0(), { type: 'work', rows: [{ id: 'A', name: '', duration: '2', links: '' }], mode: 'succ' }, 32);
  assert.equal(s.v, 'work');
  assert.equal(s.ex, null);
  assert.equal(s.mode, 'succ');
  assert.equal(s.t.length, 1);
  assert.equal(s.step, 0);
});

test('cargar un ejemplo vuelve al paso 0 y quita la tabla propia', () => {
  let s = S.reduce(s0(), { type: 'work', rows: [{ id: 'A', name: '', duration: '2', links: '' }], mode: 'pred' }, 32);
  s = S.reduce(s, { type: 'example', id: 'klastorin' }, 32);
  assert.equal(s.ex, 'klastorin');
  assert.equal(s.t, null);
  assert.equal(s.step, 0);
  assert.equal(S.reduce(s, { type: 'example', id: 'nope' }, 32).ex, 'klastorin');
});

test('editar la tabla actualiza t y mantiene el paso dentro de rango', () => {
  let s = S.reduce(s0(), { type: 'go', n: 20 }, 32);
  s = S.reduce(s, { type: 'table', rows: [{ id: 'A', name: '', duration: '1', links: '' }], total: 8 }, 32);
  assert.equal(s.t.length, 1);
  assert.equal(s.step, 7);
});

test('AC11: "¿y si…?" guarda la duración nueva y se puede deshacer', () => {
  let s = S.reduce(s0(), { type: 'whatif', id: 'A', d: 3 }, 32);
  assert.deepEqual(s.wi, [['A', 3]]);
  s = S.reduce(s, { type: 'whatif', id: 'A', d: 5 }, 32);
  assert.deepEqual(s.wi, [['A', 5]]);
  s = S.reduce(s, { type: 'whatif', id: 'A', d: null }, 32);
  assert.equal(s.wi, null);
});

test('AC8 y AC19: cualquier estado producido por el reductor sobrevive a la URL', () => {
  let s = S.reduce(s0(), { type: 'go', n: 9 }, 32);
  s = S.reduce(s, { type: 'set', key: 'nota', value: 'es' }, 32);
  s = S.reduce(s, { type: 'whatif', id: 'F', d: 4.5 }, 32);
  assert.deepEqual(U.decode(U.encode(s)).state, s);
});

// ---------- F2a (T016): red PERT, vista lado a lado, red mínima y cambio de red ----------

test('F2a: la matriz solo existe en ROY y la vista lado a lado solo en PERT', () => {
  let s = S.reduce(s0(), { type: 'set', key: 'view', value: 'side' }, 32);
  assert.equal(s.view, 'net', 'side no vale con graph=aon');
  s = S.reduce(s, { type: 'graph', value: 'aoa', step: 0 }, 32);
  assert.equal(s.graph, 'aoa');
  s = S.reduce(s, { type: 'set', key: 'view', value: 'side' }, 32);
  assert.equal(s.view, 'side');
  s = S.reduce(s, { type: 'set', key: 'view', value: 'matrix' }, 32);
  assert.equal(s.view, 'side', 'matrix no vale con graph=aoa');
  s = S.reduce(s, { type: 'set', key: 'min', value: 1 }, 32);
  assert.equal(s.min, 1);
  s = S.reduce(s, { type: 'set', key: 'min', value: 7 }, 32);
  assert.equal(s.min, 1);
  s = S.reduce(s, { type: 'set', key: 'graph', value: 'aon' }, 32);
  assert.equal(s.graph, 'aoa', 'graph solo cambia con la acción graph, que fija el paso');
});

test('F2a: cambiar de red ajusta la vista y lleva al paso indicado', () => {
  let s = S.reduce(s0(), { type: 'set', key: 'view', value: 'matrix' }, 32);
  s = S.reduce(s, { type: 'go', n: 9 }, 32);
  s = S.reduce(s, { type: 'graph', value: 'aoa', step: 0 }, 32);
  assert.deepEqual([s.graph, s.view, s.step], ['aoa', 'net', 0]);
  s = S.reduce(s, { type: 'set', key: 'view', value: 'side' }, 32);
  s = S.reduce(s, { type: 'graph', value: 'aon', step: 30 }, 32);
  assert.deepEqual([s.graph, s.view, s.step], ['aon', 'net', 30]);
  assert.equal(S.reduce(s, { type: 'graph', value: 'xyz', step: 0 }, 32).graph, 'aon');
});

test('F2a: los ejemplos solo de estructura solo se abren en PERT', () => {
  let s = S.reduce(s0(), { type: 'example', id: 'ej1' }, 32);
  assert.deepEqual([s.ex, s.graph], ['ej1', 'aoa']);
  s = S.reduce(s, { type: 'graph', value: 'aon', step: 0 }, 32);
  assert.equal(s.graph, 'aoa', 'ej1 no tiene duraciones: no hay red ROY');
  s = S.reduce(s, { type: 'example', id: 'ej6' }, 32);
  assert.equal(s.graph, 'aoa', 'cambiar a un ejemplo con duraciones conserva la red');
});

test('F2a: paso equivalente al cambiar de red (plan §4)', () => {
  const roy = ['table', 'build', 'forward', 'forward', 'backward', 'backward', 'float', 'critical', 'gantt'].map((kind) => ({ kind }));
  const pert = ['succTable', 'ruleEqual', 'ruleContained', 'ruleShared', 'place', 'number', 'eventForward', 'eventBackward', 'eventSlack', 'floats', 'critical'].map((kind) => ({ kind }));
  assert.equal(S.equivalentStep(roy, 0, pert), 0);
  assert.equal(S.equivalentStep(roy, 1, pert), 0);
  assert.equal(S.equivalentStep(roy, 3, pert), 0, 'a mitad de la pasada hacia delante');
  assert.equal(S.equivalentStep(roy, 5, pert), 10, 'todos los tiempos revelados → camino crítico');
  assert.equal(S.equivalentStep(roy, 8, pert), 10);
  assert.equal(S.equivalentStep(pert, 3, roy), 0);
  assert.equal(S.equivalentStep(pert, 6, roy), 0);
  assert.equal(S.equivalentStep(pert, 7, roy), 7);
  assert.equal(S.equivalentStep(pert, 10, roy), 7);
});

test('F2b (T017): el comparador es una vista de la red PERT, con métodos visibles y par en la lista blanca', () => {
  let s = Object.assign(U.defaults(), { graph: 'aoa' });
  s = S.reduce(s, { type: 'set', key: 'view', value: 'cmp' }, 32);
  assert.equal(s.view, 'cmp');
  assert.equal(S.reduce(Object.assign({}, s, { graph: 'aon', view: 'net' }), { type: 'set', key: 'view', value: 'cmp' }, 32).view, 'net', 'no en la red ROY');
  assert.equal(S.reduce(s, { type: 'graph', value: 'aon', step: 0 }, 32).view, 'net', 'al pasar a ROY se deja el comparador');
  // Métodos: en el orden del comparador, al menos uno, solo de la lista.
  assert.deepEqual(S.reduce(s, { type: 'methods', value: ['min', 'cgl', 'prog'] }, 32).ms, ['prog', 'cgl', 'min']);
  assert.deepEqual(S.reduce(s, { type: 'methods', value: [] }, 32).ms, s.ms);
  assert.deepEqual(S.reduce(s, { type: 'methods', value: ['prog', 'xyz'] }, 32).ms, s.ms);
  assert.deepEqual(S.reduce(s, { type: 'methods', value: ['prog', 'prog'] }, 32).ms, s.ms);
  // Par: dos métodos distintos, o null para volver a todos.
  const p = S.reduce(s, { type: 'pair', value: ['rules', 'prog'] }, 32);
  assert.deepEqual(p.pair, ['rules', 'prog']);
  assert.equal(S.reduce(p, { type: 'pair', value: null }, 32).pair, null);
  for (const bad of [['rules', 'rules'], ['rules'], ['rules', 'xyz'], 'rules']) assert.deepEqual(S.reduce(p, { type: 'pair', value: bad }, 32).pair, ['rules', 'prog']);
  assert.equal(S.reduce(s, { type: 'set', key: 'm', value: 'prog' }, 32).m, 'prog');
  assert.equal(S.reduce(s, { type: 'set', key: 'm', value: 'kim' }, 32).m, 'rules');
  assert.equal(S.reduce(s, { type: 'set', key: 'ms', value: ['kim'] }, 32).ms, s.ms, 'ms solo cambia con «methods»');
});

test('F2b (T021): el reto es una vista de la red PERT; la red del alumno se cambia con «sn» y otro ejemplo la borra', () => {
  let s = Object.assign(U.defaults(), { graph: 'aoa' });
  s = S.reduce(s, { type: 'set', key: 'view', value: 'reto' }, 32);
  assert.equal(s.view, 'reto');
  assert.equal(S.reduce(Object.assign({}, s, { graph: 'aon', view: 'net' }), { type: 'set', key: 'view', value: 'reto' }, 32).view, 'net', 'no en la red ROY');
  assert.equal(S.reduce(s, { type: 'graph', value: 'aon', step: 0 }, 32).view, 'net', 'al pasar a ROY se deja el reto');
  const sn = { events: [{ id: 0, n: 1 }], arcs: [{ act: 'A', from: 0, to: null }], dummies: [] };
  s = S.reduce(s, { type: 'sn', value: sn }, 32);
  assert.deepEqual(s.sn, sn);
  for (const bad of [{ events: [] }, 'x', 3, undefined]) assert.deepEqual(S.reduce(s, { type: 'sn', value: bad }, 32).sn, sn, String(bad));
  assert.equal(S.reduce(s, { type: 'sn', value: null }, 32).sn, null);
  assert.equal(S.reduce(s, { type: 'example', id: 'ej1' }, 32).sn, null, 'la red era de otra tabla');
  assert.deepEqual(S.reduce(s, { type: 'example', id: 'nope' }, 32).sn, sn);
});

// ── F2c (T007): M0 ─────────────────────────────────────────────────────────────────────────────────────────
test('F2c: entrar en M0 con un enunciado deja la tabla y los subrayados vacíos y la práctica en el paso 0', () => {
  let s = Object.assign(s0(), { step: 9, t: [{ id: 'A', name: '', duration: '1', links: '' }], ex: null });
  s = S.reduce(s, { type: 'm0', st: 'ej2' });
  assert.equal(s.v, 'm0'); assert.equal(s.st, 'ej2'); assert.equal(s.step, 0);
  assert.equal(s.t, null); assert.equal(s.mk, null); assert.equal(s.mm, 'practice'); assert.equal(s.own, null);
  assert.equal(S.reduce(s, { type: 'm0', st: 'nada' }).st, 'ej2');
  assert.equal(S.reduce(s0(), { type: 'm0' }).st, 'ej5');
});

test('F2c: enunciado propio en M0', () => {
  const own = { lang: 'en', text: 'A then B.', frags: [], ref: null };
  const s = S.reduce(s0(), { type: 'm0', st: 'own', own, mm: 'prepare' });
  assert.equal(s.st, 'own'); assert.deepEqual(s.own, own); assert.equal(s.mm, 'prepare');
  assert.equal(S.reduce(s0(), { type: 'm0', st: 'own' }).st, 'ej5');   // sin enunciado no hay «own»
});

test('F2c: vista, modo y solución de M0 con lista blanca', () => {
  let s = S.reduce(s0(), { type: 'm0', st: 'ej5' });
  s = S.reduce(s, { type: 'set', key: 'tv', value: 'matrix' });
  s = S.reduce(s, { type: 'set', key: 'mm', value: 'route' });
  s = S.reduce(s, { type: 'set', key: 'sol', value: 1 });
  assert.deepEqual([s.tv, s.mm, s.sol], ['matrix', 'route', 1]);
  s = S.reduce(s, { type: 'set', key: 'tv', value: 'grid' });
  assert.equal(s.tv, 'matrix');
});

test('F2c: subrayados del alumno válidos, o nada', () => {
  const marks = [{ from: 0, to: 2, kind: 'activity', act: 'A' }, { from: 3, to: 3, kind: 'precedence', gives: [['A', 'B']] }];
  let s = S.reduce(s0(), { type: 'marks', value: marks });
  assert.deepEqual(s.mk, marks);
  assert.notEqual(s.mk, marks);
  s = S.reduce(s, { type: 'marks', value: [{ from: 3, to: 1, kind: 'activity' }] });
  assert.deepEqual(s.mk, marks);
  assert.equal(S.reduce(s, { type: 'marks', value: null }).mk, null);
  assert.equal(S.reduce(s, { type: 'marks', value: [] }).mk, null);
});

test('F2c (T015) · AC15: «open» abre una tabla en la ruta (ROY o PERT) o en el taller desde el paso 0, sin la vista anterior', () => {
  const rows = [{ id: 'A', name: '', duration: '1', links: '' }];
  const base = Object.assign(U.defaults(), { v: 'm0', st: 'ej5', ex: null, view: 'net', min: 1, m: 'prog', sn: { events: [], arcs: [], dummies: [] }, wi: [['A', 3]], step: 4 });
  const r = S.reduce(base, { type: 'open', v: 'route', graph: 'aoa', rows, mode: 'succ' }, 1);
  assert.deepEqual([r.v, r.graph, r.step, r.view, r.mode, r.min, r.m, r.sn, r.wi, r.ex], ['route', 'aoa', 0, 'net', 'succ', 0, 'rules', null, null, null]);
  assert.deepEqual(r.t, rows);
  assert.notEqual(r.t, rows, 'copia las filas');
  assert.equal(S.reduce(base, { type: 'open', v: 'work', graph: 'aon', rows, mode: 'pred' }, 1).v, 'work');
  const bad = S.reduce(base, { type: 'open', v: 'nada', graph: 'aon', rows, mode: 'pred' }, 1);
  assert.equal(bad.v, 'm0', 'un destino desconocido no cambia nada');
});

test('T021: un enunciado propio puede llegar con su tabla, sus subrayados y su forma (preparar y abrir con la solución)', () => {
  const own = { lang: 'es', text: 'Pintar y luego barrer.', frags: [], ref: null };
  const rows = [{ id: 'A', name: 'Pintar', duration: '', links: '' }, { id: 'B', name: 'Barrer', duration: '', links: '' }];
  const marks = [{ from: 0, to: 0, kind: 'activity', act: 'A' }, { from: 3, to: 3, kind: 'activity', act: 'B' }];
  const s = S.reduce(Object.assign(s0(), { step: 5 }), { type: 'm0', st: 'own', own, rows, marks, mode: 'succ', mm: 'prepare' });
  assert.deepEqual([s.v, s.st, s.mm, s.mode, s.step, s.sol], ['m0', 'own', 'prepare', 'succ', 0, 0]);
  assert.deepEqual(s.own, own);
  assert.deepEqual(s.t, rows);
  assert.notEqual(s.t, rows, 'copia, no la misma lista');
  assert.deepEqual(s.mk, marks);
  // Lo que no valida no entra: subrayados rotos o forma desconocida.
  const bad = S.reduce(s0(), { type: 'm0', st: 'own', own, rows, marks: [{ from: 3, to: 1, kind: 'activity' }], mode: 'x' });
  assert.equal(bad.mk, null);
  assert.equal(bad.mode, 'pred');
  // Con un enunciado de la herramienta, la tabla y los subrayados siguen empezando vacíos.
  const tool = S.reduce(s0(), { type: 'm0', st: 'ej2', rows, marks });
  assert.equal(tool.t, null); assert.equal(tool.mk, null);
});
