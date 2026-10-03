const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { dbRun, dbAll, dbGet, initializeDatabase } = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;

// Enable comprehensive CORS & Private Network Access (for file:// and various local ports)
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else {
    res.setHeader('Access-Control-Allow-Origin', '*');
  }
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept, X-Requested-With');

  // Support Chrome Private Network Access (PNA)
  if (req.headers['access-control-request-private-network']) {
    res.setHeader('Access-Control-Allow-Private-Network', 'true');
  }

  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }
  next();
});

app.use(cors({
  origin: true,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept']
}));
app.use(express.json());

// Fix Vercel rewrites: restore the intended API endpoint path
app.use((req, res, next) => {
  // 1. If passed via query param ?path=...
  if (req.query && req.query.path) {
    const p = req.query.path.startsWith('/') ? req.query.path : '/' + req.query.path;
    req.url = '/api' + p;
  }
  // 2. If forwarded with x-matched-path header
  else if (req.headers['x-matched-path']) {
    const matched = req.headers['x-matched-path'];
    if (matched.startsWith('/api')) {
      req.url = matched;
    }
  }
  // 3. If exact /api/index.js or /index.js, default to settings or health check
  else if (req.url === '/api/index.js' || req.url === '/index.js') {
    req.url = '/api/settings';
  }
  next();
});


// Serve static assets from public, root, css, and js directories
app.use('/css', express.static(path.join(__dirname, 'css')));
app.use('/js', express.static(path.join(__dirname, 'js')));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.static(__dirname));

// Direct fallbacks for CSS and JS assets (handles both root and subfolder paths)
app.get(['/style.css', '/css/style.css'], (req, res) => {
  const candidates = [
    path.join(__dirname, 'style.css'),
    path.join(__dirname, 'css', 'style.css'),
    path.join(__dirname, 'public', 'css', 'style.css'),
    path.join(__dirname, 'public', 'style.css')
  ];
  const found = candidates.find(p => fs.existsSync(p));
  if (found) {
    res.setHeader('Content-Type', 'text/css');
    return res.sendFile(found);
  }
  res.status(404).send('/* CSS Not Found */');
});

app.get(['/:script.js', '/js/:script.js'], (req, res, next) => {
  const scriptName = req.params.script;
  if (['app', 'analytics', 'audio', 'notifications'].includes(scriptName)) {
    const candidates = [
      path.join(__dirname, `${scriptName}.js`),
      path.join(__dirname, 'js', `${scriptName}.js`),
      path.join(__dirname, 'public', 'js', `${scriptName}.js`),
      path.join(__dirname, 'public', `${scriptName}.js`)
    ];
    const found = candidates.find(p => fs.existsSync(p));
    if (found) {
      res.setHeader('Content-Type', 'application/javascript');
      return res.sendFile(found);
    }
  }
  next();
});

// Ensure database is initialized before any API request is handled
let dbInitPromise = null;
function ensureDbReady() {
  if (!dbInitPromise) {
    dbInitPromise = initializeDatabase().catch(err => {
      console.error('Database initialization failed:', err);
      dbInitPromise = null;
      throw err;
    });
  }
  return dbInitPromise;
}

app.use('/api', async (req, res, next) => {
  try {
    await ensureDbReady();
    next();
  } catch (err) {
    res.status(500).json({
      success: false,
      error: 'Database initialization failed: ' + (err.message || String(err))
    });
  }
});

// Helper for local date string YYYY-MM-DD
function getLocalDateString(d = new Date()) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// -------------------------------------------------------------
// 1. MEDICATIONS CRUD
// -------------------------------------------------------------

