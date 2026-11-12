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
  assert.deepEqual(M.question('late', ex, ctx({ lang: 'en' }), tr).tags, ['pnl-late', 'level-hard', 'lang-en', `gv-${G.VERSION}`]);
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
    // Con la holgura de seguridad marcada, solo la etapa 3 la pide en «Ejercicios».
    for (const st of M.STAGES) {
      const sf = U.decode(M.links(ex, st, ctx({ sf: true })).ex.slice(M.APP.length));
      assert.deepEqual(sf.state.ask, st === 'floats' ? ['floats', 'sf'] : ASK[st], st);
    }
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

// ---------- T004: ejecutor por pasos y XML (AC1, AC6, AC8, AC10) ----------
const { spawnSync } = require('node:child_process');
const X = require('./xml-check.js');
const OPTS = (extra) => Object.assign({ lang: 'es', nota: 'en', sf: false, labels: LABELS, stages: M.STAGES.slice(), levels: M.LEVELS.slice(), count: 2, seed: 20261111 }, extra || {});
const CLOZE = /\{1:([A-Z]+):([^}]*)\}/g;

test('comprobador de XML: acepta lo bien formado y rechaza lo que no lo está', () => {
  assert.ok(X.check('<?xml version="1.0"?>\n<!-- c --><a x="1"><b>t &amp; u</b><c/><![CDATA[<x> & ]]></a>').ok);
  assert.ok(X.check('<a y="&#233;">\t&#xE9; &#x10000; ]] > <!-- - --></a>').ok);
  for (const bad of ['<a><b></a></b>', '<a>&</a>', '<a x="1" x="2"/>', '<a><![CDATA[x</a>', '<a/><b/>', '<a>', '<a x=1/>', '<!-- a -- b --><a/>',
    '<a>x ]]> y</a>', '<a>\u0001</a>', '<a>&#0;</a>', '<a>&#xFFFE;</a>', '<a x="&#1;"/>', '<a><!-- x ---></a>', '<a><![CDATA[\u0002]]></a>']) {
    assert.equal(X.check(bad).ok, false, bad);
  }
});

test('AC1: misma semilla y selección → el mismo banco, con cualquier reparto de pasos', () => {
  const a = M.toXml(M.generate(OPTS(), tr), tr);
  const r = M.runner(OPTS(), tr);
  let s; let steps = 0;
  do { s = r.step(1); steps++; } while (!s.done);
  assert.ok(steps > 20);
  assert.equal(M.toXml(r.result(), tr), a);
  const r2 = M.runner(OPTS(), tr);
  while (!r2.step(7).done);
  assert.equal(M.toXml(r2.result(), tr), a);
  assert.notEqual(M.toXml(M.generate(OPTS({ seed: 20261112 }), tr), tr), a);
});

test('AC1: el mismo banco en otro proceso de Node', () => {
  const code = `const M=require('./js/core/moodle.js');const tr=(k,p)=>(p?k+JSON.stringify(p):k);
    const o=${JSON.stringify(OPTS())};process.stdout.write(M.toXml(M.generate(o,tr),tr));`;
  const out = spawnSync(process.execPath, ['-e', code], { cwd: require('node:path').join(__dirname, '..'), encoding: 'utf8' });
  assert.equal(out.status, 0, out.stderr);
  assert.equal(out.stdout, M.toXml(M.generate(OPTS(), tr), tr));
});

test('AC1 y P3: el progreso y el número de ejemplares (1–50, 10 por defecto)', () => {
  const r = M.runner(OPTS({ stages: ['early', 'late'], levels: ['easy'], count: 3 }), tr);
  const first = r.step(1);
  assert.deepEqual([first.total, first.done], [6, false]);
  assert.ok(first.made <= 1);
  while (!r.step(5).done);
  assert.equal(r.result().questions.length, 6);
  assert.equal(M.runner(OPTS({ count: 0, stages: ['early'], levels: ['easy'] }), tr).step(1).total, 1);
  assert.equal(M.runner(OPTS({ count: 999, stages: ['early'], levels: ['easy'] }), tr).step(1).total, M.MAX_COUNT);
  assert.equal(M.runner(OPTS({ count: undefined, stages: ['early'], levels: ['easy'] }), tr).step(1).total, M.DEFAULT_COUNT);
  assert.equal(M.DEFAULT_COUNT, 10); assert.equal(M.MAX_COUNT, 50);
});

