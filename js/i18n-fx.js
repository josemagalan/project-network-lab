/*
 * i18n-fx — textos del menú «Exportar» en español e inglés (spec f5d-exportar-figuras; plan P11, bloque 1: el menú y sus
 * avisos; tableros 142–146). Se carga bajo demanda con el grupo fx, al abrir el menú, y se fusiona con i18n (dict.es.fx y
 * dict.en.fx). El texto del botón está en los textos comunes (ctl.export), porque el botón se pinta antes de cargar fx.
 */
(function (root) {
  'use strict';

  const isNode = typeof module !== 'undefined' && module.exports;
  const I = isNode ? require('./i18n.js') : root.PNL.i18n;

  const es = {
    label: 'Exportar la figura',
    show: 'Mostrar', blank: 'En blanco', solved: 'Resuelta',
    svg: 'Descargar SVG', png: 'Descargar PNG', pngExt: '(doble tamaño)', copy: 'Copiar TikZ', tex: 'Descargar TikZ', texExt: '(.tex que compila solo)',
    hint: 'TikZ en blanco y negro, con la colocación de pantalla; el camino crítico, en trazo grueso. SVG y PNG, con los colores del tema claro.',
    route: 'En la ruta guiada, «Resuelta» es lo que ya se ve en este paso.',
    exOnly: '«Resuelta» aparece al entregar el ejercicio o pedir la solución.',
    exam: 'Como en el documento: en blanco en el enunciado, resuelta en la solución.',
    copied: 'TikZ copiado. Pégalo dentro de tu documento (necesita \\usepackage{tikz} y \\usetikzlibrary{arrows.meta}).',
    noCopy: 'El navegador no deja copiar. Usa «Descargar TikZ».',
    pngFail: 'No se ha podido hacer el PNG. Prueba con el SVG.',
    noFig: 'Ahora no hay figura que exportar.',
  };

  const en = {
    label: 'Export the figure',
    show: 'Show', blank: 'Blank', solved: 'Solved',
    svg: 'Download SVG', png: 'Download PNG', pngExt: '(double size)', copy: 'Copy TikZ', tex: 'Download TikZ', texExt: '(standalone .tex)',
    hint: 'Black-and-white TikZ with the on-screen layout; the critical path in thick lines. SVG and PNG with the light theme colours.',
    route: 'In the guided route, “Solved” is what this step already shows.',
    exOnly: '“Solved” appears once you submit the exercise or ask for the solution.',
    exam: 'As in the document: blank in the statement, solved in the solution.',
    copied: 'TikZ copied. Paste it into your document (it needs \\usepackage{tikz} and \\usetikzlibrary{arrows.meta}).',
    noCopy: 'This browser does not allow copying. Use “Download TikZ”.',
    pngFail: 'The PNG could not be made. Try the SVG.',
    noFig: 'There is no figure to export right now.',
  };

  I.dict.es.fx = es;
  I.dict.en.fx = en;

  const api = { es, en };
  root.PNL = root.PNL || {};
  root.PNL.i18nFx = api;
  if (isNode) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
