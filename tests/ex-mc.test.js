'use strict';
// ex-mc y ex-mc-hand: «Montecarlo» en «Ejercicios» sin DOM (F3e, T011; AC6–AC10, AC13, AC18 y AC19; tableros 96–98 y
// 104). El ejercicio de cada variante (core/probgen), las respuestas del enlace (pa), la nota, los textos del nivel, las
// explicaciones de cada casilla, los gráficos con su alternativa en texto y los enlaces a la solución en M7, que abren el
// mismo proyecto con los mismos valores (H2). El dibujo, el teclado, Practicar y Examen los comprueban las pruebas de
// navegador. Referencias: los alumnos de los tableros 96 (Leer, semilla 2026, media), 97 (discretas) y 98 (réplicas).
const test = require('node:test');
const assert = require('node:assert/strict');
const GEN = require('../js/core/generator.js');
const PG = require('../js/core/probgen.js');
const PR = require('../js/core/probgrade.js');
const U = require('../js/core/urlstate.js');
const S = require('../js/core/sim.js');
const MC = require('../js/core/mc.js');
const CS = require('../js/views/chart-svg.js');
const I = require('../js/i18n.js');
const IM = require('../js/i18n-mc.js');
const XM = require('../js/ex-mc.js');
const XH = require('../js/ex-mc-hand.js');
const M7 = require('../js/m7.js');

const st = (o) => Object.assign(U.defaults(), { v: 'ex', xk: 'mc', lang: 'es' }, o);
const fracOf = (p) => { for (let d = 1; d <= 1000; d++) { const n = Math.round(p * d); if (Math.abs(n / d - p) < 1e-9) return d === 1 ? String(n) : `${n}/${d}`; } return String(p); };

// Los alumnos de los tableros.
function board96() {
  const ex = PG.read(2026, 'medium').ex;
  return { ex, ans: { pct: '40.4', pT: '0.85', crit: '1', 'q.mostCruc': '2', 'q.critLowCruc': '1', 'q.promise': '2' } };
}
function board97() {
  const ex = PG.disc(2026, 'medium').ex; const sol = PG.solve('disc', ex);
  const a = {};
  sol.combos.forEach((c, i) => { a[`c${i + 1}.T`] = String(c.T); a[`c${i + 1}.p`] = fracOf(c.p); });
  a['c6.T'] = '25';
  a.mean = sol.combos.reduce((s, c, i) => s + (i === 5 ? 25 : c.T) * c.p, 0).toFixed(3);
  a.pT = sol.pT.toFixed(3);
  for (const id of ex.disc) a[`${id}.crit`] = sol.crit[id].toFixed(3);
  return { ex, sol, ans: a };
}
function board98() {
  const ex = PG.rep(2026, 'medium').ex; const sol = PG.solve('rep', ex);
  const b = {};
  sol.reps.forEach((r, i) => { b[`r${i + 1}.T`] = String(r.T); b[`r${i + 1}.crit`] = r.crit.slice(); });
  b['r4.T'] = '24'; b['r3.crit'] = ['A', 'C', 'D'];
  const crit = Object.fromEntries(ex.rows.map((r) => [r.id, 0]));
  sol.reps.forEach((r, i) => (i === 2 ? ['A', 'C', 'D'] : r.crit).forEach((id) => { crit[id]++; }));
  b.pT = '0';
  for (const r of ex.rows) b[`${r.id}.crit`] = `${crit[r.id]}/${ex.n}`;
  return { ex, sol, ans: b };
}

