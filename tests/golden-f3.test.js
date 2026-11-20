'use strict';
// Huella dorada de la F3 (spec f3e-probabilidad-montecarlo, AC12; plan §5 y T002; revisión de la F3d, N-F7). Fija, para
// semillas dadas, lo que ya está publicado: las tablas del generador de la F3a en los tres niveles, los enunciados de la
// F3c, los errores que siembra el detective de la F3d (con la semilla siguiente si hace falta) y el XML de las doce etapas
// del exportador (F3b, F3c y F3d) en español y en inglés. Las huellas se calcularon sobre 2a01c12, antes de la F3e: si una
// cambia, un enlace ya compartido o un banco ya importado dejaría de reproducirse con su semilla.
// F3f (T002): se añade lo de la F3e, calculado sobre 84fe163 (antes de la F3f): los ejercicios de core/probgen (TCL con
// y sin la otra ruta, «Leer», discretas y réplicas), el XML de las etapas 11 a 17 y el de tres series. El examen de la
// F3f los usa tal como están.
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const G = require('../js/core/generator.js');
const SG = require('../js/core/stmtgen.js');
const D = require('../js/core/detective.js');
const M = require('../js/core/moodle.js');
const IM = require('../js/i18n-moodle.js');
const NS = require('../js/views/net-svg.js');
const PG = require('../js/core/probgen.js');
const SR = require('../js/core/series.js');
const CS = require('../js/views/chart-svg.js');

const hashOf = (x) => crypto.createHash('sha256').update(typeof x === 'string' ? x : JSON.stringify(x)).digest('hex');
const SEEDS = [1, 17, 4321, 92846];
const HUELLA = {
  tables: '9f867f6fea1a1951a6f5425d8125339e01e11b6e7aa72e0aef6cdb309f423886',
  statements: '7190d9a12295655c063f3a16e3d88886b7f40f845b50c486450d7839200e183a',
  detective: 'a89c2e1b9d4d5cd2de6dc27cd43210cca1a81d4b95ab1a5dd3530220d274f39b',
  'moodle|es': 'b0e0cde9d0f9ebc5009ab4be0c0e53774cd72ac0495065999bb7ca4b1e20f892',
  'moodle|en': 'decdae6c49a95842b7c914e5b1573645ab7d2c9bcb11f97a6799f61371f630a9',
  probgen: 'bb9eb14b58d91a133531f45fd979e8899ea9828878ab6f93525b71d26cfc64b6',
  'stoch|es': 'a8a06ec1b5b55f09cad56887a7d380903fa12b355694a8e908a5f1c3b123c19f',
  'stoch|en': '56b938083c3f742572dec683a617396ac6905727b3738876f009ce61f9259f69',
  'series|es': '98d1866bae19bd77affde583a14aa37ab7fbda250d791747b914dbfc3ed9877d',
  'series|en': 'fdf5824668f11ba886f1cf53ed3f091c1d9e90327746b4870d84e3a346f34eff',
};
const chart = (m) => (m.kind === 'dist' ? CS.dist(m) : CS.indices(m));

test('huella dorada · tablas del generador (F3a), cuatro semillas por nivel', () => {
  assert.equal(hashOf(M.LEVELS.map((lv) => SEEDS.map((sd) => G.generate(sd, G.LEVELS[lv]).rows))), HUELLA.tables);
});

test('huella dorada · enunciados al azar (F3c)', () => {
  assert.equal(hashOf(M.LEVELS.map((lv) => SEEDS.map((sd) => SG.make(sd, lv)))), HUELLA.statements);
});

test('huella dorada · errores sembrados del detective (F3d), red ROY y PERT, de red, de cálculo y todos', () => {
  const all = M.LEVELS.map((lv) => SEEDS.map((sd) => ['aon', 'aoa'].map((graph) => ['net', 'calc', 'all'].map((kind) => {
    const r = D.forSeed(G.LEVELS[lv], sd, { graph, kind, level: lv });
    return r && { sd: r.sd, errors: r.seeded.errors };
  }))));
  assert.equal(hashOf(all), HUELLA.detective);
});

test('huella dorada · XML de las doce etapas del exportador (F3b, F3c y F3d), en español y en inglés', () => {
  for (const [lang, nota] of [['es', 'es'], ['en', 'en']]) {
    // Las doce de antes de la F3e (STAGES_ALL crece por el final: F3e, T014).
    const stages = M.STAGES_ALL.slice(0, M.STAGES_ALL.indexOf('detective') + 1);
    assert.equal(stages.length, 12);
    const bank = M.generate({ lang, nota, sf: true, labels: IM.labels(nota), stages, levels: M.LEVELS, count: 2, seed: 20261117, svg: NS.render }, IM.tr(lang));
    assert.equal(hashOf(M.toXml(bank, IM.tr(lang))), HUELLA[`moodle|${lang}`], lang);
  }
});

test('huella dorada · ejercicios de probabilidad y Montecarlo (F3e): TCL con y sin la otra ruta, «Leer», discretas y réplicas', () => {
  const all = M.LEVELS.map((lv) => SEEDS.map((sd) => [['tcl', {}], ['tcl', { route: true }], ['read', {}], ['disc', {}], ['rep', {}]]
    .map(([kind, opts]) => { const c = PG.candidate(kind, sd, lv, opts); return c.ok ? { ex: c.ex } : { reason: c.reason }; })));
  assert.equal(hashOf(all), HUELLA.probgen);
});

test('huella dorada · XML de las etapas 11 a 17 (F3e), en español y en inglés', () => {
  for (const [lang, nota] of [['es', 'en'], ['en', 'es']]) {
    const bank = M.generate({ lang, nota, sf: false, labels: IM.labels(nota), stages: M.STAGES_F3E, levels: M.LEVELS, count: 1, seed: 20261120, svg: NS.render, chart }, IM.tr(lang));
    assert.equal(hashOf(M.toXml(bank, IM.tr(lang))), HUELLA[`stoch|${lang}`], lang);
  }
});

test('huella dorada · XML de tres series encadenadas (F3e), en español y en inglés', () => {
  const SERIES = [[['stmt', 'early', 'floats', 'tclMoments', 'tclPath', 'tclProb'], 'medium'], [SR.TCL, 'hard'],
    [['early', 'late', 'floats', 'critAct', 'critPath', 'evEarly', 'evLate', 'minDummy'], 'easy']];
  for (const [lang, nota] of [['es', 'en'], ['en', 'es']]) {
    const xml = SERIES.map(([stages, level]) => M.toXml(SR.generate({ lang, nota, sf: false, labels: IM.labels(nota), stages, level, count: 1, seed: 20261120 }, IM.tr(lang)), IM.tr(lang)));
    assert.equal(hashOf(xml), HUELLA[`series|${lang}`], lang);
  }
});
