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
// LIVRAISON (ESTIMATION PANIER)
// ======================

// Free shipping threshold (products subtotal) in cents.
const SIMONE_FREE_SHIPPING_THRESHOLD_CENTS = 9000;

function updateFreeShippingNote() {
  const el = document.getElementById("freeShippingNote");
  if (!el) return;
  const threshold = formatEUR(centsToEuros(SIMONE_FREE_SHIPPING_THRESHOLD_CENTS));
  el.textContent = `Livraison offerte dès ${threshold}.`;
}

// Public rates (not secrets). Keep in sync with your server-side shipping brackets.
// Amounts are in cents.
const SIMONE_MR_RATES = [
  { max_weight_grams: 250, amount_cents: 342 },
  { max_weight_grams: 500, amount_cents: 342 },
  { max_weight_grams: 1000, amount_cents: 376 },
  { max_weight_grams: 2000, amount_cents: 527 },
  { max_weight_grams: 3000, amount_cents: 559 },
  { max_weight_grams: 4000, amount_cents: 559 },
  { max_weight_grams: 5000, amount_cents: 1113 },
  { max_weight_grams: 7000, amount_cents: 1113 },
  { max_weight_grams: 10000, amount_cents: 1113 },
  { max_weight_grams: 15000, amount_cents: 1747 },
  { max_weight_grams: 20000, amount_cents: 1747 },
  { max_weight_grams: 25000, amount_cents: 1747 },
  { max_weight_grams: 30000, amount_cents: 1999 },
];

// Home delivery rates (France). Amounts are in cents.
// Source: your "À DOMICILE" table (France), € HT/colis avant remise.
const SIMONE_HOME_RATES = [
  { max_weight_grams: 250, amount_cents: 441 },
  { max_weight_grams: 500, amount_cents: 624 },
  { max_weight_grams: 1000, amount_cents: 790 },
  { max_weight_grams: 2000, amount_cents: 913 },
  { max_weight_grams: 3000, amount_cents: 1362 },
  { max_weight_grams: 4000, amount_cents: 1362 },
  { max_weight_grams: 5000, amount_cents: 1362 },
  { max_weight_grams: 7000, amount_cents: 2083 },
  { max_weight_grams: 10000, amount_cents: 2083 },
  { max_weight_grams: 15000, amount_cents: 2624 },
  { max_weight_grams: 20000, amount_cents: 3583 },
  { max_weight_grams: 25000, amount_cents: 3583 },
];

// Packed weights (grams) used for display estimation.
const SIMONE_WEIGHTS_BY_PRICE_ID = {
  "price_1T4LB60XZVE1puxSTKgblJPz": 120, // 30 ml
  "price_1T4Vko0XZVE1puxSJUSVeBjD": 140, // 50 ml
};

const SIMONE_LEGACY_PRICE_ID_MAP = new Map([
  // Live → Test (si un ancien panier a été créé en live)
  ["price_1T4Ypg1pW7akGXOM8wnRfRar", "price_1T4LB60XZVE1puxSTKgblJPz"], // 30 ml
  ["price_1T4Yph1pW7akGXOM9qTPSGtH", "price_1T4Vko0XZVE1puxSJUSVeBjD"], // 50 ml
]);

function eurosToCents(value) {
  const n = typeof value === "number" ? value : Number(String(value || "").replace(",", "."));
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}

function centsToEuros(cents) {
  const n = typeof cents === "number" ? cents : Number(cents);
  if (!Number.isFinite(n)) return 0;
  return n / 100;
}

function getSelectedShippingMethod() {
  const el = document.querySelector('input[name="shippingMethod"]:checked');
  const v = el && typeof el.value === "string" ? String(el.value || "").trim() : "home";
  return (v === "mondial_relay" || v === "home") ? v : "home";
}

function getPriceIdFromCartItem(item) {
  if (!item || typeof item !== "object") return null;
  let priceId = item.stripePriceId || item.priceId || null;
  if (priceId && SIMONE_LEGACY_PRICE_ID_MAP.has(priceId)) {
    priceId = SIMONE_LEGACY_PRICE_ID_MAP.get(priceId);
  }

  // Compat: si un ancien panier / une ancienne page n'a pas l'attribut `stripePriceId`
  if (!priceId) {
    const name = String(item.name || "").toLowerCase();
    const format = String(item.format || item.size || "").toLowerCase().trim();
    if (name.includes("la chambre du sixième étage") || name.includes("la chambre du sixieme etage")) {
      if (format === "30 ml" || format === "30ml") return "price_1T4LB60XZVE1puxSTKgblJPz";
      if (format === "50 ml" || format === "50ml") return "price_1T4Vko0XZVE1puxSJUSVeBjD";
    }
  }

  return typeof priceId === "string" && priceId.trim() ? priceId.trim() : null;
}

