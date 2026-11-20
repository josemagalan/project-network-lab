'use strict';
// moodle-page: la parte sin DOM de la vista del exportador (spec f3b-moodle; plan §4; T009).
const test = require('node:test');
const assert = require('node:assert/strict');
const MP = require('../js/moodle-page.js');
const M = require('../js/core/moodle.js');

test('resumen: preguntas y categorías de una selección', () => {
  const sel = { stages: new Set(M.STAGES), levels: new Set(['medium']), count: 10 };
  const all = MP.stagesOf(true, true);
  assert.deepEqual(MP.summary(sel, all), { categories: 7, questions: 70 });
  assert.deepEqual(MP.summary({ stages: new Set(['early', 'evLate']), levels: new Set(['easy', 'hard']), count: 50 }, all), { categories: 4, questions: 200 });
  assert.deepEqual(MP.summary({ stages: new Set(), levels: new Set(['easy']), count: 10 }, all), { categories: 0, questions: 0 });
});

test('nombre del archivo en cada idioma', () => {
  assert.equal(MP.fileName('es', '2026-11-12', 42), 'banco-redes-2026-11-12-s42.xml');
  assert.equal(MP.fileName('en', '2026-11-12', 42), 'network-bank-2026-11-12-s42.xml');
});

test('categorías que se quedan cortas, con sus nombres', () => {
  assert.equal(MP.missingText('es', []), '');
  assert.equal(MP.missingText('es', [{ stage: 'critPath', level: 'easy', made: 47, wanted: 50 }]),
    'No se han encontrado bastantes ejemplares distintos para: 4b · Caminos críticos, Fácil (47 de 50).');
  assert.equal(MP.missingText('en', [{ stage: 'early', level: 'hard', made: 3, wanted: 5 }, { stage: 'late', level: 'hard', made: 4, wanted: 5 }]),
    'Not enough distinct instances were found for: 1 · Early times, Hard (3 of 5); 2 · Late times, Hard (4 of 5).');
});

test('resumen en singular con una categoría o una pregunta', () => {
  const s = (stages, levels, count) => MP.summaryText('es', MP.summary({ stages: new Set(stages), levels: new Set(levels), count }, MP.stagesOf(true, true)));
  assert.equal(s(M.STAGES, ['medium'], 10), 'Se generarán 70 preguntas en 7 categorías.');
  assert.equal(s(['floats'], ['hard'], 7), 'Se generarán 7 preguntas en una categoría.');
  assert.equal(s(['floats'], ['hard'], 1), 'Se generará 1 pregunta en una categoría.');
  assert.equal(s([], ['hard'], 1), 'Elige al menos una etapa y un nivel.');
  assert.equal(MP.summaryText('en', MP.summary({ stages: new Set(['early']), levels: new Set(['easy']), count: 3 }, MP.stagesOf(true, true))), '3 questions will be generated in one category.');
});

// F3c (T011; plan §4, P6): la etapa «0 · Enunciado → tabla» va la primera en la interfaz y solo cuando está publicada.
test('etapas que ofrece el exportador: sin publicar, las siete de la F3b (y las 11 a 17); publicada (T013), la 0 la primera', () => {
  assert.deepEqual(MP.stagesOf(false), [...M.STAGES, ...M.STAGES_F3E]);
  assert.deepEqual(MP.stagesOf(true), ['stmt', ...M.STAGES, ...M.STAGES_F3E]);
  assert.equal(MP.stmtPublic, true, 'publicada en T013');
});

// F3d (T013; plan §4; tablero 90): las etapas 7 a 10 van al final de la lista, ocultas hasta la publicación (T014).
test('etapas que ofrece el exportador con las de la F3d: al final, en el orden del núcleo, y solo con f3dPublic', () => {
  assert.deepEqual(MP.LAB_STAGES, ['minDummy', 'succ', 'immPred', 'detective']);
  assert.deepEqual(MP.stagesOf(true, false), ['stmt', ...M.STAGES, ...M.STAGES_F3E]);
  assert.deepEqual(MP.stagesOf(true, true), ['stmt', ...M.STAGES, 'minDummy', 'succ', 'immPred', 'detective', ...M.STAGES_F3E]);
  assert.deepEqual(MP.stagesOf(false, true), [...M.STAGES, 'minDummy', 'succ', 'immPred', 'detective', ...M.STAGES_F3E]);
  assert.equal(MP.f3dPublic, true, 'publicadas en T014');
  const sel = { stages: new Set(M.STAGES_ALL), levels: new Set(['medium', 'hard']), count: 10 };
  assert.deepEqual(MP.summary(sel, MP.stagesOf(true, true)), { categories: 38, questions: 380 });
  assert.deepEqual(MP.summary(sel, MP.stagesOf(true, false)), { categories: 30, questions: 300 }, 'sin las etapas de la F3d');
});

