(function () {
  function getProductIdFromURL() {
    const params = new URLSearchParams(window.location.search);
    return params.get("id");
  }

  const params = new URLSearchParams(window.location.search);
const preview = params.get("preview") === "1";

let allProductsCache = null;

async function getAllProductsAsync() {
  if (Array.isArray(allProductsCache)) return allProductsCache;

  // Mode preview : utiliser le stockage local (admin local)
  if (preview) {
    try {
      const stored = window.ProductStore?.loadProducts?.() || [];
      if (stored.length > 0) {
        allProductsCache = stored;
        return stored;
      }
    } catch {
      // ignore
    }
  }

  // Site public : JSON publié
  try {
    const published = await window.loadPublishedProducts?.();
    if (Array.isArray(published) && published.length > 0) {
      allProductsCache = published;
      return published;
    }
  } catch {
    // ignore
  }

  // Fallback : liste embarquée
  if (Array.isArray(window.products)) {
    allProductsCache = window.products;
    return window.products;
  }

  allProductsCache = [];
  return [];
}

async function getProductById(id) {
  const products = await getAllProductsAsync();
  return products.find(p => p.id === id);
}
  let selectedProductSizeLabel = null;
  let selectedProductSizeStock = 0;

  function selectProductSize(element, sizeLabel, stock) {
    if (!element) return;
    if (Number(stock) === 0) return;

    document.querySelectorAll(".sizes .size").forEach(el => el.classList.remove("selected"));
    element.classList.add("selected");
    selectedProductSizeLabel = sizeLabel;
    selectedProductSizeStock = Number(stock) || 0;
  }

  async function addToCart() {
    const productId = getProductIdFromURL();
    const product = productId ? await getProductById(productId) : null;

    if (!product) {
      alert("Produit non trouvé.");
      return;
    }

    if (!selectedProductSizeLabel) {
      alert("Veuillez sélectionner une taille.");
      return;
    }

    if (selectedProductSizeStock === 0) {
      alert("Cette taille est indisponible.");
      return;
    }

    const cart = JSON.parse(localStorage.getItem("cart")) || [];
    cart.push({
      id: product.id,
      name: product.name,
      price: product.price,
      size: selectedProductSizeLabel,
      image: product.image,
      date: new Date().toISOString()
    });
    localStorage.setItem("cart", JSON.stringify(cart));

    if (typeof window.updateCartCount === "function") {
      window.updateCartCount();
    }

    alert("Produit ajouté au panier !");

    selectedProductSizeLabel = null;
    selectedProductSizeStock = 0;
    document.querySelectorAll(".sizes .size").forEach(el => el.classList.remove("selected"));
  }

  // Exposé uniquement ce qui est appelé par le HTML
  window.addToCart = addToCart;

  document.addEventListener("DOMContentLoaded", async () => {
    try {
      const productId = getProductIdFromURL();
      const product = productId ? await getProductById(productId) : null;

      if (!product) {
        const all = await getAllProductsAsync();
        const ids = all.map(p => p && p.id).filter(Boolean);
        const page = document.querySelector(".product-page");
        if (page) {
          const idInfo = productId ? `ID demandé : <strong>${productId}</strong>.` : "Aucun ID dans l’URL.";
          const listHtml = ids.length > 0
            ? `<p style="margin-top:10px; font-size:13px; color:#666;">IDs disponibles : ${ids.map(id => `<a href=\"produit.html?id=${encodeURIComponent(id)}\">${id}</a>`).join(" • ")}</p>`
            : "";
          page.innerHTML = `
            <p>Produit non trouvé. ${idInfo} <a href="confections.html">Retour au catalogue</a></p>
            ${listHtml}
          `;
        }
        return;
      }

      const titleEl = document.getElementById("pageTitle");
      if (titleEl) titleEl.textContent = `${product.name} — Simone Sixx`;
      document.title = `${product.name} — Simone Sixx`;

      const nameEl = document.getElementById("productName");
      const priceEl = document.getElementById("productPrice");
      const descEl = document.getElementById("productDescription");

      if (nameEl) nameEl.textContent = product.name;
      if (priceEl) priceEl.textContent = `${Number(product.price).toFixed(2)} EUR`;
      if (descEl) descEl.textContent = product.description || "";

      const imagesContainer = document.getElementById("imagesContainer");
      const carouselNav = document.getElementById("carouselNav");
      const imageWrapper = document.querySelector(".product-page .image");

      const images = Array.isArray(product.images) && product.images.length > 0
        ? product.images.filter(Boolean)
        : (product.image ? [product.image] : []);

      // Desktop : toutes les images en colonne (CSS déjà prévu)
      if (imagesContainer) {
        imagesContainer.classList.add("desktop-only");
        imagesContainer.innerHTML = "";
        images.forEach(src => {
          const img = document.createElement("img");
          img.src = src;
          img.alt = product.name;
          img.className = "desktop-product-image";
          imagesContainer.appendChild(img);
        });
      }

      // Mobile : carrousel (une image + dots)
      if (imageWrapper && images.length > 0) {
        const existingCarousel = imageWrapper.querySelector(".carousel-container");
        if (existingCarousel) existingCarousel.remove();

        const carousel = document.createElement("div");
        carousel.className = "carousel-container mobile-only";

        const mobileImg = document.createElement("img");
        mobileImg.className = "carousel-image";
        mobileImg.src = images[0];
        mobileImg.alt = product.name;

        carousel.appendChild(mobileImg);
        imageWrapper.insertBefore(carousel, imagesContainer || null);

        if (carouselNav) {
          carouselNav.innerHTML = "";

          let current = 0;
          const counter = document.createElement("div");
          counter.className = "carousel-counter";

          const updateCounter = () => {
            counter.textContent = `${String(current + 1).padStart(2, "0")} / ${String(images.length).padStart(2, "0")}`;
          };

          const goTo = (index) => {
            if (images.length === 0) return;
            const nextIndex = ((index % images.length) + images.length) % images.length;
            current = nextIndex;
            mobileImg.src = images[current];
            updateCounter();
          };

          updateCounter();
          carouselNav.appendChild(counter);

          // Swipe tactile (gauche/droite)
          let startX = 0;
          let startY = 0;

          mobileImg.addEventListener(
            "touchstart",
            (e) => {
              if (images.length <= 1) return;
              const t = e.touches && e.touches[0];
              if (!t) return;
              startX = t.clientX;
              startY = t.clientY;
            },
            { passive: true }
          );

          mobileImg.addEventListener(
            "touchend",
            (e) => {
              if (images.length <= 1) return;
              const t = e.changedTouches && e.changedTouches[0];
              if (!t) return;

              const dx = t.clientX - startX;
              const dy = t.clientY - startY;

              // Seuils simples pour éviter les scrolls verticaux
              if (Math.abs(dx) < 40) return;
              if (Math.abs(dx) < Math.abs(dy)) return;

              // swipe gauche = next, swipe droite = prev
              if (dx < 0) {
                goTo(current + 1);
              } else {
                goTo(current - 1);
              }
            },
            { passive: true }
          );
        }
      }

      const sizesContainer = document.getElementById("sizesContainer");
      if (sizesContainer) {
        sizesContainer.innerHTML = "";
        const sizes = Array.isArray(product.sizes) && product.sizes.length > 0
          ? product.sizes
          : [{ label: "Taille unique", stock: 0 }];

        sizes.forEach(size => {
          const label = typeof size === "string" ? size : size.label;
          const stock = typeof size === "string" ? 0 : Number(size.stock || 0);

          const div = document.createElement("div");
          div.className = "size";
          div.textContent = label;
          div.dataset.stock = String(stock);

          if (stock === 0) {
            div.classList.add("disabled");
          } else {
            div.onclick = () => selectProductSize(div, label, stock);
          }

          sizesContainer.appendChild(div);
        });
      }

      const mannequinInfo = document.getElementById("mannequinInfo");
      if (mannequinInfo) {
        if (product.mannequin && (product.mannequin.height || product.mannequin.size)) {
          const h = product.mannequin.height ? `mesure ${product.mannequin.height}` : "";
          const s = product.mannequin.size ? `porte une taille ${product.mannequin.size}` : "";
          const join = h && s ? " et " : "";
          mannequinInfo.textContent = `Le mannequin ${h}${join}${s}.`;
        } else {
          mannequinInfo.textContent = "";
        }
      }

      const sizeTableContainer = document.getElementById("sizeTableContainer");
      if (sizeTableContainer) {
        sizeTableContainer.innerHTML = "";

        const headerRow = document.createElement("div");
        headerRow.className = "row head";
        headerRow.innerHTML = "<span>Taille</span><span>Poitrine</span><span>Taille</span><span>Hanches</span>";
        sizeTableContainer.appendChild(headerRow);

        if (Array.isArray(product.sizeGuide)) {
          product.sizeGuide.forEach(row => {
            const r = document.createElement("div");
            r.className = "row";
            r.innerHTML = `
              <span>${row.size || ""}</span>
              <span>${row.poitrine || ""}</span>
              <span>${row.taille || ""}</span>
              <span>${row.hanches || ""}</span>
            `;
            sizeTableContainer.appendChild(r);
          });
        }
      }

      if (typeof window.updateCartCount === "function") {
        window.updateCartCount();
      }
    } catch (e) {
      console.error(e);
      const page = document.querySelector(".product-page");
      if (page) {
        page.innerHTML = '<p>Erreur de chargement produit. Ouvre la console (F12) pour voir le détail.</p>';
      }
    }
  });
})();
