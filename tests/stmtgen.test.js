'use strict';
// core/stmtgen (F3c, T004): el generador de enunciados (spec f3c-enunciados, AC1–AC6; plan §3). De una tabla del
// generador de la F3a (o de unas filas cualesquiera) a un enunciado con contexto en el formato StatementDef de M0.
// La comprobación de ida y vuelta es la de M0: statement.validate(def, { strict: true }) exige que cada fragmento
// dé precedencias del cierre de la referencia y que toda precedencia de la reducción salga de algún fragmento.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { spawnSync } = require('child_process');
const SG = require('../js/core/stmtgen.js');
const X = require('../js/core/contexts.js');
const G = require('../js/core/generator.js');
const S = require('../js/core/statement.js');
const E = require('../js/core/examples.js');
const ST = require('../js/core/statements.js');
const P = require('../js/core/project.js');

const LV = ['easy', 'medium', 'hard'];
const SEEDS = Number(process.env.STMTGEN_SEEDS || 300);
const rowsOf = (rows) => rows.map((r) => ({ id: r.id, duration: String(r.duration), links: r.links || '' }));
const segIds = (def, L) => def.text[L].filter(Array.isArray).map((s) => s[0]);
const predsOf = (rows) => Object.fromEntries(rows.map((r) => [r.id, (r.links ? r.links.split(/\s*,\s*/) : []).filter(Boolean).sort()]));
// Oráculo propio del orden verosímil: la etapa de cada nombre, buscada en el catálogo por su texto.
const stageOf = (ctx, name) => X.CONTEXTS[ctx].acts.find((a) => a[1] === name.charAt(0).toLowerCase() + name.slice(1))[0];

// Las tablas de las semillas, generadas una vez por nivel (el generador de la F3a es lo lento).
const TABLES = {};
for (const lv of LV) {
  TABLES[lv] = [];
  for (let sd = 1; sd <= SEEDS; sd++) { const g = G.generate(sd, G.LEVELS[lv]); if (g.ok) TABLES[lv].push({ sd, rows: g.rows }); }
}
const ALL = [];
for (const lv of LV) for (const { sd, rows } of TABLES[lv]) for (const ctx of X.KEYS) ALL.push({ lv, sd, ctx, rows, res: SG.compose(rows, lv, ctx, sd) });

test('make: misma semilla, nivel, contexto y versión → el mismo enunciado; la tabla es la de generator.generate', () => {
  for (const lv of LV) {
    const a = SG.make(7, lv, { ctx: 'home' });
    const b = SG.make(7, lv, { ctx: 'home', version: SG.VERSION });
    assert.ok(a.ok);
    assert.deepEqual(a.def, b.def);
    assert.deepEqual(rowsOf(a.def.ref.rows), rowsOf(G.generate(7, G.LEVELS[lv]).rows));
    assert.notDeepEqual(SG.make(8, lv, { ctx: 'home' }).def.text, a.def.text);
  }
});

test('make da el mismo enunciado en otro proceso de Node', () => {
  const code = `const SG = require(${JSON.stringify(path.join(__dirname, '../js/core/stmtgen.js'))});`
    + 'process.stdout.write(JSON.stringify(["easy","medium","hard"].map((lv) => SG.make(123, lv).def)));';
  const out = spawnSync(process.execPath, ['-e', code], { encoding: 'utf8' });
  assert.equal(out.status, 0, out.stderr);
  assert.deepEqual(JSON.parse(out.stdout), LV.map((lv) => JSON.parse(JSON.stringify(SG.make(123, lv).def))));
});

test('sin contexto, el contexto sale de la semilla y da lo mismo que pedirlo', () => {
  const seen = new Set();
  for (let sd = 1; sd <= 40; sd++) {
    const r = SG.make(sd, 'easy');
    assert.ok(X.KEYS.includes(r.ctx));
    seen.add(r.ctx);
    assert.deepEqual(SG.make(sd, 'easy', { ctx: r.ctx }).def, r.def);
  }
  assert.equal(seen.size, 4);
});

