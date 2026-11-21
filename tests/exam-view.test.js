'use strict';
// views/exam-view: los bloques de los documentos de core/exam → DOM (spec f3f-examen-imprimible, AC9–AC11, AC15 y AC16;
// plan P2; T010; tableros 107 y 110–113). Sin innerHTML (constitución, 22): todo texto con textContent; los dibujos SVG,
// el QR y las rejillas, como <img src="data:image/svg+xml;base64,…"> con su texto alternativo (como «Ejercicios»).
// Se prueba con un DOM falso, como question-view.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const I = require('../js/i18n.js');
require('../js/i18n-exam.js');
require('../js/dom.js');
require('../js/core/moodle.js');
const QR = require('../js/core/qr.js');
const EV = require('../js/views/exam-view.js');

// ---------- DOM falso ----------
function node(tag) {
  return {
    tag, attrs: {}, children: [], className: '', style: {}, _text: null, listeners: {},
    setAttribute(k, v) { this.attrs[k] = String(v); },
    getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; },
    addEventListener(k, f) { this.listeners[k] = f; },
    appendChild(c) { this.children.push(c); c.parent = this; return c; },
    removeChild(c) { this.children.splice(this.children.indexOf(c), 1); return c; },
    get firstChild() { return this.children[0] || null; },
    set textContent(v) { this.children = []; this._text = String(v); },
    get textContent() { return this._text != null ? this._text : this.children.map((c) => c.textContent).join(''); },
    set innerHTML(v) { throw new Error('innerHTML'); },
  };
}
global.document = {
  createElement: (tag) => node(tag),
  createTextNode: (s) => ({ tag: '#text', textContent: String(s), children: [] }),
};
const all = (n, pred) => [n].concat(...(n.children || []).map((c) => all(c, pred))).filter(pred);
const byTag = (n, tag) => all(n, (x) => x.tag === tag);
const decode = (src) => Buffer.from(src.replace(/^data:image\/svg\+xml;base64,/, ''), 'base64').toString('utf8');

const ctxOf = (lang, extra) => Object.assign({ lang, t: (k, p) => I.t(lang, k, p), qr: (text) => QR.svg(QR.encode(text, { ecc: 'M' }), { title: 'QR' }) }, extra || {});
const draw = (blocks, lang, extra) => { const box = node('div'); EV.render(box, blocks, ctxOf(lang || 'es', extra)); return box; };

test('F3f T010 · exam-view no usa innerHTML ni insertAdjacentHTML ni document.write', () => {
  const src = fs.readFileSync(path.join(ROOT, 'js', 'views', 'exam-view.js'), 'utf8');
  assert.doesNotMatch(src, /innerHTML|outerHTML|insertAdjacentHTML|document\.write/);
});

test('F3f T010 · párrafos, encabezados, citas y saltos; el texto entra como texto (<script> no se ejecuta)', () => {
  const box = draw([{ p: 'Un proyecto <script>alert(1)</script>' }, { h: 'Datos' }, { quote: ['Primera línea.', 'Segunda.'] }, { page: true }]);
  assert.deepEqual(box.children.map((c) => c.tag), ['p', 'h3', 'blockquote', 'div']);
  assert.equal(box.children[0].textContent, 'Un proyecto <script>alert(1)</script>');
  assert.equal(byTag(box, 'script').length, 0);
  assert.deepEqual(byTag(box.children[2], 'p').map((p) => p.textContent), ['Primera línea.', 'Segunda.']);
  assert.equal(box.children[3].className, 'xm-break');
  assert.equal(box.children[3].attrs['aria-hidden'], 'true');
  // Volver a pintar vacía el contenedor.
  EV.render(box, [{ p: 'Otra' }], ctxOf('es'));
  assert.equal(box.children.length, 1);
});

test('F3f T010 · marcas de parte numeradas con sus puntos y apartados de la rúbrica con los suyos (ES y EN, coma decimal)', () => {
  const blocks = [{ part: 'times', title: 'Tiempos', pts: 2.5 }, { item: 'times', part: 'times', pts: 1.25 }, { item: 'events', part: 'times', pts: 1.25 }, { part: 'minDummy', title: 'Mínimo de ficticias', pts: 1 }, { item: 'minDummy', part: 'minDummy', pts: 1 }];
  const es = draw(blocks, 'es');
  const h2 = byTag(es, 'h2');
  assert.deepEqual(h2.map((x) => x.textContent), ['Parte 1 · Tiempos(2,5 puntos)', 'Parte 2 · Mínimo de ficticias(1 punto)']);
  assert.ok(h2.every((x) => x.className === 'xm-part'));
  // «Tiempos» tiene un apartado del mismo nombre que la parte (los tiempos de las actividades); «Mínimo de ficticias», ninguno.
  assert.deepEqual(byTag(es, 'h3').map((x) => x.textContent), ['Tiempos de las actividades · (1,25 puntos)', 'Tiempos de los sucesos · (1,25 puntos)', 'Mínimo de ficticias · (1 punto)']);
  const en = draw(blocks, 'en');
  assert.equal(byTag(en, 'h2')[0].textContent, 'Part 1 · Tiempos(2.5 points)');
  assert.equal(byTag(en, 'h3')[1].textContent, 'Event times · (1.25 points)');
});

