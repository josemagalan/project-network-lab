'use strict';
// Comprobaciones básicas del esqueleto (constitución, principios 2, 3 y 29).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const pkg = require('../package.json');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

test('package.json no tiene dependencias (principio 3)', () => {
  assert.equal(pkg.dependencies, undefined);
  assert.equal(pkg.devDependencies, undefined);
});

test('index.html solo carga scripts locales que existen, sin módulos ES ni CDN (principios 2 y 29)', () => {
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

test('D3 es la versión 7 y está en vendor/', () => {
  const d3 = fs.readFileSync(path.join(ROOT, 'vendor', 'd3.min.js'), 'utf8');
  assert.match(d3.slice(0, 80), /d3js\.org v7\./);
});

test('i18n carga en Node', () => {
  const i18n = require('../js/i18n.js');
  assert.equal(i18n.t('en', 'app.title'), 'Project Network Lab');
});
