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

test('Revisión F8: la explicación del contador concuerda en número (una precedencia implícita o varias; 1 ficticia)', () => {
  const { info, ctx } = countCtx(AC16, 'es');
  const one = N.dummyCount(info, ctx);
  assert.match(one.explain, /^La red mínima aprovecha la precedencia implícita A → E/);
  const net2 = { dummies: [{ name: 'F1', implied: [['A', 'E']] }, { name: 'F2', implied: [['B', 'F']] }] };
  const two = N.dummyCount({ rules: 4, value: 2, lower: 2, exact: true, net: net2 }, { lang: 'es', succs: { A: ['D'], D: ['E'], B: ['C'], C: ['F'] } });
  assert.match(two.explain, /las precedencias implícitas A → E \(A → D → E\) y B → F \(B → C → F\)/);
  const enTwo = N.dummyCount({ rules: 4, value: 2, lower: 2, exact: true, net: net2 }, { lang: 'en', succs: {} });
  assert.match(enTwo.explain, /the implicit precedences A → E \(A → E\) and B → F/);
  for (const [lang, re] of [['es', /se ahorra 1 ficticia\./], ['en', /saves 1 dummy\./]]) {
    const c = N.dummyCount({ rules: 4, value: 3, lower: 3, exact: true, net: { dummies: [] } }, { lang, succs: {} });
    assert.match(c.explain, re);
  }
});

// ---------- F2b · T016: textos del comparador, del diagnóstico y de «Aprende más» de cada método (AC4, AC6, AC7, AC17, AC19) ----------

const Cmp = require('../js/core/compare.js');
const K = require('../js/core/aoacheck.js');
const KEYS = /\b(cmp|diag|sel|pert|view|count|learn)\.[a-zA-Z]|\{\w+\}|undefined|NaN|null/;
const loadP = (id) => { const ex = E.get(id); return P.parse(ex.rows, ex.mode, { structureOnly: !!ex.structureOnly }).project; };
const cmpOf = (id, methods) => { const p = loadP(id); return Cmp.combine(Cmp.run(p, { methods: methods || Cmp.METHODS }), M.solve(p)); };
const cardOf = (cmp, m) => cmp.cards.find((c) => c.method === m);
const texts = (o) => [o.name, o.kind, o.count, o.unit, ...o.status.map((s) => s.text), ...o.notes.map((s) => s.text), o.links.learn, o.links.step].filter(Boolean);

test('T016: cada tarjeta del comparador de las catorce tablas tiene nombre, tipo, cifras y estado en ES y EN, sin claves sin traducir', () => {
  for (const ex of E.list({ all: true })) {
    const cmp = cmpOf(ex.id);
    for (const lang of ['es', 'en']) {
      assert.ok(N.cmpMin(cmp.min, { lang }), `${ex.id} ${lang}: resumen del mínimo`);
      assert.doesNotMatch(N.cmpMin(cmp.min, { lang }), KEYS, `${ex.id} ${lang}`);
      for (const c of cmp.cards) {
        const o = N.cmpCard(c, cmp.min, { lang });
        assert.ok(o.name && o.kind && o.count && o.unit && o.status.length && o.links.learn, `${ex.id} ${lang} ${c.method}`);
        for (const s of texts(o)) assert.doesNotMatch(s, KEYS, `${ex.id} ${lang} ${c.method}: ${s}`);
        for (const s of [...o.status, ...o.notes]) assert.ok(['ok', 'warn', 'bad', 'mute'].includes(s.tone), `${ex.id} ${c.method}: tono ${s.tone}`);
      }
    }
  }
});

