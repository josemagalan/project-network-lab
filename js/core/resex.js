/*
 * core/resex — ejemplos de la F5c (spec f5c-recursos, «Qué resultado obtiene»; plan §3 y P11).
 * Cada actividad lleva su duración y su uso de cada recurso por periodo, en texto, como el taller (r1, r2, r3; vacío si
 * el proyecto tiene menos recursos). res son los recursos del ejemplo con su nombre y su disponibilidad por periodo
 * (null = sin límite, `analyze` C5); mode, el modo en que abre (lev = nivelar, lim = recursos limitados). expected guarda
 * lo que dan la fuente o la tabla de la spec; las cifras las calcula core/resource y las pruebas las comparan.
 */
(function (root) {
  'use strict';

  const r = (id, links, d, ...use) => ({ id, links, d: String(d), r1: use[0] == null ? '' : String(use[0]), r2: use[1] == null ? '' : String(use[1]), r3: use[2] == null ? '' : String(use[2]) });
  const WEEKS = { es: 'semanas', en: 'weeks' };
  const WORKERS = { es: 'Trabajadores', en: 'Workers' };
  const KL = (figs) => ({
    es: `T. Klastorin (2010), Gestión de proyectos, Profit Editorial, cap. 8, ${figs.es}`,
    en: `T. Klastorin (2010), Gestión de proyectos, Profit Editorial, ch. 8, ${figs.en}`,
  });
  const NICH = (where) => ({
    es: `J. M. Nicholas y H. Steyn (2012), Project Management for Engineering, Business and Technology, 4.ª ed., Routledge, ${where.es}`,
    en: `J. M. Nicholas & H. Steyn (2012), Project Management for Engineering, Business and Technology, 4th ed., Routledge, ${where.en}`,
  });
  // LOGON (tablas 6.3 y 6.5): predecesoras, duración (semanas), trabajadores y equipo (horas) por semana.
  const LOGON = [
    ['H', '', 10, 5, 8], ['I', 'H', 8, 4, 2], ['J', 'H', 6, 8, 6], ['K', 'J', 4, 2, 1], ['L', 'J', 2, 6, 2], ['M', 'J', 4, 3, 2],
    ['N', 'I', 4, 2, 0], ['O', 'I', 5, 5, 0], ['P', 'I, J', 5, 6, 6], ['Q', 'L', 5, 2, 0], ['R', 'M', 5, 0, 4], ['S', 'N', 3, 0, 4],
    ['T', 'Q', 3, 0, 0], ['U', 'O, S', 1, 9, 8], ['V', 'K, R', 5, 14, 8], ['W', 'U', 2, 6, 8], ['X', 'V', 3, 6, 8], ['Y', 'P, W, X', 8, 14, 8],
    ['Z', 'Y, T', 6, 5, 8],
  ];
  const INSPECTED = ['H', 'J', 'K', 'L', 'P', 'V', 'X'];

  const list = [
    {
      id: 'k81',
      title: { es: 'Nivelación de un recurso (Klastorin)', en: 'Levelling one resource (Klastorin)' },
      source: KL({ es: 'figuras 8.1–8.4', en: 'Figs. 8.1–8.4' }),
      unit: WEEKS,
      mode: 'lev',
      res: [{ name: WORKERS, cap: null }],
      rows: [r('A', '', 3, 7), r('B', '', 2, 3), r('C', 'A', 9, 2), r('D', 'A', 5, 10), r('E', 'B', 3, 4), r('F', 'B', 2, 5), r('G', 'D, E', 5, 6)],
      expected: { T: 13, peakES: [21], peakLS: [16], minPeak: [16], burgessSsq: 1735 },
    },
    {
      id: 'k85',
      title: { es: 'Nueve trabajadores como máximo (Klastorin)', en: 'At most nine workers (Klastorin)' },
      source: KL({ es: 'figuras 8.5–8.10', en: 'Figs. 8.5–8.10' }),
      unit: WEEKS,
      mode: 'lim',
      res: [{ name: WORKERS, cap: 9 }],
      rows: [r('A', '', 4, 3), r('B', '', 3, 5), r('C', 'A, B', 1, 6), r('D', 'B', 5, 8), r('E', 'C, D', 4, 7)],
      expected: { T: 12, bakerD: 13, bakerR: 10, opt: 14 },
    },
    {
      id: 'lg',
      title: { es: 'LOGON: trabajadores y equipo (Nicholas)', en: 'LOGON: workers and equipment (Nicholas)' },
      source: NICH({ es: 'cap. 6, tablas 6.3 y 6.5 y figuras 6.23–6.28', en: 'ch. 6, Tables 6.3 and 6.5 and Figs. 6.23–6.28' }),
      unit: WEEKS,
      mode: 'lev',
      res: [{ name: WORKERS, cap: 14 }, { name: { es: 'Equipo (horas)', en: 'Equipment (hours)' }, cap: null }],
      rows: LOGON.map(([id, l, d, w, e]) => r(id, l, d, w, e)),
      expected: { T: 47, peakES: [23, 16], minPeak: [15, 16], opt: 49 },
    },
    {
      id: 'lgi',
      title: { es: 'LOGON con un inspector técnico (Nicholas)', en: 'LOGON with a technical inspector (Nicholas)' },
      source: NICH({ es: 'cap. 6, tabla 6.3 y figura 6.29', en: 'ch. 6, Table 6.3 and Fig. 6.29' }),
      unit: WEEKS,
      mode: 'lim',
      res: [{ name: { es: 'Inspector técnico', en: 'Technical inspector' }, cap: 1 }],
      rows: LOGON.map(([id, l, d]) => r(id, l, d, INSPECTED.includes(id) ? 1 : 0)),
      expected: { T: 47, opt: 49 },
    },
    {
      id: 'gb',
      title: { es: 'GUMBY: analistas y programadores (Nicholas)', en: 'GUMBY: analysts and programmers (Nicholas)' },
      source: NICH({ es: 'cap. 6, problema 22', en: 'ch. 6, problem 22' }),
      unit: WEEKS,
      mode: 'lim',
      res: [{ name: { es: 'Analistas', en: 'Systems analysts' }, cap: 8 }, { name: { es: 'Programadores', en: 'Programmers' }, cap: 5 }],
      rows: [r('J', '', 6, 8, 3), r('M', 'J', 4, 5, 4), r('V', 'M', 6, 3, 2), r('Y', 'V', 8, 2, 3), r('L', 'J', 2, 5, 3), r('Q', 'L', 8, 3, 2), r('Z', 'Y, Q', 2, 5, 3)],
      expected: { T: 26, peakES: [10, 7], opt: 26 },
    },
    {
      id: 'n723',
      title: { es: 'Reglas de prioridad (Nicholas)', en: 'Priority rules (Nicholas)' },
      source: NICH({ es: 'cap. 7, §7.5, figura 7.23', en: 'ch. 7, §7.5, Fig. 7.23' }),
      unit: WEEKS,
      mode: 'lim',
      res: [{ name: WORKERS, cap: 10 }],
      // En el orden de la figura (A, E, B, C, D, F): los desempates de las reglas van por el orden de la tabla.
      rows: [r('A', '', 2, 5), r('E', 'A', 3, 5), r('B', '', 1, 5), r('C', 'B', 2, 10), r('D', 'B', 1, 10), r('F', 'C', 6, 5)],
      expected: { T: 9, opt: 10 },
    },
  ];

  const byId = new Map(list.map((e) => [e.id, e]));
  const api = { list: () => list, get: (id) => byId.get(id) || null };
  root.PNL = root.PNL || {};
  root.PNL.resex = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