test('resumen con la etapa 0: cuenta solo las etapas que se ofrecen', () => {
  const sel = { stages: new Set(M.STAGES_ALL), levels: new Set(['medium']), count: 10 };
  assert.deepEqual(MP.summary(sel, MP.stagesOf(false)), { categories: 14, questions: 140 });
  assert.deepEqual(MP.summary(sel, MP.stagesOf(true)), { categories: 15, questions: 150 });
});

// ---------- F3e (T016; plan P2 y P7; tableros 100, 101 y 105): las etapas 11 a 17, sus familias y las series ----------
const S = require('../js/core/series.js');
const LAB = ['minDummy', 'succ', 'immPred', 'detective'];

test('F3e T016 · las etapas 11 a 17 van al final y solo en la página propia (con sus familias); la lista, en tres familias', () => {
  assert.deepEqual(MP.F3E_STAGES, M.STAGES_F3E);
  // Desde T021 (ronda 2, R2-F4) solo hay moodle.html: las 11 a 17 van siempre.
  assert.deepEqual(MP.stagesOf(true, true), ['stmt', ...M.STAGES, ...LAB, ...M.STAGES_F3E]);
  const fam = (shown) => MP.groupsOf(shown).map((g) => [g.key, g.stages]);
  assert.deepEqual(fam(MP.stagesOf(true, true)), [['calc', ['stmt', ...M.STAGES]], ['lab', LAB], ['prob', M.STAGES_F3E]]);
  assert.deepEqual(fam(MP.stagesOf(false, false)), [['calc', M.STAGES], ['prob', M.STAGES_F3E]]);
  const all = { stages: new Set(M.STAGES_ALL), levels: new Set(M.LEVELS), count: 2 };
  assert.deepEqual(MP.summary(all, MP.stagesOf(true, true)), { categories: 57, questions: 114 });
  // Al abrir, marcadas las de antes y sin marcar las 11 a 17 (su familia no se carga hasta marcar una).
  assert.deepEqual(MP.DEFAULT_STAGES, M.STAGES_ALL.filter((s) => !M.STAGES_F3E.includes(s)));
});

test('F3e T016 · series: las etapas que admiten, las de por defecto, la categoría y el resumen (ES y EN)', () => {
  for (const s of M.STAGES_ALL) assert.equal(MP.seriesOk(s), S.ADMITTED.includes(s), s);
  for (const s of ['immPred', 'detective', 'mcRead', 'mcDisc', 'mcRep']) assert.equal(MP.seriesOk(s), false, s);
  assert.deepEqual(MP.SERIES_DEFAULT, ['stmt', 'early', 'floats', 'tclMoments', 'tclPath', 'tclProb']);
  assert.equal(MP.seriesCategory('es', ['tclProb', 'stmt', 'early'], 'medium'), 'Series/0-1-13/Media');
  assert.equal(MP.seriesCategory('en', ['critPath', 'floats'], 'hard'), 'Series/3-4b/Hard');
  const txt = (lang, stages, level, count) => MP.seriesSummaryText(lang, { stages, level, count });
  assert.equal(txt('es', MP.SERIES_DEFAULT, 'medium', 10), 'Se generarán 10 series en la categoría Series/0-1-3-11-12-13/Media.');
  assert.equal(txt('es', ['early'], 'easy', 1), 'Se generará 1 serie en la categoría Series/1/Fácil.');
  assert.equal(txt('es', [], 'easy', 10), 'Elige al menos una etapa.');
  assert.equal(txt('en', MP.SERIES_DEFAULT, 'medium', 10), '10 series will be generated in the category Series/0-1-3-11-12-13/Medium.');
  assert.equal(txt('en', ['early'], 'easy', 1), '1 series will be generated in the category Series/1/Easy.');
  assert.equal(txt('en', [], 'easy', 10), 'Choose at least one stage.');
  // La categoría coincide con la del núcleo (sin la raíz «Redes de proyectos»).
  const IM = require('../js/i18n-moodle.js');
  const b = S.exercise(['early', 'floats'], 'easy', 3);
  const q = S.question(['early', 'floats'], b, { lang: 'es', nota: 'en', sf: false, labels: IM.labels('en') }, IM.tr('es'));
  assert.equal(q.category.slice(1).join('/'), MP.seriesCategory('es', ['floats', 'early'], 'easy'));
});

test('F3e T016 · una serie que se queda corta se nombra con sus etapas', () => {
  assert.equal(MP.missingText('es', [{ stage: 'series', stages: ['early', 'tclRoute'], level: 'hard', made: 3, wanted: 5 }]),
    'No se han encontrado bastantes ejemplares distintos para: Serie 1-14, Difícil (3 de 5).');
  assert.equal(MP.missingText('en', [{ stage: 'series', stages: ['stmt', 'succ'], level: 'easy', made: 0, wanted: 2 }]),
    'Not enough distinct instances were found for: Series 0-8, Easy (0 of 2).');
});
