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

test('T021: «preparar» un enunciado propio se abre sin paquete, con el texto vacío en el idioma de la página', () => {
  for (const lang of ['es', 'en']) {
    const out = U.decode(`#v=m0&st=own&mm=prepare&lang=${lang}`);
    assert.equal(out.warning, undefined);
    assert.equal(out.state.st, 'own');
    assert.equal(out.state.mm, 'prepare');
    assert.deepEqual(out.state.own, { lang, text: '', frags: [], ref: null });
  }
  assert.equal(U.decode('#v=m0&st=own&mm=prepare').state.own.lang, 'es');
  // Practicar sin paquete sigue siendo un enlace roto.
  assert.equal(U.decode('#v=m0&st=own&mm=route').warning, 'malformed');
  assert.equal(U.LIMITS.ownText, 3000);
});

// ---------- F3a: «Ejercicios» (spec f3a-generador-calculo, AC10; plan §3 y T007) ----------

const EX_ANS = {
  act: { A: { ES: '0', EF: '2', LS: '1', LF: '3', TF: '1', FF: '', IF: '1', SF: '' }, B: { ES: '0', EF: '3,5', LS: '', LF: '', TF: '', FF: '', IF: '', SF: '' } },
  dur: '13', ev: { 1: { TE: '0', TL: '0', slack: '0' }, 2: { TE: '3', TL: '', slack: '' } }, crit: ['B', 'E'], paths: ['B-E-I-J-K', 'b e i'],
};

test('F3a: por defecto, «Ejercicios» no escribe nada propio y los parámetros nuevos valen lo de siempre', () => {
  const d = U.defaults();
  assert.deepEqual([d.sd, d.lv, d.gp, d.ask, d.xm, d.ans, d.xd, d.gv], [null, 'medium', null, ['times', 'floats', 'critical'], 'practice', null, 0, null]);
  const h = U.encode(Object.assign(U.defaults(), { v: 'ex', ex: null }));
  for (const k of ['sd', 'lv', 'gp', 'ask', 'xm', 'ans', 'xd', 'gv', 'ex', 't']) assert.ok(!new URLSearchParams(h.slice(1)).has(k), k);
  const back = U.decode(h);
  assert.equal(back.warning, undefined);
  assert.equal(back.state.v, 'ex');
  assert.equal(back.state.ex, null);
});

test('F3a: ida y vuelta de sd, lv, gp, ask, xm, ans, xd y gv', () => {
  const s = Object.assign(U.defaults(), { v: 'ex', ex: null, sd: 424242, lv: 'custom',
    gp: { n: [12, 16], pred: 2.5, dummies: [3, 5], critical: [2, 3], dmax: 20 }, ask: ['times', 'events', 'floats', 'sf', 'critical'],
    xm: 'exam', ans: EX_ANS, xd: 1, gv: 2, lang: 'en', nota: 'es' });
  const h = U.encode(s);
  const q = new URLSearchParams(h.slice(1));
  assert.equal(q.get('gp'), 'n12-16.p25.f3-5.c2-3.d20');
  assert.equal(q.get('ask'), 'tefsc');
  const back = U.decode(h);
  assert.equal(back.warning, undefined);
  for (const k of ['v', 'sd', 'lv', 'gp', 'ask', 'xm', 'ans', 'xd', 'gv', 'lang', 'nota']) assert.deepEqual(back.state[k], s[k], k);
  // sin ficticias
  const s2 = Object.assign({}, s, { gp: { n: [20, 30], pred: 1, dummies: null, critical: [1, 1], dmax: 9 } });
  assert.equal(new URLSearchParams(U.encode(s2).slice(1)).get('gp'), 'n20-30.p10.c1-1.d9');
  assert.deepEqual(U.decode(U.encode(s2)).state.gp, s2.gp);
  // lv distinto de custom no escribe gp; un nivel fijo se guarda tal cual
  const s3 = Object.assign({}, s, { lv: 'hard' });
  assert.ok(!new URLSearchParams(U.encode(s3).slice(1)).has('gp'));
  assert.equal(U.decode(U.encode(s3)).state.gp, null);
  assert.equal(U.decode(U.encode(s3)).state.lv, 'hard');
});

