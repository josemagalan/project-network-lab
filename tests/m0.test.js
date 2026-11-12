'use strict';
// m0: la lógica de practicar que no necesita DOM (F2c, T015; AC1, AC2, AC3, AC8, AC15). La interacción con la
// página (subrayar con ratón y teclado, la matriz y los saltos a M1 y M2) la comprueban las pruebas de navegador.
const test = require('node:test');
const assert = require('node:assert/strict');
const U = require('../js/core/urlstate.js');
const P = require('../js/core/project.js');
const S = require('../js/core/statement.js');
const ST = require('../js/core/statements.js');
const PC = require('../js/core/precheck.js');
const C = require('../js/core/cpm.js');
const M0 = require('../js/m0.js');

const m0State = (extra) => Object.assign(U.defaults(), { v: 'm0', st: 'ej5', ex: null }, extra || {});
const row = (id, duration, links = '', name = '') => ({ id, name, duration: String(duration), links });
const frag = (st, id) => st.frags.find((f) => f.id === id);

test('T015 · AC1: al abrir un enunciado, la tabla está vacía y no hay errores, avisos ni nada de la referencia', () => {
  for (const id of ST.list({ all: true }).map((s) => s.id)) {
    for (const lang of ['es', 'en']) {
      const m = M0.model(m0State({ st: id }), lang);
      assert.equal(m.st.id, id);
      assert.deepEqual(m.rows, []);
      assert.equal(m.project, null);
      assert.deepEqual(m.report.errors, []);
      assert.deepEqual(m.warnings, []);
      assert.deepEqual(m.explain.redundant, []);
    }
  }
  // Un enunciado desconocido no rompe: se abre el de por defecto.
  assert.equal(M0.model(m0State({ st: 'nada' }), 'es').st.id, U.DEFAULT_ST);
});

test('T015: el modelo lee la tabla del alumno; en un enunciado con duraciones, una tabla sin ninguna aún no da errores', () => {
  const m = M0.model(m0State({ t: [row('A', ''), row('D', '', 'A')] }), 'es');
  assert.ok(m.project);
  assert.deepEqual(m.report.errors, []);
  const half = M0.model(m0State({ t: [row('A', 3), row('D', '', 'A')] }), 'es');
  assert.deepEqual(half.report.errors.map((e) => e.code), ['badDuration'], 'con una escrita, las demás hacen falta');
  // En uno solo de estructura, nunca se piden.
  assert.deepEqual(M0.model(m0State({ st: 'ej1', t: [row('A', 3), row('D', '', 'A')] }), 'es').report.errors, []);
});

test('T015 · AC2: la propuesta de un subrayado sale solo del texto subrayado: letra del texto o la siguiente libre, nombre y número', () => {
  const st = S.build(ST.get('ej5'), 'es');
  const d = frag(st, 'aD');
  const p = M0.proposal(st, d.from, d.to, [row('A', ''), row('B', '')]);
  assert.equal(p.id, 'D');
  assert.equal(p.fromText, true);
  assert.equal(p.name, 'Fabricar el componente Y');
  const k = S.build(ST.get('cocina'), 'es');
  const a = frag(k, 'aA');
  const q = M0.proposal(k, a.from, a.to, [row('A', '')]);
  assert.equal(q.id, 'B', 'sin letra en el texto, la siguiente libre');
  assert.equal(q.fromText, false);
  assert.equal(q.name, 'Desmontar la cocina vieja');
  const dur = frag(k, 'dA');
  assert.equal(M0.proposal(k, dur.from, dur.to, []).value, 2);
  // El nombre propuesto no pasa del límite de la URL.
  const long = S.build({ lang: 'es', text: 'x '.repeat(120), frags: [], ref: null });
  assert.ok(M0.proposal(long, 0, 119, []).name.length <= U.LIMITS.name);
});

test('T015 · AC2: subrayar una actividad crea su fila; una duración la pone; una frase de dependencia crea las precedencias nuevas', () => {
  let rows = M0.applyMark([], 'pred', { from: 0, to: 2, kind: 'activity', act: 'A' }, { name: 'Materiales' });
  assert.deepEqual(rows, [{ id: 'A', name: 'Materiales', duration: '', links: '' }]);
  rows = M0.applyMark(rows, 'pred', { from: 5, to: 6, kind: 'activity', act: 'a' }, { name: 'Otra vez' });
  assert.equal(rows.length, 1, 'la misma letra no crea otra fila');
  assert.equal(rows[0].name, 'Materiales', 'ni cambia un nombre ya escrito');
  rows = M0.applyMark(rows, 'pred', { from: 8, to: 9, kind: 'activity', act: 'D' }, { name: 'Fabricar Y' });
  rows = M0.applyMark(rows, 'pred', { from: 20, to: 20, kind: 'duration', act: 'D', value: 7 });
  assert.equal(rows[1].duration, '7');
  rows = M0.applyMark(rows, 'pred', { from: 21, to: 21, kind: 'duration', act: 'B', value: 1 });
  assert.deepEqual(rows[2], { id: 'B', name: '', duration: '1', links: '' }, 'la duración de una actividad sin fila la crea');
  rows = M0.applyMark(rows, 'pred', { from: 30, to: 34, kind: 'precedence', gives: [['A', 'D'], ['B', 'D']] });
  assert.equal(rows[1].links, 'A, B');
  const succ = M0.applyMark([row('A', ''), row('D', '')], 'succ', { from: 0, to: 1, kind: 'precedence', gives: [['A', 'D']] });
  assert.equal(succ[0].links, 'D', 'con posteriores, en la fila de la precedente');
  const none = [row('A', ''), row('B', '')];
  assert.equal(M0.applyMark(none, 'pred', { from: 0, to: 1, kind: 'none' }), none, '«no da precedencia» no cambia la tabla');
  // La tabla sale igual que si se escribiera a mano.
  const parsed = P.parse(rows, 'pred', { structureOnly: true });
  assert.deepEqual(parsed.project.preds.D, ['A', 'B']);
});

