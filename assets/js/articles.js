// Liste complète des articles
const articles = [
  {
    id: "qui-est-simone-sixx",
    title: "Qui est Simone Sixx",
    date: "3 février 2026",
    image: "simone.jpg",
    images: ["simone.jpg"],
    excerpt: "Jeune créateur français, indépendant et anticapitaliste, il élabore un univers où l'esthétique est utilisée comme un moyen de contestation...",
    content: `<p><em>Simone,</em></p>

    <p>
      Jeune créateur français, indépendant et anticapitaliste, il
      élabore un univers où l'esthétique est utilisée comme un moyen de
      contestation, en s'opposant aux pratiques et diktats sociétaux.
    </p>

    <p>
      Il conçoit ses collections à partir de matériaux écologiques,
      respectueux de l'environnement et issus du savoir-faire français,
      adoptant une approche éthique et solidaire.
    </p>

    <p>
      Chaque pièce qu'il crée met en valeur l'artisanat, réinsérant la
      mode dans une relation assumée tout en lui apportant une dimension
      profondément humaine.
    </p>

    <p>
      Une partie de ses bénéfices est allouée à des œuvres caritatives,
      tout en contribuant à la croissance de sa marque. Cela garantit un
      impact social et assure la durabilité de son projet créatif.
    </p>

    <p>
      À travers ses créations, il propose une vision alternative : une
      mode engagée, une critique du système et un vecteur de changement
      collectif.
    </p>`
  },
  {
    id: "lookbook-pe26",
    title: "Lookbook Printemps & Été 2026",
    date: "4 septembre 2025",
    image: "lookbook.jpg",
    images: ["lookbook.jpg", "look2.jpg"],
    excerpt: "Présentation privée à l'atelier Simone Sixx. Pièces suspendues, silhouettes portées, matières à nu...",
    content: `<p>Présentation privée à l'atelier Simone Sixx.</p>
    
    <p>Pièces suspendues, silhouettes portées, matières à nu. Une lecture lente de la collection SS26.</p>`
  },
  {
    id: "premieres-matieres",
    title: "Premières matières",
    date: "18 août 2025",
    image: "matieres.jpg",
    images: ["matieres.jpg", "look3.jpg"],
    excerpt: "Réception des premiers cuirs et tissus. Odeur de poussière, de colle, de bois. Les pièces commencent à exister...",
    content: `<p>Réception des premiers cuirs et tissus.</p>
    
    <p>Odeur de poussière, de colle, de bois. Les pièces commencent à exister...</p>`
  }
];

// Fonction pour récupérer un article par ID
function getArticleById(id) {
  return articles.find(article => article.id === id);
}

// Fonction pour récupérer l'ID depuis l'URL
function getArticleIdFromURL() {
  const params = new URLSearchParams(window.location.search);
  return params.get('id') || 'qui-est-simone-sixx'; // Par défaut le premier article
}
