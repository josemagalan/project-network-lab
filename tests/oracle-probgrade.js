'use strict';
// Oráculo de la corrección de los ejercicios de probabilidad y de Montecarlo (plan f3e-probabilidad-montecarlo, §0
// «Corrección TCL» y «Montecarlo», T005). Solo para las pruebas: recalcula la solución y cada casilla por definición
// con los datos del alumno, sin usar core/probgrade, core/probgen, core/tcl, core/threept ni core/mc:
//   - la normal con su propia cuenta (Simpson sobre la densidad) y la tabla (z a dos decimales, Φ a cuatro);
//   - los caminos por fuerza bruta (todos los caminos de inicio a fin) para el camino de las medias, las combinaciones
//     de las discretas y las réplicas.
// Reglas (las del plan §0, con las decisiones técnicas de T005 en decisions.md):
//   - Estados: ok (= la solución, dentro de su tolerancia), carried (= la fórmula con los datos del alumno), wrong,
//     blank (vacía) e invalid (no es un número, ids que no existen, opción fuera de la lista).
//   - Datos del alumno, dos lecturas, y vale cualquiera: «tal como los escribió» (su número; el de la solución si la
//     casilla está vacía o no es válida) y «con los buenos exactos» (el de la solución si su casilla es ok, vacía o no
//     válida; su número si es carried o wrong). Así el redondeo de un dato bueno no decide un camino ni una suma.
//   - Un número del alumno: coma o punto decimal, o una fracción de enteros (3/8).
// También genera las hojas de un alumno coherente con errores sembrados (student), para el barrido.
const EPS = 1e-9;
const TIE = 1e-6;
const SQRT2PI = Math.sqrt(2 * Math.PI);
const Z95 = [1.64, 1.645, 1.65];

// ---------- números ----------

function intOf(t, signed) {
  let s = t.trim(); let sign = 1;
  if (signed && s[0] === '-') { sign = -1; s = s.slice(1); }
  if (!s) return null;
  for (const ch of s) if (ch < '0' || ch > '9') return null;
  return sign * Number(s);
}
/** vacía → null; número con coma o punto, o fracción de enteros; lo demás → NaN. */
function num(v) {
  const s = String(v == null ? '' : v).trim();
  if (!s) return null;
  const parts = s.split('/');
  if (parts.length === 2) {
    const a = intOf(parts[0], true); const b = intOf(parts[1], false);
    return a === null || b === null || b === 0 ? NaN : a / b;
  }
  if (parts.length > 2) return NaN;
  let i = s[0] === '-' ? 1 : 0; let digits = 0; let sep = 0; let out = i ? '-' : '';
  for (; i < s.length; i++) {
    const ch = s[i];
    if (ch >= '0' && ch <= '9') { digits++; out += ch; } else if ((ch === ',' || ch === '.') && !sep) { sep++; out += '.'; } else return NaN;
  }
  return digits ? Number(out) : NaN;
}
const isNum = (x) => typeof x === 'number' && !Number.isNaN(x);

// ---------- la normal, por su cuenta ----------

const phiMemo = new Map();
/** Φ(z) por la regla de Simpson sobre la densidad (8000 intervalos; error < 1e-12). */
function phi(z) {
  if (phiMemo.has(z)) return phiMemo.get(z);
  let v;
  if (z > 9) v = 1;
  else if (z < -9) v = 0;
  else {
    const x = Math.abs(z); const n = 8000; const h = x / n;
    let s = 1 + Math.exp(-x * x / 2);
    for (let i = 1; i < n; i++) { const t = i * h; s += (i % 2 ? 4 : 2) * Math.exp(-t * t / 2); }
    const area = (s * h) / 3 / SQRT2PI;
    v = z >= 0 ? 0.5 + area : 0.5 - area;
  }
  if (phiMemo.size > 200000) phiMemo.clear();
  phiMemo.set(z, v);
  return v;
}
const invMemo = new Map();
/** Φ⁻¹(p) por bisección sobre phi. */
function phiInv(p) {
  if (!invMemo.has(p)) {
    let lo = -9; let hi = 9;
    for (let k = 0; k < 80; k++) { const mid = (lo + hi) / 2; if (phi(mid) < p) lo = mid; else hi = mid; }
    invMemo.set(p, (lo + hi) / 2);
  }
  return invMemo.get(p);
}
// Redondeo a k decimales, mitad hacia arriba en valor absoluto (quitando el ruido de la coma flotante).
const roundK = (x, k) => (Math.sign(x) * Math.round(Number((Math.abs(x) * 10 ** k).toFixed(6)))) / 10 ** k || 0;
/** La tabla de la normal: z a dos decimales y Φ a cuatro. */
function tableP(z) {
  const z2 = roundK(z, 2);
  return { z2, p4: Math.round(phi(z2) * 1e4) / 1e4 };
}

