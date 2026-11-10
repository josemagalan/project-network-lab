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
