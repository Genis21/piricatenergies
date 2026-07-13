/**
 * PIRICAT ENERGIES — Sistema de gestió de cues i incidències en temps real
 * ---------------------------------------------------------------------
 * Backend Node.js / Express.
 *
 * Tot l'estat viu en memòria (arrays JS). No hi ha base de dades perquè
 * l'objectiu és un prototip funcional immediat; el dia que calgui persistència
 * només cal substituir els arrays `technicians` i `services` per consultes
 * a una BD real, la resta de lògica no canvia.
 */

const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Ruta absoluta: evita el "Cannot GET /..." quan el procés s'executa des
// d'un working directory diferent (com passa en plataformes com Render).
app.use(express.static(path.join(__dirname, 'public')));

// L'arrel "/" no té cap fitxer propi: redirigim al panell de la gestora.
app.get('/', (req, res) => {
  res.redirect('/privat.html');
});

// ---------------------------------------------------------------------------
// 1. DADES MESTRES: TÈCNICS I ZONES
// ---------------------------------------------------------------------------
// Cada tècnic té assignades una o més comarques. Quan la gestora crea un
// servei per a una comarca concreta, el sistema busca automàticament quin
// tècnic la té assignada i li envia el tiquet a la seva cua.

const technicians = [
  { id: 1, name: 'Jordi Mir', role: 'Lampista', zones: ['Pallars Sobirà'] },
  { id: 2, name: 'Anna Solé', role: 'Electricista', zones: ['Pallars Sobirà'] },
  { id: 3, name: 'Ferran Costa', role: 'Lampista / Electricista', zones: ['Andorra'] },
  { id: 4, name: 'Laia Pujol', role: 'Electricista', zones: ['Alt Urgell'] },
  { id: 5, name: 'Martí Areny', role: 'Lampista', zones: ['Alta Ribagorça'] },
  { id: 6, name: 'Núria Farré', role: 'Electricista', zones: ['Pallars Jussà'] },
  { id: 7, name: 'Guillem Barrau', role: 'Lampista / Electricista', zones: ["Vall d'Aran"] },
];

// Llista de totes les comarques disponibles al formulari de la gestora, sense
// duplicats (el Pallars Sobirà té 2 tècnics assignats, però només ha
// d'aparèixer un cop al desplegable).
const ALL_ZONES = [...new Set(technicians.flatMap((t) => t.zones))];

const DAY_OPTIONS = ['Avui', 'Demà', 'Altre dia'];
const STATUS = { PENDENT: 'pendent', EN_PROCES: 'en_proces', FET: 'fet' };

// ---------------------------------------------------------------------------
// 2. ESTAT: SERVEIS (TIQUETS)
// ---------------------------------------------------------------------------
// Cada servei desa `createdAt` (mil·lisegons) en el moment de la seva creació.
// Aquest camp és la clau de tota la regla FIFO: mai s'esborra ni es recalcula,
// per tant l'ordre d'arribada real queda sempre garantit, independentment del
// dia que el tècnic triï per fer la feina.

/** @type {Array<Object>} */
let services = [];

// ---------------------------------------------------------------------------
// UTILITATS
// ---------------------------------------------------------------------------

/** Tots els tècnics que cobreixen una comarca (normalment 1, però el Pallars
 *  Sobirà en té 2: Jordi Mir i Anna Solé). */
function findTechniciansForZone(zone) {
  return technicians.filter((t) => t.zones.includes(zone));
}

/** Nombre de serveis actius d'un tècnic (pendents + en procés), per repartir
 *  la feina de forma equilibrada quan una zona té més d'un tècnic. */
function workloadForTechnician(technicianId) {
  return services.filter(
    (s) => s.technicianId === technicianId && s.status !== STATUS.FET
  ).length;
}

