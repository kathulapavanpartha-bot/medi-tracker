/**
 * MediSync Core App Controller
 */

// Base API URL configuration:
// Automatically detects if opened via file:// or another local port (e.g. Live Server) and points to http://localhost:3000
// In production (Vercel) or on port 3000, uses relative paths ('')
const isLocalFile = window.location.protocol === 'file:';
const isOtherLocalPort = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') && window.location.port && window.location.port !== '3000';
const API_BASE = (isLocalFile || isOtherLocalPort)
  ? 'http://localhost:3000'
  : '';

window.API_BASE = API_BASE;

/**
 * Universal wrapper for API calls that handles protocol prefixes and friendly error messages
 */
async function apiFetch(endpoint, options = {}) {
  const url = endpoint.startsWith('http') ? endpoint : `${API_BASE}${endpoint}`;
  try {
    const res = await fetch(url, options);
    return res;
  } catch (err) {
    console.error(`API Fetch Error [${url}]:`, err);
    if (window.location.protocol === 'file:') {
      throw new Error(`Cannot connect to backend server at http://localhost:3000. Please start the server with 'npm start' and open http://localhost:3000 in your browser instead of opening the HTML file directly via file://.`);
    }
    throw new Error(`Backend server is not reachable at ${url}. Please start the server with 'npm start' (or double-click 'start-app.bat') and open http://localhost:3000.`);
  }
}
window.apiFetch = apiFetch;

// Global State
window.todayDoses = [];
window.medicationsList = [];
let currentFilter = 'all';
let pendingSkipDose = null;

document.addEventListener('DOMContentLoaded', () => {
  initClock();
  initNavigation();
  initAudioControls();
  initModals();
  initHistoryFilters();

  // Check connection to backend
  checkBackendHealth();

  // Load Initial Data
  fetchTodaySchedule();
  fetchMedications();
  window.adherenceAnalytics.loadStats();
  window.reminderManager.init();
});

// -------------------------------------------------------------
// Backend Health Check
// -------------------------------------------------------------
async function checkBackendHealth() {
  const banner = document.getElementById('connection-warning-banner');
  try {
    const res = await apiFetch('/api/settings');
    if (!res.ok) throw new Error('Status ' + res.status);
    if (banner) banner.classList.add('hidden');
  } catch (err) {
    if (banner) {
      const isCloud = window.location.hostname.includes('vercel.app') || (window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1' && window.location.protocol !== 'file:');
      banner.classList.remove('hidden');
      if (isCloud) {
        banner.innerHTML = `
          <div class="alert-banner-content" style="color: #fde047;">
            <span class="alert-icon">⚡</span>
            <div>
              <strong>Cloud Sync Notice:</strong> Connecting to cloud API. If this persists, ensure <code>server.js</code> and <code>vercel.json</code> are committed to your repository.
            </div>
          </div>
        `;
      } else {
        banner.innerHTML = `
          <div class="alert-banner-content" style="color: #fca5a5;">
            <span class="alert-icon">⚠️</span>
            <div>
              <strong>Backend Connection Notice:</strong> Unable to connect to the MediSync server at <code>http://localhost:3000</code>.
              Please ensure you have run <code>npm start</code> or <code>node server.js</code> in your terminal and open
              <a href="http://localhost:3000" style="color: #60a5fa; text-decoration: underline; font-weight: 700;">http://localhost:3000</a> in your browser.
            </div>
          </div>
        `;
      }
    }
  }
}

// -------------------------------------------------------------
// Live Clock
// -------------------------------------------------------------
function initClock() {
  const timeEl = document.getElementById('live-clock-time');
  const dateEl = document.getElementById('live-clock-date');

  function update() {
    const now = new Date();
    if (timeEl) {
      timeEl.textContent = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    }
    if (dateEl) {
      dateEl.textContent = now.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' });
    }
  }

  update();
  setInterval(update, 1000);
}

// -------------------------------------------------------------
// Navigation Tabs
// -------------------------------------------------------------
function initNavigation() {
  const navBtns = document.querySelectorAll('.nav-tab-btn');
  const sections = document.querySelectorAll('.tab-section');

  navBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      window.medicalAudio.playSoftClick();
      const targetId = btn.dataset.target;

      navBtns.forEach(b => b.classList.remove('active'));
      sections.forEach(s => s.classList.remove('active'));

      btn.classList.add('active');
      const targetSec = document.getElementById(targetId);
      if (targetSec) targetSec.classList.add('active');

      if (targetId === 'tab-analytics') {
        window.adherenceAnalytics.loadStats();
      } else if (targetId === 'tab-cabinet') {
        fetchMedications();
      } else if (targetId === 'tab-history') {
        fetchHistoryLogs();
      } else if (targetId === 'tab-schedule') {
        fetchTodaySchedule();
      }
    });
  });
}

