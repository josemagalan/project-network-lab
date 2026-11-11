'use strict';
// core/mindummy: mínimo de ficticias con presupuesto fijo (spec f2a-pert-ficticias, AC4, AC9 y AC16; plan P3 y T002).
const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../js/core/project.js');
const E = require('../js/core/examples.js');
const A = require('../js/core/aoa.js');
const M = require('../js/core/mindummy.js');
const O = require('./oracle-mindummy.js');
// Las medidas de tiempo solo se comprueban sin cobertura: `npm run coverage` instrumenta el código y corre los archivos en
// paralelo, y con 2 CPU el peor caso pasaba de vez en cuando del límite (CI 56 y 59). `npm test` las sigue comprobando.
const TIMED = !process.env.NODE_V8_COVERAGE;

const load = (rows, mode = 'succ', opts) => {
  const { project, report } = P.parse(rows, mode, opts);
  assert.ok(project, JSON.stringify(report));
  return project;
};
const loadEx = (id) => { const ex = E.get(id); return load(ex.rows, ex.mode, { structureOnly: !!ex.structureOnly }); };
const fromSucc = (succ) => load(Object.keys(succ).sort().map((id) => ({ id, duration: '', links: succ[id].join(', ') })), 'succ', { structureOnly: true });
function rng(seed) { let s = seed >>> 0; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; }
const randomSucc = (rand, n, dens) => {
  const ids = Array.from({ length: n }, (_, i) => String.fromCharCode(65 + i));
  return Object.fromEntries(ids.map((a, j) => [a, ids.slice(j + 1).filter(() => rand() < dens)]));
};

test('AC4: coincide con el oráculo de fuerza bruta en 400 tablas aleatorias de hasta 6 actividades', () => {
  const rand = rng(4);
  for (let i = 0; i < 400; i++) {
    const succ = randomSucc(rand, 1 + Math.floor(rand() * 6), 0.45);
    const r = M.solve(fromSucc(succ));
    assert.equal(r.value, O.minDummies(succ).value, `tabla ${i}: ${JSON.stringify(succ)}`);
    assert.equal(r.exact, true, `tabla ${i}: debería demostrarse`);
  }
});

test('AC4: nunca pone más ficticias que las reglas, y la red que devuelve es exacta', () => {
  const rand = rng(99);
  for (let i = 0; i < 150; i++) {
    const p = fromSucc(randomSucc(rand, 2 + Math.floor(rand() * 11), 0.3));
    const r = M.solve(p, { budget: 3000 });   // basta para comprobar las cotas y la red; no hace falta demostrar
    assert.ok(r.value <= A.build(p).dummies.length, `tabla ${i}`);
    assert.ok(r.lower <= r.value, `tabla ${i}: cota`);
    assert.equal(r.net.dummies.length, r.value, `tabla ${i}: la red tiene value ficticias`);
    assert.deepEqual(A.verify(r.net, p), { ok: true, problems: [] }, `tabla ${i}`);
  }
});

test('AC16: A<C,D,E; B<C,E; D<E — el mínimo es 2 (las reglas ponen 3)', () => {
  const p = fromSucc({ A: ['C', 'D', 'E'], B: ['C', 'E'], C: [], D: ['E'], E: [] });
  const r = M.solve(p);
  assert.deepEqual([r.value, r.exact], [2, true]);
  assert.equal(A.build(p).dummies.length, 3);
  assert.deepEqual(A.verify(r.net, p), { ok: true, problems: [] });
});

test('AC4: los seis ejercicios del autor, exactos y en menos de 2 s cada uno', () => {
  const want = { ej1: 2, ej2: 2, ej3: 4, ej4: 3, ej6: 3, ej7: 5 };
  for (const [id, v] of Object.entries(want)) {
    const t0 = Date.now();
    const r = M.solve(loadEx(id));
    if (TIMED) assert.ok(Date.now() - t0 < 2000, `${id}: ${Date.now() - t0} ms`);
    assert.deepEqual([r.value, r.exact], [v, true], id);
  }
});

test('AC9: con el presupuesto agotado no se declara exacto, y la cota queda por debajo', () => {
  const r = M.solve(loadEx('ej7'), { budget: 1 });
  assert.equal(r.exact, false);
  assert.ok(r.lower <= r.value);
  assert.equal(r.value, 5, 'sin buscar, el valor es el de las reglas');
  assert.deepEqual(M.solve(loadEx('ej7'), { budget: 1 }), r, 'mismo presupuesto, mismo resultado');
});

test('determinista y sin reloj: dos llamadas con el presupuesto por defecto dan lo mismo', () => {
  const p = fromSucc({ X: ['P', 'Q'], Y: ['Q', 'R'], Z: ['P', 'R'], P: [], Q: [], R: [] });
  const a = M.solve(p); const b = M.solve(p);
  assert.deepEqual(a, b);
  assert.deepEqual([a.value, a.exact], [6, true]);
  assert.equal(M.DEFAULT_BUDGET, 80000, "presupuesto calibrado en T010 (plan §7)");
});

test('aoa.methods.min delega en el mínimo', () => {
  const p = fromSucc({ A: ['C', 'D', 'E'], B: ['C', 'E'], C: [], D: ['E'], E: [] });
  const net = A.build(p, { method: 'min' });
  assert.equal(net.method, 'min');
  assert.equal(net.dummies.length, 2);
  assert.deepEqual(A.verify(net, p), { ok: true, problems: [] });
});

// ---------- T021: precedencias implícitas que aprovecha cada ficticia (contador, AC9 y AC16) ----------

