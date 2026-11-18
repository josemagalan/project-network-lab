/*
 * learn-ex-pert — la sección «Construir la PERT» de «Aprende más» de «Ejercicios» (spec f3e-probabilidad-montecarlo, AC22; plan
 * P8; bloque 4 de textos; tablero 99). Grupo lxpert.
 */
(function (root) {
  'use strict';

  const LX = typeof module !== 'undefined' && module.exports ? require('./learn-ex.js') : root.PNL.learnEx;
  LX.s.pert = {
    es: { title: 'Construir la PERT', blocks: [
      'Dibujas la red de actividades en los arcos (PERT) de la tabla, como en el reto de ficticias del taller: sucesos, una flecha por actividad y las ficticias que hagan falta. La red es correcta si representa todas las precedencias de la tabla, sin añadir ninguna, y si no hay dos actividades con el mismo suceso de inicio y el mismo de fin.',
      ['h', 'Cómo se corrige'],
      ['table', ['Tu red', 'Nota'], [
        ['Correcta, con el mínimo de ficticias', '100'],
        ['Correcta, con k ficticias de más', '100 − 5k, sin bajar de 80'],
        ['Incorrecta', 'el porcentaje de precedencias inmediatas que representa, como mucho 60'],
      ]],
      'El mínimo es el exacto o, en las tablas más grandes, el mejor conocido. En Practicar, «Ver la red mínima» y «Ver la red de las reglas» enseñan dos soluciones correctas: la de menos ficticias y la que sale con las reglas de M2.',
      ['links', [['Reto de ficticias', { v: 'route', graph: 'aoa', view: 'reto', ex: 'ej6' }]]],
    ] },
    en: { title: 'Build the AOA', blocks: [
      'You draw the activity-on-arrow network (AOA) of the table, as in the workshop’s dummy challenge: events, one arrow per activity and the dummies that are needed. The network is correct if it represents every precedence of the table, adding none, and if no two activities share both their start event and their end event.',
      ['h', 'How it is marked'],
      ['table', ['Your network', 'Score'], [
        ['Correct, with the minimum number of dummies', '100'],
        ['Correct, with k extra dummies', '100 − 5k, never below 80'],
        ['Wrong', 'the percentage of immediate precedences it represents, at most 60'],
      ]],
      'The minimum is the exact one or, for the larger tables, the best known. In Practice, «See the minimum network» and «See the network of the rules» show two correct solutions: the one with the fewest dummies and the one the M2 rules give.',
      ['links', [['Dummy challenge', { v: 'route', graph: 'aoa', view: 'reto', ex: 'ej6' }]]],
    ] },
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
