/*
 * views/pert-view — dibuja la red PERT (actividad en arco) con D3 a partir de views/aoa-layout y de los
 * valores revelados hasta el paso actual. No calcula nada: la red sale de core/aoa y las holguras, de la
 * Solution de ROY (plan F2a §2). Textos con .text(), nunca HTML.
 *   render(el, ctx): la red (desde el paso «colocar»). ctx = { net, lay, step, revealed, solution, lang, nota,
 *     criticalOn, numFmt, name, selected, onSelect, hide, numbered, durations, emph, idPrefix }
 *     emph: ficticias que se destacan (las que aprovechan una precedencia implícita en la red mínima, T021);
 *     idPrefix: prefijo de los marcadores, para dibujar dos redes PERT en la misma página sin repetir id.
 *     F2b (comparador): removable, ficticias que se pueden quitar (en rojo); fit, la red se encoge con su
 *     tarjeta en vez de mantener 560 px de ancho mínimo; visible, si está, el conjunto de arcos y ficticias que se
 *     dibujan (el dibujo progresivo enseña solo lo dibujado hasta el paso, con la colocación de la red final).
 *   predTable(el, ctx): la tabla de precedentes del dibujo progresivo (ctx.project; ctx.act, la actividad del paso).
 *   succTable(el, ctx): la tabla de posteriores de los pasos de construcción, con el papel de cada actividad.
 *   arcTable(el, ctx): la alternativa en texto (un arco por fila), con botones para seleccionar.
 */
