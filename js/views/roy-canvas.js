/*
 * roy-canvas — el lienzo de la red ROY del alumno (F3d, T008; plan P2; tableros 81–83 y 89). Con el modelo de uso del
 * reto de ficticias (views/reto-canvas), sin tocarlo: sin arrastrar (WCAG 2.5.7), colocar una actividad es elegir su
 * ficha en «Por colocar» y pulsar un hueco; unir, pulsar el nodo de origen y después el de destino; mover, pulsar el nodo
 * y después el hueco. Con el teclado (2.1.1), Tab recorre fichas, nodos y arcos; N coloca la actividad elegida junto al
 * nodo enfocado; U (o J) empieza y termina un arco en el nodo enfocado; las flechas mueven; Supr borra; Esc cancela.
 * Inicio y Fin están siempre y no se borran.
 * No calcula: las operaciones son las de exBuild.apply (ctx.onOp) y los huecos, exBuild.spot. Todo texto con textContent.
 *   render(container, ctx): ctx = { key, project, net, lang, locked, marks (exBuild.marks), onOp(op) → bool, onRepaint(),
 *     announce(text) }. Con locked, solo el dibujo (sin herramientas ni fichas).
 *   renderStatic(container, { net, lang, name, prefix, marks }): el dibujo sin nada que pulsar (la red correcta).
 *   takeFocus(): el id que debe recibir el foco tras repintar, o null. reset(): olvida la herramienta y lo pendiente.
 *   state(): herramienta, actividad elegida, operación a medias y último aviso, para las pruebas de navegador.
 */
