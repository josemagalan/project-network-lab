/*
 * core/textpack — compresión sin dependencias para llevar el enunciado propio de M0 en la URL (F2c, plan P5).
 *
 * compress(str): LZW sobre los bytes UTF-8 (diccionario inicial de 256 y un código de fin), con códigos de
 * anchura creciente desde 9 bits, en base64url. Síncrono: el arranque de la página decodifica la URL de
 * una vez. decompress(str, { max }) devuelve el texto o null si el paquete no es válido, está recortado o
 * pasa de max caracteres (64 KB por defecto); nunca lanza. La lista blanca del contenido la aplica
 * urlstate. Medido en la puerta T002: el caso peor de M0 en 5733 caracteres, 2,5 ms y 1,2 ms.
 */
(function (root) {
  'use strict';

  const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  const END = 256;
  const MAX = 65536;
  const width = (size) => Math.max(9, Math.ceil(Math.log2(size + 1)));

  function compress(str) {
    const bytes = new TextEncoder().encode(String(str == null ? '' : str));
    const dict = new Map();
    let next = 257;
    let w = -1;            // código de la secuencia en curso (-1: vacía)
    const codes = [];
    for (const b of bytes) {
      if (w < 0) { w = b; continue; }
      const key = w * 256 + b;
      const hit = dict.get(key);
      if (hit !== undefined) { w = hit; continue; }
      codes.push(w);
      dict.set(key, next++);
      w = b;
    }
    if (w >= 0) codes.push(w);
    codes.push(END);
    const bits = [];
    let size = 257;
    codes.forEach((c, k) => {
      const n = width(size);
      for (let i = n - 1; i >= 0; i--) bits.push((c >> i) & 1);
      if (k > 0) size++;
    });
    let out = '';
    for (let i = 0; i < bits.length; i += 6) {
      let v = 0;
      for (let j = 0; j < 6; j++) v = (v << 1) | (bits[i + j] || 0);
      out += B64[v];
    }
    return out;
  }

  function decompress(packed, opts) {
    const max = opts && Number.isInteger(opts.max) ? opts.max : MAX;
    if (typeof packed !== 'string' || !packed || !/^[A-Za-z0-9_-]+$/.test(packed)) return null;
    const bits = [];
    for (const ch of packed) { const v = B64.indexOf(ch); for (let j = 5; j >= 0; j--) bits.push((v >> j) & 1); }
    let pos = 0;
    let size = 257;
    let k = 0;
    const read = () => {
      const n = width(size);
      if (pos + n > bits.length) return -1;
      let v = 0;
      for (let i = 0; i < n; i++) v = (v << 1) | bits[pos + i];
      pos += n;
      if (k > 0) size++;
      k++;
      return v;
    };
    const dict = [];
    for (let i = 0; i < 256; i++) dict.push([i]);
    dict.push(null);   // 256: fin
    const out = [];
    let c = read();
    if (c < 0 || c > 256) return null;
    if (c !== END) {
      let w = dict[c];
      out.push(...w);
      for (;;) {
        c = read();
        if (c < 0) return null;
        if (c === END) break;
        let entry;
        if (c < dict.length && c !== END) entry = dict[c];
        else if (c === dict.length) entry = w.concat(w[0]);
        else return null;
        out.push(...entry);
        if (out.length > max * 4) return null;
        dict.push(w.concat(entry[0]));
        w = entry;
      }
    }
    // Tras el fin solo puede quedar el relleno a cero del último carácter.
    if (bits.length - pos >= 6 || bits.slice(pos).some((b) => b)) return null;
    let text;
    try { text = new TextDecoder('utf-8', { fatal: true }).decode(new Uint8Array(out)); } catch { return null; }
    return text.length > max ? null : text;
  }

  const api = { MAX, compress, decompress };
  root.PNL = root.PNL || {};
  root.PNL.textpack = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
