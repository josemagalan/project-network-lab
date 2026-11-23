/*
 * learn-gpr — «Aprende más» de la pestaña «Precedencias generalizadas» (spec f5a-precedencias-generalizadas, AC4 y el
 * apartado «Aprende más»; plan T014, bloque 4): las cuatro relaciones y su escritura, las fechas, ROY frente a PERT, las seis
 * clases de Valls y Lino, ROSEBUD contado como decidió el autor (sin decir que el libro se equivoca) y por qué solo hay
 * holgura total y libre. Va en su propio grupo bajo demanda (gl): se carga al abrir el diálogo, no con la pestaña
 * (principio 27). Los nombres de las clases son los de i18n-gpr (tests/learn-gpr.test.js lo comprueba).
 */
(function (root) {
  'use strict';

  const es = {
    title: 'Precedencias generalizadas',
    sections: [
      { head: 'Las cuatro relaciones', paras: [
        'Entre dos actividades hay cuatro relaciones: fin–comienzo (FC; en inglés, FS), comienzo–comienzo (CC; SS), fin–fin (FF) y comienzo–fin (CF; SF). La primera letra dice de dónde sale la relación en la predecesora y la segunda, dónde actúa en la sucesora: con FF, la sucesora no puede acabar antes de que acabe la predecesora.',
        'En la tabla, cada fila lleva sus predecesoras: «B CC+2» en la fila de C quiere decir que C empieza al menos 2 después de que empiece B. Un desfase negativo es un adelanto: con «B FC-1», C puede empezar 1 antes de que acabe B. Sin tipo, la relación es FC sin desfase, la de siempre.',
        'Son desfases mínimos: la relación dice «al menos». Con FC+3 hay una espera entre las dos actividades (el secado de una pintura, por ejemplo); CC y FF dejan que dos actividades se solapen, como una tubería que se tiende mientras se abre la zanja.',
      ] },
      { head: 'Las fechas', paras: [
        'La pasada hacia delante es la de siempre con más términos: el comienzo temprano de una actividad es el mayor de 0 y de lo que exige cada relación que le llega. Con FF y CF la relación limita el fin, así que se resta la duración. Hacia atrás, igual, con el menor.',
        'Hay dos sorpresas. Una relación puede dar un comienzo antes de 0, y entonces manda el inicio del proyecto. Y el proyecto no tiene por qué acabar en una actividad final: con CC o CF una sucesora puede acabar antes que su predecesora, así que la duración es el mayor fin temprano de todas.',
      ] },
      { head: 'ROY frente a PERT', paras: [
        'En la red ROY una relación generalizada es solo una etiqueta en la flecha («CC+2»): los nodos no cambian. El método de Roy (o de los potenciales) las admite desde el principio, y por eso el Tema 6b las estudia en ROY.',
        'En la red PERT las actividades son arcos entre sucesos, y un suceso solo puede ser el comienzo o el fin de una actividad. Para que otra actividad se enganche a mitad de una, hay que partirla en trozos (Y₁, Y₂…) por donde se engancha; un desfase que no cabe en la actividad se dibuja como una espera, y un fin que solo marca una relación FF o CF, como un trozo de duración 0.',
        'La PERT equivalente deja que los trozos de una actividad se separen en el tiempo: es como si la actividad se pudiera interrumpir. Por eso dura lo mismo que la ROY o menos (en el ejemplo de la crítica al revés, 10 frente a 14). Un adelanto que no cabe en ninguna de las dos actividades necesitaría un arco de duración negativa, y la PERT lo deja fuera.',
      ] },
      { head: 'Las seis clases de actividad crítica', paras: [
        'Con FC sin desfase, alargar una actividad crítica alarga el proyecto y acortarla lo acorta. Con relaciones generalizadas eso deja de ser verdad (Wiest, 1981). Valls y Lino (2001) clasifican cada actividad crítica que no se interrumpe por el efecto de alargarla un poco y de acortarla un poco. La pestaña lo calcula así, y el «¿Y si…?» deja probar cambios más grandes.',
        'normal: alargarla alarga el proyecto y acortarla lo acorta. El camino crítico le llega por el comienzo y sale por el fin, así que su duración está en el camino.',
        'al revés: alargarla acorta el proyecto y acortarla lo alarga. El camino crítico le llega por el fin (con una FF, por ejemplo) y sale por el comienzo (con una CC): si dura más, empieza antes, y su sucesora también.',
        'neutra: ni lo uno ni lo otro. El camino crítico le llega y sale por el mismo extremo (comienzo y comienzo, o fin y fin), y su duración no está en él.',
        'bicrítica: alargarla y acortarla alargan el proyecto, porque pasan por ella un camino crítico normal y otro al revés. normal creciente: alargarla alarga el proyecto y acortarla no lo cambia (un camino normal y uno neutro). al revés decreciente: alargarla no lo cambia y acortarla lo alarga (un camino al revés y uno neutro).',
        'En los ejemplos de la pestaña, la normal está en todos; la neutra, en ROSEBUD (Y y W), en la demora CC del Tema 6b (A) y en la figura 6.16 (B); la al revés, en su ejemplo (B); y la bicrítica, la normal creciente y la al revés decreciente, en el de las seis clases (C, D y B).',
      ] },
      { head: 'ROSEBUD y la actividad Y', paras: [
        'En el ejemplo 6.1 de Nicholas y Steyn, ROSEBUD dura 24 con las relaciones generalizadas, y no 26 como con FC. Y es crítica, y el libro comenta que acortarla alargaría el proyecto.',
        'Con actividades que no se interrumpen, como en esta pestaña, Y es neutra: el camino crítico le llega por el fin (la FF+6 de V) y sale por el fin (la FF con W). Con Y de 6, 7, 9 o 10, la duración sigue en 24: pruébalo con el «¿Y si…?».',
        'El resultado depende de si las actividades se pueden interrumpir. La figura 6.21 del libro las parte en trozos, y con actividades partidas las cuentas son otras; la PERT equivalente de esta pestaña también las parte.',
      ] },
      { head: 'Por qué solo dos holguras', paras: [
        'La holgura total (lo que una actividad puede retrasarse sin retrasar el proyecto) y la libre (lo que puede retrasarse sin mover el comienzo temprano de ninguna sucesora ni el fin del proyecto) se generalizan sin problema: la libre es el menor margen que deja cada relación que sale de la actividad.',
        'La holgura independiente y la de seguridad no tienen una definición asentada con estas relaciones, y por eso la pestaña no las calcula.',
      ] },
    ],
  };

  const en = {
    title: 'Generalized precedence relations',
    sections: [
      { head: 'The four relations', paras: [
        'Between two activities there are four relations: finish-to-start (FS), start-to-start (SS), finish-to-finish (FF) and start-to-finish (SF). The first letter says where the relation leaves the predecessor and the second, where it acts on the successor: with FF, the successor cannot finish before the predecessor finishes.',
        'In the table, each row lists its predecessors: “B SS+2” in the row of C means that C starts at least 2 after B starts. A negative lag is a lead: with “B FS-1”, C can start 1 before B finishes. With no type, the relation is FS with no lag, the usual one.',
        'They are minimum lags: the relation says “at least”. With FS+3 there is a wait between the two activities (paint drying, for example); SS and FF let two activities overlap, like a pipe being laid while the trench is dug.',
      ] },
      { head: 'The dates', paras: [
        'The forward pass is the usual one with more terms: the early start of an activity is the largest of 0 and of what each incoming relation requires. With FF and SF the relation limits the finish, so the duration is subtracted. Backwards, the same with the smallest.',
        'There are two surprises. A relation may give a start before 0, and then the project start governs. And the project need not end with a final activity: with SS or SF a successor can finish before its predecessor, so the duration is the largest early finish of all.',
      ] },
      { head: 'AON versus AOA', paras: [
        'In the AON network a generalized relation is just a label on the arrow (“SS+2”): the nodes do not change. Roy’s method (the potentials method) allows them from the start, and that is why Topic 6b studies them in AON.',
        'In the AOA network activities are arrows between events, and an event can only be the start or the finish of an activity. For another activity to hook onto the middle of one, it must be split into pieces (Y₁, Y₂…) where it hooks on; a lag that does not fit in the activity is drawn as a wait, and a finish marked only by an FF or SF relation, as a piece of duration 0.',
        'The equivalent AOA network lets the pieces of an activity drift apart in time: it is as if the activity could be interrupted. That is why it lasts the same as the AON network or less (in the reverse critical example, 10 against 14). A lead that fits in neither activity would need an arrow of negative duration, and the AOA network leaves it out.',
      ] },
      { head: 'The six classes of critical activity', paras: [
        'With FS and no lag, lengthening a critical activity lengthens the project and shortening it shortens the project. With generalized relations that is no longer true (Wiest, 1981). Valls and Lino (2001) classify each non-interruptible critical activity by the effect of lengthening it a little and of shortening it a little. The tab computes it that way, and “What if…?” lets you try larger changes.',
        'normal: lengthening it lengthens the project and shortening it shortens it. The critical path reaches it at its start and leaves at its finish, so its duration is on the path.',
        'reverse: lengthening it shortens the project and shortening it lengthens it. The critical path reaches it at its finish (through an FF, for example) and leaves at its start (through an SS): if it lasts longer, it starts earlier, and so does its successor.',
        'neutral: neither. The critical path reaches it and leaves it at the same end (start and start, or finish and finish), and its duration is not on it.',
        'bicritical: lengthening it and shortening it both lengthen the project, because a normal critical path and a reverse one go through it. increasing normal: lengthening it lengthens the project and shortening it does not change it (a normal path and a neutral one). decreasing reverse: lengthening it does not change the project and shortening it lengthens it (a reverse path and a neutral one).',
        'In the examples of the tab, the normal class appears in all of them; the neutral one, in ROSEBUD (Y and W), in the SS delay of Topic 6b (A) and in figure 6.16 (B); the reverse one, in its example (B); and the bicritical, increasing normal and decreasing reverse ones, in the six classes example (C, D and B).',
      ] },
      { head: 'ROSEBUD and activity Y', paras: [
        'In example 6.1 of Nicholas and Steyn, ROSEBUD lasts 24 with the generalized relations, not 26 as with FS. Y is critical, and the book remarks that shortening it would lengthen the project.',
        'With activities that are not interrupted, as in this tab, Y is neutral: the critical path reaches it at its finish (the FF+6 from V) and leaves at its finish (the FF to W). With Y at 6, 7, 9 or 10, the duration stays at 24: try it with “What if…?”.',
        'The result depends on whether activities can be interrupted. Figure 6.21 of the book splits them into pieces, and with split activities the figures are different; the equivalent AOA network of this tab splits them too.',
      ] },
      { head: 'Why only two floats', paras: [
        'Total float (how long an activity can be delayed without delaying the project) and free float (how long it can be delayed without moving the early start of any successor or the end of the project) generalize without trouble: free float is the smallest margin left by each relation leaving the activity.',
        'Independent float and safety float have no settled definition with these relations, and that is why the tab does not compute them.',
      ] },
    ],
  };

  // Referencias, con la puntuación de cada idioma.
  const refs = {
    es: [
      'Roy, B. (Dir.) (1964). Les problèmes d’ordonnancement : applications et méthodes. Dunod.',
      'Domínguez Machuca, J. A. et al. (1995). Dirección de operaciones: aspectos tácticos y operativos en la producción y los servicios. McGraw-Hill.',
      'Apuntes de la asignatura, Tema 6b: Secuenciación ROY (demoras FC y CC).',
      'Nicholas, J. M. y Steyn, H. (2012). Project Management for Engineering, Business and Technology (4.ª ed.), cap. 6. Routledge.',
      'Wiest, J. D. (1981). Precedence diagramming method: Some unusual characteristics and their implications for project managers. Journal of Operations Management, 1(3), 121–130.',
      'Elmaghraby, S. E. y Kamburowski, J. (1992). The analysis of activity networks under generalized precedence relations (GPRs). Management Science, 38(9), 1245–1263.',
      'Valls, V. y Lino, P. (2001). Criticality analysis in activity-on-node networks with minimal time lags. Annals of Operations Research, 102, 17–37.',
    ],
    en: [
      'Roy, B. (Ed.) (1964). Les problèmes d’ordonnancement : applications et méthodes [Scheduling problems: applications and methods]. Dunod.',
      'Domínguez Machuca, J. A. et al. (1995). Dirección de operaciones: aspectos tácticos y operativos en la producción y los servicios [Operations management]. McGraw-Hill.',
      'Course notes, Topic 6b: ROY sequencing (FS and SS delays).',
      'Nicholas, J. M. and Steyn, H. (2012). Project Management for Engineering, Business and Technology (4th ed.), ch. 6. Routledge.',
      'Wiest, J. D. (1981). Precedence diagramming method: Some unusual characteristics and their implications for project managers. Journal of Operations Management, 1(3), 121–130.',
      'Elmaghraby, S. E. and Kamburowski, J. (1992). The analysis of activity networks under generalized precedence relations (GPRs). Management Science, 38(9), 1245–1263.',
      'Valls, V. and Lino, P. (2001). Criticality analysis in activity-on-node networks with minimal time lags. Annals of Operations Research, 102, 17–37.',
    ],
  };

  const api = { es, en, refs };
  root.PNL = root.PNL || {};
  root.PNL.learnGpr = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