(function (root) {
  'use strict';

  const G = root.PNL;
  const GEO = { colGap: 150, rowGap: 112, r: 18, pad: 34, top: 30 };

  const t = (ctx, k, p) => G.i18n.t(ctx.lang, k, p);

  // Clases de cada arco según el paso, el camino crítico y la selección.
  function classes(ctx) {
    const { net, step, solution, revealed, criticalOn, hide, selected } = ctx;
    const cls = new Map();
    const set = (label, c) => cls.set(label, c);
    if (step && step.rule && !hide) for (const d of step.rule.dummies) set(d, 'rule');
    if (step && step.formula && (step.kind === 'eventForward' || step.kind === 'eventBackward')) {
      const chosen = new Set(hide ? [] : step.formula.chosen);
      for (const term of step.formula.terms) set(term.via, chosen.has(term.via) ? 'chosen' : 'compared');
    }
    if (criticalOn && solution) {
      const slack = (n) => (revealed.has(`${n}.TE`) && revealed.has(`${n}.TL`) ? revealed.get(`${n}.TL`) - revealed.get(`${n}.TE`) : null);
      for (const e of net.arcs) if (!cls.has(e.act) && Math.abs(solution.floats[e.act].TF) < 1e-9) set(e.act, 'crit');
      for (const d of net.dummies) {
        if (cls.has(d.name)) continue;
        const te = (n) => revealed.get(`${n}.TE`);
        if (slack(d.from) === 0 && slack(d.to) === 0 && Math.abs(te(d.from) - te(d.to)) < 1e-9) set(d.name, 'crit');
      }
    }
    if (ctx.emph) for (const label of ctx.emph) set(label, 'rule');
    if (ctx.removable) for (const label of ctx.removable) set(label, 'rm');
    if (selected) set(selected, 'sel');
    return cls;
  }

  function render(container, ctx) {
    const d3 = root.d3;
    const { net, lay, revealed, numFmt, onSelect } = ctx;
    // F3a («Ejercicios»): ctx.geo estrecha los huecos y ctx.minWidth fija el ancho mínimo con ctx.fit.
    const GG = Object.assign({}, GEO, ctx.geo || {});
    const N = G.i18n.eventNotation(ctx.nota);
    const rows = [...Object.values(lay.pos), ...Object.values(lay.bends).flat()].map((p) => p.row);
    const minRow = Math.min(...rows); const maxRow = Math.max(...rows);
    const X = (col) => GG.pad + col * GG.colGap;
    const Y = (row) => GG.pad + GG.top + (row - minRow) * GG.rowGap;
    const width = GG.pad * 2 + (lay.cols - 1) * GG.colGap;
    const height = GG.pad * 2 + GG.top + (maxRow - minRow) * GG.rowGap;
    const at = (n) => ({ x: X(lay.pos[n].col), y: Y(lay.pos[n].row) });
    const cls = classes(ctx);
    const dur = ctx.durations || {};

    const sel = d3.select(container);
    sel.selectAll('*').remove();
    const svg = sel.append('svg').attr('class', 'net pert').attr('width', '100%')
      .attr('style', ctx.fit ? `max-width:${width}px;min-width:${Math.min(width, ctx.minWidth || 0)}px` : `max-width:${width}px;min-width:${Math.min(width, 560)}px`).attr('viewBox', `0 0 ${width} ${height}`)
      .attr('role', 'img').attr('aria-label', G.i18n.t(ctx.lang, 'pert.netLabel', { name: ctx.name, e: net.events.length, n: net.arcs.length, f: net.dummies.length }));
    const defs = svg.append('defs');
    const pre = ctx.idPrefix || 'pnl-pk';
    for (const [id, c] of [[pre, 'mk'], [`${pre}-a`, 'mk-a'], [`${pre}-c`, 'mk-c'], [`${pre}-s`, 'mk-s'], [`${pre}-r`, 'mk-r'], [`${pre}-x`, 'mk-x']]) {
      defs.append('marker').attr('id', id).attr('viewBox', '0 0 10 10').attr('refX', 9).attr('refY', 5)
        .attr('markerWidth', 7).attr('markerHeight', 7).attr('orient', 'auto').append('path').attr('d', 'M0 0L10 5L0 10z').attr('class', c);
    }
    const marker = (c) => ({ chosen: `${pre}-a`, compared: `${pre}-a`, crit: `${pre}-c`, sel: `${pre}-s`, rule: `${pre}-r`, rm: `${pre}-x` }[c] || pre);

    const eg = svg.append('g');
    const lg = svg.append('g');
    const edges = [...net.arcs.map((e) => ({ label: e.act, from: e.from, to: e.to, dummy: false })),
      ...net.dummies.map((d) => ({ label: d.name, from: d.from, to: d.to, dummy: true }))];
    const vis = ctx.visible || null;
    for (const e of edges) {
      if (vis && !vis.has(e.label)) continue;
      const a = at(e.from); const b = at(e.to);
      const pts = [a, ...(lay.bends[e.label] || []).map((p) => ({ x: X(p.col), y: Y(p.row) })), b];
      const curved = lay.curved.includes(e.label);
      // Recorte para que la flecha empiece y acabe en el borde del círculo.
      const clip = (p, q, r) => { const dx = q.x - p.x; const dy = q.y - p.y; const L = Math.hypot(dx, dy) || 1; return { x: p.x + dx * r / L, y: p.y + dy * r / L }; };
      let d; let mid;
      if (curved) {
        const bow = GG.colGap * 0.35;
        const s = clip(a, { x: a.x + bow, y: a.y }, GG.r); const f = clip(b, { x: b.x + bow, y: b.y }, GG.r + 1);
        d = `M${s.x} ${s.y} C ${a.x + bow} ${a.y}, ${b.x + bow} ${b.y}, ${f.x} ${f.y}`;
        mid = { x: a.x + bow * 0.8, y: (a.y + b.y) / 2 };
      } else {
        const s = clip(pts[0], pts[1], GG.r); const f = clip(pts[pts.length - 1], pts[pts.length - 2], GG.r + 1);
        const ps = [s, ...pts.slice(1, -1), f];
        d = `M${ps[0].x} ${ps[0].y}`;
        for (let i = 1; i < ps.length; i++) {
          const p = ps[i - 1]; const q = ps[i];
          d += (p.y === q.y || i === ps.length - 1 && ps.length === 2) ? ` L${q.x} ${q.y}` : ` C ${(p.x + q.x) / 2} ${p.y}, ${(p.x + q.x) / 2} ${q.y}, ${q.x} ${q.y}`;
        }
        const k = Math.floor((ps.length - 1) / 2);
        mid = { x: (ps[k].x + ps[k + 1].x) / 2, y: (ps[k].y + ps[k + 1].y) / 2 };
      }
      const c = cls.get(e.label) || '';
      const path = eg.append('path').attr('d', d).attr('class', `edge${e.dummy ? ' dummy' : ''}${c ? ` ${c}` : ''}`).attr('marker-end', `url(#${marker(c)})`);
      const vertical = !curved && a.x === b.x;
      const txt = e.dummy ? e.label : (dur[e.label] == null ? e.label : `${e.label} = ${numFmt(dur[e.label])}`);
      const label = lg.append('text').attr('class', `elabel${e.dummy ? ' dummy' : ''}${c ? ` ${c}` : ''}`)
        .attr('x', mid.x + (vertical ? 10 : 0)).attr('y', mid.y + (vertical ? 4 : -7)).attr('text-anchor', vertical ? 'start' : 'middle').text(txt);
      if (onSelect) {
        for (const el of [path, label]) el.style('cursor', 'pointer').on('click', () => onSelect(e.label));
      }
    }

    const ng = svg.append('g');
    const active = ctx.step && ctx.step.event;
    const show = (n, f) => (revealed.has(`${n}.${f}`) ? numFmt(revealed.get(`${n}.${f}`)) : '·');
    const touched = vis ? new Set(edges.filter((e) => vis.has(e.label)).flatMap((e) => [e.from, e.to])) : null;
    for (const ev of net.events) {
      if (touched && !touched.has(ev.n)) continue;
      const p = at(ev.n);
      const crit = ctx.criticalOn && revealed.has(`${ev.n}.TE`) && revealed.get(`${ev.n}.TL`) - revealed.get(`${ev.n}.TE`) === 0;
      const g = ng.append('g').attr('class', `ev${ev.n === active ? ' active' : ''}${crit ? ' crit' : ''}`).attr('transform', `translate(${p.x},${p.y})`);
      g.append('circle').attr('r', GG.r);
      g.append('text').attr('class', 'nid').attr('y', 5).text(ctx.numbered ? String(ev.n) : '');
      if (revealed.has(`${ev.n}.TE`) || revealed.has(`${ev.n}.TL`)) {
        const tb = g.append('g').attr('class', 'tbox').attr('transform', `translate(-26,${-GG.r - 24})`);
        tb.append('rect').attr('width', 52).attr('height', 20).attr('rx', 4);
        tb.append('line').attr('x1', 26).attr('x2', 26).attr('y1', 0).attr('y2', 20);
        tb.append('text').attr('x', 13).attr('y', 15).text(show(ev.n, 'TE')).append('title').text(N.TE);
        tb.append('text').attr('class', 'late').attr('x', 39).attr('y', 15).text(show(ev.n, 'TL')).append('title').text(N.TL);
      }
    }
    return { width, height };
  }

  // Esquema de ejemplo de una regla («Aprende más»): learn.schemes, copia de los apuntes del autor. Sin numeración
  // calculada: los números son los de la diapositiva. Los marcadores llevan id propio para no repetir los de la red.
  function scheme(container, sc, lang, key) {
    const d3 = root.d3;
    const R = 15;
    const sel = d3.select(container);
    sel.selectAll('*').remove();
    const svg = sel.append('svg').attr('class', 'net pert scheme').attr('width', '100%').attr('style', `max-width:${sc.w}px`)
      .attr('viewBox', `0 0 ${sc.w} ${sc.h}`).attr('role', 'img').attr('aria-label', G.i18n.t(lang, `learn.schemeAlt.${key}`));
    const defs = svg.append('defs');
    for (const [id, c] of [['pnl-sk', 'mk'], ['pnl-sk-r', 'mk-r']]) {
      defs.append('marker').attr('id', id).attr('viewBox', '0 0 10 10').attr('refX', 9).attr('refY', 5)
        .attr('markerWidth', 7).attr('markerHeight', 7).attr('orient', 'auto').append('path').attr('d', 'M0 0L10 5L0 10z').attr('class', c);
    }
    const pt = (x) => (Array.isArray(x) ? { x: x[0], y: x[1], open: true } : { x: sc.events[x][0], y: sc.events[x][1], open: false });
    const clip = (p, q) => { if (p.open) return p; const dx = q.x - p.x; const dy = q.y - p.y; const L = Math.hypot(dx, dy) || 1; return { x: p.x + dx * (R + 1) / L, y: p.y + dy * (R + 1) / L }; };
    const draw = ([label, from, to], dummy) => {
      const a = pt(from); const b = pt(to);
      const s0 = clip(a, b); const f = clip(b, a);
      svg.append('path').attr('d', `M${s0.x} ${s0.y} L${f.x} ${f.y}`).attr('class', `edge${dummy ? ' dummy rule' : ''}`).attr('marker-end', `url(#${dummy ? 'pnl-sk-r' : 'pnl-sk'})`);
      const vertical = Math.abs(a.x - b.x) < 1;
      const mx = (s0.x + f.x) / 2; const my = (s0.y + f.y) / 2;
      svg.append('text').attr('class', `elabel${dummy ? ' dummy rule' : ''}`).attr('x', mx + (vertical ? 8 : 0)).attr('y', my + (vertical ? 4 : -6))
        .attr('text-anchor', vertical ? 'start' : 'middle').text(label);
    };
    sc.arcs.forEach((e) => draw(e, false));
    sc.dummies.forEach((e) => draw(e, true));
    for (const [n, [x, y]] of Object.entries(sc.events)) {
      const g = svg.append('g').attr('class', 'ev').attr('transform', `translate(${x},${y})`);
      g.append('circle').attr('r', R);
      g.append('text').attr('class', 'nid').attr('y', 5).text(n);
    }
  }

  // Papel de cada actividad en el paso de regla (para marcar la tabla de posteriores).
  function roles(ctx) {
    const { net, step } = ctx;
    const out = new Map();
    if (!step || !step.rule || ctx.hide) return out;
    const endsAt = (n) => net.arcs.filter((e) => e.to === n).map((e) => e.act);
    for (const name of step.rule.dummies) {
      const d = net.dummies.find((x) => x.name === name);
      if (d.rule === 'equal') { for (const a of d.because) out.set(a, 'equal'); continue; }
      if (d.rule === 'shared') { for (const a of endsAt(d.from)) out.set(a, 'share'); continue; }
      for (const a of endsAt(d.from)) if (!out.has(a)) out.set(a, 'sup');
      for (const a of endsAt(d.to)) out.set(a, 'sub');
    }
    return out;
  }

  function succTable(container, ctx) {
    const { h, clear } = G.dom;
    clear(container);
    const role = roles(ctx);
    const label = { sup: 'pert.roleSup', sub: 'pert.roleSub', share: 'pert.roleShare', equal: 'pert.roleEqual' };
    const succ = ctx.succs;
    const ids = Object.keys(succ).sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
    container.appendChild(h('table', { class: 'data succ' }, [
      h('caption', { class: 'sr-only' }, [t(ctx, 'pert.succCaption', { name: ctx.name })]),
      h('thead', {}, [h('tr', {}, [t(ctx, 'pert.colAct'), t(ctx, 'pert.colSucc'), t(ctx, 'pert.colRole')].map((x) => h('th', { scope: 'col' }, [x])))]),
      h('tbody', {}, ids.map((a) => h('tr', { class: role.get(a) || '' }, [
        h('th', { scope: 'row' }, [a]),
        h('td', { class: 'mono' }, [succ[a].length ? `{ ${succ[a].join(', ')} }` : '—']),
        h('td', {}, [role.has(a) ? t(ctx, label[role.get(a)]) : '']),
      ]))),
    ]));
  }

  function arcTable(container, ctx) {
    const { h, clear } = G.dom;
    clear(container);
    const { net, numFmt } = ctx;
    const dur = ctx.durations || {};
    const rows = [...net.arcs.map((e) => ({ label: e.act, from: e.from, to: e.to, d: dur[e.act], why: '' })),
      ...net.dummies.map((d) => ({ label: d.name, from: d.from, to: d.to, d: 0, why: `${t(ctx, `pert.rule.${d.rule}`)}: ${G.i18n.list(ctx.lang, d.because)}`, dummy: true }))]
      .sort((x, y) => x.from - y.from || x.to - y.to);
    container.appendChild(h('table', { class: 'data arcs' }, [
      h('caption', { class: 'sr-only' }, [t(ctx, 'pert.arcsCaption', { name: ctx.name })]),
      h('thead', {}, [h('tr', {}, [t(ctx, 'pert.colArc'), t(ctx, 'pert.colFrom'), t(ctx, 'pert.colTo'), t(ctx, 'pert.colDur'), t(ctx, 'pert.colRule')]
        .map((x) => h('th', { scope: 'col' }, [x])))]),
      h('tbody', {}, rows.map((r) => h('tr', { class: ctx.selected === r.label ? 'sel' : '' }, [
        h('th', { scope: 'row' }, [ctx.onSelect
          ? h('button', { type: 'button', class: 'link', 'aria-pressed': String(ctx.selected === r.label), 'aria-label': t(ctx, 'pert.select', { x: r.label }), onclick: () => ctx.onSelect(r.label) }, [r.dummy ? `${r.label} (${t(ctx, 'pert.dummy')})` : r.label])
          : (r.dummy ? `${r.label} (${t(ctx, 'pert.dummy')})` : r.label)]),
        h('td', {}, [String(r.from)]), h('td', {}, [String(r.to)]),
        h('td', {}, [r.d == null ? '—' : numFmt(r.d)]), h('td', {}, [r.why]),
      ]))),
    ]));
  }

  // Tabla de precedentes del dibujo progresivo: cada actividad con sus precedentes directas.
  function predTable(container, ctx) {
    const { h, clear } = G.dom;
    clear(container);
    const { project } = ctx;
    const byId = (a, b) => a.localeCompare(b, 'en', { numeric: true });
    const preds = (x) => project.activities.filter((a) => (project.succs[a.id] || []).includes(x)).map((a) => a.id).sort(byId);
    container.appendChild(h('table', { class: 'data succ' }, [
      h('caption', { class: 'sr-only' }, [t(ctx, 'pert.predCaption', { name: ctx.name })]),
      h('thead', {}, [h('tr', {}, [t(ctx, 'pert.colAct'), t(ctx, 'pert.colPred')].map((x) => h('th', { scope: 'col' }, [x])))]),
      h('tbody', {}, project.activities.map((a) => a.id).sort(byId).map((x) => h('tr', { class: x === ctx.act ? 'sup' : '' }, [
        h('th', { scope: 'row' }, [x]), h('td', {}, [preds(x).join(', ') || t(ctx, 'pert.none')]),
      ]))),
    ]));
  }

  const api = { render, scheme, succTable, arcTable, predTable, roles, classes, GEO };
  root.PNL = root.PNL || {};
  root.PNL.pertView = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
