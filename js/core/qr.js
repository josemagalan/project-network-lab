/*
 * core/qr — codificador de códigos QR propio, sin dependencias (spec f3f-examen-imprimible, AC12 y AC27; plan §0, §3 y
 * P4). Lo justo para el enlace del examen impreso: modo byte (el texto en UTF-8), corrección M y versiones de la 1 a la
 * 10 (hasta 213 bytes). Sigue la norma ISO/IEC 18004 con el mismo orden de pasos que «QR Code generator» de Project
 * Nayuki (MIT), que es la referencia de las pruebas: bits de datos con terminador y relleno 0xEC/0x11; bloques con
 * Reed-Solomon sobre GF(2^8) (polinomio 0x11D) e intercalado; patrones de función (búsqueda, alineación, sincronismo,
 * formato y versión); colocación en zigzag; y la máscara con menos penalización (reglas N1 = 3, N2 = 3, N3 = 40,
 * N4 = 10; con empate, la de número menor), salvo que se pida una.
 *   encode(text, { ecc = 'M', minVersion = 1, maxVersion = 10, mask = -1 }) → { version, size, mask, modules }
 *     modules: Uint8Array(size²), fila a fila (y · size + x), 1 = oscuro. RangeError si no cabe o si las opciones no valen.
 *   svg(qr, { quiet = 4, title }) → SVG en texto, un módulo por unidad, con la zona en blanco alrededor.
 * Sin DOM ni azar.
 */
