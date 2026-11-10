'use strict';
/*
 * Oráculo de core/precheck (F2c, T001; AC4 y AC7). Solo para pruebas: sin dependencias de js/, escrito
 * para leerse y no para ser rápido. Referencia independiente del cierre, la reducción transitiva y el
 * camino más corto que hace redundante una precedencia.
 *
 * Tabla: { [id]: [predecesoras inmediatas] }. Arista p → a si p está entre las predecesoras de a.
 */

const ids = (pred) => Object.keys(pred);
const edges = (pred) => ids(pred).flatMap((a) => pred[a].map((p) => [p, a]));

// Cierre por Floyd-Warshall sobre una matriz booleana: reach[i][j] si hay camino de longitud ≥ 1 de i a j.
function closure(pred) {
  const list = ids(pred);
  const at = new Map(list.map((x, i) => [x, i]));
  const n = list.length;
  const r = Array.from({ length: n }, () => new Array(n).fill(false));
  for (const [p, a] of edges(pred)) r[at.get(p)][at.get(a)] = true;
  for (let k = 0; k < n; k++) for (let i = 0; i < n; i++) if (r[i][k]) for (let j = 0; j < n; j++) if (r[k][j]) r[i][j] = true;
  return new Map(list.map((x, i) => [x, new Set(list.filter((_, j) => r[i][j]))]));
}

const without = (pred, [p, a]) => Object.fromEntries(ids(pred).map((x) => [x, x === a ? pred[x].filter((y) => y !== p) : pred[x].slice()]));

const sameClosure = (x, y) => {
  const cx = closure(x), cy = closure(y);
  return ids(x).every((k) => cx.get(k).size === cy.get(k).size && [...cx.get(k)].every((v) => cy.get(k).has(v)));
};

// Reducción por definición: una arista es de la reducción si quitarla cambia el cierre.
function reduction(pred) {
  return edges(pred).filter((e) => !sameClosure(pred, without(pred, e)));
}

// Camino más corto de p a a sin usar la arista directa p → a, por búsqueda exhaustiva de caminos simples.
// Desempate: el primero en orden lexicográfico de la lista de identificadores. null si no hay ninguno.
function shortestWithout(pred, [p, a]) {
  const succ = Object.fromEntries(ids(pred).map((x) => [x, []]));
  for (const [x, y] of edges(pred)) if (!(x === p && y === a)) succ[x].push(y);
  let best = null;
  const better = (c) => !best || c.length < best.length || (c.length === best.length && c.join('\u0000') < best.join('\u0000'));
  (function walk(path) {
    const last = path[path.length - 1];
    if (last === a && path.length > 1) { if (better(path)) best = path.slice(); return; }
    for (const y of succ[last]) if (!path.includes(y) || (y === a && y !== p)) { path.push(y); walk(path); path.pop(); }
  })([p]);
  return best;
}

module.exports = { closure, reduction, shortestWithout };
