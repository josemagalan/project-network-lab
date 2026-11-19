/*
 * ex-mc-read — la vista de «Leer una simulación» de «Montecarlo» en «Ejercicios» (spec f3e-probabilidad-montecarlo, AC6,
 * AC9, AC10 y AC19; plan §0 «Gráficos sin DOM» y P4; tableros 96 y 104). Grupo mxr, con views/chart-svg: solo con «Leer»
 * (las variantes a mano no lo cargan). ex-mc pone el ejercicio, lo escrito, la corrección y el marco; aquí, la simulación
 * (el histograma y la función de distribución como imagen, con su tabla como alternativa en texto, y los datos), el
 * tornado, lo que se lee en los gráficos y las preguntas de interpretación (opción múltiple). Las imágenes van con
 * <img src="data:…"> (nunca innerHTML) y en el móvil a su tamaño, con desplazamiento lateral en su caja.
 */
(function (root) {
  'use strict';

  const X = () => root.PNL.exMc;
  const CS = () => root.PNL.chartSvg;
  let pics = { ex: null };   // las imágenes de la última vista (no se rehacen al repintar)

  function draw(c) {
    const { h, t, ex, lg, AT } = c;
    if (pics.ex !== ex || pics.lang !== lg) {
      const ch = X().charts(ex, lg);
      pics = { ex, lang: lg, ch, dist: CS().dataUri(ch.dist.svg), idx: CS().dataUri(ch.idx.svg) };
    }
    const ch = pics.ch;
    const size = (svg) => { const m = /width="(\d+)" height="(\d+)"/.exec(svg); return { width: m[1], height: m[2] }; };
    const pic = (id, src, o) => h('div', { class: 'mx-chart', id, tabindex: '0', role: 'region', 'aria-label': t('mx.chart.scroll', { c: o.title }) },
      [h('img', Object.assign({ src, alt: `${o.title}. ${o.desc}` }, size(o.svg)))]);
    const f2 = (x) => c.fix(x, 2);
    const cum = h('table', { class: 'data mx-alt' }, [h('caption', {}, [t('mx.cum')]),
      h('thead', {}, [h('tr', {}, [h('th', { scope: 'col' }, [t('mx.upTo')]), h('th', { scope: 'col' }, ['F'])])]),
      h('tbody', {}, ch.table.map((x) => h('tr', {}, [h('td', {}, [f2(x.to)]), h('td', {}, [f2(x.cum)])])))]);
    const itab = h('table', { class: 'data mx-alt' }, [h('caption', {}, [t('mx.idxTab')]),
      h('thead', {}, [h('tr', {}, [h('th', { scope: 'col' }, [t('ex.act')]), h('th', { scope: 'col' }, [t('mx.critS')]), h('th', { scope: 'col' }, [t('mx.crucS')])])]),
      h('tbody', {}, ch.itable.map((x) => h('tr', {}, [h('th', { scope: 'row' }, [x.id]), h('td', {}, [c.fix(x.crit, 1)]), h('td', {}, [c.fix(x.cruc, 1)])])))]);
    const data = h('table', { class: 'data mx-alt' }, [h('caption', { class: 'sr-only' }, [t('mx.dataCap')]),
      h('thead', {}, [h('tr', {}, [h('th', { scope: 'col' }, [t('ex.act')]), ...['a', 'm', 'b'].map((x) => h('th', { scope: 'col' }, [x])), h('th', { scope: 'col' }, [t('ex.preds')])])]),
      h('tbody', {}, ex.tcl.rows.map((x) => h('tr', {}, [h('th', { scope: 'row' }, [x.id]), ...['a', 'm', 'b'].map((k) => h('td', {}, [c.num(x[k])])), h('td', {}, [x.preds.join(', ') || '—'])])))]);
    const left = h('section', { class: 'card mx-sim', id: 'mxSim', 'aria-labelledby': 'mxSimHead' }, [
      h('div', { class: 'mx-top' }, [h('h2', { id: 'mxSimHead' }, [t('mx.sim')]), h('span', { class: 'muted small' }, [t('mx.simSub', { us: ex.sim.us })])]),
      c.moved(),
      pic('mxDist', pics.dist, ch.dist),
      h('div', { class: 'mx-folds' }, [
        c.details('mxAlt', t('mx.asTable'), [h('div', { class: 'mx-alts' }, [h('div', { class: 'mx-altbox', tabindex: '0', role: 'region', 'aria-label': t('mx.cum') }, [cum]), itab])]),
        c.details('mxData', t('mx.data'), [data])])]);
    const p = Math.round(ex.ask.pct * 100);
    const vals = h('div', { class: 'mx-group mx-vals', role: 'group', 'aria-labelledby': 'mxReadHead' }, [h('span', { class: 'mx-gtitle', id: 'mxReadHead' }, [t('mx.readHead')]),
      c.field('pct', t('mx.lab.pct', { p })), c.field('pT', `P(T ≤ ${c.num(ex.ask.deadline)})`), c.field('crit', t('mx.lab.crit', { a: ex.ask.act }))]);
    const side = c.side();
    side.appendChild(h('p', { class: 'muted small', id: 'mxTol' }, [t('mx.tol', { w: f2(c.sol().classW) })]));
    const qs = ex.questions.map((q) => {
      const k = `q.${q.key}`;
      const qq = X().question(ex, q, lg);
      const chosen = c.ans[k] == null ? -1 : Number(c.ans[k]);
      const status = c.st(k);
      const name = `mxQ-${q.key}`;
      return h('fieldset', { class: 'mx-q', 'data-key': k }, [h('legend', {}, [qq.text]),
        h('div', { class: 'mx-opts' }, qq.options.map((o, i) => {
          const on = i === chosen;
          const id = `${name}-${i}`;
          return h('label', { class: `mx-opt${on && status ? ` st-${status}` : ''}`, for: id }, [
            h('input', { type: 'radio', name, id, value: String(i), checked: on, disabled: c.locked, 'aria-describedby': on && status ? `${id}-m` : null,
              onfocus: () => c.onFocus(k), onchange: () => c.choose(k, i, id) }), o, on && status ? AT.mark(status, `${id}-m`, t) : null]);
        }))]);
    });
    const right = h('section', { class: 'card ex-answers mx-ans', id: 'mxAnswers', 'aria-label': t('ex.answers') }, [
      c.head(t('ex.answers')), c.note(),
      h('div', { class: 'mx-rgrid' }, [pic('mxIdx', pics.idx, ch.idx), h('div', { class: 'mx-vcol' }, [vals, side]),
        h('div', { class: 'mx-group mx-qs', role: 'group', 'aria-labelledby': 'mxInterp', tabindex: c.locked ? '0' : null }, [h('span', { class: 'mx-gtitle', id: 'mxInterp' }, [t('mx.interp')])].concat(qs))]),
      c.actions()]);
    return h('div', { class: 'ex-grid mx-grid mx-read' }, [left, right]);
  }

  root.PNL = root.PNL || {};
  root.PNL.exMcRead = { draw };
})(typeof globalThis !== 'undefined' ? globalThis : this);
