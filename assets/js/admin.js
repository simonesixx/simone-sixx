document.addEventListener("DOMContentLoaded", async () => {
  // =========================
  // NAVIGATION PAR ONGLETS
  // =========================
  (function setupAdminTabs() {
    const tabButtons = Array.from(document.querySelectorAll(".admin-tabs [data-tab]"));
    const sections = Array.from(document.querySelectorAll("[data-section]"));
    if (tabButtons.length === 0 || sections.length === 0) return;

    function setActive(tab) {
      sections.forEach((section) => {
        const match = section.getAttribute("data-section") === tab;
        section.hidden = !match;
      });

      tabButtons.forEach((btn) => {
        const isActive = btn.getAttribute("data-tab") === tab;
        btn.classList.toggle("active", isActive);
        btn.setAttribute("aria-selected", String(isActive));
      });

      try {
        window.location.hash = tab;
      } catch {
        // ignore
      }
    }

    function getInitialTab() {
      const hash = (window.location.hash || "").replace("#", "");
      if (hash === "articles" || hash === "products" || hash === "lookbooks") return hash;
      return "products";
    }

    tabButtons.forEach((btn) => {
      btn.type = "button";
      btn.classList.add("tab-btn");
      btn.addEventListener("click", () => {
        const tab = btn.getAttribute("data-tab") || "products";
        setActive(tab);
        window.scrollTo({ top: 0, behavior: "smooth" });
      });
    });

    setActive(getInitialTab());
  })();

  async function seedProductsFromPublishedIfSuspicious() {
    try {
      if (!window.ProductStore?.storageAvailable) return;
      if (typeof window.loadPublishedProducts !== "function") return;

      const stored = window.ProductStore?.loadProducts?.() || [];
      const published = await window.loadPublishedProducts();

      // Si le JSON publié est accessible mais vide ([]), c'est un état valide
      // ET doit écraser le stockage local pour éviter tout fallback fantôme.
      if (!Array.isArray(published)) return;

      const storedArr = Array.isArray(stored) ? stored : [];

      if (published.length === 0) {
        if (storedArr.length !== 0) {
          window.ProductStore?.saveProducts?.([]);
        }
        return;
      }

      const hasRobea = storedArr.some((p) => {
        const id = String(p?.id || "").toLowerCase().trim();
        const name = String(p?.name || "").toLowerCase().trim();
        return id === "robea" || name === "robea";
      });

      const storedIds = new Set(storedArr.map(p => String(p?.id || "").trim()).filter(Boolean));
      const publishedIds = new Set(published.map(p => String(p?.id || "").trim()).filter(Boolean));

      let overlapCount = 0;
      for (const id of storedIds) {
        if (publishedIds.has(id)) overlapCount += 1;
      }

      const storedIsEmpty = storedArr.length === 0;
      const storedLooksTruncated = storedArr.length > 0 && storedArr.length < published.length && overlapCount === 0;
      const storedMissingMany = storedArr.length > 0 && storedArr.length < published.length && overlapCount < Math.min(2, storedArr.length);

      const shouldResetToPublished = storedIsEmpty || hasRobea || storedLooksTruncated || storedMissingMany;
      if (!shouldResetToPublished) return;

      window.ProductStore?.saveProducts?.(published);
    } catch {
      // ignore
    }
  }

  const form = document.getElementById("productForm");
  const productsList = document.getElementById("productsList");

  const submitBtn = document.getElementById("submitBtn");
  const cancelBtn = document.getElementById("cancelBtn");
  const formSection = document.querySelector(".form-section");

  const productImageFileInput = document.getElementById("productImageFile");
  const productImagesFilesInput = document.getElementById("productImagesFiles");
  const clearImagesBtn = document.getElementById("clearImagesBtn");

  const level2Feminin = document.getElementById("productLevel2Feminin");
  const level2Masculin = document.getElementById("productLevel2Masculin");

  let editingIndex = null;
  let sizeCount = 0;
  let guideCount = 0;

  // Pour préserver les images existantes lors d'une édition
  // tant que l'utilisateur ne les modifie pas.
  let editingOriginalImage = "";
  let editingOriginalImages = [];
  let imagesResetRequested = false;

  function readFileAsDataURL(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(new Error("read_failed"));
      reader.readAsDataURL(file);
    });
  }

  async function readFilesAsDataURLs(fileList) {
    const files = Array.from(fileList || []).filter(Boolean);
    const urls = [];
    for (const file of files) {
      if (file.type && !file.type.startsWith("image/")) continue;
      // eslint-disable-next-line no-await-in-loop
      const url = await readFileAsDataURL(file);
      if (url) urls.push(url);
    }
    return urls;
  }

  function load() {
    return window.ProductStore?.loadProducts?.() || [];
  }

  function save(products) {
    window.ProductStore?.saveProducts?.(products);
    renderList();
  }

  function exportProductsJson() {
    const products = load();
    const json = JSON.stringify(products || [], null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = "products.json";
    document.body.appendChild(a);
    a.click();
    a.remove();

    setTimeout(() => URL.revokeObjectURL(url), 500);
  }

  async function importProductsJson(file) {
    if (!file) return;
    const text = await file.text();
    const parsed = JSON.parse(text);
    if (!Array.isArray(parsed)) {
      alert("Fichier invalide : le JSON doit être un tableau de produits.");
      return;
    }

    save(parsed);
    alert("Produits importés dans le navigateur ! Pense à exporter puis commit/push assets/data/products.json pour les publier.");
  }

  document.getElementById("exportProductsBtn")?.addEventListener("click", exportProductsJson);
  document.getElementById("importProductsFile")?.addEventListener("change", async (e) => {
    const file = e.target?.files?.[0];
    try {
      await importProductsJson(file);
    } catch {
      alert("Impossible d’importer ce fichier.");
    } finally {
      try { e.target.value = ""; } catch { /* ignore */ }
    }
  });

  function addSizeRow(valueLabel = "", valueStock = 0) {
    sizeCount++;
    const container = document.getElementById("sizesContainer");

    const group = document.createElement("div");
    group.className = "size-input-group";
    group.style.display = "grid";
    group.style.gridTemplateColumns = "1fr 1fr";
    group.style.gap = "10px";
    group.style.marginBottom = "10px";

    group.innerHTML = `
      <div>
        <label style="font-size:12px;margin-bottom:3px;">Taille</label>
        <input type="text" class="size-label" placeholder="ex: S, M, L..." value="${valueLabel}">
      </div>
      <div>
        <label style="font-size:12px;margin-bottom:3px;">Stock</label>
        <input type="number" class="size-stock" min="0" value="${valueStock}">
      </div>
    `;

    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.textContent = "Supprimer";
    removeBtn.style.gridColumn = "1 / -1";
    removeBtn.style.background = "#999";
    removeBtn.onclick = () => group.remove();

    group.appendChild(removeBtn);
    container.appendChild(group);
  }

  function addGuideRow(row = {}) {
    guideCount++;
    const container = document.getElementById("sizeGuideContainer");

    const group = document.createElement("div");
    group.className = "guide-input-group";
    group.style.display = "grid";
    group.style.gridTemplateColumns = "1fr 1fr 1fr 1fr";
    group.style.gap = "8px";
    group.style.marginBottom = "10px";

    group.innerHTML = `
      <div>
        <label style="font-size:11px;margin-bottom:2px;">Taille</label>
        <input type="text" class="guide-size" value="${row.size || ""}" placeholder="S" style="padding:8px;">
      </div>
      <div>
        <label style="font-size:11px;margin-bottom:2px;">Poitrine</label>
        <input type="text" class="guide-poitrine" value="${row.poitrine || ""}" placeholder="80–85" style="padding:8px;">
      </div>
      <div>
        <label style="font-size:11px;margin-bottom:2px;">Taille</label>
        <input type="text" class="guide-taille" value="${row.taille || ""}" placeholder="65–70" style="padding:8px;">
      </div>
      <div>
        <label style="font-size:11px;margin-bottom:2px;">Hanches</label>
        <input type="text" class="guide-hanches" value="${row.hanches || ""}" placeholder="90–95" style="padding:8px;">
      </div>
    `;

    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.textContent = "Supprimer";
    removeBtn.style.gridColumn = "1 / -1";
    removeBtn.style.background = "#999";
    removeBtn.onclick = () => group.remove();

    group.appendChild(removeBtn);
    container.appendChild(group);
  }

  function resetDynamicSections() {
    document.getElementById("sizesContainer").innerHTML = "";
    document.getElementById("sizeGuideContainer").innerHTML = "";
    sizeCount = 0;
    guideCount = 0;
    addSizeRow();
  }

  function startEdit(index) {
    const products = load();
    const p = products[index];
    if (!p) return;

    editingIndex = index;
    imagesResetRequested = false;
    editingOriginalImage = p.image || "";
    editingOriginalImages = Array.isArray(p.images) ? [...p.images] : [];

    document.getElementById("productId").value = p.id || "";
    document.getElementById("productName").value = p.name || "";
    document.getElementById("productPrice").value = p.price ?? "";
    // Ne pas injecter une énorme data URL dans un input texte
    document.getElementById("productImage").value = (p.image && typeof p.image === "string" && !p.image.startsWith("data:")) ? p.image : "";

    // Évite de mettre des data URLs (énormes) dans le textarea
    const safeUrls = Array.isArray(p.images)
      ? p.images.filter(src => typeof src === "string" && src && !src.startsWith("data:"))
      : [];
    document.getElementById("productImages").value = safeUrls.join("\n");

    if (productImageFileInput) productImageFileInput.value = "";
    if (productImagesFilesInput) productImagesFilesInput.value = "";
    document.getElementById("productDescription").value = p.description || "";

    document.getElementById("productCollection").value = p.collection || "";
    document.getElementById("productLevel1").value = p.level1 || "";

    const storedLevel2 = p.level2;
    const level2Values = Array.isArray(storedLevel2)
      ? storedLevel2
      : (typeof storedLevel2 === "string" ? storedLevel2.split(/\s+/).filter(Boolean) : []);

    if (level2Feminin) level2Feminin.checked = level2Values.includes("feminin");
    if (level2Masculin) level2Masculin.checked = level2Values.includes("masculin");

    document.getElementById("productLevel3").value = p.level3 || "";

    document.getElementById("mannequinHeight").value = p.mannequin?.height || "";
    document.getElementById("mannequinSize").value = p.mannequin?.size || "";

    document.getElementById("sizesContainer").innerHTML = "";
    (p.sizes || []).forEach(s => addSizeRow(s.label || "", s.stock || 0));
    if (!p.sizes || p.sizes.length === 0) addSizeRow();

    document.getElementById("sizeGuideContainer").innerHTML = "";
    (p.sizeGuide || []).forEach(r => addGuideRow(r));

    if (formSection) formSection.classList.add("editing");
    if (submitBtn) submitBtn.textContent = "Mettre à jour le produit";
    if (cancelBtn) cancelBtn.classList.add("visible");

    formSection?.scrollIntoView({ behavior: "smooth" });
  }

  function cancelEdit() {
    editingIndex = null;
    imagesResetRequested = false;
    editingOriginalImage = "";
    editingOriginalImages = [];
    if (form) form.reset();
    resetDynamicSections();

    if (formSection) formSection.classList.remove("editing");
    if (submitBtn) submitBtn.textContent = "Ajouter le produit";
    if (cancelBtn) cancelBtn.classList.remove("visible");
  }

  window.cancelEdit = cancelEdit;

  function clearImageFields() {
    const imageInput = document.getElementById("productImage");
    const imagesTextarea = document.getElementById("productImages");

    if (imageInput) imageInput.value = "";
    if (imagesTextarea) imagesTextarea.value = "";
    if (productImageFileInput) productImageFileInput.value = "";
    if (productImagesFilesInput) productImagesFilesInput.value = "";
  }

  clearImagesBtn?.addEventListener("click", () => {
    imagesResetRequested = true;
    clearImageFields();
  });

  function renderList() {
    const products = load();
    if (!productsList) return;

    if (products.length === 0) {
      productsList.innerHTML = '<p style="color:#999;">Aucun produit</p>';
      return;
    }

    productsList.innerHTML = products
      .map(
        (p, idx) => `
        <div class="product-item">
          <div class="product-info">
            <h3>${p.name || "(Sans nom)"}</h3>
            <p>${Number(p.price || 0).toFixed(2)} EUR • ID: ${p.id || ""}</p>
          </div>
          <div class="product-actions">
            <a class="edit-btn" href="produit.html?id=${encodeURIComponent(p.id || "")}&preview=1" target="_blank" rel="noopener noreferrer" title="Voir la fiche (preview)" aria-label="Voir la fiche (preview)" style="text-decoration:none; display:inline-flex; align-items:center; justify-content:center;">
              👁️
            </a>
            <button class="move-btn" data-move-up="${idx}" ${idx === 0 ? "disabled" : ""} title="Monter">↑</button>
            <button class="move-btn" data-move-down="${idx}" ${idx === products.length - 1 ? "disabled" : ""} title="Descendre">↓</button>
            <button class="edit-btn" data-edit="${idx}">Modifier</button>
            <button class="delete-btn" data-delete="${idx}">Supprimer</button>
          </div>
        </div>
      `
      )
      .join("");

    function moveItem(fromIndex, toIndex) {
      const list = load();
      if (fromIndex < 0 || fromIndex >= list.length) return;
      if (toIndex < 0 || toIndex >= list.length) return;
      if (fromIndex === toIndex) return;

      const [item] = list.splice(fromIndex, 1);
      list.splice(toIndex, 0, item);

      // ajuster l'index d'édition si nécessaire
      if (editingIndex === fromIndex) {
        editingIndex = toIndex;
      } else if (editingIndex !== null) {
        // si on a déplacé un item autour de celui édité, corriger l'index
        if (fromIndex < editingIndex && toIndex >= editingIndex) editingIndex -= 1;
        if (fromIndex > editingIndex && toIndex <= editingIndex) editingIndex += 1;
      }

      save(list);
    }

    productsList.querySelectorAll("[data-delete]").forEach(btn => {
      btn.addEventListener("click", () => {
        const index = Number(btn.getAttribute("data-delete"));
        if (!Number.isFinite(index)) return;
        if (!confirm("Êtes-vous sûr ?")) return;

        const list = load();
        list.splice(index, 1);
        save(list);

        if (editingIndex === index) {
          cancelEdit();
        }
      });
    });

    productsList.querySelectorAll("[data-edit]").forEach(btn => {
      btn.addEventListener("click", () => {
        const index = Number(btn.getAttribute("data-edit"));
        startEdit(index);
      });
    });

    productsList.querySelectorAll("[data-move-up]").forEach(btn => {
      btn.addEventListener("click", () => {
        const index = Number(btn.getAttribute("data-move-up"));
        if (!Number.isFinite(index)) return;
        moveItem(index, index - 1);
      });
    });

    productsList.querySelectorAll("[data-move-down]").forEach(btn => {
      btn.addEventListener("click", () => {
        const index = Number(btn.getAttribute("data-move-down"));
        if (!Number.isFinite(index)) return;
        moveItem(index, index + 1);
      });
    });
  }

  // boutons "ajouter ligne"
  document.getElementById("addSizeBtn")?.addEventListener("click", () => addSizeRow());
  document.getElementById("addGuideBtn")?.addEventListener("click", () => addGuideRow());

  cancelBtn?.addEventListener("click", cancelEdit);

  form?.addEventListener("submit", async e => {
    e.preventDefault();

    const sizes = [];
    document.querySelectorAll(".size-input-group").forEach(group => {
      const label = group.querySelector(".size-label")?.value?.trim();
      const stock = Number(group.querySelector(".size-stock")?.value || 0);
      if (label) sizes.push({ label, stock: Number.isFinite(stock) ? stock : 0 });
    });

    const sizeGuide = [];
    document.querySelectorAll(".guide-input-group").forEach(group => {
      const size = group.querySelector(".guide-size")?.value?.trim();
      const poitrine = group.querySelector(".guide-poitrine")?.value?.trim();
      const taille = group.querySelector(".guide-taille")?.value?.trim();
      const hanches = group.querySelector(".guide-hanches")?.value?.trim();
      if (size) sizeGuide.push({ size, poitrine, taille, hanches });
    });

    const selectedLevel2 = [];
    if (level2Feminin?.checked) selectedLevel2.push("feminin");
    if (level2Masculin?.checked) selectedLevel2.push("masculin");

    const product = {
      id: document.getElementById("productId").value.trim(),
      name: document.getElementById("productName").value.trim(),
      price: Number(document.getElementById("productPrice").value),
      image: document.getElementById("productImage").value.trim(),
      images: [],
      description: document.getElementById("productDescription").value.trim(),
      collection: document.getElementById("productCollection").value,
      level1: document.getElementById("productLevel1").value,
      level2: selectedLevel2.length <= 1 ? (selectedLevel2[0] || "") : selectedLevel2,
      level3: document.getElementById("productLevel3").value,
      sizes,
      sizeGuide,
      mannequin: {
        height: document.getElementById("mannequinHeight").value.trim(),
        size: document.getElementById("mannequinSize").value.trim()
      }
    };

    // Images par URLs
    const rawImages = document.getElementById("productImages")?.value || "";
    const parsedUrls = rawImages
      .split(/\r?\n/)
      .map(s => s.trim())
      .filter(Boolean);

    // Images par fichiers
    let mainFileDataUrl = "";
    if (productImageFileInput?.files && productImageFileInput.files.length > 0) {
      try {
        mainFileDataUrl = await readFileAsDataURL(productImageFileInput.files[0]);
      } catch {
        mainFileDataUrl = "";
      }
    }

    let galleryFilesDataUrls = [];
    if (productImagesFilesInput?.files && productImagesFilesInput.files.length > 0) {
      try {
        galleryFilesDataUrls = await readFilesAsDataURLs(productImagesFilesInput.files);
      } catch {
        galleryFilesDataUrls = [];
      }
    }

    // Priorité : fichier principal > URL principale
    if (mainFileDataUrl) {
      product.image = mainFileDataUrl;
    }

    const combined = [];
    if (product.image) combined.push(product.image);
    combined.push(...galleryFilesDataUrls);
    combined.push(...parsedUrls);

    const newImages = Array.from(new Set(combined.filter(Boolean)));

    // Si on édite et qu'on n'a fourni aucune nouvelle image, on conserve les images existantes
    const noNewImagesProvided =
      !imagesResetRequested &&
      editingIndex !== null &&
      !mainFileDataUrl &&
      galleryFilesDataUrls.length === 0 &&
      parsedUrls.length === 0 &&
      !product.image;

    if (noNewImagesProvided) {
      product.image = editingOriginalImage || "";
      product.images = Array.isArray(editingOriginalImages) ? [...editingOriginalImages] : [];
    } else {
      product.images = newImages;
      if (!product.image && product.images.length > 0) {
        product.image = product.images[0];
      }
    }

    if (!product.id || !product.name || !Number.isFinite(product.price) || !product.image) {
      alert("Merci de remplir au minimum: ID, Nom, Prix, Image (URL ou fichier). ");
      return;
    }

    const products = load();

    // empêcher doublon d'ID (sauf si on édite)
    const duplicateIndex = products.findIndex(p => p.id === product.id);
    if (duplicateIndex !== -1 && duplicateIndex !== editingIndex) {
      alert("Cet ID existe déjà. Choisis un autre ID.");
      return;
    }

    if (editingIndex !== null) {
      products[editingIndex] = product;
      save(products);
      alert("Produit mis à jour !");
      cancelEdit();
      return;
    }

    products.push(product);
    save(products);
    alert("Produit ajouté !");

    form.reset();
    imagesResetRequested = false;
    editingOriginalImage = "";
    editingOriginalImages = [];
    resetDynamicSections();
  });

  // init
  if (window.ProductStore && !window.ProductStore.storageAvailable) {
    const warn = document.getElementById("storageWarning");
    if (warn) warn.style.display = "block";
  }

  resetDynamicSections();
  await seedProductsFromPublishedIfSuspicious();
  renderList();

  // =========================
  // ARTICLES (ÉVÈNEMENTS)
  // =========================

  const articleForm = document.getElementById("articleForm");
  const articlesAdminList = document.getElementById("articlesAdminList");
  const exportArticlesBtn = document.getElementById("exportArticlesBtn");
  const importArticlesFile = document.getElementById("importArticlesFile");
  const articleSubmitBtn = document.getElementById("articleSubmitBtn");
  const articleCancelBtn = document.getElementById("articleCancelBtn");
  const articleFormSection = document.getElementById("articleFormSection");

  let editingArticleIndex = null;

  function loadArticles() {
    return window.ArticleStore?.loadArticles?.() || [];
  }

  function saveArticles(list) {
    window.ArticleStore?.saveArticles?.(list);
    renderArticlesList();
  }

  function exportArticlesJson() {
    const list = loadArticles();
    const json = JSON.stringify(list || [], null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = "articles.json";
    document.body.appendChild(a);
    a.click();
    a.remove();

    setTimeout(() => URL.revokeObjectURL(url), 500);
  }

  async function importArticlesJson(file) {
    if (!file) return;
    const text = await file.text();
    const parsed = JSON.parse(text);
    if (!Array.isArray(parsed)) {
      alert("Fichier invalide : le JSON doit être un tableau d’articles.");
      return;
    }
    saveArticles(parsed);
    alert("Articles importés dans le navigateur ! Pense à exporter puis commit/push assets/data/articles.json pour les publier.");
  }

  async function seedArticlesFromPublishedIfEmpty() {
    try {
      const existing = loadArticles();
      if (existing.length > 0) return;
      const published = await window.loadPublishedArticles?.();
      if (Array.isArray(published) && published.length > 0) {
        saveArticles(published);
      }
    } catch {
      // ignore
    }
  }

  function startEditArticle(index) {
    const list = loadArticles();
    const a = list[index];
    if (!a) return;

    editingArticleIndex = index;

    document.getElementById("articleId").value = a.id || "";
    document.getElementById("articleTitle").value = a.title || "";
    document.getElementById("articleDate").value = a.date || "";
    document.getElementById("articleImage").value = a.image || "";
    document.getElementById("articleExcerpt").value = a.excerpt || "";
    document.getElementById("articleContent").value = a.content || "";

    const safeImages = Array.isArray(a.images) ? a.images.filter(Boolean) : [];
    document.getElementById("articleImages").value = safeImages.join("\n");

    if (articleFormSection) articleFormSection.classList.add("editing");
    if (articleSubmitBtn) articleSubmitBtn.textContent = "Mettre à jour l’article";
    if (articleCancelBtn) articleCancelBtn.classList.add("visible");
    articleFormSection?.scrollIntoView({ behavior: "smooth" });
  }

  function cancelEditArticle() {
    editingArticleIndex = null;
    try {
      articleForm?.reset();
    } catch {
      // ignore
    }

    if (articleFormSection) articleFormSection.classList.remove("editing");
    if (articleSubmitBtn) articleSubmitBtn.textContent = "Ajouter l’article";
    if (articleCancelBtn) articleCancelBtn.classList.remove("visible");
  }

  function renderArticlesList() {
    if (!articlesAdminList) return;
    const list = loadArticles();

    if (list.length === 0) {
      articlesAdminList.innerHTML = '<p style="color:#999;">Aucun article</p>';
      return;
    }

    articlesAdminList.innerHTML = list
      .map(
        (a, idx) => `
          <div class="product-item">
            <div class="product-info">
              <h3>${a.title || "(Sans titre)"}</h3>
              <p>${a.date || ""} • ID: ${a.id || ""}</p>
            </div>
            <div class="product-actions">
              <a class="edit-btn" href="articles/article.html?id=${encodeURIComponent(a.id || "")}&preview=1" target="_blank" rel="noopener noreferrer" title="Voir l’article (preview)" aria-label="Voir l’article (preview)" style="text-decoration:none; display:inline-flex; align-items:center; justify-content:center;">
                👁️
              </a>
              <button class="move-btn" data-article-newsletter="${idx}" title="Envoyer au Journal" aria-label="Envoyer au Journal">✉</button>
              <button class="move-btn" data-article-move-up="${idx}" ${idx === 0 ? "disabled" : ""} title="Monter">↑</button>
              <button class="move-btn" data-article-move-down="${idx}" ${idx === list.length - 1 ? "disabled" : ""} title="Descendre">↓</button>
              <button class="edit-btn" data-article-edit="${idx}">Modifier</button>
              <button class="delete-btn" data-article-delete="${idx}">Supprimer</button>
            </div>
          </div>
        `
      )
      .join("");

    function getNewsletterToken() {
      const KEY = "simone_newsletter_notify_token";
      let token = "";
      try {
        token = String(sessionStorage.getItem(KEY) || "").trim();
      } catch {
        token = "";
      }

      if (token) return token;
      const entered = prompt("Token Newsletter (admin) :");
      if (!entered) return null;
      token = String(entered).trim();
      if (!token) return null;
      try {
        sessionStorage.setItem(KEY, token);
      } catch {
        // ignore
      }
      return token;
    }

    function clearNewsletterToken() {
      try {
        sessionStorage.removeItem("simone_newsletter_notify_token");
      } catch {
        // ignore
      }
    }

    function buildArticleUrl(articleId) {
      try {
        const url = new URL("articles/article.html", document.baseURI);
        url.searchParams.set("id", String(articleId || ""));
        return url.toString();
      } catch {
        return `articles/article.html?id=${encodeURIComponent(String(articleId || ""))}`;
      }
    }

    async function notifyNewsletterForArticle(article, buttonEl, opts = {}) {
      if (!article || !article.id || !article.title) {
        alert("Article invalide (id/titre manquant). ");
        return;
      }

      const force = opts && opts.force === true;
      const proceed = confirm(`${force ? "FORCER RENVOI — " : ""}Envoyer cet article au Journal ?\n\n${article.title}`);
      if (!proceed) return;

      const token = getNewsletterToken();
      if (!token) {
        alert("Token manquant. Envoi annulé.");
        return;
      }

      const endpoint = "server/newsletter-article-notify.php";
      const payload = {
        article: {
          id: String(article.id || "").trim(),
          title: String(article.title || "").trim(),
          date: String(article.date || "").trim(),
          excerpt: String(article.excerpt || "").trim(),
          image: String(article.image || "").trim(),
        },
        url: buildArticleUrl(article.id),
        force: force ? 1 : 0,
      };

      const btn = buttonEl && typeof buttonEl === "object" ? buttonEl : null;
      const originalText = btn ? String(btn.textContent || "") : null;
      if (btn) {
        btn.disabled = true;
        btn.textContent = "…";
      }

      let safety = 0;
      try {
        while (safety < 200) {
          safety += 1;

          let res;
          try {
            res = await fetch(endpoint, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "X-Newsletter-Token": token,
              },
              body: JSON.stringify(payload),
            });
          } catch {
            throw new Error("Impossible de contacter le serveur.");
          }

          let data = null;
          try {
            data = await res.json();
          } catch {
            data = null;
          }

          if (res.status === 403) {
            clearNewsletterToken();
            throw new Error("Token invalide (403). Token effacé de la session.");
          }

          if (!res.ok || !data || data.ok !== true) {
            const msg = data && data.error ? String(data.error) : `Erreur serveur (${res.status}).`;
            throw new Error(msg);
          }

          const sentTotal = Number(data.sent_total ?? 0);
          const total = Number(data.total ?? 0);
          const remaining = Number(data.remaining ?? 0);
          const done = Boolean(data.done);

          if (btn) {
            btn.textContent = done ? "✓" : `${sentTotal}/${total}`;
          }

          if (done || remaining <= 0) {
            alert(`Journal envoyé.\n\nEnvoyés: ${sentTotal}/${total}${data.errors_total ? `\nErreurs: ${data.errors_total}` : ""}`);
            return;
          }

          await new Promise((r) => setTimeout(r, 800));
        }

        throw new Error("Envoi interrompu (trop de lots). Réessaie.");
      } catch (err) {
        alert(err && err.message ? err.message : "Erreur pendant l’envoi.");
      } finally {
        if (btn) {
          btn.disabled = false;
          btn.textContent = originalText || "✉";
        }
      }
    }

    function moveArticle(fromIndex, toIndex) {
      const arr = loadArticles();
      if (fromIndex < 0 || fromIndex >= arr.length) return;
      if (toIndex < 0 || toIndex >= arr.length) return;
      if (fromIndex === toIndex) return;

      const [item] = arr.splice(fromIndex, 1);
      arr.splice(toIndex, 0, item);

      if (editingArticleIndex === fromIndex) {
        editingArticleIndex = toIndex;
      } else if (editingArticleIndex !== null) {
        if (fromIndex < editingArticleIndex && toIndex >= editingArticleIndex) editingArticleIndex -= 1;
        if (fromIndex > editingArticleIndex && toIndex <= editingArticleIndex) editingArticleIndex += 1;
      }

      saveArticles(arr);
    }

    articlesAdminList.querySelectorAll("[data-article-delete]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const index = Number(btn.getAttribute("data-article-delete"));
        if (!Number.isFinite(index)) return;
        if (!confirm("Êtes-vous sûr ?")) return;

        const arr = loadArticles();
        arr.splice(index, 1);
        saveArticles(arr);

        if (editingArticleIndex === index) {
          cancelEditArticle();
        }
      });
    });

    articlesAdminList.querySelectorAll("[data-article-edit]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const index = Number(btn.getAttribute("data-article-edit"));
        startEditArticle(index);
      });
    });

    articlesAdminList.querySelectorAll("[data-article-move-up]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const index = Number(btn.getAttribute("data-article-move-up"));
        if (!Number.isFinite(index)) return;
        moveArticle(index, index - 1);
      });
    });

    articlesAdminList.querySelectorAll("[data-article-move-down]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const index = Number(btn.getAttribute("data-article-move-down"));
        if (!Number.isFinite(index)) return;
        moveArticle(index, index + 1);
      });
    });

    articlesAdminList.querySelectorAll("[data-article-newsletter]").forEach((btn) => {
      btn.addEventListener("click", (ev) => {
        const index = Number(btn.getAttribute("data-article-newsletter"));
        if (!Number.isFinite(index)) return;
        const arr = loadArticles();
        const article = arr[index];
        const force = Boolean(ev && ev.shiftKey);
        notifyNewsletterForArticle(article, btn, { force });
      });
    });
  }

  exportArticlesBtn?.addEventListener("click", exportArticlesJson);
  importArticlesFile?.addEventListener("change", async (e) => {
    const file = e.target?.files?.[0];
    try {
      await importArticlesJson(file);
    } catch {
      alert("Impossible d’importer ce fichier.");
    } finally {
      try {
        e.target.value = "";
      } catch {
        /* ignore */
      }
    }
  });

  articleCancelBtn?.addEventListener("click", cancelEditArticle);

  articleForm?.addEventListener("submit", (e) => {
    e.preventDefault();

    const id = document.getElementById("articleId").value.trim();
    const title = document.getElementById("articleTitle").value.trim();
    const date = document.getElementById("articleDate").value.trim();
    const image = document.getElementById("articleImage").value.trim();
    const excerpt = document.getElementById("articleExcerpt").value.trim();
    const content = document.getElementById("articleContent").value;

    const rawImages = document.getElementById("articleImages").value || "";
    const images = rawImages
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean);

    if (!id || !title || !date) {
      alert("Merci de remplir au minimum : ID, Titre, Date.");
      return;
    }

    const uniqueImages = Array.from(new Set(images));

    const article = {
      id,
      title,
      date,
      image: image,
      images: uniqueImages,
      excerpt,
      content
    };

    const list = loadArticles();

    const duplicateIndex = list.findIndex((a) => a.id === id);
    if (duplicateIndex !== -1 && duplicateIndex !== editingArticleIndex) {
      alert("Cet ID existe déjà. Choisis un autre ID.");
      return;
    }

    if (editingArticleIndex !== null) {
      list[editingArticleIndex] = article;
      saveArticles(list);
      alert("Article mis à jour !");
      cancelEditArticle();
      return;
    }

    list.push(article);
    saveArticles(list);
    alert("Article ajouté !");
    articleForm.reset();
  });

  if (window.ArticleStore?.storageAvailable) {
    seedArticlesFromPublishedIfEmpty();
  }

  renderArticlesList();

  // =========================
  // LOOKBOOKS (COLLECTIONS)
  // =========================

  const lookbookForm = document.getElementById("lookbookForm");
  const lookbooksAdminList = document.getElementById("lookbooksAdminList");
  const exportLookbooksBtn = document.getElementById("exportLookbooksBtn");
  const importLookbooksFile = document.getElementById("importLookbooksFile");
  const lookbookSubmitBtn = document.getElementById("lookbookSubmitBtn");
  const lookbookCancelBtn = document.getElementById("lookbookCancelBtn");
  const lookbookFormSection = document.getElementById("lookbookFormSection");
  const lookbookImagesFilesInput = document.getElementById("lookbookImagesFiles");

  let editingLookbookIndex = null;

  function loadLookbooks() {
    return window.LookbookStore?.loadLookbooks?.() || [];
  }

  function saveLookbooks(list) {
    window.LookbookStore?.saveLookbooks?.(list);
    renderLookbooksList();
  }

  function exportLookbooksJson() {
    const list = loadLookbooks();
    const json = JSON.stringify(list || [], null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = "lookbooks.json";
    document.body.appendChild(a);
    a.click();
    a.remove();

    setTimeout(() => URL.revokeObjectURL(url), 500);
  }

  async function importLookbooksJson(file) {
    if (!file) return;
    const text = await file.text();
    const parsed = JSON.parse(text);
    if (!Array.isArray(parsed)) {
      alert("Fichier invalide : le JSON doit être un tableau de lookbooks.");
      return;
    }
    saveLookbooks(parsed);
    alert("Lookbooks importés dans le navigateur ! Pense à exporter puis commit/push assets/data/lookbooks.json pour les publier.");
  }

  async function seedLookbooksFromPublishedIfEmpty() {
    try {
      const existing = loadLookbooks();
      if (existing.length > 0) return;
      const published = await window.loadPublishedLookbooks?.();
      if (Array.isArray(published) && published.length > 0) {
        saveLookbooks(published);
      }
    } catch {
      // ignore
    }
  }

  function startEditLookbook(index) {
    const list = loadLookbooks();
    const lb = list[index];
    if (!lb) return;

    editingLookbookIndex = index;

    document.getElementById("lookbookId").value = lb.id || "";
    document.getElementById("lookbookSeason").value = lb.season || "";
    document.getElementById("lookbookTitle").value = lb.title || "";

    const imgs = Array.isArray(lb.images) ? lb.images.filter(Boolean) : [];
    document.getElementById("lookbookImages").value = imgs.join("\n");

    if (lookbookImagesFilesInput) lookbookImagesFilesInput.value = "";

    if (lookbookFormSection) lookbookFormSection.classList.add("editing");
    if (lookbookSubmitBtn) lookbookSubmitBtn.textContent = "Mettre à jour le lookbook";
    if (lookbookCancelBtn) lookbookCancelBtn.classList.add("visible");
    lookbookFormSection?.scrollIntoView({ behavior: "smooth" });
  }

  function cancelEditLookbook() {
    editingLookbookIndex = null;
    try {
      lookbookForm?.reset();
    } catch {
      // ignore
    }

    if (lookbookImagesFilesInput) lookbookImagesFilesInput.value = "";

    if (lookbookFormSection) lookbookFormSection.classList.remove("editing");
    if (lookbookSubmitBtn) lookbookSubmitBtn.textContent = "Ajouter le lookbook";
    if (lookbookCancelBtn) lookbookCancelBtn.classList.remove("visible");
  }

  function renderLookbooksList() {
    if (!lookbooksAdminList) return;
    const list = loadLookbooks();

    if (list.length === 0) {
      lookbooksAdminList.innerHTML = '<p style="color:#999;">Aucun lookbook</p>';
      return;
    }

    lookbooksAdminList.innerHTML = list
      .map(
        (lb, idx) => `
          <div class="product-item">
            <div class="product-info">
              <h3>${lb.title || "(Sans titre)"}</h3>
              <p>${lb.season || ""} • ID: ${lb.id || ""}</p>
            </div>
            <div class="product-actions">
              <a class="edit-btn" href="collections/?preview=1" target="_blank" rel="noopener noreferrer" title="Voir Collections (preview)" aria-label="Voir Collections (preview)" style="text-decoration:none; display:inline-flex; align-items:center; justify-content:center;">
                📚
              </a>
              <a class="edit-btn" href="lookbook-ss25.html?id=${encodeURIComponent(lb.id || "")}&preview=1" target="_blank" rel="noopener noreferrer" title="Voir le lookbook (preview)" aria-label="Voir le lookbook (preview)" style="text-decoration:none; display:inline-flex; align-items:center; justify-content:center;">
                👁️
              </a>
              <button class="move-btn" data-lookbook-move-up="${idx}" ${idx === 0 ? "disabled" : ""} title="Monter">↑</button>
              <button class="move-btn" data-lookbook-move-down="${idx}" ${idx === list.length - 1 ? "disabled" : ""} title="Descendre">↓</button>
              <button class="edit-btn" data-lookbook-edit="${idx}">Modifier</button>
              <button class="delete-btn" data-lookbook-delete="${idx}">Supprimer</button>
            </div>
          </div>
        `
      )
      .join("");

    function moveLookbook(fromIndex, toIndex) {
      const arr = loadLookbooks();
      if (fromIndex < 0 || fromIndex >= arr.length) return;
      if (toIndex < 0 || toIndex >= arr.length) return;
      if (fromIndex === toIndex) return;

      const [item] = arr.splice(fromIndex, 1);
      arr.splice(toIndex, 0, item);

      if (editingLookbookIndex === fromIndex) {
        editingLookbookIndex = toIndex;
      } else if (editingLookbookIndex !== null) {
        if (fromIndex < editingLookbookIndex && toIndex >= editingLookbookIndex) editingLookbookIndex -= 1;
        if (fromIndex > editingLookbookIndex && toIndex <= editingLookbookIndex) editingLookbookIndex += 1;
      }

      saveLookbooks(arr);
    }

    lookbooksAdminList.querySelectorAll("[data-lookbook-delete]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const index = Number(btn.getAttribute("data-lookbook-delete"));
        if (!Number.isFinite(index)) return;
        if (!confirm("Êtes-vous sûr ?")) return;

        const arr = loadLookbooks();
        arr.splice(index, 1);
        saveLookbooks(arr);

        if (editingLookbookIndex === index) {
          cancelEditLookbook();
        }
      });
    });

    lookbooksAdminList.querySelectorAll("[data-lookbook-edit]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const index = Number(btn.getAttribute("data-lookbook-edit"));
        startEditLookbook(index);
      });
    });

    lookbooksAdminList.querySelectorAll("[data-lookbook-move-up]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const index = Number(btn.getAttribute("data-lookbook-move-up"));
        if (!Number.isFinite(index)) return;
        moveLookbook(index, index - 1);
      });
    });

    lookbooksAdminList.querySelectorAll("[data-lookbook-move-down]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const index = Number(btn.getAttribute("data-lookbook-move-down"));
        if (!Number.isFinite(index)) return;
        moveLookbook(index, index + 1);
      });
    });
  }

  exportLookbooksBtn?.addEventListener("click", exportLookbooksJson);
  importLookbooksFile?.addEventListener("change", async (e) => {
    const file = e.target?.files?.[0];
    try {
      await importLookbooksJson(file);
    } catch {
      alert("Impossible d’importer ce fichier.");
    } finally {
      try {
        e.target.value = "";
      } catch {
        /* ignore */
      }
    }
  });

  lookbookCancelBtn?.addEventListener("click", cancelEditLookbook);

  lookbookImagesFilesInput?.addEventListener("change", (e) => {
    const textarea = document.getElementById("lookbookImages");
    if (!textarea) return;

    const files = Array.from(e.target?.files || []).filter(Boolean);
    const names = files
      .filter((f) => !f.type || String(f.type).startsWith("image/"))
      .map((f) => String(f.name || "").trim())
      .filter(Boolean);

    textarea.value = Array.from(new Set(names)).join("\n");
  });

  lookbookForm?.addEventListener("submit", (e) => {
    e.preventDefault();

    const id = document.getElementById("lookbookId").value.trim();
    const season = document.getElementById("lookbookSeason").value.trim();
    const title = document.getElementById("lookbookTitle").value.trim();

    const rawImages = document.getElementById("lookbookImages").value || "";
    const images = rawImages
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean);

    if (!id || !season || !title) {
      alert("Merci de remplir au minimum : ID, Saison, Titre.");
      return;
    }

    const lookbook = {
      id,
      season,
      title,
      images: Array.from(new Set(images))
    };

    const list = loadLookbooks();
    const duplicateIndex = list.findIndex((lb) => lb.id === id);
    if (duplicateIndex !== -1 && duplicateIndex !== editingLookbookIndex) {
      alert("Cet ID existe déjà. Choisis un autre ID.");
      return;
    }

    if (editingLookbookIndex !== null) {
      list[editingLookbookIndex] = lookbook;
      saveLookbooks(list);
      alert("Lookbook mis à jour !");
      cancelEditLookbook();
      return;
    }

    list.push(lookbook);
    saveLookbooks(list);
    alert("Lookbook ajouté !");
    lookbookForm.reset();
  });

  if (window.LookbookStore?.storageAvailable) {
    seedLookbooksFromPublishedIfEmpty();
  }

  renderLookbooksList();
});
