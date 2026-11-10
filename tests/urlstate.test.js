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

// ---------- F2b (T013): comparador, dibujo progresivo y reto ----------

test('F2b: valores por defecto de los parámetros nuevos, que no se escriben en la URL', () => {
  const d = U.defaults();
  assert.deepEqual([d.m, d.ms, d.pair, d.sn], ['rules', ['prog', 'rules', 'min'], null, null]);
  const hash = U.encode(Object.assign(U.defaults(), { graph: 'aoa' }));
  for (const k of ['m', 'ms', 'pair', 'sn', 'sp']) assert.ok(!new RegExp(`(^|[#&])${k}=`).test(hash), `${k} en ${hash}`);
});

test('F2b: ida y vuelta del comparador (métodos visibles y par) y del progresivo', () => {
  const s = Object.assign(U.defaults(), { graph: 'aoa', view: 'cmp', ex: 'syslo1981', ms: ['cgl', 'rules', 'min'], pair: ['cgl', 'rules'] });
  assert.deepEqual(U.decode(U.encode(s)), { state: s });
  const p = Object.assign(U.defaults(), { graph: 'aoa', m: 'prog', step: 5, pred: 1 });
  assert.deepEqual(U.decode(U.encode(p)), { state: p });
});

test('F2b: ida y vuelta del reto con la red del alumno (sucesos sin número, arcos a medias y posiciones)', () => {
  const sn = { events: [{ id: 0, n: 1, x: 10, y: 20 }, { id: 1, n: null, x: 40, y: 20 }, { id: 2, n: 3, x: 70, y: 5 }],
    arcs: [{ act: 'A', from: 0, to: 1 }, { act: 'B', from: 0, to: null }], dummies: [{ from: 1, to: 2 }] };
  const s = Object.assign(U.defaults(), { graph: 'aoa', view: 'reto', ex: 'ej6', sn });
  assert.deepEqual(U.decode(U.encode(s)), { state: s });
});

test('F2b: una red del alumno de 30 actividades con posiciones cabe en el límite de la URL', () => {
  const events = Array.from({ length: 60 }, (_, i) => ({ id: i, n: i + 1, x: 999, y: 999 }));
  const arcs = Array.from({ length: 30 }, (_, i) => ({ act: `A${i}`, from: i, to: i + 30 }));
  const dummies = Array.from({ length: 30 }, (_, i) => ({ from: i + 30, to: (i + 1) % 30 }));
  const hash = U.encode(Object.assign(U.defaults(), { graph: 'aoa', view: 'reto', sn: { events, arcs, dummies } }));
  assert.ok(hash.length < U.LIMITS.hash, `${hash.length}`);
});

test('F2b: listas blancas y combinaciones imposibles vuelven a lo de siempre con aviso', () => {
  const bad = [
    ['#v=route&graph=aon&view=cmp', (s) => s.view === 'net'],
    ['#v=route&graph=aon&view=reto', (s) => s.view === 'net'],
    ['#v=route&graph=aoa&m=nope', (s) => s.m === 'rules'],
    ['#v=route&graph=aoa&view=cmp&ms=rules,nope', (s) => s.ms.join() === 'prog,rules,min'],
    ['#v=route&graph=aoa&view=cmp&pair=rules,rules', (s) => s.pair === null],
    ['#v=route&graph=aoa&view=reto&sn=' + encodeURIComponent('0.1|A0-9|'), (s) => s.sn === null],
    ['#v=route&graph=aoa&view=reto&sn=' + encodeURIComponent('0.1,1.|a0-1|'), (s) => s.sn === null],
  ];
  for (const [hash, ok] of bad) {
    const { state, warning } = U.decode(hash);
    assert.equal(warning, 'malformed', hash);
    assert.ok(ok(state), hash);
  }
});

test('F2b: los enlaces de la F1 y la F2a decodifican igual (con los valores por defecto nuevos)', () => {
  const { state, warning } = U.decode('#v=route&graph=aoa&ex=ej7&step=12&view=side&min=1&lang=es');
  assert.equal(warning, undefined);
  assert.deepEqual([state.m, state.ms, state.pair, state.sn], ['rules', ['prog', 'rules', 'min'], null, null]);
});