(function (root) {
  'use strict';

  const MAX_VERSION = 10;
  // Corrección M, versiones 1 a 10: códigos de corrección por bloque y número de bloques (tabla de la norma).
  const ECC_PER_BLOCK = [null, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26];
  const BLOCKS = [null, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5];
  // Bits de formato del nivel de corrección (la norma: L = 01, M = 00).
  const ECC_BITS = { L: 1, M: 0 };
  const PENALTY = { N1: 3, N2: 3, N3: 40, N4: 10 };

  // ---------- aritmética de GF(2^8) y Reed-Solomon ----------
  function mul(x, y) {
    let z = 0;
    for (let i = 7; i >= 0; i--) {
      z = (z << 1) ^ ((z >>> 7) * 0x11D);
      z ^= ((y >>> i) & 1) * x;
    }
    return z & 0xFF;
  }
  function divisor(degree) {
    const out = new Array(degree - 1).fill(0).concat([1]);
    let r = 1;
    for (let i = 0; i < degree; i++) {
      for (let j = 0; j < out.length; j++) {
        out[j] = mul(out[j], r);
        if (j + 1 < out.length) out[j] ^= out[j + 1];
      }
      r = mul(r, 0x02);
    }
    return out;
  }
  function remainder(data, div) {
    const out = div.map(() => 0);
    for (const b of data) {
      const factor = b ^ out.shift();
      out.push(0);
      div.forEach((c, i) => { out[i] ^= mul(c, factor); });
    }
    return out;
  }
  /** Los n códigos de corrección de unos datos (para las pruebas: el ejemplo «HELLO WORLD» 1-M). */
  const rs = (data, n) => remainder(data, divisor(n));

  // ---------- capacidades ----------
  function rawModules(v) {
    let r = (16 * v + 128) * v + 64;
    if (v >= 2) {
      const n = Math.floor(v / 7) + 2;
      r -= (25 * n - 10) * n - 55;
      if (v >= 7) r -= 36;
    }
    return r;
  }
  const dataCodewords = (v) => Math.floor(rawModules(v) / 8) - ECC_PER_BLOCK[v] * BLOCKS[v];
  const countBits = (v) => (v <= 9 ? 8 : 16);

  // ---------- formato y versión (BCH) ----------
  function format(ecc, mask) {
    const data = (ECC_BITS[ecc] << 3) | mask;
    let r = data;
    for (let i = 0; i < 10; i++) r = (r << 1) ^ ((r >>> 9) * 0x537);
    return ((data << 10) | r) ^ 0x5412;
  }
  function versionInfo(v) {
    let r = v;
    for (let i = 0; i < 12; i++) r = (r << 1) ^ ((r >>> 11) * 0x1F25);
    return (v << 12) | r;
  }
  const bit = (x, i) => ((x >>> i) & 1) !== 0;

  function alignPositions(v, size) {
    if (v === 1) return [];
    const n = Math.floor(v / 7) + 2;
    const step = Math.ceil((v * 4 + 4) / (n * 2 - 2)) * 2;
    const out = [6];
    for (let pos = size - 7; out.length < n; pos -= step) out.splice(1, 0, pos);
    return out;
  }

  // Penalización de una matriz (como Nayuki: el borde claro cuenta en los patrones parecidos a los de búsqueda).
  function penaltyOf(mod, size) {
    const addHistory = (len, h) => { if (h[0] === 0) len += size; h.pop(); h.unshift(len); };
    const countPatterns = (h) => {
      const c = h[1]; const core = c > 0 && h[2] === c && h[3] === c * 3 && h[4] === c && h[5] === c;
      return (core && h[0] >= c * 4 && h[6] >= c ? 1 : 0) + (core && h[6] >= c * 4 && h[0] >= c ? 1 : 0);
    };
    const terminate = (color, len, h) => { if (color) { addHistory(len, h); len = 0; } len += size; addHistory(len, h); return countPatterns(h); };
    const line = (get) => {
      let r = 0;
      for (let a = 0; a < size; a++) {
        let color = 0; let run = 0; const h = [0, 0, 0, 0, 0, 0, 0];
        for (let b = 0; b < size; b++) {
          const c = get(a, b);
          if (c === color) { run++; if (run === 5) r += PENALTY.N1; else if (run > 5) r++; } else {
            addHistory(run, h);
            if (!color) r += countPatterns(h) * PENALTY.N3;
            color = c; run = 1;
          }
        }
        r += terminate(color, run, h) * PENALTY.N3;
      }
      return r;
    };
    let r = line((y, x) => mod[y * size + x]) + line((x, y) => mod[y * size + x]);
    for (let y = 0; y < size - 1; y++) for (let x = 0; x < size - 1; x++) {
      const c = mod[y * size + x];
      if (c === mod[y * size + x + 1] && c === mod[(y + 1) * size + x] && c === mod[(y + 1) * size + x + 1]) r += PENALTY.N2;
    }
    let dark = 0; for (const c of mod) dark += c;
    const total = size * size;
    return r + (Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1) * PENALTY.N4;
  }

  const utf8 = (text) => Array.from(new TextEncoder().encode(String(text)));

  function encode(text, opts) {
    const o = opts || {};
    const ecc = o.ecc == null ? 'M' : o.ecc;
    if (ecc !== 'M') throw new RangeError('qr: solo la corrección M');
    const minV = o.minVersion == null ? 1 : o.minVersion;
    const maxV = o.maxVersion == null ? MAX_VERSION : o.maxVersion;
    const want = o.mask == null ? -1 : o.mask;
    if (!(Number.isInteger(minV) && Number.isInteger(maxV) && minV >= 1 && minV <= maxV && maxV <= MAX_VERSION)) throw new RangeError('qr: versiones de 1 a 10');
    if (!(Number.isInteger(want) && want >= -1 && want <= 7)) throw new RangeError('qr: máscara de 0 a 7');
    const bytes = utf8(text);

    let v = minV;
    for (; v <= maxV; v++) if (4 + countBits(v) + 8 * bytes.length <= dataCodewords(v) * 8) break;
    if (v > maxV) throw new RangeError('qr: el texto no cabe');

    // Bits de datos: modo byte (0100), longitud, bytes, terminador y relleno.
    const bits = [];
    const put = (val, len) => { for (let i = len - 1; i >= 0; i--) bits.push((val >>> i) & 1); };
    put(4, 4); put(bytes.length, countBits(v));
    for (const b of bytes) put(b, 8);
    const cap = dataCodewords(v) * 8;
    put(0, Math.min(4, cap - bits.length));
    put(0, (8 - (bits.length % 8)) % 8);
    for (let pad = 0xEC; bits.length < cap; pad ^= 0xEC ^ 0x11) put(pad, 8);
    const data = [];
    for (let i = 0; i < bits.length; i += 8) data.push(bits.slice(i, i + 8).reduce((a, b) => (a << 1) | b, 0));

    // Bloques, corrección e intercalado.
    const nb = BLOCKS[v]; const eccLen = ECC_PER_BLOCK[v];
    const raw = Math.floor(rawModules(v) / 8);
    const nShort = nb - (raw % nb); const shortLen = Math.floor(raw / nb);
    const div = divisor(eccLen);
    const blocks = [];
    for (let i = 0, k = 0; i < nb; i++) {
      const dat = data.slice(k, k + shortLen - eccLen + (i < nShort ? 0 : 1));
      k += dat.length;
      const ec = remainder(dat, div);
      if (i < nShort) dat.push(0);
      blocks.push(dat.concat(ec));
    }
    const cw = [];
    for (let i = 0; i < blocks[0].length; i++) blocks.forEach((b, j) => { if (i !== shortLen - eccLen || j >= nShort) cw.push(b[i]); });

    // Patrones de función.
    const size = v * 4 + 17;
    const mod = new Uint8Array(size * size); const fn = new Uint8Array(size * size);
    const set = (x, y, dark) => { mod[y * size + x] = dark ? 1 : 0; fn[y * size + x] = 1; };
    for (let i = 0; i < size; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }
    const finder = (cx, cy) => {
      for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
        const d = Math.max(Math.abs(dx), Math.abs(dy)); const x = cx + dx; const y = cy + dy;
        if (x >= 0 && x < size && y >= 0 && y < size) set(x, y, d !== 2 && d !== 4);
      }
    };
    finder(3, 3); finder(size - 4, 3); finder(3, size - 4);
    const al = alignPositions(v, size); const na = al.length;
    for (let i = 0; i < na; i++) for (let j = 0; j < na; j++) {
      if ((i === 0 && j === 0) || (i === 0 && j === na - 1) || (i === na - 1 && j === 0)) continue;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) set(al[i] + dx, al[j] + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
    }
    const drawFormat = (m) => {
      const f = format(ecc, m);
      for (let i = 0; i <= 5; i++) set(8, i, bit(f, i));
      set(8, 7, bit(f, 6)); set(8, 8, bit(f, 7)); set(7, 8, bit(f, 8));
      for (let i = 9; i < 15; i++) set(14 - i, 8, bit(f, i));
      for (let i = 0; i < 8; i++) set(size - 1 - i, 8, bit(f, i));
      for (let i = 8; i < 15; i++) set(8, size - 15 + i, bit(f, i));
      set(8, size - 8, true);
    };
    drawFormat(0);
    if (v >= 7) {
      const vi = versionInfo(v);
      for (let i = 0; i < 18; i++) { const a = size - 11 + (i % 3); const b = Math.floor(i / 3); set(a, b, bit(vi, i)); set(b, a, bit(vi, i)); }
    }

    // Colocación en zigzag, de derecha a izquierda por pares de columnas.
    let n = 0;
    for (let right = size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (let k = 0; k < size; k++) for (let j = 0; j < 2; j++) {
        const x = right - j; const up = ((right + 1) & 2) === 0; const y = up ? size - 1 - k : k;
        if (!fn[y * size + x] && n < cw.length * 8) { mod[y * size + x] = (cw[n >>> 3] >>> (7 - (n & 7))) & 1; n++; }
      }
    }

    const MASKS = [
      (x, y) => (x + y) % 2 === 0, (x, y) => y % 2 === 0, (x) => x % 3 === 0, (x, y) => (x + y) % 3 === 0,
      (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0, (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
      (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0, (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
    ];
    const applyMask = (m) => {
      for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (!fn[y * size + x] && MASKS[m](x, y)) mod[y * size + x] ^= 1;
    };

    const penalty = () => penaltyOf(mod, size);
    let mask = want;
    if (mask === -1) {
      let best = Infinity;
      for (let m = 0; m < 8; m++) {
        applyMask(m); drawFormat(m);
        const p = penalty();
        if (p < best) { best = p; mask = m; }
        applyMask(m);
      }
    }
    applyMask(mask); drawFormat(mask);
    return { version: v, size, mask, modules: mod };
  }

  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  function svg(qr, opts) {
    const o = opts || {};
    const q = o.quiet == null ? 4 : o.quiet;
    const n = qr.size + 2 * q;
    const parts = [];
    for (let y = 0; y < qr.size; y++) for (let x = 0; x < qr.size; x++) if (qr.modules[y * qr.size + x]) parts.push(`M${x + q},${y + q}h1v1h-1z`);
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n} ${n}" role="img" shape-rendering="crispEdges">`
      + (o.title == null ? '' : `<title>${esc(o.title)}</title>`)
      + `<rect width="${n}" height="${n}" fill="#fff"/><path d="${parts.join('')}" fill="#000"/></svg>`;
  }

  const api = { MAX_VERSION, encode, svg, _rs: rs, _format: format, _versionInfo: versionInfo, _penalty: penaltyOf };
  root.PNL = root.PNL || {};
  root.PNL.qr = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
