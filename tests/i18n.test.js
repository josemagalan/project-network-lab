'use strict';
// i18n: todo texto visible en ES y EN (AC9) y las dos notaciones exactas (AC10).
const test = require('node:test');
const assert = require('node:assert/strict');
const I = require('../js/i18n.js');
// F3b: el catálogo del banco de Moodle se carga aparte (plan P5) y entra en las mismas comprobaciones.
require('../js/i18n-moodle.js');
// F4a: los textos de «Duraciones inciertas» también se cargan aparte (plan P3).
require('../js/i18n-unc.js');

const keysDeep = (o, prefix = '') => Object.entries(o).flatMap(([k, v]) =>
  (v && typeof v === 'object' && !Array.isArray(v) ? keysDeep(v, prefix + k + '.') : [prefix + k])).sort();

test('AC9: los catálogos ES y EN tienen exactamente las mismas claves, también las anidadas', () => {
  assert.deepEqual(keysDeep(I.dict.es), keysDeep(I.dict.en));
});

test('AC9: ninguna cadena está vacía ni se queda sin traducir por error', () => {
  const flat = (o) => keysDeep(o).map((k) => k.split('.').reduce((a, p) => a[p], o));
  for (const lang of I.languages) for (const v of flat(I.dict[lang])) assert.ok(String(v).trim(), `${lang}: cadena vacía`);
  const same = keysDeep(I.dict.es).filter((k) => {
    const g = (o) => k.split('.').reduce((a, p) => a[p], o);
    return g(I.dict.es) === g(I.dict.en) && /[a-záéíóúñ]{4,}/i.test(g(I.dict.es));
  });
  assert.deepEqual(same.filter((k) => !I.SAME_IN_BOTH.includes(k)), [], 'cadenas idénticas en ES y EN');
});

test('AC10: notación anglosajona y española con las etiquetas exactas', () => {
  assert.deepEqual(I.notation('en'), { ES: 'ES', EF: 'EF', LS: 'LS', LF: 'LF', TF: 'TF', FF: 'FF', IF: 'IF', SF: 'SF' });
  assert.deepEqual(I.notation('es'), { ES: 'tᵢ', EF: 'fᵢ', LS: 'tᵢ*', LF: 'fᵢ*', TF: 'HT', FF: 'HL', IF: 'HI', SF: 'HS' });
});

test('cada código de error y aviso del núcleo tiene su mensaje en los dos idiomas', () => {
  for (const code of ['cycle', 'unknownRef', 'duplicateId', 'badDuration', 'badId', 'reservedId', 'tooMany', 'redundant']) {
    for (const lang of I.languages) assert.ok(I.dict[lang].issue[code], `${lang}.issue.${code}`);
  }
});

test('cada tipo de paso de la traza tiene título y narración en los dos idiomas', () => {
  for (const kind of ['table', 'build', 'forward', 'forwardFirst', 'forwardEnd', 'backward', 'backwardEnd', 'backwardLast', 'critical', 'gantt']) {
    for (const lang of I.languages) assert.ok(I.dict[lang].narr[kind], `${lang}.narr.${kind}`);
  }
  for (const f of ['TF', 'FF', 'IF', 'SF']) for (const lang of I.languages) assert.ok(I.dict[lang].floatNarr[f], `${lang}.floatNarr.${f}`);
});

test('t() sustituye parámetros y list() une con «y» o «and»', () => {
  assert.equal(I.t('es', 'player.counter', { i: 7, n: 32 }), 'Paso 7 de 32');
  assert.equal(I.t('en', 'player.counter', { i: 7, n: 32 }), 'Step 7 of 32');
  assert.equal(I.list('es', ['A', 'B', 'C']), 'A, B y C');
  assert.equal(I.list('en', ['A', 'B']), 'A and B');
  assert.equal(I.list('en', ['A']), 'A');
});

test('el resumen de la predicción concuerda en número con una sola correcta', () => {
  assert.equal(I.t('es', 'predict.summaryOne', { ok: 1, wrong: 2, empty: 0 }), '1 correcta · 2 por revisar · 0 sin rellenar');
  assert.equal(I.t('es', 'predict.summary', { ok: 2, wrong: 1, empty: 0 }), '2 correctas · 1 por revisar · 0 sin rellenar');
  assert.equal(I.t('en', 'predict.summaryOne', { ok: 1, wrong: 2, empty: 0 }), '1 correct · 2 to review · 0 left');
});

test('una clave inexistente devuelve la propia clave (visible en las pruebas) y no rompe', () => {
  assert.equal(I.t('es', 'no.existe'), 'no.existe');
});

