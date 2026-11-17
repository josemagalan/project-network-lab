/*
 * core/roycheck — corrección y nota de la red ROY que dibuja el alumno, y nota de su red PERT (spec
 * f3d-construir-detectar, AC1–AC4, AC7 y AC22; plan §0 y §3, P3, A1, H3, H4 y H8).
 *
 * RoyNet = { nodes: [{ id, x?, y? }], arcs: [{ from, to }] }: id de una actividad de la tabla, '_S' (Inicio) o '_E' (Fin).
 * fromTable(p): la red de la F1 (Inicio, las actividades y Fin; arcos de la reducción de la tabla), sin posiciones.
 * diagnose(p, net): { ok, issues, warnings, counts }. Con alcanzabilidad propia por recorrido en profundidad, que
 *   vale también con ciclos (P3); el cierre y la reducción de la tabla salen de aoa._reduce (carga común), nunca de
 *   precheck (grupo m0), que solo es el oráculo de las pruebas (H8). Problemas, en este orden:
 *   missingNode [a] · cycle (nodes: los de cada ciclo) · inverted [p, a] (arco a → p con p → a inmediata en la tabla;
 *   sustituye a la precedencia que falta) · missingPrecedence [p, a] (inmediata sin camino de p a a; solo con los dos
 *   nodos) · falsePrecedence [x, y] (arco fuera del cierre de la tabla) · startMissing / endMissing (Inicio o Fin sin
 *   ningún arco; sustituyen a sus uniones) · startLink [a] / endLink [a] (unión que falta o que sobra) ·
 *   invalidArc [x, y] (hacia Inicio, desde Fin, de Inicio a Fin, de un nodo a sí mismo o con un extremo que no está).
 *   Aviso: redundant [x, y] con path, el camino más corto que ya lo implica (arco permitido por la tabla).
 *   counts: hits (inmediatas representadas y uniones de Inicio y Fin bien hechas), total (inmediatas, iniciales y
 *   finales), falseArcs (falsos, al revés, uniones que sobran e imposibles) y cycle.
 * score(r): 100 · máx(0, hits − falseArcs) / total; con un ciclo, como mucho 50.
 * scorePert(net, p, check): check es el resultado de reto.check. Correcta: 80 + 20 en el mínimo (el mejor conocido si no
 *   es exacto, H3) y máx(80, 100 − 5k) con k ficticias de más. Incorrecta: mín(60, 100 · inmediatas representadas /
 *   inmediatas), contadas con su propio recorrido sobre los sucesos, que vale con ciclos y con arcos a medias (H4).
 * pertHits(net, p): { hits, total } de ese recuento, para el texto de la nota (T010).
 * Sin DOM ni azar.
 */
