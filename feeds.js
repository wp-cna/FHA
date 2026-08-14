/* Renders the Events and Neighborhood Posts feeds as CNA-style cards.
   Looks for #events-feed (optional data-limit) and #posts-feed on the page. */
(function () {
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function meta(time, location) {
    var m = el("div", "feed-meta");
    if (time) m.appendChild(el("span", null, time));
    if (location) m.appendChild(el("span", null, location));
    return m;
  }
  function lang() { try { return localStorage.getItem("fha-lang") || "en"; } catch (e) { return "en"; } }
  var MES = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];
  var MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  function isIsoDate(s) { return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s); }
  function dateLabel(it) {
    if (lang() === "es" && isIsoDate(it.date)) {
      var p = it.date.split("-");
      return parseInt(p[2], 10) + " de " + MES[parseInt(p[1], 10) - 1] + " de " + p[0];
    }
    if (it.dateLabel) return it.dateLabel;
    // No hand-written label (e.g. left blank in the admin) — build one from the date.
    if (isIsoDate(it.date)) {
      var q = it.date.split("-");
      return MONTHS[parseInt(q[1], 10) - 1] + " " + parseInt(q[2], 10) + ", " + q[0];
    }
    return "";
  }
  function afterRender() { if (window.fhaApplyI18n) window.fhaApplyI18n(); }

  // Convert only the three contact types accepted by the Worker. Unknown or
  // old malformed data stays hidden instead of becoming an unsafe link.
  function contactLink(value) {
    var contact = String(value || "").trim();
    if (!contact || contact.length > 254) return null;

    if (/^[^\s@/?#]+@[^\s@/?#]+\.[^\s@/?#]+$/.test(contact)) {
      return { href: "mailto:" + contact, external: false };
    }

    var phone = contact.match(/^(\+?[\d\s().-]+?)(?:\s*(?:x|ext\.?)\s*(\d{1,8}))?$/i);
    if (phone) {
      var digits = phone[1].replace(/\D/g, "");
      if (digits.length >= 7 && digits.length <= 15) {
        var number = (phone[1].trim().charAt(0) === "+" ? "+" : "") + digits;
        return { href: "tel:" + number + (phone[2] ? ";ext=" + phone[2] : ""), external: false };
      }
    }

    try {
      var hasScheme = /^[a-z][a-z0-9+.-]*:/i.test(contact);
      var url = new URL(hasScheme ? contact : "https://" + contact);
      if (url.protocol === "https:" && url.hostname && !url.username && !url.password &&
          (url.hostname.indexOf(".") !== -1 || /^\d{1,3}(?:\.\d{1,3}){3}$/.test(url.hostname))) {
        return { href: url.href, external: true };
      }
    } catch (error) {}
    return null;
  }

  function appendPublicContact(body, value) {
    var link = contactLink(value);
    if (!link) return;
    var row = el("p", "feed-contact");
    row.appendChild(el("strong", null, "Contact: "));
    var anchor = el("a", null, String(value).trim());
    anchor.href = link.href;
    if (link.external) {
      anchor.target = "_blank";
      anchor.rel = "external noopener noreferrer";
    }
    row.appendChild(anchor);
    body.appendChild(row);
  }

  // Board freshness: posts expire by category so the board never becomes a billboard.
  // Mirrors the TTLs the Worker stamps; also covers older posts that have no "expires".
  var POST_TTL = { "Lost & Found": 7, "Tag Sale": 7, "Neighbor": 7, "Business": 90,
                   "Neighborhood Event": 2, "Volunteer": 5 };  // curated FHA event posts drop after they pass
  var DEFAULT_TTL = 14;
  function todayStr() { var t = new Date(); return t.getFullYear() + "-" + String(t.getMonth() + 1).padStart(2, "0") + "-" + String(t.getDate()).padStart(2, "0"); }
  function addDays(iso, n) { var d = new Date(iso + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
  function postExpiry(p) {
    var ttl = POST_TTL[p.category] != null ? POST_TTL[p.category] : DEFAULT_TTL;
    var end = p.expires || addDays(p.date || todayStr(), ttl);   // expires is stamped by the Worker
    // Safety net: a post must never drop off the board before the day it is
    // about, however stale its "expires" is (e.g. the date was edited later).
    if (isIsoDate(p.date)) {
      var floor = addDays(p.date, 1);
      if (floor > end) end = floor;
    }
    return end;
  }

  function eventCard(e) {
    var card = el("article", "feed-card");
    var body = el("div", "feed-body");
    var top = el("div", "feed-top");
    if (e.category) top.appendChild(el("span", "feed-tag", e.category));
    body.appendChild(top);
    body.appendChild(el("h3", "feed-title", e.title));
    var ed = dateLabel(e); if (ed) body.appendChild(el("p", "feed-date", ed));
    body.appendChild(meta(e.time, e.location));
    var esum = (lang() === "es" && e.summary_es) ? e.summary_es : e.summary;
    if (esum) body.appendChild(el("p", "feed-summary", esum));
    var actions = el("div", "feed-actions");
    if (e.url) {
      var a = el("a", "feed-btn", e.ctaLabel || "Details");
      a.href = e.url; a.target = "_blank"; a.rel = "external noopener";
      actions.appendChild(a);
    } else if (e.source) {
      actions.appendChild(el("span", "feed-source", e.source));
    }
    body.appendChild(actions);
    card.appendChild(body);
    return card;
  }

  function postCard(p) {
    var card = el("article", "feed-card" + (p.fh ? " feed-card-fh" : ""));
    var body = el("div", "feed-body");
    var top = el("div", "feed-top");
    if (p.fh) top.appendChild(el("span", "feed-tag feed-tag-fh", "Fisher Hill"));
    if (p.category) top.appendChild(el("span", "feed-tag", p.category));
    body.appendChild(top);
    body.appendChild(el("h3", "feed-title", p.title));
    var pd = dateLabel(p); if (pd) body.appendChild(el("p", "feed-date", pd));
    body.appendChild(meta(p.time, p.location));
    if (p.summary) body.appendChild(el("p", "feed-summary", p.summary));
    appendPublicContact(body, p.publicContact || p.phone);
    if (p.source) {
      var actions = el("div", "feed-actions");
      actions.appendChild(el("span", "feed-source", "Posted by " + p.source));
      body.appendChild(actions);
    }
    card.appendChild(body);
    return card;
  }

  function render(container, items, builder) {
    container.innerHTML = "";
    var grid = el("div", "feed-grid");
    items.forEach(function (it) { grid.appendChild(builder(it)); });
    container.appendChild(grid);
  }

  var evBox = document.getElementById("events-feed");
  if (evBox) {
    fetch("data/events.json").then(function (r) { return r.json(); }).then(function (d) {
      var t = new Date();
      var today = t.getFullYear() + "-" + String(t.getMonth() + 1).padStart(2, "0") + "-" + String(t.getDate()).padStart(2, "0");
      var items = (d.events || [])
        .filter(function (e) { return (e.date || "9999-99-99") >= today; })   // drop past events automatically
        .sort(function (a, b) { return (a.date || "").localeCompare(b.date || ""); });
      var lim = parseInt(evBox.getAttribute("data-limit"), 10);
      if (lim > 0) items = items.slice(0, lim);
      if (!items.length) { evBox.innerHTML = '<p class="feed-empty">No upcoming events right now — check back soon.</p>'; afterRender(); return; }
      render(evBox, items, eventCard);
      afterRender();
    }).catch(function () { evBox.innerHTML = '<p class="feed-empty">Events are unavailable right now.</p>'; });
  }

  var postBox = document.getElementById("posts-feed");
  if (postBox) {
    fetch("data/posts.json").then(function (r) { return r.json(); }).then(function (d) {
      var today = todayStr();
      var items = (d.posts || [])
        .filter(function (p) { return postExpiry(p) >= today; })            // drop expired posts
        .sort(function (a, b) { return (b.date || "").localeCompare(a.date || ""); });  // newest first
      if (!items.length) { postBox.innerHTML = '<p class="feed-empty">No neighborhood posts right now — check back soon.</p>'; afterRender(); return; }
      render(postBox, items, postCard);
      afterRender();
    }).catch(function () { postBox.innerHTML = '<p class="feed-empty">Posts are unavailable right now.</p>'; });
  }
})();
