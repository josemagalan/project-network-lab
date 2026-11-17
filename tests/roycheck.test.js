'use strict';
// core/roycheck — corrección y nota de la red ROY del alumno y nota de la red PERT (spec f3d-construir-detectar,
// AC1–AC4, AC7 y AC22; plan §0 y §3, P3, A1, H3, H4 y H8).
// Ejemplos de referencia: el Ejercicio 6 de los apuntes (J. M. Galán, Gestión de Proyectos, UBU, Tema 6a y hoja de
// ejercicios del Tema 6, ejercicio 6) y los ejemplos ROY de 10 y de 6 actividades del Tema 6b.
// Oráculo: core/precheck.diagnose (F2c), independiente, en las redes sin ciclos; fuerza bruta (Floyd–Warshall) en las demás.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const P = require('../js/core/project.js');
const E = require('../js/core/examples.js');
const G = require('../js/core/generator.js');
const R = require('../js/core/rng.js');
const PC = require('../js/core/precheck.js');
const A = require('../js/core/aoa.js');
const M = require('../js/core/mindummy.js');
const RT = require('../js/reto.js');
const RC = require('../js/core/roycheck.js');

const S = '_S'; const F = '_E';
const load = (id) => { const ex = E.get(id); return P.parse(ex.rows, ex.mode).project; };
const p6 = load('ej6');
const byId = (a, b) => a.localeCompare(b, 'en', { numeric: true });
const clone = (net) => ({ nodes: net.nodes.map((n) => Object.assign({}, n)), arcs: net.arcs.map((a) => Object.assign({}, a)) });
const has = (net, f, t) => net.arcs.some((a) => a.from === f && a.to === t);
const without = (net, f, t) => ({ nodes: net.nodes, arcs: net.arcs.filter((a) => !(a.from === f && a.to === t)) });
const plus = (net, f, t) => ({ nodes: net.nodes, arcs: [...net.arcs, { from: f, to: t }] });

// 1000 tablas del generador de la F3a (334, 333 y 333 por nivel).
const TABLES = [];
for (const [lv, n] of [['easy', 334], ['medium', 333], ['hard', 333]]) {
  for (let s = 1, k = 0; k < n; s++) {
    const g = G.generate(s, G.LEVELS[lv]);
    if (g.ok) { TABLES.push(P.parse(g.rows, g.mode).project); k++; }
  }
}

test('T002 · fromTable da Inicio, Fin y los arcos de la tabla (la red de la F1)', () => {
  const net = RC.fromTable(p6);
  assert.deepEqual(net.nodes.map((n) => n.id), [S, ...p6.activities.map((a) => a.id), F]);
  assert.ok(net.nodes.every((n) => n.x === undefined && n.y === undefined), 'sin posiciones');
  for (const a of p6.activities) for (const q of p6.preds[a.id]) assert.ok(has(net, q, a.id), `${q}>${a.id}`);
  for (const a of ['A', 'B', 'C', 'D']) assert.ok(has(net, S, a), `Inicio>${a}`);
  assert.ok(has(net, 'K', F));
  assert.equal(net.arcs.length, 14 + 4 + 1);
});

test('T002 · AC1: la red de la F1 de los ejemplos de referencia es correcta, sin avisos, con nota 100', () => {
  for (const id of ['ej6', 'roy10', 'roy6']) {
    const p = load(id);
    const r = RC.diagnose(p, RC.fromTable(p));
    assert.equal(r.ok, true, id);
    assert.deepEqual(r.issues, [], id);
    assert.deepEqual(r.warnings, [], id);
    assert.equal(RC.score(r), 100, id);
  }
});

test('T002 · AC1: la red de la F1 de 1000 tablas generadas es correcta, sin avisos, con nota 100', () => {
  assert.equal(TABLES.length, 1000);
  for (const p of TABLES) {
    const r = RC.diagnose(p, RC.fromTable(p));
    assert.ok(r.ok && !r.warnings.length && RC.score(r) === 100);
  }
});