test('P3 y AC10: semillas sin repetir dentro de un nivel; lo que falta se dice', () => {
  // Con solo 60 semillas posibles y 100 preguntas pedidas, faltan: ninguna semilla se repite en el nivel.
  const bank = M.generate(OPTS({ stages: ['early', 'late'], levels: ['medium'], count: 50, seedMax: 60 }), tr);
  const seeds = bank.questions.map((q) => q.seed);
  assert.equal(new Set(seeds).size, seeds.length);
  assert.ok(seeds.every((s) => s >= 1 && s <= 60));
  const made = bank.missing.reduce((n, m) => n + m.made, 0) + (2 - bank.missing.length) * 50;
  assert.equal(made, bank.questions.length);
  assert.ok(bank.missing.length >= 1);
  for (const m of bank.missing) assert.deepEqual(Object.keys(m).sort(), ['level', 'made', 'stage', 'wanted']);
  // Pocos intentos: la 4b del fácil se queda corta y el banco sale con lo que hay.
  const short = M.generate(OPTS({ stages: ['critPath'], levels: ['easy'], count: 50, triesPer: 1 }), tr);
  assert.equal(short.missing.length, 1);
  assert.equal(short.missing[0].made, short.questions.length);
  assert.ok(short.questions.length < 50);
  // Las semillas de un nivel no dependen de qué otros niveles se marcan.
  const one = M.generate(OPTS({ levels: ['hard'], stages: ['early'] }), tr).questions.map((q) => q.seed);
  const all = M.generate(OPTS({ stages: ['early'] }), tr).questions.filter((q) => q.level === 'hard').map((q) => q.seed);
  assert.deepEqual(one, all);
});

test('AC6: XML bien formado, una categoría por pregunta de etapa y nivel, valor 1, nombre y semilla', () => {
  const bank = M.generate(OPTS({ sf: true }), tr);
  assert.equal(bank.questions.length, 7 * 3 * 2);
  const xml = M.toXml(bank, tr);
  assert.deepEqual(X.check(xml), { ok: true });
  const py = spawnSync('python3', ['-c', 'import sys,xml.dom.minidom; xml.dom.minidom.parseString(sys.stdin.buffer.read())'], { input: xml });
  if (!py.error) assert.equal(py.status, 0, String(py.stderr));
  assert.ok(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>\n<!-- '));
  assert.ok(xml.split('\n')[1].includes(`s=${bank.seed}`) && xml.split('\n')[1].includes(M.APP));
  const cats = [...xml.matchAll(/<category><text>([^<]*)<\/text><\/category>/g)].map((m) => m[1]);
  const want = M.LEVELS.flatMap((lv) => M.STAGES.map((st) => `$course$/top/root/stage.${st}/level.${lv}`));
  assert.deepEqual(cats, want);
  assert.equal((xml.match(/<question type="(cloze|multichoice)">/g) || []).length, bank.questions.length);
  assert.equal((xml.match(/<defaultgrade>1<\/defaultgrade>/g) || []).length, bank.questions.length);
  assert.equal((xml.match(/<penalty>0<\/penalty>/g) || []).length, bank.questions.length);
  for (const q of bank.questions) {
    assert.ok(xml.includes(`<name><text>${q.name}</text></name>`));
    assert.match(q.name, new RegExp(`s=${q.seed} · gv=${G.VERSION}$`));
  }
  assert.equal((xml.match(/<question type="multichoice">/g) || []).length, 3 * 2);
  assert.ok(/<single>false<\/single>/.test(xml) && /<shuffleanswers>1<\/shuffleanswers>/.test(xml));
  for (const f of xml.matchAll(/<answer fraction="([^"]*)"/g)) assert.ok(FRACTIONS.includes(f[1]), f[1]);
  assert.ok(/<tag><text>pnl-early<\/text><\/tag>/.test(xml));
});

test('AC6: los huecos del XML son los del modelo, sin caracteres reservados del cloze', () => {
  const bank = M.generate(OPTS(), tr);
  const xml = M.toXml(bank, tr);
  const body = (q) => xml.slice(xml.indexOf(`<name><text>${q.name}</text></name>`)).split('</question>')[0];
  for (const q of bank.questions) {
    const text = body(q).split('<generalfeedback')[0];
    const got = [...text.matchAll(CLOZE)];
    const want = Object.values(q.answers);
    assert.equal(got.length, want.length, q.name);
    got.forEach((m, i) => {
      if (m[1] === 'NUMERICAL') assert.equal(m[2], `=${want[i]}:0`);
      else {
        assert.equal(m[1], 'MULTICHOICE');
        assert.equal(m[2], want[i] === 'yes' ? '=yes~no' : 'yes~=no');
      }
    });
    assert.ok(!/\{1:[A-Z]+:[^}]*\}/.test(body(q).split('<generalfeedback')[1]), 'la retroalimentación no lleva huecos');
  }
  // Un texto con caracteres reservados del cloze o del XML queda escapado.
  const nasty = (k, p) => (k === 'yes' ? 'S}í#~/"\\' : k === 'stem.early' ? 'a ]]> b <c> & d' : tr(k, p));
  const one = M.toXml(M.generate(OPTS({ stages: ['early', 'critAct'], levels: ['easy'], count: 1 }), nasty), nasty);
  assert.deepEqual(X.check(one), { ok: true });
  assert.ok(one.includes('S\\}í\\#\\~\\/\\"\\\\'), 'el cloze escapa } # ~ / " \\');
  assert.ok(one.includes('a ]]&gt; b &lt;c&gt; &amp; d'));
  assert.equal(M.cdata('x ]]> y'), '<![CDATA[x ]]]]><![CDATA[> y]]>');
});

