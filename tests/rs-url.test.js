'use strict';
// F5c T007: la URL de la vista de recursos (v=rs) y las acciones del store, también «Partir del taller»
// (spec f5c-recursos, AC9 y AC11; plan §3, P12).
const test = require('node:test');
const assert = require('node:assert/strict');
const U = require('../js/core/urlstate.js');
const S = require('../js/store.js');
const R = require('../js/core/resource.js');

const rs = (extra) => Object.assign(U.defaults(), { v: 'rs' }, extra);
const round = (s) => U.decode(U.encode(s));
const row = (id, links, d, r1, r2, r3, name) => ({ id, name: name || '', links, d, r1, r2: r2 || '', r3: r3 || '' });

test('F5c T007: valores por defecto y enlace mínimo', () => {
  const d = U.defaults();
  assert.deepEqual([d.we, d.wt, d.wr, d.wm, d.wk, d.wc, d.ws, d.wp, d.wq], ['k81', null, null, null, 0, 'es', 'sf', 'slk', null]);
  const h = U.encode(rs());
  assert.doesNotMatch(h, /w[etrmkcspq]=/);
  assert.equal(h, '#v=rs&step=0&nota=en');
  const { state, warning } = round(rs());
  assert.equal(state.v, 'rs');
  assert.equal(warning, undefined);
  assert.equal(state.ex, null);
  assert.equal(state.t, null);
});

test('F5c T007: ida y vuelta con todas las claves', () => {
  const t = [row('A', '', '3', '2', '1', '', 'Uno'), row('B', 'A', '4', '', '5', '1'), row('C', 'A, B', '0', '', '', '')];
  const wr = [{ name: 'Albañiles', cap: 6 }, { name: 'Grúa: 1;2 %', cap: null }, { name: '', cap: 3 }];
  const wq = [['B', 4], ['C', 12]];
  const s = rs({ we: 'own', wt: t, wr, wm: 'lim', wk: 2, wc: 'man', ws: 'pb', wp: 'act', wq, step: 5, lang: 'es', nota: 'es', box: 'c', pred: 1 });
  const h = U.encode(s);
  for (const k of ['we=own', 'wt=', 'wr=', 'wm=lim', 'wk=2', 'wc=man', 'ws=pb', 'wp=act', 'wq=B%3A4%3BC%3A12', 'step=5', 'pred=1', 'box=c']) assert.ok(h.includes(k), k);
  const { state, warning } = U.decode(h);
  assert.equal(warning, undefined);
  for (const k of ['v', 'we', 'wt', 'wr', 'wm', 'wk', 'wc', 'ws', 'wp', 'wq', 'step', 'lang', 'nota', 'box', 'pred']) assert.deepEqual(state[k], s[k], k);
  for (const we of ['k81', 'k85', 'lg', 'lgi', 'gb', 'n723']) assert.equal(round(rs({ we })).state.we, we);
  for (const wc of ['es', 'ls', 'man', 'bur', 'min', 'sgs', 'opt']) assert.equal(round(rs({ wc })).state.wc, wc);
  for (const ws of ['sf', 'sb', 'pf', 'pb']) assert.equal(round(rs({ ws })).state.ws, ws);
  for (const wp of R.RULES) assert.equal(round(rs({ wp })).state.wp, wp);
  for (const wm of ['lev', 'lim']) assert.equal(round(rs({ wm })).state.wm, wm);
  // En un ejemplo, wr cambia la disponibilidad; un nombre vacío es el del ejemplo.
  const ex = round(rs({ we: 'lg', wr: [{ name: '', cap: 12 }, { name: '', cap: null }] })).state;
  assert.deepEqual([ex.we, ex.wt, ex.wr], ['lg', null, [{ name: '', cap: 12 }, { name: '', cap: null }]]);
});

