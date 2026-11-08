/*
 * Textos de la interfaz en español e inglés y etiquetas de las dos notaciones.
 * t(lang, 'grupo.clave', params) sustituye {param}; una clave inexistente se devuelve tal cual.
 * Todo texto visible sale de aquí (constitución, principio 11): la prueba tests/i18n.test.js exige
 * las mismas claves en ES y EN. Funciona en el navegador (window.PNL.i18n) y en Node.
 */
(function (root) {
  'use strict';

  const languages = ['es', 'en'];

  const NOTATION = {
    en: { ES: 'ES', EF: 'EF', LS: 'LS', LF: 'LF', TF: 'TF', FF: 'FF', IF: 'IF', SF: 'SF' },
    es: { ES: 'tᵢ', EF: 'fᵢ', LS: 'tᵢ*', LF: 'fᵢ*', TF: 'HT', FF: 'HL', IF: 'HI', SF: 'HS' },
  };
  // Tiempos de los sucesos de la red PERT (F2a): TE y TL, o tᵢ y tᵢ* como en el Tema 6a.
  const EVENT_NOTATION = { en: { TE: 'TE', TL: 'TL' }, es: { TE: 'tᵢ', TL: 'tᵢ*' } };

  const dict = {
    es: {
      app: {
        title: 'Laboratorio de redes de proyectos', subtitle: 'PERT · CPM · ROY', docTitle: 'Laboratorio de redes de proyectos · PERT · CPM · ROY',
        noscript: 'Esta herramienta necesita JavaScript para funcionar.', skip: 'Saltar al contenido',
        urlWarning: 'El enlace estaba incompleto o dañado: se ha abierto lo que se ha podido recuperar.',
        structureOnlyWarning: 'Este ejemplo solo tiene precedencias, sin duraciones: se abre en la red PERT, donde se recorre su construcción.',
        footer: 'Código con licencia MIT · contenido docente CC BY 4.0 · Universidad de Burgos',
      },
      nav: { label: 'Secciones', route: 'Ruta guiada', work: 'Taller', home: 'Portada del laboratorio' },
      ctl: {
        lang: 'Idioma', nota: 'Notación', notaEn: 'ES · EF · LS · LF', notaEs: 'tᵢ · fᵢ · tᵢ* · fᵢ*',
        box: 'Caja', box4: '4 campos', box7: '7 campos', boxc: 'Compacta',
      },
      view: {
        graphLabel: 'Tipo de red', graphAon: 'Red ROY', graphAoa: 'Red PERT',
        pertHint: 'Cada círculo es un suceso con su número; a su lado, el tiempo temprano y el tardío. Las flechas discontinuas son ficticias.',
        succHint: 'Las reglas de los conjuntos se aplican sobre esta tabla; la última columna dice qué papel tiene cada actividad en la regla del paso.',
        label: 'Vista', net: 'Red', matrix: 'Matriz', asTable: 'Ver como tabla', hideTable: 'Ocultar la tabla',
        matrixHint: 'Fila: actividad · columna: su predecesora · celda: duración de la predecesora',
        matrixCorner: 'Actividad (fila) / predecesora (columna)',
        boxHint7: 'Caja: ES · d · EF arriba, actividad en medio, LS · TF · LF abajo.',
        boxHint4: 'Caja: actividad arriba, ES a la izquierda, LS a la derecha y duración abajo.',
        boxHintc: 'Sobre cada nodo: ES / duración / LS.',
        netLabel: 'Red ROY de {name}: {n} actividades', unitLine: '{name} · {n} actividades · {unit}',
      },
      player: {
        first: 'Inicio', prev: 'Anterior', play: 'Reproducir', pause: 'Pausa', next: 'Siguiente',
        counter: 'Paso {i} de {n}', phase: '{phase} · {i} de {n}',
        keys: '← → avanzar o retroceder · Espacio reproducir · Inicio volver',
      },
      phase: { forward: 'Hacia delante', backward: 'Hacia atrás', float: 'Holguras' },
      predict: {
        toggle: 'Modo predicción', check: 'Comprobar', show: 'Mostrar la solución', ok: 'correcto', wrong: 'revisar',
        summary: '{ok} correctas · {wrong} por revisar · {empty} sin rellenar',
        hidden: 'El paso siguiente no se muestra hasta comprobar o mostrar la solución.', your: 'Tu respuesta',
      },
      whatif: {
        button: '¿Y si…?', title: '¿Y si cambia una duración?', activity: 'Actividad', duration: 'Nueva duración',
        apply: 'Aplicar', reset: 'Volver a los datos originales', note: 'Duración del proyecto: {d} {unit} (antes {d0}).',
      },
      learn: { button: 'Aprende más', close: 'Cerrar', refs: 'Referencias', pseudo: 'Pseudocódigo', history: 'Un poco de historia',
        example: 'Un ejemplo', schemeTable: 'Tabla del ejemplo', schemePre: 'Actividad precedente', schemeAct: 'Actividad', schemePost: 'Actividad posterior',
        schemeAlt: {
          ruleEqual: 'C llega al suceso 3, del que sale D hacia el 5. E sale del suceso 4, unido al 3 por la ficticia F1, y también llega al 5. Del 5 sale H.',
          ruleContained: 'E llega al suceso 3, del que sale A; F llega al 4, del que salen B y C. La ficticia F1 va del 3 al 4: B y C esperan también a E.',
          ruleShared: 'E llega al suceso 3, del que sale A; F llega al 4, del que sale D. Las ficticias F1 y F2 van del 3 y del 4 al suceso 5, del que salen B y C.',
        },
      },
      legend: {
        active: 'Actividad del paso', chosen: 'Decide el máximo o el mínimo', compared: 'Se compara', critical: 'Crítica',
        noncritical: 'No crítica', float: 'Holgura total', dummy: 'Ficticia', rule: 'Ficticia que crea la regla',
      },
      steps: {
        table: 'La tabla de precedencias', build: 'La red ROY', forward: 'Pasada hacia delante · actividad {act}',
        forwardEnd: 'Pasada hacia delante · fin del proyecto', backward: 'Pasada hacia atrás · actividad {act}',
        backwardEnd: 'Pasada hacia atrás · fin del proyecto', float: 'Holgura {name}', critical: 'Camino crítico', gantt: 'Diagrama de Gantt',
      },
      narr: {
        table: 'Cada fila es una actividad con su duración y sus predecesoras. Pulsa → para construir la red.',
        build: 'Cada actividad es un nodo y cada flecha una precedencia. Se añaden un nodo de inicio y otro de fin, de duración 0.',
        forwardFirst: '{act} no tiene predecesoras: puede empezar en el instante 0.',
        forward: '{act} no puede empezar hasta que terminen sus predecesoras, {preds}. Manda la que termina más tarde: {chosen}.',
        forwardEnd: 'El proyecto termina cuando termina la última actividad: dura {d} {unit}.',
        backwardEnd: 'Se parte del fin: lo más tarde que puede terminar el proyecto es su duración, {d} {unit}.',
        backwardLast: '{act} no tiene sucesoras: puede terminar, como muy tarde, al final del proyecto.',
        backward: '{act} debe terminar antes de que empiece la más urgente de sus sucesoras, {succs}: manda {chosen}.',
        // Variantes del modo predicción: dicen qué se calcula sin dar la respuesta (decisión F7).
        forwardFirstHidden: '{act} no tiene predecesoras. ¿Cuándo puede empezar y cuándo termina?',
        forwardHidden: '{act} no puede empezar hasta que terminen sus predecesoras, {preds}. ¿Cuál termina más tarde?',
        forwardEndHidden: 'El proyecto termina cuando termina la última actividad. ¿Cuánto dura?',
        backwardEndHidden: 'Se parte del fin: lo más tarde que puede terminar el proyecto es su duración.',
        backwardLastHidden: '{act} no tiene sucesoras. ¿Cuándo puede terminar, como muy tarde?',
        backwardHidden: '{act} debe terminar antes de que empiece la más urgente de sus sucesoras, {succs}. ¿Cuál es?',
        forwardOneHidden: '{act} solo puede empezar cuando termine {preds}. ¿Cuándo empieza y cuándo termina?',
        backwardOneHidden: '{act} debe terminar antes de que empiece {succs}. ¿Cuándo puede terminar, como muy tarde?',
        critical: 'Las actividades con holgura total nula forman el camino crítico: {path}. Si cualquiera se retrasa, el proyecto se retrasa.',
        criticalMany: 'Hay {n} caminos críticos. Todas sus actividades tienen holgura total nula.',
        gantt: 'Cada barra va del comienzo temprano al fin temprano; la línea discontinua es la holgura total.',
      },
      floatName: { TF: 'total', FF: 'libre', IF: 'independiente', SF: 'de seguridad' },
      floatNarr: {
        TF: 'Cuánto puede retrasarse una actividad sin retrasar el proyecto.',
        FF: 'Cuánto puede retrasarse sin retrasar el comienzo temprano de ninguna sucesora.',
        IF: 'Lo que sobra aunque las predecesoras terminen lo más tarde posible y las sucesoras empiecen lo antes posible. Nunca es negativa.',
        SF: 'Lo que sobra si las predecesoras terminan lo más tarde posible, sin retrasar el proyecto.',
      },
      formula: {
        TF: 'LF − ES − d', FF: 'mín(ES sucesoras) − ES − d', IF: 'máx(0, mín(ES sucesoras) − máx(LF predecesoras) − d)',
        SF: 'LF − máx(LF predecesoras) − d',
      },
      issue: {
        cycle: 'Hay un ciclo: {ids}. Una actividad no puede acabar dependiendo de sí misma.',
        unknownRef: 'Fila {row}: «{ids}» no es una actividad de la tabla.',
        duplicateId: 'Fila {row}: el identificador {ids} está repetido.',
        badDuration: 'Fila {row} · {ids}: la duración debe ser un número mayor o igual que 0.',
        badId: 'Fila {row}: el identificador debe tener de 1 a 4 letras o cifras.',
        reservedId: 'Fila {row}: {ids} está reservado para los nodos de inicio y fin.',
        tooMany: 'Como máximo 30 actividades.',
        redundant: 'Fila {row} · {a} → {b} sobra: {a} ya precede a {b} por otro camino. No cambia los resultados.',
      },
      work: {
        example: 'Cargar un ejemplo', choose: '— Elige un ejemplo —', paste: 'Pegar desde una hoja de cálculo',
        pasteHint: 'Pega aquí las filas (actividad, nombre, duración, precedencias) y pulsa Añadir.',
        pasteApply: 'Añadir', clear: 'Vaciar', add: '+ Añadir actividad', remove: 'Quitar la fila', modeLegend: 'Escribe las precedencias como',
        modePred: 'Predecesoras (B va después de A)', modeSucc: 'Posteriores (A precede a D, E y G)', showComputed: 'Mostrar la columna calculada',
        colId: 'Actividad', colName: 'Nombre', colDuration: 'Duración', colPred: 'Predecesoras', colSucc: 'Posteriores', computed: '(calculada)',
        errors: '{n} errores que corregir antes de calcular', errorsOne: '1 error que corregir antes de calcular', warnings: '{n} avisos', warningsOne: '1 aviso',
        ready: 'Tabla correcta: {n} actividades, duración {d}.', readyNoDuration: 'Tabla correcta: {n} actividades.', stepByStep: 'Paso a paso', results: 'Resultados',
        urlNote: 'El enlace de la barra de direcciones guarda siempre tu tabla: puedes recargar o compartirlo.',
        empty: 'Escribe tu primera actividad o carga un ejemplo.',
      },
      results: {
        title: 'Tiempos y holguras', act: 'Act.', paths: 'Los {n} caminos de la red', pathsMany: 'La red tiene {n} caminos: demasiados para listarlos.',
        criticalPath: 'Camino crítico · {d} {unit}', criticalPaths: 'Caminos críticos · {d} {unit}', criticalMore: '… y {n} caminos críticos más', ganttTitle: 'Gantt', early: 'Fechas tempranas', late: 'Fechas tardías',
      },
      node: { start: 'Inicio', end: 'Fin' },
      a11y: { tableCaption: 'Tiempos de {name} hasta el paso actual' },
      pertSteps: {
        succTable: 'La tabla de posteriores', ruleEqual: 'Regla de los conjuntos iguales', ruleContained: 'Regla de los conjuntos contenidos',
        ruleShared: 'Regla de los conjuntos compartidos', place: 'Colocar sucesos, actividades y ficticias', number: 'Numerar los sucesos',
        eventForward: 'Tiempos tempranos · suceso {n}', eventBackward: 'Tiempos tardíos · suceso {n}', eventSlack: 'Holgura de los sucesos',
        floats: 'Holguras de las actividades',
      },
      pertNarr: {
        succTable: 'Cada fila es una actividad con sus posteriores inmediatos, sin precedencias redundantes. Las actividades con el mismo conjunto de posteriores terminarán en el mismo suceso. Pulsa → para aplicar las reglas de los conjuntos.',
        ruleEqual: '{acts} tienen los mismos posteriores y también las mismas precedentes: irían del mismo suceso al mismo suceso. Para distinguirlas se añade una ficticia de identidad: {dummies}.',
        ruleEqualNone: 'Ningún par de actividades tiene a la vez los mismos posteriores y las mismas precedentes: esta regla no se aplica.',
        ruleContained: 'Hay conjuntos de posteriores contenidos en otros: los de {acts}. Del suceso de cada conjunto mayor sale una ficticia hacia el del conjunto contenido, solo entre conjuntos vecinos: {dummies}.',
        ruleContainedNone: 'Ningún conjunto de posteriores está contenido en otro: esta regla no se aplica.',
        ruleShared: 'Hay conjuntos de posteriores que se solapan sin que uno contenga al otro: los de {acts}. Cada parte común tiene su propio suceso, al que llega una ficticia desde cada conjunto: {dummies}.',
        ruleSharedNone: 'Ningún par de conjuntos de posteriores se solapa sin que uno contenga al otro: esta regla no se aplica.',
        place: 'Cada conjunto de posteriores es un suceso, más el inicial y el final. Cada actividad sale del suceso del conjunto más pequeño que la contiene y llega al de sus posteriores. Las ficticias, discontinuas, duran 0. Ficticias de la red: {f}.',
        number: 'Los sucesos se numeran de modo que cada flecha vaya de un número menor a uno mayor: un suceso recibe número cuando ya lo tienen todos los sucesos de los que le llegan flechas.',
        numberEnd: 'Este ejemplo no tiene duraciones: la construcción termina aquí.',
        eventFirst: 'El suceso inicial ocurre en el instante 0.',
        eventForward: 'Al suceso {n} llegan {arcs}. No ocurre hasta que termine todo lo que llega a él: manda {chosen}.',
        eventForwardOne: 'Al suceso {n} solo llega {arcs}: el suceso ocurre cuando termina.',
        eventForwardEnd: 'El suceso final ocurre cuando termina todo lo que llega a él ({arcs}): el proyecto dura {d} {unit}.',
        eventBackwardEnd: 'Se parte del suceso final: lo más tarde que puede ocurrir es la duración del proyecto, {d} {unit}.',
        eventBackward: 'Del suceso {n} salen {arcs}. Tiene que ocurrir a tiempo para la más urgente: manda {chosen}.',
        eventBackwardOne: 'Del suceso {n} solo sale {arcs}: su tiempo tardío es el del suceso al que llega menos su duración.',
        eventSlack: 'La holgura de un suceso es cuánto puede retrasarse sin retrasar el proyecto: su tiempo tardío menos el temprano. Los sucesos con holgura 0 están en el camino crítico.',
        floats: 'Las holguras de cada actividad son las de la red ROY: son propiedades de la actividad, no del dibujo. Se ven en la tabla, debajo de la red.',
        slackFormula: 'holgura(i) = {TL}(i) − {TE}(i)',
        // Variantes del modo predicción: dicen qué se calcula sin dar la respuesta (decisión F7).
        eventFirstHidden: 'El suceso inicial. ¿En qué instante ocurre?',
        eventForwardHidden: 'Al suceso {n} llegan {arcs}. No ocurre hasta que termine todo lo que llega a él. ¿Qué flecha manda?',
        eventForwardOneHidden: 'Al suceso {n} solo llega {arcs}. ¿Cuándo ocurre?',
        eventForwardEndHidden: 'El suceso final ocurre cuando termina todo lo que llega a él ({arcs}). ¿Cuánto dura el proyecto?',
        eventBackwardEndHidden: 'Se parte del suceso final: lo más tarde que puede ocurrir es la duración del proyecto.',
        eventBackwardHidden: 'Del suceso {n} salen {arcs}. Tiene que ocurrir a tiempo para la más urgente. ¿Cuál es?',
        eventBackwardOneHidden: 'Del suceso {n} solo sale {arcs}. ¿Cuál es su tiempo tardío?',
      },
      pert: {
        netLabel: 'Red PERT de {name}: {e} sucesos, {n} actividades y {f} ficticias',
        arcsCaption: 'Arcos de la red PERT de {name}', colFrom: 'Desde el suceso', colTo: 'Hasta el suceso', colArc: 'Actividad o ficticia',
        colDur: 'Duración', colRule: 'Por qué', dummy: 'ficticia', select: 'Seleccionar {x}',
        rule: { equal: 'Conjuntos iguales', contained: 'Conjuntos contenidos', shared: 'Conjuntos compartidos', min: 'Red mínima' },
        succCaption: 'Tabla de posteriores de {name}', colAct: 'Actividad', colSucc: 'Posteriores', colRole: 'Papel en esta regla',
        roleSup: 'su conjunto contiene otro', roleSub: 'su conjunto está contenido en otro', roleShare: 'comparte parte de sus posteriores',
        roleEqual: 'paralela a otra actividad', none: 'ninguna', slackShort: 'Holgura',
      },
    },
    en: {
      app: {
        title: 'Project Network Lab', subtitle: 'PERT · CPM · ROY', docTitle: 'Project Network Lab · PERT · CPM · ROY',
        noscript: 'This tool needs JavaScript to work.', skip: 'Skip to content',
        urlWarning: 'The link was incomplete or damaged: what could be recovered has been opened.',
        structureOnlyWarning: 'This example only has precedences, no durations: it opens in the activity-on-arrow network, where you can follow its construction.',
        footer: 'Code under the MIT licence · teaching content CC BY 4.0 · University of Burgos',
      },
      nav: { label: 'Sections', route: 'Guided tour', work: 'Workshop', home: 'Lab home page' },
      ctl: {
        lang: 'Language', nota: 'Notation', notaEn: 'ES · EF · LS · LF', notaEs: 'tᵢ · fᵢ · tᵢ* · fᵢ*',
        box: 'Node box', box4: '4 fields', box7: '7 fields', boxc: 'Compact',
      },
      view: {
        graphLabel: 'Network type', graphAon: 'AON (ROY)', graphAoa: 'AOA (PERT)',
        pertHint: 'Each circle is an event with its number; next to it, its early and late times. Dashed arrows are dummies.',
        succHint: 'The set rules are applied to this table; the last column says what role each activity plays in this step’s rule.',
        label: 'View', net: 'Network', matrix: 'Matrix', asTable: 'Show as a table', hideTable: 'Hide the table',
        matrixHint: 'Row: activity · column: its predecessor · cell: duration of the predecessor',
        matrixCorner: 'Activity (row) / predecessor (column)',
        boxHint7: 'Box: ES · d · EF on top, activity in the middle, LS · TF · LF at the bottom.',
        boxHint4: 'Box: activity on top, ES on the left, LS on the right and duration at the bottom.',
        boxHintc: 'Above each node: ES / duration / LS.',
        netLabel: 'Activity-on-node network of {name}: {n} activities', unitLine: '{name} · {n} activities · {unit}',
      },
      player: {
        first: 'Start', prev: 'Previous', play: 'Play', pause: 'Pause', next: 'Next',
        counter: 'Step {i} of {n}', phase: '{phase} · {i} of {n}',
        keys: '← → step back or forward · Space play · Home go to the start',
      },
      phase: { forward: 'Forward pass', backward: 'Backward pass', float: 'Floats' },
      predict: {
        toggle: 'Prediction mode', check: 'Check', show: 'Show the answers', ok: 'correct', wrong: 'review',
        summary: '{ok} correct · {wrong} to review · {empty} left',
        hidden: 'The next step stays hidden until you check or show the answers.', your: 'Your answer',
      },
      whatif: {
        button: 'What if…?', title: 'What if a duration changes?', activity: 'Activity', duration: 'New duration',
        apply: 'Apply', reset: 'Back to the original data', note: 'Project duration: {d} {unit} (was {d0}).',
      },
      learn: { button: 'Learn more', close: 'Close', refs: 'References', pseudo: 'Pseudocode', history: 'A bit of history',
        example: 'An example', schemeTable: 'Table of the example', schemePre: 'Predecessor', schemeAct: 'Activity', schemePost: 'Successor',
        schemeAlt: {
          ruleEqual: 'C reaches event 3, from which D goes to event 5. E leaves event 4, joined to 3 by the dummy F1, and also reaches event 5. H leaves event 5.',
          ruleContained: 'E reaches event 3, from which A leaves; F reaches event 4, from which B and C leave. The dummy F1 runs from 3 to 4: B and C also wait for E.',
          ruleShared: 'E reaches event 3, from which A leaves; F reaches event 4, from which D leaves. The dummies F1 and F2 run from 3 and 4 to event 5, from which B and C leave.',
        },
      },
      legend: {
        active: 'Activity of this step', chosen: 'Decides the maximum or minimum', compared: 'Compared', critical: 'Critical',
        noncritical: 'Not critical', float: 'Total float', dummy: 'Dummy', rule: 'Dummy created by the rule',
      },
      steps: {
        table: 'The precedence table', build: 'The activity-on-node network', forward: 'Forward pass · activity {act}',
        forwardEnd: 'Forward pass · end of the project', backward: 'Backward pass · activity {act}',
        backwardEnd: 'Backward pass · end of the project', float: '{name} float', critical: 'Critical path', gantt: 'Gantt chart',
      },
      narr: {
        table: 'Each row is an activity with its duration and its predecessors. Press → to build the network.',
        build: 'Each activity is a node and each arrow a precedence. A start node and an end node, of duration 0, are added.',
        forwardFirst: '{act} has no predecessors: it can start at time 0.',
        forward: '{act} cannot start until its predecessors, {preds}, have finished. The one that finishes last decides: {chosen}.',
        forwardEnd: 'The project ends when its last activity ends: it takes {d} {unit}.',
        backwardEnd: 'Start from the end: the latest the project can finish is its duration, {d} {unit}.',
        backwardLast: '{act} has no successors: at the latest, it can finish when the project ends.',
        backward: '{act} must finish before the most urgent of its successors, {succs}, starts: {chosen} decides.',
        forwardFirstHidden: '{act} has no predecessors. When can it start, and when does it finish?',
        forwardHidden: '{act} cannot start until its predecessors, {preds}, have finished. Which one finishes last?',
        forwardEndHidden: 'The project ends when its last activity ends. How long does it take?',
        backwardEndHidden: 'Start from the end: the latest the project can finish is its duration.',
        backwardLastHidden: '{act} has no successors. At the latest, when can it finish?',
        backwardHidden: '{act} must finish before the most urgent of its successors, {succs}, starts. Which one is it?',
        forwardOneHidden: '{act} can only start when {preds} finishes. When does it start, and when does it finish?',
        backwardOneHidden: '{act} must finish before {succs} starts. At the latest, when can it finish?',
        critical: 'The activities with zero total float form the critical path: {path}. If any of them slips, the project slips.',
        criticalMany: 'There are {n} critical paths. All their activities have zero total float.',
        gantt: 'Each bar runs from the early start to the early finish; the dashed line is the total float.',
      },
      floatName: { TF: 'Total', FF: 'Free', IF: 'Independent', SF: 'Safety' },
      floatNarr: {
        TF: 'How long an activity can slip without delaying the project.',
        FF: 'How long it can slip without delaying the early start of any successor.',
        IF: 'What is left even if the predecessors finish as late as possible and the successors start as early as possible. Never negative.',
        SF: 'What is left if the predecessors finish as late as possible, without delaying the project.',
      },
      formula: {
        TF: 'LF − ES − d', FF: 'min(ES of successors) − ES − d', IF: 'max(0, min(ES of successors) − max(LF of predecessors) − d)',
        SF: 'LF − max(LF of predecessors) − d',
      },
      issue: {
        cycle: 'There is a cycle: {ids}. An activity cannot end up depending on itself.',
        unknownRef: 'Row {row}: “{ids}” is not an activity in the table.',
        duplicateId: 'Row {row}: the identifier {ids} is repeated.',
        badDuration: 'Row {row} · {ids}: the duration must be a number of 0 or more.',
        badId: 'Row {row}: the identifier must have 1 to 4 letters or digits.',
        reservedId: 'Row {row}: {ids} is reserved for the start and end nodes.',
        tooMany: 'At most 30 activities.',
        redundant: 'Row {row} · {a} → {b} is redundant: {a} already precedes {b} through another path. It does not change the results.',
      },
      work: {
        example: 'Load an example', choose: '— Choose an example —', paste: 'Paste from a spreadsheet',
        pasteHint: 'Paste the rows here (activity, name, duration, precedences) and press Add.',
        pasteApply: 'Add', clear: 'Clear', add: '+ Add activity', remove: 'Remove row', modeLegend: 'Write the precedences as',
        modePred: 'Predecessors (B comes after A)', modeSucc: 'Successors (A precedes D, E and G)', showComputed: 'Show the computed column',
        colId: 'Activity', colName: 'Name', colDuration: 'Duration', colPred: 'Predecessors', colSucc: 'Successors', computed: '(computed)',
        errors: '{n} errors to fix before calculating', errorsOne: '1 error to fix before calculating', warnings: '{n} warnings', warningsOne: '1 warning',
        ready: 'The table is correct: {n} activities, duration {d}.', readyNoDuration: 'The table is correct: {n} activities.', stepByStep: 'Step by step', results: 'Results',
        urlNote: 'The link in the address bar always holds your table: reload or share it.',
        empty: 'Write your first activity or load an example.',
      },
      results: {
        title: 'Times and floats', act: 'Act.', paths: 'The {n} paths of the network', pathsMany: 'The network has {n} paths: too many to list.',
        criticalPath: 'Critical path · {d} {unit}', criticalPaths: 'Critical paths · {d} {unit}', criticalMore: '… and {n} more critical paths', ganttTitle: 'Gantt', early: 'Early dates', late: 'Late dates',
      },
      node: { start: 'Start', end: 'End' },
      a11y: { tableCaption: 'Times of {name} up to the current step' },
      pertSteps: {
        succTable: 'The successor table', ruleEqual: 'Equal-sets rule', ruleContained: 'Contained-sets rule',
        ruleShared: 'Shared-sets rule', place: 'Placing events, activities and dummies', number: 'Numbering the events',
        eventForward: 'Early times · event {n}', eventBackward: 'Late times · event {n}', eventSlack: 'Event slack',
        floats: 'Activity floats',
      },
      pertNarr: {
        succTable: 'Each row is an activity with its immediate successors, without redundant precedences. Activities with the same successor set will end at the same event. Press → to apply the set rules.',
        ruleEqual: '{acts} have the same successors and also the same predecessors: they would run from the same event to the same event. To tell them apart, an identity dummy is added: {dummies}.',
        ruleEqualNone: 'No pair of activities has both the same successors and the same predecessors: this rule does not apply.',
        ruleContained: 'Some successor sets are contained in others: those of {acts}. A dummy runs from the event of each larger set to the event of the set it contains, only between neighbouring sets: {dummies}.',
        ruleContainedNone: 'No successor set is contained in another: this rule does not apply.',
        ruleShared: 'Some successor sets overlap without one containing the other: those of {acts}. Each common part gets its own event, reached by a dummy from each set: {dummies}.',
        ruleSharedNone: 'No two successor sets overlap without one containing the other: this rule does not apply.',
        place: 'Each successor set is an event, plus the start and end events. Each activity leaves the event of the smallest set that contains it and reaches the event of its own successors. Dummies, dashed, take 0 time. Dummies in the network: {f}.',
        number: 'Events are numbered so that every arrow goes from a lower number to a higher one: an event gets its number once every event with an arrow into it has one.',
        numberEnd: 'This example has no durations: the construction ends here.',
        eventFirst: 'The start event happens at time 0.',
        eventForward: '{arcs} reach event {n}. It cannot happen until everything reaching it has finished: {chosen} decides.',
        eventForwardOne: 'Only {arcs} reaches event {n}: the event happens when it finishes.',
        eventForwardEnd: 'The end event happens when everything reaching it ({arcs}) has finished: the project takes {d} {unit}.',
        eventBackwardEnd: 'We start from the end event: the latest it can happen is the project duration, {d} {unit}.',
        eventBackward: '{arcs} leave event {n}. It must happen in time for the most urgent one: {chosen} decides.',
        eventBackwardOne: 'Only {arcs} leaves event {n}: its late time is that of the event it reaches minus its duration.',
        eventSlack: 'The slack of an event is how much it can slip without delaying the project: its late time minus its early time. Events with zero slack lie on the critical path.',
        floats: 'The floats of each activity are those of the activity-on-node network: they belong to the activity, not to the drawing. They are shown in the table below the network.',
        slackFormula: 'slack(i) = {TL}(i) − {TE}(i)',
        // Prediction-mode variants: they say what is being worked out without giving the answer (decision F7).
        eventFirstHidden: 'The start event. At what time does it happen?',
        eventForwardHidden: '{arcs} reach event {n}. It cannot happen until everything reaching it has finished. Which arrow decides?',
        eventForwardOneHidden: 'Only {arcs} reaches event {n}. When does it happen?',
        eventForwardEndHidden: 'The end event happens when everything reaching it ({arcs}) has finished. How long does the project take?',
        eventBackwardEndHidden: 'We start from the end event: the latest it can happen is the project duration.',
        eventBackwardHidden: '{arcs} leave event {n}. It must happen in time for the most urgent one. Which one is it?',
        eventBackwardOneHidden: 'Only {arcs} leaves event {n}. What is its late time?',
      },
      pert: {
        netLabel: 'Activity-on-arrow network of {name}: {e} events, {n} activities and {f} dummies',
        arcsCaption: 'Arrows of the activity-on-arrow network of {name}', colFrom: 'From event', colTo: 'To event', colArc: 'Activity or dummy',
        colDur: 'Duration', colRule: 'Why', dummy: 'dummy', select: 'Select {x}',
        rule: { equal: 'Equal sets', contained: 'Contained sets', shared: 'Shared sets', min: 'Minimum network' },
        succCaption: 'Successor table of {name}', colAct: 'Activity', colSucc: 'Successors', colRole: 'Role in this rule',
        roleSup: 'its set contains another', roleSub: 'its set is contained in another', roleShare: 'shares part of its successors',
        roleEqual: 'parallel to another activity', none: 'none', slackShort: 'Slack',
      },
    },
  };

  // Cadenas que coinciden a propósito en los dos idiomas (siglas, fórmulas y «Gantt»).
  const SAME_IN_BOTH = ['app.subtitle', 'ctl.notaEn', 'ctl.notaEs', 'formula.TF', 'results.ganttTitle'];

  function lookup(lang, key) {
    const table = dict[lang] || dict.es;
    const v = key.split('.').reduce((a, p) => (a && Object.prototype.hasOwnProperty.call(a, p) ? a[p] : undefined), table);
    return typeof v === 'string' ? v : undefined;
  }

  function t(lang, key, params) {
    let s = lookup(lang, key);
    if (s === undefined) return key;
    if (params) s = s.replace(/\{(\w+)\}/g, (m, p) => (params[p] == null ? m : String(params[p])));
    return s;
  }

  function list(lang, items) {
    const xs = items.map(String);
    if (xs.length <= 1) return xs.join('');
    const and = lang === 'en' ? ' and ' : ' y ';
    return xs.slice(0, -1).join(', ') + and + xs[xs.length - 1];
  }

  const notation = (nota) => Object.assign({}, NOTATION[nota] || NOTATION.en);
  const eventNotation = (nota) => Object.assign({}, EVENT_NOTATION[nota] || EVENT_NOTATION.en);

  const api = { languages, dict, SAME_IN_BOTH, t, list, notation, eventNotation };
  root.PNL = root.PNL || {};
  root.PNL.i18n = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
