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

// ── T027 (F12): los dos reinicios de M0 que no tenían prueba ───────────────────────────────────────────────
test('T027 · cambiar de enunciado quita los subrayados del anterior; abrir M1 o M2 empieza en la red', () => {
  const marked = Object.assign(s0(), { v: 'm0', st: 'ej5', ex: null, mk: [{ from: 0, to: 2, kind: 'activity', act: 'A' }] });
  assert.equal(S.reduce(marked, { type: 'm0', st: 'ej2' }).mk, null);
  const rows = [{ id: 'A', name: '', duration: '', links: '' }];
  const inMatrix = Object.assign(s0(), { v: 'm0', st: 'ej5', ex: null, graph: 'aon', view: 'matrix' });
  assert.equal(S.reduce(inMatrix, { type: 'open', v: 'route', graph: 'aon', rows, mode: 'pred' }, 1).view, 'net');
});

test('T027 (ronda 2, F10) · volver a elegir el mismo enunciado también lo empieza de cero', () => {
  const marked = Object.assign(s0(), { v: 'm0', st: 'ej5', ex: null, mk: [{ from: 0, to: 2, kind: 'activity', act: 'A' }], t: [{ id: 'A', name: '', duration: '', links: '' }] });
  const again = S.reduce(marked, { type: 'm0', st: 'ej5' });
  assert.equal(again.mk, null);
  assert.equal(again.t, null);
});

// ---------- F3a: «Ejercicios» (spec f3a-generador-calculo, AC10 y AC11; plan §3 y T007) ----------

test('F3a: ex abre un ejercicio nuevo; conserva lo que no se cambia y quita respuestas, entrega y versión', () => {
  let s = Object.assign(s0(), { v: 'work', t: [{ id: 'A', duration: '2', links: '' }], ex: null, wi: [['A', 3]], step: 4 });
  s = S.reduce(s, { type: 'ex', sd: 17 }, 1);
  assert.deepEqual([s.v, s.sd, s.lv, s.xm, s.t, s.ex, s.wi, s.step, s.ans, s.xd], ['ex', 17, 'medium', 'practice', null, null, null, 0, null, 0]);
  s = Object.assign({}, s, { ans: { act: {}, dur: '3', ev: {}, crit: [], paths: [] }, xd: 1, gv: 1 });
  s = S.reduce(s, { type: 'ex', lv: 'hard', sd: 18, xm: 'exam', ask: ['times', 'events'] }, 1);
  assert.deepEqual([s.lv, s.sd, s.xm, s.ask, s.ans, s.xd, s.gv], ['hard', 18, 'exam', ['times', 'events'], null, 0, null]);
  s = S.reduce(s, { type: 'ex', lv: 'custom', gp: { n: [5, 8], pred: 1.4, dummies: [0, 2], critical: [1, 2], dmax: 7 }, sd: 19 }, 1);
  assert.deepEqual(s.gp, { n: [5, 8], pred: 1.4, dummies: [0, 2], critical: [1, 2], dmax: 7 });
  // lo que no valida no se aplica
  const t = S.reduce(s, { type: 'ex', lv: 'x', sd: 0, xm: 'quiz', ask: ['nope'], gp: { n: [1, 2] } }, 1);
  assert.deepEqual([t.lv, t.sd, t.xm, t.ask, t.gp], [s.lv, s.sd, s.xm, s.ask, s.gp]);
  // un nivel fijo quita los parámetros personalizados
  assert.equal(S.reduce(s, { type: 'ex', lv: 'easy', sd: 20 }, 1).gp, null);
});