test('T016: caso tipo en español, como en el boceto aprobado (tablero 16)', () => {
  const cmp = cmpOf('tipo');
  const rules = N.cmpCard(cardOf(cmp, 'rules'), cmp.min, { lang: 'es' });
  assert.equal(rules.name, 'Reglas de los conjuntos');
  assert.equal(rules.kind, 'De aula');
  assert.equal(rules.count, '3');
  assert.equal(rules.unit, 'ficticias · 6 sucesos');
  assert.deepEqual(rules.status.map((s) => s.text), ['Correcta', '+1 sobre el mínimo']);
  assert.deepEqual(rules.status.map((s) => s.tone), ['ok', 'warn']);
  assert.ok(rules.notes.some((s) => s.text === 'F3 se puede quitar' && s.tone === 'bad'), JSON.stringify(rules.notes));
  assert.equal(rules.links.learn, 'Aprende más');
  assert.equal(rules.links.step, null, 'el paso a paso es solo del dibujo progresivo');
  const prog = N.cmpCard(cardOf(cmp, 'prog'), cmp.min, { lang: 'es' });
  assert.equal(prog.name, 'Dibujo progresivo');
  assert.deepEqual(prog.status.map((s) => s.text), ['Correcta', 'En el mínimo']);
  assert.equal(prog.links.step, 'Ver paso a paso');
  const sp = N.cmpCard(cardOf(cmp, 'spinrad'), cmp.min, { lang: 'es' });
  assert.ok(sp.notes.some((s) => s.text === 'En su modelo: 5 ficticias y 8 sucesos'), JSON.stringify(sp.notes));
  assert.equal(N.cmpMin(cmp.min, { lang: 'es' }), 'Mínimo: 2 ficticias (exacto)');
  assert.equal(N.cmpCard(cardOf(cmp, 'min'), cmp.min, { lang: 'es' }).name, 'Mínimo exacto');
});

test('T016 · AC4: Sysło en inglés, con el mínimo como intervalo (tablero 17)', () => {
  const cmp = cmpOf('syslo1981');
  assert.equal(cmp.min.exact, false);
  assert.equal(N.cmpMin(cmp.min, { lang: 'en' }), 'Minimum: between 4 and 8 dummies');
  const cgl = N.cmpCard(cardOf(cmp, 'cgl'), cmp.min, { lang: 'en' });
  assert.equal(cgl.name, 'Corneil, Gotlieb & Lee (1973)');
  assert.equal(cgl.kind, 'Historical counterexample');
  assert.equal(cgl.count, '9');
  assert.deepEqual(cgl.status.map((s) => s.text), ['Correct', '+1 over the best found']);
  assert.ok(cgl.notes.some((s) => s.text === 'Structural difference: no single dummy can be removed'), JSON.stringify(cgl.notes));
  // Con el mínimo como intervalo, empatar con V no es «en el mínimo».
  const rules = N.cmpCard(cardOf(cmp, 'rules'), cmp.min, { lang: 'en' });
  assert.deepEqual(rules.status.map((s) => s.text), ['Correct', 'Same as the best found']);
  assert.ok(!texts(rules).some((s) => /at the minimum/i.test(s)));
  assert.equal(N.cmpCard(cardOf(cmp, 'rules'), cmp.min, { lang: 'es' }).status[1].text, 'Igual que la mejor encontrada');
});

test('T016 · AC19: si la mejor red la da un método, el resumen del mínimo lo nombra', () => {
  const min = { value: 8, lower: 4, exact: false, source: 'cgl', net: null };
  assert.equal(N.cmpMin(min, { lang: 'es' }), 'Mínimo: entre 4 y 8 ficticias · la mejor red la da Corneil, Gotlieb y Lee (1973)');
  assert.equal(N.cmpMin(min, { lang: 'en' }), 'Minimum: between 4 and 8 dummies · best network from Corneil, Gotlieb & Lee (1973)');
  assert.equal(N.cmpMin({ value: 1, lower: 1, exact: true, source: 'search' }, { lang: 'es' }), 'Mínimo: 1 ficticia (exacto)');
  assert.equal(N.cmpMin({ value: 0, lower: 0, exact: true, source: 'search' }, { lang: 'en' }), 'Minimum: no dummies (exact)');
});

test('T016: mientras se calcula el mínimo, las tarjetas no comparan y la del mínimo dice que está calculando', () => {
  const p = loadP('tipo');
  const run = Cmp.run(p, { methods: ['prog', 'rules', 'min'] });
  for (const lang of ['es', 'en']) {
    const m = N.cmpCard(cardOf(run, 'min'), null, { lang });
    assert.equal(m.count, '…');
    assert.deepEqual(m.status.map((s) => s.text), [lang === 'es' ? 'calculando…' : 'working it out…']);
    const r = N.cmpCard(cardOf(run, 'rules'), null, { lang });
    assert.deepEqual(r.status.map((s) => s.text), [lang === 'es' ? 'Correcta' : 'Correct']);
    assert.equal(N.cmpMin(null, { lang }), lang === 'es' ? 'Mínimo: calculando…' : 'Minimum: working it out…');
  }
});

