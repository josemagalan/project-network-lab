'use strict';
// F5a T012: la geometría del Gantt con relaciones (js/views/gpr-gantt.js, tablero 118). Cada flecha sale del comienzo de
// su predecesora (SS y SF) o de su fin (FS y FF) y llega al comienzo de su sucesora (FS y SS) o a su fin (FF y SF), a
// fechas tempranas o tardías; las críticas son las relaciones que mandan entre críticas (core/gpr, critRels).
const test = require('node:test');
const assert = require('node:assert/strict');
const GG = require('../js/views/gpr-gantt.js');
const G = require('../js/core/gpr.js');
const X = require('../js/core/gprex.js');

const TOL = 1e-9;
const load = (rows) => { const gp = G.parse(rows).project; return { gp, sol: G.solve(gp) }; };
const ex = (id) => load(X.get(id).rows);
const rel = (gp, from, to, type) => gp.rels.find((r) => r.from === from && r.to === to && r.type === type);
// Las cuatro relaciones, con desfases positivos, negativos y nulos (ningún ejemplo tiene SF).
const ALL4 = [
  { id: 'A', duration: '6', links: '' },
  { id: 'B', duration: '4', links: 'A SS+2' },
  { id: 'C', duration: '3', links: 'A FF-1' },
  { id: 'D', duration: '5', links: 'B SF+7' },
  { id: 'E', duration: '2', links: 'C, D FS-1' },
];

test('F5a T012: de dónde sale y a dónde llega cada flecha (ROSEBUD, a fechas tempranas y tardías)', () => {
  const { gp, sol } = ex('rb');
  assert.deepEqual(GG.anchors(gp, sol, rel(gp, 'V', 'Y', 'FF')), { leave: 16, arrive: 22 });
  assert.deepEqual(GG.anchors(gp, sol, rel(gp, 'V', 'Y', 'SS')), { leave: 10, arrive: 14 });
  assert.deepEqual(GG.anchors(gp, sol, rel(gp, 'G', 'L', 'SS')), { leave: 0, arrive: 4 });
  assert.deepEqual(GG.anchors(gp, sol, rel(gp, 'G', 'L', 'FF')), { leave: 6, arrive: 6 });
  assert.deepEqual(GG.anchors(gp, sol, rel(gp, 'W', 'X', 'FS')), { leave: 22, arrive: 23 });
  // A fechas tardías L empieza en 11 (LS) y acaba en 13.
  assert.deepEqual(GG.anchors(gp, sol, rel(gp, 'G', 'L', 'SS'), true), { leave: 0, arrive: 11 });
  assert.deepEqual(GG.anchors(gp, sol, rel(gp, 'L', 'Q', 'FS'), true), { leave: 13, arrive: 13 });
});

test('F5a T012: con las cuatro relaciones, cada flecha respeta su desfase a fechas tempranas y tardías, y las que mandan lo cumplen justo', () => {
  const cases = X.list().map((e) => ex(e.id)).concat([load(ALL4)]);
  for (const { gp, sol } of cases) {
    const crit = new Set(sol.critRels);
    gp.rels.forEach((r, k) => {
      for (const late of [false, true]) {
        const a = GG.anchors(gp, sol, r, late);
        assert.ok(a.arrive - a.leave >= r.lag - TOL, `${r.from}→${r.to} ${r.type}${r.lag} ${late}`);
      }
      if (crit.has(k)) { const a = GG.anchors(gp, sol, r); assert.ok(Math.abs(a.arrive - a.leave - r.lag) < TOL, `${r.from}→${r.to}`); }
    });
  }
  const { gp, sol } = load(ALL4);
  assert.deepEqual(GG.anchors(gp, sol, rel(gp, 'B', 'D', 'SF')), { leave: sol.times.B.ES, arrive: sol.times.D.EF });
  assert.deepEqual(GG.anchors(gp, sol, rel(gp, 'A', 'C', 'FF')), { leave: sol.times.A.EF, arrive: sol.times.C.EF });
});