/**
 * Tria a quin tècnic s'assigna un servei nou d'una zona concreta.
 * Si només hi ha un tècnic a la zona, és directe. Si n'hi ha diversos
 * (p. ex. Pallars Sobirà), s'assigna al que tingui menys feina activa
 * en aquell moment; en cas d'empat, guanya l'ordre de la llista.
 */
function assignTechnicianForZone(zone) {
  const candidates = findTechniciansForZone(zone);
  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0];

  return candidates.reduce((least, current) =>
    workloadForTechnician(current.id) < workloadForTechnician(least.id) ? current : least
  );
}

/** Retorna els serveis pendents d'un tècnic ordenats per data de creació ASC. */
function pendingQueueForTechnician(technicianId) {
  return services
    .filter((s) => s.technicianId === technicianId && s.status === STATUS.PENDENT)
    .sort((a, b) => a.createdAt - b.createdAt);
}

/** Servei que el tècnic té actualment "en procés" (com a màxim n'hi hauria d'haver un). */
function activeServiceForTechnician(technicianId) {
  return services.find((s) => s.technicianId === technicianId && s.status === STATUS.EN_PROCES) || null;
}

/**
 * Calcula l'estat visible del tècnic per al panell de la gestora:
 * "ocupat" si té algun servei en_proces, "lliure" en cas contrari.
 */
function technicianWithComputedStatus(tech) {
  const active = activeServiceForTechnician(tech.id);
  return {
    ...tech,
    status: active ? 'ocupat' : 'lliure',
    currentService: active || null,
    pendingCount: pendingQueueForTechnician(tech.id).length,
  };
}

function serializeService(s) {
  return { ...s };
}

// ---------------------------------------------------------------------------
// 3. ENDPOINTS DE CONFIGURACIÓ (tècnics / zones) — per omplir selects al front
// ---------------------------------------------------------------------------

app.get('/api/config', (req, res) => {
  // zoneTechnicians: { "Pallars Sobirà": ["Jordi Mir", "Anna Solé"], ... }
  // Permet mostrar al formulari qui pot rebre el servei quan una zona té
  // més d'un tècnic assignat.
  const zoneTechnicians = {};
  ALL_ZONES.forEach((zone) => {
    zoneTechnicians[zone] = findTechniciansForZone(zone).map((t) => t.name);
  });

  res.json({
    zones: ALL_ZONES,
    zoneTechnicians,
    dayOptions: DAY_OPTIONS,
    technicians: technicians.map(technicianWithComputedStatus),
  });
});

app.get('/api/technicians', (req, res) => {
  res.json(technicians.map(technicianWithComputedStatus));
});

// ---------------------------------------------------------------------------
// 4. GET /api/services — llistat (amb filtres opcionals)
//    ?technicianId=1            -> només els serveis d'aquell tècnic
//    ?status=pendent,en_proces  -> filtra per un o més estats (separats per coma)
//    Sempre retorna ordenat per createdAt ASC (ordre estricte d'arribada).
// ---------------------------------------------------------------------------

app.get('/api/services', (req, res) => {
  let result = [...services];

  if (req.query.technicianId) {
    const techId = Number(req.query.technicianId);
    result = result.filter((s) => s.technicianId === techId);
  }

  if (req.query.status) {
    const statuses = String(req.query.status).split(',').map((s) => s.trim());
    result = result.filter((s) => statuses.includes(s.status));
  }

  result.sort((a, b) => a.createdAt - b.createdAt);

  res.json(result.map(serializeService));
});

// ---------------------------------------------------------------------------
// 5. POST /api/services — la gestora dona d'alta un nou servei
// ---------------------------------------------------------------------------

