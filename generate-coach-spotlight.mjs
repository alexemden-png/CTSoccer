// Builds a "Coach Spotlight" story for one coach, keyed by the club they
// currently lead. Reuses generate-spotlight.mjs's shared infrastructure
// (news-data.js upsert, chaining into generate-news-pages.mjs and
// generate-rss-feed.mjs, the same badge-spotlight styling and Related Club
// card) but with person-centered content instead of club-centered — the
// two content shapes are different enough (a person's credential/role vs.
// a club's founding/tryouts/standings) that reusing generate-spotlight.mjs
// directly would either leave sections empty or invite padding with
// invented detail, which we're avoiding.
//
// This dataset has no separate "coaches" collection — a coach's real
// credential (if one exists) is a sentence already sitting in the club's
// own `about` text. COACH_PROFILES below is a deliberate, hand-reviewed
// bridge: a new entry only gets added once someone has actually confirmed
// the about/coach fields contain a real, specific, individually-verifiable
// credential — not just a name and a generic title. Nothing here is
// auto-extracted from prose, on purpose.
//
// Run with: node generate-coach-spotlight.mjs <club-id>
//   e.g.    node generate-coach-spotlight.mjs ct-united-fc

import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const clubId = process.argv[2];
if (!clubId) {
  console.error('Usage: node generate-coach-spotlight.mjs <club-id>');
  console.error('Example: node generate-coach-spotlight.mjs ct-united-fc');
  process.exit(1);
}

const clubsDataSrc = fs.readFileSync(path.join(__dirname, 'clubs-data.js'), 'utf8');
const sandbox = {};
vm.createContext(sandbox);
vm.runInContext(clubsDataSrc, sandbox);
const { ALL_CLUBS, LEAGUE_STANDINGS, standingsRowPts } = vm.runInContext('({ALL_CLUBS, LEAGUE_STANDINGS, standingsRowPts})', sandbox);

const club = ALL_CLUBS.find((c) => c.id === clubId);
if (!club) {
  console.error(`No club found with id "${clubId}" in ALL_CLUBS.`);
  process.exit(1);
}

// introRole: a complete phrase for "{name} is {credential} — {introRole}."
//   Written per-person on purpose rather than assuming everyone's title is
//   "head coach" — Arteaga is a founder, not a sideline coach today, and
//   forcing that phrasing on him would be a real accuracy error, not a
//   style choice.
// roleSentence: a complete sentence describing what they actually do,
//   for the "Role at the Club" section.
const COACH_PROFILES = {
  'ct-united-fc': {
    slug: 'shavar-thomas',
    name: 'Shavar Thomas',
    credential: 'a former Jamaican national team captain',
    introRole: 'now head coach of CT United FC',
    roleSentence: 'As head coach, Thomas leads the club’s first-team roster and its MLS Next academy program.',
  },
  'ja-elite': {
    slug: 'jhonny-arteaga',
    name: 'Jhonny Arteaga',
    credential: 'a Stamford native and former professional player (New York Red Bulls)',
    introRole: 'the founder of JA Elite',
    roleSentence: 'Arteaga founded JA Elite and leads it today alongside Director of Coaching Paul Melitsanopoulos and Technical Director Colin Hodge.',
  },
  'ginga-fc': {
    slug: 'rodrigo-silva',
    name: 'Rodrigo Silva',
    credential: 'a Pro License coach and former professional player',
    introRole: "Ginga FC's Director of Coaching",
    roleSentence: 'Silva leads Ginga FC’s technical program across its Woodbridge academy, a Hamden branch, and a Madison-based Girls Coastal program.',
  },
  'new-haven-united-fc': {
    slug: 'kledis-capollari',
    name: 'Kledis Capollari',
    credential: 'a former Hartford Athletic assistant and youth development lead',
    introRole: "New Haven United FC's head coach",
    roleSentence: 'Capollari leads a New Haven United first team that won the NPSL North Atlantic Conference outright this season before falling to eventual national runner-up Bristol Rhythm AFC in the club’s first-ever National Semifinal appearance.',
  },
};

const profile = COACH_PROFILES[clubId];
if (!profile) {
  console.error(`No coach profile defined for "${clubId}" yet in COACH_PROFILES.`);
  console.error('Add one only once you’ve confirmed the club’s about/coach fields actually contain a real, specific, individually-verifiable credential — not just a name and a title.');
  process.exit(1);
}

function esc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function formatSyncDate(iso) {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

const ordinal = (n) => { const s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); };

