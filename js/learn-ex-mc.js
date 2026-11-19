/*
 * learn-ex-mc — la sección «Montecarlo» de «Aprende más» de «Ejercicios» (spec f3e-probabilidad-montecarlo, AC22; plan
 * P8; bloque 4 de textos; tablero 99). Grupo lxmc.
 */
(function (root) {
  'use strict';

  const LX = typeof module !== 'undefined' && module.exports ? require('./learn-ex.js') : root.PNL.learnEx;
  LX.s.mc = {
    es: { title: 'Montecarlo', blocks: [
      'Tres variantes. «Leer una simulación»: 10 000 réplicas con la beta-PERT de cada actividad, como en M7; lees en los gráficos un percentil, la probabilidad de un plazo y la criticidad de una actividad, y contestas preguntas de interpretación. «Discretas a mano»: unas actividades tienen dos o tres duraciones con su probabilidad; enumeras las combinaciones, la duración del proyecto en cada una y su probabilidad (el producto, porque son independientes), y de ahí E[T], P(T ≤ plazo) y la criticidad. «Réplicas a mano»: unas pocas réplicas con las duraciones ya sorteadas; calculas la duración del proyecto y las críticas de cada una, y estimas la probabilidad y la criticidad como k/n.',
      ['h', 'Cómo se corrige'],
      ['table', ['Casilla', 'Tolerancia', 'Error consecuente'], [
        ['Tiempo leído en un gráfico', '± una clase del histograma', '—'],
        ['Probabilidad o índice leídos', '±0,05', '—'],
        ['Pregunta de interpretación', 'la opción correcta', '—'],
        ['T y p de una combinación', '±0,001', '—'],
        ['E[T] y P(T ≤ plazo) de las discretas', '±0,001', 'sí, con tus combinaciones'],
        ['Criticidad de una discreta', '±0,001', 'sí, con tus p'],
        ['T y críticas de una réplica', 'exactas', '—'],
        ['Estimaciones k/n', '±0,001', 'sí, con tus T y tus marcas'],
      ]],
      'Las probabilidades se pueden escribir como fracción (2/27). Una actividad con holgura 0 en una combinación o en una réplica es crítica en ella, empates incluidos, como en M7.',
      ['links', [['M7 · Montecarlo', { v: 'unc', um: 'm7' }]]],
    ] },
    en: { title: 'Monte Carlo', blocks: [
      'Three variants. «Read a simulation»: 10,000 runs with each activity’s beta-PERT, as in M7; you read a percentile, the probability of a deadline and the criticality of an activity on the charts, and answer interpretation questions. «Discrete by hand»: some activities have two or three durations with their probability; you list the combinations, the project duration in each one and its probability (the product, as they are independent), and from there E[T], P(T ≤ deadline) and the criticality. «Runs by hand»: a few runs with the durations already drawn; you work out the project duration and the critical activities of each one, and estimate the probability and the criticality as k/n.',
      ['h', 'How it is marked'],
      ['table', ['Cell', 'Tolerance', 'Carried error'], [
        ['Time read on a chart', '± one histogram class', '—'],
        ['Probability or index read', '±0.05', '—'],
        ['Interpretation question', 'the right option', '—'],
        ['T and p of a combination', '±0.001', '—'],
        ['E[T] and P(T ≤ deadline) of the discrete ones', '±0.001', 'yes, with your combinations'],
        ['Criticality of a discrete activity', '±0.001', 'yes, with your p'],
        ['T and critical activities of a run', 'exact', '—'],
        ['Estimates k/n', '±0.001', 'yes, with your T and your marks'],
      ]],
      'Probabilities can be written as fractions (2/27). An activity with zero slack in a combination or a run is critical in it, ties included, as in M7.',
      ['links', [['M7 · Monte Carlo', { v: 'unc', um: 'm7' }]]],
    ] },
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
