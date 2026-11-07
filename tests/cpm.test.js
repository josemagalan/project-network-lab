'use strict';
// core/cpm: tiempos, cuatro holguras, caminos críticos, "¿y si…?" y la traza de pasos.
// AC1 (referencias), AC2, AC6, AC11 y AC12 de la spec f1-cpm-roy.
const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../js/core/project.js');
const E = require('../js/core/examples.js');
const C = require('../js/core/cpm.js');

const row = (id, duration, links = '') => ({ id, duration, links });
const load = (rows, mode = 'pred') => {
  const { project, report } = P.parse(rows, mode);
  assert.ok(project, JSON.stringify(report));
  return project;
};
const solveEx = (id) => { const ex = E.get(id); return C.solve(load(ex.rows, ex.mode)); };

test('AC1: los seis ejemplos dan exactamente los valores de su fuente', () => {
  for (const ex of E.list()) {
    const s = C.solve(load(ex.rows, ex.mode));
    const exp = ex.expected;
    assert.equal(s.duration, exp.duration, `${ex.id}: duración`);
    for (const f of ['ES', 'EF', 'LS', 'LF']) {
      for (const [id, v] of Object.entries(exp[f] || {})) assert.equal(s.times[id][f], v, `${ex.id}: ${f}(${id})`);
    }
    for (const f of ['TF', 'FF', 'IF', 'SF']) {
      for (const [id, v] of Object.entries(exp[f] || {})) assert.equal(s.floats[id][f], v, `${ex.id}: ${f}(${id})`);
    }
    if (exp.critical) assert.deepEqual([...s.critical].sort(), [...exp.critical].sort(), `${ex.id}: críticas`);
  }
});

test('las cuatro holguras con un ejemplo resuelto a mano (definiciones de Klastorin)', () => {
  // A(2), B(3) sin predecesoras; C(1) tras A y B; D(4) tras A. Duración 6.
  const s = C.solve(load([row('A', 2), row('B', 3), row('C', 1, 'A, B'), row('D', 4, 'A')]));
  assert.equal(s.duration, 6);
  assert.deepEqual(s.floats.A, { TF: 0, FF: 0, IF: 0, SF: 0 });
  assert.deepEqual(s.floats.B, { TF: 2, FF: 0, IF: 0, SF: 2 });
  assert.deepEqual(s.floats.C, { TF: 2, FF: 2, IF: 0, SF: 0 });
  assert.deepEqual(s.floats.D, { TF: 0, FF: 0, IF: 0, SF: 0 });
});

test('AC12: en el ejemplo ROY de 10 actividades, la holgura independiente de E es 0 aunque la fórmula sin acotar dé −1', () => {
  const s = solveEx('roy10');
  const ex = E.get('roy10');
  const p = load(ex.rows, ex.mode);
  const esMin = Math.min(...p.succs.E.map((j) => s.times[j].ES));
  const lfMax = Math.max(...p.preds.E.map((i) => s.times[i].LF));
  assert.equal(esMin - lfMax - 3, -1);
  assert.equal(s.floats.E.IF, 0);
});

test('AC2: una red con dos caminos críticos los señala los dos', () => {
  const s = C.solve(load([row('A', 3), row('B', 3), row('C', 1, 'A, B')]));
  assert.deepEqual([...s.critical].sort(), ['A', 'B', 'C']);
  assert.deepEqual(s.criticalPaths.map((p) => p.acts.join('')).sort(), ['AC', 'BC']);
});

test('lista de caminos: todos con su duración, ordenados de mayor a menor', () => {
  const s = solveEx('ej6');
  assert.equal(s.paths.count, s.paths.list.length);
  assert.ok(s.paths.list.length > 0);
  assert.deepEqual(s.paths.list[0], { acts: ['B', 'E', 'I', 'J', 'K'], length: 13, critical: true });
  for (let i = 1; i < s.paths.list.length; i++) assert.ok(s.paths.list[i - 1].length >= s.paths.list[i].length);
});

test('D3: con más de 50 caminos solo se da el número, pero los críticos siguen saliendo', () => {
  const rows = [];
  const layers = [['A1', 'A2', 'A3'], ['B1', 'B2', 'B3'], ['C1', 'C2', 'C3'], ['D1', 'D2', 'D3']];
  layers.forEach((layer, i) => layer.forEach((id) => rows.push(row(id, 1, i ? layers[i - 1].join(', ') : ''))));
  const s = C.solve(load(rows));
  assert.equal(s.paths.count, 81);
  assert.equal(s.paths.list, null);
  assert.equal(s.criticalPaths.length, 50);
  assert.equal(C.solve(load(rows), { pathLimit: 100 }).paths.list.length, 81);
});