test('F2a: cada tipo de paso PERT tiene título y narración en los dos idiomas', () => {
  for (const lang of I.languages) {
    for (const k of ['succTable', 'ruleEqual', 'ruleContained', 'ruleShared', 'place', 'number', 'eventForward', 'eventBackward', 'eventSlack', 'floats']) {
      assert.ok(I.dict[lang].pertSteps[k], `${lang}.pertSteps.${k}`);
    }
    for (const k of ['succTable', 'ruleEqual', 'ruleEqualNone', 'ruleContained', 'ruleContainedNone', 'ruleShared', 'ruleSharedNone', 'place', 'number', 'numberEnd',
      'eventFirst', 'eventForward', 'eventForwardOne', 'eventForwardEnd', 'eventBackwardEnd', 'eventBackward', 'eventBackwardOne', 'eventSlack', 'floats',
      'ruleEqualHidden', 'ruleContainedHidden', 'ruleSharedHidden']) {
      assert.ok(I.dict[lang].pertNarr[k], `${lang}.pertNarr.${k}`);
    }
    for (const k of ['ruleActs', 'ruleCount', 'missing', 'extra']) assert.ok(I.dict[lang].predict[k], `${lang}.predict.${k}`);
    for (const k of ['side', 'sideHint', 'dummiesN', 'dummiesOne', 'dummiesNone']) assert.ok(I.dict[lang].view[k], `${lang}.view.${k}`);
    for (const k of ['dummy', 'dummyOne', 'dummyEqual', 'act', 'actUnnumbered', 'clear', 'label']) assert.ok(I.dict[lang].sel[k], `${lang}.sel.${k}`);
    assert.ok(I.dict[lang].app.structureOnlyWarning, `${lang}.app.structureOnlyWarning`);
    assert.ok(I.dict[lang].view.graphAon && I.dict[lang].view.graphAoa, `${lang}.view.graph*`);
  }
});

test('F2b (T016): nombres y tipos de cada método, estados de tarjeta, diagnóstico y reglas nuevas en los dos idiomas', () => {
  const METHODS = require('../js/core/compare.js').METHODS;
  const CODES = ['unknownAct', 'duplicateArc', 'missingArc', 'incompleteArc', 'parallel', 'looseEvent', 'start', 'end', 'cycle',
    'falsePrecedence', 'missingPrecedence', 'unnumbered', 'order', 'unnecessaryDummy'];
  for (const lang of I.languages) {
    const d = I.dict[lang];
    for (const m of METHODS) {
      assert.ok(d.cmp.names[m], `${lang}.cmp.names.${m}`);
      assert.ok(d.cmp.kinds[m], `${lang}.cmp.kinds.${m}`);
    }
    for (const k of ['correct', 'incorrect', 'atMin', 'atBest', 'above', 'aboveBest', 'pending', 'structural', 'removableOne', 'removableN',
      'model', 'approx', 'stepByStep', 'pair', 'minExact', 'minExactOne', 'minNone', 'minRange', 'minRangeFrom', 'minPending']) {
      assert.ok(d.cmp[k], `${lang}.cmp.${k}`);
    }
    for (const c of CODES) assert.ok(d.diag[c], `${lang}.diag.${c}`);
    for (const r of ['dependency', 'uniqueness']) assert.ok(d.pert.rule[r], `${lang}.pert.rule.${r}`);
    for (const k of ['removableDelete', 'removableMerge', 'dummyUnique']) assert.ok(d.sel[k], `${lang}.sel.${k}`);
  }
  assert.equal(I.dict.es.cmp.names.cgl, 'Corneil, Gotlieb y Lee (1973)');
  assert.equal(I.dict.en.cmp.names.rules, 'Set rules');
});

