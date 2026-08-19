// Shared "copy link" handler for share buttons across club pages and news.
function ctCopyLink(btn) {
  var url = btn.getAttribute('data-url') || window.location.href;
  function showCopied() {
    var original = btn.innerHTML;
    btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#5CDD8B" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
    setTimeout(function () { btn.innerHTML = original; }, 1500);
  }
  function fallbackCopy() {
    var ta = document.createElement('textarea');
    ta.value = url;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); } catch (e) {}
    document.body.removeChild(ta);
    showCopied();
  }
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(url).then(showCopied).catch(fallbackCopy);
  } else {
    fallbackCopy();
  }
}
