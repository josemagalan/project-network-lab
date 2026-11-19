'use strict';
// ex-prob: «Probabilidad (TCL)» en «Ejercicios» sin DOM (F3e, T010; AC1–AC5, AC10, AC18, AC24 y AC25; tableros 93–95 y
// 103). El ejercicio de la semilla (core/probgen, con la otra ruta si se pide), las respuestas del enlace (pa), la nota,
// los textos del enunciado y del nivel, las explicaciones de cada casilla y el enlace a la solución en M6. La tabla de la
// normal (views/normal-table) sale de threept.tableP. El dibujo, el teclado, Practicar y Examen los comprueban las pruebas
// de navegador. Referencia: el alumno del tablero 93 (semilla 2026, media, con la otra ruta; tₑ de G = 8,5).
const test = require('node:test');
const assert = require('node:assert/strict');
const GEN = require('../js/core/generator.js');
const PG = require('../js/core/probgen.js');
const PR = require('../js/core/probgrade.js');
const T3 = require('../js/core/threept.js');
const U = require('../js/core/urlstate.js');
const I = require('../js/i18n.js');
const IP = require('../js/i18n-prob.js');
const XP = require('../js/ex-prob.js');
const NT = require('../js/views/normal-table.js');
const X = require('../js/ex.js');

const st = (o) => Object.assign(U.defaults(), { v: 'ex', xk: 'tcl', lang: 'es' }, o);
const r2 = (x) => String(Math.round(x * 100) / 100);
const r4 = (x) => String(Math.round(x * 1e4) / 1e4);

// El alumno coherente de los tableros: escribe con dos decimales (cuatro la probabilidad) y sigue con lo que ha escrito.
function student(ex, sol, edit = {}) {
  const a = {};
  for (const r of ex.rows) { a[`${r.id}.te`] = r2(sol.acts[r.id].te); a[`${r.id}.var`] = r2(sol.acts[r.id].var); }
  a.path = sol.path.slice();
  Object.assign(a, edit.pre || {});
  const n = (k) => Number(String(a[k]).replace(',', '.'));
  const mu = a.path.reduce((s, i) => s + n(`${i}.te`), 0); const v = a.path.reduce((s, i) => s + n(`${i}.var`), 0);
  const z = T3.tableP((ex.deadline - mu) / Math.sqrt(v));
  Object.assign(a, { mu: r2(mu), var: r2(v), z: r2(z.z2), p: r4(z.p4), zp: r2(sol.zp), Tp: r2(mu + sol.zp * Math.sqrt(v)) });
  if (ex.route) {
    const rm = ex.route.reduce((s, i) => s + n(`${i}.te`), 0); const rv = ex.route.reduce((s, i) => s + n(`${i}.var`), 0);
    const rz = T3.tableP((ex.deadline - rm) / Math.sqrt(rv));
    Object.assign(a, { 'r.mu': r2(rm), 'r.var': r2(rv), 'r.z': r2(rz.z2), 'r.p': r4(rz.p4), both: r4(z.p4 * rz.p4) });
  }
  Object.assign(a, edit.post || {});
  for (const k of Object.keys(a)) if (a[k] === '') delete a[k];
  return a;
}

test('T010 · el ejercicio es el de probgen con la semilla, el nivel (o «Personalizar») y la otra ruta si se pide (AC11, AC24)', () => {
  for (const [lv, sd] of [['easy', 77], ['medium', 2026], ['hard', 3141]]) {
    for (const xo of [0, 1]) {
      const r = XP.exercise(st({ sd, lv, xo }));
      const want = PG.tcl(sd, lv, { route: !!xo });
      assert.deepEqual(r, want, `${lv} ${sd} ${xo}`);
      assert.equal(!!r.ex.route, !!xo);
    }
  }
  const gp = { n: [8, 9], pred: 1.5, dummies: null, critical: [1, 2], dmax: 10 };
  assert.deepEqual(XP.exercise(st({ sd: 5, lv: 'custom', gp })), PG.tcl(5, gp, {}));
  assert.equal(XP.exercise(st({ sd: 5, lv: 'custom', gp })).ex.level, 'custom');
  // El nivel que no existe es el medio (como «Ejercicios»); la búsqueda se puede hacer a trozos con el mismo resultado.
  assert.deepEqual(XP.exercise(st({ sd: 9, lv: 'nope' })), PG.tcl(9, 'medium', {}));
  const job = XP.job(st({ sd: 50, lv: 'hard', xo: 1 }));
  while (!PG.step(job, { tries: 3 }).done);
  assert.deepEqual(PG.result(job), PG.tcl(50, 'hard', { route: true }));
  assert.equal(XP.exKey(st({ sd: 50, lv: 'hard', xo: 1 })) === XP.exKey(st({ sd: 50, lv: 'hard', xo: 0 })), false, 'la otra ruta es otro ejercicio');
});

