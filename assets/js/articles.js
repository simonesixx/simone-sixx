(function () {


  function getPreviewEnabled() {
    const params = new URLSearchParams(window.location.search);
    return params.get("preview") === "1";
  }

  function getArticleIdFromURL() {
    const params = new URLSearchParams(window.location.search);
    return params.get("id") || "qui-est-simone-sixx";
  }

  function normalizeImageSrc(src, prefix) {
    const s = String(src || "").trim();
    if (!s) return "";

    if (
      s.startsWith("data:") ||
      s.startsWith("http://") ||
      s.startsWith("https://") ||
      s.startsWith("/") ||
      s.startsWith("assets/") ||
      s.startsWith("../assets/")
    ) {
      return s;
    }

    return `${prefix}${s}`;
  }

  function escapeHtml(text) {
    return String(text || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function parseArticleDate(dateStr) {
    const raw = String(dateStr || "").trim();
    if (!raw) return null;

    // Format: dd/mm/yy or dd/mm/yyyy
    const mSlash = raw.match(/^\s*(\d{1,2})\s*[\/.-]\s*(\d{1,2})\s*[\/.-]\s*(\d{2,4})\s*$/);
    if (mSlash) {
      const day = Number(mSlash[1]);
      const month = Number(mSlash[2]);
      let year = Number(mSlash[3]);
      if (year < 100) year = 2000 + year;
      if (day >= 1 && day <= 31 && month >= 1 && month <= 12 && year >= 1970) {
        return Date.UTC(year, month - 1, day);
      }
    }

    // Format: "19 février 2026" (French month names)
    const mFr = raw
      .toLowerCase()
      .replace(/\s+/g, " ")
      .match(/^\s*(\d{1,2})\s+([a-zàâäçéèêëîïôöùûüÿ]+)\s+(\d{4})\s*$/i);
    if (mFr) {
      const day = Number(mFr[1]);
      const monthName = String(mFr[2] || "").toLowerCase();
      const year = Number(mFr[3]);

      const months = {
        janvier: 1,
        fevrier: 2,
        février: 2,
        mars: 3,
        avril: 4,
        mai: 5,
        juin: 6,
        juillet: 7,
        aout: 8,
        août: 8,
        septembre: 9,
        octobre: 10,
        novembre: 11,
        decembre: 12,
        décembre: 12,
      };

      const month = months[monthName];
      if (month && day >= 1 && day <= 31 && year >= 1970) {
        return Date.UTC(year, month - 1, day);
      }
    }

    // Fallback: try native parsing (ISO, etc.)
    const ts = Date.parse(raw);
    return Number.isFinite(ts) ? ts : null;
  }

  function looksLikeHtml(text) {
    const t = String(text || "");
    // détecte des balises HTML courantes
    return /<\s*\/?\s*[a-zA-Z][\s\S]*?>/.test(t);
  }

  function formatArticleContent(rawText) {
    const raw = String(rawText || "").replace(/\r\n?/g, "\n");
    const escaped = escapeHtml(raw);

    // Paragraphes = lignes vides. Dans un paragraphe, retour à la ligne = <br>
    const paragraphs = escaped
      .split(/\n\s*\n+/)
      .map((p) => p.trim())
      .filter(Boolean)
      .map((p) => p.replace(/\n/g, "<br>"));

    let html = paragraphs.map((p) => `<p>${p}</p>`).join("\n");

    // Gras: **texte**
    html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
    // Italique: *texte*
    html = html.replace(/(^|[^*])\*(?!\s)(.+?)(?!\s)\*(?!\*)/g, "$1<em>$2</em>");

    return html;
  }

  let memo = null;
  let inFlight = null;

  async function getArticles() {
    if (memo) return memo;
    if (inFlight) return inFlight;

    inFlight = (async () => {
      const preview = getPreviewEnabled();
      let list = [];

      if (preview) {
        try {
          list = window.ArticleStore?.loadArticles?.() || [];
        } catch {
          list = [];
        }
      }

      if (list.length === 0) {
        try {
          const published = await window.loadPublishedArticles?.();
          if (Array.isArray(published) && published.length > 0) list = published;
        } catch {
          // ignore
        }
      }

      if (list.length === 0) {
        list = [];
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

  async function getArticleById(id) {
    const list = await getArticles();
    return list.find((a) => a && a.id === id);
  }

  async function renderEventsPage() {
    const articlesList = document.getElementById("articlesList");
    if (!articlesList) return;

    const list = await getArticles();
    const sorted = list
      .map((a, i) => ({ a, i, ts: parseArticleDate(a?.date) }))
      .sort((x, y) => {
        const xt = x.ts;
        const yt = y.ts;
        if (xt == null && yt == null) return x.i - y.i;
        if (xt == null) return 1;
        if (yt == null) return -1;
        if (yt !== xt) return yt - xt;
        return x.i - y.i;
      })
      .map((x) => x.a);
    const previewSuffix = getPreviewEnabled() ? "&preview=1" : "";

    articlesList.innerHTML = "";

    sorted.forEach((article, index) => {
      const eventEntry = document.createElement("div");
      eventEntry.className = "event-entry";

      eventEntry.innerHTML = `
        <p class="event-date">${article.date || ""}</p>
        <h2>${article.title || ""}</h2>
        <p class="event-text">
          ${article.excerpt || ""}
        </p>
        <a class="event-link" href="articles/article.html?id=${encodeURIComponent(article.id || "")}${previewSuffix}">
          Voir le sujet
        </a>
      `;

      articlesList.appendChild(eventEntry);

      if (index < sorted.length - 1) {
        const divider = document.createElement("div");
        divider.className = "event-divider";
        articlesList.appendChild(divider);
      }
    });

    if (typeof window.updateCartCount === "function") {
      window.updateCartCount();
    }
  }

  async function renderArticlePage() {
    const titleEl = document.getElementById("articleTitle");
    const dateEl = document.getElementById("articleDate");
    const contentEl = document.getElementById("articleContent");
    const imageEl = document.getElementById("articleImage");
    const carouselNav = document.getElementById("carouselNav");
    const pageTitleEl = document.getElementById("pageTitle");
    const carouselContainer = document.getElementById("carouselContainer");

    if (!titleEl || !dateEl || !contentEl || !imageEl) return;

    const articleId = getArticleIdFromURL();
    const article = await getArticleById(articleId);

    if (!article) {
      alert("Article non trouvé");
      return;
    }

    if (pageTitleEl) pageTitleEl.textContent = `${article.title || "Article"} — Simone Sixx`;
    document.title = `${article.title || "Article"} — Simone Sixx`;

    titleEl.textContent = article.title || "";
    dateEl.textContent = article.date || "";

    const content = article.content || "";
    if (looksLikeHtml(content)) {
      contentEl.innerHTML = content;
    } else {
      contentEl.innerHTML = formatArticleContent(content);
    }

    const prefix = "../assets/images/";

    const images = Array.isArray(article.images) && article.images.length > 0
      ? article.images.filter(Boolean)
      : (article.image ? [article.image] : []);

    const normalizedImages = images
      .map((src) => normalizeImageSrc(src, prefix))
      .filter(Boolean);

    if (carouselContainer) {
      carouselContainer.style.display = normalizedImages.length > 0 ? "" : "none";
    }

    if (normalizedImages.length === 0) {
      if (carouselNav) carouselNav.innerHTML = "";
      if (typeof window.updateCartCount === "function") {
        window.updateCartCount();
      }
      return;
    }

    let currentImageIndex = 0;

    function goToSlide(index) {
      if (normalizedImages.length === 0) return;
      currentImageIndex = ((index % normalizedImages.length) + normalizedImages.length) % normalizedImages.length;
      imageEl.src = normalizedImages[currentImageIndex];
      imageEl.alt = article.title || "";

      document.querySelectorAll(".carousel-dot").forEach((dot, i) => {
        dot.classList.toggle("active", i === currentImageIndex);
      });
    }

    function nextSlide() {
      goToSlide(currentImageIndex + 1);
    }

    function prevSlide() {
      goToSlide(currentImageIndex - 1);
    }

    imageEl.src = normalizedImages[0];
    imageEl.alt = article.title || "";

    if (carouselNav) carouselNav.innerHTML = "";

    if (carouselNav && normalizedImages.length > 1) {
      normalizedImages.forEach((_, index) => {
        const dot = document.createElement("div");
        dot.className = "carousel-dot" + (index === 0 ? " active" : "");
        dot.addEventListener("click", () => goToSlide(index));
        carouselNav.appendChild(dot);
      });
    }

    if (carouselContainer && normalizedImages.length > 1) {
      let touchStartX = 0;
      carouselContainer.addEventListener("touchstart", (e) => {
        touchStartX = e.touches[0].clientX;
      });

      carouselContainer.addEventListener("touchend", (e) => {
        const touchEndX = e.changedTouches[0].clientX;
        const diff = touchStartX - touchEndX;
        if (diff > 50) nextSlide();
        else if (diff < -50) prevSlide();
      });
    }

    if (typeof window.updateCartCount === "function") {
      window.updateCartCount();
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    if (document.getElementById("articlesList")) {
      renderEventsPage();
    }

    if (document.getElementById("articleTitle")) {
      renderArticlePage();
    }
  });

  // Expose minimal API (utile aussi dans l'admin)
  window.getArticles = getArticles;
  window.getArticleById = getArticleById;
  window.getArticleIdFromURL = getArticleIdFromURL;
})();