test('F5c T007: la tabla propia en el límite (40 filas) va y vuelve; lo que pasa de los límites se recorta', () => {
  const t = Array.from({ length: 40 }, (_, i) => row(`A${i}`, i ? 'B '.repeat(100).slice(0, 200) : '', '123456789012', '123456789012', '123456789012', '123456789012', 'x'.repeat(80)));
  assert.deepEqual(round(rs({ we: 'own', wt: t })).state.wt, t);
  const long = [row('A', 'B '.repeat(150), '1'.repeat(20), '2'.repeat(20), '', '')];
  const back = round(rs({ we: 'own', wt: long })).state.wt[0];
  assert.equal(back.links.length, 200); assert.equal(back.d.length, 12); assert.equal(back.r1.length, 12);
  assert.ok(U.encodeSafe(rs({ we: 'own', wt: t, wq: t.map((r, i) => [r.id, i * 100]) })).hash);
  // Nombres de recurso: hasta 20 caracteres (plan §0).
  assert.equal(round(rs({ wr: [{ name: 'n'.repeat(60), cap: 1 }] })).state.wr[0].name.length, 20);
});

test('F5c T007: valores malformados → el de siempre y aviso', () => {
  for (const h of ['#v=rs&we=xx', '#v=rs&wm=both', '#v=rs&wk=3', '#v=rs&wc=xx', '#v=rs&ws=sx', '#v=rs&wp=min',
    '#v=rs&we=own', '#v=rs&we=own&wt=zzz', '#v=rs&wt=zzz',
    '#v=rs&wr=', '#v=rs&wr=a%3A1%3Bb%3A2%3Bc%3A3%3Bd%3A4', '#v=rs&wr=a%3A0', '#v=rs&wr=a%3A10000', '#v=rs&wr=a%3Ax', '#v=rs&wr=a', '#v=rs&wr=a%3A1%3A2',
    '#v=rs&wq=A', '#v=rs&wq=A%3A-1', '#v=rs&wq=A%3A1.5', '#v=rs&wq=A%3A123456', '#v=rs&wq=A%3A1%3BA%3A2', '#v=rs&wq=%3F%3F%3A1']) {
    const { state, warning } = U.decode(h);
    assert.equal(warning, 'malformed', h);
    assert.equal(state.v, 'rs', h);
  }
  const d = U.decode('#v=rs&we=own&wr=a%3A0&wq=A%3A-1&wk=7').state;
  assert.deepEqual([d.we, d.wt, d.wr, d.wq, d.wk], ['k81', null, null, null, 0]);
  // Un wq vacío no es malformado: sin movimientos.
  assert.equal(U.decode('#v=rs&wq=').warning, undefined);
  assert.equal(U.decode('#v=rs&wq=').state.wq, null);
  // Los identificadores se leen en mayúsculas, como en «¿Y si…?».
  assert.deepEqual(U.decode('#v=rs&wq=a1%3A3').state.wq, [['A1', 3]]);
});

test('F5c T007: las claves w* solo cuentan en v=rs; wi sigue siendo del taller; los enlaces de las fases anteriores no cambian', () => {
  const { state } = U.decode('#v=route&ex=ej6&we=lg&wm=lim&wk=1&wq=A%3A3&wc=bur');
  assert.deepEqual([state.we, state.wm, state.wk, state.wq, state.wc], ['k81', null, 0, null, 'es']);
  assert.deepEqual(U.decode('#v=work&ex=ej6&wi=A%3A3').state.wi, [['A', 3]]);
  for (const h of ['#v=route&ex=ej6&step=3&view=net&nota=en&box=7&mode=pred&pred=0', '#v=unc&step=0&nota=en', '#v=gpr&step=0&nota=en', '#v=ct&step=0&nota=en']) {
    assert.equal(U.encode(U.decode(h).state), h, h);
  }
  assert.equal(U.decode('#v=ct&we=lg').warning, undefined);   // clave conocida, fuera de su vista: se ignora sin aviso
});

