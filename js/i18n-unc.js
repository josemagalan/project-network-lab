/*
 * i18n-unc — textos de la pestaña «Duraciones inciertas» (M5 y M6), en español e inglés (spec f4a-tres-tiempos-tcl;
 * plan P5; tableros 63–71). Se carga bajo demanda con la vista v=unc y se fusiona con i18n (dict.es.unc y dict.en.unc),
 * así que las demás vistas no pagan estos bytes.
 */
(function (root) {
  'use strict';

  const isNode = typeof module !== 'undefined' && module.exports;
  const I = isNode ? require('./i18n.js') : root.PNL.i18n;

  const es = {
    region: 'Duraciones inciertas',
    sections: 'Apartado', m5: 'Tres tiempos (M5)', m6: 'El TCL y sus trampas (M6)',
    project: 'Proyecto', own: 'Tabla propia', fromWork: 'Partir del taller',
    act: 'Actividad', actTitle: 'Actividad {id} · {name}', actTitleNoName: 'Actividad {id}',
    toOwn: 'Al mover {a}, {m} o {b} en un ejemplo, el proyecto pasa a ser una tabla propia.',
    classic: 'Superponer la beta clásica',
    legend: { pert: 'beta-PERT', tri: 'triangular', classic: 'beta clásica (σ = ({b} − {a})/6)', mean: 'media de examen', sd: 'media ± desviación de la beta-PERT' },
    chartLabel: 'Curvas de la duración de {id} entre {a} y {b}: {list}. La media de examen es {mean}.',
    cmp: { exam: 'Fórmula de examen', pert: 'beta-PERT', classic: 'beta clásica', tri: 'triangular', mean: 'Media', var: 'Varianza',
      caption: 'Media y varianza de {id} con cada curva. La beta-PERT clava la media de examen; la clásica, la varianza. Ninguna cuadra con las dos (ver «Aprende más»).' },
    fixed: 'Sin incertidumbre ({a} = {m} = {b}): la duración es fija, {d}, y la varianza, 0. En lugar de la curva se dibuja una marca.',
    tableTitle: 'Proyecto · media y varianza de cada actividad', tableTitleUnit: 'Proyecto · media y varianza de cada actividad ({unit})',
    tableCaption: 'Media y varianza de examen de cada actividad de {name}',
    net: 'Red con las medias · camino crítico de las medias: {path}',
    netLabel: 'Red de {name} con las medias como duraciones',
    ownTitle: 'Tabla propia', ownHint: 'Escribe {a}, {m} y {b} de cada actividad. Mientras haya errores no se calcula.',
    ownFromWork: 'Tabla propia con la estructura del taller y {a} = {m} = {b} = la duración. El taller no cambia.',
    addRow: '+ Fila', removeRow: 'Quitar la fila {n}',
    paste: 'Pegar una tabla', pasteHint: 'Una actividad por línea: actividad, nombre, {a}, {m}, {b} y precedencias, separados por tabuladores o por punto y coma.',
    pasteApply: 'Usar esta tabla',
    cell: '{col} de la fila {n}',
    issues: '{n} errores que corregir', issuesOne: '1 error que corregir',
    invalid: 'Hasta corregir la tabla no hay medias, red ni probabilidades.',
    empty: 'La tabla está vacía: añade una fila o pega una tabla.',
    issue: {
      missing: 'Fila {row}: falta {f}.', badNum: 'Fila {row}: {f} debe ser un número mayor o igual que 0.', tooBig: 'Fila {row}: {f} admite como mucho 6 cifras y 4 decimales.',
      aGtM: 'Fila {row}: {a} no puede ser mayor que {m}.', mGtB: 'Fila {row}: {m} no puede ser mayor que {b}.',
    },
  };

  const en = {
    region: 'Uncertain durations',
    sections: 'Section', m5: 'Three-point estimates (M5)', m6: 'The CLT and its pitfalls (M6)',
    project: 'Project', own: 'Your own table', fromWork: 'Start from the workshop',
    act: 'Activity', actTitle: 'Activity {id} · {name}', actTitleNoName: 'Activity {id}',
    toOwn: 'Moving {a}, {m} or {b} in an example turns the project into your own table.',
    classic: 'Overlay the classic beta',
    legend: { pert: 'beta-PERT', tri: 'triangular', classic: 'classic beta (σ = ({b} − {a})/6)', mean: 'exam mean', sd: 'mean ± standard deviation of the beta-PERT' },
    chartLabel: 'Duration curves of {id} between {a} and {b}: {list}. The exam mean is {mean}.',
    cmp: { exam: 'Exam formula', pert: 'beta-PERT', classic: 'classic beta', tri: 'triangular', mean: 'Mean', var: 'Variance',
      caption: 'Mean and variance of {id} under each curve. The beta-PERT hits the exam mean; the classic beta, the variance. Neither matches both (see “Learn more”).' },
    fixed: 'No uncertainty ({a} = {m} = {b}): the duration is fixed at {d} and the variance is 0. A mark is drawn instead of a curve.',
    tableTitle: 'Project · mean and variance of each activity', tableTitleUnit: 'Project · mean and variance of each activity ({unit})',
    tableCaption: 'Exam mean and variance of each activity in {name}',
    net: 'Network with the means · critical path of the means: {path}',
    netLabel: 'Network of {name} with the means as durations',
    ownTitle: 'Your own table', ownHint: 'Type {a}, {m} and {b} for each activity. Nothing is calculated while there are errors.',
    ownFromWork: 'Your own table with the workshop structure and {a} = {m} = {b} = the duration. The workshop does not change.',
    addRow: '+ Row', removeRow: 'Remove row {n}',
    paste: 'Paste a table', pasteHint: 'One activity per line: activity, name, {a}, {m}, {b} and precedences, separated by tabs or semicolons.',
    pasteApply: 'Use this table',
    cell: '{col} in row {n}',
    issues: '{n} errors to fix', issuesOne: '1 error to fix',
    invalid: 'Until the table is fixed there are no means, network or probabilities.',
    empty: 'The table is empty: add a row or paste a table.',
    issue: {
      missing: 'Row {row}: {f} is missing.', badNum: 'Row {row}: {f} must be a number greater than or equal to 0.', tooBig: 'Row {row}: {f} takes at most 6 digits and 4 decimal places.',
      aGtM: 'Row {row}: {a} cannot be greater than {m}.', mGtB: 'Row {row}: {m} cannot be greater than {b}.',
    },
  };

  I.dict.es.unc = es;
  I.dict.en.unc = en;

  const api = { es, en };
  root.PNL = root.PNL || {};
  root.PNL.i18nUnc = api;
  if (isNode) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
