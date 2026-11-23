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