test('T011 · el ejercicio de cada variante es el de probgen con la semilla y el nivel (o «Personalizar»); sin variante, «Leer» (AC11)', () => {
  for (const [lv, sd] of [['easy', 77], ['medium', 2026], ['hard', 3141]]) {
    for (const mv of XM.VARIANTS) {
      const r = XM.exercise(st({ sd, lv, mv }));
      assert.deepEqual(r, PG[mv](sd, lv), `${lv} ${sd} ${mv}`);
      assert.equal(r.ex.kind, mv);
    }
  }
  assert.deepEqual(XM.VARIANTS, ['read', 'disc', 'rep']);
  assert.equal(XM.variant(st({})), 'read');
  assert.equal(XM.variant(st({ mv: 'nope' })), 'read');
  const gp = { n: [8, 9], pred: 1.5, dummies: null, critical: [1, 2], dmax: 10 };
  assert.deepEqual(XM.exercise(st({ sd: 5, lv: 'custom', gp, mv: 'disc' })), PG.disc(5, gp));
  // A trozos, el mismo resultado; otra variante u otro nivel es otro ejercicio.
  const job = XM.job(st({ sd: 41, lv: 'hard', mv: 'read' }));
  while (!PG.step(job, { tries: 1 }).done);
  assert.deepEqual(PG.result(job).ex, PG.read(41, 'hard').ex);
  assert.notEqual(XM.exKey(st({ sd: 41, mv: 'read' })), XM.exKey(st({ sd: 41, mv: 'rep' })));
  // La solución de «Leer» es la de la búsqueda (no se vuelve a simular) y coincide con solve.
  const r = XM.exercise(st({ sd: 2026, lv: 'medium' }));
  assert.equal(XM.solution(r.ex), r.sol);
  assert.equal(XM.solution(r.ex).pT, PG.solve('read', r.ex).pT);
});

test('T011 · respuestas del enlace: casillas como texto, la opción por su posición y las críticas de una réplica en el orden de la tabla (pa)', () => {
  const ex = PG.rep(2026, 'medium').ex;
  let pa = XM.setField(null, 'r1.T', ' 27 ');
  assert.deepEqual(pa, { 'r1.T': ' 27 ' }, 'el texto, tal cual (constitución, 22)');
  pa = XM.setMark(pa, ex, 'r1.crit', 'J', true);
  pa = XM.setMark(pa, ex, 'r1.crit', 'B', true);
  pa = XM.setMark(pa, ex, 'r1.crit', 'G', true);
  assert.deepEqual(pa['r1.crit'], ['B', 'G', 'J'], 'en el orden de las filas');
  pa = XM.setMark(pa, ex, 'r1.crit', 'G', false);
  assert.deepEqual(pa['r1.crit'], ['B', 'J']);
  pa = XM.setField(pa, 'E.crit', '2/8');
  assert.deepEqual(U.cleanPa(pa, 'rep'), pa, 'cabe en la clave pa');
  assert.equal(XM.setMark(XM.setMark(null, ex, 'r2.crit', 'A', true), ex, 'r2.crit', 'A', false), null, 'sin nada, nada');
  assert.equal(XM.setField(null, 'mean', '123456789').mean, '12345678', 'recortado al largo del enlace');
  const read = PG.read(2026, 'medium').ex;
  const qa = XM.setField(null, 'q.promise', String(2));
  assert.deepEqual(U.cleanPa(qa, 'read'), { 'q.promise': '2' });
  assert.equal(PR.read(read, qa).cells['q.promise'].status, 'ok');
  assert.deepEqual(XM.answers(st({ pa: { 'r1.crit': ['A'] } })), { 'r1.crit': ['A'] });
  assert.deepEqual(XM.answers(st({})), {});
});

test('T011 · las notas de los tableros 96, 97 y 98, como probgrade (AC6–AC8)', () => {
  const b6 = board96();
  const g6 = XM.grade(b6.ex, b6.ans);
  assert.deepEqual(g6, PR.read(b6.ex, b6.ans));
  assert.deepEqual([g6.score.got, g6.score.total, g6.score.pct], [4, 6, 66.7]);
  assert.equal(XM.scoreText(g6, 'es'), 'Nota: 66,7 % (4 de 6)');
  assert.equal(XM.countText(g6, 'es'), '2 incorrectas');
  const b7 = board97();
  const g7 = XM.grade(b7.ex, b7.ans);
  assert.deepEqual(g7, PR.disc(b7.ex, b7.ans));
  assert.deepEqual([g7.score.got, g7.score.total], [20, 21]);
  assert.equal(g7.cells['c6.T'].status, 'wrong');
  assert.equal(g7.cells.mean.status, 'carried', 'E[T] con sus combinaciones (error consecuente)');
  assert.equal(XM.scoreText(g7, 'en'), 'Score: 95.2% (20 of 21)');
  assert.equal(XM.countText(g7, 'en'), '1 wrong · 1 with a carried error');
  const b8 = board98();
  const g8 = XM.grade(b8.ex, b8.ans);
  assert.deepEqual(g8, PR.rep(b8.ex, b8.ans));
  assert.deepEqual([g8.score.got, g8.score.total, g8.score.pct], [25, 27, 92.6]);
  for (const k of ['pT', 'E.crit']) assert.equal(g8.cells[k].status, 'carried', k);
  assert.equal(XM.countText(g8, 'es'), '2 incorrectas · 2 con error consecuente');
});

