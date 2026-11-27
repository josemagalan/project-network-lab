'use strict';
// F5c T013: «Aprende más» de recursos (js/learn-rs.js, grupo rl): las mismas secciones en los dos idiomas, lo que pide la spec
// (nivelar o limitar, el pico y la suma de cuadrados, Burgess, por qué es difícil, los esquemas y las reglas con la figura 7.23,
// la cota de Baker, la cadena crítica y sus colchones, partir actividades, varios recursos y lo que queda fuera) y sus
// referencias. Las cifras que cuenta son las del núcleo.
const test = require('node:test');
const assert = require('node:assert/strict');
const L = require('../js/learn-rs.js');
const R = require('../js/core/resource.js');
const X = require('../js/core/resex.js');

const all = (lang) => L[lang].sections.flatMap((s) => [s.head, ...s.paras]).join(' ');
// Las cifras de un texto, con los miles sin separador (300 000 y 300,000 son lo mismo) y la coma decimal como punto.
const nums = (t) => (t.replace(/(\d)[ ,](\d{3})\b/g, '$1$2').match(/\d+(?:[.,]\d+)?/g) || []).map((x) => x.replace(',', '.')).sort();

test('F5c T013: «Aprende más» tiene las mismas secciones y párrafos en español e inglés, con las mismas cifras y referencias', () => {
  assert.ok(L.es.title && L.en.title);
  assert.equal(L.es.sections.length, L.en.sections.length);
  L.es.sections.forEach((s, i) => assert.equal(s.paras.length, L.en.sections[i].paras.length, s.head));
  L.es.sections.forEach((s, i) => s.paras.forEach((p, j) => assert.deepEqual(nums(p), nums(L.en.sections[i].paras[j]), `${s.head} · ${j}`)));
  assert.equal(L.refs.es.length, L.refs.en.length);
});

test('F5c T013: cuenta lo que pide la spec y cita sus fuentes', () => {
  const es = all('es');
  for (const w of ['nivelar', 'recursos limitados', 'pico', 'suma de cuadrados', 'Burgess', 'NP-difícil', 'regla', 'esquema serie', 'esquema paralelo',
    'hacia atrás', 'figura 7.23', 'cota de Baker', 'cadena crítica', 'colchón', 'multitarea', 'Varios recursos', 'ACTIM', 'activo']) assert.ok(es.includes(w), w);
  const refs = L.refs.es.join(' ');
  for (const w of ['Klastorin', 'Nicholas', 'Burgess', 'Kelley', 'Baker', 'Davis', 'Blazewicz', 'Kolisch', 'Goldratt', 'Demeulemeester']) assert.ok(refs.includes(w), w);
});

