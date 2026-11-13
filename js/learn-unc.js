/*
 * learn-unc — «Aprende más» de la pestaña «Duraciones inciertas» (spec f4a-tres-tiempos-tcl; plan T012): M5 (de dónde
 * salen las fórmulas de tres tiempos, las dos betas, la triangular y el panel de supuestos) y M6 (el TCL, las tres
 * aproximaciones de Hillier y Lieberman, la fusión de caminos, los otros límites y la simulación). Va en su propio
 * grupo bajo demanda (ul): se carga al abrir el diálogo, no con la pestaña (principio 27; decisions.md).
 * Las cifras de la actividad A de Klastorin (2, 6, 14) se comprueban contra core/threept en tests/learn-unc.test.js.
 */
(function (root) {
  'use strict';

  const es = {
    m5: {
      title: 'Tres tiempos: de dónde salen las fórmulas',
      sections: [
        { head: 'La idea del PERT', paras: [
          'El PERT nació en 1958 para planificar el programa del misil Polaris (Malcolm, Roseboom, Clark y Fazar, 1959). Para cada actividad se piden tres estimaciones: la optimista a, la más probable m y la pesimista b (tₒ, tₘ y tₚ en la notación española).',
          'Se supone que la duración sigue una distribución beta entre a y b, con su moda en m, y su media y su varianza se aproximan con dos fórmulas sencillas: media ≈ (a + 4m + b)/6 y varianza ≈ ((b − a)/6)².',
          'La varianza sale de suponer que entre a y b caben unas seis desviaciones típicas, como en la normal, donde la media ± 3σ recoge casi todos los valores (el 99,7 %).',
        ] },
        { head: 'Dos betas para las mismas fórmulas', paras: [
          'Ninguna beta cumple siempre las dos fórmulas a la vez. El laboratorio dibuja y simula la beta-PERT, con α = 1 + 4(m − a)/(b − a) y β = 1 + 4(b − m)/(b − a): su media es exactamente (a + 4m + b)/6, pero su varianza no es ((b − a)/6)².',
          'La beta clásica de Malcolm y sus colegas fija la moda en m y la desviación típica en (b − a)/6; a cambio, su media se aparta un poco de la fórmula.',
          'En la actividad A de Klastorin (2, 6, 14), la fórmula del examen da media 6,67 y varianza 4,00. La beta-PERT tiene la misma media y varianza 4,89; la beta clásica, varianza 4,00 y media 6,54. Son aproximaciones: lo importante es saber cuál se usa en cada cálculo.',
        ] },
        { head: 'La triangular', paras: [
          'Con los mismos a, m y b, la triangular tiene media (a + m + b)/3 y varianza (a² + b² + m² − ab − am − bm)/18. Da más peso a los extremos: si a, m y b son asimétricos, su media se aleja de m más que la del PERT (en la A de Klastorin, 7,33 frente a 6,67).',
        ] },
        { head: 'Supuestos', paras: [
          'Independencia: la duración de una actividad no dice nada de la de otra. Por eso, en un camino, las medias y las varianzas se suman.',
          'Extremos: a y b son valores que casi nunca se superan. Si se estiman como percentiles, por ejemplo el 5 % y el 95 %, el divisor 6 hay que cambiarlo: en una normal, entre esos dos percentiles hay unas 3,29 desviaciones típicas.',
          'El proyecto: con las medias se calcula el camino crítico como si las duraciones fueran fijas. El apartado M6 enseña cuándo esa simplificación engaña.',
        ] },
      ],
    },
    m6: {
      title: 'El TCL y sus trampas',
      sections: [
        { head: 'Por qué una normal', paras: [
          'El teorema central del límite (TCL) dice que la suma de muchas duraciones independientes, sin que ninguna domine, se parece a una normal cuya media es la suma de las medias y cuya varianza es la suma de las varianzas.',
          'Por eso el cálculo de examen toma la duración del proyecto como la normal N(μ, σ²) del camino crítico de las medias, calcula z = (plazo − μ)/σ y busca la probabilidad en la tabla de la normal.',
        ] },
        { head: 'Las tres aproximaciones', paras: [
          'Hillier y Lieberman (cap. 22) resumen el método en tres aproximaciones: el camino crítico de las medias es el más largo del proyecto; las duraciones de sus actividades son independientes; y la duración del proyecto sigue una normal. Cada caso de M6 pone a prueba una de ellas.',
        ] },
        { head: 'La fusión de caminos', paras: [
          'Si varios caminos casi críticos llegan al final, el proyecto termina cuando termina el último: su duración es el máximo de varios caminos, mayor que la de cualquiera de ellos. La normal de un solo camino sobrestima la probabilidad de cumplir el plazo (MacCrimmon y Ryavec, 1964).',
          'Con caminos independientes y normales, la probabilidad exacta es el producto de las probabilidades de cada camino; es la «cuenta exacta» que se ve en la fusión y en el ejemplo de las dos rutas.',
          'Schoenberger (1981) mostró con una simulación hecha a mano por qué los proyectos «siempre» se retrasan: con varios caminos en paralelo, la duración esperada del proyecto supera la del camino crítico, y más cuanta más varianza tienen.',
        ] },
        { head: 'Pocas actividades y asimetría', paras: [
          'El TCL necesita muchos sumandos. Con pocas actividades asimétricas, la suma conserva la asimetría y su cola larga queda fuera de la normal. Al sumar más actividades, la forma se parece cada vez más a la normal.',
        ] },
        { head: 'Correlación', paras: [
          'Si las duraciones se mueven juntas (el mismo equipo, el mismo tiempo atmosférico), la varianza del camino es mayor que la suma de las varianzas, porque se suman también las covarianzas. La normal calculada con actividades independientes se queda estrecha.',
          'El laboratorio lo simula con un único coeficiente ρ entre las actividades de un mismo camino (una cópula gaussiana de un factor).',
        ] },
        { head: 'La simulación', paras: [
          'Cada caso se compara con una simulación de Montecarlo con semilla: se sortean las duraciones de todas las actividades 10 000 veces y en cada réplica se calcula la duración del proyecto. La misma semilla da siempre el mismo histograma; «Otra simulación» elige otra.',
          'La distancia KS es la mayor diferencia entre la función de distribución de la simulación y la de la normal: cuanto mayor, peor se ajusta la normal.',
        ] },
      ],
    },
  };

  const en = {
    m5: {
      title: 'Three-point estimates: where the formulas come from',
      sections: [
        { head: 'The idea behind PERT', paras: [
          'PERT was born in 1958 to plan the Polaris missile programme (Malcolm, Roseboom, Clark and Fazar, 1959). Each activity gets three estimates: the optimistic a, the most likely m and the pessimistic b (tₒ, tₘ and tₚ in the Spanish notation).',
          'The duration is assumed to follow a beta distribution between a and b, with its mode at m, and its mean and variance are approximated with two simple formulas: mean ≈ (a + 4m + b)/6 and variance ≈ ((b − a)/6)².',
          'The variance comes from assuming that about six standard deviations fit between a and b, as in the normal, where the mean ± 3σ holds almost every value (99.7%).',
        ] },
        { head: 'Two betas for the same formulas', paras: [
          'No beta meets both formulas at once in general. The lab draws and simulates the beta-PERT, with α = 1 + 4(m − a)/(b − a) and β = 1 + 4(b − m)/(b − a): its mean is exactly (a + 4m + b)/6, but its variance is not ((b − a)/6)².',
          'The classic beta of Malcolm and his colleagues sets the mode at m and the standard deviation at (b − a)/6; in exchange, its mean moves slightly away from the formula.',
          'For Klastorin’s activity A (2, 6, 14), the exam formula gives mean 6.67 and variance 4.00. The beta-PERT has the same mean and variance 4.89; the classic beta, variance 4.00 and mean 6.54. They are approximations: what matters is knowing which one each calculation uses.',
        ] },
        { head: 'The triangular', paras: [
          'With the same a, m and b, the triangular has mean (a + m + b)/3 and variance (a² + b² + m² − ab − am − bm)/18. It gives more weight to the extremes: if a, m and b are skewed, its mean moves further from m than the PERT one (for Klastorin’s A, 7.33 against 6.67).',
        ] },
        { head: 'Assumptions', paras: [
          'Independence: the duration of one activity says nothing about another. That is why, along a path, the means and the variances add up.',
          'Extremes: a and b are values that are almost never exceeded. If they are estimated as percentiles, for example the 5th and the 95th, the divisor 6 has to change: in a normal, about 3.29 standard deviations lie between those two percentiles.',
          'The project: the critical path is computed with the means as if durations were fixed. Section M6 shows when that simplification misleads.',
        ] },
      ],
    },
    m6: {
      title: 'The CLT and its pitfalls',
      sections: [
        { head: 'Why a normal', paras: [
          'The central limit theorem (CLT) says that the sum of many independent durations, none of them dominant, looks like a normal whose mean is the sum of the means and whose variance is the sum of the variances.',
          'That is why the exam calculation takes the project duration as the normal N(μ, σ²) of the critical path of the means, computes z = (deadline − μ)/σ and looks the probability up in the normal table.',
        ] },
        { head: 'The three approximations', paras: [
          'Hillier and Lieberman (ch. 22) sum the method up in three approximations: the critical path of the means is the longest path of the project; the durations of its activities are independent; and the project duration follows a normal. Each case in M6 puts one of them to the test.',
        ] },
        { head: 'Merging paths', paras: [
          'If several near-critical paths reach the end, the project finishes when the last one does: its duration is the maximum of several paths, longer than any of them. The normal of a single path overestimates the probability of meeting the deadline (MacCrimmon and Ryavec, 1964).',
          'With independent normal paths, the exact probability is the product of the probabilities of each path; that is the “exact count” shown in the merge case and in the two-routes example.',
          'Schoenberger (1981) showed with a simulation done by hand why projects are “always” late: with several parallel paths, the expected project duration exceeds that of the critical path, and the more so the more variance they have.',
        ] },
        { head: 'Few activities and skewness', paras: [
          'The CLT needs many terms. With few skewed activities, the sum keeps the skewness and its long tail falls outside the normal. As more activities are added, the shape looks more and more like the normal.',
        ] },
        { head: 'Correlation', paras: [
          'If durations move together (the same team, the same weather), the variance of the path is larger than the sum of the variances, because the covariances add up too. The normal computed with independent activities is too narrow.',
          'The lab simulates it with a single coefficient ρ between the activities of a path (a one-factor Gaussian copula).',
        ] },
        { head: 'The simulation', paras: [
          'Each case is compared with a seeded Monte Carlo simulation: the durations of every activity are drawn 10,000 times and each run computes the project duration. The same seed always gives the same histogram; “Simulate again” picks another one.',
          'The KS distance is the largest gap between the distribution function of the simulation and that of the normal: the larger it is, the worse the normal fits.',
        ] },
      ],
    },
  };

  // Referencias, con la puntuación de cada idioma.
  const refs = {
    es: [
      'Malcolm, D. G., Roseboom, J. H., Clark, C. E. y Fazar, W. (1959). Application of a technique for research and development program evaluation. Operations Research, 7(5), 646–669.',
      'Klastorin, T. (2010). Gestión de proyectos. Profit Editorial.',
      'Hillier, F. S. y Lieberman, G. J. (2015). Introduction to Operations Research (10.ª ed.), cap. 22. McGraw-Hill.',
      'MacCrimmon, K. R. y Ryavec, C. A. (1964). An analytical study of the PERT assumptions. Operations Research, 12(1), 16–37.',
      'Schoenberger, D. W. (1981). Why projects are “always” late: A rationale based on manual simulation of a PERT/CPM network. Interfaces, 11(5), 66–70.',
      'Vose, D. (2008). Risk analysis: A quantitative guide (3.ª ed.). Wiley.',
    ],
    en: [
      'Malcolm, D. G., Roseboom, J. H., Clark, C. E. and Fazar, W. (1959). Application of a technique for research and development program evaluation. Operations Research, 7(5), 646–669.',
      'Klastorin, T. (2010). Gestión de proyectos [Project management]. Profit Editorial.',
      'Hillier, F. S. and Lieberman, G. J. (2015). Introduction to Operations Research (10th ed.), ch. 22. McGraw-Hill.',
      'MacCrimmon, K. R. and Ryavec, C. A. (1964). An analytical study of the PERT assumptions. Operations Research, 12(1), 16–37.',
      'Schoenberger, D. W. (1981). Why projects are “always” late: A rationale based on manual simulation of a PERT/CPM network. Interfaces, 11(5), 66–70.',
      'Vose, D. (2008). Risk analysis: A quantitative guide (3rd ed.). Wiley.',
    ],
  };

  const api = { es, en, refs };
  root.PNL = root.PNL || {};
  root.PNL.learnUnc = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
