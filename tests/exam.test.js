'use strict';
// core/exam, primera parte (spec f3f-examen-imprimible, AC1, AC8, AC19, AC21, AC22 y AC24; plan §0, §3 y P1; análisis
// H1 y H4; T005): las partes y su orden, la compatibilidad y los avisos, el detective en el encadenado, el proyecto común
// a todas las partes (una semilla que vale para todas a la vez, buscada desde la del modelo), la búsqueda a trozos, los
// modelos y los ejemplos citados. Los documentos (enunciado, solución y rúbrica) son la segunda parte (T007).
// El oráculo de la búsqueda comprueba las mismas condiciones por fuerza bruta: probgen.candidate de cada tipo y, con las
// partes que admiten las series, series.question (con el TCL, lo determinista con las medias; con el enunciado, que se
// pueda escribir).
const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('child_process');
const path = require('path');
const E = require('../js/core/exam.js');
const PG = require('../js/core/probgen.js');
const SR = require('../js/core/series.js');
const G = require('../js/core/generator.js');
const IM = require('../js/i18n-moodle.js');

const ctx = { lang: 'es', nota: 'en', labels: IM.labels('en'), tr: IM.tr('es') };
const ALL = ['stmt', 'roy', 'pert', 'det', 'times', 'floats', 'minDummy', 'succ', 'tcl', 'read', 'disc', 'rep'];
const opts = (o) => Object.assign({ level: 'medium', seed: 1, models: 1 }, o);

// ---------- partes, orden y compatibilidad ----------

test('exam · PARTS en el orden del recorrido; constantes del plan', () => {
  assert.deepEqual(E.PARTS, ALL);
  assert.equal(E.MAX_MODELS, 8);
  assert.equal(E.TRIES_EXAM, 2000);
  assert.equal(E.MODEL_STEP, 7919);
  assert.deepEqual(Object.keys(E.ITEMS).sort(), ['disc', 'floats', 'read', 'rep', 'tcl', 'times']);
  assert.deepEqual(E.ITEMS.times, ['times', 'events']);
  assert.deepEqual(E.ITEMS.floats, ['floats', 'sf', 'critical']);
  assert.ok(E.ITEMS.tcl.includes('route'));
});

test('exam · check ordena las partes, quita las repetidas y rechaza lo que no vale', () => {
  const c = E.check(opts({ parts: ['rep', 'times', 'roy', 'times', 'tcl'] }));
  assert.equal(c.ok, true);
  assert.deepEqual(c.parts, ['roy', 'times', 'tcl', 'rep']);
  assert.deepEqual(E.check(opts({ parts: [] })).errors.map((e) => e.key), ['empty']);
  assert.deepEqual(E.check(opts({ parts: ['times', 'nada'] })).errors.map((e) => e.key), ['part']);
  assert.deepEqual(E.check(opts({ parts: ['times'], models: 9 })).errors.map((e) => e.key), ['models']);
  assert.deepEqual(E.check(opts({ parts: ['times'], models: 0 })).errors.map((e) => e.key), ['models']);
  assert.deepEqual(E.check(opts({ parts: ['times'], level: 'experto' })).errors.map((e) => e.key), ['level']);
  assert.equal(E.check(opts({ parts: ['times'] })).ok, true);
});

test('exam · apartados: los de «Ejercicios» por defecto (sin la otra ruta), se quitan por parte y queda al menos uno', () => {
  const c = E.check(opts({ parts: ['times', 'floats', 'tcl'] }));
  assert.deepEqual(c.items.times, ['times', 'events']);
  assert.deepEqual(c.items.tcl, E.ITEMS.tcl.filter((x) => x !== 'route'));
  const d = E.check(opts({ parts: ['floats', 'tcl'], items: { floats: { off: ['sf'] }, tcl: { on: ['route'] } } }));
  assert.deepEqual(d.items.floats, ['floats', 'critical']);
  assert.ok(d.items.tcl.includes('route'));
  const e = E.check(opts({ parts: ['times'], items: { times: { off: ['times', 'events'] } } }));
  assert.equal(e.ok, false);
  assert.deepEqual(e.errors.map((x) => x.key), ['items']);
  // Las partes sin apartados no tienen entrada.
  assert.equal(E.check(opts({ parts: ['roy'] })).items.roy, undefined);
});

