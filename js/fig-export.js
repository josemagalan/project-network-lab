/*
 * fig-export — exportar una figura de pantalla (spec f5d-exportar-figuras, AC2 y AC3; plan §0, §3, P6–P8; T003).
 *   treeOf(svg) → el árbol que views/fig-tikz convierte (con los estilos calculados que importan: si se ve, el anclaje, el
 *     tamaño y el peso de la letra, los trazos a trazos y si se pinta el relleno o el trazo; los colores no cuentan).
 *   svgFile(svg, { title }) → la figura como archivo SVG, del tamaño de su dibujo, con los estilos escritos en cada
 *     elemento y los colores del tema claro aunque la página esté en oscuro (themeMap), un fondo blanco y su título.
 *   png(svg, k) → Promise<Blob>: ese SVG pintado k veces más grande, sobre blanco.
 *   download(nombre, datos, tipo) y copy(texto) → Promise<boolean> (false si el navegador no deja usar el portapapeles).
 *   themeMap(css) → Map(color oscuro → color claro) de los tokens de css/styles.css; fileName(figura, proyecto, estado, ext).
 * Los textos visibles no viven aquí (el menú es de T005). Nunca innerHTML: el SVG se serializa con XMLSerializer.
 */
(function (root) {
  'use strict';

  // ---------- Sin DOM ----------
  const hex = (h) => {
    let s = h.replace('#', '');
    if (s.length === 3) s = s.split('').map((c) => c + c).join('');
    if (!/^[0-9a-fA-F]{6}$/.test(s)) return null;
    return `rgb(${parseInt(s.slice(0, 2), 16)}, ${parseInt(s.slice(2, 4), 16)}, ${parseInt(s.slice(4, 6), 16)})`;
  };
  const declsOf = (block) => {
    const out = {};
    for (const m of String(block).matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) out[m[1]] = m[2].trim();
    return out;
  };
  /** Color oscuro → color claro de los tokens: los bloques «:root { … }» (claros) frente a los «:root…» de
   *  «@media (prefers-color-scheme: dark)» (styles.css tiene más de uno de cada, p. ej. --select al final). */
  function themeMap(css) {
    const text = String(css).replace(/\/\*[\s\S]*?\*\//g, '');
    const L = {}; const D = {};
    for (const m of text.matchAll(/@media\s*\(\s*prefers-color-scheme\s*:\s*dark\s*\)\s*\{\s*:root(?:[^{]*)\{([^}]*)\}/g)) Object.assign(D, declsOf(m[1]));
    const outside = text.replace(/@media[^{]*\{(?:[^{}]*\{[^}]*\})*\s*\}/g, '');
    for (const m of outside.matchAll(/(?:^|[},;\s]):root\s*\{([^}]*)\}/g)) Object.assign(L, declsOf(m[1]));
    const map = new Map();
    for (const [k, v] of Object.entries(D)) {
      if (!L[k] || !/^#/.test(v) || !/^#/.test(L[k])) continue;
      const a = hex(v); const b = hex(L[k]);
      if (a && b) map.set(a, b);
    }
    return map;
  }
  const fileName = (kind, project, state, ext) => `pnl-${kind}-${project || 'tabla'}-${state === 'blank' ? 'blanco' : 'resuelta'}.${ext}`;

  // ---------- Con DOM ----------
  const SVGNS = 'http://www.w3.org/2000/svg';
  const isPaint = (v, op) => !(v == null || v === 'none' || v === 'transparent' || /^url\(/.test(v) || op === '0' || /^rgba\(.*,\s*0\)$/.test(v));

  function treeOf(svg) {
    const walk = (el) => {
      const cs = root.getComputedStyle(el);
      const attrs = {};
      for (const a of el.attributes) attrs[a.name] = a.value;
      const w = String(cs.fontWeight);
      return {
        tag: el.tagName.replace(/^svg:/, ''),
        attrs,
        cls: String(el.getAttribute('class') || '').split(/\s+/).filter(Boolean),
        style: {
          hidden: cs.display === 'none' || cs.visibility === 'hidden',
          anchor: cs.textAnchor === 'middle' ? 'middle' : cs.textAnchor === 'end' ? 'end' : 'start',
          size: parseFloat(cs.fontSize) || 12,
          weight: w === 'bold' ? 700 : parseFloat(w) || 400,
          dashed: !!cs.strokeDasharray && cs.strokeDasharray !== 'none',
          fill: isPaint(cs.fill, cs.fillOpacity),
          stroke: isPaint(cs.stroke, cs.strokeOpacity),
        },
        text: [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join(''),
        children: [...el.children].map(walk),
      };
    };
    return walk(svg);
  }

  // Lo que se escribe en cada elemento del archivo SVG (sin la hoja de estilos de la página, no se vería igual).
  const PROPS = ['fill', 'fill-opacity', 'stroke', 'stroke-width', 'stroke-dasharray', 'stroke-opacity', 'opacity', 'font-family', 'font-size', 'font-weight', 'text-anchor'];
  let themeCache = null;
  /** El mapa de colores de las hojas de estilos de la página (vacío si no está en oscuro). */
  function pageTheme() {
    const dark = root.matchMedia && root.matchMedia('(prefers-color-scheme: dark)').matches;
    if (!dark) return new Map();
    if (themeCache) return themeCache;
    let css = '';
    for (const sh of root.document.styleSheets) {
      try { for (const r of sh.cssRules) css += `${r.cssText}\n`; } catch { /* hojas de otro origen: no hay */ }
    }
    themeCache = themeMap(css);
    return themeCache;
  }
  const swap = (map, v) => String(v).replace(/rgba?\([^)]*\)/g, (c) => {
    const m = /^rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)$/.exec(c);
    if (!m) return c;
    const k = `rgb(${m[1]}, ${m[2]}, ${m[3]})`;
    if (!map.has(k)) return c;
    return m[4] != null ? map.get(k).replace('rgb(', 'rgba(').replace(')', `, ${m[4]})`) : map.get(k);
  });

  function svgFile(svg, opts) {
    const o = opts || {};
    const map = pageTheme();
    const copy = svg.cloneNode(true);
    const live = [svg, ...svg.querySelectorAll('*')];
    const out = [copy, ...copy.querySelectorAll('*')];
    live.forEach((el, i) => {
      const cs = root.getComputedStyle(el); const c = out[i];
      if (cs.display === 'none') { c.setAttribute('display', 'none'); return; }
      for (const p of PROPS) {
        const v = cs.getPropertyValue(p);
        if (v && v !== 'normal' && !(p === 'stroke-dasharray' && v === 'none')) c.setAttribute(p, swap(map, v));
      }
    });
    const vb = svg.viewBox && svg.viewBox.baseVal;
    const w = vb && vb.width ? vb.width : svg.getBoundingClientRect().width;
    const h = vb && vb.height ? vb.height : svg.getBoundingClientRect().height;
    copy.removeAttribute('style');
    copy.setAttribute('xmlns', SVGNS);
    copy.setAttribute('width', String(w));
    copy.setAttribute('height', String(h));
    if (!copy.getAttribute('viewBox')) copy.setAttribute('viewBox', `0 0 ${w} ${h}`);
    const doc = root.document;
    const bg = doc.createElementNS(SVGNS, 'rect');
    const x0 = vb ? vb.x : 0; const y0 = vb ? vb.y : 0;
    for (const [k, v] of [['x', x0], ['y', y0], ['width', w], ['height', h], ['fill', '#ffffff']]) bg.setAttribute(k, String(v));
    copy.insertBefore(bg, copy.firstChild);
    for (const t of copy.querySelectorAll(':scope > title')) t.remove();
    const title = doc.createElementNS(SVGNS, 'title');
    title.textContent = o.title || '';
    copy.insertBefore(title, copy.firstChild);
    return new root.XMLSerializer().serializeToString(copy);
  }

  async function png(svg, k) {
    const f = k || 2;
    const text = svgFile(svg, {});
    const vb = svg.viewBox && svg.viewBox.baseVal;
    const w = Math.round((vb && vb.width ? vb.width : svg.getBoundingClientRect().width) * f);
    const h = Math.round((vb && vb.height ? vb.height : svg.getBoundingClientRect().height) * f);
    const img = new root.Image();
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(text)}`;
    await img.decode();
    const c = root.document.createElement('canvas');
    c.width = w; c.height = h;
    const cx = c.getContext('2d');
    cx.fillStyle = '#ffffff';
    cx.fillRect(0, 0, w, h);
    cx.drawImage(img, 0, 0, w, h);
    return new Promise((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error('png'))), 'image/png'));
  }

  function download(name, data, type) {
    const blob = data instanceof root.Blob ? data : new root.Blob([data], { type: type || 'text/plain;charset=utf-8' });
    const url = root.URL.createObjectURL(blob);
    const a = root.document.createElement('a');
    a.href = url; a.download = name; a.hidden = true;
    root.document.body.appendChild(a);
    a.click();
    a.remove();
    root.setTimeout(() => root.URL.revokeObjectURL(url), 1000);
  }

  async function copy(text) {
    try {
      if (!root.navigator.clipboard || !root.navigator.clipboard.writeText) return false;
      await root.navigator.clipboard.writeText(text);
      return true;
    } catch { return false; }
  }

  // ---------- El menú (T005; tableros 142–146) ----------
  // mount(details, spec) pinta el menú dentro del <details class="fx"> de dom.figButton; update(details, spec) le da la
  // figura nueva al redibujar la vista. spec: { kind, project, title, lang, states, initial, note ('route'|'exam'), ctx,
  // solved(), blank() }. Lo elegido se recuerda en la visita por sitio (ctx), sin entrar en el enlace (decisión de T004).
  const chosen = new Map();
  const t = (spec, k) => root.PNL.i18n.t(spec.lang, `fx.${k}`);
  /** Un contenedor fuera de la vista para dibujar «en blanco» (se quita al terminar cada exportación). */
  function offscreen() {
    const c = root.document.createElement('div');
    c.className = 'fx-off';
    c.setAttribute('aria-hidden', 'true');
    root.document.body.appendChild(c);
    return c;
  }
  const dropOffscreen = () => root.document.querySelectorAll('.fx-off').forEach((c) => c.remove());
  const stateOf = (spec, d) => {
    const ok = (x) => x && spec.states.includes(x);
    if (ok(d.fxState)) return d.fxState;
    if (ok(chosen.get(spec.ctx || ''))) return chosen.get(spec.ctx || '');
    if (ok(spec.initial)) return spec.initial;
    return spec.states.includes('solved') ? 'solved' : spec.states[0];
  };
  const shape = (spec) => JSON.stringify([spec.lang, spec.states, spec.note || null]);

  function build(d) {
    const spec = d.fxSpec; const h = root.PNL.dom.h;
    const old = d.querySelector('.fx-panel'); if (old) old.remove();
    d.fxShape = shape(spec);
    d.fxState = stateOf(spec, d);
    const live = h('p', { class: 'fx-live', role: 'status' });
    const foot = h('p', { class: 'fx-hint fx-foot', text: t(spec, 'hint') });
    const say = (msg, kind) => { live.textContent = msg || ''; live.className = `fx-live${kind ? ` ${kind}` : ''}`; foot.hidden = !!msg; };
    const kids = [];
    let seg = null;
    if (spec.note !== 'exam') {
      kids.push(h('p', { class: 'fx-lab', text: t(spec, 'show') }));
      seg = h('div', { class: 'seg', role: 'group', 'aria-label': t(spec, 'show') }, spec.states.map((k) => h('button', { type: 'button', 'data-state': k, 'aria-pressed': String(k === d.fxState), text: t(spec, k),
        onclick: () => { d.fxState = k; chosen.set(spec.ctx || '', k); seg.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.state === k))); say(''); } })));
      kids.push(seg);
      if (!spec.states.includes('solved')) kids.push(h('p', { class: 'fx-hint', text: t(spec, 'exOnly') }));
      if (spec.note === 'route') kids.push(h('p', { class: 'fx-hint', text: t(spec, 'route') }));
      kids.push(h('hr'));
    } else kids.push(h('p', { class: 'fx-hint', text: t(spec, 'exam') }));
    const done = () => { d.open = false; d.querySelector('summary').focus(); };
    const run = async (act) => {
      const sp = d.fxSpec; const st = d.fxState;
      const title = typeof sp.title === 'function' ? sp.title(st) : sp.title;
      let el = null;
      try { el = st === 'solved' ? sp.solved() : sp.blank(); } catch { el = null; }
      if (!el) { dropOffscreen(); say(t(sp, 'noFig'), 'warn'); return; }
      const name = (ext) => fileName(sp.kind, sp.project, st, ext);
      try {
        if (act === 'copy') {
          const ok = await copy(root.PNL.figTikz.toTikz(treeOf(el), { title }));
          say(t(sp, ok ? 'copied' : 'noCopy'), ok ? 'ok' : 'warn');
          return;
        }
        if (act === 'svg') download(name('svg'), svgFile(el, { title }), 'image/svg+xml');
        if (act === 'tex') download(name('tex'), root.PNL.figTikz.toTikz(treeOf(el), { title, standalone: true }), 'text/x-tex');
        if (act === 'png') {
          let b = null;
          try { b = await png(el, 2); } catch { b = null; }
          if (!b) { say(t(sp, 'pngFail'), 'warn'); return; }
          download(name('png'), b);
        }
        say('');
        done();
      } finally { dropOffscreen(); }
    };
    const act = (k, ext) => h('button', { type: 'button', class: 'fx-act', 'data-act': k, onclick: () => run(k) }, [t(spec, k), ext ? h('span', { class: 'fx-ext', text: ` ${t(spec, ext)}` }) : null]);
    kids.push(act('svg'), act('png', 'pngExt'), act('copy'), act('tex', 'texExt'), foot, live);
    d.appendChild(h('div', { class: 'fx-panel', role: 'group', 'aria-label': t(spec, 'label') }, kids));
  }

  // Alineado a la derecha del botón; si así se saldría por la izquierda, a la izquierda; y si tampoco cabe (pantalla
  // estrecha, botón en medio), desplazado lo justo para quedar dentro.
  function place(d) {
    const pn = d.querySelector('.fx-panel'); if (!pn || !d.open) return;
    pn.classList.remove('fx-left'); pn.style.left = '';
    if (pn.getBoundingClientRect().left >= 8) return;
    pn.classList.add('fx-left');
    const r = pn.getBoundingClientRect(); const W = root.document.documentElement.clientWidth;
    if (r.right > W - 8) pn.style.left = `${Math.round(W - 8 - r.right)}px`;
  }
  function mount(d, spec) {
    d.fxSpec = spec;
    build(d);
    place(d);
    if (!d.fxKeys) {
      d.fxKeys = true;
      d.addEventListener('toggle', () => place(d));
      d.addEventListener('keydown', (e) => { if (e.key === 'Escape' && d.open) { e.preventDefault(); d.open = false; d.querySelector('summary').focus(); } });
    }
  }
  function update(d, spec) {
    d.fxSpec = spec;
    if (d.fxShape !== shape(spec)) build(d);
  }
  // Pulsar fuera cierra los menús abiertos (como «Ajustes»); el foco no se mueve.
  if (root.document) {
    root.document.addEventListener('click', (e) => {
      root.document.querySelectorAll('details.fx[open]').forEach((d) => { if (!d.contains(e.target)) d.open = false; });
    });
  }

  const api = { themeMap, fileName, treeOf, svgFile, png, download, copy, offscreen, mount, update };
  root.PNL = root.PNL || {};
  root.PNL.figExport = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