test('F5a T012: la geometría pone una barra por actividad (por comienzo temprano) y una flecha por relación, del borde de una barra al de la otra', () => {
  for (const [rows, late] of [[X.get('rb').rows, false], [X.get('rb').rows, true], [ALL4, false], [ALL4, true], [X.get('cl').rows, false]]) {
    const { gp, sol } = load(rows);
    const g = GG.geometry(gp, sol, { late });
    assert.equal(g.rows.length, gp.activities.length);
    assert.equal(g.arrows.length, gp.rels.length);
    // Por comienzo temprano (también a fechas tardías: las filas no se mueven al cambiar de fechas).
    const es = g.rows.map((r) => sol.times[r.id].ES);
    assert.deepEqual(es, [...es].sort((a, b) => a - b));
    assert.equal(g.width, g.left + sol.duration * g.unit + g.right);
    const row = Object.fromEntries(g.rows.map((r) => [r.id, r]));
    for (const r of g.rows) {
      const t = sol.times[r.id];
      assert.equal(r.x0, g.left + (late ? t.LS : t.ES) * g.unit);
      assert.ok(Math.abs(r.x1 - r.x0 - Math.max(GG.MIN_BAR, (t.EF - t.ES) * g.unit)) < TOL);
      assert.equal(r.crit, sol.critical.includes(r.id));
      // La holgura total: detrás de la barra a fechas tempranas y delante a fechas tardías; nada si no hay.
      const tf = sol.floats[r.id].TF;
      if (tf < TOL) assert.equal(r.float, null);
      else assert.deepEqual(r.float, late ? [g.left + t.ES * g.unit, g.left + t.LS * g.unit] : [g.left + t.EF * g.unit, g.left + t.LF * g.unit]);
    }
    g.arrows.forEach((a, k) => {
      const r = gp.rels[k];
      const p = row[r.from]; const q = row[r.to];
      const [x0, y0] = a.points[0]; const [x1, y1] = a.points[a.points.length - 1];
      const down = q.y > p.y;
      // Sale del borde de la barra que mira a la sucesora, en el comienzo (SS, SF) o el fin (FS, FF), un poco hacia dentro.
      assert.equal(y0, down ? p.y + g.barH : p.y, `${r.from}→${r.to}`);
      const from = r.type[0] === 'S' ? p.x0 : p.x1;
      assert.ok(x0 >= p.x0 - TOL && x0 <= p.x1 + TOL && Math.abs(x0 - from) <= GG.INSET + TOL, `${r.from}→${r.to}: sale en ${x0}`);
      // Llega al borde de la barra de la sucesora, en vertical, en su comienzo (FS, SS) o su fin (FF, SF).
      assert.equal(y1, down ? q.y : q.y + g.barH, `${r.from}→${r.to}`);
      const to = r.type[1] === 'S' ? q.x0 : q.x1;
      assert.ok(x1 >= q.x0 - TOL && x1 <= q.x1 + TOL && Math.abs(x1 - to) <= 2 * GG.INSET + TOL, `${r.from}→${r.to}: llega en ${x1}`);
      assert.equal(a.points[a.points.length - 2][0], x1, 'el último tramo es vertical');
      assert.equal(a.crit, sol.critRels.includes(k));
    });
  }
});

test('F5a T012: el Gantt cabe en su marco a cualquier duración y las marcas del eje no se amontonan', () => {
  for (const id of ['fc', 'rb', 'cl']) {
    const { gp, sol } = ex(id);
    const g = GG.geometry(gp, sol, {});
    assert.ok(g.unit >= 14 && g.unit <= 48, `${id}: ${g.unit}`);
    assert.ok(g.ticks.length >= 2 && g.ticks.length <= 16, `${id}: ${g.ticks.length} marcas`);
    assert.equal(g.ticks[0].v, 0);
    assert.ok(g.ticks.every((t, i) => !i || t.x - g.ticks[i - 1].x >= 24), id);
  }
});