test('F3a: lista blanca y límites; lo que no valida vuelve a su valor por defecto con aviso', () => {
  const bad = (frag, key, want) => {
    const r = U.decode(`#v=ex&${frag}`);
    assert.equal(r.warning, 'malformed', frag);
    assert.deepEqual(r.state[key], want, frag);
  };
  bad('sd=0', 'sd', null);
  bad('sd=1000000', 'sd', null);
  bad('sd=12a', 'sd', null);
  bad('lv=extreme', 'lv', 'medium');
  bad('lv=custom', 'lv', 'medium');                         // custom sin gp
  bad('lv=custom&gp=n3-9.p12.c1-1.d9', 'gp', null);         // fuera de los límites de «Personalizar»
  bad('lv=custom&gp=n6-7.p35.c1-1.d9', 'gp', null);
  bad('lv=custom&gp=n6-7.p12.c0-1.d9', 'gp', null);
  bad('lv=custom&gp=n6-7.p12.c1-1.d1', 'gp', null);
  bad('lv=custom&gp=n6-7.p12.f2-1.c1-1.d9', 'gp', null);
  bad('lv=custom&gp=basura', 'gp', null);
  bad('ask=tx', 'ask', ['times', 'floats', 'critical']);
  bad('ask=', 'ask', ['times', 'floats', 'critical']);
  bad('ask=ft', 'ask', ['times', 'floats', 'critical']);   // en el orden de ASK
  bad('ask=tt', 'ask', ['times', 'floats', 'critical']);
  bad('xm=quiz', 'xm', 'practice');
  bad('xd=2', 'xd', 0);
  bad('gv=0', 'gv', null);
  bad('ans=xyz', 'ans', null);
  assert.equal(U.decode('#v=ex&lv=custom&gp=n4-30.p30.c3-3.d30').state.gp.n[1], 30);
  // la holgura de seguridad sin holguras se ignora
  assert.deepEqual(U.decode('#v=ex&ask=ts').state.ask, ['times']);
});

test('F3a: las respuestas viajan con sus límites (30 actividades, 60 sucesos, 8 caracteres, 10 caminos de 120)', () => {
  const ids = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').concat(['AA', 'AB', 'AC', 'AD']);
  const full = { act: Object.fromEntries(ids.map((a) => [a, Object.fromEntries(['ES', 'EF', 'LS', 'LF', 'TF', 'FF', 'IF', 'SF'].map((f) => [f, '12345,67']))])),
    dur: '12345,67', ev: Object.fromEntries(Array.from({ length: 60 }, (_, i) => [i + 1, { TE: '12345,67', TL: '12345,67', slack: '12345,67' }])),
    crit: ids.slice(), paths: Array.from({ length: 10 }, () => ids.join('-').slice(0, 120)) };
  const s = Object.assign(U.defaults(), { v: 'ex', ex: null, sd: 999999, lv: 'custom', gp: { n: [30, 30], pred: 3, dummies: null, critical: [3, 3], dmax: 30 },
    ask: ['times', 'events', 'floats', 'sf', 'critical'], xm: 'exam', ans: full, xd: 1 });
  const safe = U.encodeSafe(s);
  assert.ok(safe.hash, `no cabe: ${safe.length}`);
  assert.deepEqual(U.decode(safe.hash).state.ans, full);
  const over = (mut) => { const a = JSON.parse(JSON.stringify(full)); mut(a); return U.decode(U.encode(Object.assign({}, s, { ans: a }))); };
  assert.equal(over((a) => { a.act.A.ES = '123456789'; }).state.ans, null);
  assert.equal(over((a) => { a.act.AE = a.act.A; }).state.ans, null);
  assert.equal(over((a) => { a.act.a = a.act.A; }).state.ans, null);
  assert.equal(over((a) => { a.ev[61] = a.ev[1]; }).state.ans, null);
  assert.equal(over((a) => { a.paths.push('A'); }).state.ans, null);
  assert.equal(over((a) => { a.paths[0] = 'A'.repeat(121); }).state.ans, null);
  assert.equal(over((a) => { a.crit.push('ZZZZZ'); }).state.ans, null);
  assert.equal(over((a) => { a.act.A.XX = '1'; }).state.ans, null);
  // texto malicioso: se conserva como texto
  const evil = over((a) => { a.act.A.ES = '<img/>'; a.paths[0] = 'javascript:alert(1)'; });
  assert.equal(evil.state.ans.act.A.ES, '<img/>');
  assert.equal(evil.state.ans.paths[0], 'javascript:alert(1)');
});