// -------------------------------------------------------------
// Audio & Notification Controls
// -------------------------------------------------------------
function initAudioControls() {
  const soundToggle = document.getElementById('toggle-sound');
  const testAlarmBtn = document.getElementById('btn-test-alarm');
  const notifBadge = document.getElementById('notif-permission-badge');

  if (soundToggle) {
    soundToggle.addEventListener('change', (e) => {
      window.medicalAudio.setEnabled(e.target.checked);
      if (e.target.checked) window.medicalAudio.playSoftClick();
    });
  }

  if (testAlarmBtn) {
    testAlarmBtn.addEventListener('click', () => {
      window.reminderManager.triggerTestReminder();
    });
  }

  if (notifBadge) {
    notifBadge.addEventListener('click', () => {
      window.reminderManager.requestPermission();
    });
  }
}

// -------------------------------------------------------------
// Schedule & Dose Actions
// -------------------------------------------------------------
async function fetchTodaySchedule() {
  try {
    const res = await apiFetch('/api/schedule/today');
    const data = await res.json();
    if (data.success) {
      window.todayDoses = data.data;
      renderSchedule(window.todayDoses);
      updateTopScheduleBanner(window.todayDoses);
    }
  } catch (err) {
    console.error('Error fetching today schedule:', err);
  }
}

function updateTopScheduleBanner(doses) {
  const total = doses.length;
  const taken = doses.filter(d => d.status === 'taken').length;
  const due = doses.filter(d => d.status === 'due' || d.status === 'pending').length;

  const countEl = document.getElementById('today-progress-count');
  const barEl = document.getElementById('today-progress-fill');
  const dueBadge = document.getElementById('today-due-badge');

  if (countEl) countEl.textContent = `${taken} of ${total} doses taken`;
  if (barEl) {
    const pct = total > 0 ? (taken / total) * 100 : 0;
    barEl.style.width = `${pct}%`;
  }
  if (dueBadge) {
    if (due === 0) {
      dueBadge.innerHTML = '<span class="status-pill status-taken">✨ All Done for Today!</span>';
    } else {
      dueBadge.innerHTML = `<span class="status-pill status-due">⏰ ${due} Upcoming / Due</span>`;
    }
  }
}