(function (root) {
  'use strict';

  const G = root.PNL;
  const NS = 'http://www.w3.org/2000/svg';
  let tool = 'activity';      // activity | join | move | delete
  let act = null;             // actividad elegida en «Por colocar»
  let pending = null;         // { kind: 'join' | 'move', from }
  let status = null;          // { key, params }
  let focusNext = null;
  let lastKey = null;

  function s(tag, attrs, kids) {
    const el = root.document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs || {})) if (v != null && v !== false) el.setAttribute(k, String(v));
    for (const c of kids || []) if (c != null) el.appendChild(typeof c === 'string' ? root.document.createTextNode(c) : c);
    return el;
  }
  const safe = (id) => id.replace(/[^A-Za-z0-9_]/g, '_');
  const nodeId = (prefix, id) => `${prefix}-n-${safe(id)}`;
  const arcId = (prefix, a) => `${prefix}-a-${safe(a.from)}-${safe(a.to)}`;

  // Tamaño del dibujo: como poco el del lienzo vacío, y siempre con margen tras el último nodo.
  function extent(net) {
    const GEO = G.exBuild.GEO;
    const xs = net.nodes.map((n) => n.x); const ys = net.nodes.map((n) => n.y);
    return { w: Math.max(GEO.w, ...xs.map((x) => x + 70)), h: Math.max(GEO.h, ...ys.map((y) => y + 50)) };
  }

  // Dibuja arcos, arcos que faltan (punteados) y nodos; devuelve los elementos para enganchar lo interactivo.
  function drawNet(svg, net, o) {
    const GEO = G.exBuild.GEO;
    const XB = G.exBuild;
    const t = (k, p) => G.i18n.t(o.lang, k, p);
    const mk = o.marks || { arcs: {}, nodes: {}, ghosts: [] };
    const pos = new Map(net.nodes.map((n) => [n.id, n]));
    const half = (id) => ({ w: ((id === G.roycheck.START || id === G.roycheck.END) ? GEO.termW : GEO.nodeW) / 2, h: GEO.nodeH / 2 });
    svg.appendChild(s('defs', {}, ['mk', 'mk-bad', 'mk-warn'].map((c) => s('marker', { id: `${o.prefix}-${c}`, viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 7, markerHeight: 7, orient: 'auto' },
      [s('path', { d: 'M0 0L10 5L0 10z', class: c })]))));
    // Punto del borde del rectángulo de un nodo en la dirección (dx, dy).
    const edgePt = (c, id, dx, dy, gap) => {
      const hh = half(id); const L = Math.hypot(dx, dy) || 1;
      const k = Math.min(dx ? hh.w / Math.abs(dx) : Infinity, dy ? hh.h / Math.abs(dy) : Infinity);
      return { x: c.x + dx * k + (dx / L) * gap, y: c.y + dy * k + (dy / L) * gap };
    };
    const pairs = new Set(net.arcs.map((a) => `${a.from}>${a.to}`));
    const geom = (from, to) => {
      const a = pos.get(from); const b = pos.get(to);
      const dx = b.x - a.x; const dy = b.y - a.y; const L = Math.hypot(dx, dy) || 1;
      // Si también está el arco al revés, los dos se curvan a un lado para no taparse.
      const off = pairs.has(`${to}>${from}`) ? 16 : 0;
      const c = { x: (a.x + b.x) / 2 - (dy / L) * off * 2, y: (a.y + b.y) / 2 + (dx / L) * off * 2 };
      const p0 = edgePt(a, from, (off ? c.x : b.x) - a.x, (off ? c.y : b.y) - a.y, 1);
      const p1 = edgePt(b, to, (off ? c.x : a.x) - b.x, (off ? c.y : a.y) - b.y, 2);
      const d = off ? `M${p0.x} ${p0.y} Q ${c.x} ${c.y} ${p1.x} ${p1.y}` : `M${p0.x} ${p0.y} L${p1.x} ${p1.y}`;
      const mid = off ? { x: (a.x + b.x) / 2 - (dy / L) * off, y: (a.y + b.y) / 2 + (dx / L) * off } : { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      return { d, mid };
    };
    const badge = (x, y, m) => s('g', { class: `xb-badge ${m.kind}`, transform: `translate(${x},${y})`, 'aria-hidden': 'true' },
      [s('circle', { r: 9 }), s('text', { y: 4 }, [m.n == null ? '!' : String(m.n)])]);
    const out = { arcs: [], nodes: [] };
    const eg = s('g', { class: 'xb-arcs' }); svg.appendChild(eg);
    for (const a of net.arcs) {
      if (!pos.has(a.from) || !pos.has(a.to)) continue;
      const m = mk.arcs[`${a.from}>${a.to}`];
      const { d, mid } = geom(a.from, a.to);
      let aria = t('xb.aria.arc', { from: XB.nameOf(a.from, o.lang), to: XB.nameOf(a.to, o.lang) });
      if (m) aria += `, ${m.kind === 'bad' ? t('xb.aria.issue', { n: m.n }) : t('xb.aria.warn')}`;
      const g = s('g', { class: `xb-arc${m ? ` ${m.kind}` : ''}`, id: arcId(o.prefix, a), 'data-k': `a:${a.from}>${a.to}` }, [
        s('path', { d, class: 'hit' }), s('path', { d, class: 'edge', 'marker-end': `url(#${o.prefix}-${m ? `mk-${m.kind}` : 'mk'})` })]);
      if (o.interactive) { g.setAttribute('tabindex', '0'); g.setAttribute('role', 'button'); g.setAttribute('aria-label', aria); }
      if (m) g.appendChild(badge(mid.x, mid.y - 2, m));
      eg.appendChild(g);
      out.arcs.push({ g, a });
    }
    for (const gh of mk.ghosts || []) {
      if (!pos.has(gh.from) || !pos.has(gh.to)) continue;
      const { d, mid } = geom(gh.from, gh.to);
      eg.appendChild(s('g', { class: `xb-ghost ${gh.kind}`, 'aria-hidden': 'true' }, [s('path', { d, class: 'edge', 'marker-end': `url(#${o.prefix}-mk-${gh.kind})` }), badge(mid.x, mid.y - 2, gh)]));
    }
    const ng = s('g', { class: 'xb-nodes' }); svg.appendChild(ng);
    const L = (xs) => G.i18n.list(o.lang, xs.map((x) => XB.nameOf(x, o.lang)));
    for (const n of net.nodes) {
      const term = n.id === G.roycheck.START || n.id === G.roycheck.END;
      const hh = half(n.id);
      const m = mk.nodes[n.id];
      const picked = o.pending && o.pending.from === n.id;
      const ins = net.arcs.filter((a) => a.to === n.id).map((a) => a.from);
      const outs = net.arcs.filter((a) => a.from === n.id).map((a) => a.to);
      let aria = XB.nameOf(n.id, o.lang);
      const parts = [];
      if (ins.length) parts.push(t('xb.aria.preds', { list: L(ins) }));
      if (outs.length) parts.push(t('xb.aria.succs', { list: L(outs) }));
      if (!parts.length) parts.push(t('xb.aria.none'));
      aria += `, ${parts.join('; ')}`;
      if (m && m.kind === 'bad') aria += `, ${t('xb.aria.issue', { n: m.n || '' }).trim()}`;
      if (picked) aria += `, ${t('xb.aria.picked')}`;
      const g = s('g', { class: `xb-node${term ? ' xb-term' : ''}${picked ? ' picked' : ''}${o.sel === n.id ? ' sel' : ''}${m ? ` ${m.kind}` : ''}`, transform: `translate(${n.x},${n.y})`,
        id: nodeId(o.prefix, n.id), 'data-k': `n:${n.id}` }, [
        s('rect', { x: -hh.w, y: -hh.h, width: hh.w * 2, height: hh.h * 2, rx: 5 }),
        s('text', { y: 5 }, [XB.nameOf(n.id, o.lang)]),
      ]);
      if (o.interactive) { g.setAttribute('tabindex', '0'); g.setAttribute('role', 'button'); g.setAttribute('aria-label', aria); }
      if (m && m.n != null) g.appendChild(badge(hh.w, -hh.h, m));
      ng.appendChild(g);
      out.nodes.push({ g, n });
    }
    return out;
  }

  function svgFor(net, o) {
    const { w, h: hgt } = extent(net);
    const svg = s('svg', { class: `net xb-svg${o.interactive ? '' : ' static'}`, viewBox: `0 0 ${w} ${hgt}`, width: '100%', role: o.interactive ? 'group' : 'img',
      'aria-label': o.name, id: o.svgId || null, tabindex: o.interactive ? '0' : null, 'aria-describedby': o.describedBy || null, preserveAspectRatio: 'xMidYMid meet' });
    svg.style.minWidth = `${Math.round(w * 0.62)}px`;
    if (o.interactive) {
      svg.appendChild(s('defs', {}, [s('pattern', { id: `${o.prefix}-grid`, width: 20, height: 20, patternUnits: 'userSpaceOnUse' }, [s('circle', { cx: 1, cy: 1, r: 1, class: 'xb-dot' })])]));
      svg.appendChild(s('rect', { x: 0, y: 0, width: w, height: hgt, fill: `url(#${o.prefix}-grid)`, class: 'xb-bg' }));
    }
    return svg;
  }

  function renderStatic(container, o) {
    const { h } = G.dom;
    const svg = svgFor(o.net, { name: o.name, prefix: o.prefix, interactive: false });
    drawNet(svg, o.net, { lang: o.lang, prefix: o.prefix, marks: o.marks, interactive: false });
    container.appendChild(h('div', { class: 'xb-canvas-box static', tabindex: '0', role: 'region', 'aria-label': o.name }, [svg]));
  }

  function render(container, ctx) {
    const { h, clear } = G.dom;
    const XB = G.exBuild;
    const { lang, net, project } = ctx;
    const t = (k, p) => G.i18n.t(lang, k, p);
    if (ctx.key !== lastKey) { lastKey = ctx.key; tool = 'activity'; act = null; pending = null; status = null; }
    if (pending && !net.nodes.some((n) => n.id === pending.from)) pending = null;
    clear(container);
    if (ctx.locked) {
      const left = project.activities.map((a) => a.id).filter((id) => !net.nodes.some((n) => n.id === id));
      if (left.length) container.appendChild(h('p', { class: 'small xb-left-out' }, [t('xb.notPlaced', { list: G.i18n.list(lang, left) })]));
      renderStatic(container, { net, lang, name: t('xb.canvasNameLocked'), prefix: 'xb', marks: ctx.marks });
      return;
    }
    const name = (id) => XB.nameOf(id, lang);
    const say = (k, p) => { status = { key: k, params: p }; if (ctx.announce) ctx.announce(t(k, p)); };
    const run = (op) => { if (!ctx.onOp(op)) again(); };
    const unplaced = project.activities.map((a) => a.id).filter((id) => !net.nodes.some((n) => n.id === id));
    if (act && !unplaced.includes(act)) act = null;
    const chosen = () => act || unplaced[0] || null;

    // ---- Herramientas y «Colocar por niveles» ----
    const TOOLS = ['activity', 'join', 'move', 'delete'];
    container.appendChild(h('div', { class: 'xb-tools' }, [
      h('div', { class: 'seg', role: 'group', 'aria-label': t('xb.tools') }, TOOLS.map((x) => h('button', {
        type: 'button', 'aria-pressed': String(tool === x), id: `xb-t-${x}`, 'data-k': `tool:${x}`,
        onclick: () => { tool = x; pending = null; status = null; focusNext = `xb-t-${x}`; again(); },
      }, [t(`xb.tool.${x}`)]))),
      h('span', { class: 'ex-sep', 'aria-hidden': 'true' }),
      h('button', { type: 'button', class: 'ghost', id: 'xbPlace', onclick: () => { pending = null; say('xb.did.place'); focusNext = 'xbPlace'; run({ type: 'place' }); } }, [t('xb.place')]),
      h('p', { class: 'small muted xb-hint' }, [t(`xb.hint.${tool}`)]),
    ]));
    // ---- Fichas «Por colocar» ----
    const chipMarks = (ctx.marks && ctx.marks.chips) || {};
    container.appendChild(h('div', { class: 'xb-chips' }, [h('span', { class: 'small muted' }, [unplaced.length ? t('xb.toPlace') : t('xb.allPlaced')])]
      .concat(unplaced.map((id) => h('button', { type: 'button', class: `xb-chip${chipMarks[id] ? ' bad' : ''}`, id: `xb-c-${id}`, 'aria-pressed': String(chosen() === id && tool === 'activity'),
        'aria-label': t('xb.aria.chip', { x: id }) + (chipMarks[id] ? `, ${t('xb.aria.issue', { n: chipMarks[id].n })}` : ''),
        onclick: () => { act = id; tool = 'activity'; pending = null; say('xb.did.pick', { x: id }); focusNext = `xb-c-${id}`; again(); } },
      [id, chipMarks[id] ? h('span', { class: 'xb-badge bad', 'aria-hidden': 'true' }, [String(chipMarks[id].n)]) : null])))));

    // ---- Lienzo ----
    const svg = svgFor(net, { name: t('xb.canvasName'), prefix: 'xb', interactive: true, svgId: 'xbSvg', describedBy: 'xbKeys' });
    const drawn = drawNet(svg, net, { lang, prefix: 'xb', marks: ctx.marks, interactive: true, pending });
    const point = (ev) => {
      const m = svg.getScreenCTM();
      if (!m) return null;
      const p = svg.createSVGPoint(); p.x = ev.clientX; p.y = ev.clientY;
      const q = p.matrixTransform(m.inverse());
      return { x: XB.snap(q.x), y: XB.snap(q.y) };
    };
    const place = (at) => {
      const id = chosen();
      if (!id) { say('xb.did.none'); again(); return; }
      act = null;
      say('xb.did.add', { x: id }); focusNext = nodeId('xb', id);
      run({ type: 'add', id, x: at.x, y: at.y });
    };
    svg.addEventListener('click', (ev) => {
      const p = point(ev);
      if (!p) return;
      if (pending && pending.kind === 'move') { const id = pending.from; pending = null; say('xb.did.move', { x: name(id) }); focusNext = nodeId('xb', id); run({ type: 'move', id, x: p.x, y: p.y }); return; }
      if (pending) { pending = null; say('xb.did.cancel'); again(); return; }
      if (tool === 'activity') place(p);
    });
    const joinStep = (id) => {
      focusNext = nodeId('xb', id);
      if (!pending || pending.kind !== 'join') { pending = { kind: 'join', from: id }; say('xb.did.pickFrom', { x: name(id) }); again(); return; }
      const from = pending.from; pending = null;
      const bad = XB.joinError(net, from, id);
      if (bad) { say(`xb.bad.${bad}`); again(); return; }
      say('xb.did.join', { from: name(from), to: name(id) });
      run({ type: 'join', from, to: id });
    };
    const remove = (id) => {
      if (id === G.roycheck.START || id === G.roycheck.END) { say('xb.bad.fixed'); focusNext = nodeId('xb', id); again(); return; }
      say('xb.did.remove', { x: id }); focusNext = 'xbSvg';
      run({ type: 'remove', id });
    };
    const click = (id) => {
      if (pending && pending.kind === 'move') { pending = null; say('xb.did.cancel'); focusNext = nodeId('xb', id); again(); return; }
      if (tool === 'activity' || tool === 'join') joinStep(id);
      else if (tool === 'move') { pending = { kind: 'move', from: id }; say('xb.did.pickMove', { x: name(id) }); focusNext = nodeId('xb', id); again(); }
      else if (tool === 'delete') remove(id);
    };
    for (const { g, n } of drawn.nodes) {
      g.addEventListener('click', (ev) => { ev.stopPropagation(); click(n.id); });
      g.addEventListener('keydown', (ev) => {
        const k = ev.key;
        const mv = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[k];
        if (mv) {
          ev.preventDefault();
          const step = XB.GEO.grid * (ev.shiftKey ? 4 : 1);
          const op = { type: 'move', id: n.id, x: n.x + mv[0] * step, y: n.y + mv[1] * step };
          // En el borde no se mueve: no se anuncia «movido» (revisión de T018, I-F8).
          if (XB.apply(net, op, ctx.project) === net) return;
          focusNext = nodeId('xb', n.id); say('xb.did.move', { x: name(n.id) });
          run(op);
        } else if (k === 'Enter' || k === ' ') { ev.preventDefault(); click(n.id); }
        else if (k === 'u' || k === 'U' || k === 'j' || k === 'J') { ev.preventDefault(); ev.stopPropagation(); joinStep(n.id); }
        else if (k === 'n' || k === 'N') { ev.preventDefault(); ev.stopPropagation(); pending = null; place(XB.spot(net, n)); }
        else if (k === 'Delete' || k === 'Backspace') { ev.preventDefault(); remove(n.id); }
      });
    }
    for (const { g, a } of drawn.arcs) {
      const unjoin = () => { say('xb.did.unjoin', { from: name(a.from), to: name(a.to) }); focusNext = nodeId('xb', a.from); run({ type: 'unjoin', from: a.from, to: a.to }); };
      g.addEventListener('click', (ev) => { ev.stopPropagation(); if (tool === 'delete') unjoin(); });
      g.addEventListener('keydown', (ev) => {
        if (ev.key === 'Delete' || ev.key === 'Backspace') { ev.preventDefault(); unjoin(); }
        else if ((ev.key === 'Enter' || ev.key === ' ') && tool === 'delete') { ev.preventDefault(); unjoin(); }
      });
    }
    // Teclas del lienzo: N coloca la actividad elegida en el primer hueco; Esc cancela lo pendiente.
    svg.addEventListener('keydown', (ev) => {
      if (ev.key === 'n' || ev.key === 'N') { ev.preventDefault(); place(XB.spot(net, null)); }
      else if (ev.key === 'Escape' && pending) { ev.preventDefault(); pending = null; say('xb.did.cancel'); again(); }
    });
    container.appendChild(h('div', { class: 'xb-canvas-box' }, [svg]));
    container.appendChild(h('p', { class: 'xb-status small' }, [status ? t(status.key, status.params) : '']));
    container.appendChild(h('p', { class: 'small muted xb-keys', id: 'xbKeys' }, [t('xb.keys')]));

    function again() { if (ctx.onRepaint) ctx.onRepaint(); }
  }

  const api = {
    render, renderStatic, extent,
    reset: () => { tool = 'activity'; act = null; pending = null; status = null; focusNext = null; },
    takeFocus: () => { const k = focusNext; focusNext = null; return k; },
    state: () => ({ tool, act, pending: pending ? Object.assign({}, pending) : null, status: status ? status.key : null }),
  };
  root.PNL = root.PNL || {};
  root.PNL.royCanvas = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
