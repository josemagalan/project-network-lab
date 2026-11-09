/*
 * predict — corrección del modo predicción (spec AC7). check(step, answers) compara cada valor del
 * paso con lo que dice core/cpm, redondeando ambos a 2 decimales con el MISMO redondeo con que la
 * pantalla los muestra (narrate.fmt), para no rechazar el número que se ve; acepta coma o punto decimal.
 * No calcula nada por su cuenta: la solución es la de la traza.
 * En los pasos de regla de la red PERT (F2a, AC8) se corrigen dos campos: las actividades a las que
 * se aplica la regla (RULE_ACTS, un conjunto que debe ser exactamente step.rule.acts; vacío si la
 * regla no se aplica) y el número de ficticias que crea (RULE_COUNT, un entero).
 * En los pasos de actividad del dibujo progresivo (F2b, AC8): de qué suceso sale (PROG_START, uno de PROG_STARTS)
 * y, si tiene varias precedentes, cuáles necesitan una ficticia de dependencia (PROG_DUMMIES, un conjunto).
 */
(function (root) {
  'use strict';

  // Igual que narrate.fmt, sin depender del idioma: Intl redondea sobre la representación decimal del número.
  const r2 = (x) => Number(x).toLocaleString('en-GB', { maximumFractionDigits: 2, useGrouping: false });

  function parseAnswer(v) {
    const s = String(v == null ? '' : v).trim().replace(',', '.');
    if (!s) return null;
    return /^-?(\d+\.?\d*|\.\d+)$/.test(s) ? Number(s) : NaN;
  }

  // Valores de actividad (A.ES) o de suceso de la red PERT (3.TE): ningún campo se repite entre los dos.
  const key = (rv) => `${rv.act != null ? rv.act : rv.event}.${rv.field}`;

  const RULE_ACTS = 'rule.acts';
  const RULE_COUNT = 'rule.count';
  const PROG_START = 'prog.start';
  const PROG_DUMMIES = 'prog.dummies';
  const PROG_STARTS = ['initial', 'pred', 'existing', 'new'];
  const byId = (a, b) => a.localeCompare(b, 'en', { numeric: true });

  // Qué precedentes marcadas sobran y cuáles faltan respecto a las que llevan ficticia de dependencia.
  function progDiff(step, answers) {
    const given = new Set(answers.get(PROG_DUMMIES) || []);
    const want = new Set(step.prog.preds.filter((x) => x.how === 'dummy').map((x) => x.act));
    return { missing: [...want].filter((a) => !given.has(a)).sort(byId), extra: [...given].filter((a) => !want.has(a)).sort(byId) };
  }

  // Qué actividades marcadas sobran y cuáles faltan respecto a la regla, ordenadas.
  function ruleDiff(step, answers) {
    const given = new Set(answers.get(RULE_ACTS) || []);
    const want = new Set(step.rule.acts);
    return { missing: [...want].filter((a) => !given.has(a)).sort(byId), extra: [...given].filter((a) => !want.has(a)).sort(byId) };
  }

  function check(step, answers) {
    const out = new Map();
    if (step.kind === 'progAct') {
      const st = answers.get(PROG_START);
      out.set(PROG_START, st == null || st === '' ? 'empty' : (st === step.prog.start ? 'ok' : 'wrong'));
      if (step.prog.preds.length > 1) {
        const d = progDiff(step, answers);
        out.set(PROG_DUMMIES, d.missing.length || d.extra.length ? 'wrong' : 'ok');
      }
      return out;
    }
    if (step.rule) {
      const d = ruleDiff(step, answers);
      out.set(RULE_ACTS, d.missing.length || d.extra.length ? 'wrong' : 'ok');
      const c = parseAnswer(answers.get(RULE_COUNT));
      out.set(RULE_COUNT, c === null ? 'empty' : (c === step.rule.dummies.length ? 'ok' : 'wrong'));
    }
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

  const hasPrediction = (step) => !!step && (step.kind === 'progAct' || !!step.rule || (!!step.reveals && step.reveals.length > 0));

  const api = { check, summary, key, parseAnswer, hasPrediction, ruleDiff, progDiff, RULE_ACTS, RULE_COUNT, PROG_START, PROG_DUMMIES, PROG_STARTS };
  root.PNL = root.PNL || {};
  root.PNL.predict = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
