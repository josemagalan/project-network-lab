/*
 * ex-det — el detective en «Ejercicios» (spec f3d-construir-detectar, AC8–AC11, AC13, AC16, AC17 y AC20; plan §3, §4,
 * P5 y P6; tableros 86, 87 y 92). ex.js le cede el cuerpo de la vista con xk=det; la barra (con «Red» y «Errores», dg y
 * dk) sigue siendo la de ex.js.
 *
 * La tabla y los errores salen de core/detective.forSeed con la semilla, el nivel, la red y el grupo de errores (H2: si la
 * tabla de la semilla no admite ningún error del grupo, la de la siguiente que lo admite, y se dice). La red con errores
 * la dibuja views/det-view; las marcas del alumno («elemento:tipo») viven en la clave dm del enlace. En Practicar,
 * «Comprobar» corrige con detective.grade y la corrección vive en la página (cambiar una marca la borra); «Ver los
 * errores» enseña la lista de los sembrados con su explicación. En Examen no hay corrección hasta «Entregar» (xd=1); la
 * entrega se corrige al abrir el enlace.
 *
 * La parte sin DOM (menu, setMark, unmark, elName, typeName, explainText, scoreText, countText, seeded) se prueba en Node
 * (tests/ex-det.test.js); create() pinta la vista. Para las pruebas de navegador, PNL.exDet.state() da la tabla usada,
 * los errores sembrados, las marcas y la corrección.
 */
