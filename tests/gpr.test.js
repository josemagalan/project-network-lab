'use strict';
// core/gpr: lectura de la tabla con relaciones y CPM con desfases (spec f5a-precedencias-generalizadas, AC1–AC3, AC5,
// AC6; plan §0, §3, P1, P6, P7; T003). Las cifras de referencia vienen de la tabla de la spec, calculada aparte en
// spikes/f5a-precedencias-generalizadas/gpr.py: Tema 6b (J. M. Galán, Gestión de Proyectos, UBU) y J. M. Nicholas y
// H. Steyn, Project Management for Engineering, Business and Technology, 4.ª ed., cap. 6 (fig. 6.16 y ejemplo 6.1).
const test = require('node:test');
const assert = require('node:assert/strict');
const G = require('../js/core/gpr.js');
const X = require('../js/core/gprex.js');
const C = require('../js/core/cpm.js');
const P = require('../js/core/project.js');
const E = require('../js/core/examples.js');
const GEN = require('../js/core/generator.js');
const R = require('../js/core/rng.js');

const rows = (spec) => spec.map(([id, d, links]) => ({ id, duration: String(d), links: links || '' }));
const ok = (rs) => { const { project, report } = G.parse(rs); assert.deepEqual(report.errors, []); return project; };
const one = (links, known = ['A', 'B', 'C', '5']) => ok(rows([...known.map((k) => [k, 4, '']), ['Z', 3, links]])).rels;
const codes = (rs) => G.parse(rs).report.errors.map((e) => e.code);

// ---------- lectura (AC5, AC6) ----------

test('F5a T003: cada forma de escribir una relación da la misma relación (P1)', () => {
  const ss2 = [{ from: 'B', to: 'Z', type: 'SS', lag: 2 }];
  for (const w of ['B CC+2', 'B cc + 2', 'B SS+2', 'b ss+2', 'BCC+2', 'B CC +2', 'B CC+ 2']) assert.deepEqual(one(w), ss2, w);
  const ff = [{ from: 'B', to: 'Z', type: 'FF', lag: -1.5 }];
  for (const w of ['B FF-1,5', 'B FF−1.5', 'B FF -1.5', 'B ff−1,5']) assert.deepEqual(one(w), ff, w);
  assert.deepEqual(one('B'), [{ from: 'B', to: 'Z', type: 'FS', lag: 0 }]);
  assert.deepEqual(one('B FC'), [{ from: 'B', to: 'Z', type: 'FS', lag: 0 }]);
  assert.deepEqual(one('B CF-2'), [{ from: 'B', to: 'Z', type: 'SF', lag: -2 }]);
  assert.deepEqual(one('B SF+0'), [{ from: 'B', to: 'Z', type: 'SF', lag: 0 }]);
});

test('F5a T003: separadores y coma decimal solo entre cifras (P1)', () => {
  assert.deepEqual(one('A, B CC+2; C'), [
    { from: 'A', to: 'Z', type: 'FS', lag: 0 }, { from: 'B', to: 'Z', type: 'SS', lag: 2 }, { from: 'C', to: 'Z', type: 'FS', lag: 0 }]);
  assert.deepEqual(one('A B C'), ['A', 'B', 'C'].map((f) => ({ from: f, to: 'Z', type: 'FS', lag: 0 })));
  assert.deepEqual(one('B FF-1,5,C'), [{ from: 'B', to: 'Z', type: 'FF', lag: -1.5 }, { from: 'C', to: 'Z', type: 'FS', lag: 0 }]);
  assert.deepEqual(one('B FF-1, 5'), [{ from: 'B', to: 'Z', type: 'FF', lag: -1 }, { from: '5', to: 'Z', type: 'FS', lag: 0 }]);
  assert.deepEqual(one('A CC+2,B'), [{ from: 'A', to: 'Z', type: 'SS', lag: 2 }, { from: 'B', to: 'Z', type: 'FS', lag: 0 }]);
});

test('F5a T003: relaciones mal escritas → badRel en su fila', () => {
  const bad = (links) => {
    const { project, report } = G.parse(rows([['A', 4], ['B', 4], ['Z', 3, links]]));
    assert.equal(project, null, links);
    const e = report.errors.find((x) => x.code === 'badRel');
    assert.ok(e, links);
    assert.equal(e.row, 2);
    assert.deepEqual(e.ids, ['Z']);
  };
  for (const w of ['B+2', 'B CC CC', 'CC', 'B CC+2+3', 'A, +1', 'B CC+', 'B (CC)', 'B CC+2.']) bad(w);
});

