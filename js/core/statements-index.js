/*
 * core/statements-index — los títulos de los enunciados de M0 sin su texto (spec f3c-enunciados, plan P12; puerta T001).
 * M0 lo carga siempre para el selector; core/statements (el texto, 37 KB) solo se pide al abrir uno de esos
 * enunciados, así que M0 con un enunciado al azar o propio no lo carga. Una prueba comprueba que coincide con
 * core/statements. Sin DOM ni azar.
 */
(function (root) {
  'use strict';

  const LIST = [
    { id: 'ej1', title: { es: 'Nave almacén (Ejercicio 1)', en: 'Warehouse (Exercise 1)' } },
    { id: 'ej2', title: { es: 'Ejercicio 2', en: 'Exercise 2' } },
    { id: 'ej3', title: { es: 'Ejercicio 3', en: 'Exercise 3' } },
    { id: 'ej4', title: { es: 'Proyecto industrial (Ejercicio 4)', en: 'Industrial project (Exercise 4)' } },
    { id: 'ej5', title: { es: 'Electrona (Ejercicio 5)', en: 'Electrona (Exercise 5)' } },
    { id: 'ej6', title: { es: 'Mecánicas del Sureste (Ejercicio 6)', en: 'Mecánicas del Sureste (Exercise 6)' } },
    { id: 'ej7', title: { es: 'Ejercicio 7', en: 'Exercise 7' } },
    { id: 'cocina', title: { es: 'Reforma de la cocina', en: 'Kitchen refit' } },
    { id: 'congreso', title: { es: 'Organizar un congreso', en: 'Organising a conference' } },
    { id: 'mudanza', title: { es: 'Mudanza de un laboratorio', en: 'Moving a laboratory' } },
    { id: 'lanzamiento', title: { es: 'Lanzamiento de un producto', en: 'Product launch' } },
  ];
  const byId = Object.fromEntries(LIST.map((s) => [s.id, s]));
  const api = { list: (opts) => (opts && opts.all ? LIST.slice() : LIST.filter((s) => !s.hidden)), get: (id) => byId[id] || null };
  root.PNL = root.PNL || {};
  root.PNL.statementsIndex = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
