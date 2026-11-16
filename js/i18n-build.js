/*
 * i18n-build — textos de construir las redes en «Ejercicios» y del reto ROY del taller (spec f3d-construir-detectar;
 * plan P1 y P10, bloque 1; tableros 81–85, 88, 89 y 92). Se carga bajo demanda con el grupo xb y se fusiona con i18n
 * (dict.es.xb y dict.en.xb). Las etiquetas que se ven sin el grupo (tipo de ejercicio y «Reto ROY») están en i18n.
 */
(function (root) {
  'use strict';

  const isNode = typeof module !== 'undefined' && module.exports;
  const I = isNode ? require('./i18n.js') : root.PNL.i18n;

  const es = {
    table: 'Tabla de precedencias', yourTable: 'Tu red como tabla',
    yourTableHint: 'Predecesoras de cada nodo en tu dibujo. También se edita aquí: escribe sus nombres separados por comas.',
    node: 'Nodo', preds: 'Predecesoras en tu dibujo', predsOf: 'Predecesoras de {x} en tu dibujo', predsOfOff: 'Predecesoras de {x} (aún no está en el lienzo)',
    canvas: 'Tu red ROY', canvasLocked: 'Tu red (entregada)', locked: 'Bloqueada: solo se puede mirar',
    canvasName: 'Lienzo de tu red ROY', canvasNameLocked: 'Tu red ROY entregada',
    tools: 'Herramientas del lienzo', tool: { activity: 'Actividad', join: 'Unir', move: 'Mover', delete: 'Borrar' }, place: 'Colocar por niveles',
    toPlace: 'Por colocar:', allPlaced: 'Todas las actividades están en el lienzo.', notPlaced: 'Sin colocar: {list}.',
    hint: {
      activity: 'Actividad: elige una ficha de «Por colocar» y pulsa un hueco del lienzo.',
      join: 'Unir: pulsa el nodo de origen y después el de destino.',
      move: 'Mover: pulsa el nodo y después el hueco al que va.',
      delete: 'Borrar: pulsa un nodo o un arco. Inicio y Fin no se borran.',
    },
    keys: 'Teclado: Tab recorre fichas, nodos y arcos · N coloca la actividad elegida junto al nodo enfocado · U une desde el nodo enfocado (U otra vez en el destino) · flechas mueven · Supr borra · Esc cancela.',
    aria: { preds: 'predecesoras: {list}', succs: 'posteriores: {list}', none: 'sin arcos', picked: 'origen elegido', arc: 'Arco de {from} a {to}',
      issue: 'problema {n}', warn: 'aviso', chip: '{x}: colocar en el lienzo' },
    did: {
      pick: '{x} elegida: pulsa un hueco del lienzo, o N junto a un nodo.', add: '{x} colocada.', none: 'No queda ninguna actividad por colocar.',
      pickFrom: 'Origen: {x}. Ahora, el nodo de destino.', join: 'Arco de {from} a {to}.', pickMove: 'Mover {x}: pulsa el hueco al que va.', move: '{x} movida.',
      remove: '{x} sale del lienzo y vuelve a «Por colocar».', unjoin: 'Arco de {from} a {to} quitado.', cancel: 'Cancelado.',
      place: 'Red colocada por niveles; los arcos no cambian.', table: 'Predecesoras de {x}: {list}.',
    },
    bad: {
      same: 'Un arco no puede ir de un nodo a sí mismo: elige otro destino.', toStart: 'A Inicio no puede llegar ningún arco.',
      fromEnd: 'De Fin no puede salir ningún arco.', dup: 'Ese arco ya está.', fixed: 'Inicio y Fin no se pueden borrar.',
      unknown: '«{v}» no es una actividad de la tabla.', self: '{x} no puede ser predecesora de sí misma.', end: 'Fin no puede ser predecesora de nada.',
      start: 'Inicio no tiene predecesoras.',
    },
    see: 'Ver la red correcta', hide: 'Ocultar la red correcta', correct: 'La red correcta (la de la ruta guiada)', correctName: 'La red ROY correcta',
    correctKeep: 'Tu red no cambia: puedes volver a mirarla con el enlace.', check: 'Comprobar', deliver: 'Entregar',
    diag: {
      title: '{n} cosas que corregir', titleOne: '1 cosa que corregir', ok: 'Tu red es correcta', warn: 'Aviso',
      practice: 'En Practicar no hay nota: comprueba cuantas veces quieras.',
      marks: 'El número, el color y la línea discontinua marcan cada problema; una flecha punteada es un arco que falta. Cualquier cambio borra el diagnóstico.',
    },
    issue: {
      missingNode: 'Falta la actividad {a}.', cycle: 'Ciclo: {list} acaban esperándose a sí mismas.',
      inverted: 'Arco al revés: la tabla pide {a} antes que {b}, y tu arco va de {b} a {a}.',
      missingPrecedence: 'Falta una precedencia: {a} va antes que {b} y ningún camino los une.',
      falsePrecedence: 'Precedencia falsa: el arco {a} → {b} hace esperar a {b} por {a}, y la tabla no lo pide.',
      startIn: '{a} no tiene predecesoras: sale de Inicio.', startOut: '{a} tiene predecesoras: no sale de Inicio.',
      endIn: '{a} no tiene posteriores: llega a Fin.', endOut: '{a} tiene posteriores: no llega a Fin.',
      startMissing: 'Inicio no está unido a nada.', endMissing: 'Nada llega a Fin.', invalidArc: 'Arco imposible: {a} → {b}.',
      redundant: 'El arco {a} → {b} ya lo implica {path}: sobra, pero no resta.',
    },
    exam: {
      note: 'Examen: no hay marcas ni diagnóstico hasta que entregues.',
      confirm: '¿Entregar ahora? Después tu red se bloquea y aparecen la nota y la corrección.', confirmYes: 'Sí, entregar', confirmNo: 'Seguir dibujando',
      delivered: 'Entregado: tu red está bloqueada. El enlace guarda la entrega y al recargar se ve esta misma corrección.',
    },
    grade: {
      label: 'Nota', of: 'sobre 100',
      count: 'Aciertos: {hits} de {total} (precedencias inmediatas y uniones con Inicio y Fin) menos {f} arcos falsos: {raw} %.',
      countOne: 'Aciertos: {hits} de {total} (precedencias inmediatas y uniones con Inicio y Fin) menos 1 arco falso: {raw} %.',
      countNone: 'Aciertos: {hits} de {total} (precedencias inmediatas y uniones con Inicio y Fin), sin arcos falsos: {raw} %.',
      cycle: 'Tu red tiene un ciclo, así que no se puede ordenar: la nota se queda en el 50 %.',
    },
    // T010: construir la PERT en «Ejercicios» (el reto de ficticias con nota).
    pert: {
      seeMin: 'Ver la red mínima', seeRules: 'Ver la red de las reglas',
      min: 'Red correcta con el mínimo de ficticias ({min}): 80 + 20 = 100 %.',
      extra: 'Red correcta con {k} ficticias, {e} más que el mínimo ({min}): 100 − 5 × {e} = {pct} %.',
      extraFloor: 'Red correcta con {k} ficticias, {e} más que el mínimo ({min}): la nota no baja de 80 %.',
      wrong: 'Red incorrecta: {hits} de {total} precedencias inmediatas bien representadas. Con la red incorrecta, la nota es como mucho 60 %: {pct} %.',
      notExact: 'Con estos parámetros el mínimo de ficticias no es seguro: se usa el mejor conocido ({min}).',
    },
    // T009: el reto ROY del taller (sin nota).
    reto: { title: 'Construye la red ROY de la tabla, con Inicio y Fin.', region: 'Reto ROY', bad: 'Corrige la tabla para empezar el reto ROY.' },
  };

  const en = {
    table: 'Precedence table', yourTable: 'Your network as a table',
    yourTableHint: 'Predecessors of each node in your drawing. You can also edit it here: type their names separated by commas.',
    node: 'Node', preds: 'Predecessors in your drawing', predsOf: 'Predecessors of {x} in your drawing', predsOfOff: 'Predecessors of {x} (not on the canvas yet)',
    canvas: 'Your AON network', canvasLocked: 'Your network (handed in)', locked: 'Locked: you can only look at it',
    canvasName: 'Canvas of your AON network', canvasNameLocked: 'Your AON network, handed in',
    tools: 'Canvas tools', tool: { activity: 'Activity', join: 'Join', move: 'Move', delete: 'Delete' }, place: 'Arrange by levels',
    toPlace: 'To place:', allPlaced: 'Every activity is on the canvas.', notPlaced: 'Not placed: {list}.',
    hint: {
      activity: 'Activity: choose a tile under «To place» and click a gap on the canvas.',
      join: 'Join: click the source node, then the target.',
      move: 'Move: click the node, then the gap it goes to.',
      delete: 'Delete: click a node or an arc. Start and End cannot be deleted.',
    },
    keys: 'Keyboard: Tab moves through tiles, nodes and arcs · N places the chosen activity next to the focused node · J joins from the focused node (J again on the target) · arrows move · Del deletes · Esc cancels.',
    aria: { preds: 'predecessors: {list}', succs: 'successors: {list}', none: 'no arcs', picked: 'source chosen', arc: 'Arc from {from} to {to}',
      issue: 'problem {n}', warn: 'note', chip: '{x}: place on the canvas' },
    did: {
      pick: '{x} chosen: click a gap on the canvas, or press N next to a node.', add: '{x} placed.', none: 'There is no activity left to place.',
      pickFrom: 'Source: {x}. Now the target node.', join: 'Arc from {from} to {to}.', pickMove: 'Move {x}: click the gap it goes to.', move: '{x} moved.',
      remove: '{x} leaves the canvas and goes back to «To place».', unjoin: 'Arc from {from} to {to} removed.', cancel: 'Cancelled.',
      place: 'Network arranged by levels; the arcs do not change.', table: 'Predecessors of {x}: {list}.',
    },
    bad: {
      same: 'An arc cannot go from a node to itself: choose another target.', toStart: 'No arc can enter Start.',
      fromEnd: 'No arc can leave End.', dup: 'That arc is already there.', fixed: 'Start and End cannot be deleted.',
      unknown: '«{v}» is not an activity of the table.', self: '{x} cannot be its own predecessor.', end: 'End cannot be a predecessor of anything.',
      start: 'Start has no predecessors.',
    },
    see: 'See the correct network', hide: 'Hide the correct network', correct: 'The correct network (the one in the guided tour)', correctName: 'The correct AON network',
    correctKeep: 'Your network does not change: you can look at it again with the link.', check: 'Check', deliver: 'Hand in',
    diag: {
      title: '{n} things to fix', titleOne: '1 thing to fix', ok: 'Your network is correct', warn: 'Note',
      practice: 'In Practice there is no mark: check as often as you like.',
      marks: 'Numbers, colour and a broken line mark each problem; a dotted arrow is one that is missing. Any edit clears the diagnosis.',
    },
    issue: {
      missingNode: 'Activity {a} is missing.', cycle: 'Cycle: {list} end up waiting for themselves.',
      inverted: 'Reversed arc: the table puts {a} before {b}, but your arc goes from {b} to {a}.',
      missingPrecedence: 'Missing precedence: {a} comes before {b}, but no path joins them.',
      falsePrecedence: 'False precedence: the arc {a} → {b} makes {b} wait for {a}, which the table does not ask for.',
      startIn: '{a} has no predecessors: it starts from Start.', startOut: '{a} has predecessors: it does not start from Start.',
      endIn: '{a} has no successors: it leads to End.', endOut: '{a} has successors: it does not lead to End.',
      startMissing: 'Start is not joined to anything.', endMissing: 'Nothing leads to End.', invalidArc: 'Impossible arc: {a} → {b}.',
      redundant: 'The arc {a} → {b} is already implied by {path}: it is redundant, but costs nothing.',
    },
    exam: {
      note: 'Exam: no marks or diagnosis until you hand in.',
      confirm: 'Hand in now? Your network is then locked and the mark and the correction appear.', confirmYes: 'Yes, hand in', confirmNo: 'Keep drawing',
      delivered: 'Handed in: your network is locked. The link keeps the hand-in, and reloading shows this same correction.',
    },
    grade: {
      label: 'Mark', of: 'out of 100',
      count: 'Right: {hits} of {total} (immediate precedences and joins with Start and End) minus {f} false arcs: {raw} %.',
      countOne: 'Right: {hits} of {total} (immediate precedences and joins with Start and End) minus 1 false arc: {raw} %.',
      countNone: 'Right: {hits} of {total} (immediate precedences and joins with Start and End), with no false arcs: {raw} %.',
      cycle: 'Your network has a cycle, so it cannot be ordered: the mark stays at 50 %.',
    },
    pert: {
      seeMin: 'See the minimum network', seeRules: 'See the network of the rules',
      min: 'Correct network with the minimum number of dummies ({min}): 80 + 20 = 100 %.',
      extra: 'Correct network with {k} dummies, {e} more than the minimum ({min}): 100 − 5 × {e} = {pct} %.',
      extraFloor: 'Correct network with {k} dummies, {e} more than the minimum ({min}): the mark does not drop below 80 %.',
      wrong: 'Incorrect network: {hits} of {total} immediate precedences correctly represented. With an incorrect network the mark is at most 60 %: {pct} %.',
      notExact: 'With these parameters the minimum number of dummies is not certain: the best known one ({min}) is used.',
    },
    reto: { title: 'Build the AON network of the table, with Start and End.', region: 'AON challenge', bad: 'Fix the table to start the AON challenge.' },
  };

  I.dict.es.xb = es;
  I.dict.en.xb = en;

  const api = { es, en };
  root.PNL = root.PNL || {};
  root.PNL.i18nBuild = api;
  if (isNode) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
