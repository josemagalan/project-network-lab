'use strict';
// ex-build: construir la red ROY en «Ejercicios» sin DOM (F3d, T008; AC1–AC6 y AC22): la red del alumno y sus
// operaciones, «Colocar por niveles», «Tu red como tabla», las marcas del diagnóstico y los textos de la nota. El lienzo,
// el teclado, Practicar y Examen los comprueban las pruebas de navegador.
const test = require('node:test');
const assert = require('node:assert/strict');
const GEN = require('../js/core/generator.js');
const P = require('../js/core/project.js');
const RC = require('../js/core/roycheck.js');
const EX = require('../js/core/examples.js');
const I = require('../js/i18n.js');
const XB = require('../js/ex-build.js');
const X = require('../js/ex.js');
const U = require('../js/core/urlstate.js');

const ej6 = P.parse(EX.get('ej6').rows, EX.get('ej6').mode).project;
const arcSet = (net) => net.arcs.map((a) => `${a.from}>${a.to}`).sort();
const tables = (n) => {
  const out = [];
  for (const lv of ['easy', 'medium', 'hard']) for (let sd = 1; out.length < n * (['easy', 'medium', 'hard'].indexOf(lv) + 1); sd++) {
    const g = GEN.generate(sd, GEN.LEVELS[lv]);
    if (g.ok) out.push(P.parse(g.rows, 'pred').project);
  }
  return out;
};

test('T008 · la red de partida tiene Inicio y Fin colocados y no cuenta como trabajo hecho', () => {
  const s = XB.start();
  assert.deepEqual(s.nodes.map((n) => n.id), ['_S', '_E']);
  assert.ok(s.nodes.every((n) => Number.isInteger(n.x) && Number.isInteger(n.y)));
  assert.equal(XB.hasWork(s), false);
  assert.equal(XB.hasWork(XB.apply(s, { type: 'move', id: '_S', x: 100, y: 100 }, ej6)), false, 'mover Inicio no es trabajo');
  assert.equal(XB.hasWork(XB.apply(s, { type: 'add', id: 'A', x: 160, y: 180 }, ej6)), true);
  assert.equal(XB.hasWork(XB.apply(s, { type: 'join', from: '_S', to: '_E' }, ej6)), true);
  assert.equal(XB.hasWork(null), false);
});

test('T008 · normalize: solo actividades de la tabla, Inicio y Fin siempre y posiciones para todos (enlace sin posiciones)', () => {
  assert.deepEqual(XB.normalize(null, ej6), XB.start());
  const n = XB.normalize({ nodes: [{ id: 'A', x: 100, y: 100 }, { id: 'ZZ', x: 1, y: 1 }], arcs: [{ from: 'A', to: 'ZZ' }, { from: 'A', to: '_E' }] }, ej6);
  assert.deepEqual(n.nodes.map((x) => x.id).sort(), ['A', '_E', '_S']);
  assert.deepEqual(arcSet(n), []);
  const noPos = XB.normalize({ nodes: [{ id: '_S' }, { id: 'A' }, { id: '_E' }], arcs: [{ from: '_S', to: 'A' }, { from: 'A', to: '_E' }] }, ej6);
  assert.ok(noPos.nodes.every((x) => Number.isInteger(x.x) && Number.isInteger(x.y)));
  assert.deepEqual(arcSet(noPos), ['A>_E', '_S>A']);
});

