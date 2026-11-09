/*
 * reto — el modelo de la red del alumno en el reto de ficticias (spec f2b-metodos-reto, criterios 9–12 y 14;
 * plan §3). Parte sin DOM de js/reto: la tabla de sucesos y el lienzo (T021, T022) son dos vistas de este estado.
 *
 * Estado: { net: StudentNet, seq, result }.
 *   StudentNet = { events: [{ id, n, x?, y? }], arcs: [{ act, from, to }], dummies: [{ from, to }] }, la misma
 *   forma que urlstate guarda en sn y sp. Los extremos son ids de suceso o null (a medias). Hay un arco por
 *   actividad de la tabla, en orden alfabético. Un suceso sin posición lo coloca la vista.
 *   seq: el siguiente id de suceso (los ids no se reutilizan dentro de una sesión del reto).
 *   result: el último diagnóstico, o null. Solo check lo da; cualquier edición válida lo borra (criterio 12).
 * apply(state, op) no cambia el estado de partida. Una operación desconocida o con datos que no existen
 * devuelve el mismo estado.
 * check(state, p, min) juzga la red con aoacheck (solo precedencias y ficticias, spec §Behaviour) y, si es
 * correcta, la compara con el mínimo (el combinado del comparador o el de mindummy.solve; null si aún no está).
 */
