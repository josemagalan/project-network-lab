/*
 * reto-canvas — el lienzo del reto de ficticias (F2b, T022; tablero 21 de los bocetos). Otra vista de la misma red
 * del alumno que la tabla de sucesos: lo que se hace en uno se ve al momento en el otro (criterio 9).
 * Sin arrastrar (WCAG 2.5.7): crear un suceso es pulsar un hueco; trazar una actividad o una ficticia, pulsar su
 * suceso de origen y después el de destino; mover, pulsar el suceso y después el hueco. Con el teclado (2.1.1),
 * Tab recorre los sucesos y las flechas; N crea un suceso; A y D empiezan (y terminan) una actividad o una
 * ficticia en el suceso enfocado; las flechas lo mueven; Supr borra; Esc cancela.
 * No calcula: las operaciones son las de js/reto (onOp) y la colocación, reto.place. Todo texto con textContent.
 *   render(container, ctx): ctx = el de reto-table (reto, project, lang, onOp) más removable (ficticias que sobran
 *     tras comprobar, por nombre).
 *   takeFocus(): el elemento que debe recibir el foco tras repintar (un suceso recién creado), o null.
 *   state(): herramienta, actividad elegida y operación a medias, para las pruebas de navegador.
 */
(function (root) {
  'use strict';

  const G = root.PNL;
  const NS = 'http://www.w3.org/2000/svg';
  const R0 = 17;
  let tool = 'activity';      // event | activity | dummy | move | delete
  let act = null;             // actividad que se dibuja
  let pending = null;         // { kind: 'activity' | 'dummy' | 'move', from: id }
  let status = null;          // { key, params }
  let focusNext = null;
  let lastKey = null;

  function s(tag, attrs, kids) {
    const el = root.document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs || {})) if (v != null && v !== false) el.setAttribute(k, String(v));
    for (const c of kids || []) if (c != null) el.appendChild(typeof c === 'string' ? root.document.createTextNode(c) : c);
    return el;
  }

  function render(container, ctx) {
    const { h, clear } = G.dom;
    const R = G.reto;
    const { lang, reto } = ctx;
    const t = (k, p) => G.i18n.t(lang, k, p);
    const net = reto.net;
    const key = JSON.stringify(ctx.project.activities.map((a) => a.id));
    if (key !== lastKey) { lastKey = key; pending = null; status = null; act = null; }
    if (pending && !net.events.some((e) => e.id === pending.from)) pending = null;
    const acts = net.arcs.map((a) => a.act);
    const drawn = (x) => { const a = net.arcs.find((y) => y.act === x); return a.from !== null && a.to !== null; };
    if (!act || !acts.includes(act)) act = acts.find((x) => !drawn(x)) || acts[0];
    const lbl = (id) => R.label(net, id);
    // Cada acción deja su aviso (también para el lector de pantalla, en ctx.live) y, si cambia la red, repinta con onOp.
    const say = (k, p) => { status = { key: k, params: p }; if (ctx.live) ctx.live.textContent = t(k, p); };
    const run = (o) => { if (!o || !ctx.onOp(o)) again(); };
    // Tras trazar una actividad, se elige la siguiente sin dibujar (en orden alfabético, dando la vuelta).
    const nextAct = () => { const i = acts.indexOf(act); return [...acts.slice(i + 1), ...acts.slice(0, i)].find((x) => !drawn(x)) || act; };

    clear(container);
    // ---- Herramientas ----
    const TOOLS = ['event', 'activity', 'dummy', 'move', 'delete'];
    const bar = h('div', { class: 'reto-tools' }, [
      h('div', { class: 'seg', role: 'group', 'aria-label': t('reto.tools') }, TOOLS.map((x) => h('button', {
        type: 'button', 'aria-pressed': String(tool === x), 'data-k': `tool:${x}`,
        onclick: () => { tool = x; pending = null; status = null; focusNext = `tool:${x}`; again(); },
      }, [t(`reto.tool.${x}`)]))),
    ]);
    const selId = 'pnl-rc-act';
    const sel = h('select', { id: selId, 'data-k': 'act', onchange: (e) => { act = e.target.value; again(); } },
      acts.map((x) => h('option', { value: x, selected: x === act }, [drawn(x) ? t('reto.actDrawn', { x }) : x])));
    bar.appendChild(h('p', { class: 'reto-act' }, [h('label', { for: selId }, [t('reto.actPick')]), sel]));
    container.appendChild(bar);
    container.appendChild(h('p', { class: 'small muted reto-hint' }, [t(`reto.hint.${tool}`)]));

    // ---- Lienzo ----
    const places = R.place(net);
    const { w, hgt } = (() => { const e = R.extent(places); return { w: e.w, hgt: e.h }; })();
    const svg = s('svg', { class: 'net reto-svg', viewBox: `0 0 ${w} ${hgt}`, width: '100%', role: 'group', 'aria-label': t('reto.canvas'),
      tabindex: '0', 'data-k': 'svg', 'aria-describedby': 'pnl-rc-keys' });
    svg.appendChild(s('defs', {}, [
      s('marker', { id: 'pnl-rc-mk', viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 7, markerHeight: 7, orient: 'auto' }, [s('path', { d: 'M0 0L10 5L0 10z', class: 'mk' })]),
      s('marker', { id: 'pnl-rc-mx', viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 7, markerHeight: 7, orient: 'auto' }, [s('path', { d: 'M0 0L10 5L0 10z', class: 'mk-x' })]),
      s('pattern', { id: 'pnl-rc-grid', width: R.CANVAS.grid, height: R.CANVAS.grid, patternUnits: 'userSpaceOnUse' }, [s('circle', { cx: 1, cy: 1, r: 1, class: 'reto-dot' })]),
    ]));
    const bg = s('rect', { x: 0, y: 0, width: w, height: hgt, fill: 'url(#pnl-rc-grid)', class: 'reto-bg' });
    svg.appendChild(bg);
    const point = (ev) => {
      const m = svg.getScreenCTM();
      if (!m) return null;
      const p = svg.createSVGPoint(); p.x = ev.clientX; p.y = ev.clientY;
      const q = p.matrixTransform(m.inverse());
      return { x: R.snap(q.x), y: R.snap(q.y) };
    };
    // Pulsar fuera de un suceso o una flecha (también en el margen, fuera de la rejilla dibujada).
    svg.addEventListener('click', (ev) => {
      const p = point(ev);
      if (!p) return;
      if (tool === 'event') { say('reto.did.event', { x: R.label({ events: [{ id: reto.seq, n: null }] }, reto.seq) }); run({ type: 'addEvent', x: p.x, y: p.y }); return; }
      if (pending && pending.kind === 'move') { const id = pending.from; pending = null; say('reto.did.move', { x: lbl(id) }); focusNext = `ev:${id}`; run({ type: 'moveEvent', id, x: p.x, y: p.y }); return; }
      if (pending) { pending = null; say('reto.did.cancel'); again(); }
    });

    // Flechas: actividades y ficticias completas; las que van entre los mismos sucesos se curvan para no taparse.
    const named = R.named(net).dummies;
    const edges = [...net.arcs.map((a) => ({ k: `arc:${a.act}`, label: a.act, from: a.from, to: a.to, dummy: false })),
      ...named.map((d, i) => ({ k: `dm:${i}`, label: d.name, from: d.from, to: d.to, dummy: true, i }))].filter((e) => e.from !== null && e.to !== null);
    const pairCount = new Map(); const pairIdx = new Map();
    for (const e of edges) { const pk = [e.from, e.to].sort().join('-'); pairCount.set(pk, (pairCount.get(pk) || 0) + 1); }
    const rm = new Set(ctx.removable || []);
    const eg = s('g'); svg.appendChild(eg);
    for (const e of edges) {
      const a = places.get(e.from); const b = places.get(e.to);
      const pk = [e.from, e.to].sort().join('-');
      const k = pairIdx.get(pk) || 0; pairIdx.set(pk, k + 1);
      const n = pairCount.get(pk);
      const off = (k - (n - 1) / 2) * 34 * (e.from < e.to ? 1 : -1);
      const dx = b.x - a.x; const dy = b.y - a.y; const L = Math.hypot(dx, dy) || 1;
      const nx = -dy / L; const ny = dx / L;
      const c = { x: (a.x + b.x) / 2 + nx * off * 2, y: (a.y + b.y) / 2 + ny * off * 2 };
      const clip = (p, q, r) => { const ex = q.x - p.x; const ey = q.y - p.y; const l = Math.hypot(ex, ey) || 1; return { x: p.x + ex * r / l, y: p.y + ey * r / l }; };
      const loop = e.from === e.to;
      let d; let mid;
      if (loop) { d = `M${a.x - 8} ${a.y - R0} C ${a.x - 40} ${a.y - 70}, ${a.x + 40} ${a.y - 70}, ${a.x + 8} ${a.y - R0}`; mid = { x: a.x, y: a.y - 58 }; }
      else {
        const p0 = clip(a, off ? c : b, R0); const p1 = clip(b, off ? c : a, R0 + 1);
        d = off ? `M${p0.x} ${p0.y} Q ${c.x} ${c.y} ${p1.x} ${p1.y}` : `M${p0.x} ${p0.y} L${p1.x} ${p1.y}`;
        mid = off ? { x: (a.x + b.x) / 2 + nx * off, y: (a.y + b.y) / 2 + ny * off } : { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      }
      const bad = e.dummy && rm.has(e.label);
      const vertical = Math.abs(dx) < 4;
      const aria = t(e.dummy ? 'reto.ariaDummy' : 'reto.ariaArc', { x: e.label, from: lbl(e.from), to: lbl(e.to) });
      const g = s('g', { class: 'reto-edge', tabindex: '0', role: 'button', 'aria-label': aria, 'data-k': e.k }, [
        s('path', { d, class: 'hit' }),
        s('path', { d, class: `edge${e.dummy ? ' dummy' : ''}${bad ? ' rm' : ''}`, 'marker-end': `url(#${bad ? 'pnl-rc-mx' : 'pnl-rc-mk'})` }),
        s('text', { x: mid.x + (vertical ? 9 : 0), y: mid.y + (vertical ? 4 : -7), 'text-anchor': vertical ? 'start' : 'middle',
          class: `elabel${e.dummy ? ' dummy' : ''}${bad ? ' rm' : ''}` }, [e.label]),
      ]);
      const hit = () => {
        if (tool === 'delete') { say('reto.did.removeEdge', { x: e.label }); focusNext = 'svg'; run(e.dummy ? { type: 'removeDummy', i: e.i } : { type: 'clearArc', act: e.label }); return; }
        if (tool === 'activity' && !e.dummy && e.label !== act) { const from = e.label; const to = act; say('reto.did.reassign', { a: from, b: to }); focusNext = `arc:${to}`; act = from; run({ type: 'reassign', act: from, to }); }
      };
      g.addEventListener('click', (ev) => { ev.stopPropagation(); hit(); });
      g.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); hit(); } else if (ev.key === 'Delete' || ev.key === 'Backspace') { ev.preventDefault(); const was = tool; tool = 'delete'; hit(); tool = was; }
      });
      eg.appendChild(g);
    }

    // Sucesos.
    const ng = s('g'); svg.appendChild(ng);
    const incoming = (id) => [...net.arcs.filter((a) => a.to === id).map((a) => a.act), ...named.filter((d) => d.to === id).map((d) => d.name)];
    const outgoing = (id) => [...net.arcs.filter((a) => a.from === id).map((a) => a.act), ...named.filter((d) => d.from === id).map((d) => d.name)];
    const L = (xs) => G.i18n.list(lang, xs);
    const step = (kind, id) => {
      // Primer toque: el origen; segundo: el destino (y se traza).
      if (!pending || pending.kind !== kind) { pending = { kind, from: id }; say(kind === 'move' ? 'reto.did.pickMove' : 'reto.did.pickFrom', { x: lbl(id) }); focusNext = `ev:${id}`; again(); return; }
      const from = pending.from; pending = null;
      focusNext = `ev:${id}`;
      if (from === id) { say('reto.did.same'); again(); return; }
      if (kind === 'activity') {
        const a = act;
        say('reto.did.arc', { x: a, from: lbl(from), to: lbl(id) });
        act = nextAct();
        run({ type: 'arc', act: a, from, to: id });
      } else {
        say('reto.did.dummy', { x: `F${net.dummies.length + 1}`, from: lbl(from), to: lbl(id) });
        run({ type: 'addDummy', from, to: id });
      }
    };
    const click = (id) => {
      if (pending && pending.kind === 'move') { pending = null; say('reto.did.cancel'); again(); return; }
      if (tool === 'activity' || tool === 'dummy') step(tool, id);
      else if (tool === 'move') step('move', id);
      else if (tool === 'delete') { say('reto.did.removeEvent', { x: lbl(id) }); focusNext = 'svg'; run({ type: 'removeEvent', id }); }
    };
    for (const e of net.events) {
      const p = places.get(e.id);
      const name = lbl(e.id);
      const ins = incoming(e.id); const outs = outgoing(e.id);
      let aria = t('reto.ariaEvent', { x: e.n == null ? t('reto.unnumbered', { x: name }) : name });
      if (ins.length) aria += `, ${t('reto.ariaIn', { list: L(ins) })}`;
      if (outs.length) aria += `, ${t('reto.ariaOut', { list: L(outs) })}`;
      if (pending && pending.from === e.id) aria += `, ${t('reto.ariaPicked')}`;
      const g = s('g', { class: `ev reto-ev${pending && pending.from === e.id ? ' picked' : ''}${e.n == null ? ' nonum' : ''}`, transform: `translate(${p.x},${p.y})`,
        tabindex: '0', role: 'button', 'aria-label': aria, 'data-k': `ev:${e.id}` }, [
        s('circle', { r: R0 }),
        s('text', { class: 'nid', y: 5 }, [name]),
      ]);
      g.addEventListener('click', (ev) => { ev.stopPropagation(); click(e.id); });
      g.addEventListener('keydown', (ev) => {
        const k = ev.key;
        const move = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[k];
        if (move) {
          ev.preventDefault();
          const gs = R.CANVAS.grid * (ev.shiftKey ? 4 : 1);
          focusNext = `ev:${e.id}`; say('reto.did.move', { x: name }); run({ type: 'moveEvent', id: e.id, x: p.x + move[0] * gs, y: p.y + move[1] * gs });
        } else if (k === 'Enter' || k === ' ') { ev.preventDefault(); click(e.id); }
        else if (k === 'a' || k === 'A') { ev.preventDefault(); step('activity', e.id); }
        else if (k === 'd' || k === 'D') { ev.preventDefault(); step('dummy', e.id); }
        else if (k === 'Delete' || k === 'Backspace') { ev.preventDefault(); say('reto.did.removeEvent', { x: name }); focusNext = 'svg'; run({ type: 'removeEvent', id: e.id }); }
      });
      ng.appendChild(g);
    }
    // Teclas del lienzo: N crea un suceso junto al enfocado (o en el primer hueco); Esc cancela.
    svg.addEventListener('keydown', (ev) => {
      if (ev.key === 'n' || ev.key === 'N') {
        ev.preventDefault();
        const k = root.document.activeElement && root.document.activeElement.dataset ? root.document.activeElement.dataset.k : '';
        const near = k && k.startsWith('ev:') ? places.get(Number(k.slice(3))) : null;
        const p = R.spot(places, near);
        const id = reto.seq;
        say('reto.did.event', { x: R.label({ events: [{ id, n: null }] }, id) }); focusNext = `ev:${id}`;
        run({ type: 'addEvent', x: p.x, y: p.y });
      } else if (ev.key === 'Escape' && pending) { ev.preventDefault(); pending = null; say('reto.did.cancel'); again(); }
    });

    if (!net.events.length) svg.appendChild(s('text', { x: w / 2, y: hgt / 2, 'text-anchor': 'middle', class: 'reto-empty' }, [t('reto.canvasEmpty')]));
    const box = h('div', { class: 'reto-canvas-box' });
    box.appendChild(svg);
    container.appendChild(box);
    container.appendChild(h('p', { class: 'reto-status small' }, [status ? t(status.key, status.params) : '']));
    container.appendChild(h('p', { class: 'small muted', id: 'pnl-rc-keys' }, [t('reto.keys')]));

    function again() { if (ctx.onRepaint) ctx.onRepaint(); }
  }

  const api = {
    render,
    takeFocus: () => { const k = focusNext; focusNext = null; return k; },
    state: () => ({ tool, act, pending: pending ? Object.assign({}, pending) : null, status: status ? status.key : null }),
  };
  root.PNL = root.PNL || {};
  root.PNL.retoCanvas = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
