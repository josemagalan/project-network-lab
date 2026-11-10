/*
 * views/statement-view — el texto del enunciado de M0 con los subrayados del alumno (spec f2c-enunciado-tabla, AC1,
 * AC2 y AC18; tableros 27 y 31). Todo el texto entra con textContent (constitución, 22).
 * En lectura, el texto es un párrafo normal: cada subrayado se distingue por el estilo de su raya (continua,
 * doble, discontinua o de puntos) y por su etiqueta («A», «= 7», «A→D», «no da precedencia»), no solo por el
 * color. En modo «Subrayar», cada palabra es un botón con foco itinerante (← →, Mayús + ← →, Intro, Esc) y se
 * subraya sin arrastrar: primera palabra y última. La selección y las teclas las decide el controlador (js/m0);
 * aquí solo se pinta y se avisa de cada pulsación. Las teclas del reproductor no actúan dentro (data-own-keys).
 * ctx = { st, marks, label(mark) → { badge }, underline, sel: { from, to } | null, focus, hl: { from, to } | null,
 *         region, hintId, onWord(i, event), onKey(i, event), focusNow }
 */
(function (root) {
  'use strict';

  function render(container, ctx) {
    const { h, clear } = root.PNL.dom;
    clear(container);
    const { st, marks } = ctx;
    const owner = new Array(st.words.length).fill(-1);
    (marks || []).forEach((m, k) => { for (let i = Math.max(0, m.from); i <= m.to && i < owner.length; i++) owner[i] = k; });
    const inSel = (i) => !!ctx.sel && i >= ctx.sel.from && i <= ctx.sel.to;
    const inHl = (i) => !!ctx.hl && i >= ctx.hl.from && i <= ctx.hl.to;
    const box = ctx.underline
      ? h('div', { class: 'st-text ul', role: 'group', 'aria-label': ctx.region, 'aria-describedby': ctx.hintId || null, 'data-own-keys': '' })
      : h('div', { class: 'st-text' });
    box.appendChild(root.document.createTextNode(st.lead));
    const focus = Number.isInteger(ctx.focus) && ctx.focus >= 0 && ctx.focus < st.words.length ? ctx.focus : 0;
    let span = null;   // subrayado o resaltado abierto (en lectura, una sola raya continua sobre varias palabras)
    st.words.forEach((w, i) => {
      const k = owner[i];
      const m = k >= 0 ? marks[k] : null;
      if (ctx.underline) {
        const cls = ['w', m ? `mk mk-${m.kind}` : null, inSel(i) ? 'sel' : null, inHl(i) ? 'hl' : null].filter(Boolean).join(' ');
        box.appendChild(h('button', { type: 'button', class: cls, 'data-i': String(i), tabindex: i === focus ? '0' : '-1',
          'aria-pressed': inSel(i) ? 'true' : 'false', onclick: (e) => ctx.onWord(i, e), onkeydown: (e) => ctx.onKey(i, e) }, [w.t]));
        if (m && i === m.to) box.appendChild(h('span', { class: `badge b-${m.kind}` }, [ctx.label(m).badge]));
        box.appendChild(root.document.createTextNode(w.sep));
        return;
      }
      const key = `${k}|${inHl(i)}`;
      if (!span || span.key !== key) {
        span = null;
        if (m || inHl(i)) {
          const el = h('span', { class: [m ? `mk mk-${m.kind}` : null, inHl(i) ? 'hl' : null].filter(Boolean).join(' ') });
          box.appendChild(el);
          span = { el, key };
        }
      }
      (span ? span.el : box).appendChild(root.document.createTextNode(w.t));
      const ends = m && i === m.to;
      const next = i + 1 < st.words.length ? `${owner[i + 1]}|${inHl(i + 1)}` : null;
      if (span && !ends && next === key && !/\n/.test(w.sep)) { span.el.appendChild(root.document.createTextNode(w.sep)); return; }
      span = null;
      if (ends) box.appendChild(h('span', { class: `badge b-${m.kind}` }, [ctx.label(m).badge]));
      box.appendChild(root.document.createTextNode(w.sep));
    });
    container.appendChild(box);
    if (ctx.underline && ctx.focusNow) {
      const el = box.querySelector(`[data-i="${focus}"]`);
      if (el) el.focus();
    }
  }

  const api = { render };
  root.PNL = root.PNL || {};
  root.PNL.statementView = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
