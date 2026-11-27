'use strict';
// js/rs: la parte sin DOM del controlador de la vista de recursos (spec f5c-recursos, AC8 y AC9; plan §4, P1; T009).
const test = require('node:test');
const assert = require('node:assert/strict');
const T = require('../js/rs.js');
const U = require('../js/core/urlstate.js');
const X = require('../js/core/resex.js');

const st = (extra) => Object.assign(U.defaults(), { v: 'rs' }, extra);
const row = (id, links, d, r1, r2, r3, name) => ({ id, name: name || '', links, d, r1: r1 || '', r2: r2 || '', r3: r3 || '' });

test('F5c T009: un ejemplo da su tabla, su fuente, su unidad, sus recursos y su modo', () => {
  for (const ex of X.list()) {
    for (const lang of ['es', 'en']) {
      const m = T.model(st({ we: ex.id }), lang);
      assert.deepEqual([m.src.kind, m.src.id, m.src.unit, m.src.source, m.mode], ['example', ex.id, ex.unit[lang], ex.source[lang], ex.mode]);
      assert.deepEqual(m.res.map((r) => [r.label, r.cap]), ex.res.map((r) => [r.name[lang], r.cap]));
      assert.equal(m.p.activities.length, ex.rows.length, ex.id);
      assert.deepEqual(m.report.errors, []);
    }
  }
  // Un ejemplo que no existe: el primero (Klastorin 8.1).
  assert.equal(T.model(st({ we: 'nada' }), 'en').src.id, 'k81');
});

test('F5c T009: el modo de la URL manda sobre el del ejemplo; con recursos limitados, la disponibilidad cuenta (overCap)', () => {
  assert.equal(T.model(st({ we: 'lg' }), 'es').mode, 'lev');
  assert.equal(T.model(st({ we: 'lg', wm: 'lim' }), 'es').mode, 'lim');
  assert.equal(T.model(st({ we: 'k85', wm: 'lev' }), 'es').mode, 'lev');
  // En un ejemplo, wr cambia la disponibilidad y un nombre vacío es el del ejemplo.
  const m = T.model(st({ we: 'k85', wr: [{ name: '', cap: 6 }] }), 'es');
  assert.deepEqual(m.res.map((r) => [r.label, r.cap]), [['Trabajadores', 6]]);
  assert.deepEqual(m.report.errors.map((e) => [e.code, e.ids[0]]), [['overCap', 'D'], ['overCap', 'E']]);
});

test('F5c T009: la tabla propia: un recurso sin límite si no hay wr; nombres por defecto «Recurso n»; hasta tres', () => {
  const wt = [row('A', '', '3', '2'), row('B', 'A', '2', '1')];
  let m = T.model(st({ we: 'own', wt }), 'es');
  assert.deepEqual([m.src.kind, m.src.title, m.mode, m.res.map((r) => [r.label, r.cap])], ['own', 'Tabla propia', 'lev', [['Recurso 1', null]]]);
  assert.ok(m.p);
  m = T.model(st({ we: 'own', wt, wr: [{ name: 'Grúa', cap: 2 }, { name: '', cap: null }, { name: 'Pintores', cap: 4 }] }), 'en');
  assert.deepEqual(m.res.map((r) => [r.label, r.cap]), [['Grúa', 2], ['Resource 2', null], ['Pintores', 4]]);
  // Las filas del editor de recursos: siempre tres, con lo escrito.
  assert.deepEqual(T.resRows(st({ we: 'own', wt, wr: [{ name: 'Grúa', cap: 2 }] })), [{ name: 'Grúa', cap: '2' }, { name: '', cap: '' }, { name: '', cap: '' }]);
  // Lo escrito en el editor → wr: se quitan los recursos sin nombre del final (el primero siempre cuenta).
  assert.deepEqual(T.resFromRows([{ name: 'Grúa', cap: '2' }, { name: '', cap: '' }, { name: '', cap: '' }]), [{ name: 'Grúa', cap: '2' }]);
  assert.deepEqual(T.resFromRows([{ name: '', cap: '' }, { name: '', cap: '5' }, { name: 'C', cap: '' }]), [{ name: '', cap: '' }, { name: '', cap: '5' }, { name: 'C', cap: '' }]);
  assert.deepEqual(T.resFromRows([{ name: '', cap: '' }, { name: '', cap: '' }, { name: '', cap: '' }]), [{ name: '', cap: '' }]);
});

