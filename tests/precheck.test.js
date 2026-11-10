'use strict';
// core/precheck (F2c, T003): cierre, reducción, explicaciones y diagnóstico de una tabla frente a la referencia.
// Lectura del diagnóstico: spec f2c-enunciado-tabla, Behaviour («Comprobación frente a la referencia»).
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../js/core/precheck.js');
const P = require('../js/core/project.js');
const E = require('../js/core/examples.js');
const O = require('./oracle-precheck.js');

function rng(seed) { let s = seed >>> 0; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; }
const LET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

// Tabla { id: [predecesoras] } → resultado de project.parse (en modo predecesoras, con duración 1 o vacía).
const parsed = (pred, dur) => P.parse(Object.keys(pred).map((id) => ({ id, name: '', duration: dur === null ? '' : String((dur && dur[id]) || 1), links: pred[id].join(', ') })), 'pred', { structureOnly: dur === null });
const proj = (pred, dur) => parsed(pred, dur).project;
const predOf = (p) => Object.fromEntries(p.activities.map((a) => [a.id, [...p.preds[a.id]]]));
const edgesOf = (pred) => Object.keys(pred).flatMap((a) => pred[a].map((x) => [x, a]));
const key = (es) => es.map((e) => e.join('>')).sort();
const codes = (d) => d.issues.map((i) => i.code);
function randomPred(r, n, dens) {
  const ids = LET.slice(0, n).split('');
  return Object.fromEntries(ids.map((id, j) => [id, ids.slice(0, j).filter(() => r() < dens)]));
}

const ELECTRONA = { A: [], B: [], C: [], D: ['A', 'B'], E: ['B', 'C'], F: ['A', 'B'], G: ['F'], H: ['D', 'E'], I: ['H'], J: ['G', 'I'], K: ['J'] };
const ELECTRONA_D = { A: 3, B: 1, C: 2, D: 7, E: 5, F: 6, G: 1, H: 2, I: 1, J: 3, K: 1 };

// ── cierre y reducción ─────────────────────────────────────────────────────────────────────────────────────
test('closure y reduce en una cadena con un atajo: A→B→C con A→C', () => {
  const p = proj({ A: [], B: ['A'], C: ['A', 'B'] });
  assert.deepEqual([...C.closure(p).get('A')].sort(), ['B', 'C']);
  const red = C.reduce(p);
  assert.deepEqual(predOf(red), { A: [], B: ['A'], C: ['B'] });
  assert.deepEqual(red.activities.map((a) => a.id), ['A', 'B', 'C']);
});

test('Electrona (Tema 6, ejercicio 5) y el Ejercicio 6 son su propia reducción', () => {
  const pe = proj(ELECTRONA, ELECTRONA_D);
  assert.deepEqual(predOf(C.reduce(pe)), predOf(pe));
  const ex = E.get('ej6');
  const p6 = P.parse(ex.rows, ex.mode).project;
  assert.deepEqual(predOf(C.reduce(p6)), predOf(p6));
});

test('closure y reduce coinciden con el oráculo en 1000 tablas de hasta 8 actividades', () => {
  const r = rng(31);
  for (let k = 0; k < 1000; k++) {
    const pred = randomPred(r, 1 + Math.floor(r() * 8), r() * 0.7);
    const p = proj(pred);
    const oc = O.closure(pred);
    for (const id of Object.keys(pred)) assert.deepEqual([...C.closure(p).get(id)].sort(), [...oc.get(id)].sort());
    assert.deepEqual(key(edgesOf(predOf(C.reduce(p)))), key(O.reduction(pred)));
  }
});

// ── explicaciones ──────────────────────────────────────────────────────────────────────────────────────────
test('explain: cada redundancia con su camino más corto, inicios y finales', () => {
  const ex = C.explain(parsed({ A: [], B: ['A'], C: ['B'], D: ['A', 'C'], E: [] }));
  assert.deepEqual(ex.redundant, [{ edge: ['A', 'D'], path: ['A', 'B', 'C', 'D'] }]);
  assert.equal(ex.cycle, null);
  assert.deepEqual(ex.starts, ['A', 'E']);
  assert.deepEqual(ex.ends, ['D', 'E']);
});

