'use strict';
// Accesibilidad estática (T023, AC14, principio 23): contraste de los tokens en los dos temas,
// ningún HTML inyectado, SVG con nombre accesible o decorativos, controles con nombre y foco visible.
// La comprobación dinámica (axe-core en cada vista) va en las pruebas de navegador (T024).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const PAGES = ['index.html', 'cpm.html'];

// --- Contraste WCAG 2.x -------------------------------------------------------------------------

function tokens(file) {
  const css = read(file);
  const darkAt = css.indexOf('@media (prefers-color-scheme: dark)');
  assert.ok(darkAt > 0, `${file}: falta el tema oscuro`);
  const grab = (s) => Object.fromEntries([...s.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-fA-F]{6})\b/g)].map((m) => [m[1], m[2].toLowerCase()]));
  const light = grab(css.slice(css.indexOf(':root {'), darkAt));
  const dark = grab(css.slice(darkAt, css.indexOf('\n}\n', darkAt)));
  return { light, dark };
}
const channel = (v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const luminance = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => channel(parseInt(hex.slice(i, i + 2), 16) / 255));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a, b) => {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

// Pares que de verdad aparecen en la hoja: [primer plano, fondo]. Texto: 4,5:1 (1.4.3).
// No texto (bordes de controles, aristas y cajas de la red, barras del Gantt, foco): 3:1 (1.4.11).
const PAIRS = {
  'css/styles.css': {
    text: [
      ...['bg', 'card', 'soft', 'accent-soft', 'accent-mid', 'warn-soft', 'critical-soft', 'ok-soft'].map((b) => ['ink', b]),
      ['muted', 'bg'], ['muted', 'card'], ['muted', 'soft'], ['muted', 'accent-soft'],
      ['accent', 'bg'], ['accent', 'card'], ['accent', 'accent-soft'],
      ['accent-ink', 'accent'],
      ['critical-text', 'bg'], ['critical-text', 'card'],
      ['ok', 'card'],
    ],
    ui: [
      ['focus', 'bg'], ['focus', 'card'],
      ['edge', 'bg'], ['edge', 'card'],
      ['accent', 'card'], ['critical', 'card'], ['critical', 'bg'], ['ok', 'card'],
      ['warn-line', 'card'], ['muted', 'card'],
    ],
  },
  'css/portal.css': {
    text: [
      ...['bg', 'card', 'band', 'tint'].flatMap((b) => [['ink', b], ['soft-ink', b], ['muted', b], ['accent', b]]),
      ['accent-hover', 'bg'], ['accent-hover', 'card'],
      ['accent-ink', 'accent'], ['accent-ink', 'accent-hover'],
      ['amber-text', 'bg'], ['amber-text', 'card'],
      ['critical-text', 'bg'], ['critical-text', 'card'],
      ['ok', 'ok-soft'], ['bg', 'ink'],
    ],
    ui: [
      ['accent', 'bg'], ['accent', 'card'],
      ['edge', 'bg'], ['edge', 'card'],
      ['critical', 'card'], ['critical', 'bg'],
    ],
  },
};

for (const [file, pairs] of Object.entries(PAIRS)) {
  test(`${file}: el tema oscuro redefine todos los colores del claro`, () => {
    const { light, dark } = tokens(file);
    assert.deepEqual(Object.keys(dark).sort(), Object.keys(light).sort());
  });

  for (const [kind, min] of [['text', 4.5], ['ui', 3]]) {
    test(`${file}: contraste ${kind === 'text' ? 'de texto ≥ 4,5:1' : 'de elementos gráficos ≥ 3:1'} en los dos temas`, () => {
      const t = tokens(file);
      const fails = [];
      for (const theme of ['light', 'dark']) {
        for (const [fg, bg] of pairs[kind]) {
          assert.ok(t[theme][fg] && t[theme][bg], `${file} ${theme}: falta --${fg} o --${bg}`);
          const r = contrast(t[theme][fg], t[theme][bg]);
          if (r < min) fails.push(`${theme} --${fg} sobre --${bg}: ${r.toFixed(2)}`);
        }
      }
      assert.deepEqual(fails, []);
    });
  }
}

test('la fórmula de contraste da los valores de referencia de WCAG', () => {
  assert.equal(contrast('#000000', '#ffffff'), 21);
  assert.equal(contrast('#ffffff', '#ffffff'), 1);
  assert.equal(contrast('#767676', '#ffffff').toFixed(2), '4.54');
});

// --- Ningún HTML inyectado (principio 22) -------------------------------------------------------

function ownFiles(dir, re, out = []) {
  for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const rel = path.join(dir, e.name);
    if (e.isDirectory()) ownFiles(rel, re, out);
    else if (re.test(e.name)) out.push(rel);
  }
  return out;
}
const stripComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:\\])\/\/.*$/gm, '$1');

