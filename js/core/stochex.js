/*
 * core/stochex — ejemplos de la F4a (spec f4a-tres-tiempos-tcl, «Qué resultado obtiene»; plan §3).
 * Los dos primeros traen tres estimaciones por actividad (a, m, b) y sirven en M5 y M6; los dos casos del Tema 6c
 * dan la media y la varianza de cada tarea (mu, var, duraciones normales) y solo se usan en M6 (m6only).
 * expected guarda lo que la fuente da explícitamente (camino crítico de las medias y plazo); las cifras las calcula
 * core/tcl y las pruebas las comparan con las de la fuente.
 * Hillier y Lieberman reutiliza los ids, las precedencias y los nombres del ejemplo `hillier` de core/examples
 * (sus medias son esas duraciones); aquí solo se añaden o, m y p de la tabla 22.4.
 */
(function (root) {
  'use strict';

  const isNode = typeof module !== 'undefined' && module.exports;
  const examples = isNode ? require('./examples.js') : root.PNL.examples;

  const tp = (id, a, m, b, links, es, en) => ({ id, a, m, b, links, name: { es, en } });
  const nv = (id, mu, v, links, es, en) => ({ id, mu, var: v, links, name: { es, en } });

  // Tabla 22.4 de Hillier y Lieberman (2015): o, m y p de cada actividad de Reliable Construction Co.
  const HL = { A: [1, 2, 3], B: [2, 3.5, 8], C: [6, 9, 18], D: [4, 5.5, 10], E: [1, 4.5, 5], F: [4, 4, 10], G: [5, 6.5, 11],
    H: [5, 8, 17], I: [3, 7.5, 9], J: [3, 9, 9], K: [4, 4, 4], L: [1, 5.5, 7], M: [1, 2, 3], N: [5, 5.5, 9] };
  const hillierRows = () => examples.get('hillier').rows.map((r) => ({ id: r.id, a: HL[r.id][0], m: HL[r.id][1], b: HL[r.id][2],
    links: r.links, name: r.name }));

  const list = [
    {
      id: 'kl',
      title: { es: 'Proyecto informático de 6 tareas (Klastorin)', en: '6-task IT project (Klastorin)' },
      source: { es: 'T. Klastorin (2010), Gestión de proyectos, Profit Editorial; en el Tema 6c de J. M. Galán',
                en: 'T. Klastorin (2010), Gestión de proyectos, Profit Editorial; in Unit 6c by J. M. Galán' },
      unit: { es: 'semanas', en: 'weeks' },
      rows: [
        tp('A', 2, 6, 14, '', 'Análisis de requisitos', 'Requirements analysis'),
        tp('B', 4, 7, 12, 'A', 'Programación', 'Programming'),
        tp('C', 2, 8, 13, 'A', 'Compra del hardware', 'Hardware acquisition'),
        tp('D', 12, 14, 18, 'A', 'Formación de los usuarios', 'User training'),
        tp('E', 3, 5, 7, 'B, C', 'Implantación', 'Implementation'),
        tp('F', 3, 4, 7, 'E', 'Pruebas', 'Testing'),
      ],
      expected: { path: ['A', 'C', 'E', 'F'], deadline: 25 },
    },
    {
      id: 'hl',
      title: { es: 'Reliable Construction Co. con tres tiempos (Hillier y Lieberman)', en: 'Reliable Construction Co. with three-point estimates (Hillier & Lieberman)' },
      source: { es: 'F. S. Hillier y G. J. Lieberman (2015), Introduction to Operations Research, 10.ª ed., McGraw-Hill, tablas 22.4 y 22.6',
                en: 'F. S. Hillier & G. J. Lieberman (2015), Introduction to Operations Research, 10th ed., McGraw-Hill, Tables 22.4 and 22.6' },
      unit: { es: 'semanas', en: 'weeks' },
      get rows() { return hillierRows(); },
      expected: { path: ['A', 'B', 'C', 'E', 'F', 'J', 'L', 'N'], deadline: 47 },
    },
    {
      id: 'tr',
      m6only: true,
      title: { es: '¿Una sola ruta crítica? Dos rutas en paralelo (Klastorin)', en: 'A single critical path? Two parallel paths (Klastorin)' },
      source: { es: 'T. Klastorin (2010), Gestión de proyectos, Profit Editorial; en el Tema 6c de J. M. Galán',
                en: 'T. Klastorin (2010), Gestión de proyectos, Profit Editorial; in Unit 6c by J. M. Galán' },
      unit: { es: 'días', en: 'days' },
      rows: [
        nv('A', 4, 2, '', 'Tarea A', 'Task A'),
        nv('B', 12, 4, '', 'Tarea B', 'Task B'),
        nv('C', 10, 5, 'A', 'Tarea C', 'Task C'),
        nv('D', 3, 1, 'B', 'Tarea D', 'Task D'),
      ],
      expected: { path: ['B', 'D'], deadline: 17 },
    },
    {
      id: 'pa',
      m6only: true,
      title: { es: 'Efecto de la paralelización: dos tareas a la vez', en: 'The effect of parallel work: two tasks at once' },
      source: { es: 'Tema 6c de J. M. Galán, a partir de T. Klastorin (2010), Gestión de proyectos, Profit Editorial',
                en: 'Unit 6c by J. M. Galán, after T. Klastorin (2010), Gestión de proyectos, Profit Editorial' },
      unit: { es: 'días', en: 'days' },
      // La diapositiva solo da la media (30): la probabilidad de terminar en 30 no depende de la varianza.
      rows: [nv('A', 30, 4, '', 'Tarea A', 'Task A'), nv('B', 30, 4, '', 'Tarea B', 'Task B')],
      expected: { deadline: 30 },
    },
  ];

  const byId = Object.fromEntries(list.map((e) => [e.id, e]));
  const api = { list: () => list, get: (id) => byId[id] || null };
  root.PNL = root.PNL || {};
  root.PNL.stochex = api;
  if (isNode) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