test('T010 · respuestas del enlace: una casilla como texto, las marcas del camino en el orden de la tabla, vacías fuera (pa)', () => {
  const ex = PG.tcl(2026, 'medium', { route: true }).ex;
  let pa = XP.setField(null, 'G.te', '8,5');
  assert.deepEqual(pa, { 'G.te': '8,5' });
  pa = XP.setField(pa, 'mu', ' 26 ');
  assert.deepEqual(pa, { 'G.te': '8,5', mu: ' 26 ' }, 'el texto, tal cual (constitución, 22)');
  pa = XP.setPath(pa, ex, 'J', true);
  pa = XP.setPath(pa, ex, 'B', true);
  pa = XP.setPath(pa, ex, 'G', true);
  assert.deepEqual(pa.path, ['B', 'G', 'J'], 'en el orden de las filas');
  pa = XP.setPath(pa, ex, 'G', false);
  assert.deepEqual(pa.path, ['B', 'J']);
  assert.deepEqual(U.cleanPa(pa, 'tcl'), pa, 'cabe en la clave pa');
  assert.equal(XP.setField(XP.setPath(XP.setPath(XP.setField(null, 'z', '1'), ex, 'A', true), ex, 'A', false), 'z', ''), null, 'sin nada escrito, nada');
  assert.equal(XP.setField(null, 'mu', '123456789').mu, '12345678', 'recortado al largo del enlace');
  assert.deepEqual(XP.answers(st({ pa: { mu: '3', path: ['A'] } })), { mu: '3', path: ['A'] });
  assert.deepEqual(XP.answers(st({})), {});
  // Lo hecho que se pierde al cambiar de ejercicio (ex.hasWork).
  assert.equal(X.hasWork(st({ pa: { mu: '3' } })), true);
  assert.equal(X.hasWork(st({ pa: null })), false);
});

test('T010 · el alumno del tablero 93: tₑ de G mal y sus consecuentes; 30 de 32 (93,8 %), como probgrade (AC2, AC5)', () => {
  const ex = PG.tcl(2026, 'medium', { route: true }).ex;
  const sol = PG.solve('tcl', ex);
  const ans = student(ex, sol, { pre: { 'G.te': '8.5' }, post: { both: '' } });
  const g = XP.grade(ex, ans);
  assert.deepEqual(g, PR.tcl(ex, ans, sol));
  assert.deepEqual([g.score.got, g.score.total, g.score.pct], [30, 32, 93.8]);
  assert.equal(g.cells['G.te'].status, 'wrong');
  for (const k of ['mu', 'z', 'p', 'Tp']) assert.equal(g.cells[k].status, 'carried', k);
  assert.equal(g.cells.both.status, 'blank');
  assert.equal(XP.scoreText(g, 'es'), 'Nota: 93,8 % (30 de 32)');
  assert.equal(XP.scoreText(g, 'en'), 'Score: 93.8% (30 of 32)');
  assert.equal(XP.countText(g, 'es'), '1 incorrecta · 4 con error consecuente · 1 sin contestar');
  assert.equal(XP.countText(g, 'en'), '1 wrong · 4 with a carried error · 1 not answered');
  assert.deepEqual(XP.order(ex), PR.fields('tcl', ex), 'las casillas, en el orden de probgrade');
});