// ---------- caminos por fuerza bruta ----------

function succsOf(rows) {
  const succ = Object.fromEntries(rows.map((r) => [r.id, []]));
  for (const r of rows) for (const p of r.preds) succ[p].push(r.id);
  return succ;
}
/** Todos los caminos de inicio a fin (listas de ids en orden). */
function allPaths(rows) {
  const succ = succsOf(rows); const out = [];
  const walk = (id, acc) => {
    const next = acc.concat([id]);
    if (!succ[id].length) { out.push(next); return; }
    for (const k of succ[id]) walk(k, next);
  };
  for (const r of rows) if (!r.preds.length) walk(r.id, []);
  return out;
}
const setKey = (ids) => ids.slice().sort().join('|');
const natural = (x, y) => x.localeCompare(y, 'en', { numeric: true });
const byIds = (x, y) => {
  for (let i = 0; i < Math.min(x.length, y.length); i++) { const c = natural(x[i], y[i]); if (c) return c; }
  return x.length - y.length;
};
const sum = (ids, f) => ids.reduce((s, id) => s + f(id), 0);
/** Duración y actividades críticas (en algún camino de duración máxima) con duraciones d. */
function longest(paths, d) {
  let T = -Infinity;
  for (const p of paths) T = Math.max(T, sum(p, (id) => d[id]));
  const crit = new Set();
  for (const p of paths) if (sum(p, (id) => d[id]) >= T - TIE) for (const id of p) crit.add(id);
  return { T, crit: [...crit].sort(natural) };
}

// Separadores de las marcas escritas como texto (como un camino de la F3a).
const SEPS = [' ', '\t', '\n', ' ', ',', ';', '-', '–', '>', '→'];
/** Las marcas del alumno: lista de ids (o texto con separadores), en mayúsculas y sin repetir. */
function marks(v) {
  if (v == null) return [];
  let list;
  if (Array.isArray(v)) list = v.map((x) => String(x == null ? '' : x));
  else { let s = String(v); for (const c of SEPS) s = s.split(c).join(' '); list = s.split(' '); }
  return [...new Set(list.map((x) => x.trim().toUpperCase()).filter(Boolean))];
}

// ---------- casillas ----------

const within = (v, r, tol) => Math.abs(v - r) <= tol + EPS;
/** Estado de un número frente a la solución (rights) y a lo que da la fórmula con los datos del alumno (expects). */
function judge(v, rights, expects) {
  const x = num(v);
  if (x === null) return 'blank';
  if (Number.isNaN(x)) return 'invalid';
  if (rights.some(([r, t]) => r != null && within(x, r, t))) return 'ok';
  if (expects.some(([r, t]) => r != null && Number.isFinite(r) && within(x, r, t))) return 'carried';
  return 'wrong';
}
/** Las dos lecturas de los datos del alumno (cabecera). */
function readers(ans, st, exact) {
  const raw = (k) => { const x = num(ans[k]); return isNum(x) ? x : exact(k); };
  const snap = (k) => (st[k] === 'carried' || st[k] === 'wrong' ? num(ans[k]) : exact(k));
  return [raw, snap];
}