test('AC6: tablas ligeras con th y scope (P4)', () => {
  const xml = M.toXml(M.generate(OPTS({ stages: ['late'], levels: ['easy'], count: 1 }), tr), tr);
  assert.ok(xml.includes('<table class="table table-sm table-bordered" style="width:auto">'));
  assert.ok(xml.includes('<th scope="col">') && xml.includes('<th scope="row">'));
  assert.ok(!/<td style=/.test(xml));
  assert.ok(/<a href="[^"]*" target="_blank" rel="noopener">link.step<\/a>/.test(xml));
});

// ---------- T006: textos de verdad (i18n-moodle) ----------
test('AC8: banco inglés sin español y banco español sin inglés, con los textos de i18n-moodle', () => {
  const IM = require('../js/i18n-moodle.js');
  const bank = (lang, nota) => {
    const t = IM.tr(lang);
    return M.toXml(M.generate(OPTS({ lang, nota, labels: IM.labels(nota), sf: true, count: 1 }), t), t);
  };
  const enXml = bank('en', 'es'); const esXml = bank('es', 'en');
  // Fuera de los enlaces (dirección y parámetros) y de las etiquetas (identificadores), iguales en los dos idiomas.
  const words = (xml) => xml.replace(/href="[^"]*"/g, '').replace(/<tags>.*?<\/tags>/g, '');
  for (const w of ['Actividad', 'Duración', 'Predecesoras', 'Suceso', 'Holgura', 'Solución', 'ficticia', 'crítica', 'Sí', 'tempranos', 'Fácil', 'Redes de proyectos']) {
    assert.ok(!words(enXml).includes(w), `EN: ${w}`);
  }
  for (const w of ['Activity', 'Duration', 'Predecessors', 'Event', 'Slack', 'Solution', 'dummy', 'critical', 'Yes', 'Early', 'Easy', 'Project networks']) {
    assert.ok(!words(esXml).includes(w), `ES: ${w}`);
  }
  assert.ok(enXml.includes('$course$/top/Project networks/4b · Critical paths/Hard'));
  assert.ok(esXml.includes('$course$/top/Redes de proyectos/6 · Sucesos: tiempos tardíos y holguras/Fácil'));
  assert.ok(enXml.includes('{1:MULTICHOICE:=Yes~No}') || enXml.includes('{1:MULTICHOICE:Yes~=No}'));
  assert.ok(enXml.includes('<th scope="col">HT</th>'), 'notación española en el banco inglés');
  assert.deepEqual(X.check(enXml), { ok: true });
  // Ningún texto se queda en su clave (mq.…) ni con un parámetro sin sustituir.
  for (const xml of [enXml, esXml]) assert.ok(!/(^|[^\w])(stem|col|sol|fb|link|stage|level)\.[a-z]/i.test(words(xml).replace(/<name>.*?<\/name>/g, '')) && !/\{(dur|acts|paths|len|name)\}/.test(xml));
});

