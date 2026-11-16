/*
 * views/net-svg — la red ROY o PERT del detective de Moodle como SVG en texto (spec f3d-construir-detectar, AC21; plan
 * P4; prototipo de T001, spikes/f3d-construir-detectar/svg-prueba.js, que UBUVirtual importa bien). Sin DOM: core/moodle
 * lo recibe inyectado (ctx.svg) y lo mete en el XML como archivo; en el navegador, la vista previa lo enseña tal cual.
 * Se coloca la red correcta (views/layout para la ROY y views/aoa-layout para la PERT de las reglas) y se dibuja la que
 * se enseña encima: un arco que no está en la correcta va recto; uno que falta no se dibuja. Colores fijos (negro sobre
 * blanco): es una imagen dentro de una pregunta. Determinista y con todo el texto escapado.
 *   render({ graph: 'aon', project, solution, roy, names: { start, end }, title, desc })
 *   render({ graph: 'aoa', base, pert, title, desc })        base: la red de las reglas; pert: la que se enseña
 */
(function (root) {
  'use strict';

  const isNode = typeof module !== 'undefined' && module.exports;
  const L = isNode ? require('./layout.js') : root.PNL.layout;
  const AL = isNode ? require('./aoa-layout.js') : root.PNL.aoaLayout;
  const T = isNode ? require('../core/topo.js') : root.PNL.topo;

  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const f1 = (v) => (Math.round(v * 10) / 10).toString();
  const DX = 110; const DY = 64; const PAD = 30; const BW = 26; const BH = 14; const R = 15;

  const head = (w, h, title, desc) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-labelledby="t d">`
    + `<title id="t">${esc(title)}</title><desc id="d">${esc(desc)}</desc>`
    + '<defs><marker id="a" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="#222"/></marker></defs>'
    + `<rect width="${w}" height="${h}" fill="#fff"/><g font-family="Liberation Sans, Arial, sans-serif" font-size="13" fill="#222">`;
  const line = (pts, dash) => `<polyline points="${pts.map((p) => `${f1(p[0])},${f1(p[1])}`).join(' ')}" fill="none" stroke="#222" stroke-width="1.4"${dash ? ' stroke-dasharray="5 4"' : ''} marker-end="url(#a)"/>`;
  // Recorta el primer y el último tramo para que la flecha empiece y acabe en el borde (caja o círculo).
  const clip = (pts, cut) => {
    const out = pts.map((p) => p.slice());
    const trim = (p, q) => { const dx = q[0] - p[0]; const dy = q[1] - p[1]; const d = Math.hypot(dx, dy) || 1; const r = cut(dx / d, dy / d); return [p[0] + dx * r / d, p[1] + dy * r / d]; };
    out[0] = trim(out[0], out[1]);
    out[out.length - 1] = trim(out[out.length - 1], out[out.length - 2]);
    return out;
  };
  const boxCut = (ux, uy) => Math.min(ux ? BW / Math.abs(ux) : Infinity, uy ? BH / Math.abs(uy) : Infinity) + 1;

  function roy(m) {
    const lay = L.layout(m.solution, m.project);
    const minRow = Math.min(...Object.values(lay.nodes).map((n) => n.row), ...Object.values(lay.bends).flat().map((n) => n.row));
    const xy = (n) => [PAD + BW + 4 + n.col * DX, PAD + BH + 2 + (n.row - minRow) * DY];
    const w = PAD * 2 + 2 * BW + 8 + (lay.cols - 1) * DX; const h = PAD * 2 + 2 * BH + 4 + (lay.rows - 1) * DY;
    const key = (id) => (id === '_S' ? T.START : id === '_E' ? T.END : id);
    const name = (id) => (id === '_S' ? m.names.start : id === '_E' ? m.names.end : id);
    let s = head(w, h, m.title, m.desc);
    for (const a of m.roy.arcs) {
      const u = lay.nodes[key(a.from)]; const v = lay.nodes[key(a.to)];
      if (!u || !v) continue;
      const mid = (lay.bends[`${key(a.from)}>${key(a.to)}`] || []).map(xy);
      s += line(clip([xy(u), ...mid, xy(v)], boxCut), false);
    }
    for (const n of m.roy.nodes) {
      const p = lay.nodes[key(n.id)];
      if (!p) continue;
      const [x, y] = xy(p);
      const term = n.id === '_S' || n.id === '_E';
      s += `<rect x="${f1(x - BW)}" y="${f1(y - BH)}" width="${2 * BW}" height="${2 * BH}" rx="4" fill="#fff" stroke="#222" stroke-width="1.4"/>`
        + `<text x="${f1(x)}" y="${f1(y + 4.5)}" text-anchor="middle"${term ? ' font-style="italic"' : ''}>${esc(name(n.id))}</text>`;
    }
    return `${s}</g></svg>`;
  }

  function pert(m) {
    const lay = AL.layout(m.base);
    const minRow = Math.min(...Object.values(lay.pos).map((n) => n.row), ...Object.values(lay.bends).flat().map((n) => n.row));
    const xy = (n) => [PAD + R + 1 + n.col * DX, PAD + R + 1 + (n.row - minRow) * DY];
    const w = PAD * 2 + 2 * R + 2 + (lay.cols - 1) * DX; const h = PAD * 2 + 2 * R + 2 + (lay.rows - 1) * DY;
    const same = (label, from, to) => [...m.base.arcs.map((a) => [a.act, a.from, a.to]), ...m.base.dummies.map((d) => [d.name, d.from, d.to])]
      .some(([l, f, t]) => l === label && f === from && t === to);
    const shown = new Set(m.pert.events.map((e) => e.n));
    let s = head(w, h, m.title, m.desc);
    const edge = (from, to, label, dash) => {
      if (!shown.has(from) || !shown.has(to) || !lay.pos[from] || !lay.pos[to]) return '';
      const bends = same(label, from, to) ? (lay.bends[label] || []).map(xy) : [];
      const pts = clip([xy(lay.pos[from]), ...bends, xy(lay.pos[to])], () => R);
      const k = Math.floor((pts.length - 1) / 2);
      const mid = [(pts[k][0] + pts[k + 1][0]) / 2, (pts[k][1] + pts[k + 1][1]) / 2];
      const vert = Math.abs(pts[k + 1][0] - pts[k][0]) < 4;
      return line(pts, dash) + `<text x="${f1(vert ? mid[0] + 7 : mid[0])}" y="${f1(vert ? mid[1] + 4 : mid[1] - 5)}" text-anchor="${vert ? 'start' : 'middle'}"${dash ? ' font-style="italic"' : ''}>${esc(label)}</text>`;
    };
    for (const a of m.pert.arcs) s += edge(a.from, a.to, a.act, false);
    for (const d of m.pert.dummies) s += edge(d.from, d.to, d.name, true);
    for (const e of m.pert.events) {
      if (!lay.pos[e.n]) continue;
      const [x, y] = xy(lay.pos[e.n]);
      s += `<circle cx="${f1(x)}" cy="${f1(y)}" r="${R}" fill="#fff" stroke="#222" stroke-width="1.4"/><text x="${f1(x)}" y="${f1(y + 4.5)}" text-anchor="middle">${e.n}</text>`;
    }
    return `${s}</g></svg>`;
  }

  const render = (m) => (m.graph === 'aoa' ? pert(m) : roy(m));

  const api = { render };
  root.PNL = root.PNL || {};
  root.PNL.netSvg = api;
  if (isNode) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