test('T010 · explicaciones: tₑ y σ² con a, m y b; las casillas que salen de otras, con los datos del alumno y dónde empieza el error (AC10)', () => {
  const ex = PG.tcl(2026, 'medium', { route: true }).ex;
  const sol = PG.solve('tcl', ex);
  const ans = student(ex, sol, { pre: { 'G.te': '8.5', 'E.var': '2' }, post: { both: '', 'r.z': 'x' } });
  const g = XP.grade(ex, ans);
  const E = (k, lang = 'es') => XP.explain(ex, ans, g, k, lang);
  assert.equal(E('G.te'), 'Has escrito 8,5. tₑ = (a + 4m + b) / 6 = (4 + 4 · 7 + 13) / 6 = 7,5.');
  assert.equal(E('G.te', 'en'), 'You wrote 8.5. tₑ = (a + 4m + b) / 6 = (4 + 4 · 7 + 13) / 6 = 7.5.');
  assert.equal(E('E.var'), 'Has escrito 2. σ² = ((b − a) / 6)² = ((18 − 6) / 6)² = 4.');
  assert.equal(E('A.te'), '', 'una casilla correcta no se explica');
  assert.equal(E('both'), I.t('es', 'ex.explain.blank'));
  assert.equal(E('r.z'), I.t('es', 'ex.explain.invalid', { v: 'x' }));
  // μ: la suma de sus tₑ en su camino, que arrastra tₑ de G.
  assert.equal(g.cells.mu.status, 'carried');
  assert.equal(E('mu'), I.t('es', 'ex.explain.carried', { v: '26', e: '26', lab: 'μ del proyecto', calc: '6 + 8,5 + 3,33 + 2,17 + 6',
    origin: I.t('es', 'ex.explain.origin', { lab: 'tₑ de G' }) }));
  assert.equal(E('p'), I.t('es', 'ex.explain.carried', { v: '0,7291', e: '0,7291', lab: 'P(T ≤ 27)', calc: 'Φ(0,61)',
    origin: I.t('es', 'ex.explain.origin', { lab: 'tₑ de G' }) }));
  assert.equal(E('z'), I.t('es', 'ex.explain.carried', { v: '0,61', e: '0,61', lab: 'z del plazo', calc: '(27 − 26) / √2,72',
    origin: I.t('es', 'ex.explain.origin', { lab: 'tₑ de G' }) }));
  assert.equal(E('Tp'), I.t('es', 'ex.explain.carried', { v: '27,39', e: '27,39', lab: 'plazo para el 80 %', calc: '26 + 0,84 · √2,72',
    origin: I.t('es', 'ex.explain.origin', { lab: 'tₑ de G' }) }));
  // La z de la probabilidad no sale de otras: la de la tabla.
  const zp = Object.assign({}, ans, { zp: '0,9' });
  const gz = XP.grade(ex, zp);
  assert.equal(gz.cells.zp.status, 'wrong');
  assert.equal(XP.explain(ex, zp, gz, 'zp', 'es'), 'Has escrito 0,9. En la tabla, Φ(z) = 0,8 da z = 0,84.');
  // La otra ruta: la varianza de E arrastra la de la ruta.
  assert.equal(g.cells['r.var'].status, 'carried');
  assert.match(E('r.var'), /σ² de la otra ruta = 0,69 \+ 0,03 \+ 0,44 \+ 2 = 3,16/);
  assert.match(E('r.var'), /empieza en σ² de E/);
  // Una casilla que no cuadra ni con la solución ni con sus datos.
  const bad = Object.assign({}, ans, { mu: '30' });
  const g2 = XP.grade(ex, bad);
  assert.equal(g2.cells.mu.status, 'wrong');
  assert.equal(XP.explain(ex, bad, g2, 'mu', 'es'), I.t('es', 'ex.explain.wrong', { v: '30', e: '26', lab: 'μ del proyecto', calc: '6 + 8,5 + 3,33 + 2,17 + 6' }));
  // P de las dos rutas: el producto de sus dos probabilidades.
  const both = Object.assign({}, ans, { both: '0,5' });
  const g3 = XP.grade(ex, both);
  assert.equal(g3.cells.both.status, 'wrong');
  assert.equal(XP.explain(ex, both, g3, 'both', 'en'), I.t('en', 'ex.explain.wrong', { v: '0.5', e: '0.6804', lab: 'P of both routes', calc: '0.7291 · 0.9332' }));
});

