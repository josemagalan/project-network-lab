'use strict';
// Oráculo de la corrección con error consecuente (plan f3a-generador-calculo, T004). Solo para las pruebas:
// recalcula cada casilla por definición (la tabla de la spec, Qué resultado obtiene) con los datos del alumno,
// sin usar core/cpm ni core/grade. Recibe la tabla como { ids, d, preds, succs } y, para los sucesos, la red de
// core/aoa (solo su estructura: sucesos numerados y arcos con su actividad). Un dato del alumno es su valor si
// es un número; si está vacío o no es válido, se usa el correcto.
const FIELDS = ['ES', 'EF', 'LS', 'LF', 'TF', 'FF', 'IF', 'SF'];
// Comparación a 2 decimales (plan P3, «como predict»), escrita aparte de core/grade: en centésimas enteras.
const cents = (x) => Math.round(Number(x) * 100);
const same = (a, b) => cents(a) === cents(b);

// Un número del alumno, por definición (spec: «números con coma o punto decimal»), sin la expresión de core/grade:
// vacío → null; signo opcional, dígitos y como mucho una coma o un punto, con al menos un dígito → número; lo demás → NaN.
function num(v) {
  const s = String(v == null ? '' : v).trim();
  if (!s) return null;
  let i = s[0] === '-' ? 1 : 0; let digits = 0; let sep = 0; let out = s[0] === '-' ? '-' : '';
  for (; i < s.length; i++) {
    const ch = s[i];
    if (ch >= '0' && ch <= '9') { digits++; out += ch; } else if ((ch === ',' || ch === '.') && !sep) { sep++; out += '.'; } else return NaN;
  }
  return digits ? Number(out) : NaN;
}

// Separadores de un camino (plan P4: guiones, comas o espacios; también punto y coma, raya y flechas), sin expresión regular.
const SEPS = [' ', '\t', ',', ';', '-', '–', '>', '→'];
const splitPath = (w) => { let s = String(w); for (const c of SEPS) s = s.split(c).join(' '); return s.toUpperCase().split(' ').filter(Boolean); };

// Orden topológico por definición (Kahn, desempate por posición en ids).
function topo(t) {
  const indeg = Object.fromEntries(t.ids.map((a) => [a, t.preds[a].length]));
  const out = [];
  const ready = t.ids.filter((a) => !indeg[a]);
  while (ready.length) {
    const a = ready.shift(); out.push(a);
    for (const b of t.succs[a]) if (--indeg[b] === 0) ready.push(b);
  }
  return out;
}

// La solución por definición: ES = máx EF de las predecesoras, LF = mín LS de las posteriores, etc.
function solution(t) {
  const o = topo(t);
  const s = Object.fromEntries(t.ids.map((a) => [a, {}]));
  for (const a of o) { s[a].ES = Math.max(0, ...t.preds[a].map((p) => s[p].EF)); s[a].EF = s[a].ES + t.d[a]; }
  const dur = Math.max(...t.ids.filter((a) => !t.succs[a].length).map((a) => s[a].EF));
  for (const a of [...o].reverse()) { s[a].LF = Math.min(dur, ...t.succs[a].map((k) => s[k].LS)); s[a].LS = s[a].LF - t.d[a]; }
  for (const a of t.ids) {
    const esMin = t.succs[a].length ? Math.min(...t.succs[a].map((k) => s[k].ES)) : dur;
    const lfMax = t.preds[a].length ? Math.max(...t.preds[a].map((p) => s[p].LF)) : 0;
    Object.assign(s[a], { TF: s[a].LS - s[a].ES, FF: esMin - s[a].EF, IF: Math.max(0, esMin - lfMax - t.d[a]), SF: s[a].LF - lfMax - t.d[a] });
  }
  return { act: s, dur };
}

function eventSolution(t, net) {
  const N = net.events.length;
  const edges = [...net.arcs.map((e) => ({ from: e.from, to: e.to, d: t.d[e.act] })), ...net.dummies.map((e) => ({ from: e.from, to: e.to, d: 0 }))];
  const TE = { 1: 0 }; const TL = {};
  for (let n = 2; n <= N; n++) TE[n] = Math.max(...edges.filter((e) => e.to === n).map((e) => TE[e.from] + e.d));
  TL[N] = TE[N];
  for (let n = N - 1; n >= 1; n--) TL[n] = Math.min(...edges.filter((e) => e.from === n).map((e) => TL[e.to] - e.d));
  return { TE, TL, edges, N };
}