test('T015 · AC2: quitar un subrayado no borra nada de la tabla', () => {
  const marks = [{ from: 0, to: 2, kind: 'activity', act: 'A' }, { from: 4, to: 6, kind: 'precedence', gives: [['A', 'B']] }];
  const out = M0.removeMark(marks, 1);
  assert.deepEqual(out, [marks[0]]);
  assert.equal(marks.length, 2, 'no muta la lista recibida');
  assert.equal(M0.removeMark([marks[0]], 0), null, 'sin subrayados, la URL no los guarda');
});

test('T015: un subrayado nuevo sustituye a los que pisa (cada palabra tiene como mucho uno)', () => {
  const marks = [{ from: 0, to: 2, kind: 'activity', act: 'A' }, { from: 4, to: 6, kind: 'none' }, { from: 9, to: 9, kind: 'duration', act: 'A', value: 2 }];
  const out = M0.putMark(marks, { from: 2, to: 5, kind: 'none' });
  assert.deepEqual(out.map((m) => `${m.from}-${m.to}`), ['2-5', '9-9'], 'ordenados por posición');
  assert.deepEqual(M0.putMark(null, { from: 3, to: 3, kind: 'none' }), [{ from: 3, to: 3, kind: 'none' }]);
});

test('T015 · AC8 y AC15: la tabla depurada de Electrona con una redundancia añadida es la referencia: 17 días y 2 ficticias', () => {
  const st = S.build(ST.get('ej5'), 'es');
  const rows = st.ref.activities.map((a) => ({ id: a.id, name: a.name, duration: String(a.d), links: st.ref.preds[a.id].join(', ') }));
  rows.find((r) => r.id === 'K').links = 'J, A, B';
  const m = M0.model(m0State({ t: rows }), 'es');
  assert.equal(m.explain.redundant.length, 2);
  const clean = M0.cleanRows(m.project, 'pred');
  assert.equal(clean.find((r) => r.id === 'K').links, 'J');
  assert.equal(clean.find((r) => r.id === 'D').name, 'Fabricar Y');
  const p = P.parse(clean, 'pred').project;
  assert.deepEqual(p.preds, PC.reduce(st.ref).preds);
  assert.equal(C.solve(p).duration, 17);
  // Solo de estructura: las duraciones quedan vacías (no «null»), y con posteriores se escriben las posteriores.
  const ej1 = S.build(ST.get('ej1'), 'es');
  const c1 = M0.cleanRows(ej1.ref, 'succ');
  assert.ok(c1.every((r) => r.duration === ''));
  assert.equal(c1.find((r) => r.id === 'A').links, 'D, E, G');
});

test('T015 · AC15: abrir la tabla depurada en M1, M2 o el taller deja la URL lista para volver con «Atrás»', () => {
  const st = m0State({ t: [row('A', 1), row('B', 2, 'A')], mk: [{ from: 1, to: 2, kind: 'none' }], tv: 'matrix' });
  const back = U.encode(st);
  const rows = [row('A', 1), row('B', 2, 'A')];
  for (const [where, v, graph] of [['m1', 'route', 'aon'], ['m2', 'route', 'aoa'], ['work', 'work', 'aon']]) {
    const s = M0.openState(st, where, rows, 'pred');
    assert.equal(s.v, v);
    assert.equal(s.graph, graph);
    assert.equal(s.step, 0);
    assert.deepEqual(s.t, rows);
    assert.equal(s.view, 'net');
    assert.equal(s.st, 'ej5', 'el enunciado se queda en el estado, pero fuera de M0 no se escribe');
    assert.doesNotMatch(U.encode(s), /[?&]st=|[?&]mk=/);
  }
  assert.equal(U.encode(st), back, 'el estado de M0 no cambia');
});

test('T017 · AC10: la tabla de la ruta se llena paso a paso y en el último es la depurada', () => {
  const st = S.build(ST.get('ej5'), 'es');
  const tr = S.route(st);
  const k = tr.findIndex((s) => s.frag === 'aD');
  const before = M0.routeTable(st, tr, k, true);
  assert.deepEqual(before.rows.map((r) => r.id), ['A', 'B', 'C'], 'mientras se predice, sin lo que da el paso');
  assert.ok(before.rows.every((r) => r.links === '' && r.duration === ''));
  const after = M0.routeTable(st, tr, k, false);
  const d = after.rows.find((r) => r.id === 'D');
  assert.equal(d.links, 'A, B');
  assert.equal(d.name, 'Fabricar Y', 'con el nombre de la referencia');
  assert.deepEqual(after.added, ['D']);
  assert.deepEqual(after.edges, [['A', 'D'], ['B', 'D']]);
  const end = M0.routeTable(st, tr, tr.length - 1, false);
  assert.equal(end.rows.find((r) => r.id === 'D').duration, '7');
  const p = P.parse(end.rows, 'pred').project;
  assert.deepEqual(p.preds, PC.reduce(st.ref).preds);
  // En la cocina, la tabla del último paso ya no tiene las redundantes de «lo último».
  const k2 = S.build(ST.get('cocina'), 'es');
  const t2 = S.route(k2);
  const pre = M0.routeTable(k2, t2, t2.length - 2, false);
  assert.equal(pre.rows.find((r) => r.id === 'H').links, 'A, B, C, D, E, F, G');
  assert.equal(M0.routeTable(k2, t2, t2.length - 1, false).rows.find((r) => r.id === 'H').links, 'G');
});

