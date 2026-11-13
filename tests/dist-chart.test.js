'use strict';
// views/dist-chart: la geometría del gráfico de densidades (revisión de nivel 2 de la F4a, F15): barras del
// histograma como densidad, cola sombreada hasta el plazo y líneas verticales en su sitio. Sin navegador: un DOM mínimo.
const test = require('node:test');
const assert = require('node:assert/strict');
const DC = require('../js/views/dist-chart.js');

function fakeDoc() {
  const node = (tag) => ({
    tag, attrs: {}, children: [], style: {}, textContent: '',
    setAttribute(k, v) { this.attrs[k] = String(v); },
    getAttribute(k) { return this.attrs[k]; },
    appendChild(c) { this.children.push(c); return c; },
    removeChild(c) { this.children.splice(this.children.indexOf(c), 1); },
    get firstChild() { return this.children[0] || null; },
  });
  return { createElementNS: (ns, tag) => node(tag), node };
}
const all = (n, pred) => [n].concat(...n.children.map((c) => all(c, pred))).filter(pred);

// Área de dibujo de 100 × 100: PAD izquierda y derecha 14, arriba 18, abajo 26.
const SPEC = { w: 128, h: 144, x: [0, 2], ymax: 1, ticks: [0, 1, 2], fmt: String, label: 'prueba', curves: [] };
function draw(extra) {
  const doc = fakeDoc(); global.document = doc;
  const holder = doc.node('div');
  return DC.render(holder, Object.assign({}, SPEC, extra));
}

test('F4a r1 (F15): las barras del histograma son densidades (c / (n · ancho)) y empiezan en lo + i · ancho', () => {
  const svg = draw({ hist: { lo: 0, width: 0.5, counts: [2, 0, 1, 1], n: 4 } });
  const rects = all(svg, (n) => n.tag === 'rect');
  assert.equal(rects.length, 3, 'la clase vacía no se dibuja');
  // Densidades 1, 0,5 y 0,5: alturas 100, 50 y 50 sobre el eje (y = 118).
  assert.deepEqual(rects.map((r) => [r.attrs.x, r.attrs.y, r.attrs.height]), [['14.0', '18.0', '100.0'], ['64.0', '68.0', '50.0'], ['89.0', '68.0', '50.0']]);
  assert.deepEqual(rects.map((r) => r.attrs.width), ['24.4', '24.4', '24.4']);
});

test('F4a r1 (F15): la cola sombreada llega hasta el plazo (la de la izquierda) y la línea vertical cae en su x', () => {
  const pts = [[0, 0.2], [0.5, 0.4], [1, 0.6], [1.5, 0.4], [2, 0.2]];
  const svg = draw({ curves: [{ pts, cls: 'c-normal' }], shade: { pts, to: 1 }, vlines: [{ x: 1.5, cls: 'v-deadline', label: 'T' }] });
  const shade = all(svg, (n) => n.tag === 'path' && /dc-shade/.test(n.attrs.class))[0];
  // Desde x = 0 (14) hasta x = 1 (64), y vuelta al eje: nada a la derecha del plazo.
  assert.equal(shade.attrs.d, 'M14,118 L14.0,98.0 L39.0,78.0 L64.0,58.0 L64,118 Z');
  const v = all(svg, (n) => n.tag === 'line' && /dc-v /.test(n.attrs.class))[0];
  assert.deepEqual([v.attrs.x1, v.attrs.x2], ['89', '89']);
  const label = all(svg, (n) => n.tag === 'text' && /dc-vlabel/.test(n.attrs.class))[0];
  assert.equal(label.textContent, 'T');
});
