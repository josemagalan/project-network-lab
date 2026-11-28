'use strict';
// views/fig-tikz: una figura de pantalla en TikZ (spec f5d-exportar-figuras, AC1, AC2, AC5 y AC6; plan §0, §3, P6 y P7; T002).
// Los SVG de tests/fixtures/fig/ son los de pantalla del Ejercicio 6 con los estilos calculados escritos como atributos
// (spikes/f5d-exportar-figuras/capture.js). La compilación con pdfLaTeX va en la evidencia (T010), no aquí.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const F = require('../js/views/fig-tikz.js');
const E = require('../js/core/examples.js');
const P = require('../js/core/project.js');
const C = require('../js/core/cpm.js');
const L = require('../js/views/layout.js');
const T = require('../js/core/topo.js');
const NS = require('../js/views/net-svg.js');
const RC = require('../js/core/roycheck.js');

const fixture = (n) => fs.readFileSync(path.join(__dirname, 'fixtures', 'fig', `${n}.svg`), 'utf8');
const tikzOf = (n, o) => F.toTikz(F.parse(fixture(n)), Object.assign({ title: n }, o));
const ej6 = () => { const e = E.get('ej6'); const { project } = P.parse(e.rows, e.mode); return { project, sol: C.solve(project) }; };
// Los bloques scope … end de primer nivel, con su nombre (el comentario) y sus líneas.
function scopes(tz) {
  const out = []; let cur = null;
  for (const l of tz.split('\n')) {
    const m = /^ {2}\\begin\{scope\}\[shift=\{\(([-\d.]+),([-\d.]+)\)\}\](?: % (.*))?$/.exec(l);
    if (m) { cur = { name: m[3] || '', x: +m[1], y: +m[2], lines: [] }; out.push(cur); continue; }
    if (/^ {2}\\end\{scope\}/.test(l)) { cur = null; continue; }
    if (cur) cur.lines.push(l);
  }
  return out;
}
const nodesIn = (lines) => lines.map((l) => /\\node\[[^\]]*\] at \([^)]*\) \{(.*)\};$/.exec(l)).filter(Boolean).map((m) => m[1]);
const arrows = (tz) => tz.split('\n').filter((l) => /^ {2}\\draw\[[^\]]*-\{Stealth/.test(l));

test('F5d T002: parse lee elementos, atributos, entidades, texto con <tspan> y los estilos heredados que importan', () => {
  const t = F.parse('<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 50"><!-- c --><g font-size="13" text-anchor="middle">'
    + '<text x="5" y="6" font-weight="700">A &amp; B &lt;1&gt;<title>no</title></text><text x="1" y="2">x<tspan>y</tspan></text></g>'
    + '<rect x="1" y="2" width="3" height="4" fill="#fff"/><rect class="box crit" x="0" y="0" width="9" height="9" stroke="#000" style="stroke-dasharray: 4 2"/>'
    + '<g display="none"><line x1="0" y1="0" x2="1" y2="1" stroke="#000"/></g></svg>');
  assert.equal(t.tag, 'svg');
  const [g, r1, r2, hid] = t.children;
  assert.deepEqual(g.children.map((c) => [c.style.size, c.style.anchor]), [[13, 'middle'], [13, 'middle']]);
  assert.equal(g.children[0].text, 'A & B <1>');
  assert.equal(g.children[0].style.weight, 700);
  assert.equal(g.children[1].children[0].text, 'y');
  assert.deepEqual([r1.style.fill, r1.style.stroke, r2.style.stroke, r2.style.dashed, r2.cls], [true, false, true, true, ['box', 'crit']]);
  assert.equal(hid.children[0].style.hidden, true);
  assert.throws(() => F.parse('<div/>'), /no es un SVG/);
});

test('F5d T002 · AC1: la ROY resuelta del Ejercicio 6: 11 cajas más Inicio y Fin, las cifras de pantalla en cada caja, los mismos arcos y en grueso B, E, I, J y K y sus arcos', () => {
  const { project, sol } = ej6();
  const tz = tikzOf('ej6-roy7');
  const sc = scopes(tz);
  assert.equal(sc.length, 13);
  assert.deepEqual(sc.map((s) => s.name).sort(), ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'Fin', 'Inicio'].sort());
  for (const a of project.activities) {
    const s = sc.find((x) => x.name === a.id);
    const t = sol.times[a.id];
    // Caja de siete: ES, d, EF / id / LS, TF, LF (el orden en que se dibujan).
    assert.deepEqual(nodesIn(s.lines).slice().sort(), [t.ES, a.d, t.EF, a.id, t.LS, sol.floats[a.id].TF, t.LF].map(String).sort(), a.id);
    const thick = s.lines.some((l) => /\\draw\[pnl thick[^\]]*\] \(0,0\) rectangle/.test(l));
    assert.equal(thick, sol.critical.includes(a.id), `${a.id}: grueso si y solo si es crítica`);
  }
  // Los arcos: uno por cada flecha de la red (con Inicio y Fin), y en grueso los del camino crítico.
  const g = L.graph(sol, project);
  const edges = []; for (const u of [T.START, ...sol.order]) for (const v of g.succs(u)) edges.push([u, v]);
  const crit = new Set(sol.critical); const isC = (x) => x === T.START || x === T.END || crit.has(x);
  const tight = (u, v) => Math.abs(sol.times[u].EF - sol.times[v].ES) < 1e-9;
  const want = edges.filter(([u, v]) => isC(u) && isC(v) && tight(u, v) && (crit.has(u) || crit.has(v))).length;
  assert.equal(arrows(tz).length, edges.length);
  assert.equal(arrows(tz).filter((l) => /pnl thick/.test(l)).length, want);
  assert.equal(want, 6);   // Inicio–B, B–E, E–I, I–J, J–K y K–Fin
});

