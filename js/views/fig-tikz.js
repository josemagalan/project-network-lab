/*
 * views/fig-tikz — una figura del laboratorio (el SVG que pinta la pantalla) en TikZ para LaTeX (spec f5d-exportar-figuras,
 * AC1, AC2, AC5 y AC6; plan §0, §3, P6 y P7; prototipo de T001, spikes/f5d-exportar-figuras/svg2tikz.js). Sin DOM: recibe
 * un árbol (fig-export lo saca del DOM con los estilos calculados; parse lo saca de un SVG en texto, como el de net-svg) y
 * devuelve texto. Determinista y con todo el texto escapado para LaTeX.
 *   parse(svgString) → árbol { tag, attrs, cls, style, text, children }
 *   toTikz(árbol, { title, scale, standalone }) → texto TikZ
 * style: { hidden, anchor, size, weight, dashed, fill, stroke } (fill y stroke: si se pinta o no; los colores no cuentan).
 * En blanco y negro: el grosor y los trazos salen de las clases (THICK, DASHED, GRID…), no de los colores, así que la figura
 * sale igual con la página en claro o en oscuro. Cada grupo con translate (una caja, un suceso) va en un scope con su shift:
 * se mueve editando una línea. La escala de la primera línea cambia el dibujo y no la letra (T001).
 */
