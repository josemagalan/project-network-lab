'use strict';
// core/moodle: el banco de preguntas de Moodle XML por etapas (spec f3b-moodle, AC2–AC5, AC7 y AC8; plan §3,
// P1, P6 y T002). Ejemplo de referencia citado: Ej. 6 de los apuntes (Mecánicas del Sureste, Tema 6a, 13 días),
// con los valores de la tabla de holguras y del grafo PERT del Tema 6a escritos aquí.
const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../js/core/project.js');
const E = require('../js/core/examples.js');
const G = require('../js/core/generator.js');
const GR = require('../js/core/grade.js');
const U = require('../js/core/urlstate.js');
const M = require('../js/core/moodle.js');

// Textos de prueba: la clave y sus parámetros (los de verdad llegan con i18n-moodle, T006).
const tr = (k, p) => (p ? `${k}${JSON.stringify(p)}` : k);
const LABELS = { ES: 'ES', EF: 'EF', LS: 'LS', LF: 'LF', TF: 'TF', FF: 'FF', IF: 'IF', SF: 'SF', TE: 'TE', TL: 'TL' };
const LABELS_ES = { ES: 'tᵢ', EF: 'fᵢ', LS: 'tᵢ*', LF: 'fᵢ*', TF: 'HT', FF: 'HL', IF: 'HI', SF: 'HS', TE: 'tᵢ', TL: 'tᵢ*' };
const ctx = (extra) => Object.assign({ tr, labels: LABELS, lang: 'es', nota: 'en', sf: false }, extra || {});
const FRACTIONS = ['100', '50', '33.33333', '25', '-100', '-50', '-33.33333', '-25'];

// Huecos de una pregunta, recorriendo sus bloques: { key: valor }.
function holes(q) {
  const out = {};
  const cell = (c) => {
    if (c && typeof c === 'object' && 'num' in c) out[c.key] = c.num;
    if (c && typeof c === 'object' && 'yesNo' in c) out[c.key] = c.yesNo ? 'yes' : 'no';
  };
  for (const b of q.text) {
    if (b.hole) cell(b.hole);
    if (b.table) b.table.rows.forEach((r) => r.forEach(cell));
  }
  return out;
}
// Columna de datos de la tabla con encabezado h: { id de la fila: valor }.
function column(q, h) {
  const t = q.text.filter((b) => b.table).find((b) => b.table.head.includes(h));
  if (!t) return null;
  const i = t.table.head.indexOf(h);
  return Object.fromEntries(t.table.rows.map((r) => [String(r[0]), r[i]]));
}
const ids = (sol) => sol.project.activities.map((a) => a.id);

test('etapas en el orden del método', () => {
  assert.deepEqual(M.STAGES, ['early', 'late', 'floats', 'critAct', 'critPath', 'evEarly', 'evLate']);
  assert.deepEqual(M.LEVELS, ['easy', 'medium', 'hard']);
  assert.equal(M.APP, 'https://josemagalan.github.io/project-network-lab/cpm.html');
});

test('exercise: la tabla del generador de la F3a con su solución', () => {
  const ex = M.exercise('medium', 4321);
  const g = G.generate(4321, G.LEVELS.medium);
  assert.deepEqual(ex.rows, g.rows);
  assert.equal(ex.gv, G.VERSION);
  assert.deepEqual(ex.sol.cpm, GR.solve(P.parse(g.rows, 'pred').project).cpm);
  assert.deepEqual(M.exercise('medium', 4321), ex);
});

test('fraction: solo fracciones de la lista de Moodle', () => {
  assert.deepEqual([1, 2, 3, 4].map(M.fraction), ['100', '50', '33.33333', '25']);
  assert.throws(() => M.fraction(5));
  assert.throws(() => M.fraction(0));
});