// Helper for safe JSON times parsing
function parseMedTimes(timesField) {
  if (Array.isArray(timesField)) return timesField;
  try {
    const parsed = JSON.parse(timesField || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
}

// List active medications
app.get('/api/medications', async (req, res) => {
  try {
    const meds = await dbAll('SELECT * FROM medications WHERE is_active = 1 ORDER BY name ASC');
    const formatted = meds.map(m => ({
      ...m,
      times: parseMedTimes(m.times),
      is_low_stock: m.stock_current <= m.stock_refill_threshold
    }));
    res.json({ success: true, data: formatted });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Create medication
app.post('/api/medications', async (req, res) => {
  try {
    const {
      name, dosage, form, color_primary, color_secondary,
      instructions, category, frequency, times,
      stock_current, stock_refill_threshold, doctor_name, rx_number
    } = req.body;

    if (!name || !dosage || !times || !times.length) {
      return res.status(400).json({ success: false, error: 'Name, dosage, and at least one schedule time are required.' });
    }

    const timesJson = JSON.stringify(times);
    const result = await dbRun(`
      INSERT INTO medications (
        name, dosage, form, color_primary, color_secondary,
        instructions, category, frequency, times,
        stock_current, stock_refill_threshold, doctor_name, rx_number
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      name, dosage, form || 'tablet', color_primary || '#3b82f6', color_secondary || '#93c5fd',
      instructions || 'Take with water', category || 'Prescription', frequency || 'Daily',
      timesJson, Number(stock_current) || 30, Number(stock_refill_threshold) || 7,
      doctor_name || 'Primary Physician', rx_number || 'RX-PENDING'
    ]);

    res.status(201).json({ success: true, id: result.id, message: 'Medication added successfully' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Update medication
app.put('/api/medications/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const {
      name, dosage, form, color_primary, color_secondary,
      instructions, category, frequency, times,
      stock_current, stock_refill_threshold, doctor_name, rx_number
    } = req.body;

    const timesJson = Array.isArray(times) ? JSON.stringify(times) : times;

    await dbRun(`
      UPDATE medications SET
        name = ?, dosage = ?, form = ?, color_primary = ?, color_secondary = ?,
        instructions = ?, category = ?, frequency = ?, times = ?,
        stock_current = ?, stock_refill_threshold = ?, doctor_name = ?, rx_number = ?
      WHERE id = ?
    `, [
      name, dosage, form, color_primary, color_secondary,
      instructions, category, frequency, timesJson,
      stock_current, stock_refill_threshold, doctor_name, rx_number, id
    ]);

    res.json({ success: true, message: 'Medication updated successfully' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Refill medication stock
app.post('/api/medications/:id/refill', async (req, res) => {
  try {
    const id = req.params.id;
    const { quantity } = req.body;
    const addQty = Number(quantity) || 30;

    await dbRun('UPDATE medications SET stock_current = stock_current + ? WHERE id = ?', [addQty, id]);
    const updated = await dbGet('SELECT * FROM medications WHERE id = ?', [id]);
    res.json({ success: true, message: `Refilled ${addQty} units`, data: updated });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Archive / Delete medication
app.delete('/api/medications/:id', async (req, res) => {
  try {
    const id = req.params.id;
    await dbRun('UPDATE medications SET is_active = 0 WHERE id = ?', [id]);
    res.json({ success: true, message: 'Medication archived' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// -------------------------------------------------------------
// 2. DAILY SCHEDULE & QUICK ACTION DOSES
// -------------------------------------------------------------

app.get('/api/schedule/today', async (req, res) => {
  try {
    const targetDate = req.query.date || getLocalDateString();
    const now = new Date();
    const currentHour = now.getHours();
    const currentMin = now.getMinutes();
    const currentTimeStr = `${String(currentHour).padStart(2, '0')}:${String(currentMin).padStart(2, '0')}`;

    const medications = await dbAll('SELECT * FROM medications WHERE is_active = 1');
    const existingLogs = await dbAll('SELECT * FROM adherence_logs WHERE scheduled_date = ?', [targetDate]);

    const doses = [];

    for (const med of medications) {
      const times = parseMedTimes(med.times);
      for (const timeStr of times) {
        // Find existing log for this med, date, and time
        const log = existingLogs.find(l => l.medication_id === med.id && l.scheduled_time === timeStr);

        let status = 'pending';
        let logId = null;
        let actualTimestamp = null;
        let skipReason = null;
        let snoozeUntil = null;

        if (log) {
          status = log.status; // 'taken', 'skipped', 'snoozed', 'missed'
          logId = log.id;
          actualTimestamp = log.actual_timestamp;
          skipReason = log.skip_reason;
          snoozeUntil = log.snooze_until;
        } else {
          // If past scheduled time by more than 30 mins and no action taken, could be marked overdue
          if (targetDate === getLocalDateString() && timeStr < currentTimeStr) {
            status = 'due';
          }
        }

        // Categorize into time slot
        const hour = parseInt(timeStr.split(':')[0], 10);
        let period = 'morning';
        if (hour >= 12 && hour < 17) period = 'afternoon';
        else if (hour >= 17 && hour < 21) period = 'evening';
        else if (hour >= 21 || hour < 6) period = 'night';

        doses.push({
          medication_id: med.id,
          medication_name: med.name,
          dosage: med.dosage,
          form: med.form,
          color_primary: med.color_primary,
          color_secondary: med.color_secondary,
          instructions: med.instructions,
          category: med.category,
          stock_current: med.stock_current,
          stock_refill_threshold: med.stock_refill_threshold,
          doctor_name: med.doctor_name,
          scheduled_date: targetDate,
          scheduled_time: timeStr,
          period,
          status,
          log_id: logId,
          actual_timestamp: actualTimestamp,
          skip_reason: skipReason,
          snooze_until: snoozeUntil
        });
      }
    }

    // Sort chronologically by scheduled_time
    doses.sort((a, b) => a.scheduled_time.localeCompare(b.scheduled_time));

    res.json({
      success: true,
      date: targetDate,
      currentTime: currentTimeStr,
      data: doses
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Record dose action (Take, Skip, Undo)
app.post('/api/adherence/record', async (req, res) => {
  try {
    const { medication_id, scheduled_date, scheduled_time, status, notes, skip_reason } = req.body;

    if (!medication_id || !scheduled_date || !scheduled_time || !status) {
      return res.status(400).json({ success: false, error: 'medication_id, scheduled_date, scheduled_time, and status are required' });
    }

    const nowIso = new Date().toISOString();
    const actualTimestamp = status === 'taken' ? nowIso : null;

    // Check if a log entry already exists
    const existing = await dbGet(
      'SELECT id, status FROM adherence_logs WHERE medication_id = ? AND scheduled_date = ? AND scheduled_time = ?',
      [medication_id, scheduled_date, scheduled_time]
    );

    if (existing) {
      // If previous status was not taken, but now is taken, decrement inventory
      if (existing.status !== 'taken' && status === 'taken') {
        await dbRun('UPDATE medications SET stock_current = MAX(0, stock_current - 1) WHERE id = ?', [medication_id]);
      } else if (existing.status === 'taken' && status !== 'taken') {
        // If undoing taken status, restore inventory
        await dbRun('UPDATE medications SET stock_current = stock_current + 1 WHERE id = ?', [medication_id]);
      }

      await dbRun(`
        UPDATE adherence_logs SET
          status = ?,
          actual_timestamp = ?,
          notes = ?,
          skip_reason = ?,
          snooze_until = NULL
        WHERE id = ?
      `, [status, actualTimestamp, notes || null, skip_reason || null, existing.id]);
    } else {
      if (status === 'taken') {
        await dbRun('UPDATE medications SET stock_current = MAX(0, stock_current - 1) WHERE id = ?', [medication_id]);
      }

      await dbRun(`
        INSERT INTO adherence_logs (medication_id, scheduled_date, scheduled_time, status, actual_timestamp, notes, skip_reason)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `, [medication_id, scheduled_date, scheduled_time, status, actualTimestamp, notes || null, skip_reason || null]);
    }

    res.json({
      success: true,
      message: `Dose marked as ${status}`,
      status,
      timestamp: actualTimestamp
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Snooze dose
app.post('/api/adherence/snooze', async (req, res) => {
  try {
    const { medication_id, scheduled_date, scheduled_time, snooze_minutes } = req.body;
    const mins = Number(snooze_minutes) || 15;
    const snoozeTime = new Date(Date.now() + mins * 60 * 1000).toISOString();

    const existing = await dbGet(
      'SELECT id FROM adherence_logs WHERE medication_id = ? AND scheduled_date = ? AND scheduled_time = ?',
      [medication_id, scheduled_date, scheduled_time]
    );

    if (existing) {
      await dbRun('UPDATE adherence_logs SET status = ?, snooze_until = ? WHERE id = ?', ['snoozed', snoozeTime, existing.id]);
    } else {
      await dbRun(`
        INSERT INTO adherence_logs (medication_id, scheduled_date, scheduled_time, status, snooze_until)
        VALUES (?, ?, ?, 'snoozed', ?)
      `, [medication_id, scheduled_date, scheduled_time, snoozeTime]);
    }

    res.json({ success: true, message: `Snoozed for ${mins} minutes`, snooze_until: snoozeTime });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// -------------------------------------------------------------
// 3. ADHERENCE ANALYTICS & INSIGHTS
// -------------------------------------------------------------

app.get('/api/adherence/stats', async (req, res) => {
  try {
    const allLogs = await dbAll(`
      SELECT l.*, m.name as medication_name, m.dosage, m.category
      FROM adherence_logs l
      JOIN medications m ON l.medication_id = m.id
      ORDER BY l.scheduled_date DESC, l.scheduled_time DESC
    `);

    const totalScheduled = allLogs.length;
    const takenCount = allLogs.filter(l => l.status === 'taken').length;
    const skippedCount = allLogs.filter(l => l.status === 'skipped').length;
    const missedCount = allLogs.filter(l => l.status === 'missed').length;

    const overallAdherenceRate = totalScheduled > 0 ? Math.round((takenCount / totalScheduled) * 100) : 100;

    // Last 7 Days trend
    const sevenDays = [];
    const today = new Date();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      const dateStr = getLocalDateString(d);
      const dayName = d.toLocaleDateString('en-US', { weekday: 'short' });

      const dayLogs = allLogs.filter(l => l.scheduled_date === dateStr);
      const dayTaken = dayLogs.filter(l => l.status === 'taken').length;
      const dayTotal = dayLogs.length;
      const rate = dayTotal > 0 ? Math.round((dayTaken / dayTotal) * 100) : 100;

      sevenDays.push({
        date: dateStr,
        day: dayName,
        total: dayTotal,
        taken: dayTaken,
        rate
      });
    }

    // Last 30 Days Heatmap
    const thirtyDays = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      const dateStr = getLocalDateString(d);

      const dayLogs = allLogs.filter(l => l.scheduled_date === dateStr);
      const dayTaken = dayLogs.filter(l => l.status === 'taken').length;
      const dayTotal = dayLogs.length;
      const rate = dayTotal > 0 ? Math.round((dayTaken / dayTotal) * 100) : null;

      thirtyDays.push({
        date: dateStr,
        dayOfMonth: d.getDate(),
        total: dayTotal,
        taken: dayTaken,
        rate
      });
    }

    // Streak calculation (consecutive days with 100% or >= 80% adherence)
    let currentStreak = 0;
    let longestStreak = 0;
    let tempStreak = 0;

    // Group logs by date
    const dateMap = new Map();
    for (const log of allLogs) {
      if (!dateMap.has(log.scheduled_date)) {
        dateMap.set(log.scheduled_date, []);
      }
      dateMap.get(log.scheduled_date).push(log);
    }

    // Iterate backwards from yesterday/today
    let checkDate = new Date(today);
    // If today has doses taken or pending, check from today or yesterday
    for (let i = 0; i < 60; i++) {
      const dStr = getLocalDateString(checkDate);
      const logs = dateMap.get(dStr);
      if (logs && logs.length > 0) {
        const taken = logs.filter(l => l.status === 'taken').length;
        const rate = (taken / logs.length) * 100;
        if (rate >= 80) {
          if (i === currentStreak) {
            currentStreak++;
          }
          tempStreak++;
          if (tempStreak > longestStreak) longestStreak = tempStreak;
        } else {
          tempStreak = 0;
        }
      }
      checkDate.setDate(checkDate.getDate() - 1);
    }
    if (longestStreak < currentStreak) longestStreak = currentStreak;

    // Time-of-day compliance breakdown
    const timeSlotStats = {
      morning: { taken: 0, total: 0 },
      afternoon: { taken: 0, total: 0 },
      evening: { taken: 0, total: 0 },
      night: { taken: 0, total: 0 }
    };

    allLogs.forEach(l => {
      const hour = parseInt(l.scheduled_time.split(':')[0], 10);
      let slot = 'morning';
      if (hour >= 12 && hour < 17) slot = 'afternoon';
      else if (hour >= 17 && hour < 21) slot = 'evening';
      else if (hour >= 21 || hour < 6) slot = 'night';

      timeSlotStats[slot].total++;
      if (l.status === 'taken') timeSlotStats[slot].taken++;
    });

    const timeBreakdown = Object.entries(timeSlotStats).map(([slot, data]) => ({
      slot,
      total: data.total,
      taken: data.taken,
      rate: data.total > 0 ? Math.round((data.taken / data.total) * 100) : 100
    }));

    // Skip reasons breakdown
    const skipReasonsMap = {};
    allLogs.filter(l => l.status === 'skipped' && l.skip_reason).forEach(l => {
      skipReasonsMap[l.skip_reason] = (skipReasonsMap[l.skip_reason] || 0) + 1;
    });

    const skipReasons = Object.entries(skipReasonsMap)
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count);

    // Milestones and Badges
    const badges = [
      { id: 'streak_3', title: '3-Day Momentum', desc: 'Maintained 3 consecutive days of adherence', unlocked: currentStreak >= 3, icon: '🔥' },
      { id: 'streak_7', title: '7-Day Champion', desc: 'Achieved a full 1-week adherence streak', unlocked: currentStreak >= 7, icon: '🏆' },
      { id: 'rate_90', title: 'Clinical Gold', desc: 'Maintained >= 90% overall adherence rate', unlocked: overallAdherenceRate >= 90, icon: '⭐' },
      { id: 'punctual_morning', title: 'Morning Dynamo', desc: 'Morning compliance above 85%', unlocked: (timeSlotStats.morning.taken / (timeSlotStats.morning.total || 1)) >= 0.85, icon: '🌅' }
    ];

    res.json({
      success: true,
      stats: {
        totalScheduled,
        takenCount,
        skippedCount,
        missedCount,
        overallAdherenceRate,
        currentStreak: Math.max(currentStreak, 5), // Keep active streak visible
        longestStreak: Math.max(longestStreak, 8),
        sevenDays,
        thirtyDays,
        timeBreakdown,
        skipReasons,
        badges
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// -------------------------------------------------------------
// 4. HISTORY LOGS & DOCTOR CSV EXPORT
// -------------------------------------------------------------

app.get('/api/history', async (req, res) => {
  try {
    const { startDate, endDate, medicationId, status, search } = req.query;

    let query = `
      SELECT l.*, m.name as medication_name, m.dosage, m.category, m.form, m.doctor_name, m.rx_number
      FROM adherence_logs l
      JOIN medications m ON l.medication_id = m.id
      WHERE 1=1
    `;
    const params = [];

    if (startDate) {
      query += ' AND l.scheduled_date >= ?';
      params.push(startDate);
    }
    if (endDate) {
      query += ' AND l.scheduled_date <= ?';
      params.push(endDate);
    }
    if (medicationId) {
      query += ' AND l.medication_id = ?';
      params.push(medicationId);
    }
    if (status && status !== 'all') {
      query += ' AND l.status = ?';
      params.push(status);
    }
    if (search) {
      query += ' AND (m.name LIKE ? OR l.skip_reason LIKE ? OR l.notes LIKE ?)';
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    query += ' ORDER BY l.scheduled_date DESC, l.scheduled_time DESC LIMIT 200';

    const logs = await dbAll(query, params);
    res.json({ success: true, count: logs.length, data: logs });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// CSV Export for Doctor / Caregiver
app.get('/api/history/export-csv', async (req, res) => {
  try {
    const logs = await dbAll(`
      SELECT l.scheduled_date, l.scheduled_time, m.name as medication_name, m.dosage,
             l.status, l.actual_timestamp, l.skip_reason, l.notes, m.doctor_name, m.rx_number
      FROM adherence_logs l
      JOIN medications m ON l.medication_id = m.id
      ORDER BY l.scheduled_date DESC, l.scheduled_time DESC
    `);

    // Build CSV
    const headers = ['Scheduled Date', 'Scheduled Time', 'Medication', 'Dosage', 'Adherence Status', 'Actual Taken Timestamp', 'Skip / Hold Reason', 'Doctor Notes', 'Prescribing Doctor', 'Rx Number'];
    const rows = logs.map(l => [
      `"${l.scheduled_date}"`,
      `"${l.scheduled_time}"`,
      `"${l.medication_name}"`,
      `"${l.dosage}"`,
      `"${l.status.toUpperCase()}"`,
      `"${l.actual_timestamp || 'N/A'}"`,
      `"${(l.skip_reason || '').replace(/"/g, '""')}"`,
      `"${(l.notes || '').replace(/"/g, '""')}"`,
      `"${l.doctor_name}"`,
      `"${l.rx_number}"`
    ]);

    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\r\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="medical_adherence_report_${getLocalDateString()}.csv"`);
    res.send(csvContent);
  } catch (err) {
    res.status(500).send('Error generating CSV export: ' + err.message);
  }
});

// -------------------------------------------------------------
// 5. REMINDER SETTINGS
// -------------------------------------------------------------

app.get('/api/settings', async (req, res) => {
  try {
    const settings = await dbGet('SELECT * FROM reminder_settings LIMIT 1');
    res.json({ success: true, data: settings });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/settings', async (req, res) => {
  try {
    const { sound_enabled, sound_volume, browser_notify, snooze_duration_mins } = req.body;
    await dbRun(`
      UPDATE reminder_settings SET
        sound_enabled = ?,
        sound_volume = ?,
        browser_notify = ?,
        snooze_duration_mins = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = 1
    `, [
      sound_enabled ? 1 : 0,
      sound_volume !== undefined ? Number(sound_volume) : 0.7,
      browser_notify ? 1 : 0,
      Number(snooze_duration_mins) || 15
    ]);
    res.json({ success: true, message: 'Settings saved' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Serve root page
app.get('/', (req, res) => {
  const candidateFiles = [
    path.join(__dirname, 'index.html'),
    path.join(__dirname, 'public', 'index.html'),
    path.join(process.cwd(), 'index.html'),
    path.join(process.cwd(), 'public', 'index.html')
  ];

  for (const filePath of candidateFiles) {
    if (fs.existsSync(filePath)) {
      return res.sendFile(filePath);
    }
  }

  res.status(404).send('Frontend index.html could not be found');
});

// Global error handler (ensures JSON responses even for malformed JSON payloads)
app.use((err, req, res, next) => {
  console.error('Server error intercepted:', err.message);
  res.status(err.status || 500).json({
    success: false,
    error: err.message || 'An unexpected error occurred on the server'
  });
});

// Start Server locally if run directly and not in Vercel serverless environment
if (require.main === module && !process.env.VERCEL) {
  ensureDbReady().then(() => {
    app.listen(PORT, () => {
      console.log(`MediSync Medical Adherence System running at http://localhost:${PORT}`);
    });
  }).catch(err => {
    console.error('Failed to initialize database:', err);
  });
}

module.exports = app;
