'use strict';
// core/threept: fórmulas de examen, beta-PERT, beta clásica y triangular, y la normal (spec f4a-tres-tiempos-tcl,
// AC1 y AC4; plan §0, §3, P2 y P4). Referencias: Tema 6c (Klastorin, 2010) y Hillier y Lieberman (2015), cap. 22.
const test = require('node:test');
const assert = require('node:assert/strict');
const T = require('../js/core/threept.js');
const rng = require('../js/core/rng.js');

const close = (x, y, tol, msg) => assert.ok(Math.abs(x - y) <= tol, `${msg || ''} ${x} ≠ ${y} (±${tol})`);

// Momentos por integración numérica de la densidad: Simpson con 4000 intervalos tras el cambio
// x = a + (b − a)(1 − cos πu)/2, que suaviza la densidad en los extremos (t^(α−1) con 1 < α < 2).
function integrate(f, a, b, n = 4000) {
  const w = b - a; const g = (u) => f(a + (w * (1 - Math.cos(Math.PI * u))) / 2) * ((w * Math.PI) / 2) * Math.sin(Math.PI * u);
  const h = 1 / n; let s = g(0) + g(1);
  for (let i = 1; i < n; i++) s += (i % 2 ? 4 : 2) * g(i * h);
  return (s * h) / 3;
}
function numMoments(kind, d) {
  const m0 = integrate((x) => T.pdf(kind, d, x), d.a, d.b);
  const m1 = integrate((x) => x * T.pdf(kind, d, x), d.a, d.b);
  const m2 = integrate((x) => x * x * T.pdf(kind, d, x), d.a, d.b);
  return { area: m0, mean: m1, var: m2 - m1 * m1 };
}
function ternas(n, seed) {
  const u = rng.mulberry32(seed); const out = [];
  for (let i = 0; i < n; i++) {
    const a = Math.round(u() * 20); const b = a + 1 + Math.round(u() * 30); const m = a + Math.round(u() * (b - a));
    out.push({ a, m, b });
  }
  return out.concat([{ a: 2, m: 2, b: 9 }, { a: 2, m: 9, b: 9 }]);   // moda en un extremo
}

test('T003: fórmulas de examen, (a + 4m + b)/6 y ((b − a)/6)²', () => {
  assert.deepEqual(T.exam({ a: 2, m: 6, b: 14 }), { mean: 40 / 6, var: 4 });
  assert.deepEqual(T.exam({ a: 5, m: 5, b: 5 }), { mean: 5, var: 0 });
  close(T.exam({ a: 2, m: 3.5, b: 8 }).mean, 4, 1e-12, 'Hillier B');
});

test('T003: la beta-PERT da exactamente la media de examen; la clásica, la varianza de examen y la moda m', () => {
  for (const d of ternas(200, 11)) {
    const e = T.exam(d);
    close(T.moments('pert', d).mean, e.mean, 1e-12, `pert ${JSON.stringify(d)}`);
    close(T.moments('classic', d).var, e.var, 1e-9, `classic ${JSON.stringify(d)}`);
    const { alpha, beta } = T.params('classic', d);
    close(d.a + (d.b - d.a) * (alpha - 1) / (alpha + beta - 2), d.m, 1e-9, `moda ${JSON.stringify(d)}`);
    assert.ok(alpha >= 1 && beta >= 1);
  }
});

test('T003: momentos cerrados de las tres curvas iguales a los de su densidad integrada (200 ternas)', () => {
  for (const d of ternas(200, 12)) {
    for (const kind of ['pert', 'classic', 'tri']) {
      const num = numMoments(kind, d); const cl = T.moments(kind, d);
      close(num.area, 1, 1e-6, `${kind} área ${JSON.stringify(d)}`);
      close(num.mean, cl.mean, 1e-6 * (d.b - d.a), `${kind} media ${JSON.stringify(d)}`);
      close(num.var, cl.var, 1e-5 * (d.b - d.a) ** 2, `${kind} varianza ${JSON.stringify(d)}`);
    }
  }
});

test('T003: actividad A de Klastorin (2, 6, 14): beta-PERT 4,89 frente a 4,00 de examen; triangular (a + m + b)/3', () => {
  const A = { a: 2, m: 6, b: 14 };
  close(T.moments('pert', A).var, 44 / 9, 1e-12);
  close(T.moments('classic', A).var, 4, 1e-9);
  close(T.moments('tri', A).mean, 22 / 3, 1e-12);
  close(T.moments('tri', A).var, (4 + 36 + 196 - 12 - 28 - 84) / 18, 1e-12);
  const pa = T.params('pert', A);
  close(pa.alpha, 7 / 3, 1e-12); close(pa.beta, 11 / 3, 1e-12);
});

