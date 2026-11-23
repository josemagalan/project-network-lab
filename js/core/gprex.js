/*
 * core/gprex — ejemplos de la F5a (spec f5a-precedencias-generalizadas, «Qué resultado obtiene»; plan §3).
 * Las predecesoras van escritas en forma canónica (FS, SS, FF, SF), como en la URL. expected guarda lo que da la
 * fuente o la tabla de la spec (duración, comienzos tempranos y camino crítico); las cifras las calcula core/gpr y
 * las pruebas las comparan.
 */
(function (root) {
  'use strict';

  const r = (id, d, links) => ({ id, duration: String(d), links });
  const T6B = {
    es: 'J. M. Galán, Gestión de Proyectos (UBU), Tema 6b, tipos de prelación con demora (a partir de slideshowes.com/doc/9346), con D = 3',
    en: 'J. M. Galán, Project Management (University of Burgos), Unit 6b, precedence types with lag (after slideshowes.com/doc/9346), with D = 3',
  };
  const NICH = (where) => ({
    es: `J. M. Nicholas y H. Steyn (2012), Project Management for Engineering, Business and Technology, 4.ª ed., Routledge, cap. 6, ${where.es}`,
    en: `J. M. Nicholas & H. Steyn (2012), Project Management for Engineering, Business and Technology, 4th ed., Routledge, ch. 6, ${where.en}`,
  });

  const list = [
    {
      id: 'fc',
      title: { es: 'Demora fin–comienzo (Tema 6b)', en: 'Finish-to-start lag (Unit 6b)' },
      source: T6B,
      unit: { es: 'periodos', en: 'periods' },
      rows: [r('A', 8, ''), r('B', 7, 'A FS+3')],
      expected: { duration: 18, ES: { A: 0, B: 11 }, critical: ['A', 'B'] },
    },
    {
      id: 'cc',
      title: { es: 'Demora comienzo–comienzo (Tema 6b)', en: 'Start-to-start lag (Unit 6b)' },
      source: T6B,
      unit: { es: 'periodos', en: 'periods' },
      rows: [r('A', 8, ''), r('B', 7, 'A SS+3')],
      expected: { duration: 10, ES: { A: 0, B: 3 }, critical: ['A', 'B'] },
    },
    {
      id: 'n16',
      title: { es: 'CC y FF entre las mismas actividades (Nicholas)', en: 'SS and FF between the same activities (Nicholas)' },
      source: NICH({ es: 'figura 6.16', en: 'Fig. 6.16' }),
      unit: { es: 'días', en: 'days' },
      rows: [r('A', 15, ''), r('B', 15, 'A SS+5, A FF+10')],
      expected: { duration: 25, ES: { A: 0, B: 10 }, critical: ['A', 'B'] },
    },
    {
      id: 'rb',
      title: { es: 'Proyecto ROSEBUD con relaciones generalizadas (Nicholas)', en: 'ROSEBUD project with generalized precedences (Nicholas)' },
      source: NICH({ es: 'ejemplo 6.1 y figuras 6.18 y 6.20', en: 'Example 6.1 and Figs. 6.18 and 6.20' }),
      unit: { es: 'días', en: 'days' },
      rows: [
        r('G', 6, ''),
        r('M', 4, 'G'),
        r('L', 2, 'G SS+3, G FF'),
        r('V', 6, 'M'),
        r('Q', 8, 'L'),
        r('Y', 8, 'V SS+2, V FF+6'),
        r('W', 1, 'Y SS+5, Y FF, Q'),
        r('X', 1, 'W FS+1'),
      ],
      expected: { duration: 24, ES: { G: 0, M: 6, L: 4, V: 10, Q: 6, Y: 14, W: 21, X: 23 }, critical: ['G', 'M', 'V', 'Y', 'W', 'X'] },
    },
    {
      id: 'rv',
      title: { es: 'Actividad crítica al revés', en: 'Reverse critical activity' },
      source: { es: 'Ejemplo del laboratorio para la clasificación de V. Valls y P. Lino (2001), Annals of Operations Research 102, 17–37',
                en: 'Lab example for the classification of V. Valls & P. Lino (2001), Annals of Operations Research 102, 17–37' },
      unit: { es: 'días', en: 'days' },
      rows: [r('A', 10, ''), r('B', 6, 'A FF'), r('C', 10, 'B SS')],
      expected: { duration: 14, ES: { A: 0, B: 4, C: 4 }, critical: ['A', 'B', 'C'] },
    },
  ];
  const byId = Object.fromEntries(list.map((e) => [e.id, e]));

  const api = { list: () => list, get: (id) => byId[id] || null };
  root.PNL = root.PNL || {};
  root.PNL.gprex = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