function computeCartWeightGrams(cart) {
  if (!Array.isArray(cart) || cart.length === 0) return 0;
  let total = 0;
  for (const item of cart) {
    const priceId = getPriceIdFromCartItem(item);
    if (!priceId) continue;
    const w = SIMONE_WEIGHTS_BY_PRICE_ID[priceId];
    if (typeof w === "number" && Number.isFinite(w) && w > 0) total += w;
  }
  return total;
}

function computeShippingCentsFromRates(weightGrams, rates) {
  const w = Math.max(0, Number(weightGrams) || 0);
  const normalized = Array.isArray(rates) ? rates
    .map(r => ({
      max: (r && r.max_weight_grams != null) ? Number(r.max_weight_grams) : null,
      amount: (r && r.amount_cents != null) ? Number(r.amount_cents) : null,
    }))
    .filter(r => Number.isFinite(r.amount) && r.amount >= 0)
    : [];

  normalized.sort((a, b) => {
    const am = a.max;
    const bm = b.max;
    if (am == null && bm == null) return 0;
    if (am == null) return 1;
    if (bm == null) return -1;
    return am - bm;
  });

  for (const r of normalized) {
    if (r.max == null) continue;
    if (w <= r.max) return Math.round(r.amount);
  }
  const open = normalized.find(r => r.max == null);
  if (open) return Math.round(open.amount);
  if (normalized.length > 0) return Math.round(normalized[normalized.length - 1].amount);
  return 0;
}

