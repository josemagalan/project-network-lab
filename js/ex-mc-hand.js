/*
 * ex-mc-hand — «Discretas a mano» y «Réplicas a mano» de «Montecarlo» en «Ejercicios» (spec f3e-probabilidad-montecarlo,
 * AC7, AC8 y AC10; plan §0 «Montecarlo»; tableros 97 y 98). Grupo mxh, solo con mv=disc o mv=rep: «Leer una simulación»
 * no lo carga. ex-mc pone el ejercicio, lo escrito, la corrección y el marco (cabecera, nota, leyenda, explicación,
 * botones); aquí, las etiquetas, las explicaciones y el cuerpo de las dos variantes.
 *   disc: los datos (las discretas sombreadas, cada valor con su probabilidad) y una fila por combinación con su T y su p;
 *         E[T], P(T ≤ plazo) y la criticidad de las discretas (con error consecuente: E[T] y P con sus combinaciones; la
 *         criticidad, con sus p, desde T021).
 *   rep:  una fila por réplica con la duración sorteada de cada actividad, que se pulsa para marcarla crítica (botón con
 *         aria-pressed), y su T; las estimaciones k/n (con error consecuente: con sus T y sus marcas).
 */
(function (root) {
  'use strict';

  const isNode = typeof module !== 'undefined' && module.exports;
  const I = isNode ? require('./i18n.js') : root.PNL.i18n;
  if (isNode) require('./i18n-mc.js');
  const tt = (lang, k, p) => I.t(lang, k, p);
  const fmt = (lang, x) => Number(x).toLocaleString(lang === 'es' ? 'es-ES' : 'en-GB', { maximumFractionDigits: 4, useGrouping: false });

  function label(ex, key, lang) {
    let m;
    if (key === 'pT') return tt(lang, 'mx.lab.pT', { T: fmt(lang, ex.deadline) });
    if (key === 'mean') return tt(lang, 'mx.lab.mean');
    if ((m = /^c(\d+)\.(T|p)$/.exec(key))) return tt(lang, m[2] === 'T' ? 'mx.lab.cT' : 'mx.lab.cp', { k: m[1] });
    if ((m = /^r(\d+)\.(T|crit)$/.exec(key))) return tt(lang, m[2] === 'T' ? 'mx.lab.rT' : 'mx.lab.rcrit', { k: m[1] });
    return tt(lang, 'mx.lab.acrit', { a: key.split('.')[0] });
  }

  // ---------- Explicaciones (AC10) ----------

  /** H: los ayudantes de ex-mc (said, generic, frac, fix, solution). */
  function explain(ex, ans, g, key, lang, H) {
    const sol = H.solution(ex);
    const c = g.cells[key];
    const v = H.said(lang, ans[key], c.value);
    const list = (xs) => I.list(lang, xs);
    const p3 = (x) => H.fix(lang, x, 3);
    let m;
    if (ex.kind === 'disc') {
      if ((m = /^c(\d+)\.(T|p)$/.exec(key))) {
        const combo = sol.combos[Number(m[1]) - 1];
        if (m[2] === 'T') return tt(lang, 'mx.explain.discT', { v, vals: list(ex.disc.map((id) => `${id} = ${combo.vals[id]}`)), r: combo.T, crit: list(combo.crit) });
        const rows = ex.rows.filter((r) => r.x);
        return tt(lang, 'mx.explain.discP', { v, prod: rows.map((r) => H.frac(lang, r.p[r.x.indexOf(combo.vals[r.id])])).join(' · '), r: H.frac(lang, combo.p) });
      }
      if (key === 'mean') return H.generic(ex, ans, g, key, lang, tt(lang, 'mx.calc.mean'));
      if (key === 'pT') return H.generic(ex, ans, g, key, lang, tt(lang, 'mx.calc.pT', { T: fmt(lang, ex.deadline) }));
      const id = key.split('.')[0];
      // Con error consecuente (T021, N-F3): la suma de sus p en las combinaciones en que es crítica, si arrastra o si
      // alguna de esas p está mal; si no, cuántas combinaciones y la suma de la solución.
      if (c.status === 'carried' || (c.from && c.from.length)) return H.generic(ex, ans, g, key, lang, tt(lang, 'mx.calc.crit', { a: id }));
      return tt(lang, 'mx.explain.discCrit', { v, a: id, k: sol.combos.filter((x) => x.crit.includes(id)).length, n: sol.combos.length, r: p3(sol.crit[id]) });
    }
    if ((m = /^r(\d+)\.(T|crit)$/.exec(key))) {
      const k = Number(m[1]); const o = sol.reps[k - 1];
      if (m[2] === 'T') return tt(lang, 'mx.explain.repT', { v, k, r: o.T, crit: list(o.crit) });
      const his = new Set(c.value || []); const right = new Set(o.crit);
      const miss = o.crit.filter((x) => !his.has(x)); const extra = (c.value || []).filter((x) => !right.has(x));
      return tt(lang, 'mx.explain.repCrit', { k, r: list(o.crit) })
        + (miss.length ? tt(lang, miss.length > 1 ? 'mx.explain.missN' : 'mx.explain.miss', { x: list(miss) }) : '')
        + (extra.length ? tt(lang, extra.length > 1 ? 'mx.explain.extraN' : 'mx.explain.extra', { x: list(extra) }) : '');
    }
    return H.generic(ex, ans, g, key, lang, `${Math.round((c.expected || 0) * ex.n)}/${ex.n}`);
  }

  // ---------- Vistas ----------

  /** «Discretas a mano» (tablero 97). */
  function disc(c) {
    const { h, t, ex, lg } = c;
    const sol = c.sol();
    const stmt = tt(lg, 'mx.discStmt').split('{T}');
    const dur = (r) => (r.x ? r.x.flatMap((x, i) => [i ? ' · ' : '', c.num(x), ' ', h('span', { class: 'muted' }, [`(${c.frac(r.p[i])})`])]) : [c.num(r.d)]);
    const data = h('table', { class: 'data ex-given mx-dtab' }, [h('caption', { class: 'sr-only' }, [t('mx.discGiven')]),
      h('thead', {}, [h('tr', {}, [h('th', { scope: 'col' }, [t('ex.act')]), h('th', { scope: 'col' }, [t('mx.durP')]), h('th', { scope: 'col' }, [t('ex.preds')])])]),
      h('tbody', {}, ex.rows.map((r) => h('tr', { class: r.x ? 'mx-disc' : null }, [h('th', { scope: 'row' }, [r.id]), h('td', {}, dur(r)), h('td', {}, [r.preds.join(', ') || '—'])])))]);
    const left = h('section', { class: 'card mx-given', id: 'mxData', 'aria-labelledby': 'mxDataHead' }, [h('h2', { id: 'mxDataHead' }, [t('ex.given')]), c.moved(),
      h('p', { class: 'mx-stmt', id: 'mxStmt' }, [stmt[0], h('strong', {}, [c.weeks(ex.deadline)]), stmt[1]]), data]);
    const ids = ex.disc;
    const combos = h('table', { class: 'data ex-ans mx-combos' }, [h('caption', { class: 'sr-only' }, [t('mx.combosCap')]),
      h('thead', {}, [h('tr', {}, [h('th', { scope: 'col' }, ['#'])].concat(ids.map((id) => h('th', { scope: 'col', class: 'd' }, [id])), [h('th', { scope: 'col' }, ['T']), h('th', { scope: 'col' }, ['p'])]))]),
      h('tbody', {}, sol.combos.map((x, i) => h('tr', { class: c.sel() && c.sel().startsWith(`c${i + 1}.`) ? 'sel' : null }, [h('th', { scope: 'row' }, [String(i + 1)])]
        .concat(ids.map((id) => h('td', { class: 'd' }, [c.num(x.vals[id])])), [h('td', {}, [c.cell(`c${i + 1}.T`)]), h('td', {}, [c.cell(`c${i + 1}.p`)])]))))]);
    const right = h('section', { class: 'card ex-answers mx-ans', id: 'mxAnswers', 'aria-label': t('ex.answers') }, [c.head(t('ex.answers')),
      h('div', { class: 'mx-cols' }, [
        h('div', { class: 'mx-c1' }, [h('span', { class: 'mx-gtitle', id: 'mxCombosHead' }, [t('mx.combos', { n: sol.combos.length })]),
          h('div', { class: 'ex-table-box mx-box', tabindex: '0', role: 'region', 'aria-labelledby': 'mxCombosHead' }, [combos])]),
        h('div', { class: 'mx-c2' }, [
          h('div', { class: 'mx-group', role: 'group', 'aria-labelledby': 'mxProjHead' }, [h('span', { class: 'mx-gtitle', id: 'mxProjHead' }, [t('mx.proj')]),
            c.field('mean', 'E[T]'), c.field('pT', `P(T ≤ ${c.num(ex.deadline)})`)]),
          h('div', { class: 'mx-group', role: 'group', 'aria-labelledby': 'mxCritHead' }, [h('span', { class: 'mx-gtitle', id: 'mxCritHead' }, [t('mx.critHead')])]
            .concat(ids.map((id) => c.field(`${id}.crit`, id)))),
          c.locked ? null : h('p', { class: 'muted small' }, [t('mx.discHelp')])]),
        c.side(true)]),
      c.actions()]);
    return h('div', { class: 'ex-grid mx-grid mx-disc-grid' }, [left, right]);
  }

  /** «Réplicas a mano» (tablero 98): las críticas se marcan pulsando la duración. */
  function rep(c) {
    const { h, t, ex, lg, AT } = c;
    const ids = ex.rows.map((r) => r.id);
    const rows = ex.reps.map((d, i) => {
      const k = `r${i + 1}.crit`;
      const on = new Set(c.ans[k] || []);
      const cst = c.st(k);
      return h('tr', { class: c.sel() && c.sel().startsWith(`r${i + 1}.`) ? 'sel' : null }, [h('th', { scope: 'row' }, [String(i + 1)])]
        .concat(ids.map((id, j) => {
          const bid = `mxT-${i + 1}-${id}`;
          return h('td', { class: 'mx-tc' }, [h('button', { type: 'button', class: 'mx-tog', id: bid, 'aria-pressed': String(on.has(id)), disabled: c.locked,
            'aria-label': tt(lg, 'mx.toggle', { a: id, k: i + 1, d: d[j] }), 'aria-describedby': cst ? `mxCs-${i + 1}` : null,
            onfocus: () => c.onFocus(k), onclick: () => c.mark(k, id, !on.has(id), bid) }, [String(d[j])])]);
        }), [h('td', {}, [c.cell(`r${i + 1}.T`)]),
          h('td', { class: 'mx-cst' }, cst ? [h('span', { class: `ex-chip st-${cst}`, id: `mxCs-${i + 1}` }, [AT.icon(cst), t(`ex.st.${cst}`)])] : [])]));
    });
    const table = h('table', { class: 'data ex-ans mx-rtab' }, [h('caption', { class: 'sr-only' }, [t('mx.repCap')]),
      h('thead', {}, [h('tr', {}, [h('th', { scope: 'col' }, [t('mx.rep')])].concat(ids.map((id) => h('th', { scope: 'col' }, [id])), [h('th', { scope: 'col' }, ['T']), h('th', { scope: 'col' }, [t('mx.critCol')])]))]),
      h('tbody', {}, rows)]);
    const left = h('section', { class: 'card mx-reps', id: 'mxReps', 'aria-labelledby': 'mxRepsHead' }, [
      h('div', { class: 'mx-top' }, [h('h2', { id: 'mxRepsHead' }, [t('mx.reps', { n: ex.n })]), h('span', { class: 'muted small', id: 'mxDl' }, [t('mx.dl', { T: c.weeks(ex.deadline) })])]),
      c.moved(), c.locked ? null : h('p', { class: 'muted small' }, [t('mx.repHelp')]),
      h('div', { class: 'ex-table-box mx-box', tabindex: '0', role: 'region', 'aria-label': t('mx.repCap') }, [table]),
      h('div', { class: 'mx-group', role: 'group', 'aria-labelledby': 'mxEstHead' }, [h('span', { class: 'mx-gtitle', id: 'mxEstHead' }, [t('mx.est', { n: ex.n })]),
        h('div', { class: 'mx-ests' }, [c.field('pT', `P(T ≤ ${c.num(ex.deadline)})`)].concat(ids.map((id) => c.field(`${id}.crit`, id))))])]);
    const right = h('section', { class: 'card ex-answers mx-ans', id: 'mxAnswers', 'aria-label': t('mx.grading') }, [c.head(t('mx.grading')), c.note(), c.side(), c.actions()]);
    return h('div', { class: 'ex-grid mx-grid mx-rep-grid' }, [left, right]);
  }

  const api = { label, explain, disc, rep };
  root.PNL = root.PNL || {};
  root.PNL.exMcHand = api;
  if (isNode) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