// Todos los caminos de inicio a fin, con su duración.
function allPaths(t) {
  const out = [];
  const walk = (a, acc, len) => {
    const next = [...acc, a]; const l = len + t.d[a];
    if (!t.succs[a].length) { out.push({ acts: next, length: l }); return; }
    for (const k of t.succs[a]) walk(k, next, l);
  };
  for (const a of t.ids.filter((x) => !t.preds[x].length)) walk(a, [], 0);
  return out;
}

function classify(t, net, answers, ask) {
  const want = new Set(ask);
  const sol = solution(t);
  const cells = {};
  const A = answers.act || {};
  // dato del alumno: su número, o el correcto
  const get = (a, f) => { const v = num((A[a] || {})[f]); return v === null || Number.isNaN(v) ? sol.act[a][f] : v; };
  const durS = (() => { const v = num(answers.dur); return v === null || Number.isNaN(v) ? sol.dur : v; })();
  const judge = (key, raw, right, expects) => {
    const v = num(raw);
    if (v === null) cells[key] = 'blank';
    else if (Number.isNaN(v)) cells[key] = 'invalid';
    else if (same(v, right)) cells[key] = 'ok';
    else if (expects.some((e) => same(v, e))) cells[key] = 'carried';
    else cells[key] = 'wrong';
  };
  for (const a of t.ids) {
    const raw = A[a] || {};
    const ps = t.preds[a]; const ks = t.succs[a]; const d = t.d[a];
    const esMin = ks.length ? Math.min(...ks.map((k) => get(k, 'ES'))) : durS;
    const lfMax = ps.length ? Math.max(...ps.map((p) => get(p, 'LF'))) : 0;
    if (want.has('times')) {
      judge(`${a}.ES`, raw.ES, sol.act[a].ES, [Math.max(0, ...ps.map((p) => get(p, 'EF')))]);
      judge(`${a}.EF`, raw.EF, sol.act[a].EF, [get(a, 'ES') + d]);
      judge(`${a}.LF`, raw.LF, sol.act[a].LF, [ks.length ? Math.min(...ks.map((k) => get(k, 'LS'))) : durS]);
      judge(`${a}.LS`, raw.LS, sol.act[a].LS, [get(a, 'LF') - d]);
    }
    if (want.has('floats')) {
      judge(`${a}.TF`, raw.TF, sol.act[a].TF, [get(a, 'LS') - get(a, 'ES'), get(a, 'LF') - get(a, 'EF')]);
      judge(`${a}.FF`, raw.FF, sol.act[a].FF, [esMin - get(a, 'EF')]);
      judge(`${a}.IF`, raw.IF, sol.act[a].IF, [Math.max(0, esMin - lfMax - d)]);
      if (want.has('sf')) judge(`${a}.SF`, raw.SF, sol.act[a].SF, [get(a, 'LF') - lfMax - d]);
    }
  }
  if (want.has('times')) {
    const finals = t.ids.filter((a) => !t.succs[a].length);
    judge('dur', answers.dur, sol.dur, [Math.max(...finals.map((a) => get(a, 'EF')))]);
  }
  if (want.has('events')) {
    const ev = eventSolution(t, net);
    const E = answers.ev || {};
    const gE = (n, f) => { const v = num((E[n] || {})[f]); return v === null || Number.isNaN(v) ? ev[f][n] : v; };
    for (let n = 1; n <= ev.N; n++) {
      const inc = ev.edges.filter((e) => e.to === n); const out = ev.edges.filter((e) => e.from === n);
      judge(`e${n}.TE`, (E[n] || {}).TE, ev.TE[n], [n === 1 ? 0 : Math.max(...inc.map((e) => gE(e.from, 'TE') + e.d))]);
      judge(`e${n}.TL`, (E[n] || {}).TL, ev.TL[n], [n === ev.N ? gE(n, 'TE') : Math.min(...out.map((e) => gE(e.to, 'TL') - e.d))]);
      judge(`e${n}.slack`, (E[n] || {}).slack, ev.TL[n] - ev.TE[n], [gE(n, 'TL') - gE(n, 'TE')]);
    }
  }
  const paths = [];
  if (want.has('critical')) {
    const marked = new Set(answers.crit || []);
    for (const a of t.ids) {
      const right = same(sol.act[a].TF, 0);
      const tfRaw = num((A[a] || {}).TF);
      const exp = want.has('floats') && tfRaw !== null && !Number.isNaN(tfRaw) ? same(tfRaw, 0) : right;
      const m = marked.has(a);
      cells[`${a}.crit`] = m === right ? 'ok' : m === exp ? 'carried' : 'wrong';
    }
    const every = allPaths(t);
    const key = (acts) => acts.join('-');
    const right = new Set(every.filter((p) => same(p.length, sol.dur)).map((p) => key(p.acts)));
    const expect = new Set(every.filter((p) => p.acts.every((a) => marked.has(a)) && same(p.length, durS)).map((p) => key(p.acts)));
    const seen = new Set();
    for (const w of answers.paths || []) {
      const acts = splitPath(w);
      const k = key(acts);
      if (!String(w).trim()) paths.push('blank');               // un campo vacío no es un camino (T020)
      else if (!acts.length || acts.some((a) => !t.ids.includes(a))) paths.push('invalid');
      else if (seen.has(k)) paths.push('wrong');
      else if (right.has(k)) paths.push('ok');
      else if (expect.has(k)) paths.push('carried');
      else paths.push('wrong');
      seen.add(k);
    }
  }
  return { cells, paths };
}

