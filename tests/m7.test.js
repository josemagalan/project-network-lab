// F4b T010 · la parte sin DOM de M7 (js/m7.js): el modelo de la vista (proyecto, distribución de cada actividad, discretas
// escritas, normal de M6, plazo, simulación y cuenta exacta), las probabilidades escritas y los resultados de una simulación.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const U = require('../js/core/urlstate.js');
const S = require('../js/core/sim.js');
const MC = require('../js/core/mc.js');
const M7 = require('../js/m7.js');

const st = (extra) => Object.assign(U.defaults(), { v: 'unc', ex: null, um: 'm7', lang: 'es' }, extra || {});
const close = (a, b, tol = 1e-9, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg || ''}: ${a} frente a ${b}`);

test('parseProb: decimales con coma o punto y fracciones; fmtProb las escribe como se leen', () => {
  assert.deepEqual(M7.parseProb('0,2'), { value: 0.2 });
  assert.deepEqual(M7.parseProb(' 0.25 '), { value: 0.25 });
  assert.deepEqual(M7.parseProb('1/3'), { value: 1 / 3 });
  assert.deepEqual(M7.parseProb('1'), { value: 1 });
  for (const bad of ['', 'x', '1/0', '-0.2', '1/', '0,2,3']) assert.ok(M7.parseProb(bad).error, bad);
  assert.equal(M7.fmtProb(0.2, 'es'), '0,2');
  assert.equal(M7.fmtProb(0.2, 'en'), '0.2');
  assert.equal(M7.fmtProb(1 / 3, 'es'), '1/3');
  assert.equal(M7.fmtProb(4 / 6, 'en'), '2/3');
  assert.equal(M7.fmtProb(1 / 6, 'en'), '1/6');
  assert.equal(M7.fmtProb(1, 'es'), '1');
});

test('Klastorin por defecto: beta-PERT en todas, medias y varianzas de la distribución, normal de M6 con las fórmulas de examen (A2)', () => {
  const m = M7.model(st(), 'es');
  assert.equal(m.ok, true);
  assert.equal(m.src.id, 'kl');
  assert.equal(m.discrete, false);
  assert.deepEqual(m.acts.map((a) => a.kind), ['pert', 'pert', 'pert', 'pert', 'pert', 'pert']);
  close(m.acts[0].var, 4.888888888888888, 1e-9, 'varianza de la beta-PERT de A');
  close(m.normal.mu, 23.833333333333332, 1e-9);
  close(m.normal.var, 8.25, 1e-9);
  assert.deepEqual(m.normal.path, ['A', 'C', 'E', 'F']);
  assert.equal(m.deadline, 25);
  assert.equal(m.pct, 0.95);
  assert.equal(m.sim.n, 10000);
  assert.equal(m.sim.us, 2026);
  assert.equal(m.exact.notDiscrete, true);
  assert.equal(m.mixed, false);
});

test('ug para todas y uf por actividad; con distribuciones distintas, «varias»; el núcleo da la media y la varianza', () => {
  const m = M7.model(st({ ug: 'unif', uf: { B: 'logn', C: 'disc' } }), 'es');
  assert.deepEqual(m.acts.map((a) => a.kind), ['unif', 'logn', 'disc', 'unif', 'unif', 'unif']);
  assert.equal(m.mixed, true);
  const A = m.acts[0];
  close(A.mean, 8, 1e-12, 'uniforme en [2, 14]');
  close(A.var, 12, 1e-12);
  const C = m.acts[2];
  assert.deepEqual(C.dist, MC.distFor('disc', { a: 2, m: 8, b: 13 }));
  assert.equal(C.edited, false);
  // La normal de M6 no cambia con la distribución elegida (A2).
  close(m.normal.mu, 23.833333333333332, 1e-9);
  // Ni la simulación ni la clave dependen del idioma.
  assert.equal(M7.model(st({ ug: 'unif', uf: { B: 'logn', C: 'disc' } }), 'en').sim.key, m.sim.key);
});

test('Discreta escrita (uq): se lee con fracciones y se conserva aunque cambien a, m y b (A4); con errores no se simula', () => {
  const good = M7.model(st({ uf: { C: 'disc' }, uq: { C: { x: ['2', '8', '13'], p: ['1/4', '0,5', '0.25'] } } }), 'es');
  const C = good.acts[2];
  assert.equal(C.edited, true);
  assert.deepEqual(C.dist, { kind: 'disc', x: [2, 8, 13], p: [0.25, 0.5, 0.25] });
  close(C.mean, 7.75, 1e-12);
  assert.equal(good.ok, true);
  // La normal de M6 toma la media y la varianza de la discreta escrita (A2).
  const v = 0.25 * 4 + 0.5 * 64 + 0.25 * 169 - 7.75 * 7.75;
  close(good.normal.var, 4 + v + 4 / 9 + 4 / 9, 1e-9, 'σ² de A–C–E–F con la discreta de C');
  for (const [q, code] of [[{ x: ['2', '8', '13'], p: ['0.2', '0.5', '0.2'] }, 'sum'], [{ x: ['2', '2'], p: ['0.5', '0.5'] }, 'repeated'],
    [{ x: ['-1', '3'], p: ['0.5', '0.5'] }, 'negative'], [{ x: ['2', 'x'], p: ['0.5', '0.5'] }, 'nan'], [{ x: ['2', '3'], p: ['1', '0'] }, 'prob']]) {
    const m = M7.model(st({ uf: { C: 'disc' }, uq: { C: q } }), 'es');
    assert.equal(m.acts[2].err, code, JSON.stringify(q));
    assert.equal(m.ok, false);
    assert.deepEqual(m.discErrors.map((e) => e.id), ['C']);
  }
  // Una discreta escrita de una actividad que no la usa se ignora.
  assert.equal(M7.model(st({ uq: { C: { x: ['1'], p: ['0.5'] } } }), 'es').ok, true);
});

test('Ejemplos discretos: solo discretas, sin a, m ni b; la cuenta exacta y la normal con sus momentos', () => {
  const m = M7.model(st({ ue: 'kd', ud: null }), 'es');
  assert.equal(m.discrete, true);
  assert.deepEqual(m.acts.map((a) => [a.kind, a.a]), [['disc', null], ['disc', null], ['disc', null], ['disc', null]]);
  assert.equal(m.deadline, 20);
  close(m.exact.mean, 23.248, 1e-9);
  close(m.exact.crit[2], 0.66, 1e-9);
  // ug no cambia nada en un ejemplo discreto; uf tampoco, salvo la propia discreta.
  assert.equal(M7.model(st({ ue: 'kd', ug: 'logn', uf: { A: 'unif' } }), 'es').sim.key, m.sim.key);
  const w = M7.model(st({ ue: 'wd' }), 'en');
  assert.equal(w.ok, true);
  assert.equal(w.deadline, Math.ceil(w.normal.mu + Math.sqrt(w.normal.var)), 'sin plazo en la fuente, μ + σ redondeado arriba');
  const e = M7.model(st({ ue: 'kd', uq: { A: { x: ['7', '9'], p: ['0.5', '0.5'] } } }), 'es');
  assert.equal(e.acts[0].edited, true);
  close(e.acts[0].mean, 8, 1e-12);
});

test('Tabla propia con errores de a, m o b: los errores de M5 y nada que simular', () => {
  const ut = { mode: 'pred', rows: [{ id: 'A', name: '', a: '3', m: '2', b: '5', links: '' }, { id: 'B', name: '', a: '1', m: '2', b: '3', links: 'A' }] };
  const m = M7.model(st({ ue: 'own', ut }), 'es');
  assert.equal(m.ok, false);
  assert.equal(m.issues[0].code, 'aGtM');
  assert.equal(m.sim, null);
  const okm = M7.model(st({ ue: 'own', ut: { mode: 'pred', rows: [Object.assign({}, ut.rows[1], { links: '' }), { id: 'C', name: '', a: '4', m: '4', b: '4', links: 'B' }] } }), 'es');
  assert.equal(okm.ok, true);
  assert.equal(okm.acts[1].var, 0, 'a = m = b: fija');
});

test('Réplicas (10^ur), semilla, plazo, percentil y correlación salen del estado', () => {
  const m = M7.model(st({ ur: 3, us: 77, ud: 27.5, uv: 80, uo: 's' }), 'es');
  assert.equal(m.sim.n, 1000);
  assert.equal(m.sim.us, 77);
  assert.equal(m.deadline, 27.5);
  assert.equal(m.pct, 0.8);
  assert.equal(m.corr, 'spearman');
  assert.notEqual(m.sim.key, M7.model(st({ ur: 3, us: 78 }), 'es').sim.key);
});

test('results: media con su intervalo, desviación, P(≤ plazo) con el suyo, percentiles y los de la normal de M6', () => {
  const m = M7.model(st(), 'es');
  const res = S.run({ kind: 'project', model: m.sim.model, n: m.sim.n, us: m.sim.us, track: true });
  const r = M7.results(m, res);
  const su = S.summary(res.durations);
  close(r.mean, su.mean, 1e-12);
  close(r.sd, su.sd, 1e-12);
  close(r.seMean, su.sd / 100, 1e-12);
  close(r.pT, su.pLE(25), 1e-12);
  close(r.seP, Math.sqrt(r.pT * (1 - r.pT) / 10000), 1e-12);
  const sorted = Float64Array.from(res.durations).sort();
  assert.deepEqual(r.q.map((x) => x.p), [0.5, 0.8, 0.9, 0.95]);
  for (const x of r.q) close(x.sim, MC.percentile(sorted, x.p), 0);
  close(r.q[0].normal, m.normal.mu, 1e-9);
  close(r.q[3].normal, m.normal.mu + 1.6448536269514722 * Math.sqrt(8.25), 1e-6);
  close(r.pN, 0.6576952657166104, 1e-9);
  assert.ok(r.mean > 23.83 && r.pT < 0.66, 'AC5');
  // El percentil elegido se añade si no es uno de los tres fijos, en su orden.
  const r2 = M7.results(M7.model(st({ uv: 85 }), 'es'), res);
  assert.deepEqual(r2.q.map((x) => x.p), [0.5, 0.8, 0.85, 0.9]);
});

test('tornadoOrder: por criticidad o por crucialidad, de mayor a menor, con empates por id (orden natural)', () => {
  const rows = [{ id: 'A10', crit: 0.5, cruc: 0.2 }, { id: 'A2', crit: 0.5, cruc: 0.9 }, { id: 'B', crit: 1, cruc: 0.1 }];
  assert.deepEqual(M7.tornadoOrder(rows, 'c').map((r) => r.id), ['B', 'A2', 'A10']);
  assert.deepEqual(M7.tornadoOrder(rows, 'u').map((r) => r.id), ['A2', 'A10', 'B']);
});

// ---------- T011: réplica a réplica y convergencia ----------

test('trace: las 20 primeras réplicas de la misma simulación, con la duración (uh=t) o el camino crítico (uh=p) que predecir', () => {
  const s = st({ uy: 'rep' });
  const m = M7.model(s, 'es');
  const tr = M7.trace(s, m);
  assert.equal(tr.length, 20);
  const full = S.run({ kind: 'project', model: m.sim.model, n: m.sim.n, us: m.sim.us, track: true });
  tr.forEach((step, k) => {
    assert.equal(step.kind, 'm7.rep');
    assert.equal(step.k, k);
    assert.equal(step.rep.T, full.durations[k], `réplica ${k + 1}`);
    assert.deepEqual(step.reveals, [{ act: 'R', field: 'm7.T', value: full.durations[k] }]);
  });
  assert.deepEqual(tr[3].crit, ['A–D'], 'la réplica 4 de Klastorin: D se alarga');
  assert.equal(M7.trace(st({ uy: 'dist' }), m), null, 'solo en «Réplica a réplica»');
  assert.equal(M7.trace(st({ uy: 'rep', uq: { C: { x: ['1'], p: ['0.5'] } }, uf: { C: 'disc' } }), M7.model(st({ uy: 'rep', uq: { C: { x: ['1'], p: ['0.5'] } }, uf: { C: 'disc' } }), 'es')), null, 'con errores, nada');
});

test('trace con uh=p: el camino o los caminos críticos de cada réplica, con las opciones (los de más media y los críticos)', () => {
  const s = st({ ue: 'kd', uy: 'rep', uh: 'p' });
  const tr = M7.trace(s, M7.model(s, 'es'));
  const r7 = tr[6];
  assert.equal(r7.rep.T, 15);
  assert.deepEqual(r7.crit, ['B–D', 'C'], 'empate en la réplica 7');
  assert.equal(r7.reveals[0].field, 'm7.path');
  assert.deepEqual(r7.reveals[0].ok, ['B–D', 'C']);
  assert.deepEqual(r7.options, ['B–D', 'C', 'A–D']);
  for (const step of tr) for (const c of step.crit) assert.ok(step.options.includes(c));
});

test('convergence: las cuatro series (media, P del plazo, percentil y criticidad de una actividad) con su intervalo y su referencia', () => {
  const s = st({ ue: 'kd', uy: 'conv', ua: 'C' });
  const m = M7.model(s, 'es');
  const res = S.run({ kind: 'project', model: m.sim.model, n: m.sim.n, us: m.sim.us, track: true });
  const c = M7.convergence(s, m, res);
  assert.equal(c.act, 'C');
  assert.deepEqual(Object.keys(c.series), ['mean', 'pT', 'q', 'crit']);
  const mean = c.series.mean;
  assert.equal(mean.rows[mean.rows.length - 1].n, 10000);
  close(mean.ref, 23.248, 1e-9, 'la exacta');
  close(c.series.pT.ref, 0.15733333333333335, 1e-12);
  assert.equal(c.series.q.ref, 25, 'el P95 exacto');
  close(c.series.crit.ref, 0.66, 1e-9);
  for (const r of mean.rows) assert.ok(r.lo <= r.v && r.v <= r.hi);
  assert.equal(c.series.q.rows[0].lo, undefined, 'el percentil no lleva intervalo');
  // AC10: el error estándar de la media decrece como 1/√n.
  const se = (r) => (r.hi - r.lo) / 3.92;
  const a = mean.rows.find((r) => r.n >= 1000); const b = mean.rows[mean.rows.length - 1];
  assert.ok(Math.abs(se(a) * Math.sqrt(a.n) / (se(b) * Math.sqrt(b.n)) - 1) < 0.15);
  // Sin cuenta exacta, la referencia es la normal de M6 (salvo la criticidad); una actividad mala, la primera que varía.
  const k = M7.model(st({ uy: 'conv', ua: 'Z' }), 'es');
  const ck = M7.convergence(st({ uy: 'conv', ua: 'Z' }), k, S.run({ kind: 'project', model: k.sim.model, n: 1000, us: 3, track: true }));
  close(ck.series.mean.ref, 23.833333333333332, 1e-9);
  assert.equal(ck.series.crit.ref, null);
  assert.equal(ck.act, 'B', 'A es crítica siempre: la primera que no lo es');
});

// ---------- Revisión de la F4b (T017, ronda 1): la convergencia y los gráficos de M7 ----------

test('Revisión F4b I-F6: «Convergencia»: las bandas de la media, de P(≤ plazo) y de la criticidad son v ± 1,96·EE en cada punto', () => {
  const m = M7.model(st({ ue: 'kd', ua: 'C' }), 'es');
  const res = S.run({ kind: 'project', model: m.sim.model, n: m.sim.n, us: m.sim.us, track: true });
  const cv = M7.convergence(st({ ue: 'kd', ua: 'C' }), m, res);
  assert.equal(cv.act, 'C');
  cv.rows.forEach((r, j) => {
    const b = (s, v, se) => { const x = cv.series[s].rows[j]; assert.equal(x.n, r.n); close(x.v, v, 1e-12, s); close(x.lo, v - 1.96 * se, 1e-12, `${s} lo`); close(x.hi, v + 1.96 * se, 1e-12, `${s} hi`); };
    b('mean', r.mean, r.se);
    b('pT', r.pT, Math.sqrt(r.pT * (1 - r.pT) / r.n));
    b('crit', r.crit[2], Math.sqrt(r.crit[2] * (1 - r.crit[2]) / r.n));
    assert.equal(cv.series.q.rows[j].v, r.q);
  });
  // Las referencias: la cuenta exacta (el ejemplo es discreto).
  close(cv.series.mean.ref, m.exact.mean, 1e-12); close(cv.series.pT.ref, m.exact.pLE(m.deadline), 1e-12); close(cv.series.crit.ref, m.exact.crit[2], 1e-12);
});

// Un DOM mínimo para dibujar en Node los gráficos SVG de views/mc-charts (solo lo que usan: crear, atributos, hijos, texto).
function fakeDom() {
  const node = (tag) => ({ tag, attrs: {}, children: [], style: {}, textContent: '',
    setAttribute(k, v) { this.attrs[k] = String(v); }, getAttribute(k) { return this.attrs[k]; },
    appendChild(c) { this.children.push(c); return c; }, removeChild(c) { this.children.splice(this.children.indexOf(c), 1); },
    get firstChild() { return this.children[0] || null; } });
  globalThis.document = { createElementNS: (ns, tag) => node(tag) };
  return node('div');
}
const all = (n) => [n].concat(...n.children.map(all));
const MCC = require('../js/views/mc-charts.js');

test('Revisión F4b I-F20: la función de distribución: escalones, plazo y percentiles en su sitio, y la normal hasta 1', () => {
  const holder = fakeDom();
  const sorted = Float64Array.from([2, 4, 4, 6, 8, 10, 10, 10, 12, 14]);
  const o = { w: 400, h: 200, x: [0, 16], ticks: [0, 8, 16], fmt: String, yfmt: String, sorted, normal: { mu: 8, sd: 3 }, deadline: 10,
    marks: [{ p: 0.5, x: 8, label: 'P50' }, { p: 0.9, x: 12, label: 'P90', chosen: true }], label: 'cdf' };
  MCC.cdf(holder, o);
  const els = all(holder);
  const X = (v) => MCC.PAD.l + (v / 16) * (400 - MCC.PAD.l - MCC.PAD.r);
  const Y = (p) => 200 - MCC.PAD.b - p * (200 - MCC.PAD.t - MCC.PAD.b);
  const line = els.find((e) => (e.attrs.class || '').includes('v-deadline'));
  assert.equal(Number(line.attrs.x1), X(10));
  const circles = els.filter((e) => e.tag === 'circle');
  assert.deepEqual(circles.map((c) => [Number(c.attrs.cx), Number(c.attrs.cy)]), [[X(8), Y(0.5)], [X(12), Y(0.9)]].map(([a, b]) => [Number(a.toFixed(1)), Number(b.toFixed(1))]));
  const pathOf = (cls) => els.find((e) => e.attrs.class === cls).attrs.d.split(' ').map((s) => s.slice(1).split(',').map(Number));
  const cdf = pathOf('mc-cdf');
  assert.deepEqual(cdf[0], [X(2), Number(Y(0.1).toFixed(1))]);
  assert.deepEqual(cdf[cdf.length - 1], [X(14), Y(1)]);
  for (let i = 1; i < cdf.length; i++) assert.ok(cdf[i][1] <= cdf[i - 1][1], 'la escalera no baja');
  assert.deepEqual(MCC.steps(sorted).map((q) => q[1]).slice(0, 3), [0.1, 0.2, 0.3]);
  const nrm = pathOf('mc-normal');
  close(nrm[80][1], Number(Y(0.5).toFixed(1)), 0.06, 'la normal pasa por 0,5 en su media');
  assert.ok(nrm[nrm.length - 1][1] < Y(0.99), 'y llega casi a 1');
});

test('Revisión F4b I-F21: el tornado en espejo: criticidad a la izquierda y crucialidad a la derecha, con su anchura y su valor', () => {
  const holder = fakeDom();
  const rows = [{ id: 'C', crit: 0.66, cruc: 0.58 }, { id: 'D', crit: 0.39, cruc: -0.05 }];
  MCC.tornado(holder, { w: 580, rows, left: 'Criticidad', right: 'Crucialidad', fmt: (v) => v.toFixed(2), label: 't' });
  const els = all(holder);
  const room = (580 - 40) / 2 - 44; const cx = (580 - 40) / 2;
  const heads = els.filter((e) => e.attrs.class === 'mc-head').map((e) => e.textContent);
  assert.deepEqual(heads, ['◀ Criticidad', 'Crucialidad ▶']);
  const crit = els.filter((e) => e.attrs.class === 'mc-bar crit'); const cruc = els.filter((e) => e.attrs.class === 'mc-bar cruc');
  assert.deepEqual(crit.map((r) => Number(r.attrs.width)), [Number((0.66 * room).toFixed(1)), Number((0.39 * room).toFixed(1))]);
  assert.deepEqual(crit.map((r) => Number(r.attrs.x) + Number(r.attrs.width)).map((v) => Math.round(v)), [cx, cx], 'la criticidad crece hacia la izquierda');
  assert.deepEqual(cruc.map((r) => Number(r.attrs.width)), [Number((0.58 * room).toFixed(1)), 0], 'la crucialidad negativa no tiene barra');
  assert.ok(cruc.every((r) => Number(r.attrs.x) === cx + 40), 'la crucialidad crece hacia la derecha');
  assert.deepEqual(els.filter((e) => e.attrs.class === 'mc-val').map((e) => e.textContent), ['0.66', '0.58', '0.39', '-0.05']);
  delete globalThis.document;
});
