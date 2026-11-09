/*
 * core/examples — los seis ejemplos de referencia de la fase 1 (spec f1-cpm-roy, tabla de referencias) y los
 * ejercicios 1, 2, 3 y 7 de la fase 2a (spec f2a-pert-ficticias), visibles desde T022 (M2). expected.aoa
 * guarda las ficticias, los sucesos y los tiempos de sucesos de la red PERT dibujada por el autor.
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
        methods: {   // spec F2b, tabla de cifras por método (validada por el autor, 2026-11-08)
          min: { dummies: 3 }, prog: { dummies: 3, events: 9 }, rules: { dummies: 3, events: 9 },
          cs: { dummies: 6, events: 11 }, kim: { dummies: 3, events: 9 },
          spinrad: { dummies: 3, events: 9, model: { dummies: 10, events: 16 } }, cgl: { dummies: 3, events: 9 } },
        aoa: { dummies: 3, events: 9,   // grafo PERT del Tema 6a (F2a)
          eventTimes: [[0, 0], [3, 3], [3, 3], [3, 5], [7, 7], [7, 7], [9, 9], [12, 12], [13, 13]] },
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
        methods: {   // spec F2b, tabla de cifras por método (validada por el autor, 2026-11-08)
          min: { dummies: 3 }, prog: { dummies: 3, events: 10 }, rules: { dummies: 3, events: 10 },
          cs: { dummies: 3, events: 10 }, kim: { dummies: 3, events: 10 },
          spinrad: { dummies: 3, events: 10, model: { dummies: 11, events: 18 } }, cgl: { dummies: 3, events: 10 } },
        aoa: { dummies: 3, events: 10,   // grafo PERT del Tema 6a (F2a)
          eventTimes: [[0, 0], [5, 5], [5, 5], [8, 8], [8, 8], [12, 12], [13, 14], [13, 19], [18, 18], [24, 24]] },
      },
    },
    {
      id: 'ej7',
      title: { es: 'Ejercicio 7', en: 'Exercise 7' },
      source: { es: 'J. M. Galán, Gestión de Proyectos (UBU), hoja de ejercicios del Tema 6, ejercicio 7, y su solución en «Ejercicios CPM PERT»',
                en: 'J. M. Galán, Project Management (University of Burgos), Unit 6 exercise sheet, exercise 7, and its solution in «Ejercicios CPM PERT»' },
      unit: { es: 'días', en: 'days' },
      mode: 'succ',   // «A < D, H; B < C, D; E < G, H, I; C, D, H < J»
      rows: [
        r('A', 10, 'D, H'), r('B', 8, 'C, D'), r('C', 5, 'J'), r('D', 4, 'J'), r('E', 12, 'G, H, I'),
        r('G', 6, ''), r('H', 7, 'J'), r('I', 9, ''), r('J', 8, ''),
      ],
      expected: {   // solución del autor (red PERT dibujada a mano)
        duration: 27,
        methods: {   // spec F2b, tabla de cifras por método (validada por el autor, 2026-11-08)
          min: { dummies: 5 }, prog: { dummies: 5, events: 9 }, rules: { dummies: 5, events: 9 },
          cs: { dummies: 5, events: 9 }, kim: { dummies: 5, events: 9 },
          spinrad: { dummies: 5, events: 9, model: { dummies: 8, events: 12 } }, cgl: { dummies: 5, events: 9 } },
        aoa: { dummies: 5, events: 9,
          eventTimes: [[0, 0], [8, 14], [10, 12], [10, 15], [12, 12], [12, 12], [19, 19], [21, 27], [27, 27]] },
      },
    },
    {
      id: 'ej1',
      structureOnly: true,
      title: { es: 'Nave almacén (Ejercicio 1)', en: 'Warehouse (Exercise 1)' },
      source: { es: 'J. M. Galán, Gestión de Proyectos (UBU), Tema 6a y hoja de ejercicios del Tema 6, ejercicio 1',
                en: 'J. M. Galán, Project Management (University of Burgos), Unit 6a and Unit 6 exercise sheet, exercise 1' },
      unit: { es: '—', en: '—' },
      mode: 'succ',   // «A precede a D, E y G. B precede a D. C precede a H e I. D precede a H. G y H preceden a J.»
      rows: [
        r('A', '', 'D, E, G', 'Contratar personal de obra', 'Hire site staff'),
        r('B', '', 'D', 'Allanar el solar', 'Level the site'),
        r('C', '', 'H, I', 'Adquirir materiales de construcción', 'Buy building materials'),
        r('D', '', 'H', 'Excavar cimientos', 'Dig the foundations'),
        r('E', '', '', 'Pavimentación de los accesos', 'Pave the access roads'),
        r('G', '', 'J', 'Contratar trabajos de carpintería', 'Hire carpentry work'),
        r('H', '', 'J', 'Cimentación y estructura', 'Foundations and structure'),
        r('I', '', '', 'Pagar materiales', 'Pay for materials'),
        r('J', '', '', 'Cerramiento de la nave', 'Enclose the warehouse'),
      ],
      expected: {   // grafo PERT del Tema 6a
        aoa: { dummies: 2, events: 7 },
        methods: {   // spec F2b, tabla de cifras por método (validada por el autor, 2026-11-08)
          min: { dummies: 2 }, prog: { dummies: 2, events: 7 }, rules: { dummies: 2, events: 7 },
          cs: { dummies: 2, events: 7 }, kim: { dummies: 2, events: 7 },
          spinrad: { dummies: 2, events: 7, model: { dummies: 7, events: 12 } }, cgl: { dummies: 2, events: 7 } },
      },
    },
    {
      id: 'ej2',
      structureOnly: true,
      title: { es: 'Ejercicio 2', en: 'Exercise 2' },
      source: { es: 'J. M. Galán, Gestión de Proyectos (UBU), hoja de ejercicios del Tema 6, ejercicio 2, y su solución en «Ejercicios CPM PERT»',
                en: 'J. M. Galán, Project Management (University of Burgos), Unit 6 exercise sheet, exercise 2, and its solution in «Ejercicios CPM PERT»' },
      unit: { es: '—', en: '—' },
      mode: 'succ',   // «A < D, E; B, E < F, G, H; C < I, K; D < G, H; F, H, I < J; J < L, M; K < M»
      rows: [
        r('A', '', 'D, E'), r('B', '', 'F, G, H'), r('C', '', 'I, K'), r('D', '', 'G, H'), r('E', '', 'F, G, H'),
        r('F', '', 'J'), r('G', '', ''), r('H', '', 'J'), r('I', '', 'J'), r('J', '', 'L, M'), r('K', '', 'M'),
        r('L', '', ''), r('M', '', ''),
      ],
      expected: {
        aoa: { dummies: 2, events: 9 },
        methods: {   // spec F2b, tabla de cifras por método (validada por el autor, 2026-11-08)
          min: { dummies: 2 }, prog: { dummies: 2, events: 9 }, rules: { dummies: 2, events: 9 },
          cs: { dummies: 5, events: 11 }, kim: { dummies: 2, events: 9 },
          spinrad: { dummies: 2, events: 9, model: { dummies: 9, events: 16 } }, cgl: { dummies: 2, events: 9 } },
      },
    },
    {
      id: 'ej3',
      structureOnly: true,
      title: { es: 'Ejercicio 3', en: 'Exercise 3' },
      source: { es: 'J. M. Galán, Gestión de Proyectos (UBU), hoja de ejercicios del Tema 6, ejercicio 3, y su solución en «Ejercicios CPM PERT»',
                en: 'J. M. Galán, Project Management (University of Burgos), Unit 6 exercise sheet, exercise 3, and its solution in «Ejercicios CPM PERT»' },
      unit: { es: '—', en: '—' },
      mode: 'succ',   // «A < D, E, F; B < D, E, F, G, H, I; C < H, I; D < L, M; E < L; F, G, H < J; I < J, K; J, K, L < N»
      rows: [
        r('A', '', 'D, E, F'), r('B', '', 'D, E, F, G, H, I'), r('C', '', 'H, I'), r('D', '', 'L, M'), r('E', '', 'L'),
        r('F', '', 'J'), r('G', '', 'J'), r('H', '', 'J'), r('I', '', 'J, K'), r('J', '', 'N'), r('K', '', 'N'),
        r('L', '', 'N'), r('M', '', ''), r('N', '', ''),
      ],
      expected: {
        aoa: { dummies: 4, events: 10 },
        methods: {   // spec F2b, tabla de cifras por método (validada por el autor, 2026-11-08)
          min: { dummies: 4 }, prog: { dummies: 4, events: 10 }, rules: { dummies: 4, events: 10 },
          cs: { dummies: 4, events: 10 }, kim: { dummies: 4, events: 10 },
          spinrad: { dummies: 4, events: 10, model: { dummies: 12, events: 18 } }, cgl: { dummies: 4, events: 10 } },
      },
    },
    // ---------- F2b: tablas de las fuentes de los métodos del comparador (a la vista desde T024) ----------
    {
      id: 'kim2008',
      structureOnly: true,
      title: { es: 'Kim (2008), tabla 1', en: 'Kim (2008), Table 1' },
      source: { es: 'K. Kim (2008), «Identifying logical dummy activities in an activity-on-arrow network», Canadian Journal of Civil Engineering 35(7): 739–744, tabla 1 y figura 4',
                en: 'K. Kim (2008), "Identifying logical dummy activities in an activity-on-arrow network", Canadian Journal of Civil Engineering 35(7): 739–744, Table 1 and Fig. 4' },
      unit: { es: '—', en: '—' },
      mode: 'succ',
      rows: [
        r('A', '', 'F, G'), r('B', '', 'J, L'), r('C', '', 'G, H'), r('D', '', 'M, N, P'), r('E', '', 'G, H'), r('F', '', 'I'),
        r('G', '', 'I, K'), r('H', '', 'J, K, L'), r('I', '', 'M, N, P'), r('J', '', 'O, Q'), r('K', '', 'N, P'), r('L', '', 'O'),
        r('M', '', ''), r('N', '', ''), r('O', '', ''), r('P', '', ''), r('Q', '', ''),
      ],
      // Figura 4: 8 ficticias lógicas (d1–d8) con varios sucesos iniciales y finales; con uno solo de cada, 2 de unicidad más.
      expected: { methods: { kim: { dummies: 10, logical: 8 } } },
    },
    {
      id: 'cs2007',
      structureOnly: true,
      title: { es: 'Cohen y Sadeh (2007), tabla 1', en: 'Cohen and Sadeh (2007), Table 1' },
      source: { es: 'Y. Cohen y A. Sadeh (2007), «A new approach for constructing and generating AOA networks», Journal of Engineering, Computing and Architecture 1(1): 1–13, tablas 1 y 4 (encofrado de hormigón)',
                en: 'Y. Cohen and A. Sadeh (2007), "A new approach for constructing and generating AOA networks", Journal of Engineering, Computing and Architecture 1(1): 1–13, Tables 1 and 4 (concrete casting)' },
      unit: { es: '—', en: '—' },
      mode: 'pred',
      rows: [
        r('A', '', ''), r('B', '', ''), r('C', '', ''), r('D', '', ''), r('E', '', ''), r('F', '', 'A'), r('G', '', 'A'),
        r('H', '', 'B'), r('I', '', 'E'), r('J', '', 'C, D, I'), r('K', '', 'H'), r('L', '', 'F, H'), r('M', '', 'G, H'),
        r('N', '', 'G, K'), r('O', '', 'J, L, M, N'),
      ],
      // Tabla 4: 5 ficticias (G1, G2, H1, H2, D1) y 13 sucesos (0–12). Mínimo: 4 (spec F2b, clarify).
      expected: { methods: { cs: { dummies: 5, events: 13 }, min: { dummies: 4 } } },
    },
    {
      id: 'syslo1981',
      structureOnly: true,
      title: { es: 'Sysło (1981), figura 2.3', en: 'Sysło (1981), Figure 2.3' },
      source: { es: 'M. M. Sysło (1981), «Optimal constructions of event-node networks», RAIRO – Operations Research 15(3): 241–260, figura 2.3; la actividad b′ del artículo es aquí B2',
                en: 'M. M. Sysło (1981), "Optimal constructions of event-node networks", RAIRO – Operations Research 15(3): 241–260, Figure 2.3; activity b′ in the paper is B2 here' },
      unit: { es: '—', en: '—' },
      mode: 'succ',
      rows: [
        r('A', '', 'E, H'), r('B', '', 'D, E, F, I'), r('B2', '', 'D, E, F, M'), r('C', '', 'D, F, J'), r('G', '', 'D'), r('K', '', 'E'),
        r('L', '', 'F'), r('D', '', ''), r('E', '', ''), r('F', '', ''), r('H', '', ''), r('I', '', ''), r('J', '', ''), r('M', '', ''),
      ],
      // Figura 2.3 (b): Corneil, Gotlieb y Lee, 9 ficticias y 9 sucesos; (d): 8 ficticias, las de las reglas.
      expected: { methods: { cgl: { dummies: 9, events: 9 }, rules: { dummies: 8 } } },
    },
    {
      id: 'tipo',
      structureOnly: true,
      title: { es: 'Caso tipo: una precedencia implícita', en: 'Typical case: an implied precedence' },
      source: { es: 'Spec F2a, criterio 16: A < C, D, E; B < C, E; D < E (A → E es redundante y no se escribe)',
                en: 'F2a spec, criterion 16: A < C, D, E; B < C, E; D < E (A → E is redundant and is left out)' },
      unit: { es: '—', en: '—' },
      mode: 'succ',
      rows: [r('A', '', 'C, D'), r('B', '', 'C, E'), r('C', '', ''), r('D', '', 'E'), r('E', '', '')],
      expected: { methods: { min: { dummies: 2 }, prog: { dummies: 2 }, rules: { dummies: 3 }, cs: { dummies: 3 }, kim: { dummies: 3 },
        spinrad: { dummies: 2 }, cgl: { dummies: 2 } } },   // spec F2b, tabla de referencias
    },
  ];

  const byId = Object.fromEntries(list.map((e) => [e.id, e]));
  // list() da los ejemplos visibles; list({ all: true }), también los ocultos (F2a, P9).
  const api = { list: (opts) => (opts && opts.all ? list : list.filter((e) => !e.hidden)), get: (id) => byId[id] || null };
  root.PNL = root.PNL || {};
  root.PNL.examples = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