// ── F2c (T007): M0, del enunciado a la tabla ────────────────────────────────────────────────────────────────
const MARKS = [
  { from: 0, to: 2, kind: 'activity', act: 'A' },
  { from: 4, to: 5, kind: 'duration', act: 'A', value: 2.5 },
  { from: 7, to: 15, kind: 'precedence', gives: [['A', 'B'], ['A', 'C']] },
  { from: 16, to: 20, kind: 'none' },
  { from: 21, to: 24, kind: 'precedence', gives: [['B', 'D'], ['C', 'D']], decl: { end: 'end', act: 'D' } },
];
const M0ROWS = [{ id: 'A', name: 'Pintar', duration: '2,5', links: '' }, { id: 'B', name: '', duration: '3', links: 'A' }];
const OWN = { lang: 'es', text: 'A) Pintar «las paredes». B) Suelo, después de A. <script>alert(1)</script> javascript:x \u0007',
  frags: [{ from: 0, to: 1, kind: 'activity', act: 'A' }, { from: 4, to: 6, kind: 'precedence', gives: [['A', 'B']] },
    { from: 2, to: 3, kind: 'end', act: 'B', gives: [['A', 'B']] }, { from: 7, to: 8, kind: 'duration', act: 'A', value: 3 }],
  ref: { mode: 'succ', rows: [{ id: 'A', duration: '3', links: 'B', name: 'Pintar' }, { id: 'B', duration: '', links: '', name: 'Suelo' }] } };

test('F2c: los valores por defecto de M0 no cambian el estado por defecto', () => {
  const d = U.defaults();
  assert.equal(d.st, null); assert.equal(d.own, null); assert.equal(d.mk, null);
  assert.equal(d.tv, 'list'); assert.equal(d.mm, 'practice'); assert.equal(d.sol, 0);
  assert.ok(U.STATEMENTS.includes('ej5'));
});