test('make rechaza otra versión, un nivel que no es de los tres y un contexto desconocido', () => {
  assert.deepEqual(SG.make(1, 'easy', { version: SG.VERSION + 1 }), { ok: false, reason: 'version' });
  assert.equal(SG.make(1, 'custom').reason, 'level');
  assert.equal(SG.make(1, 'easy', { ctx: 'moon' }).reason, 'context');
});

test(`ida y vuelta: en ${SEEDS} semillas × 3 niveles × 4 contextos, validate estricto sin avisos y la tabla intacta`, () => {
  assert.ok(ALL.length >= SEEDS * 3 * 4 * 0.98);
  for (const x of ALL) {
    assert.ok(x.res.ok, `${x.lv}/${x.sd}/${x.ctx}: ${x.res.reason}`);
    assert.deepEqual(S.validate(x.res.def, { strict: true }), [], `${x.lv}/${x.sd}/${x.ctx}`);
    assert.deepEqual(predsOf(x.res.def.ref.rows), predsOf(x.rows));
  }
});

test('ES y EN tienen los mismos fragmentos, en el mismo orden, y ninguno vacío; route funciona en los dos', () => {
  for (const x of ALL.filter((_, i) => i % 7 === 0)) {
    const def = x.res.def;
    assert.deepEqual(segIds(def, 'es'), segIds(def, 'en'));
    assert.deepEqual([...segIds(def, 'es')].sort(), Object.keys(def.frags).sort());
    for (const L of ['es', 'en']) {
      for (const s of def.text[L]) if (Array.isArray(s)) assert.ok(s[1].trim(), `${x.lv}/${x.sd}/${x.ctx}/${L}/${s[0]}`);
      assert.ok(S.route(S.build(def, L)).length > 0);
    }
  }
});

test('orden verosímil: ninguna precedencia va de una etapa a otra anterior y no se repiten nombres', () => {
  for (const x of ALL) {
    const rows = x.res.def.ref.rows;
    const names = rows.map((r) => r.name.es);
    assert.equal(new Set(names).size, names.length);
    const st = Object.fromEntries(rows.map((r) => [r.id, stageOf(x.ctx, r.name.es)]));
    for (const [s, P] of Object.entries(predsOf(rows))) for (const p of P) assert.ok(st[p] <= st[s], `${x.lv}/${x.sd}/${x.ctx}: ${p}→${s}`);
  }
});

const kinds = (def) => Object.values(def.frags).map((f) => f.kind);
const hasList = (def) => def.text.es.some((s) => typeof s === 'string' && /\n[A-Z0-9]+\) $/.test(s));
const sources = (rows) => rows.filter((r) => !r.links).length;
const sinks = (rows) => rows.filter((r) => !rows.some((q) => (q.links || '').split(/\s*,\s*/).includes(r.id))).length;

test('fácil: lista con letras y solo frases hacia atrás (una por actividad con predecesoras)', () => {
  for (const x of ALL.filter((y) => y.lv === 'easy')) {
    const def = x.res.def;
    assert.ok(hasList(def));
    assert.deepEqual([...new Set(kinds(def))].sort(), ['activity', 'duration', 'precedence']);
    const prec = Object.values(def.frags).filter((f) => f.kind === 'precedence');
    assert.equal(prec.length, x.rows.filter((r) => r.links).length);
    for (const f of prec) assert.equal(new Set(f.gives.map((e) => e[1])).size, 1, 'una sucesora por frase');
  }
});

test('media: lista, frases en los dos sentidos, alguna con varias precedencias y una «a la vez»; nada del difícil', () => {
  let multi = 0;
  for (const x of ALL.filter((y) => y.lv === 'medium')) {
    const def = x.res.def;
    assert.ok(hasList(def));
    const k = kinds(def);
    assert.equal(k.filter((y) => y === 'none').length, 1);
    assert.ok(!k.includes('start') && !k.includes('end') && !def.frags.r1);
    assert.ok(x.res.feat.back > 0 && x.res.feat.fwd > 0, `${x.sd}/${x.ctx}`);
    if (x.res.feat.multi > 0) multi++;
  }
  assert.ok(multi / ALL.filter((y) => y.lv === 'medium').length > 0.85);
});

