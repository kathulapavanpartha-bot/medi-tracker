# MediSync — Medical Adherence Pill Tracking & History Intelligence

A full-stack clinical medication adherence and pill-tracking platform designed to maximize compliance, eliminate missed doses, and provide physician-grade audit trails.

---

## 🌟 Key Features

1. **Daily Dosage Schedule Timeline**:
   - Time-slotted organization: **Morning (6am-12pm)**, **Afternoon (12pm-5pm)**, **Evening (5pm-9pm)**, and **Night (9pm-6am)**.
   - Real-time dose status badges: `Scheduled`, `Due Now`, `Taken`, `Snoozed`, and `Skipped`.
   - Custom dual-color pill visual representations reflecting physical medication form (Tablet, Capsule, Softgel, Liquid, Inhaler, Injection).

2. **Instant Micro-Interactions**:
   - **Mark as Taken**: Instant audit timestamping, inventory auto-decrement, Web Audio API harmonic celebration chime, and confetti particle celebration.
   - **Snooze 15 Min**: Temporarily defers alert while preserving compliance tracking.
   - **Skip Dose**: Clinical skip reason tracking (*Nausea/side effects*, *Fasting for lab work*, *Doctor temporary hold*, *Ran out of stock*, *Forgot/Away*).
   - **Undo / Edit**: Ability to adjust logged entries without data corruption.

3. **Real-Time Reminders & Web Audio Engine**:
   - Built-in **Web Audio API Synthesizer** (harmonic multi-tone bells, no external mp3 dependencies required).
   - Real-time second-by-second schedule ticker matching active doses to the local clock.
   - Interactive **"⚡ Test Alarm"** button to simulate real-time notification alerts on demand.
   - Web Notifications API support for native desktop reminders.

4. **Clinical Adherence Analytics & Insights**:
   - **Circular Compliance Gauge**: Dynamic SVG circular gauge with color progression (Green ≥90%, Amber 75-89%, Red <75%).
   - **Active Streak Counter**: Consecutive compliance days with milestone badges (`3-Day Momentum`, `7-Day Champion`, `Clinical Gold`).
   - **7-Day Compliance Bar Chart**: Day-by-day intake visualization with tooltips.
   - **30-Day Heatmap**: Longitudinal calendar compliance distribution.
   - **Time-of-Day Compliance**: Identifies morning vs. evening compliance discrepancies.
   - **Missed Dose Root-Cause Analysis**: Identifies trends behind skipped or held doses.

5. **Pill Cabinet & Inventory Management**:
   - Real-time pill stock tracker with automated low-stock warnings when inventory drops below refill thresholds.
   - Quick **"+ Refill Stock"** modal (30-day / 90-day restocking).
   - **Add Medication Modal**: Configurable forms, custom dual pill colors, multiple daily dosing times, instructions, doctor credentials, and Rx numbers.

6. **Audit History & Doctor Reports**:
   - Filterable chronological audit table by date, medication, or intake status.
   - **Export Doctor CSV**: Generates clinical adherence reports for physician consultations.
   - **Print Clinical Summary**: Print-optimized stylesheet for hospital or caregiver visits.

---

## 🚀 Getting Started

### Prerequisites
- Node.js (v18+) is installed.

### Start the Server
```bash
npm start
```
Or:
```bash
node server.js
```

Open your browser and navigate to:
```
http://localhost:3000
```

---

## 🛠️ Technology Stack
- **Backend**: Node.js, Express.js, `@libsql/client` (Turso LibSQL / Cloud SQLite) with schema migrations and seed data. Fully Vercel serverless compatible.
- **Frontend**: Semantic HTML5, Vanilla JavaScript (ES6+ modular controllers), CSS3 Glassmorphism with custom micro-animations.
- **Audio**: Web Audio API oscillator synthesis.
- **Data Persistence**: LibSQL / Turso Cloud Database (`TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`).