test('F2c (T015): textos de practicar en M0 en los dos idiomas: barra, texto, subrayado, tabla, matriz, validación y corrección', () => {
  const need = {
    m0: ['region', 'statement', 'tableView', 'list', 'matrixView', 'underline', 'check', 'text', 'textUnderline', 'source', 'table', 'nActs', 'nActsOne',
      'validation', 'correction', 'langMoved', 'langMovedOne'],
    'm0.kinds': ['activity', 'duration', 'precedence', 'none'],
    'm0.ul': ['hint', 'pickEnd', 'title', 'titleEdit', 'kind', 'actId', 'actName', 'fromText', 'durAct', 'durValue', 'linkExisting', 'noEdges', 'addEdge',
      'from', 'to', 'add', 'declare', 'declNone', 'declStart', 'declEnd', 'noneNote', 'ok', 'save', 'remove', 'cancel', 'badId', 'badValue', 'pickAct', 'region'],
    'm0.marks': ['title', 'none', 'edit', 'remove', 'activity', 'duration', 'precedence', 'precedenceNone', 'declStart', 'declEnd', 'noPrec', 'first', 'last'],
    'm0.val': ['empty', 'ok', 'cycle', 'cycleEdge', 'cycleEdgeFrom', 'redundant', 'redundantFrom', 'redundantNote', 'ends', 'checkNote', 'declStartPreds',
      'declStartOthers', 'declEndSuccs', 'declEndOthers', 'markedMissing'],
    'm0.diag': ['ok', 'errors', 'errorsOne', 'warnings', 'warningsOne', 'missingActivity', 'extraActivity', 'duration', 'inverted', 'missingPrecedence',
      'falsePrecedence', 'cycle', 'invalid', 'redundant', 'fromFrag', 'fromMark', 'corresponds', 'corrMark', 'noRef'],
    'm0.open': ['label', 'm1', 'm2', 'work', 'show', 'hide', 'disabled', 'noM1', 'caption'],
    'm0.matrix': ['caption', 'corner', 'red', 'cycle', 'path', 'empty', 'region'],
  };
  for (const lang of I.languages) {
    for (const [group, keys] of Object.entries(need)) {
      const g = group.split('.').reduce((o, k) => (o ? o[k] : o), I.dict[lang]);
      assert.ok(g, `${lang}.${group}`);
      for (const k of keys) assert.ok(g[k], `${lang}.${group}.${k}`);
    }
    assert.ok(I.dict[lang].app.urlTooLong, `${lang}.app.urlTooLong`);
  }
  assert.equal(I.t('es', 'm0.nActs', { n: 11 }), '11 actividades');
  assert.equal(I.t('en', 'm0.nActs', { n: 11 }), '11 activities');
});

test('F2c (T017): textos de la ruta paso a paso de M0 en los dos idiomas', () => {
  for (const lang of I.languages) {
    const d = I.dict[lang];
    for (const k of ['modes', 'practice', 'route', 'learn']) assert.ok(d.m0[k], `${lang}.m0.${k}`);
    for (const k of ['question', 'none', 'redundant', 'add', 'from', 'to', 'tableTitle', 'cleanTitle', 'missing', 'extra', 'empty']) assert.ok(d.m0.rt[k], `${lang}.m0.rt.${k}`);
    for (const k of ['text', 'activity', 'duration', 'precedence', 'none', 'start', 'end', 'clean']) assert.ok(d.m0Steps[k], `${lang}.m0Steps.${k}`);
    for (const k of ['text', 'hidden', 'activity', 'activityGives', 'duration', 'gives', 'redundantOne', 'redundantSome', 'none', 'clean', 'cleanSame', 'learnTitle']) assert.ok(d.m0Narr[k], `${lang}.m0Narr.${k}`);
  }
});

test('F2c T020: la pestaña de M0 y la entrada desde el taller, en los dos idiomas', () => {
  assert.equal(I.t('es', 'nav.m0'), 'Del enunciado a la tabla');
  assert.equal(I.t('en', 'nav.m0'), 'From statement to table');
  assert.equal(I.t('es', 'work.toM0'), 'Practicar desde un enunciado (M0)');
  assert.equal(I.t('en', 'work.toM0'), 'Practise from a statement (M0)');
});