function renderSchedule(doses) {
  const container = document.getElementById('schedule-cards-grid');
  if (!container) return;

  const filtered = doses.filter(dose => {
    if (currentFilter === 'all') return true;
    return dose.period === currentFilter;
  });

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">💊</div>
        <h3>No doses scheduled for this time slot</h3>
        <p>Switch to "All Times" or add a new medication schedule.</p>
      </div>
    `;
    return;
  }

  let html = '';
  filtered.forEach(dose => {
    const isTaken = dose.status === 'taken';
    const isSkipped = dose.status === 'skipped';
    const isSnoozed = dose.status === 'snoozed';
    const isDue = dose.status === 'due';

    let cardStatusClass = '';
    let statusBadge = '<span class="status-pill status-pending">Scheduled</span>';

    if (isTaken) {
      cardStatusClass = 'card-taken';
      const timeTakenStr = dose.actual_timestamp 
        ? new Date(dose.actual_timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        : 'Recorded';
      statusBadge = `<span class="status-pill status-taken">✓ Taken at ${timeTakenStr}</span>`;
    } else if (isSkipped) {
      cardStatusClass = 'card-skipped';
      statusBadge = `<span class="status-pill status-skipped">✕ Skipped (${dose.skip_reason || 'Recorded'})</span>`;
    } else if (isSnoozed) {
      cardStatusClass = 'card-snoozed';
      statusBadge = '<span class="status-pill status-snoozed">⏳ Snoozed</span>';
    } else if (isDue) {
      cardStatusClass = 'card-due';
      statusBadge = '<span class="status-pill status-due animate-pulse">⏰ Due Now</span>';
    }

    const lowStockWarning = dose.stock_current <= dose.stock_refill_threshold
      ? `<span class="badge-stock-low">⚠️ ${dose.stock_current} left</span>`
      : `<span class="badge-stock-ok">${dose.stock_current} in stock</span>`;

    html += `
      <div class="dose-card ${cardStatusClass}" data-med-id="${dose.medication_id}" data-time="${dose.scheduled_time}">
        <div class="dose-card-header">
          <div class="pill-visual" style="background: linear-gradient(135deg, ${dose.color_primary} 50%, ${dose.color_secondary} 50%);">
            <span class="pill-form-icon">${getFormEmoji(dose.form)}</span>
          </div>
          <div class="dose-header-details">
            <div class="dose-time-badge">🕒 ${formatTime12h(dose.scheduled_time)}</div>
            <h3 class="dose-med-name">${escapeHtml(dose.medication_name)}</h3>
            <div class="dose-meta">
              <span class="dose-amount">${escapeHtml(dose.dosage)}</span>
              <span class="dose-form">${escapeHtml(dose.form)}</span>
              ${lowStockWarning}
            </div>
          </div>
        </div>

        <div class="dose-instructions">
          <span class="instruction-icon">📋</span>
          <span class="instruction-text">${escapeHtml(dose.instructions || 'Take as prescribed')}</span>
        </div>

        <div class="dose-status-row">
          ${statusBadge}
          <span class="doctor-tag">${escapeHtml(dose.doctor_name || 'Rx Doctor')}</span>
        </div>

        <div class="dose-card-actions">
          ${!isTaken ? `
            <button class="btn btn-action-take" onclick="handleMarkTaken(${dose.medication_id}, '${dose.scheduled_date}', '${dose.scheduled_time}', event)">
              <span class="btn-icon">✓</span> Mark as Taken
            </button>
            <button class="btn btn-action-snooze" onclick="handleSnooze(${dose.medication_id}, '${dose.scheduled_date}', '${dose.scheduled_time}', 15)">
              <span class="btn-icon">⏳</span> 15m
            </button>
            <button class="btn btn-action-skip" onclick="openSkipModal(${dose.medication_id}, '${dose.scheduled_date}', '${dose.scheduled_time}', '${escapeHtml(dose.medication_name)}')">
              <span class="btn-icon">✕</span> Skip
            </button>
          ` : `
            <button class="btn btn-action-undo" onclick="handleUndoDose(${dose.medication_id}, '${dose.scheduled_date}', '${dose.scheduled_time}')">
              <span class="btn-icon">↺</span> Undo / Edit
            </button>
          `}
        </div>
      </div>
    `;
  });

  container.innerHTML = html;
}

// Filter Schedule
window.setScheduleFilter = function (period, btn) {
  window.medicalAudio.playSoftClick();
  currentFilter = period;
  document.querySelectorAll('.filter-chip').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderSchedule(window.todayDoses);
};

// Quick Action: Take Pill
window.handleMarkTaken = async function (medId, dateStr, timeStr, event) {
  try {
    window.medicalAudio.playPillTakenChime();
    triggerCelebrationConfetti(event ? event.clientX : null, event ? event.clientY : null);

    const res = await apiFetch('/api/adherence/record', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        medication_id: medId,
        scheduled_date: dateStr,
        scheduled_time: timeStr,
        status: 'taken'
      })
    });
    const result = await res.json();
    if (result.success) {
      showToast('Medication marked as taken! Great adherence!', 'success');
      await fetchTodaySchedule();
      await fetchMedications();
      window.adherenceAnalytics.loadStats();
    }
  } catch (err) {
    showToast(err.message, 'error');
  }
};

// Quick Action: Snooze
window.handleSnooze = async function (medId, dateStr, timeStr, minutes) {
  try {
    window.medicalAudio.playSoftClick();
    const res = await apiFetch('/api/adherence/snooze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        medication_id: medId,
        scheduled_date: dateStr,
        scheduled_time: timeStr,
        snooze_minutes: minutes
      })
    });
    const result = await res.json();
    if (result.success) {
      showToast(`Reminder snoozed for ${minutes} minutes.`, 'info');
      await fetchTodaySchedule();
    }
  } catch (err) {
    showToast(err.message, 'error');
  }
};

// Quick Action: Undo
window.handleUndoDose = async function (medId, dateStr, timeStr) {
  try {
    window.medicalAudio.playSoftClick();
    const res = await apiFetch('/api/adherence/record', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        medication_id: medId,
        scheduled_date: dateStr,
        scheduled_time: timeStr,
        status: 'pending'
      })
    });
    const result = await res.json();
    if (result.success) {
      showToast('Dose status reset to pending.', 'info');
      await fetchTodaySchedule();
      await fetchMedications();
      window.adherenceAnalytics.loadStats();
    }
  } catch (err) {
    showToast(err.message, 'error');
  }
};

// -------------------------------------------------------------
// Skip Reason Modal Handling
// -------------------------------------------------------------
window.openSkipModal = function (medId, dateStr, timeStr, medName) {
  window.medicalAudio.playSoftClick();
  pendingSkipDose = { medId, dateStr, timeStr };
  document.getElementById('skip-modal-med-name').textContent = medName;
  document.getElementById('skip-reason-notes').value = '';
  document.getElementById('skip-reason-modal').classList.add('active');
};

window.closeSkipModal = function () {
  document.getElementById('skip-reason-modal').classList.remove('active');
  pendingSkipDose = null;
};

window.confirmSkipDose = async function () {
  if (!pendingSkipDose) return;

  const selectedRadio = document.querySelector('input[name="skip_reason"]:checked');
  const notes = document.getElementById('skip-reason-notes').value.trim();
  const reason = selectedRadio ? selectedRadio.value : 'Other / Personal choice';

  try {
    const res = await apiFetch('/api/adherence/record', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        medication_id: pendingSkipDose.medId,
        scheduled_date: pendingSkipDose.dateStr,
        scheduled_time: pendingSkipDose.timeStr,
        status: 'skipped',
        skip_reason: reason,
        notes: notes
      })
    });
    const result = await res.json();
    if (result.success) {
      showToast('Dose recorded as skipped with reason logged.', 'info');
      closeSkipModal();
      await fetchTodaySchedule();
      window.adherenceAnalytics.loadStats();
    }
  } catch (err) {
    showToast(err.message, 'error');
  }
};

// -------------------------------------------------------------
// Real-Time Reminder Alert Modal Handlers
// -------------------------------------------------------------
window.handleAlertModalTake = async function () {
  const dose = window.reminderManager.activeAlertDose;
  if (!dose) return;
  window.reminderManager.closeReminderModal();
  await handleMarkTaken(dose.medication_id, dose.scheduled_date || new Date().toISOString().split('T')[0], dose.scheduled_time);
};

window.handleAlertModalSnooze = async function (mins = 15) {
  const dose = window.reminderManager.activeAlertDose;
  if (!dose) return;
  window.reminderManager.closeReminderModal();
  await handleSnooze(dose.medication_id, dose.scheduled_date || new Date().toISOString().split('T')[0], dose.scheduled_time, mins);
};

window.handleAlertModalSkip = function () {
  const dose = window.reminderManager.activeAlertDose;
  if (!dose) return;
  window.reminderManager.closeReminderModal();
  openSkipModal(dose.medication_id, dose.scheduled_date || new Date().toISOString().split('T')[0], dose.scheduled_time, dose.medication_name);
};

// -------------------------------------------------------------
// Medications Cabinet & Refills
// -------------------------------------------------------------
async function fetchMedications() {
  try {
    const res = await apiFetch('/api/medications');
    const data = await res.json();
    if (data.success) {
      window.medicationsList = data.data;
      renderMedicationsCabinet(window.medicationsList);
      updateLowStockBanner(window.medicationsList);
      populateMedicationSelectFilter(window.medicationsList);
    }
  } catch (err) {
    console.error('Error fetching medications:', err);
  }
}

function updateLowStockBanner(meds) {
  const lowStock = meds.filter(m => m.is_low_stock);
  const banner = document.getElementById('low-stock-alert-banner');
  if (!banner) return;

  if (lowStock.length > 0) {
    banner.classList.remove('hidden');
    banner.innerHTML = `
      <div class="alert-banner-content">
        <span class="alert-icon">⚠️</span>
        <div>
          <strong>Refill Alert:</strong> ${lowStock.length} medication(s) require refilling soon: 
          <em>${lowStock.map(m => `${m.name} (${m.stock_current} left)`).join(', ')}</em>
        </div>
      </div>
      <button class="btn btn-sm btn-outline" onclick="document.querySelector('[data-target=\\'tab-cabinet\\']').click()">Review Cabinet</button>
    `;
  } else {
    banner.classList.add('hidden');
  }
}

function renderMedicationsCabinet(meds) {
  const container = document.getElementById('medication-cards-grid');
  if (!container) return;

  if (meds.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📋</div>
        <h3>No medications added yet</h3>
        <p>Click "Add Medication" to configure your prescriptions and daily vitamins.</p>
      </div>
    `;
    return;
  }

  let html = '';
  meds.forEach(med => {
    const isLow = med.is_low_stock;
    const timesList = Array.isArray(med.times) ? med.times : [];
    const timesFormatted = timesList.length > 0 ? timesList.map(t => formatTime12h(t)).join(', ') : 'No fixed time';

    html += `
      <div class="med-cabinet-card ${isLow ? 'card-low-stock' : ''}">
        <div class="cabinet-card-top">
          <div class="pill-visual" style="background: linear-gradient(135deg, ${med.color_primary} 50%, ${med.color_secondary} 50%);">
            <span class="pill-form-icon">${getFormEmoji(med.form)}</span>
          </div>
          <div class="cabinet-details">
            <span class="category-tag">${escapeHtml(med.category || 'Prescription')}</span>
            <h3 class="cabinet-med-title">${escapeHtml(med.name)}</h3>
            <div class="cabinet-med-dosage">${escapeHtml(med.dosage)} • ${escapeHtml(med.frequency)}</div>
          </div>
        </div>

        <div class="cabinet-schedule-times">
          <span class="times-icon">🕒</span>
          <span>Schedule: <strong>${timesFormatted}</strong></span>
        </div>

        <div class="cabinet-instructions">
          <span class="inst-icon">ℹ️</span>
          <span>${escapeHtml(med.instructions || 'Follow doctor directions')}</span>
        </div>

        <div class="cabinet-stock-bar-wrapper">
          <div class="stock-label-row">
            <span>Pill Inventory</span>
            <span class="stock-count-num ${isLow ? 'text-danger' : 'text-success'}">
              ${med.stock_current} doses left ${isLow ? '(Refill needed!)' : ''}
            </span>
          </div>
          <div class="progress-track">
            <div class="progress-fill ${isLow ? 'bg-danger' : 'bg-success'}" style="width: ${Math.min(100, (med.stock_current / 60) * 100)}%;"></div>
          </div>
        </div>

        <div class="cabinet-doctor-info">
          <span>👨‍⚕️ ${escapeHtml(med.doctor_name || 'Primary Care')}</span>
          <span>Rx: ${escapeHtml(med.rx_number || 'N/A')}</span>
        </div>

        <div class="cabinet-actions">
          <button class="btn btn-sm btn-primary" onclick="openRefillModal(${med.id}, '${escapeHtml(med.name)}', ${med.stock_current})">
            + Refill Stock
          </button>
          <button class="btn btn-sm btn-danger-outline" onclick="handleArchiveMed(${med.id}, '${escapeHtml(med.name)}')">
            Archive
          </button>
        </div>
      </div>
    `;
  });

  container.innerHTML = html;
}

