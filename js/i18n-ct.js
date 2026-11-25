/*
 * i18n-ct — textos de la pestaña de coste–tiempo en español e inglés (spec f5b-coste-tiempo; plan P12, bloque 2: la
 * tabla del proyecto, los costes del proyecto, los errores y los avisos; tableros 122, 123 y 126). Se carga bajo demanda
 * con la vista v=ct (grupo ct) y se fusiona con i18n (dict.es.ct y dict.en.ct), así que las demás vistas no pagan estos
 * bytes.
 */
(function (root) {
  'use strict';

  const isNode = typeof module !== 'undefined' && module.exports;
  const I = isNode ? require('./i18n.js') : root.PNL.i18n;

  const es = {
    region: 'Coste–tiempo',
    project: 'Proyecto', own: 'Tabla propia', fromWork: 'Partir del taller',
    fromWorkDone: 'Se han copiado del taller las actividades, las predecesoras y las duraciones (como normales). Faltan la duración urgente y los costes. El taller no cambia.',
    tableTitle: 'Proyecto', tableTitleUnit: 'Proyecto ({unit})',
    tableLabel: 'Proyecto {name}: actividad, predecesoras, duraciones, costes y pendiente',
    source: 'Fuente: {source} · {unit} · {costUnit}',
    col: { id: 'Actividad', name: 'Nombre', links: 'Predecesoras', dn: 'Duración normal', dc: 'Duración urgente', cn: 'Coste normal', cc: 'Coste urgente',
      slope: 'Pendiente', msg: 'Errores y avisos', remove: 'Quitar' },
    cell: '{col}, fila {n}',
    addRow: 'Añadir una fila', removeRow: 'Quitar la fila {n}', clear: 'Vaciar',
    paste: 'Pegar desde una hoja de cálculo',
    pasteHint: 'Pega las filas (actividad, nombre, predecesoras, duración normal, duración urgente, coste normal y coste urgente, separadas por tabuladores) y pulsa «Añadir las filas».',
    pasteApply: 'Añadir las filas',
    pasteCut: 'No cabía todo lo pegado: la tabla admite {rows} filas. Lo que sobraba no se ha añadido.',
    help: 'Las duraciones son números enteros; los costes pueden llevar decimales. La pendiente es (coste urgente − coste normal) / (duración normal − duración urgente). Deje vacíos la duración urgente y los dos costes si la actividad no se puede acortar.',
    issues: { errorsOne: 'Hay 1 error: no se calcula hasta corregirlo.', errors: 'Hay {n} errores: no se calcula hasta corregirlos.',
      rowOne: 'Fila con error: {list}.', rows: 'Filas con error: {list}.', empty: 'La tabla está vacía: escriba una actividad o elija un ejemplo.' },
    issue: {
      badId: 'Identificador no válido: de 1 a 4 letras o cifras.',
      reservedId: '«{ids}» está reservado para el inicio o el fin del proyecto.',
      duplicateId: 'La actividad {ids} está repetida.',
      unknownRef: 'No existe la predecesora {ids}.',
      tooMany: 'Hay más de 30 actividades.',
      badDuration: 'La duración normal tiene que ser un número entero (0 o más).',
      badCrash: 'La duración urgente tiene que ser un número entero, no mayor que la normal.',
      badCost: 'Los costes tienen que ser números (0 o más).',
      costOrder: 'El coste urgente no puede ser menor que el normal.',
      noCrash: 'Sin punto urgente: {ids} no se puede acortar hasta que escriba su duración urgente y sus costes.',
    },
    costs: {
      title: 'Costes del proyecto',
      fixed: 'Indirecto fijo', perUnit: 'Indirecto por periodo', due: 'Plazo', penalty: 'Penalización por periodo de retraso', bonus: 'Prima por periodo de adelanto',
      hint: 'Opcionales; vacíos valen 0. Sin plazo no hay penalización ni prima.',
      fromExample: 'Los del ejemplo; se pueden cambiar.',
      bad: 'Escriba un número (0 o más).',
    },
  };

  const en = {
    region: 'Time–cost',
    project: 'Project', own: 'Own table', fromWork: 'Start from the workshop',
    fromWorkDone: 'The activities, predecessors and durations (as normal ones) have been copied from the workshop. The crash duration and the costs are missing. The workshop does not change.',
    tableTitle: 'Project', tableTitleUnit: 'Project ({unit})',
    tableLabel: 'Project {name}: activity, predecessors, durations, costs and slope',
    source: 'Source: {source} · {unit} · {costUnit}',
    col: { id: 'Activity', name: 'Name', links: 'Predecessors', dn: 'Normal duration', dc: 'Crash duration', cn: 'Normal cost', cc: 'Crash cost',
      slope: 'Slope', msg: 'Errors and warnings', remove: 'Remove' },
    cell: '{col}, row {n}',
    addRow: 'Add a row', removeRow: 'Remove row {n}', clear: 'Clear',
    paste: 'Paste from a spreadsheet',
    pasteHint: 'Paste the rows (activity, name, predecessors, normal duration, crash duration, normal cost and crash cost, separated by tabs) and press “Add the rows”.',
    pasteApply: 'Add the rows',
    pasteCut: 'Not everything pasted fitted: the table takes {rows} rows. What was left over has not been added.',
    help: 'Durations are whole numbers; costs may have decimals. The slope is (crash cost − normal cost) / (normal duration − crash duration). Leave the crash duration and both costs empty for an activity that cannot be shortened.',
    issues: { errorsOne: 'There is 1 error: nothing is calculated until it is fixed.', errors: 'There are {n} errors: nothing is calculated until they are fixed.',
      rowOne: 'Row with an error: {list}.', rows: 'Rows with errors: {list}.', empty: 'The table is empty: write an activity or choose an example.' },
    issue: {
      badId: 'Invalid identifier: 1 to 4 letters or digits.',
      reservedId: '“{ids}” is reserved for the start or the end of the project.',
      duplicateId: 'Activity {ids} is repeated.',
      unknownRef: 'Predecessor {ids} does not exist.',
      tooMany: 'There are more than 30 activities.',
      badDuration: 'The normal duration must be a whole number (0 or more).',
      badCrash: 'The crash duration must be a whole number no greater than the normal one.',
      badCost: 'Costs must be numbers (0 or more).',
      costOrder: 'The crash cost cannot be lower than the normal cost.',
      noCrash: 'No crash point: {ids} cannot be shortened until you write its crash duration and costs.',
    },
    costs: {
      title: 'Project costs',
      fixed: 'Fixed indirect cost', perUnit: 'Indirect cost per period', due: 'Deadline', penalty: 'Penalty per period late', bonus: 'Bonus per period early',
      hint: 'Optional; empty means 0. With no deadline there is neither penalty nor bonus.',
      fromExample: 'Those of the example; they can be changed.',
      bad: 'Write a number (0 or more).',
    },
  };

  I.dict.es.ct = es;
  I.dict.en.ct = en;

  const api = { es, en };
  root.PNL = root.PNL || {};
  root.PNL.i18nCt = api;
  if (isNode) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
