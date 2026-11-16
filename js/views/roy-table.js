/*
 * roy-table — «Tu red como tabla» (F3d, T008; tableros 81 y 89): las predecesoras de cada nodo en el dibujo del alumno,
 * una fila por actividad de la tabla y otra para Fin. Es otra vista de la misma red que el lienzo (views/roy-canvas):
 * lo que se cambia en uno se ve al momento en el otro, y en el móvil deja hacer la red entera sin dibujar.
 * Escribir los nombres de las predecesoras (separados por comas; Inicio en los dos idiomas) sustituye los arcos que
 * llegan a ese nodo; una actividad nombrada que no está en el lienzo se coloca en un hueco libre. No calcula: interpreta
 * con exBuild.parsePreds y aplica con onOp. Todo texto con textContent.
 *   render(container, ctx): ctx = { project, net, lang, locked, msg ({ key, params, id }), onOp(op, id) → bool, onBad(msg) }.
 */
(function (root) {
  'use strict';

  const G = root.PNL;

  function render(container, ctx) {
    const { h, clear } = G.dom;
    const XB = G.exBuild;
    const { project, net, lang } = ctx;
    const t = (k, p) => G.i18n.t(lang, k, p);
    const E = G.roycheck.END;
    clear(container);
    const placed = new Set(net.nodes.map((n) => n.id));
    const rows = project.activities.map((a) => a.id).concat([E]);
    const half = Math.ceil(rows.length / 2);
    const msgEl = h('p', { class: 'xb-msg small', id: 'xbTableMsg', role: 'status' });
    const cellId = (id) => `xbPred-${id}`;
    const show = (m) => { msgEl.textContent = m ? t(m.key, m.params) : ''; };
    const input = (id) => {
      const value = XB.predsText(net, id, lang);
      const off = !placed.has(id);
      const el = h('input', { type: 'text', id: cellId(id), class: 'xb-pred', autocomplete: 'off', spellcheck: 'false', value, maxlength: '120',
        readonly: ctx.locked ? 'readonly' : null, 'aria-label': t(off ? 'xb.predsOfOff' : 'xb.predsOf', { x: XB.nameOf(id, lang) }),
        'aria-invalid': ctx.msg && ctx.msg.id === cellId(id) ? 'true' : null, 'aria-describedby': ctx.msg && ctx.msg.id === cellId(id) ? 'xbTableMsg' : null });
      el.defaultValue = value;
      if (ctx.msg && ctx.msg.id === cellId(id)) el.value = ctx.msg.text;
      if (!ctx.locked) {
        el.addEventListener('change', () => {
          const r = XB.parsePreds(el.value, id, project, lang);
          if (!r.ok) {
            const key = `xb.bad.${r.code}`;
            const m = { key, params: { v: r.v, x: XB.nameOf(id, lang) }, id: cellId(id), text: el.value };
            el.setAttribute('aria-invalid', 'true');
            el.setAttribute('aria-describedby', 'xbTableMsg');
            show(m);
            ctx.onBad(m);
            return;
          }
          // Se aplica después del cambio de foco: con el tabulador, el foco no se pierde al repintar.
          setTimeout(() => {
            const go = root.document.activeElement && root.document.activeElement.id;
            if (!ctx.onOp({ type: 'setPreds', id, preds: r.preds }, go || cellId(id))) { el.value = el.defaultValue; el.removeAttribute('aria-invalid'); show(null); }
          }, 0);
        });
      }
      return el;
    };
    const table = (list) => h('table', { class: 'data xb-ptable' }, [
      h('thead', {}, [h('tr', {}, [h('th', { scope: 'col' }, [t('xb.node')]), h('th', { scope: 'col' }, [t('xb.preds')])])]),
      h('tbody', {}, list.map((id) => h('tr', { class: placed.has(id) ? '' : 'off' }, [
        h('th', { scope: 'row', class: id === E ? 'term' : '' }, [XB.nameOf(id, lang)]), h('td', {}, [input(id)])]))),
    ]);
    container.appendChild(h('div', { class: 'xb-halves' }, [table(rows.slice(0, half)), table(rows.slice(half))]));
    container.appendChild(msgEl);
    show(ctx.msg);
  }

  const api = { render };
  root.PNL = root.PNL || {};
  root.PNL.royTable = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