test('T019 · AC10: cada paso con predicción de la ruta se puede responder con sus opciones, en los once enunciados (ES y EN)', () => {
  const nat = (u, v) => u.localeCompare(v, 'en', { numeric: true });
  for (const def of ST.list({ all: true })) {
    for (const lang of ['es', 'en']) {
      const st = S.build(def, lang);
      const tr = S.route(st);
      const all = st.ref.activities.map((a) => a.id).sort(nat);
      tr.forEach((step, k) => {
        if (!step.fields) return;
        const o = M0.routeOptions(st, tr, k);
        const where = `${def.id} (${lang}), paso ${k}`;
        if (o.cands) {
          for (const [p, a] of step.answer.edges) assert.ok(o.cands.includes(`${p}>${a}`), `${where}: falta la casilla ${p} → ${a}`);
        } else {
          // Frase de dependencia: las dos listas llevan todas las actividades del enunciado, en orden, con su nombre.
          assert.deepEqual(o.ids, all, where);
          for (const id of all) assert.match(o.label(id), new RegExp(`^${id}( · .+)?$`), where);
        }
      });
    }
  }
  const st = S.build(ST.get('cocina'), 'es');
  const o = M0.routeOptions(st, S.route(st), 3);
  assert.equal(o.cands, null);
  assert.equal(o.label('B'), 'B · Instalación eléctrica');
});

// ── T021: el enunciado propio del docente (AC13, AC14) ─────────────────────────────────────────────────────
// Preparar es lo mismo que practicar, pero lo subrayado y escrito es la referencia: el texto en state.own, la tabla
// del docente en t y sus subrayados en mk. M0.ownDef lo convierte en el OwnDef que viaja en el enlace.

const FERIA = 'Para la feria de ciencias hay que reservar el aula, preparar los carteles y montar los experimentos. '
  + 'Los carteles se preparan después de reservar el aula. Montar los experimentos requiere el aula reservada y los carteles hechos. '
  + 'Al final, alguien tiene que recoger el aula, que dura 2 horas.';
const words = (text) => S.tokenize(text).words;
// Rango de palabras de una frase dentro del texto (la primera aparición).
function at(text, phrase) {
  const w = words(text);
  const ph = words(phrase).map((x) => x.t);
  const i = w.findIndex((_, k) => ph.every((p, j) => w[k + j] && w[k + j].t === p));
  assert.ok(i >= 0, `«${phrase}» no está en el texto`);
  return { from: i, to: i + ph.length - 1 };
}
const mark = (text, phrase, extra) => Object.assign(at(text, phrase), extra);
const FERIA_MARKS = [
  mark(FERIA, 'reservar el aula', { kind: 'activity', act: 'A' }),
  mark(FERIA, 'preparar los carteles', { kind: 'activity', act: 'B' }),
  mark(FERIA, 'montar los experimentos', { kind: 'activity', act: 'C' }),
  mark(FERIA, 'Los carteles se preparan después de reservar el aula', { kind: 'precedence', gives: [['A', 'B']] }),
  mark(FERIA, 'Montar los experimentos requiere el aula reservada y los carteles hechos', { kind: 'precedence', gives: [['A', 'C'], ['B', 'C']] }),
  mark(FERIA, 'Al final', { kind: 'precedence', decl: { end: 'end', act: 'D' } }),
  mark(FERIA, 'alguien tiene que recoger el aula', { kind: 'activity', act: 'D' }),
  mark(FERIA, '2 horas', { kind: 'duration', act: 'D', value: 2 }),
  mark(FERIA, 'Para la feria de ciencias', { kind: 'none' }),
];
const FERIA_ROWS = [row('A', 1, '', 'Reservar el aula'), row('B', 3, 'A', 'Carteles'), row('C', 4, 'B', 'Experimentos'), row('D', 2, 'C', 'Recoger')];
// El estado de «preparar»: texto del docente, su tabla y sus subrayados.
const prep = (extra) => Object.assign(U.defaults(), { v: 'm0', st: 'own', ex: null, mm: 'prepare', lang: 'es', mode: 'pred',
  own: { lang: 'es', text: FERIA, frags: [], ref: null }, t: FERIA_ROWS.map((r) => Object.assign({}, r)), mk: FERIA_MARKS.map((m) => Object.assign({}, m)) }, extra || {});
const notKey = (s) => typeof s === 'string' && s.length > 0 && !/^m0\.[\w.]+$/.test(s);