test('exam · detective en el encadenado: la red del otro tipo, aparte con las dos, y solo de red con «Tiempos» u «Holguras» (H1)', () => {
  assert.deepEqual(E.check(opts({ parts: ['roy', 'det'] })).det, { graph: 'aoa', kind: 'all', own: false });
  assert.deepEqual(E.check(opts({ parts: ['pert', 'det'] })).det, { graph: 'aon', kind: 'all', own: false });
  const both = E.check(opts({ parts: ['roy', 'pert', 'det'] }));
  assert.deepEqual(both.det, { graph: 'aon', kind: 'all', own: true });
  assert.deepEqual(both.warnings.map((w) => w.key), ['detOwn']);
  assert.deepEqual(E.check(opts({ parts: ['det'] })).det, { graph: 'aon', kind: 'all', own: false });
  assert.deepEqual(E.check(opts({ parts: ['det'], det: 'aoa' })).det, { graph: 'aoa', kind: 'all', own: false });
  assert.equal(E.check(opts({ parts: ['det', 'times'] })).det.kind, 'net');
  assert.equal(E.check(opts({ parts: ['det', 'floats'] })).det.kind, 'net');
  assert.equal(E.check(opts({ parts: ['det', 'tcl'] })).det.kind, 'all');
  assert.equal(E.check(opts({ parts: ['times'] })).det, null);
});

test('exam · Montecarlo al final: discretas y réplicas después de todo lo demás', () => {
  const c = E.check(opts({ parts: ['disc', 'rep', 'times', 'read', 'tcl', 'roy'] }));
  assert.deepEqual(c.parts, ['roy', 'times', 'tcl', 'read', 'disc', 'rep']);
});

// ---------- el proyecto común ----------

// Etapas de las series que corresponden a las partes (para el oráculo).
const stagesOf = (c) => {
  const st = [];
  for (const p of c.parts) {
    if (p === 'stmt') st.push('stmt');
    if (p === 'times') st.push('early', 'late', ...(c.items.times.includes('events') ? ['evEarly', 'evLate'] : []));
    if (p === 'floats') st.push('floats', 'critPath');
    if (p === 'minDummy' || p === 'succ') st.push(p);
    if (p === 'tcl') st.push('tclMoments', 'tclPath', 'tclProb', ...(c.items.tcl.includes('route') ? ['tclRoute'] : []));
  }
  return st;
};
function valid(o, s) {
  const c = E.check(o);
  if (!G.generate(s, G.LEVELS[o.level]).ok) return false;
  if (c.parts.includes('tcl') && !PG.candidate('tcl', s, o.level, { route: c.items.tcl.includes('route') }).ok) return false;
  for (const k of ['read', 'disc', 'rep']) if (c.parts.includes(k) && !PG.candidate(k, s, o.level).ok) return false;
  const st = stagesOf(c);
  if (st.length) {
    const base = SR.exercise(st, o.level, s);
    if (!base || !SR.question(st, base, ctx, ctx.tr)) return false;
  }
  return true;
}

test('exam · project: la primera semilla desde la del modelo que vale para todas las partes a la vez (oráculo)', () => {
  const combos = [['times', 'floats', 'tcl'], ['tcl', 'read', 'disc', 'rep'], ['stmt', 'times', 'tcl'], ['times', 'floats']];
  for (const level of ['easy', 'medium', 'hard']) {
    for (const parts of combos) {
      for (const seed of [1, 998, 31337]) {
        const o = opts({ level, seed, parts });
        const r = E.project(o, 0, ctx);
        assert.equal(r.ok, true, `${level} ${parts} ${seed}`);
        assert.ok(r.sdUsed >= seed);
        assert.equal(r.tries, r.sdUsed - seed + 1);
        for (let s = seed; s < r.sdUsed; s++) assert.equal(valid(o, s), false, `${level} ${parts} ${seed}: ${s} valía`);
        assert.equal(valid(o, r.sdUsed), true, `${level} ${parts} ${seed}: ${r.sdUsed}`);
      }
    }
  }
});