// Refill Modal
let refillTargetId = null;
window.openRefillModal = function (id, name, currentStock) {
  refillTargetId = id;
  document.getElementById('refill-med-name').textContent = name;
  document.getElementById('refill-current-stock').textContent = currentStock;
  document.getElementById('refill-quantity-input').value = 30;
  document.getElementById('refill-modal').classList.add('active');
};

window.closeRefillModal = function () {
  document.getElementById('refill-modal').classList.remove('active');
  refillTargetId = null;
};

window.confirmRefillStock = async function () {
  if (!refillTargetId) return;
  const qty = parseInt(document.getElementById('refill-quantity-input').value, 10) || 30;

  try {
    const res = await apiFetch(`/api/medications/${refillTargetId}/refill`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ quantity: qty })
    });
    const result = await res.json();
    if (result.success) {
      showToast(`Added ${qty} doses to stock.`, 'success');
      closeRefillModal();
      await fetchMedications();
      await fetchTodaySchedule();
    }
  } catch (err) {
    showToast(err.message, 'error');
  }
};

window.handleArchiveMed = async function (id, name) {
  if (!confirm(`Are you sure you want to archive "${name}" from your active cabinet?`)) return;

  try {
    const res = await apiFetch(`/api/medications/${id}`, { method: 'DELETE' });
    const result = await res.json();
    if (result.success) {
      showToast(`Medication "${name}" archived.`, 'info');
      await fetchMedications();
      await fetchTodaySchedule();
      window.adherenceAnalytics.loadStats();
    }
  } catch (err) {
    showToast(err.message, 'error');
  }
};

