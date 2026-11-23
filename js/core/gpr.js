/*
 * core/gpr — precedencias generalizadas en la red ROY (spec f5a-precedencias-generalizadas; plan §0, §3, P1, P6, P7).
 *
 * Relación canónica { from, to, type, lag } con type ∈ FS, SS, FF, SF (en español FC, CC, FF, CF) y desfase mínimo
 * (positivo, cero o negativo). Actividades no interrumpibles. Peso de cada relación sobre los comienzos:
 *   FS: ES(j) ≥ ES(i) + dᵢ + lag      SS: ES(j) ≥ ES(i) + lag
 *   FF: ES(j) ≥ ES(i) + dᵢ + lag − dⱼ  SF: ES(j) ≥ ES(i) + lag − dⱼ
 * ES(j) = máx(0, pesos que llegan) —el 0 es el Inicio—; T = máx EF de todas las actividades;
 * LS(i) = mín(T − dᵢ, LS(j) − peso de las que salen) —T − dᵢ es el Fin—.
 * Holguras: total = LS − ES; libre = mín(T − EF, ES(j) − ES(i) − peso de las que salen).
 * Con todas las relaciones FS+0 da lo mismo que core/cpm (AC2). Sin DOM ni azar; el núcleo no tiene idioma.
 *
 * Escritura de las predecesoras (P1): «ID», «ID TIPO» o «ID TIPO±desfase», separadas por comas, puntos y comas o
 * espacios. TIPO es FS, SS, FF, SF, FC, CC o CF (mayúsculas o minúsculas), con un espacio o pegado al identificador
 * («BCC+2» es B CC+2 si BCC no es una actividad y B sí). El desfase lleva signo (+, - o −) y decimales con punto o
 * coma; una coma entre dos cifras es decimal («B FF-1,5» es −1,5; «B FF-1, 5» es −1 y la actividad 5).
 */
