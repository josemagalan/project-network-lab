/*
 * i18n-prob — textos de «Probabilidad (TCL)» en «Ejercicios» (spec f3e-probabilidad-montecarlo, AC1–AC5, AC10, AC18,
 * AC24 y AC25; plan P1 y P9, bloque 1; tableros 93–95 y 103). Se carga bajo demanda con el grupo pb y se fusiona con
 * i18n (dict.es.pb y dict.en.pb). Las casillas que salen de otras se explican con los textos de la F3a (ex.explain.wrong
 * y ex.explain.carried) y las etiquetas de lab; aquí, las que salen solo de los datos (tₑ, σ² y la z de una probabilidad)
 * y el camino. Montecarlo (T011) añadirá su bloque.
 */
(function (root) {
  'use strict';

  const isNode = typeof module !== 'undefined' && module.exports;
  const I = isNode ? require('./i18n.js') : root.PNL.i18n;

  const es = {
    route: 'La otra ruta',
    fixed: 'un {p} % de duraciones fijas (a = m = b)',
    stmt: 'Duraciones en semanas: optimista (a), más probable (m) y pesimista (b). Plazo: {T}. Probabilidad pedida: {p}.',
    stmtRoute: ' La otra ruta: {r}.',
    weeks: '{n} semanas',
    tie: 'Si dos caminos empatan con las medias, el crítico es el de mayor varianza.',
    moved: 'Se usa la tabla de la semilla {used}: la de la semilla {sd} no sirve para este ejercicio.',
    searching: 'Buscando una tabla para este ejercicio…',
    notFound: 'No he encontrado una tabla para este ejercicio en {n} semillas seguidas. Prueba con otra semilla u otro nivel.',
    given: 'Datos: a, m y b de cada actividad, y sus predecesoras',
    caption: 'Tus respuestas: tₑ, σ² y camino de cada actividad',
    path: 'Camino', pathOf: 'Camino: {a}',
    pathHelp: 'Marca las actividades del camino crítico de las medias.',
    yourPath: 'Tu camino: {p}',
    proj: 'Proyecto (camino crítico de las medias)', dl: 'Plazo de {T}', pr: 'Probabilidad del {p}', routeOf: 'La otra ruta: {r}', both: 'Las dos rutas a tiempo',
    deadline: 'Plazo',
    help: 'Dos decimales; la probabilidad, con cuatro (la de la tabla) o la exacta. Coma o punto.',
    table: 'Tabla de la normal', sol: 'Ver la solución en M6',
    lab: {
      te: 'tₑ de {a}', tvar: 'σ² de {a}', path: 'camino crítico', mu: 'μ del proyecto', pvar: 'σ² del proyecto', z: 'z del plazo', p: 'P(T ≤ {T})',
      zp: 'z de la probabilidad', Tp: 'plazo para el {p}', rmu: 'μ de la otra ruta', rvar: 'σ² de la otra ruta', rz: 'z de la otra ruta', rp: 'P de la otra ruta',
      both: 'P de las dos rutas',
    },
    explain: {
      te: 'Has escrito {v}. tₑ = (a + 4m + b) / 6 = ({a} + 4 · {m} + {b}) / 6 = {r}.',
      tvar: 'Has escrito {v}. σ² = ((b − a) / 6)² = (({b} − {a}) / 6)² = {r}.',
      zp: 'Has escrito {v}. En la tabla, Φ(z) = {p} da z = {r}.',
      zp95: 'Has escrito {v}. Para el 95 % valen 1,64, 1,645 y 1,65 (las tablas impresas difieren).',
      pathBroken: 'Tus marcas ({p}) no forman un camino del inicio al fin por actividades seguidas.',
      pathShort: 'Con tus tₑ, {p} dura {len}, pero el camino más largo dura {top} ({best}).',
      pathVar: 'Con tus tₑ, {p} empata con {best} ({len}), pero con tus σ² tiene menos varianza ({v} frente a {top}): con empate, el crítico es el de mayor varianza.',
      pathCarried: 'Con tus tₑ y tus σ², {p} es el camino crítico de las medias. No coincide con la solución ({r}) porque arrastra un error anterior{origin}: no se penaliza.',
    },
    normal: {
      title: 'Tabla de la normal', close: 'Cerrar la tabla de la normal', search: 'Buscar z', found: 'Φ({z}) = {p}', neg: 'Φ({z}) = 1 − Φ({a}) = {p}',
      out: 'Fuera de la tabla: escribe una z entre −3,49 y 3,49.',
      caption: 'Φ(z) = P(Z ≤ z). Fila: unidades y décimas de z; columna: centésimas.',
      note: 'Con z negativa, Φ(−z) = 1 − Φ(z). Para el 95 % la z queda entre 1,64 (0,9495) y 1,65 (0,9505): valen 1,64, 1,645 y 1,65, cada una con su plazo.',
    },
  };

  const en = {
    route: 'The other route',
    fixed: '{p}% of durations fixed (a = m = b)',
    stmt: 'Durations in weeks: optimistic (a), most likely (m) and pessimistic (b). Deadline: {T}. Probability asked: {p}.',
    stmtRoute: ' The other route: {r}.',
    weeks: '{n} weeks',
    tie: 'If two paths tie on the means, the critical one is the one with the larger variance.',
    moved: 'The table of seed {used} is used: the one of seed {sd} does not work for this exercise.',
    searching: 'Looking for a table for this exercise…',
    notFound: 'I could not find a table for this exercise in {n} seeds in a row. Try another seed or another level.',
    given: 'Data: a, m and b of each activity, and its predecessors',
    caption: 'Your answers: tₑ, σ² and path of each activity',
    path: 'Path', pathOf: 'Path: {a}',
    pathHelp: 'Mark the activities on the critical path of the means.',
    yourPath: 'Your path: {p}',
    proj: 'Project (critical path of the means)', dl: 'Deadline of {T}', pr: 'Probability of {p}', routeOf: 'The other route: {r}', both: 'Both routes on time',
    deadline: 'Deadline',
    help: 'Two decimals; the probability with four (the table’s) or the exact one.',
    table: 'Normal table', sol: 'See the solution in M6',
    lab: {
      te: 'tₑ of {a}', tvar: 'σ² of {a}', path: 'critical path', mu: 'μ of the project', pvar: 'σ² of the project', z: 'z of the deadline', p: 'P(T ≤ {T})',
      zp: 'z of the probability', Tp: 'deadline for {p}', rmu: 'μ of the other route', rvar: 'σ² of the other route', rz: 'z of the other route', rp: 'P of the other route',
      both: 'P of both routes',
    },
    explain: {
      te: 'You wrote {v}. tₑ = (a + 4m + b) / 6 = ({a} + 4 · {m} + {b}) / 6 = {r}.',
      tvar: 'You wrote {v}. σ² = ((b − a) / 6)² = (({b} − {a}) / 6)² = {r}.',
      zp: 'You wrote {v}. In the table, Φ(z) = {p} gives z = {r}.',
      zp95: 'You wrote {v}. For 95% 1.64, 1.645 and 1.65 are all right (printed tables differ).',
      pathBroken: 'Your marks ({p}) do not form a path from start to end through consecutive activities.',
      pathShort: 'With your tₑ, {p} takes {len}, but the longest path takes {top} ({best}).',
      pathVar: 'With your tₑ, {p} ties with {best} ({len}), but with your σ² it has the smaller variance ({v} against {top}): on a tie, the critical one is the one with the larger variance.',
      pathCarried: 'With your tₑ and σ², {p} is the critical path of the means. It does not match the solution ({r}) because it carries an earlier error{origin}: it is not penalised.',
    },
    normal: {
      title: 'Normal table', close: 'Close the normal table', search: 'Find z', found: 'Φ({z}) = {p}', neg: 'Φ({z}) = 1 − Φ({a}) = {p}',
      out: 'Outside the table: type a z between −3.49 and 3.49.',
      caption: 'Φ(z) = P(Z ≤ z). Row: units and tenths of z; column: hundredths.',
      note: 'For a negative z, Φ(−z) = 1 − Φ(z). For 95% the z lies between 1.64 (0.9495) and 1.65 (0.9505): 1.64, 1.645 and 1.65 are all right, each with its deadline.',
    },
  };

  I.dict.es.pb = es;
  I.dict.en.pb = en;

  const api = { es, en };
  root.PNL = root.PNL || {};
  root.PNL.i18nProb = api;
  if (isNode) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
