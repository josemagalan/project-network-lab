/*
 * views/roy-view — dibuja la red ROY con D3 a partir de la colocación de views/layout y de los valores
 * revelados hasta el paso actual. No calcula nada: todo sale de la Solution de core/cpm (plan §2).
 * Los textos entran con .text() (nunca HTML). Tres formatos de caja: '7', '4' y 'c' (compacta).
 * Selección compartida con la red PERT (F2a): ctx.selected (actividad), ctx.selPrecs (precedencias
 * [a, b] que representa la ficticia seleccionada), ctx.onSelect(id) al pulsar un nodo y ctx.fit
 * (lado a lado: la red se encoge con su columna en vez de mantener 560 px).
 */
(function (root) {
  'use strict';

  const G = root.PNL;
  const GEO = { '7': { w: 96, h: 66, gx: 60, gy: 34, lab: 0 }, '4': { w: 84, h: 62, gx: 60, gy: 34, lab: 0 }, c: { w: 56, h: 36, gx: 64, gy: 38, lab: 18 } };
  const TERM = { w: 60, h: 34 };

  function render(container, ctx) {
    const d3 = root.d3;
    const { project, solution, lay, step, revealed, box, lang, nota, criticalOn, numFmt } = ctx;
    const { START, END } = G.topo;
    const N = G.i18n.notation(nota);
    // F3a («Ejercicios»): ctx.geo estrecha los huecos y ctx.minWidth fija el ancho mínimo con ctx.fit.
    const g = Object.assign({}, GEO[box] || GEO['7'], ctx.geo || {});
    const bendPts = Object.values(lay.bends || {}).flat();
    const rows = [...Object.values(lay.nodes), ...bendPts].map((n) => n.row);
    const minRow = Math.min(...rows);
    const maxRow = Math.max(...rows);
    const colGap = g.w + g.gx;
    const rowGap = g.h + g.gy + g.lab;
    const pad = 20;
    const width = pad * 2 + (lay.cols - 1) * colGap + g.w;
    const height = pad * 2 + (maxRow - minRow) * rowGap + g.h + g.lab;
    const pos = {};
    for (const [id, n] of Object.entries(lay.nodes)) {
      const term = id === START || id === END;
      const w = term ? TERM.w : g.w;
      const x = pad + n.col * colGap + (term ? (g.w - TERM.w) / 2 : 0);
      const yTop = pad + g.lab + (n.row - minRow) * rowGap;
      pos[id] = { x, y: term ? yTop + (g.h - TERM.h) / 2 : yTop, w, h: term ? TERM.h : g.h, cy: yTop + g.h / 2 };
    }
    const dur = Object.fromEntries(project.activities.map((a) => [a.id, a.d]));
    const crit = new Set(criticalOn ? solution.critical : []);
    const val = (id, f) => {
      if (f === 'id') return id;
      if (f === 'd') return numFmt(dur[id]);
      const k = `${id}.${f}`;
      return revealed.has(k) ? numFmt(revealed.get(k)) : '·';
    };

    // Clases de las flechas según el paso
    const edgeClass = new Map();
    if (step && (step.kind === 'forward' || step.kind === 'backward') && step.formula) {
      // Mientras se predice no se marca qué término manda: todos se ven como comparados (decisión F7).
      const chosen = new Set(ctx.hide ? [] : step.formula.chosen);
      for (const t of step.formula.terms) {
        const key = step.kind === 'forward' ? `${t.from}>${step.act}` : `${step.act}>${t.from}`;
        edgeClass.set(key, chosen.has(t.from) ? 'chosen' : 'compared');
      }
    }
    for (const [a, b] of ctx.selPrecs || []) edgeClass.set(`${a}>${b}`, 'sel');
    const isCritNode = (id) => id === START || id === END || crit.has(id);
    const tight = (a, b) => Math.abs(solution.times[a].EF - solution.times[b].ES) < 1e-9;

    const sel = d3.select(container);
    sel.selectAll('*').remove();
    // En pantallas estrechas la red no baja de 560 px: el contenedor se desplaza en horizontal.
    const svg = sel.append('svg').attr('class', 'net').attr('width', '100%').attr('style', `max-width:${width}px;min-width:${ctx.fit ? Math.min(width, ctx.minWidth || 0) : Math.min(width, 560)}px`)
      .attr('viewBox', `0 0 ${width} ${height}`).attr('role', 'img')
      .attr('aria-label', G.i18n.t(lang, 'view.netLabel', { name: ctx.name, n: project.activities.length }));
    const defs = svg.append('defs');
    for (const [id, cls] of [['pnl-mk', 'mk'], ['pnl-mk-a', 'mk-a'], ['pnl-mk-c', 'mk-c'], ['pnl-mk-s', 'mk-s']]) {
      defs.append('marker').attr('id', id).attr('viewBox', '0 0 10 10').attr('refX', 9).attr('refY', 5)
        .attr('markerWidth', 7).attr('markerHeight', 7).attr('orient', 'auto')
        .append('path').attr('d', 'M0 0L10 5L0 10z').attr('class', cls);
    }

    const graph = G.layout.graph(solution, project);
    const edges = [];
    for (const u of [START, ...solution.order]) for (const v of graph.succs(u)) edges.push([u, v]);
    const eg = svg.append('g');
    for (const [u, v] of edges) {
      const a = pos[u]; const b = pos[v];
      const x1 = a.x + a.w; const y1 = a.cy; const x2 = b.x; const y2 = b.cy;
      // Las flechas largas recorren su carril (los nodos virtuales de views/layout) con curvas de
      // salida y llegada horizontales; las cortas son rectas.
      const bends = (lay.bends && lay.bends[`${u}>${v}`]) || [];
      let d = `M${x1} ${y1}`;
      let px = x1; let py = y1;
      const curveTo = (x, y) => {
        const dx = (x - px) / 2;
        d += py === y ? ` L${x} ${y}` : ` C ${px + dx} ${py}, ${x - dx} ${y}, ${x} ${y}`;
      };
      for (const b of bends) {
        const xl = pad + b.col * colGap;
        const yb = pad + g.lab + (b.row - minRow) * rowGap + g.h / 2;
        curveTo(xl, yb);
        d += ` L${xl + g.w} ${yb}`;
        px = xl + g.w; py = yb;
      }
      if (bends.length) curveTo(x2, y2); else d += ` L${x2} ${y2}`;
      let cls = edgeClass.get(`${u}>${v}`) || '';
      if (!cls && criticalOn && isCritNode(u) && isCritNode(v) && tight(u, v) && (crit.has(u) || crit.has(v))) cls = 'crit';
      eg.append('path').attr('d', d).attr('class', `edge ${cls}`)
        .attr('marker-end', `url(#${{ chosen: 'pnl-mk-a', compared: 'pnl-mk-a', crit: 'pnl-mk-c', sel: 'pnl-mk-s' }[cls] || 'pnl-mk'})`);
    }

    const ng = svg.append('g');
    for (const id of Object.keys(lay.nodes)) {
      const p = pos[id];
      const gg = ng.append('g').attr('transform', `translate(${p.x},${p.y})`);
      if (id === START || id === END) {
        gg.append('rect').attr('class', 'term').attr('width', p.w).attr('height', p.h).attr('rx', p.h / 2);
        gg.append('text').attr('class', 'lbl').attr('x', p.w / 2).attr('y', p.h / 2 + 4).text(G.narrate.nodeName(lang, id));
        continue;
      }
      const active = step && step.act === id;
      const cls = `box${active ? ' active' : ''}${!active && crit.has(id) ? ' crit' : ''}${ctx.selected === id ? ' sel' : ''}`;
      gg.attr('class', 'node');
      if (ctx.onSelect) gg.style('cursor', 'pointer').on('click', () => ctx.onSelect(id));
      const txt = (x, y, f, k) => gg.append('text').attr('class', f === 'id' ? 'nid' : `val${val(id, f) === '·' ? ' hidden' : ''}`)
        .attr('x', x).attr('y', y).text(val(id, f)).append('title').text(f === 'id' || f === 'd' ? (f === 'd' ? 'd' : id) : N[f] || k);
      if (box === 'c') {
        gg.append('text').attr('class', 'val').attr('x', p.w / 2).attr('y', -6).text(`${val(id, 'ES')}/${val(id, 'd')}/${val(id, 'LS')}`);
        gg.append('rect').attr('class', cls).attr('width', p.w).attr('height', p.h).attr('rx', p.h / 2);
        gg.append('text').attr('class', 'nid').attr('x', p.w / 2).attr('y', p.h / 2 + 5).text(id);
      } else if (box === '4') {
        gg.append('rect').attr('class', cls).attr('width', p.w).attr('height', p.h).attr('rx', 6);
        const r = p.h / 3;
        gg.append('line').attr('class', 'sep').attr('x1', 0).attr('x2', p.w).attr('y1', r).attr('y2', r);
        gg.append('line').attr('class', 'sep').attr('x1', 0).attr('x2', p.w).attr('y1', 2 * r).attr('y2', 2 * r);
        gg.append('line').attr('class', 'sep').attr('x1', p.w / 2).attr('x2', p.w / 2).attr('y1', r).attr('y2', 2 * r);
        txt(p.w / 2, r - 5, 'id'); txt(p.w / 4, 2 * r - 6, 'ES'); txt(3 * p.w / 4, 2 * r - 6, 'LS'); txt(p.w / 2, 3 * r - 6, 'd');
      } else {
        gg.append('rect').attr('class', cls).attr('width', p.w).attr('height', p.h).attr('rx', 6);
        const r = p.h / 3; const c = p.w / 3;
        for (const y of [r, 2 * r]) gg.append('line').attr('class', 'sep').attr('x1', 0).attr('x2', p.w).attr('y1', y).attr('y2', y);
        for (const x of [c, 2 * c]) {
          gg.append('line').attr('class', 'sep').attr('x1', x).attr('x2', x).attr('y1', 0).attr('y2', r);
          gg.append('line').attr('class', 'sep').attr('x1', x).attr('x2', x).attr('y1', 2 * r).attr('y2', p.h);
        }
        txt(c / 2, r - 7, 'ES'); txt(1.5 * c, r - 7, 'd'); txt(2.5 * c, r - 7, 'EF');
        txt(p.w / 2, 2 * r - 6, 'id');
        txt(c / 2, p.h - 7, 'LS'); txt(1.5 * c, p.h - 7, 'TF'); txt(2.5 * c, p.h - 7, 'LF');
      }
    }
  }

  const api = { render, GEO };
  root.PNL = root.PNL || {};
  root.PNL.royView = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
