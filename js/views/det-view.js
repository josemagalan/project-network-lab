/*
 * views/det-view — la red con errores del detective (F3d, T011; plan §4, P6; tableros 86 y 87). Como views/net-svg, se
 * coloca la red correcta (views/layout para la ROY de la F1, views/aoa-layout para la PERT de las reglas) y se dibuja
 * encima la que se enseña: un arco que no está en la correcta va recto (o curvo si comparte sucesos con otro) y uno que
 * falta no se dibuja. No sirven roy-view ni pert-view: dibujan la solución, no una red con arcos de más, de menos o con un
 * ciclo (decisión técnica de T011).
 * Cada elemento que se puede marcar es un <g data-el="…"> con su nombre (nodo «A», arco «A>B», suceso «e3», ficticia
 * «d:3-5», actividad de la PERT «A», casilla «A.ES» o «e3.TE»); con ctx.interactive(el), se alcanza con Tab, Intro abre
 * su menú (ctx.onOpen), Supr quita la marca (ctx.onClear) y Esc cierra el menú (ctx.onEscape). El estado de cada uno
 * (ctx.status[el] = { cls, badge }) se ve con su clase y con un signo (número, ✓, ½, ✗ o ?): no solo con color. Lo que
 * falta (ctx.ghosts) va punteado. Sin cálculo: los valores llegan hechos (ctx.values) y todo texto entra con textContent.
 *   render(container, { graph, project, shown, values, lang, numFmt, status, ghosts, selected, label, ariaOf(el),
 *     interactive(el), onOpen(el), onClear(el), onEscape() })
 */