test('AC11: alargar una actividad no crítica dentro de su holgura total no cambia la duración', () => {
  const ex = E.get('ej6');
  const p = load(ex.rows, ex.mode);
  const base = C.solve(p);
  assert.equal(base.floats.A.TF, 1);
  assert.equal(C.whatIf(p, 'A', 3).duration, 13);
  const more = C.whatIf(p, 'A', 5);   // 3 días más con 1 de holgura: el proyecto se alarga 2
  assert.equal(more.duration, 15);
  assert.ok(more.critical.includes('A'));
  assert.equal(p.activities.find((a) => a.id === 'A').d, 2, 'whatIf no modifica el proyecto');
});

test('AC6: la traza tiene la secuencia acordada y un paso por actividad en cada pasada', () => {
  const ex = E.get('ej6');
  const p = load(ex.rows, ex.mode);
  const s = C.solve(p);
  const kinds = s.trace.map((st) => st.kind);
  const n = p.activities.length;
  assert.deepEqual(kinds.slice(0, 2), ['table', 'build']);
  assert.deepEqual(kinds.slice(2, 3 + n), Array(n + 1).fill('forward'));
  assert.deepEqual(kinds.slice(3 + n, 4 + 2 * n), Array(n + 1).fill('backward'));
  assert.deepEqual(s.trace.filter((st) => st.kind === 'float').map((st) => st.float), ['TF', 'FF', 'IF', 'SF']);
  assert.deepEqual(kinds.slice(-2), ['critical', 'gantt']);
  assert.equal(s.trace.length, 2 + 2 * (n + 1) + 4 + 2);
  const fwd = s.trace.filter((st) => st.kind === 'forward').map((st) => st.act);
  assert.deepEqual(fwd, [...s.order, P.END]);
  const bwd = s.trace.filter((st) => st.kind === 'backward').map((st) => st.act);
  assert.deepEqual(bwd, [P.END, ...[...s.order].reverse()]);
});

test('AC6: cada paso de la pasada hacia delante revela ES y EF y dice qué predecesora decide el máximo', () => {
  const s = solveEx('ej6');
  const stE = s.trace.find((st) => st.kind === 'forward' && st.act === 'E');
  assert.deepEqual(stE.reveals, [{ act: 'E', field: 'ES', value: 3 }, { act: 'E', field: 'EF', value: 7 }]);
  assert.deepEqual(stE.formula, { op: 'max', terms: [{ from: 'A', value: 2 }, { from: 'B', value: 3 }], chosen: ['B'] });
  const stA = s.trace.find((st) => st.kind === 'forward' && st.act === 'A');
  assert.deepEqual(stA.formula, { op: 'max', terms: [{ from: P.START, value: 0 }], chosen: [P.START] });
});

test('AC6: cada paso de la pasada hacia atrás revela LF y LS y dice qué sucesora decide el mínimo', () => {
  const s = solveEx('ej6');
  const stB = s.trace.find((st) => st.kind === 'backward' && st.act === 'B');
  assert.deepEqual(stB.reveals, [{ act: 'B', field: 'LF', value: 3 }, { act: 'B', field: 'LS', value: 0 }]);
  assert.deepEqual(stB.formula, { op: 'min', terms: [{ from: 'E', value: 3 }, { from: 'F', value: 4 }, { from: 'G', value: 5 }], chosen: ['E'] });
});

test('los pasos de holgura revelan la columna entera en orden topológico', () => {
  const s = solveEx('ej6');
  const st = s.trace.find((x) => x.kind === 'float' && x.float === 'IF');
  assert.deepEqual(st.reveals.map((r) => r.act), s.order);
  assert.ok(st.reveals.every((r) => r.field === 'IF' && r.value === s.floats[r.act].IF));
});

test('empates: si varias predecesoras deciden el máximo, salen todas', () => {
  const s = C.solve(load([row('A', 3), row('B', 3), row('C', 1, 'A, B')]));
  assert.deepEqual(s.trace.find((st) => st.act === 'C' && st.kind === 'forward').formula.chosen, ['A', 'B']);
});

test('decimales y actividades de duración 0 sin errores de redondeo', () => {
  const s = C.solve(load([row('A', '0.1'), row('B', '0.2', 'A'), row('H', 0, 'B'), row('C', '0.2', 'A')]));   // 0,1 + 0,2 = 0,3 exacto, sin 0,30000000000000004
  assert.equal(s.duration, 0.3);
  assert.equal(s.floats.C.TF, 0);
  assert.equal(s.floats.H.TF, 0);
});

test('determinismo: el mismo proyecto da exactamente la misma solución', () => {
  assert.deepEqual(solveEx('hillier'), solveEx('hillier'));
});
