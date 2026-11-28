'use strict';
// core/resource: recursos (spec f5c-recursos, AC1, AC3 y AC8; plan §0, §3, P1, P2; T003).
// Las cifras de referencia vienen de la tabla de la spec, calculadas aparte en spikes/f5c-recursos/ (rc.js, refs.js):
// T. Klastorin (2010), Gestión de proyectos, Profit Editorial, cap. 8, figuras 8.1–8.10, y J. M. Nicholas y H. Steyn
// (2012), Project Management for Engineering, Business and Technology, 4.ª ed., cap. 6 (tablas 6.3 y 6.5, figuras
// 6.23–6.29, problema 22) y cap. 7 (§7.5, figura 7.23). Los oráculos de las propiedades están en este archivo.
const test = require('node:test');
const assert = require('node:assert/strict');
const K = require('../js/core/resource.js');
const X = require('../js/core/resex.js');
const C = require('../js/core/cpm.js');
const R = require('../js/core/rng.js');

const row = (id, links, d, ...use) => ({ id, links, d: String(d), r1: use[0] == null ? '' : String(use[0]), r2: use[1] == null ? '' : String(use[1]), r3: use[2] == null ? '' : String(use[2]) });
const res = (...caps) => caps.map((c, k) => ({ name: `R${k + 1}`, cap: c == null ? '' : String(c) }));
const exRes = (ex) => ex.res.map((r) => ({ name: r.name.es, cap: r.cap == null ? '' : String(r.cap) }));
const ex = (id, mode) => { const e = X.get(id); const { project, report } = K.parse(e.rows, exRes(e), mode || e.mode); assert.deepEqual(report.errors, [], id); return project; };
const ok = (rows, rs, mode) => { const { project, report } = K.parse(rows, rs, mode || 'lev'); assert.deepEqual(report.errors, []); return project; };
const codes = (rows, rs, mode) => K.parse(rows, rs, mode || 'lev').report.errors.map((e) => e.code);
const ES = (p) => Object.fromEntries(p.activities.map((a) => [a.id, p.times[a.id].ES]));
const LS = (p) => Object.fromEntries(p.activities.map((a) => [a.id, p.times[a.id].LS]));

// Tablas al azar (semilla fija): n actividades, predecesoras entre las anteriores, duraciones de 0 a 6, usos de 0 a 6.
function randomTable(rng, n, nres) {
  const rows = [];
  for (let i = 0; i < n; i++) {
    const links = []; for (let j = Math.max(0, i - 6); j < i; j++) if (rng() < 0.3) links.push(`A${j}`);
    rows.push(row(`A${i}`, links.join(', '), R.int(rng, i % 7 === 3 ? 0 : 1, 6), ...Array.from({ length: nres }, () => R.int(rng, 0, 6))));
  }
  return rows;
}

// ---------- Lectura (P1) ----------

test('F5c T003: lectura de una tabla válida: orden, predecesoras, sucesoras, duración, usos, recursos y tiempos del CPM', () => {
  const p = ex('k81');
  assert.deepEqual(p.activities.map((a) => a.id), ['A', 'B', 'C', 'D', 'E', 'F', 'G']);
  assert.deepEqual(p.preds.G, ['D', 'E']);
  assert.deepEqual(p.succs.B, ['E', 'F']);
  assert.deepEqual(p.byId.D, { id: 'D', name: '', d: 5, r: [10] });
  assert.deepEqual(p.res, [{ name: 'Trabajadores', cap: null }]);
  assert.equal(p.T, 13);
  assert.deepEqual(p.activities.map((a) => p.times[a.id].TF), [0, 3, 1, 0, 3, 9, 0]);
});

test('F5c T003: errores por fila: duración y usos enteros de 0 a 999; uso mayor que lo disponible solo con recursos limitados', () => {
  for (const d of ['3.5', '1000', 'x', '-1', '']) assert.deepEqual(codes([row('A', '', d, 1)], res(5)), ['badDuration'], d);
  for (const u of ['2.5', '1000', 'x', '-1']) assert.deepEqual(codes([row('A', '', 3, u)], res(5)), ['badUse'], u);
  assert.deepEqual(codes([row('A', '', 3, 6)], res(5), 'lim'), ['overCap']);
  assert.deepEqual(codes([row('A', '', 3, 6)], res(5), 'lev'), []);
  assert.deepEqual(codes([row('A', '', 3, 6)], res(''), 'lim'), []);           // vacía = sin límite (analyze C5)
  const e = K.parse([row('A', '', 3, 1), row('B', 'A', 'x', 1, 9)], res(5, 8), 'lim').report.errors;
  assert.deepEqual(e.map((x) => [x.code, x.row, x.ids]), [['badDuration', 1, ['B']], ['overCap', 1, ['B']]]);
  assert.deepEqual(e[1].res, [1]);
});

test('F5c T003: disponibilidades: entero de 1 a 9999 o vacía; uno a tres recursos', () => {
  for (const c of ['0', 'x', '10000', '2.5']) assert.deepEqual(codes([row('A', '', 3, 1)], res(c), 'lim'), ['badCap'], c);
  const e = K.parse([row('A', '', 3, 1)], res(4, 'x'), 'lim').report.errors[0];
  assert.deepEqual([e.code, e.row, e.res], ['badCap', null, [1]]);
  assert.deepEqual(K.parse([row('A', '', 3, 1)], res(''), 'lim').project.res, [{ name: 'R1', cap: null }]);
  assert.throws(() => K.parse([row('A', '', 3, 1)], [], 'lev'));
  assert.throws(() => K.parse([row('A', '', 3, 1)], res(1, 1, 1, 1), 'lev'));
});

test('F5c T003: los errores de estructura de core/project, y el aviso noUse (todos los usos vacíos: valen 0)', () => {
  assert.deepEqual(codes([row('A', '', 1, 1), row('A', '', 1, 1)], res(5)), ['duplicateId']);
  assert.deepEqual(codes([row('A', 'Z', 1, 1)], res(5)), ['unknownRef']);
  assert.deepEqual(codes([row('A', 'B', 1, 1), row('B', 'A', 1, 1)], res(5)), ['cycle']);
  assert.deepEqual(codes(Array.from({ length: 31 }, (_, i) => row(`A${i}`, '', 1, 1)), res(5)), ['tooMany']);
  const { project, report } = K.parse([row('A', '', 2), row('B', 'A', 3, 1, '')], res(5, 5), 'lev');
  assert.deepEqual(report.warnings.map((w) => [w.code, w.row]), [['noUse', 0]]);
  assert.deepEqual([project.byId.A.r, project.byId.B.r], [[0, 0], [1, 0]]);
  assert.equal(K.parse([row('', '', ''), row('', '', '')], res(5), 'lev').project, null);
});

test('F5c T003: sin límite, los tiempos son los de core/cpm (los seis ejemplos y 500 tablas al azar)', () => {
  const rng = R.mulberry32(20261126);
  const tables = X.list().map((e) => [e.rows, exRes(e)]);
  for (let i = 0; i < 500; i++) tables.push([randomTable(rng, R.int(rng, 2, 12), 2), res(9, 9)]);
  for (const [rows, rs] of tables) {
    const p = ok(rows, rs);
    const s = C.solve({ activities: p.activities.map((a) => ({ id: a.id, d: a.d })), preds: p.preds, succs: p.succs });
    assert.equal(p.T, s.duration);
    for (const a of p.activities) assert.deepEqual([p.times[a.id].ES, p.times[a.id].LS, p.times[a.id].TF], [s.times[a.id].ES, s.times[a.id].LS, s.floats[a.id].TF], a.id);
  }
});

// ---------- Perfiles (P2) ----------

test('F5c T003: Klastorin, figura 8.1: perfil temprano (pico 21) y tardío (pico 16); 147 trabajadores-semana', () => {
  const p = ex('k81');
  const e = K.profile(p, ES(p), 0); const l = K.profile(p, LS(p), 0);
  assert.deepEqual(e, [10, 10, 16, 21, 16, 12, 12, 12, 8, 8, 8, 8, 6]);
  assert.deepEqual(l, [7, 7, 7, 13, 15, 16, 16, 16, 8, 8, 8, 13, 13]);
  assert.deepEqual(K.stats(e), { peak: 21, ssq: 1877, work: 147 });
  assert.deepEqual(K.stats(l), { peak: 16, ssq: 1839, work: 147 });
  assert.deepEqual([K.stats(e).peak, K.stats(l).peak], [X.get('k81').expected.peakES[0], X.get('k81').expected.peakLS[0]]);
});