(function (root) {
  'use strict';

  const G = root.PNL;
  const NS = 'http://www.w3.org/2000/svg';
  const AON = { bw: 96, bh: 60, nw: 52, nh: 30, tw: 60, th: 30, dx: 142, dy: 86, pad: 26 };
  const AOA = { r: 16, dx: 132, dy: 100, cw: 30, ch: 18, pad: 30 };
  const MARK = { missed: 'bad', reveal: 'bad', false: 'warn', found: 'ok', half: 'sel', marked: 'sel' };

  function s(tag, attrs, kids) {
    const el = root.document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs || {})) if (v != null && v !== false) el.setAttribute(k, String(v));
    for (const c of kids || []) if (c != null) el.appendChild(typeof c === 'string' ? root.document.createTextNode(c) : c);
    return el;
  }
  const f1 = (v) => Math.round(v * 10) / 10;
  const pathOf = (pts) => pts.map((p, i) => `${i ? 'L' : 'M'}${f1(p[0])} ${f1(p[1])}`).join(' ');
  // Recorta el primer y el último tramo en el borde de la figura de cada extremo (cut(ux, uy, extremo) → distancia).
  function clip(pts, cutA, cutB) {
    const out = pts.map((p) => p.slice());
    const trim = (p, q, cut) => { const dx = q[0] - p[0]; const dy = q[1] - p[1]; const d = Math.hypot(dx, dy) || 1; const r = cut(dx / d, dy / d); return [p[0] + dx * r / d, p[1] + dy * r / d]; };
    out[0] = trim(out[0], out[1], cutA);
    out[out.length - 1] = trim(out[out.length - 1], out[out.length - 2], cutB);
    return out;
  }
  const rectCut = (w, h) => (ux, uy) => Math.min(ux ? w / Math.abs(ux) : Infinity, uy ? h / Math.abs(uy) : Infinity) + 2;
  const midOf = (pts) => { const k = Math.floor((pts.length - 1) / 2); return [(pts[k][0] + pts[k + 1][0]) / 2, (pts[k][1] + pts[k + 1][1]) / 2]; };

  function render(container, ctx) {
    const { clear } = G.dom;
    clear(container);
    const out = ctx.graph === 'aoa' ? pert(ctx) : roy(ctx);
    const svg = s('svg', { class: 'net dt-net', viewBox: `0 0 ${out.w} ${out.h}`, width: '100%', role: 'group', 'aria-label': ctx.label, preserveAspectRatio: 'xMidYMid meet' });
    svg.style.minWidth = `${Math.round(out.w * 0.6)}px`;
    svg.appendChild(s('defs', {}, ['mk', 'mk-bad', 'mk-warn', 'mk-ok', 'mk-sel'].map((c) => s('marker', { id: `dt-${c}`, viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 7, markerHeight: 7, orient: 'auto' },
      [s('path', { d: 'M0 0L10 5L0 10z', class: c })]))));
    for (const g of out.layers) svg.appendChild(g);
    container.appendChild(svg);
  }

  // Un elemento que se puede marcar: su clase de estado, su signo y, si se puede pulsar, el teclado.
  function element(ctx, el, cls, kids, badgeAt) {
    const st = ctx.status[el];
    const g = s('g', { class: `${cls}${st ? ` ${st.cls}` : ''}${ctx.selected === el ? ' sel' : ''}`, 'data-el': el }, kids);
    if (st && st.badge && badgeAt) g.appendChild(s('g', { class: `dt-badge ${st.cls}`, transform: `translate(${f1(badgeAt[0])},${f1(badgeAt[1])})`, 'aria-hidden': 'true' },
      [s('circle', { r: 9 }), s('text', { y: 4 }, [st.badge])]));
    if (ctx.interactive(el)) {
      g.setAttribute('tabindex', '0');
      g.setAttribute('role', 'button');
      g.setAttribute('aria-label', ctx.ariaOf(el));
      g.addEventListener('click', (ev) => { ev.stopPropagation(); ctx.onOpen(el); });
      g.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); ctx.onOpen(el); }
        else if (ev.key === 'Delete' || ev.key === 'Backspace') { ev.preventDefault(); ctx.onClear(el); }
        else if (ev.key === 'Escape') { ev.preventDefault(); ctx.onEscape(); }
      });
    }
    return g;
  }
  const marker = (st) => `url(#dt-${st && MARK[st.cls] ? `mk-${MARK[st.cls]}` : 'mk'})`;
  const ghostOf = (ctx, pts) => (gh) => s('g', { class: `dt-ghost ${gh.cls}`, 'aria-hidden': 'true' }, [s('path', { d: pathOf(pts), class: 'edge', 'marker-end': marker(gh) }),
    s('g', { class: `dt-badge ${gh.cls}`, transform: `translate(${f1(midOf(pts)[0])},${f1(midOf(pts)[1] - 2)})` }, [s('circle', { r: 9 }), s('text', { y: 4 }, [gh.badge])])]);

  // ---------- Red ROY: cajas de 7 campos (sin cifras, solo el nombre) ----------
  function roy(ctx) {
    const T = G.topo;
    const g0 = ctx.values ? { bw: AON.bw, bh: AON.bh } : { bw: AON.nw, bh: AON.nh };
    const sol = G.cpm.solve(ctx.project);
    const lay = G.layout.layout(sol, ctx.project);
    const key = (id) => (id === '_S' ? T.START : id === '_E' ? T.END : id);
    const rows = [...Object.values(lay.nodes), ...Object.values(lay.bends).flat()].map((n) => n.row);
    const minRow = Math.min(...rows); const maxRow = Math.max(...rows);
    const xy = (n) => [AON.pad + g0.bw / 2 + n.col * AON.dx, AON.pad + g0.bh / 2 + (n.row - minRow) * AON.dy];
    const w = AON.pad * 2 + g0.bw + (lay.cols - 1) * AON.dx;
    const h = AON.pad * 2 + g0.bh + (maxRow - minRow) * AON.dy;
    const term = (id) => id === '_S' || id === '_E';
    const half = (id) => (term(id) ? [AON.tw / 2, AON.th / 2] : [g0.bw / 2, g0.bh / 2]);
    const c = (id) => xy(lay.nodes[key(id)]);
    const name = (id) => G.exDet.nodeName(id, ctx.lang);
    const net = ctx.shown.roy;
    const arcPts = (from, to) => {
      const mid = (lay.bends[`${key(from)}>${key(to)}`] || []).map(xy);
      return clip([c(from), ...mid, c(to)], rectCut(...half(from)), rectCut(...half(to)));
    };
    const arcs = s('g', { class: 'dt-arcs' });
    for (const a of net.arcs) {
      if (!lay.nodes[key(a.from)] || !lay.nodes[key(a.to)]) continue;
      const el = `${a.from}>${a.to}`;
      const pts = arcPts(a.from, a.to);
      const m = midOf(pts);
      arcs.appendChild(element(ctx, el, 'dt-arc', [s('path', { d: pathOf(pts), class: 'hit' }), s('path', { d: pathOf(pts), class: 'edge', 'marker-end': marker(ctx.status[el]) })], [m[0], m[1] - 2]));
    }
    for (const gh of ctx.ghosts) if (lay.nodes[key(gh.from)] && lay.nodes[key(gh.to)]) arcs.appendChild(ghostOf(ctx, arcPts(gh.from, gh.to))(gh));
    const nodes = s('g', { class: 'dt-nodes' });
    const v = ctx.values;
    for (const n of net.nodes) {
      if (!lay.nodes[key(n.id)]) continue;
      const [x, y] = c(n.id);
      if (term(n.id)) {
        nodes.appendChild(element(ctx, n.id, 'dt-node dt-term', [s('rect', { x: f1(x - AON.tw / 2), y: f1(y - AON.th / 2), width: AON.tw, height: AON.th, rx: AON.th / 2 }),
          s('text', { x: f1(x), y: f1(y + 5) }, [name(n.id)])], [x + AON.tw / 2 - 2, y - AON.th / 2 + 2]));
        continue;
      }
      const x0 = x - g0.bw / 2; const y0 = y - g0.bh / 2;
      if (!v) {
        nodes.appendChild(element(ctx, n.id, 'dt-node', [s('rect', { x: f1(x0), y: f1(y0), width: g0.bw, height: g0.bh, rx: 5 }), s('text', { x: f1(x), y: f1(y + 5) }, [n.id])],
          [x0 + g0.bw - 2, y0 + 2]));
        continue;
      }
      const vals = v.acts[n.id];
      const rh = g0.bh / 3; const cw = g0.bw / 3;
      const box = s('g', { class: `dt-box${vals.crit ? ' crit' : ''}` }, [s('rect', { x: f1(x0), y: f1(y0), width: g0.bw, height: g0.bh, rx: 5, class: 'frame' })]);
      for (const yy of [rh, 2 * rh]) box.appendChild(s('line', { x1: f1(x0), x2: f1(x0 + g0.bw), y1: f1(y0 + yy), y2: f1(y0 + yy), class: 'sep' }));
      for (const xx of [cw, 2 * cw]) for (const [ya, yb] of [[0, rh], [2 * rh, g0.bh]]) box.appendChild(s('line', { x1: f1(x0 + xx), x2: f1(x0 + xx), y1: f1(y0 + ya), y2: f1(y0 + yb), class: 'sep' }));
      nodes.appendChild(box);
      nodes.appendChild(element(ctx, n.id, 'dt-node dt-mid', [s('rect', { x: f1(x0), y: f1(y0 + rh), width: g0.bw, height: rh, class: 'hit' }),
        s('text', { x: f1(x), y: f1(y0 + 2 * rh - 5) }, [vals.crit ? `${n.id} ★` : n.id])], [x0 + g0.bw - 2, y0 + rh + 2]));
      const cell = (f, col, row) => {
        const cx = x0 + col * cw; const cy = y0 + row * rh;
        const el = `${n.id}.${f}`;
        nodes.appendChild(element(ctx, el, 'dt-cell', [s('rect', { x: f1(cx), y: f1(cy), width: f1(cw), height: f1(rh), class: 'hit' }),
          s('text', { x: f1(cx + cw / 2), y: f1(cy + rh - 5) }, [ctx.numFmt(vals[f])])], [cx + cw - 1, cy + 1]));
      };
      cell('ES', 0, 0); cell('EF', 2, 0); cell('LS', 0, 2); cell('TF', 1, 2); cell('LF', 2, 2);
      nodes.appendChild(s('text', { x: f1(x), y: f1(y0 + rh - 5), class: 'dt-d', 'aria-hidden': 'true' }, [ctx.numFmt(ctx.project.activities.find((a) => a.id === n.id).d)]));
    }
    return { w, h, layers: [arcs, nodes] };
  }

  // ---------- Red PERT: sucesos con TE | TL | holgura debajo; actividades con su duración y ★ si son críticas ----------
  function pert(ctx) {
    const base = G.aoa.build(ctx.project, { method: 'rules' });
    const lay = G.aoaLayout.layout(base);
    const rows = [...Object.values(lay.pos), ...Object.values(lay.bends).flat()].map((n) => n.row);
    const minRow = Math.min(...rows); const maxRow = Math.max(...rows);
    const below = ctx.values ? AOA.ch + 8 : 0;
    const xy = (n) => [AOA.pad + AOA.cw * 1.5 + n.col * AOA.dx, AOA.pad + AOA.r + (n.row - minRow) * AOA.dy];
    const w = AOA.pad * 2 + AOA.cw * 3 + (lay.cols - 1) * AOA.dx;
    const h = AOA.pad * 2 + AOA.r * 2 + below + (maxRow - minRow) * AOA.dy;
    const net = ctx.shown.pert;
    const shown = new Set(net.events.map((e) => e.n));
    const same = (label, from, to) => [...base.arcs.map((a) => [a.act, a.from, a.to]), ...base.dummies.map((d) => [d.name, d.from, d.to])].some(([l, f, t]) => l === label && f === from && t === to);
    const dur = Object.fromEntries(ctx.project.activities.map((a) => [a.id, a.d]));
    const v = ctx.values;
    // Varias flechas entre los mismos sucesos (dos actividades paralelas) se curvan a lados distintos.
    const edges = [...net.arcs.map((a) => ({ label: a.act, from: a.from, to: a.to, act: true })), ...net.dummies.map((d) => ({ label: d.name, from: d.from, to: d.to, act: false }))];
    const pair = new Map();
    for (const e of edges) { const k = `${Math.min(e.from, e.to)}-${Math.max(e.from, e.to)}`; pair.set(k, (pair.get(k) || []).concat([e])); }
    const cut = () => AOA.r + 2;
    const geom = (e) => {
      const a = xy(lay.pos[e.from]); const b = xy(lay.pos[e.to]);
      const grp = pair.get(`${Math.min(e.from, e.to)}-${Math.max(e.from, e.to)}`) || [e];
      const off = grp.length > 1 ? (grp.indexOf(e) - (grp.length - 1) / 2) * 26 : 0;
      if (off) {
        const dx = b[0] - a[0]; const dy = b[1] - a[1]; const L = Math.hypot(dx, dy) || 1;
        const ctl = [(a[0] + b[0]) / 2 - (dy / L) * off * 2, (a[1] + b[1]) / 2 + (dx / L) * off * 2];
        const p0 = clip([a, ctl], cut, cut)[0]; const p1 = clip([ctl, b], cut, cut)[1];
        return { d: `M${f1(p0[0])} ${f1(p0[1])} Q ${f1(ctl[0])} ${f1(ctl[1])} ${f1(p1[0])} ${f1(p1[1])}`, mid: [(a[0] + b[0]) / 2 - (dy / L) * off, (a[1] + b[1]) / 2 + (dx / L) * off], vert: false };
      }
      const bends = same(e.label, e.from, e.to) ? (lay.bends[e.label] || []).map(xy) : [];
      const pts = clip([a, ...bends, b], cut, cut);
      const k = Math.floor((pts.length - 1) / 2);
      return { d: pathOf(pts), mid: midOf(pts), vert: Math.abs(pts[k + 1][0] - pts[k][0]) < 4 };
    };
    const arcs = s('g', { class: 'dt-arcs' });
    for (const e of edges) {
      if (!shown.has(e.from) || !shown.has(e.to) || !lay.pos[e.from] || !lay.pos[e.to]) continue;
      const el = e.act ? e.label : `d:${e.from}-${e.to}`;
      const { d, mid, vert } = geom(e);
      const text = e.act ? `${e.label} (${ctx.numFmt(dur[e.label])})${v && v.crit[e.label] ? ' ★' : ''}` : e.label;
      const lx = vert ? mid[0] + 8 : mid[0]; const ly = vert ? mid[1] + 4 : mid[1] - 6;
      arcs.appendChild(element(ctx, el, `dt-arc${e.act ? ' dt-act' : ' dt-dummy'}`, [s('path', { d, class: 'hit' }), s('path', { d, class: 'edge', 'marker-end': marker(ctx.status[el]) }),
        s('text', { x: f1(lx), y: f1(ly), class: 'lbl', 'text-anchor': vert ? 'start' : 'middle' }, [text])], [vert ? lx - 8 : lx + 4 + text.length * 3.6, ly - 10]));
    }
    for (const gh of ctx.ghosts) {
      if (!shown.has(gh.from) || !shown.has(gh.to)) continue;
      arcs.appendChild(ghostOf(ctx, clip([xy(lay.pos[gh.from]), xy(lay.pos[gh.to])], cut, cut))(gh));
    }
    const nodes = s('g', { class: 'dt-nodes' });
    for (const ev of net.events) {
      if (!lay.pos[ev.n]) continue;
      const [x, y] = xy(lay.pos[ev.n]);
      nodes.appendChild(element(ctx, `e${ev.n}`, 'dt-event', [s('circle', { cx: f1(x), cy: f1(y), r: AOA.r }), s('text', { x: f1(x), y: f1(y + 5) }, [String(ev.n)])], [x + AOA.r - 2, y - AOA.r + 2]));
      if (!v) continue;
      ['TE', 'TL', 'slack'].forEach((f, k) => {
        const cx = x - 1.5 * AOA.cw + k * AOA.cw; const cy = y + AOA.r + 6;
        nodes.appendChild(element(ctx, `e${ev.n}.${f}`, 'dt-cell dt-ecell', [s('rect', { x: f1(cx), y: f1(cy), width: AOA.cw, height: AOA.ch, class: 'hit' }),
          s('text', { x: f1(cx + AOA.cw / 2), y: f1(cy + AOA.ch - 5) }, [ctx.numFmt(v.events[ev.n][f])])], [cx + AOA.cw - 1, cy + 1]));
      });
    }
    return { w, h, layers: [arcs, nodes] };
  }

  const api = { render };
  root.PNL = root.PNL || {};
  root.PNL.detView = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
