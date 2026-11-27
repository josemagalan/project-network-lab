/*
 * learn-rs — «Aprende más» de la vista de recursos (spec f5c-recursos, apartado «Aprende más»; plan T013, bloque 4): nivelar o
 * programar con recursos limitados; el perfil, el pico y la suma de cuadrados; la heurística de Burgess; por qué el problema
 * es difícil y cómo busca la vista el óptimo; los esquemas serie y paralelo (también hacia atrás) y las reglas de prioridad;
 * la figura 7.23 de Nicholas; la cota de Baker; la cadena crítica y sus colchones; partir actividades y la multitarea; varios
 * recursos; y lo que queda fuera. Va en su propio grupo bajo demanda (rl): se carga al abrir el diálogo, no con la vista
 * (principio 27). Las cifras son las del núcleo (tests/learn-rs.test.js lo comprueba).
 */
(function (root) {
  'use strict';

  const es = {
    title: 'Recursos',
    sections: [
      { head: 'Nivelar o programar con recursos limitados', paras: [
        'Nicholas (§6.6) distingue dos casos. Si la duración está fijada, hay gente suficiente, pero lo que se necesita sube y baja: nivelar es mover las actividades con holgura, sin alargar el proyecto, para que el perfil del recurso sea lo más llano posible. Si los recursos están limitados, lo disponible es un tope que no se puede pasar: hay que retrasar actividades más allá de su holgura, y el proyecto se alarga lo menos posible.',
        'Al nivelar importa cuánto sube y baja el perfil; con recursos limitados, solo que no pase del tope. Por eso la vista tiene dos modos: «Nivelar» mueve las actividades entre su comienzo temprano y el tardío, y «Recursos limitados» no pasa de lo disponible y deja que el proyecto dure lo que haga falta. Klastorin (cap. 8) plantea los mismos dos problemas.',
      ] },
      { head: 'El perfil, el pico y la suma de cuadrados', paras: [
        'El perfil de un recurso suma, en cada periodo, lo que usan las actividades que están en marcha. El trabajo, la suma de todo el perfil, no depende del calendario: en Klastorin 8.1 son 147 trabajadores-semana empiece cuando empiece cada actividad. Lo que cambia es cómo se reparten.',
        'Hay dos formas de medir lo llano que es un perfil. El pico es lo que pide el periodo más cargado: lo que habría que contratar. La suma de los cuadrados de cada periodo crece mucho con los picos: con el mismo trabajo, es menor cuanto más llano es el perfil, y sería la menor posible si todos los periodos pidieran lo mismo (en Klastorin 8.1, 147² / 13 ≈ 1662).',
        'Las dos medidas no dicen lo mismo. En Klastorin 8.1, el calendario temprano tiene un pico de 21 y una suma de cuadrados de 1877; el tardío baja el pico a 16 (con 1839), y Burgess también lo deja en 16, pero con 1735. El «Mínimo del pico» de la vista busca el menor pico posible sin alargar el proyecto; Burgess busca la menor suma de cuadrados.',
      ] },
      { head: 'La heurística de Burgess', paras: [
        'Burgess y Killebrew (1962) proponen mover las actividades de una en una para bajar la suma de cuadrados. Se toman de la última a la primera, de mayor a menor comienzo temprano. Cada una va al comienzo que da la menor suma de cuadrados dentro del hueco que le dejan sus predecesoras y sus sucesoras sin alargar el proyecto; con empate, al más tardío, para dejar sitio a las de antes. Después se repite, hasta una pasada en la que no se mueve ninguna.',
        'Es una heurística: cada movimiento baja la suma o la deja igual, pero no garantiza el mínimo, porque a veces habría que mover dos actividades a la vez. En Klastorin 8.1 acaba en dos pasadas con un pico de 16, el mínimo. En LOGON, nivelando los trabajadores, baja el pico de 23 a 15, que también es el mínimo sin pasar de las 47 semanas.',
      ] },
      { head: 'Por qué es difícil', paras: [
        'Con recursos limitados hay que decidir en qué orden pasan las actividades que compiten por un recurso. Nicholas (§7.5) lo cuenta así: con 10 actividades listas para empezar hay 10! órdenes posibles, más de 3,6 millones. Programar con recursos limitados en la menor duración es un problema NP-difícil (Blazewicz, Lenstra y Rinnooy Kan, 1983): no se conoce ningún método que lo resuelva siempre en un tiempo razonable cuando el proyecto crece. El mínimo del pico es el mismo problema visto al revés: ¿cabe el proyecto en su duración sin pasar de un pico dado?',
        'Por eso los libros y los programas usan reglas de prioridad, que dan deprisa un buen calendario, aunque no siempre el mejor. La vista calcula además el óptimo y el mínimo del pico con una búsqueda exacta: prueba calendarios, descarta en cuanto uno no puede salir bien y se para después de mirar 300 000. Si se para antes de acabar, da el mejor calendario encontrado, dice «no demostrado» y da la cota de la que no se puede bajar.',
      ] },
      { head: 'Los esquemas serie y paralelo', paras: [
        'Una regla de prioridad ordena las actividades; un esquema dice cómo se usa ese orden (Klastorin los llama «basados en tareas» y «basados en el tiempo»). El esquema serie, que ya describe Kelley (1963), coloca una actividad cada vez: de las elegibles, las que tienen colocadas todas sus predecesoras, la que la regla pone primero, en el primer momento en que han acabado sus predecesoras y cabe con lo ya colocado, aunque sea antes que otras ya colocadas.',
        'El esquema paralelo avanza en el tiempo: en cada instante en que acaba alguna actividad, toma las elegibles, las que tienen acabadas todas sus predecesoras, por orden de la regla, y empieza todas las que caben; las demás esperan al instante siguiente. Nunca vuelve atrás.',
        'Kolisch (1996) demostró que el esquema serie da siempre un calendario activo (ninguna actividad puede empezar antes sin retrasar otra), y que entre los activos siempre hay uno óptimo; el paralelo da calendarios sin retraso (ninguna actividad espera si cabía), y puede que ninguno de ellos sea óptimo. Aun así, ninguno de los dos es siempre mejor con una regla dada: en Klastorin 8.5, con la regla de menor holgura, el serie da 17 semanas y el paralelo, 14; en la figura 7.23 de Nicholas, el serie llega a 10 y el paralelo se queda en 11.',
        'Hacia atrás, el mismo esquema se aplica a la red al revés (cada sucesora pasa a ser predecesora), desde el final: es programar «lo más tarde posible». Al acabar, se da la vuelta al calendario.',
      ] },
      { head: 'Las reglas de prioridad', paras: [
        'La vista tiene las siete reglas de los dos libros: menor holgura total (las críticas primero), menor fin tardío, menor duración, más recursos (la mayor suma de usos), camino más largo hasta el final (ACTIM: lo que hay desde su comienzo tardío hasta el final), menor comienzo temprano («lo antes posible») y menor comienzo tardío. Los empates se deshacen con el orden de la tabla; en la de menor holgura, antes con el comienzo tardío, y en la de menor fin tardío, con la holgura.',
        'Ninguna regla garantiza el mínimo, y la mejor cambia de un proyecto a otro: por eso la vista las compara todas con la cota de Baker y con el óptimo. Con 14 trabajadores en LOGON, las reglas en serie van de 49 semanas (menor fin tardío, ACTIM y menor comienzo tardío) a 62 (menor duración); el óptimo es 49, y el calendario que Nicholas hace por tanteo dura 50. Davis y Patterson (1975) compararon ocho reglas con el óptimo en 83 proyectos, y la de menor holgura fue la que más se acercó.',
        'Nicholas añade un criterio práctico: «lo más tarde posible» deja todas las actividades en su fecha tardía, así que cualquier retraso alarga el proyecto, mientras que la de menor holgura reduce ese riesgo.',
      ] },
      { head: 'La figura 7.23 de Nicholas', paras: [
        'Nicholas no dice cómo construye sus cinco calendarios con 10 trabajadores, pero son los del esquema paralelo. Hacia delante, «lo antes posible», «más recursos», «menor duración» y «menor holgura» dan los calendarios de las figuras (a), (c), (d) y (e), de 11 semanas; «lo más tarde posible» (b) es el paralelo hacia atrás, de 10 semanas.',
        'Con el esquema serie hacia delante, las reglas de menor holgura, menor fin tardío, ACTIM y menor comienzo tardío también llegan a 10 semanas, que es el óptimo. Sin límite, el proyecto dura 9, y la cota de Baker también es 9: el trabajo, 90 trabajadores-semana, cabría justo con 10 trabajadores, pero las precedencias no dejan aprovecharlos todos en todas las semanas.',
      ] },
      { head: 'La cota de Baker', paras: [
        'Antes de programar se puede saber de qué duración no se puede bajar (Klastorin, figuras 8.6 y 8.7, con la cota de Baker). El trabajo del recurso dividido por lo disponible por periodo ya da una duración mínima. Pero no todo el tiempo se puede aprovechar: al principio sobra recurso, aunque todo empiece lo antes posible, porque pocas actividades pueden estar en marcha; al final también, aunque todo se retrase lo más posible, mientras acaban las últimas.',
        'La cota suma ese desperdicio: duración ≥ ⌈(trabajo + desperdicio al principio + desperdicio al final) / disponibles⌉. En Klastorin 8.5, con 9 trabajadores, ⌈(101 + 3 + 8) / 9⌉ = 13 semanas; el óptimo es 14, así que la cota no siempre se alcanza. Al revés, dice cuántos hacen falta para no alargar el proyecto: con sus 12 semanas, al menos 10 trabajadores.',
        'Con el inspector de LOGON, que solo puede estar en una actividad a la vez, la cota es la cuenta de Nicholas: 35 semanas de inspecciones más las 14 de las actividades que van detrás de la última, 49. El óptimo también es 49.',
      ] },
      { head: 'La cadena crítica y sus colchones', paras: [
        'Con recursos limitados, una actividad puede esperar no por una predecesora, sino porque el recurso que necesita lo está usando otra. Entonces el camino crítico del CPM ya no explica la duración. Goldratt (1997) llama cadena crítica a la sucesión de actividades que se esperan unas a otras, por precedencia o por compartir un recurso, y que fija la duración (Nicholas, §6.6 y §7.4).',
        'En LOGON, el camino crítico H–J–M–R–V–X–Y–Z dura 47 semanas. Si un inspector tiene que estar en H, J, P, K, L, V y X, de una en una, el proyecto dura 49: la cadena pasa por las actividades del inspector. La vista marca en naranja las cadenas del calendario que se ve (puede haber varias) y, en la ROY, a trazos, las esperas por un recurso.',
        'Goldratt propone además proteger la cadena con colchones (Nicholas, §7.4). Como cada estimación lleva su margen por si acaso, se recortan, y lo recortado de la cadena se junta al final en un colchón del proyecto; donde un camino no crítico se une a la cadena se pone un colchón de alimentación. Como es muy difícil que todas las actividades se retrasen a la vez, el colchón común puede ser menor que la suma de los márgenes. En el ejemplo de Nicholas (tabla 7.4), con un camino crítico de 32 días y las estimaciones a la mitad, el colchón del proyecto sería de 16 días, y Nicholas lo reduce a 8. La vista no calcula colchones.',
      ] },
      { head: 'Partir actividades y la multitarea', paras: [
        'Si una actividad pudiera interrumpirse y seguir después, el perfil se nivelaría mejor. La vista no lo permite: una actividad empezada sigue hasta el final. Nicholas (§6.6, figura 6.25) explica por qué es lo habitual: cada vez que se retoma un trabajo hay que volver a coger el ritmo, así que las partes suman más que la actividad entera. Esa multitarea alarga las actividades, y Goldratt la señala como una causa de retrasos.',
        'No hay que confundirla con las entregas parciales sin interrupción: el diseño puede pasar a construcción por partes mientras sigue, sin que ninguno de los dos se pare (Nicholas, figura 6.26). En la red, eso se escribe con desfases (la extensión «Desfases»).',
      ] },
      { head: 'Varios recursos', paras: [
        'Nivelar un recurso es fácil; nivelar varios a la vez, no: un calendario llano para uno puede desnivelar otro. En LOGON, nivelando el equipo con Burgess, los trabajadores quedan con un pico de 19, y no de 15 como si se nivelaran ellos; con el mínimo del pico de trabajadores, el equipo queda con un pico de 16. Nicholas (§6.6) recomienda nivelar el recurso al que más le cuesta subir y bajar, casi siempre las personas. La vista nivela uno, el que se elija, y enseña cómo cambian los demás.',
        'Con recursos limitados no hay que elegir: la vista respeta a la vez lo disponible de todos (hasta tres), como en GUMBY, que cabe en sus 26 semanas con 8 analistas y 5 programadores.',
      ] },
      { head: 'Lo que queda fuera', paras: [
        'La vista no trata varios proyectos que comparten recursos (Nicholas, §7.5 y §7.6), ni recursos que se gastan y no se renuevan, como un presupuesto total, ni disponibilidades que cambian con el tiempo, ni duraciones que dependen de cuánta gente se ponga, ni sustituir unos recursos por otros. Demeulemeester y Herroelen (2002) recogen estos problemas y los métodos exactos y heurísticos con que se resuelven.',
      ] },
    ],
  };

  const en = {
    title: 'Resources',
    sections: [
      { head: 'Levelling or scheduling with limited resources', paras: [
        'Nicholas (§6.6) tells two cases apart. If the duration is fixed, there are enough people, but what is needed rises and falls: levelling means moving the activities that have slack, without lengthening the project, so that the resource profile is as flat as possible. If resources are limited, what is available is a ceiling that cannot be exceeded: activities have to be delayed beyond their slack, and the project is lengthened as little as possible.',
        'When levelling, what matters is how much the profile rises and falls; with limited resources, only that it stays under the ceiling. That is why the view has two modes: “Level” moves the activities between their early and late starts, and “Limited resources” never exceeds what is available and lets the project last as long as needed. Klastorin (ch. 8) sets out the same two problems.',
      ] },
      { head: 'The profile, the peak and the sum of squares', paras: [
        'The profile of a resource adds up, in each period, what the activities under way use. The work, the sum of the whole profile, does not depend on the schedule: in Klastorin 8.1 it is 147 worker-weeks whenever each activity starts. What changes is how it is spread.',
        'There are two ways of measuring how flat a profile is. The peak is what the busiest period needs: what would have to be hired. The sum of the squares of each period grows fast with the peaks: with the same work, the flatter the profile, the smaller it is, and it would be the smallest possible if every period needed the same (in Klastorin 8.1, 147² / 13 ≈ 1662).',
        'The two measures do not say the same thing. In Klastorin 8.1, the early schedule has a peak of 21 and a sum of squares of 1877; the late one lowers the peak to 16 (with 1839), and Burgess also leaves it at 16, but with 1735. The view’s “Minimum peak” looks for the lowest possible peak without lengthening the project; Burgess looks for the least sum of squares.',
      ] },
      { head: 'Burgess’s heuristic', paras: [
        'Burgess and Killebrew (1962) propose moving the activities one at a time to lower the sum of squares. They are taken from the last to the first, from the latest to the earliest early start. Each one goes to the start with the least sum of squares within the gap its predecessors and successors leave without lengthening the project; with a tie, to the latest, to leave room for the earlier ones. Then it is repeated, until a pass in which none moves.',
        'It is a heuristic: each move lowers the sum or leaves it equal, but it does not guarantee the minimum, because sometimes two activities would have to move at once. In Klastorin 8.1 it ends after two passes with a peak of 16, the minimum. In LOGON, levelling the workers, it lowers the peak from 23 to 15, which is also the minimum without going beyond the 47 weeks.',
      ] },
      { head: 'Why it is hard', paras: [
        'With limited resources, the order in which the activities competing for a resource go has to be decided. Nicholas (§7.5) puts it this way: with 10 activities ready to start there are 10! possible orders, more than 3.6 million. Scheduling with limited resources in the shortest duration is an NP-hard problem (Blazewicz, Lenstra and Rinnooy Kan, 1983): no method is known that always solves it in a reasonable time as the project grows. The minimum peak is the same problem seen the other way round: does the project fit in its duration without exceeding a given peak?',
        'That is why books and software use priority rules, which quickly give a good schedule, though not always the best one. The view also computes the optimum and the minimum peak with an exact search: it tries schedules, drops one as soon as it cannot work out, and stops after looking at 300,000. If it stops before finishing, it gives the best schedule found, says “not proved” and gives the bound below which it cannot go.',
      ] },
      { head: 'The serial and parallel schemes', paras: [
        'A priority rule orders the activities; a scheme says how that order is used (Klastorin calls them “task-based” and “time-based”). The serial scheme, already described by Kelley (1963), places one activity at a time: of the eligible ones, those with all their predecessors placed, the one the rule puts first, at the first moment when its predecessors have finished and it fits with what is already placed, even if that is before others already placed.',
        'The parallel scheme moves forward in time: at each moment when some activity finishes, it takes the eligible ones, those with all their predecessors finished, in the rule’s order, and starts every one that fits; the others wait for the next moment. It never goes back.',
        'Kolisch (1996) proved that the serial scheme always gives an active schedule (no activity can start earlier without delaying another), and that among the active ones there is always an optimal one; the parallel scheme gives non-delay schedules (no activity waits if it fitted), and it may be that none of them is optimal. Even so, neither is always better with a given rule: in Klastorin 8.5, with the least slack rule, the serial scheme gives 17 weeks and the parallel one, 14; in Nicholas’s Figure 7.23, the serial scheme reaches 10 and the parallel one stays at 11.',
        'Backward, the same scheme is applied to the reversed network (every successor becomes a predecessor), from the end: it is scheduling “as late as possible”. At the end, the schedule is turned round.',
      ] },
      { head: 'The priority rules', paras: [
        'The view has the seven rules of the two books: least total slack (critical activities first), earliest late finish, shortest duration, most resources (the largest sum of uses), longest path to the end (ACTIM: what there is from its late start to the end), earliest early start (“as soon as possible”) and earliest late start. Ties are broken with the order of the table; in least slack, first with the late start, and in earliest late finish, with the slack.',
        'No rule guarantees the minimum, and the best one changes from one project to another: that is why the view compares them all with Baker’s bound and with the optimum. With 14 workers in LOGON, the serial rules go from 49 weeks (earliest late finish, ACTIM and earliest late start) to 62 (shortest duration); the optimum is 49, and the schedule Nicholas makes by trial and error lasts 50. Davis and Patterson (1975) compared eight rules with the optimum in 83 projects, and least slack came closest.',
        'Nicholas adds a practical point: “as late as possible” leaves every activity at its late date, so any delay lengthens the project, whereas least slack reduces that risk.',
      ] },
      { head: 'Nicholas’s Figure 7.23', paras: [
        'Nicholas does not say how he builds his five schedules with 10 workers, but they are those of the parallel scheme. Forward, “as soon as possible”, “most resources”, “shortest task time” and “least slack” give the schedules of figures (a), (c), (d) and (e), of 11 weeks; “as late as possible” (b) is the parallel scheme backward, of 10 weeks.',
        'With the serial scheme forward, the least slack, earliest late finish, ACTIM and earliest late start rules also reach 10 weeks, which is the optimum. With no limit the project lasts 9, and Baker’s bound is also 9: the work, 90 worker-weeks, would just fit with 10 workers, but the precedences do not allow using them all in every week.',
      ] },
      { head: 'Baker’s bound', paras: [
        'Before scheduling, it is possible to know which duration cannot be beaten (Klastorin, Figs. 8.6 and 8.7, with Baker’s bound). The work of the resource divided by what is available per period already gives a minimum duration. But not all the time can be used: at the start some resource is left over, even if everything starts as early as possible, because few activities can be under way; at the end too, even if everything is delayed as much as possible, while the last ones finish.',
        'The bound adds up that waste: duration ≥ ⌈(work + waste at the start + waste at the end) / available⌉. In Klastorin 8.5, with 9 workers, ⌈(101 + 3 + 8) / 9⌉ = 13 weeks; the optimum is 14, so the bound is not always reached. The other way round, it says how many are needed so as not to lengthen the project: in its 12 weeks, at least 10 workers.',
        'With LOGON’s inspector, who can only be on one activity at a time, the bound is Nicholas’s own reckoning: 35 weeks of inspections plus the 14 of the activities that follow the last one, 49. The optimum is also 49.',
      ] },
      { head: 'The critical chain and its buffers', paras: [
        'With limited resources, an activity may wait not for a predecessor but because the resource it needs is being used by another. Then the CPM critical path no longer explains the duration. Goldratt (1997) calls critical chain the sequence of activities that wait for one another, because of precedence or because they share a resource, and that sets the duration (Nicholas, §6.6 and §7.4).',
        'In LOGON, the critical path H–J–M–R–V–X–Y–Z lasts 47 weeks. If an inspector has to be on H, J, P, K, L, V and X, one at a time, the project lasts 49: the chain goes through the inspector’s activities. The view marks in orange the chains of the schedule shown (there may be several) and, in the AON network, dashed, the waits for a resource.',
        'Goldratt also proposes protecting the chain with buffers (Nicholas, §7.4). Since each estimate carries its own margin just in case, the estimates are cut, and what is cut from the chain is gathered at the end in a project buffer; where a non-critical path joins the chain, a feeding buffer is placed. Since it is very unlikely that all activities are late at once, the common buffer can be smaller than the sum of the margins. In Nicholas’s example (Table 7.4), with a critical path of 32 days and the estimates halved, the project buffer would be 16 days, and Nicholas reduces it to 8. The view does not compute buffers.',
      ] },
      { head: 'Splitting activities and multitasking', paras: [
        'If an activity could be interrupted and resumed later, the profile would level better. The view does not allow it: an activity that has started goes on to the end. Nicholas (§6.6, Fig. 6.25) explains why that is usual: each time a job is resumed, the pace has to be picked up again, so the pieces add up to more than the whole activity. That multitasking lengthens the activities, and Goldratt points to it as a cause of delays.',
        'It should not be confused with partial hand-overs without interruption: design can pass to construction in parts while it goes on, without either of them stopping (Nicholas, Fig. 6.26). In the network, that is written with lags (the “Lags” extension).',
      ] },
      { head: 'Several resources', paras: [
        'Levelling one resource is easy; levelling several at once is not: a flat schedule for one can unlevel another. In LOGON, levelling the equipment with Burgess leaves the workers with a peak of 19, not 15 as when they are levelled; with the minimum peak of workers, the equipment is left with a peak of 16. Nicholas (§6.6) recommends levelling the resource for which rising and falling is costliest, nearly always people. The view levels one, the one chosen, and shows how the others change.',
        'With limited resources there is no need to choose: the view respects what is available of all of them at once (up to three), as in GUMBY, which fits in its 26 weeks with 8 analysts and 5 programmers.',
      ] },
      { head: 'What is left out', paras: [
        'The view does not deal with several projects that share resources (Nicholas, §7.5 and §7.6), nor with resources that are used up and not renewed, such as a total budget, nor with availabilities that change over time, nor with durations that depend on how many people are assigned, nor with substituting one resource for another. Demeulemeester and Herroelen (2002) cover these problems and the exact and heuristic methods used to solve them.',
      ] },
    ],
  };

  const refs = {
    es: [
      'Klastorin, T. (2010). Gestión de proyectos. Profit Editorial (cap. 8).',
      'Nicholas, J. M. y Steyn, H. (2012). Project Management for Engineering, Business and Technology (4.ª ed.), cap. 6, §6.6, y cap. 7, §7.4 y §7.5. Routledge.',
      'Burgess, A. R. y Killebrew, J. B. (1962). Variation in activity level on a cyclical arrow diagram. Journal of Industrial Engineering, 13(2), 76–83.',
      'Kelley, J. E. (1963). The critical-path method: Resources planning and scheduling. En J. F. Muth y G. L. Thompson (eds.), Industrial Scheduling (pp. 347–365). Prentice-Hall.',
      'Baker, K. R. (1974). Introduction to Sequencing and Scheduling. Wiley.',
      'Davis, E. W. y Patterson, J. H. (1975). A comparison of heuristic and optimum solutions in resource-constrained project scheduling. Management Science, 21(8), 944–955.',
      'Blazewicz, J., Lenstra, J. K. y Rinnooy Kan, A. H. G. (1983). Scheduling subject to resource constraints: Classification and complexity. Discrete Applied Mathematics, 5(1), 11–24.',
      'Kolisch, R. (1996). Serial and parallel resource-constrained project scheduling methods revisited: Theory and computation. European Journal of Operational Research, 90(2), 320–333.',
      'Goldratt, E. M. (1997). Critical Chain. North River Press.',
      'Demeulemeester, E. L. y Herroelen, W. S. (2002). Project Scheduling: A Research Handbook. Kluwer.',
    ],
    en: [
      'Klastorin, T. (2010). Gestión de proyectos [Project management]. Profit Editorial (ch. 8).',
      'Nicholas, J. M. and Steyn, H. (2012). Project Management for Engineering, Business and Technology (4th ed.), ch. 6, §6.6, and ch. 7, §7.4 and §7.5. Routledge.',
      'Burgess, A. R. and Killebrew, J. B. (1962). Variation in activity level on a cyclical arrow diagram. Journal of Industrial Engineering, 13(2), 76–83.',
      'Kelley, J. E. (1963). The critical-path method: Resources planning and scheduling. In J. F. Muth and G. L. Thompson (eds.), Industrial Scheduling (pp. 347–365). Prentice-Hall.',
      'Baker, K. R. (1974). Introduction to Sequencing and Scheduling. Wiley.',
      'Davis, E. W. and Patterson, J. H. (1975). A comparison of heuristic and optimum solutions in resource-constrained project scheduling. Management Science, 21(8), 944–955.',
      'Blazewicz, J., Lenstra, J. K. and Rinnooy Kan, A. H. G. (1983). Scheduling subject to resource constraints: Classification and complexity. Discrete Applied Mathematics, 5(1), 11–24.',
      'Kolisch, R. (1996). Serial and parallel resource-constrained project scheduling methods revisited: Theory and computation. European Journal of Operational Research, 90(2), 320–333.',
      'Goldratt, E. M. (1997). Critical Chain. North River Press.',
      'Demeulemeester, E. L. and Herroelen, W. S. (2002). Project Scheduling: A Research Handbook. Kluwer.',
    ],
  };

  const api = { es, en, refs };
  root.PNL = root.PNL || {};
  root.PNL.learnRs = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