test('F3a: exAnswer guarda las respuestas (vacías → null) y no cambia nada tras entregar; exDeliver solo en Examen', () => {
  let s = S.reduce(s0(), { type: 'ex', sd: 3 }, 1);
  const ans = { act: { A: { ES: '0', EF: '2', LS: '', LF: '', TF: '', FF: '', IF: '', SF: '' } }, dur: '', ev: {}, crit: [], paths: [] };
  s = S.reduce(s, { type: 'exAnswer', ans }, 1);
  assert.deepEqual(s.ans, ans);
  assert.equal(S.reduce(s, { type: 'exAnswer', ans: { act: { a: {} } } }, 1).ans, s.ans);   // no válida: no se aplica
  assert.equal(S.reduce(s, { type: 'exAnswer', ans: null }, 1).ans, null);
  assert.equal(S.reduce(s, { type: 'exDeliver' }, 1).xd, 0);                                 // Practicar no se entrega
  s = S.reduce(s, { type: 'ex', xm: 'exam', sd: 3 }, 1);
  s = S.reduce(s, { type: 'exAnswer', ans }, 1);
  s = S.reduce(s, { type: 'exDeliver' }, 1);
  assert.equal(s.xd, 1);
  assert.equal(S.reduce(s, { type: 'exAnswer', ans: null }, 1).ans, s.ans);                  // entregado: bloqueado
});

test('F3a: «Tabla al azar» usa la acción work del taller con las filas generadas', () => {
  const rows = [{ id: 'A', duration: '3', links: '' }, { id: 'B', duration: '2', links: 'A' }];
  const s = S.reduce(Object.assign(s0(), { v: 'work', ex: 'ej6' }), { type: 'work', rows, mode: 'pred' }, 1);
  assert.deepEqual([s.v, s.ex, s.mode], ['work', null, 'pred']);
  assert.deepEqual(s.t, rows);
  assert.notEqual(s.t[0], rows[0]);
});

// ---------- F4a (T007): la pestaña de tres tiempos y el TCL ----------
test('F4a: acción unc: abre la pestaña y solo acepta valores válidos; el cambio de proyecto o de caso vuelve al paso 0', () => {
  let s = S.reduce(Object.assign(U.defaults(), { step: 5 }), { type: 'unc' }, 10);
  assert.deepEqual([s.v, s.step], ['unc', 0]);
  assert.equal(s.ex, 'ej6');   // el ejemplo de la ruta y la tabla del taller se conservan para volver a ellos
  s = S.reduce(s, { type: 'unc', um: 'm6', ux: 'merge', uk: { n: 3, s: 1 }, us: 77, ud: 22 }, 10);
  assert.deepEqual([s.um, s.ux, s.uk, s.us, s.ud], ['m6', 'merge', { n: 3, s: 1 }, 77, 22]);
  const same = S.reduce(s, { type: 'unc', um: 'nada', ux: 'nada', uk: { n: 99 }, us: -1, ud: 'x', up: 3, ue: 'zz', uc: 5, ua: '??' }, 10);
  for (const k of ['um', 'ux', 'uk', 'us', 'ud', 'up', 'ue', 'uc', 'ua']) assert.deepEqual(same[k], s[k], k);
  s = S.reduce(Object.assign({}, s, { step: 3 }), { type: 'unc', ue: 'hl' }, 10);
  assert.equal(s.step, 0);
  s = S.reduce(Object.assign({}, s, { step: 3 }), { type: 'unc', up: 0.95, ud: null }, 10);
  assert.deepEqual([s.up, s.ud, s.step], [0.95, null, 0]);
  // Los casos del Tema 6c solo en M6: al volver a M5, el proyecto pasa a Klastorin.
  s = S.reduce(Object.assign({}, s, { um: 'm6' }), { type: 'unc', ue: 'tr' }, 10);
  assert.equal(s.ue, 'tr');
  s = S.reduce(s, { type: 'unc', um: 'm5' }, 10);
  assert.equal(s.ue, 'kl');
});

