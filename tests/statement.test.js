'use strict';
// core/statement (F2c, T005): el enunciado como objeto — palabras, fragmentos, emparejamiento, avisos de las
// marcas del alumno, propuestas, fuentes, paso de idioma y ruta guiada. Spec f2c-enunciado-tabla, Behaviour.
const test = require('node:test');
const assert = require('node:assert/strict');
const S = require('../js/core/statement.js');
const P = require('../js/core/project.js');

// Enunciado de prueba (no es contenido de la herramienta): cuatro actividades, una frase de cada tipo.
const DEF = {
  id: 'prueba', title: { es: 'Prueba', en: 'Test' }, source: { es: '—', en: '—' }, unit: { es: 'días', en: 'days' }, structureOnly: false,
  text: {
    es: ['Hay que ', ['fa', 'pintar las paredes'], ' (', ['da', 'A=2'], '), ', ['fb', 'poner el suelo'], ' y ', ['fc', 'colgar los cuadros'], '. ',
      ['p1', 'El suelo no puede empezar hasta que acabe la pintura'], '. ', ['n1', 'Los cuadros pueden ir en paralelo con el suelo'], '. ',
      ['e1', 'Limpiar es lo último'], '.'],
    en: ['We must ', ['fa', 'paint the walls'], ' (', ['da', 'A=2'], '), ', ['fb', 'lay the floor'], ' and ', ['fc', 'hang the pictures'], '. ',
      ['p1', 'The floor cannot start until the painting is finished'], '. ', ['n1', 'The pictures can run in parallel with the floor'], '. ',
      ['e1', 'Cleaning is the last task'], '.'],
  },
  frags: {
    fa: { kind: 'activity', act: 'A' }, da: { kind: 'duration', act: 'A', value: 2 }, fb: { kind: 'activity', act: 'B' },
    fc: { kind: 'activity', act: 'C', gives: [['A', 'C']], why: { es: 'Los cuadros se cuelgan en paredes pintadas.', en: 'Pictures go on painted walls.' } },
    p1: { kind: 'precedence', gives: [['A', 'B']] }, n1: { kind: 'none' },
    e1: { kind: 'end', act: 'D', gives: [['A', 'D'], ['B', 'D'], ['C', 'D']] },
  },
  ref: { mode: 'pred', rows: [
    { id: 'A', duration: '2', links: '', name: { es: 'Pintar', en: 'Paint' } },
    { id: 'B', duration: '3', links: 'A', name: { es: 'Suelo', en: 'Floor' } },
    { id: 'C', duration: '1', links: 'A', name: { es: 'Cuadros', en: 'Pictures' } },
    { id: 'D', duration: '1', links: 'B, C', name: { es: 'Limpiar', en: 'Clean' } }] },
};
const OWN = { lang: 'es', text: 'A) Pintar. B) Suelo, después de A.', frags: [{ from: 0, to: 1, kind: 'activity', act: 'A' }, { from: 4, to: 6, kind: 'precedence', gives: [['A', 'B']] }],
  ref: { mode: 'pred', rows: [{ id: 'A', duration: '', links: '', name: 'Pintar' }, { id: 'B', duration: '', links: 'A', name: 'Suelo' }] } };
const rows = (pred, dur) => Object.keys(pred).map((id) => ({ id, name: '', duration: String((dur && dur[id]) || 1), links: pred[id].join(', ') }));
const project = (pred, dur) => P.parse(rows(pred, dur), 'pred').project;
const fragOf = (st, id) => st.frags.find((f) => f.id === id);
const textOf = (st, f) => st.words.slice(f.from, f.to + 1).map((w) => w.t).join(' ');
const clone = () => JSON.parse(JSON.stringify(DEF));