(function (root) {
  'use strict';

  const isNode = typeof module !== 'undefined' && module.exports;
  const req = (path, name) => (isNode ? require(path) : root.PNL[name]);
  const I = req('./i18n.js', 'i18n');
  if (isNode) require('./i18n-det.js');
  const D = req('./core/detective.js', 'detective');
  const U = req('./core/urlstate.js', 'urlstate');
  const C = req('./core/cpm.js', 'cpm');
  const NR = req('./narrate.js', 'narrate');

  const S = '_S';
  const E = '_E';
  // Una casilla tiene un solo tipo de error («mal calculado»); EF y LS van con ES y LF (nunca se siembran: falsa alarma).
  const CELL_TYPE = { ES: 'calcES', EF: 'calcES', LS: 'calcLF', LF: 'calcLF', TF: 'calcFloat', TE: 'calcTE', TL: 'calcTL', slack: 'calcSlack' };
  const tt = (lang, k, p) => I.t(lang, `det.${k}`, p);
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  const num = (v, lang) => NR.fmt(lang, v);

  // ---------- Elementos y su menú ----------

  function elKind(el, graph) {
    if (/^d:/.test(el)) return 'dummy';
    if (/^e\d+$/.test(el)) return 'event';
    if (/^e\d+\./.test(el)) return 'cell';
    if (el.includes('>')) return 'arc';
    if (/\.crit$/.test(el)) return 'crit';
    if (el.includes('.')) return 'cell';
    return graph === 'aoa' ? 'act' : 'node';
  }

  // Lo que le puede pasar a un elemento, solo con los tipos del grupo pedido (P5). Un nodo o una actividad llevan también
  // su marca de crítica, que es otro elemento («A.crit»).
  function menu(el, graph, kind) {
    const net = kind !== 'calc';
    const calc = kind !== 'net';
    const o = (type, element) => ({ type, element: element || el });
    switch (elKind(el, graph)) {
      case 'arc': return net ? ['royFalse', 'royInverted', 'royCycle'].map((t) => o(t)) : [];
      case 'node': return [net ? o('royMissing') : null, calc && el !== S && el !== E ? o('calcCrit', `${el}.crit`) : null].filter(Boolean);
      case 'event': return net ? [o('pertMissingDummy')] : [];
      case 'dummy': return net ? [o('pertFalseDummy'), o('pertInvertedDummy')] : [];
      case 'act': return [net ? o('pertParallel') : null, calc ? o('calcCrit', `${el}.crit`) : null].filter(Boolean);
      case 'crit': return calc ? [o('calcCrit')] : [];
      default: return calc ? [o(CELL_TYPE[el.split('.')[1]])] : [];
    }
  }

  // Una marca por elemento: cambiar el tipo la sustituye; sin marcas, null (nada en el enlace).
  function setMark(marks, element, type) {
    const out = (marks || []).map((m) => ({ element: m.element, type: m.type }));
    const k = out.findIndex((m) => m.element === element);
    if (k >= 0) out[k].type = type; else out.push({ element, type });
    return out;
  }
  function unmark(marks, element) {
    const out = (marks || []).filter((m) => m.element !== element).map((m) => ({ element: m.element, type: m.type }));
    return out.length ? out : null;
  }

  // ---------- Nombres y explicaciones ----------

  const nodeName = (id, lang) => (id === S ? I.t(lang, 'node.start') : id === E ? I.t(lang, 'node.end') : id);
  const typeName = (type, lang) => tt(lang, `type.${type.startsWith('calc') && type !== 'calcCrit' ? 'calc' : type}`);

  function labOf(el, ctx) {
    const [who, f] = el.split('.');
    if (/^e\d+$/.test(who)) return cap(I.t(ctx.lang, `ex.lab.${f}`, { n: who.slice(1) }));
    return I.t(ctx.lang, 'ex.lab.act', { f: I.notation(ctx.nota)[f], a: who });
  }

  function elName(el, ctx) {
    const lang = ctx.lang;
    const pert = ctx.shown && ctx.shown.pert;
    switch (elKind(el, ctx.graph)) {
      case 'arc': { const [a, b] = el.split('>'); return tt(lang, 'el.arc', { from: nodeName(a, lang), to: nodeName(b, lang) }); }
      case 'node': return tt(lang, 'el.node', { x: nodeName(el, lang) });
      case 'event': return tt(lang, 'el.event', { n: el.slice(1) });
      case 'dummy': {
        const [from, to] = el.slice(2).split('-').map(Number);
        const d = pert ? pert.dummies.find((x) => x.from === from && x.to === to) : null;
        return tt(lang, 'el.dummy', { name: d ? d.name : '', from, to });
      }
      case 'act': {
        const a = pert ? pert.arcs.find((x) => x.act === el) : null;
        return tt(lang, 'el.act', { x: el, from: a ? a.from : '', to: a ? a.to : '' });
      }
      case 'crit': return tt(lang, 'el.crit', { x: el.split('.')[0] });
      default: return labOf(el, ctx);
    }
  }

  // El elemento de un error, también si no está en el dibujo (una ficticia que falta, dos actividades paralelas).
  function errName(e, ctx) {
    if (e.type === 'pertMissingDummy') return tt(ctx.lang, 'el.dummy', { name: e.data.dummy, from: e.data.from, to: e.data.to });
    if (e.type === 'pertParallel') return tt(ctx.lang, 'el.act', { x: e.data.act, from: e.data.from, to: e.data.to });
    return elName(e.element, ctx);
  }

  const floats = new WeakMap();
  const tfOf = (project, id) => { if (!floats.has(project)) floats.set(project, C.solve(project).floats); return floats.get(project)[id].TF; };

  function explainText(error, ctx) {
    const x = D.explain(error).params;
    const lang = ctx.lang;
    const N = I.notation(ctx.nota);
    const EN = I.eventNotation(ctx.nota);
    const f = (v) => ctx.numFmt(v);
    const nm = (id) => nodeName(id, lang);
    const who = String(error.element).split('.')[0];
    const val = { lab: labOf(error.element, ctx), wrong: 'wrong' in x ? f(x.wrong) : '', right: 'right' in x ? f(x.right) : '' };
    let key = error.type;
    let p;
    switch (error.type) {
      case 'royMissing': case 'royFalse': case 'royInverted': case 'royCycle': p = { from: nm(x.from), to: nm(x.to) }; break;
      case 'pertFalseDummy': {
        const d = ctx.shown.pert.dummies.find((q) => q.from === x.from && q.to === x.to);
        p = { name: d ? d.name : '', from: x.from, to: x.to };
        break;
      }
      case 'pertMissingDummy': case 'pertInvertedDummy': p = { dummy: x.dummy, from: x.from, to: x.to }; break;
      case 'pertParallel': p = { act: x.act, twin: x.twin, from: x.from, to: x.to, dummy: x.dummy }; break;
      case 'calcES': p = Object.assign({ f: N.EF }, val); break;
      case 'calcLF': p = Object.assign({ f: N.LS }, val); break;
      case 'calcFloat': p = Object.assign({ lf: N.LF, es: N.ES }, val); break;
      case 'calcCrit': key = error.wrong ? 'calcCritOn' : 'calcCritOff'; p = { x: who, tf: f(tfOf(ctx.project, who)) }; break;
      case 'calcSlack': p = Object.assign({ tl: EN.TL, te: EN.TE }, val); break;
      default: p = val;
    }
    return tt(lang, `exp.${key}`, p);
  }

  const pct = (v, lang) => { const r = Math.round(v * 10) / 10; return lang === 'es' ? String(r).replace('.', ',') : String(r); };
  const scoreText = (g, lang) => `${pct(g.score, lang)} %`;
  function countText(g, n, lang) {
    const c = (s) => g.perError.filter((x) => x.status === s).length;
    return tt(lang, 'res.count', { f: c('found'), h: c('half'), a: g.falseAlarms.length, n, pct: pct(g.score, lang) });
  }

  // La tabla y los errores de una semilla (H2), en caché: cambiar el idioma o marcar no vuelve a sembrar.
  const cache = new Map();
  function seeded(params, sd, opts) {
    const key = JSON.stringify([params, sd, opts.level, opts.graph, opts.kind]);
    if (!cache.has(key)) {
      if (cache.size > 20) cache.clear();
      cache.set(key, D.forSeed(params, sd, { level: opts.level, graph: opts.graph, kind: opts.kind }));
    }
    return cache.get(key);
  }

  // ---------- Vista ----------

  function create(hooks) {
    const G = root.PNL;
    const { h, clear } = G.dom;
    const lang = () => hooks.lang();
    const t = (k, p) => tt(lang(), k, p);
    let checked = null;        // Practicar: { key, g } de la última comprobación (solo en la página)
    let showErrors = false;    // Practicar: «Ver los errores»
    let confirmOpen = false;   // Examen: confirmación de «Entregar»
    let open = null;           // elemento con el menú abierto
    let focusAfter = null;     // { id } o { el }: lo que recibe el foco tras pintar
    let last = null;           // { container, m }
    let view = null;           // lo último pintado (pruebas)
    let full = false;          // la última marca se rechazó por pasar de U.MAX_DM (se dice bajo «Tus marcas»)

    function reset() { checked = null; showErrors = false; confirmOpen = false; open = null; full = false; }
    const redraw = () => { if (last) draw(last.container, last.m); };
    const marksOf = () => hooks.state().dm || [];
    const keyOf = (ms) => JSON.stringify(ms);

    function params(m) {
      const s = hooks.state();
      return { prm: m.params, sd: s.sd, opts: { level: s.lv, graph: s.dg === 'aoa' ? 'aoa' : 'aon', kind: ['net', 'calc', 'all'].includes(s.dk) ? s.dk : 'all' } };
    }

    function setMarks(next, said) {
      full = false;
      hooks.dispatch({ type: 'dm', value: next }, { fromEx: true });
      if (said) hooks.announce(said);
      redraw();
    }

    function draw(container, m) {
      last = { container, m };
      const s = hooks.state();
      const q = params(m);
      const r = seeded(q.prm, q.sd, q.opts);
      clear(container);
      // Sin tabla que admita el grupo pedido (p. ej., «Personalizar» muy estrecho): se dice, en vez de dejar la vista en
      // blanco (revisión de T018, I-F10).
      if (!r) { view = null; container.appendChild(h('p', { class: 'banner', role: 'status', id: 'dtNoTable' }, [t('noTable')])); return; }
      const ctx = { graph: r.seeded.graph, project: r.project, shown: r.seeded.shown, lang: lang(), nota: s.nota, numFmt: hooks.numFmt };
      const exam = s.xm === 'exam';
      const delivered = exam && !!s.xd;
      const marks = marksOf();
      if (checked && checked.key !== keyOf(marks)) checked = null;
      const g = delivered ? D.grade(r.seeded, marks) : checked ? checked.g : null;
      if (delivered) { open = null; confirmOpen = false; }
      const kind = r.seeded.kind;
      const graph = r.seeded.graph;
      const active = root.document.activeElement;
      const keepEl = !focusAfter && active && container.contains(active) ? (active.getAttribute('data-el') ? { el: active.getAttribute('data-el') } : active.id ? { id: active.id } : null) : null;

      // ---- Estado de cada elemento en el dibujo: marcado (con su número) o, corregido, encontrado, a medias, falsa alarma
      // o no encontrado (lo que falta, punteado). No solo color: cada uno lleva su signo.
      const status = {};
      const ghosts = [];
      const whereOf = (el) => (/\.crit$/.test(el) ? el.split('.')[0] : el);
      marks.forEach((mk, k) => { status[whereOf(mk.element)] = { cls: 'marked', badge: String(k + 1), n: k + 1, type: mk.type }; });
      const missing = (e) => e.type === 'royMissing' || e.type === 'pertMissingDummy';
      const showMiss = (e, cls) => {
        if (missing(e)) ghosts.push({ from: e.data.from, to: e.data.to, cls, badge: cls === 'missed' ? '?' : '!' });
        else if (!status[whereOf(e.element)]) status[whereOf(e.element)] = { cls, badge: cls === 'missed' ? '?' : '!' };
      };
      if (g) {
        g.perError.forEach((x) => {
          const e = r.seeded.errors.find((y) => y.id === x.id);
          if (x.status === 'missed') showMiss(e, 'missed');
          else status[whereOf(x.mark.element)] = Object.assign({}, status[whereOf(x.mark.element)], { cls: x.status, badge: x.status === 'found' ? '✓' : '½' });
        });
        // Un nodo y su marca de crítica son el mismo dibujo: una falsa alarma en uno no tapa el error encontrado (o a medias)
        // en el otro; la lista de resultados dice las dos (revisión de T018, I-F7).
        for (const fa of g.falseAlarms) {
          const at = whereOf(fa.element);
          if (status[at] && (status[at].cls === 'found' || status[at].cls === 'half')) continue;
          status[at] = Object.assign({}, status[at], { cls: 'false', badge: '✗' });
        }
      } else if (showErrors && !exam) {
        for (const e of r.seeded.errors) showMiss(e, 'reveal');
      }

      // ---- Tabla dada (la de la semilla usada) ----
      const p = r.project;
      const ids = p.activities.map((a) => a.id);
      const halves = ids.length > 7 ? 2 : 1;
      const per = Math.ceil(ids.length / halves);
      const tables = [];
      for (let k = 0; k < halves; k++) {
        tables.push(h('table', { class: 'data ex-given' }, [
          k === 0 ? h('caption', { class: 'sr-only' }, [I.t(lang(), 'ex.given')]) : null,
          h('thead', {}, [h('tr', {}, [h('th', { scope: 'col' }, [I.t(lang(), 'ex.act')]), h('th', { scope: 'col', class: 'd' }, [I.t(lang(), 'ex.d')]), h('th', { scope: 'col' }, [I.t(lang(), 'ex.preds')])])]),
          h('tbody', {}, ids.slice(k * per, (k + 1) * per).map((a) => h('tr', {}, [h('th', { scope: 'row' }, [a]),
            h('td', { class: 'd' }, [hooks.numFmt(p.activities.find((x) => x.id === a).d)]), h('td', {}, [p.preds[a].join(', ') || '—'])]))),
        ]));
      }
      const given = h('section', { class: 'card dt-given', id: 'dtGiven', 'aria-labelledby': 'dtGivenHead' }, [h('h2', { id: 'dtGivenHead' }, [I.t(lang(), 'ex.given')]), h('div', { class: 'ex-halves' }, tables)]);

      // ---- Marcas (también la alternativa en texto de lo marcado) ----
      const markItems = marks.map((mk, k) => h('li', {}, [h('span', { class: 'dt-chip', 'aria-hidden': 'true' }, [String(k + 1)]),
        h('span', {}, [`${elName(mk.element, ctx)}: ${typeName(mk.type, lang())}`]),
        delivered ? null : h('button', { type: 'button', class: 'ghost dt-x', 'data-unmark': mk.element, 'aria-label': t('removeOf', { x: elName(mk.element, ctx) }),
          onclick: () => { focusAfter = { id: 'dtMarksHead' }; setMarks(unmark(marksOf(), mk.element), t('did.unmark', { x: elName(mk.element, ctx) })); } }, [t('remove')])]));
      const marksCard = h('section', { class: 'card dt-marks', 'aria-labelledby': 'dtMarksHead' }, [
        h('h2', { id: 'dtMarksHead', tabindex: '-1' }, [`${t('marks')} (${marks.length})`]),
        marks.length ? h('ol', { id: 'dtMarks', class: 'dt-list' }, markItems) : h('p', { class: 'muted small', id: 'dtMarks' }, [t('none')]),
        full && !delivered ? h('p', { class: 'small', id: 'dtFull', role: 'status' }, [t('tooMany', { n: U.MAX_DM })]) : null,
        delivered ? null : h('p', { class: 'muted small' }, [t('help')])]);

      // ---- La red como tabla (alternativa en texto de la red que se enseña) ----
      const alt = h('details', { class: 'dt-alt', id: 'dtAlt' }, [h('summary', {}, [t('alt.title')]), altTable(r)]);

      // ---- La red ----
      const netBox = h('div', { class: 'dt-net-box' });
      const values = kind === 'net' ? null : r.seeded.shown.values;
      G.detView.render(netBox, {
        graph, project: p, shown: r.seeded.shown, values, lang: lang(), nota: s.nota, numFmt: hooks.numFmt, status, ghosts, selected: open,
        label: t(graph === 'aoa' ? 'svgAoa' : 'svgAon'),
        ariaOf: (el) => ariaOf(el, ctx, status, values),
        interactive: (el) => !delivered && menu(el, graph, kind).length > 0,
        onOpen: (el) => { open = el; focusAfter = { id: 'dtMenuFirst' }; redraw(); },
        onClear: (el) => { const els = menu(el, graph, kind).map((o) => o.element); const had = marksOf().filter((mk) => els.includes(mk.element)); if (!had.length) return; let next = marksOf(); for (const x of els) next = unmark(next, x); focusAfter = { el }; setMarks(next, t('did.unmark', { x: elName(el, ctx) })); },
        onEscape: () => { if (open) { const el = open; open = null; focusAfter = { el }; redraw(); } },
      });
      const legend = kind === 'net' ? t('noFigures') : t(graph === 'aoa' ? 'legendAoa' : 'legendAon', Object.assign({}, I.notation(s.nota), I.eventNotation(s.nota)));
      const menuBox = open && !delivered ? menuOf(open, ctx, graph, kind) : null;
      const actions = [];
      if (!exam) actions.push(h('button', { type: 'button', class: 'ghost', id: 'dtSee', 'aria-expanded': String(showErrors), onclick: () => { showErrors = !showErrors; focusAfter = { id: showErrors ? 'dtErrorsHead' : 'dtSee' }; redraw(); } }, [showErrors ? t('hide') : t('see')]));
      if (!exam) actions.push(h('button', { type: 'button', class: 'ghost primary', id: 'dtCheck', onclick: check }, [t('check')]));
      if (exam && !delivered) actions.push(h('button', { type: 'button', class: 'ghost primary', id: 'dtDeliver', onclick: () => { confirmOpen = true; focusAfter = { id: 'dtConfirmYes' }; redraw(); } }, [t('deliver')]));
      if (delivered) actions.push(h('button', { type: 'button', class: 'ghost primary', id: 'dtAnother2', onclick: hooks.another }, [I.t(lang(), 'ex.another')]));
      const confirm = confirmOpen && exam && !delivered ? h('div', { class: 'ex-confirm', role: 'alertdialog', 'aria-labelledby': 'dtConfirmText' }, [
        h('p', { id: 'dtConfirmText' }, [t('exam.confirm')]),
        h('div', { class: 'ex-btns' }, [h('button', { type: 'button', class: 'ghost primary', id: 'dtConfirmYes', onclick: deliver }, [t('exam.confirmYes')]),
          h('button', { type: 'button', class: 'ghost', id: 'dtConfirmNo', onclick: () => { confirmOpen = false; focusAfter = { id: 'dtDeliver' }; redraw(); } }, [t('exam.confirmNo')])])]) : null;
      const work = h('section', { class: 'card dt-work', 'aria-labelledby': 'dtTitle' }, [
        r.moved ? h('p', { class: 'banner small', id: 'dtMoved', role: 'status' }, [t('moved', { sd: s.sd, used: r.sd })]) : null,
        h('div', { class: 'dt-head' }, [h('h2', { id: 'dtTitle' }, [r.seeded.count === 1 ? t('titleOne') : t('title', { n: r.seeded.count })]),
          h('p', { class: 'muted small', id: 'dtLegend' }, [legend])]),
        netBox, menuBox,
        h('div', { class: 'dt-foot' }, [
          h('p', { class: 'muted small', id: exam ? 'dtNote' : 'dtKeys' }, [delivered ? t('exam.delivered') : exam ? t('exam.note') : t('keys')]),
          h('div', { class: 'ex-btns' }, actions)]),
        confirm]);

      // ---- Corrección y errores ----
      const side = [];
      if (g) side.push(resultCard(r, ctx, g, marks, delivered));
      if (showErrors && !exam) side.push(errorsCard(r, ctx));
      if (side.length) {
        if (!g) side.push(marksCard);
        side.push(h('details', { class: 'dt-alt' }, [h('summary', {}, [I.t(lang(), 'ex.given')]), given]), alt);
        container.appendChild(h('div', { class: 'dt-grid dt-with-side' }, [work, h('div', { class: 'dt-side' }, side)]));
      } else {
        container.appendChild(h('div', { class: 'dt-grid' }, [h('div', { class: 'dt-left' }, [given, marksCard, alt]), work]));
      }
      view = { r, g, marks, delivered };

      const want = focusAfter || keepEl;
      focusAfter = null;
      if (want) {
        const el = want.id ? root.document.getElementById(want.id) : container.querySelector(`[data-el="${want.el}"][tabindex]`);
        if (el) el.focus();
      }
    }

    function ariaOf(el, ctx, status, values) {
      let a = elName(el, ctx);
      const kind = elKind(el, ctx.graph);
      if (values && (kind === 'node' || kind === 'act') && el !== S && el !== E) {
        const crit = ctx.graph === 'aoa' ? values.crit[el] : values.acts[el].crit;
        a += `, ${tt(ctx.lang, crit ? 'aria.crit' : 'aria.notCrit')}`;
      }
      if (kind === 'cell' && values) {
        const [who, f] = el.split('.');
        const v = /^e\d+$/.test(who) ? values.events[who.slice(1)][f] : values.acts[who][f];
        a += `: ${ctx.numFmt(v)}`;
      }
      const st = status[el];
      if (st) {
        const marks = marksOf().filter((mk) => mk.element === el || mk.element === `${el}.crit`);
        if (st.n) a += `, ${marks.map((mk) => tt(ctx.lang, 'aria.marked', { n: marksOf().indexOf(mk) + 1, type: typeName(mk.type, ctx.lang) })).join(', ')}`;
        if (st.cls === 'found' || st.cls === 'half') a += `, ${tt(ctx.lang, `aria.${st.cls}`)}`;
        if (st.cls === 'false') a += `, ${tt(ctx.lang, 'aria.falseAlarm')}`;
        if (st.cls === 'missed') a += `, ${tt(ctx.lang, 'aria.missed')}`;
        if (st.cls === 'reveal') a += `, ${tt(ctx.lang, 'aria.error')}`;
      }
      return a;
    }

    function menuOf(el, ctx, graph, kind) {
      const opts = menu(el, graph, kind);
      const marks = marksOf();
      const marked = opts.filter((o) => marks.some((mk) => mk.element === o.element));
      const choose = (o) => {
        open = null;
        focusAfter = { el };
        // La URL guarda como mucho U.MAX_DM marcas: la siguiente se rechaza y se dice (antes se perdía sin aviso; T018, N-F10).
        if (!marksOf().some((mk) => mk.element === o.element) && marksOf().length >= U.MAX_DM) { full = true; hooks.announce(t('tooMany', { n: U.MAX_DM })); redraw(); return; }
        setMarks(setMark(marksOf(), o.element, o.type), t('did.mark', { x: elName(o.element, ctx), type: typeName(o.type, lang()) }));
      };
      const close = () => { open = null; focusAfter = { el }; redraw(); };
      const btns = opts.map((o, k) => h('button', { type: 'button', class: 'ghost dt-opt', 'data-type': o.type, id: k === 0 ? 'dtMenuFirst' : null,
        'aria-pressed': String(marks.some((mk) => mk.element === o.element && mk.type === o.type)), onclick: () => choose(o) },
      [t(`opt.${o.type.startsWith('calc') && o.type !== 'calcCrit' ? 'calc' : o.type}`)]));
      if (marked.length) btns.push(h('button', { type: 'button', class: 'ghost dt-opt', id: 'dtUnmark', onclick: () => { let next = marksOf(); for (const o of marked) next = unmark(next, o.element); open = null; focusAfter = { el }; setMarks(next, t('did.unmark', { x: elName(el, ctx) })); } }, [t('unmark')]));
      btns.push(h('button', { type: 'button', class: 'ghost dt-opt', id: 'dtMenuClose', onclick: close }, [t('close')]));
      return h('div', { class: 'dt-menu', id: 'dtMenu', role: 'group', 'aria-labelledby': 'dtMenuHead', onkeydown: (ev) => { if (ev.key === 'Escape') { ev.preventDefault(); close(); } } }, [
        h('h3', { id: 'dtMenuHead' }, [t('menuOf', { x: elName(el, ctx) })]), h('div', { class: 'dt-opts' }, btns)]);
    }

    function resultCard(r, ctx, g, marks, delivered) {
      const n = r.seeded.count;
      const found = g.perError.filter((x) => x.status === 'found').length;
      const items = g.perError.map((x) => {
        const e = r.seeded.errors.find((y) => y.id === x.id);
        const head = { found: `✓ ${t('res.found')}`, half: `½ ${t('res.half')}`, missed: `? ${t('res.missed')}` }[x.status];
        const where = x.mark ? elName(x.mark.element, ctx) : errName(e, ctx);
        const extra = [];
        if (x.status === 'half') extra.push(t('res.youMarked', { type: typeName(x.mark.type, lang()) }));
        if (x.status === 'missed' && e.accept.length === 2 && e.accept.every((y) => !y.includes('.'))) extra.push(t('res.either', { a: elName(e.accept[0], ctx), b: elName(e.accept[1], ctx) }));
        return h('li', { class: `dt-res ${x.status}`, 'data-error': String(e.id) }, [h('span', { class: 'dt-st' }, [head]),
          h('span', { class: 'dt-what' }, [`${where} · ${typeName(e.type, lang())}`]), h('span', { class: 'dt-exp' }, [explainText(e, ctx)]),
          extra.length ? h('span', { class: 'muted small' }, [extra.join(' ')]) : null]);
      });
      for (const fa of g.falseAlarms) {
        items.push(h('li', { class: 'dt-res false' }, [h('span', { class: 'dt-st' }, [`✗ ${t('res.falseAlarm')}`]),
          h('span', { class: 'dt-what' }, [`${elName(fa.element, ctx)} · ${typeName(fa.type, lang())}`]), h('span', { class: 'dt-exp' }, [t('res.noError', { x: elName(fa.element, ctx) })])]));
      }
      return h('section', { class: 'card dt-result', id: 'dtResult', 'aria-labelledby': 'dtResultHead' }, [
        h('h2', { id: 'dtResultHead', tabindex: '-1' }, [n === 1 ? t('res.titleOne', { f: found }) : t('res.title', { f: found, n })]),
        h('p', { class: 'dt-grade' }, [h('span', { class: 'muted small' }, [t('res.grade')]), ' ', h('strong', { id: 'dtScore' }, [scoreText(g, lang())]), ' ',
          h('span', { class: 'muted small' }, [t('res.of')])]),
        h('p', { class: 'small', id: 'dtCount' }, [countText(g, n, lang())]),
        h('ul', { class: 'dt-list dt-results' }, items),
        h('p', { class: 'muted small' }, [t('res.rule')]),
        delivered ? null : h('p', { class: 'muted small' }, [t('res.practice')])]);
    }

    function errorsCard(r, ctx) {
      return h('section', { class: 'card dt-errors', id: 'dtErrors', 'aria-labelledby': 'dtErrorsHead' }, [h('h2', { id: 'dtErrorsHead', tabindex: '-1' }, [t('res.errorsTitle')]),
        h('ul', { class: 'dt-list' }, r.seeded.errors.map((e) => h('li', { 'data-error': String(e.id) }, [h('span', { class: 'dt-what' }, [`${errName(e, ctx)} · ${typeName(e.type, lang())}`]),
          h('span', { class: 'dt-exp' }, [explainText(e, ctx)])])))]);
    }

    function altTable(r) {
      const lg = lang();
      if (r.seeded.graph === 'aon') {
        const net = r.seeded.shown.roy;
        return h('table', { class: 'data dt-alt-t' }, [h('thead', {}, [h('tr', {}, [h('th', { scope: 'col' }, [t('alt.node')]), h('th', { scope: 'col' }, [t('alt.preds')])])]),
          h('tbody', {}, net.nodes.map((n) => h('tr', {}, [h('th', { scope: 'row' }, [nodeName(n.id, lg)]),
            h('td', {}, [net.arcs.filter((a) => a.to === n.id).map((a) => nodeName(a.from, lg)).join(', ') || '—'])])))]);
      }
      const net = r.seeded.shown.pert;
      return h('div', {}, [h('table', { class: 'data dt-alt-t' }, [h('thead', {}, [h('tr', {}, [h('th', { scope: 'col' }, [t('alt.act')]), h('th', { scope: 'col' }, [t('alt.from')]), h('th', { scope: 'col' }, [t('alt.to')])])]),
        h('tbody', {}, net.arcs.map((a) => h('tr', {}, [h('th', { scope: 'row' }, [a.act]), h('td', {}, [String(a.from)]), h('td', {}, [String(a.to)])])))]),
      h('p', { class: 'small' }, [net.dummies.length ? t('alt.dummies', { list: net.dummies.map((d) => `${d.name} (${d.from} → ${d.to})`).join(', ') }) : t('alt.noDummies')])]);
    }

    function check() {
      if (!view) return;
      checked = { key: keyOf(marksOf()), g: D.grade(view.r.seeded, marksOf()) };
      focusAfter = { id: 'dtResultHead' };
      redraw();
      hooks.announce(`${t('res.grade')}: ${scoreText(checked.g, lang())}`);
    }
    function deliver() {
      confirmOpen = false;
      focusAfter = { id: 'dtResultHead' };
      hooks.dispatch({ type: 'exDeliver' });
      if (view) hooks.announce(`${t('res.grade')}: ${scoreText(D.grade(view.r.seeded, marksOf()), lang())}`);
    }

    function debug() {
      if (!view) return null;
      const { r, g } = view;
      return { sd: hooks.state().sd, used: r.sd, moved: r.moved, seeded: { graph: r.seeded.graph, kind: r.seeded.kind, count: r.seeded.count, errors: r.seeded.errors },
        marks: marksOf(), grading: g, open, showErrors, confirmOpen };
    }

    return { draw, reset, debug };
  }

  const api = { CELL_TYPE, num, elKind, menu, setMark, unmark, nodeName, typeName, elName, errName, explainText, scoreText, countText, seeded, create };
  root.PNL = root.PNL || {};
  root.PNL.exDet = api;
  if (isNode) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
