/*
 * rs — controlador de la vista de recursos (spec f5c-recursos; plan §4, P1, P12, P13; tableros 130, 131 y 139).
 * T009: la barra (extensión, proyecto, «Partir del taller» y, en la segunda fila, el modo), la tabla del proyecto (de solo
 * lectura en los ejemplos, con un uso por recurso y, con recursos limitados, sus disponibilidades; editable con «Tabla
 * propia», con el error o el aviso de cada fila) y los recursos de la tabla propia. El Gantt con perfiles y la nivelación
 * (T010), los recursos limitados (T011), el paso a paso (T012) y «Aprende más» (T013) llegan con sus tareas. Hasta T014 la
 * vista solo se abre por enlace (v=rs).
 *
 * La parte sin DOM (source, resources, model, resRows, resFromRows, issueText, rowMarks, workRows, pasteRows) se prueba
 * en Node (tests/rs-tab.test.js); create() pinta la vista. Para las pruebas de navegador, PNL.rsTab.state() da lo pintado.
 */
(function (root) {
  'use strict';

  const isNode = typeof module !== 'undefined' && module.exports;
  const req = (path, name) => (isNode ? require(path) : root.PNL[name]);
  const I = req('./i18n.js', 'i18n');
  if (isNode) require('./i18n-rs.js');
  const R = req('./core/resource.js', 'resource');
  const X = req('./core/resex.js', 'resex');
  const U = req('./core/urlstate.js', 'urlstate');
  const NR = req('./narrate.js', 'narrate');
  const PRD = () => req('./predict.js', 'predict');

  const USE = ['r1', 'r2', 'r3'];
  const FIELDS = ['id', 'name', 'links', 'd', 'r1', 'r2', 'r3'];
  // Campos de la fila que señala cada código de core/resource (los de uso, según el recurso: is.res).
  const FIELD = { badId: ['id'], reservedId: ['id'], duplicateId: ['id'], unknownRef: ['links'], badDuration: ['d'] };
  const str = (v) => (v == null ? '' : String(v));
  const blank = () => ({ id: '', name: '', links: '', d: '', r1: '', r2: '', r3: '' });

  // ---------- El proyecto ----------

  /** El proyecto de la vista: la tabla propia (como la escribe el alumno) o un ejemplo de core/resex. */
  function source(state, lang) {
    if (state.we === 'own' && state.wt) {
      return { kind: 'own', id: 'own', rows: state.wt.map((r) => Object.fromEntries(FIELDS.map((f) => [f, str(r[f])]))), title: I.t(lang, 'rs.own'),
        unit: '', source: '', mode: 'lev', res: [] };
    }
    const ex = X.get(state.we) || X.get('k81');
    return { kind: 'example', id: ex.id, rows: ex.rows.map((r) => Object.assign(blank(), Object.fromEntries(Object.entries(r).map(([k, v]) => [k, str(v)])))),
      title: ex.title[lang], unit: ex.unit[lang], source: ex.source[lang], mode: ex.mode, res: ex.res };
  }

  /**
   * Los recursos que valen: los de wr (con un nombre vacío, el del ejemplo o «Recurso n») o, si no hay, los del ejemplo
   * (con la tabla propia, uno sin límite). label: el nombre que se enseña; cap: la disponibilidad (null, sin límite).
   */
  function resources(state, src, lang) {
    const def = (k) => (src.res[k] ? src.res[k].name[lang] : I.t(lang, 'rs.res.n', { n: k + 1 }));
    const list = state.wr ? state.wr : src.res.length ? src.res.map((r) => ({ name: '', cap: r.cap })) : [{ name: '', cap: null }];
    return list.map((r, k) => ({ name: str(r.name), cap: r.cap == null || r.cap === '' ? null : Number(r.cap), label: str(r.name).trim() || def(k) }));
  }

  /** Lo que pinta la vista: la fuente, el modo, los recursos, el proyecto leído (o null), sus errores y sus avisos. */
  function model(state, lang) {
    const src = source(state, lang);
    const mode = state.wm || src.mode || 'lev';
    const res = resources(state, src, lang);
    const { project, report } = R.parse(src.rows, res.map((r) => ({ name: r.label, cap: r.cap == null ? '' : String(r.cap) })), mode);
    const m = { src, mode, res, p: project, report, empty: !project && !report.errors.length };
    m.walk = walkCfg(m, state);
    return m;
  }

  // ---------- La nivelación (T010; tableros 131–134) ----------

  const LEV = ['es', 'ls', 'man', 'bur', 'min'];
  const ESof = (p) => Object.fromEntries(p.activities.map((a) => [a.id, p.times[a.id].ES]));
  const LSof = (p) => Object.fromEntries(p.activities.map((a) => [a.id, p.times[a.id].LS]));
  const pkey = (p) => JSON.stringify([p.table, p.activities.map((a) => [a.id, a.d, a.r, p.preds[a.id]]), p.res]);

  /** El recurso que se nivela: wk, si el proyecto lo tiene; si no, el primero. */
  const levelK = (m, state) => (Number.isInteger(state.wk) && state.wk < m.res.length ? state.wk : 0);

  /** Pico, suma de cuadrados y trabajo del recurso k en el calendario S, en los periodos de 1 a T (al nivelar, T del CPM). */
  const stats = (m, S, k) => R.stats(R.profile(m.p, S, k, Math.max(m.p.T, ...m.p.activities.map((a) => S[a.id] + a.d))));

  let levCache = { key: null, val: null };
  /**
   * Temprano, tardío, Burgess y mínimo del pico del recurso k (el mínimo, con su cota y si está demostrado). Se guarda el
   * último: cambiar de calendario o de idioma no lo recalcula. budget: el tope de la búsqueda (las pruebas lo bajan).
   */
  function levData(m, k, budget) {
    const key = JSON.stringify([pkey(m.p), k, budget == null ? null : budget]);
    if (levCache.key === key) return levCache.val;
    const b = R.burgess(m.p, k);
    const val = { es: ESof(m.p), ls: LSof(m.p), bur: { S: b.S, passes: b.passes }, min: R.minPeak(m.p, k, budget) };
    levCache = { key, val };
    return val;
  }

  /**
   * ¿Se puede mover id a s en el calendario S (P3)? Entre su comienzo temprano y su tardío (window); sin empezar antes de
   * que acabe una predecesora (pred) ni acabar después de que empiece una sucesora (succ), que no se arrastran.
   */
  function moveCheck(m, S, id, s) {
    const t = m.p.times[id];
    if (s < t.ES || s > t.LS) return { ok: false, reason: 'window', id, lo: t.ES, hi: t.LS };
    const c = R.check(m.p, Object.assign({}, S, { [id]: s }), 'lev', id);
    if (c.ok) return { ok: true };
    const [x, y] = c.ids;
    // pred: [predecesora, id]; succ: [id, sucesora].
    if (c.reason === 'pred') return { ok: false, reason: 'pred', id, other: x, end: S[x] + m.p.byId[x].d, start: s };
    return { ok: false, reason: 'succ', id, other: y, end: s + m.p.byId[id].d, start: S[y] };
  }
  /** El motivo de un movimiento que no se aplica. */
  const moveText = (c, lang) => I.t(lang, `rs.manual.bad.${c.reason}`, c);
  /** El calendario a mano: el temprano con los movimientos de wq, en orden; los que ya no valen se descartan sin aviso. */
  function manual(m, wq) {
    const S = ESof(m.p); const moves = [];
    for (const [id, s] of wq || []) {
      if (!m.p.byId[id] || s === S[id] || !moveCheck(m, S, id, s).ok) continue;
      S[id] = s; moves.push([id, s]);
    }
    return { S, moves };
  }
  /** La lista de movimientos con id en s (si vuelve a su comienzo temprano, sale de la lista). */
  function withMove(m, moves, id, s) {
    const out = moves.filter(([x]) => x !== id);
    if (s !== m.p.times[id].ES) out.push([id, s]);
    return out;
  }

  /** El calendario que se ve: wc (al nivelar, uno de los cinco; si no, el temprano) con su calendario S. */
  function calendar(m, state) {
    const wc = LEV.includes(state.wc) ? state.wc : 'es';
    if (wc === 'man') return Object.assign({ wc }, manual(m, state.wq));
    const lv = wc === 'bur' || wc === 'min' ? levData(m, levelK(m, state)) : null;
    const S = wc === 'es' ? ESof(m.p) : wc === 'ls' ? LSof(m.p) : lv[wc].S;
    return { wc, S, info: lv ? lv[wc] : null };
  }

  /** La comparación de los cinco calendarios: pico, suma de cuadrados y trabajo de cada recurso en cada uno. */
  function compareRows(m, state) {
    const lv = levData(m, levelK(m, state)); const man = manual(m, state.wq);
    const cals = { es: lv.es, ls: lv.ls, man: man.S, bur: lv.bur.S, min: lv.min.S };
    return LEV.map((cal) => ({ cal, stats: m.res.map((_, j) => stats(m, cals[cal], j)), info: cal === 'bur' ? lv.bur : cal === 'min' ? lv.min : null,
      untouched: cal === 'man' && !man.moves.length }));
  }


  // ---------- Recursos limitados (T011; tableros 135, 138 y 140) ----------

  const LIM = ['sgs', 'opt', 'man'];
  const SCHEME = { sf: { scheme: 's', dir: 'f' }, sb: { scheme: 's', dir: 'b' }, pf: { scheme: 'p', dir: 'f' }, pb: { scheme: 'p', dir: 'b' } };
  let limCache = { key: null, val: null };
  /** La cota de Baker, el óptimo (con su tope) y la comparación de las 7 reglas × 4 esquemas; se guarda la última. */
  function limData(m, budget) {
    const key = JSON.stringify([pkey(m.p), budget == null ? null : budget]);
    if (limCache.key === key) return limCache.val;
    const val = { bound: R.baker(m.p), opt: R.optimum(m.p, budget), cmp: R.compare(m.p) };
    limCache = { key, val };
    return val;
  }

  /** ¿Se puede colocar id en s con lo ya colocado (P3, C2)? Sus predecesoras colocadas y acabadas, sin adelantar a una sucesora colocada y sin pasar de lo disponible. */
  function placeCheck(m, S, id, s) {
    const c = R.check(m.p, Object.assign({}, S, { [id]: s }), 'lim', id);
    if (c.ok) return { ok: true };
    if (c.reason === 'unplaced') return { ok: false, reason: 'unplaced', id, other: c.ids[0] };
    if (c.reason === 'pred') { const x = c.ids[0]; return { ok: false, reason: 'pred', id, other: x, end: S[x] + m.p.byId[x].d, start: s }; }
    if (c.reason === 'succ') { const y = c.ids[1]; return { ok: false, reason: 'succ', id, other: y, end: s + m.p.byId[id].d, start: S[y] }; }
    return { ok: false, reason: 'over', id, res: c.res, period: c.period, use: c.use, cap: c.cap };
  }
  /** El motivo de una colocación que no se hace (con el nombre del recurso, en minúscula, si se pasa de lo disponible). */
  const placeText = (c, lang, m) => I.t(lang, `rs.place.bad.${c.reason}`, Object.assign({}, c, c.reason === 'over' ? { res: m.res[c.res].label.toLowerCase() } : {}));
  /** El calendario a mano con recursos limitados (C2): empieza vacío; las colocaciones de wq, en orden; las que ya no valen se descartan. */
  function manualLim(m, wq) {
    const S = {}; const moves = [];
    for (const [id, s] of wq || []) {
      if (!m.p.byId[id] || id in S || !placeCheck(m, S, id, s).ok) continue;
      S[id] = s; moves.push([id, s]);
    }
    const complete = moves.length === m.p.activities.length;
    return { S, moves, complete, T: complete ? Math.max(0, ...m.p.activities.map((a) => S[a.id] + a.d)) : null };
  }
  /** La lista de colocaciones con id en s (s = null: se quita). */
  function withPlace(moves, id, s) {
    const i = moves.findIndex(([x]) => x === id);
    if (s == null) return moves.filter(([x]) => x !== id);
    if (i < 0) return moves.concat([[id, s]]);
    return moves.map((x, j) => (j === i ? [id, s] : x));
  }

  /** El calendario que se ve con recursos limitados: el de la regla (esquema y sentido; también con wc de la nivelación), el óptimo o a mano, con su duración y sus cadenas críticas. */
  function limCalendar(m, state) {
    const wc = LIM.includes(state.wc) ? state.wc : 'sgs';
    if (wc === 'man') { const x = manualLim(m, state.wq); return Object.assign({ wc, chains: x.complete ? R.chains(m.p, x.S, 'f') : [] }, x); }
    if (wc === 'opt') { const o = limData(m).opt; return { wc, S: o.S, T: o.T, chains: R.chains(m.p, o.S, 'f'), info: o }; }
    const sc = SCHEME[state.ws] || SCHEME.sf; const rule = R.RULES.includes(state.wp) ? state.wp : 'slk';
    const r = R.sgs(m.p, Object.assign({ rule }, sc));
    return { wc, S: r.S, T: r.T, chains: R.chains(m.p, r.S, sc.dir), scheme: sc, rule };
  }
  /** Las marcas de la cadena crítica en la ROY: sus actividades, los arcos que siguen una precedencia y las esperas por un recurso. */
  function chainMarks(m, chains) {
    const nodes = new Set(); const edges = new Set(); const waits = []; const seen = new Set();
    for (const c of chains) {
      c.forEach((id, i) => {
        nodes.add(id);
        if (!i) return;
        const u = c[i - 1]; const k = `${u}>${id}`;
        if (m.p.preds[id].includes(u)) edges.add(k); else if (!seen.has(k)) { seen.add(k); waits.push([u, id]); }
      });
    }
    return { nodes, edges, waits };
  }

  // ---------- El paso a paso (T012; tableros 133, 136 y 137; plan P9) ----------

  /**
   * Qué se reproduce en el paso a paso: Burgess del recurso que se nivela, al nivelar con el calendario «Burgess»; con
   * recursos limitados y el calendario de la regla, su esquema, su sentido y su regla. Con otro calendario, nada (null).
   */
  function walkCfg(m, state) {
    if (!m.p) return null;
    if (m.mode === 'lev') return (LEV.includes(state.wc) ? state.wc : 'es') === 'bur' ? { kind: 'bur', k: levelK(m, state) } : null;
    if (m.mode !== 'lim' || (LIM.includes(state.wc) ? state.wc : 'sgs') !== 'sgs') return null;
    const sc = SCHEME[state.ws] || SCHEME.sf;
    return { kind: 'sgs', scheme: sc.scheme, dir: sc.dir, rule: R.RULES.includes(state.wp) ? state.wp : 'slk' };
  }

  let trCache = { key: null, val: null };
  /**
   * La traza del reproductor (resource.trace) con lo que hace falta para enseñarla: cfg (lo que se reproduce) y q, la red
   * en la que se programa (hacia atrás, la red al revés: las sucesoras pasan a ser predecesoras). null sin paso a paso.
   */
  function trace(m) {
    if (!m.p || !m.walk) return null;
    const key = JSON.stringify([pkey(m.p), m.walk]);
    if (trCache.key !== key) {
      const val = R.trace(m.p, m.walk);
      val.cfg = m.walk;
      val.q = m.walk.dir === 'b' ? Object.assign({}, m.p, { preds: m.p.succs, succs: m.p.preds }) : m.p;
      trCache = { key, val };
    }
    return trCache.val;
  }

  // Las columnas de la prioridad de cada regla (las de core/resource.RULES): sign −1 si la clave va de mayor a menor
  // (más recursos y ACTIM se guardan con el signo cambiado para ordenar de menor a mayor).
  const KEYS = { slk: [['tf', 1], ['ls', 1]], lft: [['lf', 1], ['tf', 1]], spt: [['d', 1]], res: [['use', -1]], act: [['path', -1]], esf: [['es', 1]], lsf: [['ls', 1]] };
  /** Las columnas de la prioridad de la regla, con el sentido en que se leen. */
  const keyCols = (rule) => (KEYS[rule] || KEYS.slk).map(([k, sign]) => ({ k, sign }));
  const keyLabel = (c, lang) => I.t(lang, `rs.walk.key.${c.k}`);
  /** El primer componente de la prioridad en que difieren a y b: su nombre y los dos valores como se leen. */
  function keyDiff(rule, a, b, lang) {
    const cols = keyCols(rule);
    const i = Math.max(0, a.findIndex((v, j) => v !== b[j]));
    const c = cols[i] || cols[0];
    return { label: keyLabel(c, lang).toLowerCase(), va: NR.fmt(lang, c.sign * a[i]), vb: NR.fmt(lang, c.sign * b[i]) };
  }

  /**
   * Lo que enseña el paso k: el calendario (antes del paso mientras se predice; si no, después), la actividad marcada,
   * el instante del paralelo (now), el horizonte del dibujo y si va en el tiempo de la red al revés (back).
   */
  function walkView(m, tr, k, hide) {
    const step = tr[k]; const prev = tr[k - 1];
    if (tr.cfg.kind === 'bur') {
      return { S: (hide ? prev : step).S, sel: step.kind === 'rsMove' ? step.id : null, T: m.p.T, now: null, back: false };
    }
    const end = tr[tr.length - 1];
    const S = hide ? (prev.kind === 'rsTable' ? {} : prev.S) : step.S;
    return { S, sel: step.kind === 'rsPick' && !hide ? step.id : null, T: Math.max(m.p.T, end.T), now: step.kind === 'rsTime' ? step.t : null,
      back: tr.cfg.dir === 'b' && step.kind !== 'rsEnd' };
  }

  /** El nombre de un recurso en minúscula, para el medio de una frase. */
  const resLow = (m, k) => m.res[k].label.toLowerCase();

  /**
   * Lo que se le dice al alumno al comprobar el paso k: en el esquema serie, la actividad elegida y su comienzo; en
   * Burgess, el comienzo; en el paralelo, las que empiezan. Cada mensaje: { kind: ok | wrong, text }.
   */
  function feedback(m, tr, k, answers, lang) {
    const t = (key, q) => I.t(lang, `rs.walk.${key}`, q);
    const num = (v) => NR.fmt(lang, v);
    const step = tr[k]; const rule = tr.cfg.rule; const out = [];
    const ok = (text) => out.push({ kind: 'ok', text });
    const bad = (text) => out.push({ kind: 'wrong', text });
    const startOf = (key) => { const v = PRD().parseAnswer(answers.get(key)); return v; };
    if (step.kind === 'rsMove') {
      const c = step.reveals[0].check; const v = startOf('rs.start');
      if (v === null) bad(t('burEmpty', { id: step.id, to: num(step.to) }));
      else if (!Number.isInteger(v)) bad(t('startNum', { start: num(step.to) }));
      else {
        const r = R.startCheck(c, v);
        if (r.ok) ok(t('burOk', { s: num(v), ssq: num(step.after) }) + (v !== step.to ? ` ${t('burOkTie', { to: num(step.to) })}` : ''));
        else if (r.reason === 'window') bad(t('burWindow', { id: step.id, lo: num(r.window[0]), hi: num(r.window[1]) }));
        else bad(t('burSsq', { s: num(v), ssq: num(r.ssq), best: num(r.best) }));
      }
      return out;
    }
    if (step.kind === 'rsPick') {
      const pc = step.reveals[0].check; const sc = step.reveals[1].check;
      const given = answers.get('rs.pick');
      if (!given) bad(t('emptyPick'));
      else {
        const r = R.pickCheck(pc, given);
        const keyOf = (id) => pc.elig.find((x) => x.id === id).key;
        if (r.ok) {
          const tied = pc.elig.filter((x) => x.id !== given && x.key.join() === keyOf(given).join()).map((x) => x.id);
          ok(given === step.id ? t('pickOk', { id: given }) : t('pickOkTie', { id: given, list: I.list(lang, tied), chosen: step.id }));
        } else if (r.reason === 'notElig') {
          const miss = tr.q.preds[given].filter((x) => pc.all.includes(x));
          bad(t(miss.length === 1 ? 'pickNotEligOne' : 'pickNotElig', { id: given, list: I.list(lang, miss) }));
        } else {
          const d = keyDiff(rule, keyOf(r.best[0]), keyOf(given), lang);
          bad(t(r.best.length === 1 ? 'pickLower' : 'pickLowerMany', { best: I.list(lang, r.best), id: given, label: d.label, vb: d.va, vg: d.vb }));
        }
      }
      const v = startOf('rs.start');
      if (v === null) bad(t('startEmpty', { start: num(step.start) }));
      else if (!Number.isInteger(v)) bad(t('startNum', { start: num(step.start) }));
      else {
        const r = R.startCheck(sc, v);
        if (r.ok) ok(t('startOk', { id: step.id, start: num(step.start) }));
        else if (r.reason === 'preds') bad(t('startPreds', { id: step.id, ready: num(r.ready) }));
        else if (r.reason === 'over') bad(t('startOver', { s: num(v), period: num(r.period), use: num(r.use), res: resLow(m, r.res), cap: num(r.cap) }));
        else bad(t('startLater', { id: step.id, start: num(r.start) }));
      }
      return out;
    }
    if (step.kind === 'rsTime' && step.reveals.length) {
      const c = step.reveals[0].check;
      const given = answers.get('rs.set');
      if (!given || !given.size) { bad(t('emptySet')); return out; }
      const ids = c.elig.map((x) => x.id).filter((id) => given.has(id)).concat([...given].filter((id) => !c.elig.some((x) => x.id === id)));
      const r = R.setCheck(c, ids);
      const keyOf = (id) => c.elig.find((x) => x.id === id).key;
      if (r.ok) ok(t(ids.length === 1 ? 'setOkOne' : 'setOk', { list: I.list(lang, ids) }));
      else if (r.reason === 'notElig') bad(t('setNotElig', { list: I.list(lang, r.ids), t: num(c.t) }));
      else if (r.reason === 'over') bad(t('setOver', { list: I.list(lang, ids), period: num(r.period), use: num(r.use), res: resLow(m, r.res), cap: num(r.cap) }));
      else if (r.reason === 'missing') bad(t('setMissing', { id: r.id, t: num(c.t) }));
      else if (r.ids.length) { const d = keyDiff(rule, keyOf(r.ids[0]), keyOf(r.ids[1]), lang); bad(t('setLower', { a: r.ids[0], b: r.ids[1], label: d.label, va: d.va, vb: d.vb })); }
      else bad(t('setLowerAny'));
    }
    return out;
  }

  // ---------- Los recursos de la tabla propia (tablero 139) ----------

  /** Las tres filas del editor de recursos, con lo escrito (texto). */
  function resRows(state) {
    const wr = state.wr || [];
    return [0, 1, 2].map((k) => (wr[k] ? { name: str(wr[k].name), cap: wr[k].cap == null ? '' : str(wr[k].cap) } : { name: '', cap: '' }));
  }
  /** Lo escrito en el editor → la lista para wr: sin los recursos sin nombre del final (el primero siempre cuenta). */
  function resFromRows(rows) {
    let n = 1;
    rows.forEach((r, k) => { if (k > 0 && str(r.name).trim()) n = k + 1; });
    return rows.slice(0, n).map((r) => ({ name: str(r.name), cap: str(r.cap) }));
  }

  // ---------- Errores y avisos ----------

  /** El texto de un error o un aviso de la tabla, sin «Fila n» (va en su fila, o en la lista si no tiene fila). k: el recurso. */
  function issueText(is, lang, m, k) {
    const ids = (is.ids || []).join(', ');
    if (is.code === 'cycle') return I.t(lang, 'issue.cycle', { ids });
    if (is.code === 'badUse' || is.code === 'overCap') {
      const row = m.src.rows[is.row] || {};
      return I.t(lang, `rs.issue.${is.code}`, { res: m.res[k].label, use: str(row[USE[k]]).trim(), cap: m.res[k].cap });
    }
    return I.t(lang, `rs.issue.${is.code}`, Object.assign({}, is, { ids }));
  }

  /** Marcas de la tabla propia: por fila, los campos con error, los avisos, los hitos y sus textos; aparte, los errores sin fila. */
  function rowMarks(m, lang) {
    const rows = new Map();
    const general = [];
    const at = (i) => { if (!rows.has(i)) rows.set(i, { bad: new Set(), warn: new Set(), msgs: [] }); return rows.get(i); };
    const K = m.res.length;
    for (const is of m.report.errors) {
      if (is.row == null) { general.push(issueText(is, lang, m, 0)); continue; }
      const r = at(is.row);
      if (is.code === 'badUse' || is.code === 'overCap') {
        for (const k of is.res) { r.bad.add(USE[k]); r.msgs.push({ kind: 'err', text: issueText(is, lang, m, k) }); }
        continue;
      }
      for (const f of FIELD[is.code] || []) r.bad.add(f);
      r.msgs.push({ kind: 'err', text: issueText(is, lang, m, 0) });
    }
    for (const is of m.report.warnings) {
      if (is.code !== 'noUse') continue;   // los avisos de core/project (redundancias) no se enseñan aquí
      const r = at(is.row);
      for (const f of USE.slice(0, K)) r.warn.add(f);
      r.msgs.push({ kind: 'warn', text: issueText(is, lang, m, 0) });
    }
    // Un hito (duración 0) no es un error ni un aviso: se dice en su fila.
    m.src.rows.forEach((row, i) => {
      if (str(row.d).trim() === '0' && str(row.id).trim()) at(i).msgs.push({ kind: 'info', text: I.t(lang, 'rs.issue.milestone') });
    });
    const badRows = [...rows.entries()].filter(([, r]) => r.bad.size).map(([i]) => i).sort((a, b) => a - b)
      .map((i) => str(m.src.rows[i].id).trim().toUpperCase() || String(i + 1));
    return { rows, general, badRows };
  }

  // ---------- Entradas ----------

  /** «Partir del taller» (AC9): las filas del taller tal cual; el store las pasa a la tabla de la vista. */
  const workRows = (rows) => rows.map((r) => ({ id: str(r.id), name: str(r.name), duration: str(r.duration), links: str(r.links) }));

  /** Filas pegadas de una hoja de cálculo: actividad, nombre, predecesoras, duración y un uso por recurso (K), con tabuladores o punto y coma. */
  function pasteRows(text, K) {
    const lines = str(text).split(/\r?\n/).filter((l) => l.trim());
    if (!lines.length) return [];
    const sep = lines.some((l) => l.includes('\t')) ? '\t' : ';';
    const cols = FIELDS.slice(0, 4 + K);
    const out = lines.map((l) => { const c = l.split(sep).map((x) => x.trim()); return Object.assign(blank(), Object.fromEntries(cols.map((f, i) => [f, c[i] || '']))); });
    // Una primera fila de cabeceras (sin cifras en la duración) se salta.
    if (out.length && !/^\d/.test(out[0].d) && /[a-zá-ú]/i.test(out[0].d)) out.shift();
    return out;
  }

  // ---------- La vista ----------

  function create(container, hooks) {
    const { h, clear } = root.PNL.dom;
    const lang = () => hooks.lang();
    const state = () => hooks.state();
    const tr = (k, p) => I.t(lang(), `rs.${k}`, p);
    const num = (v) => NR.fmt(lang(), v);
    let m = null;
    const go = (action, opts) => hooks.dispatch(Object.assign({ type: 'rs' }, action), opts);
    const walking = () => !!(m && m.p && m.walk) && state().step > 0 && !!trace(m);

    function focus(id) { const el = root.document.getElementById(id); if (el) el.focus(); }
    function keepFocus(fn) {
      const a = root.document.activeElement;
      const id = a && container.contains(a) ? a.id : null;
      fn();
      if (id) { const el = root.document.getElementById(id); if (el) el.focus(); }
    }
    const button = (label, onclick, attrs) => h('button', Object.assign({ type: 'button', class: 'ghost', onclick }, attrs || {}), [label]);

    // ---------- Barra (tablero 130): dos filas ----------
    function bar() {
      const sel = h('select', { id: 'rsProj', onchange: (e) => pickProject(e.target.value) },
        X.list().map((ex) => h('option', { value: ex.id, selected: m.src.id === ex.id }, [ex.title[lang()]]))
          .concat([h('option', { value: 'own', selected: m.src.kind === 'own' }, [tr('own')])]));
      const mode = (k) => h('button', { type: 'button', class: 'ghost', id: `rsMode-${k}`, 'aria-pressed': String(m.mode === k),
        onclick: () => { if (m.mode !== k) stay({ wm: k }); focus(`rsMode-${k}`); } }, [tr(`mode.${k}`)]);
      return h('div', { class: 'card rs-bar' }, [
        h('div', { class: 'rs-row' }, [
          hooks.ext ? hooks.ext('rs') : null,
          h('label', { class: 'rs-field' }, [tr('project'), ' ', sel]),
          button(tr('fromWork'), fromWork, { id: 'rsFromWork' }),
          h('span', { class: 'rs-push' }),
          // «Paso a paso» (T012): del paso 1 en adelante; si el calendario no tiene paso a paso, pasa al de Burgess o al de la regla.
          h('div', { class: 'seg' }, [h('button', { type: 'button', class: 'ghost', id: 'rsWalk', 'aria-pressed': String(walking()), disabled: !m.p, onclick: toggleWalk }, [tr('walk.toggle')])]),
        ]),
        h('div', { class: 'rs-row' }, [
          h('div', { class: 'seg rs-mode', role: 'group', 'aria-label': tr('mode.label') }, [mode('lev'), mode('lim')]),
          // Nivelar (T010): el recurso que se nivela y el calendario.
          m.mode === 'lev' ? h('label', { class: 'rs-field' }, [tr('bar.res'), ' ', h('select', { id: 'rsRes', disabled: !m.p,
            onchange: (e) => { stay({ wk: Number(e.target.value) }); focus('rsRes'); } },
            m.res.map((r, k) => h('option', { value: String(k), selected: k === levelK(m, state()) }, [r.label])))]) : null,
          m.mode === 'lev' ? h('label', { class: 'rs-field' }, [tr('bar.cal'), ' ', h('select', { id: 'rsCal', disabled: !m.p,
            onchange: (e) => { bad = null; stay({ wc: e.target.value }); focus('rsCal'); } },
            LEV.map((k) => h('option', { value: k, selected: k === levCal() }, [tr(`cals.${k}`)])))]) : null,
          // Recursos limitados (T011): el calendario y, con el de la regla, el esquema y la regla.
          m.mode === 'lim' ? h('label', { class: 'rs-field' }, [tr('bar.cal'), ' ', h('select', { id: 'rsCal', disabled: !m.p,
            onchange: (e) => { bad = null; stay({ wc: e.target.value }); focus('rsCal'); } },
            LIM.map((k) => h('option', { value: k, selected: k === limCal() }, [tr(`cals.${k}`)])))]) : null,
          m.mode === 'lim' && limCal() === 'sgs' ? h('label', { class: 'rs-field' }, [tr('bar.scheme'), ' ', h('select', { id: 'rsScheme', disabled: !m.p,
            onchange: (e) => { stay({ ws: e.target.value }); focus('rsScheme'); } },
            Object.keys(SCHEME).map((k) => h('option', { value: k, selected: k === schemeOf() }, [tr(`schemes.${k}`)])))]) : null,
          m.mode === 'lim' && limCal() === 'sgs' ? h('label', { class: 'rs-field' }, [tr('bar.rule'), ' ', h('select', { id: 'rsRule', disabled: !m.p,
            onchange: (e) => { stay({ wp: e.target.value }); focus('rsRule'); } },
            R.RULES.map((k) => h('option', { value: k, selected: k === ruleOf(), title: tr(`rules.${k}`) }, [tr(`rulesShort.${k}`)])))]) : null,
          walking() ? h('span', { class: 'rs-push' }) : null,
          walking() ? h('label', { class: 'rs-check' }, [h('input', { type: 'checkbox', id: 'rsPred', checked: !!state().pred,
            onchange: (e) => { hooks.dispatch({ type: 'set', key: 'pred', value: e.target.checked ? 1 : 0 }); focus('rsPred'); } }), ' ', I.t(lang(), 'predict.toggle')]) : null,
        ]),
        walking() ? player() : null,
      ]);
    }
    // Un cambio en la barra durante el paso a paso sigue en el paso a paso (paso 1) si lo nuevo también lo tiene.
    function stay(action) {
      const was = walking();
      go(action, { push: true });
      if (was && m.p && trace(m)) hooks.dispatch({ type: 'go', n: 1 });
    }
    function toggleWalk() {
      if (walking()) hooks.dispatch({ type: 'go', n: 0 });
      else {
        if (!trace(m)) go({ wc: m.mode === 'lim' ? 'sgs' : 'bur' }, { push: true });
        hooks.dispatch({ type: 'go', n: 1 });
      }
      focus('rsWalk');
    }
    function pickProject(id) {
      if (id === 'own' && !state().wt) { hooks.dispatch({ type: 'rsTable', rows: [Object.assign(blank(), { id: 'A' })] }, { push: true }); focus('rsProj'); return; }
      go({ we: id }, { push: true });
    }
    function fromWork() {
      const w = hooks.workRows();
      hooks.dispatch({ type: 'rsFromWork', rows: workRows(w.rows), mode: w.mode }, { push: true });
      if (hooks.announce) hooks.announce(tr('fromWorkDone'));
      focus('rsProj');
    }

    // Las disponibilidades (con recursos limitados).
    const capsLine = () => (m.mode === 'lim' ? h('p', { class: 'small rs-caps', id: 'rsCaps' }, [h('span', { class: 'sr-only' }, [`${tr('capsLabel')}: `]),
      m.res.map((r) => (r.cap == null ? tr('unlimited', { name: r.label }) : tr('cap', { name: r.label, cap: num(r.cap) }))).join(' · ')]) : null);

    // ---------- La tabla de un ejemplo, de solo lectura (tablero 131) ----------
    function exampleCard() {
      const head = h('tr', {}, [tr('col.id'), tr('col.links'), tr('col.d')].concat(m.res.map((r) => r.label)).map((c) => h('th', { scope: 'col' }, [c])));
      const body = m.p.table.map((id) => {
        const a = m.p.byId[id];
        return h('tr', { 'data-act': id }, [h('th', { scope: 'row' }, [id]), h('td', { class: 'rs-mono' }, [m.p.preds[id].join(', ') || '—']),
          h('td', {}, [num(a.d)])].concat(a.r.map((v) => h('td', {}, [num(v)]))));
      });
      return h('section', { class: 'card rs-card', 'aria-labelledby': 'rsTableHead' }, [
        h('h2', { id: 'rsTableHead' }, [m.src.unit ? tr('tableTitleUnit', { unit: m.src.unit }) : tr('tableTitle')]),
        h('div', { class: 'rs-scroll', tabindex: '0', role: 'region', 'aria-label': tr('tableLabel', { name: m.src.title }) }, [
          h('table', { class: 'data rs-proj', id: 'rsProjTable' }, [h('thead', {}, [head]), h('tbody', {}, body)])]),
        capsLine(),
        h('p', { class: 'muted small', id: 'rsSource' }, [tr('source', { source: m.src.source, unit: m.src.unit })]),
      ]);
    }

    // ---------- La tabla propia (tablero 139) ----------
    let ownTable = null; let issuesSlot = null; let pasteNote = false; let ownK = 0;
    const SIZE = { id: 4, name: 12, links: 9, d: 4, r1: 4, r2: 4, r3: 4 };
    const FIELD_MAX = { id: U.LIMITS.id, name: U.LIMITS.name, links: U.LIMITS.links, d: U.LIMITS.duration, r1: U.LIMITS.duration, r2: U.LIMITS.duration, r3: U.LIMITS.duration };
    const colName = (f) => (USE.includes(f) ? m.res[USE.indexOf(f)].label : tr(`col.${f}`));
    function readOwn() {
      return [...container.querySelectorAll('#rsOwn tbody tr')].map((row) => {
        const r = blank();
        const i = Number(row.getAttribute('data-row'));
        // Los usos de los recursos que no se ven (sin nombre) se conservan.
        const old = m.src.rows[i];
        if (old) for (const f of USE) r[f] = str(old[f]);
        for (const inp of row.querySelectorAll('input[data-f]')) r[inp.getAttribute('data-f')] = inp.value;
        return r;
      });
    }
    const commit = (next) => hooks.dispatch({ type: 'rsTable', rows: next.length ? next : [blank()] });
    function ownCard() {
      ownK = m.res.length;
      const fields = FIELDS.slice(0, 4 + ownK);
      const typed = () => hooks.dispatch({ type: 'rsTable', rows: readOwn() }, { fromEditor: true });
      const body = m.src.rows.map((r, i) => h('tr', { 'data-row': String(i) }, fields.map((f) => h('td', {}, [h('input', {
        id: `rsT-${i}-${f}`, value: str(r[f]), size: String(SIZE[f]), class: f === 'links' ? 'rs-mono' : null, 'aria-label': tr('cell', { col: colName(f), n: i + 1 }),
        'aria-invalid': 'false', 'data-f': f, maxlength: String(FIELD_MAX[f]), oninput: typed, spellcheck: 'false', autocomplete: 'off',
        inputmode: f === 'd' || USE.includes(f) ? 'numeric' : null,
      })])).concat([h('td', { class: 'rs-msg', 'data-msg': '' }, []), h('td', {}, [button('×', () => { commit(readOwn().filter((_, j) => j !== i)); focus(i > 0 ? `rsDel-${i - 1}` : 'rsAdd'); },
        { class: 'ghost small-btn', id: `rsDel-${i}`, 'aria-label': tr('removeRow', { n: i + 1 }) })])])));
      const head = h('tr', {}, fields.map((f) => h('th', { scope: 'col', 'data-col': f }, [colName(f)]))
        .concat([h('th', { scope: 'col' }, [tr('col.msg')]), h('th', { scope: 'col' }, [h('span', { class: 'sr-only' }, [tr('col.remove')])])]));
      ownTable = h('table', { class: 'data rs-own', id: 'rsOwn' }, [h('thead', {}, [head]), h('tbody', {}, body)]);
      issuesSlot = h('div', { class: 'rs-issues-slot' });
      const area = h('textarea', { id: 'rsPasteText', rows: '4', 'aria-describedby': 'rsPasteHint' });
      const paste = h('details', { class: 'rs-paste', id: 'rsPaste' }, [h('summary', {}, [tr('paste')]), h('p', { class: 'muted small', id: 'rsPasteHint' }, [tr('pasteHint')]), area,
        button(tr('pasteApply'), () => {
          const rows = pasteRows(area.value, ownK);
          if (!rows.length) return;
          const now = readOwn().filter((r) => FIELDS.some((f) => r[f].trim())).concat(rows);
          const cut = now.length > U.LIMITS.rows;
          pasteNote = cut;
          commit(now.slice(0, U.LIMITS.rows));
          focus(cut ? 'rsPasteCut' : 'rsAdd');
        }, { id: 'rsPasteApply' })]);
      const cutNote = pasteNote ? h('p', { class: 'rs-m rs-m-warn', id: 'rsPasteCut', role: 'status', tabindex: '-1' }, [tr('pasteCut', { rows: U.LIMITS.rows })]) : null;
      pasteNote = false;
      const card = h('section', { class: 'card rs-card', 'aria-labelledby': 'rsOwnHead' }, [
        h('h2', { id: 'rsOwnHead' }, [tr('own')]), issuesSlot, cutNote,
        h('div', { class: 'rs-scroll', tabindex: '0', role: 'region', 'aria-label': tr('tableLabel', { name: tr('own') }) }, [ownTable]),
        h('div', { class: 'rs-row' }, [
          button(tr('addRow'), () => { const now = readOwn(); commit(now.concat([blank()])); focus(`rsT-${now.length}-id`); },
            { id: 'rsAdd', disabled: m.src.rows.length >= U.LIMITS.rows }),
          button(tr('clear'), () => { commit([blank()]); focus('rsT-0-id'); }, { id: 'rsClear' }),
        ]),
        paste,
        h('p', { class: 'muted small', id: 'rsHelp' }, [tr('help')]),
      ]);
      markOwn();
      return card;
    }
    // Marca cada fila con su error, su aviso o su hito sin rehacer la tabla (el foco y el cursor no se mueven), y el resumen.
    function markOwn() {
      const mk = rowMarks(m, lang());
      for (const row of ownTable.querySelectorAll('tbody tr')) {
        const r = mk.rows.get(Number(row.getAttribute('data-row'))) || { bad: new Set(), warn: new Set(), msgs: [] };
        row.classList.toggle('bad', r.bad.size > 0);
        row.classList.toggle('warn', !r.bad.size && r.warn.size > 0);
        for (const inp of row.querySelectorAll('input[data-f]')) {
          const f = inp.getAttribute('data-f');
          inp.setAttribute('aria-invalid', String(r.bad.has(f)));
          inp.classList.toggle('rs-warn', !r.bad.has(f) && r.warn.has(f));
        }
        const cell = row.querySelector('[data-msg]');
        clear(cell);
        for (const x of r.msgs) cell.appendChild(h('span', { class: `rs-m rs-m-${x.kind}` }, [h('span', { 'aria-hidden': 'true' }, [x.kind === 'err' ? '✕ ' : x.kind === 'warn' ? '! ' : '· ']), x.text]));
      }
      // Los nombres de los recursos en las cabeceras y las etiquetas de sus celdas.
      for (const th of ownTable.querySelectorAll('thead th[data-col]')) th.textContent = colName(th.getAttribute('data-col'));
      for (const inp of ownTable.querySelectorAll('input[data-f]')) {
        const f = inp.getAttribute('data-f');
        if (USE.includes(f)) inp.setAttribute('aria-label', tr('cell', { col: colName(f), n: Number(inp.closest('tr').getAttribute('data-row')) + 1 }));
      }
      clear(issuesSlot);
      const n = m.report.errors.length;
      if (!n && !m.empty) return;
      const lines = [h('strong', {}, [m.empty ? tr('issues.empty') : n === 1 ? tr('issues.errorsOne') : tr('issues.errors', { n })])];
      if (mk.badRows.length) lines.push(' ', tr(mk.badRows.length === 1 ? 'issues.rowOne' : 'issues.rows', { list: I.list(lang(), mk.badRows) }));
      const general = mk.general.length ? h('ul', { class: 'small' }, mk.general.map((x) => h('li', {}, [x]))) : null;
      issuesSlot.appendChild(h('div', { class: 'rs-issues', id: 'rsIssues', role: 'status' }, [h('p', {}, lines), general]));
    }

    // ---------- Los recursos de la tabla propia (tablero 139) ----------
    // Cada valor válido vale al escribirlo (como los costes de la F5b, I-F8); uno no válido se marca al salir del campo.
    const capOk = (v) => !str(v).trim() || /^\d{1,4}$/.test(str(v).trim()) && Number(v) >= 1;
    function readRes() {
      return [0, 1, 2].map((k) => ({ name: root.document.getElementById(`rsResName-${k}`).value, cap: root.document.getElementById(`rsResCap-${k}`).value }));
    }
    function resCard() {
      const rows = resRows(state());
      const typed = () => {
        const all = readRes();
        const bad = all.some((r) => !capOk(r.cap));
        badCap.hidden = !all.some((r, k) => !capOk(r.cap) && root.document.getElementById(`rsResCap-${k}`).getAttribute('aria-invalid') === 'true');
        if (bad) return;
        for (let k = 0; k < 3; k++) root.document.getElementById(`rsResCap-${k}`).setAttribute('aria-invalid', 'false');
        badCap.hidden = true;
        hooks.dispatch({ type: 'rsRes', wr: resFromRows(all) }, { fromEditor: true });
      };
      const marked = (e) => { if (capOk(e.target.value)) return; e.target.setAttribute('aria-invalid', 'true'); badCap.hidden = false; };
      const badCap = h('p', { class: 'rs-m rs-m-err', id: 'rsResBad', role: 'alert', hidden: true }, [tr('res.bad')]);
      const body = rows.map((r, k) => h('tr', {}, [
        h('th', { scope: 'row' }, [tr('res.n', { n: k + 1 })]),
        h('td', {}, [h('input', { id: `rsResName-${k}`, value: r.name, size: '14', maxlength: String(U.RS.LIMITS.name), autocomplete: 'off', spellcheck: 'false',
          'aria-label': tr('res.nameLabel', { n: k + 1 }), oninput: typed })]),
        h('td', {}, [h('input', { id: `rsResCap-${k}`, value: r.cap, size: '5', inputmode: 'numeric', autocomplete: 'off', 'aria-invalid': 'false',
          'aria-label': tr('res.capLabel', { n: k + 1 }), 'aria-describedby': 'rsResHint', oninput: typed, onchange: marked })]),
        h('td', { class: 'muted small' }, [k === 0 ? tr('res.unlimited') : tr('res.unused')]),
      ]));
      return h('section', { class: 'card rs-card', 'aria-labelledby': 'rsResHead' }, [
        h('h2', { id: 'rsResHead' }, [tr('res.title')]),
        h('table', { class: 'data rs-res', id: 'rsResTable' }, [h('thead', {}, [h('tr', {}, [h('td', {}, []), h('th', { scope: 'col' }, [tr('res.name')]), h('th', { scope: 'col' }, [tr('res.cap')]), h('td', {}, [])])]),
          h('tbody', {}, body)]),
        badCap,
        h('p', { class: 'muted small', id: 'rsResHint' }, [tr('res.hint')]),
      ]);
    }

    // ---------- La nivelación: Gantt con perfiles, comparación, a mano y ROY (T010; tableros 131–134) ----------
    let bad = null; let sel = null; let timesOpen = false; let profOpen = false; let lower = null;
    const levCal = () => (LEV.includes(state().wc) ? state().wc : 'es');
    const unitOf = (T) => Math.max(12, Math.min(34, Math.floor(600 / Math.max(1, T))));
    const resUses = (a) => m.res.map((r, k) => `${r.label} ${num(a.r[k])}`).join(', ');
    function ganttCard(cal) {
      const p = m.p; const S = cal.S; const T = p.T; const U = unitOf(T);
      const shifts = cal.wc === 'man' || cal.wc === 'bur' || cal.wc === 'min';
      const rows = p.table.map((id) => {
        const a = p.byId[id]; const t = p.times[id];
        return { id, s: S[id], d: a.d, r: a.r.map(num), es: t.ES, lf: t.LF, crit: t.TF === 0, moved: shifts && S[id] !== t.ES,
          label: tr('gantt.bar', { id, s: num(S[id]), f: num(S[id] + a.d), uses: resUses(a) }) };
      });
      const res = m.res.map((r, k) => {
        const u = R.profile(p, S, k, T); const x = R.stats(u);
        return { label: r.label, cap: r.cap, u, aria: tr('gantt.profile', { res: r.label, peak: num(x.peak), ssq: num(x.ssq), work: num(x.work) }),
          statsText: [tr('gantt.peak', { v: num(x.peak) }), tr('gantt.ssq', { v: num(x.ssq) }), tr('gantt.work', { v: num(x.work) })] };
      });
      const holder = h('div', { class: 'rs-gantt', id: 'rsGantt' });
      const calName = tr(`cals.${cal.wc}`);
      root.PNL.rsGantt.render(holder, { T, Tcpm: T, unit: U, rows, res, window: true, caps: false, sel: cal.wc === 'man' ? sel : null,
        label: tr('gantt.label', { cal: calName, name: m.src.title }), capText: (v) => tr('gantt.cap', { v: num(v) }),
        onMove: cal.wc === 'man' ? (id, s) => move(cal, id, s) : null, onSelect: cal.wc === 'man' ? (id) => { sel = id; bad = null; keepFocus(drawLower); } : null });
      const notes = [];
      if (cal.wc === 'min') {
        const x = cal.info; const k = levelK(m, state());
        notes.push(h('p', { class: `rs-note ${x.proved ? 'rs-note-ok' : 'rs-note-warn'}`, id: 'rsMinNote', role: 'status' }, [x.proved
          ? tr('min.proved', { T: num(p.T), res: m.res[k].label, peak: num(x.peak), nodes: num(x.nodes) })
          : tr('min.notProved', { peak: num(x.peak), lb: num(x.lb) })]));
      }
      if (cal.wc === 'bur') {
        const k = levelK(m, state());
        notes.push(h('p', { class: 'rs-note', id: 'rsBurNote' }, [tr('bur.note', { n: num(cal.info.passes), from: num(stats(m, levData(m, k).es, k).ssq), to: num(stats(m, S, k).ssq) })]));
      }
      const leg = h('p', { class: 'rs-legend', id: 'rsGanttLegend' }, [h('span', { class: 'rs-l-crit' }, [tr('gantt.crit')]), h('span', { class: 'rs-l-free' }, [tr('gantt.free')]),
        h('span', { class: 'rs-l-window' }, [tr('gantt.window')]), shifts ? h('span', { class: 'rs-l-ghost' }, [tr('gantt.ghost')]) : null, h('span', {}, [tr('gantt.use')])]);
      return h('section', { class: 'card rs-card', 'aria-labelledby': 'rsGanttHead' }, [
        h('h2', { id: 'rsGanttHead' }, [tr(m.res.length > 1 ? 'gantt.title' : 'gantt.titleOne', { cal: calName })]),
        h('div', { class: 'rs-scroll rs-gantt-wrap', tabindex: cal.wc === 'man' ? null : '0', role: 'region', 'aria-label': tr('gantt.label', { cal: calName, name: m.src.title }) }, [holder]),
        h('p', { class: 'rs-swipe muted small', 'aria-hidden': 'true' }, [tr('gantt.swipe')]),
        leg].concat(notes));
    }
    // Un movimiento a mano (P3): si vale, va al enlace (wq); si no, se dice el motivo y no se aplica.
    function move(cal, id, s) {
      sel = id;
      const c = moveCheck(m, cal.S, id, s);
      if (!c.ok) { bad = moveText(c, lang()); keepFocus(drawLower); return; }
      bad = null;
      hooks.dispatch({ type: 'rsStarts', value: withMove(m, cal.moves, id, s) });
      if (hooks.announce) hooks.announce(tr('manual.moved', { id, s: num(s) }));
    }
    function manualCard(cal) {
      const ids = m.p.table;
      if (!sel || !m.p.byId[sel]) sel = ids[0];
      const act = h('select', { id: 'rsMoveAct', onchange: (e) => { sel = e.target.value; bad = null; keepFocus(drawLower); } },
        ids.map((id) => h('option', { value: id, selected: id === sel }, [id])));
      const start = h('input', { id: 'rsMoveStart', value: String(cal.S[sel]), size: '4', inputmode: 'numeric', autocomplete: 'off' });
      const apply = () => { const v = start.value.trim(); if (/^\d{1,5}$/.test(v)) move(cal, sel, Number(v)); };
      start.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); apply(); } });
      return h('section', { class: 'card rs-card', 'aria-labelledby': 'rsMoveHead' }, [
        h('h2', { id: 'rsMoveHead' }, [tr('manual.title')]),
        h('p', { class: 'small' }, [tr('manual.hint')]),
        h('div', { class: 'rs-row' }, [h('label', { class: 'rs-field' }, [tr('manual.act'), ' ', act]), h('label', { class: 'rs-field' }, [tr('manual.start'), ' ', start]),
          button(tr('manual.apply'), apply, { id: 'rsMoveApply' }),
          button(tr('manual.reset'), () => { bad = null; hooks.dispatch({ type: 'rsStarts', value: null }); focus('rsMoveReset'); }, { id: 'rsMoveReset', disabled: !cal.moves.length })]),
        bad ? h('p', { class: 'rs-m rs-m-err rs-bad', id: 'rsMoveBad', role: 'alert' }, [h('strong', {}, [tr('manual.notApplied')]), ' ', bad]) : null,
        h('p', { class: 'muted small' }, [tr('manual.note')]),
      ]);
    }
    function compareCard() {
      const rows = compareRows(m, state()); const cur = levCal();
      // Dos filas de cabecera: el recurso encima de su pico y su suma de cuadrados.
      const head = [h('tr', {}, [h('th', { scope: 'col', rowspan: '2' }, [tr('cmp.cal')])].concat(m.res.map((r) => h('th', { scope: 'colgroup', colspan: '2', class: 'rs-cmp-res' }, [r.label])))),
        h('tr', {}, m.res.flatMap(() => [h('th', { scope: 'col' }, [tr('cmp.peak')]), h('th', { scope: 'col' }, [tr('cmp.ssq')])]))];
      const extra = (r) => (r.cal === 'bur' ? (r.info.passes === 1 ? tr('cmp.passesOne') : tr('cmp.passes', { n: num(r.info.passes) })) : r.cal === 'min' ? tr(r.info.proved ? 'cmp.proved' : 'cmp.notProved') : r.untouched ? tr('cmp.untouched') : '');
      const body = rows.map((r) => h('tr', { class: r.cal === cur ? 'chosen' : null, 'data-cal': r.cal }, [h('th', { scope: 'row' }, [tr(`cals.${r.cal}`), extra(r) ? h('span', { class: 'muted small' }, [` ${extra(r)}`]) : null])]
        .concat(r.stats.flatMap((x) => [h('td', { class: 'num' }, [h('strong', {}, [num(x.peak)])]), h('td', { class: 'num' }, [num(x.ssq)])]))));
      const k = levelK(m, state());
      return h('section', { class: 'card rs-card', 'aria-labelledby': 'rsCmpHead' }, [h('h2', { id: 'rsCmpHead' }, [tr('cmp.title')]),
        h('div', { class: 'rs-scroll', tabindex: '0', role: 'region', 'aria-label': `${tr('cmp.title')} · ${m.src.title}` }, [h('table', { class: 'data rs-cmp', id: 'rsCmp' }, [h('thead', {}, head), h('tbody', {}, body)])]),
        h('p', { class: 'muted small' }, [tr('cmp.note', { work: num(rows[0].stats[k].work) })])]);
    }
    function royCard(cal) {
      const p = m.p;
      const proj = { activities: p.activities.map((a) => ({ id: a.id, name: a.name, d: a.d })), preds: p.preds, succs: p.succs };
      const sol = root.PNL.cpm.solve(proj);
      const early = cal.wc === 'es';
      const revealed = new Map();
      for (const a of p.activities) {
        revealed.set(`${a.id}.ES`, cal.S[a.id]); revealed.set(`${a.id}.EF`, cal.S[a.id] + a.d);
        if (early) { for (const f of ['LS', 'LF']) revealed.set(`${a.id}.${f}`, sol.times[a.id][f]); revealed.set(`${a.id}.TF`, sol.floats[a.id].TF); }
      }
      const tags = new Map();
      if (cal.wc === 'man' || cal.wc === 'bur' || cal.wc === 'min') {
        for (const a of p.activities) {
          const dd = cal.S[a.id] - p.times[a.id].ES;
          if (dd) tags.set(a.id, [{ text: tr('roy.moved', { n: num(dd) }), cls: 'ntag-moved', title: tr('roy.movedTitle', { n: num(dd) }) }]);
        }
      }
      const holder = h('div', { class: 'rs-net', id: 'rsRoy', tabindex: '0' });
      root.PNL.royView.render(holder, { project: proj, solution: sol, lay: root.PNL.layout.layout(sol, proj), step: null, revealed, box: '7', lang: lang(), nota: state().nota,
        criticalOn: true, numFmt: num, name: m.src.title, fit: true, minWidth: 560, tags });
      return h('section', { class: 'card rs-card', 'aria-labelledby': 'rsRoyHead' }, [h('h2', { id: 'rsRoyHead' }, [tr(early ? 'roy.title' : 'roy.titleCal')]), holder,
        h('p', { class: 'rs-swipe muted small', 'aria-hidden': 'true' }, [tr('gantt.swipe')]),
        h('p', { class: 'rs-legend', id: 'rsRoyLegend' }, [tr(early ? 'roy.legend' : 'roy.legendCal')])]);
    }
    // Alternativas en texto (AC12): comienzo y fin de cada actividad, y el uso de cada recurso en cada periodo.
    function altTables(cal) {
      const p = m.p; const calName = tr(`cals.${cal.wc}`);
      const tHead = h('tr', {}, [tr('alt.act'), tr('alt.d'), tr('alt.start'), tr('alt.end')].concat(m.res.map((r) => r.label)).map((c) => h('th', { scope: 'col' }, [c])));
      const tBody = p.table.map((id) => { const a = p.byId[id]; return h('tr', {}, [h('th', { scope: 'row' }, [id])].concat([a.d, cal.S[id], cal.S[id] + a.d, ...a.r].map((v) => h('td', { class: 'num' }, [num(v)])))); });
      const us = m.res.map((_, k) => R.profile(p, cal.S, k, p.T));
      const pHead = h('tr', {}, [tr('alt.period')].concat(m.res.map((r) => r.label)).map((c) => h('th', { scope: 'col' }, [c])));
      const pBody = Array.from({ length: p.T }, (_, q) => h('tr', {}, [h('th', { scope: 'row' }, [num(q + 1)])].concat(us.map((u) => h('td', { class: 'num' }, [num(u[q])])))));
      const box = (id, open, setOpen, title, caption, tid, head, body) => h('details', { class: 'card rs-card rs-alt', id, open, ontoggle: (e) => setOpen(e.target.open) }, [h('summary', {}, [title]),
        h('div', { class: 'rs-scroll', tabindex: '0', role: 'region', 'aria-label': title }, [h('table', { class: 'data rs-cmp', id: tid }, [h('caption', { class: 'sr-only' }, [caption]), h('thead', {}, [head]), h('tbody', {}, body)])])]);
      return [box('rsTimes', timesOpen, (v) => { timesOpen = v; }, tr('alt.times'), tr('alt.timesCaption', { cal: calName }), 'rsTimesTable', tHead, tBody),
        box('rsProfile', profOpen, (v) => { profOpen = v; }, tr('alt.profile'), tr('alt.profileCaption', { cal: calName }), 'rsProfileTable', pHead, pBody)];
    }
    // ---------- Recursos limitados (T011; tableros 135, 138 y 140) ----------
    const limCal = () => (LIM.includes(state().wc) ? state().wc : 'sgs');
    const schemeOf = () => (SCHEME[state().ws] ? state().ws : 'sf');
    const ruleOf = () => (R.RULES.includes(state().wp) ? state().wp : 'slk');
    const tU = (T) => (m.src.unit ? `${num(T)} ${m.src.unit}` : num(T));
    function limGanttCard(cal) {
      const p = m.p; const S = cal.S;
      const T = Math.max(p.T, cal.T || 0, ...p.activities.filter((a) => S[a.id] != null).map((a) => S[a.id] + a.d)) + (cal.wc === 'man' ? 3 : 0);
      const U = unitOf(T); const chainIds = new Set(cal.chains.flat());
      const rows = p.table.map((id) => {
        const a = p.byId[id]; const t = p.times[id];
        return { id, s: S[id] == null ? null : S[id], d: a.d, r: a.r.map(num), es: t.ES, lf: t.LF, crit: false, chain: chainIds.has(id), moved: false,
          label: S[id] == null ? `${id}: ${tr('place.empty')}` : tr('gantt.bar', { id, s: num(S[id]), f: num(S[id] + a.d), uses: resUses(a) }) };
      });
      const res = m.res.map((r, k) => {
        const u = R.profile(p, S, k, T); const x = R.stats(u);
        return { label: r.label, cap: r.cap, u, aria: tr('gantt.profile', { res: r.label, peak: num(x.peak), ssq: num(x.ssq), work: num(x.work) }),
          statsText: [tr('gantt.peak', { v: num(x.peak) }), tr('gantt.ssq', { v: num(x.ssq) }), tr('gantt.work', { v: num(x.work) })] };
      });
      const holder = h('div', { class: 'rs-gantt', id: 'rsGantt' });
      const title = cal.wc === 'sgs' ? tr('lim.titleRule', { scheme: tr(`schemes.${schemeOf()}`), rule: tr(`rules.${ruleOf()}`).toLowerCase(), T: tU(cal.T) })
        : cal.wc === 'opt' ? tr('lim.titleOpt', { T: tU(cal.T) })
          : cal.complete ? tr('lim.titleMan', { T: tU(cal.T) }) : tr('lim.titleManPart', { n: num(cal.moves.length), all: num(p.activities.length) });
      root.PNL.rsGantt.render(holder, { T, Tcpm: p.T, unit: U, rows, res, window: false, caps: true, sel: cal.wc === 'man' ? sel : null, emptyText: tr('place.empty'),
        label: tr('gantt.label', { cal: tr(`cals.${cal.wc}`), name: m.src.title }), capText: (v) => tr('gantt.cap', { v: num(v) }),
        onMove: cal.wc === 'man' ? (id, s) => place(cal, id, s) : null, onSelect: cal.wc === 'man' ? (id) => { sel = id; bad = null; keepFocus(drawLower); } : null });
      const leg = h('p', { class: 'rs-legend', id: 'rsGanttLegend' }, [cal.chains.length ? h('span', { class: 'rs-l-chain' }, [tr('lim.chain')]) : null,
        h('span', { class: 'rs-l-cap' }, [tr('lim.cap')]), h('span', { class: 'rs-l-over' }, [tr('lim.over')]), h('span', {}, [tr('gantt.use')])]);
      const chainNote = cal.chains.length ? h('p', { class: 'rs-note', id: 'rsChainNote' }, [tr('lim.chainNote', { list: cal.chains.map((c) => c.join(' → ')).join('; ') })]) : null;
      return h('section', { class: 'card rs-card', 'aria-labelledby': 'rsGanttHead' }, [h('h2', { id: 'rsGanttHead' }, [title]),
        h('div', { class: 'rs-scroll rs-gantt-wrap', tabindex: cal.wc === 'man' ? null : '0', role: 'region', 'aria-label': tr('gantt.label', { cal: tr(`cals.${cal.wc}`), name: m.src.title }) }, [holder]),
        h('p', { class: 'rs-swipe muted small', 'aria-hidden': 'true' }, [tr('gantt.swipe')]), leg, chainNote]);
    }
    function durCard() {
      const p = m.p; const ld = limData(m); const o = ld.opt; const man = manualLim(m, state().wq);
      const rule = R.sgs(p, Object.assign({ rule: ruleOf() }, SCHEME[schemeOf()]));
      const bk = ld.bound.list;
      const dl = h('dl', { class: 'rs-dur' }, [
        h('dt', {}, [tr('lim.cpm')]), h('dd', { id: 'rsDurCpm' }, [num(p.T)]),
        h('dt', {}, [tr('lim.baker')]), h('dd', { id: 'rsDurBaker' }, [num(ld.bound.bound)]),
        h('dt', {}, [tr('lim.opt')]), h('dd', { id: 'rsDurOpt', class: o.proved ? 'ok' : null }, [o.proved ? tr('lim.proved', { T: num(o.T) }) : tr('lim.notProved', { T: num(o.T), lb: num(o.lb) })]),
        h('dt', {}, [tr('lim.rule', { rule: tr(`rulesShort.${ruleOf()}`), scheme: tr(`schemesShort.${schemeOf()}`) })]), h('dd', { id: 'rsDurRule' }, [num(rule.T)]),
        h('dt', {}, [tr('lim.man')]), h('dd', { id: 'rsDurMan' }, [man.complete ? num(man.T) : man.moves.length ? tr('lim.manPart', { n: num(man.moves.length), all: num(p.activities.length) }) : tr('lim.manNone')]),
      ]);
      const text = bk.length ? bk.map((b) => tr('lim.bakerText', { res: m.res[b.k].label, W: num(b.W), ws: num(b.wasteStart), we: num(b.wasteEnd), w: num(b.wasteStart + b.wasteEnd),
        cap: num(m.res[b.k].cap), D: num(b.Dmin), T: num(p.T), R: num(b.Rmin) })).join(' ') : tr('lim.bakerNone');
      return h('section', { class: 'card rs-card', 'aria-labelledby': 'rsDurHead' }, [h('h2', { id: 'rsDurHead' }, [tr('lim.dur')]), dl,
        h('details', { class: 'rs-baker', open: true }, [h('summary', {}, [tr('lim.bakerTitle')]), h('p', { id: 'rsBakerText' }, [text])])]);
    }
    function rulesCard(cal) {
      const ld = limData(m); const best = ld.opt.T;
      const keys = Object.keys(SCHEME);
      const head = h('tr', {}, [h('th', { scope: 'col' }, [tr('lim.cmpRule')])].concat(keys.map((k) => h('th', { scope: 'col' }, [tr(`schemesShort.${k}`)]))));
      const body = R.RULES.map((r) => h('tr', {}, [h('th', { scope: 'row' }, [tr(`rules.${r}`)])].concat(keys.map((k) => {
        const sc = SCHEME[k]; const T = ld.cmp.find((x) => x.rule === r && x.scheme === sc.scheme && x.dir === sc.dir).T;
        const on = cal.wc === 'sgs' && r === ruleOf() && k === schemeOf();
        return h('td', {}, [h('button', { type: 'button', id: `rsRule-${r}-${k}`, class: T === best ? 'best' : null, 'aria-pressed': String(on),
          'aria-label': `${tr('lim.cmpPick', { rule: tr(`rules.${r}`), scheme: tr(`schemes.${k}`), T: num(T) })}${T === best ? ` (${tr('lim.cmpBest')})` : ''}`,
          onclick: () => { go({ wc: 'sgs', ws: k, wp: r }, { push: true }); focus(`rsRule-${r}-${k}`); } }, [num(T)])]);
      }))));
      return h('section', { class: 'card rs-card', 'aria-labelledby': 'rsRulesHead' }, [h('h2', { id: 'rsRulesHead' }, [tr('lim.cmpTitle')]),
        h('div', { class: 'rs-scroll', tabindex: '0', role: 'region', 'aria-label': `${tr('lim.cmpTitle')} · ${m.src.title}` }, [h('table', { class: 'data rs-rules', id: 'rsRules' }, [h('thead', {}, [head]), h('tbody', {}, body)])]),
        h('p', { class: 'muted small' }, [tr('lim.cmpNote')])]);
    }
    // Colocar a mano (C2): si vale, va al enlace (wq); si no, se dice el motivo y no se coloca.
    function place(cal, id, s) {
      sel = id;
      if (!(s >= 0)) return;
      const rest = Object.assign({}, cal.S); delete rest[id];
      const c = placeCheck(m, rest, id, s);
      if (!c.ok) { bad = placeText(c, lang(), m); keepFocus(drawLower); return; }
      bad = null;
      hooks.dispatch({ type: 'rsStarts', value: withPlace(cal.moves, id, s) });
      if (hooks.announce) hooks.announce(tr('place.placed', { id, s: num(s) }));
    }
    function placeCard(cal) {
      const ids = m.p.table;
      if (!sel || !m.p.byId[sel]) sel = ids.find((id) => cal.S[id] == null) || ids[0];
      const act = h('select', { id: 'rsPlaceAct', onchange: (e) => { sel = e.target.value; bad = null; keepFocus(drawLower); } },
        ids.map((id) => h('option', { value: id, selected: id === sel }, [cal.S[id] == null ? id : `${id} (${num(cal.S[id])})`])));
      const start = h('input', { id: 'rsPlaceStart', value: cal.S[sel] == null ? '' : String(cal.S[sel]), size: '4', inputmode: 'numeric', autocomplete: 'off' });
      const apply = () => { const v = start.value.trim(); if (/^\d{1,5}$/.test(v)) place(cal, sel, Number(v)); };
      start.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); apply(); } });
      const ld = limData(m); const best = Math.min(...ld.cmp.map((x) => x.T));
      return h('section', { class: 'card rs-card', 'aria-labelledby': 'rsPlaceHead' }, [
        h('h2', { id: 'rsPlaceHead' }, [tr('place.title')]),
        h('p', { class: 'small' }, [tr('place.hint')]),
        h('div', { class: 'rs-row' }, [h('label', { class: 'rs-field' }, [tr('place.act'), ' ', act]), h('label', { class: 'rs-field' }, [tr('place.start'), ' ', start]),
          button(tr('place.place'), apply, { id: 'rsPlace' }),
          button(tr('place.remove'), () => { bad = null; hooks.dispatch({ type: 'rsStarts', value: withPlace(cal.moves, sel, null) }); if (hooks.announce) hooks.announce(tr('place.removed', { id: sel })); focus('rsRemove'); },
            { id: 'rsRemove', disabled: cal.S[sel] == null }),
          button(tr('place.reset'), () => { bad = null; hooks.dispatch({ type: 'rsStarts', value: null }); focus('rsPlaceReset'); }, { id: 'rsPlaceReset', disabled: !cal.moves.length })]),
        bad ? h('p', { class: 'rs-m rs-m-err rs-bad', id: 'rsPlaceBad', role: 'alert' }, [h('strong', {}, [tr('place.notPlaced')]), ' ', bad]) : null,
        cal.complete ? h('p', { class: 'rs-note rs-note-ok', id: 'rsPlaceDone', role: 'status' }, [tr('place.done', { T: tU(cal.T), best: tU(best), opt: tU(ld.opt.T) })]) : null,
      ]);
    }
    function limRoyCard(cal) {
      const p = m.p;
      const proj = { activities: p.activities.map((a) => ({ id: a.id, name: a.name, d: a.d })), preds: p.preds, succs: p.succs };
      const sol = root.PNL.cpm.solve(proj);
      const revealed = new Map();
      for (const a of p.activities) if (cal.S[a.id] != null) { revealed.set(`${a.id}.ES`, cal.S[a.id]); revealed.set(`${a.id}.EF`, cal.S[a.id] + a.d); }
      const mk = chainMarks(m, cal.chains);
      const holder = h('div', { class: 'rs-net', id: 'rsRoy', tabindex: '0' });
      root.PNL.royView.render(holder, { project: proj, solution: sol, lay: root.PNL.layout.layout(sol, proj), step: null, revealed, box: '7', lang: lang(), nota: state().nota,
        criticalOn: true, numFmt: num, name: m.src.title, fit: true, minWidth: 560, marked: mk.nodes, edgeMarks: new Map([...mk.edges].map((k) => [k, 'sel'])), waits: mk.waits });
      return h('section', { class: 'card rs-card', 'aria-labelledby': 'rsRoyHead' }, [h('h2', { id: 'rsRoyHead' }, [tr('roy.titleCal')]), holder,
        h('p', { class: 'rs-swipe muted small', 'aria-hidden': 'true' }, [tr('gantt.swipe')]),
        h('p', { class: 'rs-legend', id: 'rsRoyLegend' }, [tr('lim.royLegend')])]);
    }
    function limAltTables(cal) {
      const p = m.p; const calName = tr(`cals.${cal.wc}`); const T = Math.max(p.T, cal.T || 0);
      const tHead = h('tr', {}, [tr('alt.act'), tr('alt.d'), tr('alt.start'), tr('alt.end')].concat(m.res.map((r) => r.label)).map((c) => h('th', { scope: 'col' }, [c])));
      const tBody = p.table.map((id) => { const a = p.byId[id]; const s0 = cal.S[id];
        return h('tr', {}, [h('th', { scope: 'row' }, [id])].concat([num(a.d), s0 == null ? '—' : num(s0), s0 == null ? '—' : num(s0 + a.d), ...a.r.map(num)].map((v) => h('td', { class: 'num' }, [v])))); });
      const us = m.res.map((_, k) => R.profile(p, cal.S, k, T));
      const pHead = h('tr', {}, [tr('alt.period')].concat(m.res.map((r) => (r.cap == null ? r.label : `${r.label} (${num(r.cap)})`))).map((c) => h('th', { scope: 'col' }, [c])));
      const pBody = Array.from({ length: T }, (_, q) => h('tr', {}, [h('th', { scope: 'row' }, [num(q + 1)])].concat(us.map((u, k) => h('td', { class: `num${m.res[k].cap != null && u[q] > m.res[k].cap ? ' rs-over' : ''}` }, [num(u[q])])))));
      const box = (id, open, setOpen, title, caption, tid, head, body) => h('details', { class: 'card rs-card rs-alt', id, open, ontoggle: (e) => setOpen(e.target.open) }, [h('summary', {}, [title]),
        h('div', { class: 'rs-scroll', tabindex: '0', role: 'region', 'aria-label': title }, [h('table', { class: 'data rs-cmp', id: tid }, [h('caption', { class: 'sr-only' }, [caption]), h('thead', {}, [head]), h('tbody', {}, body)])])]);
      return [box('rsTimes', timesOpen, (v) => { timesOpen = v; }, tr('alt.times'), tr('alt.timesCaption', { cal: calName }), 'rsTimesTable', tHead, tBody),
        box('rsProfile', profOpen, (v) => { profOpen = v; }, tr('alt.profile'), tr('alt.profileCaption', { cal: calName }), 'rsProfileTable', pHead, pBody)];
    }

    // ---------- El paso a paso (T012; tableros 133, 136 y 137) ----------
    const tw = (k, q) => tr(`walk.${k}`, q);
    const curStep = () => { const t0 = trace(m); return t0[Math.min(state().step, t0.length - 1)]; };
    let lastWalk = '';
    const schemeKey = (cfg) => `${cfg.scheme}${cfg.dir}`;
    // La fase de la pregunta: en el esquema serie, primero la actividad (pick) y después el comienzo (start).
    function phaseOf(step) {
      if (!hooks.predicting(step)) return null;
      if (step.kind === 'rsPick') return hooks.pred().answers.get('rs.pickDone') ? 'start' : 'pick';
      return step.kind === 'rsMove' ? 'bur' : 'set';
    }
    function counterLabel(t0, step) {
      const cfg = t0.cfg;
      if (step.kind === 'rsEnd') return tw('counterEnd');
      if (cfg.kind === 'bur') return tw('counterBur', { pass: num(step.pass), id: step.id });
      const q = { scheme: tr(`schemes.${schemeKey(cfg)}`), rule: tr(`rules.${cfg.rule}`), t: num(step.t) };
      return tw(step.kind === 'rsTime' ? 'counterTime' : 'counterSgs', q);
    }
    // El reproductor, en la tercera fila de la barra (tablero 130).
    function player() {
      const t0 = trace(m); const n = t0.length - 1; const k = Math.min(state().step, n); const step = t0[k];
      const hide = hooks.predicting(step);
      const nav = (id, label, n1, off) => h('button', { type: 'button', class: 'ghost', id, disabled: off, onclick: () => {
        hooks.dispatch({ type: 'go', n: n1 });
        const st = curStep();
        focus(hooks.predicting(st) ? firstAsk(st) : id);
      } }, [label]);
      const c = I.t(lang(), 'player.counter', { i: k, n });
      return h('div', { class: 'rs-row rs-player', role: 'group', 'aria-label': tw('player') }, [
        nav('rsFirst', `⏮ ${I.t(lang(), 'player.first')}`, 1, k <= 1),
        nav('rsPrev', `← ${I.t(lang(), 'player.prev')}`, k - 1, k <= 1),
        h('span', { class: 'rs-counter', id: 'rsCounter' }, [`${c} · ${counterLabel(t0, step)}`]),
        nav('rsNext', `${I.t(lang(), 'player.next')} →`, k + 1, k >= n || hide),
        nav('rsLast', `${tw('last')} ⏭`, n, k >= n || hide),
        h('span', { class: 'muted small' }, [hide ? I.t(lang(), 'predict.hidden') : tw('keys')]),
      ]);
    }
    // El primer control de la pregunta del paso (para llevar el foco al llegar a él).
    function firstAsk(step) {
      const ph = phaseOf(step);
      if (ph === 'pick') return `rsPick-${step.reveals[0].check.all[0]}`;
      if (ph === 'set') return `rsSet-${step.reveals[0].check.elig[0].id}`;
      return 'rsPredStart';
    }
    // Las elegibles de un paso de los esquemas: actividad, su prioridad y, en el paralelo, su duración y sus usos.
    function eligTable(step, chosen) {
      const cfg = trace(m).cfg; const cols = keyCols(cfg.rule);
      const list = step.kind === 'rsPick' ? step.pick.elig : step.set.elig;
      const par = step.kind === 'rsTime';
      const head = [tw('eligAct')].concat(cols.map((x) => keyLabel(x, lang())), par ? [tr('col.d')].concat(m.res.map((r) => r.label)) : []);
      const body = list.map((x) => h('tr', { class: chosen.includes(x.id) ? 'chosen' : null, 'data-act': x.id }, [h('th', { scope: 'row' }, [x.id])]
        .concat(cols.map((col, i) => h('td', { class: 'num' }, [num(col.sign * x.key[i])])),
          par ? [h('td', { class: 'num' }, [num(x.d)])].concat(x.r.map((v) => h('td', { class: 'num' }, [num(v)]))) : [])));
      return h('div', { class: 'rs-scroll', tabindex: '0', role: 'region', 'aria-label': tw('eligLabel') }, [
        h('table', { class: 'data rs-cmp rs-elig', id: 'rsElig' }, [h('thead', {}, [h('tr', {}, head.map((x) => h('th', { scope: 'col' }, [x])))]), h('tbody', {}, body)])]);
    }
    // El título y la narración del paso (con la pregunta, mientras se predice).
    function narration(t0, k, phase) {
      const step = t0[k]; const cfg = t0.cfg; const text = [];
      let title;
      const res = (x) => resLow(m, x);
      if (step.kind === 'rsMove') {
        const kk = cfg.k;
        title = phase ? tw('burAsk', { id: step.id }) : tw(step.to !== step.from ? 'burMoveTitle' : 'burStayTitle', { pass: num(step.pass), id: step.id, from: num(step.from), to: num(step.to) });
        text.push(tw('burIntro', { id: step.id, lo: num(step.window[0]), hi: num(step.window[1]), T: num(m.p.T) }));
        if (phase) text.push(tw('burAskText', { res: res(kk) }));
        else if (step.to !== step.from && step.after < step.before) text.push(tw('burMoved', { to: num(step.to), res: res(kk), before: num(step.before), after: num(step.after) }));
        else if (step.to !== step.from) text.push(tw('burMovedTie', { to: num(step.to), after: num(step.after) }));
        else text.push(tw('burStay', { before: num(step.before) }));
      } else if (step.kind === 'rsPick') {
        const rule = cfg.rule;
        title = phase === 'pick' ? tw('pickAsk') : phase === 'start' ? tw('startAsk', { id: step.id }) : tw('pickTitle', { id: step.id, start: num(step.start) });
        text.push(tw('eligText', { list: I.list(lang(), step.pick.elig.map((x) => x.id)), rule: tw(`rule.${rule}`), tie: rule === 'slk' || rule === 'lft' ? tw(`tie.${rule}`) : '' }));
        if (phase === 'start') text.push(tw('startText', { ready: num(step.ready) }));
        else if (!phase) text.push(step.wait ? tw('startWait', { id: step.id, start: num(step.start), period: num(step.wait.period), use: num(step.wait.use), res: res(step.wait.res), cap: num(step.wait.cap) })
          : tw('startFree', { id: step.id, start: num(step.start) }));
      } else if (step.kind === 'rsTime') {
        const ids = step.set.elig.map((x) => x.id);
        title = phase ? tw('timeAsk', { t: num(step.t) }) : !step.started.length ? tw('timeNone', { t: num(step.t) })
          : tw(step.started.length === 1 ? 'timeTitleOne' : 'timeTitle', { t: num(step.t), list: I.list(lang(), step.started) });
        text.push(tw('timeText', { t: num(step.t), list: I.list(lang(), ids), rule: tr(`rules.${cfg.rule}`).toLowerCase() }));
        if (!phase) {
          for (const w of step.waiting) {
            const later = t0.find((x) => x.kind === 'rsTime' && x.started.includes(w.id));
            text.push(tw('wait', { id: w.id, period: num(w.block.period), use: num(w.block.use), res: res(w.block.res), cap: num(w.block.cap), s: later ? num(later.t) : '—' }));
          }
        }
      } else if (cfg.kind === 'bur') {
        const kk = cfg.k; const st0 = stats(m, t0[0].S, kk); const st1 = stats(m, step.S, kk);
        title = tw('burEndTitle');
        text.push(tw(step.passes === 1 ? 'burEndOne' : 'burEnd', { n: num(step.passes), res: res(kk), from: num(st0.ssq), to: num(st1.ssq), p0: num(st0.peak), p1: num(st1.peak) }));
      } else {
        title = tw('sgsEndTitle', { T: tU(step.T) });
        text.push(tw('sgsEnd', { T: tU(step.T), Tcpm: tU(m.p.T), bound: num(step.bound) }));
        if (step.chains.length) text.push(tw('sgsEndChains', { list: step.chains.map((c) => c.join(' → ')).join('; ') }));
        if (step.reversed) text.push(tw('sgsEndBack', { T: num(step.T) }));
      }
      return { title, text: text.join(' ') };
    }
    // La pregunta: un comienzo (Burgess y el esquema serie), una actividad (serie) o un conjunto (paralelo).
    function askBox(step, phase) {
      if (!phase) return null;
      const pred = hooks.pred();
      const show = button(I.t(lang(), 'predict.show'), () => { hooks.predShow(); focus('rsNext'); }, { id: 'rsPredShow' });
      if (phase === 'pick') {
        const c = step.reveals[0].check; const cur = pred.answers.get('rs.pick');
        const msg = h('p', { class: 'rs-m rs-m-err', id: 'rsPredEmpty', hidden: true }, [tw('emptyPick')]);
        const check = () => {
          if (!pred.answers.get('rs.pick')) { msg.hidden = false; focus(`rsPick-${c.all[0]}`); return; }
          pred.answers.set('rs.pickDone', true);
          keepFocus(draw);
          focus('rsPredStart');
        };
        return h('div', { class: 'rs-predict' }, [
          h('div', { class: 'rs-row', role: 'group', 'aria-label': tw('pickGroup') }, c.all.map((id) => h('button', { type: 'button', class: 'ghost rs-pick', id: `rsPick-${id}`,
            'aria-pressed': String(cur === id), onclick: () => { pred.answers.set('rs.pick', id); keepFocus(draw); } }, [id]))),
          h('div', { class: 'rs-row' }, [h('button', { type: 'button', class: 'primary', id: 'rsPickCheck', onclick: check }, [tw('checkPick')]), show]), msg]);
      }
      if (phase === 'set') {
        const c = step.reveals[0].check;
        if (!pred.answers.has('rs.set')) pred.answers.set('rs.set', new Set());
        const set = pred.answers.get('rs.set');
        const msg = h('p', { class: 'rs-m rs-m-err', id: 'rsPredEmpty', hidden: true }, [tw('emptySet')]);
        const check = () => {
          if (!set.size) { msg.hidden = false; focus(`rsSet-${c.elig[0].id}`); return; }
          hooks.predCheck(step); focus('rsPredFb');
        };
        return h('div', { class: 'rs-predict' }, [
          h('div', { class: 'rs-row', role: 'group', 'aria-label': tw('setGroup', { t: num(step.t) }) }, c.elig.map((x) => h('label', { class: 'rs-check' }, [
            h('input', { type: 'checkbox', id: `rsSet-${x.id}`, checked: set.has(x.id), 'aria-describedby': 'rsPredEmpty',
              onchange: (e) => { if (e.target.checked) set.add(x.id); else set.delete(x.id); } }), ' ', x.id]))),
          h('div', { class: 'rs-row' }, [h('button', { type: 'button', class: 'primary', id: 'rsPredCheck', onclick: check }, [I.t(lang(), 'predict.check')]), show]), msg]);
      }
      const id = step.id;
      const msg = h('p', { class: 'rs-m rs-m-err', id: 'rsPredEmpty', hidden: true }, [tw('emptyStart')]);
      const check = () => {
        if (!String(pred.answers.get('rs.start') || '').trim()) { msg.hidden = false; focus('rsPredStart'); return; }
        hooks.predCheck(step); focus('rsPredFb');
      };
      return h('div', { class: 'rs-predict' }, [h('div', { class: 'rs-row' }, [
        h('label', { class: 'rs-field', for: 'rsPredStart' }, [tw('startLabel', { id })]),
        h('input', { id: 'rsPredStart', value: pred.answers.get('rs.start') || '', size: '5', inputmode: 'numeric', autocomplete: 'off', 'aria-describedby': 'rsPredEmpty',
          oninput: (e) => { pred.answers.set('rs.start', e.target.value); }, onkeydown: (e) => { if (e.key === 'Enter') { e.preventDefault(); check(); } } }),
        h('button', { type: 'button', class: 'primary', id: 'rsPredCheck', onclick: check }, [I.t(lang(), 'predict.check')]), show]), msg]);
    }
    const fbBox = (id, list) => h('div', { class: 'rs-fb', id, tabindex: '-1', role: 'status' }, list.map((x) => h('p', { class: `rs-fb-${x.kind}` }, [
      h('span', { 'aria-hidden': 'true' }, [x.kind === 'ok' ? '✓ ' : '✕ ']), x.text])));
    // Burgess: la suma de cuadrados con cada comienzo de la ventana (después de responder).
    function optsCard(step, yours) {
      const min = Math.min(...step.options.map((o) => o.ssq)); const kk = trace(m).cfg.k; const d = m.p.byId[step.id].d;
      const body = step.options.map((o) => h('tr', { class: [o.s === step.to ? 'chosen' : '', o.s === yours && o.s !== step.to ? 'yours' : ''].join(' ').trim() || null, 'data-s': String(o.s) }, [
        h('th', { scope: 'row' }, [num(o.s)]), h('td', { class: 'num' }, [num(o.s + d)]), h('td', { class: 'num' }, [num(o.ssq)]),
        h('td', {}, [o.s === step.to ? tw('opts.best') : o.ssq === min ? tw('opts.min') : o.s === yours ? tw('opts.yours') : ''])]));
      const head = ['start', 'end', 'ssq', 'mark'].map((x) => h('th', { scope: 'col' }, [tw(`opts.${x}`)]));
      return h('section', { class: 'card rs-card', 'aria-labelledby': 'rsOptsHead' }, [h('h2', { id: 'rsOptsHead' }, [tw('opts.title')]),
        h('div', { class: 'rs-scroll', tabindex: '0', role: 'region', 'aria-label': tw('opts.label', { res: resLow(m, kk), id: step.id }) }, [
          h('table', { class: 'data rs-cmp', id: 'rsOpts' }, [h('thead', {}, [h('tr', {}, head)]), h('tbody', {}, body)])])]);
    }
    // El Gantt con perfiles del paso: lo colocado hasta ahora (o el calendario de Burgess antes o después del movimiento).
    function walkGantt(t0, k, hide) {
      const step = t0[k]; const v = walkView(m, t0, k, hide); const cfg = t0.cfg; const S = v.S;
      const p = m.p; const bur = cfg.kind === 'bur';
      const chainIds = step.kind === 'rsEnd' && step.chains ? new Set(step.chains.flat()) : new Set();
      const U = unitOf(v.T);
      const rows = p.table.map((id) => {
        const a = p.byId[id]; const t = p.times[id]; const s0 = S[id] == null ? null : S[id];
        return { id, s: s0, d: a.d, r: a.r.map(num), es: t.ES, lf: t.LF, crit: bur && t.TF === 0, chain: chainIds.has(id), moved: bur && s0 !== t.ES,
          label: s0 == null ? `${id}: ${tr('place.empty')}` : tr('gantt.bar', { id, s: num(s0), f: num(s0 + a.d), uses: resUses(a) }) };
      });
      const res = m.res.map((r, j) => {
        const u = R.profile(p, Object.fromEntries(Object.entries(S).filter(([, x]) => x != null)), j, v.T); const x = R.stats(u);
        return { label: r.label, cap: r.cap, u, aria: tr('gantt.profile', { res: r.label, peak: num(x.peak), ssq: num(x.ssq), work: num(x.work) }),
          statsText: [tr('gantt.peak', { v: num(x.peak) }), tr('gantt.ssq', { v: num(x.ssq) }), tr('gantt.work', { v: num(x.work) })] };
      });
      let title;
      if (bur) {
        const ssq = stats(m, S, cfg.k).ssq;
        title = step.kind === 'rsEnd' ? tw('ganttEnd', { v: num(ssq) }) : tw(hide ? 'ganttBefore' : 'ganttAfter', { id: step.id, v: num(ssq) });
      } else title = step.kind === 'rsEnd' ? tw('ganttEndSgs') : tw(v.back ? 'ganttPlacedBack' : 'ganttPlaced');
      const holder = h('div', { class: 'rs-gantt', id: 'rsGantt' });
      root.PNL.rsGantt.render(holder, { T: v.T, Tcpm: p.T, unit: U, rows, res, window: bur, caps: !bur, sel: v.sel, emptyText: tr('place.empty'), now: v.now,
        nowText: v.now == null ? null : tw('now', { t: num(v.now) }), label: `${title} · ${m.src.title}`, capText: (x) => tr('gantt.cap', { v: num(x) }) });
      return { card: h('section', { class: 'card rs-card', 'aria-labelledby': 'rsGanttHead' }, [h('h2', { id: 'rsGanttHead' }, [title]),
        h('div', { class: 'rs-scroll rs-gantt-wrap', tabindex: '0', role: 'region', 'aria-label': `${title} · ${m.src.title}` }, [holder]),
        h('p', { class: 'rs-swipe muted small', 'aria-hidden': 'true' }, [tr('gantt.swipe')])]), S, T: v.T };
    }
    function walkDraw() {
      const t0 = trace(m); const n = t0.length - 1; const k = Math.min(state().step, n); const step = t0[k];
      const phase = phaseOf(step); const hide = !!phase;
      const pred = hooks.pred();
      const nar = narration(t0, k, phase);
      const v = walkView(m, t0, k, hide);
      const g = walkGantt(t0, k, hide);
      const parts = [h('h2', { id: 'rsStepHead' }, [nar.title]), v.back ? h('p', { class: 'rs-note', id: 'rsBackNote' }, [tw('backNote')]) : null, h('p', { id: 'rsStepText' }, [nar.text])];
      if (step.kind === 'rsPick' || step.kind === 'rsTime') {
        const chosen = phase ? [] : step.kind === 'rsPick' ? [step.id] : step.started;
        parts.push(eligTable(step, phase === 'start' ? [step.id] : chosen));
      }
      if (phase === 'start') parts.push(fbBox('rsPickFb', feedback(m, t0, k, pred.answers, lang()).slice(0, 1)));
      if (state().pred) {
        parts.push(askBox(step, phase));
        if (!phase && pred.done && pred.step === state().step && pred.result) parts.push(fbBox('rsPredFb', feedback(m, t0, k, pred.answers, lang())));
      }
      const side = [h('section', { class: 'card rs-card rs-step', id: 'rsStepCard', 'aria-labelledby': 'rsStepHead' }, parts)];
      if (step.kind === 'rsMove' && !phase) {
        const yv = PRD().parseAnswer(pred.answers.get('rs.start'));
        side.push(optsCard(step, state().pred && pred.done && pred.result ? yv : null));
      }
      container.appendChild(h('div', { class: 'rs-lev rs-walk' }, [g.card, h('div', { class: 'rs-side' }, side)]));
      const cal = { wc: t0.cfg.kind === 'bur' ? 'bur' : 'sgs', S: g.S, T: g.T };
      for (const el of (t0.cfg.kind === 'bur' ? altTables(cal) : limAltTables(cal))) container.appendChild(el);
      const wkey = `${m.src.id}|${lang()}|${k}|${n}|${phase}`;
      if (wkey !== lastWalk) { lastWalk = wkey; if (hooks.announce) hooks.announce(`${I.t(lang(), 'player.counter', { i: k, n })}. ${nar.title}. ${phase ? I.t(lang(), 'predict.hidden') : nar.text}`); }
    }

    let shown = null;
    function drawLower() {
      if (!lower) return;
      clear(lower); shown = null;
      if (!m.p) return;
      if (m.mode === 'lim') {
        const cal = limCalendar(m, state());
        shown = cal;
        lower.appendChild(h('div', { class: 'rs-lev' }, [limGanttCard(cal), h('div', { class: 'rs-side' }, [durCard(), cal.wc === 'man' ? placeCard(cal) : null, rulesCard(cal)])]));
        lower.appendChild(limRoyCard(cal));
        for (const el of limAltTables(cal)) lower.appendChild(el);
        return;
      }
      if (m.mode !== 'lev') return;
      const cal = calendar(m, state());
      shown = cal;
      lower.appendChild(h('div', { class: 'rs-lev' }, [ganttCard(cal), h('div', { class: 'rs-side' }, [compareCard(), cal.wc === 'man' ? manualCard(cal) : null])]));
      lower.appendChild(royCard(cal));
      for (const el of altTables(cal)) lower.appendChild(el);
    }

    function draw() {
      clear(container);
      ownTable = null; issuesSlot = null;
      container.appendChild(bar());
      if (walking()) { lower = null; walkDraw(); return; }
      container.appendChild(h('div', { class: 'rs-top' }, m.src.kind === 'own' ? [ownCard(), resCard()] : [exampleCard()]));
      lower = h('div', { class: 'rs-lower', id: 'rsLower' });
      container.appendChild(lower);
      drawLower();
    }
    function render(model, opts) {
      // Al teclear no se rehace la tabla (el foco y el cursor no se mueven): se marcan las filas. Si cambia el número de
      // recursos (se nombra o se borra uno), la tabla se rehace con una columna más o menos.
      const typing = opts && opts.fromEditor && m && model.src.kind === 'own' && m.src.kind === 'own' && ownTable && ownTable.isConnected
        && model.src.rows.length === m.src.rows.length && model.res.length === ownK;
      if (!m || model.src.id !== m.src.id || model.mode !== m.mode) { bad = null; sel = null; }
      m = model;
      if (typing) {
        const cut = root.document.getElementById('rsPasteCut');
        if (cut) cut.remove();
        markOwn();
        keepFocus(drawLower);
        return;
      }
      keepFocus(draw);
    }
    function debug() {
      if (!m) return null;
      return { src: { kind: m.src.kind, id: m.src.id }, mode: m.mode, res: m.res.map((r) => ({ label: r.label, cap: r.cap })),
        errors: m.report.errors.map((e) => e.code), warnings: m.report.warnings.map((e) => e.code).filter((c) => c === 'noUse'), ok: !!m.p,
        cal: shown ? shown.wc : null, k: m.p ? levelK(m, state()) : null, moves: shown && shown.moves ? shown.moves : [], unit: m.p ? unitOf(m.p.T) : null,
        T: shown && shown.T != null ? shown.T : null, chains: shown && shown.chains ? shown.chains : [],
        walk: walking() ? (() => { const t0 = trace(m); const k = Math.min(state().step, t0.length - 1); return { k, n: t0.length - 1, kind: t0[k].kind, phase: phaseOf(t0[k]) }; })() : null };
    }
    function leave() { /* T009: nada que parar */ }
    return { render, debug, leave };
  }

  const api = { FIELDS, LEV, source, resources, model, levelK, stats, levData, moveCheck, moveText, manual, withMove, calendar, compareRows, LIM, limData, placeCheck, placeText, manualLim, withPlace, limCalendar, chainMarks, walkCfg, trace, keyCols, keyLabel, walkView, feedback, resRows, resFromRows, issueText, rowMarks, workRows, pasteRows, create };
  root.PNL = root.PNL || {};
  root.PNL.rsTab = api;
  if (isNode) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
