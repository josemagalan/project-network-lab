/*
 * compare-view — vista del comparador de métodos de la red PERT (F2b, T017; tableros 16–18 y 23 de los bocetos).
 * Una tarjeta por método con su red, sus cifras, si es correcta, la distancia al mínimo y las ficticias que se
 * pueden quitar; selección compartida (una actividad se resalta en todas las redes; una ficticia, en la suya,
 * con las precedencias de ROY que representa y, si sobra, por qué), par lado a lado y «Aprende más».
 * No calcula: las tarjetas vienen de core/compare y los textos de narrate (cmpCard, cmpMin, selection).
 * Todo texto entra con textContent (dom.h), nunca HTML.
 *   render(container, ctx): ctx = { cmp, project, lang, nota, numFmt, name, ms, pair, onMethods(ms), onPair(pair),
 *     onLearn(method), onLearnTopic(topic), onStep() (opcional) }. cmp.min es null mientras se calcula el mínimo.
 *   state(): tarjetas visibles, selección y método elegido para el lado a lado, para las pruebas de navegador.
 */
(function (root) {
  'use strict';

  const G = root.PNL;
  let sel = null;          // { m, x }: x es una actividad (se resalta en todas) o una ficticia de la red de m
  let picking = null;      // método elegido para el lado a lado, a la espera del segundo
  let lastKey = null;      // estructura de la tabla: si cambia, la selección ya no vale
  let shown = [];
  let box = null;
  let cur = null;
  const again = () => render(box, cur);

  function render(container, ctx) {
    const { h, clear } = G.dom;
    box = container; cur = ctx;
    const { lang, cmp } = ctx;
    const t = (k, p) => G.i18n.t(lang, k, p);
    const N = G.narrate;
    const key = JSON.stringify(ctx.project.activities.map((a) => [a.id, ctx.project.succs[a.id]]));
    if (key !== lastKey) { sel = null; picking = null; lastKey = key; }
    const METHODS = G.compare.METHODS;
    const byM = new Map(cmp.cards.map((c) => [c.method, c]));
    const pair = ctx.pair && ctx.pair.every((m) => byM.has(m)) ? ctx.pair : null;
    if (pair) picking = null;
    shown = pair || METHODS.filter((m) => ctx.ms.includes(m) && byM.has(m));
    if (sel && !shown.includes(sel.m) && !isAct(ctx, sel.x)) sel = null;

    clear(container);
    // Métodos visibles (al menos uno) y resumen del mínimo.
    const head = h('div', { class: 'cmp-head' });
    if (pair) {
      head.appendChild(h('button', { type: 'button', class: 'ghost', onclick: () => ctx.onPair(null) }, [t('cmp.backAll')]));
    } else {
      head.appendChild(h('div', { class: 'seg cmp-methods', role: 'group', 'aria-label': t('cmp.methods') }, [
        h('span', { class: 'eyebrow' }, [t('cmp.methods')]),
        ...METHODS.map((m) => {
          const on = ctx.ms.includes(m);
          return h('button', { type: 'button', 'aria-pressed': String(on), disabled: on && ctx.ms.length === 1,
            onclick: () => ctx.onMethods(on ? ctx.ms.filter((x) => x !== m) : METHODS.filter((x) => x === m || ctx.ms.includes(x))) },
          [t(`cmp.names.${m}`)]);
        }),
      ]));
    }
    head.appendChild(h('p', { class: 'cmp-min' }, [N.cmpMin(cmp.min, { lang })]));
    container.appendChild(head);
    if (picking) container.appendChild(h('p', { class: 'cmp-hint', role: 'status' }, [t('cmp.pairPick', { name: t(`cmp.names.${picking}`) })]));

    const grid = h('div', { class: `cmp-grid${pair ? ' pair' : ''}` });
    container.appendChild(grid);
    shown.forEach((m, i) => grid.appendChild(card(byM.get(m), i, ctx, t, !!pair)));

    // Selección: debajo de las tarjetas, con su explicación (AC6 y AC7).
    const info = selInfo(ctx, byM);
    if (info) {
      const sb = h('div', { class: 'sel-info', role: 'region', 'aria-label': t('sel.label') }, [
        h('span', { class: 'tag' }, [info.title]),
        h('p', {}, [info.text]),
      ]);
      if (info.learn) sb.appendChild(h('button', { type: 'button', class: 'ghost', onclick: () => ctx.onLearnTopic(info.learn) }, [t('learn.button')]));
      sb.appendChild(h('button', { type: 'button', class: 'ghost', onclick: () => { sel = null; again(); } }, [t('sel.clear')]));
      container.appendChild(sb);
    }
    container.appendChild(h('p', { class: 'muted small' }, [t('cmp.legend')]));
  }

  const isAct = (ctx, x) => ctx.project.activities.some((a) => a.id === x);

  function card(c, i, ctx, t, big) {
    const { h } = G.dom;
    const o = G.narrate.cmpCard(c, ctx.cmp.min, { lang: ctx.lang });
    const id = `pnl-cmp-${c.method}`;
    const art = h('article', { class: `card cmp-card${picking === c.method ? ' picked' : ''}`, 'aria-labelledby': `${id}-h`, 'data-method': c.method });
    art.appendChild(h('div', { class: 'cmp-card-head' }, [
      h('h2', { id: `${id}-h` }, [o.name]),
      h('span', { class: 'cmp-kind' }, [o.kind]),
    ]));
    art.appendChild(h('p', { class: 'cmp-count' }, [h('strong', {}, [o.count]), ' ', h('span', { class: 'muted' }, [o.unit])]));
    art.appendChild(h('ul', { class: 'chips' }, o.status.map((s) => h('li', { class: `chip ${s.tone}` }, [s.text]))));
    const holder = h('div', { class: 'cmp-net scroll-box', tabindex: '0', role: 'region', 'aria-label': o.name });
    art.appendChild(holder);
    for (const s of o.notes) art.appendChild(h('p', { class: `cmp-note ${s.tone}` }, [s.text]));
    const links = h('div', { class: 'row-wrap' }, [
      h('button', { type: 'button', class: 'ghost', onclick: () => ctx.onLearn(c.method) }, [o.links.learn]),
    ]);
    if (o.links.step && ctx.onStep) links.appendChild(h('button', { type: 'button', class: 'ghost', onclick: () => ctx.onStep() }, [o.links.step]));
    if (!big && c.net) {
      const other = picking && picking !== c.method;
      links.appendChild(h('button', { type: 'button', class: 'ghost', 'aria-pressed': other ? null : String(picking === c.method), onclick: () => {
        if (other) { const p = [picking, c.method]; picking = null; ctx.onPair(p); return; }
        picking = picking === c.method ? null : c.method;
        again();
      } }, [t(other ? 'cmp.pairHere' : 'cmp.pair')]));
    }
    art.appendChild(links);
    if (c.net) {
      const ctxN = netCtx(c, ctx, i, o.name);
      const tbl = h('div', { class: 'scroll-box', tabindex: '0', role: 'region', 'aria-label': t('pert.arcsCaption', { name: ctxN.name }) });
      art.appendChild(h('details', { class: 'cmp-table' }, [h('summary', {}, [t('view.asTable')]), tbl]));
      G.pertView.render(holder, ctxN);
      G.pertView.arcTable(tbl, ctxN);
    } else {
      holder.appendChild(h('p', { class: 'muted cmp-wait' }, [t('cmp.pending')]));
    }
    return art;
  }

  function netCtx(c, ctx, i, name) {
    const selected = sel && (isAct(ctx, sel.x) || sel.m === c.method) ? sel.x : null;
    return { net: c.net, lay: G.aoaLayout.layout(c.net), revealed: new Map(), step: null, lang: ctx.lang, nota: ctx.nota,
      numFmt: ctx.numFmt, name: `${ctx.name} · ${name}`, criticalOn: false, numbered: true, fit: true,
      removable: c.removable, selected, idPrefix: `pnl-c${i}`,
      onSelect: (x) => { sel = selected === x ? null : { m: c.method, x }; again(); } };
  }

  function selInfo(ctx, byM) {
    if (!sel) return null;
    const { lang } = ctx;
    const t = (k, p) => G.i18n.t(lang, k, p);
    if (isAct(ctx, sel.x)) {
      const c = byM.get(shown.find((m) => byM.get(m).net)) || null;
      return c ? G.narrate.selection(sel.x, { lang, net: c.net, project: ctx.project, numbered: false }) : null;
    }
    const c = byM.get(sel.m);
    if (!c || !c.net) return null;
    const rm = c.ok ? G.aoacheck.removable(c.net, ctx.project) : [];
    const s = G.narrate.selection(sel.x, { lang, net: c.net, project: ctx.project, numbered: true, removable: rm });
    return s && Object.assign({}, s, { title: t('cmp.selDummy', { x: sel.x, name: t(`cmp.names.${sel.m}`) }) });
  }

  const api = { render, state: () => ({ shown: shown.slice(), sel: sel ? Object.assign({}, sel) : null, picking }) };
  root.PNL = root.PNL || {};
  root.PNL.compareView = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
