/*
 * core/examples — los seis ejemplos de referencia de la fase 1 (spec f1-cpm-roy, tabla de referencias).
 * Cada ejemplo trae sus filas tal como aparecen en la fuente (mode 'pred' o 'succ'), nombres en ES/EN,
 * la fuente citada y los valores ESPERADOS copiados de la fuente (no calculados aquí): las pruebas de
 * core/cpm comparan contra ellos (AC1). Solo se incluyen los valores que la fuente da explícitamente.
 */
(function (root) {
  'use strict';

  const r = (id, duration, links, es, en) => ({ id, duration: String(duration), links, name: es == null ? '' : { es, en } });
  const map = (ids, values) => Object.fromEntries(ids.split(' ').map((id, i) => [id, values[i]]));

  const list = [
    {
      id: 'ej6',
      title: { es: 'Mecánicas del Sureste (Ejercicio 6)', en: 'Mecánicas del Sureste (Exercise 6)' },
      source: { es: 'J. M. Galán, Gestión de Proyectos (UBU), Tema 6a y hoja de ejercicios del Tema 6, ejercicio 6',
                en: 'J. M. Galán, Project Management (University of Burgos), Unit 6a and Unit 6 exercise sheet, exercise 6' },
      unit: { es: 'días', en: 'days' },
      mode: 'succ',   // «A, B < E; B, C < G; B < F; D < K; E, F < H, I; G < I; H, J < K; I < J»
      rows: [
        r('A', 2, 'E'), r('B', 3, 'E, F, G'), r('C', 2, 'G'), r('D', 8, 'K'), r('E', 4, 'H, I'), r('F', 3, 'H, I'),
        r('G', 2, 'I'), r('H', 1, 'K'), r('I', 2, 'J'), r('J', 3, 'K'), r('K', 1, ''),
      ],
      expected: {   // Tabla de holguras del Tema 6a (tearly origen, tlast destino, HT, HI, HL)
        duration: 13,
        ES: map('A B C D E F G H I J K', [0, 0, 0, 0, 3, 3, 3, 7, 7, 9, 12]),
        LF: map('A B C D E F G H I J K', [3, 3, 5, 12, 7, 7, 7, 12, 9, 12, 13]),
        TF: map('A B C D E F G H I J K', [1, 0, 3, 4, 0, 1, 2, 4, 0, 0, 0]),
        IF: map('A B C D E F G H I J K', [1, 0, 1, 4, 0, 1, 0, 4, 0, 0, 0]),
        FF: map('A B C D E F G H I J K', [1, 0, 1, 4, 0, 1, 2, 4, 0, 0, 0]),
        critical: ['B', 'E', 'I', 'J', 'K'],
      },
    },
    {
      id: 'roy10',
      title: { es: 'Ejemplo ROY de 10 actividades', en: '10-activity activity-on-node example' },
      source: { es: 'J. M. Galán, Gestión de Proyectos (UBU), Tema 6b, matriz de encadenamiento (a partir de proyectoyciclodevida.blogspot.com)',
                en: 'J. M. Galán, Project Management (University of Burgos), Unit 6b, chain matrix (after proyectoyciclodevida.blogspot.com)' },
      unit: { es: 'periodos', en: 'periods' },
      mode: 'pred',
      rows: [
        r('A', 2, ''), r('B', 3, ''), r('C', 7, 'A'), r('D', 8, 'A'), r('E', 3, 'B, C'), r('F', 9, 'B, C, D'),
        r('G', 8, 'F'), r('H', 2, 'E'), r('I', 2, 'G, J'), r('J', 10, 'F'),
      ],
      expected: {   // columna t (tiempos mínimos) y fila T (tiempos máximos) de la matriz
        duration: 31,
        ES: map('A B C D E F G H I J', [0, 0, 2, 2, 9, 10, 19, 12, 29, 19]),
        LS: map('A B C D E F G H I J', [0, 7, 3, 2, 26, 10, 21, 29, 29, 19]),
      },
    },
    {
      id: 'roy6',
      title: { es: 'Ejemplo ROY de 6 actividades', en: '6-activity activity-on-node example' },
      source: { es: 'J. M. Galán, Gestión de Proyectos (UBU), Tema 6b, ejemplo resuelto con la matriz (a partir de slideplayer.es/slide/27079)',
                en: 'J. M. Galán, Project Management (University of Burgos), Unit 6b, worked example with the chain matrix (after slideplayer.es/slide/27079)' },
      unit: { es: 'periodos', en: 'periods' },
      mode: 'pred',
      rows: [r('A', 2, ''), r('B', 3, ''), r('C', 7, 'A, B'), r('D', 8, 'A'), r('E', 3, 'A'), r('F', 9, 'D')],
      expected: {
        duration: 19,
        ES: map('A B C D E F', [0, 0, 3, 2, 2, 10]),
        LS: map('A B C D E F', [0, 9, 12, 2, 16, 10]),
        TF: map('A B C D E F', [0, 9, 9, 0, 14, 0]),
        critical: ['A', 'D', 'F'],
      },
    },
    {
      id: 'klastorin',
      title: { es: 'Ejemplo de 6 tareas (Klastorin)', en: '6-task example (Klastorin)' },
      source: { es: 'T. Klastorin (2010), Gestión de proyectos, Profit Editorial; en el Tema 6c de J. M. Galán',
                en: 'T. Klastorin (2010), Gestión de proyectos, Profit Editorial; in Unit 6c by J. M. Galán' },
      unit: { es: 'semanas', en: 'weeks' },
      mode: 'pred',
      rows: [r('A', 14, ''), r('B', 9, ''), r('C', 20, ''), r('D', 12, 'A, B'), r('E', 6, 'C, D'), r('F', 9, 'D')],
      expected: {
        duration: 35,
        ES: map('A B C D E F', [0, 0, 0, 14, 26, 26]),
        LS: map('A B C D E F', [0, 5, 9, 14, 29, 26]),
        LF: map('A B C D E F', [14, 14, 29, 26, 35, 35]),
        TF: map('A B C D E F', [0, 5, 9, 0, 3, 0]),
        critical: ['A', 'D', 'F'],
      },
    },
    {
      id: 'hillier',
      title: { es: 'Reliable Construction Co. (Hillier y Lieberman)', en: 'Reliable Construction Co. (Hillier & Lieberman)' },
      source: { es: 'F. S. Hillier y G. J. Lieberman (2015), Introduction to Operations Research, 10.ª ed., McGraw-Hill, tablas 10.7 y 22.3',
                en: 'F. S. Hillier & G. J. Lieberman (2015), Introduction to Operations Research, 10th ed., McGraw-Hill, Tables 10.7 and 22.3' },
      unit: { es: 'semanas', en: 'weeks' },
      mode: 'pred',
      rows: [
        r('A', 2, '', 'Excavar', 'Excavate'),
        r('B', 4, 'A', 'Poner los cimientos', 'Lay the foundation'),
        r('C', 10, 'B', 'Levantar los muros', 'Put up the rough wall'),
        r('D', 6, 'C', 'Poner el tejado', 'Put up the roof'),
        r('E', 4, 'C', 'Fontanería exterior', 'Install the exterior plumbing'),
        r('F', 5, 'E', 'Fontanería interior', 'Install the interior plumbing'),
        r('G', 7, 'D', 'Revestimiento exterior', 'Put up the exterior siding'),
        r('H', 9, 'E, G', 'Pintura exterior', 'Do the exterior painting'),
        r('I', 7, 'C', 'Instalación eléctrica', 'Do the electrical work'),
        r('J', 8, 'F, I', 'Tabiques', 'Put up the wallboard'),
        r('K', 4, 'J', 'Suelos', 'Install the flooring'),
        r('L', 5, 'J', 'Pintura interior', 'Do the interior painting'),
        r('M', 2, 'H', 'Remates exteriores', 'Install the exterior fixtures'),
        r('N', 6, 'K, L', 'Remates interiores', 'Install the interior fixtures'),
      ],
      expected: {
        duration: 44,
        TF: map('A B C D E F G H I J K L M N', [0, 0, 0, 4, 0, 0, 4, 4, 2, 0, 1, 0, 4, 0]),
        critical: ['A', 'B', 'C', 'E', 'F', 'J', 'L', 'N'],
      },
    },
    {
      id: 'ej4',
      title: { es: 'Proyecto industrial (Ejercicio 4)', en: 'Industrial project (Exercise 4)' },
      source: { es: 'J. M. Galán, Gestión de Proyectos (UBU), Tema 6a y hoja de ejercicios del Tema 6, ejercicio 4',
                en: 'J. M. Galán, Project Management (University of Burgos), Unit 6a and Unit 6 exercise sheet, exercise 4' },
      unit: { es: 'días', en: 'days' },
      mode: 'succ',   // «A < C, D, E; B < D, E; C, D, E < G, H; E < F; F, G, H < I; H < J, K; I, J < L; K < M»
      rows: [
        r('A', 5, 'C, D, E'), r('B', 4, 'D, E'), r('C', 2, 'G, H'), r('D', 2, 'G, H'), r('E', 3, 'F, G, H'),
        r('F', 3, 'I'), r('G', 5, 'I'), r('H', 4, 'I, J, K'), r('I', 4, 'L'), r('J', 6, 'L'), r('K', 1, 'M'),
        r('L', 6, ''), r('M', 5, ''),
      ],
      expected: {   // grafo resuelto del Tema 6a: duración y holguras totales que aparecen en el grafo
        duration: 24,
        TF: map('A B C E F H I K L M', [0, 1, 1, 0, 3, 0, 1, 6, 0, 6]),
        critical: ['A', 'E', 'H', 'J', 'L'],   // camino crítico del enunciado (spec, tabla de referencias)
      },
    },
  ];

  const byId = Object.fromEntries(list.map((e) => [e.id, e]));
  const api = { list: () => list, get: (id) => byId[id] || null };
  root.PNL = root.PNL || {};
  root.PNL.examples = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
