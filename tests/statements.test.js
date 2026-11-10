'use strict';
// core/statements (F2c, T009): los enunciados de M0. Los siete de la hoja de ejercicios del Tema 6 del autor
// (J. M. Galán, Gestión de Proyectos, UBU), con el texto español de la hoja, la versión inglesa y sus fragmentos.
const test = require('node:test');
const assert = require('node:assert/strict');
const ST = require('../js/core/statements.js');
const S = require('../js/core/statement.js');
const P = require('../js/core/project.js');
const E = require('../js/core/examples.js');
const C = require('../js/core/cpm.js');
const A = require('../js/core/aoa.js');
const M = require('../js/core/mindummy.js');
const U = require('../js/core/urlstate.js');

const APUNTES = ['ej1', 'ej2', 'ej3', 'ej4', 'ej5', 'ej6', 'ej7'];
const predsOf = (p) => Object.fromEntries(p.activities.map((a) => [a.id, [...p.preds[a.id]]]));
const dursOf = (p) => Object.fromEntries(p.activities.map((a) => [a.id, a.d]));

test('los siete enunciados de los apuntes están, visibles, y la URL los conoce todos', () => {
  assert.deepEqual(ST.list().map((s) => s.id).filter((id) => APUNTES.includes(id)), APUNTES);
  for (const id of APUNTES) assert.equal(ST.get(id).id, id);
  assert.equal(ST.get('nada'), null);
  assert.deepEqual(ST.list({ all: true }).map((s) => s.id).sort(), [...U.STATEMENTS].sort());
});

test('cada enunciado pasa la revisión de contenido estricta (fragmentos en ES y EN, todo justificado)', () => {
  for (const def of ST.list({ all: true })) assert.deepEqual(S.validate(def, { strict: true }), [], def.id);
});

test('cada enunciado cita su fuente y tiene título en los dos idiomas', () => {
  for (const id of APUNTES) {
    const def = ST.get(id);
    assert.match(def.source.es, /Tema 6/);
    assert.match(def.source.en, /Unit 6/);
    assert.ok(def.title.es && def.title.en);
  }
});

test('la referencia de los ejercicios 1–4, 6 y 7 es la tabla de su ejemplo (F1 y F2a)', () => {
  for (const id of ['ej1', 'ej2', 'ej3', 'ej4', 'ej6', 'ej7']) {
    const def = ST.get(id);
    assert.equal(def.example, id);
    const ex = E.get(id);
    const pe = P.parse(ex.rows, ex.mode, { structureOnly: !!ex.structureOnly }).project;
    for (const lang of ['es', 'en']) {
      const st = S.build(def, lang);
      assert.deepEqual(predsOf(st.ref), predsOf(pe), `${id} ${lang}`);
      assert.deepEqual(dursOf(st.ref), dursOf(pe), `${id} ${lang}`);
      assert.equal(st.structureOnly, !!ex.structureOnly);
    }
  }
});

test('Electrona (Tema 6, ejercicio 5): la referencia validada por el autor, 17 días, A–D–H–I–J–K y 2 ficticias', () => {
  const st = S.build(ST.get('ej5'), 'es');
  assert.deepEqual(predsOf(st.ref), { A: [], B: [], C: [], D: ['A', 'B'], E: ['B', 'C'], F: ['A', 'B'], G: ['F'], H: ['D', 'E'], I: ['H'], J: ['G', 'I'], K: ['J'] });
  assert.deepEqual(dursOf(st.ref), { A: 3, B: 1, C: 2, D: 7, E: 5, F: 6, G: 1, H: 2, I: 1, J: 3, K: 1 });
  const sol = C.solve(st.ref);
  assert.equal(sol.duration, 17);
  assert.deepEqual(sol.critical, ['A', 'D', 'H', 'I', 'J', 'K']);
  assert.equal(A.build(st.ref).dummies.length, 2);
  const min = M.solve(st.ref);
  assert.equal(min.exact, true);
  assert.equal(min.value, 2);
});

test('Electrona: el texto no tiene frases de dependencia; las precedencias salen de la descripción de cada fase', () => {
  const st = S.build(ST.get('ej5'), 'es');
  assert.equal(st.frags.filter((f) => f.kind === 'precedence').length, 0);
  const D = st.frags.find((f) => f.kind === 'activity' && f.act === 'D');
  assert.deepEqual(D.gives, [['A', 'D'], ['B', 'D']]);
  assert.ok(D.why.es && D.why.en);
});

test('Electrona: la ruta guiada da un paso por fragmento y el de D añade A → D y B → D con su deducción', () => {
  const st = S.build(ST.get('ej5'), 'es');
  const tr = S.route(st);
  assert.equal(tr.filter((s) => s.kind === 'm0Frag').length, st.frags.length);
  const d = tr.find((s) => s.kind === 'm0Frag' && st.frags.find((f) => f.id === s.frag).act === 'D' && s.adds.edges.length);
  assert.deepEqual(d.adds.edges, [['A', 'D'], ['B', 'D']]);
  assert.deepEqual(d.answer, { kind: 'edges', edges: [['A', 'D'], ['B', 'D']] });
  const clean = tr[tr.length - 1];
  assert.equal(clean.kind, 'm0Clean');
  assert.deepEqual(clean.removes, []);
});

