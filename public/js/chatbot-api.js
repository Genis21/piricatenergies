/**
 * PIRICAT ENERGIES — chatbot-api.js
 * Versió "professional" del xatbot: cada missatge es respon a través del
 * servidor propi (POST /api/chat), que crida l'API real de Claude.
 *
 * Avantatges: entén preguntes formulades de qualsevol manera, manté context
 * de la conversa i no depèn de llistes de paraules clau.
 * Requisits: variable d'entorn ANTHROPIC_API_KEY configurada al servidor
 * (mai al navegador — la clau no ha de sortir mai del backend).
 */

// ⚠️ CANVIA aquest número/enllaç pel canal real de contacte de fallback.
const PK_CONTACTE_URL = "tel:+34600000000";

const PK_FALLBACK_MSG = `Ara mateix no puc respondre. Truca'ns directament i t'atendrem de seguida.<br><br><a href="${PK_CONTACTE_URL}">📞 Trucar ara</a>`;

// Historial de la conversa en memòria (es perd en recarregar la pàgina,
// que és el comportament correcte per a un xat d'atenció al client).
let pkHistory = [];

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

function pkMostrarTyping() {
  const t = document.createElement('div');
  t.className = 'pk-typing';
  t.id = 'pk-typing-indicator';
  t.innerHTML = '<span></span><span></span><span></span>';
  document.getElementById('pk-messages').appendChild(t);
  document.getElementById('pk-messages').scrollTop = 9999;
}

function pkAmagarTyping() {
  const t = document.getElementById('pk-typing-indicator');
  if (t) t.remove();
}

/** Crida el backend propi, que al seu torn crida l'API de Claude. */
async function pkDemanarResposta(missatge) {
  pkMostrarTyping();

  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: missatge, history: pkHistory }),
    });

    const data = await res.json();
    pkAmagarTyping();

    if (!res.ok) {
      console.error('Error del xatbot:', data.error);
      pkAfegirMissatge('bot', PK_FALLBACK_MSG, true);
      return;
    }

    pkAfegirMissatge('bot', data.reply, false);

    // Actualitzem l'historial perquè el bot recordi el context.
    pkHistory.push({ role: 'user', content: missatge });
    pkHistory.push({ role: 'assistant', content: data.reply });
  } catch (err) {
    console.error('Error de connexió amb el xatbot:', err);
    pkAmagarTyping();
    pkAfegirMissatge('bot', PK_FALLBACK_MSG, true);
  }
}

function pkEnviar() {
  const input = document.getElementById('pk-input');
  const text = input.value.trim();
  if (!text) return;
  input.value = '';
  pkAfegirMissatge('user', text, false);
  pkDemanarResposta(text);
}

function pkSendQuick(text) {
  pkAfegirMissatge('user', text, false);
  pkDemanarResposta(text);
}