test('T003: función de distribución e inversa en rejilla coherentes, de a a b', () => {
  for (const d of ternas(30, 13)) {
    for (const kind of ['pert', 'classic', 'tri']) {
      assert.equal(T.cdf(kind, d, d.a - 1), 0);
      assert.equal(T.cdf(kind, d, d.b + 1), 1);
      close(T.cdf(kind, d, d.a), 0, 1e-12);
      close(T.cdf(kind, d, d.b), 1, 1e-12);
      const g = T.invTable(kind, d, 64);
      assert.equal(g.length, 65);
      close(g[0], d.a, 1e-9); close(g[64], d.b, 1e-9);
      for (let i = 1; i < 64; i++) {
        assert.ok(g[i] >= g[i - 1], `${kind} rejilla creciente`);
        close(T.cdf(kind, d, g[i]), i / 64, 1e-9, `${kind} ${JSON.stringify(d)} i=${i}`);
      }
      const mid = (d.a + d.b) / 2; const h = 1e-5;
      close((T.cdf(kind, d, mid + h) - T.cdf(kind, d, mid - h)) / (2 * h), T.pdf(kind, d, mid), 1e-5, `${kind} densidad`);
    }
  }
});

test('T003: sin incertidumbre (a = m = b): sin parámetros, varianza 0, escalón y rejilla constante', () => {
  const d = { a: 4, m: 4, b: 4 };
  assert.equal(T.params('pert', d), null);
  assert.equal(T.params('classic', d), null);
  for (const kind of ['pert', 'classic', 'tri']) {
    assert.deepEqual(T.moments(kind, d), { mean: 4, var: 0 });
    assert.equal(T.cdf(kind, d, 3.999), 0);
    assert.equal(T.cdf(kind, d, 4), 1);
    assert.ok(T.invTable(kind, d, 8).every((x) => x === 4));
  }
});

test('T003: Φ y Φ⁻¹ frente a valores de referencia (error < 1e-9)', () => {
  const ref = [[0, 0.5], [1, 0.8413447460685429], [-1, 0.15865525393145707], [0.41, 0.6590970262276774],
    [1.96, 0.9750021048517795], [-2.5, 0.006209665325776132], [3, 0.9986501019683699], [-6, 9.865876450376946e-10]];
  for (const [z, p] of ref) close(T.phi(z), p, 1e-12, `Φ(${z})`);
  assert.equal(T.phi(-40), 0); assert.equal(T.phi(40), 1);
  close(T.phi(-9) / 1.1285884059538408e-19, 1, 1e-10, 'Φ(−9) relativo'); assert.equal(T.phi(9), 1);
  close(T.phi(-4) / 3.167124183311998e-05, 1, 1e-10, 'Φ(−4) relativo');
  assert.throws(() => T.params('lognormal', { a: 1, m: 2, b: 3 }));
  close(T.phiInv(0.95), 1.6448536269514722, 1e-9);
  close(T.phiInv(0.975), 1.959963984540054, 1e-9);
  close(T.phiInv(0.5), 0, 1e-12);
  close(T.phiInv(0.01), -2.3263478740408408, 1e-9);
  for (let p = 0.001; p < 1; p += 0.0137) close(T.phi(T.phiInv(p)), p, 1e-12, `ida y vuelta ${p}`);
  assert.equal(T.phiInv(0), -Infinity); assert.equal(T.phiInv(1), Infinity);
});

test('T003: probabilidad «de tabla»: z a dos decimales y Φ a cuatro (Klastorin 0,41 → 0,6591; Hillier 1 → 0,8413)', () => {
  assert.deepEqual(T.tableP((25 - 143 / 6) / Math.sqrt(8.25)), { z2: 0.41, p4: 0.6591 });
  assert.deepEqual(T.tableP(1), { z2: 1, p4: 0.8413 });
  assert.deepEqual(T.tableP(0.405), { z2: 0.41, p4: 0.6591 });     // mitad hacia arriba
  assert.deepEqual(T.tableP(-0.405), { z2: -0.41, p4: 0.3409 });   // simétrico en valor absoluto
  assert.deepEqual(T.tableP(2 / Math.sqrt(5)), { z2: 0.89, p4: 0.8133 });   // dos rutas, B–D, plazo 17
});

test('T011 (A5): traza de una actividad, media y varianza de examen con sus campos de predicción', () => {
  const tr = T.trace({ a: 6, m: 9, b: 18 });
  assert.deepEqual(tr.map((s) => s.kind), ['unc.mean', 'unc.var']);
  assert.deepEqual(tr[0].values, [{ field: 'unc.mean', value: 10 }]);
  assert.deepEqual(tr[1].values, [{ field: 'unc.var', value: 4 }]);
  assert.deepEqual(T.trace({ a: 3, m: 3, b: 3 })[1].values[0].value, 0);
});

test('F4a r1 (nits): Φ y Φ⁻¹ de NaN dan NaN (sin quedarse en el bucle) y Φ no pasa de 1 cerca de z = 8', () => {
  assert.ok(Number.isNaN(T.phi(NaN)));
  assert.ok(Number.isNaN(T.phiInv(NaN)));
  for (let z = 7; z <= 8.0001; z += 0.0007) assert.ok(T.phi(z) <= 1, `Φ(${z}) = ${T.phi(z)}`);
});

test('F4a r2 (nit F8): Φ en la cola derecha sigue siendo 1 − cola (no un valor cualquiera ≤ 1)', () => {
  // 1 − Φ(7) = 1,279812543885835e-12 y 1 − Φ(6) = 9,865876450376983e-10.
  assert.ok(Math.abs(T.phi(7) - (1 - 1.279812543885835e-12)) < 1e-15);
  assert.ok(Math.abs(T.phi(6) - (1 - 9.865876450376983e-10)) < 1e-15);
});