test('T011 · explicaciones de «Leer»: lo que se lee en los gráficos, con su tolerancia, y la respuesta de cada pregunta (AC10)', () => {
  const { ex, ans } = board96();
  const g = XM.grade(ex, ans);
  const sol = XM.solution(ex);
  const E = (k, lang = 'es', a = ans, gg = g) => XM.explain(ex, a, gg, k, lang);
  assert.equal(E('pct'), '', 'una casilla correcta no se explica');
  assert.equal(E('pT'), 'Has escrito 0,85. La función de distribución corta la línea discontinua del plazo hacia 0,94; se acepta ±0,05.');
  assert.equal(E('pT', 'en'), 'You wrote 0.85. The distribution function crosses the dashed deadline line at about 0.94; within ±0.05 is right.');
  assert.equal(E('q.critLowCruc'), 'La respuesta es A: es crítica a menudo (criticidad 1,00), pero su crucialidad es baja (0,00): su duración varía poco o casi no mueve la del proyecto.');
  const bad = { pct: '30', crit: '0,2', 'q.mostCruc': '0', 'q.promise': '0' };
  const gb = XM.grade(ex, bad);
  assert.equal(E('pct', 'es', bad, gb), `Has escrito 30. La función de distribución llega a 0,80 hacia 40,39: ese es el percentil 80. Se acepta ± una clase del histograma (${String(Math.round(sol.classW * 100) / 100).replace('.', ',')}).`);
  assert.equal(E('crit', 'en', bad, gb), `You wrote 0.2. In the tornado, the criticality bar of H reaches about ${sol.act.crit.toFixed(2)} (the share of runs in which it is critical); within ±0.05 is right.`);
  assert.equal(E('q.mostCruc', 'en', bad, gb), 'The answer is G: its cruciality bar is the longest (0.71); the next one is that of D (0.42).');
  assert.equal(E('q.promise', 'es', bad, gb), 'La respuesta es 41,4: con un 90 % de confianza se promete el percentil 90 de la simulación, donde la función de distribución llega a 0,9.');
  assert.equal(E('pT', 'es', bad, gb), I.t('es', 'ex.explain.blank'));
  // Las preguntas: el texto y las opciones (los plazos, con un decimal; la normal, con su texto).
  assert.deepEqual(ex.questions.map((q) => XM.question(ex, q, 'es').options), [['C', 'D', 'G', 'H'], ['A', 'C', 'F', 'H'], ['38,6', '40,0', '41,4', '43,8']]);
  assert.equal(XM.question(ex, ex.questions[2], 'en').text, 'Which deadline would you promise with 90% confidence?');
  // Las cinco preguntas tienen texto y explicación en los dos idiomas (en ejercicios que las tengan).
  const seen = new Set();
  for (const sd of [3, 41, 1009, 2026, 7]) {
    for (const lv of ['easy', 'medium', 'hard']) {
      const e = PG.read(sd, lv).ex;
      for (const q of e.questions) {
        const wrong = (q.options.indexOf(q.correct) + 1) % q.options.length;
        const a = { [`q.${q.key}`]: String(wrong) };
        const gq = XM.grade(e, a);
        for (const lang of ['es', 'en']) {
          const text = XM.explain(e, a, gq, `q.${q.key}`, lang);
          assert.ok(text && !/\{\w+\}/.test(text), `${q.key} ${lang}: ${text}`);
          const qq = XM.question(e, q, lang);
          assert.ok(!/\{\w+\}/.test(qq.text) && qq.options.length === q.options.length);
        }
        seen.add(q.key);
      }
    }
  }
  for (const k of ['mostCrit', 'mostCruc', 'critLowCruc', 'normal', 'promise']) assert.ok(seen.has(k), k);
  const norm = PG.read(2026, 'hard').ex;
  const qn = norm.questions.find((q) => q.key === 'normal');
  assert.deepEqual(XM.question(norm, qn, 'es').options, ['Optimista: da más probabilidad; olvida los caminos que se funden', 'Pesimista: da menos probabilidad', 'Casi igual']);
  assert.equal(XM.label(ex, 'pct', 'es'), 'Percentil 80 de la duración');
  assert.equal(XM.label(ex, 'crit', 'en'), 'Criticality of H');
  assert.equal(XM.label(ex, 'q.promise', 'es'), 'El plazo del 90 %');
});