test('F3a: los enlaces de la F1 y la F2 no cambian con los parámetros nuevos', () => {
  for (const h of ['#v=route&ex=ej6&step=3&view=net&nota=en&box=7&mode=pred&pred=0', '#v=work&t=A%2C2%2C%2C&step=0&view=net&nota=en&box=7&mode=pred&pred=0',
    '#v=route&graph=aoa&ex=ej7&step=0&view=side&nota=en&box=7&mode=pred&pred=0', '#v=m0&step=0&view=net&nota=en&box=7&mode=pred&pred=0&st=ej5']) {
    assert.equal(U.encode(U.decode(h).state), h, h);
  }
  // en «Ejercicios» la tabla sale de la semilla: t y ex no se escriben ni se leen
  const r = U.decode('#v=ex&t=A%2C2%2C%2C&ex=ej4&sd=5');
  assert.equal(r.state.t, null);
  assert.equal(r.state.ex, null);
  assert.equal(r.state.sd, 5);
});

// ---------- F3b: vista del exportador de Moodle (plan P7, T008) ----------
test('F3b: v=moodle solo escribe v, lang y nota', () => {
  const h = U.encode(Object.assign(U.defaults(), { v: 'moodle', lang: 'en', nota: 'es', ex: 'ej6', step: 4, sd: 12, t: [{ id: 'A', duration: '1', links: '' }] }));
  assert.equal(h, '#v=moodle&lang=en&nota=es');
  assert.equal(U.encode(Object.assign(U.defaults(), { v: 'moodle' })), '#v=moodle&nota=en');
});

test('F3b: decode de v=moodle, sin tabla ni ejemplo, y de ida y vuelta', () => {
  const r = U.decode('#v=moodle&lang=en&nota=es');
  assert.equal(r.warning, undefined);
  assert.equal(r.state.v, 'moodle'); assert.equal(r.state.lang, 'en'); assert.equal(r.state.nota, 'es');
  assert.equal(r.state.ex, null); assert.equal(r.state.t, null);
  const r2 = U.decode('#v=moodle&ex=ej4&t=A%2C1%2C%2C&sd=5');
  assert.equal(r2.state.v, 'moodle'); assert.equal(r2.state.ex, null); assert.equal(r2.state.t, null);
  assert.equal(U.decode(U.encode(r.state)).state.v, 'moodle');
  assert.equal(U.decode('#v=moodles').warning, 'malformed');
});

// ---------- F3c: enunciado al azar en M0 y enunciado en «Ejercicios» (spec f3c-enunciados, AC8–AC9; plan §3, P7) ----------

test('F3c: los parámetros nuevos valen lo de siempre y los enlaces de antes no los escriben', () => {
  const d = U.defaults();
  assert.deepEqual([d.cx, d.sv, d.xt], [null, null, 0]);
  for (const s of [{ v: 'm0', st: 'ej5' }, { v: 'ex', ex: null, sd: 7 }, { v: 'route' }]) {
    const q = new URLSearchParams(U.encode(Object.assign(U.defaults(), s)).slice(1));
    for (const k of ['cx', 'sv', 'xt']) assert.ok(!q.has(k), `${s.v}: ${k}`);
    if (s.v === 'm0') for (const k of ['sd', 'lv']) assert.ok(!q.has(k), `m0: ${k}`);
  }
});