// ---------- T016: revisión de nivel 2 (lo que las pruebas aún no fijaban) ----------
// Tablas de un bloque de la retroalimentación general: la que tiene el encabezado h.
const solCol = (q, h) => {
  const t = q.general.filter((b) => b.table).find((b) => b.table.head.includes(h));
  if (!t) return null;
  const i = t.table.head.indexOf(h);
  return Object.fromEntries(t.table.rows.map((r) => [String(r[0]), r[i]]));
};
const paras = (blocks) => blocks.filter((b) => 'p' in b).map((b) => b.p);

for (const lv of M.LEVELS) {
  test(`T016: datos, enunciado y solución de cada etapa · ${lv}`, () => {
    for (let sd = 1; sd <= 12; sd++) {
      const ex = M.exercise(lv, sd);
      const { cpm, events, net, project } = ex.sol;
      const T = cpm.times; const F = cpm.floats; const D = cpm.duration; const A = ids(ex.sol);
      const N = net.events.map((e) => e.n);
      const byAct = (f) => Object.fromEntries(A.map((id) => [id, f(id)]));
      const byEv = (f) => Object.fromEntries(N.map((e) => [String(e), f(e)]));
      const dur = byAct((id) => project.activities.find((a) => a.id === id).d);
      const preds = byAct((id) => (project.preds[id].length ? project.preds[id].join(', ') : 'none'));
      const q = Object.fromEntries(M.STAGES.map((st) => [st, M.question(st, ex, ctx(), tr)]));
      const qsf = M.question('floats', ex, ctx({ sf: true }), tr);
      // Tabla de precedencias (duración y predecesoras) en las etapas 1–4.
      for (const st of ['early', 'late', 'floats', 'critAct', 'critPath']) {
        if (!q[st]) continue;
        assert.deepEqual(column(q[st], 'col.dur'), dur, `${st}: duración`);
        assert.deepEqual(column(q[st], 'col.preds'), preds, `${st}: predecesoras`);
      }
      // Enunciados, con la duración del proyecto donde la da (etapas 2, 4a y 4b).
      assert.equal(q.early.text[0].p, tr('stem.early'));
      assert.equal(q.late.text[0].p, tr('stem.late', { dur: D }));
      assert.equal(q.floats.text[0].p, tr('stem.floats'));
      assert.equal(qsf.text[0].p, tr('stem.floatsSf'));
      assert.equal(q.critAct.text[0].p, tr('stem.critAct', { dur: D }));
      if (q.critPath) assert.equal(q.critPath.text[0].p, tr('stem.critPath', { dur: D }));
      assert.equal(q.evEarly.text[0].p, tr('stem.evEarly'));
      assert.equal(q.evLate.text[0].p, tr('stem.evLate'));
      // Tabla de arcos: etiqueta, sucesos de origen y destino y duración, por orden de origen y destino.
      const want = [...net.arcs.map((a) => [a.act, a.from, a.to, dur[a.act]]), ...net.dummies.map((d) => [tr('dummy', { name: d.name }), d.from, d.to, 0])]
        .sort((x, y) => x[1] - y[1] || x[2] - y[2]);
      for (const st of ['evEarly', 'evLate']) {
        const rows = q[st].text.find((b) => b.table && b.table.arcs).table.rows;
        assert.deepEqual(rows.map((r) => r.join('|')).sort(), want.map((r) => r.join('|')).sort(), `${st}: arcos`);
        rows.forEach((r, i) => i && assert.ok(rows[i - 1][1] < r[1] || (rows[i - 1][1] === r[1] && rows[i - 1][2] <= r[2])));
        assert.deepEqual(q[st].text[1].table.head, ['col.arc', 'col.from', 'col.to', 'col.dur']);
      }
      // Solución de la retroalimentación general, etapa por etapa.
      for (const st of M.STAGES) if (q[st]) assert.equal(q[st].general[0].strong, 'sol.title');
      assert.deepEqual(solCol(q.early, 'ES'), byAct((id) => T[id].ES));
      assert.deepEqual(solCol(q.early, 'EF'), byAct((id) => T[id].EF));
      assert.deepEqual(paras(q.early.general), [`projectDur ${D}`]);
      assert.deepEqual(solCol(q.late, 'LS'), byAct((id) => T[id].LS));
      assert.deepEqual(solCol(q.late, 'LF'), byAct((id) => T[id].LF));
      for (const f of ['TF', 'FF', 'IF']) assert.deepEqual(solCol(q.floats, f), byAct((id) => F[id][f]), f);
      assert.equal(solCol(q.floats, 'SF'), null);
      for (const f of ['TF', 'FF', 'IF', 'SF']) assert.deepEqual(solCol(qsf, f), byAct((id) => F[id][f]), `sf ${f}`);
      const critTexts = [tr('sol.critical', { acts: cpm.critical.join(', ') }),
        tr('sol.paths', { paths: cpm.criticalPaths.map((p) => p.acts.join(' – ')).join('; '), dur: D })];
      assert.deepEqual(paras(q.critAct.general), critTexts);
      if (q.critPath) assert.deepEqual(paras(q.critPath.general), critTexts);
      assert.ok(cpm.critical.length > 0 && cpm.criticalPaths.length > 0);
      assert.deepEqual(solCol(q.evEarly, 'TE'), byEv((e) => events.TE[e]));
      assert.deepEqual(solCol(q.evLate, 'TL'), byEv((e) => events.TL[e]));
      assert.deepEqual(solCol(q.evLate, 'col.slack'), byEv((e) => events.slack[e]));
      assert.equal(solCol(q.evLate, 'TE'), null);
    }
  });
}