test('T011 · explicaciones de las discretas: la T y la p de una combinación con sus valores; E[T] y P con error consecuente; la criticidad (AC7, AC10)', () => {
  const { ex, sol, ans } = board97();
  const g = XM.grade(ex, ans);
  const E = (k, lang = 'es', a = ans, gg = g) => XM.explain(ex, a, gg, k, lang);
  assert.equal(E('c6.T'), 'Has escrito 25. Con G = 8, I = 2 y J = 8, el proyecto dura 27; las actividades críticas son B, G, H, I y J.');
  assert.equal(E('c6.T', 'en'), 'You wrote 25. With G = 8, I = 2 and J = 8, the project takes 27; the critical activities are B, G, H, I and J.');
  assert.equal(E('mean'), I.t('es', 'ex.explain.carried', { v: '25,037', e: '25,037', lab: 'E[T]', calc: 'Σ T · p de tus combinaciones',
    origin: I.t('es', 'ex.explain.origin', { lab: 'T de la combinación 6' }) }));
  assert.equal(E('c1.T'), '');
  const bad = Object.assign({}, ans, { 'c2.p': '0,5', pT: '0,5', 'G.crit': '0,5' });
  const gb = XM.grade(ex, bad);
  assert.equal(E('c2.p', 'es', bad, gb), 'Has escrito 0,5. Las duraciones son independientes: p = 1/3 · 1/3 · 1/3 = 1/27.');
  assert.equal(E('G.crit', 'es', bad, gb), 'Has escrito 0,5. G es crítica en 4 de las 8 combinaciones (los empates cuentan); la suma de sus p es 0,667.');
  assert.match(E('pT', 'es', bad, gb), /P\(T ≤ 27\) = Σ p de tus combinaciones con T ≤ 27/);
  // Una fracción escrita se enseña tal cual.
  const fr = Object.assign({}, ans, { 'c2.p': '2/27' });
  assert.match(E('c2.p', 'en', fr, XM.grade(ex, fr)), /^You wrote 2\/27\./);
  assert.equal(XM.label(ex, 'c6.T', 'es'), 'T de la combinación 6');
  assert.equal(XM.label(ex, 'c6.p', 'en'), 'p of combination 6');
  assert.equal(XM.label(ex, 'G.crit', 'es'), 'criticidad de G');
  assert.equal(sol.combos.length, 8);
  // Klastorin discreto (AC7): 36 combinaciones, la explicación de una con sus valores.
  const kd = PG.fromExample('kd', { deadline: 20 });
  const ks = PG.solve('disc', kd);
  const ka = { 'c1.T': '1' };
  const kg = PR.disc(kd, ka, ks);
  assert.match(XM.explain(kd, ka, kg, 'c1.T', 'es'), new RegExp(`el proyecto dura ${ks.combos[0].T};`));
});

test('T011 · explicaciones de las réplicas: la T de una réplica, las críticas que faltan o sobran y las estimaciones con sus T y sus marcas (AC8, AC10)', () => {
  const { ex, sol, ans } = board98();
  const g = XM.grade(ex, ans);
  const E = (k, lang = 'es', a = ans, gg = g) => XM.explain(ex, a, gg, k, lang);
  assert.equal(E('r4.T'), `Has escrito 24. Con las duraciones de la réplica 4, el camino más largo dura ${sol.reps[3].T}; las actividades críticas son ${I.list('es', sol.reps[3].crit)}.`);
  assert.equal(E('r3.crit'), 'Las críticas de la réplica 3 son A, C, D y E (holgura 0, empates incluidos). Falta E.');
  assert.equal(E('r3.crit', 'en'), 'The critical activities of run 3 are A, C, D and E (zero slack, ties included). E is missing.');
  assert.equal(E('pT'), I.t('es', 'ex.explain.carried', { v: '0', e: '0', lab: 'P(T ≤ 23)', calc: '0/8', origin: I.t('es', 'ex.explain.origin', { lab: 'T de la réplica 4' }) }));
  assert.equal(E('E.crit'), I.t('es', 'ex.explain.carried', { v: '2/8', e: '0,25', lab: 'criticidad de E', calc: '2/8', origin: I.t('es', 'ex.explain.origin', { lab: 'críticas de la réplica 3' }) }));
  const extra = Object.assign({}, ans, { 'r3.crit': ['A', 'C', 'D', 'E', 'F', 'G'] });
  assert.equal(E('r3.crit', 'es', extra, XM.grade(ex, extra)), 'Las críticas de la réplica 3 son A, C, D y E (holgura 0, empates incluidos). Sobran F y G.');
  assert.equal(XM.label(ex, 'r3.crit', 'es'), 'críticas de la réplica 3');
  assert.equal(XM.label(ex, 'r4.T', 'en'), 'T of run 4');
});