// ---------- TCL ----------

function tclFields(ex) {
  const out = [];
  for (const r of ex.rows) if (r.mu == null) out.push(`${r.id}.te`, `${r.id}.var`);
  out.push('path', 'mu', 'var', 'z', 'p', 'zp', 'Tp');
  if (ex.route) out.push('r.mu', 'r.var', 'r.z', 'r.p', 'both');
  return out;
}

function tclSolution(ex) {
  const acts = {};
  for (const r of ex.rows) {
    acts[r.id] = r.mu != null ? { te: r.mu, var: r.var, given: true } : { te: (r.a + 4 * r.m + r.b) / 6, var: ((r.b - r.a) / 6) ** 2 };
  }
  const paths = allPaths(ex.rows);
  const best = critical(paths, (id) => acts[id].te, (id) => acts[id].var)[0];
  const mu = sum(best, (id) => acts[id].te); const v = sum(best, (id) => acts[id].var); const sd = Math.sqrt(v);
  const zE = (ex.deadline - mu) / sd; const t = tableP(zE);
  const zpE = phiInv(ex.prob);
  const zps = [roundK(zpE, 2), roundK(zpE, 3), zpE].concat(ex.prob === 0.95 ? Z95 : []);
  const sol = { acts, paths, path: best, mu, var: v, sd, zE, z: t.z2, p: t.p4, pE: phi(zE), zpE, zp2: roundK(zpE, 2), zp3: roundK(zpE, 3),
    zpRights: [[roundK(zpE, 2), 0.01], [roundK(zpE, 3), 0.0005]].concat(ex.prob === 0.95 ? Z95.map((z) => [z, 0.0005]) : []),
    TpRights: zps.map((z) => [mu + z * sd, 0.05]), route: null };
  if (ex.route) {
    const rmu = sum(ex.route, (id) => acts[id].te); const rv = sum(ex.route, (id) => acts[id].var);
    const rzE = (ex.deadline - rmu) / Math.sqrt(rv); const rt = tableP(rzE);
    sol.route = { acts: ex.route.slice(), mu: rmu, var: rv, zE: rzE, z: rt.z2, p: rt.p4, pE: phi(rzE), both: t.p4 * rt.p4, bothE: phi(zE) * phi(rzE) };
  }
  return sol;
}
/** Los caminos críticos con unas medias y varianzas: máxima media; con empate, máxima varianza (todos los empatados). */
function critical(paths, te, va) {
  const S = paths.map((p) => sum(p, te));
  const top = Math.max(...S);
  const t1 = paths.filter((_, i) => S[i] >= top - TIE);
  const V = t1.map((p) => sum(p, va));
  const vtop = Math.max(...V);
  return t1.filter((_, i) => V[i] >= vtop - TIE).sort(byIds);
}