// AC2–AC5: en 30 tablas por nivel, cada etapa pide lo suyo con los valores de grade.solve y da los de la anterior.
for (const lv of M.LEVELS) {
  test(`AC2–AC5: siete etapas con la solución del núcleo · ${lv}`, () => {
    let critPaths = 0;
    for (let sd = 1; sd <= 30; sd++) {
      const ex = M.exercise(lv, sd);
      const { cpm, events, net } = ex.sol;
      const T = cpm.times; const F = cpm.floats; const A = ids(ex.sol); const n = A.length;
      const N = net.events.map((e) => e.n);
      const q = Object.fromEntries(M.STAGES.map((st) => [st, M.question(st, ex, ctx(), tr)]));
      // 1 · tiempos tempranos: 2n + 1
      const h1 = holes(q.early);
      assert.equal(Object.keys(h1).length, 2 * n + 1);
      for (const id of A) { assert.equal(h1[`${id}.ES`], T[id].ES); assert.equal(h1[`${id}.EF`], T[id].EF); }
      assert.equal(h1.dur, cpm.duration);
      assert.deepEqual(q.early.answers, h1);
      // 2 · tardíos: 2n, con ES y EF dados
      const h2 = holes(q.late);
      assert.equal(Object.keys(h2).length, 2 * n);
      for (const id of A) { assert.equal(h2[`${id}.LS`], T[id].LS); assert.equal(h2[`${id}.LF`], T[id].LF); }
      assert.deepEqual(column(q.late, 'ES'), Object.fromEntries(A.map((id) => [id, T[id].ES])));
      assert.deepEqual(column(q.late, 'EF'), Object.fromEntries(A.map((id) => [id, T[id].EF])));
      // 3 · holguras: 3n, con los cuatro tiempos dados
      const h3 = holes(q.floats);
      assert.equal(Object.keys(h3).length, 3 * n);
      for (const id of A) for (const f of ['TF', 'FF', 'IF']) assert.equal(h3[`${id}.${f}`], F[id][f]);
      for (const f of ['ES', 'EF', 'LS', 'LF']) assert.deepEqual(column(q.floats, f), Object.fromEntries(A.map((id) => [id, T[id][f]])));
      // 4a · críticas: n desplegables, con los cuatro tiempos y sin holguras
      const h4 = holes(q.critAct);
      assert.equal(Object.keys(h4).length, n);
      for (const id of A) assert.equal(h4[`${id}.crit`], cpm.critical.includes(id) ? 'yes' : 'no');
      for (const f of ['ES', 'EF', 'LS', 'LF']) assert.deepEqual(column(q.critAct, f), Object.fromEntries(A.map((id) => [id, T[id][f]])));
      for (const f of ['TF', 'FF', 'IF', 'SF']) assert.equal(column(q.critAct, f), null);
      // 4b · caminos: los críticos (100/c) y de 2 a 4 no críticos (−100/k), o null
      if (q.critPath) {
        critPaths++;
        assert.equal(q.critPath.qtype, 'multichoice');
        const good = q.critPath.options.filter((o) => !o.fraction.startsWith('-'));
        const bad = q.critPath.options.filter((o) => o.fraction.startsWith('-'));
        assert.deepEqual(good.map((o) => o.path).sort(), cpm.criticalPaths.map((p) => p.acts.join(' – ')).sort());
        assert.ok(bad.length >= 2 && bad.length <= 4);
        for (const o of good) assert.equal(o.fraction, M.fraction(good.length));
        for (const o of bad) assert.equal(o.fraction, `-${M.fraction(bad.length)}`);
        q.critPath.options.forEach((o) => assert.ok(FRACTIONS.includes(o.fraction)));
        assert.equal(Object.keys(holes(q.critPath)).length, 0);
        for (const f of ['TF', 'FF', 'IF', 'SF']) assert.equal(column(q.critPath, f), null);
      }
      // 5 · sucesos, tempranos: N, sobre la tabla de arcos de la red de las reglas
      const h5 = holes(q.evEarly);
      assert.equal(Object.keys(h5).length, N.length);
      for (const e of N) assert.equal(h5[`e${e}.TE`], events.TE[e]);
      const arcs = q.evEarly.text.find((b) => b.table && b.table.arcs).table;
      assert.equal(arcs.rows.length, net.arcs.length + net.dummies.length);
      // 6 · sucesos, tardíos y holguras: 2N, con los TE dados
      const h6 = holes(q.evLate);
      assert.equal(Object.keys(h6).length, 2 * N.length);
      for (const e of N) { assert.equal(h6[`e${e}.TL`], events.TL[e]); assert.equal(h6[`e${e}.slack`], events.slack[e]); }
      assert.deepEqual(column(q.evLate, 'TE'), Object.fromEntries(N.map((e) => [String(e), events.TE[e]])));
    }
    if (lv !== 'easy') assert.equal(critPaths, 30, 'en media y difícil siempre hay dos distractores (prototipo)');
    else assert.ok(critPaths >= 20);
  });
}

test('AC3: la holgura de seguridad solo si se marca (4n huecos)', () => {
  const ex = M.exercise('medium', 7);
  const n = ex.rows.length;
  const q = M.question('floats', ex, ctx({ sf: true }), tr);
  const h = holes(q);
  assert.equal(Object.keys(h).length, 4 * n);
  for (const id of ids(ex.sol)) assert.equal(h[`${id}.SF`], ex.sol.cpm.floats[id].SF);
  assert.equal(Object.keys(holes(M.question('floats', ex, ctx(), tr))).length, 3 * n);
});