test('T010 · el camino: marcas que no son un camino, un camino corto, un empate perdido por la varianza y un camino con error consecuente (AC3)', () => {
  const ex = PG.tcl(2026, 'medium', { route: true }).ex;
  const sol = PG.solve('tcl', ex);
  const E = (ans, lang = 'es') => XP.explain(ex, ans, XP.grade(ex, ans), 'path', lang);
  const base = student(ex, sol);
  assert.equal(E(base), '', 'el camino de la solución');
  assert.equal(E(Object.assign({}, base, { path: ['B', 'H'] })), 'Tus marcas (B–H) no forman un camino del inicio al fin por actividades seguidas.');
  assert.equal(E(Object.assign({}, base, { path: ['B', 'F'] })), 'Con tus tₑ, B–F dura 18,5, pero el camino más largo dura 25 (B–G–H–I–J).');
  assert.equal(E(Object.assign({}, base, { path: ['B', 'F'] }), 'en'), 'With your tₑ, B–F takes 18.5, but the longest path takes 25 (B–G–H–I–J).');
  // Con tₑ de G = 1,5, A–C–D–E (24,33) pasa a ser el más largo: marcarlo es correcto con error consecuente.
  const moved = Object.assign({}, base, { 'G.te': '1,5', path: ['A', 'C', 'D', 'E'] });
  const gm = XP.grade(ex, moved);
  assert.equal(gm.cells.path.status, 'carried');
  assert.equal(E(moved), I.t('es', 'pb.explain.pathCarried', { p: 'A–C–D–E', r: 'B–G–H–I–J', origin: I.t('es', 'ex.explain.origin', { lab: 'tₑ de G' }) }));
  // Empate con lo que escribió (tₑ de E = 11,33): A–C–D–E y B–G–H–I–J suman 25, y con sus σ² (σ² de E = 0) gana B–G–H–I–J.
  const tie = Object.assign({}, base, { 'E.te': '11,33', 'E.var': '0', path: ['A', 'C', 'D', 'E'] });
  const gt = XP.grade(ex, tie);
  assert.equal(gt.cells.path.status, 'wrong');
  assert.equal(E(tie), I.t('es', 'pb.explain.pathVar', { p: 'A–C–D–E', best: 'B–G–H–I–J', len: '25', v: '1,16', top: '2,72' }));
  // El empate solo se ve con los buenos exactos (tₑ de C = 1,16 está bien; tₑ de E = 34/3): con lo escrito, A–C–D–E dura 24,99.
  const tie2 = Object.assign({}, base, { 'C.te': '1,16', 'E.te': '34/3', 'E.var': '0', path: ['A', 'C', 'D', 'E'] });
  const g2 = XP.grade(ex, tie2);
  assert.equal(g2.cells['C.te'].status, 'ok');
  assert.equal(g2.cells.path.status, 'wrong');
  assert.equal(E(tie2), I.t('es', 'pb.explain.pathVar', { p: 'A–C–D–E', best: 'B–G–H–I–J', len: '25', v: '1,17', top: '2,72' }));
  // μ se explica con la suma de sus tₑ en su camino (aunque no sea el de la solución).
  const mu = Object.assign({}, moved, { mu: '30' });
  assert.match(XP.explain(ex, mu, XP.grade(ex, mu), 'mu', 'es'), /μ del proyecto = 9,5 \+ 1,17 \+ 3 \+ 10,67 = 24,34/);
});

test('T010 · el 95 %: valen 1,64, 1,645 y 1,65 con su plazo; la explicación de otra z lo dice (AC25)', () => {
  let sd = 1; let ex;
  for (; sd < 400; sd++) { ex = PG.tcl(sd, 'easy', {}).ex; if (ex.prob === 0.95) break; }
  const sol = PG.solve('tcl', ex);
  const base = student(ex, sol);
  for (const z of ['1,64', '1,645', '1,65']) {
    const zv = Number(z.replace(',', '.'));
    const ans = Object.assign({}, base, { zp: z, Tp: r2(Number(base.mu) + zv * Math.sqrt(Number(base.var))) });
    const g = XP.grade(ex, ans);
    assert.equal(g.cells.zp.status, 'ok', z);
    assert.equal(g.cells.Tp.status === 'ok' || g.cells.Tp.status === 'carried', true, `${z}: ${g.cells.Tp.status}`);
  }
  const ans = Object.assign({}, base, { zp: '1,66' });
  const g = XP.grade(ex, ans);
  assert.equal(g.cells.zp.status, 'wrong');
  assert.equal(XP.explain(ex, ans, g, 'zp', 'es'), 'Has escrito 1,66. Para el 95 % valen 1,64, 1,645 y 1,65 (las tablas impresas difieren).');
  assert.equal(XP.explain(ex, ans, g, 'zp', 'en'), 'You wrote 1.66. For 95% 1.64, 1.645 and 1.65 are all right (printed tables differ).');
});

