/*
 * ex-build — construir la red ROY en «Ejercicios» (spec f3d-construir-detectar, AC1–AC6, AC8 y AC22; plan §2–§4, P1 y P2;
 * tableros 81–83, 89 y 92). ex.js le cede el cuerpo de la vista con xk=roy; la barra sigue siendo la de ex.js.
 *
 * La red del alumno (RoyNet, plan §0) vive en la clave rn del enlace; cada edición del lienzo (views/roy-canvas) o de
 * «Tu red como tabla» (views/roy-table) es una operación de apply() y se guarda con { type: 'rn' }. En Practicar,
 * «Comprobar» llama a core/roycheck y el diagnóstico vive en la página (una edición lo borra); en Examen no hay marcas
 * hasta «Entregar» (xd=1), y la red entregada se corrige al abrir el enlace. «Ver la red correcta» dibuja la de la F1
 * (roycheck.fromTable) colocada por niveles, sin tocar rn.
 *
 * Con hooks.reto, el reto ROY del taller (T009, AC12; tablero 88): la misma vista con la tabla del taller, siempre en
 * Practicar y sin nota; hooks.key() da la clave del lienzo (la estructura de la tabla), en vez de la semilla.
 *
 * La parte sin DOM (start, normalize, apply, joinError, spot, placeLevels, parsePreds, predsText, hasWork, marks,
 * issueText, warnText, gradeText) se prueba en Node (tests/ex-build.test.js); create() pinta la vista. Para las pruebas
 * de navegador, PNL.exBuild.state() da la red, el diagnóstico, la nota y lo que se ve.
 */