test('T021 · AC13: del estado de «preparar» a un OwnDef: los subrayados del docente son los fragmentos y su tabla, la referencia', () => {
  const def = M0.ownDef(prep());
  assert.equal(def.lang, 'es');
  assert.equal(def.text, FERIA);
  assert.deepEqual(def.ref, { mode: 'pred', rows: FERIA_ROWS.map((r) => ({ id: r.id, duration: r.duration, links: r.links, name: r.name })) });
  assert.deepEqual(def.frags.map((f) => f.kind), ['none', 'activity', 'activity', 'activity', 'precedence', 'precedence', 'end', 'activity', 'duration'],
    'en el orden del texto; «lo último» pasa a ser un fragmento «end»');
  const end = def.frags.find((f) => f.kind === 'end');
  assert.equal(end.act, 'D');
  assert.equal(end.gives, undefined);
  assert.deepEqual(def.frags.find((f) => f.kind === 'duration'), Object.assign(at(FERIA, '2 horas'), { kind: 'duration', act: 'D', value: 2 }));
  // Es un enunciado que se construye, se valida y tiene ruta guiada.
  assert.deepEqual(S.validate(def, { strict: false }).filter((i) => !i.warn), []);
  const st = S.build(def);
  assert.equal(st.id, 'own');
  assert.deepEqual(st.ref.activities.map((a) => a.id), ['A', 'B', 'C', 'D']);
  assert.equal(st.structureOnly, false);
  assert.ok(S.route(st).some((s) => s.kind === 'm0Clean'));
  // Una tabla en la otra forma viaja tal cual, con su forma.
  assert.equal(M0.ownDef(prep({ mode: 'succ', t: [row('A', '', 'B'), row('B', '')] })).ref.mode, 'succ');
  // Sin tabla, el texto acompaña a una tabla libre: no hay referencia.
  assert.equal(M0.ownDef(prep({ t: null })).ref, null);
  assert.equal(M0.ownDef(prep({ t: [row('', '')] })).ref, null, 'las filas vacías no cuentan');
  // Y vuelve a «preparar» sin perder nada (con la tabla del docente y sus subrayados).
  const back = M0.toPrepare(Object.assign(U.defaults(), { v: 'm0', st: 'own', ex: null, own: def, lang: 'en', t: [row('X', 1)], mk: null }));
  assert.equal(back.mm, 'prepare');
  assert.deepEqual(back.own, { lang: 'es', text: FERIA, frags: [], ref: null });
  assert.deepEqual(M0.ownDef(back), def);
});

test('T021 · AC13: el enlace del alumno abre el ejercicio sin la solución a la vista; el de la solución, ya resuelto', () => {
  const sh = M0.share(prep(), 'es');
  assert.equal(sh.blocked, null);
  assert.equal(typeof sh.student, 'string');
  assert.equal(typeof sh.solution, 'string');
  assert.ok(sh.student.length <= U.LIMITS.hash && sh.solution.length <= U.LIMITS.hash);
  // El alumno: practicar con el texto, tabla vacía, sin subrayados, en el idioma del texto.
  const stu = U.decode(sh.student);
  assert.equal(stu.warning, undefined);
  const s = stu.state;
  assert.equal(s.v, 'm0'); assert.equal(s.st, 'own'); assert.equal(s.mm, 'practice'); assert.equal(s.sol, 0); assert.equal(s.lang, 'es');
  assert.equal(s.t, null); assert.equal(s.mk, null);
  assert.deepEqual(s.own, M0.ownDef(prep()));
  assert.deepEqual(M0.openSolution(s), s, 'sin sol=1 no se pone nada');
  const m = M0.model(s, 'es');
  assert.deepEqual(m.rows, []); assert.deepEqual(m.marks, []);
  assert.ok(m.st.ref, 'puede comprobar');
  // ... y la corrige: con la tabla del docente, correcta; con una precedencia de menos, no.
  const good = M0.diagnosis('es', M0.model(Object.assign({}, s, { t: FERIA_ROWS }), 'es'));
  assert.equal(good.ok, true);
  const bad = M0.diagnosis('es', M0.model(Object.assign({}, s, { t: [row('A', 1), row('B', 3, 'A'), row('C', 4), row('D', 2, 'C')] }), 'es'));
  assert.equal(bad.ok, false);
  assert.deepEqual(bad.items.map((i) => i.code), ['missingPrecedence']);
  // La ruta guiada recorre los fragmentos del docente.
  assert.equal(S.route(m.st).filter((x) => x.kind === 'm0Frag').length, FERIA_MARKS.length);
  // Con la solución: sol=1 y, al abrirlo, la tabla y los subrayados del docente ya están puestos.
  const sol = U.decode(sh.solution).state;
  assert.equal(sol.sol, 1); assert.equal(sol.t, null);
  const open = M0.openSolution(sol);
  assert.equal(open.sol, 0, 'se pone una vez: después es la tabla de quien lo abre');
  assert.deepEqual(open.t, FERIA_ROWS.map((r) => ({ id: r.id, name: r.name, duration: r.duration, links: r.links })));
  assert.deepEqual(M0.ownDef(Object.assign({}, open, { own: { lang: 'es', text: FERIA, frags: [], ref: null } })), M0.ownDef(prep()),
    'los subrayados puestos son los del docente');
  assert.equal(M0.diagnosis('es', M0.model(open, 'es')).ok, true);
  // El enlace sale en el idioma del texto aunque la interfaz esté en el otro.
  const en = U.decode(M0.share(prep({ lang: 'en' }), 'en').student).state;
  assert.equal(en.lang, 'es');
});

test('T021 · AC13: sin tabla del docente hay enlace para el alumno (tabla libre), pero no con la solución', () => {
  const sh = M0.share(prep({ t: null }), 'es');
  assert.equal(sh.blocked, null);
  assert.equal(typeof sh.student, 'string');
  assert.equal(sh.solution, null);
  const s = U.decode(sh.student).state;
  assert.equal(s.own.ref, null);
  assert.equal(M0.model(s, 'es').st.ref, null, 'sin corrección ni ruta guiada');
  assert.ok(sh.warnings.some((w) => w.code === 'noRef' && notKey(w.text)));
});

test('T021 · AC14: con un ciclo en la tabla del docente no hay enlace hasta romperlo', () => {
  for (const lang of ['es', 'en']) {
    const cyc = M0.share(prep({ t: [row('A', 1, 'D'), row('B', 3, 'A'), row('C', 4, 'B'), row('D', 2, 'C')] }), lang);
    assert.equal(cyc.blocked, 'cycle');
    assert.equal(cyc.student, null);
    assert.equal(cyc.solution, null);
    const why = cyc.issues.find((i) => i.code === 'cycle');
    assert.ok(why && notKey(why.text));
    assert.match(why.text, /A → B → C → D → A/);
  }
  // Otros errores de la tabla del docente (una predecesora que no existe) tampoco se comparten.
  assert.equal(M0.share(prep({ t: [row('A', 1), row('B', 3, 'Z')] }), 'es').blocked, 'invalid');
  // Al romper el ciclo, vuelve el enlace.
  assert.equal(M0.share(prep(), 'es').blocked, null);
});