test('exam · project con la otra ruta y todas las partes: lo mismo, y cada parte sale de la semilla usada', () => {
  const o = opts({ level: 'hard', seed: 4242, parts: ['times', 'floats', 'tcl', 'read', 'disc', 'rep'], items: { tcl: { on: ['route'] } } });
  const r = E.project(o, 0, ctx);
  assert.equal(r.ok, true);
  assert.equal(valid(o, r.sdUsed), true);
  const s = r.sdUsed;
  assert.deepEqual(r.tcl, PG.candidate('tcl', s, 'hard', { route: true }).ex);
  assert.ok(r.tcl.route && r.tcl.route.length);
  assert.deepEqual(r.read, PG.candidate('read', s, 'hard').ex);
  assert.deepEqual(r.disc, PG.candidate('disc', s, 'hard').ex);
  assert.deepEqual(r.rep, PG.candidate('rep', s, 'hard').ex);
  assert.deepEqual(r.base, SR.exercise(stagesOf(E.check(o)), 'hard', s));
});

test('exam · sin partes del TCL ni de Montecarlo, el proyecto es la tabla del generador de la semilla del modelo', () => {
  const r = E.project(opts({ level: 'easy', seed: 17, parts: ['roy', 'pert', 'times'] }), 0, ctx);
  assert.equal(r.sdUsed, 17);
  assert.deepEqual(r.base.rows, G.generate(17, G.LEVELS.easy).rows);
  assert.equal(r.tcl, null);
});

test('exam · el detective con su propio proyecto (las dos redes que construir) usa detective.forSeed desde la semilla siguiente', () => {
  const D = require('../js/core/detective.js');
  const o = opts({ level: 'medium', seed: 50, parts: ['roy', 'pert', 'det', 'times'] });
  const r = E.project(o, 0, ctx);
  assert.equal(r.ok, true);
  const exp = D.forSeed(G.LEVELS.medium, r.sdUsed + 1, { graph: 'aon', kind: 'net', level: 'medium' });
  assert.deepEqual(r.det, { own: true, graph: 'aon', kind: 'net', sd: exp.sd, rows: exp.rows, errors: exp.seeded.errors });
  const same = E.project(opts({ level: 'medium', seed: 50, parts: ['roy', 'det', 'times'] }), 0, ctx);
  assert.equal(same.det.own, false);
  assert.equal(same.det.graph, 'aoa');
  assert.deepEqual(same.det.errors, D.seed(require('../js/core/project.js').parse(same.base.rows, 'pred').project, { graph: 'aoa', kind: 'net', level: 'medium', sd: same.sdUsed }).errors);
});

test('exam · una semilla donde el detective no se puede sembrar no vale: se pasa a la siguiente', () => {
  const D = require('../js/core/detective.js');
  const PRJ = require('../js/core/project.js');
  // En fácil, la PERT de la semilla 5 no admite errores de red (precondición).
  assert.equal(D.seed(PRJ.parse(G.generate(5, G.LEVELS.easy).rows, 'pred').project, { graph: 'aoa', kind: 'net', level: 'easy', sd: 5 }), null);
  const r = E.project(opts({ level: 'easy', seed: 5, parts: ['roy', 'det', 'times'] }), 0, ctx);
  assert.equal(r.ok, true);
  assert.ok(r.sdUsed > 5);
  assert.ok(r.det.errors.length > 0);
});

test('exam · start/step/result a trozos dan lo mismo que project; step respeta su límite de intentos', () => {
  const o = opts({ level: 'easy', seed: 7, parts: ['times', 'tcl', 'read', 'disc'], items: { tcl: { on: ['route'] } } });
  const whole = E.project(o, 0, ctx);
  const job = E.start(o, 0, ctx);
  let steps = 0;
  while (!E.step(job, 1)) steps++;
  assert.ok(steps >= whole.tries - 1);
  assert.deepEqual(E.result(job), whole);
});

test('exam · tope TRIES_EXAM: sin semilla que valga, { ok: false, reason: "tries" }', () => {
  const job = E.start(opts({ level: 'easy', seed: 1, parts: ['times'] }), 0, ctx);
  job.tries = E.TRIES_EXAM; // como si ya hubiera agotado los intentos
  job.valid = () => false;
  while (!E.step(job, 50));
  assert.deepEqual(E.result(job), { ok: false, reason: 'tries' });
});

