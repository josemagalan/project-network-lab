# Project Network Lab · PERT · CPM · ROY

**ES** · Laboratorio interactivo y bilingüe para enseñar redes de proyectos: de la tabla de precedencias a las redes ROY (actividad en nodo) y PERT (actividad en arco), tiempos, holguras, caminos críticos, el TCL y sus trampas, y el análisis de riesgo con Montecarlo. Incluye ejercicios generados con corrección automática y error consecuente; los bancos de preguntas para Moodle llegarán después.

**EN** · Interactive bilingual lab for teaching project networks: from precedence tables to activity-on-node (ROY) and activity-on-arrow (PERT) networks, scheduling, slack, critical paths, the pitfalls of the central limit theorem, and Monte Carlo risk analysis. It includes generated exercises with automatic marking that carries errors forward; Moodle question banks will follow.

**Abrir el laboratorio / Open the lab:** https://josemagalan.github.io/project-network-lab/

Proyecto hermano de / Sister project of [Genetic Algorithms Lab](https://josemagalan.github.io/genetic-algorithms-lab/).

## Español

### Qué hay ya (fase 1: CPM determinista con la red ROY)

- **Ruta guiada** (`cpm.html`). Un mismo proyecto, el Ejercicio 6, de la tabla al Gantt en 32 pasos: construcción de la red ROY por niveles, pasada hacia delante y hacia atrás actividad a actividad, holguras total, libre, independiente y de seguridad, caminos críticos y Gantt a fechas tempranas o tardías. Cada paso explica la fórmula activa con sus números.
- **Modo predicción.** Antes de revelar un paso, el alumno escribe los valores y la herramienta marca cada uno como correcto o incorrecto.
- **Matriz de encadenamiento** sincronizada con la red, para el mismo cálculo hecho en tabla.
- **«¿Y si…?».** Alarga una actividad y observa qué holguras se consumen y cuándo cambia el camino crítico.
- **Taller.** Escribe o pega desde una hoja de cálculo cualquier proyecto de hasta 30 actividades, como predecesoras o como posteriores. La tabla se valida al momento (ciclos, referencias desconocidas, precedencias redundantes) y todo se resuelve con la misma ruta.
- **Configurable para cada asignatura:** notación anglosajona (ES, EF, LS, LF, TF, FF, IF, SF) o española (tᵢ, fᵢ, tᵢ*, fᵢ*, HT, HL, HI, HS), tres formatos de caja del nodo y español o inglés. Sigue el modo claro u oscuro del sistema.
- **Todo cabe en un enlace.** La URL guarda el ejemplo o la tabla, el paso, la vista, el idioma, la notación y el formato, así que un ejercicio concreto se comparte copiando la dirección.
- **Seis ejemplos de referencia** con los valores contrastados con su fuente: Mecánicas del Sureste (Ejercicio 6) y Proyecto industrial (Ejercicio 4) de los apuntes de Gestión de Proyectos de la Universidad de Burgos, dos ejemplos ROY resueltos con la matriz, el ejemplo de 6 tareas de Klastorin (2010) y Reliable Construction Co. de Hillier y Lieberman (2015).

### Fase 2a: la red PERT y sus ficticias

- **Red PERT (actividad en arco)** de la misma tabla, paso a paso: [`cpm.html#graph=aoa&ex=ej6`](https://josemagalan.github.io/project-network-lab/cpm.html#graph=aoa&ex=ej6). Parte de la tabla de posteriores y aplica las reglas de los conjuntos (iguales, contenidos y compartidos, enunciadas por José Manuel Galán), cada una con las actividades que la cumplen y las ficticias que crea. Después coloca y numera los sucesos (i < j) y calcula sus tiempos temprano y tardío y su holgura. Las holguras de actividad y el camino crítico son los de la red ROY.
- **Contador de ficticias.** Compara las ficticias de las reglas con el mínimo posible, calculado con una búsqueda exacta con presupuesto fijo («entre L y V» si la tabla es muy grande). Cuando las reglas ponen alguna de más, enseña la red mínima al lado y explica qué precedencia implícita aprovecha.
- **ROY y PERT juntas.** Un selector cambia de red en el paso equivalente, la vista «Lado a lado» muestra las dos y, al seleccionar una ficticia, se resaltan en la red ROY las precedencias que representa.
- **Predicción también en la red PERT:** qué actividades cumple cada regla y cuántas ficticias crea, y los tiempos de cada suceso.
- **Cuatro ejercicios más** de los apuntes, con la red del autor como referencia: los ejercicios 1, 2 y 3 (solo precedencias) y el 7. En el taller, una tabla sin ninguna duración también se construye en la red PERT.

### Fase 2b: comparador de métodos y reto de ficticias

- **Comparador de métodos** («Comparar métodos» en la red PERT, el taller y M2): [`cpm.html#graph=aoa&view=cmp&ex=ej6`](https://josemagalan.github.io/project-network-lab/cpm.html#graph=aoa&view=cmp&ex=ej6). Dibuja la red PERT de la misma tabla con siete métodos: dibujo progresivo, reglas de los conjuntos, agrupar por precedentes (Cohen y Sadeh, 2007), Kim (2008), Spinrad (1986), Corneil, Gotlieb y Lee (1973) y el mínimo exacto. Cada tarjeta da sus ficticias y sucesos, si la red es correcta y cuánto le falta para el mínimo, y marca las ficticias que se pueden quitar. Dos métodos se ven lado a lado y, al seleccionar una actividad o una ficticia, se resalta en todas las redes. Cada método tiene su «Aprende más» con la referencia, lo que garantiza y la lectura que ha elegido la herramienta.
- **Dibujo progresivo paso a paso,** también en modo predicción: de qué suceso sale cada actividad y qué precedentes necesitan una ficticia, y por qué.
- **Reto de ficticias** (en la red PERT, el comparador, el taller y M2): [`cpm.html#graph=aoa&view=reto&ex=ej6`](https://josemagalan.github.io/project-network-lab/cpm.html#graph=aoa&view=reto&ex=ej6). El alumno construye su propia red PERT con el menor número de ficticias, escribiendo los sucesos en una tabla o dibujándolos en un lienzo (con ratón, pulsaciones o solo con el teclado, sin arrastrar). Al comprobar, el diagnóstico nombra cada error con sus actividades o sucesos (precedencia que falta o que sobra, actividades paralelas sin ficticia, más de un suceso inicial o final, ciclo, numeración que no cumple i < j…) y, con la red correcta, cuántas ficticias tiene frente al mínimo y cuáles sobran. Se puede ver la red de cualquier método y volver a la propia, y la red del alumno viaja en el enlace.
- **Cuatro tablas nuevas** en el taller, con las cifras de sus fuentes: Kim (2008), Cohen y Sadeh (2007), Sysło (1981) y un caso tipo en el que las reglas ponen una ficticia de más.

### Fase 2c: del enunciado a la tabla (M0)

- **Del enunciado a la tabla** (la pestaña «Del enunciado a la tabla», la tarjeta M0 de la portada y el taller): [`cpm.html#v=m0&st=ej5`](https://josemagalan.github.io/project-network-lab/cpm.html#v=m0&st=ej5). El texto del enunciado y la tabla de precedencias se ven a la vez. El alumno subraya en el texto las actividades, las duraciones y las frases de dependencia (con ratón, pulsaciones o solo con el teclado, sin arrastrar) y escribe la tabla como lista o como matriz de precedencias, que cambian a la vez. Mientras edita, cada precedencia redundante se explica con el camino que la implica y cada ciclo con su recorrido, con la frase que los provocó. Al comprobar, el diagnóstico frente a la tabla del enunciado nombra cada error con sus actividades y su frase (actividad que falta o que sobra, duración distinta, precedencia que falta, falsa o invertida); con la tabla correcta, la tabla depurada se abre en M1 o en M2.
- **Ruta paso a paso,** también en modo predicción: recorre las frases del enunciado en orden, dice qué precedencias da cada una y por qué, y llena la tabla hasta depurarla en el último paso.
- **Once enunciados** en español y en inglés: los siete ejercicios del Tema 6 de los apuntes de Gestión de Proyectos de la Universidad de Burgos (seis con la misma tabla que la ruta guiada y la red PERT, y Electrona, el ejercicio 5, con la tabla validada por el autor) y cuatro escritos para la herramienta (la reforma de una cocina, un congreso, la mudanza de un laboratorio y el lanzamiento de un producto), con frases que no dan precedencia, «es lo primero» y «es lo último», una precedencia redundante provocada, una trampa de lectura que da un ciclo y un texto en prosa sin letras.
- **Enunciado propio** («Preparar un enunciado»): el docente pega su texto, lo subraya, escribe la tabla de referencia y copia dos enlaces: uno para el alumno, con la tabla vacía, y otro con la solución, para proyectarla. Con un ciclo en la tabla no se puede compartir. Todo viaja en el enlace, sin servidor; no es un modo examen, porque quien sabe leer la URL puede sacar la solución.

### Fase 3a: ejercicios generados

- **Ejercicios** (la pestaña «Ejercicios» y la tarjeta «Ejercicios generados» de la portada): [`cpm.html#v=ex`](https://josemagalan.github.io/project-network-lab/cpm.html#v=ex). Genera proyectos nuevos de tres niveles (fácil, media y difícil, con sus parámetros a la vista) o con los parámetros que se elijan en «Personalizar», que avisa si no son posibles. La misma semilla da siempre la misma tabla, así que el enlace comparte exactamente el mismo ejercicio. El alumno escribe en una tabla, con la red ROY (o la red PERT de las reglas) al lado y sin cifras, lo que se pide: tiempos de actividad, tiempos de suceso, holguras (con la de seguridad, si se quiere) y caminos críticos, en notación anglosajona o española.
- **Corrección con error consecuente.** Cada casilla se juzga con la solución y con la fórmula del método aplicada a los datos del propio alumno: un error se penaliza una sola vez y las casillas que dependen de él cuentan como buenas. La explicación de cada casilla dice qué valor esperaba, con qué datos y dónde empezó el error. Las marcas se distinguen por icono, borde y fondo, no solo por el color.
- **Practicar o Examen.** En Practicar se comprueba cuando se quiera. El modo Examen es una autoevaluación: no hay marcas, pistas ni solución hasta entregar; después, la tabla se bloquea y se ven la nota, la corrección y la solución paso a paso, también al recargar el enlace. Como la semilla reproduce el ejercicio, no oculta la solución a quien sepa buscarla.
- **Solución paso a paso:** «Ver la solución paso a paso» abre la ruta guiada (o el cálculo de los sucesos en la red PERT) con la misma tabla, y «Atrás» vuelve al ejercicio.
- **Tabla al azar** en el taller: pone una tabla generada del nivel elegido, que se resuelve como cualquier otra (en M1–M4, la red PERT, el comparador y el reto); «Atrás» recupera la tabla anterior.

### Fase 3b: bancos de preguntas para Moodle

- **Exportador** (la tarjeta «Banco de Moodle» de la portada y el «Aprende más» de «Ejercicios»): [`cpm.html#v=moodle`](https://josemagalan.github.io/project-network-lab/cpm.html#v=moodle). Genera en el navegador un banco de preguntas de cálculo y lo descarga en formato Moodle XML, que se importa en cualquier Moodle sin plugins (Banco de preguntas → Importar → «Moodle XML»).
- **Por etapas.** Cada pregunta da como datos los resultados correctos de la etapa anterior, así que un error no se arrastra de una pregunta a otra: 1, tiempos tempranos; 2, tiempos tardíos; 3, holguras (con la de seguridad, si se quiere); 4a, actividades críticas (Sí/No); 4b, caminos críticos (opción múltiple); 5, tiempos tempranos de suceso, y 6, tiempos tardíos y holguras de suceso, con la red PERT de las reglas dada por sus arcos. La corrección con error consecuente completa queda en «Ejercicios».
- **Niveles y ejemplares.** Los niveles son los de «Ejercicios» (fácil, media y difícil). Se elige cuántos ejemplares hay por categoría (de 1 a 50), y hay una categoría por etapa y nivel, para montar un cuestionario con una pregunta aleatoria de cada una. El banco sale en el idioma de la página y con la notación elegida.
- **Soluciones del núcleo.** Cada pregunta se construye con el mismo cálculo que el laboratorio y su retroalimentación enlaza con ese ejercicio en «Ejercicios» y con la solución paso a paso. El nombre de cada pregunta, que el alumnado no ve, lleva su semilla para reproducirla; la semilla del banco es nueva en cada descarga.
- **Vista previa e instrucciones:** la vista enseña una pregunta como la verá el alumnado y explica cómo importar el banco y montar el cuestionario.

La portada (`index.html`) presenta los ocho módulos del itinerario. Hoy están disponibles M0 (del enunciado a la tabla, con la ruta paso a paso y el enunciado propio), M1 (red ROY), M2 (red PERT y ficticias, con el comparador de métodos y el reto), M3 (cálculo de tiempos), M4 (holguras y caminos críticos), el taller, los ejercicios generados y los bancos de Moodle; la parte estocástica llegará en las fases siguientes.

### Usarlo sin conexión

Descarga el repositorio y abre `index.html` en el navegador. No necesita servidor ni conexión: D3 v7 va incluido en `vendor/`.

### Desarrollo

Solo hace falta Node 22 o posterior; el proyecto no tiene dependencias.

```
npm start              # vista previa en http://127.0.0.1:4173
npm test               # sintaxis, núcleo, textos, accesibilidad estática y portada
npm run coverage       # cobertura de js/core (mínimo 90 % de líneas)
npm run test:browser   # Chromium con Playwright y axe-core, si están instalados
```

Las pruebas de navegador necesitan `npm i --no-save playwright axe-core` y `npx playwright install chromium`; la integración continua las ejecuta en cada push. Recorren las rutas ROY y PERT en los dos idiomas, con y sin predicción, y comprueban el enlace y la recarga, la matriz, el lado a lado, el contador de ficticias, el comparador, el dibujo progresivo, el reto (con un error de cada tipo), los ejercicios generados (los tres niveles en Practicar y en Examen, el error consecuente, los sucesos, «Personalizar» y «Tabla al azar»), el teclado, 1280×720 y 360 px, axe en modo claro y oscuro, y que ninguna vista cargue más de 1 MB.

## English

### What is available (phase 1: deterministic CPM on the activity-on-node network)

- **Guided tour** (`cpm.html`). One project, Exercise 6, from the precedence table to the Gantt chart in 32 steps: building the activity-on-node network by levels, the forward and backward passes one activity at a time, total, free, independent and safety slack, critical paths, and an early- or late-start Gantt chart. Every step explains the active formula with its numbers.
- **Prediction mode.** Students type the values before a step is revealed, and each one is marked right or wrong.
- **Chain matrix** synchronised with the network, showing the same calculation as a table.
- **"What if…?"** Lengthen an activity and see which slack is consumed and when the critical path changes.
- **Workshop.** Type or paste from a spreadsheet any project with up to 30 activities, as predecessors or as successors. The table is checked as you type (cycles, unknown references, redundant precedences) and solved with the same guided tour.
- **Adapts to each course:** Anglo-Saxon notation (ES, EF, LS, LF, TF, FF, IF, SF) or Spanish notation (tᵢ, fᵢ, tᵢ*, fᵢ*, HT, HL, HI, HS), three node box layouts, and English or Spanish. It follows the system light or dark mode.
- **Everything fits in a link.** The URL stores the example or table, the step, the view, the language, the notation and the box layout, so a specific exercise is shared by copying the address.
- **Six reference examples** checked against their sources: Mecánicas del Sureste (Exercise 6) and an industrial project (Exercise 4) from the Project Management course notes at the University of Burgos, two activity-on-node examples solved with the chain matrix, the 6-task example from Klastorin (2010), and Reliable Construction Co. from Hillier & Lieberman (2015).

### Phase 2a: the activity-on-arrow network and its dummies

- **Activity-on-arrow (PERT) network** of the same table, step by step: [`cpm.html#graph=aoa&ex=ej6`](https://josemagalan.github.io/project-network-lab/cpm.html#graph=aoa&ex=ej6&lang=en). It starts from the successor table and applies the set rules (equal, contained and shared, stated by José Manuel Galán), each with the activities it applies to and the dummies it adds. It then places and numbers the events (i < j) and computes their early and late times and their slack. Activity floats and the critical path are those of the activity-on-node network.
- **Dummy counter.** It compares the dummies of the rules with the minimum possible, found by an exact search with a fixed budget (“between L and V” for very large tables). When the rules add one too many, it shows the minimum network alongside and explains which implicit precedence it uses.
- **AON and AOA together.** A switch changes network at the equivalent step, the “Side by side” view shows both, and selecting a dummy highlights the precedences it stands for in the activity-on-node network.
- **Prediction on the activity-on-arrow network too:** which activities each rule applies to and how many dummies it adds, and the times of each event.
- **Four more exercises** from the course notes, with the author’s network as reference: exercises 1, 2 and 3 (precedences only) and 7. In the workshop, a table with no durations at all is also built as an activity-on-arrow network.

### Phase 2b: method comparison and dummy challenge

- **Method comparison** (“Compare methods” in the activity-on-arrow network, the workshop and M2): [`cpm.html#graph=aoa&view=cmp&ex=ej6`](https://josemagalan.github.io/project-network-lab/cpm.html#graph=aoa&view=cmp&ex=ej6&lang=en). It draws the activity-on-arrow network of the same table with seven methods: progressive drawing, the set rules, grouping by predecessors (Cohen & Sadeh, 2007), Kim (2008), Spinrad (1986), Corneil, Gotlieb & Lee (1973) and the exact minimum. Each card gives its dummies and events, whether the network is correct and how far it is from the minimum, and marks the dummies that can be removed. Two methods can be shown side by side, and selecting an activity or a dummy highlights it in every network. Each method has its “Learn more” with the reference, what it guarantees and the reading the tool has chosen.
- **Progressive drawing step by step,** also in prediction mode: which event each activity leaves from, which predecessors need a dummy, and why.
- **Dummy challenge** (in the activity-on-arrow network, the method comparison, the workshop and M2): [`cpm.html#graph=aoa&view=reto&ex=ej6`](https://josemagalan.github.io/project-network-lab/cpm.html#graph=aoa&view=reto&ex=ej6&lang=en). Students build their own activity-on-arrow network with as few dummies as possible, typing the events in a table or drawing them on a canvas (with the mouse, taps or the keyboard alone, with no dragging). On checking, the diagnosis names each mistake with its activities or events (a missing or false precedence, parallel activities without a dummy, more than one start or end event, a cycle, numbering that breaks i < j…) and, for a correct network, how many dummies it has compared with the minimum and which ones are not needed. Students can look at any method’s network and go back to their own, and their network travels in the link.
- **Four new tables** in the workshop, with the figures from their sources: Kim (2008), Cohen & Sadeh (2007), Sysło (1981) and a typical case in which the set rules add one dummy too many.

### Phase 2c: from statement to table (M0)

- **From statement to table** (the “From statement to table” tab, the M0 card on the home page and the workshop): [`cpm.html#v=m0&st=ej5`](https://josemagalan.github.io/project-network-lab/cpm.html#v=m0&st=ej5&lang=en). The text of the problem statement and the precedence table are shown together. Students underline the activities, durations and dependency phrases in the text (with the mouse, taps or the keyboard alone, with no dragging) and write the table as a list or as a precedence matrix, which change together. While they edit, each redundant precedence is explained with the path that implies it and each cycle with its route, together with the phrase that caused it. On checking, the diagnosis against the statement’s table names each mistake with its activities and its phrase (a missing or extra activity, a different duration, a missing, false or reversed precedence); once the table is correct, the cleaned-up table opens in M1 or M2.
- **Step by step,** also in prediction mode: it goes through the phrases of the statement in order, says which precedences each one gives and why, and fills in the table until it is cleaned up in the last step.
- **Eleven statements** in Spanish and English: the seven exercises of Unit 6 of the Project Management course notes at the University of Burgos (six with the same table as the guided tour and the activity-on-arrow network, and Electrona, exercise 5, with the table validated by the author) and four written for the tool (a kitchen refit, a conference, moving a laboratory and a product launch), with phrases that give no precedence, “comes first” and “is the last task”, a deliberately redundant precedence, a reading trap that gives a cycle and a prose text with no letters.
- **Your own statement** (“Prepare a statement”): teachers paste their text, underline it, write the reference table and copy two links: one for students, with an empty table, and one with the solution, to project it. A table with a cycle cannot be shared. Everything travels in the link, with no server; it is not an exam mode, because anyone who can read the URL can get the solution.

### Phase 3a: generated exercises

- **Exercises** (the “Exercises” tab and the “Generated exercises” card on the home page): [`cpm.html#v=ex`](https://josemagalan.github.io/project-network-lab/cpm.html#v=ex&lang=en). It generates new projects at three levels (easy, medium and hard, with their parameters shown) or with the parameters chosen in “Customise”, which warns when they are not possible. The same seed always gives the same table, so the link shares exactly the same exercise. Students write what is asked in a table, with the activity-on-node network (or the activity-on-arrow network from the set rules) beside it and no figures: activity times, event times, floats (with the safety float, if wanted) and critical paths, in English or Spanish notation.
- **Marking that carries errors forward.** Each cell is judged against the solution and against the method’s formula applied to the student’s own data: a mistake is penalised only once, and the cells that depend on it count as right. The explanation of each cell says which value was expected, from which data, and where the mistake started. The marks differ in icon, border and background, not only in colour.
- **Practice or Exam.** In Practice, students check whenever they like. Exam mode is a self-assessment: no marks, hints or solution until handing in; then the table locks and the score, the marking and the step-by-step solution appear, also when the link is reloaded. Since the seed reproduces the exercise, it does not hide the solution from anyone who looks for it.
- **Step-by-step solution:** “See the solution step by step” opens the guided tour (or the event times on the activity-on-arrow network) with the same table, and “Back” returns to the exercise.
- **Random table** in the workshop: it puts in a generated table of the chosen level, which is solved like any other (in M1–M4, the activity-on-arrow network, the method comparison and the dummy challenge); “Back” brings back the previous table.

### Phase 3b: question banks for Moodle

- **Exporter** (the “Moodle question bank” card on the home page and “Learn more” in “Exercises”): [`cpm.html#v=moodle`](https://josemagalan.github.io/project-network-lab/cpm.html#v=moodle&lang=en). It generates a bank of calculation questions in the browser and downloads it in Moodle XML format, which any Moodle imports without plugins (Question bank → Import → “Moodle XML”).
- **In stages.** Each question gives the correct results of the previous stage as data, so a mistake is not carried from one question to the next: 1, early times; 2, late times; 3, floats (with the safety float, if wanted); 4a, critical activities (Yes/No); 4b, critical paths (multiple choice); 5, earliest event times; and 6, latest event times and event slack, with the activity-on-arrow network from the set rules given by its arcs. Full marking with carried errors stays in “Exercises”.
- **Levels and instances.** The levels are those of “Exercises” (easy, medium and hard). You choose how many instances there are per category (from 1 to 50), with one category per stage and level, to build a quiz with a random question from each. The bank comes out in the page language and with the chosen notation.
- **Solutions from the core.** Each question is built with the same calculation as the lab, and its feedback links to that exercise in “Exercises” and to the step-by-step solution. Each question’s name, hidden from students, includes its seed to reproduce it; the bank seed is new with every download.
- **Preview and instructions:** the view shows a question as students will see it and explains how to import the bank and build the quiz.

The home page (`index.html`) presents the eight modules of the learning path. M0 (from statement to table, with the step-by-step tour and your own statement), M1 (activity-on-node network), M2 (activity-on-arrow network and dummies, with the method comparison and the dummy challenge), M3 (scheduling), M4 (slack and critical paths), the workshop, the generated exercises and the Moodle banks are available today; the stochastic part will follow in later phases.

### Offline use

Download the repository and open `index.html` in a browser. No server or connection is needed: D3 v7 ships in `vendor/`.

### Development

Only Node 22 or later is required; the project has no dependencies.

```
npm start              # preview at http://127.0.0.1:4173
npm test               # syntax, core, texts, static accessibility and home page
npm run coverage       # js/core coverage (at least 90 % of lines)
npm run test:browser   # Chromium with Playwright and axe-core, when installed
```

Browser tests need `npm i --no-save playwright axe-core` and `npx playwright install chromium`; continuous integration runs them on every push. They walk the activity-on-node and activity-on-arrow tours in both languages, with and without prediction, and check links and reloads, the matrix, the side-by-side view, the dummy counter, the method comparison, progressive drawing, the dummy challenge (with one mistake of each kind), the generated exercises (the three levels in Practice and Exam, carried errors, events, “Customise” and “Random table”), keyboard use, 1280×720 and 360 px, axe in light and dark mode, and that no view loads more than 1 MB.

## Equipo / Team

José Manuel Galán, Silvia Díaz-de la Fuente, Virginia Ahedo, María Pereda y/and José Ignacio Santos.

## Licencia / License

- Código / Code: [MIT](LICENSE)
- Contenido docente / Teaching content: [CC BY 4.0](LICENSE-CONTENT.md)
