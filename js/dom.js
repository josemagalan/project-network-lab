/*
 * dom — creación de elementos sin innerHTML (constitución, principio 22): todo texto entra con
 * textContent. h('p', {class: 'x', onclick: fn}, ['texto', h('b', {}, ['más'])]).
 */
(function (root) {
  'use strict';

  function h(tag, attrs, children) {
    const el = root.document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k === 'value') el.value = v;
      else if (k === 'checked' || k === 'disabled' || k === 'selected') el[k] = !!v;
      else el.setAttribute(k, v === true ? '' : String(v));
    }
    for (const c of children || []) {
      if (c == null || c === false) continue;
      el.appendChild(typeof c === 'string' || typeof c === 'number' ? root.document.createTextNode(String(c)) : c);
    }
    return el;
  }

  function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); return el; }

  // F5d (T005, P8, P10): el botón «Exportar». El menú es del grupo fx (PNL.figLoad). Otra llamada con el mismo
  // contenedor le da la figura nueva sin cerrar el menú. Solo con ?fx=1 hasta la publicación.
  const SVGNS = 'http://www.w3.org/2000/svg';
  const fxOn = () => { try { return new URLSearchParams(root.location.search).get('fx') === '1'; } catch { return false; } };
  function figButton(holder, spec) {
    if (!holder) return null;
    let d = holder.querySelector(':scope > details.fx');
    if (!fxOn() || !root.PNL.figLoad) { if (d) d.remove(); return null; }
    const label = root.PNL.i18n.t(spec.lang, 'ctl.export');
    if (d) {
      d.querySelector('summary > span').textContent = label;
      d.fxSpec = spec;
      if (root.PNL.figExport && d.querySelector('.fx-panel')) root.PNL.figExport.update(d, spec);
      return d;
    }
    const icon = root.document.createElementNS(SVGNS, 'svg');
    for (const [k, v] of [['viewBox', '0 0 24 24'], ['width', '15'], ['height', '15'], ['aria-hidden', 'true'], ['focusable', 'false']]) icon.setAttribute(k, v);
    const path = root.document.createElementNS(SVGNS, 'path');
    for (const [k, v] of [['d', 'M12 3v12m0 0-5-5m5 5 5-5M4 20h16'], ['fill', 'none'], ['stroke', 'currentColor'], ['stroke-width', '2'], ['stroke-linecap', 'round'], ['stroke-linejoin', 'round']]) path.setAttribute(k, v);
    icon.appendChild(path);
    d = h('details', { class: 'fx' }, [h('summary', {}, [icon, h('span', { text: label }), h('span', { class: 'chev', 'aria-hidden': 'true', text: '▾' })])]);
    d.fxSpec = spec;
    d.addEventListener('toggle', () => {
      if (!d.open || d.querySelector('.fx-panel')) return;
      root.PNL.figLoad().then(() => { if (d.open && !d.querySelector('.fx-panel')) root.PNL.figExport.mount(d, d.fxSpec); }, () => { d.open = false; });
    });
    holder.appendChild(d);
    return d;
  }

  const api = { h, clear, figButton };
  root.PNL = root.PNL || {};
  root.PNL.figButton = figButton;
  root.PNL = root.PNL || {};
  root.PNL.dom = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