/** Estados de todas las casillas de un ejercicio TCL. */
function tclClassify(ex, ans0, sol0) {
  const ans = ans0 || {};
  const sol = sol0 || tclSolution(ex);
  const st = {}; const uses = {};
  const exact = (k) => {
    const [a, f] = k.split('.');
    if (f === 'te' && a !== 'r') return sol.acts[a].te;
    if (f === 'var' && a !== 'r') return sol.acts[a].var;
    return { mu: sol.mu, var: sol.var, z: sol.z, p: sol.p, zp: sol.zp2, 'r.mu': sol.route && sol.route.mu, 'r.var': sol.route && sol.route.var,
      'r.z': sol.route && sol.route.z, 'r.p': sol.route && sol.route.p }[k];
  };
  const [raw, snap] = readers(ans, st, exact);
  const cellRows = ex.rows.filter((r) => r.mu == null).map((r) => r.id);
  const teOf = (D) => (id) => (sol.acts[id].given ? sol.acts[id].te : D(`${id}.te`));
  const varOf = (D) => (id) => (sol.acts[id].given ? sol.acts[id].var : D(`${id}.var`));
  for (const id of cellRows) {
    st[`${id}.te`] = judge(ans[`${id}.te`], [[sol.acts[id].te, 0.01]], []); uses[`${id}.te`] = [];
    st[`${id}.var`] = judge(ans[`${id}.var`], [[sol.acts[id].var, 0.01]], []); uses[`${id}.var`] = [];
  }
  // camino
  const ids = new Set(ex.rows.map((r) => r.id));
  const m = marks(ans.path);
  const byKey = new Map(sol.paths.map((p) => [setKey(p), p]));
  if (!m.length) st.path = 'blank';
  else if (m.some((x) => !ids.has(x))) st.path = 'invalid';
  else if (setKey(m) === setKey(sol.path)) st.path = 'ok';
  else {
    const good = new Set();
    for (const D of [raw, snap]) for (const p of critical(sol.paths, teOf(D), varOf(D))) good.add(setKey(p));
    st.path = good.has(setKey(m)) ? 'carried' : 'wrong';
  }
  uses.path = cellRows.flatMap((id) => [`${id}.te`, `${id}.var`]);
  const hisPath = m.length && byKey.has(setKey(m)) && m.every((x) => ids.has(x)) ? byKey.get(setKey(m)) : null;
  const used = hisPath || sol.path;
  const pathUses = (f) => (hisPath ? ['path'] : []).concat(used.filter((id) => !sol.acts[id].given).map((id) => `${id}.${f}`));
  const tol = (p) => 0.01 * p.length;
  st.mu = judge(ans.mu, [[sol.mu, tol(sol.path)]], [raw, snap].map((D) => [sum(used, teOf(D)), tol(used)])); uses.mu = pathUses('te');
  st.var = judge(ans.var, [[sol.var, tol(sol.path)]], [raw, snap].map((D) => [sum(used, varOf(D)), tol(used)])); uses.var = pathUses('var');
  const zOf = (mu, v) => (v > 0 ? (ex.deadline - mu) / Math.sqrt(v) : null);
  // T021 (N-F5): también la z con σ redondeada a dos decimales (con la solución exacta o a dos decimales, y con sus datos).
  const rd2 = (x) => Math.round(x * 100 + (x >= 0 ? 1e-9 : -1e-9)) / 100;
  const zSig = (mu, v) => { const sd = v > 0 ? rd2(Math.sqrt(v)) : 0; return sd > 0 ? (ex.deadline - mu) / sd : null; };
  const zR = (mu, v) => [[zSig(mu, v), 0.01], [zSig(rd2(mu), rd2(v)), 0.01]];
  st.z = judge(ans.z, [[sol.z, 0.01]].concat(zR(sol.mu, sol.var)), [raw, snap].flatMap((D) => [[zOf(D('mu'), D('var')), 0.01], [zSig(D('mu'), D('var')), 0.01]])); uses.z = ['mu', 'var'];
  const pExp = (z) => (z == null ? [] : [[tableP(z).p4, 0.0005], [phi(z), 0.005]]);
  st.p = judge(ans.p, [[sol.p, 0.0005], [sol.pE, 0.005]], [raw, snap].flatMap((D) => pExp(D('z')))); uses.p = ['z'];
  st.zp = judge(ans.zp, sol.zpRights, []); uses.zp = [];
  st.Tp = judge(ans.Tp, sol.TpRights, [raw, snap].map((D) => [D('var') >= 0 ? D('mu') + D('zp') * Math.sqrt(D('var')) : null, 0.05]));
  uses.Tp = ['mu', 'var', 'zp'];
  if (ex.route) {
    const R = sol.route; const rcells = ex.route.filter((id) => !sol.acts[id].given);
    st['r.mu'] = judge(ans['r.mu'], [[R.mu, tol(ex.route)]], [raw, snap].map((D) => [sum(ex.route, teOf(D)), tol(ex.route)]));
    uses['r.mu'] = rcells.map((id) => `${id}.te`);
    st['r.var'] = judge(ans['r.var'], [[R.var, tol(ex.route)]], [raw, snap].map((D) => [sum(ex.route, varOf(D)), tol(ex.route)]));
    uses['r.var'] = rcells.map((id) => `${id}.var`);
    st['r.z'] = judge(ans['r.z'], [[R.z, 0.01]].concat(zR(R.mu, R.var)), [raw, snap].flatMap((D) => [[zOf(D('r.mu'), D('r.var')), 0.01], [zSig(D('r.mu'), D('r.var')), 0.01]])); uses['r.z'] = ['r.mu', 'r.var'];
    st['r.p'] = judge(ans['r.p'], [[R.p, 0.0005], [R.pE, 0.005]], [raw, snap].flatMap((D) => pExp(D('r.z')))); uses['r.p'] = ['r.z'];
    st.both = judge(ans.both, [[R.both, 0.0005], [R.bothE, 0.005]],
      [raw, snap].flatMap((D) => [[D('p') * D('r.p'), 0.0005], [phi(D('z')) * phi(D('r.z')), 0.005]]));
    uses.both = ['p', 'r.p'];
  }
  return { status: st, uses, sol };
}

