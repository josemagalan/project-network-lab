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
  for (const ex of E.list().filter((e) => !e.structureOnly)) {
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

// ---------- Red PERT (F2a, T016): narración y «Aprende más» de cada paso de la traza PERT ----------
const A = require('../js/core/aoa.js');

const pertCtx = (id, lang, nota) => {
  const ex = E.get(id);
  const project = P.parse(ex.rows, ex.mode, { structureOnly: !!ex.structureOnly }).project;
  const solution = ex.structureOnly ? null : C.solve(project);
  const net = A.build(project, { solution });
  return { lang, nota, project, solution, net, unit: ex.unit[lang] };
};

test('AC5: cada paso PERT de los siete ejercicios tiene título y texto en ES y EN, sin claves sin traducir', () => {
  for (const ex of E.list({ all: true })) {
    for (const lang of ['es', 'en']) {
      for (const nota of ['en', 'es']) {
        const ctx = pertCtx(ex.id, lang, nota);
        for (const st of ctx.net.trace) {
          for (const hide of [false, true]) {
            const n = N.narrate(st, Object.assign({}, ctx, { hide }));
            assert.ok(n.title && n.text, `${ex.id}/${lang}/${st.kind}/${hide}`);
            for (const s of [n.title, n.text, ...n.lines]) assert.doesNotMatch(s, /\b(narr|steps|pertNarr|pertSteps|floatNarr|formula|pert)\.|\{\w+\}|undefined|NaN/, `${ex.id}/${lang}: ${s}`);
          }
        }
      }
    }
  }
});

test('AC5: el paso de cada regla nombra las actividades que la cumplen y las ficticias que crea, o dice que no se aplica', () => {
  const ctx = pertCtx('ej6', 'es', 'en');
  const by = (k) => N.narrate(ctx.net.trace.find((s) => s.kind === k), ctx);
  const cont = by('ruleContained');
  assert.equal(cont.title, 'Regla de los conjuntos contenidos');
  for (const x of ['A', 'B', 'C', 'E', 'F', 'G', 'F1', 'F2', 'F3']) assert.match(cont.text, new RegExp(`\\b${x}\\b`), cont.text);
  assert.match(by('ruleEqual').text, /no se aplica/);
  assert.match(by('ruleShared').text, /no se aplica/);
  const en = pertCtx('ej6', 'en', 'en');
  assert.match(N.narrate(en.net.trace.find((s) => s.kind === 'ruleEqual'), en).text, /does not apply/);
  // Ejercicio 7: la ficticia de identidad la lleva I (paralela a G).
  const e7 = pertCtx('ej7', 'es', 'en');
  const eq = N.narrate(e7.net.trace.find((s) => s.kind === 'ruleEqual'), e7);
  assert.match(eq.text, /\bG\b/);
  assert.match(eq.text, /\bI\b/);
  assert.doesNotMatch(eq.text, /no se aplica/);
});

test('AC5: tiempos de los sucesos del Ejercicio 6 con su fórmula, en las dos notaciones', () => {
  const ctx = pertCtx('ej6', 'es', 'en');
  const ev = (k, n) => ctx.net.trace.find((s) => s.kind === k && s.event === n);
  const f3 = N.narrate(ev('eventForward', 3), ctx);
  assert.equal(f3.title, 'Tiempos tempranos · suceso 3');
  assert.match(f3.text, /F1/);
  assert.deepEqual(f3.lines, ['TE(3) = máx { TE(1) + d(A), TE(2) + d(F1) } = máx { 2, 3 } = 3']);
  assert.deepEqual(N.narrate(ev('eventForward', 2), ctx).lines, ['TE(2) = TE(1) + d(B) = 3']);
  assert.deepEqual(N.narrate(ev('eventForward', 1), ctx).lines, ['TE(1) = 0']);
  assert.deepEqual(N.narrate(ev('eventBackward', 5), ctx).lines, ['TL(5) = mín { TL(8) − d(H), TL(6) − d(F3) } = mín { 11, 7 } = 7']);
  assert.deepEqual(N.narrate(ev('eventBackward', 9), ctx).lines, ['TL(9) = TE(9) = 13']);
  assert.match(N.narrate(ev('eventForward', 9), ctx).text, /13 días/);
  const es = pertCtx('ej6', 'es', 'es');
  assert.deepEqual(N.narrate(es.net.trace.find((s) => s.kind === 'eventForward' && s.event === 3), es).lines, ['tᵢ(3) = máx { tᵢ(1) + d(A), tᵢ(2) + d(F1) } = máx { 2, 3 } = 3']);
  const en = pertCtx('ej6', 'en', 'en');
  assert.equal(N.narrate(en.net.trace.find((s) => s.kind === 'eventBackward' && s.event === 4), en).title, 'Late times · event 4');
});

test('AC5: un ejemplo sin duraciones termina en la numeración y lo dice', () => {
  for (const lang of ['es', 'en']) {
    const ctx = pertCtx('ej1', lang, 'en');
    const last = ctx.net.trace[ctx.net.trace.length - 1];
    assert.equal(last.kind, 'number');
    assert.match(N.narrate(last, ctx).text, lang === 'es' ? /sin duraciones|no tiene duraciones/ : /no durations/);
  }
});

test('AC8: mientras se predice una regla, la narración no nombra actividades ni ficticias ni dice si se aplica', () => {
  for (const id of ['ej6', 'ej7']) {
    for (const lang of ['es', 'en']) {
      const ctx = pertCtx(id, lang, 'en');
      for (const st of ctx.net.trace.filter((s) => s.rule)) {
        const hidden = N.narrate(st, Object.assign({}, ctx, { hide: true }));
        assert.equal(hidden.title, N.narrate(st, ctx).title, 'el título no cambia');
        for (const x of [...st.rule.acts, ...st.rule.dummies]) assert.doesNotMatch(hidden.text, new RegExp(`\\b${x}\\b`), `${id} ${lang} ${st.kind}: ${hidden.text}`);
        assert.doesNotMatch(hidden.text, /no se aplica|does not apply|\d/, `${id} ${lang} ${st.kind}: ${hidden.text}`);
      }
    }
  }
});

test('mientras se predice un suceso, la narración no dice qué arco manda ni el valor', () => {
  for (const lang of ['es', 'en']) {
    const ctx = pertCtx('ej6', lang, 'en');
    for (const st of ctx.net.trace.filter((s) => (s.kind === 'eventForward' || s.kind === 'eventBackward') && s.formula.terms.length > 1)) {
      const hidden = N.narrate(st, Object.assign({}, ctx, { hide: true }));
      const tail = hidden.text.slice(hidden.text.lastIndexOf('.', hidden.text.length - 2) + 1);
      for (const c of st.formula.chosen) assert.ok(!tail.includes(c), `${lang} ${st.kind} ${st.event}: ${hidden.text}`);
      // El número del suceso puede coincidir con su tiempo: se quita antes de buscar el valor.
      assert.ok(!` ${hidden.text.replace(/\b(suceso|event) \d+/g, '')} `.includes(` ${N.fmt(lang, st.reveals[0].value)} `), hidden.text);
    }
  }
});

test('«Aprende más» de la red PERT: cada paso tiene tema y líneas válidas de su pseudocódigo, en ES y EN', () => {
  assert.equal(Lrn.pseudoPert.es.length, Lrn.pseudoPert.en.length);
  for (const id of ['ej6', 'ej7', 'ej1']) {
    const ctx = pertCtx(id, 'es', 'en');
    for (const st of ctx.net.trace) {
      const topic = Lrn.topicFor(st, 'net', 'aoa');
      assert.ok(Lrn.topics[topic], `${id} ${st.kind} → ${topic}`);
      assert.equal(Lrn.topics[topic].es.length, Lrn.topics[topic].en.length, topic);
      const lines = Lrn.pseudoLines(st, 'aoa');
      assert.ok(lines.length > 0 && lines.every((i) => i >= 0 && i < Lrn.pseudoPert.es.length), `${id} ${st.kind}`);
    }
  }
  // La holgura libre de I en el Ejercicio 7 (spec, Behaviour) y la complejidad del mínimo.
  assert.match(Lrn.topics.pertFloats.es.join(' '), /Ejercicio 7/);
  assert.ok(Lrn.refs.some((r) => /Krishnamoorthy/.test(r)));
  // La fase 1 no cambia: sin graph, los temas y líneas de ROY.
  assert.equal(Lrn.topicFor({ kind: 'critical' }, 'net'), 'critical');
  assert.deepEqual(Lrn.pseudoLines({ kind: 'critical' }), [11]);
});

test('«Aprende más» de cada regla: esquema de ejemplo de los apuntes del autor, con su tabla y descripción en ES y EN', () => {
  const want = { ruleEqual: 1, ruleContained: 1, ruleShared: 2 };
  for (const [k, nd] of Object.entries(want)) {
    const sc = Lrn.schemes[k];
    assert.ok(sc, k);
    for (const lang of ['es', 'en']) assert.ok(require('../js/i18n.js').dict[lang].learn.schemeAlt[k], `${lang}: descripción del esquema ${k}`);
    assert.equal(sc.dummies.length, nd, `${k}: ficticias del esquema`);
    const ev = (x) => Array.isArray(x) || Object.prototype.hasOwnProperty.call(sc.events, x);
    for (const [, a, b] of [...sc.arcs, ...sc.dummies]) assert.ok(ev(a) && ev(b), `${k}: arco con un suceso que no existe`);
    assert.equal(sc.table.act.length, sc.table.post.length, k);
  }
  assert.equal(Lrn.schemes.ruleEqual.table.pre.length, 2);
  // Autoría de las reglas (el autor, 2026-11-08): las enunció José Manuel Galán.
  for (const lang of ['es', 'en']) {
    assert.match(Lrn.topics.succTable[lang].join(' '), /José Manuel Galán/);
    assert.match(Lrn.schemeCredit[lang], /José Manuel Galán/);
  }
});

// ---------- F2a · AC6 y AC7: selección compartida ----------

test('AC6: una ficticia seleccionada se nombra con su regla y dice qué precedencias de ROY representa', () => {
  const es = N.selection('F3', Object.assign(pertCtx('ej6', 'es', 'en'), { numbered: true }));
  assert.equal(es.title, 'F3');
  assert.match(es.text, /Conjuntos contenidos/);
  for (const x of ['E', 'F', 'G']) assert.match(es.text, new RegExp(`\\b${x}\\b`), es.text);
  assert.match(es.text, /E → I y F → I/);
  assert.deepEqual(es.precs, [['E', 'I'], ['F', 'I']]);
  assert.equal(es.learn, 'ruleContained');
  const one = N.selection('F1', Object.assign(pertCtx('ej6', 'en', 'en'), { numbered: true }));
  assert.match(one.text, /Contained sets/);
  assert.match(one.text, /\bB → E\b/);
  assert.match(one.text, /the arrow B → E/, 'en singular con una sola precedencia');
  assert.deepEqual(one.precs, [['B', 'E']]);
});

test('AC6: la ficticia de identidad no representa ninguna precedencia y lo dice', () => {
  for (const lang of ['es', 'en']) {
    const s = N.selection('F1', Object.assign(pertCtx('ej7', lang, 'en'), { numbered: true }));
    assert.match(s.text, lang === 'es' ? /identidad/ : /identity/);
    assert.match(s.text, /\bG\b/);
    assert.match(s.text, /\bI\b/);
    assert.match(s.text, lang === 'es' ? /ninguna precedencia/ : /no precedence/);
    assert.deepEqual(s.precs, []);
    assert.equal(s.learn, 'ruleEqual');
  }
});

test('AC7: una actividad seleccionada dice su flecha en PERT (con sucesos si ya están numerados) y su nodo en ROY', () => {
  const ctx = pertCtx('ej6', 'es', 'en');
  const arc = ctx.net.arcs.find((a) => a.act === 'E');
  const s = N.selection('E', Object.assign({}, ctx, { numbered: true }));
  assert.equal(s.title, 'E');
  assert.match(s.text, new RegExp(`suceso ${arc.from} al ${arc.to}\\b`), s.text);
  assert.deepEqual(s.precs, []);
  assert.equal(s.learn, null);
  const before = N.selection('E', Object.assign({}, ctx, { numbered: false }));
  assert.doesNotMatch(before.text, /\d/, 'sin numerar no hay números de suceso');
  assert.match(N.selection('E', Object.assign(pertCtx('ej6', 'en', 'en'), { numbered: true })).text, /AON/);
  assert.equal(N.selection('Z', ctx), null);
  assert.equal(N.selection(null, ctx), null);
});

test('AC6–AC7: el texto de cualquier selección de los siete ejercicios está traducido en ES y EN', () => {
  for (const ex of E.list({ all: true })) {
    for (const lang of ['es', 'en']) {
      const ctx = pertCtx(ex.id, lang, 'en');
      for (const x of [...ctx.net.arcs.map((a) => a.act), ...ctx.net.dummies.map((d) => d.name)]) {
        for (const numbered of [false, true]) {
          const s = N.selection(x, Object.assign({}, ctx, { numbered }));
          assert.ok(s && s.text, `${ex.id} ${lang} ${x}`);
          assert.doesNotMatch(s.text, /\b(sel|view|pert)\.|\{\w+\}|undefined|NaN/, `${ex.id} ${lang} ${x}: ${s.text}`);
        }
      }
    }
  }
});

// ---------- T021: contador de ficticias y red mínima (AC9 y AC16) ----------

const M = require('../js/core/mindummy.js');
const countCtx = (succ, lang) => {
  const ids = Object.keys(succ).sort();
  const p = P.parse(ids.map((id) => ({ id, duration: '1', links: succ[id].join(', ') })), 'succ').project;
  const rules = A.build(p).dummies.length;
  const r = M.solve(p);
  return { info: Object.assign({ rules }, r), ctx: { lang, succs: A._reduce(p).direct } };
};
const AC16 = { A: ['C', 'D', 'E'], B: ['C', 'E'], C: [], D: ['E'], E: [] };

test('AC16: el contador dice «reglas 3 · mínimo 2», que es exacto y que la mínima aprovecha A → E (A → D → E)', () => {
  const { info, ctx } = countCtx(AC16, 'es');
  const c = N.dummyCount(info, ctx);
  assert.deepEqual([c.rules, c.min], ['3', '2']);
  assert.equal(c.extra, 1);
  assert.match(c.note, /Exacto: no hay ninguna red con 1 ficticia\./);
  assert.match(c.title, /1 ficticia de más/);
  assert.match(c.text, /mismas precedencias/);
  assert.equal(c.show, 'Ver la red mínima');
  assert.equal(c.netTitle, 'Red mínima');
  assert.match(c.explain, /A → E \(A → D → E\)/, c.explain);
  assert.match(c.explain, /F1 y F2/, c.explain);
  assert.deepEqual(c.emph, ['F1', 'F2']);
  const en = N.dummyCount(info, Object.assign({}, ctx, { lang: 'en' }));
  assert.match(en.note, /Exact: no network has 1 dummy\./);
  assert.match(en.title, /1 dummy too many/);
  assert.match(en.explain, /A → E \(A → D → E\)/);
  assert.equal(en.show, 'Show the minimum network');
});

test('AC9: con las reglas ya en el mínimo no hay tarjeta; sin ficticias lo dice', () => {
  const ej6 = pertCtx('ej6', 'es', 'en').net;
  const c = N.dummyCount({ rules: 3, value: 3, lower: 3, exact: true, net: ej6 }, { lang: 'es', succs: {} });
  assert.deepEqual([c.rules, c.min, c.extra], ['3', '3', 0]);
  assert.match(c.note, /ya dan el mínimo/);
  assert.equal(c.title, null);
  const none = N.dummyCount({ rules: 0, value: 0, lower: 0, exact: true, net: { dummies: [] } }, { lang: 'en', succs: {} });
  assert.match(none.note, /needs no dummies/);
});

test('AC9: con el presupuesto agotado, «entre L y V» y la mejor red encontrada', () => {
  for (const lang of ['es', 'en']) {
    const net = { dummies: [{ name: 'F1', implied: [] }] };
    const c = N.dummyCount({ rules: 10, value: 7, lower: 6, exact: false, net }, { lang, succs: {} });
    assert.equal(c.min, lang === 'es' ? 'entre 6 y 7' : 'between 6 and 7');
    assert.match(c.note, lang === 'es' ? /presupuesto fijo/ : /fixed work budget/);
    assert.match(c.title, lang === 'es' ? /3 ficticias menos/ : /3 fewer dummies/);
    assert.equal(c.show, lang === 'es' ? 'Ver la mejor red encontrada' : 'Show the best network found');
    assert.match(c.explain, lang === 'es' ? /otra manera/ : /differently/);
    assert.deepEqual(c.emph, []);
    // Agotado y sin mejora: intervalo, pero sin tarjeta.
    const same = N.dummyCount({ rules: 5, value: 5, lower: 3, exact: false, net }, { lang, succs: {} });
    assert.equal(same.min, lang === 'es' ? 'entre 3 y 5' : 'between 3 and 5');
    assert.equal(same.title, null);
  }
});

test('AC9: mientras se calcula o se predicen las reglas, el contador no da números', () => {
  for (const lang of ['es', 'en']) {
    const hidden = N.dummyCount(null, { lang, succs: {}, hidden: true });
    assert.deepEqual([hidden.rules, hidden.min, hidden.title], ['?', '?', null]);
    assert.match(hidden.note, lang === 'es' ? /al colocar la red/ : /once the network is placed/);
    const pending = N.dummyCount({ rules: 3 }, { lang, succs: {} });
    assert.equal(pending.rules, '3');
    assert.equal(pending.min, lang === 'es' ? 'calculando…' : 'working it out…');
  }
});

test('AC9: el texto del contador está completo en ES y EN para 200 tablas al azar', () => {
  let r = 5;
  const rand = () => { r = (Math.imul(r, 1664525) + 1013904223) >>> 0; return r / 4294967296; };
  let extra = 0;
  for (let i = 0; i < 200; i++) {
    const n = 3 + Math.floor(rand() * 5);
    const ids = Array.from({ length: n }, (_, j) => String.fromCharCode(65 + j));
    const succ = Object.fromEntries(ids.map((a, j) => [a, ids.slice(j + 1).filter(() => rand() < 0.45)]));
    for (const lang of ['es', 'en']) {
      const { info, ctx } = countCtx(succ, lang);
      const c = N.dummyCount(info, ctx);
      if (c.extra) extra++;
      for (const s of [c.label, c.rules, c.min, c.note, c.title, c.text, c.explain].filter(Boolean)) {
        assert.doesNotMatch(s, /\b(count|view|pert)\.|\{\w+\}|undefined|NaN/, `${JSON.stringify(succ)} ${lang}: ${s}`);
      }
    }
  }
  assert.ok(extra > 0, 'la muestra incluye tablas en las que las reglas quedan por encima del mínimo');
});

test('«Aprende más» tiene un tema propio para el contador, en ES y EN', () => {
  for (const lang of ['es', 'en']) {
    const ps = Lrn.topics.minDummies[lang];
    assert.equal(ps.length, Lrn.topics.minDummies.es.length);
    assert.match(ps.join(' '), /NP/);
    assert.match(ps.join(' '), /Krishnamoorthy/);
  }
});