test('T016: los distractores de la 4b son los caminos no críticos más largos, hasta cuatro, con su retroalimentación', () => {
  let four = 0;
  for (const lv of M.LEVELS) {
    for (let sd = 1; sd <= 40; sd++) {
      const ex = M.exercise(lv, sd);
      const q = M.question('critPath', ex, ctx(), tr);
      if (!q) continue;
      const non = ex.paths.filter((p) => !p.critical)
        .sort((x, y) => y.length - x.length || x.acts.join(' ').localeCompare(y.acts.join(' ')));
      const k = Math.min(4, non.length);
      const bad = q.options.filter((o) => o.fraction.startsWith('-'));
      const good = q.options.filter((o) => !o.fraction.startsWith('-'));
      assert.deepEqual(bad.map((o) => o.path), non.slice(0, k).map((p) => p.acts.join(' – ')), `${lv} ${sd}`);
      bad.forEach((o, i) => assert.equal(o.feedback, tr('fb.pathNot', { len: non[i].length })));
      good.forEach((o) => assert.equal(o.feedback, tr('fb.pathCrit')));
      if (k === 4) four++;
    }
  }
  assert.ok(four > 30, `4 distractores en ${four} preguntas`);
});

test('T016: el XML lleva el texto y la retroalimentación de cada opción de la 4b', () => {
  const nasty = (k, p) => (k === 'fb.pathCrit' ? 'crit <b> & ]]>' : tr(k, p));
  const bank = M.generate(OPTS({ stages: ['critPath'], count: 3 }), nasty);
  const xml = M.toXml(bank, nasty);
  assert.deepEqual(X.check(xml), { ok: true });
  const un = (s) => s.replace(/^<!\[CDATA\[|\]\]>$/g, '').replace(/\]\]\]\]><!\[CDATA\[>/g, ']]>')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
  const blocks = xml.split('<question type="multichoice">').slice(1);
  assert.equal(blocks.length, bank.questions.length);
  blocks.forEach((b, i) => {
    const got = [...b.matchAll(/<answer fraction="([^"]*)" format="html">\s*<text>(.*?)<\/text>\s*<feedback format="html"><text>(.*?)<\/text><\/feedback>\s*<\/answer>/gs)]
      .map((m) => ({ fraction: m[1], path: un(m[2]), feedback: un(m[3]) }));
    assert.deepEqual(got, bank.questions[i].options);
  });
});

