'use strict';
// core/gpr: clases de Valls y Lino, traza paso a paso y «¿Y si…?» (spec f5a-precedencias-generalizadas, AC4, AC8, AC11;
// plan §0, §3, P2; T005). Las clases de los ejemplos vienen de la tabla de la spec (gpr.py, con ±1).
const test = require('node:test');
const assert = require('node:assert/strict');
const G = require('../js/core/gpr.js');
const X = require('../js/core/gprex.js');
const R = require('../js/core/rng.js');

const ok = (rs) => { const { project, report } = G.parse(rs); assert.deepEqual(report.errors, []); return project; };
const ex = (id) => ok(X.get(id).rows);
const cls = (s) => Object.fromEntries(Object.entries(s.classes).map(([k, v]) => [k, v.cls]));
const withD = (gp, id, d) => ({ ...gp, activities: gp.activities.map((a) => (a.id === id ? { ...a, d } : a)) });

// ---------- clases (AC4) ----------

test('F5a T005: clases de los ejemplos de la spec', () => {
  assert.deepEqual(cls(G.solve(ex('rb'))), { G: 'normal', M: 'normal', V: 'normal', Y: 'neutral', W: 'neutral', X: 'normal' });
  assert.deepEqual(cls(G.solve(ex('rv'))), { A: 'normal', B: 'reverse', C: 'normal' });
  assert.deepEqual(cls(G.solve(ex('cc'))), { A: 'neutral', B: 'normal' });
  assert.deepEqual(cls(G.solve(ex('n16'))), { A: 'normal', B: 'neutral' });
  assert.deepEqual(cls(G.solve(ex('fc'))), { A: 'normal', B: 'normal' });
  assert.deepEqual(G.solve(ex('rv')).classes.B, { cls: 'reverse', up: '-', down: '+' });
});

test('F5a T007: el ejemplo de las clases trae las tres raras, y entre todos los ejemplos están las seis (AC4)', () => {
  // A (4); B (5) con A FF+2; C (3) con A FF+2 y B CC+2; D (3) con C CC. Comprobado a mano: T = 6; alargar C a 4 da 7 y
  // acortarla a 2 también (bicrítica); D a 4 da 7 y a 2 deja 6 (normal creciente); B a 6 deja 6 y a 4 da 7 (al revés
  // decreciente).
  assert.deepEqual(cls(G.solve(ex('cl'))), { A: 'normal', B: 'decReverse', C: 'bicritical', D: 'incNormal' });
  const all = new Set(X.list().flatMap((e) => Object.values(cls(G.solve(ex(e.id))))));
  assert.deepEqual([...all].sort(), ['bicritical', 'decReverse', 'incNormal', 'neutral', 'normal', 'reverse']);
});

test('F5a T005: una actividad crítica de duración 0 no tiene clase; se da el efecto de alargarla (A3)', () => {
  const s = G.solve(ok([{ id: 'A', duration: '5', links: '' }, { id: 'B', duration: '0', links: 'A' }]));
  assert.deepEqual(s.classes.B, { cls: null, up: '+', down: null });
});

test('F5a T005: la clase es el efecto de ±δ y, donde la duración no cruza un cambio de pendiente, también de ±1', () => {
  const r = R.mulberry32(7);   // con esta semilla salen las seis clases (la bicrítica es rara)
  const types = ['FS', 'SS', 'FF', 'SF'];
  const sign = (x) => (x > 1e-9 ? '+' : x < -1e-9 ? '-' : '0');
  const seen = new Set();
  for (let it = 0; it < 1500; it++) {
    const k = R.int(r, 2, 7);
    const ids = Array.from({ length: k }, (_, i) => String.fromCharCode(65 + i));
    const rs = ids.map((id, j) => {
      const links = []; const used = new Set();
      for (let i = 0; i < j; i++) {
        if (r() < 0.4) {
          const type = types[R.int(r, 0, 3)];
          if (used.has(type + i)) continue;
          used.add(type + i);
          links.push(G.format({ from: ids[i], type, lag: [0, 0, 1, 2][R.int(r, 0, 3)] }, 'en'));
        }
      }
      return { id, duration: String(R.int(r, 2, 9)), links: links.join(', ') };
    });
    const gp = ok(rs);
    const s = G.solve(gp);
    for (const [id, c] of Object.entries(s.classes)) {
      seen.add(c.cls);
      const d = gp.activities.find((a) => a.id === id).d;
      const T = (dd) => G.solve(withD(gp, id, dd)).duration;
      assert.equal(sign(T(d + G.DELTA) - s.duration), c.up, `it ${it} ${id}`);
      assert.equal(sign(T(d - G.DELTA) - s.duration), c.down, `it ${it} ${id}`);
      // Con ±1: T es lineal a trozos de pendiente −1, 0 o +1; si la pendiente es la misma en ±δ y en ±1, el signo coincide.
      const u1 = T(d + 1) - s.duration; const d1 = T(d - 1) - s.duration;
      if (Math.abs(Math.abs(u1) - (c.up === '0' ? 0 : 1)) < 1e-9) assert.equal(sign(u1), c.up, `it ${it} ${id} +1`);
      if (Math.abs(Math.abs(d1) - (c.down === '0' ? 0 : 1)) < 1e-9) assert.equal(sign(d1), c.down, `it ${it} ${id} −1`);
    }
  }
  for (const c of ['normal', 'reverse', 'neutral', 'bicritical', 'incNormal', 'decReverse']) assert.ok(seen.has(c), c);
});

