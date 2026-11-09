'use strict';
/*
 * Oráculo del modelo de Spinrad (1986), Networks 16: 331–348 (F2b, T001; AC3). Solo para pruebas: sin
 * dependencias de js/, lento y escrito para leerse. Referencia independiente de la cifra «en su modelo».
 *
 * Modelo: cada tarea u tiene un suceso de inicio u− y uno de fin u+, unidos por su arco. Preprocesado del
 * artículo (§3), en la variante con sucesos compartidos: se funden los u+ de las tareas con el mismo
 * conjunto no vacío de posteriores (cierre transitivo) y los u− de las que tienen el mismo conjunto no
 * vacío de precedentes. Una red es válida si hay camino de u+ a w− exactamente cuando u precede a w, y no
 * tiene ciclos. Se busca el menor número de arcos añadidos (además de los de las tareas), por profundidad
 * creciente sobre los arcos candidatos: los que, añadidos solos a los arcos de las tareas, no crean ningún
 * camino prohibido (todo arco de una red válida lo cumple, lema 1 del artículo).
 */
function closure(succ) {
  const acts = Object.keys(succ).sort();
  const reach = {};
  const visit = (a) => { if (reach[a]) return reach[a]; const r = new Set(); for (const b of succ[a]) { r.add(b); for (const c of visit(b)) r.add(c); } reach[a] = r; return r; };
  acts.forEach(visit);
  return { acts, reach };
}

function model(succ) {
  const { acts, reach } = closure(succ);
  const preds = Object.fromEntries(acts.map((b) => [b, acts.filter((a) => reach[a].has(b))]));
  const ids = new Map(); const id = (k) => { if (!ids.has(k)) ids.set(k, ids.size); return ids.get(k); };
  const plus = {}; const minus = {};
  for (const a of acts) {
    plus[a] = id(reach[a].size ? `+${[...reach[a]].sort().join(',')}` : `+#${a}`);
    minus[a] = id(preds[a].length ? `-${preds[a].join(',')}` : `-#${a}`);
  }
  return { acts, reach, plus, minus, nodes: ids.size };
}

// ¿Hay camino de cada u+ a cada w− exactamente cuando u precede a w? (y sin ciclos)
function valid(M, extra, exact) {
  const out = Array.from({ length: M.nodes }, () => []);
  for (const a of M.acts) out[M.minus[a]].push(M.plus[a]);
  for (const [x, y] of extra) out[x].push(y);
  const reachN = (s) => { const seen = new Set([s]); const st = [s]; while (st.length) { const u = st.pop(); for (const v of out[u]) if (!seen.has(v)) { seen.add(v); st.push(v); } } return seen; };
  for (const a of M.acts) {
    const r = reachN(M.plus[a]);
    if (r.has(M.minus[a])) return false;                       // ciclo a través de la tarea
    for (const b of M.acts) {
      if (a === b) continue;
      const path = r.has(M.minus[b]);
      if (path && !M.reach[a].has(b)) return false;             // camino prohibido
      if (exact && !path && M.reach[a].has(b)) return false;    // falta un camino
    }
  }
  return true;
}

function optimum(succ, opts = {}) {
  const M = model(succ);
  const maxK = opts.maxK == null ? 12 : opts.maxK;
  const taskArc = new Set(M.acts.map((a) => `${M.minus[a]}>${M.plus[a]}`));
  const cand = [];
  for (let x = 0; x < M.nodes; x++) for (let y = 0; y < M.nodes; y++) {
    if (x === y || taskArc.has(`${x}>${y}`)) continue;
    if (valid(M, [[x, y]], false)) cand.push([x, y]);
  }
  for (let k = 0; k <= Math.min(maxK, cand.length); k++) {
    const pick = [];
    const rec = (start) => {
      if (pick.length === k) return valid(M, pick, true);
      for (let i = start; i < cand.length; i++) {
        pick.push(cand[i]);
        if (valid(M, pick, false) && rec(i + 1)) return true;    // poda: nunca un camino prohibido
        pick.pop();
      }
      return false;
    };
    if (rec(0)) return { arcs: k, extra: pick.slice(), nodes: M.nodes };
  }
  return null;
}

module.exports = { optimum, model };
