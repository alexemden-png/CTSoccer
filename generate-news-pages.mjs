// Generates a static, crawlable HTML page per story in news-data.js at
// /news/<id>.html — real server-rendered content (title, body, related club)
// instead of relying on news.html's client-side-rendered feed, so search
// engines and social shares get a real per-story URL with its own
// title/description instead of a same-page #anchor.
//
// Also keeps sitemap.xml in sync: writes/replaces a marked "NEWS PAGES"
// block so re-running this script never duplicates entries there.
//
// Run with: node generate-news-pages.mjs

import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, 'news');
if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

const clubsDataSrc = fs.readFileSync(path.join(__dirname, 'clubs-data.js'), 'utf8');
const newsDataSrc = fs.readFileSync(path.join(__dirname, 'news-data.js'), 'utf8');
const sandbox = {};
vm.createContext(sandbox);
vm.runInContext(clubsDataSrc, sandbox);
vm.runInContext(newsDataSrc, sandbox);
// Top-level `const`/`let` in a vm-run script don't attach to the sandbox object
// itself, but they do persist in that context's global lexical scope across
// further runInContext calls — so pull them back out explicitly.
const { getClubById, NEWS_STORIES } = vm.runInContext('({getClubById, NEWS_STORIES})', sandbox);

function esc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function metaDescription(story) {
  let d = (story.summary || `${story.title} — CT Soccer news.`).replace(/\s+/g, ' ').trim();
  if (d.length > 158) d = d.slice(0, 155).replace(/\s+\S*$/, '') + '…';
  return d;
}

// story.body is an optional array of pre-built HTML fragments (paragraphs,
// or richer blocks like a results list — generate-weekly-recap.mjs builds
// these). Stories without one (the normal case for a short news item) just
// render their one-line summary as the article body.
//
// story.commentary (a plain string, hand-written directly in news-data.js)
// is spliced in fresh here rather than being baked into `body` when the
// story was generated — that's what lets you edit just the commentary field
// and re-run this script alone to see it reflected, with no need to re-run
// whatever generator built the story in the first place.
function bodyHtml(story) {
  const commentary = story.commentary
    ? `<p style="font-size:.95rem;line-height:1.8;color:rgba(255,255,255,.85);font-weight:600;margin:0 0 24px;">${esc(story.commentary)}</p>`
    : '';
  const main = (story.body && story.body.length)
    ? story.body.join('\n')
    : `<p style="font-size:.95rem;line-height:1.8;color:rgba(255,255,255,.75);">${esc(story.summary)}</p>`;
  return commentary + main;
}

function relatedClubHtml(story) {
  const club = story.clubId ? getClubById(story.clubId) : null;
  if (!club) return '';
  return `
    <a href="../clubs/${esc(club.id)}.html" style="display:flex;align-items:center;gap:14px;background:var(--navy-800);border:1px solid var(--border);border-radius:14px;padding:16px 20px;text-decoration:none;margin-top:32px;transition:border-color .2s;" onmouseover="this.style.borderColor='rgba(255,255,255,.18)'" onmouseout="this.style.borderColor='var(--border)'">
      <div style="width:44px;height:44px;border-radius:11px;background:${club.primary}22;border:2px solid ${club.primary}55;display:flex;align-items:center;justify-content:center;flex-shrink:0;overflow:hidden;">
        ${club.logo ? `<img src="../${club.logo}" alt="${esc(club.name)} logo" style="width:100%;height:100%;object-fit:contain;padding:4px;">` : `<span class="club-badge-abbr" style="font-size:.85rem;font-weight:900;color:${club.primary};">${esc(club.abbr)}</span>`}
      </div>
      <div style="flex:1;min-width:0;">
        <div style="font-size:.68rem;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:rgba(255,255,255,.35);">Related Club</div>
        <div style="font-size:.95rem;font-weight:800;color:#fff;">${esc(club.name)}</div>
      </div>
      <svg width="16" height="16" fill="none" stroke="rgba(255,255,255,.4)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24" style="flex-shrink:0;"><path d="M9 18l6-6-6-6"/></svg>
    </a>`;
}

