/**
 * PIRICAT ENERGIES — operari.js
 * Lògica de l'app mòbil del tècnic (tecnic.html):
 *   1. El tècnic es "identifica" triant el seu nom al desplegable (no hi ha
 *      login real: és un prototip d'ús intern).
 *   2. Mostra el servei "en procés" (si n'hi ha) amb el botó "Servei fet".
 *   3. Mostra la cua de pendents en ordre estricte d'arribada (FIFO), amb
 *      selector de dia i el botó "Començar servei" — que el servidor només
 *      accepta si aquest és realment el tiquet més antic pendent.
 */

const REFRESH_MS = 3500;
const DAY_OPTIONS = ['Avui', 'Demà', 'Altre dia'];

/** Identificador del tècnic seleccionat al desplegable. null si encara no n'hi ha cap. */
let currentTechnicianId = null;

// ---------------------------------------------------------------------------
// Utilitats
// ---------------------------------------------------------------------------

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function timeAgo(timestampMs) {
  const diffMin = Math.max(0, Math.round((Date.now() - timestampMs) / 60000));
  if (diffMin < 1) return 'ara mateix';
  if (diffMin === 1) return 'fa 1 minut';
  if (diffMin < 60) return `fa ${diffMin} minuts`;
  const hours = Math.floor(diffMin / 60);
  return `fa ${hours}h ${diffMin % 60}min`;
}

function showToast(message) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => toast.classList.remove('show'), 3800);
}

// ---------------------------------------------------------------------------
// 1. Carregar tècnics al desplegable
// ---------------------------------------------------------------------------

async function loadTechnicians() {
  try {
    const res = await fetch('/api/technicians');
    if (!res.ok) throw new Error('No s\'han pogut carregar els tècnics.');
    const technicians = await res.json();

    const select = document.getElementById('technician-select');
    technicians.forEach((tech) => {
      const opt = document.createElement('option');
      opt.value = tech.id;
      opt.textContent = `${tech.name} (${tech.role})`;
      select.appendChild(opt);
    });
  } catch (err) {
    console.error(err);
    showToast('No s\'ha pogut connectar amb el servidor.');
  }
}

document.getElementById('technician-select').addEventListener('change', async (e) => {
  currentTechnicianId = Number(e.target.value);
  await refreshMyQueue();
});

// ---------------------------------------------------------------------------
// 2. Estat propi (lliure / ocupat) a la capçalera
// ---------------------------------------------------------------------------

function renderMyStatus(activeService) {
  const el = document.getElementById('my-status');
  const textEl = document.getElementById('my-status-text');

  if (activeService) {
    el.className = 'my-status busy';
    textEl.textContent = `Ocupat: ${activeService.clientName}`;
  } else {
    el.className = 'my-status free';
    textEl.textContent = 'Treballador lliure';
  }
}

// ---------------------------------------------------------------------------
// 3. Tiquet actiu (en procés) — botó "Servei fet"
// ---------------------------------------------------------------------------

function renderActiveTicket(activeService) {
  const block = document.getElementById('active-block');
  const container = document.getElementById('active-ticket-container');

  if (!activeService) {
    block.style.display = 'none';
    container.innerHTML = '';
    return;
  }

  block.style.display = 'block';
  container.innerHTML = `
    <div class="active-ticket">
      <div class="tag">En servei · ${escapeHtml(activeService.assignedDay || 'Sense dia')}</div>
      <div class="client">${escapeHtml(activeService.clientName)}</div>
      <div class="address">${escapeHtml(activeService.address)} · ${escapeHtml(activeService.zone)}</div>
      <div class="desc">${escapeHtml(activeService.description)}</div>
      <button class="btn-finish" data-id="${activeService.id}">Servei fet</button>
    </div>
  `;

  container.querySelector('.btn-finish').addEventListener('click', async (e) => {
    const id = e.target.getAttribute('data-id');
    e.target.disabled = true;
    e.target.textContent = 'Tancant servei...';
    await finishService(id);
  });
}

