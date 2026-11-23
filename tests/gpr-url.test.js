'use strict';
// F5a T008: la URL de la pestaña de las precedencias generalizadas (v=gpr) y la acción «Partir del taller»
// (spec f5a-precedencias-generalizadas, AC7 y AC12; plan §3, P5; analyze A4).
const test = require('node:test');
const assert = require('node:assert/strict');
const U = require('../js/core/urlstate.js');
const S = require('../js/store.js');
const G = require('../js/core/gpr.js');

const gpr = (extra) => Object.assign(U.defaults(), { v: 'gpr' }, extra);
const round = (s) => U.decode(U.encode(s));

test('F5a T008: valores por defecto y enlace mínimo', () => {
  const d = U.defaults();
  assert.deepEqual([d.qe, d.qt, d.qn, d.qg, d.qr, d.qw], ['fc', null, 'both', 0, null, null]);
  const h = U.encode(gpr());
  assert.doesNotMatch(h, /q[etngrw]=/);
  assert.equal(round(gpr()).state.v, 'gpr');
  assert.equal(round(gpr()).warning, undefined);
});

test('F5a T008: ida y vuelta con todas las claves', () => {
  const t = [{ id: 'A', name: 'Uno', duration: '8', links: '' }, { id: 'B', name: '', duration: '7', links: 'A CC+3, A FF-1,5' }];
  const s = gpr({ qe: 'own', qt: t, qn: 'pert', qg: 2, qr: 1, qw: ['B', 4.5], step: 7, lang: 'es', nota: 'es', box: 'c', pred: 1 });
  const h = U.encode(s);
  for (const k of ['qe=own', 'qt=', 'qn=pert', 'qg=2', 'qr=1', 'qw=B%3A4.5', 'step=7', 'pred=1', 'box=c']) assert.ok(h.includes(k), k);
  const { state, warning } = U.decode(h);
  assert.equal(warning, undefined);
  for (const k of ['v', 'qe', 'qt', 'qn', 'qg', 'qr', 'qw', 'step', 'lang', 'nota', 'box', 'pred']) assert.deepEqual(state[k], s[k], k);
  // Cada ejemplo se guarda por su id.
  for (const qe of ['fc', 'cc', 'n16', 'rb', 'rv', 'cl']) assert.equal(round(gpr({ qe })).state.qe, qe);
});

test('F5a T008: la tabla propia en el límite (40 filas, 200 caracteres de relaciones) va y vuelve (A4)', () => {
  const links = Array.from({ length: 30 }, (_, i) => `A${i} CC+1`).join(', ').slice(0, 200);
  assert.equal(links.length, 200);
  const t = Array.from({ length: 40 }, (_, i) => ({ id: `A${i}`, name: 'x'.repeat(80), duration: '12345678.123', links: i ? links : '' }));
  const st = round(gpr({ qe: 'own', qt: t })).state;
  assert.deepEqual(st.qt, t);
  // Lo que pasa de los límites se recorta al guardar.
  const long = [{ id: 'A', name: '', duration: '1', links: 'B '.repeat(150) }];
  assert.equal(round(gpr({ qe: 'own', qt: long })).state.qt[0].links.length, 200);
  assert.ok(U.encodeSafe(gpr({ qe: 'own', qt: t })).hash);
});

test('F5a T008: valores malformados → el de siempre y aviso', () => {
  for (const h of ['#v=gpr&qe=xx', '#v=gpr&qn=all', '#v=gpr&qg=3', '#v=gpr&qr=-1', '#v=gpr&qr=120', '#v=gpr&qr=a', '#v=gpr&qw=B', '#v=gpr&qw=B%3A-1',
    '#v=gpr&qw=abcde%3A1', '#v=gpr&qe=own', '#v=gpr&qe=own&qt=zzz', '#v=gpr&qt=zzz']) {
    const { state, warning } = U.decode(h);
    assert.equal(warning, 'malformed', h);
    assert.equal(state.v, 'gpr', h);
    if (h.includes('qe=')) assert.notEqual(state.qe, 'xx');
  }
  assert.equal(U.decode('#v=gpr&qe=own').state.qe, 'fc');
});

