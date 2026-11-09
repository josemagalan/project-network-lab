/*
 * core/compare — el comparador de métodos de construcción de la red PERT (spec f2b-metodos-reto, plan §3).
 *
 * run(p, { methods }) construye la red de cada método pedido (en ese orden) con sus cifras, si es correcta
 * y qué ficticias se pueden quitar; la tarjeta del mínimo queda pendiente. combine(comparison, min) añade
 * el resultado de mindummy.solve (que la página calcula después de pintar, plan P3) y corrige V con los
 * métodos: si la búsqueda no es exacta y un método da una red correcta con menos ficticias, V y la mejor
 * red pasan a ser las suyas (criterio 19); si llega a la cota inferior, el mínimo queda demostrado.
 * Sin DOM ni azar.
 */
(function (root) {
  'use strict';

  const isNode = typeof module !== 'undefined' && module.exports;
  const A = isNode ? require('./aoa.js') : root.PNL.aoa;
  const K = isNode ? require('./aoacheck.js') : root.PNL.aoacheck;
  if (isNode) require('./aoamethods.js');

  const METHODS = ['prog', 'rules', 'cs', 'kim', 'spinrad', 'cgl', 'min'];
  const DEFAULT = ['prog', 'rules', 'min'];

  function card(method, net, p) {
    const problems = K.diagnose(net, p).problems.filter((x) => x.code !== 'unnecessaryDummy');
    const c = { method, net, ok: problems.length === 0, problems, dummies: net.dummies.length, events: net.events.length,
      removable: problems.length ? [] : K.removable(net, p).map((r) => r.name), structural: null, pending: false };
    if (net.model) c.model = net.model;
    if (net.approx !== undefined) c.approx = net.approx;
    return c;
  }

  function run(p, opts) {
    const methods = (opts && opts.methods) || DEFAULT;
    for (const m of methods) if (!METHODS.includes(m)) throw new Error(`compare.run: método desconocido «${m}»`);
    const cards = methods.map((m) => (m === 'min'
      ? { method: 'min', net: null, ok: null, problems: [], dummies: null, events: null, removable: [], structural: null, pending: true }
      : card(m, A.build(p, { method: m }), p)));
    return { project: p, cards, min: null };
  }

  function combine(cmp, result) {
    const p = cmp.project;
    let min = { value: result.value, exact: result.exact, lower: result.lower, net: result.net, source: 'search' };
    if (!min.exact) {
      for (const c of cmp.cards) {
        if (c.method === 'min' || !c.ok || c.dummies >= min.value) continue;
        min = { value: c.dummies, exact: false, lower: min.lower, net: c.net, source: c.method };
      }
      if (min.value === min.lower) min.exact = true;
    }
    const cards = cmp.cards.map((c) => {
      const out = c.method === 'min' ? card('min', min.net, p) : Object.assign({}, c);
      out.structural = out.ok ? out.dummies > min.value && out.removable.length === 0 : null;
      return out;
    });
    return { project: p, cards, min };
  }

  const api = { METHODS, DEFAULT, run, combine };
  root.PNL = root.PNL || {};
  root.PNL.compare = api;
  if (isNode) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