test('T021 · AC14: con redundancias en la tabla del docente se avisa con su camino y se comparte igual', () => {
  const t = [row('A', 1, '', 'Reservar el aula'), row('B', 3, 'A', 'Carteles'), row('C', 4, 'A, B', 'Experimentos'), row('D', 2, 'C', 'Recoger')];
  for (const lang of ['es', 'en']) {
    const sh = M0.share(prep({ t }), lang);
    assert.equal(sh.blocked, null);
    assert.equal(typeof sh.student, 'string');
    const red = sh.warnings.find((w) => w.code === 'redundant');
    assert.ok(red && notKey(red.text));
    assert.deepEqual(red.ids, ['A', 'C']);
    assert.match(red.text, /A → B → C/);
  }
  // La precedencia de la tabla que no sale de ninguna frase vale para corregir, pero no está en la ruta: aviso.
  const noFrag = M0.share(prep({ mk: FERIA_MARKS.filter((m) => !(m.gives && m.gives.length === 2)) }), 'es');
  assert.equal(noFrag.blocked, null);
  const un = noFrag.warnings.find((w) => w.code === 'unjustified');
  assert.ok(un && notKey(un.text));
  assert.deepEqual(un.ids, ['B', 'C']);
});

test('T021: un subrayado del docente que no casa con su tabla impide compartir y dice cuál', () => {
  const extra = FERIA_MARKS.concat([mark(FERIA, 'que dura', { kind: 'activity', act: 'E' })]);
  const sh = M0.share(prep({ mk: extra }), 'es');
  assert.equal(sh.blocked, 'mismatch');
  assert.equal(sh.student, null);
  const u = sh.issues.find((i) => i.code === 'unknownAct');
  assert.ok(u && notKey(u.text));
  assert.match(u.text, /que dura/);
  // Una frase que da una precedencia que la tabla no tiene (ni por un camino).
  const wrong = FERIA_MARKS.map((m) => (m.gives && m.gives.length === 1 ? Object.assign({}, m, { gives: [['B', 'A']] }) : m));
  const w = M0.share(prep({ mk: wrong }), 'es');
  assert.equal(w.blocked, 'mismatch');
  assert.ok(w.issues.some((i) => i.code === 'fragNotInRef' && /B → A/.test(i.text)));
});

test('T021: el texto malicioso se guarda y se comparte como texto, sin tocar', () => {
  const evil = 'A) <img src=x onerror="alert(1)"> pintar. B) <script>alert(\'x\')</script> javascript:alert(1) después de A.\u0007‮ fin';
  const acc = M0.acceptText(prep({ own: { lang: 'es', text: '', frags: [], ref: null }, t: null, mk: null }), evil, 'es');
  assert.equal(acc.error, null);
  assert.equal(acc.own.text, evil);
  const st = S.build(acc.own);
  const k = st.words.findIndex((w) => w.t === 'script');
  assert.ok(k > 0);
  assert.equal(M0.fragText(st, 0, k), 'A) <img src=x onerror="alert(1)"> pintar. B) <script', 'el fragmento es el texto literal');
  const s = prep({ own: acc.own, t: [row('A', 1), row('B', 1, 'A')], mk: [{ from: 0, to: 0, kind: 'activity', act: 'A' }] });
  const sh = M0.share(s, 'es');
  assert.equal(sh.blocked, null);
  assert.equal(U.decode(sh.student).state.own.text, evil);
  assert.doesNotMatch(decodeURIComponent(sh.student), /<script|javascript:/, 'el enlace no lleva el texto en claro');
});

test('T021: un texto demasiado largo se avisa y no se acepta; un enlace que no cabe tampoco se da', () => {
  const max = U.LIMITS.ownText;
  assert.equal(max, 3000);
  const empty = prep({ own: { lang: 'es', text: '', frags: [], ref: null }, t: null, mk: null });
  for (const lang of ['es', 'en']) {
    const long = M0.acceptText(empty, 'palabra '.repeat(400), lang);
    assert.equal(long.error.code, 'tooLong');
    assert.equal(long.own, null);
    assert.ok(notKey(long.error.text));
    assert.match(long.error.text, /3200/);
    assert.match(long.error.text, /3000|3\.000|3,000/);
  }
  assert.equal(M0.acceptText(empty, 'x'.repeat(max), 'es').error, null, 'justo en el límite, sí');
  assert.equal(M0.acceptText(empty, ' \n\t ', 'es').error.code, 'empty', 'sin ninguna palabra, no');
  // Un texto que no se comprime (3000 caracteres al azar de muchos alfabetos) no cabe en la URL: sin enlace.
  let seed = 7;
  const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  const noise = Array.from({ length: max }, () => String.fromCodePoint(0x4e00 + Math.floor(rnd() * 20000))).join('');
  const sh = M0.share(prep({ own: { lang: 'es', text: noise, frags: [], ref: null }, t: [row('A', 1)], mk: null }), 'es');
  assert.equal(sh.blocked, 'tooLong');
  assert.equal(sh.student, null);
  assert.ok(sh.issues.some((i) => i.code === 'tooLong' && notKey(i.text)));
  // Sin texto, nada que compartir.
  assert.equal(M0.share(empty, 'es').blocked, 'empty');
});