// -------------------------------------------------------------
// History Audit Table & Doctor CSV Export
// -------------------------------------------------------------
function initHistoryFilters() {
  const searchInput = document.getElementById('history-search');
  const statusSelect = document.getElementById('history-filter-status');
  const medSelect = document.getElementById('history-filter-med');
  const exportBtn = document.getElementById('btn-export-csv');
  const printBtn = document.getElementById('btn-print-report');

  if (searchInput) {
    searchInput.addEventListener('input', debounce(fetchHistoryLogs, 300));
  }
  if (statusSelect) {
    statusSelect.addEventListener('change', fetchHistoryLogs);
  }
  if (medSelect) {
    medSelect.addEventListener('change', fetchHistoryLogs);
  }
  if (exportBtn) {
    exportBtn.addEventListener('click', () => {
      window.location.href = `${API_BASE}/api/history/export-csv`;
    });
  }
  if (printBtn) {
    printBtn.addEventListener('click', () => {
      window.print();
    });
  }
}

function populateMedicationSelectFilter(meds) {
  const select = document.getElementById('history-filter-med');
  if (!select) return;

  let html = '<option value="">All Prescriptions & Supplements</option>';
  meds.forEach(m => {
    html += `<option value="${m.id}">${escapeHtml(m.name)} (${escapeHtml(m.dosage)})</option>`;
  });
  select.innerHTML = html;
}