test('F5a T003: errores de la tabla (AC6)', () => {
  assert.deepEqual(codes(rows([['A', 4], ['B', 4, 'Q']])), ['unknownRef']);
  assert.deepEqual(codes(rows([['A', 'x'], ['B', 4, 'A']])), ['badDuration']);
  assert.deepEqual(codes(rows([['A', -1]])), ['badDuration']);
  assert.deepEqual(codes(rows([['A', 4], ['B', 4, 'A SS+1, A CC+2']])), ['dupRel']);
  assert.deepEqual(codes(rows([['A', 4, 'A SS']])), ['selfRel']);
  assert.deepEqual(codes(rows([['A', 4, 'B SS'], ['B', 4, 'A FF']])), ['cycle']);
  assert.deepEqual(codes(rows([['A', 4], ['A', 3]])), ['duplicateId']);
  for (const id of ['FF', 'cc', 'SF', 'FC', 'CF', 'SS', 'FS', 'FIN']) assert.deepEqual(codes(rows([[id, 4]])), ['reservedId'], id);
  assert.deepEqual(codes(rows([['ABCDE', 4]])), ['badId']);
  // Dos relaciones de tipos distintos entre las mismas actividades valen (como Nicholas, fig. 6.16).
  assert.equal(ok(rows([['A', 15], ['B', 15, 'A SS+5, A FF+10']])).rels.length, 2);
  // Tabla vacía: ni proyecto ni errores.
  assert.deepEqual(G.parse([{ id: '', duration: '', links: '' }]), { project: null, report: { errors: [], warnings: [] } });
});

test('F5a T003: límites de P6 (30 actividades y 120 relaciones)', () => {
  const ids = Array.from({ length: 31 }, (_, i) => `A${i + 1}`);
  assert.ok(codes(ids.map((id) => ({ id, duration: '1', links: '' }))).includes('tooMany'));
  const many = Array.from({ length: 16 }, (_, i) => `A${i + 1}`);
  const rs = many.map((id, i) => ({ id, duration: '1', links: many.slice(0, i).join(', ') }));   // 120 relaciones
  assert.equal(ok(rs).rels.length, 120);
  rs.push({ id: 'Z', duration: '1', links: 'A1' });
  assert.ok(codes(rs).includes('tooMany'));
});

test('F5a T003: aviso ssLong con la FC equivalente, sin impedir el cálculo (P7)', () => {
  const { project, report } = G.parse(rows([['A', 8], ['B', 7, 'A CC+10']]));
  assert.ok(project);
  assert.deepEqual(report.warnings, [{ code: 'ssLong', row: 1, ids: ['A', 'B'], lag: 10, equiv: 2 }]);
  assert.equal(G.solve(project).duration, 17);
  assert.deepEqual(G.parse(rows([['A', 8], ['B', 7, 'A CC+8']])).report.warnings.map((w) => w.equiv), [0]);
  assert.deepEqual(G.parse(rows([['A', 8], ['B', 7, 'A CC+7']])).report.warnings, []);
});

test('F5a T010: el aviso ssLong sale también con errores en otras filas (tablero 120); con un ciclo, igual', () => {
  const r = G.parse([{ id: 'A', duration: '8', links: '' }, { id: 'B', duration: '6', links: 'A SS+' }, { id: 'C', duration: '4', links: 'B FF+1, B FF+2' },
    { id: 'D', duration: '3', links: 'Z' }, { id: 'E', duration: '5', links: 'A SS+10' }]).report;
  assert.deepEqual(r.errors.map((e) => e.code), ['badRel', 'dupRel', 'unknownRef']);
  assert.deepEqual(r.warnings, [{ code: 'ssLong', row: 4, ids: ['A', 'E'], lag: 10, equiv: 2 }]);
  // Sin la duración de la predecesora no hay aviso (no se sabe a qué equivale).
  assert.deepEqual(G.parse(rows([['A', 'x'], ['B', 7, 'A CC+10']])).report.warnings, []);
  const c = G.parse(rows([['A', 8, 'B'], ['B', 7, 'A CC+10']])).report;
  assert.deepEqual(c.errors.map((e) => e.code), ['cycle']);
  assert.deepEqual(c.warnings.map((w) => w.row), [1]);
});

