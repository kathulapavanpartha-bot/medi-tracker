/**
 * Real-time reminder monitor & Browser Web Notification Manager
 */
class ReminderManager {
  constructor() {
    this.tickerInterval = null;
    this.notifiedDoses = new Set(); // Prevent spamming within the same minute
    this.activeAlertDose = null;
    this.hasRequestedPermission = false;
  }

  init() {
    this.startTicker();
    this.checkNotificationSupport();
  }

  checkNotificationSupport() {
    if ('Notification' in window) {
      if (Notification.permission === 'granted') {
        this.updatePermissionBadge(true);
      } else if (Notification.permission !== 'denied') {
        this.updatePermissionBadge(false);
      }
    }
  }

  async requestPermission() {
    if ('Notification' in window) {
      try {
        const perm = await Notification.requestPermission();
        this.updatePermissionBadge(perm === 'granted');
        if (perm === 'granted') {
          this.sendNativeNotification('MediSync Alerts Enabled', {
            body: 'You will receive reminders when medications are due.'
          });
        }
      } catch (e) {
        console.warn('Could not request notification permission:', e);
      }
    }
  }

  updatePermissionBadge(granted) {
    const badge = document.getElementById('notif-permission-badge');
    if (!badge) return;
    if (granted) {
      badge.innerHTML = '🔔 Push Reminders: <span class="badge-active">Active</span>';
      badge.classList.remove('badge-disabled');
    } else {
      badge.innerHTML = '🔕 Enable Push Alerts';
      badge.classList.add('badge-disabled');
    }
  }

  startTicker() {
    if (this.tickerInterval) clearInterval(this.tickerInterval);

    // Run every 1000ms
    this.tickerInterval = setInterval(() => {
      this.checkScheduledReminders();
    }, 1000);
  }

  checkScheduledReminders() {
    if (!window.todayDoses || !window.todayDoses.length) return;

    const now = new Date();
    const currentHour = String(now.getHours()).padStart(2, '0');
    const currentMinute = String(now.getMinutes()).padStart(2, '0');
    const currentTimeStr = `${currentHour}:${currentMinute}`;
    const todayStr = now.toISOString().split('T')[0];

    window.todayDoses.forEach(dose => {
      const uniqueKey = `${todayStr}-${dose.medication_id}-${dose.scheduled_time}`;

      // Check if snoozed
      let isSnoozedDue = false;
      if (dose.status === 'snoozed' && dose.snooze_until) {
        const snoozeDate = new Date(dose.snooze_until);
        if (now >= snoozeDate) {
          isSnoozedDue = true;
        }
      }

      // If scheduled right now or snoozed time reached, and not already taken or skipped
      if ((dose.scheduled_time === currentTimeStr || isSnoozedDue) && 
          dose.status !== 'taken' && dose.status !== 'skipped') {
        
        if (!this.notifiedDoses.has(uniqueKey)) {
          this.notifiedDoses.add(uniqueKey);
          this.triggerReminderAlert(dose);
        }
      }
    });
  }

  /**
   * Trigger both audio chime, visual modal alert, and native push notification
   */
  triggerReminderAlert(dose) {
    window.medicalAudio.playReminderAlarm();

    // 1. Native OS notification if permitted
    this.sendNativeNotification(`Medication Due: ${dose.medication_name} (${dose.dosage})`, {
      body: `${dose.instructions || 'Time for your scheduled dose'}. Click to record.`,
      icon: 'favicon.ico'
    });

    // 2. Open rich modal reminder
    this.showReminderModal(dose);
  }

  sendNativeNotification(title, options) {
    if ('Notification' in window && Notification.permission === 'granted') {
      try {
        new Notification(title, options);
      } catch (err) {
        console.warn('Notification error:', err);
      }
    }
  }

  showReminderModal(dose) {
    this.activeAlertDose = dose;
    const modal = document.getElementById('reminder-alert-modal');
    if (!modal) return;

    document.getElementById('reminder-pill-name').textContent = dose.medication_name;
    document.getElementById('reminder-pill-dosage').textContent = dose.dosage;
    document.getElementById('reminder-pill-instructions').textContent = dose.instructions || 'Take with water';
    document.getElementById('reminder-pill-time').textContent = dose.scheduled_time;
    
    // Set custom pill preview colors
    const pillIcon = document.getElementById('reminder-pill-icon');
    if (pillIcon) {
      pillIcon.style.background = `linear-gradient(135deg, ${dose.color_primary || '#3b82f6'} 50%, ${dose.color_secondary || '#93c5fd'} 50%)`;
    }

    modal.classList.add('active');
  }

  closeReminderModal() {
    const modal = document.getElementById('reminder-alert-modal');
    if (modal) modal.classList.remove('active');
    this.activeAlertDose = null;
  }

  /**
   * Instant test button to showcase real-time notification experience anytime
   */
  triggerTestReminder() {
    window.medicalAudio.init();
    const demoDose = {
      medication_id: 999,
      medication_name: 'Simulated Medication Demo',
      dosage: '10 mg',
      scheduled_time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      instructions: 'Take immediately with 1 glass of water',
      color_primary: '#ec4899',
      color_secondary: '#f472b6',
      scheduled_date: new Date().toISOString().split('T')[0]
    };
    this.triggerReminderAlert(demoDose);
  }
}

window.reminderManager = new ReminderManager();