test('F5c T007: partir del taller copia actividades, predecesoras y duraciones; los usos, vacíos; el taller no cambia (AC9)', () => {
  const t = [{ id: 'A', name: 'Uno', duration: '3', links: '' }, { id: 'B', name: '', duration: '2.5', links: 'A' }];
  const work = Object.assign(U.defaults(), { v: 'work', t, mode: 'pred', step: 5 });
  const busy = Object.assign({}, work, { we: 'lg', wr: [{ name: '', cap: 2 }], wm: 'lim', wk: 1, wc: 'opt', wq: [['A', 2]] });
  const s = S.reduce(busy, { type: 'rsFromWork', rows: t, mode: 'pred' }, 10);
  assert.deepEqual([s.v, s.we, s.step, s.wr, s.wm, s.wk, s.wc, s.wq], ['rs', 'own', 0, null, null, 0, 'es', null]);
  assert.deepEqual(s.wt, [row('A', '', '3', '', '', '', 'Uno'), row('B', 'A', '2.5', '', '', '')]);
  assert.deepEqual(work.t, t);
  // La duración no entera se copia tal cual y la fila marca su error en la vista; sin usos, el aviso noUse.
  const res = [{ name: { es: '', en: '' }, cap: null }];
  const rep = R.parse(s.wt, res, 'lev').report;
  assert.deepEqual(rep.errors.map((e) => [e.code, e.ids[0]]), [['badDuration', 'B']]);
  // Con posteriores, se pasa a predecesoras; si no se lee, sin relaciones.
  const succ = [{ id: 'A', name: '', duration: '3', links: 'B' }, { id: 'B', name: '', duration: '2', links: '' }];
  assert.deepEqual(S.reduce(work, { type: 'rsFromWork', rows: succ, mode: 'succ' }, 10).wt, [row('A', '', '3', '', '', ''), row('B', 'A', '2', '', '', '')]);
  const raw = [{ id: 'A', duration: 'x', links: 'Z' }];
  assert.deepEqual(S.reduce(work, { type: 'rsFromWork', rows: raw, mode: 'succ' }, 10).wt, [row('A', '', 'x', '', '', '')]);
  // Un taller vacío no cambia nada.
  assert.equal(S.reduce(work, { type: 'rsFromWork', rows: [], mode: 'pred' }, 10).v, 'work');
});

test('F5c T007: acción rs (otro proyecto, modo, recurso, calendario, esquema y regla)', () => {
  const base = rs({ step: 4, wr: [{ name: '', cap: 9 }], wm: 'lim', wk: 1, wc: 'man', wq: [['A', 3]], ws: 'pb', wp: 'act' });
  // Otro proyecto: paso, recursos, modo (el del ejemplo), recurso, calendario y movimientos, de cero; esquema y regla se quedan.
  let s = S.reduce(base, { type: 'rs', we: 'lg' }, 10);
  assert.deepEqual([s.we, s.step, s.wr, s.wm, s.wk, s.wc, s.wq, s.ws, s.wp], ['lg', 0, null, null, 0, 'es', null, 'pb', 'act']);
  // El mismo proyecto no borra nada.
  assert.deepEqual(S.reduce(base, { type: 'rs', we: 'k81' }, 10), Object.assign({}, base));
  // Otro modo: calendario temprano, sin movimientos, paso 0.
  s = S.reduce(base, { type: 'rs', wm: 'lev' }, 10);
  assert.deepEqual([s.wm, s.wc, s.wq, s.step, s.wr], ['lev', 'es', null, 0, base.wr]);
  // Otro recurso o calendario: paso 0; los movimientos se quedan.
  s = S.reduce(base, { type: 'rs', wk: 2 }, 10);
  assert.deepEqual([s.wk, s.step, s.wq], [2, 0, base.wq]);
  s = S.reduce(base, { type: 'rs', wc: 'sgs' }, 10);
  assert.deepEqual([s.wc, s.step], ['sgs', 0]);
  // Esquema y regla: paso 0 solo si se está viendo el calendario de la regla.
  assert.equal(S.reduce(base, { type: 'rs', wp: 'lft' }, 10).step, 4);
  s = S.reduce(rs({ wc: 'sgs', step: 6 }), { type: 'rs', ws: 'pf', wp: 'lft' }, 10);
  assert.deepEqual([s.ws, s.wp, s.step], ['pf', 'lft', 0]);
  // T012: con recursos limitados, un calendario de la nivelación (el temprano, por defecto) es el de la regla: también vuelve a 0.
  assert.equal(S.reduce(rs({ wm: 'lim', wc: 'es', step: 6 }), { type: 'rs', wp: 'lft' }, 10).step, 0);
  assert.equal(S.reduce(rs({ wc: 'opt', step: 6 }), { type: 'rs', ws: 'pf' }, 10).step, 6);
  // Valores no válidos no cambian nada; own sin tabla propia, tampoco.
  s = S.reduce(base, { type: 'rs', we: 'nada', wm: 'x', wk: 5, wc: 'zz', ws: 'q', wp: 'min' }, 10);
  assert.deepEqual(s, Object.assign({}, base, { v: 'rs' }));
  assert.equal(S.reduce(base, { type: 'rs', we: 'own' }, 10).we, 'k81');
  assert.equal(S.reduce(Object.assign({}, base, { wt: [row('A', '', '1', '1')] }), { type: 'rs', we: 'own' }, 10).we, 'own');
});