test('T002 · AC2: un arco redundante da un aviso con su camino y no cambia la nota', () => {
  const net = plus(RC.fromTable(p6), 'B', 'I');   // B → F → I ya lo implica (y B → E → I)
  const r = RC.diagnose(p6, net);
  assert.equal(r.ok, true);
  assert.deepEqual(r.warnings, [{ code: 'redundant', ids: ['B', 'I'], path: ['B', 'E', 'I'] }]);
  assert.equal(RC.score(r), 100);
});

test('T002 · AC3 y AC22: Ejercicio 6 con un arco quitado, uno falso y uno al revés (comprobado a mano)', () => {
  // Sin F → I (inmediata: F solo llega a I por ese arco), con C → F (C no va antes de F) y con K → H en vez de H → K.
  let net = without(RC.fromTable(p6), 'F', 'I');
  net = plus(without(net, 'H', 'K'), 'K', 'H');
  net = plus(net, 'C', 'F');
  const r = RC.diagnose(p6, net);
  assert.equal(r.ok, false);
  assert.deepEqual(r.issues, [
    { code: 'inverted', ids: ['H', 'K'] },
    { code: 'missingPrecedence', ids: ['F', 'I'] },
    { code: 'falsePrecedence', ids: ['C', 'F'] },
  ]);
  // Con K → H, el alumno ya implica E → H por E → I → J → K → H: su arco E → H queda redundante (aviso).
  assert.deepEqual(r.warnings, [{ code: 'redundant', ids: ['E', 'H'], path: ['E', 'I', 'J', 'K', 'H'] }]);
  // 14 inmediatas + 4 iniciales + 1 final = 19; aciertos 12 + 4 + 1 = 17; arcos falsos 1 (C → F). K → H, al revés, ya
  // pierde el acierto de H → K y no resta otra vez (decisión del autor en la revisión de T018, N-F11; antes, 2 y 15/19).
  assert.deepEqual(r.counts, { hits: 17, total: 19, falseArcs: 1, cycle: false });
  assert.ok(Math.abs(RC.score(r) - 100 * 16 / 19) < 1e-9);
});

test('T002 · AC3 y AC22: un arco al revés que cierra un ciclo lo nombra con sus nodos y la nota no pasa del 50 %', () => {
  const net = plus(RC.fromTable(p6), 'K', 'D');   // D → K y K → D
  const r = RC.diagnose(p6, net);
  assert.deepEqual(r.issues.find((i) => i.code === 'cycle'), { code: 'cycle', ids: [], nodes: ['D', 'K'] });
  assert.deepEqual(r.issues.find((i) => i.code === 'inverted'), { code: 'inverted', ids: ['D', 'K'] });
  assert.equal(r.counts.cycle, true);
  assert.ok(100 * (r.counts.hits - r.counts.falseArcs) / r.counts.total > 50, 'sin el tope pasaría del 50 %');
  assert.equal(RC.score(r), 50);
  // Un ciclo más largo: I → J → … y J → E cierra E → I → J → E.
  const r2 = RC.diagnose(p6, plus(RC.fromTable(p6), 'J', 'E'));
  assert.deepEqual(r2.issues.find((i) => i.code === 'cycle').nodes, ['E', 'I', 'J']);
  assert.deepEqual(r2.issues.find((i) => i.code === 'falsePrecedence'), { code: 'falsePrecedence', ids: ['J', 'E'] });
  assert.equal(RC.score(r2), 50);
});

