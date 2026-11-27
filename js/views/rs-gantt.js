/*
 * views/rs-gantt — Gantt con perfiles de la vista de recursos (spec f5c-recursos, AC3, AC6 y AC12; plan §4, P2, P3, P10;
 * tableros 131–134). Arriba, una barra por actividad en el calendario dado (con la ventana [ES, LF] al nivelar y, si se
 * ha movido, dónde estaba); debajo, un perfil por recurso, alineado periodo a periodo, con las actividades apiladas en
 * cada columna, el valor de cada columna, la disponibilidad (con recursos limitados) y, a la derecha, pico, suma de
 * cuadrados y trabajo. Con spec.onMove, cada barra se arrastra con el ratón o se mueve con las flechas.
 * Como views/ct-chart: sin innerHTML (constitución, 22), elementos con createElementNS y colores en clases (css/rs.css),
 * así que valen en claro y oscuro. La alternativa en texto son las tablas de comienzos y del perfil (js/rs.js).
 * spec = { T, Tcpm, unit, emptyText, rows: [{ id, s, d, r: [..], es, lf, crit, chain, moved, label }], res: [{ label, cap, u: [..], stats, statsText: [..] }],
 *          window, caps, sel, label, capText(v), onMove(id, s), onSelect(id), now, nowText }
 * now (T012): el instante del esquema paralelo en el paso a paso, una línea vertical con nowText encima.
 */
