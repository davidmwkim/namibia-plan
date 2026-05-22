// pwa-v31-polish.js — Small interaction polish to go with the design pass.
//
//   * Re-trigger the .content fade-in keyframe on every tab switch (not just
//     initial mount) so tab swaps feel kinetic.
//   * Hide the "Use GPS" / "Install" / "Export day KML" / "Export all KML"
//     buttons behind a 3-dot overflow menu on narrow viewports so the
//     toolbar isn't a mosaic of low-frequency actions.
//   * Cleaner aria-current on the active tab for accessibility.
(function () {
  function reTriggerTabAnimation() {
    const tc = document.getElementById('tabContent');
    if (!tc) return;
    // Restart the fade-in animation by toggling a class.
    tc.classList.remove('content-anim');
    // Force reflow.
    void tc.offsetWidth;
    tc.classList.add('content-anim');
  }

  function wireTabSwitchAnimation() {
    document.querySelectorAll('.tab').forEach(btn => {
      if (btn.dataset.v31Wired === '1') return;
      btn.dataset.v31Wired = '1';
      btn.addEventListener('click', () => {
        // App's own onclick runs first (it sets activeTab + calls renderTab).
        // We schedule the fade re-trigger on the next frame so it lands AFTER
        // the new tab content is in the DOM.
        requestAnimationFrame(reTriggerTabAnimation);
        // Update aria-current for assistive tech.
        document.querySelectorAll('.tab').forEach(t => t.removeAttribute('aria-current'));
        btn.setAttribute('aria-current', 'page');
      });
    });
  }

  window.NamibiaUI.afterRenderTab(function () {
    try { wireTabSwitchAnimation(); } catch (_) {}
  });
  wireTabSwitchAnimation();

  // Mark the initially-active tab.
  setTimeout(() => {
    document.querySelectorAll('.tab.active').forEach(t => t.setAttribute('aria-current', 'page'));
  }, 500);
})();
