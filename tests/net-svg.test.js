'use strict';
// views/net-svg: la red ROY o PERT del detective de Moodle como SVG en texto (F3d, T012; plan P4; spec AC21). Sin DOM,
// determinista y con los textos escapados. Ejemplo citado: el Ejercicio 6 de los apuntes (Tema 6a).
const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../js/core/examples.js');
const P = require('../js/core/project.js');
const C = require('../js/core/cpm.js');
const A = require('../js/core/aoa.js');
const RC = require('../js/core/roycheck.js');
const X = require('./xml-check.js');
const NS = require('../js/views/net-svg.js');

const ej6 = P.parse(E.get('ej6').rows, E.get('ej6').mode).project;
const sol = C.solve(ej6);
const pert = A.build(ej6, { method: 'rules' });
const names = { start: 'Inicio', end: 'Fin' };

test('net-svg · ROY del Ejercicio 6: un nodo por actividad más Inicio y Fin, una flecha por arco, título y descripción', () => {
  const roy = RC.fromTable(ej6);
  const svg = NS.render({ graph: 'aon', project: ej6, solution: sol, roy, names, title: 'Red ROY', desc: 'A & B <x>' });
  assert.ok(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"'));
  assert.deepEqual(X.check(svg), { ok: true });
  assert.equal((svg.match(/<rect x=/g) || []).length, 13);
  assert.equal((svg.match(/marker-end/g) || []).length, roy.arcs.length);
  assert.ok(svg.includes('<title id="t">Red ROY</title>') && svg.includes('<desc id="d">A &amp; B &lt;x&gt;</desc>'));
  assert.ok(svg.includes('>Inicio</text>') && svg.includes('>Fin</text>'));
  assert.equal(NS.render({ graph: 'aon', project: ej6, solution: sol, roy, names, title: 'Red ROY', desc: 'A & B <x>' }), svg, 'determinista');
});

test('net-svg · ROY con un arco de más o de menos: se dibuja lo que se enseña, sobre la colocación de la red correcta', () => {
  const roy = RC.fromTable(ej6);
  const more = { nodes: roy.nodes, arcs: roy.arcs.concat([{ from: 'K', to: 'A' }]) };
  const less = { nodes: roy.nodes, arcs: roy.arcs.filter((a) => !(a.from === 'F' && a.to === 'I')) };
  const n = (s) => (s.match(/marker-end/g) || []).length;
  assert.equal(n(NS.render({ graph: 'aon', project: ej6, solution: sol, roy: more, names, title: 't', desc: 'd' })), roy.arcs.length + 1);
  assert.equal(n(NS.render({ graph: 'aon', project: ej6, solution: sol, roy: less, names, title: 't', desc: 'd' })), roy.arcs.length - 1);
});

test('net-svg · PERT de las reglas del Ejercicio 6: nueve sucesos numerados, once actividades y tres ficticias discontinuas', () => {
  const svg = NS.render({ graph: 'aoa', base: pert, pert, title: 'Red PERT', desc: 'd' });
  assert.deepEqual(X.check(svg), { ok: true });
  assert.equal((svg.match(/<circle /g) || []).length, 9);
  assert.equal((svg.match(/marker-end/g) || []).length, 14);
  assert.equal((svg.match(/stroke-dasharray/g) || []).length, 3);
  for (const n of [1, 9]) assert.ok(svg.includes(`>${n}</text>`));
  // Sin una ficticia y con un suceso menos (dos actividades paralelas), sigue bien formado.
  const shown = { events: pert.events.filter((e) => e.n !== 5), arcs: pert.arcs.map((a) => (a.act === 'E' ? Object.assign({}, a, { to: 6 }) : a)).filter((a) => a.from !== 5), dummies: pert.dummies.filter((d) => d.name !== 'F3') };
  const s2 = NS.render({ graph: 'aoa', base: pert, pert: shown, title: 't', desc: 'd' });
  assert.deepEqual(X.check(s2), { ok: true });
  assert.equal((s2.match(/<circle /g) || []).length, 8);
});

test('net-svg no usa el DOM ni el azar', () => {
  const src = require('node:fs').readFileSync(require('node:path').join(__dirname, '../js/views/net-svg.js'), 'utf8');
  assert.ok(!/Math\.random|document\.|innerHTML/.test(src));
});
