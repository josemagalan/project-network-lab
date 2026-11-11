'use strict';
// Comprobador de XML bien formado, sin dependencias (spec f3b-moodle, AC6; plan T004): prólogo, comentarios,
// CDATA, etiquetas con atributos entre comillas, entidades válidas y anidamiento equilibrado. Solo para las
// pruebas; no valida contra un esquema. Devuelve { ok: true } o { ok: false, error, at }.
function check(xml) {
  const fail = (error, at) => ({ ok: false, error, at });
  let i = 0;
  const stack = [];
  let roots = 0;
  const NAME = /^[A-Za-z_:][\w.:-]*/;
  const textOk = (s) => !/&(?!(amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);)/.test(s) && !s.includes('<');
  if (xml.startsWith('<?xml')) {
    const e = xml.indexOf('?>');
    if (e < 0) return fail('prólogo sin cerrar', 0);
    i = e + 2;
  }
  while (i < xml.length) {
    const lt = xml.indexOf('<', i);
    const text = lt < 0 ? xml.slice(i) : xml.slice(i, lt);
    if (!textOk(text)) return fail('texto con & o < sin escapar', i);
    if (text.trim() && !stack.length) return fail('texto fuera del elemento raíz', i);
    if (lt < 0) break;
    i = lt;
    if (xml.startsWith('<!--', i)) {
      const e = xml.indexOf('-->', i + 4);
      if (e < 0) return fail('comentario sin cerrar', i);
      if (xml.slice(i + 4, e).includes('--')) return fail('«--» dentro de un comentario', i);
      i = e + 3;
    } else if (xml.startsWith('<![CDATA[', i)) {
      if (!stack.length) return fail('CDATA fuera del elemento raíz', i);
      const e = xml.indexOf(']]>', i + 9);
      if (e < 0) return fail('CDATA sin cerrar', i);
      i = e + 3;
    } else if (xml.startsWith('</', i)) {
      const m = NAME.exec(xml.slice(i + 2));
      if (!m) return fail('etiqueta de cierre sin nombre', i);
      const after = xml.slice(i + 2 + m[0].length).match(/^\s*>/);
      if (!after) return fail('etiqueta de cierre mal formada', i);
      if (stack.pop() !== m[0]) return fail(`cierre de </${m[0]}> sin abrir`, i);
      i += 2 + m[0].length + after[0].length;
    } else {
      const m = NAME.exec(xml.slice(i + 1));
      if (!m) return fail('etiqueta sin nombre', i);
      let j = i + 1 + m[0].length;
      const attrs = new Set();
      for (;;) {
        const ws = xml.slice(j).match(/^\s*/)[0];
        j += ws.length;
        if (xml.startsWith('/>', j)) { j += 2; break; }
        if (xml[j] === '>') { j += 1; stack.push(m[0]); break; }
        if (!ws) return fail('falta espacio entre atributos', j);
        const a = xml.slice(j).match(/^([A-Za-z_:][\w.:-]*)\s*=\s*("[^"<]*"|'[^'<]*')/);
        if (!a) return fail('atributo mal formado', j);
        if (attrs.has(a[1])) return fail(`atributo repetido: ${a[1]}`, j);
        if (!textOk(a[2].slice(1, -1))) return fail('atributo con & sin escapar', j);
        attrs.add(a[1]);
        j += a[0].length;
      }
      if (!stack.length && xml[j - 2] === '/') roots++;
      if (stack.length === 1 && xml[j - 2] !== '/') roots++;
      i = j;
    }
  }
  if (stack.length) return fail(`<${stack[stack.length - 1]}> sin cerrar`, xml.length);
  if (roots !== 1) return fail(`${roots} elementos raíz`, 0);
  return { ok: true };
}
module.exports = { check };