test('F3c: ida y vuelta de st=gen con sd, lv, cx, sv y subrayados', () => {
  const s = Object.assign(U.defaults(), { v: 'm0', ex: null, st: 'gen', sd: 31337, lv: 'hard', cx: 'lab', sv: 1, lang: 'en',
    mk: [{ from: 3, to: 5, kind: 'activity', act: 'A' }] });
  const h = U.encode(s);
  const q = new URLSearchParams(h.slice(1));
  assert.deepEqual([q.get('st'), q.get('sd'), q.get('lv'), q.get('cx'), q.get('sv')], ['gen', '31337', 'hard', 'lab', '1']);
  const back = U.decode(h);
  assert.equal(back.warning, undefined);
  for (const k of ['v', 'st', 'sd', 'lv', 'cx', 'sv', 'lang']) assert.deepEqual(back.state[k], s[k], k);
  assert.equal(back.state.mk.length, 1);
  // Nivel medio y contexto al azar: no se escriben.
  const q2 = new URLSearchParams(U.encode(Object.assign({}, s, { lv: 'medium', cx: null, mk: null })).slice(1));
  assert.ok(!q2.has('lv') && !q2.has('cx') && q2.has('sd') && q2.has('sv'));
  // Sin semilla (la elige la interfaz al abrir).
  const back3 = U.decode('#v=m0&st=gen');
  assert.equal(back3.warning, undefined);
  assert.deepEqual([back3.state.st, back3.state.sd, back3.state.lv, back3.state.cx], ['gen', null, 'medium', null]);
});

test('F3c: st=gen con un nivel, contexto, versión o semilla imposibles es malformado', () => {
  for (const [h, k, v] of [['#v=m0&st=gen&sd=5&lv=custom', 'lv', 'medium'], ['#v=m0&st=gen&sd=5&cx=moon', 'cx', null],
    ['#v=m0&st=gen&sd=5&sv=x', 'sv', null], ['#v=m0&st=gen&sd=5&sv=0', 'sv', null], ['#v=m0&st=gen&sd=0', 'sd', null]]) {
    const back = U.decode(h);
    assert.equal(back.warning, 'malformed', h);
    assert.equal(back.state.st, 'gen', h);
    assert.equal(back.state[k], v, h);
  }
  // Con otro enunciado, sd, lv, cx y sv no cuentan.
  const other = U.decode('#v=m0&st=ej5&sd=5&cx=lab&sv=1');
  assert.equal(other.state.st, 'ej5');
  assert.deepEqual([other.state.sd, other.state.cx, other.state.sv], [null, null, null]);
});

test('F3c r2 (F2): los enlaces de «Ejercicios» con el enunciado guardan sv; los de antes, sin sv, son de la versión 1', () => {
  const s = Object.assign(U.defaults(), { v: 'ex', ex: null, sd: 7, xt: 1 });
  // Sin versión en el estado, la actual; con una, la suya.
  assert.equal(new URLSearchParams(U.encode(s).slice(1)).get('sv'), String(U.STMT_VERSION));
  assert.equal(new URLSearchParams(U.encode(Object.assign({}, s, { sv: 1 })).slice(1)).get('sv'), '1');
  // Sin enunciado no se escribe.
  assert.ok(!new URLSearchParams(U.encode(Object.assign({}, s, { xt: 0, sv: 2 })).slice(1)).has('sv'));
  // Ida y vuelta.
  const back = U.decode(U.encode(s));
  assert.equal(back.warning, undefined);
  assert.deepEqual([back.state.xt, back.state.sv], [1, U.STMT_VERSION]);
  // El enlace de antes de la ronda 2: versión 1, sin aviso de enlace mal formado.
  const legacy = U.decode('#v=ex&sd=7&xt=1');
  assert.equal(legacy.warning, undefined);
  assert.equal(legacy.state.sv, 1);
  // Sin xt, sv no cuenta; un sv imposible es malformado.
  assert.equal(U.decode('#v=ex&sd=7&sv=1').state.sv, null);
  for (const h of ['#v=ex&sd=7&xt=1&sv=x', '#v=ex&sd=7&xt=1&sv=0']) {
    const b = U.decode(h);
    assert.equal(b.warning, 'malformed', h);
    assert.equal(b.state.sv, null, h);
  }
});

