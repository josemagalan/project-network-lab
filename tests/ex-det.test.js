'use strict';
// ex-det: el detective en «Ejercicios» sin DOM (F3d, T011; AC9–AC11, AC16 y AC20): el menú de cada elemento, las marcas,
// los nombres de los elementos, las explicaciones y la nota en palabras. Ejemplo de referencia: el Ejercicio 6 de los
// apuntes (J. M. Galán, Gestión de Proyectos, UBU, Tema 6a), con sus tiempos (examples.js). El dibujo, el teclado,
// Practicar y Examen los comprueban las pruebas de navegador.
const test = require('node:test');
const assert = require('node:assert/strict');
const GEN = require('../js/core/generator.js');
const P = require('../js/core/project.js');
const D = require('../js/core/detective.js');
const EX = require('../js/core/examples.js');
const I = require('../js/i18n.js');
require('../js/i18n-det.js');
const XD = require('../js/ex-det.js');

const ej6 = P.parse(EX.get('ej6').rows, EX.get('ej6').mode).project;
const ctxOf = (project, graph, shown, lang, nota) => ({ graph, project, shown, lang, nota: nota || 'en', numFmt: (v) => XD.num(v, lang) });

test('T011 · menú de cada elemento: solo los tipos que le pueden pasar y los del grupo pedido (P5)', () => {
  const ids = (xs) => xs.map((x) => `${x.element}:${x.type}`);
  assert.deepEqual(ids(XD.menu('C>F', 'aon', 'all')), ['C>F:royFalse', 'C>F:royInverted', 'C>F:royCycle']);
  assert.deepEqual(ids(XD.menu('C>F', 'aon', 'calc')), []);
  assert.deepEqual(ids(XD.menu('F', 'aon', 'all')), ['F:royMissing', 'F.crit:calcCrit']);
  assert.deepEqual(ids(XD.menu('F', 'aon', 'net')), ['F:royMissing']);
  assert.deepEqual(ids(XD.menu('_S', 'aon', 'all')), ['_S:royMissing'], 'Inicio y Fin no tienen crítica');
  assert.deepEqual(ids(XD.menu('_S', 'aon', 'calc')), []);
  assert.deepEqual(ids(XD.menu('F.ES', 'aon', 'all')), ['F.ES:calcES']);
  assert.deepEqual(ids(XD.menu('F.EF', 'aon', 'calc')), ['F.EF:calcES']);
  assert.deepEqual(ids(XD.menu('F.LS', 'aon', 'calc')), ['F.LS:calcLF']);
  assert.deepEqual(ids(XD.menu('F.TF', 'aon', 'calc')), ['F.TF:calcFloat']);
  assert.deepEqual(ids(XD.menu('F.ES', 'aon', 'net')), []);
  assert.deepEqual(ids(XD.menu('e3', 'aoa', 'all')), ['e3:pertMissingDummy']);
  assert.deepEqual(ids(XD.menu('d:2-3', 'aoa', 'net')), ['d:2-3:pertFalseDummy', 'd:2-3:pertInvertedDummy']);
  assert.deepEqual(ids(XD.menu('F', 'aoa', 'all')), ['F:pertParallel', 'F.crit:calcCrit']);
  assert.deepEqual(ids(XD.menu('F', 'aoa', 'calc')), ['F.crit:calcCrit']);
  assert.deepEqual(ids(XD.menu('e3.TE', 'aoa', 'calc')), ['e3.TE:calcTE']);
  assert.deepEqual(ids(XD.menu('e3.slack', 'aoa', 'all')), ['e3.slack:calcSlack']);
  // Toda opción del menú es una marca válida para el enlace.
  const U = require('../js/core/urlstate.js');
  for (const [el, g] of [['C>F', 'aon'], ['_S>A', 'aon'], ['F', 'aon'], ['F.LF', 'aon'], ['e12', 'aoa'], ['d:2-13', 'aoa'], ['F', 'aoa'], ['e3.TL', 'aoa']]) {
    for (const o of XD.menu(el, g, 'all')) assert.ok(U.cleanDm([o]), `${o.element}:${o.type}`);
  }
});

test('T011 · marcas: una por elemento, cambiar el tipo la sustituye y quitarla la borra', () => {
  let m = XD.setMark(null, 'C>F', 'royFalse');
  assert.deepEqual(m, [{ element: 'C>F', type: 'royFalse' }]);
  m = XD.setMark(m, 'F.ES', 'calcES');
  m = XD.setMark(m, 'C>F', 'royCycle');
  assert.deepEqual(m, [{ element: 'C>F', type: 'royCycle' }, { element: 'F.ES', type: 'calcES' }]);
  assert.deepEqual(XD.unmark(m, 'C>F'), [{ element: 'F.ES', type: 'calcES' }]);
  assert.equal(XD.unmark([{ element: 'F.ES', type: 'calcES' }], 'F.ES'), null, 'sin marcas, nada en el enlace');
});

