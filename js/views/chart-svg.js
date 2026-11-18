/*
 * views/chart-svg — los gráficos de «Leer una simulación» como SVG en texto (spec f3e-probabilidad-montecarlo, AC6, AC15
 * y AC19; plan §0 «Gráficos sin DOM» y P4). Como views/net-svg: sin DOM, determinista, con todo el texto escapado y en
 * colores fijos (negro sobre blanco), porque es una imagen dentro de una pregunta. La misma imagen en «Ejercicios» (con
 * <img src="data:…">, dataUri) y en Moodle (archivo con @@PLUGINFILE@@; core/moodle la recibe inyectada, ctx.chart).
 * Gráficos «como los de M7, sin cifras» (análisis, H11): los ejes llevan sus números, pero ni los percentiles ni los
 * índices; lo que se pide se lee con la rejilla (± una clase en los tiempos, ±0,05 en probabilidades e índices).
 *   dist({ durations, deadline, bins, title, desc, labels: { deadline, x, hist, cdf }, dec })
 *       histograma (arriba) y función de distribución (abajo) con el mismo eje de tiempos; rejilla vertical no más ancha
 *       que una clase y horizontal cada 0,05; el plazo, con una línea discontinua y su etiqueta (no solo el color).
 *   indices({ rows: [{ id, crit, cruc? }], title, desc, labels: { crit, cruc }, dec })
 *       tornado (criticidad a la izquierda, crucialidad a la derecha) o, sin crucialidad, barras de criticidad; rejilla
 *       cada 0,05; los índices fuera de [0, 1] se recortan, como en M7.
 *   table(durations, bins) → [{ from, to, cum }]     alternativa en texto (constitución, 24): bordes de cada clase y
 *       frecuencia acumulada, a dos decimales; indexTable(rows) → [{ id, crit, cruc? }] a una cifra decimal.
 *   hist(durations, bins) → { lo, width, counts }    las clases de core/sim (summary.hist): las de la tolerancia.
 *   dataUri(svg) → «data:image/svg+xml;base64,…» (UTF-8; con Buffer en Node y con TextEncoder y btoa en el navegador).
 * Los textos (título, descripción, etiquetas) los pone quien llama, en su idioma; dec es el separador decimal.
 */