test('F3f T010 · tablas con encabezados de columna y de fila; las celdas para rellenar, vacías', () => {
  const box = draw([{ table: { head: ['Actividad', 'ES', 'EF'], rows: [['A', 0, null], ['B', null, null]] }, fill: true }]);
  const table = byTag(box, 'table')[0];
  assert.ok(/\bxm-table\b/.test(table.className) && /\bxm-fill\b/.test(table.className));
  assert.deepEqual(byTag(table, 'th').map((t) => [t.textContent, t.attrs.scope]), [['Actividad', 'col'], ['ES', 'col'], ['EF', 'col'], ['A', 'row'], ['B', 'row']]);
  const tds = byTag(table, 'td');
  assert.deepEqual(tds.map((t) => t.textContent), ['0', '', '', '']);
  assert.deepEqual(tds.map((t) => t.className), ['', 'xm-blank', 'xm-blank', 'xm-blank']);
  // La tabla se puede desplazar con el teclado si no cabe (como las de la vista previa de Moodle).
  assert.equal(table.parent.attrs.tabindex, '0');
});

test('F3f T010 · un dibujo SVG va como imagen con su texto alternativo; uno ancho lleva la marca de página girada', () => {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="900" height="300"><text>Ñ · ROY</text></svg>';
  const box = draw([{ svg, alt: 'Red ROY del proyecto', wide: true }, { svg: '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="100"></svg>', alt: 'Otra', wide: false }]);
  const imgs = byTag(box, 'img');
  assert.equal(imgs.length, 2);
  assert.equal(decode(imgs[0].attrs.src), svg, 'UTF-8 en base64');
  assert.equal(imgs[0].attrs.alt, 'Red ROY del proyecto');
  assert.ok(/\bxm-wide\b/.test(imgs[0].parent.className));
  assert.ok(!/\bxm-wide\b/.test(imgs[1].parent.className));
  // Sin dibujo (familia aún sin cargar), el texto alternativo a la vista.
  const none = draw([{ svg: null, alt: 'Red PERT', wide: false }]);
  assert.equal(byTag(none, 'img').length, 0);
  assert.equal(none.children[0].textContent, 'Red PERT');
});