test('T016: una tarjeta incorrecta lo dice con su diagnóstico; una aproximada y una de 1 ficticia, también', () => {
  const cmp = cmpOf('tipo');
  const bad = Object.assign({}, cardOf(cmp, 'kim'), { ok: false, removable: [], structural: null,
    problems: [{ code: 'missingPrecedence', ids: ['A', 'C'] }, { code: 'falsePrecedence', ids: ['B', 'D'] }] });
  const es = N.cmpCard(bad, cmp.min, { lang: 'es' });
  assert.deepEqual(es.status.map((s) => [s.text, s.tone]), [['Incorrecta', 'bad']], 'sin distancia al mínimo si es incorrecta');
  assert.ok(es.notes.some((s) => /\bA\b.*\bC\b/.test(s.text)) && es.notes.some((s) => /\bB\b/.test(s.text) && /\bD\b/.test(s.text) && /falsa/.test(s.text)), JSON.stringify(es.notes));
  assert.equal(N.cmpCard(bad, cmp.min, { lang: 'en' }).status[0].text, 'Incorrect');
  const approx = Object.assign({}, cardOf(cmp, 'cgl'), { approx: true });
  assert.ok(N.cmpCard(approx, cmp.min, { lang: 'es' }).notes.some((s) => /aproximad/i.test(s.text)));
  assert.ok(N.cmpCard(approx, cmp.min, { lang: 'en' }).notes.some((s) => /approximat/i.test(s.text)));
  const one = Object.assign({}, cardOf(cmp, 'prog'), { dummies: 1, events: 4 });
  assert.equal(N.cmpCard(one, cmp.min, { lang: 'es' }).unit, 'ficticia · 4 sucesos');
  assert.equal(N.cmpCard(one, cmp.min, { lang: 'en' }).unit, 'dummy · 4 events');
  const two = Object.assign({}, cardOf(cmp, 'rules'), { removable: ['F1', 'F3'] });
  assert.ok(N.cmpCard(two, cmp.min, { lang: 'es' }).notes.some((s) => s.text === 'F1 y F3 se pueden quitar'));
  assert.ok(N.cmpCard(two, cmp.min, { lang: 'en' }).notes.some((s) => s.text === 'F1 and F3 can be removed'));
});

const PROBLEMS = [
  { code: 'unknownAct', ids: ['Z'] }, { code: 'duplicateArc', ids: ['C'] }, { code: 'missingArc', ids: ['D'] },
  { code: 'incompleteArc', ids: ['E'] }, { code: 'incompleteArc', ids: [], events: [4] }, { code: 'parallel', ids: ['G', 'I'] },
  { code: 'looseEvent', ids: [], events: [7] }, { code: 'start', ids: [] }, { code: 'end', ids: [] }, { code: 'cycle', ids: [] },
  { code: 'falsePrecedence', ids: ['B', 'H'] }, { code: 'missingPrecedence', ids: ['A', 'F'] },
  { code: 'unnumbered', ids: [], events: [3, 5] }, { code: 'order', ids: ['J'] }, { code: 'order', ids: [], events: [6, 2] },
  { code: 'unnecessaryDummy', ids: ['F2'], how: 'delete' }, { code: 'unnecessaryDummy', ids: ['F3'], how: 'merge' },
  { code: 'sameNumber', ids: [], events: [3, 3], n: 3 },
];