(function (root) {
  'use strict';

  // ---------- Lector mínimo de SVG ----------
  const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
  const unent = (s) => String(s).replace(/&(#x?[0-9a-fA-F]+|amp|lt|gt|quot|apos);/g, (m, e) => (e[0] === '#'
    ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)) : ENT[e]));
  const INHERIT = ['font-size', 'font-weight', 'text-anchor', 'display'];

  /** Los atributos de estilo de un elemento (atributo o style="…"), con los heredados que importan. */
  function styleOf(attrs, parent) {
    const own = Object.assign({}, attrs);
    for (const decl of String(attrs.style || '').split(';')) {
      const i = decl.indexOf(':');
      if (i > 0) own[decl.slice(0, i).trim()] = decl.slice(i + 1).trim();
    }
    const inh = Object.assign({}, parent || {});
    for (const k of INHERIT) if (own[k] != null) inh[k] = own[k];
    const paint = (v, dflt) => (v == null ? dflt : !(v === 'none' || v === 'transparent' || /^url\(/.test(v) || v === 'url'));
    return {
      inh,
      style: {
        hidden: inh.display === 'none' || own.visibility === 'hidden' || own.opacity === '0',
        anchor: inh['text-anchor'] === 'middle' ? 'middle' : inh['text-anchor'] === 'end' ? 'end' : 'start',
        size: parseFloat(inh['font-size']) || 12,
        weight: inh['font-weight'] === 'bold' ? 700 : parseFloat(inh['font-weight']) || 400,
        dashed: own['stroke-dasharray'] != null && own['stroke-dasharray'] !== 'none',
        fill: paint(own.fill, true),
        stroke: paint(own.stroke, false),
      },
    };
  }

  /** Un SVG en texto → árbol. Solo lo que escriben net-svg y las pruebas: elementos, atributos, texto y las entidades de XML. */
  function parse(src) {
    const re = /<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!\[CDATA\[([\s\S]*?)\]\]>|<(\/?)([a-zA-Z][\w:-]*)((?:\s+[\w:-]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>|([^<]+)/g;
    const top = { tag: '#root', children: [], inh: {} };
    const stack = [top];
    let m;
    while ((m = re.exec(String(src)))) {
      const cur = stack[stack.length - 1];
      if (m[1] != null) { cur.text = (cur.text || '') + m[1]; continue; }
      if (m[6] != null) { if (/\S/.test(m[6]) || cur.tag === 'text' || cur.tag === 'tspan') cur.text = (cur.text || '') + unent(m[6]); continue; }
      if (!m[3]) continue;
      if (m[2]) { if (stack.length > 1) stack.pop(); continue; }
      const attrs = {};
      const ar = /([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
      let a;
      while ((a = ar.exec(m[4]))) attrs[a[1]] = unent(a[2] != null ? a[2] : a[3]);
      const { inh, style } = styleOf(attrs, cur.inh);
      const el = { tag: m[3], attrs, cls: String(attrs.class || '').split(/\s+/).filter(Boolean), style, text: '', children: [], inh };
      cur.children.push(el);
      if (!m[5]) stack.push(el);
    }
    const clean = (el) => { delete el.inh; el.children.forEach(clean); return el; };
    const svg = top.children.find((c) => c.tag === 'svg');
    if (!svg) throw new Error('fig-tikz: no es un SVG');
    return clean(svg);
  }

  // ---------- TikZ ----------
  const THICK = ['crit', 'chosen', 'sel', 'active', 'bar-c', 'rule'];
  const DASHED = ['dummy', 'compared', 'float', 'wait', 'zero'];
  const GRID = ['grid', 'rsg-grid'];
  const THIN = ['sep'];
  const SKIP = ['defs', 'title', 'desc', 'marker', 'pattern', 'style', 'metadata', 'clipPath', 'mask', 'linearGradient', 'radialGradient'];
  const SYM = { '★': '$\\star$', '−': '$-$', '→': '$\\to$', '←': '$\\leftarrow$', '≤': '$\\le$', '≥': '$\\ge$', '×': '$\\times$', '…': '\\ldots{}', '–': '--', '—': '---' };
  const SPECIAL = { '\\': '\\textbackslash{}', '{': '\\{', '}': '\\}', '&': '\\&', '%': '\\%', '#': '\\#', _: '\\_', $: '\\$', '^': '\\^{}', '~': '\\~{}' };
  /** Texto para LaTeX: los diez caracteres especiales y los símbolos que pdfLaTeX no conoce sin un paquete. */
  const tex = (s) => String(s).replace(/[\\{}&%#_$^~]/g, (c) => SPECIAL[c]).replace(/[★−→←≤≥×…–—]/g, (c) => SYM[c]);
  const f1 = (v) => { const r = Math.round(v * 10) / 10; return (Object.is(r, -0) ? 0 : r).toString(); };
  const has = (el, list) => el.cls.some((c) => list.includes(c));
  const num = (el, k) => parseFloat(el.attrs[k]) || 0;
  const CM = 0.035;   // 1 px de la figura = 0,035 cm (plan §0)

  /** La escala por defecto: el dibujo en 16 cm como mucho, sin pasar de 1, con dos decimales. */
  const defaultScale = (w) => Math.min(1, Math.floor((16 / (CM * Math.max(w, 1))) * 100) / 100);
  const viewBoxOf = (svg) => {
    const v = String(svg.attrs.viewBox || '').trim().split(/[\s,]+/).map(Number);
    if (v.length === 4 && v.every(Number.isFinite)) return { x: v[0], y: v[1], w: v[2], h: v[3] };
    return { x: 0, y: 0, w: num(svg, 'width') || 100, h: num(svg, 'height') || 100 };
  };
  /** El texto propio de un elemento <text> (con sus <tspan>, sin <title>). */
  const textOf = (el) => (el.text || '') + el.children.filter((c) => c.tag === 'tspan').map(textOf).join('');
  const translateOf = (el) => {
    const m = /translate\(\s*([-\d.eE]+)(?:[\s,]+([-\d.eE]+))?\s*\)/.exec(el.attrs.transform || '');
    return m ? [parseFloat(m[1]), parseFloat(m[2] || 0)] : null;
  };
  /** El trazo de un path (M, L, H, V, C, Q, Z, absolutos y relativos); null si lleva arcos u otras órdenes. */
  function pathOf(d, P) {
    const toks = String(d).match(/[a-zA-Z]|-?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g) || [];
    let i = 0; let cmd = ''; let x = 0; let y = 0; let sx = 0; let sy = 0; let out = '';
    const n = () => parseFloat(toks[i++]);
    while (i < toks.length) {
      if (/[a-zA-Z]/.test(toks[i])) cmd = toks[i++];
      const rel = cmd === cmd.toLowerCase(); const C = cmd.toUpperCase();
      const pt = () => { const a = n(); const b = n(); return rel ? [x + a, y + b] : [a, b]; };
      if (C === 'M') { [x, y] = pt(); sx = x; sy = y; out += `${out ? ' ' : ''}${P(x, y)}`; cmd = rel ? 'l' : 'L'; }
      else if (C === 'L') { [x, y] = pt(); out += ` -- ${P(x, y)}`; }
      else if (C === 'H') { const a = n(); x = rel ? x + a : a; out += ` -- ${P(x, y)}`; }
      else if (C === 'V') { const a = n(); y = rel ? y + a : a; out += ` -- ${P(x, y)}`; }
      else if (C === 'C') { const a = pt(); const b = pt(); [x, y] = pt(); out += ` .. controls ${P(...a)} and ${P(...b)} .. ${P(x, y)}`; }
      else if (C === 'Q') { const a = pt(); const [x0, y0] = [x, y]; [x, y] = pt(); const c1 = [x0 + (2 / 3) * (a[0] - x0), y0 + (2 / 3) * (a[1] - y0)]; const c2 = [x + (2 / 3) * (a[0] - x), y + (2 / 3) * (a[1] - y)]; out += ` .. controls ${P(...c1)} and ${P(...c2)} .. ${P(x, y)}`; }
      else if (C === 'Z') { out += ' -- cycle'; x = sx; y = sy; }
      else return null;
    }
    return out || null;
  }

  function toTikz(svg, opts) {
    const o = opts || {};
    const vb = viewBoxOf(svg);
    const sc = o.scale != null ? o.scale : defaultScale(vb.w);
    const small = sc < 0.5;
    const SIZES = small ? ['\\footnotesize', '\\scriptsize', '\\tiny'] : ['\\small', '\\footnotesize', '\\scriptsize'];
    const fontOf = (st) => `\\sffamily${st.weight >= 600 ? '\\bfseries' : ''}${st.size >= 15 ? SIZES[0] : st.size >= 13 ? SIZES[1] : SIZES[2]}`;
    const lines = [];
    const out = (s, depth) => lines.push(`${'  '.repeat(depth)}${s}`);
    const styleOfEl = (el, arrow) => {
      const s = [has(el, THICK) ? 'pnl thick' : has(el, GRID) ? 'pnl grid' : has(el, THIN) ? 'pnl sep' : 'pnl line'];
      if (has(el, DASHED) || el.style.dashed) s.push('dashed');
      if (arrow) s.push(arrow);
      return s.join(', ');
    };
    const arrowOf = (el) => (el.attrs['marker-end'] && el.attrs['marker-start'] ? '{Stealth[length=5pt]}-{Stealth[length=5pt]}'
      : el.attrs['marker-end'] ? '-{Stealth[length=5pt]}' : el.attrs['marker-start'] ? '{Stealth[length=5pt]}-' : null);
    const nameOf = (g) => {
      if (g.attrs['data-act'] || g.attrs['data-node']) return g.attrs['data-act'] || g.attrs['data-node'];
      const t = [];
      const walkT = (e) => { if (e.tag === 'text') t.push(e); else e.children.forEach(walkT); };
      walkT(g);
      const best = t.find((e) => e.style.weight >= 600) || t[0];
      return best ? textOf(best).trim() : '';
    };

    function walk(el, depth, ox, oy) {
      for (const c of el.children) {
        if (c.style.hidden || SKIP.includes(c.tag)) continue;
        const P = (x, y) => `(${f1(ox + x)},${f1(oy + y)})`;
        if (c.tag === 'g' || c.tag === 'a') {
          const t = translateOf(c);
          if (t && c.children.length) {
            const name = nameOf(c);
            out(`\\begin{scope}[shift={(${f1(ox + t[0])},${f1(oy + t[1])})}]${name ? ` % ${tex(name).replace(/\n/g, ' ')}` : ''}`, depth);
            walk(c, depth + 1, 0, 0);
            out('\\end{scope}', depth);
          } else walk(c, depth, ox, oy);
          continue;
        }
        const st = c.style;
        if (c.tag === 'rect') {
          const bar = has(c, ['bar-c', 'bar-n']);
          if (!bar && !st.stroke) continue;
          const x = num(c, 'x'); const y = num(c, 'y'); const w = num(c, 'width'); const h = num(c, 'height');
          if (!(w > 0 && h > 0)) continue;
          const rx = Math.min(num(c, 'rx') || num(c, 'ry'), h / 2, w / 2);
          const round = rx > 0 ? `, rounded corners=${f1(rx * CM * sc * 10)}mm` : '';
          if (bar) out(`\\filldraw[${styleOfEl(c)}, fill=black!${has(c, ['bar-c']) ? 75 : 20}${round}] ${P(x, y)} rectangle ${P(x + w, y + h)};`, depth);
          else out(`\\draw[${styleOfEl(c)}${round}] ${P(x, y)} rectangle ${P(x + w, y + h)};`, depth);
        } else if (c.tag === 'line') {
          if (!st.stroke && !has(c, [...THICK, ...DASHED, ...GRID, ...THIN])) continue;
          out(`\\draw[${styleOfEl(c, arrowOf(c))}] ${P(num(c, 'x1'), num(c, 'y1'))} -- ${P(num(c, 'x2'), num(c, 'y2'))};`, depth);
        } else if (c.tag === 'polyline' || c.tag === 'polygon') {
          const v = String(c.attrs.points || '').trim().split(/[\s,]+/).map(Number);
          const pts = [];
          for (let k = 0; k + 1 < v.length; k += 2) if (Number.isFinite(v[k]) && Number.isFinite(v[k + 1])) pts.push(P(v[k], v[k + 1]));
          if (pts.length > 1) out(`\\draw[${styleOfEl(c, arrowOf(c))}] ${pts.join(' -- ')}${c.tag === 'polygon' ? ' -- cycle' : ''};`, depth);
        } else if (c.tag === 'path') {
          if (!st.stroke && st.fill) continue;   // puntas de flecha y rellenos: las flechas salen de marker-end
          const d = pathOf(c.attrs.d || '', P);
          if (d) out(`\\draw[${styleOfEl(c, arrowOf(c))}] ${d};`, depth);
        } else if (c.tag === 'circle' || c.tag === 'ellipse') {
          if (!st.stroke) continue;
          const r = num(c, 'r');
          const rr = c.tag === 'circle' ? `radius=${f1(r)}` : `x radius=${f1(num(c, 'rx'))}, y radius=${f1(num(c, 'ry'))}`;
          out(`\\draw[${styleOfEl(c)}] ${P(num(c, 'cx'), num(c, 'cy'))} circle[${rr}];`, depth);
        } else if (c.tag === 'text') {
          const s = textOf(c).replace(/\s+/g, ' ').trim();
          if (!s || s === '·') continue;
          const anchor = st.anchor === 'middle' ? 'base' : st.anchor === 'end' ? 'base east' : 'base west';
          out(`\\node[anchor=${anchor}, font=${fontOf(st)}] at ${P(num(c, 'x'), num(c, 'y'))} {${tex(s)}};`, depth);
        }
      }
    }

    const title = String(o.title || '').replace(/\s+/g, ' ').trim();
    out(`% ${tex(title || 'Figura')} · Project Network Lab`, 0);
    out(`% Escala del dibujo: cambia ${sc} en la línea siguiente (las letras no cambian de tamaño).`, 0);
    out(`\\begin{tikzpicture}[scale=${sc}, x=${CM}cm, y=-${CM}cm, every node/.style={inner sep=0pt},`, 0);
    out('  pnl line/.style={line width=0.6pt}, pnl thick/.style={line width=1.8pt}, pnl sep/.style={line width=0.4pt},', 0);
    out('  pnl grid/.style={line width=0.3pt, black!25}]', 0);
    walk(svg, 1, -vb.x, -vb.y);
    out('\\end{tikzpicture}', 0);
    const body = lines.join('\n');
    if (!o.standalone) return `${body}\n`;
    return `\\documentclass[border=4pt]{standalone}\n\\usepackage{tikz}\n\\usetikzlibrary{arrows.meta}\n\\begin{document}\n${body}\n\\end{document}\n`;
  }

  const api = { parse, toTikz, tex, defaultScale, THICK, DASHED, GRID, THIN };
  root.PNL = root.PNL || {};
  root.PNL.figTikz = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
