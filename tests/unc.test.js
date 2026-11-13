'use strict';
// unc (F4a, T009): la parte sin DOM de la pestaña «Duraciones inciertas» (M5): proyecto, comprobación de la tabla
// propia, medias y varianzas, camino crítico de las medias, notación y pegado.
const test = require('node:test');
const assert = require('node:assert/strict');
const U = require('../js/unc.js');
const URL = require('../js/core/urlstate.js');

const base = () => URL.decode('#v=unc').state;
const own = (rows, mode) => Object.assign(base(), { ue: 'own', ut: { mode: mode || 'pred', rows } });
const row = (id, a, m, b, links, name) => ({ id, name: name || '', a: String(a), m: String(m), b: String(b), links: links || '' });
const near = (x, y, msg) => assert.ok(Math.abs(x - y) < 0.005, `${msg}: ${x} ≠ ${y}`);

test('notación: a, m, b con μ en inglés; tₒ, tₘ, tₚ con tₑ en la española (clarify)', () => {
  assert.deepEqual(U.labels('en'), { a: 'a', m: 'm', b: 'b', mean: 'μ', var: 'σ²' });
  assert.deepEqual(U.labels('es'), { a: 'tₒ', m: 'tₘ', b: 'tₚ', mean: 'tₑ', var: 'σ²' });
});

test('Klastorin: medias y varianzas de examen y camino crítico de las medias A–C–E–F', () => {
  const m = U.model(base(), 'es');
  assert.equal(m.src.kind, 'example');
  const means = [6.67, 7.33, 7.83, 14.33, 5, 4.33]; const vars = [4, 1.78, 3.36, 1, 0.44, 0.44];
  m.acts.forEach((a, i) => { near(a.mean, means[i], `media ${a.id}`); near(a.var, vars[i], `varianza ${a.id}`); });
  assert.deepEqual(m.exam.path, ['A', 'C', 'E', 'F']);
  near(m.exam.mu, 23.83, 'μ del camino');
  near(m.exam.var, 8.25, 'σ² del camino');
  assert.equal(m.sel, 'A');
  // La red con las medias: el camino crítico de CPM coincide con el de core/tcl.
  const crit = m.project.activities.map((a) => a.id).filter((id) => m.solution.floats[id].TF === 0);
  assert.deepEqual(crit, ['A', 'C', 'E', 'F']);
  // Cada actividad lleva sus cuatro juegos de momentos; la beta-PERT clava la media de examen.
  for (const a of m.acts) { near(a.stats.pert.mean, a.stats.exam.mean, `PERT ${a.id}`); assert.ok(a.stats.classic && a.stats.tri); }
});

test('Hillier: camino crítico de las medias con μ = 44 y σ² = 9; los nombres siguen el idioma', () => {
  const s = Object.assign(base(), { ue: 'hl', ua: 'C' });
  const es = U.model(s, 'es'); const en = U.model(s, 'en');
  near(es.exam.mu, 44, 'μ'); near(es.exam.var, 9, 'σ²');
  assert.equal(es.sel, 'C');
  assert.notEqual(es.acts[0].name, en.acts[0].name);
});

test('una actividad elegida que no existe pasa a la primera', () => {
  assert.equal(U.model(Object.assign(base(), { ua: 'Z' }), 'es').sel, 'A');
});

test('tabla propia: errores de a, m y b por fila, y los de estructura del taller', () => {
  const m = U.model(own([row('A', 2, 1, 3), { id: 'B', name: '', a: '', m: 'x', b: '3', links: 'Q' }, row('C', 1, 4, 3), row('', '', '', '')]), 'es');
  assert.equal(m.model, null);
  assert.deepEqual(m.issues.map((i) => [i.row, i.code, i.f || null]),
    [[0, 'aGtM', null], [1, 'missing', 'a'], [1, 'badNum', 'm'], [1, 'unknownRef', null], [2, 'mGtB', null]]);
  assert.ok(m.issues.find((i) => i.code === 'unknownRef').struct);
  // Un ciclo, sin fila.
  const c = U.model(own([row('A', 1, 2, 3, 'B'), row('B', 1, 2, 3, 'A')]), 'es');
  assert.equal(c.issues[0].code, 'cycle');
  // Vacía: ni modelo ni errores.
  const e = U.model(own([row('', '', '', '')]), 'es');
  assert.equal(e.empty, true); assert.deepEqual(e.issues, []);
});

