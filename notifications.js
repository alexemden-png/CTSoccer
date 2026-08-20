// "New match result for a club you follow" notification bell.
// Include after clubs-data.js, auth.js, and firebase-config.js on any page
// with a #notif-btn / #notif-dot / #notif-panel in its markup — no-ops
// gracefully if any of those aren't present, or Firebase/sign-in isn't ready.
(function () {
  function init() {
    const btn = document.getElementById('notif-btn');
    const dot = document.getElementById('notif-dot');
    const panel = document.getElementById('notif-panel');
    if (!btn || !dot || !panel) return;

    if (typeof FIREBASE_READY === 'undefined' || !FIREBASE_READY) return;
    let user;
    try { user = ctsoccerGetUser(); } catch (e) { user = null; }
    if (!user || !user.firebaseUid || user.isGuest) return;

    const followed = (user.followedClubs || []).slice(0, 30); // Firestore "in" query max
    if (!followed.length) return;

    const lastSeen = Number(localStorage.getItem('ct_notifs_seen_at') || 0);

    function clubName(id) {
      const c = typeof getClubById === 'function' ? getClubById(id) : null;
      return c ? c.name : id;
    }

    db.collection('matchResults').where('clubId', 'in', followed).get()
      .then(snap => {
        const results = snap.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .filter(r => r.createdAt)
          .sort((a, b) => b.createdAt.toMillis() - a.createdAt.toMillis());
        const hasUnseen = results.some(r => r.createdAt.toMillis() > lastSeen);
        if (hasUnseen) dot.style.display = 'block';

        panel.innerHTML = results.length
          ? results.slice(0, 10).map(r => `
              <div style="padding:10px 12px;border-bottom:1px solid rgba(255,255,255,.06);">
                <div style="font-size:.82rem;font-weight:700;color:#fff;">${clubName(r.clubId)}</div>
                <div style="font-size:.78rem;color:var(--muted);margin-top:2px;">${r.result} ${r.homeScore}–${r.awayScore} vs ${r.opponent || 'opponent'}</div>
              </div>`).join('')
          : '<div style="padding:16px;text-align:center;font-size:.8rem;color:var(--muted);">No results yet for clubs you follow.</div>';

        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const isOpen = panel.style.display === 'block';
          panel.style.display = isOpen ? 'none' : 'block';
          if (!isOpen) {
            localStorage.setItem('ct_notifs_seen_at', String(Date.now()));
            dot.style.display = 'none';
          }
        });
        document.addEventListener('click', (e) => {
          if (panel.style.display === 'block' && !panel.contains(e.target) && e.target !== btn) {
            panel.style.display = 'none';
          }
        });
      })
      .catch(err => console.warn('[notifications] could not load match results:', err.message));
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