// ---------- discretas ----------

function discFields(ex, sol) {
  const out = [];
  sol.combos.forEach((_, i) => out.push(`c${i + 1}.T`, `c${i + 1}.p`));
  out.push('mean', 'pT');
  for (const id of ex.disc) out.push(`${id}.crit`);
  return out;
}
/** Las combinaciones en el orden de las filas, la última discreta cambiando más deprisa; T y críticas por fuerza bruta. */
function discSolution(ex) {
  const paths = allPaths(ex.rows);
  const disc = ex.rows.filter((r) => r.x);
  const combos = [];
  const rec = (j, vals, p) => {
    if (j === disc.length) {
      const d = Object.fromEntries(ex.rows.map((r) => [r.id, r.x ? vals[r.id] : r.d]));
      const L = longest(paths, d);
      combos.push({ vals: Object.assign({}, vals), p, T: L.T, crit: L.crit });
      return;
    }
    const r = disc[j];
    r.x.forEach((x, i) => rec(j + 1, Object.assign({}, vals, { [r.id]: x }), p * r.p[i]));
  };
  rec(0, {}, 1);
  const mean = combos.reduce((s, c) => s + c.p * c.T, 0);
  const pT = combos.reduce((s, c) => s + (c.T <= ex.deadline + EPS ? c.p : 0), 0);
  const crit = Object.fromEntries(ex.disc.map((id) => [id, combos.reduce((s, c) => s + (c.crit.includes(id) ? c.p : 0), 0)]));
  return { combos, mean, pT, crit };
}
function discClassify(ex, ans0, sol0) {
  const ans = ans0 || {};
  const sol = sol0 || discSolution(ex);
  const st = {}; const uses = {};
  const exact = (k) => { const [c, f] = k.split('.'); return sol.combos[Number(c.slice(1)) - 1][f]; };
  const [raw, snap] = readers(ans, st, exact);
  const ck = [];
  sol.combos.forEach((c, i) => {
    const k = `c${i + 1}`; ck.push(`${k}.T`, `${k}.p`);
    st[`${k}.T`] = judge(ans[`${k}.T`], [[c.T, 0.001]], []); uses[`${k}.T`] = [];
    st[`${k}.p`] = judge(ans[`${k}.p`], [[c.p, 0.001]], []); uses[`${k}.p`] = [];
  });
  const n = sol.combos.length;
  const E = (D) => { let s = 0; for (let i = 1; i <= n; i++) s += D(`c${i}.p`) * D(`c${i}.T`); return s; };
  const P = (D) => { let s = 0; for (let i = 1; i <= n; i++) if (D(`c${i}.T`) <= ex.deadline + EPS) s += D(`c${i}.p`); return s; };
  st.mean = judge(ans.mean, [[sol.mean, 0.001]], [raw, snap].map((D) => [E(D), 0.001])); uses.mean = ck.slice();
  st.pT = judge(ans.pT, [[sol.pT, 0.001]], [raw, snap].map((D) => [P(D), 0.001])); uses.pT = ck.slice();
  // T021 (N-F3): la criticidad, también con las p del alumno en las combinaciones en que la actividad es crítica.
  for (const id of ex.disc) {
    const ks = sol.combos.map((c, i) => (c.crit.includes(id) ? `c${i + 1}.p` : null)).filter(Boolean);
    const C = (D) => ks.reduce((s, k) => s + D(k), 0);
    st[`${id}.crit`] = judge(ans[`${id}.crit`], [[sol.crit[id], 0.001]], [raw, snap].map((D) => [C(D), 0.001])); uses[`${id}.crit`] = ks;
  }
  return { status: st, uses, sol };
}