test('tabla propia válida: coma decimal, posteriores y duración fija (a = m = b)', () => {
  const m = U.model(own([row('A', '1,5', 2, 4, 'B'), row('B', 3, 3, 3)], 'succ'), 'es');
  assert.deepEqual(m.issues, []);
  assert.deepEqual(m.project.preds, { A: [], B: ['A'] });
  near(m.acts[0].mean, (1.5 + 8 + 4) / 6, 'media de A');
  assert.equal(m.acts[1].var, 0);
  assert.deepEqual(m.exam.path, ['A', 'B']);
});

test('parseNum: hasta 6 cifras y 4 decimales, con coma o punto; ni negativos ni texto', () => {
  assert.deepEqual(U.parseNum(' 2,5 '), { value: 2.5 });
  assert.deepEqual(U.parseNum('0'), { value: 0 });
  assert.deepEqual(U.parseNum(''), { error: 'missing' });
  assert.deepEqual(U.parseNum('1234567'), { error: 'tooBig' });
  assert.deepEqual(U.parseNum('1.23456'), { error: 'tooBig' });
  assert.deepEqual(U.parseNum('-1'), { error: 'badNum' });
  assert.deepEqual(U.parseNum('dos'), { error: 'badNum' });
});

test('pegar: con nombre o sin él, con encabezados, tabuladores o punto y coma', () => {
  assert.deepEqual(U.pasteRows('Act\tNombre\ta\tm\tb\tPrec\nA\tDiseño\t1\t2\t3\t\nB\tPrueba\t1\t2,5\t4\tA'),
    [row('A', 1, 2, 3, '', 'Diseño'), row('B', 1, '2,5', 4, 'A', 'Prueba')]);
  assert.deepEqual(U.pasteRows('A;1;2;3;\nB;2;3;4;A'), [row('A', 1, 2, 3, ''), row('B', 2, 3, 4, 'A')]);
  assert.deepEqual(U.pasteRows('A;1;2;3'), [row('A', 1, 2, 3)]);
  assert.deepEqual(U.pasteRows('\n  \n'), []);
});

test('withValue cambia solo la actividad pedida y no muta las filas', () => {
  const rows = [row('A', 1, 2, 3), row('B', 1, 2, 3)];
  const out = U.withValue(rows, 'B', 'm', 2.5);
  assert.equal(out[1].m, '2.5'); assert.equal(out[0].m, '2'); assert.equal(rows[1].m, '2');
});

test('M5 no ofrece los ejemplos solo de M6 (dos rutas y paralelización); M6 los ofrece todos', () => {
  assert.deepEqual(U.SECTION_EXAMPLES.m5, ['kl', 'hl']);
  assert.deepEqual(U.SECTION_EXAMPLES.m6, ['kl', 'hl', 'tr', 'pa']);
});

test('curvas: la triangular son tres puntos y las marcas del eje caen en [lo, hi]', () => {
  const d = { a: 2, m: 4, b: 9 };
  assert.deepEqual(U.curvePts('tri', d, 2).map((p) => p[0]), [2, 5.5, 9]);
  const ticks = U.niceTicks(1.4, 9.6, 6);
  assert.ok(ticks.length >= 4 && ticks.every((v) => v >= 1.4 && v <= 9.6));
});

// ---------- M6 (T010) ----------
const SIM = require('../js/core/sim.js');
const m6 = (extra) => Object.assign(base(), { um: 'm6' }, extra || {});
const runSpec = (spec) => U.simSummary(spec, SIM.run({ kind: spec.kind, model: spec.model, n: spec.n, us: spec.us }).durations);

test('M6, cálculo de examen de Klastorin: plazo 25 → z 0,41, P 0,6591 de tabla y 0,6577 exacta; casi crítico A–B–E–F', () => {
  const s = m6(); const e = U.examOf(s, U.model(s, 'es'));
  assert.deepEqual(e.path, ['A', 'C', 'E', 'F']);
  assert.equal(e.deadline, 25);
  assert.deepEqual(e.table, { z2: 0.41, p4: 0.6591 });
  near(e.exact, 0.6577, 'exacta');
  assert.deepEqual(e.near.acts, ['A', 'B', 'E', 'F']);
  assert.deepEqual(e.terms.map((x) => x.mean.toFixed(2)), ['6.67', '7.83', '5.00', '4.33']);
});