test('T002 · AC22: una actividad que falta no cuenta en sus precedencias; la nota nunca es negativa', () => {
  const net = RC.fromTable(p6);
  const noI = { nodes: net.nodes.filter((n) => n.id !== 'I'), arcs: net.arcs.filter((a) => a.from !== 'I' && a.to !== 'I') };
  const r = RC.diagnose(p6, noI);
  // Sin el nodo I faltan E → I, F → I, G → I e I → J; solo se dice que falta la actividad.
  assert.deepEqual(r.issues, [{ code: 'missingNode', ids: ['I'] }]);
  assert.deepEqual(r.counts, { hits: 19 - 4, total: 19, falseArcs: 0, cycle: false });
  // Muchos arcos falsos: 0, no menos.
  let bad = { nodes: net.nodes, arcs: net.arcs.filter((a) => a.from === S || a.to === F) };
  for (const [x, y] of [['A', 'B'], ['A', 'C'], ['A', 'D'], ['B', 'C'], ['B', 'D'], ['C', 'D'], ['K', 'A'], ['K', 'B']]) bad = plus(bad, x, y);
  const r2 = RC.diagnose(p6, bad);
  assert.ok(r2.counts.falseArcs > r2.counts.hits);
  assert.equal(RC.score(r2), 0);
});

test('T002 · AC4: Inicio y Fin mal unidos, que faltan y arcos imposibles', () => {
  const net = RC.fromTable(p6);
  let r = RC.diagnose(p6, without(net, S, 'C'));
  assert.deepEqual(r.issues, [{ code: 'startLink', ids: ['C'] }]);
  assert.equal(r.counts.hits, 18);
  r = RC.diagnose(p6, plus(net, S, 'E'));
  assert.deepEqual(r.issues, [{ code: 'startLink', ids: ['E'] }]);
  assert.deepEqual([r.counts.hits, r.counts.falseArcs], [19, 1]);
  r = RC.diagnose(p6, without(net, 'K', F));
  assert.deepEqual(r.issues, [{ code: 'endMissing', ids: [] }]);
  r = RC.diagnose(p6, plus(net, 'J', F));
  assert.deepEqual(r.issues, [{ code: 'endLink', ids: ['J'] }]);
  const noStart = { nodes: net.nodes, arcs: net.arcs.filter((a) => a.from !== S) };
  r = RC.diagnose(p6, noStart);
  assert.deepEqual(r.issues, [{ code: 'startMissing', ids: [] }], 'startMissing sustituye a las uniones que faltan');
  assert.equal(r.counts.hits, 15);
  // Sin nodo de Inicio (una red de la URL dañada): lo mismo.
  r = RC.diagnose(p6, { nodes: net.nodes.filter((n) => n.id !== S), arcs: noStart.arcs });
  assert.deepEqual(r.issues, [{ code: 'startMissing', ids: [] }]);
  // Arcos hacia Inicio, desde Fin o de Inicio a Fin: imposibles; se dicen y cuentan como falsos.
  r = RC.diagnose(p6, plus(plus(plus(net, 'A', S), F, 'B'), S, F));
  assert.deepEqual(r.issues, [
    { code: 'invalidArc', ids: ['A', S] }, { code: 'invalidArc', ids: [F, 'B'] }, { code: 'invalidArc', ids: [S, F] },
  ].sort((u, v) => byId(u.ids.join(','), v.ids.join(','))));
  assert.equal(r.counts.falseArcs, 3);
});

