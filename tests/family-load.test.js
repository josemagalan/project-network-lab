'use strict';
// family-load: la carga por familias que comparten moodle.html y examen.html (spec f3f-examen-imprimible, AC17 y AC18;
// plan P6; análisis H5; T010). Sale de moodle-app sin cambiar lo que hace: scripts con async = false en el orden de la
// familia, los que ya están no se piden otra vez (salvo el último, que dice que la familia llegó), un fallo se avisa y
// el reintento pide la familia entera. Familias nuevas de examen.html: pr (rúbrica de probabilidad y tabla de la normal)
// y dt (las explicaciones del detective).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const FL = require('../js/family-load.js');

test('F3f T010 · las familias de moodle.html no cambian (sg, lab, st) y examen.html añade pr y dt; todos los archivos existen', () => {
  assert.deepEqual(FL.FAMILIES.sg, ['js/core/contexts.js', 'js/core/stmtgen.js']);
  assert.deepEqual(FL.FAMILIES.lab, ['js/core/aoacheck.js', 'js/core/roycheck.js', 'js/core/detective.js', 'js/views/layout.js', 'js/views/aoa-layout.js', 'js/views/net-svg.js']);
  assert.deepEqual(FL.FAMILIES.st, ['js/core/threept.js', 'js/core/tcl.js', 'js/core/sim.js', 'js/core/mc.js', 'js/core/probgen.js', 'js/views/chart-svg.js']);
  assert.deepEqual(FL.FAMILIES.pr, ['js/core/probgrade.js', 'js/views/normal-table.js', 'js/i18n-prob.js', 'js/i18n-mc.js']);
  assert.deepEqual(FL.FAMILIES.dt, ['js/i18n-det.js']);
  // T013: los ejemplos citados (examples y stochex) y los enunciados de los apuntes (statements, después de examples).
  assert.deepEqual(FL.FAMILIES.xe, ['js/core/examples.js', 'js/core/stochex.js']);
  assert.deepEqual(FL.FAMILIES.xs, ['js/core/statements.js']);
  assert.deepEqual(Object.keys(FL.FAMILIES), ['sg', 'lab', 'st', 'pr', 'dt', 'xe', 'xs']);
  assert.equal(FL.READY.xe({ examples: {}, stochex: {} }), true); assert.equal(FL.READY.xe({ examples: {} }), false);
  assert.equal(FL.READY.xs({ statements: {} }), true); assert.equal(FL.READY.xs({}), false);
  for (const f of Object.values(FL.FAMILIES).flat()) assert.ok(fs.existsSync(path.join(ROOT, f)), `existe ${f}`);
  assert.deepEqual(Object.keys(FL.READY), Object.keys(FL.FAMILIES));
});

// Un documento falso: los <script> que se añaden quedan en scripts; load() o fail() simulan la respuesta del servidor.
function fakeDoc(present) {
  const scripts = (present || []).map((src) => ({ getAttribute: () => src }));
  const added = [];
  const doc = {
    scripts,
    createElement: (tag) => {
      assert.equal(tag, 'script');
      const el = { tag, src: null, async: true, onload: null, onerror: null, removed: false, getAttribute() { return this.src; }, remove() { this.removed = true; } };
      return el;
    },
    body: { appendChild: (el) => { added.push(el); scripts.push(el); } },
  };
  return { doc, added };
}
const tick = () => new Promise((r) => setImmediate(r));

test('F3f T010 · need pide los scripts de la familia en orden, con async = false, y se resuelve al llegar el último', async () => {
  const PNL = {};
  const { doc, added } = fakeDoc();
  const events = [];
  const L = FL.create({ doc, PNL, onFail: () => events.push('fail'), onOk: () => events.push('ok') });
  assert.equal(L.ready(['sg']), false);
  const p = L.need(['sg']);
  assert.ok(p && typeof p.then === 'function');
  assert.deepEqual(added.map((s) => s.src), FL.FAMILIES.sg);
  assert.ok(added.every((s) => s.async === false));
  // Solo el último avisa de que la familia llegó.
  assert.equal(added[0].onload, null);
  PNL.stmtgen = {};
  added[1].onload();
  await p;
  assert.equal(L.ready(['sg']), true);
  assert.equal(L.need(['sg']), null, 'ya cargada: nada que esperar');
  assert.deepEqual(events, ['ok']);
  // Dos peticiones de la misma familia a la vez comparten la promesa.
  const { doc: d2, added: a2 } = fakeDoc();
  const L2 = FL.create({ doc: d2, PNL: {} });
  const x = L2.family('dt'); const y = L2.family('dt');
  assert.equal(x, y);
  assert.equal(a2.length, 1);
});

test('F3f T010 · los scripts que ya están en la página no se piden otra vez, salvo el último de la familia', () => {
  const { doc, added } = fakeDoc(['js/core/threept.js', 'js/core/tcl.js', 'js/views/chart-svg.js']);
  const L = FL.create({ doc, PNL: {} });
  L.need(['st']);
  assert.deepEqual(added.map((s) => s.src), ['js/core/sim.js', 'js/core/mc.js', 'js/core/probgen.js', 'js/views/chart-svg.js']);
});

test('F3f T010 · un script que no llega se quita y se avisa; el reintento pide la familia entera y quita el aviso', async () => {
  const PNL = {};
  const { doc, added } = fakeDoc();
  const events = [];
  const L = FL.create({ doc, PNL, onFail: () => events.push('fail'), onOk: () => events.push('ok') });
  const p = L.need(['lab']);
  added[2].onerror();
  await assert.rejects(p, /detective/);
  assert.equal(added[2].removed, true);
  assert.deepEqual(events, ['fail']);
  assert.equal(L.ready(['lab']), false);
  const n = added.length;
  const q = L.need(['lab']);
  assert.deepEqual(added.slice(n).map((s) => s.src), FL.FAMILIES.lab, 'el reintento pide todos sus archivos');
  PNL.detective = {}; PNL.netSvg = {};
  added[added.length - 1].onload();
  await q;
  await tick();
  assert.deepEqual(events, ['fail', 'ok']);
  assert.equal(L.ready(['lab']), true);
});

test('F3f T010 · si el último script llega pero la familia no deja su global, es un fallo', async () => {
  const { doc, added } = fakeDoc();
  const events = [];
  const L = FL.create({ doc, PNL: {}, onFail: () => events.push('fail') });
  const p = L.need(['pr']);
  added[added.length - 1].onload();
  await assert.rejects(p, /family pr/);
  assert.deepEqual(events, ['fail']);
});

test('F3f T010 · READY: cada familia está cuando están los globales que deja (con los de pr y dt)', () => {
  const R = FL.READY;
  assert.equal(R.sg({ stmtgen: 1 }), true);
  assert.equal(R.lab({ detective: 1 }), false);
  assert.equal(R.lab({ detective: 1, netSvg: 1 }), true);
  assert.equal(R.st({ probgen: 1, chartSvg: 1 }), true);
  assert.equal(R.pr({ probgrade: 1, normalTable: 1, i18nProb: 1 }), false);
  assert.equal(R.pr({ probgrade: 1, normalTable: 1, i18nProb: 1, i18nMc: 1 }), true);
  assert.equal(R.dt({}), false);
  assert.equal(R.dt({ i18nDet: 1 }), true);
});
