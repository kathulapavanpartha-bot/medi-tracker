require('dotenv').config();
const { createClient } = require('@libsql/client');

// Use Turso cloud database if configured, or fall back to an in-memory database for local/testing
const url = process.env.TURSO_DATABASE_URL || ':memory:';
const authToken = process.env.TURSO_AUTH_TOKEN || undefined;

if (!process.env.TURSO_DATABASE_URL) {
  console.warn('⚠️ TURSO_DATABASE_URL is not set. Operating in in-memory mode (:memory:). Set TURSO_DATABASE_URL and TURSO_AUTH_TOKEN for production persistence.');
} else {
  console.log('Connected to Turso database via @libsql/client');
}

const client = createClient({
  url,
  authToken
});

function normalizeParams(params = []) {
  if (!params) return [];
  if (Array.isArray(params)) {
    return params.map(val => (val === undefined ? null : val));
  }
  return params;
}

// Helper for run queries (INSERT, UPDATE, DELETE, CREATE, etc.)
const dbRun = async (sql, params = []) => {
  const result = await client.execute({ sql, args: normalizeParams(params) });
  return {
    id: (result.lastInsertRowid !== undefined && result.lastInsertRowid !== null)
      ? Number(result.lastInsertRowid)
      : undefined,
    changes: result.rowsAffected
  };
};

// Helper for fetching all matching rows
const dbAll = async (sql, params = []) => {
  const result = await client.execute({ sql, args: normalizeParams(params) });
  return Array.from(result.rows);
};

// Helper for fetching a single matching row
const dbGet = async (sql, params = []) => {
  const result = await client.execute({ sql, args: normalizeParams(params) });
  return result.rows.length > 0 ? result.rows[0] : undefined;
};

async function initializeDatabase() {
  // Create tables
  await dbRun(`
    CREATE TABLE IF NOT EXISTS medications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      dosage TEXT NOT NULL,
      form TEXT NOT NULL DEFAULT 'tablet',
      color_primary TEXT DEFAULT '#3b82f6',
      color_secondary TEXT DEFAULT '#60a5fa',
      instructions TEXT DEFAULT 'Take with water',
      category TEXT DEFAULT 'Prescription',
      frequency TEXT DEFAULT 'Daily',
      times TEXT NOT NULL,
      stock_current INTEGER NOT NULL DEFAULT 30,
      stock_refill_threshold INTEGER NOT NULL DEFAULT 7,
      doctor_name TEXT DEFAULT 'Dr. Aris Thorne',
      rx_number TEXT DEFAULT 'RX-89412',
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await dbRun(`
    CREATE TABLE IF NOT EXISTS adherence_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      medication_id INTEGER NOT NULL,
      scheduled_date TEXT NOT NULL,
      scheduled_time TEXT NOT NULL,
      status TEXT NOT NULL,
      actual_timestamp TEXT,
      notes TEXT,
      skip_reason TEXT,
      snooze_until TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (medication_id) REFERENCES medications(id) ON DELETE CASCADE
    )
  `);

  await dbRun(`
    CREATE TABLE IF NOT EXISTS reminder_settings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sound_enabled INTEGER DEFAULT 1,
      sound_volume REAL DEFAULT 0.7,
      browser_notify INTEGER DEFAULT 1,
      snooze_duration_mins INTEGER DEFAULT 15,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Ensure initial settings exist
  const existingSettings = await dbGet('SELECT * FROM reminder_settings LIMIT 1');
  if (!existingSettings) {
    await dbRun('INSERT INTO reminder_settings (sound_enabled, sound_volume, browser_notify, snooze_duration_mins) VALUES (1, 0.7, 1, 15)');
  }

  // Check if medications already exist
  const medCount = await dbGet('SELECT COUNT(*) as count FROM medications');
  if (medCount && Number(medCount.count) === 0) {
    console.log('Seeding initial medication and adherence history data...');
    await seedInitialData();
  }
}

