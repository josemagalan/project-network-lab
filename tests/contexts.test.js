'use strict';
// core/contexts (F3c, T002): los catálogos de los cuatro contextos del generador de enunciados (spec f3c-enunciados,
// plan P1 y P3). Cada actividad lleva su etapa del proceso, el infinitivo ES, el infinitivo EN y el gerundio EN.
const test = require('node:test');
const assert = require('node:assert/strict');
const X = require('../js/core/contexts.js');

const KEYS = ['home', 'product', 'congress', 'lab'];
const STAGES = [1, 2, 3, 4, 5, 6];
const filled = (o) => o && typeof o.es === 'string' && typeof o.en === 'string' && o.es.trim() && o.en.trim() && o.es !== o.en;

test('hay cuatro contextos, en este orden, con título, entradilla, unidad y recurso en ES y EN', () => {
  assert.deepEqual(Object.keys(X.CONTEXTS), KEYS);
  assert.deepEqual(X.KEYS, KEYS);
  for (const k of KEYS) {
    const c = X.CONTEXTS[k];
    for (const f of ['title', 'intro', 'resource']) assert.ok(filled(c[f]), `${k}.${f}`);
    assert.ok(filled(c.unit.one) && filled(c.unit.many), `${k}.unit`);
  }
});

test('cada catálogo tiene al menos 18 actividades y al menos tres en cada una de las seis etapas', () => {
  for (const k of KEYS) {
    const acts = X.CONTEXTS[k].acts;
    assert.ok(acts.length >= 18, `${k}: ${acts.length}`);
    for (const s of STAGES) assert.ok(acts.filter((a) => a[0] === s).length >= 3, `${k}, etapa ${s}`);
    assert.ok(acts.every((a) => STAGES.includes(a[0])), `${k}: etapa fuera de 1–6`);
  }
});

test('cada actividad tiene sus cuatro campos bien formados y no se repite', () => {
  for (const k of KEYS) {
    const acts = X.CONTEXTS[k].acts;
    for (const [stage, es, en, ger] of acts) {
      const where = `${k}: ${es}`;
      assert.equal(typeof stage, 'number', where);
      for (const s of [es, en, ger]) {
        assert.equal(typeof s, 'string', where);
        assert.equal(s, s.trim(), where);
        assert.match(s, /^[a-záéíóúñ]/, `${where}: en minúscula (el generador pone la mayúscula)`);
        assert.doesNotMatch(s, /[{}#~/"\\.;:]/, `${where}: sin caracteres reservados del cloze ni puntuación`);
      }
      assert.match(es.split(' ')[0], /(ar|er|ir)$/, `${where}: empieza por un infinitivo`);
      assert.doesNotMatch(en, /^to /, `${where}: infinitivo inglés sin «to»`);
      assert.match(ger.split(' ')[0], /ing$/, `${where}: gerundio`);
      assert.deepEqual(ger.split(' ').slice(1), en.split(' ').slice(1), `${where}: el gerundio solo cambia el verbo`);
    }
    for (const i of [1, 2, 3]) {
      const col = acts.map((a) => a[i]);
      assert.equal(new Set(col).size, col.length, `${k}: repetidos en la columna ${i}`);
    }
  }
});
