/*
 * i18n-exam — textos del examen imprimible, examen.html (spec f3f-examen-imprimible, AC15; plan P6 y P8; T010–T011;
 * tableros 107–113). Se carga con examen.html y se fusiona con i18n (dict.es.exam y dict.en.exam): core/exam pide sus
 * textos nuevos con tr('exam.…') y los demás son los de i18n-moodle (mq.…), para que el examen diga lo mismo que Moodle.
 * Bloque 1 de P8 (T010): la página (page), la cabecera y el pie del papel (head), los nombres de las partes y de los
 * apartados (part, item: son las etiquetas de los controles) y las alternativas de la vista (view).
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
    view: {
      gridAon: 'Dot grid to draw the AON network', gridAoa: 'Dot grid to draw the AOA network', qr: 'QR code of the link {url}',
    },
  };

  I.dict.es.exam = es;
  I.dict.en.exam = en;
  // «Detective» se escribe igual en los dos idiomas (como ex.kind.det y mq.stage.detective).
  for (const k of ['exam.part.det', 'exam.page.group.det']) if (!I.SAME_IN_BOTH.includes(k)) I.SAME_IN_BOTH.push(k);

  const api = { es, en };
  root.PNL = root.PNL || {};
  root.PNL.i18nExam = api;
  if (isNode) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
