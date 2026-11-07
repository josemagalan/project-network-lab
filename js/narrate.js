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
      default: break;
    }
    return out;
  }

  const api = { narrate, relabel, nodeName, fmt, SHOWN_PATHS };
  root.PNL = root.PNL || {};
  root.PNL.narrate = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
