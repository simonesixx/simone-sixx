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

function loadCart() {
  try {
    const raw = localStorage.getItem("cart");
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveCart(cart) {
  localStorage.setItem("cart", JSON.stringify(Array.isArray(cart) ? cart : []));
}

function updateCartCount() {
  const cart = loadCart();
  document.querySelectorAll("#cartCount").forEach(el => {
    el.textContent = cart.length;
  });

  // certains templates utilisent une classe plutôt qu'un id
  document.querySelectorAll(".cartCount").forEach(el => {
    el.textContent = cart.length;
  });
}


updateCartCount();


// ======================
// FILTRES — ÉTAT GLOBAL
// ======================

let activeCollection = null; // ex: "ss26"
let level1 = null;
let level2 = null;
let level3 = null;

// Tant que l'utilisateur n'a pas cliqué sur un filtre,
// on affiche tout le catalogue (évite de "cacher" des produits au chargement).
let hasUserFiltered = false;

// ======================
// ÉLÉMENTS DOM
// ======================

function getItems() {
  return document.querySelectorAll(".item");
}

const collectionSpans = document.querySelectorAll("#collectionLevel span");
const level1Spans = document.querySelectorAll("#level1 span");
const level2Spans = document.querySelectorAll("#level2 span");
const level3Spans = document.querySelectorAll("#level3 span");

const level2Block = document.getElementById("level2");
const level3Block = document.getElementById("level3");

function initFiltersFromDOM() {
  const activeCollectionSpan = document.querySelector("#collectionLevel span.active");
  activeCollection = activeCollectionSpan?.dataset?.collection || null;

  const activeLevel1Span = document.querySelector("#level1 span.active");
  level1 = activeLevel1Span?.dataset?.level1 || null;

  const activeLevel2Span = document.querySelector("#level2 span.active");
  level2 = activeLevel2Span?.dataset?.level2 || null;

  const activeLevel3Span = document.querySelector("#level3 span.active");
  level3 = activeLevel3Span?.dataset?.level3 || null;

  if (level1 === "vestiaire") {
    level2Block?.classList.add("open");
    if (level2) {
      level3Block?.classList.add("open");
    } else {
      level3Block?.classList.remove("open");
    }
  } else {
    level2Block?.classList.remove("open");
    level3Block?.classList.remove("open");
  }
}

// ======================
// FONCTION DE FILTRAGE
// ======================

function filterProducts() {
    let visibleCount = 0;

  const items = getItems();

  // Comportement par défaut : tout afficher tant que l'utilisateur n'a pas filtré
  // (et qu'on n'est pas en mode filtre collection).
  if (!hasUserFiltered && !activeCollection) {
    items.forEach(item => {
      item.style.display = "block";
      visibleCount++;
    });

    const emptyState = document.getElementById("emptyState");
    if (emptyState) emptyState.style.display = visibleCount === 0 ? "block" : "none";
    return;
  }

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
    const l2Tokens = (l2 || "").split(/\s+/).filter(Boolean);
    const match2 = level2 === null || level2 === "" || l2Tokens.includes(level2);
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

  hasUserFiltered = true;

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

  hasUserFiltered = true;

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

  hasUserFiltered = true;

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

  hasUserFiltered = true;

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

initFiltersFromDOM();
filterProducts();




// ======================
// PANIER — AFFICHAGE
// ======================

function renderCart() {
  const cartContainer = document.getElementById("cartItems");
  const cartTotal = document.getElementById("cartTotal");

  if (!cartContainer || !cartTotal) return;

  const cart = loadCart();

  cartContainer.innerHTML = "";
  let total = 0;

  cart.forEach((item, index) => {
    total += item.price;

    const div = document.createElement("div");
    div.className = "cart-item";
    div.innerHTML = `
      <p class="cart-item-name">${item.name}</p>
      <p class="cart-item-format">${item.size || item.format || ""}</p>
      <p class="cart-item-price">${formatEUR(item.price)}</p>
      <button type="button" onclick="removeItem(${index})">Supprimer</button>
    `;

    cartContainer.appendChild(div);
  });

  cartTotal.textContent = formatEUR(total);
}

function removeItem(index) {
  const cart = loadCart();
  cart.splice(index, 1);
  saveCart(cart);
  updateCartCount();
  renderCart();
}

// ======================
// CHECKOUT (STRIPE)
// ======================

async function checkout(buttonEl) {
  const btn =
    (buttonEl && typeof buttonEl === "object" && "disabled" in buttonEl)
      ? buttonEl
      : (document.activeElement && document.activeElement.tagName === "BUTTON")
        ? document.activeElement
        : document.querySelector(".cart-footer .add-to-cart");

  const originalLabel = btn && typeof btn.textContent === "string" ? btn.textContent : null;
  if (btn) {
    btn.disabled = true;
    btn.textContent = "Chargement…";
  }

  const cart = loadCart();

  const emailInput = document.getElementById("checkoutEmail");
  const nameInput = document.getElementById("checkoutName");
  const phoneInput = document.getElementById("checkoutPhone");
  const address1Input = document.getElementById("checkoutAddress1");
  const address2Input = document.getElementById("checkoutAddress2");
  const postalInput = document.getElementById("checkoutPostal");
  const cityInput = document.getElementById("checkoutCity");

  const email = emailInput && typeof emailInput.value === "string" ? emailInput.value.trim() : "";
  const fullName = nameInput && typeof nameInput.value === "string" ? nameInput.value.trim() : "";
  const phone = phoneInput && typeof phoneInput.value === "string" ? phoneInput.value.trim() : "";
  const address1 = address1Input && typeof address1Input.value === "string" ? address1Input.value.trim() : "";
  const address2 = address2Input && typeof address2Input.value === "string" ? address2Input.value.trim() : "";
  const postal = postalInput && typeof postalInput.value === "string" ? postalInput.value.trim() : "";
  const city = cityInput && typeof cityInput.value === "string" ? cityInput.value.trim() : "";

  try {
    if (emailInput) localStorage.setItem("checkout_email", email);
    if (nameInput) localStorage.setItem("checkout_name", fullName);
    if (phoneInput) localStorage.setItem("checkout_phone", phone);
    if (address1Input) localStorage.setItem("checkout_address1", address1);
    if (address2Input) localStorage.setItem("checkout_address2", address2);
    if (postalInput) localStorage.setItem("checkout_postal", postal);
    if (cityInput) localStorage.setItem("checkout_city", city);
  } catch {
    // ignore
  }

  if (!Array.isArray(cart) || cart.length === 0) {
    alert("Votre panier est vide.");
    if (btn) {
      btn.disabled = false;
      if (originalLabel != null) btn.textContent = originalLabel;
    }
    return;
  }

  if (emailInput && !email) {
    alert("Merci d’indiquer un e-mail.");
    if (btn) {
      btn.disabled = false;
      if (originalLabel != null) btn.textContent = originalLabel;
    }
    emailInput.focus();
    return;
  }
  if (nameInput && !fullName) {
    alert("Merci d’indiquer votre nom.");
    if (btn) {
      btn.disabled = false;
      if (originalLabel != null) btn.textContent = originalLabel;
    }
    nameInput.focus();
    return;
  }
  if (phoneInput && !phone) {
    alert("Merci d’indiquer un téléphone.");
    if (btn) {
      btn.disabled = false;
      if (originalLabel != null) btn.textContent = originalLabel;
    }
    phoneInput.focus();
    return;
  }
  if (address1Input && !address1) {
    alert("Merci d’indiquer votre adresse.");
    if (btn) {
      btn.disabled = false;
      if (originalLabel != null) btn.textContent = originalLabel;
    }
    address1Input.focus();
    return;
  }
  if (postalInput && !postal) {
    alert("Merci d’indiquer votre code postal.");
    if (btn) {
      btn.disabled = false;
      if (originalLabel != null) btn.textContent = originalLabel;
    }
    postalInput.focus();
    return;
  }
  if (cityInput && !city) {
    alert("Merci d’indiquer votre ville.");
    if (btn) {
      btn.disabled = false;
      if (originalLabel != null) btn.textContent = originalLabel;
    }
    cityInput.focus();
    return;
  }

  // On attend des items avec `stripePriceId` (Price ID Stripe) pour chaque ligne.
  // Ex: price_123...
  const legacyPriceIdMap = new Map([
    // Anciennes valeurs (test) → nouvelles valeurs (test)
    ["price_1T4LB60XZVE1puxSTKgblJPz", "price_1T4Ypg1pW7akGXOM8wnRfRar"], // 30 ml
    ["price_1T4Vko0XZVE1puxSJUSVeBjD", "price_1T4Yph1pW7akGXOM9qTPSGtH"]  // 50 ml
  ]);

  const countsByPriceId = new Map();
  for (const item of cart) {
    let priceId = item && typeof item === "object" ? (item.stripePriceId || item.priceId) : null;

    // Si un ancien panier contient un Price ID obsolète, on le traduit.
    if (priceId && legacyPriceIdMap.has(priceId)) {
      priceId = legacyPriceIdMap.get(priceId);
    }

    // Compat: si un ancien panier / une ancienne page n'a pas l'attribut `data-stripe-price-id`
    // on déduit l'ID Stripe du parfum via son format.
    if (!priceId && item && typeof item === "object") {
      const name = String(item.name || "").toLowerCase();
      const format = String(item.format || item.size || "").toLowerCase().trim();

      if (name.includes("la chambre du sixième étage") || name.includes("la chambre du sixieme etage")) {
        if (format === "30 ml" || format === "30ml") {
          priceId = "price_1T4Ypg1pW7akGXOM8wnRfRar";
        } else if (format === "50 ml" || format === "50ml") {
          priceId = "price_1T4Yph1pW7akGXOM9qTPSGtH";
        }
      }
    }

    if (!priceId) {
      alert("Paiement non configuré : il manque l’ID Stripe (price_...) pour un article du panier.");
      if (btn) {
        btn.disabled = false;
        if (originalLabel != null) btn.textContent = originalLabel;
      }
      return;
    }
    countsByPriceId.set(priceId, (countsByPriceId.get(priceId) || 0) + 1);
  }

  const items = Array.from(countsByPriceId.entries()).map(([price, quantity]) => ({
    price,
    quantity
  }));

  try {
    const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    // Give the server a bit more time to respond with a useful error.
    const timeoutId = controller ? setTimeout(() => controller.abort(), 30000) : null;

    const res = await fetch("/server/checkout.php", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        items,
        customer_phone: phone || undefined,
        customer_email: email || undefined,
        customer_name: fullName || undefined,
        shipping: {
          name: fullName,
          address: {
            line1: address1,
            line2: address2 || undefined,
            postal_code: postal,
            city: city,
            country: "FR"
          }
        }
      }),
      signal: controller ? controller.signal : undefined
    });

    if (timeoutId) clearTimeout(timeoutId);

    let data = {};
    let text = "";
    try {
      text = await res.text();
      data = text ? (JSON.parse(text) || {}) : {};
    } catch {
      data = {};
    }
    if (!res.ok) {
      const serverMsg = data && data.error ? String(data.error) : "";
      const snippet = !serverMsg && text ? String(text).slice(0, 160) : "";
      const detail = serverMsg || snippet;
      throw new Error(detail ? `Erreur paiement (${res.status}) : ${detail}` : `Erreur lors de la création du paiement (${res.status}).`);
    }

    if (!data || !data.url) {
      throw new Error("Réponse invalide du serveur de paiement.");
    }

    window.location.assign(data.url);
  } catch (e) {
    const msg = e && e.name === "AbortError"
      ? "Le serveur de paiement ne répond pas (timeout). Réessaie dans quelques secondes."
      : (e && e.message ? e.message : "Erreur de paiement.");
    alert(msg);

    if (btn) {
      btn.disabled = false;
      if (originalLabel != null) btn.textContent = originalLabel;
    }
  }
}

