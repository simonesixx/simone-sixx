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
  form.addEventListener("submit", e => {
    e.preventDefault();

    if (!input) return;

    const email = input.value.trim().toLowerCase();
    if (!email) return;

    // reset messages
    if (success) success.hidden = true;
    if (exists)  exists.hidden  = true;

    const emails = getEmails();

    // email déjà inscrit
    if (emails.includes(email)) {
      if (exists) exists.hidden = false;
      return;
    }

    // nouvel email
    emails.push(email);
    saveEmails(emails);

    if (success) success.hidden = false;
    input.value = "";
  });

});
