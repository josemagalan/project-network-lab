'use strict';
// core/project: validación de la tabla, conversión predecesoras ↔ posteriores y texto pegado.
// Criterios AC3, AC4, AC5, AC13 y AC18 de la spec f1-cpm-roy.
const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../js/core/project.js');

const codes = (report) => report.errors.map((e) => e.code).sort();
const row = (id, duration, links = '', name) => ({ id, duration, links, name });

// Ejercicio 6 (Mecánicas del Sureste) tal como está en el enunciado: en forma de posteriores.
// A, B < E; B, C < G; B < F; D < K; E, F < H, I; G < I; H, J < K; I < J
const EJ6_SUCC = [
  row('A', 2, 'E'), row('B', 3, 'E, G, F'), row('C', 2, 'G'), row('D', 8, 'K'),
  row('E', 4, 'H, I'), row('F', 3, 'H, I'), row('G', 2, 'I'), row('H', 1, 'K'),
  row('I', 2, 'J'), row('J', 3, 'K'), row('K', 1, ''),
];
const EJ6_PRED = {
  A: [], B: [], C: [], D: [], E: ['A', 'B'], F: ['B'], G: ['B', 'C'],
  H: ['E', 'F'], I: ['E', 'F', 'G'], J: ['I'], K: ['D', 'H', 'J'],
};

test('una tabla válida en forma de predecesoras da un proyecto sin errores ni avisos', () => {
  const { project, report } = P.parse([row('A', 2), row('B', 3), row('C', 1.5, 'A, B'), row('D', 1, 'A')], 'pred');
  assert.deepEqual(report, { errors: [], warnings: [] });
  assert.deepEqual(project.activities.map((a) => [a.id, a.d]), [['A', 2], ['B', 3], ['C', 1.5], ['D', 1]]);
  assert.deepEqual(project.preds.C, ['A', 'B']);
  assert.deepEqual(project.succs.A, ['C', 'D']);
});

test('AC18: el Ejercicio 6 en forma de posteriores da exactamente las predecesoras del enunciado', () => {
  const { project, report } = P.parse(EJ6_SUCC, 'succ');
  assert.deepEqual(report.errors, []);
  for (const [id, preds] of Object.entries(EJ6_PRED)) assert.deepEqual(project.preds[id], preds, id);
});

test('AC18: ida y vuelta posteriores → predecesoras → posteriores sin cambios', () => {
  const a = P.parse(EJ6_SUCC, 'succ').project;
  const b = P.parse(P.toRows(a, 'pred'), 'pred').project;
  const c = P.parse(P.toRows(b, 'succ'), 'succ').project;
  assert.deepEqual(b.preds, a.preds);
  assert.deepEqual(c.succs, a.succs);
  assert.equal(P.toRows(a, 'pred').find((r) => r.id === 'I').links, 'E, F, G');
});

test('los identificadores se normalizan a mayúsculas, sin distinguir mayúsculas de minúsculas', () => {
  const { project, report } = P.parse([row(' a ', 1), row('b1', 2, 'A')], 'pred');
  assert.deepEqual(report.errors, []);
  assert.deepEqual(project.activities.map((a) => a.id), ['A', 'B1']);
  assert.deepEqual(project.preds.B1, ['A']);
});

test('las duraciones admiten decimales con coma o punto; las filas vacías se ignoran', () => {
  const { project } = P.parse([row('A', '2,5'), { id: '', duration: '', links: '' }, row('B', '0.75', 'a')], 'pred');
  assert.deepEqual(project.activities.map((a) => a.d), [2.5, 0.75]);
});

test('una tabla vacía (o solo con filas vacías) no da proyecto ni errores: la interfaz invita a empezar', () => {
  for (const rows of [[], [{ id: '', duration: '', links: '' }, { id: ' ', duration: '', links: '' }]]) {
    const { project, report } = P.parse(rows, 'pred');
    assert.equal(project, null);
    assert.deepEqual(report, { errors: [], warnings: [] });
  }
});

test('AC4: identificador repetido → duplicateId en la fila repetida', () => {
  const { project, report } = P.parse([row('A', 1), row('a', 2)], 'pred');
  assert.equal(project, null);
  assert.deepEqual(report.errors, [{ code: 'duplicateId', row: 1, ids: ['A'] }]);
});

test('AC4: predecesora inexistente → unknownRef con las referencias desconocidas', () => {
  const { report } = P.parse([row('A', 1), row('B', 2, 'A, Z, Y')], 'pred');
  assert.deepEqual(report.errors, [{ code: 'unknownRef', row: 1, ids: ['Y', 'Z'] }]);
});

test('AC4: duración negativa, vacía o no numérica → badDuration', () => {
  const { report } = P.parse([row('A', -1), row('B', ''), row('C', 'dos')], 'pred');
  assert.deepEqual(report.errors.map((e) => [e.code, e.row]), [['badDuration', 0], ['badDuration', 1], ['badDuration', 2]]);
});

test('identificadores no válidos o reservados', () => {
  const { report } = P.parse([row('A-1', 1), row('ABCDE', 1), row('FIN', 1), row('', 1)], 'pred');
  assert.deepEqual(report.errors.map((e) => e.code), ['badId', 'badId', 'reservedId', 'badId']);
});

