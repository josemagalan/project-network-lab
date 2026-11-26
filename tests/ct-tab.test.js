'use strict';
// js/ct: la parte sin DOM del controlador de la pestaña de coste–tiempo (spec f5b-coste-tiempo, AC8 y AC9; plan §4, P1; T010).
const test = require('node:test');
const assert = require('node:assert/strict');
const T = require('../js/ct.js');
const U = require('../js/core/urlstate.js');
const X = require('../js/core/crashex.js');

const st = (extra) => Object.assign(U.defaults(), { v: 'ct' }, extra);
const row = (id, links, dn, dc, cn, cc) => ({ id, name: '', links, dn, dc, cn, cc });

test('F5b T010: un ejemplo da su tabla, su fuente, sus unidades y sus costes del proyecto', () => {
  const m = T.model(st({ ke: 'ni' }), 'es');
  assert.deepEqual([m.src.kind, m.src.id, m.src.unit, m.src.costUnit], ['example', 'ni', 'semanas', 'miles de dólares']);
  assert.equal(m.p.activities.length, 7);
  assert.deepEqual(m.k, X.get('ni').k);
  assert.equal(m.edited, false);
  // Un ejemplo que no existe: el primero.
  assert.equal(T.model(st({ ke: 'nada' }), 'en').src.id, 'kl');
});

test('F5b T010: los costes escritos (kc) mandan sobre los del ejemplo; la tabla propia sin kc no tiene costes', () => {
  const kc = { fixed: 1, perUnit: null, due: null, penalty: null, bonus: null };
  assert.deepEqual(T.model(st({ ke: 'kl', kc }), 'es').k, kc);
  assert.equal(T.model(st({ ke: 'kl', kc }), 'es').edited, true);
  const own = T.model(st({ ke: 'own', kt: [row('A', '', '3', '2', '1', '2')] }), 'es');
  assert.deepEqual(own.k, { fixed: null, perUnit: null, due: null, penalty: null, bonus: null });
  assert.equal(own.src.title, 'Tabla propia');
});

test('F5b T010: marcas de la tabla propia: campos con error, avisos y el texto de cada uno, en los dos idiomas', () => {
  const kt = [row('A', '', '7', '5', '60', '76'), row('B', '', '6', '7', '85', '95'), row('C', 'A, B', '15', '13', '55', '45'), row('D', 'B', '10', '', '', ''), row('E', 'Z', '4.5', '2', 'x', '1')];
  for (const lang of ['es', 'en']) {
    const m = T.model(st({ ke: 'own', kt }), lang);
    const mk = T.rowMarks(m, lang);
    assert.deepEqual([...mk.rows.get(1).bad], ['dc']);
    assert.deepEqual([...mk.rows.get(2).bad], ['cc']);
    assert.deepEqual([...mk.rows.get(3).warn], ['dc', 'cn', 'cc']);
    assert.deepEqual([...mk.rows.get(4).bad].sort(), ['cn', 'cc', 'dn', 'links'].sort());
    assert.deepEqual(mk.badRows, ['B', 'C', 'E']);
    for (const r of mk.rows.values()) for (const x of r.msgs) assert.ok(x.text && !/^ct\./.test(x.text), x.text);
  }
  assert.match(T.issueText({ code: 'noCrash', ids: ['D'] }, 'es'), /^Sin punto urgente: D/);
  assert.match(T.issueText({ code: 'cycle', ids: ['A', 'B'] }, 'en'), /A, B/);
});

test('F5b T010: pegar filas (con o sin cabecera) y leer un coste escrito', () => {
  assert.deepEqual(T.pasteRows('Act\tName\tPred\tNormal\tCrash\tCn\tCc\nA\tUno\t\t7\t5\t60\t76\nB\t\tA\t6\t4\t85\t95'),
    [{ id: 'A', name: 'Uno', links: '', dn: '7', dc: '5', cn: '60', cc: '76' }, { id: 'B', name: '', links: 'A', dn: '6', dc: '4', cn: '85', cc: '95' }]);
  assert.deepEqual(T.pasteRows('A;;;3;2;1;2'), [{ id: 'A', name: '', links: '', dn: '3', dc: '2', cn: '1', cc: '2' }]);
  assert.deepEqual(T.pasteRows('  \n'), []);
  assert.equal(T.parseCost(''), null);
  assert.equal(T.parseCost(' 12,5 '), 12.5);
  assert.equal(T.parseCost('7'), 7);
  for (const bad of ['x', '-1', '1e3', '1,23456']) assert.equal(T.parseCost(bad), undefined, bad);
  assert.deepEqual(T.workRows([{ id: 'A', duration: 3, links: 'B' }]), [{ id: 'A', name: '', duration: '3', links: 'B' }]);
});