test('F3a (T010): textos de «Ejercicios» en los dos idiomas: barra, «Personalizar», tablas, marcas, nota, explicaciones y avisos', () => {
  const need = {
    ex: ['region', 'level', 'seed', 'another', 'mode', 'practice', 'exam', 'ask', 'given', 'preds', 'succs', 'act', 'd', 'roy', 'pert', 'fold', 'unfold',
      'royAlt', 'arcLink', 'netLink', 'answers', 'tabActs', 'tabEvents', 'event', 'TE', 'TL', 'slack', 'projectDur', 'crit', 'paths', 'pathsHelp', 'addPath',
      'removePath', 'pathN', 'check', 'deliver', 'step', 'confirm', 'confirmYes', 'confirmNo', 'examNote', 'delivered', 'stale', 'enterHint', 'score',
      'lose', 'loseYes', 'loseNo', 'oldVersion', 'max', 'min', 'notFound', 'tableCaption', 'eventsCaption', 'legend'],
    'ex.levels': ['easy', 'medium', 'hard', 'custom'],
    'ex.asks': ['times', 'events', 'floats', 'sf', 'critical'],
    'ex.sum': ['acts', 'actsOne', 'pred', 'dummies', 'dummiesOne', 'dummiesFree', 'crit', 'critOne', 'critN', 'dmax'],
    'ex.st': ['ok', 'carried', 'wrong', 'blank', 'invalid'],
    'ex.cnt': ['wrong', 'wrongOne', 'carried', 'carriedOne', 'blank', 'blankOne', 'invalid', 'invalidOne'],
    'ex.lab': ['act', 'dur', 'TE', 'TL', 'slack'],
    'ex.explain': ['wrong', 'carried', 'origin', 'blank', 'invalid', 'critCarried', 'critMarked', 'critUnmarked', 'pathOk', 'pathCarried', 'pathRepeat',
      'pathInvalid', 'pathNotDirect', 'pathNotStart', 'pathNotEnd', 'pathLength'],
    'ex.custom': ['region', 'acts', 'pred', 'dummies', 'crit', 'dmax', 'from', 'to', 'hintActs', 'hintPred', 'hintDummies', 'hintCrit', 'hintDmax', 'generate',
      'back', 'range', 'dummiesNoExact', 'dummiesTooMany'],
    'ex.worst': ['critical', 'dummies', 'exact'],
    'ex.advice': ['critical', 'dummies', 'exact'],
  };
  for (const lang of I.languages) {
    for (const [group, keys] of Object.entries(need)) {
      const g = group.split('.').reduce((o, k) => (o ? o[k] : o), I.dict[lang]);
      assert.ok(g, `${lang}.${group}`);
      for (const k of keys) assert.ok(g[k], `${lang}.${group}.${k}`);
    }
  }
  // Nombres visibles aprobados en clarify (2026-11-10).
  assert.equal(I.t('es', 'nav.ex'), 'Ejercicios'); assert.equal(I.t('en', 'nav.ex'), 'Exercises');
  assert.equal(I.t('es', 'ex.practice'), 'Practicar'); assert.equal(I.t('en', 'ex.practice'), 'Practice');
  assert.equal(I.t('es', 'ex.exam'), 'Examen'); assert.equal(I.t('en', 'ex.exam'), 'Exam');
});

test('F3a (T012): «Tabla al azar» del taller, con su selector de nivel, en los dos idiomas', () => {
  for (const lang of I.languages) for (const k of ['random', 'randomLevel', 'randomNotice', 'randomGroup']) assert.ok(I.dict[lang].work[k], `${lang}.work.${k}`);
  for (const lang of I.languages) for (const k of ['easy', 'medium', 'hard']) assert.ok(I.dict[lang].work.levelName[k], `${lang}.work.levelName.${k}`);
  assert.equal(I.t('es', 'work.random'), 'Tabla al azar');
  assert.equal(I.t('en', 'work.random'), 'Random table');
});

test('F3b: el catálogo del banco de Moodle está en los dos idiomas y se fusiona en mq', () => {
  const IM = require('../js/i18n-moodle.js');
  for (const lang of I.languages) {
    assert.ok(I.dict[lang].mq && I.dict[lang].mq.stage.critPath, `${lang}.mq`);
    assert.equal(IM.tr(lang)('stage.early'), I.dict[lang].mq.stage.early);
  }
  assert.equal(IM.tr('es')('stem.late', { dur: 13 }).includes('13'), true);
  assert.deepEqual(IM.labels('es'), Object.assign(I.notation('es'), I.eventNotation('es')));
});

test('F4a: los textos de «Duraciones inciertas» están en los dos idiomas, con los mismos parámetros', () => {
  const IU = require('../js/i18n-unc.js');
  const params = (v) => (String(v).match(/\{\w+\}/g) || []).sort();
  const get = (o, k) => k.split('.').reduce((a, p) => a[p], o);
  assert.deepEqual(keysDeep(IU.es), keysDeep(IU.en));
  for (const k of keysDeep(IU.es)) assert.deepEqual(params(get(IU.es, k)), params(get(IU.en, k)), `unc.${k}`);
  for (const lang of I.languages) assert.equal(I.dict[lang].unc, IU[lang]);
  assert.equal(I.t('es', 'nav.unc'), 'Duraciones inciertas');
  assert.equal(I.t('en', 'nav.unc'), 'Uncertain durations');
  // Los errores de la tabla propia (a, m y b) tienen su mensaje; los de estructura reutilizan issue.* del taller.
  for (const code of ['missing', 'badNum', 'tooBig', 'aGtM', 'mGtB']) for (const lang of I.languages) assert.ok(I.dict[lang].unc.issue[code]);
});