test('T016: el tope de intentos es triesPer × ejemplares por categoría (P3)', () => {
  // Con una sola semilla posible, la categoría hace 1 pregunta y se cierra tras triesPer × count intentos.
  const r = M.runner(OPTS({ stages: ['early'], levels: ['easy'], count: 5, triesPer: 3, seedMax: 1 }), tr);
  let steps = 0;
  while (!r.step(1).done) steps++;
  assert.equal(steps + 1, 15);
  assert.deepEqual(r.result().missing, [{ stage: 'early', level: 'easy', made: 1, wanted: 5 }]);
  // Con el tope por defecto (20 × 50), la 4b del fácil llega a los 50 ejemplares.
  const bank = M.generate(OPTS({ stages: ['critPath', 'early'], levels: ['easy'], count: 50, seed: 7 }), tr);
  assert.equal(M.TRIES_PER, 20);
  assert.equal(bank.questions.length, 100);
  assert.deepEqual(bank.missing, []);
});

test('T016: en una categoría no hay dos preguntas con la misma tabla', () => {
  const bank = M.generate(OPTS({ stages: ['early'], count: 50, seed: 4242 }), tr);
  for (const lv of M.LEVELS) {
    const rows = bank.questions.filter((q) => q.level === lv).map((q) => JSON.stringify(M.exercise(lv, q.seed).rows));
    assert.equal(rows.length, 50);
    assert.equal(new Set(rows).size, rows.length, lv);
  }
});

test('T016: textos del banco (i18n-moodle) aprobados en T006', () => {
  const IM = require('../js/i18n-moodle.js');
  const es = IM.tr('es'); const en = IM.tr('en');
  assert.deepEqual([es('yes'), es('no'), en('yes'), en('no')], ['Sí', 'No', 'Yes', 'No']);
  assert.deepEqual(M.LEVELS.map((l) => es(`level.${l}`)), ['Fácil', 'Media', 'Difícil']);
  assert.deepEqual(M.LEVELS.map((l) => en(`level.${l}`)), ['Easy', 'Medium', 'Hard']);
  assert.deepEqual(M.STAGES.map((s) => es(`stage.${s}`)), ['1 · Tiempos tempranos', '2 · Tiempos tardíos', '3 · Holguras',
    '4a · Actividades críticas', '4b · Caminos críticos', '5 · Sucesos: tiempos tempranos', '6 · Sucesos: tiempos tardíos y holguras']);
  assert.deepEqual(M.STAGES.map((s) => en(`stage.${s}`)), ['1 · Early times', '2 · Late times', '3 · Floats',
    '4a · Critical activities', '4b · Critical paths', '5 · Events: early times', '6 · Events: late times and slack']);
  assert.deepEqual([es('col.from'), es('col.to'), en('col.from'), en('col.to')], ['Suceso de origen', 'Suceso de destino', 'Start event', 'End event']);
  // Cada enunciado habla de lo que pide su etapa.
  const asks = { early: [/tempran/, /early/], late: [/tardío/, /late/], floats: [/holgura/, /float/], critAct: [/crítica/, /critical/],
    critPath: [/caminos críticos/, /critical paths/], evEarly: [/temprano de cada suceso/, /earliest time/], evLate: [/tardío y la holgura/, /latest time/] };
  for (const [st, [rEs, rEn]] of Object.entries(asks)) { assert.match(es(`stem.${st}`), rEs, st); assert.match(en(`stem.${st}`), rEn, st); }
  assert.doesNotMatch(es('stem.early'), /tardí/); assert.doesNotMatch(en('stem.early'), /late/);
  // Los parámetros de cada texto, los mismos en los dos idiomas y los que pasa core/moodle.
  const params = { 'stem.late': ['dur'], 'stem.critAct': ['dur'], 'stem.critPath': ['dur'], 'sol.critical': ['acts'],
    'sol.paths': ['dur', 'paths'], 'fb.pathNot': ['len'], dummy: ['name'] };
  const I = require('../js/i18n.js');
  const walk = (o, pre, out) => { for (const [k, v] of Object.entries(o)) { if (k === 'page') continue; if (typeof v === 'string') out[pre + k] = v; else walk(v, `${pre}${k}.`, out); } return out; };
  const keysOf = (s) => [...new Set([...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]))].sort();
  for (const lang of ['es', 'en']) {
    const all = walk(I.dict[lang].mq, '', {});
    for (const [k, s] of Object.entries(all)) assert.deepEqual(keysOf(s), params[k] || [], `${lang} ${k}`);
  }
  assert.equal(es('stem.late', { dur: 13 }), 'Con esta tabla y sus tiempos tempranos (la duración del proyecto es 13), calcula el comienzo tardío y el fin tardío de cada actividad.');
  assert.equal(en('fb.pathNot', { len: 33 }), 'It is not critical: it lasts 33.');
});

