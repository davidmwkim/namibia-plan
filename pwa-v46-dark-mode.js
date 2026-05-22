// pwa-v46-dark-mode.js — light/dark theme toggle.
//
// The theme is stored in localStorage ('namibia_theme' = 'dark' | 'light') and
// applied as data-theme on <html>. An inline script in index.html <head> sets
// it pre-paint to avoid a flash; this module keeps it in sync and adds the
// toggle button (in Settings, alongside the other app controls).
(function () {
  const KEY = 'namibia_theme';

  function systemPref() {
    return (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light';
  }
  function current() {
    const saved = localStorage.getItem(KEY);
    return (saved === 'dark' || saved === 'light') ? saved : systemPref();
  }
  function apply(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    // Match the browser UI (status bar / address bar) to the theme.
    let meta = document.querySelector('meta[name="theme-color"]');
    if (!meta) { meta = document.createElement('meta'); meta.name = 'theme-color'; document.head.appendChild(meta); }
    meta.setAttribute('content', theme === 'dark' ? '#131216' : '#5a1738');
    updateToggle(theme);
  }
  function setTheme(theme) { localStorage.setItem(KEY, theme); apply(theme); }
  function toggle() { setTheme(current() === 'dark' ? 'light' : 'dark'); }

  function updateToggle(theme) {
    const btn = document.getElementById('themeToggleBtn');
    if (btn) btn.textContent = theme === 'dark' ? '☀️ Light mode' : '🌙 Dark mode';
  }
  function injectToggle() {
    const host = document.getElementById('settingsControls');
    if (!host || document.getElementById('themeToggleBtn')) return;
    const btn = document.createElement('button');
    btn.id = 'themeToggleBtn';
    btn.className = 'ghost theme-toggle';
    btn.title = 'Switch between light and dark theme';
    btn.onclick = toggle;
    host.appendChild(btn);
    updateToggle(current());
  }

  apply(current());
  if (window.NamibiaUI && window.NamibiaUI.afterRender) {
    window.NamibiaUI.afterRender(function () { try { injectToggle(); } catch (_) {} });
  }
  injectToggle();
  setTimeout(injectToggle, 800);

  // React to OS theme changes only when the user hasn't pinned a choice.
  if (window.matchMedia) {
    try {
      window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
        if (!localStorage.getItem(KEY)) apply(systemPref());
      });
    } catch (_) {}
  }

  window.NamibiaTheme = { setTheme, toggle, current };
})();
