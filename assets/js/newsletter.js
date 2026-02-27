document.addEventListener("DOMContentLoaded", () => {

  // ======================
  // ÉLÉMENTS DOM
  // ======================
  const popup = document.getElementById("newsletterPopup");
  const form  = document.getElementById("newsletterForm");

  if (!popup || !form) return;

  const input   = form.querySelector('input[type="email"]');
  const success = popup.querySelector(".newsletter-success");
  const exists  = popup.querySelector(".newsletter-exists");

  // ======================
  // RESET VISUEL INITIAL (IMPORTANT)
  // ======================
  if (success) success.hidden = true;
  if (exists)  exists.hidden  = true;

  // ======================
  // STOCKAGE LOCAL
  // ======================
  const KEY = "simoneNewsletter";

  function endpointUrl() {
    try {
      return new URL("server/newsletter-subscribe.php", document.baseURI).toString();
    } catch (_) {
      return "server/newsletter-subscribe.php";
    }
  }

  function getEmails() {
    return JSON.parse(localStorage.getItem(KEY)) || [];
  }

  function saveEmails(list) {
    localStorage.setItem(KEY, JSON.stringify(list));
  }

  // ======================
  // OUVERTURE POPUP
  // ======================
  document
    .querySelectorAll('.nav-newsletter, a[href="#journal"]')
    .forEach(link => {
      link.addEventListener("click", e => {
        e.preventDefault();

        // reset propre à chaque ouverture
        if (success) success.hidden = true;
        if (exists)  exists.hidden  = true;
        if (input)   input.value    = "";

        popup.classList.add("open");
      });
    });

  // ======================
  // FERMETURE POPUP
  // ======================
  window.closeNewsletter = () => {
    popup.classList.remove("open");
  };

  // ======================
  // INSCRIPTION
  // ======================
  form.addEventListener("submit", async e => {
    e.preventDefault();

    if (!input) return;

    const email = input.value.trim().toLowerCase();
    if (!email) return;

    // reset messages
    if (success) success.hidden = true;
    if (exists)  exists.hidden  = true;

    // 1) Essai serveur (si dispo)
    try {
      const res = await fetch(endpointUrl(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          source: window.location && window.location.pathname ? window.location.pathname : null,
        }),
      });

      if (res.status === 409) {
        if (exists) exists.hidden = false;
        return;
      }

      if (res.ok) {
        if (success) success.hidden = false;
        input.value = "";
        return;
      }
      // Sinon on tente le fallback local.
    } catch (_) {
      // Serveur indispo (ou hébergement statique) → fallback local.
    }

    // 2) Fallback localStorage (mode statique/offline)
    const emails = getEmails();
    if (emails.includes(email)) {
      if (exists) exists.hidden = false;
      return;
    }

    emails.push(email);
    saveEmails(emails);
    if (success) success.hidden = false;
    input.value = "";
  });

});
