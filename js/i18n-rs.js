/*
 * i18n-rs — textos de la vista de recursos en español e inglés (spec f5c-recursos; plan §4, P15, bloque 2: la barra, la
 * tabla del proyecto, los recursos, los errores y los avisos; tableros 130, 131 y 139). Se carga bajo demanda con la
 * vista v=rs (grupo rs) y se fusiona con i18n (dict.es.rs y dict.en.rs), así que las demás vistas no pagan estos bytes.
 */
(function (root) {
  'use strict';

  const isNode = typeof module !== 'undefined' && module.exports;
  const I = isNode ? require('./i18n.js') : root.PNL.i18n;

  const es = {
    region: 'Recursos',
    project: 'Proyecto', own: 'Tabla propia', fromWork: 'Partir del taller',
    fromWorkDone: 'Se han copiado del taller las actividades, las predecesoras y las duraciones. Faltan los usos de los recursos. El taller no cambia.',
    mode: { label: 'Modo', lev: 'Nivelar', lim: 'Recursos limitados' },
    tableTitle: 'Proyecto', tableTitleUnit: 'Proyecto ({unit})',
    tableLabel: 'Proyecto {name}: actividad, predecesoras, duración y uso de cada recurso por periodo',
    source: 'Fuente: {source} · {unit}',
    capsLabel: 'Disponibles por periodo',
    cap: '{name}: {cap} por periodo', unlimited: '{name}: sin límite',
    col: { id: 'Actividad', name: 'Nombre', links: 'Predecesoras', d: 'Duración', msg: 'Errores y avisos', remove: 'Quitar' },
    cell: '{col}, fila {n}',
    addRow: 'Añadir una fila', removeRow: 'Quitar la fila {n}', clear: 'Vaciar',
    paste: 'Pegar desde una hoja de cálculo',
    pasteHint: 'Pega las filas (actividad, nombre, predecesoras, duración y el uso de cada recurso, separadas por tabuladores) y pulsa «Añadir las filas».',
    pasteApply: 'Añadir las filas',
    pasteCut: 'No cabía todo lo pegado: la tabla admite {rows} filas. Lo que sobraba no se ha añadido.',
    help: 'Las duraciones y los usos son números enteros por periodo (semanas, días…). Cada actividad usa la misma cantidad de cada recurso en todos los periodos que dura. Un uso vacío vale 0.',
    issues: { errorsOne: 'Hay 1 error: no se calcula hasta corregirlo.', errors: 'Hay {n} errores: no se calcula hasta corregirlos.',
      rowOne: 'Fila con error: {list}.', rows: 'Filas con error: {list}.', empty: 'La tabla está vacía: escriba una actividad o elija un ejemplo.' },
    issue: {
      badId: 'Identificador no válido: de 1 a 4 letras o cifras.',
      reservedId: '«{ids}» está reservado para el inicio o el fin del proyecto.',
      duplicateId: 'La actividad {ids} está repetida.',
      unknownRef: 'No existe la predecesora {ids}.',
      tooMany: 'Hay más de 30 actividades.',
      badDuration: 'La duración tiene que ser un número entero de 0 a 999.',
      badUse: '{res}: el uso tiene que ser un número entero de 0 a 999.',
      overCap: '{res}: usa {use} y solo hay {cap} por periodo; con recursos limitados no se puede programar nunca.',
      noUse: 'No usa ningún recurso (los usos vacíos valen 0).',
      milestone: 'Duración 0: un hito.',
    },
    bar: { res: 'Recurso', cal: 'Calendario' },
    cals: { es: 'Temprano', ls: 'Tardío', man: 'A mano', bur: 'Burgess', min: 'Mínimo del pico' },
    gantt: {
      title: 'Gantt y perfiles · {cal}', titleOne: 'Gantt y perfil · {cal}',
      label: 'Gantt y perfiles del calendario «{cal}» de {name}',
      bar: '{id}: empieza en {s} y acaba en {f}; por periodo, {uses}',
      profile: '{res}: pico {peak}, suma de cuadrados {ssq}, trabajo {work}',
      peak: 'Pico: {v}', ssq: 'Suma de cuadrados: {v}', work: 'Trabajo: {v}', cap: 'Disponibles: {v}',
      crit: 'crítica', free: 'con holgura', window: 'ventana entre el comienzo temprano y el fin tardío', use: 'en cada barra, el uso por periodo',
      ghost: 'donde estaba (temprano); +n, periodos que se ha retrasado',
      swipe: 'El Gantt y los perfiles se desplazan juntos dentro de su marco →',
    },
    manual: {
      title: 'Mover una actividad', hint: 'Arrastra una barra o elígela con el tabulador y muévela con las flechas; o escribe aquí su comienzo.',
      act: 'Actividad', start: 'Comienzo', apply: 'Aplicar', reset: 'Volver al temprano',
      notApplied: 'No se aplica:',
      bad: {
        window: '{id} solo puede empezar entre {lo} y {hi}: más tarde alargaría el proyecto.',
        pred: '{id} empezaría en {start} y {other}, su predecesora, acaba en {end}. Mueve antes {other} o deja {id} más tarde.',
        succ: '{id} acabaría en {end} y {other}, su sucesora, empieza en {start}. Mueve más tarde {other} o deja {id} antes.',
      },
      moved: '{id} empieza ahora en {s}.',
      note: 'Las sucesoras no se arrastran solas: si una choca, hay que moverla también.',
    },
    cmp: {
      title: 'Comparar calendarios', cal: 'Calendario', peak: 'Pico', ssq: 'Suma de cuadrados',
      passes: '({n} pasadas)', passesOne: '(1 pasada)', proved: '(demostrado)', notProved: '(no demostrado)', untouched: '(aún sin mover)',
      note: 'El trabajo ({work}) no cambia con el calendario: solo cambia cómo se reparte. Cuanto menor es la suma de cuadrados, más llano es el perfil.',
    },
    min: {
      proved: 'Demostrado: sin alargar el proyecto ({T}), {res} no puede bajar de un pico de {peak}. Se han mirado {nodes} calendarios.',
      notProved: 'No demostrado: la búsqueda se ha cortado. El mejor calendario encontrado tiene un pico de {peak}, y no se puede bajar de {lb}.',
    },
    bur: { note: 'Burgess mueve las actividades de la última a la primera, cada una al comienzo de menor suma de cuadrados (con empate, el más tardío), y repite hasta que ninguna se mueve: {n} pasadas, de {from} a {to}.' },
    roy: { title: 'Red ROY', titleCal: 'Red ROY · comienzo y fin en este calendario',
      legend: 'Caja: comienzo temprano, duración y fin temprano arriba; comienzo tardío, holgura total y fin tardío abajo. En rojo, el camino crítico.',
      legendCal: 'Arriba, comienzo, duración y fin en este calendario; abajo «·»: las holguras del CPM no valen para él. En rojo, el camino crítico del CPM.',
      moved: '+{n}', movedTitle: 'Retrasada {n} respecto al temprano' },
    alt: { times: 'Comienzo y fin de cada actividad', timesCaption: 'Comienzo y fin de cada actividad en el calendario «{cal}»',
      profile: 'Perfil por periodo', profileCaption: 'Uso de cada recurso en cada periodo, calendario «{cal}»',
      act: 'Actividad', d: 'Duración', start: 'Comienzo', end: 'Fin', period: 'Periodo' },
    res: {
      title: 'Recursos (hasta tres)', n: 'Recurso {n}', name: 'Nombre', cap: 'Disponibles por periodo',
      nameLabel: 'Nombre del recurso {n}', capLabel: 'Disponibles por periodo del recurso {n}',
      unlimited: 'vacío: sin límite', unused: 'sin nombre: no se usa',
      hint: 'La disponibilidad es la misma en todos los periodos. Al nivelar no se usa; con recursos limitados no se puede pasar de ella.',
      bad: 'Escribe un número entero de 1 a 9999, o déjalo vacío (sin límite).',
    },
  };

  const en = {
    region: 'Resources',
    project: 'Project', own: 'Own table', fromWork: 'Start from the workshop',
    fromWorkDone: 'The activities, predecessors and durations have been copied from the workshop. The resource uses are missing. The workshop does not change.',
    mode: { label: 'Mode', lev: 'Level', lim: 'Limited resources' },
    tableTitle: 'Project', tableTitleUnit: 'Project ({unit})',
    tableLabel: 'Project {name}: activity, predecessors, duration and use of each resource per period',
    source: 'Source: {source} · {unit}',
    capsLabel: 'Available per period',
    cap: '{name}: {cap} per period', unlimited: '{name}: unlimited',
    col: { id: 'Activity', name: 'Name', links: 'Predecessors', d: 'Duration', msg: 'Errors and warnings', remove: 'Remove' },
    cell: '{col}, row {n}',
    addRow: 'Add a row', removeRow: 'Remove row {n}', clear: 'Clear',
    paste: 'Paste from a spreadsheet',
    pasteHint: 'Paste the rows (activity, name, predecessors, duration and the use of each resource, separated by tabs) and press “Add the rows”.',
    pasteApply: 'Add the rows',
    pasteCut: 'Not everything pasted fitted: the table takes {rows} rows. The rest has not been added.',
    help: 'Durations and uses are whole numbers per period (weeks, days…). Each activity uses the same amount of each resource in every period it lasts. An empty use is 0.',
    issues: { errorsOne: 'There is 1 error: nothing is calculated until it is fixed.', errors: 'There are {n} errors: nothing is calculated until they are fixed.',
      rowOne: 'Row with an error: {list}.', rows: 'Rows with errors: {list}.', empty: 'The table is empty: write an activity or choose an example.' },
    issue: {
      badId: 'Invalid identifier: 1 to 4 letters or digits.',
      reservedId: '“{ids}” is reserved for the start or the end of the project.',
      duplicateId: 'Activity {ids} is repeated.',
      unknownRef: 'Predecessor {ids} does not exist.',
      tooMany: 'There are more than 30 activities.',
      badDuration: 'The duration must be a whole number from 0 to 999.',
      badUse: '{res}: the use must be a whole number from 0 to 999.',
      overCap: '{res}: it uses {use} and only {cap} are available per period; with limited resources it can never be scheduled.',
      noUse: 'It uses no resource (empty uses are 0).',
      milestone: 'Duration 0: a milestone.',
    },
    bar: { res: 'Resource', cal: 'Schedule' },
    cals: { es: 'Early', ls: 'Late', man: 'By hand', bur: 'Burgess', min: 'Minimum peak' },
    gantt: {
      title: 'Gantt chart and profiles · {cal}', titleOne: 'Gantt chart and profile · {cal}',
      label: 'Gantt chart and profiles of the “{cal}” schedule of {name}',
      bar: '{id}: starts at {s} and ends at {f}; per period, {uses}',
      profile: '{res}: peak {peak}, sum of squares {ssq}, work {work}',
      peak: 'Peak: {v}', ssq: 'Sum of squares: {v}', work: 'Work: {v}', cap: 'Available: {v}',
      crit: 'critical', free: 'with slack', window: 'window between early start and late finish', use: 'on each bar, the use per period',
      ghost: 'where it was (early); +n, periods it has been delayed',
      swipe: 'The Gantt chart and the profiles scroll together inside their frame →',
    },
    manual: {
      title: 'Move an activity', hint: 'Drag a bar, or reach it with Tab and move it with the arrow keys; or write its start here.',
      act: 'Activity', start: 'Start', apply: 'Apply', reset: 'Back to early',
      notApplied: 'Not applied:',
      bad: {
        window: '{id} can only start between {lo} and {hi}: later would lengthen the project.',
        pred: '{id} would start at {start} and {other}, its predecessor, ends at {end}. Move {other} earlier or keep {id} later.',
        succ: '{id} would end at {end} and {other}, its successor, starts at {start}. Move {other} later or keep {id} earlier.',
      },
      moved: '{id} now starts at {s}.',
      note: 'Successors are not dragged along: if one clashes, it has to be moved too.',
    },
    cmp: {
      title: 'Compare schedules', cal: 'Schedule', peak: 'Peak', ssq: 'Sum of squares',
      passes: '({n} passes)', passesOne: '(1 pass)', proved: '(proved)', notProved: '(not proved)', untouched: '(not moved yet)',
      note: 'The work ({work}) does not change with the schedule: only how it is spread does. The smaller the sum of squares, the flatter the profile.',
    },
    min: {
      proved: 'Proved: without lengthening the project ({T}), {res} cannot go below a peak of {peak}. {nodes} schedules were examined.',
      notProved: 'Not proved: the search was cut short. The best schedule found has a peak of {peak}, and it cannot go below {lb}.',
    },
    bur: { note: 'Burgess moves the activities from the last to the first, each to the start with the least sum of squares (on a tie, the latest), and repeats until none moves: {n} passes, from {from} to {to}.' },
    roy: { title: 'AON network', titleCal: 'AON network · start and finish in this schedule',
      legend: 'Box: early start, duration and early finish on top; late start, total slack and late finish below. In red, the critical path.',
      legendCal: 'On top, start, duration and finish in this schedule; below “·”: the CPM slacks do not apply to it. In red, the CPM critical path.',
      moved: '+{n}', movedTitle: 'Delayed {n} from early' },
    alt: { times: 'Start and finish of each activity', timesCaption: 'Start and finish of each activity in the “{cal}” schedule',
      profile: 'Profile per period', profileCaption: 'Use of each resource in each period, “{cal}” schedule',
      act: 'Activity', d: 'Duration', start: 'Start', end: 'Finish', period: 'Period' },
    res: {
      title: 'Resources (up to three)', n: 'Resource {n}', name: 'Name', cap: 'Available per period',
      nameLabel: 'Name of resource {n}', capLabel: 'Available per period of resource {n}',
      unlimited: 'empty: unlimited', unused: 'no name: not used',
      hint: 'The availability is the same in every period. When levelling it is not used; with limited resources it cannot be exceeded.',
      bad: 'Write a whole number from 1 to 9999, or leave it empty (unlimited).',
    },
  };

  I.dict.es.rs = es;
  I.dict.en.rs = en;

  const api = { es, en };
  root.PNL = root.PNL || {};
  root.PNL.i18nRs = api;
  if (isNode) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
