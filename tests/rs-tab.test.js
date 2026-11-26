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