test('F5a T003: format y toRows escriben en cada idioma y se vuelven a leer igual', () => {
  const rel = (type, lag) => ({ from: 'B', to: 'Z', type, lag });
  assert.equal(G.format(rel('FS', 0), 'en'), 'B');
  assert.equal(G.format(rel('SS', 2), 'en'), 'B SS+2');
  assert.equal(G.format(rel('SS', 2), 'es'), 'B CC+2');
  assert.equal(G.format(rel('FF', -1.5), 'es'), 'B FF-1,5');
  assert.equal(G.format(rel('SF', 0), 'es'), 'B CF');
  for (const ex of X.list()) {
    const p = ok(ex.rows);
    for (const lang of ['es', 'en']) assert.deepEqual(ok(G.toRows(p, lang)).rels, p.rels, `${ex.id} ${lang}`);
  }
});

// ---------- cálculo (AC1–AC3) ----------

test('F5a T003: las cifras de referencia de la spec (AC1)', () => {
  for (const ex of X.list()) {
    const s = G.solve(ok(ex.rows));
    assert.equal(s.duration, ex.expected.duration, ex.id);
    assert.deepEqual(Object.fromEntries(Object.keys(ex.expected.ES).map((k) => [k, s.times[k].ES])), ex.expected.ES, ex.id);
    assert.deepEqual([...s.critical].sort(), [...ex.expected.critical].sort(), ex.id);
  }
  // ROSEBUD con relaciones: holgura total de L y Q, libre de Q; con fin–comienzo, 26.
  const rb = G.solve(ok(X.get('rb').rows));
  assert.deepEqual([rb.floats.L.TF, rb.floats.Q.TF, rb.floats.Q.FF], [7, 7, 7]);
  assert.deepEqual(rb.paths.map((p) => p.acts), [['G', 'M', 'V', 'Y', 'W', 'X']]);
  const fs = X.get('rb').rows.map((r) => ({ ...r, links: r.links.split(', ').filter(Boolean).map((l) => l.split(' ')[0])
    .filter((v, i, a) => a.indexOf(v) === i).join(', ') }));
  assert.equal(G.solve(ok(fs)).duration, 26);
  // Tema 6b con FC y CC; figura 6.16 (B no puede empezar en 5: terminaría en 20 y no se parte).
  assert.deepEqual(G.solve(ok(X.get('fc').rows)).times.B, { ES: 11, EF: 18, LS: 11, LF: 18 });
  assert.deepEqual(G.solve(ok(X.get('cc').rows)).times.B, { ES: 3, EF: 10, LS: 3, LF: 10 });
  assert.deepEqual(G.solve(ok(X.get('n16').rows)).times.B, { ES: 10, EF: 25, LS: 10, LF: 25 });
});

test('F5a T003: el proyecto puede terminar con una actividad que tiene sucesoras (T = máx EF)', () => {
  const s = G.solve(ok(rows([['A', 10], ['B', 2, 'A SS']])));
  assert.equal(s.duration, 10);
  assert.deepEqual(s.endBy, ['A']);
  assert.deepEqual(s.notFinal, ['A']);
  assert.deepEqual(s.times.B, { ES: 0, EF: 2, LS: 8, LF: 10 });
});

test('F5a T003: un comienzo que saldría negativo se queda en 0 y lo marca el Inicio', () => {
  const s = G.solve(ok(rows([['A', 2], ['B', 9, 'A FF']])));
  assert.equal(s.times.B.ES, 0);
  assert.deepEqual(s.binding.B.fwd.filter((t) => t.chosen).map((t) => t.from), ['@S']);
  assert.equal(s.binding.B.fwd[1].value, -7);
});

