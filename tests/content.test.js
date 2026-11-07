'use strict';
// narrate: cada paso de la traza tiene título, explicación y fórmula con sus números, en ES y EN (AC6, AC9, AC10).
const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../js/core/project.js');
const E = require('../js/core/examples.js');
const C = require('../js/core/cpm.js');
const N = require('../js/narrate.js');

const ctxFor = (id, lang, nota) => {
  const ex = E.get(id);
  const project = P.parse(ex.rows, ex.mode).project;
  return { lang, nota, project, solution: C.solve(project), unit: ex.unit[lang] };
};

test('todos los pasos de los seis ejemplos tienen título y texto, en los dos idiomas y notaciones, sin claves sin traducir', () => {
  for (const ex of E.list()) {
    for (const lang of ['es', 'en']) {
      for (const nota of ['en', 'es']) {
        const ctx = ctxFor(ex.id, lang, nota);
        for (const st of ctx.solution.trace) {
          const n = N.narrate(st, ctx);
          assert.ok(n.title && n.text, `${ex.id}/${lang}/${st.kind}`);
          for (const s of [n.title, n.text, ...n.lines]) assert.doesNotMatch(s, /\b(narr|steps|floatNarr|formula)\.|\{\w+\}/, `${ex.id}/${lang}: ${s}`);
        }
      }
    }
  }
});

test('AC6: el paso de E en el Ejercicio 6 explica que manda B, con la fórmula y sus números', () => {
  const ctx = ctxFor('ej6', 'es', 'en');
  const st = ctx.solution.trace.find((x) => x.kind === 'forward' && x.act === 'E');
  const n = N.narrate(st, ctx);
  assert.equal(n.title, 'Pasada hacia delante · actividad E');
  assert.match(n.text, /A y B.*: B\./);
  assert.deepEqual(n.lines, ['ES(E) = máx { EF(A), EF(B) } = máx { 2, 3 } = 3', 'EF(E) = ES(E) + d(E) = 3 + 4 = 7']);
});

test('AC10: con notación española, la misma fórmula usa tᵢ y fᵢ', () => {
  const ctx = ctxFor('ej6', 'es', 'es');
  const st = ctx.solution.trace.find((x) => x.kind === 'backward' && x.act === 'B');
  assert.deepEqual(N.narrate(st, ctx).lines, ['fᵢ*(B) = mín { tᵢ*(E), tᵢ*(F), tᵢ*(G) } = mín { 3, 4, 5 } = 3', 'tᵢ*(B) = fᵢ*(B) − d(B) = 3 − 3 = 0']);
  const fl = ctx.solution.trace.find((x) => x.kind === 'float' && x.float === 'IF');
  assert.equal(N.narrate(fl, ctx).lines[0], 'HI = máx(0, mín(tᵢ sucesoras) − máx(fᵢ* predecesoras) − d)');
});

test('el camino crítico se nombra en el idioma elegido', () => {
  const ctx = ctxFor('ej6', 'en', 'en');
  const st = ctx.solution.trace.find((x) => x.kind === 'critical');
  const n = N.narrate(st, ctx);
  assert.match(n.text, /B → E → I → J → K/);
  assert.deepEqual(n.lines, ['B → E → I → J → K = 13 days']);
});

test('el paso de caminos críticos da el recuento real aunque haya más de 50, y avisa de los que no lista (revisión F4)', () => {
  const rows = []; let prev = '';
  for (let k = 1; k <= 6; k++) {
    rows.push({ id: `P${k}`, duration: 1, links: prev }, { id: `Q${k}`, duration: 1, links: prev }, { id: `J${k}`, duration: 1, links: `P${k}, Q${k}` });
    prev = `J${k}`;
  }
  const project = P.parse(rows, 'pred').project;
  const solution = C.solve(project);
  const step = solution.trace.find((s) => s.kind === 'critical');
  for (const lang of ['es', 'en']) {
    const n = N.narrate(step, { lang, nota: 'en', solution, project, unit: '' });
    assert.match(n.text, /64/, `${lang}: ${n.text}`);
    assert.doesNotMatch(n.text, /\b50\b/, lang);
    assert.match(n.lines[n.lines.length - 1], /58/, `${lang}: falta «y 58 más» (${n.lines.at(-1)})`);
  }
});