test('F4a: partir del taller copia ids, nombres y precedencias con a = m = b = duración; el taller no cambia (AC12)', () => {
  const t = [{ id: 'A', name: 'Uno', duration: '3', links: '' }, { id: 'B', name: '', duration: '2.5', links: 'A' }];
  const work = Object.assign(U.defaults(), { v: 'work', t, mode: 'pred' });
  const s = S.reduce(work, { type: 'uncFromWork', rows: t, mode: 'pred' }, 10);
  assert.deepEqual([s.v, s.ue, s.ua, s.step], ['unc', 'own', null, 0]);
  assert.deepEqual(s.ut, { mode: 'pred', rows: [{ id: 'A', name: 'Uno', a: '3', m: '3', b: '3', links: '' },
    { id: 'B', name: '', a: '2.5', m: '2.5', b: '2.5', links: 'A' }] });
  assert.deepEqual(work.t, t);
  assert.deepEqual(s.t, t);   // la tabla del taller sigue en el estado para volver a él
  // Tabla solo de estructura o con errores: se copia tal cual (A8).
  const raw = [{ id: 'A', duration: '', links: 'Z' }, { id: '', duration: 'x', links: '' }];
  const r = S.reduce(work, { type: 'uncFromWork', rows: raw, mode: 'succ' }, 10);
  assert.deepEqual(r.ut, { mode: 'succ', rows: [{ id: 'A', name: '', a: '', m: '', b: '', links: 'Z' }, { id: '', name: '', a: 'x', m: 'x', b: 'x', links: '' }] });
});

test('F4a: editar la tabla propia (uncTable) guarda las filas como texto y pasa a ue=own', () => {
  const rows = [{ id: 'A', name: '', a: '1', m: '2', b: '9', links: '' }];
  const s = S.reduce(Object.assign(U.defaults(), { v: 'unc' }), { type: 'uncTable', rows, mode: 'pred' }, 10);
  assert.deepEqual([s.ue, s.ut], ['own', { mode: 'pred', rows }]);
  rows[0].a = '5';
  assert.equal(s.ut.rows[0].a, '1');   // copia, no referencia
});