test('F5a T003: con FS+0, lo mismo que core/cpm en los ejemplos con duraciones y en tablas del generador (AC2)', () => {
  const same = (rs, tag) => {
    const gp = ok(rs);
    const p = P.parse(rs, 'pred').project;
    assert.deepEqual(G.toCpm(gp).preds, p.preds, tag);
    const a = C.solve(p); const b = G.solve(gp);
    assert.equal(b.duration, a.duration, tag);
    for (const id of Object.keys(b.times)) {
      for (const f of ['ES', 'EF', 'LS', 'LF']) assert.equal(b.times[id][f], a.times[id][f], `${tag} ${id}.${f}`);
      for (const f of ['TF', 'FF']) assert.equal(b.floats[id][f], a.floats[id][f], `${tag} ${id}.${f}`);
    }
    assert.deepEqual([...b.critical].sort(), [...a.critical].sort(), tag);
  };
  const withD = E.list().filter((x) => E.get(x.id).rows.every((r) => String(r.duration).trim() !== ''));
  assert.deepEqual(withD.map((x) => x.id), ['ej6', 'roy10', 'roy6', 'klastorin', 'hillier', 'ej4', 'ej7']);
  for (const x of withD) {
    const ex = E.get(x.id);
    const rs = ex.mode === 'succ' ? P.toRows(P.parse(ex.rows, 'succ').project, 'pred') : ex.rows;
    same(rs, x.id);
  }
  let n = 0;
  for (const lv of ['easy', 'medium', 'hard']) {
    for (let seed = 1; seed <= 167; seed++) {
      const g = GEN.generate(seed, GEN.LEVELS[lv]);
      if (g.ok) { same(g.rows, `${lv}/${seed}`); n++; }
    }
  }
  assert.ok(n >= 500, n);
  assert.equal(G.toCpm(ok(X.get('cc').rows)), null);
});

// Tablas al azar con las cuatro relaciones y desfases de −3 a +12, con semilla.
function randomTable(r) {
  const k = R.int(r, 2, 12);
  const ids = Array.from({ length: k }, (_, i) => String.fromCharCode(65 + i));
  const types = ['FS', 'FS', 'SS', 'FF', 'SF'];
  return ids.map((id, j) => {
    const links = [];
    const used = new Set();
    for (let i = 0; i < j; i++) {
      if (r() < 0.3) {
        const type = types[R.int(r, 0, 4)];
        const lag = [0, 0, 1, 2, 3, -1, -2, -3, 12, 0.5][R.int(r, 0, 9)];
        if (used.has(ids[i] + type)) continue;
        used.add(ids[i] + type);
        links.push(G.format({ from: ids[i], type, lag }, 'en'));
      }
    }
    return { id, duration: String(R.int(r, 0, 9)), links: links.join(', ') };
  });
}

test('F5a T003: en 3000 tablas al azar, los calendarios temprano y tardío cumplen todas las relaciones (AC3)', () => {
  const r = R.mulberry32(2026);
  for (let it = 0; it < 3000; it++) {
    const rs = randomTable(r);
    const gp = ok(rs);
    const s = G.solve(gp);
    const d = Object.fromEntries(gp.activities.map((a) => [a.id, a.d]));
    const maxEF = Math.max(...gp.activities.map((a) => s.times[a.id].EF));
    assert.ok(Math.abs(s.duration - maxEF) < 1e-9, `it ${it}`);
    for (const a of gp.activities) {
      const t = s.times[a.id];
      assert.ok(t.ES >= 0 && t.LS >= t.ES - 1e-9 && t.LF <= s.duration + 1e-9, `it ${it} ${a.id}`);
      assert.ok(s.floats[a.id].TF >= 0 && s.floats[a.id].FF >= 0 && s.floats[a.id].FF <= s.floats[a.id].TF + 1e-9, `it ${it} ${a.id}`);
    }
    for (const rel of gp.rels) {
      const w = G.weight(rel.type, d[rel.from], d[rel.to], rel.lag);
      assert.ok(s.times[rel.to].ES >= s.times[rel.from].ES + w - 1e-9, `it ${it} temprano ${JSON.stringify(rel)}`);
      assert.ok(s.times[rel.to].LS >= s.times[rel.from].LS + w - 1e-9, `it ${it} tardío ${JSON.stringify(rel)}`);
    }
  }
});

test('F5a T003: weight y solve rechazan lo que no deben', () => {
  assert.throws(() => G.weight('XX', 1, 1, 0));
  assert.throws(() => G.solve({ activities: [], rels: [] }));
});