test('T011 · nivel de cada variante, semilla usada (H9) y textos sin parámetros sueltos', () => {
  assert.equal(XM.levelText(GEN.LEVELS.medium, 'medium', 'read', 'es'), 'beta-PERT en todas las actividades · 10 000 réplicas');
  assert.equal(XM.levelText(GEN.LEVELS.easy, 'easy', 'disc', 'es'), '2 actividades discretas · 4 combinaciones');
  assert.equal(XM.levelText(GEN.LEVELS.medium, 'medium', 'disc', 'en'), '2 or 3 discrete activities · 8 or 9 combinations');
  assert.equal(XM.levelText(GEN.LEVELS.hard, 'hard', 'disc', 'es'), '3 o 4 actividades discretas · de 12 a 36 combinaciones');
  assert.equal(XM.levelText(GEN.LEVELS.hard, 'hard', 'rep', 'en'), '10 runs');
  assert.equal(XM.levelText(GEN.LEVELS.medium, 'custom', 'rep', 'es'), '8 réplicas', '«Personalizar», como el medio');
  const r = PG.read(2026, 'medium');
  assert.equal(r.info.sdUsed, 2027);
  assert.equal(XM.movedText(r, 'es'), 'Se usa la tabla de la semilla 2027: la de la semilla 2026 no sirve para este ejercicio.');
  assert.equal(XM.movedText(PG.rep(2026, 'medium'), 'es'), '');
});

test('T011 · «Leer»: los gráficos de chart-svg con los datos de la simulación, sus textos en el idioma y su alternativa en texto (AC6, AC19)', () => {
  const { ex } = board96();
  const sol = XM.solution(ex);
  for (const lang of ['es', 'en']) {
    const c = XM.charts(ex, lang);
    const dec = lang === 'es' ? ',' : '.';
    const L = (k, p) => I.t(lang, `mx.chart.${k}`, p);
    assert.equal(c.dist.svg, CS.dist({ durations: sol.sorted, deadline: 42, dec, title: L('dist'), desc: L('distDesc'),
      labels: { deadline: L('deadline', { d: '42' }), x: L('x'), hist: L('hist'), cdf: L('cdf') } }));
    const rows = ex.tcl.rows.map((r) => ({ id: r.id, crit: sol.crit[r.id], cruc: sol.cruc[r.id] }));
    assert.equal(c.idx.svg, CS.indices({ rows, dec, title: L('idx'), desc: L('idxDesc'), labels: { crit: L('crit'), cruc: L('cruc') } }));
    assert.deepEqual(c.table, CS.table(sol.sorted));
    assert.deepEqual(c.itable, CS.indexTable(rows));
    assert.equal(c.dist.title, L('dist'));
  }
  assert.match(XM.charts(ex, 'es').dist.svg, /Plazo = 42/);
  assert.match(XM.charts(ex, 'en').dist.svg, /Project duration \(weeks\)/);
});

