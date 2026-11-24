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

  /** El Gantt del paso a paso (T014b; lo que se ve lo decide gprTab.ganttWalk): filas en w.order; barra solo en las de
   *  w.bars (x0 null en las demás), a fechas tempranas o tardías (w.late); con w.ghosts, las tempranas de fondo; con
   *  w.floats, la holgura total; críticas solo con w.crit. Flechas con sus tiempos exactos (sin meterse en la barra) y su
   *  valor: el tiempo en la fila de la actividad del paso. Líneas verticales del inicio o del fin: en una fila o enteras. */
  function walkGeometry(gp, sol, w) {
    const T = sol.duration;
    const unit = Math.max(14, Math.min(48, Math.floor(720 / Math.max(T, 1))));
    const X = (v) => LEFT + v * unit;
    const d = durOf(gp);
    const crit = new Set(w.crit ? sol.critical : []);
    const shown = new Set(w.bars);
    const rows = w.order.map((id, k) => {
      const t = sol.times[id]; const tf = sol.floats[id].TF;
      const on = shown.has(id);
      const x0 = on ? X(w.late ? t.LS : t.ES) : null;
      const len = Math.max(MIN_BAR, d[id] * unit);
      return { id, k, y: TOP + k * ROW + BAR_Y, x0, x1: on ? x0 + len : null, crit: crit.has(id),
        ghost: w.ghosts && !(on && Math.abs(x0 - X(t.ES)) < TOL) ? [X(t.ES), X(t.ES) + len] : null,   // no se pinta debajo de la misma barra
        float: !w.floats || tf < TOL ? null : [X(t.EF), X(t.LF)] };
    });
    const row = Object.fromEntries(rows.map((r) => [r.id, r]));
    const used = new Map();
    const arrows = w.arrows.map((a) => {
      const p = row[a.from]; const q = row[a.to];
      const down = q.k > p.k;
      const n = used.get(a.to) || 0; used.set(a.to, n + 1);
      const x0 = X(a.t0); const x1 = X(a.t1);
      const y0 = down ? p.y + BAR_H : p.y;
      const y1 = down ? q.y : q.y + BAR_H;
      const gap = (ROW - BAR_H) / 2;
      const ym = down ? q.y - gap + n * 3 - 3 : q.y + BAR_H + gap - n * 3 + 3;
      return { rel: a.rel, cls: a.cls, val: a.to === w.act ? a.t1 : a.t0, at: a.to === w.act ? 'to' : 'from',
        points: [[x0, y0], [x0, ym], [x1, ym], [x1, y1]] };
    });
    const height = TOP + rows.length * ROW + 6;
    const lines = w.lines.map((l) => {
      const r = l.act ? row[l.act] : null;
      return { x: X(l.at), y0: r ? r.y - 6 : TOP - 6, y1: r ? r.y + BAR_H + 6 : height - 4, cls: l.cls, val: l.at, act: l.act };
    });
    const step = tickStep(T, unit);
    const ticks = [];
    for (let v = 0; v <= T + TOL; v += step) ticks.push({ v, x: X(v) });
    return { left: LEFT, right: RIGHT, top: TOP, unit, rowH: ROW, barH: BAR_H, width: LEFT + T * unit + RIGHT, height, rows, arrows, lines, ticks };
  }

  /** Qué Gantt del paso a paso es (para su texto alternativo): pasada hacia delante o hacia atrás, fin, críticas o el resto. */
  const walkKind = (w) => (w.kind === 'gprForward' ? 'fwd' : w.kind === 'gprBackward' ? 'bwd' : w.kind === 'gprEnd' ? 'end' : w.crit ? 'crit' : 'rest');

  /** Pinta el Gantt. ctx: { gp, solution, late, lang, name (del proyecto), title(r) (texto de cada flecha), numFmt }. Con
   *  ctx.walk (el Gantt del paso a paso, T014b) pinta walkGeometry con el texto alternativo de su paso. */
  function render(container, ctx) {
    const d3 = root.d3;
    const { gp, solution, late } = ctx;
    const w = ctx.walk || null;
    const g = w ? walkGeometry(gp, solution, w) : geometry(gp, solution, { late });
    const fmt = ctx.numFmt || String;
    const sel = d3.select(container);
    sel.selectAll('*').remove();
    const I = root.PNL.i18n;
    const crit = I.list(ctx.lang, solution.critical);
    const svg = sel.append('svg').attr('class', w ? 'gantt gpr-gantt gpr-gantt-walk' : 'gantt gpr-gantt').attr('id', 'gprGanttSvg').attr('width', g.width).attr('height', g.height)
      .attr('viewBox', `0 0 ${g.width} ${g.height}`).attr('role', 'img').attr('aria-label', w ? root.PNL.i18n.t(ctx.lang, `gpr.gantt.walk.label.${walkKind(w)}`, { name: ctx.name, id: w.act, crit })
        : root.PNL.i18n.t(ctx.lang, 'gpr.gantt.label', { name: ctx.name, T: fmt(solution.duration), dates: I.t(ctx.lang, late ? 'gpr.gantt.late' : 'gpr.gantt.early'), crit }));
    const defs = svg.append('defs');
    for (const [id, cls] of [['gprGa', 'gmark'], ['gprGaC', 'gmark crit'], ['gprGaW', 'gmark chosen']]) {
      defs.append('marker').attr('id', id).attr('viewBox', '0 0 10 10').attr('refX', 10).attr('refY', 5).attr('markerWidth', 8).attr('markerHeight', 8)
        .attr('markerUnits', 'userSpaceOnUse').attr('orient', 'auto-start-reverse').append('path').attr('class', cls).attr('d', 'M0 0L10 5L0 10z');
    }
    for (const t of g.ticks) {
      svg.append('line').attr('class', 'grid').attr('x1', t.x).attr('x2', t.x).attr('y1', g.top - 6).attr('y2', g.height - 4);
      svg.append('text').attr('class', 'tick').attr('x', t.x).attr('y', 14).attr('text-anchor', 'middle').text(fmt(t.v));
    }
    for (const r of g.rows) {
      svg.append('text').attr('x', 8).attr('y', r.y + g.barH - 2).attr('font-weight', 700).text(r.id);
      if (r.ghost) svg.append('rect').attr('class', 'gghost').attr('data-act', r.id).attr('x', r.ghost[0]).attr('y', r.y)
        .attr('width', r.ghost[1] - r.ghost[0]).attr('height', g.barH).attr('rx', 3);
      if (r.float) svg.append('line').attr('class', 'float').attr('x1', r.float[0]).attr('x2', r.float[1]).attr('y1', r.y + g.barH / 2).attr('y2', r.y + g.barH / 2);
      if (r.x0 === null) continue;
      svg.append('rect').attr('class', `gbar ${r.crit ? 'bar-c' : 'bar-n'}`).attr('data-act', r.id).attr('x', r.x0).attr('y', r.y)
        .attr('width', r.x1 - r.x0).attr('height', g.barH).attr('rx', 3);
    }
    const r1 = (v) => Math.round(v * 10) / 10;
    for (const l of g.lines || []) {
      svg.append('line').attr('class', `gline ${l.cls}`).attr('x1', l.x).attr('x2', l.x).attr('y1', l.y0).attr('y2', l.y1);
      if (w && w.values) svg.append('text').attr('class', `gval ${l.cls}`).attr('x', l.x + 4).attr('y', l.y0 + 9).text(fmt(l.val));
    }
    for (const a of g.arrows) {
      const cls = w ? a.cls : a.crit ? 'crit' : '';
      const p = svg.append('path').attr('class', cls ? `garr ${cls}` : 'garr').attr('data-rel', a.rel)
        .attr('d', a.points.map(([x, y], i) => `${i ? 'L' : 'M'}${r1(x)} ${r1(y)}`).join(''))
        .attr('marker-end', `url(#${cls === 'crit' ? 'gprGaC' : cls === 'chosen' ? 'gprGaW' : 'gprGa'})`);
      p.append('title').text(ctx.title(gp.rels[a.rel]));
      if (w && w.values) {
        // El valor, junto al extremo de la fila del paso: a la derecha de la llegada o a la izquierda de la salida.
        const to = a.at === 'to';
        const [x, y] = to ? a.points[2] : a.points[0];
        svg.append('text').attr('class', `gval ${a.cls}`).attr('data-rel', a.rel).attr('x', to ? x + 4 : x - 4).attr('y', to ? y - 3 : y + 11)
          .attr('text-anchor', to ? 'start' : 'end').text(fmt(a.val));
      }
    }
  }

  const api = { MIN_BAR, INSET, anchors, geometry, walkGeometry, walkKind, render };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else { root.PNL = root.PNL || {}; root.PNL.gprGantt = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this);
