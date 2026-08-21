// Generates clubs-by-town.html — a single, crawlable directory of every
// tracked CT soccer club grouped alphabetically by town, for searches like
// "[town] youth soccer club."
//
// Data source: merges CJSA_DIRECTORY (162 lightweight CJSA member entries,
// clean city fields) with the handful of ALL_CLUBS entries that have no
// CJSA_DIRECTORY row linking to them via edpClubId (pro/semi-pro clubs like
// Hartford Athletic that aren't CJSA youth members, plus a few youth/EDP
// clubs CJSA's list doesn't carry). Ginga FC serves three towns (Woodbridge,
// Hamden & Madison) and is listed once under each.
//
// Each row links to its rich profile at clubs/<id>.html when one exists,
// otherwise to its real external website from CJSA_DIRECTORY.
//
// Also keeps sitemap.xml in sync (single entry, upserted by <loc> match).
//
// Run with: node generate-town-directory.mjs

import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const clubsDataSrc = fs.readFileSync(path.join(__dirname, 'clubs-data.js'), 'utf8');
const cjsaSrc = fs.readFileSync(path.join(__dirname, 'cjsa-directory.js'), 'utf8');
const sandbox = {};
vm.createContext(sandbox);
vm.runInContext(clubsDataSrc, sandbox);
vm.runInContext(cjsaSrc, sandbox);
const { ALL_CLUBS, CJSA_DIRECTORY } = vm.runInContext('({ALL_CLUBS, CJSA_DIRECTORY})', sandbox);

function esc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function slugify(s) {
  return String(s).toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

// ---- Build merged rows: { town, name, richId, website } ----
const edpIds = new Set(CJSA_DIRECTORY.filter(c => c.edpClubId).map(c => c.edpClubId));
const extras = ALL_CLUBS.filter(c => !edpIds.has(c.id));

const rows = [];
for (const c of CJSA_DIRECTORY) {
  rows.push({ town: c.city.trim(), name: c.name, richId: c.edpClubId || null, website: c.website || null });
}
for (const c of extras) {
  const towns = c.id === 'ginga-fc' ? ['Woodbridge', 'Hamden', 'Madison'] : [c.city];
  for (const t of towns) {
    rows.push({ town: t.trim(), name: c.name, richId: c.id, website: c.website || null });
  }
}

const byTown = {};
for (const r of rows) (byTown[r.town] = byTown[r.town] || []).push(r);
for (const t of Object.keys(byTown)) byTown[t].sort((a, b) => a.name.localeCompare(b.name));
const towns = Object.keys(byTown).sort((a, b) => a.localeCompare(b));

const TOTAL_CLUBS = rows.length;
const TOTAL_TOWNS = towns.length;

// ---- Index (jump links) ----
function indexHtml() {
  const chips = towns.map(t => `<a href="#${esc(slugify(t))}" style="font-size:.8rem;font-weight:700;color:rgba(255,255,255,.65);text-decoration:none;padding:7px 14px;border-radius:8px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.08);white-space:nowrap;transition:color .2s,border-color .2s;" onmouseover="this.style.color='#fff';this.style.borderColor='rgba(255,255,255,.22)'" onmouseout="this.style.color='rgba(255,255,255,.65)';this.style.borderColor='rgba(255,255,255,.08)'">${esc(t)}</a>`).join('\n        ');
  return `
    <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:8px;">
        ${chips}
    </div>`;
}

// ---- Per-town sections ----
function rowHtml(r) {
  const href = r.richId ? `clubs/${esc(r.richId)}.html` : esc(r.website);
  const external = !r.richId;
  return `
        <li style="display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 18px;background:var(--navy-800);border:1px solid var(--border);border-radius:12px;transition:border-color .2s,background .2s;" onmouseover="this.style.borderColor='rgba(255,255,255,.18)';this.style.background='#182740'" onmouseout="this.style.borderColor='var(--border)';this.style.background='var(--navy-800)'">
          <a href="${href}"${external ? ' target="_blank" rel="noopener"' : ''} style="font-size:.92rem;font-weight:700;color:#fff;text-decoration:none;transition:color .2s;" onmouseover="this.style.color='var(--accent-lt)'" onmouseout="this.style.color='#fff'">${esc(r.name)}</a>
          ${r.richId ? `<span style="font-size:.68rem;font-weight:800;letter-spacing:.05em;text-transform:uppercase;color:var(--accent-lt);background:rgba(43,124,233,.12);border:1px solid rgba(43,124,233,.22);padding:3px 8px;border-radius:5px;flex-shrink:0;">Full Profile</span>` : `<svg width="13" height="13" fill="none" stroke="rgba(255,255,255,.3)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24" style="flex-shrink:0;"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>`}
        </li>`;
}

function townSectionHtml(town) {
  const clubs = byTown[town];
  return `
    <section id="${esc(slugify(town))}" style="scroll-margin-top:80px;margin-bottom:32px;">
      <h2 style="font-size:1.05rem;font-weight:800;color:#fff;margin:0 0 12px;display:flex;align-items:baseline;gap:8px;">${esc(town)} <span style="font-size:.78rem;font-weight:600;color:rgba(255,255,255,.35);">${clubs.length} club${clubs.length === 1 ? '' : 's'}</span></h2>
      <ul style="list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:8px;">${clubs.map(rowHtml).join('')}
      </ul>
    </section>`;
}

function collectionJsonLd(canonical) {
  const data = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: 'CT Soccer Clubs by Town',
    description: `Directory of ${TOTAL_CLUBS} youth, adult, and professional soccer clubs across ${TOTAL_TOWNS} Connecticut towns.`,
    url: canonical,
    isPartOf: { '@type': 'WebSite', name: 'CT Soccer', url: 'https://ctsoccerhub.com/' },
  };
  return `<script type="application/ld+json">${JSON.stringify(data)}</script>`;
}

