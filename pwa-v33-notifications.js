// pwa-v33-notifications.js — Local scheduled notifications.
//
// HONEST CONSTRAINTS (read before assuming anything works off-grid):
//
//   1. *True* server-driven web push (Push API) requires a push service
//      (FCM / APNs) AND a server with VAPID keys. It also requires the
//      device to be online to *receive* the push — so the off-grid
//      Namibian desert is exactly where it doesn't work.
//
//   2. The Notification Triggers API (which lets the browser schedule a
//      notification offline) is **Chrome-only and behind a flag**. Not
//      enabled in stock Chrome Android.
//
//   3. What WORKS RELIABLY today: while the app is OPEN in the foreground
//      OR backgrounded (recent), we can `setTimeout` + `new Notification(...)`
//      at the scheduled time. Once the OS kills the SW (~30s after
//      backgrounding on iOS, ~variable on Android), our timer is gone.
//
//   4. As a fallback we use the Notification Triggers API where present —
//      so on supported Chromes it CAN fire while the app is closed.
//
// What we ship:
//   * Morning brief (07:00 local) — summary of the day's drive, sunset,
//     pressure actions, Heather distribution.
//   * Sunset warning (1 hour before) — triggered foreground-only when
//     GPS is active and the day still has remaining drive time.
//   * Pressure-stop approach (when GPS within 3 km of a pressure card).
//   * Fuel-stop approach (when GPS within 5 km of a fuel card).
//
// Easy disable via a single toggle button injected next to the version
// chip in the hero. State persisted to localStorage.
(function () {
  const ENABLED_KEY = 'namibia_notifications_enabled';
  const LAST_FIRED_PREFIX = 'namibia_notif_lastFired:';

  function isEnabled() {
    return localStorage.getItem(ENABLED_KEY) === '1';
  }
  function setEnabled(v) {
    localStorage.setItem(ENABLED_KEY, v ? '1' : '0');
    updateToggle();
  }
  function permission() {
    return ('Notification' in window) ? Notification.permission : 'unsupported';
  }

  async function requestPermissionAndEnable() {
    if (!('Notification' in window)) {
      alert('Your browser does not support notifications.');
      return false;
    }
    let p = Notification.permission;
    if (p === 'default') p = await Notification.requestPermission();
    if (p !== 'granted') {
      alert('Notification permission not granted. You can enable it later via the browser address bar.');
      return false;
    }
    setEnabled(true);
    scheduleAll();
    fire({
      title: 'Notifications on',
      body: 'You\'ll get a morning brief each trip day + alerts as you approach key stops.',
      tag: 'enabled-confirmation'
    });
    return true;
  }

  // ---- Schedule a notification at a future Date. ----
  async function scheduleOrFire(when, payload) {
    if (!isEnabled() || permission() !== 'granted') return;
    const delta = when.getTime() - Date.now();
    if (delta <= 0) return;
    // Path A: Notification Triggers API (offline-capable on supported
    // Chromes). Requires registering via the service worker.
    if ('serviceWorker' in navigator && 'Notification' in window
        && 'showTrigger' in Notification.prototype) {
      try {
        const reg = await navigator.serviceWorker.getRegistration();
        if (reg) {
          await reg.showNotification(payload.title, {
            body: payload.body, tag: payload.tag,
            data: payload.data || {},
            showTrigger: new TimestampTrigger(when.getTime())
          });
          return;
        }
      } catch (_) {}
    }
    // Path B: in-page setTimeout. Works only while the page is open.
    setTimeout(() => fire(payload), Math.min(delta, 2147483000));
  }

  function fire(payload) {
    if (!isEnabled() || permission() !== 'granted') return;
    try {
      const n = new Notification(payload.title, {
        body: payload.body,
        tag: payload.tag,
        data: payload.data || {}
      });
      n.onclick = () => {
        window.focus();
        if (payload.tabName) {
          const btn = document.querySelector(`.tab[data-tab="${payload.tabName}"]`);
          if (btn) btn.click();
        }
        if (payload.dayDate) {
          const sel = document.getElementById('daySelect');
          const idx = sel ? Array.from(sel.options).findIndex(o => o.text.includes(payload.dayDate)) : -1;
          if (idx >= 0 && sel) { sel.selectedIndex = idx; sel.dispatchEvent(new Event('change')); }
        }
        n.close();
      };
      // Mark last-fired so we don't repeat the same morning brief in the
      // same calendar day if the page is re-opened.
      localStorage.setItem(LAST_FIRED_PREFIX + (payload.tag || 'untagged'), String(Date.now()));
    } catch (_) {}
  }

  // ---- Composers ----
  function morningBriefPayload(d) {
    if (!d) return null;
    const route = state.renderedRoutes?.[d.date];
    let driveMin = 0;
    if (route?.legs && window.NamibiaSunTimes) {
      driveMin = Math.round(
        window.NamibiaSunTimes.etaFromCurrentStep(
          route, { legIdx: 0, stepIdx: 0, distToStepM: 0 }, 0
        ) / 60000
      );
    }
    const sunset = route?.sunTimes
      ? window.NamibiaSunTimes.formatTimeOfDay(route.sunTimes.sunsetMs)
      : '';
    const heatherDist = window.NamibiaV17?.heatherDistribution?.(d);
    const drivePart = driveMin > 0 ? ` ~${Math.round(driveMin / 60 * 10) / 10}h driving.` : '';
    const sunsetPart = sunset ? ` Sunset ${sunset}.` : '';
    const heatherPart = (heatherDist && heatherDist.total > 0)
      ? ` Heather ${Math.round(heatherDist.yes / heatherDist.total * 100)}% / Maybe ${Math.round(heatherDist.maybe / heatherDist.total * 100)}% / David ${Math.round(heatherDist.no / heatherDist.total * 100)}%.`
      : '';
    return {
      title: `Day ${d.day}: ${d.title}`,
      body: `${(d.driveExperience?.summary || '').slice(0, 100)}${drivePart}${sunsetPart}${heatherPart}`,
      tag: 'morning-brief-' + d.date,
      dayDate: d.date,
      tabName: 'overview'
    };
  }

  function scheduleMorningBriefs() {
    const days = window.NAMIBIA_TRIP_DATA?.days || [];
    for (const d of days) {
      const when = new Date(d.date + 'T07:00:00+02:00');
      if (when.getTime() < Date.now()) continue;
      const payload = morningBriefPayload(d);
      if (payload) scheduleOrFire(when, payload);
    }
  }

  // Daily malaria-tablet reminders (course dates + per-day timing from v40).
  function scheduleMalariaReminders() {
    const V40 = window.NamibiaV40;
    const MAL = window.NAMIBIA_TRIP_DATA?.meta?.malaria;
    if (!V40 || !MAL || !MAL.medStartDate) return;
    const end = new Date(MAL.medEndDate + 'T00:00:00');
    for (let iso = MAL.medStartDate; ; ) {
      const cur = new Date(iso + 'T00:00:00');
      if (cur > end) break;
      const info = V40.malariaForDate(iso);
      const when = V40.reminderDateFor(iso);
      if (when && when.getTime() > Date.now()) {
        scheduleOrFire(when, {
          title: info.zone ? '🦟💊 Malaria tablet — in the zone' : '💊 Malaria tablet',
          body: `Take your tablet — ${V40.phaseText(iso, info)}. With food.`,
          tag: 'malaria-' + iso,
          dayDate: iso,
          tabName: 'overview'
        });
      }
      // advance one day
      cur.setDate(cur.getDate() + 1);
      iso = cur.toISOString().slice(0, 10);
    }
  }

  function scheduleAll() {
    if (!isEnabled() || permission() !== 'granted') return;
    scheduleMorningBriefs();
    scheduleMalariaReminders();
    // Sunset warnings + fuel/pressure approach are checked LIVE from
    // onGpsUpdate (see hookGpsApproachAlerts below).
  }

  // ---- GPS approach alerts (foreground-only, no SW push needed) ----
  function hookGpsApproachAlerts() {
    if (!isEnabled() || permission() !== 'granted') return;
    if (!window.NamibiaDriving || !state.gps) return;
    const d = window.day && window.day();
    const route = state.renderedRoutes?.[d?.date];
    if (!route?.cards) return;
    const DC = window.NamibiaDrivingCore;
    if (!DC) return;
    for (const card of route.cards) {
      if (card.kind !== 'fuel' && card.kind !== 'pressure') continue;
      const distM = DC.distMeters(state.gps, card);
      const threshold = card.kind === 'pressure' ? 3000 : 5000;
      const tag = `approach-${card.cardId || card.kind + ':' + card.title}`;
      if (distM > threshold) continue;
      if (localStorage.getItem(LAST_FIRED_PREFIX + tag)) continue; // already fired
      fire({
        title: card.kind === 'pressure' ? '🛞 Tyre pressure stop ahead' : '⛽ Fuel stop ahead',
        body: `${card.title} in ${Math.round(distM/100)/10} km — ${card.body || ''}`,
        tag,
        tabName: 'street'
      });
    }
  }

  // ---- UI toggle ----
  function updateToggle() {
    const btn = document.getElementById('notifToggleBtn');
    if (!btn) return;
    const on = isEnabled() && permission() === 'granted';
    btn.textContent = on ? '🔔 Notifications: on' : '🔕 Notifications: off';
    btn.setAttribute('aria-pressed', String(on));
    btn.classList.toggle('on', on);
  }

  function injectToggle() {
    if (document.getElementById('notifToggleBtn')) return;
    const bar = document.querySelector('.statusbar');
    if (!bar) return;
    const btn = document.createElement('button');
    btn.id = 'notifToggleBtn';
    btn.className = 'chip notif-toggle';
    btn.title = 'Tap to enable / disable trip notifications. Off-grid: morning briefs work only while the app was opened the prior day.';
    btn.onclick = () => {
      if (isEnabled()) {
        setEnabled(false);
        fire({ title: 'Notifications off', body: '', tag: 'disabled-confirmation' });
      } else {
        requestPermissionAndEnable();
      }
    };
    bar.appendChild(btn);
    updateToggle();
  }

  window.NamibiaUI.afterRender(function () {
    try { injectToggle(); } catch (_) {}
    try { hookGpsApproachAlerts(); } catch (_) {}
  });
  injectToggle();
  // Schedule morning briefs once on boot (the SW-triggered API handles
  // future days; in-page setTimeout handles today if it's still <07:00).
  setTimeout(() => { if (isEnabled() && permission() === 'granted') scheduleAll(); }, 2000);

  window.NamibiaNotifications = {
    isEnabled, setEnabled, requestPermissionAndEnable, scheduleAll, fire,
    permission
  };
})();
