/*
 * learn-ex-roy — la sección «Construir la ROY» de «Aprende más» de «Ejercicios» (spec f3e-probabilidad-montecarlo, AC22; plan
 * P8; bloque 4 de textos; tablero 99). Grupo lxroy.
 */
(function (root) {
  'use strict';

  const LX = typeof module !== 'undefined' && module.exports ? require('./learn-ex.js') : root.PNL.learnEx;
  LX.s.roy = {
    es: { title: 'Construir la ROY', blocks: [
      'Dibujas la red de actividades en los nodos (ROY) de la tabla: un nodo por actividad, Inicio y Fin, y un arco por cada precedencia inmediata. Los nodos se colocan y se unen en el lienzo, con el ratón o con el teclado, o se escriben las predecesoras en «Tu red como tabla»: las dos vistas son la misma red, y el enlace la guarda.',
      ['h', 'Cómo se corrige'],
      'El laboratorio compara tu red con la tabla, sin mirar dónde has puesto los nodos. Cada precedencia inmediata tiene que estar representada por un arco o por un camino de arcos; cada actividad sin predecesoras sale de Inicio y cada una sin posteriores llega a Fin.',
      ['table', ['Problema', 'Qué es', 'En la nota'], [
        ['Precedencia que falta', 'no hay camino de la predecesora a la actividad', 'no suma'],
        ['Precedencia falsa', 'un arco entre dos actividades sin relación en la tabla', 'resta una'],
        ['Arco al revés', 'va de la actividad a su predecesora', 'resta una'],
        ['Ciclo', 'unos arcos que vuelven a una actividad anterior', 'como mucho, un 50 %'],
        ['Unión con Inicio o Fin', 'falta o sobra', 'no suma o resta una'],
        ['Arco redundante', 'otro camino ya lo implica', 'solo un aviso'],
      ]],
      'La nota es el porcentaje de aciertos (las precedencias inmediatas representadas y las uniones con Inicio y Fin bien hechas) menos los arcos que sobran, sin bajar de cero.',
      ['links', [['Ruta guiada', { v: 'route' }]]],
    ] },
    en: { title: 'Build the AON', blocks: [
      'You draw the activity-on-node network (AON) of the table: one node per activity, Start and End, and one arc for each immediate precedence. You place and join the nodes on the canvas, with the mouse or the keyboard, or type the predecessors in «Your network as a table»: both views are the same network, and the link keeps it.',
      ['h', 'How it is marked'],
      'The lab compares your network with the table, without looking at where you put the nodes. Each immediate precedence must be represented by an arc or by a path of arcs; each activity with no predecessors leaves Start and each one with no successors reaches End.',
      ['table', ['Problem', 'What it is', 'In the score'], [
        ['Missing precedence', 'there is no path from the predecessor to the activity', 'does not add'],
        ['False precedence', 'an arc between two activities with no relation in the table', 'takes one off'],
        ['Reversed arc', 'it goes from the activity to its predecessor', 'takes one off'],
        ['Cycle', 'some arcs that go back to an earlier activity', 'at most 50%'],
        ['Link to Start or End', 'missing or extra', 'does not add or takes one off'],
        ['Redundant arc', 'another path already implies it', 'just a warning'],
      ]],
      'The score is the percentage of hits (the immediate precedences represented and the links to Start and End done right) minus the extra arcs, never below zero.',
      ['links', [['Guided tour', { v: 'route' }]]],
    ] },
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