(function (root) {
  'use strict';

  const isNode = typeof module !== 'undefined' && module.exports;
  const A = isNode ? require('./aoa.js') : root.PNL.aoa;

  const START = '_S';
  const END = '_E';
  const ORDER = ['missingNode', 'cycle', 'inverted', 'missingPrecedence', 'falsePrecedence', 'startMissing', 'startLink', 'endMissing', 'endLink', 'invalidArc'];
  const byId = (a, b) => a.localeCompare(b, 'en', { numeric: true });
  const byIds = (u, v) => {
    for (let i = 0; i < Math.max(u.length, v.length); i++) {
      if (u[i] === undefined) return -1;
      if (v[i] === undefined) return 1;
      const c = byId(u[i], v[i]);
      if (c) return c;
    }
    return 0;
  };

  function fromTable(p) {
    const { direct } = A._reduce(p);
    const ids = p.activities.map((a) => a.id);
    const arcs = [];
    for (const a of ids) if (!p.preds[a].length) arcs.push({ from: START, to: a });
    for (const b of ids) for (const a of p.preds[b]) if (direct[a].includes(b)) arcs.push({ from: a, to: b });
    for (const a of ids) if (!p.succs[a].length) arcs.push({ from: a, to: END });
    return { nodes: [{ id: START }, ...ids.map((id) => ({ id })), { id: END }], arcs };
  }

  // Alcanzables desde cada nodo (sin incluirlo, salvo que esté en un ciclo), por recorrido en profundidad.
  function reachOf(keys, out) {
    const reach = new Map();
    for (const k of keys) {
      const seen = new Set(); const stack = [...out.get(k)];
      while (stack.length) { const x = stack.pop(); if (!seen.has(x)) { seen.add(x); stack.push(...out.get(x)); } }
      reach.set(k, seen);
    }
    return reach;
  }

  // Camino más corto de x a y sin el arco directo (vecinos en orden natural), como precheck.
  function pathWithout(out, x, y) {
    const prev = new Map([[x, null]]); const queue = [x];
    while (queue.length) {
      const u = queue.shift();
      if (u === y) break;
      for (const v of [...out.get(u)].sort(byId)) {
        if (u === x && v === y) continue;
        if (!prev.has(v)) { prev.set(v, u); queue.push(v); }
      }
    }
    if (!prev.has(y)) return null;
    const path = [];
    for (let u = y; u !== null; u = prev.get(u)) path.unshift(u);
    return path;
  }

  function diagnose(p, net) {
    const ids = p.activities.map((a) => a.id);
    const known = new Set(ids);
    const { reach: closure, direct } = A._reduce(p);
    const nodes = new Set(((net && net.nodes) || []).map((n) => n.id).filter((id) => known.has(id) || id === START || id === END));
    const present = ids.filter((a) => nodes.has(a));
    const issues = []; const warnings = [];
    let falseArcs = 0;

    // Arcos: válidos (sin repetir) e imposibles.
    const seen = new Set(); const actArcs = []; const startTo = new Set(); const endFrom = new Set();
    for (const e of (net && net.arcs) || []) {
      const k = `${e.from}>${e.to}`;
      if (seen.has(k)) continue;
      seen.add(k);
      const ok = nodes.has(e.from) && nodes.has(e.to) && e.from !== e.to && e.to !== START && e.from !== END && !(e.from === START && e.to === END);
      if (!ok) { issues.push({ code: 'invalidArc', ids: [e.from, e.to] }); falseArcs++; continue; }
      if (e.from === START) startTo.add(e.to);
      else if (e.to === END) endFrom.add(e.from);
      else actArcs.push([e.from, e.to]);
    }
    const out = new Map(present.map((a) => [a, []]));
    for (const [x, y] of actArcs) out.get(x).push(y);
    const reach = reachOf(present, out);
    const linked = (x, y) => nodes.has(x) && nodes.has(y) && reach.get(x).has(y);

    for (const a of ids) if (!nodes.has(a)) issues.push({ code: 'missingNode', ids: [a] });

    // Ciclos: los nodos que se alcanzan mutuamente, por grupos.
    const done = new Set();
    for (const x of present) {
      if (done.has(x) || !reach.get(x).has(x)) continue;
      const group = present.filter((y) => y === x || (reach.get(x).has(y) && reach.get(y).has(x))).sort(byId);
      group.forEach((y) => done.add(y));
      issues.push({ code: 'cycle', ids: [], nodes: group });
    }

    // Precedencias.
    const back = new Set();
    for (const [x, y] of actArcs) {
      if (closure[x].has(y)) {
        const path = pathWithout(out, x, y);
        if (path) warnings.push({ code: 'redundant', ids: [x, y], path });
        continue;
      }
      // Un arco al revés es un solo error: pierde el acierto de su precedencia y no cuenta además como arco falso
      // (decisión del autor en la revisión de T018, N-F11; antes restaba dos veces). Si la precedencia sigue representada
      // (el arco correcto también está), no pierde nada y cuenta como arco falso (ronda 2, R2-F3), más abajo.
      if (direct[y].includes(x)) { issues.push({ code: 'inverted', ids: [y, x] }); back.add(`${y}>${x}`); }
      else { falseArcs++; issues.push({ code: 'falsePrecedence', ids: [x, y] }); }
    }
    let hits = 0; let total = 0;
    for (const a of ids) for (const b of direct[a]) {
      total++;
      if (linked(a, b)) hits++;
      else if (nodes.has(a) && nodes.has(b) && !back.has(`${a}>${b}`)) issues.push({ code: 'missingPrecedence', ids: [a, b] });
    }
    for (const k of back) { const [a, b] = k.split('>'); if (linked(a, b)) falseArcs++; }

    // Inicio y Fin.
    const ends = (code, set, isEnd) => {
      const wanted = ids.filter((a) => (isEnd ? !p.succs[a].length : !p.preds[a].length));
      total += wanted.length;
      if (!set.size) { issues.push({ code: `${code}Missing`, ids: [] }); return; }
      for (const a of wanted) {
        if (set.has(a)) hits++;
        else if (nodes.has(a)) issues.push({ code: `${code}Link`, ids: [a] });
      }
      for (const a of set) if (!wanted.includes(a)) { issues.push({ code: `${code}Link`, ids: [a] }); falseArcs++; }
    };
    ends('start', startTo, false);
    ends('end', endFrom, true);

    issues.sort((u, v) => ORDER.indexOf(u.code) - ORDER.indexOf(v.code) || byIds(u.nodes || u.ids, v.nodes || v.ids));
    warnings.sort((u, v) => byIds(u.ids, v.ids));
    const cycle = issues.some((i) => i.code === 'cycle');
    return { ok: issues.length === 0, issues, warnings, counts: { hits, total, falseArcs, cycle } };
  }

  // La nota ROY sin el tope del ciclo (la que explica la frase de la nota) y con él. La interfaz las lee de aquí, sin
  // repetir la fórmula (principio 4; revisión de T018, I-F1).
  function rawScore(r) {
    const c = r.counts;
    return c.total ? 100 * Math.max(0, c.hits - c.falseArcs) / c.total : (c.falseArcs ? 0 : 100);
  }
  function score(r) { return r.counts.cycle ? Math.min(rawScore(r), 50) : rawScore(r); }

  // Precedencias inmediatas de la tabla representadas en la red PERT del alumno (vale con ciclos y con actividades sin
  // arco, que cuentan como no representadas; H4). T010: la nota de una red incorrecta las cita.
  function pertHits(net, p) {
    const keys = net.events.map((e) => (e.id !== undefined ? e.id : e.n));
    const exists = new Set(keys);
    const complete = (e) => e.from !== null && e.to !== null && exists.has(e.from) && exists.has(e.to);
    const arcOf = {};
    for (const e of net.arcs) if (!(e.act in arcOf)) arcOf[e.act] = e;
    const out = new Map(keys.map((k) => [k, []]));
    for (const e of [...Object.values(arcOf), ...net.dummies]) if (complete(e)) out.get(e.from).push(e.to);
    const reach = reachOf(keys, out);
    const { direct } = A._reduce(p);
    let hits = 0; let total = 0;
    for (const a of p.activities.map((x) => x.id)) for (const b of direct[a]) {
      total++;
      const u = arcOf[a]; const v = arcOf[b];
      if (u && v && complete(u) && complete(v) && (u.to === v.from || reach.get(u.to).has(v.from))) hits++;
    }
    return { hits, total };
  }

  // Las dos partes de la nota PERT: con k ficticias de más, 100 − 5k (sin el suelo de 80); incorrecta, las precedencias
  // representadas, hasta 60.
  const pertExtraPct = (extra) => 100 - 5 * Math.max(0, extra || 0);
  const pertWrongPct = (h) => Math.min(60, h.total ? 100 * h.hits / h.total : 100);
  function scorePert(net, p, check) {
    if (check && check.correct) return check.extra === null || check.extra === undefined ? 100 : Math.max(80, pertExtraPct(check.extra));
    return pertWrongPct(pertHits(net, p));
  }

  const api = { START, END, fromTable, diagnose, score, rawScore, scorePert, pertHits, pertExtraPct, pertWrongPct };
  root.PNL = root.PNL || {};
  root.PNL.roycheck = api;
  if (isNode) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
