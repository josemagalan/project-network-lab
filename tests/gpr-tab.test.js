'use strict';
// F5a T010: la parte sin DOM de la pestaña «Precedencias generalizadas» (js/gpr.js): el proyecto, la escritura de las
// relaciones con la notación, las marcas de la tabla propia y las etiquetas y flechas críticas de la red ROY.
const test = require('node:test');
const assert = require('node:assert/strict');
const T = require('../js/gpr.js');
const G = require('../js/core/gpr.js');
const X = require('../js/core/gprex.js');
const U = require('../js/core/urlstate.js');

const st = (s) => Object.assign(U.decode('#v=gpr').state, s);
const OWN120 = [
  { id: 'A', name: 'Lay the foundations', duration: '8', links: '' },
  { id: 'B', name: 'Build the walls', duration: '6', links: 'A SS+' },
  { id: 'C', name: 'Install the roof', duration: '4', links: 'B FF+1, B FF+2' },
  { id: 'D', name: 'Wiring', duration: '3', links: 'Z' },
  { id: 'E', name: 'Paint', duration: '5', links: 'A SS+10' },
];

test('F5a T010: el proyecto es el ejemplo elegido (por defecto el primero) o la tabla propia', () => {
  const m = T.model(st({ qe: 'rb' }), 'es');
  assert.equal(m.src.kind, 'example');
  assert.equal(m.src.title, X.get('rb').title.es);
  assert.equal(m.src.source, X.get('rb').source.es);
  assert.equal(m.solution.duration, 24);
  assert.equal(T.model(st({}), 'en').src.id, 'fc');
  assert.equal(T.model(st({ qe: 'nada' }), 'en').src.id, 'fc');
  const own = T.model(st({ qe: 'own', qt: OWN120 }), 'en');
  assert.equal(own.src.kind, 'own');
  assert.equal(own.src.title, 'Own table');
  assert.equal(own.gp, null);
  assert.equal(own.solution, null);
  assert.equal(own.empty, false);
  assert.equal(T.model(st({ qe: 'own', qt: [{ id: '', duration: '', links: '' }] }), 'es').empty, true);
});

test('F5a T010 (AC16): los códigos con la notación y las cifras con el idioma', () => {
  const r = { from: 'B', to: 'C', type: 'SS', lag: 2 };
  assert.equal(T.relTag(r, 'en', 'es'), 'SS+2');
  assert.equal(T.relTag(r, 'es', 'en'), 'CC+2');
  assert.equal(T.relTag({ type: 'FF', lag: -1.5 }, 'en', 'es'), 'FF-1,5');
  assert.equal(T.relTag({ type: 'FF', lag: -1.5 }, 'es', 'en'), 'FF-1.5');
  assert.equal(T.relTag({ type: 'SF', lag: 0 }, 'es', 'es'), 'CF');
  assert.equal(T.relText({ from: 'A', type: 'FS', lag: 0 }, 'es', 'es'), 'A');
  assert.equal(T.relText({ from: 'A', type: 'FS', lag: 3 }, 'es', 'es'), 'A FC+3');
  // Lo que escribe relText se vuelve a leer igual (P1).
  for (const nota of ['en', 'es']) {
    for (const lang of ['en', 'es']) {
      for (const ex of X.list()) {
        const gp = G.parse(ex.rows).project;
        const rows = gp.activities.map((a) => ({ id: a.id, duration: String(a.d), links: gp.rels.filter((x) => x.to === a.id).map((x) => T.relText(x, nota, lang)).join(', ') }));
        assert.deepEqual(G.parse(rows).project.rels, gp.rels, `${ex.id} ${nota} ${lang}`);
      }
    }
  }
});