test('F2c: ida y vuelta de M0 con un enunciado de la herramienta, la tabla del alumno y sus subrayados', () => {
  const s = Object.assign(U.defaults(), { v: 'm0', st: 'ej5', ex: null, t: M0ROWS, mode: 'pred', mk: MARKS, tv: 'matrix', mm: 'route', step: 4, pred: 1, lang: 'en' });
  const h = U.encode(s);
  assert.doesNotMatch(h, /[&#]ex=/);
  const out = U.decode(h);
  assert.equal(out.warning, undefined);
  assert.deepEqual(out.state, s);
});

test('F2c: los parámetros de M0 solo se escriben si no valen lo de siempre', () => {
  const h = U.encode(Object.assign(U.defaults(), { v: 'm0', st: 'ej1', ex: null }));
  assert.match(h, /st=ej1/);
  for (const k of ['tv', 'mm', 'sol', 'mk', 'own']) assert.doesNotMatch(h, new RegExp(`[&#]${k}=`));
  assert.doesNotMatch(U.encode(U.defaults()), /[&#](st|tv|mm|sol|mk|own)=/);
  const out = U.decode(h);
  assert.equal(out.state.st, 'ej1');
  assert.equal(out.state.t, null);
  // M0 sin enunciado abre Electrona
  assert.equal(U.decode('#v=m0').state.st, 'ej5');
});

test('F2c: enunciado propio — el enunciado, la tabla y los subrayados viajan en un solo paquete', () => {
  const s = Object.assign(U.defaults(), { v: 'm0', st: 'own', ex: null, own: OWN, t: M0ROWS, mode: 'succ', mk: MARKS.slice(0, 2), sol: 1 });
  const h = U.encode(s);
  assert.match(h, /[&#]own=[A-Za-z0-9_-]+/);
  assert.doesNotMatch(h, /[&#](t|mk)=/);
  const out = U.decode(h);
  assert.equal(out.warning, undefined);
  assert.deepEqual(out.state, s);
  assert.equal(out.state.own.text, OWN.text);   // el texto malicioso vuelve como texto, sin tocar
});

test('F2c: enunciado propio sin tabla del docente ni del alumno', () => {
  const s = Object.assign(U.defaults(), { v: 'm0', st: 'own', ex: null, own: Object.assign({}, OWN, { ref: null }), mm: 'prepare' });
  assert.deepEqual(U.decode(U.encode(s)).state, s);
});

test('F2c: lista blanca — enunciado desconocido, subrayados mal formados y paquetes rotos o fuera de límites', () => {
  const bad = (h) => { const o = U.decode(h); assert.equal(o.warning, 'malformed', h); return o.state; };
  assert.equal(bad('#v=m0&st=ej99').st, 'ej5');
  assert.equal(bad('#v=m0&st=ej5&mk=1-2:x').mk, null);
  assert.equal(bad('#v=m0&st=ej5&mk=5-2:a:A').mk, null);
  assert.equal(bad('#v=m0&st=ej5&mk=1-2:a:a%3Cb').mk, null);
  assert.equal(bad('#v=m0&st=ej5&mk=1-2:p::A%3CB%2BC:q').mk, null);
  assert.equal(bad(`#v=m0&st=ej5&mk=${Array(201).fill('1-2:n').join(',')}`).mk, null);
  assert.equal(bad('#v=m0&st=own&own=!!!').own, null);
  assert.equal(bad('#v=m0&st=own&own=AAAA').own, null);
  assert.equal(bad('#v=m0&st=own').st, 'ej5');
  const long = Object.assign({}, OWN, { text: 'x'.repeat(3001) });
  assert.equal(bad(U.encode(Object.assign(U.defaults(), { v: 'm0', st: 'own', ex: null, own: long }))).own, null);
  assert.equal(bad('#v=m0&tv=grid').tv, 'list');
  assert.equal(bad('#v=m0&mm=exam').mm, 'practice');
  assert.equal(bad('#v=m0&sol=2').sol, 0);
});

// Caso peor de la puerta T002: 3000 caracteres, 60 fragmentos, referencia y tabla del alumno de 30 filas, 60 subrayados.
function worst() {
  let r = 7; const rnd = () => { r = (Math.imul(r, 1664525) + 1013904223) >>> 0; return r / 4294967296; };
  const vocab = ('el la los las de del que y en a se por con para una un su al lo como más pero sus le ya o fue este ha sí porque esta son '
    + 'entre cuando muy sin sobre también me hasta hay donde quien desde todo nos durante todos uno les ni contra otros ese eso ante '
    + 'actividad actividades proyecto empieza termina antes después precede sigue paralelo último primero fabricar ensamblar transportar '
    + 'componente materiales maquinaria pintar suelo paredes cuadros limpiar montar revisar entregar comprar instalar probar diseñar '
    + 'preparar contratar personal obra solar cimientos estructura cerramiento accesos carpintería pagar excavar nave almacén congreso '
    + 'sala ponentes programa inscripciones catering mudanza laboratorio cajas equipos inventario lanzamiento producto campaña precio').split(' ');
  let text = '';
  while (text.length < 3000) text += vocab[Math.floor(rnd() * vocab.length)] + (rnd() < 0.1 ? '. ' : ' ');
  text = text.slice(0, 3000);
  const ids = [...Array(30)].map((_, i) => (i < 26 ? String.fromCharCode(65 + i) : `A${i - 25}`));
  const frags = [...Array(60)].map((_, i) => (i % 3 ? { from: i * 7, to: i * 7 + 4, kind: 'precedence', gives: [[ids[i % 29], ids[(i % 29) + 1]], [ids[(i + 3) % 29], ids[((i + 3) % 29) + 1]]] }
    : { from: i * 7, to: i * 7 + 4, kind: 'activity', act: ids[i % 30] }));
  const rows = ids.map((id, i) => ({ id, duration: String(1 + (i % 9)), links: [ids[(i + 1) % 30], ids[(i + 2) % 30]].join(', '), name: `Actividad número ${i + 1} del proyecto` }));
  return Object.assign(U.defaults(), { v: 'm0', st: 'own', ex: null, lang: 'es', mode: 'pred',
    own: { lang: 'es', text, frags, ref: { mode: 'pred', rows } }, t: rows, mk: frags.map((f) => Object.assign({}, f, { kind: f.kind })) });
}

test('F2c: el caso peor de la puerta T002 cabe en 6500 caracteres y vuelve igual', () => {
  const s = worst();
  const h = U.encode(s);
  assert.ok(h.length <= 6500, `${h.length}`);
  assert.deepEqual(U.decode(h).state, s);
});

test('F2c: encodeSafe nunca pasa de 8000 (incluido el caso apuntado de la F2b)', () => {
  const ok = Object.assign(U.defaults(), { step: 3 });
  assert.deepEqual(U.encodeSafe(ok), { hash: U.encode(ok), length: U.encode(ok).length });
  // F2b: 30 actividades con nombres de 80 caracteres y una red del alumno grande.
  const rows = [...Array(30)].map((_, i) => ({ id: `A${i}`, name: 'ñ'.repeat(80), duration: '1', links: i ? `A${i - 1}` : '' }));
  const events = [...Array(100)].map((_, i) => ({ id: i, n: i, x: 1000 + i, y: 2000 + i }));
  const sn = { events, arcs: rows.map((r, i) => ({ act: r.id, from: i, to: i + 1 })), dummies: [...Array(60)].map((_, i) => ({ from: i, to: i + 2 })) };
  const big = Object.assign(U.defaults(), { v: 'work', ex: null, t: rows, graph: 'aoa', view: 'reto', sn });
  assert.ok(U.encode(big).length > U.LIMITS.hash);
  const r = U.encodeSafe(big);
  assert.equal(r.hash, null);
  assert.equal(r.reason, 'tooLong');
  assert.ok(r.length > U.LIMITS.hash);
});