test('explain: «K es lo último» traducido a todas en Electrona solo da redundancias, con caminos válidos', () => {
  const lazy = Object.assign({}, ELECTRONA, { K: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'] });
  const ex = C.explain(parsed(lazy, ELECTRONA_D));
  assert.deepEqual(ex.redundant.map((x) => x.edge.join('>')), ['A>K', 'B>K', 'C>K', 'D>K', 'E>K', 'F>K', 'G>K', 'H>K', 'I>K']);
  assert.deepEqual(ex.redundant.find((x) => x.edge[0] === 'F').path, ['F', 'G', 'K']);
  assert.deepEqual(ex.ends, ['K']);
});

test('explain: con un ciclo da su recorrido (el de la F1) y nada más', () => {
  const ex = C.explain(parsed({ A: ['C'], B: ['A'], C: ['B'], D: [] }));
  assert.deepEqual(ex.cycle, P.parse([{ id: 'A', duration: '1', links: 'C' }, { id: 'B', duration: '1', links: 'A' }, { id: 'C', duration: '1', links: 'B' }, { id: 'D', duration: '1', links: '' }], 'pred').report.errors[0].ids);
  assert.deepEqual(ex.redundant, []);
});

test('explain: los caminos son los del oráculo (más corto, primero en orden) en 1000 tablas', () => {
  const r = rng(47);
  for (let k = 0; k < 1000; k++) {
    const pred = randomPred(r, 2 + Math.floor(r() * 7), 0.2 + r() * 0.6);
    const ex = C.explain(parsed(pred));
    const red = new Set(O.reduction(pred).map((e) => e.join('>')));
    const expected = edgesOf(pred).filter((e) => !red.has(e.join('>')));
    assert.deepEqual(key(ex.redundant.map((x) => x.edge)), key(expected));
    for (const x of ex.redundant) {
      assert.deepEqual(x.path, O.shortestWithout(pred, x.edge));
      assert.ok(x.path.length >= 3);
    }
  }
});

// ── diagnóstico ────────────────────────────────────────────────────────────────────────────────────────────
const REF = { A: [], B: ['A'], C: ['A'], D: ['B', 'C'] };

test('diagnose: la referencia frente a sí misma no da nada', () => {
  const d = C.diagnose(proj(REF), parsed(REF), null, { durations: true });
  assert.equal(d.ok, true);
  assert.deepEqual(d.issues, []);
  assert.deepEqual(d.warnings, []);
});

test('diagnose: precedencia que falta (de la reducción de la referencia)', () => {
  const d = C.diagnose(proj(REF), parsed({ A: [], B: ['A'], C: ['A'], D: ['B'] }), null, { durations: true });
  assert.deepEqual(d.issues, [{ code: 'missingPrecedence', ids: ['C', 'D'] }]);
  assert.equal(d.ok, false);
});

test('diagnose: una precedencia redundante de la referencia no se cuenta como otra que falta', () => {
  // Referencia A→B, B→C y A→C (redundante). El alumno solo escribe A→B: falta B→C y nada más.
  const d = C.diagnose(proj({ A: [], B: ['A'], C: ['A', 'B'] }), parsed({ A: [], B: ['A'], C: [] }), null, { durations: true });
  assert.deepEqual(d.issues, [{ code: 'missingPrecedence', ids: ['B', 'C'] }]);
});

test('diagnose: precedencia falsa (escrita y fuera del cierre de la referencia)', () => {
  const d = C.diagnose(proj(REF), parsed({ A: [], B: ['A'], C: ['A', 'B'], D: ['B', 'C'] }), null, { durations: true });
  assert.deepEqual(d.issues, [{ code: 'falsePrecedence', ids: ['B', 'C'] }]);
});

test('diagnose: precedencia invertida, como un solo error', () => {
  const d = C.diagnose(proj(REF), parsed({ A: [], B: ['A'], C: ['A', 'D'], D: ['B'] }), null, { durations: true });
  assert.deepEqual(d.issues, [{ code: 'inverted', ids: ['C', 'D'] }]);
});

test('diagnose: precedencia redundante como aviso, con su camino, y la tabla es correcta', () => {
  const d = C.diagnose(proj(REF), parsed({ A: [], B: ['A'], C: ['A'], D: ['A', 'B', 'C'] }), null, { durations: true });
  assert.equal(d.ok, true);
  assert.deepEqual(d.warnings, [{ code: 'redundant', ids: ['A', 'D'], path: ['A', 'B', 'D'] }]);
});

test('diagnose: actividad que falta, que sobra y duración distinta, con el emparejamiento dado', () => {
  // El alumno llamó X a la C de la referencia, olvidó D y añadió Z; B dura 2 en vez de 1.
  const ref = proj(REF);
  const stu = parsed({ A: [], B: ['A'], X: ['A'], Z: ['B'] }, { A: 1, B: 2, X: 1, Z: 1 });
  const d = C.diagnose(ref, stu, { A: 'A', B: 'B', X: 'C' }, { durations: true });
  assert.deepEqual(codes(d), ['missingActivity', 'extraActivity', 'duration']);
  assert.deepEqual(d.issues[0], { code: 'missingActivity', ids: [], ref: ['D'] });
  assert.deepEqual(d.issues[1], { code: 'extraActivity', ids: ['Z'] });
  assert.deepEqual(d.issues[2], { code: 'duration', ids: ['B'], ref: ['B'] });
});

test('diagnose: con el emparejamiento, los errores se dan con los identificadores del alumno', () => {
  const d = C.diagnose(proj(REF), parsed({ A: [], B: ['A'], X: ['A'], D: ['B'] }), { A: 'A', B: 'B', X: 'C', D: 'D' }, { durations: true });
  assert.deepEqual(d.issues, [{ code: 'missingPrecedence', ids: ['X', 'D'], ref: ['C', 'D'] }]);
});

test('diagnose: con durations: false no se comparan duraciones (enunciados solo de estructura)', () => {
  const d = C.diagnose(proj(REF, null), parsed(REF, { A: 9, B: 9, C: 9, D: 9 }), null, { durations: false });
  assert.equal(d.ok, true);
});

test('diagnose: con un ciclo no se diagnostica nada más; con otros errores de la tabla, «invalid»', () => {
  const cyc = C.diagnose(proj(REF), parsed({ A: ['D'], B: ['A'], C: ['A'], D: ['B', 'C'] }), null, { durations: true });
  assert.deepEqual(codes(cyc), ['cycle']);
  assert.ok(cyc.issues[0].ids.length >= 2);
  const bad = P.parse([{ id: 'A', duration: 'x', links: '' }], 'pred');
  assert.deepEqual(codes(C.diagnose(proj(REF), bad, null, { durations: true })), ['invalid']);
});

test('diagnose: Electrona sin B en D y E da dos que faltan, y C → H como aviso', () => {
  const wrong = Object.assign({}, ELECTRONA, { D: ['A'], E: ['C'], H: ['C', 'D', 'E'] });
  const d = C.diagnose(proj(ELECTRONA, ELECTRONA_D), parsed(wrong, ELECTRONA_D), null, { durations: true });
  assert.deepEqual(d.issues, [{ code: 'missingPrecedence', ids: ['B', 'D'] }, { code: 'missingPrecedence', ids: ['B', 'E'] }]);
  assert.deepEqual(d.warnings, [{ code: 'redundant', ids: ['C', 'H'], path: ['C', 'E', 'H'] }]);
});

test('diagnose (propiedades del prototipo, 3000 tablas con semilla)', () => {
  const r = rng(20261110);
  let removed = 0, inverted = 0, added = 0;
  for (let k = 0; k < 3000; k++) {
    const n = 2 + Math.floor(r() * 14);
    const ref = randomPred(r, n, 0.1 + r() * 0.5);
    const pr = proj(ref);
    // sin errores ⇔ mismo cierre, frente a otra tabla cualquiera sin ciclos
    const other = randomPred(r, n, 0.1 + r() * 0.5);
    const d = C.diagnose(pr, parsed(other), null, { durations: true });
    const oc = O.closure(ref), oo = O.closure(other);
    const same = Object.keys(ref).every((id) => key([...oc.get(id)].map((x) => [x])).join() === key([...oo.get(id)].map((x) => [x])).join());
    assert.equal(d.ok, same);
    // la referencia con redundancias añadidas solo da avisos
    const extra = Object.fromEntries(Object.keys(ref).map((a) => [a, [...ref[a]]]));
    for (const p of Object.keys(ref)) for (const a of oc.get(p)) if (r() < 0.3 && !extra[a].includes(p)) extra[a].push(p);
    assert.equal(C.diagnose(pr, parsed(extra), null, { durations: true }).ok, true);
    const red = O.reduction(ref);
    if (red.length) {
      const [p, a] = red[Math.floor(r() * red.length)];
      const minus = Object.assign({}, ref, { [a]: ref[a].filter((x) => x !== p) });
      assert.deepEqual(C.diagnose(pr, parsed(minus), null, { durations: true }).issues, [{ code: 'missingPrecedence', ids: [p, a] }]);
      removed++;
      const inv = Object.assign({}, minus, { [p]: [...ref[p], a] });
      assert.deepEqual(C.diagnose(pr, parsed(inv), null, { durations: true }).issues, [{ code: 'inverted', ids: [p, a] }]);
      inverted++;
    }
    const ids = Object.keys(ref);
    const cand = [];
    for (const p of ids) for (const a of ids) if (p !== a && !oc.get(p).has(a) && !oc.get(a).has(p)) cand.push([p, a]);
    if (cand.length) {
      const [p, a] = cand[Math.floor(r() * cand.length)];
      const plus = Object.assign({}, ref, { [a]: [...ref[a], p] });
      assert.deepEqual(C.diagnose(pr, parsed(plus), null, { durations: true }).issues, [{ code: 'falsePrecedence', ids: [p, a] }]);
      added++;
    }
  }
  assert.ok(removed > 2000 && inverted > 2000 && added > 2000);
});

// ── T027 (F3): el diagnóstico con varios errores a la vez, entero (no solo «ok») ───────────────────────────
test('T027 · diagnose: una actividad inventada usada como predecesora es solo una actividad que sobra', () => {
  const d = C.diagnose(proj(REF), parsed({ A: [], Z: [], B: ['A', 'Z'], C: ['A'], D: ['B', 'C'] }), null, { durations: true });
  assert.deepEqual(d.issues, [{ code: 'extraActivity', ids: ['Z'] }]);
  assert.deepEqual(d.warnings, []);
});

test('T027 · diagnose: una precedencia que el cierre del alumno ya implica no falta, aunque no la escriba', () => {
  const d = C.diagnose(proj({ A: [], B: [], C: ['A'] }), parsed({ A: [], B: ['A'], C: ['B'] }), null, { durations: true });
  assert.deepEqual(d.issues, [{ code: 'falsePrecedence', ids: ['A', 'B'] }, { code: 'falsePrecedence', ids: ['B', 'C'] }]);
});

test('T027 · diagnose: la contraria por un camino no es una invertida', () => {
  const d = C.diagnose(proj({ A: [], B: ['A'], C: [] }), parsed({ A: ['C'], B: [], C: ['B'] }), null, { durations: true });
  assert.deepEqual(d.issues, [{ code: 'missingPrecedence', ids: ['A', 'B'] },
    { code: 'falsePrecedence', ids: ['B', 'C'] }, { code: 'falsePrecedence', ids: ['C', 'A'] }]);
});

test('T027 · diagnose: todas las falsas, sin recortar', () => {
  const ids = 'ABCDEFG'.split('');
  const ref = Object.fromEntries(ids.map((id) => [id, []]));
  const pairs = ids.flatMap((x, i) => ids.slice(i + 1).map((y) => [x, y])).slice(0, 16);
  const stu = Object.fromEntries(ids.map((id) => [id, pairs.filter((e) => e[1] === id).map((e) => e[0])]));
  const d = C.diagnose(proj(ref), parsed(stu), null, { durations: true });
  assert.equal(d.issues.length, 16);
  assert.ok(d.issues.every((i) => i.code === 'falsePrecedence'));
  assert.deepEqual(key(d.issues.map((i) => i.ids)), key(pairs));
});

test('T027 · diagnose: una redundante sobre una precedencia falsa no avisa (ya es un error)', () => {
  const d = C.diagnose(proj({ A: [], B: ['A'], C: [] }), parsed({ A: [], B: ['A'], C: ['A', 'B'] }), null, { durations: true });
  assert.deepEqual(d.issues, [{ code: 'falsePrecedence', ids: ['A', 'C'] }, { code: 'falsePrecedence', ids: ['B', 'C'] }]);
  assert.deepEqual(d.warnings, []);
});

test('T027 · diagnose: en un enunciado con duraciones, una tabla sin ninguna da un error de duración por actividad', () => {
  const d = C.diagnose(proj(REF), parsed(REF, null), null, { durations: true });
  assert.deepEqual(d.issues, ['A', 'B', 'C', 'D'].map((id) => ({ code: 'duration', ids: [id] })));
});
