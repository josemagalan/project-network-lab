/*
 * i18n-gpr — textos de la pestaña «Precedencias generalizadas» en español e inglés (spec f5a-precedencias-generalizadas;
 * plan P11, bloque 2: la tabla, la red ROY, los errores y los avisos; tableros 114–121). Se carga bajo demanda con la vista
 * v=gpr (grupo gr) y se fusiona con i18n (dict.es.gpr y dict.en.gpr), así que las demás vistas no pagan estos bytes.
 * Los códigos de las relaciones ({fs}, {ss}, {sf}) los pone la vista con la notación elegida (decisión del autor, T010).
 */
(function (root) {
  'use strict';

  const isNode = typeof module !== 'undefined' && module.exports;
  const I = isNode ? require('./i18n.js') : root.PNL.i18n;

  const es = {
    region: 'Precedencias generalizadas',
    project: 'Proyecto', own: 'Tabla propia', fromWork: 'Partir del taller',
    fromWorkDone: 'Se ha copiado la tabla del taller con todas las relaciones {fs} sin desfase. El taller no cambia.',
    tableTitle: 'Tabla', tableTitleUnit: 'Tabla ({unit})',
    chipsLabel: 'Tabla de {name}: actividad, duración y predecesoras',
    source: 'Fuente: {source}',
    col: { id: 'Actividad', name: 'Nombre', duration: 'Duración', links: 'Predecesoras y relaciones', msg: 'Errores y avisos', remove: 'Quitar' },
    cell: '{col}, fila {n}',
    addRow: 'Añadir una fila', removeRow: 'Quitar la fila {n}', clear: 'Vaciar',
    paste: 'Pegar desde una hoja de cálculo',
    pasteHint: 'Pega las filas (actividad, nombre, duración y predecesoras, separadas por tabuladores) y pulsa «Añadir las filas».',
    pasteApply: 'Añadir las filas',
    help: {
      title: 'Cómo se escriben las relaciones',
      each: 'Cada predecesora, separada por comas:',
      alone: 'A sola es fin–comienzo sin desfase. Después va el tipo ({fs}, {ss}, FF o {sf}) y, si lo hay, el desfase con su signo (un desfase negativo es un adelanto).',
      both: 'Se pueden escribir los dos juegos de códigos, FS, SS, FF y SF o FC, CC, FF y CF: la tabla y la red los enseñan con la notación elegida en «Ajustes».',
      several: 'Entre dos actividades puede haber más de una relación (CC y FF, por ejemplo), pero no dos del mismo tipo.',
      floats: 'Holguras en esta pestaña: {tf} (total) y {ff} (libre).',
      clash: 'La relación FF siempre va escrita junto a su predecesora («B FF»), así que no se confunde con la holgura libre.',
    },
    issues: {
      errorsOne: 'Hay 1 error: mientras haya errores no se calcula.',
      errors: 'Hay {n} errores: mientras haya errores no se calcula.',
      rowOne: 'Fila {list}.', rows: 'Filas {list}.',
      empty: 'La tabla está vacía: escribe al menos una actividad con su duración.',
    },
    issue: {
      badId: 'El identificador debe tener de 1 a 4 letras o cifras.',
      reservedCode: '{ids} es un código de relación: elige otro identificador.',
      reservedNode: '{ids} está reservado para los nodos de inicio y fin.',
      duplicateId: 'El identificador {ids} está repetido.',
      badDuration: 'La duración debe ser un número mayor o igual que 0.',
      badRel: 'No entiendo «{text}» en «{cell}». Escribe cada relación como A, A {ss} o A {ss}+2.',
      unknownRef: 'No hay ninguna actividad {ids}.',
      selfRel: 'Una actividad no puede ser predecesora de sí misma.',
      dupRel: 'Dos relaciones {type} con {a}. Deja una.',
      tooMany: 'Como máximo 30 actividades y 120 relaciones.',
      ssLong: '{rel} no es menor que la duración de {a} ({d}): equivale a {equiv}. Se calcula igualmente.',
    },
    net: {
      title: 'Red ROY', head: 'Red ROY · duración {T}', swipe: 'Desliza para ver toda la red →',
      rels: 'Relaciones con etiqueta: {list}.',
      notFinalOne: 'La duración la marca {ids}: no es una actividad final (tiene sucesoras), pero es la que acaba la última.',
      notFinalMany: 'La duración la marcan {ids}: no son actividades finales (tienen sucesoras), pero son las que acaban las últimas.',
    },
    legend: {
      box7: 'Caja: {ES} · d · {EF} / actividad / {LS} · {TF} · {LF}', box4: 'Caja: actividad / {ES} · {LS} / d', boxc: 'Encima de cada nodo: {ES} / d / {LS}',
      critical: 'Crítica', noLabel: 'Sin etiqueta: {fs} sin desfase',
    },
    results: { title: 'Tiempos y holguras', caption: 'Tiempos y holguras de {name}', act: 'Actividad', tf: 'holgura total', ff: 'holgura libre', crit: 'crítica' },
    walk: {
      toggle: 'Paso a paso', keys: '← → avanzar o retroceder',
      start: 'Inicio', end: 'Fin', head: { term: 'Término', formula: 'Fórmula', value: 'Valor' }, governs: '← manda',
      termsCaption: 'Términos de {f}({id}): el inicio o el fin y cada relación, con su fórmula y su valor',
      fwdTitle: 'Pasada hacia delante · actividad {id}',
      fwdFirst: '{id} no tiene predecesoras: empieza con el proyecto, en 0.',
      fwdText: '{f}({id}) es el mayor de los términos: el inicio del proyecto (0) y cada relación que llega a {id}.',
      fwdHidden: '¿Cuál es {f}({id})? Calcula cada término y quédate con el mayor.',
      bwdTitle: 'Pasada hacia atrás · actividad {id}',
      bwdLast: '{id} no tiene sucesoras: debe acabar con el proyecto, así que {f}({id}) = T − d.',
      bwdText: '{f}({id}) es el menor de los términos: el fin del proyecto (T − d) y cada relación que sale de {id}.',
      bwdHidden: '¿Cuál es {f}({id})? Calcula cada término y quédate con el menor.',
      governsOne: 'Manda {term} ({v}).', governsMany: 'Mandan {terms} ({v}).',
      startGoverns: 'Manda el inicio: ninguna relación obliga a {id} a empezar después de 0.',
      clamp: 'Manda el inicio: alguna relación daría un comienzo antes de 0, y una actividad no puede empezar antes que el proyecto.',
      endGoverns: 'Manda el fin: ninguna relación obliga a {id} a empezar antes de T − d.',
      meanFwd: {
        FS: 'Con {code}, {to} no puede empezar antes de que acabe {from} más el desfase.',
        SS: 'Con {code}, {to} no puede empezar antes de que empiece {from} más el desfase.',
        FF: 'Con {code}, {to} no puede acabar antes de que acabe {from} más el desfase; por eso se resta d({to}).',
        SF: 'Con {code}, {to} no puede acabar antes de que empiece {from} más el desfase; por eso se resta d({to}).',
      },
      meanBwd: {
        FS: 'Con {code}, {from} debe acabar antes del comienzo tardío de {to} menos el desfase.',
        SS: 'Con {code}, {from} debe empezar antes del comienzo tardío de {to} menos el desfase.',
        FF: 'Con {code}, {from} debe acabar antes del fin tardío de {to} menos el desfase.',
        SF: 'Con {code}, {from} debe empezar antes del fin tardío de {to} menos el desfase.',
      },
      // Sin desfase, la misma frase sin hablar del desfase (decisión del autor, T011).
      meanFwdNoLag: {
        FS: 'Con {code}, {to} no puede empezar antes de que acabe {from}.',
        SS: 'Con {code}, {to} no puede empezar antes de que empiece {from}.',
        FF: 'Con {code}, {to} no puede acabar antes de que acabe {from}; por eso se resta d({to}).',
        SF: 'Con {code}, {to} no puede acabar antes de que empiece {from}; por eso se resta d({to}).',
      },
      meanBwdNoLag: {
        FS: 'Con {code}, {from} debe acabar antes del comienzo tardío de {to}.',
        SS: 'Con {code}, {from} debe empezar antes del comienzo tardío de {to}.',
        FF: 'Con {code}, {from} debe acabar antes del fin tardío de {to}.',
        SF: 'Con {code}, {from} debe empezar antes del fin tardío de {to}.',
      },
      efLine: '{ef}({id}) = {es}({id}) + d = {a} + {d} = {b}.', lfLine: '{lf}({id}) = {ls}({id}) + d = {a} + {d} = {b}.',
      endTitle: 'Duración del proyecto',
      endText: 'T es el mayor {ef} de todas las actividades, no solo de las finales: con {ss} o {sf}, una sucesora puede acabar antes que su predecesora. T = {T} ({ids}).',
      endHidden: '¿Cuánto dura el proyecto? T es el mayor {ef} de todas las actividades, no solo de las finales.',
      floatTitle: { TF: 'Holgura total', FF: 'Holgura libre' },
      floatText: {
        TF: '{tf} = {ls} − {es}: lo que cada actividad puede retrasarse sin retrasar el proyecto.',
        FF: '{ff}: lo que cada actividad puede retrasarse sin mover el comienzo temprano de ninguna sucesora ni el fin del proyecto. Es el menor de T − {ef} y de lo que le sobra a cada relación que sale.',
      },
      floatAsk: 'Escribe la de cada actividad.', floatsCaption: '{f} de cada actividad',
      critTitle: 'Actividades críticas',
      critText: 'Son críticas las de {tf} = 0: {list}. Las flechas críticas son las relaciones que mandan entre ellas.',
      pathOne: 'Camino crítico: {p}.', pathMany: 'Caminos críticos: {p}.',
      ok: 'Correcto: {v}.', wrong: 'No: es {v}.', empty: 'Escribe un número antes de comprobar.',
    },
    relName: { FS: 'fin–comienzo', SS: 'comienzo–comienzo', FF: 'fin–fin', SF: 'comienzo–fin' },
  };

  const en = {
    region: 'Generalized precedences',
    project: 'Project', own: 'Own table', fromWork: 'Start from the workshop',
    fromWorkDone: 'The workshop table has been copied with every relation {fs} with no lag. The workshop does not change.',
    tableTitle: 'Table', tableTitleUnit: 'Table ({unit})',
    chipsLabel: 'Table of {name}: activity, duration and predecessors',
    source: 'Source: {source}',
    col: { id: 'Activity', name: 'Name', duration: 'Duration', links: 'Predecessors and relations', msg: 'Errors and warnings', remove: 'Remove' },
    cell: '{col}, row {n}',
    addRow: 'Add a row', removeRow: 'Remove row {n}', clear: 'Clear',
    paste: 'Paste from a spreadsheet',
    pasteHint: 'Paste the rows (activity, name, duration and predecessors, separated by tabs) and press “Add the rows”.',
    pasteApply: 'Add the rows',
    help: {
      title: 'How to write the relations',
      each: 'Each predecessor, separated by commas:',
      alone: 'A alone is finish-to-start with no lag. Then comes the type ({fs}, {ss}, FF or {sf}) and, if there is one, the lag with its sign (a negative lag is a lead).',
      both: 'Both sets of codes can be written, FS, SS, FF and SF or FC, CC, FF and CF: the table and the network show them in the notation chosen in “Settings”.',
      several: 'Between two activities there can be more than one relation (SS and FF, for example), but not two of the same type.',
      floats: 'Floats in this tab: {tf} (total) and {ff} (free).',
      clash: 'The FF relation is always written next to its predecessor (“B FF”), so it does not get mixed up with the free float.',
    },
    issues: {
      errorsOne: 'There is 1 error: nothing is calculated while there are errors.',
      errors: 'There are {n} errors: nothing is calculated while there are errors.',
      rowOne: 'Row {list}.', rows: 'Rows {list}.',
      empty: 'The table is empty: write at least one activity with its duration.',
    },
    issue: {
      badId: 'The identifier must have 1 to 4 letters or digits.',
      reservedCode: '{ids} is a relation code: choose another identifier.',
      reservedNode: '{ids} is reserved for the start and end nodes.',
      duplicateId: 'The identifier {ids} is repeated.',
      badDuration: 'The duration must be a number of 0 or more.',
      badRel: 'I can’t read “{text}” in “{cell}”. Write each relation as A, A {ss} or A {ss}+2.',
      unknownRef: 'There is no activity {ids}.',
      selfRel: 'An activity cannot be its own predecessor.',
      dupRel: 'Two {type} relations with {a}. Keep one.',
      tooMany: 'At most 30 activities and 120 relations.',
      ssLong: '{rel} is not less than the duration of {a} ({d}): it is the same as {equiv}. It is calculated anyway.',
    },
    net: {
      title: 'AON network', head: 'AON network · duration {T}', swipe: 'Swipe to see the whole network →',
      rels: 'Labelled relations: {list}.',
      notFinalOne: 'The duration is set by {ids}: it is not a final activity (it has successors), but it is the one that finishes last.',
      notFinalMany: 'The duration is set by {ids}: they are not final activities (they have successors), but they are the ones that finish last.',
    },
    legend: {
      box7: 'Box: {ES} · d · {EF} / activity / {LS} · {TF} · {LF}', box4: 'Box: activity / {ES} · {LS} / d', boxc: 'Above each node: {ES} / d / {LS}',
      critical: 'Critical', noLabel: 'No label: {fs} with no lag',
    },
    results: { title: 'Times and floats', caption: 'Times and floats of {name}', act: 'Activity', tf: 'total float', ff: 'free float', crit: 'critical' },
    walk: {
      toggle: 'Step by step', keys: '← → step back or forward',
      start: 'Start', end: 'End', head: { term: 'Term', formula: 'Formula', value: 'Value' }, governs: '← governs',
      termsCaption: 'Terms of {f}({id}): the start or the end and each relation, with its formula and its value',
      fwdTitle: 'Forward pass · activity {id}',
      fwdFirst: '{id} has no predecessors: it starts with the project, at 0.',
      fwdText: '{f}({id}) is the largest of the terms: the project start (0) and each relation that arrives at {id}.',
      fwdHidden: 'What is {f}({id})? Work out each term and keep the largest.',
      bwdTitle: 'Backward pass · activity {id}',
      bwdLast: '{id} has no successors: it must finish with the project, so {f}({id}) = T − d.',
      bwdText: '{f}({id}) is the smallest of the terms: the project end (T − d) and each relation that leaves {id}.',
      bwdHidden: 'What is {f}({id})? Work out each term and keep the smallest.',
      governsOne: '{term} governs ({v}).', governsMany: '{terms} govern ({v}).',
      startGoverns: 'The start governs: no relation makes {id} start after 0.',
      clamp: 'The start governs: some relation would give a start before 0, and an activity cannot start before the project.',
      endGoverns: 'The end governs: no relation makes {id} start before T − d.',
      meanFwd: {
        FS: 'With {code}, {to} cannot start before {from} finishes plus the lag.',
        SS: 'With {code}, {to} cannot start before {from} starts plus the lag.',
        FF: 'With {code}, {to} cannot finish before {from} finishes plus the lag; that is why d({to}) is subtracted.',
        SF: 'With {code}, {to} cannot finish before {from} starts plus the lag; that is why d({to}) is subtracted.',
      },
      meanBwd: {
        FS: 'With {code}, {from} must finish before the late start of {to} minus the lag.',
        SS: 'With {code}, {from} must start before the late start of {to} minus the lag.',
        FF: 'With {code}, {from} must finish before the late finish of {to} minus the lag.',
        SF: 'With {code}, {from} must start before the late finish of {to} minus the lag.',
      },
      meanFwdNoLag: {
        FS: 'With {code}, {to} cannot start before {from} finishes.',
        SS: 'With {code}, {to} cannot start before {from} starts.',
        FF: 'With {code}, {to} cannot finish before {from} finishes; that is why d({to}) is subtracted.',
        SF: 'With {code}, {to} cannot finish before {from} starts; that is why d({to}) is subtracted.',
      },
      meanBwdNoLag: {
        FS: 'With {code}, {from} must finish before the late start of {to}.',
        SS: 'With {code}, {from} must start before the late start of {to}.',
        FF: 'With {code}, {from} must finish before the late finish of {to}.',
        SF: 'With {code}, {from} must start before the late finish of {to}.',
      },
      efLine: '{ef}({id}) = {es}({id}) + d = {a} + {d} = {b}.', lfLine: '{lf}({id}) = {ls}({id}) + d = {a} + {d} = {b}.',
      endTitle: 'Project duration',
      endText: 'T is the largest {ef} of all the activities, not only of the final ones: with {ss} or {sf}, a successor can finish before its predecessor. T = {T} ({ids}).',
      endHidden: 'How long does the project take? T is the largest {ef} of all the activities, not only of the final ones.',
      floatTitle: { TF: 'Total float', FF: 'Free float' },
      floatText: {
        TF: '{tf} = {ls} − {es}: how much each activity can slip without delaying the project.',
        FF: '{ff}: how much each activity can slip without moving the early start of any successor or the project end. It is the smallest of T − {ef} and of what each outgoing relation has to spare.',
      },
      floatAsk: 'Write the one of each activity.', floatsCaption: '{f} of each activity',
      critTitle: 'Critical activities',
      critText: 'The critical ones are those with {tf} = 0: {list}. The critical arrows are the relations that govern between them.',
      pathOne: 'Critical path: {p}.', pathMany: 'Critical paths: {p}.',
      ok: 'Right: {v}.', wrong: 'No: it is {v}.', empty: 'Write a number before checking.',
    },
    relName: { FS: 'finish-to-start', SS: 'start-to-start', FF: 'finish-to-finish', SF: 'start-to-finish' },
  };

  I.dict.es.gpr = es;
  I.dict.en.gpr = en;

  const api = { es, en };
  root.PNL = root.PNL || {};
  root.PNL.i18nGpr = api;
  if (isNode) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