// ---------- traza (AC8) ----------

test('F5a T005: la traza de ROSEBUD: tabla, hacia delante, fin, hacia atrás, holguras, críticas y clases', () => {
  const gp = ex('rb');
  const steps = G.trace(gp);
  const kinds = steps.map((s) => s.kind);
  assert.equal(kinds[0], 'table');
  assert.deepEqual([...new Set(kinds)], ['table', 'gprForward', 'gprEnd', 'gprBackward', 'gprFloat', 'gprCritical', 'gprClasses']);
  assert.equal(kinds.filter((k) => k === 'gprForward').length, 8);
  // Y: el Inicio (0), CC+2 de V (12) y FF+6 de V (14): manda la FF.
  const y = steps.find((s) => s.kind === 'gprForward' && s.act === 'Y');
  assert.deepEqual(y.reveals, [{ act: 'Y', field: 'ES', value: 14 }, { act: 'Y', field: 'EF', value: 22 }]);
  assert.deepEqual(y.formula.terms.map((t) => [t.from, t.type, t.lag, t.value]), [['@S', null, null, 0], ['V', 'SS', 2, 12], ['V', 'FF', 6, 14]]);
  assert.deepEqual(y.formula.chosen, ['r6']);
  assert.equal(y.formula.op, 'max');
  const end = steps.find((s) => s.kind === 'gprEnd');
  assert.deepEqual(end.reveals, [{ act: '@E', field: 'T', value: 24 }]);
  assert.deepEqual(end.endBy, ['X']);
  assert.deepEqual(end.notFinal, []);
  // L hacia atrás: el Fin (22) y la FC a Q (13 − 2 = 11): manda Q.
  const l = steps.find((s) => s.kind === 'gprBackward' && s.act === 'L');
  assert.deepEqual(l.reveals, [{ act: 'L', field: 'LF', value: 13 }, { act: 'L', field: 'LS', value: 11 }]);
  assert.deepEqual(l.formula.terms.map((t) => [t.to, t.type, t.value]), [['@E', null, 22], ['Q', 'FS', 11]]);
  assert.equal(l.formula.op, 'min');
  const fl = steps.filter((s) => s.kind === 'gprFloat');
  assert.deepEqual(fl.map((s) => s.float), ['TF', 'FF']);
  assert.deepEqual(fl[0].reveals.find((x) => x.act === 'Q'), { act: 'Q', field: 'TF', value: 7 });
  assert.deepEqual(steps.find((s) => s.kind === 'gprClasses').classes, G.solve(gp).classes);
});

test('F5a T005: la traza dice cuándo el fin lo marca una actividad que no es final y cuándo manda el Inicio', () => {
  const steps = G.trace(ok([{ id: 'A', duration: '10', links: '' }, { id: 'B', duration: '2', links: 'A SS' }]));
  const end = steps.find((s) => s.kind === 'gprEnd');
  assert.deepEqual([end.endBy, end.notFinal], [['A'], ['A']]);
  const b = G.trace(ok([{ id: 'A', duration: '2', links: '' }, { id: 'B', duration: '9', links: 'A FF' }]))
    .find((s) => s.kind === 'gprForward' && s.act === 'B');
  assert.deepEqual(b.formula.chosen, ['@S']);
  assert.equal(b.formula.terms[1].value, -7);
});

test('F5a T005: cada valor de la traza es el de solve', () => {
  for (const e of X.list()) {
    const gp = ex(e.id);
    const s = G.solve(gp);
    for (const st of G.trace(gp, s)) {
      for (const rv of st.reveals) {
        if (rv.field === 'T') assert.equal(rv.value, s.duration);
        else if (rv.field === 'TF' || rv.field === 'FF') assert.equal(rv.value, s.floats[rv.act][rv.field]);
        else assert.equal(rv.value, s.times[rv.act][rv.field], `${e.id} ${rv.act}.${rv.field}`);
      }
    }
  }
});

// ---------- «¿Y si…?» (AC11) ----------

test('F5a T005: «¿Y si…?» en ROSEBUD y en la crítica al revés', () => {
  const rb = ex('rb');
  for (const d of [6, 7, 9, 10]) assert.equal(G.whatIf(rb, 'Y', d).after, 24, `Y = ${d}`);
  const rv = ex('rv');
  assert.deepEqual([5, 6, 7].map((d) => G.whatIf(rv, 'B', d).after), [15, 14, 13]);
  const w = G.whatIf(rv, 'B', 7);
  assert.deepEqual([w.before, w.after, w.delta], [14, 13, -1]);
  assert.deepEqual(w.changed, ['B', 'C']);
  assert.equal(w.gp.activities.find((a) => a.id === 'B').d, 7);
  assert.equal(rv.activities.find((a) => a.id === 'B').d, 6);   // el proyecto de partida no cambia
  assert.throws(() => G.whatIf(rv, 'Q', 3));
  assert.throws(() => G.whatIf(rv, 'B', -1));
});