(function (root) {
  'use strict';

  const NS = 'http://www.w3.org/2000/svg';
  const LEFT = 34; const TOP = 24; const RH = 22; const PH = 92; const GAP = 32; const RIGHT = 150;

  /** Medidas del dibujo (sin DOM, para las pruebas). */
  function geometry(spec) {
    const U = spec.unit || 24;
    const ganttH = TOP + spec.rows.length * RH + 6;
    return { U, ganttH, w: LEFT + spec.T * U + 12 + RIGHT, h: ganttH + spec.res.length * (PH + GAP) + 8 };
  }
  /** El paso de las marcas del eje de tiempos, para que no se pisen. */
  const tickStep = (T, U) => [1, 2, 5, 10, 20, 50, 100].find((k) => k * U >= 22) || 100;

  function render(holder, spec) {
    const doc = root.document;
    while (holder.firstChild) holder.removeChild(holder.firstChild);
    const el = (tag, attrs, text) => {
      const e = doc.createElementNS(NS, tag);
      for (const [k, v] of Object.entries(attrs)) if (v != null) e.setAttribute(k, String(v));
      if (text != null) e.textContent = text;
      return e;
    };
    const { U, ganttH, w, h } = geometry(spec);
    const svg = el('svg', { class: 'rsg', viewBox: `0 0 ${w} ${h}`, width: w, height: h, role: 'group', 'aria-label': spec.label });
    const X = (t) => LEFT + t * U;
    // Eje de tiempos y rejilla.
    const k = tickStep(spec.T, U);
    const grid = el('g', { 'aria-hidden': 'true' });
    for (let t = 0; t <= spec.T; t += k) {
      grid.appendChild(el('line', { class: 'rsg-grid', x1: X(t), y1: TOP - 6, x2: X(t), y2: h - 8 }));
      grid.appendChild(el('text', { class: 'rsg-tick', x: X(t), y: TOP - 10, 'text-anchor': 'middle' }, String(t)));
    }
    if (spec.Tcpm != null) {
      grid.appendChild(el('line', { class: 'rsg-end', x1: X(spec.Tcpm), y1: TOP - 6, x2: X(spec.Tcpm), y2: ganttH }));
      grid.appendChild(el('text', { class: 'rsg-tick', x: X(spec.Tcpm) + 4, y: TOP + 4 }, `T = ${spec.Tcpm}`));
    }
    if (spec.now != null) {
      grid.appendChild(el('line', { class: 'rsg-now', x1: X(spec.now), y1: TOP - 6, x2: X(spec.now), y2: h - 8 }));
      grid.appendChild(el('text', { class: 'rsg-nowtext', x: X(spec.now) + 4, y: ganttH + 12 }, spec.nowText || ''));
    }
    svg.appendChild(grid);
    // Barras.
    const bars = el('g', {});
    spec.rows.forEach((r, i) => {
      const y = TOP + i * RH + RH / 2;
      bars.appendChild(el('text', { class: 'rsg-id', x: LEFT - 8, y: y + 4, 'text-anchor': 'end', 'aria-hidden': 'true' }, r.id));
      if (spec.window) bars.appendChild(el('rect', { class: 'rsg-window', x: X(r.es), y: y - 10, width: Math.max(1, (r.lf - r.es) * U), height: 20, rx: 3, 'aria-hidden': 'true' }));
      if (r.moved) bars.appendChild(el('rect', { class: 'rsg-ghost', x: X(r.es), y: y - 7, width: Math.max(2, r.d * U), height: 14, rx: 3, 'aria-hidden': 'true' }));
      if (r.s == null) { if (spec.emptyText) bars.appendChild(el('text', { class: 'rsg-empty', x: LEFT + 6, y: y + 4 }, spec.emptyText)); return; }
      const wd = Math.max(r.d ? 2 : 0, r.d * U);
      const g = el('g', { class: `rsg-bar${r.chain ? ' chain' : r.crit ? ' crit' : ''}${spec.sel === r.id ? ' sel' : ''}${spec.onMove ? ' movable' : ''}`, 'data-act': r.id, id: spec.onMove ? `rsBar-${r.id}` : null });
      g.appendChild(el('rect', { class: 'rsg-box', x: X(r.s), y: y - 7, width: wd, height: 14, rx: 3 }));
      if (r.d === 0) g.appendChild(el('path', { class: 'rsg-box', d: `M${X(r.s)} ${y - 7}l6 7l-6 7l-6 -7z` }));
      if (wd >= 18) g.appendChild(el('text', { class: 'rsg-use', x: X(r.s) + wd / 2, y: y + 4, 'text-anchor': 'middle', 'aria-hidden': 'true' }, r.r.join(' · ')));
      if (r.moved) g.appendChild(el('text', { class: 'rsg-shift', x: X(r.s) + wd + 4, y: y + 4, 'aria-hidden': 'true' }, `${r.s - r.es > 0 ? '+' : ''}${r.s - r.es}`));
      g.appendChild(el('title', {}, r.label));
      if (spec.onMove) {
        g.setAttribute('tabindex', '0');
        g.setAttribute('role', 'button');
        g.setAttribute('aria-label', r.label);
        g.setAttribute('aria-keyshortcuts', 'ArrowLeft ArrowRight');
        g.addEventListener('keydown', (e) => {
          if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); spec.onMove(r.id, r.s + (e.key === 'ArrowLeft' ? -1 : 1)); }
          else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (spec.onSelect) spec.onSelect(r.id); }
        });
        // Arrastrar: el desplazamiento en periodos enteros se aplica al soltar.
        g.addEventListener('pointerdown', (e) => {
          e.preventDefault();
          const box = svg.getBoundingClientRect();
          const scale = box.width / w;
          const x0 = e.clientX; let dt = 0;
          const rect = g.querySelector('.rsg-box');
          const move = (ev) => { dt = Math.round((ev.clientX - x0) / scale / U); rect.setAttribute('x', String(X(r.s + dt))); };
          const up = () => {
            root.removeEventListener('pointermove', move); root.removeEventListener('pointerup', up);
            if (dt) spec.onMove(r.id, r.s + dt); else if (spec.onSelect) spec.onSelect(r.id);
          };
          root.addEventListener('pointermove', move); root.addEventListener('pointerup', up);
        });
      }
      bars.appendChild(g);
    });
    svg.appendChild(bars);
    // Perfiles.
    spec.res.forEach((res, j) => {
      const y0 = ganttH + GAP + j * (PH + GAP);
      const base = y0 + PH;
      const g = el('g', { class: 'rsg-prof', role: 'img', 'aria-label': res.aria });
      const top = Math.max(1, ...res.u, spec.caps && res.cap != null ? res.cap : 0);
      const sc = (PH - 16) / top;
      g.appendChild(el('text', { class: 'rsg-res', x: LEFT, y: y0 - 9 }, res.label));
      g.appendChild(el('line', { class: 'rsg-base', x1: LEFT, y1: base, x2: X(spec.T), y2: base }));
      for (let q = 0; q < spec.T; q++) {
        const over = spec.caps && res.cap != null && res.u[q] > res.cap;
        let h0 = 0;
        for (const r of spec.rows) {
          if (r.s == null || !(r.s <= q && q < r.s + r.d) || !r.r[j]) continue;
          const hh = r.r[j] * sc; const yy = base - h0 - hh;
          g.appendChild(el('rect', { class: `rsg-seg${over ? ' over' : r.chain ? ' chain' : ''}`, x: X(q) + 1, y: yy.toFixed(1), width: U - 2, height: hh.toFixed(1) }));
          if (hh >= 12 && U >= 14) g.appendChild(el('text', { class: 'rsg-segid', x: X(q) + U / 2, y: (yy + hh / 2 + 3.5).toFixed(1), 'text-anchor': 'middle' }, r.id));
          h0 += hh;
        }
        if (res.u[q]) g.appendChild(el('text', { class: `rsg-val${over ? ' over' : ''}`, x: X(q) + U / 2, y: (base - h0 - 3).toFixed(1), 'text-anchor': 'middle' }, String(res.u[q])));
      }
      if (spec.caps && res.cap != null) {
        g.appendChild(el('line', { class: 'rsg-cap', x1: LEFT, y1: (base - res.cap * sc).toFixed(1), x2: X(spec.T), y2: (base - res.cap * sc).toFixed(1) }));
        g.appendChild(el('text', { class: 'rsg-captext', x: X(spec.T) + 6, y: (base - res.cap * sc + 4).toFixed(1) }, spec.capText(res.cap)));
      }
      res.statsText.forEach((t, i) => g.appendChild(el('text', { class: `rsg-stat${i ? '' : ' peak'}`, x: X(spec.T) + 12, y: base - 36 + i * 16 }, t)));
      svg.appendChild(g);
    });
    holder.appendChild(svg);
  }

  const api = { render, geometry };
  root.PNL = root.PNL || {};
  root.PNL.rsGantt = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