test('F5d T002 · AC1, AC4: las cajas de cuatro (notación española, en inglés) y la compacta; Inicio y Fin en el idioma de pantalla', () => {
  const { project, sol } = ej6();
  const four = scopes(tikzOf('ej6-roy4-en'));
  assert.deepEqual([four.length, four.some((s) => s.name === 'Start'), four.some((s) => s.name === 'End')], [13, true, true]);
  for (const a of project.activities) assert.deepEqual(nodesIn(four.find((s) => s.name === a.id).lines).sort(), [a.id, sol.times[a.id].ES, sol.times[a.id].LS, a.d].map(String).sort(), a.id);
  const comp = tikzOf('ej6-royc');
  // Compacta: «ES/d/LS» encima de la caja y el id dentro.
  for (const a of project.activities) assert.match(comp, new RegExp(`\\{${sol.times[a.id].ES}/${a.d}/${sol.times[a.id].LS}\\}`), a.id);
});

test('F5d T002 · AC1: la PERT resuelta del Ejercicio 6: 9 sucesos, 11 arcos de actividad y 3 ficticias a trazos, con los tiempos de suceso del Tema 6a y la ruta crítica en grueso', () => {
  const tz = tikzOf('ej6-pert');
  assert.equal((tz.match(/ circle\[radius=/g) || []).length, 9);
  const arr = arrows(tz);
  assert.equal(arr.length, 14);
  assert.equal(arr.filter((l) => /dashed/.test(l)).length, 3);
  const exp = E.get('ej6').expected.aoa.eventTimes;
  const nodes = nodesIn(tz.split('\n'));
  for (const [te, tl] of exp) assert.ok(nodes.includes(String(te)) && nodes.includes(String(tl)), `${te} ${tl}`);
  for (const l of ['A = 2', 'B = 3', 'D = 8', 'K = 1', 'F1', 'F2', 'F3']) assert.ok(nodes.includes(l), l);
  // Ruta crítica B–E–I–J–K (con F1 y F3, que la unen): en grueso.
  assert.equal(arr.filter((l) => /pnl thick/.test(l)).length, 7);
});

test('F5d T002 · AC1: el Gantt resuelto del Ejercicio 6: 11 barras (5 críticas en gris oscuro con trazo grueso), las holguras a trazos y el eje de 0 a 13', () => {
  const tz = tikzOf('ej6-gantt');
  const bars = tz.split('\n').filter((l) => /\\filldraw/.test(l));
  assert.equal(bars.length, 11);
  assert.equal(bars.filter((l) => /pnl thick, fill=black!75/.test(l)).length, 5);
  assert.equal(tz.split('\n').filter((l) => /\\draw\[pnl line, dashed\]/.test(l)).length, 6);   // A, C, D, F, G y H tienen holgura
  const nodes = nodesIn(tz.split('\n'));
  for (let x = 0; x <= 13; x++) assert.ok(nodes.includes(String(x)), `marca ${x}`);
  assert.ok(tz.includes('pnl grid'));
});

test('F5d T002 · AC2: un paso de la ruta (8, la pasada hacia delante a medias): solo las cifras ya reveladas, nunca «·»', () => {
  const tz = tikzOf('ej6-roy-paso8');
  assert.equal(/\{·\}/.test(tz), false);
  const sc = scopes(tz);
  // En el paso 8 aún no hay comienzos tardíos ni holguras: las cajas no tienen siete cifras.
  for (const s of sc.filter((x) => /^[A-K]$/.test(x.name))) assert.ok(nodesIn(s.lines).length < 7, s.name);
  assert.deepEqual(nodesIn(sc.find((s) => s.name === 'A').lines).sort(), ['0', '2', '2', 'A'].sort());
});

test('F5d T002 · AC5: el escapado para LaTeX de los diez caracteres especiales y de los símbolos que pdfLaTeX no conoce', () => {
  assert.equal(F.tex('I+D & pruebas_1 {x} 50% #1 $ ^ ~ \\ ñ'), 'I+D \\& pruebas\\_1 \\{x\\} 50\\% \\#1 \\$ \\^{} \\~{} \\textbackslash{} ñ');
  assert.equal(F.tex('A ★ − → ≤ ≥ × … – —'), 'A $\\star$ $-$ $\\to$ $\\le$ $\\ge$ $\\times$ \\ldots{} -- ---');
  const tz = F.toTikz(F.parse('<svg viewBox="0 0 10 10"><text x="1" y="2">I+D &amp; {x}_1</text></svg>'), { title: 'a_b & c' });
  assert.ok(tz.includes('{I+D \\& \\{x\\}\\_1}'));
  assert.ok(tz.startsWith('% a\\_b \\& c · Project Network Lab\n'));
});

test('F5d T002 · AC6: la escala por defecto deja el dibujo en 16 cm como mucho (sin pasar de 1); la primera línea la dice; con menos de 0,5, la letra baja un tamaño; standalone', () => {
  assert.deepEqual([F.defaultScale(100), F.defaultScale(457), F.defaultScale(1072), F.defaultScale(1540)], [1, 1, 0.42, 0.29]);
  const tz = tikzOf('ej6-roy7');
  assert.match(tz.split('\n')[1], /^% Escala del dibujo: cambia 0\.42 en la línea siguiente/);
  assert.match(tz.split('\n')[2], /^\\begin\{tikzpicture\}\[scale=0\.42, x=0\.035cm, y=-0\.035cm/);
  assert.ok(/font=\\sffamily\\bfseries\\footnotesize\] at \([^)]*\) \{A\}/.test(tz), 'el id, un tamaño menos a 0,42');
  const big = tikzOf('ej6-roy7', { scale: 0.8 });
  assert.ok(/font=\\sffamily\\bfseries\\small\] at \([^)]*\) \{A\}/.test(big), 'el id, a 0,8');
  const sa = tikzOf('ej6-gantt', { standalone: true });
  assert.ok(sa.startsWith('\\documentclass[border=4pt]{standalone}\n\\usepackage{tikz}\n\\usetikzlibrary{arrows.meta}\n\\begin{document}\n'));
  assert.ok(sa.endsWith('\\end{tikzpicture}\n\\end{document}\n'));
  assert.equal(/\\usepackage\{(?!tikz\})/.test(sa), false, 'solo tikz');
});

