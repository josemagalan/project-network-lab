'use strict';
// core/urlstate: todo el estado de la página en el #hash, con ida y vuelta exacta (AC8, AC19)
// y decodificación defensiva con lista blanca (constitución, principio 22).
const test = require('node:test');
const assert = require('node:assert/strict');
const U = require('../js/core/urlstate.js');

test('el estado por defecto es la ruta guiada del Ejercicio 6 en el paso 0', () => {
  const { state, warning } = U.decode('');
  assert.equal(warning, undefined);
  assert.deepEqual(state, U.defaults());
  assert.equal(state.v, 'route');
  assert.equal(state.ex, 'ej6');
  assert.equal(state.step, 0);
});

test('AC8: ida y vuelta exacta de un estado completo de la ruta', () => {
  const s = Object.assign(U.defaults(), { step: 17, view: 'matrix', lang: 'en', nota: 'es', box: 'c', pred: 1, wi: [['E', 6], ['F', 2.5]] });
  const out = U.decode(U.encode(s));
  assert.equal(out.warning, undefined);
  assert.deepEqual(out.state, s);
});

test('AC19: ida y vuelta exacta de una tabla del taller, aunque tenga errores o textos raros', () => {
  const rows = [
    { id: 'A', name: 'Excavar, nivelar; «ñ» & <b>', duration: '2,5', links: '' },
    { id: 'b', name: '', duration: '-3', links: 'A, Z' },
    { id: '', name: '', duration: '', links: '' },
  ];
  const s = Object.assign(U.defaults(), { v: 'work', ex: null, t: rows, mode: 'succ', step: 3 });
  const out = U.decode(U.encode(s));
  assert.equal(out.warning, undefined);
  assert.deepEqual(out.state, s);
});

test('acepta el hash con o sin almohadilla', () => {
  const h = U.encode(Object.assign(U.defaults(), { step: 2 }));
  assert.equal(U.decode('#' + h.replace(/^#/, '')).state.step, 2);
  assert.equal(U.decode(h.replace(/^#/, '')).state.step, 2);
});

test('un parámetro desconocido se ignora con aviso', () => {
  const { state, warning } = U.decode('#v=route&step=4&foo=bar');
  assert.equal(state.step, 4);
  assert.equal(warning, 'unknownParam');
  assert.equal(Object.prototype.hasOwnProperty.call(state, 'foo'), false);
});

test('valores fuera de la lista blanca vuelven a su valor por defecto con aviso', () => {
  const { state, warning } = U.decode('#v=hack&view=3d&lang=fr&nota=xx&box=9&mode=both&pred=7&step=-2&ex=../../etc');
  assert.equal(warning, 'malformed');
  const d = U.defaults();
  for (const k of ['v', 'view', 'lang', 'nota', 'box', 'mode', 'pred', 'step', 'ex']) assert.equal(state[k], d[k], k);
});

test('un paso no entero o enorme no rompe nada', () => {
  assert.equal(U.decode('#step=2.5').state.step, 0);
  assert.equal(U.decode('#step=1e9').state.step, 0);
  assert.equal(U.decode('#step=12').state.step, 12);
});

test('una tabla mal codificada se descarta: ejemplo por defecto y aviso', () => {
  const { state, warning } = U.decode('#v=work&t=%E0%A4%A');
  assert.equal(warning, 'malformed');
  assert.equal(state.t, null);
  assert.equal(state.v, 'route');
  assert.equal(state.ex, 'ej6');
});

test('un hash enorme se rechaza entero', () => {
  const { state, warning } = U.decode('#t=' + 'A'.repeat(20000));
  assert.equal(warning, 'malformed');
  assert.deepEqual(state, U.defaults());
});

test('la tabla se limita en filas y longitud de campos', () => {
  const rows = Array.from({ length: 80 }, (_, i) => ({ id: 'A' + i, name: 'x'.repeat(500), duration: '1', links: '' }));
  const s = Object.assign(U.defaults(), { v: 'work', ex: null, t: rows });
  const out = U.decode(U.encode(s)).state;
  assert.ok(out.t.length <= U.LIMITS.rows);
  assert.ok(out.t.every((r) => r.name.length <= U.LIMITS.name));
});

test('el "¿y si…?" solo admite identificadores válidos y duraciones no negativas', () => {
  const { state, warning } = U.decode('#wi=E:6;bad id:2;F:-1;G:3');
  assert.deepEqual(state.wi, [['E', 6], ['G', 3]]);
  assert.equal(warning, 'malformed');
});
