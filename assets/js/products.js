// Liste complète des produits


const products = [
  {
    id: "perfecto-en-cuir-noir",
    name: "Perfecto en cuir noir",
    price: 310,
    image: "produit.jpg",
    images: ["produit.jpg", "look2.jpg", "look3.jpg"],
    description: "Perfecto fait de cuir légèrement usé, zips argentés et boutons métalliques. Coupe ajustée, épaules légèrement accentuées, col rabattu. Des nuances sombres dans le cuir qui captent la lumière.",
    sizes: [
      { label: "Une", stock: 0 },
      { label: "Deux", stock: 3 },
      { label: "Trois", stock: 5 },
      { label: "Quatre", stock: 0 },
      { label: "Cinq", stock: 1 }
    ],
    mannequin: {
      height: "1m78",
      size: "Trois"
    },
    sizeGuide: [
      { size: "Une", poitrine: "86–91", taille: "71–76", hanches: "86–91" },
      { size: "Deux", poitrine: "91–96", taille: "76–81", hanches: "91–96" },
      { size: "Trois", poitrine: "96–101", taille: "81–86", hanches: "101–106" },
      { size: "Quatre", poitrine: "101–106", taille: "86–91", hanches: "106–111" },
      { size: "Cinq", poitrine: "106–111", taille: "91–96", hanches: "111–116" }
    ]
  },
  {
    id: "chemise-soie-noir",
    name: "Chemise soie noir",
    price: 250,
    image: "look2.jpg",
    images: ["look2.jpg", "produit.jpg"],
    description: "Chemise en soie pure, fluide et élégante. Manches longues, col classique et boutons noirs. Idéale pour créer des looks sophistiqués et intemporels.",
    sizes: [
      { label: "Une", stock: 2 },
      { label: "Deux", stock: 4 },
      { label: "Trois", stock: 3 },
      { label: "Quatre", stock: 2 },
      { label: "Cinq", stock: 1 }
    ],
    mannequin: {
      height: "1m79",
      size: "Trois"
    },
    sizeGuide: [
      { size: "Une", poitrine: "84–89", taille: "69–74", hanches: "84–89" },
      { size: "Deux", poitrine: "89–94", taille: "74–79", hanches: "89–94" },
      { size: "Trois", poitrine: "94–99", taille: "79–84", hanches: "99–104" },
      { size: "Quatre", poitrine: "99–104", taille: "84–89", hanches: "104–109" },
      { size: "Cinq", poitrine: "104–109", taille: "89–94", hanches: "109–114" }
    ]
  },
  {
    id: "manteau-long-homme",
    name: "Manteau long homme",
    price: 420,
    image: "produit3.jpg",
    images: ["produit3.jpg", "look3.jpg"],
    description: "Manteau long structuré en laine premium. Coupe droite et intemporelle avec détails soignés. Parfait pour les saisons froides.",
    sizes: [
      { label: "Une", stock: 1 },
      { label: "Deux", stock: 2 },
      { label: "Trois", stock: 3 },
      { label: "Quatre", stock: 2 },
      { label: "Cinq", stock: 1 }
    ],
    mannequin: {
      height: "1m78",
      size: "Trois"
    },
    sizeGuide: [
      { size: "Une", poitrine: "88–93", taille: "73–78", hanches: "88–93" },
      { size: "Deux", poitrine: "93–98", taille: "78–83", hanches: "93–98" },
      { size: "Trois", poitrine: "98–103", taille: "83–88", hanches: "103–108" },
      { size: "Quatre", poitrine: "103–108", taille: "88–93", hanches: "108–113" },
      { size: "Cinq", poitrine: "108–113", taille: "93–98", hanches: "113–118" }
    ]
  },
  {
    id: "robe-fluide",
    name: "Robe fluide",
    price: 340,
    image: "produit4.jpg",
    images: ["produit4.jpg", "look4.jpg"],
    description: "Robe en tissu fluide et léger. Coupe ajustée à la taille avec une jupe qui flotte. Élégante et confortable pour toutes les occasions.",
    sizes: [
      { label: "Une", stock: 2 },
      { label: "Deux", stock: 3 },
      { label: "Trois", stock: 4 },
      { label: "Quatre", stock: 1 },
      { label: "Cinq", stock: 0 }
    ],
    mannequin: {
      height: "1m78",
      size: "Trois"
    },
    sizeGuide: [
      { size: "Une", poitrine: "82–87", taille: "67–72", hanches: "82–87" },
      { size: "Deux", poitrine: "87–92", taille: "72–77", hanches: "87–92" },
      { size: "Trois", poitrine: "92–97", taille: "77–82", hanches: "97–102" },
      { size: "Quatre", poitrine: "97–102", taille: "82–87", hanches: "102–107" },
      { size: "Cinq", poitrine: "102–107", taille: "87–92", hanches: "107–112" }
    ]
  },
  {
    id: "haut-soie",
    name: "Haut en soie",
    price: 210,
    image: "produit5.jpg",
    images: ["produit5.jpg", "look5.jpg"],
    description: "Haut délicat en soie douce. Manches courtes et col rond. Parfait pour les looks minimalistes et raffinés.",
    sizes: [
      { label: "Une", stock: 3 },
      { label: "Deux", stock: 5 },
      { label: "Trois", stock: 4 },
      { label: "Quatre", stock: 3 },
      { label: "Cinq", stock: 2 }
    ],
    mannequin: {
      height: "1m78",
      size: "Trois"
    },
    sizeGuide: [
      { size: "Une", poitrine: "80–85", taille: "65–70", hanches: "80–85" },
      { size: "Deux", poitrine: "85–90", taille: "70–75", hanches: "85–90" },
      { size: "Trois", poitrine: "90–95", taille: "75–80", hanches: "95–100" },
      { size: "Quatre", poitrine: "95–100", taille: "80–85", hanches: "100–105" },
      { size: "Cinq", poitrine: "100–105", taille: "85–90", hanches: "105–110" }
    ]
  },
  {
    id: "veste-structuree",
    name: "Veste structurée",
    price: 360,
    image: "produit6.jpg",
    images: ["produit6.jpg", "look6.jpg"],
    description: "Veste structurée avec lignes épurées. Coupe ajustée et finitions impeccables. Un basique incontournable.",
    sizes: [
      { label: "Une", stock: 1 },
      { label: "Deux", stock: 2 },
      { label: "Trois", stock: 3 },
      { label: "Quatre", stock: 2 },
      { label: "Cinq", stock: 1 }
    ],
    mannequin: {
      height: "1m78",
      size: "Trois"
    },
    sizeGuide: [
      { size: "Une", poitrine: "86–91", taille: "71–76", hanches: "86–91" },
      { size: "Deux", poitrine: "91–96", taille: "76–81", hanches: "91–96" },
      { size: "Trois", poitrine: "96–101", taille: "81–86", hanches: "101–106" },
      { size: "Quatre", poitrine: "101–106", taille: "86–91", hanches: "106–111" },
      { size: "Cinq", poitrine: "106–111", taille: "91–96", hanches: "111–116" }
    ]
  }
];

// Fonction pour récupérer un produit par ID
function getProductById(id) {
  return products.find(product => product.id === id);
}

// Fonction pour récupérer l'ID depuis l'URL
function getProductIdFromURL() {
  const params = new URLSearchParams(window.location.search);
  return params.get('id') || 'perfecto-cuir-noir'; // Par défaut le premier produit
}
