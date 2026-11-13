/*
 * core/threept — duraciones con tres estimaciones (spec f4a-tres-tiempos-tcl; plan §0, §3, P2 y P4).
 * - exam(d): las fórmulas de examen, media (a + 4m + b)/6 y varianza ((b − a)/6)².
 * - Tres curvas sobre [a, b] con los mismos a, m y b: 'pert' (beta-PERT, α = 1 + 4(m − a)/(b − a),
 *   β = 1 + 4(b − m)/(b − a): su media es la de examen), 'classic' (beta clásica de Malcolm et al. (1959): moda m y
 *   desviación (b − a)/6, con α + β resuelto por bisección: su varianza es la de examen) y 'tri' (triangular).
 *   Para cada una: params, moments (fórmulas cerradas), pdf, cdf (beta incompleta por fracción continua de Lentz)
 *   e invTable (la inversa en una rejilla, para la cópula de core/sim).
 * - La normal: phi (serie de Marsaglia, 2004; error absoluto < 1e-15 para |z| < 8), phiInv (Acklam con un paso de
 *   Halley) y tableP (z redondeada a dos decimales, mitad hacia arriba en valor absoluto, y Φ a cuatro, como una
 *   tabla impresa).
 * d = { a, m, b } con 0 ≤ a ≤ m ≤ b (la validación es de quien lo llama). Con a = b la duración es fija.
 */
