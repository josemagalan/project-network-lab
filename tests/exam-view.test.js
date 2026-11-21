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
  const blocks = [{ part: 'times', title: 'Tiempos', pts: 2.5 }, { item: 'events', part: 'times', pts: 1.25 }, { part: 'minDummy', title: 'Mínimo de ficticias', pts: 1 }, { item: 'minDummy', part: 'minDummy', pts: 1 }];
  const es = draw(blocks, 'es');
  const h2 = byTag(es, 'h2');
  assert.deepEqual(h2.map((x) => x.textContent), ['Parte 1 · Tiempos(2,5 puntos)', 'Parte 2 · Mínimo de ficticias(1 punto)']);
  assert.ok(h2.every((x) => x.className === 'xm-part'));
  assert.deepEqual(byTag(es, 'h3').map((x) => x.textContent), ['Tiempos de los sucesos · (1,25 puntos)', 'Mínimo de ficticias · (1 punto)']);
  const en = draw(blocks, 'en');
  assert.equal(byTag(en, 'h2')[0].textContent, 'Part 1 · Tiempos(2.5 points)');
  assert.equal(byTag(en, 'h3')[0].textContent, 'Event times · (1.25 points)');
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
  assert.ok(byTag(box, 'p').some((p) => p.textContent === I.t('es', 'exam.head.link')));
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