// ---------- T011: tabla de la compresión, curva y duración elegida (AC6, AC10; tableros 123, 125 y 127) ----------

const CH = require('../js/views/ct-chart.js');

test('F5b T011 · AC6: la compresión de Klastorin, fila a fila: regla, óptimo y totales, con el mínimo a 19 semanas (Tema 6c, diapositivas 10–16)', () => {
  const m = T.model(st({ ke: 'kl' }), 'es');
  const c = T.compression(m);
  assert.deepEqual(c.rows.map((r) => r.T), [22, 21, 20, 19, 18]);
  assert.deepEqual(c.rows.map((r) => r.rule), [320, 328, 338, 348, 361]);
  assert.deepEqual(c.rows.map((r) => r.opt), [320, 328, 338, 348, 361]);
  assert.deepEqual(c.rows.map((r) => r.tot.total), [489, 485, 483, 481, 487]);
  assert.deepEqual(c.rows.map((r) => r.set), [[], ['A'], ['C'], ['C'], ['A', 'B']]);
  assert.deepEqual([c.best, c.hasCosts, c.normalT, c.minT], [[19], true, 22, 18]);
  assert.equal(c.rows.some((r) => r.above), false);
  assert.match(c.end.path.join('–'), /A–C/);
  // La misma tabla para el mismo proyecto y costes: se calcula una vez.
  assert.equal(T.compression(T.model(st({ ke: 'kl' }), 'en')), c);
});

test('F5b T011 · AC10: la duración elegida: kd, o la de coste total mínimo, dentro de [mínima, normal]', () => {
  const c = T.compression(T.model(st({ ke: 'kl' }), 'es'));
  assert.equal(T.chosenT(st({ ke: 'kl' }), c), 19);
  assert.equal(T.chosenT(st({ ke: 'kl', kd: 21 }), c), 21);
  assert.equal(T.chosenT(st({ ke: 'kl', kd: 40 }), c), 22);
  assert.equal(T.chosenT(st({ ke: 'kl', kd: 3 }), c), 18);
  // Nicholas: 20 semanas (129); con prima y penalización, la primera de las empatadas (19).
  assert.equal(T.chosenT(st({ ke: 'ni' }), T.compression(T.model(st({ ke: 'ni' }), 'es'))), 20);
  const nip = T.compression(T.model(st({ ke: 'nip' }), 'es'));
  assert.deepEqual(nip.best, [19, 20]);
  assert.equal(T.chosenT(st({ ke: 'nip' }), nip), 19);
});

test('F5b T011 · AC4 y P8: la regla que falla: marca en 8 y 7, el movimiento en la primera, y sin costes del proyecto la duración normal', () => {
  const m = T.model(st({ ke: 'rf' }), 'es');
  const c = T.compression(m);
  assert.deepEqual(c.rows.map((r) => [r.T, r.rule, r.opt, r.above]), [[12, 60, 60, false], [11, 63, 63, false], [10, 68, 68, false], [9, 75, 75, false],
    [8, 85, 83, true], [7, 95, 93, true]]);
  assert.equal(c.hasCosts, false);
  assert.deepEqual(c.best, [12]);
  assert.equal(c.first.T, 8);
  assert.deepEqual([c.first.move.shorten, c.first.move.lengthen, c.first.move.cost], [['B', 'E'], ['C'], 8]);
  assert.equal(T.moveTerms(m, c.first.move, 'es'), '6 + 4 − 2');
  // Las duraciones de las redes: las de la regla, o con el conmutador, las del óptimo.
  const r8 = c.rows.find((r) => r.T === 8);
  assert.deepEqual(r8.optD, { A: 5, B: 3, C: 2, D: 5, E: 3 });
  assert.notDeepEqual(r8.d, r8.optD);
});