test('F5c T003: Klastorin, figura 8.5: perfiles temprano y tardío (figuras 8.6 y 8.7), 101 trabajadores-semana', () => {
  const p = ex('k85');
  assert.deepEqual(K.profile(p, ES(p), 0), [8, 8, 8, 11, 14, 8, 8, 8, 7, 7, 7, 7]);
  assert.deepEqual(K.profile(p, LS(p), 0), [5, 5, 5, 11, 11, 11, 11, 14, 7, 7, 7, 7]);
  assert.equal(K.stats(K.profile(p, ES(p), 0)).work, 101);
});

test('F5c T003: Nicholas, LOGON (figura 6.23) y GUMBY (problema 22): picos del calendario temprano de cada recurso', () => {
  for (const id of ['lg', 'gb']) {
    const p = ex(id);
    assert.equal(p.T, X.get(id).expected.T);
    assert.deepEqual(p.res.map((_, k) => K.stats(K.profile(p, ES(p), k)).peak), X.get(id).expected.peakES, id);
  }
  const lg = ex('lg');
  assert.deepEqual([0, 1].map((k) => K.stats(K.profile(lg, ES(lg), k)).work), [486, 410]);
  const gb = ex('gb');
  assert.deepEqual(K.profile(gb, ES(gb), 0), [8, 8, 8, 8, 8, 8, 10, 10, 8, 8, 6, 6, 6, 6, 6, 6, 2, 2, 2, 2, 2, 2, 2, 2, 5, 5]);
  assert.deepEqual(K.profile(gb, ES(gb), 1).slice(0, 10), [3, 3, 3, 3, 3, 3, 7, 7, 6, 6]);
});

test('F5c T003: el perfil cuenta los periodos s+1 … s+d (no el de fin); un hito (d = 0) no ocupa ninguno; el trabajo no depende del calendario', () => {
  const p = ok([row('A', '', 2, 3), row('M', 'A', 0, 5), row('B', 'M', 1, 4)], res(9));
  assert.deepEqual(K.profile(p, { A: 0, M: 2, B: 2 }, 0), [3, 3, 4]);
  assert.deepEqual(K.profile(p, { A: 0, M: 2, B: 4 }, 0), [3, 3, 0, 0, 4]);
  const rng = R.mulberry32(7);
  for (let i = 0; i < 300; i++) {
    const q = ok(randomTable(rng, R.int(rng, 2, 10), 2), res(9, 9));
    const S = Object.fromEntries(q.activities.map((a) => [a.id, q.times[a.id].ES + R.int(rng, 0, q.times[a.id].TF)]));
    for (const k of [0, 1]) {
      const w = q.activities.reduce((s, a) => s + a.d * a.r[k], 0);
      assert.equal(K.stats(K.profile(q, ES(q), k)).work, w);
      assert.equal(K.stats(K.profile(q, S, k)).work, w);
      assert.equal(K.profile(q, S, k).length, Math.max(0, ...q.activities.map((a) => S[a.id] + a.d)));
    }
  }
});

// ---------- Comprobación de un calendario (P3) ----------

test('F5c T003: check: predecesora sin acabar, sucesora adelantada, fin después de T en la nivelación y periodos que se pasan con recursos limitados', () => {
  const p = ex('lg');
  const S = ES(p);
  assert.deepEqual(K.check(p, S, 'lev'), { ok: true });
  // Nicholas, figura 6.24: P y Q +2, U y W +5. Q acaba en la semana 25 y T empieza en la 24.
  const n = Object.assign({}, S, { P: S.P + 2, Q: S.Q + 2, U: S.U + 5, W: S.W + 5 });
  assert.deepEqual(K.check(p, n, 'lev'), { ok: false, reason: 'pred', ids: ['Q', 'T'] });
  assert.deepEqual(K.check(p, Object.assign({}, n, { T: n.T + 2 }), 'lev'), { ok: true });
  // Mover solo una actividad: con su id, se comprueba lo que la toca.
  assert.deepEqual(K.check(p, Object.assign({}, S, { Q: S.Q + 2 }), 'lev', 'Q'), { ok: false, reason: 'succ', ids: ['Q', 'T'] });
  assert.deepEqual(K.check(p, Object.assign({}, S, { T: S.T - 1 }), 'lev', 'T'), { ok: false, reason: 'pred', ids: ['Q', 'T'] });
  assert.deepEqual(K.check(p, Object.assign({}, S, { Z: S.Z + 1 }), 'lev', 'Z'), { ok: false, reason: 'late', ids: ['Z'] });
  const k85 = ex('k85');
  assert.deepEqual(K.check(k85, ES(k85), 'lim'), { ok: false, reason: 'over', res: 0, period: 4, use: 11, cap: 9 });
  assert.deepEqual(K.check(k85, { A: 0, B: 0, C: 4, D: 5, E: 10 }, 'lim'), { ok: true });
  assert.deepEqual(K.check(k85, { A: 0, B: 0, C: 4, D: 4, E: 10 }, 'lim', 'D'), { ok: false, reason: 'over', res: 0, period: 5, use: 14, cap: 9 });
  // Con recursos limitados el proyecto se puede alargar: no hay «late».
  assert.deepEqual(K.check(k85, { A: 0, B: 0, C: 4, D: 5, E: 30 }, 'lim'), { ok: true });
});

// ---------- Cota de Baker (Klastorin, figuras 8.6 y 8.7) ----------

test('F5c T011: check con un calendario a medias (a mano con recursos limitados, C2): solo cuentan las colocadas; una predecesora sin colocar se dice', () => {
  const k85 = ex('k85');
  // Solo B y D colocadas: A cabe en 8 (antes, con D, pasa de 9), y el resto no se mira.
  const S = { B: 0, D: 3 };
  assert.deepEqual(K.check(k85, S, 'lim'), { ok: true });
  assert.deepEqual(K.check(k85, Object.assign({}, S, { A: 8 }), 'lim', 'A'), { ok: true });
  assert.deepEqual(K.check(k85, Object.assign({}, S, { A: 3 }), 'lim', 'A'), { ok: false, reason: 'over', res: 0, period: 4, use: 11, cap: 9 });
  // C sin A colocada: su predecesora no está.
  assert.deepEqual(K.check(k85, Object.assign({}, S, { C: 9 }), 'lim', 'C'), { ok: false, reason: 'unplaced', ids: ['A', 'C'] });
  // Una sucesora sin colocar no cuenta; una colocada, sí.
  assert.deepEqual(K.check(k85, { B: 0 }, 'lim', 'B'), { ok: true });
  assert.deepEqual(K.check(k85, { B: 2, D: 3 }, 'lim', 'B'), { ok: false, reason: 'succ', ids: ['B', 'D'] });
  // Con todas colocadas, como siempre; se puede pasar del final del CPM (el proyecto se alarga).
  assert.deepEqual(K.check(k85, { A: 0, B: 0, C: 4, D: 5, E: 30 }, 'lim', 'E'), { ok: true });
});

test('F5c T003: Baker en Klastorin 8.5: 101 de trabajo, 3 y 8 desperdiciados, al menos 13 semanas y, en 12, al menos 10 trabajadores', () => {
  const p = ex('k85');
  assert.deepEqual(K.baker(p), { list: [{ k: 0, W: 101, wasteStart: 3, wasteEnd: 8, Dmin: 13, Rmin: 10 }], bound: 13 });
  assert.equal(K.baker(p).bound, X.get('k85').expected.bakerD);
  assert.equal(K.baker(p).list[0].Rmin, X.get('k85').expected.bakerR);
  // Un recurso sin límite no cuenta; sin ninguno con límite, la cota es la duración del CPM.
  const lg = ex('lg', 'lim');
  assert.deepEqual(K.baker(lg).list.map((b) => b.k), [0]);
  assert.equal(K.baker(ex('k81', 'lim')).bound, 13);
});