test('T016 · AC10: el diagnóstico tiene un mensaje para cada código de aoacheck en ES y EN, con lo implicado', () => {
  assert.equal(new Set(PROBLEMS.map((x) => x.code)).size, 15, 'los quince códigos de aoacheck.diagnose');
  for (const lang of ['es', 'en']) {
    const out = N.diagnosis(PROBLEMS, { lang });
    assert.equal(out.length, PROBLEMS.length);
    PROBLEMS.forEach((x, i) => {
      assert.doesNotMatch(out[i], KEYS, `${lang} ${x.code}: ${out[i]}`);
      for (const id of [...x.ids, ...(x.events || []).map(String)]) assert.match(out[i], new RegExp(`\\b${id}\\b`), `${lang} ${x.code}: ${out[i]}`);
    });
    assert.notEqual(out[15], out[16], 'borrar y fundir se explican distinto');
  }
  const es = N.diagnosis(PROBLEMS, { lang: 'es' });
  assert.match(es[11], /falta/i);
  assert.match(es[10], /falsa/i);
  assert.match(es[5], /unicidad/);
  assert.match(N.diagnosis(PROBLEMS, { lang: 'en' })[2], /\bD\b/);
  assert.deepEqual(N.diagnosis([], { lang: 'es' }), []);
});

test('T016: el diagnóstico de redes mutadas del Ejercicio 6 se lee entero en ES y EN', () => {
  const p = loadP('ej6');
  const net = A.build(p);
  const muts = [
    Object.assign({}, net, { dummies: net.dummies.slice(1) }),
    Object.assign({}, net, { arcs: net.arcs.map((a) => (a.act === 'E' ? Object.assign({}, a, { to: a.from }) : a)) }),
    Object.assign({}, net, { arcs: net.arcs.filter((a) => a.act !== 'K') }),
  ];
  for (const g of muts) {
    const d = K.diagnose(g, p);
    assert.ok(!d.ok);
    for (const lang of ['es', 'en']) for (const s of N.diagnosis(d.problems, { lang })) assert.doesNotMatch(s, KEYS, `${lang}: ${s}`);
  }
});

test('T016 · AC6: al seleccionar una ficticia que se puede quitar se explica por qué sobra', () => {
  const p = loadP('tipo');
  const net = A.build(p);
  const base = { lang: 'es', project: p, net, numbered: true };
  const plain = N.selection('F3', base);
  const del = N.selection('F3', Object.assign({}, base, { removable: [{ name: 'F3', how: 'delete' }] }));
  assert.ok(del.text.startsWith(plain.text), 'añade la explicación a la de la F2a');
  assert.match(del.text, /se puede quitar/);
  assert.match(del.text, /mismas precedencias/);
  assert.equal(del.removable, 'delete');
  const merge = N.selection('F3', Object.assign({}, base, { removable: [{ name: 'F3', how: 'merge' }] }));
  assert.match(merge.text, /fundi/);
  assert.equal(plain.removable, null);
  const en = N.selection('F3', Object.assign({}, base, { lang: 'en', removable: [{ name: 'F3', how: 'delete' }] }));
  assert.match(en.text, /can be removed/);
  assert.match(en.text, /same precedences/);
});

test('T016 · AC7: las ficticias de dependencia y de unicidad de los métodos se nombran bien al seleccionarlas', () => {
  for (const id of ['tipo', 'ej7', 'syslo1981']) {
    const p = loadP(id);
    for (const m of Cmp.METHODS.filter((x) => x !== 'min' && x !== 'rules')) {
      const net = A.build(p, { method: m });
      for (const d of net.dummies) {
        for (const lang of ['es', 'en']) {
          const s = N.selection(d.name, { lang, project: p, net, numbered: true });
          assert.doesNotMatch(s.text, KEYS, `${id} ${m} ${lang} ${d.name}: ${s.text}`);
          if (d.rule === 'uniqueness') {
            assert.match(s.text, lang === 'es' ? /unicidad/ : /uniqueness/);
            assert.match(s.text, lang === 'es' ? /ninguna precedencia/ : /no precedence/);
            assert.deepEqual(s.precs, []);
          } else {
            assert.match(s.text, lang === 'es' ? /dependencia/ : /dependency/);
            assert.deepEqual(s.precs, d.represents);
          }
        }
      }
    }
  }
});

