/*
 * core/probgrade — corrección casilla a casilla, con error consecuente, de los ejercicios de probabilidad (TCL) y de
 * Montecarlo de core/probgen (spec f3e-probabilidad-montecarlo, AC2–AC4, AC6, AC8, AC10 y AC25; plan §0 «Corrección
 * TCL» y «Montecarlo», §3; análisis H3 y H6; decisiones técnicas de T005 y T006 en decisions.md).
 *
 * tcl(ex, ans, sol?) · read · disc · rep · grade(kind, ex, ans, sol?) → { cells: { [campo]: cell }, score: { got, total, pct } }
 *   sol, por defecto probgen.solve(kind, ex); ans, { campo: texto } (las marcas, lista de ids o texto con separadores;
 *   una opción de «Leer», su posición en la lista, desde 0).
 * cell = { status, value, right, expected, formula, uses, from }
 *   status: ok (la solución, dentro de su tolerancia) · carried (la fórmula con los datos del alumno) · wrong ·
 *   blank (vacía) · invalid (no es un número, un id que no existe, una opción que no está). Los estados de core/grade.
 *   value, lo que escribió (número, lista de ids o posición; null si está vacía, NaN si no es un número); right, el
 *   valor de la solución; expected, el de la fórmula con los datos del alumno tal como los escribió (null en las
 *   casillas que no salen de otras); formula, la clave de la explicación (EXPLAIN); uses, las casillas de las que sale;
 *   from, las de uses que están wrong o carried, solo si la casilla está wrong o carried (las que arrastran el error).
 * Datos del alumno con error consecuente, dos lecturas, y vale cualquiera (decisión de T005): «tal como los escribió»
 * (su número; el de la solución si la casilla está vacía o no es un número) y «con los buenos exactos» (el de la
 * solución si su casilla es ok, vacía o no válida; su número si es carried o wrong). Así el redondeo de un dato bueno
 * no decide un camino ni una suma.
 * El camino del alumno (TCL) es carried si es crítico con sus medias en alguna de las dos lecturas: de duración máxima
 * y, con empate (10⁻⁶), de varianza máxima; si sigue el empate, valen todos. Se busca por programación dinámica sobre
 * las actividades y los arcos ajustados, sin enumerar los caminos (con 40 actividades pueden ser miles).
 * Sin DOM ni azar. core/probgen solo hace falta si no se pasa la solución.
 */
