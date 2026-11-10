/*
 * core/statements — los enunciados de M0 (spec f2c-enunciado-tabla, plan §3, formato StatementDef).
 *
 * Cada enunciado trae su texto en ES y EN como segmentos: una cadena es texto sin más; [fragId, texto] es un
 * fragmento con el mismo fragId en los dos idiomas. frags dice qué da cada fragmento (actividad, duración,
 * precedencias, ninguna, inicio o final). ref es la tabla de referencia: la del ejemplo de la F1/F2a cuando
 * el enunciado es un ejercicio ya resuelto (example), o la validada por el autor (Electrona, 2026-11-10).
 * Los siete primeros son la hoja de ejercicios del Tema 6 del autor (el texto español es el de la hoja); los
 * cuatro siguientes, escritos para la herramienta, cubren los tipos de frase de la spec (ocultos hasta T020).
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


  // ── Enunciados nuevos, escritos para la herramienta (aprobados por el autor el 2026-11-10; T012) ──────────
  const SRC_LAB = { es: 'Project Network Lab (enunciado escrito para la herramienta)', en: 'Project Network Lab (statement written for the tool)' };
  const rows = (list) => list.map(([id, d, links, es, en]) => ({ id, duration: d === null ? '' : String(d), links, name: { es, en } }));

  // ── 1. Reforma de la cocina: prosa sin letras ───────────────────────────────────────────────────────────────
  const cocina = {
    id: 'cocina', structureOnly: false, unit: DAYS, source: SRC_LAB, hidden: true,
    title: { es: 'Reforma de la cocina', en: 'Kitchen refit' },
    text: {
      es: ['Ana va a reformar la cocina de su piso. Para empezar hay que ', ['aA', 'desmontar la cocina vieja'], ', lo que lleva ', ['dA', '2 días'], '. ',
        ['p1', 'Con la cocina vacía'], ', el electricista puede ', ['aB', 'renovar la instalación eléctrica'], ' (', ['dB', '3 días'], ') y el fontanero ',
        ['aC', 'cambiar las tuberías'], ' (', ['dC', '2 días'], '); ', ['n1', 'los dos pueden trabajar a la vez'], '. ',
        ['n2', 'El electricista y el pintor comparten la misma escalera, pero se organizan sin problema'], '. ',
        ['p2', 'Las paredes no se pueden alicatar hasta que terminen el electricista y el fontanero'], ': ', ['aD', 'alicatar las paredes'], ' lleva ', ['dD', '4 días'], '. ',
        ['p3', 'En cuanto la cocina esté desmontada'], ', el pintor puede ', ['aE', 'pintar el techo'], ' en ', ['dE', '1 día'], '. ',
        ['p4', 'Los muebles se montan cuando las paredes están alicatadas y el techo pintado'], '; ', ['aF', 'montar los muebles'], ' lleva ', ['dF', '2 días'], '. ',
        ['p5', 'Una vez montados los muebles'], ' se pueden ', ['aG', 'instalar los electrodomésticos'], ' (', ['dG', '1 día'], '). ',
        ['r1', 'Ana insiste en que los electrodomésticos no se instalen antes de alicatar las paredes'], '. Por último, hay que ',
        ['aH', 'limpiar la obra'], ' (', ['dH', '1 día'], '): ', ['e1', 'es lo último que se hace'], '.'],
      en: ['Ana is going to refit the kitchen in her flat. To begin with, someone has to ', ['aA', 'strip out the old kitchen'], ', which takes ', ['dA', '2 days'], '. ',
        ['p1', 'Once the kitchen is empty'], ', the electrician can ', ['aB', 'rewire the kitchen'], ' (', ['dB', '3 days'], ') and the plumber can ',
        ['aC', 'replace the pipes'], ' (', ['dC', '2 days'], '); ', ['n1', 'both can work at the same time'], '. ',
        ['n2', 'The electrician and the painter share the same ladder, but they manage without any trouble'], '. ',
        ['p2', 'The walls cannot be tiled until the electrician and the plumber have finished'], ': ', ['aD', 'tiling the walls'], ' takes ', ['dD', '4 days'], '. ',
        ['p3', 'As soon as the kitchen has been stripped out'], ', the painter can ', ['aE', 'paint the ceiling'], ' in ', ['dE', '1 day'], '. ',
        ['p4', 'The units are fitted when the walls are tiled and the ceiling is painted'], '; ', ['aF', 'fitting the units'], ' takes ', ['dF', '2 days'], '. ',
        ['p5', 'Once the units are fitted'], ', someone can ', ['aG', 'install the appliances'], ' (', ['dG', '1 day'], '). ',
        ['r1', 'Ana insists that the appliances must not be installed before the walls are tiled'], '. Finally, someone has to ',
        ['aH', 'clean up'], ' (', ['dH', '1 day'], '): ', ['e1', 'it is the very last task'], '.'],
    },
    frags: {
      aA: { kind: 'activity', act: 'A' }, dA: { kind: 'duration', act: 'A', value: 2 },
      p1: { kind: 'precedence', gives: g('A > B C') },
      aB: { kind: 'activity', act: 'B' }, dB: { kind: 'duration', act: 'B', value: 3 },
      aC: { kind: 'activity', act: 'C' }, dC: { kind: 'duration', act: 'C', value: 2 },
      n1: { kind: 'none', why: { es: 'Ir a la vez no es una precedencia: B y C no dependen una de otra.', en: 'Working at the same time is not a precedence: B and C do not depend on each other.' } },
      n2: { kind: 'none', why: { es: 'Compartir un recurso no es una precedencia; aquí, además, se organizan sin problema.', en: 'Sharing a resource is not a precedence; besides, here they manage without trouble.' } },
      p2: { kind: 'precedence', gives: g('B C > D') },
      aD: { kind: 'activity', act: 'D' }, dD: { kind: 'duration', act: 'D', value: 4 },
      p3: { kind: 'precedence', gives: g('A > E') },
      aE: { kind: 'activity', act: 'E' }, dE: { kind: 'duration', act: 'E', value: 1 },
      p4: { kind: 'precedence', gives: g('D E > F') },
      aF: { kind: 'activity', act: 'F' }, dF: { kind: 'duration', act: 'F', value: 2 },
      p5: { kind: 'precedence', gives: g('F > G') },
      aG: { kind: 'activity', act: 'G' }, dG: { kind: 'duration', act: 'G', value: 1 },
      r1: { kind: 'precedence', gives: g('D > G'), why: { es: 'Ya lo implican «alicatar antes de montar los muebles» y «muebles antes de electrodomésticos».', en: 'Already implied by "tiling before fitting the units" and "units before appliances".' } },
      aH: { kind: 'activity', act: 'H' }, dH: { kind: 'duration', act: 'H', value: 1 },
      e1: { kind: 'end', act: 'H', gives: g('A B C D E F G > H') },
    },
    ref: { mode: 'pred', rows: rows([
      ['A', 2, '', 'Desmontar la cocina', 'Strip out the kitchen'], ['B', 3, 'A', 'Instalación eléctrica', 'Rewiring'],
      ['C', 2, 'A', 'Tuberías', 'Pipes'], ['D', 4, 'B, C', 'Alicatar', 'Tiling'], ['E', 1, 'A', 'Pintar el techo', 'Paint the ceiling'],
      ['F', 2, 'D, E', 'Montar los muebles', 'Fit the units'], ['G', 1, 'F', 'Electrodomésticos', 'Appliances'], ['H', 1, 'G', 'Limpiar', 'Clean up']]) },
  };

  // ── 2. Congreso: lista con letras, frases en los dos sentidos, inicio, final y una trampa de lectura ───────
  const congreso = {
    id: 'congreso', structureOnly: true, unit: null, source: SRC_LAB, hidden: true,
    title: { es: 'Organizar un congreso', en: 'Organising a conference' },
    text: {
      es: ['Un departamento organiza un congreso. Estas son las tareas:\n',
        '\nA) ', ['aA', 'Elegir la fecha y la sede'], '.', '\nB) ', ['aB', 'Enviar las invitaciones a los ponentes'], '.',
        '\nC) ', ['aC', 'Diseñar la web del congreso'], '.', '\nD) ', ['aD', 'Abrir las inscripciones'], '.',
        '\nE) ', ['aE', 'Contratar el catering'], '.', '\nF) ', ['aF', 'Imprimir el programa'], '.', '\nG) ', ['aG', 'Celebrar el congreso'], '.',
        '\n\n', ['p1', 'B sigue a A'], ', y ', ['p2', 'C no puede empezar hasta que acabe A'], '. ',
        ['p3', 'Las invitaciones no se envían hasta que la web está terminada'], ', porque llevan su enlace. ',
        ['p4', 'D empieza cuando acaban B y C'], '. ', ['p5', 'Antes de E hay que hacer D'], ', para saber cuántas personas vienen. ',
        ['p6', 'Una vez terminado B, se puede hacer F'], '. ', ['n1', 'E y F pueden ir en paralelo'], '. ',
        ['p7', 'E y F preceden a G'], '. Resumiendo: ', ['s1', 'todo empieza por A'], ' y ', ['e1', 'G es lo último'], '.'],
      en: ['A department is organising a conference. These are the tasks:\n',
        '\nA) ', ['aA', 'Choose the date and the venue'], '.', '\nB) ', ['aB', 'Send the invitations to the speakers'], '.',
        '\nC) ', ['aC', 'Design the conference website'], '.', '\nD) ', ['aD', 'Open registration'], '.',
        '\nE) ', ['aE', 'Hire the catering'], '.', '\nF) ', ['aF', 'Print the programme'], '.', '\nG) ', ['aG', 'Hold the conference'], '.',
        '\n\n', ['p1', 'B follows A'], ', and ', ['p2', 'C cannot start until A has finished'], '. ',
        ['p3', 'The invitations are not sent until the website is finished'], ', because they include its link. ',
        ['p4', 'D starts when B and C have finished'], '. ', ['p5', 'Before E, D must be done'], ', so that we know how many people are coming. ',
        ['p6', 'Once B is finished, F can be done'], '. ', ['n1', 'E and F can run in parallel'], '. ',
        ['p7', 'E and F precede G'], '. In short, ', ['s1', 'everything starts with A'], ' and ', ['e1', 'G is the last task'], '.'],
    },
    frags: {
      aA: { kind: 'activity', act: 'A' }, aB: { kind: 'activity', act: 'B' }, aC: { kind: 'activity', act: 'C' }, aD: { kind: 'activity', act: 'D' },
      aE: { kind: 'activity', act: 'E' }, aF: { kind: 'activity', act: 'F' }, aG: { kind: 'activity', act: 'G' },
      s1: { kind: 'start', act: 'A', gives: g('A > B C D E F G') },
      p1: { kind: 'precedence', gives: g('A > B'), why: { es: '«B sigue a A» quiere decir que A va antes que B. Leído al revés, crearía un ciclo con C.', en: '"B follows A" means A comes before B. Read the other way round, it would create a cycle with C.' } },
      p2: { kind: 'precedence', gives: g('A > C') },
      p3: { kind: 'precedence', gives: g('C > B') },
      p4: { kind: 'precedence', gives: g('B C > D') },
      p5: { kind: 'precedence', gives: g('D > E') },
      p6: { kind: 'precedence', gives: g('B > F') },
      n1: { kind: 'none' },
      p7: { kind: 'precedence', gives: g('E F > G') },
      e1: { kind: 'end', act: 'G', gives: g('A B C D E F > G') },
    },
    ref: { mode: 'pred', rows: rows([
      ['A', null, '', 'Fecha y sede', 'Date and venue'], ['B', null, 'C', 'Invitaciones', 'Invitations'], ['C', null, 'A', 'Web', 'Website'],
      ['D', null, 'B', 'Inscripciones', 'Registration'], ['E', null, 'D', 'Catering', 'Catering'], ['F', null, 'B', 'Programa', 'Programme'],
      ['G', null, 'E, F', 'Congreso', 'Conference']]) },
  };

  // ── 3. Mudanza de un laboratorio: letras entre paréntesis, «empieza cuando acaban», redundancia y distractor ─
  const mudanza = {
    id: 'mudanza', structureOnly: false, unit: DAYS, source: SRC_LAB, hidden: true,
    title: { es: 'Mudanza de un laboratorio', en: 'Moving a laboratory' },
    text: {
      es: ['Un grupo de investigación cambia de edificio. Primero hay que ', ['aA', 'hacer el inventario de los equipos'], ' (A, ', ['dA', '3 días'], '). ',
        ['p1', 'Una vez hecho el inventario, se puede embalar el vidrio y desconectar los equipos'], ': ', ['aB', 'embalar el material de vidrio'], ' (B) lleva ',
        ['dB', '2 días'], ' y ', ['aC', 'desconectar y embalar los equipos grandes'], ' (C), otros ', ['dC', '2 días'], '. ',
        ['n2', 'B y C usan la misma furgoneta de la universidad, pero el orden da igual'], '. Mientras tanto, el servicio técnico tiene que ',
        ['aD', 'preparar el laboratorio nuevo'], ' (D, ', ['dD', '5 días'], '); ', ['n1', 'D puede ir en paralelo con A, B y C'], '. ',
        ['p2', 'El transporte empieza cuando acaban B, C y D'], ': ', ['aE', 'transportarlo todo'], ' (E) se hace en ', ['dE', '1 día'], '. ',
        ['r1', 'Evidentemente, el transporte no puede empezar antes del inventario'], '. ',
        ['p3', 'En cuanto el laboratorio nuevo está preparado'], ', hay que ', ['aH', 'revisar su seguridad'], ' (H, ', ['dH', '1 día'], '). ',
        ['p4', 'F y G siguen a E'], ': ', ['aF', 'instalar y calibrar los equipos'], ' (F) lleva ', ['dF', '3 días'], ' y ',
        ['aG', 'desembalar el vidrio'], ' (G), ', ['dG', '1 día'], '. ', ['p5', 'Antes de instalar los equipos hay que haber revisado la seguridad'], '.'],
      en: ['A research group is moving to a new building. First, someone has to ', ['aA', 'take an inventory of the equipment'], ' (A, ', ['dA', '3 days'], '). ',
        ['p1', 'Once the inventory is done, the glassware can be packed and the equipment disconnected'], ': ', ['aB', 'packing the glassware'], ' (B) takes ',
        ['dB', '2 days'], ' and ', ['aC', 'disconnecting and packing the large equipment'], ' (C) another ', ['dC', '2 days'], '. ',
        ['n2', 'B and C use the same university van, but the order does not matter'], '. Meanwhile, the technical service has to ',
        ['aD', 'get the new laboratory ready'], ' (D, ', ['dD', '5 days'], '); ', ['n1', 'D can run in parallel with A, B and C'], '. ',
        ['p2', 'The move starts when B, C and D have finished'], ': ', ['aE', 'moving everything'], ' (E) takes ', ['dE', '1 day'], '. ',
        ['r1', 'Obviously, the move cannot start before the inventory'], '. ',
        ['p3', 'As soon as the new laboratory is ready'], ', someone has to ', ['aH', 'check its safety'], ' (H, ', ['dH', '1 day'], '). ',
        ['p4', 'F and G follow E'], ': ', ['aF', 'installing and calibrating the equipment'], ' (F) takes ', ['dF', '3 days'], ' and ',
        ['aG', 'unpacking the glassware'], ' (G), ', ['dG', '1 day'], '. ', ['p5', 'Before the equipment is installed, the safety check must be done'], '.'],
    },
    frags: {
      aA: { kind: 'activity', act: 'A' }, dA: { kind: 'duration', act: 'A', value: 3 },
      p1: { kind: 'precedence', gives: g('A > B C') },
      aB: { kind: 'activity', act: 'B' }, dB: { kind: 'duration', act: 'B', value: 2 },
      aC: { kind: 'activity', act: 'C' }, dC: { kind: 'duration', act: 'C', value: 2 },
      n2: { kind: 'none', why: { es: 'Compartir la furgoneta es un recurso, no una precedencia.', en: 'Sharing the van is a resource, not a precedence.' } },
      aD: { kind: 'activity', act: 'D' }, dD: { kind: 'duration', act: 'D', value: 5 },
      n1: { kind: 'none' },
      p2: { kind: 'precedence', gives: g('B C D > E') },
      aE: { kind: 'activity', act: 'E' }, dE: { kind: 'duration', act: 'E', value: 1 },
      r1: { kind: 'precedence', gives: g('A > E'), why: { es: 'Ya lo implican «inventario antes de embalar» y «embalar antes del transporte».', en: 'Already implied by "inventory before packing" and "packing before the move".' } },
      p3: { kind: 'precedence', gives: g('D > H') },
      aH: { kind: 'activity', act: 'H' }, dH: { kind: 'duration', act: 'H', value: 1 },
      p4: { kind: 'precedence', gives: g('E > F G') },
      aF: { kind: 'activity', act: 'F' }, dF: { kind: 'duration', act: 'F', value: 3 },
      aG: { kind: 'activity', act: 'G' }, dG: { kind: 'duration', act: 'G', value: 1 },
      p5: { kind: 'precedence', gives: g('H > F') },
    },
    ref: { mode: 'pred', rows: rows([
      ['A', 3, '', 'Inventario', 'Inventory'], ['B', 2, 'A', 'Embalar el vidrio', 'Pack glassware'], ['C', 2, 'A', 'Embalar equipos', 'Pack equipment'],
      ['D', 5, '', 'Preparar el laboratorio', 'Prepare the lab'], ['E', 1, 'B, C, D', 'Transporte', 'Move'], ['F', 3, 'E, H', 'Instalar equipos', 'Install equipment'],
      ['G', 1, 'E', 'Desembalar el vidrio', 'Unpack glassware'], ['H', 1, 'D', 'Revisar la seguridad', 'Safety check']]) },
  };

  // ── 4. Lanzamiento de un producto: «lo primero», «debe estar terminado antes de», «sin saber», «lo último» ──
  const lanzamiento = {
    id: 'lanzamiento', structureOnly: false, unit: { es: 'semanas', en: 'weeks' }, source: SRC_LAB, hidden: true,
    title: { es: 'Lanzamiento de un producto', en: 'Product launch' },
    text: {
      es: ['Una empresa prepara el lanzamiento de un producto. Las tareas y su duración, en semanas, son:\n',
        '\nA) ', ['aA', 'Estudio de mercado'], ': ', ['dA', '4'], '.', '\nB) ', ['aB', 'Diseño del producto'], ': ', ['dB', '6'], '.',
        '\nC) ', ['aC', 'Fijar el precio'], ': ', ['dC', '1'], '.', '\nD) ', ['aD', 'Campaña de publicidad'], ': ', ['dD', '5'], '.',
        '\nE) ', ['aE', 'Fabricar la primera serie'], ': ', ['dE', '8'], '.', '\nF) ', ['aF', 'Lanzamiento'], ': ', ['dF', '1'], '.',
        '\n\n', ['p1', 'El diseño y el precio dependen del estudio de mercado'], '. ',
        ['p2', 'El diseño debe estar terminado antes de que empiece la fabricación'], ', y ', ['p3', 'la campaña no puede empezar sin saber el precio'], '. ',
        ['n1', 'Fabricar y hacer la campaña pueden ir a la vez'], '. ', ['p4', 'F sigue a D y a E'], ': ', ['e1', 'el lanzamiento es lo último'], '. Y, como es lógico, ', ['s1', 'lo primero es el estudio de mercado'], '.'],
      en: ['A company is preparing a product launch. The tasks and their durations, in weeks, are:\n',
        '\nA) ', ['aA', 'Market research'], ': ', ['dA', '4'], '.', '\nB) ', ['aB', 'Product design'], ': ', ['dB', '6'], '.',
        '\nC) ', ['aC', 'Set the price'], ': ', ['dC', '1'], '.', '\nD) ', ['aD', 'Advertising campaign'], ': ', ['dD', '5'], '.',
        '\nE) ', ['aE', 'Manufacture the first batch'], ': ', ['dE', '8'], '.', '\nF) ', ['aF', 'Launch'], ': ', ['dF', '1'], '.',
        '\n\n', ['p1', 'Both the design and the price depend on the market research'], '. ',
        ['p2', 'The design must be finished before manufacturing starts'], ', and ', ['p3', 'the campaign cannot start without knowing the price'], '. ',
        ['n1', 'Manufacturing and the campaign can happen at the same time'], '. ', ['p4', 'F follows D and E'], ': ', ['e1', 'the launch is the last task'], '. And, naturally, ', ['s1', 'market research comes first'], '.'],
    },
    frags: {
      aA: { kind: 'activity', act: 'A' }, dA: { kind: 'duration', act: 'A', value: 4 }, aB: { kind: 'activity', act: 'B' }, dB: { kind: 'duration', act: 'B', value: 6 },
      aC: { kind: 'activity', act: 'C' }, dC: { kind: 'duration', act: 'C', value: 1 }, aD: { kind: 'activity', act: 'D' }, dD: { kind: 'duration', act: 'D', value: 5 },
      aE: { kind: 'activity', act: 'E' }, dE: { kind: 'duration', act: 'E', value: 8 }, aF: { kind: 'activity', act: 'F' }, dF: { kind: 'duration', act: 'F', value: 1 },
      s1: { kind: 'start', act: 'A', gives: g('A > B C D E F') },
      p1: { kind: 'precedence', gives: g('A > B C') }, p2: { kind: 'precedence', gives: g('B > E') }, p3: { kind: 'precedence', gives: g('C > D') },
      n1: { kind: 'none' }, p4: { kind: 'precedence', gives: g('D E > F') }, e1: { kind: 'end', act: 'F', gives: g('A B C D E > F') },
    },
    ref: { mode: 'pred', rows: rows([
      ['A', 4, '', 'Estudio de mercado', 'Market research'], ['B', 6, 'A', 'Diseño', 'Design'], ['C', 1, 'A', 'Precio', 'Price'],
      ['D', 5, 'C', 'Campaña', 'Campaign'], ['E', 8, 'B', 'Fabricación', 'Manufacturing'], ['F', 1, 'D, E', 'Lanzamiento', 'Launch']]) },
  };

  // list() da los enunciados visibles; list({ all: true }), también los ocultos (como examples, P9).
  const list = [ej1, ej2, ej3, ej4, ej5, ej6, ej7, cocina, congreso, mudanza, lanzamiento];
  const byId = Object.fromEntries(list.map((s) => [s.id, s]));
  const api = { list: (opts) => (opts && opts.all ? list.slice() : list.filter((s) => !s.hidden)), get: (id) => byId[id] || null };
  root.PNL = root.PNL || {};
  root.PNL.statements = api;
  if (isNode) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
