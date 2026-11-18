'use strict';
// learn-ex: «Aprende más» de «Ejercicios» con una sección por tipo (F3e, T012; AC22; plan P8; reserva R1 de T001;
// tablero 99). Las seis secciones, en los dos idiomas con la misma forma; lo que cuentan de la corrección cuadra con el
// núcleo (probgrade, roycheck, detective); los enlaces son de vistas que existen; la del cálculo es la de la F3a.
// El diálogo (pestañas, teclado, carga de cada sección) lo comprueban las pruebas de navegador.
const test = require('node:test');
const assert = require('node:assert/strict');
const U = require('../js/core/urlstate.js');
const PR = require('../js/core/probgrade.js');
const RC = require('../js/core/roycheck.js');
const D = require('../js/core/detective.js');
const I = require('../js/i18n.js');
const LX = require('../js/learn-ex.js');
for (const k of LX.KINDS) require(`../js/learn-ex-${k}.js`);

const text = (k, lang) => LX.section(k, lang).blocks.flatMap((b) => (typeof b === 'string' ? [b] : b[0] === 'h' ? [b[1]] : b[0] === 'table' ? b[1].concat(...b[2]) : b[1].map((x) => x[0]))).join(' ');

test('T012 · una sección por tipo, en los dos idiomas con la misma forma (bloques, tablas y enlaces)', () => {
  assert.deepEqual(LX.KINDS, ['calc', 'roy', 'pert', 'det', 'tcl', 'mc']);
  const shape = (b) => (typeof b === 'string' ? 'p' : b[0] === 'table' ? `t${b[1].length}x${b[2].length}:${b[2].every((r) => r.length === b[1].length)}` : b[0] === 'links' ? JSON.stringify(b[1].map((x) => x[1])) : b[0]);
  for (const k of LX.KINDS) {
    const es = LX.section(k, 'es'); const en = LX.section(k, 'en');
    assert.ok(es && en && es.title && en.title, k);
    assert.deepEqual(es.blocks.map(shape), en.blocks.map(shape), k);
    for (const lang of ['es', 'en']) assert.doesNotMatch(text(k, lang), /\{\w+\}|undefined/, `${k} ${lang}`);
    assert.equal(es.title, I.t('es', `ex.kind.${k}`), 'el título es el nombre del tipo de la barra');
    assert.equal(en.title, I.t('en', `ex.kind.${k}`));
    assert.equal(LX.TX.es.kinds[k], es.title);
    assert.equal(LX.TX.en.kinds[k], en.title);
  }
  assert.equal(LX.section('calc', 'xx'), LX.section('calc', 'es'), 'otro idioma, el español');
  assert.deepEqual(Object.keys(LX.TX.es).sort(), Object.keys(LX.TX.en).sort());
});

test('T012 · el cálculo es el tema de la F3a (antes topics.ex de learn.js), y learn.js ya no lo lleva', () => {
  const calc = LX.section('calc', 'es').blocks;
  assert.equal(calc.length, 8);
  assert.match(calc[0], /^«Ejercicios» genera proyectos nuevos a partir de una semilla/);
  assert.match(LX.section('calc', 'en').blocks[1], /^Carried error:/);
  assert.equal(require('../js/learn.js').topics.ex, undefined);
  // Los textos del diálogo salen de learn-ex, no de la carga común (i18n.js).
  for (const k of ['learnTitle', 'learnMoodle', 'moodle']) assert.equal(I.dict.es.ex[k], undefined, k);
  assert.equal(LX.TX.es.title, 'Aprende más · Ejercicios');
  assert.equal(LX.TX.en.title, 'Learn more · Exercises');
});

test('T012 · lo que cuentan de la corrección cuadra con el núcleo (probgrade, roycheck y detective)', () => {
  const tcl = text('tcl', 'es');
  assert.match(tcl, /tₑ = \(a \+ 4m \+ b\) \/ 6/);
  assert.match(tcl, /σ² = \(\(b − a\) \/ 6\)²/);
  assert.equal(PR.TOL.act, 0.01); assert.equal(PR.TOL.T, 0.05);
  assert.match(tcl, /±0,01 en medias, varianzas y z/);
  assert.match(tcl, /el plazo, ±0,05/);
  const z95 = PR.Z95.map((z) => String(z).replace('.', ','));
  assert.ok(tcl.includes(`z = ${z95.slice(0, -1).join(', ')} y ${z95[z95.length - 1]}`), 'las z del 95 %, las de probgrade');
  const mc = text('mc', 'es');
  assert.equal(PR.TOL.read, 0.05); assert.equal(PR.TOL.disc, 0.001); assert.equal(PR.TOL.rep, 0.001);
  assert.match(mc, /±0,05/);
  assert.match(mc, /±0,001/);
  assert.match(mc, /10 000 réplicas/);
  // ROY: un ciclo deja la nota en el 50 % como mucho.
  const roy = text('roy', 'es');
  assert.match(roy, /como mucho, un 50 %/);
  // PERT: 80 + 20 en el mínimo; 100 − 5k sin bajar de 80; incorrecta, hasta 60.
  const ok = (extra) => RC.scorePert(null, null, { correct: true, extra });
  assert.deepEqual([ok(0), ok(1), ok(9)], [100, 95, 80]);
  assert.equal(RC.pertWrongPct({ hits: 10, total: 10 }), 60);
  const pert = text('pert', 'es');
  assert.match(pert, /100 − 5k, sin bajar de 80/);
  assert.match(pert, /como mucho 60/);
  // Detective: 1, ½ y −½.
  const seeded = { errors: [{ id: 'e1', type: 'royMissing', accept: ['A>B', 'A', 'B'] }, { id: 'e2', type: 'calcES', accept: ['C.ES'] }], count: 2 };
  assert.equal(D.grade(seeded, [{ element: 'A>B', type: 'royMissing' }]).score, 50);
  assert.equal(D.grade(seeded, [{ element: 'A>B', type: 'royFalse' }]).score, 25);
  assert.equal(D.grade(seeded, [{ element: 'A>B', type: 'royMissing' }, { element: 'Z', type: 'royFalse' }]).score, 25);
  assert.match(text('det', 'es'), /1 .*½ .*−½/);
});

test('T012 · los enlaces de «Para repasarlo» abren vistas que existen, en el idioma y la notación del diálogo', () => {
  for (const k of LX.KINDS) {
    for (const b of LX.section(k, 'es').blocks.filter((x) => Array.isArray(x) && x[0] === 'links')) {
      for (const [label, st] of b[1]) {
        const r = U.decode(U.encode(Object.assign(U.defaults(), st, { lang: 'en', nota: 'es' })));
        assert.equal(r.warning, undefined, `${k}: ${label}`);
        for (const key of Object.keys(st)) assert.equal(r.state[key], st[key], `${k}: ${label} ${key}`);
      }
    }
  }
  const um = (k) => LX.section(k, 'es').blocks.find((x) => Array.isArray(x) && x[0] === 'links')[1].map((x) => x[1].um);
  assert.deepEqual(um('tcl'), ['m5', 'm6']);
  assert.deepEqual(um('mc'), ['m7']);
});
