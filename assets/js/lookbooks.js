(function () {
  const DEFAULT_LOOKBOOKS = [
    {
      id: "ss26",
      title: "Printemps & Été 2026",
      season: "Première Collection",
      images: ["look1.jpg", "look2.jpg", "look3.jpg", "look4.jpg", "look5.jpg", "look6.jpg"]
    },
    {
      id: "aw26",
      title: "Automne & Hiver 2026",
      season: "Première Collection",
      images: ["look3.jpg", "look4.jpg", "look5.jpg", "look6.jpg", "look1.jpg", "look2.jpg"]
    }
  ];

  function getPreviewEnabled() {
    const params = new URLSearchParams(window.location.search);
    return params.get("preview") === "1";
  }

  function getLookbookIdFromURL() {
    const params = new URLSearchParams(window.location.search);
    return params.get("id");
  }

  let memo = null;
  let inFlight = null;

  async function getLookbooks() {
    if (memo) return memo;
    if (inFlight) return inFlight;

    inFlight = (async () => {
      const preview = getPreviewEnabled();
      let list = [];

      if (preview) {
        try {
          list = window.LookbookStore?.loadLookbooks?.() || [];
        } catch {
          list = [];
        }
      }

      if (list.length === 0) {
        try {
          const published = await window.loadPublishedLookbooks?.();
          if (Array.isArray(published) && published.length > 0) list = published;
        } catch {
          // ignore
        }
      }

      if (list.length === 0) {
        list = DEFAULT_LOOKBOOKS;
      }

      memo = list;
      return list;
    })();

    try {
      return await inFlight;
    } finally {
      inFlight = null;
    }
  }

  async function getLookbookById(id) {
    const list = await getLookbooks();
    return list.find((lb) => lb && lb.id === id);
  }

  function normalizeImageSrc(src, prefix) {
    const s = String(src || "").trim();
    if (!s) return "";

    if (
      s.startsWith("data:") ||
      s.startsWith("http://") ||
      s.startsWith("https://") ||
      s.startsWith("/") ||
      s.startsWith("assets/")
    ) {
      return s;
    }

    return `${prefix}${s}`;
  }

  async function renderCollectionPage() {
    const container = document.getElementById("collectionsList");
    if (!container) return;

    const list = await getLookbooks();
    const previewSuffix = getPreviewEnabled() ? "&preview=1" : "";

    container.innerHTML = "";

    list.forEach((lb) => {
      const a = document.createElement("a");
      a.className = "collection-link";
      a.href = `lookbook-ss25.html?id=${encodeURIComponent(lb.id || "")}${previewSuffix}`;
      const season = lb.season ? `${lb.season} ` : "";
      a.textContent = `${season}${lb.title || ""}`.trim();
      container.appendChild(a);
    });

    if (typeof window.updateCartCount === "function") {
      window.updateCartCount();
    }
  }

  async function renderLookbookPage() {
    const grid = document.getElementById("lookbookGrid");
    if (!grid) return;

    const list = await getLookbooks();
    const idFromUrl = getLookbookIdFromURL();
    const defaultId = list[0]?.id || DEFAULT_LOOKBOOKS[0]?.id || "";
    const lookbookId = idFromUrl || defaultId;

    const lb = await getLookbookById(lookbookId);
    if (!lb) {
      alert("Lookbook non trouvé");
      return;
    }

    document.querySelector("title").textContent = `${lb.season || ""} ${lb.title || ""} — Simone Sixx`.trim();
    const seasonEl = document.getElementById("lookbookSeason");
    const titleEl = document.getElementById("lookbookTitle");
    if (seasonEl) seasonEl.textContent = lb.season || "";
    if (titleEl) titleEl.textContent = lb.title || "";

    grid.innerHTML = "";

    const images = Array.isArray(lb.images) ? lb.images.filter(Boolean) : [];
    const normalized = images
      .map((src) => normalizeImageSrc(src, "assets/images/"))
      .filter(Boolean);

    normalized.forEach((src) => {
      const img = document.createElement("img");
      img.src = src;
      img.className = "look";
      img.alt = lb.title || "";
      img.onclick = function () {
        window.openLightbox?.(this);
      };
      grid.appendChild(img);
    });

    // Shop.js utilise une variable globale `looks` pour la lightbox.
    // Après injection, on la met à jour si elle existe.
    try {
      // eslint-disable-next-line no-undef
      looks = document.querySelectorAll(".lookbook-grid .look");
    } catch {
      // ignore
    }

    if (typeof window.updateCartCount === "function") {
      window.updateCartCount();
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    renderCollectionPage();
    renderLookbookPage();
  });

  // Expose minimal API (utile pour debug)
  window.getLookbooks = getLookbooks;
  window.getLookbookById = getLookbookById;
  window.getLookbookIdFromURL = getLookbookIdFromURL;
})();