test('T008 · apply: colocar, mover, unir, quitar y borrar; lo que no cambia nada devuelve la misma red', () => {
  let net = XB.start();
  const same = (op) => assert.equal(XB.apply(net, op, ej6), net, JSON.stringify(op));
  net = XB.apply(net, { type: 'add', id: 'A', x: 160, y: 180 }, ej6);
  same({ type: 'add', id: 'A', x: 300, y: 300 });           // ya está
  same({ type: 'add', id: 'ZZ', x: 300, y: 300 });          // no es de la tabla
  same({ type: 'move', id: 'A', x: 160, y: 180 });          // mismo sitio
  net = XB.apply(net, { type: 'join', from: '_S', to: 'A' }, ej6);
  for (const [from, to, code] of [['A', 'A', 'same'], ['A', '_S', 'toStart'], ['_E', 'A', 'fromEnd'], ['_S', 'A', 'dup']]) {
    assert.equal(XB.joinError(net, from, to), code);
    same({ type: 'join', from, to });
  }
  same({ type: 'join', from: 'A', to: 'B' });                // B no está en el lienzo
  same({ type: 'remove', id: '_S' });                        // Inicio y Fin no se borran
  same({ type: 'remove', id: '_E' });
  same({ type: 'unjoin', from: 'A', to: '_E' });
  const moved = XB.apply(net, { type: 'move', id: 'A', x: -50, y: 99999 }, ej6);
  assert.deepEqual(moved.nodes.find((x) => x.id === 'A'), { id: 'A', x: XB.GEO.grid, y: XB.GEO.max }, 'dentro del lienzo');
  const rm = XB.apply(net, { type: 'remove', id: 'A' }, ej6);
  assert.deepEqual(rm.nodes.map((x) => x.id), ['_S', '_E']);
  assert.deepEqual(rm.arcs, [], 'con sus arcos');
  assert.deepEqual(arcSet(XB.apply(net, { type: 'unjoin', from: '_S', to: 'A' }, ej6)), []);
  assert.equal(XB.apply(net, { type: 'nada' }, ej6), net);
  assert.ok(net.nodes.length === 3 && arcSet(net).join() === '_S>A', 'apply no toca la red de entrada');
});

test('T008 · setPreds («Tu red como tabla»): sustituye los arcos que llegan y coloca lo que falta en un hueco libre', () => {
  let net = XB.start();
  net = XB.apply(net, { type: 'setPreds', id: 'C', preds: ['A', 'B'] }, ej6);
  assert.deepEqual(net.nodes.map((x) => x.id).sort(), ['A', 'B', 'C', '_E', '_S']);
  assert.deepEqual(arcSet(net), ['A>C', 'B>C']);
  assert.equal(new Set(net.nodes.map((x) => `${x.x},${x.y}`)).size, net.nodes.length, 'sin dos nodos en el mismo sitio');
  net = XB.apply(net, { type: 'setPreds', id: 'C', preds: ['B', '_S', 'C'] }, ej6);
  assert.deepEqual(arcSet(net), ['B>C', '_S>C'], 'sin bucles');
  assert.equal(XB.apply(net, { type: 'setPreds', id: 'C', preds: ['_S', 'B'] }, ej6), net, 'lo mismo en otro orden no cambia');
  net = XB.apply(net, { type: 'setPreds', id: '_E', preds: ['C'] }, ej6);
  assert.ok(arcSet(net).includes('C>_E'));
  assert.equal(XB.apply(net, { type: 'setPreds', id: '_S', preds: ['C'] }, ej6), net, 'Inicio no tiene predecesoras');
  assert.deepEqual(arcSet(XB.apply(net, { type: 'setPreds', id: 'C', preds: [] }, ej6)), ['C>_E']);
});

test('T008 · parsePreds y predsText: nombres en mayúsculas o minúsculas, Inicio en los dos idiomas y lo que no vale', () => {
  assert.deepEqual(XB.parsePreds('a, B;c  d', 'E', ej6, 'es'), { ok: true, preds: ['A', 'B', 'C', 'D'] });
  for (const w of ['Inicio', 'start', 'INICIO', 'Start']) assert.deepEqual(XB.parsePreds(w, 'A', ej6, 'en'), { ok: true, preds: ['_S'] });
  assert.deepEqual(XB.parsePreds('', 'A', ej6, 'es'), { ok: true, preds: [] });
  assert.deepEqual(XB.parsePreds('A, A', 'B', ej6, 'es'), { ok: true, preds: ['A'] });
  assert.deepEqual(XB.parsePreds('B, A', 'A', ej6, 'es'), { ok: false, code: 'self', x: 'A' });
  assert.deepEqual(XB.parsePreds('Fin', 'A', ej6, 'es'), { ok: false, code: 'end' });
  assert.deepEqual(XB.parsePreds('A, ZZ', 'B', ej6, 'es'), { ok: false, code: 'unknown', v: 'ZZ' });
  const net = { nodes: XB.start().nodes, arcs: [{ from: 'C', to: 'D' }, { from: '_S', to: 'D' }, { from: 'A', to: 'D' }] };
  assert.equal(XB.predsText(net, 'D', 'es'), 'Inicio, A, C');
  assert.equal(XB.predsText(net, 'D', 'en'), 'Start, A, C');
  assert.equal(XB.predsText(net, 'B', 'es'), '');
});

