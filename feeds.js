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

    // A post with a photo (lost pets, mostly) leads with the picture and the
    // title; the rest tucks behind a tap. The card keeps its place in the grid.
    if (p.image) {
      card.className += " feed-card-photo";
      var ph = el("div", "feed-photo");
      var im = el("img", null, null);
      im.src = p.image; im.alt = p.title || "Posted photo"; im.loading = "lazy";
      ph.appendChild(im);
      body.appendChild(ph);
      body.appendChild(el("h3", "feed-title", p.title));
      var more = el("div", "feed-more");
      var pd0 = dateLabel(p); if (pd0) more.appendChild(el("p", "feed-date", pd0));
      more.appendChild(meta(p.time, p.location));
      if (p.summary) more.appendChild(el("p", "feed-summary", p.summary));
      if (p.source) {
        var act0 = el("div", "feed-actions");
        act0.appendChild(el("span", "feed-source", "Posted by " + p.source));
        more.appendChild(act0);
      }
      body.appendChild(more);
      var hint = el("p", "feed-expand-hint", "Details");
      body.appendChild(hint);
      card.tabIndex = 0;
      card.setAttribute("role", "button");
      card.setAttribute("aria-expanded", "false");
      function toggle() {
        var open = card.classList.toggle("open");
        card.setAttribute("aria-expanded", open ? "true" : "false");
      }
      card.addEventListener("click", toggle);
      card.addEventListener("keydown", function (ev) {
        if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); toggle(); }
      });
    } else {
      body.appendChild(el("h3", "feed-title", p.title));
      var pd = dateLabel(p); if (pd) body.appendChild(el("p", "feed-date", pd));
      body.appendChild(meta(p.time, p.location));
      if (p.summary) body.appendChild(el("p", "feed-summary", p.summary));
      if (p.source) {
        var actions = el("div", "feed-actions");
        actions.appendChild(el("span", "feed-source", "Posted by " + p.source));
        body.appendChild(actions);
      }
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