test('F5c T003: la cota de Baker nunca baja de la duración del CPM y nunca pasa de lo que da cualquier calendario válido (300 tablas)', () => {
  const rng = R.mulberry32(11);
  for (let i = 0; i < 300; i++) {
    const rows = randomTable(rng, R.int(rng, 2, 8), 1);
    const cap = Math.max(1, ...rows.map((r) => Number(r.r1)));
    const p = ok(rows, res(cap), 'lim');
    // Un calendario válido: las actividades una detrás de otra en orden topológico.
    const S = {}; let t = 0; for (const a of p.activities) { S[a.id] = t; t += a.d; }
    assert.ok(K.check(p, S, 'lim').ok);
    const b = K.baker(p).bound;
    assert.ok(b >= p.T, `tabla ${i}`);
    assert.ok(b <= Math.max(p.T, t), `tabla ${i}: ${b} > ${t}`);
  }
});

// ---------- Nivelación (P4, P5, P6; T004) ----------

// Fuerza bruta: todos los comienzos entre ES y LS que respetan las precedencias; el menor pico del recurso k.
function brutePeak(p, k) {
  let best = Infinity; const S = {}; const acts = p.activities;
  (function go(i) {
    if (i === acts.length) { best = Math.min(best, K.stats(K.profile(p, S, k, p.T)).peak); return; }
    const a = acts[i]; const lo = Math.max(0, ...p.preds[a.id].map((x) => S[x] + p.byId[x].d));
    for (let s = lo; s <= p.times[a.id].LS; s++) { S[a.id] = s; go(i + 1); }
  })(0);
  return best;
}

test('F5c T004: Burgess en Klastorin 8.1: pico 16 y suma de cuadrados 1735 (temprano 1877, tardío 1839), en dos pasadas', () => {
  const p = ex('k81');
  const b = K.burgess(p, 0);
  assert.deepEqual(K.stats(K.profile(p, b.S, 0, p.T)), { peak: 16, ssq: X.get('k81').expected.burgessSsq, work: 147 });
  assert.deepEqual(b.S, { A: 0, B: 0, C: 4, D: 3, E: 2, F: 11, G: 8 });
  assert.equal(b.passes, 2);
  // Solo hay pasos para las que tienen hueco (las críticas no se mueven); el primero es la de mayor comienzo temprano.
  assert.deepEqual(b.steps[0].id, 'C');
  assert.ok(b.steps.every((s) => s.window[1] > s.window[0]));
});

test('F5c T004: Burgess nunca sube la suma de cuadrados y su calendario respeta precedencias y duración (500 tablas)', () => {
  const rng = R.mulberry32(41);
  for (let i = 0; i < 500; i++) {
    const p = ok(randomTable(rng, R.int(rng, 2, 10), 2), res('', ''));
    for (const k of [0, 1]) {
      const b = K.burgess(p, k);
      assert.deepEqual(K.check(p, b.S, 'lev'), { ok: true }, `tabla ${i}`);
      for (const s of b.steps) {
        assert.ok(s.after <= s.before, `tabla ${i}: ${s.id}`);
        assert.equal(s.after, Math.min(...s.options.map((o) => o.ssq)));
        // El destino es el de menor suma de cuadrados y, con empate, el más tardío.
        assert.equal(s.to, Math.max(...s.options.filter((o) => o.ssq === s.after).map((o) => o.s)));
      }
      assert.ok(K.stats(K.profile(p, b.S, k, p.T)).ssq <= K.stats(K.profile(p, ES(p), k, p.T)).ssq);
    }
  }
});

test('F5c T004: mínimo exacto del pico: Klastorin 8.1, 16 (cota 12); LOGON, 15 trabajadores y 16 de equipo; GUMBY, 8 y 5', () => {
  const k81 = K.minPeak(ex('k81'), 0);
  assert.deepEqual([k81.peak, k81.lb, k81.proved], [16, 12, true]);
  assert.deepEqual(K.check(ex('k81'), k81.S, 'lev'), { ok: true });
  const lg = ex('lg');
  assert.deepEqual([0, 1].map((k) => K.minPeak(lg, k).peak), X.get('lg').expected.minPeak);
  const gb = ex('gb');
  assert.deepEqual([0, 1].map((k) => K.minPeak(gb, k).peak), [8, 5]);
  for (const id of ['k81', 'k85', 'lg', 'lgi', 'gb', 'n723']) {
    const p = ex(id);
    for (let k = 0; k < p.res.length; k++) {
      const m = K.minPeak(p, k);
      assert.ok(m.proved && m.nodes <= K.BUDGET, `${id}: ${m.nodes}`);
      assert.equal(K.stats(K.profile(p, m.S, k, p.T)).peak, m.peak);
    }
  }
});

test('F5c T004: el mínimo exacto del pico es el de la fuerza bruta (300 tablas, con hitos de duración 0)', () => {
  const rng = R.mulberry32(20261127);
  for (let i = 0; i < 300; i++) {
    const p = ok(randomTable(rng, R.int(rng, 2, 6), 1), res(''));
    const m = K.minPeak(p, 0);
    assert.equal(m.peak, brutePeak(p, 0), `tabla ${i}`);
    assert.ok(m.proved && m.lb <= m.peak);
    assert.deepEqual(K.check(p, m.S, 'lev'), { ok: true });
  }
});

test('F5c T004: con el tope agotado, «no demostrado»: lo mejor encontrado (al menos Burgess) y la cota, sin pasar del tope', () => {
  const p = ex('lg');
  const m = K.minPeak(p, 1, 3);
  assert.equal(m.proved, false);
  assert.ok(m.nodes <= 3 + 1);
  assert.ok(m.lb <= 16 && m.peak >= 16);
  assert.ok(m.peak <= K.stats(K.profile(p, K.burgess(p, 1).S, 1, p.T)).peak);
  assert.deepEqual(K.check(p, m.S, 'lev'), { ok: true });
});

// ---------- Recursos limitados (P5–P8; T005) ----------

const T_ = (p, o) => K.sgs(p, o).T;
const RULES = ['slk', 'lft', 'spt', 'res', 'act', 'esf', 'lsf'];

// Implementación de referencia de los esquemas, escrita aparte (por periodos, sin las estructuras del núcleo).
function refSgs(p, scheme, keyOf) {
  const caps = p.res.map((r) => (r.cap == null ? Infinity : r.cap));
  const used = []; const S = {};
  const free = (a, s) => { for (let t = s; t < s + a.d; t++) for (let k = 0; k < caps.length; k++) if ((used[t] ? used[t][k] : 0) + a.r[k] > caps[k]) return false; return true; };
  const take = (a, s) => { for (let t = s; t < s + a.d; t++) { used[t] = used[t] || caps.map(() => 0); a.r.forEach((v, k) => { used[t][k] += v; }); } };
  const table = p.table.map((id) => p.byId[id]);
  const prio = (x, y) => { const a = keyOf(x); const b = keyOf(y); for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] - b[i]; return p.table.indexOf(x.id) - p.table.indexOf(y.id); };
  if (scheme === 's') {
    while (Object.keys(S).length < table.length) {
      const a = table.filter((x) => !(x.id in S) && p.preds[x.id].every((y) => y in S)).sort(prio)[0];
      let s = Math.max(0, ...p.preds[a.id].map((y) => S[y] + p.byId[y].d));
      while (!free(a, s)) s++;
      S[a.id] = s; take(a, s);
    }
  } else {
    for (let t = 0; Object.keys(S).length < table.length; t++) {
      // Los hitos acaban en el mismo instante y no ocupan el recurso: empiezan antes que nada (mientras quede alguno
      // elegible); después, las demás elegibles, por prioridad (T016).
      const ready = () => table.filter((x) => !(x.id in S) && p.preds[x.id].every((y) => y in S && S[y] + p.byId[y].d <= t)).sort(prio);
      for (let ms = ready().filter((a) => !a.d); ms.length; ms = ready().filter((a) => !a.d)) for (const a of ms) S[a.id] = t;
      for (const a of ready()) if (free(a, t)) { S[a.id] = t; take(a, t); }
    }
  }
  return S;
}
const KEYS = {
  slk: (p) => (a) => [p.times[a.id].TF, p.times[a.id].LS], lft: (p) => (a) => [p.times[a.id].LF, p.times[a.id].TF], spt: () => (a) => [a.d],
  res: () => (a) => [-a.r.reduce((s, v) => s + v, 0)], act: (p) => (a) => [p.times[a.id].LS], esf: (p) => (a) => [p.times[a.id].ES], lsf: (p) => (a) => [p.times[a.id].LS],
};
// Fuerza bruta de la duración mínima: todos los comienzos de 0 a H.
function bruteOpt(p) {
  const H = p.activities.reduce((s, a) => s + a.d, 0); let best = Infinity; const S = {}; const acts = p.activities;
  (function go(i) {
    if (i === acts.length) {
      const T = Math.max(0, ...acts.map((a) => S[a.id] + a.d));
      if (T < best && K.check(p, S, 'lim').ok) best = T;
      return;
    }
    const a = acts[i]; const lo = Math.max(0, ...p.preds[a.id].map((x) => S[x] + p.byId[x].d));
    for (let s = lo; s <= H - a.d && s + a.d < best; s++) { S[a.id] = s; go(i + 1); }
  })(0);
  return best;
}