test('F5c T013: las cifras de los ejemplos que cuenta son las del núcleo', () => {
  const es = all('es');
  const proj = (id, wr) => { const e = X.get(id); return R.parse(e.rows, (wr || e.res).map((r) => ({ name: 'R', cap: r.cap == null ? '' : String(r.cap) })), wr ? 'lim' : e.mode).project; };
  const ES = (p) => Object.fromEntries(p.activities.map((a) => [a.id, p.times[a.id].ES]));
  const LS = (p) => Object.fromEntries(p.activities.map((a) => [a.id, p.times[a.id].LS]));
  const st = (p, S, k) => R.stats(R.profile(p, S, k, p.T));
  // Klastorin 8.1: 147, 21 y 1877 temprano, 16 y 1839 tardío, Burgess 16 y 1735 en 2 pasadas, mínimo 16, llano 147² / 13 ≈ 1662.
  const k81 = proj('k81');
  const b81 = R.burgess(k81, 0);
  assert.deepEqual([st(k81, ES(k81), 0), st(k81, LS(k81), 0), st(k81, b81.S, 0), b81.passes, R.minPeak(k81, 0).peak],
    [{ peak: 21, ssq: 1877, work: 147 }, { peak: 16, ssq: 1839, work: 147 }, { peak: 16, ssq: 1735, work: 147 }, 2, 16]);
  assert.equal(Math.round(147 * 147 / 13), 1662);
  for (const w of ['147 trabajadores-semana', 'pico de 21', '1877', '1839', '1735', '147² / 13 ≈ 1662']) assert.ok(es.includes(w), w);
  // LOGON: 23 → 15 con Burgess (el mínimo, 47 semanas); Burgess del equipo deja a los trabajadores en 19; el mínimo, el equipo en 16.
  const lg = proj('lg');
  assert.deepEqual([lg.T, st(lg, ES(lg), 0).peak, st(lg, R.burgess(lg, 0).S, 0).peak, R.minPeak(lg, 0).peak, st(lg, R.burgess(lg, 1).S, 0).peak, st(lg, R.minPeak(lg, 0).S, 1).peak],
    [47, 23, 15, 15, 19, 16]);
  for (const w of ['de 23 a 15', 'pico de 19', 'pico de 16']) assert.ok(es.includes(w), w);
  // LOGON con 14 trabajadores: reglas en serie de 49 a 62, óptimo 49.
  const lg14 = proj('lg', [{ cap: 14 }]);
  const sf = R.compare(lg14).filter((x) => x.scheme === 's' && x.dir === 'f');
  assert.deepEqual([Math.min(...sf.map((x) => x.T)), Math.max(...sf.map((x) => x.T)), R.optimum(lg14).T], [49, 62, 49]);
  assert.deepEqual(sf.filter((x) => x.T === 49).map((x) => x.rule).sort(), ['act', 'lft', 'lsf']);
  assert.equal(sf.find((x) => x.rule === 'spt').T, 62);
  // Klastorin 8.5: serie con menor holgura 17, paralelo 14; Baker ⌈(101 + 3 + 8) / 9⌉ = 13; óptimo 14; 10 trabajadores en 12 semanas.
  const k85 = proj('k85');
  const by = (p, s, d, r) => R.compare(p).find((x) => x.scheme === s && x.dir === d && x.rule === r).T;
  const bk = R.baker(k85).list[0];
  assert.deepEqual([by(k85, 's', 'f', 'slk'), by(k85, 'p', 'f', 'slk'), bk.W, bk.wasteStart, bk.wasteEnd, bk.Dmin, bk.Rmin, R.optimum(k85).T], [17, 14, 101, 3, 8, 13, 10, 14]);
  assert.ok(es.includes('⌈(101 + 3 + 8) / 9⌉ = 13'));
  // Nicholas 7.23: paralelo hacia delante 11 con todas, hacia atrás 10; serie 10 con cuatro reglas; óptimo 10; sin límite y Baker 9; trabajo 90.
  const n7 = proj('n723');
  assert.deepEqual(R.RULES.map((r) => by(n7, 'p', 'f', r)), R.RULES.map(() => 11));
  assert.deepEqual(['slk', 'lft', 'act', 'lsf'].map((r) => by(n7, 's', 'f', r)), [10, 10, 10, 10]);
  assert.deepEqual([R.RULES.map((r) => by(n7, 'p', 'b', r)).every((t) => t === 10), R.optimum(n7).T, n7.T, R.baker(n7).bound, R.baker(n7).list[0].W], [true, 10, 9, 9, 90]);
  // LOGON con el inspector: 35 + 14 = 49 (la cota de Baker), y el óptimo 49.
  const lgi = proj('lgi');
  const bi = R.baker(lgi).list[0];
  assert.deepEqual([bi.W, bi.wasteEnd, R.baker(lgi).bound, R.optimum(lgi).T], [35, 14, 49, 49]);
  // GUMBY cabe en sus 26 semanas con 8 analistas y 5 programadores.
  assert.equal(R.optimum(proj('gb')).T, 26);
  // El tope de las búsquedas exactas.
  assert.equal(R.BUDGET, 300000);
  assert.ok(es.includes('300 000'));
});
