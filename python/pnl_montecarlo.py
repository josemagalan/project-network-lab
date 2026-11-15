#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
pnl_montecarlo.py — Montecarlo simulation of a project network, the Python twin of Project Network Lab (M7).
pnl_montecarlo.py — Simulación de Montecarlo de una red de proyecto, el gemelo en Python de Project Network Lab (M7).

Same seed, same numbers as the web: it uses the same random generator (mulberry32) and draws the durations in the
same order (replica by replica, activity by activity). Values agree to 1e-9 (the last bit of log, sin, cos and exp
may differ between JavaScript and Python).
Misma semilla, mismos números que la web: usa el mismo generador (mulberry32) y saca las duraciones en el mismo orden
(réplica a réplica, actividad a actividad). Los valores coinciden a 1e-9 (el último bit de log, sin, cos y exp puede
cambiar entre JavaScript y Python).

Usage / uso:
    python3 pnl_montecarlo.py project.json [--reps N] [--seed S] [--json]

project.json is the file that M7 downloads ("Project as JSON"). Without --json it prints a report: mean, percentiles,
P(duration <= deadline), the indices of each activity and the criticality of the paths; with --json, everything as JSON.
project.json es el archivo que descarga M7 («Proyecto en JSON»). Sin --json escribe un informe: media, percentiles,
P(duración <= plazo), los índices de cada actividad y la criticidad de los caminos; con --json, todo en JSON.

As a module / como módulo:
    import json
    import pnl_montecarlo as pm
    with open('project.json', encoding='utf-8') as f:
        res = pm.analyse(json.load(f), reps=10000, seed=2026)
    print(res['mean'], res['crit'])   # also res['durations'], the duration of every replica / la de cada réplica