test('F3c: xt=1 en «Ejercicios» solo con los tres niveles', () => {
  const s = Object.assign(U.defaults(), { v: 'ex', ex: null, sd: 99, lv: 'easy', xt: 1 });
  const h = U.encode(s);
  assert.equal(new URLSearchParams(h.slice(1)).get('xt'), '1');
  const back = U.decode(h);
  assert.equal(back.warning, undefined);
  assert.equal(back.state.xt, 1);
  const gp = { n: [12, 16], pred: 2.5, dummies: [3, 5], critical: [2, 3], dmax: 20 };
  assert.ok(!new URLSearchParams(U.encode(Object.assign({}, s, { lv: 'custom', gp })).slice(1)).has('xt'));
  const bad = U.decode('#v=ex&sd=99&lv=custom&gp=n12-16.p25.f3-5.c2-3.d20&xt=1');
  assert.equal(bad.warning, 'malformed');
  assert.equal(bad.state.xt, 0);
  assert.equal(U.decode('#v=ex&sd=99&xt=2').warning, 'malformed');
});

// ---------- F4a (T007): la pestaña de tres tiempos y el TCL, v=unc (plan f4a-tres-tiempos-tcl, §3) ----------
const UNC_ROWS = [
  { id: 'A', name: 'Análisis', a: '2', m: '6', b: '14', links: '' },
  { id: 'B', name: '', a: '4', m: '7', b: '12', links: 'A' },
  { id: 'C', name: 'Sin m', a: '1', m: '', b: '3', links: 'A, Z' },   // con errores: se guarda tal cual
];

test('F4a: v=unc por defecto: M5, ejemplo de Klastorin y nada más en el enlace', () => {
  const s = Object.assign(U.defaults(), { v: 'unc', ex: 'ej6', t: [{ id: 'A', duration: '1', links: '' }], step: 0 });
  const h = U.encode(s);
  const q = new URLSearchParams(h.slice(1));
  assert.equal(q.get('v'), 'unc');
  for (const k of ['t', 'ex', 'um', 'ue', 'ut', 'ua', 'uc', 'ux', 'ud', 'up', 'uk', 'us']) assert.ok(!q.has(k), k);
  const back = U.decode(h);
  assert.equal(back.warning, undefined);
  assert.equal(back.state.v, 'unc');
  assert.deepEqual([back.state.um, back.state.ue, back.state.ux, back.state.uc], ['m5', 'kl', 'exam', 0]);
  assert.deepEqual([back.state.ex, back.state.t, back.state.ut, back.state.uk, back.state.us], [null, null, null, null, null]);
});

test('F4a: ida y vuelta con todas las claves de v=unc', () => {
  const s = Object.assign(U.defaults(), { v: 'unc', ex: null, um: 'm6', ue: 'own', ut: { mode: 'pred', rows: UNC_ROWS }, ua: 'B', uc: 1,
    ux: 'merge', ud: 25.5, up: 0.95, uk: { n: 3, s: 2.5, k: 4, w: 0.25, r: 0.9 }, us: 4242, step: 3, pred: 1, lang: 'en', nota: 'es' });
  const back = U.decode(U.encode(s));
  assert.equal(back.warning, undefined);
  for (const k of ['v', 'um', 'ue', 'ua', 'uc', 'ux', 'ud', 'up', 'us', 'step', 'pred', 'lang', 'nota']) assert.deepEqual(back.state[k], s[k], k);
  assert.deepEqual(back.state.ut, { mode: 'pred', rows: UNC_ROWS });
  assert.deepEqual(back.state.uk, { n: 3, s: 2.5, k: 4, w: 0.25, r: 0.9 });
  const succ = Object.assign({}, s, { ut: { mode: 'succ', rows: UNC_ROWS.slice(0, 2) } });
  assert.deepEqual(U.decode(U.encode(succ)).state.ut, { mode: 'succ', rows: UNC_ROWS.slice(0, 2) });
});