test('T011 · Ejercicio 6: explicaciones de los errores típicos, con la notación conmutable (AC11 y AC16)', () => {
  const sh = { roy: { nodes: [], arcs: [] }, values: null };
  const es = ctxOf(ej6, 'aon', sh, 'es');
  assert.equal(XD.explainText({ type: 'calcES', element: 'E.ES', accept: ['E.ES'], wrong: 2, right: 3 }, es), 'ES de E: 2 es el menor de los EF de sus predecesoras; es el mayor, 3.');
  assert.equal(XD.explainText({ type: 'calcES', element: 'E.ES', accept: ['E.ES'], wrong: 2, right: 3 }, ctxOf(ej6, 'aon', sh, 'es', 'es')),
    'tᵢ de E: 2 es el menor de los fᵢ de sus predecesoras; es el mayor, 3.');
  assert.equal(XD.explainText({ type: 'calcLF', element: 'B.LF', accept: ['B.LF'], wrong: 5, right: 3 }, ctxOf(ej6, 'aon', sh, 'en')),
    'LF of B: 5 is the largest LS of its successors; it is the smallest, 3.');
  assert.equal(XD.explainText({ type: 'calcFloat', element: 'A.TF', accept: ['A.TF'], wrong: 3, right: 1 }, es), 'TF de A: 3 es LF − ES, sin restar la duración; es LF − ES − d = 1.');
  assert.equal(XD.explainText({ type: 'royMissing', element: 'A>E', accept: ['A', 'E'], data: { from: 'A', to: 'E' } }, es),
    'Falta el arco A → E: la tabla pone A como predecesora inmediata de E.');
  assert.equal(XD.explainText({ type: 'calcCrit', element: 'A.crit', accept: ['A.crit'], wrong: true, right: false }, es), 'A está marcada como crítica y no lo es: su holgura total es 1.');
  assert.equal(XD.explainText({ type: 'calcCrit', element: 'B.crit', accept: ['B.crit'], wrong: false, right: true }, es), 'B es crítica (su holgura total es 0) y no está marcada.');
  const pe = ctxOf(ej6, 'aoa', { pert: D.seed(ej6, { sd: 1, level: 'easy', graph: 'aoa', kind: 'calc' }).shown.pert, values: null }, 'es');
  assert.equal(XD.explainText({ type: 'pertMissingDummy', element: 'd:2-3', accept: ['e2', 'e3'], data: { dummy: 'F1', from: 2, to: 3 } }, pe),
    'Falta la ficticia F1, del suceso 2 al 3: sin ella, lo que sale del suceso 3 no espera a lo que acaba en el 2.');
  assert.equal(XD.explainText({ type: 'calcSlack', element: 'e4.slack', accept: ['e4.slack'], wrong: -2, right: 2 }, pe), 'Holgura del suceso 4: -2 tiene el signo cambiado; es TL − TE = 2.');
  assert.equal(XD.explainText({ type: 'calcTE', element: 'e3.TE', accept: ['e3.TE'], wrong: 2, right: 3 }, Object.assign({}, pe, { nota: 'es' })),
    'Temprano del suceso 3: 2 toma el camino más corto que llega al suceso; es el más largo, 3.');
});

test('T011 · explicaciones y nombres de todos los errores sembrados, en los dos idiomas, sin datos sin poner (AC11)', () => {
  const seen = new Set();
  for (const lv of ['easy', 'medium', 'hard']) {
    for (let sd = 1; sd <= 40; sd++) {
      for (const graph of ['aon', 'aoa']) {
        const r = D.forSeed(GEN.LEVELS[lv], sd, { level: lv, graph, kind: 'all' });
        for (const lang of I.languages) {
          const ctx = ctxOf(r.project, graph, r.seeded.shown, lang, sd % 2 ? 'es' : 'en');
          for (const e of r.seeded.errors) {
            seen.add(e.type);
            const text = XD.explainText(e, ctx);
            assert.doesNotMatch(text, /\{\w+\}|undefined|NaN|det\./, `${lang} ${e.type}: ${text}`);
            for (const el of e.accept) assert.doesNotMatch(XD.elName(el, ctx), /\{\w+\}|undefined|det\./, `${lang} ${el}`);
            assert.doesNotMatch(XD.typeName(e.type, lang), /det\./);
          }
        }
      }
    }
  }
  assert.equal(seen.size, 15, `los 16 tipos de las dos redes (calcCrit en las dos): ${[...seen].join(', ')}`);
});

