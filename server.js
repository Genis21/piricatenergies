/**
 * PIRICAT ENERGIES — server.js
 * ---------------------------------------------------------------
 * Backend Express que serveix la web publica, el panell privat de
 * la central (Sort) i l'app del tecnic, i que exposa l'API REST
 * que gestiona la logica "Smart-Queue":
 *
 *  1) La gestora crea un avis per a una comarca.
 *  2) Si hi ha un tecnic LLIURE a la comarca -> se li assigna
 *     immediatament (estat "assignada") i se li diu al client
 *     "Venim en menys d'una hora". El tecnic passa a OCUPAT.
 *  3) Si tots els tecnics de la comarca estan OCUPATS -> l'avis
 *     entra a la cua del tecnic amb menys feina (estat "en_cua")
 *     i es diu al client "En menys d'una hora rebra la informacio
 *     de quan vindra el tecnic".
 *  4) El tecnic, des del mobil, escull "Avui" / "Dema" / "Altre dia"
 *     per als avisos en cua (estat "programada").
 *  5) Quan el tecnic prem "Finalitzada" l'avis s'elimina de la cua
 *     activa. Si el tecnic es queda sense cap avis actiu, torna a
 *     l'estat LLIURE automaticament.
 *
 * Dades en memoria (sense base de dades externa) per simplicitat,
 * tal com demana l'especificacio del projecte.
 * ---------------------------------------------------------------
 */

const express = require('express');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

/* ================================================================
   1. DADES MESTRES: LES 6 COMARQUES / NODES D'ESTOC
   ================================================================ */
const COMARQUES = [
  { id: 'aran', nom: "Val d'Aran", magatzem: 'Vielha' },
  { id: 'ribagorca', nom: 'Alta Ribagorça', magatzem: 'El Pont de Suert' },
  { id: 'jussa', nom: 'Pallars Jussà', magatzem: 'Tremp' },
  { id: 'sobira', nom: 'Pallars Sobirà', magatzem: 'Sort' },
  { id: 'urgell', nom: 'Alt Urgell', magatzem: 'La Seu d\'Urgell' },
  { id: 'andorra', nom: 'Andorra', magatzem: 'Andorra la Vella' }
];
const COMARCA_IDS = COMARQUES.map(c => c.id);

/* ================================================================
   2. TÈCNICS (1 o 2 per comarca, reben els avisos al mòbil)
   ================================================================ */
let tecnics = [
  { id: 't-aran-1', nom: 'Jordi Barrau', comarca: 'aran', telefon: '600 111 222', estat: 'lliure' },
  { id: 't-aran-2', nom: 'Aitor Casau', comarca: 'aran', telefon: '600 111 223', estat: 'lliure' },
  { id: 't-ribagorca-1', nom: 'Martí Vidal', comarca: 'ribagorca', telefon: '600 222 333', estat: 'lliure' },
  { id: 't-jussa-1', nom: 'Pau Farré', comarca: 'jussa', telefon: '600 333 444', estat: 'lliure' },
  { id: 't-sobira-1', nom: 'Roger Sanmartí', comarca: 'sobira', telefon: '600 444 555', estat: 'lliure' },
  { id: 't-sobira-2', nom: 'Laia Pujol', comarca: 'sobira', telefon: '600 444 556', estat: 'lliure' },
  { id: 't-urgell-1', nom: 'Xavi Areny', comarca: 'urgell', telefon: '600 555 666', estat: 'lliure' },
  { id: 't-andorra-1', nom: 'Marc Iglesias', comarca: 'andorra', telefon: '600 666 777', estat: 'lliure' }
];

/* ================================================================
   3. TIQUETS (avisos de client) — array global en memòria
   ================================================================ */
let tickets = [];
let historial = [];
let comptadorTiquet = 1;

function generarIdTiquet() {
  const any = new Date().getFullYear();
  const num = String(comptadorTiquet++).padStart(4, '0');
  return `PC-${any}-${num}`;
}

/* ---- Dades de demostració perquè el panell no arrenqui buit ---- */
function llavor() {
  crearTiquet({
    comarca: 'sobira',
    client: { nom: 'Hostal Vall Ferrera', telefon: '973 620 100', poble: 'Alins', adreca: 'Ctra. de la Vall, 4' },
    tipus: 'electricitat',
    urgent: true,
    descripcio: 'Tall de subministrament a la cuina, olor de cremat al quadre elèctric.'
  });
  crearTiquet({
    comarca: 'aran',
    client: { nom: 'Apartaments Eth Refugi', telefon: '973 640 200', poble: 'Vielha', adreca: 'Pas d\'Arró, 9' },
    tipus: 'lampisteria',
    urgent: false,
    descripcio: 'Fuita d\'aigua sota el fregidor del pis 2n.'
  });
  crearTiquet({
    comarca: 'aran',
    client: { nom: 'Refugi de Montgarri', telefon: '973 640 987', poble: 'Naut Aran', adreca: 'Pla de Beret' },
    tipus: 'electricitat',
    urgent: false,
    descripcio: 'Revisió del quadre general abans de la temporada d\'hivern.'
  });
}

