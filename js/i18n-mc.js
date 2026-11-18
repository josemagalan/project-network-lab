/*
 * i18n-mc — textos de «Montecarlo» en «Ejercicios» (spec f3e-probabilidad-montecarlo, AC6–AC10, AC18 y AC19; plan P1 y
 * P9, bloque 2; tableros 96–98 y 104). Se carga con el grupo mx y se fusiona con i18n (dict.es.mx y dict.en.mx). Las
 * casillas que salen de otras (E[T], P y las estimaciones) se explican con los textos de la F3a (ex.explain.wrong y
 * ex.explain.carried) y las etiquetas de lab; aquí, las que se leen en los gráficos o salen solo de los datos.
 */
(function (root) {
  'use strict';

  const isNode = typeof module !== 'undefined' && module.exports;
  const I = isNode ? require('./i18n.js') : root.PNL.i18n;

  const es = {
    variant: 'Variante', v: { read: 'Leer una simulación', disc: 'Discretas a mano', rep: 'Réplicas a mano' },
    sum: { read: 'beta-PERT en todas las actividades · 10 000 réplicas', disc: '{k} actividades discretas · {c} combinaciones', rep: '{n} réplicas' },
    or: '{a} o {b}', range: 'de {a} a {b}',
    weeks: '{n} semanas',
    moved: 'Se usa la tabla de la semilla {used}: la de la semilla {sd} no sirve para este ejercicio.',
    searching: 'Buscando una tabla para este ejercicio…', simulating: 'Buscando una tabla y simulando 10 000 réplicas…',
    notFound: 'No he encontrado una tabla para este ejercicio en {n} semillas seguidas. Prueba con otra semilla u otro nivel.',
    sol: 'Ver la solución en M7',
    // Leer una simulación
    sim: 'La simulación', simSub: '10 000 réplicas · beta-PERT · semilla {us} (la de M7)',
    chart: {
      dist: 'Duración del proyecto en 10 000 réplicas', distDesc: 'Histograma y función de distribución, con el plazo marcado. Sus datos están en «Ver los gráficos como tabla».',
      idx: 'Índices de criticidad y crucialidad', idxDesc: 'Tornado por actividad: criticidad a la izquierda y crucialidad a la derecha. Sus datos están en «Ver los gráficos como tabla».',
      deadline: 'Plazo = {d}', x: 'Duración del proyecto (semanas)', hist: 'Histograma', cdf: 'Función de distribución', crit: 'Criticidad', cruc: 'Crucialidad',
      scroll: '{c}: se desplaza de lado',
    },
    asTable: 'Ver los gráficos como tabla', data: 'Ver los datos (a, m y b)', dataCap: 'Datos: a, m y b de cada actividad, y sus predecesoras',
    cum: 'Frecuencia acumulada', upTo: 'Hasta', idxTab: 'Índices (una cifra decimal)', critS: 'Crit.', crucS: 'Cruc.',
    readHead: 'Lee en los gráficos', interp: 'Interpreta',
    tol: 'Un tiempo vale con ± una clase del histograma ({w}); una probabilidad o un índice, con ±0,05.',
    q: {
      mostCrit: '¿Qué actividad es crítica en más réplicas?',
      mostCruc: '¿Qué actividad influye más en la duración del proyecto (la de más crucialidad)?',
      critLowCruc: '¿Qué actividad es crítica a menudo pero influye poco en la duración?',
      normal: 'Para el plazo de {T}, ¿cómo es la probabilidad de la normal del TCL frente a la de la simulación?',
      promise: '¿Qué plazo prometerías con un 90 % de confianza?',
      optimistic: 'Optimista: da más probabilidad; olvida los caminos que se funden', pessimistic: 'Pesimista: da menos probabilidad', exact: 'Casi igual',
    },
    // Discretas a mano
    discStmt: 'Duraciones en semanas. Las actividades sombreadas son discretas: cada valor con su probabilidad, independiente de las demás. Plazo: {T}.',
    discGiven: 'Datos: duración (con su probabilidad) y predecesoras de cada actividad', durP: 'Duración (probabilidad)',
    combos: 'Las {n} combinaciones: duración y probabilidad', combosCap: 'Tus respuestas: T y p de cada combinación',
    proj: 'Duración del proyecto', critHead: 'Criticidad (los empates cuentan)',
    discHelp: 'Tres decimales o una fracción (2/27). Las probabilidades también pueden ser fracciones.',
    // Réplicas a mano
    reps: 'Las {n} réplicas: duraciones sorteadas de la beta-PERT', dl: 'Plazo: {T}',
    repHelp: 'Escribe la duración del proyecto de cada réplica y pulsa sus actividades críticas (holgura 0, empates incluidos).',
    repCap: 'Duraciones de cada réplica: pulsa las críticas y escribe T', rep: 'Réplica', critCol: 'Críticas',
    toggle: '{a} crítica en la réplica {k} (dura {d})',
    est: 'Estimaciones con tus réplicas (fracción k/{n} o decimal)', grading: 'Corrección',
    lab: {
      pct: 'Percentil {p} de la duración', pT: 'P(T ≤ {T})', crit: 'Criticidad de {a}',
      q: { mostCrit: 'La más crítica', mostCruc: 'La más crucial', critLowCruc: 'Crítica, pero influye poco', normal: 'La normal frente a la simulación', promise: 'El plazo del 90 %' },
      cT: 'T de la combinación {k}', cp: 'p de la combinación {k}', mean: 'E[T]', acrit: 'criticidad de {a}',
      rT: 'T de la réplica {k}', rcrit: 'críticas de la réplica {k}',
    },
    calc: { mean: 'Σ T · p de tus combinaciones', pT: 'Σ p de tus combinaciones con T ≤ {T}' },
    explain: {
      readPct: 'Has escrito {v}. La función de distribución llega a {q} hacia {r}: ese es el percentil {p}. Se acepta ± una clase del histograma ({w}).',
      readP: 'Has escrito {v}. La función de distribución corta la línea discontinua del plazo hacia {r}; se acepta ±0,05.',
      readCrit: 'Has escrito {v}. En el tornado, la barra de criticidad de {a} llega hacia {r} (la proporción de réplicas en que es crítica); se acepta ±0,05.',
      mostCrit: 'La respuesta es {r}: su barra de criticidad es la más larga ({c}); la siguiente es la de {n2} ({c2}).',
      mostCruc: 'La respuesta es {r}: su barra de crucialidad es la más larga ({c}); la siguiente es la de {n2} ({c2}).',
      critLowCruc: 'La respuesta es {r}: es crítica a menudo (criticidad {c}), pero su crucialidad es baja ({u}): su duración varía poco o casi no mueve la del proyecto.',
      optimistic: 'La respuesta es «{o}»: la normal del TCL da P(T ≤ {T}) = {pn} y la simulación, {ps}. La normal solo mira el camino crítico de las medias; los caminos que se funden con él alargan el proyecto.',
      pessimistic: 'La respuesta es «{o}»: la normal del TCL da P(T ≤ {T}) = {pn} y la simulación, {ps}.',
      promise: 'La respuesta es {r}: con un 90 % de confianza se promete el percentil 90 de la simulación, donde la función de distribución llega a 0,9.',
      discT: 'Has escrito {v}. Con {vals}, el proyecto dura {r}; las actividades críticas son {crit}.',
      discP: 'Has escrito {v}. Las duraciones son independientes: p = {prod} = {r}.',
      discCrit: 'Has escrito {v}. {a} es crítica en {k} de las {n} combinaciones (los empates cuentan); la suma de sus p es {r}.',
      repT: 'Has escrito {v}. Con las duraciones de la réplica {k}, el camino más largo dura {r}; las actividades críticas son {crit}.',
      repCrit: 'Las críticas de la réplica {k} son {r} (holgura 0, empates incluidos).',
      miss: ' Falta {x}.', missN: ' Faltan {x}.', extra: ' Sobra {x}.', extraN: ' Sobran {x}.',
    },
  };

  const en = {
    variant: 'Variant', v: { read: 'Read a simulation', disc: 'Discrete by hand', rep: 'Runs by hand' },
    sum: { read: 'beta-PERT on every activity · 10,000 runs', disc: '{k} discrete activities · {c} combinations', rep: '{n} runs' },
    or: '{a} or {b}', range: '{a} to {b}',
    weeks: '{n} weeks',
    moved: 'The table of seed {used} is used: the one of seed {sd} does not work for this exercise.',
    searching: 'Looking for a table for this exercise…', simulating: 'Looking for a table and simulating 10,000 runs…',
    notFound: 'I could not find a table for this exercise in {n} seeds in a row. Try another seed or another level.',
    sol: 'See the solution in M7',
    sim: 'The simulation', simSub: '10,000 runs · beta-PERT · seed {us} (the one in M7)',
    chart: {
      dist: 'Project duration in 10,000 runs', distDesc: 'Histogram and distribution function, with the deadline marked. Its data are under «See the charts as a table».',
      idx: 'Criticality and cruciality indices', idxDesc: 'Tornado by activity: criticality on the left and cruciality on the right. Its data are under «See the charts as a table».',
      deadline: 'Deadline = {d}', x: 'Project duration (weeks)', hist: 'Histogram', cdf: 'Distribution function', crit: 'Criticality', cruc: 'Cruciality',
      scroll: '{c}: scrolls sideways',
    },
    asTable: 'See the charts as a table', data: 'See the data (a, m and b)', dataCap: 'Data: a, m and b of each activity, and its predecessors',
    cum: 'Cumulative frequency', upTo: 'Up to', idxTab: 'Indices (one decimal)', critS: 'Crit.', crucS: 'Cruc.',
    readHead: 'Read on the charts', interp: 'Interpret',
    tol: 'A time is right within ± one histogram class ({w}); a probability or an index within ±0.05.',
    q: {
      mostCrit: 'Which activity is critical in the most runs?',
      mostCruc: 'Which activity has the most influence on the project duration (the highest cruciality)?',
      critLowCruc: 'Which activity is often critical but has little influence on the duration?',
      normal: 'For the deadline of {T}, how does the CLT normal probability compare with the simulation?',
      promise: 'Which deadline would you promise with 90% confidence?',
      optimistic: 'Optimistic: higher probability; it ignores merging paths', pessimistic: 'Pessimistic: lower probability', exact: 'About the same',
    },
    discStmt: 'Durations in weeks. The shaded activities are discrete: each value with its probability, independent of the others. Deadline: {T}.',
    discGiven: 'Data: duration (with its probability) and predecessors of each activity', durP: 'Duration (probability)',
    combos: 'The {n} combinations: duration and probability', combosCap: 'Your answers: T and p of each combination',
    proj: 'Duration of the project', critHead: 'Criticality (ties count)',
    discHelp: 'Three decimals or a fraction (2/27). The probabilities can be fractions too.',
    reps: 'The {n} runs: durations drawn from the beta-PERT', dl: 'Deadline: {T}',
    repHelp: 'Type the project duration of each run and press its critical activities (zero slack, ties included).',
    repCap: 'Durations of each run: press the critical ones and type T', rep: 'Run', critCol: 'Critical',
    toggle: '{a} critical in run {k} (lasts {d})',
    est: 'Estimates with your runs (fraction k/{n} or decimal)', grading: 'Marking',
    lab: {
      pct: '{p}th percentile of the duration', pT: 'P(T ≤ {T})', crit: 'Criticality of {a}',
      q: { mostCrit: 'The most critical', mostCruc: 'The most crucial', critLowCruc: 'Critical, but little influence', normal: 'The normal against the simulation', promise: 'The 90% deadline' },
      cT: 'T of combination {k}', cp: 'p of combination {k}', mean: 'E[T]', acrit: 'criticality of {a}',
      rT: 'T of run {k}', rcrit: 'critical activities of run {k}',
    },
    calc: { mean: 'Σ T · p of your combinations', pT: 'Σ p of your combinations with T ≤ {T}' },
    explain: {
      readPct: 'You wrote {v}. The distribution function reaches {q} at about {r}: that is the {p}th percentile. Within ± one histogram class ({w}) is right.',
      readP: 'You wrote {v}. The distribution function crosses the dashed deadline line at about {r}; within ±0.05 is right.',
      readCrit: 'You wrote {v}. In the tornado, the criticality bar of {a} reaches about {r} (the share of runs in which it is critical); within ±0.05 is right.',
      mostCrit: 'The answer is {r}: its criticality bar is the longest ({c}); the next one is that of {n2} ({c2}).',
      mostCruc: 'The answer is {r}: its cruciality bar is the longest ({c}); the next one is that of {n2} ({c2}).',
      critLowCruc: 'The answer is {r}: it is often critical (criticality {c}), but its cruciality is low ({u}): its duration varies little or hardly moves the project’s.',
      optimistic: 'The answer is «{o}»: the CLT normal gives P(T ≤ {T}) = {pn} and the simulation {ps}. The normal only looks at the critical path of the means; the paths that merge with it make the project longer.',
      pessimistic: 'The answer is «{o}»: the CLT normal gives P(T ≤ {T}) = {pn} and the simulation {ps}.',
      promise: 'The answer is {r}: with 90% confidence you promise the 90th percentile of the simulation, where the distribution function reaches 0.9.',
      discT: 'You wrote {v}. With {vals}, the project takes {r}; the critical activities are {crit}.',
      discP: 'You wrote {v}. The durations are independent: p = {prod} = {r}.',
      discCrit: 'You wrote {v}. {a} is critical in {k} of the {n} combinations (ties count); the sum of their p is {r}.',
      repT: 'You wrote {v}. With the durations of run {k}, the longest path takes {r}; the critical activities are {crit}.',
      repCrit: 'The critical activities of run {k} are {r} (zero slack, ties included).',
      miss: ' {x} is missing.', missN: ' {x} are missing.', extra: ' {x} should not be there.', extraN: ' {x} should not be there.',
    },
  };

  I.dict.es.mx = es;
  I.dict.en.mx = en;

  const api = { es, en };
  root.PNL = root.PNL || {};
  root.PNL.i18nMc = api;
  if (isNode) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
