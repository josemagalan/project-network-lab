'use strict';
// Paridad del núcleo con el gemelo en Python (constitución, principio 5; spec f4b-montecarlo-indices, AC6 y AC7; plan
// §3 y P5). Para cada caso de tests/parity/ (el JSON que descarga M7), core/sim + core/mc y python/pnl_montecarlo.py
// dan las mismas duraciones réplica a réplica, la misma media, desviación, percentiles y P del plazo, y los mismos
// índices, a 1e-9. Sin Python 3 en el equipo, la prueba se salta con un aviso; en la CI (CI=true), falla.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const S = require('../js/core/sim.js');
const MC = require('../js/core/mc.js');

const ROOT = path.resolve(__dirname, '..');
const PY = path.join(ROOT, 'python', 'pnl_montecarlo.py');
const CASES = path.join(__dirname, 'parity');
const TOL = 1e-9;

// python3 o python, y solo si dice «Python 3.x» (en Windows, `python` puede ser el atajo de la tienda; analyze A7).
function findPython() {
  for (const cmd of ['python3', 'python']) {
    const r = spawnSync(cmd, ['--version'], { encoding: 'utf8' });
    if (!r.error && r.status === 0 && /^Python 3\.(\d+)/.test(`${r.stdout}${r.stderr}`.trim())) return cmd;
  }
  return null;
}
const PYTHON = findPython();
const skip = !PYTHON && !process.env.CI ? 'sin Python 3 en este equipo: la paridad la comprueba la CI' : false;

// El modelo de core/sim a partir del JSON de intercambio (predecesoras por id, en orden topológico).
function modelOf(data) {
  const idx = new Map(data.activities.map((a, i) => [a.id, i]));
  return { acts: data.activities.map((a) => ({ id: a.id, preds: a.preds.map((q) => idx.get(q)), dist: a.dist })) };
}
function jsAnalyse(data) {
  const model = modelOf(data);
  const res = S.run({ kind: 'project', model, n: data.reps, us: data.seed, track: true });
  const sorted = Float64Array.from(res.durations).sort();
  const sum = S.summary(res.durations);
  const pct = { 50: MC.percentile(sorted, 0.5), 80: MC.percentile(sorted, 0.8), 90: MC.percentile(sorted, 0.9) };
  if (data.percentile != null) pct[Math.round(data.percentile * 100)] = MC.percentile(sorted, data.percentile);
  const ix = MC.indices(res, model, { corr: data.corr });
  return { res, sum, pct, ix, pT: data.deadline == null ? null : sum.pLE(data.deadline) };
}
const near = (a, b, msg) => assert.ok(Math.abs(a - b) <= TOL * Math.max(1, Math.abs(b)), `${msg}: JS ${b} · Python ${a}`);

test('Principio 5: hay casos de paridad y el gemelo existe', () => {
  assert.ok(fs.existsSync(PY));
  assert.ok(fs.readdirSync(CASES).filter((f) => f.endsWith('.json')).length >= 6);
});

test('Principio 5: en la CI hay Python 3', { skip: !process.env.CI }, () => {
  assert.ok(PYTHON, 'la CI debe tener Python 3');
});

for (const file of fs.readdirSync(CASES).filter((f) => f.endsWith('.json')).sort()) {
  test(`AC6 y AC7: ${file}: el .py y el núcleo dan lo mismo con la misma semilla`, { skip }, () => {
    const data = JSON.parse(fs.readFileSync(path.join(CASES, file), 'utf8'));
    assert.equal(data.format, 'pnl-montecarlo');
    const r = spawnSync(PYTHON, [PY, path.join(CASES, file), '--json'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    assert.equal(r.status, 0, r.stderr);
    const py = JSON.parse(r.stdout);
    const js = jsAnalyse(data);
    assert.equal(py.durations.length, data.reps);
    // Réplica a réplica: una desincronización de la secuencia saltaría aquí (spec, Points to clarify).
    py.durations.forEach((v, i) => near(v, js.res.durations[i], `réplica ${i}`));
    near(py.mean, js.sum.mean, 'media');
    near(py.sd, js.sum.sd, 'desviación');
    for (const [k, v] of Object.entries(js.pct)) near(py.percentiles[k], v, `P${k}`);
    if (js.pT != null) near(py.p_deadline, js.pT, 'P del plazo');
    for (const k of ['crit', 'cruc', 'sig']) js.ix[k].forEach((v, i) => near(py[k][i], v, `${k} de ${data.activities[i].id}`));
    assert.deepEqual(py.paths.map((p) => p.ids), js.ix.paths.list.map((p) => p.ids));
    py.paths.forEach((p, i) => { near(p.crit, js.ix.paths.list[i].crit, `criticidad del camino ${i}`); near(p.mean, js.ix.paths.list[i].mean, `media del camino ${i}`); });
    assert.equal(py.count, js.ix.paths.count);
    assert.equal(py.more, js.ix.paths.more);
  });
}

test('AC7: el informe en texto del .py lleva la media, los percentiles y la tabla de índices', { skip }, () => {
  const r = spawnSync(PYTHON, [PY, path.join(CASES, 'klastorin-discrete.json')], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  const js = jsAnalyse(JSON.parse(fs.readFileSync(path.join(CASES, 'klastorin-discrete.json'), 'utf8')));
  assert.ok(r.stdout.includes(js.sum.mean.toFixed(4)), r.stdout);
  assert.ok(r.stdout.includes(`P90 = ${js.pct[90].toFixed(4)}`));
  for (const id of ['A', 'B', 'C', 'D']) assert.match(r.stdout, new RegExp(`^${id}\\s+\\d`, 'm'));
});

test('AC7: el .py rechaza un archivo que no es de M7', { skip }, () => {
  const tmp = path.join(require('node:os').tmpdir(), `pnl-bad-${process.pid}.json`);
  fs.writeFileSync(tmp, JSON.stringify({ format: 'otro', activities: [] }));
  const r = spawnSync(PYTHON, [PY, tmp], { encoding: 'utf8' });
  fs.unlinkSync(tmp);
  assert.notEqual(r.status, 0);
});
