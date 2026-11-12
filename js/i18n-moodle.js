/*
 * i18n-moodle — textos del banco de Moodle (preguntas del XML) y de su vista, en español e inglés (spec f3b-moodle;
 * plan P5). Se carga bajo demanda con la vista v=moodle y se fusiona con i18n (dict.es.mq y dict.en.mq), así que
 * las demás vistas no pagan estos bytes. tr(lang) da la función de textos que recibe core/moodle.
 */
(function (root) {
  'use strict';

  const isNode = typeof module !== 'undefined' && module.exports;
  const I = isNode ? require('./i18n.js') : root.PNL.i18n;

  const es = {
    // ---------- Preguntas (XML) ----------
    root: 'Redes de proyectos',
    stage: {
      early: '1 · Tiempos tempranos', late: '2 · Tiempos tardíos', floats: '3 · Holguras', critAct: '4a · Actividades críticas',
      critPath: '4b · Caminos críticos', evEarly: '5 · Sucesos: tiempos tempranos', evLate: '6 · Sucesos: tiempos tardíos y holguras',
      stmt: '0 · Enunciado → tabla',
    },
    level: { easy: 'Fácil', medium: 'Media', hard: 'Difícil' },
    stem: {
      early: 'Con esta tabla de precedencias, calcula el comienzo temprano y el fin temprano de cada actividad y la duración del proyecto.',
      late: 'Con esta tabla y sus tiempos tempranos (la duración del proyecto es {dur}), calcula el comienzo tardío y el fin tardío de cada actividad.',
      floats: 'Con esta tabla y sus tiempos, calcula la holgura total, la libre y la independiente de cada actividad.',
      floatsSf: 'Con esta tabla y sus tiempos, calcula la holgura total, la libre, la independiente y la de seguridad de cada actividad.',
      critAct: 'Con esta tabla y sus tiempos (la duración del proyecto es {dur}), indica si cada actividad es crítica.',
      critPath: 'Con esta tabla y sus tiempos (la duración del proyecto es {dur}), marca todos los caminos críticos.',
      evEarly: 'Esta es la red PERT del proyecto (actividades en los arcos), dada por sus arcos; las ficticias duran 0. Calcula el tiempo temprano de cada suceso.',
      evLate: 'Esta es la red PERT del proyecto, dada por sus arcos, con el tiempo temprano de cada suceso. Calcula el tiempo tardío y la holgura de cada suceso.',
      stmt: 'Lee el enunciado y marca las predecesoras inmediatas de cada actividad (o «ninguna» si no tiene). Una precedencia que ya se deduce de otras (redundante) no suma ni resta; una que el enunciado no da, resta.',
    },
    col: {
      act: 'Actividad', dur: 'Duración', preds: 'Predecesoras', crit: '¿Es crítica?', arc: 'Arco', from: 'Suceso de origen',
      to: 'Suceso de destino', event: 'Suceso', slack: 'Holgura', name: 'Nombre', immPreds: 'Predecesoras inmediatas',
    },
    projectDur: 'Duración del proyecto:',
    none: '—',
    noneOpt: 'ninguna',
    dummy: '{name} (ficticia)',
    yes: 'Sí', no: 'No',
    sol: { title: 'Solución', critical: 'Actividades críticas: {acts}.', paths: 'Caminos críticos: {paths} (duración {dur}).' },
    fb: { pathCrit: 'Es un camino crítico.', pathNot: 'No es crítico: dura {len}.' },
    link: { ex: 'Abrir este ejercicio en el laboratorio', step: 'Ver la solución paso a paso', stmt: 'Abrir este enunciado en el laboratorio', stmtRoute: 'Ver la ruta paso a paso del enunciado' },
    // ---------- Vista del exportador ----------
    page: {
      title: 'Bancos de preguntas para Moodle',
      lead: 'Genera preguntas con el mismo núcleo que el laboratorio y descárgalas en formato Moodle XML para importarlas en el banco de preguntas de tu curso. Las preguntas van por etapas: la 0 pide pasar un enunciado a la tabla y, en las de cálculo, cada una da como datos los resultados correctos de la anterior, así que un error no se arrastra de una pregunta a otra. En la retroalimentación, cada pregunta enlaza con su ejercicio o su enunciado en el laboratorio y con la solución paso a paso.',
      stagesTitle: 'Etapas',
      stagesHint: 'Una categoría por etapa y nivel. Las preguntas 4a y 4b dan los cuatro tiempos de cada actividad, sin las holguras.',
      sf: 'Pedir también la holgura de seguridad en la etapa 3',
      levelsTitle: 'Niveles',
      levelHint: {
        easy: '6 o 7 actividades, 1,2 predecesoras por actividad de media, 0 o 1 ficticias, 1 camino crítico y duraciones de 1 a 9.',
        medium: '9 o 10 actividades, 1,6 predecesoras por actividad de media, de 2 a 3 ficticias, 1 o 2 caminos críticos y duraciones de 1 a 12.',
        hard: 'De 12 a 14 actividades, 2 predecesoras por actividad de media, de 3 a 5 ficticias, 2 o 3 caminos críticos y duraciones de 1 a 15.',
      },
      sizeTitle: 'Tamaño',
      count: 'Ejemplares por categoría',
      countHint: 'De 1 a 50.',
      summary: 'Se generarán {q} preguntas en {c} categorías.',
      summaryOneCat: 'Se generarán {q} preguntas en una categoría.',
      summaryOne: 'Se generará 1 pregunta en una categoría.',
      nothing: 'Elige al menos una etapa y un nivel.',
      download: 'Descargar banco (Moodle XML)',
      cancel: 'Cancelar',
      progressLabel: 'Progreso de la generación',
      progress: 'Generando: {made} de {total} preguntas…',
      done: 'Descargado {file}: {q} preguntas, semilla del banco {seed}.',
      doneOne: 'Descargado {file}: 1 pregunta, semilla del banco {seed}.',
      missing: 'No se han encontrado bastantes ejemplares distintos para: {list}.',
      missingItem: '{stage}, {level} ({made} de {wanted})',
      cancelled: 'Generación cancelada: no se ha descargado nada.',
      previewTitle: 'Vista previa',
      previewHint: 'Así verá el alumnado una pregunta del banco, sin el estilo de Moodle. La solución y los enlaces van en la retroalimentación.',
      previewFeedback: 'Retroalimentación general',
      hole: 'Hueco',
      howTitle: 'Cómo usarlo en Moodle',
      how1: 'En el curso: Banco de preguntas → Importar → «Moodle XML». Se crea una categoría por etapa y nivel dentro de «Redes de proyectos».',
      how2: 'En el cuestionario, añade una «pregunta aleatoria» de cada categoría: cada estudiante recibe ejemplares distintos del mismo nivel. Cada pregunta vale 1 punto, y puedes cambiarlo en el cuestionario.',
      how3: 'En las opciones de revisión, muestra la «Respuesta correcta», la «Retroalimentación específica» y la «Retroalimentación general» solo «Después de cerrar el cuestionario»: las tres dejan ver la solución, y la general lleva además los enlaces al laboratorio.',
      how4: 'Si usas Safe Exam Browser, comprueba que los enlaces se puedan abrir durante la revisión.',
      seedNote: 'Cada descarga usa una semilla nueva, así que el banco no se puede volver a generar desde aquí. El nombre de cada pregunta (que el alumnado no ve) lleva su semilla y la versión del generador, para reproducir el ejercicio ante una reclamación.',
      file: 'banco-redes',
    },
  };

  const en = {
    root: 'Project networks',
    stage: {
      early: '1 · Early times', late: '2 · Late times', floats: '3 · Floats', critAct: '4a · Critical activities',
      critPath: '4b · Critical paths', evEarly: '5 · Events: early times', evLate: '6 · Events: late times and slack',
      stmt: '0 · Statement → table',
    },
    level: { easy: 'Easy', medium: 'Medium', hard: 'Hard' },
    stem: {
      early: 'With this precedence table, compute the early start and the early finish of each activity and the project duration.',
      late: 'With this table and its early times (the project duration is {dur}), compute the late start and the late finish of each activity.',
      floats: 'With this table and its times, compute the total, free and independent float of each activity.',
      floatsSf: 'With this table and its times, compute the total, free, independent and safety float of each activity.',
      critAct: 'With this table and its times (the project duration is {dur}), say whether each activity is critical.',
      critPath: 'With this table and its times (the project duration is {dur}), tick all the critical paths.',
      evEarly: 'This is the AOA network of the project (activities on the arcs), given by its arcs; dummies last 0. Compute the earliest time of each event.',
      evLate: 'This is the AOA network of the project, given by its arcs, with the earliest time of each event. Compute the latest time and the slack of each event.',
      stmt: 'Read the statement and tick the immediate predecessors of each activity (or "none" if it has none). A precedence that already follows from others (redundant) neither adds nor subtracts; one that the statement does not give subtracts.',
    },
    col: {
      act: 'Activity', dur: 'Duration', preds: 'Predecessors', crit: 'Critical?', arc: 'Arc', from: 'Start event',
      to: 'End event', event: 'Event', slack: 'Slack', name: 'Name', immPreds: 'Immediate predecessors',
    },
    projectDur: 'Project duration:',
    none: '—',
    noneOpt: 'none',
    dummy: '{name} (dummy)',
    yes: 'Yes', no: 'No',
    sol: { title: 'Solution', critical: 'Critical activities: {acts}.', paths: 'Critical paths: {paths} (duration {dur}).' },
    fb: { pathCrit: 'It is a critical path.', pathNot: 'It is not critical: it lasts {len}.' },
    link: { ex: 'Open this exercise in the lab', step: 'See the step-by-step solution', stmt: 'Open this statement in the lab', stmtRoute: 'See the step-by-step route of the statement' },
    page: {
      title: 'Question banks for Moodle',
      lead: 'Generate questions with the same core as the lab and download them in Moodle XML format to import them into your course question bank. The questions go in stages: stage 0 asks students to turn a statement into the table and, in the calculation stages, each one gives the correct results of the previous one as data, so a mistake is not carried from one question to the next. In the feedback, each question links to its exercise or statement in the lab and to the step-by-step solution.',
      stagesTitle: 'Stages',
      stagesHint: 'One category per stage and level. Questions 4a and 4b give the four times of each activity, without the floats.',
      sf: 'Also ask for the safety float in stage 3',
      levelsTitle: 'Levels',
      levelHint: {
        easy: '6 or 7 activities, 1.2 predecessors per activity on average, 0 or 1 dummies, 1 critical path and durations from 1 to 9.',
        medium: '9 or 10 activities, 1.6 predecessors per activity on average, 2 to 3 dummies, 1 or 2 critical paths and durations from 1 to 12.',
        hard: '12 to 14 activities, 2 predecessors per activity on average, 3 to 5 dummies, 2 or 3 critical paths and durations from 1 to 15.',
      },
      sizeTitle: 'Size',
      count: 'Instances per category',
      countHint: 'From 1 to 50.',
      summary: '{q} questions will be generated in {c} categories.',
      summaryOneCat: '{q} questions will be generated in one category.',
      summaryOne: '1 question will be generated in one category.',
      nothing: 'Choose at least one stage and one level.',
      download: 'Download bank (Moodle XML)',
      cancel: 'Cancel',
      progressLabel: 'Generation progress',
      progress: 'Generating: {made} of {total} questions…',
      done: 'Downloaded {file}: {q} questions, bank seed {seed}.',
      doneOne: 'Downloaded {file}: 1 question, bank seed {seed}.',
      missing: 'Not enough distinct instances were found for: {list}.',
      missingItem: '{stage}, {level} ({made} of {wanted})',
      cancelled: 'Generation cancelled: nothing was downloaded.',
      previewTitle: 'Preview',
      previewHint: 'This is how students will see a question from the bank, without Moodle’s styling. The solution and the links go in the feedback.',
      previewFeedback: 'General feedback',
      hole: 'Blank',
      howTitle: 'How to use it in Moodle',
      how1: 'In the course: Question bank → Import → “Moodle XML”. One category per stage and level is created under “Project networks”.',
      how2: 'In the quiz, add a “random question” from each category: each student gets different instances of the same level. Each question is worth 1 mark, and you can change that in the quiz.',
      how3: 'In the review options, show the “Right answer”, the “Specific feedback” and the “General feedback” only “After the quiz is closed”: all three reveal the solution, and the general feedback also holds the links to the lab.',
      how4: 'If you use Safe Exam Browser, check that the links can be opened during the review.',
      seedNote: 'Each download uses a new seed, so the bank cannot be regenerated from here. Each question’s name (hidden from students) includes its seed and the generator version, to reproduce the exercise if a student queries the mark.',
      file: 'network-bank',
    },
  };

  I.dict.es.mq = es;
  I.dict.en.mq = en;

  /** La función de textos que recibe core/moodle: tr(key, params) = i18n.t(lang, 'mq.' + key, params). */
  const tr = (lang) => (k, p) => I.t(lang, `mq.${k}`, p);
  /** Los encabezados de la notación elegida (actividades y sucesos), para ctx.labels de core/moodle. */
  const labels = (nota) => Object.assign(I.notation(nota), I.eventNotation(nota));

  const api = { tr, labels };
  root.PNL = root.PNL || {};
  root.PNL.i18nMoodle = api;
  if (isNode) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