(function (root) {
  'use strict';

  const KINDS = ['pert', 'classic', 'tri'];
  const fixed = (d) => !(d.b > d.a);

  function exam(d) {
    return { mean: (d.a + 4 * d.m + d.b) / 6, var: ((d.b - d.a) / 6) ** 2 };
  }

  /** Los pasos de una actividad para el paso a paso de M5 (A5): la media y la varianza de examen, con su campo de predicción. */
  function trace(d) {
    const e = exam(d);
    return [{ kind: 'unc.mean', values: [{ field: 'unc.mean', value: e.mean }] }, { kind: 'unc.var', values: [{ field: 'unc.var', value: e.var }] }];
  }

  // ---------- funciones especiales ----------
  const LANCZOS = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059,
    12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
  function lgamma(x) {               // x ≥ 0,5 (aquí α, β ≥ 1)
    const z = x - 1; let s = LANCZOS[0];
    for (let i = 1; i < 9; i++) s += LANCZOS[i] / (z + i);
    const t = z + 7.5;
    return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(s);
  }
  const lbeta = (a, b) => lgamma(a) + lgamma(b) - lgamma(a + b);
  const TINY = 1e-300;
  function betacf(a, b, x) {          // fracción continua de la beta incompleta (Lentz modificado)
    let c = 1; let d = 1 - ((a + b) * x) / (a + 1);
    if (Math.abs(d) < TINY) d = TINY;
    d = 1 / d; let h = d;
    for (let m = 1; m <= 300; m++) {
      const m2 = 2 * m;
      let aa = (m * (b - m) * x) / ((a + m2 - 1) * (a + m2));
      d = 1 + aa * d; if (Math.abs(d) < TINY) d = TINY;
      c = 1 + aa / c; if (Math.abs(c) < TINY) c = TINY;
      d = 1 / d; h *= d * c;
      aa = (-(a + m) * (a + b + m) * x) / ((a + m2) * (a + m2 + 1));
      d = 1 + aa * d; if (Math.abs(d) < TINY) d = TINY;
      c = 1 + aa / c; if (Math.abs(c) < TINY) c = TINY;
      d = 1 / d; const del = d * c; h *= del;
      if (Math.abs(del - 1) < 1e-16) break;
    }
    return h;
  }
  function ibeta(a, b, x) {           // beta incompleta regularizada I_x(a, b)
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    const bt = Math.exp(a * Math.log(x) + b * Math.log1p(-x) - lbeta(a, b));
    return x < (a + 1) / (a + b + 2) ? (bt * betacf(a, b, x)) / a : 1 - (bt * betacf(b, a, 1 - x)) / b;
  }

  // ---------- parámetros y momentos ----------
  const betaVar = (al, be) => (al * be) / ((al + be) ** 2 * (al + be + 1));
  function classicParams(p) {          // moda p en [0, 1] y varianza 1/36 en la escala [0, 1]
    const ab = (s) => [1 + p * (s - 2), 1 + (1 - p) * (s - 2)];
    let lo = 2; let hi = 1e6;          // la varianza decrece de 1/12 (s = 2) a 0
    for (let k = 0; k < 200 && hi - lo > 1e-13 * hi; k++) {
      const mid = (lo + hi) / 2;
      const [al, be] = ab(mid);
      if (betaVar(al, be) > 1 / 36) lo = mid; else hi = mid;
    }
    const [alpha, beta] = ab((lo + hi) / 2);
    return { alpha, beta };
  }
  function params(kind, d) {
    if (fixed(d) || kind === 'tri') return null;
    const p = (d.m - d.a) / (d.b - d.a);
    if (kind === 'pert') return { alpha: 1 + 4 * p, beta: 1 + 4 * (1 - p) };
    if (kind === 'classic') return classicParams(p);
    throw new Error(`threept: curva desconocida ${kind}`);
  }
  function moments(kind, d) {
    if (fixed(d)) return { mean: d.a, var: 0 };
    if (kind === 'tri') {
      const { a, m, b } = d;
      return { mean: (a + m + b) / 3, var: (a * a + m * m + b * b - a * m - a * b - m * b) / 18 };
    }
    const { alpha, beta } = params(kind, d); const w = d.b - d.a;
    return { mean: d.a + (w * alpha) / (alpha + beta), var: w * w * betaVar(alpha, beta) };
  }

  // ---------- densidad, distribución e inversa ----------
  function pdf(kind, d, x) {
    if (fixed(d) || x < d.a || x > d.b) return 0;
    const w = d.b - d.a;
    if (kind === 'tri') {
      const { a, m, b } = d;
      if (x < m) return (2 * (x - a)) / (w * (m - a));
      if (x > m) return (2 * (b - x)) / (w * (b - m));
      return 2 / w;
    }
    const { alpha, beta } = params(kind, d); const t = (x - d.a) / w;
    if ((t === 0 && alpha > 1) || (t === 1 && beta > 1)) return 0;
    const la = alpha === 1 ? 0 : (alpha - 1) * Math.log(t);     // 0 · log 0 = 0 con la moda en un extremo
    const lb = beta === 1 ? 0 : (beta - 1) * Math.log1p(-t);
    return Math.exp(la + lb - lbeta(alpha, beta)) / w;
  }
  function cdf(kind, d, x) {
    if (fixed(d)) return x < d.a ? 0 : 1;
    if (x <= d.a) return 0;
    if (x >= d.b) return 1;
    const w = d.b - d.a;
    if (kind === 'tri') {
      const { a, m, b } = d;
      return x <= m ? (x - a) ** 2 / (w * (m - a)) : 1 - (b - x) ** 2 / (w * (b - m));
    }
    const { alpha, beta } = params(kind, d);
    return ibeta(alpha, beta, (x - d.a) / w);
  }
  function quantile(kind, d, p) {
    if (fixed(d) || p <= 0) return d.a;
    if (p >= 1) return d.b;
    if (kind === 'tri') {
      const { a, m, b } = d; const w = b - a; const f = (m - a) / w;
      return p <= f ? a + Math.sqrt(p * w * (m - a)) : b - Math.sqrt((1 - p) * w * (b - m));
    }
    let lo = d.a; let hi = d.b;
    for (let k = 0; k < 100 && hi - lo > 1e-14 * (d.b - d.a); k++) {
      const mid = (lo + hi) / 2;
      if (cdf(kind, d, mid) < p) lo = mid; else hi = mid;
    }
    return (lo + hi) / 2;
  }
  function invTable(kind, d, size) {
    const out = new Float64Array(size + 1);
    for (let i = 0; i <= size; i++) out[i] = quantile(kind, d, i / size);
    return out;
  }

  // ---------- la normal ----------
  const LN_SQRT_2PI = 0.9189385332046728;
  function phi(z) {
    if (Number.isNaN(z)) return NaN;   // sin esto, la serie no termina (NaN !== NaN) (revisión F4a, nit)
    if (z < -37) return 0;
    if (z > 37) return 1;
    if (Math.abs(z) > 8) {             // cola: fracción continua de Laplace para 1 − Φ(|z|)
      const x = Math.abs(z); let f = x;
      for (let k = 60; k >= 1; k--) f = x + k / f;
      const tail = Math.exp(-0.5 * x * x - LN_SQRT_2PI) / f;
      return z < 0 ? tail : 1 - tail;
    }
    let s = z; let t = 0; let b = z; const q = z * z; let i = 1;
    while (s !== t) { t = s; i += 2; b *= q / i; s = t + b; }
    const v = s * Math.exp(-0.5 * q - LN_SQRT_2PI);
    // En la cola izquierda, 0,5 + v pierde cifras: se calcula por simetría desde la derecha con la fracción continua.
    if (z < -3) {
      const x = -z; let f = x;
      for (let k = 80; k >= 1; k--) f = x + k / f;
      return Math.exp(-0.5 * x * x - LN_SQRT_2PI) / f;
    }
    return Math.min(1, 0.5 + v);       // cerca de z = 8, 0,5 + v puede pasar de 1 en la última cifra
  }
  const A = [-3.969683028665376e+01, 2.209460984245205e+02, -2.759285104469687e+02, 1.383577518672690e+02, -3.066479806614716e+01, 2.506628277459239e+00];
  const B = [-5.447609879822406e+01, 1.615858368580409e+02, -1.556989798598866e+02, 6.680131188771972e+01, -1.328068155288572e+01];
  const C = [-7.784894002430293e-03, -3.223964580411365e-01, -2.400758277161838e+00, -2.549732539343734e+00, 4.374664141464968e+00, 2.938163982698783e+00];
  const D = [7.784695709041462e-03, 3.224671290700398e-01, 2.445134137142996e+00, 3.754408661907416e+00];
  function phiInv(p) {
    if (Number.isNaN(p)) return NaN;
    if (p <= 0) return -Infinity;
    if (p >= 1) return Infinity;
    const PLOW = 0.02425; let x;
    if (p < PLOW) {
      const q = Math.sqrt(-2 * Math.log(p));
      x = (((((C[0] * q + C[1]) * q + C[2]) * q + C[3]) * q + C[4]) * q + C[5]) / ((((D[0] * q + D[1]) * q + D[2]) * q + D[3]) * q + 1);
    } else if (p <= 1 - PLOW) {
      const q = p - 0.5; const r = q * q;
      x = ((((((A[0] * r + A[1]) * r + A[2]) * r + A[3]) * r + A[4]) * r + A[5]) * q) / (((((B[0] * r + B[1]) * r + B[2]) * r + B[3]) * r + B[4]) * r + 1);
    } else {
      const q = Math.sqrt(-2 * Math.log1p(-p));
      x = -(((((C[0] * q + C[1]) * q + C[2]) * q + C[3]) * q + C[4]) * q + C[5]) / ((((D[0] * q + D[1]) * q + D[2]) * q + D[3]) * q + 1);
    }
    for (let k = 0; k < 2; k++) {      // dos pasos de Halley con Φ de alta precisión
      const e = phi(x) - p; const u = e * Math.exp(0.5 * x * x + LN_SQRT_2PI);
      x -= u / (1 + (x * u) / 2);
    }
    return x;
  }
  function tableP(z) {
    const z2 = Math.sign(z) * (Math.round(Number((Math.abs(z) * 100).toFixed(8))) / 100) || 0;
    return { z2, p4: Math.round(phi(z2) * 1e4) / 1e4 };
  }

  const api = { KINDS, exam, trace, params, moments, pdf, cdf, quantile, invTable, phi, phiInv, tableP, ibeta };
  root.PNL = root.PNL || {};
  root.PNL.threept = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
