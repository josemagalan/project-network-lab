'use strict';
// Comprobaciones básicas del esqueleto (constitución, principios 2, 3 y 29).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const pkg = require('../package.json');
const html = fs.readFileSync(path.join(ROOT, 'cpm.html'), 'utf8');

test('package.json no tiene dependencias (principio 3)', () => {
  assert.equal(pkg.dependencies, undefined);
  assert.equal(pkg.devDependencies, undefined);
});

test('cpm.html solo carga scripts locales que existen, sin módulos ES ni CDN (principios 2 y 29)', () => {
  const srcs = [...html.matchAll(/<script\b([^>]*)>/g)].map((m) => m[1]);
  assert.ok(srcs.length > 0);
  for (const attrs of srcs) {
    assert.doesNotMatch(attrs, /type=["']module["']/, 'sin módulos ES');
    const src = (attrs.match(/src=["']([^"']+)["']/) || [])[1];
    assert.ok(src, 'sin scripts en línea');
    assert.doesNotMatch(src, /^(https?:)?\/\//, `sin CDN: ${src}`);
    assert.ok(fs.existsSync(path.join(ROOT, src)), `existe ${src}`);
  }
});

// Mantenimiento (presupuesto de 1 MB, principio 27): de D3 v7 solo se sirve su módulo de selección, d3-selection v3
// (el mismo que va dentro de D3 v7.9.0), con su licencia; D3 completo eran 280 KB en cada vista de cpm.html.
test('D3: en vendor/ va solo d3-selection v3, con su licencia, y pesa menos de 20 KB', () => {
  const file = path.join(ROOT, 'vendor', 'd3-selection.min.js');
  const d3 = fs.readFileSync(file, 'utf8');
  assert.match(d3.slice(0, 80), /d3js\.org\/d3-selection\/ v3\./);
  assert.ok(fs.statSync(file).size < 20 * 1024, `${fs.statSync(file).size} bytes`);
  assert.match(fs.readFileSync(path.join(ROOT, 'vendor', 'd3-selection.LICENSE.txt'), 'utf8'), /Mike Bostock/);
  assert.equal(fs.existsSync(path.join(ROOT, 'vendor', 'd3.min.js')), false, 'D3 completo ya no se sirve');
});

test('D3: el código solo usa funciones que trae d3-selection (d3.select, d3.selectAll…)', () => {
  const sel = require('../vendor/d3-selection.min.js');
  const used = new Map();
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const f = path.join(dir, e.name);
      if (e.isDirectory()) walk(f);
      else if (e.name.endsWith('.js')) for (const m of fs.readFileSync(f, 'utf8').matchAll(/\bd3\.([A-Za-z_$][\w$]*)/g)) used.set(m[1], path.relative(ROOT, f));
    }
  };
  walk(path.join(ROOT, 'js'));
  assert.ok(used.has('select'), 'las vistas dibujan con d3.select');
  for (const [name, f] of used) assert.equal(typeof sel[name], 'function', `d3.${name} (${f}) no está en d3-selection`);
});

test('i18n carga en Node', () => {
  const i18n = require('../js/i18n.js');
  assert.equal(i18n.t('en', 'app.title'), 'Project Network Lab');
});