test('ningún script propio inyecta HTML: ni innerHTML, ni outerHTML, ni insertAdjacentHTML, ni document.write, ni .html() de D3', () => {
  const sinks = /\.(innerHTML|outerHTML)\b|insertAdjacentHTML|document\.write|createContextualFragment|\.html\(/;
  const files = ownFiles('js', /\.js$/);
  assert.ok(files.length > 20);
  const hits = [];
  for (const f of files) {
    stripComments(read(f)).split('\n').forEach((line, i) => { if (sinks.test(line)) hits.push(`${f}:${i + 1}`); });
  }
  for (const page of PAGES) if (/<script(?![^>]*\bsrc=)[^>]*>[\s\S]*?(innerHTML|document\.write)/.test(read(page))) hits.push(page);
  assert.deepEqual(hits, []);
});

test('las páginas no cargan scripts en línea ni manejadores en atributos', () => {
  for (const page of PAGES) {
    const html = read(page);
    assert.doesNotMatch(html, /\son[a-z]+="/, `${page}: manejador en atributo`);
    assert.doesNotMatch(html, /<script(?![^>]*\bsrc=)[^>]*>\s*\S/, `${page}: script en línea`);
  }
});

// --- SVG: nombre accesible o decorativo (1.1.1) --------------------------------------------------

test('cada SVG de las páginas es decorativo (aria-hidden, suyo o del contenedor) o una imagen con nombre (role="img" y aria-label)', () => {
  for (const page of PAGES) {
    const html = read(page);
    for (const m of html.matchAll(/<svg\b[^>]*>/g)) {
      const tag = m[0];
      const parent = html.slice(0, m.index).match(/<[a-z][^>]*>\s*$/);
      const hidden = /aria-hidden="true"/.test(tag) || (parent && /aria-hidden="true"/.test(parent[0]));
      const named = /role="img"/.test(tag) && /aria-label="[^"]+"/.test(tag);
      assert.ok(hidden || named, `${page}: ${tag}`);
    }
  }
});

test('cada SVG que dibujan las vistas lleva role="img" y aria-label traducido', () => {
  const views = ownFiles('js', /\.js$/).filter((f) => /append\(['"]svg['"]\)/.test(read(f)));
  assert.ok(views.length >= 2, 'se esperaban al menos la red y el Gantt');
  for (const f of views) {
    const src = read(f);
    for (const m of src.matchAll(/append\(['"]svg['"]\)/g)) {
      const stmt = src.slice(m.index, src.indexOf(';\n', m.index));
      assert.match(stmt, /\.attr\('role', 'img'\)/, `${f}: falta role="img"`);
      assert.match(stmt, /\.attr\('aria-label', [^)]*i18n\.t\(/, `${f}: falta un aria-label traducido`);
    }
  }
});

// --- Estructura y controles con nombre (1.3.1, 2.4.1, 3.1.1, 4.1.2) -----------------------------

test('cada página declara el idioma y tiene un enlace para saltar a un destino que existe', () => {
  for (const page of PAGES) {
    const html = read(page);
    assert.match(html, /<html lang="(es|en)">/, page);
    const skip = html.match(/<a class="skip(?:-link)?" href="#([^"]+)"/);
    assert.ok(skip, `${page}: falta el enlace para saltar`);
    assert.match(html, new RegExp(`id="${skip[1]}"`), `${page}: #${skip[1]} no existe`);
  }
});

test('cada imagen tiene texto alternativo y cada botón y control de formulario tiene nombre', () => {
  for (const page of PAGES) {
    const html = read(page);
    for (const [tag] of html.matchAll(/<img\b[^>]*>/g)) assert.match(tag, /\balt="[^"]*"/, `${page}: ${tag}`);
    for (const m of html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)) {
      const name = /aria-label="[^"]+"|data-i18n(?:-label)?="[^"]+"/.test(m[1]) || m[2].replace(/<[^>]+>/g, '').trim();
      // Los botones vacíos reciben su texto desde i18n al arrancar; deben llevar id para que app.js los rellene.
      assert.ok(name || /\bid="[^"]+"/.test(m[1]), `${page}: botón sin nombre ${m[0].slice(0, 80)}`);
    }
    for (const m of html.matchAll(/<(input|select|textarea)\b([^>]*)>/g)) {
      const before = html.slice(0, m.index);
      const insideLabel = before.lastIndexOf('<label') > before.lastIndexOf('</label>');
      const id = (m[2].match(/\bid="([^"]+)"/) || [])[1];
      const labelled = /aria-label(?:ledby)?="[^"]+"/.test(m[2]) || (id && html.includes(`for="${id}"`));
      assert.ok(insideLabel || labelled, `${page}: control sin etiqueta ${m[0]}`);
    }
  }
});

// --- Foco visible (2.4.7, 2.4.11) --------------------------------------------------------------

for (const file of Object.keys(PAIRS)) {
  test(`${file}: el foco se ve siempre (contorno de 2 px o más) y nada lo quita`, () => {
    const css = read(file);
    const rule = css.match(/:focus-visible\s*\{([^}]*)\}/);
    assert.ok(rule, 'falta la regla :focus-visible');
    const width = rule[1].match(/outline:\s*(\d+(?:\.\d+)?)px\s+solid\s+var\(--([a-z-]+)\)/);
    assert.ok(width && Number(width[1]) >= 2, 'el contorno debe medir 2 px o más');
    assert.ok(PAIRS[file].ui.some(([fg]) => fg === width[2]), `--${width[2]} debe estar en la lista de contraste de 3:1`);
    assert.doesNotMatch(css, /outline:\s*(none|0)\b/, 'ninguna regla puede quitar el contorno');
  });
}

test('css/styles.css: el borde de cada campo de texto y desplegable usa un token con 3:1 (1.4.11)', () => {
  const css = read('css/styles.css');
  const ok = new Set(PAIRS['css/styles.css'].ui.map(([fg]) => fg));
  const rules = [...css.matchAll(/([^{}]+)\{([^}]*)\}/g)]
    .filter(([, sel, body]) => /(^|[\s,.])(input|select|textarea)\b/.test(sel) && !/checkbox/.test(sel) && /border(-color)?:/.test(body));
  assert.ok(rules.length >= 4);
  for (const [, sel, body] of rules) {
    const token = body.match(/border(?:-color)?:[^;]*var\(--([a-z-]+)\)/);
    assert.ok(token && ok.has(token[1]), `${sel.trim()}: --${token && token[1]} no llega a 3:1`);
  }
});
