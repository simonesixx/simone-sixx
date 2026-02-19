document.addEventListener("DOMContentLoaded", () => {
  window.ProductStore?.seedFromGlobalProducts();

  const grid = document.querySelector(".grid");
  if (!grid) return;

  let products = window.ProductStore?.loadProducts?.() || [];
  if (products.length === 0 && Array.isArray(window.products)) {
    products = window.products;
  }

  grid.innerHTML = "";

  products.forEach(product => {
    const link = document.createElement("a");
    link.href = `produit.html?id=${encodeURIComponent(product.id)}`;
    link.className = "item";

    if (product.collection) link.dataset.collection = product.collection;
    if (product.level1) link.dataset.level1 = product.level1;
    if (product.level2) {
      link.dataset.level2 = Array.isArray(product.level2) ? product.level2.join(" ") : product.level2;
    }
    if (product.level3) link.dataset.level3 = product.level3;

    link.innerHTML = `
      <img src="${product.image}" alt="${product.name}">
      <p>${product.name}</p>
      <span>${Number(product.price).toFixed(2).replace(".", ",")} EUR</span>
    `;

    grid.appendChild(link);
  });

  // Rejouer le filtrage après injection
  if (typeof window.filterProducts === "function") {
    window.filterProducts();
  }
});