/* ================================================================
   4. LÒGICA "SMART-QUEUE"
   ================================================================ */

// Retorna els tiquets actius (no finalitzats) d'un tècnic
function tiquetsActiusDe(tecnicId) {
  return tickets.filter(t => t.tecnicId === tecnicId && t.estat !== 'finalitzada');
}

// Crea un tiquet i l'assigna seguint la lògica Smart-Queue
function crearTiquet({ comarca, client, tipus, urgent, descripcio }) {
  const tecnicsComarca = tecnics.filter(t => t.comarca === comarca);
  if (tecnicsComarca.length === 0) {
    throw new Error('No hi ha cap tècnic donat d\'alta en aquesta comarca.');
  }

  // 1) Busquem un tècnic LLIURE a la comarca
  let tecnicAssignat = tecnicsComarca.find(t => t.estat === 'lliure');
  let estatInicial;
  let missatge;

  if (tecnicAssignat) {
    // El tècnic estava lliure -> se li assigna la feina a l'instant
    tecnicAssignat.estat = 'ocupat';
    estatInicial = 'assignada';
    missatge = 'Venim en menys d\'una hora.';
  } else {
    // Tots ocupats -> entra a la cua del tècnic amb menys feina pendent
    tecnicAssignat = tecnicsComarca
      .slice()
      .sort((a, b) => tiquetsActiusDe(a.id).length - tiquetsActiusDe(b.id).length)[0];
    estatInicial = 'en_cua';
    missatge = 'En menys d\'una hora rebrà la informació de quan vindrà el tècnic.';
  }

  const tiquet = {
    id: generarIdTiquet(),
    comarca,
    tecnicId: tecnicAssignat.id,
    client: {
      nom: (client && client.nom) || '',
      telefon: (client && client.telefon) || '',
      poble: (client && client.poble) || '',
      adreca: (client && client.adreca) || ''
    },
    tipus: tipus || 'electricitat',
    urgent: !!urgent,
    descripcio: descripcio || '',
    estat: estatInicial, // assignada | en_cua | programada | finalitzada
    dia: null,           // avui | dema | altre_dia
    dataAltra: null,     // text lliure quan dia === 'altre_dia'
    dataCreacio: new Date().toISOString(),
    dataProgramacio: null,
    dataFinalitzacio: null
  };

  tickets.push(tiquet);
  return { tiquet, missatge, tecnic: tecnicAssignat };
}

// El tècnic escull quan farà una feina en cua
function programarTiquet(id, dia, dataAltra) {
  const tiquet = tickets.find(t => t.id === id);
  if (!tiquet) return null;
  if (!['avui', 'dema', 'altre_dia'].includes(dia)) {
    throw new Error('Dia no vàlid. Ha de ser "avui", "dema" o "altre_dia".');
  }
  tiquet.dia = dia;
  tiquet.dataAltra = dia === 'altre_dia' ? (dataAltra || '') : null;
  tiquet.estat = 'programada';
  tiquet.dataProgramacio = new Date().toISOString();
  return tiquet;
}

// El tècnic finalitza un avís: surt de la cua i, si es buida, torna a LLIURE
function finalitzarTiquet(id) {
  const idx = tickets.findIndex(t => t.id === id);
  if (idx === -1) return null;

  const [tiquet] = tickets.splice(idx, 1);
  tiquet.estat = 'finalitzada';
  tiquet.dataFinalitzacio = new Date().toISOString();
  historial.unshift(tiquet);
  historial = historial.slice(0, 200); // no acumulem historial infinit en memòria

  const tecnic = tecnics.find(t => t.id === tiquet.tecnicId);
  if (tecnic) {
    const pendents = tiquetsActiusDe(tecnic.id);
    if (pendents.length === 0) {
      tecnic.estat = 'lliure';
    }
  }
  return tiquet;
}

/* ================================================================
   5. SERIALITZACIÓ PER A LES VISTES
   ================================================================ */

// Vista completa per al panell de la central: comarques -> tècnics -> cua
function serialitzarComarques() {
  return COMARQUES.map(c => {
    const tecnicsComarca = tecnics
      .filter(t => t.comarca === c.id)
      .map(t => ({
        id: t.id,
        nom: t.nom,
        telefon: t.telefon,
        estat: t.estat,
        tickets: tiquetsActiusDe(t.id)
          .slice()
          .sort((a, b) => new Date(a.dataCreacio) - new Date(b.dataCreacio))
      }));

    return {
      id: c.id,
      nom: c.nom,
      magatzem: c.magatzem,
      estatGlobal: tecnicsComarca.some(t => t.estat === 'lliure') ? 'lliure' : 'ocupat',
      totalActius: tecnicsComarca.reduce((acc, t) => acc + t.tickets.length, 0),
      tecnics: tecnicsComarca
    };
  });
}

