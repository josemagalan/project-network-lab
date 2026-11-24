/*
 * gpr — controlador de la pestaña «Precedencias generalizadas» (spec f5a-precedencias-generalizadas; plan §4, P1, P7, P12;
 * tableros 114, 115, 120 y 121). T010: la barra (proyecto y «Partir del taller»), la tabla (fichas de solo lectura en los
 * ejemplos; editable con «Tabla propia», con el error o el aviso de cada fila) y la red ROY con la relación escrita en cada
 * arco, sus tiempos y su tabla de tiempos y holguras (la alternativa en texto de la red). T011: el paso a paso con
 * predicción (tablero 116), del paso 1 en adelante: en el paso 0 (la tabla) se ve la pestaña de siempre. La PERT
 * equivalente (T013, tablero 117: «Redes», la PERT por piezas, la relación elegida en las dos redes y el resumen) y el
 * «¿Y si…?» (T014). T012: el Gantt con las relaciones (tablero 118, views/gpr-gantt), con su
 * nota, su leyenda y su tabla; no se ve en el paso a paso. La pestaña no se ve en la barra hasta T015.
 *
 * Los códigos de las relaciones van con la notación elegida en «Ajustes» (FS, SS, FF, SF o FC, CC, FF, CF; decisión del
 * autor en T010, spec AC16) y las cifras, con el idioma. La parte sin DOM (source, model, code, relTag, relText, issueText,
 * rowMarks, labels, critEdges, pasteRows, walkTrace, asked, terms, narration, ganttRows, ganttNote) se prueba en Node (tests/gpr-tab.test.js); create() pinta la vista. Para las
 * pruebas de navegador, PNL.gprTab.state() da lo pintado.
 */