test('F5c T007: acciones rsTable, rsRes y rsStarts', () => {
  const base = rs({ step: 4, wq: [['A', 3]], wc: 'man' });
  const rows = [row('A', '', '4', '2', '1', '3')];
  const own = S.reduce(base, { type: 'rsTable', rows }, 10);
  assert.deepEqual([own.we, own.wt, own.step, own.wq], ['own', rows, 0, base.wq]);   // los movimientos que ya no valen se descartan en la vista
  rows[0].d = '5';
  assert.equal(own.wt[0].d, '4');
  assert.equal(S.reduce(base, { type: 'rsTable', rows: [] }, 10).we, 'k81');
  // Recursos: de 1 a 3, disponibilidad entera de 1 a 9999 o vacía (sin límite); texto con coma o espacios vale.
  let s = S.reduce(base, { type: 'rsRes', wr: [{ name: ' Grúa ', cap: '3' }, { name: 'B', cap: '' }] }, 10);
  assert.deepEqual([s.wr, s.step], [[{ name: 'Grúa', cap: 3 }, { name: 'B', cap: null }], 0]);
  for (const wr of [[], [{ name: 'a', cap: 0 }], [{ name: 'a', cap: '1.5' }], [{ name: 'a', cap: 'x' }], [1, 2, 3, 4].map(() => ({ name: '', cap: 1 }))]) {
    assert.deepEqual(S.reduce(s, { type: 'rsRes', wr }, 10), s, JSON.stringify(wr));   // algo que no vale no cambia nada
  }
  assert.deepEqual([S.reduce(s, { type: 'rsRes', wr: null }, 10).wr, S.reduce(Object.assign({}, s, { step: 3 }), { type: 'rsRes', wr: null }, 10).step], [null, 0]);
  // Comienzos a mano: lista o null; uno que no vale no cambia nada.
  s = S.reduce(base, { type: 'rsStarts', value: [['B', 2], ['C', 0]] }, 10);
  assert.deepEqual([s.wq, s.step], [[['B', 2], ['C', 0]], 4]);
  assert.equal(S.reduce(base, { type: 'rsStarts', value: [] }, 10).wq, null);
  assert.equal(S.reduce(base, { type: 'rsStarts', value: null }, 10).wq, null);
  assert.deepEqual(S.reduce(base, { type: 'rsStarts', value: [['B', -1]] }, 10).wq, base.wq);
  assert.deepEqual(S.reduce(base, { type: 'rsStarts', value: [['B', 1], ['B', 2]] }, 10).wq, base.wq);
});