test('T016 · AC17: cada método tiene su «Aprende más» con autoría, referencia, garantía y, si la hay, la lectura elegida', () => {
  for (const m of Cmp.METHODS) {
    const t = Lrn.methods[m];
    assert.ok(t, m);
    for (const lang of ['es', 'en']) {
      assert.ok(t.title[lang] && t.guarantee[lang] && t.what[lang].length, `${m} ${lang}`);
      assert.equal(t.what.es.length, t.what.en.length, `${m}: mismo número de párrafos`);
    }
    assert.equal(!!t.reading.es, !!t.reading.en, `${m}: lectura en los dos idiomas o en ninguno`);
    assert.ok(t.refs.length >= 1, `${m}: referencia`);
  }
  const all = (m, lang) => [...Lrn.methods[m].what[lang], Lrn.methods[m].guarantee[lang], Lrn.methods[m].reading[lang] || ''].join(' ');
  // Autoría y referencia.
  for (const [m, who] of [['cs', /Cohen/], ['kim', /Kim/], ['spinrad', /Spinrad/], ['cgl', /Corneil/], ['min', /Krishnamoorthy/]]) {
    assert.ok(Lrn.methods[m].refs.some((r) => who.test(r)), `${m}: referencia`);
  }
  for (const lang of ['es', 'en']) assert.match(all('rules', lang), /José Manuel Galán/);
  // Lecturas elegidas por la herramienta (spec, Behaviour).
  for (const m of ['prog', 'cs', 'kim', 'spinrad', 'cgl']) assert.ok(Lrn.methods[m].reading.es, `${m}: lectura elegida`);
  assert.match(Lrn.methods.prog.reading.es, /formaliza/);
  assert.match(Lrn.methods.kim.reading.es, /cada una/);
  assert.match(Lrn.methods.kim.reading.es, /unicidad/);
  assert.match(Lrn.methods.kim.reading.en, /each/);
  assert.match(Lrn.methods.spinrad.reading.es, /contra/);
  assert.match(all('spinrad', 'es'), /su modelo/);
  assert.match(all('cs', 'es'), /no busca/i);
  assert.match(all('cs', 'es'), /reglas de los conjuntos/);
  assert.match(all('cgl', 'es'), /unicidad/);
});

test('T016 · AC4: «Aprende más» de Corneil, Gotlieb y Lee explica el contraejemplo de Sysło y abre su tabla', () => {
  const t = Lrn.methods.cgl;
  for (const lang of ['es', 'en']) {
    const s = [...t.what[lang], t.guarantee[lang]].join(' ');
    assert.match(s, /Sysło/);
    assert.match(s, /1981/);
    assert.match(s, /\b9\b/);
    assert.match(s, /\b8\b/);
  }
  assert.ok(t.refs.some((r) => /Sysło/.test(r) && /1981/.test(r)));
  assert.equal(t.open, 'syslo1981');
  for (const m of Cmp.METHODS) assert.ok(Lrn.methods[m].open === null || E.get(Lrn.methods[m].open), m);
});

// ---------- F2b · T018: el dibujo progresivo en la página (AC8) ----------

require('../js/core/aoamethods.js');
const progCtx = (id, lang, hide) => {
  const p = loadP(id);
  return { lang, nota: 'en', project: p, net: A.build(p, { method: 'prog' }), unit: '', hide: !!hide };
};
const PROG_KINDS = ['progTable', 'progAct', 'progUnique', 'progEnd'];

test('T018 · AC8: cada paso del dibujo progresivo de las catorce tablas tiene título y texto en ES y EN, también mientras se predice', () => {
  for (const ex of E.list({ all: true })) {
    for (const lang of ['es', 'en']) {
      for (const hide of [false, true]) {
        const ctx = progCtx(ex.id, lang, hide);
        assert.deepEqual([...new Set(ctx.net.trace.map((s) => s.kind))].filter((k) => !PROG_KINDS.includes(k)), []);
        for (const st of ctx.net.trace) {
          const n = N.narrate(st, ctx);
          assert.ok(n.title && n.text, `${ex.id}/${lang}/${st.kind}/${st.act}`);
          for (const s of [n.title, n.text, ...n.lines]) assert.doesNotMatch(s, KEYS, `${ex.id}/${lang}/${st.kind}/${st.act}: ${s}`);
        }
      }
    }
  }
});