test('T010 · enunciado, nivel, etiquetas y la semilla usada (H9), en los dos idiomas', () => {
  const ex = PG.tcl(2026, 'medium', { route: true }).ex;
  const join = (parts) => parts.map((x) => (typeof x === 'string' ? x : x.b)).join('');
  assert.equal(join(XP.statement(ex, 'es')), 'Duraciones en semanas: optimista (a), más probable (m) y pesimista (b). Plazo: 27 semanas. Probabilidad pedida: 80 %. La otra ruta: A–C–D–E.');
  assert.equal(join(XP.statement(ex, 'en')), 'Durations in weeks: optimistic (a), most likely (m) and pessimistic (b). Deadline: 27 weeks. Probability asked: 80%. The other route: A–C–D–E.');
  assert.deepEqual(XP.statement(ex, 'es').filter((x) => typeof x !== 'string').map((x) => x.b), ['27 semanas', '80 %', 'A–C–D–E'], 'en negrita, los datos');
  assert.equal(join(XP.statement(PG.tcl(77, 'easy', {}).ex, 'es')).includes('otra ruta'), false);
  assert.equal(XP.levelText(GEN.LEVELS.medium, 'medium', 'es'), '9–10 actividades · 1–2 caminos críticos · un 20 % de duraciones fijas (a = m = b)');
  assert.equal(XP.levelText(GEN.LEVELS.easy, 'easy', 'en'), '6–7 activities · 1 critical path · 30% of durations fixed (a = m = b)');
  assert.equal(XP.levelText(GEN.LEVELS.hard, 'hard', 'es'), '12–14 actividades · 2–3 caminos críticos · un 15 % de duraciones fijas (a = m = b)');
  assert.equal(XP.label('G.te', ex, 'es'), 'tₑ de G');
  assert.equal(XP.label('G.var', ex, 'en'), 'σ² of G');
  assert.equal(XP.label('p', ex, 'es'), 'P(T ≤ 27)');
  assert.equal(XP.label('Tp', ex, 'en'), 'deadline for 80%');
  // Una semilla cuya tabla no vale: se dice cuál se usa (y el enlace guarda la pedida).
  let sd = 1; let r;
  for (; sd < 500; sd++) { r = PG.tcl(sd, 'hard', { route: true }); if (r.info.sdUsed !== sd) break; }
  assert.equal(XP.movedText(r, 'es'), I.t('es', 'pb.moved', { sd, used: r.info.sdUsed }));
  assert.equal(XP.movedText(PG.tcl(2026, 'medium', {}), 'es'), '');
});

test('T010 · «Ver la solución en M6»: el mismo proyecto como tabla propia, con el plazo y la probabilidad del ejercicio', () => {
  const ex = PG.tcl(2026, 'medium', { route: true }).ex;
  const h = XP.m6Hash(ex, st({ sd: 2026, lang: 'en', nota: 'es' }));
  const r = U.decode(h);
  assert.equal(r.warning, undefined);
  assert.deepEqual([r.state.v, r.state.um, r.state.ue, r.state.ud, r.state.up, r.state.lang, r.state.nota], ['unc', 'm6', 'own', 27, 0.8, 'en', 'es']);
  assert.deepEqual(r.state.ut.rows.map((x) => [x.id, x.a, x.m, x.b, x.links]), ex.rows.map((x) => [x.id, String(x.a), String(x.m), String(x.b), x.preds.join(', ')]));
});

