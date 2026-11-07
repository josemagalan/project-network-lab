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

  // Líneas del pseudocódigo que se resaltan en cada tipo de paso.
  function pseudoLines(step) {
    if (!step) return [];
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

  const history = {
    es: 'CPM nació en 1957–1958 en DuPont y Remington Rand (Kelley y Walker); PERT, en 1958, en la oficina de proyectos especiales de la Marina de EE. UU. para el programa de submarinos Polaris. Las dos usaban redes con las actividades en las flechas. Por las mismas fechas, en 1958, Bernard Roy desarrolló en la SEMA (París) el método de los potenciales Metra (MPM), con las actividades en los nodos: es la representación que hoy usan casi todos los programas de gestión de proyectos.',
    en: 'CPM was born in 1957–1958 at DuPont and Remington Rand (Kelley and Walker); PERT, in 1958, at the US Navy Special Projects Office for the Polaris submarine programme. Both used networks with the activities on the arrows. Around the same time, in 1958, Bernard Roy developed the Metra potential method (MPM) at SEMA in Paris, with the activities on the nodes: the representation almost all project management software uses today.',
  };

  const refs = [
    'Domínguez Machuca, J. A. et al. (1995). Dirección de operaciones: aspectos tácticos y operativos en la producción y los servicios. McGraw-Hill.',
    'Hillier, F. S., & Lieberman, G. J. (2015). Introduction to operations research (10th ed.). McGraw-Hill.',
    'Kelley, J. E., & Walker, M. R. (1959). Critical-path planning and scheduling. Proceedings of the Eastern Joint Computer Conference, 160–173.',
    'Klastorin, T. (2010). Gestión de proyectos. Profit Editorial.',
    'Malcolm, D. G., Roseboom, J. H., Clark, C. E., & Fazar, W. (1959). Application of a technique for research and development program evaluation. Operations Research, 7(5), 646–669.',
    'Roy, B. (Dir.) (1964). Les problèmes d’ordonnancement : applications et méthodes. Dunod.',
    'Sniedovich, M. (2005). Towards an AoA-free courseware for the critical path method. INFORMS Transactions on Education, 5(2), 47–63.',
  ];

  function topicFor(step, view) {
    if (view === 'matrix' && step && (step.kind === 'forward' || step.kind === 'backward')) return 'matrix';
    return step ? (step.kind === 'table' ? 'table' : step.kind) : 'table';
  }

  const api = { pseudo, pseudoLines, topics, history, refs, topicFor };
  root.PNL = root.PNL || {};
  root.PNL.learn = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
