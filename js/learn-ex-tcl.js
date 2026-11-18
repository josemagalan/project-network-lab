/*
 * learn-ex-tcl — la sección «Probabilidad (TCL)» de «Aprende más» de «Ejercicios» (spec f3e-probabilidad-montecarlo, AC22; plan
 * P8; bloque 4 de textos; tablero 99). Grupo lxtcl.
 */
(function (root) {
  'use strict';

  const LX = typeof module !== 'undefined' && module.exports ? require('./learn-ex.js') : root.PNL.learnEx;
  LX.s.tcl = {
    es: { title: 'Probabilidad (TCL)', blocks: [
      'Cada actividad trae tres duraciones: optimista (a), más probable (m) y pesimista (b). Con la beta-PERT de examen, su media es tₑ = (a + 4m + b) / 6 y su varianza σ² = ((b − a) / 6)². El camino crítico se busca con las medias; la duración del proyecto se aproxima con una normal de media y varianza las sumas sobre ese camino (teorema central del límite). Con ella salen la probabilidad de acabar en un plazo y el plazo que se cumple con una probabilidad. «La otra ruta» es un camino sin actividades en común con el crítico: como son independientes, la probabilidad de que las dos acaben a tiempo es el producto.',
      ['h', 'Cómo se corrige'],
      'Casilla a casilla, como en «Cálculo». Una casilla es correcta si coincide con la solución, y correcta con error consecuente si no coincide pero está bien hecha con lo que escribiste antes: un error cuenta una vez.',
      ['table', ['Casilla', 'Se juzga con', 'Error consecuente'], [
        ['tₑ y σ² de cada actividad', 'a, m y b del enunciado', '—'],
        ['Camino crítico de las medias', 'tus medias (con empate, tus varianzas)', 'sí'],
        ['μ y σ² del proyecto', 'tus tₑ y σ² sobre tu camino', 'sí'],
        ['z y P(T ≤ plazo)', 'tu μ y tu σ; la tabla con tu z', 'sí'],
        ['z y plazo de una probabilidad', 'la tabla; tu μ y tu σ', 'sí'],
        ['La otra ruta y las dos', 'tus datos de la ruta; el producto', 'sí'],
      ]],
      'Tolerancias: ±0,01 en medias, varianzas y z; en μ y σ² del proyecto, ±0,01 por actividad sumada; la probabilidad, la de la tabla (cuatro decimales) o la exacta; el plazo, ±0,05. Para el 95 % valen z = 1,64, 1,645 y 1,65, porque las tablas impresas no coinciden.',
      ['links', [['M5 · Tres tiempos', { v: 'unc', um: 'm5' }], ['M6 · El TCL y sus trampas', { v: 'unc', um: 'm6' }]]],
    ] },
    en: { title: 'Probability (CLT)', blocks: [
      'Each activity comes with three durations: optimistic (a), most likely (m) and pessimistic (b). With the exam beta-PERT, its mean is tₑ = (a + 4m + b) / 6 and its variance σ² = ((b − a) / 6)². The critical path is found with the means; the project duration is approximated by a normal whose mean and variance are the sums along that path (central limit theorem). It gives the probability of finishing by a deadline and the deadline met with a given probability. «The other route» is a path with no activities in common with the critical one: as they are independent, the probability that both finish on time is the product.',
      ['h', 'How it is marked'],
      'Cell by cell, as in «Calculation». A cell is correct if it matches the solution, and correct with a carried error if it does not match but follows from what you wrote before: an error counts once.',
      ['table', ['Cell', 'Judged with', 'Carried error'], [
        ['tₑ and σ² of each activity', 'a, m and b of the data', '—'],
        ['Critical path of the means', 'your means (on a tie, your variances)', 'yes'],
        ['μ and σ² of the project', 'your tₑ and σ² along your path', 'yes'],
        ['z and P(T ≤ deadline)', 'your μ and σ; the table with your z', 'yes'],
        ['z and deadline for a probability', 'the table; your μ and σ', 'yes'],
        ['The other route and both', 'your route data; the product', 'yes'],
      ]],
      'Tolerances: ±0.01 for means, variances and z; for μ and σ² of the project, ±0.01 per activity added; the probability, the table’s (four decimals) or the exact one; the deadline, ±0.05. For 95% z = 1.64, 1.645 and 1.65 are all right, because printed tables differ.',
      ['links', [['M5 · Three times', { v: 'unc', um: 'm5' }], ['M6 · The CLT and its pitfalls', { v: 'unc', um: 'm6' }]]],
    ] },
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
