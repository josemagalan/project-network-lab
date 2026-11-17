'use strict';
// Huella dorada de la F3 (spec f3e-probabilidad-montecarlo, AC12; plan §5 y T002; revisión de la F3d, N-F7). Fija, para
// semillas dadas, lo que ya está publicado: las tablas del generador de la F3a en los tres niveles, los enunciados de la
// F3c, los errores que siembra el detective de la F3d (con la semilla siguiente si hace falta) y el XML de las doce etapas
// del exportador (F3b, F3c y F3d) en español y en inglés. Las huellas se calcularon sobre 2a01c12, antes de la F3e: si una
// cambia, un enlace ya compartido o un banco ya importado dejaría de reproducirse con su semilla.
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const G = require('../js/core/generator.js');
const SG = require('../js/core/stmtgen.js');
const D = require('../js/core/detective.js');
const M = require('../js/core/moodle.js');
const IM = require('../js/i18n-moodle.js');
const NS = require('../js/views/net-svg.js');

const hashOf = (x) => crypto.createHash('sha256').update(typeof x === 'string' ? x : JSON.stringify(x)).digest('hex');
const SEEDS = [1, 17, 4321, 92846];
const HUELLA = {
  tables: '9f867f6fea1a1951a6f5425d8125339e01e11b6e7aa72e0aef6cdb309f423886',
  statements: '7190d9a12295655c063f3a16e3d88886b7f40f845b50c486450d7839200e183a',
  detective: 'a89c2e1b9d4d5cd2de6dc27cd43210cca1a81d4b95ab1a5dd3530220d274f39b',
  'moodle|es': 'b0e0cde9d0f9ebc5009ab4be0c0e53774cd72ac0495065999bb7ca4b1e20f892',
  'moodle|en': 'decdae6c49a95842b7c914e5b1573645ab7d2c9bcb11f97a6799f61371f630a9',
};

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
    const bank = M.generate({ lang, nota, sf: true, labels: IM.labels(nota), stages: M.STAGES_ALL, levels: M.LEVELS, count: 2, seed: 20261117, svg: NS.render }, IM.tr(lang));
    assert.equal(hashOf(M.toXml(bank, IM.tr(lang))), HUELLA[`moodle|${lang}`], lang);
  }
});
