(function () {
  const DEFAULT_URL = "assets/data/products.json";

  function withCacheBust(url) {
    const sep = url.includes("?") ? "&" : "?";
    return `${url}${sep}v=${Date.now()}`;
  }

  // Retourne:
  // - Array (éventuellement vide) si le fichier est chargé et parsé
  // - null si le chargement échoue (réseau / fichier introuvable / JSON invalide)
  async function fetchPublishedProducts(url = DEFAULT_URL) {
    try {
      const res = await fetch(withCacheBust(url), { cache: "no-store" });
      if (!res.ok) return null;
      const data = await res.json();
      return Array.isArray(data) ? data : [];
    } catch {
      return null;
    }
  }

  // undefined = pas encore chargé ; null = échec de chargement ; [] = chargé mais vide
  let memo = undefined;
  let inFlight = null;

  async function loadPublishedProducts() {
    if (memo !== undefined) return memo;
    if (inFlight) return inFlight;

    inFlight = (async () => {
      try {
        memo = await fetchPublishedProducts();
        return memo;
      } catch {
        memo = null;
        return memo;
      } finally {
        inFlight = null;
      }
    })();

    return inFlight;
  }

  window.loadPublishedProducts = loadPublishedProducts;
})();