test('T011 · nombres de los elementos y nota en palabras', () => {
  const sh = { roy: { nodes: [], arcs: [] }, values: null };
  const es = ctxOf(ej6, 'aon', sh, 'es');
  assert.equal(XD.elName('C>F', es), 'Arco C → F');
  assert.equal(XD.elName('_S>A', es), 'Arco Inicio → A');
  assert.equal(XD.elName('_E', es), 'Nodo Fin');
  assert.equal(XD.elName('F.ES', es), 'ES de F');
  assert.equal(XD.elName('F.crit', ctxOf(ej6, 'aon', sh, 'en')), 'Critical mark of F');
  const pert = D.seed(ej6, { sd: 1, level: 'easy', graph: 'aoa', kind: 'calc' }).shown.pert;
  const pe = ctxOf(ej6, 'aoa', { pert, values: null }, 'es');
  const f1 = pert.dummies.find((x) => x.name === 'F1');
  assert.equal(XD.elName(`d:${f1.from}-${f1.to}`, pe), `Ficticia F1, del suceso ${f1.from} al ${f1.to}`);
  assert.equal(XD.elName('e3', pe), 'Suceso 3');
  assert.equal(XD.elName('e3.TL', pe), 'Tardío del suceso 3');
  const a = pert.arcs[0];
  assert.equal(XD.elName(a.act, pe), `Actividad ${a.act}, del suceso ${a.from} al ${a.to}`);
  assert.equal(XD.typeName('calcTE', 'es'), 'mal calculado');
  assert.equal(XD.typeName('royCycle', 'en'), 'arc that closes a cycle');
  const g = { perError: [{ status: 'found' }, { status: 'half' }, { status: 'missed' }], falseAlarms: [{}], score: 100 * (1 + 0.5 - 0.5) / 3 };
  assert.equal(XD.scoreText(g, 'es'), '33,3 %');
  assert.equal(XD.countText(g, 3, 'es'), '(1 + ½ × 1 − ½ × 1) / 3 = 33,3 % (sin bajar de 0).');
  assert.equal(XD.scoreText({ score: 50 }, 'en'), '50 %');
});

test('T011 · la tabla del detective es la de core/detective.forSeed (H2), con la semilla usada', () => {
  const r = XD.seeded(GEN.LEVELS.easy, 5, { level: 'easy', graph: 'aoa', kind: 'net' });
  const d = D.forSeed(GEN.LEVELS.easy, 5, { level: 'easy', graph: 'aoa', kind: 'net' });
  assert.equal(r.sd, d.sd);
  assert.equal(r.moved, true);
  assert.deepEqual(r.seeded.errors, d.seeded.errors);
  assert.equal(XD.seeded(GEN.LEVELS.easy, 5, { level: 'easy', graph: 'aoa', kind: 'net' }), r, 'en caché');
});

// ---------- revisión de nivel 2 (T018) ----------

// I-F3: las explicaciones de los errores de la red que no tenían prueba de contenido, literales (un mutante que cambia el
// sentido o repite la actividad ya no pasa).
test('T018 · I-F3: explicaciones de royInverted, royCycle, pertFalseDummy y pertParallel, literales en ES y EN', () => {
  const sh = { roy: { nodes: [], arcs: [] }, values: null };
  const base = D.seed(ej6, { sd: 1, level: 'easy', graph: 'aoa', kind: 'calc' }).shown.pert;
  const pe = { pert: Object.assign({}, base, { dummies: base.dummies.concat([{ name: 'F9', from: 4, to: 5 }]) }), values: null };
  const inv = { type: 'royInverted', element: 'F>C', accept: ['F>C'], data: { from: 'F', to: 'C' } };
  const cyc = { type: 'royCycle', element: 'H>A', accept: ['H>A'], data: { from: 'H', to: 'A' } };
  const fd = { type: 'pertFalseDummy', element: 'd:4-5', accept: ['d:4-5'], data: { from: 4, to: 5 } };
  const par = { type: 'pertParallel', element: 'B=C', accept: ['B', 'C'], data: { dummy: 'F1', act: 'B', twin: 'C', from: 1, to: 3, gone: 2 } };
  assert.equal(XD.explainText(inv, ctxOf(ej6, 'aon', sh, 'es')), 'El arco F → C va al revés: la tabla pone C antes que F.');
  assert.equal(XD.explainText(inv, ctxOf(ej6, 'aon', sh, 'en')), 'The arc F → C is reversed: the table puts C before F.');
  assert.equal(XD.explainText(cyc, ctxOf(ej6, 'aon', sh, 'es')), 'El arco H → A cierra un ciclo: en la tabla A ya va antes que H, así que H acabaría esperándose a sí misma.');
  assert.equal(XD.explainText(cyc, ctxOf(ej6, 'aon', sh, 'en')), 'The arc H → A closes a cycle: in the table A already comes before H, so H would end up waiting for itself.');
  assert.equal(XD.explainText(fd, ctxOf(ej6, 'aoa', pe, 'es')), 'Sobra la ficticia F9, del suceso 4 al 5: hace esperar lo que sale del suceso 5 a lo que acaba en el 4, y la tabla no lo pide.');
  assert.equal(XD.explainText(fd, ctxOf(ej6, 'aoa', pe, 'en')), 'Dummy F9, from event 4 to 5, is not needed: it makes what leaves event 5 wait for what ends at event 4, which the table does not ask for.');
  assert.equal(XD.explainText(par, ctxOf(ej6, 'aoa', pe, 'es')), 'B y C van las dos del suceso 1 al 3: falta un suceso para B y la ficticia F1, para que cada actividad tenga sus propios sucesos.');
  assert.equal(XD.explainText(par, ctxOf(ej6, 'aoa', pe, 'en')), 'B and C both go from event 1 to 3: B needs an event of its own and the dummy F1, so that each activity has its own events.');
});