// ---------- F3c, T007: etapa «Enunciado → tabla» (spec f3c-enunciados, AC10; plan §3, P6) ----------
const SG = require('../js/core/stmtgen.js');
const MR_OK = ['100', '50', '33.33333', '25', '20', '16.66667', '14.28571', '12.5'];

test('F3c: las siete etapas de la F3b dan el mismo XML que antes de la F3c (huella)', () => {
  const IM = require('../js/i18n-moodle.js');
  const crypto = require('crypto');
  const HUELLA = {   // calculadas sobre 8795bb2, antes de tocar core/moodle
    '1|es|en': '0da0c9473af1bbd9c14e4aa99ead2e51b9efddd95ab94d71199ffbd9f6e7a97a',
    '123456789|en|es': 'b0d17bde6ed0360f88b71e11785348c28b53a3d4e7663f3bb6bcd3ce0b47023e',
    '4242|es|es': '17b1f6e0dfce114d5e98f947acad3932efdffee8e002c50c09fc1fe4c8f8efc3',
  };
  assert.deepEqual(M.STAGES, ['early', 'late', 'floats', 'critAct', 'critPath', 'evEarly', 'evLate']);
  for (const [k, h] of Object.entries(HUELLA)) {
    const [seed, lang, nota] = k.split('|');
    const bank = M.generate({ lang, nota, sf: true, labels: IM.labels(nota), stages: M.STAGES, levels: M.LEVELS, count: 2, seed: Number(seed) }, IM.tr(lang));
    assert.equal(crypto.createHash('sha256').update(M.toXml(bank, IM.tr(lang))).digest('hex'), h, k);
  }
});

test('F3c: la etapa stmt va al final y no mueve las semillas de las demás', () => {
  assert.deepEqual(M.STAGES_ALL, [...M.STAGES, 'stmt']);
  const o = { lang: 'es', nota: 'en', sf: false, labels: LABELS, levels: M.LEVELS, count: 2, seed: 77 };
  const seven = M.generate(Object.assign({}, o, { stages: M.STAGES }), tr).questions;
  const eight = M.generate(Object.assign({}, o, { stages: M.STAGES_ALL }), tr).questions;
  assert.deepEqual(eight.filter((q) => q.stage !== 'stmt').map((q) => q.name), seven.map((q) => q.name));
  assert.equal(eight.filter((q) => q.stage === 'stmt').length, 6);
});

const mrCells = (q) => q.text.filter((b) => b.table).flatMap((b) => b.table.rows.map((r) => r.find((c) => c && typeof c === 'object' && 'mr' in c)).filter(Boolean));