test('F5c T005: Klastorin 8.5 (9 trabajadores): la lista del libro (B, A, C, D, E) en serie da 14 (C en la semana 5, D en la 6, E en la 11); el paralelo, 14 con cualquier regla; el óptimo, 14', () => {
  const p = ex('k85');
  const b = K.sgs(p, { scheme: 's', dir: 'f', list: ['B', 'A', 'C', 'D', 'E'] });
  assert.deepEqual([b.T, b.S], [14, { A: 0, B: 0, C: 4, D: 5, E: 10 }]);
  for (const rule of RULES) assert.equal(T_(p, { scheme: 'p', dir: 'f', rule }), 14, rule);
  const o = K.optimum(p);
  assert.deepEqual([o.T, o.proved, o.lb], [X.get('k85').expected.opt, true, 13]);
  assert.deepEqual(K.check(p, o.S, 'lim'), { ok: true });
});

test('F5c T005: LOGON con 14 trabajadores (figura 6.28): cada regla en serie y el óptimo, 49 (el libro, por tanteo, 50)', () => {
  const p = ex('lg', 'lim');
  assert.deepEqual(RULES.map((rule) => T_(p, { scheme: 's', dir: 'f', rule })), [50, 49, 62, 54, 49, 50, 49]);
  const o = K.optimum(p);
  assert.deepEqual([o.T, o.proved], [X.get('lg').expected.opt, true]);
  assert.ok(o.nodes <= K.BUDGET);
});

test('F5c T005: LOGON con el inspector (figura 6.29): 49 con todas las reglas salvo menor duración (52); el óptimo, 49', () => {
  const p = ex('lgi');
  assert.deepEqual(RULES.map((rule) => T_(p, { scheme: 's', dir: 'f', rule })), [49, 49, 52, 49, 49, 49, 49]);
  const o = K.optimum(p);
  assert.deepEqual([o.T, o.proved], [49, true]);
  assert.ok(o.nodes <= K.BUDGET, String(o.nodes));
});

test('F5c T005: GUMBY con 8 analistas y 5 programadores: 26 semanas (sin retrasar el proyecto) salvo menor duración (28)', () => {
  const p = ex('gb');
  for (const scheme of ['s', 'p']) assert.deepEqual(RULES.map((rule) => T_(p, { scheme, dir: 'f', rule })), [26, 26, 28, 26, 26, 26, 26], scheme);
  assert.equal(K.optimum(p).T, 26);
});

test('F5c T005: Nicholas, figura 7.23: los cinco calendarios del libro son los del esquema paralelo (hacia delante, 11; hacia atrás, 10)', () => {
  const p = ex('n723');
  // (a) lo antes posible, (c) más recursos, (d) menor duración y (e) menor holgura: 11, con los calendarios del libro.
  assert.deepEqual(K.sgs(p, { scheme: 'p', dir: 'f', rule: 'esf' }).S, { A: 0, B: 0, C: 2, D: 4, E: 5, F: 5 });
  assert.deepEqual(K.sgs(p, { scheme: 'p', dir: 'f', rule: 'res' }).S, { A: 0, B: 0, C: 2, D: 4, E: 5, F: 5 });
  assert.deepEqual(K.sgs(p, { scheme: 'p', dir: 'f', rule: 'spt' }).S, { A: 0, B: 0, C: 3, D: 2, E: 5, F: 5 });
  assert.deepEqual(K.sgs(p, { scheme: 'p', dir: 'f', rule: 'slk' }).S, { A: 0, B: 0, C: 2, D: 10, E: 4, F: 4 });
  for (const rule of RULES) assert.equal(T_(p, { scheme: 'p', dir: 'f', rule }), 11, rule);
  // (b) lo más tarde posible: el paralelo hacia atrás, 10.
  for (const rule of RULES) assert.equal(T_(p, { scheme: 'p', dir: 'b', rule }), 10, rule);
  assert.deepEqual(RULES.map((rule) => T_(p, { scheme: 's', dir: 'f', rule })), [10, 10, 12, 14, 10, 11, 10]);
  assert.deepEqual([K.optimum(p).T, K.baker(p).bound], [10, 9]);
});

test('F5c T005: compare da las 7 reglas × serie y paralelo × hacia delante y hacia atrás', () => {
  const c = K.compare(ex('n723'));
  assert.equal(c.length, 28);
  assert.deepEqual(c.filter((x) => x.scheme === 'p' && x.dir === 'b').map((x) => x.T), [10, 10, 10, 10, 10, 10, 10]);
  assert.deepEqual(c[0], { scheme: 's', dir: 'f', rule: 'slk', T: 10 });
});

test('F5c T005: cada regla, esquema y sentido da un calendario válido, nunca más corto que el óptimo ni que Baker; serie y paralelo = la referencia (500 tablas, con hitos)', () => {
  const rng = R.mulberry32(77);
  for (let i = 0; i < 500; i++) {
    const rows = randomTable(rng, R.int(rng, 2, 9), 2);
    const caps = [0, 1].map((k) => { const m = Math.max(1, ...rows.map((r) => Number(r[`r${k + 1}`]))); return String(R.int(rng, m, m + 4)); });
    const p = ok(rows, res(...caps), 'lim');
    const o = K.optimum(p);
    assert.ok(o.proved, `tabla ${i}`);
    for (const scheme of ['s', 'p']) {
      for (const dir of ['f', 'b']) {
        for (const rule of RULES) {
          const s = K.sgs(p, { scheme, dir, rule });
          assert.deepEqual(K.check(p, s.S, 'lim'), { ok: true }, `tabla ${i}: ${scheme}${dir} ${rule}`);
          assert.ok(s.T >= o.T && o.T >= K.baker(p).bound, `tabla ${i}: ${scheme}${dir} ${rule}`);
          if (dir === 'f') assert.deepEqual(s.S, refSgs(p, scheme, KEYS[rule](p)), `tabla ${i}: ${scheme} ${rule}`);
        }
      }
    }
  }
});

test('F5c T005: el óptimo es el de la fuerza bruta (300 tablas pequeñas, con hitos)', () => {
  const rng = R.mulberry32(91);
  for (let i = 0; i < 300; i++) {
    const rows = randomTable(rng, R.int(rng, 2, 5), 2);
    const caps = [0, 1].map((k) => String(Math.max(1, ...rows.map((r) => Number(r[`r${k + 1}`])))));
    const p = ok(rows, res(...caps), 'lim');
    const o = K.optimum(p);
    assert.equal(o.T, bruteOpt(p), `tabla ${i}`);
    assert.deepEqual(K.check(p, o.S, 'lim'), { ok: true });
  }
});

test('F5c T005: con el tope agotado, el óptimo dice «no demostrado» con la mejor regla y la cota', () => {
  const p = ex('lg', 'lim');
  const o = K.optimum(p, 100);
  assert.equal(o.proved, false);
  assert.equal(o.T, Math.min(...K.compare(p).map((x) => x.T)));
  assert.ok(o.lb >= 47 && o.lb <= o.T);
  assert.deepEqual(K.check(p, o.S, 'lim'), { ok: true });
  // Sin ningún recurso con límite, el óptimo es la duración del CPM.
  assert.deepEqual([K.optimum(ex('k81', 'lim')).T, K.optimum(ex('k81', 'lim')).proved], [13, true]);
});