// ── tokenize ───────────────────────────────────────────────────────────────────────────────────────────────
test('tokenize: palabras con acentos, apóstrofos y cifras; el resto es separador', () => {
  const src = '«A) Aprovisionamiento de materiales; B=4, l\'école — F es lo último.»';
  const tk = S.tokenize(src);
  assert.equal(tk.lead, '«');
  assert.deepEqual(tk.words.map((w) => w.t), ['A', 'Aprovisionamiento', 'de', 'materiales', 'B', '4', 'l\'école', 'F', 'es', 'lo', 'último']);
  assert.equal(tk.words[0].sep, ') ');
  assert.equal(tk.words[10].sep, '.»');
  assert.deepEqual(tk.words.map((w) => w.i), tk.words.map((_, i) => i));
  assert.equal(tk.lead + tk.words.map((w) => w.t + w.sep).join(''), src);
});

test('tokenize: estable (el mismo texto da las mismas posiciones) y sin palabras en un texto vacío', () => {
  const t = 'Una vez terminado A, empieza B; C sigue a B.';
  assert.deepEqual(S.tokenize(t), S.tokenize(t));
  assert.deepEqual(S.tokenize(''), { lead: '', words: [] });
  assert.deepEqual(S.tokenize(' — ').words, []);
});

// ── build y validate ───────────────────────────────────────────────────────────────────────────────────────
test('build: un enunciado de la herramienta en cada idioma, con los fragmentos como rangos de palabras', () => {
  const es = S.build(DEF, 'es');
  assert.equal(textOf(es, fragOf(es, 'fa')), 'pintar las paredes');
  assert.equal(textOf(es, fragOf(es, 'da')), 'A 2');
  assert.deepEqual(fragOf(es, 'p1').gives, [['A', 'B']]);
  assert.deepEqual(es.frags.map((f) => f.id), ['fa', 'da', 'fb', 'fc', 'p1', 'n1', 'e1']);
  assert.deepEqual(es.ref.preds.D, ['B', 'C']);
  assert.equal(es.ref.activities[0].name, 'Pintar');
  const en = S.build(DEF, 'en');
  assert.equal(textOf(en, fragOf(en, 'fb')), 'lay the floor');
  assert.equal(en.ref.activities[1].name, 'Floor');
});

test('build: un enunciado propio (rangos de palabras, un idioma, tabla opcional)', () => {
  const st = S.build(OWN);
  assert.equal(st.id, 'own');
  assert.equal(st.lang, 'es');
  assert.equal(st.structureOnly, true);
  assert.equal(textOf(st, st.frags[1]), 'después de A');
  assert.equal(S.build(Object.assign({}, OWN, { ref: null })).ref, null);
});

test('validate: el enunciado de prueba no tiene problemas (estricto)', () => {
  assert.deepEqual(S.validate(DEF, { strict: true }), []);
});

test('validate: un caso por problema', () => {
  const codes = (def, strict) => S.validate(def, { strict }).map((x) => x.code);
  let d = clone(); d.text.en = d.text.en.filter((s) => !(Array.isArray(s) && s[0] === 'n1'));
  assert.deepEqual(codes(d, true), ['fragMismatch']);
  d = clone(); d.text.es.push(' ', ['p1', 'otra vez']);
  assert.deepEqual(codes(d, true), ['fragDuplicate']);
  d = clone(); d.text.es[d.text.es.findIndex((s) => Array.isArray(s) && s[0] === 'n1')] = ['n1', ' — '];
  assert.deepEqual(codes(d, true), ['fragEmpty']);
  d = clone(); d.frags.fb.act = 'Z';
  assert.deepEqual(codes(d, true), ['unknownAct']);
  d = clone(); d.frags.n1 = { kind: 'magia' };
  assert.deepEqual(codes(d, true), ['badKind']);
  d = clone(); d.frags.p1.gives = [['B', 'A']];
  assert.deepEqual(codes(d, true), ['fragNotInRef', 'unjustified']);
  d = clone(); d.ref.rows[0].links = 'D';
  assert.deepEqual(codes(d, true), ['refInvalid']);
  d = clone(); d.frags.p1 = { kind: 'none' };
  assert.deepEqual(codes(d, true), ['unjustified']);
  assert.deepEqual(S.validate(d, { strict: false }).map((x) => [x.code, !!x.warn]), [['unjustified', true]]);
});