// Expose pour les boutons HTML (onclick)
window.checkout = checkout;

// Prefill checkout inputs (if present)
try {
  const emailInput = document.getElementById("checkoutEmail");
  const nameInput = document.getElementById("checkoutName");
  const phoneInput = document.getElementById("checkoutPhone");
  const address1Input = document.getElementById("checkoutAddress1");
  const address2Input = document.getElementById("checkoutAddress2");
  const postalInput = document.getElementById("checkoutPostal");
  const cityInput = document.getElementById("checkoutCity");

  if (emailInput && !emailInput.value) {
    const saved = localStorage.getItem("checkout_email");
    if (saved) emailInput.value = saved;
  }
  if (nameInput && !nameInput.value) {
    const saved = localStorage.getItem("checkout_name");
    if (saved) nameInput.value = saved;
  }
  if (phoneInput && !phoneInput.value) {
    const saved = localStorage.getItem("checkout_phone");
    if (saved) phoneInput.value = saved;
  }
  if (address1Input && !address1Input.value) {
    const saved = localStorage.getItem("checkout_address1");
    if (saved) address1Input.value = saved;
  }
  if (address2Input && !address2Input.value) {
    const saved = localStorage.getItem("checkout_address2");
    if (saved) address2Input.value = saved;
  }
  if (postalInput && !postalInput.value) {
    const saved = localStorage.getItem("checkout_postal");
    if (saved) postalInput.value = saved;
  }
  if (cityInput && !cityInput.value) {
    const saved = localStorage.getItem("checkout_city");
    if (saved) cityInput.value = saved;
  }
} catch {
  // ignore
}