// ---------- réplicas ----------

function repFields(ex) {
  const out = [];
  for (let k = 1; k <= ex.n; k++) out.push(`r${k}.T`, `r${k}.crit`);
  out.push('pT');
  for (const r of ex.rows) out.push(`${r.id}.crit`);
  return out;
}
function repSolution(ex) {
  const paths = allPaths(ex.rows);
  const reps = ex.reps.map((row) => longest(paths, Object.fromEntries(ex.rows.map((r, i) => [r.id, row[i]]))));
  const pT = reps.filter((o) => o.T <= ex.deadline + EPS).length / ex.n;
  const crit = Object.fromEntries(ex.rows.map((r) => [r.id, reps.filter((o) => o.crit.includes(r.id)).length / ex.n]));
  return { reps, pT, crit };
}
function repClassify(ex, ans0, sol0) {
  const ans = ans0 || {};
  const sol = sol0 || repSolution(ex);
  const st = {}; const uses = {};
  const ids = new Set(ex.rows.map((r) => r.id));
  const tk = []; const mk = [];
  sol.reps.forEach((o, i) => {
    const k = `r${i + 1}`; tk.push(`${k}.T`); mk.push(`${k}.crit`);
    st[`${k}.T`] = judge(ans[`${k}.T`], [[o.T, 0.001]], []); uses[`${k}.T`] = [];
    const m = marks(ans[`${k}.crit`]);
    st[`${k}.crit`] = !m.length ? 'blank' : m.some((x) => !ids.has(x)) ? 'invalid' : setKey(m) === setKey(o.crit) ? 'ok' : 'wrong';
    uses[`${k}.crit`] = [];
  });
  const Traw = (i) => { const x = num(ans[`r${i + 1}.T`]); return isNum(x) ? x : sol.reps[i].T; };
  const Tsnap = (i) => (st[`r${i + 1}.T`] === 'wrong' ? num(ans[`r${i + 1}.T`]) : sol.reps[i].T);
  const M = (i) => (st[`r${i + 1}.crit`] === 'wrong' ? marks(ans[`r${i + 1}.crit`]) : sol.reps[i].crit);
  const count = (f) => sol.reps.filter((_, i) => f(i)).length / ex.n;
  st.pT = judge(ans.pT, [[sol.pT, 0.001]], [Traw, Tsnap].map((Tf) => [count((i) => Tf(i) <= ex.deadline + EPS), 0.001])); uses.pT = tk;
  for (const r of ex.rows) {
    st[`${r.id}.crit`] = judge(ans[`${r.id}.crit`], [[sol.crit[r.id], 0.001]], [[count((i) => M(i).includes(r.id)), 0.001]]);
    uses[`${r.id}.crit`] = mk;
  }
  return { status: st, uses, sol };
}

// ---------- hojas de un alumno coherente con errores sembrados ----------

const fmt = (x, k, comma) => { const s = Number(x).toFixed(k); return comma ? s.replace('.', ',') : s; };
const pick = (r, xs) => xs[Math.floor(r() * xs.length)];
const delta = (r, lo, hi) => (r() < 0.5 ? -1 : 1) * (lo + (hi - lo) * r());
/** Una fracción exacta de p (denominador ≤ 100 000), como texto, o null. */
function fraction(p) {
  for (let d = 1; d <= 100000; d++) { const n = Math.round(p * d); if (Math.abs(n / d - p) < 1e-12) return `${n}/${d}`; }
  return null;
}
/**
 * Un alumno coherente: escribe redondeado (con coma o punto) y sigue con lo que ha escrito; en `errs` casillas cambia su
 * valor (y sigue con él). Deja en blanco o ilegibles algunas casillas buenas (las que darían ok).
 * → { ans, sown: [claves] }.
 */