test('difícil: prosa sin lista, «a la vez», recurso, redundancia escrita y «lo primero»/«lo último» solo con inicio o final único', () => {
  let startEnd = 0;
  for (const x of ALL.filter((y) => y.lv === 'hard')) {
    const def = x.res.def;
    assert.ok(!hasList(def));
    const k = kinds(def);
    const r1 = def.frags.r1;
    assert.ok(r1 && r1.kind === 'precedence' && r1.gives.length === 1 && r1.why);
    assert.ok(!predsOf(x.rows)[r1.gives[0][1]].includes(r1.gives[0][0]), 'la redundancia no es una precedencia inmediata');
    const unique = sources(x.rows) === 1 || sinks(x.rows) === 1;
    assert.equal(k.includes('start') || k.includes('end'), unique, `${x.sd}/${x.ctx}`);
    assert.equal(!!def.frags.n0, !unique);
    assert.ok(k.filter((y) => y === 'none').length >= 2);
    if (unique) startEnd++;
  }
  assert.ok(startEnd > 0);
});

test('ejemplos citados: el Ej. 6 (Mecánicas del Sureste) y el Ej. 5 (Electrona) de los apuntes se reconstruyen', () => {
  // J. M. Galán, Gestión de Proyectos (UBU), hoja de ejercicios del Tema 6, ejercicios 5 y 6 (constitución, 8).
  // El Ej. 6 está escrito con sus posteriores (mode 'succ'): se pasa a predecesoras con project.parse.
  const p6 = P.parse(E.get('ej6').rows, E.get('ej6').mode).project;
  const ej6 = p6.activities.map((a) => ({ id: a.id, duration: String(a.d), links: [...p6.preds[a.id]].join(', ') }));
  const ej5 = ST.get('ej5').ref.rows.map((r) => ({ id: r.id, duration: r.duration, links: r.links }));
  for (const rows of [ej6, ej5]) {
    for (const lv of LV) for (const ctx of X.KEYS) {
      const r = SG.compose(rows, lv, ctx, 1);
      assert.ok(r.ok, `${lv}/${ctx}: ${r.reason}`);
      assert.deepEqual(S.validate(r.def, { strict: true }), []);
      assert.deepEqual(predsOf(r.def.ref.rows), predsOf(rows));
    }
  }
});

test('render da el texto plano de los segmentos', () => {
  const def = SG.make(5, 'medium', { ctx: 'lab' }).def;
  for (const L of ['es', 'en']) assert.equal(SG.render(def, L), def.text[L].map((s) => (Array.isArray(s) ? s[1] : s)).join(''));
  assert.match(SG.render(def, 'es'), /^Un laboratorio/);
});

test('sin reparto posible: presupuesto agotado o más actividades que el catálogo → reason «assign»; tabla con ciclo → «table»', () => {
  const R = require('../js/core/rng.js');
  const rows = G.generate(3, G.LEVELS.hard).rows;
  assert.equal(SG.assign(R.mulberry32(1), SG.table(rows), X.CONTEXTS.home, 1), null);
  const many = Array.from({ length: 25 }, (_, i) => ({ id: `T${i}`, duration: '1', links: i ? `T${i - 1}` : '' }));
  assert.deepEqual(SG.compose(many, 'easy', 'home', 1), { ok: false, reason: 'assign' });
  const cyc = [{ id: 'A', duration: '1', links: 'B' }, { id: 'B', duration: '1', links: 'A' }];
  assert.deepEqual(SG.compose(cyc, 'easy', 'home', 1), { ok: false, reason: 'table' });
  assert.deepEqual(SG.compose([{ id: 'A', duration: '1', links: 'Z' }], 'easy', 'home', 1), { ok: false, reason: 'table' });
  assert.equal(SG.compose(rows, 'custom', 'home', 1).reason, 'level');
  assert.equal(SG.compose(rows, 'easy', 'moon', 1).reason, 'context');
});