test('M6, al revés: P = 0,95 → z 1,64 de tabla y el plazo; Hillier, plazo 47 → 0,84; plazo del enlace', () => {
  const inv = m6({ up: 0.95 }); const e = U.examOf(inv, U.model(inv, 'es'));
  assert.equal(e.inverse, true); assert.equal(e.table.z2, 1.64);
  near(e.table.deadline, 23.8333 + 1.64 * Math.sqrt(8.25), 'plazo de tabla');
  const hl = m6({ ue: 'hl' }); const eh = U.examOf(hl, U.model(hl, 'es'));
  assert.equal(eh.deadline, 47); assert.equal(eh.table.p4.toFixed(2), '0.84');
  const ud = m6({ ud: 26 }); assert.equal(U.examOf(ud, U.model(ud, 'es')).deadline, 26);
  // Tabla propia: el plazo por defecto es μ + σ del camino, redondeado arriba.
  const o = Object.assign(m6(), { ue: 'own', ut: { mode: 'pred', rows: [row('A', 1, 2, 9), row('B', 2, 3, 4, 'A')] } });
  const mo = U.model(o, 'es'); assert.equal(U.deadlineOf(o, mo), Math.ceil(mo.exam.mu + mo.exam.sd));
});

test('M6, dos rutas: la normal de B–D da 0,81 y la simulación del proyecto entero, la cuenta exacta 0,71 (3 errores estándar)', () => {
  const s = m6({ ue: 'tr', ux: 'proj' }); const m = U.model(s, 'es');
  assert.equal(U.examOf(s, m).table.p4.toFixed(2), '0.81');
  const spec = U.simSpec(s, m);
  assert.equal(spec.exact.toFixed(2), '0.71');
  const su = runSpec(spec);
  assert.ok(Math.abs(su.ps - spec.exact) < 3 * Math.sqrt(spec.exact * (1 - spec.exact) / su.n), `${su.ps} frente a ${spec.exact}`);
});

test('M6, AC7: en Klastorin la simulación del proyecto entero da menos que la normal del camino crítico', () => {
  const s = m6({ ux: 'proj' }); const spec = U.simSpec(s, U.model(s, 'es'));
  assert.equal(spec.exact, null, 'con caminos que comparten actividades no hay cuenta exacta');
  const su = runSpec(spec);
  near(su.pn, 0.6577, 'normal');
  assert.ok(su.ps < su.pn - 0.05, `${su.ps}`);
});

test('M6, AC8: más caminos o menos holgura bajan la probabilidad simulada; la normal no cambia', () => {
  const p = (uk) => { const s = m6({ ux: 'merge', uk }); return runSpec(U.simSpec(s, U.model(s, 'es'))); };
  const a = p({ n: 1, s: 1 }); const b = p({ n: 4, s: 1 }); const c = p({ n: 8, s: 1 }); const d = p({ n: 4, s: 0 });
  assert.ok(a.ps > b.ps && b.ps > c.ps && b.ps > d.ps, [a.ps, b.ps, c.ps, d.ps].join(' '));
  for (const x of [b, c, d]) near(x.pn, a.pn, 'normal');
});

test('M6, AC9: en el extremo de cada límite la distancia KS es mayor que en el otro', () => {
  const ks = (ux, uk) => { const s = m6({ ux, uk }); return runSpec(U.simSpec(s, U.model(s, 'es'))).ks; };
  assert.ok(ks('few', { k: 1 }) > ks('few', { k: 30 }));
  assert.ok(ks('skew', { w: 1 }) > ks('skew', { w: 0 }));
  assert.ok(ks('corr', { r: 0.95 }) > ks('corr', { r: 0 }));
});

test('M6: la clave de la simulación cambia con el modelo y la semilla, no con el plazo; sin semilla, la de siempre', () => {
  const s = m6({ ux: 'proj' }); const m = U.model(s, 'es');
  const k = U.simSpec(s, m).key;
  assert.equal(U.simSpec(Object.assign({}, s, { ud: 30 }), m).key, k);
  assert.notEqual(U.simSpec(Object.assign({}, s, { us: 7 }), m).key, k);
  assert.equal(U.simSpec(s, m).us, U.SEED_DEFAULT);
  assert.equal(U.simSpec(m6(), m), null, 'el cálculo de examen no simula');
});

test('M6: los recorridos de los deslizadores (bocetos) caben en la URL y los valores por defecto están dentro', () => {
  for (const [k, d] of Object.entries(U.SLIDERS)) {
    assert.ok(URL.UNC.cleanUk({ [k]: d.lo }) && URL.UNC.cleanUk({ [k]: d.hi }) && URL.UNC.cleanUk({ [k]: d.lo + d.step }), k);
    assert.ok(U.UK_DEFAULT[k] >= d.lo && U.UK_DEFAULT[k] <= d.hi, k);
  }
  assert.deepEqual(U.ukOf(m6({ uk: { n: 2 } })), Object.assign({}, U.UK_DEFAULT, { n: 2 }));
});