function newsArticleJsonLd(story, canonical) {
  const data = {
    '@context': 'https://schema.org',
    '@type': 'NewsArticle',
    headline: story.title,
    datePublished: new Date(story.date + ' 12:00:00').toISOString(),
    description: story.summary,
    url: canonical,
    publisher: { '@type': 'Organization', name: 'CT Soccer', logo: { '@type': 'ImageObject', url: 'https://ctsoccerhub.com/logo.png' } },
    mainEntityOfPage: { '@type': 'WebPage', '@id': canonical },
  };
  return `<script type="application/ld+json">${JSON.stringify(data)}</script>`;
}

function shareButtonsHtml(url, title) {
  const encodedUrl = encodeURIComponent(url);
  const encodedTitle = encodeURIComponent(title);
  return `
    <div class="share-row" style="display:flex;align-items:center;gap:8px;margin-top:14px;">
      <span style="font-size:.68rem;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:rgba(255,255,255,.35);margin-right:2px;">Share</span>
      <a href="https://twitter.com/intent/tweet?url=${encodedUrl}&text=${encodedTitle}" target="_blank" rel="noopener" aria-label="Share on X" style="width:32px;height:32px;border-radius:8px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);display:flex;align-items:center;justify-content:center;text-decoration:none;">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="rgba(255,255,255,.7)"><path d="M23 3a10.9 10.9 0 0 1-3.14 1.53 4.48 4.48 0 0 0-7.86 3v1A10.66 10.66 0 0 1 3 4s-4 9 5 13a11.64 11.64 0 0 1-7 2c9 5 20 0 20-11.5a4.5 4.5 0 0 0-.08-.83A7.72 7.72 0 0 0 23 3z"/></svg>
      </a>
      <a href="https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}" target="_blank" rel="noopener" aria-label="Share on Facebook" style="width:32px;height:32px;border-radius:8px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);display:flex;align-items:center;justify-content:center;text-decoration:none;">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="rgba(255,255,255,.7)"><path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/></svg>
      </a>
      <button type="button" class="copy-link-btn" data-url="${esc(url)}" onclick="ctCopyLink(this)" aria-label="Copy link" style="width:32px;height:32px;border-radius:8px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);cursor:pointer;display:flex;align-items:center;justify-content:center;">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,.7)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
      </button>
    </div>`;
}

