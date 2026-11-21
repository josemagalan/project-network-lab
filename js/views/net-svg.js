/*
 * views/net-svg — la red ROY o PERT del detective de Moodle como SVG en texto (spec f3d-construir-detectar, AC21; plan
 * P4; prototipo de T001, spikes/f3d-construir-detectar/svg-prueba.js, que UBUVirtual importa bien). Sin DOM: core/moodle
 * lo recibe inyectado (ctx.svg) y lo mete en el XML como archivo; en el navegador, la vista previa lo enseña tal cual.
 * Se coloca la red correcta (views/layout para la ROY y views/aoa-layout para la PERT de las reglas) y se dibuja la que
 * se enseña encima: un arco que no está en la correcta va recto; uno que falta no se dibuja. Colores fijos (negro sobre
 * blanco): es una imagen dentro de una pregunta. Determinista y con todo el texto escapado.
 *   render({ graph: 'aon', project, solution, roy, names: { start, end }, title, desc })
 *   render({ graph: 'aoa', base, pert, title, desc })        base: la red de las reglas; pert: la que se enseña
 * F3f (P2, T001): dx opcional en los dos, la separación entre columnas (110 px por defecto, como hasta ahora; el examen en
 * papel usa 95, el dibujo compacto).
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
    const DXm = m.dx || DX;
    const xy = (n) => [PAD + BW + 4 + n.col * DXm, PAD + BH + 2 + (n.row - minRow) * DY];
    const w = PAD * 2 + 2 * BW + 8 + (lay.cols - 1) * DXm; const h = PAD * 2 + 2 * BH + 4 + (lay.rows - 1) * DY;
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
    const DXm = m.dx || DX;
    const xy = (n) => [PAD + R + 1 + n.col * DXm, PAD + R + 1 + (n.row - minRow) * DY];
    const w = PAD * 2 + 2 * R + 2 + (lay.cols - 1) * DXm; const h = PAD * 2 + 2 * R + 2 + (lay.rows - 1) * DY;
    const same = (label, from, to) => [...m.base.arcs.map((a) => [a.act, a.from, a.to]), ...m.base.dummies.map((d) => [d.name, d.from, d.to])]
      .some(([l, f, t]) => l === label && f === from && t === to);
    const shown = new Set(m.pert.events.map((e) => e.n));
    let s = head(w, h, m.title, m.desc);
    // Las flechas primero y las etiquetas después, para apartar las que se tocan. Dos arcos rectos con los mismos sucesos
    // (el error pertParallel) se curvan a lados distintos, como en det-view; una etiqueta que pisaría a otra baja hasta
    // quedar libre (revisión de T018, I-F5: salían una encima de otra en una de cada cuatro imágenes).
    const list = [...m.pert.arcs.map((a) => [a.from, a.to, a.act, false]), ...m.pert.dummies.map((d) => [d.from, d.to, d.name, true])]
      .filter(([from, to]) => shown.has(from) && shown.has(to) && lay.pos[from] && lay.pos[to])
      .map(([from, to, label, dash]) => ({ from, to, label, dash, bends: same(label, from, to) ? (lay.bends[label] || []).map(xy) : [] }));
    const groups = new Map();
    for (const e of list) if (!e.bends.length) { const k = `${e.from}-${e.to}`; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(e); }
    const labels = [];
    for (const e of list) {
      const p0 = xy(lay.pos[e.from]); const p1 = xy(lay.pos[e.to]);
      const g = e.bends.length ? null : groups.get(`${e.from}-${e.to}`);
      let pts; let lab; let vert;
      if (g && g.length > 1) {
        const off = (g.indexOf(e) - (g.length - 1) / 2) * 24;
        const dx = p1[0] - p0[0]; const dy = p1[1] - p0[1]; const d = Math.hypot(dx, dy) || 1;
        const apex = [(p0[0] + p1[0]) / 2 - (dy / d) * off, (p0[1] + p1[1]) / 2 + (dx / d) * off];
        pts = clip([p0, apex, p1], () => R);
        vert = false;
        lab = [apex[0], apex[1] + (off < 0 ? -5 : 13)];
      } else {
        pts = clip([p0, ...e.bends, p1], () => R);
        const k = Math.floor((pts.length - 1) / 2);
        const mid = [(pts[k][0] + pts[k + 1][0]) / 2, (pts[k][1] + pts[k + 1][1]) / 2];
        vert = Math.abs(pts[k + 1][0] - pts[k][0]) < 4;
        lab = vert ? [mid[0] + 7, mid[1] + 4] : [mid[0], mid[1] - 5];
      }
      s += line(pts, e.dash);
      labels.push({ e, x: lab[0], y: lab[1], anchor: vert ? 'start' : 'middle' });
    }
    // Los sucesos ocupan su sitio desde el principio (se pintan encima) y la etiqueta no sale de la imagen: se prueba
    // bajarla y subirla 13 px cada vez y, si no basta, al otro lado de la flecha (a la izquierda de una vertical; a un lado
    // y otro de una horizontal) hasta quedar libre (ronda 2, R2-F7); si no hay sitio, se queda donde estaba.
    const placed = m.pert.events.filter((e) => lay.pos[e.n]).map((e) => { const [x, y] = xy(lay.pos[e.n]); return [x - R, y - R, x + R, y + R]; });
    const box = (q) => { const wd = 8 * String(q.e.label).length + 2; const x0 = q.anchor === 'start' ? q.x : q.x - wd / 2; return [x0, q.y - 11, x0 + wd, q.y + 2]; };
    const hits = (a, b) => a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];
    const free = (b) => b[0] >= 0 && b[1] >= 0 && b[2] <= w && b[3] <= h && !placed.some((c) => hits(b, c));
    const DYS = [0, 13, -13, 26, -26, 39, -39, 52, -52];
    for (const q of labels) {
      const wd = 8 * String(q.e.label).length + 2;
      const sides = q.anchor === 'start' ? [-(wd + 14)] : [wd + 4, -(wd + 4)];
      const tries = [...DYS.slice(0, 3).map((dy) => [0, dy]), ...sides.flatMap((dx) => DYS.slice(0, 3).map((dy) => [dx, dy])),
        ...DYS.slice(3).map((dy) => [0, dy]), ...sides.flatMap((dx) => DYS.slice(3).map((dy) => [dx, dy]))];
      const at = tries.find(([dx, dy]) => free(box(Object.assign({}, q, { x: q.x + dx, y: q.y + dy })))) || [0, 0];
      q.x += at[0]; q.y += at[1];
      placed.push(box(q));
      s += `<text x="${f1(q.x)}" y="${f1(q.y)}" text-anchor="${q.anchor}"${q.e.dash ? ' font-style="italic"' : ''}>${esc(q.e.label)}</text>`;
    }
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
