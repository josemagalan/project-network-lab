'use strict';
// core/generator: proyectos con semilla y niveles de dificultad (spec f3a-generador-calculo, AC1–AC3 y AC14;
// plan §0, §3, P6 y T002). Niveles y algoritmo calibrados con el prototipo de clarify.
const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const P = require('../js/core/project.js');
const C = require('../js/core/cpm.js');
const M = require('../js/core/mindummy.js');
const G = require('../js/core/generator.js');
// Las medidas de tiempo solo se comprueban sin cobertura: `npm run coverage` instrumenta el código y corre los archivos en
// paralelo, y con 2 CPU el peor caso pasaba de vez en cuando del límite (CI 56 y 59). `npm test` las sigue comprobando.
const TIMED = !process.env.NODE_V8_COVERAGE;

const parse = (rows) => P.parse(rows, 'pred');
const links = (r) => String(r.links).split(/[\s,;]+/).filter(Boolean).sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
const key = (rows) => rows.map((r) => `${r.id}${r.duration}:${links(r).join(',')}`).join(';');
const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').concat(['AA', 'AB', 'AC', 'AD']);

test('niveles literales de la spec (aclarada el 2026-11-10)', () => {
  assert.equal(G.VERSION, 1);
  assert.deepEqual(G.LEVELS, {
    easy: { n: [6, 7], pred: 1.2, dummies: [0, 1], critical: [1, 1], dmax: 9 },
    medium: { n: [9, 10], pred: 1.6, dummies: [2, 3], critical: [1, 2], dmax: 12 },
    hard: { n: [12, 14], pred: 2.0, dummies: [3, 5], critical: [2, 3], dmax: 15 },
  });
  assert.equal(G.EXACT_N, 16);
  assert.equal(G.MAX_TRIES, 500);
  assert.equal(G.BUDGET, 1000);
});

test('AC1: misma semilla y parámetros, misma tabla; semillas distintas, tablas distintas', () => {
  for (const lv of Object.keys(G.LEVELS)) {
    const a = G.generate(123, G.LEVELS[lv]);
    const b = G.generate(123, G.LEVELS[lv]);
    assert.ok(a.ok);
    assert.deepEqual(a, b);
    const keys = new Set();
    for (let s = 1; s <= 40; s++) keys.add(key(G.generate(s, G.LEVELS[lv]).rows));
    assert.ok(keys.size >= 38, `${lv}: solo ${keys.size} tablas distintas en 40 semillas`);
  }
});

test('AC1: la misma tabla en otro proceso de Node', () => {
  const file = path.join(__dirname, '..', 'js', 'core', 'generator.js');
  const code = `const G = require(${JSON.stringify(file)}); process.stdout.write(JSON.stringify([5, 6].map((s) => G.generate(s, G.LEVELS.medium))));`;
  const other = JSON.parse(execFileSync(process.execPath, ['-e', code], { encoding: 'utf8' }));
  assert.deepEqual(other, [5, 6].map((s) => G.generate(s, G.LEVELS.medium)));
});

test('P6: instantáneas de 3 semillas por nivel (versión 1; cambiarlas es cambiar de versión)', () => {
  const snap = {
    easy: ['A9:;B9:A;C7:A;D9:B;E8:A;F9:E;G2:E', 'A4:;B9:;C1:;D9:A,B;E1:;F2:D;G2:F', 'A3:;B9:;C7:B;D4:A;E7:C;F2:D,E;G4:D,E'],
    medium: ['A1:;B5:A;C11:B;D11:A;E5:;F10:A,E;G10:A;H8:;I3:E,G,H', 'A12:;B1:;C12:;D7:A,B;E3:;F9:D;G1:F;H10:C,E,F;I11:H;J10:',
      'A10:;B1:A;C11:;D3:;E11:C;F11:B,E;G9:D,E;H9:F,G;I5:G;J1:H'],
    hard: ['A7:;B7:;C15:A,B;D14:C;E2:D;F12:E;G2:C;H9:F,G;I6:A;J3:D,I;K2:J;L3:H,K;M7:H,K;N9:L,M',
      'A3:;B8:A;C8:A;D6:B,C;E1:D;F10:C;G2:D;H12:F,G;I11:G;J9:;K11:F,I,J;L5:;M2:K',
      'A2:;B2:A;C14:B;D13:C;E8:D;F8:D;G7:E,F;H8:F;I11:F;J2:H;K8:E;L7:H,K;M4:G,L'],
  };
  for (const [lv, keys] of Object.entries(snap)) keys.forEach((k, i) => assert.equal(key(G.generate(i + 1, G.LEVELS[lv]).rows), k, `${lv}, semilla ${i + 1}`));
});