test('T008 · AC5: «Colocar por niveles» no cambia los arcos; en las redes correctas cada arco va hacia la derecha y no hay dos nodos en el mismo sitio (300 tablas)', () => {
  for (const p of tables(100)) {
    const good = RC.fromTable(p);
    const placed = XB.placeLevels(good);
    assert.deepEqual(arcSet(placed), arcSet(good));
    const at = Object.fromEntries(placed.nodes.map((n) => [n.id, n]));
    for (const e of placed.arcs) assert.ok(at[e.from].x < at[e.to].x, `${e.from} → ${e.to}`);
    assert.equal(new Set(placed.nodes.map((n) => `${n.x},${n.y}`)).size, placed.nodes.length);
    assert.ok(placed.nodes.every((n) => n.x >= XB.GEO.grid && n.y >= XB.GEO.grid && n.x <= XB.GEO.max && n.y <= XB.GEO.max));
    assert.equal(RC.diagnose(p, placed).ok, true);
  }
});

test('T008 · «Colocar por niveles» con un ciclo, nodos sueltos y sin actividades: todo colocado, sin repetir sitio', () => {
  const net = { nodes: [{ id: '_S', x: 60, y: 60 }, { id: 'A', x: 60, y: 60 }, { id: 'B', x: 60, y: 60 }, { id: 'C', x: 60, y: 60 }, { id: 'D', x: 60, y: 60 }, { id: '_E', x: 60, y: 60 }],
    arcs: [{ from: '_S', to: 'A' }, { from: 'A', to: 'B' }, { from: 'B', to: 'C' }, { from: 'C', to: 'B' }, { from: 'C', to: '_E' }] };
  const placed = XB.placeLevels(net);
  assert.deepEqual(arcSet(placed), arcSet(net));
  assert.equal(new Set(placed.nodes.map((n) => `${n.x},${n.y}`)).size, placed.nodes.length);
  const at = Object.fromEntries(placed.nodes.map((n) => [n.id, n]));
  assert.ok(at._S.x < at.A.x && at.A.x < at.B.x && at.B.x < at.C.x && at.C.x < at._E.x);
  const empty = XB.placeLevels(XB.start());
  assert.ok(empty.nodes[0].x < empty.nodes[1].x);
});

