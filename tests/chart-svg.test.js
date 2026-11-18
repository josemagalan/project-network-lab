'use strict';
// views/chart-svg: los gráficos de «Leer una simulación» como SVG en texto (spec f3e-probabilidad-montecarlo, AC6, AC15 y
// AC19; plan §0 «Gráficos sin DOM», P4; tarea T007). Sin DOM y deterministas: la misma imagen en «Ejercicios» (con <img>
// y data:) y en Moodle (@@PLUGINFILE@@). Se comprueba que se pueden LEER: un lector que solo mira las etiquetas de los
// ejes y la posición de las marcas saca el percentil con ± una clase y P(T ≤ plazo) y los índices con ±0,05 (las
// tolerancias de probgrade); y que no llevan cifras de percentiles ni de índices. La alternativa en texto (tabla de
// frecuencias acumuladas e índices a una cifra) da lo mismo que la imagen, sin la respuesta exacta.
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const X = require('./xml-check.js');
const PG = require('../js/core/probgen.js');
const PR = require('../js/core/probgrade.js');
const S = require('../js/core/sim.js');
const MC = require('../js/core/mc.js');
const CS = require('../js/views/chart-svg.js');

const LEVELS = ['easy', 'medium', 'hard'];
const LAB = { deadline: 'Plazo = 41 & <x>', x: 'Duración del proyecto', hist: 'Histograma', cdf: 'Función de distribución' };
const ILAB = { crit: 'Criticidad', cruc: 'Crucialidad' };
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const unesc = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&');

