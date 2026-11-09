'use strict';
/*
 * Oráculo de las ficticias que se pueden quitar (F2b, T001; AC6 y AC11). Solo para pruebas: sin
 * dependencias de js/, escrito para leerse. Referencia independiente de core/aoacheck.removable.
 *
 * Una ficticia se puede quitar si la red sigue siendo correcta (oracle-mindummy.check) al borrarla o, si
 * no, al fundir su suceso de destino con el de origen. Se prueba primero borrar y después fundir.
 * Red: { nodes: int, arcs: [{act, from, to}], dummies: [{from, to}] } con sucesos 0..nodes−1.
 */
const { check } = require('./oracle-mindummy.js');

// Renumera los sucesos usados a 0..k−1 (fundir deja un número sin usar).
function compact(net) {
  const used = [...new Set([...net.arcs, ...net.dummies].flatMap((e) => [e.from, e.to]))].sort((a, b) => a - b);
  const re = new Map(used.map((u, i) => [u, i]));
  return {
    nodes: used.length,
    arcs: net.arcs.map((e) => ({ act: e.act, from: re.get(e.from), to: re.get(e.to) })),
    dummies: net.dummies.map((e) => ({ from: re.get(e.from), to: re.get(e.to) })),
  };
}

function removable(succ, net) {
  const out = [];
  net.dummies.forEach((d, i) => {
    const rest = net.dummies.filter((_, j) => j !== i);
    if (check(succ, compact({ nodes: net.nodes, arcs: net.arcs, dummies: rest }))) { out.push({ i, how: 'delete' }); return; }
    const m = (u) => (u === d.to ? d.from : u);
    const merged = {
      nodes: net.nodes,
      arcs: net.arcs.map((e) => ({ act: e.act, from: m(e.from), to: m(e.to) })),
      dummies: rest.map((e) => ({ from: m(e.from), to: m(e.to) })).filter((e) => e.from !== e.to),
    };
    if (check(succ, compact(merged))) out.push({ i, how: 'merge' });
  });
  return out;
}

module.exports = { removable };
