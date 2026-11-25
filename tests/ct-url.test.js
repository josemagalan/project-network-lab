'use strict';
// F5b T008: la URL de la pestaña de coste–tiempo (v=ct) y las acciones del store, también «Partir del taller»
// (spec f5b-coste-tiempo, AC9 y AC11; plan §3, P7).
const test = require('node:test');
const assert = require('node:assert/strict');
const U = require('../js/core/urlstate.js');
const S = require('../js/store.js');
const K = require('../js/core/crash.js');

const ct = (extra) => Object.assign(U.defaults(), { v: 'ct' }, extra);
const round = (s) => U.decode(U.encode(s));
const row = (id, links, dn, dc, cn, cc, name) => ({ id, name: name || '', links, dn, dc, cn, cc });

test('F5b T008: valores por defecto y enlace mínimo', () => {
  const d = U.defaults();
  assert.deepEqual([d.ke, d.kt, d.kc, d.kd, d.kn, d.kg, d.ka], ['kl', null, null, null, 'both', 0, 0]);
  const h = U.encode(ct());
  assert.doesNotMatch(h, /k[etcdnga]=/);
  assert.equal(round(ct()).state.v, 'ct');
  assert.equal(round(ct()).warning, undefined);
});

test('F5b T008: ida y vuelta con todas las claves', () => {
  const t = [row('A', '', '7', '5', '60', '76', 'Uno'), row('B', 'A', '6', '4', '85,5', '95'), row('C', 'A, B', '3', '', '', '')];
  const kc = { fixed: 10, perUnit: 3.5, due: 18, penalty: null, bonus: 2 };
  const s = ct({ ke: 'own', kt: t, kc, kd: 19, kn: 'pert', kg: 1, ka: 1, step: 4, lang: 'es', nota: 'es', box: 'c', pred: 1 });
  const h = U.encode(s);
  for (const k of ['ke=own', 'kt=', 'kc=10%2C3.5%2C18%2C%2C2', 'kd=19', 'kn=pert', 'kg=1', 'ka=1', 'step=4', 'pred=1', 'box=c']) assert.ok(h.includes(k), k);
  const { state, warning } = U.decode(h);
  assert.equal(warning, undefined);
  for (const k of ['v', 'ke', 'kt', 'kc', 'kd', 'kn', 'kg', 'ka', 'step', 'lang', 'nota', 'box', 'pred']) assert.deepEqual(state[k], s[k], k);
  for (const ke of ['kl', 'ni', 'nip', 'rf']) assert.equal(round(ct({ ke })).state.ke, ke);
  // Costes del proyecto todos vacíos: no se escriben.
  assert.doesNotMatch(U.encode(ct({ kc: { fixed: null, perUnit: null, due: null, penalty: null, bonus: null } })), /kc=/);
});

test('F5b T008: la tabla propia en el límite (40 filas) va y vuelve; lo que pasa de los límites se recorta', () => {
  const t = Array.from({ length: 40 }, (_, i) => row(`A${i}`, i ? 'B '.repeat(100).slice(0, 200) : '', '123456789012', '123456789012', '12345678.123', '12345678.123', 'x'.repeat(80)));
  assert.deepEqual(round(ct({ ke: 'own', kt: t })).state.kt, t);
  const long = [row('A', 'B '.repeat(150), '1'.repeat(20), '', '', '')];
  const back = round(ct({ ke: 'own', kt: long })).state.kt[0];
  assert.equal(back.links.length, 200); assert.equal(back.dn.length, 12);
  assert.ok(U.encodeSafe(ct({ ke: 'own', kt: t })).hash);
});

test('F5b T008: valores malformados → el de siempre y aviso', () => {
  for (const h of ['#v=ct&ke=xx', '#v=ct&kn=all', '#v=ct&kg=2', '#v=ct&ka=3', '#v=ct&kd=-1', '#v=ct&kd=a', '#v=ct&kd=12345',
    '#v=ct&kc=1%2C2', '#v=ct&kc=a%2C%2C%2C%2C', '#v=ct&kc=-1%2C%2C%2C%2C', '#v=ct&ke=own', '#v=ct&ke=own&kt=zzz', '#v=ct&kt=zzz']) {
    const { state, warning } = U.decode(h);
    assert.equal(warning, 'malformed', h);
    assert.equal(state.v, 'ct', h);
    assert.notEqual(state.ke, 'xx');
  }
  assert.equal(U.decode('#v=ct&ke=own').state.ke, 'kl');
  assert.equal(U.decode('#v=ct&kc=1%2C2').state.kc, null);
});

