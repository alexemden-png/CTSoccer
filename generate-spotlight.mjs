// Builds a "Club Spotlight" story for one club, assembled entirely from
// data already in clubs-data.js (description/about/founded/ageGroups/
// tournaments/tryouts info, plus LEAGUE_STANDINGS for pro/semi-pro clubs).
// Upserts it into news-data.js under a stable id (spotlight-<club-id>, not
// date-based — a club only has one active spotlight, and re-running just
// refreshes it with current data), then chains generate-news-pages.mjs and
// generate-rss-feed.mjs so it's immediately live as a real news/*.html page
// with its own "Related Club" card linking back to the club's full profile.
//
// Run with: node generate-spotlight.mjs <club-id>
//   e.g.    node generate-spotlight.mjs hartford-athletic
//
// Optional real quote: this script never invents one. If you have an actual
// quote from the club, open news-data.js after running this, find the
// "spotlight-<club-id>" entry, and add:
//   quote: "...", quoteAttribution: "Name, Title"
// then re-run `node generate-news-pages.mjs` alone to render it into an
// "In Their Own Words" section — re-running generate-spotlight.mjs for the
// same club later preserves whatever quote you've already added, exactly
// like generate-recap.mjs preserves hand-written commentary.

import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const clubId = process.argv[2];
if (!clubId) {
  console.error('Usage: node generate-spotlight.mjs <club-id>');
  console.error('Example: node generate-spotlight.mjs hartford-athletic');
  process.exit(1);
}

const clubsDataSrc = fs.readFileSync(path.join(__dirname, 'clubs-data.js'), 'utf8');
const sandbox = {};
vm.createContext(sandbox);
vm.runInContext(clubsDataSrc, sandbox);
const { ALL_CLUBS, LEAGUE_STANDINGS } = vm.runInContext('({ALL_CLUBS, LEAGUE_STANDINGS})', sandbox);

const club = ALL_CLUBS.find((c) => c.id === clubId);
if (!club) {
  console.error(`No club found with id "${clubId}" in ALL_CLUBS.`);
  process.exit(1);
}

function esc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Plain date only, same reasoning as generate-club-pages.mjs's version — a
// static page can't keep a relative "X days ago" accurate between rebuilds.
function formatSyncDate(iso) {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

const ordinal = (n) => { const s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); };

function standingsPts(row) { return row.w * 3 + (row.d || 0); }

function positionInfo(id) {
  const table = LEAGUE_STANDINGS[id];
  if (!table) return null;
  const sorted = [...table.rows].sort((a, b) => standingsPts(b) - standingsPts(a));
  const idx = sorted.findIndex((r) => r.abbr === table.selfAbbr);
  if (idx === -1) return null;
  return { rank: idx + 1, total: sorted.length };
}

function statCard(value, label) {
  return `
        <div style="background:var(--navy-800);border:1px solid var(--border);border-radius:14px;padding:18px;text-align:center;">
          <div style="font-size:1.3rem;font-weight:800;color:#fff;margin-bottom:4px;">${esc(value)}</div>
          <div style="font-size:.7rem;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:rgba(255,255,255,.4);">${esc(label)}</div>
        </div>`;
}

// ---- "By the Numbers": real record/standing for pro & semi-pro clubs
// (have a LEAGUE_STANDINGS entry), or founding/program-breadth facts for
// youth clubs (no match-level standings tracked at that level). ----
function statsHtml() {
  const info = positionInfo(club.id);
  if (info) {
    const gd = club.gf - club.ga;
    const cards = [
      statCard(`${club.wins}-${club.draws}-${club.losses}`, 'Record (W-D-L)'),
      statCard(`${ordinal(info.rank)} of ${info.total}`, club.league),
      statCard(`${gd > 0 ? '+' : ''}${gd}`, 'Goal Differential'),
    ];
    return cards.join('');
  }
  const yearsRunning = new Date().getFullYear() - club.founded;
  const ageRange = club.ageGroups && club.ageGroups.length
    ? `${club.ageGroups[0]}–${club.ageGroups[club.ageGroups.length - 1]}`
    : '—';
  const cards = [
    statCard(`${yearsRunning} yrs`, 'Running Since ' + club.founded),
    statCard(ageRange, 'Age Groups'),
    statCard(club.city, 'Home Base'),
  ];
  return cards.join('');
}