function pageHtml(story) {
  const title = `${esc(story.title)} | CT Soccer`;
  const description = metaDescription(story);
  const canonical = `https://ctsoccerhub.com/news/${story.id}.html`;
  const club = story.clubId ? getClubById(story.clubId) : null;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <script defer src="/_vercel/insights/script.js"></script>
  <script defer src="/_vercel/speed-insights/script.js"></script>
  <meta charset="UTF-8">
  <script src="../theme.js"></script>
  <script src="../cookie-consent.js"></script>
  <script src="../share.js"></script>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <meta name="description" content="${esc(description)}">
  <link rel="canonical" href="${canonical}">
  <meta property="og:type" content="article">
  <meta property="og:title" content="${title}">
  <meta property="og:description" content="${esc(description)}">
  <meta property="og:url" content="${canonical}">
  <meta name="twitter:card" content="summary">
  ${newsArticleJsonLd(story, canonical)}
  <script src="https://cdn.tailwindcss.com"></script>
  <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <style>
    :root { --navy:#0D1B2A; --navy-800:#162236; --accent:#2B7CE9; --accent-lt:#5BA3FF; --border:rgba(255,255,255,.07); --muted:rgba(255,255,255,.42); }
    html[data-theme="light"] { filter: invert(1) hue-rotate(180deg); }
    html[data-theme="light"] img, html[data-theme="light"] video, html[data-theme="light"] canvas, html[data-theme="light"] iframe { filter: invert(1) hue-rotate(180deg); }
    html[data-theme="light"] .club-badge-abbr { filter: invert(1) hue-rotate(180deg) !important; color: #0D1B2A !important; }
    *,*::before,*::after{box-sizing:border-box;-webkit-font-smoothing:antialiased;}
    html,body{margin:0;padding:0;background:var(--navy);color:#fff;font-family:'Montserrat',Arial,sans-serif;}
    a { color: inherit; }
    .btn-primary{display:inline-flex;align-items:center;gap:7px;background:var(--accent);color:#fff;font-weight:700;font-size:.9rem;padding:11px 22px;border-radius:10px;text-decoration:none;border:none;cursor:pointer;font-family:'Montserrat',Arial,sans-serif;transition:opacity .2s,transform .2s;}
    .btn-primary:hover{opacity:.85;transform:translateY(-1px);}
    .badge { font-size: .62rem; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; padding: 4px 9px; border-radius: 5px; display: inline-block; }
    .badge-result { background: rgba(92,221,139,.12); color: #5CDD8B; border: 1px solid rgba(92,221,139,.2); }
    .badge-milestone { background: rgba(43,124,233,.15); color: var(--accent-lt); border: 1px solid rgba(43,124,233,.2); }
    .badge-event { background: rgba(245,158,11,.12); color: #fbbf24; border: 1px solid rgba(245,158,11,.2); }
    .badge-site { background: rgba(168,85,247,.14); color: #c084fc; border: 1px solid rgba(168,85,247,.22); }
    .badge-recap { background: rgba(92,221,139,.12); color: #5CDD8B; border: 1px solid rgba(92,221,139,.2); }
    .mobile-bottom-nav { position: fixed; top: auto; left: 12px; right: 12px; bottom: 12px; z-index: 300; display: none; align-items: center; justify-content: space-around; gap: 6px; padding: 8px 8px 10px; border-radius: 20px; background: rgba(13,27,42,.92); border: 1px solid rgba(255,255,255,.1); backdrop-filter: blur(24px); -webkit-backdrop-filter: blur(24px); box-shadow: 0 20px 40px rgba(0,0,0,.35), 0 0 1px rgba(255,255,255,.1); }
    .mobile-bottom-item { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; min-height: 52px; border-radius: 14px; color: rgba(255,255,255,.6); text-decoration: none; font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: .06em; }
    .mobile-bottom-item svg { width: 17px; height: 17px; }
    ::-webkit-scrollbar{width:6px;}::-webkit-scrollbar-track{background:transparent;}::-webkit-scrollbar-thumb{background:rgba(255,255,255,.12);border-radius:3px;}
    @media (max-width: 640px) {
      body { padding-bottom: 88px; }
      .mobile-bottom-nav { display: flex !important; }
      nav.sub-nav { padding: 0 16px !important; }
      .nav-crumb { display: none !important; }
    }
  </style>
</head>
<body>
  <nav class="mobile-bottom-nav" aria-label="Mobile navigation">
    <a class="mobile-bottom-item" href="../index.html">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11.5 12 4l9 7.5M5 9.5V20h14V9.5"/></svg>
      Home
    </a>
    <a class="mobile-bottom-item" href="../dashboard.html">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
      Clubs
    </a>
    <a class="mobile-bottom-item" href="../news.html">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16v12H8l-4 4V4z"/></svg>
      News
    </a>
    <a class="mobile-bottom-item" href="../account.html">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
      Me
    </a>
  </nav>

  <nav class="sub-nav" style="position:sticky;top:0;z-index:200;background:rgba(13,27,42,.92);backdrop-filter:blur(16px);border-bottom:1px solid var(--border);height:56px;display:flex;align-items:center;padding:0 32px;gap:16px;">
    <a href="../news.html" style="display:flex;align-items:center;gap:8px;text-decoration:none;flex-shrink:0;">
      <div style="width:28px;height:28px;border-radius:7px;background:#fff;display:flex;align-items:center;justify-content:center;padding:2px;flex-shrink:0;">
        <img src="../logo.png" alt="CT Soccer" style="width:100%;height:100%;object-fit:contain;">
      </div>
      <span style="font-size:.88rem;font-weight:800;color:#fff;">CT Soccer</span>
    </a>
    <svg class="nav-crumb" width="14" height="14" fill="none" stroke="rgba(255,255,255,.25)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg>
    <span class="nav-crumb" style="font-size:.88rem;font-weight:600;color:rgba(255,255,255,.5);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(story.title)}</span>
    <div style="flex:1;"></div>
    <button class="theme-toggle-btn" onclick="toggleTheme()" title="Toggle light/dark theme" style="width:32px;height:32px;border-radius:8px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);color:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:.9rem;flex-shrink:0;"><span class="theme-toggle-icon">&#9728;&#65039;</span></button>
    <a href="../news.html" style="font-size:.82rem;font-weight:700;color:rgba(255,255,255,.5);text-decoration:none;padding:7px 14px;border-radius:8px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);white-space:nowrap;">All News</a>
  </nav>

  <div style="max-width:760px;margin:0 auto;padding:0 24px;">
    <div style="display:flex;align-items:center;gap:10px;padding:20px 0 0;font-size:.78rem;color:rgba(255,255,255,.35);flex-wrap:wrap;">
      <a href="../index.html" style="text-decoration:none;color:inherit;">Home</a>
      <span>/</span>
      <a href="../news.html" style="text-decoration:none;color:inherit;">News</a>
      <span>/</span>
      <span style="color:rgba(255,255,255,.6);">${esc(story.title)}</span>
    </div>

    <!-- HERO -->
    <div style="padding:20px 0 32px;border-bottom:1px solid var(--border);margin-bottom:28px;">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px;flex-wrap:wrap;">
        <span class="badge ${esc(story.badgeClass)}">${esc(story.badge)}</span>
        <span style="font-size:.8rem;color:rgba(255,255,255,.4);">${esc(story.date)}</span>
        ${club ? `<span style="font-size:.8rem;color:var(--accent-lt);font-weight:700;">${esc(club.name)}</span>` : ''}
      </div>
      <h1 style="margin:0 0 14px;font-size:clamp(1.4rem,4vw,2rem);font-weight:800;letter-spacing:-.03em;color:#fff;line-height:1.25;">${esc(story.title)}</h1>
      ${shareButtonsHtml(canonical, story.title)}
    </div>

    <article>
      ${bodyHtml(story)}
    </article>

    ${relatedClubHtml(story)}

    <div style="text-align:center;padding:40px 0 48px;">
      <a href="../news.html" class="btn-primary">&larr; Back to All News</a>
    </div>
  </div>

  <style>
    .ctf-footer-grid { display: grid; grid-template-columns: 2fr 1fr 1fr 1fr; gap: 48px; }
    @media (max-width: 1024px) { .ctf-footer-grid { grid-template-columns: 1fr 1fr; gap: 36px; } }
    @media (max-width: 640px)  { .ctf-footer-grid { grid-template-columns: 1fr; gap: 32px; } }
  </style>
  <footer style="background:rgba(0,0,0,.2);border-top:1px solid rgba(255,255,255,.06);padding:64px 0 32px;">
    <div style="max-width:1180px;margin:0 auto;padding:0 24px;">

      <div class="ctf-footer-grid" style="padding-bottom:48px;border-bottom:1px solid rgba(255,255,255,.06);">

        <div>
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px;">
            <div style="width:34px;height:34px;border-radius:8px;background:#fff;display:flex;align-items:center;justify-content:center;flex-shrink:0;padding:3px;">
              <img src="../logo.png" alt="CT Soccer" style="width:100%;height:100%;object-fit:contain;">
            </div>
            <span style="font-size:1rem;font-weight:800;letter-spacing:-.025em;color:#fff;">CT Soccer</span>
          </div>
          <p style="font-size:.875rem;line-height:1.72;color:rgba(255,255,255,.38);max-width:280px;margin:0 0 22px;">
            Connecticut's premier soccer community - connecting players, coaches, and fans statewide since 2010.
          </p>
          <div style="display:flex;gap:8px;">
            <a href="#" aria-label="Facebook"  style="width:34px;height:34px;border-radius:8px;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.08);display:flex;align-items:center;justify-content:center;transition:background .2s;" onmouseover="this.style.background='rgba(255,255,255,.13)'" onmouseout="this.style.background='rgba(255,255,255,.07)'">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="rgba(255,255,255,.55)"><path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/></svg>
            </a>
            <span title="Instagram — coming soon" aria-label="Instagram (coming soon)" style="width:34px;height:34px;border-radius:8px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.06);display:flex;align-items:center;justify-content:center;opacity:.45;cursor:default;">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,.4)" stroke-width="2"><rect x="2" y="2" width="20" height="20" rx="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8"/><line x1="17.5" y1="6.5" x2="17.51" y2="6.5" stroke-linecap="round"/></svg>
            </span>
            <a href="#" aria-label="X"         style="width:34px;height:34px;border-radius:8px;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.08);display:flex;align-items:center;justify-content:center;transition:background .2s;" onmouseover="this.style.background='rgba(255,255,255,.13)'" onmouseout="this.style.background='rgba(255,255,255,.07)'">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="rgba(255,255,255,.55)"><path d="M23 3a10.9 10.9 0 0 1-3.14 1.53 4.48 4.48 0 0 0-7.86 3v1A10.66 10.66 0 0 1 3 4s-4 9 5 13a11.64 11.64 0 0 1-7 2c9 5 20 0 20-11.5a4.5 4.5 0 0 0-.08-.83A7.72 7.72 0 0 0 23 3z"/></svg>
            </a>
            <a href="https://www.youtube.com/@CTsoccerhub" target="_blank" rel="noopener" aria-label="YouTube" style="width:34px;height:34px;border-radius:8px;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.08);display:flex;align-items:center;justify-content:center;transition:background .2s;" onmouseover="this.style.background='rgba(255,255,255,.13)'" onmouseout="this.style.background='rgba(255,255,255,.07)'">
              <svg width="16" height="16" viewBox="0 0 24 24"><path fill="#FF0000" d="M23.5 6.2a3 3 0 0 0-2.1-2.1C19.5 3.5 12 3.5 12 3.5s-7.5 0-9.4.6A3 3 0 0 0 .5 6.2 31 31 0 0 0 0 12a31 31 0 0 0 .5 5.8 3 3 0 0 0 2.1 2.1c1.9.6 9.4.6 9.4.6s7.5 0 9.4-.6a3 3 0 0 0 2.1-2.1A31 31 0 0 0 24 12a31 31 0 0 0-.5-5.8z"/><path fill="#fff" d="M9.6 15.6V8.4L15.8 12z"/></svg>
            </a>
          </div>
        </div>

        <div>
          <h4 style="font-size:.72rem;font-weight:700;letter-spacing:.07em;text-transform:uppercase;color:rgba(255,255,255,.78);margin:0 0 18px;">Programs</h4>
          <ul style="list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:10px;">
            <li><a href="../dashboard.html?section=clubs&tier=Youth" style="font-size:.875rem;color:rgba(255,255,255,.38);text-decoration:none;transition:color .2s;" onmouseover="this.style.color='rgba(255,255,255,.85)'" onmouseout="this.style.color='rgba(255,255,255,.38)'">Youth Soccer</a></li>
            <li><a href="../dashboard.html?section=standings" style="font-size:.875rem;color:rgba(255,255,255,.38);text-decoration:none;transition:color .2s;" onmouseover="this.style.color='rgba(255,255,255,.85)'" onmouseout="this.style.color='rgba(255,255,255,.38)'">Adult Leagues</a></li>
            <li><a href="../tournaments.html" style="font-size:.875rem;color:rgba(255,255,255,.38);text-decoration:none;transition:color .2s;" onmouseover="this.style.color='rgba(255,255,255,.85)'" onmouseout="this.style.color='rgba(255,255,255,.38)'">Tournaments</a></li>
            <li><a href="../coaching-clinics.html" style="font-size:.875rem;color:rgba(255,255,255,.38);text-decoration:none;transition:color .2s;" onmouseover="this.style.color='rgba(255,255,255,.85)'" onmouseout="this.style.color='rgba(255,255,255,.38)'">Coaching Clinics</a></li>
          </ul>
        </div>

        <div>
          <h4 style="font-size:.72rem;font-weight:700;letter-spacing:.07em;text-transform:uppercase;color:rgba(255,255,255,.78);margin:0 0 18px;">Company</h4>
          <ul style="list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:10px;">
            <li><a href="../about.html" style="font-size:.875rem;color:rgba(255,255,255,.38);text-decoration:none;transition:color .2s;" onmouseover="this.style.color='rgba(255,255,255,.85)'" onmouseout="this.style.color='rgba(255,255,255,.38)'">About Us</a></li>
            <li><a href="../news.html" style="font-size:.875rem;color:rgba(255,255,255,.38);text-decoration:none;transition:color .2s;" onmouseover="this.style.color='rgba(255,255,255,.85)'" onmouseout="this.style.color='rgba(255,255,255,.38)'">News &amp; Events</a></li>
            <li><a href="../whats-new.html" style="font-size:.875rem;color:rgba(255,255,255,.38);text-decoration:none;transition:color .2s;" onmouseover="this.style.color='rgba(255,255,255,.85)'" onmouseout="this.style.color='rgba(255,255,255,.38)'">What's New</a></li>
            <li><a href="../partners.html" style="font-size:.875rem;color:rgba(255,255,255,.38);text-decoration:none;transition:color .2s;" onmouseover="this.style.color='rgba(255,255,255,.85)'" onmouseout="this.style.color='rgba(255,255,255,.38)'">Partners</a></li>
            <li><a href="../suggest.html" style="font-size:.875rem;color:rgba(255,255,255,.38);text-decoration:none;transition:color .2s;" onmouseover="this.style.color='rgba(255,255,255,.85)'" onmouseout="this.style.color='rgba(255,255,255,.38)'">Suggest a Club</a></li>
            <li><a href="../index.html#contact" style="font-size:.875rem;color:rgba(255,255,255,.38);text-decoration:none;transition:color .2s;" onmouseover="this.style.color='rgba(255,255,255,.85)'" onmouseout="this.style.color='rgba(255,255,255,.38)'">Contact</a></li>
          </ul>
        </div>

        <div>
          <h4 style="font-size:.72rem;font-weight:700;letter-spacing:.07em;text-transform:uppercase;color:rgba(255,255,255,.78);margin:0 0 18px;">Contact</h4>
          <ul style="list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:12px;">
            <li style="display:flex;align-items:flex-start;gap:10px;">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,.3)" stroke-width="2" style="margin-top:2px;flex-shrink:0;"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
              <span style="font-size:.875rem;color:rgba(255,255,255,.38);">Connecticut, USA</span>
            </li>
            <li style="display:flex;align-items:flex-start;gap:10px;">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,.3)" stroke-width="2" style="margin-top:2px;flex-shrink:0;"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
              <a href="../index.html#contact" style="font-size:.875rem;color:rgba(255,255,255,.38);text-decoration:none;transition:color .2s;" onmouseover="this.style.color='rgba(255,255,255,.85)'" onmouseout="this.style.color='rgba(255,255,255,.38)'">Contact Form</a>
            </li>
          </ul>
        </div>

      </div>

      <div style="display:flex;justify-content:space-between;align-items:center;padding-top:28px;flex-wrap:wrap;gap:14px;">
        <p style="font-size:.8125rem;color:rgba(255,255,255,.2);margin:0;">© 2026 CT Soccer. All rights reserved.</p>
        <div style="display:flex;gap:22px;">
          <a href="../privacy-policy.html" style="font-size:.8125rem;color:rgba(255,255,255,.2);text-decoration:none;transition:color .2s;" onmouseover="this.style.color='rgba(255,255,255,.5)'" onmouseout="this.style.color='rgba(255,255,255,.2)'">Privacy Policy</a>
          <a href="../terms-of-service.html" style="font-size:.8125rem;color:rgba(255,255,255,.2);text-decoration:none;transition:color .2s;" onmouseover="this.style.color='rgba(255,255,255,.5)'" onmouseout="this.style.color='rgba(255,255,255,.2)'">Terms of Service</a>
        </div>
      </div>
    </div>
  </footer>
</body>
</html>
`;
}

// ---- Sitemap: replace a marked "NEWS PAGES" block, leaving everything else untouched ----
function updateSitemap(ids) {
  const sitemapPath = path.join(__dirname, 'sitemap.xml');
  let xml = fs.readFileSync(sitemapPath, 'utf8');
  const startMarker = '  <!-- NEWS PAGES (auto-generated by generate-news-pages.mjs — do not hand-edit this block) -->';
  const endMarker = '  <!-- END NEWS PAGES -->';

  const block = ids.map(id => `\n  <url>\n    <loc>https://ctsoccerhub.com/news/${id}.html</loc>\n    <changefreq>monthly</changefreq>\n    <priority>0.6</priority>\n  </url>`).join('') + '\n';
  const newSection = `${startMarker}${block}${endMarker}`;

  const startIdx = xml.indexOf(startMarker);
  const endIdx = xml.indexOf(endMarker);
  if (startIdx !== -1 && endIdx !== -1) {
    xml = xml.slice(0, startIdx) + newSection + xml.slice(endIdx + endMarker.length);
  } else {
    xml = xml.replace('</urlset>', `${newSection}\n</urlset>`);
  }
  fs.writeFileSync(sitemapPath, xml, 'utf8');
}

let count = 0;
const ids = [];
for (const story of NEWS_STORIES) {
  const html = pageHtml(story);
  fs.writeFileSync(path.join(OUT_DIR, `${story.id}.html`), html, 'utf8');
  ids.push(story.id);
  count++;
}

console.log(`Generated ${count} news pages in /news/`);
fs.writeFileSync(path.join(__dirname, '.news-page-ids.json'), JSON.stringify(ids, null, 2));
updateSitemap(ids);
console.log('Updated sitemap.xml (NEWS PAGES block)');