app.post('/api/services', (req, res) => {
  const { clientName, address, description, zone } = req.body || {};

  // Validació obligatòria dels 4 camps del formulari.
  const missing = [];
  if (!clientName || !clientName.trim()) missing.push('clientName');
  if (!address || !address.trim()) missing.push('address');
  if (!description || !description.trim()) missing.push('description');
  if (!zone || !zone.trim()) missing.push('zone');

  if (missing.length) {
    return res.status(400).json({
      error: 'Falten camps obligatoris.',
      missing,
    });
  }

  const technician = assignTechnicianForZone(zone);
  if (!technician) {
    return res.status(400).json({
      error: `No hi ha cap tècnic assignat a la comarca "${zone}".`,
    });
  }

  const newService = {
    id: crypto.randomUUID(),
    clientName: clientName.trim(),
    address: address.trim(),
    description: description.trim(),
    zone,
    technicianId: technician.id,
    assignedDay: null, // el tècnic el triarà des de tecnic.html
    status: STATUS.PENDENT,
    createdAt: Date.now(), // <- base de tota la regla FIFO
    startedAt: null,
    finishedAt: null,
  };

  services.push(newService);

  res.status(201).json({
    ...serializeService(newService),
    technicianName: technician.name,
  });
});

// ---------------------------------------------------------------------------
// 6. PATCH /api/services/:id — el tècnic interactua amb el seu tiquet
//    Body admès (un o ambdós camps):
//      { assignedDay: 'Avui' | 'Demà' | 'Altre dia' }
//      { status: 'en_proces' | 'fet' }
// ---------------------------------------------------------------------------

app.patch('/api/services/:id', (req, res) => {
  const { id } = req.params;
  const { assignedDay, status } = req.body || {};

  const service = services.find((s) => s.id === id);
  if (!service) {
    return res.status(404).json({ error: 'Servei no trobat.' });
  }

  // --- 6.a Selecció del dia (Estat 1: Pendent a la cua) --------------------
  if (assignedDay !== undefined) {
    if (!DAY_OPTIONS.includes(assignedDay)) {
      return res.status(400).json({ error: `Dia no vàlid. Opcions: ${DAY_OPTIONS.join(', ')}` });
    }
    if (service.status !== STATUS.PENDENT) {
      return res.status(409).json({ error: 'Només es pot triar el dia mentre el servei està pendent.' });
    }
    service.assignedDay = assignedDay;
  }

  // --- 6.b Canvi d'estat (Estat 2 i 3) --------------------------------------
  if (status !== undefined) {
    if (status === STATUS.EN_PROCES) {
      if (service.status !== STATUS.PENDENT) {
        return res.status(409).json({ error: 'Aquest servei no està pendent.' });
      }

      // Regla estricta FIFO: només es pot començar si és el servei pendent
      // més antic (createdAt més petit) d'aquest tècnic, sigui quin sigui
      // el dia que s'hagi triat per fer-lo.
      const queue = pendingQueueForTechnician(service.technicianId);
      const oldest = queue[0];
      if (oldest && oldest.id !== service.id) {
        return res.status(409).json({
          error: 'Ordre de cua (FIFO): primer s\'ha de resoldre un servei més antic.',
          blockingServiceId: oldest.id,
          blockingClient: oldest.clientName,
        });
      }

      // Un tècnic només pot tenir un servei "en procés" alhora.
      const active = activeServiceForTechnician(service.technicianId);
      if (active) {
        return res.status(409).json({
          error: 'Aquest tècnic ja té un servei en curs. Ha d\'acabar-lo abans de començar-ne un altre.',
          activeServiceId: active.id,
        });
      }

      service.status = STATUS.EN_PROCES;
      service.startedAt = Date.now();
    } else if (status === STATUS.FET) {
      if (service.status !== STATUS.EN_PROCES) {
        return res.status(409).json({ error: 'Només es pot finalitzar un servei que estigui en procés.' });
      }
      service.status = STATUS.FET;
      service.finishedAt = Date.now();
    } else {
      return res.status(400).json({ error: `Estat no vàlid: ${status}` });
    }
  }

  res.json(serializeService(service));
});

