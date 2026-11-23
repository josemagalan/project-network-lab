/*
 * views/gpr-gantt — Gantt de «Precedencias generalizadas» (F5a T012, plan §4 y P8, tablero 118): barras a fechas tempranas
 * o tardías y cada relación como una flecha que sale del comienzo de su predecesora (SS y SF) o de su fin (FS y FF) y llega
 * al comienzo de su sucesora (FS y SS) o a su fin (FF y SF). Las críticas (actividades y relaciones que mandan, core/gpr) van
 * resaltadas. Las filas van por comienzo temprano y no se mueven al cambiar de fechas. El dibujo tiene su tamaño natural:
 * en pantallas estrechas se desliza dentro de su marco, no la página (P8).
 * anchors() y geometry() no tocan el DOM y se prueban en Node (tests/gpr-gantt.test.js); render() pinta con D3, con los
 * textos con .text() (nunca HTML). Las vistas de siempre (views/gantt) no cambian.
 */
(function (root) {
  'use strict';

  const TOL = 1e-9;
  const MIN_BAR = 3;          // una actividad de duración 0 se ve igual
  const INSET = 4;            // las flechas salen y llegan un poco dentro de la barra, en su borde
  const ROW = 34; const BAR_H = 14; const BAR_Y = 10;   // alto de fila, de la barra y su posición en la fila
  const LEFT = 44; const RIGHT = 24; const TOP = 26;

  const durOf = (gp) => Object.fromEntries(gp.activities.map((a) => [a.id, a.d]));

  /** Momentos de los que sale y a los que llega la flecha de una relación, a fechas tempranas o tardías. */
  function anchors(gp, sol, r, late) {
    const d = durOf(gp);
    const start = (id) => (late ? sol.times[id].LS : sol.times[id].ES);
    return { leave: start(r.from) + (r.type[0] === 'S' ? 0 : d[r.from]), arrive: start(r.to) + (r.type[1] === 'S' ? 0 : d[r.to]) };
  }

  /** Paso de las marcas del eje: que no queden a menos de 24 px. */
  function tickStep(T, unit) {
    for (const s of [1, 2, 5, 10, 20, 50, 100]) if (s * unit >= 24 && T / s <= 15) return s;
    return Math.max(1, Math.ceil(T / 15));
  }

  /** Todo lo que se dibuja, en píxeles: filas con su barra y su holgura, flechas (puntos) y marcas del eje. */
  function geometry(gp, sol, o) {
    const late = !!(o && o.late);
    const T = sol.duration;
    const unit = Math.max(14, Math.min(48, Math.floor(720 / Math.max(T, 1))));
    const order = gp.activities.map((a, i) => [a.id, i]);
    order.sort((a, b) => sol.times[a[0]].ES - sol.times[b[0]].ES || a[0].localeCompare(b[0]) || a[1] - b[1]);
    const X = (v) => LEFT + v * unit;
    const d = durOf(gp);
    const crit = new Set(sol.critical);
    const rows = order.map(([id], k) => {
      const t = sol.times[id]; const tf = sol.floats[id].TF;
      const x0 = X(late ? t.LS : t.ES);
      return { id, k, y: TOP + k * ROW + BAR_Y, x0, x1: x0 + Math.max(MIN_BAR, d[id] * unit), crit: crit.has(id),
        float: tf < TOL ? null : late ? [X(t.ES), X(t.LS)] : [X(t.EF), X(t.LF)] };
    });
    const row = Object.fromEntries(rows.map((r) => [r.id, r]));
    const critRels = new Set(sol.critRels);
    const used = new Map();   // llegadas al mismo borde de la misma barra: cada una un poco más dentro
    const arrows = gp.rels.map((r, k) => {
      const p = row[r.from]; const q = row[r.to];
      const down = q.k > p.k;
      const inset = (b) => Math.min(INSET, (b.x1 - b.x0) / 2);
      const x0 = r.type[0] === 'S' ? p.x0 + inset(p) : p.x1 - inset(p);
      const side = r.type[1];
      const key = `${r.to}|${side}`;
      const n = used.get(key) || 0; used.set(key, n + 1);
      const shift = Math.min(inset(q) + n * 3, 2 * INSET, (q.x1 - q.x0) / 2);
      const x1 = side === 'S' ? q.x0 + shift : q.x1 - shift;
      const y0 = down ? p.y + BAR_H : p.y;
      const y1 = down ? q.y : q.y + BAR_H;
      // El tramo horizontal va por el hueco que hay junto a la barra de llegada (no cruza otras barras de esa fila).
      const gap = (ROW - BAR_H) / 2;
      const ym = down ? q.y - gap + n * 3 - 3 : q.y + BAR_H + gap - n * 3 + 3;
      return { rel: k, crit: critRels.has(k), points: [[x0, y0], [x0, ym], [x1, ym], [x1, y1]] };
    });
    const step = tickStep(T, unit);
    const ticks = [];
    for (let v = 0; v <= T + TOL; v += step) ticks.push({ v, x: X(v) });
    return { left: LEFT, right: RIGHT, top: TOP, unit, rowH: ROW, barH: BAR_H, width: LEFT + T * unit + RIGHT, height: TOP + rows.length * ROW + 6,
      rows, arrows, ticks };
  }

  /** Pinta el Gantt. ctx: { gp, solution, late, lang, name (del proyecto), title(r) (texto de cada flecha), numFmt }. */
  function render(container, ctx) {
    const d3 = root.d3;
    const { gp, solution, late } = ctx;
    const g = geometry(gp, solution, { late });
    const fmt = ctx.numFmt || String;
    const sel = d3.select(container);
    sel.selectAll('*').remove();
    const svg = sel.append('svg').attr('class', 'gantt gpr-gantt').attr('id', 'gprGanttSvg').attr('width', g.width).attr('height', g.height)
      .attr('viewBox', `0 0 ${g.width} ${g.height}`).attr('role', 'img').attr('aria-label', root.PNL.i18n.t(ctx.lang, 'gpr.gantt.label', { name: ctx.name, T: fmt(solution.duration),
        dates: root.PNL.i18n.t(ctx.lang, late ? 'gpr.gantt.late' : 'gpr.gantt.early'), crit: root.PNL.i18n.list(ctx.lang, solution.critical) }));
    const defs = svg.append('defs');
    for (const [id, cls] of [['gprGa', 'gmark'], ['gprGaC', 'gmark crit']]) {
      defs.append('marker').attr('id', id).attr('viewBox', '0 0 10 10').attr('refX', 10).attr('refY', 5).attr('markerWidth', 8).attr('markerHeight', 8)
        .attr('markerUnits', 'userSpaceOnUse').attr('orient', 'auto-start-reverse').append('path').attr('class', cls).attr('d', 'M0 0L10 5L0 10z');
    }
    for (const t of g.ticks) {
      svg.append('line').attr('class', 'grid').attr('x1', t.x).attr('x2', t.x).attr('y1', g.top - 6).attr('y2', g.height - 4);
      svg.append('text').attr('class', 'tick').attr('x', t.x).attr('y', 14).attr('text-anchor', 'middle').text(fmt(t.v));
    }
    for (const r of g.rows) {
      svg.append('text').attr('x', 8).attr('y', r.y + g.barH - 2).attr('font-weight', 700).text(r.id);
      if (r.float) svg.append('line').attr('class', 'float').attr('x1', r.float[0]).attr('x2', r.float[1]).attr('y1', r.y + g.barH / 2).attr('y2', r.y + g.barH / 2);
      svg.append('rect').attr('class', `gbar ${r.crit ? 'bar-c' : 'bar-n'}`).attr('data-act', r.id).attr('x', r.x0).attr('y', r.y)
        .attr('width', r.x1 - r.x0).attr('height', g.barH).attr('rx', 3);
    }
    for (const a of g.arrows) {
      const p = svg.append('path').attr('class', a.crit ? 'garr crit' : 'garr').attr('data-rel', a.rel)
        .attr('d', a.points.map(([x, y], i) => `${i ? 'L' : 'M'}${Math.round(x * 10) / 10} ${Math.round(y * 10) / 10}`).join(''))
        .attr('marker-end', `url(#${a.crit ? 'gprGaC' : 'gprGa'})`);
      p.append('title').text(ctx.title(gp.rels[a.rel]));
    }
  }

  const api = { MIN_BAR, INSET, anchors, geometry, render };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else { root.PNL = root.PNL || {}; root.PNL.gprGantt = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this);
