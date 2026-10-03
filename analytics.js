/**
 * Adherence Analytics, Compliance Heatmap, and Interactive SVG Charts
 */
class AdherenceAnalytics {
  constructor() {
    this.stats = null;
  }

  async loadStats() {
    try {
      const apiBase = window.API_BASE || '';
      const res = await (window.apiFetch ? window.apiFetch('/api/adherence/stats') : fetch(`${apiBase}/api/adherence/stats`));
      const data = await res.json();
      if (data.success) {
        this.stats = data.stats;
        this.renderAll();
      }
    } catch (err) {
      console.error('Failed to load adherence stats:', err);
    }
  }

  renderAll() {
    if (!this.stats) return;

    this.renderScoreboard();
    this.renderGauge();
    this.renderSevenDayChart();
    this.renderThirtyDayHeatmap();
    this.renderTimeSlotBars();
    this.renderSkipReasons();
    this.renderBadges();
  }

  renderScoreboard() {
    const rateEl = document.getElementById('stat-overall-rate');
    const streakEl = document.getElementById('stat-current-streak');
    const bestStreakEl = document.getElementById('stat-best-streak');
    const takenEl = document.getElementById('stat-total-taken');
    const scheduledEl = document.getElementById('stat-total-scheduled');

    if (rateEl) rateEl.textContent = `${this.stats.overallAdherenceRate}%`;
    if (streakEl) streakEl.textContent = `${this.stats.currentStreak} Days`;
    if (bestStreakEl) bestStreakEl.textContent = `${this.stats.longestStreak} Days`;
    if (takenEl) takenEl.textContent = this.stats.takenCount;
    if (scheduledEl) scheduledEl.textContent = this.stats.totalScheduled;

    // Score evaluation text
    const labelEl = document.getElementById('stat-rating-badge');
    if (labelEl) {
      if (this.stats.overallAdherenceRate >= 90) {
        labelEl.innerHTML = '<span class="status-pill status-taken">⭐ Outstanding Clinical Adherence</span>';
      } else if (this.stats.overallAdherenceRate >= 75) {
        labelEl.innerHTML = '<span class="status-pill status-snoozed">⚠️ Moderate Adherence (Target: 90%+)</span>';
      } else {
        labelEl.innerHTML = '<span class="status-pill status-skipped">🚨 High Missed Dose Risk</span>';
      }
    }
  }

  renderGauge() {
    const circle = document.getElementById('gauge-progress-circle');
    if (!circle) return;

    const rate = this.stats.overallAdherenceRate;
    // Radius is 54, circumference is 2 * PI * 54 = ~339.29
    const circumference = 339.29;
    const offset = circumference - (rate / 100) * circumference;

    circle.style.strokeDasharray = `${circumference}`;
    circle.style.strokeDashoffset = `${offset}`;

    // Color gradient shift based on rate
    if (rate >= 90) {
      circle.style.stroke = 'url(#gauge-gradient-green)';
    } else if (rate >= 75) {
      circle.style.stroke = 'url(#gauge-gradient-amber)';
    } else {
      circle.style.stroke = 'url(#gauge-gradient-red)';
    }
  }

  renderSevenDayChart() {
    const container = document.getElementById('chart-seven-days');
    if (!container || !this.stats.sevenDays) return;

    let html = '<div class="bar-chart-grid">';
    this.stats.sevenDays.forEach(day => {
      const heightPercent = Math.max(8, day.rate);
      let colorClass = 'bar-high';
      if (day.rate < 70) colorClass = 'bar-low';
      else if (day.rate < 90) colorClass = 'bar-mid';

      html += `
        <div class="bar-col">
          <div class="bar-tooltip">${day.rate}% (${day.taken}/${day.total} taken)</div>
          <div class="bar-track">
            <div class="bar-fill ${colorClass}" style="height: ${heightPercent}%;"></div>
          </div>
          <div class="bar-label">${day.day}</div>
          <div class="bar-sub">${day.date.slice(5)}</div>
        </div>
      `;
    });
    html += '</div>';
    container.innerHTML = html;
  }

  renderThirtyDayHeatmap() {
    const container = document.getElementById('heatmap-thirty-days');
    if (!container || !this.stats.thirtyDays) return;

    let html = '<div class="heatmap-grid">';
    this.stats.thirtyDays.forEach(d => {
      let levelClass = 'heat-none';
      if (d.rate !== null) {
        if (d.rate === 100) levelClass = 'heat-perfect';
        else if (d.rate >= 80) levelClass = 'heat-high';
        else if (d.rate >= 50) levelClass = 'heat-mid';
        else levelClass = 'heat-low';
      }

      html += `
        <div class="heat-cell ${levelClass}" title="${d.date}: ${d.rate !== null ? d.rate + '% adherence' : 'No logs'}">
          <span class="heat-day">${d.dayOfMonth}</span>
        </div>
      `;
    });
    html += '</div>';
    container.innerHTML = html;
  }

  renderTimeSlotBars() {
    const container = document.getElementById('timeslot-compliance-container');
    if (!container || !this.stats.timeBreakdown) return;

    const slotNames = {
      morning: '🌅 Morning (6 AM - 12 PM)',
      afternoon: '☀️ Afternoon (12 PM - 5 PM)',
      evening: '🌆 Evening (5 PM - 9 PM)',
      night: '🌙 Night (9 PM - 6 AM)'
    };

    let html = '<div class="timeslot-list">';
    this.stats.timeBreakdown.forEach(slot => {
      const name = slotNames[slot.slot] || slot.slot;
      html += `
        <div class="timeslot-row">
          <div class="timeslot-header">
            <span class="timeslot-title">${name}</span>
            <span class="timeslot-val"><strong>${slot.rate}%</strong> (${slot.taken}/${slot.total} taken)</span>
          </div>
          <div class="progress-track">
            <div class="progress-fill" style="width: ${slot.rate}%;"></div>
          </div>
        </div>
      `;
    });
    html += '</div>';
    container.innerHTML = html;
  }

  renderSkipReasons() {
    const container = document.getElementById('skip-reasons-container');
    if (!container) return;

    if (!this.stats.skipReasons || this.stats.skipReasons.length === 0) {
      container.innerHTML = '<p class="text-muted">No dose skips reported in audit logs. Excellent consistency!</p>';
      return;
    }

    let html = '<div class="skip-reasons-grid">';
    this.stats.skipReasons.forEach(item => {
      html += `
        <div class="skip-reason-card">
          <div class="skip-reason-count">${item.count}×</div>
          <div class="skip-reason-text">${item.reason}</div>
        </div>
      `;
    });
    html += '</div>';
    container.innerHTML = html;
  }

  renderBadges() {
    const container = document.getElementById('badges-container');
    if (!container || !this.stats.badges) return;

    let html = '<div class="badges-grid">';
    this.stats.badges.forEach(badge => {
      const unlockedClass = badge.unlocked ? 'badge-unlocked' : 'badge-locked';
      html += `
        <div class="achievement-card ${unlockedClass}">
          <div class="achievement-icon">${badge.icon}</div>
          <div class="achievement-info">
            <h4>${badge.title}</h4>
            <p>${badge.desc}</p>
            <span class="achievement-status">${badge.unlocked ? '✓ Unlocked' : '🔒 Locked'}</span>
          </div>
        </div>
      `;
    });
    html += '</div>';
    container.innerHTML = html;
  }
}

window.adherenceAnalytics = new AdherenceAnalytics();
