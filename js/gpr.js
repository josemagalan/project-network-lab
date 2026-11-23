/*
 * gpr — controlador de la pestaña «Precedencias generalizadas» (spec f5a-precedencias-generalizadas; plan §4, P1, P7, P12;
 * tableros 114, 115, 120 y 121). T010: la barra (proyecto y «Partir del taller»), la tabla (fichas de solo lectura en los
 * ejemplos; editable con «Tabla propia», con el error o el aviso de cada fila) y la red ROY con la relación escrita en cada
 * arco, sus tiempos y su tabla de tiempos y holguras (la alternativa en texto de la red). El paso a paso, la PERT
 * equivalente, el Gantt y el «¿Y si…?» llegan en T011–T014. La pestaña no se ve en la barra hasta T015.
 *
 * Los códigos de las relaciones van con la notación elegida en «Ajustes» (FS, SS, FF, SF o FC, CC, FF, CF; decisión del
 * autor en T010, spec AC16) y las cifras, con el idioma. La parte sin DOM (source, model, code, relTag, relText, issueText,
 * rowMarks, labels, critEdges, pasteRows) se prueba en Node (tests/gpr-tab.test.js); create() pinta la vista. Para las
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
    const { project, report } = G.parse(src.rows);
    return { src, gp: project, report, empty: !project && !report.errors.length, solution: project ? G.solve(project) : null };
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

  /** Etiquetas de los arcos: Map('U>V' → [{ text, title }]), sin las FS+0 (tablero 115). */
  function labels(gp, nota, lang) {
    const out = new Map();
    for (const r of gp.rels) {
      if (plain(r)) continue;
      const k = `${r.from}>${r.to}`;
      if (!out.has(k)) out.set(k, []);
      out.get(k).push({ text: relTag(r, nota, lang), title: `${r.from} → ${r.to}: ${I.t(lang, `gpr.relName.${r.type}`)}${r.lag ? ` ${relTag(r, nota, lang).slice(code(r.type, nota).length)}` : ''}` });
    }
    return out;
  }

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

  /** Filas pegadas de una hoja de cálculo (actividad, nombre, duración y predecesoras), como en el taller. */
  function pasteRows(text) {
    return P.parsePasted(text).map((r) => ({ id: str(r.id), name: str(r.name), duration: str(r.duration), links: str(r.links) }));
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
      return h('div', { class: 'card gpr-bar' }, [h('div', { class: 'gpr-row' }, [
        h('label', { class: 'gpr-field' }, [tg('project'), ' ', sel]),
        button(tg('fromWork'), fromWork, { id: 'gprFromWork' }),
      ])]);
    }
    function pickProject(id) {
      if (id === 'own' && !state().qt) { hooks.dispatch({ type: 'gprTable', rows: [Object.assign(blank(), { id: 'A' })] }, { push: true }); focus('gprProj'); return; }
      go({ qe: id }, { push: true });
    }
    function fromWork() {
      const w = hooks.workRows();
      hooks.dispatch({ type: 'gprFromWork', rows: w.rows, mode: w.mode }, { push: true });
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
        'aria-invalid': 'false', 'data-f': f, oninput: typed, spellcheck: f === 'links' || f === 'id' ? 'false' : null, autocomplete: 'off',
      })])).concat([h('td', { class: 'gpr-msg', 'data-msg': '' }, []), h('td', {}, [button('×', () => { commit(readOwn().filter((_, j) => j !== i)); focus(i > 0 ? `gprDel-${i - 1}` : 'gprAdd'); },
        { class: 'ghost small-btn', id: `gprDel-${i}`, 'aria-label': tg('removeRow', { n: i + 1 }) })])])));
      const head = h('tr', {}, COLS().map(([, label]) => h('th', { scope: 'col' }, [label]))
        .concat([h('th', { scope: 'col' }, [tg('col.msg')]), h('th', { scope: 'col' }, [h('span', { class: 'sr-only' }, [tg('col.remove')])])]));
      ownTable = h('table', { class: 'data gpr-own', id: 'gprOwn' }, [h('thead', {}, [head]), h('tbody', {}, body)]);
      issuesSlot = h('div', { class: 'gpr-issues-slot' });
      const area = h('textarea', { id: 'gprPasteText', rows: '4', 'aria-describedby': 'gprPasteHint' });
      const paste = h('details', { class: 'gpr-paste', id: 'gprPaste' }, [h('summary', {}, [tg('paste')]), h('p', { class: 'muted small', id: 'gprPasteHint' }, [tg('pasteHint')]), area,
        button(tg('pasteApply'), () => { const rows = pasteRows(area.value); if (rows.length) { commit(readOwn().filter((r) => FIELDS.some((f) => r[f].trim())).concat(rows)); focus('gprAdd'); } }, { id: 'gprPasteApply' })]);
      const card = h('section', { class: 'card gpr-card', 'aria-labelledby': 'gprOwnHead' }, [
        h('h2', { id: 'gprOwnHead' }, [tg('own')]), issuesSlot,
        h('div', { class: 'gpr-scroll', tabindex: '0' }, [ownTable]),
        h('div', { class: 'gpr-row' }, [
          button(tg('addRow'), () => { const now = readOwn(); commit(now.concat([blank()])); focus(`gprT-${now.length}-id`); }, { id: 'gprAdd' }),
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
    function netCard() {
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
      for (const id of lay.cs.order) {
        for (const f of ['ES', 'EF', 'LS', 'LF']) revealed.set(`${id}.${f}`, sol.times[id][f]);
        for (const f of ['TF', 'FF']) revealed.set(`${id}.${f}`, sol.floats[id][f]);
      }
      const labs = labels(gp, s.nota, lang());
      const relList = gp.rels.filter((r) => !plain(r)).map((r) => `${r.from} → ${r.to} ${relTag(r, s.nota, lang())}`);
      const holder = h('div', { class: 'gpr-net', id: 'gprRoy', tabindex: '0' });
      root.PNL.royView.render(holder, { project: lay.cp, solution: view, lay: lay.roy, step: null, revealed, box: s.box, lang: lang(), nota: s.nota,
        criticalOn: true, numFmt: num, name: m.src.title, fit: true, minWidth: 640, geo: { gx: 84 }, labels: labs, critEdges: critEdges(gp, sol, lay.cp),
        ariaExtra: relList.length ? tg('net.rels', { list: relList.join(', ') }) : '' });
      const N = I.notation(s.nota);
      const legend = h('p', { class: 'gpr-legend', id: 'gprLegend' }, [
        h('span', {}, [tg(`legend.box${s.box === '4' || s.box === 'c' ? s.box : '7'}`, N)]),
        h('span', { class: 'gpr-crit' }, [tg('legend.critical')]),
        h('span', {}, [tg('legend.noLabel', { fs: code('FS', s.nota) })]),
      ]);
      // A 360 px la red no se encoge por debajo de 640 px: se desliza dentro de su marco (tablero 121).
      const parts = [h('h2', { id: 'gprRoyHead' }, [tg('net.head', { T: num(sol.duration) })]), holder,
        h('p', { class: 'gpr-swipe muted small', 'aria-hidden': 'true' }, [tg('net.swipe')]), legend];
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

    // ---------- Pintar ----------
    let netSlot = null;
    function fillNet() {
      clear(netSlot);
      if (m.solution) netSlot.appendChild(netCard());
    }
    function draw() {
      clear(container);
      ownTable = null; issuesSlot = null;
      container.appendChild(bar());
      if (m.src.kind === 'own') container.appendChild(h('div', { class: 'gpr-own-grid' }, [ownCard(), helpCard()]));
      else container.appendChild(chipsCard());
      netSlot = h('div', { class: 'gpr-netslot' });
      container.appendChild(netSlot);
      fillNet();
    }
    function render(model, opts) {
      // Al teclear en la tabla propia no se rehace la tabla: se marcan las filas y se vuelve a pintar la red.
      const typing = opts && opts.fromEditor && m && m.src.kind === 'own' && model.src.kind === 'own' && ownTable && ownTable.isConnected
        && model.src.rows.length === m.src.rows.length;
      m = model;
      if (typing) { markOwn(); fillNet(); return; }
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

  const api = { FIELDS, code, numTxt, relTag, relText, source, model, issueText, rowMarks, labels, structure, critEdges, pasteRows, create };
  root.PNL = root.PNL || {};
  root.PNL.gprTab = api;
  if (isNode) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