function tclStudent(ex, sol, r, errs) {
  const comma = r() < 0.5; const kd = pick(r, [2, 2, 3, 4]); const mode = r() < 0.5 ? 'table' : 'exact';
  const fields = tclFields(ex).filter((k) => k !== 'path' || sol.paths.length > 1);
  const sown = new Set();
  while (sown.size < Math.min(errs, fields.length)) sown.add(pick(r, fields));
  const ans = {}; const val = {};
  const put = (k, x, dec, lo, hi) => {
    const t = fmt(sown.has(k) ? x + delta(r, lo, hi) : x, dec, comma); ans[k] = t; val[k] = num(t);
  };
  const putPos = (k, x, dec) => { const t = fmt(sown.has(k) ? x + Math.abs(delta(r, 0.5, 3)) : x, dec, comma); ans[k] = t; val[k] = num(t); };
  for (const row of ex.rows) {
    if (row.mu != null) { val[`${row.id}.te`] = row.mu; val[`${row.id}.var`] = row.var; continue; }
    put(`${row.id}.te`, sol.acts[row.id].te, kd, 0.5, 3);
    putPos(`${row.id}.var`, sol.acts[row.id].var, kd);
  }
  const te = (id) => val[`${id}.te`]; const va = (id) => val[`${id}.var`];
  let path = critical(sol.paths, te, va)[0];
  if (sown.has('path')) {
    const others = sol.paths.filter((p) => setKey(p) !== setKey(path) && setKey(p) !== setKey(sol.path) && sum(p, va) > 0.05);
    if (others.length) path = pick(r, others); else sown.delete('path');
  }
  ans.path = r() < 0.5 ? path.slice() : path.join(pick(r, ['-', ' ', ', ']));
  put('mu', sum(path, te), 2, 0.5, 3);
  putPos('var', sum(path, va), 2);
  put('z', (ex.deadline - val.mu) / Math.sqrt(val.var), 2, 0.1, 1);
  const pOf = (z) => (mode === 'table' ? tableP(z).p4 : phi(z));
  put('p', pOf(val.z), 4, 0.05, 0.3);
  const z0 = ex.prob === 0.95 ? pick(r, Z95) : pick(r, [sol.zp2, sol.zp3]);
  put('zp', z0, 3, 0.1, 0.5);
  put('Tp', val.mu + val.zp * Math.sqrt(val.var), 2, 0.5, 3);
  if (ex.route) {
    put('r.mu', sum(ex.route, te), 2, 0.5, 3);
    putPos('r.var', sum(ex.route, va), 2);
    put('r.z', (ex.deadline - val['r.mu']) / Math.sqrt(val['r.var']), 2, 0.1, 1);
    put('r.p', pOf(val['r.z']), 4, 0.05, 0.3);
    put('both', val.p * val['r.p'], 4, 0.05, 0.2);
  }
  blanks(ans, sown, r, (a) => tclClassify(ex, a, sol).status);
  return { ans, sown: [...sown] };
}
/**
 * Deja en blanco o ilegibles algunas casillas que darían ok (no las sembradas). Una casilla vacía cuenta con el valor de
 * la solución y el alumno siguió con el que había escrito: si eso deja mal otra casilla (una σ² diminuta que dispara la
 * z…), el alumno ya no es coherente y se deshacen.
 */
