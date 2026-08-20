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
    "Events around White Plains": "Eventos en White Plains",
    "See all events →": "Ver todos los eventos →",
    // Posts — card chrome (tags + empty states; titles/summaries ship as
    // title_es/summary_es in data/posts.json and are picked in feeds.js)
    "Lost & Found": "Perdido y encontrado",
    "Tag Sale": "Venta de garaje",
    "Neighbor": "Vecinos",
    "Business": "Negocio local",
    "Neighborhood": "Vecindario",
    "No neighborhood posts right now — check back soon.": "No hay publicaciones del vecindario por ahora — vuelva pronto.",
    "Posts are unavailable right now.": "Las publicaciones no están disponibles en este momento.",
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
    "Annual Meetings": "Reuniones Anuales",
    "Board Meetings": "Reuniones de la Junta",
    "Mayor's Office Meetings": "Reuniones con la Oficina del Alcalde",
    "Agendas & meeting recaps": "Agendas y resúmenes de las reuniones",
    "Agendas & minutes": "Agendas y actas",
    "Agendas & minutes — the FHA meets with the mayor's office and city commissioners 2–3 times a year": "Agendas y actas — la FHA se reúne con la oficina del alcalde y los comisionados de la ciudad 2 o 3 veces al año",
    "Loading documents…": "Cargando documentos…",
    "No documents posted yet — check back soon.": "Aún no hay documentos publicados — vuelva pronto.",
    "Documents are unavailable right now.": "Los documentos no están disponibles en este momento.",
    "Untitled document": "Documento sin título",
    "[Placeholder] Annual Meeting 2026 — agenda": "[Provisional] Reunión Anual 2026 — agenda",
    "[Placeholder] Annual Meeting 2025 — recap": "[Provisional] Reunión Anual 2025 — resumen",
    "[Placeholder] Board Meeting April 2026 — minutes": "[Provisional] Reunión de la Junta, abril de 2026 — actas",
    "[Placeholder] Board Meeting November 2025 — agenda": "[Provisional] Reunión de la Junta, noviembre de 2025 — agenda",
    "[Placeholder] Mayor's Office Meeting Spring 2026 — minutes": "[Provisional] Reunión con la Oficina del Alcalde, primavera de 2026 — actas",
    "[Placeholder] Mayor's Office Meeting Fall 2025 — agenda": "[Provisional] Reunión con la Oficina del Alcalde, otoño de 2025 — agenda",
    "Read the minutes →": "Leer las actas →",
    // About
    "Fisher Hill is a historic neighborhood within walking distance of the central business district of White Plains, New York. Residential development began around 1900, and many of the large vintage homes from that era still define the neighborhood's character today. Fisher Hill is notably diverse in ethnicity, age, and income.": "Fisher Hill es un barrio histórico a poca distancia a pie del centro comercial de White Plains, Nueva York. El desarrollo residencial comenzó alrededor de 1900, y muchas de las grandes casas antiguas de esa época aún definen el carácter del vecindario. Fisher Hill destaca por su diversidad de origen, edad e ingresos.",
    "The neighborhood is bounded by the Bronx River Parkway to the west and Post Road to the east, with White Plains Hospital, the public library, the Metro-North station, and City Center all just beyond its edges. The Fisher Hill Association represents residents within the White Plains Council of Neighborhood Associations (WPCNA).": "El vecindario está delimitado por el Bronx River Parkway al oeste y Post Road al este, con el Hospital de White Plains, la biblioteca pública, la estación Metro-North y el City Center justo al lado. La Asociación de Fisher Hill representa a los residentes dentro del Consejo de Asociaciones de Vecinos de White Plains (WPCNA).",
    // About — history section
    "A brief history of Fisher Hill": "Breve historia de Fisher Hill",
    "Before White Plains": "Antes de White Plains",
    "The land Fisher Hill sits on lay in the homeland of the Weckquaeskeck, a Munsee-speaking Wappinger band. Native peoples have lived in what is now Westchester for at least seven thousand years; by around 1000 AD they were living here in small villages and farming the land. They called this place Quarropas — traditionally translated as the white marshes, or the white mist that hung above the wetlands. In November 1683, English Puritan settlers from Rye, then a border town of the Connecticut colony, purchased about 4,400 acres here. Whether the English name translated Quarropas or came from the white balsam that grew on the plains has never been settled, and title to the tract stayed in dispute for nearly forty years.": "La tierra sobre la que se asienta Fisher Hill formaba parte del territorio de los weckquaeskeck, un grupo wappinger de habla munsee. Los pueblos originarios han vivido en lo que hoy es Westchester durante al menos siete mil años; hacia el año 1000 d. C. vivían aquí en pequeñas aldeas y cultivaban la tierra. Llamaban a este lugar Quarropas, traducido tradicionalmente como las marismas blancas, o la niebla blanca que flotaba sobre los humedales. En noviembre de 1683, colonos puritanos ingleses de Rye, entonces un pueblo fronterizo de la colonia de Connecticut, compraron aquí unos 4.400 acres. Nunca se ha resuelto si el nombre inglés traducía Quarropas o provenía del bálsamo blanco que crecía en los llanos, y la titularidad del terreno permaneció en disputa durante casi cuarenta años.",
    "The Revolution comes to the hill": "La Revolución llega a la colina",
    "On July 11, 1776, the Declaration of Independence was read to the public from the White Plains courthouse steps — two days after the Provincial Congress, meeting in that same courthouse, voted to approve it and made New York a state. That October the war arrived in the neighborhood itself. Washington's army, defeated on Long Island and pushed back through Manhattan, reached White Plains on October 21, and he made his headquarters north of the village at the house of the widow Ann Fisher Miller; some accounts place him first at the Jacob Purdy House. Ann Fisher was a daughter of the same Fisher family the hill is named for.": "El 11 de julio de 1776 se leyó públicamente la Declaración de Independencia desde las escalinatas del juzgado de White Plains, dos días después de que el Congreso Provincial, reunido en ese mismo juzgado, votara aprobarla y convirtiera a Nueva York en estado. Ese octubre la guerra llegó al propio vecindario. El ejército de Washington, derrotado en Long Island y empujado a través de Manhattan, llegó a White Plains el 21 de octubre, y él estableció su cuartel general al norte del pueblo, en la casa de la viuda Ann Fisher Miller; algunos relatos lo sitúan primero en la Jacob Purdy House. Ann Fisher era hija de la misma familia Fisher que da nombre a la colina.",
    "Washington's line ran three miles, from Chatterton's Hill — Battle Hill — to Purdy's Hill and across Broadway. The British and their Hessian allies held the ground east of the Bronx River, northward from the Scarsdale border through Fisher Hill and along the York Road, which we now call Post Road. British guns stood on Fisher Hill — the Historical Society places Captain Anthony Farrington's Royal Artillery here — and fired across at the Continental positions on Chatterton's Hill. The Battle of White Plains began in earnest on October 28, 1776; Washington withdrew his troops northward on October 31, and on November 5 Howe abandoned the White Plains position, turning back toward Manhattan the following week.": "La línea de Washington se extendía tres millas, desde Chatterton's Hill (Battle Hill) hasta Purdy's Hill y al otro lado de Broadway. Los británicos y sus aliados hessianos ocupaban el terreno al este del río Bronx, hacia el norte desde el límite con Scarsdale, pasando por Fisher Hill y a lo largo de York Road, que hoy llamamos Post Road. Los cañones británicos se emplazaron en Fisher Hill — la Sociedad Histórica sitúa aquí la Artillería Real del capitán Anthony Farrington — y dispararon contra las posiciones continentales en Chatterton's Hill. La Batalla de White Plains comenzó de lleno el 28 de octubre de 1776; Washington retiró sus tropas hacia el norte el 31 de octubre, y el 5 de noviembre Howe abandonó la posición de White Plains, girando hacia Manhattan la semana siguiente.",
    "The Fishers": "Los Fisher",
    "Family tradition traces the line to a William Fisher, born in England, who married Adriana Wynant Vander Burg in 1693. Their son Johannis — John — was born in 1704 and settled in White Plains in the 1740s, building the Fisher homestead on Orchard Street, beside what is now I-287. The family held land here for generations. Myndert Fisher, a farmer and large landowner in the nineteenth century, owned everything bounded by Winchester Street to the east, Martine Avenue and the railroad to the north, Post Road to the south, and Tibbits Avenue to the west. Fisher Avenue, Fisher Court, and Fisher Hill itself most likely carry his name. He died in 1885.": "La tradición familiar hace remontar el linaje a un William Fisher, nacido en Inglaterra, que se casó con Adriana Wynant Vander Burg en 1693. Su hijo Johannis (John) nació en 1704 y se estableció en White Plains en la década de 1740, construyendo la hacienda Fisher en Orchard Street, junto a lo que hoy es la I-287. La familia mantuvo tierras aquí durante generaciones. Myndert Fisher, agricultor y gran terrateniente del siglo XIX, poseía todo lo delimitado por Winchester Street al este, Martine Avenue y el ferrocarril al norte, Post Road al sur y Tibbits Avenue al oeste. Fisher Avenue, Fisher Court y la propia Fisher Hill muy probablemente llevan su nombre. Murió en 1885.",
    "The railroad, the parkway, and a neighborhood": "El ferrocarril, la autovía y un vecindario",
    "Rail service reached White Plains from Manhattan in 1844, turning an all-day journey by coach into a two-hour commute. It was the beginning of the change from farmland village to city: wealthy Manhattanites came first for weekend country estates, and then people came to stay and commute.": "El servicio ferroviario llegó a White Plains desde Manhattan en 1844, convirtiendo un viaje de todo un día en diligencia en un trayecto de dos horas. Fue el comienzo del cambio de aldea agrícola a ciudad: primero llegaron los adinerados de Manhattan con sus fincas de fin de semana, y después vino gente a quedarse y viajar a diario al trabajo.",
    "Fisher Hill's own building boom came with the new century. Photographs of the Ridgeview Congregational Church under construction in 1900 show Midland and Ridgeview Avenues as unpaved dirt roads with no houses in sight. By 1906, both were paved and Ridgeview was built out with homes along both sides — the neighborhood we recognize today, arriving in the space of six years.": "El auge constructivo de Fisher Hill llegó con el nuevo siglo. Las fotografías de la Ridgeview Congregational Church en construcción en 1900 muestran las avenidas Midland y Ridgeview como caminos de tierra sin pavimentar y sin una sola casa a la vista. Para 1906, ambas estaban pavimentadas y Ridgeview estaba edificada con viviendas a ambos lados: el vecindario que reconocemos hoy, surgido en apenas seis años.",
    "The second great change came by car. New York City authorized the acquisition of land for Bronx Park in 1884; the Botanical Garden was chartered there in 1891, and by the turn of the century the park held the Bronx Zoo as well. The Bronx River that ran down to them was, by then, a public health hazard — fifteen miles of water fouled with human, animal, and factory waste, and there was real fear it would sicken the zoo's animals. A state commission first floated the idea of a road along the river in 1895; the Bronx Parkway Commission itself was created in 1906, and spent the better part of two decades buying land, stopping the sewage, and persuading factories to move. The fifteen-mile Bronx River Parkway opened in 1925, thirty years after it was first proposed. With a railroad and a parkway both running to Manhattan, White Plains grew in earnest.": "El segundo gran cambio llegó en automóvil. La ciudad de Nueva York autorizó la adquisición de terrenos para Bronx Park en 1884; el Jardín Botánico se constituyó allí en 1891, y para el cambio de siglo el parque albergaba también el Zoológico del Bronx. El río Bronx que bajaba hasta ellos era, para entonces, un peligro para la salud pública: quince millas de agua contaminada con desechos humanos, animales e industriales, y existía un temor real de que enfermara a los animales del zoológico. Una comisión estatal planteó por primera vez la idea de una carretera junto al río en 1895; la Comisión del Bronx Parkway propiamente dicha se creó en 1906, y dedicó buena parte de dos décadas a comprar terrenos, detener las aguas residuales y persuadir a las fábricas de trasladarse. El Bronx River Parkway, de quince millas, se inauguró en 1925, treinta años después de haber sido propuesto por primera vez. Con un ferrocarril y una autovía que llegaban a Manhattan, White Plains creció de veras.",
    "By the numbers": "En cifras",
    "The first federal census, in 1790, counted 505 people in White Plains — forty of them enslaved. There were 575 in 1800. Twenty-six years after the railroad arrived, in 1870, there were 2,630; by 1890, 4,508. After the parkway opened, growth accelerated sharply: 35,800 residents in 1930, and 40,100 in 1940. Today White Plains is home to roughly 60,000 people, and its daytime population swells to something near 250,000. About 4,000 of us live on Fisher Hill — a neighborhood notably diverse in ethnicity, age, and income.": "El primer censo federal, en 1790, contabilizó 505 personas en White Plains, cuarenta de ellas esclavizadas. Había 575 en 1800. Veintiséis años después de la llegada del ferrocarril, en 1870, había 2.630; para 1890, 4.508. Tras la apertura de la autovía, el crecimiento se aceleró notablemente: 35.800 residentes en 1930 y 40.100 en 1940. Hoy White Plains alberga a unas 60.000 personas, y su población diurna asciende a cerca de 250.000. Unos 4.000 de nosotros vivimos en Fisher Hill, un vecindario que destaca por su diversidad de origen, edad e ingresos.",
    // About — history section (about.html).
    // The fact-checked variants above serve about-verified.html; both sets stay
    // here so Spanish works whichever version is live.
    "The land Fisher Hill sits on was home to the Weckquaeskeck people, with archaeological evidence of their presence dating back roughly a thousand years. They called this place Quarropas — a name understood to describe the white marshes, or the white mist that hung above the wetlands here. In November 1683, English settlers from Rye and Connecticut purchased 4,400 acres from the Weckquaeskeck, and the settlement that followed took its English name from theirs: White Plains.": "La tierra sobre la que se asienta Fisher Hill fue hogar del pueblo weckquaeskeck, con evidencia arqueológica de su presencia que se remonta a unos mil años. Llamaban a este lugar Quarropas, un nombre que se entiende describía las marismas blancas, o la niebla blanca que flotaba sobre los humedales de la zona. En noviembre de 1683, colonos ingleses de Rye y Connecticut compraron 4.400 acres a los weckquaeskeck, y el asentamiento que siguió tomó su nombre inglés del de ellos: White Plains.",
    "On July 11, 1776, the Declaration of Independence was read in White Plains, on the courthouse steps — the moment New York joined the new nation. That October the war arrived in the neighborhood itself. Washington, defeated on Long Island and pushed back through Manhattan, reached White Plains on October 21 and made his headquarters at Elijah Miller's house in North White Plains. Miller's wife, Ann Fisher, was a daughter of the same Fisher family the hill is named for.": "El 11 de julio de 1776 se leyó la Declaración de Independencia en White Plains, en las escalinatas del juzgado: el momento en que Nueva York se sumó a la nueva nación. Ese octubre la guerra llegó al propio vecindario. Washington, derrotado en Long Island y empujado a través de Manhattan, llegó a White Plains el 21 de octubre y estableció su cuartel general en la casa de Elijah Miller, en North White Plains. La esposa de Miller, Ann Fisher, era hija de la misma familia Fisher que da nombre a la colina.",
    "Washington's line ran three miles, from Chatterton's Hill — Battle Hill — to Purdy's Hill and across Broadway. The British and their Hessian allies held the east side of the Bronx River, northward from the Scarsdale border through Fisher Hill and along the York Road, which we now call Post Road. Their cannon stood on Fisher Hill and fired across at the Continental positions. The Battle of White Plains began in earnest on October 28, 1776; Washington withdrew his troops northward on October 31, and by November 5 Howe had turned his army back toward Manhattan.": "La línea de Washington se extendía tres millas, desde Chatterton's Hill (Battle Hill) hasta Purdy's Hill y al otro lado de Broadway. Los británicos y sus aliados hessianos ocupaban el lado este del río Bronx, hacia el norte desde el límite con Scarsdale, pasando por Fisher Hill y a lo largo de York Road, que hoy llamamos Post Road. Sus cañones se emplazaron en Fisher Hill y dispararon contra las posiciones continentales. La Batalla de White Plains comenzó de lleno el 28 de octubre de 1776; Washington retiró sus tropas hacia el norte el 31 de octubre, y para el 5 de noviembre Howe había dirigido su ejército de regreso hacia Manhattan.",
    "The first Fisher here was William Fisher, born in England, who married Adriana Wynant Vander Burg in 1693. Their son Johannis — John — was born in White Plains in 1704, and built the Fisher homestead on Orchard Street, beside what is now I-287. The family held land here for generations. Myndert Fisher, a farmer and large landowner in the nineteenth century, owned everything bounded by Winchester Street to the east, Martine Avenue and the railroad to the north, Post Road to the south, and Tibbits Avenue to the west. Fisher Avenue, Fisher Court, and Fisher Hill itself most likely carry his name. He died in 1885.": "El primer Fisher aquí fue William Fisher, nacido en Inglaterra, que se casó con Adriana Wynant Vander Burg en 1693. Su hijo Johannis (John) nació en White Plains en 1704 y construyó la hacienda Fisher en Orchard Street, junto a lo que hoy es la I-287. La familia mantuvo tierras aquí durante generaciones. Myndert Fisher, agricultor y gran terrateniente del siglo XIX, poseía todo lo delimitado por Winchester Street al este, Martine Avenue y el ferrocarril al norte, Post Road al sur y Tibbits Avenue al oeste. Fisher Avenue, Fisher Court y la propia Fisher Hill muy probablemente llevan su nombre. Murió en 1885.",
    "The second great change came by car. New York City began acquiring land for Bronx Park in 1884, and by 1897 it held the Bronx Zoo and the Botanical Garden. The Bronx River that ran to it was, by then, a public health hazard — fifteen miles of water fouled with human, animal, and factory waste, and there was real fear it would sicken the zoo's animals. The Bronx Parkway Commission, formed in 1895, spent two decades buying land along the river, stopping the sewage, and persuading factories to move. In July 1925 the fifteen-mile Bronx River Parkway opened, thirty years after it was first proposed. With a railroad and a parkway both running to Manhattan, White Plains grew in earnest.": "El segundo gran cambio llegó en automóvil. La ciudad de Nueva York comenzó a adquirir terrenos para Bronx Park en 1884, y para 1897 albergaba el Zoológico del Bronx y el Jardín Botánico. El río Bronx que desembocaba allí era, para entonces, un peligro para la salud pública: quince millas de agua contaminada con desechos humanos, animales e industriales, y existía un temor real de que enfermara a los animales del zoológico. La Comisión del Bronx Parkway, creada en 1895, dedicó dos décadas a comprar terrenos junto al río, detener las aguas residuales y persuadir a las fábricas de trasladarse. En julio de 1925 se inauguró el Bronx River Parkway, de quince millas, treinta años después de haber sido propuesto por primera vez. Con un ferrocarril y una autovía que llegaban a Manhattan, White Plains creció de veras.",
    "The first federal census, in 1790, counted 505 people in White Plains — forty-six of them enslaved. There were 575 in 1800. Twenty-six years after the railroad arrived, in 1870, there were 2,630; by 1890, some 4,500. Growth came fastest in the decades on either side of 1900, and the city kept climbing: 35,800 residents in 1930, and 40,327 in 1940. Today White Plains is home to roughly 60,000 people, and its daytime population swells to something near 250,000. About 4,000 of us live on Fisher Hill — a neighborhood notably diverse in ethnicity, age, and income.": "El primer censo federal, en 1790, contabilizó 505 personas en White Plains, cuarenta y seis de ellas esclavizadas. Había 575 en 1800. Veintiséis años después de la llegada del ferrocarril, en 1870, había 2.630; para 1890, unas 4.500. El crecimiento fue más rápido en las décadas anteriores y posteriores a 1900, y la ciudad siguió aumentando: 35.800 residentes en 1930 y 40.327 en 1940. Hoy White Plains alberga a unas 60.000 personas, y su población diurna asciende a cerca de 250.000. Unos 4.000 de nosotros vivimos en Fisher Hill, un vecindario que destaca por su diversidad de origen, edad e ingresos.",

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
    "Who can join": "Quién puede unirse",
    "Membership is open to current Fisher Hill residents and to former residents who'd like to stay connected. If you've moved away, just list the Fisher Hill address where you used to live.": "La membresía está abierta a los residentes actuales de Fisher Hill y a los exresidentes que deseen mantenerse conectados. Si se ha mudado, solo indique la dirección de Fisher Hill donde vivía.",
    "Dues": "Cuotas",
    "Annual dues are $5 for an individual or $10 for a family. After you submit the form below, you can pay electronically or mail a check — payment details are confirmed once a board member verifies your Fisher Hill connection.": "Las cuotas anuales son de $5 por persona o $10 por familia. Después de enviar el formulario a continuación, puede pagar electrónicamente o enviar un cheque por correo — los detalles de pago se confirman una vez que un miembro de la directiva verifica su vínculo con Fisher Hill.",
    "How would you like to pay?": "¿Cómo le gustaría pagar?",
    "Check or cash": "Cheque o efectivo",
    "— mail or drop off a check payable to the Fisher Hill Association at the Association's mailing address:": "— envíe por correo o entregue un cheque a nombre de la Fisher Hill Association en la dirección postal de la Asociación:",
    "[FHA mailing address — current president's home]": "[Dirección postal de la FHA — casa del presidente actual]",
    "[FHA Venmo handle]": "[Usuario de Venmo de la FHA]",
    "[FHA Zelle email or phone]": "[Correo o teléfono de Zelle de la FHA]",
    "[FHA PayPal link]": "[Enlace de PayPal de la FHA]",
    "Venmo, Zelle, and PayPal details are confirmed in the follow-up email after a board member verifies your membership.": "Los datos de Venmo, Zelle y PayPal se confirman en el correo de seguimiento después de que un miembro de la directiva verifique su membresía.",
    "Name": "Nombre",
    "Email": "Correo electrónico",
    "Residency": "Residencia",
    "Current Fisher Hill resident": "Residente actual de Fisher Hill",
    "Former Fisher Hill resident": "Exresidente de Fisher Hill",
    "Fisher Hill address": "Dirección en Fisher Hill",
    "(current, or former if you've moved)": "(actual, o anterior si se ha mudado)",
    "Membership": "Membresía",
    "Individual — $5/year": "Individual — $5/año",
    "Family — $10/year": "Familiar — $10/año",
    "Anything you'd like the board to know?": "¿Algo que quiera que la directiva sepa?",
    "(optional)": "(opcional)",
    "Submit membership request": "Enviar solicitud de membresía",
    "A board member reviews each request and follows up with payment details. Submitting this form does not charge you.": "Un miembro de la directiva revisa cada solicitud y da seguimiento con los detalles de pago. Enviar este formulario no genera ningún cargo.",
    "Thanks — your membership request has been received. A board member will verify your Fisher Hill connection and follow up with payment details.": "Gracias: hemos recibido su solicitud de membresía. Un miembro de la directiva verificará su vínculo con Fisher Hill y dará seguimiento con los detalles de pago.",
    // Contact
    "Reach the board.": "Comuníquese con la directiva.",
    "Questions, posts, or membership? Send the Fisher Hill Association a note and the president of the FHA will get back to you.": "¿Preguntas, publicaciones o membresía? Envíe una nota a la Asociación de Fisher Hill y el presidente de la FHA se comunicará con usted.",
    "Name": "Nombre",
    "Email": "Correo electrónico",
    "Subject": "Asunto",
    "Message": "Mensaje",
    "Send message": "Enviar mensaje",
    "Messages go to the Fisher Hill Association board at": "Los mensajes llegan a la directiva de la Asociación de Fisher Hill en",
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
    "Open library page": "Abrir la página de la biblioteca",
    "Open event page": "Abrir la página del evento",
    "Open show page": "Abrir la página del espectáculo",
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
    "Bring confidential personal documents to the Gedney Yard for free on-site shredding. Junk mail, newspapers, and cardboard are not accepted.": "Lleve documentos personales confidenciales al Gedney Yard para trituración gratuita en el lugar. No se aceptan correo basura, periódicos ni cartón.",
    "Share something with the neighborhood.": "Comparta algo con el vecindario.",
    "A place for neighbors to find each other and find what's nearby — local businesses and services, lost-and-found pets, tag sales and giveaways, and neighbor-to-neighbor needs and offers. Every submission is reviewed before it appears.": "Un lugar para que los vecinos se encuentren y descubran lo que hay cerca: negocios y servicios locales, mascotas perdidas y encontradas, ventas de garaje y artículos gratis, y necesidades y ofrecimientos entre vecinos. Cada publicación se revisa antes de aparecer.",
    "Welcome to post": "Le invitamos a publicar",
    "What's welcome": "Lo que se puede publicar",
    "Not allowed": "No permitido",
    "Neighborhood events, meetings, and gatherings": "Eventos, reuniones y encuentros del vecindario",
    "Local businesses, shops, and services": "Negocios, tiendas y servicios locales",
    "Lost & found — pets or items": "Objetos y mascotas perdidos y encontrados",
    "Lost & found — pets or items. A photo helps neighbors spot them; you can attach one below.": "Objetos y mascotas perdidos y encontrados. Una foto ayuda a los vecinos a reconocerlos; puede adjuntarla abajo.",
    "Photo of the pet or item (optional — it helps neighbors recognize them)": "Foto de la mascota o del objeto (opcional — ayuda a los vecinos a reconocerlos)",
    "Remove photo": "Quitar la foto",
    "Photos are reviewed before anything appears on the board.": "Las fotos se revisan antes de que algo aparezca en el tablón.",
    "That photo couldn't be read — please try a different one.": "No se pudo leer esa foto — pruebe con otra.",
    "Tag sales, yard sales, and giveaways": "Ventas de garaje y artículos gratis",
    "Neighbor-to-neighbor needs, offers, and giveaways": "Necesidades, ofrecimientos y artículos gratis entre vecinos",
    "Civil and truthful, with your own contact info": "Cortés y veraz, con su propia información de contacto",
    "Only images you own or have permission to post": "Solo imágenes que usted posee o tiene permiso para publicar",
    "Spam & scams — bulk, repeated, automated, or bot submissions; fraudulent offers": "Spam y estafas: publicaciones masivas, repetidas, automáticas o de bots; ofertas fraudulentas",
    "Naming, targeting, or disparaging a specific individual": "Nombrar, señalar o menospreciar a una persona en concreto",
    "Reviews, ratings, or rankings of businesses — good or bad (this isn't Yelp)": "Reseñas, calificaciones o clasificaciones de negocios — buenas o malas (esto no es Yelp)",
    "Harassing, threatening, or defamatory language": "Lenguaje de acoso, amenazante o difamatorio",
    "AI-generated, manipulated, or fake images of any person": "Imágenes generadas por IA, manipuladas o falsas de cualquier persona",
    "Airing a personal dispute between neighbors": "Ventilar una disputa personal entre vecinos",
    "Sharing someone else's personal information without their consent": "Compartir la información personal de otra persona sin su consentimiento",
    "Anything unrelated to Fisher Hill or White Plains": "Cualquier cosa ajena a Fisher Hill o White Plains",
    "Post type": "Tipo de publicación",
    "Title": "Título",
    "Details": "Detalles",
    "Event date — the day it happens, not today": "Fecha del evento — el día en que ocurre, no la fecha de hoy",
    "Event time — for example 1:00 PM to 6:00 PM (optional)": "Hora del evento — por ejemplo, de 1:00 PM a 6:00 PM (opcional)",
    "Location — the street or place (optional)": "Lugar — la calle o el sitio (opcional)",
    "Your name": "Su nombre",
    "Your email (for follow-up — not published)": "Su correo electrónico (para seguimiento — no se publica)",
    "Your phone (optional — shown only if you include it)": "Su teléfono (opcional — se muestra solo si lo incluye)",
    "Choose one…": "Elija una opción…",
    "Neighborhood event": "Evento del vecindario",
    "Local business or service": "Negocio o servicio local",
    "Lost & found (pet or item)": "Perdido y encontrado (mascota u objeto)",
    "Tag sale / yard sale / giveaway": "Venta de garaje / artículos gratis",
    "Neighbor need or offer": "Necesidad u ofrecimiento entre vecinos",
    "Recommendation": "Recomendación",
    "Other": "Otro",
    "Any images I include are my own or I have permission to post them — and none are AI-generated or altered images of a person.": "Las imágenes que incluyo son mías o tengo permiso para publicarlas, y ninguna es una imagen generada por IA ni alterada de una persona.",
    "I've read the guidelines and understand posts are reviewed before they appear.": "He leído las pautas y entiendo que las publicaciones se revisan antes de aparecer.",
    "Submit for review": "Enviar para revisión",
    "Submissions are reviewed before posting. Submitting does not guarantee publication.": "Las publicaciones se revisan antes de aparecer. Enviar no garantiza la publicación.",
    "Thanks — your post was submitted for review. If it fits the guidelines, it will appear on the board.": "Gracias: su publicación se envió para revisión. Si cumple las pautas, aparecerá en el tablón.",
    "No upcoming events right now — check back soon.": "No hay eventos próximos por ahora — vuelva pronto."
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
    var box = document.createElement("div");
    box.className = "lang-toggle";
    var LABELS = { en: "ENG", es: "ESP" };
    var FULL = { en: "English", es: "Español" };
    ["en", "es"].forEach(function (l) {
      var b = document.createElement("button");
      b.className = "lang-btn" + (l === lang ? " active" : "");
      b.type = "button";
      b.textContent = LABELS[l];
      b.setAttribute("aria-label", FULL[l]);
      b.addEventListener("click", function () {
        try { localStorage.setItem("fha-lang", l); } catch (e) {}
        location.reload();
      });
      box.appendChild(b);
    });
    document.body.appendChild(box);   // fixed top-right (see styles.css)
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