// ---------- oráculo ----------
function asProject(net) {
  const ids = net.nodes.map((n) => n.id).filter((id) => id !== S && id !== F);
  const preds = Object.fromEntries(ids.map((id) => [id, []])); const succs = Object.fromEntries(ids.map((id) => [id, []]));
  for (const a of net.arcs) if (preds[a.to] && succs[a.from]) { preds[a.to].push(a.from); succs[a.from].push(a.to); }
  return { activities: ids.map((id) => ({ id })), preds, succs };
}
function reachAll(net) {               // Floyd–Warshall sobre todos los nodos del alumno
  const ids = net.nodes.map((n) => n.id); const k = new Map(ids.map((id, i) => [id, i]));
  const m = ids.map(() => ids.map(() => false));
  for (const a of net.arcs) if (k.has(a.from) && k.has(a.to)) m[k.get(a.from)][k.get(a.to)] = true;
  for (let z = 0; z < ids.length; z++) for (let i = 0; i < ids.length; i++) if (m[i][z]) for (let j = 0; j < ids.length; j++) if (m[z][j]) m[i][j] = true;
  return (x, y) => k.has(x) && k.has(y) && m[k.get(x)][k.get(y)];
}
function perturb(r, p, net0) {
  let net = clone(net0);
  const acts = p.activities.map((a) => a.id);
  const actArcs = () => net.arcs.filter((a) => a.from !== S && a.to !== F);
  const ops = 1 + R.int(r, 0, 2);
  for (let k = 0; k < ops; k++) {
    const op = R.int(r, 0, 9);
    const aa = actArcs();
    if (op <= 2 && aa.length) { const e = aa[R.int(r, 0, aa.length - 1)]; net = without(net, e.from, e.to); }
    else if (op <= 5) {
      const x = acts[R.int(r, 0, acts.length - 1)]; const y = acts[R.int(r, 0, acts.length - 1)];
      if (x !== y && !has(net, x, y) && net.nodes.some((n) => n.id === x) && net.nodes.some((n) => n.id === y)) net = plus(net, x, y);
    } else if (op <= 7 && aa.length) {
      const e = aa[R.int(r, 0, aa.length - 1)]; net = without(net, e.from, e.to);
      if (!has(net, e.to, e.from)) net = plus(net, e.to, e.from);
    } else if (op === 8) {
      const x = acts[R.int(r, 0, acts.length - 1)];
      net = { nodes: net.nodes.filter((n) => n.id !== x), arcs: net.arcs.filter((a) => a.from !== x && a.to !== x) };
    } else {
      const se = net.arcs.filter((a) => a.from === S || a.to === F);
      if (se.length && R.int(r, 0, 1)) { const e = se[R.int(r, 0, se.length - 1)]; net = without(net, e.from, e.to); }
      else { const x = acts[R.int(r, 0, acts.length - 1)]; if (net.nodes.some((n) => n.id === x) && !has(net, S, x)) net = plus(net, S, x); }
    }
  }
  return net;
}
const key = (i) => `${i.code}:${i.ids.join(',')}`;