(function (root) {
  'use strict';

  const isNode = typeof module !== 'undefined' && module.exports;
  const req = (path, name) => (isNode ? require(path) : root.PNL[name]);
  const I = req('./i18n.js', 'i18n');
  if (isNode) require('./i18n-build.js');
  const RC = req('./core/roycheck.js', 'roycheck');
  const L = req('./views/layout.js', 'layout');
  const T = req('./core/topo.js', 'topo');

  const S = RC.START;
  const E = RC.END;
  // Coordenadas del lienzo (centros de los nodos): rejilla de 20, columnas de 100 y filas de 60 al colocar por niveles.
  const GEO = { grid: 20, col: 100, row: 60, pad: 60, w: 720, h: 360, max: 9980, nodeW: 56, termW: 64, nodeH: 30 };
  const byId = (a, b) => a.localeCompare(b, 'en', { numeric: true });
  const fixed = (id) => id === S || id === E;
  const clamp = (v) => Math.min(GEO.max, Math.max(GEO.grid, Math.round(v)));
  const snap = (v) => clamp(Math.round(v / GEO.grid) * GEO.grid);
  const copy = (net) => ({ nodes: net.nodes.map((n) => Object.assign({}, n)), arcs: net.arcs.map((a) => ({ from: a.from, to: a.to })) });

  // Inicio y Fin ya puestos (tablero 81).
  const start = () => ({ nodes: [{ id: S, x: 60, y: 180 }, { id: E, x: 660, y: 180 }], arcs: [] });

  // Hay trabajo hecho si hay alguna actividad en el lienzo o algún arco (mover Inicio o Fin no cuenta).
  const hasWork = (net) => !!net && (net.arcs.length > 0 || net.nodes.some((n) => !fixed(n.id)));

  // La red del enlace, lista para dibujar: solo actividades de la tabla, Inicio y Fin siempre, y posiciones para todos.
  function normalize(net, project) {
    if (!net) return start();
    const known = new Set(project.activities.map((a) => a.id).concat([S, E]));
    const nodes = net.nodes.filter((n) => known.has(n.id)).map((n) => Object.assign({}, n));
    const have = new Set(nodes.map((n) => n.id));
    const arcs = net.arcs.filter((a) => have.has(a.from) && have.has(a.to)).map((a) => ({ from: a.from, to: a.to }));
    const st = start();
    if (!have.has(S)) nodes.unshift(Object.assign({}, st.nodes[0]));
    if (!have.has(E)) nodes.push(Object.assign({}, st.nodes[1]));
    const out = { nodes, arcs };
    return nodes.some((n) => n.x === undefined) ? placeLevels(out) : out;
  }

  // Columnas por niveles de la red del alumno (también con ciclos: los arcos que vuelven atrás no cuentan) y orden dentro
  // de cada columna con views/layout (baricentros), sin cambiar los arcos.
  function placeLevels(net) {
    const acts = net.nodes.map((n) => n.id).filter((id) => !fixed(id)).sort(byId);
    const set = new Set(acts);
    const arcs = net.arcs.filter((a) => set.has(a.from) && set.has(a.to));
    const level = new Map();
    const indeg = new Map(acts.map((a) => [a, 0]));
    for (const a of arcs) indeg.set(a.to, indeg.get(a.to) + 1);
    const order = [];
    const queue = acts.filter((a) => !indeg.get(a));
    for (const a of queue) level.set(a, 1);
    while (queue.length) {
      const u = queue.shift();
      order.push(u);
      for (const a of arcs.filter((x) => x.from === u)) {
        level.set(a.to, Math.max(level.get(a.to) || 1, level.get(u) + 1));
        indeg.set(a.to, indeg.get(a.to) - 1);
        if (!indeg.get(a.to)) queue.push(a.to);
      }
    }
    // Los que quedan están en un ciclo o después de uno: tras las predecesoras ya colocadas, en orden natural.
    for (const a of acts.filter((x) => !order.includes(x))) {
      const ps = arcs.filter((x) => x.to === a && level.has(x.from)).map((x) => level.get(x.from));
      level.set(a, Math.max(level.get(a) || 1, ps.length ? Math.max(...ps) + 1 : 1));
      order.push(a);
    }
    const last = (acts.length ? Math.max(...acts.map((a) => level.get(a))) : 0) + 1;
    const fwd = arcs.filter((a) => level.get(a.to) > level.get(a.from));
    const preds = Object.fromEntries(acts.map((a) => [a, fwd.filter((x) => x.to === a).map((x) => x.from)]));
    const succs = Object.fromEntries(acts.map((a) => [a, fwd.filter((x) => x.from === a).map((x) => x.to)]));
    const levels = new Map([[T.START, 0], [T.END, last]].concat(acts.map((a) => [a, level.get(a)])));
    const lay = L.layout({ order, levels }, { preds, succs });
    const rows = Object.values(lay.nodes).map((n) => n.row).concat(...Object.values(lay.bends).map((b) => b.map((n) => n.row)));
    const minRow = Math.min(...rows);
    const pos = (n) => ({ x: GEO.pad + n.col * GEO.col, y: GEO.pad + Math.round((n.row - minRow) * GEO.row) });
    const at = { [S]: pos(lay.nodes[T.START]), [E]: pos(lay.nodes[T.END]) };
    for (const a of acts) at[a] = pos(lay.nodes[a]);
    return { nodes: net.nodes.map((n) => Object.assign({ id: n.id }, at[n.id])), arcs: net.arcs.map((a) => ({ from: a.from, to: a.to })) };
  }

  // Un hueco libre junto a un nodo (a su derecha, arriba o abajo) o, si no, el primero de la rejilla.
  function spot(net, near) {
    const free = (x, y) => net.nodes.every((n) => n.x === undefined || Math.abs(n.x - x) >= 80 || Math.abs(n.y - y) >= 50);
    const tries = [];
    if (near) for (const [dx, dy] of [[1, 0], [1, 1], [1, -1], [0, 1], [0, -1], [2, 0], [1, 2], [1, -2], [2, 1], [2, -1]]) tries.push([near.x + dx * GEO.col, near.y + dy * GEO.row]);
    for (let r = 0; r < 40; r++) for (let c = 1; c < 12; c++) tries.push([GEO.pad + c * GEO.col, GEO.pad + r * GEO.row]);
    for (const [x, y] of tries) if (x >= GEO.grid && y >= GEO.grid && x <= GEO.max && y <= GEO.max && free(x, y)) return { x, y };
    return { x: GEO.pad, y: GEO.pad };
  }

  function joinError(net, from, to) {
    if (from === to) return 'same';
    if (to === S) return 'toStart';
    if (from === E) return 'fromEnd';
    if (net.arcs.some((a) => a.from === from && a.to === to)) return 'dup';
    return null;
  }

  // Operaciones de la red: devuelven una red nueva o la misma si no cambia nada.
  function apply(net, op, project) {
    const ids = new Set(project.activities.map((a) => a.id));
    const has = (id) => net.nodes.some((n) => n.id === id);
    const node = (id) => net.nodes.find((n) => n.id === id);
    switch (op && op.type) {
      case 'add': {
        if (!ids.has(op.id) || has(op.id)) return net;
        const out = copy(net);
        out.nodes.push({ id: op.id, x: clamp(op.x), y: clamp(op.y) });
        return out;
      }
      case 'move': {
        const n = node(op.id);
        if (!n || (n.x === clamp(op.x) && n.y === clamp(op.y))) return net;
        const out = copy(net);
        Object.assign(out.nodes.find((x) => x.id === op.id), { x: clamp(op.x), y: clamp(op.y) });
        return out;
      }
      case 'remove': {
        if (fixed(op.id) || !has(op.id)) return net;
        return { nodes: copy(net).nodes.filter((n) => n.id !== op.id), arcs: net.arcs.filter((a) => a.from !== op.id && a.to !== op.id).map((a) => ({ from: a.from, to: a.to })) };
      }
      case 'join': {
        if (!has(op.from) || !has(op.to) || joinError(net, op.from, op.to)) return net;
        const out = copy(net);
        out.arcs.push({ from: op.from, to: op.to });
        return out;
      }
      case 'unjoin': {
        if (!net.arcs.some((a) => a.from === op.from && a.to === op.to)) return net;
        const out = copy(net);
        out.arcs = out.arcs.filter((a) => !(a.from === op.from && a.to === op.to));
        return out;
      }
      case 'setPreds': {
        if (!(ids.has(op.id) || op.id === E)) return net;
        const want = [...new Set(op.preds)].filter((p) => (ids.has(p) || p === S) && p !== op.id);
        const before = net.arcs.filter((a) => a.to === op.id).map((a) => a.from).sort(byId);
        if (has(op.id) && JSON.stringify(before) === JSON.stringify(want.slice().sort(byId))) return net;
        const out = copy(net);
        // Lo que se nombra y no está en el lienzo se coloca: las predecesoras antes, y el nodo a la derecha de la última.
        for (const p of want) if (!out.nodes.some((n) => n.id === p)) out.nodes.push(Object.assign({ id: p }, spot(out, null)));
        if (!out.nodes.some((n) => n.id === op.id)) {
          const near = want.map((p) => out.nodes.find((n) => n.id === p)).sort((a, b) => b.x - a.x)[0];
          out.nodes.push(Object.assign({ id: op.id }, spot(out, near || null)));
        }
        out.arcs = out.arcs.filter((a) => a.to !== op.id).concat(want.map((p) => ({ from: p, to: op.id })));
        return out;
      }
      case 'place': return placeLevels(net);
      default: return net;
    }
  }

  // ---------- «Tu red como tabla» ----------

  const nameOf = (id, lang) => (id === S ? I.t(lang, 'node.start') : id === E ? I.t(lang, 'node.end') : id);
  function predsText(net, id, lang) {
    const ps = net.arcs.filter((a) => a.to === id).map((a) => a.from);
    return ps.sort((a, b) => (a === S ? -1 : b === S ? 1 : byId(a, b))).map((p) => nameOf(p, lang)).join(', ');
  }
  // Nombres separados por comas, espacios o punto y coma; Inicio y Fin en los dos idiomas.
  function parsePreds(text, id, project, lang) {
    const ids = new Set(project.activities.map((a) => a.id));
    const words = String(text || '').split(/[\s,;]+/).map((w) => w.trim()).filter(Boolean);
    const out = [];
    const startNames = ['inicio', 'start', I.t(lang, 'node.start').toLowerCase()];
    const endNames = ['fin', 'end', I.t(lang, 'node.end').toLowerCase()];
    for (const w of words) {
      const up = w.toUpperCase();
      if (ids.has(up)) {
        if (up === id) return { ok: false, code: 'self', x: id };
        out.push(up);
      } else if (startNames.includes(w.toLowerCase())) out.push(S);
      else if (endNames.includes(w.toLowerCase())) return { ok: false, code: 'end' };
      else return { ok: false, code: 'unknown', v: w };
    }
    return { ok: true, preds: [...new Set(out)] };
  }

  // ---------- Diagnóstico en palabras y sus marcas sobre el dibujo (tableros 82 y 83) ----------

  function issueText(issue, project, lang) {
    const t = (k, p) => I.t(lang, `xb.issue.${k}`, p);
    const [a, b] = (issue.ids || []).map((x) => nameOf(x, lang));
    switch (issue.code) {
      case 'cycle': return t('cycle', { list: I.list(lang, issue.nodes) });
      case 'startLink': return t(project.preds[issue.ids[0]].length ? 'startOut' : 'startIn', { a });
      case 'endLink': return t(project.succs[issue.ids[0]].length ? 'endOut' : 'endIn', { a });
      case 'missingNode': case 'inverted': case 'missingPrecedence': case 'falsePrecedence': case 'startMissing': case 'endMissing': case 'invalidArc':
        return t(issue.code, { a, b });
      default: return issue.code;
    }
  }
  const warnText = (w, lang) => I.t(lang, 'xb.issue.redundant', { a: w.ids[0], b: w.ids[1], path: w.path.join(' → ') });

  // Número, color y trazo de cada problema (no solo color): arcos que sobran, arcos que faltan (punteados) y nodos.
  function marks(project, r) {
    const arcs = {}; const nodes = {}; const ghosts = []; const chips = {};
    if (!r) return { arcs, nodes, ghosts, chips };
    r.issues.forEach((i, k) => {
      const n = k + 1;
      const [a, b] = i.ids || [];
      if (i.code === 'falsePrecedence' || i.code === 'invalidArc') arcs[`${a}>${b}`] = { kind: 'bad', n };
      else if (i.code === 'inverted') arcs[`${b}>${a}`] = { kind: 'bad', n };
      else if (i.code === 'missingPrecedence') ghosts.push({ from: a, to: b, kind: 'bad', n });
      else if (i.code === 'startLink') { if (project.preds[a].length) arcs[`${S}>${a}`] = { kind: 'bad', n }; else ghosts.push({ from: S, to: a, kind: 'bad', n }); }
      else if (i.code === 'endLink') { if (project.succs[a].length) arcs[`${a}>${E}`] = { kind: 'bad', n }; else ghosts.push({ from: a, to: E, kind: 'bad', n }); }
      else if (i.code === 'startMissing') nodes[S] = { kind: 'bad', n };
      else if (i.code === 'endMissing') nodes[E] = { kind: 'bad', n };
      else if (i.code === 'cycle') i.nodes.forEach((x, j) => { nodes[x] = { kind: 'bad', n: j ? null : n }; });
      else if (i.code === 'missingNode') chips[a] = { kind: 'bad', n };
    });
    for (const w of r.warnings) if (!arcs[`${w.ids[0]}>${w.ids[1]}`]) arcs[`${w.ids[0]}>${w.ids[1]}`] = { kind: 'warn', n: null };
    return { arcs, nodes, ghosts, chips };
  }

  const pctOf = (v) => Math.round(v * 10) / 10;
  function gradeText(r, lang) {
    const c = r.counts;
    const raw = pctOf(c.total ? 100 * Math.max(0, c.hits - c.falseArcs) / c.total : (c.falseArcs ? 0 : 100));
    const fmt = (v) => (lang === 'es' ? String(v).replace('.', ',') : String(v));
    const k = c.falseArcs === 0 ? 'countNone' : c.falseArcs === 1 ? 'countOne' : 'count';
    const count = I.t(lang, `xb.grade.${k}`, { hits: c.hits, total: c.total, f: c.falseArcs, raw: fmt(raw) });
    return c.cycle ? `${count} ${I.t(lang, 'xb.grade.cycle')}` : count;
  }
  const scoreText = (r, lang) => `${lang === 'es' ? String(pctOf(RC.score(r))).replace('.', ',') : pctOf(RC.score(r))} %`;

  // ---------- Vista ----------

  function create(hooks) {
    const G = root.PNL;
    const { h, clear } = G.dom;
    const lang = () => hooks.lang();
    const tt = (k, p) => I.t(lang(), k, p);
    const reto = !!hooks.reto;
    let checked = null;        // Practicar: { r } de la última comprobación (solo en la página)
    let showCorrect = false;   // Practicar: «Ver la red correcta» abierta
    let confirmOpen = false;   // Examen: confirmación de «Entregar»
    let focusAfter = null;     // id que recibe el foco tras pintar
    let tableMsg = null;       // { key, params, id }: lo último que no valió en «Tu red como tabla»
    let last = null;           // { container, m }
    let lastNet = null;

    function reset() { checked = null; showCorrect = false; confirmOpen = false; tableMsg = null; G.royCanvas.reset(); }

    function onOp(op) {
      const m = last.m;
      const net = normalize(hooks.state().rn, m.project);
      const next = apply(net, op, m.project);
      if (next === net) return false;
      checked = null;
      tableMsg = null;
      hooks.dispatch({ type: 'rn', value: next }, { fromEx: true });
      redraw();
      return true;
    }
    function redraw() { if (last) draw(last.container, last.m); }

    function check() {
      checked = { r: RC.diagnose(last.m.project, lastNet) };
      focusAfter = 'xbDiagTitle';
      redraw();
      hooks.announce(diagTitle(checked.r));
    }
    function deliver() {
      confirmOpen = false;
      focusAfter = 'xbGradeHead';
      hooks.dispatch({ type: 'exDeliver' });
      const r = RC.diagnose(last.m.project, normalize(hooks.state().rn, last.m.project));
      hooks.announce(`${tt('xb.grade.label')}: ${scoreText(r, lang())}`);
    }
    const diagTitle = (r) => (r.issues.length ? (r.issues.length === 1 ? tt('xb.diag.titleOne') : tt('xb.diag.title', { n: r.issues.length })) : tt('xb.diag.ok'));

    const button = (label, onclick, o = {}) => h('button', Object.assign({ type: 'button', class: `ghost${o.primary ? ' primary' : ''}`, onclick }, o.attrs || {}), [label]);
    const badge = (n, kind) => h('span', { class: `xb-badge ${kind}`, 'aria-hidden': 'true' }, [n == null ? '!' : String(n)]);

    function givenCard(p) {
      const ids = p.activities.map((a) => a.id);
      const halves = ids.length > 7 ? 2 : 1;
      const per = Math.ceil(ids.length / halves);
      const tables = [];
      for (let k = 0; k < halves; k++) {
        tables.push(h('table', { class: 'data ex-given' }, [
          k === 0 ? h('caption', { class: 'sr-only' }, [tt('xb.table')]) : null,
          h('thead', {}, [h('tr', {}, [h('th', { scope: 'col' }, [tt('ex.act')]), h('th', { scope: 'col', class: 'd' }, [tt('ex.d')]), h('th', { scope: 'col' }, [tt('ex.preds')])])]),
          h('tbody', {}, ids.slice(k * per, (k + 1) * per).map((a) => h('tr', {}, [h('th', { scope: 'row' }, [a]),
            h('td', { class: 'd' }, [hooks.numFmt(p.activities.find((x) => x.id === a).d)]), h('td', {}, [p.preds[a].join(', ') || '—'])]))),
        ]));
      }
      return h('section', { class: 'card xb-given', id: 'xbGiven', 'aria-labelledby': 'xbGivenHead' }, [h('h2', { id: 'xbGivenHead' }, [tt('xb.table')]), h('div', { class: 'ex-halves' }, tables)]);
    }

    function tableCard(p, net, locked) {
      const holder = h('div', { class: 'xb-yours-body' });
      G.royTable.render(holder, { project: p, net, lang: lang(), locked, msg: tableMsg,
        onOp: (op) => { const ok = onOp(op); if (ok) hooks.announce(tt('xb.did.table', { x: nameOf(op.id, lang()), list: predsText(normalize(hooks.state().rn, p), op.id, lang()) || '—' })); return ok; },
        onBad: (msg) => { tableMsg = msg; hooks.announce(tt(msg.key, msg.params)); } });
      return h('section', { class: 'card xb-yours', 'aria-labelledby': 'xbYoursHead' }, [h('h2', { id: 'xbYoursHead' }, [tt('xb.yourTable')]),
        locked ? null : h('p', { class: 'muted small' }, [tt('xb.yourTableHint')]), holder]);
    }

    function diagList(p, r) {
      const items = r.issues.map((i, k) => h('li', { class: 'xb-issue' }, [badge(k + 1, 'bad'), h('span', {}, [issueText(i, p, lang())])]));
      const warns = r.warnings.map((w) => h('li', { class: 'xb-warn' }, [badge(null, 'warn'), h('span', {}, [h('strong', {}, [`${tt('xb.diag.warn')}:`]), ' ', warnText(w, lang())])]));
      return [items.length ? h('ol', { class: 'xb-list', id: 'xbDiag' }, items) : null, warns.length ? h('ul', { class: 'xb-list', id: 'xbWarn' }, warns) : null];
    }

    function correctCard(p, small) {
      const holder = h('div', { class: 'xb-correct-box' });
      const net = placeLevels(RC.fromTable(p));
      G.royCanvas.renderStatic(holder, { net, lang: lang(), name: tt('xb.correctName'), prefix: 'xbok' });
      return h('section', { class: `card xb-correct${small ? ' small' : ''}`, id: 'xbCorrect', 'aria-labelledby': 'xbCorrectHead' }, [
        h('h2', { id: 'xbCorrectHead' }, [tt('xb.correct')]), holder, h('p', { class: 'muted small' }, [tt('xb.correctKeep')])]);
    }

    function draw(container, m) {
      last = { container, m };
      const s = hooks.state();
      const p = m.project;
      const net = normalize(s.rn, p);
      lastNet = net;
      const exam = !reto && s.xm === 'exam';
      const delivered = exam && !!s.xd;
      const r = delivered ? RC.diagnose(p, net) : checked ? checked.r : null;
      const sideOn = delivered || !!r || (showCorrect && !exam);
      const active = root.document.activeElement;
      const keepId = !focusAfter && active && container.contains(active) ? active.id : null;
      clear(container);

      // ---- Lienzo ----
      const canvasHolder = h('div', { class: 'xb-canvas' });
      G.royCanvas.render(canvasHolder, { key: reto ? `reto:${hooks.key()}` : JSON.stringify([s.sd, s.lv, s.gp, s.xm]), project: p, net, lang: lang(), locked: delivered,
        marks: r ? marks(p, r) : null, onOp, onRepaint: redraw, announce: hooks.announce });
      const actions = [];
      if (!exam) actions.push(button(showCorrect ? tt('xb.hide') : tt('xb.see'), () => { showCorrect = !showCorrect; focusAfter = 'xbSee'; redraw(); },
        { attrs: { id: 'xbSee', 'aria-expanded': String(showCorrect), 'aria-controls': showCorrect ? 'xbCorrect' : null } }));
      if (!exam) actions.push(button(tt('xb.check'), check, { primary: true, attrs: { id: 'xbCheck' } }));
      if (exam && !delivered) actions.push(button(tt('xb.deliver'), () => { confirmOpen = true; focusAfter = 'xbConfirmYes'; redraw(); }, { primary: true, attrs: { id: 'xbDeliver' } }));
      if (delivered) actions.push(button(tt('ex.another'), hooks.another, { primary: true, attrs: { id: 'xbAnother2' } }));
      const foot = h('div', { class: 'xb-foot' }, [
        h('p', { class: 'muted small' }, [delivered ? tt('xb.exam.delivered') : r ? tt('xb.diag.marks') : exam ? tt('xb.exam.note') : '']),
        h('div', { class: 'ex-btns' }, actions)]);
      const confirm = confirmOpen && exam && !delivered ? h('div', { class: 'ex-confirm', role: 'alertdialog', 'aria-labelledby': 'xbConfirmText' }, [
        h('p', { id: 'xbConfirmText' }, [tt('xb.exam.confirm')]),
        h('div', { class: 'ex-btns' }, [button(tt('xb.exam.confirmYes'), deliver, { primary: true, attrs: { id: 'xbConfirmYes' } }),
          button(tt('xb.exam.confirmNo'), () => { confirmOpen = false; focusAfter = 'xbDeliver'; redraw(); }, { attrs: { id: 'xbConfirmNo' } })])]) : null;
      const head = h('div', { class: 'ex-head' }, [h('h2', { id: 'xbCanvasHead' }, [delivered ? tt('xb.canvasLocked') : tt('xb.canvas')]),
        delivered ? h('span', { class: 'muted small' }, [tt('xb.locked')]) : null]);
      const canvasCard = h('section', { class: 'card xb-work', 'aria-labelledby': 'xbCanvasHead' }, [head, canvasHolder,
        delivered ? h('div', { class: 'xb-diag-in' }, diagList(p, r)) : null,
        delivered ? h('details', { class: 'xb-alt' }, [h('summary', {}, [tt('xb.yourTable')]), tableCard(p, net, true)]) : null, foot, confirm]);

      if (reto) container.appendChild(h('p', { id: 'xbRetoTitle' }, [tt('xb.reto.title')]));
      if (!sideOn) {
        container.appendChild(h('div', { class: 'xb-grid' }, [h('div', { class: 'xb-left' }, [givenCard(p), tableCard(p, net, false)]), canvasCard]));
      } else {
        const side = [];
        if (delivered) {
          side.push(h('section', { class: 'card xb-grade', id: 'xbGrade', 'aria-labelledby': 'xbGradeHead' }, [
            h('h2', { id: 'xbGradeHead', tabindex: '-1', class: 'xb-grade-head' }, [h('span', { class: 'muted small' }, [tt('xb.grade.label')]), ' ',
              h('strong', { id: 'xbScore' }, [scoreText(r, lang())]), ' ', h('span', { class: 'muted small' }, [tt('xb.grade.of')])]),
            h('p', { id: 'xbGradeText' }, [gradeText(r, lang())])]));
          side.push(correctCard(p, true));
        } else {
          if (r) {
            side.push(h('section', { class: `card xb-diag${r.ok ? ' ok' : ''}`, 'aria-labelledby': 'xbDiagTitle' }, [
              h('h2', { id: 'xbDiagTitle', tabindex: '-1' }, [diagTitle(r)])].concat(diagList(p, r), [h('p', { class: 'muted small' }, [tt('xb.diag.practice')])])));
          }
          if (showCorrect) side.push(correctCard(p, !!r));
          side.push(h('details', { class: 'xb-alt' }, [h('summary', {}, [tt('xb.table')]), givenCard(p)]));
        }
        container.appendChild(h('div', { class: 'xb-grid xb-with-side' }, [canvasCard, h('div', { class: 'xb-side' }, side)]));
      }

      // Foco: el que pide la acción, el del lienzo (un nodo recién colocado) o el que tenía antes de pintar.
      const fromCanvas = G.royCanvas.takeFocus();
      const want = focusAfter || fromCanvas || keepId;
      focusAfter = null;
      if (want) { const el = root.document.getElementById(want); if (el && !el.disabled) el.focus(); }
    }

    function debug() {
      const s = hooks.state();
      const m = last && last.m;
      const net = m ? normalize(s.rn, m.project) : null;
      const delivered = !reto && s.xm === 'exam' && !!s.xd;
      const r = m ? (delivered ? RC.diagnose(m.project, net) : checked ? checked.r : null) : null;
      return { net, result: r, score: delivered && r ? RC.score(r) : null, showCorrect, confirmOpen, canvas: G.royCanvas.state() };
    }

    return { draw, reset, debug };
  }

  // Reto ROY del taller (T009): el controlador con hooks.reto, la clave del lienzo por la estructura de la tabla (otra tabla
  // empieza de cero: se olvida el diagnóstico) y un solo lienzo con sus ids (el de «Ejercicios» se vacía; ex.js lo vuelve
  // a pintar al volver). La región toma su nombre de xb.reto.region.
  function workshop(hooks) {
    let key = null;
    const b = create(Object.assign({ reto: true, key: () => key }, hooks));
    const doc = root.document;
    return {
      draw(container, project, k) {
        if (k !== key) { key = k; b.reset(); }
        const exBody = doc.querySelector('#exView .xb-body');
        if (exBody) root.PNL.dom.clear(exBody);
        container.setAttribute('aria-label', I.t(hooks.lang(), 'xb.reto.region'));
        b.draw(container, { project });
      },
      leave(container) { if (!container.firstChild) return; root.PNL.dom.clear(container); b.reset(); key = null; },
      debug: (container) => (container.firstChild ? b.debug() : null),
    };
  }

  const api = { GEO, start, normalize, placeLevels, spot, snap, joinError, apply, hasWork, nameOf, predsText, parsePreds, issueText, warnText, marks, gradeText, scoreText, create, workshop };
  root.PNL = root.PNL || {};
  root.PNL.exBuild = api;
  if (isNode) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
