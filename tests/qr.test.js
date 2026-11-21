'use strict';
// core/qr — codificador de QR propio (spec f3f-examen-imprimible, AC12 y AC27; plan §0, §3 y P4; T003).
// Referencias citadas (constitución, 8):
// - Vectores de «QR Code generator library» de Project Nayuki (https://www.nayuki.io/page/qr-code-generator-library,
//   MIT), paquete de Python qrcodegen 1.8.0, generados con spikes/f3f-examen-imprimible/qr-vectores.py: modo byte (UTF-8),
//   corrección M, sin subir el nivel, la máscara de la penalización de la norma (enlaces del laboratorio de varias longitudes,
//   de la versión 1 a la 10, y 300 textos cortos al azar con semilla fija, donde salen las ocho máscaras) y, aparte, las
//   ocho máscaras forzadas sobre un mismo enlace.
// - Thonky.com, «QR Code Tutorial» (https://www.thonky.com/qr-code-tutorial/), que reproduce los ejemplos y las tablas de
//   ISO/IEC 18004: los códigos de corrección de «HELLO WORLD» 1-M («Error Correction Coding»), las cadenas de formato
//   («Format and Version String Tables») y las de versión de la 7 a la 10.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const Q = require('../js/core/qr.js');

const FIX = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'qr-nayuki.json'), 'utf8'));
// Las filas de los vectores van en hexadecimal (el bit más alto es el módulo de la izquierda): se comparan igual.
const rowsOf = (qr) => Array.from({ length: qr.size }, (_, y) => BigInt(`0b${Array.from({ length: qr.size }, (_, x) => (qr.modules[y * qr.size + x] ? '1' : '0')).join('')}`)
  .toString(16).padStart(Math.ceil(qr.size / 4), '0'));

test('qr · los vectores de Nayuki: misma versión, máscara y matriz (modo byte, corrección M)', () => {
  assert.ok(FIX.vectors.length >= 300);
  for (const v of FIX.vectors) {
    const qr = Q.encode(v.text);
    assert.equal(qr.version, v.version, v.text);
    assert.equal(qr.size, v.size, v.text);
    assert.equal(qr.mask, v.mask, v.text);
    assert.deepEqual(rowsOf(qr), v.rows, v.text);
  }
});

test('qr · las ocho máscaras forzadas sobre el mismo enlace dan la matriz de Nayuki', () => {
  for (const m of FIX.masked.masks) {
    const qr = Q.encode(FIX.masked.text, { mask: m.mask });
    assert.equal(qr.version, FIX.masked.version);
    assert.equal(qr.mask, m.mask);
    assert.deepEqual(rowsOf(qr), m.rows, `máscara ${m.mask}`);
  }
});

test('qr · Reed-Solomon: los 10 códigos de corrección de «HELLO WORLD» 1-M (Thonky)', () => {
  const data = [32, 91, 11, 120, 209, 114, 220, 77, 67, 64, 236, 17, 236, 17, 236, 17];
  assert.deepEqual(Q._rs(data, 10), [196, 35, 39, 119, 235, 215, 231, 226, 93, 23]);
});

test('qr · cadenas de formato de las ocho máscaras en M y en L (Thonky, tabla de formato)', () => {
  const M = ['101010000010010', '101000100100101', '101111001111100', '101101101001011', '100010111111001', '100000011001110', '100111110010111', '100101010100000'];
  const L = ['111011111000100', '111001011110011', '111110110101010', '111100010011101', '110011000101111', '110001100011000', '110110001000001', '110100101110110'];
  for (let m = 0; m < 8; m++) {
    assert.equal(Q._format('M', m).toString(2).padStart(15, '0'), M[m], `M ${m}`);
    assert.equal(Q._format('L', m).toString(2).padStart(15, '0'), L[m], `L ${m}`);
  }
});

test('qr · cadenas de versión de la 7 a la 10 (Thonky, tabla de versión)', () => {
  const V = { 7: '000111110010010100', 8: '001000010110111100', 9: '001001101010011001', 10: '001010010011010011' };
  for (const [v, bits] of Object.entries(V)) assert.equal(Q._versionInfo(Number(v)).toString(2).padStart(18, '0'), bits, `versión ${v}`);
});

test('qr · penalización de matrices hechas a mano (reglas de la norma: N1 = 3, N2 = 3, N3 = 40, N4 = 10)', () => {
  // 21×21 toda clara: 21 filas y 21 columnas con una racha de 21 (3 + 16 cada una) = 798; 20 × 20 bloques de 2×2 = 1200;
  // ningún módulo oscuro: equilibrio k = ⌈|0 − 4410| / 441⌉ − 1 = 9, 90. Total 2088.
  assert.equal(Q._penalty(new Uint8Array(441), 21), 2088);
  // Tablero de ajedrez: sin rachas de 5, sin bloques, 221 oscuros de 441: k = ⌈10 / 441⌉ − 1 = 0. Total 0.
  assert.equal(Q._penalty(Uint8Array.from({ length: 441 }, (_, i) => ((i % 21) + Math.floor(i / 21)) % 2 === 0 ? 1 : 0), 21), 0);
  // Toda oscura: 798 + 1200 y equilibrio k = ⌈4410 / 441⌉ − 1 = 9, 90; los bordes claros no forman patrones de búsqueda.
  assert.equal(Q._penalty(new Uint8Array(441).fill(1), 21), 2088);
});

test('qr · la versión más pequeña que cabe, minVersion y el tope de la versión 10 (213 bytes en M)', () => {
  assert.equal(Q.encode('a').version, 1);
  assert.equal(Q.encode('a', { minVersion: 3 }).version, 3);
  assert.equal(Q.encode('x'.repeat(213)).version, 10);
  assert.throws(() => Q.encode('x'.repeat(214)), RangeError);
  assert.throws(() => Q.encode('x'.repeat(100), { maxVersion: 5 }), RangeError);
  // UTF-8: «ñ» ocupa dos bytes.
  assert.equal(Q.encode('ñ'.repeat(106)).version, 10);
  assert.throws(() => Q.encode('ñ'.repeat(107)), RangeError);
});

test('qr · solo corrección M (la del plan); otro nivel o una máscara fuera de 0..7, RangeError', () => {
  assert.throws(() => Q.encode('a', { ecc: 'H' }), RangeError);
  assert.throws(() => Q.encode('a', { mask: 8 }), RangeError);
});

test('qr · el SVG: zona en blanco de 4 módulos, título escapado, un módulo por unidad y determinista', () => {
  const qr = Q.encode(FIX.masked.text);
  const s = Q.svg(qr, { title: 'Enlace <al> laboratorio & repaso' });
  const n = qr.size + 8;
  assert.match(s, new RegExp(`^<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n} ${n}"`));
  assert.match(s, /role="img"/);
  assert.match(s, /<title>Enlace &lt;al&gt; laboratorio &amp; repaso<\/title>/);
  assert.match(s, /shape-rendering="crispEdges"/);
  assert.ok(s.endsWith('</svg>'));
  // Cada módulo oscuro es un cuadrado de 1×1 desplazado por la zona en blanco.
  const dark = Array.from(qr.modules).filter(Boolean).length;
  assert.equal((s.match(/h1v1h-1z/g) || []).length, dark);
  assert.equal(Q.svg(qr, { title: 'Enlace <al> laboratorio & repaso' }), s);
  assert.match(Q.svg(qr, { quiet: 2 }), new RegExp(`viewBox="0 0 ${qr.size + 4} ${qr.size + 4}"`));
});
