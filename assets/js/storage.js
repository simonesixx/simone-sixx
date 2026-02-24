(function () {
  const PRODUCTS_KEY = "products";
  const ARTICLES_KEY = "articles";
  const LOOKBOOKS_KEY = "lookbooks";

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

  function loadArticles() {
    if (!storage) return [];
    try {
      return JSON.parse(storage.getItem(ARTICLES_KEY)) || [];
    } catch {
      return [];
    }
  }

  function loadLookbooks() {
    if (!storage) return [];
    try {
      return JSON.parse(storage.getItem(LOOKBOOKS_KEY)) || [];
    } catch {
      return [];
    }
  }

  function saveProducts(products) {
    if (!storage) return;
    storage.setItem(PRODUCTS_KEY, JSON.stringify(products || []));
  }

  function saveArticles(articles) {
    if (!storage) return;
    storage.setItem(ARTICLES_KEY, JSON.stringify(articles || []));
  }

  function saveLookbooks(lookbooks) {
    if (!storage) return;
    storage.setItem(LOOKBOOKS_KEY, JSON.stringify(lookbooks || []));
  }

  function seedFromGlobalProducts() {
    // Les fichiers publiés (assets/data/*.json) sont la source de vérité.
    // On n'initialise donc plus automatiquement le stockage local à partir
    // d'une liste embarquée (products.js), pour éviter les incohérences.
    return;
  }

  function seedFromArray(key, items) {
    if (!storage) return;
    const existing = key === ARTICLES_KEY
      ? loadArticles()
      : (key === LOOKBOOKS_KEY ? loadLookbooks() : loadProducts());
    if (existing.length > 0) return;
    if (Array.isArray(items) && items.length > 0) {
      storage.setItem(key, JSON.stringify(items));
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

  window.ArticleStore = {
    loadArticles,
    saveArticles,
    seedFromArray(articles) {
      seedFromArray(ARTICLES_KEY, articles);
    },
    get storageAvailable() {
      return !!storage;
    },
    get storageType() {
      if (!storage) return "none";
      return storage === window.localStorage ? "localStorage" : "sessionStorage";
    }
  };

  window.LookbookStore = {
    loadLookbooks,
    saveLookbooks,
    seedFromArray(lookbooks) {
      seedFromArray(LOOKBOOKS_KEY, lookbooks);
    },
    get storageAvailable() {
      return !!storage;
    },
    get storageType() {
      if (!storage) return "none";
      return storage === window.localStorage ? "localStorage" : "sessionStorage";
    }
  };
})();