// ---- "How to Get Involved" (youth clubs: tryouts/contact info) or
// "How to Follow" (pro/semi-pro clubs: official site, points to the related
// club card below for schedule/roster/live results). Only real fields
// render — nothing here is invented. ----
function involvementHtml() {
  const isYouth = !positionInfo(club.id);
  const rows = [];
  if (isYouth) {
    if (club.tryoutsNote) rows.push(`<p style="font-size:.88rem;line-height:1.7;color:rgba(255,255,255,.65);margin:0 0 10px;">${esc(club.tryoutsNote)}</p>`);
    if (club.tryoutsUrl) rows.push(`<a href="${esc(club.tryoutsUrl)}" target="_blank" rel="noopener" style="font-size:.88rem;color:var(--accent-lt);text-decoration:none;display:block;margin-bottom:6px;">Tryout info &rarr;</a>`);
    if (club.contactEmail) rows.push(`<p style="font-size:.85rem;color:rgba(255,255,255,.5);margin:0;">Contact: ${esc(club.contactEmail)}</p>`);
    if (!rows.length && club.website) rows.push(`<a href="https://${esc(club.website.replace(/^https?:\/\//, ''))}" target="_blank" rel="noopener" style="font-size:.88rem;color:var(--accent-lt);text-decoration:none;">Visit ${esc(club.name)}'s website &rarr;</a>`);
  } else {
    if (club.website) rows.push(`<a href="https://${esc(club.website.replace(/^https?:\/\//, ''))}" target="_blank" rel="noopener" style="font-size:.88rem;color:var(--accent-lt);text-decoration:none;display:block;margin-bottom:6px;">Official site &rarr;</a>`);
    rows.push(`<p style="font-size:.85rem;color:rgba(255,255,255,.5);margin:0;">Full schedule, roster, and live results below.</p>`);
  }
  if (!rows.length) return '';
  return `
      <h2 style="font-size:1.05rem;font-weight:800;color:#fff;margin:24px 0 14px;">${isYouth ? 'How to Get Involved' : 'How to Follow'}</h2>
      <div style="background:var(--navy-800);border:1px solid var(--border);border-radius:14px;padding:18px 20px;">
        ${rows.join('\n        ')}
      </div>`;
}

function quoteHtml(story) {
  if (!story || !story.quote) return '';
  return `
      <blockquote style="margin:24px 0 0;padding:18px 22px;background:rgba(43,124,233,.08);border-left:3px solid var(--accent);border-radius:0 12px 12px 0;">
        <p style="font-size:.95rem;line-height:1.7;color:rgba(255,255,255,.85);font-style:italic;margin:0 0 8px;">&ldquo;${esc(story.quote)}&rdquo;</p>
        ${story.quoteAttribution ? `<p style="font-size:.8rem;color:rgba(255,255,255,.45);margin:0;">&mdash; ${esc(story.quoteAttribution)}</p>` : ''}
      </blockquote>`;
}

function buildBody(existingStory) {
  return [
    `<p style="font-size:.95rem;line-height:1.8;color:rgba(255,255,255,.75);margin:0 0 20px;">${esc(club.description)}</p>`,
    `<h2 style="font-size:1.05rem;font-weight:800;color:#fff;margin:0 0 14px;">History &amp; Leadership</h2>`,
    `<p style="font-size:.9rem;line-height:1.75;color:rgba(255,255,255,.65);margin:0 0 8px;">${esc(club.about)}</p>`,
    club.coach ? `<p style="font-size:.85rem;color:rgba(255,255,255,.45);margin:0;">Head of program: ${esc(club.coach)}</p>` : '',
    `<h2 style="font-size:1.05rem;font-weight:800;color:#fff;margin:24px 0 14px;">By the Numbers</h2>`,
    `<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;">${statsHtml()}</div>`,
    club.lastSynced ? `<p style="font-size:.76rem;color:rgba(255,255,255,.32);margin:10px 0 0;">Data synced ${formatSyncDate(club.lastSynced)}</p>` : '',
    quoteHtml(existingStory),
    involvementHtml(),
  ].filter(Boolean);
}