test('F5c T005: cadena crítica: Klastorin 8.5 con la lista del libro, A–C–D–E (D espera a C por los trabajadores); LOGON con el inspector', () => {
  const p = ex('k85');
  const S = K.sgs(p, { scheme: 's', dir: 'f', list: ['B', 'A', 'C', 'D', 'E'] }).S;
  assert.deepEqual(K.chains(p, S), [['A', 'C', 'D', 'E']]);
  const q = ex('lgi');
  assert.deepEqual(K.chains(q, K.sgs(q, { scheme: 's', dir: 'f', rule: 'esf' }).S), [['H', 'J', 'K', 'L', 'P', 'V', 'X', 'Y', 'Z']]);
  // Sin límite, la cadena es el camino crítico.
  const r = ex('k81', 'lim');
  assert.deepEqual(K.chains(r, ES(r)), [['A', 'D', 'G']]);
});

test('F5c T005: toda cadena crítica empieza en 0, va sin huecos y acaba con el calendario (500 calendarios)', () => {
  const rng = R.mulberry32(5);
  for (let i = 0; i < 500; i++) {
    const rows = randomTable(rng, R.int(rng, 2, 9), 2);
    const caps = [0, 1].map((k) => String(Math.max(1, ...rows.map((r) => Number(r[`r${k + 1}`])))));
    const p = ok(rows, res(...caps), 'lim');
    const dir = R.int(rng, 0, 1) ? 'f' : 'b';
    const s = K.sgs(p, { scheme: R.int(rng, 0, 1) ? 's' : 'p', dir, rule: RULES[R.int(rng, 0, 6)] });
    const cs = K.chains(p, s.S, dir);
    assert.ok(cs.length >= 1, `tabla ${i}`);
    for (const c of cs) {
      assert.equal(s.S[c[0]], 0, `tabla ${i}`);
      for (let j = 1; j < c.length; j++) assert.equal(s.S[c[j]], s.S[c[j - 1]] + p.byId[c[j - 1]].d, `tabla ${i}`);
      assert.equal(s.S[c[c.length - 1]] + p.byId[c[c.length - 1]].d, s.T);
    }
    // El óptimo se da pegado al comienzo: también tiene cadena.
    const o = K.optimum(p);
    assert.ok(K.chains(p, o.S).length >= 1, `tabla ${i}: óptimo`);
    for (const c of K.chains(p, o.S)) {
      assert.equal(o.S[c[0]], 0);
      assert.equal(o.S[c[c.length - 1]] + p.byId[c[c.length - 1]].d, o.T);
    }
  }
});

// ---------- Traza y corrección de la predicción (P9; T006) ----------

test('F5c T006: traza de Burgess en Klastorin 8.1: un paso por actividad con hueco (C, F y E, dos pasadas) y el final', () => {
  const t = K.trace(ex('k81'), { kind: 'bur', k: 0 });
  assert.deepEqual(t.map((s) => s.kind), ['rsTable', 'rsMove', 'rsMove', 'rsMove', 'rsMove', 'rsMove', 'rsMove', 'rsEnd']);
  assert.deepEqual(t.filter((s) => s.kind === 'rsMove').map((s) => [s.id, s.from, s.to, s.pass]), [['C', 3, 4, 1], ['F', 2, 11, 1], ['E', 2, 2, 1], ['C', 4, 4, 2], ['F', 11, 11, 2], ['E', 2, 2, 2]]);
  assert.deepEqual(t[2].S, { A: 0, B: 0, C: 4, D: 3, E: 2, F: 11, G: 8 });
  assert.deepEqual(t.at(-1).stats, { peak: 16, ssq: 1735, work: 147 });
  assert.deepEqual(t[1].reveals.map((r) => [r.field, r.value]), [['rs.start', 4]]);
});

test('F5c T006: rs.start en Burgess: acierto (también con empate), fuera de la ventana y suma de cuadrados mayor', () => {
  const t = K.trace(ex('k81'), { kind: 'bur', k: 0 });
  const f = t[2].reveals[0].check;   // F: de 2 a 11
  assert.deepEqual(K.startCheck(f, 11), { ok: true });
  assert.deepEqual(K.startCheck(f, 12), { ok: false, reason: 'window', window: [2, 11] });
  const worse = f.options.find((o) => o.ssq > Math.min(...f.options.map((x) => x.ssq)));
  assert.deepEqual(K.startCheck(f, worse.s), { ok: false, reason: 'ssq', ssq: worse.ssq, best: Math.min(...f.options.map((x) => x.ssq)) });
  const tie = f.options.filter((o) => o.ssq === Math.min(...f.options.map((x) => x.ssq)));
  for (const o of tie) assert.deepEqual(K.startCheck(f, o.s), { ok: true });
});

test('F5c T006: traza del esquema serie en Klastorin 8.5 (menor fin tardío): B, A, D, C, E; rs.pick y rs.start con cada motivo', () => {
  const t = K.trace(ex('k85'), { kind: 'sgs', scheme: 's', dir: 'f', rule: 'lft' });
  const picks = t.filter((s) => s.kind === 'rsPick');
  assert.deepEqual(picks.map((s) => [s.id, s.ready, s.start]), [['B', 0, 0], ['A', 0, 0], ['D', 3, 4], ['C', 4, 9], ['E', 10, 10]]);
  assert.deepEqual(t.at(-1), { kind: 'rsEnd', reveals: [], S: { B: 0, A: 0, D: 4, C: 9, E: 10 }, T: 14, bound: 13, chains: [['A', 'D', 'C', 'E']], reversed: false });
  const [pick, place] = picks[2].reveals.map((r) => r.check);
  assert.deepEqual(K.pickCheck(pick, 'D'), { ok: true });
  assert.deepEqual(K.pickCheck(pick, 'C'), { ok: false, reason: 'lower', id: 'C', best: ['D'] });
  assert.deepEqual(K.pickCheck(pick, 'E'), { ok: false, reason: 'notElig', id: 'E' });
  assert.deepEqual(K.startCheck(place, 4), { ok: true });
  assert.deepEqual(K.startCheck(place, 2), { ok: false, reason: 'preds', ready: 3 });
  assert.deepEqual(K.startCheck(place, 3), { ok: false, reason: 'over', res: 0, period: 4, use: 11, cap: 9 });
  assert.deepEqual(K.startCheck(place, 6), { ok: false, reason: 'later', start: 4 });
  // Empate: en el primer paso con «lo antes posible», A y B tienen la misma clave (ES 0): valen las dos.
  const e = K.trace(ex('k85'), { kind: 'sgs', scheme: 's', dir: 'f', rule: 'esf' }).find((s) => s.kind === 'rsPick').reveals[0].check;
  assert.deepEqual([K.pickCheck(e, 'A'), K.pickCheck(e, 'B')], [{ ok: true }, { ok: true }]);
});

test('F5c T006: traza del esquema paralelo en Nicholas 7.23 (lo antes posible): instantes 0, 1, 2, 4 y 5; rs.set con empates y cada motivo', () => {
  const t = K.trace(ex('n723'), { kind: 'sgs', scheme: 'p', dir: 'f', rule: 'esf' });
  const times = t.filter((s) => s.kind === 'rsTime');
  assert.deepEqual(times.map((s) => [s.t, s.started]), [[0, ['A', 'B']], [1, []], [2, ['C']], [4, ['D']], [5, ['E', 'F']]]);
  assert.deepEqual(times[1].reveals, []);   // en 1 no cabe ninguna: se cuenta, no se pregunta
  const c = times[2].reveals[0].check;      // en 2: C, D y E elegibles; C y D empatan (ES 1)
  assert.deepEqual(K.setCheck(c, ['C']), { ok: true });
  assert.deepEqual(K.setCheck(c, ['D']), { ok: true });
  assert.deepEqual(K.setCheck(c, ['C', 'E']), { ok: false, reason: 'over', id: 'E', res: 0, period: 3, use: 15, cap: 10 });
  assert.deepEqual(K.setCheck(c, []), { ok: false, reason: 'missing', id: 'C' });
  assert.deepEqual(K.setCheck(c, ['E']), { ok: false, reason: 'lower', ids: ['C', 'E'] });
  assert.deepEqual(K.setCheck(c, ['F']), { ok: false, reason: 'notElig', ids: ['F'] });
  assert.equal(t.at(-1).T, 11);
});