test('exam · la misma salida en otro proceso (Node), con la misma semilla', () => {
  const o = opts({ level: 'medium', seed: 2026, parts: ['times', 'floats', 'tcl', 'rep'] });
  const here = JSON.stringify(E.project(o, 0, ctx));
  const code = `const E=require(${JSON.stringify(path.join(__dirname, '../js/core/exam.js'))});const IM=require(${JSON.stringify(path.join(__dirname, '../js/i18n-moodle.js'))});`
    + `process.stdout.write(JSON.stringify(E.project(${JSON.stringify(o)},0,{lang:'es',nota:'en',labels:IM.labels('en'),tr:IM.tr('es')})));`;
  assert.equal(execFileSync(process.execPath, ['-e', code]).toString(), here);
});

// ---------- modelos ----------

test('exam · modelSeed: semillas separadas por MODEL_STEP, dentro de 1..SEED_MAX', () => {
  assert.equal(E.modelSeed(1, 0), 1);
  assert.equal(E.modelSeed(1, 1), 1 + 7919);
  assert.equal(E.modelSeed(PG.SEED_MAX, 1), ((PG.SEED_MAX - 1 + 7919) % PG.SEED_MAX) + 1);
  for (let k = 0; k < 8; k++) { const s = E.modelSeed(999999, k); assert.ok(s >= 1 && s <= PG.SEED_MAX); }
});

test('exam · models: cada modelo parte de su semilla, los proyectos son distintos y no dependen de cuántos se piden', () => {
  const o = opts({ level: 'medium', seed: 314, parts: ['times', 'floats', 'tcl'], models: 4 });
  const ms = E.models(o, ctx);
  assert.equal(ms.length, 4);
  ms.forEach((m, k) => { assert.equal(m.letter, 'ABCD'[k]); assert.ok(m.sdUsed >= E.modelSeed(314, k)); });
  assert.equal(new Set(ms.map((m) => JSON.stringify(m.base.rows))).size, 4);
  const three = E.models(Object.assign({}, o, { models: 3 }), ctx);
  assert.deepEqual(three, ms.slice(0, 3));
  assert.deepEqual(ms[0], Object.assign({ letter: 'A' }, E.project(o, 0, ctx)));
});

test('exam · models: si un modelo repite la tabla de uno anterior, sigue buscando', () => {
  // Dos modelos cuya semilla de partida da la misma tabla: el segundo empieza en la semilla usada por el primero.
  const o = opts({ level: 'easy', seed: 10, parts: ['times'], models: 2 });
  const first = E.project(o, 0, ctx);
  const ms = E.models(Object.assign({}, o, { _seeds: [first.sdUsed, first.sdUsed] }), ctx);
  assert.notEqual(JSON.stringify(ms[1].base.rows), JSON.stringify(ms[0].base.rows));
  assert.ok(ms[1].sdUsed > first.sdUsed);
});

// ---------- ejemplos citados (H4) ----------

test('exam · EXAMPLES y las partes que permite cada uno, según sus datos', () => {
  assert.deepEqual(E.EXAMPLES, ['ej1', 'ej2', 'ej3', 'ej4', 'ej6', 'ej7', 'kl', 'hl', 'kd']);
  for (const id of ['ej1', 'ej2', 'ej3']) assert.deepEqual(E.partsOf(id), ['stmt', 'roy', 'pert', 'det', 'minDummy', 'succ']);
  for (const id of ['ej4', 'ej6', 'ej7']) assert.deepEqual(E.partsOf(id), ['stmt', 'roy', 'pert', 'det', 'times', 'floats', 'minDummy', 'succ']);
  for (const id of ['kl', 'hl']) assert.deepEqual(E.partsOf(id), ['roy', 'pert', 'det', 'times', 'floats', 'minDummy', 'succ', 'tcl', 'rep']);
  assert.deepEqual(E.partsOf('kd'), ['roy', 'pert', 'disc']);
  assert.equal(E.partsOf('nada'), null);
});

test('exam · check con un ejemplo: rechaza las partes que no permite, la otra ruta y más de un modelo con ejemplo en B…', () => {
  assert.equal(E.check(opts({ example: 'ej4', parts: ['stmt', 'times', 'floats'] })).ok, true);
  const bad = E.check(opts({ example: 'ej1', parts: ['roy', 'times'] }));
  assert.deepEqual(bad.errors, [{ key: 'exampleParts', params: { parts: ['times'] } }]);
  assert.deepEqual(E.check(opts({ example: 'kl', parts: ['tcl'], items: { tcl: { on: ['route'] } } })).errors.map((e) => e.key), ['exampleRoute']);
  assert.deepEqual(E.check(opts({ example: 'zz', parts: ['roy'] })).errors.map((e) => e.key), ['example']);
  // Con ejemplo, el detective con calc solo si el ejemplo tiene duraciones; ej1 (solo estructura) lo fuerza a red.
  assert.equal(E.check(opts({ example: 'ej1', parts: ['det'] })).det.kind, 'net');
});

