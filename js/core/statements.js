/*
 * core/statements — los enunciados de M0 (spec f2c-enunciado-tabla, plan §3, formato StatementDef).
 *
 * Cada enunciado trae su texto en ES y EN como segmentos: una cadena es texto sin más; [fragId, texto] es un
 * fragmento con el mismo fragId en los dos idiomas. frags dice qué da cada fragmento (actividad, duración,
 * precedencias, ninguna, inicio o final). ref es la tabla de referencia: la del ejemplo de la F1/F2a cuando
 * el enunciado es un ejercicio ya resuelto (example), o la validada por el autor (Electrona, 2026-11-10).
 * Los siete primeros son la hoja de ejercicios del Tema 6 del autor; el texto español es el de la hoja.
 * La herramienta no deduce nada del texto: las precedencias de cada fragmento están escritas aquí.
 */
(function (root) {
  'use strict';

  const isNode = typeof module !== 'undefined' && module.exports;
  const E = isNode ? require('./examples.js') : root.PNL.examples;

  // g('A B > D E') = [[A, D], [A, E], [B, D], [B, E]]: notación de los datos, no lectura del texto.
  const g = (s) => { const [l, r] = s.split('>').map((x) => x.trim().split(/\s+/)); return l.flatMap((p) => r.map((a) => [p, a])); };
  const fromExample = (id) => { const ex = E.get(id); return { mode: ex.mode, rows: ex.rows.map((r) => ({ id: r.id, duration: r.duration, links: r.links, name: r.name })) }; };
  const src = (n) => ({ es: `J. M. Galán, Gestión de Proyectos (UBU), hoja de ejercicios del Tema 6, ejercicio ${n}`,
    en: `J. M. Galán, Project Management (University of Burgos), Unit 6 exercise sheet, exercise ${n}` });
  const DAYS = { es: 'días', en: 'days' };

  // Duraciones «A=5, B=4, …» como fragmentos dA, dB…
  const durSegs = (pairs) => pairs.flatMap(([a, v], i) => (i ? [', ', [`d${a}`, `${a}=${v}`]] : [[`d${a}`, `${a}=${v}`]]));
  const durFrags = (pairs) => Object.fromEntries(pairs.map(([a, v]) => [`d${a}`, { kind: 'duration', act: a, value: v }]));
  // Líneas de precedencias: [[fragId, es, en, gives], …] → segmentos de cada idioma y fragmentos.
  const lineSegs = (lines, lang, sep, last) => lines.flatMap(([id, es, en], i) => [[id, lang === 'es' ? es : en], i < lines.length - 1 ? sep : last]);
  const lineFrags = (lines) => Object.fromEntries(lines.map(([id, , , gives]) => [id, { kind: 'precedence', gives }]));
  // Lista de actividades «A: descripción.» con su fragmento aX.
  const actSegs = (acts, lang) => acts.flatMap(([a, es, en]) => [`\n${a}: `, [`a${a}`, lang === 'es' ? es : en], '.']);
  const actFrags = (acts) => Object.fromEntries(acts.map(([a]) => [`a${a}`, { kind: 'activity', act: a }]));

  // ── Ejercicio 1: nave almacén ───────────────────────────────────────────────────────────────────────────
  const EJ1_ACTS = [
    ['A', 'Contratar personal de obra', 'Hire site staff'], ['B', 'Allanar el solar', 'Level the site'],
    ['C', 'Adquirir materiales de construcción', 'Buy building materials'], ['D', 'Excavar cimientos', 'Dig the foundations'],
    ['E', 'Pavimentación de los accesos', 'Pave the access roads'], ['G', 'Contratar trabajos de carpintería', 'Hire carpentry work'],
    ['H', 'Cimentación y estructura', 'Foundations and structure'], ['I', 'Pagar materiales', 'Pay for materials'],
    ['J', 'Cerramiento de la nave', 'Enclose the warehouse']];
  const EJ1_PREC = [
    ['p1', 'A precede a D, E y G', 'A precedes D, E and G', g('A > D E G')], ['p2', 'B precede a D', 'B precedes D', g('B > D')],
    ['p3', 'C precede a H e I', 'C precedes H and I', g('C > H I')], ['p4', 'D precede a H', 'D precedes H', g('D > H')],
    ['p5', 'G y H preceden a J', 'G and H precede J', g('G H > J')]];
  const ej1 = {
    id: 'ej1', example: 'ej1', structureOnly: true, unit: null, source: src(1),
    title: { es: 'Nave almacén (Ejercicio 1)', en: 'Warehouse (Exercise 1)' },
    text: {
      es: ['Una empresa va a construir una nave almacén en un solar de su propiedad para desarrollar su actividad comercial, proyecto que implica diversas actividades, cuya descripción e interrelaciones son las siguientes:\n\nActividades:',
        ...actSegs(EJ1_ACTS, 'es'), '\n\nPrecedencias:\n', ...lineSegs(EJ1_PREC, 'es', '.\n', '.\n\n'),
        'Se desea construir el grafo PERT representativo del conjunto de actividades que integran el proyecto.'],
      en: ['A company is going to build a warehouse on a plot of land it owns in order to run its business. The project involves several activities, described below together with how they relate to each other:\n\nActivities:',
        ...actSegs(EJ1_ACTS, 'en'), '\n\nPrecedences:\n', ...lineSegs(EJ1_PREC, 'en', '.\n', '.\n\n'),
        'Draw the PERT network of the activities that make up the project.'],
    },
    frags: Object.assign(actFrags(EJ1_ACTS), lineFrags(EJ1_PREC)),
    ref: fromExample('ej1'),
  };

  // ── Ejercicios 2 y 3: prelaciones ───────────────────────────────────────────────────────────────────────
  const INTRO = { es: 'Representar gráficamente el proyecto definido por las siguientes actividades y prelaciones:\n\n',
    en: 'Draw the project defined by the following activities and precedences:\n\n' };
  const EJ2_PREC = [
    ['p1', 'A precede a D y E', 'A precedes D and E', g('A > D E')], ['p2', 'B y E preceden a F, G y H', 'B and E precede F, G and H', g('B E > F G H')],
    ['p3', 'C precede a I y K', 'C precedes I and K', g('C > I K')], ['p4', 'D precede a G y H', 'D precedes G and H', g('D > G H')],
    ['p5', 'F, H y I preceden a J', 'F, H and I precede J', g('F H I > J')], ['p6', 'J precede a L y M', 'J precedes L and M', g('J > L M')],
    ['p7', 'K precede a M', 'K precedes M', g('K > M')]];
  const ej2 = {
    id: 'ej2', example: 'ej2', structureOnly: true, unit: null, source: src(2),
    title: { es: 'Ejercicio 2', en: 'Exercise 2' },
    text: { es: [INTRO.es, ...lineSegs(EJ2_PREC, 'es', '.\n', '.')], en: [INTRO.en, ...lineSegs(EJ2_PREC, 'en', '.\n', '.')] },
    frags: lineFrags(EJ2_PREC), ref: fromExample('ej2'),
  };
  const EJ3_PREC = [
    ['p1', 'A precede a D, E y F', 'A precedes D, E and F', g('A > D E F')],
    ['p2', 'B precede a D, E, F, G, H e I', 'B precedes D, E, F, G, H and I', g('B > D E F G H I')],
    ['p3', 'C precede a H e I', 'C precedes H and I', g('C > H I')], ['p4', 'D precede a L y M', 'D precedes L and M', g('D > L M')],
    ['p5', 'E precede a L', 'E precedes L', g('E > L')], ['p6', 'F, G y H preceden a J', 'F, G and H precede J', g('F G H > J')],
    ['p7', 'I precede a J y K', 'I precedes J and K', g('I > J K')], ['p8', 'J, K y L preceden a N', 'J, K and L precede N', g('J K L > N')]];
  const ej3 = {
    id: 'ej3', example: 'ej3', structureOnly: true, unit: null, source: src(3),
    title: { es: 'Ejercicio 3', en: 'Exercise 3' },
    text: { es: [INTRO.es, ...lineSegs(EJ3_PREC, 'es', '.\n', '.')], en: [INTRO.en, ...lineSegs(EJ3_PREC, 'en', '.\n', '.')] },
    frags: lineFrags(EJ3_PREC), ref: fromExample('ej3'),
  };

  // ── Ejercicios 4, 6 y 7: duraciones y prelaciones con «<» ───────────────────────────────────────────────
  const EJ4_D = [['A', 5], ['B', 4], ['C', 2], ['D', 2], ['E', 3], ['F', 3], ['G', 5], ['H', 4], ['I', 4], ['J', 6], ['K', 1], ['L', 6], ['M', 5]];
  const EJ4_PREC = [
    ['p1', 'A < C, D, E', 'A < C, D, E', g('A > C D E')], ['p2', 'B < D, E', 'B < D, E', g('B > D E')],
    ['p3', 'C, D, E < G, H', 'C, D, E < G, H', g('C D E > G H')], ['p4', 'E < F', 'E < F', g('E > F')],
    ['p5', 'F, G, H < I', 'F, G, H < I', g('F G H > I')], ['p6', 'H < J, K', 'H < J, K', g('H > J K')],
    ['p7', 'I, J < L', 'I, J < L', g('I J > L')], ['p8', 'K < M', 'K < M', g('K > M')]];
  const ej4 = {
    id: 'ej4', example: 'ej4', structureOnly: false, unit: DAYS, source: src(4),
    title: { es: 'Proyecto industrial (Ejercicio 4)', en: 'Industrial project (Exercise 4)' },
    text: {
      es: ['Un proyecto industrial consta de una serie de actividades, cuyas duraciones (en días) y relaciones de precedencia son las de la tabla.\n\nDuraciones: ',
        ...durSegs(EJ4_D), '.\nPrecedencias: ', ...lineSegs(EJ4_PREC, 'es', '; ', '.\n\n'),
        'Se pide: a) construir el grafo PERT; b) determinar la duración del proyecto; c) señalar el camino crítico.'],
      en: ['An industrial project consists of a set of activities whose durations (in days) and precedence relations are given in the table.\n\nDurations: ',
        ...durSegs(EJ4_D), '.\nPrecedences: ', ...lineSegs(EJ4_PREC, 'en', '; ', '.\n\n'),
        'Tasks: a) draw the PERT network; b) find the project duration; c) identify the critical path.'],
    },
    frags: Object.assign(durFrags(EJ4_D), lineFrags(EJ4_PREC)), ref: fromExample('ej4'),
  };

  const EJ6_D = [['A', 2], ['B', 3], ['C', 2], ['D', 8], ['E', 4], ['F', 3], ['G', 2], ['H', 1], ['I', 2], ['J', 3], ['K', 1]];
  const EJ6_PREC = [
    ['p1', 'A, B < E', 'A, B < E', g('A B > E')], ['p2', 'B, C < G', 'B, C < G', g('B C > G')], ['p3', 'B < F', 'B < F', g('B > F')],
    ['p4', 'D < K', 'D < K', g('D > K')], ['p5', 'E, F < H, I', 'E, F < H, I', g('E F > H I')], ['p6', 'G < I', 'G < I', g('G > I')],
    ['p7', 'H, J < K', 'H, J < K', g('H J > K')], ['p8', 'I < J', 'I < J', g('I > J')]];
  const ej6 = {
    id: 'ej6', example: 'ej6', structureOnly: false, unit: DAYS, source: src(6),
    title: { es: 'Mecánicas del Sureste (Ejercicio 6)', en: 'Mecánicas del Sureste (Exercise 6)' },
    text: {
      es: ['La empresa Mecánicas del Sureste, S.A., se dedica a la fabricación de cierto tipo de maquinaria industrial. Las actividades que componen el proceso productivo y la duración (en días) de cada una de ellas son las siguientes:\n\n',
        ...durSegs(EJ6_D), '\n\nSabiendo que el orden de ejecución de las actividades viene dado por las siguientes prelaciones:\n',
        ...lineSegs(EJ6_PREC, 'es', '\n', '\n\n'),
        'Se pide: a) representar el grafo PERT; b) determinar qué actividades componen el camino crítico y cuál sería su duración total; c) calcular las holguras libre, independiente y total de las actividades F, G y H.'],
      en: ['Mecánicas del Sureste, S.A. manufactures a certain type of industrial machinery. The activities that make up the production process and the duration (in days) of each one are as follows:\n\n',
        ...durSegs(EJ6_D), '\n\nThe order in which the activities are carried out is given by the following precedences:\n',
        ...lineSegs(EJ6_PREC, 'en', '\n', '\n\n'),
        'Tasks: a) draw the PERT network; b) find which activities make up the critical path and its total duration; c) compute the free, independent and total floats of activities F, G and H.'],
    },
    frags: Object.assign(durFrags(EJ6_D), lineFrags(EJ6_PREC)), ref: fromExample('ej6'),
  };

  const EJ7_D = [['A', 10], ['B', 8], ['C', 5], ['D', 4], ['E', 12], ['G', 6], ['H', 7], ['I', 9], ['J', 8]];
  const EJ7_PREC = [
    ['p1', 'A < D, H', 'A < D, H', g('A > D H')], ['p2', 'B < C, D', 'B < C, D', g('B > C D')],
    ['p3', 'E < G, H, I', 'E < G, H, I', g('E > G H I')], ['p4', 'C, D, H < J', 'C, D, H < J', g('C D H > J')]];
  const ej7 = {
    id: 'ej7', example: 'ej7', structureOnly: false, unit: DAYS, source: src(7),
    title: { es: 'Ejercicio 7', en: 'Exercise 7' },
    text: {
      es: ['Construir el grafo y determinar el camino crítico y la duración del proyecto cuyas actividades, duraciones e interrelaciones se expresan en la tabla.\n\nDuraciones: ',
        ...durSegs(EJ7_D), '.\nPrecedencias: ', ...lineSegs(EJ7_PREC, 'es', '; ', '.\n\n'),
        'Se desea, asimismo, representar la tabla de tiempos y holguras del proyecto, así como las oscilaciones de los nudos.'],
      en: ['Draw the network and find the critical path and the duration of the project whose activities, durations and interrelations are given in the table.\n\nDurations: ',
        ...durSegs(EJ7_D), '.\nPrecedences: ', ...lineSegs(EJ7_PREC, 'en', '; ', '.\n\n'),
        'Also give the table of times and floats of the project, and the slack of the events.'],
    },
    frags: Object.assign(durFrags(EJ7_D), lineFrags(EJ7_PREC)), ref: fromExample('ej7'),
  };

  // ── Ejercicio 5: Electrona (sin frases de dependencia) ──────────────────────────────────────────────────
  // Las precedencias salen de la descripción de cada fase; la tabla la validó el autor el 2026-11-10.
  const EJ5_ACTS = [
    ['A', 'Aprovisionamiento de materiales para fabricar los componentes X e Y', 'Procurement of materials to make components X and Y', null],
    ['B', 'Puesta a punto de la maquinaria que elabora los componentes X, Y y Z', 'Set-up of the machinery that makes components X, Y and Z', null],
    ['C', 'Aprovisionamiento de materiales para fabricar el componente Z', 'Procurement of materials to make component Z', null],
    ['D', 'Fabricar el componente Y', 'Make component Y', g('A B > D'),
      'Para fabricar Y hacen falta sus materiales (A) y la maquinaria puesta a punto (B).', 'Making Y needs its materials (A) and the machinery set up (B).'],
    ['E', 'Fabricar el componente Z', 'Make component Z', g('B C > E'),
      'Para fabricar Z hacen falta la maquinaria puesta a punto (B) y sus materiales (C).', 'Making Z needs the machinery set up (B) and its materials (C).'],
    ['F', 'Fabricar el componente X', 'Make component X', g('A B > F'),
      'Para fabricar X hacen falta sus materiales (A) y la maquinaria puesta a punto (B).', 'Making X needs its materials (A) and the machinery set up (B).'],
    ['G', 'Transportar el componente X a la segunda sección', 'Carry component X to the second section', g('F > G'),
      'Solo se puede transportar X cuando está fabricado (F).', 'X can only be carried once it has been made (F).'],
    ['H', 'Ensamblar los componentes Y y Z', 'Assemble components Y and Z', g('D E > H'),
      'Para ensamblar Y y Z tienen que estar fabricados los dos (D y E).', 'Assembling Y and Z needs both of them made (D and E).'],
    ['I', 'Transportar el subproducto YZ, ya ensamblado, a la segunda sección', 'Carry the assembled YZ subproduct to the second section', g('H > I'),
      'El subproducto YZ se transporta cuando ya está ensamblado (H).', 'The YZ subproduct is carried once it has been assembled (H).'],
    ['J', 'Ensamblar el componente X con el subproducto YZ, para obtener el producto final XYZ', 'Assemble component X with the YZ subproduct to obtain the final product XYZ', g('G I > J'),
      'El ensamblaje final se hace en la segunda sección, así que X (G) e YZ (I) tienen que haber llegado.', 'The final assembly takes place in the second section, so X (G) and YZ (I) must have arrived.'],
    ['K', 'Envasado del producto', 'Packaging of the product', g('J > K'),
      'Se envasa el producto final, una vez ensamblado (J).', 'The final product is packaged once it has been assembled (J).']];
  const EJ5_D = [['A', 3], ['B', 1], ['C', 2], ['D', 7], ['E', 5], ['F', 6], ['G', 1], ['H', 2], ['I', 1], ['J', 3], ['K', 1]];
  const ej5Acts = (lang) => EJ5_ACTS.flatMap(([a, es, en]) => [`\n${a}) `, [`a${a}`, lang === 'es' ? es : en], '.']);
  const ej5 = {
    id: 'ej5', structureOnly: false, unit: DAYS, source: src(5),
    title: { es: 'Electrona (Ejercicio 5)', en: 'Electrona (Exercise 5)' },
    text: {
      es: ['La empresa Electrona, S.A., se dedica a la fabricación de productos electrónicos. Esta empresa se está planteando la posibilidad de fabricar un nuevo producto «XYZ» con los equipos que ya posee. Las fases de elaboración de dicho producto serían las siguientes:\n',
        ...ej5Acts('es'), '\n\nTras varias pruebas de fabricación se ha comprobado que la duración (en días) de estas actividades es la siguiente:\n\n',
        ...durSegs(EJ5_D), '\n\n¿Cuáles son las actividades que determinan la duración mínima del proceso de fabricación del producto «XYZ»? ¿Cuál es esta duración?'],
      en: ['Electrona, S.A. manufactures electronic products. The company is considering making a new product, «XYZ», with the equipment it already has. The production stages would be the following:\n',
        ...ej5Acts('en'), '\n\nAfter several manufacturing trials, the duration (in days) of these activities has been found to be:\n\n',
        ...durSegs(EJ5_D), '\n\nWhich activities determine the minimum duration of the manufacturing process of product «XYZ»? What is that duration?'],
    },
    frags: Object.assign(
      Object.fromEntries(EJ5_ACTS.map(([a, , , gives, wes, wen]) => [`a${a}`, gives ? { kind: 'activity', act: a, gives, why: { es: wes, en: wen } } : { kind: 'activity', act: a }])),
      durFrags(EJ5_D)),
    ref: { mode: 'pred', rows: [
      { id: 'A', duration: '3', links: '', name: { es: 'Materiales de X e Y', en: 'Materials for X and Y' } },
      { id: 'B', duration: '1', links: '', name: { es: 'Puesta a punto', en: 'Machinery set-up' } },
      { id: 'C', duration: '2', links: '', name: { es: 'Materiales de Z', en: 'Materials for Z' } },
      { id: 'D', duration: '7', links: 'A, B', name: { es: 'Fabricar Y', en: 'Make Y' } },
      { id: 'E', duration: '5', links: 'B, C', name: { es: 'Fabricar Z', en: 'Make Z' } },
      { id: 'F', duration: '6', links: 'A, B', name: { es: 'Fabricar X', en: 'Make X' } },
      { id: 'G', duration: '1', links: 'F', name: { es: 'Transportar X', en: 'Carry X' } },
      { id: 'H', duration: '2', links: 'D, E', name: { es: 'Ensamblar YZ', en: 'Assemble YZ' } },
      { id: 'I', duration: '1', links: 'H', name: { es: 'Transportar YZ', en: 'Carry YZ' } },
      { id: 'J', duration: '3', links: 'G, I', name: { es: 'Ensamblar XYZ', en: 'Assemble XYZ' } },
      { id: 'K', duration: '1', links: 'J', name: { es: 'Envasar', en: 'Package' } }] },
  };

  // list() da los enunciados visibles; list({ all: true }), también los ocultos (como examples, P9).
  const list = [ej1, ej2, ej3, ej4, ej5, ej6, ej7];
  const byId = Object.fromEntries(list.map((s) => [s.id, s]));
  const api = { list: (opts) => (opts && opts.all ? list.slice() : list.filter((s) => !s.hidden)), get: (id) => byId[id] || null };
  root.PNL = root.PNL || {};
  root.PNL.statements = api;
  if (isNode) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
