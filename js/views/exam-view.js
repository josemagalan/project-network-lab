/*
 * views/exam-view — los bloques de los documentos de core/exam → DOM (spec f3f-examen-imprimible, AC9–AC11, AC15 y
 * AC16; plan P2; T010; tableros 107 y 110–113). Con dom.h, sin HTML en texto (constitución, 22): todo texto entra como
 * texto. Los dibujos SVG (redes y gráficos), el QR del enlace y las rejillas de puntos van como
 * <img src="data:image/svg+xml;base64,…"> con su texto alternativo, como la imagen de «Ejercicios» y de Moodle.
 * Bloques: marca de parte ({ part, title, pts }: «Parte i · título» y sus puntos), apartado de la rúbrica ({ item, part,
 * pts }), ejemplo de error consecuente ({ consequent, p }), párrafo ({ p }), encabezado ({ h }), cita ({ quote }), tabla
 * ({ table, fill }: las celdas null, en blanco para rellenar), dibujo ({ svg, alt, wide }), recuadro para las cuentas
 * ({ box }: líneas de BOX_LINE px), rejilla ({ grid: 'aon'|'aoa', w, h }, del tamaño fijo de H2), salto ({ page }),
 * anexos ({ annex: 'normal' } con ctx.normal, las filas de normal-table; { annex: 'grid', w, h }) y enlace ({ link }, con
 * el QR de ctx.qr), y en la página (T011) la cabecera del enunciado ({ head, id, instructions }) y el título de la
 * solución y de la rúbrica ({ title }). Lo ancho (más de 829 px) lleva la clase xm-wide: en papel va en su página girada (T012).
 * render(contenedor, bloques, ctx), ctx = { lang, t(clave, parámetros), qr(texto) → SVG, normal() → filas }: seguido.
 * T012 (plan P2; tableros 110–113): units (los bloques como piezas para paginar), layout (las piezas en páginas, sin DOM)
 * y pages(contenedor, bloques, ctx + { paper, foot }): el documento en hojas de papel, las mismas en la vista previa y al
 * imprimir.
 */