test('más de 30 actividades → tooMany', () => {
  const rows = Array.from({ length: 31 }, (_, i) => row('A' + i, 1));
  assert.deepEqual(codes(P.parse(rows, 'pred').report), ['tooMany']);
  assert.deepEqual(P.parse(rows.slice(0, 30), 'pred').report.errors, []);
});

test('AC3: un ciclo es un error que nombra sus actividades, y no hay proyecto', () => {
  const { project, report } = P.parse([row('A', 1, 'C'), row('B', 1, 'A'), row('C', 1, 'B'), row('D', 1)], 'pred');
  assert.equal(project, null);
  assert.equal(report.errors.length, 1);
  assert.equal(report.errors[0].code, 'cycle');
  assert.deepEqual([...report.errors[0].ids].sort(), ['A', 'B', 'C']);
});

test('AC3: una actividad que se precede a sí misma es un ciclo', () => {
  const { report } = P.parse([row('A', 1, 'A')], 'pred');
  assert.deepEqual(report.errors, [{ code: 'cycle', ids: ['A'] }]);
});

test('AC5: una precedencia redundante por transitividad es un aviso y el proyecto sigue siendo válido', () => {
  const { project, report } = P.parse([row('A', 1), row('B', 1, 'A'), row('C', 1, 'A, B')], 'pred');
  assert.ok(project);
  assert.deepEqual(report.errors, []);
  assert.deepEqual(report.warnings, [{ code: 'redundant', row: 2, ids: ['A', 'C'] }]);
});

test('AC5: en forma de posteriores, el aviso señala la fila de la actividad que precede', () => {
  const { report } = P.parse([row('A', 1, 'B, C'), row('B', 1, 'C'), row('C', 1)], 'succ');
  assert.deepEqual(report.warnings, [{ code: 'redundant', row: 0, ids: ['A', 'C'] }]);
});

test('F14: la redundancia se detecta también cuando el otro camino tiene varios saltos', () => {
  // A → B → C → D y además A → D: A → D sobra.
  const { project, report } = P.parse([row('A', 1), row('B', 1, 'A'), row('C', 1, 'B'), row('D', 1, 'A, C')], 'pred');
  assert.ok(project);
  assert.deepEqual(report.warnings.map((w) => `${w.code}:${w.ids.join('>')}:${w.row}`), ['redundant:A>D:3']);
});

test('F13: las precedencias se separan con coma, punto y coma o espacios', () => {
  for (const links of ['A, B', 'A;B', 'A B', ' a  b ', 'A,;B']) {
    const { project, report } = P.parse([row('A', 1), row('B', 1), row('C', 1, links)], 'pred');
    assert.deepEqual(report.errors, [], `«${links}»`);
    assert.deepEqual(project.preds.C, ['A', 'B'], `«${links}»`);
  }
});

test('F13: al pegar, una primera fila con duración mal escrita no se toma por cabecera', () => {
  assert.deepEqual(P.parsePasted('A\tx\t-1\t'), [{ id: 'A', name: 'x', duration: '-1', links: '' }]);
  assert.deepEqual(P.parsePasted('Id\tNombre\tDuración\tPredecesoras\nA\tx\t2\t'), [{ id: 'A', name: 'x', duration: '2', links: '' }]);
  const { report } = P.parse(P.parsePasted('A\tx\t-1\t'), 'pred');
  assert.deepEqual(report.errors.map((e) => e.code), ['badDuration']);
});

test('AC13: texto pegado de una hoja de cálculo (tabuladores) con cabecera', () => {
  const text = 'Actividad\tNombre\tDuración\tPrecedentes\nA\tExcavar\t2\t\nB\tCimientos\t4\tA\r\nC\tMuros\t10,5\tA, B\n\n';
  assert.deepEqual(P.parsePasted(text), [
    { id: 'A', name: 'Excavar', duration: '2', links: '' },
    { id: 'B', name: 'Cimientos', duration: '4', links: 'A' },
    { id: 'C', name: 'Muros', duration: '10,5', links: 'A, B' },
  ]);
});

test('AC13: texto pegado separado por punto y coma, con tres columnas (sin nombre)', () => {
  assert.deepEqual(P.parsePasted('A;2;\nB;3;A'), [
    { id: 'A', name: '', duration: '2', links: '' },
    { id: 'B', name: '', duration: '3', links: 'A' },
  ]);
});

// ---------- Fase 2a (T003): tablas solo de estructura ----------

test('structureOnly: una duración vacía es válida y queda como null; sin la opción sigue siendo un error', () => {
  const rows = [{ id: 'A', duration: '', links: '' }, { id: 'B', duration: '', links: 'A' }];
  const withOpt = P.parse(rows, 'pred', { structureOnly: true });
  assert.deepEqual(withOpt.report, { errors: [], warnings: [] });
  assert.deepEqual(withOpt.project.activities.map((a) => a.d), [null, null]);
  const without = P.parse(rows, 'pred');
  assert.equal(without.project, null);
  assert.deepEqual(without.report.errors.map((e) => e.code), ['badDuration', 'badDuration']);
});

test('structureOnly: una duración escrita mal sigue siendo un error', () => {
  const { project, report } = P.parse([{ id: 'A', duration: 'x', links: '' }], 'pred', { structureOnly: true });
  assert.equal(project, null);
  assert.deepEqual(report.errors.map((e) => e.code), ['badDuration']);
});
