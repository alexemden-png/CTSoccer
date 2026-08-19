// Lightweight cookie/local-storage consent banner, shown once until dismissed.
// No preference center — this site doesn't need one yet (just AdSense +
// functional storage), so a single "Got it" is enough. See privacy-policy.html
// for the full breakdown of what's actually stored and why.
(function () {
  var KEY = 'ct_cookie_consent';
  if (localStorage.getItem(KEY) === '1') return;

  function init() {
    // Most pages have their own fixed bottom tab bar on mobile (bottom:12px) —
    // sit above it there instead of overlapping.
    var style = document.createElement('style');
    style.textContent = '#cookie-consent-bar{bottom:12px;}'
      + '@media (max-width:640px){#cookie-consent-bar{bottom:92px;left:12px;right:12px;}}';
    document.head.appendChild(style);

    var bar = document.createElement('div');
    bar.id = 'cookie-consent-bar';
    bar.setAttribute('role', 'region');
    bar.setAttribute('aria-label', 'Cookie notice');
    bar.style.cssText = [
      'position:fixed', 'left:12px', 'right:12px', 'z-index:1000',
      'max-width:760px', 'margin:0 auto',
      'background:rgba(13,27,42,.97)', 'border:1px solid rgba(255,255,255,.12)',
      'border-radius:16px', 'padding:16px 18px',
      'display:flex', 'align-items:center', 'gap:16px', 'flex-wrap:wrap',
      'font-family:Montserrat,Arial,sans-serif',
      'box-shadow:0 20px 50px rgba(0,0,0,.45), 0 0 1px rgba(255,255,255,.1)',
      'backdrop-filter:blur(20px)', '-webkit-backdrop-filter:blur(20px)',
    ].join(';');

    var text = document.createElement('p');
    text.style.cssText = 'flex:1;min-width:200px;margin:0;font-size:.82rem;line-height:1.6;color:rgba(255,255,255,.7);';
    text.innerHTML = 'CT Soccer uses cookies for site functionality and to show ads via Google AdSense. See our '
      + '<a href="' + (location.pathname.includes('/clubs/') ? '../' : '') + 'privacy-policy.html" style="color:#5BA3FF;text-decoration:underline;">Privacy Policy</a> for details.';

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = 'Got it';
    btn.style.cssText = [
      'flex-shrink:0', 'background:#2B7CE9', 'color:#fff', 'font-family:Montserrat,Arial,sans-serif',
      'font-weight:700', 'font-size:.85rem', 'padding:10px 22px', 'border-radius:9px', 'border:none',
      'cursor:pointer', 'transition:opacity .18s',
    ].join(';');
    btn.onmouseover = function () { btn.style.opacity = '.85'; };
    btn.onmouseout = function () { btn.style.opacity = '1'; };
    btn.onclick = function () {
      localStorage.setItem(KEY, '1');
      bar.remove();
    };

    bar.appendChild(text);
    bar.appendChild(btn);
    document.body.appendChild(bar);
  }

  if (document.body) init();
  else document.addEventListener('DOMContentLoaded', init);
})();
