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
