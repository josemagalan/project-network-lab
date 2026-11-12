'use strict';
// moodle-page: la parte sin DOM de la vista del exportador (spec f3b-moodle; plan §4; T009).
const test = require('node:test');
const assert = require('node:assert/strict');
const MP = require('../js/moodle-page.js');
const M = require('../js/core/moodle.js');

test('resumen: preguntas y categorías de una selección', () => {
  const sel = { stages: new Set(M.STAGES), levels: new Set(['medium']), count: 10 };
  assert.deepEqual(MP.summary(sel), { categories: 7, questions: 70 });
  assert.deepEqual(MP.summary({ stages: new Set(['early', 'evLate']), levels: new Set(['easy', 'hard']), count: 50 }), { categories: 4, questions: 200 });
  assert.deepEqual(MP.summary({ stages: new Set(), levels: new Set(['easy']), count: 10 }), { categories: 0, questions: 0 });
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
  const s = (stages, levels, count) => MP.summaryText('es', MP.summary({ stages: new Set(stages), levels: new Set(levels), count }));
  assert.equal(s(M.STAGES, ['medium'], 10), 'Se generarán 70 preguntas en 7 categorías.');
  assert.equal(s(['floats'], ['hard'], 7), 'Se generarán 7 preguntas en una categoría.');
  assert.equal(s(['floats'], ['hard'], 1), 'Se generará 1 pregunta en una categoría.');
  assert.equal(s([], ['hard'], 1), 'Elige al menos una etapa y un nivel.');
  assert.equal(MP.summaryText('en', MP.summary({ stages: new Set(['early']), levels: new Set(['easy']), count: 3 })), '3 questions will be generated in one category.');
});

// F3c (T011; plan §4, P6): la etapa «0 · Enunciado → tabla» va la primera en la interfaz y solo cuando está publicada.
test('etapas que ofrece el exportador: sin publicar, las siete de la F3b; publicada, la 0 la primera', () => {
  assert.deepEqual(MP.stagesOf(false), M.STAGES);
  assert.deepEqual(MP.stagesOf(true), ['stmt', ...M.STAGES]);
  assert.equal(MP.stmtPublic, false, 'oculta hasta la publicación (T013)');
});

test('resumen con la etapa 0: cuenta solo las etapas que se ofrecen', () => {
  const sel = { stages: new Set(M.STAGES_ALL), levels: new Set(['medium']), count: 10 };
  assert.deepEqual(MP.summary(sel), { categories: 8, questions: 80 });
  assert.deepEqual(MP.summary(sel, MP.stagesOf(false)), { categories: 7, questions: 70 });
  assert.deepEqual(MP.summary(sel, MP.stagesOf(true)), { categories: 8, questions: 80 });
});
