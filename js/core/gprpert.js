/*
 * core/gprpert — la red PERT equivalente de un proyecto con precedencias generalizadas (spec f5a-precedencias-generalizadas,
 * AC9 y AC10; plan §2, §3, P3, P4; prototipo spikes/f5a-precedencias-generalizadas/pert-equiv.js).
 *
 * Cada actividad se parte en piezas por donde se engancha una relación, y la red sale de core/aoa (reglas de los
 * conjuntos) sobre el proyecto de piezas, que solo tiene relaciones fin–comienzo sin desfase. Cada relación i → j es
 * «tiempoᵢ(p) + lag ≤ tiempoⱼ(q)», con p, q = 0 (comienzo) o d (fin):
 *   1. si p + lag ∈ [0, dᵢ], se corta i en p + lag y la pieza de i que acaba ahí precede a la pieza de j que empieza en q;
 *   2. si no, y q − lag ∈ [0, dⱼ], se corta j en q − lag;
 *   3. si no, y p + lag > dᵢ, una espera de p + lag − dᵢ va del fin de i a j;
 *   4. si no (un adelanto que no cabe en ninguna de las dos), la relación no se puede dibujar sin un arco de duración
 *      negativa: va a omitted.
 * «Comienzo de i» como origen: la pieza de j hereda las precedentes de la primera pieza de i. «Fin de j» como destino:
 * una pieza de duración 0 al final de j (zero), que la vista dibuja como ficticia (P4). El origen «fin de i» es la
 * última pieza que acaba en dᵢ, también la de 0 si existe.
 * La red es una relajación de la ROY: en ella las piezas de una actividad pueden separarse (actividad interrumpible),
 * así que su duración es menor o igual; es igual si ninguna se separa y no se omite ninguna relación.
 */