(function (root) {
  'use strict';

  const isNode = typeof module !== 'undefined' && module.exports;
  const K = isNode ? require('./core/aoacheck.js') : root.PNL.aoacheck;

  // Los mismos límites que la URL (urlstate: ids y números de hasta tres cifras, 100 sucesos, posiciones de hasta cuatro).
  const LIMIT = { events: 100, dummies: 100, id: 999, n: 999, pos: 9999 };

  const acts = (p) => p.activities.map((a) => a.id).sort();
  const START = [0, 1];

  function start(p) {
    return {
      net: { events: START.map((id) => ({ id, n: null })), arcs: acts(p).map((act) => ({ act, from: null, to: null })), dummies: [] },
      seq: START.length,
      result: null,
    };
  }

  const pos = (v) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(LIMIT.pos, Math.max(0, Math.round(v))) : null);
  const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

  // Orden topológico de los sucesos por arcos y ficticias completos; en un empate, el de más a la izquierda
  // (luego el de más arriba y luego el primero creado). null si hay un ciclo.
  function topoOrder(net) {
    const idx = new Map(net.events.map((e, i) => [e.id, i]));
    const out = new Map(net.events.map((e) => [e.id, []]));
    const deg = new Map(net.events.map((e) => [e.id, 0]));
    for (const e of [...net.arcs, ...net.dummies]) {
      if (e.from === null || e.to === null) continue;
      out.get(e.from).push(e.to); deg.set(e.to, deg.get(e.to) + 1);
    }
    const key = (id) => { const e = net.events[idx.get(id)]; return [e.x === undefined ? 0 : e.x, e.y === undefined ? 0 : e.y, idx.get(id)]; };
    const before = (a, b) => { const ka = key(a); const kb = key(b); for (let i = 0; i < 3; i++) if (ka[i] !== kb[i]) return ka[i] < kb[i]; return false; };
    const ready = net.events.filter((e) => deg.get(e.id) === 0).map((e) => e.id);
    const order = [];
    while (ready.length) {
      let best = 0;
      for (let i = 1; i < ready.length; i++) if (before(ready[i], ready[best])) best = i;
      const u = ready.splice(best, 1)[0];
      order.push(u);
      for (const v of out.get(u)) { deg.set(v, deg.get(v) - 1); if (deg.get(v) === 0) ready.push(v); }
    }
    return order.length === net.events.length ? order : null;
  }

  // La red nueva tras la operación, o null si la operación no vale (no cambia nada).
  function edit(net, seq, op) {
    const ev = (id) => net.events.find((e) => e.id === id);
    const end = (v) => v === null || (v !== undefined && !!ev(v));
    const ends = (o) => (!has(o, 'from') || end(o.from)) && (!has(o, 'to') || end(o.to)) && (has(o, 'from') || has(o, 'to'));
    const set = (x, o) => Object.assign({}, x, has(o, 'from') ? { from: o.from } : {}, has(o, 'to') ? { to: o.to } : {});
    const arc = (act) => net.arcs.find((a) => a.act === act);
    const with_ = (part) => Object.assign({}, net, part);
    switch (op && op.type) {
      case 'addEvent': {
        const x = pos(op.x); const y = pos(op.y);
        if (x === null || y === null || net.events.length >= LIMIT.events || seq > LIMIT.id) return null;
        return { net: with_({ events: [...net.events, { id: seq, n: null, x, y }] }), seq: seq + 1 };
      }
      case 'moveEvent': {
        const x = pos(op.x); const y = pos(op.y);
        if (!ev(op.id) || x === null || y === null) return null;
        return { net: with_({ events: net.events.map((e) => (e.id === op.id ? Object.assign({}, e, { x, y }) : e)) }) };
      }
      case 'removeEvent': {
        if (!ev(op.id)) return null;
        const cut = (x) => Object.assign({}, x, { from: x.from === op.id ? null : x.from, to: x.to === op.id ? null : x.to });
        return { net: { events: net.events.filter((e) => e.id !== op.id), arcs: net.arcs.map(cut), dummies: net.dummies.map(cut) } };
      }
      case 'arc':
        if (!arc(op.act) || !ends(op)) return null;
        return { net: with_({ arcs: net.arcs.map((a) => (a.act === op.act ? set(a, op) : a)) }) };
      case 'clearArc':
        if (!arc(op.act)) return null;
        return { net: with_({ arcs: net.arcs.map((a) => (a.act === op.act ? { act: a.act, from: null, to: null } : a)) }) };
      case 'reassign': {
        // El arco de act pasa a ser de to, y el de to (quizá vacío) pasa a act.
        const a = arc(op.act); const b = arc(op.to);
        if (!a || !b || a === b) return null;
        return { net: with_({ arcs: net.arcs.map((x) => (x === a ? { act: a.act, from: b.from, to: b.to } : x === b ? { act: b.act, from: a.from, to: a.to } : x)) }) };
      }
      case 'addDummy': {
        const d = { from: has(op, 'from') ? op.from : null, to: has(op, 'to') ? op.to : null };
        if (!end(d.from) || !end(d.to) || net.dummies.length >= LIMIT.dummies) return null;
        return { net: with_({ dummies: [...net.dummies, d] }) };
      }
      case 'dummy':
        if (!net.dummies[op.i] || !ends(op)) return null;
        return { net: with_({ dummies: net.dummies.map((d, i) => (i === op.i ? set(d, op) : d)) }) };
      case 'removeDummy':
        if (!net.dummies[op.i]) return null;
        return { net: with_({ dummies: net.dummies.filter((d, i) => i !== op.i) }) };
      case 'number':
        if (!ev(op.id) || !(op.n === null || (Number.isInteger(op.n) && op.n >= 1 && op.n <= LIMIT.n))) return null;
        return { net: with_({ events: net.events.map((e) => (e.id === op.id ? Object.assign({}, e, { n: op.n }) : e)) }) };
      case 'autoNumber': {
        const order = topoOrder(net);
        if (!order) return null;
        const n = new Map(order.map((id, i) => [id, i + 1]));
        return { net: with_({ events: net.events.map((e) => Object.assign({}, e, { n: n.get(e.id) })) }) };
      }
      default:
        return null;
    }
  }

  function apply(state, op) {
    const r = edit(state.net, state.seq, op);
    if (!r) return state;
    return { net: r.net, seq: r.seq === undefined ? state.seq : r.seq, result: null };
  }

  // La red con las ficticias nombradas F1, F2… en su orden (para el diagnóstico y la vista).
  function named(net) {
    return { events: net.events, arcs: net.arcs, dummies: net.dummies.map((d, i) => Object.assign({}, d, { name: `F${i + 1}` })) };
  }

  function check(state, p, min) {
    const { problems } = K.diagnose(named(state.net), p);
    const correct = problems.every((x) => x.code === 'unnecessaryDummy');
    const dummies = state.net.dummies.length;
    const removable = correct ? problems.filter((x) => x.code === 'unnecessaryDummy').map((x) => ({ name: x.ids[0], how: x.how })) : [];
    let m = min ? { value: min.value, lower: min.lower, exact: !!min.exact } : null;
    // Una red correcta con menos ficticias que la mejor conocida (búsqueda no exacta) la mejora: V ≤ sus ficticias.
    if (m && correct && dummies < m.value) m = { value: dummies, lower: m.lower, exact: dummies === m.lower };
    const extra = m && correct ? dummies - m.value : null;
    const structural = extra === null ? null : extra > 0 && removable.length === 0;
    return { net: state.net, seq: state.seq, result: { correct, problems, dummies, min: m, extra, removable, structural } };
  }

  // La red de la URL (urlstate.decode da sn), ajustada a la tabla: un arco por actividad en orden alfabético
  // (los que faltan, vacíos; los que sobran o se repiten, fuera) y extremos que no existen, vacíos.
  function fromUrl(p, sn) {
    if (!sn) return start(p);
    const events = sn.events.map((e) => Object.assign({}, e));
    const ids = new Set(events.map((e) => e.id));
    const ok = (v) => (v !== null && v !== undefined && ids.has(v) ? v : null);
    const arcs = acts(p).map((act) => { const a = sn.arcs.find((x) => x.act === act); return { act, from: a ? ok(a.from) : null, to: a ? ok(a.to) : null }; });
    const dummies = sn.dummies.map((d) => ({ from: ok(d.from), to: ok(d.to) }));
    const seq = events.reduce((m, e) => Math.max(m, e.id + 1), START.length);
    return { net: { events, arcs, dummies }, seq, result: null };
  }

  const api = { start, apply, check, named, fromUrl, LIMIT };
  root.PNL = root.PNL || {};
  root.PNL.reto = api;
  if (isNode) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