test('F5b T008: las claves k* solo cuentan en v=ct; los enlaces de las fases anteriores no cambian', () => {
  const { state } = U.decode('#v=route&ex=ej6&ke=ni&kn=pert&kd=3');
  assert.deepEqual([state.ke, state.kn, state.kd], ['kl', 'both', null]);
  for (const h of ['#v=route&ex=ej6&step=3&view=net&nota=en&box=7&mode=pred&pred=0', '#v=unc&step=0&nota=en', '#v=gpr&step=0&nota=en']) {
    assert.equal(U.encode(U.decode(h).state), h, h);
  }
});

test('F5b T008: partir del taller copia actividades, predecesoras y duraciones normales; el resto, vacío; el taller no cambia (AC9)', () => {
  const t = [{ id: 'A', name: 'Uno', duration: '3', links: '' }, { id: 'B', name: '', duration: '2.5', links: 'A' }];
  const work = Object.assign(U.defaults(), { v: 'work', t, mode: 'pred', step: 5 });
  const s = S.reduce(Object.assign({}, work, { kc: { fixed: 1, perUnit: null, due: null, penalty: null, bonus: null }, kd: 7 }), { type: 'ctFromWork', rows: t, mode: 'pred' }, 10);
  assert.deepEqual([s.v, s.ke, s.step, s.kd, s.kc], ['ct', 'own', 0, null, null]);
  assert.deepEqual(s.kt, [row('A', '', '3', '', '', '', 'Uno'), row('B', 'A', '2.5', '', '', '')]);
  assert.deepEqual(work.t, t);
  // La duración no entera se copia tal cual y la fila marca su error en la pestaña.
  assert.deepEqual(K.parse(s.kt).report.errors.map((e) => [e.code, e.ids[0]]), [['badDuration', 'B']]);
  // Una fila entera: aviso noCrash.
  const t2 = [{ id: 'A', name: '', duration: '3', links: '' }];
  assert.deepEqual(K.parse(S.reduce(work, { type: 'ctFromWork', rows: t2, mode: 'pred' }, 10).kt).report.warnings.map((w) => w.code), ['noCrash']);
  // Con posteriores, se pasa a predecesoras; si no se lee, sin relaciones.
  const succ = [{ id: 'A', name: '', duration: '3', links: 'B' }, { id: 'B', name: '', duration: '2', links: '' }];
  assert.deepEqual(S.reduce(work, { type: 'ctFromWork', rows: succ, mode: 'succ' }, 10).kt, [row('A', '', '3', '', '', ''), row('B', 'A', '2', '', '', '')]);
  const raw = [{ id: 'A', duration: 'x', links: 'Z' }];
  assert.deepEqual(S.reduce(work, { type: 'ctFromWork', rows: raw, mode: 'succ' }, 10).kt, [row('A', '', 'x', '', '', '')]);
});

test('F5b T008: acciones ct, ctTable y ctCosts', () => {
  let s = S.reduce(ct({ step: 4, kd: 20, ka: 1, kc: { fixed: 1, perUnit: null, due: null, penalty: null, bonus: null } }), { type: 'ct', ke: 'ni' }, 10);
  assert.deepEqual([s.ke, s.step, s.kd, s.kc, s.ka], ['ni', 0, null, null, 1]);   // otro proyecto: paso, duración y costes, de cero
  s = S.reduce(Object.assign({}, s, { step: 3 }), { type: 'ct', kn: 'pert', kg: 1, ka: 0, kd: 17 }, 10);
  assert.deepEqual([s.kn, s.kg, s.ka, s.kd, s.step], ['pert', 1, 0, 17, 3]);
  s = S.reduce(s, { type: 'ct', ke: 'nada', kn: 'x', kg: 9, ka: 5, kd: -2 }, 10);
  assert.deepEqual([s.ke, s.kn, s.kg, s.ka, s.kd], ['ni', 'pert', 1, 0, 17]);
  assert.equal(S.reduce(s, { type: 'ct', kd: null }, 10).kd, null);
  assert.equal(S.reduce(s, { type: 'ct', ke: 'own' }, 10).ke, 'ni');   // sin tabla propia no se puede
  const rows = [row('A', '', '4', '2', '1', '3')];
  const own = S.reduce(s, { type: 'ctTable', rows }, 10);
  assert.deepEqual([own.ke, own.kt, own.kd], ['own', rows, null]);
  rows[0].dn = '5';
  assert.equal(own.kt[0].dn, '4');
  const kc = S.reduce(s, { type: 'ctCosts', kc: { fixed: '10', perUnit: '3,5', due: '', penalty: null, bonus: '2' } }, 10).kc;
  assert.deepEqual(kc, { fixed: 10, perUnit: 3.5, due: null, penalty: null, bonus: 2 });
  assert.equal(S.reduce(s, { type: 'ctCosts', kc: { fixed: 'x' } }, 10).kc, s.kc);   // un valor no válido no cambia nada
  assert.equal(S.reduce(s, { type: 'ctCosts', kc: null }, 10).kc, null);
});
