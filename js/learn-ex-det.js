/*
 * learn-ex-det — la sección «Detective» de «Aprende más» de «Ejercicios» (spec f3e-probabilidad-montecarlo, AC22; plan
 * P8; bloque 4 de textos; tablero 99). Grupo lxdet.
 */
(function (root) {
  'use strict';

  const LX = typeof module !== 'undefined' && module.exports ? require('./learn-ex.js') : root.PNL.learnEx;
  LX.s.det = {
    es: { title: 'Detective', blocks: [
      'Una red ya hecha, ROY o PERT, de una tabla generada, con unos errores sembrados: en la red (arcos o ficticias que faltan, sobran o van al revés, ciclos, actividades paralelas sin ficticia), en los cálculos (tiempos con la fórmula equivocada, holguras con el signo cambiado, críticas mal marcadas) o en las dos cosas. Pulsas el elemento que está mal y eliges qué le pasa.',
      ['h', 'Cómo se corrige'],
      ['table', ['Tu marca', 'Cuenta'], [
        ['En el elemento del error y con su tipo', '1'],
        ['En el elemento del error, con otro tipo', '½'],
        ['En un elemento sin error', '−½'],
      ]],
      'La nota es la suma sobre el número de errores sembrados, sin bajar de cero. Un error entre dos elementos (un arco que falta) se acepta en cualquiera de los dos. En Practicar, «Ver los errores» los enseña con su explicación.',
      ['links', [['Ruta guiada', { v: 'route' }]]],
    ] },
    en: { title: 'Detective', blocks: [
      'A finished network, AON or AOA, of a generated table, with some planted errors: in the network (arcs or dummies that are missing, extra or reversed, cycles, parallel activities with no dummy), in the calculations (times with the wrong formula, floats with the wrong sign, critical activities marked wrong) or in both. You press the element that is wrong and choose what is wrong with it.',
      ['h', 'How it is marked'],
      ['table', ['Your mark', 'Counts'], [
        ['On the element of the error and with its type', '1'],
        ['On the element of the error, with another type', '½'],
        ['On an element with no error', '−½'],
      ]],
      'The score is the sum over the number of planted errors, never below zero. An error between two elements (a missing arc) is accepted on either of them. In Practice, «See the errors» shows them with their explanation.',
      ['links', [['Guided tour', { v: 'route' }]]],
    ] },
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