(function (root) {
  'use strict';

  const WIDE = 829;
  const BOX_LINE = 26;
  const GRID_STEP = 20;

  /** Base64 de un texto UTF-8 (el de core/moodle en el navegador; Buffer en Node). */
  const b64 = (s) => (root.PNL && root.PNL.moodle && root.PNL.moodle.base64 ? root.PNL.moodle.base64(s) : root.Buffer.from(s, 'utf8').toString('base64'));
  const dataUri = (svg) => `data:image/svg+xml;base64,${b64(svg)}`;
  /** Una rejilla de puntos de w × h px, en texto SVG (puntos cada 20 px y un marco). */
  const gridSvg = (w, h) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">`
    + `<defs><pattern id="g" width="${GRID_STEP}" height="${GRID_STEP}" patternUnits="userSpaceOnUse"><circle cx="10" cy="10" r="1.1" fill="#9a9a9a"/></pattern></defs>`
    + `<rect x="0.5" y="0.5" width="${w - 1}" height="${h - 1}" fill="url(#g)" stroke="#555"/></svg>`;
  /** Un número con la coma del español. */
  const num = (lang, v) => (lang === 'es' ? String(v).replace('.', ',') : String(v));

  /** El ancho y el alto de un SVG en texto (los de su primera etiqueta), o null. */
  function svgSize(svg) {
    const tag = /<svg\b[^>]*>/.exec(String(svg || ''));
    const w = tag && /\swidth="([\d.]+)"/.exec(tag[0]);
    const hh = tag && /\sheight="([\d.]+)"/.exec(tag[0]);
    return w && hh ? [w[1], hh[1]] : null;
  }

  /**
   * Los bloques como piezas para paginar (T012): { el, kind, type, wide, keep, part, label }. kind: 'pre' (antes de la
   * primera parte: cabecera, título, introducción), 'part' (la marca de parte), 'in' (lo de una parte), 'tail' (enlace y
   * anexos) o 'break' (salto). wide: va en su página girada (dibujo o rejilla de más de 829 px). keep: no se queda solo al
   * pie de una página (el título, la marca de parte, el apartado, el encabezado y el párrafo que presenta su tabla, su
   * recuadro, su rejilla o su dibujo). part: el número de la parte (0 fuera de ellas); label: «Parte i · título» de lo
   * ancho. Cada pieza es un solo elemento, con data-u (su número) y data-part.
   */
  function units(blocks, ctx) {
    const { h } = root.PNL.dom;
    const lang = ctx.lang === 'en' ? 'en' : 'es';
    const t = ctx.t;
    const pts = (n) => (n === 1 ? t('exam.head.point') : t('exam.head.points', { n: num(lang, n) }));
    const img = (svg, alt, size) => h('img', { src: dataUri(svg), alt, width: size && size[0], height: size && size[1] });
    const fig = (child, wide) => h('p', { class: wide ? 'xm-fig xm-wide' : 'xm-fig' }, [child]);
    const grid = (w, hh, alt) => fig(img(gridSvg(w, hh), alt, [w, hh]), w > WIDE);
    const table = (head, rows, cls) => h('div', { class: 'xm-scroll', tabindex: '0' }, [h('table', { class: cls }, [
      h('thead', {}, [h('tr', {}, head.map((x) => h('th', { scope: 'col' }, [String(x)])))]),
      h('tbody', {}, rows.map((r) => h('tr', {}, r.map((c, i) => (i === 0 ? h('th', { scope: 'row' }, [String(c)])
        : c == null ? h('td', { class: 'xm-blank' }, []) : h('td', {}, [String(c)])))))),
    ])]);
    const group = (els) => h('div', { class: 'xm-unit' }, els);
    const PRESENTS = ['table', 'box', 'grid', 'svg'];
    const kindOf = (b) => (b == null ? null : ['head', 'item', 'part', 'title', 'consequent', 'annex', 'link', 'grid', 'svg', 'table', 'box', 'quote', 'page', 'h', 'p'].find((k) => k in b) || null);
    let part = 0;
    let label = null;
    let tail = false;
    const out = [];
    (blocks || []).forEach((b, bi) => {
      const k = kindOf(b);
      const next = kindOf((blocks || [])[bi + 1]);
      let el = null; let kind = tail ? 'tail' : part ? 'in' : 'pre'; let keep = false; let wide = false;
      if (k === 'head') {
        // La cabecera del enunciado (T011): asignatura, convocatoria, fecha y duración; nombre y DNI; instrucciones.
        const hd = b.head || {};
        const when = ['call', 'date', 'duration'].map((x) => hd[x]).filter(Boolean).join(' · ');
        el = h('div', { class: 'xm-headbox' }, [
          hd.subject || when ? h('div', { class: 'xm-headrow' }, [hd.subject ? h('strong', {}, [hd.subject]) : null, when ? h('span', {}, [when]) : null]) : null,
          b.id ? h('div', { class: 'xm-idrow' }, [h('span', { class: 'xm-blankline' }, [`${t('exam.head.name')}:`]), h('span', { class: 'xm-blankline' }, [`${t('exam.head.id')}:`])]) : null,
          h('p', { class: 'xm-instr' }, [b.instructions]),
        ]);
      } else if (k === 'item') {
        // Las partes sin apartados (enunciado, redes, detective…) tienen uno solo, con el nombre de la parte.
        const key = `exam.item.${b.item}`;
        const name = t(key) !== key ? t(key) : t(`exam.part.${b.part}`);
        el = h('h3', { class: 'xm-item' }, [`${name} · ${pts(b.pts)}`]);
        keep = true;
      } else if (k === 'part') {
        part++;
        tail = false;
        label = t('exam.head.partTitle', { i: part, t: b.title });
        el = h('h2', { class: 'xm-part' }, [h('span', {}, [label]), h('span', { class: 'xm-pts' }, [pts(b.pts)])]);
        kind = 'part'; keep = true;
      } else if (k === 'title') {
        // El título de la solución y de la rúbrica (las marcas de parte también llevan title: van antes).
        el = h('h2', { class: 'xm-doctitle' }, [b.title]);
        keep = true;
      } else if (k === 'consequent') {
        el = h('div', { class: 'xm-consequent' }, [h('p', {}, [b.p])]);
      } else if (k === 'annex') {
        kind = 'tail'; tail = true;
        if (b.annex === 'normal') {
          const rows = ctx.normal ? ctx.normal() : null;
          if (rows) {
            const f = (v, d) => num(lang, v.toFixed(d));
            el = group([h('h2', { class: 'xm-annex' }, [t('exam.head.normalTitle')]),
              table(['z', ...Array.from({ length: 10 }, (_, j) => f(j / 100, 2))], rows.map((r) => [f(r.z0, 1), ...r.p.map((p) => f(p, 4))]), 'xm-table xm-normal')]);
          }
        } else if (b.annex === 'grid') {
          el = group([h('h2', { class: 'xm-annex' }, [t('exam.head.gridSheet')]), grid(b.w, b.h, t('exam.head.gridSheet'))]);
          wide = b.w > WIDE;
        }
      } else if (k === 'link') {
        kind = 'tail'; tail = true;
        const qr = ctx.qr ? ctx.qr(b.link) : null;
        el = h('div', { class: 'xm-link' }, [
          qr ? h('img', { class: 'xm-qr', src: dataUri(qr), alt: t('exam.view.qr', { url: b.link }) }) : null,
          // El enlace, dentro del párrafo de su frase: en la vista previa a escala es texto corrido (WCAG 2.5.8, excepción en línea).
          h('p', {}, [h('span', {}, [t('exam.head.link')]), ' ', h('a', { class: 'xm-url', href: b.link, target: '_blank', rel: 'noopener' }, [b.link])]),
        ]);
      } else if (k === 'grid') {
        el = grid(b.w, b.h, t(b.grid === 'aoa' ? 'exam.view.gridAoa' : 'exam.view.gridAon'));
        wide = b.w > WIDE;
      } else if (k === 'svg') {
        el = b.svg ? fig(img(b.svg, b.alt, svgSize(b.svg)), !!b.wide) : h('p', { class: 'xm-alt' }, [b.alt]);
        // F5d (T008, P5): las redes (no los gráficos) llevan su tipo, para el botón «Exportar» de examen.html.
        if (b.svg && b.model && (b.model.graph === 'aon' || b.model.graph === 'aoa')) el.setAttribute('data-net', b.model.graph === 'aoa' ? 'pert' : 'roy');
        wide = !!(b.svg && b.wide);
      } else if (k === 'table') {
        el = table(b.table.head, b.table.rows, b.fill ? 'xm-table xm-fill' : 'xm-table');
      } else if (k === 'box') {
        el = h('div', { class: 'xm-box' }, []);
        el.style.height = `${b.box * BOX_LINE}px`;
      } else if (k === 'quote') {
        el = h('blockquote', { class: 'xm-quote' }, b.quote.map((x) => h('p', {}, [x])));
      } else if (k === 'page') {
        el = h('div', { class: 'xm-break', 'aria-hidden': 'true' }, []);
        kind = 'break';
      } else if (k === 'h') {
        el = h('h3', { class: 'xm-h' }, [b.h]);
        keep = true;
      } else if (k === 'p') {
        el = h('p', {}, [b.p]);
        keep = PRESENTS.includes(next);
      }
      if (!el) return;
      const inPart = kind === 'part' || kind === 'in';
      el.setAttribute('data-u', String(out.length));
      if (inPart) el.setAttribute('data-part', String(part));
      out.push({ el, kind, type: k, wide, keep, part: inPart ? part : 0, label: wide && inPart ? label : null });
    });
    return out;
  }

  /** Los bloques seguidos, sin páginas (en Node y donde no se pagina). */
  function render(container, blocks, ctx) {
    const { clear } = root.PNL.dom;
    const us = units(blocks, ctx);
    clear(container);
    for (const u of us) container.appendChild(u.el);
    return container;
  }

  /**
   * Las piezas en páginas (T012; plan P2; tableros 110–113). items: [{ h, kind, wide, keep }] con el alto medido (px);
   * H: el alto útil de la página; o = { gap (hueco entre piezas), noteH (alto del aviso de lo girado) }.
   * Reglas: cada parte empieza donde cabe entera y, si no cabe, en una página nueva (aunque deje hueco); una parte más
   * alta que una página empieza en una nueva (o tras la cabecera o el título, si solo hay eso) y sigue pieza a pieza, sin
   * dejar al pie una pieza keep sin la siguiente; lo
   * ancho deja un aviso en su sitio y va en su página girada justo después de la página del aviso; los anexos empiezan en
   * una página nueva (el ancho, en su página girada, sin aviso y sin cambiar el orden); un salto empieza página; nunca hay
   * páginas vacías; una pieza más alta que la página va sola en la suya (over).
   * Da [{ rot: false, items: [{ i } | { note: i }], over? } | { rot: true, i }].
   */
  function layout(items, H, o) {
    const gap = (o && o.gap) || 0;
    const noteH = (o && o.noteH) || 0;
    const pages = [];
    let cur = null; let used = 0; let later = [];
    const empty = () => !cur || !cur.items.length;
    const onlyPre = () => cur.items.every((x) => 'i' in x && items[x.i].kind === 'pre');
    const close = () => { if (!empty()) pages.push(cur); cur = null; used = 0; pages.push(...later); later = []; };
    const fits = (hh) => (empty() ? hh <= H : used + gap + hh <= H);
    const hOf = (i) => (items[i].wide ? noteH : items[i].h);
    const sum = (idx) => idx.reduce((s, i, k) => s + hOf(i) + (k ? gap : 0), 0);
    const put = (entry, hh) => { if (!cur) cur = { rot: false, items: [] }; used = cur.items.length ? used + gap + hh : hh; cur.items.push(entry); };
    const place = (i) => {
      if (items[i].wide) { put({ note: i }, noteH); later.push({ rot: true, i }); return; }
      if (items[i].h > H) { close(); pages.push({ rot: false, items: [{ i }], over: true }); return; }
      put({ i }, items[i].h);
    };
    // Una lista de piezas en el orden dado, por cadenas de keep: la cadena que cabe en una página va junta.
    const flow = (idx) => {
      for (let k = 0; k < idx.length;) {
        let e = k;
        while (e < idx.length - 1 && items[idx[e]].keep) e++;
        const chain = idx.slice(k, e + 1);
        const ch = sum(chain);
        if (ch <= H) {
          if (!fits(ch)) close();
          chain.forEach(place);
        } else {
          for (const i of chain) { if (!fits(hOf(i))) close(); place(i); }
        }
        k = e + 1;
      }
    };
    const range = (a, b) => Array.from({ length: b - a }, (_, k) => a + k);
    let tail = false;
    for (let i = 0; i < items.length;) {
      const it = items[i];
      if (it.kind === 'break') { close(); i++; continue; }
      if (it.kind === 'tail') {
        if (!tail) { close(); tail = true; }
        if (it.wide) { close(); pages.push({ rot: true, i }); } else flow([i]);
        i++;
        continue;
      }
      if (it.kind === 'part') {
        let j = i + 1;
        while (j < items.length && items[j].kind === 'in') j++;
        const g = range(i, j);
        const gh = sum(g);
        if (fits(gh)) g.forEach(place);
        else {
          // Una parte que no cabe en ninguna página puede empezar tras la cabecera o el título (el principio del documento).
          if (!empty() && !(gh > H && onlyPre())) close();
          if (gh <= H) g.forEach(place); else flow(g);
        }
        i = j;
        continue;
      }
      let j = i + 1;
      while (j < items.length && (items[j].kind === 'pre' || items[j].kind === 'in')) j++;
      flow(range(i, j));
      i = j;
    }
    close();
    return pages;
  }

  /**
   * Los trozos de una tabla más alta que la hoja (T017, hallazgo de la evidencia: las discretas de 36 combinaciones en
   * carta): headH, el alto de la cabecera; rowHs, el de cada fila; extra, el resto (bordes); first, el alto para el primer
   * trozo (la hoja menos lo que lo presenta encima, que va con él) y max, el de una hoja. Cada trozo lleva la cabecera y
   * tantas filas como quepan; si en first no cabe ni una, el primero se mide con max (irá en una hoja nueva). Una fila más
   * alta que la hoja va sola. El último trozo lleva al menos WIDOW filas si el anterior puede cederlas sin quedarse con
   * menos (quitar filas a un trozo nunca lo hace más alto). Da los intervalos [desde, hasta) de las filas.
   */
  const WIDOW = 3;
  function rowChunks(headH, rowHs, extra, first, max) {
    const out = [];
    let lim = extra + headH + (rowHs[0] || 0) <= first ? first : max;
    let a = 0; let used = extra + headH;
    rowHs.forEach((r, i) => {
      if (i > a && used + r > lim) { out.push([a, i]); a = i; used = extra + headH; lim = max; }
      used += r;
    });
    out.push([a, rowHs.length]);
    // Sin una o dos filas sueltas en el último trozo: pasa las que falten del anterior si a este le quedan 3 o más.
    if (out.length > 1) {
      const p = out[out.length - 2]; const l = out[out.length - 1];
      const b = Math.max(p[0] + WIDOW, l[1] - WIDOW);
      if (b < l[0]) { p[1] = b; l[0] = b; }
    }
    return out;
  }

  /**
   * El documento en hojas de papel, dentro de container (T012). ctx, además: paper ('a4' | 'letter') y foot (el pie:
   * modelo, semilla y documento). Cada hoja: .xm-pagebox > .xm-paper (.xm-rotated si va girada) > .xm-sheet > .xm-body
   * (las piezas; en la girada, .xm-rot con el título de la parte y el dibujo) y .xm-foot (pie, «Gira la hoja…» en la
   * girada y «Página k de n»). Se mide en una hoja de prueba fuera de la vista, con el mismo CSS, así que la vista
   * previa y el papel son lo mismo. Una tabla que no cabe en una hoja con lo que la presenta se parte por filas en
   * varias, cada una con la cabecera (rowChunks; T017). Da el número de hojas.
   */
  function pages(container, blocks, ctx) {
    const { h, clear } = root.PNL.dom;
    const doc = root.document;
    const t = ctx.t;
    const cls = ctx.paper === 'letter' ? 'xm-letter' : 'xm-a4';
    let us = units(blocks, ctx);
    const sheet = (rot) => {
      const body = h('div', { class: 'xm-body' }, []);
      const foot = h('div', { class: 'xm-foot' }, []);
      const paper = h('div', { class: `xm-paper ${cls}${rot ? ' xm-rotated' : ''}` }, [h('div', { class: 'xm-sheet' }, [body, foot])]);
      return { box: h('div', { class: `xm-pagebox ${cls}` }, [paper]), paper, body, foot };
    };
    const note = (i) => h('p', { class: 'xm-rotnote', 'data-note': String(i) }, [t(us[i].type === 'grid' ? 'exam.head.nextRot' : 'exam.head.nextRotNet')]);
    const rotLabel = (text) => h('p', { class: 'xm-rotlabel' }, [text]);
    // Medir: el alto y el ancho útiles, el hueco, el aviso, el título de lo girado y cada pieza.
    const probe = sheet(false);
    probe.box.classList.add('xm-measure');
    probe.box.setAttribute('aria-hidden', 'true');
    doc.body.appendChild(probe.box);
    const H = probe.body.clientHeight;
    const W = probe.body.clientWidth;
    const gap = parseFloat(root.getComputedStyle(probe.body).rowGap) || 0;
    const tmp = [h('p', { class: 'xm-rotnote' }, [t('exam.head.nextRotNet')]), rotLabel('X')].map((el) => probe.body.appendChild(el));
    const noteH = tmp[0].getBoundingClientRect().height;
    const labelH = tmp[1].getBoundingClientRect().height;
    tmp.forEach((el) => probe.body.removeChild(el));
    // Lo ancho no se mide (va en su página girada); del anexo ancho, solo su título, que va encima del dibujo.
    const titleH = new Map();
    const measure = (u) => {
      if (u.wide && u.type === 'annex') { probe.body.appendChild(u.el); titleH.set(u, u.el.firstChild.getBoundingClientRect().height + gap); }
      if (u.kind === 'break' || u.wide) return { h: 0, kind: u.kind, wide: u.wide, keep: u.keep };
      probe.body.appendChild(u.el);
      return { h: u.el.getBoundingClientRect().height, kind: u.kind, wide: u.wide, keep: u.keep };
    };
    let items = us.map(measure);
    // Una tabla que no cabe en una hoja con lo que la presenta encima (las piezas keep de antes, que layout pone con ella),
    // en trozos por filas con la cabecera repetida (T017): así no se sale de la hoja ni deja solo al pie lo que la presenta.
    const keepOf = (its, j) => { let a = 0; for (; j >= 0 && its[j].keep; j--) a += its[j].h + gap; return a; };
    // El hueco del primer trozo: si delante solo queda lo de antes de las partes (cabecera, título), la parte, más alta que
    // una hoja, va detrás (onlyPre en layout) y lo de antes cuenta también (revisión de nivel 2, I-F5). Solo para el hueco:
    // decidir si se parte con ello partiría tablas que caben enteras en la hoja siguiente (ronda 2, F1).
    const aboveOf = (its, j) => {
      const a = keepOf(its, j);
      let k = j;
      while (k >= 0 && its[k].keep) k--;
      let pre = 0;
      for (; k >= 0 && its[k].kind === 'pre'; k--) pre += its[k].h + gap;
      return k < 0 ? a + pre : a;
    };
    const tooTall = (u, x, its, j) => u.type === 'table' && !u.wide && x.h > H - keepOf(its, j);
    if (items.some((x, i) => tooTall(us[i], x, items, i - 1))) {
      const list = []; const its = [];
      us.forEach((u, i) => {
        if (!tooTall(u, items[i], its, its.length - 1)) { list.push(u); its.push(items[i]); return; }
        const table = u.el.querySelector('table');
        const thead = table.querySelector('thead'); const tbody = table.querySelector('tbody');
        const trs = [...tbody.children];
        const headH = thead.getBoundingClientRect().height;
        const rowHs = trs.map((r) => r.getBoundingClientRect().height);
        const extra = items[i].h - headH - rowHs.reduce((t, x) => t + x, 0);
        rowChunks(headH, rowHs, Math.max(0, extra), H - aboveOf(its, its.length - 1), H).forEach(([a, b], k) => {
          const el = h('div', { class: 'xm-scroll', tabindex: '0' }, [h('table', { class: table.getAttribute('class') }, [
            k ? thead.cloneNode(true) : thead, h('tbody', {}, trs.slice(a, b))])]);
          if (u.el.hasAttribute('data-part')) el.setAttribute('data-part', u.el.getAttribute('data-part'));
          const v = Object.assign({}, u, { el, keep: k ? false : u.keep });
          list.push(v); its.push(measure(v));
        });
      });
      list.forEach((u, i) => u.el.setAttribute('data-u', String(i)));
      us = list; items = its;
    }
    doc.body.removeChild(probe.box);
    const pl = layout(items, H, { gap, noteH });
    clear(container);
    pl.forEach((pg, k) => {
      const s = sheet(pg.rot);
      if (pg.rot) {
        const u = us[pg.i];
        const rot = h('div', { class: 'xm-rot' }, [u.label ? rotLabel(u.label) : null, u.el]);
        rot.style.width = `${H}px`;
        rot.style.height = `${W}px`;
        rot.style.transform = `translateY(${H}px) rotate(-90deg)`;
        const im = u.el.querySelector('img');
        if (im) im.style.maxHeight = `${Math.floor(W - (u.label ? labelH + gap : 0) - (titleH.get(u) || 0))}px`;
        s.body.appendChild(rot);
      } else {
        for (const x of pg.items) s.body.appendChild('note' in x ? note(x.note) : us[x.i].el);
      }
      s.foot.appendChild(h('span', {}, [ctx.foot || '']));
      if (pg.rot) s.foot.appendChild(h('span', { class: 'xm-turn' }, [t('exam.head.rotated')]));
      s.foot.appendChild(h('span', {}, [t('exam.head.page', { p: k + 1, n: pl.length })]));
      container.appendChild(s.box);
    });
    return pl.length;
  }

  const api = { render, units, layout, rowChunks, pages, svgSize, gridSvg, WIDE, BOX_LINE };
  root.PNL = root.PNL || {};
  root.PNL.examView = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
