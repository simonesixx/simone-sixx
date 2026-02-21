(function () {
  const DEFAULT_URL = "assets/data/lookbooks.json";

  function withCacheBust(url) {
    const sep = url.includes("?") ? "&" : "?";
    return `${url}${sep}v=${Date.now()}`;
  }

  async function fetchPublishedLookbooks(url = DEFAULT_URL) {
    const res = await fetch(withCacheBust(url), { cache: "no-store" });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  }

  let memo = null;
  let inFlight = null;

  async function loadPublishedLookbooks() {
    if (memo) return memo;
    if (inFlight) return inFlight;

    inFlight = (async () => {
      try {
        memo = await fetchPublishedLookbooks();
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

  window.loadPublishedLookbooks = loadPublishedLookbooks;
})();