function positionInfo(id) {
  const table = LEAGUE_STANDINGS[id];
  if (!table) return null;
  const sorted = [...table.rows].sort((a, b) => standingsRowPts(b, table.type) - standingsRowPts(a, table.type));
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

// "The Program He Leads": real season stats for pro/semi-pro clubs (a
// LEAGUE_STANDINGS entry exists), or founding/age-group facts for youth
// clubs — same fallback shape as generate-spotlight.mjs's statsHtml(), and
// deliberately the same "W-D-L" record label it already uses even for
// shootout-scored leagues like MLS Next Pro, so this page and the club's
// own spotlight page don't disagree with each other over the same club.
function programStatsHtml() {
  const info = positionInfo(club.id);
  if (info) {
    const gd = club.gf - club.ga;
    return [
      statCard(`${club.wins}-${club.draws}-${club.losses}`, 'Record (W-D-L)'),
      statCard(`${ordinal(info.rank)} of ${info.total}`, club.league),
      statCard(`${gd > 0 ? '+' : ''}${gd}`, 'Goal Differential'),
    ].join('');
  }
  const yearsRunning = new Date().getFullYear() - club.founded;
  const ageRange = club.ageGroups && club.ageGroups.length
    ? `${club.ageGroups[0]}–${club.ageGroups[club.ageGroups.length - 1]}`
    : '—';
  return [
    statCard(`${yearsRunning} yrs`, 'Program Running Since ' + club.founded),
    statCard(ageRange, 'Age Groups'),
    statCard(club.city, 'Home Base'),
  ].join('');
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
    `<p style="font-size:.95rem;line-height:1.8;color:rgba(255,255,255,.75);margin:0 0 16px;">${esc(profile.name)} is ${esc(profile.credential)} — ${esc(profile.introRole)}.</p>`,
    `<p style="font-size:.9rem;line-height:1.75;color:rgba(255,255,255,.6);margin:0 0 20px;">${esc(club.description)}</p>`,
    `<h2 style="font-size:1.05rem;font-weight:800;color:#fff;margin:0 0 14px;">Role at the Club</h2>`,
    `<p style="font-size:.9rem;line-height:1.75;color:rgba(255,255,255,.65);margin:0;">${esc(profile.roleSentence)}</p>`,
    `<h2 style="font-size:1.05rem;font-weight:800;color:#fff;margin:24px 0 14px;">The Program They Lead</h2>`,
    `<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;">${programStatsHtml()}</div>`,
    club.lastSynced ? `<p style="font-size:.76rem;color:rgba(255,255,255,.32);margin:10px 0 0;">Data synced ${formatSyncDate(club.lastSynced)}</p>` : '',
    quoteHtml(existingStory),
    club.website ? `
      <h2 style="font-size:1.05rem;font-weight:800;color:#fff;margin:24px 0 14px;">How to Follow</h2>
      <div style="background:var(--navy-800);border:1px solid var(--border);border-radius:14px;padding:18px 20px;">
        <a href="https://${esc(club.website.replace(/^https?:\/\//, ''))}" target="_blank" rel="noopener" style="font-size:.88rem;color:var(--accent-lt);text-decoration:none;display:block;margin-bottom:6px;">Official site &rarr;</a>
        <p style="font-size:.85rem;color:rgba(255,255,255,.5);margin:0;">Full schedule, roster, and live results below.</p>
      </div>` : '',
  ].filter(Boolean);
}

const id = `coach-spotlight-${profile.slug}`;
const today = new Date();
const title = `Coach Spotlight: ${profile.name}`;
const summary = `${profile.name} is ${profile.credential} — ${profile.introRole}.`;

// ---- Upsert into news-data.js, same pattern as generate-spotlight.mjs ----
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
  badge: 'Coach Spotlight', badgeClass: 'badge-spotlight',
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

console.log(existing ? `Updated existing coach spotlight "${id}" in news-data.js` : `Added new coach spotlight "${id}" to news-data.js`);
if (existing && existing.quote) console.log('Kept the quote you already added for this coach.');
else console.log(`Tip: to add a real quote from ${profile.name}, open news-data.js, find "${id}", add quote/quoteAttribution fields, then re-run generate-news-pages.mjs alone to pick it up.`);

// ---- Chain the two generators so the spotlight is immediately live. ----
execFileSync(process.execPath, ['generate-news-pages.mjs'], { cwd: __dirname, stdio: 'inherit' });
execFileSync(process.execPath, ['generate-rss-feed.mjs'], { cwd: __dirname, stdio: 'inherit' });
