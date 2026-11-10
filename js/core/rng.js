/*
 * core/rng — el único generador aleatorio del núcleo (constitución, principio 9; spec f3a-generador-calculo, plan P1).
 * mulberry32(seed) devuelve una función que da números en [0, 1): la misma secuencia que el GA Lab. Solo usa
 * aritmética entera de 32 bits (Math.imul y desplazamientos) y una división exacta por 2^32, así que da los mismos
 * valores en cualquier motor de JavaScript. int(r, lo, hi) da un entero en [lo, hi] y shuffle(r, a) una permutación
 * nueva de a (Fisher-Yates). La semilla la elige siempre quien llama: el núcleo nunca usa el azar del navegador.
 */
(function (root) {
  'use strict';

  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const int = (r, lo, hi) => lo + Math.floor(r() * (hi - lo + 1));

  function shuffle(r, array) {
    const a = array.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(r() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  const api = { mulberry32, int, shuffle };
  root.PNL = root.PNL || {};
  root.PNL.rng = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