test('los enunciados de los apuntes reconstruyen exactamente su texto y sus fragmentos no se solapan', () => {
  for (const def of ST.list({ all: true })) {
    for (const lang of ['es', 'en']) {
      const st = S.build(def, lang);
      const text = def.text[lang].map((s) => (Array.isArray(s) ? s[1] : s)).join('');
      assert.equal(st.lead + st.words.map((w) => w.t + w.sep).join(''), text);
      const fr = st.frags.slice().sort((x, y) => x.from - y.from);
      for (let i = 1; i < fr.length; i++) assert.ok(fr[i].from > fr[i - 1].to, `${def.id} ${lang} ${fr[i].id}`);
    }
  }
});

// ── T013: enunciados nuevos (aprobados por el autor el 2026-11-10; visibles desde T020, publicación del hito 1) ──
const NUEVOS = ['cocina', 'congreso', 'mudanza', 'lanzamiento'];
const edgesOf = (p) => p.activities.flatMap((a) => p.preds[a.id].map((x) => [x, a.id]));

test('T020 · los enunciados nuevos están, visibles después de los de los apuntes, y la revisión estricta no les encuentra problemas', () => {
  for (const id of NUEVOS) {
    assert.ok(!ST.get(id).hidden, id);
    assert.deepEqual(S.validate(ST.get(id), { strict: true }), [], id);
  }
  assert.deepEqual(ST.list().map((s) => s.id), ['ej1', 'ej2', 'ej3', 'ej4', 'ej5', 'ej6', 'ej7', ...NUEVOS]);
  assert.deepEqual(ST.list(), ST.list({ all: true }));
});

test('entre todos cubren los tipos de frase de la spec (AC11)', () => {
  const defs = NUEVOS.map((id) => ST.get(id));
  const frags = defs.flatMap((d) => Object.values(d.frags));
  for (const kind of ['activity', 'duration', 'precedence', 'none', 'start', 'end']) assert.ok(frags.some((f) => f.kind === kind), kind);
  // Distractores (en paralelo y recursos): al menos cuatro frases que no dan precedencia, con su porqué en las de recursos.
  assert.ok(frags.filter((f) => f.kind === 'none').length >= 4);
  assert.ok(frags.filter((f) => f.kind === 'none' && f.why).length >= 2);
  // Redundancia provocada: alguna frase da una precedencia que la referencia no necesita.
  assert.ok(defs.some((d) => {
    const st = S.build(d, 'es');
    const red = new Set(edgesOf(require('../js/core/precheck.js').reduce(st.ref)).map((e) => e.join('>')));
    return Object.values(d.frags).some((f) => f.kind === 'precedence' && (f.gives || []).some((e) => !red.has(e.join('>'))));
  }));
  // Prosa sin letras: ningún identificador de la referencia aparece como palabra en el texto.
  assert.ok(defs.some((d) => ['es', 'en'].every((L) => { const st = S.build(d, L); const ids = new Set(st.ref.activities.map((a) => a.id)); return !st.words.some((w) => ids.has(w.t)); })));
  // Unidades distintas de días.
  assert.ok(defs.some((d) => d.unit && d.unit.es === 'semanas'));
});

test('congreso: leer «B sigue a A» al revés da un ciclo (trampa de lectura) y bien leído no', () => {
  const st = S.build(ST.get('congreso'), 'es');
  assert.deepEqual(st.frags.find((f) => f.id === 'p1').gives, [['A', 'B']]);
  const rows = st.ref.activities.map((a) => ({ id: a.id, duration: '', links: st.ref.preds[a.id].join(', ') }));
  const wrong = rows.map((r) => (r.id === 'A' ? Object.assign({}, r, { links: 'B' }) : r));
  assert.deepEqual(P.parse(wrong, 'pred', { structureOnly: true }).report.errors.map((e) => e.code), ['cycle']);
  assert.equal(P.parse(rows, 'pred', { structureOnly: true }).report.errors.length, 0);
});

test('duraciones y caminos críticos de los enunciados nuevos con duraciones', () => {
  const dur = (id) => C.solve(S.build(ST.get(id), 'es').ref);
  assert.equal(dur('cocina').duration, 13);
  assert.deepEqual(dur('cocina').critical, ['A', 'B', 'D', 'F', 'G', 'H']);
  assert.equal(dur('mudanza').duration, 9);
  assert.equal(dur('lanzamiento').duration, 19);
  assert.deepEqual(dur('lanzamiento').critical, ['A', 'B', 'E', 'F']);
  assert.equal(S.build(ST.get('congreso'), 'es').structureOnly, true);
});
