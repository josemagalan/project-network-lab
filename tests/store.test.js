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
