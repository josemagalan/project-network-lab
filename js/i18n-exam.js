/*
 * i18n-exam — textos del examen imprimible, examen.html (spec f3f-examen-imprimible, AC15; plan P6 y P8; T010–T011;
 * tableros 107–113). Se carga con examen.html y se fusiona con i18n (dict.es.exam y dict.en.exam): core/exam pide sus
 * textos nuevos con tr('exam.…') y los demás son los de i18n-moodle (mq.…), para que el examen diga lo mismo que Moodle.
 * Bloque 1 de P8 (T010): la página (page), la cabecera y el pie del papel (head), los nombres de las partes y de los
 * apartados (part, item: son las etiquetas de los controles) y las alternativas de la vista (view).
 * Bloques 2 y 3 (T011): los enunciados de las partes (data, ask, alt…), la solución (sol, det, col, cell) y la rúbrica
 * (rub). Las explicaciones de los errores del detective (exam.det.<tipo>) son las de i18n-det (det.exp), como «Ejercicios».
 */
(function (root) {
  'use strict';

  const isNode = typeof module !== 'undefined' && module.exports;
  const I = isNode ? require('./i18n.js') : root.PNL.i18n;

  const es = {
    page: {
      docTitle: 'Examen imprimible · Laboratorio de redes de proyectos', title: 'Examen imprimible',
      lead: 'Genera con una semilla un examen en papel sobre un solo proyecto: el enunciado del alumno, la solución completa y la rúbrica, con los puntos y cómo aplicar el error consecuente. Se imprime o se guarda como PDF desde el navegador.',
      level: 'Nivel', seed: 'Semilla', models: 'Modelos',
      parts: 'Partes, apartados y puntos', partsHint: 'En el orden del recorrido; cada parte usa lo que el alumno hizo antes. Desmarca un apartado para quitarlo.',
      group: { calc: 'Lo determinista', build: 'Construir las redes', det: 'Detective', prob: 'Probabilidad y Montecarlo' },
      itemsOf: 'Apartados de «{part}»', pointsOf: 'Puntos de «{part}»',
      total: 'Total: {n} puntos', sumWarn: 'Los puntos suman {n}, no 10. Puedes imprimir igual.', reset: 'Volver a la propuesta',
      pointsBad: 'Los puntos van de 0 a 10, de 0,25 en 0,25.', empty: 'Marca al menos una parte.',
      detOwn: 'Con «Del enunciado a la tabla» o con las dos redes que construir, el detective lleva un proyecto aparte.',
      detGraph: 'Red del detective', graphAon: 'ROY (actividad en el nodo)', graphAoa: 'PERT (actividad en el arco)',
      more: 'Cabecera, extras y papel',
      header: 'Cabecera del enunciado', subject: 'Asignatura', call: 'Convocatoria', date: 'Fecha', duration: 'Duración', instructions: 'Instrucciones',
      headerCount: '{n} de {max} caracteres',
      extras: 'Extras del enunciado', extraId: 'Casillas para el nombre y el DNI', extraNormal: 'Tabla de la normal (con probabilidad)',
      extraGrid: 'Hojas para dibujar', extraQr: 'Enlace y código QR para repasarlo',
      paper: 'Papel', paperA4: 'A4', paperLetter: 'Carta',
      docs: { label: 'Documento', s: 'Enunciado', o: 'Solución', r: 'Rúbrica' }, modelsLabel: 'Modelo a la vista', model: 'Modelo {l}',
      print: 'Imprimir', printAll: 'Imprimir todos los enunciados', copy: 'Copiar enlace',
      copied: 'Enlace copiado.', copyFailed: 'No se pudo copiar: copia el enlace de la barra de direcciones.',
      status: 'Modelo {l} · semilla {s}{u} · {p} páginas en {paper}', used: ' (usada: {u})',
      searching: 'Buscando un proyecto que valga para todas las partes…',
      previewNote: 'Vista previa en pantalla: al imprimir, cada parte empieza donde cabe entera y las redes anchas van en su página girada.',
      noProject: 'Con esta semilla no sale ningún proyecto que valga para todas las partes en {n} intentos. Prueba con otra semilla o quita alguna parte.',
    },
    head: {
      name: 'Nombre y apellidos', id: 'DNI', page: 'Página {p} de {n}', foot: 'Modelo {l} · semilla {s}',
      instructions: 'Responde en el propio examen y justifica los resultados. Puedes usar calculadora.',
      points: '({n} puntos)', point: '(1 punto)', partTitle: 'Parte {i} · {t}',
      link: 'Después del examen, repasa este mismo proyecto en el laboratorio, con la solución paso a paso:',
      gridSheet: 'Hoja para dibujar', normalTitle: 'Tabla de la distribución normal estándar: Φ(z) = P(Z ≤ z)',
      solTitle: 'Solución', rubTitle: 'Rúbrica', rotated: 'Gira la hoja para leer esta página',
      nextRot: 'Dibuja en la rejilla de la página girada que sigue a esta.', nextRotNet: 'La red, en la página girada que sigue a esta.',
    },
    part: {
      stmt: 'Del enunciado a la tabla', roy: 'Construir la red ROY', pert: 'Construir la red PERT', det: 'Detective', times: 'Tiempos',
      floats: 'Holguras y caminos críticos', minDummy: 'Mínimo de ficticias', succ: 'Sucesores de cada suceso', tcl: 'Probabilidad (TCL)',
      read: 'Leer una simulación', disc: 'Discretas a mano', rep: 'Réplicas a mano',
    },
    item: {
      times: 'Tiempos de las actividades', events: 'Tiempos de los sucesos', floats: 'Holguras', sf: 'Holgura de seguridad', critical: 'Actividades y caminos críticos',
      moments: 'Medias y varianzas', path: 'Camino crítico', project: 'μ y σ² del proyecto', prob: 'z y probabilidad del plazo', deadline: 'Plazo de una probabilidad', route: 'La otra ruta',
      pct: 'Percentil', pT: 'Probabilidad del plazo', crit: 'Índice de criticidad', questions: 'Preguntas de interpretación', combos: 'Combinaciones', mean: 'E[T]',
      reps: 'Duración de cada réplica', marks: 'Críticas de cada réplica',
    },
    // ---------- bloque 2 (T011): partes, enunciados y solución; bloque 3: la rúbrica ----------
    data: 'Un proyecto tiene las actividades, las duraciones (en días) y las precedencias de esta tabla.',
    dataTcl: 'Un proyecto tiene las actividades y las precedencias de esta tabla. Las duraciones son beta-PERT, con la estimación optimista (a), la más probable (m) y la pesimista (b), en semanas.',
    means: 'En los tiempos y las holguras, usa como duración de cada actividad su media tₑ = (a + 4m + b) / 6, con dos decimales.',
    withMeans: 'Con las medias tₑ de dos decimales.',
    ask: {
      stmt: 'Lee el enunciado y escribe la tabla de precedencias: las predecesoras inmediatas de cada actividad («—» si no tiene).',
      roy: 'Dibuja la red ROY (actividad en el nodo) del proyecto, con los nodos Inicio y Fin.',
      pert: 'Dibuja la red PERT (actividad en el arco) del proyecto con el menor número de ficticias. Numera los sucesos de modo que cada arco vaya de un número menor a otro mayor.',
      detAon: 'La red ROY de este proyecto tiene {n} errores. Márcalos en la red y explica en qué consiste cada uno.',
      detAoa: 'La red PERT de este proyecto tiene {n} errores. Márcalos en la red y explica en qué consiste cada uno.',
      detAonOne: 'La red ROY de este proyecto tiene 1 error. Márcalo en la red y explica en qué consiste.',
      detAoaOne: 'La red PERT de este proyecto tiene 1 error. Márcalo en la red y explica en qué consiste.',
      times: 'Calcula el comienzo y el fin tempranos y tardíos de cada actividad y la duración del proyecto.',
      events: 'Calcula el tiempo temprano, el tardío y la holgura de cada suceso.',
      eventsOwn: 'Sobre tu red PERT: calcula el tiempo temprano, el tardío y la holgura de cada suceso.',
      eventsSucc: 'Usa la numeración de sucesos de la parte «Sucesores de cada suceso».', floats: 'Calcula las holguras de cada actividad.',
      critical: 'Indica las actividades críticas y todos los caminos críticos.',
      minDummy: '¿Cuántas ficticias tiene la red PERT con el menor número de ficticias?',
      succ: 'Esta es la red PERT de las reglas de los conjuntos, dada por sus sucesos y lo que llega a cada uno. Escribe lo que sale de cada suceso (actividades y ficticias).',
      succOwn: 'Sobre tu red PERT: escribe lo que sale de cada suceso (actividades y ficticias).',
      moments: 'Calcula la media tₑ y la varianza σ² de cada actividad.',
      combos: 'Completa la duración del proyecto y la probabilidad de cada combinación.',
      critIdx: 'Calcula el índice de criticidad de cada actividad.',
    },
    cell: {
      act: '{f} de {a}', dur: 'la duración del proyecto', crit: 'la marca de crítica de {a}', ev: '{f} del suceso {n}', route: '{f} de la ruta',
      Tp: 'el plazo', path: 'el camino', both: 'la P de las dos', pT: 'P(T ≤ plazo)', combo: '{f} de la combinación {i}', run: 'T de la réplica {i}',
      runCrit: 'las críticas de la réplica {i}', critIdx: 'la criticidad de {a}',
    },
    det: {
      lab: 'El {f} de {a}', labEv: 'El {f} del suceso {n}',
    },
    col: {
      combo: 'Combinación', critRun: 'Críticas',
    },
    detOwn: 'Esta parte usa otro proyecto, con esta tabla:',
    alt: {
      roy: 'Red ROY del proyecto, de {n} nodos (con Inicio y Fin) y {m} arcos. La misma red está en la tabla que sigue.',
      pert: 'Red PERT del proyecto con el mínimo de ficticias: {n} sucesos, {m} actividades y {k} ficticias. La misma red está en la tabla que sigue.',
      det: 'Red ROY con errores, de {n} nodos (con Inicio y Fin) y {m} arcos. La misma red está en la tabla que sigue.',
      detAoa: 'Red PERT con errores, de {n} sucesos, {m} actividades y {k} ficticias. La misma red está en la tabla que sigue.',
    },
    sol: {
      intro: 'Solución del modelo {letter} (semilla {sd}). Todas las cifras salen del mismo núcleo que el laboratorio.',
      means: 'Los tiempos y las holguras se calculan con las medias tₑ de dos decimales.',
      refNet: 'Con la red PERT de referencia (la de las reglas de los conjuntos). Si el alumno numeró los sucesos de otra manera, se corrige con su red.',
      detErr: 'Error {i}: {text}', mcq: '{q} {a}.',
    },
    rub: {
      intro: 'Puntos de cada apartado y criterios de corrección. Los puntos de una parte se reparten a partes iguales entre sus apartados.',
      carriedRule: 'Error consecuente: un valor que usa un dato equivocado del propio alumno, pero está bien calculado con ese dato, cuenta como bueno. Se comprueba con los datos del alumno, no con los de la solución; el dato equivocado sí se penaliza.',
      stmt: 'Por actividad: sus predecesoras inmediatas. Una precedencia redundante (que ya se deduce de otras) no resta; una que el enunciado no da, sí.',
      roy: 'Se compara con la tabla de precedencias: cada arco que falta, sobra o es redundante resta. Inicio va a las actividades sin predecesoras y llegan a Fin las que no tienen sucesoras.',
      pert: 'La red tiene que dar exactamente las precedencias de la tabla (una precedencia falsa resta más que una ficticia de más). El mínimo es de {n} ficticias: cada ficticia de más resta.',
      det: 'Por error: entero si se marca en su sitio y se explica bien; la mitad si se marca en su sitio con otra explicación. Cada falsa alarma resta la mitad de un error.',
      times: 'Celda a celda, con error consecuente: cada comienzo temprano es el mayor de los fines tempranos de sus predecesoras, con los del alumno; cada fin, el comienzo más la duración. Hacia atrás, igual con los tardíos.',
      events: 'Celda a celda, con error consecuente: el tiempo temprano de un suceso, el mayor de los que llegan a él con los datos del alumno; el tardío, el menor de los que salen; la holgura, su diferencia.',
      eventsOwn: 'Con la red PERT del alumno (puede numerar los sucesos de otra manera) y con error consecuente, como los sucesos de la red de referencia.',
      floats: 'Con error consecuente: cada holgura, con los tiempos que escribió el alumno (la total, tardío menos temprano; la libre y la independiente, con los tempranos y tardíos de las posteriores y anteriores).',
      sf: 'Con error consecuente, con los tiempos del alumno.',
      critical: 'Críticas: las de holgura total nula según los tiempos del alumno. Cada camino crítico que falta o sobra resta.',
      minDummy: 'El número exacto.', succ: 'Por suceso: lo que sale de él.',
      succOwn: 'Con la red PERT del alumno: lo que sale de cada uno de sus sucesos.', moments: 'Por actividad, ±0,01.',
      path: 'El camino crítico de las medias; con las medias del alumno si tiene alguna mal.',
      project: 'μ y σ² del camino del alumno, ±0,01 por actividad sumada.',
      prob: 'z y P con la μ y la σ² del alumno; vale la P de la tabla o la exacta.', deadline: 'z y plazo con la μ y la σ² del alumno.',
      deadline95: 'z y plazo con la μ y la σ² del alumno. Para el 95 % valen z = 1,64, 1,645 y 1,65.',
      route: 'μ, σ², z y P de la ruta, como las del camino crítico; la probabilidad de las dos, el producto de las del alumno.',
      pct: 'Lectura del gráfico: vale ± una clase del histograma ({w}).', read: 'Lectura del gráfico: ±0,05.', questions: 'La opción correcta.',
      combos: 'Por combinación: su duración y su probabilidad.', mean: 'Con las combinaciones del alumno (error consecuente), ±0,001.',
      discP: 'Con las combinaciones del alumno (error consecuente), ±0,001.', discCrit: 'Con las combinaciones y los caminos del alumno, ±0,001.',
      reps: 'La duración de cada réplica, exacta.', marks: 'Las críticas de cada réplica, con sus duraciones.',
      repP: 'Proporción de réplicas que acaban a tiempo, con las duraciones del alumno.',
      repCrit: 'Proporción de réplicas en que la actividad es crítica, con las marcas del alumno.',
      example: 'Ejemplo de este modelo: si el alumno escribe {wrong} en {cell} (lo correcto es {right}) y sigue bien con sus datos, se dan por buenas, con error consecuente: {list}.',
    },
    view: {
      gridAon: 'Rejilla de puntos para dibujar la red ROY', gridAoa: 'Rejilla de puntos para dibujar la red PERT', qr: 'Código QR del enlace {url}',
    },
  };

  const en = {
    page: {
      docTitle: 'Printable exam · Project Network Lab', title: 'Printable exam',
      lead: 'Generate from a seed a paper exam on a single project: the student’s statement, the full solution and the marking guide, with the points and how to apply carried errors. Print it or save it as PDF from the browser.',
      level: 'Level', seed: 'Seed', models: 'Versions',
      parts: 'Parts, items and points', partsHint: 'In course order; each part uses what the student did before. Untick an item to leave it out.',
      group: { calc: 'Deterministic', build: 'Build the networks', det: 'Detective', prob: 'Probability and Monte Carlo' },
      itemsOf: 'Items of “{part}”', pointsOf: 'Points for “{part}”',
      total: 'Total: {n} points', sumWarn: 'The points add up to {n}, not 10. You can still print.', reset: 'Back to the proposal',
      pointsBad: 'Points go from 0 to 10, in steps of 0.25.', empty: 'Tick at least one part.',
      detOwn: 'With “From statement to table” or with both networks to build, the detective uses a separate project.',
      detGraph: 'Detective network', graphAon: 'AON (activity on node)', graphAoa: 'AOA (activity on arrow)',
      more: 'Header, extras and paper',
      header: 'Statement header', subject: 'Course', call: 'Session', date: 'Date', duration: 'Duration', instructions: 'Instructions',
      headerCount: '{n} of {max} characters',
      extras: 'Statement extras', extraId: 'Boxes for name and ID', extraNormal: 'Normal table (with probability)',
      extraGrid: 'Drawing sheets', extraQr: 'Link and QR code to review it',
      paper: 'Paper', paperA4: 'A4', paperLetter: 'Letter',
      docs: { label: 'Document', s: 'Statement', o: 'Solution', r: 'Marking guide' }, modelsLabel: 'Version on screen', model: 'Version {l}',
      print: 'Print', printAll: 'Print all statements', copy: 'Copy link',
      copied: 'Link copied.', copyFailed: 'Could not copy: copy the link from the address bar.',
      status: 'Version {l} · seed {s}{u} · {p} pages on {paper}', used: ' (used: {u})',
      searching: 'Looking for a project that works for every part…',
      previewNote: 'On-screen preview: when printed, each part starts where it fits whole and wide networks go on their own rotated page.',
      noProject: 'No project works for every part within {n} tries from this seed. Try another seed or remove a part.',
    },
    head: {
      name: 'Full name', id: 'ID', page: 'Page {p} of {n}', foot: 'Version {l} · seed {s}',
      instructions: 'Answer on the exam itself and show your working. You may use a calculator.',
      points: '({n} points)', point: '(1 point)', partTitle: 'Part {i} · {t}',
      link: 'After the exam, review this same project in the lab, with the step-by-step solution:',
      gridSheet: 'Drawing sheet', normalTitle: 'Standard normal distribution table: Φ(z) = P(Z ≤ z)',
      solTitle: 'Solution', rubTitle: 'Marking guide', rotated: 'Turn the sheet to read this page',
      nextRot: 'Draw on the grid of the rotated page after this one.', nextRotNet: 'The network is on the rotated page after this one.',
    },
    part: {
      stmt: 'From statement to table', roy: 'Build the AON network', pert: 'Build the AOA network', det: 'Detective', times: 'Times',
      floats: 'Floats and critical paths', minDummy: 'Fewest dummies', succ: 'What leaves each event', tcl: 'Probability (CLT)',
      read: 'Read a simulation', disc: 'Discrete by hand', rep: 'Runs by hand',
    },
    item: {
      times: 'Activity times', events: 'Event times', floats: 'Floats', sf: 'Safety float', critical: 'Critical activities and paths',
      moments: 'Means and variances', path: 'Critical path', project: 'Project μ and σ²', prob: 'z and probability of the deadline', deadline: 'Deadline for a probability', route: 'The other route',
      pct: 'Percentile', pT: 'Probability of the deadline', crit: 'Criticality index', questions: 'Interpretation questions', combos: 'Combinations', mean: 'E[T]',
      reps: 'Duration of each run', marks: 'Critical activities of each run',
    },
    // ---------- bloques 2 y 3 (T011) ----------
    data: 'A project has the activities, durations (in days) and precedences of this table.',
    dataTcl: 'A project has the activities and precedences of this table. Durations are beta-PERT, with the optimistic (a), most likely (m) and pessimistic (b) estimates, in weeks.',
    means: 'For times and floats, use as each activity’s duration its mean tₑ = (a + 4m + b) / 6, to two decimals.',
    withMeans: 'With the means tₑ to two decimals.',
    ask: {
      stmt: 'Read the statement and write the precedence table: the immediate predecessors of each activity (“—” if none).',
      roy: 'Draw the AON (activity on node) network of the project, with the Start and End nodes.',
      pert: 'Draw the AOA (activity on arrow) network of the project with the fewest dummies. Number the events so that each arrow goes from a smaller number to a larger one.',
      detAon: 'The AON network of this project has {n} errors. Mark them on the network and explain each one.',
      detAoa: 'The AOA network of this project has {n} errors. Mark them on the network and explain each one.',
      detAonOne: 'The AON network of this project has 1 error. Mark it on the network and explain it.',
      detAoaOne: 'The AOA network of this project has 1 error. Mark it on the network and explain it.',
      times: 'Find the early and late start and finish of each activity and the project duration.',
      events: 'Find the early time, late time and slack of each event.',
      eventsOwn: 'On your AOA network: find the early time, late time and slack of each event.',
      eventsSucc: 'Use the event numbers of the part “What leaves each event”.', floats: 'Find the floats of each activity.',
      critical: 'Give the critical activities and every critical path.',
      minDummy: 'How many dummies does the AOA network with the fewest dummies have?',
      succ: 'This is the AOA network of the set rules, given by its events and what arrives at each. Write what leaves each event (activities and dummies).',
      succOwn: 'On your AOA network: write what leaves each event (activities and dummies).',
      moments: 'Find the mean tₑ and the variance σ² of each activity.',
      combos: 'Fill in the project duration and the probability of each combination.', critIdx: 'Find the criticality index of each activity.',
    },
    cell: {
      act: '{f} of {a}', dur: 'the project duration', crit: 'the critical mark of {a}', ev: '{f} of event {n}', route: '{f} of the route',
      Tp: 'the deadline', path: 'the path', both: 'P of both', pT: 'P(T ≤ deadline)', combo: '{f} of combination {i}', run: 'T of run {i}',
      runCrit: 'the critical activities of run {i}', critIdx: 'the criticality of {a}',
    },
    det: {
      lab: 'The {f} of {a}', labEv: 'The {f} of event {n}',
    },
    col: {
      combo: 'Combination', critRun: 'Critical',
    },
    detOwn: 'This part uses another project, with this table:',
    alt: {
      roy: 'AON network of the project, with {n} nodes (including Start and End) and {m} arcs. The same network is in the table below.',
      pert: 'AOA network of the project with the fewest dummies: {n} events, {m} activities and {k} dummies. The same network is in the table below.',
      det: 'AON network with errors, with {n} nodes (including Start and End) and {m} arcs. The same network is in the table below.',
      detAoa: 'AOA network with errors, with {n} events, {m} activities and {k} dummies. The same network is in the table below.',
    },
    sol: {
      intro: 'Solution of version {letter} (seed {sd}). Every figure comes from the same core as the lab.',
      means: 'Times and floats are found with the means tₑ to two decimals.',
      refNet: 'With the reference AOA network (the one of the set rules). If the student numbered the events differently, mark it on their network.',
      detErr: 'Error {i}: {text}', mcq: '{q} {a}.',
    },
    rub: {
      intro: 'Points of each item and marking criteria. A part’s points are shared equally among its items.',
      carriedRule: 'Carried error: a value that uses a wrong figure of the student’s own, but is correctly worked out from it, counts as right. Check it with the student’s figures, not the solution’s; the wrong figure itself loses its marks.',
      stmt: 'Per activity: its immediate predecessors. A redundant precedence (implied by others) does not lose marks; one the statement does not give does.',
      roy: 'Compare with the precedence table: each missing, extra or redundant arc loses marks. Start goes to the activities with no predecessors and those with no successors go to End.',
      pert: 'The network must give exactly the precedences of the table (a false precedence costs more than an extra dummy). The minimum is {n} dummies: each extra dummy loses marks.',
      det: 'Per error: full marks if marked in its place and explained well; half if marked in its place with another explanation. Each false alarm loses half an error.',
      times: 'Cell by cell, with carried errors: each early start is the largest early finish of its predecessors, using the student’s; each finish, the start plus the duration. Backwards, the same with late times.',
      events: 'Cell by cell, with carried errors: an event’s early time is the largest of those arriving at it with the student’s figures; the late time, the smallest of those leaving; the slack, their difference.',
      eventsOwn: 'With the student’s AOA network (they may number the events differently) and with carried errors, as for the events of the reference network.',
      floats: 'With carried errors: each float from the times the student wrote (total, late minus early; free and independent, with the early and late times of the successors and predecessors).',
      sf: 'With carried errors, from the student’s times.',
      critical: 'Critical: those with zero total float according to the student’s times. Each missing or extra critical path loses marks.',
      minDummy: 'The exact number.', succ: 'Per event: what leaves it.',
      succOwn: 'With the student’s AOA network: what leaves each of their events.', moments: 'Per activity, ±0.01.',
      path: 'The critical path of the means; with the student’s means if any is wrong.',
      project: 'μ and σ² of the student’s path, ±0.01 per activity added.',
      prob: 'z and P with the student’s μ and σ²; the table P or the exact one.', deadline: 'z and deadline with the student’s μ and σ².',
      deadline95: 'z and deadline with the student’s μ and σ². For 95 %, z = 1.64, 1.645 and 1.65 are all accepted.',
      route: 'μ, σ², z and P of the route, as for the critical path; the probability of both, the product of the student’s.',
      pct: 'Reading the chart: ± one histogram class ({w}).', read: 'Reading the chart: ±0.05.', questions: 'The right option.',
      combos: 'Per combination: its duration and its probability.', mean: 'With the student’s combinations (carried error), ±0.001.',
      discP: 'With the student’s combinations (carried error), ±0.001.', discCrit: 'With the student’s combinations and paths, ±0.001.',
      reps: 'The duration of each run, exact.', marks: 'The critical activities of each run, from its durations.',
      repP: 'Share of runs that finish on time, with the student’s durations.',
      repCrit: 'Share of runs in which the activity is critical, with the student’s marks.',
      example: 'Example from this version: if the student writes {wrong} in {cell} (the right value is {right}) and carries on correctly with their own figures, these count as right with carried error: {list}.',
    },
    view: {
      gridAon: 'Dot grid to draw the AON network', gridAoa: 'Dot grid to draw the AOA network', qr: 'QR code of the link {url}',
    },
  };

  I.dict.es.exam = es;
  I.dict.en.exam = en;
  // «Detective» y «Error» se escriben igual en los dos idiomas (como ex.kind.det y mq.stage.detective).
  for (const k of ['exam.part.det', 'exam.page.group.det', 'exam.sol.detErr']) if (!I.SAME_IN_BOTH.includes(k)) I.SAME_IN_BOTH.push(k);

  const api = { es, en };
  root.PNL = root.PNL || {};
  root.PNL.i18nExam = api;
  if (isNode) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