test('T021: al editar el texto, los subrayados que no cambian se conservan (desplazados) y los demás se quitan y se cuentan', () => {
  const s = prep();
  const edited = FERIA.replace('montar los experimentos', 'montar los tres experimentos');
  const acc = M0.acceptText(s, edited, 'es');
  assert.equal(acc.error, null);
  assert.equal(acc.own.text, edited);
  assert.deepEqual(acc.own.frags, []);
  assert.equal(acc.dropped, 1, 'solo el subrayado de la frase cambiada');
  const st = S.build({ lang: 'es', text: edited, frags: [], ref: null });
  const texts = acc.marks.map((mk) => M0.fragText(st, mk.from, mk.to));
  assert.ok(texts.includes('Los carteles se preparan después de reservar el aula'));
  assert.ok(texts.includes('Montar los experimentos requiere el aula reservada y los carteles hechos'), 'los de después, desplazados');
  assert.ok(texts.includes('2 horas'));
  assert.ok(!texts.includes('montar los tres experimentos'));
  // El idioma del texto lo elige el docente; sin cambios en el texto, todo se queda.
  const same = M0.acceptText(s, FERIA, 'en');
  assert.equal(same.own.lang, 'en');
  assert.equal(same.dropped, 0);
  assert.deepEqual(same.marks, s.mk);
});

// ── T027: revisión de nivel 2 (ronda 1) ────────────────────────────────────────────────────────────────────
const decodes = (hash) => { const d = U.decode(hash); assert.equal(d.warning, undefined, `el enlace no se abre: ${hash.slice(0, 80)}…`); return d.state; };

test('T027 (F1) · el enlace del enunciado propio siempre se abre: las celdas se recortan como en la tabla de siempre', () => {
  const long = 'Reservar el aula magna del edificio de ciencias para la jornada de puertas abiertas del departamento';
  // La URL de «preparar» con una celda larga y la tabla del alumno de un enunciado propio con 41 filas.
  const p = prep({ t: [row('A', 1, '', long), row('B', 3, 'A'), row('C', 4, 'B'), row('D', 2, 'C')] });
  const back = decodes(U.encodeSafe(p).hash);
  assert.equal(back.st, 'own');
  assert.equal(back.own.text, FERIA);
  assert.equal(back.t[0].name, long.slice(0, U.LIMITS.name));
  const stu = Object.assign({}, decodes(M0.share(prep(), 'es').student), { t: Array.from({ length: 41 }, (_, k) => row(`A${k}`, 1)) });
  const again = decodes(U.encodeSafe(stu).hash);
  assert.equal(again.t.length, U.LIMITS.rows);
});

test('T027 (F1) · con una tabla del docente que no cabe en el enlace no se comparte, y se dice por qué', () => {
  const long = 'x'.repeat(U.LIMITS.name + 1);
  for (const t of [[row('A', 1, '', long), row('B', 3, 'A'), row('C', 4, 'B'), row('D', 2, 'C')],
    Array.from({ length: U.LIMITS.rows + 1 }, (_, k) => row(`A${k}`, 1, k ? `A${k - 1}` : ''))]) {
    const sh = M0.share(prep({ t, mk: null }), 'es');
    // Un nombre largo no cabe en el enlace; 41 filas ya son una tabla con errores (como en el taller, 30 como mucho).
    assert.equal(sh.blocked, t.length > U.LIMITS.rows ? 'invalid' : 'tooBig');
    assert.equal(sh.student, null);
    assert.ok(notKey(sh.issues[0].text));
  }
  // En el límite sí.
  const sh = M0.share(prep({ t: [row('A', 1, '', 'y'.repeat(U.LIMITS.name)), row('B', 3, 'A'), row('C', 4, 'B'), row('D', 2, 'C')] }), 'es');
  assert.equal(sh.blocked, null);
  decodes(sh.student); decodes(sh.solution);
});

test('T027 (F10, F4) · una duración subrayada que no casa con la tabla, o sobre una actividad que no está, impide compartir', () => {
  const dur = M0.share(prep({ mk: FERIA_MARKS.map((m) => (m.kind === 'duration' ? Object.assign({}, m, { value: 5 }) : m)) }), 'es');
  assert.equal(dur.blocked, 'mismatch');
  assert.deepEqual(dur.issues.map((i) => i.code), ['durMismatch']);
  assert.ok(notKey(dur.issues[0].text) && dur.issues[0].text.includes('2 horas'), dur.issues[0].text);
  const unk = M0.share(prep({ mk: FERIA_MARKS.map((m) => (m.kind === 'duration' ? Object.assign({}, m, { act: 'Z' }) : m)) }), 'es');
  assert.equal(unk.blocked, 'mismatch');
  assert.deepEqual(unk.issues.map((i) => i.code), ['unknownAct']);
});

test('T027 (F7) · la forma de la tabla (posteriores) se conserva al pasar a «preparar», al abrir la solución y al abrir M1 o M2', () => {
  const succ = [row('A', 1, 'B', 'Reservar el aula'), row('B', 3, 'C', 'Carteles'), row('C', 4, 'D', 'Experimentos'), row('D', 2, '', 'Recoger')];
  const sh = M0.share(prep({ mode: 'succ', t: succ }), 'es');
  assert.equal(sh.blocked, null);
  const sol = M0.openSolution(decodes(sh.solution));
  assert.equal(sol.mode, 'succ');
  const preds = (s) => { const pj = M0.model(s, 'es').project; return Object.fromEntries(pj.activities.map((a) => [a.id, pj.preds[a.id].slice()])); };
  assert.deepEqual(preds(sol), { A: [], B: ['A'], C: ['B'], D: ['C'] });
  const back = M0.toPrepare(decodes(sh.student));
  assert.equal(back.mode, 'succ');
  assert.deepEqual(preds(back), { A: [], B: ['A'], C: ['B'], D: ['C'] });
  assert.equal(M0.openState(m0State(), 'm1', succ, 'succ').mode, 'succ');
});

