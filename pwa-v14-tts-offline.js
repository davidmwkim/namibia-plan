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
    fuel_stop:           'Fuel stop coming up. Top up before the next remote section.',
    demo_starting:       'Demo playback starting. Cards will scroll automatically as the simulated GPS moves along the route.'
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
  // Throttle: ignore speak() calls that arrive within `minIntervalMs` of the
  // last accepted call. Demo mode sets this to ~4s so rapid threshold crossings
  // don't produce audio spam.
  let lastAcceptedSpeakTs = 0;
  let minIntervalMs = 0;
  function cancelAll() {
    if (currentAudio) { try { currentAudio.pause(); currentAudio.src = ''; } catch (_) {} currentAudio = null; }
    if (window.speechSynthesis) { try { window.speechSynthesis.cancel(); } catch (_) {} }
  }

  function mute()   { setMuted(true);  cancelAll(); }
  function unmute() { setMuted(false); }
  function toggle() { isMuted() ? unmute() : mute(); }

  // Chrome Android (and iOS Safari) require the FIRST speechSynthesis.speak()
  // and Audio.play() to be triggered synchronously inside a user-gesture
  // handler. Async speaks fired later from setInterval / GPS updates are
  // silently blocked. Call this from any user gesture (button click) before
  // the demo / GPS-driven TTS path takes over.
  let unlocked = false;
  function unlockOnGesture() {
    if (unlocked) return;
    try {
      if ('speechSynthesis' in window) {
        const u = new SpeechSynthesisUtterance(' ');
        u.volume = 0;
        u.rate = 10;
        window.speechSynthesis.speak(u);
      }
      // Silent <audio> play too, in case we later try cached MP3s.
      try {
        const a = new Audio('data:audio/mp3;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4Ljc2LjEwMAAAAAAAAAAAAAAA//tQwAAAAAAAAAAAAAAAAAAAAAAA');
        a.volume = 0;
        const p = a.play();
        if (p && typeof p.catch === 'function') p.catch(() => {});
      } catch (_) {}
      unlocked = true;
    } catch (_) {}
  }

  // Edge TTS cache: `tts-cache/manifest.json` maps ttsKey → file, populated
  // by `scripts/generate-tts.py`. Loaded once and re-used for the session.
  let edgeManifest = null;
  let edgeManifestLoaded = false;
  async function getEdgeManifest() {
    if (edgeManifestLoaded) return edgeManifest;
    edgeManifestLoaded = true;
    try {
      const res = await fetch('./tts-cache/manifest.json', { cache: 'no-cache' });
      if (!res.ok) return null;
      edgeManifest = await res.json();
      return edgeManifest;
    } catch (_) { return null; }
  }

  async function getEdgeBlob(ttsKey) {
    const manifest = await getEdgeManifest();
    const entry = manifest && manifest[ttsKey];
    if (!entry?.file) return null;
    try {
      const res = await fetch('./tts-cache/' + entry.file);
      if (!res.ok) return null;
      return await res.blob();
    } catch (_) { return null; }
  }

  async function getCachedBlob(ttsKey) {
    if (!('caches' in window)) return null;
    try {
      const cache = await caches.open(TTS_CACHE);
      const resp = await cache.match('tts://' + ttsKey);
      if (!resp) return null;
      return await resp.blob();
    } catch (_) { return null; }
  }

  // Pick the best available en-* voice. Some platforms (notably some Linux
  // builds of Chrome) start with an empty voice list until voiceschanged fires.
  let cachedVoice = null;
  function pickVoice() {
    if (!('speechSynthesis' in window)) return null;
    if (cachedVoice && cachedVoice.lang) return cachedVoice;
    const voices = window.speechSynthesis.getVoices() || [];
    const en = voices.find(v => /^en[-_]US/i.test(v.lang))
            || voices.find(v => /^en/i.test(v.lang))
            || voices[0];
    if (en) cachedVoice = en;
    return en || null;
  }
  if ('speechSynthesis' in window) {
    try {
      window.speechSynthesis.onvoiceschanged = () => { cachedVoice = null; pickVoice(); };
      pickVoice();
    } catch (_) {}
  }
  function speakViaSynth(text) {
    if (!('speechSynthesis' in window)) return false;
    try {
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'en-US';
      u.rate = 1.0;
      u.volume = 1.0;
      const v = pickVoice();
      if (v) u.voice = v;
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(u);
      return true;
    } catch (_) { return false; }
  }

  async function speak(ttsKey, fallbackText, opts) {
    if (isMuted()) return false;
    const force = opts && opts.force === true;
    const now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    if (!force && minIntervalMs > 0 && (now - lastAcceptedSpeakTs) < minIntervalMs) {
      return false;
    }
    lastAcceptedSpeakTs = now;
    localStorage.setItem(LAST_KEY, ttsKey);
    // Visible indicator so the user sees what was spoken even if their audio
    // output is muted or the synth voice fails. Dispatched as a CustomEvent so
    // the Driving Dashboard can show a small "🔊 last: ..." line.
    try {
      let text = (loadIndex()[ttsKey] && loadIndex()[ttsKey].text) || CANNED[ttsKey] || fallbackText || '';
      // For per-step keys (e.g. step-DATE-LEG-IDX) try to look up the card's
      // ttsText from the current day's route so the visible indicator is
      // human-readable.
      if (!text && typeof state !== 'undefined' && typeof day === 'function') {
        const d = day();
        const route = state.renderedRoutes?.[d?.date];
        for (const leg of (route?.legs || [])) {
          for (const step of (leg.steps || [])) {
            if (step.ttsKey === ttsKey && step.ttsText) { text = step.ttsText; break; }
          }
          if (text) break;
        }
        if (!text) {
          const card = (route?.cards || []).find(c => c.ttsKey === ttsKey);
          if (card) text = card.ttsText || card.title;
        }
      }
      if (!text) text = ttsKey;
      window.dispatchEvent(new CustomEvent('namibia-tts-spoke', { detail: { ttsKey, text } }));
    } catch (_) {}
    // Audio source priority:
    //  1. Edge-TTS bundle (pre-generated by scripts/generate-tts.py — natural)
    //  2. Google Cloud TTS cached blob (also natural, but billable to gen)
    //  3. speechSynthesis fallback (browser-built-in, may be robotic)
    let blob = await getEdgeBlob(ttsKey);
    if (!blob || !blob.size) blob = await getCachedBlob(ttsKey);
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
    // Replay is explicit user action; bypass throttle (but still respect mute).
    return speak(k, undefined, { force: true });
  }

  function setThrottle(ms) { minIntervalMs = Math.max(0, Number(ms) || 0); }
  function getThrottle() { return minIntervalMs; }

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
    setThrottle, getThrottle,
    unlockOnGesture,
    _canned: CANNED,
    _loadIndex: loadIndex,
    _synthOne: synthOne
  };

  // Defensive: auto-unlock on the first click anywhere in the document so
  // any user interaction unlocks the audio stack, not just the demo button.
  document.addEventListener('click', unlockOnGesture, { once: true, capture: true });
})();