test('T018 · AC8: el paso de I en el Ejercicio 6 dice que sale de un suceso nuevo y por qué cada precedente termina allí o lleva ficticia (tablero 20)', () => {
  const ctx = progCtx('ej6', 'es');
  const step = (a) => ctx.net.trace.find((s) => s.kind === 'progAct' && s.act === a);
  const i = N.narrate(step('I'), ctx);
  assert.equal(i.title, 'Actividad I');
  assert.match(i.text, /^I depende de E, F y G/);
  assert.match(i.text, /sale de un suceso nuevo/);
  assert.equal(i.lines.length, 2, 'una línea por grupo de precedentes');
  assert.match(i.lines.find((l) => /^G /.test(l)), /termina directamente/);
  const ef = i.lines.find((l) => /^E y F /.test(l));
  assert.match(ef, /suceso del que sale H/);
  assert.match(ef, /ficticia de dependencia, F3/);
  // E: B tiene otra posterior (F) que no depende de A.
  const e = N.narrate(step('E'), ctx);
  const b = e.lines.find((l) => /^B /.test(l));
  assert.match(b, /\bF\b/);
  assert.match(b, /F1/);
  // Una sola precedente y ninguna.
  assert.match(N.narrate(step('F'), ctx).text, /solo tiene una precedente, B/);
  assert.match(N.narrate(step('A'), ctx).text, /suceso inicial/);
  const en = progCtx('ej6', 'en');
  const ie = N.narrate(en.net.trace.find((s) => s.kind === 'progAct' && s.act === 'I'), en);
  assert.equal(ie.title, 'Activity I');
  assert.match(ie.text, /new event/);
});

test('T018 · AC8: mientras se predice, el paso no dice de qué suceso sale la actividad ni qué ficticias lleva', () => {
  for (const id of ['ej6', 'ej7', 'tipo', 'syslo1981']) {
    for (const lang of ['es', 'en']) {
      const ctx = progCtx(id, lang, true);
      for (const st of ctx.net.trace.filter((s) => s.kind === 'progAct')) {
        const n = N.narrate(st, ctx);
        assert.deepEqual(n.lines, [], `${id} ${st.act}: sin líneas`);
        assert.doesNotMatch(n.text, lang === 'es' ? /inicial|nuevo|ya llegan|directamente|del final de|ficticia de dependencia/ : /start event|new event|already|directly|end of|dependency dummy/, `${id} ${lang} ${st.act}: ${n.text}`);
        for (const d of st.prog.dummies) assert.doesNotMatch(n.text, new RegExp(`\\b${d}\\b`));
      }
    }
  }
});

test('T018: las ficticias de unicidad y el final del dibujo progresivo', () => {
  const e7 = progCtx('ej7', 'es');
  const u = N.narrate(e7.net.trace.find((s) => s.kind === 'progUnique'), e7);
  assert.equal(u.title, 'Ficticias de unicidad');
  for (const x of ['G', 'I', 'F5']) assert.match(u.text, new RegExp(`\\b${x}\\b`), u.text);
  const e6 = progCtx('ej6', 'es');
  assert.match(N.narrate(e6.net.trace.find((s) => s.kind === 'progUnique'), e6).text, /no hacen? falta/);
  const end = N.narrate(e6.net.trace.find((s) => s.kind === 'progEnd'), e6);
  assert.match(end.text, /3 ficticias/);
  assert.match(end.text, /9 sucesos/);
  const t0 = N.narrate(e6.net.trace[0], e6);
  assert.match(t0.text, /A, B, C, D, E, F, G, H, I, J y K/, 'el orden en que se dibujan');
});

