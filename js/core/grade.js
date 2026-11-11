/*
 * core/grade — solución y corrección con error consecuente de los ejercicios de cálculo (spec f3a-generador-calculo,
 * AC4–AC6, AC8 y AC9; plan §3, P2 y P3).
 * solve(project): la solución del núcleo (cpm de la F1 y, sobre la red de las reglas de la F2a, aoa.times).
 * grade(sol, answers, ask): cada casilla pedida se compara con la solución (right) y con lo que da la fórmula de
 * la spec aplicada a los datos del propio alumno (expect); un dato del alumno es su número, o el correcto si la
 * casilla está vacía o no es un número. Estados: ok (= solución), carried (= fórmula con sus datos), wrong, blank e
 * invalid. Las fórmulas locales (una por casilla) viven aquí; una prueba de propiedad comprueba que, con los datos
 * de la solución, dan exactamente cpm.solve y aoa.times (plan P2). Se compara a 2 decimales, como la predicción.
 * Sin DOM ni azar.
 */
(function (root) {
  'use strict';

  const isNode = typeof module !== 'undefined' && module.exports;
  const C = isNode ? require('./cpm.js') : root.PNL.cpm;
  const A = isNode ? require('./aoa.js') : root.PNL.aoa;

  const ASK = ['times', 'events', 'floats', 'sf', 'critical'];
  const MAX_PATHS = 200;
  const r2 = (x) => Math.round(x * 100) / 100;
  const same = (a, b) => Math.abs(r2(a) - r2(b)) < 1e-9;
  const isNum = (v) => typeof v === 'number' && !Number.isNaN(v);

  // Igual que predict.parseAnswer: vacía → null; número con coma o punto; lo demás → NaN.
  function parse(v) {
    const s = String(v == null ? '' : v).trim().replace(',', '.');
    if (!s) return null;
    return /^-?(\d+\.?\d*|\.\d+)$/.test(s) ? Number(s) : NaN;
  }

  function solve(project) {
    const cpm = C.solve(project);
    const net = A.build(project, { solution: cpm });
    return { project, cpm, net, events: A.times(net, cpm) };
  }

  const splitPath = (w) => String(w == null ? '' : w).toUpperCase().split(/[\s,;\-–>→]+/).filter(Boolean);

  function grade(sol, answers, ask) {
    const want = new Set((ask || []).filter((x) => ASK.includes(x)));
    if (!want.has('floats')) want.delete('sf');
    const p = sol.project;
    const ids = p.activities.map((a) => a.id);
    const d = Object.fromEntries(p.activities.map((a) => [a.id, a.d]));
    const T = sol.cpm.times;
    const F = sol.cpm.floats;
    const ans = answers || {};
    const act = ans.act || {};
    const raw = (a, f) => (act[a] || {})[f];
    const right = (a, f) => (f in T[a] ? T[a][f] : F[a][f]);
    // dato del alumno: su número, o el correcto
    const val = (a, f) => { const v = parse(raw(a, f)); return isNum(v) ? v : right(a, f); };
    const dur = (() => { const v = parse(ans.dur); return isNum(v) ? v : sol.cpm.duration; })();
    const cells = {};
    const judge = (key, input, ok, expects, formula, uses) => {
      const v = parse(input);
      const state = v === null ? 'blank' : Number.isNaN(v) ? 'invalid' : same(v, ok) ? 'ok' : expects.some((e) => same(v, e)) ? 'carried' : 'wrong';
      cells[key] = { state, value: isNum(v) ? v : null, right: r2(ok), expect: r2(expects[0]), formula, uses };
    };
    const keys = (as, f) => as.map((a) => `${a}.${f}`);

    for (const a of ids) {
      const ps = p.preds[a];
      const ks = p.succs[a];
      const esMin = ks.length ? Math.min(...ks.map((k) => val(k, 'ES'))) : dur;
      const esMinUses = ks.length ? keys(ks, 'ES') : ['dur'];
      const lfMax = ps.length ? Math.max(...ps.map((x) => val(x, 'LF'))) : 0;
      if (want.has('times')) {
        judge(`${a}.ES`, raw(a, 'ES'), T[a].ES, [Math.max(0, ...ps.map((x) => val(x, 'EF')))], 'ES', keys(ps, 'EF'));
        judge(`${a}.EF`, raw(a, 'EF'), T[a].EF, [val(a, 'ES') + d[a]], 'EF', [`${a}.ES`]);
        judge(`${a}.LS`, raw(a, 'LS'), T[a].LS, [val(a, 'LF') - d[a]], 'LS', [`${a}.LF`]);
        judge(`${a}.LF`, raw(a, 'LF'), T[a].LF, [ks.length ? Math.min(...ks.map((k) => val(k, 'LS'))) : dur], 'LF', ks.length ? keys(ks, 'LS') : ['dur']);
      }
      if (want.has('floats')) {
        judge(`${a}.TF`, raw(a, 'TF'), F[a].TF, [val(a, 'LS') - val(a, 'ES'), val(a, 'LF') - val(a, 'EF')], 'TF', [`${a}.LS`, `${a}.ES`]);
        // Si el valor del alumno sale solo por LF − EF, la casilla dice esa vía (para explicarla con sus datos; T020).
        const tf = cells[`${a}.TF`];
        if (tf.state === 'carried' && !same(tf.value, val(a, 'LS') - val(a, 'ES'))) Object.assign(tf, { expect: r2(val(a, 'LF') - val(a, 'EF')), uses: [`${a}.LF`, `${a}.EF`] });
        judge(`${a}.FF`, raw(a, 'FF'), F[a].FF, [esMin - val(a, 'EF')], 'FF', esMinUses.concat([`${a}.EF`]));
        judge(`${a}.IF`, raw(a, 'IF'), F[a].IF, [Math.max(0, esMin - lfMax - d[a])], 'IF', esMinUses.concat(keys(ps, 'LF')));
        if (want.has('sf')) judge(`${a}.SF`, raw(a, 'SF'), F[a].SF, [val(a, 'LF') - lfMax - d[a]], 'SF', [`${a}.LF`].concat(keys(ps, 'LF')));
      }
    }
    if (want.has('times')) {
      const finals = ids.filter((a) => !p.succs[a].length);
      judge('dur', ans.dur, sol.cpm.duration, [Math.max(...finals.map((a) => val(a, 'EF')))], 'dur', keys(finals, 'EF'));
    }

    if (want.has('events')) {
      const N = sol.net.events.length;
      const edges = [...sol.net.arcs.map((e) => ({ from: e.from, to: e.to, d: d[e.act] })), ...sol.net.dummies.map((e) => ({ from: e.from, to: e.to, d: 0 }))];
      const ev = ans.ev || {};
      const rawE = (n, f) => (ev[n] || {})[f];
      const rightE = (n, f) => sol.events[f][n];
      const valE = (n, f) => { const v = parse(rawE(n, f)); return isNum(v) ? v : rightE(n, f); };
      const uniq = (xs) => [...new Set(xs)];
      for (let n = 1; n <= N; n++) {
        const inc = edges.filter((e) => e.to === n);
        const out = edges.filter((e) => e.from === n);
        judge(`e${n}.TE`, rawE(n, 'TE'), rightE(n, 'TE'), [n === 1 ? 0 : Math.max(...inc.map((e) => valE(e.from, 'TE') + e.d))], 'TE',
          n === 1 ? [] : uniq(inc.map((e) => `e${e.from}.TE`)));
        judge(`e${n}.TL`, rawE(n, 'TL'), rightE(n, 'TL'), [n === N ? valE(n, 'TE') : Math.min(...out.map((e) => valE(e.to, 'TL') - e.d))], 'TL',
          n === N ? [`e${n}.TE`] : uniq(out.map((e) => `e${e.to}.TL`)));
        judge(`e${n}.slack`, rawE(n, 'slack'), rightE(n, 'slack'), [valE(n, 'TL') - valE(n, 'TE')], 'slack', [`e${n}.TL`, `e${n}.TE`]);
      }
    }

    const paths = { written: [], right: [], expect: [] };
    let pathPoints = 0;
    let pathTotal = 0;
    if (want.has('critical')) {
      const marked = new Set(ans.crit || []);
      for (const a of ids) {
        const isCrit = same(F[a].TF, 0);
        const tf = parse(raw(a, 'TF'));
        const usesTF = want.has('floats') && isNum(tf);
        const exp = usesTF ? same(tf, 0) : isCrit;
        const m = marked.has(a);
        cells[`${a}.crit`] = { state: m === isCrit ? 'ok' : m === exp ? 'carried' : 'wrong', value: m, right: isCrit, expect: exp,
          formula: 'crit', uses: usesTF ? [`${a}.TF`] : [] };
      }
      paths.right = sol.cpm.criticalPaths.map((x) => x.acts.slice());
      // caminos de inicio a fin solo por actividades marcadas y con la duración del alumno
      const walk = (a, acc, len) => {
        if (paths.expect.length >= MAX_PATHS) return;
        const next = acc.concat([a]); const l = len + d[a];
        if (!p.succs[a].length) { if (same(l, dur)) paths.expect.push(next); return; }
        for (const k of p.succs[a]) if (marked.has(k)) walk(k, next, l);
      };
      for (const a of ids) if (!p.preds[a].length && marked.has(a)) walk(a, [], 0);
      const key = (xs) => xs.join('-');
      const rightK = new Set(paths.right.map(key));
      const expK = new Set(paths.expect.map(key));
      const seen = new Set();
      let good = 0; let extra = 0;
      for (const w of ans.paths || []) {
        const acts = splitPath(w);
        const k = key(acts);
        let state;
        // Un campo vacío no es un camino: ni suma ni resta (T020).
        if (!String(w == null ? '' : w).trim()) { paths.written.push({ acts, state: 'blank' }); continue; }
        if (!acts.length || acts.some((x) => !(x in d))) state = 'invalid';
        else if (seen.has(k)) state = 'wrong';
        else if (rightK.has(k)) state = 'ok';
        else if (expK.has(k)) state = 'carried';
        else state = 'wrong';
        seen.add(k);
        if (state === 'ok' || state === 'carried') good++; else extra++;
        paths.written.push({ acts, state });
      }
      // Si las críticas marcadas no forman ningún camino (p. ej., un error temprano cambió la duración del alumno y sus
      // holguras aguas arriba salen negativas), no se le exigen caminos que no puede deducir: solo cuentan los que
      // escribe, los de la solución suman y los erróneos restan (T018, decisión del autor; AC5).
      pathTotal = paths.expect.length || good;
      // Tope (T020, decisión del autor): el apartado vale lo deducible de sus marcas; los caminos de la solución que
      // escriba de más no suman, así que la nota nunca pasa del total.
      pathPoints = Math.min(pathTotal, Math.max(0, good - extra));
    }

    const list = Object.values(cells);
    const got = list.filter((c) => c.state === 'ok' || c.state === 'carried').length + pathPoints;
    const total = list.length + pathTotal;
    return { cells, paths, score: { got, total, pct: total ? Math.round((1000 * got) / total) / 10 : 0 } };
  }

  const api = { ASK, parse, solve, grade };
  root.PNL = root.PNL || {};
  root.PNL.grade = api;
  if (isNode) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
