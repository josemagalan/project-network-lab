/*
 * views/question-view — vista previa de una pregunta del banco de Moodle (spec f3b-moodle; plan P1; tableros 51–55).
 * Dibuja el modelo de core/moodle (bloques de texto, tablas con datos y huecos, opciones y retroalimentación) con
 * dom.h, sin innerHTML (constitución, 22): es la misma pregunta que escribe toXml, sin el estilo de Moodle. Los huecos
 * son campos desactivados (numéricos) o desplegables desactivados (Sí/No); las opciones de la 4b, casillas
 * desactivadas; la retroalimentación general va plegada en un <details>.
 */
(function (root) {
  'use strict';

  function render(container, q, tr, o) {
    const { h, clear } = root.PNL.dom;
    const opts = o || {};
    const hole = opts.holeLabel || '';
    const cell = (c) => {
      if (c && typeof c === 'object' && 'num' in c) return h('input', { class: 'mq-hole', disabled: true, size: 3, 'aria-label': hole });
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
          out.push(h('p', {}, b.links.ex ? [a(b.links.ex, 'link.ex'), ' · ', a(b.links.step, 'link.step')] : [a(b.links.step, 'link.step')]));
        } else if (b.strong) out.push(h('p', {}, [h('strong', {}, [b.strong])]));
        else out.push(h('p', {}, b.hole ? [b.p, ' ', cell(b.hole)] : [b.p]));
      }
      flush();
      return out;
    };
    const options = q.options ? [h('ul', { class: 'mq-options' }, q.options.map((op) => h('li', {}, [
      h('label', {}, [h('input', { type: 'checkbox', disabled: true }), ' ', op.path]),
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
