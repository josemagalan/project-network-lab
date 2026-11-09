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

test('el "¿y si…?" tiene límites: duraciones de 12 caracteres como mucho y un par por fila (revisión, F15)', () => {
  const huge = U.decode(`#wi=E:${'9'.repeat(400)};G:3`);
  assert.deepEqual(huge.state.wi, [['G', 3]], 'una duración enorme no llega como Infinity');
  assert.equal(huge.warning, 'malformed');
  const edge = U.decode(`#wi=E:${'9'.repeat(U.LIMITS.duration)}`);
  assert.deepEqual(edge.state.wi, [['E', Number('9'.repeat(U.LIMITS.duration))]], 'en el límite se acepta');
  assert.equal(edge.warning, undefined);
  const many = U.decode('#wi=' + Array.from({ length: U.LIMITS.rows + 5 }, (_, i) => `A${i}:1`).join(';'));
  assert.equal(many.state.wi.length, U.LIMITS.rows);
  assert.equal(many.warning, 'malformed');
  const ok = U.decode('#wi=' + Array.from({ length: U.LIMITS.rows }, (_, i) => `A${i}:1`).join(';'));
  assert.equal(ok.state.wi.length, U.LIMITS.rows);
  assert.equal(ok.warning, undefined);
});

// ---------- Fase 2a (T011): red PERT en la URL (AC11, plan P4) ----------

test('AC11: ida y vuelta exacta con la red PERT, la vista lado a lado y la red mínima', () => {
  const s = Object.assign(U.defaults(), { graph: 'aoa', view: 'side', min: 1, ex: 'ej7', step: 12, lang: 'es' });
  const out = U.decode(U.encode(s));
  assert.equal(out.warning, undefined);
  assert.deepEqual(out.state, s);
});

test('AC11: un enlace de la fase 1 (sin graph) se decodifica como antes, en la red ROY', () => {
  const { state, warning } = U.decode('#v=route&ex=ej6&step=7&view=matrix&lang=en&nota=es&box=4&mode=pred&pred=1');
  assert.equal(warning, undefined);
  assert.equal(state.graph, 'aon');
  assert.equal(state.min, 0);
  assert.equal(state.view, 'matrix');
  assert.equal(state.step, 7);
});

test('AC11: el estado por defecto se codifica sin graph ni min, así que los enlaces de ROY no cambian', () => {
  const hash = U.encode(Object.assign(U.defaults(), { step: 3 }));
  assert.ok(!/(^|[#&])graph=/.test(hash), hash);
  assert.ok(!/(^|[#&])min=/.test(hash), hash);
  assert.match(U.encode(Object.assign(U.defaults(), { graph: 'aoa' })), /graph=aoa/);
});

test('combinaciones de vista imposibles vuelven a la vista de red con aviso', () => {
  const a = U.decode('#graph=aoa&view=matrix');
  assert.deepEqual([a.state.graph, a.state.view, a.warning], ['aoa', 'net', 'malformed']);
  const b = U.decode('#view=side');
  assert.deepEqual([b.state.graph, b.state.view, b.warning], ['aon', 'net', 'malformed']);
});

test('valores desconocidos de graph y min vuelven a su valor por defecto con aviso', () => {
  const a = U.decode('#graph=pert');
  assert.deepEqual([a.state.graph, a.warning], ['aon', 'malformed']);
  const b = U.decode('#graph=aoa&min=2');
  assert.deepEqual([b.state.min, b.warning], [0, 'malformed']);
});

test('los ejercicios de la fase 2a se pueden abrir por la URL', () => {
  for (const ex of ['ej1', 'ej2', 'ej3', 'ej7']) {
    const { state, warning } = U.decode(`#graph=aoa&ex=${ex}`);
    assert.equal(warning, undefined, ex);
    assert.equal(state.ex, ex);
  }
});

test('F2a: un ejemplo solo de estructura con graph=aon abre la red PERT con aviso propio', () => {
  for (const id of ['ej1', 'ej2', 'ej3']) {
    const { state, warning } = U.decode(`#v=route&ex=${id}&view=matrix`);
    assert.deepEqual([state.graph, state.view, warning], ['aoa', 'net', 'structureOnly'], id);
  }
  assert.equal(U.decode('#v=route&ex=ej1&graph=aoa').warning, undefined);
  // F2b (T006): las tablas de las fuentes de los métodos también son solo de estructura.
  assert.deepEqual(U.STRUCTURE_ONLY, ['ej1', 'ej2', 'ej3', 'kim2008', 'cs2007', 'syslo1981', 'tipo']);
  assert.deepEqual(U.decode('#v=route&ex=kim2008').state.graph, 'aoa');
});

test('Revisión F2: un ejemplo solo de estructura no tiene vista lado a lado (no hay red ROY): se abre la red PERT sola', () => {
  for (const id of ['ej1', 'ej2', 'ej3']) {
    const { state, warning } = U.decode(`#v=route&graph=aoa&ex=${id}&view=side`);
    assert.deepEqual([state.graph, state.view, warning], ['aoa', 'net', 'malformed'], id);
  }
  // Con un ejemplo con duraciones, lado a lado sigue valiendo.
  const ok = U.decode('#v=route&graph=aoa&ex=ej7&view=side');
  assert.deepEqual([ok.state.view, ok.warning], ['side', undefined]);
});
