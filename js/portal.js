/*
 * portal — cambia el idioma de la portada y mantiene los enlaces al laboratorio en ese idioma.
 * Sin JavaScript la portada sigue siendo navegable en español (los enlaces ya están en el HTML).
 * Los textos entran siempre con textContent. En el pie, el total de páginas vistas de la portada (GoatCounter).
 */
(function () {
  'use strict';
  const { messages, resolveLanguage, labHref, COUNTER, visitsText } = window.PNLPortal;
  const KEY = 'pnl-language';
  let visits = null;   // total de páginas vistas de la portada, si GoatCounter lo da

  function renderVisits(language) {
    const node = document.getElementById('visitCount');
    const text = node && visitsText(language, visits);
    if (!text) return;
    node.textContent = text;
    node.hidden = false;
  }

  function savedLanguage() {
    try { return localStorage.getItem(KEY); } catch { return null; }
  }

  function render(language) {
    const text = messages[language];
    document.documentElement.lang = language;
    document.title = text.docTitle;
    document.querySelector('meta[name="description"]').content = text.description;
    document.querySelectorAll('[data-i18n]').forEach((node) => { node.textContent = text[node.dataset.i18n]; });
    document.querySelectorAll('[data-i18n-aria]').forEach((node) => { node.setAttribute('aria-label', text[node.dataset.i18nAria]); });
    document.querySelectorAll('[data-lang]').forEach((button) => {
      button.disabled = false;
      button.setAttribute('aria-pressed', String(button.dataset.lang === language));
    });
    document.querySelectorAll('[data-lab]').forEach((link) => { link.href = labHref(link.dataset.lab, language); });
    try { localStorage.setItem(KEY, language); } catch { /* El idioma también va en la URL. */ }
    renderVisits(language);
  }

  function setLanguage(language, replace) {
    const url = new URL(window.location.href);
    const changed = url.searchParams.get('lang') !== language;
    url.searchParams.set('lang', language);
    try {
      if (replace) history.replaceState(null, '', url);
      else if (changed) history.pushState(null, '', url);
    } catch { /* Algunos navegadores limitan history con file://; el cambio de idioma funciona igual. */ }
    render(language);
  }

  setLanguage(resolveLanguage(location.search, savedLanguage(), navigator.language), true);
  document.querySelectorAll('[data-lang]').forEach((button) => {
    button.addEventListener('click', () => setLanguage(button.dataset.lang, false));
  });
  // Sin conexión, desde file:// o con un bloqueador, el contador no aparece y nada más cambia.
  if (window.fetch && location.protocol !== 'file:') {
    fetch(COUNTER.url).then((r) => (r.ok ? r.json() : null)).then((data) => {
      if (data && data.count) { visits = data.count; renderVisits(document.documentElement.lang); }
    }).catch(() => {});
  }
  window.addEventListener('popstate', () => render(resolveLanguage(location.search, savedLanguage(), navigator.language)));
})();
