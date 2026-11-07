/*
 * views/gantt — diagrama de Gantt a fechas tempranas (o tardías) con la holgura total dibujada.
 */
(function (root) {
  'use strict';

  const G = root.PNL;

  function render(container, ctx) {
    const d3 = root.d3;
    const { solution, lang, late } = ctx;
    const ids = solution.order;
    const D = solution.duration;
    const crit = new Set(solution.critical);
    const left = 44; const top = 22; const rowH = 22;
    const unitW = Math.max(18, Math.min(64, Math.floor(820 / Math.max(D, 1))));
    const width = left + D * unitW + 24;
    const height = top + ids.length * rowH + 10;
    const sel = d3.select(container);
    sel.selectAll('*').remove();
    const svg = sel.append('svg').attr('class', 'gantt').attr('width', '100%').attr('style', `max-width:${width}px`)
      .attr('viewBox', `0 0 ${width} ${height}`).attr('role', 'img')
      .attr('aria-label', `${G.i18n.t(lang, 'steps.gantt')} · ${G.i18n.t(lang, late ? 'results.late' : 'results.early')}`);
    const step = D <= 20 ? 1 : D <= 60 ? 5 : 10;
    for (let x = 0; x <= D + 1e-9; x += step) {
      svg.append('line').attr('class', 'grid').attr('x1', left + x * unitW).attr('x2', left + x * unitW).attr('y1', top - 4).attr('y2', height - 6);
      svg.append('text').attr('class', 'tick').attr('x', left + x * unitW).attr('y', 12).attr('text-anchor', 'middle').text(String(Math.round(x * 100) / 100));
    }
    ids.forEach((id, k) => {
      const tm = solution.times[id];
      const y = top + k * rowH;
      const start = late ? tm.LS : tm.ES;
      const end = late ? tm.LF : tm.EF;
      svg.append('text').attr('x', 6).attr('y', y + 14).attr('font-weight', 700).text(id);
      if (!late && tm.LF > tm.EF + 1e-9) {
        svg.append('line').attr('class', 'float').attr('x1', left + tm.EF * unitW).attr('x2', left + tm.LF * unitW).attr('y1', y + 10).attr('y2', y + 10);
      }
      if (late && tm.LS > tm.ES + 1e-9) {
        svg.append('line').attr('class', 'float').attr('x1', left + tm.ES * unitW).attr('x2', left + tm.LS * unitW).attr('y1', y + 10).attr('y2', y + 10);
      }
      svg.append('rect').attr('class', crit.has(id) ? 'bar-c' : 'bar-n').attr('x', left + start * unitW).attr('y', y + 4)
        .attr('width', Math.max(2, (end - start) * unitW)).attr('height', 13).attr('rx', 3);
    });
  }

  const api = { render };
  root.PNL = root.PNL || {};
  root.PNL.gantt = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
