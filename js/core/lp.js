/*
 * core/lp — símplex de dos fases con la regla de Bland (spec f5b-coste-tiempo, AC2; plan P3).
 *   simplex(c, rows) → x | null
 *     minimiza c·x con x ≥ 0 y rows = [{ a: [coeficientes], op: '<=' | '>=' | '=', b }]; null si no hay solución;
 *     lanza un error si el programa no está acotado o si se pasa del tope de pivotes.
 * Tabla densa: basta para la pestaña de coste–tiempo (30 actividades, unas 150 filas). Las filas con término
 * negativo se multiplican por −1. Fase 1: holgura en las ≤ y artificial en las ≥ y las =; minimiza la suma de
 * artificiales. Las artificiales que quedan en la base a nivel 0 salen antes de la fase 2 (si su fila no tiene otra
 * columna, es redundante y se anula): si se quedaran, la fase 2 podría volverlas positivas y dar una solución que no
 * cumple su fila (el error que encontró el prototipo, plan §5). Regla de Bland para entrar y para salir: no cicla.
 * Un coste reducido cuenta como negativo si pasa de TOL más 10⁻¹³ de la suma de los valores absolutos de sus términos:
 * con costes de 10⁷ o más, el ruido de coma flotante pasaba de una tolerancia solo absoluta y el símplex daba vueltas hasta
 * el tope (revisión de T019, N-F9). Relativa a cada columna, y no a la tabla entera, una actividad de pendiente enorme no
 * borra las pequeñas (ronda 2).
 */
(function (root) {
  'use strict';

  const TOL = 1e-9;
  const MAX_PIVOTS = 20000;

  function pivot(tab, m, N, r, j) {
    const row = tab[r]; const pv = row[j];
    for (let k = 0; k <= N; k++) row[k] /= pv;
    for (let i = 0; i < m; i++) {
      if (i === r) continue;
      const f = tab[i][j];
      if (Math.abs(f) > 1e-15) { const ti = tab[i]; for (let k = 0; k <= N; k++) ti[k] -= f * row[k]; }
    }
  }

  // Optimiza la función de coste cost (sobre las N columnas) desde la base actual; allowed(j) dice qué columnas
  // pueden entrar. Devuelve el número de pivotes hechos.
  function optimize(tab, basis, m, N, cost, allowed, count) {
    for (;;) {
      let enter = -1;
      for (let j = 0; j < N && enter < 0; j++) {
        if (!allowed(j)) continue;
        let rc = cost[j]; let mag = Math.abs(cost[j]);
        for (let i = 0; i < m; i++) { const t = cost[basis[i]] * tab[i][j]; rc -= t; mag += Math.abs(t); }
        if (rc < -(TOL + 1e-13 * mag)) enter = j;
      }
      if (enter < 0) return count;
      let leave = -1; let best = Infinity;
      for (let i = 0; i < m; i++) {
        const a = tab[i][enter];
        if (a <= TOL) continue;
        const ratio = tab[i][N] / a;
        if (ratio < best - 1e-12 || (Math.abs(ratio - best) <= 1e-12 && basis[i] < basis[leave])) { best = ratio; leave = i; }
      }
      if (leave < 0) throw new Error('lp: programa no acotado');
      pivot(tab, m, N, leave, enter);
      basis[leave] = enter;
      if (++count > MAX_PIVOTS) throw new Error('lp: demasiados pivotes');
    }
  }

  function simplex(c, rows) {
    const nv = c.length;
    const norm = rows.map((r) => (r.b < 0
      ? { a: r.a.map((v) => -v), op: r.op === '<=' ? '>=' : r.op === '>=' ? '<=' : '=', b: -r.b }
      : r));
    const m = norm.length;
    let ns = 0; let na = 0;
    const slack = norm.map((r) => (r.op === '=' ? -1 : nv + ns++));
    const art = norm.map((r) => (r.op === '<=' ? -1 : nv + ns + na++));
    const N = nv + ns + na;
    const tab = []; const basis = [];
    norm.forEach((r, i) => {
      const row = new Float64Array(N + 1);
      r.a.forEach((v, j) => { row[j] = v; });
      if (slack[i] >= 0) row[slack[i]] = r.op === '<=' ? 1 : -1;
      if (art[i] >= 0) row[art[i]] = 1;
      row[N] = r.b;
      tab.push(row);
      basis.push(r.op === '<=' ? slack[i] : art[i]);
    });
    const isArt = (j) => j >= nv + ns;
    let count = 0;
    if (na) {
      const c1 = new Float64Array(N);
      for (let j = nv + ns; j < N; j++) c1[j] = 1;
      count = optimize(tab, basis, m, N, c1, () => true, count);
      let rest = 0;
      for (let i = 0; i < m; i++) if (isArt(basis[i])) rest += tab[i][N];
      if (rest > 1e-7) return null;
      for (let i = 0; i < m; i++) {
        if (!isArt(basis[i])) continue;
        let j = 0;
        while (j < nv + ns && Math.abs(tab[i][j]) < TOL) j++;
        if (j === nv + ns) { tab[i].fill(0); continue; }          // fila redundante
        pivot(tab, m, N, i, j);
        basis[i] = j;
      }
    }
    const c2 = new Float64Array(N);
    c.forEach((v, j) => { c2[j] = v; });
    optimize(tab, basis, m, N, c2, (j) => !isArt(j), count);
    const x = new Array(nv).fill(0);
    for (let i = 0; i < m; i++) if (basis[i] < nv) x[basis[i]] = tab[i][N];
    return x;
  }

  const api = { simplex, TOL };
  root.PNL = root.PNL || {};
  root.PNL.lp = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