test('T008 · AC2–AC4: cada problema de roycheck tiene su marca (número y trazo) y su texto en los dos idiomas', () => {
  // Ejercicio 6 sin D: falta F → I, sobra C → F, K → H al revés (el caso a mano de T002), J → I al revés y en un ciclo,
  // Inicio hacia una actividad con predecesoras, una actividad que no es final unida a Fin y K sin unir a Fin.
  const good = RC.fromTable(ej6);
  const net = { nodes: good.nodes.filter((n) => n.id !== 'D'),
    arcs: good.arcs.filter((e) => !(e.from === 'F' && e.to === 'I') && !(e.from === 'H' && e.to === 'K') && e.to !== '_E' && e.from !== 'D' && e.to !== 'D')
      .concat([{ from: 'C', to: 'F' }, { from: 'K', to: 'H' }, { from: 'J', to: 'I' }, { from: '_S', to: 'G' }, { from: 'A', to: '_E' }]) };
  const r = RC.diagnose(ej6, net);
  const codes = new Set(r.issues.map((i) => i.code));
  for (const c of ['missingNode', 'cycle', 'inverted', 'missingPrecedence', 'falsePrecedence', 'startLink', 'endLink']) assert.ok(codes.has(c), c);
  const mk = XB.marks(ej6, r);
  r.issues.forEach((i, k) => {
    const n = k + 1;
    const all = [...Object.values(mk.arcs), ...Object.values(mk.nodes), ...Object.values(mk.chips), ...mk.ghosts];
    assert.ok(all.some((m) => m.n === n && m.kind === 'bad'), `${i.code}: marca ${n}`);
    for (const lang of ['es', 'en']) {
      const text = XB.issueText(i, ej6, lang);
      assert.ok(text && !text.startsWith('xb.') && !/\{\w+\}/.test(text), `${lang} ${i.code}: ${text}`);
    }
  });
  assert.ok(mk.chips.D, 'la actividad que falta, en su ficha');
  for (const w of r.warnings) assert.equal(mk.arcs[`${w.ids[0]}>${w.ids[1]}`].kind, 'warn');
  assert.equal(XB.issueText({ code: 'startMissing', ids: [] }, ej6, 'es'), 'Inicio no está unido a nada.');
  assert.equal(XB.issueText({ code: 'invalidArc', ids: ['A', '_S'] }, ej6, 'en'), 'Impossible arc: A → Start.');
  assert.equal(XB.issueText({ code: 'cycle', ids: [], nodes: ['B', 'C', 'D'] }, ej6, 'es'), 'Ciclo: B, C y D acaban esperándose a sí mismas.');
  assert.equal(XB.warnText({ code: 'redundant', ids: ['A', 'C'], path: ['A', 'B', 'C'] }, 'es'), 'El arco A → C ya lo implica A → B → C: sobra, pero no resta.');
  assert.deepEqual(XB.marks(ej6, null), { arcs: {}, nodes: {}, ghosts: [], chips: {} });
  // Inicio y Fin sin ningún arco: la marca va en el nodo.
  const bare = RC.diagnose(ej6, { nodes: good.nodes, arcs: good.arcs.filter((e) => e.from !== '_S' && e.to !== '_E') });
  const mb = XB.marks(ej6, bare);
  assert.ok(mb.nodes._S && mb.nodes._E);
});

test('T008 · AC22: la nota en palabras (aciertos, arcos falsos y el tope del ciclo) y con coma decimal en español', () => {
  const good = RC.fromTable(ej6);
  const r0 = RC.diagnose(ej6, good);
  assert.equal(XB.scoreText(r0, 'es'), '100 %');
  assert.equal(XB.gradeText(r0, 'es'), `Aciertos: ${r0.counts.hits} de ${r0.counts.total} (precedencias inmediatas y uniones con Inicio y Fin), sin arcos falsos: 100 %.`);
  const one = RC.diagnose(ej6, { nodes: good.nodes, arcs: good.arcs.concat([{ from: 'C', to: 'F' }]) });
  assert.equal(one.counts.falseArcs, 1);
  assert.match(XB.gradeText(one, 'en'), /minus 1 false arc: [\d.]+ %\.$/);
  const two = RC.diagnose(ej6, { nodes: good.nodes, arcs: good.arcs.concat([{ from: 'C', to: 'F' }, { from: 'B', to: 'D' }]) });
  const raw = Math.round(1000 * (two.counts.hits - 2) / two.counts.total) / 10;
  assert.equal(XB.gradeText(two, 'es'), `Aciertos: ${two.counts.hits} de ${two.counts.total} (precedencias inmediatas y uniones con Inicio y Fin) menos 2 arcos falsos: ${String(raw).replace('.', ',')} %.`);
  assert.equal(XB.scoreText(two, 'es'), `${String(Math.round(RC.score(two) * 10) / 10).replace('.', ',')} %`);
  const cyc = RC.diagnose(ej6, { nodes: good.nodes, arcs: good.arcs.concat([{ from: 'K', to: 'H' }]) });
  assert.ok(cyc.counts.cycle);
  assert.ok(XB.gradeText(cyc, 'es').endsWith(I.t('es', 'xb.grade.cycle')));
  assert.ok(RC.score(cyc) <= 50);
});

