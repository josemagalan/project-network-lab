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
    let text;
    if (d.rule === 'equal') text = t('sel.dummyEqual', { name: x, rule, because });
    else text = t(precs.length === 1 ? 'sel.dummyOne' : 'sel.dummy', { name: x, rule, because, precs: I.list(lang, precs.map(([a, b]) => `${a} → ${b}`)) });
    return { title: x, text, precs, learn };
  }

  const api = { narrate, relabel, nodeName, fmt, selection, SHOWN_PATHS };
  root.PNL = root.PNL || {};
  root.PNL.narrate = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