async function seedInitialData() {
  const initialMeds = [
    {
      name: 'Atorvastatin',
      dosage: '20 mg',
      form: 'tablet',
      color_primary: '#3b82f6',
      color_secondary: '#93c5fd',
      instructions: 'Take in the evening with food',
      category: 'Cardiovascular / Lipid',
      frequency: 'Daily',
      times: JSON.stringify(['21:00']),
      stock_current: 24,
      stock_refill_threshold: 7,
      doctor_name: 'Dr. Sarah Lin (Cardiology)',
      rx_number: 'RX-982104'
    },
    {
      name: 'Metformin HCl',
      dosage: '500 mg',
      form: 'capsule',
      color_primary: '#10b981',
      color_secondary: '#6ee7b7',
      instructions: 'Take twice daily with main meals',
      category: 'Endocrinology / Glucose',
      frequency: 'Twice daily',
      times: JSON.stringify(['08:30', '19:30']),
      stock_current: 42,
      stock_refill_threshold: 10,
      doctor_name: 'Dr. Michael Chen',
      rx_number: 'RX-441209'
    },
    {
      name: 'Lisinopril',
      dosage: '10 mg',
      form: 'tablet',
      color_primary: '#f59e0b',
      color_secondary: '#fcd34d',
      instructions: 'Take every morning with full glass of water',
      category: 'Blood Pressure / ACE Inhibitor',
      frequency: 'Daily',
      times: JSON.stringify(['08:00']),
      stock_current: 5, // Low stock demo!
      stock_refill_threshold: 7,
      doctor_name: 'Dr. Sarah Lin (Cardiology)',
      rx_number: 'RX-772183'
    },
    {
      name: 'Vitamin D3 + K2',
      dosage: '2000 IU',
      form: 'softgel',
      color_primary: '#ec4899',
      color_secondary: '#f472b6',
      instructions: 'Take with afternoon meal containing healthy fats',
      category: 'Dietary Supplement',
      frequency: 'Daily',
      times: JSON.stringify(['13:00']),
      stock_current: 58,
      stock_refill_threshold: 14,
      doctor_name: 'Dr. Maya Patel',
      rx_number: 'SUPP-3312'
    },
    {
      name: 'Omega-3 EPA/DHA',
      dosage: '1000 mg',
      form: 'capsule',
      color_primary: '#06b6d4',
      color_secondary: '#67e8f9',
      instructions: 'Take with midday meal to enhance absorption',
      category: 'Cardiovascular Supplement',
      frequency: 'Daily',
      times: JSON.stringify(['13:00']),
      stock_current: 45,
      stock_refill_threshold: 10,
      doctor_name: 'Dr. Maya Patel',
      rx_number: 'SUPP-8821'
    }
  ];

  const medIds = [];
  for (const med of initialMeds) {
    const res = await dbRun(`
      INSERT INTO medications 
      (name, dosage, form, color_primary, color_secondary, instructions, category, frequency, times, stock_current, stock_refill_threshold, doctor_name, rx_number)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      med.name, med.dosage, med.form, med.color_primary, med.color_secondary,
      med.instructions, med.category, med.frequency, med.times,
      med.stock_current, med.stock_refill_threshold, med.doctor_name, med.rx_number
    ]);
    medIds.push({ id: res.id, ...med, parsedTimes: JSON.parse(med.times) });
  }

  // Generate realistic past 14 days adherence logs
  const today = new Date();
  
  for (let i = 14; i >= 1; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const dateStr = d.toISOString().split('T')[0];

    for (const med of medIds) {
      for (const timeStr of med.parsedTimes) {
        // High adherence simulation: 90% taken, 6% skipped, 4% missed
        const rand = Math.random();
        let status = 'taken';
        let skipReason = null;
        let actualTimestamp = `${dateStr}T${timeStr}:14.000Z`;

        if (rand < 0.06) {
          status = 'skipped';
          actualTimestamp = null;
          const reasons = ['Stomach upset / nausea', 'Fasting for lab work', 'Doctor temporary pause', 'Ran out of dose'];
          skipReason = reasons[Math.floor(Math.random() * reasons.length)];
        } else if (rand < 0.10) {
          status = 'missed';
          actualTimestamp = null;
        }

        await dbRun(`
          INSERT INTO adherence_logs
          (medication_id, scheduled_date, scheduled_time, status, actual_timestamp, skip_reason)
          VALUES (?, ?, ?, ?, ?, ?)
        `, [med.id, dateStr, timeStr, status, actualTimestamp, skipReason]);
      }
    }
  }

  // Pre-populate today's logs for morning doses as taken to show an active, realistic day
  const todayStr = today.toISOString().split('T')[0];
  const lisinopril = medIds.find(m => m.name === 'Lisinopril');
  if (lisinopril) {
    await dbRun(`
      INSERT INTO adherence_logs (medication_id, scheduled_date, scheduled_time, status, actual_timestamp)
      VALUES (?, ?, ?, 'taken', ?)
    `, [lisinopril.id, todayStr, '08:00', `${todayStr}T08:04:12.000Z`]);
  }

  const metformin = medIds.find(m => m.name === 'Metformin HCl');
  if (metformin) {
    await dbRun(`
      INSERT INTO adherence_logs (medication_id, scheduled_date, scheduled_time, status, actual_timestamp)
      VALUES (?, ?, ?, 'taken', ?)
    `, [metformin.id, todayStr, '08:30', `${todayStr}T08:32:45.000Z`]);
  }

  console.log('Database successfully seeded with realistic clinical & adherence history data.');
}

module.exports = {
  client,
  db: client,
  dbRun,
  dbAll,
  dbGet,
  initializeDatabase
};
