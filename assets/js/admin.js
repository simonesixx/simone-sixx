document.addEventListener("DOMContentLoaded", () => {
  window.ProductStore?.seedFromGlobalProducts();

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
            <a class="edit-btn" href="produit.html?id=${encodeURIComponent(p.id || "")}" target="_blank" rel="noopener noreferrer" title="Voir la fiche" aria-label="Voir la fiche" style="text-decoration:none; display:inline-flex; align-items:center; justify-content:center;">
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
  renderList();
});
