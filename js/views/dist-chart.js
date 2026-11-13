/*
 * views/dist-chart — gráfico de densidades en SVG para la pestaña «Duraciones inciertas» (plan §2; tableros 63–70):
 * curvas (beta-PERT, triangular, beta clásica, normal), histograma, líneas verticales (media, plazo) y eje x.
 * Sin innerHTML (constitución, 22): los elementos se crean con createElementNS. Los colores van en clases (styles.css),
 * así que valen en claro y oscuro. La alternativa en texto la pone quien llama (tabla de valores).
 * spec = { w, h, x: [lo, hi], ymax, ticks: [...], fmt(v), label, curves: [{ pts: [[x, y]], cls, dash }],
 *          hist: { lo, width, counts, n } | null, vlines: [{ x, cls, dash, label }], shade: { pts, to, cls } | null }
 */
(function (root) {
  'use strict';

  const NS = 'http://www.w3.org/2000/svg';
  const PAD = { l: 14, r: 14, t: 18, b: 26 };

  /** Coordenadas de pantalla de un gráfico (sin DOM, para las pruebas). */
  function scales(spec) {
    const [lo, hi] = spec.x;
    const X = (x) => PAD.l + ((x - lo) / (hi - lo)) * (spec.w - PAD.l - PAD.r);
    const Y = (y) => spec.h - PAD.b - (Math.min(y, spec.ymax) / spec.ymax) * (spec.h - PAD.t - PAD.b);
    return { X, Y };
  }
  const path = (pts, X, Y) => pts.map(([x, y], i) => `${i ? 'L' : 'M'}${X(x).toFixed(1)},${Y(y).toFixed(1)}`).join(' ');

  function render(holder, spec) {
    const doc = root.document;
    while (holder.firstChild) holder.removeChild(holder.firstChild);
    const el = (tag, attrs) => { const e = doc.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) if (v != null) e.setAttribute(k, String(v)); return e; };
    const { X, Y } = scales(spec);
    const svg = el('svg', { class: 'dc', viewBox: `0 0 ${spec.w} ${spec.h}`, width: '100%', role: 'img', 'aria-label': spec.label, preserveAspectRatio: 'xMidYMid meet' });
    svg.style.maxWidth = `${spec.w}px`;
    if (spec.shade) {
      const pts = spec.shade.pts.filter(([x]) => x <= spec.shade.to);
      if (pts.length > 1) svg.appendChild(el('path', { class: `dc-shade ${spec.shade.cls || ''}`, d: `M${X(pts[0][0])},${Y(0)} ${path(pts, X, Y).replace(/^M/, 'L')} L${X(pts[pts.length - 1][0])},${Y(0)} Z` }));
    }
    if (spec.hist) {
      const { lo, width, counts, n } = spec.hist;
      const g = el('g', { class: 'dc-hist' });
      counts.forEach((c, i) => {
        if (!c) return;
        const d = c / (n * width);
        const x0 = X(lo + i * width); const x1 = X(lo + (i + 1) * width);
        g.appendChild(el('rect', { x: x0.toFixed(1), y: Y(d).toFixed(1), width: Math.max(0.5, x1 - x0 - 0.6).toFixed(1), height: (Y(0) - Y(d)).toFixed(1) }));
      });
      svg.appendChild(g);
    }
    svg.appendChild(el('line', { class: 'dc-axis', x1: PAD.l, y1: Y(0), x2: spec.w - PAD.r, y2: Y(0) }));
    for (const v of spec.ticks) {
      svg.appendChild(el('line', { class: 'dc-axis', x1: X(v), y1: Y(0), x2: X(v), y2: Y(0) + 4 }));
      const tx = el('text', { class: 'dc-tick', x: X(v), y: Y(0) + 16, 'text-anchor': 'middle' });
      tx.textContent = spec.fmt(v);
      svg.appendChild(tx);
    }
    for (const c of spec.curves) svg.appendChild(el('path', { class: `dc-curve ${c.cls}`, d: path(c.pts, X, Y), 'stroke-dasharray': c.dash || null }));
    for (const v of spec.vlines || []) {
      svg.appendChild(el('line', { class: `dc-v ${v.cls || ''}`, x1: X(v.x), y1: PAD.t - 6, x2: X(v.x), y2: Y(0), 'stroke-dasharray': v.dash || null }));
      if (v.label) {
        const right = X(v.x) > spec.w * 0.72;
        const tx = el('text', { class: `dc-vlabel ${v.cls || ''}`, x: X(v.x) + (right ? -4 : 4), y: PAD.t - 6 + 10, 'text-anchor': right ? 'end' : 'start' });
        tx.textContent = v.label;
        svg.appendChild(tx);
      }
    }
    holder.appendChild(svg);
    return svg;
  }

  const api = { PAD, scales, render };
  root.PNL = root.PNL || {};
  root.PNL.distChart = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