test('T021 · AC10: con los sucesos implicados, el diagnóstico nombra los iniciales, los finales y los del ciclo', () => {
  for (const lang of ['es', 'en']) {
    const out = N.diagnosis([{ code: 'start', ids: [], events: ['1', 'a'] }, { code: 'end', ids: [], events: ['9', '12'] },
      { code: 'cycle', ids: [], events: ['4', '5', '6'] }, { code: 'start', ids: [], events: [] }, { code: 'sameNumber', ids: [], events: ['3', '3'], n: 3 }], { lang });
    assert.match(out[0], /\b1\b.*\ba\b/, out[0]);
    assert.match(out[0], /\b2\b/, `${lang}: cuántos`);
    assert.match(out[1], /\b9\b.*\b12\b/, out[1]);
    assert.match(out[2], /\b4\b.*\b5\b.*\b6\b/, out[2]);
    assert.equal(out[3], N.diagnosis([{ code: 'start', ids: [] }], { lang })[0], 'sin sucesos, el texto de siempre');
    assert.match(out[4], /\b2\b.*\b3\b/, out[4]);
    for (const s of out) assert.doesNotMatch(s, KEYS, s);
  }
});

test('T021 · AC11: resultado del reto en ES y EN: errores, correcta en el mínimo, por encima, con ficticias que sobran y sin mínimo', () => {
  const R = require('../js/reto.js');
  const loadEx = (id) => { const ex = E.get(id); return P.parse(ex.rows, ex.mode, { structureOnly: !!ex.structureOnly }).project; };
  const A = require('../js/core/aoa.js');
  const M = require('../js/core/mindummy.js');
  const p = loadEx('ej6');
  const min = M.solve(p);
  let s = R.start(p);
  const net = A.build(p);
  for (const a of net.arcs) for (const side of ['from', 'to']) s = R.apply(s, { type: 'endNumber', act: a.act, side, n: a[side] });
  net.dummies.forEach((d, i) => { s = R.apply(s, { type: 'addDummy' }); for (const side of ['from', 'to']) s = R.apply(s, { type: 'endNumber', i, side, n: d[side] }); });
  const res = (st, m) => { const r = R.check(st, p, m).result; return Object.assign({}, r, { problems: R.shown(r.problems, st.net) }); };
  const ok = res(s, min);
  const es = N.retoResult(ok, { lang: 'es' });
  assert.deepEqual([es.title, es.tone, es.count], ['Red correcta', 'ok', '3 ficticias · en el mínimo (3, exacto)']);
  assert.deepEqual(es.lines.map((l) => l.text), ['Ninguna ficticia sobra.']);
  const en = N.retoResult(ok, { lang: 'en' });
  assert.deepEqual([en.title, en.count], ['Correct network', '3 dummies · at the minimum (3, exact)']);
  assert.equal(N.retoResult(res(s, null), { lang: 'es' }).count, '3 ficticias · mínimo: calculando…');
  assert.equal(N.retoResult(res(s, { value: 3, lower: 2, exact: false }), { lang: 'es' }).count, '3 ficticias · igual que la mejor encontrada (3)');
  // Una ficticia de más: K termina en un suceso nuevo (10) unido al final, que pasa a ser el 11.
  let x = R.apply(s, { type: 'number', id: s.net.events.find((e) => e.n === 9).id, n: 11 });
  x = R.apply(x, { type: 'endNumber', act: 'K', side: 'to', n: 10 });
  x = R.apply(x, { type: 'addDummy' });
  x = R.apply(R.apply(x, { type: 'endNumber', i: 3, side: 'from', n: 10 }), { type: 'endNumber', i: 3, side: 'to', n: 11 });
  const more = N.retoResult(res(x, min), { lang: 'es' });
  assert.equal(more.count, '4 ficticias · +1 sobre el mínimo (3, exacto)');
  assert.ok(more.lines.some((l) => /F4/.test(l.text) && /fundiendo/.test(l.text)), JSON.stringify(more.lines));
  assert.equal(N.retoResult(res(x, { value: 3, lower: 2, exact: false }), { lang: 'en' }).count, '4 dummies · +1 over the best found (3)');
  // Con errores: cuántos (sin contar las ficticias que sobran) y cada uno con sus sucesos.
  const bad = N.retoResult(res(R.apply(R.apply(x, { type: 'endNumber', act: 'D', side: 'to', n: null }), { type: 'removeDummy', i: 0 }), min), { lang: 'es' });
  assert.ok(bad.lines.length >= 2);
  assert.equal(bad.tone, 'bad');
  assert.equal(bad.title, `Hay ${bad.lines.length} cosas que corregir`);
  const one = N.retoResult(res(R.apply(s, { type: 'removeDummy', i: 0 }), min), { lang: 'en' });
  assert.deepEqual([one.title, one.count], ['1 thing to fix', null]);
  // Sin ficticias y correcta.
  assert.equal(N.retoResult({ correct: true, problems: [], dummies: 0, min: { value: 0, lower: 0, exact: true }, extra: 0, removable: [], structural: false }, { lang: 'es' }).count, 'Sin ficticias · en el mínimo (0, exacto)');
});