test('AC4: 4b sin dos caminos no críticos → null (se descarta)', () => {
  let nulls = 0;
  for (let sd = 1; sd <= 60; sd++) {
    const ex = M.exercise('easy', sd);
    const non = ex.paths.filter((p) => !p.critical).length;
    const q = M.question('critPath', ex, ctx(), tr);
    assert.equal(q === null, non < 2, `semilla ${sd}`);
    if (!q) nulls++;
  }
  assert.ok(nulls > 0, 'el prototipo da un 12,7 % en el fácil');
});

test('AC5: la tabla de arcos es la red de las reglas (arcos y ficticias, con sus sucesos)', () => {
  const ex = M.exercise('hard', 11);
  const t = M.question('evEarly', ex, ctx(), tr).text.find((b) => b.table && b.table.arcs).table;
  const want = [...ex.sol.net.arcs.map((a) => [a.act, a.from, a.to]), ...ex.sol.net.dummies.map((d) => [d.name, d.from, d.to])]
    .map((x) => x.join()).sort();
  assert.deepEqual(t.arcs.map((a) => [a.label, a.from, a.to].join()).sort(), want);
  for (const a of t.arcs) assert.equal(a.d, a.dummy ? 0 : Number(ex.rows.find((r) => r.id === a.label).duration));
});

// Ej. 6 de los apuntes (Mecánicas del Sureste, Tema 6a): tabla de holguras y grafo PERT del tema (constitución, 8).
test('Ej. 6 de los apuntes por las siete etapas', () => {
  const ej = E.get('ej6');
  const ex = M.fromRows(ej.rows, ej.mode);
  const L = 'A B C D E F G H I J K'.split(' ');
  const map = (vals) => Object.fromEntries(L.map((id, i) => [id, vals[i]]));
  const ES = map([0, 0, 0, 0, 3, 3, 3, 7, 7, 9, 12]);
  const LF = map([3, 3, 5, 12, 7, 7, 7, 12, 9, 12, 13]);
  const D = map([2, 3, 2, 8, 4, 3, 2, 1, 2, 3, 1]);
  const h1 = holes(M.question('early', ex, ctx(), tr));
  assert.equal(h1.dur, 13);
  for (const id of L) { assert.equal(h1[`${id}.ES`], ES[id]); assert.equal(h1[`${id}.EF`], ES[id] + D[id]); }
  const h2 = holes(M.question('late', ex, ctx(), tr));
  for (const id of L) { assert.equal(h2[`${id}.LF`], LF[id]); assert.equal(h2[`${id}.LS`], LF[id] - D[id]); }
  const h3 = holes(M.question('floats', ex, ctx(), tr));
  const TF = map([1, 0, 3, 4, 0, 1, 2, 4, 0, 0, 0]); const IF = map([1, 0, 1, 4, 0, 1, 0, 4, 0, 0, 0]);
  const FF = map([1, 0, 1, 4, 0, 1, 2, 4, 0, 0, 0]);
  for (const id of L) { assert.equal(h3[`${id}.TF`], TF[id]); assert.equal(h3[`${id}.IF`], IF[id]); assert.equal(h3[`${id}.FF`], FF[id]); }
  const h4 = holes(M.question('critAct', ex, ctx(), tr));
  assert.deepEqual(L.filter((id) => h4[`${id}.crit`] === 'yes'), ['B', 'E', 'I', 'J', 'K']);
  const q4b = M.question('critPath', ex, ctx(), tr);
  assert.deepEqual(q4b.options.filter((o) => o.fraction === '100').map((o) => o.path), ['B – E – I – J – K']);
  // Grafo PERT del Tema 6a: 9 sucesos, 3 ficticias y estos tiempos (temprano, tardío) por suceso.
  const times = [[0, 0], [3, 3], [3, 3], [3, 5], [7, 7], [7, 7], [9, 9], [12, 12], [13, 13]];
  const q5 = M.question('evEarly', ex, ctx(), tr);
  assert.equal(q5.text.find((b) => b.table && b.table.arcs).table.arcs.filter((a) => a.dummy).length, 3);
  const h5 = holes(q5); const h6 = holes(M.question('evLate', ex, ctx(), tr));
  assert.equal(Object.keys(h5).length, 9);
  times.forEach(([te, tl], i) => { assert.equal(h5[`e${i + 1}.TE`], te); assert.equal(h6[`e${i + 1}.TL`], tl); assert.equal(h6[`e${i + 1}.slack`], tl - te); });
  // Sin semilla: sin enlace al ejercicio, con el de la solución paso a paso.
  const q = M.question('early', ex, ctx(), tr);
  assert.equal(q.links.ex, null);
  assert.equal(U.decode(q.links.step.slice(q.links.step.indexOf('#'))).state.v, 'route');
});

