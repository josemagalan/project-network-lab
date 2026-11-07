'use strict';
// i18n: todo texto visible en ES y EN (AC9) y las dos notaciones exactas (AC10).
const test = require('node:test');
const assert = require('node:assert/strict');
const I = require('../js/i18n.js');

const keysDeep = (o, prefix = '') => Object.entries(o).flatMap(([k, v]) =>
  (v && typeof v === 'object' && !Array.isArray(v) ? keysDeep(v, prefix + k + '.') : [prefix + k])).sort();

test('AC9: los catálogos ES y EN tienen exactamente las mismas claves, también las anidadas', () => {
  assert.deepEqual(keysDeep(I.dict.es), keysDeep(I.dict.en));
});

test('AC9: ninguna cadena está vacía ni se queda sin traducir por error', () => {
  const flat = (o) => keysDeep(o).map((k) => k.split('.').reduce((a, p) => a[p], o));
  for (const lang of I.languages) for (const v of flat(I.dict[lang])) assert.ok(String(v).trim(), `${lang}: cadena vacía`);
  const same = keysDeep(I.dict.es).filter((k) => {
    const g = (o) => k.split('.').reduce((a, p) => a[p], o);
    return g(I.dict.es) === g(I.dict.en) && /[a-záéíóúñ]{4,}/i.test(g(I.dict.es));
  });
  assert.deepEqual(same.filter((k) => !I.SAME_IN_BOTH.includes(k)), [], 'cadenas idénticas en ES y EN');
});

test('AC10: notación anglosajona y española con las etiquetas exactas', () => {
  assert.deepEqual(I.notation('en'), { ES: 'ES', EF: 'EF', LS: 'LS', LF: 'LF', TF: 'TF', FF: 'FF', IF: 'IF', SF: 'SF' });
  assert.deepEqual(I.notation('es'), { ES: 'tᵢ', EF: 'fᵢ', LS: 'tᵢ*', LF: 'fᵢ*', TF: 'HT', FF: 'HL', IF: 'HI', SF: 'HS' });
});

test('cada código de error y aviso del núcleo tiene su mensaje en los dos idiomas', () => {
  for (const code of ['cycle', 'unknownRef', 'duplicateId', 'badDuration', 'badId', 'reservedId', 'tooMany', 'redundant']) {
    for (const lang of I.languages) assert.ok(I.dict[lang].issue[code], `${lang}.issue.${code}`);
  }
});

test('cada tipo de paso de la traza tiene título y narración en los dos idiomas', () => {
  for (const kind of ['table', 'build', 'forward', 'forwardFirst', 'forwardEnd', 'backward', 'backwardEnd', 'backwardLast', 'critical', 'gantt']) {
    for (const lang of I.languages) assert.ok(I.dict[lang].narr[kind], `${lang}.narr.${kind}`);
  }
  for (const f of ['TF', 'FF', 'IF', 'SF']) for (const lang of I.languages) assert.ok(I.dict[lang].floatNarr[f], `${lang}.floatNarr.${f}`);
});

test('t() sustituye parámetros y list() une con «y» o «and»', () => {
  assert.equal(I.t('es', 'player.counter', { i: 7, n: 32 }), 'Paso 7 de 32');
  assert.equal(I.t('en', 'player.counter', { i: 7, n: 32 }), 'Step 7 of 32');
  assert.equal(I.list('es', ['A', 'B', 'C']), 'A, B y C');
  assert.equal(I.list('en', ['A', 'B']), 'A and B');
  assert.equal(I.list('en', ['A']), 'A');
});

test('una clave inexistente devuelve la propia clave (visible en las pruebas) y no rompe', () => {
  assert.equal(I.t('es', 'no.existe'), 'no.existe');
});