test('mientras se predice, la narración no dice qué término manda ni da los valores del paso (decisión F7)', () => {
  const ex = E.get('ej6');
  const project = P.parse(ex.rows, ex.mode).project;
  const solution = C.solve(project);
  for (const lang of ['es', 'en']) {
    for (const step of solution.trace.filter((s) => s.kind === 'forward' || s.kind === 'backward')) {
      const open = N.narrate(step, { lang, nota: 'en', solution, project, unit: 'días' });
      const hidden = N.narrate(step, { lang, nota: 'en', solution, project, unit: 'días', hide: true });
      assert.equal(hidden.title, open.title);
      assert.ok(hidden.text && !/\{|\}/.test(hidden.text), `${lang} ${step.kind} ${step.act}: ${hidden.text}`);
      for (const rv of step.reveals) assert.ok(!hidden.text.includes(N.fmt(lang, rv.value)) || /^[A-Z]/.test(String(rv.value)), `${lang} ${step.kind} ${step.act} revela ${rv.value}: ${hidden.text}`);
      const terms = step.formula.terms;
      if (terms.length > 1 && step.formula.chosen.length < terms.length) {
        assert.notEqual(hidden.text, open.text);
        const tail = hidden.text.slice(hidden.text.lastIndexOf('.', hidden.text.length - 2) + 1);
        for (const c of step.formula.chosen) assert.ok(!tail.includes(c), `${lang} ${step.act}: la última frase nombra a ${c}: ${hidden.text}`);
      }
    }
  }
});

test('mientras se predice, con una sola predecesora o sucesora no se pregunta «cuál» (ronda 2, H4)', () => {
  const ex = E.get('ej6');
  const project = P.parse(ex.rows, ex.mode).project;
  const solution = C.solve(project);
  const one = solution.trace.filter((s) => (s.kind === 'forward' || s.kind === 'backward') && s.formula.terms.length === 1
    && ![C.START, C.END].includes(s.formula.terms[0].from) && ![C.START, C.END].includes(s.act));
  assert.ok(one.length >= 2, 'el Ejercicio 6 tiene pasos con un solo término');
  for (const lang of ['es', 'en']) {
    for (const step of one) {
      const txt = N.narrate(step, { lang, nota: 'en', solution, project, unit: '', hide: true }).text;
      assert.doesNotMatch(txt, /¿Cuál|Which one/, `${lang} ${step.kind} ${step.act}: ${txt}`);
      assert.match(txt, new RegExp(`\\b${step.formula.terms[0].from}\\b`));
    }
  }
});

test('los decimales usan coma en español y punto en inglés', () => {
  assert.equal(N.fmt('es', 2.5), '2,5');
  assert.equal(N.fmt('en', 2.5), '2.5');
  // Sin separador de miles: «1,500» se leería como 1,5 en español (revisión F17).
  assert.equal(N.fmt('en', 1500), '1500');
  assert.equal(N.fmt('es', 12345.5), '12345,5');
});

const Lrn = require('../js/learn.js');

test('«Aprende más»: cada tema y el pseudocódigo existen en ES y EN', () => {
  for (const k of ['table', 'build', 'forward', 'backward', 'float', 'critical', 'gantt', 'matrix']) {
    assert.ok(Lrn.topics[k].es.length && Lrn.topics[k].en.length, k);
    assert.equal(Lrn.topics[k].es.length, Lrn.topics[k].en.length, `${k}: mismo número de párrafos`);
  }
  assert.equal(Lrn.pseudo.es.length, Lrn.pseudo.en.length);
  assert.ok(Lrn.history.es && Lrn.history.en && Lrn.refs.length >= 4);
});

test('cada paso del Ejercicio 6 resalta líneas válidas del pseudocódigo', () => {
  const ctx = ctxFor('ej6', 'es', 'en');
  for (const st of ctx.solution.trace) {
    const lines = Lrn.pseudoLines(st);
    assert.ok(lines.length > 0 && lines.every((i) => i >= 0 && i < Lrn.pseudo.es.length), st.kind);
    assert.ok(Lrn.topics[Lrn.topicFor(st, 'net')], st.kind);
  }
});