test('F5b T011 · AC10: marcas de las redes: −1 en las que se acortan en el paso y «mín.» en las que están en su duración urgente', () => {
  const m = T.model(st({ ke: 'kl' }), 'es');
  const r19 = T.compression(m).rows.find((r) => r.T === 19);
  const tags = T.netTags(m.p, r19.d, r19.set);
  assert.deepEqual([...tags.keys()], ['C']);
  assert.deepEqual(tags.get('C'), ['short', 'min']);
  const r18 = T.compression(m).rows.find((r) => r.T === 18);
  assert.deepEqual(Object.fromEntries(T.netTags(m.p, r18.d, r18.set)), { A: ['short', 'min'], B: ['short'], C: ['min'] });
  // Sin paso (la duración normal) no hay marcas.
  assert.equal(T.netTags(m.p, T.compression(m).rows[0].d, []).size, 0);
});

test('F5b T011 · la curva (views/ct-chart): series, mínimos y escalas, sin DOM', () => {
  const m = T.model(st({ ke: 'rf' }), 'es');
  const spec = T.curveSpec(m, T.compression(m), 8, 'es');
  assert.deepEqual(spec.series.map((x) => x.key), ['direct', 'rule']);
  assert.deepEqual(spec.series[0].pts.map((q) => q[0]), [7, 8, 9, 10, 11, 12]);
  assert.deepEqual(spec.best, [12]);
  const kl = T.model(st({ ke: 'kl' }), 'es');
  const s2 = T.curveSpec(kl, T.compression(kl), 19, 'es');
  assert.deepEqual(s2.series.map((x) => x.key), ['total', 'direct', 'extra']);
  assert.deepEqual(s2.series[0].pts.find((q) => q[0] === 19), [19, 481]);
  const sc = CH.scales(s2);
  assert.ok(sc.X(18) < sc.X(22));
  assert.ok(sc.Y(481) > sc.Y(489));
  assert.ok(sc.lo <= 0 && sc.top >= 489);
});

// ---------- T012: el paso a paso con predicción (AC4, AC7; tablero 124; `analyze` B3) ----------

const PRD = require('../js/predict.js');

const klTrace = () => T.trace(T.model(st({ ke: 'kl' }), 'es'));
const answers = (set, cost) => new Map([['ct.set', new Set(set)], ['ct.cost', cost]]);

test('F5b T012 · la traza de la pestaña: tabla, un paso por unidad, fin y totales; se guarda con la compresión', () => {
  const tr = klTrace();
  assert.deepEqual(tr.map((s) => s.kind), ['ctTable', 'ctStep', 'ctStep', 'ctStep', 'ctStep', 'ctEnd', 'ctTotals']);
  assert.deepEqual(tr.filter((s) => s.kind === 'ctStep').map((s) => [s.from, s.T, s.set.join()]), [[22, 21, 'A'], [21, 20, 'C'], [20, 19, 'C'], [19, 18, 'A,B']]);
  assert.equal(klTrace(), tr);
  assert.equal(T.trace(T.model(st({ ke: 'own', kt: [row('A', '', '3', '5', '1', '2')] }), 'es')), null);
});

test('F5b T012 · AC7: predict corrige ct.set con crash.setCheck (cualquiera de los empatados) y ct.cost como un número', () => {
  const s = klTrace()[2];   // de 21 a 20: C (10); A y B costarían 13
  assert.equal(PRD.key(s.reveals[0]), 'ct.set');
  assert.equal(PRD.hasPrediction(s), true);
  const res = (set, cost) => Object.fromEntries(PRD.check(s, answers(set, cost)));
  assert.deepEqual(res(['C'], '10'), { 'ct.set': 'ok', 'ct.cost': 'ok' });
  assert.deepEqual(res(['A', 'B'], '13'), { 'ct.set': 'wrong', 'ct.cost': 'wrong' });
  assert.deepEqual(res(['B'], ''), { 'ct.set': 'wrong', 'ct.cost': 'empty' });
  assert.deepEqual(res([], '10'), { 'ct.set': 'empty', 'ct.cost': 'ok' });
  // La regla que falla, de 9 a 8: A y B o B y E (empate), los dos valen.
  const rf = T.trace(T.model(st({ ke: 'rf' }), 'es')).find((x) => x.kind === 'ctStep' && x.T === 8);
  for (const set of [['A', 'B'], ['B', 'E']]) assert.equal(PRD.check(rf, answers(set, '10')).get('ct.set'), 'ok', set.join());
});