async function fetchHistoryLogs() {
  const search = document.getElementById('history-search')?.value || '';
  const status = document.getElementById('history-filter-status')?.value || 'all';
  const medId = document.getElementById('history-filter-med')?.value || '';

  const params = new URLSearchParams();
  if (search) params.append('search', search);
  if (status && status !== 'all') params.append('status', status);
  if (medId) params.append('medicationId', medId);

  try {
    const res = await apiFetch(`/api/history?${params.toString()}`);
    const data = await res.json();
    if (data.success) {
      renderHistoryTable(data.data);
    }
  } catch (err) {
    console.error('Error fetching history:', err);
  }
}

function renderHistoryTable(logs) {
  const tbody = document.getElementById('history-table-body');
  const countEl = document.getElementById('history-count-badge');
  if (!tbody) return;

  if (countEl) countEl.textContent = `${logs.length} Logged Events`;

  if (logs.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" class="text-center py-4">No adherence records found matching your filters.</td>
      </tr>
    `;
    return;
  }

  let html = '';
  logs.forEach(log => {
    let statusClass = 'status-pending';
    let statusLabel = 'Scheduled';

    if (log.status === 'taken') {
      statusClass = 'status-taken';
      statusLabel = '✓ Taken';
    } else if (log.status === 'skipped') {
      statusClass = 'status-skipped';
      statusLabel = '✕ Skipped';
    } else if (log.status === 'snoozed') {
      statusClass = 'status-snoozed';
      statusLabel = '⏳ Snoozed';
    } else if (log.status === 'missed') {
      statusClass = 'status-skipped';
      statusLabel = '⚠️ Missed';
    }

    const actualTime = log.actual_timestamp
      ? new Date(log.actual_timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      : '—';

    html += `
      <tr>
        <td><strong>${log.scheduled_date}</strong></td>
        <td>${formatTime12h(log.scheduled_time)}</td>
        <td>
          <div class="table-med-info">
            <strong>${escapeHtml(log.medication_name)}</strong>
            <span class="text-muted">${escapeHtml(log.dosage)}</span>
          </div>
        </td>
        <td><span class="status-pill ${statusClass}">${statusLabel}</span></td>
        <td>${actualTime}</td>
        <td>${escapeHtml(log.skip_reason || log.notes || '—')}</td>
        <td><span class="text-muted">${escapeHtml(log.doctor_name || 'Dr. Physician')}</span></td>
      </tr>
    `;
  });

  tbody.innerHTML = html;
}

// -------------------------------------------------------------
// Add Medication Modal & Time Slots
// -------------------------------------------------------------
function initModals() {
  const addMedBtn = document.getElementById('btn-open-add-med');
  const modal = document.getElementById('add-med-modal');
  const addTimeSlotBtn = document.getElementById('btn-add-time-slot');

  if (addMedBtn && modal) {
    addMedBtn.addEventListener('click', () => {
      window.medicalAudio.playSoftClick();
      modal.classList.add('active');
    });
  }

  if (addTimeSlotBtn) {
    addTimeSlotBtn.addEventListener('click', () => {
      const container = document.getElementById('time-slots-container');
      const row = document.createElement('div');
      row.className = 'time-slot-input-row';
      row.innerHTML = `
        <input type="time" class="form-input time-input" value="12:00" required>
        <button type="button" class="btn btn-icon-only btn-remove-time" onclick="this.parentElement.remove()">✕</button>
      `;
      container.appendChild(row);
    });
  }

  // Add Medication Form Submit
  const form = document.getElementById('add-med-form');
  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();

      const timeInputs = document.querySelectorAll('.time-input');
      const times = Array.from(timeInputs).map(inp => inp.value).filter(Boolean);

      if (!times.length) {
        showToast('Please specify at least one schedule time.', 'error');
        return;
      }

      const medData = {
        name: document.getElementById('new-med-name').value.trim(),
        dosage: document.getElementById('new-med-dosage').value.trim(),
        form: document.getElementById('new-med-form').value,
        color_primary: document.getElementById('new-med-color1').value,
        color_secondary: document.getElementById('new-med-color2').value,
        instructions: document.getElementById('new-med-instructions').value.trim(),
        category: document.getElementById('new-med-category').value.trim(),
        frequency: document.getElementById('new-med-frequency').value,
        times: times,
        stock_current: parseInt(document.getElementById('new-med-stock').value, 10) || 30,
        stock_refill_threshold: parseInt(document.getElementById('new-med-threshold').value, 10) || 7,
        doctor_name: document.getElementById('new-med-doctor').value.trim() || 'Dr. Physician',
        rx_number: document.getElementById('new-med-rx').value.trim() || 'RX-' + Math.floor(100000 + Math.random() * 900000)
      };

      try {
        const res = await apiFetch('/api/medications', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(medData)
        });

        let result;
        try {
          result = await res.json();
        } catch (jsonErr) {
          throw new Error(`Server returned status ${res.status}: ${res.statusText || 'Unknown error'}`);
        }

        if (res.ok && result.success) {
          showToast(`Prescription "${medData.name}" added successfully!`, 'success');
          closeAddMedModal();
          await fetchMedications();
          await fetchTodaySchedule();
          window.adherenceAnalytics.loadStats();
        } else {
          showToast(result.error || 'Failed to add medication', 'error');
        }
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  }
}

function resetTimeSlots() {
  const container = document.getElementById('time-slots-container');
  if (container) {
    container.innerHTML = `
      <div class="time-slot-input-row">
        <input type="time" class="form-input time-input" value="08:00" required>
      </div>
    `;
  }
}

window.closeAddMedModal = function () {
  const modal = document.getElementById('add-med-modal');
  if (modal) modal.classList.remove('active');
  const form = document.getElementById('add-med-form');
  if (form) form.reset();
  resetTimeSlots();
};

// -------------------------------------------------------------
// Toast Notifications & Particle Celebration
// -------------------------------------------------------------
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `
    <span class="toast-icon">${type === 'success' ? '✓' : type === 'error' ? '⚠️' : 'ℹ️'}</span>
    <span class="toast-message">${escapeHtml(message)}</span>
  `;

  container.appendChild(toast);
  setTimeout(() => {
    toast.classList.add('toast-fadeout');
    setTimeout(() => toast.remove(), 400);
  }, 4500);
}

function triggerCelebrationConfetti(x, y) {
  const count = 28;
  const colors = ['#10b981', '#3b82f6', '#f59e0b', '#ec4899', '#8b5cf6', '#06b6d4'];
  const startX = x || (window.innerWidth / 2);
  const startY = y || (window.innerHeight / 2);

  for (let i = 0; i < count; i++) {
    const p = document.createElement('div');
    p.className = 'confetti-particle';
    p.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
    p.style.left = `${startX}px`;
    p.style.top = `${startY}px`;

    const angle = Math.random() * 2 * Math.PI;
    const distance = 40 + Math.random() * 120;
    const destX = Math.cos(angle) * distance;
    const destY = Math.sin(angle) * distance - 20;

    p.style.setProperty('--dx', `${destX}px`);
    p.style.setProperty('--dy', `${destY}px`);

    document.body.appendChild(p);
    setTimeout(() => p.remove(), 800);
  }
}

// -------------------------------------------------------------
// Utilities
// -------------------------------------------------------------
function formatTime12h(timeStr) {
  if (!timeStr) return '';
  const [hourStr, minStr] = timeStr.split(':');
  let hour = parseInt(hourStr, 10);
  const ampm = hour >= 12 ? 'PM' : 'AM';
  hour = hour % 12 || 12;
  return `${hour}:${minStr} ${ampm}`;
}

function getFormEmoji(form) {
  switch (form) {
    case 'capsule': return '💊';
    case 'tablet': return '⚪';
    case 'softgel': return '🟡';
    case 'liquid': return '🧪';
    case 'inhaler': return '💨';
    case 'injection': return '💉';
    default: return '💊';
  }
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function debounce(fn, ms) {
  let timeout;
  return function (...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => fn.apply(this, args), ms);
  };
}