const id = `spotlight-${club.id}`;
const today = new Date();
const title = `Club Spotlight: ${club.name}`;
const summary = `A closer look at ${club.name} — history, leadership, and what makes the club stand out.`;

// ---- Upsert into news-data.js (same pattern as generate-recap.mjs): find
// any existing spotlight for this club, keep its hand-written quote if one
// exists, replace everything else with freshly computed content. ----
const newsDataPath = path.join(__dirname, 'news-data.js');
const newsDataSrc = fs.readFileSync(newsDataPath, 'utf8');
const newsSandbox = {};
vm.createContext(newsSandbox);
vm.runInContext(newsDataSrc, newsSandbox);
const { NEWS_STORIES } = vm.runInContext('({NEWS_STORIES})', newsSandbox);

const existing = NEWS_STORIES.find((s) => s.id === id);

const spotlightStory = {
  id,
  category: 'spotlight',
  badge: 'Club Spotlight', badgeClass: 'badge-spotlight',
  date: today.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
  clubId: club.id,
  title,
  summary,
  ...(existing && existing.quote ? { quote: existing.quote, quoteAttribution: existing.quoteAttribution } : {}),
  body: buildBody(existing),
};

const withoutThisSpotlight = NEWS_STORIES.filter((s) => s.id !== id);
const updatedStories = [spotlightStory, ...withoutThisSpotlight];

function serializeStory(s) {
  const lines = [];
  lines.push(`  {`);
  lines.push(`    id: ${JSON.stringify(s.id)},`);
  lines.push(`    category: ${JSON.stringify(s.category)},`);
  lines.push(`    badge: ${JSON.stringify(s.badge)}, badgeClass: ${JSON.stringify(s.badgeClass)},`);
  lines.push(`    date: ${JSON.stringify(s.date)},`);
  lines.push(`    clubId: ${s.clubId ? JSON.stringify(s.clubId) : 'null'},`);
  lines.push(`    title: ${JSON.stringify(s.title)},`);
  lines.push(`    summary: ${JSON.stringify(s.summary)},`);
  if (s.commentary !== undefined) lines.push(`    commentary: ${JSON.stringify(s.commentary)},`);
  if (s.quote !== undefined) lines.push(`    quote: ${JSON.stringify(s.quote)},`);
  if (s.quoteAttribution !== undefined) lines.push(`    quoteAttribution: ${JSON.stringify(s.quoteAttribution)},`);
  if (s.body) lines.push(`    body: [\n${s.body.map((b) => `      ${JSON.stringify(b)},`).join('\n')}\n    ],`);
  lines.push(`  },`);
  return lines.join('\n');
}

const header = newsDataSrc.slice(0, newsDataSrc.indexOf('const NEWS_STORIES'));
const newSrc = `${header}const NEWS_STORIES = [\n${updatedStories.map(serializeStory).join('\n')}\n];\n`;
fs.writeFileSync(newsDataPath, newSrc, 'utf8');

console.log(existing ? `Updated existing spotlight "${id}" in news-data.js` : `Added new spotlight "${id}" to news-data.js`);
if (existing && existing.quote) console.log('Kept the quote you already added for this club.');
else console.log(`Tip: to add a real quote from ${club.name}, open news-data.js, find "${id}", add quote/quoteAttribution fields, then re-run generate-news-pages.mjs alone to pick it up.`);

// ---- Chain the two generators so the spotlight is immediately live. ----
execFileSync(process.execPath, ['generate-news-pages.mjs'], { cwd: __dirname, stdio: 'inherit' });
execFileSync(process.execPath, ['generate-rss-feed.mjs'], { cwd: __dirname, stdio: 'inherit' });