test('T008 · ex: el tipo de ejercicio y lo que se pierde al cambiar (respuestas, red ROY, red PERT o marcas)', () => {
  const s = (extra) => Object.assign(U.defaults(), { v: 'ex', ex: null, sd: 14844, lv: 'medium' }, extra);
  assert.equal(X.kindOf(s({})), 'calc');
  assert.equal(X.kindOf(s({ xk: 'roy' })), 'roy');
  assert.equal(X.kindOf(s({ xk: 'zz' })), 'calc');
  assert.deepEqual(X.KINDS, ['calc', 'roy', 'pert', 'det']);
  assert.deepEqual(Object.keys(X.kindReady).filter((k) => X.kindReady[k]), ['calc', 'roy', 'pert', 'det'], 'T008, T010 y T011: los cuatro tipos');
  assert.equal(X.buildPublic, false, 'oculto hasta T014');
  assert.equal(X.hasWork(s({ xk: 'roy', rn: null })), false);
  assert.equal(X.hasWork(s({ xk: 'roy', rn: XB.start() })), false);
  assert.equal(X.hasWork(s({ xk: 'roy', rn: { nodes: XB.start().nodes.concat([{ id: 'A', x: 100, y: 100 }]), arcs: [] } })), true);
  assert.equal(X.hasWork(s({ xk: 'pert', sn: { events: [], arcs: [], dummies: [] } })), true);
  assert.equal(X.hasWork(s({ xk: 'det', dm: [{ el: 'A', type: 'royMissing' }] })), true);
  assert.equal(X.hasWork(s({ xk: 'det', dm: null })), false);
  assert.equal(X.hasWork(s({ ans: { act: { A: { ES: '0' } } } })), true);
  // Con xk=roy el modelo es el de la misma tabla y, entregado, sin la corrección del cálculo.
  const m = X.model(s({ xk: 'roy', xm: 'exam', xd: 1 }), 'es');
  assert.equal(m.kind, 'roy');
  assert.deepEqual(m.rows, X.model(s({}), 'es').rows);
  assert.equal(m.grading, null);
});

test('T010 · pertGradeText: mínimo, ficticias de más (con el suelo de 80), incorrecta y sin mínimo exacto', () => {
  const I = require('../js/i18n.js');
  const ok = (dummies, value, exact = true) => ({ correct: true, dummies, extra: dummies - value, min: { value, lower: value, exact } });
  assert.equal(XB.pertGradeText(ok(3, 3), null, 'es'), I.t('es', 'xb.pert.min', { min: 3 }));
  assert.equal(XB.pertGradeText(ok(4, 3), null, 'en'), I.t('en', 'xb.pert.extra', { k: 4, e: 1, min: 3, pct: 95 }));
  assert.equal(XB.pertGradeText(ok(7, 3), null, 'es'), I.t('es', 'xb.pert.extra', { k: 7, e: 4, min: 3, pct: 80 }));
  assert.equal(XB.pertGradeText(ok(8, 3), null, 'es'), I.t('es', 'xb.pert.extraFloor', { k: 8, e: 5, min: 3 }));
  assert.equal(XB.pertGradeText(ok(2, 2, false), null, 'es'), `${I.t('es', 'xb.pert.min', { min: 2 })} ${I.t('es', 'xb.pert.notExact', { min: 2 })}`);
  assert.equal(XB.pertGradeText({ correct: false }, { hits: 11, total: 14 }, 'es'), I.t('es', 'xb.pert.wrong', { hits: 11, total: 14, pct: '60' }));
  assert.equal(XB.pertGradeText({ correct: false }, { hits: 5, total: 14 }, 'es'), I.t('es', 'xb.pert.wrong', { hits: 5, total: 14, pct: '35,7' }));
  assert.equal(XB.pertGradeText({ correct: false }, { hits: 5, total: 14 }, 'en'), I.t('en', 'xb.pert.wrong', { hits: 5, total: 14, pct: '35.7' }));
});
