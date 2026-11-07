'use strict';
// Lint (T027): ESLint con las reglas recomendadas. Como Playwright, solo se instala en la CI y sin
// guardarse en package.json (principio 3): npm i --no-save eslint@9.39.5 @eslint/js@9.39.5 globals@17.14.0
const js = require('@eslint/js');
const globals = require('globals');

module.exports = [
  { ignores: ['vendor/**', 'node_modules/**', '02-DOCS/**', '01-TOOLS/**', '.claude/**', '.codex/**', '.gemini/**', '.rsc/**'] },
  js.configs.recommended,
  {
    // Páginas: scripts clásicos que se registran en window.PNL y exportan con module.exports (principio 29).
    files: ['js/**/*.js'],
    languageOptions: { ecmaVersion: 2022, sourceType: 'script', globals: { ...globals.browser, ...globals.commonjs, d3: 'readonly' } },
  },
  {
    files: ['scripts/**/*.cjs', 'tests/**/*.js', 'eslint.config.cjs'],
    languageOptions: { ecmaVersion: 2022, sourceType: 'commonjs', globals: { ...globals.node } },
  },
  {
    // Las funciones que Playwright pasa a page.evaluate() se ejecutan en la página.
    files: ['tests/browser/**/*.js'],
    languageOptions: { globals: { ...globals.browser, PNL: 'readonly', axe: 'readonly' } },
  },
];
