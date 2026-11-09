/*
 * narrate — el texto de cada paso de la traza: título, explicación y líneas de fórmula con los números
 * del paso, en el idioma y la notación elegidos. Sin DOM: se prueba en Node (tests/content.test.js).
 */
(function (root) {
  'use strict';

  const isNode = typeof module !== 'undefined' && module.exports;
  const I = isNode ? require('./i18n.js') : root.PNL.i18n;
  const T = isNode ? require('./core/topo.js') : root.PNL.topo;
  const { START, END } = T;

  const SHOWN_PATHS = 6;   // caminos críticos que se escriben en el paso y en la lista de resultados
  const fmt = (lang, v) => Number(v).toLocaleString(lang === 'es' ? 'es-ES' : 'en-GB', { maximumFractionDigits: 2, useGrouping: false });

  function nodeName(lang, id) {
    if (id === START) return I.t(lang, 'node.start');
    if (id === END) return I.t(lang, 'node.end');
    return id;
  }

  // Cambia las siglas anglosajonas de una fórmula por las de la notación elegida.
  function relabel(text, nota) {
    const N = I.notation(nota);
    return text.replace(/\b(ES|EF|LS|LF|TF|FF|IF|SF)\b/g, (m) => N[m]);
  }

  function narrate(step, ctx) {
    const { lang, nota, solution, project, unit } = ctx;
    // ctx.hide: modo predicción sin comprobar; el texto dice qué se calcula, no quién manda ni el resultado.
    const hk = (k) => (ctx.hide ? `${k}Hidden` : k);
    const N = I.notation(nota);
    const t = (k, p) => I.t(lang, k, p);
    const nm = (id) => nodeName(lang, id);
    const num = (v) => fmt(lang, v);
    const max = lang === 'es' ? 'máx' : 'max';
    const min = lang === 'es' ? 'mín' : 'min';
    const dur = (id) => (id === START || id === END ? 0 : project.activities.find((a) => a.id === id).d);
    const out = { title: '', text: '', lines: [] };

    switch (step.kind) {
      case 'table': out.title = t('steps.table'); out.text = t('narr.table'); break;
      case 'build': out.title = t('steps.build'); out.text = t('narr.build'); break;
      case 'forward': {
        const a = step.act;
        const ES = step.reveals[0].value;
        const EF = step.reveals[1].value;
        const terms = step.formula.terms;
        if (a === END) {
          out.title = t('steps.forwardEnd');
          out.text = t(hk('narr.forwardEnd'), { d: num(ES), unit });
        } else if (terms.length === 1 && terms[0].from === START) {
          out.title = t('steps.forward', { act: a });
          out.text = t(hk('narr.forwardFirst'), { act: a });
        } else {
          out.title = t('steps.forward', { act: a });
          out.text = t(ctx.hide && terms.length === 1 ? 'narr.forwardOneHidden' : hk('narr.forward'), { act: a, preds: I.list(lang, terms.map((x) => nm(x.from))), chosen: I.list(lang, step.formula.chosen.map(nm)) });
        }
        out.lines.push(`${N.ES}(${nm(a)}) = ${max} { ${terms.map((x) => `${N.EF}(${nm(x.from)})`).join(', ')} } = ${max} { ${terms.map((x) => num(x.value)).join(', ')} } = ${num(ES)}`);
        if (a !== END) out.lines.push(`${N.EF}(${a}) = ${N.ES}(${a}) + d(${a}) = ${num(ES)} + ${num(dur(a))} = ${num(EF)}`);
        break;
      }
      case 'backward': {
        const a = step.act;
        const LF = step.reveals[0].value;
        const LS = step.reveals[1].value;
        const terms = step.formula.terms;
        if (a === END) {
          out.title = t('steps.backwardEnd');
          out.text = t(hk('narr.backwardEnd'), { d: num(LF), unit });
          out.lines.push(`${N.LF}(${nm(END)}) = ${N.LS}(${nm(END)}) = ${N.EF}(${nm(END)}) = ${num(LF)}`);
          break;
        }
        out.title = t('steps.backward', { act: a });
        out.text = terms.length === 1 && terms[0].from === END ? t(hk('narr.backwardLast'), { act: a })
          : t(ctx.hide && terms.length === 1 ? 'narr.backwardOneHidden' : hk('narr.backward'), { act: a, succs: I.list(lang, terms.map((x) => nm(x.from))), chosen: I.list(lang, step.formula.chosen.map(nm)) });
        out.lines.push(`${N.LF}(${a}) = ${min} { ${terms.map((x) => `${N.LS}(${nm(x.from)})`).join(', ')} } = ${min} { ${terms.map((x) => num(x.value)).join(', ')} } = ${num(LF)}`);
        out.lines.push(`${N.LS}(${a}) = ${N.LF}(${a}) − d(${a}) = ${num(LF)} − ${num(dur(a))} = ${num(LS)}`);
        break;
      }
      case 'float': {
        const f = step.float;
        out.title = t('steps.float', { name: t('floatName.' + f) });
        out.text = t('floatNarr.' + f);
        out.lines.push(`${N[f]} = ${relabel(t('formula.' + f), nota)}`);
        break;
      }
      case 'critical': {
        const cps = solution.criticalPaths;
        out.title = t('steps.critical');
        const total = solution.criticalCount;
        out.text = total === 1 ? t('narr.critical', { path: cps[0].acts.join(' → ') }) : t('narr.criticalMany', { n: total });
        const shown = cps.slice(0, SHOWN_PATHS);
        for (const cp of shown) out.lines.push(`${cp.acts.join(' → ')} = ${num(cp.length)} ${unit}`);
        if (total > shown.length) out.lines.push(t('results.criticalMore', { n: total - shown.length }));
        break;
      }
      case 'gantt': out.title = t('steps.gantt'); out.text = t('narr.gantt'); break;
      case 'progTable': case 'progAct': case 'progUnique': case 'progEnd': return narrateProg(step, ctx, out);
      default: return narratePert(step, ctx, out);
    }
    return out;
  }

  // Pasos de la traza PERT (F2a): construcción con las reglas de los conjuntos y cálculo sobre sucesos.
  // Necesita ctx.net (core/aoa); las duraciones de las ficticias son 0.
  function narratePert(step, ctx, out) {
    const { lang, nota, net, unit } = ctx;
    const hk = (k) => (ctx.hide ? `${k}Hidden` : k);
    const t = (k, p) => I.t(lang, k, p);
    const E = I.eventNotation(nota);
    const num = (v) => fmt(lang, v);
    const list = (xs) => I.list(lang, xs);
    const ruleKind = { ruleEqual: 1, ruleContained: 1, ruleShared: 1 };
    if (ruleKind[step.kind]) {
      out.title = t(`pertSteps.${step.kind}`);
      // Mientras se predice, el texto explica qué buscar sin decir a quién se aplica ni si se aplica (AC8).
      if (ctx.hide) { out.text = t(`pertNarr.${step.kind}Hidden`); return out; }
      out.text = step.rule.acts.length ? t(`pertNarr.${step.kind}`, { acts: list(step.rule.acts), dummies: list(step.rule.dummies) })
        : t(`pertNarr.${step.kind}None`);
      return out;
    }
    switch (step.kind) {
      case 'succTable': case 'place': case 'number': {
        out.title = t(`pertSteps.${step.kind}`);
        out.text = t(`pertNarr.${step.kind}`, { f: net ? net.dummies.length : 0 });
        if (step.kind === 'number' && net && net.trace[net.trace.length - 1] === step) out.text += ` ${t('pertNarr.numberEnd')}`;
        break;
      }
      case 'eventForward': {
        const n = step.event;
        const TE = step.reveals[0].value;
        const terms = step.formula.terms;
        const arcs = list(terms.map((x) => x.via));
        const isEnd = net && net.events.some((e) => e.n === n && e.kind === 'end');
        out.title = t('pertSteps.eventForward', { n });
        if (!terms.length) out.text = t(hk('pertNarr.eventFirst'));
        else if (isEnd) out.text = t(hk('pertNarr.eventForwardEnd'), { arcs, d: num(TE), unit });
        else if (terms.length === 1) out.text = t(hk('pertNarr.eventForwardOne'), { n, arcs });
        else out.text = t(hk('pertNarr.eventForward'), { n, arcs, chosen: list(step.formula.chosen) });
        const term = (x) => `${E.TE}(${x.from}) + d(${x.via})`;
        if (!terms.length) out.lines.push(`${E.TE}(${n}) = ${num(TE)}`);
        else if (terms.length === 1) out.lines.push(`${E.TE}(${n}) = ${term(terms[0])} = ${num(TE)}`);
        else out.lines.push(`${E.TE}(${n}) = ${lang === 'es' ? 'máx' : 'max'} { ${terms.map(term).join(', ')} } = ${lang === 'es' ? 'máx' : 'max'} { ${terms.map((x) => num(x.value)).join(', ')} } = ${num(TE)}`);
        break;
      }
      case 'eventBackward': {
        const n = step.event;
        const TL = step.reveals[0].value;
        const terms = step.formula.terms;
        const arcs = list(terms.map((x) => x.via));
        out.title = t('pertSteps.eventBackward', { n });
        if (!terms.length) out.text = t(hk('pertNarr.eventBackwardEnd'), { d: num(TL), unit });
        else if (terms.length === 1) out.text = t(hk('pertNarr.eventBackwardOne'), { n, arcs });
        else out.text = t(hk('pertNarr.eventBackward'), { n, arcs, chosen: list(step.formula.chosen) });
        const term = (x) => `${E.TL}(${x.from}) − d(${x.via})`;
        if (!terms.length) out.lines.push(`${E.TL}(${n}) = ${E.TE}(${n}) = ${num(TL)}`);
        else if (terms.length === 1) out.lines.push(`${E.TL}(${n}) = ${term(terms[0])} = ${num(TL)}`);
        else out.lines.push(`${E.TL}(${n}) = ${lang === 'es' ? 'mín' : 'min'} { ${terms.map(term).join(', ')} } = ${lang === 'es' ? 'mín' : 'min'} { ${terms.map((x) => num(x.value)).join(', ')} } = ${num(TL)}`);
        break;
      }
      case 'eventSlack':
        out.title = t('pertSteps.eventSlack');
        out.text = t('pertNarr.eventSlack');
        out.lines.push(t('pertNarr.slackFormula', { TE: E.TE, TL: E.TL }));
        break;
      case 'floats': {
        const N = I.notation(nota);
        out.title = t('pertSteps.floats');
        out.text = t('pertNarr.floats');
        for (const f of ['TF', 'FF', 'IF', 'SF']) out.lines.push(`${N[f]} = ${relabel(t('formula.' + f), nota)}`);
        break;
      }
      default: break;
    }
    return out;
  }

  // Selección compartida (F2a, AC6 y AC7): qué es en cada red la actividad o ficticia seleccionada.
  // Devuelve { title, text, precs, learn }: precs son las precedencias de ROY que representa una
  // ficticia (para resaltarlas en la red ROY) y learn, el tema de «Aprende más» de su regla.
  function selection(x, ctx) {
    const { net, lang } = ctx;
    if (!x || !net) return null;
    const t = (k, p) => I.t(lang, k, p);
    const arc = net.arcs.find((a) => a.act === x);
    if (arc) {
      const text = ctx.numbered ? t('sel.act', { act: x, from: arc.from, to: arc.to }) : t('sel.actUnnumbered', { act: x });
      return { title: x, text, precs: [], learn: null };
    }
    const d = net.dummies.find((f) => f.name === x);
    if (!d) return null;
    const rule = t(`pert.rule.${d.rule}`);
    const because = I.list(lang, d.because);
    const precs = d.represents.map((p) => p.slice());
    const learn = { equal: 'ruleEqual', contained: 'ruleContained', shared: 'ruleShared' }[d.rule] || null;
    const arrows = I.list(lang, precs.map(([a, b]) => `${a} → ${b}`));
    let text;
    if (d.rule === 'equal') text = t('sel.dummyEqual', { name: x, rule, because });
    else if (d.rule === 'uniqueness') text = t('sel.dummyUnique', { name: x, because });
    else if (d.rule === 'dependency') text = t(precs.length === 0 ? 'sel.dummyDepNone' : precs.length === 1 ? 'sel.dummyDepOne' : 'sel.dummyDep', { name: x, precs: arrows });
    else text = t(precs.length === 1 ? 'sel.dummyOne' : 'sel.dummy', { name: x, rule, because, precs: arrows });
    // F2b (AC6): en el comparador, una ficticia que se puede quitar explica por qué sobra.
    const rm = (ctx.removable || []).find((r) => r.name === x);
    if (rm) text += ' ' + t(rm.how === 'merge' ? 'sel.removableMerge' : 'sel.removableDelete', { name: x });
    return { title: x, text, precs, learn, removable: rm ? rm.how : null };
  }

  // ---------- F2b: dibujo progresivo paso a paso (T018–T019, AC8) ----------

  // ctx.net es la red final del progresivo (core/aoamethods, con su traza); ctx.project, la tabla. Cada paso dice
  // de qué suceso sale la actividad y, por grupos de precedentes, si terminan allí o llevan ficticia y por qué.
  function narrateProg(step, ctx, out) {
    const { lang, net, project } = ctx;
    const t = (k, p) => I.t(lang, k, p);
    const list = (xs) => I.list(lang, xs);
    const tr = net.trace;
    out.title = t(`progSteps.${step.kind}`, { act: step.act });
    if (step.kind === 'progTable') { out.text = t('progNarr.table', { order: list(tr.filter((s) => s.kind === 'progAct').map((s) => s.act)) }); return out; }
    if (step.kind === 'progEnd') {
      const f = net.dummies.length;
      out.text = t('progNarr.end', { fs: t(f === 0 ? 'view.dummiesNone' : f === 1 ? 'view.dummiesOne' : 'view.dummiesN', { n: f }), e: net.events.length });
      return out;
    }
    if (step.kind === 'progUnique') {
      const ds = net.dummies.filter((d) => step.prog.dummies.includes(d.name));
      if (!ds.length) out.text = t('progNarr.uniqNone');
      else if (ds.length === 1) out.text = t('progNarr.uniqOne', { a: ds[0].because[0], b: ds[0].because[1], d: ds[0].name });
      else out.text = t('progNarr.uniqN', { pairs: list(ds.map((d) => list(d.because))), ds: list(ds.map((d) => d.name)) });
      return out;
    }
    const x = step.act;
    const preds = step.prog.preds.map((q) => q.act);
    if (ctx.hide) {
      out.text = preds.length === 0 ? t('progNarr.hiddenNone', { act: x }) : preds.length === 1 ? t('progNarr.hiddenOne', { act: x, p: preds[0] }) : t('progNarr.hiddenN', { act: x, preds: list(preds) });
      return out;
    }
    const arc = (a) => net.arcs.find((e) => e.act === a);
    const k = tr.indexOf(step);
    const drawn = tr.slice(0, k).filter((s) => s.kind === 'progAct').map((s) => s.act);
    const leaving = (ev) => drawn.filter((a) => arc(a).from === ev);
    const st = step.prog.start;
    if (st === 'initial') { out.text = t('progNarr.initial', { act: x }); return out; }
    if (st === 'pred') { out.text = t('progNarr.pred', { act: x, p: preds[0] }); return out; }
    if (st === 'existing') { out.text = t('progNarr.existing', { act: x, preds: list(preds), other: list(leaving(arc(x).from)) }); return out; }
    out.text = t('progNarr.new', { act: x, preds: list(preds) });
    const others = (q) => list(preds.filter((r) => r !== q));
    const dummyFrom = (ev) => (net.dummies.find((d) => d.from === ev && d.to === arc(x).from) || { name: '?' }).name;
    const direct = step.prog.preds.filter((q) => q.how === 'direct').map((q) => q.act);
    // Si x es la única posterior de todas ellas, se dice así (no hay «lo que va después» que comprobar).
    const only = direct.every((q) => (project.succs[q] || []).every((y) => y === x));
    const dk = `progNarr.direct${only ? 'Only' : ''}${direct.length === 1 ? 'One' : 'N'}`;
    if (direct.length) out.lines.push(t(dk, { p: direct[0], ps: list(direct), others: others(direct[0]), act: x }));
    // Las que no están libres se agrupan por el suceso en que terminan (una sola ficticia por suceso).
    const groups = new Map();
    for (const q of step.prog.preds.filter((z) => z.how === 'dummy' && z.why === 'notFree')) {
      const ev = arc(q.act).to;
      if (!groups.has(ev)) groups.set(ev, []);
      groups.get(ev).push(q.act);
    }
    for (const [ev, ps] of groups) {
      const users = leaving(ev).filter((a) => a !== x);
      out.lines.push(t(ps.length === 1 ? 'progNarr.notFreeOne' : 'progNarr.notFreeN', { p: ps[0], ps: list(ps), users: list(users), d: dummyFrom(ev) }));
    }
    const anc = ancestors(project);
    for (const q of step.prog.preds.filter((z) => z.how === 'dummy' && z.why === 'otherSuccs')) {
      const rest = preds.filter((r) => r !== q.act);
      const ys = (project.succs[q.act] || []).filter((y) => y !== x && rest.some((r) => !anc.get(y).has(r)));
      out.lines.push(t('progNarr.otherSuccs', { p: q.act, ys: list(ys), others: others(q.act), act: x, d: dummyFrom(arc(q.act).to) }));
    }
    return out;
  }

  // Precedentes (transitivas) de cada actividad.
  function ancestors(project) {
    const preds = new Map(project.activities.map((a) => [a.id, []]));
    for (const a of project.activities) for (const y of project.succs[a.id] || []) if (preds.has(y)) preds.get(y).push(a.id);
    const memo = new Map();
    const go = (y) => {
      if (memo.has(y)) return memo.get(y);
      const s = new Set();
      memo.set(y, s);
      for (const p of preds.get(y)) { s.add(p); for (const z of go(p)) s.add(z); }
      return s;
    };
    for (const a of project.activities) go(a.id);
    return memo;
  }

  // ---------- F2b: comparador de métodos (T016–T017) ----------

  // Mensaje de cada problema de core/aoacheck.diagnose, con las actividades o sucesos implicados.
  function diagnosis(problems, ctx) {
    const { lang } = ctx;
    const t = (k, p) => I.t(lang, k, p);
    return (problems || []).map((x) => {
      const ids = x.ids || [];
      const ev = x.events || [];
      const p = { a: ids[0], b: ids[1], events: I.list(lang, ev), from: ev[0], to: ev[1] };
      switch (x.code) {
        // Las ficticias llevan siempre events (aunque vacío); las actividades, no.
        case 'incompleteArc': return !x.events ? t('diag.incompleteArc', p) : t(ids.length ? 'diag.incompleteDummyNamed' : 'diag.incompleteDummy', p);
        case 'unnumbered': return t(ev.length === 1 ? 'diag.unnumberedOne' : 'diag.unnumbered', p);
        case 'order': return !x.events ? t('diag.order', p) : t('diag.orderDummy', p);
        case 'unnecessaryDummy': return t(x.how === 'merge' ? 'diag.unnecessaryDummyMerge' : 'diag.unnecessaryDummy', p);
        default: return t(`diag.${x.code}`, p);
      }
    });
  }

  // Textos de una tarjeta del comparador. card: de core/compare; min: el mínimo combinado (null mientras se calcula).
  function cmpCard(c, min, ctx) {
    const { lang } = ctx;
    const t = (k, p) => I.t(lang, k, p);
    const out = { name: t(`cmp.names.${c.method}`), kind: t(`cmp.kinds.${c.method}`), count: '…', unit: t('cmp.unitPending'),
      status: [], notes: [], links: { learn: t('learn.button'), step: c.method === 'prog' ? t('cmp.stepByStep') : null } };
    if (c.pending || c.dummies == null) {
      out.status.push({ text: t('cmp.pending'), tone: 'mute' });
      return out;
    }
    out.count = String(c.dummies);
    out.unit = t(c.dummies === 1 ? 'cmp.unitOne' : 'cmp.unitN', { e: c.events });
    if (!c.ok) {
      out.status.push({ text: t('cmp.incorrect'), tone: 'bad' });
      for (const s of diagnosis(c.problems, ctx)) out.notes.push({ text: s, tone: 'bad' });
      return out;
    }
    out.status.push({ text: t('cmp.correct'), tone: 'ok' });
    if (min && min.value != null) {
      const k = c.dummies - min.value;
      if (k <= 0) out.status.push({ text: t(min.exact ? 'cmp.atMin' : 'cmp.atBest'), tone: 'ok' });
      else out.status.push({ text: t(min.exact ? 'cmp.above' : 'cmp.aboveBest', { k }), tone: 'warn' });
    }
    if (c.removable && c.removable.length) out.notes.push({ text: t(c.removable.length === 1 ? 'cmp.removableOne' : 'cmp.removableN', { names: I.list(lang, c.removable) }), tone: 'bad' });
    if (c.structural) out.notes.push({ text: t('cmp.structural'), tone: 'warn' });
    if (c.model) out.notes.push({ text: t('cmp.model', { d: c.model.dummies, e: c.model.events }), tone: 'mute' });
    if (c.approx) out.notes.push({ text: t('cmp.approx'), tone: 'mute' });
    return out;
  }

  // Resumen del mínimo: exacto, intervalo (y qué método da la mejor red) o calculando.
  function cmpMin(min, ctx) {
    const { lang } = ctx;
    const t = (k, p) => I.t(lang, k, p);
    if (!min || min.value == null) return t('cmp.minPending');
    if (min.exact) return min.value === 0 ? t('cmp.minNone') : min.value === 1 ? t('cmp.minExactOne') : t('cmp.minExact', { v: min.value });
    const p = { l: min.lower, v: min.value };
    return min.source && min.source !== 'search' ? t('cmp.minRangeFrom', Object.assign(p, { src: t(`cmp.names.${min.source}`) })) : t('cmp.minRange', p);
  }

  // Camino más corto de a a b por las precedencias directas (para nombrar una precedencia implícita).
  function chain(succs, a, b) {
    const prev = new Map([[a, null]]);
    const queue = [a];
    while (queue.length) {
      const x = queue.shift();
      if (x === b) break;
      for (const y of succs[x] || []) if (!prev.has(y)) { prev.set(y, x); queue.push(y); }
    }
    if (!prev.has(b)) return [a, b];
    const out = [];
    for (let x = b; x != null; x = prev.get(x)) out.unshift(x);
    return out;
  }

  // Contador de ficticias (F2a, AC9 y AC16). info = { rules, value, lower, exact, net } de core/mindummy más las
  // ficticias de las reglas; sin value, el mínimo aún se está calculando. ctx = { lang, succs, hidden }: succs son las
  // posteriores directas; hidden, que se están prediciendo las reglas. Devuelve los textos del contador y, si las
  // reglas quedan por encima, los de la tarjeta, la explicación y las ficticias que aprovechan precedencias implícitas.
  function dummyCount(info, ctx) {
    const { lang } = ctx;
    const t = (k, p) => I.t(lang, k, p);
    const out = { label: t('count.label'), rules: t('count.unknown'), min: t('count.unknown'), note: '', extra: 0,
      title: null, text: null, show: null, netTitle: null, explain: null, emph: [] };
    if (ctx.hidden || !info) { out.note = t('count.hidden'); return out; }
    out.rules = String(info.rules);
    if (info.value == null) { out.min = t('count.pending'); return out; }
    out.min = info.exact ? String(info.value) : t('count.between', { l: info.lower, v: info.value });
    if (!info.exact) out.note = t('count.noteRange');
    else if (info.rules === 0) out.note = t('count.noteNone');
    else if (info.value === info.rules) out.note = t('count.noteSame');
    else {
      const k = info.value - 1;
      out.note = t(k === 0 ? 'count.noteExactZero' : k === 1 ? 'count.noteExactOne' : 'count.noteExact', { k });
    }
    const n = info.rules - info.value;
    if (n <= 0) return out;
    out.extra = n;
    const best = !info.exact;
    out.title = t(`count.${best ? 'less' : 'extra'}${n === 1 ? 'One' : 'N'}`, { n });
    out.text = t(best ? 'count.textBest' : 'count.text');
    out.show = t(best ? 'count.showBest' : 'count.show');
    out.netTitle = t(best ? 'count.bestNet' : 'count.minNet');
    const ds = info.net.dummies.filter((d) => d.implied && d.implied.length);
    const pairs = [];
    for (const d of ds) for (const [a, b] of d.implied) if (!pairs.some((p) => p[0] === a && p[1] === b)) pairs.push([a, b]);
    out.emph = ds.map((d) => d.name);
    if (!pairs.length) {
      out.explain = t('count.other', { n: t(n === 1 ? 'view.dummiesOne' : 'view.dummiesN', { n }) });
      return out;
    }
    const named = pairs.map(([a, b]) => `${a} → ${b} (${chain(ctx.succs, a, b).join(' → ')})`);
    out.explain = t(pairs.length === 1 ? 'count.implicitOne' : 'count.implicitN',
      { pairs: I.list(lang, named), dummies: I.list(lang, out.emph), a: pairs[0][0], b: pairs[0][1] });
    return out;
  }

  const api = { narrate, relabel, nodeName, fmt, selection, dummyCount, diagnosis, cmpCard, cmpMin, SHOWN_PATHS };
  root.PNL = root.PNL || {};
  root.PNL.narrate = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
