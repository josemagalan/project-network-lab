# Project Network Lab · PERT · CPM · ROY

**ES** · Laboratorio interactivo y bilingüe para enseñar redes de proyectos: de la tabla de precedencias a las redes ROY (actividad en nodo) y PERT (actividad en arco), tiempos, holguras, caminos críticos, el TCL y sus trampas, y el análisis de riesgo con Montecarlo. Incluirá práctica autocorregida y bancos de preguntas para Moodle.

**EN** · Interactive bilingual lab for teaching project networks: from precedence tables to activity-on-node (ROY) and activity-on-arrow (PERT) networks, scheduling, slack, critical paths, the pitfalls of the central limit theorem, and Monte Carlo risk analysis. Self-graded practice and Moodle question banks will follow.

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

La portada (`index.html`) presenta los ocho módulos del itinerario. Hoy están disponibles M1 (red ROY), M2 (red PERT y ficticias, con el comparador de métodos y el reto), M3 (cálculo de tiempos), M4 (holguras y caminos críticos) y el taller; el paso del enunciado a la tabla, la práctica, Moodle y la parte estocástica llegarán en las fases siguientes.

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

Las pruebas de navegador necesitan `npm i --no-save playwright axe-core` y `npx playwright install chromium`; la integración continua las ejecuta en cada push. Recorren las rutas ROY y PERT en los dos idiomas, con y sin predicción, y comprueban el enlace y la recarga, la matriz, el lado a lado, el contador de ficticias, el comparador, el dibujo progresivo, el reto (con un error de cada tipo), el teclado, 1280×720 y 360 px, axe en modo claro y oscuro, y que ninguna vista cargue más de 1 MB.

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

The home page (`index.html`) presents the eight modules of the learning path. M1 (activity-on-node network), M2 (activity-on-arrow network and dummies, with the method comparison and the dummy challenge), M3 (scheduling), M4 (slack and critical paths) and the workshop are available today; from problem statement to table, practice, Moodle and the stochastic part will follow in later phases.

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

Browser tests need `npm i --no-save playwright axe-core` and `npx playwright install chromium`; continuous integration runs them on every push. They walk the activity-on-node and activity-on-arrow tours in both languages, with and without prediction, and check links and reloads, the matrix, the side-by-side view, the dummy counter, the method comparison, progressive drawing, the dummy challenge (with one mistake of each kind), keyboard use, 1280×720 and 360 px, axe in light and dark mode, and that no view loads more than 1 MB.

## Equipo / Team

José Manuel Galán, Silvia Díaz-de la Fuente, Virginia Ahedo, María Pereda y/and José Ignacio Santos.

## Licencia / License

- Código / Code: [MIT](LICENSE)
- Contenido docente / Teaching content: [CC BY 4.0](LICENSE-CONTENT.md)
