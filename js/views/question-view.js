/*
 * views/question-view — vista previa de una pregunta del banco de Moodle (spec f3b-moodle; plan P1; tableros 51–55).
 * Dibuja el modelo de core/moodle (bloques de texto, tablas con datos y huecos, opciones y retroalimentación) con
 * dom.h, sin innerHTML (constitución, 22): es la misma pregunta que escribe toXml, sin el estilo de Moodle. Los huecos
 * son campos desactivados (numéricos) o desplegables desactivados (Sí/No); las opciones de la 4b, casillas
 * desactivadas; la retroalimentación general va plegada en un <details>.
 * F3c (etapa stmt; tablero 62): la cita del enunciado va en un <blockquote> y cada celda de predecesoras inmediatas,
 * como una fila de casillas desactivadas (las demás actividades y «ninguna»), igual que MULTIRESPONSE_H en Moodle.
 * F3d (T013; tableros 90 y 91): la imagen de «Detective» es el mismo archivo SVG que va en el XML, como
 * data:image/svg+xml;base64 y con su texto alternativo; el enlace suelto del enunciado de la etapa 7 va en su párrafo,
 * y las opciones de una sola respuesta (single), como botones de radio desactivados.
 * F3e (T016; tableros 100–102): los huecos con varias respuestas (nums) como campos, los de opción múltiple del cloze (mc)
 * como desplegables desactivados, las casillas en vertical de las series (mr con vertical), los títulos de las partes de
 * una serie ({ h }; <h4> en el XML y <h3> aquí, bajo el <h2> de la vista previa; con id `${o.partId}-k` para «Ir a la
 * parte») y lo plegado ({ fold }, <details>). Con o.accepted,
 * debajo, «Respuestas que acepta Moodle (salen del núcleo)»: accepted(q, tr, lang) da cada hueco con su etiqueta (la fila
 * y la columna de una tabla, o el texto de su párrafo) y lo que acepta, con las tolerancias; es la parte sin DOM.
 */