test('F5c T006: hacia atrás, la traza va en el tiempo de la red invertida y el final da el calendario de verdad', () => {
  const p = ex('n723');
  const t = K.trace(p, { kind: 'sgs', scheme: 'p', dir: 'b', rule: 'esf' });
  assert.equal(t.at(-1).reversed, true);
  assert.deepEqual(t.at(-1).S, K.sgs(p, { scheme: 'p', dir: 'b', rule: 'esf' }).S);
  assert.equal(t.at(-1).T, 10);
  assert.ok(t.at(-1).chains.length >= 1);
});

test('F5c T006: en 300 tablas, lo que da el esquema siempre acierta, y cada paso de la traza deja un calendario parcial válido', () => {
  const rng = R.mulberry32(303);
  for (let i = 0; i < 300; i++) {
    const rows = randomTable(rng, R.int(rng, 2, 8), 2);
    const caps = [0, 1].map((k) => String(Math.max(1, ...rows.map((r) => Number(r[`r${k + 1}`])))));
    const p = ok(rows, res(...caps), 'lim');
    for (const scheme of ['s', 'p']) {
      const t = K.trace(p, { kind: 'sgs', scheme, dir: 'f', rule: RULES[i % 7] });
      for (const s of t) for (const r of s.reveals) {
        if (r.field === 'rs.pick') assert.deepEqual(K.pickCheck(r.check, r.value), { ok: true }, `tabla ${i}`);
        if (r.field === 'rs.start') assert.deepEqual(K.startCheck(r.check, r.value), { ok: true }, `tabla ${i}`);
        if (r.field === 'rs.set') assert.deepEqual(K.setCheck(r.check, r.value), { ok: true }, `tabla ${i}`);
      }
      assert.deepEqual(t.at(-1).S, K.sgs(p, { scheme, dir: 'f', rule: RULES[i % 7] }).S);
    }
    const b = K.trace(p, { kind: 'bur', k: 0 });
    for (const s of b) for (const r of s.reveals) assert.deepEqual(K.startCheck(r.check, r.value), { ok: true });
  }
});

test('F5c T006: las partes obligatorias podan la búsqueda: LOGON, pico del equipo en menos de 1000 nodos y óptimo con 14 trabajadores en menos de 10 000', () => {
  assert.ok(K.minPeak(ex('lg'), 1).nodes < 1000);
  assert.ok(K.optimum(ex('lg', 'lim')).nodes < 10000);
});

test('T016 (evidencia): la cadena crítica no se queda en un bucle con hitos en el mismo instante; un hito no espera por un recurso ni hace esperar', () => {
  // Hallado por cifras.js: dos hitos que usan el recurso, en el mismo instante y uno detrás del otro, se «esperaban» por el
  // recurso en los dos sentidos (en el esquema serie hacia atrás), y chains se colgaba.
  const rows = [row('A0', '', '0', '1'), row('A1', 'A0', '0', '1'), row('A2', 'A0, A1', '2', '0'), row('A3', 'A0, A1', '2', '0'), row('A4', '', '2', '3')];
  const p = K.parse(rows, [{ name: 'R', cap: '3' }], 'lim').project;
  for (const scheme of ['s', 'p']) for (const dir of ['f', 'b']) for (const rule of K.RULES) {
    const r = K.sgs(p, { scheme, dir, rule });
    const ch = K.chains(p, r.S, dir);
    for (const c of ch) for (let i = 1; i < c.length; i++) {
      const [x, y] = [c[i - 1], c[i]];
      // Entre dos con duración 0, solo una precedencia.
      if (!p.byId[x].d || !p.byId[y].d) assert.ok(p.preds[y].includes(x), `${scheme}${dir} ${rule}: ${x} → ${y}`);
    }
  }
});

test('T016 (evidencia): en el paralelo, la sucesora de un hito que acaba en ese instante entra con su prioridad (y la traza se da por buena)', () => {
  // Hallado por cifras.js: M es un hito sin predecesoras; X (2 periodos) va detrás de M e Y (3 periodos) no tiene
  // predecesoras; las dos usan todo el recurso. Con «la más corta primero», X va antes que Y. Antes, X entraba en una
  // segunda vuelta del instante 0, cuando Y ya había cogido el recurso, y la predicción de la traza no se daba por buena.
  const p = ok([row('M', '', 0, 0), row('X', 'M', 2, 4), row('Y', '', 3, 4)], res(4), 'lim');
  const r = K.sgs(p, { scheme: 'p', dir: 'f', rule: 'spt' });
  assert.deepEqual([r.S.M, r.S.X, r.S.Y, r.T], [0, 0, 2, 5]);
  for (const scheme of ['s', 'p']) for (const dir of ['f', 'b']) for (const rule of K.RULES) {
    for (const s of K.trace(p, { kind: 'sgs', scheme, dir, rule })) if (s.kind === 'rsTime' && s.started.length) assert.ok(K.setCheck(s.set, s.started).ok, `${scheme}${dir} ${rule} t=${s.t}`);
  }
});

// ---------- Revisión de cierre (T018) ----------

test('T018 (revisión, N-F2): con muchas empatadas en un instante del paralelo, cualquier respuesta empatada vale, el motivo no sale vacío y la corrección es inmediata', () => {
  for (const n of [7, 8, 11, 14]) {
    const rows = Array.from({ length: n }, (_, i) => row(`A${i + 1}`, '', 1, 1));
    const p = ok(rows, res(3), 'lim');
    const s = K.trace(p, { kind: 'sgs', scheme: 'p', dir: 'f', rule: 'spt' }).find((x) => x.kind === 'rsTime' && x.t === 0);
    const t0 = Date.now();
    assert.deepEqual(K.setCheck(s.set, s.started), { ok: true }, `${n}: la de la traza`);
    assert.deepEqual(K.setCheck(s.set, [`A${n}`, `A${n - 1}`, `A${n - 2}`]), { ok: true }, `${n}: las tres últimas`);
    assert.deepEqual(K.setCheck(s.set, ['A1', 'A4', `A${n}`]), { ok: true }, `${n}: otras tres`);
    assert.deepEqual(K.setCheck(s.set, ['A1', 'A2']), { ok: false, reason: 'missing', id: 'A3' }, `${n}: falta una`);
    assert.equal(K.setCheck(s.set, ['A1', 'A2', 'A3', 'A4']).reason, 'over', `${n}: se pasa`);
    assert.ok(Date.now() - t0 < 200, `${n}: ${Date.now() - t0} ms`);
  }
});

// Todos los conjuntos que da el voraz con algún orden dentro de cada grupo de empatadas (fuerza bruta, grupos pequeños).
function setsByPerms(c) {
  const groups = [];
  for (const x of c.elig) { const g = groups[groups.length - 1]; if (g && g[0].key.join() === x.key.join()) g.push(x); else groups.push([x]); }
  const perms = (a) => (a.length <= 1 ? [a] : a.flatMap((x, i) => perms(a.filter((_, j) => j !== i)).map((r) => [x].concat(r))));
  let orders = [[]];
  for (const g of groups) orders = orders.flatMap((o) => perms(g).map((q) => o.concat(q)));
  const out = new Set();
  for (const o of orders) {
    const u = c.res.map((x) => x.u.slice()); const got = [];
    for (const a of o) {
      let fit = true;
      for (let j = 0; j < c.res.length; j++) for (let t = c.t; t < c.t + a.d; t++) if ((u[j][t] || 0) + a.r[c.res[j].k] > c.res[j].cap) fit = false;
      if (!fit) continue;
      got.push(a.id); for (let j = 0; j < c.res.length; j++) for (let t = c.t; t < c.t + a.d; t++) u[j][t] = (u[j][t] || 0) + a.r[c.res[j].k];
    }
    out.add(got.sort().join());
  }
  return out;
}

