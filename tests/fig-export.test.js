'use strict';
// fig-export: lo que se prueba sin navegador (spec f5d-exportar-figuras, AC3; plan §0 y §3; T003). El árbol desde el DOM,
// el SVG, el PNG, la descarga y el portapapeles se prueban en el navegador (tests/browser/run.js, sección «F5d T003»).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const X = require('../js/fig-export.js');

test('F5d T003 · AC3: el mapa de colores del tema oscuro al claro sale de css/styles.css: cada color de los tokens oscuros va a su pareja clara', () => {
  const css = fs.readFileSync(path.join(__dirname, '..', 'css', 'styles.css'), 'utf8');
  const map = X.themeMap(css);
  // --card, --ink, --edge, --critical, --accent y --line.
  assert.equal(map.get('rgb(32, 32, 30)'), 'rgb(255, 255, 255)');
  assert.equal(map.get('rgb(236, 235, 230)'), 'rgb(29, 29, 27)');
  assert.equal(map.get('rgb(143, 141, 134)'), 'rgb(138, 136, 129)');
  assert.equal(map.get('rgb(255, 138, 122)'), 'rgb(163, 39, 29)');
  assert.equal(map.get('rgb(125, 183, 224)'), 'rgb(31, 95, 139)');
  assert.equal(map.get('rgb(58, 57, 53)'), 'rgb(216, 214, 207)');
  // Todos los tokens de color que tienen pareja.
  assert.ok(map.size >= 20, String(map.size));
  for (const [k, v] of map) assert.match(k + v, /^rgb\(\d+, \d+, \d+\)rgb\(\d+, \d+, \d+\)$/);
});

test('F5d T003: themeMap no se equivoca con hojas sin tema oscuro o con colores cortos', () => {
  assert.equal(X.themeMap(':root { --a: #fff; }').size, 0);
  const m = X.themeMap(':root { --a: #fff; --b: #123; --c: 2px; }\n@media (prefers-color-scheme: dark) {\n  :root { --a: #000; --b: #321; --c: 3px; }\n}');
  assert.deepEqual([...m], [['rgb(0, 0, 0)', 'rgb(255, 255, 255)'], ['rgb(51, 34, 17)', 'rgb(17, 34, 51)']]);
});

test('F5d T003: el nombre de cada archivo (pnl-figura-proyecto-estado.ext)', () => {
  assert.equal(X.fileName('roy', 'ej6', 'solved', 'tex'), 'pnl-roy-ej6-resuelta.tex');
  assert.equal(X.fileName('pert', null, 'blank', 'svg'), 'pnl-pert-tabla-blanco.svg');
  assert.equal(X.fileName('gantt', 'ej4', 'blank', 'png'), 'pnl-gantt-ej4-blanco.png');
});