test('AC6 (modelo): nombre, categoría, etiquetas y valor', () => {
  const ex = M.exercise('hard', 99);
  const q = M.question('late', ex, ctx(), tr);
  assert.deepEqual(q.category, ['root', 'stage.late', 'level.hard']);
  assert.ok(q.name.includes('stage.late') && q.name.includes(`n=${ex.rows.length}`) && q.name.includes('s=99') && q.name.includes(`gv=${G.VERSION}`));
  assert.deepEqual(q.tags, ['pnl-late', 'level-hard', 'lang-es', `gv-${G.VERSION}`]);
  assert.equal(q.qtype, 'cloze');
  assert.equal(q.stage, 'late'); assert.equal(q.level, 'hard'); assert.equal(q.seed, 99); assert.equal(q.n, ex.rows.length);
});

// AC7: los enlaces abren la misma tabla en «Ejercicios» (con gv siempre) y en la ruta (con la tabla).
test('AC7: enlaces al ejercicio y a la solución paso a paso', () => {
  const ASK = { early: ['times'], late: ['times'], floats: ['floats'], critAct: ['critical'], critPath: ['critical'], evEarly: ['events'], evLate: ['events'] };
  for (const lv of M.LEVELS) {
    const ex = M.exercise(lv, 321);
    for (const st of M.STAGES) {
      const l = M.links(ex, st, ctx({ lang: 'en', nota: 'es' }));
      assert.ok(l.ex.startsWith(`${M.APP}#`) && l.step.startsWith(`${M.APP}#`));
      const a = U.decode(l.ex.slice(M.APP.length)); const b = U.decode(l.step.slice(M.APP.length));
      assert.equal(a.malformed, undefined); assert.equal(b.malformed, undefined);
      assert.equal(a.state.v, 'ex'); assert.equal(a.state.sd, 321); assert.equal(a.state.lv, lv); assert.equal(a.state.gv, G.VERSION);
      assert.deepEqual(a.state.ask, ASK[st]);
      assert.equal(a.state.lang, 'en'); assert.equal(a.state.nota, 'es');
      assert.deepEqual(G.generate(a.state.sd, G.LEVELS[a.state.lv]).rows, ex.rows);
      assert.equal(b.state.v, 'route');
      assert.equal(b.state.graph, st.startsWith('ev') ? 'aoa' : 'aon');
      assert.deepEqual(P.parse(b.state.t, 'pred').project, P.parse(ex.rows, 'pred').project);
    }
    const sf = U.decode(M.links(ex, 'floats', ctx({ sf: true })).ex.slice(M.APP.length));
    assert.deepEqual(sf.state.ask, ['floats', 'sf']);
  }
  // La pregunta lleva los mismos enlaces en su modelo y en la retroalimentación.
  const ex = M.exercise('easy', 5);
  const q = M.question('evLate', ex, ctx(), tr);
  assert.deepEqual(q.links, M.links(ex, 'evLate', ctx()));
  assert.ok(q.general.some((b) => b.links && b.links.ex === q.links.ex));
  assert.ok(!q.text.some((b) => b.links), 'el enunciado no lleva enlaces');
});

test('AC8: encabezados en la notación elegida', () => {
  const ex = M.exercise('medium', 3);
  const q = M.question('floats', ex, ctx({ labels: LABELS_ES, nota: 'es' }), tr);
  const head = q.text.find((b) => b.table && b.table.head.includes('HT')).table.head;
  for (const h of ['tᵢ', 'fᵢ', 'tᵢ*', 'fᵢ*', 'HT', 'HL', 'HI']) assert.ok(head.includes(h), h);
  const e = M.question('evLate', ex, ctx({ labels: LABELS_ES, nota: 'es' }), tr);
  assert.ok(e.text.some((b) => b.table && b.table.head.includes('tᵢ*')));
});

test('el núcleo de Moodle no usa Math.random ni el DOM', () => {
  const src = require('node:fs').readFileSync(require('node:path').join(__dirname, '../js/core/moodle.js'), 'utf8');
  assert.ok(!/Math\.random/.test(src));
  assert.ok(!/document\.|innerHTML/.test(src));
});