test('F3f T010 · recuadros para las cuentas y rejillas de puntos del tamaño pedido (H2), con su texto alternativo', () => {
  const box = draw([{ box: 4 }, { grid: 'aon', w: 1080, h: 480 }, { grid: 'aoa', w: 680, h: 360 }]);
  const [b, g1, g2] = box.children;
  assert.equal(b.className, 'xm-box');
  assert.equal(b.style.height, `${4 * EV.BOX_LINE}px`);
  const imgs = byTag(box, 'img');
  assert.equal(imgs[0].attrs.alt, I.t('es', 'exam.view.gridAon'));
  assert.equal(imgs[1].attrs.alt, I.t('es', 'exam.view.gridAoa'));
  assert.equal(imgs[0].attrs.width, '1080'); assert.equal(imgs[0].attrs.height, '480');
  const s = decode(imgs[0].attrs.src);
  assert.match(s, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" width="1080" height="480"/);
  assert.match(s, /<pattern/);
  assert.ok(/\bxm-wide\b/.test(g1.className), 'más de 829 px: página girada');
  assert.ok(!/\bxm-wide\b/.test(g2.className));
});

test('F3f T010 · el ejemplo de error consecuente, en su recuadro', () => {
  const box = draw([{ consequent: { kind: 'calc' }, p: 'Ejemplo de este modelo: …' }]);
  assert.equal(box.children[0].className, 'xm-consequent');
  assert.equal(box.children[0].textContent, 'Ejemplo de este modelo: …');
});

test('F3f T010 AC11 · el enlace del alumno con su QR (core/qr) y el texto del enlace; el QR, con su alternativa', () => {
  const link = 'https://josemagalan.github.io/project-network-lab/cpm.html#v=ex&xk=calc&lv=medium&sd=7&lang=es';
  const box = draw([{ link }]);
  const img = byTag(box, 'img')[0];
  assert.equal(decode(img.attrs.src), QR.svg(QR.encode(link, { ecc: 'M' }), { title: 'QR' }));
  assert.equal(img.attrs.alt, I.t('es', 'exam.view.qr', { url: link }));
  const a = byTag(box, 'a')[0];
  assert.equal(a.attrs.href, link); assert.equal(a.textContent, link);
  assert.equal(a.attrs.rel, 'noopener'); assert.equal(a.attrs.target, '_blank');
  // T012: la frase y el enlace, en el mismo párrafo (en la vista previa a escala, el enlace es texto corrido: WCAG 2.5.8).
  const para = byTag(box, 'p').find((p) => byTag(p, 'a').length);
  assert.equal(para.textContent, `${I.t('es', 'exam.head.link')} ${link}`);
  assert.ok(byTag(para, 'span').some((x) => x.textContent === I.t('es', 'exam.head.link')));
});

test('F3f T010 · anexos: la tabla de la normal (si está su familia) y la hoja para dibujar', () => {
  const rows = () => [{ z0: 0, p: Array.from({ length: 10 }, (_, j) => 0.5 + j / 100) }, { z0: 0.1, p: Array.from({ length: 10 }, () => 0.54) }];
  const box = draw([{ annex: 'normal' }, { annex: 'grid', w: 880, h: 420 }], 'es', { normal: rows });
  const h2 = byTag(box, 'h2').map((x) => x.textContent);
  assert.deepEqual(h2, [I.t('es', 'exam.head.normalTitle'), I.t('es', 'exam.head.gridSheet')]);
  const t = byTag(box, 'table')[0];
  assert.deepEqual(byTag(t, 'thead')[0].children[0].children.map((x) => x.textContent), ['z', '0,00', '0,01', '0,02', '0,03', '0,04', '0,05', '0,06', '0,07', '0,08', '0,09']);
  assert.deepEqual(byTag(t, 'tbody')[0].children[1].children.slice(0, 2).map((x) => x.textContent), ['0,1', '0,5400']);
  assert.equal(byTag(box, 'img')[0].attrs.alt, I.t('es', 'exam.head.gridSheet'));
  // Sin la familia de la tabla, solo la hoja para dibujar.
  const no = draw([{ annex: 'normal' }, { annex: 'grid', w: 880, h: 420 }], 'en');
  assert.deepEqual(byTag(no, 'h2').map((x) => x.textContent), [I.t('en', 'exam.head.gridSheet')]);
});

test('F3f T010 · un bloque desconocido no se pinta y no rompe el resto', () => {
  const box = draw([{ nada: 1 }, { p: 'Sigue' }]);
  assert.deepEqual(box.children.map((c) => c.textContent), ['Sigue']);
});

test('F3f T011 · la cabecera del enunciado (asignatura, convocatoria, fecha, duración, nombre y DNI, instrucciones) y el título de la solución y de la rúbrica, como texto', () => {
  const head = { subject: '<b>OGP</b>', call: 'Ordinaria', date: '19/01/2027', duration: '2 h', instructions: '' };
  const box = draw([{ head, id: true, instructions: 'Responde aquí.' }, { title: 'Solución' }]);
  const [hd, title] = box.children;
  assert.equal(hd.className, 'xm-headbox');
  assert.equal(byTag(hd, 'strong')[0].textContent, '<b>OGP</b>');
  assert.ok(byTag(hd, 'span').some((s) => s.textContent === 'Ordinaria · 19/01/2027 · 2 h'));
  assert.deepEqual(all(hd, (n) => n.className === 'xm-blankline').map((n) => n.textContent), ['Nombre y apellidos:', 'DNI:']);
  assert.ok(byTag(hd, 'p').some((p) => p.textContent === 'Responde aquí.'));
  assert.equal(title.tag, 'h2'); assert.equal(title.className, 'xm-doctitle'); assert.equal(title.textContent, 'Solución');
  // Sin casillas de nombre ni datos de la asignatura: solo las instrucciones.
  const bare = draw([{ head: { subject: '', call: '', date: '', duration: '', instructions: '' }, id: false, instructions: 'Solo esto.' }]);
  assert.equal(all(bare, (n) => n.className === 'xm-blankline').length, 0);
  assert.equal(byTag(bare, 'strong').length, 0);
  assert.equal(bare.children[0].textContent, 'Solo esto.');
});

// ---------- T012: el papel (plan P2; tableros 110–113) ----------
// units: cada bloque, una pieza con su clase para paginar (pre, part, in, tail, break), si va en su página girada (wide)
// y si no puede quedarse sola al pie de una página (keep: el título, la marca de parte, el apartado, el encabezado y el
// párrafo que presenta su tabla, su recuadro, su rejilla o su dibujo). layout: las piezas en páginas, con su alto medido.

const svgOf = (w, h) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><g font-size="13"><text>x</text></g></svg>`;

test('F3f T012 · units: la clase de cada pieza, lo ancho (más de 829 px) y lo que no se queda solo al pie; el dibujo lleva su ancho y su alto', () => {
  const ctx = { lang: 'es', t: (k, p) => I.t('es', k, p), qr: (s) => QR.svg(QR.encode(s, { ecc: 'M' })), normal: () => [{ z0: 0, p: Array(10).fill(0.5) }] };
  const blocks = [
    { head: { subject: '', call: '', date: '', duration: '', instructions: '' }, id: true, instructions: 'x' }, { title: 'Solución' }, { p: 'Intro' },
    { part: 'roy', title: 'Construir la red ROY', pts: 2 }, { p: 'Dibuja' }, { grid: 'aon', w: 1080, h: 480 },
    { part: 'det', title: 'Detective', pts: 1 }, { p: 'Errores' }, { svg: svgOf(852, 300), alt: 'Red', wide: true }, { table: { head: ['a'], rows: [['A']] } }, { box: 3 },
    { part: 'times', title: 'Tiempos', pts: 2 }, { item: 'times', part: 'times', pts: 1 }, { h: 'Sub' }, { p: 'Calcula' }, { p: 'Otra' }, { svg: svgOf(640, 320), alt: 'Gráfico', wide: false }, { grid: 'aoa', w: 680, h: 360 },
    { page: true }, { link: 'https://x.test/#a' }, { annex: 'normal' }, { annex: 'grid', w: 1000, h: 640 },
  ];
  const us = EV.units(blocks, ctx);
  assert.deepEqual(us.map((u) => u.kind), ['pre', 'pre', 'pre', 'part', 'in', 'in', 'part', 'in', 'in', 'in', 'in', 'part', 'in', 'in', 'in', 'in', 'in', 'in', 'break', 'tail', 'tail', 'tail']);
  assert.deepEqual(us.map((u) => !!u.wide), [false, false, false, false, false, true, false, false, true, false, false, false, false, false, false, false, false, false, false, false, false, true]);
  assert.deepEqual(us.map((u) => !!u.keep), [false, true, false, true, true, false, true, true, false, false, false, true, true, true, false, true, false, false, false, false, false, false]);
  // Cada pieza, un solo elemento (el anexo: su título y su tabla juntos), con su número; las de una parte, con su parte.
  assert.ok(us.every((u, i) => u.el && u.el.attrs['data-u'] === String(i)));
  assert.deepEqual(us.map((u) => u.part), [0, 0, 0, 1, 1, 1, 2, 2, 2, 2, 2, 3, 3, 3, 3, 3, 3, 3, 0, 0, 0, 0]);
  assert.equal(us[5].label, 'Parte 1 · Construir la red ROY');
  assert.equal(us[8].label, 'Parte 2 · Detective');
  assert.equal(byTag(us[20].el, 'h2').length + byTag(us[20].el, 'table').length, 2);
  // Los dibujos, con su ancho y su alto (para medir la página sin esperar a que se carguen).
  const img = byTag(us[8].el, 'img')[0];
  assert.deepEqual([img.attrs.width, img.attrs.height], ['852', '300']);
  assert.deepEqual([byTag(us[16].el, 'img')[0].attrs.width, byTag(us[16].el, 'img')[0].attrs.height], ['640', '320']);
  // La rejilla de la ROY fácil y media (880 px) también va girada; la PERT de 680, no (H2, tamaños del plan).
  assert.deepEqual(EV.units([{ part: 'roy', title: 'R', pts: 1 }, { grid: 'aon', w: 880, h: 420 }, { grid: 'aoa', w: 829, h: 360 }], ctx).map((u) => !!u.wide), [false, true, false]);
  // render pinta lo mismo seguido (sin páginas).
  const box = draw(blocks.slice(3, 6));
  assert.deepEqual(box.children.map((c) => c.tag), ['h2', 'p', 'p']);
});

const it = (h, kind = 'in', o = {}) => Object.assign({ h, kind }, o);
const shape = (pages) => pages.map((p) => (p.rot ? `R${p.i}` : p.items.map((x) => ('note' in x ? `n${x.note}` : String(x.i))).join(' ')));

test('F3f T012 · layout: cada parte empieza donde cabe entera; si no cabe, en una página nueva; con el hueco entre piezas', () => {
  const O = { gap: 10, noteH: 20 };
  // 0 pre (100) · parte 1: 1, 2 (30 + 500) · parte 2: 3, 4, 5 (30 + 200 + 190): no cabe en lo que queda → página nueva.
  const items = [it(100, 'pre'), it(30, 'part', { keep: true }), it(500), it(30, 'part', { keep: true }), it(200), it(190)];
  assert.deepEqual(shape(EV.layout(items, 1000, O)), ['0 1 2', '3 4 5']);
  // Justo: 100 + 30 + 500 + 30 + 200 + 190 + 5 huecos de 10 = 1100 → cabe en 1100 y no en 1099.
  assert.deepEqual(shape(EV.layout(items, 1100, O)), ['0 1 2 3 4 5']);
  assert.deepEqual(shape(EV.layout(items, 1099, O)), ['0 1 2', '3 4 5']);
});

test('F3f T012 · layout: una parte más alta que una página empieza en una nueva y sigue pieza a pieza, sin dejar sola al pie la que presenta a la siguiente', () => {
  const O = { gap: 0, noteH: 20 };
  const items = [it(500, 'in'), it(50, 'part', { keep: true }), it(400), it(300, 'in', { keep: true }), it(300), it(200)];
  // Tras otra parte (0 y 1), la parte 2 (1250) no cabe en ninguna página: empieza en la 2; 4 presenta a 5 y no caben
  // juntas tras 2 y 3 (450 + 600).
  const prev = [it(50, 'part', { keep: true }), it(450)];
  assert.deepEqual(shape(EV.layout([...prev, ...items.slice(1)], 1000, O)), ['0 1', '2 3', '4 5 6']);
  // En la primera página, si aún está vacía, no se salta; si solo lleva la cabecera o el título (pre), tampoco.
  assert.deepEqual(shape(EV.layout(items.slice(1), 1000, O)), ['0 1', '2 3 4']);
  assert.deepEqual(shape(EV.layout([it(80, 'pre'), ...items.slice(1)], 1000, O)), ['0 1 2', '3 4 5']);
  // Pero una parte que cabría entera en una página nueva no se parte por empezar tras la cabecera.
  assert.deepEqual(shape(EV.layout([it(300, 'pre'), it(50, 'part', { keep: true }), it(400), it(300)], 1000, O)), ['0', '1 2 3']);
});

test('F3f T012 · layout: lo ancho deja un aviso en su sitio y va en su página girada justo después de la página del aviso, en orden', () => {
  const O = { gap: 0, noteH: 20 };
  const items = [it(50, 'part', { keep: true }), it(100), it(400, 'in', { wide: true }), it(100), it(50, 'part', { keep: true }), it(500, 'in', { wide: true }), it(300, 'in', { wide: true }), it(900)];
  // Parte 1: 50 + 100 + aviso + 100 = 270; parte 2: 50 + dos avisos + 900 = 990, que no cabe detrás → página nueva.
  assert.deepEqual(shape(EV.layout(items, 1000, O)), ['0 1 n2 3', 'R2', '4 n5 n6 7', 'R5', 'R6']);
});

test('F3f T012 · layout: los anexos empiezan en una página nueva (el ancho, en su página girada y sin aviso, sin cambiar el orden); un salto no deja páginas vacías', () => {
  const O = { gap: 0, noteH: 20 };
  const items = [it(10, 'break'), it(50, 'part', { keep: true }), it(100), it(10, 'break'), it(10, 'break'), it(50, 'part', { keep: true }), it(100), it(80, 'tail'), it(600, 'tail'), it(700, 'tail', { wide: true }), it(300, 'tail')];
  assert.deepEqual(shape(EV.layout(items, 1000, O)), ['1 2', '5 6', '7 8', 'R9', '10']);
});

test('F3f T012 · layout: una pieza más alta que la página va sola en la suya y se marca (over)', () => {
  const pages = EV.layout([it(100, 'pre'), it(1200), it(100)], 1000, { gap: 0, noteH: 20 });
  assert.deepEqual(shape(pages), ['0', '1', '2']);
  assert.deepEqual(pages.map((p) => !!p.over), [false, true, false]);
});