test('exam · project con un ejemplo: el modelo A es el ejemplo (sin semilla); B, C… son tablas generadas', () => {
  const kl = E.project(opts({ example: 'kl', parts: ['times', 'tcl'] }), 0, ctx);
  assert.equal(kl.ok, true);
  assert.equal(kl.sdUsed, null);
  assert.equal(kl.example, 'kl');
  assert.deepEqual(kl.tcl, PG.fromExample('kl'));
  assert.deepEqual(kl.base, SR.fromTcl(PG.fromExample('kl')));
  const ej4 = E.project(opts({ example: 'ej4', parts: ['stmt', 'times'] }), 0, ctx);
  const X = require('../js/core/examples.js').get('ej4');
  assert.deepEqual(ej4.base, SR.fromRows(X.rows, X.mode));
  const kd = E.project(opts({ example: 'kd', parts: ['disc'] }), 0, ctx);
  assert.deepEqual(kd.disc, PG.fromExample('kd'));
  const ms = E.models(opts({ example: 'ej4', parts: ['times'], models: 2, seed: 5 }), ctx);
  assert.equal(ms[0].example, 'ej4');
  assert.equal(ms[1].example, null);
  assert.ok(ms[1].sdUsed >= E.modelSeed(5, 1));
});

test('exam · ejemplo con detective: sobre la red del ejemplo, o con su propio proyecto si se construyen las dos redes', () => {
  const D = require('../js/core/detective.js');
  const PRJ = require('../js/core/project.js');
  const X = require('../js/core/examples.js').get('ej4');
  const r = E.project(opts({ example: 'ej4', seed: 3, parts: ['roy', 'det'] }), 0, ctx);
  assert.equal(r.ok, true);
  const exp = D.seed(PRJ.parse(SR.fromRows(X.rows, X.mode).rows, 'pred').project, { graph: 'aoa', kind: 'all', level: 'medium', sd: 3 });
  assert.deepEqual(r.det, { own: false, graph: 'aoa', kind: 'all', sd: 3, errors: exp.errors });
  const own = E.project(opts({ example: 'ej1', seed: 3, parts: ['roy', 'pert', 'det'] }), 0, ctx);
  const f = D.forSeed(G.LEVELS.medium, 3, { graph: 'aon', kind: 'net', level: 'medium' });
  assert.deepEqual(own.det, { own: true, graph: 'aon', kind: 'net', sd: f.sd, rows: f.rows, errors: f.seeded.errors });
});

test('F3f T015 · partsOf y check no necesitan core/examples (en examen.html llega con su familia, después de elegir el ejemplo): STRUCT_ONLY lo dice y coincide con los ejemplos', () => {
  const X = require('../js/core/examples.js');
  assert.deepEqual(E.STRUCT_ONLY, E.EXAMPLES.filter((id) => id.startsWith('ej') && X.get(id).structureOnly));
  // Sin examples a mano: core/exam en un contexto propio, con PNL sin examples.
  const vm = require('node:vm');
  const fs = require('node:fs');
  const path = require('node:path');
  const ctx = { PNL: {} };
  ctx.globalThis = ctx;
  for (const f of ['topo', 'project', 'cpm', 'aoa', 'mindummy', 'rng', 'generator', 'grade', 'moodle', 'series', 'exam']) vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'js', 'core', `${f}.js`), 'utf8'), ctx);
  const EX = ctx.PNL.exam;
  assert.equal(ctx.PNL.examples, undefined);
  // (los arreglos del otro contexto se copian: deepEqual estricto mira el prototipo)
  for (const id of E.EXAMPLES) assert.deepEqual([...EX.partsOf(id)], E.partsOf(id), id);
  assert.equal(EX.check({ parts: ['times', 'floats'], level: 'medium', seed: 1, models: 1, example: 'ej1' }).ok, false);
  assert.equal(EX.check({ parts: ['roy', 'pert'], level: 'medium', seed: 1, models: 1, example: 'ej1' }).ok, true);
});