test('T011 · «Ver la solución en M7»: la misma tabla; en M7 salen los mismos valores (Leer con su semilla y 10 000 réplicas, H2; discretas con la cuenta exacta; réplicas con su sorteo)', () => {
  const lang = 'en';
  // Leer
  const { ex } = board96();
  const sol = XM.solution(ex);
  let r = U.decode(XM.m7Hash(ex, st({ lang, nota: 'es' })));
  assert.equal(r.warning, undefined);
  assert.deepEqual([r.state.v, r.state.um, r.state.ue, r.state.us, r.state.ur, r.state.ud, r.state.uv, r.state.lang, r.state.nota],
    ['unc', 'm7', 'own', ex.sim.us, 4, 42, 80, 'en', 'es']);
  let m = M7.model(r.state, lang);
  assert.equal(m.ok, true);
  const res = S.run({ kind: 'project', model: m.sim.model, n: m.sim.n, us: m.sim.us, track: true });
  const out = M7.results(m, res);
  assert.equal(out.pT, sol.pT);
  assert.equal(MC.percentile(Float64Array.from(res.durations).sort(), 0.8), sol.pct.value);
  // Discretas: las fijas y las discretas con sus valores; M7 da la cuenta exacta.
  const b7 = board97();
  r = U.decode(XM.m7Hash(b7.ex, st({ lang })));
  assert.equal(r.warning, undefined);
  assert.deepEqual(Object.keys(r.state.uf).sort(), b7.ex.disc.slice().sort());
  m = M7.model(r.state, lang);
  assert.equal(m.ok, true);
  assert.ok(Math.abs(m.exact.mean - b7.sol.mean) < 1e-12);
  assert.ok(Math.abs(m.exact.pLE(b7.ex.deadline) - b7.sol.pT) < 1e-12);
  const kd = PG.fromExample('kd', { deadline: 20 });
  m = M7.model(U.decode(XM.m7Hash(kd, st({ lang }))).state, lang);
  assert.ok(Math.abs(m.exact.mean - 23.248) < 0.001, 'Klastorin discreto');
  // Réplicas: «Réplica a réplica» con su semilla; las duraciones redondeadas son las del ejercicio.
  const b8 = board98();
  r = U.decode(XM.m7Hash(b8.ex, st({ lang })));
  assert.deepEqual([r.state.uy, r.state.us, r.state.ud], ['rep', b8.ex.us, b8.ex.deadline]);
  m = M7.model(r.state, lang);
  const rr = S.run({ kind: 'project', model: m.sim.model, n: m.sim.n, us: m.sim.us, track: true });
  const pos = Object.fromEntries(m.sim.model.acts.map((a, i) => [a.id, i]));
  for (let k = 0; k < b8.ex.n; k++) {
    const tr = MC.replicaTrace(rr, m.sim.model, k);
    b8.ex.rows.forEach((x, i) => assert.equal(b8.ex.reps[k][i], Math.round(tr.d[pos[x.id]]), `${x.id}, réplica ${k + 1}`));
  }
});

test('T011 · los textos de Montecarlo (i18n-mc) están en los dos idiomas, con los mismos parámetros; una etiqueta por campo de probgrade', () => {
  const keysDeep = (o, p = '') => Object.entries(o).flatMap(([k, v]) => (v && typeof v === 'object' ? keysDeep(v, `${p}${k}.`) : [`${p}${k}`])).sort();
  const params = (v) => (String(v).match(/\{\w+\}/g) || []).sort();
  const get = (o, k) => k.split('.').reduce((a, p) => a[p], o);
  assert.deepEqual(keysDeep(IM.es), keysDeep(IM.en));
  for (const k of keysDeep(IM.es)) assert.deepEqual(params(get(IM.es, k)), params(get(IM.en, k)), `mx.${k}`);
  for (const lang of I.languages) assert.equal(I.dict[lang].mx, IM[lang]);
  for (const q of PG.QUESTIONS) for (const lang of I.languages) { assert.ok(IM[lang].q[q], q); assert.ok(IM[lang].lab.q[q], q); }
  for (const [kind, ex] of [['read', board96().ex], ['disc', board97().ex], ['rep', board98().ex]]) {
    for (const k of PR.fields(kind, ex)) {
      for (const lang of I.languages) {
        const l = XM.label(ex, k, lang);
        assert.ok(l && !/\{\w+\}|^mx\./.test(l), `${kind} ${k} ${lang}: ${l}`);
      }
    }
  }
  assert.equal(XH.label(board98().ex, 'pT', 'es'), 'P(T ≤ 23)');
});

// ---------- F3e T021: arreglos de la revisión de nivel 2 (ronda 1) ----------