test('AC2 y AC3: 1000 semillas por nivel cumplen el nivel; el peor caso del difícil tarda menos de 1 s', () => {
  for (const [lv, L] of Object.entries(G.LEVELS)) {
    let worst = 0;
    for (let s = 1; s <= 1000; s++) {
      const t0 = process.hrtime.bigint();
      const g = G.generate(s, L);
      const ms = Number(process.hrtime.bigint() - t0) / 1e6;
      worst = Math.max(worst, ms);
      const msg = `${lv}, semilla ${s}`;
      assert.ok(g.ok, msg);
      assert.equal(g.mode, 'pred');
      const { project, report } = parse(g.rows);
      assert.ok(project, msg);
      assert.deepEqual(report.errors, [], msg);
      assert.deepEqual(report.warnings, [], `${msg}: tiene precedencias redundantes`);
      const n = g.rows.length;
      assert.ok(n >= L.n[0] && n <= L.n[1], msg);
      // ids A, B, C… en orden topológico: cada predecesora tiene una letra anterior
      g.rows.forEach((r, i) => {
        assert.equal(r.id, LETTERS[i], msg);
        for (const p of links(r)) assert.ok(LETTERS.indexOf(p) < i, `${msg}: ${p} → ${r.id}`);
        const d = Number(r.duration);
        assert.ok(Number.isInteger(d) && d >= 1 && d <= L.dmax, msg);
      });
      const sol = C.solve(project);
      assert.ok(sol.criticalCount >= L.critical[0] && sol.criticalCount <= L.critical[1], msg);
      assert.equal(g.info.critical, sol.criticalCount, msg);
      assert.equal(g.info.paths, sol.paths.count, msg);
      assert.ok(g.info.dummies >= L.dummies[0] && g.info.dummies <= L.dummies[1], msg);
      assert.ok(g.info.rulesDummies >= g.info.dummies, msg);
      if (s % 10 === 0) {   // el mínimo, demostrado de nuevo con el presupuesto por defecto de la F2a
        const md = M.solve(project);
        assert.ok(md.exact, msg);
        assert.equal(md.value, g.info.dummies, msg);
      }
    }
    if (lv === 'hard' && TIMED) assert.ok(worst < 1000, `peor caso del difícil: ${worst.toFixed(0)} ms`);
  }
});

test('sin parámetro de ficticias no se calcula el mínimo; 30 actividades con ids hasta AD', () => {
  const g = G.generate(9, { n: [30, 30], pred: 3.0, dummies: null, critical: [3, 3], dmax: 30 });
  assert.ok(g.ok);
  assert.equal(g.info.dummies, null);
  assert.deepEqual(g.rows.map((r) => r.id), LETTERS);
  const { project, report } = parse(g.rows);
  assert.ok(project);
  assert.deepEqual(report.warnings, []);
  assert.equal(C.solve(project).criticalCount, 3);
});

test('AC14: check da un código por cada parámetro imposible, y nada con los niveles', () => {
  for (const L of Object.values(G.LEVELS)) assert.deepEqual(G.check(L), { ok: true, issues: [] });
  const base = { n: [9, 10], pred: 1.6, dummies: [2, 3], critical: [1, 2], dmax: 12 };
  const codes = (p) => G.check(Object.assign({}, base, p)).issues.map((i) => `${i.code}:${i.key}`);
  assert.deepEqual(codes({ n: [3, 10] }), ['range:n']);
  assert.deepEqual(codes({ n: [10, 31] }), ['range:n']);
  assert.deepEqual(codes({ n: [10, 9] }), ['range:n']);
  assert.deepEqual(codes({ pred: 0.9 }), ['range:pred']);
  assert.deepEqual(codes({ pred: 3.1 }), ['range:pred']);
  assert.deepEqual(codes({ pred: 1.65 }), ['range:pred']);   // paso de 0,1
  assert.deepEqual(codes({ critical: [0, 1] }), ['range:critical']);
  assert.deepEqual(codes({ critical: [2, 4] }), ['range:critical']);
  assert.deepEqual(codes({ dmax: 1 }), ['range:dmax']);
  assert.deepEqual(codes({ dmax: 31 }), ['range:dmax']);
  assert.deepEqual(codes({ dmax: 2.5 }), ['range:dmax']);
  assert.deepEqual(codes({ dummies: [3, 2] }), ['range:dummies']);
  assert.deepEqual(codes({ n: [12, 17] }), ['dummiesNoExact:dummies']);
  assert.deepEqual(codes({ n: [12, 17], dummies: null }), []);
  assert.deepEqual(codes({ n: [9, 9], dummies: [4, 5] }), ['dummiesTooMany:dummies']);   // ⌊9 / 3⌋ = 3
  assert.deepEqual(codes({ n: [9, 9], dummies: [3, 5] }), []);
  assert.deepEqual(codes({ n: [3, 31], pred: 4 }), ['range:n', 'range:pred']);
});

test('AC14: con check imposible no se genera; sin tabla en 500 intentos, notFound con el criterio que más rechaza', () => {
  const bad = G.generate(1, { n: [3, 3], pred: 1.2, dummies: null, critical: [1, 1], dmax: 9 });
  assert.equal(bad.ok, false);
  assert.equal(bad.reason, 'check');
  assert.deepEqual(bad.issues.map((i) => i.code), ['range']);
  const t0 = Date.now();
  const nf = G.generate(1, { n: [4, 4], pred: 1.0, dummies: [0, 0], critical: [3, 3], dmax: 9 });
  assert.equal(nf.ok, false);
  assert.equal(nf.reason, 'notFound');
  assert.equal(nf.worst, 'critical');
  assert.equal(nf.tries, 500);
  if (TIMED) assert.ok(Date.now() - t0 < 2000);
});
