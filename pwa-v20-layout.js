// Namibia PWA v20 — layout cleanup.
//
//   * The "Assumptions" h2 + alerts are moved out of the aside (which now only
//     holds the mini-map) and rendered at the bottom of the page.
//   * The "Heather driving indicator" alert added by v8 is removed — that text
//     was meta-explanation that no longer needs to live in the live UI.
(function () {
  function findAssumptionsSection() {
    const headings = document.querySelectorAll('aside .panel h2');
    for (const h of headings) {
      if (/assumptions/i.test(h.textContent || '')) return h.closest('section') || h.parentElement;
    }
    return null;
  }

  function relocate() {
    const sec = findAssumptionsSection();
    if (!sec) return;
    // The Assumptions section also wraps the mini-map; we keep the mini-map in
    // place and only move out the heading + alerts.
    const h2 = Array.from(sec.querySelectorAll('h2')).find(h => /assumptions/i.test(h.textContent));
    const alerts = sec.querySelector('.alerts');
    if (!h2 || !alerts) return;
    // Remove the Heather driving indicator alert if present.
    alerts.querySelectorAll('.alert').forEach(a => {
      if (/heather driving indicator/i.test(a.textContent || '')) a.remove();
    });
    // Build the new bottom section if not present.
    let bottom = document.getElementById('assumptionsBottom');
    if (!bottom) {
      bottom = document.createElement('section');
      bottom.id = 'assumptionsBottom';
      bottom.className = 'panel pad';
      const main = document.querySelector('.main') || document.body;
      // Insert after the Log panel if it exists, else append to .main.
      const logPanel = Array.from(main.querySelectorAll('.panel')).find(p => p.querySelector('h2')?.textContent?.toLowerCase() === 'log');
      if (logPanel) logPanel.insertAdjacentElement('afterend', bottom);
      else main.appendChild(bottom);
    }
    // Move the h2 + .alerts node into the bottom section.
    if (h2.parentElement !== bottom) bottom.appendChild(h2);
    if (alerts.parentElement !== bottom) bottom.appendChild(alerts);
  }

  // Run after each render so we keep things tidy even if app.js / v8 re-inject.
  if (typeof render === 'function') {
    const base = render;
    render = function patchedRenderV20() {
      const r = base();
      relocate();
      return r;
    };
  }
  relocate();
})();