test('validate: enunciado propio con un rango fuera del texto', () => {
  const own = { lang: 'es', text: 'A y B.', frags: [{ from: 1, to: 5, kind: 'activity', act: 'B' }], ref: null };
  assert.deepEqual(S.validate(own, { strict: false }).map((x) => x.code), ['badRange']);
});

// ── match ──────────────────────────────────────────────────────────────────────────────────────────────────
test('match: por las palabras subrayadas, aunque el alumno use otra letra', () => {
  const st = S.build(DEF, 'es');
  const fa = fragOf(st, 'fa'), fc = fragOf(st, 'fc');
  const marks = [{ from: fa.from + 1, to: fa.to, kind: 'activity', act: 'P' }, { from: fc.from, to: fc.to, kind: 'activity', act: 'C' }];
  const m = S.match(st, marks, project({ P: [], C: ['P'], B: ['P'], X: [] }));
  assert.deepEqual(m.map, { P: 'A', C: 'C', B: 'B' });
  assert.deepEqual(m.extra, ['X']);
  assert.deepEqual(m.missing, ['D']);
});

test('match: gana el fragmento con más palabras compartidas; con empate, el primero en el texto', () => {
  const st = S.build(DEF, 'es');
  const fa = fragOf(st, 'fa'), fb = fragOf(st, 'fb');
  const m1 = S.match(st, [{ from: fa.to, to: fb.to, kind: 'activity', act: 'Q' }], project({ Q: [] }));
  assert.equal(m1.map.Q, 'B');
  const m2 = S.match(st, [{ from: fa.from, to: fa.from, kind: 'activity', act: 'Q' }, { from: fb.from, to: fb.from, kind: 'activity', act: 'Q' }], project({ Q: [] }));
  assert.equal(m2.map.Q, 'A');
});

test('match: sin subrayado, por identificador; sin tabla, todo falta', () => {
  const st = S.build(DEF, 'es');
  const m = S.match(st, [], project({ A: [], B: ['A'], C: ['A'], D: ['B', 'C'] }));
  assert.deepEqual(m, { map: { A: 'A', B: 'B', C: 'C', D: 'D' }, extra: [], missing: [] });
  assert.deepEqual(S.match(st, [], null), { map: {}, extra: [], missing: ['A', 'B', 'C', 'D'] });
});

// ── markWarnings ───────────────────────────────────────────────────────────────────────────────────────────
test('markWarnings: final declarado que no se cumple y actividad subrayada que no está en la tabla', () => {
  const st = S.build(DEF, 'es');
  const e1 = fragOf(st, 'e1');
  const marks = [{ from: e1.from, to: e1.to, kind: 'precedence', gives: [], decl: { end: 'end', act: 'D' } },
    { from: 0, to: 1, kind: 'activity', act: 'Z' }];
  const w = S.markWarnings(st, marks, project({ A: [], B: ['A'], D: ['B'], C: ['A'] }));
  assert.deepEqual(w, [{ code: 'declEnd', mark: 0, ids: ['D'], others: ['C'] }, { code: 'markedMissing', mark: 1, ids: ['Z'] }]);
});

test('markWarnings: inicio declarado; da lo mismo con referencia que sin ella', () => {
  const st = S.build(DEF, 'es');
  const marks = [{ from: 0, to: 0, kind: 'precedence', gives: [], decl: { end: 'start', act: 'B' } }];
  const p = project({ A: [], B: ['A'] });
  const w = S.markWarnings(st, marks, p);
  assert.deepEqual(w, [{ code: 'declStart', mark: 0, ids: ['B'], others: ['A'] }]);
  assert.deepEqual(S.markWarnings(Object.assign({}, st, { ref: null, frags: [] }), marks, p), w);
  assert.deepEqual(S.markWarnings(st, marks, null), [{ code: 'markedMissing', mark: 0, ids: ['B'] }]);
});