test('T027 (F5) · con la tabla en error, las actividades subrayadas que tienen fila no avisan «no está en la tabla»', () => {
  const st = S.build(ST.get('ej5'), 'es');
  const aA = frag(st, 'aA'), aB = frag(st, 'aB');
  const mk = [{ from: aA.from, to: aA.to, kind: 'activity', act: 'A' }, { from: aB.from, to: aB.to, kind: 'activity', act: 'B' }];
  const m = M0.model(m0State({ t: [row('A', 3), row('B', '')], mk }), 'es');
  assert.equal(m.project, null, 'la tabla tiene un error (falta una duración)');
  assert.deepEqual(m.warnings, []);
  const z = M0.model(m0State({ t: [row('A', 3), row('Z', '')], mk }), 'es');
  assert.deepEqual(z.warnings.map((w) => [w.code, w.ids]), [['markedMissing', ['B']]]);
});

test('T027 (F11) · el enlace que se copia es la página sin su consulta; desde un archivo del equipo se avisa', () => {
  assert.deepEqual(M0.shareUrl('https://x.org/lab/cpm.html?lang=en&token=1#v=m0', '#v=m0&st=own'), { url: 'https://x.org/lab/cpm.html#v=m0&st=own', local: false });
  assert.deepEqual(M0.shareUrl('file:///C:/Users/ana/Descargas/cpm.html#v=m0', '#v=m0'), { url: 'file:///C:/Users/ana/Descargas/cpm.html#v=m0', local: true });
});

test('T027 (F17) · un subrayado que la URL no puede guardar se dice en el panel, no se pierde en silencio', () => {
  assert.equal(M0.markProblem([], { from: 0, to: 1, kind: 'duration', act: 'A', value: 2.5 }), null);
  assert.equal(M0.markProblem([], { from: 0, to: 1, kind: 'duration', act: 'A', value: 0.00001 }), 'valueTooBig');
  assert.equal(M0.markProblem([], { from: 0, to: 1, kind: 'duration', act: 'A', value: 12345678 }), 'valueTooBig');
  const many = Array.from({ length: 200 }, (_, k) => ({ from: k, to: k, kind: 'none' }));
  assert.equal(M0.markProblem(many, { from: 300, to: 300, kind: 'none' }), 'tooMany');
  assert.equal(M0.markProblem(many, { from: 5, to: 5, kind: 'none' }), null, 'sustituir uno no suma');
});

// ── T027, ronda 2 ──────────────────────────────────────────────────────────────────────────────────────────
test('T027 (ronda 2, F3) · el enlace recorta cada celda de la tabla del alumno y de la referencia a su límite', () => {
  const L = U.LIMITS;
  const big = { id: 'A'.repeat(L.id + 3), name: 'n'.repeat(L.name + 5), duration: '1'.repeat(L.duration + 4), links: 'B'.repeat(L.links + 7) };
  const base = decodes(M0.share(prep(), 'es').student);
  for (const s of [Object.assign({}, base, { t: [big] }), Object.assign({}, base, { own: Object.assign({}, base.own, { ref: { mode: 'pred', rows: [big] } }) })]) {
    const back = decodes(U.encodeSafe(s).hash);
    const r = back.t ? back.t[0] : back.own.ref.rows[0];
    assert.deepEqual([r.id.length, r.name.length, r.duration.length, r.links.length], [L.id, L.name, L.duration, L.links]);
  }
});

test('T027 (ronda 2, F5) · cada celda de la tabla del docente que no cabe impide compartir; en el límite, no', () => {
  const L = U.LIMITS;
  const withA = (a) => prep({ t: [Object.assign(row('A', 1, '', 'Reservar el aula'), a), row('B', 3, 'A'), row('C', 4, 'B'), row('D', 2, 'C')] });
  for (const [a, why] of [[{ duration: '1'.repeat(L.duration + 1) }, 'duración'], [{ links: ' '.repeat(L.links + 1) }, 'precedencias'], [{ id: `A${' '.repeat(L.id)}` }, 'identificador'], [{ name: 'n'.repeat(L.name + 1) }, 'nombre']]) {
    assert.equal(M0.share(withA(a), 'es').blocked, 'tooBig', why);
  }
  for (const [a, why] of [[{ duration: `${'0'.repeat(L.duration - 1)}1` }, 'duración'], [{ links: ' '.repeat(L.links) }, 'precedencias'], [{ id: `A${' '.repeat(L.id - 1)}` }, 'identificador']]) {
    const sh = M0.share(withA(a), 'es');
    assert.notEqual(sh.blocked, 'tooBig', why);
  }
});

test('T027 (ronda 2, F4) · un enlace que no se podría abrir no se da y se dice por qué', () => {
  const text = 'x\u0001\u0001'.repeat(1000);
  const rows = Array.from({ length: 30 }, (_, k) => row(`A${k}`, 1, k ? `A${k - 1}` : '', '"'.repeat(80)));
  const mk = Array.from({ length: 200 }, (_, k) => ({ from: k, to: k, kind: 'none' }));
  const st = prep({ own: { lang: 'es', text, frags: [], ref: null }, t: rows, mk });
  assert.deepEqual([U.encodeSafe(st).hash, U.encodeSafe(st).reason], [null, 'unreadable']);
  const sh = M0.share(st, 'es');
  assert.equal(sh.blocked, 'tooLong');
  assert.match(sh.issues[0].text, /no se podría abrir/);
  // Fuera de un enunciado propio no se descomprime nada: una tabla normal no es nunca «ilegible».
  assert.notEqual(U.encodeSafe(m0State({ t: rows })).reason, 'unreadable');
});

