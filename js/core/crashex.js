/*
 * core/crashex — ejemplos de la F5b (spec f5b-coste-tiempo, «Qué resultado obtiene»; plan §3 y P6).
 * Cada actividad lleva sus dos puntos, como en la tabla de la pestaña (decisión del autor en clarify): duración normal
 * (dn) y urgente (dc), coste normal (cn) y urgente (cc), en texto, como el taller. k son los costes del proyecto
 * (indirecto fijo y por unidad de tiempo, plazo, penalización y prima; null = vacío). expected guarda lo que dan la
 * fuente o la tabla de la spec (coste directo de la regla y del óptimo por duración, duraciones de coste total mínimo);
 * las cifras las calcula core/crash y las pruebas las comparan.
 */
(function (root) {
  'use strict';

  const r = (id, links, dn, dc, cn, cc) => ({ id, links, dn: String(dn), dc: String(dc), cn: String(cn), cc: String(cc) });
  const K = (fixed, perUnit, due, penalty, bonus) => ({ fixed, perUnit, due, penalty, bonus });
  const NICH = (where) => ({
    es: `J. M. Nicholas y H. Steyn (2012), Project Management for Engineering, Business and Technology, 4.ª ed., Routledge, cap. 7, §7.1, ${where.es}`,
    en: `J. M. Nicholas & H. Steyn (2012), Project Management for Engineering, Business and Technology, 4th ed., Routledge, ch. 7, §7.1, ${where.en}`,
  });
  const WEEKS = { es: 'semanas', en: 'weeks' };
  const NI_ROWS = [
    r('A', '', 9, 6, 10, 16), r('B', '', 8, 5, 9, 18), r('C', 'A', 5, 4, 7, 8), r('D', 'A', 8, 6, 9, 19),
    r('E', 'B', 7, 3, 7, 15), r('F', 'C', 5, 5, 5, 5), r('G', 'D, E', 5, 2, 8, 23),
  ];
  const NI_RULE = { 22: 55, 21: 57, 20: 59, 19: 63, 18: 68, 17: 73, 16: 78, 15: 86 };

  const list = [
    {
      id: 'kl',
      title: { es: 'Compresión de cuatro tareas (Klastorin)', en: 'Four-task crashing example (Klastorin)' },
      source: {
        es: 'T. Klastorin (2010), Gestión de proyectos, Profit Editorial, cap. 5, figuras 5.8–5.13; en el Tema 6c de J. M. Galán, diapositivas 10–16',
        en: 'T. Klastorin (2010), Gestión de proyectos, Profit Editorial, ch. 5, Figs. 5.8–5.13; in Unit 6c by J. M. Galán, slides 10–16',
      },
      unit: WEEKS,
      costUnit: { es: 'dólares', en: 'dollars' },
      rows: [r('A', '', 7, 5, 60, 76), r('B', '', 6, 4, 85, 95), r('C', 'A, B', 15, 13, 55, 75), r('D', 'B', 10, 8, 120, 128)],
      k: K(null, 7, 19, 5, null),
      expected: { rule: { 22: 320, 21: 328, 20: 338, 19: 348, 18: 361 }, opt: { 22: 320, 21: 328, 20: 338, 19: 348, 18: 361 }, best: [19] },
    },
    {
      id: 'ni',
      title: { es: 'Compresión con costes indirectos (Nicholas)', en: 'Crashing with indirect costs (Nicholas)' },
      source: NICH({ es: 'figuras 7.3–7.6 y tabla 7.1', en: 'Figs. 7.3–7.6 and Table 7.1' }),
      unit: WEEKS,
      costUnit: { es: 'miles de dólares', en: 'thousands of dollars' },
      rows: NI_ROWS,
      k: K(10, 3, null, null, null),
      expected: { rule: NI_RULE, opt: NI_RULE, best: [20] },
    },
    {
      id: 'nip',
      title: { es: 'Compresión con prima y penalización (Nicholas)', en: 'Crashing with bonus and penalty (Nicholas)' },
      source: NICH({ es: 'figuras 7.3 y 7.7', en: 'Figs. 7.3 and 7.7' }),
      unit: WEEKS,
      costUnit: { es: 'miles de dólares', en: 'thousands of dollars' },
      rows: NI_ROWS,
      k: K(10, 3, 18, 1, 2),
      expected: { rule: NI_RULE, opt: NI_RULE, best: [19, 20] },
    },
    {
      id: 'rf',
      title: { es: 'Cuando la regla no da el mínimo', en: 'When the rule misses the minimum' },
      source: {
        es: 'Ejemplo del laboratorio: el más pequeño de los encontrados al azar en que la regla paso a paso no da el coste mínimo',
        en: 'Lab example: the smallest one found at random in which the step-by-step rule misses the minimum cost',
      },
      unit: { es: 'periodos', en: 'periods' },
      costUnit: { es: 'unidades de coste', en: 'cost units' },
      rows: [r('A', '', 5, 3, 10, 18), r('B', '', 4, 2, 20, 32), r('C', 'B', 2, 1, 5, 7), r('D', 'B', 8, 5, 15, 24), r('E', 'A, C', 5, 3, 10, 18)],
      k: K(null, null, null, null, null),
      expected: { rule: { 12: 60, 11: 63, 10: 68, 9: 75, 8: 85, 7: 95 }, opt: { 12: 60, 11: 63, 10: 68, 9: 75, 8: 83, 7: 93 }, best: [12] },
    },
  ];

  const byId = new Map(list.map((e) => [e.id, e]));
  const api = { list: () => list, get: (id) => byId.get(id) || null };
  root.PNL = root.PNL || {};
  root.PNL.crashex = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
