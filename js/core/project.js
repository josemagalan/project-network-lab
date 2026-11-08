/*
 * core/project — de las filas de la tabla a un proyecto válido.
 * parse(rows, mode): valida, normaliza identificadores, convierte predecesoras ↔ posteriores y
 * avisa de precedencias redundantes. El núcleo no tiene idioma: devuelve códigos y la interfaz
 * pone los textos. Las filas vacías se ignoran. Ver la spec f1-cpm-roy (AC3, AC4, AC5, AC13, AC18).
 */
(function (root) {
  'use strict';

  const T = (typeof module !== 'undefined' && module.exports) ? require('./topo.js') : root.PNL.topo;
  const { START, END, byId } = T;
  const MAX_ACTIVITIES = 30;
  const ID_RE = /^[A-Z0-9]{1,4}$/;
  const RESERVED = new Set(['INI', 'FIN', 'END', 'PRIN', 'START']);

  const str = (v) => (v == null ? '' : String(v));
  const normId = (v) => str(v).trim().toUpperCase();
  const splitLinks = (v) => str(v).split(/[\s,;]+/).map(normId).filter(Boolean);
  const uniq = (xs) => [...new Set(xs)];
  const isEmptyRow = (r) => !str(r.id).trim() && !str(r.duration).trim() && !str(r.links).trim();

  function parseDuration(v) {
    const s = str(v).trim().replace(',', '.');
    if (!/^\d+(\.\d+)?$/.test(s)) return null;
    const n = Number(s);
    return Number.isFinite(n) && n >= 0 ? n : null;
  }

  // opts.structureOnly: tabla solo de estructura (ejercicios sin duraciones, F2a); una duración vacía vale null.
  function parse(rows, mode, opts) {
    const structureOnly = !!(opts && opts.structureOnly);
    const errors = [];
    const warnings = [];
    const items = [];
    const seen = new Set();

    rows.forEach((r, i) => {
      if (isEmptyRow(r)) return;
      const id = normId(r.id);
      if (!ID_RE.test(id)) { errors.push({ code: 'badId', row: i, ids: [id] }); return; }
      if (RESERVED.has(id)) { errors.push({ code: 'reservedId', row: i, ids: [id] }); return; }
      if (seen.has(id)) { errors.push({ code: 'duplicateId', row: i, ids: [id] }); return; }
      seen.add(id);
      const blank = !str(r.duration).trim();
      const d = structureOnly && blank ? null : parseDuration(r.duration);
      if (d === null && !(structureOnly && blank)) errors.push({ code: 'badDuration', row: i, ids: [id] });
      items.push({ row: i, id, name: r.name == null ? '' : r.name, d, links: uniq(splitLinks(r.links)) });
    });
    if (items.length > MAX_ACTIVITIES) errors.push({ code: 'tooMany', ids: [] });

    for (const it of items) {
      const unknown = it.links.filter((x) => !seen.has(x)).sort(byId);
      if (unknown.length) errors.push({ code: 'unknownRef', row: it.row, ids: unknown });
    }
    if (errors.length) return { project: null, report: { errors: sortIssues(errors), warnings } };
    // Tabla vacía: ni proyecto ni errores; la interfaz invita a empezar o a cargar un ejemplo (spec, casos límite).
    if (!items.length) return { project: null, report: { errors: [], warnings: [] } };

    const preds = Object.fromEntries(items.map((it) => [it.id, []]));
    const succs = Object.fromEntries(items.map((it) => [it.id, []]));
    for (const it of items) {
      for (const x of it.links) {
        if (mode === 'succ') { succs[it.id].push(x); preds[x].push(it.id); }
        else { preds[it.id].push(x); succs[x].push(it.id); }
      }
    }
    for (const id of Object.keys(preds)) { preds[id] = uniq(preds[id]).sort(byId); succs[id] = uniq(succs[id]).sort(byId); }

    const project = { activities: items.map((it) => ({ id: it.id, name: it.name, d: it.d })), preds, succs };
    const topo = T.order(project);
    if (topo.cycle) return { project: null, report: { errors: [{ code: 'cycle', ids: topo.cycle }], warnings } };

    // Redundancia por transitividad: i → j sobra si i ya alcanza j por otro camino.
    const reach = reachability(project, topo.order);
    const rowOf = Object.fromEntries(items.map((it) => [it.id, it.row]));
    for (const j of topo.order) {
      for (const i of preds[j]) {
        if (preds[j].some((k) => k !== i && reach.get(i).has(k))) {
          warnings.push({ code: 'redundant', row: mode === 'succ' ? rowOf[i] : rowOf[j], ids: [i, j] });
        }
      }
    }
    return { project, report: { errors: [], warnings: sortIssues(warnings) } };
  }

  // reach.get(i) = actividades alcanzables desde i (sin incluir i).
  function reachability(project, order) {
    const reach = new Map();
    for (const id of [...order].reverse()) {
      const set = new Set();
      for (const s of project.succs[id]) { set.add(s); for (const x of reach.get(s)) set.add(x); }
      reach.set(id, set);
    }
    return reach;
  }

  function sortIssues(list) {
    return list.sort((a, b) => (a.row == null ? Infinity : a.row) - (b.row == null ? Infinity : b.row));
  }

  function toRows(project, mode) {
    const links = mode === 'succ' ? project.succs : project.preds;
    return project.activities.map((a) => ({ id: a.id, name: a.name, duration: String(a.d), links: links[a.id].join(', ') }));
  }

  // Texto copiado de una hoja de cálculo: una fila por actividad; tabulador o punto y coma.
  // Columnas: id, nombre, duración, precedencias (o id, duración, precedencias; o id, duración).
  function parsePasted(text) {
    const lines = str(text).split(/\r?\n/).filter((l) => l.trim());
    if (!lines.length) return [];
    const sep = lines.some((l) => l.includes('\t')) ? '\t' : ';';
    const rows = lines.map((l) => l.split(sep).map((c) => c.trim()));
    const looksNumeric = (c) => parseDuration(c) !== null;
    const toRow = (c) => {
      if (c.length >= 4) return { id: c[0], name: c[1], duration: c[2], links: c[3] };
      if (c.length === 3) return looksNumeric(c[1]) ? { id: c[0], name: '', duration: c[1], links: c[2] }
        : { id: c[0], name: c[1], duration: c[2], links: '' };
      return { id: c[0] || '', name: '', duration: c[1] || '', links: '' };
    };
    const out = rows.map(toRow);
    if (out.length && parseDuration(out[0].duration) === null && /[a-zá-ú]/i.test(out[0].duration)) out.shift();
    return out;
  }

  const api = { START, END, MAX_ACTIVITIES, parse, toRows, parsePasted, parseDuration };
  root.PNL = root.PNL || {};
  root.PNL.project = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
