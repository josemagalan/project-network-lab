/*
 * views/mc-charts — gráficos de M7 en SVG (spec f4b-montecarlo-indices; plan §2; tableros 72–75 y 78–79): la función de
 * distribución de la duración con sus percentiles y el tornado en espejo (criticidad a la izquierda, crucialidad a la
 * derecha). Sin innerHTML (constitución, 22); colores en clases de css/m7.css (valen en claro y oscuro). La alternativa en
 * texto va en aria-label y, además, en la tabla que pinta quien llama.
 *   cdf(holder, { w, h, x: [lo, hi], ticks, fmt, yfmt, sorted, normal: { mu, sd } | null, deadline, marks: [{ p, x, label,
 *       chosen }], label })
 *   tornado(holder, { w, rows: [{ id, crit, cruc }], left, right, fmt, label })
 */
(function (root) {
  'use strict';

  const NS = 'http://www.w3.org/2000/svg';
  const PAD = { l: 34, r: 14, t: 10, b: 24 };

  function make(holder, w, h, label) {
    const doc = root.document;
    while (holder.firstChild) holder.removeChild(holder.firstChild);
    const el = (tag, attrs, text) => {
      const e = doc.createElementNS(NS, tag);
      for (const [k, v] of Object.entries(attrs || {})) if (v != null) e.setAttribute(k, String(v));
      if (text != null) e.textContent = text;
      return e;
    };
    const svg = el('svg', { class: 'dc mc', viewBox: `0 0 ${w} ${h}`, width: '100%', role: 'img', 'aria-label': label, preserveAspectRatio: 'xMidYMid meet' });
    svg.style.maxWidth = `${w}px`;
    holder.appendChild(svg);
    return { svg, el };
  }
  /** Puntos de la función de distribución empírica (escalones), como mucho unos 400. */
  function steps(sorted) {
    const n = sorted.length; const out = [];
    const every = Math.max(1, Math.floor(n / 400));
    for (let i = 0; i < n; i += every) out.push([sorted[i], (i + 1) / n]);
    out.push([sorted[n - 1], 1]);
    return out;
  }

  function cdf(holder, o) {
    const { svg, el } = make(holder, o.w, o.h, o.label);
    const [lo, hi] = o.x;
    const X = (v) => PAD.l + ((Math.min(hi, Math.max(lo, v)) - lo) / (hi - lo)) * (o.w - PAD.l - PAD.r);
    const Y = (p) => o.h - PAD.b - p * (o.h - PAD.t - PAD.b);
    for (const p of [0, 0.5, 1]) {
      svg.appendChild(el('line', { class: 'mc-grid', x1: PAD.l, y1: Y(p), x2: o.w - PAD.r, y2: Y(p) }));
      svg.appendChild(el('text', { class: 'dc-tick', x: PAD.l - 4, y: Y(p) + 4, 'text-anchor': 'end' }, o.yfmt(p)));
    }
    svg.appendChild(el('line', { class: 'dc-axis', x1: PAD.l, y1: Y(0), x2: o.w - PAD.r, y2: Y(0) }));
    for (const v of o.ticks) svg.appendChild(el('text', { class: 'dc-tick', x: X(v), y: Y(0) + 15, 'text-anchor': 'middle' }, o.fmt(v)));
    if (o.normal) {
      const pts = Array.from({ length: 161 }, (_, i) => { const x = lo + ((hi - lo) * i) / 160; return [x, root.PNL.threept.phi((x - o.normal.mu) / o.normal.sd)]; });
      svg.appendChild(el('path', { class: 'mc-normal', d: pts.map(([x, p], i) => `${i ? 'L' : 'M'}${X(x).toFixed(1)},${Y(p).toFixed(1)}`).join(' ') }));
    }
    const pts = steps(o.sorted);
    svg.appendChild(el('path', { class: 'mc-cdf', d: pts.map(([x, p], i) => `${i ? 'L' : 'M'}${X(x).toFixed(1)},${Y(p).toFixed(1)}`).join(' ') }));
    if (o.deadline != null) svg.appendChild(el('line', { class: 'dc-v v-deadline', x1: X(o.deadline), y1: PAD.t, x2: X(o.deadline), y2: Y(0) }));
    for (const m of o.marks) {
      const cls = m.chosen ? 'mc-mark chosen' : 'mc-mark';
      svg.appendChild(el('path', { class: `mc-guide${m.chosen ? ' chosen' : ''}`, d: `M${PAD.l},${Y(m.p).toFixed(1)} H${X(m.x).toFixed(1)} V${Y(0)}` }));
      svg.appendChild(el('circle', { class: cls, cx: X(m.x).toFixed(1), cy: Y(m.p).toFixed(1), r: 3.2 }));
      svg.appendChild(el('text', { class: `${cls} mc-label`, x: (X(m.x) + 5).toFixed(1), y: (Y(m.p) + 12).toFixed(1) }, m.label));
    }
    return svg;
  }

  function tornado(holder, o) {
    const rh = 26; const top = 22; const lab = 40;
    const h = top + o.rows.length * rh + 6;
    const { svg, el } = make(holder, o.w, h, o.label);
    const half = (o.w - lab) / 2; const cx = half; const room = half - 44;
    svg.appendChild(el('text', { class: 'mc-head', x: cx - 6, y: 13, 'text-anchor': 'end' }, `◀ ${o.left}`));
    svg.appendChild(el('text', { class: 'mc-head', x: cx + lab + 6, y: 13 }, `${o.right} ▶`));
    o.rows.forEach((r, i) => {
      const y = top + i * rh; const wl = Math.max(0, r.crit) * room; const wr = Math.max(0, r.cruc) * room;
      svg.appendChild(el('rect', { class: 'mc-bar crit', x: (cx - wl).toFixed(1), y: y + 3, width: wl.toFixed(1), height: rh - 8, rx: 2 }));
      svg.appendChild(el('rect', { class: 'mc-bar cruc', x: cx + lab, y: y + 3, width: wr.toFixed(1), height: rh - 8, rx: 2 }));
      svg.appendChild(el('text', { class: 'mc-id', x: cx + lab / 2, y: y + rh / 2 + 4, 'text-anchor': 'middle' }, r.id));
      svg.appendChild(el('text', { class: 'mc-val', x: (cx - wl - 4).toFixed(1), y: y + rh / 2 + 4, 'text-anchor': 'end' }, o.fmt(r.crit)));
      svg.appendChild(el('text', { class: 'mc-val', x: (cx + lab + wr + 4).toFixed(1), y: y + rh / 2 + 4 }, o.fmt(r.cruc)));
    });
    svg.appendChild(el('line', { class: 'dc-axis', x1: cx, y1: top - 2, x2: cx, y2: h - 4 }));
    svg.appendChild(el('line', { class: 'dc-axis', x1: cx + lab, y1: top - 2, x2: cx + lab, y2: h - 4 }));
    return svg;
  }

  const api = { PAD, steps, cdf, tornado };
  root.PNL = root.PNL || {};
  root.PNL.mcCharts = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
