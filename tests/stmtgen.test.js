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
    assert.equal(SG.contextOf(sd, 'easy'), r.ctx);
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
  assert.ok(multi / ALL.filter((y) => y.lv === 'medium').length > 0.95);
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

// ── Revisión de la F3c (T017): el texto que lee el alumno, comprobado contra lo que dan sus fragmentos ─────────────
// Oráculo: cada fragmento de precedencia o «sin precedencia» tiene que ser una de las formas aprobadas (contexts.FORMS)
// aplicada a lo que el fragmento dice dar, con las actividades del catálogo; una frase «a la vez» o de recurso, entre dos
// actividades que no dependen una de otra; «desde el primer día», exactamente las actividades iniciales; la redundancia,
// explicada con un camino real de la tabla. Y, en prosa, ninguna actividad se nombra antes de presentarla.
const F = X.FORMS;
const perms = (xs) => (xs.length <= 1 ? [xs] : xs.flatMap((x, i) => perms([...xs.slice(0, i), ...xs.slice(i + 1)]).map((p) => [x, ...p])));
const uniq = (xs) => [...new Set(xs)];
function textProblems(x) {
  const def = x.res.def;
  const cat = X.CONTEXTS[x.ctx];
  const P = predsOf(def.ref.rows);
  const ids = def.ref.rows.map((r) => r.id);
  const A = Object.fromEntries(def.ref.rows.map((r) => {
    const a = cat.acts.find((c) => c[1] === r.name.es.charAt(0).toLowerCase() + r.name.es.slice(1));
    return [r.id, { es: a[1], en: a[2], g: a[3] }];
  }));
  const anc = (y) => { const s = new Set(); const go = (z) => P[z].forEach((p) => { if (!s.has(p)) { s.add(p); go(p); } }); go(y); return s; };
  const indep = (a, b) => a !== b && !anc(a).has(b) && !anc(b).has(a);
  const paths = (a, b) => (a === b ? [[b]] : ids.filter((s) => P[s].includes(a) && (s === b || anc(b).has(s))).flatMap((s) => paths(s, b).map((p) => [a, ...p])));
  const prose = x.lv === 'hard';
  const sourcesIds = ids.filter((id) => !P[id].length);
  const out = [];
  for (const L of ['es', 'en']) {
    const seen = new Set();
    const segs = def.text[L].filter(Array.isArray);
    for (const [fid, text] of segs) {
      const f = def.frags[fid];
      const bad = (msg) => out.push(`${x.lv}/${x.sd}/${x.ctx}/${L}/${fid}: ${msg} «${text}»`);
      let names = [];
      if (f.kind === 'activity') { seen.add(f.act); continue; }
      if (f.kind === 'duration' || f.kind === 'start' || f.kind === 'end') continue;
      if (f.kind === 'precedence' && fid === 'r1') {
        const [[a, b]] = f.gives;
        names = [a, b];
        if (text !== F.red[L](A[a], A[b])) bad('redundancia con otra forma o al revés');
        const why = paths(a, b).filter((p) => p.length > 2).map((p) => F.red.why[L](p.map((id) => A[id])));
        if (!why.includes(f.why[L])) bad('la redundancia no se explica con un camino de la tabla');
      } else if (f.kind === 'precedence') {
        const ps = uniq(f.gives.map((e) => e[0])); const ss = uniq(f.gives.map((e) => e[1]));
        const cand = [];
        if (!prose) {
          if (ss.length === 1) for (const fm of F.back) for (const pp of perms(ps)) cand.push(fm[L](ss[0], pp));
          if (ps.length === 1) for (const fm of F.fwd) for (const qq of perms(ss)) cand.push(fm[L](ps[0], qq));
        } else {
          for (const fm of F.pBack) for (const pp of perms(ps)) cand.push(fm[L](pp.map((id) => A[id])));
          if (ps.length === 1) for (const fm of F.pFwd) for (const qq of perms(ss)) cand.push(X.cap(fm[L](A[ps[0]], qq.map((id) => A[id]))));
        }
        if (!cand.includes(text)) bad(`no es una forma aprobada de ${JSON.stringify(f.gives)}`);
        // En prosa, una cláusula hacia atrás presenta después a sus sucesoras; las demás frases nombran todo lo ya presentado.
        names = prose && F.pBack.some((fm) => perms(ps).some((pp) => fm[L](pp.map((id) => A[id])) === text)) ? ps : [...ps, ...ss];
      } else if (f.kind === 'none') {
        const pairs = [];
        for (const a of ids) for (const b of ids) if (a !== b) pairs.push([a, b]);
        let hit = null;
        for (const [a, b] of pairs) {
          const forms = prose ? [F.parProse[L](A[a], A[b]), F.res[L](A[a], A[b], cat.resource[L])] : [F.par[L](a, b)];
          if (forms.includes(text)) { hit = [a, b]; break; }
        }
        if (hit) {
          names = hit;
          if (!indep(hit[0], hit[1])) bad('«a la vez» o recurso entre actividades que dependen una de otra');
          if (!prose && f.why[L] !== F.par.why[L](hit[0], hit[1])) bad('explicación de otro par');
        } else if (prose && perms(sourcesIds).some((pp) => F.day1[L](pp.map((id) => A[id])) === text)) {
          names = sourcesIds;
        } else bad('frase sin precedencia que no es una forma aprobada (o «primer día» con actividades que no son iniciales)');
      }
      if (prose) for (const id of names) if (!seen.has(id)) bad(`nombra ${id} antes de presentarla`);
    }
    if (prose && /(^|\s)[A-Z]\) /.test(SG.render(def, L))) out.push(`${x.lv}/${x.sd}/${x.ctx}/${L}: letras en la prosa`);
  }
  return out;
}

test('revisión: el texto de cada fragmento es una forma aprobada de lo que da, en ES y EN (también la redundancia y su camino)', () => {
  const problems = ALL.flatMap(textProblems);
  assert.deepEqual(problems.slice(0, 5), []);
});

test('revisión: en media, una frase de varias precedencias siempre que la tabla la admita; en difícil, recurso siempre y frase común a menudo', () => {
  for (const x of ALL.filter((y) => y.lv === 'medium')) {
    const pr = predsOf(x.rows);
    const ids = Object.keys(pr);
    const allows = ids.some((s) => pr[s].length > 1) || ids.some((p) => ids.filter((s) => pr[s].includes(p)).length > 1);
    if (allows) assert.ok(x.res.feat.multi > 0, `${x.sd}/${x.ctx}`);
  }
  const hard = ALL.filter((y) => y.lv === 'hard');
  for (const x of hard) assert.equal(x.res.feat.res, 1, `${x.sd}/${x.ctx}`);
  assert.ok(hard.filter((x) => x.res.feat.same > 0).length / hard.length > 0.2);
});