function pageHtml() {
  const title = 'CT Soccer Clubs by Town | Find a Club Near You in Connecticut';
  const description = `Browse ${TOTAL_CLUBS} Connecticut soccer clubs grouped by town — youth, adult, and pro/semi-pro. Find the club nearest you across ${TOTAL_TOWNS} CT towns.`;
  const canonical = 'https://ctsoccerhub.com/clubs-by-town.html';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <script defer src="/_vercel/insights/script.js"></script>
  <script defer src="/_vercel/speed-insights/script.js"></script>
  <meta charset="UTF-8">
  <script src="theme.js"></script>
  <script src="cookie-consent.js"></script>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(description)}">
  <link rel="canonical" href="${canonical}">
  <meta property="og:type" content="website">
  <meta property="og:title" content="${esc(title)}">
  <meta property="og:description" content="${esc(description)}">
  <meta property="og:url" content="${canonical}">
  <meta name="twitter:card" content="summary">
  ${collectionJsonLd(canonical)}
  <script src="https://cdn.tailwindcss.com"></script>
  <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <style>
    :root { --navy:#0D1B2A; --navy-800:#162236; --accent:#2B7CE9; --accent-lt:#5BA3FF; --border:rgba(255,255,255,.07); --muted:rgba(255,255,255,.42); }
    html[data-theme="light"] { filter: invert(1) hue-rotate(180deg); }
    html[data-theme="light"] img, html[data-theme="light"] video, html[data-theme="light"] canvas, html[data-theme="light"] iframe { filter: invert(1) hue-rotate(180deg); }
    *,*::before,*::after{box-sizing:border-box;-webkit-font-smoothing:antialiased;}
    html,body{margin:0;padding:0;background:var(--navy);color:#fff;font-family:'Montserrat',Arial,sans-serif;}
    a { color: inherit; }
    .btn-primary{display:inline-flex;align-items:center;gap:7px;background:linear-gradient(135deg,#2B7CE9 0%,#1a5cb8 100%);color:#fff;font-weight:700;font-size:.85rem;padding:9px 18px;border-radius:9px;text-decoration:none;border:none;cursor:pointer;font-family:'Montserrat',Arial,sans-serif;transition:opacity .18s,transform .18s;box-shadow:0 4px 14px rgba(43,124,233,.35);}
    .btn-primary:hover{opacity:.88;transform:translateY(-1px);}
    .mobile-bottom-nav { position: fixed; top: auto; left: 12px; right: 12px; bottom: 12px; z-index: 300; display: none; align-items: center; justify-content: space-around; gap: 6px; padding: 8px 8px 10px; border-radius: 20px; background: rgba(13,27,42,.92); border: 1px solid rgba(255,255,255,.1); backdrop-filter: blur(24px); -webkit-backdrop-filter: blur(24px); box-shadow: 0 20px 40px rgba(0,0,0,.35), 0 0 1px rgba(255,255,255,.1); }
    .mobile-bottom-item { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; min-height: 52px; border-radius: 14px; color: rgba(255,255,255,.6); text-decoration: none; font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: .06em; }
    .mobile-bottom-item svg { width: 17px; height: 17px; }
    a:focus-visible, button:focus-visible { outline: 2px solid var(--accent-lt); outline-offset: 2px; border-radius: 4px; }
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
    <a class="mobile-bottom-item" href="index.html">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11.5 12 4l9 7.5M5 9.5V20h14V9.5"/></svg>
      Home
    </a>
    <a class="mobile-bottom-item" href="dashboard.html">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
      Clubs
    </a>
    <a class="mobile-bottom-item" href="news.html">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16v12H8l-4 4V4z"/></svg>
      News
    </a>
    <a class="mobile-bottom-item" href="account.html">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
      Me
    </a>
  </nav>

  <nav class="sub-nav" style="position:sticky;top:0;z-index:200;background:rgba(13,27,42,.92);backdrop-filter:blur(16px);border-bottom:1px solid var(--border);height:56px;display:flex;align-items:center;padding:0 32px;gap:16px;">
    <a href="index.html" style="display:flex;align-items:center;gap:8px;text-decoration:none;flex-shrink:0;">
      <div style="width:28px;height:28px;border-radius:7px;background:#fff;display:flex;align-items:center;justify-content:center;padding:2px;flex-shrink:0;">
        <img src="logo.png" alt="CT Soccer" style="width:100%;height:100%;object-fit:contain;">
      </div>
      <span style="font-size:.88rem;font-weight:800;color:#fff;">CT Soccer</span>
    </a>
    <svg class="nav-crumb" width="14" height="14" fill="none" stroke="rgba(255,255,255,.25)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg>
    <span class="nav-crumb" style="font-size:.88rem;font-weight:600;color:rgba(255,255,255,.5);">Clubs by Town</span>
    <div style="flex:1;"></div>
    <button class="theme-toggle-btn" onclick="toggleTheme()" title="Toggle light/dark theme" style="width:32px;height:32px;border-radius:8px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);color:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:.9rem;flex-shrink:0;"><span class="theme-toggle-icon">&#9728;&#65039;</span></button>
    <a href="dashboard.html" style="font-size:.82rem;font-weight:700;color:rgba(255,255,255,.5);text-decoration:none;padding:7px 14px;border-radius:8px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);white-space:nowrap;">Dashboard</a>
  </nav>

  <div style="max-width:900px;margin:0 auto;padding:0 24px;">
    <div style="display:flex;align-items:center;gap:10px;padding:20px 0 0;font-size:.78rem;color:rgba(255,255,255,.35);flex-wrap:wrap;">
      <a href="index.html" style="text-decoration:none;color:inherit;">Home</a>
      <span>/</span>
      <span style="color:rgba(255,255,255,.6);">Clubs by Town</span>
    </div>

    <!-- HERO -->
    <div style="padding:20px 0 28px;border-bottom:1px solid var(--border);margin-bottom:28px;">
      <h1 style="margin:0 0 10px;font-size:clamp(1.5rem,4vw,2.1rem);font-weight:800;letter-spacing:-.03em;color:#fff;line-height:1.2;">Connecticut Soccer Clubs by Town</h1>
      <p style="margin:0;font-size:.92rem;line-height:1.7;color:rgba(255,255,255,.55);max-width:640px;">Every tracked youth, adult, and professional club in the state, grouped by the town it's based in — ${TOTAL_CLUBS} clubs across ${TOTAL_TOWNS} towns. Jump to a town below, or find your own club on the <a href="dashboard.html" style="color:var(--accent-lt);">Full Directory</a>.</p>
    </div>

    <!-- JUMP LINKS -->
    ${indexHtml()}

    <!-- TOWN SECTIONS -->
    <div style="margin-top:28px;">
      ${towns.map(townSectionHtml).join('')}
    </div>

    <div style="text-align:center;padding:16px 0 48px;">
      <a href="dashboard.html" class="btn-primary">Browse the Full Directory &rarr;</a>
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
              <img src="logo.png" alt="CT Soccer" style="width:100%;height:100%;object-fit:contain;">
            </div>
            <span style="font-size:1rem;font-weight:800;letter-spacing:-.025em;color:#fff;">CT Soccer</span>
          </div>
          <p style="font-size:.875rem;line-height:1.72;color:rgba(255,255,255,.38);max-width:280px;margin:0 0 22px;">
            Connecticut's premier soccer community - connecting players, coaches, and fans statewide since 2026.
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
            <li><a href="dashboard.html?section=clubs&tier=Youth" style="font-size:.875rem;color:rgba(255,255,255,.38);text-decoration:none;transition:color .2s;" onmouseover="this.style.color='rgba(255,255,255,.85)'" onmouseout="this.style.color='rgba(255,255,255,.38)'">Youth Soccer</a></li>
            <li><a href="dashboard.html?section=standings" style="font-size:.875rem;color:rgba(255,255,255,.38);text-decoration:none;transition:color .2s;" onmouseover="this.style.color='rgba(255,255,255,.85)'" onmouseout="this.style.color='rgba(255,255,255,.38)'">Adult Leagues</a></li>
            <li><a href="tournaments.html" style="font-size:.875rem;color:rgba(255,255,255,.38);text-decoration:none;transition:color .2s;" onmouseover="this.style.color='rgba(255,255,255,.85)'" onmouseout="this.style.color='rgba(255,255,255,.38)'">Tournaments</a></li>
            <li><a href="coaching-clinics.html" style="font-size:.875rem;color:rgba(255,255,255,.38);text-decoration:none;transition:color .2s;" onmouseover="this.style.color='rgba(255,255,255,.85)'" onmouseout="this.style.color='rgba(255,255,255,.38)'">Coaching Clinics</a></li>
            <li><a href="clubs-by-town.html" style="font-size:.875rem;color:rgba(255,255,255,.85);text-decoration:none;">Clubs by Town</a></li>
            <li><a href="compare.html" style="font-size:.875rem;color:rgba(255,255,255,.38);text-decoration:none;transition:color .2s;" onmouseover="this.style.color='rgba(255,255,255,.85)'" onmouseout="this.style.color='rgba(255,255,255,.38)'">Compare Clubs</a></li>
          </ul>
        </div>

        <div>
          <h4 style="font-size:.72rem;font-weight:700;letter-spacing:.07em;text-transform:uppercase;color:rgba(255,255,255,.78);margin:0 0 18px;">Company</h4>
          <ul style="list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:10px;">
            <li><a href="about.html" style="font-size:.875rem;color:rgba(255,255,255,.38);text-decoration:none;transition:color .2s;" onmouseover="this.style.color='rgba(255,255,255,.85)'" onmouseout="this.style.color='rgba(255,255,255,.38)'">About Us</a></li>
            <li><a href="news.html" style="font-size:.875rem;color:rgba(255,255,255,.38);text-decoration:none;transition:color .2s;" onmouseover="this.style.color='rgba(255,255,255,.85)'" onmouseout="this.style.color='rgba(255,255,255,.38)'">News &amp; Events</a></li>
            <li><a href="whats-new.html" style="font-size:.875rem;color:rgba(255,255,255,.38);text-decoration:none;transition:color .2s;" onmouseover="this.style.color='rgba(255,255,255,.85)'" onmouseout="this.style.color='rgba(255,255,255,.38)'">What's New</a></li>
            <li><a href="partners.html" style="font-size:.875rem;color:rgba(255,255,255,.38);text-decoration:none;transition:color .2s;" onmouseover="this.style.color='rgba(255,255,255,.85)'" onmouseout="this.style.color='rgba(255,255,255,.38)'">Partners</a></li>
            <li><a href="suggest.html" style="font-size:.875rem;color:rgba(255,255,255,.38);text-decoration:none;transition:color .2s;" onmouseover="this.style.color='rgba(255,255,255,.85)'" onmouseout="this.style.color='rgba(255,255,255,.38)'">Suggest a Club</a></li>
            <li><a href="index.html#contact" style="font-size:.875rem;color:rgba(255,255,255,.38);text-decoration:none;transition:color .2s;" onmouseover="this.style.color='rgba(255,255,255,.85)'" onmouseout="this.style.color='rgba(255,255,255,.38)'">Contact</a></li>
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
              <a href="index.html#contact" style="font-size:.875rem;color:rgba(255,255,255,.38);text-decoration:none;transition:color .2s;" onmouseover="this.style.color='rgba(255,255,255,.85)'" onmouseout="this.style.color='rgba(255,255,255,.38)'">Contact Form</a>
            </li>
          </ul>
        </div>

      </div>

      <div style="display:flex;justify-content:space-between;align-items:center;padding-top:28px;flex-wrap:wrap;gap:14px;">
        <p style="font-size:.8125rem;color:rgba(255,255,255,.2);margin:0;">© 2026 CT Soccer. All rights reserved.</p>
        <div style="display:flex;gap:22px;">
          <a href="privacy-policy.html" style="font-size:.8125rem;color:rgba(255,255,255,.2);text-decoration:none;transition:color .2s;" onmouseover="this.style.color='rgba(255,255,255,.5)'" onmouseout="this.style.color='rgba(255,255,255,.2)'">Privacy Policy</a>
          <a href="terms-of-service.html" style="font-size:.8125rem;color:rgba(255,255,255,.2);text-decoration:none;transition:color .2s;" onmouseover="this.style.color='rgba(255,255,255,.5)'" onmouseout="this.style.color='rgba(255,255,255,.2)'">Terms of Service</a>
        </div>
      </div>
    </div>
  </footer>
</body>
</html>
`;
}

// ---- Sitemap: upsert this single URL, keeping everything else untouched ----
function updateSitemap() {
  const sitemapPath = path.join(__dirname, 'sitemap.xml');
  let xml = fs.readFileSync(sitemapPath, 'utf8');
  const loc = 'https://ctsoccerhub.com/clubs-by-town.html';
  if (xml.includes(`<loc>${loc}</loc>`)) return false;
  const entry = `\n  <url>\n    <loc>${loc}</loc>\n    <changefreq>weekly</changefreq>\n    <priority>0.7</priority>\n  </url>\n`;
  xml = xml.replace('</urlset>', `${entry}</urlset>`);
  fs.writeFileSync(sitemapPath, xml, 'utf8');
  return true;
}

fs.writeFileSync(path.join(__dirname, 'clubs-by-town.html'), pageHtml(), 'utf8');
console.log(`Generated clubs-by-town.html — ${TOTAL_CLUBS} clubs across ${TOTAL_TOWNS} towns`);
const added = updateSitemap();
console.log(added ? 'Added clubs-by-town.html to sitemap.xml' : 'clubs-by-town.html already in sitemap.xml — left untouched');