test('T021 N-F3 · discretas: la criticidad con error consecuente se explica con la suma de sus p (fácil 49; y con una p mal)', () => {
  const ex = PG.disc(49, 'easy').ex; const sol = PG.solve('disc', ex);
  const a = {};
  sol.combos.forEach((c, i) => { a[`c${i + 1}.T`] = String(c.T); a[`c${i + 1}.p`] = c.p.toFixed(3); });
  a['A.crit'] = '0,814';
  const g = XM.grade(ex, a);
  assert.equal(g.cells['A.crit'].status, 'carried');
  assert.equal(XM.explain(ex, a, g, 'A.crit', 'es'), I.t('es', 'ex.explain.carried', { v: '0,814', e: '0,814', lab: 'criticidad de A',
    calc: 'Σ p de tus combinaciones en que A es crítica', origin: '' }));
  assert.equal(XM.explain(ex, a, g, 'A.crit', 'en'), I.t('en', 'ex.explain.carried', { v: '0.814', e: '0.814', lab: 'criticality of A',
    calc: 'Σ p of your combinations in which A is critical', origin: '' }));
  // Con la p de la combinación 1 mal (A es crítica en ella): carried desde esa p; mal con sus p, la suma con las suyas.
  const b = Object.assign({}, a, { 'c1.p': '0,163', 'A.crit': '0,914' });
  const gb = XM.grade(ex, b);
  assert.equal(gb.cells['A.crit'].status, 'carried');
  assert.equal(XM.explain(ex, b, gb, 'A.crit', 'es'), I.t('es', 'ex.explain.carried', { v: '0,914', e: '0,914', lab: 'criticidad de A',
    calc: 'Σ p de tus combinaciones en que A es crítica', origin: I.t('es', 'ex.explain.origin', { lab: 'p de la combinación 1' }) }));
  const w = Object.assign({}, b, { 'A.crit': '0,5' });
  assert.equal(XM.explain(ex, w, XM.grade(ex, w), 'A.crit', 'es'), I.t('es', 'ex.explain.wrong', { v: '0,5', e: '0,914', lab: 'criticidad de A',
    calc: 'Σ p de tus combinaciones en que A es crítica' }));
  // Sin ninguna p mal y mal: cuántas combinaciones y la suma de la solución (tablero 97).
  const v = Object.assign({}, a, { 'A.crit': '0,5' });
  assert.equal(XM.explain(ex, v, XM.grade(ex, v), 'A.crit', 'es'), 'Has escrito 0,5. A es crítica en 3 de las 4 combinaciones (los empates cuentan); la suma de sus p es 0,813.');
});

test('T021 I-F1 · explicaciones de «Leer»: la más crítica (con el empate de la siguiente, B y D) y la normal frente a la simulación', () => {
  const wrongOf = (ex, key) => { const q = ex.questions.find((x) => x.key === key); return { [`q.${key}`]: String((q.options.indexOf(q.correct) + 1) % q.options.length) }; };
  const E = (ex, key, lang) => { const a = wrongOf(ex, key); return XM.explain(ex, a, XM.grade(ex, a), `q.${key}`, lang); };
  const e1 = PG.read(1, 'easy').ex;
  // Criticidad, no crucialidad (A 1,00; la de crucialidad sería 0,65); B y D empatan a 0,59: la siguiente, B (orden natural).
  assert.equal(E(e1, 'mostCrit', 'es'), 'La respuesta es A: su barra de criticidad es la más larga (1,00); la siguiente es la de B (0,59).');
  assert.equal(E(e1, 'mostCrit', 'en'), 'The answer is A: its criticality bar is the longest (1.00); the next one is that of B (0.59).');
  const e2 = PG.read(2026, 'hard').ex;
  assert.equal(E(e2, 'normal', 'es'), 'La respuesta es «Optimista: da más probabilidad; olvida los caminos que se funden»: la normal del TCL da P(T ≤ 41) = 0,84 y la simulación, 0,65. La normal solo mira el camino crítico de las medias; los caminos que se funden con él alargan el proyecto.');
  assert.equal(E(e2, 'normal', 'en'), 'The answer is «Optimistic: higher probability; it ignores merging paths»: the CLT normal gives P(T ≤ 41) = 0.84 and the simulation 0.65. The normal only looks at the critical path of the means; the paths that merge with it make the project longer.');
});