test('F5a T010: etiquetas de los arcos (sin las FS+0, varias en el mismo arco) y flechas críticas de ROSEBUD', () => {
  const gp = G.parse(X.get('rb').rows).project;
  const labs = T.labels(gp, 'es', 'es');
  assert.deepEqual([...labs.keys()].sort(), ['G>L', 'V>Y', 'W>X', 'Y>W']);
  assert.deepEqual(labs.get('V>Y').map((l) => l.text), ['CC+2', 'FF+6']);
  assert.equal(labs.get('V>Y')[1].title, 'V → Y: fin–fin +6');
  assert.equal(T.labels(gp, 'en', 'en').get('W>X')[0].title, 'W → X: finish-to-start +1');
  const sol = G.solve(gp);
  const cp = T.structure(gp);
  assert.deepEqual([...T.critEdges(gp, sol, cp)].sort(), ['@S>G', 'G>M', 'M>V', 'V>Y', 'W>X', 'X>@E', 'Y>W']);
  // La crítica al revés: B es crítica y sus dos relaciones también.
  const rv = G.parse(X.get('rv').rows).project;
  assert.deepEqual([...T.critEdges(rv, G.solve(rv), T.structure(rv))].sort(), ['@S>A', 'A>B', 'B>C', 'C>@E']);
});

test('F5a T010 (AC6): las marcas de la tabla propia (tablero 120): campo, texto de cada fila, filas con error y el aviso de CC larga', () => {
  const m = T.model(st({ qe: 'own', qt: OWN120 }), 'en');
  const mk = T.rowMarks(m, 'en', 'en');
  assert.deepEqual(mk.badRows, ['B', 'C', 'D']);
  assert.deepEqual(mk.general, []);
  assert.deepEqual([...mk.rows.get(1).bad], ['links']);
  assert.equal(mk.rows.get(1).msgs[0].text, 'I can’t read “+” in “A SS+”. Write each relation as A, A SS or A SS+2.');
  assert.equal(mk.rows.get(2).msgs[0].text, 'Two FF relations with B. Keep one.');
  assert.equal(mk.rows.get(3).msgs[0].text, 'There is no activity Z.');
  assert.deepEqual(mk.rows.get(4).msgs, [{ kind: 'warn', text: 'SS+10 is not less than the duration of A (8): it is the same as A FS+2. It is calculated anyway.' }]);
  assert.equal(mk.rows.has(0), false);
  const es = T.rowMarks(m, 'es', 'es');
  assert.equal(es.rows.get(1).msgs[0].text, 'No entiendo «+» en «A SS+». Escribe cada relación como A, A CC o A CC+2.');
  assert.equal(es.rows.get(4).msgs[0].text, 'CC+10 no es menor que la duración de A (8): equivale a A FC+2. Se calcula igualmente.');
  // Un ciclo no tiene fila: va a la lista; un código de relación como identificador y una fila sin identificador.
  const cyc = T.rowMarks(T.model(st({ qe: 'own', qt: [{ id: 'A', duration: '1', links: 'B' }, { id: 'B', duration: '1', links: 'A' }] }), 'es'), 'es', 'en');
  assert.equal(cyc.general.length, 1);
  assert.match(cyc.general[0], /ciclo/);
  const res = T.rowMarks(T.model(st({ qe: 'own', qt: [{ id: 'A', duration: '1', links: '' }, { id: 'SS', duration: '1', links: '' }, { id: 'FIN', duration: '1', links: '' }, { id: '', duration: 'x', links: 'A' }] }), 'es'), 'es', 'en');
  assert.equal(res.rows.get(1).msgs[0].text, 'SS es un código de relación: elige otro identificador.');
  assert.equal(res.rows.get(2).msgs[0].text, 'FIN está reservado para los nodos de inicio y fin.');
  assert.deepEqual(res.badRows, ['SS', 'FIN', '4']);
});

test('F5a T010: pegar desde una hoja de cálculo (actividad, nombre, duración y predecesoras)', () => {
  assert.deepEqual(T.pasteRows('D\tCimientos\t3\tB SS+1\nE\tTejado\t2\tD, A FF'), [
    { id: 'D', name: 'Cimientos', duration: '3', links: 'B SS+1' }, { id: 'E', name: 'Tejado', duration: '2', links: 'D, A FF' }]);
  assert.deepEqual(T.pasteRows(''), []);
});

// ---------- T011: el paso a paso ----------