test('F3c: la pregunta stmt da el enunciado de stmtgen, una fila de casillas por actividad y la tabla de referencia como solución', () => {
  for (const lv of M.LEVELS) for (const sd of [3, 11, 40]) {
    const ex = M.exercise(lv, sd);
    const q = M.question('stmt', ex, ctx(), tr);
    const made = SG.make(sd, lv);
    assert.ok(q && made.ok);
    assert.deepEqual(q.category, [tr('root'), tr('stage.stmt'), tr(`level.${lv}`)]);
    assert.equal(q.qtype, 'cloze');
    assert.match(q.name, new RegExp(`s=${sd} · gv=${G.VERSION} · sv=${SG.VERSION}$`));
    const quote = q.text.find((b) => b.quote);
    assert.deepEqual(quote.quote, SG.render(made.def, 'es').split('\n').filter(Boolean));
    const preds = ex.sol.project.preds;
    const acts = ex.sol.project.activities.map((a) => a.id);
    const anc = (id) => { const s = new Set(); const go = (x) => preds[x].forEach((p) => { if (!s.has(p)) { s.add(p); go(p); } }); go(id); return s; };
    const cells = mrCells(q);
    assert.equal(cells.length, acts.length);
    cells.forEach((c, i) => {
      const id = acts[i];
      const P = preds[id];
      assert.deepEqual(c.mr.map((o) => o.label), [...acts.filter((x) => x !== id), tr('noneOpt')]);
      for (const o of c.mr) {
        // «ninguna» con predecesoras es una casilla falsa más, −100/c (plan §3; revisión de la F3c, F1).
        const fr = o.label === tr('noneOpt') ? (P.length ? `-${MR_OK[P.length - 1]}` : '100')
          : P.includes(o.label) ? MR_OK[P.length - 1] : anc(id).has(o.label) ? '0' : P.length ? `-${MR_OK[P.length - 1]}` : '-100';
        assert.equal(o.fraction, fr, `${lv}/${sd}/${id}/${o.label}`);
        assert.ok(['0', ...MR_OK, ...MR_OK.map((f) => `-${f}`)].includes(o.fraction));
      }
      assert.deepEqual(q.answers[c.key], [...P].sort());
    });
    // La solución de la retroalimentación y la columna de nombres son las de la tabla de referencia (revisión, F3).
    const refRows = made.def.ref.rows;
    const linksOf = (r) => (r.links ? r.links.split(',').map((x) => x.trim()).join(', ') : tr('none'));
    assert.deepEqual(q.general.find((b) => b.table).table.rows, refRows.map((r) => [r.id, r.name.es, linksOf(r)]));
    assert.deepEqual(q.text.find((b) => b.table).table.rows.map((r) => r.slice(0, 2)), refRows.map((r) => [r.id, r.name.es]));
    // Enlaces: el mismo enunciado en M0 y su ruta paso a paso.
    for (const [href, mm] of [[q.links.ex, 'practice'], [q.links.step, 'route']]) {
      const s = U.decode(href.slice(href.indexOf('#'))).state;
      assert.deepEqual([s.v, s.st, s.sd, s.lv, s.cx, s.sv, s.mm], ['m0', 'gen', sd, lv, made.ctx, SG.VERSION, mm]);
    }
    assert.deepEqual([q.links.exKey, q.links.stepKey], ['link.stmt', 'link.stmtRoute']);
  }
});

test('F3c (revisión, F3): en inglés, la cita, la columna de nombres y la solución van con los nombres en inglés', () => {
  const IM = require('../js/i18n-moodle.js');
  const t = IM.tr('en');
  for (const lv of M.LEVELS) {
    const q = M.question('stmt', M.exercise(lv, 11), { lang: 'en', nota: 'en', sf: false, labels: IM.labels('en') }, t);
    const made = SG.make(11, lv);
    assert.deepEqual(q.text.find((b) => b.quote).quote, SG.render(made.def, 'en').split('\n').filter(Boolean));
    const names = made.def.ref.rows.map((r) => [r.id, r.name.en]);
    assert.deepEqual(q.text.find((b) => b.table).table.rows.map((r) => r.slice(0, 2)), names);
    assert.deepEqual(q.general.find((b) => b.table).table.rows.map((r) => r.slice(0, 2)), names);
    assert.ok(made.def.ref.rows.every((r) => r.name.en !== r.name.es));
  }
});

test('F3c: un ejemplar sin enunciado posible se descarta; el XML lleva MULTIRESPONSE_H y está bien formado', () => {
  const many = Array.from({ length: 25 }, (_, i) => ({ id: `T${i}`, duration: '1', links: i ? `T${i - 1}` : '' }));
  assert.equal(M.question('stmt', M.fromRows(many), ctx(), tr), null);
  const IM = require('../js/i18n-moodle.js');
  for (const [lang, nota] of [['es', 'en'], ['en', 'es']]) {
    const t = IM.tr(lang);
    const xml = M.toXml(M.generate({ lang, nota, sf: false, labels: IM.labels(nota), stages: ['stmt'], levels: M.LEVELS, count: 1, seed: 5 }, t), t);
    assert.deepEqual(X.check(xml), { ok: true });
    assert.ok(/\{1:MULTIRESPONSE_H:%[-\d.]+%[A-Z0-9]+(~%[-\d.]+%[^~}]+)+\}/.test(xml));
    assert.ok(xml.includes('<blockquote>'));
    if (lang === 'en') {
      assert.ok(xml.includes('$course$/top/Project networks/0 · Statement → table/Medium'));
      assert.ok(!xml.includes('ninguna') && xml.includes('%none}'));
      assert.ok(!/Hay que|Cuando terminen|Desde el primer día/.test(xml));
    } else {
      assert.ok(xml.includes('$course$/top/Redes de proyectos/0 · Enunciado → tabla/Media'));
      assert.ok(xml.includes('%ninguna}'));
    }
  }
});