(function (root) {
  'use strict';

  // ---------- «Respuestas que acepta Moodle» (sin DOM) ----------

  const isNode = typeof module !== 'undefined' && module.exports;
  const M = () => (isNode ? require('../core/moodle.js') : root.PNL.moodle);
  /** Un número como en el banco (sin ceros de más), con la coma en español. */
  const numText = (lang, v) => { const x = M()._.clozeNum(v); return lang === 'es' ? x.replace('.', ',') : x; };
  const isHole = (c) => c && typeof c === 'object' && ('num' in c || 'nums' in c || 'mc' in c || 'mr' in c || 'yesNo' in c);
  function holeValue(c, tr, lang) {
    const n = (v) => numText(lang, v);
    const tol = (v, d) => (d ? `${n(v)} ± ${n(d)}` : n(v));
    if ('num' in c) return tol(c.num, c.tol);
    if ('nums' in c) return c.nums.map((a) => tol(a.v, a.tol)).join(' · ');
    if ('mc' in c) return c.mc.filter((o) => o.ok).map((o) => o.label).join(' · ');
    if ('mr' in c) return c.mr.filter((o) => Number(o.fraction) > 0).map((o) => o.label).join(', ');
    return tr(c.yesNo ? 'yes' : 'no');
  }
  /** Cada hueco de la pregunta, en el orden del texto: { label, value }; los títulos de las partes, { head }; las
   *  opciones correctas de una pregunta de opción múltiple, { label: null, value }. */
  function accepted(q, tr, lang) {
    const out = [];
    const walk = (bs) => {
      for (const b of bs) {
        if (b.table) {
          for (const r of b.table.rows) r.forEach((c, i) => { if (isHole(c)) out.push({ label: `${r[0]} · ${b.table.head[i]}`, value: holeValue(c, tr, lang) }); });
        } else if (b.fold) walk(b.fold.blocks);
        else if (b.h) out.push({ head: b.h });
        else if (b.hole && isHole(b.hole)) out.push({ label: String(b.p).trim().replace(/:$/, ''), value: holeValue(b.hole, tr, lang) });
      }
    };
    walk(q.text || []);
    if (q.options) out.push({ label: null, value: q.options.filter((o) => Number(o.fraction) > 0).map((o) => (o.text != null ? o.text : o.path)).join(' · ') });
    return out;
  }

  function render(container, q, tr, o) {
    const { h, clear } = root.PNL.dom;
    const opts = o || {};
    const hole = opts.holeLabel || '';
    const cell = (c) => {
      if (c && typeof c === 'object' && ('num' in c || 'nums' in c)) return h('input', { class: 'mq-hole', disabled: true, size: 3, 'aria-label': hole });
      if (c && typeof c === 'object' && 'mr' in c) {
        return h('span', { class: c.vertical ? 'mq-mr mq-mr-v' : 'mq-mr' }, c.mr.map((op) => h('label', {}, [h('input', { type: 'checkbox', disabled: true }), op.label])));
      }
      if (c && typeof c === 'object' && 'mc' in c) {
        return h('select', { class: 'mq-hole', disabled: true, 'aria-label': hole }, [h('option', { value: '' }, ['']), ...c.mc.map((op) => h('option', {}, [op.label]))]);
      }
      if (c && typeof c === 'object' && 'yesNo' in c) {
        return h('select', { class: 'mq-hole', disabled: true, 'aria-label': hole }, [h('option', { value: '' }, ['']), h('option', {}, [tr('yes')]), h('option', {}, [tr('no')])]);
      }
      return String(c);
    };
    const table = (b) => h('table', { class: 'mq-table' }, [
      h('thead', {}, [h('tr', {}, b.table.head.map((x) => h('th', { scope: 'col' }, [x])))]),
      h('tbody', {}, b.table.rows.map((r) => h('tr', {}, r.map((c, i) => h(i === 0 ? 'th' : 'td', i === 0 ? { scope: 'row' } : {}, [cell(c)]))))),
    ]);
    let part = 0;
    const blocks = (bs) => {
      const out = []; let tables = [];
      const flush = () => { if (tables.length) { out.push(h('div', { class: 'mq-tables', tabindex: '0' }, tables)); tables = []; } };
      for (const b of bs) {
        if (b.table) { tables.push(table(b)); continue; }
        flush();
        if (b.links) {
          const a = (href, key) => h('a', { href, target: '_blank', rel: 'noopener' }, [tr(key)]);
          const step = a(b.links.step, b.links.stepKey || 'link.step');
          out.push(h('p', {}, b.links.ex ? [a(b.links.ex, b.links.exKey || 'link.ex'), ' · ', step] : [step]));
        } else if (b.img) {
          const f = (q.files || []).find((x) => x.name === b.img.src);
          if (f) out.push(h('p', { class: 'mq-img' }, [h('img', { src: `data:image/svg+xml;base64,${root.PNL.moodle.base64(f.svg)}`, alt: b.img.alt })]));
        } else if (b.link) out.push(h('p', {}, [h('a', { href: b.link.href, target: '_blank', rel: 'noopener' }, [tr(b.link.key)])]));
        else if (b.quote) out.push(h('blockquote', { class: 'mq-quote' }, b.quote.map((x) => h('p', {}, [x]))));
        else if (b.fold) out.push(h('details', { class: 'mq-fold' }, [h('summary', {}, [b.fold.summary]), ...blocks(b.fold.blocks)]));
        else if (b.h) out.push(h('h3', { class: 'mq-part', id: opts.partId ? `${opts.partId}-${part++}` : null, tabindex: opts.partId ? '-1' : null }, [b.h]));
        else if (b.strong) out.push(h('p', {}, [h('strong', {}, [b.strong])]));
        else out.push(h('p', {}, b.hole ? [b.p, ' ', cell(b.hole)] : [b.p]));
      }
      flush();
      return out;
    };
    const options = q.options ? [h('ul', { class: 'mq-options' }, q.options.map((op) => h('li', {}, [
      h('label', {}, [h('input', q.single ? { type: 'radio', name: 'mqPreviewOption', disabled: true } : { type: 'checkbox', disabled: true }), ' ', op.text != null ? op.text : op.path]),
    ])))] : [];
    const feedback = h('details', { class: 'mq-feedback', open: opts.open ? true : null }, [
      h('summary', {}, [opts.feedbackLabel || '']),
      ...blocks(q.general),
    ]);
    // F3e (T016): lo que acepta Moodle, debajo (plegado en las series, que tienen cientos de huecos).
    const acc = opts.accepted ? [h('details', { class: 'mq-accepted', open: opts.accepted.open ? true : null }, [
      h('summary', {}, [opts.accepted.label]),
      h('ul', {}, accepted(q, tr, opts.lang).map((x) => (x.head ? h('li', { class: 'mq-acc-h' }, [x.head])
        : h('li', {}, [`${x.label == null ? opts.accepted.option : x.label}: ${x.value}`])))),
    ])] : [];
    clear(container);
    container.appendChild(h('p', { class: 'mq-qname' }, [q.name]));
    for (const el of [...blocks(q.text), ...options, feedback, ...acc]) container.appendChild(el);
  }

  const api = { render, accepted };
  root.PNL = root.PNL || {};
  root.PNL.questionView = api;
  if (isNode) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
