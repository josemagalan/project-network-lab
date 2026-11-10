'use strict';
// core/textpack (F2c, T007): compresión sin dependencias para el enunciado propio en la URL (plan P5, puerta T002).
const test = require('node:test');
const assert = require('node:assert/strict');
const T = require('../js/core/textpack.js');

test('ida y vuelta: vacío, ASCII, acentos, comillas, saltos de línea y caracteres fuera del plano básico', () => {
  for (const s of ['', 'a', 'AAAAAAAAAAAAAAAA', 'A) Aprovisionamiento de materiales para fabricar los componentes X e Y.',
    '«Ñandú», l\'école\n\tüber — 😀 𝄞', '<script>alert(1)</script> javascript:void(0) \u0000\u0007']) {
    const packed = T.compress(s);
    assert.match(packed, /^[A-Za-z0-9_-]*$/);
    assert.equal(T.decompress(packed), s);
  }
});

test('ida y vuelta de un texto largo y repetitivo, que se comprime', () => {
  const s = 'La actividad B no puede empezar hasta que termine la actividad A. '.repeat(200);
  const packed = T.compress(s);
  assert.ok(packed.length < s.length / 4, `${packed.length}`);
  assert.equal(T.decompress(packed), s);
});

test('determinista: el mismo texto da el mismo paquete', () => {
  const s = 'Electrona fabrica XYZ: A, B y C en paralelo; después D, E y F.';
  assert.equal(T.compress(s), T.compress(s));
});

test('entradas no válidas o recortadas dan null, nunca una excepción', () => {
  const ok = T.compress('Hay que pintar las paredes antes de poner el suelo.');
  for (const bad of ['', '!!!', 'ab+c', ok.slice(0, 5), ok.slice(0, -3), 'A'.repeat(50), '_'.repeat(40)]) {
    assert.doesNotThrow(() => T.decompress(bad));
    if (bad !== '') assert.equal(T.decompress(bad), null, bad);
  }
  assert.equal(T.decompress(''), null);
  assert.equal(T.decompress(null), null);
});

test('respeta el tamaño máximo de salida', () => {
  const packed = T.compress('a'.repeat(5000));
  assert.equal(T.decompress(packed, { max: 1000 }), null);
  assert.equal(T.decompress(packed, { max: 5000 }).length, 5000);
  assert.equal(T.MAX, 65536);
});
