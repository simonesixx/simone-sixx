(function () {
  const DEFAULT_URL = "assets/data/products.json";

  function withCacheBust(url) {
    const sep = url.includes("?") ? "&" : "?";
    return `${url}${sep}v=${Date.now()}`;
  }

  async function fetchPublishedProducts(url = DEFAULT_URL) {
    const res = await fetch(withCacheBust(url), { cache: "no-store" });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  }

  let memo = null;
  let inFlight = null;

  async function loadPublishedProducts() {
    if (memo) return memo;
    if (inFlight) return inFlight;

    inFlight = (async () => {
      try {
        memo = await fetchPublishedProducts();
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

  window.loadPublishedProducts = loadPublishedProducts;
})();
