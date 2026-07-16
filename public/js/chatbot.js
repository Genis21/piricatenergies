/**
 * PIRICAT ENERGIES — chatbot.js
 * Assistent de xat basat en paraules clau (sense IA) per a la web pública.
 * Per a consultes més complexes, deriva l'usuari al bot de Telegram
 * @Piricat_bot, que sí que utilitza IA (Groq) amb memòria de conversa.
 *
 * ─────────────────────────────────────────────────────────────────
 *  COM AFEGIR CONTINGUT NOU (p. ex. Plaques Solars, Aerotèrmia...)
 *  Només cal afegir un objecte nou dins de BASE_CONEIXEMENT, amb:
 *    - id:       identificador únic (per a depuració/estadístiques)
 *    - keywords: totes les paraules o frases que hi han de portar. No cal
 *                afegir cada plural/femení a mà: el motor de classificació
 *                ja tolera automàticament singular/plural i masculí/femení
 *                habituals (vegeu "MOTOR DE CLASSIFICACIÓ" més avall).
 *    - response: el text de resposta (pot incloure HTML senzill, <br>...)
 *    - priority: (opcional, per defecte 0) com més alt, més guanya sobre
 *                la resta de temes detectats en el mateix missatge.
 *                S'utilitza per a urgències (2) i serveis fora d'abast (1).
 *    - cta:      (opcional) true si, quan aquest tema surti sol o combinat,
 *                cal afegir al final la crida a l'acció comercial estàndard
 *                (només si la resposta encara no esmenta el telèfon).
 *    - etiqueta: (opcional) nom curt que apareix com a capçalera d'aquest
 *                bloc quan la resposta es combina amb altres temes (p. ex.
 *                "Horari", "Cobertura"). Si no s'indica, es mostra "Info".
 *  No cal tocar cap altra part del codi. Vegeu la PLANTILLA D'EXEMPLE
 *  comentada al final de BASE_CONEIXEMENT.
 * ─────────────────────────────────────────────────────────────────
 */