(function (root) {
  'use strict';

  const isNode = typeof module !== 'undefined' && module.exports;
  const T = isNode ? require('./topo.js') : root.PNL.topo;
  const P = isNode ? require('./project.js') : root.PNL.project;
  const { START, END, byId } = T;

  const MAX_ACTIVITIES = P.MAX_ACTIVITIES;   // 30, como el taller (P6)
  const MAX_RELS = 120;
  const ID_RE = /^[A-Z0-9]{1,4}$/;
  const RESERVED = new Set(['INI', 'FIN', 'END', 'PRIN', 'START']);
  const CODE = { FS: 'FS', SS: 'SS', FF: 'FF', SF: 'SF', FC: 'FS', CC: 'SS', CF: 'SF' };
  const ES_NAME = { FS: 'FC', SS: 'CC', FF: 'FF', SF: 'CF' };
  const TYPES = ['FS', 'SS', 'FF', 'SF'];
  const TOL = 1e-6;
  const rnd = (x) => { const v = Math.round(x * 1e9) / 1e9; return v === 0 ? 0 : v; };   // como core/cpm
  const snap = (x) => { const v = rnd(x); return Math.abs(v) < TOL ? 0 : v; };

  const str = (v) => (v == null ? '' : String(v));
  const normId = (v) => str(v).trim().toUpperCase();
  const isEmptyRow = (r) => !str(r.id).trim() && !str(r.duration).trim() && !str(r.links).trim();

  // Peso de una relación sobre los comienzos (§0).
  function weight(type, di, dj, lag) {
    switch (type) {
      case 'FS': return di + lag;
      case 'SS': return lag;
      case 'FF': return di + lag - dj;
      case 'SF': return lag - dj;
      default: throw new Error(`gpr: tipo de relación desconocido «${type}»`);
    }
  }

  // Lee el campo de predecesoras de una fila. known: identificadores de la tabla (para separar «BCC» en B y CC).
  // Devuelve { items: [{ id, type, lag }], bad: [texto] }; type y lag son null si no se escribieron.
  function readLinks(text, known) {
    const s = str(text).replace(/−/g, '-');
    const tok = [];
    const re = /\s*(?:([,;])|([+-])\s*(\d+(?:[.,]\d+)?)|([A-Za-z0-9]+)|(\S))/y;
    let m;
    re.lastIndex = 0;
    while (re.lastIndex < s.length && (m = re.exec(s))) {
      if (m[1]) continue;
      if (m[2]) tok.push({ k: 'lag', v: (m[2] === '-' ? -1 : 1) * Number(m[3].replace(',', '.')), t: `${m[2]}${m[3]}` });
      else if (m[4]) tok.push({ k: 'word', v: m[4].toUpperCase(), t: m[4] });
      else if (m[5]) tok.push({ k: 'bad', t: m[5] });
      if (!m[0].length) break;
    }
    const items = [];
    const bad = [];
    let last = null;   // última predecesora, mientras le pueda seguir un tipo o un desfase
    for (const t of tok) {
      if (t.k === 'bad') { bad.push(t.t); last = null; continue; }
      if (t.k === 'lag') {
        if (last && last.type && last.lag === null) last.lag = t.v; else bad.push(t.t);
        last = null;
        continue;
      }
      const w = t.v;
      if (CODE[w] && !known.has(w)) {
        if (last && !last.type) last.type = CODE[w]; else { bad.push(t.t); last = null; }
        continue;
      }
      const glued = !known.has(w) && w.length > 2 && CODE[w.slice(-2)] && known.has(w.slice(0, -2)) ? w.slice(0, -2) : null;
      last = glued ? { id: glued, type: CODE[w.slice(-2)], lag: null } : { id: w, type: null, lag: null };
      items.push(last);
    }
    return { items, bad };
  }

  // Filas → proyecto con relaciones (plan §3). Errores con los códigos de core/project y badRel, dupRel, selfRel;
  // aviso ssLong (CC con desfase ≥ duración de la predecesora, con la FC equivalente; P7).
  function parse(rows) {
    const errors = [];
    const warnings = [];
    const items = [];
    const seen = new Set();
    (rows || []).forEach((r, i) => {
      if (isEmptyRow(r)) return;
      const id = normId(r.id);
      if (!ID_RE.test(id)) { errors.push({ code: 'badId', row: i, ids: [id] }); return; }
      if (RESERVED.has(id) || CODE[id]) { errors.push({ code: 'reservedId', row: i, ids: [id] }); return; }
      if (seen.has(id)) { errors.push({ code: 'duplicateId', row: i, ids: [id] }); return; }
      seen.add(id);
      const d = P.parseDuration(r.duration);
      if (d === null) errors.push({ code: 'badDuration', row: i, ids: [id] });
      items.push({ row: i, id, name: r.name == null ? '' : r.name, d, links: r.links });
    });
    if (items.length > MAX_ACTIVITIES) errors.push({ code: 'tooMany', ids: [] });

    const rels = [];
    for (const it of items) {
      const { items: got, bad } = readLinks(it.links, seen);
      if (bad.length) errors.push({ code: 'badRel', row: it.row, ids: [it.id], text: bad.join(' ') });
      const unknown = [...new Set(got.filter((x) => !seen.has(x.id)).map((x) => x.id))].sort(byId);
      if (unknown.length) errors.push({ code: 'unknownRef', row: it.row, ids: unknown });
      const mine = new Set();
      for (const x of got) {
        if (!seen.has(x.id)) continue;
        if (x.id === it.id) { errors.push({ code: 'selfRel', row: it.row, ids: [it.id] }); continue; }
        const type = x.type || 'FS';
        const key = `${x.id}>${type}`;
        if (mine.has(key)) { errors.push({ code: 'dupRel', row: it.row, ids: [x.id, it.id], type }); continue; }
        mine.add(key);
        rels.push({ from: x.id, to: it.id, type, lag: x.lag === null ? 0 : x.lag, row: it.row });
      }
    }
    if (rels.length > MAX_RELS) errors.push({ code: 'tooMany', ids: [] });
    const done = (e) => ({ project: null, report: { errors: sortIssues(e), warnings: [] } });
    if (errors.length) return done(errors);
    if (!items.length) return { project: null, report: { errors: [], warnings: [] } };

    const project = {
      activities: items.map((it) => ({ id: it.id, name: it.name, d: it.d })),
      rels: rels.map(({ from, to, type, lag }) => ({ from, to, type, lag })),
    };
    const topo = T.order(asGraph(project));
    if (topo.cycle) return done([{ code: 'cycle', ids: topo.cycle }]);
    const dOf = Object.fromEntries(items.map((it) => [it.id, it.d]));
    for (const r of rels) {
      if (r.type === 'SS' && r.lag >= dOf[r.from] - TOL) {
        warnings.push({ code: 'ssLong', row: r.row, ids: [r.from, r.to], lag: r.lag, equiv: rnd(r.lag - dOf[r.from]) });
      }
    }
    return { project, report: { errors: [], warnings: sortIssues(warnings) } };
  }

  function sortIssues(list) {
    return list.sort((a, b) => (a.row == null ? Infinity : a.row) - (b.row == null ? Infinity : b.row));
  }

  // Grafo de actividades (cualquier relación es un arco) para el orden topológico de core/topo.
  function asGraph(gp) {
    const preds = Object.fromEntries(gp.activities.map((a) => [a.id, []]));
    const succs = Object.fromEntries(gp.activities.map((a) => [a.id, []]));
    for (const r of gp.rels) {
      if (!preds[r.to].includes(r.from)) preds[r.to].push(r.from);
      if (!succs[r.from].includes(r.to)) succs[r.from].push(r.to);
    }
    return { activities: gp.activities, preds, succs };
  }

  // Pasadas sin redondeo, para las clases (P2) y para solve.
  function passes(gp, dOver) {
    const d = Object.fromEntries(gp.activities.map((a) => [a.id, a.d]));
    if (dOver) Object.assign(d, dOver);
    const order = T.order(asGraph(gp)).order;
    const into = Object.fromEntries(order.map((id) => [id, []]));
    const out = Object.fromEntries(order.map((id) => [id, []]));
    gp.rels.forEach((r, k) => { into[r.to].push(k); out[r.from].push(k); });
    const w = (r) => weight(r.type, d[r.from], d[r.to], r.lag);
    const ES = {};
    for (const id of order) ES[id] = Math.max(0, ...into[id].map((k) => ES[gp.rels[k].from] + w(gp.rels[k])));
    const Tdur = Math.max(...order.map((id) => ES[id] + d[id]));
    return { d, order, into, out, w, ES, T: Tdur };
  }

  // Tiempos, holguras, críticas, relaciones críticas, caminos, términos que mandan y clases (plan §3).
  function solve(gp, opts) {
    if (!gp || !gp.activities.length) throw new Error('gpr.solve: el proyecto está sin actividades');
    const pathLimit = (opts && opts.pathLimit) || 50;
    const pp = passes(gp);
    const { d, order, into, out, w } = pp;
    const ES = Object.fromEntries(order.map((id) => [id, rnd(pp.ES[id])]));
    const dur = rnd(pp.T);
    const LS = {};
    for (const id of [...order].reverse()) {
      LS[id] = rnd(Math.min(dur - d[id], ...out[id].map((k) => LS[gp.rels[k].to] - w(gp.rels[k]))));
    }
    const times = {};
    const floats = {};
    const binding = {};
    for (const id of order) {
      times[id] = { ES: ES[id], EF: rnd(ES[id] + d[id]), LS: LS[id], LF: rnd(LS[id] + d[id]) };
      const freeTerms = out[id].map((k) => ES[gp.rels[k].to] - ES[id] - w(gp.rels[k]));
      floats[id] = { TF: snap(LS[id] - ES[id]), FF: snap(Math.min(dur - ES[id] - d[id], ...freeTerms)) };
      const fwd = [{ from: START, rel: null, value: 0 }]
        .concat(into[id].map((k) => ({ from: gp.rels[k].from, rel: k, value: rnd(ES[gp.rels[k].from] + w(gp.rels[k])) })));
      const bwd = [{ to: END, rel: null, value: rnd(dur - d[id]) }]
        .concat(out[id].map((k) => ({ to: gp.rels[k].to, rel: k, value: rnd(LS[gp.rels[k].to] - w(gp.rels[k])) })));
      binding[id] = {
        fwd: fwd.map((t) => Object.assign(t, { chosen: Math.abs(t.value - ES[id]) < TOL })),
        bwd: bwd.map((t) => Object.assign(t, { chosen: Math.abs(t.value - LS[id]) < TOL })),
      };
    }
    const crit = new Set(order.filter((id) => floats[id].TF === 0));
    const critical = order.filter((id) => crit.has(id));
    const critRels = gp.rels.map((r, k) => k).filter((k) => {
      const r = gp.rels[k];
      return crit.has(r.from) && crit.has(r.to) && Math.abs(ES[r.from] + w(r) - ES[r.to]) < TOL;
    });
    // Caminos críticos: del Inicio (ES = 0) al Fin (EF = T) por actividades y relaciones críticas.
    const paths = [];
    const go = (id, acc, rl) => {
      if (paths.length >= pathLimit) return;
      if (Math.abs(times[id].EF - dur) < TOL) paths.push({ acts: acc, rels: rl });
      for (const k of critRels.filter((x) => gp.rels[x].from === id)) go(gp.rels[k].to, [...acc, gp.rels[k].to], [...rl, k]);
    };
    for (const id of critical) if (Math.abs(ES[id]) < TOL) go(id, [id], []);
    const end = order.filter((id) => Math.abs(times[id].EF - dur) < TOL);
    return {
      duration: dur, times, floats, critical, critRels, paths, binding, classes: classes(gp, critical),
      endBy: end, notFinal: end.filter((id) => out[id].length > 0),
    };
  }

  // Clase de Valls y Lino (2001) por el efecto de alargar y acortar δ (P2). Con d = 0, null.
  const DELTA = 1e-4;
  const CLASS = { '+-': 'normal', '-+': 'reverse', '00': 'neutral', '++': 'bicritical', '+0': 'incNormal', '0+': 'decReverse' };
  function classes(gp, critical) {
    const T0 = passes(gp).T;
    const sign = (x) => (x > DELTA / 2 ? '+' : x < -DELTA / 2 ? '-' : '0');
    const outc = {};
    for (const id of critical) {
      const d = gp.activities.find((a) => a.id === id).d;
      const up = sign(passes(gp, { [id]: d + DELTA }).T - T0);
      if (d < DELTA) { outc[id] = { cls: null, up, down: null }; continue; }
      const down = sign(passes(gp, { [id]: d - DELTA }).T - T0);
      outc[id] = { cls: CLASS[up + down] || null, up, down };
    }
    return outc;
  }

  // Traza paso a paso (plan §3) en el formato del reproductor: table → gprForward por actividad (términos: el Inicio y
  // cada relación que llega, con su tipo, desfase y valor; chosen con las claves de los que mandan: '@S' o 'r<índice>')
  // → gprEnd (T, quién lo marca y si no es final) → gprBackward (el Fin y cada relación que sale) → gprFloat (TF y FF)
  // → gprCritical → gprClasses. Cada valor va en reveals, para predict.
  function trace(gp, sol) {
    const s = sol || solve(gp);
    const order = T.order(asGraph(gp)).order;
    const rel = (k) => gp.rels[k];
    const steps = [{ kind: 'table', reveals: [] }];
    for (const id of order) {
      const terms = s.binding[id].fwd.map((t) => ({
        key: t.rel === null ? START : `r${t.rel}`, from: t.from, rel: t.rel,
        type: t.rel === null ? null : rel(t.rel).type, lag: t.rel === null ? null : rel(t.rel).lag, value: t.value }));
      steps.push({ kind: 'gprForward', act: id,
        reveals: [{ act: id, field: 'ES', value: s.times[id].ES }, { act: id, field: 'EF', value: s.times[id].EF }],
        formula: { op: 'max', terms, chosen: s.binding[id].fwd.map((t, i) => (t.chosen ? terms[i].key : null)).filter(Boolean) } });
    }
    steps.push({ kind: 'gprEnd', reveals: [{ act: END, field: 'T', value: s.duration }], endBy: s.endBy, notFinal: s.notFinal });
    for (const id of [...order].reverse()) {
      const terms = s.binding[id].bwd.map((t) => ({
        key: t.rel === null ? END : `r${t.rel}`, to: t.to, rel: t.rel,
        type: t.rel === null ? null : rel(t.rel).type, lag: t.rel === null ? null : rel(t.rel).lag, value: t.value }));
      steps.push({ kind: 'gprBackward', act: id,
        reveals: [{ act: id, field: 'LF', value: s.times[id].LF }, { act: id, field: 'LS', value: s.times[id].LS }],
        formula: { op: 'min', terms, chosen: s.binding[id].bwd.map((t, i) => (t.chosen ? terms[i].key : null)).filter(Boolean) } });
    }
    for (const f of ['TF', 'FF']) {
      steps.push({ kind: 'gprFloat', float: f, reveals: order.map((id) => ({ act: id, field: f, value: s.floats[id][f] })) });
    }
    steps.push({ kind: 'gprCritical', reveals: [], critical: s.critical, critRels: s.critRels, paths: s.paths });
    steps.push({ kind: 'gprClasses', reveals: [], classes: s.classes });
    return steps;
  }

  // «¿Y si…?» (AC11): la misma red con otra duración para una actividad; el proyecto de partida no cambia.
  function whatIf(gp, id, d) {
    if (!gp.activities.some((a) => a.id === id)) throw new Error(`gpr.whatIf: no existe la actividad «${id}»`);
    if (!(Number.isFinite(d) && d >= 0)) throw new Error('gpr.whatIf: duración no válida');
    const before = solve(gp);
    const next = Object.assign({}, gp, { activities: gp.activities.map((a) => (a.id === id ? Object.assign({}, a, { d }) : a)) });
    const sol = solve(next);
    const changed = next.activities.map((a) => a.id).filter((x) => ['ES', 'LS', 'EF', 'LF']
      .some((f) => Math.abs(sol.times[x][f] - before.times[x][f]) > TOL));
    return { gp: next, sol, before: before.duration, after: sol.duration, delta: rnd(sol.duration - before.duration), changed };
  }

  // Proyecto de core/project cuando todas las relaciones son FS+0 (para comparar con core/cpm, AC2); si no, null.
  function toCpm(gp) {
    if (gp.rels.some((r) => r.type !== 'FS' || r.lag !== 0)) return null;
    const g = asGraph(gp);
    for (const id of Object.keys(g.preds)) { g.preds[id].sort(byId); g.succs[id].sort(byId); }
    return { activities: gp.activities.map((a) => ({ id: a.id, name: a.name, d: a.d })), preds: g.preds, succs: g.succs };
  }

  // Escritura de una relación para la tabla, la URL o la pantalla: «B», «B SS+2», «B FF-1.5» (lang 'es': «B CC+2»).
  function format(rel, lang) {
    const type = lang === 'es' ? ES_NAME[rel.type] : rel.type;
    if (rel.type === 'FS' && rel.lag === 0) return rel.from;
    if (rel.lag === 0) return `${rel.from} ${type}`;
    const lag = String(Math.abs(rel.lag));
    return `${rel.from} ${type}${rel.lag < 0 ? '-' : '+'}${lang === 'es' ? lag.replace('.', ',') : lag}`;
  }

  // Filas de la tabla (predecesoras escritas) a partir de un proyecto con relaciones.
  function toRows(gp, lang) {
    return gp.activities.map((a) => ({
      id: a.id, name: a.name, duration: String(a.d),
      links: gp.rels.filter((r) => r.to === a.id).map((r) => format(r, lang)).join(', '),
    }));
  }

  const api = { MAX_ACTIVITIES, MAX_RELS, TYPES, ES_NAME, CODE, DELTA, weight, readLinks, parse, solve, classes, trace, whatIf, toCpm, format, toRows };
  root.PNL = root.PNL || {};
  root.PNL.gpr = api;
  if (isNode) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