(function (root) {
  'use strict';

  const isNode = typeof module !== 'undefined' && module.exports;
  const T = isNode ? require('./threept.js') : root.PNL.threept;
  const PG = () => (isNode ? require('./probgen.js') : root.PNL.probgen);

  const STATES = ['ok', 'carried', 'wrong', 'blank', 'invalid'];
  const TOL = { act: 0.01, perAct: 0.01, z: 0.01, pTable: 0.0005, pExact: 0.005, z3: 0.0005, T: 0.05, read: 0.05, disc: 0.001, rep: 0.001 };
  const Z95 = [1.64, 1.645, 1.65];    // las tres z del 95 % de las tablas impresas (AC25)
  const KINDS = ['tcl', 'read', 'disc', 'rep'];
  const EXPLAIN = ['te', 'tvar', 'path', 'mu', 'pvar', 'z', 'p', 'zp', 'Tp', 'rmu', 'rvar', 'rz', 'rp', 'both',
    'readPct', 'readP', 'readCrit', 'readQ', 'discT', 'discP', 'discMean', 'discPT', 'discCrit', 'repT', 'repCrit', 'repPT', 'repEst'];
  const EPS = 1e-9;
  const TIE = 1e-6;                   // empate de duraciones y de varianzas (como core/cpm desde 2658b36)
  const BAD = new Set(['wrong', 'carried']);
  const isNum = (x) => typeof x === 'number' && !Number.isNaN(x);
  const natural = (x, y) => x.localeCompare(y, 'en', { numeric: true });
  const byIds = (x, y) => {
    for (let i = 0; i < Math.min(x.length, y.length); i++) { const c = natural(x[i], y[i]); if (c) return c; }
    return x.length - y.length;
  };
  const setKey = (ids) => ids.slice().sort().join('|');
  // Redondeo a k decimales, mitad hacia arriba en valor absoluto (como threept.tableP).
  const roundK = (x, k) => (Math.sign(x) * Math.round(Number((Math.abs(x) * 10 ** k).toFixed(6)))) / 10 ** k || 0;

  // ---------- lo que escribe el alumno ----------

  const INT = /^\d+$/;
  const DEC = /^-?(?=[^\d]*\d)\d*[.,]?\d*$/;
  /** vacía → null; número con coma o punto decimal, o fracción de enteros (3/8, −1/4); lo demás → NaN. */
  function parse(v) {
    const s = String(v == null ? '' : v).trim();
    if (!s) return null;
    const parts = s.split('/');
    if (parts.length === 2) {
      const a = parts[0].trim(); const b = parts[1].trim();
      const neg = a[0] === '-';
      if (!INT.test(neg ? a.slice(1) : a) || !INT.test(b) || Number(b) === 0) return NaN;
      return (neg ? -1 : 1) * Number(neg ? a.slice(1) : a) / Number(b);
    }
    if (parts.length > 2 || !DEC.test(s)) return NaN;
    return Number(s.replace(',', '.'));
  }

  // Separadores de las marcas escritas como texto (como un camino de la F3a, con el espacio duro).
  const SEPS = /[ \t\n\u00a0,;\-–>→]/;
  /** Las marcas del alumno: lista de ids (o texto con separadores), en mayúsculas y sin repetir. */
  function marks(v) {
    if (v == null) return [];
    const list = Array.isArray(v) ? v.map((x) => String(x == null ? '' : x)) : String(v).split(SEPS);
    return [...new Set(list.map((x) => x.trim().toUpperCase()).filter(Boolean))];
  }

  // ---------- casillas ----------

  const within = (v, r, tol) => Math.abs(v - r) <= tol + EPS;
  /** Estado de un número frente a la solución (rights: [valor, tolerancia]) y a la fórmula con sus datos (expects). */
  function judgeNum(x, rights, expects) {
    if (x === null) return 'blank';
    if (Number.isNaN(x)) return 'invalid';
    if (rights.some(([r, t]) => r != null && within(x, r, t))) return 'ok';
    if (expects.some(([r, t]) => r != null && Number.isFinite(r) && within(x, r, t))) return 'carried';
    return 'wrong';
  }
  const pct1 = (got, total) => (total ? Math.round((1000 * got) / total) / 10 : 0);

  /** El libro de casillas de un ejercicio: se rellenan en el orden de fields; from mira las que ya están. */
  function book() {
    const cells = {}; const st = {};
    const put = (k, status, o) => {
      const uses = o.uses || [];
      st[k] = status;
      cells[k] = { status, value: o.value, right: o.right, expected: o.expected === undefined ? null : o.expected, formula: o.formula, uses,
        from: BAD.has(status) ? uses.filter((u) => BAD.has(st[u])) : [] };
    };
    /** Una casilla numérica: rights, expects ([valor, tolerancia]) y expected (con los datos tal como los escribió). */
    const num = (k, input, o) => {
      const x = parse(input);
      put(k, judgeNum(x, o.rights, o.expects || []), Object.assign({ value: x }, o));
    };
    const done = () => {
      const list = Object.values(cells);
      const got = list.filter((c) => c.status === 'ok' || c.status === 'carried').length;
      return { cells, score: { got, total: list.length, pct: pct1(got, list.length) } };
    };
    return { st, put, num, done };
  }
  /** Las dos lecturas de los datos del alumno (cabecera): tal como los escribió y con los buenos exactos. */
  function readers(ans, st, exact) {
    const raw = (k) => { const x = parse(ans[k]); return isNum(x) ? x : exact(k); };
    const snap = (k) => (BAD.has(st[k]) ? parse(ans[k]) : exact(k));
    return [raw, snap];
  }

  // ---------- la red: caminos sin enumerarlos ----------

  /** Sucesores, orden topológico y principios y finales de las filas { id, preds }. */
  function graph(rows) {
    const ids = rows.map((r) => r.id);
    const preds = Object.fromEntries(rows.map((r) => [r.id, r.preds.slice()]));
    const succs = Object.fromEntries(ids.map((id) => [id, []]));
    for (const r of rows) for (const p of r.preds) succs[p].push(r.id);
    const indeg = Object.fromEntries(ids.map((id) => [id, preds[id].length]));
    const order = ids.filter((id) => !indeg[id]);
    for (let i = 0; i < order.length; i++) for (const s of succs[order[i]]) if (--indeg[s] === 0) order.push(s);
    if (order.length < ids.length) throw new Error('probgrade: el proyecto tiene un ciclo');
    return { ids, preds, succs, order, pos: Object.fromEntries(order.map((id, i) => [id, i])) };
  }

  /** Las marcas, como camino completo de inicio a fin en orden (null si no lo son). */
  function asPath(net, m) {
    const p = m.slice().sort((x, y) => net.pos[x] - net.pos[y]);
    if (!p.length || net.preds[p[0]].length || net.succs[p[p.length - 1]].length) return null;
    for (let i = 1; i < p.length; i++) if (!net.preds[p[i]].includes(p[i - 1])) return null;
    return p;
  }

  /**
   * Los caminos críticos con unas medias te y varianzas va: los de duración máxima y, entre ellos, los de varianza
   * máxima (empates a TIE). → { is(path), best } con best el de más varianza y, a igualdad, el primero en orden
   * natural (la regla de M6, core/tcl).
   */
  function critical(net, te, va) {
    const ef = {}; let top = -Infinity;
    for (const id of net.order) {
      let es = 0; let first = true;
      for (const p of net.preds[id]) if (first || ef[p] > es) { es = ef[p]; first = false; }
      ef[id] = es + te(id);
      if (!net.succs[id].length && ef[id] > top) top = ef[id];
    }
    const lf = {};
    for (let i = net.order.length - 1; i >= 0; i--) {
      const id = net.order[i]; let v = null;
      for (const s of net.succs[id]) { const ls = lf[s] - te(s); if (v === null || ls < v) v = ls; }
      lf[id] = v === null ? top : v;
    }
    const crit = (id) => Math.abs(lf[id] - ef[id]) <= TIE;
    const isEnd = (id) => !net.succs[id].length && crit(id);
    const tight = (a, b) => crit(a) && crit(b) && Math.abs(ef[a] - (ef[b] - te(b))) <= TIE;
    const memo = {};
    const best = (id) => {             // { v, path }: el de más varianza de id al final por arcos ajustados
      if (id in memo) return memo[id];
      let out = isEnd(id) ? { v: 0, path: [] } : null;
      for (const s of net.succs[id]) {
        if (!tight(id, s)) continue;
        const r = best(s);
        if (!r) continue;
        const cand = { v: r.v, path: [s].concat(r.path) };
        if (!out || cand.v - out.v > EPS || (Math.abs(cand.v - out.v) <= EPS && byIds(cand.path, out.path) < 0)) out = cand;
      }
      memo[id] = out && { v: out.v + va(id), path: out.path };
      return memo[id];
    };
    let top2 = null;
    for (const id of net.order) {
      if (net.preds[id].length || !crit(id)) continue;
      const r = best(id);
      if (!r) continue;
      const cand = { v: r.v, path: [id].concat(r.path) };
      if (!top2 || cand.v - top2.v > EPS || (Math.abs(cand.v - top2.v) <= EPS && byIds(cand.path, top2.path) < 0)) top2 = cand;
    }
    const is = (p) => {
      if (!p || !top2 || !crit(p[0]) || !isEnd(p[p.length - 1])) return false;
      for (let i = 1; i < p.length; i++) if (!tight(p[i - 1], p[i])) return false;
      return p.reduce((s, id) => s + va(id), 0) >= top2.v - TIE;
    };
    return { is, best: top2 ? top2.path : null };
  }

  // ---------- campos ----------

  function tclFields(ex) {
    const out = [];
    for (const r of ex.rows) if (r.mu == null) out.push(`${r.id}.te`, `${r.id}.var`);
    out.push('path', 'mu', 'var', 'z', 'p', 'zp', 'Tp');
    if (ex.route) out.push('r.mu', 'r.var', 'r.z', 'r.p', 'both');
    return out;
  }
  const readFields = (ex) => ['pct', 'pT', 'crit'].concat(ex.questions.map((q) => `q.${q.key}`));
  function discFields(ex) {
    const n = ex.rows.reduce((c, r) => c * (r.x ? r.x.length : 1), 1);
    const out = [];
    for (let i = 1; i <= n; i++) out.push(`c${i}.T`, `c${i}.p`);
    out.push('mean', 'pT');
    for (const id of ex.disc) out.push(`${id}.crit`);
    return out;
  }
  function repFields(ex) {
    const out = [];
    for (let k = 1; k <= ex.n; k++) out.push(`r${k}.T`, `r${k}.crit`);
    out.push('pT');
    for (const r of ex.rows) out.push(`${r.id}.crit`);
    return out;
  }
  const FIELDS = { tcl: tclFields, read: readFields, disc: discFields, rep: repFields };
  function checkKind(kind) {
    if (!KINDS.includes(kind)) throw new Error(`probgrade: tipo desconocido ${kind}`);
  }
  function fields(kind, ex) {
    checkKind(kind);
    return FIELDS[kind](ex);
  }

  // ---------- TCL ----------

  function tcl(ex, ans0, sol0) {
    const ans = ans0 || {};
    const sol = sol0 || PG().solve('tcl', ex);
    const net = graph(ex.rows);
    const given = new Set(ex.rows.filter((r) => r.mu != null).map((r) => r.id));
    const cellRows = ex.rows.filter((r) => r.mu == null).map((r) => r.id);
    const R = sol.route;
    const z3 = roundK(sol.zpExact, 3);
    const exact = (k) => {
      const [a, f] = k.split('.');
      if (a !== 'r' && (f === 'te' || f === 'var')) return sol.acts[a][f];
      return { mu: sol.mu, var: sol.var, z: sol.z, p: sol.p, zp: sol.zp, 'r.mu': R && R.mu, 'r.var': R && R.var, 'r.z': R && R.z, 'r.p': R && R.p }[k];
    };
    const B = book(); const { st } = B;
    const [raw, snap] = readers(ans, st, exact);
    const both = [raw, snap];
    const teOf = (D) => (id) => (given.has(id) ? sol.acts[id].te : D(`${id}.te`));
    const varOf = (D) => (id) => (given.has(id) ? sol.acts[id].var : D(`${id}.var`));
    const sum = (ids, f) => ids.reduce((s, id) => s + f(id), 0);

    for (const id of cellRows) {
      B.num(`${id}.te`, ans[`${id}.te`], { rights: [[sol.acts[id].te, TOL.act]], right: sol.acts[id].te, formula: 'te' });
      B.num(`${id}.var`, ans[`${id}.var`], { rights: [[sol.acts[id].var, TOL.act]], right: sol.acts[id].var, formula: 'tvar' });
    }
    // camino
    const m = marks(ans.path);
    const valid = m.every((x) => net.preds[x] !== undefined);
    const hisPath = m.length && valid ? asPath(net, m) : null;
    let pst;
    if (!m.length) pst = 'blank';
    else if (!valid) pst = 'invalid';
    else if (setKey(m) === setKey(sol.path)) pst = 'ok';
    else pst = hisPath && both.some((D) => critical(net, teOf(D), varOf(D)).is(hisPath)) ? 'carried' : 'wrong';
    B.put('path', pst, { value: m, right: sol.path.slice(), expected: critical(net, teOf(raw), varOf(raw)).best, formula: 'path',
      uses: cellRows.flatMap((id) => [`${id}.te`, `${id}.var`]) });
    // μ y σ², sobre su camino si sus marcas forman uno (aunque esté mal) y si no sobre el de la solución
    const used = hisPath || sol.path;
    const pathUses = (f) => (hisPath ? ['path'] : []).concat(used.filter((id) => !given.has(id)).map((id) => `${id}.${f}`));
    const tol = (p) => TOL.perAct * p.length;
    B.num('mu', ans.mu, { rights: [[sol.mu, tol(sol.path)]], expects: both.map((D) => [sum(used, teOf(D)), tol(used)]),
      right: sol.mu, expected: sum(used, teOf(raw)), formula: 'mu', uses: pathUses('te') });
    B.num('var', ans.var, { rights: [[sol.var, tol(sol.path)]], expects: both.map((D) => [sum(used, varOf(D)), tol(used)]),
      right: sol.var, expected: sum(used, varOf(raw)), formula: 'pvar', uses: pathUses('var') });
    // z y P, con su μ y su σ²
    const zOf = (mu, v) => (v > 0 ? (ex.deadline - mu) / Math.sqrt(v) : null);
    const pExp = (z) => (z == null ? [] : [[T.tableP(z).p4, TOL.pTable], [T.phi(z), TOL.pExact]]);
    const first = (xs) => (xs.length ? xs[0][0] : null);
    B.num('z', ans.z, { rights: [[sol.z, TOL.z]], expects: both.map((D) => [zOf(D('mu'), D('var')), TOL.z]),
      right: sol.z, expected: zOf(raw('mu'), raw('var')), formula: 'z', uses: ['mu', 'var'] });
    B.num('p', ans.p, { rights: [[sol.p, TOL.pTable], [sol.pExact, TOL.pExact]], expects: both.flatMap((D) => pExp(D('z'))),
      right: sol.p, expected: first(pExp(raw('z'))), formula: 'p', uses: ['z'] });
    // la z de la probabilidad (sin error consecuente) y el plazo con su μ, su σ y su z
    const zps = [sol.zp, z3, sol.zpExact].concat(ex.prob === 0.95 ? Z95 : []);
    const TpOf = (D) => (D('var') >= 0 ? D('mu') + D('zp') * Math.sqrt(D('var')) : null);
    B.num('zp', ans.zp, { rights: [[sol.zp, TOL.z], [z3, TOL.z3]].concat(ex.prob === 0.95 ? Z95.map((z) => [z, TOL.z3]) : []),
      right: sol.zp, formula: 'zp' });
    B.num('Tp', ans.Tp, { rights: zps.map((z) => [sol.mu + z * sol.sd, TOL.T]), expects: both.map((D) => [TpOf(D), TOL.T]),
      right: sol.Tp, expected: TpOf(raw), formula: 'Tp', uses: ['mu', 'var', 'zp'] });
    if (ex.route) {
      const rcells = ex.route.filter((id) => !given.has(id));
      B.num('r.mu', ans['r.mu'], { rights: [[R.mu, tol(ex.route)]], expects: both.map((D) => [sum(ex.route, teOf(D)), tol(ex.route)]),
        right: R.mu, expected: sum(ex.route, teOf(raw)), formula: 'rmu', uses: rcells.map((id) => `${id}.te`) });
      B.num('r.var', ans['r.var'], { rights: [[R.var, tol(ex.route)]], expects: both.map((D) => [sum(ex.route, varOf(D)), tol(ex.route)]),
        right: R.var, expected: sum(ex.route, varOf(raw)), formula: 'rvar', uses: rcells.map((id) => `${id}.var`) });
      B.num('r.z', ans['r.z'], { rights: [[R.z, TOL.z]], expects: both.map((D) => [zOf(D('r.mu'), D('r.var')), TOL.z]),
        right: R.z, expected: zOf(raw('r.mu'), raw('r.var')), formula: 'rz', uses: ['r.mu', 'r.var'] });
      B.num('r.p', ans['r.p'], { rights: [[R.p, TOL.pTable], [R.pExact, TOL.pExact]], expects: both.flatMap((D) => pExp(D('r.z'))),
        right: R.p, expected: first(pExp(raw('r.z'))), formula: 'rp', uses: ['r.z'] });
      // P(las dos): el producto (las dos rutas no comparten actividades)
      B.num('both', ans.both, { rights: [[R.both, TOL.pTable], [R.bothExact, TOL.pExact]],
        expects: both.flatMap((D) => [[D('p') * D('r.p'), TOL.pTable], [T.phi(D('z')) * T.phi(D('r.z')), TOL.pExact]]),
        right: R.both, expected: raw('p') * raw('r.p'), formula: 'both', uses: ['p', 'r.p'] });
    }
    return B.done();
  }

  // ---------- Montecarlo: leer una simulación ----------

  function read(ex, ans0, sol0) {
    const ans = ans0 || {};
    const sol = sol0 || PG().solve('read', ex);
    const B = book();
    B.num('pct', ans.pct, { rights: [[sol.pct.value, sol.classW]], right: sol.pct.value, formula: 'readPct' });
    B.num('pT', ans.pT, { rights: [[sol.pT, TOL.read]], right: sol.pT, formula: 'readP' });
    B.num('crit', ans.crit, { rights: [[sol.act.crit, TOL.read]], right: sol.act.crit, formula: 'readCrit' });
    for (const q of ex.questions) {
      const k = `q.${q.key}`;
      const right = q.options.indexOf(q.correct);
      const x = parse(ans[k]);
      const status = x === null ? 'blank' : !(Number.isInteger(x) && x >= 0 && x < q.options.length) ? 'invalid' : x === right ? 'ok' : 'wrong';
      B.put(k, status, { value: x, right, formula: 'readQ' });
    }
    return B.done();
  }

  // ---------- Montecarlo: discretas a mano ----------

  function disc(ex, ans0, sol0) {
    const ans = ans0 || {};
    const sol = sol0 || PG().solve('disc', ex);
    const B = book();
    const exact = (k) => { const [c, f] = k.split('.'); return sol.combos[Number(c.slice(1)) - 1][f]; };
    const [raw, snap] = readers(ans, B.st, exact);
    const ck = [];
    sol.combos.forEach((c, i) => {
      const k = `c${i + 1}`; ck.push(`${k}.T`, `${k}.p`);
      B.num(`${k}.T`, ans[`${k}.T`], { rights: [[c.T, TOL.disc]], right: c.T, formula: 'discT' });
      B.num(`${k}.p`, ans[`${k}.p`], { rights: [[c.p, TOL.disc]], right: c.p, formula: 'discP' });
    });
    const n = sol.combos.length;
    const E = (D) => { let s = 0; for (let i = 1; i <= n; i++) s += D(`c${i}.p`) * D(`c${i}.T`); return s; };
    const P = (D) => { let s = 0; for (let i = 1; i <= n; i++) if (D(`c${i}.T`) <= ex.deadline + EPS) s += D(`c${i}.p`); return s; };
    B.num('mean', ans.mean, { rights: [[sol.mean, TOL.disc]], expects: [raw, snap].map((D) => [E(D), TOL.disc]),
      right: sol.mean, expected: E(raw), formula: 'discMean', uses: ck.slice() });
    B.num('pT', ans.pT, { rights: [[sol.pT, TOL.disc]], expects: [raw, snap].map((D) => [P(D), TOL.disc]),
      right: sol.pT, expected: P(raw), formula: 'discPT', uses: ck.slice() });
    for (const id of ex.disc) B.num(`${id}.crit`, ans[`${id}.crit`], { rights: [[sol.crit[id], TOL.disc]], right: sol.crit[id], formula: 'discCrit' });
    return B.done();
  }

  // ---------- Montecarlo: réplicas a mano ----------

  function rep(ex, ans0, sol0) {
    const ans = ans0 || {};
    const sol = sol0 || PG().solve('rep', ex);
    const B = book(); const { st } = B;
    const ids = new Set(ex.rows.map((r) => r.id));
    const tk = []; const mk = [];
    sol.reps.forEach((o, i) => {
      const k = `r${i + 1}`; tk.push(`${k}.T`); mk.push(`${k}.crit`);
      B.num(`${k}.T`, ans[`${k}.T`], { rights: [[o.T, TOL.rep]], right: o.T, formula: 'repT' });
      const m = marks(ans[`${k}.crit`]);
      const status = !m.length ? 'blank' : m.some((x) => !ids.has(x)) ? 'invalid' : setKey(m) === setKey(o.crit) ? 'ok' : 'wrong';
      B.put(`${k}.crit`, status, { value: m, right: o.crit.slice(), formula: 'repCrit' });
    });
    // T de cada réplica: tal como la escribió y con las buenas exactas; las marcas, las suyas si están mal
    const Traw = (i) => { const x = parse(ans[`r${i + 1}.T`]); return isNum(x) ? x : sol.reps[i].T; };
    const Tsnap = (i) => (BAD.has(st[`r${i + 1}.T`]) ? parse(ans[`r${i + 1}.T`]) : sol.reps[i].T);
    const M = (i) => (BAD.has(st[`r${i + 1}.crit`]) ? marks(ans[`r${i + 1}.crit`]) : sol.reps[i].crit);
    const count = (f) => sol.reps.filter((_, i) => f(i)).length / ex.n;
    const inT = (Tf) => count((i) => Tf(i) <= ex.deadline + EPS);
    B.num('pT', ans.pT, { rights: [[sol.pT, TOL.rep]], expects: [Traw, Tsnap].map((Tf) => [inT(Tf), TOL.rep]),
      right: sol.pT, expected: inT(Traw), formula: 'repPT', uses: tk });
    for (const r of ex.rows) {
      const est = count((i) => M(i).includes(r.id));
      B.num(`${r.id}.crit`, ans[`${r.id}.crit`], { rights: [[sol.crit[r.id], TOL.rep]], expects: [[est, TOL.rep]],
        right: sol.crit[r.id], expected: est, formula: 'repEst', uses: mk });
    }
    return B.done();
  }

  // ---------- todo junto ----------

  const GRADE = { tcl, read, disc, rep };
  function grade(kind, ex, ans, sol) {
    checkKind(kind);
    return GRADE[kind](ex, ans, sol);
  }

  /** La explicación de una casilla: la clave de su fórmula (el texto lo pone i18n) y lo que hace falta para escribirla. */
  function explain(cell) {
    return { key: cell.formula, params: { status: cell.status, value: cell.value, right: cell.right, expected: cell.expected,
      uses: cell.uses || [], from: cell.from || [] } };
  }

  const api = { STATES, TOL, Z95, KINDS, EXPLAIN, parse, marks, fields, tcl, read, disc, rep, grade, explain };
  root.PNL = root.PNL || {};
  root.PNL.probgrade = api;
  if (isNode) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
