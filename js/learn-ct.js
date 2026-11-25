/*
 * learn-ct — «Aprende más» de la pestaña de coste–tiempo (spec f5b-coste-tiempo, apartado «Aprende más»; plan T014,
 * bloque 4): la recta coste–tiempo y la pendiente; por qué solo se acortan críticas y hay que acortar todos los caminos
 * críticos; por qué la regla paso a paso puede fallar, con el caso del ejemplo `rf` (el «¿Por qué?» del tablero 125); el
 * modelo lineal; los costes indirectos, las penalizaciones y las primas; el atajo de Nicholas; y, solo citados, el algoritmo
 * de Ackoff y Sasieni, el coste no lineal y las reglas de compresión con duraciones inciertas. Va en su propio grupo bajo
 * demanda (cl): se carga al abrir el diálogo, no con la pestaña (principio 27). Las cifras son las del núcleo
 * (tests/learn-ct.test.js lo comprueba).
 */
(function (root) {
  'use strict';

  const es = {
    title: 'Coste–tiempo',
    sections: [
      { head: 'La recta coste–tiempo', paras: [
        'Cada actividad tiene dos puntos: el punto normal (su duración normal, con el coste más bajo) y el punto urgente (la duración más corta posible, con su coste). Entre los dos se supone una recta: cada unidad de tiempo que se le quita cuesta lo mismo. Ese coste por unidad es la pendiente: (coste urgente − coste normal) / (duración normal − duración urgente).',
        'Por debajo del punto urgente no se puede bajar, por mucho que se gaste. Una actividad con la duración urgente igual a la normal no se puede acortar. Si la duración urgente es menor y los dos costes son iguales, la pendiente es 0: acortarla sale gratis, y la regla la elige antes que ninguna.',
        'La pestaña trabaja con unidades enteras y con la recta. Klastorin (cap. 5, figuras 5.14–5.16) muestra costes que crecen cada vez más deprisa y los aproxima con varios tramos rectos, cada uno como una subtarea con su punto normal y su punto urgente; la pestaña no lo hace.',
      ] },
      { head: 'Qué se acorta: solo críticas y todos los caminos', paras: [
        'Acortar una actividad que no es crítica no acorta el proyecto: le sobra holgura. En Klastorin, D es la más barata (4 por semana), pero no está en el camino crítico A–C.',
        'Cuando hay varios caminos críticos, hay que acortarlos todos a la vez: si uno queda igual, el proyecto dura lo mismo. En Klastorin, de 21 a 20 semanas los caminos críticos son A–C y B–C. Acortar A y B cuesta 13; acortar C, que está en los dos, cuesta 10.',
        'Elegir el conjunto más barato que acorta todos los caminos críticos es un problema de corte mínimo en la red de las actividades críticas (Fulkerson, 1961; Phillips y Dessouky, 1977): la pestaña lo calcula así en cada paso. Como se acortan primero las más baratas, cada unidad cuesta igual o más que la anterior (Klastorin: 8, 10, 10 y 13).',
      ] },
      { head: 'Por qué la regla puede fallar', paras: [
        'La regla paso a paso acorta una unidad cada vez con el conjunto más barato y nunca vuelve a alargar lo que ya acortó. Casi siempre llega al óptimo, pero no siempre: Klastorin lo advierte, y el ejemplo «Cuando la regla no da el mínimo» lo enseña.',
        'En ese ejemplo, al pasar de 11 a 10 periodos la regla acorta C y D por 5: C era lo más barato para el camino B–C–E. De 9 a 8 hay tres caminos críticos, A–E, B–C–E y B–D, y la regla acorta A y B (o B y E) por 10.',
        'El óptimo acorta B y E, que ya acortan B–C–E dos veces, y vuelve a alargar C la unidad que se le quitó: 6 + 4 − 2 = 8. A 8 periodos, la regla cuesta 85 y el óptimo, 83. La unidad de C solo hacía falta mientras B no se acortaba.',
        'Desde ese paso la regla ya no parte de un óptimo, así que sigue por encima. Los métodos exactos (Fulkerson, 1961; Phillips y Dessouky, 1977) permiten alargar en el mismo paso en que se acorta; la pestaña calcula el óptimo aparte, con el modelo lineal, y lo enseña en su columna.',
      ] },
      { head: 'El óptimo: el modelo lineal', paras: [
        'Kelley (1961) planteó el problema como un programa lineal, y Klastorin lo resuelve con una hoja de cálculo (figura 5.11; Tema 6c, diapositiva 13). Las variables son el comienzo y el fin de cada actividad. Su duración, fin − comienzo, está entre la urgente y la normal; cada actividad empieza después de que acabe cada predecesora; y el proyecto acaba no más tarde de la duración T que se pide.',
        'Se minimiza el coste directo: la suma de los costes normales más, por cada actividad, su pendiente por las unidades que se le quitan. Como todas las restricciones son diferencias entre tiempos, el óptimo sale con duraciones enteras. La pestaña lo resuelve para cada duración, de la normal a la mínima: es la columna «Óptimo» y la curva del coste directo.',
      ] },
      { head: 'Costes indirectos, penalizaciones y primas', paras: [
        'Acortar sube el coste directo, pero baja el indirecto (supervisión, alquileres, gastos generales), que va con la duración. El coste total es directo + indirecto fijo + indirecto por periodo × duración + penalización por cada periodo de retraso sobre el plazo − prima por cada periodo de adelanto. Su mínimo es la duración más barata (Tema 6c, diapositiva 16).',
        'En Klastorin (figura 5.13), con 7 por semana de indirecto y 5 de penalización por cada semana más allá de la 19, el mínimo es 481 a 19 semanas. En Nicholas (figura 7.7), con prima y penalización, las duraciones de 19 y 20 semanas empatan en 131: la prima no basta para que terminar en 18 sea lo mejor.',
      ] },
      { head: 'El atajo de Nicholas', paras: [
        'Para ir directamente a la duración mínima, Nicholas propone otro camino: poner todas las actividades en su punto urgente y, después, alargar las que no alargan el proyecto, empezando por la de mayor pendiente, que es la que más ahorra. En su ejemplo, todo urgente cuesta 104 y, tras alargar B, E y D, 86, lo mismo que el óptimo.',
        'El atajo tampoco es exacto: alargar primero la de mayor pendiente puede impedir alargar otras que, juntas, ahorran más. La pestaña lo compara con el óptimo y avisa de la diferencia.',
      ] },
      { head: 'Otros métodos, solo citados', paras: [
        'El Tema 6c presenta también el algoritmo de Ackoff y Sasieni (1968), recogido por Domínguez Machuca (1995) y por Dios Palomares y Cañas Madueño (1981). La pestaña no lo sigue paso a paso: enseña la regla y el óptimo.',
        'Cuando las duraciones son inciertas, Johnson y Schou (1990, en Klastorin, cap. 6) proponen tres reglas: acortar la actividad del camino crítico esperado con menor pendiente; la de mayor índice de criticidad (Van Slyke, 1963); o la de menor coste por unidad de duración esperada que se gana, que tiene en cuenta ese índice. Los índices de criticidad se calculan en «Duraciones inciertas» (Montecarlo).',
      ] },
    ],
  };

  const en = {
    title: 'Time–cost',
    sections: [
      { head: 'The time–cost line', paras: [
        'Each activity has two points: the normal point (its normal duration, with the lowest cost) and the crash point (the shortest possible duration, with its cost). A straight line is assumed between them: each time unit taken off costs the same. That cost per unit is the slope: (crash cost − normal cost) / (normal duration − crash duration).',
        'Below the crash point nothing can be gained, however much is spent. An activity whose crash duration equals its normal duration cannot be shortened. If the crash duration is shorter and both costs are equal, the slope is 0: shortening it is free, and the rule picks it before any other.',
        'The tab works with whole units and with the line. Klastorin (ch. 5, Figs. 5.14–5.16) shows costs that grow faster and faster and approximates them with several straight pieces, each one a subtask with its own normal and crash points; the tab does not do this.',
      ] },
      { head: 'What is shortened: only critical activities and every path', paras: [
        'Shortening an activity that is not critical does not shorten the project: it has float to spare. In Klastorin, D is the cheapest (4 per week), but it is not on the critical path A–C.',
        'When there are several critical paths, all of them have to be shortened at once: if one stays the same, the project takes as long as before. In Klastorin, from 21 to 20 weeks the critical paths are A–C and B–C. Shortening A and B costs 13; shortening C, which is on both, costs 10.',
        'Choosing the cheapest set that shortens every critical path is a minimum cut problem on the network of the critical activities (Fulkerson, 1961; Phillips and Dessouky, 1977): the tab computes it that way at each step. Since the cheapest ones are shortened first, each unit costs the same as or more than the previous one (Klastorin: 8, 10, 10 and 13).',
      ] },
      { head: 'Why the rule can fail', paras: [
        'The step-by-step rule shortens one unit at a time with the cheapest set and never lengthens back what it has shortened. It almost always reaches the optimum, but not always: Klastorin warns about it, and the example “When the rule misses the minimum” shows it.',
        'In that example, going from 11 to 10 periods the rule shortens C and D for 5: C was the cheapest for path B–C–E. From 9 to 8 there are three critical paths, A–E, B–C–E and B–D, and the rule shortens A and B (or B and E) for 10.',
        'The optimum shortens B and E, which already shorten B–C–E twice, and lengthens C back by the unit it had lost: 6 + 4 − 2 = 8. At 8 periods, the rule costs 85 and the optimum, 83. The unit taken from C was only needed while B was not shortened.',
        'From that step on the rule no longer starts from an optimum, so it stays above. The exact methods (Fulkerson, 1961; Phillips and Dessouky, 1977) allow lengthening in the same step as shortening; the tab computes the optimum separately, with the linear model, and shows it in its column.',
      ] },
      { head: 'The optimum: the linear model', paras: [
        'Kelley (1961) stated the problem as a linear program, and Klastorin solves it with a spreadsheet (Fig. 5.11; Topic 6c, slide 13). The variables are the start and the finish of each activity. Its duration, finish − start, lies between the crash and the normal one; each activity starts after each predecessor finishes; and the project finishes no later than the duration T asked for.',
        'The direct cost is minimized: the sum of the normal costs plus, for each activity, its slope times the units taken off. Since every constraint is a difference between times, the optimum comes out with whole durations. The tab solves it for each duration, from the normal to the minimum: it is the “Optimum” column and the direct cost curve.',
      ] },
      { head: 'Indirect costs, penalties and bonuses', paras: [
        'Shortening raises the direct cost but lowers the indirect cost (supervision, rentals, overheads), which goes with the duration. The total cost is direct + fixed indirect + indirect per period × duration + penalty per period late beyond the deadline − bonus per period early. Its minimum is the cheapest duration (Topic 6c, slide 16).',
        'In Klastorin (Fig. 5.13), with 7 per week of indirect cost and a penalty of 5 for each week beyond week 19, the minimum is 481 at 19 weeks. In Nicholas (Fig. 7.7), with a bonus and a penalty, the durations of 19 and 20 weeks tie at 131: the bonus is not enough to make finishing at 18 the best choice.',
      ] },
      { head: 'Nicholas’s shortcut', paras: [
        'To go straight to the minimum duration, Nicholas proposes another way: put every activity at its crash point and then lengthen those that do not lengthen the project, starting with the highest slope, which saves the most. In his example, everything crashed costs 104 and, after lengthening B, E and D, 86, the same as the optimum.',
        'The shortcut is not exact either: lengthening the highest slope first can prevent lengthening others that, together, save more. The tab compares it with the optimum and shows the difference.',
      ] },
      { head: 'Other methods, only cited', paras: [
        'Topic 6c also presents the Ackoff and Sasieni algorithm (1968), described by Domínguez Machuca (1995) and by Dios Palomares and Cañas Madueño (1981). The tab does not follow it step by step: it shows the rule and the optimum.',
        'When durations are uncertain, Johnson and Schou (1990, in Klastorin, ch. 6) propose three rules: shorten the activity on the expected critical path with the smallest slope; the one with the largest criticality index (Van Slyke, 1963); or the one with the lowest cost per unit of expected duration gained, which takes that index into account. Criticality indices are computed in “Uncertain durations” (Monte Carlo).',
      ] },
    ],
  };

  const refs = {
    es: [
      'Klastorin, T. (2010). Gestión de proyectos. Profit Editorial (caps. 5 y 6).',
      'Nicholas, J. M. y Steyn, H. (2012). Project Management for Engineering, Business and Technology (4.ª ed.), cap. 7, §7.1. Routledge.',
      'Apuntes de la asignatura, Tema 6c: Relación tiempo/coste (diapositivas 10–16).',
      'Kelley, J. E. (1961). Critical-path planning and scheduling: Mathematical basis. Operations Research, 9(3), 296–320.',
      'Fulkerson, D. R. (1961). A network flow computation for project cost curves. Management Science, 7(2), 167–178.',
      'Phillips, S. y Dessouky, M. I. (1977). Solving the project time/cost tradeoff problem using the minimal cut concept. Management Science, 24(4), 393–400.',
      'Ackoff, R. L. y Sasieni, M. W. (1968). Fundamentals of Operations Research, cap. 11. Wiley (trad.: Fundamentos de investigación de operaciones, Limusa, 1971).',
      'Domínguez Machuca, J. A. et al. (1995). Dirección de operaciones: aspectos tácticos y operativos en la producción y los servicios. McGraw-Hill.',
      'Dios Palomares, R. y Cañas Madueño, J. A. (1981). El algoritmo de Ackoff-Sasieni en el control de proyectos: uso de los microcomputadores. Revista Española de Financiación y Contabilidad, X(35), 383–418.',
      'Johnson, G. y Schou, C. D. (1990). Expediting projects in PERT with stochastic time estimates. Project Management Journal, 21(2), 29–33 (citado en Klastorin, cap. 6).',
      'Van Slyke, R. M. (1963). Monte Carlo methods and the PERT problem. Operations Research, 11(5), 839–860.',
    ],
    en: [
      'Klastorin, T. (2010). Gestión de proyectos [Project management]. Profit Editorial (chs. 5 and 6).',
      'Nicholas, J. M. and Steyn, H. (2012). Project Management for Engineering, Business and Technology (4th ed.), ch. 7, §7.1. Routledge.',
      'Course notes, Topic 6c: Time/cost trade-off (slides 10–16).',
      'Kelley, J. E. (1961). Critical-path planning and scheduling: Mathematical basis. Operations Research, 9(3), 296–320.',
      'Fulkerson, D. R. (1961). A network flow computation for project cost curves. Management Science, 7(2), 167–178.',
      'Phillips, S. and Dessouky, M. I. (1977). Solving the project time/cost tradeoff problem using the minimal cut concept. Management Science, 24(4), 393–400.',
      'Ackoff, R. L. and Sasieni, M. W. (1968). Fundamentals of Operations Research, ch. 11. Wiley.',
      'Domínguez Machuca, J. A. et al. (1995). Dirección de operaciones: aspectos tácticos y operativos en la producción y los servicios [Operations management]. McGraw-Hill.',
      'Dios Palomares, R. and Cañas Madueño, J. A. (1981). El algoritmo de Ackoff-Sasieni en el control de proyectos: uso de los microcomputadores [The Ackoff-Sasieni algorithm in project control: using microcomputers]. Revista Española de Financiación y Contabilidad, X(35), 383–418.',
      'Johnson, G. and Schou, C. D. (1990). Expediting projects in PERT with stochastic time estimates. Project Management Journal, 21(2), 29–33 (cited in Klastorin, ch. 6).',
      'Van Slyke, R. M. (1963). Monte Carlo methods and the PERT problem. Operations Research, 11(5), 839–860.',
    ],
  };

  const api = { es, en, refs };
  root.PNL = root.PNL || {};
  root.PNL.learnCt = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