test('AC16: la red mínima de A<C,D,E; B<C,E; D<E aprovecha la precedencia implícita A → E', () => {
  const p = fromSucc({ A: ['C', 'D', 'E'], B: ['C', 'E'], C: [], D: ['E'], E: [] });
  const { net } = M.solve(p);
  const pairs = [...new Set(net.dummies.flatMap((d) => d.implied.map(([a, b]) => `${a}>${b}`)))];
  assert.deepEqual(pairs, ['A>E']);
  assert.ok(net.dummies.every((d) => Array.isArray(d.implied)));
  // Lo mismo sin escribir A→E: la tabla reducida es la misma.
  const q = fromSucc({ A: ['C', 'D'], B: ['C', 'E'], C: [], D: ['E'], E: [] });
  assert.deepEqual(M.solve(q).net.dummies.map((d) => d.implied), net.dummies.map((d) => d.implied));
});

test('AC9: la red de las reglas nunca aprovecha una precedencia implícita (seis ejercicios y 1000 tablas)', () => {
  for (const id of ['ej1', 'ej2', 'ej3', 'ej4', 'ej6', 'ej7']) {
    assert.ok(A.build(loadEx(id)).dummies.every((d) => d.implied.length === 0), id);
  }
  const rand = rng(21);
  for (let i = 0; i < 1000; i++) {
    const net = A.build(fromSucc(randomSucc(rand, 2 + Math.floor(rand() * 9), 0.4)));
    assert.ok(net.dummies.every((d) => d.implied.length === 0), `tabla ${i}`);
  }
});

test('AC9: lo implícito que aprovecha la red mínima es siempre una precedencia transitiva de la tabla', () => {
  const rand = rng(7);
  let seen = 0;
  for (let i = 0; i < 300; i++) {
    const succ = randomSucc(rand, 3 + Math.floor(rand() * 5), 0.45);
    const p = fromSucc(succ);
    const { reach, direct } = A._reduce(p);
    for (const d of M.solve(p).net.dummies) {
      for (const [a, b] of d.implied) {
        seen++;
        assert.ok(reach[a].has(b), `tabla ${i}: ${a} → ${b} no es una precedencia`);
        assert.ok(!direct[a].includes(b), `tabla ${i}: ${a} → ${b} es directa`);
      }
    }
  }
  assert.ok(seen > 0, 'la muestra incluye casos que aprovechan precedencias implícitas');
});

// ---------- Revisión de cierre de la F2a, F1: el presupuesto acota todo el trabajo ----------

// Las llamadas que podrían no terminar van en otro proceso con tiempo máximo: node:test no corta un bucle síncrono.
const { spawnSync } = require('node:child_process');
function solveApart(succ, budget, timeout) {
  const code = `const P = require(${JSON.stringify(require.resolve('../js/core/project.js'))});
    const A = require(${JSON.stringify(require.resolve('../js/core/aoa.js'))});
    const M = require(${JSON.stringify(require.resolve('../js/core/mindummy.js'))});
    const succ = ${JSON.stringify(succ)};
    const p = P.parse(Object.keys(succ).map((id) => ({ id, duration: '', links: succ[id].join(', ') })), 'succ', { structureOnly: true }).project;
    const r = M.solve(p, ${budget == null ? 'undefined' : JSON.stringify({ budget })});
    process.stdout.write(JSON.stringify({ work: r.work, exact: r.exact, lower: r.lower, value: r.value, ok: A.verify(r.net, p).ok }));`;
  const run = spawnSync(process.execPath, ['-e', code], { timeout, encoding: 'utf8' });
  assert.equal(run.signal, null, `no termina en ${timeout / 1000} s`);
  assert.equal(run.status, 0, run.stderr);
  return JSON.parse(run.stdout);
}
const independentSucc = (k) => Object.fromEntries(Array.from({ length: k }, (_, i) => [`A${i}`, []]));

test('F1: con muchas actividades sin predecesoras el presupuesto se respeta (antes no terminaba)', () => {
  const small = solveApart(independentSucc(12), 2000, 20000);
  assert.equal(small.exact, false);
  assert.ok(small.work <= 2000 + 5, `trabajo ${small.work}`);
  assert.ok(small.lower <= small.value && small.value <= 11);
  assert.equal(small.ok, true);
  // Mismo enlace, mismo intervalo: el trabajo no depende del reloj.
  assert.deepEqual(solveApart(independentSucc(12), 2000, 20000), small);
});

test('F1: las tablas de 30 actividades más difíciles para la búsqueda terminan dentro del presupuesto por defecto', () => {
  const layers = {};   // 15 capas de 2, cada actividad precede a las dos de la capa siguiente
  for (let l = 0; l < 15; l++) for (const x of ['A', 'B']) layers[`${x}${l}`] = l < 14 ? [`A${l + 1}`, `B${l + 1}`] : [];
  const mixed = independentSucc(20);   // 20 sin predecesoras y una cadena de 10
  for (let i = 0; i < 10; i++) mixed[`C${i}`] = i < 9 ? [`C${i + 1}`] : [];
  const rand = rng(7);   // dispersa: densidad 0,05
  const ids = Array.from({ length: 30 }, (_, i) => `S${i}`);
  const sparse = Object.fromEntries(ids.map((a, j) => [a, ids.slice(j + 1).filter(() => rand() < 0.05)]));
  for (const [name, succ] of [['30 sin predecesoras', independentSucc(30)], ['capas de 2', layers], ['20 + cadena de 10', mixed], ['dispersa', sparse]]) {
    const r = solveApart(succ, null, 30000);
    assert.ok(r.work <= M.DEFAULT_BUDGET + 5, `${name}: trabajo ${r.work}`);
    assert.ok(r.lower <= r.value, name);
    assert.equal(r.ok, true, `${name}: la red devuelta es correcta`);
  }
});
