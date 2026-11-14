/*
 * learn-m7 — «Aprende más» de M7, Montecarlo e índices (spec f4b-montecarlo-indices; plan P4 y P11, bloque 4; T012):
 * la criticidad como probabilidad y sus límites, los empates frente a la diapositiva del Tema 6c, la crucialidad, los dos
 * índices a la vez, la significación, las distribuciones, el error del Montecarlo, la hipótesis de Schoenberger y el
 * código en Python. Va en su propio grupo bajo demanda (l7): se carga al abrir el diálogo, no con M7 (principio 27).
 * Las cifras de los ejemplos (Klastorin discreto y Williams) se comprueban contra core/mc en tests/learn-m7.test.js.
 */
(function (root) {
  'use strict';

  const es = {
    m7: {
      title: 'Montecarlo e índices: qué mide cada número',
      sections: [
        { head: 'La criticidad como probabilidad', paras: [
          'Con duraciones fijas, una actividad es crítica o no lo es. Con duraciones inciertas, cada réplica tiene su propio camino crítico, y la pregunta pasa a ser con qué probabilidad lo es. Van Slyke (1963) fue el primero en simular así una red PERT y en contar en cuántas réplicas era crítica cada actividad.',
          'Dodin y Elmaghraby (1985) definen la criticidad de un camino como la probabilidad de que sea crítico, y la de una actividad como la suma de las de los caminos que pasan por ella, es decir, la probabilidad de que esté en un camino crítico. El laboratorio la estima contando las réplicas en que la actividad tiene holgura total 0, como las columnas t(j), 1 o 0, de la simulación de Klastorin en el Tema 6c.',
        ] },
        { head: 'Empates: 0,660 frente al 61,1 % de la diapositiva', paras: [
          'En el ejemplo discreto de Klastorin (Tema 6c) hay réplicas en que dos caminos empatan: con B = 12, C = 15 y D = 3, los caminos B–D y C duran 15. Pasa con probabilidad 0,8 · 0,2 · 0,3 = 0,048.',
          'La diapositiva da cada empate a un solo camino, B–D, y por eso C sale con un 61,1 %. El laboratorio cuenta como críticas todas las actividades con holgura total 0, así que en esos empates C también es crítica: 0,612 + 0,048 = 0,660. Por eso la criticidad de los caminos suma 1,048 y no 1.',
          'La diapositiva da 61,1 % y no 61,2 % porque usa 0,333 en lugar de 1/3. Su duración esperada, 23,22, sale de lo mismo: con 1/3 exacto es 23,248.',
        ] },
        { head: 'Los límites de la criticidad', paras: [
          'La criticidad solo mira probabilidades, no cuánto alarga el proyecto una actividad. Williams (2002, §5) lo enseña con dos actividades en paralelo: B dura 0 casi siempre, pero con un 1 % de probabilidad dura 100; A dura 0,1 o 0,2. A es crítica el 99 % de las veces y B el 1 %, aunque el riesgo de tardar 100 está en B.',
          'Si A pasa a durar 10 o 20, o 2 o 99, su peso en el proyecto cambia mucho, pero la criticidad sigue siendo 99 % y 1 %: no distingue situaciones muy distintas. Son los ejemplos Williams (a), (b) y (c) del laboratorio.',
          'Además, con recursos limitados el camino crítico deja de estar bien definido, y con él la criticidad.',
        ] },
        { head: 'La crucialidad', paras: [
          'Williams (1992) propuso medir otra cosa: la correlación entre la duración de la actividad y la del proyecto, que Bowers llamó crucialidad. Si el proyecto se alarga cuando se alarga la actividad, esa actividad explica buena parte de la incertidumbre del proyecto.',
          'En los ejemplos (a), (b) y (c), la crucialidad de A es 0,005, 0,504 y 0,990, y la de B, 0,99999, 0,862 y 0,102 (Williams da 0,5 %, 50 % y 99 %, y 99,999 %, 86 % y 10 %): cambia de un ejemplo a otro, como cambia el riesgo.',
          'Pearson mide la relación lineal; Spearman, la de los rangos, y no cambia si una duración se transforma de forma creciente. Con duraciones muy asimétricas o con pocos valores distintos, conviene mirar las dos.',
          'Una correlación no es una causa. Si varias actividades dependen de un mismo factor (el mismo equipo, el mismo proveedor), todas pueden salir cruciales aunque solo una mueva el proyecto. En el laboratorio las duraciones son independientes, así que esto no pasa.',
        ] },
        { head: 'Los dos índices a la vez', paras: [
          'Tampoco la crucialidad basta. En el ejemplo Williams (d), A dura 100, fija, y B, en serie, 0,1 o 0,2: las dos son críticas siempre, pero la crucialidad de A es 0 porque no varía, y la de B es 1. Aun así, quien quiera acortar el proyecto tiene que mirar A.',
          'Williams propone mirar los dos índices. Una criticidad alta dice dónde compensa acortar la duración: si una actividad con criticidad c se acorta un poco, la duración esperada del proyecto baja unas c veces ese poco. Una crucialidad alta dice dónde compensa reducir la incertidumbre. Es lo que enseña el tornado en espejo: la criticidad a un lado y la crucialidad al otro.',
        ] },
        { head: 'El índice de significación', paras: [
          'Williams (1992) propuso también el índice de significación, que pesa cada actividad por lo que dura frente a lo que podría durar sin retrasar el proyecto: SI = E[d/(d + HT) · T/E(T)], con d la duración de la actividad en la réplica, HT su holgura total y T la duración del proyecto. El laboratorio usa la fórmula tal como la recogen Acebes y sus colegas (2021).',
          'Una actividad crítica cuenta 1 en esa réplica; una con mucha holgura, casi 0. El factor T/E(T) da más peso a las réplicas en que el proyecto se alarga. En el ejemplo discreto de Klastorin, A, B, C y D tienen significación 0,603, 0,743, 0,817 y 0,790.',
        ] },
        { head: 'Las distribuciones', paras: [
          'Todas salen de a, m y b. La beta-PERT, la beta clásica y la triangular son las de M5. La uniforme va de a a b y no usa m. La normal truncada en 0 y la lognormal tienen la media (a + 4m + b)/6 y la varianza ((b − a)/6)² de las fórmulas de examen; la truncada se aparta un poco si σ es grande frente a la media, porque pierde los valores negativos. La discreta empieza con a, m y b con probabilidades 1/6, 4/6 y 1/6, y se puede editar.',
          'Con los mismos a, m y b, la uniforme tiene más varianza que la triangular, y la triangular, más que la beta-PERT. La lognormal tiene la cola larga a la derecha: sirve para actividades que casi nunca se adelantan, pero a veces se retrasan mucho.',
        ] },
        { head: 'El error del Montecarlo', paras: [
          'Una simulación da estimaciones, no valores exactos. El error de la media baja como s/√n: con 100 veces más réplicas, el intervalo al 95 % (± 1,96·s/√n) es 10 veces más estrecho. En el ejemplo de seis tareas del Tema 6c, 200 réplicas dan una duración media de 27,13 con un intervalo al 95 % de 26,56 a 27,72.',
          'Una probabilidad o una criticidad es una proporción, con un intervalo de ± 1,96·√(p(1 − p)/n): con 10 000 réplicas, como mucho ± 0,0098. Por eso, en el ejemplo discreto, la simulación y la cuenta exacta difieren en la segunda o la tercera cifra decimal.',
          'La misma semilla da siempre los mismos números, en la web y en Python; «Otra simulación» elige otra semilla y enseña cuánto cambian. La vista «Convergencia» enseña cómo se estrechan los intervalos al añadir réplicas.',
        ] },
        { head: 'La hipótesis de Schoenberger', paras: [
          'Schoenberger (1981) explicó por qué los proyectos «siempre» se retrasan: cuando varios caminos se juntan, más varianza implica más duración esperada. En el ejemplo del Tema 6c, A dura 12, 14 o 16 (0,1, 0,8 y 0,1) y B, en paralelo, 10 o 15 (0,5 cada uno): el proyecto dura 14,55 de media, más que la media de A (14). Si la varianza de A sube (0,3, 0,4 y 0,3), con la misma media, el proyecto pasa a 14,65.',
          'En M7 se ve en la duración del proyecto: la media simulada queda por encima de la de PERT, que solo mira el camino crítico de las medias.',
        ] },
        { head: 'El código en Python', paras: [
          'El botón «Código en Python» descarga pnl_montecarlo.py, y «Proyecto en JSON», el proyecto con sus distribuciones, las réplicas, la semilla, el plazo y el percentil. Solo necesita Python 3.8 o posterior, sin instalar nada más.',
          'En una terminal: python3 pnl_montecarlo.py pnl-montecarlo-kd.json escribe un informe con la media, los percentiles, P(duración ≤ plazo), los índices de cada actividad y la criticidad de los caminos. Con --reps y --seed se cambian las réplicas y la semilla; con --json, sale todo en JSON.',
          'También se puede usar como módulo: pnl_montecarlo.analyse(datos) devuelve un diccionario con los mismos resultados y con la duración de cada réplica, para seguir con ellos en un cuaderno. Con la misma semilla, da los mismos números que la web (hasta 1e-9).',
        ] },
      ],
    },
  };

  const en = {
    m7: {
      title: 'Monte Carlo and indices: what each number measures',
      sections: [
        { head: 'Criticality as a probability', paras: [
          'With fixed durations, an activity is either critical or not. With uncertain durations, each run has its own critical path, and the question becomes how likely it is to be critical. Van Slyke (1963) was the first to simulate a PERT network this way and to count in how many runs each activity was critical.',
          'Dodin and Elmaghraby (1985) define the criticality of a path as the probability that it is critical, and that of an activity as the sum over the paths that go through it, that is, the probability that it lies on a critical path. The lab estimates it by counting the runs in which the activity has zero total float, like the t(j) columns, 1 or 0, of Klastorin’s simulation in Unit 6c.',
        ] },
        { head: 'Ties: 0.660 against the slide’s 61.1%', paras: [
          'In Klastorin’s discrete example (Unit 6c) some runs have two tied paths: with B = 12, C = 15 and D = 3, paths B–D and C both take 15. That happens with probability 0.8 · 0.2 · 0.3 = 0.048.',
          'The slide gives each tie to a single path, B–D, so C gets 61.1%. The lab counts every activity with zero total float as critical, so in those ties C is critical too: 0.612 + 0.048 = 0.660. That is why the path criticalities add up to 1.048, not 1.',
          'The slide shows 61.1% rather than 61.2% because it uses 0.333 instead of 1/3. Its expected duration, 23.22, comes from the same rounding: with exactly 1/3 it is 23.248.',
        ] },
        { head: 'The limits of criticality', paras: [
          'Criticality only looks at probabilities, not at how much an activity lengthens the project. Williams (2002, §5) shows it with two parallel activities: B almost always takes 0, but with a 1% probability it takes 100; A takes 0.1 or 0.2. A is critical 99% of the time and B 1%, even though the risk of taking 100 lies in B.',
          'If A takes 10 or 20, or 2 or 99 instead, its weight in the project changes a lot, but its criticality stays at 99% and 1%: it cannot tell very different situations apart. These are the lab’s Williams (a), (b) and (c) examples.',
          'Besides, with limited resources the critical path is no longer well defined, and neither is criticality.',
        ] },
        { head: 'Cruciality', paras: [
          'Williams (1992) proposed measuring something else: the correlation between the duration of the activity and that of the project, which Bowers called cruciality. If the project gets longer when the activity gets longer, that activity explains a good part of the project’s uncertainty.',
          'In examples (a), (b) and (c), the cruciality of A is 0.005, 0.504 and 0.990, and that of B, 0.99999, 0.862 and 0.102 (Williams gives 0.5%, 50% and 99%, and 99.999%, 86% and 10%): it changes from one example to the next, as the risk does.',
          'Pearson measures the linear relationship; Spearman, that of the ranks, and it does not change if a duration is transformed in an increasing way. With very skewed durations or with few distinct values, it is worth looking at both.',
          'A correlation is not a cause. If several activities depend on the same factor (the same team, the same supplier), they can all come out crucial even if only one of them drives the project. In the lab durations are independent, so this does not happen.',
        ] },
        { head: 'Both indices at once', paras: [
          'Cruciality is not enough either. In the Williams (d) example, A takes a fixed 100 and B, in series, 0.1 or 0.2: both are always critical, but the cruciality of A is 0 because it does not vary, and that of B is 1. Even so, anyone who wants to shorten the project has to look at A.',
          'Williams proposes looking at both indices. A high criticality tells you where shortening the duration pays off: if an activity with criticality c is shortened a little, the expected project duration falls by about c times that little. A high cruciality tells you where reducing the uncertainty pays off. That is what the mirror tornado shows: criticality on one side and cruciality on the other.',
        ] },
        { head: 'The significance index', paras: [
          'Williams (1992) also proposed the significance index, which weighs each activity by how long it takes against how long it could take without delaying the project: SI = E[d/(d + TF) · T/E(T)], where d is the duration of the activity in the run, TF its total float and T the project duration. The lab uses the formula as given by Acebes and his colleagues (2021).',
          'A critical activity counts 1 in that run; one with plenty of float, almost 0. The factor T/E(T) gives more weight to the runs in which the project takes longer. In Klastorin’s discrete example, A, B, C and D have significance 0.603, 0.743, 0.817 and 0.790.',
        ] },
        { head: 'The distributions', paras: [
          'They all come from a, m and b. The beta-PERT, the classic beta and the triangular are those of M5. The uniform goes from a to b and does not use m. The normal truncated at 0 and the lognormal have the mean (a + 4m + b)/6 and the variance ((b − a)/6)² of the exam formulas; the truncated one moves away a little when σ is large compared with the mean, because it loses the negative values. The discrete one starts as a, m and b with probabilities 1/6, 4/6 and 1/6, and it can be edited.',
          'With the same a, m and b, the uniform has more variance than the triangular, and the triangular more than the beta-PERT. The lognormal has its long tail to the right: it suits activities that are hardly ever early but sometimes very late.',
        ] },
        { head: 'The Monte Carlo error', paras: [
          'A simulation gives estimates, not exact values. The error of the mean falls as s/√n: with 100 times more runs, the 95% interval (± 1.96·s/√n) is 10 times narrower. In the six-task example of Unit 6c, 200 runs give a mean duration of 27.13 with a 95% interval from 26.56 to 27.72.',
          'A probability or a criticality is a proportion, with an interval of ± 1.96·√(p(1 − p)/n): with 10,000 runs, ± 0.0098 at most. That is why, in the discrete example, the simulation and the exact count differ in the second or third decimal place.',
          'The same seed always gives the same numbers, on the web and in Python; “Simulate again” picks another seed and shows how much they change. The “Convergence” view shows how the intervals narrow as runs are added.',
        ] },
        { head: 'Schoenberger’s hypothesis', paras: [
          'Schoenberger (1981) explained why projects are “always” late: when several paths merge, more variance means a longer expected duration. In the Unit 6c example, A takes 12, 14 or 16 (0.1, 0.8 and 0.1) and B, in parallel, 10 or 15 (0.5 each): the project takes 14.55 on average, more than the mean of A (14). If the variance of A rises (0.3, 0.4 and 0.3), with the same mean, the project goes up to 14.65.',
          'In M7 it shows in the project duration: the simulated mean ends up above PERT’s, which only looks at the critical path of the means.',
        ] },
        { head: 'The Python code', paras: [
          'The “Python code” button downloads pnl_montecarlo.py, and “Project as JSON”, the project with its distributions, runs, seed, deadline and percentile. It only needs Python 3.8 or later, with nothing else to install.',
          'In a terminal: python3 pnl_montecarlo.py pnl-montecarlo-kd.json prints a report with the mean, the percentiles, P(duration ≤ deadline), the indices of each activity and the criticality of the paths. --reps and --seed change the runs and the seed; --json prints everything as JSON.',
          'It can also be used as a module: pnl_montecarlo.analyse(data) returns a dictionary with the same results and the duration of every run, to carry on working with them in a notebook. With the same seed, it gives the same numbers as the web (to 1e-9).',
        ] },
      ],
    },
  };

  // Referencias, con la puntuación de cada idioma.
  const refs = {
    es: [
      'Van Slyke, R. M. (1963). Monte Carlo methods and the PERT problem. Operations Research, 11(5), 839–860.',
      'Dodin, B. M. y Elmaghraby, S. E. (1985). Approximating the criticality indices of the activities in PERT networks. Management Science, 31(2), 207–223.',
      'Schoenberger, D. W. (1981). Why projects are “always” late: A rationale based on manual simulation of a PERT/CPM network. Interfaces, 11(5), 66–70.',
      'Williams, T. M. (1992). Criticality in probabilistic network analysis. Journal of the Operational Research Society, 43(4), 353–357.',
      'Williams, T. (2002). Modelling complex projects, cap. 5. Wiley.',
      'Klastorin, T. (2010). Gestión de proyectos. Profit Editorial.',
      'Acebes, F., Pajares, J., González-Varona, J. M. y López-Paredes, A. (2021). Project risk management from the bottom-up: Activity Risk Index. Central European Journal of Operations Research, 29, 1375–1396.',
    ],
    en: [
      'Van Slyke, R. M. (1963). Monte Carlo methods and the PERT problem. Operations Research, 11(5), 839–860.',
      'Dodin, B. M. and Elmaghraby, S. E. (1985). Approximating the criticality indices of the activities in PERT networks. Management Science, 31(2), 207–223.',
      'Schoenberger, D. W. (1981). Why projects are “always” late: A rationale based on manual simulation of a PERT/CPM network. Interfaces, 11(5), 66–70.',
      'Williams, T. M. (1992). Criticality in probabilistic network analysis. Journal of the Operational Research Society, 43(4), 353–357.',
      'Williams, T. (2002). Modelling complex projects, ch. 5. Wiley.',
      'Klastorin, T. (2010). Gestión de proyectos [Project management]. Profit Editorial.',
      'Acebes, F., Pajares, J., González-Varona, J. M. and López-Paredes, A. (2021). Project risk management from the bottom-up: Activity Risk Index. Central European Journal of Operations Research, 29, 1375–1396.',
    ],
  };

  const api = { es, en, refs };
  root.PNL = root.PNL || {};
  root.PNL.learnM7 = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