// ---------- Revisión de cierre de la F2b (ronda 1) ----------

test('revisión F2b, F9: una ficticia de la red mínima que no representa ninguna precedencia se explica sin listas vacías', () => {
  const MD = require('../js/core/mindummy.js');
  const p = P.parse(['A:', 'B:E', 'C:E', 'D:', 'E:'].map((x) => { const [id, l] = x.split(':'); return { id, duration: '1', links: l }; }), 'succ').project;
  const net = MD.solve(p).net;
  const d = net.dummies[0];
  assert.deepEqual([d.rule, d.represents, d.implied], ['min', [], []]);
  for (const lang of ['es', 'en']) {
    const s = N.selection(d.name, { lang, net, project: p, numbered: true });
    assert.doesNotMatch(s.text, / \.|: …|flechas :|arrows :|piden \.|by \./, s.text);
    assert.match(s.text, lang === 'es' ? /No representa ninguna precedencia/ : /represents no precedence/);
  }
});

test('revisión F2b, F10: si las ficticias que sobran no se pueden quitar todas a la vez, el comparador y el reto lo dicen', () => {
  const CM = require('../js/core/compare.js');
  const R = require('../js/reto.js');
  const A = require('../js/core/aoa.js');
  const ex = E.get('kim2008');
  const p = P.parse(ex.rows, ex.mode, { structureOnly: true }).project;
  const card = CM.run(p, { methods: ['cs'] }).cards[0];
  assert.equal(card.together, false);
  assert.equal(N.cmpCard(card, null, { lang: 'es', project: p }).notes[0].text, 'F3, F5, F7 y F13 se pueden quitar, cada una por separado, no todas a la vez');
  assert.equal(N.cmpCard(card, null, { lang: 'en', project: p }).notes[0].text, 'F3, F5, F7 and F13 can be removed, each one on its own, not all of them together');
  const ex6 = E.get('ej6');
  const p6 = P.parse(ex6.rows, ex6.mode).project;
  const cs6 = CM.run(p6, { methods: ['cs'] }).cards[0];
  assert.equal(cs6.together, true, 'Ej. 6: F4 y F6 se pueden quitar las dos');
  assert.equal(N.cmpCard(cs6, null, { lang: 'es', project: p6 }).notes[0].text, 'F4 y F6 se pueden quitar');
  // Reto: la red de las reglas del Ej. 6 con F1 repetida.
  const net = A.build(p6);
  let s = R.start(p6); const id = new Map();
  for (const ev of net.events) { s = R.apply(s, { type: 'addEvent', x: ev.n * 10, y: 5 }); id.set(ev.n, s.net.events[s.net.events.length - 1].id); }
  for (const ev of net.events) s = R.apply(s, { type: 'number', id: id.get(ev.n), n: ev.n });
  for (const a of net.arcs) s = R.apply(s, { type: 'arc', act: a.act, from: id.get(a.from), to: id.get(a.to) });
  for (const d of [...net.dummies, net.dummies[0]]) s = R.apply(s, { type: 'addDummy', from: id.get(d.from), to: id.get(d.to) });
  const MD = require('../js/core/mindummy.js');
  const r = R.check(s, p6, MD.solve(p6)).result;
  assert.deepEqual([r.correct, r.removable.map((x) => x.name), r.together], [true, ['F1', 'F4'], false]);
  const out = N.retoResult(r, { lang: 'es', project: p6 });
  assert.equal(out.lines[out.lines.length - 1].text, 'Cada una sobra por separado, pero no todas a la vez: después de quitar una, comprueba otra vez.');
  assert.ok(N.retoResult(r, { lang: 'en', project: p6 }).lines.some((l) => l.text === 'Each one can be removed on its own, but not all of them together: after removing one, check again.'));
});