test('F5a T011: la traza del paso a paso (sin las clases, que llegan con «¿Y si…?») y lo que se pregunta en cada paso', () => {
  const m = T.model(st({ qe: 'rb' }), 'es');
  const tr = T.walkTrace(m);
  assert.deepEqual(tr.map((s) => s.kind[3] + (s.float || s.act || '')).join(' '), 'l FG FL FM FQ FV FY FW FX E BX BW BY BV BQ BM BL BG FTF FFF C');
  assert.equal(T.walkTrace(T.model(st({ qe: 'own', qt: OWN120 }), 'en')), null);
  const ask = (k) => T.asked(tr[k]).map((rv) => `${rv.act}.${rv.field}`);
  assert.deepEqual(ask(6), ['Y.ES']);
  assert.deepEqual(ask(9), ['@E.T']);
  assert.deepEqual(ask(12), ['Y.LS']);
  assert.equal(ask(18).length, 8);
  assert.ok(ask(18).every((k) => k.endsWith('.TF')));
  assert.deepEqual(ask(20), []);
  assert.deepEqual(ask(0), []);
});

test('F5a T011 (AC8): los términos de cada paso, con su fórmula y sus cifras, dan el valor del núcleo (todos los ejemplos, las dos pasadas)', () => {
  const evalCalc = (s) => s.replace(/\s/g, '').replace(/,/g, '.').replace(/−/g, '-').split(/(?=[+-])/).reduce((a, x) => a + Number(x), 0);
  for (const ex of X.list()) {
    const m = T.model(st({ qe: ex.id }), 'es');
    for (const step of T.walkTrace(m).filter((s) => s.formula)) {
      const rows = T.terms(step, m.gp, m.solution, 'en', 'en');
      assert.equal(rows.length, step.formula.terms.length);
      for (const r of rows) {
        if (r.calc !== null) assert.ok(Math.abs(evalCalc(r.calc) - r.value) < 1e-9, `${ex.id} ${step.act} ${r.label}: ${r.calc} ≠ ${r.value}`);
        else assert.equal(r.value, 0);
      }
      assert.deepEqual(rows.filter((r) => r.chosen).map((r) => r.key), step.formula.chosen);
    }
  }
  // ROSEBUD, Y: el inicio, V SS+2 y V FF+6, que manda.
  const m = T.model(st({ qe: 'rb' }), 'es');
  const y = T.walkTrace(m).find((s) => s.kind === 'gprForward' && s.act === 'Y');
  assert.deepEqual(T.terms(y, m.gp, m.solution, 'en', 'en').map((r) => [r.label, r.expr, r.calc, r.value, r.chosen]), [
    ['Start', '0', null, 0, false],
    ['V → Y SS+2', 'ES(V) + 2', '10 + 2', 12, false],
    ['V → Y FF+6', 'EF(V) + 6 − d(Y)', '16 + 6 − 8', 14, true],
  ]);
  assert.equal(T.terms(y, m.gp, m.solution, 'es', 'es')[2].expr, 'fᵢ(V) + 6 − d(Y)');
  const by = T.walkTrace(m).find((s) => s.kind === 'gprBackward' && s.act === 'Y');
  assert.deepEqual(T.terms(by, m.gp, m.solution, 'en', 'en').map((r) => [r.label, r.expr, r.calc, r.value]), [
    ['End', 'T − d(Y)', '24 − 8', 16],
    ['Y → W SS+5', 'LS(W) − 5', '21 − 5', 16],
    ['Y → W FF', 'LF(W) − d(Y)', '22 − 8', 14],
  ]);
});

test('F5a T011: la narración de cada paso: quién manda, el inicio cuando una relación daría menos de 0 y la actividad que no es final', () => {
  const m = T.model(st({ qe: 'rb' }), 'es');
  const tr = T.walkTrace(m);
  const y = T.narration(tr[6], m, { lang: 'es', nota: 'en', hide: false });
  assert.equal(y.title, 'Pasada hacia delante · actividad Y');
  assert.match(y.text, /Manda V → Y FF\+6 \(14\)/);
  assert.match(y.text, /EF\(Y\) = ES\(Y\) \+ d = 14 \+ 8 = 22/);
  const hidden = T.narration(tr[6], m, { lang: 'es', nota: 'en', hide: true });
  assert.doesNotMatch(hidden.text, /Manda|14/);
  const clamp = T.model(st({ qe: 'own', qt: [{ id: 'A', duration: '5', links: '' }, { id: 'B', duration: '2', links: 'A SF-4' }] }), 'es');
  const b = T.walkTrace(clamp).find((s) => s.kind === 'gprForward' && s.act === 'B');
  assert.match(T.narration(b, clamp, { lang: 'es', nota: 'es', hide: false }).text, /antes de 0/);
  const cl = T.model(st({ qe: 'cl' }), 'en');
  const end = T.walkTrace(cl).find((s) => s.kind === 'gprEnd');
  assert.match(T.narration(end, cl, { lang: 'en', nota: 'en', hide: false }).text, /B and C.*not final activities/);
});