Only the Python 3 standard library (3.8 or later). / Solo la biblioteca estándar de Python 3 (3.8 o posterior).
Code: MIT licence, Project Network Lab (https://github.com/josemagalan/project-network-lab).
"""
import argparse
import heapq
import json
import math
import re
import sys

FORMAT = 'pnl-montecarlo'
VERSION = 1
PATH_LIMIT = 50
M32 = 0xFFFFFFFF
ID_RE = re.compile(r'[A-Z0-9]{1,4}')   # the ids the web accepts / los identificadores que acepta la web


def _num(v, what):
    """A finite number, or ValueError (as isNum in core/sim.js). / Un número finito, o ValueError."""
    if isinstance(v, bool) or not isinstance(v, (int, float)) or not math.isfinite(v):
        raise ValueError('%s: not a finite number / no es un número finito' % what)
    return float(v)


# ---------- random numbers / números aleatorios ----------

def _imul(a, b):
    return (a * b) & M32


def mulberry32(seed):
    """Uniform numbers in [0, 1), the same sequence as core/rng.js. / Uniformes en [0, 1), como core/rng.js."""
    state = [seed & M32]

    def nxt():
        state[0] = (state[0] + 0x6D2B79F5) & M32
        t = state[0]
        t = _imul(t ^ (t >> 15), t | 1)
        t ^= (t + _imul(t ^ (t >> 7), t | 61)) & M32
        return ((t ^ (t >> 14)) & M32) / 4294967296
    return nxt


class Sampler:
    """Normal (Box–Muller, keeping the pair) and gamma (Marsaglia–Tsang), as core/sim.js.
    Normal (Box–Muller, guardando el par) y gamma (Marsaglia–Tsang), como core/sim.js."""

    def __init__(self, seed):
        self.u = mulberry32(seed)
        self.spare = None

    def unif(self):
        x = self.u()
        while x <= 0:
            x = self.u()
        return x

    def normal(self):
        if self.spare is not None:
            s = self.spare
            self.spare = None
            return s
        r = math.sqrt(-2 * math.log(self.unif()))
        t = 2 * math.pi * self.u()
        self.spare = r * math.sin(t)
        return r * math.cos(t)

    def gamma(self, k):
        d = k - 1 / 3
        c = 1 / math.sqrt(9 * d)
        while True:
            while True:
                x = self.normal()
                v = 1 + c * x
                if v > 0:
                    break
            v = v * v * v
            w = self.unif()
            if w < 1 - 0.0331 * x * x * x * x or math.log(w) < 0.5 * x * x + d * (1 - v + math.log(v)):
                return d * v


# ---------- three-point estimates / tres estimaciones ----------

def _beta_var(al, be):
    return (al * be) / ((al + be) ** 2 * (al + be + 1))


def beta_params(kind, a, m, b):
    """Beta-PERT (lambda = 4) or classic beta (mode m, sd (b - a)/6) on [a, b]; None if a = b.
    Beta-PERT (lambda = 4) o beta clásica (moda m, desviación (b - a)/6) en [a, b]; None si a = b."""
    if not b > a:
        return None
    p = (m - a) / (b - a)
    if kind == 'pert':
        return 1 + 4 * p, 1 + 4 * (1 - p)
    # classic: variance 1/36 on [0, 1] (bisection, as core/threept.js) / clásica: varianza 1/36 en [0, 1] (bisección)
    lo, hi = 2.0, 1e6
    k = 0
    while k < 200 and hi - lo > 1e-13 * hi:
        mid = (lo + hi) / 2
        al, be = 1 + p * (mid - 2), 1 + (1 - p) * (mid - 2)
        if _beta_var(al, be) > 1 / 36:
            lo = mid
        else:
            hi = mid
        k += 1
    s = (lo + hi) / 2
    return 1 + p * (s - 2), 1 + (1 - p) * (s - 2)


def tri_quantile(a, m, b, u):
    """Inverse distribution function of the triangular. / Inversa de la función de distribución de la triangular."""
    if not b > a or u <= 0:
        return a
    if u >= 1:
        return b
    w = b - a
    f = (m - a) / w
    return a + math.sqrt(u * w * (m - a)) if u <= f else b - math.sqrt((1 - u) * w * (b - m))


LN_SQRT_2PI = 0.9189385332046728


def phi(z):
    """Standard normal distribution function, as core/threept.js. / Función de distribución de la normal estándar."""
    if z != z:
        return float('nan')
    if z < -37:
        return 0.0
    if z > 37:
        return 1.0
    if abs(z) > 8:
        x = abs(z)
        f = x
        for k in range(60, 0, -1):
            f = x + k / f
        tail = math.exp(-0.5 * x * x - LN_SQRT_2PI) / f
        return tail if z < 0 else 1 - tail
    s, t, b, q, i = z, 0.0, z, z * z, 1
    while s != t:
        t = s
        i += 2
        b *= q / i
        s = t + b
    v = s * math.exp(-0.5 * q - LN_SQRT_2PI)
    if z < -3:
        x = -z
        f = x
        for k in range(80, 0, -1):
            f = x + k / f
        return math.exp(-0.5 * x * x - LN_SQRT_2PI) / f
    return min(1.0, 0.5 + v)


# ---------- distributions / distribuciones ----------

class Dist:
    """One activity duration: pert, classic, tri, unif, normal (truncated at 0), logn, disc or fixed.
    La duración de una actividad: pert, classic, tri, unif, normal (truncada en 0), logn, disc o fixed."""

    def __init__(self, spec):
        self.kind = k = spec['kind']
        self.fixed = False
        if k == 'fixed':
            self.fixed, self.d = True, _num(spec['d'], 'd')
        elif k in ('pert', 'classic', 'tri'):
            self.a, self.m, self.b = _num(spec['a'], 'a'), _num(spec['m'], 'm'), _num(spec['b'], 'b')
            if not (0 <= self.a <= self.m <= self.b):
                raise ValueError('a, m, b not valid')
            self.fixed, self.d = not self.b > self.a, self.a
            if not self.fixed and k != 'tri':
                self.alpha, self.beta = beta_params(k, self.a, self.m, self.b)
        elif k == 'unif':
            self.a, self.b = _num(spec['a'], 'a'), _num(spec['b'], 'b')
            if not (0 <= self.a <= self.b):
                raise ValueError('uniform not valid')
            self.fixed, self.d = not self.b > self.a, self.a
        elif k == 'normal':
            var = _num(spec['var'], 'var')
            if var < 0:
                raise ValueError('normal not valid')
            self.mu, self.sd = _num(spec['mu'], 'mu'), math.sqrt(var)
        elif k == 'logn':
            mu, sd = _num(spec['mu'], 'mu'), _num(spec['sd'], 'sd')
            self.mu = mu                         # the mean, as core/mc.js moments / la media, como moments de core/mc.js
            if mu < 0 or sd < 0:
                raise ValueError('lognormal not valid')
            if not (mu > 0 and sd > 0):
                self.fixed, self.d = True, mu
            else:
                s2 = math.log(1 + (sd / mu) ** 2)
                self.lm, self.ls = math.log(mu) - s2 / 2, math.sqrt(s2)
        elif k == 'disc':
            self.x = [_num(v, 'x') for v in spec['x']]
            p = [_num(v, 'p') for v in spec['p']]
            self.p = p
            if not self.x or len(self.x) != len(p) or min(self.x) < 0 or min(p) <= 0 or len(set(self.x)) != len(self.x):
                raise ValueError('discrete not valid')
            self.c, acc = [], 0.0
            for v in p:
                acc += v
                self.c.append(acc)
            if abs(acc - 1) > 1e-9:
                raise ValueError('discrete probabilities do not add up to 1')
            self.fixed, self.d = len(self.x) == 1, self.x[0]
        else:
            raise ValueError('unknown distribution ' + str(k))

    def draw(self, s):
        k = self.kind
        if k == 'normal':
            if self.sd == 0:
                return max(0.0, self.mu)
            for _ in range(1000):
                x = self.mu + self.sd * s.normal()
                if x >= 0:
                    return x
            return 0.0
        if self.fixed:
            return self.d
        if k == 'tri':
            return tri_quantile(self.a, self.m, self.b, s.u())
        if k == 'unif':
            return self.a + (self.b - self.a) * s.u()
        if k == 'logn':
            return math.exp(self.lm + self.ls * s.normal())
        if k == 'disc':
            u = s.u()
            for j in range(len(self.c) - 1):
                if u < self.c[j]:
                    return self.x[j]
            return self.x[-1]
        x = s.gamma(self.alpha)                  # pert, classic: beta as a ratio of gammas / beta como cociente de gammas
        return self.a + (self.b - self.a) * x / (x + s.gamma(self.beta))

    def mean(self):
        """Mean (orders the paths, as core/mc.js). / Media (ordena los caminos, como core/mc.js)."""
        k = self.kind
        if k == 'normal':
            if not self.sd > 0:
                return max(0.0, self.mu)
            al = -self.mu / self.sd
            lam = math.exp(-al * al / 2) / math.sqrt(2 * math.pi) / (1 - phi(al))
            return self.mu + self.sd * lam
        if k == 'logn':
            return self.mu
        if self.fixed:
            return self.d
        if k == 'tri':
            return (self.a + self.m + self.b) / 3
        if k == 'unif':
            return (self.a + self.b) / 2
        if k == 'disc':
            mu = 0.0                             # same order and bits as core/mc.js / mismo orden y bits que core/mc.js
            for v, q in zip(self.x, self.p):
                mu += v * q
            return mu
        return self.a + (self.b - self.a) * self.alpha / (self.alpha + self.beta)


# ---------- the project / el proyecto ----------

class Project:
    """The activities of the JSON file, in topological order. / Las actividades del JSON, en orden topológico."""

    def __init__(self, data):
        if data.get('format') != FORMAT or data.get('version') != VERSION:
            raise ValueError('not a Project Network Lab Montecarlo file (format %s, version %s)' % (FORMAT, VERSION))
        acts = data['activities']
        index = {a['id']: i for i, a in enumerate(acts)}
        self.ids = [a['id'] for a in acts]
        for a in self.ids:
            if not isinstance(a, str) or not ID_RE.fullmatch(a):
                raise ValueError('activity id not valid / identificador no válido: %r' % (a,))
        self.names = [a.get('name', '') for a in acts]
        self.preds = []
        for i, a in enumerate(acts):
            p = [index[q] for q in a['preds']]
            if any(q >= i for q in p):
                raise ValueError('activities must be in topological order: ' + a['id'])
            self.preds.append(p)
        self.succ = [[] for _ in acts]
        for i, p in enumerate(self.preds):
            for q in p:
                self.succ[q].append(i)
        self.dists = [Dist(a['dist']) for a in acts]
        self.unit = data.get('unit', '')


def tol(t):
    """Rounding tolerance: total float 0 up to this is critical. / Tolerancia: holgura total 0 hasta aquí es crítica."""
    return 1e-9 * max(1.0, abs(t))


def simulate(project, reps, seed):
    """Durations of the project and, for each activity, its duration and total float in every replica.
    Duración del proyecto y, de cada actividad, su duración y su holgura total en cada réplica."""
    s = Sampler(seed & M32)
    k = len(project.ids)
    T = [0.0] * reps
    D = [[0.0] * reps for _ in range(k)]
    TF = [[0.0] * reps for _ in range(k)]
    ef = [0.0] * k
    lf = [0.0] * k
    dur = [0.0] * k
    for r in range(reps):
        end = 0.0
        for i in range(k):
            es = 0.0
            for q in project.preds[i]:
                if ef[q] > es:
                    es = ef[q]
            d = project.dists[i].draw(s)
            D[i][r] = dur[i] = d
            ef[i] = es + d
            if ef[i] > end:
                end = ef[i]
        for i in range(k - 1, -1, -1):           # backward pass / pasada hacia atrás
            l = end
            for q in project.succ[i]:
                ls = lf[q] - dur[q]
                if ls < l:
                    l = ls
            lf[i] = l
            TF[i][r] = l - ef[i]
        T[r] = end
    return T, D, TF


def percentile(sorted_values, p):
    """Smallest simulated value with F >= p. / El menor valor simulado con F ≥ p."""
    n = len(sorted_values)
    i = min(n - 1, max(0, math.ceil(p * n - 1e-9) - 1))
    return sorted_values[i]


def pearson(x, y):
    """Pearson correlation; 0 if x or y does not vary. / Correlación de Pearson; 0 si x o y no varían."""
    n = len(x)
    mx = sum(x) / n
    my = sum(y) / n
    sxy = sx = sy = 0.0
    for a, b in zip(x, y):
        dx, dy = a - mx, b - my
        sxy += dx * dy
        sx += dx * dx
        sy += dy * dy
    # No variation, with a relative threshold as in core/mc.js / sin variación, con umbral relativo como core/mc.js
    if not (sx / n > 1e-15 * max(1.0, mx * mx + sx / n)) or not (sy / n > 1e-15 * max(1.0, my * my + sy / n)):
        return 0.0
    return max(-1.0, min(1.0, sxy / math.sqrt(sx * sy)))


def ranks(x):
    """Average ranks, from 1 to n. / Rangos medios, de 1 a n."""
    n = len(x)
    idx = sorted(range(n), key=lambda i: (x[i], i))
    r = [0.0] * n
    i = 0
    while i < n:
        j = i
        while j + 1 < n and x[idx[j + 1]] - x[idx[i]] <= tol(x[idx[i]]):   # ties with tolerance / empates con tolerancia
            j += 1
        v = (i + j) / 2 + 1
        for q in range(i, j + 1):
            r[idx[q]] = v
        i = j + 1
    return r


def top_paths(project, limit=PATH_LIMIT):
    """The longest paths by mean duration, in non-increasing order. / Los caminos más largos por duración media."""
    k = len(project.ids)
    w = [d.mean() for d in project.dists]
    rest = [0.0] * k
    for i in range(k - 1, -1, -1):
        rest[i] = w[i] + (max(rest[j] for j in project.succ[i]) if project.succ[i] else 0.0)
    # A binary heap with the same total order as core/mc.js: longest mean first, then the smaller path.
    # Un montículo binario con el mismo orden total que core/mc.js: más media primero y, con empate, el camino menor.
    heap = []
    for i in range(k):
        if not project.preds[i]:
            heapq.heappush(heap, (-rest[i], [i], w[i]))
    out = []
    while heap and len(out) < limit:
        _, path, done = heapq.heappop(heap)
        last = path[-1]
        if not project.succ[last]:
            out.append((path, done))
            continue
        for j in project.succ[last]:
            heapq.heappush(heap, (-(done + rest[j]), path + [j], done + w[j]))
    return out


def count_paths(project):
    """Number of paths from start to end. / Número de caminos de principio a fin."""
    k = len(project.ids)
    c = [0] * k
    for i in range(k - 1, -1, -1):
        c[i] = sum(c[j] for j in project.succ[i]) if project.succ[i] else 1
    return sum(c[i] for i in range(k) if not project.preds[i])


def indices(project, T, D, TF, corr='pearson'):
    """Criticality, cruciality and significance of each activity, and criticality of the longest paths.
    Criticidad, crucialidad y significación de cada actividad, y criticidad de los caminos más largos.

    criticality / criticidad: share of replicas with total float 0 (ties count) / réplicas con holgura total 0 (con empates)
    cruciality / crucialidad: correlation (Pearson or Spearman) of d and T / correlación de d y T
    significance / significación (Williams 1992): mean of d/(d + TF) * T/E(T), 1 if TF = 0 / media de d/(d + HT) * T/E(T)
    """
    n = len(T)
    tbar = sum(T) / n
    crit, cruc, sig = [], [], []
    rt = ranks(T) if corr == 'spearman' else None
    for i in range(len(project.ids)):
        c = 0
        s = 0.0
        d, tf = D[i], TF[i]
        for r in range(n):
            is_crit = tf[r] <= tol(T[r])
            if is_crit:
                c += 1
            s += (1.0 if is_crit else d[r] / (d[r] + tf[r])) * T[r]
        crit.append(c / n)
        sig.append(s / n / tbar if tbar > 0 else 0.0)
        cruc.append(pearson(ranks(d), rt) if corr == 'spearman' else pearson(d, T))
    paths = []
    for path, mean in top_paths(project):
        c = 0
        for r in range(n):
            length = sum(D[i][r] for i in path)
            if length >= T[r] - tol(T[r]):
                c += 1
        paths.append({'ids': [project.ids[i] for i in path], 'mean': mean, 'crit': c / n})
    count = count_paths(project)
    return {'crit': crit, 'cruc': cruc, 'sig': sig, 'paths': paths, 'count': count, 'more': max(0, count - len(paths))}


def analyse(data, reps=None, seed=None):
    """Everything the web shows for a project file. / Todo lo que enseña la web para un archivo de proyecto."""
    project = Project(data)
    reps = int(reps if reps is not None else data['reps'])
    seed = int(seed if seed is not None else data['seed'])
    T, D, TF = simulate(project, reps, seed)
    st = sorted(T)
    mean = sum(st) / reps
    sd = math.sqrt(sum((x - mean) ** 2 for x in st) / (reps - 1)) if reps > 1 else 0.0
    out = {'reps': reps, 'seed': seed, 'mean': mean, 'sd': sd, 'min': st[0], 'max': st[-1],
           'percentiles': {str(p): percentile(st, p / 100) for p in (50, 80, 90)}}
    if data.get('percentile') is not None:
        out['percentiles'][str(round(data['percentile'] * 100))] = percentile(st, data['percentile'])
    if data.get('deadline') is not None:
        out['deadline'] = data['deadline']
        dl = data['deadline']                    # with the exact count's tolerance / con la tolerancia de la cuenta exacta
        out['p_deadline'] = sum(1 for x in T if x <= dl + tol(dl)) / reps
    out.update(indices(project, T, D, TF, data.get('corr', 'pearson')))
    out['ids'] = project.ids
    out['durations'] = T
    return out


def report(res, unit):
    """Plain-text report (English / español)."""
    u = (' ' + unit) if unit else ''
    lines = [
        'Project Network Lab · Montecarlo (M7)',
        'Replicas / réplicas: %d · seed / semilla: %d' % (res['reps'], res['seed']),
        'Mean duration / duración media: %.4f%s · sd / desviación: %.4f' % (res['mean'], u, res['sd']),
        'Percentiles: ' + ' · '.join('P%s = %.4f' % (k, v) for k, v in res['percentiles'].items()),
    ]
    if 'p_deadline' in res:
        lines.append('P(duration <= %s) / P(duración <= %s): %.4f' % (res['deadline'], res['deadline'], res['p_deadline']))
    lines.append('')
    lines.append('%-10s %12s %12s %12s' % ('Activity', 'Criticality', 'Cruciality', 'Significance'))
    lines.append('%-10s %12s %12s %12s' % ('Actividad', 'Criticidad', 'Crucialidad', 'Significación'))
    for i, a in enumerate(res['ids']):
        lines.append('%-10s %12.4f %12.4f %12.4f' % (a, res['crit'][i], res['cruc'][i], res['sig'][i]))
    lines.append('')
    lines.append('Paths (longest by mean) / caminos (los más largos por media): criticality / criticidad')
    for p in res['paths']:
        lines.append('  %s: %.4f' % ('-'.join(p['ids']), p['crit']))
    if res['more']:
        lines.append('  … and %d more paths / y %d caminos más' % (res['more'], res['more']))
    return '\n'.join(lines)


def main(argv=None):
    ap = argparse.ArgumentParser(description='Montecarlo simulation of a Project Network Lab project (M7). / '
                                             'Simulación de Montecarlo de un proyecto de Project Network Lab (M7).')
    ap.add_argument('project', help='project file downloaded from M7 (JSON) / archivo del proyecto descargado de M7')
    ap.add_argument('--reps', type=int, help='number of replicas (default: the file\'s) / réplicas (por defecto, las del archivo)')
    ap.add_argument('--seed', type=int, help='seed (default: the file\'s) / semilla (por defecto, la del archivo)')
    ap.add_argument('--json', action='store_true', help='print every result as JSON / escribir todos los resultados en JSON')
    args = ap.parse_args(argv)
    try:
        with open(args.project, encoding='utf-8') as f:
            data = json.load(f)
        res = analyse(data, args.reps, args.seed)
    except (OSError, ValueError, KeyError, TypeError) as e:
        sys.exit('pnl_montecarlo: %s' % e)
    if args.json:
        json.dump(res, sys.stdout)
        sys.stdout.write('\n')
    else:
        print(report(res, data.get('unit', '')))


if __name__ == '__main__':
    main()