test('F5a T008: las claves q* solo cuentan en v=gpr; los enlaces de las fases anteriores no cambian', () => {
  const { state } = U.decode('#v=route&ex=ej6&qe=rb&qn=pert&qr=2');
  assert.deepEqual([state.qe, state.qn, state.qr], ['fc', 'both', null]);
  for (const h of ['#v=route&ex=ej6&step=3&view=net&nota=en&box=7&mode=pred&pred=0', '#v=unc&step=0&nota=en', '#v=ex&step=0&view=net&nota=en&box=7&mode=pred&pred=0']) {
    assert.equal(U.encode(U.decode(h).state), h, h);
  }
});

test('F5a T008: partir del taller copia la tabla con FS+0; el taller no cambia (AC7)', () => {
  const t = [{ id: 'A', name: 'Uno', duration: '3', links: '' }, { id: 'B', name: '', duration: '2.5', links: 'A' }];
  const work = Object.assign(U.defaults(), { v: 'work', t, mode: 'pred', step: 5 });
  const s = S.reduce(work, { type: 'gprFromWork', rows: t, mode: 'pred' }, 10);
  assert.deepEqual([s.v, s.qe, s.step, s.qr, s.qw], ['gpr', 'own', 0, null, null]);
  assert.deepEqual(s.qt, t);
  assert.deepEqual(work.t, t);
  assert.deepEqual(G.solve(G.parse(s.qt).project).duration, 5.5);
  // Con posteriores, se pasa a predecesoras.
  const succ = [{ id: 'A', name: '', duration: '3', links: 'B' }, { id: 'B', name: '', duration: '2', links: '' }];
  assert.deepEqual(S.reduce(work, { type: 'gprFromWork', rows: succ, mode: 'succ' }, 10).qt,
    [{ id: 'A', name: '', duration: '3', links: '' }, { id: 'B', name: '', duration: '2', links: 'A' }]);
  // Con errores se copia tal cual (con posteriores no se pueden leer: las relaciones se quedan vacías).
  const raw = [{ id: 'A', duration: 'x', links: 'Z' }, { id: 'FF', duration: '2', links: '' }];
  assert.deepEqual(S.reduce(work, { type: 'gprFromWork', rows: raw, mode: 'pred' }, 10).qt,
    [{ id: 'A', name: '', duration: 'x', links: 'Z' }, { id: 'FF', name: '', duration: '2', links: '' }]);
  assert.deepEqual(S.reduce(work, { type: 'gprFromWork', rows: raw, mode: 'succ' }, 10).qt,
    [{ id: 'A', name: '', duration: 'x', links: '' }, { id: 'FF', name: '', duration: '2', links: '' }]);
  // Un identificador que es un código de relación da su error en la pestaña (A5).
  const codes = G.parse(S.reduce(work, { type: 'gprFromWork', rows: raw, mode: 'pred' }, 10).qt).report.errors.map((e) => e.code);
  assert.ok(codes.includes('reservedId'), codes.join());
});

test('F5a T008: acción gpr: valores válidos, la tabla propia y el paso', () => {
  let s = S.reduce(gpr({ step: 4 }), { type: 'gpr', qe: 'rb' }, 10);
  assert.deepEqual([s.qe, s.step, s.qr, s.qw], ['rb', 0, null, null]);
  s = S.reduce(Object.assign({}, s, { step: 3 }), { type: 'gpr', qn: 'pert', qg: 1, qr: 2 }, 10);
  assert.deepEqual([s.qn, s.qg, s.qr, s.step], ['pert', 1, 2, 3]);
  s = S.reduce(s, { type: 'gpr', qe: 'nada', qn: 'x', qg: 9, qr: -2 }, 10);
  assert.deepEqual([s.qe, s.qn, s.qg, s.qr], ['rb', 'pert', 1, 2]);
  s = S.reduce(s, { type: 'gpr', qw: ['Y', 10] }, 10);
  assert.deepEqual(s.qw, ['Y', 10]);
  assert.deepEqual(S.reduce(s, { type: 'gpr', qw: null }, 10).qw, null);
  assert.deepEqual(S.reduce(s, { type: 'gpr', qw: ['Y', -1] }, 10).qw, ['Y', 10]);
  assert.equal(S.reduce(s, { type: 'gpr', qe: 'own' }, 10).qe, 'rb');   // sin tabla propia no se puede
  const rows = [{ id: 'A', name: '', duration: '1', links: '' }];
  const own = S.reduce(s, { type: 'gprTable', rows }, 10);
  assert.deepEqual([own.qe, own.qt, own.qw], ['own', rows, null]);
  rows[0].duration = '5';
  assert.equal(own.qt[0].duration, '1');
});