// ---------------------------------------------------------------------------
// 7. POST /api/chat — xatbot públic "professional" (chatbot-api.js)
//    Només s'utilitza si al front-end tens activat <script src="/js/chatbot-api.js">
//    en lloc de chatbot-simple.js. Requereix definir la variable d'entorn
//    ANTHROPIC_API_KEY (Render → Settings → Environment).
// ---------------------------------------------------------------------------

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

// Model ràpid i econòmic, ideal per a un xat de FAQ. Es pot canviar per
// 'claude-sonnet-5' si es vol un raonament més elaborat (més cost i latència).
const ANTHROPIC_MODEL = 'claude-haiku-4-5-20251001';

// Tota la informació real del negoci viu aquí. Actualitza-la quan canviïn
// dades reals (telèfon, horari, preus, zones...).
const PIRICAT_SYSTEM_PROMPT = `Ets l'assistent virtual de Piricat Energies, una empresa de lampisteria i electricitat que treballa a Andorra i a les comarques del Pallars Sobirà, Pallars Jussà, Alt Urgell, Alta Ribagorça i la Vall d'Aran.

Informació del negoci:
- Serveis: lampisteria (fuites, aixetes, escalfadors, desguassos, instal·lacions de bany/cuina) i electricitat (avaries, quadres elèctrics, endolls, punts de llum, petites instal·lacions).
- Zones i tècnics assignats: Pallars Sobirà (2 tècnics), Pallars Jussà (1), Alt Urgell (1), Alta Ribagorça (1), Vall d'Aran (1), Andorra (1).
- Horari d'atenció: dilluns a divendres, 8h–19h. [ACTUALITZA aquesta dada si no és correcta]
- Contacte: telèfon +34 600 00 00 00, correu info@piricatenergies.cat. [ACTUALITZA aquestes dades pels reals]
- Procés d'un servei: el client explica l'avaria, s'assigna automàticament al tècnic de la seva zona, el client tria el dia (avui / demà / un altre dia), i els serveis es resolen per ordre estricte d'arribada.

Instruccions:
- Respon sempre en català, de manera breu, clara i propera (com un professional de confiança, no com un venedor).
- No inventis preus exactes, terminis concrets ni dades que no es t'han donat: si et pregunten un preu, digues que cal valorar-ho segons la feina i oferir el contacte telefònic per rebre un pressupost.
- Si sembla una urgència (fuita greu, curtcircuit, espurnes, olor a cremat), recomana trucar directament en lloc de continuar escrivint.
- Si la pregunta no té res a veure amb lampisteria, electricitat o el negoci, redirigeix amablement cap a aquests temes.`;

app.post('/api/chat', async (req, res) => {
  const { message, history } = req.body || {};

  if (!message || !String(message).trim()) {
    return res.status(400).json({ error: 'Falta el missatge.' });
  }

  if (!ANTHROPIC_API_KEY) {
    return res.status(500).json({
      error: 'El servidor no té configurada la variable ANTHROPIC_API_KEY.',
    });
  }

  // Historial curt (últims 10 missatges) perquè el bot recordi el context
  // de la conversa sense enviar-ho tot cada vegada.
  const conversationHistory = Array.isArray(history) ? history.slice(-10) : [];

  try {
    const apiRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: ANTHROPIC_MODEL,
        max_tokens: 400,
        system: PIRICAT_SYSTEM_PROMPT,
        messages: [...conversationHistory, { role: 'user', content: String(message) }],
      }),
    });

    if (!apiRes.ok) {
      const errText = await apiRes.text();
      console.error('Error de l\'API d\'Anthropic:', errText);
      return res.status(502).json({ error: 'No s\'ha pogut contactar amb el servei d\'IA.' });
    }

    const data = await apiRes.json();
    const textBlock = (data.content || []).find((block) => block.type === 'text');
    const reply = textBlock ? textBlock.text : 'Ho sento, no he pogut generar una resposta.';

    res.json({ reply });
  } catch (err) {
    console.error('Error cridant l\'API d\'Anthropic:', err);
    res.status(500).json({ error: 'Error de connexió amb el servei d\'IA.' });
  }
});

