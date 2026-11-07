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

  const dict = {
    es: {
      app: {
        title: 'Laboratorio de redes de proyectos', subtitle: 'PERT · CPM · ROY', docTitle: 'Laboratorio de redes de proyectos · PERT · CPM · ROY',
        noscript: 'Esta herramienta necesita JavaScript para funcionar.', skip: 'Saltar al contenido',
        urlWarning: 'El enlace estaba incompleto o dañado: se ha abierto lo que se ha podido recuperar.',
        footer: 'Código con licencia MIT · contenido docente CC BY 4.0 · Universidad de Burgos',
      },
      nav: { label: 'Secciones', route: 'Ruta guiada', work: 'Taller', home: 'Portada del laboratorio' },
      ctl: {
        lang: 'Idioma', nota: 'Notación', notaEn: 'ES · EF · LS · LF', notaEs: 'tᵢ · fᵢ · tᵢ* · fᵢ*',
        box: 'Caja', box4: '4 campos', box7: '7 campos', boxc: 'Compacta',
      },
      view: {
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
      learn: { button: 'Aprende más', close: 'Cerrar', refs: 'Referencias', pseudo: 'Pseudocódigo', history: 'Un poco de historia' },
      legend: {
        active: 'Actividad del paso', chosen: 'Decide el máximo o el mínimo', compared: 'Se compara', critical: 'Crítica',
        noncritical: 'No crítica', float: 'Holgura total',
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
        ready: 'Tabla correcta: {n} actividades, duración {d}.', stepByStep: 'Paso a paso', results: 'Resultados',
        urlNote: 'El enlace de la barra de direcciones guarda siempre tu tabla: puedes recargar o compartirlo.',
        empty: 'Escribe tu primera actividad o carga un ejemplo.',
      },
      results: {
        title: 'Tiempos y holguras', act: 'Act.', paths: 'Los {n} caminos de la red', pathsMany: 'La red tiene {n} caminos: demasiados para listarlos.',
        criticalPath: 'Camino crítico · {d} {unit}', criticalPaths: 'Caminos críticos · {d} {unit}', criticalMore: '… y {n} caminos críticos más', ganttTitle: 'Gantt', early: 'Fechas tempranas', late: 'Fechas tardías',
      },
      node: { start: 'Inicio', end: 'Fin' },
      a11y: { tableCaption: 'Tiempos de {name} hasta el paso actual' },
    },
    en: {
      app: {
        title: 'Project Network Lab', subtitle: 'PERT · CPM · ROY', docTitle: 'Project Network Lab · PERT · CPM · ROY',
        noscript: 'This tool needs JavaScript to work.', skip: 'Skip to content',
        urlWarning: 'The link was incomplete or damaged: what could be recovered has been opened.',
        footer: 'Code under the MIT licence · teaching content CC BY 4.0 · University of Burgos',
      },
      nav: { label: 'Sections', route: 'Guided tour', work: 'Workshop', home: 'Lab home page' },
      ctl: {
        lang: 'Language', nota: 'Notation', notaEn: 'ES · EF · LS · LF', notaEs: 'tᵢ · fᵢ · tᵢ* · fᵢ*',
        box: 'Node box', box4: '4 fields', box7: '7 fields', boxc: 'Compact',
      },
      view: {
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
      learn: { button: 'Learn more', close: 'Close', refs: 'References', pseudo: 'Pseudocode', history: 'A bit of history' },
      legend: {
        active: 'Activity of this step', chosen: 'Decides the maximum or minimum', compared: 'Compared', critical: 'Critical',
        noncritical: 'Not critical', float: 'Total float',
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
        ready: 'The table is correct: {n} activities, duration {d}.', stepByStep: 'Step by step', results: 'Results',
        urlNote: 'The link in the address bar always holds your table: reload or share it.',
        empty: 'Write your first activity or load an example.',
      },
      results: {
        title: 'Times and floats', act: 'Act.', paths: 'The {n} paths of the network', pathsMany: 'The network has {n} paths: too many to list.',
        criticalPath: 'Critical path · {d} {unit}', criticalPaths: 'Critical paths · {d} {unit}', criticalMore: '… and {n} more critical paths', ganttTitle: 'Gantt', early: 'Early dates', late: 'Late dates',
      },
      node: { start: 'Start', end: 'End' },
      a11y: { tableCaption: 'Times of {name} up to the current step' },
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

  const api = { languages, dict, SAME_IN_BOTH, t, list, notation };
  root.PNL = root.PNL || {};
  root.PNL.i18n = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
