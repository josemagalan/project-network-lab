'use strict';
// core/rng: generador con semilla del núcleo (spec f3a-generador-calculo, AC1; plan P1 y T002; constitución 9).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const R = require('../js/core/rng.js');

test('mulberry32 da la secuencia de referencia del GA Lab (selection-ga, js/rng.js)', () => {
  const ref = {
    1: [0.6270739405881613, 0.002735721180215478, 0.5274470399599522, 0.9810509674716741, 0.9683778982143849],
    42: [0.6011037519201636, 0.44829055899754167, 0.8524657934904099, 0.6697340414393693, 0.17481389874592423],
    999999: [0.03664584248326719, 0.47466313210316, 0.4967423896305263, 0.8006427923683077, 0.4055270627140999],
  };
  for (const [seed, values] of Object.entries(ref)) {
    const r = R.mulberry32(Number(seed));
    assert.deepEqual(values.map(() => r()), values, `semilla ${seed}`);
  }
});

test('int da enteros en [lo, hi], ambos incluidos, con la regla del GA Lab', () => {
  const r = R.mulberry32(7);
  assert.deepEqual([1, 2, 3, 4, 5, 6].map(() => R.int(r, 1, 9)), [1, 1, 9, 7, 5, 4]);
  const s = R.mulberry32(3);
  const seen = new Set();
  for (let i = 0; i < 2000; i++) { const v = R.int(s, -2, 2); assert.ok(Number.isInteger(v) && v >= -2 && v <= 2); seen.add(v); }
  assert.equal(seen.size, 5);
});

test('shuffle devuelve una permutación nueva y no toca la original; misma semilla, mismo orden', () => {
  const a = ['A', 'B', 'C', 'D', 'E', 'F'];
  const x = R.shuffle(R.mulberry32(11), a);
  const y = R.shuffle(R.mulberry32(11), a);
  assert.deepEqual(a, ['A', 'B', 'C', 'D', 'E', 'F']);
  assert.deepEqual([...x].sort(), a);
  assert.deepEqual(x, y);
});

test('constitución 9: ningún archivo de js/core/ usa el azar del navegador', () => {
  const dir = path.join(__dirname, '..', 'js', 'core');
  for (const f of fs.readdirSync(dir).filter((n) => n.endsWith('.js'))) {
    const src = fs.readFileSync(path.join(dir, f), 'utf8');
    assert.ok(!/Math\s*\.\s*random/.test(src), `${f} usa Math.random`);
    assert.ok(!/crypto\s*\.\s*getRandomValues/.test(src), `${f} usa crypto.getRandomValues`);
  }
});
