/*
 * views/ct-chart — curva de costes de la pestaña de coste–tiempo (spec f5b-coste-tiempo, AC6 y AC10; plan §4, `analyze`
 * B2; tableros 123, 127 y 129). Dibuja las series que da ct.curveSpec (total, directo óptimo, indirecto con penalización
 * y prima, y la regla si se queda por encima), marca las duraciones de coste total mínimo con una línea y la elegida con
 * una banda, y escribe el valor de cada punto de la serie principal. Pulsar un punto elige esa duración (spec.onPick).
 * Como views/dist-chart: sin innerHTML (constitución, 22), elementos con createElementNS y colores en clases (css/ct.css),
 * así que valen en claro y oscuro. La alternativa en texto y el camino de teclado son la tabla de la compresión.
 * spec = { w, h, ts: [T…], series: [{ key, pts: [[T, v]], cls, dash }], best: [T…], chosen, pick, fmt(v), xLabel, label,
 *          pointTitle(T, v) }
 */
(function (root) {
  'use strict';

  const NS = 'http://www.w3.org/2000/svg';
  const PAD = { l: 48, r: 14, t: 18, b: 36 };

  /** El paso del eje y: 1, 2, 2,5 o 5 por una potencia de 10 (2,5 solo desde 25), con 6 tramos como mucho, sea cual sea
   * la magnitud de los costes (con una lista cerrada, costes de cientos de miles daban decenas de líneas apiñadas). */
  function niceStep(span) {
    if (span <= 6) return 1;
    const raw = span / 6;
    const mag = 10 ** Math.floor(Math.log10(raw));
    for (const k of [1, 2, 2.5, 5, 10]) if (k * mag >= raw - 1e-9 * raw && Number.isInteger(k * mag)) return k * mag;
    return 10 * mag;
  }

  /** Cada cuántas duraciones se escribe una cifra en el eje x y el valor de los puntos, para que no se pisen. */
  const every = (n, w) => Math.max(1, Math.ceil(n / Math.max(1, Math.floor((w - PAD.l - PAD.r) / 30))));

  /** Escalas de la curva (sin DOM, para las pruebas): el eje y empieza en 0 (o más abajo si hay negativos). */
  function scales(spec) {
    const all = spec.series.flatMap((x) => x.pts.map((q) => q[1]));
    const hi = Math.max(...all);
    let lo = Math.min(0, ...all);
    const step = niceStep(hi - lo);
    lo = Math.floor(lo / step) * step;
    const top = Math.max(lo + step, Math.ceil(hi / step) * step);
    const tmin = Math.min(...spec.ts); const tmax = Math.max(...spec.ts);
    // Un margen dentro del eje para que la etiqueta del primer y el último punto no pisen las cifras del eje y.
    const IN = 16;
    const X = (T) => PAD.l + IN + (tmax > tmin ? (T - tmin) / (tmax - tmin) : 0.5) * (spec.w - PAD.l - PAD.r - 2 * IN);
    const Y = (v) => PAD.t + (top - v) / (top - lo) * (spec.h - PAD.t - PAD.b);
    return { X, Y, lo, top, step, every: every(spec.ts.length, spec.w) };
  }

  function render(holder, spec) {
    const doc = root.document;
    while (holder.firstChild) holder.removeChild(holder.firstChild);
    const el = (tag, attrs, text) => {
      const e = doc.createElementNS(NS, tag);
      for (const [k, v] of Object.entries(attrs)) if (v != null) e.setAttribute(k, String(v));
      if (text != null) e.textContent = text;
      return e;
    };
    const f1 = (v) => v.toFixed(1);
    const { X, Y, lo, top, step, every: k } = scales(spec);
    // Con muchas duraciones, las cifras del eje x van de k en k, contando desde la normal (la mayor), y solo llevan su valor
    // la elegida y la primera de coste mínimo (si no está pegada a la elegida): el resto, en la tabla de la compresión.
    const tmax = Math.max(...spec.ts);
    const shown = (T) => (tmax - T) % k === 0;
    const b0 = (spec.best || [])[0];
    const valued = (T) => k === 1 || T === spec.chosen || (T === b0 && (spec.chosen == null || Math.abs(T - spec.chosen) >= k));
    const svg = el('svg', { class: 'ctc', viewBox: `0 0 ${spec.w} ${spec.h}`, width: '100%', role: 'img', 'aria-label': spec.label, preserveAspectRatio: 'xMidYMid meet' });
    svg.style.maxWidth = `${spec.w}px`;
    const y0 = PAD.t; const y1 = spec.h - PAD.b;
    if (spec.chosen != null) svg.appendChild(el('rect', { class: 'ctc-band', x: f1(X(spec.chosen) - 9), y: y0, width: 18, height: y1 - y0 }));
    for (let v = lo; v <= top + 1e-9; v += step) {
      svg.appendChild(el('line', { class: 'ctc-grid', x1: PAD.l, y1: f1(Y(v)), x2: spec.w - PAD.r, y2: f1(Y(v)) }));
      svg.appendChild(el('text', { class: 'ctc-tick', x: PAD.l - 6, y: f1(Y(v) + 4), 'text-anchor': 'end' }, spec.fmt(v)));
    }
    for (const T of spec.ts.filter(shown)) svg.appendChild(el('text', { class: 'ctc-tick', x: f1(X(T)), y: y1 + 15, 'text-anchor': 'middle' }, String(T)));
    svg.appendChild(el('text', { class: 'ctc-axis', x: (PAD.l + spec.w - PAD.r) / 2, y: spec.h - 4, 'text-anchor': 'middle' }, spec.xLabel));
    const best = new Set(spec.best || []);
    for (const T of best) svg.appendChild(el('line', { class: 'ctc-best', x1: f1(X(T)), y1: y0, x2: f1(X(T)), y2: y1, 'stroke-dasharray': '4 3' }));
    for (const s of spec.series) {
      svg.appendChild(el('polyline', { class: `ctc-line ${s.cls}`, points: s.pts.map(([T, v]) => `${f1(X(T))},${f1(Y(v))}`).join(' '), 'stroke-dasharray': s.dash || null }));
      if (s.key === spec.pick) continue;
      for (const [T, v] of s.pts) svg.appendChild(el('circle', { class: `ctc-dot ${s.cls}`, cx: f1(X(T)), cy: f1(Y(v)), r: 3 }));
    }
    // La serie principal, encima: cada punto se puede pulsar y lleva su valor.
    const main = spec.series.find((x) => x.key === spec.pick);
    for (const [T, v] of main.pts) {
      const b = best.has(T);
      const g = el('g', { class: `ctc-pt${b ? ' best' : ''}${T === spec.chosen ? ' chosen' : ''}`, 'data-t': T });
      g.appendChild(el('title', {}, spec.pointTitle(T, v)));
      g.appendChild(el('circle', { class: 'ctc-hit', cx: f1(X(T)), cy: f1(Y(v)), r: 12 }));
      g.appendChild(el('circle', { class: `ctc-mark ${main.cls}`, cx: f1(X(T)), cy: f1(Y(v)), r: b ? 6 : 4 }));
      if (valued(T)) g.appendChild(el('text', { class: 'ctc-val', x: f1(X(T)), y: f1(Y(v) - 10), 'text-anchor': 'middle' }, spec.fmt(v)));
      if (spec.onPick) g.addEventListener('click', () => spec.onPick(T));
      svg.appendChild(g);
    }
    holder.appendChild(svg);
    return svg;
  }

  const api = { PAD, niceStep, every, scales, render };
  root.PNL = root.PNL || {};
  root.PNL.ctChart = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