async function finishService(serviceId) {
  try {
    const res = await fetch(`/api/services/${serviceId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'fet' }),
    });
    const data = await res.json();

    if (!res.ok) {
      showToast(data.error || 'No s\'ha pogut finalitzar el servei.');
      return;
    }

    showToast('Servei finalitzat correctament.');
    await refreshMyQueue();
  } catch (err) {
    console.error(err);
    showToast('Error de connexió en finalitzar el servei.');
  }
}

// ---------------------------------------------------------------------------
// 4. Cua de pendents (FIFO) amb selector de dia i botó "Començar servei"
// ---------------------------------------------------------------------------

function renderQueue(pendingServices, hasActiveService) {
  const container = document.getElementById('queue-container');
  container.innerHTML = '';

  if (pendingServices.length === 0) {
    container.innerHTML = '<div class="empty-state">No tens serveis pendents. Bona feina! 🔧</div>';
    return;
  }

  // pendingServices ja arriba ordenat per createdAt ASC des del servidor,
  // però ho tornem a assegurar aquí per blindar l'ordre FIFO a la interfície.
  const ordered = [...pendingServices].sort((a, b) => a.createdAt - b.createdAt);

  ordered.forEach((service, idx) => {
    const isFirstInQueue = idx === 0;
    const canStart = isFirstInQueue && !hasActiveService;

    const ticket = document.createElement('div');
    ticket.className = `ticket ${canStart ? '' : 'locked'}`;

    const dayButtonsHtml = DAY_OPTIONS.map((day) => `
      <button type="button" class="day-btn ${service.assignedDay === day ? 'selected' : ''}" data-day="${day}">${day}</button>
    `).join('');

    let lockNoteHtml = '';
    if (!isFirstInQueue) {
      lockNoteHtml = `<div class="lock-note">🔒 Cal resoldre abans els ${idx} servei(s) més antic(s) de la cua.</div>`;
    } else if (hasActiveService) {
      lockNoteHtml = `<div class="lock-note">🔒 Acaba primer el servei que tens en curs.</div>`;
    }

    ticket.innerHTML = `
      <div class="ticket-num">#${idx + 1}</div>
      <div class="ticket-head">
        <div class="client">${escapeHtml(service.clientName)}</div>
        <div class="elapsed">${timeAgo(service.createdAt)}</div>
      </div>
      <div class="address">${escapeHtml(service.address)}</div>
      <div class="desc">${escapeHtml(service.description)}</div>
      <span class="zone-badge">${escapeHtml(service.zone)}</span>

      <div class="day-picker">${dayButtonsHtml}</div>

      <button type="button" class="btn-start" data-id="${service.id}" ${canStart ? '' : 'disabled'}>
        Començar servei
      </button>
      ${lockNoteHtml}
    `;

    // Selector de dia
    ticket.querySelectorAll('.day-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        await setAssignedDay(service.id, btn.getAttribute('data-day'));
      });
    });

    // Començar servei
    const startBtn = ticket.querySelector('.btn-start');
    if (canStart) {
      startBtn.addEventListener('click', async () => {
        startBtn.disabled = true;
        startBtn.textContent = 'Iniciant...';
        await startService(service.id);
      });
    }

    container.appendChild(ticket);
  });
}

async function setAssignedDay(serviceId, day) {
  try {
    const res = await fetch(`/api/services/${serviceId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ assignedDay: day }),
    });
    const data = await res.json();

    if (!res.ok) {
      showToast(data.error || 'No s\'ha pogut desar el dia.');
      return;
    }

    await refreshMyQueue();
  } catch (err) {
    console.error(err);
    showToast('Error de connexió en desar el dia.');
  }
}

async function startService(serviceId) {
  try {
    const res = await fetch(`/api/services/${serviceId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'en_proces' }),
    });
    const data = await res.json();

    if (!res.ok) {
      // Aquí és on es reflecteix la regla FIFO: si el servidor detecta que
      // no és el tiquet més antic, o que ja hi ha un servei en curs, ho bloqueja.
      showToast(data.error || 'No s\'ha pogut començar el servei.');
      await refreshMyQueue();
      return;
    }

    showToast(`Servei començat: ${data.clientName}`);
    await refreshMyQueue();
  } catch (err) {
    console.error(err);
    showToast('Error de connexió en començar el servei.');
  }
}

// ---------------------------------------------------------------------------
// 5. Cicle de refresc de "la meva cua"
// ---------------------------------------------------------------------------

async function refreshMyQueue() {
  if (!currentTechnicianId) return;

  try {
    const [pendingRes, activeRes] = await Promise.all([
      fetch(`/api/services?technicianId=${currentTechnicianId}&status=pendent`),
      fetch(`/api/services?technicianId=${currentTechnicianId}&status=en_proces`),
    ]);

    if (!pendingRes.ok || !activeRes.ok) throw new Error('Resposta no vàlida del servidor.');

    const pendingServices = await pendingRes.json();
    const activeServices = await activeRes.json();
    const activeService = activeServices[0] || null;

    renderMyStatus(activeService);
    renderActiveTicket(activeService);
    renderQueue(pendingServices, !!activeService);
  } catch (err) {
    console.error('Error refrescant la cua del tècnic:', err);
  }
}

// ---------------------------------------------------------------------------
// Arrencada
// ---------------------------------------------------------------------------

(async function init() {
  await loadTechnicians();
  setInterval(refreshMyQueue, REFRESH_MS);
})();