/** Los textos del SVG con su posición: [{ x, y, anchor, text }]. */
function texts(svg) {
  return [...svg.matchAll(/<text([^>]*)>([^<]*)<\/text>/g)].map((m) => ({
    x: Number((m[1].match(/ x="([-\d.]+)"/) || [])[1]), y: Number((m[1].match(/ y="([-\d.]+)"/) || [])[1]),
    cls: (m[1].match(/ class="([^"]+)"/) || [])[1] || '', text: unesc(m[2]),
  }));
}
const attrsOf = (svg, tag, cls) => [...svg.matchAll(new RegExp(`<${tag} ([^>]*class="${cls}"[^>]*)/?>`, 'g'))]
  .map((m) => Object.fromEntries([...m[1].matchAll(/([\w-]+)="([^"]*)"/g)].map((a) => [a[1], a[2]])));
const num = (t, dec) => Number(t.replace(dec || '.', '.'));
const isNum = (t, dec) => (dec === ',' ? /^-?\d+(,\d+)?$/ : /^-?\d+(\.\d+)?$/).test(t);

/** Recta que pasa por las etiquetas de un eje (valor → píxel), sacada de dos etiquetas como lo haría un lector. */
function scale(pairs) {
  const [a, b] = [pairs[0], pairs[pairs.length - 1]];
  const k = (b.px - a.px) / (b.v - a.v);
  for (const p of pairs) assert.ok(Math.abs(a.px + (p.v - a.v) * k - p.px) < 0.11, 'las etiquetas del eje están alineadas');
  return { px: (v) => a.px + (v - a.v) * k, v: (px) => a.v + (px - a.px) / k };
}
function axes(svg, dec) {
  const t = texts(svg);
  const xs = t.filter((e) => e.cls === 'tx').map((e) => ({ v: num(e.text, dec), px: e.x }));
  const ys = t.filter((e) => e.cls === 'ty').map((e) => ({ v: num(e.text, dec), px: e.y - CS.TY }));
  return { X: scale(xs), Y: scale(ys), xs, ys };
}
/** La curva de la función de distribución, en valores (t, F). */
function curve(svg, ax) {
  const pl = attrsOf(svg, 'polyline', 'cdf');
  assert.equal(pl.length, 1);
  return pl[0].points.split(' ').map((p) => p.split(',').map(Number)).map(([x, y]) => [ax.X.v(x), ax.Y.v(y)]);
}
const readP = (cv, t) => {           // F(t) en la curva (la última altura a la izquierda de t, interpolando)
  if (t <= cv[0][0]) return cv[0][1];
  for (let i = 1; i < cv.length; i++) if (cv[i][0] >= t) { const [x0, y0] = cv[i - 1]; const [x1, y1] = cv[i]; return x1 === x0 ? y1 : y0 + ((t - x0) / (x1 - x0)) * (y1 - y0); }
  return cv[cv.length - 1][1];
};
const readQ = (cv, p) => {           // el primer t con F(t) ≥ p
  for (let i = 1; i < cv.length; i++) if (cv[i][1] >= p) { const [x0, y0] = cv[i - 1]; const [x1, y1] = cv[i]; return y1 === y0 ? x1 : x0 + ((p - y0) / (y1 - y0)) * (x1 - x0); }
  return cv[cv.length - 1][0];
};

// Ejercicios «Leer» de las semillas 2026… por nivel, con su solución (la simulación de M7 con us y ur = 4).
const CASES = {};
for (const lv of LEVELS) {
  CASES[lv] = [];
  for (let sd = 2026; CASES[lv].length < 8; sd++) {
    const r = PG.read(sd, lv);
    if (!r.ok) continue;
    if (r.ex.sdUsed !== sd) { sd = r.ex.sdUsed; }
    CASES[lv].push({ ex: r.ex, sol: PG.solve('read', r.ex) });
  }
}
const distOf = (c, o) => CS.dist(Object.assign({ durations: c.sol.sorted, deadline: c.ex.ask.deadline, title: 'Duración <T>', desc: 'Histograma & F', labels: LAB }, o));
const idxRows = (c) => c.ex.tcl.rows.map((r) => ({ id: r.id, crit: c.sol.crit[r.id], cruc: c.sol.cruc[r.id] }));
const idxOf = (c, o) => CS.indices(Object.assign({ rows: idxRows(c), title: 'Índices', desc: 'Criticidad y crucialidad', labels: ILAB }, o));

test('chart-svg · constantes: 40 clases, como M7 y probgen; las clases son las de sim.summary (las de la tolerancia de una clase)', () => {
  assert.equal(CS.BINS, 40);
  assert.equal(CS.BINS, PG.SIM.bins);
  for (const lv of LEVELS) for (const c of CASES[lv]) {
    const h = CS.hist(c.sol.sorted, CS.BINS);
    assert.deepEqual(h, c.sol.hist);
    assert.equal(h.width, c.sol.classW);
    const shuffled = Array.from(c.sol.sorted).reverse();
    assert.deepEqual(CS.hist(shuffled, CS.BINS), h, 'no hace falta que vengan ordenadas');
  }
  // Todas iguales: la clase se abre medio punto a cada lado, como sim.summary.
  const flat = new Array(50).fill(10);
  assert.deepEqual(CS.hist(flat, 40), S.summary(flat).hist(40));
});

test('chart-svg · dist: SVG bien formado, con título y descripción escapados, determinista y de menos de 32 KiB', () => {
  for (const lv of LEVELS) {
    const c = CASES[lv][0];
    const svg = distOf(c);
    assert.ok(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"'));
    assert.deepEqual(X.check(svg), { ok: true });
    assert.ok(/ role="img" aria-labelledby="t d"/.test(svg));
    assert.ok(svg.includes('<title id="t">Duración &lt;T&gt;</title>') && svg.includes('<desc id="d">Histograma &amp; F</desc>'));
    assert.ok(svg.includes('>Plazo = 41 &amp; &lt;x&gt;</text>'));
    for (const l of [LAB.x, LAB.hist, LAB.cdf]) assert.equal(texts(svg).filter((t) => t.text === l).length, 1, l);
    assert.ok(/<rect width="\d+" height="\d+" fill="#fff"\/>/.test(svg), 'fondo blanco (imagen dentro de una pregunta)');
    assert.equal(distOf(c), svg, 'determinista');
    assert.equal(distOf(c, { durations: Array.from(c.sol.sorted).reverse() }), svg, 'el orden de las duraciones no cambia nada');
    assert.ok(Buffer.byteLength(svg) < 32 * 1024, `${lv}: ${Buffer.byteLength(svg)} bytes`);
  }
});

test('chart-svg · dist: una barra por clase con réplicas, alineada con sus bordes y de altura proporcional a su frecuencia', () => {
  for (const lv of LEVELS) for (const c of CASES[lv].slice(0, 3)) {
    const svg = distOf(c);
    const ax = axes(svg);
    const { lo, width, counts } = c.sol.hist;
    const bars = attrsOf(svg, 'rect', 'bar').map((b) => ({ x: +b.x, y: +b.y, w: +b.width, h: +b.height }));
    assert.equal(bars.length, counts.filter((k) => k > 0).length);
    const full = Math.max(...bars.map((b) => b.h)); const maxC = Math.max(...counts);
    let j = 0;
    counts.forEach((k, i) => {
      if (!k) return;
      const b = bars[j++];
      assert.ok(Math.abs(b.x - ax.X.px(lo + i * width)) <= 0.6, `borde izquierdo de la clase ${i}`);
      assert.ok(Math.abs(b.x + b.w - ax.X.px(lo + (i + 1) * width)) <= 1.2, `borde derecho de la clase ${i}`);
      assert.ok(Math.abs(b.h - (full * k) / maxC) <= 0.11, `altura de la clase ${i}`);
    });
  }
});

test('chart-svg · dist: con la rejilla se lee el percentil con ± una clase y P(T ≤ plazo) con ±0,05 (las tolerancias de probgrade)', () => {
  assert.equal(PR.TOL.read, 0.05);
  let worstQ = 0; let worstP = 0;
  for (const lv of LEVELS) for (const c of CASES[lv]) {
    const svg = distOf(c);
    const ax = axes(svg);
    // Rejilla vertical no más ancha que una clase; horizontal cada 0,05.
    const gx = attrsOf(svg, 'line', 'gx').map((l) => ax.X.v(+l.x1)).sort((a, b) => a - b);
    const gaps = gx.slice(1).map((v, i) => v - gx[i]);
    const px = Math.abs(ax.X.v(0.2) - ax.X.v(0));   // lo que se pierde al redondear a 0,1 px los dos extremos
    assert.ok(Math.max(...gaps) <= c.sol.classW + px, `${lv}: rejilla de ${Math.max(...gaps)} con clases de ${c.sol.classW}`);
    assert.ok(gx[0] <= c.sol.hist.lo + 1e-9 && gx[gx.length - 1] >= c.sol.hist.lo + 40 * c.sol.hist.width - 1e-9, 'la rejilla cubre todas las clases');
    const gy = attrsOf(svg, 'line', 'gy').map((l) => ax.Y.v(+l.y1)).sort((a, b) => a - b);
    assert.equal(gy.length, 21);
    gy.forEach((v, i) => assert.ok(Math.abs(v - i * 0.05) < 1e-3));
    // El lector: la curva de la imagen y las etiquetas de los ejes.
    const cv = curve(svg, ax);
    for (const p of PG.PCTS) {
      const truth = MC.percentile(c.sol.sorted, p);
      const err = Math.abs(readQ(cv, p) - truth);
      worstQ = Math.max(worstQ, err / c.sol.classW);
      assert.ok(err <= c.sol.classW, `${lv} ${c.ex.sdUsed}: P${p * 100} leído a ${err} (clase ${c.sol.classW})`);
    }
    const errP = Math.abs(readP(cv, c.ex.ask.deadline) - c.sol.pT);
    worstP = Math.max(worstP, errP);
    assert.ok(errP <= 0.02, `${lv} ${c.ex.sdUsed}: P(T ≤ plazo) leída a ${errP}`);
  }
  assert.ok(worstQ <= 0.5 && worstP <= 0.02, `holgura de la lectura: ${worstQ} clases, ${worstP}`);
});

test('chart-svg · dist: sin cifras de percentiles: solo números de los ejes (múltiplos del paso) y los textos de quien llama', () => {
  for (const lv of LEVELS) for (const c of CASES[lv].slice(0, 4)) {
    const svg = distOf(c);
    const t = texts(svg);
    const ax = axes(svg);
    const own = new Set(Object.values(LAB));
    for (const e of t) {
      if (own.has(e.text)) continue;
      assert.ok(isNum(e.text) && (e.cls === 'tx' || e.cls === 'ty'), `texto inesperado «${e.text}»`);
    }
    const step = ax.xs[1].v - ax.xs[0].v;
    assert.ok([1, 2, 5].some((m) => Math.abs(step / (m * 10 ** Math.floor(Math.log10(step / m) + 1e-9)) - 1) < 1e-9), `paso ${step}`);
    for (const e of ax.xs) assert.ok(Math.abs(e.v / step - Math.round(e.v / step)) < 1e-9, `${e.v} no es múltiplo de ${step}`);
    assert.ok(ax.xs.length >= 4 && ax.xs.length <= 12, `${ax.xs.length} etiquetas en x`);
    assert.deepEqual(ax.ys.map((e) => e.v), [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1]);
    // Ninguna etiqueta coincide con un percentil a una o dos cifras (salvo que sea justo una marca del eje).
    for (const p of [0.5, 0.75, 0.8, 0.9, 0.99]) {
      const q = MC.percentile(c.sol.sorted, p);
      for (const d of [1, 2]) {
        const s = q.toFixed(d);
        if (Math.abs(Number(s) / step - Math.round(Number(s) / step)) < 1e-9) continue;
        assert.ok(!t.some((e) => e.text === s || e.text === String(Number(s))), `P${p * 100} = ${s} escrito en la imagen`);
      }
    }
  }
});

test('chart-svg · dist: el plazo se marca con una línea discontinua en los dos paneles y su etiqueta, también fuera de las réplicas', () => {
  const c = CASES.hard[0];
  for (const deadline of [c.ex.ask.deadline, Math.ceil(c.sol.hist.lo + 40 * c.sol.hist.width) + 3, Math.floor(c.sol.hist.lo) - 2]) {
    const svg = distOf(c, { deadline });
    assert.deepEqual(X.check(svg), { ok: true });
    const ax = axes(svg);
    const dl = attrsOf(svg, 'line', 'dl');
    assert.equal(dl.length, 1);
    assert.ok(dl[0]['stroke-dasharray'], 'discontinua: no depende solo del color');
    assert.ok(Math.abs(ax.X.v(+dl[0].x1) - deadline) < 0.02, `línea del plazo en ${ax.X.v(+dl[0].x1)}`);
    const top = Math.min(...attrsOf(svg, 'rect', 'bar').map((b) => +b.y));
    assert.ok(+dl[0].y1 <= top && +dl[0].y2 >= ax.Y.px(0) - 0.1, 'cruza el histograma y la función de distribución');
    assert.ok(ax.xs[0].v <= deadline && ax.xs[ax.xs.length - 1].v >= deadline, 'el eje llega al plazo');
    assert.equal(texts(svg).filter((e) => e.text === LAB.deadline).length, 1);
  }
  const none = distOf(c, { deadline: null, labels: { x: LAB.x, hist: LAB.hist, cdf: LAB.cdf } });
  assert.deepEqual(X.check(none), { ok: true });
  assert.equal(attrsOf(none, 'line', 'dl').length, 0, 'sin plazo, sin línea');
});

test('chart-svg · dist: notación con coma decimal (ES) en los números de los ejes', () => {
  const c = CASES.easy[0];
  const svg = distOf(c, { dec: ',' });
  const nums = texts(svg).filter((e) => e.cls === 'tx' || e.cls === 'ty');
  assert.ok(nums.some((e) => e.text.includes(',')), 'alguna etiqueta lleva decimales');
  for (const e of nums) assert.ok(isNum(e.text, ',') && !e.text.includes('.'), e.text);
  // Lo único que cambia son las etiquetas.
  const strip = (s) => s.replace(/<text[^>]*>[^<]*<\/text>/g, '');
  assert.equal(strip(svg), strip(distOf(c)));
  const ax = axes(svg, ',');
  assert.ok(Math.abs(readP(curve(svg, ax), c.ex.ask.deadline) - c.sol.pT) <= 0.02);
});

test('chart-svg · indices: tornado sin cifras; criticidad a la izquierda y crucialidad a la derecha se leen con ±0,05', () => {
  for (const lv of LEVELS) for (const c of CASES[lv].slice(0, 4)) {
    const rows = idxRows(c);
    const svg = idxOf(c);
    assert.ok(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"'));
    assert.deepEqual(X.check(svg), { ok: true });
    assert.ok(svg.includes('<title id="t">Índices</title>'));
    assert.equal(idxOf(c), svg, 'determinista');
    const t = texts(svg);
    for (const r of rows) assert.equal(t.filter((e) => e.text === r.id && e.cls === 'id').length, 1, r.id);
    assert.equal(t.filter((e) => e.text.includes(ILAB.crit)).length, 1);
    assert.equal(t.filter((e) => e.text.includes(ILAB.cruc)).length, 1);
    for (const e of t) {
      if (e.cls === 'id' || e.cls === 'head') continue;
      assert.ok(e.cls === 'tx' && isNum(e.text), `texto inesperado «${e.text}»`);
    }
    // Las marcas de cada lado van de 0 a 1 y la rejilla, cada 0,05.
    const left = t.filter((e) => e.cls === 'tx' && e.x < Math.min(...t.filter((u) => u.cls === 'id').map((u) => u.x)));
    const right = t.filter((e) => e.cls === 'tx' && !left.includes(e));
    for (const side of [left, right]) {
      const vals = side.map((e) => num(e.text)).sort((a, b) => a - b);
      assert.equal(vals[0], 0); assert.equal(vals[vals.length - 1], 1);
    }
    const XL = scale(left.map((e) => ({ v: num(e.text), px: e.x })));
    const XR = scale(right.map((e) => ({ v: num(e.text), px: e.x })));
    const gl = attrsOf(svg, 'line', 'gx').map((l) => +l.x1);
    const onLeft = gl.filter((x) => x <= XL.px(0) + 0.1).map(XL.v).sort((a, b) => a - b);
    assert.equal(onLeft.length, 21);
    const crit = attrsOf(svg, 'rect', 'crit'); const cruc = attrsOf(svg, 'rect', 'cruc');
    assert.equal(crit.length, rows.length); assert.equal(cruc.length, rows.length);
    rows.forEach((r, i) => {
      const lc = XL.v(+crit[i].x); const rc = XR.v(+cruc[i].x + +cruc[i].width);
      assert.ok(Math.abs(+crit[i].x + +crit[i].width - XL.px(0)) < 0.11, 'la barra de la criticidad sale del 0');
      assert.ok(Math.abs(lc - Math.min(1, Math.max(0, r.crit))) <= 0.01, `${r.id}: criticidad ${r.crit} leída ${lc}`);
      assert.ok(Math.abs(rc - Math.min(1, Math.max(0, r.cruc))) <= 0.01, `${r.id}: crucialidad ${r.cruc} leída ${rc}`);
    });
    // Ninguna cifra de un índice que no sea una marca del eje.
    for (const r of rows) for (const v of [r.crit, r.cruc]) {
      for (const d of [2, 3]) {
        const s = v.toFixed(d);
        if (Math.abs(Number(s) * 10 - Math.round(Number(s) * 10)) < 1e-9) continue;
        assert.ok(!t.some((e) => e.text === s || e.text === String(Number(s))), `${r.id}: ${s} escrito en la imagen`);
      }
    }
  }
});

test('chart-svg · indices: solo criticidad (sin crucialidad), crucialidad negativa a 0, notación con coma y textos escapados', () => {
  const rows = [{ id: 'A', crit: 1 }, { id: 'B<', crit: 0.37 }, { id: 'C', crit: 0 }];
  const svg = CS.indices({ rows, title: 'a & b', desc: 'c', labels: { crit: 'Criticidad' }, dec: ',' });
  assert.deepEqual(X.check(svg), { ok: true });
  assert.equal(attrsOf(svg, 'rect', 'cruc').length, 0);
  assert.equal(attrsOf(svg, 'rect', 'crit').length, 3);
  assert.ok(svg.includes('>B&lt;</text>') && svg.includes('<title id="t">a &amp; b</title>'));
  const t = texts(svg).filter((e) => e.cls === 'tx');
  assert.ok(t.some((e) => e.text === '0,5') && !t.some((e) => e.text.includes('.')));
  const XS = scale(t.map((e) => ({ v: num(e.text, ','), px: e.x })));
  const bars = attrsOf(svg, 'rect', 'crit');
  assert.ok(Math.abs(+bars[0].x - XS.px(0)) < 0.11, 'una sola cara: la barra sale del 0 hacia la derecha');
  assert.ok(Math.abs(XS.v(+bars[1].x + +bars[1].width) - 0.37) <= 0.01);
  assert.equal(+bars[2].width, 0);
  const neg = CS.indices({ rows: [{ id: 'A', crit: 0.5, cruc: -0.2 }, { id: 'B', crit: 0.5, cruc: 1.2 }], title: 't', desc: 'd', labels: ILAB });
  const cr = attrsOf(neg, 'rect', 'cruc');
  assert.equal(+cr[0].width, 0, 'crucialidad negativa a 0, como M7');
  assert.ok(+cr[1].width > 0 && +cr[1].width < 400);
  assert.equal(CS.indices({ rows, title: 'a & b', desc: 'c', labels: { crit: 'Criticidad' }, dec: ',' }), svg);
});

test('chart-svg · alternativa en texto: tabla de frecuencias acumuladas de las 40 clases, que da lo mismo que la imagen', () => {
  for (const lv of LEVELS) for (const c of CASES[lv]) {
    const tb = CS.table(c.sol.sorted);
    const { lo, width, counts } = c.sol.hist;
    assert.equal(tb.length, CS.BINS);
    let cum = 0;
    tb.forEach((r, i) => {
      cum += counts[i];
      assert.equal(r.from, Math.round((lo + i * width) * 100) / 100);
      assert.equal(r.to, Math.round((lo + (i + 1) * width) * 100) / 100);
      assert.equal(r.cum, Math.round((cum / c.sol.n) * 100) / 100);
      if (i) { assert.equal(r.from, tb[i - 1].to); assert.ok(r.cum >= tb[i - 1].cum); }
    });
    assert.equal(tb[CS.BINS - 1].cum, 1);
    // El lector de la tabla: el percentil está en la primera clase que llega a p; P(T ≤ plazo), interpolando.
    for (const p of PG.PCTS) {
      const truth = MC.percentile(c.sol.sorted, p);
      const r = tb.find((x) => x.cum >= p);
      assert.ok(Math.abs(r.to - truth) <= c.sol.classW + 0.005, `${lv}: P${p * 100} en la tabla`);
    }
    const d = c.ex.ask.deadline;
    const pts = [[tb[0].from, 0], ...tb.map((x) => [x.to, x.cum])];
    let read = d <= pts[0][0] ? 0 : 1;
    for (let i = 1; i < pts.length; i++) if (pts[i][0] >= d && pts[i - 1][0] <= d) { read = pts[i - 1][1] + ((d - pts[i - 1][0]) / (pts[i][0] - pts[i - 1][0])) * (pts[i][1] - pts[i - 1][1]); break; }
    assert.ok(Math.abs(read - c.sol.pT) <= PR.TOL.read, `${lv}: P(T ≤ plazo) en la tabla, ${read} frente a ${c.sol.pT}`);
    assert.deepEqual(CS.table(Array.from(c.sol.sorted).reverse()), tb);
  }
});

test('chart-svg · alternativa en texto: índices a una cifra decimal (dentro de ±0,05), con la crucialidad negativa a 0', () => {
  for (const lv of LEVELS) for (const c of CASES[lv]) {
    const rows = idxRows(c);
    const tb = CS.indexTable(rows);
    assert.deepEqual(tb.map((r) => r.id), rows.map((r) => r.id));
    tb.forEach((r, i) => {
      for (const k of ['crit', 'cruc']) {
        const v = Math.min(1, Math.max(0, rows[i][k]));
        assert.ok(Math.abs(r[k] * 10 - Math.round(r[k] * 10)) < 1e-9, `${r[k]} a una cifra`);
        assert.ok(Math.abs(r[k] - v) <= PR.TOL.read + 1e-9, `${r.id}.${k}: ${r[k]} frente a ${v}`);
      }
    });
  }
  assert.deepEqual(CS.indexTable([{ id: 'A', crit: 0.349, cruc: -0.03 }, { id: 'B', crit: 0.95 }]),
    [{ id: 'A', crit: 0.3, cruc: 0 }, { id: 'B', crit: 1 }]);
});

test('chart-svg · entradas no válidas: sin duraciones, clases o filas, error; todas las duraciones iguales, imagen bien formada', () => {
  assert.throws(() => CS.dist({ durations: [], deadline: 3, title: 't', desc: 'd', labels: {} }), /chart-svg/);
  assert.throws(() => CS.hist([1, 2], 0), /chart-svg/);
  assert.throws(() => CS.table([]), /chart-svg/);
  assert.throws(() => CS.indices({ rows: [], title: 't', desc: 'd', labels: ILAB }), /chart-svg/);
  assert.throws(() => CS.dist({ durations: [1, NaN], deadline: 3, title: 't', desc: 'd', labels: {} }), /chart-svg/);
  const flat = CS.dist({ durations: new Array(100).fill(12), deadline: 12, title: 't', desc: 'd', labels: { deadline: 'Plazo' } });
  assert.deepEqual(X.check(flat), { ok: true });
  assert.equal(attrsOf(flat, 'rect', 'bar').length, 1);
  const ax = axes(flat);
  assert.ok(Math.abs(readP(curve(flat, ax), 12.01) - 1) < 1e-3 && Math.abs(readP(curve(flat, ax), 11.99)) < 1e-3, 'el salto, en 12');
});

test('chart-svg · las mismas imágenes en otro proceso de Node para la misma semilla', () => {
  const pick = LEVELS.map((lv) => CASES[lv][1]);
  const script = `
    const PG = require(${JSON.stringify(path.join(__dirname, '../js/core/probgen.js'))});
    const CS = require(${JSON.stringify(path.join(__dirname, '../js/views/chart-svg.js'))});
    const crypto = require('node:crypto'); const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
    const LAB = ${JSON.stringify(LAB)}; const ILAB = ${JSON.stringify(ILAB)};
    const out = ${JSON.stringify(pick.map((c) => [c.ex.sd, c.ex.level]))}.map(([sd, lv]) => {
      const r = PG.read(sd, lv); const sol = PG.solve('read', r.ex);
      const d = CS.dist({ durations: sol.sorted, deadline: r.ex.ask.deadline, title: 'Duración <T>', desc: 'Histograma & F', labels: LAB });
      const i = CS.indices({ rows: r.ex.tcl.rows.map((x) => ({ id: x.id, crit: sol.crit[x.id], cruc: sol.cruc[x.id] })), title: 'Índices', desc: 'Criticidad y crucialidad', labels: ILAB });
      return [sha(d), sha(i), JSON.stringify(CS.table(sol.sorted))];
    });
    process.stdout.write(JSON.stringify(out));`;
  const other = JSON.parse(execFileSync(process.execPath, ['-e', script], { encoding: 'utf8' }));
  assert.deepEqual(other, pick.map((c) => [sha(distOf(c)), sha(idxOf(c)), JSON.stringify(CS.table(c.sol.sorted))]));
});

test('chart-svg · dataUri: base64 del UTF-8 (igual con Buffer y sin él, como en el navegador) y se decodifica en el mismo SVG', () => {
  const svg = CS.indices({ rows: [{ id: 'Á', crit: 0.5, cruc: 0.2 }], title: 'Índice ≤ ◀ ▶', desc: 'ñ', labels: ILAB });
  const uri = CS.dataUri(svg);
  assert.ok(uri.startsWith('data:image/svg+xml;base64,'));
  assert.equal(Buffer.from(uri.slice(26), 'base64').toString('utf8'), svg);
  const B = globalThis.Buffer;
  try {
    globalThis.Buffer = undefined;
    assert.equal(CS.dataUri(svg), uri, 'con TextEncoder y btoa');
  } finally { globalThis.Buffer = B; }
  const big = distOf(CASES.hard[0]);
  assert.equal(Buffer.from(CS.dataUri(big).slice(26), 'base64').toString('utf8'), big);
});
