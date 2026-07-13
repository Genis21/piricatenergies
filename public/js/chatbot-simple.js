/**
 * PIRICAT ENERGIES — chatbot-simple.js
 * Versió "senzilla" del xatbot: funciona 100% al navegador, sense cap
 * petició al servidor ni cap cost d'API. Busca paraules clau al missatge
 * de la persona i respon amb un text predefinit.
 *
 * Avantatges: gratuït, instantani, sense dependències.
 * Límits: només reconeix les preguntes que ja has previst aquí sota.
 */

// ⚠️ CANVIA aquest número/enllaç pel canal real on vols que la gent
// escrigui quan el xat no sap respondre (WhatsApp, Telegram, telèfon...).
const PK_CONTACTE_URL = "tel:+34600000000";

const PK_RESPOSTES = [
  // Salutacions
  {
    claus: ["hola", "bon dia", "bona tarda", "bona nit", "hey", "ei", "hei", "bones"],
    resp: "Hola! 😊 Sóc l'assistent de Piricat Energies.\nEt puc ajudar amb avaries de lampisteria o electricitat, zones on treballem, horaris o com demanar un servei. Què necessites?"
  },

  // Serveis generals
  {
    claus: ["servei", "serveis", "que feu", "que oferiu", "a que us dediqueu", "oficis"],
    resp: "Fem dues coses principalment: 🔧\n\n• Lampisteria — fuites, aixetes, escalfadors, desguassos, instal·lacions de bany o cuina\n• Electricitat — avaries, quadres de llum, endolls, punts de llum, petites instal·lacions\n\nSobre quin dels dos et puc ajudar?"
  },

  // Lampisteria
  {
    claus: ["lampisteria", "lampista", "fuita", "fuites", "aigua", "aixeta", "aixetes", "escalfador", "desguas", "desguàs", "canonada", "canonades", "goteres"],
    resp: "Fem tot tipus de feines de lampisteria: 💧\n\n• Fuites d'aigua i canonades\n• Aixetes i sanitaris\n• Escalfadors d'aigua\n• Desguassos embussats\n• Instal·lacions de bany i cuina\n\nSi vols, digue'm la teva comarca i et diré quin tècnic t'atendrà!"
  },

  // Electricitat
  {
    claus: ["electricitat", "electricista", "llum", "llums", "quadre electric", "endoll", "endolls", "curtcircuit", "curt circuit", "apagada", "espurnes"],
    resp: "Fem tot tipus de feines d'electricitat: ⚡\n\n• Avaries elèctriques i talls de llum\n• Quadres elèctrics\n• Endolls i punts de llum\n• Petites instal·lacions noves\n\nSi és urgent (espurnes, olor a cremat, quadre que salta constantment), truca'ns directament millor que escriure!"
  },

  // Zones cobertes
  {
    claus: ["zona", "zones", "comarca", "comarques", "on treballeu", "on esteu", "cobertura", "pallars", "urgell", "ribagorça", "aran", "andorra"],
    resp: "Treballem a 6 zones del Pirineu, cadascuna amb el seu tècnic assignat: 📍\n\n• Pallars Sobirà (2 tècnics)\n• Pallars Jussà\n• Alt Urgell\n• Alta Ribagorça\n• Vall d'Aran\n• Andorra\n\nDigue'm la teva comarca i sabràs si tens tècnic assignat!"
  },

  // Com demanar un servei
  {
    claus: ["demanar", "sol·licitar", "sollicitar", "com funciona", "com ho faig", "necessito un tecnic", "necessito un tècnic", "vull un servei"],
    resp: "Demanar un servei és molt senzill: 🛠️\n\n1. Ens expliques l'avaria (per aquí, per telèfon o correu)\n2. El servei entra a la cua del tècnic de la teva comarca\n3. El tècnic et confirma el dia (avui, demà o un altre dia)\n4. Ve, resol l'avaria i llestos!\n\nVols que et passi el contacte directe?"
  },

  // Urgències
  {
    claus: ["urgent", "urgencia", "urgència", "urgencies", "urgències", "ara mateix", "immediat", "emergencia", "emergència"],
    resp: "Per a urgències (fuites importants, curtcircuits, espurnes, olor a cremat), el més ràpid és trucar directament: 📞\n\n" + PK_CONTACTE_URL.replace('tel:', '') + "\n\nAixí el tècnic de la teva zona et pot atendre com més aviat millor."
  },

  // Preus
  {
    claus: ["preu", "preus", "cost", "quant costa", "quant val", "val", "costa", "pressupost", "pressupostos"],
    resp: "El cost depèn de la feina concreta (no és el mateix una aixeta que gotea que un quadre elèctric nou). 💶\nExplica'ns l'avaria i et podrem donar un pressupost orientatiu abans de confirmar la visita."
  },

  // Horari
  {
    claus: ["horari", "horaris", "hora", "obrim", "obert", "tancat", "quan obriu", "quan tancau", "dilluns", "dissabte", "cap de setmana"],
    resp: "El nostre horari d'atenció és:\n\n🕙 Dilluns a divendres: 8h–19h\n\nPer a urgències fora d'horari, truca'ns igualment i mirarem d'atendre-t'ho."
  },
  // ⚠️ CONFIRMA aquest horari; substitueix-lo pel real del teu negoci.

  // Contacte
  {
    claus: ["contacte", "contactar", "telefon", "telèfon", "email", "correu", "parlar", "trucar", "whatsapp"],
    resp: "Pots contactar-nos per: ☎️\n\n📞 Telèfon: " + PK_CONTACTE_URL.replace('tel:', '') + "\n📧 Correu: info@piricatenergies.cat\n\nO fes servir aquest mateix xat per explicar-nos l'avaria!"
  },
  // ⚠️ CANVIA el telèfon i correu pels reals del negoci.

  // Agraïments / comiat
  {
    claus: ["gracies", "gràcies", "adeu", "adéu", "fins aviat", "bye", "hasta luego"],
    resp: "Gràcies a tu! 😊\nSi necessites res més, torna quan vulguis. Fins aviat! 👋"
  },
];