test('F4a T011: «uw» (paso a paso) es 0 o 1 y cambiarlo vuelve al paso 0; la URL lo guarda', () => {
  let s = S.reduce(Object.assign(U.defaults(), { v: 'unc', step: 4 }), { type: 'unc', uw: 1 }, 10);
  assert.deepEqual([s.uw, s.step], [1, 0]);
  s = S.reduce(Object.assign({}, s, { step: 3 }), { type: 'unc', uw: 7 }, 10);
  assert.deepEqual([s.uw, s.step], [1, 3]);
  assert.match(U.encode(s), /[#&]uw=1(&|$)/);
  assert.equal(U.decode(U.encode(s)).state.uw, 1);
  assert.doesNotMatch(U.encode(Object.assign({}, s, { uw: 0 })), /uw=/);
  assert.equal(U.decode('#v=unc&uw=2').warning, 'malformed');
});

// ---------- Revisión de nivel 2 de la F4a (T017, ronda 1) ----------

test('F4a r1 (F13): otro proyecto vuelve a su plazo y, si se pedía el plazo para una probabilidad, al 95 % (decisión del autor)', () => {
  const unc = (extra) => Object.assign(s0(), { v: 'unc', um: 'm6', ue: 'kl', ux: 'exam' }, extra);
  const a = S.reduce(unc({ ud: 30 }), { type: 'unc', ue: 'hl' });
  assert.deepEqual([a.ue, a.ud, a.up], ['hl', null, null]);
  const b = S.reduce(unc({ up: 0.9 }), { type: 'unc', ue: 'hl' });
  assert.deepEqual([b.ud, b.up], [null, 0.95]);
  // En el mismo proyecto, el plazo escrito se queda; y cambiar el proyecto y el plazo a la vez deja el plazo nuevo.
  assert.equal(S.reduce(unc({ ud: 30 }), { type: 'unc', ux: 'proj' }).ud, 30);
  assert.equal(S.reduce(unc({ ud: 30 }), { type: 'unc', ue: 'hl', ud: 50 }).ud, 50);
  // «Partir del taller» y pasar a la tabla propia también vuelven al plazo por defecto; editar la tabla propia, no.
  const w = S.reduce(unc({ ud: 30 }), { type: 'uncFromWork', mode: 'pred', rows: [{ id: 'A', name: '', duration: '4', links: '' }] });
  assert.deepEqual([w.ue, w.ud, w.ua], ['own', null, null]);
  const own = S.reduce(unc({ ud: 30 }), { type: 'uncTable', mode: 'pred', rows: [{ id: 'A', name: '', a: '1', m: '2', b: '3', links: '' }] });
  assert.deepEqual([own.ue, own.ud], ['own', null]);
  assert.equal(S.reduce(Object.assign({}, own, { ud: 7 }), { type: 'uncTable', mode: 'pred', rows: [{ id: 'A', name: '', a: '1', m: '2', b: '4', links: '' }] }).ud, 7);
});

test('F4b T008: acción unc con M7: valores válidos, ejemplos discretos solo en M7, otro proyecto borra uf y uq, y vuelve al paso 0', () => {
  let s = S.reduce(U.defaults(), { type: 'unc', um: 'm7' }, 10);
  assert.equal(s.um, 'm7');
  s = S.reduce(s, { type: 'unc', ue: 'kd' }, 10);
  assert.equal(s.ue, 'kd');
  s = S.reduce(s, { type: 'unc', ug: 'unif', ur: 3, uv: 90, uo: 's', uy: 'idx', ui: 'cu', uf: { A: 'disc' }, uq: { A: { x: ['1'], p: ['1'] } } }, 10);
  assert.deepEqual([s.ug, s.ur, s.uv, s.uo, s.uy, s.ui, s.uf, s.uq], ['unif', 3, 90, 's', 'idx', 'cu', { A: 'disc' }, { A: { x: ['1'], p: ['1'] } }]);
  const same = S.reduce(s, { type: 'unc', ug: 'disc', ur: 9, uv: 0, uo: 'x', uy: 'x', ui: 'x', uf: { 'A?': 'unif' }, uq: { A: 'x' } }, 10);
  for (const k of ['ug', 'ur', 'uv', 'uo', 'uy', 'ui', 'uf', 'uq']) assert.deepEqual(same[k], s[k], k);
  s = S.reduce(Object.assign({}, s, { step: 4 }), { type: 'unc', uy: 'rep' }, 10);
  assert.equal(s.step, 0);
  s = S.reduce(Object.assign({}, s, { step: 4 }), { type: 'unc', ur: 5 }, 10);
  assert.equal(s.step, 0);
  s = S.reduce(Object.assign({}, s, { step: 4 }), { type: 'unc', ui: 'si' }, 10);
  assert.equal(s.step, 4, 'el índice de la red no cambia las réplicas');
  s = S.reduce(s, { type: 'unc', ue: 'wa' }, 10);
  assert.deepEqual([s.ue, s.uf, s.uq], ['wa', null, null]);
  s = S.reduce(s, { type: 'unc', um: 'm6' }, 10);
  assert.equal(s.ue, 'kl', 'un ejemplo discreto fuera de M7 vuelve a Klastorin');
  s = S.reduce(Object.assign({}, s, { um: 'm6', ue: 'tr' }), { type: 'unc', um: 'm7' }, 10);
  assert.equal(s.ue, 'kl', 'los casos del Tema 6c no existen en M7');
  s = S.reduce(s, { type: 'unc', uf: null, uq: null }, 10);
  assert.deepEqual([s.uf, s.uq], [null, null]);
});

test('F4b T010: la acción unc acepta el orden del tornado (uz) y no vuelve al paso 0 por él', () => {
  let s = S.reduce(Object.assign(U.defaults(), { v: 'unc', um: 'm7', step: 3 }), { type: 'unc', uz: 'u' }, 10);
  assert.equal(s.uz, 'u');
  assert.equal(s.step, 3);
  s = S.reduce(s, { type: 'unc', uz: 'x' }, 10);
  assert.equal(s.uz, 'u');
});