// ---------- revisión de nivel 2 de la F3f (T019): N-F1 y N-F10 ----------

const D = require('../js/core/detective.js');
const X = require('../js/core/examples.js');
const PR = require('../js/core/project.js');
/** La red de un ejemplo citado, como la arma core/exam para el modelo A. */
function exampleProject(id) {
  let base;
  if (id === 'kl' || id === 'hl') base = SR.fromTcl(PG.fromExample(id));
  else if (id === 'kd') base = SR.fromRows(PG.fromExample('kd').rows.map((r) => ({ id: r.id, name: '', duration: String(r.x[0]), links: r.preds.join(', ') })), 'pred');
  else { const e = X.get(id); base = SR.fromRows(e.structureOnly ? e.rows.map((r) => Object.assign({}, r, { duration: '1' })) : e.rows, e.mode); }
  return PR.parse(base.rows, 'pred').project;
}

test('exam · N-F1: detOwnEx dice qué ejemplos no admiten los errores del detective en su red (con detective.seed, sea cual sea la semilla)', () => {
  let some = 0;
  // Los ejemplos que permiten el detective, con los tipos de error que pueden tocarles (sin duraciones, solo de red).
  for (const id of E.EXAMPLES.filter((x) => E.partsOf(x).includes('det'))) {
    const project = exampleProject(id);
    for (const graph of ['aon', 'aoa']) for (const kind of E.STRUCT_ONLY.includes(id) ? ['net'] : ['net', 'all']) for (const level of E.LEVELS) {
      const ok = [1, 2, 3, 2026].map((sd) => !!D.seed(project, { graph, kind, level, sd }));
      assert.ok(ok.every((x) => x === ok[0]), `${id} ${graph} ${kind} ${level}: depende de la semilla`);
      assert.equal(E.detOwnEx(id, graph, kind, level), !ok[0], `${id} ${graph} ${kind} ${level}`);
      if (!ok[0]) some++;
    }
  }
  assert.ok(some > 0);
});

test('exam · N-F1: Klastorin con el detective sobre la PERT y Tiempos (media y difícil): proyecto aparte para el detective y aviso; en fácil, sobre el ejemplo', () => {
  for (const [level, extra, det] of [['medium', [], 'aoa'], ['hard', ['roy'], 'aon'], ['medium', ['roy'], 'aoa']]) {
    const o = opts({ level, seed: 7, parts: ['det', 'times', ...extra], example: 'kl', det });
    const c = E.check(o);
    assert.equal(c.ok, true);
    assert.equal(c.det.own, true, `${level} ${extra}`);
    assert.ok(c.warnings.some((w) => w.key === 'detOwnEx'), `${level} ${extra}: aviso`);
    const m = E.project(o, 0, ctx);
    assert.equal(m.ok, true, `${level} ${extra}: sale el examen`);
    assert.equal(m.example, 'kl');
    assert.equal(m.det.own, true);
    assert.ok(Array.isArray(m.det.rows) && m.det.rows.length > 0);
  }
  const easy = E.check(opts({ level: 'easy', seed: 7, parts: ['det', 'times'], example: 'kl', det: 'aoa' }));
  assert.equal(easy.det.own, false);
  assert.ok(!easy.warnings.length);
  assert.equal(E.project(opts({ level: 'easy', seed: 7, parts: ['det', 'times'], example: 'kl', det: 'aoa' }), 0, ctx).det.own, false);
});

test('exam · N-F10: el tope son exactamente TRIES_EXAM semillas (la 2000.ª se prueba; la siguiente, no)', () => {
  const o = opts({ level: 'easy', seed: 50, parts: ['times', 'floats'] });
  const real = E.project(o, 0, ctx);
  for (const [extra, want] of [[E.TRIES_EXAM - 1, true], [E.TRIES_EXAM, false]]) {
    const job = E.start(o, 0, ctx);
    const target = job.seed + extra;
    job.valid = (s) => (s === target ? { base: real.base, tcl: null, read: null, disc: null, rep: null, det: null } : null);
    while (!E.step(job, 50));
    const r = E.result(job);
    assert.equal(r.ok, want, `objetivo a ${extra} semillas`);
    if (want) { assert.equal(r.tries, E.TRIES_EXAM); assert.equal(r.sdUsed, target); } else assert.equal(r.reason, 'tries');
  }
});