// ── suggest ────────────────────────────────────────────────────────────────────────────────────────────────
test('suggest: la letra del texto, la siguiente libre y el número', () => {
  const { words } = S.tokenize('A) Aprovisionamiento de materiales. Duraciones: A=3, B=1 y C = 2,5 días. Fabricar Y.');
  assert.deepEqual(S.suggest(words, 0, 3, []), { id: 'A', fromText: true });
  assert.deepEqual(S.suggest(words, 1, 3, []), { id: 'A', fromText: true });
  assert.deepEqual(S.suggest(words, 5, 6, ['B']), { id: 'A', fromText: true, value: 3 });
  assert.deepEqual(S.suggest(words, 10, 12, ['A', 'B']), { id: 'C', fromText: true, value: 2.5 });
  assert.deepEqual(S.suggest(words, 14, 15, ['A', 'B', 'C']), { id: 'D', fromText: false });
  assert.deepEqual(S.suggest(words, 14, 15, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')), { id: 'A1', fromText: false });
});

// ── sources ────────────────────────────────────────────────────────────────────────────────────────────────
test('sources: el subrayado del alumno siempre; el fragmento de la referencia solo con reveal', () => {
  const st = S.build(DEF, 'es');
  const marks = [{ from: 0, to: 1, kind: 'activity', act: 'A' }, { from: 10, to: 12, kind: 'precedence', gives: [['A', 'B']] }];
  assert.deepEqual(S.sources(st, marks, ['A', 'B'], {}), { mark: 1 });
  assert.deepEqual(S.sources(st, marks, ['A', 'B'], { reveal: true }), { mark: 1, frag: 'p1' });
  assert.deepEqual(S.sources(st, marks, ['P', 'B'], { reveal: true, refEdge: ['A', 'B'] }), { frag: 'p1' });
  assert.deepEqual(S.sources(st, [], ['C', 'D'], { reveal: true }), { frag: 'e1' });
  assert.deepEqual(S.sources(st, [], ['B', 'C'], { reveal: true }), {});
});

// ── moveMarks ──────────────────────────────────────────────────────────────────────────────────────────────
test('moveMarks: cada marca pasa al mismo fragmento del otro idioma; las demás se quitan y se cuentan', () => {
  const es = S.build(DEF, 'es'), en = S.build(DEF, 'en');
  const fb = fragOf(es, 'fb'), p1 = fragOf(es, 'p1');
  const marks = [{ from: fb.from, to: fb.from + 1, kind: 'activity', act: 'B' },
    { from: p1.from + 2, to: p1.to, kind: 'precedence', gives: [['A', 'B']] },
    { from: 0, to: 1, kind: 'none' }];
  const out = S.moveMarks(DEF, marks, 'es', 'en');
  assert.equal(out.dropped, 1);
  assert.deepEqual(out.marks, [
    { from: fragOf(en, 'fb').from, to: fragOf(en, 'fb').to, kind: 'activity', act: 'B' },
    { from: fragOf(en, 'p1').from, to: fragOf(en, 'p1').to, kind: 'precedence', gives: [['A', 'B']] }]);
  assert.deepEqual(S.moveMarks(DEF, out.marks, 'en', 'es').marks.map((m) => [m.from, m.to]), [[fb.from, fb.to], [p1.from, p1.to]]);
});

// ── route ──────────────────────────────────────────────────────────────────────────────────────────────────
test('route: un paso por fragmento en el orden del texto, la tabla depurada al final y la predicción', () => {
  const tr = S.route(S.build(DEF, 'es'));
  assert.deepEqual(tr.map((s) => s.kind), ['m0Text', 'm0Frag', 'm0Frag', 'm0Frag', 'm0Frag', 'm0Frag', 'm0Frag', 'm0Frag', 'm0Clean']);
  assert.deepEqual(tr.slice(1, 8).map((s) => s.frag), ['fa', 'da', 'fb', 'fc', 'p1', 'n1', 'e1']);
  const by = (f) => tr.find((s) => s.frag === f);
  assert.deepEqual(by('fa').adds, { acts: ['A'], durations: [], edges: [] });
  assert.deepEqual(by('da').adds, { acts: [], durations: [['A', 2]], edges: [] });
  assert.equal(by('fa').fields, undefined);
  assert.deepEqual(by('fc').adds, { acts: ['C'], durations: [], edges: [['A', 'C']] });
  assert.deepEqual(by('fc').answer, { kind: 'edges', edges: [['A', 'C']] });
  assert.deepEqual(by('fc').fields, ['m0.gives']);
  assert.deepEqual(by('n1').answer, { kind: 'none', edges: [] });
  assert.deepEqual(by('e1').adds.acts, ['D']);
  assert.deepEqual(by('e1').redundant, []);
  assert.deepEqual(by('e1').answer, { kind: 'edges', edges: [['A', 'D'], ['B', 'D'], ['C', 'D']] });
  const clean = tr[tr.length - 1];
  assert.deepEqual(clean.removes, [['A', 'D']]);
  assert.deepEqual(clean.table.D, ['B', 'C']);
  for (const s of tr) assert.deepEqual(s.reveals, []);
});

test('route: un fragmento cuyas precedencias ya están implicadas es «redundante»', () => {
  const def = clone();
  def.text.es.push(' ', ['r1', 'Hay que pintar antes de limpiar']); def.text.en.push(' ', ['r1', 'Paint before cleaning']);
  def.frags.r1 = { kind: 'precedence', gives: [['A', 'D']] };
  const r1 = S.route(S.build(def, 'es')).find((s) => s.frag === 'r1');
  assert.deepEqual(r1.redundant, [['A', 'D']]);
  assert.deepEqual(r1.answer, { kind: 'redundant', edges: [['A', 'D']] });
});

test('route: también con un enunciado propio (solo sus fragmentos)', () => {
  const tr = S.route(S.build(OWN));
  assert.deepEqual(tr.map((s) => s.kind), ['m0Text', 'm0Frag', 'm0Frag', 'm0Clean']);
  assert.deepEqual(tr[2].adds, { acts: ['B'], durations: [], edges: [['A', 'B']] });
});

test('T015: suggest dice si la letra sale del texto («A)», «A:», «A=») o es la siguiente libre', () => {
  const { words } = S.tokenize('A) Comprar materiales. Luego montar la estructura.');
  assert.deepEqual(S.suggest(words, 1, 2, []), { id: 'A', fromText: true });
  const n = S.suggest(words, 4, 6, ['A']);
  assert.equal(n.id, 'B');
  assert.equal(n.fromText, false);
  const { words: w2 } = S.tokenize('A precede a D');
  assert.equal(S.suggest(w2, 0, 3, []).fromText, false, 'una letra sin «)», «:» o «=» no es un identificador del texto');
});

// ── T027: revisión de nivel 2 (ronda 1) ────────────────────────────────────────────────────────────────────
test('T027 (F4) · validate: una duración, un inicio o un final sobre una actividad que no está en la referencia', () => {
  const codes = (def) => S.validate(def, { strict: true }).map((x) => x.code);
  let d = clone(); d.frags.da.act = 'Z';
  assert.deepEqual(codes(d), ['unknownAct']);
  d = clone(); d.frags.e1.act = 'Z';
  assert.deepEqual(codes(d), ['unknownAct']);
  d = clone(); d.frags.e1.kind = 'start'; d.frags.e1.act = 'Z';
  assert.deepEqual(codes(d), ['unknownAct']);
});

test('T027 (F10) · validate: la duración de un fragmento tiene que ser la de la referencia', () => {
  const issues = (def) => S.validate(def, { strict: false }).filter((x) => !x.warn);
  let d = clone(); d.frags.da.value = 5;
  assert.deepEqual(issues(d), [{ code: 'durMismatch', frag: 'da', ids: ['A'] }]);
  // En un enunciado propio, igual; y con una referencia sin duraciones, cualquier duración subrayada no casa.
  const own = { lang: 'es', text: 'A dura 5 días. B sigue a A.', frags: [{ from: 0, to: 0, kind: 'activity', act: 'A' }, { from: 2, to: 3, kind: 'duration', act: 'A', value: 5 },
    { from: 4, to: 7, kind: 'precedence', gives: [['A', 'B']] }], ref: { mode: 'pred', rows: [{ id: 'A', duration: '7', links: '', name: '' }, { id: 'B', duration: '1', links: 'A', name: '' }] } };
  assert.deepEqual(issues(own), [{ code: 'durMismatch', frag: 1, ids: ['A'] }]);
  own.ref.rows[0].duration = '5';
  assert.deepEqual(issues(own), []);
  own.ref.rows.forEach((r) => { r.duration = ''; });
  assert.deepEqual(issues(own), [{ code: 'durMismatch', frag: 1, ids: ['A'] }]);
});

test('T027 (F13) · match: el emparejamiento busca el mayor solape en toda la tabla, no en el orden de las filas', () => {
  const st = S.build(DEF, 'es');
  const fa = fragOf(st, 'fa'), fb = fragOf(st, 'fb'), fc = fragOf(st, 'fc');
  // P, escrita antes, comparte una palabra con fb y otra con fc; Q subraya fb entera. Q es B y P, C.
  const marks = [{ from: fb.to, to: fc.from, kind: 'activity', act: 'P' }, { from: fb.from, to: fb.to, kind: 'activity', act: 'Q' }];
  const m = S.match(st, marks, project({ P: [], Q: [] }));
  assert.deepEqual(m.map, { P: 'C', Q: 'B' });
  assert.deepEqual(m.extra, []);
  // Con el mismo solape gana la primera del texto, y entre dos actividades del alumno, la primera de la tabla.
  const tie = S.match(st, [{ from: fa.from, to: fa.to, kind: 'activity', act: 'P' }, { from: fa.from, to: fa.to, kind: 'activity', act: 'Q' }], project({ P: [], Q: [] }));
  assert.deepEqual(tie.map, { P: 'A' });
  assert.deepEqual(tie.extra, ['Q']);
});

test('T027 (F5) · markWarnings: con la tabla en error, una actividad subrayada que tiene fila no avisa', () => {
  const st = S.build(DEF, 'es');
  const marks = [{ from: 0, to: 1, kind: 'activity', act: 'A' }, { from: 2, to: 3, kind: 'activity', act: 'Z' },
    { from: 4, to: 4, kind: 'precedence', gives: [], decl: { end: 'end', act: 'A' } }];
  assert.deepEqual(S.markWarnings(st, marks, null, ['A', 'B']), [{ code: 'markedMissing', mark: 1, ids: ['Z'] }]);
});

test('T027 (F6) · moveMarks: un subrayado que cruza dos fragmentos pasa al que más solapa; con empate, al primero del texto', () => {
  const es = S.build(DEF, 'es'), en = S.build(DEF, 'en');
  const fb = fragOf(es, 'fb'), fc = fragOf(es, 'fc');
  const one = S.moveMarks(DEF, [{ from: fb.to, to: fc.from + 1, kind: 'none' }], 'es', 'en');
  assert.deepEqual(one.marks.map((m) => [m.from, m.to]), [[fragOf(en, 'fc').from, fragOf(en, 'fc').to]]);
  const tie = S.moveMarks(DEF, [{ from: fb.to, to: fc.from, kind: 'none' }], 'es', 'en');
  assert.deepEqual(tie.marks.map((m) => [m.from, m.to]), [[fragOf(en, 'fb').from, fragOf(en, 'fb').to]]);
});
