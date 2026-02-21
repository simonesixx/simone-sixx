(function () {
  const DEFAULT_ARTICLES = [
    {
      id: "qui-est-simone-sixx",
      title: "Qui est Simone Sixx",
      date: "3 février 2026",
      image: "simone.jpg",
      images: ["simone.jpg"],
      excerpt:
        "Jeune créateur français, indépendant et anticapitaliste, il élabore un univers où l'esthétique est utilisée comme un moyen de contestation...",
      content: `
        <p><em>Simone,</em></p>

        <p>
          Jeune créateur français, indépendant et anticapitaliste, il
          élabore un univers où l'esthétique est utilisée comme un moyen de
          contestation, en s'opposant aux pratiques et diktats sociétaux.
        </p>

        <p>
          Il conçoit ses collections à partir de matériaux écologiques,
          respectueux de l'environnement et issus du savoir-faire français,
          adoptant une approche éthique et solidaire.
        </p>

        <p>
          Chaque pièce qu'il crée met en valeur l'artisanat, réinsérant la
          mode dans une relation assumée tout en lui apportant une dimension
          profondément humaine.
        </p>

        <p>
          Une partie de ses bénéfices est allouée à des œuvres caritatives,
          tout en contribuant à la croissance de sa marque. Cela garantit un
          impact social et assure la durabilité de son projet créatif.
        </p>

        <p>
          À travers ses créations, il propose une vision alternative : une
          mode engagée, une critique du système et un vecteur de changement
          collectif.
        </p>
      `.trim()
    },
    {
      id: "lookbook-pe26",
      title: "Lookbook Printemps & Été 2026",
      date: "4 septembre 2025",
      image: "lookbook.jpg",
      images: ["lookbook.jpg", "look2.jpg"],
      excerpt:
        "Présentation privée à l'atelier Simone Sixx. Pièces suspendues, silhouettes portées, matières à nu...",
      content: `
        <p>Présentation privée à l'atelier Simone Sixx.</p>
        <p>Pièces suspendues, silhouettes portées, matières à nu. Une lecture lente de la collection SS26.</p>
      `.trim()
    },
    {
      id: "premieres-matieres",
      title: "Premières matières",
      date: "18 août 2025",
      image: "matieres.jpg",
      images: ["matieres.jpg", "look3.jpg"],
      excerpt:
        "Réception des premiers cuirs et tissus. Odeur de poussière, de colle, de bois. Les pièces commencent à exister...",
      content: `
        <p>Réception des premiers cuirs et tissus.</p>
        <p>Odeur de poussière, de colle, de bois. Les pièces commencent à exister...</p>
      `.trim()
    }
  ];

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
        list = DEFAULT_ARTICLES;
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
    const previewSuffix = getPreviewEnabled() ? "&preview=1" : "";

    articlesList.innerHTML = "";

    list.forEach((article, index) => {
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

      if (index < list.length - 1) {
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

    if (normalizedImages.length > 0) {
      imageEl.src = normalizedImages[0];
      imageEl.alt = article.title || "";
    }

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
  window.__DEFAULT_ARTICLES__ = DEFAULT_ARTICLES;
})();