(function () {
  "use strict";

  const TELEGRAM_URL = "https://t.me/Piricat_bot";
  const TELEFON = "973 620 555";

  // Crida a l'acció comercial que s'afegeix automàticament a certs temes
  // (vegeu el camp `cta` de cada tema i la funció afegirCridaAccio).
  const CRIDA_ACCIO = "Si vols que t'assignem un tècnic, truca'ns al 📞 " + TELEFON + ".";

  // Paràmetres ajustables del motor de classificació.
  // IMPORTANT: el nombre de temes detectats JA NO és el criteri principal
  // per decidir si es deriva a Telegram. Un missatge amb diversos temes
  // clars ("Teniu servei a Vielha? Quin horari feu? Necessito un tècnic
  // per una caldera") es respon sencer, encara que toqui 3, 4 o 5 temes.
  const CONFIG = {
    // A partir d'aquest nombre de blocs combinats, la resposta ja és una
    // mica llarga: s'afegeix un suggeriment (NO obligatori) de parlar amb
    // l'assistent de Telegram per a una resposta més detallada, però es
    // continua responent la consulta sencera igualment.
    TEMES_AVIS_TELEGRAM: 5,
    // Xarxa de seguretat, NOMÉS per a casos extrems: si un missatge toca
    // més temes que això alhora (símptoma típic de text enganxat, spam o
    // consulta caòtica sense relació real entre les parts), aleshores sí
    // que es considera massa ambigu per respondre amb garanties i es
    // deriva del tot a Telegram. En l'ús normal no s'hauria d'arribar mai
    // aquí.
    TEMES_MAXIM_ABSOLUT: 8
  };

  // ─────────────────────────────────────────────
  //  BASE DE CONEIXEMENT
  //  Cada bloc és un "tema" independent i autocontingut.
  // ─────────────────────────────────────────────
  const BASE_CONEIXEMENT = [
    {
      id: "salutacio",
      etiqueta: "Salutació",
      keywords: ["hola", "bon dia", "bona tarda", "bona nit", "hey", "ei", "hei"],
      response:
        "Hola! Sóc l'assistent virtual de Piricat Energies. En què et puc ajudar? 😊<br>" +
        "Pots preguntar-me sobre serveis, comarques on treballem, urgències, horari o com funciona la petició d'un tècnic."
    },

    // Tema d'URGÈNCIES: agrupa tant les paraules explícites d'urgència
    // com tots els sinònims d'un tall de subministrament elèctric i altres
    // incidents greus (fum, canonades rebentades, aigua calenta, etc.).
    // priority: 2 → és el nivell més alt, guanya sempre sobre qualsevol
    // altre tema detectat en el mateix missatge (fins i tot per davant
    // dels serveis fora d'abast). No té `etiqueta` perquè mai es combina
    // amb altres temes: sempre respon tota sola.
    {
      id: "urgencies",
      priority: 2,
      keywords: [
        // Urgència genèrica
        "urgent", "urgencia", "emergencia", "24", "ara mateix",
        // Incidents greus
        "fuita greu", "fuita grossa", "fuga grossa", "inundacio", "curtcircuit", "curt circuit", "curt-circuit",
        // Elèctric: símptomes greus i concrets
        "m'ha saltat el diferencial", "salta el diferencial", "salten els ploms",
        "s'han fos els ploms", "surt fum", "olor de cremat", "ha explotat un endoll",
        // Sense subministrament elèctric (totes porten a la mateixa resposta)
        "sense llum", "sense corrent", "no tinc electricitat", "no tinc corrent",
        "no hi ha electricitat", "no hi ha corrent", "no hi ha llum",
        "se n'ha anat la llum", "s'ha anat la llum", "s'ha anat el corrent",
        "tall de llum", "tall de corrent", "tall electric", "apagada",
        // Aigua: símptomes greus
        "no tinc aigua calenta", "no surt aigua calenta", "perdo aigua", "estic perdent aigua",
        "rebenta una canonada", "s'ha rebentat una canonada", "canonada rebentada", "rebentada"
      ],
      response:
        "Per a urgències elèctriques o fuites greus, truca directament: 📞 " + TELEFON +
        ". Marquem l'avís com a urgent i prioritzem l'assignació del tècnic."
    },

    // Tema de SERVEIS FORA D'ABAST: electrodomèstics que Piricat NO repara.
    // priority: 1 → guanya sobre qualsevol tema normal (prioritat 0), però
    // queda per sota d'una urgència real (prioritat 2) si coincidissin totes
    // dues coses en el mateix missatge. Tampoc porta `etiqueta`: sempre
    // respon sola.
    {
      id: "fora_abast",
      priority: 1,
      keywords: [
        "rentadora", "rentaplats", "rentavaixelles", "nevera", "frigorific",
        "televisor", "microones", "electrodomestic", "electrodomestics"
      ],
      response:
        "Piricat Energies es dedica a lampisteria i electricitat (fuites, avaries elèctriques, calderes, quadres...), però no reparem " +
        "electrodomèstics com rentadores, rentavaixelles, neveres, televisors o microones. Et recomanem contactar amb un servei tècnic " +
        "especialitzat en aquest tipus d'aparells."
    },

    {
      id: "serveis",
      etiqueta: "Serveis",
      cta: true,
      keywords: [
        // Genèric
        "servei", "serveis", "lampisteria", "electricitat", "fuita", "avaria", "avaries",
        "quadre", "caldera", "reparacio",
        // Lampisteria / calefacció / aigua calenta
        "radiador", "calefaccio", "aigua calenta", "termo", "boiler", "acs", "pressio",
        // Electricitat (mencions genèriques, no urgents)
        "diferencial", "magnetotermic", "icp", "fusible", "ploms", "endoll", "interruptor",
        // Calderes
        "cremador", "gas", "gasoil",
        // Instal·lacions noves (amb variants habituals, amb i sense "l·l")
        "instalacio", "installacio",
        // Variants amb faltes d'ortografia habituals
        "lamplisteria", "lampsteria", "eletricitat", "electrisista", "electricitad", "calderaa"
      ],
      response:
        "Fem lampisteria i electricitat: fuites, avaries de caldera, calefacció, aigua calenta, quadres elèctrics, talls de subministrament, " +
        "instal·lacions noves i manteniment per a habitatges, allotjaments turístics i refugis d'alta muntanya."
    },

    // Tema de MANTENIMENT PREVENTIU, diferenciat del servei reactiu (avaries).
    {
      id: "manteniment",
      etiqueta: "Manteniment",
      cta: true,
      keywords: ["revisio", "manteniment", "inspeccio"],
      response:
        "Oferim contractes i revisions periòdiques de manteniment per a instal·lacions de lampisteria, electricitat i calderes, " +
        "per detectar i prevenir avaries abans que passin."
    },

    // Comarques a nivell general. Els noms de poblacions concretes (Tremp,
    // Vielha, Igualada...) NO van aquí: es gestionen amb el seu propi
    // detector (vegeu POBLACIONS_COBERTES / POBLACIONS_FORA_COBERTURA), que
    // dona una resposta molt més precisa i evita duplicar informació.
    {
      id: "comarques",
      etiqueta: "Cobertura",
      keywords: [
        "comarca", "comarques", "cobertura", "zona",
        "aran", "ribagorca", "jussa", "sobira", "urgell", "andorra"
      ],
      response:
        "Cobrim 6 comarques amb magatzem propi a cadascuna: Val d'Aran (Vielha), Alta Ribagorça (El Pont de Suert), Pallars Jussà (Tremp), " +
        "Pallars Sobirà (Sort — seu central), Alt Urgell (La Seu d'Urgell) i Andorra (Andorra la Vella)."
    },

    {
      id: "cua",
      etiqueta: "Com funciona",
      keywords: [
        "cua", "com funciona", "quan vindra", "temps d'espera", "espera", "tecnic", "quant triga",
        "quan arribareu", "quant trigareu", "quant tardareu"
      ],
      response:
        "Sistema Smart-Queue: truques a la central, mirem si el tècnic de la teva comarca està lliure. Si ho està, ve en menys d'una hora. " +
        "Si està ocupat, entres a la seva cua i et confirmem des del mòbil del tècnic quin dia vindrà."
    },

    // Tema d'ASSISTÈNCIA: l'usuari demana ajuda de forma genèrica o vol
    // gestionar la petició d'un tècnic. La resposta ja inclou el telèfon,
    // per això `cta` no cal (afegirCridaAccio no duplica el telèfon).
    {
      id: "assistencia",
      etiqueta: "Assistència",
      keywords: [
        "em podeu ajudar", "necessito ajuda", "necessito un tecnic", "vull demanar un tecnic",
        "vull una visita", "necessito servei", "necessito un professional", "voldria un tecnic",
        "podeu enviar un tecnic", "puc demanar un tecnic", "com demano un tecnic"
      ],
      response:
        "Sí, podem ajudar-te! 🙌 Piricat Energies gestiona la petició de tècnics de lampisteria i electricitat a tot el Pirineu. " +
        "Si vols tramitar una visita, el més ràpid és trucar-nos al 📞 " + TELEFON + " i t'expliquem com funciona la cua de tècnics."
    },

    {
      id: "preu",
      etiqueta: "Pressupost",
      keywords: ["preu", "preus", "cost", "pressupost", "quant costa", "quant val", "tarifa"],
      response:
        "El preu depèn del tipus de feina i la comarca. Truca'ns al " + TELEFON + " i et donem un pressupost sense compromís."
    },

    {
      id: "horari",
      etiqueta: "Horari",
      keywords: ["horari", "hora", "obert", "obrim", "tancat", "quan obriu"],
      response:
        "La centraleta de Sort atén trucades els 7 dies de la setmana per coordinar els tècnics de cada comarca. Truca'ns i t'atendrem."
    },

    {
      id: "contacte",
      etiqueta: "Contacte",
      keywords: ["contacte", "contactar", "telefon", "trucar", "email", "correu"],
      response: "Pots contactar-nos per telèfon: 📞 " + TELEFON + ". És un únic número per a tot el Pirineu."
    },

    {
      id: "central",
      etiqueta: "Ubicació",
      keywords: ["central", "seu", "on sou", "adreça", "adreca", "ubicacio", "on esteu ubicats"],
      response: "La nostra central és a Sort, Pallars Sobirà, però tenim tècnics i magatzem a les 6 comarques que cobrim."
    },

    // Tema TURISME: a banda d'informar, afegeix la frase comercial que
    // recorda que també atenem hotels, cases rurals, etc. (punt 7).
    {
      id: "turisme",
      etiqueta: "Hotels i allotjaments",
      cta: true,
      keywords: [
        "hotel", "apartament turistic", "casa rural", "allotjament", "bungalow", "camping", "refugi"
      ],
      response:
        "A banda d'habitatges particulars, Piricat Energies també ofereix manteniment de lampisteria i electricitat per a hotels, " +
        "apartaments turístics, cases rurals, bungalows i refugis, per garantir que les instal·lacions estiguin sempre operatives."
    },

    {
      id: "comiat",
      etiqueta: "Comiat",
      keywords: ["gracies", "adeu", "adeu siau", "fins aviat", "bye"],
      response: "Gràcies a tu! Si necessites un tècnic, truca'ns al " + TELEFON + ". Fins aviat! 👋"
    }

    /* ───────── PLANTILLA D'EXEMPLE — descomenta i omple per afegir un tema nou ─────────
    ,{
      id: "plaques_solars",
      etiqueta: "Plaques solars",
      keywords: ["placa solar", "plaques solars", "fotovoltaica", "panells solars", "autoconsum"],
      response: "Text real del servei de plaques solars (omplir amb informació certa de l'empresa)."
    }
    ──────────────────────────────────────────────────────────────────────────────────── */
  ];

  // ─────────────────────────────────────────────
  //  POBLACIONS: comprovació de cobertura per nom concret
  //  ⚠️ Dades d'exemple: cal revisar-les/completar-les amb el llistat
  //  real de poblacions ateses per Piricat abans de publicar-ho.
  //  S'exclouen expressament noms de poble que coincideixen amb paraules
  //  catalanes molt comunes (p. ex. "Les", a la Val d'Aran) per evitar
  //  falsos positius amb el detector de paraules clau.
  // ─────────────────────────────────────────────
  const POBLACIONS_COBERTES = [
    { clau: "vielha", mostrar: "Vielha" },
    { clau: "bossost", mostrar: "Bossòst" },
    { clau: "salardu", mostrar: "Salardú" },
    { clau: "pont de suert", mostrar: "el Pont de Suert" },
    { clau: "vilaller", mostrar: "Vilaller" },
    { clau: "tremp", mostrar: "Tremp" },
    { clau: "talarn", mostrar: "Talarn" },
    { clau: "sort", mostrar: "Sort" },
    { clau: "rialp", mostrar: "Rialp" },
    { clau: "llavorsi", mostrar: "Llavorsí" },
    { clau: "seu d'urgell", mostrar: "la Seu d'Urgell" },
    { clau: "organya", mostrar: "Organyà" },
    { clau: "oliana", mostrar: "Oliana" },
    { clau: "andorra la vella", mostrar: "Andorra la Vella" },
    { clau: "escaldes", mostrar: "Escaldes-Engordany" },
    { clau: "encamp", mostrar: "Encamp" },
    { clau: "massana", mostrar: "la Massana" }
  ];

  const POBLACIONS_FORA_COBERTURA = [
    { clau: "igualada", mostrar: "Igualada" },
    { clau: "lleida", mostrar: "Lleida" },
    { clau: "barcelona", mostrar: "Barcelona" },
    { clau: "girona", mostrar: "Girona" },
    { clau: "tarragona", mostrar: "Tarragona" },
    { clau: "manresa", mostrar: "Manresa" },
    { clau: "vic", mostrar: "Vic" },
    { clau: "reus", mostrar: "Reus" }
  ];

  // Paraules que permeten a la memòria de conversa deduir quin tipus
  // d'immoble gestiona l'usuari (vegeu memòria de conversa, punt 9).
  const PARAULES_TIPUS_IMMOBLE = [
    { clau: "hotel", mostrar: "hotel" },
    { clau: "apartament turistic", mostrar: "apartament turístic" },
    { clau: "casa rural", mostrar: "casa rural" },
    { clau: "allotjament", mostrar: "allotjament turístic" },
    { clau: "bungalow", mostrar: "bungalow" },
    { clau: "camping", mostrar: "càmping" },
    { clau: "refugi", mostrar: "refugi" }
  ];

  // Resposta quan NO es detecta cap tema (missatge no reconegut). To de veu
  // comercial: convida a preguntar per categories concretes i, si la
  // consulta és massa complexa, deriva a l'assistent de Telegram amb un
  // enllaç totalment clicable (obre l'app o el web de Telegram directament).
  const RESPOSTA_ZERO_COINCIDENCIES =
    "No acabo d'entendre exactament què necessites. 🤔<br><br>" +
    "Pots preguntar-me sobre:<br>" +
    "• Lampisteria<br>" +
    "• Electricitat<br>" +
    "• Calderes<br>" +
    "• Cobertura per poblacions<br>" +
    "• Hotels i cases rurals<br>" +
    "• Horaris<br>" +
    "• Pressupostos<br><br>" +
    "Si la consulta és una mica més complexa, et recomano parlar amb el nostre assistent avançat de Telegram, que utilitza intel·ligència " +
    "artificial i pot mantenir una conversa molt més completa.<br>" +
    "👉 <a href=\"" + TELEGRAM_URL + "\" target=\"_blank\" rel=\"noopener\">" + TELEGRAM_URL + "</a>";

  // Resposta quan es detecten MASSA temes diferents alhora (xarxa de
  // seguretat, vegeu CONFIG.TEMES_MAXIM_ABSOLUT). Enllaç clicable igual que
  // a RESPOSTA_ZERO_COINCIDENCIES.
  const RESPOSTA_AMBIGUA =
    "Aquesta consulta és una mica més complexa del que puc interpretar amb seguretat. 🤔<br><br>" +
    "Et recomano parlar amb el nostre assistent avançat de Telegram: utilitza intel·ligència artificial, entén preguntes complexes i pot " +
    "mantenir una conversa molt més completa.<br>" +
    "👉 <a href=\"" + TELEGRAM_URL + "\" target=\"_blank\" rel=\"noopener\">" + TELEGRAM_URL + "</a>";

  // Suggeriment SUAU (no obligatori) que s'afegeix al final d'una resposta
  // combinada quan té molts blocs (vegeu CONFIG.TEMES_AVIS_TELEGRAM i
  // afegirSuggerimentTelegramSiCal). A diferència de RESPOSTA_AMBIGUA, aquí
  // la consulta SÍ que s'ha respost sencera; només es recomana Telegram per
  // si l'usuari vol aprofundir més. Enllaç clicable igual que la resta.
  const SUGGERIMENT_TELEGRAM_SUAU =
    "Si vols una resposta més detallada o tens una consulta més específica, també pots parlar amb el nostre assistent avançat de Telegram: " +
    "👉 <a href=\"" + TELEGRAM_URL + "\" target=\"_blank\" rel=\"noopener\">" + TELEGRAM_URL + "</a>";

  // ─────────────────────────────────────────────
  //  MOTOR DE CLASSIFICACIÓ
  //  Sistema tolerant per paraula (no és IA): normalitza, separa el
  //  missatge en paraules ("tokens") i redueix cadascuna a una arrel
  //  aproximada perquè singular/plural i masculí/femení habituals
  //  coincideixin (p. ex. "horari"/"horaris", "caldera"/"calderes",
  //  "pressupost"/"pressupostos", "reparació"/"reparacions"). Les faltes
  //  d'ortografia dels exemples (lamplisteria, eletricitat...) es
  //  continuen cobrint com a paraules clau explícites, ja que no segueixen
  //  cap patró previsible.
  // ─────────────────────────────────────────────

  /**
   * Normalitza un text per fer-lo comparable: minúscules, sense accents,
   * sense el punt volat (l·l → ll) i amb els apòstrofs tipogràfics
   * uniformitzats.
   */
  function normalitzar(text) {
    return text
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[’‘]/g, "'")
      .replace(/·/g, "")
      .trim();
  }

  /**
   * Divideix un text normalitzat en paraules ("tokens"): seqüències de
   * lletres/xifres (i apòstrofs, per mantenir contraccions com "s'ha").
   * Qualsevol altre caràcter (espais, guions, signes de puntuació...)
   * actua com a separador.
   */
  function tokenitzar(text) {
    const norm = normalitzar(text);
    return norm.match(/[a-z0-9']+/g) || [];
  }

  /**
   * Redueix una paraula a una arrel aproximada aplicant només els patrons
   * de plural/femení més habituals en català. No és un stemmer lingüístic
   * complet: només busca fer que exemples com horari/horaris,
   * caldera/calderes, pressupost/pressupostos o reparació/reparacions
   * coincideixin, sense cap dependència ni lògica complexa.
   */
  function reduirParaula(paraula) {
    if (paraula.length <= 3) return paraula; // paraules curtes: no tocar (evita falsos positius)

    if (paraula.endsWith("cions")) {
      const candidata = paraula.slice(0, -5) + "cio"; // reparacions → reparacio
      if (candidata.length >= 3) return candidata;
    }
    if (paraula.endsWith("es")) {
      const candidata = paraula.slice(0, -2) + "a"; // calderes → caldera
      if (candidata.length >= 3) return candidata;
    }
    if (paraula.endsWith("os")) {
      const candidata = paraula.slice(0, -2); // pressupostos → pressupost
      if (candidata.length >= 3) return candidata;
    }
    if (paraula.endsWith("s")) {
      const candidata = paraula.slice(0, -1); // horaris → horari, tècnics → tècnic
      if (candidata.length >= 3) return candidata;
    }
    return paraula;
  }

  /**
   * Aplica reduirParaula a cada token d'una llista.
   */
  function reduirTokens(tokens) {
    return tokens.map(reduirParaula);
  }

  /**
   * Prepara qualsevol text (paraula clau, població, o missatge de
   * l'usuari) com un array d'arrels llest per comparar amb conteSequencia.
   */
  function prepararArrels(text) {
    return reduirTokens(tokenitzar(text));
  }

  /**
   * Comprova si `arrelsCercades` apareix com a seqüència contigua dins
   * d'`arrelsMissatge` (mateix ordre, un rere l'altre). Fa la mateixa
   * feina que abans feia una regex amb límits de paraula (\b...\b), però
   * comparant arrels ja reduïdes en lloc de text literal.
   */
  function conteSequencia(arrelsMissatge, arrelsCercades) {
    if (arrelsCercades.length === 0) return false;
    for (let i = 0; i <= arrelsMissatge.length - arrelsCercades.length; i++) {
      let coincideix = true;
      for (let j = 0; j < arrelsCercades.length; j++) {
        if (arrelsMissatge[i + j] !== arrelsCercades[j]) {
          coincideix = false;
          break;
        }
      }
      if (coincideix) return true;
    }
    return false;
  }

  /**
   * Precompila totes les paraules clau de la base de coneixement en
   * arrels UNA SOLA VEGADA en carregar el script, en lloc de recalcular-les
   * a cada missatge de l'usuari (millor rendiment).
   */
  function precompilarBaseConeixement(base) {
    return base.map(function (tema) {
      return Object.assign({}, tema, {
        arrelsPerKeyword: tema.keywords.map(prepararArrels)
      });
    });
  }

  /**
   * Precompila una llista de { clau, mostrar } (poblacions, tipus
   * d'immoble...) afegint-hi les arrels corresponents a `clau`.
   */
  function precompilarLlistaAmbClau(llista) {
    return llista.map(function (element) {
      return Object.assign({}, element, { arrels: prepararArrels(element.clau) });
    });
  }

  const BASE_COMPILADA = precompilarBaseConeixement(BASE_CONEIXEMENT);
  const POBLACIONS_COBERTES_COMPILADES = precompilarLlistaAmbClau(POBLACIONS_COBERTES);
  const POBLACIONS_FORA_COBERTURA_COMPILADES = precompilarLlistaAmbClau(POBLACIONS_FORA_COBERTURA);
  const PARAULES_TIPUS_IMMOBLE_COMPILADES = precompilarLlistaAmbClau(PARAULES_TIPUS_IMMOBLE);

  /**
   * Retorna tots els temes de la base de coneixement que coincideixen amb
   * les arrels del missatge, sense duplicar-ne el text de resposta.
   */
  function detectarTemes(missatgeArrels) {
    const trobats = [];
    const respostesVistes = new Set();

    for (const tema of BASE_COMPILADA) {
      const coincideix = tema.arrelsPerKeyword.some(function (arrelsKeyword) {
        return conteSequencia(missatgeArrels, arrelsKeyword);
      });
      if (coincideix && !respostesVistes.has(tema.response)) {
        trobats.push(tema);
        respostesVistes.add(tema.response);
      }
    }
    return trobats;
  }

  /**
   * Comprova si el missatge esmenta una població coneguda, dins o fora de
   * la zona de cobertura. Retorna { trobada: false } si no en detecta cap.
   */
  function detectarPoblacio(missatgeArrels) {
    for (const p of POBLACIONS_COBERTES_COMPILADES) {
      if (conteSequencia(missatgeArrels, p.arrels)) {
        return { trobada: true, coberta: true, mostrar: p.mostrar };
      }
    }
    for (const p of POBLACIONS_FORA_COBERTURA_COMPILADES) {
      if (conteSequencia(missatgeArrels, p.arrels)) {
        return { trobada: true, coberta: false, mostrar: p.mostrar };
      }
    }
    return { trobada: false };
  }

  /**
   * Detecta si el missatge esmenta un tipus d'immoble/allotjament conegut
   * (hotel, casa rural...). Retorna el nom a mostrar o null.
   */
  function detectarTipusImmoble(missatgeArrels) {
    for (const p of PARAULES_TIPUS_IMMOBLE_COMPILADES) {
      if (conteSequencia(missatgeArrels, p.arrels)) {
        return p.mostrar;
      }
    }
    return null;
  }

  /**
   * Genera un "tema" dinàmic (mateix format que els de BASE_CONEIXEMENT) a
   * partir del resultat de detectarPoblacio, amb una resposta personalitzada
   * segons si la població és o no dins de la zona de cobertura.
   */
  function crearTemaPoblacio(resultatPoblacio) {
    if (!resultatPoblacio.trobada) {
      return null;
    }
    if (resultatPoblacio.coberta) {
      return {
        id: "poblacio_coberta",
        etiqueta: "Cobertura",
        cta: true,
        response: "Sí, treballem a " + resultatPoblacio.mostrar + "! 👍 És dins la nostra zona de cobertura habitual."
      };
    }
    return {
      id: "poblacio_fora_cobertura",
      etiqueta: "Cobertura",
      cta: false,
      response:
        "Actualment no donem servei directe a " + resultatPoblacio.mostrar + ", ja que ens centrem al Pirineu " +
        "(Val d'Aran, Alta Ribagorça, Pallars Jussà, Pallars Sobirà, Alt Urgell) i Andorra. Si tens una propietat en aquesta " +
        "zona igualment, truca'ns al " + TELEFON + " i mirem què podem fer."
    };
  }

  // ─────────────────────────────────────────────
  //  MEMÒRIA DE CONVERSA (sense IA, sense API)
  //  Guarda només dades bàsiques mentre dura la conversa: població,
  //  tipus d'immoble i si és/coneix un allotjament turístic. Es manté
  //  en memòria (variable JS), NOMÉS durant la sessió actual del xat;
  //  no es desa a localStorage per simplicitat i per no conservar dades
  //  personals més enllà de la conversa oberta.
  // ─────────────────────────────────────────────

  /**
   * Crea l'objecte de memòria buit amb el qual comença cada conversa nova.
   */
  function crearMemoriaBuida() {
    return { poblacio: null, coberta: null, tipusImmoble: null };
  }

  /**
   * Actualitza la memòria de conversa amb qualsevol dada nova detectada
   * en el missatge actual (no esborra dades anteriors si aquest missatge
   * no en conté de noves).
   */
  function actualitzarMemoria(resultatPoblacio, tipusImmobleDetectat, memoria) {
    if (resultatPoblacio.trobada) {
      memoria.poblacio = resultatPoblacio.mostrar;
      memoria.coberta = resultatPoblacio.coberta;
    }
    if (tipusImmobleDetectat) {
      memoria.tipusImmoble = tipusImmobleDetectat;
    }
  }

  /**
   * Si el missatge actual demana assistència/tècnic i ja sabem, per un
   * missatge anterior, la població (i opcionalment el tipus d'immoble) de
   * l'usuari, ho recorda a la resposta. No s'aplica si el propi missatge
   * ja esmenta una població (per no ser redundant).
   */
  function afegirRecordatoriMemoria(text, temes, memoria) {
    const teAssistencia = temes.some(function (t) { return t.id === "assistencia"; });
    const jaEsmentaPoblacioAra = temes.some(function (t) {
      return t.id === "poblacio_coberta" || t.id === "poblacio_fora_cobertura";
    });

    if (!teAssistencia || jaEsmentaPoblacioAra) {
      return text;
    }

    const parts = [];
    if (memoria.poblacio) parts.push("que ets a " + memoria.poblacio);
    if (memoria.tipusImmoble) parts.push("que gestiones un/a " + memoria.tipusImmoble);
    if (parts.length === 0) {
      return text;
    }

    return text + "<br><br>📍 Per cert, ja sé " + parts.join(" i ") + ". Ho tindrem en compte per assignar-te tècnic.";
  }

  // ─────────────────────────────────────────────
  //  CONSTRUCCIÓ DE LA RESPOSTA
  // ─────────────────────────────────────────────

  /**
   * Construeix una resposta única i llegible a partir de diversos temes
   * detectats en el mateix missatge, amb una capçalera per bloc perquè es
   * llegeixi bé encara que hi hagi molts temes junts:
   *   🔹 Cobertura
   *   ...
   *   🔹 Horari
   *   ...
   */
  function construirRespostaCombinada(temes) {
    const intro = "Vas amb diverses preguntes alhora, aquí ho tens per parts! 😊<br><br>";
    const blocs = temes
      .map(function (tema) {
        const etiqueta = tema.etiqueta || "Info";
        return "🔹 <strong>" + etiqueta + "</strong><br>" + tema.response;
      })
      .join("<br><br>");
    return intro + blocs;
  }

  /**
   * Afegeix la crida a l'acció comercial estàndard si algun dels temes
   * mostrats la sol·licita (`cta: true`) i el text encara no esmenta el
   * telèfon (per evitar repetir-lo dues vegades).
   */
  function afegirCridaAccio(text, temes) {
    const calCrida = temes.some(function (t) { return t.cta; });
    if (calCrida && text.indexOf(TELEFON) === -1) {
      return text + "<br><br>" + CRIDA_ACCIO;
    }
    return text;
  }

  /**
   * Si la resposta combinada té molts blocs (CONFIG.TEMES_AVIS_TELEGRAM),
   * afegeix un suggeriment SUAU de Telegram al final. No deriva ni
   * substitueix la resposta: només la complementa.
   */
  function afegirSuggerimentTelegramSiCal(text, temes) {
    if (temes.length > CONFIG.TEMES_AVIS_TELEGRAM) {
      return text + "<br><br>" + SUGGERIMENT_TELEGRAM_SUAU;
    }
    return text;
  }

  /**
   * Decideix quina resposta final donar en funció dels temes detectats i
   * de la seva prioritat. El NOMBRE de temes ja NO és el criteri
   * principal: un missatge amb diversos temes clars es respon sencer.
   * Ordre de decisions:
   *   1. Cap tema             → resposta de "no identificat" (convida a Telegram)
   *   2. Tema prioritari       → guanya sempre, ignora la resta (urgències, fora d'abast)
   *   3. Massa temes alhora    → xarxa de seguretat (TEMES_MAXIM_ABSOLUT): missatge caòtic, deriva a Telegram
   *   4. Un o més temes normals → resposta directa o combinada (+ CTA + memòria)
   *      · Amb molts blocs (TEMES_AVIS_TELEGRAM) s'afegeix un suggeriment
   *        NO obligatori de Telegram per a més detall.
   */
  function construirRespostaFinal(temes, memoria) {
    if (temes.length === 0) {
      return RESPOSTA_ZERO_COINCIDENCIES;
    }

    const prioritatMaxima = Math.max.apply(null, temes.map(function (t) { return t.priority || 0; }));
    if (prioritatMaxima > 0) {
      const temaPrioritari = temes.find(function (t) { return (t.priority || 0) === prioritatMaxima; });
      return temaPrioritari.response;
    }

    if (temes.length > CONFIG.TEMES_MAXIM_ABSOLUT) {
      return RESPOSTA_AMBIGUA;
    }

    let text = temes.length === 1 ? temes[0].response : construirRespostaCombinada(temes);
    text = afegirCridaAccio(text, temes);
    text = afegirRecordatoriMemoria(text, temes, memoria);
    text = afegirSuggerimentTelegramSiCal(text, temes);
    return text;
  }

  /**
   * Punt d'entrada del motor: rep el missatge original de l'usuari i
   * l'objecte de memòria de la conversa actual, actualitza la memòria amb
   * qualsevol dada nova i retorna l'HTML de la resposta a mostrar.
   */
  function obtenirResposta(missatgeOriginal, memoria) {
    memoria = memoria || crearMemoriaBuida();
    const missatgeArrels = prepararArrels(missatgeOriginal);

    const resultatPoblacio = detectarPoblacio(missatgeArrels);
    const tipusImmobleDetectat = detectarTipusImmoble(missatgeArrels);
    actualitzarMemoria(resultatPoblacio, tipusImmobleDetectat, memoria);

    const temes = detectarTemes(missatgeArrels);
    const temaPoblacio = crearTemaPoblacio(resultatPoblacio);
    if (temaPoblacio) {
      temes.push(temaPoblacio);
    }

    return construirRespostaFinal(temes, memoria);
  }

  // ─────────────────────────────────────────────
  //  UI DEL WIDGET (sense canvis respecte a la versió original)
  // ─────────────────────────────────────────────
  function crearWidget() {
    const wrap = document.createElement("div");
    wrap.id = "piricat-chat-widget";
    wrap.innerHTML = `
      <button id="pcw-toggle" aria-label="Obrir xat d'ajuda">💬</button>
      <div id="pcw-panel" class="pcw-hidden">
        <div class="pcw-header">
          <div>
            <strong>Assistent Piricat</strong>
            <span>Resposta automàtica</span>
          </div>
          <button id="pcw-close" aria-label="Tancar xat">✕</button>
        </div>
        <div id="pcw-messages"></div>
        <a id="pcw-telegram" href="${TELEGRAM_URL}" target="_blank" rel="noopener">
          🤖 Parla amb el nostre assistent avançat per Telegram
        </a>
        <form id="pcw-form">
          <input id="pcw-input" type="text" placeholder="Escriu la teva pregunta..." autocomplete="off" required>
          <button type="submit">➤</button>
        </form>
      </div>
    `;
    document.body.appendChild(wrap);

    const toggle = wrap.querySelector("#pcw-toggle");
    const panel = wrap.querySelector("#pcw-panel");
    const close = wrap.querySelector("#pcw-close");
    const form = wrap.querySelector("#pcw-form");
    const input = wrap.querySelector("#pcw-input");
    const messages = wrap.querySelector("#pcw-messages");

    // Memòria de la conversa actual (vegeu secció "MEMÒRIA DE CONVERSA").
    // Es crea un sol cop en obrir el widget i es va actualitzant a cada
    // missatge de l'usuari mentre la pàgina estigui oberta.
    const memoriaConversa = crearMemoriaBuida();

    function afegirMissatge(text, autor) {
      const bombolla = document.createElement("div");
      bombolla.className = "pcw-msg pcw-" + autor;
      bombolla.innerHTML = text;
      messages.appendChild(bombolla);
      messages.scrollTop = messages.scrollHeight;
    }

    function obrir() {
      panel.classList.remove("pcw-hidden");
      toggle.classList.add("pcw-hidden-btn");
      if (!messages.dataset.iniciat) {
        afegirMissatge(
          "Hola! Sóc l'assistent virtual de Piricat Energies. En què et puc ajudar? 😊",
          "bot"
        );
        messages.dataset.iniciat = "1";
      }
      input.focus();
    }

    function tancar() {
      panel.classList.add("pcw-hidden");
      toggle.classList.remove("pcw-hidden-btn");
    }

    toggle.addEventListener("click", obrir);
    close.addEventListener("click", tancar);

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      const text = input.value.trim();
      if (!text) return;
      afegirMissatge(text, "user");
      input.value = "";
      setTimeout(function () {
        afegirMissatge(obtenirResposta(text, memoriaConversa), "bot");
      }, 300);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", crearWidget);
  } else {
    crearWidget();
  }
})();
