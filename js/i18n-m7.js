/*
 * i18n-m7 — textos de M7, Montecarlo e índices (spec f4b-montecarlo-indices; plan P4 y P11, bloque 2; tableros 72–80).
 * Se carga bajo demanda con um=m7 (grupo u7) y se fusiona con i18n (dict.es.m7 y dict.en.m7).
 */
(function (root) {
  'use strict';

  const isNode = typeof module !== 'undefined' && module.exports;
  const I = isNode ? require('./i18n.js') : root.PNL.i18n;

  const es = {
    views: { label: 'Vista', dist: 'Duración del proyecto', idx: 'Índices' },
    download: 'Descargar:', py: 'Código en Python', json: 'Proyecto en JSON', jsonDone: 'Proyecto descargado en JSON.',
    distAll: 'Distribución', distDisc: 'Distribución: discreta (la del ejemplo)', mixed: 'varias', mixedShort: 'varias distribuciones',
    kind: { pert: 'beta-PERT', classic: 'beta clásica', tri: 'triangular', unif: 'uniforme', norm: 'normal truncada en 0', logn: 'lognormal', disc: 'discreta' },
    perAct: 'Distribuciones por actividad', reps: 'Réplicas', pct: 'Percentil P', badPct: 'Un número entero entre 1 y 99.',
    corr: 'Crucialidad:', corrName: { p: 'Pearson', s: 'Spearman' },
    running: 'Simulando {n} réplicas…', done: '{n} réplicas simuladas. P(duración ≤ {T}) = {p}.',
    distsTitle: 'Distribuciones por actividad · media y varianza de la distribución elegida',
    distsTitleUnit: 'Distribuciones por actividad · media y varianza de la distribución elegida ({unit})',
    colDist: 'Distribución', colMean: 'Media', colVar: 'Varianza', distOf: 'Distribución de {id}', edit: 'Editar',
    normalNote: 'La normal de M6 sigue con las fórmulas de examen de a, m y b; una discreta editada aporta su propia media y su varianza.',
    truncNote: 'Normal truncada en 0: si σ es grande, su media y su varianza quedan algo por encima de las de PERT.',
    discStart: 'Discreta de {id}: al empezar, a, m y b con 1/6, 4/6 y 1/6.', discEdited: 'Discreta de {id} (editada: ya no sigue a a, m y b).',
    value: 'Valor', prob: 'Probabilidad', valueN: 'Valor {n} de {id}', probN: 'Probabilidad {n} de {id}', removeValue: 'Quitar el valor {n} de {id}',
    addValue: '+ Valor', reset: 'Volver a {a}, {m}, {b} (1/6, 4/6, 1/6)',
    discHint: 'Valores de 0 en adelante y todos distintos, hasta 20; probabilidades en decimal o en fracción (1/3).',
    disc: {
      empty: '{id}: escribe al menos un valor con su probabilidad.', nan: '{id}: cada valor y cada probabilidad tienen que ser un número.',
      negative: '{id}: los valores no pueden ser negativos.', repeated: '{id}: hay valores repetidos.',
      prob: '{id}: cada probabilidad tiene que ser mayor que 0.', sum: '{id}: las probabilidades suman {sum}; tienen que sumar 1.',
    },
    blocked: 'Mientras {ids} tenga errores no se simula; se ve en gris la última simulación válida.',
    ownErrors: 'La tabla propia tiene {n} errores', ownErrorsText: 'Mientras haya errores no se simula. La tabla se corrige en',
    toM5: 'Tres tiempos (M5)',
    histTitle: 'Duración del proyecto · simulación de {n} réplicas ({what})',
    histLabel: 'Histograma de {n} réplicas, media {mean}, con la normal de M6 N({mu}; {var}) y el plazo {T}: P(duración ≤ {T}) = {ps} simulada y {pn} con la normal.',
    legendSim: 'simulación', legendNormal: 'normal de M6: N({mu}; {var}), camino crítico de las medias', legendMean: 'media simulada',
    normalOnly: 'La normal mira solo {path}; la simulación, el proyecto entero.',
    allFixed: 'Sin incertidumbre: todas las duraciones son fijas y el proyecto dura siempre {T}.',
    mergeNote: 'La media simulada ({mean}) supera la de PERT ({mu}) y P(duración ≤ {T}) baja de {pn} a {ps}: el sesgo de fusión de M6, ahora con el proyecto entero.',
    cdfTitle: 'Función de distribución · percentiles', cdfLabel: 'Función de distribución de la duración simulada, con la de la normal de M6: {list}.',
    legendCdf: 'simulación', legendNormalShort: 'normal de M6',
    resTitle: 'Resultados (± es la mitad del intervalo al 95 %)', colSim: 'Simulación', colNormal: 'PERT (normal de M6)', colExact: 'Exacta',
    rowMean: 'Media', rowSd: 'Desviación', rowP: 'P(duración ≤ {T})', pm: '{v} ± {e}', chosen: '(elegido)',
    pctText: 'Con un {p} % de probabilidad se termina en {T} {unit} o menos.', pctTextNoUnit: 'Con un {p} % de probabilidad se termina en {T} o menos.',
    idxTitle: 'Índices de cada actividad · {n} réplicas', idxTable: 'Tabla de índices', idxRunning: 'Calculando los índices…',
    idxCaption: 'Ordenadas por {order}.', idxCaptionExact: 'Simulación y cuenta exacta ({combos} combinaciones). Ordenadas por {order}.',
    colAct: 'Actividad', crit: 'Criticidad', crucP: 'Crucialidad (Pearson)', crucS: 'Crucialidad (Spearman)', sig: 'Significación',
    order: { c: 'criticidad', u: 'crucialidad' }, orderLabel: 'Orden', torTitle: 'Tornado en espejo',
    torLabel: 'Tornado en espejo, ordenado por {order}: {list}.', torItem: '{id}, criticidad {c} y crucialidad {u}',
    noUnc: 'Sin incertidumbre: cada actividad es crítica siempre o nunca, y la crucialidad es 0 (nada varía).',
    fixedCruc: 'Una actividad de duración fija tiene crucialidad 0: no varía, así que no puede explicar la duración del proyecto.',
    pathsTitle: 'Caminos y su criticidad', colPath: 'Camino',
    tieNote: 'Suman {sum}, no 1: en las réplicas con empate hay dos caminos críticos a la vez. La diapositiva del Tema 6c da cada empate a un solo camino (Aprende más).',
    offNote: '{path} no es el camino crítico de las medias ({mean}), pero es crítico en el {p} % de las réplicas.',
    netTitle: 'Red ROY coloreada', shadeLabel: 'Color', shade: { cr: 'criticidad', cu: 'crucialidad', si: 'significación' },
    scaleNote: '(el valor va escrito en cada caja)',
  };

  const en = {
    views: { label: 'View', dist: 'Project duration', idx: 'Indices' },
    download: 'Download:', py: 'Python code', json: 'Project as JSON', jsonDone: 'Project downloaded as JSON.',
    distAll: 'Distribution', distDisc: 'Distribution: discrete (from the example)', mixed: 'mixed', mixedShort: 'mixed distributions',
    kind: { pert: 'beta-PERT', classic: 'classic beta', tri: 'triangular', unif: 'uniform', norm: 'normal truncated at 0', logn: 'lognormal', disc: 'discrete' },
    perAct: 'Distributions by activity', reps: 'Runs', pct: 'Percentile P', badPct: 'A whole number between 1 and 99.',
    corr: 'Cruciality:', corrName: { p: 'Pearson', s: 'Spearman' },
    running: 'Simulating {n} runs…', done: '{n} runs simulated. P(duration ≤ {T}) = {p}.',
    distsTitle: 'Distributions by activity · mean and variance of the chosen distribution',
    distsTitleUnit: 'Distributions by activity · mean and variance of the chosen distribution ({unit})',
    colDist: 'Distribution', colMean: 'Mean', colVar: 'Variance', distOf: 'Distribution of {id}', edit: 'Edit',
    normalNote: 'The normal of M6 keeps the exam formulas of a, m and b; an edited discrete adds its own mean and variance.',
    truncNote: 'Normal truncated at 0: when σ is large, its mean and variance end up slightly above PERT’s.',
    discStart: 'Discrete distribution of {id}: it starts as a, m and b with 1/6, 4/6 and 1/6.', discEdited: 'Discrete distribution of {id} (edited: it no longer follows a, m and b).',
    value: 'Value', prob: 'Probability', valueN: 'Value {n} of {id}', probN: 'Probability {n} of {id}', removeValue: 'Remove value {n} of {id}',
    addValue: '+ Value', reset: 'Back to {a}, {m}, {b} (1/6, 4/6, 1/6)',
    discHint: 'Values 0 or more and all different, up to 20; probabilities as decimals or fractions (1/3).',
    disc: {
      empty: '{id}: write at least one value with its probability.', nan: '{id}: every value and every probability must be a number.',
      negative: '{id}: values cannot be negative.', repeated: '{id}: some values are repeated.',
      prob: '{id}: every probability must be greater than 0.', sum: '{id}: the probabilities add up to {sum}; they must add up to 1.',
    },
    blocked: 'While {ids} has errors nothing is simulated; the last valid run is shown greyed out.',
    ownErrors: 'Your own table has {n} errors', ownErrorsText: 'While there are errors nothing is simulated. The table is fixed in',
    toM5: 'Three-point estimates (M5)',
    histTitle: 'Project duration · simulation of {n} runs ({what})',
    histLabel: 'Histogram of {n} runs, mean {mean}, with the normal of M6 N({mu}; {var}) and the deadline {T}: P(duration ≤ {T}) = {ps} simulated and {pn} with the normal.',
    legendSim: 'simulation', legendNormal: 'normal of M6: N({mu}; {var}), critical path of the means', legendMean: 'simulated mean',
    normalOnly: 'The normal only looks at {path}; the simulation, at the whole project.',
    allFixed: 'No uncertainty: every duration is fixed and the project always takes {T}.',
    mergeNote: 'The simulated mean ({mean}) is above PERT’s ({mu}) and P(duration ≤ {T}) falls from {pn} to {ps}: the merge bias of M6, now with the whole project.',
    cdfTitle: 'Distribution function · percentiles', cdfLabel: 'Distribution function of the simulated duration, with that of the normal of M6: {list}.',
    legendCdf: 'simulation', legendNormalShort: 'normal of M6',
    resTitle: 'Results (± is half the 95 % interval)', colSim: 'Simulation', colNormal: 'PERT (normal of M6)', colExact: 'Exact',
    rowMean: 'Mean', rowSd: 'Std. deviation', rowP: 'P(duration ≤ {T})', pm: '{v} ± {e}', chosen: '(chosen)',
    pctText: 'With a {p} % probability the project finishes in {T} {unit} or less.', pctTextNoUnit: 'With a {p} % probability the project finishes in {T} or less.',
    idxTitle: 'Indices of each activity · {n} runs', idxTable: 'Table of indices', idxRunning: 'Working out the indices…',
    idxCaption: 'Sorted by {order}.', idxCaptionExact: 'Simulation and exact count ({combos} combinations). Sorted by {order}.',
    colAct: 'Activity', crit: 'Criticality', crucP: 'Cruciality (Pearson)', crucS: 'Cruciality (Spearman)', sig: 'Significance',
    order: { c: 'criticality', u: 'cruciality' }, orderLabel: 'Order', torTitle: 'Mirror tornado',
    torLabel: 'Mirror tornado, sorted by {order}: {list}.', torItem: '{id}, criticality {c} and cruciality {u}',
    noUnc: 'No uncertainty: each activity is always critical or never, and cruciality is 0 (nothing varies).',
    fixedCruc: 'An activity with a fixed duration has cruciality 0: it does not vary, so it cannot explain the project duration.',
    pathsTitle: 'Paths and their criticality', colPath: 'Path',
    tieNote: 'They add up to {sum}, not 1: in the runs with a tie two paths are critical at once. The slide of Unit 6c gives each tie to a single path (Learn more).',
    offNote: '{path} is not the critical path of the means ({mean}), but it is critical in {p} % of the runs.',
    netTitle: 'Shaded AON network', shadeLabel: 'Colour', shade: { cr: 'criticality', cu: 'cruciality', si: 'significance' },
    scaleNote: '(each box shows its value)',
  };

  I.dict.es.m7 = es;
  I.dict.en.m7 = en;

  const api = { es, en };
  root.PNL = root.PNL || {};
  root.PNL.i18nM7 = api;
  if (isNode) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
