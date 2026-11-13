/*
 * portal-content — textos de la portada en español e inglés, resolución del idioma y enlaces al
 * laboratorio. Sin DOM: se prueba en Node (tests/portal.test.js). Mismo patrón que el portal del GA Lab.
 */
(function (root) {
  'use strict';

  const messages = {
    es: {
      docTitle: 'Laboratorio de redes de proyectos · Herramientas docentes',
      description: 'Laboratorio docente de redes de proyectos: de la tabla de precedencias al camino crítico con redes ROY y PERT, y del PERT de tres tiempos a Montecarlo.',
      skip: 'Ir a los módulos', brand: 'Herramientas docentes',
      modulesNav: 'Módulos', workshopNav: 'Taller', manualNav: 'Manual', aboutNav: 'Sobre el proyecto', languageLabel: 'Idioma del portal',
      eyebrow: 'Construye · Calcula · Simula', titleLine1: 'Laboratorio de', titleLine2: 'redes de proyectos.',
      lead: 'Desde la tabla de precedencias hasta el riesgo de terminar tarde. Aprende cada paso con redes ROY y PERT que se construyen y se calculan delante de ti, actividad a actividad.',
      startRoute: 'Empezar la ruta guiada', chooseModule: 'Elige un módulo', openWorkshop: 'Abrir el taller',
      heroNote: '¿Empiezas de cero? La ruta guiada sigue un único proyecto, el Ejercicio 6, desde la tabla hasta el camino crítico.',
      heroCardTitle: 'Ejercicio 6 · red ROY', heroVisual: 'Red ROY del Ejercicio 6 con el camino crítico B, E, I, J, K resaltado',
      nodeStart: 'Inicio', nodeEnd: 'Fin', heroCaption: 'Camino crítico B → E → I → J → K · 13 días',
      modulesTitle: 'Ocho módulos. Una misma red.', modulesNote: 'Abiertos · Interactivos · ES / EN',
      groupKnown: 'Del enunciado al camino crítico · duraciones conocidas', groupUncertain: 'Cuando las duraciones son inciertas',
      available: 'Disponible', soonPhase3: 'Fase 3 · en preparación', soonPhase4: 'Fase 4 · en preparación', soonManual: 'En preparación',
      m0Question: '¿Qué hay que hacer y en qué orden?', m0Title: 'Del enunciado a la tabla',
      m0Desc: 'Convierte un enunciado en actividades, duraciones y precedencias, con los once del laboratorio o con enunciados nuevos al azar. Aprende a detectar las precedencias redundantes antes de dibujar.',
      m0Topics: 'Actividades · Precedencias · Redundancias', m0Open: 'Practicar con un enunciado',
      m1Question: '¿Cómo se dibuja el proyecto?', m1Title: 'Red ROY',
      m1Desc: 'Construye la red nivel a nivel a partir de la tabla, con la matriz de encadenamiento al lado y la caja de nodo que uses en clase.',
      m1Topics: 'Actividad en nodo · Niveles · Matriz · 3 formatos de caja', m1Open: 'Abrir red ROY',
      m2Question: '¿Y si las actividades van en las flechas?', m2Title: 'Red PERT y ficticias',
      m2Desc: 'Dibuja la misma tabla con actividades en arco y descubre cuándo hacen falta ficticias, con las reglas de los conjuntos: iguales, contenidos y compartidos. Después, compara siete métodos de dibujarla y ponte a prueba con el reto de ficticias.',
      m2Topics: 'Actividad en arco · Sucesos · Ficticias · ROY ⇄ PERT', m2Open: 'Abrir red PERT', m2Compare: 'Comparar métodos', m2Reto: 'Reto de ficticias',
      m3Question: '¿Cuánto dura el proyecto?', m3Title: 'Cálculo de tiempos',
      m3Desc: 'Pasadas hacia delante y hacia atrás, actividad a actividad, con la fórmula y sus números en cada paso. Predice el valor antes de verlo.',
      m3Topics: 'ES · EF · LS · LF · Modo predicción · ¿Y si…?', m3Open: 'Abrir cálculo de tiempos',
      m4Question: '¿Qué actividades no pueden retrasarse?', m4Title: 'Holguras y caminos críticos',
      m4Desc: 'Calcula las cuatro holguras, encuentra todos los caminos críticos y mira en el Gantt qué margen tiene cada actividad.',
      m4Topics: 'Total · Libre · Independiente · Gantt', m4Open: 'Abrir holguras',
      m5Question: '¿Y si no sabemos cuánto dura?', m5Title: 'PERT de tres tiempos',
      m5Desc: 'Duraciones optimista, más probable y pesimista. De dónde salen la media y la varianza de cada actividad, y qué supone la beta.',
      m5Topics: 'a · m · b · Media · Varianza', m5Open: 'Abrir tres tiempos',
      m6Question: '¿Cuánto nos fiamos de la normal?', m6Title: 'El TCL y sus trampas',
      m6Desc: 'La probabilidad de terminar a tiempo según el teorema central del límite, y por qué mirar solo el camino crítico medio subestima el riesgo.',
      m6Topics: 'Normal · Sesgo de fusión · Caminos casi críticos', m6Open: 'Explorar el TCL',
      m7Question: '¿Qué actividad importa de verdad?', m7Title: 'Montecarlo e índices',
      m7Desc: 'Simula miles de veces el proyecto y mide con qué frecuencia es crítica cada actividad y cuánto influye en la duración total.',
      m7Topics: 'Simulación · Índice de criticidad · Crucialidad',
      fitTitle: 'Así encajan', fitNote: 'La misma tabla de principio a fin', fitKnown: 'Duraciones conocidas', fitUncertain: 'Duraciones inciertas',
      fitTable: 'Enunciado → tabla', fitTableSub: 'M0 · precedencias', fitRoy: 'Red ROY', fitOr: 'o', fitPert: 'Red PERT',
      fitNetSub: 'M1 · M2 · dos dibujos de la misma tabla', fitTimes: 'Tiempos', fitTimesSub: 'M3 · hacia delante y hacia atrás',
      fitFloats: 'Holguras y camino crítico', fitFloatsSub: 'M4 · cuatro holguras · Gantt',
      fitNext: 'La misma red entra en la fila de abajo con duraciones aleatorias',
      fitThree: 'Tres tiempos', fitThreeSub: 'M5 · media y varianza', fitNormal: 'Aproximación normal', fitNormalSub: 'M6 · y por qué falla',
      fitMc: 'Montecarlo', fitMcSub: 'M7 · criticidad y crucialidad',
      fitExplain: 'ROY y PERT parten de la misma tabla y llegan a los mismos tiempos; cambian el dibujo y la necesidad de ficticias. El bloque de incertidumbre reutiliza la red ya construida, y el taller sirve para todos los módulos.',
      toolsTitle: 'Para todos los módulos', toolsNote: 'Tus propios proyectos y ejercicios',
      workEyebrow: 'Taller', workTitle: 'Tu propia tabla',
      workDesc: 'Escribe o pega desde una hoja de cálculo cualquier proyecto de hasta 30 actividades, o pide una tabla al azar, y resuélvelo paso a paso. El enlace guarda la tabla para compartirla.',
      workTopics: 'Predecesoras o posteriores · Tabla al azar · Enlace para compartir',
      practiceEyebrow: 'Práctica', practiceTitle: 'Ejercicios generados',
      practiceDesc: 'Proyectos nuevos de tres niveles, o con tus parámetros, que se repiten con su semilla. Calcula tiempos, holguras y caminos críticos y recibe una corrección casilla a casilla con error consecuente, en modo Practicar o Examen.',
      practiceTopics: 'Generador · Semilla · Error consecuente', practiceOpen: 'Generar un ejercicio',
      moodleEyebrow: 'Profesorado', moodleTitle: 'Banco de Moodle',
      moodleDesc: 'Preguntas por etapas en Moodle XML: del enunciado a la tabla, tiempos, holguras, caminos críticos y sucesos, en tres niveles. Cada pregunta enlaza con su ejercicio o su enunciado y con la solución paso a paso en el laboratorio.',
      moodleTopics: 'Moodle XML · Cloze · Por etapas', moodleOpen: 'Para profesorado: bancos de preguntas para Moodle',
      learnEyebrow: 'En clase o por tu cuenta', learnTitle: 'Aprende haciendo.',
      learnLead: 'Todos los módulos comparten la misma forma de trabajar. Elige un ejemplo y sigue cada decisión del cálculo.',
      featStepTitle: 'Sigue cada paso', featStepDesc: 'Cada valor aparece con su explicación, su fórmula y la línea del pseudocódigo que lo calcula.',
      featPredictTitle: 'Predice el resultado', featPredictDesc: 'Escribe el valor antes de verlo y comprueba tu respuesta en el modo predicción.',
      featWhatIfTitle: 'Pregunta «¿y si…?»', featWhatIfDesc: 'Cambia una duración y mira qué tiempos, holguras y caminos críticos se mueven.',
      featNotationTitle: 'Usa tu notación', featNotationDesc: 'Español o inglés, siglas anglosajonas o españolas y la caja de nodo que uses en clase.',
      manualEyebrow: 'El manual · en preparación', manualTitle: 'Un manual breve para acompañar el laboratorio',
      manualDesc: 'Un recorrido corto por los módulos, con ejemplos resueltos y actividades para hacer en el laboratorio. Lo publicaremos aquí, en español y en inglés.',
      manualTopics: 'Explicaciones · Ejemplos resueltos · Actividades',
      aboutEyebrow: 'Herramientas docentes abiertas', aboutTitle: 'Para enseñar y aprender.',
      aboutLead: 'Este portal reúne los módulos de redes de proyectos para cursos de organización y dirección de proyectos en ingeniería, en grado y en máster.',
      siblingText: 'Es hermano del', siblingLink: 'Laboratorio de algoritmos genéticos',
      creditsScope: 'Equipo del laboratorio de redes de proyectos',
      creditsLinks: 'Los nombres enlazan a páginas personales o perfiles académicos, e «iD», a su registro ORCID.',
      correspondingAuthor: 'Autor de correspondencia', licenses: 'Código MIT · contenido docente CC BY 4.0.',
      feedbackText: '¿Has visto un error o tienes una sugerencia?', feedbackLink: 'Coméntalo en GitHub',
      feedbackAuthors: 'sin GitHub, escribe a los autores desde sus páginas, enlazadas arriba.',
      statsNote: 'Para saber si este material resulta útil, la portada cuenta las páginas vistas con GoatCounter, sin cookies y sin identificar a los visitantes. El laboratorio no cuenta nada.',
      statsLink: 'Estadísticas públicas', visits: 'Páginas vistas: {n}',
      institutions: 'Instituciones participantes',
      footerText: 'Laboratorio de redes de proyectos · Herramientas docentes abiertas · v0.1.0', backTop: 'Volver arriba',
    },
    en: {
      docTitle: 'Project Network Lab · Teaching tools',
      description: 'A teaching lab for project networks: from the precedence table to the critical path with activity-on-node and activity-on-arrow networks, and from three-point PERT to Monte Carlo.',
      skip: 'Skip to the modules', brand: 'Teaching tools',
      modulesNav: 'Modules', workshopNav: 'Workshop', manualNav: 'Manual', aboutNav: 'About', languageLabel: 'Portal language',
      eyebrow: 'Build · Compute · Simulate', titleLine1: 'Project', titleLine2: 'Network Lab.',
      lead: 'From the precedence table to the risk of finishing late. Learn every step with activity-on-node and activity-on-arrow networks that are built and solved in front of you, one activity at a time.',
      startRoute: 'Start the guided tour', chooseModule: 'Choose a module', openWorkshop: 'Open the workshop',
      heroNote: 'New to the topic? The guided tour follows a single project, Exercise 6, from the table to the critical path.',
      heroCardTitle: 'Exercise 6 · activity on node', heroVisual: 'Activity-on-node network of Exercise 6 with the critical path B, E, I, J, K highlighted',
      nodeStart: 'Start', nodeEnd: 'End', heroCaption: 'Critical path B → E → I → J → K · 13 days',
      modulesTitle: 'Eight modules. One network.', modulesNote: 'Open · Interactive · ES / EN',
      groupKnown: 'From the problem statement to the critical path · known durations', groupUncertain: 'When durations are uncertain',
      available: 'Available', soonPhase3: 'Phase 3 · in preparation', soonPhase4: 'Phase 4 · in preparation', soonManual: 'In preparation',
      m0Question: 'What has to be done, and in what order?', m0Title: 'From statement to table',
      m0Desc: 'Turn a problem statement into activities, durations and precedences, with the lab’s eleven or with new random statements. Learn to spot redundant precedences before drawing.',
      m0Topics: 'Activities · Precedences · Redundancies', m0Open: 'Practise with a statement',
      m1Question: 'How is the project drawn?', m1Title: 'Activity-on-node network',
      m1Desc: 'Build the network level by level from the table, with the precedence matrix alongside and the node box you use in class.',
      m1Topics: 'Activity on node · Levels · Matrix · 3 node boxes', m1Open: 'Open activity on node',
      m2Question: 'What if activities sit on the arrows?', m2Title: 'Activity-on-arrow network and dummies',
      m2Desc: 'Draw the same table with activities on arrows and find out when dummy activities are needed, using the set rules: equal, contained and shared. Then compare seven ways of drawing it and test yourself with the dummy challenge.',
      m2Topics: 'Activity on arrow · Events · Dummies · AON ⇄ AOA', m2Open: 'Open activity on arrow', m2Compare: 'Compare methods', m2Reto: 'Dummy challenge',
      m3Question: 'How long does the project take?', m3Title: 'Computing times',
      m3Desc: 'Forward and backward passes, one activity at a time, with the formula and its numbers at every step. Predict each value before you see it.',
      m3Topics: 'ES · EF · LS · LF · Prediction mode · What if…?', m3Open: 'Open computing times',
      m4Question: 'Which activities cannot be delayed?', m4Title: 'Floats and critical paths',
      m4Desc: 'Compute the four floats, find every critical path and see in the Gantt chart how much slack each activity has.',
      m4Topics: 'Total · Free · Independent · Gantt', m4Open: 'Open floats',
      m5Question: 'What if we do not know how long it takes?', m5Title: 'Three-point PERT',
      m5Desc: 'Optimistic, most likely and pessimistic durations. Where each activity’s mean and variance come from, and what the beta assumption implies.',
      m5Topics: 'a · m · b · Mean · Variance', m5Open: 'Open three-point estimates',
      m6Question: 'How far can we trust the normal?', m6Title: 'The CLT and its pitfalls',
      m6Desc: 'The probability of finishing on time according to the central limit theorem, and why looking only at the mean critical path underestimates the risk.',
      m6Topics: 'Normal · Merge bias · Near-critical paths', m6Open: 'Explore the CLT',
      m7Question: 'Which activity really matters?', m7Title: 'Monte Carlo and indices',
      m7Desc: 'Simulate the project thousands of times and measure how often each activity is critical and how much it drives the total duration.',
      m7Topics: 'Simulation · Criticality index · Cruciality',
      fitTitle: 'How they fit together', fitNote: 'The same table from start to finish', fitKnown: 'Known durations', fitUncertain: 'Uncertain durations',
      fitTable: 'Statement → table', fitTableSub: 'M0 · precedences', fitRoy: 'Activity on node', fitOr: 'or', fitPert: 'Activity on arrow',
      fitNetSub: 'M1 · M2 · two drawings of the same table', fitTimes: 'Times', fitTimesSub: 'M3 · forward and backward',
      fitFloats: 'Floats and critical path', fitFloatsSub: 'M4 · four floats · Gantt',
      fitNext: 'The same network enters the row below with random durations',
      fitThree: 'Three-point estimates', fitThreeSub: 'M5 · mean and variance', fitNormal: 'Normal approximation', fitNormalSub: 'M6 · and why it fails',
      fitMc: 'Monte Carlo', fitMcSub: 'M7 · criticality and cruciality',
      fitExplain: 'Activity-on-node and activity-on-arrow networks start from the same table and reach the same times; what changes is the drawing and the need for dummies. The uncertainty block reuses the network already built, and the workshop works with every module.',
      toolsTitle: 'For every module', toolsNote: 'Your own projects and exercises',
      workEyebrow: 'Workshop', workTitle: 'Your own table',
      workDesc: 'Type or paste from a spreadsheet any project with up to 30 activities, or ask for a random table, and solve it step by step. The link keeps the table so you can share it.',
      workTopics: 'Predecessors or successors · Random table · Shareable link',
      practiceEyebrow: 'Practice', practiceTitle: 'Generated exercises',
      practiceDesc: 'New projects at three levels, or with your own parameters, that a seed reproduces. Work out times, floats and critical paths and get a cell-by-cell correction with carried errors, in Practice or Exam mode.',
      practiceTopics: 'Generator · Seed · Carried errors', practiceOpen: 'Generate an exercise',
      moodleEyebrow: 'For teachers', moodleTitle: 'Moodle question bank',
      moodleDesc: 'Questions in stages in Moodle XML: from statement to table, times, floats, critical paths and events, at three levels. Each question links to its exercise or statement and to the step-by-step solution in the lab.',
      moodleTopics: 'Moodle XML · Cloze · In stages', moodleOpen: 'For teachers: question banks for Moodle',
      learnEyebrow: 'In class or on your own', learnTitle: 'Learn by doing.',
      learnLead: 'Every module works the same way. Pick an example and follow each decision of the calculation.',
      featStepTitle: 'Follow every step', featStepDesc: 'Each value appears with its explanation, its formula and the line of pseudocode that computes it.',
      featPredictTitle: 'Predict the result', featPredictDesc: 'Type the value before you see it and check your answer in prediction mode.',
      featWhatIfTitle: 'Ask “what if…?”', featWhatIfDesc: 'Change a duration and see which times, floats and critical paths move.',
      featNotationTitle: 'Use your notation', featNotationDesc: 'Spanish or English, English or Spanish abbreviations, and the node box you use in class.',
      manualEyebrow: 'The manual · in preparation', manualTitle: 'A short manual to go with the lab',
      manualDesc: 'A brief tour of the modules, with worked examples and activities to do in the lab. We will publish it here, in Spanish and English.',
      manualTopics: 'Explanations · Worked examples · Activities',
      aboutEyebrow: 'Open teaching tools', aboutTitle: 'For teaching and learning.',
      aboutLead: 'This portal brings together the project network modules for engineering courses in project organisation and management, at undergraduate and master’s level.',
      siblingText: 'It is a sibling of the', siblingLink: 'Genetic Algorithms Lab',
      creditsScope: 'Project Network Lab team',
      creditsLinks: 'Names link to personal pages or academic profiles, and “iD” to their ORCID record.',
      correspondingAuthor: 'Corresponding author', licenses: 'Code MIT · teaching content CC BY 4.0.',
      feedbackText: 'Found a mistake or have a suggestion?', feedbackLink: 'Tell us on GitHub',
      feedbackAuthors: 'without GitHub, write to the authors from their pages, linked above.',
      statsNote: 'To know whether this material is useful, the portal counts page views with GoatCounter, without cookies and without identifying visitors. The lab itself counts nothing.',
      statsLink: 'Public statistics', visits: 'Page views: {n}',
      institutions: 'Participating institutions',
      footerText: 'Project Network Lab · Open teaching tools · v0.1.0', backTop: 'Back to top',
    },
  };

  const LANGS = ['es', 'en'];

  // Un enlace compartido manda sobre la preferencia guardada; después, el idioma del navegador; si no, español.
  function resolveLanguage(search, saved, browser) {
    const q = new URLSearchParams(search || '').get('lang');
    if (LANGS.includes(q)) return q;
    if (LANGS.includes(saved)) return saved;
    return String(browser || '').toLowerCase().startsWith('en') ? 'en' : 'es';
  }

  // Puntos de entrada en el laboratorio. Los pasos son los de la traza del Ejercicio 6:
  // 0 = tabla, 1 = construcción de la red, 2 = primera actividad hacia delante, 26 = primera holgura.
  // M2 abre el paso 0 de la traza de la red PERT (tabla de posteriores), con graph=aoa (F2a, AC14); sus otros
  // dos enlaces, el comparador de métodos (F2b, T024) y el reto de ficticias (T026). «Ejercicios» (F3a, T017) abre sin
  // semilla: la elige la interfaz al abrir.
  const TARGETS = {
    m0: 'v=m0&st=ej5', route: 'v=route&ex=ej6&step=0', m1: 'v=route&ex=ej6&step=1', m2: 'v=route&ex=ej6&step=0&graph=aoa', cmp: 'v=route&ex=ej6&step=0&graph=aoa&view=cmp', reto: 'v=route&ex=ej6&step=0&graph=aoa&view=reto', m3: 'v=route&ex=ej6&step=2',
    m4: 'v=route&ex=ej6&step=26', m5: 'v=unc&um=m5', m6: 'v=unc&um=m6', work: 'v=work', ex: 'v=ex', moodle: 'v=moodle',
  };

  function labHref(target, lang) {
    if (!Object.prototype.hasOwnProperty.call(TARGETS, target)) throw new Error('unknown target: ' + target);
    if (!LANGS.includes(lang)) throw new Error('unknown language: ' + lang);
    return `cpm.html#${TARGETS[target]}&lang=${lang}`;
  }

  // Contador de la portada (constitución v2.1.0): GoatCounter cuenta las vistas de la ruta de la portada (index.html
  // fija la ruta en data-goatcounter-settings) y su contador público da el total de esa ruta. Aquí solo se lee.
  const COUNTER = { path: '/project-network-lab/', url: 'https://josemagalan.goatcounter.com/counter/%2Fproject-network-lab%2F.json' };

  // El total llega como texto con separadores en inglés («1,234»): se lee como número y se escribe en el idioma de la portada.
  function visitsText(lang, raw) {
    const digits = String(raw == null ? '' : raw).replace(/[^\d]/g, '');
    if (!digits || !LANGS.includes(lang)) return null;
    const n = Number(digits).toLocaleString(lang === 'en' ? 'en-GB' : 'es-ES');
    return messages[lang].visits.replace('{n}', n);
  }

  const api = { messages, resolveLanguage, labHref, TARGETS, LANGS, COUNTER, visitsText };
  root.PNLPortal = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
