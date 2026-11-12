'use strict';
// core/contexts (F3c, T002): los catálogos de los cuatro contextos del generador de enunciados (spec f3c-enunciados,
// plan P1 y P3). Cada actividad lleva su etapa del proceso, el infinitivo ES, el infinitivo EN y el gerundio EN.
const test = require('node:test');
const assert = require('node:assert/strict');
const X = require('../js/core/contexts.js');

const KEYS = ['home', 'product', 'congress', 'lab'];
const STAGES = [1, 2, 3, 4, 5, 6];
const filled = (o) => o && typeof o.es === 'string' && typeof o.en === 'string' && o.es.trim() && o.en.trim() && o.es !== o.en;

test('hay cuatro contextos, en este orden, con título, entradilla, unidad y recurso en ES y EN', () => {
  assert.deepEqual(Object.keys(X.CONTEXTS), KEYS);
  assert.deepEqual(X.KEYS, KEYS);
  for (const k of KEYS) {
    const c = X.CONTEXTS[k];
    for (const f of ['title', 'intro', 'resource']) assert.ok(filled(c[f]), `${k}.${f}`);
    assert.ok(filled(c.unit.one) && filled(c.unit.many), `${k}.unit`);
  }
});

test('cada catálogo tiene al menos 18 actividades y al menos tres en cada una de las seis etapas', () => {
  for (const k of KEYS) {
    const acts = X.CONTEXTS[k].acts;
    assert.ok(acts.length >= 18, `${k}: ${acts.length}`);
    for (const s of STAGES) assert.ok(acts.filter((a) => a[0] === s).length >= 3, `${k}, etapa ${s}`);
    assert.ok(acts.every((a) => STAGES.includes(a[0])), `${k}: etapa fuera de 1–6`);
  }
});