(function (root) {
  'use strict';

  const isNode = typeof module !== 'undefined' && module.exports;
  const req = (path, name) => (isNode ? require(path) : root.PNL[name]);
  const I = req('./i18n.js', 'i18n');
  if (isNode) require('./i18n-gpr.js');
  const P = req('./core/project.js', 'project');
  const C = req('./core/cpm.js', 'cpm');
  const G = req('./core/gpr.js', 'gpr');
  const X = req('./core/gprex.js', 'gprex');
  const GP = req('./core/gprpert.js', 'gprpert');
  const U = req('./core/urlstate.js', 'urlstate');
  const NR = req('./narrate.js', 'narrate');
  const { START, END } = req('./core/topo.js', 'topo');

  const FIELDS = ['id', 'name', 'duration', 'links'];
  // Campo de la fila que señala cada código de core/gpr.
  const FIELD = { badId: 'id', reservedId: 'id', duplicateId: 'id', badDuration: 'duration', badRel: 'links', unknownRef: 'links', selfRel: 'links', dupRel: 'links', ssLong: 'links' };
  const TOL = 1e-9;
  const str = (v) => (v == null ? '' : String(v));
  const blank = () => ({ id: '', name: '', duration: '', links: '' });

  // ---------- Escritura de las relaciones ----------

  /** Código de un tipo canónico con la notación: FS, SS, FF, SF (anglosajona) o FC, CC, FF, CF (española). */
  const code = (type, nota) => (nota === 'es' ? G.ES_NAME[type] : type);
  /** Una cifra con el separador decimal del idioma, sin redondear (un desfase se escribe como se leyó). */
  const numTxt = (v, lang) => (lang === 'es' ? String(v).replace('.', ',') : String(v));
  /** La etiqueta del arco: tipo y desfase con su signo («SS+2», «FF», «FF-1,5»). */
  const relTag = (r, nota, lang) => `${code(r.type, nota)}${r.lag ? `${r.lag < 0 ? '-' : '+'}${numTxt(Math.abs(r.lag), lang)}` : ''}`;
  /** La relación como se escribe en la tabla: «B» (FS+0) o «B SS+2». */
  const relText = (r, nota, lang) => (r.type === 'FS' && !r.lag ? r.from : `${r.from} ${relTag(r, nota, lang)}`);
  const plain = (r) => r.type === 'FS' && !r.lag;

  // ---------- El proyecto ----------

  /** El proyecto de la pestaña: la tabla propia (como la escribe el alumno) o un ejemplo de core/gprex, en el idioma. */
  function source(state, lang) {
    if (state.qe === 'own' && state.qt) {
      return { kind: 'own', id: 'own', rows: state.qt.map((r) => ({ id: str(r.id), name: str(r.name), duration: str(r.duration), links: str(r.links) })),
        title: I.t(lang, 'gpr.own'), unit: '', source: '' };
    }
    const ex = X.get(state.qe) || X.get('fc');
    return { kind: 'example', id: ex.id, rows: ex.rows.map((r) => ({ id: r.id, name: r.name && typeof r.name === 'object' ? r.name[lang] : str(r.name), duration: r.duration, links: r.links })),
      title: ex.title[lang], unit: ex.unit[lang], source: ex.source[lang] };
  }

  /** Lo que pinta la pestaña: la fuente, el proyecto leído (o null), sus errores y avisos y la solución. */
  function model(state, lang) {
    const src = source(state, lang);
    const parsed = G.parse(src.rows);
    const report = parsed.report;
    let project = parsed.project;
    let solution = project ? G.solve(project) : null;
    // «¿Y si…?» (T014, AC11): con qw, toda la pestaña es la del proyecto con la duración nueva; whatIf guarda la de partida.
    let whatIf = null;
    const w = state.qw;
    const act = project && Array.isArray(w) && project.activities.find((a) => a.id === w[0]);
    if (act) {
      const r = G.whatIf(project, act.id, w[1]);
      whatIf = { id: act.id, d0: act.d, d: w[1], before: r.before, after: r.after, delta: r.delta, changed: r.changed, base: project, baseSol: solution };
      project = r.gp; solution = r.sol;
    }
    const m = { src, gp: project, report, empty: !project && !report.errors.length, solution, whatIf };
    m.trace = walkTrace(m);
    return m;
  }

  // ---------- Errores y avisos ----------

  /** El texto de un error o un aviso de la tabla, sin «Fila n» (va en su fila, o en la lista si no tiene fila). */
  function issueText(is, m, lang, nota) {
    const tt = (k, p) => I.t(lang, `gpr.issue.${k}`, p);
    const ids = (is.ids || []).join(', ');
    switch (is.code) {
      case 'reservedId': return tt(G.CODE[is.ids[0]] ? 'reservedCode' : 'reservedNode', { ids });
      case 'badRel': return tt('badRel', { text: is.text, cell: str(m.src.rows[is.row].links).trim(), ss: code('SS', nota) });
      case 'dupRel': return tt('dupRel', { type: code(is.type, nota), a: is.ids[0] });
      case 'cycle': return I.t(lang, 'issue.cycle', { ids });
      case 'ssLong': {
        const a = is.ids[0];
        const d = P.parseDuration(m.src.rows.find((r) => str(r.id).trim().toUpperCase() === a).duration);   // también con errores
        return tt('ssLong', { rel: relTag({ type: 'SS', lag: is.lag }, nota, lang), a, d: numTxt(d, lang),
          equiv: `${a} ${relTag({ type: 'FS', lag: is.equiv }, nota, lang)}` });
      }
      default: return tt(is.code, { ids });
    }
  }

  /** Marcas de la tabla propia: por fila, los campos con error, los avisos y sus textos; aparte, los errores sin fila. */
  function rowMarks(m, lang, nota) {
    const rows = new Map();
    const general = [];
    const at = (i) => { if (!rows.has(i)) rows.set(i, { bad: new Set(), warn: new Set(), msgs: [] }); return rows.get(i); };
    for (const is of m.report.errors) {
      if (is.row == null) { general.push(issueText(is, m, lang, nota)); continue; }
      const r = at(is.row);
      r.bad.add(FIELD[is.code]);
      r.msgs.push({ kind: 'err', text: issueText(is, m, lang, nota) });
    }
    for (const is of m.report.warnings) {
      const r = at(is.row);
      r.warn.add(FIELD[is.code]);
      r.msgs.push({ kind: 'warn', text: issueText(is, m, lang, nota) });
    }
    // Las filas con error, por su identificador (o su número si no lo tiene), en el orden de la tabla.
    const badRows = [...rows.entries()].filter(([, r]) => r.bad.size).map(([i]) => i).sort((a, b) => a - b)
      .map((i) => str(m.src.rows[i].id).trim().toUpperCase() || String(i + 1));
    return { rows, general, badRows };
  }

  // ---------- La red ROY ----------

  /** Las relaciones que llevan etiqueta: todas menos una FS+0 que va sola en su flecha (tablero 115). Si comparte flecha
   *  con otra relación, la lleva: sin ella, la flecha se leería como una sola relación (revisión de cierre, I-F5). */
  function labelled(gp) {
    const per = new Map();
    for (const r of gp.rels) { const k = `${r.from}>${r.to}`; per.set(k, (per.get(k) || 0) + 1); }
    return (r) => !plain(r) || per.get(`${r.from}>${r.to}`) > 1;
  }
  /** Etiquetas de los arcos: Map('U>V' → [{ text, title }]), sin las FS+0 que van solas en su flecha (tablero 115). */
  function labels(gp, nota, lang) {
    const out = new Map();
    const shown = labelled(gp);
    for (const r of gp.rels) {
      if (!shown(r)) continue;
      const k = `${r.from}>${r.to}`;
      if (!out.has(k)) out.set(k, []);
      out.get(k).push({ rel: gp.rels.indexOf(r), text: relTag(r, nota, lang), title: `${r.from} → ${r.to}: ${I.t(lang, `gpr.relName.${r.type}`)}${r.lag ? ` ${relTag(r, nota, lang).slice(code(r.type, nota).length)}` : ''}` });
    }
    return out;
  }

  /** Las relaciones con etiqueta, en texto (la alternativa de la red ROY). */
  const relList = (gp, nota, lang) => { const shown = labelled(gp); return gp.rels.filter(shown).map((r) => `${r.from} → ${r.to} ${relTag(r, nota, lang)}`); };

  /** La estructura de la red (cada par de actividades relacionadas, una flecha) como proyecto de core/project. */
  const structure = (gp) => G.toCpm(Object.assign({}, gp, { rels: gp.rels.map((r) => Object.assign({}, r, { type: 'FS', lag: 0 })) }));

  /** Flechas críticas: las relaciones que mandan entre críticas, la del Inicio a las críticas que empiezan en 0 y la de las
   *  críticas que acaban en T al Fin (solo las que dibuja la red: sin predecesoras o sin sucesoras). */
  function critEdges(gp, sol, cp) {
    const out = new Set(sol.critRels.map((k) => `${gp.rels[k].from}>${gp.rels[k].to}`));
    for (const id of sol.critical) {
      if (!cp.preds[id].length && Math.abs(sol.times[id].ES) < TOL) out.add(`${START}>${id}`);
      if (!cp.succs[id].length && Math.abs(sol.times[id].EF - sol.duration) < TOL) out.add(`${id}>${END}`);
    }
    return out;
  }

  // ---------- El paso a paso (T011) ----------

  /** La traza del reproductor: la de core/gpr; en el paso de las clases (T014, A6) se predice la de cada crítica que tiene
   *  una (con duración 0 no se puede acortar y no la tiene). Sin solución, null. */
  const walkTrace = (m) => (m.solution ? G.trace(m.gp, m.solution).map((x) => (x.kind !== 'gprClasses' ? x : Object.assign({}, x, {
    reveals: m.solution.critical.filter((id) => x.classes[id] && x.classes[id].cls).map((id) => ({ act: id, field: 'gpr.cls', value: x.classes[id].cls })) }))) : null);
  const ASK = { gprForward: ['ES'], gprBackward: ['LS'], gprEnd: ['T'] };
  /** Lo que se predice en cada paso: ES hacia delante, LS hacia atrás, T y cada holgura (EF y LF salen solas). */
  const asked = (step) => (step.kind === 'gprFloat' || step.kind === 'gprClasses' ? step.reveals : step.reveals.filter((rv) => (ASK[step.kind] || []).includes(rv.field)));
  const askedStep = (step) => Object.assign({}, step, { reveals: asked(step) });

  /** Los términos de un paso de las pasadas: rótulo, fórmula con siglas (expr), con cifras (calc; null en el inicio), valor
   *  y si manda. Hacia delante, sobre ES(j); hacia atrás, sobre LS(i) (plan §0). */
  function terms(step, gp, sol, nota, lang) {
    const N = I.notation(nota);
    const n = (v) => NR.fmt(lang, v);
    const d = (id) => gp.activities.find((a) => a.id === id).d;
    const tm = sol.times;
    const chosen = new Set(step.formula.chosen);
    const fwd = step.kind === 'gprForward';
    const join = (items) => items.map(([sg, x], i) => (i ? ` ${sg} ${x}` : x)).join('');
    return step.formula.terms.map((t) => {
      const out = { key: t.key, value: t.value, chosen: chosen.has(t.key) };
      if (t.rel === null) {
        if (fwd) return Object.assign(out, { label: I.t(lang, 'gpr.walk.start'), expr: '0', calc: null });
        return Object.assign(out, { label: I.t(lang, 'gpr.walk.end'), expr: `T − d(${step.act})`, calc: `${n(sol.duration)} − ${n(d(step.act))}` });
      }
      const r = gp.rels[t.rel];
      out.label = `${r.from} → ${r.to}${plain(r) ? '' : ` ${relTag(r, nota, lang)}`}`;
      const finish = r.type === 'FS' || r.type === 'FF';   // la relación sale del fin de la predecesora
      const onFinish = r.type === 'FF' || r.type === 'SF';  // y actúa sobre el fin de la sucesora
      let sym; let num;
      if (fwd) {
        const f = finish ? 'EF' : 'ES';
        sym = [['', `${N[f]}(${r.from})`]]; num = [['', n(tm[r.from][f])]];
        if (r.lag) { const sg = r.lag < 0 ? '−' : '+'; sym.push([sg, n(Math.abs(r.lag))]); num.push([sg, n(Math.abs(r.lag))]); }
        if (onFinish) { sym.push(['−', `d(${r.to})`]); num.push(['−', n(d(r.to))]); }
      } else {
        const f = onFinish ? 'LF' : 'LS';
        sym = [['', `${N[f]}(${r.to})`]]; num = [['', n(tm[r.to][f])]];
        if (r.lag) { const sg = r.lag < 0 ? '+' : '−'; sym.push([sg, n(Math.abs(r.lag))]); num.push([sg, n(Math.abs(r.lag))]); }
        if (finish) { sym.push(['−', `d(${r.from})`]); num.push(['−', n(d(r.from))]); }
      }
      return Object.assign(out, { expr: join(sym), calc: join(num) });
    });
  }

  /** Título y texto de un paso. Con o.hide (predicción sin comprobar) dice qué se calcula, no quién manda ni el valor. */
  function narration(step, m, o) {
    const { lang, nota, hide } = o;
    const N = I.notation(nota);
    const tw = (k, p) => I.t(lang, `gpr.walk.${k}`, p);
    const n = (v) => NR.fmt(lang, v);
    const sol = m.solution; const gp = m.gp;
    const c = (x) => code(x, nota);
    const id = step.act;
    if (step.kind === 'gprForward' || step.kind === 'gprBackward') {
      const fwd = step.kind === 'gprForward';
      const f = fwd ? N.ES : N.LS;
      const title = tw(fwd ? 'fwdTitle' : 'bwdTitle', { id });
      const rows = terms(step, gp, sol, nota, lang);
      const rels = rows.filter((r, i) => step.formula.terms[i].rel !== null);
      if (!rels.length) {
        const text = tw(fwd ? 'fwdFirst' : 'bwdLast', { id, f });
        return { title, text: hide ? text : `${text} ${line(fwd, id)}` };
      }
      if (hide) return { title, text: tw(fwd ? 'fwdHidden' : 'bwdHidden', { id, f }) };
      const parts = [tw(fwd ? 'fwdText' : 'bwdText', { id, f })];
      const win = rows.filter((r) => r.chosen);
      const relWin = win.filter((r) => r.key !== START && r.key !== END);
      if (relWin.length) {
        parts.push(relWin.length === 1 ? tw('governsOne', { term: relWin[0].label, v: n(relWin[0].value) })
          : tw('governsMany', { terms: I.list(lang, relWin.map((r) => r.label)), v: n(relWin[0].value) }));
        for (const r of relWin) {
          const rel = gp.rels[step.formula.terms[rows.indexOf(r)].rel];
          parts.push(tw(`${fwd ? 'meanFwd' : 'meanBwd'}${rel.lag ? '' : 'NoLag'}.${rel.type}`, { code: c(rel.type), from: rel.from, to: rel.to }));
        }
      } else if (fwd) parts.push(rels.some((r) => r.value < 0) ? tw('clamp') : tw('startGoverns', { id }));
      else parts.push(tw('endGoverns', { id }));
      parts.push(line(fwd, id));
      return { title, text: parts.join(' ') };
    }
    if (step.kind === 'gprEnd') {
      const title = tw('endTitle');
      if (hide) return { title, text: tw('endHidden', { ef: N.EF }) };
      let text = tw('endText', { ef: N.EF, ss: c('SS'), sf: c('SF'), T: n(sol.duration), ids: I.list(lang, step.endBy) });
      if (step.notFinal.length) text += ` ${I.t(lang, `gpr.net.${step.notFinal.length === 1 ? 'notFinalOne' : 'notFinalMany'}`, { ids: I.list(lang, step.notFinal) })}`;
      return { title, text };
    }
    if (step.kind === 'gprFloat') {
      const text = tw(`floatText.${step.float}`, { tf: N.TF, ff: N.FF, ls: N.LS, es: N.ES, ef: N.EF });
      return { title: tw(`floatTitle.${step.float}`), text: hide ? `${text} ${tw('floatAsk')}` : text };
    }
    if (step.kind === 'gprClasses') {
      let text = tw('clsText');
      const zero = m.solution.critical.filter((id) => step.classes[id] && !step.classes[id].cls);
      if (zero.length) text += ` ${tw('clsZero', { ids: I.list(lang, zero) })}`;
      return { title: tw('clsTitle'), text: hide ? `${text} ${tw('clsAsk')}` : text };
    }
    if (step.kind === 'gprCritical') {
      const paths = step.paths.map((p) => p.acts.join('–'));
      const cut = step.pathsCut ? ` ${tw('pathCut', { n: paths.length })}` : '';
      return { title: tw('critTitle'), text: `${tw('critText', { tf: N.TF, list: I.list(lang, step.critical) })} ${tw(paths.length === 1 ? 'pathOne' : 'pathMany', { p: paths.join('; ') })}${cut}` };
    }
    return { title: '', text: '' };
    // EF = ES + d (hacia delante) o LF = LS + d (hacia atrás), con las cifras.
    function line(fwd, a) {
      const t = sol.times[a]; const dd = gp.activities.find((x) => x.id === a).d;
      return fwd ? tw('efLine', { ef: N.EF, es: N.ES, id: a, a: n(t.ES), d: n(dd), b: n(t.EF) })
        : tw('lfLine', { lf: N.LF, ls: N.LS, id: a, a: n(t.LS), d: n(dd), b: n(t.LF) });
    }
  }

  // ---------- El Gantt (T012, tablero 118) ----------

  /** La tabla del Gantt (su alternativa en texto): por comienzo temprano, como las barras, cada actividad con su comienzo y
   *  su fin a las fechas elegidas, su holgura total, si es crítica y las relaciones que llegan a ella con la notación. */
  function ganttRows(m, late, nota, lang) {
    const gp = m.gp; const sol = m.solution;
    const crit = new Set(sol.critical);
    return gp.activities.map((a, i) => [a, i])
      .sort(([a, i], [b, j]) => sol.times[a.id].ES - sol.times[b.id].ES || a.id.localeCompare(b.id) || i - j)
      .map(([a]) => {
        const t = sol.times[a.id];
        return { id: a.id, start: late ? t.LS : t.ES, finish: late ? t.LF : t.EF, tf: sol.floats[a.id].TF, crit: crit.has(a.id),
          arrives: gp.rels.filter((r) => r.to === a.id).map((r) => `${r.from} ${relTag(r, nota, lang)}`) };
      });
  }

  /** La nota del Gantt (tablero 118): en las dos primeras críticas cuyo comienzo temprano lo fija una relación que no es FS sin
   *  desfase, cuál es (lo que el Gantt enseña y una red de solo FS no tendría). */
  function ganttNote(m, nota, lang) {
    const out = [];
    const crit = new Set(m.solution.critical);
    const steps = m.trace.filter((x) => x.kind === 'gprForward' && crit.has(x.act))
      .sort((a, b) => m.solution.times[a.act].ES - m.solution.times[b.act].ES || a.act.localeCompare(b.act));
    for (const st of steps) {
      if (out.length === 2) break;
      const t = st.formula.terms.find((x) => x.rel !== null && st.formula.chosen.includes(x.key) && !plain(m.gp.rels[x.rel]));
      if (!t) continue;
      const r = m.gp.rels[t.rel];
      out.push(I.t(lang, 'gpr.gantt.note', { id: st.act, t: NR.fmt(lang, m.solution.times[st.act].ES), term: `${r.from} → ${r.to} ${relTag(r, nota, lang)}` }));
    }
    return out;
  }

  /** El Gantt del paso a paso (T014b, petición del autor; plan §4): progresivo, sin revelar lo que se predice. Filas en el
   *  orden de la pasada (fijas); hacia delante, las barras ya calculadas a fechas tempranas; hacia atrás, las tempranas de
   *  fondo y las tardías ya calculadas. En cada paso de las pasadas, una flecha por relación de la tabla de términos, con sus
   *  tiempos exactos (t0 en la predecesora, t1 = t0 + desfase en la sucesora), y el inicio (0) o el fin (T) como línea
   *  vertical en la fila del paso: la que manda, «chosen»; las demás, «compared». Del fin del proyecto en adelante, todo a
   *  fechas tempranas con las holguras, y las críticas desde su paso. En el paso 0 (la tabla), null. */
  function ganttWalk(m, k, hide) {
    const tr = m.trace; const gp = m.gp; const sol = m.solution;
    if (!tr || k < 1 || k >= tr.length) return null;
    const step = tr[k];
    const order = tr.filter((x) => x.kind === 'gprForward').map((x) => x.act);
    const done = (kind) => tr.slice(1, k).filter((x) => x.kind === kind).map((x) => x.act);
    const w = { kind: step.kind, order, late: false, bars: order.slice(), ghosts: false, crit: false, floats: false, values: !hide, act: step.act || null, arrows: [], lines: [] };
    const tm = sol.times;
    if (step.formula) {
      const fwd = step.kind === 'gprForward';
      w.late = !fwd; w.ghosts = !fwd;
      w.bars = done(step.kind).concat(hide ? [] : [step.act]);
      for (const t of step.formula.terms) {
        const cls = !hide && step.formula.chosen.includes(t.key) ? 'chosen' : 'compared';
        if (t.rel === null) { w.lines.push({ at: fwd ? 0 : sol.duration, act: step.act, cls }); continue; }
        const r = gp.rels[t.rel];
        let t0; let t1;
        if (fwd) { t0 = tm[r.from][r.type[0] === 'S' ? 'ES' : 'EF']; t1 = t0 + r.lag; } else { t1 = tm[r.to][r.type[1] === 'S' ? 'LS' : 'LF']; t0 = t1 - r.lag; }
        w.arrows.push({ rel: t.rel, from: r.from, to: r.to, t0, t1, cls });
      }
      return w;
    }
    if (step.kind === 'gprEnd') {
      if (!hide) w.lines.push({ at: sol.duration, act: null, cls: 'chosen' });
      return w;
    }
    // Holguras, críticas y clases: el Gantt entero a fechas tempranas; las críticas, desde su paso.
    w.floats = true;
    w.crit = k >= tr.findIndex((x) => x.kind === 'gprCritical');
    const critRels = new Set(sol.critRels);
    w.arrows = gp.rels.map((r, i) => {
      const t0 = tm[r.from][r.type[0] === 'S' ? 'ES' : 'EF'];
      const t1 = tm[r.to][r.type[1] === 'S' ? 'ES' : 'EF'];
      return { rel: i, from: r.from, to: r.to, t0, t1, cls: w.crit && critRels.has(i) ? 'crit' : '' };
    });
    w.values = false;
    return w;
  }

  // ---------- «¿Y si…?» y las clases (T014, tablero 119) ----------

  /** La actividad que propone el «¿Y si…?» al abrirse: la primera crítica que no es normal, o la primera crítica. */
  function whatIfStart(m) {
    const sol = m.solution;
    return sol.critical.find((id) => sol.classes[id] && sol.classes[id].cls && sol.classes[id].cls !== 'normal') || sol.critical[0] || m.gp.activities[0].id;
  }
  /** En el paso a paso, con un «¿Y si…?» que cambia una duración, la nota que lo dice (revisión de cierre, I-F3); si no, null. */
  function walkWhatIfNote(m, lang) {
    const w = m.whatIf;
    if (!w || Math.abs(w.d - w.d0) < TOL) return null;
    return I.t(lang, 'gpr.wi.walkNote', { id: w.id, d: NR.fmt(lang, w.d), d0: NR.fmt(lang, w.d0) });
  }
  /** Lo que dice el «¿Y si…?»: alargar o acortar, cómo cambia la duración del proyecto y qué fechas se mueven. */
  function whatIfText(m, lang) {
    const w = m.whatIf;
    if (!w || Math.abs(w.d - w.d0) < TOL) return [];
    const tw = (k, p) => I.t(lang, `gpr.wi.${k}`, p);
    const n = (v) => NR.fmt(lang, v);
    const act = tw(w.d > w.d0 ? 'longer' : 'shorter', { id: w.id, d0: n(w.d0), d: n(w.d) });
    const eff = w.delta > TOL ? 'up' : w.delta < -TOL ? 'down' : 'same';
    return [tw(eff, { act, T0: n(w.before), T1: n(w.after) }), w.changed.length ? tw('changed', { list: I.list(lang, w.changed) }) : tw('noChange')];
  }
  /** Las actividades críticas con el efecto de alargarlas y de acortarlas ('+', '-', '0'; null si no se puede) y su clase. */
  const classRows = (m) => m.solution.critical.map((id) => { const c = m.solution.classes[id]; return { id, up: c.up, down: c.down, cls: c.cls }; });

  // ---------- La PERT equivalente y la sincronía (T013, tablero 117) ----------

  /** Una relación como se nombra fuera de la tabla: «V → Y FF+6» (las FS sin desfase, «G → M»). */
  const relName = (r, nota, lang) => `${r.from} → ${r.to}${plain(r) ? '' : ` ${relTag(r, nota, lang)}`}`;
  let pertCache = { key: null, b: null };
  /** La PERT equivalente de core/gprpert (la última, guardada: no se rehace al cambiar de relación o de vista). */
  function pertOf(m) {
    if (!m.solution) return null;
    const key = JSON.stringify([m.gp.activities.map((a) => [a.id, a.d]), m.gp.rels.map((r) => [r.from, r.to, r.type, r.lag])]);
    if (pertCache.key !== key) pertCache = { key, b: GP.build(m.gp) };
    return pertCache.b;
  }

  let rvCache = null;
  /** Las cifras del ejemplo de la crítica al revés (para la nota), calculadas una vez y sin tocar la PERT guardada. */
  function rvFigures() {
    if (!rvCache) {
      const gp = G.parse(X.get('rv').rows).project;
      const b = GP.build(gp);
      rvCache = { T: G.solve(gp).duration, tp: b.Tpert, ids: [...new Set(b.gaps.map((g) => g.act))] };
    }
    return rvCache;
  }

  /** Las dos redes en cifras: elementos y duración; en la PERT, las actividades partidas en el tiempo (con su hueco) y las
   *  relaciones que no se pueden dibujar. Los trozos de duración 0 cuentan como ficticias (P4). */
  function pertSummary(m, nota, lang) {
    const b = pertOf(m); const acts = b.pieces.acts;
    const zero = acts.filter((a) => a.zero).length;
    return { roy: { acts: m.gp.activities.length, rels: m.gp.rels.length, T: m.solution.duration },
      pert: { pieces: acts.filter((a) => !a.wait && !a.zero).length, waits: b.pieces.waits.length, dummies: b.net.dummies.length + zero, events: b.net.events.length, T: b.Tpert },
      gaps: b.gaps.map((g) => ({ act: g.act, gap: g.gap })), omitted: b.omitted.map((k) => relName(m.gp.rels[k], nota, lang)) };
  }

  /** Lo que se resalta con la relación k elegida: su flecha en la ROY y sus trozos, esperas y ficticias en la PERT. */
  function relMarks(m, k) {
    if (k == null || !m.gp || !m.gp.rels[k]) return null;
    const r = m.gp.rels[k];
    const mp = pertOf(m).map[k];
    return { rel: k, roy: new Map([[`${r.from}>${r.to}`, 'chosen']]), pert: new Map(mp ? [...mp.arcs, ...mp.dummies].map((x) => [x, 'chosen']) : []) };
  }
  /** Las relaciones que representa un arco de la PERT (un trozo puede estar en varias; una ficticia, en una o en ninguna). */
  function relsOfArc(m, label) {
    const map = pertOf(m).map;
    return Object.keys(map).map(Number).sort((a, b) => a - b).filter((k) => map[k].arcs.includes(label) || map[k].dummies.includes(label));
  }
  // La siguiente de la lista: la primera si la elegida no está en ella; si está, la de después (se pasa de una a otra).
  const cycle = (list, cur) => (!list.length ? null : list[(list.indexOf(cur) + 1) % list.length]);
  /** La relación que se elige al pulsar un arco de la PERT. */
  const pickFromArc = (m, label, cur) => cycle(relsOfArc(m, label), cur);
  /** La relación que se elige al pulsar una flecha de la ROY (rel = null) o su etiqueta (rel, la suya). */
  function pickFromEdge(m, key, rel, cur) {
    if (rel != null) return rel;
    const [u, v] = key.split('>');
    return cycle(m.gp.rels.map((r, k) => [r, k]).filter(([r]) => r.from === u && r.to === v).map(([, k]) => k), cur);
  }
  /** Las relaciones de la lista «Relación». */
  const relOptions = (m, nota, lang) => m.gp.rels.map((r, k) => ({ rel: k, text: relName(r, nota, lang) }));

  /** La explicación de la relación k: cómo está en la PERT, cómo se parten sus actividades y los huecos que quedan. */
  function relExplain(m, k, nota, lang) {
    const r = m.gp.rels[k];
    const b = pertOf(m);
    const tp = (key, p) => I.t(lang, `gpr.pert.${key}`, p);
    const n = (v) => NR.fmt(lang, v);
    const head = relName(r, nota, lang);
    const mp = b.map[k];
    if (!mp) return { head, lines: [tp('omittedRel')] };
    const acts = Object.fromEntries(b.pieces.acts.map((a) => [a.id, a]));
    const name = (x) => (acts[x] && acts[x].wait ? `${tp('wait')} ${n(acts[x].d)}` : x);
    const path = mp.arcs.map(name).join(' → ');
    const dm = mp.dummies.length ? tp(mp.dummies.length === 1 ? 'withDummy' : 'withDummies', { list: I.list(lang, mp.dummies) }) : '';
    const lines = [mp.startOf ? tp('inPertStart', { path, id: mp.startOf, dm }) : tp('inPert', { path, dm })];
    const own = [...new Set([r.from, r.to])];
    for (const a of own) {
      const ps = b.pieces.pieceAt[a];
      if (ps.length > 1) lines.push(tp('split', { id: a, list: I.list(lang, ps.map((x) => `${x.id} (${n(x.d)})`)) }));
    }
    for (const g of b.gaps) if (own.includes(g.act)) lines.push(tp('gap', { g: n(g.gap), a: g.after, b: g.before }));
    return { head, lines };
  }

  /** Filas pegadas de una hoja de cálculo (actividad, nombre, duración y predecesoras), como en el taller. */
  function pasteRows(text) {
    return P.parsePasted(text).map((r) => ({ id: str(r.id), name: str(r.name), duration: str(r.duration), links: str(r.links) }));
  }
  /** «Partir del taller»: una predecesora repetida («A, A») la admite el taller, pero en la pestaña son dos relaciones
   *  iguales (dupRel). Con predecesoras, si la tabla se lee, esas filas pasan a la lista sin repetir; las demás, tal cual
   *  (revisión de cierre, N-F11). Va aquí y no en store.js, que es de la base: «Ejercicios» está al borde de 1 MB. */
  function workRows(rows, mode) {
    if (mode === 'succ') return rows;
    const { project } = P.parse(rows, 'pred');
    if (!project) return rows;
    const toks = (x) => str(x).split(/[\s,;]+/).filter(Boolean).map((v) => v.toUpperCase());
    return rows.map((r) => {
      const t = toks(r.links);
      const id = str(r.id).trim().toUpperCase();
      return new Set(t).size < t.length && project.preds[id] ? Object.assign({}, r, { links: project.preds[id].join(', ') }) : r;
    });
  }
  /** Largo máximo de cada casilla de la tabla propia: el del enlace (urlstate.LIMITS), que es también su maxlength. */
  const FIELD_MAX = { id: U.LIMITS.id, name: U.LIMITS.name, duration: U.LIMITS.duration, links: U.LIMITS.links };
  /** Las filas de ahora con las pegadas, recortadas a lo que cabe en la tabla (filas y largo de cada casilla), y si se ha
   *  recortado algo: el estado lo recortaría en silencio (revisión de cierre, N-F5 e I-F1). */
  function pasteFit(now, pasted) {
    let cut = now.length + pasted.length > U.LIMITS.rows;
    const rows = now.concat(pasted).slice(0, U.LIMITS.rows).map((r) => {
      const out = {};
      for (const f of FIELDS) { const v = str(r[f]); if (v.length > FIELD_MAX[f]) cut = true; out[f] = v.slice(0, FIELD_MAX[f]); }
      return out;
    });
    return { rows, cut };
  }

  // ---------- La vista ----------

  function create(container, hooks) {
    const { h, clear } = root.PNL.dom;
    const lang = () => hooks.lang();
    const state = () => hooks.state();
    const nota = () => state().nota;
    const tg = (k, p) => I.t(lang(), `gpr.${k}`, p);
    const num = (v) => NR.fmt(lang(), v);
    let m = null;
    const go = (action, opts) => hooks.dispatch(Object.assign({ type: 'gpr' }, action), opts);

    function focus(id) { const el = root.document.getElementById(id); if (el) el.focus(); }
    function keepFocus(fn) {
      const a = root.document.activeElement;
      const id = a && container.contains(a) ? a.id : null;
      fn();
      if (id) { const el = root.document.getElementById(id); if (el) el.focus(); }
    }
    const button = (label, onclick, attrs) => h('button', Object.assign({ type: 'button', class: 'ghost', onclick }, attrs || {}), [label]);

    // ---------- Barra (tablero 114: proyecto y «Partir del taller»; lo demás llega con sus tareas) ----------
    function bar() {
      const sel = h('select', { id: 'gprProj', onchange: (e) => pickProject(e.target.value) },
        X.list().map((ex) => h('option', { value: ex.id, selected: m.src.id === ex.id }, [ex.title[lang()]]))
          .concat([h('option', { value: 'own', selected: m.src.kind === 'own' }, [tg('own')])]));
      const on = walking();
      return h('div', { class: 'card gpr-bar' }, [h('div', { class: 'gpr-row' }, [
        h('label', { class: 'gpr-field' }, [tg('project'), ' ', sel]),
        button(tg('fromWork'), fromWork, { id: 'gprFromWork' }),
        // «Redes» (T013, tablero 117): la ROY, la PERT equivalente o las dos (qn, por defecto las dos). No sale en el paso a paso,
        // que solo enseña la ROY (T016: así la barra cabe en una línea a 1280 px con «Modo predicción»).
        on ? null : h('div', { class: 'seg', role: 'group', 'aria-label': tg('nets.label') }, [h('span', { class: 'gpr-seglab', 'aria-hidden': 'true' }, [tg('nets.label')]),
          ...[['roy', 'gprNetRoy'], ['pert', 'gprNetPert'], ['both', 'gprNetBoth']].map(([v, id]) => h('button', { type: 'button', id, 'aria-pressed': String(nets() === v),
            onclick: () => { go({ qn: v }); focus(id); } }, [tg(`nets.${v}`)]))]),
        // «Gantt» (T012, tablero 118): se abre a fechas tempranas (qg=1); las tardías se eligen junto al dibujo (qg=2).
        h('div', { class: 'seg', role: 'group', 'aria-label': tg('gantt.toggle') }, [h('button', { type: 'button', id: 'gprGantt', 'aria-pressed': String(ganttOn()),
          disabled: !m.solution, onclick: toggleGantt }, [tg('gantt.toggle')])]),
        h('span', { class: 'gpr-push' }),
        // «Paso a paso» (T011): del paso 1 en adelante; volver al paso 0 es volver a la tabla.
        h('div', { class: 'seg', role: 'group', 'aria-label': tg('walk.toggle') }, [h('button', { type: 'button', id: 'gprWalk', 'aria-pressed': String(on), disabled: !m.trace,
          onclick: () => { hooks.dispatch({ type: 'go', n: on ? 0 : 1 }); focus('gprWalk'); } }, [tg('walk.toggle')])]),
        on ? h('label', { class: 'gpr-check' }, [h('input', { type: 'checkbox', id: 'gprPred', checked: !!state().pred,
          onchange: (e) => { hooks.dispatch({ type: 'set', key: 'pred', value: e.target.checked ? 1 : 0 }); focus('gprPred'); } }), ' ', I.t(lang(), 'predict.toggle')]) : null,
        // «¿Y si…?» (T014, tablero 119): se abre con la primera crítica que no es normal (qw) y se cierra con el mismo botón.
        h('div', { class: 'seg', role: 'group', 'aria-label': tg('wi.toggle') }, [h('button', { type: 'button', id: 'gprWhatIfBtn', 'aria-pressed': String(!!m.whatIf),
          disabled: !m.solution, onclick: toggleWhatIf }, [tg('wi.toggle')])]),
        hooks.learn ? button(I.t(lang(), 'learn.button'), () => hooks.learn(), { id: 'gprLearn' }) : null,
      ])]);
    }
    const walking = () => !!m.trace && state().step > 0;
    function toggleWhatIf() {
      if (!m.whatIf && !m.solution) return;   // revisión de cierre, I-F4: sin solución no hay «¿Y si…?»
      if (m.whatIf) go({ qw: null });
      else { const id = whatIfStart(m); go({ qw: [id, m.gp.activities.find((a) => a.id === id).d] }); }
      focus('gprWhatIfBtn');
      const card = m.whatIf && root.document.getElementById('gprWhatIf');
      if (card && card.scrollIntoView) card.scrollIntoView({ block: 'nearest' });
    }
    const nets = () => (['roy', 'pert', 'both'].includes(state().qn) ? state().qn : 'both');
    const pick = (k) => { if (k !== null && k !== state().qr) go({ qr: k }); };
    const ganttOn = () => !!m.solution && (state().qg === 1 || state().qg === 2);
    function toggleGantt() {
      const on = !ganttOn();
      go({ qg: on ? 1 : 0 });
      focus('gprGantt');
      const card = on && root.document.getElementById('gprGanttCard');
      if (card && card.scrollIntoView) card.scrollIntoView({ block: 'nearest' });
    }
    function pickProject(id) {
      if (id === 'own' && !state().qt) { hooks.dispatch({ type: 'gprTable', rows: [Object.assign(blank(), { id: 'A' })] }, { push: true }); focus('gprProj'); return; }
      go({ qe: id }, { push: true });
    }
    function fromWork() {
      const w = hooks.workRows();
      hooks.dispatch({ type: 'gprFromWork', rows: workRows(w.rows, w.mode), mode: w.mode }, { push: true });
      if (hooks.announce) hooks.announce(tg('fromWorkDone', { fs: code('FS', nota()) }));
      focus('gprProj');
    }

    // ---------- La tabla de un ejemplo: fichas de solo lectura con su fuente (tablero 115) ----------
    function chipsCard() {
      const title = m.src.unit ? tg('tableTitleUnit', { unit: m.src.unit }) : tg('tableTitle');
      const items = m.gp.activities.map((a) => {
        const links = m.gp.rels.filter((r) => r.to === a.id).map((r) => relText(r, nota(), lang())).join(', ');
        return h('li', { class: 'gpr-chip' }, [h('strong', {}, [a.id]), ` ${num(a.d)} · `, h('span', { class: 'gpr-mono' }, [links || '—'])]);
      });
      return h('section', { class: 'card gpr-card', 'aria-labelledby': 'gprTableHead' }, [
        h('h2', { id: 'gprTableHead' }, [title]),
        h('ul', { class: 'gpr-chips', id: 'gprChips', 'aria-label': tg('chipsLabel', { name: m.src.title }) }, items),
        h('p', { class: 'muted small', id: 'gprSource' }, [tg('source', { source: m.src.source })]),
      ]);
    }

    // ---------- La tabla propia (tablero 120) ----------
    let ownTable = null; let issuesSlot = null;
    let pasteNote = false;   // N-F5 e I-F1: lo pegado no cabía entero; se dice una vez, en la tabla que sale de pegar
    const COLS = () => [['id', tg('col.id'), 4], ['name', tg('col.name'), 16], ['duration', tg('col.duration'), 5], ['links', tg('col.links'), 18]];
    function readOwn() {
      return [...container.querySelectorAll('#gprOwn tbody tr')].map((tr) => {
        const r = blank();
        for (const inp of tr.querySelectorAll('input[data-f]')) r[inp.getAttribute('data-f')] = inp.value;
        return r;
      });
    }
    const commit = (next) => hooks.dispatch({ type: 'gprTable', rows: next.length ? next : [blank()] });
    function ownCard() {
      const typed = () => hooks.dispatch({ type: 'gprTable', rows: readOwn() }, { fromEditor: true });
      const body = m.src.rows.map((r, i) => h('tr', { 'data-row': String(i) }, COLS().map(([f, label, size]) => h('td', {}, [h('input', {
        id: `gprT-${i}-${f}`, value: str(r[f]), size: String(size), class: f === 'links' ? 'gpr-mono' : null, 'aria-label': tg('cell', { col: label, n: i + 1 }),
        'aria-invalid': 'false', 'data-f': f, maxlength: String(FIELD_MAX[f]), oninput: typed, spellcheck: f === 'links' || f === 'id' ? 'false' : null, autocomplete: 'off',
      })])).concat([h('td', { class: 'gpr-msg', 'data-msg': '' }, []), h('td', {}, [button('×', () => { commit(readOwn().filter((_, j) => j !== i)); focus(i > 0 ? `gprDel-${i - 1}` : 'gprAdd'); },
        { class: 'ghost small-btn', id: `gprDel-${i}`, 'aria-label': tg('removeRow', { n: i + 1 }) })])])));
      const head = h('tr', {}, COLS().map(([, label]) => h('th', { scope: 'col' }, [label]))
        .concat([h('th', { scope: 'col' }, [tg('col.msg')]), h('th', { scope: 'col' }, [h('span', { class: 'sr-only' }, [tg('col.remove')])])]));
      ownTable = h('table', { class: 'data gpr-own', id: 'gprOwn' }, [h('thead', {}, [head]), h('tbody', {}, body)]);
      issuesSlot = h('div', { class: 'gpr-issues-slot' });
      const area = h('textarea', { id: 'gprPasteText', rows: '4', 'aria-describedby': 'gprPasteHint' });
      const paste = h('details', { class: 'gpr-paste', id: 'gprPaste' }, [h('summary', {}, [tg('paste')]), h('p', { class: 'muted small', id: 'gprPasteHint' }, [tg('pasteHint')]), area,
        button(tg('pasteApply'), () => {
          const rows = pasteRows(area.value);
          if (!rows.length) return;
          const fit = pasteFit(readOwn().filter((r) => FIELDS.some((f) => r[f].trim())), rows);
          pasteNote = fit.cut;
          commit(fit.rows);
          // Con aviso, al aviso; si cabe otra fila, a «Añadir una fila»; si no, a la última fila (r2, F5).
          focus(fit.cut ? 'gprPasteCut' : fit.rows.length < U.LIMITS.rows ? 'gprAdd' : `gprT-${fit.rows.length - 1}-id`);
        }, { id: 'gprPasteApply' })]);
      const cutNote = pasteNote ? h('p', { class: 'gpr-m gpr-m-warn', id: 'gprPasteCut', role: 'status', tabindex: '-1' },
        [tg('pasteCut', { rows: U.LIMITS.rows, links: U.LIMITS.links })]) : null;
      pasteNote = false;
      const card = h('section', { class: 'card gpr-card', 'aria-labelledby': 'gprOwnHead' }, [
        h('h2', { id: 'gprOwnHead' }, [tg('own')]), issuesSlot, cutNote,
        h('div', { class: 'gpr-scroll', tabindex: '0' }, [ownTable]),
        h('div', { class: 'gpr-row' }, [
          button(tg('addRow'), () => { const now = readOwn(); commit(now.concat([blank()])); focus(`gprT-${now.length}-id`); },
            { id: 'gprAdd', disabled: m.src.rows.length >= U.LIMITS.rows }),
          button(tg('clear'), () => { commit([blank()]); focus('gprT-0-id'); }, { id: 'gprClear' }),
        ]),
        paste,
      ]);
      markOwn();
      return card;
    }
    // Marca cada fila con su error o su aviso sin rehacer la tabla (el foco y el cursor no se mueven), y el resumen de arriba.
    function markOwn() {
      const mk = rowMarks(m, lang(), nota());
      for (const tr of ownTable.querySelectorAll('tbody tr')) {
        const r = mk.rows.get(Number(tr.getAttribute('data-row'))) || { bad: new Set(), warn: new Set(), msgs: [] };
        tr.classList.toggle('bad', r.bad.size > 0);
        tr.classList.toggle('warn', !r.bad.size && r.warn.size > 0);
        for (const inp of tr.querySelectorAll('input[data-f]')) {
          const f = inp.getAttribute('data-f');
          inp.setAttribute('aria-invalid', String(r.bad.has(f)));
          inp.classList.toggle('gpr-warn', !r.bad.has(f) && r.warn.has(f));
        }
        const cell = tr.querySelector('[data-msg]');
        clear(cell);
        for (const x of r.msgs) cell.appendChild(h('span', { class: `gpr-m gpr-m-${x.kind}` }, [h('span', { 'aria-hidden': 'true' }, [x.kind === 'err' ? '✕ ' : '! ']), x.text]));
      }
      clear(issuesSlot);
      const n = m.report.errors.length;
      if (!n && !m.empty) return;
      const lines = [h('strong', {}, [m.empty ? tg('issues.empty') : n === 1 ? tg('issues.errorsOne') : tg('issues.errors', { n })])];
      if (mk.badRows.length) lines.push(' ', tg(mk.badRows.length === 1 ? 'issues.rowOne' : 'issues.rows', { list: I.list(lang(), mk.badRows) }));
      const general = mk.general.length ? h('ul', { class: 'small' }, mk.general.map((x) => h('li', {}, [x]))) : null;
      issuesSlot.appendChild(h('div', { class: 'gpr-issues', id: 'gprIssues', role: 'status' }, [h('p', {}, lines), general]));
    }
    function helpCard() {
      const c = (x) => code(x, nota());
      const N = I.notation(nota());
      const p = (text) => h('p', {}, [text]);
      return h('section', { class: 'card gpr-card gpr-help', id: 'gprHelp', 'aria-labelledby': 'gprHelpHead' }, [
        h('h2', { id: 'gprHelpHead' }, [tg('help.title')]),
        p(tg('help.each')),
        h('code', { class: 'gpr-code' }, [`A, B ${c('SS')}+2, C FF-1${lang() === 'es' ? ',' : '.'}5, D ${c('SF')}`]),
        p(tg('help.alone', { fs: c('FS'), ss: c('SS'), sf: c('SF') })),
        p(tg('help.both')),
        p(tg('help.several')),
        h('p', { class: 'muted' }, [tg('help.floats', { tf: N.TF, ff: N.FF }), nota() === 'es' ? null : ` ${tg('help.clash')}`]),
      ]);
    }

    // ---------- La red ROY con las relaciones (tablero 115) ----------
    let lay = { key: null };
    function netCard(walk) {
      const s = state();
      const gp = m.gp; const sol = m.solution;
      const key = JSON.stringify([gp.activities.map((a) => [a.id, a.d]), gp.rels.map((r) => [r.from, r.to])]);
      if (lay.key !== key) {
        const cp = structure(gp);
        const cs = C.solve(cp);
        lay = { key, cp, cs, roy: root.PNL.layout.layout(cs, cp) };
      }
      const view = { order: lay.cs.order, levels: lay.cs.levels, critical: sol.critical, times: sol.times, floats: sol.floats, duration: sol.duration };
      const revealed = new Map();
      let shownT = true; let critOn = true; let edgeMarks = null; let stepCtx = null;
      const labs = labels(gp, s.nota, lang());
      if (walk) {
        // Paso a paso: lo calculado hasta el paso (sin el actual mientras se predice), la actividad del paso y sus términos.
        const { tr, k, hide } = walk;
        for (let i = 1; i <= k; i++) if (i < k || !hide) for (const rv of tr[i].reveals) revealed.set(`${rv.act}.${rv.field}`, rv.value);
        const endIdx = tr.findIndex((x) => x.kind === 'gprEnd');
        shownT = k > endIdx || (k === endIdx && !hide);
        critOn = k >= tr.findIndex((x) => x.kind === 'gprCritical');
        const step = tr[k];
        if (step.formula) {
          stepCtx = { act: step.act };
          edgeMarks = new Map();
          const win = new Set();
          step.formula.terms.forEach((t) => {
            const key = t.rel === null ? (step.kind === 'gprForward' ? `${START}>${step.act}` : `${step.act}>${END}`) : `${gp.rels[t.rel].from}>${gp.rels[t.rel].to}`;
            const on = !hide && step.formula.chosen.includes(t.key);
            if (on && t.rel !== null) win.add(t.rel);
            if (on || !edgeMarks.has(key)) edgeMarks.set(key, on ? 'chosen' : 'compared');
          });
          for (const list of labs.values()) for (const l of list) l.cls = win.has(l.rel) ? 'chosen' : '';
        }
      } else {
        // T013: la relación elegida (qr), resaltada; las demás etiquetas de su flecha, sin resaltar.
        const sel = relMarks(m, s.qr);
        if (sel) {
          edgeMarks = sel.roy;
          for (const [k, list] of labs) if (sel.roy.has(k)) for (const l of list) l.cls = l.rel === sel.rel ? 'chosen' : '';
        }
        for (const id of lay.cs.order) {
          for (const f of ['ES', 'EF', 'LS', 'LF']) revealed.set(`${id}.${f}`, sol.times[id][f]);
          for (const f of ['TF', 'FF']) revealed.set(`${id}.${f}`, sol.floats[id][f]);
        }
      }
      const rels = relList(gp, s.nota, lang());
      const holder = h('div', { class: 'gpr-net', id: 'gprRoy', tabindex: '0' });
      root.PNL.royView.render(holder, { project: lay.cp, solution: view, lay: lay.roy, step: stepCtx, revealed, box: s.box, lang: lang(), nota: s.nota,
        criticalOn: critOn, numFmt: num, name: m.src.title, fit: true, minWidth: 640, geo: { gx: 84 }, labels: labs, critEdges: critEdges(gp, sol, lay.cp), edgeMarks,
        ariaExtra: rels.length ? tg('net.rels', { list: rels.join(', ') }) : '',
        onEdge: walk ? null : (key, rel) => pick(pickFromEdge(m, key, rel, state().qr)) });
      const N = I.notation(s.nota);
      const legend = h('p', { class: 'gpr-legend', id: 'gprLegend' }, [
        h('span', {}, [tg(`legend.box${s.box === '4' || s.box === 'c' ? s.box : '7'}`, N)]),
        h('span', { class: 'gpr-crit' }, [tg('legend.critical')]),
        h('span', {}, [tg('legend.noLabel', { fs: code('FS', s.nota) })]),
      ]);
      // A 360 px la red no se encoge por debajo de 640 px: se desliza dentro de su marco (tablero 121).
      const parts = [h('h2', { id: 'gprRoyHead' }, [shownT ? tg('net.head', { T: num(sol.duration) }) : tg('net.title')]), holder,
        h('p', { class: 'gpr-swipe muted small', 'aria-hidden': 'true' }, [tg('net.swipe')]), legend];
      if (walk) return h('section', { class: 'card gpr-card', 'aria-labelledby': 'gprRoyHead' }, parts);
      if (sol.notFinal.length) parts.push(h('p', { class: 'gpr-note', id: 'gprNotFinal' }, [tg(sol.notFinal.length === 1 ? 'net.notFinalOne' : 'net.notFinalMany', { ids: I.list(lang(), sol.notFinal) })]));
      parts.push(resultsBlock(N));
      return h('section', { class: 'card gpr-card', 'aria-labelledby': 'gprRoyHead' }, parts);
    }
    // Tiempos y holguras (total y libre, con sus siglas y su nombre; spec AC16): la alternativa en texto de la red.
    function resultsBlock(N) {
      const sol = m.solution;
      const crit = new Set(sol.critical);
      const head = h('tr', {}, [h('th', { scope: 'col' }, [tg('results.act')]), h('th', { scope: 'col' }, ['d'])]
        .concat(['ES', 'EF', 'LS', 'LF'].map((f) => h('th', { scope: 'col' }, [N[f]])))
        .concat([['TF', 'tf'], ['FF', 'ff']].map(([f, k]) => h('th', { scope: 'col' }, [N[f], h('span', { class: 'gpr-full' }, [tg(`results.${k}`)])]))));
      const body = lay.cs.order.map((id) => {
        const tm = sol.times[id]; const fl = sol.floats[id];
        return h('tr', { class: crit.has(id) ? 'crit' : null, 'data-act': id }, [
          h('th', { scope: 'row' }, [id, crit.has(id) ? h('span', { class: 'sr-only' }, [` (${tg('results.crit')})`]) : null]),
          ...[m.gp.activities.find((a) => a.id === id).d, tm.ES, tm.EF, tm.LS, tm.LF, fl.TF, fl.FF].map((v) => h('td', { class: 'num' }, [num(v)]))]);
      });
      return h('details', { class: 'gpr-results', id: 'gprResults' }, [h('summary', {}, [tg('results.title')]),
        h('div', { class: 'gpr-scroll', tabindex: '0', role: 'region', 'aria-label': tg('results.caption', { name: m.src.title }) }, [
          h('table', { class: 'data gpr-res', id: 'gprResultsTable' }, [h('caption', { class: 'sr-only' }, [tg('results.caption', { name: m.src.title })]),
            h('thead', {}, [head]), h('tbody', {}, body)])])]);
    }

    // ---------- «¿Y si…?» y las clases (T014, tablero 119) ----------
    let wiSeen = { key: null, fb: null };   // la clase de la actividad elegida, predicha o mostrada (con su respuesta)
    function whatIfCard() {
      const w = m.whatIf;
      const tw = (k, p) => tg(`wi.${k}`, p);
      const key = `${m.src.id}|${w.id}|${w.d}`;
      const seen = wiSeen.key === key;
      const sel = h('select', { id: 'gprWiAct', onchange: (e) => { const a = w.base.activities.find((x) => x.id === e.target.value); go({ qw: [a.id, a.d] }); focus('gprWiAct'); } },
        w.base.activities.map((a) => h('option', { value: a.id, selected: a.id === w.id }, [`${a.id} (${num(a.d)})`])));
      const err = h('p', { class: 'small gpr-m-err', id: 'gprWiErr', hidden: true }, [tw('bad')]);
      const inp = h('input', { id: 'gprWiDur', value: numTxt(w.d, lang()), size: '6', inputmode: 'decimal', autocomplete: 'off', 'aria-describedby': 'gprWiErr',
        onkeydown: (e) => { if (e.key === 'Enter') { e.preventDefault(); tryIt(); } } });
      function tryIt() {
        const v = root.PNL.predict.parseAnswer(inp.value);
        if (!(Number.isFinite(v) && v >= 0 && String(v).length <= 6)) { err.hidden = false; inp.setAttribute('aria-invalid', 'true'); inp.focus(); return; }
        go({ qw: [w.id, v] });
        focus('gprWiDur');
      }
      const lines = whatIfText(m, lang());
      const res = lines.length ? h('div', { class: `gpr-wi-res ${w.delta > TOL ? 'up' : w.delta < -TOL ? 'down' : 'same'}`, id: 'gprWiResult', role: 'status' },
        lines.map((x) => h('span', { class: 'gpr-m' }, [x]))) : h('p', { class: 'muted small' }, [tw('hint')]);
      const rows = classRows(m);
      const mine = rows.find((r) => r.id === w.id);
      const hide = (r) => r.id === w.id && !!r.cls && !seen;
      const arrow = (x) => tw(`arrow.${x == null ? 'none' : x}`);
      const table = h('table', { class: 'data gpr-res gpr-cls', id: 'gprClasses' }, [h('caption', { class: 'sr-only' }, [tw('clsTitle')]),
        h('thead', {}, [h('tr', {}, ['act', 'up', 'down', 'cls'].map((k) => h('th', { scope: 'col' }, [tw(`head.${k}`)])))]),
        h('tbody', {}, rows.map((r) => h('tr', { 'data-act': r.id, class: r.id === w.id ? 'chosen' : null }, [h('th', { scope: 'row' }, [r.id]),
          h('td', {}, [hide(r) ? '?' : arrow(r.up)]), h('td', {}, [hide(r) ? '?' : arrow(r.down)]),
          h('td', { class: 'strong' }, [hide(r) ? '?' : tg(`cls.${r.cls || 'none'}`)])])))]);
      const parts = [h('h2', { id: 'gprWhatIfHead' }, [tw('title')]),
        h('div', { class: 'gpr-row' }, [h('label', { class: 'gpr-field' }, [tw('act'), ' ', sel]), h('label', { class: 'gpr-field' }, [tw('dur'), ' ', inp]),
          h('button', { type: 'button', class: 'primary', id: 'gprWiTry', onclick: tryIt }, [tw('try')]),
          button(tw('reset', { d: num(w.d0) }), () => { go({ qw: [w.id, w.d0] }); focus('gprWiReset'); }, { id: 'gprWiReset' })]), err, res,
        h('h3', { class: 'gpr-h3' }, [tw('clsTitle')]), h('div', { class: 'gpr-scroll', tabindex: '0', role: 'region', 'aria-label': tw('clsTitle') }, [table])];
      if (!mine) parts.push(h('p', { class: 'small', id: 'gprWiNote' }, [tw('notCrit', { id: w.id, tf: num(m.solution.floats[w.id].TF) })]));
      else if (!mine.cls) parts.push(h('p', { class: 'small', id: 'gprWiNote' }, [tw('zero', { id: w.id })]));
      else if (!seen) {
        const pick = h('select', { id: 'gprWiCls' }, [h('option', { value: '' }, [tw('pick')])]
          .concat(root.PNL.predict.GPR_CLASSES.map((c) => h('option', { value: c }, [tg(`cls.${c}`)]))));
        const empty = h('p', { class: 'small gpr-m-err', id: 'gprWiEmpty', hidden: true }, [tw('empty')]);
        const check = () => {
          if (!pick.value) { empty.hidden = false; pick.focus(); return; }
          wiSeen = { key, fb: pick.value === mine.cls ? 'ok' : 'wrong' };
          keepFocus(draw); focus('gprWiFb');
        };
        parts.push(h('div', { class: 'gpr-predict' }, [h('div', { class: 'gpr-row' }, [h('label', { for: 'gprWiCls' }, [tw('predict', { id: w.id })]), pick,
          h('button', { type: 'button', class: 'primary', id: 'gprWiCheck', onclick: check }, [I.t(lang(), 'predict.check')]),
          button(I.t(lang(), 'predict.show'), () => { wiSeen = { key, fb: null }; keepFocus(draw); focus('gprWiAct'); }, { id: 'gprWiShow' })]), empty]));
      } else if (wiSeen.fb) {
        parts.push(h('p', { class: `gpr-fb ${wiSeen.fb === 'ok' ? 'gpr-ok' : 'gpr-wrong'}`, id: 'gprWiFb', tabindex: '-1', role: 'status' },
          [tw(wiSeen.fb, { id: w.id, cls: tg(`cls.${mine.cls}`) })]));
      }
      if (hooks.learn) parts.push(h('p', { class: 'muted small' }, [tw('more'), ' ', h('button', { type: 'button', class: 'link gpr-link', id: 'gprWiLearn', onclick: () => hooks.learn() }, [I.t(lang(), 'learn.button')])]));
      return h('section', { class: 'card gpr-card', id: 'gprWhatIf', 'aria-labelledby': 'gprWhatIfHead' }, parts);
    }

    // ---------- La PERT equivalente y la relación en las dos redes (T013, tablero 117) ----------
    let pertLay = { b: null, lay: null };
    let pertTableOpen = false;
    function pertCard() {
      const b = pertOf(m);
      if (pertLay.b !== b) pertLay = { b, lay: root.PNL.aoaLayout.layout(b.net) };
      const acts = Object.fromEntries(b.pieces.acts.map((a) => [a.id, a]));
      const sel = relMarks(m, state().qr);
      const onSelect = (label) => pick(pickFromArc(m, label, state().qr));
      const arcName = (x) => (acts[x] && acts[x].wait ? tg('pert.wait') : x);
      const arcText = (x, dummy) => {
        const a = !dummy && acts[x];
        if (!a) return null;
        if (a.wait) return `${tg('pert.wait')} ${num(a.d)}`;
        return a.zero ? x : `${x} ${num(a.d)}`;
      };
      const holder = h('div', { class: 'gpr-net', id: 'gprPert', tabindex: '0' });
      root.PNL.pertView.render(holder, { net: b.net, lay: pertLay.lay, revealed: new Map(), step: null, solution: null, lang: lang(), nota: nota(), criticalOn: false,
        numFmt: num, name: m.src.title, numbered: true, fit: true, minWidth: 640, geo: { colGap: 100, rowGap: 80 }, idPrefix: 'gpr-pk', declutter: true,
        marks: sel ? sel.pert : null, arcText, zero: new Set(b.pieces.acts.filter((a) => a.zero).map((a) => a.id)), wait: new Set(b.pieces.waits), onSelect });
      const tbl = h('div', { class: 'gpr-scroll', tabindex: '0', role: 'region', 'aria-label': tg('pert.table') });
      root.PNL.pertView.arcTable(tbl, { net: b.net, numFmt: num, lang: lang(), name: m.src.title, durations: Object.fromEntries(b.pieces.acts.map((a) => [a.id, a.d])),
        onSelect, arcName });
      const details = h('details', { class: 'gpr-results', id: 'gprPertTable', open: pertTableOpen, ontoggle: (e) => { pertTableOpen = e.target.open; } },
        [h('summary', {}, [tg('pert.table')]), tbl]);
      return h('section', { class: 'card gpr-card', 'aria-labelledby': 'gprPertHead' }, [h('h2', { id: 'gprPertHead' }, [tg('pert.title')]), holder,
        h('p', { class: 'gpr-swipe muted small', 'aria-hidden': 'true' }, [tg('net.swipe')]), h('p', { class: 'gpr-legend' }, [tg('pert.legend')]), details]);
    }
    function relPanel() {
      const qr = state().qr;
      const sel = relMarks(m, qr);
      const nt = nota();
      const select = h('select', { id: 'gprRel', onchange: (e) => { go({ qr: e.target.value === '' ? null : Number(e.target.value) }); focus('gprRel'); } },
        [h('option', { value: '', selected: !sel }, [tg('rel.none')])].concat(relOptions(m, nt, lang()).map((o) => h('option', { value: String(o.rel), selected: !!sel && sel.rel === o.rel }, [o.text]))));
      let box;
      if (sel) {
        const ex = relExplain(m, sel.rel, nt, lang());
        box = h('div', { class: 'gpr-relbox', id: 'gprRelText', role: 'status' }, [h('p', {}, [h('strong', {}, [ex.head])]), ...ex.lines.map((x) => h('p', {}, [x]))]);
      } else box = h('div', { class: 'gpr-relbox', id: 'gprRelText', role: 'status' }, [h('p', {}, [tg('rel.hint')])]);
      const s = pertSummary(m, nt, lang());
      const cnt = (n, k) => tg(`sum.${k}${n === 1 ? 'One' : ''}`, { n: num(n) });
      const none = tg('sum.none');
      const rows = [
        ['elems', `${cnt(s.roy.acts, 'acts')}, ${cnt(s.roy.rels, 'rels')}`, ['pieces', 'waits', 'dummies', 'events'].map((k) => cnt(s.pert[k], k)).join(', ')],
        ['T', num(s.roy.T), num(s.pert.T)],
        ['gaps', none, s.gaps.length ? s.gaps.map((g) => `${g.act} (${num(g.gap)})`).join(', ') : none],
        ['omitted', '—', s.omitted.length ? s.omitted.join(', ') : none],
      ];
      const table = h('table', { class: 'data gpr-sum', id: 'gprSummary' }, [h('caption', { class: 'sr-only' }, [tg('sum.caption')]),
        h('thead', {}, [h('tr', {}, [h('td', {}, []), h('th', { scope: 'col' }, [tg('nets.roy')]), h('th', { scope: 'col' }, [tg('nets.pert')])])]),
        h('tbody', {}, rows.map(([k, a, b]) => h('tr', { 'data-row': k }, [h('th', { scope: 'row' }, [tg(`sum.${k}`)]),
          h('td', { class: k === 'T' ? 'num strong' : null }, [a]), h('td', { class: k === 'T' ? 'num strong' : null }, [b])])))]);
      // T016: debajo de las redes, en dos columnas: la relación elegida y su explicación | el resumen de las dos redes.
      return h('section', { class: 'card gpr-card gpr-help', id: 'gprRelPanel', 'aria-labelledby': 'gprRelHead' }, [
        h('h2', { id: 'gprRelHead' }, [tg('rel.title')]),
        h('div', { class: 'gpr-relgrid' }, [
          h('div', { id: 'gprRelPick' }, [h('label', { class: 'gpr-field' }, [tg('rel.label'), ' ', select]), box, h('p', { class: 'muted small' }, [tg('rel.keys')])]),
          h('div', { id: 'gprRelSum' }, [h('div', { class: 'gpr-scroll' }, [table]), h('p', { class: 'muted small' }, [tg('sum.rule')]), pertNote(s)])])]);
    }
    // Cuando la PERT dura menos que la ROY, por qué; si no, el ejemplo en que pasa (la crítica al revés).
    function pertNote(s) {
      const ids = (x) => I.list(lang(), [...new Set(x.gaps.map((g) => g.act))]);
      if (s.pert.T < s.roy.T - TOL) {
        return h('p', { class: 'gpr-warnbox', id: 'gprPertNote' }, [tg(s.omitted.length ? 'note.lessOmitted' : 'note.less', { tp: num(s.pert.T), T: num(s.roy.T), ids: ids(s) })]);
      }
      const rv = X.get('rv');
      if (!rv || m.src.id === 'rv') return null;
      const r = rvFigures();
      if (!(r.tp < r.T - TOL)) return null;
      return h('p', { class: 'gpr-warnbox', id: 'gprPertNote' }, [tg('note.other', { name: rv.title[lang()], tp: num(r.tp), T: num(r.T), ids: I.list(lang(), r.ids) }), ' ',
        h('button', { type: 'button', class: 'link', onclick: () => { go({ qe: 'rv' }, { push: true }); focus('gprProj'); } }, [tg('note.see')])]);
    }

    // ---------- El Gantt con las relaciones (T012, tablero 118) ----------
    let ganttTable = false;   // «Ver como tabla»: se queda abierta al cambiar de fechas o de proyecto
    function ganttBlock() {
      const late = state().qg === 2;
      const nt = nota(); const N = I.notation(nt);
      const c = (x) => code(x, nt);
      const dates = tg(late ? 'gantt.late' : 'gantt.early');
      const sol = m.solution;
      const holder = h('div', { class: 'gpr-gantt-wrap', id: 'gprGanttWrap', tabindex: '0', role: 'region', 'aria-label': tg('gantt.region', { name: m.src.title }) });
      root.PNL.gprGantt.render(holder, { gp: m.gp, solution: sol, late, numFmt: num, lang: lang(), name: m.src.title,
        title: (r) => `${r.from} → ${r.to} ${relTag(r, nt, lang())}` });
      const box = h('div', { id: 'gprGanttTableBox', hidden: !ganttTable }, ganttTable ? [ganttTableEl(late, dates, N)] : []);
      const chart = h('section', { class: 'card gpr-card', id: 'gprGanttCard', 'aria-labelledby': 'gprGanttHead' }, [
        h('h2', { id: 'gprGanttHead' }, [tg('gantt.head', { dates })]), holder,
        h('p', { class: 'gpr-swipe muted small', 'aria-hidden': 'true' }, [tg('gantt.swipe')]), box]);
      const pick = (v, id, label) => h('button', { type: 'button', id, 'aria-pressed': String(state().qg === v), onclick: () => { go({ qg: v }); focus(id); } }, [label]);
      const sw = (cls) => h('span', { class: `gpr-sw ${cls}`, 'aria-hidden': 'true' });
      const notes = late ? [] : ganttNote(m, nt, lang());
      const read = h('section', { class: 'card gpr-card gpr-help', id: 'gprGanttRead', 'aria-labelledby': 'gprGanttReadHead' }, [
        h('h2', { id: 'gprGanttReadHead' }, [tg('gantt.read')]),
        h('div', { class: 'seg', role: 'group', 'aria-label': tg('gantt.dates') }, [pick(1, 'gprGanttEarly', tg('gantt.earlyBtn')), pick(2, 'gprGanttLate', tg('gantt.lateBtn'))]),
        h('p', { class: 'gpr-legend', id: 'gprGanttLegend' }, [h('span', {}, [sw('c'), tg('gantt.crit')]), h('span', {}, [sw('n'), tg('gantt.float')]),
          h('span', {}, [sw('f'), tg('gantt.dash')])]),
        h('p', {}, [tg('gantt.arrows', { fs: c('FS'), ss: c('SS'), sf: c('SF') })]),
        notes.length ? h('ul', { class: 'gpr-note gpr-gantt-note', id: 'gprGanttNote' }, notes.map((x) => h('li', {}, [x]))) : null,
        h('button', { type: 'button', class: 'ghost', id: 'gprGanttTableBtn', 'aria-expanded': String(ganttTable), 'aria-controls': 'gprGanttTableBox',
          onclick: () => { ganttTable = !ganttTable; keepFocus(draw); } }, [tg('gantt.showTable')]),
      ]);
      return h('div', { class: 'gpr-gantt-grid' }, [chart, read]);
    }
    // El Gantt del paso a paso (T014b): progresivo (ganttWalk), con su leyenda; los valores están en la tabla de términos.
    function ganttWalkCard(walk) {
      const w = ganttWalk(m, walk.k, walk.hide);
      if (!w) return null;
      const nt = nota();
      const dates = tg(w.late ? 'gantt.late' : 'gantt.early');
      const holder = h('div', { class: 'gpr-gantt-wrap', id: 'gprGanttWrap', tabindex: '0', role: 'region', 'aria-label': tg('gantt.region', { name: m.src.title }) });
      root.PNL.gprGantt.render(holder, { gp: m.gp, solution: m.solution, late: w.late, numFmt: num, lang: lang(), name: m.src.title, walk: w,
        title: (r) => `${r.from} → ${r.to} ${relTag(r, nt, lang())}` });
      const sw = (cls) => h('span', { class: `gpr-sw ${cls}`, 'aria-hidden': 'true' });
      const legend = w.kind === 'gprForward' || w.kind === 'gprBackward'
        ? [h('span', {}, [sw('w'), tg('gantt.walk.chosen')]), h('span', {}, [sw('k'), tg('gantt.walk.compared')]), h('span', {}, [sw('v'), tg('gantt.walk.line')])]
          .concat(w.ghosts ? [h('span', {}, [sw('g'), tg('gantt.walk.ghost')])] : [])
        : [h('span', {}, [sw(w.crit ? 'c' : 'n'), tg(w.crit ? 'gantt.crit' : 'gantt.walk.bar')])].concat(w.crit ? [h('span', {}, [sw('n'), tg('gantt.float')])] : [])
          .concat(w.floats ? [h('span', {}, [sw('f'), tg('gantt.dash')])] : []);
      return h('section', { class: 'card gpr-card', id: 'gprGanttCard', 'aria-labelledby': 'gprGanttHead' }, [
        h('h2', { id: 'gprGanttHead' }, [tg('gantt.head', { dates })]), holder,
        h('p', { class: 'gpr-swipe muted small', 'aria-hidden': 'true' }, [tg('gantt.swipe')]),
        h('p', { class: 'gpr-legend', id: 'gprGanttLegend' }, legend),
        w.values && (w.kind === 'gprForward' || w.kind === 'gprBackward') ? h('p', { class: 'muted small', id: 'gprGanttWalkNote' }, [tg(`gantt.walk.values.${w.kind === 'gprForward' ? 'fwd' : 'bwd'}`, { id: w.act })]) : null]);
    }
    // La alternativa en texto: cada actividad con su comienzo y su fin a las fechas elegidas, su holgura y lo que le llega.
    function ganttTableEl(late, dates, N) {
      const cap = tg('gantt.caption', { name: m.src.title, dates });
      const head = h('tr', {}, [h('th', { scope: 'col' }, [tg('results.act')]), h('th', { scope: 'col' }, [tg('gantt.col.start')]), h('th', { scope: 'col' }, [tg('gantt.col.finish')]),
        h('th', { scope: 'col' }, [N.TF, h('span', { class: 'gpr-full' }, [tg('results.tf')])]), h('th', { scope: 'col' }, [tg('gantt.col.arrives')])]);
      const body = ganttRows(m, late, nota(), lang()).map((r) => h('tr', { class: r.crit ? 'crit' : null, 'data-act': r.id }, [
        h('th', { scope: 'row' }, [r.id, r.crit ? h('span', { class: 'sr-only' }, [` (${tg('results.crit')})`]) : null]),
        ...[r.start, r.finish, r.tf].map((v) => h('td', { class: 'num' }, [num(v)])),
        h('td', { class: 'gpr-mono' }, [r.arrives.length ? r.arrives.join(', ') : '—'])]));
      return h('div', { class: 'gpr-scroll', tabindex: '0', role: 'region', 'aria-label': cap }, [
        h('table', { class: 'data gpr-res', id: 'gprGanttTable' }, [h('caption', { class: 'sr-only' }, [cap]), h('thead', {}, [head]), h('tbody', {}, body)])]);
    }

    // ---------- El paso a paso (tablero 116) ----------
    let lastWalk = '';
    const PR = () => root.PNL.predict;
    function walkCard() {
      const tr = m.trace; const k = Math.min(state().step, tr.length - 1); const step = tr[k];
      const ask = askedStep(step);
      const hide = hooks.predicting(ask);
      const nar = narration(step, m, { lang: lang(), nota: nota(), hide });
      const wiNote = walkWhatIfNote(m, lang());
      const parts = [h('h2', { id: 'gprStepHead' }, [nar.title]), wiNote ? h('p', { class: 'gpr-note gpr-m-warn', id: 'gprWalkWi' }, [wiNote]) : null,
        h('p', { id: 'gprStepText' }, [nar.text])];
      if (step.formula) parts.push(termsTable(step, hide));
      if (step.kind === 'gprFloat') parts.push(floatsTable(step, ask, hide));
      if (step.kind === 'gprClasses') parts.push(classesWalk(step, hide));
      parts.push(predictBox(step, ask, hide), walkNav(tr, k, hide, nar));
      return { card: h('section', { class: 'card gpr-card gpr-step', id: 'gprStepCard', 'aria-labelledby': 'gprStepHead' }, parts), walk: { tr, k, hide } };
    }
    function termsTable(step, hide) {
      const N = I.notation(nota());
      const rows = terms(step, m.gp, m.solution, nota(), lang());
      const f = step.kind === 'gprForward' ? N.ES : N.LS;
      return h('div', { class: 'gpr-scroll', tabindex: '0', role: 'region', 'aria-label': tg('walk.termsCaption', { f, id: step.act }) }, [
        h('table', { class: 'data gpr-terms', id: 'gprTerms' }, [h('caption', { class: 'sr-only' }, [tg('walk.termsCaption', { f, id: step.act })]),
          h('thead', {}, [h('tr', {}, ['term', 'formula', 'value'].map((x) => h('th', { scope: 'col' }, [tg(`walk.head.${x}`)])))]),
          h('tbody', {}, rows.map((r) => {
            const win = !hide && r.chosen;
            return h('tr', { class: win ? 'chosen' : null }, [h('th', { scope: 'row' }, [r.label]),
              h('td', {}, [r.calc === null ? '—' : `${r.expr} = ${r.calc}`]),
              h('td', { class: 'num' }, [hide ? '?' : num(r.value), win ? ` ${tg('walk.governs')}` : null])]);
          }))])]);
    }
    // Holguras: una fila por actividad con lo que hace falta para calcularla; con predicción, una casilla en cada una.
    function floatsTable(step, ask, hide) {
      const N = I.notation(nota());
      const f = step.float;
      const ctxF = f === 'TF' ? ['ES', 'LS'] : ['ES', 'EF'];
      const pred = hooks.pred();
      const res = !hide && pred.done && pred.step === state().step && pred.result ? pred.result : null;
      const body = step.reveals.map((rv) => {
        const key = PR().key(rv);
        const mark = res ? res.get(key) : null;
        const cell = hide ? h('td', { class: 'num' }, [h('input', { id: `gprPredIn-${rv.act}`, size: '5', inputmode: 'decimal', value: pred.answers.get(key) || '',
          'aria-label': `${N[f]}(${rv.act})`, oninput: (e) => { pred.answers.set(key, e.target.value); } })])
          : h('td', { class: 'num' }, [num(rv.value)]);
        return h('tr', { 'data-act': rv.act, class: mark === 'wrong' || mark === 'empty' ? 'wrong' : mark === 'ok' ? 'ok' : null }, [h('th', { scope: 'row' }, [rv.act]),
          ...ctxF.map((x) => h('td', { class: 'gpr-ctx' }, [num(m.solution.times[rv.act][x])])), cell,
          res ? h('td', {}, [I.t(lang(), `predict.${mark === 'ok' ? 'ok' : 'wrong'}`)]) : null]);
      });
      const head = h('tr', {}, [h('th', { scope: 'col' }, [tg('results.act')]), ...ctxF.map((x) => h('th', { scope: 'col' }, [N[x]])), h('th', { scope: 'col' }, [N[f]]),
        res ? h('th', { scope: 'col' }, [I.t(lang(), 'predict.your')]) : null]);
      return h('div', { class: 'gpr-scroll', tabindex: '0', role: 'region', 'aria-label': tg('walk.floatsCaption', { f: N[f] }) }, [
        h('table', { class: 'data gpr-res', id: 'gprFloats' }, [h('caption', { class: 'sr-only' }, [tg('walk.floatsCaption', { f: N[f] })]), h('thead', {}, [head]), h('tbody', {}, body)])]);
    }
    // Clases (T014, A6): cada crítica con el efecto de alargarla y de acortarla y su clase; con predicción, una lista en cada una.
    function classesWalk(step, hide) {
      const tw = (k, p) => tg(`wi.${k}`, p);
      const pred = hooks.pred();
      const res = !hide && pred.done && pred.step === state().step && pred.result ? pred.result : null;
      const arrow = (x) => tw(`arrow.${x == null ? 'none' : x}`);
      const body = classRows(m).map((r) => {
        const rv = step.reveals.find((x) => x.act === r.id);
        const k = rv ? PR().key(rv) : null;
        const mark = res && k ? res.get(k) : null;
        const ask = hide && rv;
        const cell = ask ? h('td', {}, [h('select', { id: `gprPredCls-${r.id}`, 'aria-label': `${tw('head.cls')} (${r.id})`, onchange: (e) => { pred.answers.set(k, e.target.value); } },
          [h('option', { value: '' }, [tw('pick')])].concat(PR().GPR_CLASSES.map((c) => h('option', { value: c, selected: pred.answers.get(k) === c }, [tg(`cls.${c}`)]))))])
          : h('td', { class: 'strong' }, [tg(`cls.${r.cls || 'none'}`)]);
        return h('tr', { 'data-act': r.id, class: mark === 'wrong' || mark === 'empty' ? 'wrong' : mark === 'ok' ? 'ok' : null }, [h('th', { scope: 'row' }, [r.id]),
          h('td', {}, [ask ? '?' : arrow(r.up)]), h('td', {}, [ask ? '?' : arrow(r.down)]), cell,
          res ? h('td', {}, [mark ? I.t(lang(), `predict.${mark === 'ok' ? 'ok' : 'wrong'}`) : '']) : null]);
      });
      const head = h('tr', {}, ['act', 'up', 'down', 'cls'].map((x) => h('th', { scope: 'col' }, [tw(`head.${x}`)]))
        .concat(res ? [h('th', { scope: 'col' }, [I.t(lang(), 'predict.your')])] : []));
      return h('div', { class: 'gpr-scroll', tabindex: '0', role: 'region', 'aria-label': tg('walk.clsCaption') }, [
        h('table', { class: 'data gpr-res gpr-cls', id: 'gprClsWalk' }, [h('caption', { class: 'sr-only' }, [tg('walk.clsCaption')]), h('thead', {}, [head]), h('tbody', {}, body)])]);
    }
    function predictBox(step, ask, hide) {
      if (!state().pred || !ask.reveals.length) return null;
      const pred = hooks.pred();
      const N = I.notation(nota());
      const many = step.kind === 'gprFloat' || step.kind === 'gprClasses';
      if (hide) {
        const rv = ask.reveals[0]; const key = PR().key(rv);
        const msg = h('p', { class: 'small gpr-m-err', id: 'gprPredEmpty', hidden: true }, [tg('walk.empty')]);
        const check = () => {
          if (!many && !String(pred.answers.get(key) || '').trim()) { msg.hidden = false; focus('gprPredIn'); return; }
          hooks.predCheck(ask);
          focus('gprPredFb');
        };
        const row = [];
        if (!many) {
          row.push(h('label', { for: 'gprPredIn' }, [rv.field === 'T' ? 'T =' : `${N[rv.field]}(${rv.act}) =`]),
            h('input', { id: 'gprPredIn', value: pred.answers.get(key) || '', size: '7', inputmode: 'decimal', 'aria-describedby': 'gprPredEmpty',
              oninput: (e) => { pred.answers.set(key, e.target.value); }, onkeydown: (e) => { if (e.key === 'Enter') { e.preventDefault(); check(); } } }));
        }
        row.push(h('button', { type: 'button', class: 'primary', id: 'gprPredCheck', onclick: check }, [I.t(lang(), 'predict.check')]),
          button(I.t(lang(), 'predict.show'), () => { hooks.predShow(); focus('gprNext'); }, { id: 'gprPredShow' }));
        return h('div', { class: 'gpr-predict' }, [h('div', { class: 'gpr-row' }, row), msg]);
      }
      if (!(pred.done && pred.step === state().step && pred.result)) return null;
      if (many) {
        const c = PR().summary(pred.result);
        return h('p', { class: 'gpr-fb', id: 'gprPredFb', tabindex: '-1', role: 'status' }, [I.t(lang(), c.ok === 1 ? 'predict.summaryOne' : 'predict.summary', c)]);
      }
      const rv = ask.reveals[0]; const ok = pred.result.get(PR().key(rv)) === 'ok';
      return h('p', { class: `gpr-fb ${ok ? 'gpr-ok' : 'gpr-wrong'}`, id: 'gprPredFb', tabindex: '-1', role: 'status' }, [tg(ok ? 'walk.ok' : 'walk.wrong', { v: num(rv.value) })]);
    }
    function walkNav(tr, k, hide, nar) {
      const n = tr.length - 1;
      const wkey = `${m.src.id}|${lang()}|${k}|${n}|${hide}`;
      if (wkey !== lastWalk) { lastWalk = wkey; if (hooks.announce) hooks.announce(`${I.t(lang(), 'player.counter', { i: k, n })}. ${nar.title}. ${hide ? I.t(lang(), 'predict.hidden') : nar.text}`); }
      return h('div', { class: 'gpr-row gpr-walknav' }, [
        h('button', { type: 'button', class: 'ghost', id: 'gprPrev', disabled: k <= 1, onclick: () => { hooks.dispatch({ type: 'prev' }); focus('gprPrev'); } }, [`← ${I.t(lang(), 'player.prev')}`]),
        h('button', { type: 'button', class: 'ghost', id: 'gprNext', disabled: k >= n || hide, onclick: () => {
          hooks.dispatch({ type: 'next' });
          const st = m.trace[Math.min(state().step, n)];
          focus(hooks.predicting(askedStep(st)) ? (st.kind === 'gprFloat' ? `gprPredIn-${st.reveals[0].act}` : st.kind === 'gprClasses' ? `gprPredCls-${st.reveals[0].act}` : 'gprPredIn') : 'gprNext');
        } }, [`${I.t(lang(), 'player.next')} →`]),
        h('span', { class: 'muted small', id: 'gprCounter' }, [`${I.t(lang(), 'player.counter', { i: k, n })} · ${tg('walk.keys')}`]),
        hide ? h('span', { class: 'muted small' }, [I.t(lang(), 'predict.hidden')]) : null]);
    }

    // ---------- Pintar ----------
    let netSlot = null;
    function fillNet() {
      clear(netSlot);
      if (!m.solution) return;
      if (m.whatIf) netSlot.appendChild(whatIfCard());
      const v = nets();
      if (v === 'roy') netSlot.appendChild(netCard());
      else {
        netSlot.appendChild(h('div', { class: 'gpr-nets' }, [v === 'both' ? netCard() : null, pertCard(), relPanel()]));
      }
      if (ganttOn()) netSlot.appendChild(ganttBlock());
    }
    function draw() {
      clear(container);
      ownTable = null; issuesSlot = null; netSlot = null;
      container.appendChild(bar());
      if (walking()) {
        const w = walkCard();
        container.appendChild(h('div', { class: 'gpr-walk' }, [w.card, netCard(w.walk)]));
        // T014b: con «Gantt», el Gantt del paso, debajo (petición del autor).
        if (ganttOn()) { const g = ganttWalkCard(w.walk); if (g) container.appendChild(g); }
        return;
      }
      if (m.src.kind === 'own') container.appendChild(h('div', { class: 'gpr-own-grid' }, [ownCard(), helpCard()]));
      else container.appendChild(chipsCard());
      netSlot = h('div', { class: 'gpr-netslot' });
      container.appendChild(netSlot);
      fillNet();
    }
    function render(model, opts) {
      // Al teclear en la tabla propia no se rehace la tabla: se marcan las filas y se vuelve a pintar la red.
      const typing = opts && opts.fromEditor && m && m.src.kind === 'own' && model.src.kind === 'own' && ownTable && ownTable.isConnected && netSlot
        && model.src.rows.length === m.src.rows.length;
      m = model;
      // La barra sí: «Paso a paso», «Gantt» y «¿Y si…?» dependen de que la tabla se lea (revisión de cierre, I-F4).
      // El aviso de lo pegado se va con el siguiente cambio de la tabla, también al teclear (r2, F6 y F7).
      if (typing) {
        container.replaceChild(bar(), container.firstChild);
        const cut = root.document.getElementById('gprPasteCut');
        if (cut) cut.remove();
        markOwn(); fillNet(); return;
      }
      keepFocus(draw);
    }
    function debug() {
      if (!m) return null;
      return { src: { kind: m.src.kind, id: m.src.id }, errors: m.report.errors.map((e) => e.code), warnings: m.report.warnings.map((e) => e.code),
        duration: m.solution ? m.solution.duration : null };
    }
    function leave() { /* T010: nada que parar */ }
    return { render, debug, leave };
  }

  const api = { FIELDS, code, numTxt, relTag, relText, source, model, issueText, rowMarks, labels, structure, critEdges, pasteRows,
    pasteFit, FIELD_MAX, workRows, relList, walkWhatIfNote, walkTrace, asked, askedStep, terms, narration, ganttRows, ganttNote, ganttWalk, whatIfStart, whatIfText, classRows, relName, pertOf, pertSummary, relMarks, relsOfArc, pickFromArc, pickFromEdge,
    relOptions, relExplain, create };
  root.PNL = root.PNL || {};
  root.PNL.gprTab = api;
  if (isNode) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
