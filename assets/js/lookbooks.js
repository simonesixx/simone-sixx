// Liste complète des lookbooks
const lookbooks = [
  {
    id: "ss26",
    title: "Printemps & Été 2026",
    season: "Première Collection",
    images: [
      "look1.jpg",
      "look2.jpg",
      "look3.jpg",
      "look4.jpg",
      "look5.jpg",
      "look6.jpg"
    ]
  },
  {
    id: "aw26",
    title: "Automne & Hiver 2026",
    season: "Première Collection",
    images: [
      "look3.jpg",
      "look4.jpg",
      "look5.jpg",
      "look6.jpg",
      "look1.jpg",
      "look2.jpg"
    ]
  }
];

// Fonction pour récupérer un lookbook par ID
function getLookbookById(id) {
  return lookbooks.find(lookbook => lookbook.id === id);
}

// Fonction pour récupérer l'ID depuis l'URL
function getLookbookIdFromURL() {
  const params = new URLSearchParams(window.location.search);
  return params.get('id') || 'ss26'; // Par défaut le premier lookbook
}
