/**
 * PIRICAT ENERGIES — chatbot.js
 * Assistent de xat basat en paraules clau (sense IA) per a la web pública.
 * Per a consultes més complexes, deriva l'usuari al bot de Telegram
 * @Piricat_bot, que sí que utilitza IA (Groq) amb memòria de conversa.
 * ---------------------------------------------------------------
 */

(function () {
  "use strict";

  const TELEGRAM_URL = "https://t.me/Piricat_bot";
  const TELEFON = "973 620 555";

  // ─────────────────────────────────────────────
  //  BASE DE RESPOSTES
  // ─────────────────────────────────────────────
  const RESPOSTES = [
    [
      ["hola", "bon dia", "bona tarda", "bona nit", "hey", "ei", "hei"],
      "Hola! Sóc l'assistent virtual de Piricat Energies. En què et puc ajudar? 😊<br>" +
      "Pots preguntar-me sobre serveis, comarques on treballem, urgències, horari o com funciona la petició d'un tècnic."
    ],
    [
      ["servei", "serveis", "lampisteria", "electricitat", "fuita", "avaria", "avaries", "quadre", "caldera", "reparacio", "reparació"],
      "Fem lampisteria i electricitat: fuites, avaries de caldera, quadres elèctrics, talls de subministrament, instal·lacions noves i manteniment " +
      "per a habitatges, allotjaments turístics i refugis d'alta muntanya."
    ],
    [
      ["comarca", "comarques", "aran", "vielha", "ribagorca", "ribagorça", "pont de suert", "jussa", "jussà", "tremp", "sobira", "sobirà", "sort", "urgell", "seu d'urgell", "andorra", "cobertura", "zona"],
      "Cobrim 6 comarques amb magatzem propi a cadascuna: Val d'Aran (Vielha), Alta Ribagorça (El Pont de Suert), Pallars Jussà (Tremp), " +
      "Pallars Sobirà (Sort — seu central), Alt Urgell (La Seu d'Urgell) i Andorra (Andorra la Vella)."
    ],
    [
      ["cua", "com funciona", "quan vindra", "quan vindrà", "temps d'espera", "espera", "tecnic", "tècnic", "quant triga"],
      "Sistema Smart-Queue: truques a la central, mirem si el tècnic de la teva comarca està lliure. Si ho està, ve en menys d'una hora. " +
      "Si està ocupat, entres a la seva cua i et confirmem des del mòbil del tècnic quin dia vindrà."
    ],
    [
      ["urgent", "urgencia", "urgència", "emergencia", "emergència", "24", "ara mateix"],
      "Per a urgències elèctriques o fuites greus, truca directament: 📞 " + TELEFON + ". Marquem l'avís com a urgent i prioritzem l'assignació del tècnic."
    ],
    [
      ["preu", "preus", "cost", "pressupost", "pressupost", "quant costa", "quant val", "tarifa"],
      "El preu depèn del tipus de feina i la comarca. Truca'ns al " + TELEFON + " i et donem un pressupost sense compromís."
    ],
    [
      ["horari", "hora", "obert", "obrim", "tancat", "quan obriu"],
      "La centraleta de Sort atén trucades els 7 dies de la setmana per coordinar els tècnics de cada comarca. Truca'ns i t'atendrem."
    ],
    [
      ["contacte", "contactar", "telefon", "telèfon", "trucar", "email", "correu"],
      "Pots contactar-nos per telèfon: 📞 " + TELEFON + ". És un únic número per a tot el Pirineu."
    ],
    [
      ["central", "seu", "on sou", "adreça", "adreca", "ubicacio", "ubicació"],
      "La nostra central és a Sort, Pallars Sobirà, però tenim tècnics i magatzem a les 6 comarques que cobrim."
    ],
    [
      ["gracies", "gràcies", "adeu", "adéu", "fins aviat", "bye"],
      "Gràcies a tu! Si necessites un tècnic, truca'ns al " + TELEFON + ". Fins aviat! 👋"
    ]
  ];

  const RESPOSTA_DEFAULT =
    "No he acabat d'entendre la pregunta. 🤔<br>" +
    "Pots preguntar-me sobre: serveis, comarques, com funciona la cua, urgències, horari o contacte.<br>" +
    "Per a consultes més concretes, prova el nostre assistent avançat de Telegram (botó de sota) o truca'ns al " + TELEFON + ".";

  function normalitzar(text) {
    return text
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim();
  }

  function obtenirResposta(missatge) {
    const norm = normalitzar(missatge);
    for (const [claus, resposta] of RESPOSTES) {
      for (const clau of claus) {
        const clauNorm = normalitzar(clau);
        const re = new RegExp("\\b" + clauNorm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b");
        if (re.test(norm)) return resposta;
      }
    }
    return RESPOSTA_DEFAULT;
  }

  // ─────────────────────────────────────────────
  //  UI DEL WIDGET
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
        afegirMissatge(obtenirResposta(text), "bot");
      }, 300);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", crearWidget);
  } else {
    crearWidget();
  }
})();