test('F5a T011 (decisión del autor): sin desfase, la explicación no habla del desfase', () => {
  const m = T.model(st({ qe: 'rb' }), 'es');
  const tr = T.walkTrace(m);
  const fwd = T.narration(tr.find((s) => s.kind === 'gprForward' && s.act === 'Y'), m, { lang: 'es', nota: 'en', hide: false }).text;
  assert.match(fwd, /antes de que acabe V más el desfase/);
  const bwd = T.narration(tr.find((s) => s.kind === 'gprBackward' && s.act === 'Y'), m, { lang: 'es', nota: 'en', hide: false }).text;
  assert.match(bwd, /Con FF, Y debe acabar antes del fin tardío de W\./);
  assert.doesNotMatch(bwd, /desfase/);
  const en = T.narration(tr.find((s) => s.kind === 'gprForward' && s.act === 'L'), m, { lang: 'en', nota: 'en', hide: false }).text;
  assert.match(en, /With FF, L cannot finish before G finishes; that is why d\(L\) is subtracted\./);
});

test('F5a T012 (AC13): la tabla del Gantt (su alternativa en texto): comienzo, fin, holgura total y relaciones que llegan, por comienzo temprano', () => {
  const m = T.model(st({ qe: 'rb' }), 'es');
  const early = T.ganttRows(m, false, 'en', 'es');
  assert.deepEqual(early.map((r) => r.id), ['G', 'L', 'M', 'Q', 'V', 'Y', 'W', 'X']);
  const y = early.find((r) => r.id === 'Y');
  assert.deepEqual([y.start, y.finish, y.tf, y.crit], [14, 22, 0, true]);
  assert.deepEqual(y.arrives, ['V SS+2', 'V FF+6']);
  assert.deepEqual(early.find((r) => r.id === 'G').arrives, []);
  const late = T.ganttRows(m, true, 'es', 'es');
  const l = late.find((r) => r.id === 'L');
  assert.deepEqual([l.start, l.finish, l.tf, l.crit], [11, 13, 7, false]);
  assert.deepEqual(l.arrives, ['G CC+3', 'G FF']);
  assert.deepEqual(late.map((r) => r.id), early.map((r) => r.id), 'las filas no se mueven al cambiar de fechas');
  const own = T.model(st({ qe: 'own', qt: [{ id: 'A', duration: '4', links: '' }, { id: 'B', duration: '2', links: 'A SF+1,5' }] }), 'es');
  assert.deepEqual(T.ganttRows(own, false, 'es', 'es')[1].arrives, ['A CF+1,5']);
});

test('F5a T012: la nota del Gantt dice qué relación que no es FS sin desfase fija el comienzo de las primeras críticas (como el tablero 118)', () => {
  assert.deepEqual(T.ganttNote(T.model(st({ qe: 'rb' }), 'es'), 'en', 'es'), ['Y empieza en 14: manda V → Y FF+6.', 'W empieza en 21: manda Y → W FF.']);
  assert.deepEqual(T.ganttNote(T.model(st({ qe: 'rb' }), 'en'), 'es', 'en'), ['Y starts at 14: V → Y FF+6 governs.', 'W starts at 21: Y → W FF governs.']);
  assert.deepEqual(T.ganttNote(T.model(st({ qe: 'fc' }), 'es'), 'es', 'es'), ['B empieza en 11: manda A → B FC+3.']);
  // Con relaciones FS sin desfase no hay nada que contar.
  assert.deepEqual(T.ganttNote(T.model(st({ qe: 'own', qt: [{ id: 'A', duration: '4', links: '' }, { id: 'B', duration: '2', links: 'A' }] }), 'es'), 'en', 'es'), []);
});
