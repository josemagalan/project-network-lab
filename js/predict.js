/*
 * predict — corrección del modo predicción (spec AC7). check(step, answers) compara cada valor del
 * paso con lo que dice core/cpm, redondeando ambos a 2 decimales; acepta coma o punto decimal.
 * No calcula nada por su cuenta: la solución es la de la traza.
 */
(function (root) {
  'use strict';

  const r2 = (x) => Math.round(x * 100) / 100;

  function parseAnswer(v) {
    const s = String(v == null ? '' : v).trim().replace(',', '.');
    if (!s) return null;
    return /^-?\d+(\.\d+)?$/.test(s) ? Number(s) : NaN;
  }

  const key = (rv) => `${rv.act}.${rv.field}`;

  function check(step, answers) {
    const out = new Map();
    for (const rv of step.reveals) {
      const a = parseAnswer(answers.get(key(rv)));
      out.set(key(rv), a === null ? 'empty' : (Number.isFinite(a) && r2(a) === r2(rv.value) ? 'ok' : 'wrong'));
    }
    return out;
  }

  function summary(result) {
    const c = { ok: 0, wrong: 0, empty: 0 };
    for (const v of result.values()) c[v]++;
    return c;
  }

  const hasPrediction = (step) => step && step.reveals && step.reveals.length > 0;

  const api = { check, summary, key, parseAnswer, hasPrediction };
  root.PNL = root.PNL || {};
  root.PNL.predict = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
