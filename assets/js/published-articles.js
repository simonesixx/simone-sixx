(function () {
  function resolveDefaultUrl() {
    try {
      const current = document.currentScript;
      const scripts = Array.from(document.scripts || []);
      const scriptEl = current || scripts.find((s) => String(s?.src || "").includes("/assets/js/published-articles.js"));
      const src = String(scriptEl?.src || "");

      // src ressemble à: https://example.com/.../assets/js/published-articles.js
      const m = src.match(/^(.*)\/assets\/js\/published-articles\.js(?:\?.*)?$/);
      if (m && m[1]) return `${m[1]}/assets/data/articles.json`;
    } catch {
      // ignore
    }

    // Fallback (fonctionne pour les pages à la racine)
    return "assets/data/articles.json";
  }

  const DEFAULT_URL = resolveDefaultUrl();

  function withCacheBust(url) {
    const sep = url.includes("?") ? "&" : "?";
    return `${url}${sep}v=${Date.now()}`;
  }

  async function fetchPublishedArticles(url = DEFAULT_URL) {
    const res = await fetch(withCacheBust(url || DEFAULT_URL), { cache: "no-store" });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  }

  let memo = null;
  let inFlight = null;

  async function loadPublishedArticles() {
    if (memo) return memo;
    if (inFlight) return inFlight;

    inFlight = (async () => {
      try {
        memo = await fetchPublishedArticles();
        return memo;
      } catch {
        memo = [];
        return memo;
      } finally {
        inFlight = null;
      }
    })();

    return inFlight;
  }

  window.loadPublishedArticles = loadPublishedArticles;
})();
