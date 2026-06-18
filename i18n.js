/* English / Spanish toggle for the FHA site.
   Injects a switch into the sidebar, persists the choice, and translates the
   whole page (static copy + dynamically-rendered feed cards) by walking text
   nodes against a dictionary. Re-runnable via window.fhaApplyI18n(). */
(function () {
  var ES = {
    // Navigation + hero labels
    "Neighborhood Posts": "Publicaciones del Vecindario",
    "Events": "Eventos",
    "Agendas": "Agendas",
    "About": "Acerca de",
    "Join the FHA": "Únase a la FHA",
    "Contact": "Contacto",
    "Home": "Inicio",
    "A neighborhood association.": "Una asociación de vecinos.",
    // Map hint
    "3D fly-through": "Recorrido 3D",
    "— drag to explore the neighborhood": "— arrastre para explorar el vecindario",
    // Kickers
    "Welcome": "Bienvenidos",
    "Credits": "Créditos",
    // Home
    "A historic White Plains neighborhood, organized.": "Un barrio histórico de White Plains, organizado.",
    "Fisher Hill sits within walking distance of downtown White Plains — bounded by the Bronx River Parkway to the west and Post Road to the east, with the hospital, library, train station, and City Center just beyond. The Association keeps neighbors connected and informed.": "Fisher Hill está a poca distancia a pie del centro de White Plains, delimitado por el Bronx River Parkway al oeste y Post Road al este, con el hospital, la biblioteca, la estación de tren y el City Center justo al lado. La Asociación mantiene a los vecinos conectados e informados.",
    "What's on the agenda": "Qué hay en la agenda",
    "News & notices from the block.": "Noticias y avisos del vecindario.",
    "Meetings, cleanups, gatherings.": "Reuniones, limpiezas y encuentros.",
    "City & CNA items affecting Fisher Hill.": "Asuntos de la ciudad y la CNA que afectan a Fisher Hill.",
    "The neighborhood & the board.": "El vecindario y la directiva.",
    "Events around White Plains": "Eventos en White Plains",
    "See all events →": "Ver todos los eventos →",
    // Posts
    "From around Fisher Hill.": "Desde Fisher Hill.",
    "Updates serving Fisher Hill and White Plains — neighborhood events, civic notices, and volunteer opportunities. Every posting is reviewed before it appears.": "Novedades para Fisher Hill y White Plains: eventos del vecindario, avisos cívicos y oportunidades de voluntariado. Cada publicación se revisa antes de aparecer.",
    // Events
    "What's coming up.": "Próximamente.",
    "Association meetings, neighborhood cleanups, and events across White Plains. WPCNA meets monthly — typically the second Tuesday at 7:00 p.m.": "Reuniones de la Asociación, limpiezas del vecindario y eventos por todo White Plains. La WPCNA se reúne cada mes, generalmente el segundo martes a las 7:00 p.m.",
    // Agendas
    "Meeting agendas & minutes.": "Agendas y actas de reuniones.",
    "Agendas and minutes from Fisher Hill Association meetings.": "Agendas y actas de las reuniones de la Asociación de Fisher Hill.",
    "Fisher Hill in recent WPCNA minutes.": "Fisher Hill en las actas recientes de la WPCNA.",
    "Items touching Fisher Hill or its boundary streets, found automatically in": "Asuntos que afectan a Fisher Hill o sus calles limítrofes, encontrados automáticamente en",
    "WPCNA meeting minutes": "las actas de la WPCNA",
    ". Updated as new minutes are posted.": ". Se actualiza a medida que se publican nuevas actas.",
    "FHA Annual Meeting 2025": "Reunión Anual de la FHA 2025",
    "FHA Board Meeting April 2026": "Reunión de la Junta de la FHA, abril de 2026",
    "FHA Board Meeting Nov 2025": "Reunión de la Junta de la FHA, nov. de 2025",
    "FHA Board Meeting Aug 2025": "Reunión de la Junta de la FHA, ago. de 2025",
    "FHA Annual Meeting 2024": "Reunión Anual de la FHA 2024",
    "Read the minutes →": "Leer las actas →",
    // About
    "Fisher Hill is a historic neighborhood within walking distance of the central business district of White Plains, New York. Residential development began around 1900, and many of the large vintage homes from that era still define the neighborhood's character today. Fisher Hill is notably diverse in ethnicity, age, and income.": "Fisher Hill es un barrio histórico a poca distancia a pie del centro comercial de White Plains, Nueva York. El desarrollo residencial comenzó alrededor de 1900, y muchas de las grandes casas antiguas de esa época aún definen el carácter del vecindario. Fisher Hill destaca por su diversidad de origen, edad e ingresos.",
    "The neighborhood is bounded by the Bronx River Parkway to the west and Post Road to the east, with White Plains Hospital, the public library, the Metro-North station, and City Center all just beyond its edges. The Fisher Hill Association represents residents within the White Plains Council of Neighborhood Associations (WPCNA).": "El vecindario está delimitado por el Bronx River Parkway al oeste y Post Road al este, con el Hospital de White Plains, la biblioteca pública, la estación Metro-North y el City Center justo al lado. La Asociación de Fisher Hill representa a los residentes dentro del Consejo de Asociaciones de Vecinos de White Plains (WPCNA).",
    "Association officers": "Directiva de la Asociación",
    "— President": "— Presidente",
    "— Vice President": "— Vicepresidenta",
    "— Treasurer": "— Tesorera",
    "To reach the board, use the": "Para comunicarse con la directiva, use el",
    "contact form": "formulario de contacto",
    "Loading recent mentions…": "Cargando menciones recientes…",
    "— photo by": "— foto de",
    // Join
    "Become a member.": "Hágase miembro.",
    "Membership keeps the Association running and gives you a voice in what happens around the neighborhood. Dues are modest and support events and advocacy on behalf of Fisher Hill.": "La membresía mantiene en marcha a la Asociación y le da voz en lo que sucede en el vecindario. Las cuotas son modestas y apoyan los eventos y la representación en nombre de Fisher Hill.",
    "Members receive neighborhood updates, a say in Association positions before the city and the WPCNA, and an invitation to every meeting and gathering.": "Los miembros reciben novedades del vecindario, voz en las posturas de la Asociación ante la ciudad y la WPCNA, y una invitación a cada reunión y encuentro.",
    "Get in touch to join": "Comuníquese para unirse",
    // Contact
    "Reach the board.": "Comuníquese con la directiva.",
    "Questions, posts, or membership? Send the Fisher Hill Association a note and someone will get back to you.": "¿Preguntas, publicaciones o membresía? Envíe una nota a la Asociación de Fisher Hill y alguien se comunicará con usted.",
    "Name": "Nombre",
    "Email": "Correo electrónico",
    "Subject": "Asunto",
    "Message": "Mensaje",
    "Send message": "Enviar mensaje",
    "Messages go to the Fisher Hill Association board.": "Los mensajes llegan a la directiva de la Asociación de Fisher Hill.",
    "Thanks — your message has been sent. The board will be in touch.": "Gracias: su mensaje ha sido enviado. La directiva se comunicará con usted.",
    // Footer / credits
    "Image credits": "Créditos de imágenes",
    "Image credits.": "Créditos de imágenes.",
    "← Back home": "← Volver al inicio",
    "Hero photographs are used as placeholders under their respective licenses. Unsplash images don't require attribution, but the photographers are credited here; Creative Commons images are attributed as their licenses require.": "Las fotografías principales se usan como marcadores de posición bajo sus respectivas licencias. Las imágenes de Unsplash no requieren atribución, pero aquí se acredita a los fotógrafos; las imágenes de Creative Commons se atribuyen según lo exigen sus licencias.",
    "Map imagery: photorealistic 3D tiles via Google Map Tiles & CesiumJS.": "Imágenes del mapa: mosaicos 3D fotorrealistas mediante Google Map Tiles y CesiumJS.",
    "— courtesy of the Fisher Hill Association": "— cortesía de la Asociación de Fisher Hill",
    // Feed UI
    "Details": "Detalles",
    "Open city page": "Abrir la página de la ciudad",
    "Posted by Fisher Hill Association": "Publicado por la Asociación de Fisher Hill",
    // Feed categories
    "Family": "Familia", "Civic": "Cívico", "Learning": "Educación", "Workshop": "Taller",
    "Community": "Comunidad", "Arts": "Arte", "Food & Downtown": "Comida y Centro",
    "Music & Family": "Música y Familia", "Seasonal": "Temporada", "History": "Historia",
    "Neighborhood Event": "Evento Vecinal", "Volunteer": "Voluntariado", "Public Notice": "Aviso Público",
    // Event titles (descriptive ones; brand/show names kept)
    "Common Council Meeting": "Reunión del Concejo Municipal",
    "English Conversation Group": "Grupo de Conversación en Inglés",
    "WPCNA Neighborhood Workshop": "Taller Vecinal de la WPCNA",
    "Final Vision Zero Public Meeting": "Reunión Pública Final de Vision Zero",
    "Arbor Day in White Plains": "Día del Árbol en White Plains",
    "Vision Zero Public Meeting": "Reunión Pública de Vision Zero",
    "Vision Zero Action Plan Stakeholder Meeting": "Reunión de Partes Interesadas del Plan Vision Zero",
    "Downtown Revitalization Initiative Public Workshop": "Taller Público de la Iniciativa de Revitalización del Centro",
    "Walworth Avenue Block Party": "Fiesta de Barrio en Walworth Avenue",
    "Fisher Hill Spring Cleanup Walk": "Caminata de Limpieza de Primavera de Fisher Hill",
    // Event + post summaries
    "A spring egg hunt for kids, with advance registration and a White Plains High School rain location.": "Búsqueda de huevos de primavera para niños, con inscripción anticipada y sede alternativa por lluvia en White Plains High School.",
    "A public Common Council meeting at City Hall.": "Reunión pública del Concejo Municipal en el Ayuntamiento.",
    "Hands-on STEAM time for kids in grades 4 through 8 at the White Plains Public Library.": "Actividades prácticas de STEAM para niños de 4.º a 8.º grado en la Biblioteca Pública de White Plains.",
    "A workshop on lowering energy bills, with dinner and a free conservation kit.": "Taller para reducir las facturas de energía, con cena y un kit de conservación gratuito.",
    "A free drop-in group for adults who want to practice everyday English.": "Grupo gratuito y sin cita para adultos que quieren practicar el inglés cotidiano.",
    "A spring run of the musical at the White Plains Performing Arts Center.": "Temporada de primavera del musical en el White Plains Performing Arts Center.",
    "A ticketed wing tasting across downtown White Plains, with voting and stops at local restaurants.": "Degustación de alitas con boleto por todo el centro de White Plains, con votación y paradas en restaurantes locales.",
    "A free downtown street series with live music, food, games, and room to hang out.": "Serie gratuita en las calles del centro con música en vivo, comida, juegos y espacio para convivir.",
    "Workshop materials from WPCNA's first annual session for people starting or reviving neighborhood associations.": "Materiales del taller de la primera sesión anual de la WPCNA para quienes inician o reactivan asociaciones de vecinos.",
    "A public meeting on White Plains street safety and the next steps in the Vision Zero plan.": "Reunión pública sobre la seguridad vial en White Plains y los próximos pasos del plan Vision Zero.",
    "An Arbor Day event shared through the WPCNA archive and kept here with its flyer.": "Evento del Día del Árbol compartido a través del archivo de la WPCNA y conservado aquí con su folleto.",
    "A downtown wing tasting with voting, timed entry, and stops at restaurants around White Plains.": "Degustación de alitas en el centro con votación, entrada por horario y paradas en restaurantes de White Plains.",
    "A downtown summer series with live music, food, and family activities on Mamaroneck Avenue.": "Serie de verano en el centro con música en vivo, comida y actividades familiares en Mamaroneck Avenue.",
    "A free fall block party with music, games, vendors, and family activities downtown.": "Fiesta de barrio gratuita de otoño con música, juegos, vendedores y actividades familiares en el centro.",
    "An indoor holiday market with local vendors in the former Barnes & Noble space at City Center.": "Mercado navideño bajo techo con vendedores locales en el antiguo local de Barnes & Noble en City Center.",
    "A public meeting about street safety in White Plains and the Vision Zero Action Plan.": "Reunión pública sobre la seguridad vial en White Plains y el Plan de Acción Vision Zero.",
    "A stakeholder meeting on White Plains street safety, plan goals, and early findings.": "Reunión de partes interesadas sobre la seguridad vial en White Plains, las metas del plan y los primeros hallazgos.",
    "A public workshop on downtown White Plains priorities like open space, public art, and bike lanes.": "Taller público sobre prioridades del centro de White Plains como espacios abiertos, arte público y ciclovías.",
    "Fisher Hill's annual block party returns — food, music, a kids' zone, and a meet-your-neighbors table. Street closed to traffic.": "El regreso de la fiesta de barrio anual de Fisher Hill: comida, música, una zona infantil y una mesa para conocer a los vecinos. Calle cerrada al tráfico.",
    "Volunteers check in and sort out at Mattison Park, then fan out to assigned blocks. Supply stations with gloves and bags will also be posted around the neighborhood — including Mitchell & Sterling Avenue and near Tibbits Avenue — so you can grab what you need close to where you're working.": "Los voluntarios se registran y se organizan en Mattison Park, y luego se reparten por las cuadras asignadas. También habrá estaciones de suministros con guantes y bolsas por el vecindario —incluyendo Mitchell y Sterling Avenue y cerca de Tibbits Avenue— para que pueda tomar lo que necesite cerca de donde trabaje.",
    "White Plains Farmers Market": "Mercado de Agricultores de White Plains",
    "Free Document Shredding Day": "Día de Trituración de Documentos Gratis",
    "A free drop-in group for adults who want to practice everyday English. Meets weekly.": "Grupo gratuito y sin cita para adultos que quieren practicar el inglés cotidiano. Se reúne cada semana.",
    "Local produce, baked goods, and vendors downtown — held weekly through the summer and fall season.": "Productos locales, panadería y vendedores en el centro — todas las semanas durante el verano y el otoño.",
    "A free citywide celebration inspired by the FIFA World Cup 2026™, turning downtown into a fan-filled destination with music, food, and activities.": "Una celebración gratuita en toda la ciudad inspirada en la Copa Mundial de la FIFA 2026™, que convierte el centro en un destino lleno de aficionados con música, comida y actividades.",
    "Bring confidential personal documents to the Gedney Yard for free on-site shredding. Junk mail, newspapers, and cardboard are not accepted.": "Lleve documentos personales confidenciales al Gedney Yard para trituración gratuita en el lugar. No se aceptan correo basura, periódicos ni cartón."
  };

  function getLang() {
    try { return localStorage.getItem("fha-lang") || "en"; } catch (e) { return "en"; }
  }

  function translate(root) {
    if (getLang() !== "es") return;
    var walker = document.createTreeWalker(root || document.body, NodeFilter.SHOW_TEXT, {
      acceptNode: function (n) {
        var p = n.parentNode;
        if (!p) return NodeFilter.FILTER_REJECT;
        var tag = p.nodeName;
        if (tag === "SCRIPT" || tag === "STYLE" || tag === "NOSCRIPT") return NodeFilter.FILTER_REJECT;
        if (p.classList && p.classList.contains("lang-btn")) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    var nodes = [], n;
    while ((n = walker.nextNode())) nodes.push(n);
    nodes.forEach(function (node) {
      var raw = node.nodeValue, key = raw.trim();
      if (key && ES[key]) {
        node.nodeValue = raw.match(/^\s*/)[0] + ES[key] + raw.match(/\s*$/)[0];
      }
    });
  }

  function buildToggle(lang) {
    var side = document.querySelector(".side");
    if (!side) return;
    var box = document.createElement("div");
    box.className = "lang-toggle";
    var LABELS = { en: "English", es: "Español" };
    ["en", "es"].forEach(function (l) {
      var b = document.createElement("button");
      b.className = "lang-btn" + (l === lang ? " active" : "");
      b.type = "button";
      b.textContent = LABELS[l];
      b.setAttribute("aria-label", LABELS[l]);
      b.addEventListener("click", function () {
        try { localStorage.setItem("fha-lang", l); } catch (e) {}
        location.reload();
      });
      box.appendChild(b);
    });
    var foot = side.querySelector(".side-foot");
    if (foot) side.insertBefore(box, foot);   // just above the light footer copy
    else side.appendChild(box);
  }

  window.fhaApplyI18n = function () { translate(document.body); };

  function init() {
    var lang = getLang();
    document.documentElement.lang = lang;
    buildToggle(lang);
    translate(document.body);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
