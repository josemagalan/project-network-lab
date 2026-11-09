/*
 * reto — el modelo de la red del alumno en el reto de ficticias (spec f2b-metodos-reto, criterios 9–12 y 14;
 * plan §3). Parte sin DOM de js/reto: la tabla de sucesos y el lienzo (T021, T022) son dos vistas de este estado.
 *
 * Estado: { net: StudentNet, seq, result }.
 *   StudentNet = { events: [{ id, n, x?, y? }], arcs: [{ act, from, to }], dummies: [{ from, to }] }, la misma
 *   forma que urlstate guarda en sn y sp. Los extremos son ids de suceso o null (a medias). Hay un arco por
 *   actividad de la tabla, en orden alfabético. El reto empieza sin sucesos (decisión del autor, T021).
 *   En la tabla de sucesos el alumno escribe números (endNumber): un número que no existe crea el suceso, sin
 *   posición (la vista lo coloca). Un suceso sin posición existe mientras tenga alguna flecha: si se queda sin
 *   ninguna, desaparece. Los que se crean en el lienzo (addEvent) tienen posición y siguen hasta que se borran.
 *   Un suceso sin número se nombra con letras (a, b…, según su id): label.
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
  const A = isNode ? require('./core/aoa.js') : root.PNL.aoa;

  // Los mismos límites que la URL (urlstate: ids y números de hasta tres cifras, 100 sucesos, posiciones de hasta cuatro).
  const LIMIT = { events: 100, dummies: 100, id: 999, n: 999, pos: 9999 };

  const acts = (p) => p.activities.map((a) => a.id).sort();

  function start(p) {
    return { net: { events: [], arcs: acts(p).map((act) => ({ act, from: null, to: null })), dummies: [] }, seq: 0, result: null };
  }

  // Nombre de un suceso para el alumno: su número o, sin número, letras según su id (0 → a, 25 → z, 26 → aa).
  function letters(id) {
    let s = ''; let k = id + 1;
    while (k > 0) { const r = (k - 1) % 26; s = String.fromCharCode(97 + r) + s; k = Math.floor((k - 1) / 26); }
    return s;
  }
  function label(net, id) {
    const e = net.events.find((x) => x.id === id);
    return !e ? null : e.n !== null && e.n !== undefined ? String(e.n) : letters(e.id);
  }
  // El suceso que nombra un texto de la tabla: un número (el primero con ese número) o las letras de uno sin número.
  function byLabel(net, text) {
    const v = String(text == null ? '' : text).trim().toLowerCase();
    if (/^\d+$/.test(v)) { const e = net.events.find((x) => x.n === Number(v)); return e ? e.id : null; }
    const e = net.events.find((x) => (x.n === null || x.n === undefined) && letters(x.id) === v);
    return e ? e.id : null;
  }

  // Quita los sucesos sin posición que se han quedado sin ninguna flecha.
  function prune(net) {
    const used = new Set();
    for (const e of [...net.arcs, ...net.dummies]) { if (e.from !== null) used.add(e.from); if (e.to !== null) used.add(e.to); }
    const keep = net.events.filter((e) => used.has(e.id) || (e.x !== undefined && e.y !== undefined));
    return keep.length === net.events.length ? net : Object.assign({}, net, { events: keep });
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
      case 'endNumber': {
        // Tabla de sucesos: el extremo (side) de una actividad (act) o de una ficticia (i) pasa a ser el suceso con
        // el número n (el primero, si hay varios), que se crea si no existe; n null lo deja vacío.
        const target = op.act !== undefined ? arc(op.act) : net.dummies[op.i];
        if (!target || !['from', 'to'].includes(op.side)) return null;
        if (!(op.n === null || (Number.isInteger(op.n) && op.n >= 1 && op.n <= LIMIT.n))) return null;
        let events = net.events; let next = seq; let id = null;
        if (op.n !== null) {
          const e = events.find((x) => x.n === op.n);
          if (e) id = e.id;
          else {
            if (events.length >= LIMIT.events || seq > LIMIT.id) return null;
            id = seq; next = seq + 1; events = [...events, { id, n: op.n }];
          }
        }
        const put = (x) => Object.assign({}, x, { [op.side]: id });
        const out = op.act !== undefined
          ? { events, arcs: net.arcs.map((a) => (a === target ? put(a) : a)), dummies: net.dummies }
          : { events, arcs: net.arcs, dummies: net.dummies.map((d) => (d === target ? put(d) : d)) };
        return { net: out, seq: next };
      }
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
    return { net: prune(r.net), seq: r.seq === undefined ? state.seq : r.seq, result: null };
  }

  // La red con las ficticias nombradas F1, F2… en su orden (para el diagnóstico y la vista); f1, f2… si alguna
  // actividad de la tabla ya se llama F1, F2… (aoa.dummyPrefix).
  function named(net, p) {
    const pre = p ? A.dummyPrefix(p.activities.map((a) => a.id)) : 'F';
    return { events: net.events, arcs: net.arcs, dummies: net.dummies.map((d, i) => Object.assign({}, d, { name: `${pre}${i + 1}` })) };
  }

  function check(state, p, min) {
    const { problems } = K.diagnose(named(state.net, p), p);
    const correct = problems.every((x) => x.code === 'unnecessaryDummy');
    const dummies = state.net.dummies.length;
    const removable = correct ? problems.filter((x) => x.code === 'unnecessaryDummy').map((x) => ({ name: x.ids[0], how: x.how })) : [];
    let m = min ? { value: min.value, lower: min.lower, exact: !!min.exact } : null;
    // Una red correcta con menos ficticias que la mejor conocida (búsqueda no exacta) la mejora: V ≤ sus ficticias.
    if (m && correct && dummies < m.value) m = { value: dummies, lower: m.lower, exact: dummies === m.lower };
    const extra = m && correct ? dummies - m.value : null;
    const structural = extra === null ? null : extra > 0 && removable.length === 0;
    const together = removable.length < 2 || K.removableTogether(named(state.net, p), p);
    return { net: state.net, seq: state.seq, result: { correct, problems, dummies, min: m, extra, removable, structural, together } };
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
    const seq = events.reduce((m, e) => Math.max(m, e.id + 1), 0);
    return { net: prune({ events, arcs, dummies }), seq, result: null };
  }

  // ---------- Lienzo (T022): dónde se dibuja cada suceso ----------
  // Rejilla de GRID px; los sucesos sin posición (los de la tabla) se colocan por niveles: una actividad avanza una
  // columna y una ficticia ninguna (como views/aoa-layout), en filas que no pisan a los sucesos ya colocados.
  const CANVAS = { grid: 20, col: 140, row: 80, pad: 40, w: 640, h: 320, near: 36 };
  const snap = (v) => Math.min(LIMIT.pos, Math.max(0, Math.round(v / CANVAS.grid) * CANVAS.grid));

  function place(net) {
    const out = new Map();
    for (const e of net.events) if (e.x !== undefined && e.y !== undefined) out.set(e.id, { x: e.x, y: e.y, auto: false });
    const auto = net.events.filter((e) => !out.has(e.id));
    if (auto.length) {
      // Nivel por el camino más largo (Kahn); los que quedan en un ciclo van detrás.
      const edges = [...net.arcs.map((a) => [a.from, a.to, 1]), ...net.dummies.map((d) => [d.from, d.to, 0])].filter(([f, t]) => f !== null && t !== null);
      const level = new Map(net.events.map((e) => [e.id, 0]));
      const deg = new Map(net.events.map((e) => [e.id, 0]));
      for (const [, t] of edges) deg.set(t, deg.get(t) + 1);
      const queue = net.events.filter((e) => deg.get(e.id) === 0).map((e) => e.id);
      const seen = new Set();
      while (queue.length) {
        const u = queue.shift(); seen.add(u);
        for (const [f, t, w] of edges) if (f === u) { level.set(t, Math.max(level.get(t), level.get(u) + w)); deg.set(t, deg.get(t) - 1); if (deg.get(t) === 0) queue.push(t); }
      }
      let top = Math.max(0, ...level.values());
      for (const e of net.events) if (!seen.has(e.id)) level.set(e.id, ++top);
      const order = auto.slice().sort((a, b) => (a.n == null ? 1e9 : a.n) - (b.n == null ? 1e9 : b.n) || a.id - b.id);
      const taken = [...out.values()];
      const free = (x, y) => taken.every((p) => Math.hypot(p.x - x, p.y - y) >= CANVAS.near * 2);
      for (const e of order) {
        const x = CANVAS.pad + level.get(e.id) * CANVAS.col;
        let y = CANVAS.pad;
        while (!free(x, y)) y += CANVAS.row;
        const p = { x, y, auto: true };
        out.set(e.id, p); taken.push(p);
      }
    }
    return out;
  }

  // Tamaño del lienzo para que quepan todos los sucesos (con margen).
  function extent(places) {
    const ps = [...places.values()];
    return { w: Math.max(CANVAS.w, ...ps.map((p) => p.x + CANVAS.pad + 40)), h: Math.max(CANVAS.h, ...ps.map((p) => p.y + CANVAS.pad + 20)) };
  }

  // Un hueco libre para un suceso nuevo creado con el teclado: a la derecha del suceso de referencia (o debajo), o el
  // primero libre de la rejilla.
  function spot(places, near) {
    const taken = [...places.values()];
    const free = (x, y) => taken.every((p) => Math.hypot(p.x - x, p.y - y) >= CANVAS.near * 2);
    const tries = [];
    if (near) for (const [dx, dy] of [[1, 0], [1, 1], [0, 1], [1, -1], [2, 0], [0, -1]]) tries.push([near.x + dx * CANVAS.col, near.y + dy * CANVAS.row]);
    for (let r = 0; r < 40; r++) for (let c = 0; c < 12; c++) tries.push([CANVAS.pad + c * CANVAS.col, CANVAS.pad + r * CANVAS.row]);
    for (const [x, y] of tries) if (x >= 0 && y >= 0 && free(snap(x), snap(y))) return { x: snap(x), y: snap(y) };
    return { x: CANVAS.pad, y: CANVAS.pad };
  }

  // Los problemas del diagnóstico con los sucesos nombrados como los ve el alumno (número o letras), para narrate.
  // En los que son una lista de sucesos (no un origen y un destino), en orden: primero los números y luego las letras.
  const LISTS = ['start', 'end', 'cycle', 'unnumbered', 'looseEvent', 'sameNumber'];
  const byShown = (a, b) => (/^\d+$/.test(a) ? (/^\d+$/.test(b) ? a - b : -1) : (/^\d+$/.test(b) ? 1 : a.length - b.length || (a < b ? -1 : a > b ? 1 : 0)));
  function shown(problems, net) {
    return problems.map((x) => {
      if (!x.events) return x;
      const events = x.events.map((id) => (id === null ? '?' : label(net, id) || '?'));
      return Object.assign({}, x, { events: LISTS.includes(x.code) ? events.sort(byShown) : events });
    });
  }

  const api = { start, apply, check, named, fromUrl, label, byLabel, shown, place, extent, spot, snap, CANVAS, LIMIT };
  root.PNL = root.PNL || {};
  root.PNL.reto = api;
  if (isNode) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
