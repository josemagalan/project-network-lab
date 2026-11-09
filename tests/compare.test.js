'use strict';
// core/compare: tarjetas del comparador y mínimo combinado (spec f2b-metodos-reto, T011; AC1, AC6 y AC19).
const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../js/core/project.js');
const E = require('../js/core/examples.js');
const M = require('../js/core/mindummy.js');
const C = require('../js/core/compare.js');

const load = (rows, mode = 'succ', opts) => {
  const { project, report } = P.parse(rows, mode, opts);
  assert.ok(project, JSON.stringify(report));
  return project;
};
const loadEx = (id) => { const ex = E.get(id); return load(ex.rows, ex.mode, { structureOnly: !!ex.structureOnly }); };
const fromSucc = (succ) => load(Object.keys(succ).map((id) => ({ id, duration: '1', links: succ[id].join(', ') })));
const ALL = ['prog', 'rules', 'cs', 'kim', 'spinrad', 'cgl'];

test('lista blanca de métodos y error con uno desconocido', () => {
  assert.deepEqual(C.METHODS, ['prog', 'rules', 'cs', 'kim', 'spinrad', 'cgl', 'min']);
  assert.deepEqual(require('../js/core/urlstate.js').METHODS, C.METHODS, 'la URL admite los mismos métodos');
  assert.deepEqual(C.DEFAULT, ['prog', 'rules', 'min']);
  assert.throws(() => C.run(loadEx('ej6'), { methods: ['rules', 'nope'] }), /nope/);
});

test('Ejercicio 6: una tarjeta por método, en el orden pedido, con red, ficticias, sucesos y ficticias que sobran', () => {
  const p = loadEx('ej6');
  const cmp = C.run(p, { methods: ALL });
  assert.deepEqual(cmp.cards.map((c) => c.method), ALL);
  const want = E.get('ej6').expected.methods;
  for (const c of cmp.cards) {
    assert.equal(c.ok, true, c.method);
    assert.deepEqual(c.problems, [], c.method);
    assert.equal(c.dummies, want[c.method].dummies, c.method);
    assert.equal(c.events, want[c.method].events, c.method);
    assert.equal(c.net.dummies.length, c.dummies, c.method);
    assert.ok(Array.isArray(c.removable), c.method);
    assert.equal(c.structural, null, `${c.method}: sin mínimo todavía`);
  }
  assert.deepEqual(cmp.cards.find((c) => c.method === 'spinrad').model, want.spinrad.model);
  assert.equal(cmp.cards.find((c) => c.method === 'cgl').approx, false);
  assert.equal(cmp.min, null);
});

test('la tarjeta del mínimo espera al cálculo; con él, el mínimo exacto viene de la búsqueda', () => {
  const p = loadEx('ej6');
  const first = C.run(p, { methods: ['rules', 'min'] });
  assert.equal(first.cards[1].pending, true);
  const cmp = C.combine(first, M.solve(p));
  assert.deepEqual([cmp.min.value, cmp.min.exact, cmp.min.source], [3, true, 'search']);
  const card = cmp.cards.find((c) => c.method === 'min');
  assert.deepEqual([card.pending, card.dummies, card.ok], [false, 3, true]);
  assert.equal(cmp.cards[0].structural, false, 'las reglas están en el mínimo');
});

test('diferencia de estructura: cuatro actividades independientes, reglas 3 frente a un mínimo de 2 y ninguna sobra', () => {
  const p = fromSucc({ A: [], B: [], C: [], D: [] });
  const cmp = C.combine(C.run(p, { methods: ['rules', 'min'] }), M.solve(p));
  const rules = cmp.cards[0];
  assert.deepEqual([rules.dummies, rules.removable, rules.structural], [3, [], true]);
  assert.equal(cmp.cards[1].structural, false);
});

test('en el caso tipo, la ficticia de más de las reglas sí se puede quitar: no es diferencia de estructura', () => {
  const p = loadEx('tipo');
  const cmp = C.combine(C.run(p, { methods: ['rules', 'min'] }), M.solve(p));
  const rules = cmp.cards[0];
  assert.equal(rules.dummies, 3);
  assert.equal(rules.removable.length, 1);
  assert.equal(rules.structural, false);
});