test('F5b T012 · AC7: los mensajes de la predicción: acierto, no crítica, en su urgente, camino sin acortar, más caro y el coste', () => {
  const m = T.model(st({ ke: 'kl' }), 'es');
  const tr = T.trace(m);
  const fb = (k, set, cost, lang) => T.feedback(m, tr[k], answers(set, cost), lang || 'es');
  assert.deepEqual(fb(2, ['C'], '10').map((x) => x.kind), ['ok', 'ok']);
  assert.match(fb(2, ['C'], '10')[0].text, /^Acierto: C acorta todos los caminos críticos y cuesta 10\./);
  assert.match(fb(2, ['D'], '4')[0].text, /^D no es crítica/);
  assert.match(fb(2, ['B'], '5')[0].text, /el camino A–C no se acorta: sigue en 21 semanas/);
  assert.match(fb(2, ['A', 'B'], '13')[0].text, /cuesta 13; hay un conjunto de 10/);
  assert.match(fb(2, ['A', 'B'], '13')[1].text, /El coste del paso es 10/);
  assert.match(fb(4, ['C'], '10')[0].text, /^C ya está en su duración urgente/);
  assert.match(fb(2, ['C'], '')[1].text, /no ha escrito el coste del paso; es 10/i);
  for (const x of fb(2, ['D', 'B'], '9', 'en')) assert.ok(x.text && !/[{}]/.test(x.text), x.text);
  assert.match(fb(2, ['D', 'B'], '9', 'en')[0].text, /^D is not critical/);
});

test('F5b T012 · las redes del paso: antes de comprobar, las duraciones de partida sin marcas; después, las nuevas con −1 y «mín.»', () => {
  const m = T.model(st({ ke: 'kl' }), 'es');
  const tr = T.trace(m);
  const before = T.walkNets(m, tr[3], true);
  assert.deepEqual([before.T, before.d, before.set], [20, { A: 6, B: 6, C: 14, D: 10 }, []]);
  const after = T.walkNets(m, tr[3], false);
  assert.deepEqual([after.T, after.d.C, after.set], [19, 13, ['C']]);
  assert.deepEqual(T.walkNets(m, tr[5], false).T, 18);
  assert.deepEqual(T.walkNets(m, tr[6], false).T, 18);
});

// ---------- T013: el atajo de Nicholas (AC5; tablero 128) ----------

// La tabla de la semilla 370 de tests/crash.test.js (randomTable(mulberry32(370), 4, 7)): el atajo queda por encima.
const SEED370 = [row('A', '', '6', '3', '7', '25'), row('B', 'A', '3', '0', '1', '16'), row('C', 'A', '3', '0', '2', '20'), row('D', 'C', '4', '1', '4', '4'),
  row('E', '', '6', '6', '18', '18')];

test('F5b T013 · AC5: el atajo de Nicholas: 104 → 86 con D, B, B, B, E y E, igual que el óptimo; la tabla por actividad (Nicholas, §7.1)', () => {
  const m = T.model(st({ ke: 'ni' }), 'es');
  const sc = T.shortcut(m);
  assert.deepEqual([sc.T, sc.crashCost, sc.cost, sc.opt, sc.above], [15, 104, 86, 86, false]);
  assert.deepEqual(sc.steps.map((s) => s.id), ['D', 'B', 'B', 'B', 'E', 'E']);
  assert.equal(T.shortcut(T.model(st({ ke: 'ni' }), 'en')), sc);
  assert.deepEqual(T.shortcutRows(m, sc).map((r) => [r.id, r.dc, r.b, r.ext, r.final]),
    [['A', 6, 2, 0, 6], ['B', 5, 3, 3, 8], ['C', 4, 1, 0, 4], ['D', 6, 5, 1, 7], ['E', 3, 2, 2, 5], ['F', 5, 0, 0, 5], ['G', 2, 5, 0, 2]]);
});

test('F5b T013 · AC5: cuando el atajo queda por encima (semilla 370): 66 frente a 56, con las duraciones del óptimo', () => {
  const m = T.model(st({ ke: 'own', kt: SEED370 }), 'es');
  const sc = T.shortcut(m);
  assert.deepEqual([sc.T, sc.crashCost, sc.cost, sc.opt, sc.above], [6, 83, 66, 56, true]);
  assert.deepEqual(sc.optD, { A: 3, B: 3, C: 2, D: 1, E: 6 });
  assert.equal(T.shortcut(T.model(st({ ke: 'own', kt: [row('A', '', '3', '5', '1', '2')] }), 'es')), null);
});

