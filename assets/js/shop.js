// ======================
// FORMAT PRIX
// ======================

function formatEUR(value) {
  return value.toLocaleString("fr-FR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }) + " EUR";
}


// ======================
// PANIER (GLOBAL)
// ======================

let cart = JSON.parse(localStorage.getItem("cart")) || [];

function saveCart() {
  localStorage.setItem("cart", JSON.stringify(cart));
}

function updateCartCount() {
  document.querySelectorAll("#cartCount").forEach(el => {
    el.textContent = cart.length;
  });
}

  updateCartCount();


// ======================
  // CONFECTIONS — TAILLES
// ======================

  let selectedSize = null;

function selectSize(el) {
    if (el.classList.contains("disabled")) return;

  document.querySelectorAll(".sizes .size").forEach(s => s.classList.remove("selected"));
    el.classList.add("selected");
  selectedSize = el.innerText;
}

function addToCart() {
    if (!selectedSize) {
      alert("Veuillez sélectionner une taille.");
      return;
    }

  const product = {
    name: "Perfecto en cuir noir reflet kaki",
      size: selectedSize,
    price: 310
  };

  cart.push(product);
    saveCart();
    updateCartCount();
    alert("Ajouté au panier");
}


// ======================
// FILTRES — ÉTAT GLOBAL
// ======================

let activeCollection = null; // ex: "ss26"
let level1 = "vestiaire";
  let level2 = null;
  let level3 = null;

// ======================
// ÉLÉMENTS DOM
// ======================

const items = document.querySelectorAll(".item");

const collectionSpans = document.querySelectorAll("#collectionLevel span");
const level1Spans = document.querySelectorAll("#level1 span");
const level2Spans = document.querySelectorAll("#level2 span");
const level3Spans = document.querySelectorAll("#level3 span");

const level2Block = document.getElementById("level2");
const level3Block = document.getElementById("level3");

// ======================
// FONCTION DE FILTRAGE
// ======================

function filterProducts() {
    let visibleCount = 0;

    items.forEach(item => {
    const itemCollection = item.dataset.collection || null;
      const l1 = item.dataset.level1;
      const l2 = item.dataset.level2;
      const l3 = item.dataset.level3;

    // --- filtre collection (prioritaire)
    if (activeCollection) {
      const isVisible = itemCollection === activeCollection;
      item.style.display = isVisible ? "block" : "none";
      if (isVisible) visibleCount++;
      return;
    }

    // --- filtres classiques
    const match1 = l1 === level1;
    const match2 = level2 === null || l2 === level2;
    const match3 = level3 === null || l3 === level3;

    const isVisible = match1 && match2 && match3;
    item.style.display = isVisible ? "block" : "none";
    if (isVisible) visibleCount++;
  });

  // Afficher/masquer le message "aucun résultat"
  const emptyState = document.getElementById("emptyState");
  if (emptyState) {
    emptyState.style.display = visibleCount === 0 ? "block" : "none";
  }
}

// ======================
// FILTRE COLLECTION (EXCLUSIF)
// ======================

collectionSpans.forEach(span => {
    span.addEventListener("click", () => {

    // reset catégories
    level1 = null;
    level2 = null;
    level3 = null;

    level1Spans.forEach(s => s.classList.remove("active"));
    level2Spans.forEach(s => s.classList.remove("active"));
    level3Spans.forEach(s => s.classList.remove("active"));

    level2Block?.classList.remove("open");
    level3Block?.classList.remove("open");

    // activer collection
    collectionSpans.forEach(s => s.classList.remove("active"));
      span.classList.add("active");

      activeCollection = span.dataset.collection;

      filterProducts();
    });
  });

// ======================
// FILTRE LEVEL 1
// ======================

level1Spans.forEach(span => {
    span.addEventListener("click", () => {

    // désactiver collection
    activeCollection = null;
    collectionSpans.forEach(s => s.classList.remove("active"));

    // activer level1
    level1Spans.forEach(s => s.classList.remove("active"));
      span.classList.add("active");

      level1 = span.dataset.level1;
      level2 = null;
      level3 = null;

    level2Spans.forEach(s => s.classList.remove("active"));
    level3Spans.forEach(s => s.classList.remove("active"));

    // Afficher level2 et level3 SEULEMENT pour "vestiaire"
    if (level1 === "vestiaire") {
      level2Block?.classList.add("open");
      level3Block?.classList.remove("open");
    } else {
      level2Block?.classList.remove("open");
      level3Block?.classList.remove("open");
    }

      filterProducts();
    });
  });

// ======================
// FILTRE LEVEL 2
// ======================

level2Spans.forEach(span => {
    span.addEventListener("click", () => {

    // Vérifier si level2 est ouvert
    if (!level2Block?.classList.contains("open")) {
      return;
    }

    // si déjà actif → désélection
      if (span.classList.contains("active")) {
        span.classList.remove("active");
        level2 = null;
        level3Block?.classList.remove("open");
      } else {
      level2Spans.forEach(s => s.classList.remove("active"));
        span.classList.add("active");
        level2 = span.dataset.level2;
        level3Block?.classList.add("open");
      }

      level3 = null;
      level3Spans.forEach(s => s.classList.remove("active"));

      filterProducts();
    });
  });


// ======================
// FILTRE LEVEL 3
// ======================

level3Spans.forEach(span => {
    span.addEventListener("click", () => {

    // Vérifier si level3 est ouvert
    if (!level3Block?.classList.contains("open")) {
      return;
    }

    // si déjà actif → désélection
      if (span.classList.contains("active")) {
        span.classList.remove("active");
        level3 = null;
      } else {
      level3Spans.forEach(s => s.classList.remove("active"));
        span.classList.add("active");
        level3 = span.dataset.level3;
      }

      filterProducts();
    });
  });


// ======================
// INITIALISATION
// ======================

  filterProducts();




// ======================
// PANIER — AFFICHAGE
// ======================

function renderCart() {
  const cartContainer = document.getElementById("cartItems");
  const cartTotal = document.getElementById("cartTotal");

  if (!cartContainer || !cartTotal) return;

  cartContainer.innerHTML = "";
  let total = 0;

  cart.forEach((item, index) => {
    total += item.price;

    const div = document.createElement("div");
    div.className = "cart-item";
    div.innerHTML = `
      <p>${item.name}</p>
      <p>${item.size || item.format}</p>
      <p>${formatEUR(item.price)}</p>
      <button onclick="removeItem(${index})">Supprimer</button>
    `;

    cartContainer.appendChild(div);
  });

  cartTotal.textContent = formatEUR(total);
}

function removeItem(index) {
  cart.splice(index, 1);
  saveCart();
  updateCartCount();
  renderCart();
}

renderCart();


// ======================
  // LOOKBOOK — LIGHTBOX
// ======================

let looks = document.querySelectorAll(".lookbook-grid .look");
let currentLook = 0;

  const lightbox = document.getElementById("lightbox");
const lightboxImg = document.getElementById("lightbox-img");
const lbCounter = document.getElementById("lbCounter");

function openLightbox(img) {
  currentLook = [...looks].indexOf(img);
  updateLightbox();
      lightbox.style.display = "flex";
}

function closeLightbox() {
      lightbox.style.display = "none";
}

function updateLightbox() {
  lightboxImg.src = looks[currentLook].src;
  lbCounter.textContent =
    String(currentLook + 1).padStart(2, "0") +
    " / " +
    String(looks.length).padStart(2, "0");
}

function nextLook(e) {
      e?.stopPropagation();
  currentLook = (currentLook + 1) % looks.length;
  updateLightbox();
}

function prevLook(e) {
      e?.stopPropagation();
  currentLook = (currentLook - 1 + looks.length) % looks.length;
  updateLightbox();
}


// ======================
// PARFUM — FORMAT + STOCK
// ======================

let selectedParfumFormat = null;
let selectedParfumPrice = null;

function selectFormat(el) {
  if (el.classList.contains("disabled")) return;

  document.querySelectorAll(".parfum-sizes .size").forEach(s => s.classList.remove("selected"));
  el.classList.add("selected");

  selectedParfumFormat = el.dataset.format;
  selectedParfumPrice = Number(el.dataset.price);

  const priceEl = document.getElementById("parfumPrice");
  if (priceEl) priceEl.textContent = formatEUR(selectedParfumPrice);
}

function addPerfumeToCart() {
  if (!selectedParfumFormat) {
    alert("Veuillez sélectionner un format.");
    return;
  }

  const selectedEl = document.querySelector(".parfum-sizes .size.selected");

  const product = {
    name: "La Chambre du Sixième Étage",
    format: selectedParfumFormat,
    price: selectedParfumPrice
  };

  cart.push(product);
  saveCart();
  updateCartCount();

  alert("Parfum ajouté au panier");
}



// ======================
// TAILLES DÉSACTIVÉES
// ======================

  document.querySelectorAll(".size").forEach(size => {
  const stock = Number(size.dataset.stock);

  if (stock === 0) {
      size.classList.add("disabled");
    }
  });


// ======================
  // ACCORDÉONS
// ======================

function toggleAccordion(btn) {
  const item = btn.parentElement;
  item.classList.toggle("open");
}

// ======================
// STOCK PARFUM — DISABLED
// ======================

document.querySelectorAll(".parfum-sizes .size").forEach(size => {
  const stock = Number(size.dataset.stock);

  if (stock === 0) {
    size.classList.add("disabled");
  }
});

document.addEventListener("DOMContentLoaded", () => {
  const toggle = document.querySelector(".menu-toggle");
  const menu = document.querySelector(".menu-mobile");

  if (!toggle || !menu) return;

  toggle.addEventListener("click", () => {
    menu.classList.toggle("is-open");
  });
});
/* ===============================
   LOGIQUE FILTRES HIÉRARCHIQUES
=============================== */

/* Niveau 1 → active niveau 2 */
document.querySelectorAll('#level1 span').forEach(span => {
  span.addEventListener('click', () => {
    document.getElementById('level1').classList.add('has-selection');

    // reset niveaux inférieurs
    document.getElementById('level2').classList.remove('has-selection');
    document.getElementById('level3').classList.remove('has-selection');
  });
});

/* Niveau 2 → active niveau 3 */
document.querySelectorAll('#level2 span').forEach(span => {
  span.addEventListener('click', () => {
    document.getElementById('level2').classList.add('has-selection');

    // reset niveau 3
    document.getElementById('level3').classList.remove('has-selection');
  });
});

/* Niveau 3 → juste sélection */
document.querySelectorAll('#level3 span').forEach(span => {
  span.addEventListener('click', () => {
    document.getElementById('level3').classList.add('has-selection');
  });
});
