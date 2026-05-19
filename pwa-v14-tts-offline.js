// Namibia PWA v14 — Offline TTS.
//
// Public API:
//   window.NamibiaTTS.speak(ttsKey)
//   window.NamibiaTTS.mute() / unmute() / toggle() / isMuted()
//   window.NamibiaTTS.replayLast()
//   window.NamibiaTTS.preGenerate(progressCb)
//
// Pre-generates MP3s via Google Cloud TTS REST API at prepare-offline time, stores
// them in a dedicated cache, and plays via <Audio>. Falls back to browser
// speechSynthesis if no cached audio exists. Mute persists across reloads via
// localStorage.
(function () {
  const TTS_CACHE = 'namibia-trip-tts-v1';
  const INDEX_KEY = 'namibia_tts_index_v1';
  const MUTED_KEY = 'namibia_tts_muted';
  const LAST_KEY  = 'namibia_tts_last_key';

  const CANNED = {
    sunset_risk_warning: 'Warning: you are at risk of arriving after sunset. Driving after dark is not permitted in Namibia. Consider stopping at the next safe town.',
    sunset_risk_tight:   'Caution: arrival is close to sunset. Maintain current pace and do not stop for long.',
    pressure_lower:      'Tyre pressure action coming up. Lower pressure before the next section.',
    pressure_raise:      'Tyre pressure action coming up. Raise pressure for the upcoming road.',
    fuel_stop:           'Fuel stop coming up. Top up before the next remote section.'
  };

  function loadIndex() {
    try { return JSON.parse(localStorage.getItem(INDEX_KEY) || '{}'); } catch (_) { return {}; }
  }
  function saveIndex(idx) {
    try { localStorage.setItem(INDEX_KEY, JSON.stringify(idx)); } catch (_) {}
  }
  function isMuted() { return localStorage.getItem(MUTED_KEY) === '1'; }
  function setMuted(v) { localStorage.setItem(MUTED_KEY, v ? '1' : '0'); }

  let currentAudio = null;
  function cancelAll() {
    if (currentAudio) { try { currentAudio.pause(); currentAudio.src = ''; } catch (_) {} currentAudio = null; }
    if (window.speechSynthesis) { try { window.speechSynthesis.cancel(); } catch (_) {} }
  }

  function mute()   { setMuted(true);  cancelAll(); }
  function unmute() { setMuted(false); }
  function toggle() { isMuted() ? unmute() : mute(); }

  async function getCachedBlob(ttsKey) {
    if (!('caches' in window)) return null;
    try {
      const cache = await caches.open(TTS_CACHE);
      const resp = await cache.match('tts://' + ttsKey);
      if (!resp) return null;
      return await resp.blob();
    } catch (_) { return null; }
  }

  function speakViaSynth(text) {
    if (!('speechSynthesis' in window)) return false;
    try {
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'en-US';
      u.rate = 1.0;
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(u);
      return true;
    } catch (_) { return false; }
  }

  async function speak(ttsKey, fallbackText) {
    if (isMuted()) return false;
    localStorage.setItem(LAST_KEY, ttsKey);
    const blob = await getCachedBlob(ttsKey);
    if (blob && blob.size > 0) {
      const url = URL.createObjectURL(blob);
      try {
        cancelAll();
        currentAudio = new Audio(url);
        currentAudio.onended = () => URL.revokeObjectURL(url);
        const playPromise = currentAudio.play();
        if (playPromise && typeof playPromise.catch === 'function') {
          playPromise.catch(() => { /* autoplay rejection; fall back below */ });
        }
        return true;
      } catch (_) {
        URL.revokeObjectURL(url);
      }
    }
    const idx = loadIndex();
    const text = (idx[ttsKey] && idx[ttsKey].text) || CANNED[ttsKey] || fallbackText || '';
    if (text) return speakViaSynth(text);
    return false;
  }

  async function replayLast() {
    const k = localStorage.getItem(LAST_KEY);
    if (!k) return false;
    // Force a re-play even if muted? No — preserve mute. But we still want a way
    // to *test* TTS while muted: temporarily unmute, replay, then restore. We
    // do NOT auto-restore — replay is explicit user action and should respect mute.
    return speak(k);
  }

  // ---- Pre-generation ----
  function collectAllTtsTextsFromState() {
    const map = { ...CANNED };
    const routes = (typeof state !== 'undefined' && state.renderedRoutes) || {};
    for (const date of Object.keys(routes)) {
      const r = routes[date];
      (r.cards || []).forEach(c => {
        if (c.ttsKey && c.ttsText) map[c.ttsKey] = c.ttsText;
      });
      (r.legs || []).forEach(leg => {
        (leg.steps || []).forEach(s => {
          if (s.ttsKey && s.ttsText) map[s.ttsKey] = s.ttsText;
        });
      });
    }
    return map;
  }

  async function synthOne(ttsKey, text, apiKey) {
    const url = `https://texttospeech.googleapis.com/v1/text:synthesize?key=${encodeURIComponent(apiKey)}`;
    const body = {
      input: { text },
      voice: { languageCode: 'en-US', name: 'en-US-Neural2-C' },
      audioConfig: { audioEncoding: 'MP3' }
    };
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (!res.ok) throw new Error(`TTS HTTP ${res.status}`);
    const json = await res.json();
    if (!json.audioContent) throw new Error('TTS: missing audioContent');
    const bin = atob(json.audioContent);
    const buf = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
    const blob = new Blob([buf], { type: 'audio/mpeg' });
    const cacheUrl = 'tts://' + ttsKey;
    const cache = await caches.open(TTS_CACHE);
    await cache.put(cacheUrl, new Response(blob, { headers: { 'Content-Type': 'audio/mpeg' } }));
    return { ttsKey, text, cacheUrl, bytes: blob.size };
  }

  async function preGenerate(progressCb) {
    const apiKey = (typeof state !== 'undefined' && state.apiKey) || localStorage.getItem('namibia_google_api_key') || '';
    if (!apiKey || !('caches' in window) || !('fetch' in window)) {
      if (progressCb) progressCb({ status: 'skipped', reason: 'no api key or caches' });
      return { done: 0, total: 0, skipped: true };
    }
    const map = collectAllTtsTextsFromState();
    const keys = Object.keys(map);
    const idx = loadIndex();
    let done = 0;
    const errors = [];
    for (const k of keys) {
      if (idx[k] && idx[k].cacheUrl) {
        try {
          const cache = await caches.open(TTS_CACHE);
          const existing = await cache.match(idx[k].cacheUrl);
          if (existing) { done++; if (progressCb) progressCb({ done, total: keys.length, ttsKey: k, cached: true }); continue; }
        } catch (_) {}
      }
      try {
        const r = await synthOne(k, map[k], apiKey);
        idx[k] = { text: r.text, cacheUrl: r.cacheUrl, mime: 'audio/mpeg' };
        saveIndex(idx);
        done++;
      } catch (e) {
        errors.push({ ttsKey: k, error: String(e && e.message || e) });
      }
      if (progressCb) progressCb({ done, total: keys.length, ttsKey: k, errors });
    }
    return { done, total: keys.length, errors };
  }

  // ---- Wrap the existing prepareOffline path so the prep toast also covers TTS ----
  if (window.namibiaPrepareOfflineWithFeedback) {
    const base = window.namibiaPrepareOfflineWithFeedback;
    window.namibiaPrepareOfflineWithFeedback = async function patchedPrepWithTTS(...args) {
      const r = await base(...args);
      try {
        await preGenerate(progress => {
          if (typeof log === 'function') log(`TTS pre-gen ${progress.done}/${progress.total}: ${progress.ttsKey || ''}`);
        });
      } catch (e) {
        if (typeof log === 'function') log('TTS pre-generation error: ' + (e?.message || e));
      }
      return r;
    };
    const btn = document.getElementById('prepareOffline');
    if (btn) btn.onclick = window.namibiaPrepareOfflineWithFeedback;
  }

  window.NamibiaTTS = {
    speak,
    mute, unmute, toggle, isMuted,
    replayLast,
    preGenerate,
    _canned: CANNED,
    _loadIndex: loadIndex,
    _synthOne: synthOne
  };
})();