// ---------- Revisión de nivel 2 de la F5b (T019, ronda 1) ----------

test('F5b T019 · I-F2: vaciar todos los costes de un ejemplo deja la pestaña sin costes del proyecto (no vuelven los del ejemplo)', () => {
  const S = require('../js/store.js');
  let s = st({ ke: 'ni' });
  assert.equal(T.compression(T.model(s, 'es')).hasCosts, true);
  s = S.reduce(s, { type: 'ctCosts', kc: Object.assign({}, X.get('ni').k, { fixed: '' }) }, 10);
  s = S.reduce(s, { type: 'ctCosts', kc: Object.assign({}, s.kc, { perUnit: '' }) }, 10);
  const m = T.model(s, 'es');
  assert.deepEqual(m.k, { fixed: null, perUnit: null, due: null, penalty: null, bonus: null });
  assert.equal(m.edited, true);
  assert.equal(T.compression(m).hasCosts, false);
  assert.deepEqual(T.compression(m).best, [T.compression(m).normalT]);
  // Y el enlace lo guarda.
  assert.deepEqual(T.model(U.decode(U.encode(s)).state, 'es').k, m.k);
});

test('F5b T019 · N-F4: los textos de la duración fuera de rango y de la compresión demasiado larga, en los dos idiomas', () => {
  const kt = [row('A', '', '200', '0', '1', '2')];
  for (const lang of ['es', 'en']) {
    const m = T.model(st({ ke: 'own', kt }), lang);
    assert.equal(m.p, null);
    const mk = T.rowMarks(m, lang);
    assert.equal(mk.general.length, 1);
    assert.ok(['200', '201', '150'].every((x) => mk.general[0].includes(x)), mk.general[0]);
    assert.match(T.issueText({ code: 'badDuration', ids: ['A'] }, lang), /999/);
  }
  assert.equal(T.compression(T.model(st({ ke: 'own', kt }), 'es')), null);
});

test('F5b T019 · N-F9: si el cálculo falla, la compresión, la traza y el atajo dan null (la vista lo dice) y no se rompen', () => {
  const K = require('../js/core/crash.js');
  const kt = [row('A', '', '3', '1', '5', '9'), row('B', 'A', '4', '2', '3', '13')];
  const m = T.model(st({ ke: 'own', kt }), 'es');
  const keep = { curve: K.curve, shortcut: K.shortcut };
  K.curve = () => { throw new Error('lp: demasiados pivotes'); };
  K.shortcut = () => { throw new Error('lp: demasiados pivotes'); };
  try {
    assert.equal(T.compression(m), null);
    assert.equal(T.trace(m), null);
    assert.equal(T.shortcut(m), null);
  } finally { Object.assign(K, keep); }
  // Otra tabla vuelve a calcular.
  const m2 = T.model(st({ ke: 'own', kt: kt.concat([row('C', 'B', '2', '1', '1', '2')]) }), 'es');
  assert.ok(T.compression(m2) && T.trace(m2) && T.shortcut(m2));
});

test('F5b T019 · I-F14: el eje y de la curva con costes grandes: el paso crece con la magnitud y hay 6 tramos como mucho', () => {
  assert.deepEqual([0, 6, 12, 30, 489, 60000, 120000, 1.2e6, 5e7, 9.99e11].map(CH.niceStep), [1, 1, 2, 5, 100, 10000, 20000, 200000, 1e7, 2e11]);
  const kt = [row('A', '', '5', '3', '300000', '400000'), row('B', 'A', '4', '2', '99999999', '999999999')];
  const m = T.model(st({ ke: 'own', kt, kc: { fixed: 123456789, perUnit: 1000000, due: null, penalty: null, bonus: null } }), 'es');
  const spec = T.curveSpec(m, T.compression(m), null, 'es');
  const sc = CH.scales(spec);
  assert.ok((sc.top - sc.lo) / sc.step <= 7, `${sc.lo}…${sc.top} de ${sc.step} en ${sc.step}`);
  // Con muchas duraciones, las cifras del eje x van de k en k (la de 150 duraciones, a 500 px, de 11 en 11).
  assert.deepEqual([CH.every(5, 500), CH.every(150, 500), CH.every(150, 300)], [1, 11, 22]);
});
