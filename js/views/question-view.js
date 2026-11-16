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
 */
(function (root) {
  'use strict';

  function render(container, q, tr, o) {
    const { h, clear } = root.PNL.dom;
    const opts = o || {};
    const hole = opts.holeLabel || '';
    const cell = (c) => {
      if (c && typeof c === 'object' && 'num' in c) return h('input', { class: 'mq-hole', disabled: true, size: 3, 'aria-label': hole });
      if (c && typeof c === 'object' && 'mr' in c) {
        return h('span', { class: 'mq-mr' }, c.mr.map((op) => h('label', {}, [h('input', { type: 'checkbox', disabled: true }), op.label])));
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
    clear(container);
    container.appendChild(h('p', { class: 'mq-qname' }, [q.name]));
    for (const el of [...blocks(q.text), ...options, feedback]) container.appendChild(el);
  }

  const api = { render };
  root.PNL = root.PNL || {};
  root.PNL.questionView = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