// Retour de Stripe (success/cancel)
try {
  const params = new URLSearchParams(window.location.search);
  if (params.get("success") === "1") {
    saveCart([]);
    updateCartCount();
    renderCart();
    // message simple (peut être remplacé par un bandeau UI plus tard)
    alert("Paiement confirmé. Merci !");
  } else if (params.get("canceled") === "1") {
    // Paiement annulé/abandonné
    // On ne vide pas le panier.
  }
} catch {
  // ignore
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
let selectedParfumStripePriceId = null;

function renderParfumPrice(currentPrice, originalPrice = null) {
  const priceEl = document.getElementById("parfumPrice");
  if (!priceEl) return;

  const oldEl = document.getElementById("parfumPriceOld");
  const newEl = document.getElementById("parfumPriceNew");

  const hasOriginal = Number.isFinite(originalPrice) && Number.isFinite(currentPrice) && originalPrice > currentPrice;

  if (oldEl && newEl) {
    if (hasOriginal) {
      oldEl.hidden = false;
      oldEl.textContent = formatEUR(originalPrice);
      newEl.textContent = formatEUR(currentPrice);
    } else {
      oldEl.hidden = true;
      newEl.textContent = Number.isFinite(currentPrice) ? formatEUR(currentPrice) : "";
    }
    return;
  }

  // Fallback si la page n'a pas les spans (compat)
  priceEl.textContent = Number.isFinite(currentPrice) ? formatEUR(currentPrice) : "";
}

function selectFormat(el) {
  if (el.classList.contains("disabled")) return;

  document.querySelectorAll(".parfum-sizes .size").forEach(s => s.classList.remove("selected"));
  el.classList.add("selected");

  selectedParfumFormat = el.dataset.format;
  selectedParfumPrice = Number(el.dataset.price);
  selectedParfumStripePriceId = el.dataset.stripePriceId || null;

  const originalPrice = el.dataset.originalPrice != null ? Number(el.dataset.originalPrice) : null;
  renderParfumPrice(selectedParfumPrice, originalPrice);
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
    price: selectedParfumPrice,
    stripePriceId: selectedParfumStripePriceId || null
  };

  const cart = loadCart();
  cart.push(product);
  saveCart(cart);
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

  // Parfum: initialiser le format déjà marqué "selected" (sinon "Ajouter au panier" demande de sélectionner)
  const preselectedParfumFormat = document.querySelector(".parfum-sizes .size.selected");
  if (preselectedParfumFormat) {
    selectFormat(preselectedParfumFormat);
  }
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
