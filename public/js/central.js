/**
 * PIRICAT ENERGIES — central.js
 * Lògica del panell de la Gestora (privat.html):
 *   1. Omple el desplegable de comarques i mostra a quin tècnic anirà cada una.
 *   2. Envia el formulari de nou servei (POST /api/services).
 *   3. Refresca cada X segons el quadre de tècnics i les cues pendents,
 *      llegint sempre de /api/technicians i /api/services (GET).
 */

const REFRESH_MS = 4000;

/** Mapa zona -> llista de noms de tècnics, construït a partir de /api/config.
 *  Es fa servir per mostrar l'avís "Aquest servei anirà a..." sota el select
 *  de comarca. Algunes zones (p. ex. Pallars Sobirà) tenen més d'un tècnic. */
let zoneTechnicianMap = {};

// ---------------------------------------------------------------------------
// Utilitats
// ---------------------------------------------------------------------------

function timeAgo(timestampMs) {
  const diffMin = Math.max(0, Math.round((Date.now() - timestampMs) / 60000));
  if (diffMin < 1) return 'ara mateix';
  if (diffMin === 1) return 'fa 1 minut';
  if (diffMin < 60) return `fa ${diffMin} minuts`;
  const hours = Math.floor(diffMin / 60);
  return `fa ${hours}h ${diffMin % 60}min`;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ---------------------------------------------------------------------------
// 1. Configuració inicial: comarques + mapa zona->tècnic
// ---------------------------------------------------------------------------

async function loadConfig() {
  try {
    const res = await fetch('/api/config');
    if (!res.ok) throw new Error('No s\'ha pogut carregar la configuració.');
    const config = await res.json();

    const zoneSelect = document.getElementById('zone');
    config.zones.forEach((zone) => {
      const opt = document.createElement('option');
      opt.value = zone;
      opt.textContent = zone;
      zoneSelect.appendChild(opt);
    });

    zoneTechnicianMap = config.zoneTechnicians || {};
  } catch (err) {
    console.error(err);
    showFormFeedback('error', 'No s\'ha pogut connectar amb el servidor.');
  }
}

document.getElementById('zone').addEventListener('change', (e) => {
  const zone = e.target.value;
  const hintEl = document.getElementById('zone-hint');
  const names = zoneTechnicianMap[zone] || [];

  if (names.length === 0) {
    hintEl.innerHTML = '';
  } else if (names.length === 1) {
    hintEl.innerHTML = `Aquest servei anirà directament a la cua de <strong>${escapeHtml(names[0])}</strong>.`;
  } else {
    const namesHtml = names.map((n) => `<strong>${escapeHtml(n)}</strong>`).join(' o ');
    hintEl.innerHTML = `Aquesta zona té ${names.length} tècnics: ${namesHtml}. S'assignarà automàticament al que tingui menys feina en aquell moment.`;
  }
});

// ---------------------------------------------------------------------------
// 2. Enviament del formulari
// ---------------------------------------------------------------------------

function showFormFeedback(type, message) {
  const el = document.getElementById('form-feedback');
  el.className = `form-feedback ${type}`;
  el.textContent = message;
  if (type === 'ok') {
    setTimeout(() => {
      el.className = 'form-feedback';
      el.textContent = '';
    }, 4000);
  }
}

document.getElementById('service-form').addEventListener('submit', async (e) => {
  e.preventDefault();

  const form = e.target;
  const payload = {
    clientName: form.clientName.value.trim(),
    address: form.address.value.trim(),
    description: form.description.value.trim(),
    zone: form.zone.value,
  };

  if (!payload.clientName || !payload.address || !payload.description || !payload.zone) {
    showFormFeedback('error', 'Cal omplir tots els camps abans d\'enviar el servei.');
    return;
  }

  const submitBtn = form.querySelector('button.submit');
  submitBtn.disabled = true;
  submitBtn.textContent = 'Enviant...';

  try {
    const res = await fetch('/api/services', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const data = await res.json();

    if (!res.ok) {
      showFormFeedback('error', data.error || 'Error desconegut en crear el servei.');
      return;
    }

    showFormFeedback('ok', `Servei creat i assignat a ${data.technicianName} (${payload.zone}).`);
    form.reset();
    document.getElementById('zone-hint').innerHTML = '';
    await refreshDashboard(); // reflectir el nou tiquet immediatament
  } catch (err) {
    console.error(err);
    showFormFeedback('error', 'No s\'ha pogut contactar amb el servidor.');
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Enviar a la cua del tècnic';
  }
});

// ---------------------------------------------------------------------------
// 3. Quadre de tècnics (breaker panel)
// ---------------------------------------------------------------------------

function renderTechnicianGrid(technicians) {
  const grid = document.getElementById('tech-grid');
  grid.innerHTML = '';

  technicians.forEach((tech) => {
    const isBusy = tech.status === 'ocupat';
    const card = document.createElement('div');
    card.className = `tech-card ${isBusy ? 'busy' : ''}`;

    let currentJobHtml = '';
    if (isBusy && tech.currentService) {
      currentJobHtml = `
        <div class="current-job">
          <div class="job-label">Feina actual</div>
          <div class="job-client">${escapeHtml(tech.currentService.clientName)}</div>
          <div class="job-desc">${escapeHtml(tech.currentService.description)} — ${escapeHtml(tech.currentService.address)}</div>
        </div>
      `;
    }

    card.innerHTML = `
      <div class="tech-head">
        <div>
          <h3>${escapeHtml(tech.name)}</h3>
          <div class="role">${escapeHtml(tech.role)}</div>
        </div>
        <span class="status-led ${isBusy ? 'busy' : 'free'}">
          <span class="dot"></span>
          ${isBusy ? 'OCUPAT / EN SERVEI' : 'TREBALLADOR LLIURE'}
        </span>
      </div>
      <div class="zones">Zones: <b>${tech.zones.map(escapeHtml).join(', ')}</b></div>
      ${currentJobHtml}
      <div class="queue-count">Pendents a la cua: <b>${tech.pendingCount}</b></div>
    `;

    grid.appendChild(card);
  });
}

// ---------------------------------------------------------------------------
// 4. Cues de pendents, agrupades per tècnic, en ordre estricte d'arribada
// ---------------------------------------------------------------------------

function renderQueues(technicians, pendingServices) {
  const container = document.getElementById('queues-container');
  container.innerHTML = '';

  technicians.forEach((tech) => {
    const techServices = pendingServices
      .filter((s) => s.technicianId === tech.id)
      .sort((a, b) => a.createdAt - b.createdAt); // FIFO estricte

    const wrapper = document.createElement('div');
    wrapper.style.marginBottom = '18px';

    const title = document.createElement('div');
    title.style.cssText = 'font-family:var(--font-mono); font-size:12px; color:var(--text-muted); margin-bottom:8px; text-transform:uppercase; letter-spacing:.05em;';
    title.textContent = `${tech.name} — ${techServices.length} pendent(s)`;
    wrapper.appendChild(title);

    if (techServices.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'empty-state';
      empty.textContent = 'Sense serveis pendents.';
      wrapper.appendChild(empty);
    } else {
      const list = document.createElement('div');
      list.className = 'queue-list';

      techServices.forEach((s, idx) => {
        const row = document.createElement('div');
        row.className = 'queue-row';
        row.innerHTML = `
          <div class="order-num">#${idx + 1}</div>
          <div class="info">
            <div class="client">${escapeHtml(s.clientName)}</div>
            <div class="meta">${escapeHtml(s.address)} · ${escapeHtml(s.description)} · ${timeAgo(s.createdAt)}</div>
          </div>
          <span class="badge-zone">${escapeHtml(s.zone)}</span>
          <span class="badge-day ${s.assignedDay ? 'set' : ''}">${s.assignedDay ? escapeHtml(s.assignedDay) : 'Sense dia'}</span>
        `;
        list.appendChild(row);
      });

      wrapper.appendChild(list);
    }

    container.appendChild(wrapper);
  });
}

// ---------------------------------------------------------------------------
// 5. Cicle de refresc
// ---------------------------------------------------------------------------

async function refreshDashboard() {
  try {
    const [techRes, pendingRes] = await Promise.all([
      fetch('/api/technicians'),
      fetch('/api/services?status=pendent'),
    ]);

    if (!techRes.ok || !pendingRes.ok) throw new Error('Resposta no vàlida del servidor.');

    const technicians = await techRes.json();
    const pendingServices = await pendingRes.json();

    renderTechnicianGrid(technicians);
    renderQueues(technicians, pendingServices);
  } catch (err) {
    console.error('Error refrescant el tauler:', err);
  }
}

function tickClock() {
  const el = document.getElementById('clock');
  el.textContent = new Date().toLocaleTimeString('ca-ES');
}

// ---------------------------------------------------------------------------
// Arrencada
// ---------------------------------------------------------------------------

(async function init() {
  await loadConfig();
  await refreshDashboard();
  tickClock();

  setInterval(refreshDashboard, REFRESH_MS);
  setInterval(tickClock, 1000);
})();
