/*
 * learn-ex — «Aprende más» de «Ejercicios», con una sección por tipo (spec f3e-probabilidad-montecarlo, AC22; plan P1, P8
 * y P9, bloque 4; reserva R1 de T001; tablero 99). Grupo lx<tipo>: este archivo, su hoja (css/learn-ex.css) y el de la sección del tipo abierto
 * (learn-ex-calc, -roy, -pert, -det, -tcl y -mc), que se registra en s[tipo]. Así cada vista paga solo su sección.
 *
 * open(k, c) pinta el diálogo de app.js (c: { need, lang, nota, dlg, body, title }): las pestañas de los seis tipos a la
 * izquierda (role="tablist", flechas arriba y abajo, Inicio y Fin) y, a la derecha, la sección del tipo, el párrafo del
 * banco de Moodle (F3b, T012) y las referencias. Cambiar de pestaña carga su sección (c.need) y repinta.
 * Cada sección: { es, en } con { title, blocks }; un bloque es un párrafo (texto), ['h', título], ['table', cabecera,
 * filas] o ['links', [[texto, estado de la URL]]]. Los textos de aquí (título, Moodle) salen de i18n.js para no
 * engordar la carga común. Nunca innerHTML: todo con PNL.dom.
 */
(function (root) {
  'use strict';

  const isNode = typeof module !== 'undefined' && module.exports;
  const U = isNode ? require('./core/urlstate.js') : root.PNL.urlstate;

  const KINDS = ['calc', 'roy', 'pert', 'det', 'tcl', 'mc'];
  const TX = {
    es: { title: 'Aprende más · Ejercicios', tabs: 'Tipos de ejercicio', refs: 'Referencias', review: 'Para repasarlo',
      moodle: 'Para un examen con nota, usa Moodle: el laboratorio genera bancos de preguntas por etapas con estos mismos niveles.', moodleLink: 'Para profesorado: bancos de preguntas para Moodle',
      kinds: { calc: 'Cálculo', roy: 'Construir la ROY', pert: 'Construir la PERT', det: 'Detective', tcl: 'Probabilidad (TCL)', mc: 'Montecarlo' } },
    en: { title: 'Learn more · Exercises', tabs: 'Exercise types', refs: 'References', review: 'To review it',
      moodle: 'For a graded exam, use Moodle: the lab generates question banks in stages with these same levels.', moodleLink: 'For teachers: question banks for Moodle',
      kinds: { calc: 'Calculation', roy: 'Build the AON', pert: 'Build the AOA', det: 'Detective', tcl: 'Probability (CLT)', mc: 'Monte Carlo' } },
  };
  const REFS = [
    'Hillier, F. S., & Lieberman, G. J. (2015). Introduction to operations research (10th ed.). McGraw-Hill.',
    'Klastorin, T. (2010). Gestión de proyectos. Profit Editorial.',
    'Malcolm, D. G., Roseboom, J. H., Clark, C. E., & Fazar, W. (1959). Application of a technique for research and development program evaluation. Operations Research, 7(5), 646–669.',
    'Roy, B. (Dir.) (1964). Les problèmes d’ordonnancement : applications et méthodes. Dunod.',
  ];
  const s = {};
  const lang = (l) => (TX[l] ? l : 'es');
  const hashOf = (st, c) => U.encode(Object.assign(U.defaults(), st, { lang: lang(c.lang), nota: c.nota }));
  // F3e (T017, P2): el exportador está en su página, moodle.html, con el mismo «#» que escribe ella.
  const moodleHref = (c) => `moodle.html${hashOf({ v: 'moodle' }, c)}`;

  /** La sección de un tipo como bloques (para las pruebas y para pintarla). */
  const section = (k, l) => (s[k] ? s[k][lang(l)] : null);

  function render(k, c) {
    const G = root.PNL;
    const { h, clear } = G.dom;
    const L = lang(c.lang);
    const tx = TX[L];
    const close = () => { if (typeof c.dlg.close === 'function') c.dlg.close(); else c.dlg.removeAttribute('open'); };
    c.title.textContent = tx.title;
    const body = clear(c.body);
    const go = (k2, focus) => { c.need(`lx${k2}`).then(() => { render(k2, c); if (focus) { const el = root.document.getElementById(`lxTab-${k2}`); if (el) el.focus(); } }, () => {}); };
    const tabs = KINDS.map((x) => h('button', { type: 'button', role: 'tab', id: `lxTab-${x}`, 'aria-selected': String(x === k), 'aria-controls': 'lxPanel', tabindex: x === k ? '0' : '-1',
      onclick: () => { if (x !== k) go(x, true); },
      onkeydown: (e) => {
        const i = KINDS.indexOf(x);
        const j = { ArrowDown: i + 1, ArrowUp: i - 1, Home: 0, End: KINDS.length - 1 }[e.key];
        if (j === undefined) return;
        e.preventDefault();
        go(KINDS[(j + KINDS.length) % KINDS.length], true);
      } }, [tx.kinds[x]]));
    const sec = section(k, L);
    const out = [h('h3', { id: 'lxHead' }, [sec.title])];
    for (const b of sec.blocks) {
      if (typeof b === 'string') out.push(h('p', {}, [b]));
      else if (b[0] === 'h') out.push(h('h4', {}, [b[1]]));
      else if (b[0] === 'table') {
        out.push(h('div', { class: 'lx-table', tabindex: '0', role: 'region', 'aria-labelledby': 'lxHead' }, [h('table', { class: 'data' }, [
          h('thead', {}, [h('tr', {}, b[1].map((x) => h('th', { scope: 'col' }, [x])))]),
          h('tbody', {}, b[2].map((row) => h('tr', {}, row.map((x, i) => (i ? h('td', {}, [x]) : h('th', { scope: 'row' }, [x]))))))])]));
      } else if (b[0] === 'links') {
        out.push(h('h4', {}, [tx.review]));
        out.push(h('p', { class: 'lx-links' }, b[1].flatMap(([text, st], i) => [i ? ' · ' : '', h('a', { href: hashOf(st, c), onclick: close }, [text])])));
      }
    }
    out.push(h('p', { class: 'lx-moodle' }, [tx.moodle, ' ', h('a', { id: 'exLearnMoodle', href: moodleHref(c), onclick: close }, [tx.moodleLink]), '.']));
    out.push(h('h4', {}, [tx.refs]), h('ul', {}, REFS.map((r) => h('li', {}, [r]))));
    body.appendChild(h('div', { class: 'lx' }, [h('div', { class: 'lx-tabs', role: 'tablist', 'aria-orientation': 'vertical', 'aria-label': tx.tabs }, tabs),
      h('div', { class: 'lx-panel', id: 'lxPanel', role: 'tabpanel', 'aria-labelledby': `lxTab-${k}`, tabindex: '0' }, out)]));
  }

  function open(k, c) {
    render(KINDS.includes(k) ? k : 'calc', c);
    if (!c.dlg.open) { if (typeof c.dlg.showModal === 'function') c.dlg.showModal(); else c.dlg.setAttribute('open', ''); }
  }

  const api = { KINDS, TX, REFS, s, section, open, moodleHref };
  root.PNL = root.PNL || {};
  root.PNL.learnEx = api;
  if (isNode) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