test('T002 · AC3: 3000 redes perturbadas al azar frente al oráculo (precheck sin ciclos; fuerza bruta con ellos)', () => {
  const r = R.mulberry32(20261116);
  let acyclic = 0; let cyclic = 0;
  for (const p of TABLES) {
    const { direct, reach } = A._reduce(p);
    const base = RC.fromTable(p);
    for (let k = 0; k < 3; k++) {
      const net = perturb(r, p, base);
      const res = RC.diagnose(p, net);
      const present = new Set(net.nodes.map((n) => n.id));
      const reachS = reachAll(net);
      const acts = p.activities.map((a) => a.id);
      const inCycle = acts.filter((x) => present.has(x) && acts.some((y) => y !== x && reachS(x, y) && reachS(y, x)));
      // Inicio y Fin, por fuerza bruta (solo con los nodos que están).
      const starts = acts.filter((a) => !p.preds[a].length); const ends = acts.filter((a) => !p.succs[a].length);
      const exp = [];
      if (!net.arcs.some((a) => a.from === S)) exp.push('startMissing:');
      else {
        for (const a of starts) if (present.has(a) && !has(net, S, a)) exp.push(`startLink:${a}`);
        for (const e of net.arcs) if (e.from === S && e.to !== F && !starts.includes(e.to)) exp.push(`startLink:${e.to}`);
      }
      if (!net.arcs.some((a) => a.to === F)) exp.push('endMissing:');
      else {
        for (const a of ends) if (present.has(a) && !has(net, a, F)) exp.push(`endLink:${a}`);
        for (const e of net.arcs) if (e.to === F && e.from !== S && !ends.includes(e.from)) exp.push(`endLink:${e.from}`);
      }
      const got = res.issues.filter((i) => /^(start|end)/.test(i.code)).map(key);
      assert.deepEqual(got.sort(), exp.sort(), 'Inicio y Fin');
      if (!inCycle.length) {
        acyclic++;
        const ref = PC.diagnose(p, { project: asProject(net), report: { errors: [] } }, null);
        const want = ref.issues.map((i) => (i.code === 'missingActivity' ? `missingNode:${i.ref.join(',')}` : key(i)));
        const mine = res.issues.filter((i) => !/^(start|end)/.test(i.code)).map(key);
        assert.deepEqual(mine.sort(), want.sort(), 'issues frente a precheck');
        assert.deepEqual(res.warnings, ref.warnings, 'avisos frente a precheck');
        assert.equal(res.counts.cycle, false);
      } else {
        cyclic++;
        const groups = res.issues.filter((i) => i.code === 'cycle').map((i) => i.nodes);
        assert.deepEqual(groups.flat().sort(byId), inCycle.sort(byId), 'nodos de los ciclos');
        for (const g of groups) for (const x of g) for (const y of g) assert.ok(reachS(x, y) || x === y, 'un grupo es un ciclo');
        assert.equal(res.counts.cycle, true);
        assert.ok(RC.score(res) <= 50);
        // Precedencias por fuerza bruta: inmediatas que faltan (salvo la del arco al revés) y arcos fuera del cierre.
        const want = [];
        for (const e of net.arcs) {
          if (e.from === S || e.to === F || !present.has(e.from) || !present.has(e.to)) continue;
          if (reach[e.from].has(e.to)) continue;
          want.push(direct[e.to].includes(e.from) ? `inverted:${e.to},${e.from}` : `falsePrecedence:${e.from},${e.to}`);
        }
        for (const a of acts) for (const b of direct[a]) {
          if (!present.has(a) || !present.has(b) || reachS(a, b) || has(net, b, a)) continue;
          want.push(`missingPrecedence:${a},${b}`);
        }
        const mine = res.issues.filter((i) => /^(inverted|missingPrecedence|falsePrecedence)$/.test(i.code)).map(key);
        assert.deepEqual(mine.sort(), want.sort(), 'precedencias por fuerza bruta');
      }
      // Recuento de la nota por fuerza bruta.
      let hits = 0; let total = 0;
      for (const a of acts) for (const b of direct[a]) { total++; if (present.has(a) && present.has(b) && reachS(a, b)) hits++; }
      const sOk = net.arcs.some((e) => e.from === S); const eOk = net.arcs.some((e) => e.to === F);
      for (const a of starts) { total++; if (sOk && present.has(a) && has(net, S, a)) hits++; }
      for (const a of ends) { total++; if (eOk && present.has(a) && has(net, a, F)) hits++; }
      assert.deepEqual([res.counts.hits, res.counts.total], [hits, total], 'aciertos y total');
    }
  }
  assert.ok(acyclic > 1000 && cyclic > 300, `${acyclic} sin ciclo y ${cyclic} con ciclo`);
});

