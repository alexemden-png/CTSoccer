// Shared light/dark theme toggle, used on every page.
// The site's dark theme is built almost entirely from inline styles rather
// than CSS custom properties, so a token-based light palette isn't practical
// to retrofit everywhere. Instead we invert the whole page's luminance
// (filter: invert(1) hue-rotate(180deg)) — a standard technique for adding a
// light mode to an existing dark-only design — and un-invert real imagery
// (img/video/canvas/iframe) so photos and the logo don't look like negatives.
(function () {
  function apply() {
    var theme = localStorage.getItem('ct_theme') || 'dark';
    document.documentElement.setAttribute('data-theme', theme);
    document.querySelectorAll('.theme-toggle-icon').forEach(function (el) {
      el.textContent = theme === 'light' ? '\u{1F319}' : '\u{2600}\u{FE0F}';
    });
    document.querySelectorAll('.theme-toggle-btn').forEach(function (el) {
      el.setAttribute('aria-label', theme === 'light' ? 'Switch to dark theme' : 'Switch to light theme');
    });
  }
  window.toggleTheme = function () {
    var cur = localStorage.getItem('ct_theme') || 'dark';
    localStorage.setItem('ct_theme', cur === 'dark' ? 'light' : 'dark');
    apply();
  };
  window.__ctApplyTheme = apply;
  apply();
})();