test('T010 · la tabla de la normal: Φ de 0,00 a 3,49 con cuatro decimales, la de threept.tableP; la z que se busca, resaltada (H1)', () => {
  const rows = NT.rows();
  assert.equal(rows.length, 35);
  for (const r of rows) assert.equal(r.p.length, 10);
  for (let i = 0; i < 35; i++) for (let j = 0; j < 10; j++) assert.equal(rows[i].p[j], T3.tableP((i * 10 + j) / 100).p4, `${i} ${j}`);
  assert.equal(rows[16].p[3], 0.9484);
  assert.equal(rows[0].p[0], 0.5);
  assert.equal(rows[34].p[9], 0.9998);
  assert.deepEqual(NT.locate('1,63'), { z: 1.63, row: 16, col: 3, p: 0.9484, neg: false });
  assert.deepEqual(NT.locate('1.645'), { z: 1.65, row: 16, col: 5, p: 0.9505, neg: false }, 'redondeada a dos decimales, como la tabla');
  assert.deepEqual(NT.locate('-0,61'), { z: -0.61, row: 6, col: 1, p: T3.tableP(-0.61).p4, neg: true });
  assert.equal(NT.locate('3,5'), null, 'fuera de la tabla');
  assert.equal(NT.locate(''), null);
  assert.equal(NT.locate('abc'), null);
});

test('T010 · los textos de TCL (i18n-prob) están en los dos idiomas, con los mismos parámetros; las etiquetas de los tipos, en i18n', () => {
  const keysDeep = (o, p = '') => Object.entries(o).flatMap(([k, v]) => (v && typeof v === 'object' ? keysDeep(v, `${p}${k}.`) : [`${p}${k}`])).sort();
  const params = (v) => (String(v).match(/\{\w+\}/g) || []).sort();
  const get = (o, k) => k.split('.').reduce((a, p) => a[p], o);
  assert.deepEqual(keysDeep(IP.es), keysDeep(IP.en));
  for (const k of keysDeep(IP.es)) assert.deepEqual(params(get(IP.es, k)), params(get(IP.en, k)), `pb.${k}`);
  for (const lang of I.languages) {
    assert.equal(I.dict[lang].pb, IP[lang]);
    for (const k of ['tcl', 'mc']) assert.ok(I.dict[lang].ex.kind[k], `${lang} ex.kind.${k}`);
    for (const f of PR.EXPLAIN.slice(0, 14)) assert.ok(IP[lang].lab[f], `${lang} pb.lab.${f}`);
  }
  assert.equal(I.t('es', 'ex.kind.tcl'), 'Probabilidad (TCL)');
  assert.equal(I.t('en', 'ex.kind.mc'), 'Monte Carlo');
});

// ---------- F3e T021: arreglos de la revisión de nivel 2 (ronda 1) ----------

test('T021 I-F2 · el camino: marcas sin el inicio o sin el fin, y un empate por dentro perdido por la varianza (semilla 2026, media)', () => {
  const ex = PG.tcl(2026, 'medium', { route: true }).ex;
  const sol = PG.solve('tcl', ex);
  const base = student(ex, sol);
  const E = (edit, k = 'path', lang = 'es') => { const a = Object.assign({}, base, edit); return XP.explain(ex, a, XP.grade(ex, a), k, lang); };
  // Sin el inicio (G–H–I–J) o sin el fin (B–G–H–I) no son un camino; μ se explica entonces sobre el de la solución.
  assert.equal(E({ path: ['G', 'H', 'I', 'J'] }), 'Tus marcas (G–H–I–J) no forman un camino del inicio al fin por actividades seguidas.');
  assert.equal(E({ path: ['B', 'G', 'H', 'I'] }), 'Tus marcas (B–G–H–I) no forman un camino del inicio al fin por actividades seguidas.');
  assert.equal(E({ path: ['G', 'H', 'I', 'J'], mu: '30' }, 'mu'), 'Has escrito 30. Con tus datos esperaba 25: μ del proyecto = 6 + 7,5 + 3,33 + 2,17 + 6 = 25.');
  assert.equal(E({ path: ['B', 'G', 'H', 'I'], mu: '30' }, 'mu'), 'Has escrito 30. Con tus datos esperaba 25: μ del proyecto = 6 + 7,5 + 3,33 + 2,17 + 6 = 25.');
  // Empate por dentro: con tₑ de A = 1 y de C = 5,33, B–C–D–E también suma 25; con σ² de C, D y E = 0, gana B–G–H–I–J.
  const tie = { 'A.te': '1', 'C.te': '5,33', 'C.var': '0', 'D.var': '0', 'E.var': '0', path: ['B', 'C', 'D', 'E'] };
  assert.equal(E(tie), 'Con tus tₑ, B–C–D–E empata con B–G–H–I–J (25), pero con tus σ² tiene menos varianza (0 frente a 2,72): con empate, el crítico es el de mayor varianza.');
  assert.equal(E(tie, 'path', 'en'), I.t('en', 'pb.explain.pathVar', { p: 'B–C–D–E', best: 'B–G–H–I–J', len: '25', v: '0', top: '2.72' }));
});