test('T002 · H8: roycheck no carga precheck (está en el grupo m0) y no usa Math.random', () => {
  const src = fs.readFileSync(path.join(__dirname, '../js/core/roycheck.js'), 'utf8');
  assert.ok(!/precheck/.test(src.replace(/\/\/.*|\/\*[\s\S]*?\*\//g, '')));
  assert.ok(!/Math\.random/.test(src));
});

// ---------- nota PERT (A1, H3, H4) ----------
function fromAoa(net, p) {
  let s = RT.start(p); const id = new Map();
  for (const ev of net.events) { s = RT.apply(s, { type: 'addEvent', x: ev.n * 10, y: 5 }); id.set(ev.n, s.net.events[s.net.events.length - 1].id); }
  for (const ev of net.events) s = RT.apply(s, { type: 'number', id: id.get(ev.n), n: ev.n });
  for (const a of net.arcs) s = RT.apply(s, { type: 'arc', act: a.act, from: id.get(a.from), to: id.get(a.to) });
  for (const d of net.dummies) s = RT.apply(s, { type: 'addDummy', from: id.get(d.from), to: id.get(d.to) });
  return { s, id };
}
const min6 = M.solve(p6);

test('T002 · AC7 y AC22: PERT correcta, 80 + 20 en el mínimo y máx(80, 100 − 5k) por encima', () => {
  assert.equal(min6.exact, true);
  const { s, id } = fromAoa(min6.net, p6);
  const ok = RT.check(s, p6, min6);
  assert.equal(ok.result.correct, true);
  assert.equal(RC.scorePert(ok.net, p6, ok.result), 100);
  const first = id.get(1); const last = id.get(Math.max(...min6.net.events.map((e) => e.n)));
  let t = s;
  for (const [k, want] of [[1, 95], [2, 90], [4, 80], [5, 80], [6, 80]]) {
    while (t.net.dummies.length < min6.value + k) t = RT.apply(t, { type: 'addDummy', from: first, to: last });
    const c = RT.check(t, p6, min6);
    assert.equal(c.result.correct, true, `k = ${k}`);
    assert.equal(c.result.extra, k);
    assert.equal(RC.scorePert(c.net, p6, c.result), want, `k = ${k}`);
  }
});

test('T002 · H3: sin mínimo exacto, el mejor conocido; sin mínimo todavía, 100 a una red correcta', () => {
  const rules = A.build(p6, { method: 'rules' });
  const { s } = fromAoa(rules, p6);
  const k = rules.dummies.length;
  const c = RT.check(s, p6, { value: k - 1, lower: k - 2, exact: false });
  assert.equal(c.result.correct, true);
  assert.equal(RC.scorePert(c.net, p6, c.result), 95);
  const better = RT.check(s, p6, { value: k + 1, lower: 1, exact: false });
  assert.equal(RC.scorePert(better.net, p6, better.result), 100, 'bajar el mejor conocido');
  const none = RT.check(s, p6, null);
  assert.equal(RC.scorePert(none.net, p6, none.result), 100);
});

test('T002 · AC22 y H4: PERT incorrecta, precedencias inmediatas representadas hasta el 60 %, con arcos sin colocar y con ciclos', () => {
  const { s, id } = fromAoa(min6.net, p6);
  // Sin colocar I, J y K: quedan 7 de las 14 inmediatas (las de E, F, G y H).
  let t = s;
  for (const act of ['I', 'J', 'K']) t = RT.apply(t, { type: 'arc', act, from: null, to: null });
  let c = RT.check(t, p6, min6);
  assert.equal(c.result.correct, false);
  assert.equal(RC.scorePert(c.net, p6, c.result), 50);
  // Solo sin K: 11 de 14 → 78,6 %, que se queda en 60.
  t = RT.apply(s, { type: 'arc', act: 'K', from: null, to: null });
  c = RT.check(t, p6, min6);
  assert.equal(RC.scorePert(c.net, p6, c.result), 60);
  // Una ficticia del final al principio cierra un ciclo: aoacheck se para, pero la cuenta sigue (todas representadas).
  const last = id.get(Math.max(...min6.net.events.map((e) => e.n)));
  t = RT.apply(s, { type: 'addDummy', from: last, to: id.get(1) });
  c = RT.check(t, p6, min6);
  assert.ok(c.result.problems.some((x) => x.code === 'cycle'));
  assert.equal(RC.scorePert(c.net, p6, c.result), 60);
});

test('T010 · pertHits: las precedencias inmediatas representadas que cuenta scorePert, sin el tope del 60 %', () => {
  const { s, id } = fromAoa(min6.net, p6);
  assert.deepEqual(RC.pertHits(s.net, p6), { hits: 14, total: 14 });
  let t = s;
  for (const act of ['I', 'J', 'K']) t = RT.apply(t, { type: 'arc', act, from: null, to: null });
  assert.deepEqual(RC.pertHits(t.net, p6), { hits: 7, total: 14 });
  t = RT.apply(s, { type: 'arc', act: 'K', from: null, to: null });
  assert.deepEqual(RC.pertHits(t.net, p6), { hits: 11, total: 14 });
  const c = RT.check(t, p6, min6);
  assert.equal(RC.scorePert(c.net, p6, c.result), Math.min(60, 100 * 11 / 14));
  // Con un ciclo la cuenta sigue: todas representadas.
  const last = id.get(Math.max(...min6.net.events.map((e) => e.n)));
  t = RT.apply(s, { type: 'addDummy', from: last, to: id.get(1) });
  assert.deepEqual(RC.pertHits(t.net, p6), { hits: 14, total: 14 });
});

// ---------- revisión de nivel 2 (T018) ----------

test('T018 · N-F11: un arco al revés resta una sola vez, como quitar el arco o añadir uno falso', () => {
  const good = RC.fromTable(p6);
  const rev = RC.diagnose(p6, plus(without(good, 'H', 'K'), 'K', 'H'));
  const cut = RC.diagnose(p6, without(good, 'H', 'K'));
  const extra = RC.diagnose(p6, plus(good, 'C', 'F'));
  assert.deepEqual(rev.issues.map((i) => i.code), ['inverted']);
  assert.equal(rev.counts.falseArcs, 0);
  for (const r of [rev, cut, extra]) assert.ok(Math.abs(RC.score(r) - 100 * 18 / 19) < 1e-9, JSON.stringify(r.counts));
});

test('T018 · N-F4: una unión de más con Fin resta como una de más con Inicio', () => {
  const good = RC.fromTable(p6);
  const extraEnd = good.nodes.map((n) => n.id).find((a) => a !== S && a !== F && p6.succs[a].length);
  const r = RC.diagnose(p6, plus(good, extraEnd, F));
  assert.deepEqual(r.issues, [{ code: 'endLink', ids: [extraEnd] }]);
  assert.deepEqual([r.counts.hits, r.counts.total, r.counts.falseArcs], [19, 19, 1]);
  assert.ok(Math.abs(RC.score(r) - 100 * 18 / 19) < 1e-9);
});

test('T018 · N-F8: un arco de un nodo a sí mismo es imposible y resta; uno repetido cuenta una vez', () => {
  const good = RC.fromTable(p6);
  let r = RC.diagnose(p6, plus(good, 'A', 'A'));
  assert.deepEqual(r.issues, [{ code: 'invalidArc', ids: ['A', 'A'] }]);
  assert.equal(r.counts.falseArcs, 1);
  assert.equal(r.counts.cycle, false);
  r = RC.diagnose(p6, plus(plus(good, 'C', 'F'), 'C', 'F'));
  assert.deepEqual(r.issues, [{ code: 'falsePrecedence', ids: ['C', 'F'] }]);
  assert.equal(r.counts.falseArcs, 1, 'el repetido no resta dos veces');
  r = RC.diagnose(p6, plus(good, 'A', 'ZZ'));
  assert.deepEqual(r.issues, [{ code: 'invalidArc', ids: ['A', 'ZZ'] }]);
});

test('T018 · I-F1: rawScore, pertExtraPct y pertWrongPct son las partes de score y scorePert', () => {
  const only = { nodes: RC.fromTable(p6).nodes, arcs: [{ from: S, to: F }] };
  const r = RC.diagnose(p6, only);
  assert.equal(r.counts.hits, 0);
  assert.ok(r.counts.falseArcs >= 1);
  assert.equal(RC.rawScore(r), 0, 'sin bajar de 0');
  const cyc = RC.diagnose(p6, plus(RC.fromTable(p6), 'H', 'A'));
  assert.ok(RC.rawScore(cyc) > 50 && RC.score(cyc) === 50);
  assert.deepEqual([0, 1, 4, 5, 6].map(RC.pertExtraPct), [100, 95, 80, 75, 70]);
  assert.equal(RC.pertWrongPct({ hits: 9, total: 10 }), 60);
  assert.equal(RC.pertWrongPct({ hits: 3, total: 10 }), 30);
  assert.equal(RC.pertWrongPct({ hits: 0, total: 0 }), 60);
});