(function (root) {
  'use strict';

  const BINS = 40;
  const W = 640;
  const TY = 4;                       // las etiquetas del eje vertical, centradas en su línea
  const FONT = 'font-family="Liberation Sans, Arial, sans-serif" font-size="12" fill="#222"';
  const HALO = 'stroke="#fff" stroke-width="3" paint-order="stroke"';
  const NICE = [1, 2, 5];

  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const f1 = (v) => (Math.round(v * 10) / 10).toString();
  const r1 = (v) => Math.round(v * 10) / 10;
  const r2 = (v) => Math.round(v * 100) / 100;
  const clamp01 = (v) => Math.min(1, Math.max(0, Number(v) || 0));
  const fail = (msg) => { throw new Error(`chart-svg: ${msg}`); };
  const fmt = (v, digits, dec) => {
    const s = (Math.abs(v) < 1e-12 ? 0 : v).toFixed(digits);
    return dec === ',' ? s.replace('.', ',') : s;
  };
  const digitsOf = (step) => Math.max(0, -Math.floor(Math.log10(step) + 1e-9));

  const head = (w, h, title, desc) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-labelledby="t d">`
    + `<title id="t">${esc(title)}</title><desc id="d">${esc(desc)}</desc>`
    + `<rect width="${w}" height="${h}" fill="#fff"/><g ${FONT}>`;
  const text = (cls, x, y, s, anchor, extra) => `<text class="${cls}" x="${f1(x)}" y="${f1(y)}"${anchor ? ` text-anchor="${anchor}"` : ''}${extra ? ` ${extra}` : ''}>${esc(s)}</text>`;
  const vline = (cls, x, y1, y2, stroke) => `<line class="${cls}" x1="${f1(x)}" y1="${f1(y1)}" x2="${f1(x)}" y2="${f1(y2)}" stroke="${stroke}"/>`;
  const hline = (cls, y, x1, x2, stroke) => `<line class="${cls}" x1="${f1(x1)}" y1="${f1(y)}" x2="${f1(x2)}" y2="${f1(y)}" stroke="${stroke}"/>`;

  /** Las duraciones ordenadas (copia), comprobadas. */
  function sortedOf(durations) {
    if (!durations || !(durations.length > 0)) fail('no hay duraciones');
    const x = Float64Array.from(durations);
    for (let i = 0; i < x.length; i++) if (!Number.isFinite(x[i])) fail('una duración no es un número');
    return x.sort();
  }

  function histOf(x, bins) {
    if (!Number.isInteger(bins) || bins < 1) fail('número de clases no válido');
    const n = x.length;
    let lo = x[0]; let hi = x[n - 1];
    if (!(hi > lo)) { lo -= 0.5; hi += 0.5; }
    const width = (hi - lo) / bins; const counts = new Array(bins).fill(0);
    for (let i = 0; i < n; i++) counts[Math.min(bins - 1, Math.floor((x[i] - lo) / width))]++;
    return { lo, width, counts };
  }
  /** Las clases de core/sim (summary.hist), con la misma cuenta. */
  const hist = (durations, bins) => histOf(sortedOf(durations), bins === undefined ? BINS : bins);

  /** Proporción de duraciones ≤ t, con la tolerancia de core/sim (summary.pLE). */
  function pLE(x, t) {
    const tt = t + 1e-9 * Math.max(1, Math.abs(t));
    let lo = 0; let hi = x.length;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (x[mid] <= tt) lo = mid + 1; else hi = mid; }
    return lo / x.length;
  }

  /** El paso «bonito» (1, 2 o 5 por una potencia de 10) más pequeño que llega a raw. */
  function niceUp(raw) {
    const p = 10 ** Math.floor(Math.log10(raw));
    for (const m of NICE.concat([10])) if (m * p >= raw - 1e-12) return m * p;
    return 10 * p;
  }
  /** La rejilla fina: el paso «bonito» más grande que no pasa de una clase y que divide al de las etiquetas. */
  function minorOf(step, w) {
    const cap = Math.min(step, w);
    for (let k = Math.floor(Math.log10(cap)) + 1; k > -12; k--) {
      for (const m of NICE.slice().reverse()) {
        const v = m * 10 ** k;
        if (v > cap + 1e-12) continue;
        const ratio = step / v;
        if (Math.abs(ratio - Math.round(ratio)) < 1e-9) return v;
      }
    }
    return cap;
  }

  // ---------- histograma y función de distribución ----------

  function dist(o) {
    const x = sortedOf(o.durations);
    const bins = o.bins === undefined ? BINS : o.bins;
    const h = histOf(x, bins);
    const labels = o.labels || {};
    const dec = o.dec;
    const hasD = o.deadline != null && Number.isFinite(Number(o.deadline));
    const deadline = hasD ? Number(o.deadline) : null;
    const top = h.lo + bins * h.width;
    const dmin = hasD ? Math.min(h.lo, deadline) : h.lo;
    const dmax = hasD ? Math.max(top, deadline) : top;
    const step = niceUp((dmax - dmin) / 10);
    const i0 = Math.floor(dmin / step + 1e-9); const i1 = Math.ceil(dmax / step - 1e-9);
    const x0 = i0 * step; const x1 = i1 * step;
    const minor = minorOf(step, h.width);

    const L = 46; const R = 18; const HT = 30; const HB = 176; const CT = 214; const CB = 374; const H = 418;
    const X = (v) => L + ((v - x0) / (x1 - x0)) * (W - L - R);
    const Y = (p) => CB - p * (CB - CT);
    let s = head(W, H, o.title, o.desc);
    if (labels.hist != null) s += text('cap', L, HT - 12, labels.hist);
    if (labels.cdf != null) s += text('cap', L, CT - 12, labels.cdf);
    // Rejilla vertical (en los dos paneles), con las de las etiquetas más marcadas.
    const per = Math.round(step / minor);
    for (let j = Math.round(x0 / minor); j <= Math.round(x1 / minor); j++) {
      const major = j % per === 0;
      const stroke = major ? '#bdbdbd' : '#e6e6e6';
      s += vline('gx', X(j * minor), HT, HB, stroke) + vline('gx', X(j * minor), CT, CB, stroke);
    }
    // Rejilla horizontal de la función de distribución, cada 0,05; etiquetas cada 0,1.
    for (let k = 0; k <= 20; k++) {
      s += hline('gy', Y(k / 20), L, W - R, k % 2 ? '#e6e6e6' : '#bdbdbd');
      if (k % 2 === 0) s += text('ty', L - 6, Y(k / 20) + TY, k === 0 ? '0' : k === 20 ? '1' : fmt(k / 20, 1, dec), 'end');
    }
    // Histograma: una barra por clase con réplicas, alineada con sus bordes.
    const maxC = Math.max(...h.counts); const full = HB - HT - 6;
    h.counts.forEach((k, i) => {
      if (!k) return;
      const a = X(h.lo + i * h.width); const b = X(h.lo + (i + 1) * h.width);
      const gap = Math.min(1, 0.15 * (b - a));
      const bh = Math.round((full * k * 10) / maxC) / 10;
      s += `<rect class="bar" x="${f1(a)}" y="${f1(HB - bh)}" width="${f1(b - a - gap)}" height="${f1(bh)}" fill="#7aa6d6" stroke="#1d4f91" stroke-width="0.5"/>`;
    });
    s += hline('axis', HB, L, W - R, '#222') + hline('axis', CB, L, W - R, '#222');
    // Función de distribución empírica: cuatro puntos por clase, de 0 a 1 en todo el eje.
    const pts = [[X(x0), Y(0)]];
    const q = 4;
    for (let j = 0; j <= bins * q; j++) { const t = h.lo + (j * h.width) / q; pts.push([X(t), Y(pLE(x, t))]); }
    pts.push([X(x1), Y(1)]);
    s += `<polyline class="cdf" points="${pts.map((p) => `${f1(p[0])},${f1(p[1])}`).join(' ')}" fill="none" stroke="#1d4f91" stroke-width="2"/>`;
    // Etiquetas del eje de tiempos y su título.
    const dg = digitsOf(step);
    for (let i = i0; i <= i1; i++) s += text('tx', X(i * step), CB + 16, fmt(i * step, dg, dec), 'middle');
    if (labels.x != null) s += text('cap', (L + W - R) / 2, CB + 36, labels.x, 'middle');
    // El plazo: línea discontinua en los dos paneles y su etiqueta.
    if (hasD) {
      const xd = X(deadline);
      s += `<line class="dl" x1="${f1(xd)}" y1="${f1(HT - 4)}" x2="${f1(xd)}" y2="${f1(CB)}" stroke="#b22222" stroke-width="1.5" stroke-dasharray="6 4"/>`;
      if (labels.deadline != null) {
        const right = xd > W - R - 140;
        s += text('dlab', right ? xd - 5 : xd + 5, HT + 8, labels.deadline, right ? 'end' : null, `fill="#8b1a1a" ${HALO}`);
      }
    }
    return `${s}</g></svg>`;
  }

  // ---------- índices: tornado o barras de criticidad ----------

  function indices(o) {
    const rows = o.rows || [];
    if (!rows.length) fail('no hay actividades');
    const labels = o.labels || {};
    const dec = o.dec;
    const both = rows.some((r) => r.cruc != null);
    const RH = 22; const TOP = 34; const n = rows.length;
    const bottom = TOP + n * RH;
    const H = bottom + 30;
    let s = head(W, H, o.title, o.desc);
    const lab = (v) => (v === 0 ? '0' : v === 1 ? '1' : fmt(v, 1, dec));
    const sides = both
      ? [{ cls: 'crit', zero: W / 2 - 20, dir: -1, room: 270, every: 4, fill: '#e3a64a', key: 'crit', label: labels.crit },
        { cls: 'cruc', zero: W / 2 + 20, dir: 1, room: 270, every: 4, fill: '#7aa6d6', key: 'cruc', label: labels.cruc }]
      : [{ cls: 'crit', zero: 64, dir: 1, room: 546, every: 2, fill: '#e3a64a', key: 'crit', label: labels.crit }];
    const idX = both ? W / 2 : 32;
    for (const sd of sides) {
      const XS = (v) => sd.zero + sd.dir * v * sd.room;
      for (let k = 0; k <= 20; k++) {
        s += vline('gx', XS(k / 20), TOP - 4, bottom, k === 0 ? '#222' : k % 2 ? '#e6e6e6' : '#bdbdbd');
        if (k % sd.every === 0) s += text('tx', XS(k / 20), bottom + 16, lab(k / 20), 'middle');
      }
      if (sd.label != null) s += text('head', sd.zero + sd.dir * 2, TOP - 12, sd.label, sd.dir < 0 ? 'end' : null);
      rows.forEach((r, i) => {
        const v = clamp01(r[sd.key]);
        const len = Math.round(v * sd.room * 10) / 10;
        const x = sd.dir < 0 ? sd.zero - len : sd.zero;
        s += `<rect class="${sd.cls}" x="${f1(x)}" y="${TOP + i * RH + 4}" width="${f1(len)}" height="${RH - 8}" fill="${sd.fill}" stroke="#222" stroke-width="0.5"/>`;
      });
    }
    rows.forEach((r, i) => { s += text('id', idX, TOP + i * RH + RH / 2 + 4, r.id, 'middle'); });
    return `${s}</g></svg>`;
  }

  // ---------- alternativas en texto ----------

  function table(durations, bins) {
    const x = sortedOf(durations);
    const h = histOf(x, bins === undefined ? BINS : bins);
    let cum = 0;
    return h.counts.map((k, i) => {
      cum += k;
      return { from: r2(h.lo + i * h.width), to: r2(h.lo + (i + 1) * h.width), cum: r2(cum / x.length) };
    });
  }

  function indexTable(rows) {
    return rows.map((r) => {
      const out = { id: r.id, crit: r1(clamp01(r.crit)) };
      if (r.cruc != null) out.cruc = r1(clamp01(r.cruc));
      return out;
    });
  }

  function dataUri(svg) {
    const B = root.Buffer;
    if (typeof B === 'function') return `data:image/svg+xml;base64,${B.from(svg, 'utf8').toString('base64')}`;
    const bytes = new root.TextEncoder().encode(svg);
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return `data:image/svg+xml;base64,${root.btoa(bin)}`;
  }

  const api = { BINS, W, TY, hist, dist, indices, table, indexTable, dataUri };
  root.PNL = root.PNL || {};
  root.PNL.chartSvg = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