test('T021 I-F3 · explicaciones: σ² del proyecto, la otra ruta (μ, z y P), el plazo con la z escrita y las casillas vacías (semilla 2026, media)', () => {
  const ex = PG.tcl(2026, 'medium', { route: true }).ex;
  const sol = PG.solve('tcl', ex);
  const E = (a, k, lang = 'es') => XP.explain(ex, a, XP.grade(ex, a), k, lang);
  const a3 = student(ex, sol, { pre: { 'G.var': '1' } });
  assert.equal(E(Object.assign({}, a3, { var: '9' }), 'var'), 'Has escrito 9. Con tus datos esperaba 1,47: σ² del proyecto = 0 + 1 + 0,44 + 0,03 + 0 = 1,47.');
  const a4 = student(ex, sol, { pre: { 'G.te': '8,5' } });
  assert.equal(E(Object.assign({}, a4, { 'r.mu': '30' }), 'r.mu'), 'Has escrito 30. Con tus datos esperaba 24,34: μ de la otra ruta = 9,5 + 1,17 + 3 + 10,67 = 24,34.');
  assert.equal(E(Object.assign({}, a4, { 'r.z': '3' }), 'r.z'), 'Has escrito 3. Con tus datos esperaba 1,17: z de la otra ruta = (27 − 24,34) / √5,16 = 1,17.');
  assert.equal(E(Object.assign({}, a4, { 'r.p': '0,1' }), 'r.p'), 'Has escrito 0,1. Con tus datos esperaba 0,879: P de la otra ruta = Φ(1,17) = 0,879.');
  assert.equal(E(Object.assign({}, a4, { 'r.p': '0,1' }), 'r.p', 'en'), 'You wrote 0.1. With your data I expected 0.879: P of the other route = Φ(1.17) = 0.879.');
  // El plazo, con la z que escribió (0,85, no la de la tabla, 0,84).
  assert.equal(E(Object.assign({}, a4, { zp: '0,85', Tp: '30' }), 'Tp'), 'Has escrito 30. Con tus datos esperaba 27,4: plazo para el 80 % = 26 + 0,85 · √2,72 = 27,4.');
  // Vacías o sin número: los datos de la solución.
  assert.equal(E(Object.assign({}, a4, { zp: '', var: '', mu: 'x', Tp: '30' }), 'Tp'), 'Has escrito 30. Con tus datos esperaba 26,39: plazo para el 80 % = 25 + 0,84 · √2,7222 = 26,39.');
  assert.equal(E(Object.assign({}, a4, { 'r.mu': '', 'r.z': '0' }), 'r.z'), 'Has escrito 0. Con tus datos esperaba 1,17: z de la otra ruta = (27 − 24,3333) / √5,16 = 1,17.');
});

test('T021 I-F7 · el nivel con «Personalizar» se describe como el medio (un 20 % de duraciones fijas)', () => {
  const gp = { n: [8, 9], pred: 1.5, dummies: null, critical: [1, 2], dmax: 10 };
  assert.equal(XP.levelText(gp, 'custom', 'es'), '8–9 actividades · 1–2 caminos críticos · un 20 % de duraciones fijas (a = m = b)');
  assert.equal(XP.levelText(gp, 'custom', 'en'), '8–9 activities · 1–2 critical paths · 20% of durations fixed (a = m = b)');
  assert.equal(XP.levelText(gp, 'custom', 'es').split(' · ')[2], XP.levelText(gp, 'medium', 'es').split(' · ')[2]);
});