test('T027 (ronda 2, F9) · un subrayado con más de 60 precedencias se dice en el panel', () => {
  const gives = (n) => Array.from({ length: n }, (_, k) => [`A${k}`, 'B']);
  assert.equal(M0.markProblem([], { from: 0, to: 1, kind: 'precedence', gives: gives(60) }), null);
  assert.equal(M0.markProblem([], { from: 0, to: 1, kind: 'precedence', gives: gives(61) }), 'tooManyEdges');
});

// ---------- F3c, T009: enunciado al azar (spec f3c-enunciados, AC7–AC8; plan §4, P5, P7 y P12) ----------
const SG = require('../js/core/stmtgen.js');
const Store = require('../js/store.js');
const gen = (extra) => m0State(Object.assign({ st: 'gen', sd: 15, lv: 'medium', sv: SG.VERSION }, extra || {}));

test('F3c: el modelo de un enunciado al azar es el de stmtgen.make con la semilla, el nivel y el contexto', () => {
  for (const [extra, ctx] of [[{}, undefined], [{ cx: 'lab', lv: 'hard', sd: 22 }, 'lab'], [{ lv: 'easy', sd: 4, cx: 'home' }, 'home']]) {
    const s = gen(extra);
    const r = SG.make(s.sd, s.lv, ctx ? { ctx } : {});
    for (const lang of ['es', 'en']) {
      const m = M0.model(s, lang);
      assert.deepEqual(m.def, r.def);
      assert.equal(m.st.id, 'gen');
      assert.deepEqual(m.gen, { ctx: r.ctx, lv: s.lv, oldVersion: false, title: r.def.title[lang] });
      assert.deepEqual(m.rows, []);
    }
  }
  // Un nivel que no es de los tres se lee como medio; la clave del enunciado cambia con la semilla, el nivel y el contexto.
  assert.deepEqual(M0.model(gen({ lv: 'custom' }), 'es').def, SG.make(15, 'medium').def);
  assert.notEqual(M0.model(gen(), 'es').stKey, M0.model(gen({ sd: 16 }), 'es').stKey);
  assert.equal(M0.model(m0State(), 'es').stKey, 'ej5');
});

test('F3c: otra versión del generador en el enlace se avisa y se abre con la actual', () => {
  assert.equal(M0.model(gen({ sv: SG.VERSION + 1 }), 'es').gen.oldVersion, true);
  assert.equal(M0.model(gen({ sv: null }), 'es').gen.oldVersion, false);
  assert.deepEqual(M0.model(gen({ sv: SG.VERSION + 1 }), 'es').def, M0.model(gen(), 'es').def);
});

test('F3c: genSeed da la semilla misma si tiene enunciado, y si no la siguiente que lo tenga', () => {
  assert.equal(M0.genSeed(15, 'medium', null), 15);
  assert.equal(M0.genSeed(999999, 'hard', 'lab'), 999999);
  const fake = { make: (sd) => (sd < 20 ? { ok: false, reason: 'assign' } : { ok: true }) };
  assert.equal(M0.genSeed(17, 'easy', null, fake), 20);
  assert.equal(M0.genSeed(999999, 'easy', null, { make: (sd) => ({ ok: sd === 2 }) }), 2);
});

test('F3c: las opciones del selector llevan «Enunciado al azar» solo si es el abierto (hasta la publicación, T013)', () => {
  const ids = (cur) => M0.statementOptions(cur, 'es', false).map((o) => o.value);
  assert.ok(!ids('ej5').includes('gen'));
  assert.ok(ids('gen').includes('gen'));
  assert.deepEqual(ids('ej5').slice(0, 7), ['ej1', 'ej2', 'ej3', 'ej4', 'ej5', 'ej6', 'ej7']);
  assert.ok(M0.statementOptions('ej5', 'es', true).some((o) => o.value === 'gen'));
  assert.equal(M0.statementOptions('gen', 'en', true).find((o) => o.value === 'gen').label, 'Random statement');
});

test('F3c: el store abre un enunciado al azar con su semilla, nivel, contexto y versión, y los acota', () => {
  const s = Store.reduce(m0State({ t: [row('A', 1)] }), { type: 'm0', st: 'gen', sd: 31, lv: 'hard', cx: 'product', sv: SG.VERSION, mm: 'practice' }, 1);
  assert.deepEqual([s.st, s.sd, s.lv, s.cx, s.sv, s.t, s.mk], ['gen', 31, 'hard', 'product', SG.VERSION, null, null]);
  const bad = Store.reduce(m0State(), { type: 'm0', st: 'gen', sd: 0, lv: 'custom', cx: 'moon', sv: 'x' }, 1);
  assert.deepEqual([bad.st, bad.lv, bad.cx, bad.sv], ['gen', 'medium', null, null]);
  // Volver a un enunciado de la lista quita el contexto y la versión.
  const back = Store.reduce(s, { type: 'm0', st: 'ej2', mm: 'practice' }, 1);
  assert.deepEqual([back.st, back.cx, back.sv], ['ej2', null, null]);
});

test('F3c: los subrayados de un enunciado al azar pasan al otro idioma por sus fragmentos', () => {
  const s = gen();
  const st = S.build(M0.model(s, 'es').def, 'es');
  const f = frag(st, 'aA');
  const moved = M0.switchLang(Object.assign({}, s, { mk: [{ from: f.from, to: f.to, kind: 'activity', act: 'A' }] }), 'es', 'en');
  const fe = frag(S.build(M0.model(s, 'en').def, 'en'), 'aA');
  assert.deepEqual([moved.dropped, moved.marks[0].from, moved.marks[0].to], [0, fe.from, fe.to]);
});
