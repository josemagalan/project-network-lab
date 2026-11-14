'use strict';
// learn-m7 (F4b, T012): «Aprende más» de M7, en su propio grupo bajo demanda (l7), con las cifras del núcleo.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const L7 = require('../js/learn-m7.js');
const MC = require('../js/core/mc.js');
const X = require('../js/core/stochex.js');

const all = (lang) => L7[lang].m7.sections.map((s) => [s.head, ...s.paras].join(' ')).join(' ');
function modelOf(id) {
  const ex = X.get(id); const idx = new Map(ex.rows.map((r, i) => [r.id, i]));
  return { acts: ex.rows.map((r) => ({ id: r.id, preds: r.links ? r.links.split(',').map((s) => idx.get(s.trim())) : [],
    dist: r.disc ? { kind: 'disc', x: r.disc.x, p: r.disc.p } : { kind: 'pert', a: r.a, m: r.m, b: r.b } })) };
}
// Una cifra tal como la escribe el texto: con coma en español y con punto en inglés.
const has = (v, digits) => {
  const x = v.toFixed(digits);
  assert.ok(all('es').includes(x.replace('.', ',')), `ES ${x}`);
  assert.ok(all('en').includes(x), `EN ${x}`);
};

test('T012: el tema de M7, en los dos idiomas, con las mismas secciones y párrafos; ninguno vacío', () => {
  const es = L7.es.m7; const en = L7.en.m7;
  assert.ok(es.title.trim() && en.title.trim());
  assert.equal(es.sections.length, en.sections.length);
  es.sections.forEach((s, i) => {
    assert.equal(s.paras.length, en.sections[i].paras.length, `sección ${i}`);
    for (const x of [s.head, en.sections[i].head, ...s.paras, ...en.sections[i].paras]) assert.ok(String(x).trim(), `sección ${i}`);
  });
  assert.equal(L7.refs.es.length, L7.refs.en.length);
  assert.ok(L7.refs.es.length >= 6);
});

test('T012: explica lo que pide la spec (criticidad, empates, crucialidad, significación, error, Schoenberger y Python)', () => {
  const es = all('es'); const en = all('en');
  for (const re of [/Van Slyke/, /Dodin y Elmaghraby/, /61,1 %/, /crucialidad/, /Pearson/, /Spearman/, /significación/, /√n/, /Schoenberger/, /pnl_montecarlo\.py/, /--seed/, /tornado en espejo/]) assert.match(es, re);
  for (const re of [/Van Slyke/, /Dodin and Elmaghraby/, /61\.1%/, /cruciality/, /significance/, /Schoenberger/, /pnl_montecarlo\.py/, /mirror tornado/]) assert.match(en, re);
  // Las referencias citadas en el texto están en la lista.
  for (const who of ['Van Slyke', 'Dodin', 'Schoenberger', 'Williams, T. M. (1992)', 'Williams, T. (2002)', 'Klastorin', 'Acebes']) assert.ok(L7.refs.es.some((r) => r.includes(who)) && L7.refs.en.some((r) => r.includes(who)), who);
});

test('T012: las cifras del ejemplo discreto de Klastorin que cita el texto son las del núcleo', () => {
  const ex = MC.exact(modelOf('kd'));
  has(ex.mean, 3);                                    // 23,248
  has(ex.crit[2], 3);                                 // C = 0,660
  const pc = ex.paths.list.reduce((s, p) => s + p.crit, 0);
  has(pc, 3);                                         // los caminos suman 1,048
  // Sin los empates (la diapositiva, con 1/3 exacto): C = 0,660 − 0,048 = 0,612.
  has(ex.crit[2] - 0.8 * 0.2 * 0.3, 3);
  has(0.8 * 0.2 * 0.3, 3);
  ex.sig.forEach((v) => has(v, 3));                   // 0,603 · 0,743 · 0,817 · 0,790
  // Y el texto no da la cifra de la diapositiva como la del laboratorio: 0,611 no aparece.
  assert.doesNotMatch(all('es'), /0,611/);
});

test('T012: las crucialidades de los ejemplos de Williams (a)–(c) y (d) son las del núcleo', () => {
  const a = MC.exact(modelOf('wa')); const b = MC.exact(modelOf('wb')); const c = MC.exact(modelOf('wc')); const d = MC.exact(modelOf('wd'));
  for (const ex of [a, b, c]) { assert.equal(ex.crit[0], 0.99); assert.equal(ex.crit[1], 0.01); }
  has(a.cruc[0], 3); has(b.cruc[0], 3); has(c.cruc[0], 3);
  has(a.cruc[1], 5); has(b.cruc[1], 3); has(c.cruc[1], 3);
  assert.deepEqual([d.crit, d.cruc], [[1, 1], [0, 1]]);
});

test('T012: las cuentas del error del Montecarlo y de Schoenberger', () => {
  has(1.96 * Math.sqrt(0.25 / 10000), 4);             // ± 0,0098
  const emax = (pa) => {
    let e = 0;
    [12, 14, 16].forEach((x, i) => [10, 15].forEach((y) => { e += pa[i] * 0.5 * Math.max(x, y); }));
    return e;
  };
  has(emax([0.1, 0.8, 0.1]), 2);         // 14,55
  has(emax([0.3, 0.4, 0.3]), 2);         // 14,65
});

test('T012: learn-m7 va en su propio grupo bajo demanda (l7), no en cpm.html, ni con M7 ni con «Aprende más» de M5 y M6', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'cpm.html'), 'utf8');
  const app = fs.readFileSync(path.join(__dirname, '..', 'js', 'app.js'), 'utf8');
  assert.doesNotMatch(html, /learn-m7/);
  assert.match(app, /l7: \['js\/learn-m7\.js'\]/);
  for (const g of ['un', 'u7', 'u7r', 'ul']) assert.doesNotMatch(app.match(new RegExp(`\\b${g}: \\[[^\\]]*\\]`))[0], /learn-m7/, g);
});
