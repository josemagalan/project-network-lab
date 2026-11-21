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
 * render(contenedor, bloques, ctx), ctx = { lang, t(clave, parámetros), qr(texto) → SVG, normal() → filas }.
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

  function render(container, blocks, ctx) {
    const { h, clear } = root.PNL.dom;
    const lang = ctx.lang === 'en' ? 'en' : 'es';
    const t = ctx.t;
    const pts = (n) => (n === 1 ? t('exam.head.point') : t('exam.head.points', { n: num(lang, n) }));
    const img = (svg, alt, w, hh) => h('img', { src: dataUri(svg), alt, width: w, height: hh });
    const fig = (child, wide) => h('p', { class: wide ? 'xm-fig xm-wide' : 'xm-fig' }, [child]);
    const grid = (w, hh, alt) => fig(img(gridSvg(w, hh), alt, w, hh), w > WIDE);
    const table = (head, rows, cls) => h('div', { class: 'xm-scroll', tabindex: '0' }, [h('table', { class: cls }, [
      h('thead', {}, [h('tr', {}, head.map((x) => h('th', { scope: 'col' }, [String(x)])))]),
      h('tbody', {}, rows.map((r) => h('tr', {}, r.map((c, i) => (i === 0 ? h('th', { scope: 'row' }, [String(c)])
        : c == null ? h('td', { class: 'xm-blank' }, []) : h('td', {}, [String(c)])))))),
    ])]);
    let part = 0;
    const out = [];
    for (const b of blocks || []) {
      // La cabecera del enunciado (T011): asignatura, convocatoria, fecha y duración; nombre y DNI; instrucciones.
      if ('head' in b) {
        const hd = b.head || {};
        const when = ['call', 'date', 'duration'].map((k) => hd[k]).filter(Boolean).join(' · ');
        out.push(h('div', { class: 'xm-headbox' }, [
          hd.subject || when ? h('div', { class: 'xm-headrow' }, [hd.subject ? h('strong', {}, [hd.subject]) : null, when ? h('span', {}, [when]) : null]) : null,
          b.id ? h('div', { class: 'xm-idrow' }, [h('span', { class: 'xm-blankline' }, [`${t('exam.head.name')}:`]), h('span', { class: 'xm-blankline' }, [`${t('exam.head.id')}:`])]) : null,
          h('p', { class: 'xm-instr' }, [b.instructions]),
        ]));
      // Los apartados también llevan su parte: van antes que las marcas de parte.
      } else if ('item' in b) {
        // Las partes sin apartados (enunciado, redes, detective…) tienen uno solo, con el nombre de la parte.
        const key = `exam.item.${b.item}`;
        const name = t(key) !== key ? t(key) : t(`exam.part.${b.part}`);
        out.push(h('h3', { class: 'xm-item' }, [`${name} · ${pts(b.pts)}`]));
      } else if ('part' in b) {
        part++;
        out.push(h('h2', { class: 'xm-part' }, [h('span', {}, [t('exam.head.partTitle', { i: part, t: b.title })]), h('span', { class: 'xm-pts' }, [pts(b.pts)])]));
      } else if ('title' in b) {
        // El título de la solución y de la rúbrica (las marcas de parte también llevan title: van antes).
        out.push(h('h2', { class: 'xm-doctitle' }, [b.title]));
      } else if ('consequent' in b) {
        out.push(h('div', { class: 'xm-consequent' }, [h('p', {}, [b.p])]));
      } else if ('annex' in b) {
        if (b.annex === 'normal') {
          const rows = ctx.normal ? ctx.normal() : null;
          if (!rows) continue;
          const f = (v, k) => num(lang, v.toFixed(k));
          out.push(h('h2', { class: 'xm-annex' }, [t('exam.head.normalTitle')]),
            table(['z', ...Array.from({ length: 10 }, (_, j) => f(j / 100, 2))], rows.map((r) => [f(r.z0, 1), ...r.p.map((p) => f(p, 4))]), 'xm-table xm-normal'));
        } else if (b.annex === 'grid') {
          out.push(h('h2', { class: 'xm-annex' }, [t('exam.head.gridSheet')]), grid(b.w, b.h, t('exam.head.gridSheet')));
        }
      } else if ('link' in b) {
        const qr = ctx.qr ? ctx.qr(b.link) : null;
        out.push(h('div', { class: 'xm-link' }, [
          qr ? h('img', { class: 'xm-qr', src: dataUri(qr), alt: t('exam.view.qr', { url: b.link }) }) : null,
          h('div', {}, [h('p', {}, [t('exam.head.link')]), h('p', { class: 'xm-url' }, [h('a', { href: b.link, target: '_blank', rel: 'noopener' }, [b.link])])]),
        ]));
      } else if ('grid' in b) {
        out.push(grid(b.w, b.h, t(b.grid === 'aoa' ? 'exam.view.gridAoa' : 'exam.view.gridAon')));
      } else if ('svg' in b) {
        out.push(b.svg ? fig(h('img', { src: dataUri(b.svg), alt: b.alt }), !!b.wide) : h('p', { class: 'xm-alt' }, [b.alt]));
      } else if ('table' in b) {
        out.push(table(b.table.head, b.table.rows, b.fill ? 'xm-table xm-fill' : 'xm-table'));
      } else if ('box' in b) {
        const el = h('div', { class: 'xm-box' }, []);
        el.style.height = `${b.box * BOX_LINE}px`;
        out.push(el);
      } else if ('quote' in b) {
        out.push(h('blockquote', { class: 'xm-quote' }, b.quote.map((x) => h('p', {}, [x]))));
      } else if ('page' in b) {
        out.push(h('div', { class: 'xm-break', 'aria-hidden': 'true' }, []));
      } else if ('h' in b) {
        out.push(h('h3', { class: 'xm-h' }, [b.h]));
      } else if ('p' in b) {
        out.push(h('p', {}, [b.p]));
      }
    }
    clear(container);
    for (const el of out) container.appendChild(el);
    return container;
  }

  const api = { render, gridSvg, WIDE, BOX_LINE };
  root.PNL = root.PNL || {};
  root.PNL.examView = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
