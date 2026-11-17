/*
 * i18n-det — textos del detective en «Ejercicios» (spec f3d-construir-detectar, AC9–AC11, AC16, AC17 y AC20; plan P5,
 * P6 y P10, bloque 2; tableros 86, 87 y 92). Se carga bajo demanda con el grupo dt y se fusiona con i18n (dict.es.det y
 * dict.en.det). Va aparte de i18n-build para que el detective no cargue los textos de construir, ni al revés (P1).
 * Las explicaciones (exp) usan los datos de core/detective.explain y las etiquetas de la notación ({lab}, {f}).
 */
(function (root) {
  'use strict';

  const isNode = typeof module !== 'undefined' && module.exports;
  const I = isNode ? require('./i18n.js') : root.PNL.i18n;

  const es = {
    net: 'Red', graph: { aon: 'ROY', aoa: 'PERT' }, errors: 'Errores', kind: { net: 'de la red', calc: 'de cálculo', all: 'todos' },
    title: 'Esta red tiene {n} errores. Encuéntralos y di qué les pasa.', titleOne: 'Esta red tiene 1 error. Encuéntralo y di qué le pasa.',
    moved: 'La tabla de la semilla {sd} no admite errores de este grupo: se usa la de la semilla {used}.',
    noTable: 'Con estos parámetros no hay ninguna tabla que admita errores de este grupo. Prueba con otro grupo de errores u otros parámetros.',
    tooMany: 'Como mucho {n} marcas: quita alguna antes de poner otra.',
    svgAon: 'Red ROY con errores', svgAoa: 'Red PERT con errores',
    legendAon: 'Caja: {ES} d {EF} / {LS} {TF} {LF} · ★ = crítica', legendAoa: 'Bajo cada suceso: {TE} | {TL} | holgura · ★ = crítica', noFigures: 'Solo errores de la red: la red va sin cifras.',
    marks: 'Tus marcas', none: 'Aún no has marcado nada.', remove: 'Quitar', removeOf: 'Quitar la marca de {x}',
    help: 'Selecciona un nodo, un arco o una casilla (clic, o Tab e Intro) y elige qué le pasa. Lo que falta no se puede pulsar: marca uno de sus dos extremos.',
    keys: 'Teclado: Tab recorre la red · Intro abre el menú · Supr quita la marca · Esc cierra el menú.',
    menuOf: '{x}: ¿qué le pasa?', close: 'Cerrar', unmark: 'Quitar la marca',
    opt: {
      royMissing: 'Le falta un arco (de entrada o de salida)', royFalse: 'Sobra: crea una precedencia falsa', royInverted: 'Va al revés', royCycle: 'Cierra un ciclo',
      pertFalseDummy: 'Sobra: crea una precedencia falsa', pertMissingDummy: 'Le falta una ficticia (de entrada o de salida)', pertInvertedDummy: 'Va al revés',
      pertParallel: 'Tiene los mismos sucesos que otra actividad', calc: 'Está mal calculado', calcCrit: 'Está mal marcada como crítica (o sin marcar)',
    },
    type: {
      royMissing: 'falta un arco', royFalse: 'arco que sobra', royInverted: 'arco al revés', royCycle: 'arco que cierra un ciclo', pertFalseDummy: 'ficticia que sobra',
      pertMissingDummy: 'falta una ficticia', pertInvertedDummy: 'ficticia al revés', pertParallel: 'mismos sucesos', calc: 'mal calculado', calcCrit: 'crítica mal marcada',
    },
    el: { node: 'Nodo {x}', arc: 'Arco {from} → {to}', event: 'Suceso {n}', dummy: 'Ficticia {name}, del suceso {from} al {to}', act: 'Actividad {x}, del suceso {from} al {to}', crit: 'Marca de crítica de {x}' },
    aria: { crit: 'crítica', notCrit: 'no crítica', marked: 'marcado ({n}): {type}', found: 'encontrado', half: 'a medias', falseAlarm: 'falsa alarma', missed: 'error no encontrado', error: 'error' },
    did: { mark: '{x}: {type}.', unmark: 'Marca quitada: {x}.' },
    check: 'Comprobar', deliver: 'Entregar', see: 'Ver los errores', hide: 'Ocultar los errores',
    exam: {
      note: 'Examen: no hay corrección hasta que entregues.',
      confirm: '¿Entregar ahora? Después tus marcas se bloquean y aparecen la nota y la corrección.', confirmYes: 'Sí, entregar', confirmNo: 'Seguir buscando',
      delivered: 'Entregado: tus marcas están bloqueadas. El enlace guarda la entrega y al recargar se ve esta misma corrección.',
    },
    res: {
      title: '{f} de {n} encontrados', titleOne: '{f} de 1 encontrado', grade: 'Nota', of: 'sobre 100',
      count: '({f} + ½ × {h} − ½ × {a}) / {n} = {pct} % (sin bajar de 0).',
      rule: 'Encontrado: el elemento y el tipo (1). A medias: el elemento, con otro tipo (½). Falsa alarma: una marca donde no hay error (−½).',
      found: 'Encontrado', half: 'A medias', missed: 'No encontrado', falseAlarm: 'Falsa alarma',
      youMarked: 'Lo marcaste como «{type}».', either: 'Podías marcar {a} o {b}.', noError: '{x} está bien: aquí no hay ningún error.',
      practice: 'Puedes cambiar tus marcas y volver a comprobar.', errorsTitle: 'Los errores de esta red',
    },
    exp: {
      royMissing: 'Falta el arco {from} → {to}: la tabla pone {from} como predecesora inmediata de {to}.',
      royFalse: 'Sobra el arco {from} → {to}: hace esperar a {to} por {from}, y en la tabla no hay relación entre ellas.',
      royInverted: 'El arco {from} → {to} va al revés: la tabla pone {to} antes que {from}.',
      royCycle: 'El arco {from} → {to} cierra un ciclo: en la tabla {to} ya va antes que {from}, así que {from} acabaría esperándose a sí misma.',
      pertFalseDummy: 'Sobra la ficticia {name}, del suceso {from} al {to}: hace esperar lo que sale del suceso {to} a lo que acaba en el {from}, y la tabla no lo pide.',
      pertMissingDummy: 'Falta la ficticia {dummy}, del suceso {from} al {to}: sin ella, lo que sale del suceso {to} no espera a lo que acaba en el {from}.',
      pertInvertedDummy: 'La ficticia {dummy} va al revés: tiene que ir del suceso {from} al {to}, no del {to} al {from}.',
      pertParallel: '{act} y {twin} van las dos del suceso {from} al {to}: falta un suceso para {act} y la ficticia {dummy}, para que cada actividad tenga sus propios sucesos.',
      calcES: '{lab}: {wrong} es el menor de los {f} de sus predecesoras; es el mayor, {right}.',
      calcLF: '{lab}: {wrong} es el mayor de los {f} de sus posteriores; es el menor, {right}.',
      calcFloat: '{lab}: {wrong} es {lf} − {es}, sin restar la duración; es {lf} − {es} − d = {right}.',
      calcCritOn: '{x} está marcada como crítica y no lo es: su holgura total es {tf}.',
      calcCritOff: '{x} es crítica (su holgura total es 0) y no está marcada.',
      calcTE: '{lab}: {wrong} toma el camino más corto que llega al suceso; es el más largo, {right}.',
      calcTL: '{lab}: {wrong} toma el mayor de lo que sale del suceso; es el menor, {right}.',
      calcSlack: '{lab}: {wrong} tiene el signo cambiado; es {tl} − {te} = {right}.',
    },
    alt: { title: 'La red como tabla', node: 'Nodo', preds: 'Predecesoras en esta red', act: 'Actividad', from: 'Del suceso', to: 'Al suceso', dummies: 'Ficticias: {list}.', noDummies: 'Sin ficticias.' },
  };

  const en = {
    net: 'Network', graph: { aon: 'AON', aoa: 'AOA' }, errors: 'Errors', kind: { net: 'in the network', calc: 'in the calculations', all: 'all' },
    title: 'This network has {n} errors. Find them and say what is wrong.', titleOne: 'This network has 1 error. Find it and say what is wrong.',
    moved: 'The table of seed {sd} does not admit errors of this group: the table of seed {used} is used instead.',
    noTable: 'With these parameters no table admits errors of this group. Try another group of errors or other parameters.',
    tooMany: 'At most {n} marks: remove one before adding another.',
    svgAon: 'AON network with errors', svgAoa: 'AOA network with errors',
    legendAon: 'Box: {ES} d {EF} / {LS} {TF} {LF} · ★ = critical', legendAoa: 'Under each event: {TE} | {TL} | slack · ★ = critical', noFigures: 'Network errors only: the network has no figures.',
    marks: 'Your marks', none: 'Nothing marked yet.', remove: 'Remove', removeOf: 'Remove the mark on {x}',
    help: 'Select a node, an arc or a cell (click, or Tab and Enter) and choose what is wrong with it. What is missing cannot be clicked: mark one of its two ends.',
    keys: 'Keyboard: Tab moves through the network · Enter opens the menu · Del removes the mark · Esc closes the menu.',
    menuOf: '{x}: what is wrong?', close: 'Close', unmark: 'Remove the mark',
    opt: {
      royMissing: 'It lacks an arc (in or out)', royFalse: 'Not needed: it creates a false precedence', royInverted: 'It is reversed', royCycle: 'It closes a cycle',
      pertFalseDummy: 'Not needed: it creates a false precedence', pertMissingDummy: 'It lacks a dummy (in or out)', pertInvertedDummy: 'It is reversed',
      pertParallel: 'It has the same events as another activity', calc: 'It is miscalculated', calcCrit: 'It is wrongly marked as critical (or not marked)',
    },
    type: {
      royMissing: 'missing arc', royFalse: 'extra arc', royInverted: 'reversed arc', royCycle: 'arc that closes a cycle', pertFalseDummy: 'extra dummy',
      pertMissingDummy: 'missing dummy', pertInvertedDummy: 'reversed dummy', pertParallel: 'same events', calc: 'miscalculated', calcCrit: 'critical marked wrongly',
    },
    el: { node: 'Node {x}', arc: 'Arc {from} → {to}', event: 'Event {n}', dummy: 'Dummy {name}, from event {from} to {to}', act: 'Activity {x}, from event {from} to {to}', crit: 'Critical mark of {x}' },
    aria: { crit: 'critical', notCrit: 'not critical', marked: 'marked ({n}): {type}', found: 'found', half: 'half', falseAlarm: 'false alarm', missed: 'error not found', error: 'error' },
    did: { mark: '{x}: {type}.', unmark: 'Mark removed: {x}.' },
    check: 'Check', deliver: 'Hand in', see: 'See the errors', hide: 'Hide the errors',
    exam: {
      note: 'Exam: there is no correction until you hand in.',
      confirm: 'Hand in now? Your marks are then locked and the mark and the correction appear.', confirmYes: 'Yes, hand in', confirmNo: 'Keep looking',
      delivered: 'Handed in: your marks are locked. The link keeps the hand-in, and reloading shows this same correction.',
    },
    res: {
      title: '{f} of {n} found', titleOne: '{f} of 1 found', grade: 'Mark', of: 'out of 100',
      count: '({f} + ½ × {h} − ½ × {a}) / {n} = {pct} % (never below 0).',
      rule: 'Found: the element and the kind (1). Half: the element, with another kind (½). False alarm: a mark where there is no error (−½).',
      found: 'Found', half: 'Half', missed: 'Not found', falseAlarm: 'False alarm',
      youMarked: 'You marked it as «{type}».', either: 'You could have marked {a} or {b}.', noError: '{x} is right: there is no error here.',
      practice: 'You can change your marks and check again.', errorsTitle: 'The errors in this network',
    },
    exp: {
      royMissing: 'The arc {from} → {to} is missing: the table makes {from} an immediate predecessor of {to}.',
      royFalse: 'The arc {from} → {to} is not needed: it makes {to} wait for {from}, and the table does not relate them.',
      royInverted: 'The arc {from} → {to} is reversed: the table puts {to} before {from}.',
      royCycle: 'The arc {from} → {to} closes a cycle: in the table {to} already comes before {from}, so {from} would end up waiting for itself.',
      pertFalseDummy: 'Dummy {name}, from event {from} to {to}, is not needed: it makes what leaves event {to} wait for what ends at event {from}, which the table does not ask for.',
      pertMissingDummy: 'Dummy {dummy}, from event {from} to {to}, is missing: without it, what leaves event {to} does not wait for what ends at event {from}.',
      pertInvertedDummy: 'Dummy {dummy} is reversed: it must go from event {from} to {to}, not from {to} to {from}.',
      pertParallel: '{act} and {twin} both go from event {from} to {to}: {act} needs an event of its own and the dummy {dummy}, so that each activity has its own events.',
      calcES: '{lab}: {wrong} is the smallest {f} of its predecessors; it is the largest, {right}.',
      calcLF: '{lab}: {wrong} is the largest {f} of its successors; it is the smallest, {right}.',
      calcFloat: '{lab}: {wrong} is {lf} − {es}, without subtracting the duration; it is {lf} − {es} − d = {right}.',
      calcCritOn: '{x} is marked as critical and is not: its total float is {tf}.',
      calcCritOff: '{x} is critical (its total float is 0) and is not marked.',
      calcTE: '{lab}: {wrong} takes the shortest way into the event; it is the longest, {right}.',
      calcTL: '{lab}: {wrong} takes the largest of what leaves the event; it is the smallest, {right}.',
      calcSlack: '{lab}: {wrong} has the wrong sign; it is {tl} − {te} = {right}.',
    },
    alt: { title: 'The network as a table', node: 'Node', preds: 'Predecessors in this network', act: 'Activity', from: 'From event', to: 'To event', dummies: 'Dummies: {list}.', noDummies: 'No dummies.' },
  };

  I.dict.es.det = es;
  I.dict.en.det = en;

  const api = { es, en };
  root.PNL = root.PNL || {};
  root.PNL.i18nDet = api;
  if (isNode) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
