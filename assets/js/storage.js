(function () {
  const PRODUCTS_KEY = "products";

  function getSafeStorage() {
    try {
      const test = "__storage_test__";
      window.localStorage.setItem(test, test);
      window.localStorage.removeItem(test);
      return window.localStorage;
    } catch (e) {
      try {
        const test = "__storage_test__";
        window.sessionStorage.setItem(test, test);
        window.sessionStorage.removeItem(test);
        return window.sessionStorage;
      } catch (e2) {
        return null;
      }
    }
  }

  const storage = getSafeStorage();

  function loadProducts() {
    if (!storage) return [];
    try {
      return JSON.parse(storage.getItem(PRODUCTS_KEY)) || [];
    } catch {
      return [];
    }
  }

  function saveProducts(products) {
    if (!storage) return;
    storage.setItem(PRODUCTS_KEY, JSON.stringify(products || []));
  }

  function seedFromGlobalProducts() {
    const existing = loadProducts();
    if (existing.length > 0) return;

    if (Array.isArray(window.products) && window.products.length > 0) {
      saveProducts(window.products);
    }
  }

  window.ProductStore = {
    seedFromGlobalProducts,
    loadProducts,
    saveProducts,
    get storageAvailable() {
      return !!storage;
    },
    get storageType() {
      if (!storage) return "none";
      return storage === window.localStorage ? "localStorage" : "sessionStorage";
    }
  };
})();