test('F5d T002: determinista; las clases que se traducen, fijadas; lo que no es figura (puntas, zonas para pulsar, fondos, arcos A) no sale', () => {
  assert.equal(tikzOf('ej6-pert'), tikzOf('ej6-pert'));
  assert.deepEqual([F.THICK, F.DASHED, F.GRID, F.THIN], [['crit', 'chosen', 'sel', 'active', 'bar-c', 'rule'], ['dummy', 'compared', 'float', 'wait', 'zero'], ['grid', 'rsg-grid'], ['sep']]);
  const tz = F.toTikz(F.parse('<svg viewBox="0 0 50 50"><rect width="50" height="50" fill="#fff"/><rect class="hit" x="1" y="1" width="5" height="5" fill="none"/>'
    + '<path d="M0 0L10 5L0 10z"/><path d="M1 1 A 5 5 0 0 1 9 9" stroke="#000" fill="none"/><path d="M1 1 h 4 v 4 Z" stroke="#000" fill="none"/><text x="1" y="1">·</text></svg>'), {});
  const draws = tz.split('\n').filter((l) => /\\(draw|filldraw|node)\b/.test(l));
  assert.deepEqual(draws, ['  \\draw[pnl line] (1,1) -- (5,1) -- (5,5) -- cycle;']);
});

test('F5d T002: el SVG en texto de net-svg (el del examen y Moodle) se convierte sin el fondo: cada caja con su nombre', () => {
  const { project, sol } = ej6();
  const svg = NS.render({ graph: 'aon', project, solution: sol, roy: RC.fromTable(project), names: { start: 'Inicio', end: 'Fin' }, title: 'ROY', desc: 'Ej. 6' });
  const tz = F.toTikz(F.parse(svg), { title: 'ROY' });
  const nodes = nodesIn(tz.split('\n'));
  for (const a of project.activities) assert.ok(nodes.includes(a.id), a.id);
  assert.ok(nodes.includes('Inicio') && nodes.includes('Fin'));
  const w = F.parse(svg).attrs.width;
  assert.equal(new RegExp(`rectangle \\(${w},`).test(tz), false, 'sin el rectángulo del fondo');
  assert.ok(arrows(tz).length >= project.activities.length);
});

test('F5d T007: los signos de la corrección del detective (✓, ✗, ½) salen en LaTeX sin paquetes; la caja compacta sin cifras («·/·/·») no se escribe', () => {
  const tree = F.parse('<svg viewBox="0 0 100 40"><text x="5" y="10">✓ ✗ ½</text><text x="5" y="30">·/·/·</text><text x="50" y="30">·/3/·</text></svg>');
  const out = F.toTikz(tree, { title: 't' });
  assert.match(out, /\{\$\\surd\$ \$\\times\$ \$\\frac\{1\}\{2\}\$\}/);
  assert.doesNotMatch(out, /·\/·\/·/);
  assert.match(out, /\{·\/3\/·\}/);
});