test('T018 (revisión, N-F2): setCheck acepta exactamente los conjuntos que da el esquema con algún orden de las empatadas (fuerza bruta, 300 tablas con empates)', () => {
  const rng = R.mulberry32(18);
  let n = 0;
  for (let i = 0; i < 300; i++) {
    // Pocas duraciones y usos distintos, para que haya empates.
    const rows = Array.from({ length: R.int(rng, 3, 7) }, (_, j) => row(`A${j}`, j && rng() < 0.3 ? `A${R.int(rng, 0, j - 1)}` : '', R.int(rng, 0, 2), R.int(rng, 0, 2), R.int(rng, 0, 2)));
    const p = ok(rows, res(R.int(rng, 2, 3), R.int(rng, 2, 3)), 'lim');
    for (const rule of ['spt', 'esf', 'res']) {
      for (const s of K.trace(p, { kind: 'sgs', scheme: 'p', dir: 'f', rule })) {
        if (s.kind !== 'rsTime' || !s.started.length) continue;
        const good = setsByPerms(s.set); const ids = s.set.elig.map((x) => x.id);
        // Todos los subconjuntos no vacíos de las elegibles (como mucho 7).
        for (let mask = 1; mask < 1 << ids.length; mask++) {
          const g = ids.filter((_, b) => mask & (1 << b));
          const r = K.setCheck(s.set, g);
          assert.equal(r.ok, good.has(g.slice().sort().join()), `tabla ${i}, ${rule}, t=${s.t}: ${g}`);
          // Si no vale, siempre con un motivo y, si es la prioridad, con las dos actividades que lo explican.
          if (!r.ok) assert.ok(['over', 'missing'].includes(r.reason) || (r.reason === 'lower' && r.ids.length === 2), JSON.stringify(r));
          n++;
        }
      }
    }
  }
  assert.ok(n > 1000, String(n));
});

const TIMED = !process.env.NODE_V8_COVERAGE;
// Tabla de 30 actividades con duraciones de cientos de periodos (la de la revisión: mulberry32(6), duraciones × 50).
function longTable(f) {
  const rng = R.mulberry32(6); const rows = [];
  for (let i = 0; i < 30; i++) {
    const l = []; for (let j = Math.max(0, i - 6); j < i; j++) if (rng() < 0.25) l.push(`A${j}`);
    rows.push(row(`A${i}`, l.join(', '), R.int(rng, 1, 6) * f, R.int(rng, 0, 9), R.int(rng, 0, 9), R.int(rng, 0, 9)));
  }
  return rows;
}

test('T018 (revisión, N-F1, N-F6): el tope de las búsquedas cuenta el trabajo, no solo los nodos: con duraciones largas, el mínimo del pico y el óptimo se cortan («no demostrado») en un tiempo acotado', () => {
  const rows = longTable(50);
  const lev = ok(rows, res(null, null, null), 'lev'); const lim = ok(rows, res(12, 12, 12), 'lim');
  let t0 = Date.now(); const m = K.minPeak(lev, 0); const tm = Date.now() - t0;
  t0 = Date.now(); const o = K.optimum(lim); const to = Date.now() - t0;
  // El trabajo no pasa del tope (más lo de un paso), y los dos dicen que no está demostrado, con lo mejor y una cota.
  for (const x of [m, o]) { assert.equal(x.proved, false); assert.ok(x.work > K.WORK && x.work < K.WORK + 1e6, String(x.work)); assert.ok(x.nodes < K.BUDGET, String(x.nodes)); }
  assert.ok(m.lb <= m.peak && o.lb <= o.T);
  assert.deepEqual(K.check(lev, m.S, 'lev'), { ok: true }); assert.deepEqual(K.check(lim, o.S, 'lim'), { ok: true });
  if (TIMED) assert.ok(tm < 1500 && to < 1500, `${tm} ms y ${to} ms`);
});

test('T018 (revisión, N-F5): Burgess no recorre los T periodos por cada comienzo: con una cadena de 20 actividades de 999 periodos, deprisa; y sus sumas de cuadrados, las de la cuenta directa (200 tablas)', () => {
  const rows = Array.from({ length: 20 }, (_, i) => row(`C${i + 1}`, i ? `C${i}` : '', 999, 0)).concat(Array.from({ length: 10 }, (_, i) => row(`P${i + 1}`, '', 1, 1)));
  const p = ok(rows, res(null), 'lev');
  const t0 = Date.now(); const b = K.burgess(p, 0);
  if (TIMED) assert.ok(Date.now() - t0 < 1500, `${Date.now() - t0} ms`);
  assert.equal(stats0(K.profile(p, b.S, 0, p.T)).peak, 1);
  const rng = R.mulberry32(5);
  for (let i = 0; i < 200; i++) {
    const q = ok(randomTable(rng, R.int(rng, 2, 8), 1), res(null), 'lev');
    const S = ES(q);
    for (const st of K.burgess(q, 0).steps) {
      for (const o of st.options) {
        const T2 = Object.assign({}, S, { [st.id]: o.s });
        assert.equal(o.ssq, K.profile(q, T2, 0, q.T).reduce((t, v) => t + v * v, 0), `tabla ${i}, ${st.id} en ${o.s}`);
      }
      S[st.id] = st.to;
    }
  }
});
function stats0(u) { return { peak: Math.max(0, ...u) }; }

test('T018 (revisión, N-F4): Burgess desempata las de igual comienzo temprano por el orden de la tabla al revés, no por el orden topológico', () => {
  // La tabla en este orden: F, E, B, C, A, D (de la revisión).
  const p = ok([row('F', '', 4, 3), row('E', 'B, D', 2, 1), row('B', '', 3, 0), row('C', 'B', 3, 0), row('A', '', 4, 5), row('D', 'B', 4, 0)], res(null), 'lev');
  const b = K.burgess(p, 0);
  assert.deepEqual(b.steps.map((s) => s.id), ['C', 'A', 'F', 'C', 'A', 'F']);
  assert.equal(K.profile(p, b.S, 0, p.T).reduce((t, v) => t + v * v, 0), 148);
});

test('T018 (revisión, N-F12): el óptimo se da pegado al comienzo también cuando la mejor regla ya es la óptima o la búsqueda se corta (ninguna actividad cabe un periodo antes)', () => {
  const glued = (p, S) => p.activities.every((a) => {
    const ready = Math.max(0, ...p.preds[a.id].map((x) => S[x] + p.byId[x].d));
    return S[a.id] === ready || !K.check(p, Object.assign({}, S, { [a.id]: S[a.id] - 1 }), 'lim').ok;
  });
  const p = ok([row('A', '', 5, 4), row('B', '', 5, 3), row('C', 'B', 2, 0), row('D', 'C', 4, 4), row('E', '', 5, 4), row('F', 'A, E', 4, 1), row('G', 'E', 2, 1)], res(5), 'lim');
  const o = K.optimum(p);
  assert.deepEqual([o.T, o.proved, o.S.C], [19, true, 5]);
  const rng = R.mulberry32(12);
  for (let i = 0; i < 200; i++) {
    const rows = randomTable(rng, R.int(rng, 2, 8), 2);
    const caps = [0, 1].map((k) => String(Math.max(1, ...rows.map((r) => Number(r[`r${k + 1}`])))));
    const q = ok(rows, res(...caps), 'lim');
    for (const x of [K.optimum(q), K.optimum(q, 3)]) {
      assert.deepEqual(K.check(q, x.S, 'lim'), { ok: true }, `tabla ${i}`);
      assert.equal(Math.max(0, ...q.activities.map((a) => x.S[a.id] + a.d)), x.T, `tabla ${i}: dura lo que dice`);
      assert.ok(glued(q, x.S), `tabla ${i}: ${JSON.stringify(x.S)}`);
    }
  }
});

test('T018 (revisión, N-F3): el desperdicio de Baker cuenta los periodos que llegan justo a la disponibilidad (≤ R), al principio y al final', () => {
  const p = ok([row('A', '', 1, 9), row('B', 'A', 1, 3), row('C', 'B', 1, 5), row('D', 'B', 1, 5), row('E', 'C, D', 1, 3), row('F', 'E', 1, 9)], res(9), 'lim');
  const b = K.baker(p).list[0];
  assert.deepEqual([b.wasteStart, b.wasteEnd, b.Dmin, b.Rmin], [6, 6, 6, 10]);
  assert.equal(K.optimum(p).T, 6);
});