// Respuestas de un alumno que calcula bien salvo en las casillas de `wrong` (su valor se fija ahí) y arrastra lo demás.
function answersFrom(t, net, wrong, ask) {
  const want = new Set(ask);
  const w = wrong || {};
  const v = {};
  const o = topo(t);
  const put = (k, x) => { v[k] = Object.prototype.hasOwnProperty.call(w, k) ? w[k] : x; return v[k]; };
  for (const a of o) {
    const es = put(`${a}.ES`, Math.max(0, ...t.preds[a].map((p) => v[`${p}.EF`])));
    put(`${a}.EF`, es + t.d[a]);
  }
  const dur = put('dur', Math.max(...t.ids.filter((a) => !t.succs[a].length).map((a) => v[`${a}.EF`])));
  for (const a of [...o].reverse()) {
    const lf = put(`${a}.LF`, t.succs[a].length ? Math.min(...t.succs[a].map((k) => v[`${k}.LS`])) : dur);
    put(`${a}.LS`, lf - t.d[a]);
  }
  for (const a of t.ids) {
    const esMin = t.succs[a].length ? Math.min(...t.succs[a].map((k) => v[`${k}.ES`])) : dur;
    const lfMax = t.preds[a].length ? Math.max(...t.preds[a].map((p) => v[`${p}.LF`])) : 0;
    put(`${a}.TF`, v[`${a}.LS`] - v[`${a}.ES`]);
    put(`${a}.FF`, esMin - v[`${a}.EF`]);
    put(`${a}.IF`, Math.max(0, esMin - lfMax - t.d[a]));
    put(`${a}.SF`, v[`${a}.LF`] - lfMax - t.d[a]);
  }
  const act = Object.fromEntries(t.ids.map((a) => [a, Object.fromEntries(FIELDS.map((f) => [f, String(v[`${a}.${f}`])]))]));
  const out = { act, dur: String(dur), ev: {}, crit: t.ids.filter((a) => same(v[`${a}.TF`], 0)), paths: [] };
  if (want.has('events') && net) {
    const ev = eventSolution(t, net);
    const TE = {}; const TL = {};
    for (let n = 1; n <= ev.N; n++) {
      TE[n] = Object.prototype.hasOwnProperty.call(w, `e${n}.TE`) ? w[`e${n}.TE`] : (n === 1 ? 0 : Math.max(...ev.edges.filter((e) => e.to === n).map((e) => TE[e.from] + e.d)));
    }
    for (let n = ev.N; n >= 1; n--) {
      TL[n] = Object.prototype.hasOwnProperty.call(w, `e${n}.TL`) ? w[`e${n}.TL`] : (n === ev.N ? TE[n] : Math.min(...ev.edges.filter((e) => e.from === n).map((e) => TL[e.to] - e.d)));
    }
    for (let n = 1; n <= ev.N; n++) out.ev[n] = { TE: String(TE[n]), TL: String(TL[n]), slack: String(TL[n] - TE[n]) };
  }
  const crit = new Set(out.crit);
  out.paths = allPaths(t).filter((p) => p.acts.every((a) => crit.has(a)) && same(p.length, dur)).map((p) => p.acts.join('-'));
  return out;
}

// La tabla del proyecto de core/project como la entrada del oráculo.
const fromProject = (p) => ({ ids: p.activities.map((a) => a.id), d: Object.fromEntries(p.activities.map((a) => [a.id, a.d])), preds: p.preds, succs: p.succs });

module.exports = { classify, answersFrom, fromProject, solution, num, FIELDS };
