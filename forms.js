/* Enhances the native POST forms with in-page status messages. Without
 * JavaScript, the same forms navigate to a safe response page on the Worker. */
(function () {
  var API_BASE = "https://fha-forms.fisher-hill.workers.dev"; // FHA forms Worker (Cloudflare)

  function wire(formId, route, statusId, successMsg) {
    var f = document.getElementById(formId);
    if (!f) return;
    var status = document.getElementById(statusId);
    f.addEventListener("submit", function (e) {
      e.preventDefault();
      if (f.website && f.website.value) { f.reset(); return; } // honeypot
      if (!f.checkValidity()) { f.reportValidity(); return; }
      var btn = f.querySelector("button[type=submit]");
      var data = {};
      new FormData(f).forEach(function (v, k) { if (k !== "website") data[k] = v; });
      // Rollout bridge: the previous Worker reads `phone`; the current Worker
      // reads `publicContact`. Send both until the Worker rollout is complete.
      if (route === "/post" && typeof data.publicContact === "string") data.phone = data.publicContact;

      function show(ok, msg) {
        if (status) { status.hidden = false; status.textContent = msg; status.style.color = ok ? "" : "#c0392b"; }
        if (ok) f.reset();
        if (btn) btn.disabled = false;
      }

      if (btn) btn.disabled = true;
      if (status) { status.hidden = false; status.style.color = ""; status.textContent = "Sending…"; }
      fetch(API_BASE + route, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data)
      })
        .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { return { ok: r.ok, j: j }; }); })
        .then(function (res) { show(res.ok, res.ok ? successMsg : (res.j.error || "Sorry — something went wrong. Please try again.")); })
        .catch(function () { show(false, "Sorry — couldn't reach the server. Please try again."); });
    });
  }

  wire("contact-form", "/contact", "cf-status", "Thanks — your message has been sent. The board will be in touch.");
  wire("post-form", "/post", "pf-status", "Thanks — your post was submitted for review. If it fits the guidelines, it will appear on the board.");
  wire("join-form", "/join", "jf-status", "Thanks — your membership request has been received. A board member will verify your Fisher Hill connection and follow up with payment details.");
})();