function blanks(ans, sown, r, classify) {
  const st = classify(ans);
  const before = Object.assign({}, ans);
  for (const k of Object.keys(ans)) {
    if (sown.has(k) || st[k] !== 'ok') continue;
    const u = r();
    if (u < 0.08) ans[k] = Array.isArray(ans[k]) ? [] : '';
    else if (u < 0.11) ans[k] = Array.isArray(ans[k]) ? ['?'] : pick(r, ['x', '1,2,3', '--', '1/0']);
  }
  const after = classify(ans);
  if (Object.keys(after).some((k) => after[k] === 'wrong' && !sown.has(k))) Object.assign(ans, before);
}

function discStudent(ex, sol, r, errs) {
  const comma = r() < 0.5; const mode = pick(r, ['dec3', 'dec4', 'frac']);
  const fields = discFields(ex, sol);
  const sown = new Set();
  while (sown.size < errs) sown.add(pick(r, fields));
  const ans = {}; const T = []; const P = [];
  sol.combos.forEach((c, i) => {
    const kT = `c${i + 1}.T`; const kp = `c${i + 1}.p`;
    if (sown.has(kT)) { T[i] = c.T + Math.round(delta(r, 1, 5)); } else T[i] = c.T;
    ans[kT] = String(T[i]);
    if (sown.has(kp)) { const t = fmt(c.p + delta(r, 0.01, 0.1), 3, comma); ans[kp] = t; P[i] = num(t); } else {
      P[i] = c.p; const f = mode === 'frac' ? fraction(c.p) : null;
      ans[kp] = f || fmt(c.p, mode === 'dec3' ? 3 : 4, comma);
    }
  });
  const put = (k, x) => { if (sown.has(k)) ans[k] = fmt(x + delta(r, 0.01, 1), 3, comma); else ans[k] = fmt(x, 3, comma); };
  put('mean', T.reduce((s, t, i) => s + P[i] * t, 0));
  put('pT', T.reduce((s, t, i) => s + (t <= ex.deadline ? P[i] : 0), 0));
  for (const id of ex.disc) put(`${id}.crit`, sol.crit[id]);
  blanks(ans, sown, r, (a) => discClassify(ex, a, sol).status);
  return { ans, sown: [...sown] };
}

function repStudent(ex, sol, r, errs) {
  const comma = r() < 0.5; const frac = r() < 0.5;
  const fields = repFields(ex);
  const sown = new Set();
  while (sown.size < errs) sown.add(pick(r, fields));
  const ans = {}; const T = []; const M = [];
  const ids = ex.rows.map((x) => x.id);
  sol.reps.forEach((o, i) => {
    const kT = `r${i + 1}.T`; const km = `r${i + 1}.crit`;
    T[i] = sown.has(kT) ? o.T + Math.round(delta(r, 1, 4)) : o.T;
    ans[kT] = String(T[i]);
    let m = o.crit.slice();
    if (sown.has(km)) {
      const out = ids.filter((id) => !m.includes(id));
      if (out.length && (r() < 0.5 || m.length < 2)) m.push(pick(r, out)); else m.splice(Math.floor(r() * m.length), 1);
    }
    M[i] = m; ans[km] = r() < 0.5 ? m.slice() : m.join(' ');
  });
  const est = (k, c) => {
    const x = c / ex.n;
    if (sown.has(k)) ans[k] = fmt(x + delta(r, 0.05, 0.5), 3, comma);
    else ans[k] = frac ? `${c}/${ex.n}` : fmt(x, 3, comma);
  };
  est('pT', T.filter((t) => t <= ex.deadline).length);
  for (const id of ids) est(`${id}.crit`, M.filter((m) => m.includes(id)).length);
  blanks(ans, sown, r, (a) => repClassify(ex, a, sol).status);
  return { ans, sown: [...sown] };
}

module.exports = { EPS, Z95, fraction, num, phi, phiInv, tableP, roundK, allPaths, marks, judge,
  tcl: { fields: tclFields, solution: tclSolution, classify: tclClassify, student: tclStudent },
  disc: { fields: discFields, solution: discSolution, classify: discClassify, student: discStudent },
  rep: { fields: repFields, solution: repSolution, classify: repClassify, student: repStudent } };