test('F4a: la tabla propia admite 40 filas (P9) y se recorta a los límites de la tabla', () => {
  const rows = Array.from({ length: 45 }, (_, i) => ({ id: `A${i}`, name: 'x'.repeat(100), a: '1', m: '2', b: '3', links: '' }));
  const s = Object.assign(U.defaults(), { v: 'unc', ue: 'own', ut: { mode: 'pred', rows } });
  const back = U.decode(U.encode(s)).state.ut;
  assert.equal(back.rows.length, U.LIMITS.rows);
  assert.equal(back.rows[0].name.length, U.LIMITS.name);
  // Sin tabla propia, ue=own es malformado y vuelve a Klastorin.
  const bad = U.decode('#v=unc&ue=own');
  assert.equal(bad.warning, 'malformed'); assert.equal(bad.state.ue, 'kl'); assert.equal(bad.state.ut, null);
});

test('F4a: valores fuera de rango son malformados y vuelven al valor por defecto', () => {
  const cases = [
    ['#v=unc&um=m7', 'um', 'm5'], ['#v=unc&ue=zz', 'ue', 'kl'], ['#v=unc&ux=foo', 'ux', 'exam'], ['#v=unc&uc=2', 'uc', 0],
    ['#v=unc&ua=A-1', 'ua', null], ['#v=unc&ud=-3', 'ud', null], ['#v=unc&ud=abc', 'ud', null], ['#v=unc&up=1', 'up', null],
    ['#v=unc&up=0', 'up', null], ['#v=unc&up=1.5', 'up', null], ['#v=unc&us=0', 'us', null], ['#v=unc&us=1000000', 'us', null],
    ['#v=unc&uk=n9', 'uk', null], ['#v=unc&uk=n2.n3', 'uk', null], ['#v=unc&uk=k0', 'uk', null], ['#v=unc&uk=r101', 'uk', null],
    ['#v=unc&uk=s201', 'uk', null], ['#v=unc&uk=q1', 'uk', null], ['#v=unc&ue=own&ut=zzzz', 'ut', null],
    // Los casos del Tema 6c (dos rutas, paralelización) solo existen en M6.
    ['#v=unc&um=m5&ue=tr', 'ue', 'kl'],
  ];
  for (const [h, k, v] of cases) {
    const r = U.decode(h);
    assert.equal(r.warning, 'malformed', h);
    assert.deepEqual(r.state[k], v, h);
  }
  assert.equal(U.decode('#v=unc&um=m6&ue=tr').warning, undefined);
  assert.deepEqual(U.decode('#v=unc&uk=w50.r0').state.uk, { w: 0.5, r: 0 });
  assert.deepEqual(U.decode('#v=unc&uk=s25').state.uk, { s: 2.5 });   // la holgura va en décimas
});

test('F4a: las claves u* solo cuentan en v=unc; los enlaces de las fases anteriores no cambian', () => {
  const r = U.decode('#v=route&ex=ej6&um=m6&us=7&uk=n3');
  assert.equal(r.state.um, 'm5'); assert.equal(r.state.us, null); assert.equal(r.state.uk, null);
  for (const v of ['route', 'work', 'm0', 'ex', 'moodle']) {
    const s = Object.assign(U.defaults(), { v, um: 'm6', us: 9, ux: 'merge' });
    const q = new URLSearchParams(U.encode(s).slice(1));
    for (const k of ['um', 'us', 'ux']) assert.ok(!q.has(k), `${v}: ${k}`);
  }
});