test('T018 (revisión, N-F7): con «no demostrado», la cota nunca pasa del valor exacto y, cuando la búsqueda ya había llegado a él, es justo ese (mínimo del pico y óptimo, topes pequeños, 150 tablas)', () => {
  const rng = R.mulberry32(3);
  for (let i = 0; i < 150; i++) {
    const rows = randomTable(rng, R.int(rng, 4, 8), 1);
    const cap = Math.max(1, ...rows.map((r) => Number(r.r1)));
    const lev = ok(rows, res(null), 'lev'); const lim = ok(rows, res(cap), 'lim');
    const fp = K.minPeak(lev, 0); const fo = K.optimum(lim);
    assert.ok(fp.proved && fo.proved);
    // 25 topes repartidos y el de un nodo menos de lo que hace falta (corta justo al buscar el valor exacto).
    const some = (n) => [...new Set(Array.from({ length: 25 }, (_, j) => 1 + Math.floor((j * (n - 1)) / 25)).concat([n - 1]))].filter((b) => b >= 1);
    for (const b of some(fp.nodes)) { const x = K.minPeak(lev, 0, b); assert.ok(x.lb <= fp.peak && x.peak >= fp.peak, `tabla ${i}, tope ${b}`); }
    for (const b of some(fo.nodes)) { const x = K.optimum(lim, b); assert.ok(x.lb <= fo.T && x.T >= fo.T, `tabla ${i}, tope ${b}`); }
  }
  // Y dos tablas en que la búsqueda se corta justo al buscar el valor exacto (de la revisión): la cota es ese valor.
  const P = ok([row('A0', '', 2, 5), row('A1', 'A0', 1, 5), row('A2', '', 6, 5), row('A3', '', 5, 1), row('A4', 'A0', 5, 2), row('A5', 'A3', 4, 0), row('A6', 'A0', 2, 5)], res(null), 'lev');
  const mp = K.minPeak(P, 0); const cp = K.minPeak(P, 0, mp.nodes - 1);
  assert.deepEqual([mp.peak, mp.proved, cp.proved, cp.peak, cp.lb], [10, true, false, 11, 10]);
  const O = ok([row('A0', '', 2, 6), row('A1', 'A0', 3, 2), row('A2', '', 1, 4), row('A3', 'A0', 5, 2), row('A4', '', 3, 6), row('A5', 'A0', 6, 1), row('A6', 'A2', 4, 4), row('A7', 'A2', 1, 6)], res(6), 'lim');
  const mo = K.optimum(O); const co = K.optimum(O, mo.nodes - 1);
  assert.deepEqual([mo.T, mo.proved, co.proved, co.T, co.lb], [15, true, false, 16, 15]);
});

test('T018 (revisión, N-F8): dos hitos encadenados en el mismo instante del paralelo: los dos empiezan antes que nada y la sucesora entra con su prioridad', () => {
  const p = ok([row('M1', '', 0, 0), row('M2', 'M1', 0, 0), row('X', 'M2', 2, 4), row('Y', '', 3, 4)], res(4), 'lim');
  const r = K.sgs(p, { scheme: 'p', dir: 'f', rule: 'spt' });
  assert.deepEqual([r.S.M1, r.S.M2, r.S.X, r.S.Y], [0, 0, 0, 2]);
});

test('T018 (revisión, N-F9): la espera por un recurso de la cadena crítica es solo si no cabía (uso justo igual a la disponibilidad sí cabe)', () => {
  const p = ok([row('A0', '', 2, 0), row('A1', 'A0', 4, 1), row('A2', '', 1, 4), row('A3', 'A2', 1, 3), row('A4', 'A2, A3', 2, 4)], res(4), 'lim');
  const r = K.sgs(p, { scheme: 's', dir: 'f', rule: 'slk' });
  assert.deepEqual(r.S, { A0: 0, A2: 0, A3: 1, A1: 2, A4: 6 });
  assert.deepEqual(K.chains(p, r.S, 'f'), [['A0', 'A1', 'A4']]);
});

test('T018 (revisión, N-F10): hacia atrás, serie y paralelo = la referencia en la red invertida con sus propios tiempos del CPM (500 tablas, con hitos)', () => {
  const rng = R.mulberry32(78);
  for (let i = 0; i < 500; i++) {
    const rows = randomTable(rng, R.int(rng, 2, 9), 2);
    const caps = [0, 1].map((k) => { const m = Math.max(1, ...rows.map((r) => Number(r[`r${k + 1}`]))); return String(R.int(rng, m, m + 4)); });
    const p = ok(rows, res(...caps), 'lim');
    const s = C.solve({ activities: p.activities.map((a) => ({ id: a.id, d: a.d })), preds: p.succs, succs: p.preds });
    const times = Object.fromEntries(p.activities.map((a) => [a.id, { ES: s.times[a.id].ES, LS: s.times[a.id].LS, LF: s.times[a.id].LF, TF: s.floats[a.id].TF }]));
    const q = Object.assign({}, p, { preds: p.succs, succs: p.preds, times, T: s.duration });
    for (const scheme of ['s', 'p']) {
      for (const rule of RULES) {
        const ref = refSgs(q, scheme, KEYS[rule](q));
        const T = Math.max(0, ...p.activities.map((a) => ref[a.id] + a.d));
        const want = Object.fromEntries(p.activities.map((a) => [a.id, T - ref[a.id] - a.d]));
        const got = K.sgs(p, { scheme, dir: 'b', rule });
        assert.deepEqual([got.T, got.S], [T, want], `tabla ${i}: ${scheme}b ${rule}`);
      }
    }
  }
});

test('T018 (revisión, N-F11): un hito no da overCap aunque su uso pase de la disponibilidad', () => {
  const { report } = K.parse([row('A', '', 2, 1), row('M', 'A', 0, 9)], res(5), 'lim');
  assert.deepEqual(report.errors, []);
});

test('T018 (revisión, ronda 2, F1): el óptimo cortado da la duración del calendario que da (pegado al comienzo, puede acabar antes que la mejor regla)', () => {
  // La tabla de la revisión (26 actividades, disponibilidades 11 y 13): la mejor regla dura 72; pegada al comienzo, 70.
  const p = ok([row('A0', '', 4, 1, 6), row('A1', '', 6, 7, 3), row('A2', 'A0', 4, 9, 9), row('A3', '', 5, 8, 5), row('A4', 'A1, A2', 2, 6, 0), row('A5', 'A1', 2, 6, 3), row('A6', 'A3, A5', 7, 2, 4), row('A7', '', 9, 8, 2), row('A8', 'A2', 6, 7, 7), row('A9', 'A5', 6, 5, 0), row('A10', 'A6', 3, 6, 2), row('A11', 'A5', 8, 1, 6), row('A12', 'A6, A7', 1, 7, 2), row('A13', 'A9, A11', 4, 5, 4), row('A14', 'A8, A11, A12', 6, 7, 8), row('A15', 'A14', 9, 6, 0), row('A16', 'A10, A11', 4, 3, 6), row('A17', 'A14, A15, A16', 2, 4, 1), row('A18', '', 2, 9, 8), row('A19', 'A18', 7, 4, 5), row('A20', 'A14', 1, 9, 4), row('A21', 'A15', 8, 3, 0), row('A22', 'A18, A20, A21', 4, 6, 4), row('A23', 'A17, A19, A20, A22', 7, 3, 1), row('A24', 'A19', 1, 7, 8), row('A25', 'A24', 9, 1, 4)], res(11, 13), 'lim');
  const o = K.optimum(p);
  assert.deepEqual([o.proved, o.T, Math.max(...p.activities.map((a) => o.S[a.id] + a.d))], [false, 70, 70]);
  assert.ok(Math.min(...K.compare(p).map((x) => x.T)) >= 72 && o.lb <= o.T);
  // Y en 3000 tablas pequeñas con el tope más pequeño: siempre la duración del calendario, válido, y la cota por debajo.
  const rng = R.mulberry32(31);
  for (let i = 0; i < 3000; i++) {
    const rows = randomTable(rng, R.int(rng, 2, 8), 2);
    const caps = [0, 1].map((k) => String(Math.max(1, ...rows.map((r) => Number(r[`r${k + 1}`])))));
    const q = ok(rows, res(...caps), 'lim');
    const x = K.optimum(q, 1);
    assert.equal(Math.max(0, ...q.activities.map((a) => x.S[a.id] + a.d)), x.T, `tabla ${i}`);
    assert.ok(x.lb <= x.T && K.check(q, x.S, 'lim').ok, `tabla ${i}`);
  }
});
