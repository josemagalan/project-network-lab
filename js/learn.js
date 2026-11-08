/*
 * learn — contenido del panel «Aprende más» en ES y EN: teoría del paso, un poco de historia,
 * pseudocódigo con la línea activa y referencias. Texto docente con licencia CC BY 4.0.
 * Revisado por el autor (tarea T017); la versión en español es la de referencia.
 */
(function (root) {
  'use strict';

  const pseudo = {
    es: [
      'orden ← orden topológico de las actividades',
      'ES(Inicio) ← 0',
      'para cada actividad j en orden:',
      '    ES(j) ← máx { EF(i) : i predecesora de j }',
      '    EF(j) ← ES(j) + d(j)',
      'LF(Fin) ← LS(Fin) ← EF(Fin)            // duración del proyecto',
      'para cada actividad i en orden inverso:',
      '    LF(i) ← mín { LS(j) : j sucesora de i }',
      '    LS(i) ← LF(i) − d(i)',
      'TF ← LF − ES − d;   FF ← mín ES(sucesoras) − ES − d',
      'IF ← máx(0, mín ES(sucesoras) − máx LF(predecesoras) − d);   SF ← LF − máx LF(predecesoras) − d',
      'críticas ← { i : TF(i) = 0 }',
    ],
    en: [
      'order ← topological order of the activities',
      'ES(Start) ← 0',
      'for each activity j in order:',
      '    ES(j) ← max { EF(i) : i predecessor of j }',
      '    EF(j) ← ES(j) + d(j)',
      'LF(End) ← LS(End) ← EF(End)            // project duration',
      'for each activity i in reverse order:',
      '    LF(i) ← min { LS(j) : j successor of i }',
      '    LS(i) ← LF(i) − d(i)',
      'TF ← LF − ES − d;   FF ← min ES(successors) − ES − d',
      'IF ← max(0, min ES(successors) − max LF(predecessors) − d);   SF ← LF − max LF(predecessors) − d',
      'critical ← { i : TF(i) = 0 }',
    ],
  };

  // Pseudocódigo de la red PERT (F2a): reglas de los conjuntos, numeración y cálculo sobre sucesos.
  const pseudoPert = {
    es: [
      'post(a) ← posteriores inmediatos de a, sin precedencias redundantes',
      'actividades con el mismo post(a) → terminan en el mismo suceso',
      'si además tienen las mismas precedentes → ficticia de identidad     // iguales',
      'si post(x) ⊂ post(y), sin otro conjunto entre ellos → ficticia de y a x   // contenidos',
      'si post(x) y post(y) se solapan → suceso de la parte común y una ficticia desde cada uno   // compartidos',
      'cada actividad sale del suceso del menor conjunto que la contiene y llega al de post(a)',
      'numerar: un suceso recibe número cuando ya lo tienen todos los que le llegan',
      'TE(1) ← 0;   TE(j) ← máx { TE(i) + d(i, j) : flechas que llegan a j }',
      'TL(fin) ← TE(fin);   TL(i) ← mín { TL(j) − d(i, j) : flechas que salen de i }',
      'holgura(i) ← TL(i) − TE(i)',
      'holguras de actividad y camino crítico ← los de la red ROY',
    ],
    en: [
      'post(a) ← immediate successors of a, without redundant precedences',
      'activities with the same post(a) → end at the same event',
      'if they also have the same predecessors → identity dummy     // equal',
      'if post(x) ⊂ post(y), with no set in between → dummy from y to x   // contained',
      'if post(x) and post(y) overlap → event for the common part and a dummy from each   // shared',
      'each activity leaves the event of the smallest set containing it and reaches that of post(a)',
      'numbering: an event gets its number once every event leading into it has one',
      'TE(1) ← 0;   TE(j) ← max { TE(i) + d(i, j) : arrows into j }',
      'TL(end) ← TE(end);   TL(i) ← min { TL(j) − d(i, j) : arrows out of i }',
      'slack(i) ← TL(i) − TE(i)',
      'activity floats and critical path ← those of the activity-on-node network',
    ],
  };
  const PERT_LINES = { succTable: [0], ruleEqual: [1, 2], ruleContained: [3], ruleShared: [4], place: [5], number: [6],
    eventForward: [7], eventBackward: [8], eventSlack: [9], floats: [10], critical: [10] };

  // Líneas del pseudocódigo que se resaltan en cada tipo de paso (graph 'aoa': las del pseudocódigo PERT).
  function pseudoLines(step, graph) {
    if (!step) return [];
    if (graph === 'aoa') return PERT_LINES[step.kind] || [];
    switch (step.kind) {
      case 'table': case 'build': return [0];
      case 'forward': return step.act === '@E' ? [3] : (step.formula.terms.length === 1 && step.formula.terms[0].from === '@S' ? [1, 4] : [3, 4]);
      case 'backward': return step.act === '@E' ? [5] : [7, 8];
      case 'float': return step.float === 'TF' || step.float === 'FF' ? [9] : [10];
      default: return [11];
    }
  }

  const topics = {
    table: {
      es: ['Una red de proyecto empieza con la tabla de precedencias: qué actividades hay, cuánto dura cada una y cuáles deben terminar antes de que empiece otra.',
        'Solo hacen falta las precedencias inmediatas. Si A precede a B y B precede a C, escribir también que A precede a C es redundante: no cambia nada y complica el dibujo.'],
      en: ['A project network starts from the precedence table: which activities there are, how long each one takes and which ones must finish before another can start.',
        'Only immediate precedences are needed. If A precedes B and B precedes C, also writing that A precedes C is redundant: it changes nothing and clutters the drawing.'],
    },
    build: {
      es: ['En la red ROY (actividad en nodo) cada actividad es un nodo y cada flecha una precedencia. No hacen falta actividades ficticias, salvo los nodos de inicio y fin, que tienen duración 0.',
        'Los nodos se colocan por niveles: una actividad va una columna a la derecha de su predecesora de nivel más alto, la que tiene más flechas desde el inicio.'],
      en: ['In an activity-on-node network (Roy’s method) each activity is a node and each arrow a precedence. No dummy activities are needed, apart from the start and end nodes, which take 0 time.',
        'Nodes are placed in levels: an activity goes one column to the right of its highest-level predecessor, the one with the most arrows from the start.'],
    },
    forward: {
      es: ['La pasada hacia delante calcula lo antes que puede empezar (ES) y terminar (EF) cada actividad. Se recorren las actividades en orden topológico, de modo que cuando llegamos a una ya conocemos todas sus predecesoras.',
        'Una actividad no puede empezar hasta que terminen todas sus predecesoras, así que su ES es el máximo de sus EF. La predecesora que da ese máximo es la que «manda».'],
      en: ['The forward pass works out the earliest each activity can start (ES) and finish (EF). Activities are visited in topological order, so when we reach one we already know all its predecessors.',
        'An activity cannot start until all its predecessors have finished, so its ES is the maximum of their EFs. The predecessor that gives that maximum is the one that “decides”.'],
    },
    backward: {
      es: ['La pasada hacia atrás calcula lo más tarde que puede terminar (LF) y empezar (LS) cada actividad sin retrasar el proyecto. Se parte del fin, cuya fecha tardía es la duración del proyecto, y se recorre la red en orden inverso.',
        'Una actividad debe terminar antes de que empiece la más urgente de sus sucesoras, así que su LF es el mínimo de sus LS.'],
      en: ['The backward pass works out the latest each activity can finish (LF) and start (LS) without delaying the project. It starts from the end, whose late date is the project duration, and visits the network in reverse order.',
        'An activity must finish before the most urgent of its successors starts, so its LF is the minimum of their LSs.'],
    },
    float: {
      es: ['Las holguras miden cuánto margen tiene una actividad. Aquí se usan las cuatro de Klastorin (2010): total, libre, de seguridad e independiente.',
        'La total mira solo al proyecto; la libre, a las sucesoras; la de seguridad, a las predecesoras; y la independiente, a las dos a la vez. Por eso la independiente puede salir negativa en la fórmula: se acota a 0.'],
      en: ['Floats measure how much slack an activity has. Here we use Klastorin’s four (2010): total, free, safety and independent (Klastorin calls them slacks).',
        'Total float looks only at the project; free float, at the successors; safety float, at the predecessors; and independent float, at both at once. That is why the independent float formula can turn negative: it is bounded at 0.'],
    },
    critical: {
      es: ['El camino crítico lo forman las actividades con holgura total nula. Su duración es la del proyecto: acortar el proyecto obliga a acortar alguna actividad crítica.',
        'Puede haber más de un camino crítico. Las actividades con poca holgura total también merecen atención: un retraso pequeño las vuelve críticas.'],
      en: ['The critical path is made of the activities with zero total float. Its length is the project duration: shortening the project means shortening some critical activity.',
        'There can be more than one critical path. Activities with little total float deserve attention too: a small delay makes them critical.'],
    },
    gantt: {
      es: ['El diagrama de Gantt sitúa cada actividad en el tiempo. Con fechas tempranas, cada barra empieza en su ES; la línea discontinua llega hasta su LF y representa la holgura total. Con fechas tardías, la barra termina en su LF y la línea discontinua va desde su ES hasta su LS.'],
      en: ['The Gantt chart places each activity in time. With early dates, each bar starts at its ES; the dashed line reaches its LF and represents the total float. With late dates, the bar ends at its LF and the dashed line runs from its ES to its LS.'],
    },
    matrix: {
      es: ['La matriz de encadenamiento permite calcular los tiempos sin dibujar la red. Cada fila es una actividad y en ella aparecen, en la columna de cada predecesora, la duración de esa predecesora.',
        'El tiempo mínimo de comienzo de una fila es el máximo de «tiempo mínimo de comienzo de la columna + valor de la celda». El tiempo máximo de comienzo de una columna es el mínimo de «tiempo máximo de comienzo de la fila − valor de la celda».'],
      en: ['The chain matrix lets you compute the times without drawing the network. Each row is an activity and shows, in the column of each predecessor, that predecessor’s duration.',
        'The earliest start time of a row is the maximum of “earliest start time of the column + cell value”. The latest start time of a column is the minimum of “latest start time of the row − cell value”.'],
    },
  };

  // Temas de la red PERT (F2a). Holguras: spec, Behaviour («Holguras ROY y PERT»).
  Object.assign(topics, {
    succTable: {
      es: ['En la red PERT (actividad en arco) cada actividad es una flecha y los nodos son sucesos: instantes en que terminan unas actividades y pueden empezar otras. Para dibujarla conviene partir de la tabla de posteriores: qué actividades pueden empezar cuando termina cada una.',
        'Las actividades con el mismo conjunto de posteriores terminan en el mismo suceso. Cuando los conjuntos no coinciden pero se tocan hacen falta actividades ficticias: flechas de duración 0 que solo transmiten precedencias. Las reglas de los conjuntos (iguales, contenidos y compartidos), enunciadas por José Manuel Galán (Universidad de Burgos), dicen dónde.'],
      en: ['In an activity-on-arrow (PERT) network each activity is an arrow and the nodes are events: moments when some activities finish and others can start. To draw it, it helps to start from the successor table: which activities can start when each one finishes.',
        'Activities with the same successor set end at the same event. When the sets differ but touch, dummy activities are needed: arrows that take 0 time and only carry precedences. The set rules (equal, contained and shared sets), stated by José Manuel Galán (University of Burgos), say where.'],
    },
    ruleEqual: {
      es: ['Dos actividades con las mismas precedentes y los mismos posteriores irían del mismo suceso al mismo suceso: serían dos flechas paralelas, y el par de sucesos (i, j) ya no identificaría cada actividad. Se resuelve con una ficticia de identidad: una de las dos termina en un suceso propio, unido al común por una ficticia.',
        'Aquí la ficticia la lleva la actividad que va después en orden alfabético. Es una convención: el número de ficticias es el mismo.'],
      en: ['Two activities with the same predecessors and the same successors would run from the same event to the same event: they would be two parallel arrows, and the pair of events (i, j) would no longer identify each activity. An identity dummy solves it: one of the two ends at an event of its own, joined to the common one by a dummy.',
        'Here the dummy goes on the activity that comes later in alphabetical order. It is a convention: the number of dummies is the same.'],
    },
    ruleContained: {
      es: ['Si los posteriores de X están contenidos en los de Y, lo que sigue a X también sigue a Y, pero no al revés. X e Y terminan en sucesos distintos y una ficticia va del suceso de Y al de X: así, lo que sale del suceso de X espera también a Y. Es una ficticia de dependencia.',
        'En una cadena de contenidos (X dentro de Y e Y dentro de Z) solo se unen los vecinos: Z con Y e Y con X. La ficticia de Z a X sobraría, porque ya está implicada por las otras dos.'],
      en: ['If the successors of X are contained in those of Y, whatever follows X also follows Y, but not the other way round. X and Y end at different events and a dummy runs from the event of Y to that of X: so whatever leaves the event of X also waits for Y. It is a dependency dummy.',
        'In a chain of contained sets (X inside Y and Y inside Z) only neighbours are joined: Z to Y and Y to X. A dummy from Z to X would be redundant, because the other two already imply it.'],
    },
    ruleShared: {
      es: ['Si dos conjuntos de posteriores se solapan sin que uno contenga al otro, la parte común necesita su propio suceso: de él salen las actividades comunes, y a él llega una ficticia desde el suceso de cada conjunto.',
        'Si esa parte común ya es el conjunto de otra actividad, o la parte común de otro par, se usa ese suceso. Las partes comunes entran a su vez en las reglas de contenidos y compartidos.'],
      en: ['If two successor sets overlap without one containing the other, the common part needs an event of its own: the common activities leave from it, and a dummy reaches it from the event of each set.',
        'If that common part is already the set of another activity, or the common part of another pair, that event is used. Common parts in turn take part in the contained-sets and shared-sets rules.'],
    },
    place: {
      es: ['Cada conjunto de posteriores, y cada parte común, es un suceso; se añaden un suceso inicial y otro final. Cada actividad sale del suceso del conjunto más pequeño que la contiene, o del inicial si no tiene precedentes, y llega al suceso de sus posteriores, o al final si no tiene.',
        'Las reglas dan siempre una red correcta, pero no siempre con el menor número de ficticias. Encontrar el mínimo es un problema NP-completo (Krishnamoorthy y Deo, 1979): no se conoce un método rápido para todos los casos. La herramienta lo calcula aparte, con una búsqueda exacta, y lo compara con las reglas.'],
      en: ['Each successor set, and each common part, is an event; a start event and an end event are added. Each activity leaves the event of the smallest set that contains it, or the start event if it has no predecessors, and reaches the event of its successors, or the end event if it has none.',
        'The rules always give a correct network, but not always one with the fewest dummies. Finding the minimum is an NP-complete problem (Krishnamoorthy and Deo, 1979): no fast method is known for every case. The tool works it out separately, with an exact search, and compares it with the rules.'],
    },
    number: {
      es: ['Los sucesos se numeran de modo que cada flecha vaya de un número menor (i) a uno mayor (j). Basta con dar número a un suceso cuando ya lo tienen todos los sucesos de los que le llegan flechas.',
        'Así cada actividad queda identificada por su par (i, j), y los cálculos se pueden hacer recorriendo los sucesos en orden de numeración.'],
      en: ['Events are numbered so that every arrow goes from a lower number (i) to a higher one (j). It is enough to number an event once every event with an arrow into it already has a number.',
        'That way each activity is identified by its pair (i, j), and the calculations can be done by visiting the events in numbering order.'],
    },
    eventForward: {
      es: ['La pasada hacia delante calcula el tiempo temprano de cada suceso (TE): lo antes que puede ocurrir. Un suceso ocurre cuando han terminado todas las flechas que llegan a él, así que TE(j) es el máximo de TE(i) + d sobre esas flechas. Las ficticias cuentan con duración 0.',
        'El tiempo temprano del suceso final es la duración del proyecto, la misma que en la red ROY.'],
      en: ['The forward pass works out the early time of each event (TE): the earliest it can happen. An event happens once every arrow into it has finished, so TE(j) is the maximum of TE(i) + d over those arrows. Dummies count with 0 duration.',
        'The early time of the end event is the project duration, the same as in the activity-on-node network.'],
    },
    eventBackward: {
      es: ['La pasada hacia atrás calcula el tiempo tardío de cada suceso (TL): lo más tarde que puede ocurrir sin retrasar el proyecto. Se parte del suceso final, con TL = TE, y TL(i) es el mínimo de TL(j) − d sobre las flechas que salen de i.'],
      en: ['The backward pass works out the late time of each event (TL): the latest it can happen without delaying the project. It starts from the end event, with TL = TE, and TL(i) is the minimum of TL(j) − d over the arrows leaving i.'],
    },
    eventSlack: {
      es: ['La holgura de un suceso es TL − TE. Los sucesos con holgura 0 marcan el camino crítico, pero una actividad entre dos sucesos con holgura 0 no tiene por qué ser crítica: hay que mirar su holgura total.'],
      en: ['The slack of an event is TL − TE. Events with zero slack mark the critical path, but an activity between two zero-slack events need not be critical: its total float is what counts.'],
    },
    minDummies: {
      es: ['Una red PERT es correcta si representa exactamente las precedencias de la tabla: no falta ninguna y no aparece ninguna nueva. Entre las correctas, la mínima es la que tiene menos ficticias. Las reglas de los conjuntos siempre dan una red correcta y, en la mayoría de las tablas de clase, también la mínima.',
        'A veces la red mínima se ahorra ficticias porque aprovecha una precedencia implícita: si A precede a D y D precede a E, A ya precede a E aunque la tabla no lo diga, y una ficticia puede llevar A hasta el suceso del que sale E sin cambiar nada. Las reglas trabajan sobre la tabla sin precedencias redundantes y no lo hacen. Con tablas pequeñas al azar, las reglas quedan por encima del mínimo en al menos un 6 % de los casos.',
        'Encontrar el mínimo es un problema NP-completo (Krishnamoorthy y Deo, 1979). La herramienta lo busca entre dos cotas: la superior son las ficticias de las reglas y la inferior sale de contar los sucesos que no se pueden fundir. Si coinciden, el mínimo queda demostrado sin buscar. La búsqueda tiene un presupuesto fijo de trabajo, no de tiempo: si se agota, el contador da un intervalo, «entre L y V», con la cota inferior y la mejor red encontrada, y el mismo enlace da el mismo intervalo en cualquier ordenador.'],
      en: ['An AOA network is correct if it represents exactly the precedences in the table: none is missing and no new one appears. Among the correct ones, the minimum network is the one with the fewest dummies. The set rules always give a correct network and, for most classroom tables, the minimum one too.',
        'Sometimes the minimum network saves dummies by using an implicit precedence: if A precedes D and D precedes E, A already precedes E even if the table does not say so, and a dummy can take A to the event E leaves from without changing anything. The rules work on the table without redundant precedences and do not do this. With small random tables, the rules end up above the minimum in at least 6% of cases.',
        'Finding the minimum is an NP-complete problem (Krishnamoorthy and Deo, 1979). The tool searches between two bounds: the upper one is the number of dummies of the rules, and the lower one comes from counting the events that cannot be merged. If they match, the minimum is proven without searching. The search has a fixed work budget, not a time limit: if it runs out, the counter gives an interval, “between L and V”, with the lower bound and the best network found, and the same link gives the same interval on any computer.'],
    },
    pertFloats: {
      es: ['Las holguras de una actividad son propiedades de la actividad, no del dibujo, así que son las mismas que en la red ROY.',
        'Muchos manuales las calculan sobre los sucesos, con tⱼ − tᵢ − d y tⱼ − tᵢ* − d. Con ficticias de identidad, o con sucesos de los que solo salen ficticias, esas fórmulas pueden dar menos de lo que hay. En el Ejercicio 7, la holgura libre de I sale 0 sobre los sucesos y en realidad es 6.'],
      en: ['The floats of an activity belong to the activity, not to the drawing, so they are the same as in the activity-on-node network.',
        'Many textbooks compute them on the events, with tⱼ − tᵢ − d and tⱼ − tᵢ* − d. With identity dummies, or with events that only dummies leave, those formulas can give less than the real float. In Exercise 7, the free float of I comes out as 0 on the events and is actually 6.'],
    },
  });

  // Esquemas de ejemplo de cada regla, copiados de los apuntes del autor (Tema 6a, diapositiva 15): solo la parte de
  // la red que explica la regla, con flechas abiertas en los extremos. Sucesos: número → [x, y]; un extremo [x, y] es
  // una flecha abierta. arcs y dummies: [nombre, desde, hasta]. En la tabla, hl marca lo que comparten las columnas.
  // La descripción en texto de cada esquema está en i18n (learn.schemeAlt).
  const schemes = {
    ruleEqual: {
      w: 280, h: 116,
      events: { 3: [120, 84], 4: [120, 30], 5: [210, 57] },
      arcs: [['C', [36, 84], 3], ['D', 3, 5], ['E', 4, 5], ['H', 5, [270, 57]]],
      dummies: [['F1', 3, 4]],
      table: { pre: ['C', 'C'], act: ['D', 'E'], post: [['H'], ['H']], hl: ['C', 'H'] },
    },
    ruleContained: {
      w: 260, h: 132,
      events: { 3: [120, 32], 4: [120, 100] },
      arcs: [['E', [36, 32], 3], ['F', [36, 100], 4], ['A', 3, [220, 32]], ['B', 4, [215, 76]], ['C', 4, [215, 124]]],
      dummies: [['F1', 3, 4]],
      table: { act: ['E', 'F'], post: [['A', 'B', 'C'], ['B', 'C']], hl: ['B', 'C'] },
    },
    ruleShared: {
      w: 330, h: 140,
      events: { 3: [110, 36], 4: [110, 104], 5: [210, 70] },
      arcs: [['E', [30, 36], 3], ['F', [30, 104], 4], ['A', 3, [175, 8]], ['D', 4, [175, 132]], ['B', 5, [310, 40]], ['C', 5, [310, 100]]],
      dummies: [['F1', 3, 5], ['F2', 4, 5]],
      table: { act: ['E', 'F'], post: [['A', 'B', 'C'], ['D', 'B', 'C']], hl: ['B', 'C'] },
    },
  };
  const schemeCredit = {
    es: 'Esquema de los apuntes de José Manuel Galán (Universidad de Burgos), que enunció las reglas de los conjuntos.',
    en: 'Diagram from the course notes of José Manuel Galán (University of Burgos), who stated the set rules.',
  };

  const history = {
    es: 'CPM nació en 1957–1958 en DuPont y Remington Rand (Kelley y Walker); PERT, en 1958, en la oficina de proyectos especiales de la Marina de EE. UU. para el programa de submarinos Polaris. Las dos usaban redes con las actividades en las flechas. Por las mismas fechas, en 1958, Bernard Roy desarrolló en la SEMA (París) el método de los potenciales Metra (MPM), con las actividades en los nodos: es la representación que hoy usan casi todos los programas de gestión de proyectos.',
    en: 'CPM was born in 1957–1958 at DuPont and Remington Rand (Kelley and Walker); PERT, in 1958, at the US Navy Special Projects Office for the Polaris submarine programme. Both used networks with the activities on the arrows. Around the same time, in 1958, Bernard Roy developed the Metra potential method (MPM) at SEMA in Paris, with the activities on the nodes: the representation almost all project management software uses today.',
  };

  const refs = [
    'Domínguez Machuca, J. A. et al. (1995). Dirección de operaciones: aspectos tácticos y operativos en la producción y los servicios. McGraw-Hill.',
    'Hillier, F. S., & Lieberman, G. J. (2015). Introduction to operations research (10th ed.). McGraw-Hill.',
    'Kelley, J. E., & Walker, M. R. (1959). Critical-path planning and scheduling. Proceedings of the Eastern Joint Computer Conference, 160–173.',
    'Klastorin, T. (2010). Gestión de proyectos. Profit Editorial.',
    'Krishnamoorthy, M. S., & Deo, N. (1979). Complexity of the minimum-dummy-activities problem in a PERT network. Networks, 9, 189–194.',
    'Malcolm, D. G., Roseboom, J. H., Clark, C. E., & Fazar, W. (1959). Application of a technique for research and development program evaluation. Operations Research, 7(5), 646–669.',
    'Roy, B. (Dir.) (1964). Les problèmes d’ordonnancement : applications et méthodes. Dunod.',
    'Sniedovich, M. (2005). Towards an AoA-free courseware for the critical path method. INFORMS Transactions on Education, 5(2), 47–63.',
  ];

  function topicFor(step, view, graph) {
    if (graph === 'aoa' && step) return step.kind === 'floats' ? 'pertFloats' : step.kind;
    if (view === 'matrix' && step && (step.kind === 'forward' || step.kind === 'backward')) return 'matrix';
    return step ? (step.kind === 'table' ? 'table' : step.kind) : 'table';
  }

  const api = { pseudo, pseudoPert, pseudoLines, topics, schemes, schemeCredit, history, refs, topicFor };
  root.PNL = root.PNL || {};
  root.PNL.learn = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
