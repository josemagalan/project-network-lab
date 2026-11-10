/*
 * views/prec-matrix — la matriz de precedencias de M0 (spec f2c-enunciado-tabla, AC3–AC5; plan §2, tablero 28).
 * Fila: actividad; columna: su predecesora; la casilla (B, A) marcada significa A → B. Es otra vista de la misma
 * tabla que la lista: model() la lee de las filas tal como están escritas (también con errores, para enseñar un
 * ciclo) y toggle() devuelve las filas con una precedencia puesta o quitada, en la columna de predecesoras o en la
 * de posteriores según el modo. cells() da cada casilla con su nombre y su marca: «r» redundante, «!» del ciclo
 * y marco para el camino de la redundancia elegida (no dependen solo del color).
 * render() pinta una tabla de casillas con foco itinerante: flechas para moverse, Espacio para marcar. Las teclas
 * del reproductor no actúan dentro (data-own-keys).
 */
(function (root) {
  'use strict';

  const I = (typeof module !== 'undefined' && module.exports) ? require('../i18n.js') : root.PNL.i18n;
  const ID_RE = /^[A-Z0-9]{1,4}$/;
  const norm = (v) => String(v == null ? '' : v).trim().toUpperCase();
  const tokens = (v) => String(v == null ? '' : v).split(/[\s,;]+/).map(norm).filter(Boolean);

  // ---------- Lógica sin DOM (tests/editor.test.js) ----------

  function model(rows, mode) {
    const ids = [];
    for (const r of rows || []) { const id = norm(r.id); if (ID_RE.test(id) && !ids.includes(id)) ids.push(id); }
    const known = new Set(ids);
    const has = new Set();
    const seen = new Set();
    for (const r of rows || []) {
      const id = norm(r.id);
      if (!known.has(id) || seen.has(id)) continue;
      seen.add(id);
      for (const x of tokens(r.links)) {
        if (!known.has(x) || x === id) continue;
        has.add(mode === 'succ' ? `${id}>${x}` : `${x}>${id}`);
      }
    }
    return { ids, has };
  }

  // Pone (on) o quita la precedencia p → a. Con predecesoras cambia la fila de a; con posteriores, la de p.
  function toggle(rows, mode, p, a, on) {
    const owner = norm(mode === 'succ' ? p : a);
    const other = norm(mode === 'succ' ? a : p);
    const k = (rows || []).findIndex((r) => norm(r.id) === owner);
    if (k < 0 || owner === other) return rows;
    const cur = tokens(rows[k].links);
    const has = cur.includes(other);
    if (on === has) return rows;
    const next = on ? cur.concat(other) : cur.filter((x) => x !== other);
    return rows.map((r, i) => (i === k ? Object.assign({}, r, { links: next.join(', ') }) : r));
  }

  const edgeKeys = (path, closed) => {
    const out = new Set();
    if (!path || path.length < 2) return out;
    for (let i = 0; i + 1 < path.length; i++) out.add(`${path[i]}>${path[i + 1]}`);
    if (closed) out.add(`${path[path.length - 1]}>${path[0]}`);
    return out;
  };

  // deco = { cycle: Id[] | null, redundant: Edge[], path: { edge, path } | null }
  function cells(ids, has, deco, lang) {
    const d = deco || {};
    const cyc = edgeKeys(d.cycle, true);
    const red = new Set((d.redundant || []).map((e) => `${e[0]}>${e[1]}`));
    const pth = d.path ? edgeKeys(d.path.path, false) : new Set();
    const out = [];
    for (const a of ids) {
      for (const p of ids) {
        if (p === a) continue;
        const key = `${p}>${a}`;
        const mark = cyc.has(key) ? 'cycle' : red.has(key) ? 'red' : pth.has(key) ? 'path' : null;
        out.push({ p, a, key, checked: has.has(key), mark, label: `${p} → ${a}${mark ? `, ${I.t(lang, `m0.matrix.${mark}`)}` : ''}` });
      }
    }
    return out;
  }

  // ---------- Vista ----------

  const active = new WeakMap();   // casilla con el foco itinerante, por contenedor

  function render(container, ctx) {
    const { h, clear } = root.PNL.dom;
    const t = (k, p) => I.t(ctx.lang, k, p);
    const had = container.contains(root.document.activeElement) ? root.document.activeElement.getAttribute('data-cell') : null;
    clear(container);
    const { ids, has } = model(ctx.rows, ctx.mode);
    if (!ids.length) { container.appendChild(h('p', { class: 'muted small' }, [t('m0.matrix.empty')])); return; }
    const list = cells(ids, has, ctx.deco, ctx.lang);
    const byKey = new Map(list.map((c) => [c.key, c]));
    let cur = active.get(container);
    if (!cur || !byKey.has(cur)) cur = list.length ? list[0].key : null;
    active.set(container, cur);

    const move = (from, dr, dc, ev) => {
      const [p, a] = from.split('>');
      let r = ids.indexOf(a);
      let c = ids.indexOf(p);
      const n = ids.length;
      if (ev.key === 'Home') c = 0; else if (ev.key === 'End') c = n - 1;
      else { r += dr; c += dc; }
      r = Math.max(0, Math.min(n - 1, r)); c = Math.max(0, Math.min(n - 1, c));
      if (r === c) { if (dc) c += dc; else if (dr) r += dr; else c = c === 0 ? 1 : c - 1; }
      if (r < 0 || c < 0 || r >= n || c >= n || r === c) return;
      const key = `${ids[c]}>${ids[r]}`;
      const el = container.querySelector(`[data-cell="${key}"]`);
      if (!el) return;
      container.querySelectorAll('[data-cell]').forEach((x) => x.setAttribute('tabindex', '-1'));
      el.setAttribute('tabindex', '0');
      active.set(container, key);
      el.focus();
    };
    const KEYS = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1], Home: [0, 0], End: [0, 0] };

    const body = ids.map((a) => h('tr', {}, [h('th', { scope: 'row' }, [a]), ...ids.map((p) => {
      if (p === a) return h('td', { class: 'diag', 'aria-hidden': 'true' });
      const c = byKey.get(`${p}>${a}`);
      const box = h('input', { type: 'checkbox', 'data-cell': c.key, 'aria-label': c.label, checked: c.checked, tabindex: c.key === cur ? '0' : '-1',
        onchange: (e) => { active.set(container, c.key); ctx.onToggle(p, a, e.target.checked); },
        onkeydown: (e) => {
          if (!KEYS[e.key]) return;
          e.preventDefault(); e.stopPropagation();
          move(c.key, KEYS[e.key][0], KEYS[e.key][1], e);
        } });
      return h('td', { class: c.mark ? `m-${c.mark}` : null }, [box, c.mark === 'red' || c.mark === 'cycle' ? h('span', { class: 'sym', 'aria-hidden': 'true' }, [c.mark === 'red' ? 'r' : '!']) : null]);
    })]));
    container.appendChild(h('div', { class: 'pm-wrap', 'data-own-keys': '' }, [h('table', { class: 'pm' }, [
      h('caption', {}, [t('m0.matrix.caption')]),
      h('thead', {}, [h('tr', {}, [h('th', { scope: 'col' }, [h('span', { class: 'sr-only' }, [t('m0.matrix.corner')])]), ...ids.map((p) => h('th', { scope: 'col' }, [p]))])]),
      h('tbody', {}, body),
    ])]));
    container.appendChild(h('p', { class: 'muted small' }, [t('m0.matrix.keys')]));
    if (had) { const el = container.querySelector(`[data-cell="${had}"]`); if (el) el.focus(); }
  }

  const api = { model, toggle, cells, render };
  root.PNL = root.PNL || {};
  root.PNL.precMatrix = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
