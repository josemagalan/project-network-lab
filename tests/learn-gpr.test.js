'use strict';
// F5a T014: «Aprende más» de «Precedencias generalizadas» (js/learn-gpr.js, grupo gl): las mismas secciones en los dos
// idiomas, las seis clases con sus nombres de i18n-gpr, ROSEBUD contado como decidió el autor y las referencias de la spec.
const test = require('node:test');
const assert = require('node:assert/strict');
const L = require('../js/learn-gpr.js');
const I = require('../js/i18n.js');
require('../js/i18n-gpr.js');

test('F5a T014: «Aprende más» tiene las mismas secciones y párrafos en español e inglés', () => {
  assert.equal(L.es.sections.length, L.en.sections.length);
  L.es.sections.forEach((s, i) => assert.equal(s.paras.length, L.en.sections[i].paras.length, s.head));
  assert.equal(L.refs.es.length, L.refs.en.length);
  assert.ok(L.es.title && L.en.title);
});

test('F5a T014: cuenta las cuatro relaciones, ROY frente a PERT, las seis clases, ROSEBUD, las dos holguras y sus referencias', () => {
  const all = (lang) => L[lang].sections.flatMap((s) => [s.head, ...s.paras]).join(' ');
  const es = all('es');
  for (const k of ['normal', 'reverse', 'neutral', 'bicritical', 'incNormal', 'decReverse']) {
    assert.ok(es.includes(I.t('es', `gpr.cls.${k}`)), k);
    assert.ok(all('en').includes(I.t('en', `gpr.cls.${k}`)), k);
  }
  for (const w of ['FC', 'CC', 'FF', 'CF', 'ROSEBUD', 'holgura independiente', 'trozos']) assert.ok(es.includes(w), w);
  assert.ok(/Y es neutra/.test(es));
  const refs = L.refs.es.join(' ');
  for (const w of ['Roy', 'Domínguez Machuca', 'Nicholas', 'Wiest', 'Elmaghraby', 'Valls']) assert.ok(refs.includes(w), w);
});