test('cada actividad tiene sus cuatro campos bien formados y no se repite', () => {
  for (const k of KEYS) {
    const acts = X.CONTEXTS[k].acts;
    for (const [stage, es, en, ger] of acts) {
      const where = `${k}: ${es}`;
      assert.equal(typeof stage, 'number', where);
      for (const s of [es, en, ger]) {
        assert.equal(typeof s, 'string', where);
        assert.equal(s, s.trim(), where);
        assert.match(s, /^[a-záéíóúñ]/, `${where}: en minúscula (el generador pone la mayúscula)`);
        assert.doesNotMatch(s, /[{}#~/"\\.;:]/, `${where}: sin caracteres reservados del cloze ni puntuación`);
      }
      assert.match(es.split(' ')[0], /(ar|er|ir)$/, `${where}: empieza por un infinitivo`);
      assert.doesNotMatch(en, /^to /, `${where}: infinitivo inglés sin «to»`);
      assert.match(ger.split(' ')[0], /ing$/, `${where}: gerundio`);
      assert.deepEqual(ger.split(' ').slice(1), en.split(' ').slice(1), `${where}: el gerundio solo cambia el verbo`);
    }
    for (const i of [1, 2, 3]) {
      const col = acts.map((a) => a[i]);
      assert.equal(new Set(col).size, col.length, `${k}: repetidos en la columna ${i}`);
    }
  }
});

// ── T003: formas de frase ─────────────────────────────────────────────────────────────────────────────────────
const F = () => X.FORMS;
const A1 = { es: 'cambiar las tuberías', en: 'replace the pipes', g: 'replacing the pipes' };
const A2 = { es: 'instalar la calefacción', en: 'install the heating', g: 'installing the heating' };
const A3 = { es: 'pintar las paredes', en: 'paint the walls', g: 'painting the walls' };

test('list une en ES y EN, con «e» ante i- e hi- (no ante hie-)', () => {
  assert.equal(X.list(['A'], 'es'), 'A');
  assert.equal(X.list(['A', 'B'], 'es'), 'A y B');
  assert.equal(X.list(['A', 'B', 'C'], 'en'), 'A, B and C');
  assert.equal(X.list(['C', 'I'], 'es'), 'C e I');
  assert.equal(X.list(['pintar', 'instalar'], 'es'), 'pintar e instalar');
  assert.equal(X.list(['pintar', 'hilar'], 'es'), 'pintar e hilar');
  assert.equal(X.list(['pintar', 'hierro'], 'es'), 'pintar y hierro');
});

test('las frases con letras concuerdan en número y dicen lo mismo en ES y EN', () => {
  const b = F().back;
  assert.equal(b.length, 3);
  assert.equal(b[0].es('C', ['A']), 'C empieza cuando termina A');
  assert.equal(b[0].es('D', ['B', 'C']), 'D empieza cuando terminan B y C');
  assert.equal(b[0].en('D', ['B', 'C']), 'D starts when B and C finish');
  assert.equal(b[1].en('C', ['A']), 'C cannot start until A has finished');
  assert.equal(b[2].es('D', ['B', 'I']), 'D necesita que antes terminen B e I');
  const f = F().fwd;
  assert.equal(f.length, 3);
  assert.equal(f[0].es('A', ['B']), 'Cuando termina A, puede empezar B');
  assert.equal(f[0].es('A', ['B', 'C']), 'Cuando termina A, pueden empezar B y C');
  assert.equal(f[1].en('A', ['B']), 'A must finish before B starts');
  assert.equal(f[2].en('A', ['B', 'C']), 'B and C come after A');
  assert.equal(F().par.es('C', 'I'), 'C e I pueden hacerse a la vez');
  assert.match(F().par.why.en('C', 'G'), /C and G/);
});

test('las frases en prosa usan el infinitivo en ES y el gerundio o el infinitivo en EN', () => {
  const pb = F().pBack;
  assert.equal(pb[0].es([A1, A2]), 'Cuando terminen de cambiar las tuberías y de instalar la calefacción');
  assert.equal(pb[0].en([A1, A2]), 'Once they have finished replacing the pipes and installing the heating');
  assert.ok(pb.every((x) => x.joinEs.startsWith(', ') && x.joinEn.startsWith(', ')));
  const pf = F().pFwd;
  assert.equal(pf[0].es(A1, [A2, A3]), 'En cuanto terminen de cambiar las tuberías, ya se puede instalar la calefacción y pintar las paredes');
  assert.equal(pf[1].en(A1, [A2, A3]), 'Before installing the heating and painting the walls, they have to replace the pipes');
  assert.equal(F().parProse.es(A3, A2), 'Se puede pintar las paredes e instalar la calefacción a la vez');
  assert.equal(F().parProse.en(A1, A2), 'Replacing the pipes and installing the heating can go on at the same time');
  assert.equal(F().res.es(A1, A2, 'el mismo técnico'), 'Para cambiar las tuberías e instalar la calefacción hace falta el mismo técnico, pero se organizan sin problema');
  assert.equal(F().red.en(A1, A3), 'Nobody can start painting the walls until they have finished replacing the pipes');
  assert.equal(F().red.why.es([A1, A2, A3]), 'Ya lo implica el camino: cambiar las tuberías → instalar la calefacción → pintar las paredes.');
  assert.equal(F().day1.es([A1, A2]), 'Desde el primer día se puede cambiar las tuberías e instalar la calefacción');
});

test('todas las formas existen en ES y EN y dan texto sin huecos', () => {
  const fx = F();
  const outs = [];
  for (const k of ['back', 'fwd']) for (const f of fx[k]) for (const L of ['es', 'en']) outs.push(f[L]('D', ['A', 'B']), f[L]('D', ['A']));
  for (const f of fx.pBack) for (const L of ['es', 'en']) outs.push(f[L]([A1]), f[L]([A1, A2, A3]));
  for (const f of fx.pFwd) for (const L of ['es', 'en']) outs.push(f[L](A1, [A2]), f[L](A1, [A2, A3]));
  for (const k of ['parProse', 'res', 'red']) for (const L of ['es', 'en']) outs.push(fx[k][L](A1, A2, 'r'));
  for (const L of ['es', 'en']) {
    outs.push(fx.par[L]('A', 'B'), fx.par.why[L]('A', 'B'), fx.day1[L]([A1, A2]), fx.red.why[L]([A1, A2, A3]));
    for (const k of ['parProse', 'res', 'day1']) outs.push(fx[k].why[L]);
    outs.push(fx.start[L], fx.end.lead[L], fx.end.frag[L]);
  }
  assert.ok(fx.plain.length >= 2 && fx.plain.every((p) => p.length === 2 && p.every((s) => s.endsWith(' '))));
  for (const s of outs) {
    assert.equal(typeof s, 'string');
    assert.ok(s.trim().length > 3, s);
    assert.doesNotMatch(s, /undefined|NaN|\[object|\s{2}/, s);
  }
});