/* ================================================================
   6. RUTES API
   ================================================================ */

// --- Comarques (resum complet per al panell de Sort) ---
app.get('/api/comarques', (req, res) => {
  res.json(serialitzarComarques());
});

// --- Tècnics ---
app.get('/api/tecnics', (req, res) => {
  const { comarca } = req.query;
  let resultat = tecnics;
  if (comarca) resultat = resultat.filter(t => t.comarca === comarca);
  res.json(resultat.map(t => ({ ...t, totalActius: tiquetsActiusDe(t.id).length })));
});

// --- Detall d'un tècnic + la seva cua activa (usat per tecnic.html) ---
app.get('/api/tecnics/:id', (req, res) => {
  const tecnic = tecnics.find(t => t.id === req.params.id);
  if (!tecnic) return res.status(404).json({ error: 'Tècnic no trobat.' });
  const cua = tiquetsActiusDe(tecnic.id).slice().sort((a, b) => {
    // Primer les "assignada" (immediates), després "en_cua", després "programada"
    const pes = { assignada: 0, en_cua: 1, programada: 2 };
    return (pes[a.estat] - pes[b.estat]) || (new Date(a.dataCreacio) - new Date(b.dataCreacio));
  });
  res.json({ tecnic, tickets: cua });
});

// --- Tiquets: llistat amb filtres opcionals ---
app.get('/api/tickets', (req, res) => {
  const { comarca, tecnic, estat, actiu } = req.query;
  let resultat = tickets;
  if (comarca) resultat = resultat.filter(t => t.comarca === comarca);
  if (tecnic) resultat = resultat.filter(t => t.tecnicId === tecnic);
  if (estat) resultat = resultat.filter(t => t.estat === estat);
  if (actiu === 'true') resultat = resultat.filter(t => t.estat !== 'finalitzada');
  res.json(resultat.slice().sort((a, b) => new Date(b.dataCreacio) - new Date(a.dataCreacio)));
});

// --- Historial (tiquets finalitzats) ---
app.get('/api/historial', (req, res) => {
  res.json(historial);
});

// --- Crear un tiquet nou (formulari de la central) ---
app.post('/api/tickets', (req, res) => {
  try {
    const { comarca, client, tipus, urgent, descripcio } = req.body || {};

    if (!comarca || !COMARCA_IDS.includes(comarca)) {
      return res.status(400).json({ error: 'La comarca indicada no és vàlida.' });
    }
    if (!client || !client.nom || !client.telefon) {
      return res.status(400).json({ error: 'Cal indicar com a mínim el nom i el telèfon del client.' });
    }

    const { tiquet, missatge, tecnic } = crearTiquet({ comarca, client, tipus, urgent, descripcio });
    res.status(201).json({ tiquet, missatge, tecnic: { id: tecnic.id, nom: tecnic.nom, estat: tecnic.estat } });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// --- Actualitzar l'estat d'un tiquet (el tècnic tria "avui/dema/altre_dia") ---
app.patch('/api/tickets/:id/programar', (req, res) => {
  try {
    const { dia, dataAltra } = req.body || {};
    const tiquet = programarTiquet(req.params.id, dia, dataAltra);
    if (!tiquet) return res.status(404).json({ error: 'Tiquet no trobat.' });
    res.json(tiquet);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// --- Actualització genèrica d'estat (per si cal reobrir/tocar camps) ---
app.patch('/api/tickets/:id', (req, res) => {
  const tiquet = tickets.find(t => t.id === req.params.id);
  if (!tiquet) return res.status(404).json({ error: 'Tiquet no trobat.' });
  const { descripcio, urgent, tipus } = req.body || {};
  if (descripcio !== undefined) tiquet.descripcio = descripcio;
  if (urgent !== undefined) tiquet.urgent = !!urgent;
  if (tipus !== undefined) tiquet.tipus = tipus;
  res.json(tiquet);
});

// --- Finalitzar / esborrar un tiquet (el tècnic prem "Finalitzada") ---
app.delete('/api/tickets/:id', (req, res) => {
  const tiquet = finalitzarTiquet(req.params.id);
  if (!tiquet) return res.status(404).json({ error: 'Tiquet no trobat.' });
  res.json({ ok: true, tiquet });
});

// --- Salut del servei (útil per a Render) ---
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', tickets: tickets.length, tecnics: tecnics.length });
});

/* ================================================================
   7. RUTES DE LES VISTES HTML (fallback net d'extensions)
   ================================================================ */
app.get('/privat', (req, res) => res.sendFile(path.join(__dirname, 'public', 'privat.html')));
app.get('/tecnic', (req, res) => res.sendFile(path.join(__dirname, 'public', 'tecnic.html')));

// Qualsevol altra ruta no-API torna a la landing pública
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

/* ================================================================
   8. ARRENCADA
   ================================================================ */
llavor();
app.listen(PORT, () => {
  console.log(`⚡ Piricat Energies escoltant al port ${PORT}`);
});
