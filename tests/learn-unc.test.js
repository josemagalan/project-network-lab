'use strict';
// learn-unc (F4a, T012): «Aprende más» de M5 y M6 y el panel de supuestos, en su propio grupo bajo demanda.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const LU = require('../js/learn-unc.js');
const T = require('../js/core/threept.js');

test('T012: los dos temas, en los dos idiomas, con las mismas secciones y párrafos; ninguno vacío', () => {
  for (const topic of ['m5', 'm6']) {
    const es = LU.es[topic]; const en = LU.en[topic];
    assert.ok(es.title.trim() && en.title.trim());
    assert.equal(es.sections.length, en.sections.length, topic);
    es.sections.forEach((s, i) => {
      assert.equal(s.paras.length, en.sections[i].paras.length, `${topic} ${i}`);
      for (const x of [s.head, en.sections[i].head, ...s.paras, ...en.sections[i].paras]) assert.ok(String(x).trim(), `${topic} ${i}`);
    });
  }
  assert.ok(LU.refs.es.length >= 5);
  assert.equal(LU.refs.es.length, LU.refs.en.length);
});

test('T012: M5 explica las dos betas, la triangular y los supuestos; M6, las tres aproximaciones, la fusión, los límites y la simulación', () => {
  const all = (lang, topic) => LU[lang][topic].sections.map((s) => [s.head, ...s.paras].join(' ')).join(' ');
  assert.match(all('es', 'm5'), /beta-PERT/); assert.match(all('es', 'm5'), /beta clásica/); assert.match(all('es', 'm5'), /triangular/);
  assert.match(all('es', 'm5'), /[Ii]ndependencia/);
  assert.match(all('es', 'm6'), /tres aproximaciones/); assert.match(all('es', 'm6'), /fusión/); assert.match(all('es', 'm6'), /[Cc]orrelación/);
  assert.match(all('en', 'm6'), /three approximations/); assert.match(all('en', 'm6'), /merge/);
});

test('T012: las cifras de la actividad A de Klastorin que cita el texto son las del núcleo', () => {
  const d = { a: 2, m: 6, b: 14 };
  const f = (x) => x.toFixed(2);
  const es = LU.es.m5.sections.map((s) => s.paras.join(' ')).join(' ');
  const en = LU.en.m5.sections.map((s) => s.paras.join(' ')).join(' ');
  for (const v of [T.exam(d).var, T.moments('pert', d).var, T.moments('classic', d).mean, T.moments('tri', d).mean, T.exam(d).mean]) {
    assert.ok(es.includes(f(v).replace('.', ',')), `ES ${f(v)}`);
    assert.ok(en.includes(f(v)), `EN ${f(v)}`);
  }
});

test('T012: learn-unc va en su propio grupo bajo demanda, no en cpm.html ni en el grupo de la pestaña', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'cpm.html'), 'utf8');
  const app = fs.readFileSync(path.join(__dirname, '..', 'js', 'app.js'), 'utf8');
  assert.doesNotMatch(html, /learn-unc/);
  assert.match(app, /ul: \['js\/learn-unc\.js'\]/);
  assert.doesNotMatch(app.match(/un: \[[^\]]*\]/)[0], /learn-unc/);
});