test('F5c T009: marcas de la tabla propia: campos con error, avisos, hitos y el texto de cada uno, en los dos idiomas', () => {
  const wt = [row('A', '', '4', '3', '2'), row('B', 'A', '2.5', '1'), row('C', 'A', '3', '12', '1'), row('D', 'B, C', '2', '', ''), row('E', 'C', '0', '2'), row('F', 'D, E', '3', '-1', '2'), row('G', 'Z', '1', '1')];
  const wr = [{ name: 'Trabajadores', cap: 10 }, { name: 'Grúa', cap: null }];
  for (const lang of ['es', 'en']) {
    const m = T.model(st({ we: 'own', wt, wr, wm: 'lim' }), lang);
    assert.equal(m.p, null);
    const mk = T.rowMarks(m, lang);
    assert.deepEqual([...mk.rows.get(1).bad], ['d']);
    assert.deepEqual([...mk.rows.get(2).bad], ['r1']);
    assert.deepEqual([...mk.rows.get(3).warn], ['r1', 'r2']);
    assert.deepEqual(mk.rows.get(4).msgs.map((x) => x.kind), ['info']);
    assert.deepEqual([...mk.rows.get(5).bad], ['r1']);
    assert.deepEqual([...mk.rows.get(6).bad], ['links']);
    assert.deepEqual(mk.badRows, ['B', 'C', 'F', 'G']);
    for (const r of mk.rows.values()) for (const x of r.msgs) assert.ok(x.text && !/\{|undefined/.test(x.text), x.text);
    const over = mk.rows.get(2).msgs[0].text;
    assert.ok(over.includes('12') && over.includes('10') && over.includes('Trabajadores'), over);
  }
  // Nivelando, la disponibilidad no cuenta: C no da error.
  const lev = T.model(st({ we: 'own', wt: [wt[0], wt[2], row('D', 'C', '2', '', ''), wt[4]], wr, wm: 'lev' }), 'es');
  assert.ok(lev.p);
  assert.deepEqual(lev.report.warnings.map((w) => w.code), ['noUse']);
});

test('F5c T009: pegar desde una hoja de cálculo (con cabeceras o sin ellas) con tantos usos como recursos', () => {
  const text = 'Actividad\tNombre\tPredecesoras\tDuración\tTrabajadores\tGrúa\nA\tCimientos\t\t4\t3\t1\nB\t\tA\t2\t5\n';
  assert.deepEqual(T.pasteRows(text, 2), [row('A', '', '4', '3', '1', '', 'Cimientos'), row('B', 'A', '2', '5', '', '')]);
  assert.deepEqual(T.pasteRows('A;;;3;2;1;9', 1), [row('A', '', '3', '2', '', '')]);
  assert.deepEqual(T.pasteRows('  \n', 1), []);
});

test('F5c T009: «Partir del taller» lleva las filas del taller tal cual', () => {
  assert.deepEqual(T.workRows([{ id: 'A', name: 'x', duration: 3, links: '' }]), [{ id: 'A', name: 'x', duration: '3', links: '' }]);
});

// ---------- T010: calendarios de la nivelación, movimientos a mano y comparación (tableros 131–134) ----------

test('F5c T010: los cinco calendarios de la nivelación de Klastorin 8.1 (temprano 21, tardío 16, Burgess y mínimo 16)', () => {
  const m = T.model(st({ we: 'k81' }), 'es');
  const peak = (wc, extra) => { const c = T.calendar(m, st(Object.assign({ we: 'k81', wc }, extra))); return [c.wc, T.stats(m, c.S, 0).peak, T.stats(m, c.S, 0).ssq]; };
  assert.deepEqual(peak('es'), ['es', 21, 1877]);
  assert.deepEqual(peak('ls'), ['ls', 16, 1839]);
  assert.deepEqual(peak('man'), ['man', 21, 1877]);
  assert.deepEqual(peak('bur'), ['bur', 16, 1735]);
  assert.deepEqual(peak('min'), ['min', 16, 1735]);
  // Un calendario de recursos limitados, al nivelar, es el temprano.
  assert.deepEqual(peak('opt'), ['es', 21, 1877]);
  const lv = T.levData(m, 0);
  assert.deepEqual([lv.bur.passes, lv.min.peak, lv.min.proved], [2, 16, true]);
  // Con un tope de 3 nodos, el mínimo no queda demostrado y da su cota.
  const cut = T.levData(m, 0, 3).min;
  assert.equal(cut.proved, false);
  assert.ok(cut.lb <= cut.peak);
  // La comparación: una fila por calendario, con el pico y la suma de cuadrados de cada recurso.
  const rows = T.compareRows(m, st({ we: 'k81' }));
  assert.deepEqual(rows.map((r) => [r.cal, r.stats[0].peak, r.stats[0].ssq]), [['es', 21, 1877], ['ls', 16, 1839], ['man', 21, 1877], ['bur', 16, 1735], ['min', 16, 1735]]);
});

test('F5c T010: LOGON: el recurso que se nivela (wk) y cómo cambia el otro; wk fuera de los recursos es el primero', () => {
  const m = T.model(st({ we: 'lg' }), 'es');
  const s1 = T.calendar(m, st({ we: 'lg', wc: 'bur', wk: 1 })).S;
  assert.deepEqual([T.stats(m, s1, 0).peak, T.stats(m, s1, 1).peak], [19, 16]);
  assert.equal(T.levelK(m, st({ we: 'lg', wk: 2 })), 0);
  const min0 = T.calendar(m, st({ we: 'lg', wc: 'min', wk: 0 })).S;
  assert.equal(T.stats(m, min0, 0).peak, 15);
});

test('F5c T010: movimientos a mano: entre ES y LS; una predecesora o una sucesora que choca no se aplica y se dice cuál (P3)', () => {
  const m = T.model(st({ we: 'lg' }), 'es');
  const S0 = T.calendar(m, st({ we: 'lg', wc: 'man' })).S;
  assert.deepEqual(T.moveCheck(m, S0, 'Q', S0.Q + 2), { ok: false, reason: 'succ', id: 'Q', other: 'T', end: S0.Q + 7, start: S0.T });
  assert.deepEqual(T.moveCheck(m, S0, 'Q', S0.Q - 1), { ok: false, reason: 'window', id: 'Q', lo: m.p.times.Q.ES, hi: m.p.times.Q.LS });
  assert.deepEqual(T.moveCheck(m, S0, 'P', S0.P + 2), { ok: true });
  // T se mueve primero; después Q ya cabe. Una predecesora que choca: retrasar T y luego adelantar no se puede si Q acaba después.
  const S1 = Object.assign({}, S0, { T: S0.T + 2 });
  assert.deepEqual(T.moveCheck(m, S1, 'Q', S0.Q + 2), { ok: true });
  const S2 = Object.assign({}, S1, { Q: S0.Q + 2 });
  assert.deepEqual(T.moveCheck(m, S2, 'T', S0.T), { ok: false, reason: 'pred', id: 'T', other: 'Q', end: S0.Q + 7, start: S0.T });
  for (const lang of ['es', 'en']) {
    for (const c of [T.moveCheck(m, S0, 'Q', S0.Q + 2), T.moveCheck(m, S0, 'Q', S0.Q - 1), T.moveCheck(m, S2, 'T', S0.T)]) {
      const text = T.moveText(c, lang);
      assert.ok(text && !/\{|undefined|^rs\./.test(text), text);
    }
  }
  // Los movimientos guardados (wq): se aplican en orden y se descartan los que ya no valen.
  const man = T.manual(m, [['T', S0.T + 2], ['Q', S0.Q + 2], ['ZZ', 3], ['H', 4], ['P', S0.P + 2]]);
  assert.deepEqual(man.moves, [['T', S0.T + 2], ['Q', S0.Q + 2], ['P', S0.P + 2]]);
  assert.deepEqual([man.S.T, man.S.Q, man.S.P, man.S.H], [S0.T + 2, S0.Q + 2, S0.P + 2, 0]);
  // Volver a su comienzo temprano quita el movimiento de la lista.
  assert.deepEqual(T.withMove(m, man.moves, 'P', S0.P), [['T', S0.T + 2], ['Q', S0.Q + 2]]);
  assert.deepEqual(T.withMove(m, man.moves, 'R', 22), [['T', S0.T + 2], ['Q', S0.Q + 2], ['P', S0.P + 2], ['R', 22]]);
});

// ---------- T011: recursos limitados (tableros 135, 138 y 140) ----------

test('F5c T011: Klastorin 8.5: la regla (serie, menor holgura) da 17, Baker 13, el óptimo 14 demostrado; la comparación, 7 reglas × 4 esquemas', () => {
  const m = T.model(st({ we: 'k85' }), 'es');
  const c = T.limCalendar(m, st({ we: 'k85' }));
  assert.deepEqual([c.wc, c.T, c.chains], ['sgs', 17, [['B', 'D', 'A', 'C', 'E']]]);
  const ld = T.limData(m);
  assert.deepEqual([ld.bound.bound, ld.opt.T, ld.opt.proved, ld.cmp.length], [13, 14, true, 28]);
  assert.equal(T.limCalendar(m, st({ we: 'k85', wc: 'sgs', ws: 'sf', wp: 'lft' })).T, 14);
  assert.equal(T.limCalendar(m, st({ we: 'k85', wc: 'opt' })).T, 14);
  // Un calendario de la nivelación (también el temprano, el de siempre), con recursos limitados, es el de la regla.
  for (const wc of ['es', 'ls', 'bur', 'min']) assert.equal(T.limCalendar(m, st({ we: 'k85', wc })).wc, 'sgs');
  // Hacia atrás, la cadena se lee igual (de la que empieza en 0 a la que acaba al final).
  const back = T.limCalendar(m, st({ we: 'k85', ws: 'sb', wp: 'slk' }));
  assert.equal(back.T, 14);
  for (const ch of back.chains) assert.equal(back.S[ch[0]], 0);
});

test('F5c T011: LOGON con un inspector: óptimo 49 con dos cadenas críticas; sus esperas por el inspector', () => {
  const m = T.model(st({ we: 'lgi' }), 'es');
  const c = T.limCalendar(m, st({ we: 'lgi', wc: 'opt' }));
  assert.equal(c.T, 49);
  assert.equal(c.chains.length, 2);
  const w = T.chainMarks(m, c.chains);
  assert.ok(w.waits.some(([u, v]) => u === 'K' && v === 'P'));
  assert.ok(w.edges.has('H>J'));
  assert.ok(w.nodes.has('Z'));
});

test('F5c T011: a mano con recursos limitados (C2): empieza vacío; se coloca una a una con cada motivo; los de wq que ya no valen se descartan', () => {
  const m = T.model(st({ we: 'gb' }), 'es');
  let man = T.manualLim(m, null);
  assert.deepEqual([man.S, man.complete], [{}, false]);
  man = T.manualLim(m, [['J', 0], ['M', 6]]);
  assert.deepEqual(man.S, { J: 0, M: 6 });
  assert.deepEqual(T.placeCheck(m, man.S, 'L', 6), { ok: false, reason: 'over', id: 'L', res: 0, period: 7, use: 10, cap: 8 });
  assert.deepEqual(T.placeCheck(m, man.S, 'Y', 12), { ok: false, reason: 'unplaced', id: 'Y', other: 'V' });
  assert.deepEqual(T.placeCheck(m, man.S, 'L', 4), { ok: false, reason: 'pred', id: 'L', other: 'J', end: 6, start: 4 });
  assert.deepEqual(T.placeCheck(m, Object.assign({}, man.S, { V: 10 }), 'M', 8), { ok: false, reason: 'succ', id: 'M', other: 'V', end: 12, start: 10 });
  assert.deepEqual(T.placeCheck(m, man.S, 'L', 10), { ok: true });
  for (const lang of ['es', 'en']) {
    for (const c of [T.placeCheck(m, man.S, 'L', 6), T.placeCheck(m, man.S, 'Y', 12), T.placeCheck(m, man.S, 'L', 4), T.placeCheck(m, Object.assign({}, man.S, { V: 10 }), 'M', 8)]) {
      const text = T.placeText(c, lang, m);
      assert.ok(text && !/\{|undefined|^rs\./.test(text), text);
    }
  }
  assert.match(T.placeText(T.placeCheck(m, man.S, 'L', 6), 'es', m), /periodo 7.*10 analistas.*8/i);
  // wq con uno que ya no vale (L encima de M) y uno que no existe: se descartan.
  man = T.manualLim(m, [['J', 0], ['M', 6], ['L', 6], ['ZZ', 1], ['L', 10]]);
  assert.deepEqual(man.moves, [['J', 0], ['M', 6], ['L', 10]]);
  // Todas colocadas: el calendario está completo y tiene su duración.
  const all = T.manualLim(m, [['J', 0], ['M', 6], ['L', 10], ['V', 10], ['Q', 12], ['Y', 16], ['Z', 24]]);
  assert.deepEqual([all.complete, all.T], [true, 26]);
  assert.deepEqual(T.withPlace(all.moves, 'Q', null).map(([id]) => id), ['J', 'M', 'L', 'V', 'Y', 'Z']);
  assert.deepEqual(T.withPlace([['J', 0]], 'J', 2), [['J', 2]]);
});

// ---------- T012: el paso a paso con predicción (AC5; tableros 133, 136 y 137; plan P9, `analyze` C4) ----------

const PRD = require('../js/predict.js');
const ans = (pairs) => new Map(pairs);

test('F5c T012: la traza de la vista: Burgess al nivelar con «Burgess»; el esquema y la regla con recursos limitados; nada con otro calendario', () => {
  let m = T.model(st({ we: 'k81', wc: 'bur' }), 'es');
  let tr = T.trace(m);
  assert.deepEqual(tr.map((s) => s.kind), ['rsTable', 'rsMove', 'rsMove', 'rsMove', 'rsMove', 'rsMove', 'rsMove', 'rsEnd']);
  assert.deepEqual(tr.cfg, { kind: 'bur', k: 0 });
  assert.equal(T.trace(m), tr, 'se guarda');
  // LOGON, nivelando el equipo (wk = 1).
  assert.deepEqual(T.trace(T.model(st({ we: 'lg', wc: 'bur', wk: 1 }), 'es')).cfg, { kind: 'bur', k: 1 });
  for (const wc of ['es', 'ls', 'man', 'min']) assert.equal(T.trace(T.model(st({ we: 'k81', wc }), 'es')), null, wc);
  // Recursos limitados: el calendario de la regla (también el que se ve por defecto) con su esquema y su regla.
  m = T.model(st({ we: 'k85' }), 'es');
  tr = T.trace(m);
  assert.deepEqual(tr.cfg, { kind: 'sgs', scheme: 's', dir: 'f', rule: 'slk' });
  assert.deepEqual(tr.filter((s) => s.kind === 'rsPick').map((s) => [s.id, s.start]), [['B', 0], ['D', 3], ['A', 8], ['C', 12], ['E', 13]]);
  tr = T.trace(T.model(st({ we: 'n723', ws: 'pf', wp: 'slk' }), 'es'));
  assert.deepEqual(tr.filter((s) => s.kind === 'rsTime').map((s) => [s.t, s.started.join()]), [[0, 'B,A'], [1, ''], [2, 'C'], [4, 'F,E'], [7, ''], [10, 'D']]);
  for (const wc of ['opt', 'man']) assert.equal(T.trace(T.model(st({ we: 'k85', wc }), 'es')), null, wc);
  // Hacia atrás: la red al revés (las sucesoras pasan a ser predecesoras).
  tr = T.trace(T.model(st({ we: 'k85', ws: 'sb' }), 'es'));
  assert.deepEqual([tr.cfg.dir, tr.q.preds.B, tr[tr.length - 1].T, tr[tr.length - 1].reversed], ['b', ['C', 'D'], 14, true]);
  // Sin proyecto, no hay traza.
  assert.equal(T.trace(T.model(st({ we: 'own', wt: [row('A', 'Z', '1', '1')] }), 'es')), null);
});

test('F5c T012 · AC5: predict corrige rs.pick, rs.start y rs.set con core/resource (empates y cada motivo)', () => {
  // Serie, Klastorin 8.5: en el paso 2 son elegibles D (holgura 0) y A (3); en el 3, A empieza en 8.
  const s85 = T.trace(T.model(st({ we: 'k85' }), 'es'));
  assert.deepEqual(s85[2].reveals.map(PRD.key), ['rs.pick', 'rs.start']);
  assert.equal(PRD.hasPrediction(s85[2]), true);
  const chk = (step, pairs) => Object.fromEntries(PRD.check(step, ans(pairs)));
  assert.deepEqual(chk(s85[2], [['rs.pick', 'D'], ['rs.start', '3']]), { 'rs.pick': 'ok', 'rs.start': 'ok' });
  assert.deepEqual(chk(s85[2], [['rs.pick', 'A'], ['rs.start', '2']]), { 'rs.pick': 'wrong', 'rs.start': 'wrong' });
  assert.deepEqual(chk(s85[2], [['rs.pick', 'C']]), { 'rs.pick': 'wrong', 'rs.start': 'empty' });
  assert.deepEqual(chk(s85[3], [['rs.pick', ''], ['rs.start', '8']]), { 'rs.pick': 'empty', 'rs.start': 'ok' });
  for (const v of ['3', '9', '8.5', 'x']) assert.equal(chk(s85[3], [['rs.start', v]])['rs.start'], 'wrong', v);
  // Burgess, Klastorin 8.1: F vale en cualquiera de los de menor suma de cuadrados (8 a 11).
  const b81 = T.trace(T.model(st({ we: 'k81', wc: 'bur' }), 'es'));
  for (const v of ['8', '9', '11']) assert.equal(chk(b81[2], [['rs.start', v]])['rs.start'], 'ok', v);
  for (const v of ['5', '12', '1', '7.5']) assert.equal(chk(b81[2], [['rs.start', v]])['rs.start'], 'wrong', v);
  // Paralelo, Nicholas 7.23 en el instante 4: F y E.
  const p723 = T.trace(T.model(st({ we: 'n723', ws: 'pf' }), 'es'));
  const t4 = p723.find((s) => s.t === 4);
  assert.deepEqual(t4.reveals.map(PRD.key), ['rs.set']);
  assert.equal(chk(t4, [['rs.set', new Set(['E', 'F'])]])['rs.set'], 'ok');
  for (const g of [['F', 'D'], ['F'], ['D'], ['F', 'E', 'D']]) assert.equal(chk(t4, [['rs.set', new Set(g)]])['rs.set'], 'wrong', g.join());
  assert.equal(chk(t4, [['rs.set', new Set()]])['rs.set'], 'empty');
  // Un instante en que no empieza ninguna no se pregunta.
  assert.equal(PRD.hasPrediction(p723.find((s) => s.t === 1)), false);
});

test('F5c T012 · AC5: los mensajes de la predicción (tableros 133, 136 y 137), en los dos idiomas', () => {
  const fb = (we, extra, k, pairs, lang) => {
    const m = T.model(st(Object.assign({ we }, extra)), lang || 'es');
    return T.feedback(m, T.trace(m), k, ans(pairs), lang || 'es');
  };
  // Serie (136): qué actividad toca.
  assert.deepEqual(fb('k85', {}, 2, [['rs.pick', 'D'], ['rs.start', '3']]).map((x) => x.kind), ['ok', 'ok']);
  assert.match(fb('k85', {}, 2, [['rs.pick', 'D']])[0].text, /^Sí: la regla elige D\./);
  assert.match(fb('k85', {}, 3, [['rs.pick', 'C']])[0].text, /^C no es elegible: le falta A por colocar\./);
  assert.match(fb('k85', {}, 2, [['rs.pick', 'A']])[0].text, /^La regla elige otra: D va antes \(holgura total: 0, frente a 3 de A\)\./);
  // Serie: cuándo empieza.
  assert.match(fb('k85', {}, 2, [['rs.pick', 'D'], ['rs.start', '2']])[1].text, /^Demasiado pronto: las predecesoras de D acaban en 3\./);
  assert.match(fb('k85', {}, 3, [['rs.pick', 'A'], ['rs.start', '3']])[1].text, /^No cabe en 3: en el periodo 4 harían falta 11 trabajadores y hay 9\./);
  assert.match(fb('k85', {}, 3, [['rs.pick', 'A'], ['rs.start', '9']])[1].text, /^Más tarde de lo necesario: A cabe antes, en 8\./);
  assert.match(fb('k85', {}, 3, [['rs.pick', 'A'], ['rs.start', '8']])[1].text, /^Sí: A empieza en 8\./);
  assert.match(fb('k85', {}, 3, [['rs.pick', 'A'], ['rs.start', '']])[1].text, /^No ha escrito el comienzo; es 8\./);
  // Burgess (133).
  assert.match(fb('k81', { wc: 'bur' }, 2, [['rs.start', '5']])[0].text, /^No es la menor: con 5, la suma de cuadrados es 1815; hay un comienzo con 1735\./);
  assert.match(fb('k81', { wc: 'bur' }, 2, [['rs.start', '12']])[0].text, /^Fuera de su ventana: F solo puede empezar entre 2 y 11\./);
  assert.match(fb('k81', { wc: 'bur' }, 2, [['rs.start', '11']])[0].text, /^Sí: con 11, la suma de cuadrados es la menor \(1735\)\.$/);
  assert.match(fb('k81', { wc: 'bur' }, 2, [['rs.start', '9']])[0].text, /^Sí: con 9, .*Con empate, Burgess se queda con el más tardío: 11\./);
  // Paralelo (137).
  const t4 = (pairs, lang) => fb('n723', { ws: 'pf' }, 4, pairs, lang);
  assert.match(t4([['rs.set', new Set(['F', 'E'])]])[0].text, /^Sí: empiezan F y E\./);
  assert.match(t4([['rs.set', new Set(['F', 'D'])]])[0].text, /^No caben todas: con F y D, en el periodo 5 harían falta 15 trabajadores y hay 10\./);
  assert.match(t4([['rs.set', new Set(['F'])]])[0].text, /^Cabe una más: E también cabe en 4\./);
  assert.match(t4([['rs.set', new Set(['D'])]])[0].text, /^La regla va primero: F \(holgura total: 0\) va antes que D \(7\)\./);
  assert.match(t4([['rs.set', new Set()]])[0].text, /^Elija al menos una actividad\./);
  for (const pairs of [[['rs.set', new Set(['F', 'D'])]], [['rs.set', new Set(['F'])]], [['rs.set', new Set(['D'])]], [['rs.set', new Set(['F', 'E'])]]]) {
    for (const x of t4(pairs, 'en')) assert.ok(x.text && !/[{}]|undefined|^rs\./.test(x.text), x.text);
  }
  assert.match(t4([['rs.set', new Set(['F', 'D'])]], 'en')[0].text, /^Not all of them fit: with F and D, period 5 would need 15 workers and there are 10\./);
});

test('F5c T012: lo que enseña cada paso: el calendario antes o después, el instante, las claves de la regla y la red al revés', () => {
  // Las columnas de la prioridad de cada regla (los valores, como se leen: más recursos y ACTIM, de mayor a menor).
  assert.deepEqual(T.keyCols('slk').map((c) => c.k), ['tf', 'ls']);
  assert.deepEqual(T.keyCols('res').map((c) => c.sign), [-1]);
  for (const r of ['slk', 'lft', 'spt', 'res', 'act', 'esf', 'lsf']) {
    for (const lang of ['es', 'en']) for (const c of T.keyCols(r)) assert.ok(!/^rs\./.test(T.keyLabel(c, lang)), `${r} ${c.k}`);
  }
  let m = T.model(st({ we: 'k81', wc: 'bur' }), 'es');
  let tr = T.trace(m);
  // Burgess, paso 2 (F): antes, F en 2; después, en 11.
  assert.equal(T.walkView(m, tr, 2, true).S.F, 2);
  assert.equal(T.walkView(m, tr, 2, false).S.F, 11);
  assert.equal(T.walkView(m, tr, 2, false).sel, 'F');
  // Paralelo: la línea del instante; antes de comprobar, sin F ni E.
  m = T.model(st({ we: 'n723', ws: 'pf' }), 'es');
  tr = T.trace(m);
  const k4 = tr.findIndex((s) => s.t === 4);
  const v = T.walkView(m, tr, k4, true);
  assert.deepEqual([v.now, v.S.F, v.S.C, v.T], [4, undefined, 2, 11]);
  assert.deepEqual(T.walkView(m, tr, k4, false).S.F, 4);
  // Hacia atrás: el tiempo de la red al revés hasta el final, que da la vuelta al calendario.
  m = T.model(st({ we: 'k85', ws: 'sb' }), 'es');
  tr = T.trace(m);
  assert.equal(T.walkView(m, tr, 1, false).back, true);
  assert.deepEqual(T.walkView(m, tr, 1, false).S, { E: 0 });
  const end = T.walkView(m, tr, tr.length - 1, false);
  assert.deepEqual([end.back, end.S.E, end.T], [false, 10, 14]);
});