function updateCartTotalsDisplay(cart, subtotalCents) {
  const subtotalEl = document.getElementById("cartSubtotal");
  const shippingEl = document.getElementById("cartShipping");
  const totalEl = document.getElementById("cartTotal");
  if (!totalEl) return;

  const method = getSelectedShippingMethod();
  const weightGrams = computeCartWeightGrams(cart);
  const rawShippingCents = method === "mondial_relay"
    ? computeShippingCentsFromRates(weightGrams, SIMONE_MR_RATES)
    : computeShippingCentsFromRates(weightGrams, SIMONE_HOME_RATES);

  const subtotal = Math.max(0, Number(subtotalCents) || 0);
  const shippingCents = subtotal >= SIMONE_FREE_SHIPPING_THRESHOLD_CENTS ? 0 : rawShippingCents;

  const totalCents = Math.max(0, subtotal + shippingCents);

  if (subtotalEl) subtotalEl.textContent = formatEUR(centsToEuros(subtotal));
  if (shippingEl) shippingEl.textContent = formatEUR(centsToEuros(shippingCents));
  totalEl.textContent = formatEUR(centsToEuros(totalCents));

  updateFreeShippingNote();
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
  let subtotalCents = 0;

  cart.forEach((item, index) => {
    subtotalCents += eurosToCents(item && typeof item === "object" ? item.price : 0);

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

  // Total includes estimated shipping (Mondial Relay only). Stripe remains authoritative.
  updateCartTotalsDisplay(cart, subtotalCents);
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

  const cartSubtotalCents = Array.isArray(cart)
    ? cart.reduce((sum, item) => sum + eurosToCents(item && typeof item === "object" ? item.price : 0), 0)
    : 0;

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

  const shippingMethodEl = document.querySelector('input[name="shippingMethod"]:checked');
  const shippingMethod = shippingMethodEl && typeof shippingMethodEl.value === "string" ? String(shippingMethodEl.value || "").trim() : "home";

  const mrRelayNameInput = document.getElementById("mrRelayName");
  const mrRelayAddressInput = document.getElementById("mrRelayAddress");
  const mrRelayPostalInput = document.getElementById("mrRelayPostal");
  const mrRelayCityInput = document.getElementById("mrRelayCity");
  const mrRelayIdInput = document.getElementById("mrRelayId");

  const mrRelay = {
    id: mrRelayIdInput && typeof mrRelayIdInput.value === "string" ? mrRelayIdInput.value.trim() : "",
    name: mrRelayNameInput && typeof mrRelayNameInput.value === "string" ? mrRelayNameInput.value.trim() : "",
    address: mrRelayAddressInput && typeof mrRelayAddressInput.value === "string" ? mrRelayAddressInput.value.trim() : "",
    postal_code: mrRelayPostalInput && typeof mrRelayPostalInput.value === "string" ? mrRelayPostalInput.value.trim() : "",
    city: mrRelayCityInput && typeof mrRelayCityInput.value === "string" ? mrRelayCityInput.value.trim() : "",
    country: "FR"
  };

  try {
    if (emailInput) localStorage.setItem("checkout_email", email);
    if (nameInput) localStorage.setItem("checkout_name", fullName);
    if (phoneInput) localStorage.setItem("checkout_phone", phone);
    if (address1Input) localStorage.setItem("checkout_address1", address1);
    if (address2Input) localStorage.setItem("checkout_address2", address2);
    if (postalInput) localStorage.setItem("checkout_postal", postal);
    if (cityInput) localStorage.setItem("checkout_city", city);
    localStorage.setItem("checkout_shipping_method", shippingMethod);
    if (shippingMethod === "mondial_relay") {
      localStorage.setItem("mr_relay", JSON.stringify(mrRelay));
    }
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

  if (shippingMethod === "mondial_relay") {
    if (!mrRelay.name) {
      alert("Merci d’indiquer le nom du Point Relais.");
      if (btn) {
        btn.disabled = false;
        if (originalLabel != null) btn.textContent = originalLabel;
      }
      if (mrRelayNameInput) mrRelayNameInput.focus();
      return;
    }
    if (!mrRelay.address) {
      alert("Merci d’indiquer l’adresse du Point Relais.");
      if (btn) {
        btn.disabled = false;
        if (originalLabel != null) btn.textContent = originalLabel;
      }
      if (mrRelayAddressInput) mrRelayAddressInput.focus();
      return;
    }
    if (!mrRelay.postal_code) {
      alert("Merci d’indiquer le code postal du Point Relais.");
      if (btn) {
        btn.disabled = false;
        if (originalLabel != null) btn.textContent = originalLabel;
      }
      if (mrRelayPostalInput) mrRelayPostalInput.focus();
      return;
    }
    if (!mrRelay.city) {
      alert("Merci d’indiquer la ville du Point Relais.");
      if (btn) {
        btn.disabled = false;
        if (originalLabel != null) btn.textContent = originalLabel;
      }
      if (mrRelayCityInput) mrRelayCityInput.focus();
      return;
    }
  }

  // On attend des items avec `stripePriceId` (Price ID Stripe) pour chaque ligne.
  // Ex: price_123...
  const legacyPriceIdMap = SIMONE_LEGACY_PRICE_ID_MAP;

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
          priceId = "price_1T4LB60XZVE1puxSTKgblJPz";
        } else if (format === "50 ml" || format === "50ml") {
          priceId = "price_1T4Vko0XZVE1puxSJUSVeBjD";
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
        cart_subtotal_cents: cartSubtotalCents,
        customer_phone: phone || undefined,
        customer_email: email || undefined,
        customer_name: fullName || undefined,
        shipping_method: shippingMethod,
        mondial_relay: shippingMethod === "mondial_relay" ? mrRelay : undefined,
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

// Mondial Relay UI (panier uniquement)
(function setupMondialRelayCartUI() {
  try {
    const methodInputs = Array.from(document.querySelectorAll('input[name="shippingMethod"]'));
    if (methodInputs.length === 0) return;

    const mrBox = document.getElementById("mrRelayBox");
    if (!mrBox) return;

    function getCheckedMethod() {
      const el = document.querySelector('input[name="shippingMethod"]:checked');
      return el && typeof el.value === "string" ? String(el.value || "home") : "home";
    }

    function setMrRequired(isRequired) {
      ["mrRelayName", "mrRelayAddress", "mrRelayPostal", "mrRelayCity"].forEach((id) => {
        const input = document.getElementById(id);
        if (input) input.required = !!isRequired;
      });
    }

    function toggleMr() {
      const method = getCheckedMethod();
      const show = method === "mondial_relay";
      mrBox.hidden = !show;
      setMrRequired(show);

      if (show) {
        const cp = document.getElementById("checkoutPostal");
        const city = document.getElementById("checkoutCity");
        const mrCp = document.getElementById("mrRelayPostal");
        const mrCity = document.getElementById("mrRelayCity");
        if (mrCp && !String(mrCp.value || "").trim() && cp) mrCp.value = String(cp.value || "");
        if (mrCity && !String(mrCity.value || "").trim() && city) mrCity.value = String(city.value || "");

        initMondialRelayWidget();
      }
    }

    let mrWidgetInitialized = false;

    function setMrField(id, value) {
      const input = document.getElementById(id);
      if (!input) return;
      try {
        input.value = value != null ? String(value) : "";
      } catch {
        // ignore
      }
    }

    function initMondialRelayWidget() {
      if (mrWidgetInitialized) return;

      const zone = document.getElementById("mrWidgetZone");
      if (!zone) return;

      const brand = zone.getAttribute("data-mr-brand") || "";
      const colLivMod = zone.getAttribute("data-mr-collivmod") || "24R";

      if (!brand || !String(brand).trim()) {
        zone.innerHTML = "<p style=\"font-size:11px; letter-spacing:0.6px; opacity:0.6; line-height:1.45;\">Mondial Relay n’est pas configuré (code Enseigne manquant).</p>";
        return;
      }

      // Wait until jQuery + plugin are available.
      const $ = window.jQuery;
      if (!$ || !$.fn || typeof $.fn.MR_ParcelShopPicker !== "function") {
        setTimeout(initMondialRelayWidget, 150);
        return;
      }

      const cp = document.getElementById("checkoutPostal");
      const city = document.getElementById("checkoutCity");
      const postal = cp && typeof cp.value === "string" ? cp.value.trim() : "";
      const cityVal = city && typeof city.value === "string" ? city.value.trim() : "";

      try {
        $(zone).MR_ParcelShopPicker({
          Target: "#mrRelayId",
          Brand: String(brand).trim(),
          Country: "FR",
          AllowedCountries: "FR",
          PostCode: postal || undefined,
          City: cityVal || undefined,
          ColLivMod: String(colLivMod || "24R").trim(),
          NbResults: 7,
          Responsive: true,
          ShowResultsOnMap: true,
          Weight: 1000,
          OnParcelShopSelected: function (data) {
            // Widget payload is FR-labelled: ID, Nom, Adresse1/2, CP, Ville, Pays...
            try {
              const id = data && data.ID != null ? String(data.ID) : "";
              const name = data && data.Nom != null ? String(data.Nom) : "";
              const a1 = data && data.Adresse1 != null ? String(data.Adresse1) : "";
              const a2 = data && data.Adresse2 != null ? String(data.Adresse2) : "";
              const addr = (a1 + (a2 ? (" " + a2) : "")).trim();
              const relayCp = data && data.CP != null ? String(data.CP) : "";
              const relayCity = data && data.Ville != null ? String(data.Ville) : "";

              setMrField("mrRelayId", id);
              setMrField("mrRelayName", name);
              setMrField("mrRelayAddress", addr);
              setMrField("mrRelayPostal", relayCp);
              setMrField("mrRelayCity", relayCity);

              try {
                localStorage.setItem("mr_relay", JSON.stringify({
                  id,
                  name,
                  address: addr,
                  postal_code: relayCp,
                  city: relayCity,
                  country: "FR"
                }));
              } catch {
                // ignore
              }
            } catch {
              // ignore
            }
          }
        });

        mrWidgetInitialized = true;
      } catch {
        // ignore
      }
    }

    // Restore saved shipping method
    try {
      const savedMethod = localStorage.getItem("checkout_shipping_method");
      if (savedMethod === "mondial_relay" || savedMethod === "home") {
        const radio = document.querySelector('input[name="shippingMethod"][value="' + savedMethod + '"]');
        if (radio) radio.checked = true;
      }
    } catch {
      // ignore
    }

    // Restore relay fields
    try {
      const raw = localStorage.getItem("mr_relay");
      const data = raw ? JSON.parse(raw) : null;
      if (data && typeof data === "object") {
        const map = {
          mrRelayId: data.id,
          mrRelayName: data.name,
          mrRelayAddress: data.address,
          mrRelayPostal: data.postal_code,
          mrRelayCity: data.city,
        };
        Object.entries(map).forEach(([id, val]) => {
          const input = document.getElementById(id);
          if (input && val != null && !String(input.value || "").trim()) {
            input.value = String(val);
          }
        });
      }
    } catch {
      // ignore
    }

    methodInputs.forEach((input) => input.addEventListener("change", () => {
      try {
        localStorage.setItem("checkout_shipping_method", getCheckedMethod());
      } catch {
        // ignore
      }
      toggleMr();
      try {
        const cart = loadCart();
        let subtotalCents = 0;
        for (const item of cart) subtotalCents += eurosToCents(item && typeof item === "object" ? item.price : 0);
        updateCartTotalsDisplay(cart, subtotalCents);
      } catch {
        // ignore
      }
    }));

    // Re-init / refresh search when postal/city changes.
    ["checkoutPostal", "checkoutCity"].forEach((id) => {
      const input = document.getElementById(id);
      if (!input) return;
      input.addEventListener("change", () => {
        if (getCheckedMethod() !== "mondial_relay") return;
        // If already initialized, we keep it; user can search directly in widget.
        initMondialRelayWidget();
      });
    });

    toggleMr();
  } catch {
    // ignore
  }
})();

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
