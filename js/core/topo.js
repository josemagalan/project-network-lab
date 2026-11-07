/*
 * core/topo — orden topológico determinista y niveles de una red ROY (actividad en nodo).
 * Proyecto: { activities: [{id, d}], preds: {id: [ids]}, succs: {id: [ids]} }.
 * Inicio y fin son actividades implícitas de duración 0 con identificadores no alfanuméricos,
 * así que nunca chocan con los del usuario. Sin DOM: se usa igual en el navegador y en Node.
 */
(function (root) {
  'use strict';

  const START = '@S';
  const END = '@E';
  const byId = (a, b) => a.localeCompare(b, 'en', { numeric: true });

  // Kahn con desempate por identificador: el mismo proyecto da siempre el mismo orden.
  function order(project) {
    const ids = project.activities.map((a) => a.id);
    const indeg = new Map(ids.map((id) => [id, (project.preds[id] || []).length]));
    const ready = ids.filter((id) => indeg.get(id) === 0).sort(byId);
    const out = [];
    while (ready.length) {
      const id = ready.shift();
      out.push(id);
      for (const s of project.succs[id] || []) {
        indeg.set(s, indeg.get(s) - 1);
        if (indeg.get(s) === 0) { ready.push(s); ready.sort(byId); }
      }
    }
    if (out.length < ids.length) return { cycle: findCycle(project, ids.filter((id) => !out.includes(id))) };

    const levels = new Map([[START, 0]]);
    let max = 0;
    for (const id of out) {
      const lv = 1 + Math.max(0, ...(project.preds[id] || []).map((p) => levels.get(p)));
      levels.set(id, lv);
      if (lv > max) max = lv;
    }
    levels.set(END, max + 1);
    return { order: out, levels };
  }

  // Devuelve las actividades de un ciclo concreto (en su orden) dentro de las que quedaron sin ordenar.
  function findCycle(project, pending) {
    const set = new Set(pending);
    const color = new Map();
    const stack = [];
    let found = null;
    const visit = (id) => {
      color.set(id, 1); stack.push(id);
      for (const s of (project.succs[id] || []).filter((x) => set.has(x)).sort(byId)) {
        if (found) return;
        if (color.get(s) === 1) { found = stack.slice(stack.indexOf(s)); return; }
        if (!color.get(s)) visit(s);
      }
      stack.pop(); color.set(id, 2);
    };
    for (const id of [...pending].sort(byId)) { if (!found && !color.get(id)) visit(id); }
    return found || pending;
  }

  const api = { START, END, byId, order };
  root.PNL = root.PNL || {};
  root.PNL.topo = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
