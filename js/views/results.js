/*
 * views/results — tabla de tiempos y las cuatro holguras con lo revelado hasta el paso (es también la
 * alternativa en texto de la red, spec AC14) y lista de caminos cuando ya se ha visto el camino crítico.
 */
(function (root) {
  'use strict';

  const G = root.PNL;
  const FIELDS = ['ES', 'EF', 'LS', 'LF', 'TF', 'FF', 'IF', 'SF'];

  function table(container, ctx) {
    const { h, clear } = G.dom;
    const { project, solution, revealed, lang, nota, criticalOn, numFmt } = ctx;
    const N = G.i18n.notation(nota);
    const t = (k, p) => G.i18n.t(lang, k, p);
    const crit = new Set(criticalOn ? solution.critical : []);
    const dur = Object.fromEntries(project.activities.map((a) => [a.id, a.d]));
    const rows = solution.order.map((id) => h('tr', { class: crit.has(id) ? 'crit' : '' }, [
      h('th', { scope: 'row' }, [id, crit.has(id) ? h('span', { class: 'sr-only' }, [` (${t('legend.critical')})`]) : null]),
      h('td', {}, [numFmt(dur[id])]),
      ...FIELDS.map((f) => h('td', {}, [revealed.has(`${id}.${f}`) ? numFmt(revealed.get(`${id}.${f}`)) : '·'])),
    ]));
    clear(container).appendChild(h('table', { class: 'data' }, [
      h('caption', { class: 'sr-only' }, [t('a11y.tableCaption', { name: ctx.name })]),
      h('thead', {}, [h('tr', {}, [h('th', { scope: 'col' }, [t('results.act')]), h('th', { scope: 'col' }, ['d']),
        ...FIELDS.map((f) => h('th', { scope: 'col' }, [N[f]]))])]),
      h('tbody', {}, rows),
    ]));
  }

  function paths(container, ctx) {
    const { h, clear } = G.dom;
    const { solution, lang, unit, numFmt } = ctx;
    const t = (k, p) => G.i18n.t(lang, k, p);
    const cps = solution.criticalPaths;
    const shown = cps.slice(0, G.narrate.SHOWN_PATHS);
    const out = [h('p', { class: 'eyebrow' }, [t(solution.criticalCount > 1 ? 'results.criticalPaths' : 'results.criticalPath', { d: numFmt(solution.duration), unit })]),
      ...shown.map((cp) => h('p', { class: 'crit-path' }, [cp.acts.join(' → ')]))];
    if (solution.criticalCount > shown.length) out.push(h('p', { class: 'crit-more small' }, [t('results.criticalMore', { n: solution.criticalCount - shown.length })]));
    if (solution.paths.list) {
      out.push(h('p', { class: 'muted small' }, [t('results.paths', { n: solution.paths.count })]));
      out.push(h('div', { class: 'paths' }, solution.paths.list.flatMap((p) => [
        h('span', { class: p.critical ? 'crit' : '' }, [p.acts.join(' ')]), h('span', { class: p.critical ? 'crit' : '' }, [`${numFmt(p.length)} ${unit}`])])));
    } else {
      out.push(h('p', { class: 'muted small' }, [t('results.pathsMany', { n: solution.paths.count })]));
    }
    clear(container);
    out.forEach((el) => container.appendChild(el));
  }

  const api = { table, paths, FIELDS };
  root.PNL = root.PNL || {};
  root.PNL.results = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