test('AC19: si la búsqueda agota el presupuesto y un método da menos, V y la mejor red pasan a ser las suyas', () => {
  // Corneil, Gotlieb y Lee (1973), figura 6: con el presupuesto de la F2a, «entre 4 y 9»; su método da 8.
  const p = fromSucc({ A: ['E', 'F', 'G'], B: ['F', 'G', 'H'], C: ['G', 'H', 'I'], D: ['G', 'I', 'J'], E: [], F: [], G: [], H: [], I: [], J: [] });
  const min = M.solve(p);
  assert.deepEqual([min.value, min.exact], [9, false]);
  const cmp = C.combine(C.run(p, { methods: ['rules', 'cgl', 'min'] }), min);
  assert.deepEqual([cmp.min.value, cmp.min.exact, cmp.min.lower, cmp.min.source], [8, false, min.lower, 'cgl']);
  assert.equal(cmp.min.net.dummies.length, 8);
  const card = cmp.cards.find((c) => c.method === 'min');
  assert.equal(card.dummies, 8, 'la tarjeta del mínimo enseña la mejor red encontrada');
});

test('si un método llega a la cota inferior, el mínimo queda demostrado', () => {
  const p = fromSucc({ A: ['B'], B: [] });
  const fake = { value: 1, exact: false, lower: 0, net: C.run(p, { methods: ['rules'] }).cards[0].net };
  const cmp = C.combine(C.run(p, { methods: ['rules'] }), fake);
  assert.deepEqual([cmp.min.value, cmp.min.exact, cmp.min.source], [0, true, 'rules']);
});

test('revisión F2b, F3: la tarjeta del mínimo no hereda las notas del método que le da V', () => {
  // Figura 6 de Corneil, Gotlieb y Lee: Spinrad (con su cifra «en su modelo») y Corneil-Gotlieb-Lee dan 8.
  const p = fromSucc({ A: ['E', 'F', 'G'], B: ['F', 'G', 'H'], C: ['G', 'H', 'I'], D: ['G', 'I', 'J'], E: [], F: [], G: [], H: [], I: [], J: [] });
  const cmp = C.combine(C.run(p, { methods: ['spinrad', 'cgl', 'min'] }), M.solve(p));
  const card = cmp.cards.find((c) => c.method === 'min');
  assert.equal(card.dummies, 8);
  assert.equal(card.model, undefined);
  assert.equal(card.approx, undefined);
  assert.ok(cmp.cards.find((c) => c.method === 'spinrad').model, 'la de Spinrad conserva la suya');
  // Con Corneil-Gotlieb-Lee como V (approx: false en su tarjeta), la del mínimo tampoco lo hereda (ronda 2).
  const cgl = C.combine(C.run(p, { methods: ['cgl', 'min'] }), M.solve(p));
  assert.equal(cgl.min.source, 'cgl');
  assert.equal(cgl.cards.find((c) => c.method === 'cgl').approx, false);
  assert.equal(cgl.cards.find((c) => c.method === 'min').approx, undefined);
});

test('revisión F2b, F8 · AC19: con varios métodos por debajo de V, V pasa a ser el mejor, no el primero', () => {
  const p = fromSucc({ A1: ['A4', 'A6'], A2: ['A4', 'A5'], A3: ['A4', 'A6', 'A7', 'A8'], A4: ['A8'], A5: ['A7', 'A8', 'A9'], A6: ['A9', 'A10'],
    A7: ['A9', 'A12'], A8: ['A10', 'A13'], A9: ['A11', 'A13'], A10: ['A14'], A11: ['A14', 'A15'], A12: ['A15'], A13: [], A14: [], A15: ['A16'], A16: [] });
  const min = M.solve(p);
  assert.equal(min.exact, false);
  const cmp = C.combine(C.run(p, { methods: ['prog', 'rules', 'cs', 'kim', 'spinrad', 'cgl', 'min'] }), min);
  const best = Math.min(...cmp.cards.filter((c) => c.method !== 'min' && c.ok).map((c) => c.dummies));
  assert.ok(cmp.cards.filter((c) => c.method !== 'min' && c.dummies < min.value).length >= 2, 'más de un método mejora V');
  assert.equal(cmp.min.value, best);
  assert.ok(cmp.cards.every((c) => c.dummies >= cmp.min.value), 'ninguna tarjeta por debajo de la mejor encontrada');
});