(function (root) {
  'use strict';

  const isNode = typeof module !== 'undefined' && module.exports;
  const A = isNode ? require('./aoa.js') : root.PNL.aoa;
  const C = isNode ? require('./cpm.js') : root.PNL.cpm;
  const EPS = 1e-9;
  const rnd = (x) => { const v = Math.round(x * 1e9) / 1e9; return v === 0 ? 0 : v; };
  const SUB = '₀₁₂₃₄₅₆₇₈₉';
  const sub = (k) => String(k).split('').map((c) => SUB[Number(c)]).join('');
  const near = (a, b) => Math.abs(a - b) < EPS;

  // Dónde se engancha cada relación (reglas 1–4).
  function placeAll(gp, d) {
    return gp.rels.map((r, k) => {
      const p = r.type[0] === 'S' ? 0 : d[r.from];
      const q = r.type[1] === 'S' ? 0 : d[r.to];
      const o = p + r.lag;
      if (o > -EPS && o < d[r.from] + EPS) return { k, o: rnd(o), q, wait: 0 };
      if (q - r.lag > -EPS && q - r.lag < d[r.to] + EPS) return { k, o: p, q: rnd(q - r.lag), wait: 0 };
      if (o > d[r.from]) return { k, o: d[r.from], q, wait: rnd(o - d[r.from]) };
      return { k, omitted: true };
    });
  }

  function pieces(gp) {
    const d = Object.fromEntries(gp.activities.map((a) => [a.id, a.d]));
    const placed = placeAll(gp, d);
    const cuts = Object.fromEntries(gp.activities.map((a) => [a.id, new Set([0, d[a.id]])]));
    for (const x of placed) {
      if (x.omitted) continue;
      const r = gp.rels[x.k];
      cuts[r.from].add(x.o);
      cuts[r.to].add(x.q);
    }
    const acts = [];
    const pieceAt = {};
    const preds = {};
    for (const a of gp.activities) {
      const cs = [...cuts[a.id]].sort((u, v) => u - v);
      const segs = [];
      for (let i = 0; i + 1 < cs.length; i++) segs.push([cs[i], cs[i + 1]]);
      if (!segs.length) segs.push([0, 0]);
      const endIn = d[a.id] > 0 && placed.some((x) => !x.omitted && gp.rels[x.k].to === a.id && near(x.q, d[a.id]));
      if (endIn) segs.push([d[a.id], d[a.id]]);
      pieceAt[a.id] = [];
      segs.forEach(([s0, s1], i) => {
        const id = segs.length === 1 ? a.id : `${a.id}${sub(i + 1)}`;
        const piece = { id, d: rnd(s1 - s0), of: a.id, s0, s1, zero: segs.length > 1 && near(s0, s1) };
        acts.push(piece);
        pieceAt[a.id].push(piece);
        preds[id] = i ? [pieceAt[a.id][i - 1].id] : [];
      });
    }
    const startPiece = (a, q) => pieceAt[a].find((x) => near(x.s0, q) && (x.s1 > x.s0 + EPS || near(q, d[a])));
    const endPiece = (a, o) => pieceAt[a].filter((x) => near(x.s1, o)).pop();
    const startRefs = [];
    const links = {};
    let w = 0;
    for (const x of placed) {
      if (x.omitted) continue;
      const r = gp.rels[x.k];
      const tgt = startPiece(r.to, x.q).id;
      const link = { rel: x.k, to: tgt, from: null, startOf: null, wait: null };
      let head = tgt;
      if (x.wait > 0) {
        const wid = `w${++w}`;
        acts.push({ id: wid, d: x.wait, wait: true, rel: x.k });
        preds[wid] = [];
        preds[tgt].push(wid);
        link.wait = wid;
        head = wid;
      }
      if (near(x.o, 0)) { startRefs.push({ tgt: head, act: r.from }); link.startOf = r.from; } else {
        const src = endPiece(r.from, x.o).id;
        preds[head].push(src);
        link.from = src;
      }
      links[x.k] = link;
    }
    // «Comienzo de i»: lo que precede a la primera pieza de i (puede encadenarse; se repite hasta que no cambie).
    for (let changed = true; changed;) {
      changed = false;
      for (const s of startRefs) {
        for (const p of preds[pieceAt[s.act][0].id]) if (!preds[s.tgt].includes(p)) { preds[s.tgt].push(p); changed = true; }
      }
    }
    const succs = Object.fromEntries(acts.map((a) => [a.id, []]));
    for (const a of acts) preds[a.id] = [...new Set(preds[a.id])];
    for (const a of acts) for (const p of preds[a.id]) succs[p].push(a.id);
    const project = { activities: acts.map((a) => ({ id: a.id, name: '', d: a.d })), preds, succs };
    return { project, acts, pieceAt, links, omitted: placed.filter((x) => x.omitted).map((x) => x.k),
      waits: acts.filter((a) => a.wait).map((a) => a.id) };
  }

  // Ficticias que unen dos sucesos (camino solo por ficticias), para resaltar una relación.
  function dummyPath(net, from, to) {
    if (from === to) return [];
    const prev = new Map([[from, null]]);
    const queue = [from];
    while (queue.length) {
      const u = queue.shift();
      for (const dm of net.dummies.filter((x) => x.from === u)) {
        if (prev.has(dm.to)) continue;
        prev.set(dm.to, dm);
        if (dm.to === to) {
          const out = [];
          for (let v = to; prev.get(v); v = prev.get(v).from) out.unshift(prev.get(v).name);
          return out;
        }
        queue.push(dm.to);
      }
    }
    return null;
  }

  function build(gp) {
    const P = pieces(gp);
    const net = A.build(P.project);
    const sol = C.solve(P.project);
    const arcOf = Object.fromEntries(net.arcs.map((e) => [e.act, e]));
    const gaps = [];
    for (const a of gp.activities) {
      const ps = P.pieceAt[a.id];
      for (let i = 1; i < ps.length; i++) {
        const g = rnd(sol.times[ps[i].id].ES - sol.times[ps[i - 1].id].EF);
        if (g > EPS) gaps.push({ act: a.id, after: ps[i - 1].id, before: ps[i].id, gap: g });
      }
    }
    // Mapa relación → piezas, espera y ficticias que la representan (AC10).
    const map = {};
    for (const [k, l] of Object.entries(P.links)) {
      const tail = l.startOf ? arcOf[P.pieceAt[l.startOf][0].id].from : arcOf[l.from].to;
      const arcs = [l.startOf ? null : l.from, l.wait, l.to].filter(Boolean);
      const dummies = l.wait ? [...(dummyPath(net, tail, arcOf[l.wait].from) || []), ...(dummyPath(net, arcOf[l.wait].to, arcOf[l.to].from) || [])]
        : (dummyPath(net, tail, arcOf[l.to].from) || []);
      map[k] = { arcs, dummies, startOf: l.startOf, events: [tail, arcOf[l.to].from] };
    }
    return { net, pieces: P, omitted: P.omitted, Tpert: sol.duration, times: sol.times, gaps, map };
  }

  const api = { pieces, build };
  root.PNL = root.PNL || {};
  root.PNL.gprpert = api;
  if (isNode) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