const PK_DEFAULT_MSG = `Ho sento, no he entès bé la pregunta. 🤔<br>Per a qualsevol dubte concret, truca'ns directament i t'atendrem de seguida.<br><br><a href="${PK_CONTACTE_URL}">📞 Trucar ara</a>`;

function pkNormalitzar(t) {
  return t.toLowerCase().trim()
    .replace(/[àáâ]/g, 'a').replace(/[èéê]/g, 'e').replace(/[ìíî]/g, 'i')
    .replace(/[òóô]/g, 'o').replace(/[ùúû]/g, 'u')
    .replace(/ï/g, 'i').replace(/ü/g, 'u').replace(/ç/g, 'c').replace(/l·l/g, 'll');
}

function pkObtenirResposta(msg) {
  const n = pkNormalitzar(msg);
  for (const bloc of PK_RESPOSTES) {
    for (const clau of bloc.claus) {
      const cn = pkNormalitzar(clau);
      if (new RegExp('\\b' + cn.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b').test(n)) {
        return { text: bloc.resp, html: false };
      }
    }
  }
  return { text: PK_DEFAULT_MSG, html: true };
}

let pkChatObert = false;
let pkSaludat = false;

function pkToggleChat() {
  pkChatObert = !pkChatObert;
  document.getElementById('pk-chat-window').classList.toggle('open', pkChatObert);
  document.getElementById('pk-chat-btn').classList.toggle('open', pkChatObert);
  document.getElementById('pk-notif-dot').style.display = 'none';
  if (pkChatObert && !pkSaludat) {
    pkSaludat = true;
    setTimeout(() => pkAfegirTyping(() => {
      pkAfegirMissatge('bot', "Hola! 👋 Sóc l'assistent de Piricat Energies.\nExplica'ns la teva avaria o pregunta'ns el que necessitis.", false);
    }), 400);
  }
  if (pkChatObert) setTimeout(() => document.getElementById('pk-input').focus(), 300);
}

function pkAfegirMissatge(qui, text, isHtml) {
  const div = document.createElement('div');
  div.className = 'pk-msg ' + qui;
  div.innerHTML = isHtml ? text : text.replace(/\n/g, '<br>');
  document.getElementById('pk-messages').appendChild(div);
  document.getElementById('pk-messages').scrollTop = 9999;
}

function pkAfegirTyping(callback) {
  const t = document.createElement('div');
  t.className = 'pk-typing';
  t.innerHTML = '<span></span><span></span><span></span>';
  document.getElementById('pk-messages').appendChild(t);
  document.getElementById('pk-messages').scrollTop = 9999;
  setTimeout(() => { t.remove(); callback(); }, 900);
}

function pkEnviar() {
  const input = document.getElementById('pk-input');
  const text = input.value.trim();
  if (!text) return;
  input.value = '';
  pkAfegirMissatge('user', text, false);
  const resp = pkObtenirResposta(text);
  setTimeout(() => pkAfegirTyping(() => pkAfegirMissatge('bot', resp.text, resp.html)), 150);
}

function pkSendQuick(text) {
  pkAfegirMissatge('user', text, false);
  const resp = pkObtenirResposta(text);
  setTimeout(() => pkAfegirTyping(() => pkAfegirMissatge('bot', resp.text, resp.html)), 150);
}