// ---------------------------------------------------------------------------
// 8. BOT DE TELEGRAM (mode webhook) — 100% gratuït
//    A diferència d'un bot amb "polling" (que necessita un procés separat
//    sempre encès i, a Render, un Background Worker de pagament), aquí és
//    Telegram qui truca directament a aquest mateix servidor cada vegada
//    que algú escriu al bot. Com que ja tens aquest servidor desplegat com
//    a Web Service (pla gratuït), no cal cap servei ni cost addicional.
//
//    Configuració necessària (Render → el teu servei → Environment):
//      TELEGRAM_TOKEN   → el token que et va donar @BotFather
//      GROQ_KEY         → la teva clau de console.groq.com
//
//    Un cop desplegat, cal registrar el webhook UN SOL COP visitant (des
//    del navegador n'hi ha prou) aquesta URL, substituint els dos valors:
//      https://api.telegram.org/bot<EL_TEU_TELEGRAM_TOKEN>/setWebhook?url=https://<LA_TEVA_URL_DE_RENDER>/telegram-webhook
// ---------------------------------------------------------------------------

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const GROQ_KEY = process.env.GROQ_KEY;

const TELEGRAM_API = `https://api.telegram.org/bot${TELEGRAM_TOKEN}`;
const GROQ_API = 'https://api.groq.com/openai/v1/chat/completions';

async function telegramSendMessage(chatId, text) {
  await fetch(`${TELEGRAM_API}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text }),
  });
}

async function askGroq(question) {
  if (!GROQ_KEY) {
    return 'El bot no està configurat correctament (falta la variable GROQ_KEY al servidor).';
  }

  try {
    const r = await fetch(GROQ_API, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${GROQ_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [
          { role: 'system', content: PIRICAT_SYSTEM_PROMPT },
          { role: 'user', content: question },
        ],
        max_tokens: 300,
        temperature: 0.3,
      }),
    });

    const data = await r.json();
    const reply = data.choices?.[0]?.message?.content?.trim();
    return reply || 'Ho sento, no he pogut generar una resposta.';
  } catch (err) {
    console.error('Error cridant Groq:', err);
    return 'Ho sento, ara mateix no puc respondre. Contacta\'ns directament per telèfon.';
  }
}

app.post('/telegram-webhook', async (req, res) => {
  // Responem 200 immediatament: Telegram només vol saber que hem rebut
  // l'actualització, no cal fer-lo esperar mentre consultem la IA.
  res.sendStatus(200);

  try {
    const update = req.body;
    const msg = update && update.message;
    if (!msg || !msg.text || !msg.chat) return;

    const chatId = msg.chat.id;
    const text = msg.text.trim();

    if (text === '/start') {
      await telegramSendMessage(
        chatId,
        "Hola! Benvingut/da a Piricat Energies 👋\n" +
        "Sóc el teu assistent virtual. Pregunta'm el que vulguis sobre:\n\n" +
        "🔧 Lampisteria · ⚡ Electricitat · 📍 Zones\n" +
        "🛠️ Com demanar un servei · 🕙 Horari · 📞 Contacte"
      );
      return;
    }

    const reply = await askGroq(text);
    await telegramSendMessage(chatId, reply);
  } catch (err) {
    console.error('Error al webhook de Telegram:', err);
  }
});

// ---------------------------------------------------------------------------
// ARRENCADA
// ---------------------------------------------------------------------------

app.listen(PORT, () => {
  console.log(`⚡🔧 Piricat Energies — servidor escoltant a http://localhost:${PORT}`);
  console.log(`   Panell gestora: http://localhost:${PORT}/privat.html`);
  console.log(`   App tècnic:     http://localhost:${PORT}/tecnic.html`);
});
